import assert from 'node:assert/strict';
import test from 'node:test';
import * as combined from '../src/autoMemory/combinedResult.js';
import * as plans from '../src/autoMemory/planStore.js';
import * as redo from '../src/autoMemory/redo.js';
import * as shell from '../src/autoMemory/shellState.js';
import * as stream from '../src/autoMemory/streamGate.js';
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
    assert.equal(redo.modulePlanForRetry(plan).steps[1].status, 'pending');
    assert.equal(redo.modulePlanForRetry(plan).steps[1].recoverySlot, '');
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
    assert.equal(redo.isSameFloorGeneration('regenerate'), true);
    assert.equal(redo.isSameFloorGeneration('swipe'), true);
    assert.equal(redo.isSameFloorGeneration('normal'), false);
    const gate = redo.createSameFloorGate();
    gate.mark('normal');
    assert.equal(gate.pending(), false);
    gate.mark('regenerate');
    assert.equal(gate.pending(), true);
    assert.equal(gate.consume(), true);
    assert.equal(gate.pending(), false);
    assert.deepEqual(redo.rerollWindow(55, 5), { start: 51, end: 55 });
    assert.deepEqual(redo.rerollWindow(55, 1), { start: 55, end: 55 });
    assert.deepEqual(redo.memoriesWithoutIds([{ id: 'M100' }, { id: 'M200' }], ['M100']).map(item => item.id), ['M200']);
    const kept = view.sessionWithoutRound({
        voiceDramas: [
            { id: 'old', title: '旧', generatedAt: 10, script: [{ speaker: 'char', text: '早' }] },
            { id: 'new', title: '洗车', generatedAt: 80, sourceArchiveMemoryIds: ['M100'], script: [{ speaker: 'char', text: '擦了两下车门' }] },
        ],
        apps: [{ id: 'sms', entries: [
            { id: 'keep', title: '旧信', createdAt: 10 },
            { id: 'drop', title: '新信', sourceMemoryIds: ['M100'], createdAt: 80 },
        ] }],
    }, { sourceMemoryIds: ['M100'], since: 50, createdAt: 90 });
    assert.deepEqual(kept.voiceDramas.map(item => item.id), ['old']);
    assert.deepEqual(kept.apps[0].entries.map(item => item.id), ['keep']);
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
    assert.equal(leaked.detail, '正在生成中');
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
    assert.equal(phone.includes('rmt-phone-screen'), true);
    const garden = view.roundReadingHtml({
        kind: 'relations',
        characterName: '裴司野',
        relationships: [{ name: '星野南', relation: '恋人', summary: '还在一起', isUser: true }],
    });
    assert.equal(garden.includes('rmt-relation-garden'), true);
    assert.equal(garden.includes('rmt-relation-layer-row'), true);
    assert.equal(garden.includes('星野南'), true);
    const album = view.roundReadingHtml({ kind: 'album', entries: [{ title: '雨天', date: '春', desc: '伞' }] });
    assert.equal(album.includes('rmt-card'), true);
    assert.equal(album.includes('rmt-album-layout'), true);
    assert.equal(album.includes('雨天'), true);
    const room = view.roundReadingHtml({
        kind: 'room',
        homeName: '私人生活空间',
        spaces: [{ label: '书桌边', atmosphere: '灯还亮着', objects: [{ label: '台灯', description: '暖光', line: '先坐。' }] }],
    });
    assert.equal(room.includes('rmt-room-map'), true);
    assert.equal(room.includes('rmt-room-scene'), true);
    assert.equal(room.includes('rmt-room-object-layout'), true);
    assert.equal(room.includes('台灯'), true);
    const narrow = shell.promoteNarrowLayout('@media(max-width:760px){.rmt-album-layout{grid-template-columns:1fr}.rmt-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:900px){.rmt-grid{grid-template-columns:repeat(4,1fr)}}');
    assert.equal(narrow.includes('@media'), false);
    assert.equal(narrow.includes('.rmt-floor-shell .rmt-grid'), true);
    assert.equal(narrow.includes('repeat(2'), true);
    assert.equal(narrow.includes('repeat(4'), false);
    const already = shell.promoteNarrowLayout('@media(max-width:600px){.rmt-floor-shell .rmt-room-object-layout{grid-template-columns:repeat(2,minmax(0,1fr))}}');
    assert.equal(already.includes('.rmt-floor-shell .rmt-floor-shell'), false);
    assert.equal(already.includes('.rmt-floor-shell .rmt-room-object-layout'), true);
    const quiet = shell.generationStall({ active: true, running: false, signature: 'a', previous: { signature: 'a', since: 1000 }, now: 1000 + 89999 });
    assert.equal(quiet.stalled, false);
    const stalledClock = shell.generationStall({ active: true, running: false, signature: 'a', previous: { signature: 'a', since: 1000 }, now: 1000 + 90000 });
    assert.equal(stalledClock.stalled, true);
    assert.equal(shell.generationStall({ active: true, running: true, signature: 'a', previous: stalledClock, now: 1000 + 90000 }).stalled, false);
    assert.equal(shell.generationStall({ active: true, running: false, storyOpen: true, signature: 'a', previous: { signature: 'a', since: 1000 }, now: 1000 + 90000 }).stalled, false);
    assert.equal(stream.stopButtonOpen({ hidden: false, style: { display: 'flex' } }), true);
    assert.equal(stream.stopButtonOpen({ hidden: false, style: { display: '' } }, 'none'), false);
    assert.equal(stream.stopButtonOpen({ hidden: false, style: { display: '' } }, 'flex'), true);
    assert.equal(stream.generationOpen({}), false);
    const stoppedRound = shell.shellView({ enabled: true, archiveReady: true, failureRecoverable: true, moduleTitle: '人际庭园', steps: [{ status: 'pending' }] });
    assert.equal(stoppedRound.phase, 'failed');
    assert.equal(stoppedRound.canRetry, true);
    assert.equal(stoppedRound.canComplete, true);
    const idleRound = shell.shellView({ enabled: true, archiveReady: true, stalled: true, ticketStatus: 'drawn' });
    assert.equal(idleRound.phase, 'failed');
    assert.equal(idleRound.canComplete, true);
    assert.equal(idleRound.detail.includes('90 秒'), true);
    const song = view.roundReadingHtml({
        kind: 'themeSong',
        songs: [{ title: '夜航', singer: '南玺', styleDescription: '钢琴', lyrics: '第一行\n第二行', createdAt: 50 }],
    });
    assert.equal(song.includes('<main'), false);
    assert.equal(song.includes('has-songs'), false);
    assert.equal(song.includes('夜航'), true);
    assert.equal(song.includes('第一行'), true);
    assert.equal(song.includes('rmt-letter-song'), true);
    assert.equal(shell.floorShellCss().includes('.rmt-heart-letter .rmt-theme-song'), true);
    const travelKept = view.incrementalProjection({
        kind: 'travel',
        locations: [
            { id: 'N1', name: '旧街', summary: '以前', createdAt: 10 },
            { id: 'N2', name: '河岸', summary: '新去的', sourceMemoryIds: ['M100'], createdAt: 80 },
        ],
    }, { sourceMemoryIds: ['M100'], since: 50 });
    assert.equal(travelKept.kept, true);
    assert.deepEqual(travelKept.session.locations.map(item => item.id), ['N2']);
    const travelHtml = view.roundReadingHtml(travelKept.session);
    assert.equal(travelHtml.includes('河岸'), true);
    assert.equal(travelHtml.includes('旧街'), false);
    assert.equal(travelHtml.includes('rmt-letter-travel'), true);
    const finishedDrawn = shell.shellView({
        ...readyArchive, ticketStatus: 'drawn', moduleComplete: true, steps: [{ status: 'completed' }],
        moduleTitle: '他的出行路线',
    });
    assert.equal(finishedDrawn.phase, 'empty');
    assert.equal(finishedDrawn.canComplete, true);
    const oldLetter = shell.shellView({
        enabled: true, archiveReady: true, moduleComplete: true, canOpen: true,
        steps: [{ status: 'completed' }], revealStatus: 'opened', revealLine: '旧歌',
        floor: 6, drawFloor: 5, intervalFloors: 1, nextDueFloor: 6,
    });
    assert.equal(oldLetter.phase, 'hidden');
});
