// 只有自动留忆的最后一步才武装。成就字段从正文 JSON 里拆走，不改各模块原来的校验。

const SUFFIX = '\n若这是本轮最后一段，在原有 JSON 里额外给出 "achievement":{"title":"不超过20字","kind":"historical或collection"}。没有证据就用 collection。不要改动原有字段，不要解释。';

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
