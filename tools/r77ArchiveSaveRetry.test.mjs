import test from 'node:test';
import assert from 'node:assert/strict';
import * as repository from '../src/archive/repository.js';
import * as importRecovery from '../src/archive/importRecovery.js';
import * as contextApi from '../src/core/context.js';
import * as backup from '../src/archive/backupStore.js';
import * as constants from '../src/core/constants.js';
import * as coordinator from '../src/core/requestCoordinator.js';
import * as trace from '../src/core/taskTrace.js';
import { createDurableDeferredCommitMap } from '../src/core/deferredCommitStore.js';
import { state } from '../src/core/state.js';

const clone = value => value == null ? value : structuredClone(value);
const scene = '两人在庭院一起栽花，一人扶住花苗，另一人浇水。';
const chunkReply = { memories: [{ title: '一起栽花', summary: scene, anchors: ['庭院', '花苗'],
    participants: ['用户', '角色'], messageStart: 1, messageEnd: 1 }] };
const profileReply = {
    archiveName: '一起栽花', archiveSummary: '两人在庭院共同照料花苗。', keywords: ['庭院', '花苗'],
    relationshipReading: { char: '认真配合', user: '共同投入', relation: '一起劳动', tension: '尚无明确矛盾', direction: '合作逐渐熟悉' },
    verdictStyle: 'quiet-life',
    archiveVerdict: '一盆花的生长还需要往后的许多日子，两个人的配合也从这样具体的小事开始。他们没有急着给关系下定义，只把注意力放在眼前需要完成的事情上。在彼此都愿意投入的这段时间里，默契获得了一个可以慢慢生长的位置。故事没有把未来提前写好，留下的只是这次共同劳动，以及下一回仍有机会一起照料的期待。',
    verdictSources: [{ memoryId: 'M001', anchor: '庭院' }],
};

