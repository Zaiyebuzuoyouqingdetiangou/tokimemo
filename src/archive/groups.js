// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_library from './library.js';
import * as archive_repository from './repository.js';
import * as archive_snapshots from './snapshots.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as ui_overlay from '../ui/overlay.js';

export function normalizeArchiveGroup(item) {
    const id = core_text.normalizeText(item?.id, 120);
    if (!id) return null;
    return {
        id,
        label: core_text.normalizeText(item?.label, 120) || '角色档案',
        characterName: core_text.normalizeText(item?.characterName, 120),
        avatar: core_text.normalizeText(item?.avatar, 300),
        characterFingerprint: core_text.normalizeText(item?.characterFingerprint, 160),
        manual: item?.manual === true,
        characterIndexHint: Number.isInteger(Number(item?.characterIndexHint)) ? Number(item.characterIndexHint) : -1,
        createdAt: Math.max(0, Number(item?.createdAt) || 0),
        updatedAt: Math.max(0, Number(item?.updatedAt) || 0),
    };
}

export function getArchiveGroups(context = core_context.getContext()) {
    const raw = context.extensionSettings?.[core_constants.ARCHIVE_GROUPS_SETTINGS_KEY];
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, core_constants.ARCHIVE_GROUPS_MAX).map(normalizeArchiveGroup).filter(Boolean);
}

export function setArchiveGroups(context, groups) {
    if (!context.extensionSettings || typeof context.extensionSettings !== 'object') return;
    context.extensionSettings[core_constants.ARCHIVE_GROUPS_SETTINGS_KEY] = (Array.isArray(groups) ? groups : [])
        .map(normalizeArchiveGroup).filter(Boolean).slice(0, core_constants.ARCHIVE_GROUPS_MAX);
    context.saveSettingsDebounced?.();
}

export function getArchiveIndex(context = core_context.getContext()) {
    const raw = context.extensionSettings?.[core_constants.ARCHIVE_INDEX_SETTINGS_KEY];
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, core_constants.ARCHIVE_INDEX_MAX).map(item => {
        const normalized = {
            entryId: core_text.normalizeText(item?.entryId, 120),
            characterKey: core_text.normalizeText(item?.characterKey, 300),
            avatar: core_text.normalizeText(item?.avatar, 300),
            characterName: core_text.normalizeText(item?.characterName, 120) || '未命名角色',
            characterFingerprint: core_text.normalizeText(item?.characterFingerprint, 160),
            chatId: core_context.comparableChatId(item?.chatId),
            archiveName: core_text.normalizeText(item?.archiveName, 160) || '未命名档案',
            memoryCount: Math.max(0, Number(item?.memoryCount) || 0),
            updatedAt: Math.max(0, Number(item?.updatedAt) || 0),
            archiveGroupId: core_text.normalizeText(item?.archiveGroupId, 120),
            archiveGroupManual: item?.archiveGroupManual === true,
            };
        normalized.entryId = normalized.entryId || core_context.archiveIndexEntryId(normalized);
        return normalized;
    }).filter(item => item.characterKey && item.chatId);
}

export function setArchiveIndex(context, items) {
    if (!context.extensionSettings || typeof context.extensionSettings !== 'object') return;
    const normalized = Array.isArray(items) ? items.slice(0, core_constants.ARCHIVE_INDEX_MAX).map(item => ({
        ...item,
        entryId: core_context.archiveIndexEntryId(item),
        archiveGroupId: core_text.normalizeText(item?.archiveGroupId, 120),
        archiveGroupManual: item?.archiveGroupManual === true,
    })) : [];
    context.extensionSettings[core_constants.ARCHIVE_INDEX_SETTINGS_KEY] = normalized;
    context.saveSettingsDebounced?.();
}

export function archiveGroupKeyForEntry(entry) {
    return core_text.normalizeText(entry?.archiveGroupId, 120) || core_context.archiveAutoGroupId(entry);
}

export function archiveGroupMap(context = core_context.getContext()) {
    return new Map(getArchiveGroups(context).map(group => [group.id, group]));
}

