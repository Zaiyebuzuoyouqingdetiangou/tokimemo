import test from 'node:test';
import assert from 'node:assert/strict';

import {
    cacheOrderValue,
    claimDetachedModeGeneration,
    commitDetachedArchiveSession,
    gunzipJson,
    isCompressedCacheRecord,
} from '../src/core/cache.js';
import {
    CACHE_KEY,
    MEMORY_KEY,
    MODE,
    MODE_WRITE_FENCES_CACHE_KEY,
} from '../src/core/constants.js';
import {
    hasGenerationTasks,
    isArchiveTargetModeGenerating,
    registerArchiveTargetReservation,
} from '../src/core/requestCoordinator.js';
import { state as runtimeState } from '../src/core/state.js';
import { runtimeLifecycleStillCurrent } from '../src/core/context.js';
import { buildWorldPresentationContext, generateMode } from '../src/generation/client.js';
import { destroyMemoryTheater } from '../src/heartbeatMemories.js';
import {
    deleteArchiveBackup,
    readArchiveBackup,
    replaceArchiveBackup,
    seedArchiveBackup,
    setArchiveBackupBackendForTests,
} from '../src/archive/backupStore.js';
import { getArchiveIndex, upsertArchiveIndex } from '../src/archive/groups.js';
import {
    beginArchiveTargetSubtask,
    fetchIndexedArchiveSnapshot,
    freezeArchiveTarget,
} from '../src/archive/library.js';

function clone(value) {
    return value == null ? value : structuredClone(value);
}

function memory(chatId = 'a-chat', revision = 'a-rev') {
    return {
        version: 3,
        chatId,
        characterName: '角色A',
        userName: '用户A',
        archiveName: 'A档案',
        archiveRevision: revision,
        createdAt: 1,
        updatedAt: 2,
        memories: [{ id: 'M001', title: 'A记忆', summary: 'A_ARCHIVE_SENTINEL', detail: '', quote: '', tags: [] }],
    };
}

function hostContext() {
    return {
        characterId: 0,
        groupId: null,
        chatId: 'a-chat',
        name1: '用户A',
        name2: '角色A',
        characters: [
            { name: '角色A', avatar: 'a.png', data: { name: '角色A', avatar: 'a.png', description: 'A_CARD_SENTINEL' } },
            { name: '角色B', avatar: 'b.png', data: { name: '角色B', avatar: 'b.png', description: 'B_CARD_SENTINEL' } },
        ],
        chat: [{ mes: 'A chat' }],
        chatMetadata: {},
        extensionSettings: {},
        powerUserSettings: { persona_description: 'A_PERSONA_SENTINEL' },
        getCurrentChatId() { return this.chatId; },
        getCharacterCardFields() { return clone(this.characters[this.characterId].data); },
        getWorldInfoPrompt: async () => ({ worldInfoString: 'LIVE_WORLD_SENTINEL' }),
        getRequestHeaders: () => ({}),
        saveSettingsDebounced() {},
        saveMetadataDebounced() {},
    };
}

function makeBackupBackend() {
    const records = new Map();
    return {
        records,
        async read(entry) {
            return clone(records.get(entry.entryId) || null);
        },
        async put(record, expected, options = {}) {
            const previous = records.get(record.entryId) || null;
            const livePrevious = previous?.deleted === true ? null : previous;
            if (expected?.present === false && livePrevious) throw new Error('stale create');
            if (expected?.present === true && !livePrevious && options.allowMissingPrevious !== true) throw new Error('missing previous');
            if (expected?.present === true && livePrevious?.archiveRevision !== expected.revision) throw new Error('stale revision');
            if (options.expectedCacheOrder !== undefined && options.expectedCacheOrder !== null
                && cacheOrderValue(livePrevious?.cache) !== Number(options.expectedCacheOrder)) {
                const error = new Error('cache CAS conflict');
                error.code = 'RMT_CACHE_CAS_CONFLICT';
                throw error;
            }
            records.set(record.entryId, clone(record));
            return true;
        },
        async delete(entries) {
            for (const entry of Array.isArray(entries) ? entries : [entries]) {
                records.set(entry.entryId, {
                    storageVersion: 1,
                    ...clone(entry),
                    deleted: true,
                    deletedAt: Date.now(),
                    archiveRevision: '',
                    memory: null,
                    cache: null,
                });
            }
            return true;
        },
    };
}

