import assert from 'node:assert/strict';
import test from 'node:test';
import * as plans from '../src/autoMemory/planStore.js';
import { runAutoMemoryRound } from '../src/autoMemory/incrementalGate.js';
import { buildModulePlan } from '../src/autoMemory/modulePlans.js';
import { autoMemoryModuleById } from '../src/autoMemory/moduleRegistry.js';
import { runPending } from '../src/autoMemory/moduleRunner.js';
import { disableAutoMemoryPlan, wizardCompletionSnapshot } from '../src/autoMemory/wizardPlan.js';

function memoryId(index) { return `M${String(index).padStart(3, '0')}`; }

function previousSnapshot(count = 40) {
    return plans.parseAutoMemorySnapshot({
        plan: plans.createAutoMemoryPlan({
            enabled: true, revision: 100, intervalFloors: 1,
            lastCompletedFloor: count, nextDueFloor: count + 1,
        }),
        drawTickets: Array.from({ length: count }, (_, index) => ({
            id: `old-ticket-${index + 1}`, dueFloor: index + 1, archiveRevision: 'archive-history',
            candidates: [{ id: 'calendar', weight: 1 }], selectedModuleId: 'calendar',
            sourceMemoryIds: [memoryId(index + 1)], status: index % 3 === 0 ? 'failed' : 'completed',
        })),
        revealRecords: Array.from({ length: count }, (_, index) => ({
            id: `old-reveal-${index + 1}`, moduleId: 'calendar', achievementId: `old-achievement-${index + 1}`,
            sourceMemoryIds: [memoryId(index + 1)], status: 'opened', createdAt: index + 1,
        })),
        modulePlan: null,
    });
}

function roundHarness(snapshot) {
    const metadata = {};
    plans.assignAutoMemoryMetadata(metadata, snapshot);
    let ids = Array.from({ length: snapshot.drawTickets.length }, (_, index) => memoryId(index + 1));
    const generated = [];
    const persist = async next => {
        plans.commitAutoMemoryMetadata(metadata, next, plans.readAutoMemoryMetadata(metadata).plan.revision);
    };
    const module = autoMemoryModuleById('calendar');
    return {
        metadata,
        generated,
        snapshot: () => plans.readAutoMemoryMetadata(metadata),
        async round(floor, { fail = false } = {}) {
            const input = { snapshot: plans.readAutoMemoryMetadata(metadata), floor, memoryIds: [...ids],
                now: floor * 100, chatId: 'chat-history', archiveRevision: 'archive-history', modules: [module] };
            return runAutoMemoryRound(input, {
                importIncremental: async () => { ids = [...ids, memoryId(ids.length + 1)]; return { status: 'saved' }; },
                readMemoryIds: () => ids,
                random: () => 0,
                nextId: () => `new-ticket-${floor}`,
                prepareModulePlan: request => buildModulePlan('calendar', request),
                persist,
                startModule: next => runPending(next, {
                    now: floor * 100 + 1,
                    module,
                    persist,
                    execute: async ({ plan }) => {
                        generated.push({ floor, sourceMemoryIds: [...plan.sourceMemoryIds], fail });
                        return fail ? { saved: false } : {
                            saved: true, recoverySlot: `calendar-${floor}`,
                            achievement: { id: `achievement-${floor}`, title: `回忆 ${floor}`, kind: 'collection' },
                        };
                    },
                }),
            });
        },
    };
}

test('an existing 40-ticket v1 record can make its 41st draw without losing old letters', async () => {
    const previous = previousSnapshot();
    const harness = roundHarness(previous);
    const result = await harness.round(41);
    assert.equal(result.action, 'drawn');
    const saved = harness.snapshot();
    assert.equal(saved.drawTickets.length, 41);
    assert.equal(saved.revealRecords.length, 41);
    assert.deepEqual(saved.drawTickets.slice(0, 40), previous.drawTickets);
    assert.deepEqual(saved.revealRecords.slice(0, 40), previous.revealRecords);
    assert.equal(saved.plan.schemaVersion, 1);
    assert.equal(saved.plan.activeDrawTicketId, null);
    assert.equal(saved.drawTickets.at(-1).status, 'completed');
});

