// One controlled world-presentation decision shared by room, travel and private terminal.
// World style is derived from provenance-bearing evidence units. A movie, game, exhibition,
// dream or role-play reference must never upgrade the whole world merely by repeating keywords.
import * as core_text from './text.js';

const WORLD_STYLES = Object.freeze(['contemporary', 'historical', 'fantasy', 'scifi', 'nomadic', 'maritime', 'institutional']);
const STYLE_RULES = Object.freeze({
    contemporary: [/(?:现代|当代|智能手机|互联网|社交媒体|都市生活|公寓|地铁|modern|contemporary|smartphone|internet|social media|subway)/iu],
    historical: [/(?:古代|王朝|宫廷|中世纪|维多利亚|江户|武士|骑士|蒸汽时代|historical|ancient|medieval|victorian|edo|samurai)/iu],
    fantasy: [/(?:魔法|法师|精灵|龙族|异世界|神殿|灵力|仙门|妖族|使魔|fantasy|magic|mage|elf|dragon|arcane|familiar)/iu],
    scifi: [/(?:科幻|赛博|星舰|飞船|空间站|宇宙航行|未来科技|仿生人|机甲|数据终端|sci[- ]?fi|cyber|starship|spaceship|space station|android|mecha)/iu],
    nomadic: [/(?:游牧|营帐|帐篷|迁徙部族|荒野营地|nomad|nomadic|yurt|encampment)/iu],
    maritime: [/(?:航海|水手|船舱|舰桥|海港|远洋船|海上生活|maritime|sailor|ship cabin|naval|seafaring)/iu],
    institutional: [/(?:寄宿学校|学生宿舍|军营|医院宿舍|研究所|实验室宿舍|学院宿舍|dormitory|boarding school|barracks|research institute|campus housing)/iu],
});
const PROFILE_WORLD_FACT_LABELS = new Set(['职业 / 学校', '社团 / 工作']);
const CARD_IDENTITY_PATH_RE = /(?:occupation|profession|job|identity|species|race|era|world|setting|school|academy|residence|technology|职业|身份|种族|时代|世界|学校|住处|科技)/iu;
const WORLD_STATE_RE = /(?:常驻|居住|住在|生活(?:在|于)?|工作(?:在|于)?|任职|担任|就读|上学|使用|驾驶|乘坐|来自|出生于|身处|隶属|日常|每天|每夜|回到|驻扎|世界(?:观|设定|背景)?|时代(?:设定|背景)?|职业|身份|种族|学校|住所|住处|是|为|\b(?:lives?|living|resides?|dwells?|works?|employed|serves?|studies?|attends?|uses?|rides?|travels?|stationed|based|from|born|returns?|world|setting|era|profession|occupation|identity|species|is|are)\b)/iu;
const ARCHIVE_WORLD_EVENT_RE = /(?:在.{0,28}(?:醒来|休息|过夜|上班|工作|学习|行动|停留|回家)|乘(?:坐)?.{0,28}(?:上班|工作|回家|抵达|前往)|施法|使用.{0,20}(?:传送|终端|星舰|飞船)|\b(?:woke|slept|worked|studied|commuted|travelled|traveled|returned|cast\s+magic|used)\b)/iu;
// Media/fiction scope and state negation deliberately use separate state machines.
// A media frame may span punctuation until the source explicitly returns to reality;
// a negated state may be replaced by a later, clearly positive state assertion.
const MEDIA_FRAME_RE = /(?:(?:书|小说|同人文|画册|漫画|动画|童话|寓言|电影|影片|片|影视|影像|视频|短视频|MV|戏|剧|连续剧|电视剧|番剧|故事|作品|人设|角色设定|荧幕|银幕|屏幕|电视|游戏|手游|梦|梦境|梦乡|脑海|幻想|想象|设想|臆想|遐想|幻觉|幻象|模拟(?:器|场景|世界)?|虚拟(?:现实|场景|世界)?|VR(?:场景|世界)?)(?:之)?(?:中|里|内|上)|梦到|梦见|做梦|\b(?:(?:in|inside|on)\s+(?:a|the)?\s*(?:book|novel|fanfic|screenplay|comic|anime|film|movie|video|show|series|story|fable|fairy\s*tale|picture\s*book|fiction|screen|television|tv|game|dream|imagination|simulation|virtual\s+reality|vr\s+world)|(?:on|upon)\s+(?:the\s+)?screen)\b)/iu;
const MEDIA_ACTIVITY_RE = /(?:喜欢|喜爱|爱好|兴趣|观看|看过|看剧|追剧|玩过|读过|参观过|电影|影片|影视|影像|视频|游戏|手游|小说|同人文|画册|漫画|动画|童话|寓言|电视剧|番剧|博物馆|展览|展会|舞台|演出|梦境|幻觉|幻象|幻想|假想|想象|假设|设想|臆想|遐想|比喻|角色扮演|扮演|cosplay|模拟|虚拟|题材|剧本|作品|人设|粉丝|\b(?:likes?|favorite|favourite|hobby|watched?|played|read|visited|movie|film|video|game|novel|fanfic|screenplay|comic|anime|television|tv|museum|exhibit|show|series|story|fable|fairy\s*tale|picture\s*book|dream(?:ed|t)?|hallucination|hypothetical|imaginary|imagination|metaphor|role[- ]?play|cosplay|simulat(?:ion|ed)|virtual\s+reality|fiction|fan\s+of)\b)/iu;
const HYPOTHETICAL_FRAME_RE = /(?:如果|假如|倘若|要是|假设|试想|\b(?:if|suppose|supposing|assuming|imagine|what\s+if)\b)/iu;
const NEGATION_CUE_RE = /(?:尚未|并未|未曾|未能|未(?=(?:在|担任|使用|驾驶|就读|任职|生活|工作|居住|住在|乘坐|来自|属于|身处))|已非|从(?:未|不)|不(?:再)?(?:在|住|居住|生活|工作|任职|担任|就读|使用|驾驶|乘坐|来自|属于|身处)|无法|不能|不会|没(?:能|有|去过)|并无.{0,24}(?:经历|身份|职业|种族|住所|住处|设定)|并不|不是|并非|绝非|不存在|无.{0,20}(?:身份|职业|种族|住所|住处|设定)|(?:本人|角色|他|她)\s*非|\b(?:not|never|no\s+longer|no\s+such|hasn't|haven't|hadn't|isn't|aren't|wasn't|weren't|cannot|can't|unable\s+to|won't|wouldn't|don't|doesn't|didn't|do(?:es)?\s+not|did\s+not)\b)/iu;
const STRONG_REALITY_RESET_RE = /^(?:(?:但是?|不过|而|同时)[，,\s]*)?(?:现实(?:中|里)|现实世界(?:中|里)?|实际上|事实上|当前世界(?:观|设定)?|本世界(?:中|里)?|\b(?:in\s+reality|in\s+the\s+real\s+world|actually|in\s+fact)\b)/iu;
const SUBJECT_RESET_RE = /^(?:(?:但是?|不过|而|同时)[，,\s]*)?(?:本人|我本人|角色本人|他|她|\b(?:the\s+character|i\s+myself|he|she)\b)/iu;
const POSITIVE_STATE_RESET_RE = /^(?:(?:但是?|不过|然而)[，,\s]*)?(?:而是|其实是|实际是|改为|变为|现已|现在|如今|目前|此刻|后来|之后|\b(?:instead|rather|now|currently|today|but\s+(?:is|are|now))\b)/iu;
const CLOSED_ENTERTAINMENT_RE = /(?:喜欢|喜爱|爱好|兴趣|观看|看过|玩过|读过|参观过|粉丝|\b(?:likes?|favorite|favourite|hobby|watched?|played|read|visited|fan\s+of)\b)/iu;

function extractEnvelopeSection(envelope, start, end) {
    const text = String(envelope || '');
    const startIndex = text.indexOf(start);
    if (startIndex < 0) return '';
    const from = startIndex + start.length;
    const endIndex = end ? text.indexOf(end, from) : -1;
    return core_text.normalizeText(text.slice(from, endIndex >= 0 ? endIndex : undefined), 20000);
}

function controlledSources(contextEnvelope = '') {
    const cardRaw = extractEnvelopeSection(contextEnvelope, 'CHARACTER_CARD_JSON:', '\nUSER_PERSONA_JSON:');
    const worldRaw = extractEnvelopeSection(contextEnvelope, 'WORLD_INFO_TEXT:', '\n【上下文结束】');
    let card = {};
    try { card = JSON.parse(cardRaw); } catch {}
    return { cardRaw, worldRaw, card: card && typeof card === 'object' ? card : {} };
}

function provenanceText(value, limit = 20000) {
    return core_text.normalizeText(value, limit);
}

function flattenControlledUnits(value, output = [], depth = 0, path = 'root') {
    if (depth > 5 || output.length >= 180) return output;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        const text = provenanceText(value, 5000);
        if (text) output.push({ text, path });
    } else if (Array.isArray(value)) {
        value.slice(0, 40).forEach((item, index) => flattenControlledUnits(item, output, depth + 1, `${path}[${index}]`));
    } else if (value && typeof value === 'object') {
        Object.entries(value).slice(0, 60).forEach(([key, item]) => flattenControlledUnits(item, output, depth + 1, `${path}.${key}`));
    }
    return output;
}

function flattenControlledValue(value) {
    return flattenControlledUnits(value).map(item => item.text);
}

export function controlledWorldEvidence(contextEnvelope = '', memoryBank = null) {
    const { card, worldRaw } = controlledSources(contextEnvelope);
    const canonicalMemories = (Array.isArray(memoryBank?.memories) ? memoryBank.memories : []).slice(0, 120).map(item => [
        core_text.normalizeText(item?.title, 160),
        core_text.normalizeText(item?.summary, 1200),
        core_text.cleanArray(item?.anchors, 12, 160).join('、'),
    ].filter(Boolean).join('：')).filter(Boolean);
    return core_text.normalizeText([...flattenControlledValue(card), worldRaw, ...canonicalMemories].filter(Boolean).join('\n'), 32000);
}

export function controlledSettingEvidence(contextEnvelope = '') {
    const { card, worldRaw } = controlledSources(contextEnvelope);
    // Calendar setting days may come from the character card or activated world-info only.
    // USER_PERSONA and archive memories are intentionally excluded.
    return core_text.normalizeText([...flattenControlledValue(card), worldRaw].filter(Boolean).join('\n'), 26000);
}

export function controlledCharacterEvidence(contextEnvelope = '') {
    const { card } = controlledSources(contextEnvelope);
    // Character ownership facts stay narrower than general world information.
    return core_text.normalizeText(flattenControlledValue(card).filter(Boolean).join('\n'), 22000);
}

export function controlledCalendarEvidence(contextEnvelope = '') {
    const cardRaw = extractEnvelopeSection(contextEnvelope, 'CHARACTER_CARD_JSON:', '\nUSER_PERSONA_JSON:');
    const personaRaw = extractEnvelopeSection(contextEnvelope, 'USER_PERSONA_JSON:', '\nWORLD_INFO_TEXT:');
    const worldRaw = extractEnvelopeSection(contextEnvelope, 'WORLD_INFO_TEXT:', '\n【上下文结束】');
    let card = {};
    let persona = {};
    try { card = JSON.parse(cardRaw); } catch {}
    try { persona = JSON.parse(personaRaw); } catch {}
    return core_text.normalizeText([...flattenControlledValue(card), ...flattenControlledValue(persona), worldRaw].filter(Boolean).join('\n'), 30000);
}

function matchingStyles(text) {
    const clean = core_text.normalizeText(text, 1600).toLowerCase();
    if (!clean) return [];
    return WORLD_STYLES.filter(style => STYLE_RULES[style].some(rule => rule.test(clean)));
}

function hasPositiveWorldState(text) {
    const clean = core_text.normalizeText(text, 1600);
    if (!clean || NEGATION_CUE_RE.test(clean)) return false;
    return WORLD_STATE_RE.test(clean) || matchingStyles(clean).length > 0;
}

function hasNegatedWorldState(text) {
    const clean = core_text.normalizeText(text, 1600);
    if (!clean || !NEGATION_CUE_RE.test(clean)) return false;
    return WORLD_STATE_RE.test(clean) || matchingStyles(clean).length > 0;
}

function scopedProvenanceStatements(text) {
    const clean = core_text.normalizeText(text, 1600);
    if (!clean) return [];
    const statements = [];
    let mediaScope = false;
    let negationScope = false;
    let previousMediaWasClosed = false;
    // Keep media scope across punctuation: `梦里。自己住在空间站` is still a dream,
    // not a new source. Negation has a separate lifetime so a clearly positive correction
    // can replace it without accidentally laundering an open movie/dream frame.
    // Parent provenance is never split into a second authority-bearing source.
    for (const assertion of clean.split(/[。.!！？?；;\n]+/u).map(item => item.trim()).filter(Boolean)) {
        const clauses = assertion.split(/[，,：:]+/u).map(item => item.trim()).filter(Boolean);
        const firstClause = clauses[0] || '';
        const positiveAssertion = hasPositiveWorldState(assertion);
        // Media can only be closed by an explicit reality assertion, or by a fresh subject
        // after a complete preference/consumption assertion. A bare subject never closes a
        // book/screen/dream frame.
        if (mediaScope && positiveAssertion
            && (STRONG_REALITY_RESET_RE.test(assertion)
                || (previousMediaWasClosed && SUBJECT_RESET_RE.test(firstClause)))) {
            mediaScope = false;
        }
        // Negation can be replaced by an explicit transition/correction or a fresh positive
        // subject assertion. This accepts `以前不是法师。如今本人是工程师` while still
        // rejecting `不再在空间站工作` itself.
        if (negationScope && positiveAssertion
            && (POSITIVE_STATE_RESET_RE.test(assertion)
                || STRONG_REALITY_RESET_RE.test(assertion)
                || SUBJECT_RESET_RE.test(firstClause))) {
            negationScope = false;
        }
        let assertionHasMedia = false;
        for (const clause of clauses) {
            const hasMediaFrame = MEDIA_FRAME_RE.test(clause) || MEDIA_ACTIVITY_RE.test(clause) || HYPOTHETICAL_FRAME_RE.test(clause);
            if (hasMediaFrame) {
                mediaScope = true;
                assertionHasMedia = true;
            }
            if (hasNegatedWorldState(clause)) negationScope = true;
            if (negationScope && hasPositiveWorldState(clause) && POSITIVE_STATE_RESET_RE.test(clause)) {
                negationScope = false;
            }
            statements.push({
                text: clause,
                blocked: mediaScope || negationScope,
                mediaBlocked: mediaScope,
                negated: negationScope,
            });
        }
        previousMediaWasClosed = assertionHasMedia && CLOSED_ENTERTAINMENT_RE.test(assertion);
    }
    return statements;
}

function qualifiedStyles(text, { identityFact = false, archiveEvidence = false } = {}) {
    const styles = [];
    for (const statement of scopedProvenanceStatements(text)) {
        if (statement.blocked) continue;
        if (!identityFact && !WORLD_STATE_RE.test(statement.text)
            && !(archiveEvidence && ARCHIVE_WORLD_EVENT_RE.test(statement.text))) continue;
        styles.push(...matchingStyles(statement.text));
    }
    return [...new Set(styles)];
}

function settingEvidenceDecision(sources) {
    const units = [
        ...flattenControlledUnits(sources.card).map((item, index) => ({
            ...item,
            id: `card:${item.path}:${index}`,
            identityFact: CARD_IDENTITY_PATH_RE.test(item.path),
        })),
        ...(sources.worldRaw ? [{ text: sources.worldRaw, id: 'world:active', identityFact: false }] : []),
    ];
    const accepted = [];
    for (const unit of units) {
        for (const style of qualifiedStyles(unit.text, unit)) accepted.push({ style, id: unit.id });
    }
    const styles = [...new Set(accepted.map(item => item.style))];
    if (styles.length > 1) return { state: 'conflict', source: 'setting-conflict', style: 'neutral', ids: accepted.map(item => item.id) };
    if (styles.length === 1) return { state: 'accepted', source: 'setting', style: styles[0], ids: accepted.map(item => item.id), votes: accepted.length };
    return { state: 'none', source: 'none', style: 'neutral', ids: [] };
}

function foldedEvidence(value) {
    return core_text.normalizeText(value, 24000).replace(/\s+/g, '').toLocaleLowerCase();
}

function characterProfileDecision(sources, binding = null) {
    const profile = binding?.profile;
    const expectedKey = core_text.normalizeText(binding?.expectedProfileKey, 160);
    const expectedName = core_text.normalizeText(binding?.characterName || sources.card?.name, 120);
    const expectedAvatar = core_text.normalizeText(binding?.avatar, 300);
    const profileKey = core_text.normalizeText(profile?.key, 160);
    const profileName = core_text.normalizeText(profile?.characterName, 120);
    const profileAvatar = core_text.normalizeText(profile?.avatar, 300);
    if (!profile || !expectedKey || profileKey !== expectedKey || !expectedName || profileName !== expectedName) {
        return { state: 'none', source: 'none', style: 'neutral', ids: [] };
    }
    if (expectedAvatar && profileAvatar !== expectedAvatar) return { state: 'none', source: 'none', style: 'neutral', ids: [] };
    const sourceUnits = {
        character_card: flattenControlledUnits(sources.card),
        world_info: sources.worldRaw ? [{ text: sources.worldRaw, path: 'active-world-info' }] : [],
    };
    const accepted = [];
    for (const [index, fact] of (Array.isArray(profile.facts) ? profile.facts : []).slice(0, 20).entries()) {
        const label = core_text.normalizeText(fact?.label, 40);
        const sourceType = core_text.normalizeText(fact?.sourceType, 30).toLowerCase();
        const evidence = core_text.normalizeText(fact?.sourceEvidence, 240);
        if (!PROFILE_WORLD_FACT_LABELS.has(label) || !Object.hasOwn(sourceUnits, sourceType) || !evidence) continue;
        const matchingUnits = sourceUnits[sourceType].filter(unit => foldedEvidence(unit.text).includes(foldedEvidence(evidence)));
        // Ambiguous repeated fragments cannot prove which current source unit authorized the fact.
        if (matchingUnits.length !== 1) continue;
        const matchingStatements = scopedProvenanceStatements(matchingUnits[0].text)
            .filter(statement => foldedEvidence(statement.text).includes(foldedEvidence(evidence)));
        // The profile excerpt must resolve to one local assertion in its current parent source.
        // A shortened fragment cannot escape a movie/dream qualifier from that same assertion.
        if (matchingStatements.length !== 1 || matchingStatements[0].blocked) continue;
        for (const style of qualifiedStyles(matchingStatements[0].text, { identityFact: true })) {
            accepted.push({ style, id: `profile:${profileKey}:${index}` });
        }
    }
    const styles = [...new Set(accepted.map(item => item.style))];
    if (styles.length > 1) return { state: 'conflict', source: 'profile-conflict', style: 'neutral', ids: accepted.map(item => item.id) };
    if (styles.length === 1) return { state: 'accepted', source: 'character-profile', style: styles[0], ids: accepted.map(item => item.id), votes: accepted.length };
    return { state: 'none', source: 'none', style: 'neutral', ids: [] };
}

function archiveEvidenceDecision(memoryBank = null) {
    const qualified = [];
    for (const memory of (Array.isArray(memoryBank?.memories) ? memoryBank.memories : []).slice(0, 400)) {
        if (core_text.normalizeText(memory?.sourceKind, 80) !== 'chat') continue;
        const start = Number(memory?.messageStart);
        const end = Number(memory?.messageEnd);
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) continue;
        const id = core_text.normalizeText(memory?.id, 40);
        const text = [memory?.title, memory?.summary, ...(Array.isArray(memory?.anchors) ? memory.anchors : [])].filter(Boolean).join('。');
        const styles = new Set(qualifiedStyles(text, { archiveEvidence: true }));
        if (styles.size) qualified.push({ start, end, id, styles });
    }
    qualified.sort((left, right) => left.start - right.start || left.end - right.end);
    const clusters = [];
    for (const item of qualified) {
        const previous = clusters.at(-1);
        if (previous && item.start <= previous.end) {
            previous.end = Math.max(previous.end, item.end);
            item.styles.forEach(style => previous.styles.add(style));
            if (item.id) previous.ids.add(item.id);
        } else {
            clusters.push({ start: item.start, end: item.end, styles: new Set(item.styles), ids: new Set(item.id ? [item.id] : []) });
        }
    }
    const styles = [...new Set(clusters.flatMap(cluster => [...cluster.styles]))];
    const evidenceIds = clusters.flatMap(cluster => [...cluster.ids, `range:${cluster.start}-${cluster.end}`]);
    if (styles.length > 1) return { state: 'conflict', source: 'archive-conflict', style: 'neutral', ids: evidenceIds };
    if (styles.length === 1) {
        const votes = clusters.filter(cluster => cluster.styles.has(styles[0])).length;
        if (votes >= 2) return { state: 'accepted', source: 'archive-consensus', style: styles[0], ids: evidenceIds, votes };
        return { state: 'insufficient', source: 'archive-insufficient', style: 'neutral', ids: evidenceIds, votes };
    }
    return { state: 'none', source: 'none', style: 'neutral', ids: [] };
}

