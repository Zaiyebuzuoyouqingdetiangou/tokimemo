import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatSnapshot } from '../src/core/context.js';
import { roomRequiredPetSpecies, generateRoomWithRepair } from '../src/modes/room.js';
import { normalizeTravel } from '../src/modes/travel.js';
import { loadSession } from '../src/core/cache.js';
import { buildWorldPresentationContext, assertNoBannedGeneratedPhrase } from '../src/generation/client.js';
import { MEMORY_KEY, CACHE_KEY, MEMORY_WORLD_INFO_SETTINGS_KEY } from '../src/core/constants.js';
import { state } from '../src/core/state.js';
import { collectSelectedMemoryWorldInfo } from '../src/archive/repository.js';
import { createFloorScheduler, normalizeAutoUpdates } from '../src/core/autoUpdatePolicy.js';

const bank = { chatId: 'A', archiveRevision: 'r54-fixture', characterName: '林舟', userName: '小雨',
    memories: [{ id: 'M001', title: '河边散步', summary: '林舟和小雨在河边散步。', anchors: ['河边散步'] }] };
const context = () => ({ characterId: 0, chatId: 'A', name1: '小雨', name2: '林舟', characters: [{ name: '林舟', avatar: 'a.png' }],
    extensionSettings: {}, chatMetadata: { [MEMORY_KEY]: bank }, chat: [] });
const acts = () => [
    { time: 'today', wish: 'peace', gesture: 'walk', tone: 'quiet' },
    { time: 'now', emotion: 'joy', wish: 'joy', tone: 'warm' },
    { time: 'tonight', wish: 'good-dreams', gesture: 'listen', tone: 'quiet' },
];
const near = () => ({ id: 'N1', kind: 'near', name: '河边散步', basis: '记忆', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '河边散步', dialogueActs: acts() });

test('r54 automatic baseline mismatch has a fixed diagnostic without retaining private error text', async () => {
    const current = { scope: 'A', ready: true, floor: 2, lifetime: 1, revision: 'r1', rules: normalizeAutoUpdates({ archive: { enabled: true, every: 1 } }) };
    let saved = {};
    const scheduler = createFloorScheduler({ snapshot: () => current, busy: () => false, lock: (_, job) => job(), read: () => saved,
        write: (_, data) => { saved = JSON.parse(JSON.stringify(data)); }, run: () => { throw Object.assign(new Error('private transcript'), { code: 'RMT_ARCHIVE_PREFIX_CHANGED' }); } });
    await scheduler.tick(); current.floor++;
    await scheduler.tick();
    assert.equal(saved.archive.failureCode, 'RMT_ARCHIVE_PREFIX_CHANGED');
    assert.equal(saved.archive.status, 'failed');
    assert.doesNotMatch(JSON.stringify(saved), /private transcript/);
    scheduler.stop();
});

test('r54 exact setting evidence can retain source wording but generated speech and forged excerpts cannot', () => {
    const settings = { bannedGeneratedPhrases: ['老子'] }, source = '林舟说老子养了一只猫。';
    const proof = { mode: 'room', settingText: source };
    assert.doesNotThrow(() => assertNoBannedGeneratedPhrase({ pets: [{ sourceEvidence: source }] }, settings, proof));
    assert.throws(() => assertNoBannedGeneratedPhrase({ pets: [{ sourceEvidence: source + 'invented' }] }, settings, proof));
    assert.throws(() => assertNoBannedGeneratedPhrase({ pets: [{ sourceEvidence: source, line: '老子来了' }] }, settings, proof));
    assert.throws(() => assertNoBannedGeneratedPhrase({ sourceEvidence: source }, settings, proof));
    assert.doesNotThrow(() => assertNoBannedGeneratedPhrase({ locations: [{ sourceSettingEvidence: source }] }, settings, { ...proof, mode: 'travel' }));
    assert.throws(() => assertNoBannedGeneratedPhrase({ locations: [{ sourceSettingEvidence: source }] }, settings, { ...proof, mode: 'album' }));
});

