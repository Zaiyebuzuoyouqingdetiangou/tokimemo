// C-3c（r84.101）：别名沿用 archive_groups，函数体一字不改；实际指向 core 层的桥，不再 import archive 层。
import * as archive_groups from './archiveBridge.js';
// C-3c（r84.101）：别名沿用 archive_repository，函数体一字不改；实际指向 core 层的桥，不再 import archive 层。
import * as archive_repository from './archiveBridge.js';
import * as core_constants from './constants.js';
import * as core_context from './context.js';
import * as core_requestCoordinator from './requestCoordinator.js';
import { state as runtimeState } from './state.js';
import * as core_text from './text.js';
// C-3b（r84.99）：别名沿用 generation_recovery，函数体一字不改；实际指向 core 层的桥，不再 import generation 层。
import * as generation_recovery from './generationBridge.js';
import * as participant_contract from './participants.js';
// 缓存底层：缓存键与克隆、压缩与清单、提交令牌、写入栅栏、备份条目、参与者草稿元数据、缓存读取与水合
// 从 core/cache.js 原样搬出（重构阶段 2），声明文本一字未改；core/cache.js 仍转发原有导出。

// Per-fence clear markers survive cache merges: an older metadata mirror must not
// resurrect a completed/deleted journal merely because its cache clock is newer.
export const GENERATION_RECOVERY_CLEARED_KEY = '__generationRecoveryClearedV1';

export const GENERATION_DRAFTS_CACHE_KEY = '__generationDraftsV2';

export function generationDraftRecords(cache) {
    const pool = cache?.[GENERATION_DRAFTS_CACHE_KEY];
    return pool?.version === 1 && pool.records && typeof pool.records === 'object' && !Array.isArray(pool.records)
        ? pool.records : {};
}

export function recoveryDraftId(journal, mode) {
    return typeof journal?.draftId === 'string' && journal.draftId
        ? journal.draftId : `legacy:${mode}:${core_context.stableArchiveHash(JSON.stringify([journal?.identity, journal?.createdAt]))}`;
}

export function retainCanonicalGenerationDrafts(target, canonical) {
    if (Object.hasOwn(canonical || {}, GENERATION_DRAFTS_CACHE_KEY)) {
        target[GENERATION_DRAFTS_CACHE_KEY] = cloneCacheValue(canonical[GENERATION_DRAFTS_CACHE_KEY]);
    } else delete target[GENERATION_DRAFTS_CACHE_KEY];
}

export function retainLegacyGenerationDraft(cache, mode) {
    const journal = cache?.[generation_recovery.GENERATION_RECOVERY_CACHE_KEY]?.[mode];
    if (!generation_recovery.generationRecoverySummary(journal) || recoveryCleared(cache, mode)) return;
    const draftId = recoveryDraftId(journal, mode);
    const records = generationDraftRecords(cache);
    if (Object.hasOwn(records, draftId)) return;
    cache[GENERATION_DRAFTS_CACHE_KEY] = { version: 1, records: { ...records,
        [draftId]: { journal: cloneCacheValue(journal), status: 'open' } } };
}

export function finishGenerationDraftInCache(cache, mode, draftId, discarded = false) {
    if (!draftId) return false;
    retainLegacyGenerationDraft(cache, mode);
    const records = generationDraftRecords(cache), record = records[draftId];
    if (!record || (record.journal?.identity?.mode || record.result?.mode || record.mode) !== mode) return false;
    if (record.status !== 'open' && !(discarded && record.status === 'awaiting-choice')) return true;
    cache[GENERATION_DRAFTS_CACHE_KEY] = { version: 1, records: { ...records,
        [draftId]: { status: discarded ? 'discarded' : 'complete', mode,
            pageId: record.journal.pageId || recoveryPageForVersion(mode, record.journal.operation), closedAt: Date.now() } } };
    const legacy = cache?.[generation_recovery.GENERATION_RECOVERY_CACHE_KEY]?.[mode];
    if (legacy && recoveryDraftId(legacy, mode) === draftId) clearRecoveryInCache(cache, mode);
    return true;
}

// A draft owns its original inputs. A newer page/fence must not erase another
// unfinished operation merely because both operations use the same mode.
export function generationDraftRows(stored, bank, { mode = '' } = {}) {
    if (!bank) return [];
    const rows = [], seen = new Set();
    const add = (draftId, journal, status = 'open') => {
        if (seen.has(draftId)) return;
        seen.add(draftId);
        const summary = generation_recovery.generationRecoverySummary(journal);
        if (status !== 'open' || !summary || journal.identity.chatId !== bank.chatId
            || (mode && journal.identity.mode !== mode) || !Object.values(core_constants.MODE).includes(journal.identity.mode)) return;
        rows.push({ draftId, pageId: journal.pageId || recoveryPageForVersion(journal.identity.mode, journal.operation),
            mode: journal.identity.mode, createdAt: journal.createdAt, ...summary, journal: cloneCacheValue(journal) });
    };
    for (const [id, record] of Object.entries(generationDraftRecords(stored))) add(id, record.journal, record.status);
    for (const [legacyMode, journal] of Object.entries(stored?.[generation_recovery.GENERATION_RECOVERY_CACHE_KEY] || {})) {
        if (!recoveryCleared(stored, legacyMode)) add(recoveryDraftId(journal, legacyMode), journal);
    }
    return rows.sort((left, right) => right.updatedAt - left.updatedAt || right.createdAt - left.createdAt);
}

export function sameProgressItemValue(left, right) {
    if (left === right) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object'
        || Array.isArray(left) !== Array.isArray(right)) return false;
    if (Array.isArray(left) && left.length !== right.length) return false;
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length
        && keys.every(key => Object.hasOwn(right, key) && sameProgressItemValue(left[key], right[key]));
}

