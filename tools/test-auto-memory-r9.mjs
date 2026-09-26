import assert from 'node:assert/strict';
import test from 'node:test';
import * as combined from '../src/autoMemory/combinedResult.js';
import * as plans from '../src/autoMemory/planStore.js';
import * as redo from '../src/autoMemory/redo.js';
import * as shell from '../src/autoMemory/shellState.js';
import * as view from '../src/autoMemory/incrementalView.js';

function snapshot(modulePlan = null) {
    return plans.parseAutoMemorySnapshot({
        plan: plans.createAutoMemoryPlan({
            revision: 2, updatedAt: 20, enabled: true, intervalFloors: 5,
            preferredModuleIds: ['cabinet'], legacyPreferencesMigrated: true,
        }),
        revealRecords: [], drawTickets: [], modulePlan,
    });
}

function modulePlan() {
    return {
        version: 1, drawId: 'drawticket1', moduleId: 'cabinet', chatId: 'chat-1', archiveRevision: 'rev-1',
        sourceMemoryIds: ['M100'], expectedRequestRange: { min: 1, max: 1 }, frozenAt: 30,
        steps: [{ id: 'body', kind: 'generate', order: 0, status: 'pending', recoverySlot: '' }],
    };
}

test('repair stays one request and replaces the pending reveal in place', () => {
    const pending = combined.settleCombined({
        snapshot: snapshot(modulePlan()), moduleId: 'cabinet', moduleSaved: true, packet: { title: '' },
        sourceMemoryIds: ['M100'], now: 41, revealId: 'reveal0002',
    });
    const repaired = combined.replacePendingAchievement({
        snapshot: pending.snapshot,
        revealId: 'reveal0002',
        packet: { title: '窗边的灯', kind: 'collection', description: '灯还亮着' },
        sourceMemoryIds: ['M100'],
        now: 42,
    });
    assert.equal(combined.repairAchievementRequest({ confirmed: true, moduleSaved: true }).requests, 1);
    assert.equal(repaired.action, 'reveal');
    assert.equal(repaired.requests, 1);
    assert.equal(repaired.snapshot.revealRecords.length, 1);
    assert.equal(repaired.snapshot.revealRecords[0].status, 'ready');
    assert.equal(repaired.achievement.title, '窗边的灯');
    const prompt = redo.achievementRepairPrompt({ moduleTitle: '陈列柜', sourceMemoryIds: ['M100'], allowHistorical: false });
    assert.equal(prompt.includes('不要重写模块正文'), true);
    assert.equal(prompt.includes('JSON'), true);
});

test('automatic repair follows the existing retry switch and keeps finished steps', () => {
    assert.equal(redo.shouldAutoRepair({ enabled: false, used: 0, limit: 3 }), false);
    assert.equal(redo.shouldAutoRepair({ enabled: true, used: 3, limit: 3 }), false);
    assert.equal(redo.shouldAutoRepair({ enabled: true, used: 1, limit: 3 }), true);
    assert.equal(redo.retryableFailure({ code: 'QUOTA' }), false);
    assert.equal(redo.retryableFailure({ name: 'AbortError' }), false);
    assert.equal(redo.retryableFailure({ code: 'RMT_JSON_INVALID' }), true);
    const plan = {
        steps: [
            { id: 'index', status: 'completed', recoverySlot: 'album:index' },
            { id: 'comments', status: 'failed', recoverySlot: 'failed' },
        ],
    };
    assert.equal(redo.modulePlanForRetry(plan).steps[0].status, 'completed');
    assert.equal(redo.modulePlanForRetry(plan).steps[1].status, 'failed');
    const finished = {
        steps: [
            { id: 'index', status: 'completed', recoverySlot: 'album:index' },
            { id: 'comments', status: 'completed', recoverySlot: 'album:comments' },
        ],
    };
    const reset = redo.modulePlanForRetry(finished);
    assert.equal(reset.steps[0].status, 'completed');
    assert.equal(reset.steps[1].status, 'pending');
    assert.equal(redo.resetModuleSteps(finished).steps.every(step => step.status === 'pending'), true);
});

test('a rerolled draw floor is a new body, and redraw can leave the current module', () => {
    const chat = [
        { is_user: true, mes: '你好' },
        { mes: '第一句' },
        { mes: '第二句' },
    ];
    const located = redo.drawFloorMessage(chat, 2, true);
    assert.equal(located.index, 2);
    const stamp = redo.sourceStamp(chat, 2, true, 'drawticket1');
    assert.equal(redo.swipeNeedsRegenerate({ stamp, messageIndex: 2, hash: stamp.hash }), false);
    assert.equal(redo.swipeNeedsRegenerate({ stamp, messageIndex: 2, hash: '8:1' }), true);
    assert.equal(redo.swipeNeedsRegenerate({ stamp, messageIndex: 1, hash: '8:1' }), false);
    assert.equal(redo.swipeNeedsRegenerate({ stamp: null, messageIndex: 2, hash: '8:1', ticketMessageIndex: 2 }), true);
    const next = redo.redrawModuleId([{ id: 'album' }, { id: 'cabinet' }], 'album', 0.9);
    assert.equal(next, 'cabinet');
    const only = redo.redrawModuleId([{ id: 'album' }], 'album', 0);
    assert.equal(only, 'album');
});

