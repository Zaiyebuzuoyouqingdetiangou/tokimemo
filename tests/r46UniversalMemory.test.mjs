import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { MAX_MEMORY_FILE_BYTES, MAX_MEMORY_WORLD_INFO_CHARS } from '../src/core/constants.js';
import { chatScopeKey } from '../src/core/context.js';
import { state as runtimeState } from '../src/core/state.js';
import {
    archiveInputAvailable,
    commitCurrentChatMemoryFilePreview,
    currentMemorySourceLedgerExternal,
    externalMemoryFromSourceLedger,
    flattenExternalMemoryPayload,
    getMemoryPreflight,
    memorySourceScopeForContext,
    mergeDurableSourceDescriptor,
    mergeImportedMemories,
    normalizeExternalImportedMemories,
    normalizeExternalMemoryRecords,
    normalizeMemoryWorldInfoBook,
    normalizeMemoryWorldInfoEntry,
    previewCurrentChatMemoryFile,
    selectedWorldInfoHistoryBatch,
    setMemoryWorldInfoSelection,
    syncSelectedWorldInfoHistoryLedger,
    updateMemoryWorldInfoBookSelection,
} from '../src/archive/repository.js';
import { previewMemoryFile, assertMemoryFilePreviewBinding } from '../src/archive/memoryFileImport.js';
import { findBaiBaiBookPublicApi, readBaiBaiBookCurrentChat } from '../src/archive/memoryProviders.js';
import {
    deleteMemorySourceLedger,
    ledgerCurrentRecords,
    memorySourceLedgerSummary,
    normalizeMemorySourceId,
    normalizeMemorySourceRevision,
    normalizeMemorySourceScope,
    readMemorySourceLedger,
    setMemorySourceLedgerBackendForTests,
    upsertMemorySourceLedger,
} from '../src/archive/sourceLedger.js';

const scope = { characterKey: 'avatar:test.png', characterName: '测试角色', chatId: 'chat-r46' };

function pluginContext(chatId = 'chat-r46') {
    return {
        chat: [], chatMetadata: {}, extensionPrompts: {}, extensionSettings: {},
        characterId: 0, groupId: null, name1: '用户', name2: '测试角色',
        characters: [{ name: '测试角色', avatar: 'test.png', data: { name: '测试角色', avatar: 'test.png' } }],
        getCurrentChatId: () => chatId,
    };
}

function file(name, content, size = undefined) {
    return { name, size: size ?? new TextEncoder().encode(content).byteLength, async text() { return content; } };
}

function memoryBackend() {
    const rows = new Map();
    return {
        rows,
        backend: {
            async read(identity) { return structuredClone(rows.get(identity.key) || null); },
            async write(ledger) { rows.set(ledger.scope.key, structuredClone(ledger)); return true; },
            async delete(identity) { rows.delete(identity.key); return true; },
        },
    };
}

test('r46 reserves archive capacity for normalized external-current-chat memories', () => {
    const chat = Array.from({ length: 240 }, (_, index) => ({
        sourceKind: 'chat', messageStart: index + 1, messageEnd: index + 1,
        title: `聊天 ${index}`, summary: `聊天记忆 ${index}`,
    }));
    const records = [{ externalId: 'provider-record-1', content: '确实发生过的外部记忆证据' }];
    const external = normalizeExternalImportedMemories({
        memories: [{ title: '外部历史', summary: '外部历史摘要', sourceExternalIds: ['provider-record-1'], sourceExternalAnchor: '外部记忆证据' }],
    }, records);
    assert.equal(external[0].sourceKind, 'external-current-chat');
    const merged = mergeImportedMemories([...chat, ...external]);
    assert.equal(merged.length, 240);
    assert.equal(merged.filter(item => item.sourceKind === 'external-current-chat').length, 1);
});

test('r46 fragments a 20k summary without the former silent 6000-character loss', () => {
    const text = '回'.repeat(20000);
    const records = normalizeExternalMemoryRecords([{ externalId: 'summary-long', provider: 'test', content: text }]);
    assert.equal(records.length, 4);
    assert.equal(records.map(item => item.content).join('').length, 20000);
    assert.deepEqual(records.map(item => item.externalId.replace(/^P[^:]+:/, '')), [
        'summary-long:part:1', 'summary-long:part:2', 'summary-long:part:3', 'summary-long:part:4',
    ]);
});

test('r46 fragment boundaries preserve meaningful internal whitespace byte-for-byte', () => {
    const text = `${'甲'.repeat(5198)}      ${'乙'.repeat(14796)}`;
    assert.equal(text.length, 20000);
    const records = normalizeExternalMemoryRecords([{ externalId: 'spaced-long', provider: 'test', content: text }]);
    assert.equal(records.map(item => item.content).join(''), text);
});

test('r46 namespaces equal source ids by provider and preserves both valid anchors', () => {
    const records = normalizeExternalMemoryRecords([
        { sourceId: '1', provider: 'provider-a', content: '甲来源里确实发生过一起看海。' },
        { sourceId: '1', provider: 'provider-b', content: '乙来源里确实发生过一起看雪。' },
    ]);
    assert.equal(new Set(records.map(item => item.externalId)).size, 2);
    const memories = normalizeExternalImportedMemories({ memories: [
        { title: '看海', summary: '一起看海', sourceExternalIds: [records[0].externalId], sourceExternalAnchor: '确实发生过一起看海' },
        { title: '看雪', summary: '一起看雪', sourceExternalIds: [records[1].externalId], sourceExternalAnchor: '确实发生过一起看雪' },
    ] }, records);
    assert.equal(memories.length, 2);
    const longOnce = normalizeExternalMemoryRecords([{ sourceId: 'x'.repeat(180), provider: 'provider-a', content: '长 ID 也必须稳定' }]);
    const longTwice = normalizeExternalMemoryRecords(longOnce);
    assert.equal(longTwice[0].externalId, longOnce[0].externalId);
    const sharedPrefix = '同'.repeat(80);
    const collidingDisplayNames = normalizeExternalMemoryRecords([
        { sourceId: '1', provider: `${sharedPrefix}甲`, content: '甲' },
        { sourceId: '1', provider: `${sharedPrefix}乙`, content: '乙' },
    ]);
    assert.equal(new Set(collidingDisplayNames.map(item => item.externalId)).size, 2);
    const longProvider = `${'同'.repeat(100)}真正后缀`;
    const once = normalizeExternalMemoryRecords([{ sourceId: '1', provider: longProvider, content: '长来源也必须稳定' }]);
    const twice = normalizeExternalMemoryRecords(once);
    assert.equal(twice[0].externalId, once[0].externalId);
    assert.equal(twice[0].provider, once[0].provider);
});

