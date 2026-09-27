import * as core_digest from '../core/digest.js';
import * as core_text from '../core/text.js';
import * as recovery_payload from './recoveryPayload.js';
import * as core_generationBridge from '../core/generationBridge.js';
import * as recovery_registry from '../core/recoveryRegistry.js';
// C-3d（r84.102）：登记表和进度计算原样在 core/recoveryRegistry.js，这里仍导出同一个值。
export const GENERATION_RECOVERY_LIMITS = recovery_registry.GENERATION_RECOVERY_LIMITS;
export const handles = recovery_registry.handles;
export const COMPATIBILITY_CONTRACTS = recovery_registry.COMPATIBILITY_CONTRACTS;
export const recoveryError = recovery_registry.recoveryError;
export const failureFeedback = recovery_registry.failureFeedback;
export const primitiveString = recovery_registry.primitiveString;
export const jsonData = recovery_registry.jsonData;
export const recoveryIdentity = recovery_registry.recoveryIdentity;
export const validJournal = recovery_registry.validJournal;
export const readableJournal = recovery_registry.readableJournal;
export const generationRecoverySummary = recovery_registry.generationRecoverySummary;
export const generationRecoveryProgress = recovery_registry.generationRecoveryProgress;
export const generationRecoveryForOrigin = recovery_registry.generationRecoveryForOrigin;
const FAILURE_CODE = recovery_registry.FAILURE_CODE;
const RETRY_FEEDBACK = recovery_registry.RETRY_FEEDBACK;
const recoveryJournalData = recovery_registry.recoveryJournalData;

// 生成恢复基础：恢复缓存键与上限、失败原因与重试反馈、恢复摘要
// 从 generation/recovery.js 原样搬出（重构阶段 2），声明文本一字未改；generation/recovery.js 仍转发原有导出。

// C-3b（r84.99）：定义挪到 core/generationBridge.js（core 的缓存代码要读它），这里引用同一个值。
export const GENERATION_RECOVERY_CACHE_KEY = core_generationBridge.GENERATION_RECOVERY_CACHE_KEY;



export const handleBindings = new WeakMap();

export const requestTokens = new WeakMap();

export const internalHandles = new WeakSet();

export const TOKEN = Symbol('generation-recovery-request');


export function generationRecoveryMismatch(category = 'unknown', phase = 'initialization', code = 'RMT_RECOVERY_INPUT_CHANGED') {
    const categories = ['chat', 'character', 'persona', 'archive', 'selection', 'configuration', 'record', 'target', 'operation', 'request', 'attachment', 'unknown'];
    const phases = ['initialization', 'source', 'operation', 'request', 'attachment'];
    const error = recoveryError(code, '原任务的兼容校验未通过；成功内容与原草稿保留，没有自动重新生成。');
    error.archiveInputCategory = categories.includes(category) ? category : 'unknown';
    error.recoveryPhase = phases.includes(phase) ? phase : 'initialization';
    return error;
}

export function recoveryFailureCode(error) {
    // A provider can supply an arbitrary code, including an RMT-prefixed value.
    // Persist only fixed local classifications, never raw error fields.
    const code = core_text.safeErrorDiagnostic(error).code;
    return code && FAILURE_CODE.test(code) ? code : 'RMT_RECOVERY_FAILED';
}


export function generationFailureReason(summary) {
    if (!summary) return '';
    if (summary.canContinue) return '正文未写完';
    if (summary.failureDetail) return summary.failureDetail;
    if (summary.failed && !summary.failureCode) return '上次中断时还没有留下具体失败原因';
    return '';
}

export function generationRetryFeedbackText(code, error) {
    return RETRY_FEEDBACK[failureFeedback(code, error)] || '';
}

export function generationRetryPrompt(prompt, feedback) {
    if (!Object.hasOwn(RETRY_FEEDBACK, feedback || '')) return prompt;
    return `【本地上一轮失败反馈】${RETRY_FEEDBACK[feedback]} 本轮仍只处理当前未完成段，保留原人物身份、资料来源和全部硬性要求。不要把反馈写进正文。\n\n${prompt}`;
}

