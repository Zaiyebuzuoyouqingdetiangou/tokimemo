import assert from 'node:assert/strict';
import test from 'node:test';
import * as plans from '../src/autoMemory/modulePlans.js';
import * as runner from '../src/autoMemory/moduleRunner.js';
import * as store from '../src/autoMemory/planStore.js';
import * as view from '../src/autoMemory/incrementalView.js';

const base = {
    chatId: 'chat-1', archiveRevision: 'rev-1', sourceMemoryIds: ['M100'], drawId: 'drawticket1', frozenAt: 30,
};

function snapshot(modulePlan) {
    const parsed = store.parseModulePlan(modulePlan);
    return store.parseAutoMemorySnapshot({
        plan: store.createAutoMemoryPlan({
            revision: 2, updatedAt: 20, enabled: true, intervalFloors: 5, legacyPreferencesMigrated: true,
            preferredModuleIds: ['cabinet'], activeDrawTicketId: 'drawticket1',
        }),
        revealRecords: [],
        drawTickets: [{
            id: 'drawticket1', dueFloor: 10, archiveRevision: 'rev-1',
            candidates: [{ id: parsed.moduleId, weight: 100 }], selectedModuleId: parsed.moduleId,
            sourceMemoryIds: ['M100'], status: 'drawn',
        }],
        modulePlan: parsed,
    });
}

test('every remaining module freezes a finite plan and refuses an empty one', () => {
    assert.equal(plans.buildModulePlan('inbox', { ...base, letters: 0 }), null);
    assert.equal(plans.buildModulePlan('album', { ...base, unlocked: 0 }), null);
    assert.equal(plans.buildModulePlan('items', { ...base, roomReady: false }), null);
    assert.equal(plans.buildModulePlan('phone', { ...base, apps: 0 }), null);
    assert.equal(plans.buildModulePlan('bedtime', { ...base, bedtime: { action: 'continue' } }), null);
    const album = plans.buildModulePlan('album', { ...base, unlocked: 4 });
    assert.deepEqual(album.steps.map(item => item.kind), ['index', 'snapshot', 'comments', 'comments']);
    const room = plans.buildModulePlan('room', { ...base, slots: 7, repairs: 9 });
    assert.equal(room.steps.filter(item => item.kind === 'repair').length, plans.ROOM_REPAIR_LIMIT);
    const phone = plans.buildModulePlan('phone', { ...base, appIds: ['mail', 'photos', 'notes'] });
    assert.equal(phone.steps.filter(item => item.kind === 'app').length, 3);
    assert.equal(phone.steps[0].kind, 'catalog');
    assert.equal(plans.concurrentSteps(phone.steps.map(item => ({ ...item, status: item.kind === 'catalog' ? 'completed' : 'pending' }))).length, 2);
    const adv = plans.buildModulePlan('adv', { ...base, events: 7 });
    assert.equal(adv.steps.filter(item => item.kind === 'events').length, 2);
    const ending = plans.buildModulePlan('ending', { ...base, routes: 3, confession: true });
    assert.equal(ending.steps.filter(item => item.kind === 'route').length, 3);
    assert.equal(ending.steps.some(item => item.kind === 'confession'), true);
    const heart = plans.buildModulePlan('heart', base);
    assert.deepEqual(heart.steps.map(item => item.id), ['dialogue', 'daily', 'fireflies', 'epilogue', 'spring', 'summer', 'autumn', 'winter']);
    const song = plans.buildModulePlan('themeSong', base);
    assert.equal(song.steps[0].id, 'song-next');
    const chapter = plans.buildModulePlan('bedtime', { ...base, bedtime: { action: 'continue', storyId: 'BED_one' } });
    assert.equal(chapter.steps[0].id, 'cont-BED_one');
    assert.equal(plans.buildModulePlan('timeEcho', base).steps[0].id, 'echo');
    const butterfly = plans.buildModulePlan('butterfly', { ...base, phase: 'increment', prose: 1 });
    assert.deepEqual(butterfly.steps.map(item => item.kind), ['divergences', 'prose']);
    const lives = plans.buildModulePlan('pastLives', { ...base, dossiers: 2, prose: 1 });
    assert.equal(lives.steps.filter(item => item.kind === 'dossier').length, 2);
    assert.equal(lives.steps.at(-1).id, 'echo');
});

