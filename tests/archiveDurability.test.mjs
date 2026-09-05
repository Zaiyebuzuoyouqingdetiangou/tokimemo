import test from 'node:test';
import assert from 'node:assert/strict';
import { deferredCommitOriginMatchesContext } from '../src/core/context.js';

import {
    CACHE_KEY,
    CACHE_STORAGE_FORMAT,
    CACHE_STORAGE_VERSION,
    MAX_CACHE_SOURCE_BYTES,
    MEMORY_KEY,
    archiveBackupEntryForContext,
    archiveIndexEntryId,
    archiveSnapshotEditableUi,
    cacheScopeFromContext,
    captureTaskOrigin,
    chatScopeKey,
    destroyMemoryTheater,
    deleteArchiveBackup,
    fetchIndexedArchiveSnapshot,
    flushDeferredCommitsForCurrentChat,
    getArchiveIndex,
    getCache,
    getDeletedArchiveCharacters,
    hasMatchingArchiveDeletionFence,
    isCurrentCharacterDeletedFromLibrary,
    prepareBoundedRawCache,
    promoteSnapshotToLiveIfCurrent,
    queueDeferredCommit,
    readArchiveBackup,
    runtimeState,
    saveImportedMemory,
    seedArchiveBackup,
    setArchiveIndex,
    setArchiveBackupBackendForTests,
    setDeletedArchiveCharacters,
    restoreCurrentCharacterArchiveVisibility,
    upsertArchiveIndex,
    updateArchiveBackupCache,
} from './testingFacade.mjs';

function clone(value) {
    return value == null ? value : structuredClone(value);
}

function makeContext(chatId = 'archive-chat') {
    return {
        characterId: 0,
        groupId: null,
        chatId,
        name1: '用户',
        name2: '角色',
        characters: [{ name: '角色', avatar: 'role.png', data: { name: '角色', avatar: 'role.png' } }],
        chat: [],
        chatMetadata: {},
        extensionSettings: {},
        getCurrentChatId() { return this.chatId; },
        getRequestHeaders: () => ({ 'X-CSRF-Token': 'same-origin-token' }),
        saveMetadataDebounced() { this.metadataSaves = (this.metadataSaves || 0) + 1; },
        saveSettingsDebounced() {},
    };
}

function memory(chatId, revision, name = revision) {
    return {
        version: 3,
        chatId,
        characterName: '角色',
        userName: '用户',
        archiveName: name,
        archiveRevision: revision,
        createdAt: 1,
        updatedAt: Date.now(),
        memories: [{ id: 'M001', date: '', title: name, summary: name, detail: name, quote: '', tags: [] }],
    };
}

function backupEntry(context, chatId) {
    return archiveBackupEntryForContext(context, memory(chatId, 'identity-probe'));
}

function makeBackupBackend() {
    const records = new Map();
    return {
        records,
        async read(entry) { return clone(records.get(entry.entryId || archiveIndexEntryId(entry)) || null); },
        async put(record, expected, options = {}) {
            const previous = records.get(record.entryId) || null;
            const identityRecords = [...records.values()].filter(item => item?.chatId === record.chatId
                && (!item?.characterName || !record?.characterName || item.characterName === record.characterName)
                && (!item?.avatar || !record?.avatar || item.avatar === record.avatar)
                && (!item?.characterKey || !record?.characterKey || item.characterKey === record.characterKey));
            if (hasMatchingArchiveDeletionFence(identityRecords, record) && options.allowDeletedRecreate !== true) throw new Error('deleted fence');
            if (options.allowDeletedRecreate === true) {
                for (const item of identityRecords) {
                    if (item?.deleted === true && item.entryId !== record.entryId) records.delete(item.entryId);
                }
            }
            const livePrevious = previous?.deleted === true ? null : previous;
            if (livePrevious) {
                const sameName = !livePrevious.characterName || !record.characterName || livePrevious.characterName === record.characterName;
                const authorizedRename = options.allowCharacterRename === true
                    && expected?.present === true
                    && livePrevious.entryId === record.entryId
                    && livePrevious.chatId === record.chatId
                    && !!livePrevious.avatar && livePrevious.avatar === record.avatar
                    && !!livePrevious.characterKey && livePrevious.characterKey === record.characterKey
                    && livePrevious.archiveRevision === expected.revision;
                if (!sameName && !authorizedRename) throw new Error('identity changed');
            }
            if (expected?.present === false && livePrevious) throw new Error('stale create');
            if (expected?.present === true && !livePrevious && options.allowMissingPrevious !== true) throw new Error('missing previous');
            const idempotentRetry = options.allowIdempotentRetry === true && livePrevious
                && livePrevious.archiveRevision === record.archiveRevision
                && JSON.stringify(livePrevious.memory) === JSON.stringify(record.memory)
                && JSON.stringify(livePrevious.cache ?? null) === JSON.stringify(record.cache ?? null);
            if (expected?.present === true && livePrevious && livePrevious.archiveRevision !== expected.revision && !idempotentRetry) throw new Error('stale update');
            if (options.seed === true && livePrevious && livePrevious.archiveRevision !== record.archiveRevision && livePrevious.updatedAt > record.updatedAt) return true;
            if (!idempotentRetry) records.set(record.entryId, clone(record));
            return true;
        },
        async delete(entries) {
            for (const entry of Array.isArray(entries) ? entries : [entries]) {
                const entryId = entry.entryId || archiveIndexEntryId(entry);
                records.set(entryId, {
                    storageVersion: 1,
                    ...clone(entry),
                    entryId,
                    deleted: true,
                    deletedAt: Date.now(),
                    memory: null,
                    cache: null,
                    archiveRevision: '',
                });
            }
            return true;
        },
    };
}

function documentStub() {
    return { getElementById: () => null, querySelector: () => null };
}

