import { showRetryToast, showErrorNotification } from './toast.js';

async function prepareRequestData(args) {
  let bodyContent = null;
  let baseUrl;
  let baseInit = {};

  if (args[0] instanceof Request) {
    const originalRequest = args[0];
    baseUrl = originalRequest.url;
    baseInit = {
      method: originalRequest.method,
      headers: originalRequest.headers,
      mode: originalRequest.mode,
      credentials: originalRequest.credentials,
      cache: originalRequest.cache,
      redirect: originalRequest.redirect,
      referrer: originalRequest.referrer,
      referrerPolicy: originalRequest.referrerPolicy,
      integrity: originalRequest.integrity,
      keepalive: originalRequest.keepalive,
    };

    if (originalRequest.body) {
      bodyContent = await originalRequest.clone().arrayBuffer();
    }
  } else {
    baseUrl = args[0];
    baseInit = { ...(args[1] || {}) };

    if (baseInit.body) {
      if (baseInit.body instanceof ReadableStream) {
        const reader = baseInit.body.getReader();
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) { break; }
          chunks.push(value);
        }
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const buffer = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          buffer.set(chunk, offset);
          offset += chunk.length;
        }
        bodyContent = buffer.buffer;
      } else if (baseInit.body instanceof Blob) {
        bodyContent = await baseInit.body.arrayBuffer();
      } else if (baseInit.body instanceof ArrayBuffer || ArrayBuffer.isView(baseInit.body)) {
        bodyContent = baseInit.body;
      } else if (typeof baseInit.body === 'string') {
        bodyContent = baseInit.body;
      } else {
        bodyContent = baseInit.body;
      }
      delete baseInit.body;
    }
  }

  return { baseUrl, baseInit, bodyContent };
}

function calculateRetryDelay(error, response, attempt, settings, logger) {
  logger.debug(`Calculating retry delay for attempt ${attempt}.`);
  let delay = 0;

  if (response && response.headers.has('Retry-After')) {
    const retryAfter = response.headers.get('Retry-After');
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      delay = Math.max(delay, Math.min(seconds * 1000, 30000));
      logger.debug(`Retry-After header found: ${seconds}s, adjusted delay: ${delay}ms`);
    }
  }

  if (response && response.status === 429) {
    delay = Math.max(delay, settings.rateLimitDelay * Math.pow(1.5, attempt));
    logger.debug(`429 error detected, adjusted delay: ${delay}ms`);
  }

  delay = Math.max(delay, settings.retryDelay * Math.pow(1.2, attempt));
  logger.debug(`Final delay after exponential backoff: ${delay}ms`);

  return delay;
}

async function handleRetry(error, response, attempt, settings, logger) {
  if (attempt > 0) {
    showRetryToast(attempt, settings.maxRetries, error);
  }

  const delay = calculateRetryDelay(error, response, attempt, settings, logger);
  logger.info(`Waiting ${delay}ms before retry...`);

  await new Promise(resolve => setTimeout(resolve, delay));
  return attempt + 1;
}

