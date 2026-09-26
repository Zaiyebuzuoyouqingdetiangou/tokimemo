// C-3c（r84.101）：别名沿用 archive_groups，函数体一字不改；实际指向 core 层的桥，不再 import archive 层。
import * as archive_groups from './archiveBridge.js';
// C-3c（r84.101）：别名沿用 archive_repository，函数体一字不改；实际指向 core 层的桥，不再 import archive 层。
import * as archive_repository from './archiveBridge.js';
import * as core_constants from './constants.js';
import * as core_context from './context.js';
import * as core_requestCoordinator from './requestCoordinator.js';
import * as core_text from './text.js';
// C-3（r84.98）：别名沿用 modes_calendar，函数体一字不改；实际指向 core 层的桥，不再 import modes 层。
import * as modes_calendar from './modesBridge.js';
// C-3（r84.98）：别名沿用 modes_phone，函数体一字不改；实际指向 core 层的桥，不再 import modes 层。
import * as modes_phone from './modesBridge.js';
// C-3b（r84.99）：别名沿用 generation_recovery，函数体一字不改；实际指向 core 层的桥，不再 import generation 层。
import * as generation_recovery from './generationBridge.js';
import * as participant_contract from './participants.js';
import { ARCHIVE_VERSIONS_CACHE_KEY, GENERATION_DRAFTS_CACHE_KEY, archiveBackupEntryForContext, archiveVersions, assertModeWriteFence, cacheScopeFromContext, clearRecoveryInCache, cloneCacheValue, ensureCacheHydrated, finishGenerationDraftInCache, generationDraftRecords, generationDraftRows, getCache, modeWriteFenceForCache, participantRoster, recoveryCleared, recoveryDraftId, recoveryPageForVersion, rememberRuntimeSessionCache, retainLegacyGenerationDraft, sameProgressItemValue, saveMetadataDurably, serializeArchiveCommitOperation, serializeCacheScopeOperation } from './cacheRecords.js';
import { commitArchiveCacheMutation, commitLiveCacheMutation } from './cacheCommit.js';
import { currentArchiveVersionState } from './cacheVersions.js';
// 生成草稿与进度：草稿行、任务结果、阅读进度覆盖、手机草稿、生成恢复
// 从 core/cache.js 原样搬出（重构阶段 2），声明文本一字未改；core/cache.js 仍转发原有导出。

export function listGenerationDrafts(context = core_context.getContext(), suppliedCache = null, mode = '') {
    try { return generationDraftRows(suppliedCache || getCache(context), archive_repository.requireArchive(context), { mode }); }
    catch { return []; }
}

export function listGenerationTaskResults(context = core_context.getContext(), suppliedCache = null) {
    const stored = suppliedCache || getCache(context);
    return Object.entries(generationDraftRecords(stored)).filter(([, row]) => !!row.result)
        .map(([draftId, row]) => ({ draftId, status: row.status, mode: row.result.mode, pageId: row.result.pageId,
            createdAt: row.result.createdAt, sourceArchiveRevision: row.result.sourceMemory?.archiveRevision || '' }));
}

export async function readGenerationTaskResult(context, draftId, { cache: suppliedCache = null } = {}) {
    const current = suppliedCache ? { cache: suppliedCache } : await currentArchiveVersionState(context);
    const record = generationDraftRecords(current.cache)[draftId];
    if (!record?.result) throw core_text.safeUserError('找不到已保存的任务成果，未请求模型。', 'RMT_RECOVERY_RESULT_MISSING');
    return { draftId, status: record.status, ...cloneCacheValue(record.result) };
}

// Callers supply a code-owned selector, never a model-authored path. A merged
// reader can contain several HEART pages; its last marker does not own them all.
export async function resolveGenerationProgressTarget(context, shownSession, selectItem, { cache: suppliedCache = null } = {}) {
    if (typeof selectItem !== 'function' || !shownSession?.kind) return null;
    const current = suppliedCache ? { cache: suppliedCache, memory: archive_repository.requireArchive(context) }
        : await currentArchiveVersionState(context);
    const bank = current.memory, stored = current.cache, mode = shownSession.kind;
    if (!bank || shownSession.chatId !== bank.chatId) return null;
    const select = session => { try { return session ? selectItem(session) : null; } catch { return null; } };
    const shown = select(shownSession);
    if (shown == null) return null;
    const equal = value => value != null && sameProgressItemValue(value, shown);
    if (shownSession.readableProgress?.explicitDraft === true) {
        const draftId = shownSession.readableProgress.draftId, row = generationDraftRecords(stored)[draftId];
        if (row?.status !== 'open' || row.result?.mode !== mode || row.result.sourceMemory?.chatId !== bank.chatId
            || !equal(select(generationTaskResultSession({ draftId, ...row.result })))) return null;
        return { draftId, pageId: row.result.pageId, status: 'open', session: cloneCacheValue(row.result.session),
            sourceMemory: cloneCacheValue(row.result.sourceMemory), sourceContext: cloneCacheValue(row.result.sourceContext || {}),
            contentSnapshot: generation_recovery.readGenerationContentSnapshot(row.journal),
            frozenInputs: cloneCacheValue(row.journal?.frozenInputs || {}), journal: cloneCacheValue(row.journal) };
    }
    if (shownSession.archiveRevision !== bank.archiveRevision) return null;
    const visible = loadReadableGenerationProgress(mode, { context, cache: stored, memoryBank: bank, chatId: bank.chatId }) || stored?.[mode];
    if (!equal(select(visible))) return null;
    const rows = Object.entries(generationDraftRecords(stored)).filter(([, row]) => row.status === 'open'
        && row.result?.mode === mode && row.result.sourceMemory?.archiveRevision === bank.archiveRevision
        && core_context.comparableChatId(row.result.sourceMemory?.chatId) === core_context.comparableChatId(bank.chatId)
        && row.result.session?.readableProgress?.version === 1 && row.result.session.readableProgress.complete === false)
        .sort((left, right) => left[1].result.createdAt - right[1].result.createdAt).reverse();
    const marker = shownSession.readableProgress?.draftId;
    // A later result that actually owns this target shadows earlier rows even
    // if the old shown value happens to match a different stale draft.
    const candidates = rows.filter(([, row]) => select(applySavedTaskPage(null, row.result)) != null);
    const actual = candidates[0];
    if (actual) {
        const marked = actual[0] === marker && equal(select(applySavedTaskPage(null, actual[1].result))) ? actual : null;
        const [draftId, row] = marked || actual;
        if (!equal(select(applySavedTaskPage(null, row.result)))) return null;
        return { draftId, pageId: row.result.pageId, status: 'open', session: cloneCacheValue(row.result.session),
            sourceMemory: cloneCacheValue(row.result.sourceMemory), sourceContext: cloneCacheValue(row.result.sourceContext || {}),
            contentSnapshot: generation_recovery.readGenerationContentSnapshot(row.journal),
            frozenInputs: cloneCacheValue(row.journal?.frozenInputs || {}), journal: cloneCacheValue(row.journal) };
    }
    const formal = stored?.[mode];
    if (!equal(select(formal))) return null;
    let pageId = mode, reading = generationPageReadingSource(formal, mode, bank);
    for (const page of Object.keys(formal.generationSources || {})) {
        if (equal(select(applySavedTaskPage(null, { mode, pageId: page, session: formal, sourceMemory: bank })))) {
            pageId = page; reading = generationPageReadingSource(formal, page, bank); break;
        }
    }
    return { draftId: '', pageId, status: 'formal', session: cloneCacheValue(formal),
        sourceMemory: cloneCacheValue(reading.memoryBank), sourceContext: {}, contentSnapshot: null, frozenInputs: {} };
}

