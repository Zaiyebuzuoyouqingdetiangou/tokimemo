import * as draft_inputs from './draftInputs.js';
import * as local_store from '../core/localRecoveryStore.js';
import * as constants from '../core/constants.js';
// Draft checkpoints are separate from formal archives and evidence. Lazy local
// persistence begins only at an explicit archive operation, never at bootstrap.
// Opening the current archive may read its own checkpoints, without generating.
import * as recovery from '../generation/recovery.js';
import * as client from '../generation/client.js';
import * as text from '../core/text.js';
import * as taskTrace from '../core/taskTrace.js';
import * as digest from '../core/digest.js';

export const ARCHIVE_RECOVERY_PAGE_NOTICE = '档案整理草稿仅本页保留，请勿刷新；关闭心迹回廊可保留。';
export const ARCHIVE_RECOVERY_MAX_DRAFTS = 4;
const drafts = new Map();
const tickets = new WeakSet();
// Explicit discard revokes old owners even if durable deletion later fails.
const discardedEntries = new WeakSet();
const scopes = new Map();
const lanes = new Map();
const loaded = new Set();
const hydrationLanes = new Map();
function inputsDigest(inputs) { return digest.sha256Bytes(new TextEncoder().encode(JSON.stringify(inputs))); }
function inputsMatchJournal(entry) {
    const expected = entry?.journal?.contentSnapshot?.archiveInputsHash;
    return !expected || (!!entry.inputs && expected === inputsDigest(entry.inputs));
}
function storageFailure(phase = 'save', cause = null) {
    if (phase === 'read') return text.safeUserError('本机草稿读取未完成，不能认定没有记录；原记录未修改，也没有请求模型。请重新读取，不要清除数据。', 'RMT_ARCHIVE_DRAFT_READ');
    // Recoverable storage conditions get their exact manual remedy. No automatic
    // retry is added for any of them; the user decides when to save again.
    if (cause?.quota === true || cause?.name === 'QuotaExceededError') {
        return text.safeUserError('本机存储空间不足，整理草稿未能保存；已停止后续模型请求，成功分段仍在当前页面，原记录未修改。请先导出成果，不要清除本站数据；释放设备空间后可重试保存。', 'RMT_ARCHIVE_DRAFT_STORAGE');
    }
    if (cause?.code === 'RMT_LOCAL_CAS') {
        return text.safeUserError('本机草稿正被另一页面或操作写入，本次没有覆盖任何记录；已停止后续模型请求，成功分段仍在当前页面。请重新打开本页后重试保存。', 'RMT_ARCHIVE_DRAFT_STORAGE');
    }
    return text.safeUserError('未能把本次整理草稿保存到本机；已停止后续模型请求，成功分段仍在当前页面。请先导出，保存成功前不要刷新。', 'RMT_ARCHIVE_DRAFT_STORAGE');
}
function capacityFailure() {
    return text.safeUserError('整理草稿未能保存，已停止后续请求，原记录保留。请先导出成果，保存成功前不要刷新。', 'RMT_ARCHIVE_DRAFT_CAPACITY');
}
export function archiveDraftCapacityFailure() { return capacityFailure(); }
function ackMismatchFailure() {
    return text.safeUserError('本机草稿保存回执与预期不一致，不能认定已保存；已停止后续模型请求，成功分段仍在当前页面，原记录未修改。请重新打开本页后重试保存。', 'RMT_ARCHIVE_DRAFT_STORAGE');
}
function conflictFailure() {
    return text.safeUserError('本机草稿版本已变化；页面成果与本机记录均保留，未覆盖或重新生成。请先导出本页成果，再重新打开原聊天读取。', 'RMT_ARCHIVE_DRAFT_CONFLICT');
}
function confirmCounts(state, rows) {
    state.completed = new Map(rows.map(([id, entry]) => [id, recovery.generationRecoverySummary(entry.journal)?.completed || 0]));
}
function scopeRows(key) {
    return [...drafts].filter(([id]) => id === key || id.startsWith(`${key}:paused:`)).map(([id,entry]) => [id, { ...entry, active: false, durable: true }]);
}
async function saveScope(key) {
    const run = (lanes.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
        const state = scopes.get(key);
        if (!state || !local_store.localRecoveryStorageAvailable()) throw storageFailure();
        const rows = scopeRows(key);
        const encoded = JSON.stringify({ version: 1, rows });
        if (new TextEncoder().encode(encoded).byteLength > constants.MAX_CACHE_SOURCE_BYTES) throw capacityFailure();
        const revision = await local_store.compareLocalRecoveryRecord(state.id, state.revision, rows.length ? JSON.parse(encoded) : null);
        // Only the transaction's exact CAS acknowledgement confirms this write.
        // false/undefined must not be mistaken for a saved checkpoint in a host.
        if (revision !== state.revision + 1) throw ackMismatchFailure();
        state.revision = revision;
        state.lastFailureCode = '';
        confirmCounts(state, rows);
        for (const [id, saved] of rows) {
            const live = drafts.get(id);
            // An acknowledgement only covers the journal/stage actually written,
            // not a newer success that arrived while the transaction was pending.
            if (live && live.journal === saved.journal && live.stage === saved.stage
                && live.committedRevision === saved.committedRevision) live.durable = true;
        }
        return true;
    });
    lanes.set(key, run);
    try { return await run; } catch (error) {
        const state = scopes.get(key);
        if (state && error?.code === 'RMT_ARCHIVE_DRAFT_CAPACITY') state.lastFailureCode = error.code;
        for (const [id] of scopeRows(key)) if (drafts.has(id)) drafts.get(id).durable = false;
        // Failures already classified above keep their exact code and guidance.
        if (['RMT_ARCHIVE_DRAFT_STORAGE', 'RMT_ARCHIVE_DRAFT_READ', 'RMT_ARCHIVE_DRAFT_CAPACITY'].includes(error?.code)) throw error;
        throw storageFailure('save', error);
    }
    finally { if (lanes.get(key) === run) lanes.delete(key); }
}
function scheduleSave(key) { void saveScope(key).catch(() => {}); }
// Compatibility seam for older callers. No plugin byte ceiling; only an
// acknowledged storage transaction can decide whether a draft was saved.
export function archiveRecoveryDraftPlanExceedsCapacity() { return false; }
export async function flushArchiveRecovery(origin, operation = 'import') {
    const key = draftKey(origin, operation); if (!key) return false;
    if (lanes.has(key)) await lanes.get(key);
    return saveScope(key);
}
export function resetArchiveRecoveryMemoryForTests() { drafts.clear(); scopes.clear(); loaded.clear(); lanes.clear(); hydrationLanes.clear(); }
export async function hydrateArchiveRecovery(origin, operation = 'import', { force = false } = {}) {
    const key = draftKey(origin, operation); if (!key) return false;
    // An unavailable API is not an empty database (notably in embedded hosts).
    // Fail before any paid request instead of silently selecting page-only mode.
    if (!local_store.localRecoveryStorageAvailable()) throw storageFailure('read');
    if (loaded.has(key) && !force) return false;
    // Opening the view and clicking continue may overlap. Reuse the same read;
    // neither path may overwrite a live journal with an older storage snapshot.
    if (hydrationLanes.has(key)) return hydrationLanes.get(key);
    const read = hydrateArchiveRecoveryScope(key, origin, operation, force);
    hydrationLanes.set(key, read);
    try { return await read; }
    finally { if (hydrationLanes.get(key) === read) hydrationLanes.delete(key); }
}
async function hydrateArchiveRecoveryScope(key, origin, operation, force) {
    const id = `draft:${await recovery.generationRecoveryDigest(key)}`;
    // An explicit reread waits for our current write. It must never replace a
    // newer in-page success or adopt a foreign revision just to overwrite it.
    if (lanes.has(key)) await lanes.get(key).catch(() => {});
    const readRevision = scopes.get(key)?.revision;
    let record;
    try { record = await local_store.readLocalRecoveryRecord(id); } catch { throw storageFailure('read'); }
    if (record !== null && (!record || record.key !== id || !Number.isSafeInteger(record.revision) || record.revision < 1)) throw storageFailure('read');
    if (loaded.has(key)) {
        if (!force) return true;
        const state = scopes.get(key);
        if (state?.revision !== readRevision) return true; // Our own write completed during this read.
        if (scopeRows(key).length || lanes.has(key)) {
            if ((record?.revision || 0) !== state?.revision) throw conflictFailure();
            return true;
        }
    }
    const payload = record?.payload;
    if (payload) {
        if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > constants.MAX_CACHE_SOURCE_BYTES
            || payload.version !== 1 || !Array.isArray(payload.rows) || payload.rows.length > ARCHIVE_RECOVERY_MAX_DRAFTS) throw storageFailure('read');
        const checked = [];
        for (const [rowKey, value] of payload.rows) {
            if (typeof rowKey !== 'string' || (rowKey !== key && !rowKey.startsWith(`${key}:paused:`))
                || !validStoredEntry(value, key, origin, operation)) throw storageFailure('read');
            const entry = draft_inputs.compactArchiveEntry(structuredClone(value)); entry.active = false; entry.durable = true;
            // A saved draft is never a formal commit. If the intended bank wasn't
            // committed, replay validated pieces and the normal CAS path on click.
            if (entry.stage === 'awaiting-commit' && entry.committedRevision !== origin.archiveRevision) entry.stage = 'segments';
            checked.push([rowKey, entry]);
        }
        if (drafts.size + checked.filter(([id]) => !drafts.has(id)).length > ARCHIVE_RECOVERY_MAX_DRAFTS) throw storageFailure('read');
        for (const [id,entry] of checked) if (!drafts.has(id)) drafts.set(id,entry);
    }
    const state = { id, revision: record?.revision || 0 };
    confirmCounts(state, payload?.rows || []);
    scopes.set(key, state); loaded.add(key);
    acknowledgeArchiveRecoveryCommit(origin);
    return true;
}
function validStoredEntry(entry, key, origin, operation) {
    const identity = entry?.journal?.identity;
    return entry && entry.key === key && entry.operation === operation && /^[a-f0-9]{64}$/.test(entry.sourceHash || '')
        && ['segments','awaiting-commit','profile-only','profile-result','archive-result'].includes(entry.stage)
        && typeof entry.fullRebuild === 'boolean' && recovery.generationRecoverySummary(entry.journal) && inputsMatchJournal(entry)
        && identity.mode === (operation === 'import' ? 'archive-import' : 'archive-profile')
        && identity.archiveRevision === `archive-draft:${entry.sourceHash}`
        && ['characterKey','characterId','characterAvatar','chatId'].every(field => (identity[field] || '') === (origin[field] || ''));
}
export async function importArchiveRecoveryData(origin, data) {
    const key = draftKey(origin, 'import');
    if (!key || !data || !['hearttrace-unarchived-results-v1','hearttrace-unarchived-results-v2'].includes(data.format)
        || !Array.isArray(data.pageDrafts) || !data.pageDrafts.length
        || new TextEncoder().encode(JSON.stringify(data)).byteLength > constants.MAX_CACHE_SOURCE_BYTES) throw storageFailure();
    await hydrateArchiveRecovery(origin);
    if (drafts.has(key)) throw text.safeUserError('当前聊天已有整理草稿，导入没有覆盖它。请先导出并明确处理现有草稿。', 'RMT_RECOVERY_BUSY');
    if (drafts.size + data.pageDrafts.length > ARCHIVE_RECOVERY_MAX_DRAFTS) throw storageFailure();
    const values = data.pageDrafts.map(row => {
        const sourceHash = String(row?.journal?.identity?.archiveRevision || '').replace(/^archive-draft:/, '');
        const entry = { key, operation:'import', sourceHash, fullRebuild: row.fullRebuild === true,
            stage:'segments', journal: structuredClone(row.journal), active:false, durable:false, importedUnverified:true,
            ...(row.inputs ? { inputs: structuredClone(row.inputs) } : {}) };
        if (!validStoredEntry(entry, key, origin, 'import')) throw incompatible();
        return draft_inputs.compactArchiveEntry(entry);
    });
    // Imported fragments are data, never new evidence authority. Initial dispatch
    // must rebuild current sources and match exact source/request hashes.
    values.forEach((entry,index) => drafts.set(index ? `${key}:paused:import:${index}` : key, entry));
    const durable = await saveScope(key);
    return { count: values.length, completed: recovery.generationRecoverySummary(values[0].journal)?.completed || 0, durable };
}