export function createRetryableFetch(originalFetch, settings, logger) {
  return async function (...args) {
    if (!settings || !settings.enabled) {
      logger.debug('Fetch Retry is disabled or settings unavailable. Bypassing.');
      return originalFetch.apply(this, args);
    }

    const requestUrl = args[0] instanceof Request ? args[0].url : String(args[0]);
    logger.debug('Intercepted a fetch request.', { url: requestUrl, attempt: 0 });

    const originalSignal = args[0] instanceof Request ? args[0].signal : (args[1]?.signal);
    if (originalSignal?.aborted) {
      logger.debug('Original signal already aborted. Bypassing.');
      return originalFetch.apply(this, args);
    }

    let attempt = 0;
    let lastError;
    let lastResponse;

    const { baseUrl, baseInit, bodyContent } = await prepareRequestData(args);

    while (attempt <= settings.maxRetries) {
      logger.debug(`Starting fetch attempt ${attempt + 1}/${settings.maxRetries + 1}`);
      if (originalSignal?.aborted) {
        logger.info('Request aborted by user during retry loop. Returning abort error.');
        const abortError = new DOMException('Request aborted by user', 'AbortError');
        throw abortError;
      }

      const controller = new AbortController();
      const userAbortHandler = () => {
        logger.debug('User aborted signal received.');
        controller.abort('User aborted');
      };
      if (originalSignal) {
        originalSignal.addEventListener('abort', userAbortHandler, { once: true });
      }
      const { signal } = controller;
      let timeoutId;

      const currentUrl = baseUrl;
      const currentInit = { ...baseInit, signal };

      if (bodyContent !== null) {
        currentInit.body = bodyContent;
      }

      logger.debug(`Created request for attempt ${attempt + 1} with ${bodyContent ? 'body' : 'no body'}`);

      try {
        logger.debug('Executing original fetch...');
        const fetchPromise = originalFetch.apply(this, [currentUrl, currentInit]);

        let timeoutPromise = null;
        if (settings.enableThinkingTimeout) {
          timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
              const error = new Error('Thinking timeout reached');
              error.name = 'TimeoutError';
              controller.abort();
              reject(error);
              logger.warn('Fetch request timed out.');
            }, settings.thinkingTimeout);
          });
        }

        const result = timeoutPromise ?
          await Promise.race([fetchPromise, timeoutPromise]) :
          await fetchPromise;

        logger.debug('Fetch promise resolved or timed out.');

        lastResponse = result;

        if (result.ok) {
          logger.debug(`Fetch successful (status ${result.status}).`);
          return result;
        }

        if (result.status === 429) {
          const url = args[0] instanceof Request ? args[0].url : String(args[0]);
          logger.warn(`Rate limited (429) for ${url}, attempt ${attempt + 1}/${settings.maxRetries + 1}`);
          if (attempt < settings.maxRetries) {
            attempt = await handleRetry(new Error(`Rate limited (429): ${result.statusText}`), result, attempt, settings, logger);
            continue;
          } else {
            logger.error(`Max retries reached for 429 error on ${url}.`);
            lastError = new Error(`Rate limited (429): ${result.statusText}`);
            lastResponse = result;
            break;
          }
        } else if (result.status >= 500) {
          logger.warn(`Server error (${result.status}), attempt ${attempt + 1}/${settings.maxRetries + 1}`);
          if (attempt < settings.maxRetries) {
            attempt = await handleRetry(new Error(`Server error (${result.status}): ${result.statusText}`), result, attempt, settings, logger);
            continue;
          } else {
            lastError = new Error(`Server error (${result.status}): ${result.statusText}`);
            lastResponse = result;
            break;
          }
        } else if (result.status >= 400) {
          logger.warn(`Client error (${result.status}), attempt ${attempt + 1}/${settings.maxRetries + 1}`);
          if (attempt < settings.maxRetries) {
            attempt = await handleRetry(new Error(`Client error (${result.status}): ${result.statusText}`), result, attempt, settings, logger);
            continue;
          } else {
            lastError = new Error(`Client error (${result.status}): ${result.statusText}`);
            lastResponse = result;
            break;
          }
        }

        logger.error(`Unexpected HTTP status: ${result.status}. Throwing error.`);
        throw new Error(`HTTP ${result.status}: ${result.statusText}`);
      } catch (err) {
        lastError = err;
        logger.error('Caught error during fetch attempt:', err);
        logger.debug('Full error object for debugging:', JSON.stringify(err, Object.getOwnPropertyNames(err)));

        let shouldRetry = false;
        let retryReason = '';

        if (err.name === 'TimeoutError') {
          retryReason = `AI thinking timeout (${settings.thinkingTimeout}ms)`;
          shouldRetry = true;
        } else if (err.name === 'AbortError') {
          if (originalSignal?.aborted || err.message === 'User aborted' || err.message === 'Request aborted by user') {
            logger.info('Request aborted by user. Not retrying, propagating abort.');
            throw err;
          }
          retryReason = `Request aborted (${err.message})`;
          shouldRetry = true;
        } else {
          logger.warn(`Non-specific error: ${err.message}, checking if retry is possible. Attempt ${attempt + 1}/${settings.maxRetries + 1}`);
          shouldRetry = true;
        }

        if (shouldRetry) {
          logger.warn(`${retryReason}, retrying... attempt ${attempt + 1}/${settings.maxRetries + 1}`);
        }

        if (attempt >= settings.maxRetries) {
          logger.error('Max retries reached for current error. Breaking retry loop.');
          break;
        }

        attempt = await handleRetry(err, lastResponse, attempt, settings, logger);
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (originalSignal) {
          originalSignal.removeEventListener('abort', userAbortHandler);
        }
      }
    }

    logger.error(`All ${settings.maxRetries + 1} attempts failed. Final error:`, lastError);
    showErrorNotification(lastError, lastResponse, settings);
    throw lastError;
  };
}
