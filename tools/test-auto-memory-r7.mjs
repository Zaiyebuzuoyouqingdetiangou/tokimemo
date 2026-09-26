import assert from 'node:assert/strict';
import test from 'node:test';
import * as draw from '../src/autoMemory/draw.js';
import * as floor from '../src/autoMemory/floorPace.js';
import * as gap from '../src/autoMemory/gapFill.js';
import * as gate from '../src/autoMemory/incrementalGate.js';
import * as lookback from '../src/autoMemory/achievementLookback.js';
import * as plans from '../src/autoMemory/modulePlans.js';
import * as planStore from '../src/autoMemory/planStore.js';
import * as shell from '../src/autoMemory/shellState.js';

const memory = (id, extra) => ({ id, sourceKind: 'chat', date: '春日', summary: '一起看过晚霞', messageStart: 6, messageEnd: 8, ...extra });

test('a due floor reads the floors since the last completion', () => {
    assert.deepEqual(floor.dueFloorWindow(5, 10), { start: 6, end: 10 });
    assert.equal(floor.dueFloorWindow(10, 10), null);
    assert.equal(floor.formatFloorRemain(floor.floorsRemaining(8, 13)), '还差 5 楼');
    assert.equal(floor.formatFloorRemain(floor.floorsRemaining(12, 13)), '还差 1 楼');
    assert.equal(floor.formatFloorRemain(floor.floorsRemaining(13, 13)), '');
    const chat = [
        { is_user: true, mes: '用户' },
        { is_user: false, mes: '第一段很长的角色回复，应该收成摘要。' },
        { is_user: false, mes: '第二段角色回复。' },
        { is_user: true, mes: '再问一句' },
        { is_user: false, mes: '最新一条角色楼的完整正文。' },
    ];
    assert.equal(floor.assistantFloorCount(chat), 3);
    assert.deepEqual(floor.chatRangeForAssistantSpan(chat, 2, 3), { start: 3, end: 5 });
    const mixed = floor.latestAssistantWindow([
        { role: 'user', text: '用户' },
        { role: 'char', text: '第一段很长的角色回复，应该收成摘要。' },
        { role: 'char', text: '第二段角色回复。' },
        { role: 'char', text: '最新一条角色楼的完整正文。' },
    ], 3);
    assert.equal(mixed.length, 3);
    assert.equal(mixed[2].text, '最新一条角色楼的完整正文。');
    assert.equal(mixed[0].text, '第一段很长的角色回复，应该收成摘要。');
    assert.equal(floor.latestAssistantWindow([{ role: 'char', text: '只有最新楼。' }], 1)[0].text, '只有最新楼。');
    assert.equal(floor.countdownLabel(5, 5), '回忆还有 5 楼');
    assert.equal(floor.countdownLabel(1, 5), '回忆还有 1 楼');
    assert.equal(floor.countdownLabel(0, 5), '');
    assert.equal(floor.countdownLabel(1, 1), '');
    assert.equal(floor.assistantBodyReady(chat), true);
    assert.equal(floor.assistantBodyReady(chat, { generating: true }), false);
    assert.equal(floor.assistantBodyReady(chat.slice(0, 4)), false);
    assert.equal(floor.assistantBodyReady([...chat.slice(0, 4), { is_user: false, mes: '   ' }]), false);
    assert.equal(floor.assistantBodyReady([...chat, { is_system: true, mes: '系统' }]), true);
    assert.equal(floor.assistantBodyReady([...chat.slice(0, 4), { is_user: false, mes: '...' }]), false);
});

