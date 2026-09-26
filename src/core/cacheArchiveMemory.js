// C-3c（r84.101）：别名沿用 archive_groups，函数体一字不改；实际指向 core 层的桥，不再 import archive 层。
import * as archive_groups from './archiveBridge.js';
// C-3c（r84.101）：别名沿用 archive_backupStore，函数体一字不改；实际指向 core 层的桥，不再 import archive 层。
import * as archive_backupStore from './archiveBridge.js';
// C-3c（r84.101）：别名沿用 archive_repository，函数体一字不改；实际指向 core 层的桥，不再 import archive 层。
import * as archive_repository from './archiveBridge.js';
// C-3c（r84.101）：别名沿用 archive_snapshots，函数体一字不改；实际指向 core 层的桥，不再 import archive 层。
import * as archive_snapshots from './archiveBridge.js';
import * as core_constants from './constants.js';
import * as core_context from './context.js';
import * as core_requestCoordinator from './requestCoordinator.js';
import { state as runtimeState } from './state.js';
import * as core_text from './text.js';
import * as backup_diagnostics from './backupDiagnostics.js';
// C-3b（r84.99）：别名沿用 generation_recovery，函数体一字不改；实际指向 core 层的桥，不再 import generation 层。
import * as generation_recovery from './generationBridge.js';
import * as participant_contract from './participants.js';
import { ARCHIVE_VERSIONS_CACHE_KEY, GENERATION_DRAFTS_CACHE_KEY, GENERATION_RECOVERY_CLEARED_KEY, PARTICIPANT_DRAFT_METADATA_KEY, RETIRED_STORY_MODE, STORED_MODES, archiveBackupEntryForContext, archiveVersions, assertArchiveCommitState, assertExpectedTaskOrigin, assertPresentationOnlyMemoryPatch, cacheOrderValue, cacheScopeFromContext, cloneCacheValue, ensureCacheHydrated, getCache, hydrateBackupCacheValue, mergeCacheSnapshotsWithModeFences, participantConflict, participantDraft, participantOriginChanged, participantRoster, prepareCacheBackupValue, rememberRuntimeSessionCache, retainLegacyGenerationDraft, saveMetadataDurably, serializeArchiveCommitOperation, serializeCacheScopeOperation, stabilizeDeferredMigrationTimestamps, stampCacheCommit, stampStableMigratedCacheCommit } from './cacheRecords.js';
import { commitArchiveCacheMutation, scheduleCompressedCachePersist } from './cacheCommit.js';
import { assertReplacementInCache } from './cacheVersions.js';
// 档案记忆与备份：参与者名单、正式记忆保存、当前档案备份与恢复
// 从 core/cache.js 原样搬出（重构阶段 2），声明文本一字未改；core/cache.js 仍转发原有导出。

// Choosing the original single-card path discards only an unbuilt picker draft.
// It never removes a roster from an existing archive or alters generated content.
export async function discardParticipantDraft(context = core_context.currentCharacterGuard()) {
    if (archive_repository.getImportedMemory(context)) return false;
    const scope = cacheScopeFromContext(context);
    return serializeCacheScopeOperation(scope, async () => {
        const live = core_context.currentCharacterGuard();
        if (cacheScopeFromContext(live) !== scope) throw participantOriginChanged();
        if (archive_repository.getImportedMemory(live) || !participantDraft(live)) return false;
        const metadata = live.chatMetadata, previous = metadata[PARTICIPANT_DRAFT_METADATA_KEY];
        delete metadata[PARTICIPANT_DRAFT_METADATA_KEY];
        try { await live.saveMetadataDebounced?.(); }
        catch (error) {
            if (!Object.hasOwn(metadata, PARTICIPANT_DRAFT_METADATA_KEY)) metadata[PARTICIPANT_DRAFT_METADATA_KEY] = previous;
            throw error;
        }
        return true;
    });
}