const PROGRESS_READING_FIELDS = Object.freeze(['view', 'selectedId', 'selectedKey', 'selectedAppId', 'selectedEntryId',
    'selectedSpaceId', 'selectedObjectId', 'selectedParticipantId', 'presenceIndex', 'selectedSeason', 'selectedVoiceId',
    'selectedScenarioId', 'selectedDramaKey', 'selectedStripId', 'selectedFireflyId', 'selectedDossierId',
    'selectedConfessionId', 'pastLivesReadMask', 'pastLivesDrawn', 'pastLivesClosing', 'dialogueIndex', 'reading']);

function progressPathValue(session, path) {
    let value = session;
    for (const part of path || []) {
        value = typeof part === 'string' || typeof part === 'number' ? (value && Object.hasOwn(value, part) ? value[part] : undefined)
            : Array.isArray(value) ? value.find(item => item?.id === part?.id
                && (!part?.calendarPageKey || modes_calendar.calendarEntryPageKey(item) === part.calendarPageKey)) : undefined;
    }
    return value;
}

function collectProgressFieldClears(before, after, path = [], cleared = []) {
    if (Array.isArray(before) && Array.isArray(after)) {
        for (const item of before) if (typeof item?.id === 'string') {
            const next = after.find(candidate => candidate?.id === item.id);
            if (next) collectProgressFieldClears(item, next, [...path, { id: item.id }], cleared);
        }
    } else if (before && after && typeof before === 'object' && typeof after === 'object'
        && !Array.isArray(before) && !Array.isArray(after)) {
        for (const key of Object.keys(before)) {
            if (['readableProgress', 'generationSources'].includes(key)) continue;
            if (!Array.isArray(before[key]) && before[key] != null
                && (!Object.hasOwn(after, key) || after[key] === null)) {
                cleared.push({ path: [...path, key], ...(Object.hasOwn(after, key) ? { value: null } : { remove: true }) });
            } else if (Object.hasOwn(after, key)) collectProgressFieldClears(before[key], after[key], [...path, key], cleared);
        }
    }
    return cleared;
}

// Record only changed local fields; never copy task inputs into every edit.
function collectProgressEdits(before, after, path = [], edits = []) {
    if (sameProgressItemValue(before, after)) return edits;
    if (Array.isArray(before) && Array.isArray(after)) {
        after.forEach((value, index) => {
            const id = typeof value?.id === 'string' ? value.id : null;
            const previous = id ? before.find(item => item?.id === id) : before[index];
            collectProgressEdits(previous, value, [...path, id ? { id } : index], edits);
        });
    } else if (before && after && typeof before === 'object' && typeof after === 'object'
        && !Array.isArray(before) && !Array.isArray(after)) {
        for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
            if (['generationSources', 'readableProgress', 'progressPending', ...PROGRESS_READING_FIELDS].includes(key)) continue;
            collectProgressEdits(before[key], after[key], [...path, key], edits);
        }
    } else if (path.length) edits.push({ path, ...(after === undefined ? { remove: true } : { value: structuredClone(after) }) });
    return edits;
}

function applyProgressOverrides(session, metadata) {
    for (const edit of metadata?.manualFieldsV1 || []) {
        const parent = progressPathValue(session, edit.path.slice(0, -1)), key = edit.path.at(-1);
        if (!parent || typeof parent !== 'object' || !['string', 'number'].includes(typeof key)) continue;
        if (edit.remove) delete parent[key];
        else Object.defineProperty(parent, key, { value: structuredClone(edit.value), enumerable: true, configurable: true, writable: true });
    }

    for (const override of metadata?.textOverridesV1 || []) {
        const item = progressPathValue(session, override.path);
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        for (const [key, value] of Object.entries(override.set || {})) Object.defineProperty(item, key,
            { value: structuredClone(value), enumerable: true, configurable: true, writable: true });
        for (const key of override.unset || []) delete item[key];
    }
    for (const clear of metadata?.clearedFieldsV1 || []) {
        const parent = progressPathValue(session, clear.path?.slice(0, -1)), key = clear.path?.at(-1);
        if (!parent || typeof parent !== 'object' || typeof key !== 'string') continue;
        if (clear.remove) delete parent[key]; else parent[key] = null;
    }
}

