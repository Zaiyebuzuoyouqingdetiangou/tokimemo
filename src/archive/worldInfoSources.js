import * as context_tags from '../core/contextTags.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as host_compatibility from '../core/hostCompatibility.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as archive_memoryFileImport from './memoryFileImport.js';
import * as archive_memoryProviders from './memoryProviders.js';
import * as sourceGuard from './sourceReadGuard.js';
import * as archive_sourceLedger from './sourceLedger.js';
import { clearMemoryPreflight, safeOwnDataEntries, safeOwnDataValue } from './archiveCore.js';
// 建档来源：记忆来源作用域、世界书选择与读取、世界书历史批次与来源账本
// 从 archive/repository.js 原样搬出（重构阶段 2），声明文本一字未改；archive/repository.js 仍转发原有导出。

export function memorySourceScopeForContext(context = core_context.currentCharacterGuard(), chatId = core_context.getChatId(context)) {
    const stableCardLocator = `${core_context.currentCharacterKey(context)}\u001fcharacter:${String(context?.characterId ?? '')}`;
    return archive_sourceLedger.normalizeMemorySourceScope({
        characterKey: stableCardLocator,
        characterName: core_text.normalizeText(context?.name2, 120),
        chatId: core_context.comparableChatId(chatId),
    });
}

export async function currentMemorySourceLedger(context = core_context.currentCharacterGuard()) {
    return archive_sourceLedger.readMemorySourceLedger(memorySourceScopeForContext(context));
}

export async function currentMemorySourceLedgerSummary(context = core_context.currentCharacterGuard()) {
    return archive_sourceLedger.memorySourceLedgerSummary(await currentMemorySourceLedger(context));
}

export function emptyMemoryWorldInfo(fingerprint = 'none') {
    return { entries: [], books: [], totalChars: 0, fingerprint };
}

function worldHistoryRecordAllowedBySelection(record, descriptor, selection) {
    const isBookSource = descriptor?.sourceKind === 'world-info-history-book'
        || String(descriptor?.provider || '').startsWith('selected-world-info-history:');
    const isLegacySource = descriptor?.sourceKind === 'world-info-history-legacy'
        || descriptor?.provider === 'selected-world-info-history';
    if (!isBookSource && !isLegacySource) return true;
    const activeBooks = (Array.isArray(selection?.books) ? selection.books : [])
        .filter(book => book?.historySource === true);
    if (isBookSource) {
        const book = activeBooks.find(item => item.name === descriptor.sourceKey);
        if (!book) return false;
        if (book.all) return true;
        const allowed = new Set(book.entryUids.map(uid => worldInfoHistorySourceId(book.name, uid)));
        if (allowed.has(record.sourceId)) return true;
        const legacyPrefix = `world:${book.name}:`;
        return record.sourceId.startsWith(legacyPrefix) && book.entryUids.includes(record.sourceId.slice(legacyPrefix.length));
    }
    for (const book of activeBooks) {
        const prefix = `world:${book.name}:`;
        if (!record.sourceId.startsWith(prefix)) continue;
        if (book.all) return true;
        return book.entryUids.includes(record.sourceId.slice(prefix.length));
    }
    return false;
}

export function externalMemoryFromSourceLedger(ledger, options = {}) {
    const descriptors = new Map((Array.isArray(ledger?.sources) ? ledger.sources : [])
        .map(source => [source.provider, source]));
    const selection = options?.worldInfoSelection;
    const current = archive_sourceLedger.ledgerCurrentRecords(ledger)
        .filter(record => !selection || worldHistoryRecordAllowedBySelection(record, descriptors.get(record.provider), selection))
        .filter(record => options.useCurrentChatExternalMemory !== false || !archive_memoryProviders.registeredMemoryProvider(record.provider))
        .filter(record => !options.excludeProviders?.has(record.provider));
    const selected = current;
    const records = normalizeExternalMemoryRecords(selected, { complete: true, tagPolicy: options.tagPolicy });
    const sources = (ledger?.sources || []).map(item => {
        const storedRows = current.filter(record => record.provider === item.provider);
        const selectedRows = selected.filter(record => record.provider === item.provider);
        const promptRows = records.filter(record => record.provider === item.provider);
        const storedChars = storedRows.reduce((sum, record) => sum + record.content.length, 0);
        const promptChars = promptRows.reduce((sum, record) => sum + record.content.length, 0);
        const coverage = archive_sourceLedger.normalizeMemorySourceCoverage(item.coverage);
        if (selectedRows.length < storedRows.length || promptChars < storedChars) {
            const limitReason = `${options.tagPolicy?.mode === 'keep' ? '按已保存标签选择整理；' : ''}来源账本保存完整；本次档案生成选取 ${selectedRows.length}/${storedRows.length} 条来源记录，送入 ${promptRows.length} 个片段、${promptChars.toLocaleString()}/${storedChars.toLocaleString()} 字符`;
            if (options.tagPolicy?.mode !== 'keep') coverage.status = 'truncated';
            coverage.returned = selectedRows.length;
            coverage.total = storedRows.length;
            coverage.reason = coverage.reason ? `${coverage.reason}；${limitReason}` : limitReason;
        }
        return {
            id: item.provider,
            label: core_text.normalizeText(item.label, 100) || item.provider,
            kind: 'durable-ledger',
            count: selectedRows.length,
            coverage,
        };
    });
    // The change detector uses the complete durable identity set, not the bounded
    // prompt view. A revision outside the 256-item/240k input sample must still make
    // an incremental archive update notice that its sources changed.
    const ledgerFingerprint = current.length
        ? String(core_text.hashString(current.map(item => `${item.provider}|${item.sourceId}|${item.revision}|${item.sourceHash}`).join('\n')))
        : 'none';
    const fingerprint = ledgerFingerprint === 'none'
        ? 'none'
        : String(core_text.hashString(`LEDGER:${ledgerFingerprint}|LIVE:none`));
    const promptChars = records.reduce((sum, item) => sum + item.content.length, 0);
    return {
        records,
        sources,
        fingerprint,
        ledgerFingerprint,
        recordChars: promptChars,
        totalChars: promptChars,
        storedRecordCount: current.length,
        storedChars: current.reduce((sum, item) => sum + item.content.length, 0),
        worldInfo: emptyMemoryWorldInfo('durable-ledger'),
        sourceMode: 'durable-ledger',
    };
}

