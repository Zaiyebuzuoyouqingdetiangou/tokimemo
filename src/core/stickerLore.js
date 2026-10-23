// Writes the one 心迹回廊 sticker entry into the character's own lorebook.
// Import-light (only the sticker store) so the chat bootstrap can keep an
// already written entry current after an update, without the full runtime.
import * as store from './stickerStore.js';

const text = value => typeof value === 'string' ? value.trim() : '';
const LORE_WRITES = Symbol.for('Hearttrace.stickerLoreWrites.v1');
const BOOK_WRITES = Symbol.for('Hearttrace.stickerBookWrites.v1');
const OWNER_FIELD = 'hearttraceStickerOwner';
function queue(symbol, key, action) {
    const queues = globalThis[symbol] || (globalThis[symbol] = new Map());
    const pending = (queues.get(key) || Promise.resolve()).catch(() => {}).then(action);
    queues.set(key, pending);
    pending.finally(() => { if (queues.get(key) === pending) queues.delete(key); }).catch(() => {});
    return pending;
}
function queueLore(context, action) {
    const scope = store.stickerScope(context), id = context?.characterId;
    const assertTarget = () => {
        if (!scope || context?.characterId !== id || store.stickerScope(context) !== scope) {
            throw safeError('角色已改变，本次世界书操作已停止。', 'RMT_STICKER_CHANGED');
        }
    };
    return queue(LORE_WRITES, scope, () => { assertTarget(); return action(assertTarget); });
}
function filterName(context) {
    const card = context?.characters?.[context?.characterId];
    return text(card?.avatar || card?.data?.avatar).replace(/\.[^/.]+$/, '');
}
function safeError(message, code) { return Object.assign(new Error(message), { code, safeToDisplay: true, safeUserMessage: message }); }
function raw() { return globalThis.SillyTavern?.getContext?.() || null; }
export function primaryBook(context) {
    return text(store.readStickerField('world', context));
}
export function loreState(data, context = raw()) {
    const book = primaryBook(context), content = store.stickerLoreContent(data, context);
    const tracked = !!data.lore.book && data.lore.book === book, written = tracked && !data.lore.removed;
    const unconfirmed = tracked && data.lore.unconfirmed === true;
    // A submitted hash deduplicates unchanged work; it is never proof of a
    // durable host save. Keep removed submissions inactive until an explicit write.
    const comparedHash = unconfirmed ? data.lore.submittedHash : data.lore.hash;
    return { book, tracked, written, unconfirmed, removed: tracked && !!data.lore.removed, content,
        stale: written && comparedHash !== store.loreHash(content), empty: !content };
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
        owned: { ignoreBudget: true, [OWNER_FIELD]: store.stickerScope(context),
            characterFilter: { names: [filterName(context)], tags: [], isExclude: false } } };
}
function ownedEntries(book, comment, data, context, name) {
    const scope = store.stickerScope(context), filter = filterName(context);
    const rows = Object.entries(book?.entries || {}).filter(([, entry]) => entry?.comment === comment);
    const owned = rows.filter(([, entry]) => entry[OWNER_FIELD] === scope);
    if (owned.length) return owned;
    // Older entries have no owner. Never claim a foreign/excluded/shared filter.
    // Unfiltered legacy data is adopted only with an exact local receipt and a
    // single card binding this book. Ambiguous records remain untouched.
    if (data.lore.book !== name || !data.lore.hash || comment !== store.LORE_COMMENT) return [];
    const content = store.stickerLoreContent(data, context);
    const boundCards = (context.characters || []).filter(card => text(card?.data?.extensions?.world) === name);
    return rows.filter(([, entry]) => {
        if (entry[OWNER_FIELD] || entry.content !== content || store.loreHash(entry.content) !== data.lore.hash) return false;
        const gate = entry.characterFilter;
        if (gate) return gate.isExclude === false && Array.isArray(gate.names) && gate.names.length === 1
            && gate.names[0] === filter && (!gate.tags || Array.isArray(gate.tags) && gate.tags.length === 0);
        return boundCards.length === 1 && boundCards[0] === context.characters[context.characterId];
    });
}
function hasLegacyEntries(book) {
    return Object.values(book?.entries || {}).some(entry => !entry?.[OWNER_FIELD]
        && [store.LORE_COMMENT, store.LORE_NUDGE_COMMENT].includes(entry?.comment));
}
function readError() {
    return safeError('未能读取原世界书，已停止操作。请检查世界书或重新选择主世界书后重试。', 'RMT_STICKER_LORE_READ');
}
function validBook(book) {
    return !!book && typeof book === 'object' && !Array.isArray(book)
        && !!book.entries && typeof book.entries === 'object' && !Array.isArray(book.entries);
}
async function saveBook(context, name, book) {
    await context.saveWorldInfo(name, book, true);
    try { await context.updateWorldInfoList?.(); } catch { /* List refresh is cosmetic. */ }
    try { context.reloadWorldInfoEditor?.(name); } catch { /* Editor refresh is cosmetic. */ }
}

