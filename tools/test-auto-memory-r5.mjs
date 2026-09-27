import assert from 'node:assert/strict';
import test from 'node:test';
import * as combined from '../src/autoMemory/combinedResult.js';
import * as plans from '../src/autoMemory/planStore.js';
import * as registry from '../src/autoMemory/moduleRegistry.js';

function snapshot(modulePlan = null) {
    return plans.parseAutoMemorySnapshot({
        plan: plans.createAutoMemoryPlan({
            revision: 2, updatedAt: 20, enabled: true, intervalFloors: 5,
            preferredModuleIds: ['cabinet'], legacyPreferencesMigrated: true,
        }),
        revealRecords: [], drawTickets: [], modulePlan,
    });
}

function modulePlan(moduleId = 'cabinet') {
    return {
        version: 1, drawId: 'drawticket1', moduleId, chatId: 'chat-1', archiveRevision: 'rev-1',
        sourceMemoryIds: ['M100'], expectedRequestRange: { min: 1, max: 1 }, frozenAt: 30,
        steps: [{ id: 'body', kind: 'generate', order: 0, status: 'pending', recoverySlot: 'slot-body' }],
    };
}

test('adapted modules count complete only when every step is done', () => {
    for (const id of ['cabinet', 'calendar', 'relations', 'inbox', 'album', 'phone', 'heart']) {
        const item = registry.autoMemoryModuleById(id);
        assert.equal(item.autoEligible, true);
        assert.equal(item.achievementMerged, true);
        assert.equal(item.isComplete(null, modulePlan(id)), false);
        assert.equal(item.isComplete(null, { steps: [{ status: 'completed' }, { status: 'completed' }] }), true);
    }
    assert.equal(registry.autoMemoryModuleById('achievements').autoEligible, false);
    assert.deepEqual(registry.autoMemoryRuntimeCandidates(['cabinet', 'inbox', 'achievements'], ['inbox']), ['cabinet']);
});

test('a combined response saves the module and one reveal without a second achievement request', () => {
    const packet = combined.parseCombinedResponse({
        moduleResult: { items: [] }, achievement: { id: 'achv0001', title: '第一件纪念品', kind: 'historical' },
    });
    assert.equal(packet.ok, true);
    const saved = combined.settleCombined({
        snapshot: snapshot(modulePlan()), moduleId: 'cabinet', moduleSaved: true, packet,
        sourceMemoryIds: ['M100'], allowHistorical: true, now: 40, revealId: 'reveal0001',
    });
    assert.equal(saved.action, 'reveal');
    assert.equal(saved.requests, 1);
    assert.equal(saved.extraAchievementRequest, false);
    assert.equal(saved.reveal.id, 'reveal0001');
    assert.equal(saved.reveal.achievementId, 'achv0001');
    assert.equal(saved.snapshot.plan.revision, 3);
    assert.equal(saved.snapshot.modulePlan.steps[0].status, 'completed');
    assert.equal(saved.snapshot.revealRecords.length, 1);
});

test('achievement failure keeps the module and does not open a reveal', () => {
    const pending = combined.settleCombined({
        snapshot: snapshot(modulePlan('calendar')), moduleId: 'calendar', moduleSaved: true, packet: { title: '' },
        sourceMemoryIds: ['M100'], allowHistorical: true, now: 41, revealId: 'reveal0002',
    });
    assert.equal(pending.action, 'achievement-pending');
    assert.equal(pending.redoModule, false);
    assert.equal(pending.extraAchievementRequest, false);
    assert.equal(pending.reveal.status, 'achievement_pending');
    assert.equal(pending.reveal.achievementId, null);
    assert.equal(pending.snapshot.modulePlan.steps[0].status, 'completed');
    assert.equal(combined.repairAchievementRequest({ confirmed: false, moduleSaved: true }).action, 'refused');
    assert.equal(combined.repairAchievementRequest({ confirmed: true, moduleSaved: true }).redoesModule, false);
});

test('an empty inbox plan is a noop and a historical achievement without memories is refused', () => {
    const empty = combined.settleCombined({
        snapshot: snapshot(modulePlan('inbox')), moduleId: 'inbox', moduleSaved: true, inboxPlan: [], now: 42,
    });
    assert.equal(empty.action, 'noop');
    assert.equal(empty.requests, 0);
    assert.equal(empty.reveal, null);
    assert.equal(empty.snapshot.revealRecords.length, 0);
    assert.equal(empty.snapshot.plan.revision, 2);
    const historical = combined.classifyAchievement(
        { title: '没有证据', kind: 'historical' },
        { allowHistorical: true, sourceMemoryIds: [] },
    );
    assert.equal(historical.ok, false);
    const held = combined.settleCombined({ snapshot: snapshot(modulePlan()), moduleId: 'cabinet', moduleSaved: false, now: 43 });
    assert.equal(held.action, 'hold');
    assert.equal(held.snapshot.revealRecords.length, 0);
});