function draftKey(origin, operation) {
    if (!['import', 'profile'].includes(operation) || !origin?.characterKey || !origin?.chatId) return '';
    // Stable locator only; the record's full runtime character fingerprint is
    // still checked before restore/dispatch. A card edit must not hide the old
    // draft by changing its lookup key and accidentally start a new paid task.
    return JSON.stringify([String(origin.characterId ?? ''), origin.characterAvatar || origin.characterKey, origin.chatId, operation]);
}

function incompatible() {
    return text.safeUserError('这份档案整理草稿与当前来源、档案或生成设置不一致。原草稿仍保留，本次没有重新生成成功分块。', 'RMT_RECOVERY_INPUT_CHANGED');
}

function archiveDraftId(key) {
    const entry = drafts.get(key);
    // Stable when the same task moves to a paused slot, distinct when a later
    // task reuses its operation's active slot.
    return entry?.draftId || `archive-draft-${inputsDigest([entry?.key || key, entry?.sourceHash || '', entry?.journal?.createdAt || 0])}`;
}

// Reading a checkpoint never promotes it to archive evidence or invokes a model.
export function listArchiveRecoveryDrafts(origin, operation = null) {
    return (operation ? [operation] : ['import', 'profile']).flatMap(kind => {
        const key = draftKey(origin, kind);
        return [...drafts].filter(([id]) => id === key || id.startsWith(`${key}:paused:`)).map(([id, entry]) => ({
            draftId: archiveDraftId(id), operation: kind, stage: entry.stage, paused: id !== key,
            active: entry.active === true, durable: entry.durable === true,
            createdAt: entry.journal?.createdAt || 0, updatedAt: entry.journal?.updatedAt || 0,
            completed: recovery.generationRecoverySummary(entry.journal)?.completed || 0,
        }));
    });
}

