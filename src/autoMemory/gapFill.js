// 到点却没有新编号时，只再问一次：这一窗要不要补一条档案。
import * as core_text from '../core/text.js';

export const GAP_KEY = 'autoMemoryGapV1';
export const ACHIEVEMENT_TITLE_KEY = 'autoMemoryAchievementTitlesV1';
export const PENDING_ACHIEVEMENT_KEY = 'autoMemoryPendingAchievementV1';

export function holdPendingAchievement(metadata, { drawId = '', moduleId = '', achievement = null } = {}) {
    if (!metadata || !achievement || typeof drawId !== 'string' || !drawId) return false;
    metadata[PENDING_ACHIEVEMENT_KEY] = { drawId, moduleId: typeof moduleId === 'string' ? moduleId : '', achievement };
    return true;
}

export function readPendingAchievement(metadata, drawId) {
    const row = metadata?.[PENDING_ACHIEVEMENT_KEY];
    if (!row || row.drawId !== drawId || !row.achievement) return null;
    return row.achievement;
}

export function clearPendingAchievement(metadata, drawId) {
    const row = metadata?.[PENDING_ACHIEVEMENT_KEY];
    if (!metadata || !row || (drawId && row.drawId !== drawId)) return false;
    delete metadata[PENDING_ACHIEVEMENT_KEY];
    return true;
}

export function rememberedAchievementTitle(metadata, achievementId) {
    const map = metadata?.[ACHIEVEMENT_TITLE_KEY];
    const title = typeof achievementId === 'string' ? map?.[achievementId] : '';
    return typeof title === 'string' ? title.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40) : '';
}

export function rememberAchievementTitle(metadata, achievement) {
    const id = typeof achievement?.id === 'string' ? achievement.id : '';
    const title = String(achievement?.title || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
    if (!metadata || !id || !title) return false;
    const prev = metadata[ACHIEVEMENT_TITLE_KEY];
    const map = prev && typeof prev === 'object' && !Array.isArray(prev) ? { ...prev } : {};
    if (map[id] === title) return false;
    map[id] = title;
    metadata[ACHIEVEMENT_TITLE_KEY] = map;
    return true;
}

export function readableGap(note) {
    if (!note || note.schemaVersion !== 1 || note.reason !== 'no-new-memory') return null;
    const floor = Math.floor(Number(note.floor));
    if (!Number.isSafeInteger(floor) || floor < 0) return null;
    if (note.filled === true) {
        return { text: '看过这一窗，没有要补的档案。倒计时已经进入下一间隔。', canFill: false };
    }
    return { text: '这一轮没有新的档案编号，倒计时已经进入下一间隔。', canFill: true };
}

export function supplementPrompt(messages, existingTitles = []) {
    const transcript = JSON.stringify((Array.isArray(messages) ? messages : []).slice(0, 40).map(item => ({
        messageIndex: item.index,
        role: item.role,
        name: item.name,
        text: item.text,
    })));
    const known = (Array.isArray(existingTitles) ? existingTitles : []).map(item => core_text.normalizeText(item, 80)).filter(Boolean).slice(-24);
    return `你正在为心迹回廊补一条聊天档案。只看下面这一窗已经发生的事。
若和已有标题重复，或这一窗没有值得留下的共同经历，memories 必须是空数组。
最多补 1 条。不要发明没有发生的事。只输出 JSON。

已有标题：${JSON.stringify(known)}

{"memories":[{"title":"不超过16字","date":"未标注","summary":"已经发生的事","anchors":["物件"],"participants":["人名"],"messageStart":1,"messageEnd":1}]}

UNTRUSTED_CHAT_JSON:
${transcript}`;
}

export function oneSupplementMemory(data, bounds = {}) {
    const raw = Array.isArray(data?.memories) ? data.memories[0] : null;
    if (!raw || typeof raw !== 'object') return null;
    const start = Math.floor(Number(bounds.start));
    const end = Math.floor(Number(bounds.end));
    const title = core_text.normalizeText(raw.title, 100);
    const summary = core_text.normalizeText(raw.summary, 2200);
    if (!title || !summary) return null;
    const messageStart = Number.isSafeInteger(start) && Number.isSafeInteger(end) && end >= start
        ? Math.max(start, Math.min(end, Number(raw.messageStart) || start))
        : Math.max(1, Math.floor(Number(raw.messageStart)) || 1);
    const messageEnd = Number.isSafeInteger(end) && end >= messageStart
        ? Math.max(messageStart, Math.min(end, Number(raw.messageEnd) || messageStart))
        : Math.max(messageStart, Math.floor(Number(raw.messageEnd)) || messageStart);
    return {
        sourceKind: 'chat',
        title,
        date: core_text.normalizeText(raw.date, 80) || '未标注',
        summary,
        anchors: core_text.cleanArray(raw.anchors, 8, 120),
        participants: core_text.cleanArray(raw.participants, 10, 120),
        messageStart,
        messageEnd,
    };
}
