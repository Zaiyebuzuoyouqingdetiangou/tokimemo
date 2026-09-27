// r84.162 · 读取范围设成「最近 N 楼」时，档案里没做完的旧批次有楼滑出了范围，
// 下一楼自动建档仍能接着做完；旧批次里的楼被改，仍然停下，不发请求。
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './runtime-harness.mjs';

async function slidOutBatch() {
    const h = await harness({ messages: 6, failAfter: 100, bundle: true, failCode: 'RMT_JSON_NOT_FOUND', autoPartial: true });
    h.module('archive/sourceLedger.js').setMemorySourceLedgerBackendForTests({ read: async () => null, write: async () => true, delete: async () => true });
    h.host.extensionSettings.heartbeatMemories.chatReadRange = { mode: 'recent', recent: 10, includeHidden: false };
    assert.equal((await h.repo.importCurrentChatMemory()).status, 'committed');
    await h.repo.discardCurrentArchiveImportRecovery(h.host);
    for (let i = 7; i <= 18; i += 1) h.host.chat.push({ name: i % 2 ? 'User' : 'Char', is_user: i % 2 === 1, mes: `事件${i}。` + '夏'.repeat(5990) });
    h.allow(h.providerCalls.length + 2);
    assert.equal((await h.repo.importCurrentChatMemory()).status, 'failed');
    h.allow(1000);
    assert.equal(h.repo.getImportedMemory(h.host).archiveImportProgress.nextBatch, 0);
    // 新聊的楼把旧批次最早的几楼挤出「最近 10 楼」。
    for (const [user, text] of [[true, '你好。'], [false, '第二十楼。'], [true, '再来。'], [false, '第二十二楼。']]) {
        h.host.chat.push({ name: user ? 'User' : 'Char', is_user: user, mes: text });
    }
    return h;
}

test('旧批次有楼滑出最近 N 楼：下一楼自动建档把这批做完', async () => {
    const h = await slidOutBatch();
    const result = await h.repo.importCurrentChatMemory({ automatic: true, floorWindow: { start: 21, end: 22, latestAssistant: true, interval: 1 } });
    assert.equal(result.status, 'committed', result.error ? `${result.error.code} ${result.error.archiveInputCategory}` : '');
    assert.equal(h.repo.getImportedMemory(h.host).archiveImportProgress.nextBatch, 1);
});

test('旧批次滑出范围的楼被改：仍然停下，不发请求', async () => {
    const h = await slidOutBatch();
    const before = h.repo.getImportedMemory(h.host).archiveRevision;
    h.host.chat[9].mes = '第十楼被改写了。'; // 第 10 楼在旧批次里，已滑出最近 10 楼
    const calls = h.providerCalls.length;
    const result = await h.repo.importCurrentChatMemory({ automatic: true, floorWindow: { start: 21, end: 22, latestAssistant: true, interval: 1 } });
    assert.equal(result.status, 'failed');
    assert.equal(result.error?.code, 'RMT_RECOVERY_INPUT_CHANGED');
    assert.equal(h.providerCalls.length, calls);
    assert.equal(h.repo.getImportedMemory(h.host).archiveRevision, before);
});