test('r54 hiding real chat floors does not change the archived prefix; editing still does', async () => {
    const ctx = context();
    ctx.chat = [{ name: ctx.name1, is_user: true, mes: '一起去河边吧。' }, { name: ctx.name2, is_user: false, mes: '好。' }];
    const original = await buildChatSnapshot(ctx);
    ctx.chat.forEach(message => { message.is_system = true; });
    ctx.chat.push({ name: ctx.name2, is_user: false, mes: '出发吧。' });
    const next = await buildChatSnapshot(ctx, { prefixCount: original.totalMessages });
    assert.equal(next.prefixFingerprint, original.fingerprint);
    assert.deepEqual(next.incrementalMessages.map(message => message.text), ['出发吧。']);
    ctx.chat[0].mes = 'edited';
    assert.notEqual((await buildChatSnapshot(ctx, { prefixCount: 2 })).prefixFingerprint, original.fingerprint);
    ctx.chat = [{ is_system: true, name: 'SillyTavern System', mes: 'system' },
        { is_system: true, role: 'tool', name: ctx.name2, is_user: false, mes: 'tool output' },
        { is_system: true, mes: 'unattributed' }];
    assert.equal((await buildChatSnapshot(ctx)).totalMessages, 0);
});

test('r54 pet ownership does not leak across species, sentences or unrelated owners', () => {
    for (const evidence of ['林舟养了一只宠物猫。墙上挂着鸟的图画。', '林舟养了一只宠物猫。职业是 dog trainer。',
        '林舟养了一只猫。小叶养狗。', '林舟养了一只猫。卧室里放着关于兔子的书。']) {
        assert.deepEqual(roomRequiredPetSpecies(bank, { controlledEvidence: evidence, characterEvidence: evidence }), ['cat'], evidence);
    }
    const both = '林舟养了一只猫和一只狗。';
    assert.deepEqual(roomRequiredPetSpecies(bank, { controlledEvidence: both }), ['cat', 'dog']);
    assert.deepEqual(roomRequiredPetSpecies(bank, { controlledEvidence: '林舟没有养狗。' }), []);
    for (const evidence of ['林舟的朋友小叶养了一只狗。', '林舟的同事有养狗的经验。', '林舟在画中养了一只鸟。', '如果林舟养了一只猫。', '我的朋友养了一只狗。']) {
        assert.deepEqual(roomRequiredPetSpecies(bank, { controlledEvidence: evidence, characterEvidence: evidence }), [], evidence);
    }
    assert.deepEqual(roomRequiredPetSpecies(bank, { controlledEvidence: '林舟的宠物猫叫小橘。' }), ['cat']);
    assert.deepEqual(roomRequiredPetSpecies(bank, { controlledEvidence: '林舟领养了一只猫。' }), ['cat']);
    assert.deepEqual(roomRequiredPetSpecies(bank, { controlledEvidence: '林舟没有领养猫。' }), []);
});

test('r54 full room generation accepts the actual cat without inventing the bird picture', async () => {
    const evidence = '林舟养了一只宠物猫。墙上挂着鸟的图画。';
    let calls = 0;
    const raw = { spaces: ['书房', '卧室', '阳台'].map((label, i) => ({ id: 'S' + i, label, spaceType: label,
        objects: ['木桌', '书架', '绿植'].map((label, j) => ({ id: 'O' + i + j, label, basis: '设定', description: '表面很干净。', line: '请坐。' })) })),
        dayparts: Object.fromEntries(['morning', 'daytime', 'evening', 'night'].map(key => [key, { spaceId: 'S0', activity: '整理书架', line: '请坐。' }])),
        presenceLines: ['你来了。', '坐一会儿吧。', '别踩到地上的书。', '要喝点什么吗？'],
        pets: [{ species: 'cat', spaceId: 'S0', basis: '设定', sourceEvidence: '林舟养了一只宠物猫。' }] };
    const result = await generateRoomWithRepair(context(), bank, null, 'room-r54', {
        presentationContext: { contextEnvelope: '', settingEvidence: evidence, characterEvidence: evidence },
        request: async (prompt, status, options, validate) => { calls++; return validate(raw); },
    });
    assert.equal(calls, 1);
    assert.deepEqual(result.pets.map(pet => pet.species), ['cat']);
});

test('r54 one evidenced near location survives generation and normal cache reopening', () => {
    const session = normalizeTravel({ locations: [near()] }, bank);
    assert.equal(session.locations.length, 1);
    const ctx = context();
    ctx.chatMetadata[CACHE_KEY] = { chatId: 'A', archiveRevision: bank.archiveRevision, travel: { ...session, archiveRevision: bank.archiveRevision, chatId: 'A' } };
    globalThis.SillyTavern = { getContext: () => ctx };
    state.runtimeSessionCache.clear();
    assert.equal(loadSession('travel', { context: ctx, memoryBank: bank })?.locations.length, 1);
    assert.throws(() => normalizeTravel({ locations: [{ ...near(), sourceMemoryAnchor: 'invented' }] }, bank));
});

