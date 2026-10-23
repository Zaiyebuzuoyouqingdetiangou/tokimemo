// Per-character sticker packs. Lightweight and import-free: the bootstrap
// runtime (chat rendering, input panel, public bridge) and the bundled editor
// may each load a copy. The data lives in the character card's own extension
// field, so every device that opens this ST sees the same packs; the images are
// ordinary files the user saved in their own ST image folder.
export const STICKER_FIELD = 'hearttrace_stickers';
export const STICKER_OWNERS = Object.freeze(['char', 'user', 'pair', 'other']);
// Per-browser chat UI choice (not per character): floating rabbit or a wand-menu entry.
export const STICKER_UI_KEY = 'heartbeatMemoriesStickerUiV1';
export const STICKER_EVENTS = Object.freeze({ changed: 'hearttrace:stickers-changed' });
export const LORE_COMMENT = '心迹回廊 · 表情包';
// [表情:方祁洛·害羞] is what we teach. Models also write 【表情：害羞】,
// [表情包:方祁洛·害羞] or leave the name out; all of those still resolve.
export const STICKER_TOKEN = /[\[【]\s*表情(?:包)?\s*[:：]\s*(?:([^\]】\n·・:：]{1,40}?)\s*[·・]\s*)?([^\]】\n·・]{1,40}?)\s*[\]】]/gu;
const PAIR_LABEL = '双人', OTHER_LABEL = '其他';

const text = value => typeof value === 'string' ? value.trim() : '';
function rawContext() { try { return globalThis.SillyTavern?.getContext?.() || null; } catch { return null; } }