export async function commitParticipantRoster(context, nextRoster, { expectedRevision = '' } = {}) {
    const desired = participantRoster(nextRoster);
    if (!desired) throw new TypeError('参与人物保存需要明确的多人名单。');
    const scope = cacheScopeFromContext(context);
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    const originalMemory = archive_repository.getImportedMemory(context);
    const sameOrigin = () => {
        let live;
        try { live = core_context.currentCharacterGuard(); } catch { return false; }
        return !context?.__rmtArchiveTargetEntryId && runtimeState.runtimeLifecycleEpoch === lifecycleEpoch
            && cacheScopeFromContext(live) === scope;
    };
    if (!sameOrigin()) throw participantOriginChanged();
    const next = () => ({ ...cloneCacheValue(desired), revision: globalThis.crypto?.randomUUID?.()
        || `participants-${Date.now()}-${Math.random().toString(36).slice(2)}` });

    if (!originalMemory) {
        const staged = await serializeCacheScopeOperation(scope, async () => {
            if (!sameOrigin()) throw participantOriginChanged();
            const live = core_context.currentCharacterGuard();
            // An archive may have finished while this foreground edit waited.
            // Leave the cache lane before entering the archive commit lane.
            if (archive_repository.getImportedMemory(live)) return null;
            if (!live.chatMetadata || typeof live.chatMetadata !== 'object') throw participantOriginChanged();
            const metadata = live.chatMetadata;
            const current = participantDraft(live);
            if ((current?.revision || '') !== expectedRevision) throw participantConflict();
            const hadDraft = Object.prototype.hasOwnProperty.call(metadata, PARTICIPANT_DRAFT_METADATA_KEY);
            const previous = metadata[PARTICIPANT_DRAFT_METADATA_KEY];
            const roster = next();
            const draft = { scope, roster };
            metadata[PARTICIPANT_DRAFT_METADATA_KEY] = draft;
            try {
                // This is intentionally host-queued staging, not an acknowledged
                // durable save. Never call a whole-chat save from this picker.
                await live.saveMetadataDebounced?.();
                if (!sameOrigin()) throw participantOriginChanged();
            } catch (error) {
                if (metadata[PARTICIPANT_DRAFT_METADATA_KEY] === draft) {
                    if (hadDraft) metadata[PARTICIPANT_DRAFT_METADATA_KEY] = previous;
                    else delete metadata[PARTICIPANT_DRAFT_METADATA_KEY];
                }
                throw error;
            }
            return cloneCacheValue(roster);
        });
        if (staged) return staged;
        return commitParticipantRoster(core_context.currentCharacterGuard(), desired, { expectedRevision });
    }

    const revision = core_text.normalizeText(originalMemory.archiveRevision, 240);
    const entry = archiveBackupEntryForContext(context, originalMemory);
    const stillCurrent = () => sameOrigin()
        && core_text.normalizeText(archive_repository.getImportedMemory(core_context.getContext())?.archiveRevision, 240) === revision;
    return serializeArchiveCommitOperation(entry, originalMemory, () => serializeCacheScopeOperation(scope, async () => {
        if (!stillCurrent()) throw participantOriginChanged();
        const live = core_context.currentCharacterGuard();
        await ensureCacheHydrated(live);
        if (!stillCurrent()) throw participantOriginChanged();
        let savedRoster;
        const committed = await commitArchiveCacheMutation(entry, originalMemory, getCache(live), cache => {
            const current = participantRoster(cache[participant_contract.PARTICIPANTS_KEY])
                || participantRoster(originalMemory[participant_contract.PARTICIPANTS_KEY]);
            if ((current?.revision || '') !== expectedRevision) throw participantConflict();
            savedRoster = next();
            cache[participant_contract.PARTICIPANTS_KEY] = savedRoster;
        }, stillCurrent, { participantRosterMutation: true });
        if (!stillCurrent()) throw participantOriginChanged();
        rememberRuntimeSessionCache(scope, committed.cache);
        live.chatMetadata[core_constants.CACHE_KEY] = cloneCacheValue(committed.stored);
        // The acknowledged canonical write above is authoritative. A failed
        // optional host mirror must not be reported as a lost selection.
        try { await saveMetadataDurably(live); }
        catch (error) { console.warn('[HeartbeatMemories] participant metadata mirror failed', core_text.safeErrorDiagnostic(error)); }
        return cloneCacheValue(savedRoster);
    }));
}

// 已有档案改回单人卡：去掉多人名单，不请求模型，也不重做已有记忆。
export async function selectSingleParticipantCard(context = core_context.currentCharacterGuard(), { expectedRevision = '' } = {}) {
    const originalMemory = archive_repository.getImportedMemory(context);
    if (!originalMemory) return discardParticipantDraft(context);
    const scope = cacheScopeFromContext(context);
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    const sameOrigin = () => {
        let live;
        try { live = core_context.currentCharacterGuard(); } catch { return false; }
        return !context?.__rmtArchiveTargetEntryId && runtimeState.runtimeLifecycleEpoch === lifecycleEpoch
            && cacheScopeFromContext(live) === scope;
    };
    if (!sameOrigin()) throw participantOriginChanged();
    const revision = core_text.normalizeText(originalMemory.archiveRevision, 240);
    const entry = archiveBackupEntryForContext(context, originalMemory);
    const stillCurrent = () => sameOrigin()
        && core_text.normalizeText(archive_repository.getImportedMemory(core_context.getContext())?.archiveRevision, 240) === revision;
    const key = participant_contract.PARTICIPANTS_KEY;
    const memoryForSave = cloneCacheValue(originalMemory);
    delete memoryForSave[key];
    return serializeArchiveCommitOperation(entry, originalMemory, () => serializeCacheScopeOperation(scope, async () => {
        if (!stillCurrent()) throw participantOriginChanged();
        const live = core_context.currentCharacterGuard();
        await ensureCacheHydrated(live);
        if (!stillCurrent()) throw participantOriginChanged();
        let removed = false;
        const committed = await commitArchiveCacheMutation(entry, memoryForSave, getCache(live), cache => {
            const current = participantRoster(cache[key]) || participantRoster(originalMemory[key]);
            if (!current) return false;
            if ((current.revision || '') !== expectedRevision) throw participantConflict();
            delete cache[key];
            removed = true;
        }, stillCurrent, { participantRosterMutation: true });
        if (!removed || committed.unchanged) return false;
        if (!stillCurrent()) throw participantOriginChanged();
        delete originalMemory[key];
        rememberRuntimeSessionCache(scope, committed.cache);
        live.chatMetadata[core_constants.CACHE_KEY] = cloneCacheValue(committed.stored);
        try { await saveMetadataDurably(live); }
        catch (error) { console.warn('[HeartbeatMemories] participant metadata mirror failed', core_text.safeErrorDiagnostic(error)); }
        return true;
    }));
}

