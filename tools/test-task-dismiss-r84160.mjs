// r84.160 · 任务中心里失败的记录可以「移除这条」：只移除这条页面内记录，完成的记录和草稿不受影响。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { harness } from './runtime-harness.mjs';

test('dismissFailedChatTask 只移除失败的那一条', async () => {
    const h = await harness({ messages: 2, bundle: true });
    const tasks = h.module('core/requestTasks.js');
    const coordinator = h.module('core/requestCoordinator.js');
    tasks.recentChatTasks.splice(0, tasks.recentChatTasks.length,
        { id: 'a', label: '聊天经历整理', outcome: 'failed', phase: 'failed' },
        { id: 'b', label: '相簿', outcome: 'done', phase: 'done' });
    assert.equal(coordinator.dismissFailedChatTask('b'), false, '完成的记录不走这里');
    assert.equal(coordinator.dismissFailedChatTask('missing'), false);
    assert.equal(coordinator.dismissFailedChatTask('a'), true);
    assert.deepEqual([...tasks.recentChatTasks.map(row => row.id)], ['b']);
});

test('失败卡片带「移除这条」，点击被主窗口路由到任务中心处理', async () => {
    const center = await readFile(new URL('../src/ui/taskCenter.js', import.meta.url), 'utf8');
    const routes = await readFile(new URL('../src/ui/overlayClickActions.js', import.meta.url), 'utf8');
    assert.match(center, /state === 'failed' \? dismissButton\(\{ taskId: row\.id \}\)/);
    assert.match(center, /item\.status === 'failed' \? dismissButton\(\{ queueId: item\.id \}\)/);
    assert.match(center, /dismissButton\(\{ floorFailure: true \}\)/);
    assert.match(center, /if \(action === 'task-dismiss'\)/);
    assert.match(routes, /action === 'task-dismiss'/);
    // 草稿卡片仍用自己的「放弃这份草稿」，不加移除按钮。
    const drafts = center.slice(center.indexOf('function draftCards()'), center.indexOf('export function failedTaskRetrySpec'));
    assert.equal(drafts.includes('task-dismiss'), false);
});
