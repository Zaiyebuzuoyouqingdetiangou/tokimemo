import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './runtime-harness.mjs';

async function pendingFixture({ messages = 12 } = {}) {
    const h = await harness({ messages, failAfter: 100, bundle: true });
    if (messages === 571) h.host.chat.forEach((row, i) => { row.mes = `事件${i + 1}散步。` + '春'.repeat(1030); });
    assert.equal((await h.repo.importCurrentChatMemory()).status, 'committed', JSON.stringify(h.events));
    // This fixture models the already saved capacity checkpoint, without the
    // deliberately failing cover provider used by the general test harness.
    await h.repo.discardCurrentArchiveImportRecovery(h.host);
    const bank = h.copy(h.repo.getImportedMemory(h.host));
    const sample = bank.memories[0];
    bank.memories = Array.from({ length: 240 }, (_, i) => ({ ...sample, id: `M${String(i + 1).padStart(3, '0')}`, title: `旧记忆${i}`, locked: true }));
    bank.coldArchive = Array.from({ length: 101 }, (_, i) => ({ ...sample, id: `M${i + 500}`, title: `冷存${i}` }));
    bank.archiveImportProgress.nextBatch = 0;
    bank.archiveImportProgress.capacityPending = Array.from({ length: 55 }, (_, i) => {
        const item = { ...sample, title: `待入档${i}` }; delete item.id; return item;
    });
    bank.usedMessageCount = 0; bank.usedCharacterCount = 0; bank.coveredRanges = []; bank.coverageMode = 'batched-pending';
    h.host.chatMetadata.heartbeatMemoriesArchiveV3 = h.copy(bank);
    h.backups.clear();
    await h.reload();
    return { h, bank, calls: h.providerCalls.length };
}

test('571 source fragments / 55 pending results save locally, preserving 240 locked and all cold memories', async () => {
    const { h, bank, calls } = await pendingFixture({ messages: 571 });
    const summary = h.repo.getCurrentArchiveImportRecoverySummary(h.host);
    assert.equal(summary.canContinue, true);
    const html = h.module('ui/recoveryView.js').archiveRecoveryHtml(summary);
    assert.match(html, /保存待入档结果（不生成）/);
    assert.equal((await h.repo.continueCurrentArchiveImport()).status, 'committed', JSON.stringify(h.events));
    const saved = h.repo.getImportedMemory(h.host);
    assert.equal(saved.memories.length, 295);
    assert.deepEqual(h.copy(saved.memories.slice(0, 240)), h.copy(bank.memories));
    assert.deepEqual(h.copy(saved.coldArchive), h.copy(bank.coldArchive));
    assert.equal(new Set(saved.memories.map(m => m.id)).size, 295);
    assert.equal(saved.memories[240].id, 'M601');
    assert.equal(saved.archiveImportProgress.capacityPending.length, 0);
    assert.equal(saved.archiveImportProgress.nextBatch, 1);
    assert.equal(saved.usedMessageCount, 571);
    assert.equal(saved.coverageMode, 'batched-complete');
    assert.equal(saved.coveredRanges[0].end, 571);
    assert.equal(h.providerCalls.length, calls);
    await h.reload();
    assert.equal((await h.repo.continueCurrentArchiveImport()).status, 'blocked');
    assert.equal(h.providerCalls.length, calls);
});

test('storage failure keeps all pending results and retry is local only', async () => {
    const { h, bank, calls } = await pendingFixture();
    h.module('archive/backupStore.js').setArchiveBackupBackendForTests({ read: async () => null, put: async () => { throw new Error('storage unavailable'); } });
    assert.equal((await h.repo.continueCurrentArchiveImport()).status, 'failed');
    assert.deepEqual(h.copy(h.repo.getImportedMemory(h.host)), h.copy(bank));
    h.module('archive/backupStore.js').setArchiveBackupBackendForTests({ read: async () => null, put: async () => true });
    await h.reload();
    assert.equal((await h.repo.continueCurrentArchiveImport()).status, 'committed', JSON.stringify(h.events));
    assert.equal(h.providerCalls.length, calls);
});

test('changed source cannot receive a pending batch', async () => {
    const { h, bank, calls } = await pendingFixture();
    h.host.chat[0].mes = 'edited';
    assert.equal((await h.repo.continueCurrentArchiveImport()).status, 'failed');
    assert.deepEqual(h.copy(h.repo.getImportedMemory(h.host)), h.copy(bank));
    assert.equal(h.providerCalls.length, calls);
});

