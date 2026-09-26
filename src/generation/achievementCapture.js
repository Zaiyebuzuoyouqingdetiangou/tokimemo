// 只有自动留忆的最后一步才武装。成就字段从正文 JSON 里拆走，不改各模块原来的校验。

const SUFFIX = `
【本轮成就，和上面这份回忆写在同一次 JSON 里】
不要另起一份回复，也不要改动原有字段。在原来的 JSON 对象上增加 "achievement"：
{"title":"不超过20字","description":"一两句说明","unlockCondition":"做到或经历了什么才解锁","kind":"historical或collection","sourceMemoryAnchor":"从本轮档案锚点原样复制"}
能被本轮真实档案证明的用 historical。推演、模拟、后日谈用 collection。不要解释。`;

let armed = false;
let packet = null;

export function armAchievementCapture() {
    armed = true;
    packet = null;
}

export function achievementCaptureArmed() {
    return armed === true;
}

export function achievementPromptSuffix() {
    return armed ? SUFFIX : '';
}

export function stripAchievementField(raw) {
    if (!armed || !raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.hasOwn(raw, 'achievement')) return raw;
    packet = raw.achievement;
    const copy = { ...raw };
    delete copy.achievement;
    return copy;
}

export function finishAchievementCapture() {
    armed = false;
    const value = packet;
    packet = null;
    return value && typeof value === 'object' ? value : null;
}
