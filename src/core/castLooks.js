import * as cg_visual from './cgVisualRules.js';
// Per-chat cast appearance.
//
// Stored under its own chat-metadata key, which gives three properties the image prompt
// needs and that no other location provides at once:
//   * it travels with the chat, so one chat's looks can never reach another;
//   * archive create/update only writes MEMORY_KEY and CACHE_KEY, so a rebuilt archive
//     cannot silently overwrite a look the user confirmed by hand;
//   * it is readable while browsing a snapshot, so the prompt never has to read the live
//     character card (which would be a different character during read-only browsing).
import * as core_constants from './constants.js';
import * as core_context from './context.js';
import * as core_text from './text.js';
import * as core_digest from './digest.js';
import * as context_tags from './contextTags.js';
import { state as runtimeState } from './state.js';
import * as archive_repository from '../archive/repository.js';

export const CAST_LOOKS_KEY = 'heartbeatMemoriesCastLooksV1';
export const CAST_LOOKS_FIELD_LIMIT = 400;
const LOOKS_STORE_PREFIX = 'heartbeat_memories_cast_looks_v1:';
const LOOKS_STORE_MAX_CHARS = 12000;

// Multiplayer looks have their own storage contract. Never migrate or rewrite
// the established char/user V1 record when a per-picture participant is edited.
export const PARTICIPANT_LOOKS_KEY = 'heartbeatMemoriesParticipantLooksV1';
const PARTICIPANT_LOOKS_PREFIX = 'heartbeat_memories_participant_looks_v1:';

export function normalizeParticipantLooks(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.characters)) return null;
    const ids = new Set();
    const characters = value.characters.map(row => {
        if (!row || typeof row.participantId !== 'string' || !row.participantId || ids.has(row.participantId)) {
            throw core_text.safeUserError('人物外貌标识重复或缺失，请重新打开图片设置。', 'RMT_CAST_LOOKS_INVALID');
        }
        ids.add(row.participantId);
        return { participantId: row.participantId, tag: core_text.normalizeText(row.tag, CAST_LOOKS_FIELD_LIMIT),
            ...(Object.hasOwn(row, 'nl') ? { nl: core_text.normalizeText(row.nl, CAST_LOOKS_FIELD_LIMIT) } : {}) };
    });
    return { version: 1, chatId: String(value.chatId || ''), identity: String(value.identity || ''),
        updatedAt: Number(value.updatedAt) || 0, characters };
}

export function participantLooksSignature(value) {
    return JSON.stringify(normalizeParticipantLooks(value));
}

export function readParticipantLooks(context = null) {
    let live = context;
    if (!live) { try { live = core_context.getContext(); } catch { return null; } }
    const identity = castLooksIdentity(live);
    const currentChat = core_context.comparableChatId(core_context.getChatId(live));
    const valid = raw => {
        const value = normalizeParticipantLooks(raw);
        return value?.identity === identity && core_context.comparableChatId(value.chatId) === currentChat ? value : null;
    };
    let record = valid(live?.chatMetadata?.[PARTICIPANT_LOOKS_KEY]);
    if (validLiveArchive(live)) {
        try {
            const key = PARTICIPANT_LOOKS_PREFIX + core_digest.sha256Bytes(new TextEncoder().encode(identity));
            const stored = valid(JSON.parse(globalThis.localStorage?.getItem(key) || 'null'));
            if (stored && (!record || stored.updatedAt > record.updatedAt)) record = stored;
        } catch { /* The chat-owned copy remains available. */ }
    }
    return record;
}

