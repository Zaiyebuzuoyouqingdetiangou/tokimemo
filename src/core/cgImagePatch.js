// An image result changes one existing item only. This is also the durable
// deferred payload: never replay a stale whole Album / ADV / Heart session.
import * as constants from './constants.js';
import * as text from './text.js';

const IMAGE_MODES = new Set([constants.MODE.ALBUM, constants.MODE.ADV, constants.MODE.HEART]);

export function normalizeCgImageUrl(value) {
    const raw = text.normalizeText(value, 4096);
    if (!raw) return '';
    try {
        const base = globalThis.location?.href || 'http://localhost/';
        const parsed = new URL(raw, base);
        if (!['http:', 'https:'].includes(parsed.protocol)) return '';
        const currentOrigin = globalThis.location?.origin;
        if (currentOrigin && parsed.origin !== currentOrigin) return '';
        return `${parsed.pathname}${parsed.search}${parsed.hash}`.slice(0, 4096);
    } catch { return ''; }
}

export function normalizeCgImageRecord(value) {
    if (!value || typeof value !== 'object') return null;
    const url = normalizeCgImageUrl(value.url);
    if (!url) return null;
    return { url, prompt: text.normalizeText(value.prompt, constants.MAX_CG_IMAGE_PROMPT_CHARS),
        provider: value.provider === 'baibai-image' ? 'baibai-image' : constants.CG_IMAGE_PROVIDER,
        generatedAt: Math.max(0, Number(value.generatedAt) || 0) };
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
    try {
        const base = globalThis.location?.href || 'http://localhost/';
        const parsed = new URL(value.image.url, base);
        if (parsed.origin !== new URL(base).origin || parsed.username || parsed.password
            || !/^\/user\/images\/.+\.(?:png|jpe?g|webp|gif)$/i.test(parsed.pathname)) return null;
    } catch { return null; }
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
