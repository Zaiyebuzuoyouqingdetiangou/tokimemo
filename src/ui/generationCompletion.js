import * as core_text from '../core/text.js';

// A small, presentational bridge for pages that retain validated partial data.
// It deliberately emits only existing overlay actions; it never starts work itself.
function positiveInteger(value) {
    const count = Number(value);
    return Number.isFinite(count) && count > 0 ? Math.min(999, Math.floor(count)) : 0;
}

function safeToken(value) {
    const token = core_text.normalizeText(value, 80);
    return /^[a-z][a-z0-9-]*$/u.test(token) ? token : '';
}

function safeDataAttribute(name, value) {
    const key = core_text.normalizeText(name, 80);
    if (!/^data-rmt-[a-z0-9-]+$/u.test(key)) return '';
    return ` ${key}="${core_text.esc(core_text.normalizeText(value, 160))}"`;
}

/**
 * Render a status and one already-bound action only when the caller can prove
 * there are missing validated units. `action` and `generateMode` map to the
 * existing overlay dispatcher, so this helper has no provider or storage side effects.
 */
export function generationCompletionHtml({
    missing = 0, unit = '项内容', action = '', generateMode = '', actionData = null,
    label = '继续补全', readOnly = false, message = '', className = '',
} = {}) {
    const count = positiveInteger(missing);
    if (!count) return '';
    const safeAction = safeToken(action);
    const safeMode = safeToken(generateMode);
    const data = actionData && typeof actionData === 'object' && !Array.isArray(actionData)
        ? Object.entries(actionData).slice(0, 3).map(([name, value]) => safeDataAttribute(name, value)).join('') : '';
    const button = readOnly || (!safeAction && !safeMode) ? ''
        : `<button type="button" class="rmt-btn"${safeAction ? ` data-rmt-action="${safeAction}"` : ` data-rmt-generate-mode="${safeMode}"`}${data}>${core_text.esc(core_text.normalizeText(label, 100) || '继续补全')}</button>`;
    const copy = core_text.normalizeText(message, 220) || `还有 ${count} ${core_text.normalizeText(unit, 80) || '项内容'}未完成；已通过校验的内容保持可读。`;
    const extraClass = core_text.normalizeText(className, 80).replace(/[^a-z0-9_-]/giu, '');
    return `<section class="rmt-generation-completion${extraClass ? ` ${extraClass}` : ''}" data-rmt-generation-missing="${count}"><h3>生成与补全</h3><p role="status">${core_text.esc(copy)}</p>${button ? `<div class="rmt-generation-completion-actions">${button}</div>` : ''}</section>`;
}

export function countPendingGenerationItems(items, predicate = item => !!item?.progressPending?.length) {
    if (!Array.isArray(items) || typeof predicate !== 'function') return 0;
    return items.reduce((count, item) => count + (predicate(item) ? 1 : 0), 0);
}