function progressMutationMetadata(before, next, contentOverride) {
    const metadata = cloneCacheValue(before.readableProgress || {});
    const localEdits = new Map((metadata.manualFieldsV1 || []).map(edit => [JSON.stringify(edit.path), edit]));
    for (const edit of collectProgressEdits(before, next)) localEdits.set(JSON.stringify(edit.path), edit);
    if (localEdits.size) metadata.manualFieldsV1 = [...localEdits.values()];
    const clears = new Map((metadata.clearedFieldsV1 || []).filter(clear => {
        const value = progressPathValue(next, clear.path);
        return clear.remove ? value === undefined : value === null;
    }).map(clear => [JSON.stringify(clear.path), clear]));
    for (const clear of collectProgressFieldClears(before, next)) clears.set(JSON.stringify(clear.path), clear);
    if (clears.size) metadata.clearedFieldsV1 = [...clears.values()]; else delete metadata.clearedFieldsV1;
    const overrides = new Map((metadata.textOverridesV1 || []).map(override => {
        const updated = cloneCacheValue(override), previous = progressPathValue(before, override.path), current = progressPathValue(next, override.path);
        // A later explicit local action (for example drawing a new CG after a
        // regeneration cleared it) supersedes the older field override.
        if (previous && current) for (const key of new Set([...Object.keys(updated.set || {}), ...(updated.unset || [])])) {
            if (Object.hasOwn(previous, key) !== Object.hasOwn(current, key) || JSON.stringify(previous[key]) !== JSON.stringify(current[key])) {
                updated.set ||= {}; updated.unset = (updated.unset || []).filter(item => item !== key);
                if (Object.hasOwn(current, key)) updated.set[key] = structuredClone(current[key]);
                else { delete updated.set[key]; updated.unset.push(key); }
            }
        }
        return [JSON.stringify([updated.pageId, updated.target?.type, updated.target?.parentId || '', updated.target?.id]), updated];
    }));
    if (contentOverride) {
        const override = cloneCacheValue(contentOverride);
        if (override.pageId !== metadata.pageId || !Array.isArray(override.path) || !override.path.length
            || !override.target?.type || !override.target?.id || !progressPathValue(next, override.path)) throw new TypeError('重新生成结果缺少对应的原页面和稳定目标。');
        const current = progressPathValue(next, override.path);
        if (Object.entries(override.set || {}).some(([key, value]) => !Object.hasOwn(current, key) || JSON.stringify(current[key]) !== JSON.stringify(value))
            || (override.unset || []).some(key => Object.hasOwn(current, key))) throw new TypeError('重新生成覆盖必须与本次已校验并提交的内容一致。');
        overrides.set(JSON.stringify([override.pageId, override.target.type, override.target.parentId || '', override.target.id]), override);
    }
    if (overrides.size) metadata.textOverridesV1 = [...overrides.values()];
    return metadata;
}

function collectProgressDeletions(before, after, path = [], deleted = []) {
    if (Array.isArray(before) && Array.isArray(after)) {
        const nextIds = new Set(after.filter(item => typeof item?.id === 'string').map(item => item.id));
        const ids = before.filter(item => typeof item?.id === 'string' && !nextIds.has(item.id)).map(item => item.id);
        if (ids.length) deleted.push({ path, ids });
        for (const item of before) if (typeof item?.id === 'string' && nextIds.has(item.id)) {
            collectProgressDeletions(item, after.find(next => next?.id === item.id), [...path, { id: item.id }], deleted);
        }
    } else if (before && after && typeof before === 'object' && typeof after === 'object') {
        for (const key of Object.keys(before)) if (Object.hasOwn(after, key)
            && !['readableProgress', 'generationSources', 'cgImage', 'cgImageHistory', 'cgPromptDraft', 'cgPromptMetadata'].includes(key)) {
            collectProgressDeletions(before[key], after[key], [...path, key], deleted);
        }
    }
    return deleted;
}

function applyProgressDeletions(session, deletions) {
    for (const deletion of deletions || []) {
        if (!Array.isArray(deletion.path) || !Array.isArray(deletion.ids) || !deletion.path.length) continue;
        let parent = session;
        for (const part of deletion.path.slice(0, -1)) {
            parent = typeof part === 'string' ? parent?.[part]
                : Array.isArray(parent) ? parent.find(item => item?.id === part?.id) : null;
        }
        const key = deletion.path.at(-1);
        if (parent && typeof key === 'string' && Array.isArray(parent[key])) {
            parent[key] = parent[key].filter(item => !deletion.ids.includes(item?.id));
        }
    }
    return session;
}

export function preserveProgressLocalState(incoming, saved) {
    if (!saved || !incoming || typeof incoming !== 'object') return incoming;
    if (Array.isArray(incoming)) {
        const byId = new Map((Array.isArray(saved) ? saved : []).filter(item => item && typeof item.id === 'string').map(item => [item.id, item]));
        return incoming.map(item => item?.id && byId.has(item.id) ? preserveProgressLocalState(item, byId.get(item.id)) : item);
    }
    const next = { ...incoming };
    for (const key of ['cgImage', 'cgImageHistory', 'cgPromptDraft', 'cgPromptMetadata', 'favorite', 'readAt', 'unlocked', 'userManaged', ...PROGRESS_READING_FIELDS]) {
        if (Object.hasOwn(saved, key)) next[key] = structuredClone(saved[key]);
    }
    for (const [key, value] of Object.entries(next)) {
        if (Array.isArray(value) && Array.isArray(saved[key])) next[key] = preserveProgressLocalState(value, saved[key]);
        else if (value && typeof value === 'object' && !Array.isArray(value) && saved[key] && typeof saved[key] === 'object'
            && !['generationSources', 'readableProgress', 'cgImage', 'cgImageHistory', 'cgPromptDraft', 'cgPromptMetadata'].includes(key)) next[key] = preserveProgressLocalState(value, saved[key]);
    }
    applyProgressOverrides(next, saved.readableProgress);
    if (next.readableProgress) for (const key of ['textOverridesV1', 'clearedFieldsV1', 'manualFieldsV1']) {
        if (saved.readableProgress?.[key]) next.readableProgress[key] = cloneCacheValue(saved.readableProgress[key]);
    }
    const deletions = saved.readableProgress?.deletedItems;
    if (Array.isArray(deletions) && deletions.length) {
        applyProgressDeletions(next, deletions);
        if (next.readableProgress) next.readableProgress = { ...next.readableProgress, deletedItems: structuredClone(deletions) };
    }
    return next;
}