test('r46 generic payload keeps a 20k record intact until the reported prompt bound', () => {
    const text = '长'.repeat(20000);
    const flattened = flattenExternalMemoryPayload({ memories: [{ id: 'long', content: text }] }, 'EverMind');
    assert.equal(flattened.length, 1);
    assert.equal(flattened[0].content.length, 20000);
    assert.equal(normalizeExternalMemoryRecords(flattened).map(item => item.content).join('').length, 20000);
});

test('r46 durable truncation status replaces a same-scan complete label but not a live failure', () => {
    const truncated = { id: 'same', count: 256, coverage: { status: 'truncated', reason: 'prompt bound' } };
    const live = [{ id: 'same', label: '来源', count: 300, coverage: { status: 'complete' } }];
    mergeDurableSourceDescriptor(live, truncated);
    assert.equal(live[0].coverage.status, 'truncated');
    const failed = [{ id: 'same', label: '来源', count: 0, coverage: { status: 'failed', reason: 'current read failed' } }];
    mergeDurableSourceDescriptor(failed, truncated);
    assert.equal(failed[0].coverage.status, 'failed');
});

test('r46 parses JSON, JSONL, TXT and MD as inert current-chat-bound previews', async () => {
    const previews = await Promise.all([
        previewMemoryFile(file('memory.json', JSON.stringify({ memories: [{ id: 'json-1', content: '<script>never runs</script>{{macro}}' }, { id: 'json-duplicate', content: '<script>never runs</script>{{macro}}' }] })), scope),
        previewMemoryFile(file('memory.jsonl', '{"id":"line-1","summary":"第一行"}\n{"id":"line-2","text":"第二行"}'), scope),
        previewMemoryFile(file('memory.txt', '第一段\n---\n第二段'), scope),
        previewMemoryFile(file('memory.md', '# 初遇\n内容\n## 后来\n更多内容'), scope),
        previewMemoryFile(file('memory.markdown', '# 完整扩展名\n也应被接受'), scope),
    ]);
    assert.deepEqual(previews.map(item => item.records.length), [2, 2, 2, 2, 1]);
    assert.match(previews[0].records[0].content, /<script>never runs<\/script>\{\{macro\}\}/);
    assert.deepEqual(previews[0].records.map(item => item.sourceId), ['json-1', 'json-duplicate']);
    assert.equal(assertMemoryFilePreviewBinding(previews[0], scope), previews[0]);
    assert.throws(() => assertMemoryFilePreviewBinding(previews[0], { ...scope, chatId: 'other-chat' }), /另一个角色或聊天窗口/);
});

test('r46 JSON import keeps an object summary and its nested history records', async () => {
    const preview = await previewMemoryFile(file('nested.json', JSON.stringify({
        summary: '总体回顾',
        memories: [{ id: 'event-1', content: '第一次事件' }, { id: 'event-2', content: '第二次事件' }],
    })), scope);
    assert.deepEqual(preview.records.map(item => item.content), ['总体回顾', '第一次事件', '第二次事件']);
    assert.equal(preview.coverage.status, 'complete');
    assert.equal(preview.coverage.returned, 3);
});

test('r46 JSON import traverses deep and unknown object containers without object-string ghosts', async () => {
    let deep = { content: '深层事件' };
    for (let index = 0; index < 16; index += 1) deep = { history: deep };
    const preview = await previewMemoryFile(file('generic.json', JSON.stringify({
        summary: '总体',
        memory: { id: 'memory-object', content: '对象记忆' },
        history: [{ content: '标准历史' }],
        customArchive: { content: '自定义历史' },
        customDirectHistory: '未知插件自定义字段里的已发生历史',
        deep,
    })), scope);
    assert.deepEqual(preview.records.map(item => item.content), ['总体', '对象记忆', '标准历史', '自定义历史', '未知插件自定义字段里的已发生历史', '深层事件']);
    assert.doesNotMatch(preview.records.map(item => item.content).join('|'), /\[object Object\]/);
    assert.equal(preview.coverage.status, 'complete');
});

test('r46 JSON import excludes sensitive and configuration fields even when they are beyond the visible sample', async () => {
    const preview = await previewMemoryFile(file('plugin-export.json', JSON.stringify({
        history: [
            { id: 'm1', content: '第一条真实历史' },
            { id: 'm2', content: '第二条真实历史' },
            { id: 'm3', content: '第三条真实历史' },
        ],
        settings: {
            endpoint: 'https://provider.invalid',
            apiKey: 'sk-test-only-not-a-real-key',
            password: 'test-only-password',
            access_token: 'test-only-access-token',
            token: 'test-only-opaque-token',
        },
    })), scope);

    assert.deepEqual(preview.records.map(item => item.content), [
        '第一条真实历史', '第二条真实历史', '第三条真实历史',
    ]);
    assert.equal(preview.skippedSensitiveFields, 4);
    assert.equal(preview.skippedConfigFields, 1);
    assert.equal(preview.coverage.status, 'partial');
    assert.equal(preview.coverage.returned, 3);
    assert.equal(preview.coverage.total, 8);
    assert.match(preview.coverage.reason, /4 个敏感字段和 1 个配置字段/);
    assert.doesNotMatch(JSON.stringify(preview.records), /provider\.invalid|sk-test-only|test-only-password|test-only-access-token|test-only-opaque-token/);
});

