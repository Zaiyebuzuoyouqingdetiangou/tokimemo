// 楼层闸门与一轮抽签。真正的导入和保存由调用方注入，方便测试时不碰酒馆。
import * as auto_memory_draw from './draw.js';
import * as auto_memory_floor from './floorPace.js';
import * as auto_memory_registry from './moduleRegistry.js';
import * as auto_memory_plan from './planStore.js';

export function modulePlanOpen(modulePlan) {
    const steps = Array.isArray(modulePlan?.steps) ? modulePlan.steps : [];
    return steps.some(step => step && step.status !== 'completed');
}

function ticketOpen(ticket) {
    return !!ticket && (ticket.status === 'drawn' || ticket.status === 'running');
}

function laterThanTicket(floor, ticket) {
    const due = Math.floor(Number(ticket?.dueFloor));
    return Number.isSafeInteger(floor) && Number.isSafeInteger(due) && due > 0 && floor > due;
}

function floorIsDue(floor, nextDueFloor) {
    return Number.isSafeInteger(floor) && Number.isSafeInteger(nextDueFloor) && floor >= nextDueFloor;
}

export function shouldRetryDueRound(snapshot, floor) {
    const plan = snapshot?.plan;
    if (plan?.enabled !== true) return false;
    return floorIsDue(floor, plan.nextDueFloor);
}

