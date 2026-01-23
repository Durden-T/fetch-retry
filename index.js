import { createLogger } from './src/logger.js';
import { createSettingsProxy, DEFAULT_SETTINGS } from './src/settings.js';
import { toggleCss, initExtensionUI } from './src/ui.js';
import { createRetryableFetch } from './src/fetch-retry.js';

const settingsKey = 'FetchRetry';

(function initExtension() {
    const context = SillyTavern.getContext();

    const settings = createSettingsProxy(context, settingsKey, {
        info: (msg) => console.log(`[Fetch Retry] ${msg}`),
    });

    const logger = createLogger(() => settings.debugMode);

    logger.info('Initializing extension...');

    toggleCss(settings.enabled, logger);

    const initUI = () => {
        initExtensionUI(settings, context, logger);
        context.saveSettingsDebounced();
        logger.debug('Settings debounced save triggered after UI initialization.');
    };

    if (document.readyState === 'loading') {
        logger.info('DOM not fully loaded, waiting for DOMContentLoaded to initialize UI.');
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        logger.info('DOM already loaded, initializing UI immediately.');
        initUI();
    }

    if (!window._fetchRetryPatched) {
        logger.info('Attempting to monkey-patch window.fetch...');
        const originalFetch = window.fetch;
        window.fetch = createRetryableFetch(originalFetch, settings, logger);
        window._fetchRetryPatched = true;
        logger.info('Extension loaded and fetch patched successfully.');
    }

    logger.info('Extension initialization complete.');
})();