function targetFor(entry, bank, cache = {}) {
    return {
        ...clone(entry),
        entryId: entry.entryId,
        chatId: bank.chatId,
        characterName: bank.characterName,
        archiveName: bank.archiveName,
        archiveRevision: bank.archiveRevision,
        memory: clone(bank),
        cache: { chatId: bank.chatId, archiveRevision: bank.archiveRevision, ...clone(cache) },
    };
}

function originFor(target, cache) {
    return {
        chatId: target.chatId,
        archiveRevision: target.archiveRevision,
        archiveTargetEntryId: target.entryId,
        modeWriteFences: clone(cache?.[MODE_WRITE_FENCES_CACHE_KEY] || {}),
    };
}

async function hydratedBackupCache(entry) {
    const record = await readArchiveBackup(entry);
    if (!record?.cache) return {};
    return isCompressedCacheRecord(record.cache) ? gunzipJson(record.cache.data) : clone(record.cache);
}

test.afterEach(() => {
    setArchiveBackupBackendForTests(null);
    runtimeState.activeArchiveTargetReservations.clear();
    runtimeState.activeGenerationTasks.clear();
    runtimeState.activeModeBuildScopes.clear();
    runtimeState.archiveCommitChains.clear();
    runtimeState.cacheCommitSequences.clear();
    runtimeState.archiveTargetTaskEpochs.clear();
    delete globalThis.SillyTavern;
});

test('r49 ArchiveTarget freezes A and excludes the live B chat, persona, card and world-info', async () => {
    const host = hostContext();
    const bank = memory();
    host.chatMetadata[MEMORY_KEY] = clone(bank);
    upsertArchiveIndex(host, bank);
    const entry = getArchiveIndex(host)[0];
    const snapshot = { ...clone(entry), memory: clone(bank), cache: {}, backupOnly: false };

    host.characterId = 1;
    host.chatId = 'b-chat';
    host.name1 = '用户B';
    host.name2 = '角色B';
    host.chat = [{ mes: 'B_CHAT_SENTINEL' }];
    host.chatMetadata = { [MEMORY_KEY]: { ...memory('b-chat', 'b-rev'), characterName: '角色B', userName: '用户B' } };
    host.powerUserSettings.persona_description = 'B_PERSONA_SENTINEL';
    host.getWorldInfoPrompt = async () => ({ worldInfoString: 'B_WORLD_SENTINEL' });

    const frozen = freezeArchiveTarget(snapshot, host);
    const built = await buildWorldPresentationContext(frozen.context, frozen.target.memory, MODE.ROOM);
    assert.equal(frozen.context.name1, '用户A');
    assert.equal(frozen.context.name2, '角色A');
    assert.deepEqual(frozen.context.chat, []);
    assert.equal(frozen.context.powerUserSettings.persona_description, '');
    assert.equal(frozen.context.getWorldInfoPrompt, undefined);
    assert.equal(Object.hasOwn(frozen.context, '__rmtWorldPresentationProfileBinding'), true);
    assert.match(built.contextEnvelope, /A_CARD_SENTINEL/);
    assert.doesNotMatch(built.contextEnvelope, /B_CARD_SENTINEL|B_CHAT_SENTINEL|B_PERSONA_SENTINEL|B_WORLD_SENTINEL/);
});

