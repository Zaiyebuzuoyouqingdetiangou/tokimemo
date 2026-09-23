// Run with: node --experimental-vm-modules --test tools/test-archive-inheritance.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function loadInheritance(overrides) {
    const url = new URL('../src/archive/inheritance.js', import.meta.url);
    const module = new vm.SourceTextModule(await readFile(url, 'utf8'), { identifier: url.href });
    await module.link(async specifier => {
        const values = overrides[specifier];
        if (!values) throw new Error(`missing test override: ${specifier}`);
        const stub = new vm.SyntheticModule(Object.keys(values), function () {
            for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        });
        await stub.link(() => {});
        await stub.evaluate();
        return stub;
    });
    await module.evaluate();
    return module.namespace;
}

async function fixture({ sourceCharacterId = 0, sourceAvatar = 'same.png' } = {}) {
    const MEMORY_KEY = 'memory', CACHE_KEY = 'cache', PHONE_DRAFT_CACHE_KEY = 'phoneDraft';
    const sourceEntry = { entryId: 'source-entry', characterKey: sourceAvatar, avatar: sourceAvatar,
        characterFingerprint: 'card:same', characterIndexHint: sourceCharacterId, characterName: '同名也不作为依据',
        chatId: 'old-chat', archiveName: '旧档案', memoryCount: 2, updatedAt: 20 };
    const context = { characterId: 0, name2: '同名也不作为依据', characters: [{ avatar: 'same.png' }],
        chatMetadata: {}, extensionSettings: {}, chatId: 'new-chat' };
    const source = {
        entryId: sourceEntry.entryId, characterKey: sourceEntry.characterKey, avatar: sourceAvatar,
        characterFingerprint: 'card:same', characterIndexHint: sourceCharacterId, chatId: 'old-chat', archiveName: '旧档案',
        memory: { version: 3, chatId: 'old-chat', archiveRevision: 'old-rev', archiveName: '旧档案',
            characterName: '同名也不作为依据', sourceMessageCount: 42, usedMessageCount: 40, usedCharacterCount: 900,
            memories: [{ id: 'M001', title: '旧事', summary: '保留正文', sourceKind: 'chat', messageStart: 4, messageEnd: 8 }],
            coldArchive: [{ id: 'M900', title: '冷旧事', summary: '也保留', sourceKind: 'external-current-chat' }] },
        cache: { chatId: 'old-chat', archiveRevision: 'old-rev', commitToken: 9,
            inbox: { kind: 'inbox', chatId: 'old-chat', archiveRevision: 'old-rev', letters: [{ id: 'L1', body: '完整信件', readAt: 12 }] },
            album: { kind: 'album', chatId: 'old-chat', archiveRevision: 'old-rev', photos: [{ id: 'P1', cgImage: 'data:image/png;base64,AA==' }] },
            __generationRecoveryV1: { inbox: { open: true } }, __generationRecoveryClearedV1: { inbox: 'x' },
            __generationDraftsV2: { version: 1, records: { d1: { status: 'open' } } }, phoneDraft: { kind: 'phone-draft' } },
    };
    let deleted = false, saveCall = null, saveFailure = null;
    const state = { runtimeLifecycleEpoch: 7 };
    const normalize = (value, max = Infinity) => String(value ?? '').slice(0, max).trim();
    const hash = value => { let h = 0; for (const c of String(value)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(36); };
    const contextApi = {
        getContext: () => context, currentCharacterGuard: () => context, getChatId: value => value.chatId,
        comparableChatId: value => normalize(value, 260).replace(/\.jsonl$/i, ''),
        currentCharacterAvatar: value => value.characters[value.characterId].avatar,
        currentCharacterRuntimeKey: () => 'card:same\u001fcharacter:0', chatScopeKey: value => `card:same|${value.chatId}`,
        archiveStoredAvatar: entry => entry.avatar || entry.characterKey || '', archiveIndexEntryId: entry => entry.entryId,
        stableArchiveHash: hash, captureTaskOrigin: value => ({ characterId: value.characterId, characterKey: 'card:same\u001fcharacter:0',
            characterAvatar: 'same.png', chatId: value.chatId, archiveRevision: '' }),
    };
    const cacheApi = {
        GENERATION_DRAFTS_CACHE_KEY: '__generationDraftsV2', cacheOrderValue: value => Number(value?.commitToken) || 0,
        prepareBoundedRawCache: value => ({ value: structuredClone(value) }),
        serializeArchiveCommitOperation: async (_entry, _memory, operation) => operation(),
        saveImportedMemory: async (_context, memory, _chatId, options) => {
            options.assertTaskCurrent?.();
            if (saveFailure) throw saveFailure;
            saveCall = { memory: structuredClone(memory), options: { ...options,
                initialCache: structuredClone(options.initialCache), assertTaskCurrent: options.assertTaskCurrent } };
            return structuredClone(memory);
        },
    };
    const groups = {
        characterDescriptor: (_context, index) => index === 0 ? { index: 0, avatar: 'same.png', fingerprint: 'card:same' } : null,
        getArchiveIndex: () => [sourceEntry],
    };
    const repository = {
        isCompatibleArchive: memory => memory?.version === 3 && Array.isArray(memory.memories),
        migrateDerivedCacheRevision: (cache, oldMemory, nextMemory) => {
            cache.chatId = nextMemory.chatId; cache.archiveRevision = nextMemory.archiveRevision;
            for (const mode of ['inbox', 'album']) if (cache[mode]) {
                cache[mode].chatId = nextMemory.chatId; cache[mode].archiveRevision = nextMemory.archiveRevision;
            }
            delete cache.phoneDraft;
            return cache;
        },
    };
    const mod = await loadInheritance({
        './backupStore.js': { readArchiveBackupState: async () => deleted ? { deleted: true, record: null }
            : { deleted: false, record: { archiveRevision: 'old-rev', cache: { commitToken: 9 } } } },
        './groups.js': groups, './repository.js': repository, '../core/cache.js': cacheApi,
        '../core/constants.js': { MEMORY_KEY, CACHE_KEY, PHONE_DRAFT_CACHE_KEY,
            MODE: { INBOX: 'inbox', ALBUM: 'album' } }, '../core/context.js': contextApi,
        '../core/state.js': { state }, '../core/text.js': { normalizeText: normalize,
            safeUserError: (message, code) => Object.assign(new Error(message), { code }) },
        '../generation/recovery.js': { GENERATION_RECOVERY_CACHE_KEY: '__generationRecoveryV1' },
    });
    const loadSnapshot = async () => structuredClone(source);
    return { mod, context, source, sourceEntry, loadSnapshot, setDeleted: value => { deleted = value; },
        failSave: error => { saveFailure = error; }, getSave: () => saveCall, MEMORY_KEY };
}

test('same-character inheritance copies complete works and progress once while leaving the old source untouched', async () => {
    const f = await fixture();
    const original = structuredClone(f.source);
    const preview = await f.mod.previewArchiveInheritance('source-entry', { context: f.context, loadSnapshot: f.loadSnapshot });
    assert.deepEqual(preview.source, { memories: 1, coldMemories: 1, derivedModes: 2, modes: { inbox: 1, album: 1 } });
    assert.deepEqual(preview.targetBefore, { memories: 0, coldMemories: 0, derivedModes: 0, modes: {} });
    const result = await f.mod.inheritArchiveIntoCurrentChat(preview, { context: f.context, loadSnapshot: f.loadSnapshot });
    assert.equal(result.status, 'committed');
    assert.deepEqual(f.source, original);
    const saved = f.getSave();
    assert.equal(saved.memory.chatId, 'new-chat');
    assert.equal(saved.memory.sourceMessageCount, 0);
    assert.equal(saved.memory.memories[0].summary, '保留正文');
    assert.equal(saved.memory.memories[0].sourceKind, 'inherited-archive');
    assert.deepEqual(saved.memory.memories[0].inheritedArchiveSourceV1,
        { version: 1, entryId: 'source-entry', chatId: 'old-chat', archiveRevision: 'old-rev', sourceKind: 'chat', messageStart: 4, messageEnd: 8 });
    assert.equal(saved.options.initialCache.inbox.letters[0].body, '完整信件');
    assert.equal(saved.options.initialCache.inbox.letters[0].readAt, 12);
    assert.equal(saved.options.initialCache.album.photos[0].cgImage, 'data:image/png;base64,AA==');
    assert.ok(!Object.hasOwn(saved.options.initialCache, '__generationRecoveryV1'));
    assert.ok(!Object.hasOwn(saved.options.initialCache, '__generationRecoveryClearedV1'));
    assert.ok(!Object.hasOwn(saved.options.initialCache, '__generationDraftsV2'));
    assert.ok(!Object.hasOwn(saved.options.initialCache, 'phoneDraft'));
});

test('same display name cannot authorize another character card', async () => {
    const f = await fixture({ sourceCharacterId: 1, sourceAvatar: 'other.png' });
    let reads = 0;
    await assert.rejects(f.mod.previewArchiveInheritance('source-entry', { context: f.context, loadSnapshot: async () => { reads++; return f.source; } }),
        { code: 'RMT_INHERIT_OTHER_CHARACTER' });
    assert.equal(reads, 0);
    assert.equal(f.getSave(), null);
});

test('target becoming occupied during source read is refused without overwrite', async () => {
    const f = await fixture();
    await assert.rejects(f.mod.previewArchiveInheritance('source-entry', { context: f.context, loadSnapshot: async () => {
        f.context.chatMetadata[f.MEMORY_KEY] = { owner: 'newer-operation' };
        return structuredClone(f.source);
    } }), { code: 'RMT_INHERIT_TARGET_OCCUPIED' });
    assert.deepEqual(f.context.chatMetadata[f.MEMORY_KEY], { owner: 'newer-operation' });
    assert.equal(f.getSave(), null);
});

test('source deletion after preview wins and target stays empty', async () => {
    const f = await fixture();
    const preview = await f.mod.previewArchiveInheritance('source-entry', { context: f.context, loadSnapshot: f.loadSnapshot });
    f.setDeleted(true);
    await assert.rejects(f.mod.inheritArchiveIntoCurrentChat(preview, { context: f.context, loadSnapshot: f.loadSnapshot }),
        { code: 'RMT_ARCHIVE_DELETED_FENCE' });
    assert.deepEqual(f.context.chatMetadata, {});
    assert.equal(f.getSave(), null);
});

test('backup or cache commit failure leaves the target unchanged and reports the storage failure', async () => {
    const f = await fixture();
    const preview = await f.mod.previewArchiveInheritance('source-entry', { context: f.context, loadSnapshot: f.loadSnapshot });
    f.failSave(Object.assign(new Error('backup unavailable'), { code: 'RMT_BACKUP_WRITE' }));
    await assert.rejects(f.mod.inheritArchiveIntoCurrentChat(preview, { context: f.context, loadSnapshot: f.loadSnapshot }),
        { code: 'RMT_BACKUP_WRITE' });
    assert.deepEqual(f.context.chatMetadata, {});
    assert.equal(f.getSave(), null);
});
