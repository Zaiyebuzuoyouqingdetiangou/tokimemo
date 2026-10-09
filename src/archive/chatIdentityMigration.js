// Explicit chat identity migration and repair of previously acknowledged claims.
// Image URLs and generated bodies are opaque data: only known ownership fields move.
import * as constants from '../core/constants.js';
import * as contextApi from '../core/context.js';
import * as records from '../core/cacheRecords.js';
import * as core from './archiveCore.js';
import * as backup from './backupStore.js';
import * as groups from './groups.js';
import * as core_state from '../core/state.js';

export const CHAT_IDENTITY_SNAPSHOTS_KEY = '__chatIdentitySnapshotsV1';
const pendingRepairs = new Map();
const id = value => contextApi.comparableChatId(value);
const clone = value => value == null ? value : structuredClone(value);
function conflict() { const error = new Error('聊天或档案在读取期间已变化，原内容保持不变，请重新打开后再试。'); error.code = 'RMT_RECOVERY_ORIGIN_CHANGED'; return error; }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

export function captureArchiveIdentityChange(context) {
    return { scope: records.cacheScopeFromContext(context), runtimeKey: contextApi.currentCharacterRuntimeKey(context),
        epoch: core_state.state.runtimeLifecycleEpoch, metadata: context.chatMetadata,
        memory: clone(context.chatMetadata?.[constants.MEMORY_KEY]), stored: clone(context.chatMetadata?.[constants.CACHE_KEY]) };
}
export function archiveIdentityChangeCurrent(captured) {
    try {
        const live = contextApi.currentCharacterGuard();
        return core_state.state.runtimeLifecycleEpoch === captured.epoch && records.cacheScopeFromContext(live) === captured.scope
            && contextApi.currentCharacterRuntimeKey(live) === captured.runtimeKey && live.chatMetadata === captured.metadata
            && same(live.chatMetadata?.[constants.MEMORY_KEY], captured.memory)
            && same(live.chatMetadata?.[constants.CACHE_KEY], captured.stored);
    } catch { return false; }
}
export async function readIdentityMigrationCache(stored) {
    if (!stored || typeof stored !== 'object') return {};
    return records.isCompressedCacheRecord(stored) ? await records.gunzipJson(stored.data) : clone(stored);
}

function sourceProof(memory) {
    const target = id(memory?.chatId);
    const claimed = id(memory?.claimedFromChatId);
    if (claimed && claimed !== target) return { chatId: claimed, revision: String(memory.archiveRevision || ''), kind: 'claim' };
    const inherited = memory?.inheritanceV1;
    const source = inherited?.version === 1 && id(inherited.sourceChatId);
    if (source && source !== target && inherited.sourceArchiveRevision) {
        return { chatId: source, revision: String(inherited.sourceArchiveRevision), kind: 'inheritance' };
    }
    return null;
}
function cacheNeedsIdentityRepair(cache, memory, proof) {
    if (!cache || !proof) return false;
    const revisions = [String(proof.revision), String(memory.archiveRevision || '')];
    return (id(cache.chatId) === proof.chatId && revisions.includes(String(cache.archiveRevision || '')))
        || Object.values(constants.MODE).some(mode => cache[mode]?.kind === mode
            && id(cache[mode].chatId) === proof.chatId && revisions.includes(String(cache[mode].archiveRevision || '')));
}
export function needsArchiveChatIdentityRepair(context = contextApi.getContext()) {
    if (context?.__rmtArchiveTargetEntryId) return false;
    const memory = core.getImportedMemory(context);
    if (!memory || !sourceProof(memory)) return false;
    const stored = context.chatMetadata?.[constants.CACHE_KEY];
    // Compressed payloads are inspected once on explicit opening, never rewritten just
    // because a provenance marker exists. Successful repairs retain their marker.
    if (records.isCompressedCacheRecord(stored)) return stored.chatIdentityMigrationVersion !== 1;
    const proof = sourceProof(memory);
    return cacheNeedsIdentityRepair(stored, memory, proof);
}

export function preserveChatIdentitySnapshot(cache, sourceMemory, sourceCache, targetMemory) {
    const key = [id(sourceMemory?.chatId), sourceMemory?.archiveRevision, id(targetMemory?.chatId), targetMemory?.archiveRevision].join('\u001f');
    const snapshots = Array.isArray(cache[CHAT_IDENTITY_SNAPSHOTS_KEY]) ? clone(cache[CHAT_IDENTITY_SNAPSHOTS_KEY]) : [];
    if (!snapshots.some(row => row?.id === key)) {
        const original = clone(sourceCache || {});
        delete original[CHAT_IDENTITY_SNAPSHOTS_KEY];
        snapshots.push({ version: 1, id: key, createdAt: Date.now(), memory: clone(sourceMemory), cache: original });
    }
    cache[CHAT_IDENTITY_SNAPSHOTS_KEY] = snapshots;
    return cache;
}