test('r54 selected setting books are available to frozen A without reading B or history books', async () => {
    const ctx = context(), reads = [];
    ctx.__rmtArchiveTargetEntryId = 'fixture-A';
    ctx.getCharacterCardFields = () => ({ description: '林舟喜欢安静。' });
    ctx.getWorldInfoNames = () => ['A-settings', 'A-history', 'B-settings'];
    ctx.loadWorldInfo = async name => { reads.push(name); return { entries: { 1: { uid: 1, content: '林舟住在白塔。林舟养了一只猫。' } } }; };
    ctx.chatMetadata[MEMORY_WORLD_INFO_SETTINGS_KEY] = { books: [{ name: 'A-settings', all: true, entryUids: [], historySource: false },
        { name: 'A-history', all: true, entryUids: [], historySource: true }] };
    globalThis.SillyTavern = { getContext: () => ({ ...context(), chatId: 'B', name2: '角色B' }) };
    const result = await buildWorldPresentationContext(ctx, bank, 'room');
    assert.match(result.settingEvidence, /白塔/);
    assert.doesNotMatch(result.characterEvidence, /白塔/);
    assert.deepEqual(reads, ['A-settings']);
    ctx.loadWorldInfo = async () => { throw new Error('private raw failure'); };
    await assert.rejects(buildWorldPresentationContext(ctx, bank, 'travel'), error => error.code === 'RMT_SETTING_SOURCE_PARTIAL');
});

test('r54 selected settings reject missing entries, oversized context and live character or selection drift', async () => {
    const ctx = context();
    ctx.chatMetadata[MEMORY_WORLD_INFO_SETTINGS_KEY] = { books: [{ name: 'settings', all: false, entryUids: ['1', '2'] }] };
    ctx.getWorldInfoNames = () => ['settings'];
    ctx.loadWorldInfo = async () => ({ entries: { 1: { uid: 1, content: '林舟住在白塔。' } } });
    let live = ctx;
    globalThis.SillyTavern = { getContext: () => live };
    assert.equal((await collectSelectedMemoryWorldInfo(ctx, 'A', null, { settingsOnly: true })).coverage.status, 'partial');
    await assert.rejects(buildWorldPresentationContext(ctx, bank, 'room'), error => error.code === 'RMT_SETTING_SOURCE_PARTIAL');
    ctx.chatMetadata[MEMORY_WORLD_INFO_SETTINGS_KEY].books[0].entryUids = ['1'];
    ctx.loadWorldInfo = async () => {
        live = { ...ctx, characterId: 1, characters: [...ctx.characters, { name: '林舟', avatar: 'b.png' }] };
        return { entries: { 1: { uid: 1, content: '林舟住在白塔。' } } };
    };
    await assert.rejects(buildWorldPresentationContext(ctx, bank, 'travel'), error => error.name === 'AbortError');
    live = ctx;
    ctx.loadWorldInfo = async () => {
        ctx.chatMetadata[MEMORY_WORLD_INFO_SETTINGS_KEY].books[0].entryUids = ['2'];
        return { entries: { 1: { uid: 1, content: '林舟住在白塔。' } } };
    };
    await assert.rejects(buildWorldPresentationContext(ctx, bank, 'travel'), error => error.name === 'AbortError');
    ctx.chatMetadata[MEMORY_WORLD_INFO_SETTINGS_KEY].books[0].all = true;
    ctx.loadWorldInfo = async () => ({ entries: Object.fromEntries([1, 2, 3, 4].map(uid => [uid, { uid, content: '设定'.repeat(2200) }])) });
    await assert.rejects(buildWorldPresentationContext(ctx, bank, 'room'), error => error.code === 'RMT_SETTING_SOURCE_PARTIAL');
});

test('r54 selected setting evidence cannot be silently lost behind a long character card', async () => {
    const ctx = context();
    ctx.__rmtArchiveTargetEntryId = 'A-only';
    ctx.getCharacterCardFields = () => ({ description: '甲'.repeat(4900), personality: '乙'.repeat(4900), scenario: '丙'.repeat(4900), creator_notes: '丁'.repeat(4000) });
    ctx.chatMetadata[MEMORY_WORLD_INFO_SETTINGS_KEY] = { books: [{ name: 'settings', all: true, entryUids: [] }] };
    ctx.getWorldInfoNames = () => ['settings'];
    ctx.loadWorldInfo = async () => ({ entries: { 1: { uid: 1, content: '戊'.repeat(14600) + '林舟常去云栖书店。' } } });
    await assert.rejects(buildWorldPresentationContext(ctx, bank, 'travel'), error => error.code === 'RMT_SETTING_SOURCE_PARTIAL');
});
