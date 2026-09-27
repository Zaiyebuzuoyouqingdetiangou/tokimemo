// r84.157 · 自动留忆「每 1 楼」建档：延后保存只核对窗口里的那几楼。
// 窗口后面新增的楼不算变化；窗口里的楼被改、手动建档、旧条目（没有窗口记录）仍按原严格规则。
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './runtime-harness.mjs';

const CHAT_CHANGED = '聊天正文或聊天身份与原任务不一致';

function addFloor(h, text) {
    h.host.chat.push({ name: 'Char', is_user: false, mes: text });
}

function lastError(h) {
    return h.events.filter(item => typeof item === 'string').at(-1) || '';
}

// 已有一份档案的聊天（12 楼）。
async function archivedChat() {
    const h = await harness({ messages: 12, failAfter: 100, bundle: true });
    assert.equal((await h.repo.importCurrentChatMemory()).status, 'committed', JSON.stringify(h.events));
    await h.repo.discardCurrentArchiveImportRecovery(h.host);
    return h;
}

// 第 13 楼到点，自动每楼窗口建档。聊天存储这一次失败，结果留在延后队列里等保存。
async function pendingWindowSave({ manual = false } = {}) {
    const h = await archivedChat();
    const before = h.repo.getImportedMemory(h.host).archiveRevision;
    addFloor(h, '第十三楼，两人在河边散步。');
    h.host.saveMetadataDebounced = () => { throw new Error('metadata unavailable'); };
    const options = manual ? {} : { automatic: true, floorWindow: { start: 13, end: 13 } };
    const result = await h.repo.importCurrentChatMemory(options);
    assert.equal(result.status, 'failed');
    h.host.saveMetadataDebounced = () => {};
    assert.equal(h.repo.getImportedMemory(h.host).archiveRevision, before);
    const summary = h.repo.getCurrentArchiveImportRecoverySummary(h.host);
    assert.equal(summary?.awaitingCommit, true, JSON.stringify(summary));
    const pending = h.repo.exportCurrentArchiveImportProgress(h.host).pendingSave.memoryBank;
    // 与 test-legacy-archive-pending-save 相同：独立备份已写到这份候选，重试保存只会再写同一版本。
    h.module('archive/backupStore.js').setArchiveBackupBackendForTests({ read: async () => null, put: async record => {
        assert.equal(record.archiveRevision, pending.archiveRevision); return true;
    } });
    return { h, before, pending };
}

test('自动每楼窗口建档：保存前聊天多了一楼，延后保存成功', async () => {
    const { h, pending } = await pendingWindowSave();
    addFloor(h, '第十四楼，下一句已经进来了。');
    const calls = h.providerCalls.length;
    const result = await h.repo.continueCurrentArchiveImport();
    assert.equal(result.status, 'committed', lastError(h));
    const saved = h.repo.getImportedMemory(h.host);
    assert.equal(saved.archiveRevision, pending.archiveRevision);
    assert.ok(saved.memories.some(item => item.messageStart === 13));
    assert.equal(h.providerCalls.length, calls);
    assert.equal(h.repo.getCurrentArchiveImportRecoverySummary(h.host)?.awaitingCommit ?? false, false);
});

test('自动每楼窗口建档：窗口里那一楼被改，延后保存仍报聊天不一致', async () => {
    const { h, before } = await pendingWindowSave();
    h.host.chat[12].mes = '第十三楼被用户改写了。';
    addFloor(h, '第十四楼。');
    const result = await h.repo.continueCurrentArchiveImport();
    assert.equal(result.status, 'failed');
    assert.match(lastError(h), new RegExp(CHAT_CHANGED));
    assert.equal(h.repo.getImportedMemory(h.host).archiveRevision, before);
});

test('自动每楼窗口建档：窗口里那一楼被删，延后保存仍报聊天不一致', async () => {
    const { h, before } = await pendingWindowSave();
    h.host.chat.splice(12, 1);
    addFloor(h, '新的第十三楼。');
    const result = await h.repo.continueCurrentArchiveImport();
    assert.equal(result.status, 'failed');
    assert.match(lastError(h), new RegExp(CHAT_CHANGED));
    assert.equal(h.repo.getImportedMemory(h.host).archiveRevision, before);
});

