import assert from 'node:assert/strict';
import test from 'node:test';
import * as summary from '../src/archive/summaryPreference.js';
import * as lease from '../src/autoMemory/instanceLease.js';

function memoryCompare() {
    const rows = new Map();
    return async (key, decide) => {
        const next = decide(rows.get(key) || null);
        if (next === undefined) return true;
        if (next === null) rows.delete(key);
        else rows.set(key, next);
        return true;
    };
}

test('a new plugin summary is archived instead of rereading the same floors', () => {
    const external = { sources: [{ id: 'sillytavern-memory', count: 1 }, { id: 'world-info', count: 4 }], records: [] };
    assert.equal(summary.pluginSummaryCount(external), 1);
    assert.equal(summary.archiveSourceForDue({ summaryChanged: true, summaryCount: 1 }), 'summary');
    assert.equal(summary.archiveSourceForDue({ summaryChanged: false, summaryCount: 1 }), 'floors');
    assert.equal(summary.archiveSourceForDue({ summaryChanged: true, summaryCount: 0 }), 'floors');
});

test('an indexedDB lease is exclusive until it expires and a takeover sees finished steps', async () => {
    const compare = memoryCompare();
    const first = await lease.claimWith(compare, {
        chatId: 'chat-1', dueFloor: 10, archiveRevision: 'rev-1', owner: 'tab-a',
    }, 1000);
    assert.equal(first.granted, true);
    assert.equal(first.takeover, false);
    assert.equal(first.lease.dueFloor, 10);
    const blocked = await lease.claimWith(compare, {
        chatId: 'chat-1', dueFloor: 10, archiveRevision: 'rev-1', owner: 'tab-b',
    }, 1000 + lease.LEASE_TTL_MS - 1);
    assert.equal(blocked.granted, false);
    const renewed = await lease.renewWith(compare, first.lease, 1000 + 8000);
    assert.equal(renewed.owner, 'tab-a');
    assert.equal(renewed.expiresAt > 1000 + lease.LEASE_TTL_MS, true);
    const stolen = await lease.claimWith(compare, {
        chatId: 'chat-1', dueFloor: 10, archiveRevision: 'rev-1', owner: 'tab-b',
    }, renewed.expiresAt + 1);
    assert.equal(stolen.granted, true);
    assert.equal(stolen.takeover, true);
    const done = {
        plan: { activeDrawTicketId: 'drawticket1' },
        drawTickets: [{ id: 'drawticket1', status: 'running' }],
        modulePlan: { steps: [{ status: 'completed' }, { status: 'completed' }] },
    };
    assert.equal(lease.takeoverDecision(done), 'skip');
    assert.equal(lease.takeoverDecision({
        modulePlan: { steps: [{ status: 'completed' }, { status: 'pending' }] },
    }), 'resume');
    await lease.releaseWith(compare, stolen.lease);
    const after = await lease.claimWith(compare, {
        chatId: 'chat-1', dueFloor: 15, archiveRevision: 'rev-2', owner: 'tab-a',
    }, stolen.lease.expiresAt);
    assert.equal(after.granted, true);
    assert.equal(after.takeover, false);
});

test('a native group chat is refused in one sentence', () => {
    assert.equal(lease.groupChatNotice({ groupId: 'group-1' }), '心迹回廊当前只支持单角色聊天，群聊不会自动留忆。');
    assert.equal(lease.groupChatNotice({}), '');
});
