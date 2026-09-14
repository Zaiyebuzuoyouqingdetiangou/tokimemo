import test from 'node:test';
import assert from 'node:assert/strict';
import * as policy from '../src/core/autoUpdatePolicy.js';
import * as contextApi from '../src/core/context.js';
import * as autoUpdates from '../src/core/autoUpdates.js';

const memoryKey = 'heartbeatMemoriesArchiveV3';
const scopeStorageKey = context => 'heartbeatMemoriesAutoFloorsV1:' + encodeURIComponent(contextApi.chatScopeKey(context));
const rules = enabled => ({ album: { enabled, every: 5, epoch: 1 } });
let sequence = 0;

function contextFixture() {
    return { characterId: 0, name2: '远山', chatId: '聊天.jsonl', chat: new Array(10),
        characters: [{ name: '远山', avatar: 'far.png', data: { description: '角色设定', personality: '沉静' } }],
        extensionSettings: { heartbeatMemories: { autoUpdates: rules(true) } },
        chatMetadata: { [memoryKey]: { version: 3, chatId: '聊天', archiveRevision: 'rev-1', memories: [] } } };
}

function fixture(initial = contextFixture()) {
    const old = new Map();
    const replace = (key, value) => { old.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); };
    const events = new Map(), documentEvents = new Map(), timers = new Map(), stored = new Map();
    const calls = { reads: 0, writes: 0, locks: 0, heavy: 0, wakes: 0 };
    let context = initial, allowLock = true, lockHook = null, timerId = 0;
    const source = {
        on(type, listener) { const set = events.get(type) || new Set(); set.add(listener); events.set(type, set); },
        off(type, listener) { events.get(type)?.delete(listener); },
    };
    const installContext = value => {
        context = value;
        if (!value) return;
        value.eventSource = source;
        value.eventTypes = { MESSAGE_SENT: 'sent', MESSAGE_RECEIVED: 'received', CHAT_CHANGED: 'changed', CHAT_LOADED: 'loaded' };
        for (const method of ['getCharacterCardFields', 'getWorldInfoPrompt', 'getTokenCountAsync', 'saveMetadataDebounced', 'saveSettingsDebounced']) {
            value[method] = () => { calls.heavy += 1; throw new Error('Forbidden during lightweight startup: ' + method); };
        }
    };
    installContext(context);
    const mounted = { dataset: {}, remove() {} };
    replace('document', { readyState: 'loading', querySelectorAll: () => [],
        getElementById: id => ['heartbeat_memories_settings', 'heartbeat_memories_menu_item', 'heartbeat_memories_bootstrap_styles'].includes(id) ? mounted : null,
        addEventListener: (type, listener) => documentEvents.set(type, listener),
        removeEventListener: (type, listener) => { if (documentEvents.get(type) === listener) documentEvents.delete(type); } });
    replace('SillyTavern', { getContext: () => context });
    replace('localStorage', { getItem(key) { calls.reads += 1; return stored.get(key) || null; },
        setItem(key, value) { calls.writes += 1; stored.set(key, value); } });
    replace('navigator', { locks: { async request(name, options, job) { calls.locks += 1;
        assert.equal(options.ifAvailable, true); if (lockHook) await lockHook(); return job(allowLock ? {} : null); } } });
    replace('setInterval', callback => { timers.set(++timerId, callback); return timerId; });
    replace('clearInterval', id => timers.delete(id));
    replace('indexedDB', { open() { throw new Error('No backup reads at bootstrap'); } });
    return { calls, stored, timers, events, get context() { return context; },
        setContext: installContext, setLock: value => { allowLock = value; }, setLockHook: hook => { lockHook = hook; },
        startDom: () => documentEvents.get('DOMContentLoaded')?.(),
        emit: async type => { await Promise.all([...(events.get(type) || [])].map(listener => listener())); },
        pulse: async () => { await Promise.all([...timers.values()].map(listener => listener())); },
        restore() { autoUpdates.stopAutoUpdates(); for (const [key, descriptor] of old) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } },
    };
}