export async function currentMemorySourceLedgerExternal(context = core_context.currentCharacterGuard()) {
    return externalMemoryFromSourceLedger(await currentMemorySourceLedger(context), {
        worldInfoSelection: getMemoryWorldInfoSelection(context),
        useCurrentChatExternalMemory: core_settings.getPluginSettings(context).useCurrentChatExternalMemory,
        tagPolicy: context_tags.tagPolicyForContext(context),
    });
}

export async function previewCurrentChatMemoryFile(file, context = core_context.currentCharacterGuard()) {
    return archive_memoryFileImport.previewMemoryFile(file, memorySourceScopeForContext(context));
}

export async function commitCurrentChatMemoryFilePreview(preview, context = core_context.currentCharacterGuard(), options = {}) {
    if (options.confirmedHistory !== true) {
        throw new Error('请先明确确认：这个文件记录的是已经发生的历史/摘要，而不是角色设定。');
    }
    const scope = memorySourceScopeForContext(context);
    archive_memoryFileImport.assertMemoryFilePreviewBinding(preview, scope);
    const ledger = await archive_sourceLedger.upsertMemorySourceLedger(scope, {
        ...preview,
        sourceKind: 'file-user-confirmed-history-summary',
    });
    clearMemoryPreflight(context);
    return archive_sourceLedger.memorySourceLedgerSummary(ledger);
}

export async function clearCurrentChatImportedSources(context = core_context.currentCharacterGuard()) {
    await archive_sourceLedger.deleteMemorySourceLedger(memorySourceScopeForContext(context));
    clearMemoryPreflight(context);
    return true;
}

export function normalizeMemoryWorldInfoBook(value) {
    const name = core_text.normalizeText(value?.name, 240);
    if (!name) return null;
    const all = value?.all === true;
    const entryLimit = value?.historySource === true ? Infinity : core_constants.MAX_MEMORY_WORLD_INFO_ENTRIES;
    const entryUids = all ? [] : core_text.cleanArray(value?.entryUids, entryLimit, 120).map(String);
    if (!all && !entryUids.length) return null;
    return { name, all, historySource: value?.historySource === true, entryUids: [...new Set(entryUids)] };
}

export function getMemoryWorldInfoSelection(context = core_context.currentCharacterGuard()) {
    const raw = context.chatMetadata?.[core_constants.MEMORY_WORLD_INFO_SETTINGS_KEY];
    const books = (Array.isArray(raw?.books) ? raw.books : [])
        .map(normalizeMemoryWorldInfoBook)
        .filter(Boolean);
    return { books, updatedAt: Math.max(0, Number(raw?.updatedAt) || 0) };
}

export function setMemoryWorldInfoSelection(context, selection) {
    if (!context.chatMetadata || typeof context.chatMetadata !== 'object') throw new Error('当前聊天无法保存记忆相关世界书选择。');
    const books = (Array.isArray(selection?.books) ? selection.books : [])
        .map(normalizeMemoryWorldInfoBook)
        .filter(Boolean);
    if (books.length) context.chatMetadata[core_constants.MEMORY_WORLD_INFO_SETTINGS_KEY] = { books, updatedAt: Date.now() };
    else delete context.chatMetadata[core_constants.MEMORY_WORLD_INFO_SETTINGS_KEY];
    context.saveMetadataDebounced?.();
    clearMemoryPreflight(context);
}

export function updateMemoryWorldInfoBookSelection(context, worldName, patch) {
    const name = core_text.normalizeText(worldName, 240);
    if (!name) return;
    const current = getMemoryWorldInfoSelection(context);
    const byName = new Map(current.books.map(item => [item.name, { ...item, entryUids: [...item.entryUids] }]));
    const existing = byName.get(name) || { name, all: false, entryUids: [] };
    const next = { ...existing, ...(patch || {}) };
    if (next.all) next.entryUids = [];
    const normalized = normalizeMemoryWorldInfoBook(next);
    if (normalized) byName.set(name, normalized); else byName.delete(name);
    setMemoryWorldInfoSelection(context, { books: [...byName.values()] });
}

