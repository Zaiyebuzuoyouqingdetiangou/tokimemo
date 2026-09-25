import * as archive_backupStore from '../archive/backupStore.js';
import * as archive_repository from '../archive/repository.js';
import * as core_constants from './constants.js';
import * as core_context from './context.js';
import { state as runtimeState } from './state.js';
import * as core_text from './text.js';
import * as generation_recovery from '../generation/recovery.js';
import * as participant_contract from './participants.js';
import { ARCHIVE_VERSIONS_CACHE_KEY, GENERATION_DRAFTS_CACHE_KEY, PARTICIPANT_REPLACEMENT_KEY, VERSION_PAGE_MODES, archiveBackupEntryForContext, archiveVersionSummary, archiveVersions, cacheScopeFromContext, clearRecoveryInCache, cloneCacheValue, generationDraftRecords, getCache, hydrateBackupCacheValue, participantConflict, participantOriginChanged, participantRoster, recoveryPageForVersion, rememberRuntimeSessionCache, retainLegacyGenerationDraft, saveMetadataDurably, serializeArchiveCommitOperation, serializeCacheScopeOperation } from './cacheRecords.js';
import { commitArchiveCacheMutation } from './cacheCommit.js';
// 档案版本：版本列表与读取、保存版本、版本替换校验
// 从 core/cache.js 原样搬出（重构阶段 2），声明文本一字未改；core/cache.js 仍转发原有导出。

export async function currentArchiveVersionState(context) {
    const memory = archive_repository.requireArchive(context);
    const entry = context?.__rmtArchiveTargetEntryId
        ? { ...archiveBackupEntryForContext(context, memory), entryId: context.__rmtArchiveTargetEntryId }
        : archiveBackupEntryForContext(context, memory);
    const state = await archive_backupStore.readArchiveBackupState(entry);
    if (state.deleted || !state.record || state.record.archiveRevision !== memory.archiveRevision) {
        throw core_text.safeUserError('当前档案已变化，无法读取这份旧版本。', 'RMT_RECOVERY_ORIGIN_CHANGED');
    }
    return { entry, memory: cloneCacheValue(state.record.memory),
        cache: await hydrateBackupCacheValue(state.record.cache, memory.chatId, memory.archiveRevision) || {} };
}

export async function listArchiveVersions(context = core_context.getContext()) {
    if (!archive_repository.getImportedMemory(context)) return [];
    return archiveVersions((await currentArchiveVersionState(context)).cache).map(archiveVersionSummary);
}

export async function readArchiveVersion(context, versionId) {
    const current = await currentArchiveVersionState(context);
    const record = archiveVersions(current.cache).find(item => item.versionId === versionId);
    if (!record) throw core_text.safeUserError('找不到已保存的旧版本，当前内容没有被覆盖。', 'RMT_ARCHIVE_VERSION_MISSING');
    return cloneCacheValue(record);
}

