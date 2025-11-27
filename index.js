// == SillyTavern Extension: Fetch Retry ==
// Automatically retry all failed fetch requests with configurable retry count and delay.

import { t } from '../../../../scripts/i18n.js';

const EXTENSION_NAME = 'Fetch Retry';
const settingsKey = 'FetchRetry';
const extensionName = "fetch-retry";

let fetchRetrySettings = {
    enabled: true,
    maxRetries: 5,
    retryDelay: 5000, // ms
    rateLimitDelay: 5000, // ms for 429 errors
    thinkingTimeout: 60000, // ms, timeout for reasoning process
    showErrorNotification: true, // show error notification after all retries fail
    streamInactivityTimeout: 30000, // ms, timeout for stream inactivity
    minRetryDelay: 0, // Minimum delay for retries, useful for debugging or specific API quirks
    debugMode: false, // Enable verbose logging for debugging.
};

const customSettings = [
    {
        "type": "checkbox",
        "varId": "enabled",
        "displayText": t`Enable Fetch Retry`,
        "default": true,
        "description": t`Enable or disable the Fetch Retry extension.`
    },
    {
        "type": "slider",
        "varId": "maxRetries",
        "displayText": t`Maximum Retries`,
        "default": 5,
        "min": 0,
        "max": 10,
        "step": 1,
        "description": t`The maximum number of times to retry a failed fetch request.`
    },
    {
        "type": "slider",
        "varId": "retryDelay",
        "displayText": t`Retry Delay (ms)`,
        "default": 5000,
        "min": 100,
        "max": 60000,
        "step": 100,
        "description": t`The base delay in milliseconds before retrying a failed request. Uses exponential backoff.`
    },
    {
        "type": "slider",
        "varId": "rateLimitDelay",
        "displayText": t`Rate Limit Delay (ms)`,
        "default": 5000,
        "min": 1000,
        "max": 60000,
        "step": 1000,
        "description": t`Specific delay in milliseconds for 429 (Too Many Requests) errors.`
    },
    {
        "type": "slider",
        "varId": "thinkingTimeout",
        "displayText": t`AI Thinking Timeout (ms)`,
        "default": 60000,
        "min": 10000,
        "max": 300000,
        "step": 10000,
        "description": t`Timeout in milliseconds for the AI reasoning process. If exceeded, the request is retried.`
    },
    {
        "type": "checkbox",
        "varId": "showErrorNotification",
        "displayText": t`Show Error Notification`,
        "default": true,
        "description": t`Display a notification if all fetch retries fail.`
    },
    {
        "type": "slider",
        "varId": "streamInactivityTimeout",
        "displayText": t`Stream Inactivity Timeout (ms)`,
        "default": 30000,
        "min": 5000,
        "max": 120000,
        "step": 1000,
        "description": t`If a streaming response stops sending data for this duration, the request is retried.`
    },
    {
        "type": "slider",
        "varId": "minRetryDelay",
        "displayText": t`Minimum Retry Delay (ms)`,
        "default": 0,
        "min": 0,
        "max": 5000,
        "step": 10,
        "description": t`The minimum delay in milliseconds before retrying a failed request. Set to 0 for immediate retries (for debugging).`
    },
    {
        "type": "checkbox",
        "varId": "debugMode",
        "displayText": t`Enable Debug Mode`,
        "default": false,
        "description": t`Prints verbose logs to the browser's developer console (F12) to help diagnose issues with the retry mechanism.`
    }
];

