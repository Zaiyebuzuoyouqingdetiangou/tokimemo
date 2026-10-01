// 他在等你：用户离开聊天一段时间后，看看他这几天的样子。
// 生成永远由用户点击触发；密码与线索对不上时把那一格改成普通点位，不让整次失败。
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import * as core_text from '../core/text.js';
import * as archive_repository from '../archive/repository.js';
import * as generation_client from '../generation/client.js';
import * as generation_prompts from '../generation/prompts.js';
import * as extras_store from './store.js';
import * as extras_collection from './collection.js';

let runningScope = '';

export function lastChatTime(context = core_context.currentCharacterGuard()) {
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    for (let i = chat.length - 1; i >= 0; i -= 1) {
        const time = extras_collection.messageTime(chat[i]);
        if (time) return time;
    }
    return 0;
}

export function awayState(context = core_context.currentCharacterGuard(), now = Date.now()) {
    const last = lastChatTime(context);
    if (!last) return { known: false, last: 0, days: 0 };
    return { known: true, last, days: Math.max(0, Math.floor((now - last) / 86400000)) };
}

export function waitingSettings(context = core_context.currentCharacterGuard()) {
    return extras_store.readExtras(context).waiting.settings;
}

export function saveWaitingSettings(patch, context = core_context.currentCharacterGuard()) {
    const scope = extras_store.extrasScope(context);
    return extras_store.updateExtras(scope, draft => {
        draft.waiting.settings = { ...draft.waiting.settings, ...patch };
        draft.waiting.settingsUpdatedAt = Date.now();
        return draft;
    }).waiting.settings;
}

export function latestWaitingRecord(context = core_context.currentCharacterGuard()) {
    return extras_store.readExtras(context).waiting.records[0] || null;
}

// 痕迹只属于这一次离开：用户之后又聊了天，邮箱和房间里就不再显示它。
export function activeTrace(context = core_context.currentCharacterGuard()) {
    const settings = waitingSettings(context);
    if (!settings.enabled) return null;
    const record = latestWaitingRecord(context);
    if (!record) return null;
    const away = awayState(context);
    if (away.known && record.absenceAnchor && away.last !== record.absenceAnchor) return null;
    return record;
}

export function waitingCardStatus(context) {
    try {
        const ctx = context || core_context.currentCharacterGuard();
        const settings = waitingSettings(ctx);
        if (!settings.enabled) return { off: true, text: '已关闭 · 点击进入开启' };
        const away = awayState(ctx);
        const trace = activeTrace(ctx);
        if (trace) return { off: false, text: `离开第 ${trace.awayDays} 天 · 有新的痕迹` };
        if (away.known && away.days >= settings.days) return { off: false, text: `你离开 ${away.days} 天了 · 去看看他` };
        return { off: false, text: away.known ? `已开启 · 上次聊天在 ${away.days} 天前` : '已开启' };
    } catch { return { off: true, text: '先打开一个角色聊天' }; }
}

export function isWaitingRunning(scope) {
    return runningScope === scope;
}

function waitingPrompt(context, memory, away) {
    const charName = core_text.normalizeText(memory?.characterName || context?.name2, 120) || '{{char}}';
    const userName = core_text.normalizeText(memory?.userName || context?.name1, 120) || '{{user}}';
    const days = away.known ? away.days : 0;
    return `${generation_prompts.promptSafetyBoundary(context, '你不在的时候', null, memory)}
【任务】
${userName} 已经 ${days} 天没来了。写 ${charName} 在 ${userName} 不在的这一天里的样子，像恋爱养成游戏里偷偷看到的日常切片。
基调是想念：安静、克制、具体，可以带一点孤单或别扭，但不写埋怨、不写催促、不写关系倒退，也不写监视或病态。

【聊天档案（唯一的已发生事实来源）】
${generation_prompts.promptArchiveSlice(memory, 56)}

【写作要求】
1. points 写 7 个公开点位：多数是他生活中的固定地点（符合世界观与身份，如书房、玄关、阳台），1～2 个是随身或外出切片（如回家路上、工作途中）。
2. locked 写 2 个上锁点位：他最不想被看到的一面，比如藏起来的东西、没发出去的话。每个都要有 4 位数字密码 code。
3. 每个密码必须藏在某个公开点位的 detail 原文里，以数字形式出现（例如台历上圈着 9 月 17 日 → 0917；闹钟定在 06:30 → 0630），clueFrom 填那个公开点位的 id；locked 的 hint 用一句话暗示去哪里找，不直接写出数字。
4. 每个点位：name（地点）、time（当天时刻，如 21:40）、state（此刻的他）、detail（细节）、voice（心里话，他的口吻）。涉及与 ${userName} 过去共同发生的事，sourceMemoryIds 填档案编号；纯生活推想留空数组。
5. letter 是一封他写了但没寄出的短信或短笺，3～6 句，body 用换行分句；roomNode 是他房间里此刻的一个画面：time、text、line（一句自言自语）。
6. 不替 ${userName} 说话或行动。

【输出】
只输出一个 JSON 对象。
第一个字符必须是 {，最后一个字符必须是 }。
不要前言，不要解释，不要代码围栏，不要在 JSON 外面写任何字。
{"points":[{"id":"P1","name":"书桌","time":"20:05","state":"……","detail":"……台历上 9 月 17 日被圈了两圈……","voice":"……","sourceMemoryIds":[]}],"locked":[{"id":"L1","name":"抽屉最深处","time":"","hint":"……","code":"0917","clueFrom":"P1","state":"……","detail":"……","voice":"……","sourceMemoryIds":[]}],"letter":{"title":"没寄出的信","body":"……"},"roomNode":{"time":"21:40","text":"……","line":"……"}}`;
}