// Names become token parts and lorebook lines: no brackets, separators or line breaks.
export function cleanStickerName(value, max = 20) {
    return Array.from(text(value).replace(/[[\]【】:：·・|\n\r\t<>"'`]/gu, ' ').replace(/\s+/gu, ' ').trim()).slice(0, max).join('');
}
export const cleanLine = (value, max) => Array.from(text(value).replace(/[\n\r\t]+/gu, ' ').replace(/[<>]/gu, '')).slice(0, max).join('');
export function safeUrl(value) {
    const url = text(value);
    if (!url || /[\u0000-\u001f\u007f\s"'<>]/u.test(url)) return '';
    if (/^\/?user\/images\//iu.test(url)) return url.startsWith('/') ? url : `/${url}`;
    if (/^data:image\/(?:png|webp|gif|jpe?g);base64,/iu.test(url)) return url;
    return '';
}
let idSequence = 0;
export function newStickerId(prefix = 'st') {
    idSequence += 1;
    try { return `${prefix}-${globalThis.crypto.randomUUID()}`; }
    catch { return `${prefix}-${Date.now().toString(36)}-${idSequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
}

function normalizeSticker(value) {
    const name = cleanStickerName(value?.name), url = safeUrl(value?.url);
    if (!name || !url) return null;
    // base is the uncaptioned cut; url is what chats show (base plus caption, when set).
    const base = safeUrl(value?.base) || url;
    return { id: text(value.id).slice(0, 80) || newStickerId(), name, url, base,
        meaning: cleanLine(value.meaning, 60), caption: cleanLine(value.caption, 16), prompt: cleanLine(value.prompt, 400) };
}
function normalizePack(value) {
    const owner = STICKER_OWNERS.includes(value?.owner) ? value.owner : '';
    if (!owner) return null;
    const seen = new Set(), stickers = [];
    for (const row of Array.isArray(value.stickers) ? value.stickers : []) {
        const sticker = normalizeSticker(row);
        if (!sticker || seen.has(sticker.id)) continue;
        seen.add(sticker.id); stickers.push(sticker);
    }
    const cover = stickers.some(row => row.id === value.cover) ? value.cover : stickers[0]?.id || '';
    return { id: text(value.id).slice(0, 80) || newStickerId('pack'), owner, title: cleanLine(value.title, 20) || '', cover,
        style: cleanLine(value.style, 40), idea: cleanLine(value.idea, 300), createdAt: Math.max(0, Number(value.createdAt) || 0),
        // The appearance actually drawn (after any Q-version filter), so single redraws match the set.
        ...(Array.isArray(value.people) && value.people.length ? { people: value.people.slice(0, 2).map(row => ({ name: cleanLine(row?.name, 40), appearance: cleanLine(row?.appearance, 1500) })) } : {}),
        stickers };
}

export function normalizeStickerData(value) {
    const packs = [];
    for (const row of Array.isArray(value?.packs) ? value.packs : []) { const pack = normalizePack(row); if (pack) packs.push(pack); }
    // Names are unique per owner so a token always points at one picture.
    for (const owner of STICKER_OWNERS) {
        const used = new Set();
        for (const pack of packs.filter(p => p.owner === owner)) for (const sticker of pack.stickers) {
            let name = sticker.name, n = 2;
            while (used.has(name)) name = `${sticker.name.slice(0, 18)}${n++}`;
            sticker.name = name; used.add(name);
        }
    }
    // Q-version appearance filter, same choices as the couple avatars; absent = ask.
    const chibiFilter = ['auto', 'off'].includes(value?.settings?.chibiFilter) ? value.settings.chibiFilter : '';
    return { version: 1, revision: Math.max(0, Number(value?.revision) || 0), packs,
        settings: { maxOne: value?.settings?.maxOne !== false, ...(chibiFilter ? { chibiFilter } : {}) },
        lore: { book: text(value?.lore?.book).slice(0, 200), hash: text(value?.lore?.hash).slice(0, 40),
            ...(value?.lore?.unconfirmed === true ? { unconfirmed: true, submittedHash: text(value?.lore?.submittedHash).slice(0, 40) } : {}),
            ...(value?.lore?.removed === true ? { removed: true } : {}),
            ...(value?.lore?.legacyPreserved === true ? { legacyPreserved: true } : {}) } };
}

function characterOf(context) {
    if (!context || context.groupId) return null;
    const id = context.characterId;
    if (id === undefined || id === null || id === '') return null;
    return context.characters?.[id] || null;
}
export function stickerScope(context = rawContext()) {
    const card = characterOf(context);
    return card ? text(card.avatar || card.data?.avatar) || text(context.name2) : '';
}
export function readStickerData(context = rawContext()) {
    return normalizeStickerData(readStickerField(STICKER_FIELD, context));
}

// A legacy host can mutate its card optimistically even when HTTP persistence
// fails. Keep only this plugin's last confirmed fields visible until a fresh
// card object or a confirmed retry supplies an authoritative value.
const UNCONFIRMED_FIELDS = Symbol.for('Hearttrace.stickerUnconfirmedFields.v1');
function unconfirmedFields() { return globalThis[UNCONFIRMED_FIELDS] || (globalThis[UNCONFIRMED_FIELDS] = new Map()); }
function fieldKey(context, field) { return JSON.stringify([stickerScope(context), field]); }
export function readStickerField(field, context = rawContext()) {
    const card = characterOf(context), key = fieldKey(context, field), pending = unconfirmedFields().get(key);
    if (pending?.card === card) return pending.value;
    if (pending) unconfirmedFields().delete(key);
    return card?.data?.extensions?.[field];
}
function sameField(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameField(a[key], b[key]));
}
function saveError(unconfirmed = false, field = STICKER_FIELD) {
    const message = field === 'world'
        ? unconfirmed ? '世界书关联已提交，但未能确认。请刷新酒馆后检查主世界书选择。' : '未能保存世界书关联，请检查主世界书选择后重试。'
        : unconfirmed ? '已提交，但未能确认保存。仍显示上次确认的表情内容，请稍后重试。' : '表情内容未能保存，原内容已保留，请稍后重试。';
    return Object.assign(new Error(message), { code: unconfirmed ? 'RMT_STICKER_SAVE_UNCONFIRMED' : 'RMT_STICKER_SAVE', safeToDisplay: true, safeUserMessage: message });
}
export async function writeConfirmedStickerField(field, value, context = rawContext()) {
    if (![STICKER_FIELD, 'world'].includes(field)) throw saveError();
    const card = characterOf(context), avatar = text(card?.avatar || card?.data?.avatar), id = context?.characterId;
    if (!card || !avatar) throw changedTarget();
    const key = fieldKey(context, field), previous = structuredClone(readStickerField(field, context));
    const bound = () => context.characterId === id && stickerScope(context) === avatar;
    const bulk = typeof context.writeExtensionFieldBulk === 'function';
    if (bulk) {
        let result;
        try { result = await context.writeExtensionFieldBulk([avatar], field, value); } catch { throw saveError(false, field); }
        if (!bound()) throw changedTarget();
        if (!Array.isArray(result?.updated) || result.updated.length !== 1 || result.updated[0] !== avatar
            || !Array.isArray(result.failed) || result.failed.length
            || !Array.isArray(result.skipped) || result.skipped.length) throw saveError(false, field);
    } else {
        if (typeof context.writeExtensionField !== 'function') throw saveError(false, field);
        try { await context.writeExtensionField(id, field, value); } catch { /* A fresh read can still confirm a committed request. */ }
        if (!bound()) throw changedTarget();
    }
    // World selection can be changed by the user outside this plugin's queue.
    // Even a successful bulk response may arrive after a newer selection and
    // overwrite the host's local field. Reload through the public API before
    // confirming the binding, and leave that authoritative object untouched.
    if (!bulk || field === 'world') {
        const optimistic = characterOf(context);
        try { await context.getOneCharacter?.(avatar); } catch { /* Keep the confirmed plugin value below. */ }
        if (!bound()) throw changedTarget();
        const refreshed = characterOf(context);
        if (refreshed === optimistic) {
            unconfirmedFields().set(key, { card: refreshed, value: previous });
            throw saveError(true, field);
        }
        unconfirmedFields().delete(key);
        if (!sameField(refreshed?.data?.extensions?.[field], value)) {
            if (field === 'world') throw changedTarget();
            throw saveError();
        }
        if (field === 'world') return value;
    }
    unconfirmedFields().delete(key);
    const latest = characterOf(context);
    latest.data = latest.data || {}; latest.data.extensions = latest.data.extensions || {};
    latest.data.extensions[field] = value;
    return value;
}

export function ownerLabel(owner, context = rawContext()) {
    if (owner === 'char') return cleanStickerName(context?.name2 || characterOf(context)?.name, 40) || '角色';
    if (owner === 'user') return cleanStickerName(context?.name1, 40) || '我';
    return owner === 'pair' ? PAIR_LABEL : OTHER_LABEL;
}
export function stickerToken(owner, name, context = rawContext()) {
    return `[表情:${ownerLabel(owner, context)}·${cleanStickerName(name)}]`;
}
function ownerFromLabel(label, context) {
    const value = cleanStickerName(label, 40);
    for (const owner of STICKER_OWNERS) if (ownerLabel(owner, context) === value) return owner;
    if (value === '我' || value === 'user' || value === '{{user}}') return 'user';
    if (value === 'char' || value === '{{char}}') return 'char';
    return '';
}
export function resolveSticker(ownerText, nameText, context = rawContext(), data = readStickerData(context)) {
    const name = cleanStickerName(nameText);
    if (!name) return null;
    // No name before the dot: the character's own first, then shared, then the user's.
    if (!cleanStickerName(ownerText, 40)) {
        for (const owner of ['char', 'pair', 'other', 'user']) {
            const hit = resolveSticker(ownerLabel(owner, context), name, context, data);
            if (hit) return hit;
        }
        return null;
    }
    const owner = ownerFromLabel(ownerText, context);
    if (!owner) return null;
    for (const pack of data.packs) if (pack.owner === owner) {
        const sticker = pack.stickers.find(row => row.name === name);
        if (sticker) return { ...sticker, owner, pack: pack.id };
    }
    return null;
}
export function allStickers(data, owner = '') {
    return data.packs.filter(pack => !owner || pack.owner === owner).flatMap(pack => pack.stickers.map(sticker => ({ ...sticker, owner: pack.owner, pack: pack.id })));
}

// Floating rabbit on by default; off moves the entry into ST's magic-wand menu.
export function stickerFloatEnabled(context = rawContext()) {
    return context?.extensionSettings?.[STICKER_UI_KEY]?.float !== false;
}
export function setStickerFloat(on, context = rawContext()) {
    if (!context?.extensionSettings) throw new Error('酒馆设置还没准备好，稍后再试。');
    context.extensionSettings[STICKER_UI_KEY] = { ...(context.extensionSettings[STICKER_UI_KEY] || {}), float: !!on };
    context.saveSettingsDebounced?.();
    emit(STICKER_EVENTS.changed);
    return !!on;
}

function emit(type) {
    try { globalThis.dispatchEvent?.(new CustomEvent(type)); } catch { /* No DOM events in tests. */ }
}
const STICKER_WRITES = Symbol.for('Hearttrace.stickerWrites.v1');
function writeQueues() {
    // Chat bootstrap and full runtime can import separate copies of this file.
    return globalThis[STICKER_WRITES] || (globalThis[STICKER_WRITES] = new Map());
}
function changedTarget() {
    return Object.assign(new Error('角色或表情已变化，这次修改没有覆盖现有内容。'), { code: 'RMT_STICKER_CHANGED', safeToDisplay: true, safeUserMessage: '角色或表情已变化，这次修改没有覆盖现有内容。' });
}

// Queue changes, not precomputed snapshots. Each change sees the last confirmed
// card write, including changes made while this operation was waiting.
export function updateStickerData(mutate, context = rawContext(), { isCurrent = null } = {}) {
    const card = characterOf(context);
    if (!card || typeof context.writeExtensionField !== 'function' && typeof context.writeExtensionFieldBulk !== 'function') return Promise.reject(new Error('请先打开一个单人角色聊天，再保存表情包。'));
    const scope = stickerScope(context), id = context.characterId, queues = writeQueues();
    // Hosts may refresh the card object after writing; stable character identity
    // matters, not whether the object instance is the same one we first read.
    const bound = () => !!characterOf(context) && context.characterId === id && stickerScope(context) === scope;
    const pending = (queues.get(scope) || Promise.resolve()).catch(() => {}).then(async () => {
        if (!bound() || (isCurrent && !isCurrent())) throw changedTarget();
        const previous = readStickerData(context), value = mutate(previous);
        if (value == null) return null; // Deleted targets are never recreated by late edits.
        const data = normalizeStickerData({ ...value, revision: Math.max(Date.now(), previous.revision + 1) });
        if (!bound() || (isCurrent && !isCurrent())) throw changedTarget();
        await writeConfirmedStickerField(STICKER_FIELD, data, context);
        if (!bound()) throw changedTarget();
        // A newer queued edit may now be waiting. Publish this confirmed state
        // before it reads, even if its own UI has since been closed.
        const latestCard = characterOf(context);
        latestCard.data = latestCard.data || {}; latestCard.data.extensions = latestCard.data.extensions || {};
        latestCard.data.extensions[STICKER_FIELD] = data;
        emit(STICKER_EVENTS.changed);
        return data;
    });
    queues.set(scope, pending);
    pending.finally(() => { if (queues.get(scope) === pending) queues.delete(scope); }).catch(() => {});
    return pending;
}

export function writeStickerData(value, context = rawContext()) {
    return updateStickerData(() => value, context);
}

// One constant entry in the character's lorebook: what each sticker means,
// used only in messages sent on a phone or other device inside the story. Earlier builds also wrote a
// probability "nudge" entry; its comment is kept so it can be cleaned up.
export const LORE_NUDGE_COMMENT = '心迹回廊 · 表情包 · 这次发表情';
function stickerExample(data, context) {
    const row = allStickers(data, 'char')[0] || allStickers(data, 'pair')[0] || allStickers(data, 'other')[0];
    return row ? `[表情:${ownerLabel(row.owner, context)}·${row.name}]` : '';
}
// Values sit inside "…" in the entry; keep them on one line and free of quotes.
const loreValue = value => String(value || '').replace(/[\r\n]+/gu, ' ').replace(/["“”]/gu, "'").replace(/\s+/gu, ' ').trim();
// Same shape as hand-written lorebook settings: a named tag around YAML-like
// fields, so the model reads it as one coherent rule set rather than prose.
export function stickerLoreContent(data, context = rawContext()) {
    const charName = ownerLabel('char', context), userName = ownerLabel('user', context);
    const rows = owner => allStickers(data, owner).map(row => `      - "${loreValue(row.meaning ? `${row.name}：${row.meaning}` : row.name)}"`);
    const own = rows('char'), pair = rows('pair'), other = rows('other'), user = rows('user');
    if (!own.length && !pair.length && !other.length && !user.length) return '';
    const sendable = own.length || pair.length || other.length;
    const lines = ['<表情包>', '', 'sticker_rules:'];
    if (sendable) {
        lines.push(`  who_sends: "${loreValue(charName)}"`,
            `  when: "${loreValue(`剧情里写到${charName}用手机或其他通讯设备发消息（聊天软件、短信、私信、评论等）时，可以在这些消息里发贴合情绪的表情：跟在那条消息后面，或者单独作为一条消息。不用每条消息都发。`)}"`,
            `  format: "[表情:名字·表情名]"`,
            `  example: "${loreValue(stickerExample(data, context))}"`,
            '  limits:',
            '    - "正文叙述和当面说话时不发表情，表情只出现在设备上的消息里。"',
            '    - "只能用下面列出的表情，名字和表情名照抄，不编新的，不写图片地址，也不解释为什么发。"');
    } else lines.push(`  who_sends: "${loreValue(`${charName}自己没有表情包，不发表情。`)}"`);
    if (sendable) {
        lines.push('', 'sendable_stickers:');
        if (own.length) lines.push(`  "${loreValue(charName)}":`, `    note: "${loreValue(`${charName}自己的表情，写 [表情:${charName}·表情名]`)}"`, '    list:', ...own);
        if (pair.length) lines.push('  "双人":', '    note: "两人都能发，写 [表情:双人·表情名]"', '    list:', ...pair);
        if (other.length) lines.push('  "其他":', '    note: "两人都能发，写 [表情:其他·表情名]"', '    list:', ...other);
    }
    if (user.length || own.length) {
        lines.push('', 'reading_user_stickers:');
        if (user.length) lines.push(`  "${loreValue(userName)}":`, '    list:', ...user,
            `    meaning: "${loreValue(`${userName}发来的 [表情:${userName}·表情名] 代表${userName}此刻的情绪，看懂并接住这份情绪；不要替${userName}发${userName}的表情。`)}"`);
        if (own.length) lines.push(`  borrowed: "${loreValue(`${userName}也可能拿${charName}的表情来发（同样写 [表情:${charName}·表情名]），那是借${charName}的样子逗${charName}或撒娇，照常接住。`)}"`);
    }
    lines.push('</表情包>');
    return lines.join('\n');
}

// Small, stable fingerprint so the editor can tell whether the lorebook entry
// still matches the packs. Not a security hash.
export function loreHash(content) {
    let h = 2166136261;
    for (const ch of String(content || '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return content ? h.toString(36) : '';
}
