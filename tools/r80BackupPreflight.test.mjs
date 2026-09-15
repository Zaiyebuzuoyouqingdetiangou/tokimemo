import test from 'node:test';
import assert from 'node:assert/strict';
import * as cache from '../src/core/cache.js';
import * as constants from '../src/core/constants.js';
import * as contextApi from '../src/core/context.js';
import * as diagnostics from '../src/core/backupDiagnostics.js';
import * as backup from '../src/archive/backupStore.js';
import { state } from '../src/core/state.js';

const clone = value => value == null ? value : structuredClone(value);

// Only host context and the durable backend are replaced. The public backup
// entry, archive normalization, source fences and diagnostic annotation are real.
function fixture(t) {
    const priorHost = Object.getOwnPropertyDescriptor(globalThis, 'SillyTavern');
    const maps = ['runtimeSessionCache', 'cacheHydrationErrors', 'cacheHydrationPromises',
        'pendingCompressedCacheWrites', 'cacheCommitSequences', 'cachePersistChains',
        'archiveCommitChains', 'archiveDeletionFences', 'archiveOverviewKnownArchives'];
    maps.forEach(key => state[key].clear());
    const records = new Map(), reads = [], writes = [];
    let readFailure = '', writeFailure = '', readHook = null;
    function characterContext(side = 'a') {
        const memory = { version: constants.MEMORY_VERSION, chatId: `preflight-${side}`, archiveRevision: `revision-${side}`,
            characterName: `角色-${side}`, userName: '用户', archiveName: '庭院回忆', createdAt: 1, updatedAt: 2,
            memories: [{ id: 'M001', title: '栽花', summary: '两人在庭院一起栽花。' }] };
        return { characterId: 0, groupId: null, name1: '用户', name2: memory.characterName, chatId: memory.chatId,
            characters: [{ name: memory.characterName, avatar: `preflight-${side}.png`, data: { name: memory.characterName } }],
            chat: [{ is_user: true, name: '用户', mes: '两人在庭院一起栽花。' }],
            chatMetadata: { [constants.MEMORY_KEY]: memory }, extensionSettings: {},
            getCurrentChatId() { return this.chatId; }, saveMetadataDebounced() {}, saveSettingsDebounced() {},
        };
    }
    const ctx = characterContext(); let current = ctx;
    globalThis.SillyTavern = { getContext: () => current };
    backup.setArchiveBackupBackendForTests({
        async read(entry) {
            reads.push(clone(entry));
            if (readHook) await readHook();
            if (readFailure) throw new DOMException('private fixture storage detail', readFailure);
            return clone(records.get(entry.entryId || contextApi.archiveIndexEntryId(entry)) || null);
        },
        async put(record, _expected, options = {}) {
            if (options.stillCurrent) assert.notEqual(options.stillCurrent(), false);
            writes.push(clone(record));
            if (writeFailure) throw new DOMException('private fixture storage detail', writeFailure);
            records.set(record.entryId, clone(record)); return true;
        },
        async delete() { throw new Error('Backup preflight must never delete a stored archive'); },
    });
    t.after(async () => {
        await Promise.allSettled([...state.archiveCommitChains.values(), ...state.cachePersistChains.values()]);
        for (const timer of state.cachePersistTimers.values()) clearTimeout(timer);
        state.cachePersistTimers.clear(); maps.forEach(key => state[key].clear());
        backup.setArchiveBackupBackendForTests(null);
        priorHost ? Object.defineProperty(globalThis, 'SillyTavern', priorHost) : delete globalThis.SillyTavern;
    });
    return { ctx, records, reads, writes, characterContext,
        setContext(value) { current = value; globalThis.SillyTavern = { getContext: () => current }; },
        failRead(name) { readFailure = name; }, failWrite(name) { writeFailure = name; },
        pauseRead() {
            let entered, release;
            const ready = new Promise(resolve => { entered = resolve; }); const gate = new Promise(resolve => { release = resolve; });
            readHook = async () => { entered(); await gate; };
            return { ready, release };
        },
    };
}

