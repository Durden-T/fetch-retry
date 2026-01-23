import { SETTINGS_CONFIG } from './settings.js';

const EXTENSION_NAME = 'Fetch Retry';
const extensionName = 'fetch-retry';

function getBaseUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.url) {
    return new URL('..', import.meta.url).href;
  }
  const { currentScript } = document;
  if (currentScript?.src) {
    const srcDir = currentScript.src.substring(0, currentScript.src.lastIndexOf('/'));
    return srcDir.substring(0, srcDir.lastIndexOf('/'));
  }
  return `${window.location.origin}/scripts/extensions/third-party/${extensionName}`;
}

export function toggleCss(shouldLoad, logger) {
  logger.info(`Toggling CSS. Should load: ${shouldLoad}`);
  const existingLink = document.getElementById('FetchRetry-style');

  if (shouldLoad) {
    if (!existingLink) {
      const cssUrl = new URL('style.css', getBaseUrl()).href;
      const link = document.createElement('link');
      link.id = 'FetchRetry-style';
      link.rel = 'stylesheet';
      link.href = cssUrl;
      document.head.append(link);
      logger.info(`CSS loaded from: ${cssUrl}`);
    } else {
      logger.info('CSS link already exists.');
    }
  } else if (existingLink) {
    existingLink.remove();
    logger.info('CSS removed.');
  } else {
    logger.info('No CSS link to remove.');
  }
}

function createSettingItem(container, setting, settings, context, logger) {
  logger.debug(`Creating setting item for: ${setting.varId}`);
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
      inputElement = document.createElement('input');
      inputElement.id = `fetch-retry-${varId}`;
      inputElement.type = 'checkbox';
      inputElement.checked = Boolean(settings[varId] ?? defaultValue);
      inputElement.addEventListener('change', () => {
        settings[varId] = inputElement.checked;
        context.saveSettingsDebounced();
        if (varId === 'enabled') {
          toggleCss(inputElement.checked, logger);
        }
        logger.debug(`Checkbox setting changed: ${varId} = ${inputElement.checked}`);
      });
      settingRow.appendChild(inputElement);
      break;
    case 'slider':
      inputElement = document.createElement('input');
      inputElement.id = `fetch-retry-${varId}`;
      inputElement.type = 'range';
      inputElement.min = String(setting.min);
      inputElement.max = String(setting.max);
      inputElement.step = String(setting.step);
      inputElement.value = String(settings[varId] ?? defaultValue);
      inputElement.addEventListener('input', () => {
        const value = Number(inputElement.value);
        settings[varId] = value;
        context.saveSettingsDebounced();
        const numberInput = document.getElementById(`fetch-retry-${varId}-number`);
        if (numberInput) {
          numberInput.value = inputElement.value;
        }
        logger.debug(`Slider setting input: ${varId} = ${inputElement.value}`);
      });

      const numberInput = document.createElement('input');
      numberInput.id = `fetch-retry-${varId}-number`;
      numberInput.type = 'number';
      numberInput.min = String(setting.min);
      numberInput.max = String(setting.max);
      numberInput.step = String(setting.step);
      numberInput.value = String(settings[varId] ?? defaultValue);
      numberInput.style.marginLeft = '10px';
      numberInput.addEventListener('change', () => {
        const value = Number(numberInput.value);
        settings[varId] = value;
        context.saveSettingsDebounced();
        inputElement.value = numberInput.value;
        logger.debug(`Number input setting changed: ${varId} = ${numberInput.value}`);
      });

      const sliderContainer = document.createElement('div');
      sliderContainer.classList.add('slider-container');
      sliderContainer.appendChild(inputElement);
      sliderContainer.appendChild(numberInput);
      settingWrapper.appendChild(sliderContainer);
      break;
  }

  container.appendChild(settingWrapper);
  logger.debug(`Setting item created for: ${varId}`);
}

function applyAllSettings(settings, logger) {
  logger.info('Applying all settings to UI...');

  SETTINGS_CONFIG.forEach(setting => {
    const { varId, type } = setting;

    logger.debug(`Internal setting: ${varId} = ${settings[varId]}`);

    const element = document.getElementById(`fetch-retry-${varId}`);
    if (element) {
      if (type === 'checkbox') {
        element.checked = Boolean(settings[varId]);
        logger.debug(`UI checkbox updated for ${varId}: ${Boolean(settings[varId])}`);
      } else if (type === 'slider') {
        element.value = String(settings[varId]);
        const numberInput = document.getElementById(`fetch-retry-${varId}-number`);
        if (numberInput) {
          numberInput.value = String(settings[varId]);
          logger.debug(`UI slider and number input updated for ${varId}: ${String(settings[varId])}`);
        }
      }
    }
  });
  logger.info('All settings applied to UI.');
}

export function renderSettingsPanel(settings, context, logger) {
  logger.info('Rendering extension settings...');
  const settingsContainer = document.getElementById('FetchRetry-container') ?? document.getElementById('extensions_settings2');
  if (!settingsContainer) {
    logger.error('Settings container not found, cannot render settings.');
    return;
  }
  logger.info('Settings container found.');

  const existingDrawer = settingsContainer.querySelector('#FetchRetry-drawer');
  if (existingDrawer) {
    logger.info('Existing settings drawer found, skipping re-render.');
    return;
  }

  const inlineDrawer = document.createElement('div');
  inlineDrawer.id = 'FetchRetry-drawer';
  inlineDrawer.classList.add('inline-drawer');
  settingsContainer.append(inlineDrawer);
  logger.info('New settings drawer created.');

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

  SETTINGS_CONFIG.forEach(setting => {
    const settingContainer = document.createElement('div');
    settingContainer.classList.add('fetch-retry-setting-item');
    createSettingItem(settingContainer, setting, settings, context, logger);
    inlineDrawerContent.appendChild(settingContainer);
    logger.debug(`Created UI item for setting: ${setting.varId}`);
  });

  inlineDrawerToggle.addEventListener('click', function () {
    this.classList.toggle('open');
    inlineDrawerIcon.classList.toggle('down');
    inlineDrawerIcon.classList.toggle('up');
    inlineDrawerContent.classList.toggle('open');
    logger.info('Settings drawer toggled.');
  });

  applyAllSettings(settings, logger);
  logger.info('Initial settings applied to UI.');
  logger.info('Extension settings rendered.');
}

export function initExtensionUI(settings, context, logger) {
  logger.info('Initializing UI elements...');
  renderSettingsPanel(settings, context, logger);
  logger.info('UI initialization complete.');
}