export function readArchiveRecoveryDraft(origin, draftId) {
    for (const operation of ['import', 'profile']) {
        const key = draftKey(origin, operation);
        const found = [...drafts].find(([id]) => (id === key || id.startsWith(`${key}:paused:`)) && archiveDraftId(id) === draftId);
        if (found) {
            const [id, entry] = found;
            if (!validStoredEntry(entry, key, origin, operation)) throw incompatible();
            return { ...structuredClone(entry), draftId, paused: id !== key };
        }
    }
    throw text.safeUserError('找不到这份整理草稿；原档案没有改动。', 'RMT_ARCHIVE_DRAFT_NOT_FOUND');
}

export function archiveRecoverySummary(origin, operation = 'import', { includeArchived = false } = {}) {
    const entry = drafts.get(draftKey(origin, operation));
    const retained = listArchiveRecoveryDrafts(origin, operation);
    if (!entry) return includeArchived && retained.length ? { operation, drafts: retained, onlyArchivedDrafts: true, completed: 0,
        notice: '另起任务前的草稿仍保留，可以打开查看；不会自动请求模型。' } : null;
    const summary = recovery.generationRecoverySummary(entry.journal);
    const savedCompleted = scopes.get(draftKey(origin, operation))?.completed?.get(draftKey(origin, operation)) || 0;
    return { operation, fullRebuild: entry.fullRebuild, profileOnly: entry.stage === 'profile-only',
        awaitingCommit: entry.stage === 'awaiting-commit', committedRevision: entry.committedRevision || '',
        savedCompleted, completed: summary?.completed || 0,
        canCommitComplete: entry.stage === 'segments' && !!entry.inputs?.progress && !!entry.inputs?.taskInputV1
            && !(entry.fullRebuild && entry.inputs?.baseMemory)
            && entry.journal.segments.some(row => /^(chat|external):\d+$/.test(row.slot) && row.state === 'complete'),
        truncated: summary?.truncated || 0,
        canContinue: entry.stage === 'segments' && !!summary?.canContinue,
        canRetry: entry.stage === 'profile-only' || !!summary?.canRetry,
        failureCode: scopes.get(draftKey(origin, operation))?.lastFailureCode || summary?.failureCode || '', drafts: retained, onlyArchivedDrafts: ['profile-result','archive-result'].includes(entry.stage), pageOnly: entry.durable !== true, notice: entry.durable === true
            ? '成功分段与原任务输入已保存到本机；刷新后可继续未完成部分，不重做已保存分段。换设备前请导出。'
            : `本机已确认保存 ${savedCompleted} 个成功分段；当前页面共有 ${summary?.completed || 0} 个。尚未确认保存的成果请先导出，不要刷新。` };
}

