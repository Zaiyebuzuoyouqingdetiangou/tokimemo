import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = process.env.RMT_PARTICIPANTS_SOURCE_ROOT || fileURLToPath(new URL('../', import.meta.url));
function sourceModule(path, bindings, names) {
    const source = readFileSync(`${root}/${path}`, 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
    return Function(...Object.keys(bindings), `${source}\nreturn {${names.join(',')}};`)(...Object.values(bindings));
}
function storage() {
    const data = new Map();
    return { data, get length() { return data.size; }, key: index => [...data.keys()][index] ?? null,
        getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
const contextApi = { currentCharacterRuntimeKey: ctx => `${ctx.avatar}|slot:${ctx.characterId}` };
const people = sourceModule('src/core/participants.js', {}, ['PARTICIPANTS_KEY', 'normalizeParticipantRoster', 'normalizeParticipantSnapshot', 'selectedParticipantSnapshot', 'resolveStoryIdentities', 'storyOwnerLabelAllowed', 'compactCastLabel', 'plainPersonName']);
const generation = sourceModule('src/core/generationParticipants.js', { participants: people }, ['resolveGenerationParticipantSnapshot', 'deriveGenerationParticipantMemoryBank']);
const composer = sourceModule('src/core/generationOptions.js', { contextApi, repository: {} }, ['composerScope']);
function api() {
    return sourceModule('src/core/routeParticipants.js', { contextApi, repository: {}, participants: people, generation, composer }, ['readRoutePeople', 'writeRoutePeople', 'captureRoutePeople', 'archiveCastIds', 'storyCastLabel']);
}
const ctx = { avatar: 'sandbox.png', characterId: 0, name2: '网球沙盒' };
const bank = (revision = '2000-chat-ext', createdAt = 1000, chatId = 'chat-A') => ({
    chatId, createdAt, archiveRevision: revision, characterName: '网球沙盒',
    participantsV1: { version: 1, cardType: 'multi', selectedIds: ['p1', 'p2'], people: [
        { id: 'p1', name: '越前龙马', sourceRefs: [] }, { id: 'p2', name: '手冢国光', sourceRefs: [] },
    ] },
});
const specified = { strategy: 'specified', selectedIds: ['p1'] };
function legacy(store, memory, value, route = 'butterfly', context = ctx) {
    store.setItem(`hearttraceRoutePeopleV1:${composer.composerScope(context, memory)}:${route}`, JSON.stringify(value));
}

test('a normal archive increment preserves the chosen person instead of selecting the whole roster', () => {
    const s = storage(), a = api();
    a.writeRoutePeople('butterfly', specified, ctx, bank(), s);
    const next = bank('3000-chat-ext');
    assert.deepEqual(a.readRoutePeople('butterfly', ctx, next, s), specified);
    const snapshot = a.captureRoutePeople('butterfly', ctx, next, { storage: s });
    assert.deepEqual(snapshot.people.map(p => p.id), ['p1']);
    const contentBank = generation.deriveGenerationParticipantMemoryBank(next, snapshot);
    const butterfly = readFileSync(`${root}/src/modes/butterfly.js`, 'utf8');
    const body = butterfly.slice(butterfly.indexOf('export function butterflySubjectName'), butterfly.indexOf('export function normalizeButterfly(')).replace('export ', '');
    const subject = Function('storyParticipants', body + '\nreturn butterflySubjectName;')(people);
    assert.equal(subject(contentBank, ctx), '越前龙马');
    assert.deepEqual(next.participantsV1.selectedIds, ['p1', 'p2'], 'the archive roster itself is not changed');
});

test('upgrade restores the latest saved V1 choice within this archive lifetime', () => {
    const s = storage(), a = api();
    legacy(s, bank('1500-a-b'), { strategy: 'random', selectedIds: [] });
    legacy(s, bank('2000-a-b'), specified);
    assert.deepEqual(a.readRoutePeople('butterfly', ctx, bank('3000-c-d'), s), specified);
    assert.deepEqual(api().readRoutePeople('butterfly', ctx, bank('4000-e-f'), s), specified, 'restored preference survives another reload and revision');
    assert.equal(s.data.has(`hearttraceRoutePeopleV1:${composer.composerScope(ctx, bank('2000-a-b'))}:butterfly`), true, 'legacy source remains intact');
});

test('exact revision legacy settings remain readable when old timestamps are unavailable', () => {
    const s = storage(), a = api(), memory = bank('legacy-revision', 0);
    legacy(s, memory, specified);
    assert.deepEqual(a.readRoutePeople('butterfly', ctx, memory, s), specified);
});

test('an explicit newer default is not replaced with an older specified preference', () => {
    const s = storage(), a = api();
    legacy(s, bank('1500-a-b'), specified);
    legacy(s, bank('2500-a-b'), { strategy: 'default', selectedIds: [] });
    assert.equal(a.readRoutePeople('butterfly', ctx, bank('3000-c-d'), s).strategy, 'default');
});

test('choice isolation includes route, character, chat and a recreated archive', () => {
    const s = storage(), a = api();
    a.writeRoutePeople('butterfly', specified, ctx, bank(), s);
    assert.equal(a.readRoutePeople('themeSong', ctx, bank(), s).strategy, 'default');
    assert.equal(a.readRoutePeople('butterfly', { ...ctx, avatar: 'other.png' }, bank(), s).strategy, 'default');
    assert.equal(a.readRoutePeople('butterfly', ctx, bank('3000-a-b', 1000, 'chat-B'), s).strategy, 'default');
    assert.equal(a.readRoutePeople('butterfly', ctx, bank('5000-a-b', 4500), s).strategy, 'default');
    legacy(s, bank('2000-a-b'), specified);
    assert.equal(api().readRoutePeople('butterfly', ctx, bank('5000-a-b', 4500), s).strategy, 'default');
});

test('the production archive timestamp keeps same-archive rebuild preferences and isolates deletion followed by creation', () => {
    const source = readFileSync(`${root}/src/archive/importOperation.js`, 'utf8');
    const field = source.slice(source.indexOf('const memoryBank = {')).match(/createdAt: (.+),/)[1];
    const createdAt = Function('mergeExisting', 'existing', 'now', `return ${field};`);
    const s = storage(), a = api(), previous = bank();
    a.writeRoutePeople('butterfly', specified, ctx, previous, s);
    const rebuilt = bank('5000-chat-ext', createdAt(null, previous, 5000));
    assert.deepEqual(a.readRoutePeople('butterfly', ctx, rebuilt, s), specified, 'full rebuild retains the identity of the same archive');
    const recreated = bank('6000-chat-ext', createdAt(null, null, 6000));
    assert.equal(a.readRoutePeople('butterfly', ctx, recreated, s).strategy, 'default', 'a deleted archive cannot lend choices to a newly created one');
});

test('migration excludes future, foreign and ambiguous revision records', () => {
    const s = storage(), a = api();
    legacy(s, bank('4000-a-b'), specified);
    legacy(s, bank('2000-a-b'), specified, 'butterfly', { ...ctx, avatar: 'other.png' });
    legacy(s, bank('2000-a-b', 1000, 'chat-B'), specified);
    assert.equal(a.readRoutePeople('butterfly', ctx, bank('3000-c-d'), s).strategy, 'default');
    legacy(s, bank('2500-a-b'), specified);
    legacy(s, bank('2500-other-fingerprint'), { strategy: 'random', selectedIds: [] });
    assert.equal(api().readRoutePeople('butterfly', ctx, bank('3000-c-d'), s).strategy, 'default');
});

test('a storage write failure keeps the new in-session choice ahead of an older disk value', () => {
    const s = storage(), a = api();
    a.writeRoutePeople('butterfly', { strategy: 'ensemble', selectedIds: [] }, ctx, bank(), s);
    s.setItem = () => { throw new Error('quota'); };
    a.writeRoutePeople('butterfly', specified, ctx, bank(), s);
    assert.deepEqual(a.readRoutePeople('butterfly', ctx, bank(), s), specified);
});

test('removing a selected person asks for correction instead of silently expanding to everybody', () => {
    const s = storage(), a = api();
    a.writeRoutePeople('butterfly', specified, ctx, bank(), s);
    const next = bank('3000-chat-ext'); next.participantsV1.people.shift(); next.participantsV1.selectedIds = ['p2'];
    assert.throws(() => a.captureRoutePeople('butterfly', ctx, next, { storage: s }), /重新选择/);
});

test('random and ensemble choices retain their existing semantics and frozen snapshots remain unchanged', () => {
    const s = storage(), a = api();
    a.writeRoutePeople('butterfly', { strategy: 'random', selectedIds: [] }, ctx, bank(), s);
    const frozen = a.captureRoutePeople('butterfly', ctx, bank('3000-chat-ext'), { storage: s, random: () => 0.9 });
    assert.deepEqual(frozen.people.map(p => p.id), ['p2']);
    a.writeRoutePeople('butterfly', { strategy: 'ensemble', selectedIds: [] }, ctx, bank('3000-chat-ext'), s);
    assert.deepEqual(a.captureRoutePeople('butterfly', ctx, bank('4000-chat-ext'), { storage: s }).people.map(p => p.id), ['p1', 'p2']);
    assert.deepEqual(generation.resolveGenerationParticipantSnapshot({ frozenSnapshot: frozen }).people.map(p => p.id), ['p2']);
});

test('a restored choice stays usable for the session if migration cannot be saved', () => {
    const s = storage(), a = api();
    legacy(s, bank(), specified);
    s.setItem = () => { throw new Error('quota'); };
    assert.deepEqual(a.readRoutePeople('butterfly', ctx, bank('3000-chat-ext'), s), specified);
    s.getItem = () => { throw new Error('unavailable'); };
    assert.deepEqual(a.readRoutePeople('butterfly', ctx, bank('4000-chat-ext'), s), specified);
});

test('a successful newer choice from another tab is visible to an already-open page', () => {
    const s = storage(), first = api(), second = api();
    assert.equal(first.writeRoutePeople('butterfly', specified, ctx, bank(), s), true);
    second.writeRoutePeople('butterfly', { strategy: 'random', selectedIds: [] }, ctx, bank('3000-chat-ext'), s);
    assert.equal(first.readRoutePeople('butterfly', ctx, bank(), s).strategy, 'random');
});

test('unavailable browser storage reports an unsaved choice without breaking capture', () => {
    const a = api(), original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    try {
        assert.equal(a.writeRoutePeople('butterfly', specified, ctx, bank()), false);
        assert.deepEqual(a.captureRoutePeople('butterfly', ctx, bank('3000-chat-ext')).people.map(p => p.id), ['p1']);
    } finally {
        if (original) Object.defineProperty(globalThis, 'localStorage', original);
        else delete globalThis.localStorage;
    }
});

test('explicit new work uses the page choice even while an older recovery is retained', async () => {
    const s = storage(), a = api(), memory = bank(), received = [];
    a.writeRoutePeople('butterfly', specified, ctx, memory, s);
    const source = readFileSync(`${root}/src/generation/generationModes.js`, 'utf8');
    const body = source.slice(source.indexOf('export async function generateMode('), source.indexOf('async function generateModeOperation(')).replace('export ', '');
    const bindings = {
        core_constants: { MODE: { BUTTERFLY: 'butterfly' } },
        core_context: { currentCharacterGuard: () => ctx, captureTaskOrigin: () => ({}) },
        content_selection: { supportsContentSelection: () => false },
        archive_repository: { getImportedMemory: () => memory },
        core_cache: { loadGenerationRecovery: () => ({ draftId: 'retained-old-draft' }) },
        core_requestCoordinator: { beginLogicalGenerationTask: () => ({}), generationTaskKeyForMode: () => 'fixture', finishLogicalGenerationTask() {} },
        routePeople: { captureRoutePeople: (route, context, bank) => a.captureRoutePeople(route, context, bank, { storage: s }) },
        generateModeOperation: async (mode, options) => { received.push(options); return { status: 'committed' }; },
    };
    const generate = Function(...Object.keys(bindings), body + '\nreturn generateMode;')(...Object.values(bindings));
    await generate('butterfly', { newTask: true });
    assert.deepEqual(received[0].participantSnapshot?.people.map(p => p.id), ['p1']);
    await generate('butterfly', { continueRecovery: true });
    assert.equal(Object.hasOwn(received[1], 'participantSnapshot'), false, 'continuing old work leaves its frozen recipe in control');
    const explicit = generation.resolveGenerationParticipantSnapshot({ roster: memory.participantsV1, selectedIds: ['p2'] });
    await generate('butterfly', { newTask: true, participantSnapshot: explicit });
    assert.equal(received[2].participantSnapshot, explicit, 'an explicit version/replacement selection is not overwritten');
});

const castBank = memories => ({
    chatId: 'chat-A', createdAt: 1000, archiveRevision: '2000-chat-ext', characterName: '沙盒', memories,
    participantsV1: { version: 1, cardType: 'multi', selectedIds: ['p1', 'p2', 'p3', 'p4'], people: [
        { id: 'p1', name: '林知夏', sourceRefs: [] },
        { id: 'p2', name: '沈秋白', sourceRefs: [{ world: 'w', uid: '1', title: '沈秋白', content: '', keys: ['会长'] }] },
        { id: 'p3', name: '顾南星', sourceRefs: [] },
        { id: 'p4', name: '陆远舟', sourceRefs: [] },
        { id: 'u', name: '我', identity: 'user', sourceRefs: [] },
    ] },
});

test('archive strategy picks only people who actually appear in the archive memories', () => {
    const memory = castBank([
        { id: 'M001', title: '初见', summary: '林知夏在校门口等人。', anchors: ['雨伞'], participants: ['我'] },
        { id: 'M002', title: '训练', summary: '会长让全员跑圈。', anchors: [], participants: [] },
        { id: 'M003', title: '雨天', summary: '两人在屋檐下躲雨。', anchors: [], participants: ['南星'] },
    ]);
    const a = api(), s = storage();
    assert.deepEqual(a.archiveCastIds(memory.participantsV1, memory), ['p1', 'p2', 'p3'], 'name, world-info keyword and partial participant name all count; p4 never appears');
    a.writeRoutePeople('butterfly', { strategy: 'archive', selectedIds: [] }, ctx, memory, s);
    assert.deepEqual(a.readRoutePeople('butterfly', ctx, memory, s).strategy, 'archive');
    const snapshot = a.captureRoutePeople('butterfly', ctx, memory, { storage: s });
    assert.deepEqual(snapshot.people.map(p => p.id), ['p1', 'p2', 'p3']);
    assert.deepEqual(memory.participantsV1.selectedIds, ['p1', 'p2', 'p3', 'p4'], 'the archive roster itself is not changed');
});

test('archive strategy follows archive updates and refuses an empty cast instead of using everyone', () => {
    const a = api(), s = storage();
    const empty = castBank([{ id: 'M001', title: '独白', summary: '一个人散步。', anchors: [], participants: [] }]);
    a.writeRoutePeople('butterfly', { strategy: 'archive', selectedIds: [] }, ctx, empty, s);
    assert.throws(() => a.captureRoutePeople('butterfly', ctx, empty, { storage: s }), /还没有找到/);
    const later = castBank([...empty.memories, { id: 'M002', title: '晚会', summary: '陆远舟来帮忙。', anchors: [], participants: [] }]);
    assert.deepEqual(a.captureRoutePeople('butterfly', ctx, later, { storage: s }).people.map(p => p.id), ['p4']);
    assert.deepEqual(a.archiveCastIds(castBank([{ id: 'M1', title: '夏', summary: '一个夏天', anchors: [], participants: [] }]).participantsV1,
        castBank([{ id: 'M1', title: '夏', summary: '一个夏天', anchors: [], participants: [] }])), [], 'a single shared character does not match a name');
});

test('pages saved with only some of the cast stay readable, and butterfly updates follow the current cast', () => {
    const memory = castBank([]);
    assert.equal(people.storyOwnerLabelAllowed('林知夏', memory), true, 'one chosen person');
    assert.equal(people.storyOwnerLabelAllowed('林知夏、顾南星', memory), true, 'a chosen subset');
    assert.equal(people.storyOwnerLabelAllowed('林知夏、沈秋白、顾南星、陆远舟', memory), true, 'the whole cast');
    assert.equal(people.storyOwnerLabelAllowed('沙盒', memory), true, 'the card name');
    assert.equal(people.storyOwnerLabelAllowed('林知夏、外人', memory), false, 'someone outside the roster');
    assert.equal(people.storyOwnerLabelAllowed('我', memory), false, 'the user is not an owner');
    assert.equal(people.storyOwnerLabelAllowed('林知夏、林知夏', memory), false);
    const butterfly = readFileSync(`${root}/src/modes/butterfly.js`, 'utf8');
    assert.equal((butterfly.match(/mergeButterflyIncremental\([^)]*\)?[^;]*butterflySubjectName\(memoryBank, context\)\)/g) || []).length, 2, 'both update paths pass the current cast');
    assert.match(butterfly, /\.\.\.\(subject \? \{ subject \} : \{\}\)/);
});

test('a large cast is shown as the first few names plus a count, not the whole roster', () => {
    assert.equal(people.compactCastLabel('甲、乙、丙、丁、戊'), '甲、乙、丙 等 5 人');
    assert.equal(people.compactCastLabel('甲、乙、丙'), '甲、乙、丙');
    assert.equal(people.compactCastLabel('甲'), '甲');
    assert.equal(people.compactCastLabel(''), '');
    for (const file of ['src/ui/butterflyView.js', 'src/ui/pastLivesView.js', 'src/ui/timeStoriesView.js']) {
        assert.match(readFileSync(`${root}/${file}`, 'utf8'), /compactCastLabel\(|storyCastLabel\(/, file);
    }
});

test('butterfly headers name the people in that branch, not the whole roster', () => {
    const source = readFileSync(`${root}/src/ui/butterflyView.js`, 'utf8');
    const body = source.slice(source.indexOf('function nodeSubjectName'), source.indexOf('export function renderButterfly'));
    const nodeSubjectName = Function('core_participants', 'route_people', `${body}\nreturn nodeSubjectName;`)(people, api());
    const memory = castBank([
        { id: 'M001', title: '雨天', summary: '两人在屋檐下躲雨。', anchors: [], participants: ['顾南星', '我'] },
        { id: 'M002', title: '训练', summary: '会长让全员跑圈。', anchors: [], participants: [] },
    ]);
    const session = { subject: '林知夏、沈秋白、顾南星、陆远舟' };
    assert.equal(nodeSubjectName({ sourceMemoryIds: ['M001'], monologue: '' }, session, memory), '顾南星', 'from the referenced memory');
    assert.equal(nodeSubjectName({ sourceMemoryIds: ['M002'], monologue: '' }, session, memory), '沈秋白', 'world-info keyword in the referenced memory');
    assert.equal(nodeSubjectName({ sourceMemoryIds: [], intervention: '陆远舟终于开口。' }, session, memory), '陆远舟', 'from the branch text');
    assert.equal(nodeSubjectName({ sourceMemoryIds: [], intervention: '没有人名。' }, session, memory), '林知夏、沈秋白、顾南星 等 4 人', 'falls back to the page cast, compacted');
    assert.equal(nodeSubjectName({ intervention: 'x' }, { subject: '单人' }, { memories: [] }), '单人', 'single-character cards are unchanged');
});

test('world-info style names like 「角色:某某」 are matched and shown without the prefix', () => {
    const memory = { memories: [{ id: 'M1', title: '来信', summary: '某甲写信给你。', anchors: [], participants: [] }],
        participantsV1: { version: 1, cardType: 'multi', selectedIds: ['a', 'b', 'c', 'd'], people: [
            { id: 'a', name: '角色:某甲', sourceRefs: [] }, { id: 'b', name: '角色：某乙', sourceRefs: [] },
            { id: 'c', name: '角色:某丙', sourceRefs: [] }, { id: 'd', name: '角色:某丁', sourceRefs: [] }] } };
    const a = api();
    assert.equal(a.storyCastLabel(memory, { sourceMemoryIds: ['M1'], fallback: '角色:某甲、角色：某乙、角色:某丙、角色:某丁' }), '某甲');
    assert.equal(a.storyCastLabel(memory, { text: '某乙来了', fallback: [] }), '某乙');
    assert.equal(a.storyCastLabel(memory, { text: '无名', fallback: ['角色:某甲', '角色：某乙', '角色:某丙', '角色:某丁'] }), '某甲、某乙、某丙 等 4 人');
    for (const file of ['src/ui/inboxView.js', 'src/ui/timeStoriesView.js', 'src/ui/pastLivesView.js', 'src/ui/themeSongView.js', 'src/ui/calendarView.js', 'src/ui/butterflyView.js']) {
        assert.match(readFileSync(`${root}/${file}`, 'utf8'), /storyCastLabel\(/, file);
    }
});

test('butterfly header subject follows the people written on the page, not the stored full roster', () => {
    const view = readFileSync(`${root}/src/ui/butterflyView.js`, 'utf8');
    const header = view.slice(view.indexOf('const observerName'), view.indexOf('const speakerName'));
    assert.match(header, /storyCastLabel\(/, 'header derives the subject from page content');
    assert.match(header, /session\.nodes\.flatMap/, 'header looks at every observation point');
    assert.doesNotMatch(header, /compactCastLabel\(session\.subject\)/, 'header no longer prints the stored full roster first');
    const memory = { memories: [{ id: 'M1', title: '一', summary: '某甲出门。', anchors: [], participants: [] }, { id: 'M2', title: '二', summary: '某甲回来。', anchors: [], participants: [] }],
        participantsV1: { version: 1, cardType: 'multi', selectedIds: ['a', 'b', 'c', 'd'], people: [
            { id: 'a', name: '某甲', sourceRefs: [] }, { id: 'b', name: '某乙', sourceRefs: [] }, { id: 'c', name: '某丙', sourceRefs: [] }, { id: 'd', name: '某丁', sourceRefs: [] }] } };
    assert.equal(api().storyCastLabel(memory, { sourceMemoryIds: ['M1', 'M2'], text: '某甲独白', fallback: '某甲、某乙、某丙、某丁' }), '某甲');
});
