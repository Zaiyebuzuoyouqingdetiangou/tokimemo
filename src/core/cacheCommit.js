import * as recovery_source from './recoverySourcePolicy.js';
import * as archive_backupStore from '../archive/backupStore.js';
import * as archive_repository from '../archive/repository.js';
import * as core_constants from './constants.js';
import * as core_context from './context.js';
import * as core_requestCoordinator from './requestCoordinator.js';
import { state as runtimeState } from './state.js';
import * as core_text from './text.js';
import * as backup_diagnostics from './backupDiagnostics.js';
import * as generation_recovery from '../generation/recovery.js';
import * as participant_contract from './participants.js';
import { archiveBackupEntryForContext, archiveCommitScope, cacheOrderValue, cacheScopeFromContext, clearRecoveryInCache, cloneCacheValue, compressedCacheManifest, discardSessionsBehindModeFences, ensureCacheHydrated, generationDraftRecords, getCache, gzipJson, hydrateBackupCacheValue, isCompressedCacheRecord, mergeCacheSnapshotsWithModeFences, mergeModeWriteFences, mirrorCacheUsableAsStarting, modeWriteFenceSignature, nextModeWriteFence, participantRoster, prepareBoundedRawCache, prepareCommittedCacheBackupValue, recoveryCleared, recoveryDraftId, recoveryPageForVersion, rememberPendingCompressedWrite, rememberRuntimeSessionCache, retainCanonicalArchiveVersions, retainCanonicalGenerationDrafts, saveMetadataDurably, serializeArchiveCommitOperation, serializeCacheScopeOperation, stampCacheCommit } from './cacheRecords.js';
// 缓存提交：压缩落盘调度、档案缓存合并提交、实时缓存提交、模式生成认领、删除会话
// 从 core/cache.js 原样搬出（重构阶段 2），声明文本一字未改；core/cache.js 仍转发原有导出。

export function cacheStillMatchesLiveArchive(cache, context, expectedScope) {
    if (!cache || !context || cacheScopeFromContext(context) !== expectedScope) return false;
    const memory = archive_repository.getImportedMemory(context);
    if (!memory) return false;
    const cacheChatId = core_context.comparableChatId(cache?.chatId);
    const cacheRevision = core_text.normalizeText(cache?.archiveRevision, 240);
    if (cacheChatId && cacheChatId !== core_context.comparableChatId(memory.chatId)) return false;
    if (cacheRevision && cacheRevision !== core_text.normalizeText(memory.archiveRevision, 240)) return false;
    const liveStored = context.chatMetadata?.[core_constants.CACHE_KEY];
    const liveRuntime = runtimeState.runtimeSessionCache.get(expectedScope);
    const liveOrder = Math.max(cacheOrderValue(liveStored), cacheOrderValue(liveRuntime));
    if (liveOrder && cacheOrderValue(cache) < liveOrder) return false;
    return true;
}