function loadSettings(settings) {
    if (fetchRetrySettings.debugMode) console.log('[Fetch Retry Debug] Loading settings...');
    if (settings) {
        customSettings.forEach(setting => {
            const { varId, type, default: defaultValue } = setting;
            if (settings[varId] !== undefined) {
                let loadedValue = settings[varId];
                switch (type) {
                    case 'checkbox':
                        fetchRetrySettings[varId] = Boolean(loadedValue);
                        break;
                    case 'slider':
                        fetchRetrySettings[varId] = Number(loadedValue);
                        break;
                    default:
                        fetchRetrySettings[varId] = loadedValue;
                }
                if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] Setting loaded: ${varId} = ${fetchRetrySettings[varId]}`);
            } else if (fetchRetrySettings[varId] === undefined) {
                // If setting is not in loaded settings, use default value
                fetchRetrySettings[varId] = defaultValue;
                if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] Setting default: ${varId} = ${fetchRetrySettings[varId]}`);
            }
        });
    }
    if (fetchRetrySettings.debugMode) console.log('[Fetch Retry Debug] Settings loaded.');
}

function saveSettings() {
    if (fetchRetrySettings.debugMode) console.log('[Fetch Retry Debug] Saving settings...');
    // Return a copy of the current settings
    const savedSettings = { ...fetchRetrySettings };
    if (fetchRetrySettings.debugMode) console.log('[Fetch Retry Debug] Settings saved:', savedSettings);
    return savedSettings;
}

/**
 * Generate default settings
 */
function generateDefaultSettings() {
    if (fetchRetrySettings.debugMode) console.log('[Fetch Retry Debug] Generating default settings...');
    const settings = {
        enabled: true,
    };

    customSettings.forEach(setting => {
        settings[setting.varId] = setting.default;
    });
    if (fetchRetrySettings.debugMode) console.log('[Fetch Retry Debug] Default settings generated:', settings);
    return Object.freeze(settings);
}

const defaultSettings = generateDefaultSettings();

/**
 * Main extension initialization function
 * Executed when the extension loads, configures settings and initializes features
 */