export async function commitGenerationTaskResultMutation(context, draftId, mutate, { expectedTaskOrigin = null, stillCurrent = null, archiveTarget = null, contentOverride = null } = {}) {
    if (typeof mutate !== 'function') return null;
    if (archiveTarget?.historyVersionId || archiveTarget?.taskResultDraftId || archiveTarget?.backupOnly) return null;
    const bank = archiveTarget?.memory || archive_repository.requireArchive(context);
    const entry = archiveTarget || archiveBackupEntryForContext(context, bank);
    if (archiveTarget && (!entry.entryId || !bank?.archiveRevision || !Array.isArray(bank.memories)
        || core_context.comparableChatId(entry.chatId) !== core_context.comparableChatId(bank.chatId))) return null;
    const origin = expectedTaskOrigin || core_context.captureTaskOrigin(context, bank.archiveRevision);
    const current = () => (archiveTarget ? core_context.runtimeLifecycleStillCurrent(origin.lifecycleEpoch)
        && (!origin.archiveTargetEntryId || origin.archiveTargetEntryId === entry.entryId) : core_context.isCurrentTaskOrigin(origin))
        && core_requestCoordinator.isLogicalGenerationTaskCurrent(origin) && (typeof stillCurrent !== 'function' || stillCurrent());
    let session = null;
    const committed = await serializeArchiveCommitOperation(entry, bank, () => commitArchiveCacheMutation(entry, bank, {}, value => {
        const record = generationDraftRecords(value)[draftId];
        if (record?.status !== 'open' || !record.result?.session || core_context.comparableChatId(record.result.sourceMemory?.chatId) !== core_context.comparableChatId(bank.chatId)) return false;
        const before = cloneCacheValue(record.result.session), next = mutate(cloneCacheValue(before), cloneCacheValue(record.result.sourceMemory));
        if (!next || next.kind !== before.kind || next.chatId !== before.chatId || next.archiveRevision !== before.archiveRevision) return false;
        const deletedItems = [...(before.readableProgress?.deletedItems || []), ...collectProgressDeletions(before, next)];
        session = { ...cloneCacheValue(next), readableProgress: { ...progressMutationMetadata(before, next, contentOverride),
            ...(deletedItems.length ? { deletedItems } : {}) } };
        record.result.session = session;
    }, current, { requireExisting: true, generationDraftMutation: true, preserveCanonicalMemory: true }));
    if (committed.unchanged || !session || !current()) return null;
    if (archiveTarget) {
        archiveTarget.cache = cloneCacheValue(committed.cache);
        return cloneCacheValue(session);
    }
    rememberRuntimeSessionCache(cacheScopeFromContext(context), committed.cache);
    context.chatMetadata[core_constants.CACHE_KEY] = cloneCacheValue(committed.stored);
    await saveMetadataDurably(context);
    return cloneCacheValue(session);
}

export async function saveGenerationProgressReadingState(context, session) {
    const draftId = session?.readableProgress?.draftId;
    if (!draftId || session.readableProgress.complete !== false) return null;
    const bank = archive_repository.requireArchive(context), entry = archiveBackupEntryForContext(context, bank);
    const origin = core_context.captureTaskOrigin(context, bank.archiveRevision);
    const patch = Object.fromEntries(PROGRESS_READING_FIELDS.filter(key => Object.hasOwn(session, key)
        && ['string', 'number', 'boolean'].includes(typeof session[key])).map(key => [key, session[key]]));
    const committed = await serializeArchiveCommitOperation(entry, bank, () => commitArchiveCacheMutation(entry, bank, {}, value => {
        const record = generationDraftRecords(value)[draftId];
        if (!record?.result?.session || record.status !== 'open') return false;
        Object.assign(record.result.session, patch);
    }, () => core_context.isCurrentTaskOrigin(origin), { requireExisting: true, generationDraftMutation: true, preserveCanonicalMemory: true }));
    if (committed.unchanged) return null;
    rememberRuntimeSessionCache(cacheScopeFromContext(context), committed.cache);
    context.chatMetadata[core_constants.CACHE_KEY] = cloneCacheValue(committed.stored);
    await saveMetadataDurably(context);
    return structuredClone(session);
}

// Read a page against the evidence that actually produced it. This view never
// changes the current archive or the inputs of a later generation request.
export function generationPageReadingSource(session, pageId, fallbackMemory) {
    const source = session?.generationSources?.[pageId];
    const memoryBank = source?.sourceMemory;
    if (!memoryBank || !Array.isArray(memoryBank.memories)) return { session, memoryBank: fallbackMemory, source: null };
    return { source, memoryBank, session: { ...session, chatId: memoryBank.chatId, archiveRevision: memoryBank.archiveRevision } };
}

export function generationPageSourceMemory(session, pageId, fallbackMemory) {
    return generationPageReadingSource(session, pageId, fallbackMemory).memoryBank;
}

function roomReadingBlueprint(session) {
    const result = {};
    for (const key of ['spaces', 'dayparts', 'residents', 'participantSnapshot', 'visualProfile', 'presenceLines', 'homeName', 'homeSummary', 'pets']) {
        if (Object.hasOwn(session || {}, key)) result[key] = structuredClone(session[key]);
    }
    return result;
}

export async function saveGenerationTaskResult(context, mode, session, origin, options = {}) {
    const draftId = options.draftId || origin?.generationRecoveryDraftId;
    if (!draftId || !session || !Object.values(core_constants.MODE).includes(mode)) throw new TypeError('任务成果缺少明确草稿和页面。');
    const bank = cloneCacheValue(options.memoryBank || archive_repository.requireArchive(context));
    const entry = options.archiveTarget || archiveBackupEntryForContext(context, bank);
    const stillCurrent = () => core_requestCoordinator.isLogicalGenerationTaskCurrent(origin)
        && core_context.runtimeLifecycleStillCurrent(origin.lifecycleEpoch) && (options.stillCurrent?.() !== false);
    const committed = await serializeArchiveCommitOperation(entry, bank, () => commitArchiveCacheMutation(entry, bank, {}, value => {
        const records = generationDraftRecords(value), record = records[draftId];
        if (!record || !['open', 'awaiting-choice'].includes(record.status)) throw core_text.safeUserError('任务成果对应的草稿已结束，旧返回没有覆盖保存记录。', 'RMT_RECOVERY_CLEARED');
        const snapshot = generation_recovery.readGenerationContentSnapshot(record.journal);
        const sourceMemory = options.sourceMemory || snapshot?.memoryBank;
        if (!sourceMemory || !Array.isArray(sourceMemory.memories)) throw core_text.safeUserError('旧草稿没有保留完整原资料，成果与草稿保留，需要明确旧资料的兼容方式。', 'RMT_RECOVERY_SOURCE_SNAPSHOT_MISSING');
        const result = { mode, pageId: options.pageId || record.journal.pageId || recoveryPageForVersion(mode, record.journal.operation),
            createdAt: record.result?.createdAt || Date.now(), entryId: entry.entryId, targetEntry: cloneCacheValue(entry),
            session: preserveProgressLocalState(cloneCacheValue(session), record.result?.session), sourceMemory: cloneCacheValue(sourceMemory),
            sourceContext: cloneCacheValue(snapshot?.fields || {}),
            sourceIdentity: cloneCacheValue(record.journal.sourceIdentity || record.journal.identity),
            targetIdentity: cloneCacheValue(record.journal.identity) };
        value[GENERATION_DRAFTS_CACHE_KEY] = { version: 1, records: { ...records,
            [draftId]: { ...record, result, status: options.complete === false ? 'open' : 'awaiting-choice' } } };
    }, stillCurrent, { requireExisting: true, generationDraftMutation: true, preserveCanonicalMemory: true }));
    if (options.archiveTarget) options.archiveTarget.cache = cloneCacheValue(committed.cache);
    try {
        const live = core_context.currentCharacterGuard();
        if (core_context.deferredCommitOriginMatchesContext(origin, live)) {
            rememberRuntimeSessionCache(cacheScopeFromContext(live), committed.cache);
            live.chatMetadata[core_constants.CACHE_KEY] = cloneCacheValue(committed.stored);
            await saveMetadataDurably(live);
        }
    } catch { /* The task result was acknowledged by canonical storage. */ }
    return { status: options.complete === false ? 'partial-result' : 'awaiting-choice', draftId,
        pageId: generationDraftRecords(committed.cache)[draftId].result.pageId };
}