// Append or update one entry in the character's own lorebook. When the card has
// none yet, make one named after the character and bind it as primary.
async function writeStickerLoreNow(context, assertTarget) {
    if (typeof context?.loadWorldInfo !== 'function' || typeof context?.saveWorldInfo !== 'function') {
        throw safeError('这个酒馆版本不能从插件写世界书，请更新酒馆后再试。', 'RMT_STICKER_LORE_HOST');
    }
    if (!filterName(context)) throw safeError('未能确认角色文件，本次世界书操作已停止。', 'RMT_STICKER_CHANGED');
    const originalBook = primaryBook(context);
    // The host cannot prove absence: both its read and list refresh can silently
    // fail. A new destination gets its own unique name, never an existing shared
    // human-readable name inferred to be empty from a stale list.
    const name = originalBook || `${store.ownerLabel('char', context)}的表情包-${store.newStickerId('hb')}`.replace(/[\\/:*?"<>|]/gu, '');
    // A book can belong to several cards. Lock its entire read-modify-save,
    // including creation, across bootstrap/runtime copies and character queues.
    return queue(BOOK_WRITES, name, async () => {
        const assertBook = () => {
            assertTarget();
            if (primaryBook(context) !== originalBook) throw safeError('主世界书已改变，本次操作已停止。', 'RMT_STICKER_CHANGED');
        };
        assertBook();
        const data = store.readStickerData(context);
        if (!store.stickerLoreContent(data, context)) throw safeError('还没有表情，先做一组再写进世界书。', 'RMT_STICKER_LORE_EMPTY');
        // A failed read is never an empty book. Clone so a failed save cannot
        // mutate a host-owned cache object through the read result.
        let loaded = await context.loadWorldInfo(name);
        assertBook();
        if (!originalBook) {
            // Even a known collision in the generated name is never overwritten.
            const names = context.getWorldInfoNames?.();
            if (loaded != null || Array.isArray(names) && names.includes(name)) throw readError();
            loaded = { entries: {} };
        }
        if (!validBook(loaded)) throw readError();
        const book = structuredClone(loaded);
        const template = await entryTemplate();
        assertBook();
        const spec = loreEntry(data, context), found = ownedEntries(book, spec.comment, data, context, name)[0];
        if (found) {
            const current = { ...structuredClone(template), ...found[1] };
            if (!Array.isArray(found[1].triggers)) current.triggers = [...REPLY_TRIGGERS];
            if (found[1].position === 1 && (found[1].depth ?? 4) === 4) Object.assign(current, LORE_PLACEMENT);
            if (current.useProbability && current.probability !== 100) current.probability = 100;
            book.entries[found[0]] = { ...current, content: spec.content, ...spec.owned };
        } else {
            const uid = freeUid(book.entries);
            book.entries[uid] = { uid, ...structuredClone(template), ...spec.fresh, ...spec.owned, comment: spec.comment, content: spec.content, displayIndex: uid };
        }
        for (const [uid] of ownedEntries(book, store.LORE_NUDGE_COMMENT, data, context, name)) delete book.entries[uid];
        const legacyPreserved = hasLegacyEntries(book);
        assertBook();
        await saveBook(context, name, book);
        assertBook();
        if (!originalBook) {
            await store.writeConfirmedStickerField('world', name, context);
            assertTarget();
            if (primaryBook(context) !== name) {
                throw safeError('主世界书已改变，新建的书已保留，没有替换当前选择。', 'RMT_STICKER_CHANGED');
            }
        }
        const hash = store.loreHash(spec.content);
        // saveWorldInfo resolves even on HTTP errors. Record the submission
        // separately instead of presenting an unacknowledged write as saved.
        await store.updateStickerData(current => ({ ...current, lore: { book: name, hash: '', submittedHash: hash, unconfirmed: true, legacyPreserved } }), context);
        return { book: name, created: !originalBook, legacyPreserved, unconfirmed: true };
    });
}

async function removeStickerLoreNow(context, assertTarget) {
    const data = store.readStickerData(context), name = data.lore.book;
    let legacyPreserved = false;
    if (name && (typeof context?.loadWorldInfo !== 'function' || typeof context?.saveWorldInfo !== 'function')) throw readError();
    if (name && typeof context?.loadWorldInfo === 'function') {
        await queue(BOOK_WRITES, name, async () => {
            assertTarget();
            const loaded = await context.loadWorldInfo(name);
            assertTarget();
            if (!validBook(loaded)) throw readError();
            const book = structuredClone(loaded);
            let changed = false;
            for (const comment of [store.LORE_COMMENT, store.LORE_NUDGE_COMMENT]) {
                for (const [uid] of ownedEntries(book, comment, data, context, name)) {
                    delete book.entries[uid]; changed = true;
                }
            }
            legacyPreserved = hasLegacyEntries(book);
            // A previous unacknowledged removal may only have changed the host
            // cache. An explicit retry must submit it again even if no row remains.
            if (changed || data.lore.unconfirmed) await saveBook(context, name, book);
            assertTarget();
        });
    }
    await store.updateStickerData(current => ({ ...current, lore: name
        ? { book: name, hash: '', submittedHash: '', unconfirmed: true, removed: true, legacyPreserved }
        : { book: '', hash: '', legacyPreserved } }), context);
    return name;
}

// After any edit: keep already written entries current; never create them.
export function writeStickerLore(context = raw()) {
    return queueLore(context, assertTarget => writeStickerLoreNow(context, assertTarget));
}

export function removeStickerLore(context = raw()) {
    return queueLore(context, assertTarget => removeStickerLoreNow(context, assertTarget));
}

export function refreshStickerLore(context = raw()) {
    return queueLore(context, async assertTarget => {
        const data = store.readStickerData(context), state = loreState(data, context);
        if (!state.written || !state.stale) return false;
        if (state.empty) { await removeStickerLoreNow(context, assertTarget); return true; }
        await writeStickerLoreNow(context, assertTarget); return true;
    });
}

