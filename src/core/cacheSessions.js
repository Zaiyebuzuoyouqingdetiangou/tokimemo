import * as archive_repository from '../archive/repository.js';
import * as archive_snapshots from '../archive/snapshots.js';
import * as core_constants from './constants.js';
import * as core_heartLanguage from './heartLanguage.js';
import * as song_contract from './themeSongContract.js';
import * as bedtime_contract from './bedtimeContract.js';
import * as core_context from './context.js';
import * as core_requestCoordinator from './requestCoordinator.js';
import { state as runtimeState } from './state.js';
import * as core_text from './text.js';
import * as modes_calendar from '../modes/calendar.js';
import * as modes_phone from '../modes/phone.js';
import * as modes_inbox from '../modes/inbox.js';
import * as modes_pastLives from '../modes/pastLives.js';
import * as modes_timeStories from '../modes/timeStories.js';
import * as modes_themeSong from '../modes/themeSong.js';
import * as modes_bedtime from '../modes/bedtime.js';
import * as time_stories from './timeStoriesContract.js';
import { PARTICIPANT_REPLACEMENT_KEY, archiveBackupEntryForContext, assertModeWriteFence, cacheCommitToken, cacheScopeFromContext, clearCompletedRecovery, cloneCacheValue, ensureCacheHydrated, generationDraftRecords, getCache, isCompressedCacheRecord, rememberRuntimeSessionCache, saveMetadataDurably, serializeArchiveCommitOperation, serializeCacheScopeOperation, stampCacheCommit } from './cacheRecords.js';
import { commitArchiveCacheMutation, persistCompressedCacheNow, scheduleCompressedCachePersist, shouldWriteUncompressedCacheImmediately } from './cacheCommit.js';
import { assertReplacementInCache } from './cacheVersions.js';
import { generationPageReadingSource, loadReadableGenerationProgress, preserveLifeFromPartialRoom, preserveProgressLocalState, saveGenerationProgressReadingState } from './cacheGenerationDrafts.js';
// 会话：保存 / 提交 / 读取各模式会话，旧出行会话迁移
// 从 core/cache.js 原样搬出（重构阶段 2），声明文本一字未改；core/cache.js 仍转发原有导出。

export function migrateLegacyTravelSession(session) {
    if (!session || session.kind !== core_constants.MODE.TRAVEL) return session;
    const storedVersion = Number(session.travelVersion);
    if (Number.isFinite(storedVersion) && storedVersion >= core_constants.TRAVEL_SESSION_VERSION) return session;
    const migrated = cloneCacheValue(session);
    migrated.locations = (Array.isArray(migrated.locations) ? migrated.locations : []).map(item => ({
        ...item,
        // r48 and older accepted model-authored dialogue/postcard prose. Keep it readable for
        // existing users, but never let an incremental prompt treat that prose as verified fact.
        legacyEvidenceUnverified: true,
        contentMode: 'legacy-free-text',
        keepsake: item?.keepsake
            ? { ...item.keepsake, legacyEvidenceUnverified: true, contentMode: 'legacy-free-text' }
            : item?.keepsake,
    }));
    migrated.travelVersion = core_constants.TRAVEL_SESSION_VERSION;
    return migrated;
}