export function generationTaskResultSession(record) {
    const session = cloneCacheValue(record.session);
    session.readableProgress = { ...session.readableProgress, explicitDraft: true, draftId: record.draftId };
    session.generationSources = { ...(session.generationSources || {}), [record.pageId || record.mode]: {
        sourceMemory: cloneCacheValue(record.sourceMemory), sourceIdentity: cloneCacheValue(record.sourceIdentity) } };
    return session;
}

function applySavedTaskPage(latest, result) {
    const page = result.pageId, incoming = cloneCacheValue(result.session), current = cloneCacheValue(latest || {});
    let next;
    if (result.mode === core_constants.MODE.HEART && page === 'heart') {
        next = incoming;
    } else if (result.mode === core_constants.MODE.HEART) {
        next = current;
        const fields = page === 'language' ? ['greetings', 'specialDays', 'birthdayMmDd', 'userBirthdayMmDd', 'relationshipState', 'relationshipSummary', 'relationshipSourceMemoryIds', 'relationshipSourceMemoryAnchor']
            : page === 'strips' ? ['dailyStrips'] : page === 'fireflies' ? ['fireflyVoices'] : [];
        for (const key of fields) if (Object.hasOwn(incoming, key)) next[key] = structuredClone(incoming[key]);
        if (['spring', 'summer', 'autumn', 'winter', 'postending'].includes(page)) {
            next.voiceDramas = [...(current.voiceDramas || []).filter(item => item.kind !== page), ...(incoming.voiceDramas || []).filter(item => item.kind === page)];
            if (page !== 'postending') next.scenarioDramas = [...(current.scenarioDramas || []).filter(item => item.season !== page), ...(incoming.scenarioDramas || []).filter(item => item.season === page)];
        }
    } else if (page === 'roomLife') {
        // A life task can start from a still-partial room. Its source blueprint
        // remains explicitly partial if no completed current room exists yet.
        next = current.spaces?.length ? current : incoming;
        for (const key of ['lifePlan', 'lifePlanAttempt']) if (Object.hasOwn(incoming, key)) next[key] = cloneCacheValue(incoming[key]);
    } else {
        next = incoming;
        if (page === 'room') for (const key of ['lifePlan', 'lifePlanAttempt']) {
            if (Object.hasOwn(current, key)) next[key] = cloneCacheValue(current[key]);
            else delete next[key];
        }
    }
    // Keep provenance per page: old M identifiers never acquire the meaning of
    // a rebuilt archive's same-spelled M identifiers.
    next.generationSources = { ...(current.generationSources || {}), [page]: {
        sourceMemory: cloneCacheValue(result.sourceMemory), sourceIdentity: cloneCacheValue(result.sourceIdentity),
        ...(page === 'roomLife' ? { roomBlueprint: roomReadingBlueprint(incoming) } : {}) } };
    if (page === 'room' && current.lifePlan && !next.generationSources.roomLife?.roomBlueprint) {
        next.generationSources.roomLife = { ...(current.generationSources?.roomLife || {}),
            sourceMemory: cloneCacheValue(current.generationSources?.roomLife?.sourceMemory || result.targetMemory || result.sourceMemory),
            roomBlueprint: roomReadingBlueprint(current) };
    }
    return next;
}

export function preserveLifeFromPartialRoom(next, current) {
    if (next?.kind !== core_constants.MODE.ROOM || current?.readableProgress?.complete !== false || !current.lifePlan || next.lifePlan) return next;
    const result = { ...next, lifePlan: cloneCacheValue(current.lifePlan) };
    if (current.lifePlanAttempt) result.lifePlanAttempt = cloneCacheValue(current.lifePlanAttempt);
    result.generationSources = { ...(next.generationSources || {}), ...(current.generationSources?.roomLife
        ? { roomLife: cloneCacheValue(current.generationSources.roomLife) } : {}) };
    return result;
}

export async function resolveGenerationTaskResult(context, draftId, choice) {
    if (!['independent', 'apply'].includes(choice)) throw new TypeError('请选择独立保存或更新当前页面并保留旧版。');
    const bank = cloneCacheValue(archive_repository.requireArchive(context));
    const entry = archiveBackupEntryForContext(context, bank), scope = cacheScopeFromContext(context);
    const origin = core_context.captureTaskOrigin(context, bank.archiveRevision);
    const current = () => core_context.isCurrentTaskOrigin(origin);
    const committed = await serializeArchiveCommitOperation(entry, bank, () => serializeCacheScopeOperation(scope,
        () => commitArchiveCacheMutation(entry, bank, {}, (value, canonicalMemory) => {
            const records = generationDraftRecords(value), record = records[draftId];
            if (!record?.result || !['awaiting-choice', 'independent'].includes(record.status)) throw core_text.safeUserError('这份任务成果不在等待选择状态，原结果仍保留。', 'RMT_RECOVERY_RESULT_MISSING');
            if (choice === 'apply') {
                const prior = cloneCacheValue(value);
                delete prior[ARCHIVE_VERSIONS_CACHE_KEY]; delete prior[GENERATION_DRAFTS_CACHE_KEY];
                const drafts = { modules: cloneCacheValue(prior[generation_recovery.GENERATION_RECOVERY_CACHE_KEY] || {}),
                    tasks: Object.fromEntries(Object.entries(records).filter(([, item]) => item.status === 'open')
                        .map(([id, item]) => [id, cloneCacheValue(item.journal)])),
                    phone: prior[core_constants.PHONE_DRAFT_CACHE_KEY] ? cloneCacheValue(prior[core_constants.PHONE_DRAFT_CACHE_KEY]) : null };
                delete prior[generation_recovery.GENERATION_RECOVERY_CACHE_KEY]; delete prior[core_constants.PHONE_DRAFT_CACHE_KEY];
                const versionId = globalThis.crypto?.randomUUID?.() || `version-${Date.now()}-${Math.random()}`;
                value[ARCHIVE_VERSIONS_CACHE_KEY] = [...archiveVersions(value), { version: 1, versionId, createdAt: Date.now(), reason: '应用原资料任务成果前',
                    selectedPages: [record.result.pageId], entryId: entry.entryId, chatId: bank.chatId, archiveRevision: bank.archiveRevision,
                    entry: cloneCacheValue(entry), memory: cloneCacheValue(canonicalMemory), cache: prior,
                    roster: participantRoster(value[participant_contract.PARTICIPANTS_KEY]), drafts }];
                const next = applySavedTaskPage(value[record.result.mode], { ...record.result, targetMemory: canonicalMemory });
                next.kind = record.result.mode; next.chatId = bank.chatId; next.archiveRevision = bank.archiveRevision;
                next[core_constants.SESSION_MODE_WRITE_FENCE_KEY] = modeWriteFenceForCache(value, record.result.mode);
                value[record.result.mode] = next;
            }
            // Keep the independently viewable result and its original evidence,
            // but not a redundant completed request/input journal.
            value[GENERATION_DRAFTS_CACHE_KEY] = { version: 1, records: { ...records,
                [draftId]: { status: choice === 'apply' ? 'applied' : 'independent', result: record.result, closedAt: Date.now() } } };
        }, current, { requireExisting: true, generationDraftMutation: true, archiveVersionMutation: true, preserveCanonicalMemory: true })));
    const live = core_context.currentCharacterGuard();
    rememberRuntimeSessionCache(scope, committed.cache);
    live.chatMetadata[core_constants.CACHE_KEY] = cloneCacheValue(committed.stored);
    await saveMetadataDurably(live);
    return { status: choice === 'apply' ? 'applied' : 'independent', draftId };
}