test('r42.5 canonical archive commits persist an independent backup and reject stale revisions', async () => {
    const originalSillyTavern = globalThis.SillyTavern;
    const backend = makeBackupBackend();
    const context = makeContext('cas-chat');
    globalThis.SillyTavern = { getContext: () => context };
    setArchiveBackupBackendForTests(backend);
    try {
        const first = memory('cas-chat', 'revision-1', '第一次');
        await saveImportedMemory(context, first, 'cas-chat', {
            expectedPreviousArchiveState: { present: false, revision: '' },
        });
        assert.equal(context.chatMetadata[MEMORY_KEY].archiveRevision, 'revision-1');
        assert.equal((await readArchiveBackup(backupEntry(context, 'cas-chat'))).memory.archiveName, '第一次');

        const second = memory('cas-chat', 'revision-2', '第二次');
        await saveImportedMemory(context, second, 'cas-chat', {
            expectedPreviousArchiveState: { present: true, revision: 'revision-1' },
        });
        assert.equal(context.chatMetadata[MEMORY_KEY].archiveRevision, 'revision-2');
        assert.equal((await readArchiveBackup(backupEntry(context, 'cas-chat'))).archiveRevision, 'revision-2');

        await assert.rejects(
            saveImportedMemory(context, memory('cas-chat', 'stale-revision', '旧结果'), 'cas-chat', {
                expectedPreviousArchiveState: { present: true, revision: 'revision-1' },
            }),
            /版本已经变化|旧结果/,
        );
        assert.equal(context.chatMetadata[MEMORY_KEY].archiveName, '第二次');
        assert.equal((await readArchiveBackup(backupEntry(context, 'cas-chat'))).memory.archiveName, '第二次');
    } finally {
        setArchiveBackupBackendForTests(null);
        runtimeState.runtimeSessionCache.clear();
        globalThis.SillyTavern = originalSillyTavern;
    }
});

test('r42.6 explicit recreation clears the matching character tombstone and immediately restores the index', async () => {
    const originalSillyTavern = globalThis.SillyTavern;
    const backend = makeBackupBackend();
    const context = makeContext('recreated-chat');
    const deletedAt = Date.now() - 1000;
    setDeletedArchiveCharacters(context, [{
        groupId: 'auto:old-role',
        characterName: '角色',
        avatars: ['role.png'],
        characterKeys: ['role.png'],
        sourceIdentityKeys: [`fallback:role.png\u001f角色`],
        deletedAt,
    }]);
    globalThis.SillyTavern = { getContext: () => context };
    setArchiveBackupBackendForTests(backend);
    try {
        assert.equal(isCurrentCharacterDeletedFromLibrary(context), true);
        const recreated = { ...memory('recreated-chat', 'recreated-revision', '重新建立的档案'), createdAt: Date.now() };
        const explicitOrigin = captureTaskOrigin(context, '');
        explicitOrigin.startedAt = deletedAt + 1;
        await saveImportedMemory(context, recreated, 'recreated-chat', {
            expectedPreviousArchiveState: { present: false, revision: '' },
            expectedTaskOrigin: explicitOrigin,
            explicitCreate: true,
        });
        assert.equal(getDeletedArchiveCharacters(context).length, 0);
        assert.equal(isCurrentCharacterDeletedFromLibrary(context, recreated), false);
        assert.equal(getArchiveIndex(context).length, 1);
        assert.equal(getArchiveIndex(context)[0].archiveName, '重新建立的档案');
    } finally {
        setArchiveBackupBackendForTests(null);
        runtimeState.runtimeSessionCache.clear();
        globalThis.SillyTavern = originalSillyTavern;
    }
});

test('r42.6 opening the library repairs r42.5 fresh archives but keeps pre-deletion metadata hidden', () => {
    const context = makeContext('r42-5-repair-chat');
    const tombstone = {
        groupId: 'auto:old-role',
        characterName: '角色',
        avatars: ['role.png'],
        characterKeys: ['role.png'],
        sourceIdentityKeys: [`fallback:role.png\u001f角色`],
        deletedAt: 200,
    };
    setDeletedArchiveCharacters(context, [tombstone]);
    const oldMemory = { ...memory('r42-5-repair-chat', 'old-revision', '删除前旧档案'), createdAt: 100, updatedAt: 100 };
    assert.equal(restoreCurrentCharacterArchiveVisibility(context, oldMemory), false);
    upsertArchiveIndex(context, oldMemory);
    assert.equal(getArchiveIndex(context).length, 0, '删除前的旧 metadata 仍必须被墓碑拦截');

    const recreated = { ...memory('r42-5-repair-chat', 'r42.5-revision', 'r42.5 新档案'), createdAt: 300, updatedAt: 300 };
    assert.equal(restoreCurrentCharacterArchiveVisibility(context, recreated), true);
    upsertArchiveIndex(context, recreated);
    assert.equal(getDeletedArchiveCharacters(context).length, 0);
    assert.equal(getArchiveIndex(context).length, 1);
    assert.equal(getArchiveIndex(context)[0].archiveName, 'r42.5 新档案');
});