(function initExtension() {
    console.log('[Fetch Retry] Initializing extension...');
    const context = SillyTavern.getContext();

    if (!context.extensionSettings[settingsKey]) {
        context.extensionSettings[settingsKey] = structuredClone(defaultSettings);
        console.log('[Fetch Retry] No existing settings found, applying default settings.');
    }

    // Ensure all default setting keys exist
    for (const key of Object.keys(defaultSettings)) {
        if (context.extensionSettings[settingsKey][key] === undefined) {
            context.extensionSettings[settingsKey][key] = defaultSettings[key];
            if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] Added missing default setting: ${key}`);
        }
    }

    // Apply initial settings to fetchRetrySettings
    loadSettings(context.extensionSettings[settingsKey]);

    context.saveSettingsDebounced();
    if (fetchRetrySettings.debugMode) console.log('[Fetch Retry Debug] Settings debounced save triggered.');

    // Automatically load or remove CSS based on enabled status
    toggleCss(context.extensionSettings[settingsKey].enabled);

    if (document.readyState === 'loading') {
        console.log('[Fetch Retry] DOM not fully loaded, waiting for DOMContentLoaded to initialize UI.');
        document.addEventListener('DOMContentLoaded', initExtensionUI);
    } else {
        console.log('[Fetch Retry] DOM already loaded, initializing UI immediately.');
        initExtensionUI();
    }
    console.log('[Fetch Retry] Extension initialization complete.');
})();

/**
 * Initialize UI elements and events for the extension
 */
function initExtensionUI() {
    console.log('[Fetch Retry] Initializing UI elements...');
    renderExtensionSettings();
    console.log('[Fetch Retry] UI initialization complete.');
}

/**
 * Automatically load or remove CSS based on enabled status in settings
 * @param {boolean} shouldLoad - If true, load CSS, otherwise remove
 */
function toggleCss(shouldLoad) {
    console.log(`[Fetch Retry] Toggling CSS. Should load: ${shouldLoad}`);
    const existingLink = document.getElementById('FetchRetry-style');

    if (shouldLoad) {
        const baseUrl = getBaseUrl();
        if (!existingLink) {
            const cssUrl = `${baseUrl}/style.css`;
            const link = document.createElement('link');
            link.id = 'FetchRetry-style';
            link.rel = 'stylesheet';
            link.href = cssUrl;
            document.head.append(link);
            console.log(`[Fetch Retry] CSS loaded from: ${cssUrl}`);
        } else {
            console.log('[Fetch Retry] CSS link already exists.');
        }
    } else {
        if (existingLink) {
            existingLink.remove();
            console.log('[Fetch Retry] CSS removed.');
        } else {
            console.log('[Fetch Retry] No CSS link to remove.');
        }
    }
}

/**
 * Get the base URL path for the extension
 * @returns {string} Base URL for the extension
 */
function getBaseUrl() {
    console.log('[Fetch Retry] Determining base URL...');
    let baseUrl = '';
    if (typeof import.meta !== 'undefined' && import.meta.url) {
        baseUrl = new URL('.', import.meta.url).href;
        console.log(`[Fetch Retry] Base URL from import.meta.url: ${baseUrl}`);
    } else {
        const currentScript = /** @type {HTMLScriptElement} */ (document.currentScript);
        if (currentScript && currentScript.src) {
            baseUrl = currentScript.src.substring(0, currentScript.src.lastIndexOf('/'));
            console.log(`[Fetch Retry] Base URL from document.currentScript.src: ${baseUrl}`);
        } else {
            baseUrl = `${window.location.origin}data/default-user/extensions/${extensionName}`;
            console.log(`[Fetch Retry] Base URL fallback: ${baseUrl}`);
        }
    }
    return baseUrl;
}

/**
 * Render extension settings panel
 */
function renderExtensionSettings() {
    console.log('[Fetch Retry] Rendering extension settings...');
    const context = SillyTavern.getContext();
    const settingsContainer = document.getElementById(`${settingsKey}-container`) ?? document.getElementById('extensions_settings2');
    if (!settingsContainer) {
        console.error('[Fetch Retry] Settings container not found, cannot render settings.');
        return;
    }
    console.log('[Fetch Retry] Settings container found.');

    let existingDrawer = settingsContainer.querySelector(`#${settingsKey}-drawer`);
    if (existingDrawer) {
        console.log('[Fetch Retry] Existing settings drawer found, skipping re-render.');
        return;
    }

    const inlineDrawer = document.createElement('div');
    inlineDrawer.id = `${settingsKey}-drawer`;
    inlineDrawer.classList.add('inline-drawer');
    settingsContainer.append(inlineDrawer);
    console.log('[Fetch Retry] New settings drawer created.');

    const inlineDrawerToggle = document.createElement('div');
    inlineDrawerToggle.classList.add('inline-drawer-toggle', 'inline-drawer-header');

    const extensionNameElement = document.createElement('b');
    extensionNameElement.textContent = EXTENSION_NAME;

    const inlineDrawerIcon = document.createElement('div');
    inlineDrawerIcon.classList.add('inline-drawer-icon', 'fa-solid', 'fa-circle-chevron-down', 'down');

    inlineDrawerToggle.append(extensionNameElement, inlineDrawerIcon);

    const inlineDrawerContent = document.createElement('div');
    inlineDrawerContent.classList.add('inline-drawer-content');

    inlineDrawer.append(inlineDrawerToggle, inlineDrawerContent);

    const settings = context.extensionSettings[settingsKey];

    // Create settings UI elements
    customSettings.forEach(setting => {
        const settingContainer = document.createElement('div');
        settingContainer.classList.add('fetch-retry-setting-item');
        createSettingItem(settingContainer, setting, settings);
        inlineDrawerContent.appendChild(settingContainer);
        if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] Created UI item for setting: ${setting.varId}`);
    });

    inlineDrawerToggle.addEventListener('click', function() {
        this.classList.toggle('open');
        inlineDrawerIcon.classList.toggle('down');
        inlineDrawerIcon.classList.toggle('up');
        inlineDrawerContent.classList.toggle('open');
        console.log('[Fetch Retry] Settings drawer toggled.');
    });

    // Apply initial settings to UI
    applyAllSettings();
    console.log('[Fetch Retry] Initial settings applied to UI.');
    console.log('[Fetch Retry] Extension settings rendered.');
}

/**
 * Create single setting item
 */
function createSettingItem(container, setting, settings) {
    if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] Creating setting item for: ${setting.varId}`);
    const context = SillyTavern.getContext();
    const { varId, displayText, description, type, default: defaultValue } = setting;

    const settingWrapper = document.createElement('div');
    settingWrapper.classList.add('fetch-retry-setting-wrapper');

    const settingRow = document.createElement('div');
    settingRow.classList.add('setting-row');

    const label = document.createElement('label');
    label.htmlFor = `fetch-retry-${varId}`;
    label.textContent = displayText;
    settingRow.appendChild(label);
    settingWrapper.appendChild(settingRow);

    if (description) {
        const descElement = document.createElement('small');
        descElement.textContent = description;
        settingWrapper.appendChild(descElement);
    }

    let inputElement;
    switch (type) {
        case 'checkbox':
            inputElement = /** @type {HTMLInputElement} */ (document.createElement('input'));
            inputElement.id = `fetch-retry-${varId}`;
            inputElement.type = 'checkbox';
            inputElement.checked = Boolean(settings[varId] ?? defaultValue); // Explicitly cast to boolean
            inputElement.addEventListener('change', () => {
                settings[varId] = inputElement.checked;
                context.saveSettingsDebounced();
                if (varId === 'enabled') {
                    toggleCss(inputElement.checked);
                }
                /** @type {any} */ (toastr).info(t`Please refresh the web page to apply changes.`, 'Settings Saved');
                if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] Checkbox setting changed: ${varId} = ${inputElement.checked}`);
            });
            settingRow.appendChild(inputElement);
            break;
        case 'slider':
            inputElement = /** @type {HTMLInputElement} */ (document.createElement('input'));
            inputElement.id = `fetch-retry-${varId}`;
            inputElement.type = 'range';
            inputElement.min = String(setting.min);
            inputElement.max = String(setting.max);
            inputElement.step = String(setting.step);
            inputElement.value = String(settings[varId] ?? defaultValue);
            inputElement.addEventListener('input', () => {
                settings[varId] = Number(inputElement.value);
                context.saveSettingsDebounced();
                // Update associated number input if exists
                const numberInput = /** @type {HTMLInputElement} */ (document.getElementById(`fetch-retry-${varId}-number`));
                if (numberInput) {
                    numberInput.value = inputElement.value;
                }
                if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] Slider setting input: ${varId} = ${inputElement.value}`);
            });

            const numberInput = /** @type {HTMLInputElement} */ (document.createElement('input'));
            numberInput.id = `fetch-retry-${varId}-number`;
            numberInput.type = 'number';
            numberInput.min = String(setting.min);
            numberInput.max = String(setting.max);
            numberInput.step = String(setting.step);
            numberInput.value = String(settings[varId] ?? defaultValue);
            numberInput.style.marginLeft = '10px';
            numberInput.addEventListener('change', () => {
                settings[varId] = Number(numberInput.value);
                context.saveSettingsDebounced();
                // Update associated slider if exists
                inputElement.value = numberInput.value;
                /** @type {any} */ (toastr).info(t`Please refresh the web page to apply changes.`, 'Settings Saved');
                if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] Number input setting changed: ${varId} = ${numberInput.value}`);
            });

            const sliderContainer = document.createElement('div');
            sliderContainer.classList.add('slider-container');
            sliderContainer.appendChild(inputElement);
            sliderContainer.appendChild(numberInput);
            settingWrapper.appendChild(sliderContainer);
            break;
    }

    container.appendChild(settingWrapper);
    if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] Setting item created for: ${varId}`);
}

/**
 * Apply all settings to the UI and update fetchRetrySettings
 */
function applyAllSettings() {
    console.log('[Fetch Retry] Applying all settings to UI...');
    const context = SillyTavern.getContext();
    const settings = context.extensionSettings[settingsKey];

    customSettings.forEach(setting => {
        const { varId, type } = setting;

        // Update the internal fetchRetrySettings object
        fetchRetrySettings[varId] = settings[varId];
        if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] Internal setting updated: ${varId} = ${fetchRetrySettings[varId]}`);

        const element = document.getElementById(`fetch-retry-${varId}`);
        if (element) {
            if (type === 'checkbox') {
                /** @type {HTMLInputElement} */ (element).checked = Boolean(settings[varId]);
                if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] UI checkbox updated for ${varId}: ${Boolean(settings[varId])}`);
            } else if (type === 'slider') {
                /** @type {HTMLInputElement} */ (element).value = String(settings[varId]);
                const numberInput = /** @type {HTMLInputElement} */ (document.getElementById(`fetch-retry-${varId}-number`));
                if (numberInput) {
                    numberInput.value = String(settings[varId]);
                    if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] UI slider and number input updated for ${varId}: ${String(settings[varId])}`);
                }
            }
        }
    });
    console.log('[Fetch Retry] All settings applied to UI.');
}

// Show retry toast notification
function showRetryToast(attempt, maxRetries, error) {
    const currentAttempt = attempt + 1;
    const message = `retry ${currentAttempt}/${maxRetries}`;
    
    // Build full message with error if available
    let fullMessage = message;
    if (error) {
        const errorMessage = error.message || error.toString() || 'Unknown error';
        fullMessage = `${message}: ${errorMessage}`;
    }
    
    if (typeof toastr !== 'undefined') {
        const toast = /** @type {any} */ (toastr).info(fullMessage, 'Fetch Retry', {
            timeOut: 5000,
            extendedTimeOut: 10000,
            closeButton: true
        });
        
        console.log(`[Fetch Retry] Retry toast shown: ${message}`);
    } else {
        console.log(`[Fetch Retry] Retry ${currentAttempt}/${maxRetries}`);
    }
}

// Handle retry: show toast, calculate delay, wait, and increment attempt
async function handleRetry(error, response, attempt) {
    // Show retry toast only if this is a retry (not first attempt)
    if (attempt > 0) {
        showRetryToast(attempt, fetchRetrySettings.maxRetries, error);
    }
    
    // Determine delay for retry
    const delay = getRetryDelay(error, response, attempt);
    console.log(`[Fetch Retry] Waiting ${delay}ms before retry...`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    return attempt + 1;
}

// Show error notification function
function showErrorNotification(error, response) {
    console.log('[Fetch Retry] Displaying error notification...');
    if (!fetchRetrySettings.showErrorNotification) {
        console.log('[Fetch Retry] Error notifications are disabled.');
        return;
    }
    
    let message = 'Fetch failed after all retries';
    let type = 'error';
    
    if (response) {
        if (response.status === 429) {
            message = `Rate limited (429): Too many requests`;
        } else if (response.status >= 500) {
            message = `Server error (${response.status}): ${response.statusText}`;
        } else if (response.status === 403) {
            message = `Forbidden (403): Access denied`;
        } else {
            message = `HTTP ${response.status}: ${response.statusText}`;
        }
        } else if (error) {
            if (error.name === 'TimeoutError') {
                message = `Timeout: AI thinking process exceeded limit`;
                type = 'error';
            } else if (error.name === 'AbortError') {
                message = `Request aborted`;
                type = 'error';
            } else {
                message = `Network error: ${error.message}`;
            }
    }
    
    // Use SillyTavern's toast notification if available
    if (typeof toastr !== 'undefined') {
        /** @type {any} */ (toastr)[type](message, 'Fetch Retry');
        console.log(`[Fetch Retry] Toastr notification shown: Type=${type}, Message="${message}"`);
    } else {
        // Fallback notification
        console.error(`[Fetch Retry] Fallback notification: ${message}`);
        alert(`Fetch Retry Error: ${message}`);
    }
}

let streamTimeoutId = null; // Declare at a higher scope

async function isResponseInvalid(response, url = '') {
    if (fetchRetrySettings.debugMode) {
        console.log('[Fetch Retry Debug] Checking response validity for URL:', url);
    }
    if (!fetchRetrySettings.streamInactivityTimeout) {
        if (fetchRetrySettings.debugMode) console.log('[Fetch Retry Debug] Stream inactivity check is disabled by settings.');
        return { invalid: false, reason: '' };
    }

    // Only check generation endpoints for stream inactivity to avoid false positives
    const generationEndpoints = ['/completion', '/generate', '/chat/completions', '/run/predict'];
    const isGenerationUrl = generationEndpoints.some(endpoint => url.includes(endpoint));
    if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] Is generation URL: ${isGenerationUrl}`);

    if (!isGenerationUrl) {
        if (fetchRetrySettings.debugMode) console.log('[Fetch Retry Debug] Not a generation URL, skipping stream inactivity checks.');
        return { invalid: false, reason: '' };
    }
    
    try {
        // Check for stream inactivity timeout
        if (streamTimeoutId) {
            // Stream is being monitored, validity check passed
            if (fetchRetrySettings.debugMode) console.log('[Fetch Retry Debug] Stream is being monitored.');
            return { invalid: false, reason: '' };
        }
    } catch (err) {
        console.warn('[Fetch Retry] Error checking response validity:', err);
        if (err.message === 'Stream inactivity timeout') {
            console.warn('[Fetch Retry] Stream stopped mid-way due to inactivity.');
            return { invalid: true, reason: 'stream_inactivity' };
        }
    }
    if (fetchRetrySettings.debugMode) console.log('[Fetch Retry Debug] Response is valid.');
    return { invalid: false, reason: '' };
}