test('startup without a usable host, selected character, or single-character chat is a silent no-op', async t => {
    const f = fixture(t); const before = diagnostics.backupDiagnosticSnapshot();
    const invalid = [
        ['host missing', () => { delete globalThis.SillyTavern; }],
        ['host not ready', () => f.setContext(null)],
        ['host getter not ready', () => { globalThis.SillyTavern = { getContext() { throw new Error('Host still loading'); } }; }],
        ['character not selected', () => f.setContext({ ...f.ctx, characterId: undefined })],
        ['character explicitly empty', () => f.setContext({ ...f.ctx, characterId: null })],
        ['group chat', () => f.setContext({ ...f.ctx, groupId: 'group-a' })],
    ];
    for (const [label, setup] of invalid) {
        setup();
        assert.equal(await cache.ensureCurrentArchiveBackup(), false, label);
        assert.equal(f.reads.length, 0, `${label}: no storage read`);
        assert.equal(f.writes.length, 0, `${label}: no storage write`);
    }
    assert.deepEqual(diagnostics.backupDiagnosticSnapshot(), before, 'readiness does not become a storage-failure diagnostic');
});

test('an explicitly supplied invalid context is also ignored before storage access', async t => {
    const f = fixture(t);
    for (const invalid of [null, { ...f.ctx, characterId: null }, { ...f.ctx, characterId: undefined }, { ...f.ctx, groupId: 'group-a' }]) {
        f.setContext(invalid);
        assert.equal(await cache.ensureCurrentArchiveBackup(invalid), false);
    }
    assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0); assert.equal(f.records.size, 0);
});

test('skipping an unselected startup does not disable backup after a valid archive is opened', async t => {
    const f = fixture(t); f.setContext({ ...f.ctx, characterId: null });
    assert.equal(await cache.ensureCurrentArchiveBackup(), false);
    assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0);
    f.setContext(f.ctx); const original = clone(f.ctx.chatMetadata);
    assert.equal(await cache.ensureCurrentArchiveBackup(), true);
    assert.ok(f.reads.length > 0); assert.equal(f.writes.length, 1); assert.equal(f.records.size, 1);
    const stored = [...f.records.values()][0];
    assert.equal(stored.chatId, f.ctx.chatId); assert.equal(stored.archiveRevision, original[constants.MEMORY_KEY].archiveRevision);
    assert.deepEqual(stored.memory.memories, original[constants.MEMORY_KEY].memories);
    assert.deepEqual(f.ctx.chatMetadata, original);
});

for (const [name, stage, category, code] of [
    ['QuotaExceededError', 'write', 'quota', 'RMT_BACKUP_QUOTA'],
    ['SecurityError', 'read', 'security', 'RMT_BACKUP_SECURITY'],
]) {
    test(`a real ${name} remains a classified ${stage} failure after valid preflight`, async t => {
        const f = fixture(t); const original = clone(f.ctx.chatMetadata);
        if (stage === 'read') f.failRead(name); else f.failWrite(name);
        await assert.rejects(cache.ensureCurrentArchiveBackup(), error => {
            assert.deepEqual(diagnostics.backupFailureDiagnostic(error), { code, category, stage });
            assert.doesNotMatch(JSON.stringify(diagnostics.backupFailureDiagnostic(error)), /private fixture/);
            return true;
        });
        assert.ok(f.reads.length > 0); assert.equal(f.writes.length, stage === 'write' ? 1 : 0);
        assert.equal(f.records.size, 0); assert.deepEqual(f.ctx.chatMetadata, original);
    });
}

test('switching chats during an awaited backup read drops the old task and leaves the new archive writable', async t => {
    const f = fixture(t); const other = f.characterContext('b');
    const originalA = clone(f.ctx.chatMetadata), originalB = clone(other.chatMetadata);
    const paused = f.pauseRead(); const pending = cache.ensureCurrentArchiveBackup(); await paused.ready;
    f.setContext(other); paused.release();
    assert.equal(await pending, false); assert.equal(f.writes.length, 0); assert.equal(f.records.size, 0);
    assert.deepEqual(f.ctx.chatMetadata, originalA); assert.deepEqual(other.chatMetadata, originalB);
    assert.equal(await cache.ensureCurrentArchiveBackup(), true);
    assert.equal(f.writes.length, 1); assert.equal(f.writes[0].chatId, other.chatId);
    assert.equal(f.writes[0].memory.characterName, other.name2);
    assert.deepEqual(f.ctx.chatMetadata, originalA); assert.deepEqual(other.chatMetadata, originalB);
});