test('r46 rejects unsupported and oversized memory files before parsing', async () => {
    await assert.rejects(previewMemoryFile(file('memory.html', '<b>not accepted</b>'), scope), /只支持/);
    await assert.rejects(previewMemoryFile(file('memory.json', '{}', MAX_MEMORY_FILE_BYTES + 1), scope), /超过 4 MB/);
});

test('r46 BaiBai Book adapter requires the exact official global and numeric API v1', () => {
    assert.equal(findBaiBaiBookPublicApi({ STBaiBaiBook: { apiVersion: '1', getHistory() {}, getSnapshot() {} } }), null);
    assert.equal(findBaiBaiBookPublicApi({ STBaiBaiBook: { apiVersion: 2, getHistory() {}, getSnapshot() {} } }), null);
    assert.equal(findBaiBaiBookPublicApi({ BaiBaiMemory: { apiVersion: 1, getHistory() {}, getSnapshot() {} } }), null);
});

test('r46 BaiBai Book adapter rejects wrong chat and reads only official history DTO nodes', async () => {
    const wrongRoot = {
        STBaiBaiBook: {
            apiVersion: 1, pluginVersion: '1.2.3',
            getHistory() { return { apiVersion: 1, pluginVersion: '1.2.3', revision: 7, chat: { id: 'wrong-chat' }, coverage: { complete: true, missingAiFloors: [] }, text: '错聊', relativeText: '错聊', nodes: [{ id: 'B-1', text: '错聊' }] }; },
            getSnapshot() { return { apiVersion: 1, pluginVersion: '1.2.3', revision: 7, chat: { id: 'wrong-chat' }, coverage: { complete: true, missingAiFloors: [] }, state: { location: '不应进入历史' } }; },
        },
    };
    const wrong = findBaiBaiBookPublicApi(wrongRoot);
    await assert.rejects(readBaiBaiBookCurrentChat(wrong, 'chat-r46'), /另一个聊天窗口/);

    let fullCalls = 0;
    let injectedCalls = 0;
    const okRoot = {
        STBaiBaiBook: {
            apiVersion: 1, pluginVersion: '1.2.4',
            getHistory() {
                fullCalls += 1;
                return { apiVersion: 1, pluginVersion: '1.2.4', revision: 8, chat: { id: 'chat-r46' }, coverage: { complete: false, missingAiFloors: [3] }, text: '全部历史', relativeText: '全部历史', nodes: [{ id: 'B-1', text: '完整节点' }, { id: 'B-2', text: '保留原始 ID' }] };
            },
            getInjectedHistory() { injectedCalls += 1; throw new Error('完整历史存在时不应调用'); },
            getSnapshot() { return { apiVersion: 1, pluginVersion: '1.2.4', revision: 8, chat: { id: 'chat-r46' }, coverage: { complete: false, missingAiFloors: [3] }, state: { location: '不应进入历史' } }; },
        },
    };
    const result = await readBaiBaiBookCurrentChat(findBaiBaiBookPublicApi(okRoot), 'chat-r46');
    assert.equal(fullCalls, 1);
    assert.equal(injectedCalls, 0);
    assert.equal(result.apiVersion, 1);
    assert.equal(result.providerVersion, '1.2.4');
    assert.equal(result.coverage.status, 'partial');
    assert.deepEqual(result.coverage.missingAiFloors, [3]);
    assert.deepEqual(result.records.map(item => item.sourceId), ['B-1', 'B-2']);
    assert.doesNotMatch(JSON.stringify(result.records), /不应进入历史/);
});

test('r46 BaiBai Book injected fallback is partial and unstable revisions are rejected', async () => {
    const injectedRoot = {
        STBaiBaiBook: {
            apiVersion: 1, pluginVersion: '1.2.5',
            getInjectedHistory() { return { apiVersion: 1, pluginVersion: '1.2.5', revision: 9, chat: { id: 'chat-r46' }, coverage: { complete: true, missingAiFloors: [] }, relativeText: '离开滑窗的历史', nodes: [{ id: 'I-1', text: '离开滑窗的历史' }] }; },
            getSnapshot() { return { apiVersion: 1, pluginVersion: '1.2.5', revision: 9, chat: { id: 'chat-r46' }, coverage: { complete: true, missingAiFloors: [] } }; },
        },
    };
    const injected = await readBaiBaiBookCurrentChat(findBaiBaiBookPublicApi(injectedRoot), 'chat-r46');
    assert.equal(injected.coverage.status, 'partial');
    assert.match(injected.coverage.reason, /滑动窗口/);

    let historyRevision = 10;
    let snapshotRevision = 11;
    const unstableRoot = {
        STBaiBaiBook: {
            apiVersion: 1,
            getHistory() { return { revision: historyRevision++, chat: { id: 'chat-r46' }, coverage: { complete: true, missingAiFloors: [] }, nodes: [{ id: 'U-1', text: '不稳定' }] }; },
            getSnapshot() { return { revision: snapshotRevision++, chat: { id: 'chat-r46' }, coverage: { complete: true, missingAiFloors: [] } }; },
        },
    };
    await assert.rejects(
        readBaiBaiBookCurrentChat(findBaiBaiBookPublicApi(unstableRoot), 'chat-r46'),
        /版本变化/,
    );
});

test('r46 BaiBai Book compares the complete long revision instead of accepting a shared truncated prefix', async () => {
    const prefix = 'R'.repeat(180);
    const historyRevision = `${prefix}history-suffix`;
    const snapshotRevision = `${prefix}snapshot-suffix`;
    assert.notEqual(normalizeMemorySourceRevision(historyRevision), normalizeMemorySourceRevision(snapshotRevision));
    assert.equal(
        normalizeMemorySourceRevision(normalizeMemorySourceRevision(historyRevision)),
        normalizeMemorySourceRevision(historyRevision),
    );

    const root = {
        STBaiBaiBook: {
            apiVersion: 1,
            getHistory() {
                return {
                    revision: historyRevision,
                    chat: { id: 'chat-r46' },
                    coverage: { complete: true, total: 1 },
                    nodes: [{ id: 'long-revision-history', text: '历史内容' }],
                };
            },
            getSnapshot() {
                return { revision: snapshotRevision, chat: { id: 'chat-r46' } };
            },
        },
    };
    await assert.rejects(
        readBaiBaiBookCurrentChat(findBaiBaiBookPublicApi(root), 'chat-r46'),
        /版本变化/,
    );
});