async function persistCompressedCacheOperation(context, cache, expectedScope) {
    if (!cache || typeof cache !== 'object') return false;
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    if (typeof CompressionStream !== 'function') {
        const prepared = prepareBoundedRawCache(cache);
        let latest;
        try { latest = core_context.currentCharacterGuard(); } catch { return false; }
        if (!cacheStillMatchesLiveArchive(cache, latest, expectedScope)) return false;
        const memory = archive_repository.getImportedMemory(latest);
        await archive_backupStore.updateArchiveBackupCache(archiveBackupEntryForContext(latest, memory), memory, prepared.value);
        if (lifecycleEpoch !== runtimeState.runtimeLifecycleEpoch) return false;
        try { latest = core_context.currentCharacterGuard(); } catch { return false; }
        if (!cacheStillMatchesLiveArchive(cache, latest, expectedScope)) return false;
        latest.chatMetadata[core_constants.CACHE_KEY] = prepared.value;
        await saveMetadataDurably(latest);
        return true;
    }
    await core_context.yieldToUi();
    if (lifecycleEpoch !== runtimeState.runtimeLifecycleEpoch) return false;
    const packed = await gzipJson(cache);
    if (lifecycleEpoch !== runtimeState.runtimeLifecycleEpoch) return false;
    if (!packed?.data) return false;
    const record = compressedCacheManifest(cache, packed);
    let latest;
    try { latest = core_context.currentCharacterGuard(); } catch { latest = null; }
    if (!latest || cacheScopeFromContext(latest) !== expectedScope) {
        rememberPendingCompressedWrite(expectedScope, record);
        return false;
    }
    // Compression can finish after an explicit archive delete/full revision change. Never let
    // a stale in-flight gzip resurrect a removed/older Heartbeat cache into live metadata.
    if (!cacheStillMatchesLiveArchive(cache, latest, expectedScope)) {
        return false;
    }
    const memory = archive_repository.getImportedMemory(latest);
    await archive_backupStore.updateArchiveBackupCache(archiveBackupEntryForContext(latest, memory), memory, record);
    if (lifecycleEpoch !== runtimeState.runtimeLifecycleEpoch) return false;
    try { latest = core_context.currentCharacterGuard(); } catch { return false; }
    if (!cacheStillMatchesLiveArchive(cache, latest, expectedScope)) {
        return false;
    }
    latest.chatMetadata[core_constants.CACHE_KEY] = record;
    await saveMetadataDurably(latest);
    if (runtimeState.pendingCompressedCacheWrites.get(expectedScope) === record) runtimeState.pendingCompressedCacheWrites.delete(expectedScope);
    return true;
}

export async function persistCompressedCacheNow(context, cache, expectedScope = cacheScopeFromContext(context)) {
    if (!cache || typeof cache !== 'object') return false;
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    const memory = archive_repository.getImportedMemory(context);
    if (!memory) return false;
    const entry = archiveBackupEntryForContext(context, memory);
    const expectedChatId = core_context.getChatId(context);
    const expectedRevision = core_text.normalizeText(memory.archiveRevision, 240);
    const expectedRuntimeKey = core_context.currentCharacterRuntimeKey(context);
    const stillCurrent = () => {
        let live;
        try { live = core_context.currentCharacterGuard(); } catch { return false; }
        const liveMemory = archive_repository.getImportedMemory(live);
        return runtimeState.runtimeLifecycleEpoch === lifecycleEpoch
            && cacheScopeFromContext(live) === expectedScope
            && core_context.getChatId(live) === expectedChatId
            && core_context.currentCharacterRuntimeKey(live) === expectedRuntimeKey
            && core_text.normalizeText(liveMemory?.archiveRevision, 240) === expectedRevision;
    };
    try {
        return await commitLiveCacheMutation(entry, memory, expectedScope, () => {
            let liveCache = null;
            try { liveCache = getCache(core_context.currentCharacterGuard()); } catch {}
            return cacheOrderValue(liveCache) > cacheOrderValue(cache) ? liveCache : cache;
        }, () => true, stillCurrent);
    } catch (error) {
        // Runtime destruction invalidates this transient compression job. Treat that stale result as
        // a normal no-write outcome while preserving genuine backup/storage failures for callers.
        if (runtimeState.runtimeLifecycleEpoch !== lifecycleEpoch) return false;
        throw error;
    }
}

export function shouldWriteUncompressedCacheImmediately(stored) {
    // Modern browsers can gzip the cache locally. In that case an immediate uncompressed metadata
    // write only doubles network traffic (large raw cache first, compressed cache second). Keep the
    // authoritative working copy in runtime memory and persist the compressed representation once.
    return !isCompressedCacheRecord(stored) && typeof CompressionStream !== 'function';
}