export function memoryWorldInfoSelectionSummary(context = core_context.currentCharacterGuard()) {
    const selection = getMemoryWorldInfoSelection(context);
    if (!selection.books.length) return '未选择记忆相关世界书';
    const whole = selection.books.filter(book => book.all).length;
    const precise = selection.books.reduce((sum, book) => sum + (book.all ? 0 : book.entryUids.length), 0);
    const parts = [`${selection.books.length} 本`];
    if (whole) parts.push(`${whole} 本整本`);
    if (precise) parts.push(`${precise} 个精确条目`);
    return `已选择：${parts.join(' · ')}`;
}

export function hasMemoryWorldInfoSelection(context = core_context.currentCharacterGuard()) {
    return getMemoryWorldInfoSelection(context).books.length > 0;
}

export function normalizeMemoryWorldInfoEntry(world, entry, fallbackUid = '', { historySource = false, participantSource = false } = {}) {
    if (!entry || typeof entry !== 'object') return null;
    const readLabel = (value, length) => participantSource ? String(value ?? '') : core_text.normalizeText(value, length);
    const uid = readLabel(safeOwnDataValue(entry, 'uid') ?? fallbackUid, 120);
    const rawContent = participantSource ? String(safeOwnDataValue(entry, 'content') ?? '')
        : String(safeOwnDataValue(entry, 'content') ?? '').replace(/\u0000/g, '').trim();
    const originalChars = rawContent.length;
    const limit = participantSource ? Infinity : historySource ? core_constants.MAX_MEMORY_SOURCE_LEDGER_CHARS : core_constants.MAX_MEMORY_WORLD_INFO_CHARS;
    const contentTruncated = originalChars > limit;
    const content = contentTruncated
        ? rawContent.slice(0, limit + 1)
        : rawContent;
    if (!uid || !content) return null;
    const title = readLabel(safeOwnDataValue(entry, 'comment') ?? safeOwnDataValue(entry, 'title') ?? safeOwnDataValue(entry, 'name'), 180) || `条目 ${uid}`;
    const primaryKeys = safeOwnDataValue(entry, 'key');
    const secondaryKeys = safeOwnDataValue(entry, 'keysecondary');
    const rawKeys = [...(Array.isArray(primaryKeys) ? primaryKeys : []), ...(Array.isArray(secondaryKeys) ? secondaryKeys : [])];
    const keys = participantSource ? rawKeys.filter(key => typeof key === 'string') : core_text.cleanArray(rawKeys, 12, 120);
    return { world: readLabel(world, 240), uid, title, keys, content, originalChars, contentTruncated, disabled: safeOwnDataValue(entry, 'disable') === true };
}

export function worldInfoEntriesFromData(world, data, options = {}) {
    const entriesValue = safeOwnDataValue(data, 'entries');
    const raw = entriesValue && typeof entriesValue === 'object' ? entriesValue : {};
    return safeOwnDataEntries(raw)
        .map(([key, value]) => normalizeMemoryWorldInfoEntry(world, value, key, options))
        .filter(Boolean)
        .sort((a, b) => Number(a.uid) - Number(b.uid) || String(a.uid).localeCompare(String(b.uid)));
}

export async function loadMemoryWorldInfoBook(context, worldName, signal = null, options = {}) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (typeof context.loadWorldInfo !== 'function') throw new Error('当前 SillyTavern 没有公开的世界书读取接口。');
    const name = options.participantSource ? String(worldName ?? '') : core_text.normalizeText(worldName, 240);
    // Old hosts could already read an explicitly selected book by name. Adding the
    // interactive list adapter must not make that existing path depend on listing.
    const validateListedName = typeof context.getWorldInfoNames === 'function'
        && !host_compatibility.isAdaptedWorldInfoNameReader(context.getWorldInfoNames);
    const rawNames = validateListedName ? await sourceGuard.boundedSourceRead(() => context.getWorldInfoNames(), signal) : [];
    const names = options.participantSource ? (Array.isArray(rawNames) ? rawNames.filter(value => typeof value === 'string') : [])
        : core_text.cleanArray(rawNames, 500, 240);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!name || (validateListedName && !names.includes(name))) throw new Error('所选世界书已经不存在，或当前 SillyTavern 无法读取。');
    const data = await sourceGuard.boundedSourceRead(() => context.loadWorldInfo(name), signal);
    const entries = safeOwnDataValue(data, 'entries');
    if (!entries || typeof entries !== 'object') throw new Error('世界书未返回有效条目列表。');
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return worldInfoEntriesFromData(name, data, options);
}

