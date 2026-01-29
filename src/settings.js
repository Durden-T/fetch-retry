export const SETTINGS_CONFIG = [
  {
    type: 'checkbox',
    varId: 'enabled',
    displayText: 'Enable Fetch Retry',
    default: true,
    description: 'Enable or disable the Fetch Retry extension.',
  },
  {
    type: 'slider',
    varId: 'maxRetries',
    displayText: 'Maximum Retries',
    default: 5,
    min: 0,
    max: 10,
    step: 1,
    description: 'The maximum number of times to retry a failed fetch request.',
  },
  {
    type: 'slider',
    varId: 'retryDelay',
    displayText: 'Retry Delay (ms)',
    default: 1000,
    min: 100,
    max: 60000,
    step: 100,
    description: 'The base delay in milliseconds before retrying a failed request. Uses exponential backoff.',
  },
  {
    type: 'slider',
    varId: 'rateLimitDelay',
    displayText: 'Rate Limit Delay (ms)',
    default: 5000,
    min: 1000,
    max: 60000,
    step: 1000,
    description: 'Specific delay in milliseconds for 429 (Too Many Requests) errors.',
  },
  {
    type: 'slider',
    varId: 'thinkingTimeout',
    displayText: 'AI Thinking Timeout (ms)',
    default: 300000,
    min: 10000,
    max: 300000,
    step: 10000,
    description: 'Timeout in milliseconds for the AI reasoning process. If exceeded, the request is retried.',
  },
  {
    type: 'checkbox',
    varId: 'enableThinkingTimeout',
    displayText: 'Enable Thinking Timeout',
    default: false,
    description: 'Enable or disable the thinking timeout. When disabled, requests will not be interrupted.',
  },
  {
    type: 'checkbox',
    varId: 'checkResponseErrorField',
    displayText: 'Check for Error Field in Responses',
    default: true,
    description: 'Retry successful responses (200-299) if they contain an error field with length > 3.',
  },
  {
    type: 'checkbox',
    varId: 'showErrorNotification',
    displayText: 'Show Error Notification',
    default: true,
    description: 'Display a notification if all fetch retries fail.',
  },
  {
    type: 'checkbox',
    varId: 'debugMode',
    displayText: 'Enable Debug Mode',
    default: false,
    description: 'Prints verbose logs to the browser console (F12) to help diagnose retry issues.',
  },
  {
    type: 'select',
    varId: 'urlFilterMode',
    displayText: 'URL Filter Mode',
    default: 'include',
    options: [
      { value: 'include', label: 'Include only matching URLs' },
      { value: 'exclude', label: 'Exclude matching URLs' },
    ],
    description: 'Include mode: only retry URLs matching patterns. Exclude mode: retry all URLs except matching patterns.',
  },
  {
    type: 'textarea',
    varId: 'urlPatterns',
    displayText: 'URL Patterns (regex, one per line)',
    default: ['/api/backends/', '/api/chats/', '/v1/chat/completions'],
    description: 'Regular expression patterns to match against request URLs. One pattern per line. Max 50 patterns, 500 chars each.',
    maxPatterns: 50,
    maxPatternLength: 500,
  },
];

function generateDefaultSettings() {
  const settings = { enabled: true };
  SETTINGS_CONFIG.forEach(setting => {
    settings[setting.varId] = setting.default;
  });
  return Object.freeze(settings);
}

export const DEFAULT_SETTINGS = generateDefaultSettings();

export function loadSettings(saved, target) {
  SETTINGS_CONFIG.forEach(setting => {
    const { varId, type, default: defaultValue } = setting;
    if (saved[varId] !== undefined) {
      const loadedValue = saved[varId];
      if (type === 'checkbox') {
        target[varId] = Boolean(loadedValue);
      } else if (type === 'slider') {
        target[varId] = Number(loadedValue);
      } else if (type === 'textarea') {
        target[varId] = Array.isArray(loadedValue) ? loadedValue : defaultValue;
      } else if (type === 'select') {
        target[varId] = String(loadedValue);
      } else {
        target[varId] = loadedValue;
      }
    } else if (target[varId] === undefined) {
      target[varId] = defaultValue;
    }
  });
}

export function getSettingsReference(context, settingsKey, logger) {
  if (!context.extensionSettings[settingsKey]) {
    try {
      context.extensionSettings[settingsKey] = structuredClone(DEFAULT_SETTINGS);
    } catch (err) {
      logger.warn('structuredClone failed, using JSON fallback:', err.message);
      context.extensionSettings[settingsKey] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
    logger.info('No existing settings found, applying default settings.');
  }

  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (context.extensionSettings[settingsKey][key] === undefined) {
      context.extensionSettings[settingsKey][key] = DEFAULT_SETTINGS[key];
    }
  }

  if (context.extensionSettings[settingsKey]._settingsVersion === undefined) {
    context.extensionSettings[settingsKey]._settingsVersion = 0;
  }

  const settings = context.extensionSettings[settingsKey];

  if (Array.isArray(settings.urlPatterns) && settings.urlPatterns.length > 50) {
    logger.warn(`URL patterns exceed limit (${settings.urlPatterns.length}/50), truncating.`);
    settings.urlPatterns = settings.urlPatterns.slice(0, 50);
  }

  return settings;
}

export function incrementSettingsVersion(settings) {
  settings._settingsVersion = (settings._settingsVersion || 0) + 1;
}