export function loadPhoneGenerationDraft(context = core_context.getContext(), memoryBank = null) {
    try {
        const bank = memoryBank || archive_repository.requireArchive(context);
        const cache = getCache(context);
        const raw = cache?.[core_constants.PHONE_DRAFT_CACHE_KEY];
        if (!raw || raw.kind !== 'phone-draft') return null;
        const currentFence = modeWriteFenceForCache(cache, core_constants.MODE.PHONE);
        const draftFence = core_text.normalizeText(raw?.[core_constants.SESSION_MODE_WRITE_FENCE_KEY], 240);
        if (currentFence !== draftFence) return null;
        const chatId = core_context.getChatId(context);
        if (core_context.comparableChatId(raw.chatId) !== core_context.comparableChatId(chatId)) return null;
        if (core_text.normalizeText(raw.archiveRevision, 240) !== core_text.normalizeText(bank.archiveRevision, 240)) return null;
        const plan = modes_phone.normalizePhonePlan(raw.plan);
        const completedApps = [];
        const unreadableCompletedApps = [];
        const rawCompleted = Array.isArray(raw.completedApps) ? raw.completedApps : [];
        for (const planApp of plan.apps) {
            const saved = rawCompleted.find(item => core_text.safeId(item?.id, '') === planApp.id);
            if (!saved) continue;
            try {
                completedApps.push(modes_phone.normalizePhoneDraftApp(saved, planApp, bank, plan.deviceKind, null, { trustedStored: true }));
            } catch { unreadableCompletedApps.push(planApp.id); }
        }
        const entirelyUnavailable = completedApps.length === plan.apps.length
            && completedApps.every(app => app.entries.every(entry => entry.sourceStatus === 'unavailable'));
        return {
            kind: 'phone-draft',
            chatId,
            archiveRevision: bank.archiveRevision,
            plan,
            completedApps: entirelyUnavailable ? [] : completedApps,
            unreadableCompletedApps,
            failedAppId: core_text.safeId(raw.failedAppId, ''),
            failedMessage: core_text.normalizeText(raw.failedMessage, 600),
            failure: entirelyUnavailable ? { code: 'RMT_PHONE_SOURCE_EMPTY' } : core_text.safeErrorDiagnostic(raw.failure),
            updatedAt: Math.max(0, Number(raw.updatedAt) || 0),
            [core_constants.SESSION_MODE_WRITE_FENCE_KEY]: core_text.normalizeText(raw?.[core_constants.SESSION_MODE_WRITE_FENCE_KEY], 240),
        };
    } catch {
        return null;
    }
}

export async function savePhoneGenerationDraft(context, memoryBank, plan, completedApps, failedAppId = '', failedMessage = '', expectedTaskOrigin = null, options = {}) {
    const draft = {
        kind: 'phone-draft',
        chatId: core_context.comparableChatId(memoryBank?.chatId || core_context.getChatId(context)),
        archiveRevision: core_text.normalizeText(memoryBank?.archiveRevision, 240),
        plan,
        completedApps: Array.isArray(completedApps) ? completedApps : [],
        failedAppId: core_text.safeId(failedAppId, ''),
        failedMessage: core_text.normalizeText(failedMessage, 600),
        failure: core_text.safeErrorDiagnostic(options.failure),
        updatedAt: Date.now(),
    };
    const detachedTarget = options.archiveTarget && typeof options.archiveTarget === 'object' ? options.archiveTarget : null;
    if (detachedTarget) {
        const entry = {
            ...detachedTarget,
            entryId: core_text.normalizeText(detachedTarget.entryId, 120),
            chatId: core_context.comparableChatId(detachedTarget.chatId),
        };
        return serializeArchiveCommitOperation(entry, memoryBank, async () => {
            const committed = await commitArchiveCacheMutation(entry, memoryBank, detachedTarget.cache || {}, cache => {
                const fence = assertModeWriteFence(cache, core_constants.MODE.PHONE, expectedTaskOrigin, draft);
                draft[core_constants.SESSION_MODE_WRITE_FENCE_KEY] = fence;
                cache[core_constants.PHONE_DRAFT_CACHE_KEY] = cloneCacheValue(draft);
            }, options.stillCurrent);
            detachedTarget.cache = cloneCacheValue(committed.cache);
            if (context?.chatMetadata && typeof context.chatMetadata === 'object') {
                context.chatMetadata[core_constants.CACHE_KEY] = cloneCacheValue(committed.cache);
            }
            return true;
        });
    }
    const expectedScope = cacheScopeFromContext(context);
    let live;
    try { live = core_context.currentCharacterGuard(); } catch { return false; }
    if (expectedTaskOrigin && !core_context.deferredCommitOriginMatchesContext(expectedTaskOrigin, live)) return false;
    if (cacheScopeFromContext(live) !== expectedScope) return false;
    if (core_context.comparableChatId(core_context.getChatId(live)) !== core_context.comparableChatId(memoryBank.chatId || core_context.getChatId(context))) return false;
    let latestMemory;
    try { latestMemory = archive_repository.requireArchive(live); } catch { return false; }
    if (core_text.normalizeText(latestMemory.archiveRevision, 240) !== core_text.normalizeText(memoryBank.archiveRevision, 240)) return false;
    try { await ensureCacheHydrated(live); } catch { return false; }
    try { live = core_context.currentCharacterGuard(); } catch { return false; }
    if (expectedTaskOrigin && !core_context.deferredCommitOriginMatchesContext(expectedTaskOrigin, live)) return false;
    if (cacheScopeFromContext(live) !== expectedScope) return false;
    try { latestMemory = archive_repository.requireArchive(live); } catch { return false; }
    if (core_text.normalizeText(latestMemory.archiveRevision, 240) !== core_text.normalizeText(memoryBank.archiveRevision, 240)) return false;
    if (!live.chatMetadata || typeof live.chatMetadata !== 'object') return false;
    const scope = cacheScopeFromContext(live);
    const entry = archiveBackupEntryForContext(live, latestMemory, { expectedTaskOrigin, previousMemory: latestMemory });
    const stillCurrent = () => {
        let candidate;
        try { candidate = core_context.currentCharacterGuard(); } catch { return false; }
        if (expectedTaskOrigin && !core_context.deferredCommitOriginMatchesContext(expectedTaskOrigin, candidate)) return false;
        const candidateMemory = archive_repository.getImportedMemory(candidate);
        return cacheScopeFromContext(candidate) === scope
            && core_text.normalizeText(candidateMemory?.archiveRevision, 240) === core_text.normalizeText(memoryBank.archiveRevision, 240);
    };
    return commitLiveCacheMutation(entry, latestMemory, scope, getCache(live), cache => {
        const fence = assertModeWriteFence(cache, core_constants.MODE.PHONE, expectedTaskOrigin, draft);
        draft[core_constants.SESSION_MODE_WRITE_FENCE_KEY] = fence;
        cache[core_constants.PHONE_DRAFT_CACHE_KEY] = cloneCacheValue(draft);
    }, stillCurrent);
}

