// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_library from './library.js';
import * as archive_backupStore from './backupStore.js';
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

function normalizeDeletedIdentityList(values, limit = 24, maxChars = 320) {
    const out = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
        const normalized = core_text.normalizeText(value, maxChars);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(normalized);
        if (out.length >= limit) break;
    }
    return out;
}

export function normalizeDeletedArchiveCharacter(item) {
    const groupId = core_text.normalizeText(item?.groupId, 120);
    const avatars = normalizeDeletedIdentityList(item?.avatars, 24, 300);
    const characterKeys = normalizeDeletedIdentityList(item?.characterKeys, 24, 300);
    const sourceIdentityKeys = normalizeDeletedIdentityList(item?.sourceIdentityKeys, 24, 360);
    const characterName = core_text.normalizeText(item?.characterName, 120);
    const id = core_text.normalizeText(item?.id, 160)
        || `deleted:${core_context.stableArchiveHash(`${groupId}${avatars.join('|')}${characterKeys.join('|')}${sourceIdentityKeys.join('|')}${characterName}`)}`;
    if (!groupId && !avatars.length && !characterKeys.length && !sourceIdentityKeys.length) return null;
    return {
        id,
        groupId,
        characterName,
        avatars,
        characterKeys,
        sourceIdentityKeys,
        deletedAt: Math.max(0, Number(item?.deletedAt) || Date.now()),
    };
}

export function getDeletedArchiveCharacters(context = core_context.getContext()) {
    const raw = context.extensionSettings?.[core_constants.ARCHIVE_DELETED_CHARACTERS_SETTINGS_KEY];
    if (!Array.isArray(raw)) return [];
    return raw.slice(-core_constants.ARCHIVE_DELETED_CHARACTERS_MAX).map(normalizeDeletedArchiveCharacter).filter(Boolean);
}

export function setDeletedArchiveCharacters(context, items) {
    if (!context.extensionSettings || typeof context.extensionSettings !== 'object') return;
    const normalized = (Array.isArray(items) ? items : []).map(normalizeDeletedArchiveCharacter).filter(Boolean);
    const deduped = [];
    const seen = new Set();
    for (const item of normalized.reverse()) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        deduped.unshift(item);
        if (deduped.length >= core_constants.ARCHIVE_DELETED_CHARACTERS_MAX) break;
    }
    context.extensionSettings[core_constants.ARCHIVE_DELETED_CHARACTERS_SETTINGS_KEY] = deduped;
    context.saveSettingsDebounced?.();
}

function deletedArchiveFallbackIdentityKey(entry) {
    const stableKey = core_context.archiveStoredAvatar(entry) || core_text.normalizeText(entry?.characterKey, 300);
    const name = core_text.normalizeText(entry?.characterName, 120).toLocaleLowerCase();
    return stableKey && name ? `fallback:${stableKey}${name}` : '';
}

export function archiveEntryMatchesDeletedCharacter(entry, deleted) {
    if (!entry || !deleted) return false;
    const groupId = archiveGroupKeyForEntry(entry);
    if (deleted.groupId && groupId === deleted.groupId) return true;
    const sourceIdentityKey = core_context.archiveSourceIdentityKey(entry);
    if (sourceIdentityKey && deleted.sourceIdentityKeys?.includes?.(sourceIdentityKey)) return true;
    const fallbackIdentityKey = deletedArchiveFallbackIdentityKey(entry);
    if (fallbackIdentityKey && deleted.sourceIdentityKeys?.includes?.(fallbackIdentityKey)) return true;
    return false;
}

export function buildDeletedArchiveCharacterIndex(context = core_context.getContext()) {
    const groupIds = new Set();
    const sourceIdentityKeys = new Set();
    for (const deleted of getDeletedArchiveCharacters(context)) {
        if (deleted.groupId) groupIds.add(deleted.groupId);
        for (const key of Array.isArray(deleted.sourceIdentityKeys) ? deleted.sourceIdentityKeys : []) {
            if (key) sourceIdentityKeys.add(key);
        }
    }
    return { groupIds, sourceIdentityKeys };
}

export function archiveEntryMatchesDeletedCharacterIndex(entry, index) {
    if (!entry || !index) return false;
    const groupId = archiveGroupKeyForEntry(entry);
    if (groupId && index.groupIds?.has?.(groupId)) return true;
    const sourceIdentityKey = core_context.archiveSourceIdentityKey(entry);
    if (sourceIdentityKey && index.sourceIdentityKeys?.has?.(sourceIdentityKey)) return true;
    const fallbackIdentityKey = deletedArchiveFallbackIdentityKey(entry);
    return !!(fallbackIdentityKey && index.sourceIdentityKeys?.has?.(fallbackIdentityKey));
}

