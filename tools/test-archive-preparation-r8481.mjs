import test from 'node:test';
import assert from 'node:assert/strict';
import { preparationFixture, until, settles } from './preparation-harness-r8481.mjs';

test('first archive cancels a non-cooperative world-info read and can start again without a late request', async () => {
    let release, reads = 0;
    const f = await preparationFixture({ hostOverrides: { getWorldInfoPrompt: () => { reads++; return new Promise(resolve => { release = resolve; }); } } });
    const before = structuredClone(f.host.chatMetadata);
    const pending = f.repo.importCurrentChatMemory();
    await until(() => reads === 1);
    assert.equal(f.state.busy, true);
    const task = f.coordinator.queryParticipantGenerationTasks(f.host)[0];
    const stopped = f.coordinator.cancelParticipantGenerationTasks([task.id]);
    assert.equal((await settles(pending)).status, 'cancelled');
    await settles(stopped);
    assert.equal(f.state.busy, false);
    assert.equal(f.state.archivePreparationToken, null);
    assert.equal(f.coordinator.queryParticipantGenerationTasks(f.host).length, 0);
    assert.deepEqual(f.host.chatMetadata, before);
    assert.equal(f.providerCalls, 0);
    release({ worldInfoString: '迟到的旧数据' });
    f.host.getWorldInfoPrompt = async () => ({ worldInfoString: '本次设定' });
    const second = await settles(f.repo.importCurrentChatMemory());
    assert.equal(second.status, 'failed'); // The controlled provider boundary deliberately fails.
    assert.equal(f.providerCalls, 1);
    assert.equal(f.state.busy, false);
});

test('unresponsive world-info read exits with a specific diagnostic and releases preparation', async () => {
    const timerDurations = [];
    const f = await preparationFixture({ hostOverrides: { getWorldInfoPrompt: () => new Promise(() => {}) },
        timers: { setTimeout: (fn, ms, ...args) => { timerDurations.push(ms); return setTimeout(fn, ms === 15000 ? 10 : ms, ...args); } } });
    const result = await settles(f.repo.importCurrentChatMemory());
    assert.equal(result.status, 'failed');
    assert.equal(result.error.code, 'RMT_WORLD_INFO_READ_TIMEOUT');
    assert.equal(f.providerCalls, 0);
    assert.equal(f.state.busy, false);
    assert.equal(f.coordinator.queryParticipantGenerationTasks(f.host).length, 0);
    assert.ok(timerDurations.includes(15000));
    assert.ok(f.events.some(row => /世界书读取没有响应/.test(row.message)));
    assert.ok(f.coordinator.listChatTaskSnapshot(f.host).some(row => /世界书读取没有响应/.test(JSON.stringify(row))));
    f.host.getWorldInfoPrompt = async () => ({ worldInfoString: '' });
    await settles(f.repo.importCurrentChatMemory());
    assert.equal(f.providerCalls, 1);
});

test('cancel during encrypted credential preparation settles without storing the late key', async () => {
    let reads = 0, release;
    const f = await preparationFixture({ storageRead: () => { reads++; return new Promise(resolve => { release = resolve; }); } });
    Object.assign(f.host.extensionSettings.heartbeatMemories, { apiConnectionMode: 'manual', manualApiBaseUrl: 'https://example.invalid/v1',
        manualApiSecretRef: 'credential:12345678-1234-1234-1234-123456789abc' });
    const pending = f.repo.importCurrentChatMemory();
    await until(() => reads === 1);
    const task = f.coordinator.queryParticipantGenerationTasks(f.host)[0];
    const stopped = f.coordinator.cancelParticipantGenerationTasks([task.id]);
    assert.equal((await settles(pending)).status, 'cancelled'); await settles(stopped);
    assert.equal(f.state.busy, false);
    assert.equal(f.state.activeTaskAbortController, null);
    release(null); await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(f.state.manualApiKey, ''); assert.equal(f.providerCalls, 0);
});

test('cancelled memory scan does not occupy the next scan or cache a late source', async () => {
    const f = await preparationFixture();
    let release, calls = 0;
    f.host.loadWorldInfo = () => { calls++; return new Promise(resolve => { release = resolve; }); };
    const worldInfo = await f.api('archive/worldInfoSources.js');
    worldInfo.setMemoryWorldInfoSelection(f.host, { books: [{ name: '选中的历史', all: true, historySource: true }] });
    const memory = await f.api('archive/externalMemory.js');
    const controller = new AbortController();
    const read = memory.readCurrentChatMemoryPlugins({ signal: controller.signal });
    await until(() => calls === 1); controller.abort();
    await assert.rejects(settles(read), { name: 'AbortError' });
    f.host.loadWorldInfo = async () => ({ entries: {} });
    await settles(memory.readCurrentChatMemoryPlugins({ signal: new AbortController().signal }));
    const before = [...f.state.memoryPreflightCache.values()];
    release({ entries: { 1: { uid: 1, content: '取消前的旧来源' } } });
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual([...f.state.memoryPreflightCache.values()], before);
    assert.equal(f.providerCalls, 0);
});

