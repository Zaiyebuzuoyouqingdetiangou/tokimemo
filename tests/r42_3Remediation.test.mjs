import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    CACHE_KEY,
    CACHE_STORAGE_FORMAT,
    MAX_CACHE_SOURCE_BYTES,
    MEMORY_KEY,
    captureTaskOrigin,
    compressedCacheManifest,
    destroyMemoryTheater,
    ensureCacheHydrated,
    fetchEverMindCurrentChatRecords,
    fetchIndexedArchiveSnapshot,
    gzipJson,
    gunzipJson,
    isAllowedEverMindApiBaseUrl,
    persistCompressedCacheNow,
    queueDeferredCommit,
    runtimeState,
} from './testingFacade.mjs';

const root = new URL('../', import.meta.url);

function makeContext(chatId = 'current-chat') {
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
        saveMetadataDebounced() {},
    };
}

function documentStub() {
    return {
        getElementById: () => null,
        querySelector: () => null,
    };
}

test('r42.3 EverMind blocks remote plaintext before fetch while preserving HTTPS and strict loopback HTTP', async () => {
    assert.equal(isAllowedEverMindApiBaseUrl('https://memory.example.test:8443'), true);
    assert.equal(isAllowedEverMindApiBaseUrl('http://localhost:5100'), true);
    assert.equal(isAllowedEverMindApiBaseUrl('http://127.1:5100'), true);
    assert.equal(isAllowedEverMindApiBaseUrl('http://127.255.0.9:5100'), true);
    assert.equal(isAllowedEverMindApiBaseUrl('http://[::1]:5100'), true);
    assert.equal(isAllowedEverMindApiBaseUrl('http://198.51.100.20:8080'), false);
    assert.equal(isAllowedEverMindApiBaseUrl('http://localhost.evil.test'), false);
    assert.equal(isAllowedEverMindApiBaseUrl('http://127.0.0.1.evil.test'), false);
    assert.equal(isAllowedEverMindApiBaseUrl('http://0.0.0.0:5100'), false);
    assert.equal(isAllowedEverMindApiBaseUrl('http://[::]:5100'), false);

    const originalFetch = globalThis.fetch;
    const originalSillyTavern = globalThis.SillyTavern;
    const captured = [];
    const context = makeContext('evermind-chat');
    context.extensionSettings.st_evermind = {
        enabled: true,
        api_base_url: 'http://198.51.100.20:8080',
        user_id: 'user',
        api_key: 'secret-key',
    };
    context.chatMetadata.st_evermind = { group_id: 'current-group' };
    globalThis.SillyTavern = { getContext: () => context };
    globalThis.fetch = async (url, options) => {
        captured.push({ url: String(url), options });
        return { ok: true, json: async () => ({ memories: [] }) };
    };
    try {
        assert.deepEqual(await fetchEverMindCurrentChatRecords(context, 'evermind-chat'), []);
        assert.equal(captured.length, 0, 'remote plaintext must be rejected before fetch/header use');

        for (const allowed of ['https://memory.example.test:8443', 'http://127.0.0.1:5100', 'http://[::1]:5100']) {
            context.extensionSettings.st_evermind.api_base_url = allowed;
            await fetchEverMindCurrentChatRecords(context, 'evermind-chat');
        }
        assert.equal(captured.length, 3);
        for (const request of captured) assert.equal(request.options.headers.Authorization, 'Bearer secret-key');
    } finally {
        globalThis.fetch = originalFetch;
        globalThis.SillyTavern = originalSillyTavern;
    }
});