async function saveImportedMemoryOperation(context, memoryBank, expectedChatId = memoryBank?.chatId, options = {}) {
    options.assertTaskCurrent?.();
    const initialScope = cacheScopeFromContext(context);
    let currentContext = core_context.currentCharacterGuard();
    // The host can expose a filename with .jsonl while the independent backup
    // and deferred origin use its canonical ID. Apply the same established
    // identity comparison without changing stored content or revision fences.
    const targetChatId = core_context.comparableChatId(expectedChatId);
    const currentChatId = core_context.comparableChatId(core_context.getChatId(currentContext));
    if (core_context.comparableChatId(memoryBank?.chatId) !== targetChatId) {
        throw core_text.safeUserError('待保存档案与目标聊天身份不一致，本次结果没有写入。', 'RMT_RECOVERY_ORIGIN_CHANGED');
    }
    if (!targetChatId || currentChatId !== targetChatId || core_context.comparableChatId(core_context.getChatId(context)) !== targetChatId
        || cacheScopeFromContext(currentContext) !== initialScope) {
        throw core_text.safeUserError('档案整理期间聊天窗口已经切换，本次没有写入；请回到原聊天后重试保存。', 'RMT_RECOVERY_ORIGIN_CHANGED');
    }
    assertExpectedTaskOrigin(currentContext, options.expectedTaskOrigin);
    if (!context.chatMetadata || typeof context.chatMetadata !== 'object') {
        throw core_text.safeUserError('当前聊天无法保存档案，生成结果保留待重试。', 'RMT_METADATA_DURABILITY_UNAVAILABLE');
    }
    const expectedState = options.expectedPreviousArchiveState;
    assertArchiveCommitState(context, expectedState);
    const explicitCreateStartedAt = Math.max(0, Number(options.expectedTaskOrigin?.startedAt) || 0);
    const explicitCreate = expectedState?.present === false
        && options.explicitCreate === true
        && explicitCreateStartedAt > 0;
    const deletionFence = archive_groups.currentCharacterArchiveDeletionFence(context, memoryBank);
    if (expectedState?.present === false && deletionFence
        && (!explicitCreate || Math.max(0, Number(deletionFence.deletedAt) || 0) >= explicitCreateStartedAt)) {
        const error = new Error('这项后台建档任务启动后，角色档案已被明确删除；旧结果不会重新创建档案。');
        error.code = 'RMT_ARCHIVE_DELETED_FENCE';
        throw error;
    }
    const previousMemory = archive_repository.getImportedMemory(context);
    if (options.presentationOnly) assertPresentationOnlyMemoryPatch(previousMemory, memoryBank);
    const backupEntry = archiveBackupEntryForContext(currentContext, memoryBank, {
        expectedTaskOrigin: options.expectedTaskOrigin,
        previousMemory,
    });
    const preserveDerivedCache = !!options.preserveDerivedCache && !!previousMemory;
    const stagedMemory = cloneCacheValue(memoryBank);
    stagedMemory.version = core_constants.ARCHIVE_SCHEMA_VERSION;
    // A full rebuild clears generated modes, but it does not erase the user's
    // independently saved cast. Read it even when this request predates the
    // first participant edit in another window.
    const participantBackupState = await archive_backupStore.readArchiveBackupState(backupEntry);
    const participantBackup = participantBackupState.record;
    const participantCache = participantBackup?.archiveRevision === core_text.normalizeText(previousMemory?.archiveRevision, 240)
        ? await hydrateBackupCacheValue(participantBackup.cache, expectedChatId, participantBackup.archiveRevision) : null;
    const participantKey = participant_contract.PARTICIPANTS_KEY;
    const currentRoster = participantRoster(participantCache?.[participantKey])
        || participantRoster(previousMemory?.[participantKey]) || participantDraft(currentContext)
        || participantRoster(stagedMemory[participantKey]);
    const savedVersions = archiveVersions(participantCache);
    const draftSource = cloneCacheValue(participantCache);
    for (const mode of Object.values(core_constants.MODE)) retainLegacyGenerationDraft(draftSource, mode);
    const savedDrafts = draftSource[GENERATION_DRAFTS_CACHE_KEY];
    if (options.participantRegeneration) assertReplacementInCache(participantCache, previousMemory,
        options.participantRegeneration, '');
    let preservedCache = null;
    if (preserveDerivedCache) {
        let candidate = getCache(context);
        const backupState = participantBackupState;
        if (backupState.deleted) {
            const error = new Error('这份档案已被明确删除，旧任务不能迁移它的派生内容。');
            error.code = 'RMT_ARCHIVE_DELETED_FENCE';
            throw error;
        }
        if (backupState.record?.archiveRevision === core_text.normalizeText(previousMemory.archiveRevision, 240)
            && backupState.record.cache) {
            const recovered = await hydrateBackupCacheValue(
                backupState.record.cache,
                expectedChatId,
                core_text.normalizeText(previousMemory.archiveRevision, 240),
            );
            if (recovered) {
                const primary = cacheOrderValue(backupState.record.cache) >= cacheOrderValue(candidate) ? recovered : candidate;
                const secondary = primary === recovered ? candidate : recovered;
                candidate = mergeCacheSnapshotsWithModeFences(primary, secondary, candidate, recovered);
            }
        }
        if (candidate && typeof candidate === 'object' && (options.presentationOnly || STORED_MODES.some(mode => candidate?.[mode]?.kind === mode)
            || Object.prototype.hasOwnProperty.call(candidate[generation_recovery.GENERATION_RECOVERY_CACHE_KEY] || {}, RETIRED_STORY_MODE))) {
            preservedCache = cloneCacheValue(candidate);
            if (!options.presentationOnly) {
                // A new evidence revision cannot inherit an unfinished request identity.
                for (const key of [generation_recovery.GENERATION_RECOVERY_CACHE_KEY, GENERATION_RECOVERY_CLEARED_KEY]) {
                    const previous = preservedCache[key];
                    delete preservedCache[key];
                    // Retired drafts keep their original identity as inert backup data.
                    if (Object.prototype.hasOwnProperty.call(previous || {}, RETIRED_STORY_MODE)) {
                        preservedCache[key] = { [RETIRED_STORY_MODE]: previous[RETIRED_STORY_MODE] };
                    }
                }
                archive_repository.migrateDerivedCacheRevision(preservedCache, previousMemory, stagedMemory);
            }
            if (options.expectedTaskOrigin) {
                stabilizeDeferredMigrationTimestamps(preservedCache, candidate, stagedMemory);
                stampStableMigratedCacheCommit(preservedCache, candidate, stagedMemory, initialScope);
            } else stampCacheCommit(preservedCache, initialScope);
        }
    }

    // Explicit cross-chat inheritance creates one new archive and its complete
    // derived cache in a single commit. The caller must already have rebound the
    // cache to the staged chat/revision and removed resumable jobs. Keeping this
    // as an initial value avoids a sequence of per-mode writes that could expose
    // a partially copied archive after a storage failure.
    if (Object.prototype.hasOwnProperty.call(options, 'initialCache')) {
        if (expectedState?.present !== false || previousMemory) {
            throw core_text.safeUserError('目标聊天已经有档案或派生内容，继承操作没有覆盖它。', 'RMT_CACHE_CAS_CONFLICT');
        }
        const candidate = cloneCacheValue(options.initialCache);
        const candidateChatId = core_context.comparableChatId(candidate?.chatId);
        const candidateRevision = core_text.normalizeText(candidate?.archiveRevision, 240);
        if (!candidate || typeof candidate !== 'object'
            || candidateChatId !== targetChatId
            || candidateRevision !== core_text.normalizeText(stagedMemory.archiveRevision, 240)) {
            throw core_text.safeUserError('继承缓存与新档案身份不一致，目标聊天保持不变。', 'RMT_RECOVERY_ORIGIN_CHANGED');
        }
        if (Object.prototype.hasOwnProperty.call(candidate, generation_recovery.GENERATION_RECOVERY_CACHE_KEY)
            || Object.prototype.hasOwnProperty.call(candidate, GENERATION_DRAFTS_CACHE_KEY)
            || Object.prototype.hasOwnProperty.call(candidate, core_constants.PHONE_DRAFT_CACHE_KEY)) {
            throw core_text.safeUserError('继承缓存仍含可续跑任务，目标聊天保持不变。', 'RMT_RECOVERY_ORIGIN_CHANGED');
        }
        preservedCache = candidate;
        stampCacheCommit(preservedCache, initialScope);
    }

    if (currentRoster) {
        if (!preservedCache) {
            preservedCache = { chatId: expectedChatId, archiveRevision: stagedMemory.archiveRevision };
            stampCacheCommit(preservedCache, initialScope);
        }
        preservedCache[participantKey] = cloneCacheValue(currentRoster);
    }
    if (savedVersions.length) {
        if (!preservedCache) {
            preservedCache = { chatId: expectedChatId, archiveRevision: stagedMemory.archiveRevision };
            stampCacheCommit(preservedCache, initialScope);
        }
        preservedCache[ARCHIVE_VERSIONS_CACHE_KEY] = cloneCacheValue(savedVersions);
    }
    if (savedDrafts) {
        if (!preservedCache) {
            preservedCache = { chatId: expectedChatId, archiveRevision: stagedMemory.archiveRevision };
            stampCacheCommit(preservedCache, initialScope);
        }
        preservedCache[GENERATION_DRAFTS_CACHE_KEY] = cloneCacheValue(savedDrafts);
    }

    const storedCache = preservedCache ? await prepareCacheBackupValue(preservedCache) : null;
    currentContext = core_context.currentCharacterGuard();
    if (core_context.comparableChatId(core_context.getChatId(currentContext)) !== targetChatId || cacheScopeFromContext(currentContext) !== initialScope) {
        throw core_text.safeUserError('档案整理期间聊天窗口已经切换，本次没有写入；请回到原聊天后重试保存。', 'RMT_RECOVERY_ORIGIN_CHANGED');
    }
    assertExpectedTaskOrigin(currentContext, options.expectedTaskOrigin);
    assertArchiveCommitState(currentContext, expectedState);
    const liveDeletionFence = archive_groups.currentCharacterArchiveDeletionFence(currentContext, stagedMemory);
    if (expectedState?.present === false && liveDeletionFence
        && (!explicitCreate || Math.max(0, Number(liveDeletionFence.deletedAt) || 0) >= explicitCreateStartedAt)) {
        const error = new Error('备份写入期间角色档案已被明确删除；旧结果不会重新创建档案。');
        error.code = 'RMT_ARCHIVE_DELETED_FENCE';
        throw error;
    }
    options.assertTaskCurrent?.();
    await archive_backupStore.replaceArchiveBackup(backupEntry, stagedMemory, storedCache, expectedState, {
        ...((currentRoster || savedVersions.length || savedDrafts) && expectedState.present === true
            && participantBackup?.archiveRevision === expectedState.revision
            ? { expectedCacheOrder: cacheOrderValue(participantBackup.cache), comparePreviousCache: true } : {}),
        ...(typeof options.assertTaskCurrent === 'function' || options.expectedTaskOrigin
            ? { stillCurrent: () => { options.assertTaskCurrent?.();
                return core_requestCoordinator.isLogicalGenerationTaskCurrent?.(options.expectedTaskOrigin) !== false; } } : {}),
        allowMissingPrevious: expectedState.present === true,
        allowCharacterRename: backupEntry.allowCharacterRename === true,
        allowIdempotentRetry: !!options.expectedTaskOrigin,
        // Only a new canonical archive created by an explicit user action may clear a prior
        // deletion fence. Background seed/cache writers never receive this capability.
        allowDeletedRecreate: explicitCreate,
        recreateStartedAt: explicitCreateStartedAt,
    });

    // Backup persistence is awaited before replacing the chat copy. Recheck after that await so
    // an old foreground/deferred result cannot win a same-chat revision race.
    options.assertTaskCurrent?.();
    currentContext = core_context.currentCharacterGuard();
    if (core_context.comparableChatId(core_context.getChatId(currentContext)) !== targetChatId || cacheScopeFromContext(currentContext) !== initialScope) {
        throw core_text.safeUserError('档案整理期间聊天窗口已经切换，本次没有写入；请回到原聊天后重试保存。', 'RMT_RECOVERY_ORIGIN_CHANGED');
    }
    assertExpectedTaskOrigin(currentContext, options.expectedTaskOrigin);
    assertArchiveCommitState(currentContext, expectedState);
    const scope = cacheScopeFromContext(currentContext);
    const previousState = {
        hadMemory: Object.prototype.hasOwnProperty.call(currentContext.chatMetadata, core_constants.MEMORY_KEY),
        memory: cloneCacheValue(currentContext.chatMetadata[core_constants.MEMORY_KEY]),
        hadCache: Object.prototype.hasOwnProperty.call(currentContext.chatMetadata, core_constants.CACHE_KEY),
        cache: cloneCacheValue(currentContext.chatMetadata[core_constants.CACHE_KEY]),
        hadRuntime: runtimeState.runtimeSessionCache.has(scope),
        runtime: cloneCacheValue(runtimeState.runtimeSessionCache.get(scope)),
        hadPending: runtimeState.pendingCompressedCacheWrites.has(scope),
        pending: cloneCacheValue(runtimeState.pendingCompressedCacheWrites.get(scope)),
    };
    currentContext.chatMetadata[core_constants.MEMORY_KEY] = stagedMemory;
    runtimeState.pendingCompressedCacheWrites.delete(scope);
    const timer = runtimeState.cachePersistTimers.get(scope);
    if (timer) clearTimeout(timer);
    runtimeState.cachePersistTimers.delete(scope);

    if (preservedCache && storedCache) {
        rememberRuntimeSessionCache(scope, preservedCache);
        currentContext.chatMetadata[core_constants.CACHE_KEY] = storedCache;
    } else {
        delete currentContext.chatMetadata[core_constants.CACHE_KEY];
        runtimeState.runtimeSessionCache.delete(scope);
    }

    try {
        await saveMetadataDurably(currentContext);
    } catch (error) {
        if (previousState.hadMemory) currentContext.chatMetadata[core_constants.MEMORY_KEY] = previousState.memory;
        else delete currentContext.chatMetadata[core_constants.MEMORY_KEY];
        if (previousState.hadCache) currentContext.chatMetadata[core_constants.CACHE_KEY] = previousState.cache;
        else delete currentContext.chatMetadata[core_constants.CACHE_KEY];
        if (previousState.hadRuntime) rememberRuntimeSessionCache(scope, previousState.runtime);
        else runtimeState.runtimeSessionCache.delete(scope);
        if (previousState.hadPending) runtimeState.pendingCompressedCacheWrites.set(scope, previousState.pending);
        else runtimeState.pendingCompressedCacheWrites.delete(scope);
        if (previousState.hadRuntime) scheduleCompressedCachePersist(currentContext, previousState.runtime, 250);
        throw error;
    }
    if (expectedState.present === false) {
        // A successful, explicit new archive is intentional recreation, not an old archive
        // resurfacing through a scan. Clear only this character's library tombstone after the
        // backup and canonical chat copy have both committed.
        archive_groups.restoreCurrentCharacterArchiveVisibility(currentContext, stagedMemory, { explicitCreate: true });
        const prefix = `${core_text.normalizeText(backupEntry.entryId, 120)}|${core_context.comparableChatId(stagedMemory.chatId)}|`;
        for (const key of runtimeState.archiveDeletionFences) {
            if (key.startsWith(prefix)) runtimeState.archiveDeletionFences.delete(key);
        }
    }
    archive_snapshots.rememberCurrentArchiveForOverview(currentContext);
    archive_snapshots.syncArchiveOverviewCurrentRow(currentContext);
    archive_groups.upsertArchiveIndex(currentContext, stagedMemory, { existingEntryId: backupEntry.entryId });
    return stagedMemory;
}