test('r42.5 a deleted source chat recovers from the independent backup as backup-only', async () => {
    const originalFetch = globalThis.fetch;
    const backend = makeBackupBackend();
    const context = makeContext();
    const entry = backupEntry(context, 'deleted-source');
    const bank = memory('deleted-source', 'backup-revision', '辛苦生成的档案');
    const cache = { chatId: 'deleted-source', archiveRevision: 'backup-revision', heart: { kind: 'heart', title: '已生成内容' } };
    setArchiveBackupBackendForTests(backend);
    runtimeState.archiveSnapshotCache.clear();
    globalThis.fetch = async () => ({ ok: false, status: 404 });
    try {
        await seedArchiveBackup(entry, bank, cache);
        const snapshot = await fetchIndexedArchiveSnapshot(entry, context);
        assert.equal(snapshot.backupOnly, true);
        assert.equal(snapshot.memory.archiveName, '辛苦生成的档案');
        assert.equal(snapshot.cache.heart.title, '已生成内容');
        assert.equal(Object.hasOwn(snapshot, 'messages'), false);

        runtimeState.archiveSnapshotCache.clear();
        globalThis.fetch = async () => ({ ok: true, json: async () => [{ chat_metadata: { [MEMORY_KEY]: bank } }] });
        const partialSource = await fetchIndexedArchiveSnapshot(entry, context);
        assert.equal(partialSource.backupOnly, false, 'canonical source still owns the archive when only CACHE_KEY is missing');
        assert.equal(partialSource.cache.heart.title, '已生成内容', 'same-revision backup restores missing derived content');

        runtimeState.archiveSnapshotCache.clear();
        globalThis.fetch = async () => ({ ok: false, status: 404 });
        await assert.rejects(
            fetchIndexedArchiveSnapshot(backupEntry(context, 'never-backed-up'), context),
            /没有可用的独立档案备份/,
        );
    } finally {
        runtimeState.archiveSnapshotCache.clear();
        setArchiveBackupBackendForTests(null);
        globalThis.fetch = originalFetch;
    }
});

test('r42.5 backup-only snapshots cannot gain write authority', () => {
    runtimeState.activeArchiveSnapshot = { backupOnly: true, memory: memory('lost-chat', 'lost-revision') };
    runtimeState.activeArchiveReadOnly = false;
    try {
        assert.equal(archiveSnapshotEditableUi(), false);
        assert.equal(promoteSnapshotToLiveIfCurrent(), false);
        assert.equal(runtimeState.activeArchiveReadOnly, true);
    } finally {
        runtimeState.activeArchiveSnapshot = null;
        runtimeState.activeArchiveReadOnly = true;
    }
});

test('r42.5 legacy archive entry IDs remain the durable backup key and explicit deletion removes them', async () => {
    const originalSillyTavern = globalThis.SillyTavern;
    const backend = makeBackupBackend();
    const context = makeContext('legacy-entry-chat');
    const bank = memory('legacy-entry-chat', 'legacy-revision');
    const legacyEntry = {
        entryId: 'AE:legacy-preserved-id',
        archiveGroupId: 'auto:legacy',
        characterKey: 'role.png',
        avatar: 'role.png',
        characterName: '角色',
        chatId: 'legacy-entry-chat',
        archiveName: '旧索引档案',
        memoryCount: 1,
        updatedAt: 1,
    };
    setArchiveIndex(context, [legacyEntry]);
    globalThis.SillyTavern = { getContext: () => context };
    setArchiveBackupBackendForTests(backend);
    try {
        const resolved = archiveBackupEntryForContext(context, bank);
        assert.equal(resolved.entryId, 'AE:legacy-preserved-id');
        await seedArchiveBackup(resolved, bank, null);
        assert.equal((await readArchiveBackup(legacyEntry)).archiveRevision, 'legacy-revision');
        await deleteArchiveBackup(legacyEntry);
        assert.equal(await readArchiveBackup(legacyEntry), null);
        await assert.rejects(seedArchiveBackup(resolved, bank, null), /deleted fence/);
        await assert.rejects(updateArchiveBackupCache(resolved, bank, {
            chatId: bank.chatId, archiveRevision: bank.archiveRevision, heart: { kind: 'heart' },
        }), /deleted fence/);

        const replacement = memory('legacy-entry-chat', 'explicit-new-revision', '用户明确重新建档');
        const explicitOrigin = captureTaskOrigin(context, '');
        explicitOrigin.startedAt = Math.max(Date.now(), Number(backend.records.get(legacyEntry.entryId)?.deletedAt) + 1);
        await saveImportedMemory(context, replacement, 'legacy-entry-chat', {
            expectedPreviousArchiveState: { present: false, revision: '' },
            expectedTaskOrigin: explicitOrigin,
            explicitCreate: true,
        });
        assert.equal((await readArchiveBackup(legacyEntry)).archiveRevision, 'explicit-new-revision');
    } finally {
        runtimeState.runtimeSessionCache.clear();
        setArchiveBackupBackendForTests(null);
        globalThis.SillyTavern = originalSillyTavern;
    }
});

test('r46 IndexedDB deletion tombstones the exact durable key after card metadata drift and keeps alias cleanup', async () => {
    const originalIndexedDb = globalThis.indexedDB;
    const entryId = 'AE:metadata-drift-exact';
    const aliasId = 'AE:metadata-drift-alias';
    const entry = {
        entryId,
        characterKey: 'same.png',
        avatar: 'same.png',
        characterName: '角色',
        characterFingerprint: 'fingerprint-new',
        characterIndexHint: 0,
        chatId: 'metadata-drift-chat',
    };
    const bank = memory(entry.chatId, 'metadata-drift-revision');
    const exactRecord = {
        storageVersion: 1,
        ...entry,
        characterFingerprint: 'fingerprint-old',
        archiveName: bank.archiveName,
        archiveRevision: bank.archiveRevision,
        memory: bank,
        cache: null,
        createdAt: 1,
        updatedAt: 1,
    };
    const records = new Map([
        [entryId, exactRecord],
        [aliasId, { ...exactRecord, entryId: aliasId, characterFingerprint: entry.characterFingerprint }],
    ]);
    const request = value => {
        const out = {};
        queueMicrotask(() => {
            out.result = value;
            out.onsuccess?.();
        });
        return out;
    };
    const store = {
        get(id) { return request(records.get(id)); },
        index() {
            return {
                getAll(chatId) {
                    return request([...records.values()].filter(record => record.chatId === chatId));
                },
            };
        },
        put(record) {
            records.set(record.entryId, clone(record));
        },
    };
    const db = {
        transaction() {
            let settled = false;
            const transaction = {
                objectStore() { return store; },
                abort() {
                    if (settled) return;
                    settled = true;
                    transaction.onabort?.();
                },
            };
            setTimeout(() => {
                if (settled) return;
                settled = true;
                transaction.oncomplete?.();
            }, 0);
            return transaction;
        },
    };
    globalThis.indexedDB = {
        open() {
            const out = { result: db };
            queueMicrotask(() => out.onsuccess?.());
            return out;
        },
    };

    try {
        const productionStore = await import('../src/archive/backupStore.js?idb-delete-metadata-drift');
        assert.equal(await productionStore.deleteArchiveBackup(entry), true);
        assert.equal(records.get(entryId)?.deleted, true, 'the explicit durable key must be tombstoned despite its old fingerprint');
        assert.equal(records.get(entryId)?.characterFingerprint, 'fingerprint-old');
        assert.equal(records.get(aliasId)?.deleted, true, 'matching legacy aliases must still be tombstoned');
        assert.equal([...records.values()].some(record => record.deleted !== true), false);
    } finally {
        if (originalIndexedDb === undefined) delete globalThis.indexedDB;
        else globalThis.indexedDB = originalIndexedDb;
    }
});

