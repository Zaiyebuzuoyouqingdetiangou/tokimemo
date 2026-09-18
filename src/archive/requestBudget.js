import * as output_budget from '../core/outputBudget.js';
// Archive-only accounting of the exact request. No provider calls, model changes,
// output reductions, character-to-token conversion, or automatic retries.
import * as constants from '../core/constants.js';
import * as settingsApi from '../core/settings.js';
import * as text from '../core/text.js';
import * as tags from '../core/contextTags.js';
import * as creative from '../core/creativeSupplement.js';
import * as digest from '../core/digest.js';
const encoder = new TextEncoder();
const hash = value => digest.sha256Bytes(encoder.encode(value));

export function requestedOutput(context) {
    const settings = settingsApi.getPluginSettings(context);
    return output_budget.normalizeOutputTokens(settings.maxTokens);
}

export function composeArchiveRequest(context, prompt, contextEnvelope) {
    const settings = settingsApi.getPluginSettings(context);
    const expanded = tags.filterJsonPromptStrings(text.expandSafeRoleMacros(prompt, context), tags.tagPolicyForSettings(settings));
    return `${contextEnvelope}\n${expanded}${creative.creativeSupplementBlock(settings)}`;
}

async function count(context, value, signal) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (typeof context.getTokenCountAsync !== 'function') return null;
    // This is the host's tokenizer, not a claimed exact tokenizer for the independent
    // provider. On timeout the result stays unknown; never label characters as tokens.
    return new Promise((resolve, reject) => {
        let done = false;
        const finish = (error, value) => {
            if (done) return; done = true; clearTimeout(timer);
            signal?.removeEventListener?.('abort', abort);
            if (error) reject(error); else resolve(value);
        };
        const abort = () => finish(new DOMException('Cancelled', 'AbortError'));
        const timer = setTimeout(() => finish(null, null), 1500);
        signal?.addEventListener?.('abort', abort, { once: true });
        Promise.resolve().then(() => context.getTokenCountAsync(value)).then(raw => {
            const number = typeof raw === 'number' || (typeof raw === 'string' && raw.trim()) ? Number(raw) : NaN;
            finish(null, Number.isFinite(number) && number >= 0 ? number : null);
        }, () => finish(null, null));
    });
}

export async function measureArchiveRequest(context, actualPrompt, { signal = null, confirmedLimits = null, stamp = null, tokenCountState = null } = {}) {
    const requestHash = hash(actualPrompt);
    const outputTokens = requestedOutput(context);
    // Reuse a locally measured token count only for the identical full request and
    // unchanged output setting. The provider configuration guard still runs normally.
    const inputTokens = stamp?.requestHash === requestHash && stamp.outputTokens === outputTokens
        ? stamp.inputTokens : tokenCountState?.unavailable ? null : await count(context, actualPrompt, signal);
    if (inputTokens === null && tokenCountState) tokenCountState.unavailable = true;
    const known = key => Number.isFinite(confirmedLimits?.[key]) && confirmedLimits[key] > 0 ? confirmedLimits[key] : null;
    const contextTokens = known('contextTokens'), maximumOutputTokens = known('maximumOutputTokens');
    const utf16Chars = actualPrompt.length;
    const result = { requestHash, utf16Chars, unicodeCharacters: Array.from(actualPrompt).length,
        utf8Bytes: encoder.encode(actualPrompt).byteLength, inputTokens,
        tokenBasis: inputTokens === null ? 'unavailable' : 'host-tokenizer-estimate', outputTokens,
        combinedTokens: inputTokens === null ? null : inputTokens + outputTokens,
        contextTokens, maximumOutputTokens, exceeded: null };
    if (maximumOutputTokens && outputTokens > maximumOutputTokens) result.exceeded = 'output';
    else if (contextTokens && result.combinedTokens !== null && result.combinedTokens > contextTokens) result.exceeded = 'context';
    // Unknown model capacity stays unknown. The host tokenizer is diagnostic,
    // not a universal 32k input limit; characters are not model tokens either.
    // Source batching and storage keep their independent, existing resource bounds.
    return result;
}

export function publicBudget(value) {
    // Whitelist only numeric measurements, never raw prompts, URL, model, keys or hash.
    return Object.fromEntries(['utf16Chars', 'unicodeCharacters', 'utf8Bytes', 'inputTokens', 'outputTokens',
        'combinedTokens', 'contextTokens', 'maximumOutputTokens', 'tokenBasis', 'exceeded'].map(key => [key, value[key]]));
}

export function assertArchiveRequestBudget(value) {
    if (!value.exceeded) return;
    const error = text.safeUserError('完整建档请求超过预算，尚未发送；来源保留。',
        value.exceeded === 'output' ? 'RMT_ARCHIVE_OUTPUT_BUDGET' : 'RMT_ARCHIVE_CONTEXT_BUDGET');
    error.archiveBudget = publicBudget(value);
    throw error;
}