export function saveSession(mode, session, expectedChatId = core_text.normalizeText(session?.chatId, 240), expectedTaskOrigin = null) {
    if (session?.readableProgress?.version === 1 && session.readableProgress.complete === false) {
        const context = core_context.getContext();
        if (core_context.getChatId(context) !== expectedChatId || (expectedTaskOrigin && !core_context.deferredCommitOriginMatchesContext(expectedTaskOrigin, context))) return false;
        void saveGenerationProgressReadingState(context, session).catch(() => {});
        return true;
    }
    try {
        const context = core_context.currentCharacterGuard();
        if (expectedTaskOrigin && !core_context.deferredCommitOriginMatchesContext(expectedTaskOrigin, context)) {
            console.warn('[HeartbeatMemories] discarded cache save for stale character origin', { mode, expectedChatId });
            return false;
        }
        const currentChatId = core_context.getChatId(context);
        if (!expectedChatId || currentChatId !== expectedChatId) {
            console.warn('[HeartbeatMemories] discarded cache save for stale chat', { mode, expectedChatId, currentChatId });
            return false;
        }
        if (!context.chatMetadata || typeof context.chatMetadata !== 'object') return false;
        const memoryBank = archive_repository.requireArchive(context);
        if (core_text.normalizeText(session?.archiveRevision, 240) && session.archiveRevision !== memoryBank.archiveRevision) return false;
        const scope = cacheScopeFromContext(context);
        const stored = context.chatMetadata?.[core_constants.CACHE_KEY];
        if (isCompressedCacheRecord(stored) && !runtimeState.runtimeSessionCache.has(scope)) {
            console.warn('[HeartbeatMemories] cache save postponed until compressed cache is hydrated', { mode, expectedChatId });
            void ensureCacheHydrated(context).then(() => archive_snapshots.scheduleChooserRefresh(0)).catch(() => {});
            return false;
        }
        const cache = cloneCacheValue(getCache(context));
        const fence = assertModeWriteFence(cache, mode, expectedTaskOrigin, session);
        const stagedSession = cloneCacheValue(session);
        stagedSession.chatId = expectedChatId;
        stagedSession.archiveRevision = memoryBank.archiveRevision;
        stagedSession[core_constants.SESSION_MODE_WRITE_FENCE_KEY] = fence;
        cache[mode] = stagedSession;
        if (mode === core_constants.MODE.PHONE) delete cache[core_constants.PHONE_DRAFT_CACHE_KEY];
        cache.chatId = expectedChatId;
        cache.archiveRevision = memoryBank.archiveRevision;
        stampCacheCommit(cache, scope);
        rememberRuntimeSessionCache(scope, cache);
        scheduleCompressedCachePersist(context, cache, shouldWriteUncompressedCacheImmediately(stored) ? 0 : 250);
        return true;
    } catch (error) {
        console.warn('[HeartbeatMemories] cache save failed', core_text.safeErrorDiagnostic(error));
        return false;
    }
}

