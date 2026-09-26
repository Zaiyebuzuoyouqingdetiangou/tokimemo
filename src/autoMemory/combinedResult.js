// 单请求模块的正文和成就末包。成就失败只留下待补标记，不另发成就请求，也不重跑正文。
import * as auto_memory_plan from './planStore.js';

const SINGLE_REQUEST = new Set(['cabinet', 'calendar', 'relations', 'inbox']);

function token(prefix) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let suffix = '';
    const cryptoObj = globalThis.crypto;
    if (typeof cryptoObj?.getRandomValues === 'function') {
        const bytes = new Uint8Array(8);
        cryptoObj.getRandomValues(bytes);
        suffix = [...bytes].map(item => alphabet[item % alphabet.length]).join('');
    } else {
        for (let index = 0; index < 8; index += 1) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return prefix + suffix;
}

export function parseCombinedResponse(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: 'shape' };
    if (!Object.hasOwn(value, 'moduleResult') || !Object.hasOwn(value, 'achievement')) return { ok: false, reason: 'shape' };
    return { ok: true, moduleResult: value.moduleResult, achievement: value.achievement };
}

export function inboxPlanLength(plan) {
    if (Array.isArray(plan)) return plan.length;
    if (Array.isArray(plan?.letters)) return plan.letters.length;
    return 0;
}

export function classifyAchievement(packet, { allowHistorical = false, sourceMemoryIds = [] } = {}) {
    if (packet == null) return { ok: false, reason: 'missing' };
    if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return { ok: false, reason: 'shape' };
    const clip = (value, max) => String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
    const title = clip(packet.title, 40);
    const kind = packet.kind === 'historical' || packet.kind === 'collection' ? packet.kind : '';
    if (!title || !kind) return { ok: false, reason: 'invalid' };
    const historicalEvidence = sourceMemoryIds.some(id => /^M\d{3,6}$/.test(id));
    if (kind === 'historical' && (!allowHistorical || !historicalEvidence)) return { ok: false, reason: 'historical' };
    const id = typeof packet.id === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(packet.id) ? packet.id : '';
    const description = clip(packet.description, 900);
    const unlockCondition = clip(packet.unlockCondition, 300);
    const sourceMemoryAnchor = clip(packet.sourceMemoryAnchor, 160);
    return {
        ok: true,
        achievement: {
            id, title, kind,
            ...(description ? { description } : {}),
            ...(unlockCondition ? { unlockCondition } : {}),
            ...(sourceMemoryAnchor ? { sourceMemoryAnchor } : {}),
        },
    };
}

function bumpedPlan(snapshot, now) {
    return auto_memory_plan.parseAutoMemoryPlan({
        ...snapshot.plan,
        revision: snapshot.plan.revision + 1,
        updatedAt: now,
    });
}

function completedPlan(modulePlan) {
    if (!modulePlan) return null;
    return auto_memory_plan.parseModulePlan({
        ...modulePlan,
        steps: modulePlan.steps.map(step => ({
            ...step,
            status: 'completed',
            recoverySlot: step.recoverySlot || 'module-saved',
        })),
    });
}

function nextSnapshot(snapshot, now, reveal, modulePlan) {
    return auto_memory_plan.parseAutoMemorySnapshot({
        plan: bumpedPlan(snapshot, now),
        revealRecords: [...snapshot.revealRecords, reveal],
        drawTickets: snapshot.drawTickets,
        modulePlan: completedPlan(modulePlan),
    });
}

export function settleCombined({
    snapshot, moduleId, moduleSaved = false, packet = null, sourceMemoryIds = [], allowHistorical = false,
    inboxPlan = null, now = 0, revealId = '', achievementId = '',
} = {}) {
    if (!SINGLE_REQUEST.has(moduleId) && !['album', 'adv', 'room', 'items', 'phone', 'travel', 'ending', 'heart', 'butterfly', 'pastLives', 'themeSong', 'bedtime', 'timeEcho'].includes(moduleId)) {
        return { action: 'unsupported', requests: 0, extraAchievementRequest: false, reveal: null, snapshot };
    }
    if (moduleId === 'inbox' && inboxPlanLength(inboxPlan) === 0) {
        return { action: 'noop', requests: 0, extraAchievementRequest: false, reveal: null, snapshot };
    }
    const parsedResponse = packet && Object.hasOwn(packet, 'moduleResult') ? parseCombinedResponse(packet) : { ok: true, achievement: packet };
    const achievementPacket = parsedResponse.ok ? parsedResponse.achievement : null;
    if (!moduleSaved) return { action: 'hold', requests: 1, extraAchievementRequest: false, reveal: null, snapshot, redoModule: false };
    const parsed = classifyAchievement(achievementPacket, { allowHistorical, sourceMemoryIds });
    const id = revealId || token('rv');
    if (!parsed.ok) {
        const reveal = auto_memory_plan.parseRevealRecord({
            id, moduleId, achievementId: null, sourceMemoryIds, status: 'achievement_pending', createdAt: now,
        });
        return {
            action: 'achievement-pending', requests: 1, extraAchievementRequest: false, reveal, redoModule: false,
            snapshot: nextSnapshot(snapshot, now, reveal, snapshot.modulePlan),
        };
    }
    const savedAchievementId = parsed.achievement.id || achievementId || token('achv');
    const reveal = auto_memory_plan.parseRevealRecord({
        id, moduleId, achievementId: savedAchievementId, sourceMemoryIds, status: 'ready', createdAt: now,
    });
    return {
        action: 'reveal', requests: 1, extraAchievementRequest: false, reveal,
        achievement: { ...parsed.achievement, id: savedAchievementId },
        snapshot: nextSnapshot(snapshot, now, reveal, snapshot.modulePlan),
    };
}

export function repairAchievementRequest({ confirmed = false, moduleSaved = false } = {}) {
    if (confirmed !== true || moduleSaved !== true) return { action: 'refused', requests: 0, redoesModule: false };
    return { action: 'repair', requests: 1, redoesModule: false, extraAchievementRequest: false };
}
