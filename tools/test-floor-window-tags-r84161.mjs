// r84.161 · 每楼自动建档读窗口时，按设置去掉排除的标签（默认 thinking、UpdateVariable），
// 与整段聊天快照的读法一致。否则窗口片段的哈希对不上快照，每一楼都秒报「聊天正文或聊天身份不一致」，
// 而且被排除的标签内容还会被送去建档。
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './runtime-harness.mjs';

const THINK = '内心独白不该进档案';

async function taggedFloor() {
    const h = await harness({ messages: 12, failAfter: 1000, bundle: true });
    h.module('archive/sourceLedger.js').setMemorySourceLedgerBackendForTests({ read: async () => null, write: async () => true, delete: async () => true });
    assert.equal((await h.repo.importCurrentChatMemory()).status, 'committed');
    await h.repo.discardCurrentArchiveImportRecovery(h.host);
    h.host.chat.push({ name: 'User', is_user: true, mes: '我们去河边走走吧。' });
    h.host.chat.push({ name: 'Char', is_user: false,
        mes: `<thinking>${THINK}</thinking>\n他点点头，\n\n两人沿着河堤慢慢走。\n<UpdateVariable>好感度+1</UpdateVariable>` });
    return h;
}

test('窗口里的楼带有排除标签：自动建档成功，不报聊天不一致', async () => {
    const h = await taggedFloor();
    const calls = h.providerCalls.length;
    const result = await h.repo.importCurrentChatMemory({ automatic: true, floorWindow: { start: 13, end: 14, latestAssistant: true, interval: 1 } });
    assert.equal(result.status, 'committed', result.error ? `${result.error.code} ${result.error.archiveInputCategory}` : '');
    assert.ok(h.providerCalls.length > calls);
});

test('窗口里被排除的标签内容不会送去建档', async () => {
    const h = await taggedFloor();
    const calls = h.providerCalls.length;
    await h.repo.importCurrentChatMemory({ automatic: true, floorWindow: { start: 13, end: 14, latestAssistant: true, interval: 1 } });
    const sent = JSON.stringify(h.providerCalls.slice(calls));
    assert.ok(sent.includes('两人沿着河堤慢慢走'), '正文要送去');
    assert.equal(sent.includes(THINK), false, 'thinking 里的内容不该送去');
    assert.equal(sent.includes('好感度+1'), false, 'UpdateVariable 里的内容不该送去');
});