export function archiveGroupMeta(groupId, entries, context = core_context.getContext()) {
    const list = Array.isArray(entries) ? entries : [];
    const registered = archiveGroupMap(context).get(groupId);
    const first = list[0] || null;
    return registered || {
        id: groupId,
        label: core_text.normalizeText(first?.characterName, 120) || '角色档案',
        characterName: core_text.normalizeText(first?.characterName, 120),
        avatar: core_context.archiveStoredAvatar(first),
        manual: false,
        characterIndexHint: -1,
        createdAt: 0,
        updatedAt: Math.max(0, ...list.map(item => Number(item?.updatedAt) || 0)),
    };
}

export function characterDescriptor(context, index) {
    const character = context?.characters?.[index];
    if (!character) return null;
    const data = character?.data && typeof character.data === 'object' ? character.data : character;
    const name = core_text.normalizeText(character?.name || data?.name, 120) || `角色 ${Number(index) + 1}`;
    const avatar = core_text.normalizeText(character?.avatar || data?.avatar, 300);
    const fingerprintSource = [
        avatar, name,
        core_text.normalizeText(data?.description || character?.description, 5000),
        core_text.normalizeText(data?.personality || character?.personality, 5000),
        core_text.normalizeText(data?.scenario || character?.scenario, 5000),
        core_text.normalizeText(data?.first_mes || character?.first_mes, 5000),
        core_text.normalizeText(data?.mes_example || character?.mes_example, 5000),
    ].join('\u001f');
    const fingerprint = `card:${core_context.stableArchiveHash(fingerprintSource)}`;
    return { index: Number(index), name, avatar, fingerprint };
}

export function matchArchiveEntryToCharacter(entry, context = core_context.getContext()) {
    const characters = Array.isArray(context?.characters) ? context.characters : [];
    const rawName = core_text.normalizeText(entry?.characterName, 120);
    const targetName = rawName && rawName !== '未命名角色' ? rawName : '';
    const targetAvatar = core_context.archiveStoredAvatar(entry);
    const targetFingerprint = core_text.normalizeText(entry?.characterFingerprint, 160);
    const candidates = characters.map((_, index) => characterDescriptor(context, index)).filter(Boolean);
    if (targetFingerprint) {
        const byFingerprint = candidates.filter(item => item.fingerprint === targetFingerprint);
        if (byFingerprint.length === 1) return byFingerprint[0];
        return null;
    }
    if (targetName) {
        const exact = candidates.filter(item => item.name === targetName && (!targetAvatar || item.avatar === targetAvatar));
        if (exact.length === 1) return exact[0];
        const byName = candidates.filter(item => item.name === targetName);
        if (byName.length === 1) return byName[0];
        // Never map a known source name to another card just because both cards share an avatar.
        return null;
    }
    const byAvatar = targetAvatar ? candidates.filter(item => item.avatar === targetAvatar) : [];
    if (byAvatar.length === 1) return byAvatar[0];
    return null;
}

export function archiveCharacterCandidates(entry, context = core_context.getContext()) {
    const characters = Array.isArray(context?.characters) ? context.characters : [];
    const targetName = core_text.normalizeText(entry?.characterName, 120);
    const targetAvatar = core_context.archiveStoredAvatar(entry);
    return characters.map((_, index) => characterDescriptor(context, index)).filter(Boolean).filter(item => {
        if (targetAvatar && item.avatar !== targetAvatar) return false;
        if (targetName && targetName !== '未命名角色' && item.name !== targetName) return false;
        return true;
    });
}

export function archiveEntryNeedsManualClassification(entry, context = core_context.getContext()) {
    if (core_text.normalizeText(entry?.characterFingerprint, 160)) return false;
    return archiveCharacterCandidates(entry, context).length > 1;
}

