import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import { state as runtimeState } from '../core/state.js';
import * as core_taskTrace from '../core/taskTrace.js';
import * as core_backupDiagnostics from '../core/backupDiagnostics.js';
import * as core_text from '../core/text.js';
import * as sourceGuard from './sourceReadGuard.js';
// 档案基础：schema 版本与迁移、读取正式档案、删除栅栏、安全取值、预检、取消判断、任务追踪收尾
// 从 archive/repository.js 原样搬出（重构阶段 2），声明文本一字未改；archive/repository.js 仍转发原有导出。

export function archiveSchemaVersion(memory) {
    const version = Number(memory?.version);
    return Number.isFinite(version) && version > 0 ? version : 0;
}

export function isCompatibleArchive(memory) {
    if (!memory || typeof memory !== 'object' || !Array.isArray(memory.memories)) return false;
    const version = archiveSchemaVersion(memory);
    return version >= core_constants.MIN_SUPPORTED_ARCHIVE_SCHEMA_VERSION && version <= core_constants.ARCHIVE_SCHEMA_VERSION;
}

export function migrateArchiveInMemory(memory) {
    if (!isCompatibleArchive(memory)) return null;
    if (archiveSchemaVersion(memory) === core_constants.ARCHIVE_SCHEMA_VERSION) return memory;
    // Supported older schemas may be migrated in memory in future releases. Persisting an
    // upgraded schema only happens on an explicit archive save/update, never merely because
    // the extension release version changed.
    return { ...memory, version: core_constants.ARCHIVE_SCHEMA_VERSION };
}

export function getImportedMemory(context = core_context.getContext()) {
    const memory = migrateArchiveInMemory(context.chatMetadata?.[core_constants.MEMORY_KEY]);
    if (!memory) return null;
    if (!core_context.comparableChatId(memory.chatId)
        || core_context.comparableChatId(memory.chatId) !== core_context.comparableChatId(core_context.getChatId(context))) return null;
    if (runtimeState.archiveDeletionFences.has(archiveDeletionFenceKey(context, memory))) return null;
    return memory;
}

export function archiveDeletionFenceKey(context, memory, explicitEntryId = '') {
    const chatId = core_context.comparableChatId(memory?.chatId || core_context.getChatId(context));
    const revision = core_text.normalizeText(memory?.archiveRevision, 240);
    let entryId = core_text.normalizeText(explicitEntryId || context?.__rmtArchiveTargetEntryId, 120);
    if (!entryId && chatId) {
        const memoryName = core_text.normalizeText(memory?.characterName, 120);
        const currentHint = Number.isInteger(Number(context?.characterId)) ? Number(context.characterId) : -1;
        const currentAvatar = currentHint >= 0 ? core_text.normalizeText(
            context?.characters?.[currentHint]?.avatar || context?.characters?.[currentHint]?.data?.avatar,
            300,
        ) : '';
        const rows = Array.isArray(context?.extensionSettings?.[core_constants.ARCHIVE_INDEX_SETTINGS_KEY])
            ? context.extensionSettings[core_constants.ARCHIVE_INDEX_SETTINGS_KEY]
            : [];
        const matches = rows.filter(item => core_context.comparableChatId(item?.chatId) === chatId
            && (!memoryName || core_text.normalizeText(item?.characterName, 120) === memoryName)
            && (currentHint < 0 || Number(item?.characterIndexHint) === currentHint)
            && (!currentAvatar || core_context.archiveStoredAvatar(item) === currentAvatar));
        if (matches.length === 1) entryId = core_context.archiveIndexEntryId(matches[0]);
    }
    if (!entryId) {
        const characterName = core_text.normalizeText(memory?.characterName || context?.name2, 120);
        const avatar = core_context.currentCharacterAvatar(context);
        const characterIndexHint = Number.isInteger(Number(context?.characterId)) ? Number(context.characterId) : -1;
        entryId = core_context.archiveIndexEntryId({ characterKey: `${avatar || characterName}|slot:${characterIndexHint}`, avatar, characterName, characterIndexHint, chatId });
    }
    return `${entryId}|${chatId}|${revision}`;
}

export function safeOwnDataValue(object, key) {
    if (!object || (typeof object !== 'object' && typeof object !== 'function')) return undefined;
    try {
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
    } catch {
        return undefined;
    }
}

export function safeOwnDataEntries(object) {
    if (!object || typeof object !== 'object') return [];
    try {
        return Object.entries(Object.getOwnPropertyDescriptors(object))
            .filter(([, descriptor]) => Object.prototype.hasOwnProperty.call(descriptor, 'value'))
            .map(([key, descriptor]) => [key, descriptor.value]);
    } catch {
        return [];
    }
}

export function safeNestedDataValue(object, path) {
    let current = object;
    for (const key of path) {
        current = safeOwnDataValue(current, key);
        if (current == null) return current;
    }
    return current;
}

export function getMemoryPreflight(context = core_context.currentCharacterGuard()) {
    const chatId = core_context.comparableChatId(core_context.getChatId(context));
    const preflight = runtimeState.memoryPreflightCache.get(core_context.chatScopeKey(context, chatId)) || null;
    return preflight && core_context.comparableChatId(preflight.chatId) === chatId
        && (!preflight.sourceSignature || preflight.sourceSignature === sourceGuard.sourceReadSignature(context)) ? preflight : null;
}

export function clearMemoryPreflight(context = core_context.currentCharacterGuard(), chatId = core_context.getChatId(context)) {
    runtimeState.memoryPreflightCache.delete(core_context.chatScopeKey(context, chatId));
}

export function finishArchiveTaskTrace(taskTrace, result) {
    const status = result?.status;
    const outcome = status === 'committed' ? 'ok'
        : ['cancelled', 'deferred', 'blocked', 'noop'].includes(status) ? status : 'failed';
    core_taskTrace.endTaskTrace(taskTrace, outcome);
}

export function isArchiveCancellation(error) {
    return error?.name === 'AbortError' && !core_backupDiagnostics.backupFailureDiagnostic(error);
}