export function isArchiveEntryDeletedFromLibrary(entry, context = core_context.getContext(), deletedIndex = null) {
    const index = deletedIndex || buildDeletedArchiveCharacterIndex(context);
    return archiveEntryMatchesDeletedCharacterIndex(entry, index);
}

export function currentCharacterArchiveProbe(context = core_context.getContext(), memoryBank = null) {
    const descriptor = characterDescriptor(context, Number(context?.characterId));
    const characterName = core_text.normalizeText(memoryBank?.characterName || context?.name2 || descriptor?.name, 120) || '未命名角色';
    const avatar = core_text.normalizeText(descriptor?.avatar || core_context.contextCharacterAvatar(context, characterName), 300);
    return {
        characterKey: avatar || core_context.currentCharacterKey(context),
        avatar,
        characterName,
        characterFingerprint: core_text.normalizeText(descriptor?.fingerprint, 160),
        chatId: core_context.comparableChatId(memoryBank?.chatId || core_context.getChatId(context)) || 'current',
    };
}

export function isCurrentCharacterDeletedFromLibrary(context = core_context.getContext(), memoryBank = null) {
    try { return isArchiveEntryDeletedFromLibrary(currentCharacterArchiveProbe(context, memoryBank), context); }
    catch { return false; }
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
    if (!group && descriptor) {
        const stableName = core_text.normalizeText(descriptor.name, 120);
        const stableAvatar = core_text.normalizeText(descriptor.avatar, 300);
        const stableCandidates = groups.filter(item => item?.manual !== true
            && core_text.normalizeText(item?.characterName || item?.label, 120) === stableName
            && (!stableAvatar || core_text.normalizeText(item?.avatar, 300) === stableAvatar));
        // Ordinary role-card edits change the content fingerprint but not the person. Reuse the
        // one unambiguous auto group so all chat windows continue sharing one Character Profile.
        // If multiple candidates already exist, fail closed by creating/using the exact fingerprint id.
        if (stableCandidates.length === 1) group = stableCandidates[0];
    }
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

export async function deleteArchiveCharacterFromLibrary(groupId) {
    if (core_requestCoordinator.hasAnyTask()) throw new Error('当前还有后台任务。为避免删除时与生成写回竞态，请等任务完成后再操作。');
    const context = core_context.getContext();
    const id = core_text.normalizeText(groupId, 120);
    if (!id) throw new Error('没有找到要删除的角色档案。');
    const groups = getArchiveGroups(context);
    const group = groups.find(item => item.id === id) || null;
    const entries = archiveGroupEntries(id, context);
    if (!group && !entries.length) throw new Error('这个角色档案已经不存在。');
    const meta = archiveGroupMeta(id, entries, context);
    const name = core_text.normalizeText(meta?.label || meta?.characterName || entries[0]?.characterName, 120) || '未命名角色';
    const count = entries.length;
    if (!ui_overlay.confirmExplicitActionTwice(
        `删除角色档案「${name}」？`,
        `将从“心跳回忆 · 档案室”移除这个角色的头像、角色档案入口、其下 ${count} 个聊天档案索引及相应的 Heartbeat 本机独立备份。不会删除、清空、重命名或改写任何 SillyTavern 正文聊天窗口；聊天正文会完整保留。删除后，“扫描旧版本已有档案”也不会自动把这个角色重新加入档案室。`,
        { destructive: true },
    )) return null;

    const avatars = [meta?.avatar, ...entries.map(item => core_context.archiveStoredAvatar(item))].filter(Boolean);
    const characterKeys = entries.map(item => item.characterKey).filter(Boolean);
    const sourceIdentityKeys = entries.flatMap(item => [core_context.archiveSourceIdentityKey(item), deletedArchiveFallbackIdentityKey(item)]).filter(Boolean);
    if (meta?.characterFingerprint) sourceIdentityKeys.push(`fingerprint:${core_text.normalizeText(meta.characterFingerprint, 160)}`);
    const metaFallbackIdentity = deletedArchiveFallbackIdentityKey({ avatar: meta?.avatar, characterKey: meta?.avatar, characterName: meta?.characterName || name });
    if (metaFallbackIdentity) sourceIdentityKeys.push(metaFallbackIdentity);
    const tombstone = normalizeDeletedArchiveCharacter({
        groupId: id,
        characterName: name,
        avatars,
        characterKeys,
        sourceIdentityKeys,
        deletedAt: Date.now(),
    });

    // This is an explicit double-confirmed Heartbeat deletion, so a supposedly deleted archive
    // must not remain recoverable from the independent store. Abort before changing the index if
    // the backup transaction cannot complete.
    if (entries.length) await archive_backupStore.deleteArchiveBackup(entries);

    for (const entry of entries) runtimeState.archiveSnapshotCache.delete(archive_library.archiveSnapshotCacheKey(entry));
    setArchiveIndex(context, getArchiveIndex(context).filter(item => archiveGroupKeyForEntry(item) !== id));
    setArchiveGroups(context, groups.filter(item => item.id !== id));
    const profileKey = `group:${id}`;
    if (context.extensionSettings && typeof context.extensionSettings === 'object') {
        const rawProfiles = Array.isArray(context.extensionSettings?.[core_constants.ARCHIVE_CHARACTER_PROFILES_SETTINGS_KEY])
            ? context.extensionSettings[core_constants.ARCHIVE_CHARACTER_PROFILES_SETTINGS_KEY]
            : [];
        context.extensionSettings[core_constants.ARCHIVE_CHARACTER_PROFILES_SETTINGS_KEY] = rawProfiles.filter(item => core_text.normalizeText(item?.key, 160) !== profileKey);
    }
    if (tombstone) setDeletedArchiveCharacters(context, [...getDeletedArchiveCharacters(context), tombstone]);

    const visitState = getAvatarVisitState(context);
    for (const key of [id, ...characterKeys, ...avatars]) {
        const normalized = avatarVisitKey(key);
        if (normalized) delete visitState[normalized];
    }
    context.extensionSettings[core_constants.AVATAR_VISIT_SETTINGS_KEY] = visitState;
    context.saveSettingsDebounced?.();

    runtimeState.avatarDialogueRequestEpoch += 1;
    runtimeState.activeAvatarDialogue = null;
    if (runtimeState.archiveLibraryCharacterKey === id) runtimeState.archiveLibraryCharacterKey = '';
    if (runtimeState.activeArchiveSnapshot && archiveGroupKeyForEntry(runtimeState.activeArchiveSnapshot) === id) runtimeState.activeArchiveSnapshot = null;
    runtimeState.activeArchiveReadOnly = true;
    runtimeState.activeMode = null;
    runtimeState.activeSession = null;
    return { groupId: id, name, count };
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
        '删除心跳回忆自己的 MEMORY_KEY、已生成派生缓存（相簿 / ADV EVENT / 房间 / ENDING / HEART 等）和对应的本机独立备份；不会删除、清空或改写 SillyTavern 聊天正文。删除后如需恢复心跳回忆内容，需要重新建档/生成。',
        { destructive: true },
    )) return false;
    if (!ui_overlay.confirmExplicitAction(
        '最后确认：永久删除这份心跳回忆档案？',
        '请确认你已经选对当前聊天。聊天正文会保留，但心跳回忆档案、派生缓存及 Heartbeat 本机独立备份会被移除。',
        { destructive: true },
    )) return false;

    let live = core_context.currentCharacterGuard();
    if (core_context.comparableChatId(core_context.getChatId(live)) !== expectedChatId || core_context.currentCharacterRuntimeKey(live) !== expectedCharacterKey) {
        throw new Error('确认期间当前角色或聊天已经变化，本次删除已取消。');
    }
    const backupEntry = indexed || core_cache.archiveBackupEntryForContext(live, memory);
    await archive_backupStore.deleteArchiveBackup(backupEntry);
    // IndexedDB is asynchronous. Re-acquire and recheck the exact live scope before touching chat
    // metadata so a user navigation during the transaction cannot retarget the deletion.
    live = core_context.currentCharacterGuard();
    if (core_context.comparableChatId(core_context.getChatId(live)) !== expectedChatId || core_context.currentCharacterRuntimeKey(live) !== expectedCharacterKey) {
        throw new Error('删除独立备份期间当前角色或聊天已经变化；源聊天 metadata 未修改。');
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
    if (!ui_overlay.confirmExplicitActionTwice(
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
    if (isCurrentCharacterDeletedFromLibrary(context, memoryBank)) return;
    const chatId = core_context.comparableChatId(memoryBank.chatId || core_context.getChatId(context));
    if (!chatId) return;
    const characterName = core_text.normalizeText(memoryBank.characterName || context.name2, 120) || '未命名角色';
    const existingIndex = getArchiveIndex(context);
    const descriptor = characterDescriptor(context, Number(context.characterId));
    const existing = existingIndex.find(old => old.chatId === chatId
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
    if (isArchiveEntryDeletedFromLibrary(item, context)) return;
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
