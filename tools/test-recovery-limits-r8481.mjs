import test from 'node:test';
import assert from 'node:assert/strict';
import * as recovery from '../src/generation/recovery.js';
import * as feedback from '../src/generation/recoveryFeedback.js';
import * as drafts from '../src/archive/importRecovery.js';
import * as ledger from '../src/archive/sourceLedger.js';
import * as worldInfo from '../src/archive/worldInfoSources.js';
import { previewMemoryFile, assertMemoryFilePreviewBinding } from '../src/archive/memoryFileImport.js';
import { setLocalRecoveryBackendForTests } from '../src/core/localRecoveryStore.js';

const origin = { characterKey: 'limits-card', characterId: '1', characterAvatar: 'limits.png', chatId: 'limits-chat', archiveRevision: 'r1' };
const settingsIdentity = 'unchanged settings';
const create = extra => recovery.createGenerationRecovery({ origin, mode: 'inbox', settingsIdentity, save: async () => true, ...extra });

function storage() {
    const rows = new Map();
    const backend = { fail: false,
        read: async key => structuredClone(rows.get(key) || null),
        compare: async (key, revision, payload) => {
            if (backend.fail) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
            assert.equal(rows.get(key)?.revision || 0, revision);
            rows.set(key, { key, revision: revision + 1, payload: structuredClone(payload) });
            return revision + 1;
        },
    };
    setLocalRecoveryBackendForTests(backend);
    drafts.resetArchiveRecoveryMemoryForTests();
    return { rows, backend };
}
const start = (o = origin, extra = {}) => drafts.beginArchiveRecovery({ origin: o, sourceIdentity: 'source',
    sourceFragments: ['original'], settingsIdentity, ...extra });

test('a source snapshot beyond 1.2 million characters saves and resumes byte-for-byte', async () => {
    const contentSnapshot = { cardFields: { description: '原始资料'.repeat(310000) }, memoryBank: { memories: [] } };
    let stored;
    const first = await create({ contentSnapshot, save: async value => { stored = structuredClone(value); return true; } });
    await recovery.persistGenerationRecovery(first);
    assert.deepEqual(recovery.readGenerationContentSnapshot(stored), contentSnapshot);
    const resumed = await create({ existing: stored, continueRequested: true });
    assert.deepEqual(recovery.readGenerationContentSnapshot(resumed), contentSnapshot);
    assert.deepEqual(recovery.exportGenerationRecovery(stored).journal.contentSnapshot, contentSnapshot);
});

test('received segments beyond 600k and a journal beyond 1.8m remain complete and replay without requests', async () => {
    let stored;
    const handle = await create({ save: async value => { stored = structuredClone(value); return true; } });
    recovery.attachGenerationRecovery(origin, handle);
    const body = '正文'.repeat(310000);
    for (let i = 0; i < 3; i++) {
        await recovery.withRecoverySegment(`prompt ${i}`, { origin, mode: 'inbox', taskKey: `mail:${i}` }, value => value,
            async (_prompt, _options, accepted) => { const value = { body, index: i }; await accepted(value); return value; });
    }
    assert.ok(JSON.stringify(stored).length > 1800000);
    assert.equal(recovery.generationRecoverySummary(stored).completed, 3);
    const resumed = await create({ existing: stored, continueRequested: true });
    recovery.attachGenerationRecovery(origin, resumed);
    for (let i = 0; i < 3; i++) {
        const value = await recovery.withRecoverySegment(`prompt ${i}`, { origin, mode: 'inbox', taskKey: `mail:${i}` }, value => value,
            () => assert.fail('saved success must not trigger a request'));
        assert.equal(value.body, body);
        assert.equal(value.index, i);
    }
});

test('a frozen request beyond 1.2m characters is replayed exactly and never replaced by live content', async () => {
    let stored;
    const handle = await create({ contentSnapshot: { version: 1 }, save: async value => { stored = structuredClone(value); return true; } });
    recovery.attachGenerationRecovery(origin, handle);
    const prompt = '请求'.repeat(610000);
    const options = { origin, mode: 'inbox', taskKey: 'large-request', contextEnvelope: 'original envelope' };
    await assert.rejects(recovery.withRecoverySegment(prompt, options, value => value, async (_prompt, request) => {
        await recovery.freezeRecoveryRequestPayload(request, { actualPrompt: `original envelope\n${prompt}`, contentSettings: {} });
        throw Object.assign(new Error('network'), { code: 'RMT_CONNECTION_NETWORK' });
    }));
    const resumed = await create({ existing: stored, continueRequested: true, save: async value => { stored = structuredClone(value); return true; } });
    recovery.attachGenerationRecovery(origin, resumed);
    await recovery.withRecoverySegment('changed live request', options, value => value, async (effective, request, accepted) => {
        assert.equal(effective, prompt);
        const payload = await recovery.freezeRecoveryRequestPayload(request, { actualPrompt: 'must not replace original', contentSettings: {} });
        assert.equal(payload.actualPrompt, `original envelope\n${prompt}`);
        await accepted({ body: 'success' });
    });
    assert.equal(recovery.generationRecoverySummary(stored).completed, 1);
});