export async function collectSelectedMemoryWorldInfo(context, expectedChatId, signal, { settingsOnly = false } = {}) {
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    const sourceScope = core_context.chatScopeKey(context, expectedChatId);
    const selection = getMemoryWorldInfoSelection(context);
    const selectionSignature = JSON.stringify(selection);
    const assertSourceScope = () => {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
        // Detached archive tasks own a source-chat selection captured from that
        // exact chat header; they must not consult the currently visible chat.
        if (Object.hasOwn(context, '__rmtArchiveTargetEntryId') && context.__rmtArchiveTargetEntryId) return;
        const current = core_context.currentCharacterGuard();
        if (core_context.chatScopeKey(current) !== sourceScope
            || JSON.stringify(getMemoryWorldInfoSelection(current)) !== selectionSignature) throw new DOMException('Source scope changed', 'AbortError');
    };
    assertSourceScope();
    const emptyCoverage = { status: 'complete', returned: 0, total: 0, reason: '当前没有选择世界书条目' };
    if (!selection.books.length) return { entries: [], books: [], totalChars: 0, fingerprint: 'none', coverage: emptyCoverage, historyCoverage: { ...emptyCoverage, reason: '当前没有标记为历史摘要的世界书条目' } };
    const entries = [];
    const books = [];
    let totalChars = 0, historyChars = 0, contextChars = 0, contextCount = 0;
    let requested = 0;
    let requestedChars = 0;
    let truncated = 0;
    let failedBooks = 0;
    let historyRequested = 0;
    let historyImported = 0;
    let historyTruncated = 0;
    let historyFailedBooks = 0;
    for (const book of selection.books.filter(book => !settingsOnly || book.historySource !== true)) {
        assertSourceScope();
        let loaded;
        try { loaded = await loadMemoryWorldInfoBook(context, book.name, signal, { historySource: book.historySource === true }); }
        catch (error) {
            if (error?.name === 'AbortError') throw error;
            assertSourceScope();
            console.warn('[HeartbeatMemories] selected memory world info skipped', { code: 'RMT_WORLD_INFO_READ_FAILED' });
            failedBooks += 1;
            if (book.historySource === true) historyFailedBooks += 1;
            books.push({
                name: book.name,
                mode: book.all ? 'all' : 'selected',
                historySource: book.historySource === true,
                requested: book.all ? null : book.entryUids.length,
                imported: 0,
                error: true,
                coverage: 'partial',
                coverageInfo: { status: 'partial', returned: 0, total: null, reason: '这本世界书本轮读取失败；保留上次成功读取的历史来源' },
            });
            continue;
        }
        assertSourceScope();
        const uidSet = new Set(book.entryUids.map(String));
        const chosen = book.all ? loaded : loaded.filter(entry => uidSet.has(String(entry.uid)));
        const missing = !book.all && chosen.length < uidSet.size;
        if (missing) { failedBooks += 1; if (book.historySource === true) historyFailedBooks += 1; }
        let imported = 0;
        let bookTruncated = 0;
        for (const entry of chosen) {
            requested += 1;
            requestedChars += Number(entry.originalChars) || entry.content.length;
            if (book.historySource === true) historyRequested += 1;
            const isHistory = book.historySource === true;
            const remaining = isHistory ? core_constants.MAX_MEMORY_SOURCE_LEDGER_CHARS - historyChars
                : core_constants.MAX_MEMORY_WORLD_INFO_CHARS - contextChars;
            const entryLimit = isHistory ? historyImported >= core_constants.MAX_MEMORY_SOURCE_LEDGER_RECORDS
                : contextCount >= core_constants.MAX_MEMORY_WORLD_INFO_ENTRIES;
            // Never save half of a history entry while claiming it is complete.
            if (entryLimit || remaining <= 0 || entry.contentTruncated || entry.content.length > remaining) {
                truncated += 1;
                bookTruncated += 1;
                if (book.historySource === true) historyTruncated += 1;
                continue;
            }
            entries.push({ ...entry, historySource: book.historySource === true });
            totalChars += entry.content.length;
            if (isHistory) historyChars += entry.content.length;
            else { contextChars += entry.content.length; contextCount += 1; }
            imported += 1;
            if (book.historySource === true) historyImported += 1;
        }
        books.push({
            name: book.name,
            mode: book.all ? 'all' : 'selected',
            historySource: book.historySource === true,
            requested: chosen.length,
            imported,
            truncated: bookTruncated,
            error: missing,
            coverage: bookTruncated ? 'truncated' : missing ? 'partial' : 'complete',
            coverageInfo: missing
                ? { status: 'partial', returned: imported, total: uidSet.size, reason: '已选条目有缺失，本次读取不完整' }
                : bookTruncated
                ? { status: 'truncated', returned: imported, total: chosen.length, reason: `${bookTruncated} 条超过本次世界书条数/字符上限，未切半保存` }
                : { status: 'complete', returned: imported, total: chosen.length, reason: '已完整读取这本世界书中明确选择的条目' },
        });
    }
    const fingerprint = entries.length
        ? String(core_text.hashString(entries.map(item => `${item.world}|${item.uid}|${item.title}|${item.content}`).join('\n')))
        : 'none';
    const coverageStatus = truncated ? 'truncated' : (failedBooks ? 'partial' : 'complete');
    const coverageReason = truncated
        ? `设定背景上限 ${core_constants.MAX_MEMORY_WORLD_INFO_ENTRIES} 条 / ${core_constants.MAX_MEMORY_WORLD_INFO_CHARS.toLocaleString()} 字符；历史来源无固定条数或字符上限；${truncated} 条未读取，未切半保存`
        : (failedBooks ? `${failedBooks} 本世界书读取失败；只使用已成功读取的条目` : '已完整读取本次明确选择的世界书条目');
    const historyStatus = historyTruncated ? 'truncated' : (historyFailedBooks ? 'partial' : 'complete');
    const historyReason = historyTruncated
        ? `历史摘要世界书有 ${historyTruncated} 条超过条数/字符上限，未切半保存；旧完整批次会保留到成功完整扫描`
        : (historyFailedBooks ? `${historyFailedBooks} 本历史摘要世界书读取失败；旧完整批次会保留到成功完整扫描` : '用户明确标记的历史摘要世界书条目已完整读取');
    return {
        entries,
        books,
        totalChars,
        requestedChars,
        fingerprint,
        coverage: { status: coverageStatus, returned: entries.length, total: failedBooks ? null : requested, reason: coverageReason },
        historyCoverage: { status: historyStatus, returned: historyImported, total: historyFailedBooks ? null : historyRequested, reason: historyReason },
    };
}

