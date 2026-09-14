import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildDiagnosticReport, diagnosticReportText } from '../src/core/diagnosticReport.js';
import { state } from '../src/core/state.js';
import { CACHE_KEY, MEMORY_KEY } from '../src/core/constants.js';

const saved = { deferred: state.deferredChatCommits, label: state.activeTaskLabel,
    provider: state.activeProviderRequestCount };
afterEach(() => {
    state.deferredChatCommits = saved.deferred;
    state.activeTaskLabel = saved.label;
    state.activeProviderRequestCount = saved.provider;
    for (const key of ['SillyTavern', 'location', 'localStorage']) delete globalThis[key];
});

function lengthOnlyArray(length) {
    return new Proxy(new Array(length), { get(target, key) {
        if (key === 'length') return target.length;
        throw new Error('Contents must not be read');
    } });
}

function installContext(cache) {
    let hostCalls = 0, storageWrites = 0;
    const archive = { memories: lengthOnlyArray(9), toJSON() { throw new Error('Archive serialized'); } };
    const context = {
        chat: lengthOnlyArray(100000), chatMetadata: { [MEMORY_KEY]: archive, [CACHE_KEY]: cache,
            heartbeatMemoriesCastLooksV1: { char: 'PRIVATE_LOOK', user: 'PRIVATE_USER', manual: true } },
        name1: 'PRIVATE_NAME', name2: 'PRIVATE_CHAR',
        getCurrentChatId: () => { hostCalls += 1; throw new Error('ID must not be requested'); },
        getCharacterCardFields: () => { hostCalls += 1; throw new Error('Card must not be read'); },
        getWorldInfoPrompt: () => { hostCalls += 1; throw new Error('Worldbook must not be read'); },
        getTokenCountAsync: () => { hostCalls += 1; throw new Error('Tokens must not be counted'); },
        saveMetadataDebounced: () => { storageWrites += 1; },
    };
    globalThis.SillyTavern = { getContext: () => context };
    globalThis.location = { protocol: 'https:', hostname: 'private-user.example', href: 'https://private-user.example/?token=PRIVATE_TOKEN' };
    globalThis.localStorage = { setItem() { storageWrites += 1; }, removeItem() { storageWrites += 1; },
        getItem() { throw new Error('Storage must not be loaded'); } };
    return { context, calls: () => ({ hostCalls, storageWrites }) };
}

test('diagnostic measures compressed manifest, never serializes archive/cache, and reads the real deferred map', () => {
    let modeReads = 0;
    const modes = new Proxy(['album', 'PRIVATE_CHAT', 'adv', 'album', ...new Array(1000).fill('room')], {
        get(target, key) { if (key !== 'length') modeReads += 1; return Reflect.get(target, key); },
    });
    const cache = { format: 'gzip-base64-v1', data: 'x'.repeat(1_000_000), sourceChars: 1_200_000,
        sourceBytes: 3_600_000, modes, toJSON() { throw new Error('Cache serialized'); } };
    const fixture = installContext(cache);
    state.deferredChatCommits = new Map([['PRIVATE_CHAT', [{ body: 'PRIVATE_BODY' }]], ['other', []]]);
    state.activeTaskLabel = 'PRIVATE_ACTIVE_TASK';
    state.activeProviderRequestCount = Infinity;
    const report = buildDiagnosticReport();
    assert.equal(report.storage.cacheCompressed, true);
    assert.equal(report.storage.cacheFormat, 'gzip-base64-v1');
    assert.equal(report.storage.base64Chars, 1_000_000);
    assert.equal(report.storage.sourceBytes, 3_600_000);
    assert.deepEqual(report.storage.cachedModes, ['album', 'adv', 'room']);
    assert.equal(report.storage.memoryCount, 9);
    assert.equal(report.chat.messageCount, 100000);
    assert.equal(report.runtime.deferredCommits, 2);
    assert.equal(report.runtime.providerInFlight, 0);
    assert.equal(modeReads, 32, 'manifest work is capped regardless of array length');
    const text = diagnosticReportText();
    for (const secret of ['PRIVATE_', 'private-user.example', 'https://', 'archiveChars', 'cacheChars', 'localStorageWritable']) {
        assert.ok(!text.includes(secret), `must not include ${secret}`);
    }
    assert.deepEqual(fixture.calls(), { hostCalls: 0, storageWrites: 0 });
});

test('legacy cache diagnostic never enumerates keys or enters derived sessions', () => {
    const cache = new Proxy({ album: { secret: 'PRIVATE_SESSION' } }, {
        ownKeys() { throw new Error('Legacy cache enumerated'); },
        get(target, key) { if (key === 'format') return undefined; throw new Error('Legacy cache entered'); },
    });
    const fixture = installContext(cache);
    const report = buildDiagnosticReport();
    assert.equal(report.storage.cacheFormat, 'legacy-uncompressed');
    assert.deepEqual(report.storage.cachedModes, []);
    assert.equal(report.storage.base64Chars, 0);
    assert.deepEqual(fixture.calls(), { hostCalls: 0, storageWrites: 0 });
});

test('pending work includes queued generation while the exclusive archive busy flag is false', () => {
    const fixture = installContext(null);
    const previous = { busy: state.busy, tasks: state.activeGenerationTasks, queue: state.providerRequestQueue };
    try {
        state.busy = false;
        state.activeTaskLabel = '';
        state.activeGenerationTasks = new Map([['PRIVATE_TASK', { label: 'PRIVATE_CONTENT' }]]);
        state.providerRequestQueue = [{ signal: 'PRIVATE_SIGNAL' }];
        const report = buildDiagnosticReport();
        assert.equal(report.runtime.busy, false);
        assert.equal(report.runtime.hasActiveTask, false);
        assert.equal(report.runtime.hasPendingWork, true);
        assert.equal(report.runtime.generationTasks, 1);
        assert.equal(report.runtime.providerQueued, 1);
        assert.doesNotMatch(JSON.stringify(report), /PRIVATE_/);
        assert.deepEqual(fixture.calls(), { hostCalls: 0, storageWrites: 0 });
    } finally {
        state.busy = previous.busy;
        state.activeGenerationTasks = previous.tasks;
        state.providerRequestQueue = previous.queue;
    }
});
