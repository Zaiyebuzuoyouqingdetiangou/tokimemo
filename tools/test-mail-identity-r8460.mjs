import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as inbox from '../src/modes/inbox.js';
import * as cache from '../src/core/cache.js';
import * as contextApi from '../src/core/context.js';
import * as constants from '../src/core/constants.js';
import * as text from '../src/core/text.js';
import { parsePartialJsonObject } from '../src/generation/jsonParser.js';

async function loadModule(relative, overrides) {
    const url = new URL(relative, import.meta.url);
    const module = new vm.SourceTextModule(await readFile(url, 'utf8'), { identifier: url.href });
    await module.link(async specifier => {
        const exports = overrides[specifier] || await import(new URL(specifier, url).href);
        const stub = new vm.SyntheticModule(Object.keys(exports), function () {
            for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
        });
        await stub.link(() => {}); await stub.evaluate(); return stub;
    });
    await module.evaluate(); return module.namespace;
}

async function fixture({ legacy = true } = {}) {
    const bank = { version: 3, chatId: 'mail-chat', archiveRevision: 'r1', characterName: '林深', userName: '阿宁',
        memories: [{ id: 'M1', title: '原事件', summary: '原正文', anchors: ['原锚点'] }] };
    const context = { characterId: 0, name1: '阿宁', name2: '林深', chatId: bank.chatId, extensionSettings: {},
        characters: [{ name: '林深', avatar: 'lin.png', description: '旧人设' }],
        chatMetadata: { [constants.MEMORY_KEY]: bank } };
    const saved = { ...inbox.emptyInbox(bank, context), letters: [{ id: 'old', eventKey: 'old', type: 'daily',
        title: '旧信', greeting: '阿宁', body: '  原信正文\n\n保留换行  ', closing: '林深', readAt: null, favorite: false, createdAt: 1 }] };
    if (legacy) delete saved.ownerOrigin;
    const stored = { chatId: bank.chatId, archiveRevision: bank.archiveRevision, inbox: structuredClone(saved) };
    context.chatMetadata[constants.CACHE_KEY] = stored;
    const state = { activeMode: 'inbox', activeSession: structuredClone(saved), activeArchiveSnapshot: null,
        activeArchiveReadOnly: false, runtimeLifecycleEpoch: 0 };
    const body = { innerHTML: '' }, counts = { receive: 0, requests: 0, mutations: 0 };
    const errors = [];
    const contextTools = { ...contextApi, currentCharacterGuard: () => context,
        runtimeLifecycleStillCurrent: () => true, isCurrentTaskOrigin: () => true };
    const cacheTools = { ...cache, getCache: () => stored,
        loadSession: (mode, options = {}) => cache.loadSession(mode, { ...options, context, cache: stored, memoryBank: bank, clone: true }),
        commitSessionMutation: async (_mode, _chat, _origin, mutate) => {
            counts.mutations++;
            stored.inbox = mutate(structuredClone(stored.inbox), bank);
            return structuredClone(stored.inbox);
        } };
    const generation = { generateMode: async () => { counts.receive++; },
        requestValidatedSegment: async (_prompt, _status, _options, validate) => {
            counts.requests++;
            return validate({ letters: [{ slot: 'daily', title: '新信', greeting: '阿宁', body: '新写的信。', closing: '林深' }] });
        } };
    const mode = await loadModule('../src/modes/inbox.js', { '../generation/client.js': generation,
        '../core/cache.js': cacheTools, '../core/context.js': contextTools });
    const ui = await loadModule('../src/ui/inboxView.js', { '../modes/inbox.js': mode, '../core/cache.js': cacheTools,
        '../core/context.js': contextTools, '../core/state.js': { state }, '../generation/client.js': generation,
        './overlay.js': { topTitle: () => {}, bodyEl: () => body } });
    globalThis.toastr = { error: message => errors.push(message) };
    return { bank, context, stored, state, saved, mode, ui, counts, errors };
}

test('editing the same card keeps canonical legacy mail readable, receivable and favoriteable', async () => {
    const f = await fixture();
    f.context.characters[0].description = '修改后的人设';
    assert.doesNotThrow(() => f.ui.assertShownInboxTarget());
    await f.ui.handleInboxAction('receive');
    assert.equal(f.counts.receive, 1);
    await f.ui.handleInboxAction('favorite', 'old');
    assert.equal(f.counts.mutations, 1);
    assert.equal(f.stored.inbox.letters[0].favorite, true);
    assert.equal(f.stored.inbox.letters[0].body, f.saved.letters[0].body);
    assert.equal(f.counts.requests, 0, 'favorite never generates replacement content');
    assert.deepEqual(f.errors, []);
});

