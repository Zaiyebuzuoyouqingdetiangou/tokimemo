import * as core_digest from '../core/digest.js';
import * as core_text from '../core/text.js';
import * as recovery_payload from './recoveryPayload.js';
// 生成恢复基础：恢复缓存键与上限、失败原因与重试反馈、恢复摘要
// 从 generation/recovery.js 原样搬出（重构阶段 2），声明文本一字未改；generation/recovery.js 仍转发原有导出。

export const GENERATION_RECOVERY_CACHE_KEY = '__generationRecoveryV1';

export const GENERATION_RECOVERY_LIMITS = Object.freeze({
    segments: 128, segmentChars: 600000, journalChars: 1800000,
    requestChars: 1200000, maxAgeMs: 7 * 24 * 60 * 60 * 1000,
});

export const handles = new WeakMap();

export const handleBindings = new WeakMap();

export const requestTokens = new WeakMap();

export const internalHandles = new WeakSet();

export const TOKEN = Symbol('generation-recovery-request');

const DIGEST = /^[a-f0-9]{64}$/;

const FAILURE_CODE = /^(?:RMT_[A-Z0-9_]{1,80}|RMT_BUTTERFLY_(?:systemNote|monologue|intervention|omega|worldSpec|relationship|unique))$/;

export const COMPATIBILITY_CONTRACTS = Object.freeze({
    'heart-language-birthday-r8412': Object.freeze({ mode: 'heart', slot: /:(?:dialogues|dialogues-full)$/ }),
    'heart-season-siblings-r8412': Object.freeze({ mode: 'heart', slot: /^heart-season:.*:(?:spring|summer|autumn|winter):(?:voice|scenario)$/ }),
    'butterfly-readable-r62': Object.freeze({ mode: 'butterfly', slot: /:(?:slot:\d{1,2}|increment)$/ }),
    'butterfly-legacy-plan-r62': Object.freeze({ mode: 'butterfly', slot: /:(?:slot:\d{1,2}|increment)$/ }),
    'past-lives-readable-r62': Object.freeze({ mode: 'pastLives', slot: /:past-lives-(?:plan|finale|dossier:D\d{2})$/ }),
    'travel-postcard-design-r8415': Object.freeze({ mode: 'travel', slot: /:travel-map$/ }),
    'travel-structured-design-r8416': Object.freeze({ mode: 'travel', slot: /:travel-map$/ }),
    'travel-sketch-design-r8418': Object.freeze({ mode: 'travel', slot: /:travel-map$/ }),
});

export function recoveryError(code, message) {
    const error = new Error(message);
    error.code = code;
    error.safeToDisplay = true;
    error.safeUserMessage = message;
    error.retryable = false;
    error.retryableJson = false;
    return error;
}

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

// Only fixed classifications, never provider text or repairHint, enter feedback.
const RETRY_FEEDBACK = Object.freeze({
    json: '上一轮没有完整 JSON。只输出一个 JSON 对象，第一个字符必须是 {，最后一个字符必须是 }。不要散文、前言或代码围栏。',
    empty: '上一轮没有最终正文 JSON；推理字段不能代替正文。请输出原 schema 的完整 JSON。',
    truncated: '上一轮 JSON 没有闭合。保留已写内容，按原 schema 补齐完整对象，不要只写尾巴。',
    sentences: '上一轮句数不够。逐项核对原提示中的句数和节点数，不得减少。',
    chars: '上一轮字数不够。逐项核对原提示中的字数和汉字下限，不得降低门槛。',
    length: '上一轮句数或字数不够。逐项核对原提示中的句数、字数和必需字段，不得降低门槛。',
    structure: '上一轮结构或完整度未通过。逐项核对原 schema、必需条目和说话人，不得放宽原限制。',
    noconvo: '上一轮通讯没有留下可保存的对话：用户线程被剥空，或没有主人未发送草稿。本轮只写主人一侧至少一条未发送草稿，不要写用户发言，不要凑双向。标题写成给对方的未发送草稿，不要再用“按此 App 用途补齐”。',
    evidence: '上一轮终端条目缺少可保存的完整内容或来源证据。普通日常按人设写正在使用的记录，标题要具体；只有共同过去和私密字段才需要原文。不要返回“按此 App 用途补齐”。',
    speakers: '上一轮说话人或对象未通过校验。当前用户线程只写主人草稿；普通联系人写真实姓名；组卡 owner 用成员真名，不用卡名。',
    mailCount: '上一轮来信封数与 LOCAL_MAIL_PLAN 不一致。每个 slot 恰好写一封，不多不少。',
    mailSlot: '上一轮来信的 slot 重复或缺失。逐项对应 LOCAL_MAIL_PLAN，每个 slot 各写一封。',
    mailEmpty: '上一轮有来信的标题或正文是空的。每封信都要写完整的标题和正文。',
    mailAddress: '上一轮称呼或措辞超出了两人当前的真实关系。只用档案里已经成立的关系称呼对方，不要用尚未成立的亲密称呼。',
    mailHistory: '上一轮把档案里没有依据的共同往事写成了事实。日常信只写今天此刻的心情、眼前的小事和接下来的打算；不要写「上次」「那天」「还记得」「昨天你说」这类回忆两人过去的句子，也不要提起以前来信里写过的事。',
});