// Replace only host/provider/storage boundaries. The real archive entry point,
// extraction validation, profile validation, deferred queue and canonical save
// path run together. No network, model credentials or live browser are used.
function fixture(t, { backupFailure = 'QuotaExceededError', backupCause = '', localFailure = 'QuotaExceededError' } = {}) {
    const globals = new Map(['SillyTavern', 'document', 'location', 'localStorage', 'confirm', 'fetch', 'toastr']
        .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const previousDeferred = state.deferredChatCommits;
    const previousEpoch = state.runtimeLifecycleEpoch;
    const oldWarn = console.warn, oldError = console.error;
    const records = new Map(), values = new Map(), notices = [], diagnostics = [];
    let requests = 0, writeAttempts = 0, writes = 0, beforePut = null;
    let backupErrorName = backupFailure, localErrorName = localFailure;
    const profile = { id: 'save-fixture-profile', name: 'Fixture', mode: 'cc', api: 'openai',
        model: 'fixture-model', 'secret-id': 'fixture-reference' };
    const bank = { version: constants.MEMORY_VERSION, chatId: 'save-retry-chat', archiveRevision: 'old-revision',
        characterName: '角色', userName: '用户', archiveName: '旧档案', createdAt: 1, updatedAt: 1,
        memories: [{ id: 'M001', title: '旧事件', summary: scene, anchors: ['庭院'] }] };
    const ctx = { characterId: 0, groupId: null, name1: '用户', name2: '角色', chatId: bank.chatId,
        characters: [{ name: '角色', avatar: 'save-retry.png', data: { name: '角色', avatar: 'save-retry.png' } }],
        chat: [{ is_user: true, name: '用户', mes: scene }],
        chatMetadata: { [constants.MEMORY_KEY]: clone(bank) },
        extensionSettings: { [constants.EXTENSION_SETTINGS_KEY]: {
            apiConnectionMode: 'profile', connectionProfileId: profile.id,
            useCurrentChatExternalMemory: false, useActivatedWorldInfo: false,
        }, connectionManager: { profiles: [profile] } },
        getCurrentChatId() { return this.chatId; },
        getCharacterCardFields() { return {}; }, getTokenCountAsync() { return Promise.resolve(100); },
        saveSettingsDebounced() {}, saveMetadataDebounced() {},
        ConnectionManagerRequestService: {
            validateProfile() { return { selected: 'openai', source: 'openai' }; },
            async sendRequest(_id, _messages, _length, _options, overridePayload) {
                // The host compatibility guard inspects these explicit profile
                // fields in sendRequest source, as it does for the real service.
                const payload = { secret_id: profile['secret-id'], model: profile.model, ...overridePayload };
                assert.equal(payload.secret_id, 'fixture-reference');
                requests++;
                if (requests > 2) throw new Error('Saving a completed archive must not request generation again');
                return { content: JSON.stringify(requests === 1 ? chunkReply : profileReply) };
            },
        },
    };
    const storage = { getItem: key => values.get(key) ?? null,
        setItem(key, value) {
            if (localErrorName) throw new DOMException('fixture private storage detail', localErrorName);
            values.set(key, String(value));
        },
        removeItem(key) {
            if (localErrorName) throw new DOMException('fixture private removal detail', localErrorName);
            values.delete(key);
        } };
    globalThis.SillyTavern = { getContext: () => ctx };
    globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
    globalThis.location = { protocol: 'http:', href: 'http://127.0.0.1:8000/', origin: 'http://127.0.0.1:8000' };
    globalThis.localStorage = storage;
    globalThis.confirm = () => true;
    globalThis.fetch = async () => { throw new Error('Unexpected network request'); };
    globalThis.toastr = Object.fromEntries(['success', 'error', 'warning', 'info'].map(kind => [kind,
        message => notices.push({ kind, message, writes })]));
    const captureDiagnostic = (...args) => {
        for (const value of args) if (value && typeof value === 'object') {
            diagnostics.push({ code: value.code || '', name: value.name || '', field: value.field || '' });
        }
    };
    console.warn = captureDiagnostic; console.error = captureDiagnostic;
    state.deferredChatCommits = createDurableDeferredCommitMap({ storage });
    const clearMaps = ['activeGenerationTasks', 'activeCgImageTasks', 'runtimeSessionCache', 'cacheHydrationErrors',
        'cacheHydrationPromises', 'pendingCompressedCacheWrites', 'cacheCommitSequences', 'cachePersistChains',
        'archiveCommitChains', 'archiveDeletionFences', 'archiveOverviewKnownArchives', 'activeModeBuildScopes',
        'activeAdvBulkScopes', 'activeArchiveTargetReservations', 'memoryPreflightCache'];
    clearMaps.forEach(key => state[key].clear());
    state.busy = false; state.activeTaskTrace = null; state.activeMode = null; state.activeSession = null;
    state.activeTaskOrigin = null; state.activeTaskAbortController = null; state.activeTaskBackgrounded = false;
    state.archiveViewLevel = 'library'; state.activeArchiveSnapshot = null;
    backup.setArchiveBackupBackendForTests({
        async read(entry) { return clone(records.get(entry.entryId || contextApi.archiveIndexEntryId(entry)) || null); },
        async put(record, expected, options = {}) {
            writeAttempts++;
            if (beforePut) await beforePut(options);
            if (options.stillCurrent) assert.notEqual(options.stillCurrent(), false);
            if (backupErrorName) {
                const error = new DOMException('fixture private backup detail', backupErrorName);
                if (backupCause) Object.defineProperty(error, 'cause', {
                    value: new DOMException('fixture private underlying storage detail', backupCause),
                });
                throw error;
            }
            const previous = records.get(record.entryId);
            if (expected?.present === false && previous) throw new Error('Unexpected fixture duplicate create');
            if (expected?.present === true && previous?.archiveRevision !== expected.revision
                && !(options.allowMissingPrevious && !previous)) throw new Error('Unexpected fixture CAS conflict');
            writes++;
            records.set(record.entryId, clone(record));
            return true;
        },
        async delete() { throw new Error('Archive retry must not delete a canonical record'); },
    });
    trace.clearTaskTrace();
    const origin = contextApi.captureTaskOrigin(ctx, bank.archiveRevision);
    importRecovery.clearArchiveRecovery(origin);
    t.after(() => {
        importRecovery.clearArchiveRecovery(origin);
        backup.setArchiveBackupBackendForTests(null);
        for (const timer of state.cachePersistTimers.values()) clearTimeout(timer);
        state.cachePersistTimers.clear(); clearMaps.forEach(key => state[key].clear());
        state.deferredChatCommits = previousDeferred;
        state.runtimeLifecycleEpoch = previousEpoch;
        state.busy = false; state.activeTaskTrace = null; state.activeTaskOrigin = null; state.activeTaskAbortController = null;
        state.activeTaskBackgrounded = false; state.archivePreparationToken = null;
        console.warn = oldWarn; console.error = oldError;
        for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
    });
    return { ctx, bank, records, notices, values, origin, diagnostics, requests: () => requests,
        writeAttempts: () => writeAttempts, writes: () => writes,
        setBackupFailure(name) { backupErrorName = name; }, setLocalFailure(name) { localErrorName = name; },
        setBeforePut(callback) { beforePut = callback; } };
}

function pendingArchives() {
    return [...state.deferredChatCommits.values()].flat().filter(item => item.kind === 'archive');
}

test('r78 full rebuild binds the captured Persona filename through canonical save and archive indexing', async t => {
    const env = fixture(t, { backupFailure: '', localFailure: '' });
    env.ctx.chatMetadata[constants.MEMORY_KEY].userAvatar = 'old-persona.png';
    env.ctx.user_avatar = 'new-persona.png';
    env.ctx.getTokenCountAsync = async () => { env.ctx.user_avatar = 'later-persona.png'; return 100; };
    const result = await repository.importCurrentChatMemory({ automatic: true, fullRebuild: true });
    assert.equal(result.status, 'committed');
    assert.equal(env.ctx.chatMetadata[constants.MEMORY_KEY].userAvatar, 'new-persona.png');
    assert.equal([...env.records.values()][0].memory.userAvatar, 'new-persona.png');
    assert.equal(env.ctx.extensionSettings[constants.ARCHIVE_INDEX_SETTINGS_KEY][0].userAvatar, 'new-persona.png');
    assert.equal(env.requests(), 2);
});

async function finishGenerationWithFailedSave(env) {
    const result = await repository.importCurrentChatMemory({ automatic: true, fullRebuild: true });
    assert.equal(result.status, 'failed');
    assert.equal(env.requests(), 2, `the chunk and valid profile both returned; fixed diagnostics: ${JSON.stringify(env.diagnostics)}; trace: ${JSON.stringify(trace.taskTraceSnapshot())}`);
    assert.equal(env.writeAttempts(), 1, 'the failure occurs at the real canonical storage boundary');
    assert.equal(env.writes(), 0);
    assert.deepEqual(env.ctx.chatMetadata[constants.MEMORY_KEY], env.bank);
    assert.equal(state.busy, false);
    assert.equal(state.activeTaskTrace, null);
    const pending = pendingArchives();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].memoryBank.archiveVerdict?.version, 2, 'the profile is validated, not a local fallback');
    assert.equal(pending[0].memoryBank.memories[0].summary, scene);
    assert.notEqual(pending[0].memoryBank.archiveRevision, env.bank.archiveRevision);
    assert.equal(repository.getCurrentArchiveImportRecoverySummary(env.ctx)?.awaitingCommit, true,
        'a completed in-memory result offers save recovery even when localStorage rejected it');
    return pending[0];
}

