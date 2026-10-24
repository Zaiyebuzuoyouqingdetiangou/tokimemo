import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = process.env.RMT_LABELS_SOURCE_ROOT || fileURLToPath(new URL('../', import.meta.url));
// Execute complete production modules. Host, storage, drawing and DOM are the
// boundaries; the name resolver, storage contracts and renderers remain real.
function sourceModule(path, bindings = {}, extra = []) {
    const raw = readFileSync(`${root}/${path}`, 'utf8');
    const names = [...new Set([...raw.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map(match => match[1]).concat(extra))];
    const source = raw.replace(/^import .*;$/gm, '').replace(/^export /gm, '');
    return Function(...Object.keys(bindings), `${source}\nreturn {${names.join(',')}};`)(...Object.values(bindings));
}
const people = sourceModule('src/core/participants.js');
const text = sourceModule('src/core/text.js', { core_context: {}, core_backupDiagnostics: {} });
const pastContract = sourceModule('src/core/pastLivesContract.js');
const timeContract = sourceModule('src/core/timeStoriesContract.js', { safeData: pastContract });
const songContract = sourceModule('src/core/themeSongContract.js', { safeData: pastContract, text, cg_targets: {} });
const names = ['某甲', '某乙', '某丙某', '某戊'];
const allNames = names.join('、');
function memory(name = '某丙某') {
    return { characterName: '沙盒', userName: '我', chatId: 'chat', archiveRevision: '2000-revision', createdAt: 1000,
        participantsV1: { version: 1, cardType: 'multi', selectedIds: ['p0', 'p1', 'p2', 'p3'],
            people: names.map((name, i) => ({ id: `p${i}`, name, sourceRefs: [] })) },
        memories: [{ id: 'M001', title: '雨天', summary: `${name}在门前等我。`, participants: [name, '我'], anchors: ['门前等候'] }] };
}
function scene({ historic = false } = {}) {
    const live = memory('某乙'), shown = historic ? memory('某丙某') : live;
    const ctx = { avatar: 'sandbox.png', characterId: 0, name2: '沙盒', name1: '我' };
    const runtimeState = { activeArchiveSnapshot: historic ? { memory: shown, cache: {} } : null, activeArchiveReadOnly: true };
    let liveReads = 0;
    const contextApi = { getContext: () => ctx, currentCharacterRuntimeKey: context => `${context.avatar}|${context.characterId}` };
    const repository = { getImportedMemory: () => { liveReads++; return live; } };
    const composerOptions = sourceModule('src/core/generationOptions.js', { contextApi, repository });
    const route_people = sourceModule('src/core/routeParticipants.js', { contextApi, repository, participants: people, generation: {}, composer: composerOptions });
    const body = { innerHTML: '', querySelector: () => null };
    const overlay = { bodyEl: () => body, topTitle() {} };
    const common = { runtimeState, contextApi, repository, route_people, participants: people, text, overlay, constants: { OVERLAY_ID: 'test-overlay' },
        pastLivesReadingStyles: { pastLivesReadingCss: () => '' }, lenticularStyles: { pastLivesCardCss: () => '' },
        core_participants: people, core_context: contextApi, archive_repository: repository, core_text: text, ui_overlay: overlay,
        core_constants: { MODE: { BUTTERFLY: 'butterfly' }, MODE_LABEL: { butterfly: '蝴蝶效应' } },
        expanded_cg_view: { expandedCgHtml: () => '', expandedCgButtonsHtml: () => '' } };
    return { live, shown, ctx, runtimeState, body, route_people, common, liveReads: () => liveReads };
}
function withPageChoice(s, route, run) {
    const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), values = new Map();
    const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    try {
        s.route_people.writeRoutePeople(route, { strategy: 'specified', selectedIds: ['p2'] }, s.ctx, s.live, storage);
        return run();
    } finally { if (old) Object.defineProperty(globalThis, 'localStorage', old); else delete globalThis.localStorage; }
}
const letter = { title: '给你', body: '我在等你。', sourceMemoryIds: ['M001'], participantNames: names };