export async function commitSessionMutation(mode, expectedChatId, expectedTaskOrigin, mutateSession, fallbackSession = null, options = {}) {
    const mutationLifecycle = runtimeState.runtimeLifecycleEpoch;
    if (typeof mutateSession !== 'function') return null;
    let context;
    try { context = core_context.currentCharacterGuard(); } catch { return null; }
    if (expectedTaskOrigin && !core_context.deferredCommitOriginMatchesContext(expectedTaskOrigin, context)) return null;
    const currentChatId = core_context.getChatId(context);
    if (!expectedChatId || currentChatId !== expectedChatId) return null;
    try { await ensureCacheHydrated(context); } catch { return null; }
    const scope = cacheScopeFromContext(context);
    let initialMemory;
    try { initialMemory = archive_repository.requireArchive(context); } catch { return null; }
    const entry = archiveBackupEntryForContext(context, initialMemory, { expectedTaskOrigin, previousMemory: initialMemory });
    return serializeArchiveCommitOperation(entry, initialMemory, () => serializeCacheScopeOperation(scope, async () => {
        try { context = core_context.currentCharacterGuard(); } catch { return null; }
        if (expectedTaskOrigin && !core_context.deferredCommitOriginMatchesContext(expectedTaskOrigin, context)) return null;
        if (cacheScopeFromContext(context) !== scope || core_context.getChatId(context) !== expectedChatId
            || !context.chatMetadata || typeof context.chatMetadata !== 'object') return null;
        let memoryBank;
        try { memoryBank = archive_repository.requireArchive(context); } catch { return null; }
        const stillCurrent = () => {
            if (!core_context.runtimeLifecycleStillCurrent(mutationLifecycle)) return false;
            if (core_requestCoordinator.isLogicalGenerationTaskCurrent?.(expectedTaskOrigin) === false) return false;
            let live;
            try { live = core_context.currentCharacterGuard(); } catch { return false; }
            if (expectedTaskOrigin && !core_context.deferredCommitOriginMatchesContext(expectedTaskOrigin, live)) return false;
            const liveMemory = archive_repository.getImportedMemory(live);
            return cacheScopeFromContext(live) === scope
                && core_context.getChatId(live) === expectedChatId
                && core_text.normalizeText(liveMemory?.archiveRevision, 240) === core_text.normalizeText(memoryBank.archiveRevision, 240);
        };
        let stagedSession = null;
        const committed = await commitArchiveCacheMutation(entry, memoryBank, getCache(context), cache => {
            const fence = assertModeWriteFence(cache, mode, expectedTaskOrigin, fallbackSession);
            const replacement = options.participantRegeneration || fallbackSession?.[PARTICIPANT_REPLACEMENT_KEY];
            const cached = cache?.[mode]?.kind === mode
                && core_context.comparableChatId(cache[mode].chatId) === core_context.comparableChatId(expectedChatId)
                && core_text.normalizeText(cache[mode].archiveRevision, 240) === core_text.normalizeText(memoryBank.archiveRevision, 240)
                ? cloneCacheValue(cache[mode])
                : cloneCacheValue(fallbackSession);
            const mutated = mutateSession(cached, memoryBank);
            if (!mutated || typeof mutated !== 'object') return false;
            if (mutated.readableProgress?.version === 1 && mutated.readableProgress.complete === false) return false;
            if (replacement) assertReplacementInCache(cache, memoryBank, replacement, mode, mutated);
            stagedSession = cloneCacheValue(mutated);
            stagedSession = preserveLifeFromPartialRoom(stagedSession, cache[mode]);
            if (options.completeGeneration === true && expectedTaskOrigin?.generationRecoveryDraftId) {
                stagedSession = preserveProgressLocalState(stagedSession, generationDraftRecords(cache)[expectedTaskOrigin.generationRecoveryDraftId]?.result?.session);
            }
            delete stagedSession[PARTICIPANT_REPLACEMENT_KEY];
            stagedSession.chatId = expectedChatId;
            stagedSession.archiveRevision = memoryBank.archiveRevision;
            stagedSession[core_constants.SESSION_MODE_WRITE_FENCE_KEY] = fence;
            cache[mode] = stagedSession;
            if (options.completeGeneration === true) clearCompletedRecovery(cache, mode, expectedTaskOrigin);
            if (mode === core_constants.MODE.PHONE) delete cache[core_constants.PHONE_DRAFT_CACHE_KEY];
        }, stillCurrent, { generationDraftMutation: options.completeGeneration === true && !!expectedTaskOrigin?.generationRecoveryDraftId });
        if (committed.unchanged || !stagedSession || !stillCurrent()) return null;
        context = core_context.currentCharacterGuard();
        const previousStored = cloneCacheValue(context.chatMetadata?.[core_constants.CACHE_KEY]);
        const hadStored = Object.prototype.hasOwnProperty.call(context.chatMetadata, core_constants.CACHE_KEY);
        const previousRuntime = cloneCacheValue(runtimeState.runtimeSessionCache.get(scope));
        const hadRuntime = runtimeState.runtimeSessionCache.has(scope);
        rememberRuntimeSessionCache(scope, committed.cache);
        context.chatMetadata[core_constants.CACHE_KEY] = cloneCacheValue(committed.stored);
        try { await saveMetadataDurably(context); }
        catch (error) {
            if (options.keepCommittedOnMirrorFailure === true) {
                // The awaited IndexedDB transaction already owns this image.
                // A host mirror scheduling failure must not discard a confirmed
                // image or invite another paid generation.
                console.warn('[HeartbeatMemories] CG metadata mirror not scheduled',
                    { code: 'RMT_CG_MIRROR_PENDING', stage: 'mirror' });
                return cloneCacheValue(stagedSession);
            }
            if (hadStored) context.chatMetadata[core_constants.CACHE_KEY] = previousStored;
            else delete context.chatMetadata[core_constants.CACHE_KEY];
            if (hadRuntime) rememberRuntimeSessionCache(scope, previousRuntime);
            else runtimeState.runtimeSessionCache.delete(scope);
            throw error;
        }
        return cloneCacheValue(stagedSession);
    }));
}