test('default admission no longer evicts or stalls at 240; prompt budgets stay bounded', async () => {
    const h = await harness({ bundle: true });
    const incoming = Array.from({ length: 300 }, (_, i) => ({ title: `事件${i}`, summary: '散步', sourceKind: 'chat', messageStart: i + 1, messageEnd: i + 1 }));
    const admitted = h.module('archive/capacity.js').admitArchiveMemories([], incoming);
    assert.equal(admitted.memories.length, 300);
    assert.equal(admitted.pending.length, 0);
    assert.equal(admitted.evicted.length, 0);
    const ids = h.module('core/incremental.js').archiveMemoryIds(admitted);
    assert.equal(ids.length, 300);
    assert.equal(h.module('core/evidence.js').memoryPayload(admitted).length, 64);
    assert.equal(h.module('core/constants.js').MAX_DERIVED_CONTENT_ITEMS, 240);
});

test('task center refresh observes the task removed after settling', async () => {
    const h = await harness({ bundle: true });
    const tasks = h.module('core/requestCoordinator.js');
    let last;
    tasks.setTaskCenterRefresh(() => { last = tasks.listChatTaskSnapshot(h.host); });
    const task = tasks.beginLogicalGenerationTask({ context: h.host, origin: h.module('core/context.js').captureTaskOrigin(h.host), kind: 'archive-import' });
    tasks.finishLogicalGenerationTask(task, { status: 'committed' });
    assert.ok(last.every(row => !row.running));
});

test('switching chats during pending-save backup cannot publish the candidate', async () => {
    const { h, bank, calls } = await pendingFixture();
    h.module('archive/backupStore.js').setArchiveBackupBackendForTests({ read: async () => null, put: async () => { h.host.chatId = 'another-chat'; return true; } });
    assert.ok(['failed', 'cancelled'].includes((await h.repo.continueCurrentArchiveImport()).status));
    assert.deepEqual(h.copy(h.host.chatMetadata.heartbeatMemoriesArchiveV3), h.copy(bank));
    assert.equal(h.providerCalls.length, calls);
});

test('a concurrent archive revision wins over pending-save CAS', async () => {
    const { h, bank, calls } = await pendingFixture();
    h.module('archive/backupStore.js').setArchiveBackupBackendForTests({ read: async () => null, put: async () => {
        h.host.chatMetadata.heartbeatMemoriesArchiveV3 = h.copy({ ...bank, archiveRevision: 'concurrent-winner' }); return true;
    } });
    assert.ok(['failed', 'cancelled'].includes((await h.repo.continueCurrentArchiveImport()).status));
    assert.equal(h.repo.getImportedMemory(h.host).archiveRevision, 'concurrent-winner');
    assert.equal(h.repo.getImportedMemory(h.host).archiveImportProgress.capacityPending.length, 55);
    assert.equal(h.providerCalls.length, calls);
});

test('metadata failure after backup retries the exact staged revision without re-admission', async () => {
    const { h, bank, calls } = await pendingFixture();
    h.host.saveMetadataDebounced = () => { throw new Error('metadata unavailable'); };
    assert.equal((await h.repo.continueCurrentArchiveImport()).status, 'failed');
    assert.deepEqual(h.copy(h.repo.getImportedMemory(h.host)), h.copy(bank));
    const pending = h.repo.exportCurrentArchiveImportProgress(h.host).pendingSave.memoryBank;
    h.module('archive/backupStore.js').setArchiveBackupBackendForTests({ read: async () => null, put: async record => {
        assert.equal(record.archiveRevision, pending.archiveRevision); return true;
    } });
    h.host.saveMetadataDebounced = () => {};
    await h.reload();
    assert.equal((await h.repo.continueCurrentArchiveImport()).status, 'committed', JSON.stringify(h.events));
    assert.equal(h.repo.getImportedMemory(h.host).archiveRevision, pending.archiveRevision);
    assert.equal(h.repo.getImportedMemory(h.host).memories.length, 295);
    assert.equal(h.providerCalls.length, calls);
});

