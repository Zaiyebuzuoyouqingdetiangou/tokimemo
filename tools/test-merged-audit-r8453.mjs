import assert from 'node:assert/strict';
import test from 'node:test';
import { createPendingStore } from '../src/generation/mergedGeneration.js';

function storage() {
    const rows = new Map();
    return { getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, String(value)) };
}

const a = { chatId: 'same-chat', characterKey: 'card-A', archiveRevision: 'rev-A', archiveTargetEntryId: 'entry-A' };
const aNext = { ...a, archiveRevision: 'rev-A-next' };
const b = { chatId: 'same-chat', characterKey: 'card-B', archiveRevision: 'rev-B', archiveTargetEntryId: 'entry-B' };

test('pending results isolate two characters and revisions in one chat without deleting raw rows', () => {
    const pending = createPendingStore(storage());
    pending.write('same-chat', [
        { id: 'a', route: 'cabinet', kind: 'unsaved', label: 'A 的陈列柜', origin: a },
        { id: 'a-next', route: 'cabinet', kind: 'unsaved', label: 'A 新版陈列柜', origin: aNext },
        { id: 'b', route: 'cabinet', kind: 'unsaved', label: 'B 的陈列柜', origin: b },
    ]);
    assert.deepEqual(pending.readForOrigin(a).map(row => row.id), ['a']);
    assert.deepEqual(pending.readForOrigin(aNext).map(row => row.id), ['a-next']);
    assert.deepEqual(pending.readForOrigin(b).map(row => row.id), ['b']);
    assert.deepEqual(pending.read('same-chat').map(row => row.id), ['a', 'a-next', 'b']);
});

test('a scoped action only removes its exact id and origin', () => {
    const pending = createPendingStore(storage());
    pending.write('same-chat', [
        { id: 'same-id', route: 'cabinet', kind: 'unsaved', origin: a },
        { id: 'same-id', route: 'cabinet', kind: 'unsaved', origin: b },
    ]);
    pending.removeForOrigin(a, 'same-id');
    assert.deepEqual(pending.readForOrigin(a), []);
    assert.deepEqual(pending.readForOrigin(b).map(row => row.id), ['same-id']);
});

test('legacy records without complete origin stay in a non-attributed export channel', () => {
    const pending = createPendingStore(storage());
    pending.write('same-chat', [
        { id: 'legacy', route: 'cabinet', kind: 'unsaved', label: '旧草稿' },
        { id: 'a', route: 'cabinet', kind: 'unsaved', label: 'A 的陈列柜', origin: a },
        { id: 'b', route: 'cabinet', kind: 'unsaved', label: 'B 的陈列柜', origin: b },
    ]);
    assert.deepEqual(pending.readForOrigin(a).map(row => row.id), ['a']);
    assert.deepEqual(pending.readUnattributed('same-chat').map(row => row.id), ['legacy']);
    assert.deepEqual(JSON.parse(pending.exportUnattributed('same-chat')).records.map(row => row.id), ['legacy']);
});

test('durable pending storage reconstructs the exact scoped row after reopening', () => {
    const disk = storage();
    const first = createPendingStore(disk);
    first.upsert('same-chat', { id: 'durable', route: 'inbox', kind: 'unsaved', origin: a, session: { letters: [] } }, a);
    const reopened = createPendingStore(disk);
    assert.deepEqual(reopened.readForOrigin(a).map(row => row.id), ['durable']);
    assert.deepEqual(reopened.readForOrigin(b), []);
});