export function rebindCompletedArchiveCache(sourceCache, sourceMemory, targetMemory) {
    const cache = clone(sourceCache || {}), oldId = id(sourceMemory?.chatId), newId = id(targetMemory?.chatId);
    const oldRevision = String(sourceMemory?.archiveRevision || ''), newRevision = String(targetMemory?.archiveRevision || '');
    if (!oldId || !newId || !oldRevision || !newRevision) throw conflict();
    if (cache.chatId && ![oldId, newId].includes(id(cache.chatId))) throw conflict();
    if (cache.archiveRevision && ![oldRevision, newRevision].includes(String(cache.archiveRevision))) throw conflict();
    const moved = oldId !== newId;
    if (moved) preserveChatIdentitySnapshot(cache, sourceMemory, sourceCache, targetMemory);
    for (const mode of Object.values(constants.MODE)) {
        const session = cache[mode];
        if (!session || session.kind !== mode || id(session.chatId) !== oldId
            || ![oldRevision, newRevision].includes(String(session.archiveRevision || ''))) continue;
        // Incomplete reads and resumable jobs are preserved in the original snapshot,
        // not promoted to completed content in a different chat.
        if (moved && session.readableProgress?.complete === false) { delete cache[mode]; continue; }
        session.chatId = newId;
        session.archiveRevision = newRevision;
    }
    if (moved) {
        if (id(sourceCache?.chatId) === oldId) {
            for (const key of ['__generationRecoveryV1', '__generationRecoveryClearedV1',
                records.GENERATION_DRAFTS_CACHE_KEY, constants.PHONE_DRAFT_CACHE_KEY]) delete cache[key];
        } else {
            // A repaired inherited cache may also contain valid new-chat jobs.
            // Park only positively identified source-chat tasks in the snapshot.
            for (const [mode, journal] of Object.entries(cache.__generationRecoveryV1 || {})) {
                if (id(journal?.identity?.chatId) === oldId) delete cache.__generationRecoveryV1[mode];
            }
            for (const [key, record] of Object.entries(cache[records.GENERATION_DRAFTS_CACHE_KEY]?.records || {})) {
                if (id(record?.journal?.identity?.chatId || record?.result?.sourceMemory?.chatId) === oldId) {
                    delete cache[records.GENERATION_DRAFTS_CACHE_KEY].records[key];
                }
            }
            if (cache[records.GENERATION_DRAFTS_CACHE_KEY] && !Object.keys(cache[records.GENERATION_DRAFTS_CACHE_KEY].records || {}).length) delete cache[records.GENERATION_DRAFTS_CACHE_KEY];
            if (cache.__generationRecoveryV1 && !Object.keys(cache.__generationRecoveryV1).length) delete cache.__generationRecoveryV1;
            if (id(cache[constants.PHONE_DRAFT_CACHE_KEY]?.chatId) === oldId) delete cache[constants.PHONE_DRAFT_CACHE_KEY];
        }
    }
    cache.chatId = newId; cache.archiveRevision = newRevision;
    return cache;
}