test('r42.3 cache write and read share one UTF-8 byte cap and the manifest remains backward compatible', async (t) => {
    if (typeof CompressionStream !== 'function' || typeof DecompressionStream !== 'function') {
        t.skip('CompressionStream/DecompressionStream unavailable');
        return;
    }
    const formerSelfUnreadableShape = { text: '春'.repeat(Math.floor(MAX_CACHE_SOURCE_BYTES / 3) + 32) };
    await assert.rejects(gzipJson(formerSelfUnreadableShape), /UTF-8 数据过大/);

    const value = { chatId: 'cache-chat', heart: { kind: 'heart', text: '春夏秋冬'.repeat(20_000) } };
    const packed = await gzipJson(value);
    assert.ok(packed.sourceBytes > packed.sourceChars);
    assert.ok(packed.sourceBytes <= MAX_CACHE_SOURCE_BYTES);
    assert.deepEqual(await gunzipJson(packed.data), value);

    const manifest = compressedCacheManifest(value, packed);
    assert.equal(manifest.format, CACHE_STORAGE_FORMAT);
    assert.equal(manifest.sourceChars, packed.sourceChars);
    assert.equal(manifest.sourceBytes, packed.sourceBytes);

    const legacyManifest = compressedCacheManifest(value, { data: packed.data, sourceChars: packed.sourceChars });
    assert.equal(legacyManifest.sourceBytes, 0);
    assert.deepEqual(await gunzipJson(legacyManifest.data), value);
});

test('r42.3 indexed archive fetch targets one chat and never retains returned message rows', async () => {
    const originalFetch = globalThis.fetch;
    runtimeState.archiveSnapshotCache.clear();
    const captured = [];
    const context = makeContext();
    const memory = {
        version: 3,
        chatId: 'history-one',
        characterName: '角色',
        archiveName: '历史档案',
        archiveRevision: 'revision-one',
        memories: [],
    };
    globalThis.fetch = async (url, options) => {
        captured.push({ url: String(url), options });
        return {
            ok: true,
            json: async () => [
                { chat_metadata: { [MEMORY_KEY]: memory } },
                { mes: '<img src=x onerror=alert(1)>', is_user: false },
                { mes: '这条正文不应进入 Heartbeat snapshot', is_user: true },
            ],
        };
    };
    try {
        const snapshot = await fetchIndexedArchiveSnapshot({
            entryId: 'entry-history-one',
            archiveGroupId: 'auto:role',
            characterKey: 'role.png',
            avatar: 'role.png',
            characterName: '角色',
            chatId: 'history-one.jsonl',
        }, context);
        assert.equal(captured.length, 1);
        assert.equal(captured[0].url, '/api/chats/get');
        assert.deepEqual(JSON.parse(captured[0].options.body), { avatar_url: 'role.png', file_name: 'history-one' });
        assert.equal(captured[0].options.body.includes('metadata'), false);
        assert.equal(snapshot.memory, memory);
        assert.equal(Object.hasOwn(snapshot, 'messages'), false);
        assert.equal(JSON.stringify(snapshot).includes('这条正文不应进入'), false);
    } finally {
        runtimeState.archiveSnapshotCache.clear();
        globalThis.fetch = originalFetch;
    }
});