test('手动建档完成后聊天多了一楼：延后保存仍按原规则报聊天不一致', async () => {
    const { h, before } = await pendingWindowSave({ manual: true });
    addFloor(h, '第十四楼。');
    const result = await h.repo.continueCurrentArchiveImport();
    assert.equal(result.status, 'failed');
    assert.match(lastError(h), new RegExp(CHAT_CHANGED));
    assert.equal(h.repo.getImportedMemory(h.host).archiveRevision, before);
});

test('没有窗口记录的旧队列条目：聊天多了一楼仍按原规则报聊天不一致', async () => {
    const { h, before } = await pendingWindowSave();
    const state = h.module('core/state.js').state;
    let stripped = 0;
    for (const bucket of state.deferredChatCommits.values()) {
        for (const item of bucket) {
            const progress = item?.memoryBank?.archiveImportProgress;
            if (item.kind === 'archive' && progress?.floorWindow) { delete progress.floorWindow; stripped += 1; }
        }
    }
    assert.equal(stripped, 1);
    addFloor(h, '第十四楼。');
    const result = await h.repo.continueCurrentArchiveImport();
    assert.equal(result.status, 'failed');
    assert.match(lastError(h), new RegExp(CHAT_CHANGED));
    assert.equal(h.repo.getImportedMemory(h.host).archiveRevision, before);
});

test('回到聊天时自动写回：窗口建档在聊天多一楼后照常写回，窗口被改则不写', async () => {
    {
        const { h, pending } = await pendingWindowSave();
        addFloor(h, '第十四楼。');
        await h.repo.flushDeferredCommitsForCurrentChat();
        assert.equal(h.repo.getImportedMemory(h.host).archiveRevision, pending.archiveRevision);
    }
    {
        const { h, before } = await pendingWindowSave();
        h.host.chat[12].mes = '第十三楼被用户改写了。';
        addFloor(h, '第十四楼。');
        await h.repo.flushDeferredCommitsForCurrentChat();
        assert.equal(h.repo.getImportedMemory(h.host).archiveRevision, before);
        assert.equal(h.repo.getCurrentArchiveImportRecoverySummary(h.host)?.awaitingCommit, true);
    }
});

// 续存容量待定批次（recoveryDrafts.js 里 saveCurrentArchivePendingResults 的两处）。
async function capacityPendingWindow() {
    const h = await archivedChat();
    addFloor(h, '第十三楼，两人在河边散步。');
    assert.equal((await h.repo.importCurrentChatMemory({ automatic: true, floorWindow: { start: 13, end: 13 } })).status,
        'committed', JSON.stringify(h.events));
    const bank = h.copy(h.repo.getImportedMemory(h.host));
    const sample = bank.memories.at(-1);
    bank.archiveImportProgress.nextBatch = 0;
    bank.archiveImportProgress.capacityPending = [(() => { const item = { ...sample, title: '待入档' }; delete item.id; return item; })()];
    h.host.chatMetadata.heartbeatMemoriesArchiveV3 = h.copy(bank);
    h.backups.clear();
    await h.reload();
    return { h, bank };
}

test('续存容量待定批次：窗口建档后聊天多了一楼，保存成功', async () => {
    const { h, bank } = await capacityPendingWindow();
    addFloor(h, '第十四楼。');
    const calls = h.providerCalls.length;
    const result = await h.repo.continueCurrentArchiveImport();
    assert.equal(result.status, 'committed', result.error?.message || lastError(h));
    const saved = h.repo.getImportedMemory(h.host);
    assert.equal(saved.memories.length, bank.memories.length + 1);
    assert.equal(saved.archiveImportProgress.capacityPending.length, 0);
    assert.equal(h.providerCalls.length, calls);
});

test('续存容量待定批次：窗口里那一楼被改，仍报聊天不一致', async () => {
    const { h, bank } = await capacityPendingWindow();
    h.host.chat[12].mes = '第十三楼被用户改写了。';
    addFloor(h, '第十四楼。');
    const result = await h.repo.continueCurrentArchiveImport();
    assert.equal(result.status, 'failed');
    assert.equal(result.error?.code, 'RMT_RECOVERY_INPUT_CHANGED');
    assert.equal(result.error?.archiveInputCategory, 'chat');
    assert.deepEqual(h.copy(h.repo.getImportedMemory(h.host)), h.copy(bank));
});
