import assert from 'node:assert/strict';
import test from 'node:test';
import * as draw from '../src/autoMemory/draw.js';
import * as gate from '../src/autoMemory/incrementalGate.js';
import * as plans from '../src/autoMemory/planStore.js';
import * as policy from '../src/core/autoUpdatePolicy.js';
import * as registry from '../src/autoMemory/moduleRegistry.js';
import * as wizard from '../src/autoMemory/wizardPlan.js';

function snapshot(extra = {}, modulePlan = null, drawTickets = []) {
    return plans.parseAutoMemorySnapshot({
        plan: plans.createAutoMemoryPlan({
            revision: 2, updatedAt: 20, enabled: true, intervalFloors: 5,
            preferredModuleIds: ['cabinet', 'album'], excludedModuleIds: ['inbox'],
            legacyPreferencesMigrated: true, ...extra,
        }),
        revealRecords: [], drawTickets, modulePlan,
    });
}

function openModule(sourceMemoryIds = ['M100']) {
    return {
        version: 1, drawId: 'drawticket1', moduleId: 'cabinet', chatId: 'chat-1', archiveRevision: 'rev-1',
        sourceMemoryIds, expectedRequestRange: { min: 1, max: 1 }, frozenAt: 30,
        steps: [{ id: 'body', kind: 'generate', order: 0, status: 'pending', recoverySlot: 'slot-body' }],
    };
}

function eligibleModules() {
    return [
        { id: 'cabinet', inDrawPool: true, autoEligible: true, achievementMerged: true, prerequisites: [] },
        { id: 'album', inDrawPool: true, autoEligible: true, achievementMerged: true, prerequisites: [] },
        { id: 'inbox', inDrawPool: true, autoEligible: true, achievementMerged: true, prerequisites: [] },
        { id: 'items', inDrawPool: true, autoEligible: true, achievementMerged: true, prerequisites: ['room'] },
    ];
}

test('the first floor only arms the interval and a repeat does not import', async () => {
    const calls = [];
    const io = { persist: async next => { calls.push(next); }, importIncremental: async () => { throw new Error('import'); } };
    const armed = await gate.runAutoMemoryRound({ snapshot: snapshot({ nextDueFloor: null, lastCompletedFloor: null }), floor: 8, now: 40 }, io);
    assert.equal(armed.action, 'arm');
    assert.equal(armed.moduleRequest, false);
    assert.equal(armed.snapshot.plan.lastCompletedFloor, 8);
    assert.equal(armed.snapshot.plan.nextDueFloor, 13);
    const waiting = await gate.runAutoMemoryRound({ snapshot: armed.snapshot, floor: 8, now: 41 }, io);
    assert.equal(waiting.action, 'wait');
    assert.equal(calls.length, 1);
});

test('the same due floor does not import twice and an empty candidate pool does not request a module', async () => {
    const calls = [];
    const io = {
        importIncremental: async options => { calls.push(options); },
        readMemoryIds: async () => ['M001'],
        persist: async next => { calls.push(['persist', next.drawTickets.length, next.plan.nextDueFloor]); },
        startModule: async () => { calls.push('start'); },
        prepareModulePlan: async () => { calls.push('plan'); },
    };
    const due = snapshot({ nextDueFloor: 10, lastCompletedFloor: 5 });
    const first = await gate.runAutoMemoryRound({ snapshot: due, floor: 10, memoryIds: ['M001'], now: 50 }, io);
    assert.equal(first.action, 'noop');
    assert.equal(first.reason, 'no-new-memory');
    assert.equal(first.moduleRequest, false);
    assert.deepEqual(calls[0], { automatic: true, floorWindow: { start: 6, end: 10 } });
    const again = await gate.runAutoMemoryRound({ snapshot: due, floor: 10, memoryIds: ['M001'], inflightFloor: 10, now: 51 }, io);
    assert.equal(again.action, 'duplicate');
    const live = await gate.runAutoMemoryRound({
        snapshot: due, floor: 10, memoryIds: [], now: 52,
        modules: registry.listAutoMemoryModules().map(item => ({ ...item, autoEligible: false })),
    }, { ...io, readMemoryIds: async () => ['M200'] });
    assert.equal(live.reason, 'no-candidates');
    assert.equal(calls.includes('start'), false);
    assert.equal(calls.includes('plan'), false);
    assert.equal(registry.autoMemoryRuntimeCandidates(['cabinet', 'album'], ['inbox']).includes('inbox'), false);
});

