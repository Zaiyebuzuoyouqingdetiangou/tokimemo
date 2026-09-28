import * as backup from './backupStore.js';
import * as storage from './relayStore.js';
import * as preparation from './relayPreparation.js';
import * as inheritance from './inheritance.js';
import * as groups from './groups.js';
import * as repository from './repository.js';
import * as cacheApi from '../core/cache.js';
import * as cacheRecords from '../core/cacheRecords.js';
import * as contextApi from '../core/context.js';
import * as constants from '../core/constants.js';
import * as policy from '../core/archiveRelayPolicy.js';
import { state } from '../core/state.js';

const copy = value => value == null ? value : structuredClone(value);

function targetMirror(context) {
    const metadata = context.chatMetadata || {};
    return { hasMemory: Object.hasOwn(metadata, constants.MEMORY_KEY), memory: copy(metadata[constants.MEMORY_KEY]),
        hasCache: Object.hasOwn(metadata, constants.CACHE_KEY), cache: copy(metadata[constants.CACHE_KEY]) };
}

function binding(context) {
    return { scope: contextApi.chatScopeKey(context), runtimeKey: contextApi.currentCharacterRuntimeKey(context),
        epoch: state.runtimeLifecycleEpoch, metadata: context.chatMetadata, before: targetMirror(context) };
}

function stillCurrent(bound) {
    try {
        const live = contextApi.currentCharacterGuard();
        return state.runtimeLifecycleEpoch === bound.epoch && contextApi.chatScopeKey(live) === bound.scope
            && contextApi.currentCharacterRuntimeKey(live) === bound.runtimeKey && live.chatMetadata === bound.metadata
            && JSON.stringify(targetMirror(live)) === JSON.stringify(bound.before);
    } catch { return false; }
}

function assertCurrent(bound) {
    if (!stillCurrent(bound)) throw policy.relayError('预览后聊天、角色或目标档案发生变化，请重新预览；没有覆盖当前内容。');
}

export async function relayCandidates(context = contextApi.getContext()) {
    const ownFence = await storage.readArchiveRelayState(policy.relayContextEntry(context));
    const candidates = [...inheritance.inheritanceCandidates(context), ...(ownFence?.members || [])];
    const rows = new Map();
    for (const entry of candidates) {
        const fence = await storage.readArchiveRelayState(entry);
        const holder = policy.relayHolder(fence) || entry;
        if (inheritance.archiveEntryMatchesInheritanceTarget(holder, context)
            && contextApi.comparableChatId(holder.chatId) !== contextApi.comparableChatId(contextApi.getChatId(context))) {
            rows.set(contextApi.archiveIndexEntryId(holder), holder);
        }
    }
    return [...rows.values()];
}

export async function previewArchiveRelay(entryId, { context = contextApi.currentCharacterGuard(), loadSnapshot } = {}) {
    if (typeof loadSnapshot !== 'function') throw new TypeError('Missing archive reader');
    await cacheApi.ensureCurrentArchiveBackup(context);
    const live = contextApi.currentCharacterGuard();
    if (contextApi.chatScopeKey(live) !== contextApi.chatScopeKey(context)) throw policy.relayError('当前聊天已切换，请重新选择。');
    const bound = binding(live);
    let sourceEntry = (await relayCandidates(live)).find(row => contextApi.archiveIndexEntryId(row) === entryId);
    assertCurrent(bound);
    if (!sourceEntry) throw policy.relayError('所选档案不属于当前角色，或已从档案室移除。');
    let source = await backup.readArchiveBackupState(sourceEntry);
    // A completed local relay is authoritative even when the host's optional
    // debounced mirror was interrupted. Do not require that mirror to hand back.
    if (source.relay && source.record && !source.deleted) {
        policy.assertRelayWrite(sourceEntry, source.relay, source.record.memory);
    } else {
        const snapshot = await loadSnapshot(sourceEntry, live, { force: true, lifecycleEpoch: bound.epoch });
        assertCurrent(bound);
        if (snapshot.backupOnly || !inheritance.archiveEntryMatchesInheritanceTarget(snapshot, live)) {
            throw policy.relayError('来源聊天暂时无法核实，保留只读备份；请先重试读取来源。');
        }
        await backup.seedArchiveBackup(sourceEntry, snapshot.memory, snapshot.cache, { stillCurrent: () => stillCurrent(bound) });
        source = await backup.readArchiveBackupState(sourceEntry);
    }
    assertCurrent(bound);
    const targetMemory = repository.getImportedMemory(live);
    let targetEntry = cacheApi.archiveBackupEntryForContext(live, targetMemory || { chatId: contextApi.getChatId(live) });
    const target = await backup.readArchiveBackupState(targetEntry);
    assertCurrent(bound);
    if (source.deleted || target.deleted || !source.record) throw policy.relayError('来源或目标存在删除记录，请先检查档案。');
    sourceEntry = { ...sourceEntry, entryId: source.record.entryId };
    if (target.record) targetEntry = { ...targetEntry, entryId: target.record.entryId };
    policy.assertRelayWrite(sourceEntry, source.relay, source.record.memory);
    if (target.relay && target.relay.lineageId !== source.relay?.lineageId) throw policy.relayError('当前聊天已加入另一份连续档案，不会自动合并。');
    const returning = !!target.relay && target.relay.lineageId === source.relay?.lineageId;
    const occupied = !returning && (!!target.record || bound.before.hasMemory || bound.before.hasCache);
    return { version: 1, sourceEntry: copy(sourceEntry), targetEntry: copy(targetEntry), source: source.record,
        target: target.record, sourceFence: copy(source.relay), targetFence: copy(target.relay), occupied, returning,
        targetMirror: bound.before, bound };
}

