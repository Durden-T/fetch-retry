import { showRetryToast, showErrorNotification } from './toast.js';

let cachedPatterns = null;
let cachedPatternsVersion = -1;

function getCachedPatterns(urlPatterns, settingsVersion, logger) {
  if (cachedPatternsVersion === settingsVersion && cachedPatterns !== null) {
    return cachedPatterns;
  }

  const compiledPatterns = [];
  for (const pattern of urlPatterns) {
    try {
      if (pattern.length > 500) {
        logger.warn(`Pattern too long (${pattern.length} chars), skipping: ${pattern.substring(0, 50)}...`);
        continue;
      }

      if (/(\+\*|\*\+|\{\d{3,}\}|\+{3,}|\*{3,})/.test(pattern)) {
        logger.warn(`Pattern contains potentially dangerous repetition quantifiers, skipping: ${pattern}`);
        continue;
      }

      compiledPatterns.push(new RegExp(pattern));
    } catch (err) {
      logger.warn(`Invalid regex pattern "${pattern}": ${err.message}`);
    }
  }

  cachedPatterns = compiledPatterns;
  cachedPatternsVersion = settingsVersion;
  logger.debug(`Compiled ${compiledPatterns.length} regex patterns (cached).`);

  return compiledPatterns;
}

function shouldApplyRetryLogic(url, settings, logger) {
  const { urlPatterns, urlFilterMode, _settingsVersion = 0 } = settings;

  if (!Array.isArray(urlPatterns) || urlPatterns.length === 0) {
    if (urlFilterMode === 'include') {
      logger.debug('No URL patterns configured with include mode, bypassing retry logic.');
      return false;
    }
    logger.debug('No URL patterns configured, applying retry logic to all requests.');
    return true;
  }

  const compiledPatterns = getCachedPatterns(urlPatterns, _settingsVersion, logger);

  if (compiledPatterns.length === 0) {
    if (urlFilterMode === 'include') {
      logger.debug('No valid URL patterns with include mode, bypassing retry logic.');
      return false;
    }
    logger.debug('No valid URL patterns, applying retry logic to all requests.');
    return true;
  }

  const matches = compiledPatterns.some(regex => regex.test(url));

  if (urlFilterMode === 'include') {
    const shouldRetry = matches;
    logger.debug(`URL filter (include): ${url} ${shouldRetry ? 'matches' : 'does not match'} patterns.`);
    return shouldRetry;
  } else if (urlFilterMode === 'exclude') {
    const shouldRetry = !matches;
    logger.debug(`URL filter (exclude): ${url} ${shouldRetry ? 'does not match' : 'matches'} patterns.`);
    return shouldRetry;
  }

  logger.warn(`Unknown urlFilterMode: ${urlFilterMode}, applying retry logic.`);
  return true;
}

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
  const MAX_DELAY = 30000;
  let delay = 0;

  if (response && response.headers.has('Retry-After')) {
    const retryAfter = response.headers.get('Retry-After');
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      delay = Math.max(delay, Math.min(seconds * 1000, MAX_DELAY));
      logger.debug(`Retry-After header found: ${seconds}s, adjusted delay: ${delay}ms`);
    }
  }

  if (response && response.status === 429) {
    delay = Math.max(delay, settings.rateLimitDelay * Math.pow(1.5, attempt));
    logger.debug(`429 error detected, adjusted delay: ${delay}ms`);
  }

  delay = Math.max(delay, settings.retryDelay * Math.pow(1.2, attempt));
  delay = Math.min(delay, MAX_DELAY);

  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  delay = Math.max(0, delay + jitter);

  logger.debug(`Final delay after exponential backoff with jitter: ${delay}ms`);

  return delay;
}

async function handleRetry(error, response, attempt, settings, logger) {
  const nextAttempt = attempt + 1;
  showRetryToast(nextAttempt, settings.maxRetries, error);

  const delay = calculateRetryDelay(error, response, attempt, settings, logger);
  logger.info(`Waiting ${delay}ms before retry...`);

  await new Promise(resolve => setTimeout(resolve, delay));
  return nextAttempt;
}