test('historical inbox uses the displayed archive, even when live memory IDs collide', () => {
    const s = scene({ historic: true });
    const view = sourceModule('src/ui/inboxView.js', s.common);
    const before = JSON.stringify(s.shown);
    assert.equal(view.inboxSenderLabel(letter, { sender: allNames }), '某丙某');
    assert.equal(s.liveReads(), 0, 'historical name evidence must never read the live archive');
    assert.equal(JSON.stringify(s.shown), before, 'view-only change must not rewrite old material');
});

test('inbox fallback uses the current page choice, but historical fallback keeps its own saved people', () => {
    const s = scene(), view = sourceModule('src/ui/inboxView.js', s.common);
    withPageChoice(s, 'inbox', () => {
        assert.equal(view.inboxSenderLabel({ ...letter, sourceMemoryIds: [] }, { sender: allNames }), '某丙某');
        s.runtimeState.activeArchiveSnapshot = { memory: memory() };
        assert.equal(view.inboxSenderLabel({ ...letter, sourceMemoryIds: [], participantNames: ['某戊'] }, { sender: allNames }), '某戊');
    });
});

test('historical butterfly branch names come from snapshot.memory, not its container', () => {
    const s = scene({ historic: true });
    s.runtimeState.activeSession = { kind: 'butterfly', subject: allNames, selected: 1, nodes: [
        { id: 'main', label: '主线' }, { id: 'branch', label: '雨天', monologue: '我在等你。', sourceMemoryIds: ['M001'] }] };
    const view = sourceModule('src/ui/butterflyView.js', s.common);
    view.renderButterfly();
    assert.match(s.body.innerHTML, /平行世界 某丙某 本人发言/);
    assert.equal(s.liveReads(), 0);
});

test('time stories resolve names in the shown archive and use page choice only for live fallback', () => {
    const s = scene({ historic: true });
    const view = sourceModule('src/ui/timeStoriesView.js', { ...s.common, contract: timeContract }, ['nameFor']);
    const session = { kind: 'timeEcho', characterName: allNames, userName: '我' };
    assert.equal(view.nameFor(session, 'char', { sourceMemoryIds: ['M001'] }), '某丙某');
    assert.equal(s.liveReads(), 0);
    s.runtimeState.activeArchiveSnapshot = null;
    withPageChoice(s, 'timeEcho', () => assert.equal(view.nameFor(session, 'char', { opening: '我在等你。' }), '某丙某'));
    assert.equal(view.nameFor(session, 'user'), '我');
});

function pastSession() {
    return { kind: 'pastLives', version: 1, chatId: 'chat', archiveRevision: '2000-revision', ownerKey: '',
        characterName: allNames, userName: '我', title: '前世今生', presentation: 'neutral', selectedId: 'PL01', view: 'draw',
        episodes: [{ id: 'PL01', title: '旧事', presentation: 'neutral', fiction: true,
            opening: { title: '开篇', motif: '雨', text: '我在门前等你。', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '门前等候' },
            dossiers: [], echoes: [], annotations: [], closing: { text: '愿你平安。', signature: allNames } }] };
}
test('past lives read nested opening and echo references using the real stored contract', () => {
    const s = scene({ historic: true });
    const view = sourceModule('src/ui/pastLivesView.js', { ...s.common, contract: pastContract });
    const session = pastContract.pastLivesStoredData(pastSession());
    assert.match(view.pastLivesHtml(session, { readOnly: true }), /<p>某丙某 与 我的番外卷宗<\/p>/);
    session.episodes[0].opening.sourceMemoryIds = ['M002'];
    session.episodes[0].echoes = [{ id: 'E01', kind: 'memory', title: '回声', text: '我在门前等你。', reflection: '', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '门前等候' }];
    assert.match(view.pastLivesHtml(pastContract.pastLivesStoredData(session), { readOnly: true }), /<p>某丙某 与 我的番外卷宗<\/p>/);
    assert.equal(s.liveReads(), 0);
});

