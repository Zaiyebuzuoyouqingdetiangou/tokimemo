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

export const CAST_LOOKS_KEY = 'heartbeatMemoriesCastLooksV1';
export const CAST_LOOKS_FIELD_LIMIT = 240;

// Clause splitting includes the Chinese comma on purpose: a card written as one run-on
// "名字，男，31岁，身高192cm，MBTI：INTJ，太阳星座：天蝎座，…，黑色短发" would otherwise match on
// 身高 and drag MBTI, star signs, food preferences and backstory into the image request.
const LOOK_SPLIT = /[\n。；;!?！？，,、]/;
const LOOK_KEEP = /(头发|长发|短发|发色|发型|银发|黑发|金发|白发|红发|棕发|卷发|直发|眼睛|眼眸|瞳|肤色|皮肤|身高|身形|体型|身材|穿着|衣|袍|制服|西装|衬衫|外套|裙|眼镜|耳环|疤|痣|胡|角|尾|纹身|hair|eyes?|skin|tall|wears?|outfit|glasses|scar)/i;
// Facts about the person that are not visible in a picture.
const LOOK_DROP = /(MBTI|INTJ|INTP|ENTJ|ENTP|INFJ|INFP|ENFJ|ENFP|ISTJ|ISFJ|ESTJ|ESFJ|ISTP|ISFP|ESTP|ESFP|星座|生肖|血型|性格|喜欢|讨厌|爱喝|爱吃|口味|抽烟|喝酒|习惯|擅长|职业|父母|童年|成年后|出生|经历|伪装|面具|想法|情绪|年龄|岁)/i;

export function lookFromDescription(description, limit = CAST_LOOKS_FIELD_LIMIT) {
    const raw = core_text.normalizeText(description, 6000);
    if (!raw) return '';
    const picked = [];
    let used = 0;
    for (const part of raw.split(LOOK_SPLIT)) {
        const clause = core_text.normalizeText(part, 90);
        if (!clause || !LOOK_KEEP.test(clause) || LOOK_DROP.test(clause)) continue;
        if (picked.includes(clause)) continue;
        if (used + clause.length + 1 > limit) break;
        picked.push(clause);
        used += clause.length + 1;
    }
    return picked.join('，');
}

export function normalizeCastLooks(value, chatId = '') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const char = core_text.normalizeText(value.char, CAST_LOOKS_FIELD_LIMIT);
    const user = core_text.normalizeText(value.user, CAST_LOOKS_FIELD_LIMIT);
    if (!char && !user) return null;
    return {
        chatId: core_text.normalizeText(value.chatId || chatId, 240),
        char,
        user,
        // Once true, automatic capture must leave this record alone.
        manual: value.manual === true,
        updatedAt: Number(value.updatedAt) || Date.now(),
    };
}

export function readCastLooks(context = null) {
    let live = context;
    if (!live) { try { live = core_context.getContext(); } catch { return null; } }
    const record = normalizeCastLooks(live?.chatMetadata?.[CAST_LOOKS_KEY]);
    if (!record) return null;
    // Same guard the archive uses: a record whose chatId does not match is not ours.
    return record.chatId && record.chatId !== core_context.getChatId(live) ? null : record;
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
    const char = lookFromDescription([card.description, card.personality].filter(Boolean).join('\n'));
    const user = lookFromDescription(card.persona || live?.powerUserSettings?.persona_description || '');
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
    const rows = [];
    if (record.char) rows.push(`${core_text.normalizeText(live?.name2, 60) || 'character'}: ${record.char}`);
    if (record.user) rows.push(`${core_text.normalizeText(live?.name1, 60) || 'the other person'}: ${record.user}`);
    return core_text.normalizeText(rows.join(' | '), core_constants.MAX_CG_IMAGE_PROMPT_CHARS ? 520 : 520);
}