for (const errorName of ['QuotaExceededError', 'SecurityError']) {
    test(`${errorName}: a completed archive retries only saving the same revision after storage recovers`, async t => {
        const env = fixture(t, { backupFailure: errorName, localFailure: errorName });
        const pending = await finishGenerationWithFailedSave(env);
        const exactRevision = pending.memoryBank.archiveRevision;
        env.setBackupFailure(''); env.setLocalFailure('');
        const result = await repository.continueCurrentArchiveImport();
        assert.equal(result.status, 'committed');
        assert.equal(env.requests(), 2, 'a save retry must not call the provider');
        assert.equal(env.writeAttempts(), 2);
        assert.equal(env.writes(), 1);
        assert.equal(repository.getImportedMemory(env.ctx)?.archiveRevision, exactRevision);
        assert.equal([...env.records.values()][0].archiveRevision, exactRevision);
        assert.deepEqual(repository.getImportedMemory(env.ctx)?.memories, pending.memoryBank.memories);
        assert.equal(pendingArchives().length, 0);
        assert.equal(repository.getCurrentArchiveImportRecoverySummary(env.ctx), null);
        assert.equal(state.busy, false);
        assert.equal(trace.taskTraceSnapshot().at(-1).outcome, 'ok');
    });
}

test('an IndexedDB AbortError caused by quota failure is a failed save, not user cancellation', async t => {
    const env = fixture(t, { backupFailure: 'AbortError', backupCause: 'QuotaExceededError', localFailure: '' });
    const pending = await finishGenerationWithFailedSave(env);
    const task = trace.taskTraceSnapshot().at(-1);
    assert.equal(task.outcome, 'failed');
    assert.equal(task.code, 'RMT_BACKUP_QUOTA');
    assert.equal(task.storage?.category, 'quota');
    assert.equal(task.storage?.stage, 'write');
    assert.ok(task.stages.some(stage => stage.startsWith('save!@')));
    assert.equal(pendingArchives()[0], pending);
    assert.equal(env.requests(), 2);
    assert.deepEqual(env.ctx.chatMetadata[constants.MEMORY_KEY], env.bank);
});