test('r42.5 a deletion fence defeats seed/cache writers that started before deletion', async () => {
    const backend = makeBackupBackend();
    const context = makeContext('delete-race-chat');
    const entry = backupEntry(context, 'delete-race-chat');
    const bank = memory('delete-race-chat', 'delete-race-revision');
    setArchiveBackupBackendForTests(backend);
    try {
        await seedArchiveBackup(entry, bank, null);
        const originalPut = backend.put.bind(backend);
        const entered = Promise.withResolvers();
        const release = Promise.withResolvers();
        let delayNextPut = true;
        backend.put = async (...args) => {
            if (delayNextPut) {
                delayNextPut = false;
                entered.resolve();
                await release.promise;
            }
            return originalPut(...args);
        };

        const delayedCacheWrite = updateArchiveBackupCache(entry, bank, {
            chatId: bank.chatId,
            archiveRevision: bank.archiveRevision,
            heart: { kind: 'heart', title: '迟到缓存' },
        });
        await entered.promise;
        await deleteArchiveBackup(entry);
        release.resolve();
        await assert.rejects(delayedCacheWrite, /deleted fence/);
        assert.equal(await readArchiveBackup(entry), null);

        const secondContext = makeContext('delete-race-seed-chat');
        const secondEntry = backupEntry(secondContext, 'delete-race-seed-chat');
        const secondBank = memory('delete-race-seed-chat', 'delete-race-seed-revision');
        backend.put = originalPut;
        await seedArchiveBackup(secondEntry, secondBank, null);
        const seedEntered = Promise.withResolvers();
        const seedRelease = Promise.withResolvers();
        delayNextPut = true;
        backend.put = async (...args) => {
            if (delayNextPut) {
                delayNextPut = false;
                seedEntered.resolve();
                await seedRelease.promise;
            }
            return originalPut(...args);
        };
        const delayedSeed = seedArchiveBackup(secondEntry, secondBank, null);
        await seedEntered.promise;
        await deleteArchiveBackup(secondEntry);
        seedRelease.resolve();
        await assert.rejects(delayedSeed, /deleted fence/);
        assert.equal(await readArchiveBackup(secondEntry), null);
    } finally {
        setArchiveBackupBackendForTests(null);
    }
});

test('r42.5 a legacy-ID deletion fence blocks a delayed writer using a newly computed ID', async () => {
    const backend = makeBackupBackend();
    const context = makeContext('legacy-delete-race-chat');
    const bank = memory('legacy-delete-race-chat', 'legacy-delete-race-revision');
    const legacyEntry = {
        ...backupEntry(context, 'legacy-delete-race-chat'),
        entryId: 'AE:legacy-delete-race-id',
    };
    const recalculatedEntry = backupEntry(context, 'legacy-delete-race-chat');
    assert.notEqual(recalculatedEntry.entryId, legacyEntry.entryId);
    setArchiveBackupBackendForTests(backend);
    try {
        await seedArchiveBackup(legacyEntry, bank, null);
        await deleteArchiveBackup(legacyEntry);
        await assert.rejects(seedArchiveBackup(recalculatedEntry, bank, null), /deleted fence/);
        await assert.rejects(updateArchiveBackupCache(recalculatedEntry, bank, {
            chatId: bank.chatId,
            archiveRevision: bank.archiveRevision,
            heart: { kind: 'heart', title: '迟到的新 ID 写入' },
        }), /deleted fence/);
        assert.equal(await readArchiveBackup(legacyEntry), null);
        assert.equal(await readArchiveBackup(recalculatedEntry), null);
        assert.equal([...backend.records.values()].some(item => item?.deleted !== true), false);
    } finally {
        setArchiveBackupBackendForTests(null);
    }
});

test('r42.5 raw cache cap is UTF-8 based and destroy preserves the last valid cache', () => {
    const originalDocument = globalThis.document;
    const originalSillyTavern = globalThis.SillyTavern;
    const context = makeContext('oversize-chat');
    const bank = memory('oversize-chat', 'oversize-revision');
    const prior = {
        format: CACHE_STORAGE_FORMAT,
        storageVersion: CACHE_STORAGE_VERSION,
        chatId: 'oversize-chat',
        archiveRevision: 'oversize-revision',
        sourceChars: 12,
        sourceBytes: 12,
        data: 'previous-valid-compressed-cache',
    };
    context.chatMetadata[MEMORY_KEY] = bank;
    context.chatMetadata[CACHE_KEY] = prior;
    globalThis.document = documentStub();
    globalThis.SillyTavern = { getContext: () => context };
    const hugeCache = {
        chatId: 'oversize-chat',
        archiveRevision: 'oversize-revision',
        heart: { kind: 'heart', text: '春'.repeat(Math.ceil(MAX_CACHE_SOURCE_BYTES / 3) + 128) },
    };
    runtimeState.runtimeSessionCache.set(chatScopeKey(context), hugeCache);
    try {
        assert.throws(() => prepareBoundedRawCache(hugeCache), /12 MB UTF-8/);
        destroyMemoryTheater();
        assert.equal(context.chatMetadata[CACHE_KEY], prior, 'destroy must not overwrite the last valid cache');
        assert.equal(context.metadataSaves || 0, 0);
    } finally {
        runtimeState.runtimeSessionCache.clear();
        globalThis.document = originalDocument;
        globalThis.SillyTavern = originalSillyTavern;
    }
});

