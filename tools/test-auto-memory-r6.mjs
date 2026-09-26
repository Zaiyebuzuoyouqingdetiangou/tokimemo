import assert from 'node:assert/strict';
import test from 'node:test';
import * as floor from '../src/ui/chatFloorNav.js';
import * as reveal from '../src/ui/memoryReveal.js';
import * as plans from '../src/autoMemory/planStore.js';
import * as shell from '../src/autoMemory/shellState.js';

function snapshot(status = 'ready') {
    return plans.parseAutoMemorySnapshot({
        plan: plans.createAutoMemoryPlan({
            revision: 4, updatedAt: 20, enabled: true, intervalFloors: 5, legacyPreferencesMigrated: true,
        }),
        revealRecords: [{
            id: 'reveal0001', moduleId: 'cabinet', achievementId: 'achv0001', sourceMemoryIds: ['M100'],
            status, createdAt: 30,
        }],
        drawTickets: [],
        modulePlan: null,
    });
}

test('one reveal id is shared and a floor mount does not write the message', () => {
    const targets = reveal.revealTargets('reveal0001');
    assert.equal(targets.toast, targets.floor);
    assert.equal(targets.floor, targets.plugin);
    const mount = reveal.floorMountPlan(8);
    assert.equal(mount.writesMessageText, false);
    assert.equal(mount.sendsToModel, false);
    assert.equal(floor.writesMessageText(), false);
    const message = {
        children: [],
        querySelector(selector) { return selector === '.mes_block' ? this.block : null; },
        block: { children: [], appendChild(node) { this.children.push(node); node.parent = this; return node; } },
    };
    const host = floor.placeAfterMessage(message, tag => ({ tag, className: '', dataset: {}, parent: null }));
    assert.equal(host.parent, message.block);
    assert.equal(message.children.includes(host), false);
    assert.equal(host.dataset.rmtFloorShell, '1');
    assert.equal(reveal.firstReveal('generating', 'ready'), true);
    assert.equal(reveal.firstReveal('ready', 'ready'), false);
    assert.equal(reveal.firstReveal('opened', 'ready'), false);
    const toast = shell.toastForTransition('generating', 'reveal', { line: '你获得了一段回忆的成就' });
    assert.equal(toast.message.includes('今天留下了新的回忆'), true);
    assert.equal(shell.toastForTransition('reveal', 'reveal', { line: '你获得了一段回忆的成就' }), null);
});

test('opening a reveal marks it read once and can be opened again', () => {
    const first = reveal.markRevealOpened(snapshot('ready'), 'reveal0001', 50);
    assert.equal(first.changed, true);
    assert.equal(first.snapshot.revealRecords[0].status, 'opened');
    assert.equal(first.snapshot.plan.revision, 5);
    const second = reveal.markRevealOpened(first.snapshot, 'reveal0001', 60);
    assert.equal(second.changed, false);
    assert.equal(second.snapshot, first.snapshot);
    const view = shell.shellView({
        enabled: true, archiveReady: true, moduleComplete: true, moduleId: 'cabinet', revealId: 'reveal0001',
        revealStatus: 'opened', steps: [{ status: 'completed' }], revealLine: '你获得了陈列柜的成就',
    });
    assert.equal(view.showReveal, true);
    assert.equal(view.phase, 'reveal');
});