// One canonical CAS contains both the preserved original and the fully prepared
// target. Metadata is published only after that acknowledged write succeeds.
export async function commitArchiveIdentityChange(context, prepared, captured = captureArchiveIdentityChange(context)) {
    if (!archiveIdentityChangeCurrent(captured)) throw conflict();
    let memory = clone(prepared.memory), cache = clone(prepared.cache || {});
    if (captured.memory) preserveChatIdentitySnapshot(cache, captured.memory, captured.stored, memory);
    const entry = records.archiveBackupEntryForContext(context, memory);
    return records.serializeArchiveCommitOperation(entry, memory, () => records.serializeCacheScopeOperation(captured.scope, async () => {
        if (!archiveIdentityChangeCurrent(captured)) throw conflict();
        const previous = await backup.readArchiveBackupState(entry);
        if (!archiveIdentityChangeCurrent(captured)) throw conflict();
        if (previous.deleted) { const error = new Error('档案已被删除，旧内容未重新写入。'); error.code = 'RMT_ARCHIVE_DELETED_FENCE'; throw error; }
        const priorProof = sourceProof(previous.record?.memory), expectedProof = sourceProof(memory);
        const sameLineage = priorProof && expectedProof && priorProof.chatId === expectedProof.chatId
            && priorProof.revision === expectedProof.revision && priorProof.kind === expectedProof.kind
            && id(previous.record.memory.chatId) === id(memory.chatId)
            && (priorProof.kind !== 'inheritance'
                || previous.record.memory.inheritanceV1.sourceEntryId === memory.inheritanceV1.sourceEntryId);
        const canonicalRevisionMoved = previous.record && previous.record.archiveRevision !== captured.memory?.archiveRevision;
        if (canonicalRevisionMoved && !sameLineage) throw conflict();
        // A retry after an acknowledged canonical write may still have the old
        // metadata mirror. Reuse that complete same-provenance result, never replace
        // newer artwork with the stale mirror being repaired.
        if (previous.record?.cache && (canonicalRevisionMoved
            || (records.cacheOrderValue(previous.record.cache) > records.cacheOrderValue(captured.stored)
                && !same(previous.record.cache, captured.stored)))) {
            if (!sameLineage) throw conflict();
            memory = clone(previous.record.memory);
            const canonical = await readIdentityMigrationCache(previous.record.cache);
            if (!archiveIdentityChangeCurrent(captured)) throw conflict();
            cache = rebindCompletedArchiveCache(canonical,
                { ...clone(memory), chatId: priorProof.chatId, archiveRevision: priorProof.revision }, memory);
            if (captured.memory) preserveChatIdentitySnapshot(cache, captured.memory, captured.stored, memory);
        }
        cache.chatIdentityMigrationVersion = 1;
        records.stampCacheCommit(cache, captured.scope);
        const stored = await records.prepareCacheBackupValue(cache);
        if (!archiveIdentityChangeCurrent(captured)) throw conflict();
        await backup.replaceArchiveBackup(entry, memory, stored, previous.record
            ? { present: true, revision: previous.record.archiveRevision } : { present: false }, {
            expectedCacheOrder: records.cacheOrderValue(previous.record?.cache),
            stillCurrent: () => archiveIdentityChangeCurrent(captured),
        });
        if (!archiveIdentityChangeCurrent(captured)) throw conflict();
        const live = contextApi.currentCharacterGuard();
        const oldRuntime = core_state.state.runtimeSessionCache.get(captured.scope);
        const hadRuntime = core_state.state.runtimeSessionCache.has(captured.scope);
        live.chatMetadata[constants.MEMORY_KEY] = memory;
        live.chatMetadata[constants.CACHE_KEY] = stored;
        records.rememberRuntimeSessionCache(captured.scope, cache);
        core_state.state.pendingCompressedCacheWrites.delete(captured.scope);
        const timer = core_state.state.cachePersistTimers.get(captured.scope);
        if (timer) clearTimeout(timer);
        core_state.state.cachePersistTimers.delete(captured.scope);
        try { await Promise.resolve(live.saveMetadataDebounced?.()); }
        catch (error) {
            // The canonical result contains the old snapshot too; restore only the
            // still-owned mirror, never a newly selected chat or a concurrent edit.
            if (live.chatMetadata === captured.metadata && live.chatMetadata[constants.MEMORY_KEY] === memory
                && live.chatMetadata[constants.CACHE_KEY] === stored) {
                live.chatMetadata[constants.MEMORY_KEY] = clone(captured.memory);
                if (captured.stored === undefined) delete live.chatMetadata[constants.CACHE_KEY];
                else live.chatMetadata[constants.CACHE_KEY] = clone(captured.stored);
                if (hadRuntime) records.rememberRuntimeSessionCache(captured.scope, oldRuntime);
                else core_state.state.runtimeSessionCache.delete(captured.scope);
            }
            throw error;
        }
        if (records.cacheScopeFromContext(contextApi.currentCharacterGuard()) === captured.scope) {
            groups.upsertArchiveIndex(live, memory, { existingEntryId: entry.entryId });
        }
        return { memory, cache };
    }));
}

async function rebindVerifiedChatBaseline(context, sourceMemory, targetMemory, captured) {
    const count = Math.max(0, Math.floor(Number(sourceMemory?.sourceMessageCount) || 0));
    const fingerprint = String(sourceMemory?.sourceFingerprint || '');
    const oldHash = fingerprint.split(':')[0];
    if (!count || !/^\d+$/.test(oldHash)) return;
    for (const hiddenMode of [undefined, 'exclude', 'include']) {
        const options = { completeSource: true, prefixCount: count,
            expectedChatId: sourceMemory.chatId, stillCurrent: () => archiveIdentityChangeCurrent(captured),
            ...(hiddenMode ? { hiddenMode } : {}) };
        const before = await contextApi.buildChatSnapshot(context, options);
        if (before.totalMessages < count || before.prefixFingerprint !== oldHash
            || (sourceMemory.fullSourceFingerprint && sourceMemory.fullSourceFingerprint !== before.fullPrefixFingerprint)) continue;
        const after = await contextApi.buildChatSnapshot(context, { ...options, expectedChatId: targetMemory.chatId });
        if (!archiveIdentityChangeCurrent(captured)) throw conflict();
        // Do not mark later messages as archived: only the proven prefix is rebound.
        targetMemory.sourceFingerprint = after.prefixFingerprint + (fingerprint.includes(':') ? fingerprint.slice(fingerprint.indexOf(':')) : '');
        if (sourceMemory.fullSourceFingerprint) targetMemory.fullSourceFingerprint = after.fullPrefixFingerprint;
        return;
    }
}

