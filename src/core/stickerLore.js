// Writes the one 心迹回廊 sticker entry into the character's own lorebook.
// Import-light (only the sticker store) so the chat bootstrap can keep an
// already written entry current after an update, without the full runtime.
import * as store from './stickerStore.js';

const text = value => typeof value === 'string' ? value.trim() : '';
function safeError(message, code) { return Object.assign(new Error(message), { code, safeToDisplay: true, safeUserMessage: message }); }
function raw() { return globalThis.SillyTavern?.getContext?.() || null; }
export function primaryBook(context) {
    const card = context?.characters?.[context?.characterId];
    return text(card?.data?.extensions?.world);
}
export function loreState(data, context = raw()) {
    const book = primaryBook(context), content = store.stickerLoreContent(data, context);
    const written = !!data.lore.book && data.lore.book === book;
    return { book, written, content, stale: written && data.lore.hash !== store.loreHash(content), empty: !content };
}

// Field-for-field the same as SillyTavern's own new entry (world-info.js
// newWorldInfoEntryTemplate), so the editor shows and saves it like any other.
const ST_ENTRY_TEMPLATE = Object.freeze({ key: [], keysecondary: [], comment: '', content: '', constant: false, vectorized: false,
    selective: true, selectiveLogic: 0, addMemo: false, order: 100, position: 0, disable: false, ignoreBudget: false,
    excludeRecursion: false, preventRecursion: false, matchPersonaDescription: false, matchCharacterDescription: false,
    matchCharacterPersonality: false, matchCharacterDepthPrompt: false, matchScenario: false, matchCreatorNotes: false,
    delayUntilRecursion: 0, probability: 100, useProbability: true, depth: 4, outletName: '', group: '', groupOverride: false,
    groupWeight: 100, scanDepth: null, caseSensitive: null, matchWholeWords: null, useGroupScoring: null, automationId: '',
    role: 0, sticky: null, cooldown: null, delay: null, triggers: [] });
// Only real replies, never quiet/impersonate or other plugins' background requests.
const REPLY_TRIGGERS = Object.freeze(['normal', 'continue', 'swipe', 'regenerate']);
let hostTemplate = null;
async function entryTemplate() {
    if (hostTemplate) return hostTemplate;
    try {
        const module = await import('/scripts/world-info.js');
        if (module?.newWorldInfoEntryTemplate && typeof module.newWorldInfoEntryTemplate === 'object') hostTemplate = { ...ST_ENTRY_TEMPLATE, ...structuredClone(module.newWorldInfoEntryTemplate) };
    } catch { /* Older or non-browser hosts: the copy above. */ }
    return hostTemplate || ST_ENTRY_TEMPLATE;
}
function freeUid(entries) {
    for (let uid = 0; uid < 1000000; uid++) if (!(uid in entries)) return uid;
    return Date.now();
}
// One constant entry, placed a little before the latest messages so the
// "weave stickers into this reply" rule is still fresh when the model writes.
const LORE_PLACEMENT = Object.freeze({ position: 4, depth: 2, role: 0 });
function loreEntry(data, context) {
    return { comment: store.LORE_COMMENT, content: store.stickerLoreContent(data, context),
        fresh: { constant: true, ...LORE_PLACEMENT, order: 100, addMemo: true, excludeRecursion: true, preventRecursion: true, triggers: [...REPLY_TRIGGERS] },
        // Small, and useless if the World Info budget drops it: never let the budget cut it.
        owned: { ignoreBudget: true } };
}
function findEntry(book, comment) {
    return Object.entries(book?.entries || {}).find(([, entry]) => entry?.comment === comment) || null;
}
async function saveBook(context, name, book) {
    await context.saveWorldInfo(name, book, true);
    try { await context.updateWorldInfoList?.(); } catch { /* List refresh is cosmetic. */ }
    try { context.reloadWorldInfoEditor?.(name); } catch { /* Editor refresh is cosmetic. */ }
}

// Append or update one entry in the character's own lorebook. When the card has
// none yet, make one named after the character and bind it as primary.
export async function writeStickerLore(context = raw()) {
    if (typeof context?.loadWorldInfo !== 'function' || typeof context?.saveWorldInfo !== 'function') {
        throw safeError('这个酒馆版本不能从插件写世界书，请更新酒馆后再试。', 'RMT_STICKER_LORE_HOST');
    }
    const data = store.readStickerData(context);
    if (!store.stickerLoreContent(data, context)) throw safeError('还没有表情，先做一组再写进世界书。', 'RMT_STICKER_LORE_EMPTY');
    let name = primaryBook(context), created = false;
    if (!name) {
        name = `${store.ownerLabel('char', context)}的表情包`.replace(/[\\/:*?"<>|]/gu, '');
        const existing = await Promise.resolve(context.loadWorldInfo(name)).catch(() => null);
        await context.saveWorldInfo(name, existing?.entries ? existing : { entries: {} }, true);
        await context.writeExtensionField(context.characterId, 'world', name);
        const card = context.characters[context.characterId];
        card.data = card.data || {}; card.data.extensions = card.data.extensions || {}; card.data.extensions.world = name;
        created = true;
    }
    const book = await context.loadWorldInfo(name) || { entries: {} };
    book.entries = book.entries && typeof book.entries === 'object' ? book.entries : {};
    const template = await entryTemplate();
    const spec = loreEntry(data, context), found = findEntry(book, spec.comment);
    if (found) {
        // Fill fields an older 心迹回廊 left out; keep the user's own edits.
        const current = { ...structuredClone(template), ...found[1] };
        if (!Array.isArray(found[1].triggers)) current.triggers = [...REPLY_TRIGGERS];
        // Still where an earlier 心迹回廊 put it (after the character card): move it near the latest messages.
        if (found[1].position === 1 && (found[1].depth ?? 4) === 4) Object.assign(current, LORE_PLACEMENT);
        if (current.useProbability && current.probability !== 100 && found[1].comment === store.LORE_COMMENT) current.probability = 100;
        book.entries[found[0]] = { ...current, content: spec.content, ...spec.owned };
    } else {
        const uid = freeUid(book.entries);
        book.entries[uid] = { uid, ...structuredClone(template), ...spec.fresh, ...spec.owned, comment: spec.comment, content: spec.content, displayIndex: uid };
    }
    // The per-reply dice entry from an earlier build is no longer used.
    const nudge = findEntry(book, store.LORE_NUDGE_COMMENT);
    if (nudge) delete book.entries[nudge[0]];
    await saveBook(context, name, book);
    await store.writeStickerData({ ...data, lore: { book: name, hash: store.loreHash(store.stickerLoreContent(data, context)) } }, context);
    return { book: name, created };
}

export async function removeStickerLore(context = raw()) {
    const data = store.readStickerData(context), name = data.lore.book;
    if (name && typeof context?.loadWorldInfo === 'function') {
        const book = await context.loadWorldInfo(name);
        let changed = false;
        for (const comment of [store.LORE_COMMENT, store.LORE_NUDGE_COMMENT]) {
            const found = findEntry(book, comment);
            if (found) { delete book.entries[found[0]]; changed = true; }
        }
        if (changed) await saveBook(context, name, book);
    }
    await store.writeStickerData({ ...data, lore: { book: '', hash: '' } }, context);
    return name;
}

// After any edit: keep already written entries current; never create them.
export async function refreshStickerLore(context = raw()) {
    const data = store.readStickerData(context), state = loreState(data, context);
    if (!state.written || !state.stale) return false;
    if (state.empty) { await removeStickerLore(context); return true; }
    await writeStickerLore(context); return true;
}

