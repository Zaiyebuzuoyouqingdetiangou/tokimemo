import test from 'node:test';
import assert from 'node:assert/strict';
import * as view from '../src/ui/timeStoriesView.js';
import * as phone from '../src/ui/phoneView.js';
import * as constants from '../src/core/constants.js';
import { state } from '../src/core/state.js';

function story(kind = 'timeEcho') {
    const episode = { id: 'TS01', fiction: true, title: '迟到的钟声', opening: '雨落在窗前。', closing: '他终于走向另一条路。',
        presentation: 'classical', palette: 'moss', motif: '旧铜铃' };
    if (kind === 'timeEcho') Object.assign(episode, { medium: { kind: 'relic', label: '传音铜铃' },
        ends: [{ role: 'char', time: '冬至之前' }, { role: 'char', time: '冬至之后' }],
        lines: [{ speaker: 'a', text: '你是否记得那条路？' }, { speaker: 'b', text: '不要走向城门。' }], message: '避开城门' });
    return { kind, version: 1, chatId: 'chat-a', archiveRevision: 'rev-a', ownerKey: '', characterName: '甲', userName: '乙',
        title: '时空回响', episodes: [episode], selectedId: 'TS01', selectedEntryId: '', view: 'story', dialogueIndex: 0, reading: false, tab: 'story' };
}

test('echo distinguishes both times of one person and uses the world-specific medium', () => {
    const html = view.timeStoriesHtml(story());
    assert.match(html, /传音铜铃/); assert.match(html, /冬至之前/); assert.match(html, /冬至之后/);
    assert.match(html, /data-rmt-time-story="connect"/);
    assert.doesNotMatch(html, /不要走向城门|避开城门/);
});

test('echo reveals one local line at a time and shows the result only after the last line', () => {
    const session = story(); session.reading = true;
    let html = view.timeStoriesHtml(session);
    assert.match(html, /你是否记得那条路/); assert.doesNotMatch(html, /不要走向城门|避开城门/);
    session.dialogueIndex = 1; html = view.timeStoriesHtml(session);
    assert.match(html, /不要走向城门/); assert.doesNotMatch(html, /避开城门/);
    session.dialogueIndex = 2; html = view.timeStoriesHtml(session);
    assert.match(html, /避开城门/); assert.match(html, /他终于走向另一条路/);
});

test('read-only shelves hide generation but keep local reading and terminal navigation', () => {
    const session = story(); session.view = 'library';
    const html = view.timeStoriesHtml(session, { readOnly: true });
    assert.doesNotMatch(html, /data-rmt-generate-mode/);
    assert.match(html, /data-rmt-time-story="open"/); assert.match(html, /data-rmt-mode="phone"/);
    assert.match(view.timeStoriesHtml(session), /data-rmt-generate-mode="timeEcho"/);
    assert.match(view.timeStoriesHtml(session, { busy: true }), /disabled/);
});