test('r49 generateMode rejects an invalid ArchiveTarget before claim, task registration or provider admission', async () => {
    const bank = memory();
    const entry = {
        entryId: 'AE:r49-invalid-preflight', archiveGroupId: 'auto:a', characterKey: 'a.png', avatar: 'a.png',
        characterName: bank.characterName, characterFingerprint: 'card:a', characterIndexHint: 0,
        chatId: bank.chatId, archiveName: bank.archiveName,
    };
    const target = targetFor(entry, bank);
    const context = hostContext();
    context.chatMetadata = { [MEMORY_KEY]: clone(bank), [CACHE_KEY]: {} };
    let claimCalls = 0;
    let commitCalls = 0;
    const taskKey = `archive:${target.entryId}:${MODE.CALENDAR}`;
    await assert.rejects(
        generateMode(MODE.CALENDAR, {
            background: true,
            archiveTarget: target,
            context,
            async revalidateArchiveTarget() {
                const error = new Error('目标档案已经被删除或移除，本次旧结果没有写入。');
                error.code = 'RMT_ARCHIVE_TARGET_INVALID';
                throw error;
            },
            async claimArchiveTarget() { claimCalls += 1; return { cache: {} }; },
            async commitArchiveTarget() { commitCalls += 1; },
        }),
        error => error?.code === 'RMT_ARCHIVE_TARGET_INVALID',
    );
    assert.equal(claimCalls, 0);
    assert.equal(commitCalls, 0);
    assert.equal(runtimeState.activeModeBuildScopes.size, 0);
    assert.equal(runtimeState.activeArchiveTargetReservations.size, 0);
    assert.equal(runtimeState.activeGenerationTasks.size, 0);
    assert.equal(runtimeState.archiveTargetTaskEpochs.has(`${target.entryId}:${MODE.CALENDAR}`), false);
    assert.equal(runtimeState.activeModeBuildScopes.has(taskKey), false);
});

test('r49 detached A commits stay on A after switching to B and enforce revision, delete and latest-task fences', async () => {
    const backend = makeBackupBackend();
    setArchiveBackupBackendForTests(backend);
    const bank = memory();
    const entry = {
        entryId: 'AE:r49-a', archiveGroupId: 'auto:a', characterKey: 'a.png', avatar: 'a.png',
        characterName: '角色A', characterFingerprint: 'card:a', characterIndexHint: 0,
        chatId: bank.chatId, archiveName: bank.archiveName,
    };
    await seedArchiveBackup(entry, bank, { chatId: bank.chatId, archiveRevision: bank.archiveRevision });

    const bContext = hostContext();
    bContext.characterId = 1;
    bContext.chatId = 'b-chat';
    bContext.name2 = '角色B';
    bContext.chatMetadata = { sentinel: { unchanged: true } };
    const bBefore = clone(bContext.chatMetadata);
    globalThis.SillyTavern = { getContext: () => bContext };

    const first = targetFor(entry, bank);
    const firstClaim = await claimDetachedModeGeneration(first, MODE.ALBUM);
    const firstOrigin = originFor(first, firstClaim.cache);
    const second = targetFor(entry, bank, firstClaim.cache);
    const secondClaim = await claimDetachedModeGeneration(second, MODE.ALBUM);
    const secondOrigin = originFor(second, secondClaim.cache);
    await assert.rejects(
        commitDetachedArchiveSession(first, MODE.ALBUM, { kind: MODE.ALBUM, title: 'STALE' }, null, firstOrigin),
        error => error?.code === 'RMT_MODE_WRITE_FENCE',
    );
    await commitDetachedArchiveSession(second, MODE.ALBUM, { kind: MODE.ALBUM, title: 'A_ONLY_NEW' }, null, secondOrigin);
    let cache = await hydratedBackupCache(entry);
    assert.equal(cache[MODE.ALBUM].title, 'A_ONLY_NEW');
    assert.deepEqual(bContext.chatMetadata, bBefore);

    const albumLane = targetFor(entry, bank, cache);
    const travelLane = targetFor(entry, bank, cache);
    const albumClaim = await claimDetachedModeGeneration(albumLane, MODE.ALBUM);
    const travelClaim = await claimDetachedModeGeneration(travelLane, MODE.TRAVEL);
    await commitDetachedArchiveSession(travelLane, MODE.TRAVEL, { kind: MODE.TRAVEL, title: 'A_TRAVEL' }, null, originFor(travelLane, travelClaim.cache));
    await commitDetachedArchiveSession(albumLane, MODE.ALBUM, { kind: MODE.ALBUM, title: 'A_ALBUM' }, null, originFor(albumLane, albumClaim.cache));
    cache = await hydratedBackupCache(entry);
    assert.equal(cache[MODE.ALBUM].title, 'A_ALBUM');
    assert.equal(cache[MODE.TRAVEL].title, 'A_TRAVEL');

    const staleRevisionTarget = targetFor(entry, bank, cache);
    const staleRevisionClaim = await claimDetachedModeGeneration(staleRevisionTarget, MODE.ROOM);
    const newerBank = memory(bank.chatId, 'a-rev-2');
    await replaceArchiveBackup(entry, newerBank, { chatId: newerBank.chatId, archiveRevision: newerBank.archiveRevision }, { present: true, revision: bank.archiveRevision });
    await assert.rejects(
        commitDetachedArchiveSession(staleRevisionTarget, MODE.ROOM, { kind: MODE.ROOM }, null, originFor(staleRevisionTarget, staleRevisionClaim.cache)),
        /stale revision|版本|旧结果/,
    );

    await deleteArchiveBackup(entry);
    const deletedTarget = targetFor(entry, newerBank);
    await assert.rejects(
        claimDetachedModeGeneration(deletedTarget, MODE.ROOM),
        error => error?.code === 'RMT_ARCHIVE_DELETED_FENCE',
    );
    assert.deepEqual(bContext.chatMetadata, bBefore);
});