test('more than 128 validated segments are retained and exportable', async () => {
    const handle = await create();
    recovery.attachGenerationRecovery(origin, handle);
    for (let i = 0; i < 130; i++) await recovery.withRecoverySegment(`prompt ${i}`, { origin, mode: 'inbox', taskKey: `mail:${i}` }, value => value,
        async (_prompt, _options, accepted) => { const value = { index: i }; await accepted(value); return value; });
    const journal = recovery.generationRecoverySnapshot(handle);
    assert.equal(recovery.generationRecoverySummary(journal).completed, 130);
    assert.equal(recovery.exportGenerationRecovery(journal).journal.segments.length, 130);
    assert.equal((await create({ existing: journal, continueRequested: true })).journal.segments.length, 130);
});

test('more than four parked drafts and drafts from other chats remain saved and independently reloadable', async () => {
    storage();
    for (let i = 0; i < 6; i++) {
        const ticket = await start(origin, { sourceIdentity: `source ${i}` });
        drafts.releaseArchiveRecovery(ticket);
        await drafts.flushArchiveRecovery(origin);
        if (i < 5) { assert.equal(drafts.parkArchiveRecovery(origin), true); await drafts.flushArchiveRecovery(origin); }
    }
    const other = { ...origin, chatId: 'another-chat' };
    const otherTicket = await start(other);
    drafts.releaseArchiveRecovery(otherTicket);
    await drafts.flushArchiveRecovery(other);
    const before = drafts.exportArchiveRecovery(origin);
    assert.equal(before.length, 6);
    assert.equal(drafts.exportArchiveRecovery(other).length, 1);
    drafts.resetArchiveRecoveryMemoryForTests();
    await drafts.hydrateArchiveRecovery(other);
    await drafts.hydrateArchiveRecovery(origin);
    assert.deepEqual(drafts.exportArchiveRecovery(origin), before);
    assert.equal(drafts.exportArchiveRecovery(other).length, 1);
    storage();
    await drafts.importArchiveRecoveryData(origin, { format: 'hearttrace-unarchived-results-v2', pageDrafts: before });
    assert.equal(drafts.exportArchiveRecovery(origin).length, 6);
    assert.deepEqual(drafts.exportArchiveRecovery(origin).map(row => row.journal), before.map(row => row.journal));
});

test('archive source admission accepts more than 128 fragments without dropping any source digest', async () => {
    storage();
    const sourceFragments = Array.from({ length: 130 }, (_, i) => `source ${i}`);
    const ticket = await start(origin, { sourceFragments });
    drafts.releaseArchiveRecovery(ticket);
    await drafts.flushArchiveRecovery(origin);
    const before = drafts.exportArchiveRecovery(origin);
    const resumed = await start(origin, { sourceFragments, continueApproved: true });
    assert.equal(resumed.entry.sourceHash, ticket.entry.sourceHash);
    drafts.releaseArchiveRecovery(resumed);
    await drafts.flushArchiveRecovery(origin);
    assert.deepEqual(drafts.exportArchiveRecovery(origin), before);
    await assert.rejects(start(origin, { sourceFragments: sourceFragments.slice(1), continueApproved: true }), { code: 'RMT_RECOVERY_INPUT_CHANGED' });
});

test('old journals have no seven-day expiry and invalid identity or JSON structure still fails', async () => {
    const old = await create({ now: () => Date.now() - 14 * 24 * 60 * 60 * 1000 });
    const journal = recovery.generationRecoverySnapshot(old);
    assert.ok(await create({ existing: journal, continueRequested: true }));
    await assert.rejects(create({ existing: journal, continueRequested: true, origin: { ...origin, chatId: 'different' } }), { code: 'RMT_RECOVERY_INPUT_CHANGED' });
    const cycle = {}; cycle.self = cycle;
    assert.throws(() => feedback.jsonData(cycle));
    const getter = {}; Object.defineProperty(getter, 'value', { get() { assert.fail('accessor must not run'); }, enumerable: true });
    assert.throws(() => feedback.jsonData(getter));
});