test('all generated strings remain text and presentation cannot inject classes or attributes', () => {
    const session = story(); const episode = session.episodes[0];
    episode.title = '<img src=x onerror=alert(1)>'; episode.medium.label = '<script>alert(1)</script>';
    episode.presentation = 'modern" onclick="evil'; episode.palette = 'red" style="evil';
    const html = view.timeStoriesHtml(session);
    assert.doesNotMatch(html, /<script|<img|onclick=|style="evil/);
    assert.match(html, /&lt;script&gt;/); assert.match(html, /data-rmt-time-presentation="neutral"/);
});

test('empty terminal exposes time echo without a cached phone or timer and keeps source metadata untouched', t => {
    const previous = { activeSession: state.activeSession, activeMode: state.activeMode, activeArchiveSnapshot: state.activeArchiveSnapshot, activeArchiveReadOnly: state.activeArchiveReadOnly, phoneClockTimer: state.phoneClockTimer };
    const descriptors = new Map(['document', 'setInterval'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const body = { innerHTML: '' }; let timers = 0;
    globalThis.document = { querySelector: selector => selector.endsWith('.rmt-body') ? body : null };
    globalThis.setInterval = () => { timers++; return 99; };
    t.after(() => { Object.assign(state, previous); for (const [key, descriptor] of descriptors) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; });
    const memory = { chatId: 'chat-a', archiveRevision: 'rev-a', characterName: '甲', userName: '乙' };
    const before = JSON.stringify(memory);
    state.activeSession = phone.emptyPhone(memory); state.activeMode = constants.MODE.PHONE; state.activeArchiveSnapshot = null; state.phoneClockTimer = 0;
    phone.renderPhone();
    assert.match(body.innerHTML, /data-rmt-mode="timeEcho"/); assert.match(body.innerHTML, /data-rmt-generate-mode="phone" data-rmt-reader-generation="true"/);
    assert.equal(timers, 0); assert.deepEqual(state.activeSession.apps, []); assert.equal(JSON.stringify(memory), before);
    state.activeArchiveSnapshot = { backupOnly: true }; state.activeArchiveReadOnly = true;
    phone.renderPhone();
    assert.match(body.innerHTML, /data-rmt-mode="timeEcho"/); assert.doesNotMatch(body.innerHTML, /data-rmt-generate-mode="phone"/);
});

test('reading styles stay local, keep touch controls large, and include a narrow viewport layout', () => {
    const css = view.timeStoriesCss('#fixture');
    assert.match(css, /#fixture \.rmt-time/); assert.match(css, /min-height:44px/); assert.match(css, /@media/);
    assert.doesNotMatch(css, /https?:|@import|position:fixed|100vw/);
});

function readerFixture(t, kind = 'timeEcho') {
    const descriptors = new Map(['document', 'SillyTavern', 'fetch', 'toastr'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const previous = { activeSession: state.activeSession, activeMode: state.activeMode, activeArchiveSnapshot: state.activeArchiveSnapshot, activeArchiveReadOnly: state.activeArchiveReadOnly };
    const session = story(kind);
    const memory = { version: constants.MEMORY_VERSION, chatId: session.chatId, archiveRevision: session.archiveRevision,
        characterName: session.characterName, userName: session.userName, memories: [] };
    const saved = { [kind]: structuredClone(session) };
    const body = { innerHTML: '', querySelectorAll: () => [] };
    let requests = 0;
    globalThis.document = { querySelector: selector => selector.endsWith('.rmt-body') ? body : null };
    globalThis.SillyTavern = { getContext: () => ({ chatId: 'other-chat', characterId: 1, name1: '别的用户', name2: '别的角色', chatMetadata: {} }) };
    globalThis.fetch = () => { requests++; throw new Error('reading must not request'); };
    globalThis.toastr = { error() {} };
    state.activeSession = session; state.activeMode = kind; state.activeArchiveReadOnly = true;
    state.activeArchiveSnapshot = { chatId: session.chatId, memory, cache: saved, backupOnly: true };
    t.after(() => { Object.assign(state, previous); for (const [key, descriptor] of descriptors) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; });
    return { session, memory, saved, body, requests: () => requests };
}

test('historical echo reading works locally and never changes saved content or launches a request', t => {
    const f = readerFixture(t); const before = JSON.stringify(f.saved);
    assert.equal(view.handleTimeStoryAction('connect'), true);
    assert.equal(f.session.reading, true); assert.match(f.body.innerHTML, /你是否记得/);
    assert.equal(view.handleTimeStoryAction('next-line'), true);
    assert.equal(f.session.dialogueIndex, 1); assert.match(f.body.innerHTML, /不要走向城门/);
    view.handleTimeStoryAction('next-line');
    assert.match(f.body.innerHTML, /避开城门/);
    assert.equal(view.closeTimeStoryDetail(), true); assert.equal(f.session.view, 'library');
    assert.equal(view.handleTimeStoryAction('generate'), false);
    assert.equal(f.requests(), 0); assert.equal(JSON.stringify(f.saved), before);
});

test('stale or mismatched archive cannot mutate story reading state', t => {
    const f = readerFixture(t); const before = JSON.stringify(f.session);
    f.memory.archiveRevision = 'new-revision';
    assert.equal(view.handleTimeStoryAction('connect'), false);
    assert.equal(view.closeTimeStoryDetail(), false);
    assert.equal(JSON.stringify(f.session), before); assert.equal(f.requests(), 0);
});
