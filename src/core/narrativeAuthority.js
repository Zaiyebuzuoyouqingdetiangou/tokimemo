import * as core_text from './text.js';

// One bounded language guard for generated Room / Travel / Terminal prose. This is a
// conservative claim detector, NOT a semantic proof or a source of historical facts.
// Evidence binding remains with each production normalizer. No model flag grants trust.
const PAST = /(?:昨天|昨日|昨晚|前天|去年|前年|往年|从前|以前|过去|旧日|往日|昔年|当年|那年|那天|那晚|那次|上次|曾经|曾在|曾与|曾和|曾一|当初|当时|早先|先前|多年前|几年前|小时候|\b(?:yesterday|previously|formerly|used\s+to|last\s+(?:year|month|week|night|time)|\d+\s+(?:days?|weeks?|months?|years?)\s+ago)\b)/iu;
const FUTURE = /(?:明天|明早|明晚|后天|下次|下周|下个月|以后|未来|接下来|从今|待会|等会|稍后|将来|准备|打算|计划|希望|想好|想要|想和|想陪|想带|愿意|要不要|^等|^如果|\b(?:will|shall|tomorrow|later|soon|hope|wish|want\s+to|plan|going\s+to)\b)/iu;
const RECALL = /(?:还记得|想起|想到|忆起|忆及|回忆|恍若重回|脑海.{0,12}(?:浮现|闪过)|画面.{0,12}(?:眼前|展开)|历历在目|\b(?:remember|recall)\b)/iu;
const EPISODE = /(?:初见|初遇|初识|往事|旧事|旧日|往日|昔年|同游|并肩|当初|当时|那(?:场|次|天|晚|夜|年|段|件)|走过|去过|来过|住过|见过|拍完|交到.{0,16}(?:手里|手中)|收到.{0,20}(?:礼物|信|戒指)|\bfirst\s+(?:met|meeting)\b)/iu;
const ACTION = /(?:送|赠|交|收|寄|写|画|拍|做|织|缝|刻|买|选|挑|留|带|救|拥抱|亲吻|接吻|告白|约定|结婚|同居|旅行|同游|见面|相识|相遇|结识|陪|散步|看|去|走|住|交换|\b(?:gave|sent|wrote|bought|visited|met|married|kissed|hugged|promised)\b)/iu;
const COMPLETED = /(?:(?:送|赠|寄|写|画|拍|做|织|缝|刻|买|选|挑|带|救|拥抱|亲吻|接吻|告白|约定|结婚|同居|旅行|见|陪|看|去|走|住|交换)[^，,。！？!?；;\n]{0,18}(?:了|过)|第一次|初次|所赠|同游|\b(?:gave|sent|wrote|bought|visited|met|married|kissed|hugged|promised)\b)/iu;
const PARTICIPANT = /(?:\{\{user\}\}|你|我们|咱们|两个人|彼此|共同|一起|\b(?:you|your|yours|we|us|our|ours|together)\b)/iu;

export function narrativeClaimsSharedHistory(value, { userName = '', secondPersonIsUser = true } = {}) {
    // Different schema fields have independent subjects and temporal scopes.
    if (Array.isArray(value)) return value.some(item => narrativeClaimsSharedHistory(item, { userName, secondPersonIsUser }));
    let text = core_text.normalizeText(value, 12000);
    const name = core_text.normalizeText(userName, 120);
    if (name) text = text.split(name).join('{{user}}');
    const mentions = part => /\{\{user\}\}/u.test(part) || (secondPersonIsUser && PARTICIPANT.test(part));
    if (!text || !mentions(text)) return false;
    // Negated experiences do not claim that an episode occurred. Strip only this bounded
    // negative predicate, not the surrounding sentence which may contain another real claim.
    text = text.replace(/(?:从未|从没|未曾|不曾|没有|没)(?:一起|共同)?(?:去过|看过|见过|来过|住过|拥抱过|亲吻过)[^，,。！？!?；;\n]{0,16}/gu, '尚无这段经历');
    const relativeGift = /(?:\{\{user\}\}|你)(?:亲手|曾经|以前|去年|昨天)?(?:送|赠|留|寄|买|织|写|画)(?:给)?(?:我|我的)[^，,。！？!?；;\n]{0,12}的|(?:\{\{user\}\}|你)(?:给我的|送我的|留给我的)|\b(?:you\s+(?:gave|sent|made|bought)|from\s+you)\b/iu;
    if (secondPersonIsUser && relativeGift.test(text)) return true;
    if (!secondPersonIsUser && relativeGift.test(text.replace(/你/gu, '对方'))) return true;
    // An individual old object is not an old shared action: "明天一起看看去年我拍的照片".
    // Remove only the bounded first-person noun modifier, never a modifier involving
    // the user/us ("去年我们拍的照片" or "去年我给你写的信" still needs evidence).
    text = text.replace(/(?:去年|前年|往年|以前|从前|过去|当年|那年|上次|昨天|昨日)(?:我|本人)(?:独自|自己)?[^，,。！？!?；;\n]{1,40}?的(?:照片|相片|作品|画作|书|相册|笔记|日记|信|文章|手作|录音|视频|曲子)/gu,
        fragment => mentions(fragment) ? fragment : '个人旧物');
    for (const sentence of text.split(/[。！？!?；;\n]+/u)) {
        if (mentions(sentence) && RECALL.test(sentence) && EPISODE.test(sentence)) return true;
        const clauses = sentence.split(/[，,：:]+/u).map(part => part.trim()).filter(Boolean);
        let pastFrame = false, futureFrame = false, sharedFrame = false;
        for (const clause of clauses) {
            const shared = mentions(clause);
            const action = ACTION.test(clause);
            // Standalone time / name prefixes carry over a comma, not across another
            // unrelated complete sentence ("去年我换了书架。你坐这里吧。" is safe).
            if (PAST.test(clause) && !action) pastFrame = true;
            if (shared && !action) sharedFrame = true;
            if ((shared || sharedFrame) && action && (PAST.test(clause) || pastFrame)) return true;
            const future = FUTURE.test(clause) || futureFrame;
            if (FUTURE.test(clause)) futureFrame = true;
            const possession = /(?:(?:一起|共同).{0,8}(?:买|选|挑|拍|做|织|缝)的|(?:你|\{\{user\}\}).{0,5}(?:挑中|选中|所赠)|(?:挑|选|买|织|写)给你的|收到.{0,16}(?:你|\{\{user\}\})的|(?:你|\{\{user\}\}).{0,20}交到.{0,12}(?:手里|手中)|来自(?:你|\{\{user\}\})|所赠|拍完)/u;
            if (!future && shared && possession.test(clause)) return true;
            if (!future && shared && /(?:初见|初遇|初识|初次相遇|相识之处)/u.test(clause)) return true;
            const eventClause = clause.replace(/看(?:起来|上去)[^，,。！？!?；;\n]{0,12}(?:了|呢|啊)/gu, '看起来如此');
            if (!future && (shared || sharedFrame) && COMPLETED.test(eventClause)
                && !/(?:正在|正给|正替|正为|\b(?:am|is|are)\s+\w+ing\b)/iu.test(clause)) return true;
        }
    }
    return false;
}

export const NARRATIVE_AUTHORITY_PROMPT = `当下对白、生活观察与未来邀请是角色演绎，不必逐字出现在人设中；必须符合双方目前关系，不凭空确认恋爱。只有已经发生的两人共同经历需要真实 Mxxx 与完整 anchor。不要把“你送我的物件”藏在未来打算里，也不要用“昨天，……”拆句绕开来源；不要用设定引文代替正文。`;