export async function saveImportedMemory(context, memoryBank, expectedChatId = memoryBank?.chatId, options = {}) {
    const scope = cacheScopeFromContext(context);
    const entry = archiveBackupEntryForContext(context, memoryBank, {
        expectedTaskOrigin: options.expectedTaskOrigin,
        previousMemory: archive_repository.getImportedMemory(context),
    });
    return serializeArchiveCommitOperation(entry, memoryBank,
        () => serializeCacheScopeOperation(scope, () => saveImportedMemoryOperation(context, memoryBank, expectedChatId, options)));
}

function cacheRecordUpdatedAt(value) {
    return Math.max(0, Number(value?.updatedAt) || 0);
}

async function recoverMissingCurrentArchiveFromBackup(context) {
    if (!context?.chatMetadata || typeof context.chatMetadata !== 'object') return false;
    const expectedChatId = core_context.getChatId(context);
    const expectedRuntimeKey = core_context.currentCharacterRuntimeKey(context);
    if (!expectedChatId) return false;
    const currentProbe = archive_groups.currentCharacterArchiveProbe(context, null);
    const stableAvatar = core_context.archiveStoredAvatar(currentProbe);
    const stableHint = Number.isInteger(Number(currentProbe.characterIndexHint)) ? Number(currentProbe.characterIndexHint) : -1;
    const stableMatches = stableAvatar && stableHint >= 0
        ? archive_groups.getArchiveIndex(context).filter(item =>
            core_context.comparableChatId(item?.chatId) === core_context.comparableChatId(expectedChatId)
            && core_context.archiveStoredAvatar(item) === stableAvatar
            && Number(item?.characterIndexHint) === stableHint)
        : [];
    // A card edit can change name/fingerprint and therefore the derived probe key. Recover
    // through the one persisted row that still proves chat + avatar + SillyTavern slot.
    // Multiple such rows are ambiguous and must never be guessed.
    if (stableMatches.length > 1) return false;
    const probe = stableMatches.length === 1 ? { ...stableMatches[0] } : archiveBackupEntryForContext(context, null);
    return serializeArchiveCommitOperation(probe, { chatId: expectedChatId }, async () => {
        const state = await archive_backupStore.readArchiveBackupState(probe);
        if (state.deleted || !state.record?.memory) return false;
        let live;
        try { live = core_context.currentCharacterGuard(); } catch { return false; }
        if (core_context.getChatId(live) !== expectedChatId
            || core_context.currentCharacterRuntimeKey(live) !== expectedRuntimeKey
            || archive_repository.migrateArchiveInMemory(live.chatMetadata?.[core_constants.MEMORY_KEY])) return false;
        const memory = archive_repository.migrateArchiveInMemory(cloneCacheValue(state.record.memory));
        if (!memory || core_context.comparableChatId(memory.chatId) !== core_context.comparableChatId(expectedChatId)) return false;
        let recoveredCache = null;
        if (state.record.cache) {
            try { recoveredCache = await hydrateBackupCacheValue(state.record.cache, expectedChatId, memory.archiveRevision); }
            catch { recoveredCache = null; }
        }
        try { live = core_context.currentCharacterGuard(); } catch { return false; }
        if (core_context.getChatId(live) !== expectedChatId
            || core_context.currentCharacterRuntimeKey(live) !== expectedRuntimeKey
            || archive_repository.migrateArchiveInMemory(live.chatMetadata?.[core_constants.MEMORY_KEY])) return false;
        const scope = cacheScopeFromContext(live);
        live.chatMetadata[core_constants.MEMORY_KEY] = memory;
        runtimeState.pendingCompressedCacheWrites.delete(scope);
        if (recoveredCache) {
            rememberRuntimeSessionCache(scope, recoveredCache);
            live.chatMetadata[core_constants.CACHE_KEY] = cloneCacheValue(state.record.cache);
        } else {
            runtimeState.runtimeSessionCache.delete(scope);
            delete live.chatMetadata[core_constants.CACHE_KEY];
        }
        await saveMetadataDurably(live);
        archive_groups.restoreCurrentCharacterArchiveVisibility(live, memory);
        archive_groups.upsertArchiveIndex(live, memory, { existingEntryId: state.record.entryId || probe.entryId });
        return true;
    });
}