export async function claimArchiveChatIdentity(context = contextApi.currentCharacterGuard()) {
    const captured = captureArchiveIdentityChange(context);
    let sourceMemory = core.migrateArchiveInMemory(clone(captured.memory));
    const targetId = id(contextApi.getChatId(context));
    if (!sourceMemory || !sourceMemory.memories.length || !id(sourceMemory.chatId) || id(sourceMemory.chatId) === targetId) return null;
    if (core_state.state.archiveDeletionFences.has(core.archiveDeletionFenceKey(context, sourceMemory))) throw conflict();
    let sourceCache = await readIdentityMigrationCache(captured.stored);
    if (!archiveIdentityChangeCurrent(captured)) throw conflict();
    const sourceEntry = records.archiveBackupEntryForContext(context, sourceMemory);
    const sourceState = await backup.readArchiveBackupState(sourceEntry);
    if (!archiveIdentityChangeCurrent(captured)) throw conflict();
    if (sourceState.deleted) { const error = new Error('来源档案已被删除，原内容没有重新写入。'); error.code = 'RMT_ARCHIVE_DELETED_FENCE'; throw error; }
    if (sourceState.record && sourceState.record.archiveRevision !== sourceMemory.archiveRevision) throw conflict();
    if (sourceState.record?.cache && records.cacheOrderValue(sourceState.record.cache) > records.cacheOrderValue(captured.stored)) {
        sourceMemory = clone(sourceState.record.memory);
        sourceCache = await readIdentityMigrationCache(sourceState.record.cache);
        if (!archiveIdentityChangeCurrent(captured)) throw conflict();
    }
    // An old incomplete claim may itself have been renamed again. Resolve each
    // recorded historical owner before applying the newly confirmed identity.
    const proof = sourceProof(sourceMemory);
    if (proof && (id(sourceCache.chatId) === proof.chatId || Object.values(constants.MODE).some(mode =>
        sourceCache[mode]?.kind === mode && id(sourceCache[mode].chatId) === proof.chatId))) {
        sourceCache = rebindCompletedArchiveCache(sourceCache,
            { ...clone(sourceMemory), chatId: proof.chatId, archiveRevision: proof.revision }, sourceMemory);
    }
    const memory = { ...clone(sourceMemory), chatId: contextApi.getChatId(context), claimedFromChatId: sourceMemory.chatId, updatedAt: Date.now() };
    await rebindVerifiedChatBaseline(context, sourceMemory, memory, captured);
    const cache = rebindCompletedArchiveCache(sourceCache, sourceMemory, memory);
    const committed = await commitArchiveIdentityChange(context, { memory, cache }, captured);
    return { memoryCount: committed.memory.memories.length, previousChatId: sourceMemory.chatId };
}

export async function repairArchiveChatIdentity(context = contextApi.currentCharacterGuard()) {
    if (!needsArchiveChatIdentityRepair(context)) return false;
    const scope = records.cacheScopeFromContext(context);
    if (pendingRepairs.has(scope)) return pendingRepairs.get(scope);
    const operation = (async () => {
        const captured = captureArchiveIdentityChange(context), memory = core.migrateArchiveInMemory(captured.memory);
        const proof = sourceProof(memory);
        if (!proof) return false;
        const source = await readIdentityMigrationCache(captured.stored);
        if (!archiveIdentityChangeCurrent(captured)) throw conflict();
        const needs = cacheNeedsIdentityRepair(source, memory, proof);
        if (!needs) return false;
        const sourceMemory = { ...clone(memory), chatId: proof.chatId, archiveRevision: proof.revision };
        await rebindVerifiedChatBaseline(context, sourceMemory, memory, captured);
        const cache = rebindCompletedArchiveCache(source, sourceMemory, memory);
        await commitArchiveIdentityChange(context, { memory, cache }, captured);
        return true;
    })();
    pendingRepairs.set(scope, operation);
    try { return await operation; } finally { if (pendingRepairs.get(scope) === operation) pendingRepairs.delete(scope); }
}
