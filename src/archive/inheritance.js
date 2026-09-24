// Explicit, same-character archive inheritance for a brand-new chat.
// No function in this module runs automatically or calls a provider.
import * as archive_backupStore from './backupStore.js';
import * as archive_groups from './groups.js';
import * as archive_repository from './repository.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_recovery from '../generation/recovery.js';

export const ARCHIVE_INHERITANCE_VERSION = 1;
const GENERATION_RECOVERY_CLEARED_KEY = '__generationRecoveryClearedV1';

function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function inheritanceError(message, code) {
    return core_text.safeUserError(message, code);
}

function targetIdentity(context) {
    const descriptor = archive_groups.characterDescriptor(context, Number(context?.characterId));
    return {
        characterId: Number.isInteger(Number(context?.characterId)) ? Number(context.characterId) : -1,
        avatar: core_text.normalizeText(descriptor?.avatar || core_context.currentCharacterAvatar(context), 300),
        fingerprint: core_text.normalizeText(descriptor?.fingerprint, 160),
    };
}

export function archiveEntryMatchesInheritanceTarget(entry, context = core_context.getContext()) {
    if (!entry || !context) return false;
    const target = targetIdentity(context);
    const sourceId = Number.isInteger(Number(entry.characterIndexHint)) ? Number(entry.characterIndexHint) : -1;
    const sourceAvatar = core_context.archiveStoredAvatar(entry);
    const sourceFingerprint = core_text.normalizeText(entry.characterFingerprint, 160);
    // Names and manual groups are presentation metadata, never character proof.
    if (target.characterId < 0 || sourceId !== target.characterId || !target.avatar || sourceAvatar !== target.avatar) return false;
    if (sourceFingerprint && target.fingerprint && sourceFingerprint !== target.fingerprint) return false;
    return true;
}

export function inheritanceCandidates(context = core_context.getContext()) {
    const targetChatId = core_context.comparableChatId(core_context.getChatId(context));
    return archive_groups.getArchiveIndex(context)
        .filter(entry => core_context.comparableChatId(entry.chatId) !== targetChatId
            && archiveEntryMatchesInheritanceTarget(entry, context))
        .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
}

function targetOccupied(context) {
    const metadata = context?.chatMetadata;
    if (!metadata || typeof metadata !== 'object') return true;
    return Object.prototype.hasOwnProperty.call(metadata, core_constants.MEMORY_KEY)
        || Object.prototype.hasOwnProperty.call(metadata, core_constants.CACHE_KEY);
}

function assertEmptyTarget(context) {
    if (targetOccupied(context)) {
        throw inheritanceError('当前聊天已经有心迹档案或派生内容；继承只允许写入全新的空目标，不会覆盖现有内容。', 'RMT_INHERIT_TARGET_OCCUPIED');
    }
}

function findSource(entryId, context) {
    const id = core_text.normalizeText(entryId, 120);
    const matches = archive_groups.getArchiveIndex(context)
        .filter(entry => core_context.archiveIndexEntryId(entry) === id);
    if (matches.length !== 1) throw inheritanceError('所选来源档案已经不存在或身份不唯一，请重新选择。', 'RMT_INHERIT_SOURCE_CHANGED');
    const entry = matches[0];
    if (!archiveEntryMatchesInheritanceTarget(entry, context)) {
        throw inheritanceError('所选档案不属于当前实际角色卡；没有按角色名猜测或复制。', 'RMT_INHERIT_OTHER_CHARACTER');
    }
    if (core_context.comparableChatId(entry.chatId) === core_context.comparableChatId(core_context.getChatId(context))) {
        throw inheritanceError('来源必须是同一角色卡的另一个聊天档案。', 'RMT_INHERIT_SOURCE_CHANGED');
    }
    return entry;
}

function modeCounts(cache) {
    const modes = {};
    for (const mode of Object.values(core_constants.MODE)) {
        if (cache?.[mode]?.kind === mode) modes[mode] = 1;
    }
    return modes;
}

export function archiveInheritanceCounts(memory, cache) {
    const modes = modeCounts(cache);
    return {
        memories: Array.isArray(memory?.memories) ? memory.memories.length : 0,
        coldMemories: Array.isArray(memory?.coldArchive) ? memory.coldArchive.length : 0,
        derivedModes: Object.keys(modes).length,
        modes,
    };
}

function snapshotSignature(snapshot) {
    return JSON.stringify({
        entryId: core_text.normalizeText(snapshot?.entryId, 120),
        chatId: core_context.comparableChatId(snapshot?.memory?.chatId || snapshot?.chatId),
        revision: core_text.normalizeText(snapshot?.memory?.archiveRevision, 240),
        cacheOrder: core_cache.cacheOrderValue(snapshot?.cache),
        counts: archiveInheritanceCounts(snapshot?.memory, snapshot?.cache),
    });
}