function normalizePoint(item, index, memory, prefix) {
    const name = core_text.normalizeText(item?.name, 40);
    const state = core_text.normalizeText(item?.state, 600);
    if (!name || !state) return null;
    return {
        id: core_text.safeId(item?.id, `${prefix}${index + 1}`),
        name,
        time: core_text.normalizeText(item?.time, 12),
        state,
        detail: core_text.normalizeText(item?.detail, 800),
        voice: core_text.normalizeText(item?.voice, 400),
        sourceMemoryIds: core_evidence.normalizeSourceMemoryIds(item?.sourceMemoryIds, memory, 0),
    };
}

// 线索里能读出的四位数：连续四位数字，或相邻两个数字各补成两位（9 月 17 日 → 0917，06:30 → 0630）。
export function clueCodes(text) {
    const numbers = String(text || '').match(/\d+/g) || [];
    const codes = new Set();
    for (const value of numbers) {
        for (let i = 0; i + 4 <= value.length; i += 1) codes.add(value.slice(i, i + 4));
    }
    for (let i = 0; i + 1 < numbers.length; i += 1) {
        if (numbers[i].length <= 2 && numbers[i + 1].length <= 2) codes.add(numbers[i].padStart(2, '0') + numbers[i + 1].padStart(2, '0'));
    }
    return codes;
}

export function normalizeWaiting(data, memory) {
    const points = (Array.isArray(data?.points) ? data.points : []).slice(0, 8).map((item, index) => normalizePoint(item, index, memory, 'P')).filter(Boolean);
    const locked = [];
    for (const [index, item] of (Array.isArray(data?.locked) ? data.locked : []).slice(0, 2).entries()) {
        const point = normalizePoint(item, index, memory, 'L');
        if (!point) continue;
        const code = core_text.normalizeText(item?.code, 8).replace(/\D/g, '');
        const clue = points.find(row => row.id === core_text.normalizeText(item?.clueFrom, 40)) || null;
        const findable = code.length === 4 && (clue ? clueCodes(clue.detail).has(code) : points.some(row => clueCodes(row.detail).has(code)));
        if (findable) locked.push({ ...point, code, hint: core_text.normalizeText(item?.hint, 120) || '线索藏在别的地方。', clueFrom: clue?.id || '' });
        else points.push({ ...point, id: `${point.id}_OPEN`, wasLocked: true });
    }
    if (!points.length) throw core_text.safeUserError('这次没有收到他这几天的样子，可以再试一次。', 'RMT_WAITING_EMPTY');
    const letterBody = core_text.normalizeText(data?.letter?.body, 1200);
    return {
        points,
        locked,
        letter: letterBody ? { title: core_text.normalizeText(data?.letter?.title, 40) || '没寄出的信', body: letterBody } : null,
        roomNode: core_text.normalizeText(data?.roomNode?.text, 400) ? {
            time: core_text.normalizeText(data?.roomNode?.time, 12),
            text: core_text.normalizeText(data?.roomNode?.text, 400),
            line: core_text.normalizeText(data?.roomNode?.line, 200),
        } : null,
    };
}

export async function generateWaiting({ onSettled } = {}) {
    const context = core_context.currentCharacterGuard();
    const memory = structuredClone(archive_repository.requireArchive(context));
    const scope = extras_store.extrasScope(context);
    const base = structuredClone(extras_store.readExtras(context));
    if (runningScope) throw core_text.safeUserError('正在看他这几天的样子，稍等一下。', 'RMT_WAITING_RUNNING');
    runningScope = scope;
    try {
        const away = awayState(context);
        const origin = core_context.captureTaskOrigin(context, memory.archiveRevision || '');
        const data = await generation_client.requestJson(waitingPrompt(context, memory, away), '正在看他这几天的样子…', {
            mode: 'waiting', taskKey: `extras:waiting:${scope}`, context, origin,
        });
        let result;
        try { result = normalizeWaiting(data, memory); }
        catch (error) {
            const held = extras_store.stageExtraResult({ scope, kind: 'waiting', origin, base, raw: data });
            return { pending: true, scope, record: null, durable: held.durable,
                reason: '已收到结果，但格式需要检查。请导出原始结果，不会自动重新生成。' };
        }
        const createdAt = Date.now();
        const record = { id: extras_store.extraRecordId('WAIT'), createdAt, awayDays: away.days, absenceAnchor: away.last, unlocked: [], ...result };
        record.archiveRevision = origin.archiveRevision;
        extras_store.stageExtraResult({ scope, kind: 'waiting', origin, base, record, raw: data });
        return await extras_store.retryExtraSave(scope, record.id);
    } finally {
        runningScope = '';
        try { onSettled?.(); } catch {}
    }
}

export function markUnlocked(recordId, lockedId, context = core_context.currentCharacterGuard()) {
    const scope = extras_store.extrasScope(context);
    extras_store.updateExtras(scope, draft => {
        const record = draft.waiting.records.find(item => item.id === recordId);
        if (record) {
            record.unlocked = [...new Set([...(record.unlocked || []), lockedId])];
            record.updatedAt = Date.now();
        }
        return draft;
    });
}