test('repeated storage failure keeps the exact completed bank and each retry uses no model request', async t => {
    const env = fixture(t);
    const pending = await finishGenerationWithFailedSave(env);
    for (let attempt = 0; attempt < 2; attempt++) {
        const result = await repository.continueCurrentArchiveImport();
        assert.equal(result.status, 'failed');
        assert.equal(env.requests(), 2);
        assert.equal(pendingArchives()[0], pending, 'the original completed result remains available');
        assert.equal(repository.getCurrentArchiveImportRecoverySummary(env.ctx)?.awaitingCommit, true);
        assert.deepEqual(env.ctx.chatMetadata[constants.MEMORY_KEY], env.bank);
        assert.equal(state.busy, false);
    }
    assert.equal(env.writeAttempts(), 3);
    assert.equal(env.writes(), 0);
});

test('editing text without changing the message count fences an old save retry', async t => {
    const env = fixture(t);
    const pending = await finishGenerationWithFailedSave(env);
    env.setBackupFailure(''); env.setLocalFailure('');
    env.ctx.chat[0].mes = '用户独自回到房间，没有去庭院栽花。';
    const result = await repository.continueCurrentArchiveImport();
    assert.notEqual(result.status, 'committed');
    assert.equal(env.requests(), 2);
    assert.equal(env.writeAttempts(), 1, 'source mismatch is rejected before durable write');
    assert.equal(env.writes(), 0);
    assert.equal(pendingArchives()[0], pending);
    assert.deepEqual(env.ctx.chatMetadata[constants.MEMORY_KEY], env.bank);
    assert.equal(state.busy, false);
});

test('a renamed card in the same slot saves successfully without reporting its committed revision as a failure', async t => {
    const env = fixture(t);
    const pending = await finishGenerationWithFailedSave(env);
    env.ctx.name2 = '新名字';
    env.ctx.characters[0].name = '新名字'; env.ctx.characters[0].data.name = '新名字';
    env.setBackupFailure(''); env.setLocalFailure('');
    const result = await repository.continueCurrentArchiveImport();
    assert.equal(result.status, 'committed');
    assert.equal(repository.getImportedMemory(env.ctx)?.archiveRevision, pending.memoryBank.archiveRevision);
    assert.equal(repository.getImportedMemory(env.ctx)?.characterName, '新名字');
    assert.equal(env.requests(), 2);
    assert.equal(pendingArchives().length, 0);
});

test('a newer archive revision blocks saving an older completed result without discarding it', async t => {
    const env = fixture(t);
    const pending = await finishGenerationWithFailedSave(env);
    const newer = { ...clone(env.bank), archiveRevision: 'newer-revision' };
    env.ctx.chatMetadata[constants.MEMORY_KEY] = newer;
    env.setBackupFailure(''); env.setLocalFailure('');
    const result = await repository.continueCurrentArchiveImport();
    assert.equal(result.status, 'failed');
    assert.deepEqual(env.ctx.chatMetadata[constants.MEMORY_KEY], newer);
    assert.equal(pendingArchives()[0], pending);
    assert.equal(env.writeAttempts(), 1);
    assert.equal(env.requests(), 2);
    assert.equal(trace.taskTraceSnapshot().at(-1).code, 'RMT_CACHE_CAS_CONFLICT');
});