export async function ensureCurrentArchiveBackup(context = null) {
    // Opted-in auto updates may load the runtime before a chat is ready. No
    // eligible chat is a no-op, not a storage failure; do not open IndexedDB.
    if (!context) {
        try { context = core_context.currentCharacterGuard(); } catch { return false; }
    }
    if (context.groupId || context.characterId === undefined || context.characterId === null
        || !context.chatMetadata || typeof context.chatMetadata !== 'object'
        || !core_context.getChatId(context)) return false;
    const initialMemory = archive_repository.getImportedMemory(context);
    if (!initialMemory) return recoverMissingCurrentArchiveFromBackup(context);
    if (archive_groups.isCurrentCharacterDeletedFromLibrary(context, initialMemory)) return false;
    const expectedChatId = core_context.getChatId(context);
    const expectedLiveRevision = core_text.normalizeText(initialMemory.archiveRevision, 240);
    const expectedRuntimeKey = core_context.currentCharacterRuntimeKey(context);
    const backupEntry = archiveBackupEntryForContext(context, initialMemory);
    return serializeArchiveCommitOperation(backupEntry, initialMemory, async () => {
        const exactWindowStillOpen = candidateContext => core_context.getChatId(candidateContext) === expectedChatId
            && core_context.currentCharacterRuntimeKey(candidateContext) === expectedRuntimeKey
            && !!candidateContext?.chatMetadata;
        const originalMirrorStillPresent = candidateContext => exactWindowStillOpen(candidateContext)
            && core_text.normalizeText(candidateContext.chatMetadata?.[core_constants.MEMORY_KEY]?.archiveRevision, 240) === expectedLiveRevision;
        let currentContext;
        try { currentContext = core_context.currentCharacterGuard(); } catch { return false; }
        let currentMemory = archive_repository.getImportedMemory(currentContext);
        if (!originalMirrorStillPresent(currentContext)
            || archive_groups.isCurrentCharacterDeletedFromLibrary(currentContext, currentMemory)) return false;
        const backupState = await archive_backupStore.readArchiveBackupState(backupEntry);
        try { currentContext = core_context.currentCharacterGuard(); } catch { return false; }
        currentMemory = archive_repository.getImportedMemory(currentContext);
        if (!originalMirrorStillPresent(currentContext)) return false;
        if (backupState.deleted) {
            runtimeState.archiveDeletionFences.add(archive_repository.archiveDeletionFenceKey(currentContext, currentMemory, backupEntry.entryId));
            const raw = archive_repository.migrateArchiveInMemory(currentContext.chatMetadata?.[core_constants.MEMORY_KEY]);
            if (raw && core_text.normalizeText(raw.archiveRevision, 240) === expectedLiveRevision) {
                const scope = cacheScopeFromContext(currentContext);
                delete currentContext.chatMetadata[core_constants.MEMORY_KEY];
                delete currentContext.chatMetadata[core_constants.CACHE_KEY];
                runtimeState.runtimeSessionCache.delete(scope);
                runtimeState.pendingCompressedCacheWrites.delete(scope);
                try { await saveMetadataDurably(currentContext); }
                catch (error) { console.warn('[HeartbeatMemories] pending archive deletion cleanup failed', core_text.safeErrorDiagnostic(error)); }
            }
            return false;
        }
        const backupRecord = backupState.record;
        const backupRevision = core_text.normalizeText(backupRecord?.archiveRevision, 240);
        // The awaited IndexedDB commit is canonical. If the page closed before the host's
        // debounced metadata mirror flushed, reopen by promoting the newer canonical memory
        // back into the still-exact chat window. Revisions are opaque identities, so wall-clock
        // timestamps can never authorize an older host mirror to replace a different IDB revision.
        if (backupRecord?.memory && backupRevision && backupRevision !== expectedLiveRevision
        ) {
            let recoveredCache = null;
            if (backupRecord.cache) {
                try { recoveredCache = await hydrateBackupCacheValue(backupRecord.cache, expectedChatId, backupRevision); }
                catch { recoveredCache = null; }
            }
            try { currentContext = core_context.currentCharacterGuard(); } catch { return false; }
            if (!originalMirrorStillPresent(currentContext)) return false;
            const recoveredMemory = archive_repository.migrateArchiveInMemory(cloneCacheValue(backupRecord.memory));
            if (!recoveredMemory || core_context.comparableChatId(recoveredMemory.chatId) !== core_context.comparableChatId(expectedChatId)) return false;
            const scope = cacheScopeFromContext(currentContext);
            currentContext.chatMetadata[core_constants.MEMORY_KEY] = recoveredMemory;
            runtimeState.pendingCompressedCacheWrites.delete(scope);
            const timer = runtimeState.cachePersistTimers.get(scope);
            if (timer) clearTimeout(timer);
            runtimeState.cachePersistTimers.delete(scope);
            if (recoveredCache) {
                rememberRuntimeSessionCache(scope, recoveredCache);
                currentContext.chatMetadata[core_constants.CACHE_KEY] = cloneCacheValue(backupRecord.cache);
            } else {
                runtimeState.runtimeSessionCache.delete(scope);
                delete currentContext.chatMetadata[core_constants.CACHE_KEY];
            }
            try { await saveMetadataDurably(currentContext); }
            catch (error) { throw backup_diagnostics.annotateBackupFailure(error, 'mirror'); }
            archive_groups.restoreCurrentCharacterArchiveVisibility(currentContext, recoveredMemory);
            archive_groups.upsertArchiveIndex(currentContext, recoveredMemory, { existingEntryId: backupEntry.entryId });
            return true;
        }

        const expectedRevision = expectedLiveRevision;
        const backupCache = backupRevision === expectedRevision ? backupRecord.cache : null;
        let backupRecovered = null;
        try { backupRecovered = await hydrateBackupCacheValue(backupCache, expectedChatId, expectedRevision); } catch {}
        const backupCacheIsInvalid = !!backupCache && !backupRecovered;

        const scope = cacheScopeFromContext(currentContext);
        const latestLive = () => {
            const metadataStored = currentContext.chatMetadata?.[core_constants.CACHE_KEY];
            const runtimeCache = runtimeState.runtimeSessionCache.get(scope);
            return cacheOrderValue(runtimeCache) > cacheOrderValue(metadataStored)
                ? { stored: runtimeCache, cache: cloneCacheValue(runtimeCache), runtime: true }
                : { stored: metadataStored, cache: null, runtime: false };
        };
        let liveCandidate = latestLive();
        let liveRecovered = liveCandidate.cache;
        if (!liveRecovered) {
            try { liveRecovered = await hydrateBackupCacheValue(liveCandidate.stored, expectedChatId, expectedRevision); } catch {}
        }
        // Re-read after every async hydration. A synchronous saveSession may have advanced the
        // runtime cache while this repair task yielded even though both durable writers share a lock.
        const refreshedLive = latestLive();
        if (cacheOrderValue(refreshedLive.stored) > cacheOrderValue(liveCandidate.stored)) {
            liveCandidate = refreshedLive;
            liveRecovered = refreshedLive.cache;
            if (!liveRecovered) {
                try { liveRecovered = await hydrateBackupCacheValue(refreshedLive.stored, expectedChatId, expectedRevision); } catch {}
            }
        }
        if (backupRecovered?.[GENERATION_DRAFTS_CACHE_KEY] || liveRecovered?.[GENERATION_DRAFTS_CACHE_KEY]
            || backupRecovered?.[ARCHIVE_VERSIONS_CACHE_KEY] || liveRecovered?.[ARCHIVE_VERSIONS_CACHE_KEY]
            || participantRoster(backupRecovered?.[participant_contract.PARTICIPANTS_KEY])
            || participantRoster(liveRecovered?.[participant_contract.PARTICIPANTS_KEY])
            || participantRoster(currentMemory?.[participant_contract.PARTICIPANTS_KEY])) {
            // A later content clock on a host mirror cannot authorize an older
            // participant choice or erase a durable draft's readable result.
            // Use the same canonical merge/CAS as content saves.
            const stillCurrent = () => {
                let live;
                try { live = core_context.currentCharacterGuard(); } catch { return false; }
                return originalMirrorStillPresent(live)
                    && !archive_groups.isCurrentCharacterDeletedFromLibrary(live, archive_repository.getImportedMemory(live));
            };
            const committed = await commitArchiveCacheMutation(backupEntry, currentMemory, liveRecovered || {}, () => true, stillCurrent);
            if (!stillCurrent()) return false;
            currentContext = core_context.currentCharacterGuard();
            rememberRuntimeSessionCache(scope, committed.cache);
            currentContext.chatMetadata[core_constants.CACHE_KEY] = cloneCacheValue(committed.stored);
            await saveMetadataDurably(currentContext);
            return true;
        }
        const backupWins = !!backupRecovered && cacheOrderValue(backupCache) > cacheOrderValue(liveCandidate.stored);
        if (backupWins) {
            try { currentContext = core_context.currentCharacterGuard(); } catch { return false; }
            currentMemory = archive_repository.getImportedMemory(currentContext);
            const nowLive = latestLive();
            if (!originalMirrorStillPresent(currentContext)
                || archive_groups.isCurrentCharacterDeletedFromLibrary(currentContext, currentMemory)
                || cacheOrderValue(nowLive.stored) >= cacheOrderValue(backupCache)) return false;
            const previousStored = cloneCacheValue(currentContext.chatMetadata?.[core_constants.CACHE_KEY]);
            const hadStored = Object.prototype.hasOwnProperty.call(currentContext.chatMetadata || {}, core_constants.CACHE_KEY);
            const previousRuntime = cloneCacheValue(runtimeState.runtimeSessionCache.get(scope));
            const hadRuntime = runtimeState.runtimeSessionCache.has(scope);
            rememberRuntimeSessionCache(scope, backupRecovered);
            currentContext.chatMetadata[core_constants.CACHE_KEY] = cloneCacheValue(backupCache);
            try { await saveMetadataDurably(currentContext); }
            catch (error) {
                if (hadStored) currentContext.chatMetadata[core_constants.CACHE_KEY] = previousStored;
                else delete currentContext.chatMetadata[core_constants.CACHE_KEY];
                if (hadRuntime) rememberRuntimeSessionCache(scope, previousRuntime);
                else runtimeState.runtimeSessionCache.delete(scope);
                throw backup_diagnostics.annotateBackupFailure(error, 'mirror');
            }
            return true;
        }

        let cache = null;
        try { cache = liveRecovered ? await prepareCacheBackupValue(liveRecovered) : null; }
        catch (error) { throw backup_diagnostics.annotateBackupFailure(error, 'prepare'); }
        try { currentContext = core_context.currentCharacterGuard(); } catch { return false; }
        currentMemory = archive_repository.getImportedMemory(currentContext);
        if (!originalMirrorStillPresent(currentContext)
            || archive_groups.isCurrentCharacterDeletedFromLibrary(currentContext, currentMemory)) return false;
        const seeded = await archive_backupStore.seedArchiveBackup(backupEntry, currentMemory, cache, {
            replaceInvalidCache: backupCacheIsInvalid,
        });
        if (!seeded) throw backup_diagnostics.backupFailureError(null, 'write', 'transaction');
        return true;
    });
}