async function bootstrap(f) {
    const api = await import('../index.js?r81-startup=' + (++sequence));
    await api.startBootstrapAutoUpdates({ wakeRuntime: () => { f.calls.wakes += 1; } });
    return api;
}

test('cold bootstrap with all rules off stays inert, including unsupported saved modes', async () => {
    const context = contextFixture(); context.extensionSettings.heartbeatMemories.autoUpdates = rules(false);
    const f = fixture(context); let api;
    try {
        api = await bootstrap(f); f.startDom();
        await f.pulse();
        assert.equal(api.bootPromise, null);
        assert.deepEqual(f.calls, { reads: 0, writes: 0, locks: 0, heavy: 0, wakes: 0 });
        assert.equal(f.timers.size, 0);
        context.extensionSettings.heartbeatMemories.autoUpdates.timeEcho = { enabled: true };
        await api.startBootstrapAutoUpdates({ wakeRuntime: () => { f.calls.wakes += 1; } });
        assert.equal(f.timers.size, 0);
        assert.equal(f.calls.reads, 0);
        assert.equal(api.bootPromise, null);
    } finally { api?.onDisable(); f.restore(); }
});

test('saved opt-in waits for the real chat, arms once, and wakes at its first interval without advancing attemptFloor', async () => {
    const context = contextFixture(); const archive = context.chatMetadata[memoryKey];
    context.chatMetadata[memoryKey] = { ...archive, chatId: '别人的聊天' };
    const f = fixture(context); let api;
    try {
        api = await bootstrap(f); f.startDom();
        assert.equal(f.calls.reads, 0); assert.equal(f.calls.wakes, 0); assert.equal(api.bootPromise, null);
        context.chatMetadata[memoryKey] = archive; context.groupId = 'group';
        await f.emit('loaded'); assert.equal(f.calls.reads, 0);
        context.groupId = null;
        await f.emit('changed');
        const key = scopeStorageKey(context);
        assert.equal(JSON.parse(f.stored.get(key)).album.attemptFloor, 10);
        assert.equal(JSON.parse(f.stored.get(key)).album.status, 'armed');
        context.chat.length = 14; await f.emit('received');
        assert.equal(f.calls.wakes, 0);
        context.chat.length = 15; await f.emit('received');
        assert.equal(f.calls.wakes, 1);
        assert.equal(JSON.parse(f.stored.get(key)).album.attemptFloor, 10, 'the real scheduler must still see the due interval');
        assert.equal(JSON.parse(f.stored.get(key)).album.status, 'armed');
        await f.emit('received'); await f.pulse();
        assert.equal(f.calls.wakes, 1, 'runtime handoff must not repeat on duplicate host events');
        assert.equal(f.calls.heavy, 0);
        api.onDisable(); assert.equal(f.timers.size, 0);
        assert.ok([...f.events.values()].every(listeners => listeners.size === 0));
    } finally { api?.onClean(); f.restore(); }
});

test('bootstrap preserves persisted intervals and locks, and re-arms only on setting epoch change or floor rollback', async () => {
    const f = fixture(); let api;
    try {
        const key = scopeStorageKey(f.context);
        f.stored.set(key, JSON.stringify({ album: { signature: '5:1', attemptFloor: 8, successFloor: 8, status: 'complete' } }));
        api = await bootstrap(f);
        assert.equal(f.calls.wakes, 0); assert.equal(f.calls.writes, 0);
        f.context.extensionSettings.heartbeatMemories.autoUpdates.album.epoch = 2;
        await f.emit('received');
        assert.equal(JSON.parse(f.stored.get(key)).album.signature, '5:2');
        assert.equal(JSON.parse(f.stored.get(key)).album.attemptFloor, 10);
        f.context.chat.length = 6; await f.emit('loaded');
        assert.equal(JSON.parse(f.stored.get(key)).album.attemptFloor, 6);
        f.context.chat.length = 11; f.setLock(false); const writes = f.calls.writes;
        await f.emit('received');
        assert.equal(f.calls.wakes, 0); assert.equal(f.calls.writes, writes);
        f.setLock(true); await f.pulse();
        assert.equal(f.calls.wakes, 1);
        assert.equal(JSON.parse(f.stored.get(key)).album.attemptFloor, 6);
    } finally { api?.onDisable(); f.restore(); }
});