// Retired story data remains inert in existing saves; it is never an active mode.
export const RETIRED_STORY_MODE = 'timeJourney';

export const STORED_MODES = Object.freeze([...Object.values(core_constants.MODE), RETIRED_STORY_MODE]);

// Before an archive exists this is only a foreground, host-queued selection.
// The archive recovery recipe freezes its own input before generation starts.
export const PARTICIPANT_DRAFT_METADATA_KEY = 'heartbeat_memories_participants_draft_v1';

export function recoveryCleared(cache, mode) {
    const cleared = cache?.[GENERATION_RECOVERY_CLEARED_KEY];
    return Object.prototype.hasOwnProperty.call(cleared || {}, mode)
        && cleared[mode] === modeWriteFenceForCache(cache, mode);
}

export function clearRecoveryInCache(cache, mode) {
    if (cache[generation_recovery.GENERATION_RECOVERY_CACHE_KEY]) delete cache[generation_recovery.GENERATION_RECOVERY_CACHE_KEY][mode];
    cache[GENERATION_RECOVERY_CLEARED_KEY] = { ...(cache[GENERATION_RECOVERY_CLEARED_KEY] || {}),
        [mode]: modeWriteFenceForCache(cache, mode) };
}

export function clearCompletedRecovery(cache, mode, origin = null) {
    if (origin?.generationRecoveryDraftId) {
        const record = generationDraftRecords(cache)[origin.generationRecoveryDraftId];
        const summary = generation_recovery.generationRecoverySummary(record?.journal);
        if (summary && !summary.failureCode && !summary.truncated && !summary.failed) {
            finishGenerationDraftInCache(cache, mode, origin.generationRecoveryDraftId);
        }
        return;
    }
    const journal = cache?.[generation_recovery.GENERATION_RECOVERY_CACHE_KEY]?.[mode];
    const summary = generation_recovery.generationRecoverySummary(journal);
    if (summary && summary.mode === mode && !summary.failureCode && !summary.truncated && !summary.failed
        && journal[core_constants.SESSION_MODE_WRITE_FENCE_KEY] === modeWriteFenceForCache(cache, mode)) {
        clearRecoveryInCache(cache, mode);
    }
}