export function selectedWorldInfoHistoryBatch(worldInfo) {
    const historyEntries = (Array.isArray(worldInfo?.entries) ? worldInfo.entries : []).filter(item => item.historySource === true);
    const coverage = archive_sourceLedger.normalizeMemorySourceCoverage(
        worldInfo?.historyCoverage,
        worldInfo?.historyCoverage?.status || 'partial',
    );
    const revision = String(core_text.hashString([
        coverage.status,
        coverage.returned,
        coverage.total ?? 'unknown',
        ...historyEntries.map(item => `${item.world}|${item.uid}|${item.content}`),
    ].join('\n')));
    return {
        provider: 'selected-world-info-history',
        label: '历史摘要世界书',
        sourceKind: 'world-info-history-legacy',
        providerVersion: '1',
        revision,
        records: historyEntries.map(item => ({
            provider: 'selected-world-info-history',
            providerVersion: '1',
            sourceId: `world:${item.world}:${item.uid}`,
            revision,
            type: 'user-confirmed-history-summary',
            title: item.title,
            content: item.content,
        })),
        coverage,
    };
}

function worldInfoHistoryProviderId(worldName) {
    const name = String(worldName || '').replace(/\u0000/g, '').trim();
    const first = core_text.hashString(name).toString(36).replace('-', 'n');
    const second = core_text.hashString(`${name.length}|${name.slice(0, 2048)}|${name.slice(-2048)}`).toString(36).replace('-', 'n');
    return `selected-world-info-history:${first}${second}`;
}

function worldInfoHistorySourceId(worldName, uid) {
    // Provider identity already scopes one book, so the compact UID remains both
    // readable and collision-safe even when the world-book name is hundreds of chars.
    const safeUid = archive_sourceLedger.normalizeMemorySourceId(uid);
    return `world-entry:${safeUid || core_text.hashString(String(uid ?? '')).toString(36).replace('-', 'n')}`;
}

