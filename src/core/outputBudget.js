// The UI value is a requested output allowance, not a model capability.
// Keep positive safe integers exactly; missing/invalid persisted values use the default.
// Response-size, timeout, cancellation and storage protections are separate contracts.
import * as constants from './constants.js';
export function isValidOutputTokens(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return false;
    if (typeof value === 'string' && !value.trim()) return false;
    const count = Number(value);
    return Number.isSafeInteger(count) && count > 0;
}
export function normalizeOutputTokens(value) {
    return isValidOutputTokens(value) ? Number(value) : constants.DEFAULT_SETTINGS.maxTokens;
}
