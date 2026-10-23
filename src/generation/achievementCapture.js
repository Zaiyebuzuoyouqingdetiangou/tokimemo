// 自动留忆携带成就的步骤独占本次捕获。成就字段从正文 JSON 里拆走，不改各模块原来的校验。

const SUFFIX = `
【本轮成就，和上面这份回忆写在同一次 JSON 里】
不要另起一份回复，也不要改动原有字段。在原来的 JSON 对象上增加 "achievement"：
{"title":"不超过20字","description":"一两句说明","unlockCondition":"做到或经历了什么才解锁","kind":"historical或collection","sourceMemoryAnchor":"从本轮档案锚点原样复制"}
能被本轮真实档案证明的用 historical。推演、模拟、后日谈用 collection。不要解释。`;

// The opaque handle is attached only to the logical task launched by its owner.
// Parallel modes and sibling steps cannot borrow or finish another capture.
const captures = new WeakMap();

export function armAchievementCapture({ journalPages: pages = [], charName = '', userName = '', signal = null } = {}) {
    const handle = Object.freeze({});
    const state = { packet: null, journalPacket: null,
        journalPages: Array.isArray(pages) ? pages.filter(row => row && typeof row.pageId === 'string' && typeof row.text === 'string')
            .map(row => ({ pageId: row.pageId, text: row.text })) : [],
        journalNames: { charName: charName || '角色', userName: userName || '用户' },
        signal, cancel: () => finishAchievementCapture(handle) };
    if (signal?.aborted) return handle;
    captures.set(handle, state);
    signal?.addEventListener?.('abort', state.cancel, { once: true });
    return handle;
}

export function achievementCaptureForTask(task) {
    const handle = task?.autoMemoryCapture;
    return !task?.signal?.aborted && captures.has(handle) ? handle : null;
}

function journalSuffix(state) {
    const { journalPages, journalNames } = state;
    if (!journalPages.length) return '';
    return `
【顺便给手帐写批注，同样写在这同一个 JSON 对象里】
${journalNames.userName}把下面这些片段夹进了手帐。请以${journalNames.charName}的口吻，在每一页页边各写一句批注（回忆、玩笑或心里话，不复述原文）。在原来的 JSON 对象上再增加 "journalNotes"：[{"pageId":"原样复制","text":"一句批注"}]。不要改动其他字段。
UNTRUSTED_JOURNAL_PAGES: ${JSON.stringify(journalPages)}`;
}

export function achievementCaptureArmed(handle) {
    return captures.has(handle);
}

export function achievementPromptSuffix(handle) {
    const state = captures.get(handle);
    return state ? SUFFIX + journalSuffix(state) : '';
}

export function stripAchievementField(raw, handle) {
    const state = captures.get(handle);
    if (!state || !raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    if (!Object.hasOwn(raw, 'achievement') && !Object.hasOwn(raw, 'journalNotes')) return raw;
    const copy = { ...raw };
    if (Object.hasOwn(raw, 'achievement')) { state.packet = raw.achievement; delete copy.achievement; }
    if (Object.hasOwn(raw, 'journalNotes')) { state.journalPacket = raw.journalNotes; delete copy.journalNotes; }
    return copy;
}

// 取走本轮顺便写的手帐批注（只保留请求里那几页、非空的一句）。
export function takeJournalNotes(handle) {
    const state = captures.get(handle);
    if (!state) return {};
    const { journalPages, journalPacket } = state;
    const ids = new Set(journalPages.map(row => row.pageId));
    const out = {};
    for (const row of Array.isArray(journalPacket) ? journalPacket : []) {
        const id = typeof row?.pageId === 'string' ? row.pageId : '';
        const text = typeof row?.text === 'string' ? row.text.trim() : '';
        if (ids.has(id) && text && !out[id]) out[id] = text;
    }
    state.journalPacket = null;
    return out;
}

export function finishAchievementCapture(handle) {
    const state = captures.get(handle);
    if (!state) return null;
    captures.delete(handle);
    state.signal?.removeEventListener?.('abort', state.cancel);
    const value = state.packet;
    return value && typeof value === 'object' ? value : null;
}
