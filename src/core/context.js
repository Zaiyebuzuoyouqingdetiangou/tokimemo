// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_groups from '../archive/groups.js';
import * as core_constants from './constants.js';
import * as core_evidence from './evidence.js';
import * as core_text from './text.js';

export function getContext() {
    const context = globalThis.SillyTavern?.getContext?.();
    if (!context) throw new Error('未检测到 SillyTavern 扩展上下文。');
    return context;
}

export function currentCharacterGuard() {
    const context = getContext();
    if (context.groupId) {
        throw new Error('“心跳回忆”当前只支持单角色聊天，请打开一个角色对话后再使用。');
    }
    if (context.characterId === undefined || context.characterId === null) {
        throw new Error('请先打开一个角色聊天。');
    }
    return context;
}

export function getChatId(context = getContext()) {
    try {
        const id = context.getCurrentChatId?.() ?? context.chatId;
        return core_text.normalizeText(id, 240);
    } catch {
        return core_text.normalizeText(context.chatId, 240);
    }
}

export function yieldToUi() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

export async function buildChatSnapshot(context = currentCharacterGuard(), options = {}) {
    const rawChat = Array.isArray(context.chat) ? context.chat : [];
    const usable = [];
    const prefixCount = Math.max(0, Math.floor(Number(options.prefixCount) || 0));
    let fingerprint = 2166136261;
    let prefixFingerprint = 2166136261;
    const mix = (state, value) => {
        let next = state >>> 0;
        for (const ch of String(value ?? '')) {
            next ^= ch.codePointAt(0);
            next = Math.imul(next, 16777619);
        }
        return next >>> 0;
    };
    const chatId = getChatId(context);
    fingerprint = mix(fingerprint, chatId);
    prefixFingerprint = mix(prefixFingerprint, chatId);
    for (let index = 0; index < rawChat.length; index += 1) {
        const message = rawChat[index];
        const text = core_text.normalizeText(message?.mes, 8000);
        if (text && !message?.is_system) {
            const isUser = message?.is_user === true;
            const item = {
                index: index + 1,
                role: isUser ? 'user' : 'char',
                name: core_text.normalizeText(message?.name || (isUser ? context.name1 : context.name2), 120),
                date: core_text.normalizeText(message?.send_date || message?.date || '', 80),
                text,
            };
            usable.push(item);
            const signature = `${item.index}|${item.role}|${item.date}|${item.text}`;
            fingerprint = mix(fingerprint, signature);
            if (usable.length <= prefixCount) prefixFingerprint = mix(prefixFingerprint, signature);
        }
        if (index && index % 60 === 0) await yieldToUi();
    }
    const totalMessages = usable.length;
    fingerprint = mix(fingerprint, String(totalMessages));
    if (prefixCount > 0) prefixFingerprint = mix(prefixFingerprint, String(Math.min(prefixCount, totalMessages)));

    const capMessages = source => {
        const cappedByCount = source.length > core_constants.MAX_IMPORT_MESSAGES ? core_evidence.evenlySample(source, core_constants.MAX_IMPORT_MESSAGES) : source;
        let selected = cappedByCount;
        let selectedChars = selected.reduce((sum, item) => sum + item.text.length + item.name.length + item.date.length + 32, 0);
        if (selectedChars > core_constants.MAX_IMPORT_TOTAL_CHARS) {
            const ratio = core_constants.MAX_IMPORT_TOTAL_CHARS / Math.max(1, selectedChars);
            const limit = Math.max(64, Math.floor(selected.length * ratio));
            selected = core_evidence.evenlySample(selected, limit);
            selectedChars = selected.reduce((sum, item) => sum + item.text.length + item.name.length + item.date.length + 32, 0);
        }
        return { selected, selectedChars, truncated: source.length > selected.length };
    };

    const full = capMessages(usable);
    const incrementalRaw = prefixCount > 0 && totalMessages >= prefixCount ? usable.slice(prefixCount) : usable;
    const incremental = capMessages(incrementalRaw);
    return {
        chatId,
        totalMessages,
        usedMessages: full.selected.length,
        usedChars: full.selectedChars,
        truncated: full.truncated,
        coverageMode: full.truncated ? 'evenly-sampled-full-window' : 'full-window',
        messages: full.selected,
        fingerprint: String(fingerprint >>> 0),
        prefixCount,
        prefixFingerprint: prefixCount > 0 && totalMessages >= prefixCount ? String(prefixFingerprint >>> 0) : '',
        incrementalMessages: incremental.selected,
        incrementalUsedMessages: incremental.selected.length,
        incrementalUsedChars: incremental.selectedChars,
        incrementalTruncated: incremental.truncated,
    };
}

export function comparableChatId(value) {
    return core_text.normalizeText(value, 260).replace(/\.jsonl$/i, '').trim();
}