export function scheduleCompressedCachePersist(context, cache, delay = 1800) {
    const scope = cacheScopeFromContext(context);
    rememberRuntimeSessionCache(scope, cache);
    const previous = runtimeState.cachePersistTimers.get(scope);
    if (previous) clearTimeout(previous);

    const arm = waitMs => {
        const timer = setTimeout(() => {
            // Provider requests are latency-sensitive and may already be uploading a large prompt.
            // Coalesce every partial save while generation is active, then do one compressed metadata
            // write after the provider queue drains. This prevents repeated full-cache uploads from
            // saturating home uplinks / causing router bufferbloat during generation.
            if (core_requestCoordinator.shouldDeferCachePersistForProviderTraffic()) {
                arm(core_constants.CACHE_PERSIST_IDLE_RETRY_MS);
                return;
            }
            runtimeState.cachePersistTimers.delete(scope);
            void persistCompressedCacheNow(context, cache, scope).catch(error => {
                console.warn('[HeartbeatMemories] compressed cache persist failed', core_text.safeErrorDiagnostic(error));
                globalThis.toastr?.warning?.(core_text.toastText(`${core_text.safeErrorSummary(error)} 上一份有效缓存和独立备份均未覆盖。`), '心迹回廊');
            });
        }, Math.max(0, Number(waitMs) || 0));
        runtimeState.cachePersistTimers.set(scope, timer);
    };

    arm(delay);
}

export function scheduleLegacyCacheCompressionIdle(_context = null) {
    // 0.8.9.1 emergency performance guard: legacy-cache migration is intentionally disabled
    // on startup/chat navigation. Keeping this no-op helper preserves call compatibility
    // with older code paths without ever scheduling heavy JSON.stringify/gzip work.
}

export async function flushPendingCompressedCacheForCurrentChat() {
    let context;
    try { context = core_context.currentCharacterGuard(); } catch { return; }
    const scope = cacheScopeFromContext(context);
    const record = runtimeState.pendingCompressedCacheWrites.get(scope);
    if (!record) return;
    if (!cacheStillMatchesLiveArchive(record, context, scope)) {
        runtimeState.pendingCompressedCacheWrites.delete(scope);
        return;
    }
    const memory = archive_repository.getImportedMemory(context);
    let cache = null;
    try { cache = await hydrateBackupCacheValue(record, core_context.getChatId(context), core_text.normalizeText(memory?.archiveRevision, 240)); }
    catch { cache = null; }
    if (!cache) return;
    const saved = await persistCompressedCacheNow(context, cache, scope);
    if (saved && runtimeState.pendingCompressedCacheWrites.get(scope) === record) runtimeState.pendingCompressedCacheWrites.delete(scope);
}