function geographyTheme(text, worldStyle) {
    const direct = [
        ['coast', /(?:海港|海岸|码头|灯塔|岛屿|海滨|harbou?r|coast|lighthouse|island)/iu],
        ['mountain', /(?:山脉|高原|雪原|峡谷|冰川|mountain|alpine|highland|glacier|canyon)/iu],
        ['forest', /(?:森林|林地|雨林|竹林|forest|woodland|jungle|grove)/iu],
        ['campus', /(?:校园|学院|大学|寄宿学校|campus|academy|university|boarding school)/iu],
        ['historic', /(?:古城|遗迹|城堡|王宫|古代|中世纪|historic|ruins|castle|ancient|medieval)/iu],
        ['city', /(?:都市|市中心|街区|地铁|车站|广场|city|urban|downtown|subway|station|plaza)/iu],
    ].filter(([, pattern]) => pattern.test(text));
    if (direct.length === 1) return direct[0][0];
    if (worldStyle === 'scifi') return 'scifi';
    if (worldStyle === 'fantasy') return 'fantasy';
    if (worldStyle === 'historical') return 'historic';
    if (worldStyle === 'maritime') return 'coast';
    return 'neutral';
}

function geographyEvidence(sources, memoryBank) {
    const values = [...flattenControlledValue(sources.card), ...(sources.worldRaw ? [sources.worldRaw] : [])]
        .flatMap(value => scopedProvenanceStatements(value).filter(statement => !statement.blocked).map(statement => statement.text));
    for (const memory of (Array.isArray(memoryBank?.memories) ? memoryBank.memories : []).slice(0, 200)) {
        if (core_text.normalizeText(memory?.sourceKind, 80) !== 'chat') continue;
        const start = Number(memory?.messageStart);
        const end = Number(memory?.messageEnd);
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) continue;
        const text = [memory?.title, memory?.summary, ...(Array.isArray(memory?.anchors) ? memory.anchors : [])].filter(Boolean).join('。');
        if (text) values.push(...scopedProvenanceStatements(text).filter(statement => !statement.blocked).map(statement => statement.text));
    }
    return core_text.normalizeText(values.join('\n'), 32000).toLowerCase();
}