test('r46 long source ids stay distinct through file ingress', async () => {
    const prefix = 'S'.repeat(180);
    const sourceIdA = `${prefix}source-a`;
    const sourceIdB = `${prefix}source-b`;
    const filePreview = await previewMemoryFile(file('long-source-ids.json', JSON.stringify({
        history: [
            { id: sourceIdA, content: '文件来源甲' },
            { id: sourceIdB, content: '文件来源乙' },
        ],
    })), scope);
    assert.equal(new Set(filePreview.records.map(item => item.sourceId)).size, 2);
});

test('r46 long source ids stay distinct through BaiBai ingress', async () => {
    const prefix = 'S'.repeat(180);
    const sourceIdA = `${prefix}source-a`;
    const sourceIdB = `${prefix}source-b`;
    const root = {
        STBaiBaiBook: {
            apiVersion: 1,
            getHistory() {
                return {
                    revision: 'long-source-id-revision',
                    chat: { id: 'chat-r46' },
                    coverage: { complete: true, total: 2 },
                    nodes: [
                        { id: sourceIdA, text: '柏宝来源甲' },
                        { id: sourceIdB, text: '柏宝来源乙' },
                    ],
                };
            },
            getSnapshot() {
                return { revision: 'long-source-id-revision', chat: { id: 'chat-r46' } };
            },
        },
    };
    const result = await readBaiBaiBookCurrentChat(findBaiBaiBookPublicApi(root), 'chat-r46');
    assert.equal(result.records.length, 2);
    assert.equal(new Set(result.records.map(item => item.sourceId)).size, 2);
});

test('r46 BaiBai Book reports its local record cap as truncated even when provider says complete', async () => {
    const nodes = Array.from({ length: 8001 }, (_, index) => ({ id: `N${index}`, text: `历史${index}` }));
    const root = {
        STBaiBaiBook: {
            apiVersion: 1,
            getHistory() { return { revision: 20, chat: { id: 'chat-r46' }, coverage: { complete: true, missingAiFloors: [] }, nodes }; },
            getSnapshot() { return { revision: 20, chat: { id: 'chat-r46' }, coverage: { complete: true, missingAiFloors: [] } }; },
        },
    };
    const result = await readBaiBaiBookCurrentChat(findBaiBaiBookPublicApi(root), 'chat-r46');
    assert.equal(result.records.length, 8000);
    assert.equal(result.coverage.status, 'truncated');
    assert.match(result.coverage.reason, /8000 条本地记录上限/);
});

test('r46 source ledger survives reload, deduplicates exact versions, and verifies clear', async () => {
    const store = memoryBackend();
    setMemorySourceLedgerBackendForTests(store.backend);
    try {
        const batch = {
            provider: 'file:test.json', providerVersion: 'file-import-v1', revision: 'rev-1',
            coverage: { status: 'complete', returned: 1, total: 1 },
            records: [{ sourceId: 'stable-1', revision: 'rev-1', content: '持久化原文'.repeat(2000) }],
        };
        await upsertMemorySourceLedger(scope, batch);
        await upsertMemorySourceLedger(scope, batch);
        const reloaded = await readMemorySourceLedger({ ...scope });
        assert.equal(reloaded.records.length, 1);
        assert.equal(ledgerCurrentRecords(reloaded)[0].content, '持久化原文'.repeat(2000));
        assert.equal(memorySourceLedgerSummary(reloaded).sources[0].coverage.status, 'complete');
        const externalAfterPluginRemoval = externalMemoryFromSourceLedger(reloaded);
        assert.equal(externalAfterPluginRemoval.sourceMode, 'durable-ledger');
        assert.equal(externalAfterPluginRemoval.records.map(item => item.content).join(''), '持久化原文'.repeat(2000));
        await deleteMemorySourceLedger(scope);
        assert.equal(await readMemorySourceLedger(scope), null);
    } finally {
        setMemorySourceLedgerBackendForTests(null);
    }
});

test('r46 source ledger read failure cannot be mistaken for an empty ledger and overwritten', async () => {
    let writes = 0;
    setMemorySourceLedgerBackendForTests({
        async read() { throw new Error('temporary ledger read failure'); },
        async write() { writes += 1; return true; },
        async delete() { return true; },
    });
    try {
        await assert.rejects(
            upsertMemorySourceLedger(scope, { provider: 'new-source', records: [{ content: '不得覆盖旧来源' }] }),
            /temporary ledger read failure/,
        );
        assert.equal(writes, 0);
    } finally {
        setMemorySourceLedgerBackendForTests(null);
    }
});

test('r46 serializes concurrent source-ledger mutations without losing either provider', async () => {
    const rows = new Map();
    setMemorySourceLedgerBackendForTests({
        async read(identity) { return structuredClone(rows.get(identity.key) || null); },
        async write(ledger) {
            await new Promise(resolve => setTimeout(resolve, 8));
            rows.set(ledger.scope.key, structuredClone(ledger));
            return true;
        },
        async delete(identity) { rows.delete(identity.key); return true; },
    });
    try {
        await Promise.all([
            upsertMemorySourceLedger(scope, { provider: 'concurrent-a', revision: 'a1', records: [{ sourceId: 'a', content: '甲来源' }] }),
            upsertMemorySourceLedger(scope, { provider: 'concurrent-b', revision: 'b1', records: [{ sourceId: 'b', content: '乙来源' }] }),
        ]);
        const ledger = await readMemorySourceLedger(scope);
        assert.deepEqual(ledgerCurrentRecords(ledger).map(item => item.content).sort(), ['乙来源', '甲来源']);
        assert.deepEqual(ledger.sources.map(item => item.provider).sort(), ['concurrent-a', 'concurrent-b']);
    } finally {
        setMemorySourceLedgerBackendForTests(null);
    }
});