test('fresh extraction with 300 validated results saves every memory and reloads without truncation', async () => {
    const h = await harness({ messages: 2, bundle: true });
    h.module('generation/client.js').generateConfiguredJson = async prompt => {
        h.providerCalls.push(prompt);
        if (!prompt.includes('UNTRUSTED_CHAT_JSON:')) throw new Error('fixture cover unavailable');
        return h.copy({ memories: Array.from({ length: 300 }, (_, i) => ({
            title: `新记忆${i}`, summary: '在聊天中散步。', anchors: ['散步'], messageStart: 1, messageEnd: 2,
        })) });
    };
    assert.equal((await h.repo.importCurrentChatMemory()).status, 'committed', JSON.stringify(h.events));
    await h.reload();
    const bank = h.repo.getImportedMemory(h.host);
    assert.equal(bank.memories.length, 300);
    assert.equal(bank.memories.at(-1).id, 'M300');
    assert.equal(bank.coverageMode, 'batched-complete');
    assert.equal(bank.archiveImportProgress.capacityPending.length, 0);
});

test('pending admission preserves existing album content and its old evidence IDs', async () => {
    const { h, bank, calls } = await pendingFixture();
    const album = { kind: 'album', title: '旧相簿', entries: [{ id: 'old-entry', title: '旧回忆', sourceMemoryIds: ['M001'], imageUrl: 'data:image/png;base64,AA==' }] };
    h.host.chatMetadata.heartbeatMemoriesTheaterV3 = h.copy({ chatId: bank.chatId, archiveRevision: bank.archiveRevision, album });
    const result = await h.repo.continueCurrentArchiveImport();
    assert.equal(result.status, 'committed', result.error?.stack || JSON.stringify(h.events));
    const cache = h.module('core/cache.js').getCache(h.host);
    assert.deepEqual(h.copy(cache.album.entries), h.copy(album.entries));
    assert.equal(cache.archiveRevision, h.repo.getImportedMemory(h.host).archiveRevision);
    assert.equal(h.providerCalls.length, calls);
});

test('the production batch planner keeps every source and creates multiple explicit batches', async () => {
    const h = await harness({ bundle: true });
    const batches = h.module('archive/importBatches.js');
    const rows = Array.from({ length: 201 }, (_, i) => ({ index: i + 1, text: '春'.repeat(6000) }));
    const units = batches.makeSourceUnits(rows, []);
    const planned = await batches.planSourceBatches(units, async () => ({ exceeded: false }));
    assert.ok(planned.length > 1);
    const refs = planned.flatMap(batch => batch.flatMap(part => part.units.map(unit => unit.ref)));
    assert.equal(refs.reduce((n, ref) => n + ref.length, 0), 201 * 6000);
    assert.equal(new Set(refs.map(ref => ref.index)).size, 201);
});

test('next batch remains explicit and does not resend the locally admitted batch', async () => {
    const { h, bank, calls } = await pendingFixture();
    const progress = bank.archiveImportProgress;
    // A real, hash-checked second batch from the same captured snapshot.
    const parts = progress.batches[0];
    assert.ok(parts.length > 1);
    const split = Math.floor(parts.length / 2);
    progress.batches = [parts.slice(0, split), parts.slice(split)].map(batch => batch.map((part, index) => ({ ...part, index, total: batch.length })));
    h.host.chatMetadata.heartbeatMemoriesArchiveV3 = h.copy(bank);
    assert.equal((await h.repo.continueCurrentArchiveImport()).status, 'committed', JSON.stringify(h.events));
    const first = h.repo.getImportedMemory(h.host);
    assert.equal(first.archiveImportProgress.nextBatch, 1);
    assert.equal(first.coverageMode, 'batched-pending');
    assert.equal(h.providerCalls.length, calls);
    assert.match(h.module('ui/recoveryView.js').archiveRecoveryHtml(h.repo.getCurrentArchiveImportRecoverySummary(h.host)), /继续下一批/);
    await h.reload();
    assert.equal((await h.repo.continueCurrentArchiveImport()).status, 'committed', JSON.stringify(h.events));
    const final = h.repo.getImportedMemory(h.host);
    assert.equal(final.coverageMode, 'batched-complete');
    assert.deepEqual(h.copy(final.memories.slice(0, first.memories.length)), h.copy(first.memories));
    assert.equal(h.providerCalls.length - calls, progress.batches[1].length);
    for (const prompt of h.providerCalls.slice(calls)) {
        const marker = 'UNTRUSTED_CHAT_JSON:\n';
        const rows = JSON.parse(prompt.slice(prompt.lastIndexOf(marker) + marker.length));
        assert.ok(rows[0].messageIndex >= progress.batches[1][0].refs[0].index);
    }
});
