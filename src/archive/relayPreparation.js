// Explicit relay transport only. No persistence, provider requests or authority
// changes happen here; the caller must commit the holder fence and both records
// atomically. Original requests are never rebound to the receiving chat.
import * as constants from '../core/constants.js';
import * as contextApi from '../core/context.js';
import * as text from '../core/text.js';
import * as archiveCore from './archiveCore.js';

export const RELAY_SOURCE_CHECKPOINTS_KEY = 'relaySourceCheckpointsV1';
export const RELAY_PRESERVED_DRAFTS_KEY = '__relayPreservedDraftsV1';
const RECOVERY_KEY = '__generationRecoveryV1';
const DRAFTS_KEY = '__generationDraftsV2';
const VERSIONS_KEY = '__archiveVersionsV1';
const SOURCE_FIELDS = Object.freeze(['sourceMessageCount', 'usedMessageCount', 'usedCharacterCount',
    'sourceFingerprint', 'fullSourceFingerprint', 'externalMemoryFingerprint', 'externalMemorySources',
    'externalMemoryRecordCount', 'memoryWorldInfoSources', 'memoryWorldInfoEntryCount', 'chatReadRange',
    'coverageMode', 'truncated', 'coveredRanges', 'archiveImportProgress', 'archiveImportPaused', 'archivePartialDraft']);
const rows = value => Array.isArray(value) ? value : [];
const copy = value => structuredClone(value);
const chatKey = value => contextApi.comparableChatId(value);

function invalid() {
    return text.safeUserError('交接资料与来源或目标聊天不一致，原档案没有改动。', 'RMT_RELAY_SOURCE_CHANGED');
}

function sourceCheckpoint(memory) {
    return Object.fromEntries(SOURCE_FIELDS.filter(key => Object.hasOwn(memory || {}, key)).map(key => [key, copy(memory[key])]));
}

function emptyCheckpoint() {
    return { sourceMessageCount: 0, usedMessageCount: 0, usedCharacterCount: 0, sourceFingerprint: '',
        fullSourceFingerprint: '', externalMemoryFingerprint: '', externalMemorySources: [], externalMemoryRecordCount: 0,
        memoryWorldInfoSources: [], memoryWorldInfoEntryCount: 0, chatReadRange: null,
        coverageMode: 'relay-unread', truncated: false, coveredRanges: [] };
}

// An explicitly relayed chat has no archived prefix until its first append.
// This is not permission to skip source validation for an ordinary archive or
// for a member that has already organized even one source floor/summary.
export function relayHasUnreadCurrentSource(memory) {
    const marker = memory?.archiveRelayV1, checkpoints = memory?.[RELAY_SOURCE_CHECKPOINTS_KEY];
    const chatId = chatKey(memory?.chatId);
    if (!chatId || marker?.version !== 1 || typeof marker.lineageId !== 'string' || !marker.lineageId
        || !Number.isSafeInteger(marker.epoch) || marker.epoch < 1 || checkpoints?.version !== 1
        || !Object.hasOwn(checkpoints.chats || {}, chatId)) return false;
    const empty = value => value?.sourceMessageCount === 0 && value.usedMessageCount === 0 && value.usedCharacterCount === 0
        && value.sourceFingerprint === '' && value.fullSourceFingerprint === ''
        && value.externalMemoryFingerprint === '' && value.externalMemoryRecordCount === 0
        && value.coverageMode === 'relay-unread' && Array.isArray(value.coveredRanges) && value.coveredRanges.length === 0;
    return empty(memory) && empty(checkpoints.chats[chatId]);
}

function stampMemorySources(memory, homeChatId) {
    for (const item of [...rows(memory?.memories), ...rows(memory?.coldArchive)]) {
        if (item && typeof item === 'object' && !item.sourceChatId) {
            item.sourceChatId = chatKey(item.inheritedArchiveSourceV1?.chatId) || homeChatId;
        }
    }
}

// A generated page can use a historical evidence snapshot. Its IDs, wording,
// sourceIdentity and evidence revision remain historical; only the reading
// container moves. Request journals/contentSnapshot/frozenInputs are untouched.
function moveMemoryView(memory, sourceChatId, targetChatId, oldRevision = '', newRevision = '') {
    if (!memory || chatKey(memory.chatId) !== sourceChatId) return;
    stampMemorySources(memory, sourceChatId);
    memory.chatId = targetChatId;
    if (oldRevision && memory.archiveRevision === oldRevision) memory.archiveRevision = newRevision;
}