export function cloneCacheValue(value) {
    if (!value || typeof value !== 'object') return {};
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

export function participantRoster(value) {
    return participant_contract.normalizeParticipantRoster(value);
}

export function participantConflict() {
    return core_text.safeUserError('参与人物已由另一次保存更新，请重新打开选择；本次没有覆盖新名单。', 'RMT_PARTICIPANTS_CAS_CONFLICT');
}

export function participantOriginChanged() {
    return core_text.safeUserError('选择人物期间原聊天或档案已经变化，本次没有写入其他档案。', 'RMT_RECOVERY_ORIGIN_CHANGED');
}

export function participantDraft(context) {
    const draft = context?.chatMetadata?.[PARTICIPANT_DRAFT_METADATA_KEY];
    return draft?.scope === cacheScopeFromContext(context) ? participantRoster(draft.roster) : null;
}

function retainCanonicalParticipants(cache, canonical) {
    const key = participant_contract.PARTICIPANTS_KEY;
    if (Object.prototype.hasOwnProperty.call(canonical || {}, key)) cache[key] = cloneCacheValue(canonical[key]);
}

function normalizedModeWriteFence(value) {
    const generation = Math.max(0, Math.floor(Number(value?.generation) || 0));
    const token = core_text.normalizeText(value?.token, 160);
    return generation > 0 && token ? { generation, token } : null;
}

export function modeWriteFenceSignature(value) {
    const fence = normalizedModeWriteFence(value);
    return fence ? `${fence.generation}:${fence.token}` : '';
}

export function modeWriteFenceForCache(cache, mode) {
    return modeWriteFenceSignature(cache?.[core_constants.MODE_WRITE_FENCES_CACHE_KEY]?.[mode]);
}

function modeWriteFenceExpected(origin, session, mode) {
    const originFences = origin?.modeWriteFences;
    if (originFences && typeof originFences === 'object') return modeWriteFenceSignature(originFences[mode]);
    return core_text.normalizeText(session?.[core_constants.SESSION_MODE_WRITE_FENCE_KEY], 240);
}

export function assertModeWriteFence(cache, mode, origin = null, session = null) {
    const current = modeWriteFenceForCache(cache, mode);
    const expected = modeWriteFenceExpected(origin, session, mode);
    if (current === expected) return current;
    const error = core_text.safeUserError('这项内容在任务启动后已被删除或由更新的任务接管；旧结果不会重新写回。', 'RMT_MODE_WRITE_FENCE');
    throw error;
}

export function nextModeWriteFence(cache, mode) {
    const current = normalizedModeWriteFence(cache?.[core_constants.MODE_WRITE_FENCES_CACHE_KEY]?.[mode]);
    const token = globalThis.crypto?.randomUUID?.()
        || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
    return { generation: Math.min(Number.MAX_SAFE_INTEGER, (current?.generation || 0) + 1), token };
}

export function mergeModeWriteFences(baseCache, canonicalCache) {
    const base = baseCache?.[core_constants.MODE_WRITE_FENCES_CACHE_KEY];
    const canonical = canonicalCache?.[core_constants.MODE_WRITE_FENCES_CACHE_KEY];
    const merged = Object.create(null);
    for (const mode of STORED_MODES) {
        const left = normalizedModeWriteFence(base?.[mode]);
        const right = normalizedModeWriteFence(canonical?.[mode]);
        const winner = !left ? right : !right ? left
            : right.generation > left.generation ? right
            : right.generation < left.generation ? left
            : right; // Equal-generation conflict is resolved by the canonical IDB record.
        if (winner) merged[mode] = winner;
    }
    return merged;
}

export function discardSessionsBehindModeFences(cache) {
    for (const mode of STORED_MODES) {
        const fence = modeWriteFenceForCache(cache, mode);
        if (!fence || !cache?.[mode]) continue;
        const sessionFence = core_text.normalizeText(cache[mode]?.[core_constants.SESSION_MODE_WRITE_FENCE_KEY], 240);
        if (sessionFence !== fence) delete cache[mode];
    }
    const phoneFence = modeWriteFenceForCache(cache, core_constants.MODE.PHONE);
    if (phoneFence && cache?.[core_constants.PHONE_DRAFT_CACHE_KEY]) {
        const draftFence = core_text.normalizeText(cache[core_constants.PHONE_DRAFT_CACHE_KEY]?.[core_constants.SESSION_MODE_WRITE_FENCE_KEY], 240);
        if (draftFence !== phoneFence) delete cache[core_constants.PHONE_DRAFT_CACHE_KEY];
    }
    const journals = cache?.[generation_recovery.GENERATION_RECOVERY_CACHE_KEY];
    if (journals && typeof journals === 'object') {
        for (const mode of Object.keys(journals)) {
            if (mode === RETIRED_STORY_MODE) {
                if (recoveryCleared(cache, mode)) delete journals[mode];
                continue; // Preserve opaque retired drafts without offering recovery.
            }
            const journal = journals[mode];
            if (!STORED_MODES.includes(mode) || recoveryCleared(cache, mode)
                || !generation_recovery.generationRecoverySummary(journal)
                || journal.identity?.mode !== mode
                || journal.identity?.chatId !== cache.chatId
                || journal.identity?.archiveRevision !== cache.archiveRevision
                || journal[core_constants.SESSION_MODE_WRITE_FENCE_KEY] !== modeWriteFenceForCache(cache, mode)) delete journals[mode];
        }
    }
    return cache;
}

export function mergeCacheSnapshotsWithModeFences(primary, secondary, supplied, canonical) {
    const merged = cloneCacheValue(primary || {});
    // Content clocks do not grant authority to edit the independently selected cast.
    retainCanonicalParticipants(merged, canonical);
    retainCanonicalArchiveVersions(merged, canonical);
    retainCanonicalGenerationDrafts(merged, canonical);
    const fallback = secondary && typeof secondary === 'object' ? secondary : {};
    const mergedFences = mergeModeWriteFences(supplied, canonical);
    if (Object.keys(mergedFences).length) merged[core_constants.MODE_WRITE_FENCES_CACHE_KEY] = mergedFences;
    else delete merged[core_constants.MODE_WRITE_FENCES_CACHE_KEY];
    const cleared = Object.create(null);
    for (const mode of STORED_MODES) {
        const fence = modeWriteFenceForCache(merged, mode);
        for (const source of [supplied, canonical]) {
            if (Object.prototype.hasOwnProperty.call(source?.[GENERATION_RECOVERY_CLEARED_KEY] || {}, mode)
                && source[GENERATION_RECOVERY_CLEARED_KEY][mode] === fence) cleared[mode] = fence;
        }
        if (Object.prototype.hasOwnProperty.call(canonical?.[GENERATION_RECOVERY_CLEARED_KEY] || {}, mode)
            && canonical[GENERATION_RECOVERY_CLEARED_KEY][mode] === fence
            && !(modeWriteFenceForCache(supplied, mode) === fence && recoveryCleared(supplied, mode)
                && cacheOrderValue(supplied) > cacheOrderValue(canonical))) {
            // A completed/cleared generation's canonical artifact belongs to the same
            // commit as its clear marker; do not roll it back with a pre-completion mirror.
            // A newer mirror which already carries that same completion marker
            // may contain later image/UI edits; it is not a pre-completion snapshot.
            if (canonical[mode]) merged[mode] = cloneCacheValue(canonical[mode]);
            else delete merged[mode];
        }
    }
    merged[GENERATION_RECOVERY_CLEARED_KEY] = cleared;
    discardSessionsBehindModeFences(merged);
    for (const mode of STORED_MODES) {
        if (!merged[generation_recovery.GENERATION_RECOVERY_CACHE_KEY]?.[mode] && fallback[generation_recovery.GENERATION_RECOVERY_CACHE_KEY]?.[mode]) {
            merged[generation_recovery.GENERATION_RECOVERY_CACHE_KEY] ||= {};
            merged[generation_recovery.GENERATION_RECOVERY_CACHE_KEY][mode] = cloneCacheValue(fallback[generation_recovery.GENERATION_RECOVERY_CACHE_KEY][mode]);
        }
    }
    discardSessionsBehindModeFences(merged);
    for (const mode of STORED_MODES) {
        if (merged?.[mode] || !fallback?.[mode]) continue;
        const wantedFence = modeWriteFenceForCache(merged, mode);
        const candidateFence = core_text.normalizeText(fallback[mode]?.[core_constants.SESSION_MODE_WRITE_FENCE_KEY], 240);
        // Exact equality preserves legacy cache pairs (both empty) but rejects a stale session
        // whose owning fence has been deleted or advanced in the canonical record.
        if (candidateFence === wantedFence) merged[mode] = cloneCacheValue(fallback[mode]);
    }
    if (!merged?.[core_constants.PHONE_DRAFT_CACHE_KEY]
        && fallback?.[core_constants.PHONE_DRAFT_CACHE_KEY]
        && !merged?.[core_constants.MODE.PHONE]) {
        const wantedFence = modeWriteFenceForCache(merged, core_constants.MODE.PHONE);
        const candidateFence = core_text.normalizeText(
            fallback[core_constants.PHONE_DRAFT_CACHE_KEY]?.[core_constants.SESSION_MODE_WRITE_FENCE_KEY],
            240,
        );
        if (candidateFence === wantedFence) {
            merged[core_constants.PHONE_DRAFT_CACHE_KEY] = cloneCacheValue(fallback[core_constants.PHONE_DRAFT_CACHE_KEY]);
        }
    }
    return merged;
}

function archiveIdentityRefreshRequired(existing, probe) {
    if (!existing || !probe) return false;
    const existingHint = Number.isInteger(Number(existing?.characterIndexHint)) ? Number(existing.characterIndexHint) : -1;
    const probeHint = Number.isInteger(Number(probe?.characterIndexHint)) ? Number(probe.characterIndexHint) : -1;
    return core_text.normalizeText(existing?.characterName, 120) !== core_text.normalizeText(probe?.characterName, 120)
        || core_text.normalizeText(existing?.characterFingerprint, 160) !== core_text.normalizeText(probe?.characterFingerprint, 160)
        || existingHint !== probeHint;
}

export function stabilizeDeferredMigrationTimestamps(cache, previousCache, memoryBank) {
    if (!cache || typeof cache !== 'object') return cache;
    const timestamp = Math.max(1, Math.floor(Number(memoryBank?.updatedAt) || Number(memoryBank?.createdAt) || 1));
    cache.updatedAt = timestamp;
    for (const mode of Object.values(core_constants.MODE)) {
        const nextMeta = cache?.[mode]?.generationMeta;
        if (!nextMeta || typeof nextMeta !== 'object') continue;
        const previousParts = previousCache?.[mode]?.generationMeta?.parts;
        const nextParts = nextMeta.parts && typeof nextMeta.parts === 'object' ? nextMeta.parts : {};
        let stamped = false;
        for (const [part, record] of Object.entries(nextParts)) {
            if (Object.prototype.hasOwnProperty.call(previousParts || {}, part)) continue;
            if (record && typeof record === 'object') record.updatedAt = timestamp;
            stamped = true;
        }
        if (stamped && nextMeta.lastUpdate && typeof nextMeta.lastUpdate === 'object') {
            nextMeta.lastUpdate.updatedAt = timestamp;
        }
    }
    return cache;
}

export function prepareBoundedRawCache(cache) {
    let json;
    try { json = JSON.stringify(cache ?? {}); }
    catch { throw new Error('剧场缓存无法序列化，已保留上一份有效缓存。'); }
    const sourceBytes = new Blob([json], { type: 'application/json' }).size;
    if (sourceBytes > core_constants.MAX_CACHE_SOURCE_BYTES) {
        throw new Error('剧场缓存超过 12 MB UTF-8 安全上限，已保留上一份有效缓存。');
    }
    return { value: cloneCacheValue(cache), sourceChars: json.length, sourceBytes };
}

export function archiveBackupEntryForContext(context, memoryBank, options = {}) {
    const probe = archive_groups.currentCharacterArchiveProbe(context, memoryBank);
    const index = archive_groups.getArchiveIndex(context);
    const exact = index.find(item => item.chatId === probe.chatId
        && core_context.archiveEntryMatchesContextCharacter(item, context));
    const origin = options.expectedTaskOrigin;
    const previousMemory = options.previousMemory;
    const originFingerprint = core_text.normalizeText(origin?.characterKey, 500).split('\u001fcharacter:')[0];
    const originHint = Number.isInteger(Number(origin?.characterId)) ? Number(origin.characterId) : -1;
    const renameAuthorized = !exact
        && origin?.archivePresent === true
        && originHint >= 0
        && String(context?.characterId ?? '') === String(origin.characterId)
        && core_context.comparableChatId(origin?.chatId) === probe.chatId
        && core_text.normalizeText(previousMemory?.archiveRevision, 240) === core_text.normalizeText(origin?.archiveRevision, 240);
    const originRenameMatches = renameAuthorized ? index.filter(item => item.chatId === probe.chatId
        && core_context.archiveStoredAvatar(item) === core_text.normalizeText(origin?.characterAvatar, 300)
        && Number(item?.characterIndexHint) === originHint
        && (!originFingerprint || core_text.normalizeText(item?.characterFingerprint, 160) === originFingerprint)) : [];
    const liveMemory = archive_repository.getImportedMemory(context);
    const liveHint = Number.isInteger(Number(context?.characterId)) ? Number(context.characterId) : -1;
    const liveAvatar = core_text.normalizeText(context?.characters?.[liveHint]?.avatar || context?.characters?.[liveHint]?.data?.avatar, 300);
    const liveArchiveProvesContinuity = !!liveMemory
        && core_text.normalizeText(liveMemory.archiveRevision, 240) === core_text.normalizeText(memoryBank?.archiveRevision, 240)
        && core_context.comparableChatId(liveMemory.chatId) === probe.chatId;
    const continuityMatches = liveArchiveProvesContinuity ? index.filter(item => item.chatId === probe.chatId
        && Number(item?.characterIndexHint) === liveHint
        && core_context.archiveStoredAvatar(item) === liveAvatar
        && core_text.normalizeText(item?.characterName, 120) === core_text.normalizeText(liveMemory.characterName, 120)) : [];
    const renameCandidates = originRenameMatches.length ? originRenameMatches : continuityMatches;
    const renameFallback = renameCandidates.length === 1 ? renameCandidates[0] : null;
    const existing = exact || renameFallback;
    return {
        ...probe,
        // Preserve a legacy/index-assigned entry ID. Re-hashing a fingerprinted probe here could
        // create a second invisible backup that the existing library row would never find.
        entryId: existing ? core_context.archiveIndexEntryId(existing) : core_context.archiveIndexEntryId(probe),
        // This is only a capability hint. backupStore independently requires an exact
        // durable key, same chat/avatar/key and the expected previous revision before
        // allowing a display-name-only identity update.
        allowCharacterRename: !!existing && (!!renameFallback || archiveIdentityRefreshRequired(existing, probe)),
        archiveName: core_text.normalizeText(memoryBank?.archiveName, 160),
    };
}

export function rememberRuntimeSessionCache(scope, cache) {
    if (!scope || !cache || typeof cache !== 'object') return cache;
    observeCacheCommitToken(scope, cache);
    runtimeState.runtimeSessionCache.delete(scope);
    runtimeState.runtimeSessionCache.set(scope, cache);
    while (runtimeState.runtimeSessionCache.size > core_constants.RUNTIME_SESSION_CACHE_MAX) {
        const oldest = runtimeState.runtimeSessionCache.keys().next().value;
        runtimeState.runtimeSessionCache.delete(oldest);
    }
    return cache;
}

export function isCompressedCacheRecord(value) {
    return !!value && typeof value === 'object'
        && value.format === core_constants.CACHE_STORAGE_FORMAT
        && Number(value.storageVersion) === core_constants.CACHE_STORAGE_VERSION
        && typeof value.data === 'string';
}

export function cacheScopeFromContext(context = core_context.currentCharacterGuard()) {
    return core_context.chatScopeKey(context);
}

export function cacheCommitToken(value) {
    const token = Math.floor(Number(value?.commitToken) || 0);
    return Number.isSafeInteger(token) && token > 0 ? token : 0;
}

export function cacheOrderValue(value) {
    const token = cacheCommitToken(value);
    if (token) return token;
    const updatedAt = Math.max(0, Math.floor(Number(value?.updatedAt) || 0));
    return Math.min(Number.MAX_SAFE_INTEGER - 1, updatedAt * 1000);
}

function observeCacheCommitToken(scope, value) {
    if (!scope) return 0;
    const observed = cacheOrderValue(value);
    const previous = Math.max(0, Number(runtimeState.cacheCommitSequences.get(scope)) || 0);
    if (observed > previous) runtimeState.cacheCommitSequences.set(scope, observed);
    return Math.max(previous, observed);
}

export function stampCacheCommit(cache, scope) {
    if (!cache || typeof cache !== 'object' || !scope) return 0;
    const wallClockFloor = Math.min(Number.MAX_SAFE_INTEGER - 10000, Date.now() * 1000);
    const previous = Math.max(observeCacheCommitToken(scope, cache), wallClockFloor);
    const next = Math.min(Number.MAX_SAFE_INTEGER - 1, previous + 1);
    cache.commitToken = next;
    cache.updatedAt = Date.now();
    runtimeState.cacheCommitSequences.set(scope, next);
    return next;
}

export function stampStableMigratedCacheCommit(cache, previousCache, memoryBank, scope) {
    const archiveTime = Math.max(1, Math.floor(Number(memoryBank?.updatedAt) || Number(memoryBank?.createdAt) || 1));
    const token = Math.min(Number.MAX_SAFE_INTEGER - 1, Math.max(cacheOrderValue(previousCache) + 1, archiveTime * 1000));
    cache.commitToken = token;
    cache.updatedAt = archiveTime;
    observeCacheCommitToken(scope, cache);
    return token;
}

function newerCacheRecord(left, right) {
    return cacheOrderValue(left) > cacheOrderValue(right);
}

export function rememberPendingCompressedWrite(scope, record) {
    const previous = runtimeState.pendingCompressedCacheWrites.get(scope);
    if (!previous || newerCacheRecord(record, previous)) runtimeState.pendingCompressedCacheWrites.set(scope, record);
}

export async function saveMetadataDurably(context) {
    // SillyTavern's public saveMetadata may delegate to a whole-chat save. Calling it from a
    // background completion while the host is still hydrating a chat can overwrite complete
    // server history with a partial in-memory list. Heartbeat's awaited IndexedDB record is the
    // durable authority; chat metadata is only a host-owned mirror and is queued through the
    // same debounced lifecycle the host uses for its own metadata edits.
    context?.saveMetadataDebounced?.();
    return true;
}

export function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

export function base64ToBytes(value) {
    const binary = atob(String(value || ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

export async function gzipJson(value) {
    if (typeof CompressionStream !== 'function') return null;
    const json = JSON.stringify(value ?? {});
    const source = new Blob([json], { type: 'application/json' });
    const sourceBytes = source.size;
    if (sourceBytes > core_constants.MAX_CACHE_SOURCE_BYTES) throw new Error('剧场缓存的 UTF-8 数据过大，已停止压缩保存。');
    const stream = source.stream().pipeThrough(new CompressionStream('gzip'));
    const buffer = await new Response(stream).arrayBuffer();
    const data = bytesToBase64(new Uint8Array(buffer));
    if (data.length > core_constants.MAX_CACHE_COMPRESSED_BASE64_CHARS) throw new Error('压缩后的剧场缓存仍然过大，已停止保存。');
    return { data, sourceChars: json.length, sourceBytes };
}

export async function gunzipJson(base64) {
    const encoded = String(base64 || '');
    if (!encoded || encoded.length > core_constants.MAX_CACHE_COMPRESSED_BASE64_CHARS) throw new Error('剧场缓存压缩数据大小异常。');
    if (typeof DecompressionStream !== 'function') {
        throw new Error('当前浏览器不支持 DecompressionStream。旧的已生成缓存仍保留在聊天 metadata 中，请使用支持该标准的浏览器内核读取，不要尝试生成或追加来绕过读取失败。');
    }
    const bytes = base64ToBytes(encoded);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const reader = stream.getReader();
    const chunks = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > core_constants.MAX_CACHE_DECOMPRESSED_BYTES) {
                await reader.cancel();
                throw new Error('剧场缓存解压后体积异常，已停止读取。');
            }
            chunks.push(value);
        }
    } finally {
        try { reader.releaseLock(); } catch {}
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
    const parsed = JSON.parse(new TextDecoder().decode(merged));
    return parsed && typeof parsed === 'object' ? parsed : {};
}

export function compressedCacheManifest(cache, packed) {
    const modes = Object.values(core_constants.MODE).filter(mode => cache?.[mode]?.kind === mode);
    return {
        format: core_constants.CACHE_STORAGE_FORMAT,
        storageVersion: core_constants.CACHE_STORAGE_VERSION,
        chatId: core_text.normalizeText(cache?.chatId, 240),
        archiveRevision: core_text.normalizeText(cache?.archiveRevision, 240),
        commitToken: cacheCommitToken(cache),
        updatedAt: Number(cache?.updatedAt) || Date.now(),
        modes,
        hasPhoneDraft: cache?.[core_constants.PHONE_DRAFT_CACHE_KEY]?.kind === 'phone-draft',
        sourceChars: Number(packed?.sourceChars) || 0,
        sourceBytes: Number(packed?.sourceBytes) || 0,
        data: packed?.data || '',
    };
}

export function cacheManifestModes(context = core_context.getContext()) {
    const stored = context.chatMetadata?.[core_constants.CACHE_KEY];
    return isCompressedCacheRecord(stored) && Array.isArray(stored.modes) ? stored.modes : [];
}

export async function serializeCacheScopeOperation(expectedScope, callback) {
    const previous = runtimeState.cachePersistChains.get(expectedScope) || Promise.resolve();
    const operation = previous.catch(() => {}).then(callback);
    runtimeState.cachePersistChains.set(expectedScope, operation);
    try { return await operation; }
    finally {
        if (runtimeState.cachePersistChains.get(expectedScope) === operation) runtimeState.cachePersistChains.delete(expectedScope);
    }
}

export function archiveCommitScope(entry, memory = null) {
    const entryId = core_text.normalizeText(entry?.entryId, 120) || core_context.archiveIndexEntryId(entry || {});
    const chatId = core_context.comparableChatId(memory?.chatId || entry?.chatId);
    return entryId && chatId ? `${entryId}|${chatId}` : '';
}

export async function serializeArchiveCommitOperation(entry, memory, callback) {
    const scope = archiveCommitScope(entry, memory);
    if (!scope) throw new Error('档案提交身份不完整，本次结果没有写入。');
    const previous = runtimeState.archiveCommitChains.get(scope) || Promise.resolve();
    const operation = previous.catch(() => {}).then(callback);
    runtimeState.archiveCommitChains.set(scope, operation);
    try { return await operation; }
    finally {
        if (runtimeState.archiveCommitChains.get(scope) === operation) runtimeState.archiveCommitChains.delete(scope);
    }
}

export async function ensureCacheHydrated(context = core_context.currentCharacterGuard()) {
    const scope = cacheScopeFromContext(context);
    if (runtimeState.runtimeSessionCache.has(scope)) return runtimeState.runtimeSessionCache.get(scope);
    if (runtimeState.cacheHydrationPromises.has(scope)) return runtimeState.cacheHydrationPromises.get(scope);
    const stored = context.chatMetadata?.[core_constants.CACHE_KEY];
    if (!stored || typeof stored !== 'object') {
        runtimeState.cacheHydrationErrors.delete(scope);
        const empty = {};
        rememberRuntimeSessionCache(scope, empty);
        return empty;
    }
    if (!isCompressedCacheRecord(stored)) {
        // Legacy uncompressed caches stay readable as-is. Never auto-migrate them merely
        // because a chat was opened: JSON.stringify + gzip of a large theater cache can
        // spike CPU/RAM during SillyTavern startup, especially on mobile. A future explicit
        // maintenance action may migrate them, but ordinary chat navigation must stay idle.
        runtimeState.cacheHydrationErrors.delete(scope);
        const detached = cloneCacheValue(stored);
        rememberRuntimeSessionCache(scope, detached);
        return detached;
    }
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    let promise;
    const operation = (async () => {
        try {
            const cache = await gunzipJson(stored.data);
            if (lifecycleEpoch !== runtimeState.runtimeLifecycleEpoch) throw new DOMException('Runtime destroyed', 'AbortError');
            if (!cache || typeof cache !== 'object') {
                const empty = {};
                rememberRuntimeSessionCache(scope, empty);
                return empty;
            }
            if (core_text.normalizeText(cache.chatId, 240) && core_text.normalizeText(cache.chatId, 240) !== core_context.getChatId(context)) {
                const empty = {};
                rememberRuntimeSessionCache(scope, empty);
                return empty;
            }
            runtimeState.cacheHydrationErrors.delete(scope);
            rememberRuntimeSessionCache(scope, cache);
            return cache;
        } catch (error) {
            if (lifecycleEpoch !== runtimeState.runtimeLifecycleEpoch) throw error;
            // A damaged/imported compressed cache must not create an endless hydrate →
            // chooser refresh loop. Keep the canonical archive readable and treat only the
            // derived theater cache as unavailable for this runtime session.
            runtimeState.cacheHydrationErrors.set(scope, core_text.safeErrorSummary(error, 400));
            throw error;
        }
    })();
    promise = operation.finally(() => {
        if (runtimeState.cacheHydrationPromises.get(scope) === promise) runtimeState.cacheHydrationPromises.delete(scope);
    });
    runtimeState.cacheHydrationPromises.set(scope, promise);
    return promise;
}

export function getCache(context) {
    // ArchiveTarget contexts are frozen, detached snapshots. They must never borrow the
    // currently open chat's runtime cache merely because a host-derived scope happens to
    // collide. Their own snapshot is the only admissible starting point.
    if (context?.__rmtArchiveTargetEntryId) {
        const targetStored = context.chatMetadata?.[core_constants.CACHE_KEY];
        if (isCompressedCacheRecord(targetStored)) return {};
        return targetStored && typeof targetStored === 'object' ? targetStored : {};
    }
    const scope = cacheScopeFromContext(context);
    if (runtimeState.runtimeSessionCache.has(scope)) return runtimeState.runtimeSessionCache.get(scope);
    const stored = context.chatMetadata?.[core_constants.CACHE_KEY];
    if (isCompressedCacheRecord(stored)) return {};
    if (stored && typeof stored === 'object') {
        // Detach legacy raw metadata before any runtime writer can mutate the last durable copy.
        const detached = cloneCacheValue(stored);
        rememberRuntimeSessionCache(scope, detached);
        return detached;
    }
    return {};
}

// As with loadSession, callers hydrate a compressed archive before opening its
// editor. Commits always reread the canonical IndexedDB record before comparing.
export function readParticipantRoster(context = core_context.getContext()) {
    const memory = archive_repository.getImportedMemory(context);
    if (!memory) return participantDraft(context);
    const cache = getCache(context);
    const matches = (!cache.chatId || core_context.comparableChatId(cache.chatId) === core_context.comparableChatId(memory.chatId))
        && (!cache.archiveRevision || cache.archiveRevision === memory.archiveRevision);
    return (matches && participantRoster(cache[participant_contract.PARTICIPANTS_KEY]))
        || participantRoster(memory[participant_contract.PARTICIPANTS_KEY]);
}

export const ARCHIVE_VERSIONS_CACHE_KEY = '__archiveVersionsV1';

export const PARTICIPANT_REPLACEMENT_KEY = '__participantReplacementV1';

export const VERSION_PAGE_MODES = Object.freeze({ archiveProfile: '', room: 'room', roomLife: 'room', items: 'items',
    phone: 'phone', inbox: 'inbox', themeSong: 'themeSong', album: 'album', adv: 'adv', cabinet: 'cabinet',
    travel: 'travel', ending: 'ending', calendar: 'calendar', relations: 'relations', achievements: 'achievements',
    butterfly: 'butterfly', pastLives: 'pastLives', timeEcho: 'timeEcho', language: 'heart', seasons: 'heart',
    spring: 'heart', summer: 'heart', autumn: 'heart', winter: 'heart', strips: 'heart', fireflies: 'heart', postending: 'heart' });

export function archiveVersions(cache) {
    const raw = cache?.[ARCHIVE_VERSIONS_CACHE_KEY];
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.some(item => !item || item.version !== 1 || typeof item.versionId !== 'string'
        || !item.versionId || !item.memory || !item.cache || !Array.isArray(item.selectedPages))) {
        throw core_text.safeUserError('旧版本记录不可读取，现有内容没有被覆盖。', 'RMT_ARCHIVE_VERSION_INVALID');
    }
    return raw;
}

export function retainCanonicalArchiveVersions(target, canonical) {
    if (canonical?.[ARCHIVE_VERSIONS_CACHE_KEY] !== undefined) {
        target[ARCHIVE_VERSIONS_CACHE_KEY] = cloneCacheValue(archiveVersions(canonical));
    } else delete target[ARCHIVE_VERSIONS_CACHE_KEY];
}

export function archiveVersionSummary(record) {
    return { versionId: record.versionId, createdAt: record.createdAt, reason: record.reason,
        archiveRevision: record.archiveRevision, archiveName: record.memory.archiveName || '',
        selectedPages: [...record.selectedPages], draftModes: Object.keys(record.drafts?.modules || {}),
        hasPhoneDraft: !!record.drafts?.phone, roster: cloneCacheValue(record.roster) };
}

export function recoveryPageForVersion(mode, operation) {
    if (operation?.participantRegeneration?.pageId) return operation.participantRegeneration.pageId;
    if (mode === 'room') return operation?.kind === 'room-daily-life' ? 'roomLife' : 'room';
    if (mode !== 'heart') return mode;
    if (operation?.kind === 'heart-season') return operation.season;
    if (operation?.kind === 'heart-fireflies') return 'fireflies';
    if (operation?.kind === 'heart-section') return operation.part === 'dialogues' ? 'language' : operation.part;
    if (operation?.kind === 'mode') return 'language';
    return '';
}

export async function prepareCacheBackupValue(cache) {
    if (!cache || typeof cache !== 'object') return null;
    if (isCompressedCacheRecord(cache)) {
        if (!cache.data || cache.data.length > core_constants.MAX_CACHE_COMPRESSED_BASE64_CHARS) throw new Error('压缩派生缓存大小异常，独立备份没有覆盖。');
        if (Number(cache.sourceBytes) > core_constants.MAX_CACHE_SOURCE_BYTES) throw new Error('压缩派生缓存来源超过 12 MB，独立备份没有覆盖。');
        const hydrated = await gunzipJson(cache.data);
        prepareBoundedRawCache(hydrated);
        return cloneCacheValue(cache);
    }
    const prepared = prepareBoundedRawCache(cache);
    if (typeof CompressionStream !== 'function') return prepared.value;
    const packed = await gzipJson(prepared.value);
    return compressedCacheManifest(prepared.value, packed);
}

function rawCacheSourceBytes(cache) {
    let json;
    try { json = JSON.stringify(cache ?? {}); }
    catch { return -1; } // prepareBoundedRawCache owns the serialization failure.
    return new Blob([json], { type: 'application/json' }).size;
}

// Terminal draft records keep only their status stub by design (see
// finishGenerationDraftInCache); a legacy terminal record still carrying its full
// journal duplicates content that was already committed or explicitly discarded.
// Aligning those stubs is the one derived payload the retention rules already treat
// as removable. Open drafts, saved task results, sessions, versions and rosters are
// never evicted here.
function evictTerminalDraftJournalPayloads(cache) {
    const pool = cache?.[GENERATION_DRAFTS_CACHE_KEY];
    if (pool?.version !== 1 || !pool.records || typeof pool.records !== 'object' || Array.isArray(pool.records)) return false;
    let changed = false;
    for (const [draftId, record] of Object.entries(pool.records)) {
        if (!record || (record.status !== 'complete' && record.status !== 'discarded') || !record.journal) continue;
        const stub = { status: record.status,
            mode: core_text.normalizeText(record.mode || record.journal?.identity?.mode, 80),
            pageId: core_text.normalizeText(record.pageId || record.journal?.pageId, 160),
            closedAt: Math.max(0, Number(record.closedAt) || Number(record.journal?.updatedAt) || Date.now()) };
        if (record.result) stub.result = cloneCacheValue(record.result);
        pool.records[draftId] = stub;
        changed = true;
    }
    return changed;
}

// Commits must fail with an actionable capacity code, not a bare size sentinel.
// Before failing, evict the disposable terminal-draft journal payloads the
// retention rules already treat as redundant, then re-measure once.
export async function prepareCommittedCacheBackupValue(cache) {
    const sourceBytes = rawCacheSourceBytes(cache);
    if (sourceBytes < 0 || sourceBytes <= core_constants.MAX_CACHE_SOURCE_BYTES) return prepareCacheBackupValue(cache);
    if (evictTerminalDraftJournalPayloads(cache) && rawCacheSourceBytes(cache) <= core_constants.MAX_CACHE_SOURCE_BYTES) {
        return prepareCacheBackupValue(cache);
    }
    throw core_text.safeUserError('派生缓存超过 12 MB UTF-8 安全上限；已保留上一份有效缓存，没有截取内容冒充完成。', 'RMT_ARCHIVE_RESULT_CAPACITY');
}

function archiveCommitStateMatches(context, expectedState) {
    if (!context?.chatMetadata || typeof context.chatMetadata !== 'object') return false;
    const hasMemory = Object.prototype.hasOwnProperty.call(context.chatMetadata, core_constants.MEMORY_KEY);
    if (expectedState?.present === false) return !hasMemory;
    if (expectedState?.present !== true || !hasMemory) return false;
    return core_text.normalizeText(context.chatMetadata[core_constants.MEMORY_KEY]?.archiveRevision, 240)
        === core_text.normalizeText(expectedState.revision, 240);
}

export function assertArchiveCommitState(context, expectedState) {
    if (!expectedState || typeof expectedState.present !== 'boolean') {
        throw core_text.safeUserError('档案保存缺少旧版本校验，本次没有写入。', 'RMT_CACHE_CAS_CONFLICT');
    }
    if (!archiveCommitStateMatches(context, expectedState)) {
        throw core_text.safeUserError('原档案状态与本次任务不一致，已保留现有档案，生成结果没有覆盖它。', 'RMT_CACHE_CAS_CONFLICT');
    }
}

export function assertExpectedTaskOrigin(context, origin) {
    if (!origin) return;
    core_requestCoordinator.assertLogicalGenerationTaskCurrent?.(origin);
    if (!core_context.deferredCommitOriginMatchesContext(origin, context)) {
        throw core_text.safeUserError('后台档案对应的角色已经切换，本次结果没有写入其他角色；请回到原角色后重试保存。', 'RMT_RECOVERY_ORIGIN_CHANGED');
    }
}

export function assertPresentationOnlyMemoryPatch(previous, next) {
    const withoutCover = value => Object.fromEntries(Object.entries(value || {}).filter(([key]) => !['archiveName', 'archiveVerdict', 'archiveCoverUpdatedAt'].includes(key)));
    if (!previous || !next || JSON.stringify(withoutCover(previous)) !== JSON.stringify(withoutCover(next))) {
        throw core_text.safeUserError('重写封面不能改变档案事实或历史基线。', 'RMT_ARCHIVE_VERDICT');
    }
}

export async function hydrateBackupCacheValue(value, expectedChatId, expectedRevision) {
    if (!value || typeof value !== 'object') return null;
    const cache = isCompressedCacheRecord(value) ? await gunzipJson(value.data) : cloneCacheValue(value);
    if (!cache || typeof cache !== 'object') return null;
    const cacheChatId = core_context.comparableChatId(cache.chatId);
    const cacheRevision = core_text.normalizeText(cache.archiveRevision, 240);
    if (cacheChatId && cacheChatId !== core_context.comparableChatId(expectedChatId)) return null;
    if (cacheRevision && cacheRevision !== expectedRevision) return null;
    cache.chatId = expectedChatId;
    cache.archiveRevision = expectedRevision;
    return cache;
}

// A runtime/metadata mirror may substitute for an unreadable canonical derived cache
// only when it is a readable, non-empty snapshot of this same chat and revision. An
// empty or compressed mirror proves nothing and must not seed a commit.
export function mirrorCacheUsableAsStarting(supplied, chatId, revision) {
    if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied) || isCompressedCacheRecord(supplied)) return false;
    if (!Object.keys(supplied).length) return false;
    const mirrorChatId = core_context.comparableChatId(supplied.chatId);
    const mirrorRevision = core_text.normalizeText(supplied.archiveRevision, 240);
    if (mirrorChatId && mirrorChatId !== chatId) return false;
    if (mirrorRevision && mirrorRevision !== revision) return false;
    return true;
}