export async function commitArchiveRelay(preview, { replaceTarget = false } = {}) {
    if (preview?.version !== 1) throw policy.relayError('交接预览已失效，请重新选择。');
    assertCurrent(preview.bound);
    const live = contextApi.currentCharacterGuard();
    if (!(await relayCandidates(live)).some(row => policy.relayMemberKey(row) === policy.relayMemberKey(preview.sourceEntry))) {
        throw policy.relayError('来源已从档案室移除，请重新选择。');
    }
    if (preview.occupied && !replaceTarget) throw policy.relayError('当前已有档案，请先导出并明确选择后再交接。');
    const hydrated = await cacheRecords.hydrateBackupCacheValue(preview.source.cache, preview.source.memory.chatId, preview.source.memory.archiveRevision);
    assertCurrent(preview.bound);
    const transferId = contextApi.stableArchiveHash(`${preview.sourceEntry.entryId}:${preview.targetEntry.entryId}:${Date.now()}:${globalThis.crypto?.randomUUID?.() || Math.random()}`);
    const revision = `relay-${Date.now()}-${transferId}`;
    const prepared = preparation.prepareArchiveRelay({ memory: preview.source.memory, cache: hydrated }, {
        chatId: preview.targetEntry.chatId, revision, previousMemberMemory: preview.returning ? preview.target?.memory : null,
    });
    cacheApi.stampCacheCommit(prepared.cache, preview.bound.scope);
    const packed = await cacheRecords.prepareCommittedCacheBackupValue(prepared.cache);
    assertCurrent(preview.bound);
    const result = await storage.handoffArchiveBackup({ sourceEntry: preview.sourceEntry, targetEntry: preview.targetEntry,
        sourceExpected: preview.source, targetExpected: preview.target, sourceFence: preview.sourceFence, targetFence: preview.targetFence,
        memory: prepared.memory, cache: packed, transferId, targetMirror: preview.targetMirror, replaceTarget,
        stillCurrent: () => stillCurrent(preview.bound) });
    // Commit is complete. A failed/cancelled host mirror must NOT roll back ownership
    // or report an uncommitted transfer. Reopening B recovers its canonical record.
    let mirrorQueued = false;
    if (stillCurrent(preview.bound)) {
        const current = contextApi.currentCharacterGuard(), scope = preview.bound.scope;
        current.chatMetadata[constants.MEMORY_KEY] = copy(result.record.memory);
        current.chatMetadata[constants.CACHE_KEY] = copy(result.record.cache);
        cacheApi.rememberRuntimeSessionCache(scope, prepared.cache);
        state.pendingCompressedCacheWrites.delete(scope);
        if (state.cachePersistTimers.has(scope)) clearTimeout(state.cachePersistTimers.get(scope));
        state.cachePersistTimers.delete(scope);
        state.archiveSnapshotCache?.clear?.();
        try { groups.upsertArchiveIndex(current, result.record.memory, { existingEntryId: result.record.entryId }); } catch {}
        try { if (typeof current.saveMetadataDebounced === 'function') { await current.saveMetadataDebounced(); mirrorQueued = true; } } catch {}
    }
    return { status: 'committed', mirrorQueued, transferId, record: result.record };
}