test('r46 complete batches remove disappeared ids while partial overlays preserve the last complete baseline', async () => {
    const store = memoryBackend();
    setMemorySourceLedgerBackendForTests(store.backend);
    try {
        await upsertMemorySourceLedger(scope, {
            provider: 'versioned', revision: 'r1', coverage: { status: 'complete', returned: 2, total: 2 },
            records: [{ sourceId: 'A', revision: 'item-a', content: 'A' }, { sourceId: 'B', revision: 'item-b', content: 'B' }],
        });
        await upsertMemorySourceLedger(scope, {
            provider: 'versioned', revision: 'r2', coverage: { status: 'complete', returned: 1, total: 1 },
            records: [{ sourceId: 'A', revision: 'item-a', content: 'A' }],
        });
        assert.deepEqual(ledgerCurrentRecords(await readMemorySourceLedger(scope)).map(item => item.content), ['A']);
        await upsertMemorySourceLedger(scope, {
            provider: 'versioned', revision: 'r3', coverage: { status: 'partial', returned: 1, total: null },
            records: [{ sourceId: 'C', revision: 'item-c', content: 'C' }],
        });
        assert.deepEqual(ledgerCurrentRecords(await readMemorySourceLedger(scope)).map(item => item.content).sort(), ['A', 'C']);
        await upsertMemorySourceLedger(scope, {
            provider: 'versioned', revision: 'r4', coverage: { status: 'complete', returned: 0, total: 0 }, records: [],
        });
        assert.deepEqual(ledgerCurrentRecords(await readMemorySourceLedger(scope)), []);
    } finally {
        setMemorySourceLedgerBackendForTests(null);
    }
});

test('r46 batch provider identity overrides row display labels so empty complete revisions really clear it', async () => {
    const store = memoryBackend();
    setMemorySourceLedgerBackendForTests(store.backend);
    try {
        await upsertMemorySourceLedger(scope, {
            provider: 'evermind-current-chat-api', label: 'EverMind', revision: 'e1', coverage: { status: 'complete', returned: 2, total: 2 },
            records: [{ provider: 'EverMind', sourceId: '1', content: '甲' }, { provider: 'EverMind', sourceId: '2', content: '乙' }],
        });
        const first = await readMemorySourceLedger(scope);
        assert.deepEqual(ledgerCurrentRecords(first).map(item => item.provider), ['evermind-current-chat-api', 'evermind-current-chat-api']);
        await upsertMemorySourceLedger(scope, {
            provider: 'evermind-current-chat-api', label: 'EverMind', revision: 'e2', coverage: { status: 'complete', returned: 0, total: 0 }, records: [],
        });
        assert.deepEqual(ledgerCurrentRecords(await readMemorySourceLedger(scope)), []);
    } finally {
        setMemorySourceLedgerBackendForTests(null);
    }
});

test('r46 long provider identities remain distinct in the durable complete-revision ledger', async () => {
    const store = memoryBackend();
    setMemorySourceLedgerBackendForTests(store.backend);
    try {
        const common = `file:${'同'.repeat(100)}`;
        await upsertMemorySourceLedger(scope, {
            provider: `${common}甲.json`, label: '甲文件', revision: 'a1',
            coverage: { status: 'complete', returned: 1, total: 1 },
            records: [{ sourceId: '1', content: '甲文件历史' }],
        });
        await upsertMemorySourceLedger(scope, {
            provider: `${common}乙.json`, label: '乙文件', revision: 'b1',
            coverage: { status: 'complete', returned: 1, total: 1 },
            records: [{ sourceId: '1', content: '乙文件历史' }],
        });
        const ledger = await readMemorySourceLedger(scope);
        assert.equal(new Set(ledger.sources.map(item => item.provider)).size, 2);
        assert.deepEqual(ledgerCurrentRecords(ledger).map(item => item.content).sort(), ['乙文件历史', '甲文件历史']);
    } finally {
        setMemorySourceLedgerBackendForTests(null);
    }
});

test('r46 long complete revisions with one shared prefix still replace the prior baseline', async () => {
    const store = memoryBackend();
    setMemorySourceLedgerBackendForTests(store.backend);
    try {
        const prefix = 'R'.repeat(180);
        const revisionA = `${prefix}complete-a`;
        const revisionB = `${prefix}complete-b`;
        assert.notEqual(normalizeMemorySourceRevision(revisionA), normalizeMemorySourceRevision(revisionB));
        assert.equal(
            normalizeMemorySourceRevision(normalizeMemorySourceRevision(revisionA)),
            normalizeMemorySourceRevision(revisionA),
        );

        await upsertMemorySourceLedger(scope, {
            provider: 'long-revision-provider', revision: revisionA,
            coverage: { status: 'complete', returned: 1, total: 1 },
            records: [{ sourceId: 'old', content: '旧完整基线' }],
        });
        await upsertMemorySourceLedger(scope, {
            provider: 'long-revision-provider', revision: revisionB,
            coverage: { status: 'complete', returned: 1, total: 1 },
            records: [{ sourceId: 'new', content: '新完整基线' }],
        });
        const ledger = await readMemorySourceLedger(scope);
        assert.deepEqual(ledgerCurrentRecords(ledger).map(item => item.content), ['新完整基线']);
    } finally {
        setMemorySourceLedgerBackendForTests(null);
    }
});

test('r46 long source ids stay distinct in the ledger and external ids remain idempotent', async () => {
    const store = memoryBackend();
    setMemorySourceLedgerBackendForTests(store.backend);
    try {
        const prefix = 'S'.repeat(180);
        const sourceIdA = `${prefix}source-a`;
        const sourceIdB = `${prefix}source-b`;
        assert.notEqual(normalizeMemorySourceId(sourceIdA), normalizeMemorySourceId(sourceIdB));
        assert.equal(normalizeMemorySourceId(normalizeMemorySourceId(sourceIdA)), normalizeMemorySourceId(sourceIdA));

        await upsertMemorySourceLedger(scope, {
            provider: 'long-source-id-provider', revision: 'source-id-revision',
            coverage: { status: 'complete', returned: 2, total: 2 },
            records: [
                { sourceId: sourceIdA, content: '长来源甲' },
                { sourceId: sourceIdB, content: '长来源乙' },
            ],
        });
        const current = ledgerCurrentRecords(await readMemorySourceLedger(scope));
        assert.equal(current.length, 2);
        assert.equal(new Set(current.map(item => item.sourceId)).size, 2);

        const once = normalizeExternalMemoryRecords(current);
        const twice = normalizeExternalMemoryRecords(once);
        assert.equal(new Set(once.map(item => item.externalId)).size, 2);
        assert.deepEqual(twice.map(item => item.externalId), once.map(item => item.externalId));
        assert.deepEqual(twice.map(item => item.content), once.map(item => item.content));
    } finally {
        setMemorySourceLedgerBackendForTests(null);
    }
});

