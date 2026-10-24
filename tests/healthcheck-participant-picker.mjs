import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as people from '../src/core/participants.js';
import * as cast_scan from '../src/core/castScan.js';

const source = readFileSync(new URL('../src/ui/participantPicker.js', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const tick = () => new Promise(resolve => setImmediate(resolve));
const pending = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const entry = (world, name, uid = '1', content = `姓名：${name}`) => ({ world, uid, title: name, content, keys: [name] });
const person = (id, name, aliases = []) => ({ id, name, aliases, sourceRefs: [] });

class Element {
    constructor(root = null, attribute = '') {
        this.root = root || this; this.nodes = new Map(); this.handlers = new Map(); this.attributes = new Set([attribute]);
        this.dataset = {}; this.disabled = false; this.hidden = false; this.connected = true; this.innerHTML = ''; this.textContent = ''; this.value = '';
    }
    get isConnected() { return this.root.connected; }
    querySelector(selector) {
        if (!this.nodes.has(selector)) this.nodes.set(selector, new Element(this.root, selector.replace(/^\[|\]$/g, '')));
        return this.nodes.get(selector);
    }
    querySelectorAll() { return [...this.nodes.values()]; }
    addEventListener(type, handler) { const list = this.handlers.get(type) || []; list.push(handler); this.handlers.set(type, list); }
    setAttribute(key, value) { this.attributes.add(key); this[key] = value; }
    hasAttribute(key) { return this.attributes.has(key); }
    closest() { return this; }
    appendChild(child) { this.child = child; }
    remove() { this.connected = false; }
    focus() {}
    async emit(type, target = this) { for (const handler of this.handlers.get(type) || []) await handler({ target, stopPropagation() {}, preventDefault() {} }); }
}

async function scene({ books = { A: [entry('A', '某甲')] }, rosterPeople = [], confirm = true, request = async () => ({ people: [] }) } = {}) {
    const host = new Element();
    let scope = 'chat-A', saved = null;
    const events = new Map(), calls = [], confirmations = [];
    const eventSource = {
        on(type, fn) { const list = events.get(type) || new Set(); list.add(fn); events.set(type, list); },
        off(type, fn) { events.get(type)?.delete(fn); },
        emit(type) { for (const fn of events.get(type) || []) fn(); },
    };
    const context = { getWorldInfoNames: () => Object.keys(books), eventSource, eventTypes: { CHAT_CHANGED: 'chat-changed', CHAT_LOADED: 'chat-loaded' } };
    const contextApi = { chatScopeKey: () => scope, currentCharacterGuard: () => context, captureTaskOrigin: () => ({ scope }) };
    const repository = { loadMemoryWorldInfoBook: async (_, world) => structuredClone(books[world] || []) };
    const generation_client = { requestJson: async (prompt, label, options) => { calls.push({ prompt, options }); return request(prompt, options, calls.length); } };
    const document = { activeElement: null, getElementById: () => host, createElement: () => new Element() };
    const globalThis = { confirm: message => { confirmations.push(message); return confirm; } };
    const api = Function('contextApi', 'constants', 'cache', 'people', 'repository', 'text', 'cast_scan', 'generation_client', 'document', 'globalThis',
        `${source}\nreturn {showParticipantPicker,closeParticipantPicker};`)(contextApi, { OVERLAY_ID: 'test' }, {}, people, repository,
        { esc: value => String(value ?? ''), safeErrorSummary: error => error.message || '失败' }, cast_scan, generation_client, document, globalThis);
    await api.showParticipantPicker({ context, roster: { version: 1, cardType: 'multi', people: rosterPeople, selectedIds: rosterPeople.map(p => p.id) },
        onConfirm: draft => { saved = draft; return false; } });
    const root = host.child;
    const node = name => root.querySelector(`[data-rmt-participant-${name}]`);
    const changeBook = async name => { node('book').value = name; await node('book').emit('change'); };
    const click = async name => { await root.emit('click', node(name)); await tick(); };
    const pick = async (index = 0, checked = true) => {
        const target = new Element(root); target.dataset.rmtParticipantFoundPick = String(index); target.checked = checked;
        await root.emit('change', target);
    };
    return { api, root, node, calls, confirmations, changeBook, click, pick, get saved() { return saved; },
        confirm: () => node('confirm').emit('click'), switchChat: () => { scope = 'chat-B'; eventSource.emit('chat-changed'); } };
}

test('declining scan confirmation performs no model requests; local guessing remains free', async () => {
    const s = await scene({ confirm: false });
    await s.changeBook('A'); await s.click('scan');
    assert.equal(s.calls.length, 0);
    await s.click('guess'); await s.pick(); await s.click('found-add'); await s.confirm();
    assert.equal(s.calls.length, 0);
    assert.equal(s.saved.people[0].name, '某甲');
    s.api.closeParticipantPicker();
});

test('confirmation counts complete long-entry batches, including the final named character', async () => {
    const content = '背景。'.repeat(18000) + '\n姓名：某甲';
    const s = await scene({ books: { A: [entry('A', '长条目', '1', content)] } });
    await s.changeBook('A'); await s.click('scan');
    assert.match(s.confirmations[0], /分 2 次请求/);
    assert.equal(s.calls.length, 2);
    assert.ok(s.calls.some(call => call.prompt.includes('姓名：某甲')));
    s.api.closeParticipantPicker();
});

test('switching books aborts an in-flight scan and cannot bind its late names to another book UID', async () => {
    const waiting = pending();
    const s = await scene({ books: { A: [entry('A', '某甲', '1', '背景。'.repeat(18000))], B: [entry('B', '某乙')] },
        request: async (_, __, count) => count === 1 ? waiting.promise : { people: [{ name: '某乙', aliases: [], entryUids: ['1'] }] } });
    await s.changeBook('A'); await s.click('scan');
    await s.changeBook('B');
    assert.equal(s.calls[0].options.signal.aborted, true);
    waiting.resolve({ people: [{ name: '某甲', aliases: [], entryUids: ['1'] }] });
    await tick(); await tick();
    assert.equal(s.calls.length, 1, 'no second old-source request is sent');
    assert.equal(s.node('found').innerHTML, '');
    await s.click('scan'); await s.pick(); await s.click('found-add'); await s.confirm();
    assert.equal(s.saved.people.length, 1);
    assert.equal(s.saved.people[0].name, '某乙');
    assert.equal(s.saved.people[0].sourceRefs[0].world, 'B');
    assert.equal(s.saved.people[0].sourceRefs[0].content, '姓名：某乙');
    s.api.closeParticipantPicker();
});

test('late cleanup from a cancelled scan cannot detach the replacement scan close listener', async () => {
    for (const finish of ['resolve', 'reject']) {
        const oldRequest = pending(), nextRequest = pending();
        const s = await scene({ books: { A: [entry('A', '某甲')], B: [entry('B', '某乙')] },
            request: (_, __, count) => count === 1 ? oldRequest.promise : nextRequest.promise });
        await s.changeBook('A'); await s.click('scan');
        await s.changeBook('B'); await s.click('scan');
        assert.equal(s.calls[0].options.signal.aborted, true);
        assert.equal(s.calls[1].options.signal.aborted, false);
        if (finish === 'resolve') oldRequest.resolve({ people: [] });
        else oldRequest.reject(new Error('late cancellation'));
        await tick(); await tick();
        s.api.closeParticipantPicker();
        assert.equal(s.calls[1].options.signal.aborted, true, 'closing still aborts the replacement scan after ' + finish);
        nextRequest.resolve({ people: [] }); await tick();
    }
});

test('duplicate scan clicks share one confirmed request rather than starting a second paid job', async () => {
    const waiting = pending();
    const s = await scene({ request: () => waiting.promise });
    await s.changeBook('A'); await s.click('scan'); await s.click('scan');
    assert.equal(s.confirmations.length, 1);
    assert.equal(s.calls.length, 1);
    s.api.closeParticipantPicker(); waiting.resolve({ people: [] }); await tick();
});

test('a scanned alias augments the existing named person and keeps their original ID', async () => {
    const s = await scene({ rosterPeople: [person('p1', '某乙', ['夜行客'])],
        request: async () => ({ people: [{ name: '夜行客', aliases: ['某乙'], entryUids: ['1'] }] }) });
    await s.changeBook('A'); await s.click('scan'); await s.pick(); await s.click('found-add'); await s.confirm();
    assert.equal(s.saved.people.length, 1);
    assert.equal(s.saved.people[0].id, 'p1');
    assert.equal(s.saved.people[0].name, '某乙');
    assert.deepEqual(s.saved.people[0].aliases, ['夜行客']);
    assert.equal(s.saved.people[0].sourceRefs[0].world, 'A');
    s.api.closeParticipantPicker();
});

test('an ambiguous alias stays pending for correction instead of creating or merging the wrong person', async () => {
    const s = await scene({ rosterPeople: [person('p1', '某乙', ['夜行客']), person('p2', '某甲', ['夜行客'])],
        request: async () => ({ people: [{ name: '夜行客', aliases: [], entryUids: ['1'] }] }) });
    await s.changeBook('A'); await s.click('scan'); await s.pick(); await s.click('found-add'); await s.confirm();
    assert.equal(s.saved.people.length, 2);
    assert.ok(s.saved.people.every(p => p.sourceRefs.length === 0));
    assert.match(s.node('found').innerHTML, /夜行客/);
    s.api.closeParticipantPicker();
});

test('candidate insertion order cannot merge two people who share an ambiguous alias', async () => {
    const candidates = [
        { name: '夜行客', aliases: [], entryUids: ['1'] },
        { name: '某甲', aliases: ['夜行客'], entryUids: ['1'] },
        { name: '某乙', aliases: ['夜行客'], entryUids: ['1'] },
    ];
    for (const rows of [candidates, [...candidates].reverse()]) {
        const s = await scene({ request: async () => ({ people: rows }) });
        await s.changeBook('A'); await s.click('scan'); await s.click('found-add'); await s.confirm();
        assert.deepEqual(new Set(s.saved.people.map(row => row.name)), new Set(['某甲', '某乙']));
        assert.match(s.node('found').innerHTML, /夜行客/);
        s.api.closeParticipantPicker();
    }
});

test('a known alias owner participates in disambiguating new model candidates before they are merged', async () => {
    const candidates = [{ name: '夜行客', aliases: [], entryUids: ['1'] }, { name: '某甲', aliases: ['夜行客'], entryUids: ['1'] }];
    const s = await scene({ rosterPeople: [person('p1', '某乙', ['夜行客'])], request: async () => ({ people: candidates }) });
    await s.changeBook('A'); await s.click('scan'); await s.pick(0); await s.pick(1); await s.click('found-add'); await s.confirm();
    assert.deepEqual(s.saved.people.map(row => row.name), ['某乙', '某甲']);
    assert.equal(s.saved.people[0].sourceRefs.length, 0, 'uncertain alias does not attach the new source to the known owner');
    assert.match(s.node('found').innerHTML, /夜行客/);
    s.api.closeParticipantPicker();
});

test('closing or changing chats aborts the active request and prevents the remaining batches', async () => {
    for (const cancel of ['close', 'chat']) {
        const waiting = pending();
        const s = await scene({ books: { A: [entry('A', '人物', '1', '字'.repeat(60000))] }, request: () => waiting.promise });
        await s.changeBook('A'); await s.click('scan');
        if (cancel === 'close') s.api.closeParticipantPicker(); else s.switchChat();
        assert.equal(s.calls[0].options.signal.aborted, true, cancel);
        waiting.resolve({ people: [{ name: '某甲', entryUids: ['1'] }] }); await tick(); await tick();
        assert.equal(s.calls.length, 1);
        assert.equal(s.node('found').innerHTML, '');
        s.api.closeParticipantPicker();
    }
});

test('local guessing supersedes a pending model scan without accepting its late result', async () => {
    const waiting = pending();
    const s = await scene({ request: () => waiting.promise });
    await s.changeBook('A'); await s.click('scan'); await s.click('guess');
    assert.equal(s.calls[0].options.signal.aborted, true);
    waiting.resolve({ people: [{ name: '某乙', aliases: [], entryUids: ['1'] }] }); await tick();
    assert.match(s.node('found').innerHTML, /某甲/);
    assert.doesNotMatch(s.node('found').innerHTML, /某乙/);
    s.api.closeParticipantPicker();
});