test('first-step draft read is cancellable without deleting stored archives or starting a request', async () => {
    let release, reads = 0;
    const f = await preparationFixture({ storageRead: (_key, records) => { reads++;
        return reads === 1 ? new Promise(resolve => { release = resolve; }) : structuredClone(records.get(_key) || null); } });
    const pending = f.repo.importCurrentChatMemory();
    await until(() => reads === 1);
    const task = f.coordinator.queryParticipantGenerationTasks(f.host)[0];
    const stopped = f.coordinator.cancelParticipantGenerationTasks([task.id]);
    assert.equal((await settles(pending)).status, 'cancelled'); await settles(stopped);
    assert.equal(f.state.busy, false); assert.equal(f.providerCalls, 0);
    // The cancelled read is still unresolved. Retrying must issue a fresh read.
    await settles(f.repo.importCurrentChatMemory());
    assert.ok(reads >= 2); assert.equal(f.providerCalls, 1); assert.equal(f.state.busy, false);
    const saved = structuredClone([...f.records]);
    release(null);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual([...f.records], saved);
});

test('source ledger aborts a stuck IDB transaction instead of holding the next preparation', async () => {
    const f = await preparationFixture();
    const ledger = await f.api('archive/sourceLedger.js');
    ledger.setMemorySourceLedgerBackendForTests(null);
    let aborted = 0, started = 0, responding = false;
    const db = { close() {}, transaction() {
        const tx = { abort() { aborted++; tx.onabort?.(); }, objectStore() { return { get() {
            started++; const request = {};
            if (responding) setTimeout(() => { request.result = null; request.onsuccess?.(); tx.oncomplete?.(); }, 0);
            return request;
        } }; } }; return tx;
    } };
    f.sandbox.indexedDB = { open() { const request = {}; setTimeout(() => { request.result = db; request.onsuccess(); }, 0); return request; } };
    const controller = new AbortController(), scope = { characterKey: 'card', chatId: 'chat' };
    const pending = ledger.readMemorySourceLedger(scope, { signal: controller.signal });
    await until(() => started === 1); controller.abort();
    await assert.rejects(settles(pending), { name: 'AbortError' });
    await until(() => aborted === 1);
    responding = true;
    assert.equal(await settles(ledger.readMemorySourceLedger(scope)), null);
});

test('cancellation between resolved storage and its continuation cannot publish the old hydration', async () => {
    let release, key, reads = 0;
    const f = await preparationFixture({ storageRead: id => { key = id; reads++; return reads === 1 ? new Promise(resolve => { release = resolve; }) : null; } });
    const drafts = await f.api('archive/importRecovery.js');
    const origin = (await f.api('core/context.js')).captureTaskOrigin(f.host);
    const controller = new AbortController();
    const pending = drafts.hydrateArchiveRecovery(origin, 'import', { signal: controller.signal });
    await until(() => reads === 1);
    release({ key, revision: 1, payload: null });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    controller.abort();
    await assert.rejects(settles(pending), { name: 'AbortError' });
    await drafts.hydrateArchiveRecovery(origin);
    assert.equal(reads, 2);
});

test('a timed-out ledger open can be retried; its late connection is closed', async () => {
    const f = await preparationFixture({ timers: { setTimeout: (fn, ms, ...args) => setTimeout(fn, ms === 15000 ? 10 : ms, ...args) } });
    const ledger = await f.api('archive/sourceLedger.js');
    ledger.setMemorySourceLedgerBackendForTests(null);
    const opens = [];
    f.sandbox.indexedDB = { open() { const request = {}; opens.push(request); return request; } };
    const scope = { characterKey: 'card', chatId: 'chat' };
    await assert.rejects(settles(ledger.readMemorySourceLedger(scope)), { code: 'RMT_MEMORY_READ_TIMEOUT' });
    let closed = 0;
    opens[0].result = { close() { closed++; } }; opens[0].onsuccess();
    assert.equal(closed, 1);
    const again = ledger.readMemorySourceLedger(scope);
    await until(() => opens.length === 2);
    opens[1].onerror();
    await assert.rejects(settles(again));
    assert.equal(opens.length, 2);
});