test('r46 file preview is read-only, commit writes once, and a switched chat cannot commit it', async () => {
    const store = memoryBackend();
    let writes = 0;
    const originalWrite = store.backend.write;
    store.backend.write = async ledger => { writes += 1; return originalWrite(ledger); };
    setMemorySourceLedgerBackendForTests(store.backend);
    try {
        const context = pluginContext();
        const preview = await previewCurrentChatMemoryFile(file('consent.md', '# 已发生\n一起看过雨'), context);
        assert.equal(writes, 0, 'preview must never persist without confirmation');
        await assert.rejects(commitCurrentChatMemoryFilePreview(preview, context), /已经发生的历史/);
        await commitCurrentChatMemoryFilePreview(preview, context, { confirmedHistory: true });
        assert.equal(writes, 1, 'the explicit file confirmation writes exactly one ledger update');
        await assert.rejects(
            commitCurrentChatMemoryFilePreview(preview, pluginContext('another-chat'), { confirmedHistory: true }),
            /另一个角色或聊天窗口/,
        );
        assert.equal(writes, 1, 'a stale preview cannot write after switching chats');
    } finally {
        setMemorySourceLedgerBackendForTests(null);
    }
});

test('r46 a failed ledger write leaves the prior durable source readable', async () => {
    const store = memoryBackend();
    setMemorySourceLedgerBackendForTests(store.backend);
    try {
        await upsertMemorySourceLedger(scope, {
            provider: 'old-provider', revision: 'old-revision',
            records: [{ sourceId: 'old-1', revision: 'old-revision', content: '最后一份有效旧来源' }],
        });
        store.backend.write = async () => { throw new Error('temporary write failure'); };
        await assert.rejects(
            upsertMemorySourceLedger(scope, {
                provider: 'new-provider', revision: 'new-revision',
                records: [{ sourceId: 'new-1', revision: 'new-revision', content: '本轮未落盘' }],
            }),
            /temporary write failure/,
        );
        const preserved = ledgerCurrentRecords(await readMemorySourceLedger(scope));
        assert.deepEqual(preserved.map(item => item.content), ['最后一份有效旧来源']);
    } finally {
        setMemorySourceLedgerBackendForTests(null);
    }
});

test('r46 bounded generation input reports truncation and fingerprints the complete ledger', async () => {
    const store = memoryBackend();
    setMemorySourceLedgerBackendForTests(store.backend);
    try {
        const records = Array.from({ length: 300 }, (_, index) => ({
            sourceId: `bulk-${String(index).padStart(3, '0')}`,
            revision: 'bulk-v1',
            content: `记录${String(index).padStart(3, '0')}：${'证'.repeat(990)}`,
        }));
        await upsertMemorySourceLedger(scope, {
            provider: 'bulk-provider', providerVersion: '1', revision: 'bulk-v1',
            coverage: { status: 'complete', returned: 300, total: 300 },
            records,
        });
        const first = externalMemoryFromSourceLedger(await readMemorySourceLedger(scope));
        assert.ok(first.records.length <= 256);
        assert.ok(first.records.reduce((sum, item) => sum + item.content.length, 0) <= 240000);
        assert.equal(first.sources[0].coverage.status, 'truncated');
        assert.match(first.sources[0].coverage.reason, /来源账本保存完整；本次档案生成选取 256\/300 条来源记录/);

        const promptIds = new Set(first.records.map(item => item.externalId.replace(/^P[^:]+:/, '').replace(/:part:\d+$/, '')));
        const outsidePrompt = records.find(item => !promptIds.has(item.sourceId));
        assert.ok(outsidePrompt, 'fixture must include a record outside the bounded prompt view');
        await upsertMemorySourceLedger(scope, {
            provider: 'bulk-provider', providerVersion: '1', revision: 'bulk-v2',
            coverage: { status: 'complete', returned: 300, total: 300 },
            records: [{ ...outsidePrompt, revision: 'bulk-v2', content: `${outsidePrompt.content}（已更新）` }],
        });
        const second = externalMemoryFromSourceLedger(await readMemorySourceLedger(scope));
        assert.notEqual(second.fingerprint, first.fingerprint, 'a change outside the prompt sample must still invalidate incremental state');
    } finally {
        setMemorySourceLedgerBackendForTests(null);
    }
});

test('r46 world-info selection defaults to explanation and preserves explicit history marking', () => {
    assert.equal(normalizeMemoryWorldInfoBook({ name: '记忆解释', all: true }).historySource, false);
    assert.equal(normalizeMemoryWorldInfoBook({ name: '历史摘要', all: true, historySource: true }).historySource, true);
});

test('r46 oversized history-world-info entries are reported and never half-saved as complete', () => {
    const entry = normalizeMemoryWorldInfoEntry('历史书', { uid: 1, content: '史'.repeat(MAX_MEMORY_WORLD_INFO_CHARS + 1) });
    assert.equal(entry.contentTruncated, true);
    assert.equal(entry.originalChars, MAX_MEMORY_WORLD_INFO_CHARS + 1);
    const batch = selectedWorldInfoHistoryBatch({
        entries: [],
        historyCoverage: { status: 'truncated', returned: 0, total: 1, reason: '超出上限，未切半保存' },
    });
    assert.equal(batch.records.length, 0);
    assert.equal(batch.coverage.status, 'truncated');
});