export function saveConfirmedParticipantLooks(characters, { origin, expectedSignature } = {}) {
    const live = core_context.currentCharacterGuard();
    const previous = readParticipantLooks(live);
    if (!validLiveArchive(live) || !core_context.isCurrentTaskOrigin(origin, live)
        || archive_repository.requireArchive(live).archiveRevision !== origin?.archiveRevision
        || typeof expectedSignature !== 'string' || participantLooksSignature(previous) !== expectedSignature) {
        throw core_text.safeUserError('聊天、档案或外貌已变化，请重新打开图片设置。', 'RMT_CAST_LOOKS_STALE');
    }
    const incoming = normalizeParticipantLooks({ version: 1, characters });
    if (!incoming) throw core_text.safeUserError('人物外貌格式无效，现有外貌没有改变。', 'RMT_CAST_LOOKS_INVALID');
    const merged = new Map((previous?.characters || []).map(row => [row.participantId, row]));
    for (const row of incoming.characters) merged.set(row.participantId, { ...row, tag: normalizeManualLook(row.tag) });
    const identity = castLooksIdentity(live);
    const record = normalizeParticipantLooks({ version: 1, characters: [...merged.values()], identity,
        chatId: core_context.getChatId(live), updatedAt: Math.max(Date.now(), (previous?.updatedAt || 0) + 1) });
    try {
        if (!globalThis.localStorage?.setItem) throw new Error('unavailable');
        const key = PARTICIPANT_LOOKS_PREFIX + core_digest.sha256Bytes(new TextEncoder().encode(identity));
        globalThis.localStorage.setItem(key, JSON.stringify(record));
    } catch { throw core_text.safeUserError('外貌未能保存，请保留当前编辑内容后重试。', 'RMT_CAST_LOOKS_SAVE_FAILED'); }
    live.chatMetadata[PARTICIPANT_LOOKS_KEY] = record;
    try { live.saveMetadataDebounced?.(); } catch { /* Durable local copy is available. */ }
    return record;
}

// Clause splitting includes the Chinese comma on purpose: a card written as one run-on
// "名字，男，31岁，身高192cm，MBTI：INTJ，太阳星座：天蝎座，…，黑色短发" would otherwise match on
// 身高 and drag MBTI, star signs, food preferences and backstory into the image request.
const LOOK_SPLIT = /[\n。；;!?！？，,、]/;
const LOOK_KEEP = /(头发|长发|短发|发色|发型|银发|黑发|金发|白发|红发|棕发|卷发|直发|眼睛|眼眸|瞳|肤色|皮肤|身高|身形|体型|身材|穿着|衣|袍|制服|西装|衬衫|外套|裙|眼镜|耳环|疤|痣|胡|角|尾|纹身|帽|耳|鼻|唇|脸|肩|肌肉|hair|eyes?|skin|tall|wears?|outfit|glasses|scar|hat|cap|shirt|jacket|dress|coat|uniform|ears?|horns?|tail|wings?|tattoo|build|muscul|slender|lips?|face|freckles|beard|height)/i;
// Facts about the person that are not visible in a picture.
const LOOK_DROP = /(MBTI|INTJ|INTP|ENTJ|ENTP|INFJ|INFP|ENFJ|ENFP|ISTJ|ISFJ|ESTJ|ESFJ|ISTP|ISFP|ESTP|ESFP|星座|生肖|血型|性格|脾气|性子|喜欢|讨厌|爱喝|爱吃|口味|抽烟|喝酒|习惯|擅长|职业|工作|上班|学徒|店|父母|童年|成年后|出生|经历|伪装|面具|想法|情绪|年龄|岁|记得|记性|说话|口头禅|关系|衣柜|\b(?:personality|occupation|childhood|biography|born|parents?|likes?|dislikes?|prefers?|zodiac|blood type|years old)\b)/i;

export function lookFromDescription(description, limit = CAST_LOOKS_FIELD_LIMIT) {
    const raw = core_text.normalizeText(description, 6000)
        .replace(/https?:\/\/\S+/gi, ' ').replace(/<[^>]{0,500}>/g, ' ')
        .replace(/\{\{[^{}]{1,100}\}\}/g, ' ');
    if (!raw) return '';
    const picked = [];
    let used = 0;
    for (const part of raw.split(LOOK_SPLIT)) {
        const clause = cg_visual.automaticAppearanceClause(core_text.normalizeText(part, 160));
        if (!clause || !LOOK_KEEP.test(clause) || LOOK_DROP.test(clause)) continue;
        if (picked.includes(clause)) continue;
        if (used + clause.length + 1 > limit) break;
        picked.push(clause);
        used += clause.length + 1;
    }
    return picked.join('，');
}

