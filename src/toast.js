export function showRetryToast(attempt, maxRetries, error) {
  const retryNumber = attempt;
  const message = `retry ${retryNumber}/${maxRetries}`;

  let fullMessage = message;
  if (error) {
    const errorMessage = error.message || error.toString() || 'Unknown error';
    fullMessage = `${message}: ${errorMessage}`;
  }

  if (typeof toastr !== 'undefined') {
    toastr.info(fullMessage, 'Fetch Retry', {
      timeOut: 5000,
      extendedTimeOut: 10000,
      closeButton: true,
    });
    console.log(`[Fetch Retry] Retry toast shown: ${message}`);
  } else {
    console.log(`[Fetch Retry] Retry ${retryNumber}/${maxRetries}`);
  }
}

export function showErrorNotification(error, response, settings) {
  console.log('[Fetch Retry] Displaying error notification...');
  if (!settings.showErrorNotification) {
    console.log('[Fetch Retry] Error notifications are disabled.');
    return;
  }

  let message = 'Fetch failed after all retries';
  let type = 'error';

  if (response) {
    if (response.status === 429) {
      message = 'Rate limited (429): Too many requests';
    } else if (response.status >= 500) {
      message = `Server error (${response.status}): ${response.statusText}`;
    } else if (response.status === 403) {
      message = 'Forbidden (403): Access denied';
    } else {
      message = `HTTP ${response.status}: ${response.statusText}`;
    }
  } else if (error) {
    if (error.name === 'TimeoutError') {
      message = 'Timeout: AI thinking process exceeded limit';
      type = 'error';
    } else if (error.name === 'AbortError') {
      message = 'Request aborted';
      type = 'error';
    } else {
      message = `Network error: ${error.message}`;
    }
  }

  if (typeof toastr !== 'undefined') {
    toastr[type](message, 'Fetch Retry');
    console.log(`[Fetch Retry] Toastr notification shown: Type=${type}, Message="${message}"`);
  } else {
    console.error(`[Fetch Retry] Fallback notification: ${message}`);
    alert(`Fetch Retry Error: ${message}`);
  }
}