test('actual storage failure still stops before any model call and preserves all existing drafts', async () => {
    const { backend } = storage();
    const first = await start();
    drafts.releaseArchiveRecovery(first);
    await drafts.flushArchiveRecovery(origin);
    const before = drafts.exportArchiveRecovery(origin);
    backend.fail = true;
    await assert.rejects(start({ ...origin, chatId: 'storage-full' }), { code: 'RMT_ARCHIVE_DRAFT_STORAGE' });
    assert.deepEqual(drafts.exportArchiveRecovery(origin), before);
    const handle = await create({ save: async () => false });
    await assert.rejects(recovery.persistGenerationRecovery(handle), { code: 'RMT_RECOVERY_STORAGE' });
});

function sourceStorage() {
    const rows = new Map();
    ledger.setMemorySourceLedgerBackendForTests({
        read: async scope => structuredClone(rows.get(scope.key) || null),
        write: async value => { rows.set(value.scope.key, structuredClone(value)); return true; },
    });
    return rows;
}

test('source ledger retains and projects more than 8000 records including the complete selection whitelist', async () => {
    sourceStorage();
    const records = Array.from({ length: 8001 }, (_, i) => ({ sourceId: `id-${i}`, content: `original source ${i}` }));
    const scope = { characterKey: 'source-card', characterName: 'source', chatId: 'many-records' };
    const result = await ledger.upsertMemorySourceLedger(scope, { provider: 'local-fixture', revision: 'r1', records,
        allowedSourceIds: records.map(record => record.sourceId), coverage: { status: 'complete', returned: records.length, total: records.length } });
    assert.equal(result.records.length, records.length);
    const reloaded = await ledger.readMemorySourceLedger(scope);
    const projected = ledger.ledgerCurrentRecords(reloaded);
    assert.equal(projected.length, records.length);
    assert.equal(projected[8000].sourceId, 'id-8000');
    assert.equal(projected[8000].content, 'original source 8000');
    assert.deepEqual(reloaded.sources[0].allowedSourceIds, records.map(record => record.sourceId));
});

test('source ledger and complete archive projection preserve history beyond 8 million characters', async () => {
    sourceStorage();
    const scope = { characterKey: 'source-card', characterName: 'source', chatId: 'large-source' };
    const content = '历史'.repeat(4000001);
    await ledger.upsertMemorySourceLedger(scope, { provider: 'local-fixture', revision: 'r1', records: [{ sourceId: 'large', content }],
        coverage: { status: 'complete', returned: 1, total: 1 } });
    const reloaded = await ledger.readMemorySourceLedger(scope);
    const projected = ledger.ledgerCurrentRecords(reloaded);
    assert.equal(projected[0].content, content);
    assert.equal(ledger.memorySourceLedgerSummary(reloaded).totalChars, content.length);
    const normalized = worldInfo.normalizeExternalMemoryRecords(projected, { complete: true });
    assert.equal(normalized.map(record => record.content).join(''), content);
});

test('more than 200 selected history books save, reload and are all read', async () => {
    const context = { characterId: 0, characters: [{ name: 'source', avatar: 'source.png' }], name2: 'source', name1: 'user',
        chatId: 'many-books', chatMetadata: {}, extensionSettings: {}, __rmtArchiveTargetEntryId: 'fixture',
        loadWorldInfo: async name => ({ entries: { 1: { uid: 1, content: `history from ${name}` } } }) };
    const books = Array.from({ length: 201 }, (_, i) => ({ name: `Book ${i}`, all: true, historySource: true }));
    worldInfo.setMemoryWorldInfoSelection(context, { books });
    assert.equal(worldInfo.getMemoryWorldInfoSelection(context).books.length, 201);
    const result = await worldInfo.collectSelectedMemoryWorldInfo(context, context.chatId);
    assert.equal(result.books.length, 201);
    assert.equal(result.entries.length, 201);
    assert.equal(result.entries[200].content, 'history from Book 200');
    assert.equal(result.historyCoverage.status, 'complete');
    assert.doesNotMatch(JSON.stringify(context.chatMetadata), /Infinity/);
});

test('precise historical world-book selection keeps entries after 160 while ordinary background retains its request budget', async () => {
    const entryUids = Array.from({ length: 161 }, (_, i) => String(i));
    const context = { characterId: 0, characters: [{ name: 'source', avatar: 'source.png' }], name2: 'source', name1: 'user',
        chatId: 'precise-history', chatMetadata: {}, extensionSettings: {}, __rmtArchiveTargetEntryId: 'fixture',
        loadWorldInfo: async () => ({ entries: Object.fromEntries(entryUids.map(uid => [uid, { uid, content: `source ${uid}` }])) }) };
    worldInfo.setMemoryWorldInfoSelection(context, { books: [{ name: 'History', all: false, historySource: true, entryUids }] });
    const selection = worldInfo.getMemoryWorldInfoSelection(context);
    assert.deepEqual(selection.books[0].entryUids, entryUids);
    const result = await worldInfo.collectSelectedMemoryWorldInfo(context, context.chatId);
    assert.equal(result.entries.length, 161);
    assert.equal(result.entries[160].content, 'source 160');
    const batches = worldInfo.selectedWorldInfoHistoryBatches(result, selection);
    assert.equal(batches.at(-1).allowedSourceIds.length, 161);
    assert.equal(worldInfo.normalizeMemoryWorldInfoBook({ name: 'Background', all: false, entryUids }).entryUids.length, 160);
});