function moveSession(session, sourceChatId, targetChatId, oldRevision, newRevision, mapRevision) {
    if (!session || typeof session !== 'object' || chatKey(session.chatId) !== sourceChatId) return;
    session.chatId = targetChatId;
    if (mapRevision && session.archiveRevision === oldRevision) session.archiveRevision = newRevision;
    if (mapRevision && session.lifePlan?.archiveRevision === oldRevision) session.lifePlan.archiveRevision = newRevision;
    for (const source of Object.values(session.generationSources || {})) {
        moveMemoryView(source?.sourceMemory, sourceChatId, targetChatId);
        if (source?.roomBlueprint?.chatId === sourceChatId) source.roomBlueprint.chatId = targetChatId;
    }
    for (const pair of rows(session.lenticularCardsV1)) {
        const reference = pair?.reference;
        if (!reference || chatKey(reference.chatId) !== sourceChatId) continue;
        reference.chatId = targetChatId;
        // Old saved versions keep their own revision. Current pages and
        // same-revision task results travel with the current formal bank.
        if (mapRevision && reference.source !== 'version' && reference.revision === oldRevision) reference.revision = newRevision;
    }
}

function moveCacheViews(cache, sourceChatId, targetChatId, oldRevision, newRevision, mapRevision = true) {
    if (!cache || typeof cache !== 'object') return;
    if (!cache.chatId || chatKey(cache.chatId) === sourceChatId) cache.chatId = targetChatId;
    if (mapRevision && (!cache.archiveRevision || cache.archiveRevision === oldRevision)) cache.archiveRevision = newRevision;
    for (const mode of [...Object.values(constants.MODE), 'timeJourney']) {
        if (cache[mode]?.kind === mode) moveSession(cache[mode], sourceChatId, targetChatId, oldRevision, newRevision, mapRevision);
    }
    for (const record of Object.values(cache[DRAFTS_KEY]?.records || {})) {
        // Break any in-memory alias between a result and its immutable request
        // snapshot before moving display locators (JSON storage already does).
        if (record?.journal) record.journal = copy(record.journal);
        if (record?.result) record.result = copy(record.result);
        const result = record?.result;
        if (!result) continue;
        // The immutable journal still owns its original chat/requests; result
        // envelopes are display locators, not permission to resume as B.
        moveMemoryView(result.sourceMemory, sourceChatId, targetChatId, mapRevision ? oldRevision : '', newRevision);
        moveSession(result.session, sourceChatId, targetChatId, oldRevision, newRevision, mapRevision);
    }
    for (const version of rows(cache[VERSIONS_KEY])) {
        if (version?.version !== 1 || chatKey(version.memory?.chatId) !== sourceChatId) continue;
        if (chatKey(version.chatId) === sourceChatId) version.chatId = targetChatId;
        moveMemoryView(version.memory, sourceChatId, targetChatId);
        moveCacheViews(version.cache, sourceChatId, targetChatId, oldRevision, newRevision, false);
        // entry/entryId, drafts and their request identities remain the exact
        // historical provenance. Reading does not grant old-target write access.
    }
}

export function relayPreservedDraftRows(cache) {
    const stored = cache?.[RELAY_PRESERVED_DRAFTS_KEY];
    if (stored?.version !== 1) return [];
    return rows(stored.rows).filter(row => row && typeof row.originChatId === 'string'
        && typeof row.originRevision === 'string' && [RECOVERY_KEY, constants.PHONE_DRAFT_CACHE_KEY].includes(row.key)
        && Object.hasOwn(row, 'value')).map(copy);
}