test('opening another chat cannot offer or commit this chat\'s completed result', async t => {
    const env = fixture(t);
    const pending = await finishGenerationWithFailedSave(env);
    env.ctx.chatId = 'another-chat';
    env.setBackupFailure(''); env.setLocalFailure('');
    assert.equal(repository.getCurrentArchiveImportRecoverySummary(env.ctx), null);
    assert.equal((await repository.continueCurrentArchiveImport()).status, 'blocked');
    assert.equal(pendingArchives()[0], pending);
    assert.equal(env.writeAttempts(), 1);
    assert.equal(env.requests(), 2);
});

test('a runtime lifecycle change inside the storage wait blocks the actual save retry write', async t => {
    const env = fixture(t);
    const pending = await finishGenerationWithFailedSave(env);
    env.setBackupFailure(''); env.setLocalFailure('');
    env.setBeforePut(async options => {
        assert.equal(typeof options.stillCurrent, 'function', 'the canonical backend must receive the live task fence');
        await Promise.resolve();
        state.runtimeLifecycleEpoch++;
    });
    const result = await repository.continueCurrentArchiveImport();
    assert.notEqual(result.status, 'committed');
    assert.equal(env.writes(), 0);
    assert.equal(env.requests(), 2);
    assert.equal(pendingArchives()[0], pending);
    assert.deepEqual(env.ctx.chatMetadata[constants.MEMORY_KEY], env.bank);
});

test('a foreign raw archive is preserved and blocks a paid rebuild before its first request', async t => {
    const env = fixture(t, { backupFailure: '', localFailure: '' });
    const foreign = { ...clone(env.bank), chatId: 'different-chat', archiveRevision: 'foreign-revision' };
    env.ctx.chatMetadata[constants.MEMORY_KEY] = foreign;
    let outcome;
    try { outcome = await repository.importCurrentChatMemory({ fullRebuild: true }); }
    catch (error) { outcome = { status: 'failed', code: error.code }; }
    assert.notEqual(outcome.status, 'committed');
    assert.equal(env.requests(), 0);
    assert.equal(env.writeAttempts(), 0);
    assert.deepEqual(env.ctx.chatMetadata[constants.MEMORY_KEY], foreign);
    assert.equal(trace.taskTraceSnapshot().at(-1).code, 'RMT_ARCHIVE_SOURCE_MISMATCH');
    assert.equal(state.busy, false);
});

test('discard must retain a queued archive when durable removal fails and preserve other result kinds', async t => {
    const env = fixture(t, { localFailure: '' });
    const pending = await finishGenerationWithFailedSave(env);
    const other = coordinator.queueDeferredCommitRecord(pending.origin, { kind: 'sessions', sessions: { album: { kind: 'album' } } });
    assert.equal(other.durable, true);
    const storedBefore = [...env.values.entries()];
    env.setLocalFailure('SecurityError');
    assert.equal(typeof repository.discardCurrentArchiveImportRecovery, 'function');
    assert.throws(() => repository.discardCurrentArchiveImportRecovery(env.ctx),
        error => error.code === 'RMT_DEFERRED_SECURITY');
    assert.equal(pendingArchives()[0], pending);
    assert.equal(repository.getCurrentArchiveImportRecoverySummary(env.ctx)?.awaitingCommit, true);
    assert.deepEqual([...env.values.entries()], storedBefore, 'failed deletion keeps the durable snapshot');
    assert.ok([...state.deferredChatCommits.values()].flat().includes(other.item));
    env.setLocalFailure('');
    assert.equal(repository.discardCurrentArchiveImportRecovery(env.ctx), true);
    assert.equal(pendingArchives().length, 0);
    assert.equal(repository.getCurrentArchiveImportRecoverySummary(env.ctx), null);
    assert.ok([...state.deferredChatCommits.values()].flat().includes(other.item));
    assert.deepEqual(env.ctx.chatMetadata[constants.MEMORY_KEY], env.bank);
    assert.equal(env.requests(), 2);
    assert.equal(env.writes(), 0);
});