// Called only after a real saved bank of exactly this revision is observed.
// Deferred archive writes must not discard checkpoints before their origin commits.
export function acknowledgeArchiveRecoveryCommit(origin, draftId = '') {
    const storageKey = draftKey(origin, 'import');
    const key = draftId ? [...drafts.keys()].find(id => (id === storageKey || id.startsWith(`${storageKey}:paused:`)) && archiveDraftId(id) === draftId) : storageKey;
    const entry = drafts.get(key);
    if (!entry || entry.stage !== 'awaiting-commit' || entry.committedRevision !== origin?.archiveRevision) return false;
    if (entry.profilePending) entry.stage = 'profile-only';
    else {
        // A batch can commit before its cover does. Keep that received cover in
        // a separate readable checkpoint without occupying the next batch slot.
        const profile = entry.journal?.segments?.find(segment => segment.slot === 'profile');
        if (profile && profile.state !== 'complete') {
            entry.stage = 'profile-only'; entry.active = false;
            entry.draftId = archiveDraftId(key);
            drafts.set(`${storageKey}:paused:profile:${entry.journal.createdAt}`, entry);
        }
        drafts.delete(key);
    }
    scheduleSave(storageKey);
    return true;
}

export function archiveRecoveryInputs(origin, operation = 'import') {
    const entry = drafts.get(draftKey(origin, operation));
    if (entry && !inputsMatchJournal(entry)) throw incompatible();
    return entry?.stage === 'segments' && !entry.importedUnverified && entry.inputs ? structuredClone(entry.inputs) : null;
}

