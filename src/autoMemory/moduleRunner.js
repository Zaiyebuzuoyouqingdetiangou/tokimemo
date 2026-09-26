// 只补未完成的步骤。成就和第一次请求写在一起；后面的步骤不再带成就。成就失败不重跑正文。
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

// 主档只接受比当前多 1 的修订。关票和它前面那一步合成同一次写入，不再另加一版。
function closeDraw(snapshot) {
    const activeId = snapshot.plan.activeDrawTicketId;
    return auto_memory_plan.parseAutoMemorySnapshot({
        plan: auto_memory_plan.parseAutoMemoryPlan({ ...snapshot.plan, activeDrawTicketId: null }),
        revealRecords: snapshot.revealRecords,
        drawTickets: snapshot.drawTickets.map(ticket => (ticket.id === activeId ? { ...ticket, status: 'completed' } : ticket)),
        modulePlan: snapshot.modulePlan,
    });
}

async function settleRound(saved, io, { captured, moduleSaved }) {
    const plan = saved.modulePlan;
    const moduleItem = io.module || {};
    const settled = auto_memory_combined.settleCombined({
        snapshot: saved,
        moduleId: plan.moduleId,
        moduleSaved,
        packet: captured,
        sourceMemoryIds: plan.sourceMemoryIds,
        allowHistorical: moduleItem.contentKind === 'historical',
        now: io.now,
    });
    if (settled.action === 'hold' || settled.action === 'unsupported') return { ...settled, snapshot: saved };
    if (settled.action === 'noop') {
        const released = closeDraw(replace(saved, saved.modulePlan, io.now));
        await io.persist(released);
        return { ...settled, snapshot: released };
    }
    const closed = closeDraw(settled.snapshot);
    await io.persist(closed);
    return { ...settled, snapshot: closed, extraAchievementRequest: false };
}

export async function runPending(snapshot, io) {
    const plan = snapshot?.modulePlan;
    if (!plan) return { action: 'idle', snapshot };
    const pending = plan.steps.filter(item => item.status !== 'completed');
    let captured = typeof io.heldAchievement === 'function' ? io.heldAchievement() : null;
    if (!pending.length) {
        // 步骤都写完了，票却还开着：只补结算，不再发请求。
        if (!snapshot.plan.activeDrawTicketId) return { action: 'complete', snapshot };
        return settleRound(snapshot, io, { captured, moduleSaved: true });
    }
    const batch = auto_memory_plans.concurrentSteps(pending);
    const firstRequest = !plan.steps.some(step => step.status === 'completed');
    const outcomes = await Promise.all(batch.map(async step => {
        try {
            const outcome = await io.execute({ step, plan, carryAchievement: firstRequest && step.id === pending[0].id });
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
        if (firstRequest && row.outcome?.achievement) captured = row.outcome.achievement;
        nextPlan = markStep(nextPlan, row.step.id, 'completed', row.outcome?.recoverySlot || `${plan.moduleId}:${row.step.id}`);
    }
    if (captured) await io.holdAchievement?.(captured);
    if (expand) {
        const expanded = auto_memory_plans.expandModulePlan(nextPlan, expand);
        if (!expanded) {
            const released = closeDraw(replace(snapshot, null, io.now));
            await io.persist(released);
            return { action: 'noop', snapshot: released };
        }
        const saved = replace(snapshot, expanded, io.now);
        await io.persist(saved);
        return { action: 'expanded', snapshot: saved };
    }
    if (noop && outcomes.every(row => row.outcome?.noop === true)) {
        const released = closeDraw(replace(snapshot, null, io.now));
        await io.persist(released);
        return { action: 'noop', snapshot: released };
    }
    if (addRepair) nextPlan = auto_memory_plan.parseModulePlan(auto_memory_plans.addRoomRepair(nextPlan));
    const saved = replace(snapshot, nextPlan, io.now);
    await io.persist(saved);
    if (nextPlan.steps.some(item => item.status !== 'completed')) return { action: 'saved', snapshot: saved };
    return settleRound(saved, io, {
        captured,
        moduleSaved: outcomes.every(row => !row.error && row.outcome?.saved !== false),
    });
}