export function selectedWorldInfoHistoryBatches(worldInfo, selection, previousLedger = null) {
    const activeBooks = (Array.isArray(selection?.books) ? selection.books : []).filter(book => book.historySource === true);
    const activeProviders = new Set();
    const batches = [];
    const previousSources = Array.isArray(previousLedger?.sources) ? previousLedger.sources : [];
    const legacyRecords = archive_sourceLedger.ledgerCurrentRecords(previousLedger)
        .filter(record => record.provider === 'selected-world-info-history');
    for (const book of activeBooks) {
        const provider = worldInfoHistoryProviderId(book.name);
        activeProviders.add(provider);
        const resultBook = (Array.isArray(worldInfo?.books) ? worldInfo.books : []).find(item => item.name === book.name);
        const entries = (Array.isArray(worldInfo?.entries) ? worldInfo.entries : [])
            .filter(item => item.historySource === true && item.world === book.name);
        const coverage = archive_sourceLedger.normalizeMemorySourceCoverage(
            resultBook?.coverageInfo,
            resultBook?.coverageInfo?.status || 'partial',
        );
        const revision = String(core_text.hashString([
            book.name,
            coverage.status,
            coverage.returned,
            coverage.total ?? 'unknown',
            ...entries.map(item => `${item.uid}|${item.content}`),
        ].join('\n')));
        const allowedSourceIds = book.all
            ? null
            : [...new Set(book.entryUids.map(uid => worldInfoHistorySourceId(book.name, uid)))];
        const previousSource = previousSources.find(source => source.provider === provider);
        const previousCoverage = archive_sourceLedger.normalizeMemorySourceCoverage(previousSource?.coverage);
        const hasPerBookBaseline = !!core_text.normalizeText(previousSource?.baselineRevision, 180)
            || (previousCoverage.status === 'complete' && !!core_text.normalizeText(previousSource?.revision, 180));
        // r46 originally stored every history book in one legacy provider. Before
        // tombstoning it, atomically seed each active per-book stream from its own
        // legacy rows when that stream has no baseline yet. A failed first read after
        // upgrade can then preserve B without also retaining obsolete A rows.
        if (!hasPerBookBaseline) {
            const prefix = `world:${book.name}:`;
            const truncatedPrefix = core_text.normalizeText(prefix, 180);
            const migrated = legacyRecords.map(record => {
                let legacyUid = '';
                if (record.sourceId.startsWith(prefix)) legacyUid = record.sourceId.slice(prefix.length);
                else if (prefix.length > 180 && record.sourceId === truncatedPrefix && book.all) legacyUid = '';
                else return null;
                const sourceId = legacyUid
                    ? worldInfoHistorySourceId(book.name, legacyUid)
                    : `legacy-entry:${archive_sourceLedger.normalizeMemorySourceHash(record.sourceHash)}`;
                if (allowedSourceIds && !allowedSourceIds.includes(sourceId)) return null;
                return { ...record, sourceId };
            }).filter(Boolean);
            if (migrated.length) {
                const migrationRevision = `legacy:${core_text.hashString(migrated.map(item => `${item.sourceId}|${item.sourceHash}|${item.content}`).join('\n')).toString(36).replace('-', 'n')}`;
                batches.push({
                    provider,
                    label: `历史摘要 · ${book.name}`,
                    sourceKind: 'world-info-history-book',
                    sourceKey: book.name,
                    providerVersion: '1',
                    revision: migrationRevision,
                    records: migrated.map(item => ({
                        sourceId: item.sourceId,
                        revision: item.revision || migrationRevision,
                        sourceHash: item.sourceHash,
                        type: item.type || 'user-confirmed-history-summary',
                        title: item.title,
                        content: item.content,
                    })),
                    coverage: { status: 'complete', returned: migrated.length, total: migrated.length, reason: '已从旧版合并来源迁移到本书独立基线' },
                    ...(allowedSourceIds ? { allowedSourceIds } : {}),
                });
            }
        }
        batches.push({
            provider,
            label: `历史摘要 · ${book.name}`,
            sourceKind: 'world-info-history-book',
            sourceKey: book.name,
            providerVersion: '1',
            revision,
            records: entries.map(item => ({
                sourceId: worldInfoHistorySourceId(item.world, item.uid),
                revision,
                type: 'user-confirmed-history-summary',
                title: item.title,
                content: item.content,
            })),
            coverage,
            ...(allowedSourceIds ? { allowedSourceIds } : {}),
        });
    }
    for (const source of previousSources) {
        const isBookSource = source.sourceKind === 'world-info-history-book'
            || String(source.provider || '').startsWith('selected-world-info-history:');
        const isLegacySource = source.provider === 'selected-world-info-history';
        if ((!isBookSource || activeProviders.has(source.provider)) && !isLegacySource) continue;
        const sourceKey = core_text.normalizeText(source.sourceKey, 240);
        batches.push({
            provider: source.provider,
            label: core_text.normalizeText(source.label, 100) || (sourceKey ? `历史摘要 · ${sourceKey}` : '历史摘要世界书（旧版）'),
            sourceKind: isLegacySource ? 'world-info-history-legacy' : 'world-info-history-book',
            sourceKey,
            providerVersion: '1',
            revision: `removed:${core_text.hashString(`${source.provider}|${sourceKey}`).toString(36).replace('-', 'n')}`,
            records: [],
            coverage: { status: 'complete', returned: 0, total: 0, reason: '用户已明确取消这项历史摘要来源' },
        });
    }
    return batches;
}

export async function syncSelectedWorldInfoHistoryLedger(context = core_context.currentCharacterGuard(), expectedChatId = core_context.getChatId(context), signal = null) {
    const abortSync = (message, persisted = false) => {
        const error = new Error(message);
        error.name = 'AbortError';
        error.worldHistoryPersisted = persisted;
        return error;
    };
    const assertCurrent = sourceGuard.createSourceReadGuard(context, expectedChatId, signal);
    assertCurrent();
    const chatId = core_context.comparableChatId(expectedChatId);
    const selection = getMemoryWorldInfoSelection(context);
    const selectionFingerprint = String(core_text.hashString(JSON.stringify(selection.books)));
    const preflightKey = core_context.chatScopeKey(context, chatId);
    const worldInfo = await collectSelectedMemoryWorldInfo(context, chatId, signal);
    if (core_context.comparableChatId(core_context.getChatId(core_context.currentCharacterGuard())) !== chatId) throw abortSync('Chat changed');
    const currentSelectionFingerprint = String(core_text.hashString(JSON.stringify(getMemoryWorldInfoSelection(context).books)));
    if (currentSelectionFingerprint !== selectionFingerprint) throw abortSync('World info selection changed');
    const scope = memorySourceScopeForContext(context, chatId);
    let previousLedger;
    try { previousLedger = await archive_sourceLedger.readMemorySourceLedger(scope, { signal }); }
    catch (error) {
        if (error?.name === 'AbortError') throw error;
        if (selection.books.some(book => book.historySource)) throw core_text.safeUserError('历史世界书未能保存，原有来源保留。', 'RMT_LEDGER_UNAVAILABLE');
        assertCurrent(); return worldInfo;
    }
    assertCurrent();
    if (core_context.comparableChatId(core_context.getChatId(core_context.currentCharacterGuard())) !== chatId) throw abortSync('Chat changed');
    if (String(core_text.hashString(JSON.stringify(getMemoryWorldInfoSelection(context).books))) !== selectionFingerprint) throw abortSync('World info selection changed');
    const batches = selectedWorldInfoHistoryBatches(worldInfo, selection, previousLedger);
    if (batches.length) await archive_sourceLedger.upsertMemorySourceLedgerBatches(scope, batches, { assertCurrent, signal });
    assertCurrent();
    runtimeState.memoryPreflightCache.delete(preflightKey);
    if (core_context.comparableChatId(core_context.getChatId(core_context.currentCharacterGuard())) !== chatId) throw abortSync('Chat changed', true);
    if (String(core_text.hashString(JSON.stringify(getMemoryWorldInfoSelection(context).books))) !== selectionFingerprint) throw abortSync('World info selection changed', true);
    return worldInfo;
}