export function parkArchiveRecovery(origin, operation = 'import') {
    const key = draftKey(origin, operation), entry = drafts.get(key);
    if (!entry) return false;
    if (entry.active || entry.stage === 'awaiting-commit') throw text.safeUserError('请先完成当前请求或仅重试保存；未改动草稿。', 'RMT_RECOVERY_BUSY');
    if (drafts.size >= ARCHIVE_RECOVERY_MAX_DRAFTS) throw text.safeUserError('本页已保留四份草稿，旧成果没有被挤掉；请先导出并明确处理旧草稿。', 'RMT_RECOVERY_LIMIT');
    drafts.delete(key);
    drafts.set(`${key}:paused:${Date.now()}:${drafts.size}`, entry);
    scheduleSave(key);
    return true;
}

export function exportArchiveRecovery(origin, operation = 'import') {
    const key = draftKey(origin, operation);
    return [...drafts].filter(([id]) => id === key || id.startsWith(`${key}:paused:`))
        .map(([, entry]) => ({ stage: entry.stage, fullRebuild: entry.fullRebuild, journal: structuredClone(entry.journal), ...(entry.inputs ? { inputs: structuredClone(entry.inputs) } : {}) }));
}

export async function beginArchiveRecovery({ origin, operation = 'import', sourceIdentity, sourceFragments = [], settingsIdentity,
    fullRebuild = false, continueApproved = false, inputs = null, assertCurrent = () => true, onProgress = null, draftId = '', nextIndependentBatch = false, completedOnly = false } = {}) {
    const storageKey = draftKey(origin, operation);
    inputs = draft_inputs.compactArchiveInputs(inputs);
    if (!storageKey) throw text.safeUserError('无法确定档案整理草稿属于哪个聊天，本次没有发送请求。', 'RMT_RECOVERY_IDENTITY');
    await hydrateArchiveRecovery(origin, operation);
    if (assertCurrent() === false) throw new DOMException('Archive origin changed', 'AbortError');
    const key = draftId ? [...drafts.keys()].find(id => (id === storageKey || id.startsWith(`${storageKey}:paused:`)) && archiveDraftId(id) === draftId) : storageKey;
    if (!key) throw incompatible();
    let existing = drafts.get(key);
    let priorResult = null, inheritedDraftId = '';
    if (existing?.stage === 'archive-result' && nextIndependentBatch) {
        if (existing.active) throw text.safeUserError('这份整理草稿正在处理。', 'RMT_RECOVERY_BUSY');
        priorResult = existing.archiveResult; inheritedDraftId = archiveDraftId(key);
    } else if (['profile-result','archive-result'].includes(existing?.stage)) {
        // Starting a new explicit task must not overwrite an independent result.
        parkArchiveRecovery(origin, operation);
        await flushArchiveRecovery(origin, operation);
        existing = null;
    }
    const expectedEntry = existing;
    if (priorResult) existing = null;
    if (existing?.active) throw text.safeUserError('这份档案草稿正在处理，请等当前请求结束。', 'RMT_RECOVERY_BUSY');
    if (existing && (!continueApproved || existing.stage !== 'segments')) throw incompatible();
    if (!existing && !priorResult && drafts.size >= ARCHIVE_RECOVERY_MAX_DRAFTS) {
        throw text.safeUserError('本页已保留 4 份未完成的档案整理草稿。请先完成或明确放弃其中一份；旧草稿没有被挤掉。', 'RMT_RECOVERY_LIMIT');
    }
    if (!Array.isArray(sourceFragments) || sourceFragments.length > recovery.GENERATION_RECOVERY_LIMITS.segments) {
        throw text.safeUserError('档案整理来源超过本页可保留的分段范围，旧草稿仍保留。', 'RMT_RECOVERY_LIMIT');
    }
    const sourceHash = await recovery.generationRecoveryDigest({
        identity: await recovery.generationRecoveryDigest(sourceIdentity),
        fragments: await Promise.all(sourceFragments.map(fragment => recovery.generationRecoveryDigest(fragment))),
    });
    if (assertCurrent() === false) throw new DOMException('Archive recovery origin changed', 'AbortError');
    if (existing && (existing.sourceHash !== sourceHash || existing.fullRebuild !== !!fullRebuild)) throw incompatible();
    // The shared engine requires a nonempty identity field called archiveRevision.
    // Here it is ONLY a draft fingerprint, never an origin for archive/cache writes.
    // An initial import has no bank and must remain that way until normal commit.
    const recoveryOrigin = { ...origin, archiveRevision: `archive-draft:${sourceHash}` };
    const entry = (existing && (discardedEntries.has(existing) ? { ...existing, active: false } : existing)) || { key: storageKey, operation, sourceHash, fullRebuild: !!fullRebuild, stage: 'segments', journal: null, active: false,
        ...(priorResult ? { archiveResult: structuredClone(priorResult), draftId: inheritedDraftId } : {}) };
    let attached = false;
    const stillCurrent = () => !discardedEntries.has(entry) && (!attached || drafts.get(key) === entry) && assertCurrent() !== false;
    const handle = await recovery.createGenerationRecovery({ origin: recoveryOrigin,
        mode: operation === 'import' ? 'archive-import' : 'archive-profile', settingsIdentity, pageOnly: false,
        ...(!existing && inputs?.taskInputV1 ? { contentSnapshot: { version: 1, archiveInputsHash: inputsDigest(inputs) } } : {}),
        existing: entry.journal, continueRequested: !!existing, assertCurrent: stillCurrent, onProgress,
        save: async journal => {
            if (discardedEntries.has(entry) || drafts.get(key) !== entry) throw new DOMException('Archive draft cleared', 'AbortError');
            entry.journal = journal;
            entry.durable = false;
            return saveScope(storageKey);
        } });
    if (drafts.get(key) && drafts.get(key) !== expectedEntry) throw incompatible();
    if (existing?.active) throw text.safeUserError('这份档案草稿正在处理，请等当前请求结束。', 'RMT_RECOVERY_BUSY');
    if (!existing && !priorResult && drafts.size >= ARCHIVE_RECOVERY_MAX_DRAFTS) throw text.safeUserError('本页档案整理草稿已满，旧草稿仍保留。', 'RMT_RECOVERY_LIMIT');
    if ((!existing || entry.importedUnverified) && inputs) entry.inputs = structuredClone(inputs);
    if (priorResult && expectedEntry.profilePending) {
        const profileCopy = { ...structuredClone(expectedEntry), stage: 'profile-only', active: false,
            draftId: `${inheritedDraftId}-profile`, profileMemory: structuredClone(priorResult.memoryBank) };
        delete profileCopy.archiveResult;
        drafts.set(`${storageKey}:paused:profile:${expectedEntry.journal.createdAt}`, profileCopy);
    }
    entry.importedUnverified = false;
    entry.active = true;
    entry.journal = recovery.generationRecoverySnapshot(handle);
    drafts.set(key, entry);
    attached = true;
    try { await saveScope(storageKey); } catch (error) { entry.active = false; throw error; }
    if (assertCurrent() === false) { entry.active = false; throw new DOMException('Archive origin changed', 'AbortError'); }
    recovery.attachGenerationRecovery(recoveryOrigin, handle);
    const ticket = { key, storageKey, entry, origin: recoveryOrigin, handle, assertCurrent: stillCurrent, released: false, completedOnly };
    tickets.add(ticket);
    return ticket;
}

