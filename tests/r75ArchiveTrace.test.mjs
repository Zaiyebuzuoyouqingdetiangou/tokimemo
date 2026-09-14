import test from 'node:test';
import assert from 'node:assert/strict';
import * as repository from '../src/archive/repository.js';
import * as importRecovery from '../src/archive/importRecovery.js';
import * as contextApi from '../src/core/context.js';
import * as backup from '../src/archive/backupStore.js';
import * as constants from '../src/core/constants.js';
import * as client from '../src/generation/client.js';
import * as trace from '../src/core/taskTrace.js';
import { state } from '../src/core/state.js';

const clone = value => value == null ? value : structuredClone(value);
const scene = '两人在庭院一起栽花，一人扶住花苗，另一人浇水。';

// Only host/provider/storage boundaries are replaced. These tests call the real
// archive entry point, recovery, parser, normalizer and canonical save/CAS path.
function fixture(t, { response = '{}', stalledTokenizer = false } = {}) {
    const keys = ['SillyTavern', 'document', 'location', 'localStorage', 'confirm', 'fetch', 'toastr', 'setTimeout'];
    const globals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const oldWarn = console.warn, oldError = console.error;
    const realSetTimeout = globalThis.setTimeout;
    const values = new Map(), records = new Map(), notices = [], diagnostics = [];
    let requests = 0, tokenCalls = 0, writes = 0;
    const profile = { id: 'fixture-profile', name: 'Fixture', mode: 'cc', api: 'openai', model: 'fixture-model', 'secret-id': 'fixture-reference' };
    const bank = { version: constants.MEMORY_VERSION, chatId: 'fixture-chat', archiveRevision: 'old-revision',
        characterName: '角色', userName: '用户', archiveName: '旧档案', createdAt: 1, updatedAt: 1,
        memories: [{ id: 'M001', title: '旧事件', summary: scene, anchors: ['庭院'] }] };
    const ctx = {
        characterId: 0, groupId: null, name1: '用户', name2: '角色', chatId: bank.chatId,
        characters: [{ name: '角色', avatar: 'fixture.png', data: { name: '角色', avatar: 'fixture.png' } }],
        chat: [{ is_user: true, name: '用户', mes: scene }],
        chatMetadata: { [constants.MEMORY_KEY]: clone(bank) },
        extensionSettings: { [constants.EXTENSION_SETTINGS_KEY]: {
            apiConnectionMode: 'profile', connectionProfileId: profile.id,
            useCurrentChatExternalMemory: false, useActivatedWorldInfo: false,
        }, connectionManager: { profiles: [profile] } },
        getCurrentChatId() { return this.chatId; },
        getCharacterCardFields() { return {}; },
        getTokenCountAsync() { tokenCalls++; return stalledTokenizer ? new Promise(() => {}) : Promise.resolve(100); },
        saveSettingsDebounced() {}, saveMetadataDebounced() {},
        ConnectionManagerRequestService: {
            validateProfile() { return { selected: 'openai', source: 'openai' }; },
            async sendRequest(_id, _messages, _length, _options, overridePayload) {
                // This boundary double implements the same explicit-profile capabilities
                // required by the production guard, without credentials or real transport.
                const payload = { secret_id: profile['secret-id'], model: profile.model, ...overridePayload };
                assert.equal(payload.secret_id, 'fixture-reference');
                requests++;
                return { content: response };
            },
        },
    };
    globalThis.SillyTavern = { getContext: () => ctx };
    globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
    globalThis.location = { href: 'https://fixture.invalid/', origin: 'https://fixture.invalid/' };
    globalThis.localStorage = { getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
    globalThis.confirm = () => true;
    globalThis.fetch = async () => { throw new Error('Unexpected network request'); };
    globalThis.toastr = Object.fromEntries(['success', 'error', 'warning', 'info'].map(kind => [kind,
        message => notices.push({ kind, message, writes })]));
    console.warn = (...args) => diagnostics.push(args);
    console.error = (...args) => diagnostics.push(args);
    // Exercise the real timeout branch without a five-second test delay.
    globalThis.setTimeout = (callback, delay, ...args) => realSetTimeout(callback,
        delay === client.TOKEN_COUNT_TIMEOUT_MS ? 1 : delay, ...args);
    backup.setArchiveBackupBackendForTests({
        async read(entry) { return clone(records.get(entry.entryId || contextApi.archiveIndexEntryId(entry)) || null); },
        async put(record, expected, options = {}) {
            const previous = records.get(record.entryId);
            if (expected?.present === true && !previous && !options.allowMissingPrevious) throw new Error('Missing fixture baseline');
            if (expected?.present === true && previous && previous.archiveRevision !== expected.revision) throw new Error('Fixture CAS conflict');
            if (expected?.present === false && previous) throw new Error('Fixture duplicate create');
            writes++;
            records.set(record.entryId, clone(record));
            return true;
        },
        async delete() { throw new Error('Archive deletion is outside this test'); },
    });
    trace.clearTaskTrace();
    state.busy = false; state.activeTaskTrace = null; state.activeMode = null; state.activeSession = null;
    state.activeTaskOrigin = null; state.activeTaskAbortController = null; state.archiveViewLevel = 'library';
    state.activeGenerationTasks.clear(); state.activeCgImageTasks.clear(); state.runtimeSessionCache.clear();
    state.cacheHydrationErrors.clear(); state.activeModeBuildScopes.clear(); state.activeAdvBulkScopes.clear();
    state.activeArchiveTargetReservations.clear(); state.deferredChatCommits.clear();
    const origin = contextApi.captureTaskOrigin(ctx, bank.archiveRevision);
    importRecovery.clearArchiveRecovery(origin);
    t.after(() => {
        importRecovery.clearArchiveRecovery(origin);
        backup.setArchiveBackupBackendForTests(null);
        for (const timer of state.cachePersistTimers.values()) clearTimeout(timer);
        for (const key of ['cachePersistTimers', 'runtimeSessionCache', 'cacheHydrationErrors', 'cacheHydrationPromises',
            'pendingCompressedCacheWrites', 'cacheCommitSequences', 'cachePersistChains', 'archiveCommitChains', 'deferredChatCommits']) state[key].clear();
        state.busy = false; state.activeTaskTrace = null; state.activeTaskOrigin = null; state.activeTaskAbortController = null;
        console.warn = oldWarn; console.error = oldError;
        for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
    });
    return { ctx, bank, records, notices, diagnostics, requests: () => requests, tokens: () => tokenCalls, writes: () => writes };
}

test('a returned but invalid archive chunk reports failure and releases the real import lock', async t => {
    const env = fixture(t);
    const result = await repository.importCurrentChatMemory({ automatic: true, fullRebuild: true });
    assert.equal(result.status, 'failed');
    assert.equal(env.requests(), 1);
    assert.equal(state.busy, false);
    assert.equal(state.activeTaskTrace, null);
    assert.equal(env.writes(), 0);
    assert.deepEqual(env.ctx.chatMetadata[constants.MEMORY_KEY], env.bank);
    const task = trace.taskTraceSnapshot().at(-1);
    assert.equal(task.outcome, 'failed');
    assert.equal(task.code, 'RMT_ARCHIVE_CHUNK');
    assert.deepEqual(task.chunks, { total: 1, ok: 0, failed: 1, pending: 0 });
    assert.ok(task.stages.some(stage => stage.startsWith('response@')));
    assert.ok(task.stages.some(stage => stage.startsWith('parse@')));
    assert.ok(task.stages.some(stage => stage.startsWith('validate!@')));
    assert.ok(!task.stages.some(stage => /^(save|done)@/.test(stage)));
});

test('profile request proceeds after token-count fallback; invalid profile still preserves validated memories', async t => {
    const response = JSON.stringify({ memories: [{ title: '一起栽花', summary: scene, anchors: ['庭院', '花苗'],
        participants: ['用户', '角色'], messageStart: 1, messageEnd: 1 }] });
    const env = fixture(t, { response, stalledTokenizer: true });
    const result = await repository.importCurrentChatMemory({ automatic: true, fullRebuild: true });
    assert.equal(result.status, 'committed');
    assert.equal(env.requests(), 2, 'one extraction and the already authorized profile request, with no retry');
    assert.equal(env.tokens(), 1);
    assert.equal(state.busy, false);
    const saved = env.ctx.chatMetadata[constants.MEMORY_KEY];
    assert.notEqual(saved.archiveRevision, env.bank.archiveRevision);
    assert.equal(saved.memories[0].summary, scene);
    assert.equal([...env.records.values()][0].archiveRevision, saved.archiveRevision);
    const task = trace.taskTraceSnapshot().at(-1);
    assert.equal(task.outcome, 'ok');
    assert.equal(task.code, 'RMT_ARCHIVE_VERDICT');
    assert.deepEqual(task.chunks, { total: 1, ok: 1, failed: 0, pending: 0 });
    for (const prefix of ['response@', 'parse@', 'validate@', 'token-count!@', 'token-count-fallback@', 'profile!@', 'save@', 'done@']) {
        assert.ok(task.stages.some(stage => stage.startsWith(prefix)), prefix);
    }
    assert.ok(!env.notices.some(notice => notice.writes === 0 && /已全部保存|回忆已保存|创建完成|完全重建完成/.test(notice.message)));
    assert.equal(repository.getCurrentArchiveImportRecoverySummary(env.ctx)?.profileOnly, true);

    globalThis.confirm = () => false;
    const cancelled = await repository.rewriteCurrentArchiveVerdict();
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(trace.taskTraceSnapshot().at(-1).outcome, 'cancelled');
    assert.equal(env.requests(), 2);
    assert.equal(state.busy, false);
});

test('an early blocked archive import closes its trace instead of leaving a running task', async t => {
    const env = fixture(t);
    delete env.ctx.chatMetadata[constants.MEMORY_KEY];
    const result = await repository.importCurrentChatMemory({ automatic: true });
    assert.equal(result.status, 'blocked');
    assert.equal(trace.taskTraceSnapshot().at(-1).outcome, 'blocked');
    assert.equal(state.busy, false);
    assert.equal(env.requests(), 0);
});

test('archive trace exports only fixed labels and retains final stages after many chunks', () => {
    trace.clearTaskTrace();
    const task = trace.startTaskTrace('绝密聊天名称', '角色真名');
    for (let i = 0; i < 30; i++) trace.markStage(task, 'validate');
    trace.beginStage(task, 'save');
    trace.endTaskTrace(task, 'failed', { code: 'RMT_SECRET_CHAT_TITLE', failedField: '用户私人姓名', message: 'sk-secret-response' });
    const snapshot = trace.taskTraceSnapshot();
    const text = JSON.stringify(snapshot);
    for (const privateText of ['绝密聊天名称', '角色真名', 'RMT_SECRET_CHAT_TITLE', '用户私人姓名', 'sk-secret-response']) assert.ok(!text.includes(privateText));
    assert.equal(snapshot[0].mode, 'unknown');
    assert.equal(snapshot[0].code, 'RMT_UNCODED');
    assert.equal(snapshot[0].stages.length, 24);
    assert.ok(snapshot[0].stages.some(stage => stage.startsWith('save!@')));
    assert.ok(snapshot[0].stages.at(-1).startsWith('failed!@'));
});