test('the letter offers repair and retry only when that work is still open', () => {
    const readyArchive = { enabled: true, archiveReady: true };
    const pending = shell.shellView({
        ...readyArchive, moduleComplete: true, revealStatus: 'achievement_pending', steps: [{ status: 'completed' }],
    });
    assert.equal(pending.canRepairAchievement, true);
    assert.equal(pending.canRetry, false);
    const failed = shell.shellView({ ...readyArchive, failureRecoverable: true, steps: [{ status: 'failed' }] });
    assert.equal(failed.canRetry, true);
    const stopped = shell.shellView({
        ...readyArchive, moduleComplete: false, steps: [{ status: 'completed' }, { status: 'pending' }],
    });
    assert.equal(stopped.canRetry, true);
    const running = shell.shellView({
        ...readyArchive, moduleComplete: false, steps: [{ status: 'running' }, { status: 'pending' }],
    });
    assert.equal(running.canRetry, false);
    const planning = shell.shellView({ ...readyArchive, steps: [{ status: 'pending' }] });
    assert.equal(planning.canRetry, false);
    const writing = shell.shellView({ ...readyArchive, ticketStatus: 'drawn', moduleTitle: '他的出行路线' });
    assert.equal(writing.phase, 'generating');
    assert.equal(writing.title, '回忆正在生成中');
    assert.equal(writing.canComplete, false);
    assert.equal(writing.canOpen, false);
    const leaked = shell.shellView({
        ...readyArchive, ticketStatus: 'drawn', moduleTitle: '角色互动', canOpen: true, moduleId: 'heart',
    });
    assert.equal(leaked.phase, 'generating');
    assert.equal(leaked.detail, '正在写角色互动。');
    assert.equal(leaked.canOpen, false);
    assert.equal(leaked.showReveal, false);
    const finished = shell.shellView({
        ...readyArchive, ticketStatus: 'drawn', moduleTitle: '角色互动', canOpen: true, moduleId: 'heart',
        moduleComplete: true, steps: [{ status: 'completed' }], revealLine: '你获得了春日洗车摊的成就',
    });
    assert.equal(finished.phase, 'reveal');
    assert.equal(finished.showReveal, true);
    assert.equal(finished.canOpen, true);
    assert.equal(finished.title, '你获得了春日洗车摊的成就');
    assert.equal(finished.detail.includes('正在写'), false);
    const empty = shell.shellView({ ...readyArchive, roundEmpty: true, moduleComplete: true, revealStatus: 'ready', steps: [{ status: 'completed' }] });
    assert.equal(empty.phase, 'empty');
    assert.equal(empty.canComplete, true);
    assert.equal(empty.canRedo, true);
    const heart = view.incrementalProjection({
        relationshipSummary: '还在说话',
        fireflyVoices: [
            { id: 'old', title: '旧的萤火虫' },
            { id: 'F01', title: '灯', sourceMemoryIds: ['M100'] },
        ],
    }, { sourceMemoryIds: ['M100'], since: 0 });
    assert.equal(heart.kept, true);
    assert.deepEqual(heart.session.fireflyVoices.map(item => item.id), ['F01']);
    assert.equal(view.roundReadingHtml(heart.session).includes('灯'), true);
    assert.equal(view.roundReadingHtml(heart.session).includes('旧的萤火虫'), false);
    assert.equal(view.roundReadingHtml(heart.session).includes('选择你想看的那一页'), false);
    const tail = view.incrementalProjection({
        fireflyVoices: [{ id: 'old', title: '旧' }, { id: 'new', title: '这一轮' }],
        generationMeta: { lastUpdate: { added: 1, updatedAt: 80, consumedMemoryIds: ['M100'] } },
    }, { sourceMemoryIds: ['M100'], since: 50 });
    assert.equal(tail.kept, true);
    assert.deepEqual(tail.session.fireflyVoices.map(item => item.id), ['new']);
    const stale = view.incrementalProjection({
        relationshipSummary: '旧的',
        generationMeta: { lastUpdate: { added: 0, updatedAt: 10, consumedMemoryIds: ['M001'] } },
    }, { sourceMemoryIds: ['M100'], since: 50 });
    assert.equal(stale.kept, false);
    const stamped = view.incrementalProjection({
        voiceDramas: [{ id: 'v1', title: '春日', season: 'spring', generatedAt: 80, script: [{ speaker: 'user', text: '擦了两下车门' }, { speaker: 'char', text: '水压太大' }] }],
    }, { sourceMemoryIds: ['M200'], since: 50, createdAt: 90 });
    assert.equal(stamped.kept, true);
    const bubbles = view.roundReadingHtml(stamped.session, { characterName: '裴司野', userName: '星野南', charAvatar: 'char.png', userAvatar: 'user.png' });
    assert.equal(bubbles.includes('rmt-heart-line user'), true);
    assert.equal(bubbles.includes('user.png'), true);
    assert.equal(bubbles.includes('擦了两下车门'), true);
    const phone = view.roundReadingHtml({
        apps: [{ label: '短信', entries: [{ title: '今晚', messages: [{ speaker: '他', speakerRole: 'owner', text: '到了' }] }] }],
    });
    assert.equal(phone.includes('rmt-phone-shell'), true);
    assert.equal(phone.includes('rmt-phone-message-owner'), true);
});
