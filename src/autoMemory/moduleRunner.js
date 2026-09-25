// 只补未完成的步骤。成功一步就保存；最后一步才带成就。成就失败不重跑正文。
import * as auto_memory_combined from './combinedResult.js';
import * as auto_memory_plans from './modulePlans.js';
import * as auto_memory_plan from './planStore.js';

function replace(snapshot, modulePlan, now, extra = {}) {
    const updatedAt = Number.isSafeInteger(now) && now > snapshot.plan.updatedAt ? now : snapshot.plan.updatedAt + 1;
    return auto_memory_plan.parseAutoMemorySnapshot({
        plan: auto_memory_plan.parseAutoMemoryPlan({
            ...snapshot.plan,
            ...extra.plan,
            revision: snapshot.plan.revision + 1,
            updatedAt,
        }),
        revealRecords: extra.revealRecords || snapshot.revealRecords,
        drawTickets: extra.drawTickets || snapshot.drawTickets,
        modulePlan,
    });
}

function markStep(plan, stepId, status, recoverySlot) {
    return auto_memory_plan.parseModulePlan({
        ...plan,
        steps: plan.steps.map(item => (item.id === stepId ? { ...item, status, recoverySlot: recoverySlot || item.recoverySlot || status } : item)),
    });
}

function closeDraw(snapshot, now) {
    const tickets = snapshot.drawTickets.map(ticket => (
        ticket.id === snapshot.plan.activeDrawTicketId ? { ...ticket, status: 'completed' } : ticket
    ));
    return replace(snapshot, snapshot.modulePlan, now, { plan: { activeDrawTicketId: null }, drawTickets: tickets });
}

export async function runPending(snapshot, io) {
    const plan = snapshot?.modulePlan;
    if (!plan) return { action: 'idle', snapshot };
    const pending = plan.steps.filter(item => item.status !== 'completed');
    if (!pending.length) return { action: 'complete', snapshot };
    const batch = auto_memory_plans.concurrentSteps(pending);
    const lastPending = pending[pending.length - 1];
    const outcomes = await Promise.all(batch.map(async step => {
        try {
            const outcome = await io.execute({ step, plan, carryAchievement: step.id === lastPending.id && batch.length === 1 });
            return { step, outcome };
        } catch (error) {
            return { step, error };
        }
    }));
    let nextPlan = plan;
    let expand = null;
    let noop = false;
    let addRepair = false;
    for (const row of outcomes) {
        if (row.error) {
            nextPlan = markStep(nextPlan, row.step.id, 'failed', 'failed');
            continue;
        }
        if (row.outcome?.noop === true) { noop = true; continue; }
        if (row.outcome?.saved === false) {
            nextPlan = markStep(nextPlan, row.step.id, 'failed', 'failed');
            continue;
        }
        if (row.outcome?.expand) expand = row.outcome.expand;
        if (row.outcome?.addRepair === true) addRepair = true;
        nextPlan = markStep(nextPlan, row.step.id, 'completed', row.outcome?.recoverySlot || `${plan.moduleId}:${row.step.id}`);
    }
    if (expand) {
        const expanded = auto_memory_plans.expandModulePlan(nextPlan, expand);
        if (!expanded) {
            const released = closeDraw(replace(snapshot, null, io.now), io.now);
            await io.persist(released);
            return { action: 'noop', snapshot: released };
        }
        const saved = replace(snapshot, expanded, io.now);
        await io.persist(saved);
        return { action: 'expanded', snapshot: saved };
    }
    if (noop && outcomes.every(row => row.outcome?.noop === true)) {
        const released = closeDraw(replace(snapshot, null, io.now), io.now);
        await io.persist(released);
        return { action: 'noop', snapshot: released };
    }
    if (addRepair) nextPlan = auto_memory_plan.parseModulePlan(auto_memory_plans.addRoomRepair(nextPlan));
    const saved = replace(snapshot, nextPlan, io.now);
    await io.persist(saved);
    if (nextPlan.steps.some(item => item.status !== 'completed')) return { action: 'saved', snapshot: saved };
    const moduleItem = io.module || {};
    const settled = auto_memory_combined.settleCombined({
        snapshot: saved,
        moduleId: nextPlan.moduleId,
        moduleSaved: outcomes.every(row => !row.error && row.outcome?.saved !== false),
        packet: outcomes.find(row => row.outcome?.achievement)?.outcome.achievement || null,
        sourceMemoryIds: nextPlan.sourceMemoryIds,
        allowHistorical: moduleItem.contentKind === 'historical',
        now: io.now,
    });
    if (settled.action === 'noop' || settled.action === 'hold' || settled.action === 'unsupported') return { ...settled, snapshot: saved };
    const closed = closeDraw(settled.snapshot, io.now);
    await io.persist(closed);
    return { ...settled, snapshot: closed, extraAchievementRequest: false };
}
