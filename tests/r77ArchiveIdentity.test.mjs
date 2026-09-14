import test from 'node:test';
import assert from 'node:assert/strict';
import * as constants from '../src/core/constants.js';
import * as contextApi from '../src/core/context.js';
import * as cache from '../src/core/cache.js';
import * as repository from '../src/archive/repository.js';
import * as backup from '../src/archive/backupStore.js';
import * as groups from '../src/archive/groups.js';
import * as coordinator from '../src/core/requestCoordinator.js';
import { createDurableDeferredCommitMap } from '../src/core/deferredCommitStore.js';
import { state } from '../src/core/state.js';

const clone = value => value == null ? value : structuredClone(value);

// Only the host and durable storage boundaries are replaced. Archive identity,
// schema normalization, commit serialization, CAS and backup recovery are real.
function fixture(t, { hostChatId = 'identity-chat', existing = null, storageDenied = false } = {}) {
    const globals = new Map(['SillyTavern', 'document', 'location', 'localStorage', 'toastr', 'fetch']
        .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const oldError = console.error, oldWarn = console.warn;
    const previousDeferred = state.deferredChatCommits;
    const records = new Map(), values = new Map(), notices = [];
    let writes = 0;
    let afterWrite = null;
    const bank = { version: constants.MEMORY_VERSION, chatId: 'identity-chat', archiveRevision: 'new-revision',
        characterName: '角色', userName: '用户', archiveName: '庭院回忆', createdAt: 1, updatedAt: 2,
        sourceMessageCount: 1, memories: [{ id: 'M001', title: '栽花', summary: '两人在庭院一起栽花。' }] };
    const ctx = { characterId: 0, groupId: null, name1: '用户', name2: '角色', chatId: hostChatId,
        characters: [{ name: '角色', avatar: 'identity.png', data: { name: '角色', avatar: 'identity.png' } }],
        chat: [{ is_user: true, name: '用户', mes: '两人在庭院一起栽花。' }],
        chatMetadata: existing ? { [constants.MEMORY_KEY]: clone(existing) } : {},
        extensionSettings: {}, metadataSaves: 0,
        getCurrentChatId() { return this.chatId; },
        getCharacterCardFields() { return {}; },
        saveMetadataDebounced() { this.metadataSaves++; }, saveSettingsDebounced() {},
    };
    const storage = { getItem: key => values.get(key) ?? null,
        setItem(key, value) {
            if (storageDenied) throw new DOMException('fixture quota', 'QuotaExceededError');
            values.set(key, String(value));
        }, removeItem: key => values.delete(key) };
    globalThis.SillyTavern = { getContext: () => ctx };
    globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
    globalThis.location = { protocol: 'http:', href: 'http://127.0.0.1:8000/', origin: 'http://127.0.0.1:8000' };
    globalThis.localStorage = storage;
    globalThis.toastr = Object.fromEntries(['success', 'error', 'warning', 'info'].map(kind => [kind,
        message => notices.push({ kind, message })]));
    globalThis.fetch = async () => { throw new Error('Archive saving must not send a model or network request'); };
    console.error = () => {}; console.warn = () => {};
    state.deferredChatCommits = createDurableDeferredCommitMap({ storage });
    for (const key of ['runtimeSessionCache', 'cacheHydrationErrors', 'cacheHydrationPromises',
        'pendingCompressedCacheWrites', 'cacheCommitSequences', 'cachePersistChains', 'archiveCommitChains',
        'archiveDeletionFences', 'archiveOverviewKnownArchives']) state[key].clear();
    backup.setArchiveBackupBackendForTests({
        async read(entry) { return clone(records.get(entry.entryId || contextApi.archiveIndexEntryId(entry)) || null); },
        async put(record, expected, options = {}) {
            const previous = records.get(record.entryId);
            if (expected?.present === false && previous) throw new Error('Unexpected duplicate fixture create');
            if (expected?.present === true && previous?.archiveRevision !== expected.revision
                && !(options.allowMissingPrevious && !previous)) throw new Error('Unexpected fixture CAS conflict');
            writes++;
            records.set(record.entryId, clone(record));
            afterWrite?.();
            return true;
        },
        async delete() { throw new Error('Archive save must not delete a durable record'); },
    });
    t.after(() => {
        for (const timer of state.cachePersistTimers.values()) clearTimeout(timer);
        for (const key of ['cachePersistTimers', 'runtimeSessionCache', 'cacheHydrationErrors', 'cacheHydrationPromises',
            'pendingCompressedCacheWrites', 'cacheCommitSequences', 'cachePersistChains', 'archiveCommitChains',
            'archiveDeletionFences', 'archiveOverviewKnownArchives']) state[key].clear();
        state.deferredChatCommits = previousDeferred;
        backup.setArchiveBackupBackendForTests(null);
        console.error = oldError; console.warn = oldWarn;
        for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
    });
    const origin = contextApi.captureTaskOrigin(ctx, existing?.archiveRevision || '');
    const options = { expectedTaskOrigin: origin, explicitCreate: !existing,
        expectedPreviousArchiveState: { present: !!existing, revision: existing?.archiveRevision || '' } };
    return { ctx, bank, records, origin, options, notices, writes: () => writes,
        afterWrite: callback => { afterWrite = callback; } };
}

test('a .jsonl host chat saves its canonical archive and reopens from the independent backup', async t => {
    const f = fixture(t, { hostChatId: 'identity-chat.jsonl' });
    const saved = await cache.saveImportedMemory(f.ctx, f.bank, 'identity-chat', f.options);
    assert.equal(saved.archiveRevision, 'new-revision');
    assert.equal(f.writes(), 1);
    assert.equal(repository.getImportedMemory(f.ctx)?.archiveRevision, 'new-revision');
    const entry = cache.archiveBackupEntryForContext(f.ctx, saved);
    const stored = await backup.readArchiveBackup(entry);
    assert.equal(stored.memory.chatId, 'identity-chat');
    assert.equal(stored.archiveRevision, 'new-revision');
    f.ctx.chatMetadata = {};
    state.runtimeSessionCache.clear();
    assert.equal(await cache.ensureCurrentArchiveBackup(f.ctx), true);
    assert.equal(repository.getImportedMemory(f.ctx)?.archiveRevision, 'new-revision');
    assert.deepEqual(repository.getImportedMemory(f.ctx).memories, f.bank.memories);
    assert.equal(f.writes(), 1, 'reopening reads the committed archive without another write or generation');
});

test('different chat identities remain rejected before either storage copy changes', async t => {
    const f = fixture(t);
    await assert.rejects(cache.saveImportedMemory(f.ctx, { ...f.bank, chatId: 'another-chat' }, 'identity-chat', f.options),
        error => error.code === 'RMT_RECOVERY_ORIGIN_CHANGED');
    assert.deepEqual(f.ctx.chatMetadata, {});
    assert.equal(f.records.size, 0);
});

test('a foreign raw archive occupying metadata is preserved by compare-and-set', async t => {
    const f = fixture(t);
    const foreign = { ...f.bank, chatId: 'another-chat', archiveRevision: 'foreign-revision' };
    f.ctx.chatMetadata[constants.MEMORY_KEY] = clone(foreign);
    await assert.rejects(cache.saveImportedMemory(f.ctx, f.bank, 'identity-chat', f.options),
        error => error.code === 'RMT_CACHE_CAS_CONFLICT');
    assert.deepEqual(f.ctx.chatMetadata[constants.MEMORY_KEY], foreign);
    assert.equal(f.records.size, 0);
});

test('a newer metadata revision is never replaced by a completed older task', async t => {
    const old = { version: 3, chatId: 'identity-chat', archiveRevision: 'old-revision', memories: [] };
    const f = fixture(t, { existing: old });
    f.ctx.chatMetadata[constants.MEMORY_KEY].archiveRevision = 'newer-revision';
    await assert.rejects(cache.saveImportedMemory(f.ctx, f.bank, 'identity-chat', f.options),
        error => error.code === 'RMT_CACHE_CAS_CONFLICT');
    assert.equal(f.ctx.chatMetadata[constants.MEMORY_KEY].archiveRevision, 'newer-revision');
    assert.equal(f.records.size, 0);
});

test('a deletion made after generation began still rejects the completed archive', async t => {
    const f = fixture(t);
    const probe = groups.currentCharacterArchiveProbe(f.ctx, f.bank);
    groups.setDeletedArchiveCharacters(f.ctx, [{ id: 'fixture-deletion', characterName: '角色',
        sourceIdentityKeys: [contextApi.archiveSourceIdentityKey(probe)], deletedAt: f.origin.startedAt + 1 }]);
    await assert.rejects(cache.saveImportedMemory(f.ctx, f.bank, 'identity-chat', f.options),
        error => error.code === 'RMT_ARCHIVE_DELETED_FENCE');
    assert.deepEqual(f.ctx.chatMetadata, {});
    assert.equal(f.records.size, 0);
    assert.equal(groups.getDeletedArchiveCharacters(f.ctx).length, 1);
});

test('localStorage rejection does not block a writable independent archive backup', async t => {
    const f = fixture(t, { storageDenied: true });
    const queued = coordinator.queueDeferredCommitRecord(f.origin, { kind: 'archive', memoryBank: clone(f.bank) });
    assert.equal(queued.durable, false);
    assert.equal(state.deferredChatCommits.size, 1);
    await cache.saveImportedMemory(f.ctx, f.bank, 'identity-chat', f.options);
    assert.equal(f.writes(), 1);
    assert.equal(repository.getImportedMemory(f.ctx)?.archiveRevision, 'new-revision');
    assert.equal([...f.records.values()][0].archiveRevision, 'new-revision');
});

test('switching chats during the backup await cannot install the archive in another chat', async t => {
    const f = fixture(t);
    f.afterWrite(() => { f.ctx.chatId = 'another-chat'; f.ctx.chatMetadata = {}; });
    await assert.rejects(cache.saveImportedMemory(f.ctx, f.bank, 'identity-chat', f.options),
        error => error.code === 'RMT_RECOVERY_ORIGIN_CHANGED');
    assert.equal(f.writes(), 1, 'the exact origin backup may already be durable');
    assert.deepEqual(f.ctx.chatMetadata, {}, 'the new chat stays untouched');
    assert.equal([...f.records.values()][0].chatId, 'identity-chat');
});