test('same-card fresh and partial mail append after an edit while retaining every old letter', async () => {
    const f = await fixture();
    f.context.characters[0].description = '修改后的人设';
    const previous = structuredClone(f.saved), before = structuredClone(previous), date = new Date('2026-09-25T12:00:00Z');
    const generated = await f.mode.generateInbox(f.context, f.bank, {}, 'inbox:test', previous, { date });
    assert.equal(f.counts.requests, 1);
    assert.equal(generated.letters.length, 2);
    assert.deepEqual(generated.letters[0], before.letters[0]);
    assert.deepEqual(previous, before);
    assert.equal(generated.ownerKey, before.ownerKey);
    assert.doesNotThrow(() => inbox.mergeInboxLatest(f.stored.inbox, generated));
    const segment = parsePartialJsonObject(JSON.stringify({ letters: [{ slot: 'daily', title: '未完成页的新信', greeting: '阿宁', body: '新正文。', closing: '林深' }] }));
    const partial = f.mode.projectInboxProgress({ segments: [segment], memoryBank: f.bank, context: f.context,
        previousSession: previous, operation: { inboxDate: date.toISOString() } });
    assert.equal(partial.letters.length, 2);
    assert.deepEqual(partial.letters[0], before.letters[0]);
});

test('canonical proof does not authorize a stale view from another card, chat, revision or mailbox', async () => {
    for (const change of ['slot', 'chat', 'revision', 'canonical']) {
        const f = await fixture();
        f.context.characters[0].description = '修改后的人设';
        if (change === 'slot') { f.context.characterId = 1; f.context.characters.push({ ...f.context.characters[0] }); }
        if (change === 'chat') { f.context.chatId = 'other'; f.bank.chatId = 'other'; }
        if (change === 'revision') f.bank.archiveRevision = 'r2';
        if (change === 'canonical') f.stored.inbox.ownerKey = 'different-owner';
        assert.throws(() => f.ui.assertShownInboxTarget(), { code: 'RMT_INBOX_TARGET_CHANGED' }, change);
        await f.ui.handleInboxAction('favorite', 'old');
        assert.equal(f.counts.mutations, 0);
    }
});

test('new mail captures stable owner identity and another avatar cannot reuse it', async () => {
    const f = await fixture({ legacy: false });
    assert.equal(f.saved.ownerOrigin.characterAvatar, 'lin.png');
    f.context.characters[0].description = 'new description';
    assert.doesNotThrow(() => f.ui.assertShownInboxTarget());
    f.context.characters[0].avatar = 'another.png';
    assert.throws(() => f.ui.assertShownInboxTarget(), { code: 'RMT_INBOX_TARGET_CHANGED' });
});

test('an unavailable avatar adds no restriction to the existing canonical same-card mailbox', async () => {
    const f = await fixture({ legacy: false });
    f.context.characters[0].avatar = '';
    const withoutAvatar = { ...inbox.emptyInbox(f.bank, f.context), letters: f.saved.letters };
    f.stored.inbox = structuredClone(withoutAvatar); f.state.activeSession = structuredClone(withoutAvatar);
    assert.doesNotThrow(() => f.ui.assertShownInboxTarget());
    f.context.characters[0].description = 'updated';
    assert.doesNotThrow(() => f.ui.assertShownInboxTarget());
});

test('a mismatched legacy mailbox is rejected before sending a new letter request', async () => {
    const f = await fixture();
    f.context.characters[0].description = 'modified';
    f.stored.inbox.ownerKey = 'another-mailbox';
    await assert.rejects(f.mode.generateInbox(f.context, f.bank, {}, 'inbox:test', f.saved), { code: 'RMT_INBOX_TARGET_CHANGED' });
    assert.equal(f.counts.requests, 0);
    assert.throws(() => inbox.mergeInboxLatest(f.saved, { ...f.saved, ownerKey: 'another-mailbox' }), { code: 'RMT_INBOX_TARGET_CHANGED' });
});

test('local inbox failures keep concrete user-facing reasons', async () => {
    const f = await fixture();
    f.state.activeSession = null;
    assert.throws(() => f.ui.assertShownInboxTarget(), error => error.code === 'RMT_INBOX_CLOSED'
        && /邮箱.*关闭/.test(text.safeErrorSummary(error)) && !/具体原因未记录/.test(text.safeErrorSummary(error)));
    assert.throws(() => inbox.mergeInboxLatest(null, null), error => error.code === 'RMT_INBOX_STRUCTURE'
        && /邮箱结构/.test(text.safeErrorSummary(error)));
    assert.throws(() => inbox.normalizeInboxLetters({}, f.bank, inbox.inboxPlan(f.bank)), error => error.code === 'RMT_INBOX_INCOMPLETE'
        && /来信未完整/.test(text.safeErrorSummary(error)));
});
