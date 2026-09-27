// r84.159 · 档案里留着没做完的建档批次（例如失败后插件自动「先将成功分段入档」），
// 之后每一楼的自动建档接着做这批时，不再因为聊天后面多了几楼就秒失败。
// 这批自己用到的楼被改，仍然失败；手动继续的规则不变；聊天变长后「重试未完成分块」不再先花钱再拒绝保存。
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './runtime-harness.mjs';

function quietLedger(h) {
    h.module('archive/sourceLedger.js').setMemorySourceLedgerBackendForTests({ read: async () => null, write: async () => true, delete: async () => true });
}

function addFloor(h, text) {
    h.host.chat.push({ name: 'Char', is_user: false, mes: text });
}

// 已有档案；一次非自动建档 3 块里第 3 块失败，插件自动把前 2 块入档（用户没点任何按钮）。
async function halfSavedBatch() {
    const h = await harness({ messages: 6, failAfter: 100, bundle: true, failCode: 'RMT_JSON_NOT_FOUND', autoPartial: true });
    quietLedger(h);
    assert.equal((await h.repo.importCurrentChatMemory()).status, 'committed');
    await h.repo.discardCurrentArchiveImportRecovery(h.host);
    for (let i = 7; i <= 18; i += 1) addFloor(h, `事件${i}散步。` + '夏'.repeat(5990));
    h.allow(h.providerCalls.length + 2);
    assert.equal((await h.repo.importCurrentChatMemory()).status, 'failed');
    h.allow(1000);
    const bank = h.copy(h.repo.getImportedMemory(h.host));
    const progress = bank.archiveImportProgress;
    assert.equal(progress.nextBatch, 0);
    assert.deepEqual([...progress.partialParts], [0, 1]);
    assert.ok(bank.archivePartialDraft);
    return { h, bank };
}

// 已有档案，建档分成两批，第二批还没做（不涉及失败）。
async function pendingSecondBatch() {
    const h = await harness({ messages: 6, failAfter: 100, bundle: true, batchChars: 13000 });
    quietLedger(h);
    assert.equal((await h.repo.importCurrentChatMemory()).status, 'committed');
    await h.repo.discardCurrentArchiveImportRecovery(h.host);
    const progress = h.repo.getImportedMemory(h.host).archiveImportProgress;
    assert.equal(progress.nextBatch, 1);
    assert.equal(progress.batches.length, 2);
    return { h };
}

test('半存批次：聊天多一楼后，下一楼自动建档接着把这批做完，只补发没做完的那块', async () => {
    const { h } = await halfSavedBatch();
    addFloor(h, '第十九楼。');
    const calls = h.providerCalls.length;
    const result = await h.repo.importCurrentChatMemory({ automatic: true, floorWindow: { start: 19, end: 19 } });
    assert.equal(result.status, 'committed', result.error?.message);
    assert.equal(h.providerCalls.length - calls, 1);
    const progress = h.repo.getImportedMemory(h.host).archiveImportProgress;
    assert.equal(progress.nextBatch, 1);
    assert.equal(h.repo.getImportedMemory(h.host).coverageMode, 'batched-complete');
});

test('半存批次：这批用到的楼被改，下一楼自动建档仍然失败，不发请求', async () => {
    const { h, bank } = await halfSavedBatch();
    h.host.chat[16].mes = '第十七楼被用户改写了。';
    addFloor(h, '第十九楼。');
    const calls = h.providerCalls.length;
    const result = await h.repo.importCurrentChatMemory({ automatic: true, floorWindow: { start: 19, end: 19 } });
    assert.equal(result.status, 'failed');
    assert.equal(result.error?.code, 'RMT_RECOVERY_INPUT_CHANGED');
    assert.equal(h.providerCalls.length, calls);
    assert.equal(h.repo.getImportedMemory(h.host).archiveRevision, bank.archiveRevision);
});

test('未做的第二批：聊天多一楼后，下一楼自动建档接着做这一批', async () => {
    const { h } = await pendingSecondBatch();
    addFloor(h, '第七楼。');
    const result = await h.repo.importCurrentChatMemory({ automatic: true, floorWindow: { start: 7, end: 7 } });
    assert.equal(result.status, 'committed', result.error?.message);
    const bank = h.repo.getImportedMemory(h.host);
    assert.equal(bank.archiveImportProgress.nextBatch, 2);
    assert.equal(bank.coverageMode, 'batched-complete');
});

test('手动「继续下一批」在聊天多一楼后，行为与修复前相同（按原任务捕获的来源继续并保存）', async () => {
    const { h } = await pendingSecondBatch();
    addFloor(h, '第七楼。');
    const calls = h.providerCalls.length;
    const result = await h.repo.continueCurrentArchiveImport();
    assert.equal(result.status, 'committed', result.error?.message);
    assert.equal(h.providerCalls.length - calls, 2);
    assert.equal(h.repo.getImportedMemory(h.host).archiveImportProgress.nextBatch, 2);
});

test('半存批次：聊天多一楼后手动「重试未完成分块」，仍报聊天不一致，但在发请求之前就停下', async () => {
    const { h, bank } = await halfSavedBatch();
    addFloor(h, '第十九楼。');
    const calls = h.providerCalls.length;
    const result = await h.repo.continueCurrentArchiveImport();
    assert.equal(result.status, 'failed');
    assert.equal(result.error?.code, 'RMT_RECOVERY_INPUT_CHANGED');
    assert.equal(result.error?.archiveInputCategory, 'chat');
    assert.equal(h.providerCalls.length, calls, '不能先花钱再拒绝保存');
    assert.equal(h.repo.getImportedMemory(h.host).archiveRevision, bank.archiveRevision);
});

test('半存批次：先「放弃整理草稿」再到下一楼，自动建档照样只补发没做完的那块', async () => {
    const { h } = await halfSavedBatch();
    assert.equal(await h.repo.discardCurrentArchiveImportRecovery(h.host), true);
    addFloor(h, '第十九楼。');
    const calls = h.providerCalls.length;
    const result = await h.repo.importCurrentChatMemory({ automatic: true, floorWindow: { start: 19, end: 19 } });
    assert.equal(result.status, 'committed', result.error?.message);
    assert.equal(h.providerCalls.length - calls, 1);
    assert.equal(h.repo.getImportedMemory(h.host).coverageMode, 'batched-complete');
});