test('past lives body fallback includes dossier clues and annotations, not only opening prose', () => {
    const s = scene({ historic: true });
    const view = sourceModule('src/ui/pastLivesView.js', { ...s.common, contract: pastContract });
    const session = pastSession();
    session.episodes[0].opening.sourceMemoryIds = ['M002'];
    session.episodes[0].dossiers = [{ id: 'D01', title: '卷宗', era: '', synopsis: '从前的故事。', clues: [
        { id: 'D01-C01', kind: 'testimony', speaker: 'char', title: '旧话', text: '某戊终于开口。', revealedText: '' }] }];
    assert.match(view.pastLivesHtml(pastContract.pastLivesStoredData(session), { readOnly: true }), /<p>某戊 与 我的番外卷宗<\/p>/);
    session.episodes[0].dossiers = [];
    session.episodes[0].annotations = [{ id: 'A01', afterClueIds: [], text: '某丙某向我走来。' }];
    assert.match(view.pastLivesHtml(pastContract.pastLivesStoredData(session), { readOnly: true }), /<p>某丙某 与 我的番外卷宗<\/p>/);
});

function songs(s) {
    return sourceModule('src/ui/themeSongView.js', { ...s.common, contract: songContract,
        composerOptions: { readSongOptions: () => ({}) }, cache: { getCache: () => ({}) },
        recoveryView: { recoveryBannerHtml: () => '' }, coordinator: { isModeGenerating: () => false, isArchiveTargetModeGenerating: () => false },
    }, ['songCast']);
}
test('song labels use historical evidence while preserving duet user, narrator and custom performer', () => {
    const s = scene({ historic: true }), view = songs(s);
    const song = { sourceMemoryIds: ['M001'], title: '雨', lyrics: '你和我' };
    assert.equal(view.songCast(song, `${allNames} / 我`), '某丙某 / 我');
    assert.equal(view.songCast(song, allNames + '的角色印象'), '某丙某的角色印象');
    assert.equal(view.songCast(song, '旁观者'), '旁观者');
    assert.equal(view.songCast(song, '群像'), '群像');
    assert.equal(view.songCast(song, '客串歌手 / 我'), '客串歌手 / 我');
    assert.equal(view.songCast(song, '客串歌手甲、客串歌手乙 / 我'), '客串歌手甲、客串歌手乙 / 我');
    assert.equal(view.songCast(song, '角色:某丙某'), '某丙某');
    assert.equal(s.liveReads(), 0);
});

test('the song library uses the same cast labels as song details', () => {
    const s = scene({ historic: true }), view = songs(s);
    s.runtimeState.activeSession = { kind: 'themeSong', selectedId: 'song-1', songs: [{ id: 'song-1', title: '雨',
        subject: 'event', language: 'zh', singer: allNames, sourceMemoryIds: ['M001'], lyrics: '你和我' }] };
    view.renderThemeSongs();
    const list = /<nav class="rmt-song-list"[\s\S]*?<\/nav>/.exec(s.body.innerHTML)?.[0] || '';
    assert.match(list, /<small>某丙某<\/small>/);
    assert.ok(!list.includes(allNames));
});

function calendar(s) {
    return sourceModule('src/ui/calendarView.js', { ...s.common,
        modes_calendar: { HOLIDAY_CARD_EXPRESSIONS: ['text', 'drawing', 'writing', 'mixed', 'minimal'], HOLIDAY_CARD_MEDIA: ['card'] },
    }, ['holidayCardMarkup']);
}
test('holiday cards use nested archive context, reference priority, and clean single-name prefixes', () => {
    const s = scene({ historic: true }), view = calendar(s);
    const card = { signature: allNames, message: '某乙祝你平安。', sourceMemoryIds: ['M001'], motifs: [] };
    assert.match(view.holidayCardMarkup(card), /holiday-signature">某丙某<\/div>/);
    assert.match(view.holidayCardMarkup({ signature: '角色:某丙某' }), /holiday-signature">某丙某<\/div>/);
    assert.equal(s.liveReads(), 0);
});

test('holiday and song live fallbacks use page selection, without adding an absent signature', () => {
    const s = scene(), cards = calendar(s), music = songs(s);
    withPageChoice(s, 'calendar', () => {
        assert.match(cards.holidayCardMarkup({ signature: allNames, message: '愿你平安。' }), /holiday-signature">某丙某<\/div>/);
        assert.ok(!cards.holidayCardMarkup({ message: '愿你平安。' }).includes('holiday-signature'));
    });
    withPageChoice(s, 'themeSong', () => assert.equal(music.songCast({ lyrics: '你和我' }, allNames), '某丙某'));
});
