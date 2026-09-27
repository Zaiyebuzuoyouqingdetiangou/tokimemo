// r84.94 重构清单 2-1：点“仅重试档案简介”时，resumeArchiveImportProfile 引用了不存在的 completedOnly，
// 在把草稿标成“正在处理”之后抛 ReferenceError，之后“放弃整理草稿”一直提示“这一段正在生成”。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as drafts from '../src/archive/importRecovery.js';
import * as recovery from '../src/generation/recovery.js';
import { setLocalRecoveryBackendForTests } from '../src/core/localRecoveryStore.js';

function storage() {
    const rows = new Map();
    const backend = { fail: false,
        read: async key => structuredClone(rows.get(key) || null),
        compare: async (key, revision, payload) => {
            if (backend.fail) throw new Error('storage unavailable');
            assert.equal(rows.get(key)?.revision || 0, revision);
            rows.set(key, { key, revision: revision + 1, payload: structuredClone(payload) });
            return revision + 1;
        },
    };
    setLocalRecoveryBackendForTests(backend);
    drafts.resetArchiveRecoveryMemoryForTests();
    return backend;
}
const origin = { characterKey: 'card', characterId: '1', characterAvatar: 'card.png', chatId: 'chat', archiveRevision: 'r1' };
const start = (o = origin, extra = {}) => drafts.beginArchiveRecovery({ origin: o, sourceIdentity: 'source',
    sourceFragments: ['original'], settingsIdentity: 'settings', ...extra });


test('resuming an archive profile draft returns a ticket and leaves the draft discardable', async () => {
    storage();
    const ticket = await start();
    await drafts.retainCompletedArchiveImport(ticket, { chatId: 'chat', archiveRevision: 'r1', characterName: 'c', userName: 'u', memories: [] }, { profilePending: true });
    drafts.releaseArchiveRecovery(ticket);
    await drafts.flushArchiveRecovery(origin);
    const row = drafts.listArchiveRecoveryDrafts(origin)[0];
    assert.ok(row?.draftId, 'profile draft is listed');
    const resumed = await drafts.resumeArchiveImportProfile({ origin, draftId: row.draftId, settingsIdentity: 'settings' });
    assert.equal(resumed.completedOnly, false, 'profile resume is not a completed-only import');
    assert.equal(drafts.listArchiveRecoveryDrafts(origin)[0].active, true);
    drafts.releaseArchiveRecovery(resumed);
    assert.equal(drafts.listArchiveRecoveryDrafts(origin)[0].active, false, 'released after the request ends');
    await drafts.discardArchiveRecovery(origin);
    assert.equal(drafts.listArchiveRecoveryDrafts(origin).length, 0, 'user can discard it afterwards');
});