// A user-written short tag is not a biography-extraction input. Preserve unfamiliar
// visible features instead of silently dropping them through the automatic whitelist.
export function normalizeManualLook(value) {
    const clean = core_text.normalizeText(value, CAST_LOOKS_FIELD_LIMIT)
        .replace(/https?:\/\/\S+/gi, ' ').replace(/<[^>]{0,500}>/g, ' ')
        .replace(/\{\{[^{}]{1,100}\}\}/g, ' ');
    return clean.split(LOOK_SPLIT).map(part => part.trim()).filter(part => part && !LOOK_DROP.test(part)).join(', ').slice(0, CAST_LOOKS_FIELD_LIMIT);
}

export function normalizeCastLooks(value, chatId = '') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const char = core_text.normalizeText(value.char, CAST_LOOKS_FIELD_LIMIT);
    const user = core_text.normalizeText(value.user, CAST_LOOKS_FIELD_LIMIT);
    if (!char && !user && value.manual !== true) return null;
    return {
        chatId: core_text.normalizeText(value.chatId || chatId, 240),
        char,
        user,
        // Once true, automatic capture must leave this record alone.
        manual: value.manual === true,
        updatedAt: Number(value.updatedAt) || Date.now(),
        ...(typeof value.identity === 'string' ? { identity: value.identity.slice(0, 1800) } : {}),
    };
}

export function readCastLooks(context = null) {
    let live = context;
    if (!live) { try { live = core_context.getContext(); } catch { return null; } }
    const identity = castLooksIdentity(live);
    let record = normalizeCastLooks(live?.chatMetadata?.[CAST_LOOKS_KEY]);
    if (record && ((record.chatId && core_context.comparableChatId(record.chatId) !== core_context.comparableChatId(core_context.getChatId(live)))
        || (record.identity && record.identity !== identity))) record = null;
    // This tiny fallback is never read at bootstrap or used to recreate an archive.
    const stored = validLiveArchive(live) ? readDurableLooks(live, identity) : null;
    if (stored && (!record || (stored.manual && !record.manual) || stored.updatedAt > record.updatedAt)) return stored;
    return record;
}

function castLooksIdentity(context) {
    return JSON.stringify([core_context.comparableChatId(core_context.getChatId(context)),
        String(context?.characterId ?? ''), core_context.currentCharacterAvatar(context),
        core_text.normalizeText(context?.name2, 120), core_text.normalizeText(context?.name1, 120)]);
}

function validLiveArchive(context) {
    if (runtimeState.activeArchiveSnapshot || context?.characterId === undefined || context?.characterId === null || context?.groupId) return false;
    try { return !!archive_repository.requireArchive(context); } catch { return false; }
}

function storageKey(identity) {
    return LOOKS_STORE_PREFIX + core_digest.sha256Bytes(new TextEncoder().encode(identity));
}

function readDurableLooks(context, identity) {
    try {
        const raw = globalThis.localStorage?.getItem(storageKey(identity));
        if (!raw || raw.length > LOOKS_STORE_MAX_CHARS) return null;
        const value = JSON.parse(raw);
        if (value?.version !== 1 || value.identity !== identity) return null;
        const record = normalizeCastLooks(value.record);
        return record?.manual && record.identity === identity
            && core_context.comparableChatId(record.chatId) === core_context.comparableChatId(core_context.getChatId(context)) ? record : null;
    } catch { return null; }
}

export function castLooksSignature(record) {
    const value = normalizeCastLooks(record);
    return JSON.stringify(value ? [value.char, value.user, value.manual, value.updatedAt, value.identity || ''] : null);
}