test('excluded modules stay out of the ticket and a refresh reuses the frozen draw', async () => {
    const calls = [];
    const io = {
        importIncremental: async () => { calls.push('import'); },
        readMemoryIds: async () => ['M100'],
        random: () => 0,
        nextId: () => 'drawticket1',
        prepareModulePlan: async request => openModule(request.sourceMemoryIds),
        persist: async next => { calls.push(['persist', next.plan.activeDrawTicketId]); },
        startModule: async next => { calls.push(['start', [...next.modulePlan.sourceMemoryIds]]); },
    };
    const drawn = await gate.runAutoMemoryRound({
        snapshot: snapshot({ nextDueFloor: 10, lastCompletedFloor: 5 }),
        floor: 10, memoryIds: [], now: 60, modules: eligibleModules(), archiveRevision: 'rev-1', chatId: 'chat-1',
        satisfiedPrerequisiteIds: [],
    }, io);
    assert.equal(drawn.moduleRequest, true);
    assert.deepEqual(drawn.snapshot.drawTickets[0].candidates.map(item => item.id), ['cabinet', 'album']);
    assert.equal(drawn.snapshot.drawTickets[0].candidates.some(item => item.id === 'inbox'), false);
    assert.deepEqual(calls, ['import', ['persist', 'drawticket1'], ['start', ['M100']]]);
    const held = await gate.runAutoMemoryRound({
        snapshot: drawn.snapshot, floor: 12, memoryIds: ['M100', 'M101'], now: 70,
    }, { ...io, readMemoryIds: async () => ['M100', 'M101'] });
    assert.equal(held.action, 'hold');
    assert.deepEqual(held.sourceMemoryIds, ['M100']);
    assert.equal(calls.filter(item => item === 'import').length, 1);
    const abandoned = await gate.runAutoMemoryRound({
        snapshot: drawn.snapshot, floor: 15, memoryIds: ['M100'], now: 71,
        modules: eligibleModules(), archiveRevision: 'rev-1', chatId: 'chat-1',
        satisfiedPrerequisiteIds: [],
    }, { ...io, nextId: () => 'drawticket2', readMemoryIds: async () => ['M100', 'M101'] });
    assert.notEqual(abandoned.action, 'hold');
    assert.notEqual(abandoned.action, 'reuse');
    assert.equal(abandoned.moduleRequest, true);
    const ticket = drawn.snapshot.drawTickets[0];
    const sameFloor = await gate.runAutoMemoryRound({
        snapshot: snapshot({ nextDueFloor: 10, activeDrawTicketId: ticket.id }, null, [ticket]),
        floor: 10, memoryIds: ['M100', 'M102'], now: 80,
    }, io);
    assert.equal(sameFloor.action, 'reuse');
    assert.equal(sameFloor.drawId, 'drawticket1');
    const later = await gate.runAutoMemoryRound({
        snapshot: snapshot({ nextDueFloor: 40, activeDrawTicketId: ticket.id }, null, [ticket]),
        floor: 40, memoryIds: ['M100'], now: 81, archiveRevision: 'rev-1', chatId: 'chat-1',
    }, { ...io, nextId: () => 'drawticket2', readMemoryIds: async () => ['M100', 'M102'] });
    assert.notEqual(later.action, 'reuse');
    assert.equal(later.moduleRequest, true);
});

test('a finished draw does not block the next floor', () => {
    const finished = openModule();
    finished.steps[0].status = 'completed';
    const decision = gate.floorDecision({
        enabled: true, floor: 11, interval: 1, nextDueFloor: 11,
        modulePlan: finished,
        activeTicket: { id: 'drawticket1', status: 'drawn', dueFloor: 10 },
    });
    assert.equal(decision.action, 'due');
    const same = gate.floorDecision({
        enabled: true, floor: 10, interval: 1, nextDueFloor: 10,
        modulePlan: finished,
        activeTicket: { id: 'drawticket1', status: 'drawn', dueFloor: 10 },
    });
    assert.equal(same.action, 'reuse');
    const orphanLater = gate.floorDecision({
        enabled: true, floor: 12, interval: 1, nextDueFloor: 12,
        modulePlan: null,
        activeTicket: { id: 'drawticket1', status: 'drawn', dueFloor: 10 },
    });
    assert.equal(orphanLater.action, 'due');
    const openHold = gate.floorDecision({
        enabled: true, floor: 12, interval: 5, nextDueFloor: 15,
        modulePlan: openModule(),
        activeTicket: { id: 'drawticket1', status: 'drawn', dueFloor: 10 },
    });
    assert.equal(openHold.action, 'hold');
    const openDue = gate.floorDecision({
        enabled: true, floor: 15, interval: 5, nextDueFloor: 15,
        modulePlan: openModule(),
        activeTicket: { id: 'drawticket1', status: 'drawn', dueFloor: 10 },
    });
    assert.equal(openDue.action, 'due');
});

