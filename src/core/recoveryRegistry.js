import * as core_generationBridge from './generationBridge.js';
import * as recovery_payload from './recoveryPayload.js';
// C-3d（r84.102）：从 generation/recoveryFeedback.js 原样搬来（声明文本一字未改）。

// Recovery storage is not a model context window. Retain valid sources and paid
// results without fixed character/segment quotas; real storage failure still
// stops subsequent requests. These numeric exports remain for legacy readers.
export const GENERATION_RECOVERY_LIMITS = Object.freeze({
    segments: Infinity, segmentChars: Infinity, journalChars: Infinity,
    requestChars: Infinity, maxAgeMs: 7 * 24 * 60 * 60 * 1000,
});

export const handles = new WeakMap();

const DIGEST = /^[a-f0-9]{64}$/;

export const FAILURE_CODE = /^(?:RMT_[A-Z0-9_]{1,80}|RMT_BUTTERFLY_(?:systemNote|monologue|intervention|omega|worldSpec|relationship|unique))$/;

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

// Only fixed classifications, never provider text or repairHint, enter feedback.
export const RETRY_FEEDBACK = Object.freeze({
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
    } catch (error) {
        if (error?.message === 'size') throw recoveryError('RMT_RECOVERY_LIMIT', '这段内容超过调用方指定的保存范围；已保留此前成功部分和旧内容。');
        throw recoveryError('RMT_RECOVERY_DATA', '续写资料未通过 JSON 数据结构校验；已保留此前成功部分和旧内容。');
    }
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

// Validate JSON ownership and preserve the lossless stored representation.
// Legacy size-policy parameters remain accepted, but recovery has no fixed
// character quota; only the durable save acknowledges storage availability.
export function recoveryJournalData(raw, { enforceJournalLimit = true } = {}) {
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

export function generationRecoveryForOrigin(origin) {
    const handle = origin && handles.get(origin);
    return handle ? { ...generationRecoverySummary(handle.journal, handle.now()), durable: handle.durable } : null;
}

function validRequestRecipe(recipe) {
    return !!recipe && recipe.version === 1 && typeof recipe.identity?.prompt === 'string'
        && typeof recipe.identity?.contextEnvelope === 'string'
        && (recipe.actualPrompt === undefined || typeof recipe.actualPrompt === 'string')
        && Object.keys(recipe).every(key => ['version', 'identity', 'actualPrompt', 'contentSettings'].includes(key));
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

// 只加载 core 时（例如测试单独加载 requestCoordinator），任务中心仍通过 generationBridge 读这两项。
// 登记表已在本文件，所以在这里登记；生成层加载后会再用同一个函数登记一次。
core_generationBridge.registerGenerationBridge({ generationRecoveryProgress, generationRecoveryForOrigin });