test('r42.5 legacy raw metadata is detached before runtime mutation', () => {
    const context = makeContext('copy-on-write-chat');
    const raw = { chatId: 'copy-on-write-chat', archiveRevision: 'one', heart: { kind: 'heart', title: 'last valid' } };
    context.chatMetadata[CACHE_KEY] = raw;
    const cache = getCache(context);
    assert.notEqual(cache, raw);
    cache.heart.title = 'runtime candidate';
    assert.equal(raw.heart.title, 'last valid');
    runtimeState.runtimeSessionCache.clear();
});

test('r42.5 deferred archive commits cannot overwrite a newer same-chat revision', async () => {
    const originalSillyTavern = globalThis.SillyTavern;
    const backend = makeBackupBackend();
    const context = makeContext('deferred-chat');
    const oldMemory = memory('deferred-chat', 'revision-old', '旧档案');
    const newerMemory = memory('deferred-chat', 'revision-newer', '新档案');
    context.chatMetadata[MEMORY_KEY] = oldMemory;
    globalThis.SillyTavern = { getContext: () => context };
    setArchiveBackupBackendForTests(backend);
    try {
        await seedArchiveBackup(backupEntry(context, 'deferred-chat'), oldMemory, null);
        const origin = { ...captureTaskOrigin(context, 'revision-old'), archivePresent: true };
        queueDeferredCommit(origin, {
            kind: 'archive',
            memoryBank: memory('deferred-chat', 'revision-from-background', '后台旧结果'),
            preserveDerivedCache: false,
        });
        context.chatMetadata[MEMORY_KEY] = newerMemory;
        await flushDeferredCommitsForCurrentChat();
        assert.equal(context.chatMetadata[MEMORY_KEY].archiveRevision, 'revision-newer');
        assert.equal(context.chatMetadata[MEMORY_KEY].archiveName, '新档案');
        assert.equal((await readArchiveBackup(backupEntry(context, 'deferred-chat'))).archiveRevision, 'revision-old');
        assert.equal(runtimeState.deferredChatCommits.size, 0, 'a permanently stale result is explicitly discarded');
    } finally {
        runtimeState.deferredChatCommits.clear();
        runtimeState.runtimeSessionCache.clear();
        setArchiveBackupBackendForTests(null);
        globalThis.SillyTavern = originalSillyTavern;
    }
});

test('r46 durable deferred archive writes back after a unique-avatar card edit and rename without duplicating the index', async () => {
    const originalSillyTavern = globalThis.SillyTavern;
    const backend = makeBackupBackend();
    const context = makeContext('deferred-card-edit-chat');
    const oldMemory = memory('deferred-card-edit-chat', 'revision-old', '旧档案');
    context.characters[0].data.description = 'v1';
    context.chatMetadata[MEMORY_KEY] = oldMemory;
    globalThis.SillyTavern = { getContext: () => context };
    setArchiveBackupBackendForTests(backend);
    try {
        upsertArchiveIndex(context, oldMemory);
        const oldEntryId = getArchiveIndex(context)[0].entryId;
        await seedArchiveBackup(backupEntry(context, 'deferred-card-edit-chat'), oldMemory, null);
        const origin = { ...captureTaskOrigin(context, 'revision-old'), archivePresent: true };
        queueDeferredCommit(origin, {
            kind: 'archive',
            memoryBank: { ...memory('deferred-card-edit-chat', 'revision-background', '后台新档案'), sourceMessageCount: 0 },
            preserveDerivedCache: false,
        });
        context.name2 = '新角色名';
        context.characters[0].name = '新角色名';
        context.characters[0].data.name = '新角色名';
        context.characters[0].data.description = 'v2';
        await flushDeferredCommitsForCurrentChat();
        assert.equal(context.chatMetadata[MEMORY_KEY].archiveRevision, 'revision-background');
        assert.equal(context.chatMetadata[MEMORY_KEY].characterName, '新角色名');
        assert.equal(runtimeState.deferredChatCommits.size, 0);
        const index = getArchiveIndex(context);
        assert.equal(index.length, 1);
        assert.equal(index[0].entryId, oldEntryId);
        assert.equal(index[0].characterName, '新角色名');
    } finally {
        runtimeState.deferredChatCommits.clear();
        runtimeState.runtimeSessionCache.clear();
        setArchiveBackupBackendForTests(null);
        globalThis.SillyTavern = originalSillyTavern;
    }
});

