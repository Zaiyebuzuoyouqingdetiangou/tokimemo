import test from 'node:test';
import assert from 'node:assert/strict';
import * as backupDiagnostics from '../src/core/backupDiagnostics.js';
import * as backupStore from '../src/archive/backupStore.js';
import * as text from '../src/core/text.js';
import * as trace from '../src/core/taskTrace.js';
import { buildDiagnosticReport, diagnosticReportText } from '../src/core/diagnosticReport.js';
import { state } from '../src/core/state.js';
import { MEMORY_KEY } from '../src/core/constants.js';

const PRIVATE = 'PRIVATE_BODY https://private.invalid/?token=sk-private-token';

test('the real backup boundary retains quota identity through trace and user summaries', async t => {
    const failure = new DOMException(PRIVATE, 'QuotaExceededError');
    backupStore.setArchiveBackupBackendForTests({ async read() { throw failure; } });
    t.after(() => backupStore.setArchiveBackupBackendForTests(null));
    let caught;
    try { await backupStore.readArchiveBackup({ entryId: 'PRIVATE_CHAT' }); }
    catch (error) { caught = error; }
    assert.equal(caught, failure, 'diagnostics must preserve the storage contract thrown identity');
    trace.clearTaskTrace();
    const task = trace.startTaskTrace('PRIVATE_CHAT', 'archive');
    trace.beginStage(task, 'save');
    trace.endTaskTrace(task, 'failed', caught);
    const result = trace.taskTraceSnapshot().at(-1);
    assert.equal(result.code, 'RMT_BACKUP_QUOTA');
    assert.deepEqual(result.storage, { code: 'RMT_BACKUP_QUOTA', category: 'quota', stage: 'read' });
    assert.match(text.safeErrorSummary(caught), /存储空间不足/);
    assert.equal(text.safeErrorDiagnostic(caught).code, 'RMT_BACKUP_QUOTA');
    assert.ok(!JSON.stringify([result, text.safeErrorDiagnostic(caught), text.safeErrorSummary(caught)]).includes(PRIVATE));
});

test('a transaction abort must not hide a more specific nested quota or security cause', () => {
    for (const [name, category] of [['QuotaExceededError', 'quota'], ['SecurityError', 'security']]) {
        const nested = new DOMException(PRIVATE, name);
        const transaction = new Error(PRIVATE, { cause: nested });
        transaction.name = 'AbortError';
        const error = backupDiagnostics.backupFailureError(transaction, 'write', 'transaction');
        assert.equal(backupDiagnostics.backupFailureSummary(error).category, category);
        assert.equal(text.safeErrorDiagnostic(error).code, `RMT_BACKUP_${category.toUpperCase()}`);
        assert.equal(text.safeErrorDiagnostic(error).backupStage, 'write');
        assert.ok(!JSON.stringify(error).includes(PRIVATE));
    }
});

test('every fixed backup category survives wrapper, diagnostic and task trace', () => {
    for (const category of ['quota', 'blocked', 'security', 'clone', 'schema', 'transaction', 'unavailable', 'unknown']) {
        const error = backupDiagnostics.backupFailureError(null, 'open', category);
        const expected = `RMT_BACKUP_${category.toUpperCase()}`;
        const task = trace.startTaskTrace('', 'archive');
        trace.endTaskTrace(task, 'failed', error);
        assert.equal(trace.taskTraceSnapshot().at(-1).code, expected);
        assert.equal(text.safeErrorDiagnostic(error).code, expected);
        assert.notEqual(text.safeErrorSummary(error), '具体原因未记录；旧内容保留，可重试。');
    }
});