const FAILURE_DETAIL = Object.freeze({
    json: '没有完整 JSON',
    empty: '没有最终正文',
    truncated: 'JSON 没有闭合',
    sentences: '句数不够',
    chars: '字数不够',
    length: '句数或字数不够',
    structure: '结构或完整度未通过',
    noconvo: '通讯没有可保存的对话',
    evidence: '缺少可保存的来源证据',
    speakers: '说话人或对象未通过',
    mailCount: '来信封数不对',
    mailSlot: '来信类型重复或缺失',
    mailEmpty: '来信没有写完',
    mailAddress: '称呼超出两人当前关系',
    mailHistory: '写了档案里没有的往事',
});

// 邮箱校验失败时使用插件自己写死的提示文字（safeUserMessage），按原文细分原因。
const MAIL_FAILURE = Object.freeze([
    ['来信未完整返回', 'mailCount'], ['来信类型重复或缺失', 'mailSlot'], ['来信正文还未写完', 'mailEmpty'],
    ['称呼超出了两人当前关系', 'mailAddress'], ['未有依据的共同往事', 'mailHistory'],
]);

function classifyLengthKind(text) {
    const message = String(text || '');
    if (!message) return '';
    const sentences = /句数|台词不足|不足\s*\d+\s*句|少于.{0,12}句|节点不足|段落不足|不足\s*\d+\s*段|后日谈不足|共同回忆不足/.test(message);
    const chars = /字数|汉字|不足\s*\d+\s*字(?!符)|不足\s*\d+\s*字符/.test(message);
    const genericLength = /长度不足/.test(message);
    if ((sentences && chars) || genericLength) return 'length';
    if (sentences) return 'sentences';
    if (chars) return 'chars';
    return '';
}