test('r46 same-avatar same-chat cards never reuse or overwrite each other archive index identity', () => {
    const context = makeContext('same-chat');
    context.characters = [
        { name: 'A', avatar: 'same.png', data: { name: 'A', avatar: 'same.png', description: 'card-a' } },
        { name: 'B', avatar: 'same.png', data: { name: 'B', avatar: 'same.png', description: 'card-b' } },
    ];
    context.characterId = 0;
    context.name2 = 'A';
    const bankA = { ...memory('same-chat', 'a-revision', 'A档案'), characterName: 'A' };
    upsertArchiveIndex(context, bankA);
    const entryA = getArchiveIndex(context)[0];

    context.characterId = 1;
    context.name2 = 'B';
    const bankB = { ...memory('same-chat', 'b-revision', 'B档案'), characterName: 'B' };
    const backupB = archiveBackupEntryForContext(context, bankB);
    assert.notEqual(backupB.entryId, entryA.entryId);
    assert.equal(backupB.allowCharacterRename, false);
    upsertArchiveIndex(context, bankB);
    const index = getArchiveIndex(context);
    assert.equal(index.length, 2);
    assert.deepEqual(index.map(item => item.characterName).sort(), ['A', 'B']);
    assert.ok(index.some(item => item.entryId === entryA.entryId && item.characterName === 'A'));
});

test('r46 cloned cards with identical name avatar fingerprint and chat keep separate index and backup identities', async () => {
    const backend = makeBackupBackend();
    const context = makeContext('clone-chat');
    context.name2 = 'Clone';
    context.characters = [
        { name: 'Clone', avatar: 'same.png', data: { name: 'Clone', avatar: 'same.png', description: 'identical' } },
        { name: 'Clone', avatar: 'same.png', data: { name: 'Clone', avatar: 'same.png', description: 'identical' } },
    ];
    setArchiveBackupBackendForTests(backend);
    try {
        context.characterId = 0;
        const bankA = { ...memory('clone-chat', 'clone-a', 'A档案'), characterName: 'Clone' };
        upsertArchiveIndex(context, bankA);
        const entryA = getArchiveIndex(context)[0];
        const backupA = archiveBackupEntryForContext(context, bankA);
        await seedArchiveBackup(backupA, bankA, null);
        const rawA = clone(backend.records.get(backupA.entryId));

        context.characterId = 1;
        const bankB = { ...memory('clone-chat', 'clone-b', 'B档案'), characterName: 'Clone' };
        const backupB = archiveBackupEntryForContext(context, bankB);
        assert.notEqual(backupB.entryId, backupA.entryId);
        assert.equal(backupB.allowCharacterRename, false);

        const ordinaryRead = backend.read.bind(backend);
        backend.read = async () => clone(rawA);
        assert.equal(await readArchiveBackup(backupB), null, 'production identity validation must reject another clone record');
        backend.read = ordinaryRead;

        await seedArchiveBackup(backupB, bankB, null);
        upsertArchiveIndex(context, bankB);
        const index = getArchiveIndex(context);
        assert.equal(index.length, 2);
        assert.equal(new Set(index.map(item => item.entryId)).size, 2);
        assert.equal(new Set(index.map(item => item.archiveGroupId)).size, 2);
        assert.equal((await readArchiveBackup(backupA)).archiveRevision, 'clone-a');
        assert.equal((await readArchiveBackup(backupB)).archiveRevision, 'clone-b');
        assert.equal(entryA.characterIndexHint, 0);
        assert.equal(index.find(item => item.entryId === backupB.entryId)?.characterIndexHint, 1);
    } finally {
        setArchiveBackupBackendForTests(null);
        runtimeState.runtimeSessionCache.clear();
    }
});

test('r46 cloned cards have distinct runtime scopes and deferred origins while same-slot edits remain writable', () => {
    const characters = [
        { name: 'Clone', avatar: 'same.png', data: { name: 'Clone', avatar: 'same.png', description: 'identical' } },
        { name: 'Clone', avatar: 'same.png', data: { name: 'Clone', avatar: 'same.png', description: 'identical' } },
    ];
    const contextA = { ...makeContext('clone-runtime-chat'), characterId: 0, name2: 'Clone', characters };
    const contextB = { ...makeContext('clone-runtime-chat'), characterId: 1, name2: 'Clone', characters };
    contextA.chatMetadata[CACHE_KEY] = { chatId: 'clone-runtime-chat', archiveRevision: 'same', album: { kind: 'album', title: 'A-cache' } };
    contextB.chatMetadata[CACHE_KEY] = { chatId: 'clone-runtime-chat', archiveRevision: 'same', album: { kind: 'album', title: 'B-cache' } };
    const origin = captureTaskOrigin(contextA, 'same');
    try {
        assert.equal(deferredCommitOriginMatchesContext(origin, contextB), false);
        assert.notEqual(chatScopeKey(contextA), chatScopeKey(contextB));
        assert.equal(getCache(contextA).album.title, 'A-cache');
        assert.equal(getCache(contextB).album.title, 'B-cache');
        contextA.characters[0].data.description = 'edited in the same slot';
        assert.equal(deferredCommitOriginMatchesContext(origin, contextA), true);
    } finally {
        runtimeState.runtimeSessionCache.clear();
    }
});