export function generationPhoneRetryPrompt(prompt, contract) {
    if (contract === 'phone-notes-p0') {
        return `${prompt}\n\n【本地日常应用校验合同修订：仅当前失败 App 段】本段采用以下修订，替代上文把卡名当作者、以及“按此 App 用途与角色生活补齐”的冲突要求；其他 schema、人物来源和证据限制不变，已完成应用不得重做。
- 备忘、工作、学习、阅读、账目、创作等是档案人物自己在用的记录，作者用受控成员真名，不是角色卡名称。
- 当前用户若被提及，用档案显示名；Persona 名只是同一人的别名。不要替用户写已发送留言，不要编造共同历史。
- 标题必须具体，写成「xx的备忘」这类正在使用的条目，不得返回“按此 App 用途与角色生活补齐”。只输出当前 App 的 JSON，不输出这段说明。`;
    }
    if (contract !== 'phone-chat-p0') return prompt;
    return `${prompt}\n\n【本地通讯校验合同修订：仅当前失败通讯段】本段采用以下修订，替代上文“所有线程至少双向”“按此 App 用途补齐”和“speaker 必须等于设备卡名”的冲突要求；其他 schema、人物来源和证据限制不变，已完成应用不得重做。
- 对当前用户的线程只写设备主人一侧至少一条未发送草稿，不得编造用户已发送的发言；没有合法草稿则按原 unavailable 结构返回。标题写成给对方的未发送草稿。
- 只有 basis=记忆且每句都在所引 Mxxx 原文逐字出现时，才可保存已发生的双向消息；摘要对不上逐字原话时只能写主人一侧草稿，不能把摘要当聊天记录。
- 设备 ownerName 仍是原卡名；多人卡 owner 消息的 speaker 使用原受控资料明确出现的成员真名。可在当前 App 对象中输出 "ownerMembers":[{"name":"原资料里的成员显示名","sourceEvidence":"逐字抄录同时包含此姓名的原受控资料原句"}]；成员只能由本次冻结的受控资料验证，不得从模型猜测、新聊天或草稿推演取得。单人卡仍使用原人物名。
- 联系人、线程对象、字段名和已有条目 ID 均遵从当前原任务；没有合法对象或没有主人草稿的条目返回 unavailable，不为凑数量编造记录。只输出当前 App 的 JSON，不输出这段说明。`;
}



export async function generationRecoveryDigest(value) {
    const input = typeof value === 'string' ? value : jsonData(value, GENERATION_RECOVERY_LIMITS.requestChars);
    if (input.length > GENERATION_RECOVERY_LIMITS.requestChars) {
        throw recoveryError('RMT_RECOVERY_UNAVAILABLE', '当前环境无法建立可靠的续写身份，请保留当前页面和旧内容。');
    }
    return core_digest.sha256Text(input);
}


// Volatile page-level holds for replies that arrived but could not enter the
// journal within its existing total capacity. This is not a new storage tier:
// bounded volatile page memory only, cleared on discard, and exposed solely
// through the existing explicit user export path. No limit is raised and no
// old draft is dropped to make room.
const unsavedReplyHolds = new Map();

const UNSAVED_REPLY_HOLD_LIMITS = Object.freeze({ perIdentity: 8, identities: 16 });

const HELD_REPLY_EXPORT_HINT = '本次新收到的成果已保留在当前页面，可通过恢复区“导出未提交草稿”一并导出。';

// Accurate only where a hold actually succeeded; best effort on the error
// object itself so a frozen/host-owned error never masks the hold.
export function noteHeldReplyExport(error) {
    try {
        error.message = `${typeof error.message === 'string' ? error.message : ''}${HELD_REPLY_EXPORT_HINT}`;
        if (typeof error.safeUserMessage === 'string') error.safeUserMessage = `${error.safeUserMessage}${HELD_REPLY_EXPORT_HINT}`;
    } catch { /* A read-only error object keeps its original message. */ }
}

function unsavedReplyHoldKey(identitySource, mode) {
    const identity = recoveryIdentity(identitySource, mode);
    return identity ? JSON.stringify(identity) : null;
}

export function holdUnsavedReply(handle, slot, rawJson) {
    // rawJson already passed the jsonData segment bound; assert defensively.
    if (typeof slot !== 'string' || !slot || typeof rawJson !== 'string' || !rawJson
        || rawJson.length > GENERATION_RECOVERY_LIMITS.segmentChars) return false;
    const key = unsavedReplyHoldKey(handle?.journal?.identity, handle?.journal?.identity?.mode);
    if (!key) return false;
    const previous = unsavedReplyHolds.get(key) || [];
    if (previous.some(entry => entry.slot === slot && entry.rawJson === rawJson)) return true;
    const entries = [...previous, { slot, rawJson, at: typeof handle.now === 'function' ? handle.now() : Date.now() }]
        .slice(-UNSAVED_REPLY_HOLD_LIMITS.perIdentity);
    unsavedReplyHolds.delete(key);
    unsavedReplyHolds.set(key, entries);
    while (unsavedReplyHolds.size > UNSAVED_REPLY_HOLD_LIMITS.identities) unsavedReplyHolds.delete(unsavedReplyHolds.keys().next().value);
    return true;
}