export async function commitSession(mode, session, expectedChatId = core_text.normalizeText(session?.chatId, 240), expectedTaskOrigin = null) {
    if (session?.readableProgress?.version === 1 && session.readableProgress.complete === false) {
        const context = core_context.getContext();
        if (core_context.getChatId(context) !== expectedChatId || (expectedTaskOrigin && !core_context.deferredCommitOriginMatchesContext(expectedTaskOrigin, context))) return false;
        return !!await saveGenerationProgressReadingState(context, session);
    }
    const expectedRevision = core_text.normalizeText(session?.archiveRevision, 240);
    const replacement = session?.[PARTICIPANT_REPLACEMENT_KEY];
    const committed = await commitSessionMutation(mode, expectedChatId, expectedTaskOrigin, (_latest, memoryBank) => {
        if (expectedRevision && expectedRevision !== core_text.normalizeText(memoryBank.archiveRevision, 240)) return null;
        if (replacement) return session;
        return mode === core_constants.MODE.THEME_SONG ? song_contract.mergeThemeSongs(_latest, session)
            : mode === core_constants.MODE.BEDTIME ? bedtime_contract.mergeBedtime(_latest, session)
            : mode === core_constants.MODE.INBOX ? modes_inbox.mergeInboxLatest(_latest, session) : session;
    }, session, { completeGeneration: true, ...(replacement ? { participantRegeneration: replacement } : {}) });
    return !!committed;
}

export async function commitDetachedArchiveSessionMutation(target, mode, expectedTaskOrigin, mutateSession, fallbackSession = null, stillCurrent = null, options = {}) {
    const suppliedCurrent = stillCurrent;
    stillCurrent = () => core_requestCoordinator.isLogicalGenerationTaskCurrent?.(expectedTaskOrigin) !== false
        && (typeof suppliedCurrent !== 'function' || suppliedCurrent());
    if (typeof mutateSession !== 'function') throw new Error('后台派生内容缺少安全合并函数，本次结果没有写入。');
    const entryId = core_text.normalizeText(target?.entryId, 120);
    const chatId = core_context.comparableChatId(target?.chatId);
    const memoryBank = cloneCacheValue(target?.memory);
    const revision = core_text.normalizeText(memoryBank?.archiveRevision, 240);
    if (!entryId || !chatId || !revision || !Array.isArray(memoryBank?.memories)) throw new Error('后台生成目标身份不完整，本次结果没有写入。');
    if (core_context.comparableChatId(memoryBank.chatId) !== chatId) throw new Error('后台生成目标聊天身份不一致，本次结果没有写入。');
    const entry = {
        entryId,
        archiveGroupId: core_text.normalizeText(target?.archiveGroupId, 120),
        characterKey: core_text.normalizeText(target?.characterKey, 300),
        avatar: core_text.normalizeText(target?.avatar, 300),
        characterName: core_text.normalizeText(target?.characterName || memoryBank.characterName, 120),
        characterFingerprint: core_text.normalizeText(target?.characterFingerprint, 160),
        characterIndexHint: Number.isInteger(Number(target?.characterIndexHint)) ? Number(target.characterIndexHint) : -1,
        chatId,
        archiveName: core_text.normalizeText(target?.archiveName || memoryBank.archiveName, 160),
    };
    return serializeArchiveCommitOperation(entry, memoryBank, async () => {
        if (typeof stillCurrent === 'function' && !stillCurrent()) throw new Error('同一档案已启动更新的同类任务，本次旧结果没有写入。');
        let stagedSession = null;
        const committed = await commitArchiveCacheMutation(entry, memoryBank, target?.cache || {}, cache => {
            const fence = assertModeWriteFence(cache, mode, expectedTaskOrigin, fallbackSession);
            const replacement = options.participantRegeneration || fallbackSession?.[PARTICIPANT_REPLACEMENT_KEY];
            const latest = replacement ? cloneCacheValue(cache[mode] || fallbackSession)
                : loadSession(mode, { cache, chatId, memoryBank, clone: true }) || cloneCacheValue(fallbackSession);
            const mutated = mutateSession(latest, memoryBank);
            if (!mutated || typeof mutated !== 'object') return false;
            if (mutated.readableProgress?.version === 1 && mutated.readableProgress.complete === false) return false;
            if (replacement) assertReplacementInCache(cache, memoryBank, replacement, mode, mutated);
            stagedSession = cloneCacheValue(mutated);
            stagedSession = preserveLifeFromPartialRoom(stagedSession, cache[mode]);
            if (options.completeGeneration === true && expectedTaskOrigin?.generationRecoveryDraftId) {
                stagedSession = preserveProgressLocalState(stagedSession, generationDraftRecords(cache)[expectedTaskOrigin.generationRecoveryDraftId]?.result?.session);
            }
            delete stagedSession[PARTICIPANT_REPLACEMENT_KEY];
            stagedSession.chatId = chatId;
            stagedSession.archiveRevision = revision;
            stagedSession[core_constants.SESSION_MODE_WRITE_FENCE_KEY] = fence;
            cache[mode] = stagedSession;
            if (options.completeGeneration === true) clearCompletedRecovery(cache, mode, expectedTaskOrigin);
            if (mode === core_constants.MODE.PHONE) delete cache[core_constants.PHONE_DRAFT_CACHE_KEY];
        }, stillCurrent, { generationDraftMutation: options.completeGeneration === true && !!expectedTaskOrigin?.generationRecoveryDraftId });
        return { ...committed, session: cloneCacheValue(stagedSession) };
    });
}