test('a catalog expands once, later steps resume, and the last step carries the only achievement', async () => {
    const calls = [];
    const persisted = [];
    const catalog = plans.buildModulePlan('album', base);
    assert.equal(catalog.steps.length, 1);
    const expanded = await runner.runPending(snapshot(catalog), {
        now: 40,
        module: { contentKind: 'historical' },
        persist: async next => { persisted.push(next.modulePlan.steps.map(item => item.status)); },
        execute: async ({ step }) => {
            calls.push(step.id);
            return { expand: { ...base, unlocked: 3 } };
        },
    });
    assert.equal(expanded.action, 'expanded');
    assert.deepEqual(expanded.snapshot.modulePlan.steps.map(item => item.kind), ['catalog', 'snapshot', 'comments']);
    const again = await runner.runPending(expanded.snapshot, {
        now: 41,
        module: { contentKind: 'historical' },
        persist: async next => { persisted.push(next.plan.revision); },
        execute: async ({ step, carryAchievement }) => {
            calls.push(`${step.id}:${carryAchievement}`);
            return { saved: true, recoverySlot: step.id, achievement: carryAchievement ? { title: '新的一页', kind: 'historical', id: 'achv0001' } : null };
        },
    });
    assert.equal(again.action, 'saved');
    assert.equal(calls.at(-1).endsWith(':false'), true);
    const done = await runner.runPending(again.snapshot, {
        now: 42,
        module: { contentKind: 'historical' },
        persist: async () => {},
        execute: async ({ step, carryAchievement }) => {
            calls.push(`${step.id}:${carryAchievement}`);
            return { saved: true, achievement: { title: '新的一页', kind: 'historical', id: 'achv0001' } };
        },
    });
    assert.equal(done.action, 'reveal');
    assert.equal(done.extraAchievementRequest, false);
    assert.equal(done.snapshot.revealRecords.length, 1);
    assert.equal(done.snapshot.plan.activeDrawTicketId, null);
    assert.equal(calls.filter(item => item.endsWith(':true')).length, 1);
});

test('achievement failure keeps the finished steps and an empty increment does not show old entries', async () => {
    const body = plans.buildModulePlan('calendar', base);
    const pending = await runner.runPending(snapshot(body), {
        now: 50,
        module: { contentKind: 'historical' },
        persist: async () => {},
        execute: async () => ({ saved: true, recoverySlot: 'calendar:body' }),
    });
    assert.equal(pending.action, 'achievement-pending');
    assert.equal(pending.snapshot.modulePlan.steps[0].status, 'completed');
    assert.equal(pending.snapshot.revealRecords[0].status, 'achievement_pending');
    const seen = [];
    await runner.runPending(pending.snapshot, {
        now: 51,
        persist: async () => {},
        execute: async () => { seen.push('again'); return { saved: true }; },
    });
    assert.deepEqual(seen, []);
    const projected = view.incrementalProjection({
        letters: [
            { id: 'old', sourceMemoryIds: ['M001'], createdAt: 1 },
            { id: 'new', sourceMemoryIds: ['M100'], createdAt: 10 },
        ],
        stories: [{ id: 'story', chapters: [{ id: 'old-chapter', createdAt: 1 }, { id: 'new-chapter', createdAt: 20 }] }],
    }, { sourceMemoryIds: ['M100'], createdAt: 20 });
    assert.deepEqual(projected.session.letters.map(item => item.id), ['new']);
    assert.deepEqual(projected.session.stories[0].chapters.map(item => item.id), ['new-chapter']);
    assert.equal(projected.kept, true);
    const older = view.incrementalProjection({
        entries: [
            { id: 'a', sourceMemoryIds: ['M001'] },
            { id: 'b', sourceMemoryIds: ['M002'] },
            { id: 'c', sourceMemoryIds: ['M003'] },
            { id: 'd', sourceMemoryIds: ['M004'] },
        ],
        generationMeta: { lastUpdate: { added: 4, updatedAt: 10, consumedMemoryIds: ['M001'] } },
    }, { sourceMemoryIds: ['M100'], since: 50 });
    assert.equal(older.kept, false);
    const shared = view.incrementalProjection({
        entries: [
            { id: 'a', sourceMemoryIds: ['M100'] },
            { id: 'b', sourceMemoryIds: ['M100'] },
            { id: 'c', sourceMemoryIds: ['M100'] },
            { id: 'd', sourceMemoryIds: ['M100'] },
        ],
        generationMeta: { lastUpdate: { added: 1, updatedAt: 80, consumedMemoryIds: ['M100'] } },
    }, { sourceMemoryIds: ['M100'], since: 50 });
    assert.deepEqual(shared.session.entries.map(item => item.id), ['d']);
});