export function createRetryableFetch(originalFetch, settings, logger) {
  return async function (...args) {
    if (!settings || !settings.enabled) {
      logger.debug('Fetch Retry is disabled or settings unavailable. Bypassing.');
      return originalFetch.apply(this, args);
    }

    const requestUrl = args[0] instanceof Request ? args[0].url : String(args[0]);
    logger.debug('Intercepted a fetch request.', { url: requestUrl, attempt: 0 });

    if (!shouldApplyRetryLogic(requestUrl, settings, logger)) {
      logger.debug(`URL ${requestUrl} does not match filter patterns. Bypassing retry logic.`);
      return originalFetch.apply(this, args);
    }

    const originalSignal = args[0] instanceof Request ? args[0].signal : (args[1]?.signal);
    if (originalSignal?.aborted) {
      logger.debug('Original signal already aborted. Bypassing.');
      return originalFetch.apply(this, args);
    }

    let attempt = 0;
    let lastError;
    let lastResponse;

    const { baseUrl, baseInit, bodyContent } = await prepareRequestData(args);

    let currentController = null;
    const userAbortHandler = () => {
      if (currentController) {
        logger.debug('User aborted signal received.');
        currentController.abort(new Error('User aborted'));
      }
    };

    if (originalSignal) {
      originalSignal.addEventListener('abort', userAbortHandler);
    }

    try {
      while (attempt <= settings.maxRetries) {
        logger.debug(`Starting fetch attempt ${attempt + 1}/${settings.maxRetries + 1}`);
        if (originalSignal?.aborted) {
          logger.info('Request aborted by user during retry loop. Returning abort error.');
          const abortError = new DOMException('Request aborted by user', 'AbortError');
          throw abortError;
        }

        const controller = new AbortController();
        currentController = controller;
        const { signal } = controller;
        let timeoutId;

        // Check again for race condition - user might have aborted during setup
        if (originalSignal?.aborted) {
          logger.info('Request aborted by user during controller setup.');
          const abortError = new DOMException('Request aborted by user', 'AbortError');
          throw abortError;
        }

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

          if (result.ok) {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            logger.debug(`Fetch successful (status ${result.status}).`);

            // Check if response body contains an error field (if enabled)
            let hasResponseError = false;
            if (settings.checkResponseErrorField) {
              logger.debug('Checking for error field in response body.');
              try {
                const clonedResponse = result.clone();
                const contentType = clonedResponse.headers.get('content-type');

                if (contentType && contentType.includes('application/json')) {
                  const data = await clonedResponse.json();
                  const MIN_ERROR_LENGTH = 2;

                  let errorMessage = null;

                  if (data && data.error !== undefined && data.error !== null) {
                    if (typeof data.error === 'string' && data.error.length > MIN_ERROR_LENGTH) {
                      errorMessage = data.error;
                    } else if (typeof data.error === 'object') {
                      if (data.error.message && typeof data.error.message === 'string') {
                        errorMessage = data.error.message;
                      } else {
                        errorMessage = JSON.stringify(data.error);
                      }
                    }
                  }

                  if (errorMessage && errorMessage.length > MIN_ERROR_LENGTH) {
                    logger.warn(`Response body contains error field: ${errorMessage}`);
                    lastResponse = result.clone();
                    lastError = new Error(`Response error: ${errorMessage}`);
                    hasResponseError = true;
                  }
                }
              } catch (parseError) {
                logger.warn(`Could not parse JSON response for error checking: ${parseError.message}`);
              }
            }

            if (hasResponseError) {
              if (attempt < settings.maxRetries) {
                attempt = await handleRetry(lastError, lastResponse, attempt, settings, logger);
                continue;
              } else {
                logger.error(`Max retries reached for response with error field.`);
                break;
              }
            }

            return result;
          }

        lastResponse = result.clone();

        if (result.status === 429) {
          const url = args[0] instanceof Request ? args[0].url : String(args[0]);
          logger.warn(`Rate limited (429) for ${url}, attempt ${attempt + 1}/${settings.maxRetries + 1}`);
          if (attempt < settings.maxRetries) {
            attempt = await handleRetry(new Error(`Rate limited (429): ${result.statusText}`), result, attempt, settings, logger);
            continue;
          } else {
            logger.error(`Max retries reached for 429 error on ${url}.`);
            lastError = new Error(`Rate limited (429): ${result.statusText}`);
            break;
          }
        } else if (result.status >= 500) {
          logger.warn(`Server error (${result.status}), attempt ${attempt + 1}/${settings.maxRetries + 1}`);
          if (attempt < settings.maxRetries) {
            attempt = await handleRetry(new Error(`Server error (${result.status}): ${result.statusText}`), result, attempt, settings, logger);
            continue;
          } else {
            lastError = new Error(`Server error (${result.status}): ${result.statusText}`);
            break;
          }
        } else if (result.status >= 400) {
          logger.warn(`Client error (${result.status}), attempt ${attempt + 1}/${settings.maxRetries + 1}`);
          if (attempt < settings.maxRetries) {
            attempt = await handleRetry(new Error(`Client error (${result.status}): ${result.statusText}`), result, attempt, settings, logger);
            continue;
          } else {
            lastError = new Error(`Client error (${result.status}): ${result.statusText}`);
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
        }
      }

      logger.error(`All ${settings.maxRetries + 1} attempts failed. Final error:`, lastError);
      showErrorNotification(lastError, lastResponse, settings);
      throw lastError;
    } finally {
      if (originalSignal) {
        originalSignal.removeEventListener('abort', userAbortHandler);
      }
      currentController = null;
    }
  };
}