function preserveOriginDrafts(cache, sourceChatId, targetChatId, oldRevision, newRevision) {
    const preserved = relayPreservedDraftRows(cache);
    for (const key of [RECOVERY_KEY, constants.PHONE_DRAFT_CACHE_KEY]) {
        if (!Object.hasOwn(cache, key)) continue;
        const value = copy(cache[key]);
        if (!preserved.some(row => row.originChatId === sourceChatId && row.originRevision === oldRevision
            && row.key === key && JSON.stringify(row.value) === JSON.stringify(value))) {
            preserved.push({ originChatId: sourceChatId, originRevision: oldRevision, key, value });
        }
        delete cache[key];
    }
    if (preserved.length) cache[RELAY_PRESERVED_DRAFTS_KEY] = { version: 1, rows: preserved };
    // On return to the ORIGINAL chat, frozen-input recovery already supports
    // a newer archive revision. Restore exact journals, never rewrite them.
    // Phone plans have a strict revision fence and remain read-only otherwise.
    for (const row of preserved) {
        if (row.originChatId !== targetChatId || row.restored === true) continue;
        if (row.key === RECOVERY_KEY) {
            for (const [mode, journal] of Object.entries(row.value || {})) {
                if (journal?.identity?.chatId !== targetChatId || !(journal.identity.archiveRevision === newRevision
                    || journal.contentSnapshot?.memoryBank && Array.isArray(journal.contentSnapshot.memoryBank.memories))) continue;
                cache[RECOVERY_KEY] ||= {};
                cache[RECOVERY_KEY][mode] = copy(journal);
                const draftId = journal.draftId || `legacy:${mode}:${contextApi.stableArchiveHash(JSON.stringify([journal.identity, journal.createdAt]))}`;
                const pool = cache[DRAFTS_KEY]?.version === 1 ? cache[DRAFTS_KEY] : { version: 1, records: {} };
                pool.records ||= {};
                if (!Object.hasOwn(pool.records, draftId)) pool.records[draftId] = { status: 'open', journal: copy(journal) };
                cache[DRAFTS_KEY] = pool;
            }
            row.restored = true;
        } else if (row.value?.chatId === targetChatId && row.value?.archiveRevision === newRevision) {
            cache[row.key] = copy(row.value);
            row.restored = true;
        }
    }
}

export function prepareArchiveRelay(snapshot, { chatId, revision, now = Date.now(), previousMemberMemory = null } = {}) {
    const sourceMemory = snapshot?.memory, sourceChatId = chatKey(sourceMemory?.chatId), targetChatId = chatKey(chatId);
    const oldRevision = sourceMemory?.archiveRevision;
    if (!archiveCore.isCompatibleArchive(sourceMemory) || !sourceChatId || !targetChatId || sourceChatId === targetChatId
        || typeof oldRevision !== 'string' || !oldRevision || typeof revision !== 'string' || !revision
        || revision === oldRevision || !Number.isFinite(now) || now < 0
        || snapshot.cache != null && (typeof snapshot.cache !== 'object' || Array.isArray(snapshot.cache))
        || snapshot.cache?.chatId && chatKey(snapshot.cache.chatId) !== sourceChatId
        || snapshot.cache?.archiveRevision && snapshot.cache.archiveRevision !== oldRevision
        || previousMemberMemory && chatKey(previousMemberMemory.chatId) !== targetChatId) throw invalid();
    const memory = copy(sourceMemory), cache = copy(snapshot.cache || {});
    const existing = memory[RELAY_SOURCE_CHECKPOINTS_KEY];
    const chats = existing?.version === 1 && existing.chats && typeof existing.chats === 'object'
        && !Array.isArray(existing.chats) ? copy(existing.chats) : {};
    Object.defineProperty(chats, sourceChatId, { value: sourceCheckpoint(sourceMemory), enumerable: true, writable: true, configurable: true });
    const previous = previousMemberMemory ? sourceCheckpoint(previousMemberMemory)
        : Object.hasOwn(chats, targetChatId) ? sourceCheckpoint(chats[targetChatId]) : emptyCheckpoint();
    Object.defineProperty(chats, targetChatId, { value: copy(previous), enumerable: true, writable: true, configurable: true });
    for (const key of SOURCE_FIELDS) delete memory[key];
    Object.assign(memory, previous);
    // These wrappers already follow the archive revision on every ordinary
    // checkpoint save. On return to the SAME member, move only that commit
    // envelope; the recipe, source hashes, partial slots and source checkpoint
    // remain exact, and existing source/character/settings checks still run.
    const previousRevision = previousMemberMemory?.archiveRevision
        || previous.archiveImportProgress?.archiveRevision || previous.archivePartialDraft?.revision;
    if (previousRevision && memory.archiveImportProgress?.archiveRevision === previousRevision) memory.archiveImportProgress.archiveRevision = revision;
    if (previousRevision && memory.archivePartialDraft?.revision === previousRevision) memory.archivePartialDraft.revision = revision;
    memory[RELAY_SOURCE_CHECKPOINTS_KEY] = { version: 1, chats };
    stampMemorySources(memory, sourceChatId);
    memory.chatId = targetChatId; memory.archiveRevision = revision; memory.updatedAt = now;
    moveCacheViews(cache, sourceChatId, targetChatId, oldRevision, revision);
    preserveOriginDrafts(cache, sourceChatId, targetChatId, oldRevision, revision);
    return { memory, cache };
}