// A first import's cover is still the very same request after memories commit.
// Its original identity, recipe and paid prefix stay attached to the import slot.
export async function resumeArchiveImportProfile({ origin, draftId = '', settingsIdentity = '', assertCurrent = () => true, onProgress = null } = {}) {
    await hydrateArchiveRecovery(origin, 'import');
    const key = draftKey(origin, 'import');
    const found = draftId ? [...drafts].find(([id]) => (id === key || id.startsWith(`${key}:paused:`)) && archiveDraftId(id) === draftId)
        : drafts.has(key) ? [key, drafts.get(key)] : null;
    if (!found || !(found[1].stage === 'profile-only' || found[1].stage === 'archive-result' && found[1].profilePending)
        || !inputsMatchJournal(found[1])) throw incompatible();
    const [recordKey, previousEntry] = found;
    const entry = discardedEntries.has(previousEntry) ? { ...previousEntry, active: false } : previousEntry;
    if (entry.active) throw text.safeUserError('这份简介正在处理，请等当前请求结束。', 'RMT_RECOVERY_BUSY');
    const recoveryOrigin = { ...origin, ...entry.journal.identity };
    const stillCurrent = () => !discardedEntries.has(entry) && drafts.get(recordKey) === entry && assertCurrent() !== false;
    if (entry !== previousEntry) drafts.set(recordKey, entry);
    const handle = await recovery.createGenerationRecovery({ origin: recoveryOrigin, mode: 'archive-import',
        existing: entry.journal, continueRequested: true, settingsIdentity, assertCurrent: stillCurrent, onProgress,
        save: async journal => {
            if (!stillCurrent()) throw new DOMException('Archive draft cleared', 'AbortError');
            entry.journal = journal; entry.durable = false; return saveScope(key);
        } });
    entry.active = true;
    recovery.attachGenerationRecovery(recoveryOrigin, handle);
    const ticket = { key: recordKey, storageKey: key, entry, origin: recoveryOrigin, handle, assertCurrent: stillCurrent, released: false, completedOnly };
    tickets.add(ticket);
    return ticket;
}

