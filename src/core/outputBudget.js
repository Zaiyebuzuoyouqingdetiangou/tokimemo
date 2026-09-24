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
// The input budget is the user's requested input ceiling, not a model capability.
// Missing/invalid persisted values fall back to the current default (60,000).
export function isValidInputBudgetTokens(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return false;
    if (typeof value === 'string' && !value.trim()) return false;
    const count = Number(value);
    return Number.isSafeInteger(count)
        && count >= constants.MIN_USER_INPUT_BUDGET_TOKENS
        && count <= constants.MAX_USER_INPUT_BUDGET_TOKENS;
}
export function migratePersistedInputBudgetTokens(value) {
    if (Number(value) === constants.LEGACY_DEFAULT_INPUT_BUDGET_TOKENS) return constants.MAX_GENERATION_INPUT_TOKENS;
    return normalizeInputBudgetTokens(value);
}
export function normalizeInputBudgetTokens(value) {
    return isValidInputBudgetTokens(value) ? Number(value) : constants.MAX_GENERATION_INPUT_TOKENS;
}
export function generationInputCharCap(budgetTokens) {
    const tokens = normalizeInputBudgetTokens(budgetTokens);
    return Math.min(600000, tokens * 3);
}
