import * as text from '../core/text.js';

const pending = new Map();

// Coalesce only the same in-flight action, including buttons replaced by a
// render. No cooldown or retry quota: settling always makes it available again.
export function runRecoveryAction(button, key, operation, { label = '处理中…', title = '心迹回廊' } = {}) {
    if (pending.has(key)) return pending.get(key);
    const original = button?.textContent;
    const wasDisabled = button?.disabled === true;
    if (button) { button.disabled = true; button.textContent = label; button.setAttribute?.('aria-busy', 'true'); }
    const task = Promise.resolve().then(operation).catch(error => {
        if (error?.name !== 'AbortError') globalThis.toastr?.error?.(text.safeErrorSummary(error), title, { preventDuplicates: true });
    }).finally(() => {
        pending.delete(key);
        if (button) { button.disabled = wasDisabled; button.textContent = original; button.removeAttribute?.('aria-busy'); }
    });
    pending.set(key, task);
    return task;
}
