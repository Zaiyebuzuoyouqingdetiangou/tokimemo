// Per-character sticker packs. Lightweight and import-free: the bootstrap
// runtime (chat rendering, input panel, public bridge) and the bundled editor
// may each load a copy. The data lives in the character card's own extension
// field, so every device that opens this ST sees the same packs; the images are
// ordinary files the user saved in their own ST image folder.
export const STICKER_FIELD = 'hearttrace_stickers';
export const STICKER_OWNERS = Object.freeze(['char', 'user', 'pair', 'other']);
export const STICKER_FREQUENCIES = Object.freeze({ rare: '很少', sometimes: '偶尔', often: '常常' });
export const STICKER_EVENTS = Object.freeze({ ready: 'hearttrace:stickers-ready', changed: 'hearttrace:stickers-changed' });
export const LORE_COMMENT = '心迹回廊 · 表情包';
// [表情:方祁洛·害羞]. Full-width colon and either middle dot are accepted.
export const STICKER_TOKEN = /\[表情[:：]\s*([^\]\n·・]{1,40}?)\s*[·・]\s*([^\]\n]{1,40}?)\s*\]/gu;
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
    const frequency = Object.hasOwn(STICKER_FREQUENCIES, value?.settings?.frequency) ? value.settings.frequency : 'sometimes';
    // Q-version appearance filter, same choices as the couple avatars; absent = ask.
    const chibiFilter = ['auto', 'off'].includes(value?.settings?.chibiFilter) ? value.settings.chibiFilter : '';
    return { version: 1, revision: Math.max(0, Number(value?.revision) || 0), packs,
        settings: { frequency, maxOne: value?.settings?.maxOne !== false, ...(chibiFilter ? { chibiFilter } : {}) },
        lore: { book: text(value?.lore?.book).slice(0, 200), hash: text(value?.lore?.hash).slice(0, 40) } };
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
    return normalizeStickerData(characterOf(context)?.data?.extensions?.[STICKER_FIELD]);
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
    const owner = ownerFromLabel(ownerText, context), name = cleanStickerName(nameText);
    if (!owner || !name) return null;
    for (const pack of data.packs) if (pack.owner === owner) {
        const sticker = pack.stickers.find(row => row.name === name);
        if (sticker) return { ...sticker, owner, pack: pack.id };
    }
    return null;
}
export function allStickers(data, owner = '') {
    return data.packs.filter(pack => !owner || pack.owner === owner).flatMap(pack => pack.stickers.map(sticker => ({ ...sticker, owner: pack.owner, pack: pack.id })));
}

// The public, read-only shape other plugins (兔子镜) consume. No card data.
export function stickerSnapshot(context = rawContext()) {
    const scope = stickerScope(context);
    if (!scope) return null;
    const data = readStickerData(context);
    const stickers = allStickers(data).map(row => ({ key: `${ownerLabel(row.owner, context)}·${row.name}`, owner: row.owner, name: row.name, meaning: row.meaning, url: row.url }));
    if (!stickers.length) return null;
    return { version: 1, scope, revision: String(data.revision), owners: { char: ownerLabel('char', context), user: ownerLabel('user', context) }, stickers };
}

function emit(type) {
    try { globalThis.dispatchEvent?.(new CustomEvent(type)); } catch { /* No DOM events in tests. */ }
}
export async function writeStickerData(value, context = rawContext()) {
    const card = characterOf(context);
    if (!card || typeof context.writeExtensionField !== 'function') throw new Error('请先打开一个单人角色聊天，再保存表情包。');
    const previous = readStickerData(context);
    const data = normalizeStickerData({ ...value, revision: Math.max(Date.now(), previous.revision + 1) });
    await context.writeExtensionField(context.characterId, STICKER_FIELD, data);
    // Keep the in-memory card current even on hosts that only persist remotely.
    card.data = card.data || {}; card.data.extensions = card.data.extensions || {};
    card.data.extensions[STICKER_FIELD] = data;
    emit(STICKER_EVENTS.changed);
    return data;
}

const FREQUENCY_TEXT = { rare: '很少发表情，只在情绪特别强烈时偶尔发一个', sometimes: '偶尔才发表情，不是每条都发', often: '可以常常发表情，但不要每句都发' };
// One lorebook entry: names and one-line meanings only, never image paths.
export function stickerLoreContent(data, context = rawContext()) {
    const charName = ownerLabel('char', context), userName = ownerLabel('user', context);
    const list = owner => allStickers(data, owner).map(row => row.meaning ? `${row.name}（${row.meaning}）` : row.name).join('、');
    const lines = [];
    const own = list('char'), pair = list('pair'), other = list('other'), user = list('user');
    if (!own && !pair && !other && !user) return '';
    lines.push(`【表情包】${charName}想用表情表达情绪时，可以单独一行写 [表情:名字·表情名]，例如 [表情:${charName}·${allStickers(data, 'char')[0]?.name || allStickers(data, 'pair')[0]?.name || '开心'}]。${FREQUENCY_TEXT[data.settings.frequency]}${data.settings.maxOne ? '，一条消息最多一个' : ''}。只能用下面列出的表情，不编新的，不写图片地址。`);
    if (own) lines.push(`${charName}的表情：${own}。${userName}也可能拿这些表情来发（同样写 [表情:${charName}·表情名]），那是借${charName}的样子逗${charName}或撒娇，照常接住。`);
    if (pair) lines.push(`双人表情（两人都能发，写 [表情:双人·表情名]）：${pair}。`);
    if (other) lines.push(`其他表情（两人都能发，写 [表情:其他·表情名]）：${other}。`);
    if (user) lines.push(`${userName}发来的 [表情:${userName}·表情名] 代表${userName}此刻的情绪：${user}。看懂并接住这份情绪，不要替${userName}发${userName}的表情。`);
    return lines.join('\n');
}

// Small, stable fingerprint so the editor can tell whether the lorebook entry
// still matches the packs. Not a security hash.
export function loreHash(content) {
    let h = 2166136261;
    for (const ch of String(content || '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return content ? h.toString(36) : '';
}
