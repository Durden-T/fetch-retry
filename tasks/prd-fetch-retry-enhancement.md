# PRD: Fetch Retry Extension Enhancement

## Overview

Comprehensive improvement of the SillyTavern Fetch Retry extension covering new features, performance optimization, and code refactoring. The extension monkey-patches `window.fetch` to add automatic retry logic with exponential backoff for AI generation endpoints.

## Goals

- Implement stream inactivity detection to retry stalled streaming responses
- Add URL filtering with regex to selectively apply retry logic
- Refactor codebase for better maintainability and separation of concerns
- Add strict ESLint configuration for code quality enforcement
- Improve UI with reset-to-defaults functionality and modular components
- Add JSDoc type annotations throughout the codebase

## Quality Gates

These commands must pass for every user story:
- `npx eslint . --max-warnings=0` - Linting with strict config

## User Stories

### US-001: Add ESLint with strict configuration
**Description:** As a developer, I want strict linting enforced so that code quality remains consistent.

**Acceptance Criteria:**
- [ ] Create `.eslintrc.json` with strict rules (errors + style + modern ES patterns)
- [ ] Configure for browser environment with ES modules
- [ ] All existing code passes linting without errors
- [ ] Add `lint` script to package.json (create if needed)

### US-002: Create custom error types module
**Description:** As a developer, I want typed errors so that error handling is more precise and debuggable.

**Acceptance Criteria:**
- [ ] Create `src/errors.js` with custom error classes
- [ ] Implement `RetryTimeoutError` extending Error
- [ ] Implement `StreamInactivityError` extending Error
- [ ] Implement `RateLimitError` extending Error
- [ ] Implement `ServerError` extending Error
- [ ] Each error includes relevant metadata (attempt count, url, status code)

### US-003: Extract retry strategy module
**Description:** As a developer, I want retry logic separated from fetch handling so that strategies can be tested and extended independently.

**Acceptance Criteria:**
- [ ] Create `src/retry-strategy.js` module
- [ ] Extract `calculateRetryDelay()` function
- [ ] Extract `shouldRetry()` decision logic
- [ ] Extract exponential backoff calculation
- [ ] Add `getRetryReason()` helper for error categorization
- [ ] Update `fetch-retry.js` to use the new module

### US-004: Implement stream inactivity detection
**Description:** As a user, I want stalled streaming responses to be automatically retried so that I don't have to manually refresh when the AI stops responding mid-stream.

**Acceptance Criteria:**
- [ ] Implement stream monitoring using `TransformStream` or response body reader
- [ ] Track time since last data chunk received
- [ ] Abort and retry when `streamInactivityTimeout` setting is exceeded
- [ ] Only apply to streaming responses (check `content-type` or `transfer-encoding`)
- [ ] Show toast notification when stream inactivity retry occurs
- [ ] Use existing `streamInactivityTimeout` setting (default 30000ms)

### US-005: Add URL filtering with regex
**Description:** As a user, I want to specify which endpoints should use retry logic so that only AI generation requests are retried, not all fetch requests.

**Acceptance Criteria:**
- [ ] Add `urlPatterns` setting (array of regex strings)
- [ ] Add `urlFilterMode` setting: "include" (only matching) or "exclude" (skip matching)
- [ ] Default patterns include `/api/backends/`, `/api/chats/`, `/v1/chat/completions`
- [ ] Add UI for managing URL patterns (textarea with one pattern per line)
- [ ] Validate regex patterns on input, show error for invalid patterns
- [ ] Requests not matching patterns bypass retry logic entirely

### US-006: Split UI into modular components
**Description:** As a developer, I want UI code organized into smaller modules so that components are easier to maintain and test.

**Acceptance Criteria:**
- [ ] Create `src/ui/` directory
- [ ] Create `src/ui/drawer.js` for collapsible drawer component
- [ ] Create `src/ui/settings-item.js` for individual setting renderers
- [ ] Create `src/ui/index.js` as public API (re-exports)
- [ ] Update imports in `index.js` to use new paths
- [ ] Each module under 100 lines

### US-007: Add reset-to-defaults functionality
**Description:** As a user, I want to reset all settings to defaults so that I can quickly recover from misconfiguration.

**Acceptance Criteria:**
- [ ] Add "Reset to Defaults" button in settings panel
- [ ] Show confirmation dialog before resetting
- [ ] Reset all settings to `DEFAULT_SETTINGS` values
- [ ] Update UI to reflect reset values
- [ ] Persist reset settings immediately
- [ ] Show toast notification confirming reset

### US-008: Add JSDoc type annotations
**Description:** As a developer, I want type annotations so that IDE autocompletion and error detection work correctly.

**Acceptance Criteria:**
- [ ] Add JSDoc annotations to all public functions
- [ ] Define `@typedef` for Settings object
- [ ] Define `@typedef` for Logger interface
- [ ] Define `@typedef` for RetryContext (attempt, error, response)
- [ ] All function parameters and return types documented
- [ ] Enable `// @ts-check` in all files for IDE validation

### US-009: Refactor fetch-retry.js for clarity
**Description:** As a developer, I want the main fetch retry module simplified so that the core logic is easier to follow.

**Acceptance Criteria:**
- [ ] Use new error types from `src/errors.js`
- [ ] Use retry strategy from `src/retry-strategy.js`
- [ ] Extract `createRetryContext()` helper
- [ ] Reduce main function complexity (cyclomatic complexity < 15)
- [ ] Remove duplicated error handling code
- [ ] File size under 150 lines

## Functional Requirements

- FR-1: Stream inactivity detection must only apply to responses with streaming content-type
- FR-2: URL filtering must compile regex patterns once at startup, not per-request
- FR-3: Invalid regex patterns must be skipped with a console warning, not break the extension
- FR-4: Reset-to-defaults must not require page reload to take effect
- FR-5: All new settings must have sensible defaults that preserve current behavior
- FR-6: Custom errors must serialize properly for logging (include stack trace)

## Non-Goals

- Circuit breaker pattern (future enhancement)
- Retry statistics/metrics in UI (future enhancement)
- TypeScript migration (using JSDoc instead)
- Unit test framework setup
- Build/bundling step
- URL patterns import/export functionality
- Stream inactivity progress indicator

## Technical Considerations

- Maintain backwards compatibility with existing saved settings
- New settings should default to values that preserve current behavior
- Stream monitoring must not leak memory (properly clean up readers)
- URL pattern matching should be performant (pre-compile RegExp objects)
- UI components should use event delegation where possible

## Success Metrics

- All files pass strict ESLint without warnings
- No file exceeds 150 lines (excluding config)
- Cyclomatic complexity under 15 for all functions
- Stream inactivity detection correctly identifies stalled responses
- URL filtering correctly matches/excludes configured patterns