export async function retainCompletedArchiveProfile(ticket, profile, sourceMemory) {
    if (!tickets.has(ticket) || ticket.released || discardedEntries.has(ticket.entry) || drafts.get(ticket.key) !== ticket.entry) throw incompatible();
    ticket.entry.profileResult = { profile: structuredClone(profile), sourceMemory: structuredClone(sourceMemory), completedAt: Date.now() };
    if (ticket.entry.archiveResult) {
        Object.assign(ticket.entry.archiveResult.memoryBank, { archiveName: profile.archiveName,
            archiveSummary: profile.archiveSummary, archiveVerdict: structuredClone(profile.archiveVerdict), archiveKeywords: structuredClone(profile.keywords) });
        ticket.entry.profilePending = false;
    } else ticket.entry.stage = 'profile-result';
    ticket.entry.durable = false;
    await saveScope(ticket.storageKey || ticket.key);
    return { status: 'independent', draftId: archiveDraftId(ticket.key) };
}

export async function retainCompletedArchiveImport(ticket, memoryBank, { sourceMemory = null, profilePending = false, baseMemoryMissing = false } = {}) {
    if (!tickets.has(ticket) || ticket.released || discardedEntries.has(ticket.entry) || drafts.get(ticket.key) !== ticket.entry) throw incompatible();
    ticket.entry.archiveResult = { memoryBank: structuredClone(memoryBank),
        sourceMemory: sourceMemory ? structuredClone(sourceMemory) : null, completedAt: Date.now(), baseMemoryMissing };
    ticket.entry.profileMemory = structuredClone(Object.fromEntries(['version','chatId','archiveRevision','characterName','userName','memories']
        .filter(key => Object.hasOwn(memoryBank,key)).map(key => [key,memoryBank[key]])));
    ticket.entry.profilePending = profilePending;
    ticket.entry.stage = 'archive-result'; ticket.entry.durable = false;
    await saveScope(ticket.storageKey || ticket.key);
    return { status: 'independent', draftId: archiveDraftId(ticket.key) };
}

// r84.71: bounded automatic retry for transient transport failures only.
// Unclassified failures, auth/config/context errors, validation failures and
// cancellations still stop immediately and keep the draft for the user.
const ARCHIVE_TRANSIENT_CODES = new Set(['RMT_CONNECTION_SERVER', 'RMT_CONNECTION_NETWORK', 'RMT_CONNECTION_RATE_LIMIT', 'RMT_REQUEST_TIMEOUT']);
let transientRetryDelays = null;
export function setArchiveTransientRetryDelaysForTests(value) { transientRetryDelays = Array.isArray(value) ? [...value] : null; }
export function isArchiveTransientFailure(error) {
    return !!error && error.name !== 'AbortError' && ARCHIVE_TRANSIENT_CODES.has(error.code);
}
function archiveRetryDelay(error, attempt) {
    const ladder = transientRetryDelays || constants.ARCHIVE_TRANSIENT_RETRY_DELAYS_MS;
    const base = Number(ladder[Math.min(attempt, ladder.length - 1)]) || 0;
    const hinted = Number(error?.retryAfterMs);
    return error?.code === 'RMT_CONNECTION_RATE_LIMIT' && Number.isFinite(hinted) && hinted > 0 && !transientRetryDelays
        ? Math.min(60000, Math.max(base, hinted)) : base;
}
function waitArchiveRetry(ms, signal) {
    if (!(ms > 0)) return Promise.resolve();
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
        const timer = setTimeout(() => { signal?.removeEventListener?.('abort', onAbort); resolve(); }, ms);
        const onAbort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
        signal?.addEventListener?.('abort', onAbort, { once: true });
    });
}
async function requestArchiveWithTransientRetry(prompt, options, ticket) {
    const retries = (transientRetryDelays || constants.ARCHIVE_TRANSIENT_RETRY_DELAYS_MS).length;
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await client.generateConfiguredJson(prompt, options);
        } catch (error) {
            if (attempt >= retries || !isArchiveTransientFailure(error) || options?.signal?.aborted) throw error;
            if (error.code === 'RMT_CONNECTION_RATE_LIMIT' && Number(error.retryAfterMs) > 60000) throw error;
            taskTrace.recordRetry?.(options?.taskTrace, error);
            await waitArchiveRetry(archiveRetryDelay(error, attempt), options?.signal);
            if (ticket.assertCurrent() === false) throw new DOMException('Archive recovery origin changed', 'AbortError');
        }
    }
}