export function contextCharacterAvatar(context = getContext(), preferredName = '') {
    const characters = Array.isArray(context?.characters) ? context.characters : [];
    const id = context?.characterId;
    const requestedName = core_text.normalizeText(preferredName, 120);
    const currentName = core_text.normalizeText(context?.name2, 120);
    const preferred = requestedName || currentName;
    const direct = id !== undefined && id !== null ? characters[id] : null;
    const candidates = [];
    if (requestedName) {
        const byName = characters.find(item => core_text.normalizeText(item?.name || item?.data?.name, 120) === requestedName);
        if (byName) candidates.push(byName);
        const directName = core_text.normalizeText(direct?.name || direct?.data?.name, 120);
        if (direct && directName === requestedName && direct !== byName) candidates.push(direct);
    } else {
        if (direct) candidates.push(direct);
        if (preferred) {
            const byName = characters.find(item => core_text.normalizeText(item?.name || item?.data?.name, 120) === preferred);
            if (byName && byName !== direct) candidates.push(byName);
        }
    }
    for (const item of candidates) {
        const avatar = core_text.normalizeText(item?.avatar || item?.data?.avatar, 300);
        if (avatar) return avatar;
    }
    return '';
}

export function archiveEntryAvatarName(entry, context = getContext()) {
    const stored = core_text.normalizeText(entry?.avatar, 300);
    if (stored) return stored;
    const key = core_text.normalizeText(entry?.characterKey, 300);
    if (key && !key.startsWith('character:')) return key;
    return contextCharacterAvatar(context, core_text.normalizeText(entry?.characterName, 120));
}

export function archiveCanonicalCharacterKey(entry, context = getContext()) {
    return archiveEntryAvatarName(entry, context) || core_text.normalizeText(entry?.characterKey, 300);
}

export function stableArchiveHash(value) {
    const text = String(value ?? '');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

export function archiveStoredAvatar(entry) {
    const avatar = core_text.normalizeText(entry?.avatar, 300);
    if (avatar) return avatar;
    const key = core_text.normalizeText(entry?.characterKey, 300);
    return key && !key.startsWith('character:') ? key : '';
}

export function archiveSourceIdentityKey(entry) {
    const fingerprint = core_text.normalizeText(entry?.characterFingerprint, 160);
    if (fingerprint) return `fingerprint:${fingerprint}`;
    const avatar = archiveStoredAvatar(entry);
    const name = core_text.normalizeText(entry?.characterName, 120).toLocaleLowerCase();
    const fallback = core_text.normalizeText(entry?.characterKey, 300);
    return `${avatar || fallback}\u001f${name}`;
}

export function archiveAutoGroupId(entry) {
    return `auto:${stableArchiveHash(archiveSourceIdentityKey(entry))}`;
}

export function archiveLegacyScanKey(entry) {
    const avatar = archiveStoredAvatar(entry) || core_text.normalizeText(entry?.characterKey, 300);
    const name = core_text.normalizeText(entry?.characterName, 120).toLocaleLowerCase();
    return `${avatar}\u001f${name}\u001f${comparableChatId(entry?.chatId)}`;
}

export function archiveIndexEntryId(entry) {
    const existing = core_text.normalizeText(entry?.entryId, 120);
    if (existing) return existing;
    return `AE:${stableArchiveHash(`${archiveSourceIdentityKey(entry)}\u001f${comparableChatId(entry?.chatId)}`)}`;
}

export function archiveEntryMatchesContextCharacter(entry, context = getContext()) {
    if (!entry || !context) return false;
    const entryName = core_text.normalizeText(entry?.characterName, 120);
    const descriptor = archive_groups.characterDescriptor(context, Number(context?.characterId));
    const currentName = core_text.normalizeText(context?.name2 || descriptor?.name, 120);
    const entryAvatar = archiveStoredAvatar(entry);
    const currentAvatar = core_text.normalizeText(context?.characters?.[context?.characterId]?.avatar || context?.characters?.[context?.characterId]?.data?.avatar, 300);
    // characterFingerprint is presentation/classification metadata only. It must never grant or
    // revoke write authority because ordinary card edits can legitimately change the fingerprint.
    // Live write authority remains the actual host character locator/name + chatId + live MEMORY_KEY.
    if (entryName && entryName !== '未命名角色' && currentName && entryName !== currentName) return false;
    if (entryAvatar && currentAvatar && entryAvatar !== currentAvatar) return false;
    if (entryName || entryAvatar) return true;
    return core_text.normalizeText(entry?.characterKey, 300) === `character:${String(context?.characterId ?? '')}`;
}

export function currentCharacterKey(context = currentCharacterGuard()) {
    const avatar = core_text.normalizeText(context.characters?.[context.characterId]?.avatar || context.characters?.[context.characterId]?.data?.avatar, 300);
    return avatar || `character:${String(context.characterId ?? '')}`;
}

export function currentCharacterRuntimeKey(context = currentCharacterGuard()) {
    const descriptor = archive_groups.characterDescriptor(context, Number(context.characterId));
    return descriptor?.fingerprint || `${currentCharacterKey(context)}\u001f${core_text.normalizeText(context.name2, 120)}`;
}

export function chatScopeKey(context = currentCharacterGuard(), chatId = getChatId(context)) {
    return `${currentCharacterRuntimeKey(context)}|${comparableChatId(chatId)}`;
}

export function captureTaskOrigin(context = currentCharacterGuard(), archiveRevision = '') {
    return {
        characterKey: currentCharacterRuntimeKey(context),
        characterName: core_text.normalizeText(context.name2, 120),
        chatId: comparableChatId(getChatId(context)),
        archiveRevision: core_text.normalizeText(archiveRevision, 240),
    };
}

export function isCurrentTaskOrigin(origin, context = getContext()) {
    try {
        return !!origin && currentCharacterRuntimeKey(context) === origin.characterKey && comparableChatId(getChatId(context)) === origin.chatId;
    } catch {
        return false;
    }
}
