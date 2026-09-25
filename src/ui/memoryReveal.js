// 同一份成果只用一个揭晓编号。提示、楼层和插件页都指向它；已读只改状态，不重做正文。
import * as auto_memory_plan from '../autoMemory/planStore.js';

export function revealTargets(revealId) {
    return { toast: revealId, floor: revealId, plugin: revealId };
}

export function firstReveal(previousStatus, nextStatus) {
    return nextStatus === 'ready' && previousStatus !== 'ready' && previousStatus !== 'opened';
}

export function floorMountPlan(index) {
    return { index, writesMessageText: false, sendsToModel: false };
}

export function markRevealOpened(snapshot, revealId, now = 0) {
    const current = snapshot?.revealRecords?.find(row => row.id === revealId);
    if (!current || current.status !== 'ready') return { changed: false, snapshot };
    const next = auto_memory_plan.parseAutoMemorySnapshot({
        plan: auto_memory_plan.parseAutoMemoryPlan({ ...snapshot.plan, revision: snapshot.plan.revision + 1, updatedAt: now }),
        revealRecords: snapshot.revealRecords.map(row => (row.id === revealId ? { ...row, status: 'opened' } : row)),
        drawTickets: snapshot.drawTickets,
        modulePlan: snapshot.modulePlan,
    });
    return { changed: true, snapshot: next, revealId };
}