export function memoryWorldInfoPromptBlock(worldInfo) {
    const entries = (Array.isArray(worldInfo?.entries) ? worldInfo.entries : []).filter(item => item?.historySource !== true);
    if (!entries.length) return '';
    const source = JSON.stringify(entries.map(item => ({
        world: item.world,
        uid: item.uid,
        title: item.title,
        keys: item.keys,
        content: item.content,
    })), null, 2);
    return `\nMEMORY_RELATED_WORLD_INFO_CONTEXT（仅解释记忆含义，不是已发生事实证据）：\n${source}\n\n重要：上面的世界书内容只能帮助理解 EXTERNAL_MEMORY_JSON 中的人名、地点、术语、关系背景或记忆条目的上下文。它不能单独生成“已经发生”的回忆，不能作为 sourceExternalId/sourceExternalAnchor，也不能覆盖外部记忆记录本身的含义。若世界书与实际记忆/摘要冲突，以有真实 externalId + anchor 的记忆/摘要为准。`;
}

export async function showMemoryWorldInfoPicker() {
    const context = core_context.currentCharacterGuard();
    if (runtimeState.busy || core_requestCoordinator.hasGenerationTasks()) return globalThis.toastr?.info?.('当前还有任务，等任务结束后再选择世界书。', '心迹回廊');
    const overlay = document.getElementById(core_constants.OVERLAY_ID);
    if (!overlay) {
        globalThis.toastr?.info?.('请从魔法棒打开心迹回廊首页，再选择记忆来源。', '心迹回廊');
        return;
    }
    overlay.querySelector('.rmt-memory-wi-picker')?.remove();
    let names = [];
    try {
        if (typeof context.getWorldInfoNames !== 'function') throw new Error('unavailable');
        names = core_text.cleanArray(await context.getWorldInfoNames(), 500, 240);
    } catch {
        globalThis.toastr?.info?.('酒馆当前未提供可读取的世界书列表，请确认世界书已加载并刷新页面。无需先扫描记忆插件。', '心迹回廊');
    }
    if (core_context.chatScopeKey(context) !== core_context.chatScopeKey(core_context.currentCharacterGuard()) || !overlay.isConnected) return;
    const selection = getMemoryWorldInfoSelection(context);
    const selected = new Map(selection.books.map(book => [book.name, book]));
    const modal = document.createElement('div');
    modal.className = 'rmt-memory-wi-picker';
    modal.innerHTML = `<div class="rmt-memory-wi-picker-card"><div class="rmt-memory-wi-picker-head"><div><b>记忆相关世界书</b><small>整本导入，或展开后精确选择条目</small></div><button type="button" class="rmt-btn" data-rmt-action="memory-worldinfo-close" aria-label="关闭世界书选择">完成／关闭</button></div><div class="rmt-memory-wi-picker-scroll"><div class="rmt-memory-wi-picker-note">记录已发生剧情的书，请选“作为历史摘要”；普通设定书保持不勾选。历史来源完整保存在本地账本，本次建档用量会另行显示。</div><div class="rmt-memory-wi-books">${names.length ? names.map(name => { const book=selected.get(name); const precise=book && !book.all ? book.entryUids.length : 0; return `<section class="rmt-memory-wi-book" data-rmt-memory-wi-book="${core_text.esc(name)}"><div class="rmt-memory-wi-book-row"><label><input type="checkbox" data-rmt-memory-wi-all="${core_text.esc(name)}" ${book?.all ? 'checked' : ''}> <b>${core_text.esc(name)}</b> · 整本导入</label><button type="button" class="rmt-btn" data-rmt-action="memory-worldinfo-expand" data-rmt-memory-world="${core_text.esc(name)}">展开条目${precise ? ` · 已选${precise}` : ''}</button></div><label class="rmt-settings-check"><input type="checkbox" data-rmt-memory-wi-history="${core_text.esc(name)}" ${book?.historySource ? 'checked' : ''} ${book ? '' : 'disabled'}> 作为历史摘要</label><div class="rmt-memory-wi-entry-list" hidden></div></section>`; }).join('') : '<div class="rmt-memory-wi-empty">当前没有可读取的世界书。</div>'}</div></div></div>`;
    overlay.appendChild(modal);
}

