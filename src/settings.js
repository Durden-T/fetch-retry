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
    default: 5000,
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
    default: 60000,
    min: 10000,
    max: 300000,
    step: 10000,
    description: 'Timeout in milliseconds for the AI reasoning process. If exceeded, the request is retried.',
  },
  {
    type: 'checkbox',
    varId: 'enableThinkingTimeout',
    displayText: 'Enable Thinking Timeout',
    default: true,
    description: 'Enable or disable the thinking timeout. When disabled, requests will not be interrupted.',
  },
  {
    type: 'checkbox',
    varId: 'showErrorNotification',
    displayText: 'Show Error Notification',
    default: true,
    description: 'Display a notification if all fetch retries fail.',
  },
  {
    type: 'slider',
    varId: 'streamInactivityTimeout',
    displayText: 'Stream Inactivity Timeout (ms)',
    default: 30000,
    min: 5000,
    max: 120000,
    step: 1000,
    description: 'If a streaming response stops sending data for this duration, the request is retried.',
  },
  {
    type: 'slider',
    varId: 'minRetryDelay',
    displayText: 'Minimum Retry Delay (ms)',
    default: 0,
    min: 0,
    max: 5000,
    step: 10,
    description: 'Minimum delay before retrying. Set to 0 for immediate retries (for debugging).',
  },
  {
    type: 'checkbox',
    varId: 'debugMode',
    displayText: 'Enable Debug Mode',
    default: false,
    description: 'Prints verbose logs to the browser console (F12) to help diagnose retry issues.',
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
      target[varId] = type === 'checkbox' ? Boolean(loadedValue) : Number(loadedValue);
    } else if (target[varId] === undefined) {
      target[varId] = defaultValue;
    }
  });
}

export function createSettingsProxy(context, settingsKey, logger) {
  if (!context.extensionSettings[settingsKey]) {
    context.extensionSettings[settingsKey] = structuredClone(DEFAULT_SETTINGS);
    logger.info('No existing settings found, applying default settings.');
  }

  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (context.extensionSettings[settingsKey][key] === undefined) {
      context.extensionSettings[settingsKey][key] = DEFAULT_SETTINGS[key];
    }
  }

  return context.extensionSettings[settingsKey];
}
