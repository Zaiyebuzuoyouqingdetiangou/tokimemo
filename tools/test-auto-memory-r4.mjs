import assert from 'node:assert/strict';
import test from 'node:test';
import * as shell from '../src/autoMemory/shellState.js';

const steps = [
    { status: 'completed' },
    { status: 'pending' },
    { status: 'pending' },
];

test('an unknown plan does not invent a fraction and an unfinished plan hides the reveal', () => {
    const archive = shell.shellView({ enabled: true, archive: { waiting: false, done: null, total: null } });
    assert.equal(archive.phase, 'archiving');
    assert.equal(archive.progress, null);
    assert.equal(archive.detail, '正在建档');
    assert.equal(archive.detail.includes('%'), false);
    assert.equal(archive.showReveal, false);
    const generating = shell.shellView({
        enabled: true, moduleComplete: false, revealStatus: 'ready', steps, moduleId: 'cabinet',
    });
    assert.equal(generating.phase, 'generating');
    assert.deepEqual(generating.progress, { done: 1, total: 3 });
    assert.equal(generating.detail, '正在生成 1 / 3');
    assert.equal(generating.showReveal, false);
    const planning = shell.shellView({ enabled: true, steps: [{ status: 'pending' }, { status: 'pending' }] });
    assert.equal(planning.phase, 'planning');
    assert.equal(planning.progress, null);
    assert.equal(shell.shellView({ enabled: true, ticketStatus: 'drawn', moduleTitle: '两个人的陈列柜' }).phase, 'drawn');
    assert.equal(shell.shellView({ enabled: true, paused: true, steps }).phase, 'paused');
    assert.equal(shell.shellView({ enabled: true, failureRecoverable: true, steps }).phase, 'failed');
    assert.equal(shell.shellView({ enabled: true, archive: { waiting: true } }).phase, 'waiting-archive');
    assert.equal(shell.shellView({ enabled: true, archive: { done: 1, total: 2 } }).detail, '正在建档 1 / 2');
    const checked = shell.shellView({ enabled: true, moduleComplete: false, steps: [{ status: 'completed' }], revealStatus: 'ready' });
    assert.equal(checked.showReveal, false);
    assert.equal(checked.detail, '还没整份核对完，先不拆开。');
});

test('the reveal line appears only after the whole plan is complete and does not block chat', () => {
    assert.equal(shell.shellBlocksChatInput(), false);
    const hidden = shell.shellView({
        enabled: true, moduleComplete: true, revealStatus: 'achievement_pending', steps: [{ status: 'completed' }],
    });
    assert.equal(hidden.phase, 'achievement-pending');
    assert.equal(hidden.showReveal, false);
    const face = shell.revealFace({ userName: '小满', moduleTitle: '两个人的陈列柜' });
    const ready = shell.shellView({
        enabled: true, moduleComplete: true, revealStatus: 'ready', steps: [{ status: 'completed' }],
        moduleId: 'cabinet', revealLine: face,
    });
    assert.equal(ready.showReveal, true);
    assert.equal(ready.title, '小满获得了两个人的陈列柜的成就');
    assert.equal(ready.detail, '点击查看详情');
    assert.equal(ready.blocksInput, false);
    const again = shell.shellView({
        enabled: true, moduleComplete: true, revealStatus: 'ready', steps: [{ status: 'completed' }],
        moduleId: 'cabinet', revealLine: face,
    });
    assert.deepEqual(again, ready);
    assert.equal(shell.shellView({ enabled: false, revealStatus: 'ready', moduleComplete: true, steps: [{ status: 'completed' }] }).phase, 'hidden');
});

test('toasts explain success and failure once the phase actually changes', () => {
    const face = { line: '小满获得了陈列柜的成就' };
    assert.equal(shell.toastForTransition('', 'reveal', face, { initial: true }), null);
    const success = shell.toastForTransition('generating', 'reveal', face);
    assert.equal(success.level, 'success');
    assert.equal(success.title, '心口一热');
    assert.equal(success.message.includes('小满获得了陈列柜的成就'), true);
    const failure = shell.toastForTransition('generating', 'failed');
    assert.equal(failure.level, 'error');
    assert.equal(failure.message.includes('已经记下的部分还在'), true);
    assert.equal(shell.toastForTransition('failed', 'failed'), null);
    const css = shell.floorShellCss();
    assert.equal(css.includes('position:static'), true);
    assert.equal(css.includes('position:fixed'), false);
});