test('bootstrap rechecks chat after acquiring a cross-page lock', async () => {
    const f = fixture(); let api;
    try {
        let release, entered; const waiting = new Promise(resolve => { release = resolve; });
        const acquired = new Promise(resolve => { entered = resolve; });
        f.setLockHook(() => { entered(); return waiting; });
        api = await import('../index.js?r81-startup=' + (++sequence));
        const pending = api.startBootstrapAutoUpdates({ wakeRuntime: () => { f.calls.wakes += 1; } });
        await acquired;
        assert.equal(f.calls.locks, 1);
        const other = contextFixture(); other.chatId = '另一个聊天'; other.chatMetadata[memoryKey].chatId = other.chatId;
        f.setContext(other); release(); await pending;
        assert.equal(f.calls.reads, 0); assert.equal(f.calls.writes, 0); assert.equal(f.calls.wakes, 0);
        api.onDisable();
        await f.emit('loaded'); await f.pulse();
        assert.equal(f.calls.reads, 0); assert.equal(f.calls.wakes, 0);
    } finally { api?.onClean(); f.restore(); }
});

test('disable cancels a pending bootstrap policy load before it can arm or attach timers', async () => {
    const f = fixture(); let api;
    try {
        api = await import('../index.js?r81-startup=' + (++sequence));
        const pending = api.startBootstrapAutoUpdates({ wakeRuntime: () => { f.calls.wakes += 1; } });
        api.onDisable(); await pending;
        assert.equal(f.calls.reads, 0); assert.equal(f.calls.writes, 0); assert.equal(f.calls.wakes, 0);
        assert.equal(f.timers.size, 0);
        assert.ok([...f.events.values()].every(listeners => listeners.size === 0));
    } finally { api?.onClean(); f.restore(); }
});

test('bootstrap handoff leaves exactly one paid interval for the full scheduler', async () => {
    const f = fixture(); let api;
    try {
        const key = scopeStorageKey(f.context);
        f.stored.set(key, JSON.stringify({ album: { signature: '5:1', attemptFloor: 5, successFloor: 5, status: 'complete' } }));
        api = await bootstrap(f); assert.equal(f.calls.wakes, 1);
        let paid = 0;
        const runtimeScheduler = policy.createFloorScheduler({
            snapshot: () => ({ scope: contextApi.chatScopeKey(f.context), floor: f.context.chat.length,
                ready: true, lifetime: 1, rules: policy.normalizeAutoUpdates(f.context.extensionSettings.heartbeatMemories.autoUpdates) }),
            busy: () => false, lock: async (_scope, job) => job(),
            read: () => JSON.parse(f.stored.get(key)), write: (_scope, value) => f.stored.set(key, JSON.stringify(value)),
            run: async () => { paid += 1; return { status: 'committed' }; },
        });
        await runtimeScheduler.tick(); await runtimeScheduler.tick();
        assert.equal(paid, 1); assert.equal(JSON.parse(f.stored.get(key)).album.attemptFloor, 10);
        assert.equal(JSON.parse(f.stored.get(key)).album.status, 'complete');
    } finally { api?.onDisable(); f.restore(); }
});