test('r42.3 destroy clears transient state and stale async results cannot refill it', async () => {
    const originalDocument = globalThis.document;
    const originalFetch = globalThis.fetch;
    const originalSillyTavern = globalThis.SillyTavern;
    const context = makeContext();
    globalThis.document = documentStub();
    globalThis.SillyTavern = { getContext: () => context };

    runtimeState.memoryPreflightCache.set('old', { sensitive: true });
    runtimeState.deferredChatCommits.set('old', [{ kind: 'sessions' }]);
    runtimeState.archiveSnapshotCache.set('old', { metadata: true });
    runtimeState.connectionModelCache.set('old', ['model']);
    runtimeState.archiveOverviewCache = { key: 'old', fetchedAt: Date.now(), items: [{ chatId: 'old' }] };
    runtimeState.archiveOverviewLastKey = 'old';
    runtimeState.archiveLibraryCharacterKey = 'old';
    runtimeState.contentManagerOpen = true;
    runtimeState.activeAvatarDialogue = { old: true };

    let resolveFetch;
    globalThis.fetch = () => new Promise(resolve => { resolveFetch = resolve; });
    const pendingSnapshot = fetchIndexedArchiveSnapshot({
        entryId: 'entry-stale', archiveGroupId: 'auto:role', characterKey: 'role.png', avatar: 'role.png',
        characterName: '角色', chatId: 'stale-history',
    }, context);
    const oldOrigin = captureTaskOrigin(context, 'old-revision');
    destroyMemoryTheater();
    resolveFetch({ ok: true, json: async () => [{ chat_metadata: {
        [MEMORY_KEY]: { version: 3, chatId: 'stale-history', characterName: '角色', archiveRevision: 'old-revision', memories: [] },
        [CACHE_KEY]: {},
    } }] });
    await assert.rejects(pendingSnapshot, error => error?.name === 'AbortError');

    assert.equal(runtimeState.memoryPreflightCache.size, 0);
    assert.equal(runtimeState.deferredChatCommits.size, 1, 'r46 preserves durable deferred results across runtime reload');
    assert.equal(runtimeState.archiveSnapshotCache.size, 0);
    assert.equal(runtimeState.connectionModelCache.size, 0);
    assert.equal(runtimeState.archiveOverviewCache.items.length, 0);
    assert.equal(runtimeState.archiveOverviewLastKey, '');
    assert.equal(runtimeState.archiveLibraryCharacterKey, '');
    assert.equal(runtimeState.contentManagerOpen, false);
    assert.equal(runtimeState.activeAvatarDialogue, null);

    queueDeferredCommit(oldOrigin, { kind: 'sessions', sessions: { heart: { kind: 'heart' } } });
    assert.equal(runtimeState.deferredChatCommits.size, 1, 'old-lifecycle result must not add to the preserved durable queue');
    const currentOrigin = captureTaskOrigin(context, 'current-revision');
    queueDeferredCommit(currentOrigin, { kind: 'sessions', sessions: { heart: { kind: 'heart' } } });
    assert.equal(runtimeState.deferredChatCommits.size, 2, 'current lifecycle adds normal deferred commits beside preserved results');
    runtimeState.deferredChatCommits.clear();

    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
    globalThis.SillyTavern = originalSillyTavern;
});