test('r49 deleting A then recreating C and starting the same mode cannot accept the old A result', async () => {
    const backend = makeBackupBackend();
    setArchiveBackupBackendForTests(backend);
    const bankA = memory('a-chat', 'a-rev-before-delete');
    const entry = {
        entryId: 'AE:r49-delete-recreate', archiveGroupId: 'auto:a', characterKey: 'a.png', avatar: 'a.png',
        characterName: bankA.characterName, characterFingerprint: 'card:a', characterIndexHint: 0,
        chatId: bankA.chatId, archiveName: bankA.archiveName,
    };
    await seedArchiveBackup(entry, bankA, { chatId: bankA.chatId, archiveRevision: bankA.archiveRevision });

    const oldTarget = targetFor(entry, bankA);
    const oldClaim = await claimDetachedModeGeneration(oldTarget, MODE.ALBUM);
    const oldOrigin = originFor(oldTarget, oldClaim.cache);
    await deleteArchiveBackup(entry);

    const bankC = {
        ...memory('a-chat', 'c-rev-after-recreate'),
        archiveName: 'C档案',
        memories: [{ id: 'M001', title: 'C记忆', summary: 'C_RECREATED_SENTINEL', detail: '', quote: '', tags: [] }],
    };
    const recreatedEntry = { ...entry, archiveName: bankC.archiveName };
    await seedArchiveBackup(recreatedEntry, bankC, { chatId: bankC.chatId, archiveRevision: bankC.archiveRevision });
    const newTarget = targetFor(recreatedEntry, bankC);
    const newClaim = await claimDetachedModeGeneration(newTarget, MODE.ALBUM);
    const newOrigin = originFor(newTarget, newClaim.cache);

    await assert.rejects(
        commitDetachedArchiveSession(oldTarget, MODE.ALBUM, { kind: MODE.ALBUM, title: 'OLD_A_MUST_NOT_LAND' }, null, oldOrigin),
        /stale revision|版本|旧结果|删除/,
    );
    await commitDetachedArchiveSession(newTarget, MODE.ALBUM, { kind: MODE.ALBUM, title: 'NEW_C_ONLY' }, null, newOrigin);
    const cache = await hydratedBackupCache(recreatedEntry);
    assert.equal(cache[MODE.ALBUM].title, 'NEW_C_ONLY');
    assert.notEqual(cache[MODE.ALBUM].title, 'OLD_A_MUST_NOT_LAND');
    const record = await readArchiveBackup(recreatedEntry);
    assert.equal(record.archiveRevision, bankC.archiveRevision);
    assert.equal(record.memory.archiveName, 'C档案');
});

