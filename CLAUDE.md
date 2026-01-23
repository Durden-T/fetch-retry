# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fetch Retry is a SillyTavern extension that monkey-patches the browser's native `fetch` function to add automatic retry logic with exponential backoff. It handles rate limiting (429), server errors (5xx), and thinking timeouts for AI generation endpoints.

## Architecture

```
index.js                 # Entry point: initializes extension, patches window.fetch
src/
  fetch-retry.js         # Core retry logic: createRetryableFetch(), request handling
  settings.js            # Settings configuration, defaults, persistence proxy
  ui.js                  # Settings panel rendering, DOM manipulation
  toast.js               # User notifications via toastr
  logger.js              # Conditional debug logging
```

**Key Patterns:**

- **Monkey-patching**: `window.fetch` is replaced with a wrapper that adds retry logic. Original fetch is preserved and called internally.
- **Settings proxy**: Uses SillyTavern's `context.extensionSettings` for persistence, accessed via a direct object proxy (not a Proxy object).
- **Declarative UI**: Settings panel is generated from `SETTINGS_CONFIG` array in `settings.js`.

**Data Flow:**
1. `index.js` initializes settings proxy and creates logger
2. `createRetryableFetch()` wraps original fetch with retry logic
3. On failure, calculates delay using exponential backoff and Retry-After headers
4. Toast notifications show retry progress; error notifications on final failure

## SillyTavern Integration

- Uses `SillyTavern.getContext()` for settings persistence
- Uses global `toastr` for notifications
- Imports `t` from SillyTavern's i18n for localization
- UI renders into `#extensions_settings2` container

## Development Notes

- No build step required; plain ES modules loaded directly by browser
- Extension entry point defined in `manifest.json` as `index.js`
- CSS loaded dynamically based on `enabled` setting
- Debug mode enables verbose console logging with `[Fetch Retry Debug]` prefix