export async function expandMemoryWorldInfoBook(button) {
    const context = core_context.currentCharacterGuard();
    const world = core_text.normalizeText(button?.dataset?.rmtMemoryWorld, 240);
    const section = button?.closest?.('[data-rmt-memory-wi-book]');
    const list = section?.querySelector?.('.rmt-memory-wi-entry-list');
    if (!world || !list) return;
    if (!list.hidden) { list.hidden = true; return; }
    list.hidden = false;
    list.textContent = '正在读取条目…';
    try {
        const entries = await loadMemoryWorldInfoBook(context, world);
        const book = getMemoryWorldInfoSelection(context).books.find(item => item.name === world);
        const selected = new Set(book?.entryUids || []);
        list.innerHTML = entries.length ? entries.map(entry => `<label class="rmt-memory-wi-entry"><input type="checkbox" data-rmt-memory-wi-entry="${core_text.esc(world)}" data-rmt-memory-wi-uid="${core_text.esc(entry.uid)}" ${book?.all ? 'disabled' : ''} ${selected.has(String(entry.uid)) ? 'checked' : ''}><span><b>${core_text.esc(entry.title)}</b><small>#${core_text.esc(entry.uid)}${entry.disabled ? ' · 原条目已禁用' : ''}${entry.keys?.length ? ` · ${core_text.esc(entry.keys.join(' / '))}` : ''}</small><em>${core_text.esc(entry.content.slice(0, 180))}${entry.content.length > 180 ? '…' : ''}</em></span></label>`).join('') : '<div class="rmt-memory-wi-empty">这本世界书没有可读取的文字条目。</div>';
    } catch (error) {
        list.textContent = `读取失败：${core_text.toastText(core_text.safeErrorSummary(error))}`;
    }
}

export function normalizeExternalMemoryRecords(records, { complete = false, tagPolicy = null } = {}) {
    // Complete snapshots are bounded by the existing source-ledger contract. An
    // over-limit snapshot fails visibly rather than being silently sampled/truncated.
    const itemLimit = complete ? Number.MAX_SAFE_INTEGER : core_constants.MAX_EXTERNAL_MEMORY_ITEMS;
    const charLimit = complete ? core_constants.MAX_MEMORY_SOURCE_LEDGER_CHARS : core_constants.MAX_EXTERNAL_MEMORY_CHARS;
    const seen = new Set();
    const out = [];
    let totalChars = 0;
    for (const raw of Array.isArray(records) ? records : []) {
        if (!complete && (out.length >= itemLimit || totalChars >= charLimit)) break;
        const fullContent = String(raw?.content ?? raw?.summary ?? raw?.text ?? '').replace(/\u0000/g, '').trim();
        if (!fullContent) continue;
        if (complete && totalChars + fullContent.length > charLimit) throw core_text.safeUserError('全部来源超过账本容量；没有仅保留第一批。', 'RMT_ARCHIVE_SOURCE_CAPACITY');
        const provider = archive_sourceLedger.normalizeMemorySourceProvider(raw?.providerKey || raw?.provider || 'external-memory');
        const providerHashA = core_text.hashString(provider).toString(36).replace('-', 'n');
        const providerHashB = core_text.hashString(`${provider.length}|${provider.slice(0, 4096)}|${provider.slice(-4096)}`).toString(36).replace('-', 'n');
        const providerPrefix = `P${providerHashA}${providerHashB}:`;
        const rawIdValue = String(raw?.externalId ?? raw?.sourceId ?? raw?.id ?? '').replace(/\u0000/g, '').trim();
        const compactLocalId = value => {
            const normalized = archive_sourceLedger.normalizeMemorySourceId(value);
            if (!normalized) return `E${String(out.length + 1).padStart(3, '0')}`;
            if (normalized.length <= 72) return normalized;
            const first = core_text.hashString(normalized).toString(36).replace('-', 'n');
            const second = core_text.hashString(`${normalized.length}|${normalized.slice(0, 2048)}|${normalized.slice(-2048)}`).toString(36).replace('-', 'n');
            return `${core_text.normalizeText(normalized, 40)}#${first}${second}`;
        };
        // IDs are provider-scoped so two plugins may safely use the same local id.
        // Preserve an existing matching prefix to keep repeated normalization idempotent.
        const baseId = rawIdValue.startsWith(providerPrefix) && rawIdValue.length <= 88
            ? rawIdValue
            : `${providerPrefix}${compactLocalId(rawIdValue)}`;
        const partSize = core_constants.MAX_MEMORY_SOURCE_FRAGMENT_CHARS;
        const partCount = Math.max(1, Math.ceil(fullContent.length / partSize));
        const selectedParts = tagPolicy?.mode === 'keep' ? context_tags.filterContextTagSegments(fullContent, tagPolicy, partSize) : null;
        for (let part = 0; part < partCount; part += 1) {
            if (!complete && (out.length >= itemLimit || totalChars >= charLimit)) break;
            const remaining = charLimit - totalChars;
            const originalContent = fullContent.slice(part * partSize, (part + 1) * partSize).slice(0, remaining);
            const content = selectedParts ? selectedParts[part].slice(0, remaining) : originalContent;
            if (!originalContent.length) continue;
            const key = `${baseId}|${part + 1}|${originalContent.replace(/\s+/g, ' ').toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (selectedParts) totalChars += originalContent.length;
            if (!content.length) continue;
            out.push({
                externalId: partCount > 1 ? `${baseId}:part:${part + 1}` : baseId,
                provider,
                providerKey: provider,
                type: core_text.normalizeText(raw?.type, 80),
                date: core_text.normalizeText(raw?.date ?? raw?.timestamp ?? raw?.create_time, 100),
                content,
            });
            if (!selectedParts) totalChars += content.length;
        }
    }
    return out;
}