test('r49 destroy clears ArchiveTarget reservations and their ghost generation state', () => {
    const previousDocument = globalThis.document;
    globalThis.document = { getElementById: () => null, querySelector: () => null };
    const target = { entryId: 'AE:r49-destroy', chatId: 'a-chat', archiveRevision: 'a-rev' };
    registerArchiveTargetReservation('reservation:r49', { archiveTarget: { ...target, characterName: '角色A', archiveName: 'A档案' } }, MODE.ALBUM);
    assert.equal(hasGenerationTasks(), true);
    assert.equal(isArchiveTargetModeGenerating(MODE.ALBUM, target), true);
    try {
        destroyMemoryTheater();
        assert.equal(runtimeState.activeArchiveTargetReservations.size, 0);
        assert.equal(hasGenerationTasks(), false);
        assert.equal(isArchiveTargetModeGenerating(MODE.ALBUM, target), false);
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});

test('r49 an archive snapshot awaiting its second durable read cannot refill state after destroy', async () => {
    const previousDocument = globalThis.document;
    const previousFetch = globalThis.fetch;
    const host = hostContext();
    const bank = memory();
    host.chatMetadata = { [MEMORY_KEY]: clone(bank), [CACHE_KEY]: { chatId: bank.chatId, archiveRevision: bank.archiveRevision } };
    const entry = {
        entryId: 'AE:r49-lifecycle-read', archiveGroupId: 'auto:a', characterKey: 'a.png', avatar: 'a.png',
        characterName: bank.characterName, characterFingerprint: 'card:a', characterIndexHint: 0,
        chatId: bank.chatId, archiveName: bank.archiveName,
    };
    const record = {
        storageVersion: 1,
        ...clone(entry),
        memory: clone(bank),
        cache: { chatId: bank.chatId, archiveRevision: bank.archiveRevision },
        archiveRevision: bank.archiveRevision,
        createdAt: 1,
        updatedAt: 2,
    };
    let readCount = 0;
    let releaseSecondRead;
    let enteredSecondRead;
    const secondReadEntered = new Promise(resolve => { enteredSecondRead = resolve; });
    const secondReadGate = new Promise(resolve => { releaseSecondRead = resolve; });
    setArchiveBackupBackendForTests({
        async read() {
            readCount += 1;
            if (readCount === 2) {
                enteredSecondRead();
                await secondReadGate;
            }
            return clone(record);
        },
        async put() { return true; },
        async delete() { return true; },
    });
    globalThis.document = { getElementById: () => null, querySelector: () => null };
    globalThis.SillyTavern = { getContext: () => host };
    globalThis.fetch = async () => ({
        ok: true,
        async json() {
            return [{ chat_metadata: { [MEMORY_KEY]: clone(bank), [CACHE_KEY]: clone(record.cache) } }];
        },
    });
    runtimeState.archiveSnapshotCache.clear();
    try {
        const pending = fetchIndexedArchiveSnapshot(entry, host, { force: true });
        await secondReadEntered;
        destroyMemoryTheater();
        releaseSecondRead();
        await assert.rejects(pending, error => error?.name === 'AbortError');
        assert.equal(runtimeState.archiveSnapshotCache.size, 0);
    } finally {
        releaseSecondRead?.();
        globalThis.fetch = previousFetch;
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});

test('r49 a detached mode claim cannot continue after destroy resolves its durable write', async () => {
    const previousDocument = globalThis.document;
    const host = hostContext();
    const bank = memory();
    const entry = {
        entryId: 'AE:r49-lifecycle-claim', archiveGroupId: 'auto:a', characterKey: 'a.png', avatar: 'a.png',
        characterName: bank.characterName, characterFingerprint: 'card:a', characterIndexHint: 0,
        chatId: bank.chatId, archiveName: bank.archiveName,
    };
    const backend = makeBackupBackend();
    setArchiveBackupBackendForTests(backend);
    await seedArchiveBackup(entry, bank, { chatId: bank.chatId, archiveRevision: bank.archiveRevision });
    const originalPut = backend.put.bind(backend);
    let releasePut;
    let enteredPut;
    let sawStillCurrent = false;
    const putEntered = new Promise(resolve => { enteredPut = resolve; });
    const putGate = new Promise(resolve => { releasePut = resolve; });
    backend.put = async (record, expected, options = {}) => {
        sawStillCurrent = typeof options.stillCurrent === 'function';
        enteredPut();
        await putGate;
        return originalPut(record, expected, options);
    };
    globalThis.document = { getElementById: () => null, querySelector: () => null };
    globalThis.SillyTavern = { getContext: () => host };
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    try {
        const target = targetFor(entry, bank);
        const pending = claimDetachedModeGeneration(
            target,
            MODE.ALBUM,
            () => runtimeLifecycleStillCurrent(lifecycleEpoch),
        );
        await putEntered;
        destroyMemoryTheater();
        releasePut();
        await assert.rejects(pending, /\u64a4\u9500|\u65e7\u7ed3\u679c|\u66f4\u65b0/);
        assert.equal(sawStillCurrent, true);
        assert.equal(target.cache?.[MODE_WRITE_FENCES_CACHE_KEY], undefined);
    } finally {
        releasePut?.();
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});

test('r49 an ArchiveTarget subtask cannot adopt a new lifecycle after delayed revalidation', async () => {
    const previousDocument = globalThis.document;
    const host = hostContext();
    const bank = memory();
    const archiveTarget = targetFor({
        entryId: 'AE:r49-lifecycle-subtask', archiveGroupId: 'auto:a', characterKey: 'a.png', avatar: 'a.png',
        characterName: bank.characterName, characterFingerprint: 'card:a', characterIndexHint: 0,
        chatId: bank.chatId, archiveName: bank.archiveName,
    }, bank);
    let releaseRevalidation;
    let enteredRevalidation;
    let claimCalls = 0;
    const revalidationEntered = new Promise(resolve => { enteredRevalidation = resolve; });
    const revalidationGate = new Promise(resolve => { releaseRevalidation = resolve; });
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    const targetRuntime = {
        archiveTarget,
        context: { ...host, chatMetadata: { [MEMORY_KEY]: clone(bank), [CACHE_KEY]: {} } },
        memoryBank: clone(bank),
        expectedChatId: bank.chatId,
        expectedArchiveRevision: bank.archiveRevision,
        mode: MODE.HEART,
        origin: { lifecycleEpoch },
        epochKey: `${archiveTarget.entryId}:${MODE.HEART}:season:spring`,
        epoch: 0,
        begun: false,
        lifecycleEpoch,
        options: {
            async revalidateArchiveTarget() {
                enteredRevalidation();
                await revalidationGate;
                return clone(archiveTarget);
            },
            async claimArchiveTarget() {
                claimCalls += 1;
                return { cache: {} };
            },
        },
    };
    globalThis.document = { getElementById: () => null, querySelector: () => null };
    globalThis.SillyTavern = { getContext: () => host };
    try {
        const pending = beginArchiveTargetSubtask(targetRuntime);
        await revalidationEntered;
        destroyMemoryTheater();
        releaseRevalidation();
        await assert.rejects(pending, error => error?.name === 'AbortError');
        assert.equal(claimCalls, 0);
        assert.equal(runtimeState.archiveTargetTaskEpochs.has(targetRuntime.epochKey), false);
    } finally {
        releaseRevalidation?.();
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});
