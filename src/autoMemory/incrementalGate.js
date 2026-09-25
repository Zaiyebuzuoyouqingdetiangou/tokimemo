// 楼层闸门与一轮抽签。真正的导入和保存由调用方注入，方便测试时不碰酒馆。
import * as auto_memory_draw from './draw.js';
import * as auto_memory_floor from './floorPace.js';
import * as auto_memory_registry from './moduleRegistry.js';
import * as auto_memory_plan from './planStore.js';

export function modulePlanOpen(modulePlan) {
    const steps = Array.isArray(modulePlan?.steps) ? modulePlan.steps : [];
    return steps.some(step => step && step.status !== 'completed');
}

export function floorDecision({ enabled = false, floor = 0, interval = 0, nextDueFloor = null, modulePlan = null, activeTicket = null, inflightFloor = null, seenFloor = null } = {}) {
    if (enabled !== true) return { action: 'idle' };
    if (modulePlanOpen(modulePlan)) return { action: 'hold', sourceMemoryIds: [...(modulePlan.sourceMemoryIds || [])] };
    if (activeTicket && (activeTicket.status === 'drawn' || activeTicket.status === 'running')) {
        return { action: 'reuse', ticketId: activeTicket.id };
    }
    if (Number.isSafeInteger(inflightFloor) && inflightFloor === floor) return { action: 'duplicate' };
    if (nextDueFloor == null) {
        const due = floor + interval;
        if (!Number.isSafeInteger(floor) || floor < 0 || !Number.isSafeInteger(due)) return { action: 'stop' };
        return { action: 'arm', lastCompletedFloor: floor, nextDueFloor: due };
    }
    if (!Number.isSafeInteger(floor) || floor < nextDueFloor) return { action: 'wait' };
    if (seenFloor === floor) return { action: 'duplicate' };
    return { action: 'due' };
}

export function roundGuard(error) {
    if (error?.code === 'RMT_AUTO_MEMORY_CORRUPT' || error?.code === 'RMT_AUTO_MEMORY_INTERVAL') return { action: 'stop', rewrite: false };
    return null;
}

export function autoMemoryLockName(scope) {
    return 'heartbeat-auto-memory:' + String(scope || '');
}

export async function withAutoMemoryLock(locks, scope, job) {
    if (typeof locks?.request !== 'function') return { acquired: false };
    let acquired = false;
    await locks.request(autoMemoryLockName(scope), { ifAvailable: true }, async lock => {
        if (!lock) return;
        acquired = true;
        await job();
    });
    return { acquired };
}

function nextSnapshot(snapshot, planPatch, extra, now) {
    const updatedAt = Number.isSafeInteger(now) && now > snapshot.plan.updatedAt ? now : snapshot.plan.updatedAt + 1;
    return auto_memory_plan.parseAutoMemorySnapshot({
        plan: auto_memory_plan.parseAutoMemoryPlan({
            ...snapshot.plan, ...planPatch, revision: snapshot.plan.revision + 1, updatedAt,
        }),
        revealRecords: snapshot.revealRecords,
        drawTickets: extra.drawTickets || snapshot.drawTickets,
        modulePlan: Object.hasOwn(extra, 'modulePlan') ? extra.modulePlan : snapshot.modulePlan,
    });
}

function activeTicket(snapshot) {
    const id = snapshot?.plan?.activeDrawTicketId;
    if (!id) return null;
    return (snapshot.drawTickets || []).find(ticket => ticket.id === id) || null;
}

async function persistNoop(snapshot, floor, io, now, reason) {
    const next = nextSnapshot(snapshot, {
        lastCompletedFloor: floor,
        nextDueFloor: floor + snapshot.plan.intervalFloors,
        activeDrawTicketId: null,
    }, {}, now);
    await io.persist(next);
    return { action: 'noop', moduleRequest: false, reason, snapshot: next };
}

export async function runAutoMemoryRound(input, io) {
    const snapshot = input?.snapshot;
    const plan = snapshot?.plan;
    if (!plan) return { action: 'idle', moduleRequest: false };
    const decision = floorDecision({
        enabled: plan.enabled, floor: input.floor, interval: plan.intervalFloors, nextDueFloor: plan.nextDueFloor,
        modulePlan: snapshot.modulePlan, activeTicket: activeTicket(snapshot), inflightFloor: input.inflightFloor, seenFloor: input.seenFloor,
    });
    if (decision.action === 'hold') {
        if (typeof io.resumeModule === 'function') await io.resumeModule(snapshot);
        return { action: 'hold', moduleRequest: false, sourceMemoryIds: decision.sourceMemoryIds };
    }
    if (decision.action === 'reuse') return { action: 'reuse', moduleRequest: false, drawId: decision.ticketId };
    if (decision.action !== 'arm' && decision.action !== 'due') return { action: decision.action, moduleRequest: false };
    if (decision.action === 'arm') {
        const next = nextSnapshot(snapshot, {
            lastCompletedFloor: decision.lastCompletedFloor, nextDueFloor: decision.nextDueFloor,
        }, {}, input.now);
        await io.persist(next);
        return { action: 'arm', moduleRequest: false, snapshot: next };
    }
    const floorWindow = auto_memory_floor.dueFloorWindow(plan.lastCompletedFloor, input.floor);
    const options = auto_memory_draw.incrementalImportOptions(floorWindow);
    await io.importIncremental(options);
    const after = await io.readMemoryIds();
    const fresh = auto_memory_draw.newMemoryIds(input.memoryIds, after);
    if (!fresh.length) return persistNoop(snapshot, input.floor, io, input.now, 'no-new-memory');
    const modules = Array.isArray(input.modules) ? input.modules : auto_memory_registry.listAutoMemoryModules();
    const candidates = auto_memory_draw.roundCandidateIds(modules, {
        excludedModuleIds: plan.excludedModuleIds,
        satisfiedPrerequisiteIds: input.satisfiedPrerequisiteIds,
    });
    if (!candidates.length) return persistNoop(snapshot, input.floor, io, input.now, 'no-candidates');
    const weighted = auto_memory_draw.weightCandidates(candidates, snapshot.drawTickets);
    const selected = auto_memory_draw.pickWeighted(weighted, io.random);
    if (!selected || plan.excludedModuleIds.includes(selected)) return persistNoop(snapshot, input.floor, io, input.now, 'no-candidates');
    const drawId = io.nextId();
    const prepared = await io.prepareModulePlan({
        moduleId: selected, sourceMemoryIds: [...fresh], drawId, chatId: input.chatId, archiveRevision: input.archiveRevision,
    });
    if (!prepared) return persistNoop(snapshot, input.floor, io, input.now, 'no-module-plan');
    const modulePlan = auto_memory_plan.parseModulePlan({
        ...prepared, drawId, moduleId: selected, sourceMemoryIds: [...fresh],
    });
    const ticket = auto_memory_plan.parseDrawTicket({
        id: drawId, dueFloor: input.floor, archiveRevision: input.archiveRevision, candidates: weighted,
        selectedModuleId: selected, sourceMemoryIds: [...fresh], status: 'drawn',
    });
    const next = nextSnapshot(snapshot, {
        lastCompletedFloor: input.floor,
        nextDueFloor: input.floor + plan.intervalFloors,
        activeDrawTicketId: drawId,
    }, { drawTickets: [...snapshot.drawTickets, ticket], modulePlan }, input.now);
    await io.persist(next);
    await io.startModule(next);
    return { action: 'drawn', moduleRequest: true, drawId, snapshot: next };
}