export function generationRecoveryHeldReplies(origin, mode) {
    const key = unsavedReplyHoldKey(origin, mode);
    const entries = key ? unsavedReplyHolds.get(key) : null;
    return entries ? entries.map(entry => ({ ...entry })) : [];
}

export function discardGenerationRecoveryHeldReplies(origin, mode) {
    const key = unsavedReplyHoldKey(origin, mode);
    if (key) unsavedReplyHolds.delete(key);
}

// Best-effort page projection of a held reply. The view is never written back
// to the journal and handle.publishedProgress is left untouched; a failing
// projection never drops the hold. AbortError still stops the task.
export async function projectHeldReply(handle, slot, requestHash, rawJson) {
    if (!handle.onProgress) return;
    checkCurrent(handle);
    const snapshot = generationRecoverySnapshot(handle);
    if (!snapshot) return;
    const view = snapshot.segments.some(row => row.slot === slot) ? snapshot
        : { ...snapshot, segments: [...snapshot.segments, { slot, requestHash, state: 'truncated', partial: rawJson }] };
    try { await handle.onProgress(view); }
    catch (error) { if (error?.name === 'AbortError') throw error; }
}




// Only a failed attempt with no received content may start again from current
// inputs. A complete segment, truncated response or retained partial is paid
// work and must never enter this compatibility escape hatch.
export function canRestartLegacyConfiguration(raw) {
    const journal = validJournal(raw, Date.now());
    return !!journal && !readGenerationContentSnapshot(journal) && journal.segments.length > 0
        && journal.segments.every(row => row.state === 'retry' && !row.rawJson && !row.partial && !row.retainedPartials?.length);
}

// Explicit user export only. Do not include arbitrary top-level properties or
// settings/provider objects. This is inert recovery data, not import authority.
export function exportGenerationRecovery(raw) {
    const strict = validJournal(raw, Date.now());
    const journal = strict || readableJournal(raw, Date.now());
    if (!journal) throw generationRecoveryMismatch('record');
    const keys = ['kind', 'version', 'identity', 'settingsHash', 'createdAt', 'updatedAt', 'segments',
        'failureCode', 'failureCategory', 'failurePhase', 'frozenInputs', 'inputSnapshotVersion', 'sourcePolicy',
        'operation', 'replaceExisting', 'draftId', 'pageId', 'sourceIdentity', 'contentSnapshotVersion', 'contentSnapshot',
        'snapshotBudget'];
    const pick = item => recovery_payload.packRecoveryPayload(Object.fromEntries(keys.filter(key => Object.hasOwn(item, key)).map(key => [key, item[key]])));
    const bundle = { kind: 'hearttrace-module-recovery-export', version: 1, journal: pick(journal),
        previousAttempts: (Array.isArray(journal.previousAttempts) ? journal.previousAttempts : []).map(pick) };
    // An oversized journal leaves only through this explicit export; mark it so
    // the receiving side never mistakes it for a continuable record.
    if (!strict) bundle.oversized = true;
    return bundle;
}

export function attachGenerationRecovery(origin, handle) {
    if (!origin || typeof origin !== 'object' || !internalHandles.has(handle)) return false;
    handles.set(origin, handle);
    return true;
}

export function detachGenerationRecovery(origin) {
    if (origin && typeof origin === 'object') handles.delete(origin);
}

export function generationRecoverySnapshot(handle) {
    return internalHandles.has(handle) ? recoveryJournalData(handle.journal).expanded : null;
}

export function readGenerationContentSnapshot(value) {
    const journal = internalHandles.has(value) ? value.journal : value;
    if (journal?.contentSnapshotVersion !== 1 || !journal.contentSnapshot || typeof journal.contentSnapshot !== 'object' || Array.isArray(journal.contentSnapshot)) return null;
    try { return JSON.parse(jsonData(journal.contentSnapshot, GENERATION_RECOVERY_LIMITS.requestChars, true)); } catch { return null; }
}