// Helper function to determine delay based on error
function getRetryDelay(error, response, attempt) {
    if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] Calculating retry delay for attempt ${attempt}.`);
    let delay = fetchRetrySettings.minRetryDelay; // Start with minimum delay
    if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] Initial delay: ${delay}ms`);

    // If there's a Retry-After header, use that
    if (response && response.headers.has('Retry-After')) {
        const retryAfter = response.headers.get('Retry-After');
        const seconds = parseInt(retryAfter);
        if (!isNaN(seconds)) {
            delay = Math.max(delay, Math.min(seconds * 1000, 30000)); // Max 30 seconds
            if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] Retry-After header found: ${seconds}s, adjusted delay: ${delay}ms`);
        }
    }
    
    // For 429 errors, use longer delay
    if (response && response.status === 429) {
        delay = Math.max(delay, fetchRetrySettings.rateLimitDelay * Math.pow(1.5, attempt)); // Exponential backoff
        if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] 429 error detected, adjusted delay: ${delay}ms`);
    }
    
    // Default delay with exponential backoff
    delay = Math.max(delay, fetchRetrySettings.retryDelay * Math.pow(1.2, attempt));
    if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] Final delay after exponential backoff: ${delay}ms`);

    return delay;
}

// Monkey-patch fetch
if (!(/** @type {any} */ (window))._fetchRetryPatched) {
    console.log('[Fetch Retry] Attempting to monkey-patch window.fetch...');
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        if (!fetchRetrySettings.enabled) {
            if (fetchRetrySettings.debugMode) console.log('[Fetch Retry Debug] Fetch Retry is disabled. Bypassing.');
            return originalFetch.apply(this, args);
        }

        if (fetchRetrySettings.debugMode) {
            console.log('[Fetch Retry Debug] Intercepted a fetch request.', { url: args[0] instanceof Request ? args[0].url : args[0], attempt: 0 });
        }

        const originalSignal = args[0] instanceof Request ? args[0].signal : (args[1]?.signal);
        if (originalSignal?.aborted) {
            if (fetchRetrySettings.debugMode) console.log('[Fetch Retry Debug] Original signal already aborted. Bypassing.');
            return originalFetch.apply(this, args);
        }

        let attempt = 0;
        let lastError;
        let lastResponse;
        
        while (attempt <= fetchRetrySettings.maxRetries) {
            if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] Starting fetch attempt ${attempt + 1}/${fetchRetrySettings.maxRetries + 1}`);
            if (originalSignal?.aborted) {
                console.warn('[Fetch Retry] Request aborted by user during retry loop. Throwing last error.');
                throw lastError ?? new DOMException('Request aborted by user', 'AbortError');
            }
            const controller = new AbortController();
            const userAbortHandler = () => {
                if (fetchRetrySettings.debugMode) console.log('[Fetch Retry Debug] User aborted signal received.');
                controller.abort('User aborted');
            };
            if (originalSignal) {
                originalSignal.addEventListener('abort', userAbortHandler, { once: true });
            }
            const signal = controller.signal; // Signal for the current attempt
            let timeoutId;

            let currentUrl; // Will be RequestInfo | URL
            let currentInit; // Will be RequestInit

            // Parse original args into currentUrl and currentInit
            if (args[0] instanceof Request) {
                currentUrl = args[0].url;
                // Clone the RequestInit properties from the original Request
                currentInit = {
                    method: args[0].method,
                    headers: args[0].headers,
                    mode: args[0].mode,
                    credentials: args[0].credentials,
                    cache: args[0].cache,
                    redirect: args[0].redirect,
                    referrer: args[0].referrer,
                    referrerPolicy: args[0].referrerPolicy,
                    integrity: args[0].integrity,
                    keepalive: args[0].keepalive,
                    body: args[0].body, // Store the original Request object's body for later reading if needed
                    signal: signal, // Explicitly add the signal here
                };
                if (fetchRetrySettings.debugMode) console.log('[Fetch Retry Debug] Request is an instance of Request.');
            } else {
                currentUrl = args[0];
                // Clone original init if exists, and then explicitly add the signal
                currentInit = Object.assign({}, args[1], { signal: signal });
                if (fetchRetrySettings.debugMode) console.log('[Fetch Retry Debug] Request is a URL/string.');
            }

            try {
                // Call original fetch with the potentially modified currentUrl and currentInit
                if (fetchRetrySettings.debugMode) console.log('[Fetch Retry Debug] Executing original fetch...');
                const fetchPromise = originalFetch.apply(this, [currentUrl, currentInit]);

                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => {
                        const error = new Error('Thinking timeout reached');
                        error.name = 'TimeoutError';
                        controller.abort();
                        reject(error);
                        console.warn('[Fetch Retry] Fetch request timed out.');
                    }, fetchRetrySettings.thinkingTimeout);
                });

                const result = await Promise.race([fetchPromise, timeoutPromise]);
                clearTimeout(timeoutId); // Clear timeout if fetch succeeds
                if (originalSignal) {
                    originalSignal.removeEventListener('abort', userAbortHandler);
                }
                if (fetchRetrySettings.debugMode) console.log('[Fetch Retry Debug] Fetch promise resolved or timed out.');

                lastResponse = result;
                
                // Success if status 200-299
                if (result.ok) {
                    if (fetchRetrySettings.debugMode) console.log(`[Fetch Retry Debug] Fetch successful (status ${result.status}).`);
                    let processedResult = result;
                    
                    // Check if response is invalid (too short or incomplete)
                    const url = args[0] instanceof Request ? args[0].url : String(args[0]);
                    const { invalid, reason } = await isResponseInvalid(processedResult, url);
                    if (fetchRetrySettings.debugMode) {
                        console.log(`[Fetch Retry Debug] Validity check result: invalid=${invalid}, reason='${reason}'`);
                    }

                    if (invalid && attempt < fetchRetrySettings.maxRetries) {
                        console.warn(`[Fetch Retry] Response is invalid (${reason}), retrying... attempt ${attempt + 1}/${fetchRetrySettings.maxRetries + 1}`);
                        attempt = await handleRetry(new Error(`Response invalid: ${reason}`), processedResult, attempt);
                        continue;
                    }
                    if (fetchRetrySettings.debugMode) console.log('[Fetch Retry Debug] Response is valid or max retries reached for invalid response. Returning result.');
                    return processedResult;
                }
                
                // Handle specific error codes
                if (result.status === 429) {
                    console.warn(`[Fetch Retry] Rate limited (429), attempt ${attempt + 1}/${fetchRetrySettings.maxRetries + 1}`);
                    if (attempt < fetchRetrySettings.maxRetries) {
                        attempt = await handleRetry(new Error(`Rate limited (429): ${result.statusText}`), result, attempt);
                        continue;
                    }
                } else if (result.status >= 500) {
                    console.warn(`[Fetch Retry] Server error (${result.status}), attempt ${attempt + 1}/${fetchRetrySettings.maxRetries + 1}`);
                    if (attempt < fetchRetrySettings.maxRetries) {
                        attempt = await handleRetry(new Error(`Server error (${result.status}): ${result.statusText}`), result, attempt);
                        continue;
                    }
                } else if (result.status >= 400) {
                    // Client errors other than 429 usually don't need retry
                    console.error(`[Fetch Retry] Client error (${result.status}): ${result.statusText}. Not retrying.`);
                    throw new Error(`HTTP ${result.status}: ${result.statusText}`);
                }
                
                console.error(`[Fetch Retry] Unexpected HTTP status: ${result.status}. Throwing error.`);
                throw new Error(`HTTP ${result.status}: ${result.statusText}`);
                
            } catch (err) {
                clearTimeout(timeoutId); // Make sure timeout is cleared if there's another error
                if (originalSignal) {
                    originalSignal.removeEventListener('abort', userAbortHandler);
                }
                lastError = err;
                console.error('[Fetch Retry] Caught error during fetch attempt:', err); // Detailed error logging
                if (fetchRetrySettings.debugMode) {
                    console.log('[Fetch Retry] Full error object for debugging:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
                }

                let shouldRetry = false;
                let retryReason = '';

                if (err.name === 'TimeoutError') {
                    retryReason = `AI thinking timeout (${fetchRetrySettings.thinkingTimeout}ms)`;
                    shouldRetry = true;
                } else if (err.name === 'AbortError') {
                    if (originalSignal?.aborted || err.message === 'User aborted') {
                        console.log('[Fetch Retry] Request aborted by user. Not retrying.');
                        throw err;
                    }
                    retryReason = `Request aborted (${err.message})`;
                    shouldRetry = true;
                } else {
                    console.warn(`[Fetch Retry] Non-specific error: ${err.message}, checking if retry is possible. Attempt ${attempt + 1}/${fetchRetrySettings.maxRetries + 1}`);
                    // For other errors, we might still retry if it's a network issue or transient server error
                    shouldRetry = true; // Default to true for unknown errors to attempt recovery
                }

                if (shouldRetry) {
                    console.warn(`[Fetch Retry] ${retryReason}, retrying... attempt ${attempt + 1}/${fetchRetrySettings.maxRetries + 1}`);
                }
                
                // If max retries reached, break
                if (attempt >= fetchRetrySettings.maxRetries) {
                    console.error('[Fetch Retry] Max retries reached for current error. Breaking retry loop.');
                    break;
                }
                
                attempt = await handleRetry(err, lastResponse, attempt);
            }
        }
        
        // If we get here, all attempts failed
        console.error(`[Fetch Retry] All ${fetchRetrySettings.maxRetries + 1} attempts failed. Final error:`, lastError);
        
        // Show error notification
        showErrorNotification(lastError, lastResponse);
        
        throw lastError;
    };
    
    (/** @type {any} */ (window))._fetchRetryPatched = true;
    console.log('[Fetch Retry] Extension loaded and fetch patched successfully.');
}