export function resolveWorldPresentation(contextEnvelope = '', memoryBank = null, profileBinding = null) {
    const sources = controlledSources(contextEnvelope);
    const setting = settingEvidenceDecision(sources);
    const profile = setting.state === 'none' ? characterProfileDecision(sources, profileBinding) : null;
    const archive = setting.state === 'none' && profile?.state === 'none' ? archiveEvidenceDecision(memoryBank) : null;
    const decision = setting.state !== 'none' ? setting : profile?.state !== 'none' ? profile : archive || setting;
    const worldStyle = decision.state === 'accepted' ? decision.style : 'neutral';
    const technology = worldStyle === 'scifi' ? 'future'
        : worldStyle === 'contemporary' || worldStyle === 'institutional' ? 'modern'
            : worldStyle === 'fantasy' ? 'magical'
                : ['historical', 'nomadic', 'maritime'].includes(worldStyle) ? 'low' : 'neutral';
    const policies = {
        contemporary: { keepsakes: ['postcard', 'letter', 'journal', 'fieldnote'], devices: ['phone', 'watch', 'terminal', 'communicator'], defaultDevice: 'phone' },
        institutional: { keepsakes: ['letter', 'journal', 'fieldnote', 'dossier'], devices: ['phone', 'terminal', 'communicator', 'folio'], defaultDevice: 'terminal' },
        historical: { keepsakes: ['letter', 'journal', 'scroll', 'fieldnote'], devices: ['folio'], defaultDevice: 'folio' },
        fantasy: { keepsakes: ['letter', 'journal', 'scroll', 'token'], devices: ['folio', 'relic'], defaultDevice: 'relic' },
        scifi: { keepsakes: ['datalog', 'dossier', 'token'], devices: ['terminal', 'communicator'], defaultDevice: 'terminal' },
        nomadic: { keepsakes: ['letter', 'journal', 'scroll', 'fieldnote', 'token'], devices: ['folio'], defaultDevice: 'folio' },
        maritime: { keepsakes: ['letter', 'journal', 'fieldnote'], devices: ['folio', 'communicator'], defaultDevice: 'folio' },
        neutral: { keepsakes: ['letter', 'journal'], devices: ['neutral'], defaultDevice: 'neutral' },
    };
    const policy = policies[worldStyle] || policies.neutral;
    const acceptedIds = [...new Set((decision.ids || []).map(item => core_text.normalizeText(item, 240)).filter(Boolean))];
    const geography = geographyEvidence(sources, memoryBank);
    return Object.freeze({
        version: 2,
        worldStyle,
        mapTheme: geographyTheme(geography, worldStyle),
        technology,
        allowedKeepsakes: Object.freeze([...policy.keepsakes]),
        allowedDevices: Object.freeze([...policy.devices]),
        defaultDevice: policy.defaultDevice,
        confidence: decision.state === 'accepted' ? (Number(decision.votes) >= 2 ? 'strong' : 'limited') : 'insufficient',
        evidenceSource: decision.source,
        evidenceIds: Object.freeze(acceptedIds),
        evidenceHash: `world:${core_text.hashString(JSON.stringify({
            source: decision.source,
            state: decision.state,
            style: worldStyle,
            ids: acceptedIds,
            archiveRevision: core_text.normalizeText(memoryBank?.archiveRevision, 240),
            geography,
        })).toString(36)}`,
    });
}

export function controlledEvidenceContains(evidence, excerpt) {
    const source = core_text.normalizeText(evidence, 32000).replace(/\s+/g, ' ').toLowerCase();
    const needle = core_text.normalizeText(excerpt, 800).replace(/\s+/g, ' ').toLowerCase();
    return needle.length >= 2 && source.includes(needle);
}