test('r42.3 in-flight gzip/gunzip cannot write after destroy and old finally cannot delete a new hydration', async () => {
    const originalDocument = globalThis.document;
    const originalCompressionStream = globalThis.CompressionStream;
    const originalDecompressionStream = globalThis.DecompressionStream;
    const originalSillyTavern = globalThis.SillyTavern;
    const context = makeContext('stream-chat');
    context.chatMetadata[MEMORY_KEY] = {
        version: 3, chatId: 'stream-chat', characterName: '角色', archiveRevision: 'stream-revision', memories: [],
    };
    globalThis.document = documentStub();
    globalThis.SillyTavern = { getContext: () => context };

    const compressionGate = Promise.withResolvers();
    const compressionEntered = Promise.withResolvers();
    globalThis.CompressionStream = class DelayedCompressionStream {
        constructor() {
            const transform = new TransformStream({
                async transform(chunk, controller) {
                    compressionEntered.resolve();
                    await compressionGate.promise;
                    controller.enqueue(chunk);
                },
            });
            this.readable = transform.readable;
            this.writable = transform.writable;
        }
    };

    try {
        const cache = { chatId: 'stream-chat', archiveRevision: 'stream-revision', heart: { kind: 'heart' } };
        const persist = persistCompressedCacheNow(context, cache);
        await compressionEntered.promise;
        destroyMemoryTheater();
        compressionGate.resolve();
        assert.equal(await persist, false);
        assert.equal(Object.hasOwn(context.chatMetadata, CACHE_KEY), false);
        assert.equal(runtimeState.pendingCompressedCacheWrites.size, 0);

        const decoded = { chatId: 'stream-chat', archiveRevision: 'stream-revision', heart: { kind: 'heart', title: '新生命周期' } };
        const decodedBytes = new TextEncoder().encode(JSON.stringify(decoded));
        const gates = [Promise.withResolvers(), Promise.withResolvers()];
        const entered = [Promise.withResolvers(), Promise.withResolvers()];
        let streamIndex = 0;
        globalThis.DecompressionStream = class ControlledDecompressionStream {
            constructor() {
                const index = streamIndex++;
                let emitted = false;
                const transform = new TransformStream({
                    async transform(_chunk, controller) {
                        if (emitted) return;
                        emitted = true;
                        entered[index].resolve();
                        await gates[index].promise;
                        controller.enqueue(decodedBytes);
                    },
                });
                this.readable = transform.readable;
                this.writable = transform.writable;
            }
        };
        context.chatMetadata[CACHE_KEY] = {
            format: CACHE_STORAGE_FORMAT, storageVersion: 1, data: 'AQ==', sourceChars: 1, sourceBytes: 1,
        };

        const oldHydration = ensureCacheHydrated(context);
        await entered[0].promise;
        destroyMemoryTheater();
        const newHydration = ensureCacheHydrated(context);
        await entered[1].promise;
        gates[0].resolve();
        await assert.rejects(oldHydration, error => error?.name === 'AbortError');
        assert.equal(runtimeState.runtimeSessionCache.size, 0);
        assert.equal(runtimeState.cacheHydrationPromises.size, 1, 'old finally must preserve the new lifecycle promise');
        gates[1].resolve();
        assert.deepEqual(await newHydration, decoded);
        assert.equal(runtimeState.cacheHydrationPromises.size, 0);
        assert.equal(runtimeState.runtimeSessionCache.size, 1);
    } finally {
        runtimeState.runtimeSessionCache.clear();
        runtimeState.cacheHydrationPromises.clear();
        runtimeState.cacheHydrationErrors.clear();
        runtimeState.pendingCompressedCacheWrites.clear();
        globalThis.document = originalDocument;
        globalThis.CompressionStream = originalCompressionStream;
        globalThis.DecompressionStream = originalDecompressionStream;
        globalThis.SillyTavern = originalSillyTavern;
    }
});

test('r42.3 every asynchronous transient-cache writer checks the runtime lifecycle epoch', async () => {
    const repository = await readFile(new URL('src/archive/repository.js', root), 'utf8');
    const library = await readFile(new URL('src/archive/library.js', root), 'utf8');
    const snapshots = await readFile(new URL('src/archive/snapshots.js', root), 'utf8');
    const settings = await readFile(new URL('src/core/settings.js', root), 'utf8');
    const heartbeat = await readFile(new URL('src/heartbeatMemories.js', root), 'utf8');
    const cache = await readFile(new URL('src/core/cache.js', root), 'utf8');
    assert.match(repository, /readCurrentChatMemoryPlugins[\s\S]*lifecycleEpoch !== runtimeState\.runtimeLifecycleEpoch/);
    assert.match(library, /fetchIndexedArchiveSnapshot[\s\S]*lifecycleEpoch !== runtimeState\.runtimeLifecycleEpoch/);
    assert.match(snapshots, /refreshArchiveOverview[\s\S]*lifecycleEpoch !== runtimeState\.runtimeLifecycleEpoch/);
    assert.match(settings, /fetchModelsForConnection[\s\S]*lifecycleEpoch !== runtimeState\.runtimeLifecycleEpoch/);
    assert.match(heartbeat, /runtimeState\.runtimeLifecycleEpoch \+= 1/);
    assert.match(cache, /persistCompressedCacheNow[\s\S]*lifecycleEpoch !== runtimeState\.runtimeLifecycleEpoch/);
    assert.match(cache, /ensureCacheHydrated[\s\S]*cacheHydrationPromises\.get\(scope\) === promise/);
});