export async function commitArchiveCacheMutation(entry, memoryBank, baseCache, mutate, stillCurrent = null, options = {}) {
    const chatId = core_context.comparableChatId(memoryBank?.chatId);
    const revision = core_text.normalizeText(memoryBank?.archiveRevision, 240);
    const tokenScope = `archive:${archiveCommitScope(entry, memoryBank)}`;
    let lastConflict = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        if (typeof stillCurrent === 'function' && !stillCurrent()) throw new Error('同一档案已启动更新的任务，本次旧结果没有写入。');
        const backupState = await archive_backupStore.readArchiveBackupState(entry);
        if (typeof stillCurrent === 'function' && !stillCurrent()) throw new Error('同一档案已启动更新的任务，本次旧结果没有写入。');
        if (backupState.deleted) {
            const error = new Error('这份档案已被明确删除，旧任务不能重新写回。');
            error.code = 'RMT_ARCHIVE_DELETED_FENCE';
            throw error;
        }
        const latest = backupState.record?.archiveRevision === revision ? backupState.record : null;
        if (options.requireExisting && !latest) {
            throw core_text.safeUserError('原档案已不存在或版本已变化，旧草稿没有写回。', 'RMT_RECOVERY_ORIGIN_CHANGED');
        }
        const supplied = cloneCacheValue(baseCache || {});
        let canonical = null;
        let starting = cloneCacheValue(supplied);
        if (latest?.cache) {
            let recovered = null;
            let hydrationError = null;
            try { recovered = await hydrateBackupCacheValue(latest.cache, chatId, revision); }
            catch (error) {
                // A classified storage failure is already actionable and keeps its own
                // classification; only an unreadable derived payload (damaged gzip
                // data, or a host without DecompressionStream) takes the
                // corrupt-record path below. Note runtime zlib errors carry their own
                // lowercase .code (e.g. Z_DATA_ERROR): those are payload corruption,
                // not storage classifications.
                if (backup_diagnostics.backupFailureDiagnostic(error) || /^RMT_/.test(String(error?.code || ''))) throw error;
                hydrationError = error;
            }
            if (typeof stillCurrent === 'function' && !stillCurrent()) throw new Error('同一档案已启动更新的任务，本次旧结果没有写入。');
            if (recovered) {
                canonical = recovered;
                const primary = cacheOrderValue(latest.cache) >= cacheOrderValue(starting) ? recovered : starting;
                const secondary = primary === recovered ? starting : recovered;
                starting = mergeCacheSnapshotsWithModeFences(primary, secondary, supplied, recovered);
            } else if (hydrationError) {
                // The canonical record's derived cache cannot be read. Never "repair"
                // it by deleting the record or silently overwriting it outside this
                // acknowledged CAS commit, and never resurrect canonical-only artifacts
                // (drafts/versions/roster) from an unreadable payload: with no canonical
                // snapshot the existing fence rules below already rebuild them from the
                // intact memory instead. Continue only when a same-chat/same-revision
                // runtime/metadata mirror can serve as the starting point.
                if (!mirrorCacheUsableAsStarting(supplied, chatId, revision)) {
                    throw core_text.safeUserError('本机缓存记录损坏，原档案数据未修改；请重新打开当前档案。', 'RMT_CACHE_BACKUP_CORRUPT');
                }
                console.warn('[HeartbeatMemories] canonical cache record unreadable; committing from the live mirror only',
                    { code: 'RMT_CACHE_BACKUP_CORRUPT', ...core_text.safeErrorDiagnostic(hydrationError) });
            }
        }
        if (!canonical) {
            const mergedFences = mergeModeWriteFences(supplied, null);
            if (Object.keys(mergedFences).length) starting[core_constants.MODE_WRITE_FENCES_CACHE_KEY] = mergedFences;
            discardSessionsBehindModeFences(starting);
        }
        const cache = cloneCacheValue(starting);
        retainCanonicalArchiveVersions(cache, canonical);
        retainCanonicalGenerationDrafts(cache, canonical);
        const participantKey = participant_contract.PARTICIPANTS_KEY;
        const canonicalRoster = participantRoster(canonical?.[participantKey])
            || participantRoster(latest?.memory?.[participantKey]) || participantRoster(memoryBank?.[participantKey]);
        if (canonicalRoster) cache[participantKey] = cloneCacheValue(canonicalRoster);
        else delete cache[participantKey];
        if (mutate(cache, cloneCacheValue(latest?.memory || memoryBank)) === false) return { cache, stored: null, unchanged: true };
        if (options.archiveVersionMutation !== true) retainCanonicalArchiveVersions(cache, canonical);
        if (options.generationDraftMutation !== true) retainCanonicalGenerationDrafts(cache, canonical);
        // Only the explicit selection API may replace the current roster.
        // Generation/recovery/cache snapshots carry historical input, not this authority.
        if (options.participantRosterMutation !== true) {
            if (canonicalRoster) cache[participantKey] = cloneCacheValue(canonicalRoster);
            else delete cache[participantKey];
        }
        cache.chatId = chatId;
        cache.archiveRevision = revision;
        stampCacheCommit(cache, tokenScope);
        const stored = await prepareCommittedCacheBackupValue(cache);
        if (typeof stillCurrent === 'function' && !stillCurrent()) throw new Error('同一档案已启动更新的任务，本次旧结果没有写入。');
        try {
            const writeOptions = { expectedCacheOrder: cacheOrderValue(latest?.cache), stillCurrent };
            const savedMemory = options.preserveCanonicalMemory === true && latest?.memory ? latest.memory : memoryBank;
            if (options.requireExisting) {
                await archive_backupStore.replaceArchiveBackup(entry, savedMemory, stored, { present: true, revision }, {
                    ...writeOptions, allowMissingPrevious: false, allowCharacterRename: entry?.allowCharacterRename === true,
                });
            } else await archive_backupStore.updateArchiveBackupCache(entry, savedMemory, stored, writeOptions);
            if (typeof stillCurrent === 'function' && !stillCurrent()) throw new Error('同一档案已启动更新的任务，本次旧结果没有写入。');
            return { cache, stored };
        } catch (error) {
            if (error?.code !== 'RMT_CACHE_CAS_CONFLICT') throw error;
            lastConflict = error;
        }
    }
    throw lastConflict || new Error('独立档案备份持续发生并发变化，本次结果没有覆盖较新的内容。');
}