export function ensureArchiveUnresolvedGroup(groups, entry) {
    const entryId = core_context.archiveIndexEntryId(entry);
    const id = `review:${core_context.stableArchiveHash(entryId)}`;
    let group = groups.find(item => item.id === id);
    if (!group) {
        const name = core_text.normalizeText(entry?.characterName, 120) || '角色档案';
        group = normalizeArchiveGroup({
            id,
            label: `${name} · 待手动分类`,
            characterName: name,
            avatar: core_context.archiveStoredAvatar(entry),
            characterFingerprint: '',
            manual: false,
            characterIndexHint: -1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        groups.push(group);
    }
    return group;
}

export function ensureArchiveAutoGroup(groups, descriptor, fallbackEntry = null) {
    const identity = descriptor
        ? { avatar: descriptor.avatar, characterKey: descriptor.avatar || `character:${descriptor.index}`, characterName: descriptor.name, characterFingerprint: descriptor.fingerprint }
        : fallbackEntry;
    const id = core_context.archiveAutoGroupId(identity);
    let group = groups.find(item => item.id === id);
    if (!group) {
        group = normalizeArchiveGroup({
            id,
            label: core_text.normalizeText(descriptor?.name || fallbackEntry?.characterName, 120) || '角色档案',
            characterName: core_text.normalizeText(descriptor?.name || fallbackEntry?.characterName, 120),
            avatar: core_text.normalizeText(descriptor?.avatar || core_context.archiveStoredAvatar(fallbackEntry), 300),
            characterFingerprint: core_text.normalizeText(descriptor?.fingerprint || fallbackEntry?.characterFingerprint, 160),
            manual: false,
            characterIndexHint: descriptor?.index ?? -1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        groups.push(group);
    } else {
        group.label = core_text.normalizeText(descriptor?.name || group.label, 120) || group.label;
        group.characterName = core_text.normalizeText(descriptor?.name || group.characterName, 120);
        group.avatar = core_text.normalizeText(descriptor?.avatar || group.avatar, 300);
        group.characterFingerprint = core_text.normalizeText(descriptor?.fingerprint || group.characterFingerprint, 160);
        if (descriptor) group.characterIndexHint = descriptor.index;
        group.updatedAt = Date.now();
    }
    return group;
}

export function autoClassifyArchiveIndex(context = core_context.getContext(), { confirm = true } = {}) {
    const items = getArchiveIndex(context);
    if (!items.length) return 0;
    if (confirm && !ui_overlay.confirmExplicitAction('自动分类档案？', '只会重排心跳回忆“档案室”的索引归属，不会移动、重命名、删除 SillyTavern 的任何聊天文件，也不会切换当前聊天。手动移动过的档案不会被自动分类覆盖。', { destructive: false })) return 0;
    const groups = getArchiveGroups(context);
    let changed = 0;
    for (const item of items) {
        if (item.archiveGroupManual) continue;
        const descriptor = matchArchiveEntryToCharacter(item, context);
        if (descriptor && !item.characterFingerprint) item.characterFingerprint = descriptor.fingerprint;
        const group = !descriptor && archiveEntryNeedsManualClassification(item, context)
            ? ensureArchiveUnresolvedGroup(groups, item)
            : ensureArchiveAutoGroup(groups, descriptor, item);
        if (item.archiveGroupId !== group.id || item.archiveGroupManual) changed += 1;
        item.archiveGroupId = group.id;
        item.archiveGroupManual = false;
    }
    setArchiveGroups(context, groups);
    setArchiveIndex(context, items);
    return changed;
}

export function createArchiveGroupForCharacter(context, characterIndex) {
    const descriptor = characterDescriptor(context, Number(characterIndex));
    if (!descriptor) throw new Error('没有找到你选择的 SillyTavern 角色。');
    const groups = getArchiveGroups(context);
    const id = `manual:${core_context.stableArchiveHash(`${descriptor.avatar}\u001f${descriptor.name}\u001f${Date.now()}\u001f${Math.random()}`)}`;
    groups.unshift(normalizeArchiveGroup({
        id,
        label: descriptor.name,
        characterName: descriptor.name,
        avatar: descriptor.avatar,
        characterFingerprint: descriptor.fingerprint,
        manual: true,
        characterIndexHint: descriptor.index,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    }));
    setArchiveGroups(context, groups);
    return id;
}

export function moveArchiveIndexEntryToGroup(context, entryId, groupId) {
    const id = core_text.normalizeText(entryId, 120);
    const target = core_text.normalizeText(groupId, 120);
    const items = getArchiveIndex(context);
    const item = items.find(entry => core_context.archiveIndexEntryId(entry) === id);
    if (!item) throw new Error('没有找到要移动的档案索引。');
    if (target === '__AUTO__' || !target) {
        item.archiveGroupId = '';
        item.archiveGroupManual = false;
        const descriptor = matchArchiveEntryToCharacter(item, context);
        if (descriptor && !item.characterFingerprint) item.characterFingerprint = descriptor.fingerprint;
        const groups = getArchiveGroups(context);
        const group = !descriptor && archiveEntryNeedsManualClassification(item, context)
            ? ensureArchiveUnresolvedGroup(groups, item)
            : ensureArchiveAutoGroup(groups, descriptor, item);
        item.archiveGroupId = group.id;
        setArchiveGroups(context, groups);
    } else {
        const groups = getArchiveGroups(context);
        if (!groups.some(group => group.id === target)) throw new Error('目标角色档案组已经不存在。');
        item.archiveGroupId = target;
        item.archiveGroupManual = true;
    }
    setArchiveIndex(context, items);
}

export function removeArchiveIndexEntry(context, entryId) {
    const id = core_text.normalizeText(entryId, 120);
    if (!id) return false;
    const before = getArchiveIndex(context);
    const removed = before.find(item => core_context.archiveIndexEntryId(item) === id) || null;
    const after = before.filter(item => core_context.archiveIndexEntryId(item) !== id);
    if (after.length === before.length) return false;
    setArchiveIndex(context, after);
    if (removed) runtimeState.archiveSnapshotCache.delete(archive_library.archiveSnapshotCacheKey(removed));
    return true;
}

export async function deleteCurrentHeartbeatArchive(entryId = '') {
    if (core_requestCoordinator.hasAnyTask()) throw new Error('当前还有后台任务。为避免删除时与生成写回竞态，请等任务完成后再操作。');
    const context = core_context.currentCharacterGuard();
    const memory = archive_repository.getImportedMemory(context);
    if (!memory) throw new Error('当前真实聊天没有可删除的心跳回忆档案。');
    const expectedChatId = core_context.comparableChatId(core_context.getChatId(context));
    const expectedCharacterKey = core_context.currentCharacterRuntimeKey(context);
    const indexed = getArchiveIndex(context).find(item => {
        if (entryId && core_context.archiveIndexEntryId(item) === core_text.normalizeText(entryId, 120)) return true;
        return item.chatId === expectedChatId && core_context.archiveEntryMatchesContextCharacter(item, context);
    });
    if (indexed && !generation_imageGeneration.indexedArchiveMatchesCurrentChat(indexed, context)) {
        throw new Error('目标档案与当前真实聊天身份不一致。请先手动打开正确聊天后再删除。');
    }
    const archiveName = core_text.normalizeText(memory.archiveName, 160) || archive_repository.fallbackArchiveName(memory.memories);
    if (!ui_overlay.confirmExplicitAction(
        `删除当前聊天的心跳回忆档案「${archiveName}」？`,
        '只删除心跳回忆自己的 MEMORY_KEY 与已生成派生缓存（相簿 / ADV EVENT / 房间 / ENDING / HEART 等），不会删除、清空或改写 SillyTavern 聊天正文。删除后如需恢复心跳回忆内容，需要重新建档/生成。',
        { destructive: true },
    )) return false;
    if (!ui_overlay.confirmExplicitAction(
        '最后确认：永久删除这份心跳回忆档案？',
        '请确认你已经选对当前聊天。聊天正文会保留，但心跳回忆档案及其派生缓存会从当前聊天 metadata 中移除。',
        { destructive: true },
    )) return false;

    // No await is allowed before the destructive mutation and save call. Re-check the live scope
    // immediately so a manually changed chat/card cannot turn this action into a cross-chat delete.
    const live = core_context.currentCharacterGuard();
    if (core_context.comparableChatId(core_context.getChatId(live)) !== expectedChatId || core_context.currentCharacterRuntimeKey(live) !== expectedCharacterKey) {
        throw new Error('确认期间当前角色或聊天已经变化，本次删除已取消。');
    }
    const scope = core_cache.cacheScopeFromContext(live);
    const timer = runtimeState.cachePersistTimers.get(scope);
    if (timer) clearTimeout(timer);
    runtimeState.cachePersistTimers.delete(scope);
    runtimeState.pendingCompressedCacheWrites.delete(scope);
    runtimeState.runtimeSessionCache.delete(scope);
    runtimeState.cacheHydrationPromises.delete(scope);
    runtimeState.cacheHydrationErrors.delete(scope);
    runtimeState.memoryPreflightCache.delete(scope);
    runtimeState.usableMessageCountCache.delete(scope);
    delete live.chatMetadata[core_constants.MEMORY_KEY];
    delete live.chatMetadata[core_constants.CACHE_KEY];
    archive_snapshots.rememberCurrentArchiveForOverview(live);
    archive_snapshots.syncArchiveOverviewCurrentRow(live);
    const row = indexed || getArchiveIndex(live).find(item => item.chatId === expectedChatId && core_context.archiveEntryMatchesContextCharacter(item, live));
    if (row) removeArchiveIndexEntry(live, core_context.archiveIndexEntryId(row));
    // Direct save is preferred for this explicit destructive action so a later same-character
    // chat switch cannot retarget a debounced metadata write.
    if (typeof live.saveMetadata === 'function') await live.saveMetadata();
    else live.saveMetadataDebounced?.();
    runtimeState.activeArchiveSnapshot = null;
    runtimeState.activeArchiveReadOnly = true;
    runtimeState.activeMode = null;
    runtimeState.activeSession = null;
    return true;
}

export function removeIndexedArchiveFromLibrary(entryId) {
    const context = core_context.getContext();
    const id = core_text.normalizeText(entryId, 120);
    const item = getArchiveIndex(context).find(entry => core_context.archiveIndexEntryId(entry) === id);
    if (!item) throw new Error('没有找到这个档案索引。');
    if (!ui_overlay.confirmExplicitAction(
        `从档案室移除「${item.archiveName}」？`,
        '这里只删除心跳回忆 extension settings 里的轻量索引，不会删除聊天文件，也不会删除聊天 metadata 中真正的心跳回忆档案。以后手动“扫描旧版本已有档案”时它可能重新出现。',
        { destructive: true },
    )) return false;
    return removeArchiveIndexEntry(context, id);
}

export function archiveGroupEntries(groupId, context = core_context.getContext()) {
    const id = core_text.normalizeText(groupId, 120);
    return getArchiveIndex(context).filter(item => archiveGroupKeyForEntry(item) === id);
}

export function archiveGroupAvatarUrl(meta, fallbackEntry = null, context = core_context.getContext()) {
    const avatar = core_text.normalizeText(meta?.avatar, 300) || core_context.archiveStoredAvatar(fallbackEntry);
    if (avatar) {
        try { return context.getThumbnailUrl?.('avatar', avatar) || ''; } catch {}
    }
    return fallbackEntry ? archive_snapshots.archiveCharacterAvatar(fallbackEntry, context) : '';
}

export function currentArchiveGroupKey(context = core_context.getContext()) {
    const entry = getArchiveIndex(context).find(item => generation_imageGeneration.indexedArchiveMatchesCurrentChat(item, context));
    return entry ? archiveGroupKeyForEntry(entry) : '';
}

export function getAvatarVisitState(context = core_context.getContext()) {
    const raw = context.extensionSettings?.[core_constants.AVATAR_VISIT_SETTINGS_KEY];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const entries = Object.entries(raw).slice(-240);
    const out = {};
    for (const [key, value] of entries) {
        const safeKey = core_text.normalizeText(key, 320);
        const timestamp = Math.max(0, Number(value) || 0);
        if (safeKey && timestamp) out[safeKey] = timestamp;
    }
    return out;
}

export function avatarVisitKey(characterKey) {
    return core_text.normalizeText(characterKey, 300);
}

export function lastAvatarVisitAt(characterKey, context = core_context.getContext()) {
    const key = avatarVisitKey(characterKey);
    if (!key) return 0;
    return Math.max(0, Number(getAvatarVisitState(context)[key]) || 0);
}

export function touchAvatarVisit(characterKey, context = core_context.getContext()) {
    if (!context.extensionSettings || typeof context.extensionSettings !== 'object') return;
    const key = avatarVisitKey(characterKey);
    if (!key) return;
    const state = getAvatarVisitState(context);
    state[key] = Date.now();
    const entries = Object.entries(state).sort((a, b) => Number(a[1]) - Number(b[1])).slice(-240);
    context.extensionSettings[core_constants.AVATAR_VISIT_SETTINGS_KEY] = Object.fromEntries(entries);
    context.saveSettingsDebounced?.();
}

export function upsertArchiveIndex(context, memoryBank) {
    if (!archive_repository.isCompatibleArchive(memoryBank)) return;
    const chatId = core_context.comparableChatId(memoryBank.chatId || core_context.getChatId(context));
    if (!chatId) return;
    const characterName = core_text.normalizeText(memoryBank.characterName || context.name2, 120) || '未命名角色';
    const existingIndex = getArchiveIndex(context);
    const descriptor = characterDescriptor(context, Number(context.characterId));
    const existing = existingIndex.find(old => old.chatId === chatId
        && !!descriptor?.fingerprint
        && core_text.normalizeText(old?.characterFingerprint, 160) === descriptor.fingerprint)
        || existingIndex.find(old => old.chatId === chatId
            && !core_text.normalizeText(old?.characterFingerprint, 160)
            && core_context.archiveEntryMatchesContextCharacter(old, context));
    // Some mobile/cloud contexts briefly expose the character without an avatar while the
    // drawer/chat UI is remounting. Never replace a previously valid archive avatar with ''.
    const avatar = core_text.normalizeText(context.characters?.[context.characterId]?.avatar || context.characters?.[context.characterId]?.data?.avatar, 300)
        || core_context.archiveStoredAvatar(existing)
        || core_context.contextCharacterAvatar(context, characterName);
    const characterKey = avatar || core_text.normalizeText(existing?.characterKey, 300) || core_context.currentCharacterKey(context);
    if (!characterKey) return;
    const item = {
        entryId: core_text.normalizeText(existing?.entryId, 120),
        characterKey, avatar,
        characterName,
        characterFingerprint: core_text.normalizeText(descriptor?.fingerprint || existing?.characterFingerprint, 160),
        chatId,
        archiveName: core_text.normalizeText(memoryBank.archiveName, 160) || archive_repository.fallbackArchiveName(memoryBank.memories),
        memoryCount: memoryBank.memories.length,
        updatedAt: Number(memoryBank.updatedAt || memoryBank.createdAt) || Date.now(),
        archiveGroupId: core_text.normalizeText(existing?.archiveGroupId, 120),
        archiveGroupManual: existing?.archiveGroupManual === true,
    };
    item.entryId = item.entryId || core_context.archiveIndexEntryId(item);
    if (!item.archiveGroupManual) {
        const groups = getArchiveGroups(context);
        const group = ensureArchiveAutoGroup(groups, descriptor, item);
        item.archiveGroupId = group.id;
        setArchiveGroups(context, groups);
    }
    const index = existingIndex.filter(old => core_context.archiveIndexEntryId(old) !== item.entryId);
    index.unshift(item);
    index.sort((a,b) => b.updatedAt - a.updatedAt);
    setArchiveIndex(context, index);
}