test('weights lower a recent hit and raise a long miss without restoring an excluded id', () => {
    const tickets = [1, 2, 3, 4].map(index => ({
        selectedModuleId: 'cabinet',
        candidates: [{ id: 'cabinet' }, { id: 'album' }],
        dueFloor: index,
    }));
    const weighted = draw.weightCandidates(['album', 'cabinet'], tickets);
    assert.equal(weighted.find(item => item.id === 'cabinet').weight, 25);
    assert.equal(weighted.find(item => item.id === 'album').weight, 200);
    assert.equal(draw.pickWeighted(weighted, () => 0.5), 'album');
    const ids = draw.eligibleDrawIds(eligibleModules(), {
        preferredModuleIds: ['items', 'inbox', 'cabinet'], excludedModuleIds: ['inbox'], satisfiedPrerequisiteIds: [],
    });
    assert.deepEqual(ids, ['cabinet']);
    assert.deepEqual(draw.incrementalImportOptions(), { automatic: true });
    assert.deepEqual(draw.incrementalImportOptions({ start: 55, end: 56 }), { automatic: true, floorWindow: { start: 55, end: 56 } });
    assert.equal(gate.shouldRetryDueRound(snapshot({ enabled: true, nextDueFloor: 56 }), 56), true);
    assert.equal(gate.shouldRetryDueRound(snapshot({ enabled: true, nextDueFloor: 56 }), 54), false);
    assert.equal(gate.shouldRetryDueRound(snapshot({ enabled: false, nextDueFloor: 56 }), 56), false);
});

test('a corrupt plan is not rewritten and does not wake the runtime', () => {
    const broken = { autoMemoryPlanV1: { enabled: true }, revealRecordsV1: [] };
    const copy = structuredClone(broken);
    assert.throws(() => plans.readAutoMemoryMetadata(broken));
    assert.deepEqual(gate.roundGuard({ code: 'RMT_AUTO_MEMORY_CORRUPT' }), { action: 'stop', rewrite: false });
    assert.equal(policy.autoMemoryRuntimeWake(broken, 10), false);
    assert.deepEqual(broken, copy);
    const enabled = {
        [plans.AUTO_MEMORY_PLAN_KEY]: snapshot().plan,
        [plans.AUTO_MEMORY_REVEAL_KEY]: [],
        [plans.AUTO_MEMORY_DRAW_TICKETS_KEY]: [],
        [plans.AUTO_MEMORY_MODULE_PLAN_KEY]: null,
    };
    assert.equal(policy.autoMemoryRuntimeWake(enabled, 4), true);
    enabled[plans.AUTO_MEMORY_PLAN_KEY] = { ...enabled[plans.AUTO_MEMORY_PLAN_KEY], nextDueFloor: 20, lastCompletedFloor: 15 };
    assert.equal(policy.autoMemoryRuntimeWake(enabled, 16), false);
    assert.equal(policy.autoMemoryRuntimeWake(enabled, 20), true);
});

test('a changed roster asks before rebuild and declining keeps the old archive', async () => {
    assert.equal(wizard.archiveRebuildChoice({ cardChoiceDirty: true, archivePresent: true }), 'ask');
    assert.equal(wizard.archiveActionAfterChoice({ asked: 'ask', rebuild: true, doArchive: false }), 'rebuild');
    assert.equal(wizard.archiveActionAfterChoice({ asked: 'ask', rebuild: false, doArchive: true }), 'keep');
    assert.equal(wizard.archiveActionAfterChoice({ asked: 'keep', rebuild: false, doArchive: true }), 'create');
    assert.equal(wizard.archiveRebuildChoice({ cardChoiceDirty: true, archivePresent: false }), 'keep');
    let ran = 0;
    const locks = { request: async (name, options, job) => {
        assert.equal(name, 'heartbeat-auto-memory:chat-a');
        assert.equal(options.ifAvailable, true);
        await job({ name });
    } };
    const acquired = await gate.withAutoMemoryLock(locks, 'chat-a', async () => { ran += 1; });
    const missed = await gate.withAutoMemoryLock({ request: async (_name, _options, job) => { await job(null); } }, 'chat-a', async () => { ran += 1; });
    assert.equal(acquired.acquired, true);
    assert.equal(missed.acquired, false);
    assert.equal(ran, 1);
});
