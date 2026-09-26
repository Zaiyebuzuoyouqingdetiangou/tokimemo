import assert from 'node:assert/strict';
import test from 'node:test';
import * as shell from '../src/autoMemory/shellState.js';

const steps = [
    { status: 'completed' },
    { status: 'pending' },
    { status: 'pending' },
];
const readyArchive = { archiveReady: true };

test('an unfinished archive hides the shell and an unknown plan does not invent a fraction', () => {
    const waiting = shell.shellView({ enabled: true, archiveReady: false, archive: { waiting: true } });
    assert.equal(waiting.phase, 'hidden');
    assert.equal(waiting.showReveal, false);
    const archiving = shell.shellView({ enabled: true, archive: { waiting: false, done: 1, total: 2 }, steps });
    assert.equal(archiving.phase, 'hidden');
    assert.equal(JSON.stringify(archiving).includes('建档'), false);
    const generating = shell.shellView({
        enabled: true, ...readyArchive, moduleComplete: false, revealStatus: 'ready', steps, moduleId: 'cabinet',
    });
    assert.equal(generating.phase, 'generating');
    assert.deepEqual(generating.progress, { done: 1, total: 3 });
    assert.equal(generating.detail, '正在生成中');
    assert.equal(generating.detail.includes('%'), false);
    assert.equal(generating.showReveal, false);
    const planning = shell.shellView({ enabled: true, ...readyArchive, steps: [{ status: 'pending' }, { status: 'pending' }] });
    assert.equal(planning.phase, 'planning');
    assert.equal(planning.progress, null);
    const drawn = shell.shellView({ enabled: true, ...readyArchive, ticketStatus: 'drawn', moduleTitle: '两个人的陈列柜' });
    assert.equal(drawn.phase, 'generating');
    assert.equal(drawn.title, '回忆正在生成中');
    assert.equal(shell.shellView({ enabled: true, ...readyArchive, paused: true, steps }).phase, 'paused');
    assert.equal(shell.shellView({ enabled: true, ...readyArchive, failureRecoverable: true, steps }).phase, 'failed');
    const checked = shell.shellView({ enabled: true, ...readyArchive, moduleComplete: false, steps: [{ status: 'completed' }], revealStatus: 'ready' });
    assert.equal(checked.showReveal, false);
    assert.equal(checked.detail, '正在生成中');
    const library = shell.shellView({
        enabled: true, ...readyArchive, moduleComplete: true, canOpen: true, revealStatus: 'ready',
        steps: [{ status: 'completed' }], preferLibraryAchievement: true, revealLine: '穿堂春风', achievementCopy: '初春微寒。',
        moduleTitle: '角色互动', userName: '南玺',
    });
    assert.equal(library.title, '穿堂春风');
    assert.equal(library.achievementCopy, '初春微寒。');
    const unnamed = shell.shellView({
        enabled: true, ...readyArchive, moduleComplete: true, canOpen: true, revealStatus: 'ready',
        steps: [{ status: 'completed' }], preferLibraryAchievement: true, moduleTitle: '角色互动', userName: '南玺',
    });
    assert.equal(unnamed.title, '');
});

test('the reveal line appears only after the whole plan is complete and does not block chat', () => {
    assert.equal(shell.shellBlocksChatInput(), false);
    const hidden = shell.shellView({
        enabled: true, ...readyArchive, moduleComplete: true, revealStatus: 'achievement_pending', steps: [{ status: 'completed' }],
    });
    assert.equal(hidden.phase, 'achievement-pending');
    assert.equal(hidden.showReveal, false);
    const face = shell.revealFace({ userName: '小满', moduleTitle: '两个人的陈列柜' });
    const ready = shell.shellView({
        enabled: true, ...readyArchive, moduleComplete: true, revealStatus: 'ready', steps: [{ status: 'completed' }],
        moduleId: 'cabinet', revealId: 'reveal0001', revealLine: face,
    });
    assert.equal(ready.showReveal, true);
    assert.equal(ready.title, '小满获得了两个人的陈列柜的成就');
    assert.equal(ready.detail, '点击查看详情');
    assert.equal(ready.blocksInput, false);
    assert.equal(ready.revealId, 'reveal0001');
    const again = shell.shellView({
        enabled: true, ...readyArchive, moduleComplete: true, revealStatus: 'ready', steps: [{ status: 'completed' }],
        moduleId: 'cabinet', revealId: 'reveal0001', revealLine: face,
    });
    assert.deepEqual(again, ready);
    const opened = shell.shellView({
        enabled: true, ...readyArchive, moduleComplete: true, revealStatus: 'opened', steps: [{ status: 'completed' }],
        moduleId: 'cabinet', revealLine: face,
    });
    assert.equal(opened.showReveal, true);
    assert.equal(shell.shellView({ enabled: false, archiveReady: true, revealStatus: 'ready', moduleComplete: true, steps: [{ status: 'completed' }] }).phase, 'hidden');
});

test('toasts explain success and failure once the phase actually changes', () => {
    const face = { line: '小满获得了陈列柜的成就' };
    assert.equal(shell.toastForTransition('', 'reveal', face, { initial: true }), null);
    const success = shell.toastForTransition('generating', 'reveal', face);
    assert.equal(success.level, 'success');
    assert.equal(success.title, '心口一热');
    assert.equal(success.message.includes('今天留下了新的回忆'), true);
    assert.equal(success.message.includes('小满获得了陈列柜的成就'), true);
    const failure = shell.toastForTransition('generating', 'failed');
    assert.equal(failure.level, 'error');
    assert.equal(failure.message.includes('可以补全没写完的部分'), true);
    assert.equal(shell.toastForTransition('failed', 'failed'), null);
    assert.equal(shell.toastForTransition('reveal', 'reveal', face), null);
    const css = shell.floorShellCss();
    assert.equal(css.includes('position:relative'), true);
    assert.equal(css.includes('position:fixed'), false);
    assert.equal(css.includes('summary'), true);
    assert.equal(css.includes('details'), true);
});