test('r46 deferred archive rechecks character origin after backup await and retries idempotently on return', async () => {
    const originalSillyTavern = globalThis.SillyTavern;
    const backend = makeBackupBackend();
    const contextA = makeContext('shared-chat');
    contextA.name2 = 'A';
    contextA.characters = [{ name: 'A', avatar: 'a.png', data: { name: 'A', avatar: 'a.png' } }];
    const contextB = makeContext('shared-chat');
    contextB.name2 = 'B';
    contextB.characters = [{ name: 'B', avatar: 'b.png', data: { name: 'B', avatar: 'b.png' } }];
    const oldA = { ...memory('shared-chat', 'old-rev', 'A-old'), characterName: 'A' };
    const oldB = { ...memory('shared-chat', 'old-rev', 'B-old'), characterName: 'B' };
    contextA.chatMetadata[MEMORY_KEY] = oldA;
    contextB.chatMetadata[MEMORY_KEY] = oldB;
    let liveContext = contextA;
    globalThis.SillyTavern = { getContext: () => liveContext };
    setArchiveBackupBackendForTests(backend);
    try {
        upsertArchiveIndex(contextA, oldA);
        await seedArchiveBackup(archiveBackupEntryForContext(contextA, oldA), oldA, null);
        const origin = { ...captureTaskOrigin(contextA, 'old-rev'), archivePresent: true };
        queueDeferredCommit(origin, {
            kind: 'archive',
            memoryBank: { ...memory('shared-chat', 'new-rev', 'A-new'), characterName: 'A', sourceMessageCount: 0 },
            preserveDerivedCache: false,
        });
        const originalPut = backend.put.bind(backend);
        let switchOnce = true;
        backend.put = async (...args) => {
            const saved = await originalPut(...args);
            if (switchOnce) {
                switchOnce = false;
                liveContext = contextB;
            }
            return saved;
        };
        await flushDeferredCommitsForCurrentChat();
        assert.equal(contextA.chatMetadata[MEMORY_KEY].archiveRevision, 'old-rev');
        assert.equal(contextB.chatMetadata[MEMORY_KEY].archiveRevision, 'old-rev');
        assert.equal(contextB.chatMetadata[MEMORY_KEY].characterName, 'B');
        assert.equal(runtimeState.deferredChatCommits.size, 1);

        liveContext = contextA;
        await flushDeferredCommitsForCurrentChat();
        assert.equal(contextA.chatMetadata[MEMORY_KEY].archiveRevision, 'new-rev');
        assert.equal(contextB.chatMetadata[MEMORY_KEY].archiveRevision, 'old-rev');
        assert.equal(runtimeState.deferredChatCommits.size, 0);
    } finally {
        runtimeState.deferredChatCommits.clear();
        runtimeState.runtimeSessionCache.clear();
        setArchiveBackupBackendForTests(null);
        globalThis.SillyTavern = originalSillyTavern;
    }
});

test('r46 deferred incremental archive retry is idempotent after its migrated cache backup already committed', async () => {
    const originalSillyTavern = globalThis.SillyTavern;
    const originalDateNow = Date.now;
    const backend = makeBackupBackend();
    const contextA = makeContext('incremental-retry-chat');
    contextA.name2 = 'A';
    contextA.characters = [{ name: 'A', avatar: 'a.png', data: { name: 'A', avatar: 'a.png' } }];
    const contextB = makeContext('incremental-retry-chat');
    contextB.name2 = 'B';
    contextB.characters = [{ name: 'B', avatar: 'b.png', data: { name: 'B', avatar: 'b.png' } }];
    const oldA = { ...memory('incremental-retry-chat', 'old-rev', 'A-old'), characterName: 'A' };
    const oldB = { ...memory('incremental-retry-chat', 'old-rev', 'B-old'), characterName: 'B' };
    const newA = { ...memory('incremental-retry-chat', 'new-rev', 'A-new'), characterName: 'A', sourceMessageCount: 0 };
    contextA.chatMetadata[MEMORY_KEY] = oldA;
    contextA.chatMetadata[CACHE_KEY] = {
        chatId: 'incremental-retry-chat', archiveRevision: 'old-rev', updatedAt: 1,
        album: { kind: 'album', chatId: 'incremental-retry-chat', archiveRevision: 'old-rev', entries: [] },
    };
    contextB.chatMetadata[MEMORY_KEY] = oldB;
    let liveContext = contextA;
    let clock = 50_000;
    globalThis.SillyTavern = { getContext: () => liveContext };
    Date.now = () => clock++;
    setArchiveBackupBackendForTests(backend);
    try {
        upsertArchiveIndex(contextA, oldA);
        await seedArchiveBackup(archiveBackupEntryForContext(contextA, oldA), oldA, contextA.chatMetadata[CACHE_KEY]);
        const origin = { ...captureTaskOrigin(contextA, 'old-rev'), archivePresent: true };
        queueDeferredCommit(origin, { kind: 'archive', memoryBank: newA, preserveDerivedCache: true });
        const originalPut = backend.put.bind(backend);
        let switchOnce = true;
        backend.put = async (...args) => {
            const saved = await originalPut(...args);
            if (switchOnce) {
                switchOnce = false;
                liveContext = contextB;
            }
            return saved;
        };

        await flushDeferredCommitsForCurrentChat();
        assert.equal(contextA.chatMetadata[MEMORY_KEY].archiveRevision, 'old-rev');
        assert.equal(contextB.chatMetadata[MEMORY_KEY].archiveRevision, 'old-rev');
        assert.equal(runtimeState.deferredChatCommits.size, 1);

        liveContext = contextA;
        await flushDeferredCommitsForCurrentChat();
        assert.equal(contextA.chatMetadata[MEMORY_KEY].archiveRevision, 'new-rev');
        assert.equal(contextB.chatMetadata[MEMORY_KEY].archiveRevision, 'old-rev');
        assert.equal(runtimeState.deferredChatCommits.size, 0);
        assert.equal((await readArchiveBackup(archiveBackupEntryForContext(contextA, newA))).archiveRevision, 'new-rev');
    } finally {
        Date.now = originalDateNow;
        for (const timer of runtimeState.cachePersistTimers.values()) clearTimeout(timer);
        runtimeState.cachePersistTimers.clear();
        runtimeState.deferredChatCommits.clear();
        runtimeState.runtimeSessionCache.clear();
        setArchiveBackupBackendForTests(null);
        globalThis.SillyTavern = originalSillyTavern;
    }
});