export async function commitDetachedArchiveSession(target, mode, session, stillCurrent = null, expectedTaskOrigin = null) {
    const replacement = session?.[PARTICIPANT_REPLACEMENT_KEY];
    return commitDetachedArchiveSessionMutation(
        target,
        mode,
        expectedTaskOrigin,
        latest => replacement ? session : mode === core_constants.MODE.THEME_SONG ? song_contract.mergeThemeSongs(latest, session)
            : mode === core_constants.MODE.BEDTIME ? bedtime_contract.mergeBedtime(latest, session)
            : mode === core_constants.MODE.INBOX ? modes_inbox.mergeInboxLatest(latest, session) : session,
        session,
        stillCurrent,
        { completeGeneration: true, ...(replacement ? { participantRegeneration: replacement } : {}) },
    );
}

export async function flushSessionCacheNow(expectedChatId = '', expectedTaskOrigin = null) {
    let context;
    try { context = core_context.currentCharacterGuard(); } catch { return false; }
    const currentChatId = core_context.getChatId(context);
    const wantedChatId = core_text.normalizeText(expectedChatId, 240) || currentChatId;
    if (!wantedChatId || currentChatId !== wantedChatId) return false;
    if (expectedTaskOrigin && !core_context.deferredCommitOriginMatchesContext(expectedTaskOrigin, context)) return false;
    let memoryBank;
    try { memoryBank = archive_repository.requireArchive(context); } catch { return false; }
    if (expectedTaskOrigin?.archiveRevision && core_text.normalizeText(memoryBank.archiveRevision, 240) !== core_text.normalizeText(expectedTaskOrigin.archiveRevision, 240)) return false;
    const scope = cacheScopeFromContext(context);
    const timer = runtimeState.cachePersistTimers.get(scope);
    if (timer) clearTimeout(timer);
    runtimeState.cachePersistTimers.delete(scope);
    const cache = cloneCacheValue(getCache(context));
    cache.chatId = wantedChatId;
    cache.archiveRevision = memoryBank.archiveRevision;
    if (!cacheCommitToken(cache)) stampCacheCommit(cache, scope);
    rememberRuntimeSessionCache(scope, cache);
    return persistCompressedCacheNow(context, cache, scope);
}