export function failureFeedback(code, error) {
    if (['RMT_JSON_NOT_FOUND', 'RMT_JSON_INVALID'].includes(code)) return 'json';
    if (['RMT_JSON_EMPTY_FINAL', 'RMT_JSON_EMPTY_FINAL_WITH_REASONING'].includes(code)) return 'empty';
    if (code === 'RMT_JSON_TRUNCATED') return 'truncated';
    // Resume without the original Error still needs a usable class; inspect only
    // local validator copy we already wrote onto the object, never provider bodies.
    const lengthKind = classifyLengthKind([error?.safeUserMessage, error?.message].filter(value => typeof value === 'string').join('\n'));
    if (lengthKind) return lengthKind;
    if (error?.safeToDisplay === true && typeof error.safeUserMessage === 'string') {
        const mail = MAIL_FAILURE.find(([marker]) => error.safeUserMessage.includes(marker));
        if (mail) return mail[1];
    }
    if (code === 'RMT_HEART_INCOMPLETE') return 'length';
    if (code === 'RMT_PHONE_NO_CONVERSATION') return 'noconvo';
    if (code === 'RMT_PHONE_EVIDENCE') return 'evidence';
    if (code === 'RMT_PHONE_SPEAKERS') return 'speakers';
    if (['RMT_SEGMENT_VALIDATION', 'RMT_ROOM_STRUCTURE', 'RMT_ROOM_FIELDS'].includes(code)) return 'structure';
    return '';
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

export function primitiveString(value, max, required = false) {
    if (typeof value !== 'string' || value.length > max || (required && !value)) return null;
    return value;
}

// Own JSON data only: no getters, toJSON hooks, prototypes, cycles, or executable data.
export function jsonData(value, maxChars = GENERATION_RECOVERY_LIMITS.segmentChars, preserveOrder = false) {
    let nodes = 0;
    const active = new Set();
    const copy = (item, depth) => {
        if (++nodes > 100000 || depth > 60) throw new Error('bounds');
        if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
        if (typeof item === 'number' && Number.isFinite(item)) return item;
        if (!item || typeof item !== 'object' || active.has(item)) throw new Error('data');
        const proto = Object.getPrototypeOf(item);
        if (!Array.isArray(item) && proto !== Object.prototype && proto !== null) throw new Error('prototype');
        active.add(item);
        const descriptors = Object.getOwnPropertyDescriptors(item);
        let result;
        if (Array.isArray(item)) {
            if (item.length > 100000) throw new Error('array');
            result = [];
            for (let i = 0; i < item.length; i++) {
                const descriptor = descriptors[i];
                if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error('accessor');
                result.push(copy(descriptor.value, depth + 1));
            }
        } else {
            result = Object.create(null);
            for (const key of (preserveOrder ? Object.keys(descriptors) : Object.keys(descriptors).sort())) {
                if (['__proto__', 'constructor', 'prototype', 'toJSON'].includes(key)) throw new Error('key');
                const descriptor = descriptors[key];
                if (!Object.hasOwn(descriptor, 'value')) throw new Error('accessor');
                result[key] = copy(descriptor.value, depth + 1);
            }
        }
        active.delete(item);
        return result;
    };
    try {
        const text = JSON.stringify(copy(value, 0));
        if (text.length > maxChars) throw new Error('size');
        return text;
    } catch {
        throw recoveryError('RMT_RECOVERY_LIMIT', '这段内容超过可安全保存的续写草稿范围；已保留此前成功部分和旧内容。');
    }
}

export async function generationRecoveryDigest(value) {
    const input = typeof value === 'string' ? value : jsonData(value, GENERATION_RECOVERY_LIMITS.requestChars);
    if (input.length > GENERATION_RECOVERY_LIMITS.requestChars) {
        throw recoveryError('RMT_RECOVERY_UNAVAILABLE', '当前环境无法建立可靠的续写身份，请保留当前页面和旧内容。');
    }
    return core_digest.sha256Text(input);
}

export function recoveryIdentity(origin, mode) {
    const identity = {
        characterKey: primitiveString(origin?.characterKey, 1200, true),
        characterId: primitiveString(origin?.characterId ?? '', 80),
        characterAvatar: primitiveString(origin?.characterAvatar ?? '', 600),
        chatId: primitiveString(origin?.chatId, 1200, true),
        archiveRevision: primitiveString(origin?.archiveRevision, 240, true),
        archiveTargetEntryId: primitiveString(origin?.archiveTargetEntryId ?? '', 240),
        mode: primitiveString(mode, 80, true),
    };
    return Object.values(identity).some(value => value === null) ? null : identity;
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

// Validate JSON ownership first; apply the existing storage limit to the lossless
// stored representation, not to duplicate in-memory copies of shared requests.
// The journal-total limit stays enforced on every write. Read/export/discard
// egress for a journal that already exceeds it passes enforceJournalLimit:false
// so the user can still see, export, and discard it; it can never continue.
function recoveryJournalData(raw, { enforceJournalLimit = true } = {}) {
    const safe = JSON.parse(jsonData(raw, Number.MAX_SAFE_INTEGER, true));
    const expanded = recovery_payload.unpackRecoveryPayload(safe, GENERATION_RECOVERY_LIMITS.requestChars);
    const stored = jsonData(recovery_payload.packRecoveryPayload(expanded),
        enforceJournalLimit ? GENERATION_RECOVERY_LIMITS.journalChars : Number.MAX_SAFE_INTEGER, true);
    return { expanded, stored };
}

export function validJournal(raw, now, { enforceJournalLimit = true } = {}) {
    try {
        // Decode only structurally checked JSON; request/result validation remains unchanged.
        const journal = recoveryJournalData(raw, { enforceJournalLimit }).expanded;
        if (journal.kind !== 'generation-recovery' || journal.version !== 1
            || !recoveryIdentity(journal.identity, journal.identity?.mode)
            || !DIGEST.test(journal.settingsHash || '') || !Array.isArray(journal.segments)
            || journal.segments.length > GENERATION_RECOVERY_LIMITS.segments
            || !Number.isFinite(journal.createdAt) || !Number.isFinite(journal.updatedAt)
            || journal.createdAt > now || journal.updatedAt < journal.createdAt || journal.updatedAt > now) return null;
        if (journal.frozenInputs !== undefined) {
            if (!journal.frozenInputs || typeof journal.frozenInputs !== 'object' || Array.isArray(journal.frozenInputs)) return null;
            for (const [key, value] of Object.entries(journal.frozenInputs)) {
                if (!/^[a-zA-Z0-9:_-]{1,100}$/.test(key) || typeof value !== 'string'
                    || value.length > GENERATION_RECOVERY_LIMITS.requestChars) return null;
                const data = JSON.parse(value);
                jsonData(data, GENERATION_RECOVERY_LIMITS.requestChars, true);
            }
        }
        if (journal.inputSnapshotVersion !== undefined && journal.inputSnapshotVersion !== 1) return null;
        if (journal.contentSnapshotVersion !== undefined && (journal.contentSnapshotVersion !== 1
            || !journal.contentSnapshot || typeof journal.contentSnapshot !== 'object' || Array.isArray(journal.contentSnapshot))) return null;
        if (journal.draftId !== undefined && !primitiveString(journal.draftId, 240, true)) return null;
        if (journal.pageId !== undefined && !primitiveString(journal.pageId, 120, true)) return null;
        if (journal.sourceIdentity !== undefined && !recoveryIdentity(journal.sourceIdentity, journal.sourceIdentity?.mode)) return null;
        if (journal.sourcePolicy !== undefined && (!journal.sourcePolicy || Array.isArray(journal.sourcePolicy)
            || Object.keys(journal.sourcePolicy).some(key => !['character', 'persona', 'selection'].includes(key) || !DIGEST.test(journal.sourcePolicy[key])))) return null;
        const slots = new Set();
        for (const segment of journal.segments) {
            if (!primitiveString(segment.slot, 1000, true) || slots.has(segment.slot)
                || !DIGEST.test(segment.requestHash || '') || !['complete', 'truncated', 'retry'].includes(segment.state)) return null;
            slots.add(segment.slot);
            if (segment.state === 'complete') {
                if (typeof segment.rawJson !== 'string' || segment.rawJson.length > GENERATION_RECOVERY_LIMITS.segmentChars) return null;
                const data = JSON.parse(segment.rawJson);
                if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
            } else if (segment.state === 'truncated') {
                if (typeof segment.partial !== 'string' || !segment.partial || segment.partial.length > GENERATION_RECOVERY_LIMITS.segmentChars
                    || segment.failureCode !== 'RMT_JSON_TRUNCATED') return null;
            }
            // Error messages, request bodies, credentials and arbitrary fields do not re-enter storage.
            for (const key of Object.keys(segment)) {
                if (!['slot', 'requestHash', 'state', 'rawJson', 'partial', 'retainedPartials', 'failureCode', 'failureFeedback', 'contract', 'requestRecipe'].includes(key)) return null;
            }
            if (segment.retainedPartials !== undefined && (!Array.isArray(segment.retainedPartials)
                || segment.retainedPartials.some(value => typeof value !== 'string' || !value.trim()
                    || value.length > GENERATION_RECOVERY_LIMITS.segmentChars))) return null;
            if (segment.failureFeedback !== undefined && !Object.hasOwn(RETRY_FEEDBACK, segment.failureFeedback)) return null;
            if (segment.requestRecipe !== undefined && !validRequestRecipe(segment.requestRecipe)) return null;
            if (Object.hasOwn(segment, 'contract')) {
                const contract = typeof segment.contract === 'string' && Object.hasOwn(COMPATIBILITY_CONTRACTS, segment.contract) && COMPATIBILITY_CONTRACTS[segment.contract];
                if (!contract || contract.mode !== journal.identity.mode || !contract.slot.test(segment.slot)) return null;
            }
        }
        if (journal.failureCode && !FAILURE_CODE.test(journal.failureCode)) return null;
        return journal;
    } catch { return null; }
}

// Read-path-only view of a journal that fails the strict total-size re-check.
// The strict and lenient passes differ only in the journal-total limit, so a
// journal that is readable here but invalid strictly is exactly an oversized
// one: shown for export/discard, never resumed or written back.
export function readableJournal(raw, now) {
    return validJournal(raw, now, { enforceJournalLimit: false });
}

export function generationRecoverySummary(raw, now = Date.now()) {
    const strict = validJournal(raw, now);
    const journal = strict || readableJournal(raw, now);
    if (!journal) return null;
    const oversized = !strict;
    const blocked = !oversized && journal.failureCode === 'RMT_RECOVERY_SNAPSHOT_TOO_LARGE' && !journal.contentSnapshot;
    const completed = journal.segments.filter(segment => segment.state === 'complete').length;
    const truncated = journal.segments.filter(segment => segment.state === 'truncated').length;
    const failed = journal.segments.filter(segment => segment.state === 'retry').length;
    const retryableFailed = journal.segments.some(segment => segment.state === 'retry');
    const segmentFailure = [...journal.segments].reverse().find(segment => segment.state === 'retry' && (segment.failureCode || FAILURE_DETAIL[segment.failureFeedback]));
    const failureCode = journal.failureCode || segmentFailure?.failureCode || '';
    const failureDetail = FAILURE_DETAIL[segmentFailure?.failureFeedback] || FAILURE_DETAIL[failureFeedback(failureCode)] || '';
    const canContinue = !oversized && !blocked && truncated > 0 && (!journal.failureCode || journal.failureCode === 'RMT_JSON_TRUNCATED');
    return {
        mode: journal.identity.mode, completed, truncated, failed, updatedAt: journal.updatedAt,
        canContinue, canRetry: !oversized && !blocked && (retryableFailed || (!canContinue && !!failureCode)),
        failureCode, ...(failureDetail ? { failureDetail } : {}),
        ...(oversized ? { oversized: true } : {}),
        ...(blocked ? { blocked: true, oversized: true } : {}),
        ...(journal.failureCategory ? { failureCategory: journal.failureCategory, failurePhase: journal.failurePhase } : {}),
        ...(journal.snapshotBudget ? { snapshotBudget: journal.snapshotBudget } : {}),
    };
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

function validRequestRecipe(recipe) {
    return !!recipe && recipe.version === 1 && typeof recipe.identity?.prompt === 'string'
        && typeof recipe.identity?.contextEnvelope === 'string'
        && (recipe.actualPrompt === undefined || typeof recipe.actualPrompt === 'string')
        && Object.keys(recipe).every(key => ['version', 'identity', 'actualPrompt', 'contentSettings'].includes(key));
}

export function generationRecoveryForOrigin(origin) {
    const handle = origin && handles.get(origin);
    return handle ? { ...generationRecoverySummary(handle.journal, handle.now()), durable: handle.durable } : null;
}

// Counts and ids only. Callers must not receive segment text, prompts, or evidence.
export function generationRecoveryProgress(origin) {
    try {
        const handle = origin && handles.get(origin);
        if (!handle?.journal) return null;
        const summary = generationRecoverySummary(handle.journal, typeof handle.now === 'function' ? handle.now() : Date.now());
        if (!summary) return null;
        const segments = Array.isArray(handle.journal.segments) ? handle.journal.segments : [];
        return {
            draftId: typeof handle.journal.draftId === 'string' ? handle.journal.draftId.slice(0, 240) : '',
            pageId: typeof handle.journal.pageId === 'string' ? handle.journal.pageId.slice(0, 80) : '',
            mode: summary.mode,
            received: summary.completed + summary.truncated,
            saved: handle.durable === true ? summary.completed : 0,
            total: segments.length,
            durable: handle.durable === true,
        };
    } catch {
        return null;
    }
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
