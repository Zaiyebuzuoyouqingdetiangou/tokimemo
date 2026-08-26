import test from 'node:test';
import assert from 'node:assert/strict';

import {
    CACHE_KEY,
    CACHE_STORAGE_FORMAT,
    CACHE_STORAGE_VERSION,
    MAX_CACHE_SOURCE_BYTES,
    MEMORY_KEY,
    archiveBackupEntryForContext,
    archiveIndexEntryId,
    archiveSnapshotEditableUi,
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
            if (expected?.present === false && livePrevious) throw new Error('stale create');
            if (expected?.present === true && !livePrevious && options.allowMissingPrevious !== true) throw new Error('missing previous');
            if (expected?.present === true && livePrevious && livePrevious.archiveRevision !== expected.revision) throw new Error('stale update');
            if (options.seed === true && livePrevious && livePrevious.archiveRevision !== record.archiveRevision && livePrevious.updatedAt > record.updatedAt) return true;
            records.set(record.entryId, clone(record));
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
        await saveImportedMemory(context, recreated, 'recreated-chat', {
            expectedPreviousArchiveState: { present: false, revision: '' },
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
        await saveImportedMemory(context, replacement, 'legacy-entry-chat', {
            expectedPreviousArchiveState: { present: false, revision: '' },
        });
        assert.equal((await readArchiveBackup(legacyEntry)).archiveRevision, 'explicit-new-revision');
    } finally {
        runtimeState.runtimeSessionCache.clear();
        setArchiveBackupBackendForTests(null);
        globalThis.SillyTavern = originalSillyTavern;
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
    } finally {
        runtimeState.deferredChatCommits.clear();
        runtimeState.runtimeSessionCache.clear();
        setArchiveBackupBackendForTests(null);
        globalThis.SillyTavern = originalSillyTavern;
    }
});