// Independent recovery journal; never used as formal memories or as a completed mode.
function recoveryMatchesCurrentArchive(raw, origin, entryId, revision, { inspect = false } = {}) {
    const identity = raw?.identity;
    if (!identity || ['characterId', 'characterAvatar', 'chatId'].some(key => identity[key] !== origin[key])
        || (identity.archiveTargetEntryId && identity.archiveTargetEntryId !== entryId)) return false;
    const frozen = !!generation_recovery.readGenerationContentSnapshot(raw);
    if (identity.characterKey !== origin.characterKey && (!(frozen || inspect) || !origin.characterAvatar)) return false;
    return identity.archiveRevision === revision || frozen || inspect;
}

export function loadGenerationRecovery(mode, context = core_context.getContext(), suppliedCache = null, options = {}) {
    try {
        if (options.intent === 'inspect' && !options.draftId) return null;
        const inspect = options.intent === 'inspect' && !!options.draftId;
        const bank = archive_repository.requireArchive(context);
        const cache = suppliedCache || getCache(context);
        if (options.draftId || options.pageId || cache?.[GENERATION_DRAFTS_CACHE_KEY]) {
            const selected = generationDraftRows(cache, bank, { mode }).find(row =>
                (!options.draftId || row.draftId === options.draftId) && (!options.pageId || row.pageId === options.pageId));
            if (!selected) return null;
            const raw = selected.journal;
            const origin = core_context.captureTaskOrigin(context, bank.archiveRevision);
            const entryId = context?.__rmtArchiveTargetEntryId || archiveBackupEntryForContext(context, bank, { expectedTaskOrigin: origin, previousMemory: bank }).entryId;
            if (raw.identity?.mode !== mode
                || !recoveryMatchesCurrentArchive(raw, origin, entryId, bank.archiveRevision, { inspect })) return null;
            if (!inspect && !Object.hasOwn(generationDraftRecords(cache), selected.draftId)
                && raw[core_constants.SESSION_MODE_WRITE_FENCE_KEY] !== modeWriteFenceForCache(cache, mode)) return null;
            // A selected pool task can reclaim a newer mode fence. Its content
            // still belongs to the exact character/chat/entry recorded above.
            const journal = { ...raw, draftId: selected.draftId, pageId: selected.pageId };
            if (!journal.identity.archiveTargetEntryId) journal.identity.archiveTargetEntryId = entryId;
            return journal;
        }
        const raw = cache?.[generation_recovery.GENERATION_RECOVERY_CACHE_KEY]?.[mode];
        const origin = core_context.captureTaskOrigin(context, bank.archiveRevision);
        const entryId = context?.__rmtArchiveTargetEntryId || archiveBackupEntryForContext(context, bank, { expectedTaskOrigin: origin, previousMemory: bank }).entryId;
        if (!Object.values(core_constants.MODE).includes(mode) || !generation_recovery.generationRecoverySummary(raw)
            || recoveryCleared(cache, mode) || raw.identity?.mode !== mode
            || !recoveryMatchesCurrentArchive(raw, origin, entryId, bank.archiveRevision)
            || raw[core_constants.SESSION_MODE_WRITE_FENCE_KEY] !== modeWriteFenceForCache(cache, mode)) return null;
        // The loader has proved the character/chat and compatible revision, canonical
        // entry and write fence above. Older V1 journals allowed this derived ID
        // to be empty. Fill only that absence on a COPY, never an explicit mismatch.
        // All callers (mode, subtask and continuation buttons) receive one identity.
        const journal = { ...cloneCacheValue(raw), draftId: recoveryDraftId(raw, mode),
            pageId: raw.pageId || recoveryPageForVersion(mode, raw.operation) };
        if (!journal.identity.archiveTargetEntryId) journal.identity.archiveTargetEntryId = entryId;
        return journal;
    } catch { return null; }
}

