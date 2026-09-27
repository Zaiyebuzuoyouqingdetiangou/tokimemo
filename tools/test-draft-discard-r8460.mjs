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

test('explicit discard clears a stale active archive draft and fences its late callback, preserving another chat', async () => {
    storage();
    const ticket = await start();
    const otherOrigin = { ...origin, chatId: 'other' };
    const other = await start(otherOrigin);
    await drafts.discardArchiveRecovery(origin);
    assert.equal(drafts.listArchiveRecoveryDrafts(origin).length, 0);
    assert.equal(drafts.listArchiveRecoveryDrafts(otherOrigin).length, 1);
    assert.equal(ticket.assertCurrent(), false);
    await assert.rejects(recovery.persistGenerationRecovery(ticket.handle));
    drafts.releaseArchiveRecovery(ticket);
    await drafts.flushArchiveRecovery(origin);
    await drafts.hydrateArchiveRecovery(origin, 'import', { force: true });
    assert.equal(drafts.listArchiveRecoveryDrafts(origin).length, 0);
    drafts.releaseArchiveRecovery(other);
    await drafts.flushArchiveRecovery(otherOrigin);
});

test('failed discard restores the draft but does not reauthorize the old callback; explicit retry can resume it', async () => {
    const backend = storage();
    const ticket = await start();
    backend.fail = true;
    await assert.rejects(drafts.discardArchiveRecovery(origin));
    assert.equal(drafts.listArchiveRecoveryDrafts(origin).length, 1);
    assert.equal(drafts.listArchiveRecoveryDrafts(origin)[0].active, false);
    assert.equal(ticket.assertCurrent(), false);
    backend.fail = false;
    await assert.rejects(drafts.retainCompletedArchiveProfile(ticket, {}, {}));
    await assert.rejects(drafts.retainCompletedArchiveImport(ticket, {}));
    assert.equal(drafts.stageArchiveRecoveryCommit(ticket, 'late'), false);
    assert.equal(drafts.finishArchiveProfileRecovery(ticket, origin), false);
    const resumed = await start(origin, { continueApproved: true });
    assert.equal(resumed.assertCurrent(), true);
    assert.equal(ticket.assertCurrent(), false);
    drafts.releaseArchiveRecovery(ticket);
    assert.equal(drafts.listArchiveRecoveryDrafts(origin)[0].active, true);
    drafts.releaseArchiveRecovery(resumed);
    await drafts.flushArchiveRecovery(origin);
});
