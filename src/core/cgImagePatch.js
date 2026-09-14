// An image result changes one existing item only. This is also the durable
// deferred payload: never replay a stale whole Album / ADV / Heart session.
import * as constants from './constants.js';
import * as text from './text.js';
import * as appearance from '../generation/cgAppearance.js';

const IMAGE_MODES = new Set([constants.MODE.ALBUM, constants.MODE.ADV, constants.MODE.HEART]);

export function normalizeCgImageUrl(value) {
    if (typeof value !== 'string' || value.length > 4096 || /[\\\u0000-\u001f\u007f]/.test(value)) return '';
    const raw = value.trim();
    if (!raw) return '';
    try {
        const base = imageResourceBase();
        const parsed = new URL(raw, base);
        if (!isSameImageHost(parsed, base)) return '';
        // A returned path is parsed again by <img>. Leading // would become a
        // different authority even if the original absolute URL was same-host.
        if (parsed.pathname.startsWith('//')) return '';
        return `${parsed.pathname}${parsed.search}${parsed.hash}`.slice(0, 4096);
    } catch { return ''; }
}

export function normalizeCgImageRecord(value) {
    if (!value || typeof value !== 'object') return null;
    const url = normalizeCgImageUrl(value.url);
    if (!url) return null;
    const promptMetadata = appearance.normalizeCgPromptMetadata(value.promptMetadata);
    return { url, prompt: text.normalizeText(value.prompt, constants.MAX_CG_IMAGE_PROMPT_CHARS),
        provider: value.provider === 'baibai-image' ? 'baibai-image' : constants.CG_IMAGE_PROVIDER,
        generatedAt: Math.max(0, Number(value.generatedAt) || 0),
        ...(promptMetadata ? { promptMetadata } : {}) };
}

export function cgItemInSession(mode, session, itemId) {
    const rows = mode === constants.MODE.ALBUM ? session?.entries : mode === constants.MODE.ADV
        ? session?.events : mode === constants.MODE.HEART ? session?.dailyStrips : null;
    return Array.isArray(rows) ? rows.find(item => item.id === itemId) || null : null;
}

export function cgItemSignature(item) {
    return JSON.stringify([item?.id, item?.title, item?.date, item?.desc, item?.cgDesc,
        item?.subtitle, item?.imagePrompt, item?.visualSeed, item?.panelCount, item?.panels,
        normalizeCgImageRecord(item?.cgImage)]);
}

export function normalizeCgImagePatch(value) {
    if (!value || value.version !== 1 || !IMAGE_MODES.has(value.mode)
        || typeof value.itemId !== 'string' || !value.itemId || value.itemId.length > 240
        || typeof value.expectedSignature !== 'string' || !value.expectedSignature || value.expectedSignature.length > 120000) return null;
    const image = normalizeCgImageRecord(value.image);
    if (!image || image.provider !== 'baibai-image' || typeof value.image.url !== 'string' || value.image.url.length > 4096) return null;
    // Deferred writes use the same strict saved-file contract as fresh results.
    // Displaying legacy same-host URLs does not grant permission to write them.
    const savedPath = savedLocalImagePath(value.image.url);
    if (!savedPath) return null;
    image.url = savedPath;
    return { version: 1, mode: value.mode, itemId: value.itemId, expectedSignature: value.expectedSignature, image };
}

export function applyCgImagePatch(session, raw) {
    const patch = normalizeCgImagePatch(raw);
    if (!patch || !session || session.kind !== patch.mode) return { status: 'invalid', session: null };
    const item = cgItemInSession(patch.mode, session, patch.itemId);
    if (!item) return { status: 'conflict', session: null };
    if (cgItemSignature(item) !== patch.expectedSignature) {
        // A durable commit can finish before its queue acknowledgment. Reopening
        // that exact result is harmless, but a newer redraw never gets replaced.
        const beforeImage = normalizeCgImageRecord(item.cgImage);
        if (JSON.stringify(beforeImage) !== JSON.stringify(patch.image)) return { status: 'conflict', session: null };
        return { status: 'already-applied', session };
    }
    const updated = JSON.parse(JSON.stringify(session));
    cgItemInSession(patch.mode, updated, patch.itemId).cgImage = patch.image;
    return { status: 'applied', session: updated };
}

// Shared host resolution for provider results, stored records and image display.
export function imageResourceBase() {
    const href = globalThis.location?.href;
    if (typeof href === 'string' && href) return href;
    const origin = globalThis.location?.origin;
    return typeof origin === 'string' && /^https?:\/\//.test(origin) ? origin + '/' : 'http://localhost/';
}

export function isSameImageHost(parsed, base) {
    try {
        const host = new URL(base);
        if (parsed.username || parsed.password || host.username || host.password) return false;
        // Same-origin is still required; the scheme allowance does not widen it.
        if (host.protocol === 'tauri:') return host.host === 'localhost' && !host.port
            && parsed.protocol === 'tauri:' && parsed.host === 'localhost' && !parsed.port;
        return ['http:', 'https:'].includes(host.protocol) && ['http:', 'https:'].includes(parsed.protocol)
            && parsed.origin === host.origin;
    } catch { return false; }
}

export function savedLocalImagePath(raw, base = imageResourceBase()) {
    if (typeof raw !== 'string' || !raw || raw.length > 4096 || /[\\\u0000-\u001f\u007f]/.test(raw)) return '';
    if (/(?:^|\/)\.{1,2}(?:\/|$)/.test(raw) || /%(?:2f|5c|2e|25|0[0-9a-f]|1[0-9a-f]|7f)/i.test(raw)) return '';
    try {
        const url = new URL(raw, base);
        if (!isSameImageHost(url, base) || url.search || url.hash || /%(?:2f|5c|2e|25|0[0-9a-f]|1[0-9a-f]|7f)/i.test(url.pathname)
            || !/^\/user\/images\/.+\.(?:png|jpe?g|webp|gif)$/i.test(url.pathname)) return '';
        return url.pathname;
    } catch { return ''; }
}