test('r46 unmarking the last history world-info book writes a complete empty tombstone', async () => {
    const store = memoryBackend();
    const previousSillyTavern = globalThis.SillyTavern;
    const context = pluginContext();
    context.getWorldInfoNames = () => ['历史书'];
    context.loadWorldInfo = async () => ({ entries: { 1: { uid: 1, comment: '初见', content: '在雨天第一次见面' } } });
    context.saveMetadataDebounced = () => {};
    globalThis.SillyTavern = { getContext: () => context };
    setMemorySourceLedgerBackendForTests(store.backend);
    try {
        setMemoryWorldInfoSelection(context, { books: [{ name: '历史书', all: true, historySource: true }] });
        await syncSelectedWorldInfoHistoryLedger(context);
        assert.deepEqual(ledgerCurrentRecords(await readMemorySourceLedger(memorySourceScopeForContext(context))).map(item => item.content), ['在雨天第一次见面']);
        updateMemoryWorldInfoBookSelection(context, '历史书', { historySource: false });
        await syncSelectedWorldInfoHistoryLedger(context);
        const ledger = await readMemorySourceLedger(memorySourceScopeForContext(context));
        assert.deepEqual(ledgerCurrentRecords(ledger), []);
        assert.equal(ledger.sources.find(item => item.sourceKind === 'world-info-history-book').coverage.status, 'complete');
    } finally {
        setMemorySourceLedgerBackendForTests(null);
        if (previousSillyTavern === undefined) delete globalThis.SillyTavern;
        else globalThis.SillyTavern = previousSillyTavern;
    }
});

test('r46 unmarking history book A stays effective when remaining history book B only partially reads', async () => {
    const store = memoryBackend();
    const previousSillyTavern = globalThis.SillyTavern;
    const context = pluginContext();
    let failBookB = false;
    context.getWorldInfoNames = () => ['A', 'B'];
    context.loadWorldInfo = async name => {
        if (name === 'B' && failBookB) throw new Error('temporary B failure');
        return { entries: { 1: { uid: 1, comment: name, content: `${name}-history` } } };
    };
    context.saveMetadataDebounced = () => {};
    globalThis.SillyTavern = { getContext: () => context };
    setMemorySourceLedgerBackendForTests(store.backend);
    try {
        setMemoryWorldInfoSelection(context, { books: [
            { name: 'A', all: true, historySource: true },
            { name: 'B', all: true, historySource: true },
        ] });
        await syncSelectedWorldInfoHistoryLedger(context);
        failBookB = true;
        updateMemoryWorldInfoBookSelection(context, 'A', { historySource: false });
        const result = await syncSelectedWorldInfoHistoryLedger(context);
        assert.equal(result.historyCoverage.status, 'partial');
        assert.deepEqual(ledgerCurrentRecords(await readMemorySourceLedger(memorySourceScopeForContext(context))).map(item => item.content), ['B-history']);
    } finally {
        setMemorySourceLedgerBackendForTests(null);
        if (previousSillyTavern === undefined) delete globalThis.SillyTavern;
        else globalThis.SillyTavern = previousSillyTavern;
    }
});

test('r46 migrates the legacy combined world-history baseline before a per-book partial read', async () => {
    const store = memoryBackend();
    const previousSillyTavern = globalThis.SillyTavern;
    const context = pluginContext();
    context.getWorldInfoNames = () => ['A', 'B'];
    context.loadWorldInfo = async name => {
        if (name === 'B') throw new Error('temporary B failure');
        return { entries: { 1: { uid: 1, content: 'A-new' } } };
    };
    context.saveMetadataDebounced = () => {};
    globalThis.SillyTavern = { getContext: () => context };
    setMemorySourceLedgerBackendForTests(store.backend);
    try {
        const ledgerScope = memorySourceScopeForContext(context);
        await upsertMemorySourceLedger(ledgerScope, {
            provider: 'selected-world-info-history', sourceKind: 'world-info-history-legacy', revision: 'legacy-1',
            coverage: { status: 'complete', returned: 2, total: 2 },
            records: [
                { sourceId: 'world:A:1', content: 'A-old' },
                { sourceId: 'world:B:1', content: 'B-old' },
            ],
        });
        setMemoryWorldInfoSelection(context, { books: [
            { name: 'A', all: true, historySource: true },
            { name: 'B', all: true, historySource: true },
        ] });
        await syncSelectedWorldInfoHistoryLedger(context);
        assert.deepEqual(ledgerCurrentRecords(await readMemorySourceLedger(ledgerScope)).map(item => item.content).sort(), ['A-new', 'B-old']);
    } finally {
        setMemorySourceLedgerBackendForTests(null);
        if (previousSillyTavern === undefined) delete globalThis.SillyTavern;
        else globalThis.SillyTavern = previousSillyTavern;
    }
});

test('r46 a precise world-history UID revocation applies even when the next book read fails', async () => {
    const store = memoryBackend();
    const previousSillyTavern = globalThis.SillyTavern;
    const context = pluginContext();
    let fail = false;
    context.getWorldInfoNames = () => ['A'];
    context.loadWorldInfo = async () => {
        if (fail) throw new Error('temporary A failure');
        return { entries: {
            1: { uid: 1, content: 'A-one' },
            2: { uid: 2, content: 'A-two' },
        } };
    };
    context.saveMetadataDebounced = () => {};
    globalThis.SillyTavern = { getContext: () => context };
    setMemorySourceLedgerBackendForTests(store.backend);
    try {
        setMemoryWorldInfoSelection(context, { books: [{ name: 'A', all: false, entryUids: ['1', '2'], historySource: true }] });
        await syncSelectedWorldInfoHistoryLedger(context);
        fail = true;
        setMemoryWorldInfoSelection(context, { books: [{ name: 'A', all: false, entryUids: ['2'], historySource: true }] });
        await syncSelectedWorldInfoHistoryLedger(context);
        assert.deepEqual(ledgerCurrentRecords(await readMemorySourceLedger(memorySourceScopeForContext(context))).map(item => item.content), ['A-two']);
    } finally {
        setMemorySourceLedgerBackendForTests(null);
        if (previousSillyTavern === undefined) delete globalThis.SillyTavern;
        else globalThis.SillyTavern = previousSillyTavern;
    }
});