test('500 additional real rounds preserve ticket, letter and achievement references, including failed rounds', async () => {
    const previous = previousSnapshot();
    const harness = roundHarness(previous);
    let successes = 0, failures = 0;
    for (let index = 1; index <= 500; index += 1) {
        const floor = 40 + index;
        const fail = index % 13 === 0;
        const outcome = await harness.round(floor, { fail });
        assert.equal(outcome.action, fail ? 'failed' : 'drawn', `round ${index}`);
        if (fail) failures += 1;
        else successes += 1;
    }
    const saved = harness.snapshot();
    assert.equal(harness.generated.length, 500);
    assert.equal(saved.drawTickets.length, 540);
    assert.equal(saved.revealRecords.length, 40 + successes);
    assert.ok(saved.revealRecords.length > 200);
    assert.equal(successes + failures, 500);
    assert.deepEqual(saved.drawTickets.slice(0, 40), previous.drawTickets);
    assert.deepEqual(saved.revealRecords.slice(0, 40), previous.revealRecords);
    for (const reveal of saved.revealRecords.slice(40)) {
        const ticket = saved.drawTickets.find(row => row.sourceMemoryIds[0] === reveal.sourceMemoryIds[0]);
        assert.ok(ticket, 'each surviving letter still has its original ticket');
        assert.equal(ticket.selectedModuleId, reveal.moduleId);
        assert.equal(reveal.achievementId, `achievement-${ticket.dueFloor}`);
        assert.equal(ticket.status, 'completed');
    }
    const disabled = disableAutoMemoryPlan(harness.metadata, 60000).snapshot;
    plans.assignAutoMemoryMetadata(harness.metadata, disabled);
    const reenabled = wizardCompletionSnapshot(harness.metadata, {
        intervalFloors: 5, preferredModuleIds: [], excludedModuleIds: [],
    }, 61000);
    assert.deepEqual(reenabled.drawTickets, saved.drawTickets);
    assert.deepEqual(reenabled.revealRecords, saved.revealRecords);
    assert.equal(reenabled.plan.enabled, true);
    assert.equal(reenabled.plan.intervalFloors, 5);
    const key = 'chat:' + encodeURIComponent('chat-history');
    const recovered = plans.parseAutoMemoryRecoveryRecord({
        key, schemaVersion: 1, chatId: 'chat-history', revision: reenabled.plan.revision, payload: reenabled,
    });
    assert.deepEqual(recovered.payload, reenabled, 'the unchanged v1 recovery format round-trips all history');
});

test('larger history keeps schema, uniqueness, active-ticket and bounded-field validation', () => {
    const valid = previousSnapshot();
    for (const mutate of [
        snapshot => snapshot.drawTickets.push(structuredClone(snapshot.drawTickets[0])),
        snapshot => snapshot.revealRecords.push(structuredClone(snapshot.revealRecords[0])),
        snapshot => { snapshot.drawTickets[0].selectedModuleId = 'not-a-module'; },
        snapshot => { snapshot.drawTickets[0].sourceMemoryIds = ['invalid-memory']; },
        snapshot => { snapshot.drawTickets[0].status = 'arbitrary'; },
        snapshot => { snapshot.drawTickets[0].extra = 'unexpected'; },
        snapshot => { snapshot.plan.activeDrawTicketId = 'absent-ticket'; },
        snapshot => { snapshot.revealRecords[0].achievementId = '<script>'; },
        snapshot => { snapshot.revealRecords = {}; },
        snapshot => { snapshot.drawTickets = null; },
    ]) {
        const snapshot = structuredClone(valid);
        mutate(snapshot);
        assert.throws(() => plans.parseAutoMemorySnapshot(snapshot), { code: 'RMT_AUTO_MEMORY_CORRUPT' });
    }
});