test('the waiting shell shows the floor countdown and does not block input', () => {
    const pace = shell.shellView({ enabled: true, archiveReady: true, floor: 8, nextDueFloor: 13 });
    assert.equal(pace.phase, 'pace');
    assert.equal(pace.detail, '还差 5 楼');
    assert.equal(pace.blocksInput, false);
    assert.equal(JSON.stringify(pace).includes('建档'), false);
    assert.equal(shell.shellView({ enabled: true, archiveReady: false, floor: 8, nextDueFloor: 13 }).phase, 'hidden');
    const noted = shell.shellView({
        enabled: true, archiveReady: true, floor: 8, nextDueFloor: 13,
        gapText: '这一轮没有新的档案编号，倒计时已经进入下一间隔。', canFill: true,
    });
    assert.equal(noted.detail, '还差 5 楼');
    assert.equal(noted.canFill, true);
    assert.equal(shell.shellView({ enabled: true, archiveReady: true, floor: 8, nextDueFloor: 9, intervalFloors: 1 }).phase, 'hidden');
    assert.equal(shell.shellView({ enabled: true, archiveReady: true, floor: 12, nextDueFloor: 13, intervalFloors: 5 }).detail, '还差 1 楼');
    assert.equal(shell.shellView({ enabled: true, archiveReady: true, floor: 13, nextDueFloor: 13, intervalFloors: 5 }).phase, 'hidden');
    assert.equal(gap.readableGap({ schemaVersion: 1, floor: 10, reason: 'no-new-memory', filled: false }).canFill, true);
    assert.equal(gap.readableGap({ schemaVersion: 1, floor: 10, reason: 'no-new-memory', filled: true }).canFill, false);
    const titled = {};
    assert.equal(gap.rememberAchievementTitle(titled, { id: 'achv0001', title: '晚霞' }), true);
    assert.equal(gap.rememberedAchievementTitle(titled, 'achv0001'), '晚霞');
    const one = gap.oneSupplementMemory({
        memories: [
            { title: '晚霞', summary: '一起看过。', date: '春日', messageStart: 2, messageEnd: 9 },
            { title: '不该出现', summary: '第二条' },
        ],
    }, { start: 6, end: 8 });
    assert.equal(one.title, '晚霞');
    assert.equal(one.messageStart, 6);
    assert.equal(one.messageEnd, 8);
    assert.equal(gap.oneSupplementMemory({ memories: [] }, { start: 6, end: 8 }), null);
});

test('never-generated modules stay in the draw unless the user excluded them', () => {
    const modules = [
        { id: 'cabinet', inDrawPool: true, autoEligible: true, achievementMerged: true, prerequisites: [] },
        { id: 'inbox', inDrawPool: true, autoEligible: true, achievementMerged: true, prerequisites: [] },
        { id: 'items', inDrawPool: true, autoEligible: true, achievementMerged: true, prerequisites: ['room'] },
    ];
    assert.deepEqual(draw.roundCandidateIds(modules, { excludedModuleIds: ['inbox'], satisfiedPrerequisiteIds: [] }), ['cabinet']);
    assert.equal(plans.buildModulePlan('inbox', { letters: 0 }), null);
    const first = plans.buildModulePlan('inbox', { letters: 0, firstGeneration: true });
    assert.equal(first.steps[0].kind, 'catalog');
});

test('a due round asks the importer for that floor window before drawing', async () => {
    const calls = [];
    const snapshot = planStore.parseAutoMemorySnapshot({
        plan: planStore.createAutoMemoryPlan({
            revision: 2, updatedAt: 20, enabled: true, intervalFloors: 5,
            preferredModuleIds: [], excludedModuleIds: ['inbox'], legacyPreferencesMigrated: true,
            nextDueFloor: 10, lastCompletedFloor: 5,
        }),
        revealRecords: [], drawTickets: [], modulePlan: null,
    });
    const result = await gate.runAutoMemoryRound({
        snapshot, floor: 10, memoryIds: [], now: 50, archiveRevision: 'rev-1', chatId: 'chat-1',
        modules: [
            { id: 'cabinet', inDrawPool: true, autoEligible: true, achievementMerged: true, prerequisites: [] },
            { id: 'inbox', inDrawPool: true, autoEligible: true, achievementMerged: true, prerequisites: [] },
        ],
        satisfiedPrerequisiteIds: [],
    }, {
        importIncremental: async options => { calls.push(options); },
        readMemoryIds: async () => ['M100'],
        random: () => 0,
        nextId: () => 'drawticket1',
        prepareModulePlan: async () => ({
            version: 1, drawId: 'drawticket1', moduleId: 'cabinet', chatId: 'chat-1', archiveRevision: 'rev-1',
            sourceMemoryIds: ['M100'], expectedRequestRange: { min: 1, max: 1 }, frozenAt: 30,
            steps: [{ id: 'body', kind: 'generate', order: 0, status: 'pending', recoverySlot: 'slot-body' }],
        }),
        persist: async () => {},
        startModule: async () => { calls.push('start'); },
    });
    assert.deepEqual(calls[0], { automatic: true, floorWindow: { start: 6, end: 10 } });
    assert.equal(result.moduleRequest, true);
    assert.deepEqual(result.snapshot.drawTickets[0].candidates.map(item => item.id), ['cabinet']);
});

