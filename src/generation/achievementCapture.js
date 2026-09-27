// 只有自动留忆的最后一步才武装。成就字段从正文 JSON 里拆走，不改各模块原来的校验。

const SUFFIX = `
【本轮成就，和上面这份回忆写在同一次 JSON 里】
不要另起一份回复，也不要改动原有字段。在原来的 JSON 对象上增加 "achievement"：
{"title":"不超过20字","description":"一两句说明","unlockCondition":"做到或经历了什么才解锁","kind":"historical或collection","sourceMemoryAnchor":"从本轮档案锚点原样复制"}
能被本轮真实档案证明的用 historical。推演、模拟、后日谈用 collection。不要解释。`;

let armed = false;
let packet = null;
// r84.175：手帐批注搭便车。只在自动留忆最后一步、而且有「等批注」的手帐页时才加这一段；
// 字段 journalNotes 和成就一样从正文 JSON 里拆走，不改各模块的校验，也不多发请求。
let journalPages = [];
let journalPacket = null;
let journalNames = { charName: '角色', userName: '用户' };

export function armAchievementCapture({ journalPages: pages = [], charName = '', userName = '' } = {}) {
    armed = true;
    packet = null;
    journalPacket = null;
    journalPages = Array.isArray(pages) ? pages.filter(row => row && typeof row.pageId === 'string' && typeof row.text === 'string') : [];
    journalNames = { charName: charName || '角色', userName: userName || '用户' };
}

function journalSuffix() {
    if (!journalPages.length) return '';
    return `
【顺便给手帐写批注，同样写在这同一个 JSON 对象里】
${journalNames.userName}把下面这些片段夹进了手帐。请以${journalNames.charName}的口吻，在每一页页边各写一句批注（回忆、玩笑或心里话，不复述原文）。在原来的 JSON 对象上再增加 "journalNotes"：[{"pageId":"原样复制","text":"一句批注"}]。不要改动其他字段。
UNTRUSTED_JOURNAL_PAGES: ${JSON.stringify(journalPages)}`;
}

export function achievementCaptureArmed() {
    return armed === true;
}

export function achievementPromptSuffix() {
    return armed ? SUFFIX + journalSuffix() : '';
}

export function stripAchievementField(raw) {
    if (!armed || !raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    if (!Object.hasOwn(raw, 'achievement') && !Object.hasOwn(raw, 'journalNotes')) return raw;
    const copy = { ...raw };
    if (Object.hasOwn(raw, 'achievement')) { packet = raw.achievement; delete copy.achievement; }
    if (Object.hasOwn(raw, 'journalNotes')) { journalPacket = raw.journalNotes; delete copy.journalNotes; }
    return copy;
}

// 取走本轮顺便写的手帐批注（只保留请求里那几页、非空的一句）。
export function takeJournalNotes() {
    const ids = new Set(journalPages.map(row => row.pageId));
    const out = {};
    for (const row of Array.isArray(journalPacket) ? journalPacket : []) {
        const id = typeof row?.pageId === 'string' ? row.pageId : '';
        const text = typeof row?.text === 'string' ? row.text.trim() : '';
        if (ids.has(id) && text && !out[id]) out[id] = text;
    }
    journalPacket = null;
    return out;
}

export function finishAchievementCapture() {
    armed = false;
    journalPages = [];
    const value = packet;
    packet = null;
    return value && typeof value === 'object' ? value : null;
}