test('r46 deferred sessions recheck character origin after hydration before saving', async () => {
    const originalSillyTavern = globalThis.SillyTavern;
    const backend = makeBackupBackend();
    const contextA = makeContext('session-shared-chat');
    contextA.name2 = 'A';
    contextA.characters = [{ name: 'A', avatar: 'a.png', data: { name: 'A', avatar: 'a.png' } }];
    const contextB = makeContext('session-shared-chat');
    contextB.name2 = 'B';
    contextB.characters = [{ name: 'B', avatar: 'b.png', data: { name: 'B', avatar: 'b.png' } }];
    const bankA = { ...memory('session-shared-chat', 'same-rev', 'A'), characterName: 'A' };
    const bankB = { ...memory('session-shared-chat', 'same-rev', 'B'), characterName: 'B' };
    contextA.chatMetadata[MEMORY_KEY] = bankA;
    contextB.chatMetadata[MEMORY_KEY] = bankB;
    let liveContext = contextA;
    globalThis.SillyTavern = { getContext: () => liveContext };
    setArchiveBackupBackendForTests(backend);
    const scopeA = cacheScopeFromContext(contextA);
    const gate = Promise.withResolvers();
    runtimeState.cacheHydrationPromises.set(scopeA, gate.promise);
    try {
        const origin = captureTaskOrigin(contextA, 'same-rev');
        queueDeferredCommit(origin, { kind: 'sessions', sessions: { album: { kind: 'album', chatId: 'session-shared-chat', archiveRevision: 'same-rev', title: 'A-only' } } });
        const flushing = flushDeferredCommitsForCurrentChat();
        liveContext = contextB;
        gate.resolve({});
        await flushing;
        assert.equal(runtimeState.deferredChatCommits.size, 1);
        assert.equal(runtimeState.runtimeSessionCache.has(cacheScopeFromContext(contextB)), false);

        runtimeState.cacheHydrationPromises.delete(scopeA);
        liveContext = contextA;
        await flushDeferredCommitsForCurrentChat();
        assert.equal(runtimeState.deferredChatCommits.size, 0);
        assert.equal(runtimeState.runtimeSessionCache.get(scopeA)?.album?.title, 'A-only');
    } finally {
        for (const timer of runtimeState.cachePersistTimers.values()) clearTimeout(timer);
        runtimeState.cachePersistTimers.clear();
        runtimeState.cacheHydrationPromises.clear();
        runtimeState.deferredChatCommits.clear();
        runtimeState.runtimeSessionCache.clear();
        setArchiveBackupBackendForTests(null);
        globalThis.SillyTavern = originalSillyTavern;
    }
});

test('r46 a same-millisecond sessions result queued during hydration survives the older flush acknowledgement', async () => {
    const originalSillyTavern = globalThis.SillyTavern;
    const backend = makeBackupBackend();
    const originalDateNow = Date.now;
    const context = makeContext('same-ms-chat');
    context.chatMetadata[MEMORY_KEY] = memory('same-ms-chat', 'same-rev', 'A');
    globalThis.SillyTavern = { getContext: () => context };
    setArchiveBackupBackendForTests(backend);
    Date.now = () => 123_456;
    const scope = cacheScopeFromContext(context);
    const gate = Promise.withResolvers();
    runtimeState.cacheHydrationPromises.set(scope, gate.promise);
    try {
        const origin = captureTaskOrigin(context, 'same-rev');
        queueDeferredCommit(origin, { kind: 'sessions', sessions: {
            album: { kind: 'album', chatId: 'same-ms-chat', archiveRevision: 'same-rev', title: 'older' },
        } });
        const flushing = flushDeferredCommitsForCurrentChat();
        queueDeferredCommit(origin, { kind: 'sessions', sessions: {
            ending: { kind: 'ending', chatId: 'same-ms-chat', archiveRevision: 'same-rev', title: 'newer' },
        } });
        gate.resolve({});
        await flushing;
        assert.equal(runtimeState.runtimeSessionCache.get(scope)?.album?.title, 'older');
        assert.equal(runtimeState.runtimeSessionCache.get(scope)?.ending, undefined);
        assert.equal(runtimeState.deferredChatCommits.size, 1, 'the newer merged result must stay queued');

        await flushDeferredCommitsForCurrentChat();
        assert.equal(runtimeState.runtimeSessionCache.get(scope)?.ending?.title, 'newer');
        assert.equal(runtimeState.deferredChatCommits.size, 0);
    } finally {
        Date.now = originalDateNow;
        for (const timer of runtimeState.cachePersistTimers.values()) clearTimeout(timer);
        runtimeState.cachePersistTimers.clear();
        runtimeState.cacheHydrationPromises.clear();
        runtimeState.deferredChatCommits.clear();
        runtimeState.runtimeSessionCache.clear();
        setArchiveBackupBackendForTests(null);
        globalThis.SillyTavern = originalSillyTavern;
    }
});

test('r46 transient deferred archive write failure keeps the durable result for retry', async () => {
    const originalSillyTavern = globalThis.SillyTavern;
    const backend = makeBackupBackend();
    const context = makeContext('deferred-retry-chat');
    const oldMemory = memory('deferred-retry-chat', 'revision-old', '旧档案');
    context.chatMetadata[MEMORY_KEY] = oldMemory;
    globalThis.SillyTavern = { getContext: () => context };
    setArchiveBackupBackendForTests(backend);
    try {
        await seedArchiveBackup(backupEntry(context, 'deferred-retry-chat'), oldMemory, null);
        const origin = { ...captureTaskOrigin(context, 'revision-old'), archivePresent: true };
        queueDeferredCommit(origin, {
            kind: 'archive',
            memoryBank: { ...memory('deferred-retry-chat', 'revision-from-background', '后台结果'), sourceMessageCount: 0 },
            preserveDerivedCache: false,
        });
        backend.put = async () => { throw new Error('temporary storage failure'); };
        await flushDeferredCommitsForCurrentChat();
        assert.equal(context.chatMetadata[MEMORY_KEY].archiveRevision, 'revision-old');
        assert.equal(runtimeState.deferredChatCommits.size, 1, 'temporary failure must remain queued');
    } finally {
        runtimeState.deferredChatCommits.clear();
        runtimeState.runtimeSessionCache.clear();
        setArchiveBackupBackendForTests(null);
        globalThis.SillyTavern = originalSillyTavern;
    }
});