test('historical achievements jump to covered chat floors and external sources do not', () => {
    const historical = lookback.achievementLookback(
        { sourceMemoryIds: ['M100', 'M999'], kind: 'historical' },
        [memory('M100'), memory('M101', { messageStart: 2, messageEnd: 2 })],
        [{ start: 1, end: 20 }],
    );
    assert.equal(historical.kind, 'historical');
    assert.equal(historical.period, '春日');
    assert.equal(historical.jumpFloor, 6);
    assert.deepEqual(historical.floors, [6, 7, 8]);
    const invented = lookback.achievementLookback(
        { sourceMemoryIds: ['M100'] },
        [memory('M100', { messageStart: 80, messageEnd: 82 })],
        [{ start: 1, end: 20 }],
    );
    assert.equal(invented.jumpFloor, null);
    assert.equal(invented.floors.length, 0);
    const external = lookback.achievementLookback(
        { sourceMemoryIds: ['M100'] },
        [memory('M100', { sourceKind: 'external' })],
        [{ start: 1, end: 20 }],
    );
    assert.equal(external.jumpFloor, null);
    assert.match(external.sourceNote, /外部或继承/);
    const collection = lookback.achievementLookback({ sourceMemoryIds: ['M404'], kind: 'historical' }, [memory('M100')]);
    assert.equal(collection.kind, 'collection');
    assert.equal(collection.jumpFloor, null);
    const mixed = lookback.achievementLookback(
        { sourceMemoryIds: ['M100', 'M200'], kind: 'historical' },
        [memory('M100'), memory('M200', { sourceKind: 'inherited-archive' })],
        [{ start: 1, end: 20 }],
    );
    assert.equal(mixed.jumpFloor, 6);
    assert.equal(mixed.sourceNote, '');
    const autoLetter = lookback.achievementLookback(
        { sourceMemoryIds: ['M100'], kind: 'historical', origin: 'auto', messageIndex: 55 },
        [memory('M100', { sourceKind: 'external-current-chat', messageStart: 0, messageEnd: 0 })],
        [{ start: 1, end: 20 }],
    );
    assert.equal(autoLetter.jumpMesid, 55);
    assert.equal(autoLetter.sourceNote, '');
    assert.equal(autoLetter.kind, 'historical');
    const fromTicket = lookback.autoLetterMesid(
        { origin: 'auto', moduleId: 'cabinet', sourceMemoryIds: ['M100'] },
        {
            snapshot: { drawTickets: [{ id: 'drawticket1', selectedModuleId: 'cabinet', sourceMemoryIds: ['M100'], dueFloor: 56 }] },
            chat: Array.from({ length: 56 }, () => ({ is_user: false, mes: '角色楼' })),
            locate: (chat, dueFloor) => ({ index: Math.floor(Number(dueFloor)) - 1, message: chat[Math.floor(Number(dueFloor)) - 1] }),
        },
    );
    assert.equal(fromTicket, 55);
});
