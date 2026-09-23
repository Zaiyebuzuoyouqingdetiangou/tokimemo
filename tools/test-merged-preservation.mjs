import test from 'node:test';
import assert from 'node:assert/strict';
import { createPendingStore, runMergedBatch, runMergedRepair } from '../src/generation/mergedGeneration.js';
import { resolveStoryIdentities } from '../src/core/participants.js';

const storage = () => {
    const values = new Map();
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const task = { route: 'cabinet', mode: 'cabinet', key: 'cabinet', label: '陈列柜', accept: raw => raw };
test('a new failed batch preserves an older checked result on the same page', async () => {
    const pending = createPendingStore(storage());
    pending.write('chat', [{ id: 'old', ...task, accept: undefined, kind: 'unsaved', session: { title: '已付费的旧成果' } }]);
    await runMergedBatch({ tasks: [task], request: async () => ({ modules: { cabinet: null } }), save: async () => {}, pending, chatId: 'chat' });
    assert.equal(pending.read('chat').length, 2);
    assert.equal(pending.read('chat').find(row => row.id === 'old').session.title, '已付费的旧成果');
});
test('repair removes only its exact task, without another provider call', async () => {
    const pending = createPendingStore(storage());
    pending.write('chat', ['first', 'second'].map(id => ({ id, route: 'cabinet', mode: 'cabinet', kind: 'unsaved', session: { id } })));
    await runMergedRepair({ item: pending.read('chat')[0], pending, chatId: 'chat', save: async () => {}, request: () => assert.fail('save-only requested a model') });
    assert.deepEqual(pending.read('chat').map(row => row.id), ['second']);
});
test('null modules reports the merge contract error', async () => {
    await assert.rejects(runMergedBatch({ tasks: [task], request: async () => ({ modules: null }), save: async () => {} }), { code: 'RMT_MERGED_SHAPE' });
});
test('corrupt storage is not treated as empty and overwritten', () => {
    const disk = storage(); disk.setItem('heartbeatMemoriesMergedPendingV1', '{broken');
    const pending = createPendingStore(disk);
    assert.throws(() => pending.write('chat', []), { code: 'RMT_MERGED_STORAGE' });
    assert.equal(disk.getItem('heartbeatMemoriesMergedPendingV1'), '{broken');
});
test('explicit user identity is never inferred from NPC co-occurrence', () => {
    const bank = { characterName: '角色甲', userName: '真实用户', memories: [
        { participants: ['角色甲', '高频NPC'] }, { participants: ['角色甲', '高频NPC'] }, { participants: ['角色甲', '真实用户'] } ] };
    const identities = resolveStoryIdentities(bank, { name1: 'Persona别名', name2: '角色甲' });
    assert.equal(identities.userDisplay, '真实用户');
    assert.equal(identities.userAliases.includes('高频NPC'), false);
    assert.equal(resolveStoryIdentities({ ...bank, userName: '' }, {}).userDisplay, '{{user}}');
});