export function generationContentSnapshotForOrigin(origin) {
    const handle = origin && handles.get(origin);
    return handle ? readGenerationContentSnapshot(currentAttachedJournal(origin, handle)) : null;
}

export async function persistGenerationRecovery(handle) {
    if (!internalHandles.has(handle)) return false;
    const saved = await changeJournal(handle, () => {});
    if (!saved && !handle.pageOnly) throw recoveryError('RMT_RECOVERY_STORAGE', '原任务资料未能保存，未发起生成请求；旧内容和草稿仍保留。');
    return saved;
}

// Publish after the journal acknowledges durable storage. A separate lane keeps
// projections ordered without re-entering the journal's storage transaction.
// Failure here must never turn a received complete segment back into a retry.
export async function publishGenerationRecoveryProgress(handle) {
    if (!internalHandles.has(handle) || !handle.onProgress) return false;
    const operation = handle.progressLane.catch(() => {}).then(async () => {
        checkCurrent(handle);
        if (!handle.durable) return false;
        const journal = generationRecoverySnapshot(handle);
        const received = journal.segments.filter(row => row.state === 'complete' || row.state === 'truncated');
        if (!received.length) return false;
        const signature = JSON.stringify({ segments: received.map(row => ({ slot: row.slot,
            state: row.state, rawJson: row.rawJson, partial: row.partial, retainedPartials: row.retainedPartials })),
            operation: journal.operation, frozenInputs: journal.frozenInputs });
        if (signature === handle.publishedProgress) return true;
        try {
            await handle.onProgress(journal);
            checkCurrent(handle);
            handle.publishedProgress = signature;
            return true;
        } catch (error) {
            if (error?.name === 'AbortError') throw error;
            throw recoveryError('RMT_RECOVERY_PROGRESS_STORAGE', '已收到的正文和成功分段仍在草稿中，但可阅读成果暂未保存成功；已停止后续请求，可检查本地存储后继续，不会重做成功段。');
        }
    });
    handle.progressLane = operation;
    return operation;
}




export function currentAttachedJournal(origin, handle) {
    checkCurrent(handle);
    const journal = validJournal(handle.journal, handle.now());
    const binding = handleBindings.get(handle);
    // The live origin may omit the canonical index ID which beginModeRecovery
    // adds when creating the handle. No other identity component is aliased.
    const identity = recoveryIdentity({ ...origin,
        archiveTargetEntryId: origin?.archiveTargetEntryId || journal?.identity?.archiveTargetEntryId || '',
    }, journal?.identity?.mode);
    if (!journal || !binding || !identity || jsonData(journal.identity) !== binding.identity
        || jsonData(identity) !== binding.identity || journal.settingsHash !== binding.settingsHash) {
        throw generationRecoveryMismatch('attachment', 'attachment');
    }
    checkCurrent(handle);
    return journal;
}

// Planning data only, never acceptance authority. Callers must still replay each
// complete segment through withRecoverySegment and its production validator.
export function generationRecoverySegmentsForOrigin(origin) {
    const handle = origin && handles.get(origin);
    if (!handle) return null;
    return currentAttachedJournal(origin, handle).segments.map(segment => ({
        slot: segment.slot, state: segment.state,
        ...(segment.state === 'complete' ? { rawJson: segment.rawJson } : {}),
        ...(segment.contract ? { contract: segment.contract } : {}),
    }));
}

export function checkCurrent(handle) {
    if (handle.assertCurrent() === false) throw new DOMException('Generation recovery origin changed', 'AbortError');
}

export async function changeJournal(handle, mutate) {
    const operation = handle.lane.catch(() => {}).then(async () => {
        checkCurrent(handle);
        const next = generationRecoverySnapshot(handle);
        mutate(next);
        next.updatedAt = handle.now();
        const { expanded, stored } = recoveryJournalData(next);
        if (next.segments.length > GENERATION_RECOVERY_LIMITS.segments) {
            throw recoveryError('RMT_RECOVERY_LIMIT', '本轮续写草稿已达到分段上限，此前成功部分和旧内容仍保留。');
        }
        checkCurrent(handle);
        // Preserve an in-page copy even if durable storage is temporarily unavailable.
        handle.journal = expanded;
        try { handle.durable = typeof handle.save === 'function' && await handle.save(JSON.parse(stored)) !== false; }
        catch (error) {
            handle.durable = false;
            if (error?.name === 'AbortError') throw error;
        }
        checkCurrent(handle);
        return handle.durable;
    });
    handle.lane = operation;
    return operation;
}