test('bootstrap scope agrees with the real runtime across card formats, bounds, slots and chat ID fallback', async () => {
    const f = fixture(); let api;
    try {
        f.context.extensionSettings.heartbeatMemories.autoUpdates = rules(false);
        api = await bootstrap(f);
        for (const character of [
            { name: '  远山\r\n\u0000 ', avatar: 'avatar.png', description: 'a'.repeat(6000), personality: 'b', scenario: 'c' },
            { name: '', data: { name: '远山', avatar: 'data.png', description: '𐀀\r\n'.repeat(3000), first_mes: 'hello', mes_example: 'example' } },
            { data: {} }, null,
        ]) {
            for (const slot of [0, '1']) {
                const context = contextFixture(); context.characterId = slot; context.characters = [character, character];
                context.getCurrentChatId = () => { throw new Error('host fallback'); };
                context.chatId = '  某次聊天.JSONL  ';
                assert.equal(api.bootstrapAutoUpdateScope(context), contextApi.chatScopeKey(context));
            }
        }
    } finally { api?.onDisable(); f.restore(); }
});

test('floor scheduler reads one snapshot per synchronous segment, including disabled modes', async () => {
    let reads = 0, runs = 0;
    const current = { scope: 'scope', ready: true, floor: 12, lifetime: 1, rules: policy.normalizeAutoUpdates(rules(true)) };
    const scheduler = policy.createFloorScheduler({ snapshot: () => { reads += 1; return current; },
        lock: async (_scope, job) => job(), busy: () => false,
        read: async () => ({ album: { signature: '5:1', attemptFloor: 10, successFloor: 10, status: 'armed' } }),
        write: async () => assert.fail('not due'), run: async () => { runs += 1; } });
    await scheduler.tick();
    assert.equal(reads, 3, 'start, lock acquired and checkpoint read are the only asynchronous identity boundaries');
    assert.equal(runs, 0);
});

test('floor scheduler revalidates identity and opt-in after storage and provider awaits', async () => {
    for (const change of ['chat-after-read', 'off-after-write', 'chat-after-run']) {
        let writes = 0, runs = 0;
        const current = { scope: 'scope', ready: true, floor: 15, lifetime: 1, rules: policy.normalizeAutoUpdates(rules(true)) };
        const scheduler = policy.createFloorScheduler({ snapshot: () => ({ ...current }), lock: async (_scope, job) => job(), busy: () => false,
            read: async () => { if (change === 'chat-after-read') current.scope = 'other';
                return { album: { signature: '5:1', attemptFloor: 10, successFloor: 10, status: 'armed' } }; },
            write: async () => { writes += 1; if (change === 'off-after-write') current.rules = policy.normalizeAutoUpdates(rules(false)); },
            run: async () => { runs += 1; current.scope = 'other'; return { status: 'committed' }; } });
        await scheduler.tick();
        assert.equal(runs, change === 'chat-after-run' ? 1 : 0, change);
        assert.equal(writes, change === 'chat-after-read' ? 0 : 1, 'no stale success checkpoint: ' + change);
    }
});

test('runtime scheduler does no archive scan or settings write while off and enables through the existing setting event', async () => {
    const context = contextFixture(); context.extensionSettings.heartbeatMemories.autoUpdates = rules(false);
    let archiveReads = 0; const archive = context.chatMetadata[memoryKey];
    Object.defineProperty(context.chatMetadata, memoryKey, { get() { archiveReads += 1; return archive; } });
    const f = fixture(context);
    try {
        autoUpdates.startAutoUpdates(); await f.emit('loaded'); await f.pulse();
        assert.equal(archiveReads, 0); assert.equal(f.timers.size, 0); assert.equal(f.calls.reads, 0);
        context.extensionSettings.heartbeatMemories.autoUpdates = rules(true);
        autoUpdates.notifyAutoUpdateSettingsChanged(); await f.emit('received');
        assert.equal(f.timers.size, 1);
        assert.equal(JSON.parse(f.stored.get(scopeStorageKey(context))).album.attemptFloor, 10);
        assert.equal(f.calls.heavy, 0, 'normalizing unrelated settings must not run on the timer');
        context.extensionSettings.heartbeatMemories.autoUpdates = rules(false);
        await f.emit('received'); assert.equal(f.timers.size, 0);
        const reads = archiveReads; await f.emit('loaded');
        assert.equal(archiveReads, reads);
    } finally { f.restore(); }
});