// A version is committed before a replacement request. Its drafts are a separate,
// immutable record, not a recovery journal that later success can clear.
export async function saveArchiveVersion(context, { reason = '', selectedPages = [], expectedRosterRevision,
    parkDrafts = false } = {}) {
    if (!Array.isArray(selectedPages) || selectedPages.some(page => !Object.hasOwn(VERSION_PAGE_MODES, page))) {
        throw new TypeError('旧版本保存需要明确的页面范围。');
    }
    const pages = [...new Set(selectedPages)];
    const memory = cloneCacheValue(archive_repository.requireArchive(context));
    const entry = archiveBackupEntryForContext(context, memory);
    const scope = cacheScopeFromContext(context), epoch = runtimeState.runtimeLifecycleEpoch;
    const current = () => {
        try { const live = core_context.currentCharacterGuard(); return !context?.__rmtArchiveTargetEntryId
            && epoch === runtimeState.runtimeLifecycleEpoch && cacheScopeFromContext(live) === scope
            && archive_repository.requireArchive(live).archiveRevision === memory.archiveRevision; } catch { return false; }
    };
    const versionId = globalThis.crypto?.randomUUID?.() || `version-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return serializeArchiveCommitOperation(entry, memory, () => serializeCacheScopeOperation(scope, async () => {
        if (!current()) throw participantOriginChanged();
        let saved;
        const committed = await commitArchiveCacheMutation(entry, memory, getCache(context), (value, canonicalMemory) => {
            const roster = participantRoster(value[participant_contract.PARTICIPANTS_KEY]) || participantRoster(canonicalMemory[participant_contract.PARTICIPANTS_KEY]);
            if (expectedRosterRevision !== undefined && (roster?.revision || '') !== expectedRosterRevision) throw participantConflict();
            const oldCache = cloneCacheValue(value);
            delete oldCache[ARCHIVE_VERSIONS_CACHE_KEY];
            const drafts = { modules: cloneCacheValue(oldCache[generation_recovery.GENERATION_RECOVERY_CACHE_KEY] || {}),
                phone: oldCache[core_constants.PHONE_DRAFT_CACHE_KEY] ? cloneCacheValue(oldCache[core_constants.PHONE_DRAFT_CACHE_KEY]) : null,
                ...(oldCache[GENERATION_DRAFTS_CACHE_KEY] ? { tasks: Object.fromEntries(Object.entries(generationDraftRecords(oldCache))
                    .filter(([, record]) => record.status === 'open').map(([id, record]) => [id, cloneCacheValue(record.journal)])) } : {}) };
            delete oldCache[generation_recovery.GENERATION_RECOVERY_CACHE_KEY];
            delete oldCache[core_constants.PHONE_DRAFT_CACHE_KEY];
            delete oldCache[GENERATION_DRAFTS_CACHE_KEY];
            saved = { version: 1, versionId, createdAt: Date.now(), reason: String(reason), selectedPages: pages,
                entryId: core_context.archiveIndexEntryId(entry), chatId: memory.chatId, archiveRevision: memory.archiveRevision,
                entry: cloneCacheValue(entry), memory: cloneCacheValue(canonicalMemory), cache: oldCache, roster: cloneCacheValue(roster), drafts };
            value[ARCHIVE_VERSIONS_CACHE_KEY] = [...archiveVersions(value), saved];
            if (parkDrafts) {
                for (const mode of new Set(pages.map(page => VERSION_PAGE_MODES[page]).filter(Boolean))) {
                    const operation = drafts.modules[mode]?.operation;
                    const page = recoveryPageForVersion(mode, operation);
                    if (!operation || pages.includes(page)) {
                        retainLegacyGenerationDraft(value, mode);
                        clearRecoveryInCache(value, mode);
                    }
                }
                if (pages.includes('phone')) delete value[core_constants.PHONE_DRAFT_CACHE_KEY];
            }
        }, current, { requireExisting: true, archiveVersionMutation: true, preserveCanonicalMemory: true, generationDraftMutation: parkDrafts });
        if (!current()) throw participantOriginChanged();
        const live = core_context.currentCharacterGuard();
        rememberRuntimeSessionCache(scope, committed.cache);
        live.chatMetadata[core_constants.CACHE_KEY] = cloneCacheValue(committed.stored);
        try { await saveMetadataDurably(live); } catch (error) {
            console.warn('[HeartbeatMemories] version metadata mirror failed', core_text.safeErrorDiagnostic(error));
        }
        return archiveVersionSummary(saved);
    }));
}

function replacementPageValue(session, page) {
    if (!session) return null;
    if (page === 'roomLife') return { lifePlan: session.lifePlan || null, lifePlanAttempt: session.lifePlanAttempt || null };
    if (['spring', 'summer', 'autumn', 'winter', 'postending', 'seasons'].includes(page)) {
        const matches = value => page === 'seasons' ? value !== 'postending' : value === page;
        return { voiceDramas: (session.voiceDramas || []).filter(item => matches(item.kind)),
            scenarioDramas: (session.scenarioDramas || []).filter(item => matches(item.season)) };
    }
    if (page === 'strips') return session.dailyStrips || [];
    if (page === 'fireflies') return session.fireflyVoices || [];
    if (page === 'language') return Object.fromEntries(['greetings', 'specialDays', 'birthdayMmDd', 'userBirthdayMmDd',
        'relationshipState', 'relationshipSummary', 'relationshipSourceMemoryIds', 'relationshipSourceMemoryAnchor']
        .map(key => [key, session[key] ?? null]));
    const value = cloneCacheValue(session);
    for (const key of [core_constants.SESSION_MODE_WRITE_FENCE_KEY, PARTICIPANT_REPLACEMENT_KEY, 'generationMeta',
        'view', 'page', 'paragraphIndex', 'dialogueIndex', 'confessionLineIndex', 'presenceIndex',
        ...Object.keys(value).filter(key => key.startsWith('selected'))]) delete value[key];
    if (page === 'room') { delete value.lifePlan; delete value.lifePlanAttempt; }
    return value;
}

export function assertReplacementInCache(cache, memory, ticket, mode, replaySession = null) {
    if (!ticket || typeof ticket.versionId !== 'string' || typeof ticket.pageId !== 'string'
        || !Object.hasOwn(VERSION_PAGE_MODES, ticket.pageId) || VERSION_PAGE_MODES[ticket.pageId] !== mode) {
        throw core_text.safeUserError('重新生成缺少已保存旧版本和明确页面范围，当前内容保留。', 'RMT_ARCHIVE_VERSION_REQUIRED');
    }
    const version = archiveVersions(cache).find(item => item.versionId === ticket.versionId);
    if (!version || version.archiveRevision !== memory.archiveRevision
        || core_context.comparableChatId(version.chatId) !== core_context.comparableChatId(memory.chatId)
        || !version.selectedPages.includes(ticket.pageId)) {
        throw core_text.safeUserError('旧版本不属于本次档案或所选页面，当前内容保留。', 'RMT_ARCHIVE_VERSION_REQUIRED');
    }
    const previous = mode ? replacementPageValue(version.cache[mode], ticket.pageId)
        : [version.memory.archiveName, version.memory.archiveVerdict, version.memory.archiveCoverUpdatedAt];
    const latest = mode ? replacementPageValue(cache[mode], ticket.pageId)
        : [memory.archiveName, memory.archiveVerdict, memory.archiveCoverUpdatedAt];
    // A durable commit can precede mirror/deferred acknowledgement. Replaying
    // exactly that accepted result is safe; any different later content is not.
    const exactReplay = mode && replaySession
        && JSON.stringify(replacementPageValue(replaySession, ticket.pageId)) === JSON.stringify(latest);
    if (JSON.stringify(previous) !== JSON.stringify(latest) && !exactReplay) {
        throw core_text.safeUserError('所选页面在保存旧版本后已被更新，请重新选择；较新的内容保留。', 'RMT_RECOVERY_TARGET_CHANGED');
    }
    return { versionId: ticket.versionId, pageId: ticket.pageId };
}

export async function assertArchiveVersionReplacement(context, ticket, mode = VERSION_PAGE_MODES[ticket?.pageId]) {
    const current = await currentArchiveVersionState(context);
    return assertReplacementInCache(current.cache, current.memory, ticket, mode);
}