export function loadSession(mode, options = {}) {
    if (!Object.values(core_constants.MODE).includes(mode)) return null;
    try {
        const suppliedCache = options.cache && typeof options.cache === 'object' ? options.cache : null;
        const context = options.context || (suppliedCache ? null : core_context.currentCharacterGuard());
        const chatId = core_text.normalizeText(options.chatId, 240) || (context ? core_context.getChatId(context) : '');
        const contentSnapshot = context?.__rmtGenerationContentSnapshot;
        const memoryBank = options.memoryBank || contentSnapshot?.memoryBank || (context ? archive_repository.requireArchive(context) : null);
        if (!chatId || !memoryBank) return null;
        if (contentSnapshot?.memoryBank?.archiveRevision === memoryBank.archiveRevision
            && contentSnapshot.memoryBank.chatId === chatId) {
            const inputs = contentSnapshot.contentInputs || {};
            const key = mode === contentSnapshot.mode ? Object.hasOwn(inputs, 'previousSession') ? 'previousSession'
                : mode === core_constants.MODE.HEART && Object.hasOwn(inputs, 'baseSession') ? 'baseSession' : ''
                : mode === core_constants.MODE.ROOM && Object.hasOwn(inputs, 'roomSession') ? 'roomSession' : '';
            // Explicit null means this original task had no earlier page; never
            // fall through to a newly generated page in the live archive.
            if (key) return inputs[key] == null ? null : structuredClone(inputs[key]);
        }
        const cache = suppliedCache || getCache(context);
        let session = options.includePartial === true
            ? loadReadableGenerationProgress(mode, { context, cache, memoryBank, chatId }) || cache?.[mode] : cache?.[mode];
        if (!session || session.kind !== mode) return null;
        if (session.readableProgress?.version === 1 && session.readableProgress.complete === false
            && options.includePartial !== true) return null;
        if (core_text.normalizeText(cache.chatId, 240) !== chatId) return null;
        if (core_text.normalizeText(session.chatId, 240) !== chatId) return null;
        if (cache.archiveRevision !== memoryBank.archiveRevision) return null;
        if (session.archiveRevision !== memoryBank.archiveRevision) return null;
        const reading = generationPageReadingSource(session, mode, memoryBank);
        const partial = session.readableProgress?.version === 1 && session.readableProgress.complete === false;
        if (mode === core_constants.MODE.PAST_LIVES && !(partial
            ? modes_pastLives.readablePastLivesProgressSession?.(reading.session, reading.memoryBank)
            : modes_pastLives.readablePastLivesSession(reading.session, reading.memoryBank))) return null;
        if (time_stories.isTimeStoryMode(mode) && !(partial
            ? modes_timeStories.readableTimeStoriesProgressSession?.(reading.session, reading.memoryBank)
            : modes_timeStories.readableTimeStoriesSession(reading.session, reading.memoryBank))) return null;
        if (mode === core_constants.MODE.INBOX) {
            session = modes_inbox.normalizeInboxSession(session);
            if (!session) return null;
        }
        if (mode === core_constants.MODE.THEME_SONG && (!(partial
            ? modes_themeSong.readableThemeSongProgressSession?.(reading.session, reading.memoryBank)
            : song_contract.readableThemeSongs(reading.session, reading.memoryBank))
            || (context && session.ownerKey && session.ownerKey !== core_context.currentCharacterRuntimeKey(context)))) return null;
        if (mode === core_constants.MODE.BEDTIME && (!(partial
            ? modes_bedtime.readableBedtimeProgressSession?.(reading.session, reading.memoryBank)
            : bedtime_contract.readableBedtime(reading.session, reading.memoryBank))
            || (context && session.ownerKey && session.ownerKey !== core_context.currentCharacterRuntimeKey(context)))) return null;
        const userManaged = session.userManaged === true;
        if (mode === core_constants.MODE.ROOM && (!Array.isArray(session.spaces) || (!userManaged && session.spaces.length < 1))) return null;
        if (mode === core_constants.MODE.ITEMS && (!Array.isArray(session.containers) || (!userManaged && session.containers.length < 1))) return null;
        if (mode === core_constants.MODE.CABINET && !Array.isArray(session.items)) return null;
        if (mode === core_constants.MODE.PHONE) {
            session = partial ? session : modes_phone.migrateLegacyPhoneSession(session, reading.memoryBank);
            // A legacy phone may legitimately fall below the new generated minimum when the retired
            // calendar/schedule App is removed. Cache loading therefore checks structural readability
            // only; fresh generation still enforces its device-specific 4/5-App minimum in phone.js.
            if (!session || !Array.isArray(session.apps) || session.apps.length < 1) return null;
        }
        if (mode === core_constants.MODE.ENDING && (!Array.isArray(session.endings) || (!userManaged && !partial && session.endings.length < 5))) return null;
        if (mode === core_constants.MODE.TRAVEL) {
            session = migrateLegacyTravelSession(session);
            if (!session || !Array.isArray(session.locations) || (!userManaged && session.locations.length < 1)) return null;
        }
        if (mode === core_constants.MODE.CALENDAR) {
            session = modes_calendar.migrateCalendarSession(session, reading.memoryBank);
            if (!session || !Array.isArray(session.entries) || !session.dayPages || session.calendarVersion !== core_constants.CALENDAR_SESSION_VERSION) return null;
        }
        if (mode === core_constants.MODE.HEART) {
            session = core_heartLanguage.readableHeartSession(session);
            if (!session) return null;
        }
        if (mode === core_constants.MODE.ACHIEVEMENTS && (!Array.isArray(session.entries) || (!userManaged && session.entries.length < 1))) return null;
        return options.clone === false ? session : structuredClone(session);
    } catch {
        return null;
    }
}