function captureTarget(context) {
    return {
        lifecycleEpoch: runtimeState.runtimeLifecycleEpoch,
        scope: core_context.chatScopeKey(context),
        chatId: core_context.comparableChatId(core_context.getChatId(context)),
        runtimeKey: core_context.currentCharacterRuntimeKey(context),
    };
}

function assertTargetCurrent(binding) {
    const live = core_context.currentCharacterGuard();
    if (runtimeState.runtimeLifecycleEpoch !== binding.lifecycleEpoch
        || core_context.chatScopeKey(live) !== binding.scope
        || core_context.comparableChatId(core_context.getChatId(live)) !== binding.chatId
        || core_context.currentCharacterRuntimeKey(live) !== binding.runtimeKey) {
        throw inheritanceError('选择来源期间当前聊天或角色已经切换，继承没有写入。', 'RMT_RECOVERY_ORIGIN_CHANGED');
    }
    assertEmptyTarget(live);
    return live;
}

export async function previewArchiveInheritance(entryId, { context = core_context.currentCharacterGuard(), loadSnapshot } = {}) {
    if (typeof loadSnapshot !== 'function') throw new TypeError('继承预览缺少档案读取器。');
    assertEmptyTarget(context);
    const binding = captureTarget(context);
    const entry = findSource(entryId, context);
    const snapshot = await loadSnapshot(entry, context, { lifecycleEpoch: binding.lifecycleEpoch, force: true });
    const live = assertTargetCurrent(binding);
    findSource(entryId, live);
    if (!archiveEntryMatchesInheritanceTarget(snapshot, live)) {
        throw inheritanceError('读取结果与当前实际角色卡不一致，继承已停止。', 'RMT_INHERIT_OTHER_CHARACTER');
    }
    const counts = archiveInheritanceCounts(snapshot.memory, snapshot.cache);
    return {
        version: ARCHIVE_INHERITANCE_VERSION,
        entryId: core_context.archiveIndexEntryId(entry),
        sourceChatId: core_context.comparableChatId(snapshot.memory?.chatId || snapshot.chatId),
        sourceArchiveRevision: core_text.normalizeText(snapshot.memory?.archiveRevision, 240),
        sourceArchiveName: core_text.normalizeText(snapshot.memory?.archiveName || snapshot.archiveName, 160),
        sourceSignature: snapshotSignature(snapshot),
        targetChatId: binding.chatId,
        source: counts,
        targetBefore: archiveInheritanceCounts(null, null),
        targetAfter: clone(counts),
    };
}

function inheritedMemoryItem(item, provenance) {
    const next = clone(item);
    next.inheritedArchiveSourceV1 = {
        version: ARCHIVE_INHERITANCE_VERSION,
        entryId: provenance.entryId,
        chatId: provenance.chatId,
        archiveRevision: provenance.archiveRevision,
        sourceKind: core_text.normalizeText(item?.sourceKind, 80) || 'chat',
        messageStart: Math.max(0, Number(item?.messageStart) || 0),
        messageEnd: Math.max(0, Number(item?.messageEnd) || 0),
    };
    next.sourceKind = 'inherited-archive';
    delete next.messageStart;
    delete next.messageEnd;
    return next;
}

export function prepareInheritedArchive(snapshot, targetContext, inheritedAt = Date.now()) {
    const sourceMemory = snapshot?.memory;
    if (!archive_repository.isCompatibleArchive(sourceMemory)) {
        throw inheritanceError('来源档案格式无法安全继承。', 'RMT_INHERIT_SOURCE_CHANGED');
    }
    const targetChatId = core_context.comparableChatId(core_context.getChatId(targetContext));
    const sourceChatId = core_context.comparableChatId(sourceMemory.chatId);
    const sourceRevision = core_text.normalizeText(sourceMemory.archiveRevision, 240);
    const entryId = core_text.normalizeText(snapshot.entryId, 120);
    const revision = `inherit-${Math.max(1, Math.floor(inheritedAt))}-${core_context.stableArchiveHash(`${entryId}\u001f${sourceRevision}\u001f${targetChatId}`)}`;
    const provenance = { entryId, chatId: sourceChatId, archiveRevision: sourceRevision };
    const memory = clone(sourceMemory);
    memory.chatId = targetChatId;
    memory.archiveRevision = revision;
    memory.createdAt = inheritedAt;
    memory.updatedAt = inheritedAt;
    memory.sourceMessageCount = 0;
    memory.usedMessageCount = 0;
    memory.usedCharacterCount = 0;
    memory.sourceFingerprint = `inherited:${core_context.stableArchiveHash(`${entryId}\u001f${sourceRevision}`)}`;
    memory.memories = (Array.isArray(sourceMemory.memories) ? sourceMemory.memories : [])
        .map(item => inheritedMemoryItem(item, provenance));
    if (Array.isArray(sourceMemory.coldArchive)) {
        memory.coldArchive = sourceMemory.coldArchive.map(item => inheritedMemoryItem(item, provenance));
    }
    memory.inheritanceV1 = {
        version: ARCHIVE_INHERITANCE_VERSION,
        inheritedAt,
        sourceEntryId: entryId,
        sourceChatId,
        sourceArchiveRevision: sourceRevision,
        sourceArchiveName: core_text.normalizeText(sourceMemory.archiveName, 160),
        sourceCounts: archiveInheritanceCounts(sourceMemory, snapshot.cache),
        currentChatEvidenceCount: 0,
    };

    const cache = clone(snapshot.cache || {});
    archive_repository.migrateDerivedCacheRevision(cache, sourceMemory, memory);
    // A copied completed work stays readable, including images and local reading
    // state. Request/recovery journals never cross into the new chat.
    delete cache[generation_recovery.GENERATION_RECOVERY_CACHE_KEY];
    delete cache[GENERATION_RECOVERY_CLEARED_KEY];
    delete cache[core_cache.GENERATION_DRAFTS_CACHE_KEY];
    delete cache[core_constants.PHONE_DRAFT_CACHE_KEY];
    cache.chatId = targetChatId;
    cache.archiveRevision = revision;
    core_cache.prepareBoundedRawCache(cache);
    return { memory, cache };
}