export function floorDecision({ enabled = false, floor = 0, interval = 0, nextDueFloor = null, modulePlan = null, activeTicket = null, inflightFloor = null, seenFloor = null } = {}) {
    if (enabled !== true) return { action: 'idle' };
    if (modulePlanOpen(modulePlan)) {
        // 间隔还没到，同一轮接着写。到点了就放弃没写完的，另抽一张。
        if (!floorIsDue(floor, nextDueFloor)) return { action: 'hold', sourceMemoryIds: [...(modulePlan.sourceMemoryIds || [])] };
    } else if (ticketOpen(activeTicket)) {
        const finished = !!modulePlan && !modulePlanOpen(modulePlan);
        const orphan = !modulePlan;
        // 同一楼接着写。计划写完、或票还开着却丢了计划，到了下一楼就让位另抽。
        if (!((finished || orphan) && laterThanTicket(floor, activeTicket))) {
            return { action: 'reuse', ticketId: activeTicket.id };
        }
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

async function persistNoop(snapshot, floor, io, now, reason, floorWindow = null) {
    const next = nextSnapshot(snapshot, {
        lastCompletedFloor: floor,
        nextDueFloor: floor + snapshot.plan.intervalFloors,
        activeDrawTicketId: null,
    }, {}, now);
    await io.persist(next);
    if (reason === 'no-new-memory') {
        await io.noteGap?.({
            schemaVersion: 1,
            floor,
            windowStart: floorWindow?.start ?? null,
            windowEnd: floorWindow?.end ?? null,
            reason,
            filled: false,
        });
    }
    return { action: 'noop', moduleRequest: false, reason, snapshot: next };
}

async function drawFresh(snapshot, fresh, input, io, { keepPace = false } = {}) {
    const plan = snapshot.plan;
    const modules = Array.isArray(input.modules) ? input.modules : auto_memory_registry.listAutoMemoryModules();
    const candidates = auto_memory_draw.roundCandidateIds(modules, {
        excludedModuleIds: plan.excludedModuleIds,
        satisfiedPrerequisiteIds: input.satisfiedPrerequisiteIds,
    });
    if (!candidates.length) {
        if (keepPace) return { action: 'noop', moduleRequest: false, reason: 'no-candidates' };
        return persistNoop(snapshot, input.floor, io, input.now, 'no-candidates');
    }
    const weighted = auto_memory_draw.weightCandidates(candidates, snapshot.drawTickets);
    const selected = auto_memory_draw.pickWeighted(weighted, io.random);
    if (!selected || plan.excludedModuleIds.includes(selected)) {
        if (keepPace) return { action: 'noop', moduleRequest: false, reason: 'no-candidates' };
        return persistNoop(snapshot, input.floor, io, input.now, 'no-candidates');
    }
    const drawId = io.nextId();
    const prepared = await io.prepareModulePlan({
        moduleId: selected, sourceMemoryIds: [...fresh], drawId, chatId: input.chatId, archiveRevision: input.archiveRevision,
    });
    if (!prepared) {
        if (keepPace) return { action: 'noop', moduleRequest: false, reason: 'no-module-plan' };
        return persistNoop(snapshot, input.floor, io, input.now, 'no-module-plan');
    }
    const modulePlan = auto_memory_plan.parseModulePlan({
        ...prepared, drawId, moduleId: selected, sourceMemoryIds: [...fresh],
    });
    const ticket = auto_memory_plan.parseDrawTicket({
        id: drawId, dueFloor: input.floor, archiveRevision: input.archiveRevision, candidates: weighted,
        selectedModuleId: selected, sourceMemoryIds: [...fresh], status: 'drawn',
    });
    const pace = keepPace ? {} : {
        lastCompletedFloor: input.floor,
        nextDueFloor: input.floor + plan.intervalFloors,
    };
    const next = nextSnapshot(snapshot, {
        ...pace,
        activeDrawTicketId: drawId,
    }, { drawTickets: [...snapshot.drawTickets, ticket], modulePlan }, input.now);
    await io.persist(next);
    await io.noteGap?.(null);
    const started = await io.startModule(next);
    const steps = started?.snapshot?.modulePlan?.steps || [];
    const failed = started?.action === 'failed' || steps.some(step => step.status === 'failed');
    return { action: failed ? 'failed' : 'drawn', moduleRequest: true, drawId, snapshot: started?.snapshot || next };
}

function closeActiveTicket(snapshot, ticket) {
    return auto_memory_plan.parseAutoMemorySnapshot({
        plan: auto_memory_plan.parseAutoMemoryPlan({ ...snapshot.plan, activeDrawTicketId: null }),
        revealRecords: snapshot.revealRecords,
        drawTickets: snapshot.drawTickets.map(row => (row.id === ticket.id ? { ...row, status: 'completed' } : row)),
        modulePlan: snapshot.modulePlan,
    });
}

function closeRound(snapshot, ticket) {
    return auto_memory_plan.parseAutoMemorySnapshot({
        plan: auto_memory_plan.parseAutoMemoryPlan({ ...snapshot.plan, activeDrawTicketId: null }),
        revealRecords: snapshot.revealRecords,
        drawTickets: snapshot.drawTickets.map(row => (ticket && row.id === ticket.id ? { ...row, status: 'completed' } : row)),
        modulePlan: null,
    });
}

// 计划写完了，票却没关（旧版本结算失败留下的）。同一修订里把票关掉，后面的写入照常只加一版。
function releaseFinishedTicket(snapshot, floor = null) {
    const ticket = activeTicket(snapshot);
    if (!ticketOpen(ticket)) return snapshot;
    const finished = !!snapshot.modulePlan && !modulePlanOpen(snapshot.modulePlan);
    const orphanLater = !snapshot.modulePlan && laterThanTicket(floor, ticket);
    if (!finished && !orphanLater) return snapshot;
    if (finished && floor != null && !laterThanTicket(floor, ticket)) return snapshot;
    return closeActiveTicket(snapshot, ticket);
}

// 到点的新楼不再接着写没完成的一轮，先把旧计划和旧票放下。
function abandonDueRound(snapshot, floor = null) {
    if (modulePlanOpen(snapshot?.modulePlan) && floorIsDue(floor, snapshot.plan?.nextDueFloor)) {
        return closeRound(snapshot, activeTicket(snapshot));
    }
    return releaseFinishedTicket(snapshot, floor);
}

async function resumeTicket(snapshot, ticket, input, io) {
    const prepared = typeof io.prepareModulePlan === 'function'
        ? await io.prepareModulePlan({
            moduleId: ticket.selectedModuleId, sourceMemoryIds: [...ticket.sourceMemoryIds], drawId: ticket.id,
            chatId: input.chatId, archiveRevision: ticket.archiveRevision,
        })
        : null;
    if (!prepared) {
        const released = nextSnapshot(snapshot, { activeDrawTicketId: null }, {
            drawTickets: snapshot.drawTickets.map(row => (row.id === ticket.id ? { ...row, status: 'completed' } : row)),
        }, input.now);
        await io.persist(released);
        return runAutoMemoryRound({ ...input, snapshot: released }, io);
    }
    const modulePlan = auto_memory_plan.parseModulePlan({
        ...prepared, drawId: ticket.id, moduleId: ticket.selectedModuleId, sourceMemoryIds: [...ticket.sourceMemoryIds],
    });
    const next = nextSnapshot(snapshot, {}, { modulePlan }, input.now);
    await io.persist(next);
    const started = await io.startModule(next);
    const steps = started?.snapshot?.modulePlan?.steps || [];
    const failed = started?.action === 'failed' || steps.some(step => step.status === 'failed');
    return { action: failed ? 'failed' : 'reuse', moduleRequest: true, drawId: ticket.id, snapshot: started?.snapshot || next };
}

export async function runAutoMemoryRound(input, io) {
    const snapshot = input?.snapshot ? abandonDueRound(input.snapshot, input.floor) : null;
    const plan = snapshot?.plan;
    if (!plan) return { action: 'idle', moduleRequest: false };
    input = { ...input, snapshot };
    const decision = floorDecision({
        enabled: plan.enabled, floor: input.floor, interval: plan.intervalFloors, nextDueFloor: plan.nextDueFloor,
        modulePlan: snapshot.modulePlan, activeTicket: activeTicket(snapshot), inflightFloor: input.inflightFloor, seenFloor: input.seenFloor,
    });
    if (decision.action === 'hold') {
        if (typeof io.resumeModule === 'function') await io.resumeModule(snapshot);
        return { action: 'hold', moduleRequest: false, sourceMemoryIds: decision.sourceMemoryIds };
    }
    if (decision.action === 'reuse') return resumeTicket(snapshot, activeTicket(snapshot), input, io);
    if (decision.action !== 'arm' && decision.action !== 'due') return { action: decision.action, moduleRequest: false };
    if (decision.action === 'arm') {
        const next = nextSnapshot(snapshot, {
            lastCompletedFloor: decision.lastCompletedFloor, nextDueFloor: decision.nextDueFloor,
        }, {}, input.now);
        await io.persist(next);
        return { action: 'arm', moduleRequest: false, snapshot: next };
    }
    // 顺序固定：先把这一窗写入档案，再抽签，最后才生成增量回忆。
    const floorWindow = auto_memory_floor.dueFloorWindow(plan.lastCompletedFloor, input.floor);
    const options = auto_memory_draw.incrementalImportOptions(floorWindow);
    await io.importIncremental(options);
    const after = await io.readMemoryIds();
    const fresh = auto_memory_draw.newMemoryIds(input.memoryIds, after);
    if (!fresh.length) return persistNoop(snapshot, input.floor, io, input.now, 'no-new-memory', floorWindow);
    return drawFresh(snapshot, fresh, input, io);
}

export async function drawKnownMemories(input, io) {
    const snapshot = input?.snapshot ? releaseFinishedTicket(input.snapshot, input.floor) : null;
    const fresh = Array.isArray(input?.freshIds) ? input.freshIds.filter(id => /^M\d{3,6}$/.test(id)) : [];
    if (!snapshot?.plan || !fresh.length) return { action: 'noop', moduleRequest: false, reason: 'no-new-memory' };
    return drawFresh(snapshot, fresh, { ...input, snapshot }, io, { keepPace: true });
}
