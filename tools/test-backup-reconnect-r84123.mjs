import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { preparationFixture } from './preparation-harness-r8481.mjs';

// Browser IndexedDB is the only substitute. A transaction is inactive as soon as a
// request callback returns, the strictest reading of when auto-commit may happen.
function fakeIndexedDb(behaviours) {
    const records = new Map(), databases = [];
    const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const makeDb = behaviour => {
        const db = { closed: 0, transactions: 0, objectStoreNames: { contains: () => true }, close() { db.closed += 1; },
            transaction(name, mode) {
                if (behaviour === 'closed' || db.closed) throw new DOMException('The database connection is closing.', 'InvalidStateError');
                db.transactions += 1;
                let pending = 0, active = true, finished = false;
                const tx = { mode, error: null, abort() {
                    if (finished) return;
                    finished = true; tx.error = new DOMException('The transaction was aborted.', 'AbortError');
                    setTimeout(() => tx.onabort?.(), 0);
                } };
                setTimeout(() => { if (!pending) active = false; }, 0);
                const request = run => {
                    if (!active || finished) throw new DOMException('The transaction is inactive or finished.', 'TransactionInactiveError');
                    pending += 1;
                    const handle = {};
                    setTimeout(() => {
                        if (finished) return;
                        active = true;
                        if (behaviour === 'lost') {
                            handle.error = new DOMException('Connection to Indexed Database server lost. Refresh the page to try again', 'UnknownError');
                            handle.onerror?.();
                            tx.abort();
                        } else { handle.result = run(); handle.onsuccess?.(); }
                        active = false; pending -= 1;
                        if (!pending && !finished) { finished = true; setTimeout(() => tx.oncomplete?.(), 0); }
                    }, 0);
                    return handle;
                };
                const store = {
                    get: id => request(() => copy(records.get(id) ?? null)),
                    index: () => ({ getAll: chatId => request(() => [...records.values()].filter(row => row.chatId === chatId).map(copy)) }),
                    put: value => request(() => { records.set(value.entryId, copy(value)); return value.entryId; }),
                    delete: id => request(() => { records.delete(id); }),
                };
                tx.objectStore = () => store;
                return tx;
            } };
        return db;
    };
    return { records, databases, open() {
        const request = {}, db = makeDb(behaviours[databases.length] || 'ok');
        databases.push(db);
        setTimeout(() => { request.result = db; request.onsuccess?.(); }, 0);
        return request;
    } };
}

async function backupFixture(behaviours) {
    const f = await preparationFixture();
    f.sandbox.Blob = Blob;
    vm.runInContext('structuredClone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))', f.sandbox);
    const cache = await f.api('core/cache.js'), backup = await f.api('archive/backupStore.js');
    backup.setArchiveBackupBackendForTests(null);
    const memory = { version: 3, chatId: f.host.chatId, archiveRevision: 'rev1', characterName: '岚', userName: '阿宁',
        memories: [{ id: 'M001', title: '礼物', summary: '岚送给阿宁一封信', anchors: ['一封信'] }] };
    f.host.chatMetadata.heartbeatMemoriesArchiveV3 = memory;
    const idb = fakeIndexedDb(behaviours);
    f.sandbox.indexedDB = idb;
    return { f, backup, idb, memory, entry: cache.archiveBackupEntryForContext(f.host, memory) };
}

test('a backup connection closed by the browser is replaced instead of failing every later save', async () => {
    const x = await backupFixture(['closed', 'ok']);
    const state = await x.backup.readArchiveBackupState(x.entry);
    assert.equal(state.deleted, false);
    assert.equal(state.record, null);
    assert.equal(x.idb.databases.length, 2);
    assert.equal(x.idb.databases[0].closed, 1);
});

test('a read that loses the IndexedDB server connection is read again on a fresh connection', async () => {
    const x = await backupFixture(['lost', 'ok']);
    const state = await x.backup.readArchiveBackupState(x.entry);
    assert.equal(state.record, null);
    assert.equal(x.idb.databases.length, 2);
    assert.equal(x.idb.databases[0].closed, 1);
});

test('a connection that stays lost still reports the classified backup failure', async () => {
    const x = await backupFixture(['lost', 'lost']);
    await assert.rejects(x.backup.readArchiveBackupState(x.entry), error => {
        assert.equal(error.code, 'RMT_BACKUP_TRANSACTION');
        assert.equal(error.backupStage, 'read');
        return true;
    });
    assert.equal(x.idb.databases.length, 2);
});

test('the legacy chat lookup is issued inside the first read callback', async () => {
    const x = await backupFixture(['ok']);
    const state = await x.backup.readArchiveBackupState(x.entry);
    assert.equal(state.record, null);
    assert.equal(x.idb.databases.length, 1);
});

test('a save after the browser closed the connection writes once and reads back', async () => {
    const x = await backupFixture(['closed', 'ok']);
    const saved = await x.backup.seedArchiveBackup(x.entry, x.memory, null);
    assert.equal(saved.archiveRevision, 'rev1');
    assert.equal(x.idb.records.size, 1);
    const reread = await x.backup.readArchiveBackup(x.entry);
    assert.equal(reread.memory.archiveRevision, 'rev1');
    assert.equal(x.idb.databases.length, 2);
});

test('a close event drops the cached connection so the next read reopens', async () => {
    const x = await backupFixture(['ok', 'ok']);
    await x.backup.readArchiveBackupState(x.entry);
    x.idb.databases[0].onclose();
    assert.equal(x.idb.databases[0].closed, 1);
    await x.backup.readArchiveBackupState(x.entry);
    assert.equal(x.idb.databases.length, 2);
    assert.equal(x.idb.databases[1].transactions, 1);
});