export async function requestArchiveRecoverySegment(ticket, slot, prompt, options, validator) {
    if (!tickets.has(ticket) || ticket.released || discardedEntries.has(ticket.entry) || drafts.get(ticket.key) !== ticket.entry || !ticket.entry.active) throw incompatible();
    if (ticket.completedOnly && !ticket.entry.journal.segments.some(row => row.slot === slot && row.state === 'complete')) throw incompatible();
    const checked = async raw => {
        taskTrace.beginStage(options?.taskTrace, 'validate');
        const result = await validator(raw);
        taskTrace.markStage(options?.taskTrace, 'validate');
        return result;
    };
    return recovery.withRecoverySegment(prompt, { ...options, origin: ticket.origin, taskKey: slot }, checked,
        async (effectivePrompt, requestOptions, accepted) => {
            // Archive extraction owns runtimeState.busy, so requestJson's module
            // task gate is deliberately not used. Same provider/parser; only
            // transient transport failures are retried (bounded, see above).
            // Apply the archive budget even to legacy page drafts. Do this only
            // at dispatch: keep the recovery identity and source validators intact.
            if (ticket.completedOnly) throw incompatible();
            const raw = await requestArchiveWithTransientRetry(effectivePrompt, { ...requestOptions, archiveRequestBudget: true,
                timeoutMs: Math.max(Number(requestOptions?.timeoutMs) || 0, constants.ARCHIVE_REQUEST_TIMEOUT_MS) }, ticket);
            if (ticket.assertCurrent() === false) throw new DOMException('Archive recovery origin changed', 'AbortError');
            const result = await checked(raw);
            await accepted(raw);
            return result;
        });
}

export function stageArchiveRecoveryCommit(ticket, revision, { profilePending = false, profileMemory = null } = {}) {
    if (!tickets.has(ticket) || ticket.released || discardedEntries.has(ticket.entry) || drafts.get(ticket.key) !== ticket.entry || !revision) return false;
    ticket.entry.stage = 'awaiting-commit';
    ticket.entry.committedRevision = String(revision);
    ticket.entry.profilePending = !!profilePending;
    if (profileMemory && ticket.entry.journal?.segments?.some(segment => segment.slot === 'profile' && segment.state !== 'complete')) {
        ticket.entry.profileMemory = structuredClone(Object.fromEntries(['version', 'chatId', 'archiveRevision', 'characterName', 'userName', 'memories']
            .filter(key => Object.hasOwn(profileMemory, key)).map(key => [key, profileMemory[key]])));
    }
    scheduleSave(ticket.storageKey || ticket.key);
    return true;
}

export function finishArchiveProfileRecovery(ticket, committedOrigin) {
    if (!tickets.has(ticket) || ticket.released || discardedEntries.has(ticket.entry) || drafts.get(ticket.key) !== ticket.entry) return false;
    drafts.delete(ticket.key);
    // Only this exact task finished. A separately selected/paused profile does
    // not own another import's paid cover checkpoint, even at the same revision.
    scheduleSave(ticket.storageKey || ticket.key);
    return true;
}

export function releaseArchiveRecovery(ticket) {
    if (!tickets.has(ticket) || ticket.released) return;
    ticket.released = true;
    ticket.entry.active = false;
    recovery.detachGenerationRecovery(ticket.origin);
    scheduleSave(ticket.storageKey || ticket.key);
}

// An explicit user discard / destructive archive action may invoke this. Merely
// closing the overlay must not. Also provides deterministic test cleanup.
export function clearArchiveRecovery(origin, operation = null) {
    for (const kind of operation ? [operation] : ['import', 'profile']) {
        const key = draftKey(origin, kind);
        drafts.delete(key);
        for (const id of drafts.keys()) if (id.startsWith(`${key}:paused:`)) drafts.delete(id);
        scheduleSave(key);
    }
}

// Explicit discard awaits the tombstone; failed persistence restores visible data.
export async function clearArchiveRecoveryDurably(origin, operation = null, { explicitDiscard = false } = {}) {
    for (const kind of operation ? [operation] : ['import','profile']) {
        await hydrateArchiveRecovery(origin, kind);
        const key = draftKey(origin, kind);
        if (!key) continue;
        if (lanes.has(key)) await lanes.get(key).catch(() => {});
        const previous = [...drafts].filter(([id]) => id === key || id.startsWith(`${key}:paused:`));
        if (!explicitDiscard && previous.some(([,entry]) => entry.active)) throw text.safeUserError('当前请求尚未结束，草稿没有清除。', 'RMT_RECOVERY_BUSY');
        if (explicitDiscard) for (const [, entry] of previous) {
            discardedEntries.add(entry);
            entry.active = false;
        }
        for (const [id] of previous) drafts.delete(id);
        try { await saveScope(key); }
        catch (error) { for (const [id,entry] of previous) drafts.set(id,entry); throw error; }
    }
    return true;
}

export function discardArchiveRecovery(origin, operation = null) {
    return clearArchiveRecoveryDurably(origin, operation, { explicitDiscard: true });
}