test('local file preview preserves files beyond 4MB and JSON or JSONL entries beyond 5000', async () => {
    const binding = { characterKey: 'file-card', characterName: 'file-source', chatId: 'file-chat' };
    const content = 'x'.repeat(4000001) + '尾部';
    const large = await previewMemoryFile({ name: 'large.txt', size: new TextEncoder().encode(content).byteLength, text: async () => content }, binding);
    assert.equal(large.records[0].content, content);
    assert.equal(large.totalChars, content.length);
    assert.equal(large.coverage.status, 'complete');
    const values = Array.from({ length: 5001 }, (_, i) => ({ id: `record-${i}`, content: `source ${i}` }));
    for (const extension of ['json', 'jsonl']) {
        const fileText = extension === 'json' ? JSON.stringify(values) : values.map(value => JSON.stringify(value)).join('\n');
        const result = await previewMemoryFile({ name: `many.${extension}`, content: fileText }, binding);
        assert.equal(result.records.length, values.length);
        assert.equal(result.records[5000].content, 'source 5000');
        assert.equal(result.coverage.status, 'complete');
        assert.throws(() => assertMemoryFilePreviewBinding(result, { ...binding, chatId: 'other' }));
    }
});

test('all retained history revisions still project after more than 5000 partial source scans', async () => {
    const rows = sourceStorage();
    const scope = { characterKey: 'revision-card', characterName: 'source', chatId: 'long-history' };
    const identity = ledger.normalizeMemorySourceScope(scope);
    const revisions = Array.from({ length: 5001 }, (_, i) => `revision-${i}`);
    rows.set(identity.key, { storageVersion: 1, scope: identity, updatedAt: 1,
        records: revisions.map((revision, i) => ledger.normalizeMemorySourceRecord({ sourceId: `record-${i}`, content: `source ${i}`, revision }, { provider: 'retained-history', batchRevision: revision })),
        sources: [{ provider: 'retained-history', revision: 'failed-scan', baselineRevision: 'baseline', overlayRevisions: revisions,
            coverage: { status: 'partial', returned: 0, total: 5001 } }] });
    const result = await ledger.upsertMemorySourceLedger(scope, { provider: 'retained-history', revision: 'latest',
        records: [{ sourceId: 'latest', content: 'new source' }], coverage: { status: 'partial', returned: 1, total: 5002 } });
    const projected = ledger.ledgerCurrentRecords(result);
    assert.equal(projected.length, 5002);
    assert.equal(projected.find(record => record.sourceId === 'record-5000')?.content, 'source 5000');
    assert.equal(projected.find(record => record.sourceId === 'latest')?.content, 'new source');
    const reopened = await ledger.readMemorySourceLedger(scope);
    assert.deepEqual(ledger.ledgerCurrentRecords(reopened), projected);
});

test('retained revision projection still obeys baseline, incomplete overlays and explicit source revocation', () => {
    const record = (sourceId, batchRevision) => ledger.normalizeMemorySourceRecord({ sourceId, content: sourceId }, { provider: 'fixture', batchRevision });
    const records = [record('baseline', 'base'), record('overlay', 'scan-1'), record('current', 'scan-2'), record('stale', 'old')];
    const source = { provider: 'fixture', revision: 'scan-2', baselineRevision: 'base', overlayRevisions: ['scan-1'], coverage: { status: 'partial' } };
    assert.deepEqual(ledger.ledgerCurrentRecords({ records, sources: [source] }).map(row => row.sourceId), ['baseline', 'overlay', 'current']);
    assert.deepEqual(ledger.ledgerCurrentRecords({ records, sources: [{ ...source, allowedSourceIds: ['overlay'] }] }).map(row => row.sourceId), ['overlay']);
    assert.equal(ledger.ledgerCurrentRecords({ records, sources: [{ ...source, allowedSourceIds: [] }] }).length, 0);
    assert.deepEqual(ledger.ledgerCurrentRecords({ records, sources: [{ provider: 'fixture', revision: 'scan-2', coverage: { status: 'complete' } }] }).map(row => row.sourceId), ['current']);
});