export async function saveGenerationRecovery(context, bank, mode, journal, origin, options = {}) {
    // Freeze before the first await: host getContext() objects may mutate in place
    // when A switches to B. The canonical entry, never that mutable object, owns a draft.
    if (!Object.values(core_constants.MODE).includes(mode) || !origin
        || !core_context.runtimeLifecycleStillCurrent(origin.lifecycleEpoch)) return false;
    const memoryBank = cloneCacheValue(bank);
    const expectedOrigin = cloneCacheValue(origin);
    const revision = core_text.normalizeText(memoryBank.archiveRevision, 240);
    const chatId = core_context.comparableChatId(memoryBank.chatId);
    if (!revision || revision !== expectedOrigin.archiveRevision || chatId !== expectedOrigin.chatId) return false;
    const frozenJournal = journal ? cloneCacheValue(journal) : null;
    const draftId = frozenJournal?.draftId || options.draftId || expectedOrigin.generationRecoveryDraftId || '';
    if (frozenJournal) {
        const identity = frozenJournal.identity;
        if (!generation_recovery.generationRecoverySummary(frozenJournal) || identity.mode !== mode
            || ['characterKey', 'characterId', 'characterAvatar', 'chatId', 'archiveRevision']
                .some(key => (identity[key] || '') !== (expectedOrigin[key] || ''))) return false;
    }
    const detachedTarget = options.archiveTarget || null;
    let entry = detachedTarget || options.archiveEntry;
    const originFingerprint = expectedOrigin.characterKey.split('\u001fcharacter:')[0];
    const entryMatches = candidate => !!candidate
        && core_context.comparableChatId(candidate.chatId) === chatId
        && core_context.archiveStoredAvatar(candidate) === expectedOrigin.characterAvatar
        && String(candidate.characterIndexHint) === String(expectedOrigin.characterId)
        && core_text.normalizeText(candidate.characterFingerprint, 160) === originFingerprint
        && (!expectedOrigin.archiveTargetEntryId
            || core_context.archiveIndexEntryId(candidate) === expectedOrigin.archiveTargetEntryId);
    if (!entry && core_context.deferredCommitOriginMatchesContext(expectedOrigin, context)) {
        entry = archiveBackupEntryForContext(context, memoryBank, { expectedTaskOrigin: expectedOrigin, previousMemory: memoryBank });
    }
    if (!entry) {
        // Only index identities are consulted here; B's chat/worldbook never enter A's save.
        const matches = archive_groups.getArchiveIndex(context).filter(entryMatches);
        if (matches.length === 1) entry = matches[0];
    }
    if (!entryMatches(entry)) return false;
    entry = cloneCacheValue(entry);
    if (frozenJournal?.identity?.archiveTargetEntryId && frozenJournal.identity.archiveTargetEntryId !== core_context.archiveIndexEntryId(entry)) return false;
    const stillCurrent = () => core_context.runtimeLifecycleStillCurrent(expectedOrigin.lifecycleEpoch)
        && (typeof options.stillCurrent !== 'function' || options.stillCurrent());
    const mutate = cache => {
        const fence = assertModeWriteFence(cache, mode, expectedOrigin, null);
        if (draftId) {
            retainLegacyGenerationDraft(cache, mode);
            if (!frozenJournal) {
                finishGenerationDraftInCache(cache, mode, draftId, options.discardDraft === true);
                return;
            }
            const records = generationDraftRecords(cache), previous = records[draftId];
            if (previous && previous.status !== 'open') throw core_text.safeUserError('这份草稿已结束，旧回调没有覆盖保存记录。', 'RMT_RECOVERY_CLEARED');
            const next = { ...frozenJournal, draftId, pageId: frozenJournal.pageId || recoveryPageForVersion(mode, frozenJournal.operation),
                [core_constants.SESSION_MODE_WRITE_FENCE_KEY]: fence };
            cache[GENERATION_DRAFTS_CACHE_KEY] = { version: 1, records: { ...records, [draftId]: { ...previous, journal: next, status: 'open' } } };
            const legacy = cache?.[generation_recovery.GENERATION_RECOVERY_CACHE_KEY]?.[mode];
            if (legacy) clearRecoveryInCache(cache, mode); // Its complete copy was retained in the same transaction above.
            return;
        }
        if (!frozenJournal) { clearRecoveryInCache(cache, mode); return; }
        if (recoveryCleared(cache, mode)) {
            throw core_text.safeUserError('这轮生成已完成或被清除，旧草稿不会重新写回。', 'RMT_RECOVERY_CLEARED');
        }
        const journals = { ...(cache[generation_recovery.GENERATION_RECOVERY_CACHE_KEY] || {}) };
        journals[mode] = { ...frozenJournal, [core_constants.SESSION_MODE_WRITE_FENCE_KEY]: fence };
        cache[generation_recovery.GENERATION_RECOVERY_CACHE_KEY] = journals;
    };
    return serializeArchiveCommitOperation(entry, memoryBank, async () => {
        const result = await commitArchiveCacheMutation(entry, memoryBank, {}, mutate, stillCurrent,
            { requireExisting: true, generationDraftMutation: !!draftId });
        if (detachedTarget) detachedTarget.cache = cloneCacheValue(result.cache);
        // A background checkpoint is durable even when it has no current-chat mirror.
        // Mirror only after re-reading the actual host and proving the same origin.
        try {
            const live = core_context.currentCharacterGuard();
            if (stillCurrent() && core_context.deferredCommitOriginMatchesContext(expectedOrigin, live)
                && archive_repository.requireArchive(live).archiveRevision === revision) {
                rememberRuntimeSessionCache(cacheScopeFromContext(live), result.cache);
                live.chatMetadata[core_constants.CACHE_KEY] = cloneCacheValue(result.stored);
                await saveMetadataDurably(live);
            }
        } catch { /* The canonical checkpoint is already durable; do not fall back to another chat. */ }
        if (detachedTarget && context?.__rmtArchiveTargetEntryId === entry.entryId
            && core_context.comparableChatId(core_context.getChatId(context)) === chatId
            && context.chatMetadata?.[core_constants.MEMORY_KEY]?.archiveRevision === revision) {
            context.chatMetadata[core_constants.CACHE_KEY] = cloneCacheValue(result.cache);
        }
        return true;
    });
}

export function loadReadableGenerationProgress(mode, { context = null, cache: suppliedCache = null, memoryBank = null, chatId = '' } = {}) {
    const cache = suppliedCache || (context ? getCache(context) : null);
    if (!cache || !memoryBank) return null;
    const targetChatId = core_context.comparableChatId(chatId || memoryBank.chatId);
    const rows = Object.values(generationDraftRecords(cache)).filter(record => record.status === 'open'
        && record.result?.mode === mode && record.result.sourceMemory?.archiveRevision === memoryBank.archiveRevision
        && core_context.comparableChatId(record.result.sourceMemory?.chatId) === targetChatId
        && record.result.session?.readableProgress?.version === 1 && record.result.session.readableProgress.complete === false)
        .sort((left, right) => left.result.createdAt - right.result.createdAt);
    if (!rows.length) return null;
    let session = cache[mode] ? cloneCacheValue(cache[mode]) : null;
    for (const row of rows) {
        session = applySavedTaskPage(session, row.result);
        session.readableProgress = cloneCacheValue(row.result.session.readableProgress);
    }
    session.kind = mode; session.chatId = targetChatId; session.archiveRevision = memoryBank.archiveRevision;
    return session;
}