export async function commitLiveCacheMutation(entry, memoryBank, scope, baseCache, mutate, stillCurrent = null, options = {}) {
    return serializeArchiveCommitOperation(entry, memoryBank, () => serializeCacheScopeOperation(scope, async () => {
        if (typeof stillCurrent === 'function' && !stillCurrent()) return false;
        const resolvedBase = typeof baseCache === 'function' ? baseCache() : baseCache;
        const committed = await commitArchiveCacheMutation(entry, memoryBank, resolvedBase, mutate, stillCurrent);
        if (committed.unchanged) return false;
        if (typeof stillCurrent === 'function' && !stillCurrent()) return false;
        let context;
        try { context = core_context.currentCharacterGuard(); } catch { return false; }
        const previousStored = cloneCacheValue(context.chatMetadata?.[core_constants.CACHE_KEY]);
        const hadStored = Object.prototype.hasOwnProperty.call(context.chatMetadata || {}, core_constants.CACHE_KEY);
        const previousRuntime = cloneCacheValue(runtimeState.runtimeSessionCache.get(scope));
        const hadRuntime = runtimeState.runtimeSessionCache.has(scope);
        rememberRuntimeSessionCache(scope, committed.cache);
        context.chatMetadata[core_constants.CACHE_KEY] = cloneCacheValue(committed.stored);
        try { await saveMetadataDurably(context); }
        catch (error) {
            if (options.keepCommittedOnMirrorFailure === true) {
                // The awaited IndexedDB commit above already owns this claim. A host
                // mirror scheduling failure must not roll the canonical claim back or
                // abort the generation that has not sent a request yet; the in-memory
                // mirrors left in place match the durable record exactly.
                console.warn('[HeartbeatMemories] claim metadata mirror scheduling failed; canonical claim kept',
                    core_text.safeErrorDiagnostic(error));
                return true;
            }
            if (hadStored) context.chatMetadata[core_constants.CACHE_KEY] = previousStored;
            else delete context.chatMetadata[core_constants.CACHE_KEY];
            if (hadRuntime) rememberRuntimeSessionCache(scope, previousRuntime);
            else runtimeState.runtimeSessionCache.delete(scope);
            throw error;
        }
        return true;
    }));
}

function advanceModeWriteFence(cache, mode) {
    if (!Object.values(core_constants.MODE).includes(mode)) throw new Error('无法识别要生成的派生分类。');
    discardSessionsBehindModeFences(cache);
    if (!cache[core_constants.MODE_WRITE_FENCES_CACHE_KEY] || typeof cache[core_constants.MODE_WRITE_FENCES_CACHE_KEY] !== 'object') {
        cache[core_constants.MODE_WRITE_FENCES_CACHE_KEY] = Object.create(null);
    }
    const next = nextModeWriteFence(cache, mode);
    cache[core_constants.MODE_WRITE_FENCES_CACHE_KEY][mode] = next;
    const signature = modeWriteFenceSignature(next);
    if (cache[generation_recovery.GENERATION_RECOVERY_CACHE_KEY]?.[mode]) cache[generation_recovery.GENERATION_RECOVERY_CACHE_KEY][mode][core_constants.SESSION_MODE_WRITE_FENCE_KEY] = signature;
    if (cache?.[mode] && typeof cache[mode] === 'object') cache[mode][core_constants.SESSION_MODE_WRITE_FENCE_KEY] = signature;
    if (mode === core_constants.MODE.PHONE && cache?.[core_constants.PHONE_DRAFT_CACHE_KEY]) {
        cache[core_constants.PHONE_DRAFT_CACHE_KEY][core_constants.SESSION_MODE_WRITE_FENCE_KEY] = signature;
    }
    return signature;
}