test('report uses the last observed fixed backup failure without probing host storage', t => {
    const keys = ['SillyTavern', 'indexedDB', 'localStorage', 'isSecureContext', 'location'];
    const before = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    t.after(() => { for (const [key, descriptor] of before) descriptor
        ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; });
    let storageCalls = 0;
    globalThis.SillyTavern = { getContext: () => ({ chat: [], chatMetadata: {} }) };
    globalThis.indexedDB = { open() { storageCalls++; throw new Error('must not probe'); } };
    globalThis.localStorage = { getItem() { storageCalls++; }, setItem() { storageCalls++; } };
    globalThis.isSecureContext = false;
    globalThis.location = { protocol: 'http:', href: PRIVATE };
    const error = new Error(PRIVATE);
    Object.defineProperty(error, 'message', { get() { throw new Error('must not inspect body'); } });
    error.name = 'SecurityError';
    backupDiagnostics.backupFailureError(error, 'open');
    const report = buildDiagnosticReport();
    assert.deepEqual(report.storage.backup.lastFailure, { code: 'RMT_BACKUP_SECURITY', category: 'security', stage: 'open' });
    assert.equal(report.host.capabilities.indexedDB, true);
    assert.equal(report.host.capabilities.secureContext, false);
    assert.equal(storageCalls, 0);
    assert.ok(!diagnosticReportText().includes('PRIVATE_'));
    report.storage.backup.lastFailure.code = 'PRIVATE_INJECTED';
    assert.equal(buildDiagnosticReport().storage.backup.lastFailure.code, 'RMT_BACKUP_SECURITY', 'snapshots cannot mutate held diagnostics');
});

test('backup diagnostics do not classify provider errors as storage or retain unsafe stage labels', () => {
    const provider = { code: 'RMT_CONNECTION_QUOTA', kind: 'provider', message: PRIVATE };
    const task = trace.startTaskTrace('', 'archive');
    trace.endTaskTrace(task, 'failed', provider);
    const result = trace.taskTraceSnapshot().at(-1);
    assert.equal(result.code, 'RMT_CONNECTION_QUOTA');
    assert.equal(result.storage, undefined);
    const error = backupDiagnostics.backupFailureError(new DOMException(PRIVATE, 'SecurityError'), PRIVATE);
    assert.equal(backupDiagnostics.backupFailureSummary(error).stage, 'unknown');
    assert.ok(!JSON.stringify(text.safeErrorDiagnostic(error)).includes(PRIVATE));
});

test('diagnostics distinguish a held .jsonl identity suffix from another chat without calling the host ID getter', t => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'SillyTavern');
    t.after(() => previous ? Object.defineProperty(globalThis, 'SillyTavern', previous) : delete globalThis.SillyTavern);
    const context = { chatId: 'PRIVATE_CHAT', chatMetadata: { [MEMORY_KEY]: {
        version: 3, chatId: 'PRIVATE_CHAT.jsonl', memories: [],
    } }, getCurrentChatId() { throw new Error('diagnostic must not call ID getter'); } };
    globalThis.SillyTavern = { getContext: () => context };
    let storage = buildDiagnosticReport().storage;
    assert.equal(storage.archiveSchema, 3);
    assert.equal(storage.archiveSchemaSupported, true);
    assert.equal(storage.archiveChatComparisonSource, 'context.chatId');
    assert.equal(storage.archiveChatMatches, true);
    assert.equal(storage.archiveChatExactMatch, false);
    context.chatId = 'PRIVATE_OTHER';
    storage = buildDiagnosticReport().storage;
    assert.equal(storage.archiveChatMatches, false);
    assert.equal(storage.archiveChatExactMatch, false);
    delete context.chatId;
    storage = buildDiagnosticReport().storage;
    assert.equal(storage.archiveChatMatches, null);
    assert.equal(storage.archiveChatExactMatch, null);
    assert.equal(storage.archiveChatComparisonSource, 'unavailable');
    assert.ok(!diagnosticReportText().includes('PRIVATE_'));
});

test('deferred diagnostics read only maintained scalar status and never iterate pending results', t => {
    const previous = state.deferredChatCommits;
    t.after(() => { state.deferredChatCommits = previous; });
    state.deferredChatCommits = {
        size: 1,
        persistenceStatus() { throw new Error('payload counters must not be visited'); },
        diagnosticStatus() { return { available: true, healthy: false,
            errorCode: 'RMT_DEFERRED_QUOTA', errorCategory: 'quota', error: PRIVATE }; },
        values() { throw new Error('pending payloads must not be visited'); },
    };
    const diagnostic = buildDiagnosticReport().storage.deferred;
    assert.deepEqual(diagnostic, { available: true, healthy: false,
        errorCode: 'RMT_DEFERRED_QUOTA', errorCategory: 'quota' });
    assert.ok(!diagnosticReportText().includes('PRIVATE_'));
    assert.equal(text.safeErrorDiagnostic({ code: 'RMT_DEFERRED_QUOTA', message: PRIVATE }).code, 'RMT_DEFERRED_QUOTA');
    assert.match(text.safeErrorSummary({ code: 'RMT_DEFERRED_QUOTA', message: PRIVATE }), /存储空间不足/);
});
