export function createLogger(getDebugMode) {
    return {
        debug: (msg, ...args) => getDebugMode() && console.log(`[Fetch Retry Debug] ${msg}`, ...args),
        info: (msg, ...args) => console.log(`[Fetch Retry] ${msg}`, ...args),
        warn: (msg, ...args) => console.warn(`[Fetch Retry] ${msg}`, ...args),
        error: (msg, ...args) => console.error(`[Fetch Retry] ${msg}`, ...args),
    };
}