function recoveryJournalForAdmission(cache, mode, options) {
    const candidates = Object.entries(generationDraftRecords(cache)).filter(([draftId, record]) => record.status === 'open'
        && record.journal?.identity?.mode === mode && (!options.draftId || draftId === options.draftId)
        && (!options.pageId || (record.journal.pageId || recoveryPageForVersion(mode, record.journal.operation)) === options.pageId))
        .map(([, record]) => record.journal);
    const legacy = cache?.[generation_recovery.GENERATION_RECOVERY_CACHE_KEY]?.[mode];
    if (legacy && !recoveryCleared(cache, mode) && (!options.draftId || recoveryDraftId(legacy, mode) === options.draftId)
        && (!options.pageId || (legacy.pageId || recoveryPageForVersion(mode, legacy.operation)) === options.pageId)) candidates.push(legacy);
    return candidates.sort((left, right) => (right.updatedAt || right.createdAt || 0) - (left.updatedAt || left.createdAt || 0))[0] || null;
}

export async function claimLiveModeGeneration(mode, context = core_context.currentCharacterGuard(), memoryBank = null, options = {}) {
    const bank = memoryBank || archive_repository.requireArchive(context);
    const expectedChatId = core_context.getChatId(context);
    const expectedRevision = core_text.normalizeText(bank.archiveRevision, 240);
    const expectedRuntimeKey = core_context.currentCharacterRuntimeKey(context);
    try { await ensureCacheHydrated(context); } catch {}
    // Check the raw retained journal before a changed character makes the normal
    // identity-filtered loader hide it and before advancing any write fence.
    const rawRecovery = recoveryJournalForAdmission(getCache(context), mode, options);
    await recovery_source.assertRecoverySourcePolicy(rawRecovery, context, core_context.captureTaskOrigin(context, bank.archiveRevision));
    const scope = cacheScopeFromContext(context);
    const entry = archiveBackupEntryForContext(context, bank);
    if (rawRecovery?.identity?.archiveTargetEntryId && rawRecovery.identity.archiveTargetEntryId !== entry.entryId) {
        throw core_text.safeUserError('草稿所属档案与当前目标不同；原内容及草稿保留，未发起新请求。', 'RMT_RECOVERY_SOURCE_CHANGED');
    }
    const stillCurrent = () => {
        let live;
        try { live = core_context.currentCharacterGuard(); } catch { return false; }
        const liveMemory = archive_repository.getImportedMemory(live);
        return core_context.currentCharacterRuntimeKey(live) === expectedRuntimeKey
            && core_context.getChatId(live) === expectedChatId
            && core_text.normalizeText(liveMemory?.archiveRevision, 240) === expectedRevision;
    };
    // Pre-flight takeover check: if a newer task has already moved this archive
    // (character runtime, chat or archiveRevision changed) before the CAS even
    // starts, the claim can never succeed. Surface the existing conflict code
    // instead of the uncoded in-CAS sentinel; the in-CAS stillCurrent checks
    // below stay exactly as they are.
    if (!stillCurrent()) {
        throw core_text.safeUserError('档案已被更新的任务接管；本次没有发起模型请求，请检查当前档案后重试。', 'RMT_CACHE_CAS_CONFLICT');
    }
    let signature = '';
    const committed = await commitLiveCacheMutation(entry, bank, scope, getCache(context), cache => {
        signature = advanceModeWriteFence(cache, mode);
    }, stillCurrent, { keepCommittedOnMirrorFailure: true });
    if (!committed || !signature) throw new Error('生成启动前未能冻结派生内容版本，本次没有发起模型请求。');
    return signature;
}