export async function inheritArchiveIntoCurrentChat(preview, { context = core_context.currentCharacterGuard(), loadSnapshot } = {}) {
    if (typeof loadSnapshot !== 'function') throw new TypeError('继承提交缺少档案读取器。');
    if (preview?.version !== ARCHIVE_INHERITANCE_VERSION) throw inheritanceError('继承预览已失效，请重新选择来源。', 'RMT_INHERIT_SOURCE_CHANGED');
    assertEmptyTarget(context);
    const binding = captureTarget(context);
    if (binding.chatId !== core_context.comparableChatId(preview.targetChatId)) {
        throw inheritanceError('预览属于另一个目标聊天，请重新预览。', 'RMT_RECOVERY_ORIGIN_CHANGED');
    }
    let entry = findSource(preview.entryId, context);
    let snapshot = await loadSnapshot(entry, context, { lifecycleEpoch: binding.lifecycleEpoch, force: true });
    assertTargetCurrent(binding);
    if (snapshotSignature(snapshot) !== preview.sourceSignature) {
        throw inheritanceError('来源档案或阅读进度已更新，请核对新计数后重新确认。', 'RMT_INHERIT_SOURCE_CHANGED');
    }
    const prepared = prepareInheritedArchive(snapshot, context);

    // Revalidate after every asynchronous read/preparation boundary. A deletion,
    // source update, character switch or newly occupied target wins over this copy.
    try {
        entry = findSource(preview.entryId, assertTargetCurrent(binding));
        return await core_cache.serializeArchiveCommitOperation(entry, snapshot.memory, async () => {
            const sourceState = await archive_backupStore.readArchiveBackupState(entry);
            assertTargetCurrent(binding);
            if (sourceState.deleted) throw inheritanceError('来源档案已被删除，继承没有写入。', 'RMT_ARCHIVE_DELETED_FENCE');
            if (!sourceState.record || sourceState.record.archiveRevision !== preview.sourceArchiveRevision
                || core_cache.cacheOrderValue(sourceState.record.cache) !== core_cache.cacheOrderValue(snapshot.cache)) {
                snapshot = await loadSnapshot(entry, context, { lifecycleEpoch: binding.lifecycleEpoch, force: true });
                assertTargetCurrent(binding);
                if (snapshotSignature(snapshot) !== preview.sourceSignature) {
                    throw inheritanceError('来源档案或阅读进度已更新，请核对新计数后重新确认。', 'RMT_INHERIT_SOURCE_CHANGED');
                }
            }
            findSource(preview.entryId, assertTargetCurrent(binding));
            const live = assertTargetCurrent(binding);
            const saved = await core_cache.saveImportedMemory(live, prepared.memory, binding.chatId, {
                expectedPreviousArchiveState: { present: false },
                explicitCreate: true,
                expectedTaskOrigin: {
                    ...core_context.captureTaskOrigin(live, ''),
                    startedAt: prepared.memory.createdAt,
                    archivePresent: false,
                },
                assertTaskCurrent: () => { assertTargetCurrent(binding); },
                initialCache: prepared.cache,
            });
            return { status: 'committed', memory: saved, counts: archiveInheritanceCounts(saved, prepared.cache), provenance: clone(saved.inheritanceV1) };
        });
    } catch (error) {
        if (targetOccupied(context) && error?.code !== 'RMT_CACHE_CAS_CONFLICT') {
            throw inheritanceError('目标聊天在继承期间已写入其他档案；现有目标未被覆盖，请重新打开检查。', 'RMT_INHERIT_TARGET_OCCUPIED');
        }
        throw error;
    }
}