test('r46 a precise UID revocation filters durable input while the replacement world-book read is still pending', async () => {
    const store = memoryBackend();
    const previousSillyTavern = globalThis.SillyTavern;
    const context = pluginContext();
    let pendingRead = false;
    let rejectPendingRead = null;
    let markReadStarted = null;
    const readStarted = new Promise(resolve => { markReadStarted = resolve; });
    const readGate = new Promise((_resolve, reject) => { rejectPendingRead = reject; });
    context.getWorldInfoNames = () => ['A'];
    context.loadWorldInfo = async () => {
        if (pendingRead) {
            markReadStarted();
            return readGate;
        }
        return { entries: {
            1: { uid: 1, content: 'A-one' },
            2: { uid: 2, content: 'A-two' },
        } };
    };
    context.saveMetadataDebounced = () => {};
    globalThis.SillyTavern = { getContext: () => context };
    setMemorySourceLedgerBackendForTests(store.backend);
    let syncing = null;
    try {
        setMemoryWorldInfoSelection(context, { books: [{ name: 'A', all: false, entryUids: ['1', '2'], historySource: true }] });
        await syncSelectedWorldInfoHistoryLedger(context);

        pendingRead = true;
        setMemoryWorldInfoSelection(context, { books: [{ name: 'A', all: false, entryUids: ['2'], historySource: true }] });
        syncing = syncSelectedWorldInfoHistoryLedger(context);
        await readStarted;

        const duringRead = await currentMemorySourceLedgerExternal(context);
        assert.deepEqual(duringRead.records.map(item => item.content), ['A-two']);

        rejectPendingRead(new Error('temporary A failure'));
        const result = await syncing;
        assert.equal(result.historyCoverage.status, 'partial');
        const afterFailure = await currentMemorySourceLedgerExternal(context);
        assert.deepEqual(afterFailure.records.map(item => item.content), ['A-two']);
    } finally {
        rejectPendingRead?.(new Error('test cleanup'));
        await syncing?.catch(() => undefined);
        setMemorySourceLedgerBackendForTests(null);
        if (previousSillyTavern === undefined) delete globalThis.SillyTavern;
        else globalThis.SillyTavern = previousSillyTavern;
    }
});

test('r46 world-history sync clears only its captured preflight and preflight reads reject wrong-chat payloads', async () => {
    const store = memoryBackend();
    const previousSillyTavern = globalThis.SillyTavern;
    let currentChatId = 'old-chat';
    const context = pluginContext();
    context.getCurrentChatId = () => currentChatId;
    context.getWorldInfoNames = () => ['历史书'];
    context.loadWorldInfo = async () => ({ entries: { 1: { uid: 1, content: '旧聊天历史' } } });
    context.saveMetadataDebounced = () => {};
    globalThis.SillyTavern = { getContext: () => context };
    setMemoryWorldInfoSelection(context, { books: [{ name: '历史书', all: true, historySource: true }] });
    const originalWrite = store.backend.write;
    store.backend.write = async ledger => {
        await originalWrite(ledger);
        currentChatId = 'new-chat';
        runtimeState.memoryPreflightCache.set(chatScopeKey(context, 'new-chat'), { chatId: 'new-chat', records: [{ content: '新聊天' }] });
        return true;
    };
    setMemorySourceLedgerBackendForTests(store.backend);
    try {
        await assert.rejects(syncSelectedWorldInfoHistoryLedger(context, 'old-chat'), error => error?.name === 'AbortError' && error?.worldHistoryPersisted === true);
        assert.equal(getMemoryPreflight(context)?.records?.[0]?.content, '新聊天');
        runtimeState.memoryPreflightCache.set(chatScopeKey(context, 'new-chat'), { chatId: 'old-chat', records: [{ content: '串页' }] });
        assert.equal(getMemoryPreflight(context), null);
    } finally {
        runtimeState.memoryPreflightCache.clear();
        setMemorySourceLedgerBackendForTests(null);
        if (previousSillyTavern === undefined) delete globalThis.SillyTavern;
        else globalThis.SillyTavern = previousSillyTavern;
    }
});

test('r46 source-ledger identity survives a display-name or ordinary card-content edit', () => {
    const renamed = normalizeMemorySourceScope({ ...scope, characterName: '新名字' });
    const original = normalizeMemorySourceScope(scope);
    assert.equal(renamed.key, original.key);
    const context = pluginContext();
    const before = memorySourceScopeForContext(context);
    context.name2 = '新名字';
    context.characters[0].data.description = '角色卡普通内容更新';
    const after = memorySourceScopeForContext(context);
    assert.equal(after.key, before.key);
    const sameAvatarOtherCard = pluginContext();
    sameAvatarOtherCard.characters.push({ name: '另一个角色', avatar: 'test.png', data: { name: '另一个角色', avatar: 'test.png' } });
    sameAvatarOtherCard.characterId = 1;
    sameAvatarOtherCard.name2 = '另一个角色';
    assert.notEqual(memorySourceScopeForContext(sameAvatarOtherCard).key, before.key);
});

test('r46 accepts a bound external-history-only archive input', () => {
    assert.equal(archiveInputAvailable({ messages: [] }, { records: [{ externalId: 'history-only' }] }), true);
    assert.equal(archiveInputAvailable({ messages: [] }, { records: [] }), false);
});

test('r46 file-import consent is separate from automatic third-party scanning and shows binding preview', async () => {
    const source = await readFile(new URL('../src/ui/settingsPanel.js', import.meta.url), 'utf8');
    const start = source.indexOf('const memoryFileCommit =');
    const end = source.indexOf('const memorySourceClear =', start);
    assert.ok(start >= 0 && end > start);
    assert.doesNotMatch(source.slice(start, end), /readCurrentChatMemoryPlugins/);
    assert.match(source, /data-rmt-memory-file-preview-binding/);
    assert.match(source, /data-rmt-memory-file-preview-sample/);
    assert.match(source, /\.markdown/);
});