// Explicit save only: a small synchronous durable write, followed by the host-owned
// debounced metadata mirror. Never call saveChat/saveMetadata directly on TT.
export function saveConfirmedCastLooks(value, { origin, expectedSignature } = {}) {
    const live = core_context.currentCharacterGuard();
    if (!validLiveArchive(live) || !core_context.isCurrentTaskOrigin(origin, live)
        || archive_repository.requireArchive(live).archiveRevision !== origin?.archiveRevision
        || typeof expectedSignature !== 'string' || castLooksSignature(readCastLooks(live)) !== expectedSignature) {
        throw core_text.safeUserError('聊天、档案或外貌已变化，请重新打开图片设置。', 'RMT_CAST_LOOKS_STALE');
    }
    const identity = castLooksIdentity(live);
    const record = normalizeCastLooks({ char: normalizeManualLook(value?.char), user: normalizeManualLook(value?.user),
        chatId: core_context.getChatId(live), identity, manual: true,
        updatedAt: Math.max(Date.now(), (readCastLooks(live)?.updatedAt || 0) + 1) });
    try {
        const serialized = JSON.stringify({ version: 1, identity, record });
        if (serialized.length > LOOKS_STORE_MAX_CHARS || !globalThis.localStorage?.setItem) throw new Error('unavailable');
        globalThis.localStorage.setItem(storageKey(identity), serialized);
    } catch {
        throw core_text.safeUserError('外貌未能保存，请保留当前编辑内容后重试。', 'RMT_CAST_LOOKS_SAVE_FAILED');
    }
    // No await occurred: origin/revision and the compare-and-set still refer to this chat.
    live.chatMetadata[CAST_LOOKS_KEY] = record;
    try { live.saveMetadataDebounced?.(); } catch { /* Durable local copy remains authoritative. */ }
    return record;
}

export function writeCastLooks(context, value, expectedChatId) {
    const live = context || core_context.getContext();
    const current = core_context.getChatId(live);
    if (expectedChatId && core_context.comparableChatId(expectedChatId) !== core_context.comparableChatId(current)) {
        throw core_text.safeUserError('聊天窗口已切换，本次外貌修改没有保存。', 'RMT_CAST_LOOKS_STALE');
    }
    const record = normalizeCastLooks({ ...value, chatId: current, updatedAt: Date.now() }, current);
    if (!record) {
        delete live.chatMetadata[CAST_LOOKS_KEY];
    } else {
        live.chatMetadata[CAST_LOOKS_KEY] = record;
    }
    live.saveMetadataDebounced?.();
    return record;
}

// Capture from the card only when there is nothing yet. A hand-confirmed record is never
// replaced, and an empty extraction is never stored as if it were a real answer.
export function ensureCastLooks(context = null) {
    let live = context;
    if (!live) { try { live = core_context.getContext(); } catch { return null; } }
    const existing = readCastLooks(live);
    if (existing?.manual === true) return existing;
    let card = {};
    try { card = live?.getCharacterCardFields?.() || {}; } catch { return existing; }
    const clean = value => context_tags.filterContextTags(String(value || '').slice(0, 16000), context_tags.tagPolicyForContext(live));
    const char = lookFromDescription([clean(card.description), clean(card.personality)].filter(Boolean).join('\n'));
    const user = lookFromDescription(clean(card.persona || live?.powerUserSettings?.persona_description || ''));
    if (!char && !user) return existing;
    if (existing && existing.char === char && existing.user === user) return existing;
    try { return writeCastLooks(live, { char, user, manual: false }); } catch { return existing; }
}

// The single string that reaches an image request. Names bind a look to a person; the
// event text still supplies clothing, pose and expression.
export function castLooksPromptLine(record, context = null) {
    if (!record) return '';
    let live = context;
    if (!live) { try { live = core_context.getContext(); } catch { live = null; } }
    if (record.manual !== true) record = { ...record, char: lookFromDescription(record.char), user: lookFromDescription(record.user) };
    const rows = [];
    if (record.char) rows.push(`${core_text.normalizeText(live?.name2, 60) || 'character'}: ${record.char}`);
    if (record.user) rows.push(`${core_text.normalizeText(live?.name1, 60) || 'the other person'}: ${record.user}`);
    return core_text.normalizeText(rows.join(' | '), core_constants.MAX_CG_IMAGE_PROMPT_CHARS ? 520 : 520);
}