export async function claimDetachedModeGeneration(target, mode, stillCurrent = null) {
    const entryId = core_text.normalizeText(target?.entryId, 120);
    const chatId = core_context.comparableChatId(target?.chatId);
    const memoryBank = cloneCacheValue(target?.memory);
    const revision = core_text.normalizeText(memoryBank?.archiveRevision, 240);
    if (!entryId || !chatId || !revision) throw new Error('后台生成目标身份不完整，本次没有发起模型请求。');
    const entry = {
        ...target,
        entryId,
        chatId,
        characterName: core_text.normalizeText(target?.characterName || memoryBank.characterName, 120),
        characterIndexHint: Number.isInteger(Number(target?.characterIndexHint)) ? Number(target.characterIndexHint) : -1,
    };
    let signature = '';
    const committed = await serializeArchiveCommitOperation(entry, memoryBank, () => commitArchiveCacheMutation(
        entry,
        memoryBank,
        target?.cache || {},
        cache => { signature = advanceModeWriteFence(cache, mode); },
        stillCurrent,
    ));
    if (!signature || !committed?.cache) throw new Error('后台生成启动前未能冻结派生内容版本，本次没有发起模型请求。');
    target.cache = cloneCacheValue(committed.cache);
    return { cache: cloneCacheValue(committed.cache), signature };
}

export async function deleteSessions(modes, expectedChatId = '') {
    const requested = [...new Set((Array.isArray(modes) ? modes : [modes])
        .map(mode => core_text.normalizeText(mode, 80))
        .filter(Boolean))];
    if (!requested.length) return false;
    const context = core_context.currentCharacterGuard();
    const currentChatId = core_context.getChatId(context);
    const wantedChatId = core_text.normalizeText(expectedChatId, 240) || currentChatId;
    if (!wantedChatId || currentChatId !== wantedChatId) {
        throw new Error('删除派生内容期间聊天窗口已经变化，本次操作已取消。');
    }
    const generatingMode = requested.find(mode => core_requestCoordinator.isModeGenerating(mode, context));
    if (generatingMode) {
        throw core_text.safeUserError(`「${core_constants.MODE_LABEL[generatingMode] || generatingMode}」仍在生成，当前内容不会在同一轮生成中被删除。请等待生成结束后再试。`, 'RMT_DELETE_DURING_GENERATION');
    }
    const memoryBank = archive_repository.requireArchive(context);
    if (!context.chatMetadata || typeof context.chatMetadata !== 'object') {
        throw new Error('当前聊天无法保存 metadata，不能删除派生内容。');
    }
    try { await ensureCacheHydrated(context); } catch {}
    const scope = cacheScopeFromContext(context);
    const expectedRuntimeKey = core_context.currentCharacterRuntimeKey(context);
    const entry = archiveBackupEntryForContext(context, memoryBank);
    const stillCurrent = () => {
        let live;
        try { live = core_context.currentCharacterGuard(); } catch { return false; }
        const liveMemory = archive_repository.getImportedMemory(live);
        return core_context.currentCharacterRuntimeKey(live) === expectedRuntimeKey
            && core_context.getChatId(live) === wantedChatId
            && core_text.normalizeText(liveMemory?.archiveRevision, 240) === core_text.normalizeText(memoryBank.archiveRevision, 240);
    };
    return commitLiveCacheMutation(entry, memoryBank, scope, getCache(context), cache => {
        let changed = false;
        if (!cache[core_constants.MODE_WRITE_FENCES_CACHE_KEY] || typeof cache[core_constants.MODE_WRITE_FENCES_CACHE_KEY] !== 'object') {
            cache[core_constants.MODE_WRITE_FENCES_CACHE_KEY] = Object.create(null);
        }
        for (const mode of requested) {
            cache[core_constants.MODE_WRITE_FENCES_CACHE_KEY][mode] = nextModeWriteFence(cache, mode);
            clearRecoveryInCache(cache, mode);
            changed = true;
            if (Object.prototype.hasOwnProperty.call(cache, mode)) {
                delete cache[mode];
            }
            if (mode === core_constants.MODE.PHONE && Object.prototype.hasOwnProperty.call(cache, core_constants.PHONE_DRAFT_CACHE_KEY)) {
                delete cache[core_constants.PHONE_DRAFT_CACHE_KEY];
                changed = true;
            }
        }
        return changed;
    }, stillCurrent);
}

export async function deleteSession(mode, expectedChatId = '') {
    return deleteSessions([mode], expectedChatId);
}
