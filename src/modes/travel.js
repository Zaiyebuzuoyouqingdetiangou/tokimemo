// Heartbeat Memories r44 independent travel-map mode.
// Model output is normalized into text and allowlisted tokens only. Marker geometry, CSS and
// interactions are owned by local code so generated data can never inject executable UI.
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import * as core_narrativeAuthority from '../core/narrativeAuthority.js';
import * as core_presentExpression from '../core/presentExpression.js';
import * as core_text from '../core/text.js';
import * as core_worldPresentation from '../core/worldPresentation.js';
import * as generation_client from '../generation/client.js';
import * as generation_prompts from '../generation/prompts.js';

const NEAR_MARKER_POSITIONS = Object.freeze([
    [18, 68], [36, 34], [55, 61], [72, 28], [84, 70], [28, 82], [64, 83], [47, 18],
    [25, 50], [41, 75], [67, 49], [80, 40],
]);
const FAR_MARKER_POSITIONS = Object.freeze([
    [12, 22], [88, 18], [91, 50], [76, 88], [18, 89], [7, 54], [52, 8], [49, 92],
    [31, 8], [95, 76], [4, 78], [70, 7],
]);

export function safeTravelLocationKind(value) {
    return value === 'far' ? 'far' : 'near';
}

export function safeTravelTheme(value, fallback = 'neutral') {
    const normalized = core_text.normalizeText(value, 30).toLowerCase();
    if (core_constants.TRAVEL_MAP_THEMES.has(normalized)) return normalized;
    const safeFallback = core_text.normalizeText(fallback, 30).toLowerCase();
    return core_constants.TRAVEL_MAP_THEMES.has(safeFallback) ? safeFallback : 'neutral';
}

function travelSceneThemeFromText(value) {
    const text = core_text.normalizeText(value, 5000).toLowerCase();
    if (/(?:星际|赛博|太空|宇宙|空间站|科幻|未来城|\b(?:sci[- ]?fi|cyber|space(?:port|station)?|futuristic)\b)/iu.test(text)) return 'scifi';
    if (/(?:魔法|幻想|精灵|龙谷|仙境|秘境|\b(?:fantasy|magic|elven|dragon)\b)/iu.test(text)) return 'fantasy';
    if (/(?:海|港|码头|灯塔|潮|沙滩|岛|滨|湖畔|河口|\b(?:coast|ocean|sea|harbou?r|port|maritime|island|beach|lighthouse)\b)/iu.test(text)) return 'coast';
    if (/(?:山|峰|岭|高原|雪原|冰川|峡谷|\b(?:mountain|alpine|peak|highland|glacier|canyon)\b)/iu.test(text)) return 'mountain';
    if (/(?:森林|林地|树林|雨林|竹林|植物园|\b(?:forest|woodland|grove|jungle|botanical)\b)/iu.test(text)) return 'forest';
    if (/(?:学校|学院|大学|校园|校舍|\b(?:campus|school|academy|university|college)\b)/iu.test(text)) return 'campus';
    if (/(?:古代|历史|旧城|古城|遗迹|王国|城堡|神殿|\b(?:history|historic|historical|ancient|kingdom|castle|ruins|temple)\b)/iu.test(text)) return 'historic';
    if (/(?:城|都市|市中心|街区|车站|广场|天际线|\b(?:city|urban|downtown|metropolis|station|plaza|skyline)\b)/iu.test(text)) return 'city';
    return '';
}

function travelThemeFallback(value) {
    return travelSceneThemeFromText(value) || 'neutral';
}

// New sessions persist sceneTheme. Cached r44/r45 sessions can omit it, so the
// renderer also calls this resolver and derives a safe scene from place semantics.
export function resolveTravelSceneTheme(item, mapTheme = 'neutral') {
    const labelInferred = travelSceneThemeFromText([item?.name, item?.region].join('\n'));
    if (labelInferred) return labelInferred;
    const explicit = core_text.normalizeText(item?.sceneTheme, 30).toLowerCase();
    if (core_constants.TRAVEL_MAP_THEMES.has(explicit)) return explicit;
    const summaryInferred = travelSceneThemeFromText(item?.summary);
    if (summaryInferred) return summaryInferred;
    return safeTravelTheme(mapTheme);
}

function normalizePostcard(value, fallbackTone = 'paper') {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const toneRaw = core_text.normalizeText(raw.tone, 30).toLowerCase();
    return {
        title: core_text.normalizeText(raw.title, 120),
        postmark: core_text.normalizeText(raw.postmark, 80),
        greeting: core_text.normalizeText(raw.greeting, 240),
        body: core_text.normalizeText(raw.body, 4000),
        closing: core_text.normalizeText(raw.closing, 500),
        stampLabel: core_text.normalizeText(raw.stampLabel, 40),
        tone: core_constants.TRAVEL_POSTCARD_TONES.has(toneRaw) ? toneRaw : fallbackTone,
    };
}

function normalizeTravelKeepsake(value, legacyPostcard = null, allowedKinds = null) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : legacyPostcard;
    const raw = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
    const requestedKind = core_text.normalizeText(raw.kind, 30).toLowerCase();
    const kind = core_constants.TRAVEL_KEEPSAKE_KINDS.has(requestedKind) ? requestedKind : (legacyPostcard ? 'postcard' : 'letter');
    if (allowedKinds && !allowedKinds.has(kind)) return null;
    const toneRaw = core_text.normalizeText(raw.tone, 30).toLowerCase();
    return {
        kind,
        title: core_text.normalizeText(raw.title, 120),
        mark: core_text.normalizeText(raw.mark ?? raw.postmark, 80),
        greeting: core_text.normalizeText(raw.greeting, 240),
        body: core_text.normalizeText(raw.body, 4000),
        closing: core_text.normalizeText(raw.closing, 500),
        emblem: core_text.normalizeText(raw.emblem ?? raw.stampLabel, 40),
        tone: core_constants.TRAVEL_POSTCARD_TONES.has(toneRaw) ? toneRaw : 'paper',
        presentExpressions: (Array.isArray(raw.presentExpressions) ? raw.presentExpressions : []).slice(0, 8),
        evidenceExcerpt: core_text.normalizeText(raw.evidenceExcerpt, 500),
    };
}

function normalizeTravelPresentExpressions(value, memoryBank, limit = 8) {
    const tier = core_presentExpression.relationshipExpressionTier(memoryBank);
    return (Array.isArray(value) ? value : []).slice(0, limit).map(item => (
        core_presentExpression.normalizePresentExpression(item, { relationshipTier: tier })
    )).filter(item => core_presentExpression.presentExpressionHasContent(item) || item.image !== 'none');
}

function renderTravelPresentLines(expressions, limit = 8) {
    return expressions.flatMap(item => core_presentExpression.renderPresentExpressionLines(item)).filter(Boolean).slice(0, limit);
}

function travelKeepsakeTitle(kind, name) {
    const place = core_text.normalizeText(name, 80) || '远方';
    const suffix = {
        postcard: '寄页', letter: '来信', journal: '札记', scroll: '手札',
        dossier: '记录', fieldnote: '行记', datalog: '日志',
    }[kind] || '纪念页';
    return `${place} · ${suffix}`;
}

function secureTravelKeepsake(raw, item, memoryBank, reference, { allowLegacyStored = false } = {}) {
    if (!raw) return null;
    if (allowLegacyStored) return { ...raw, legacyEvidenceUnverified: true, contentMode: 'legacy-free-text' };
    // Free prose remains inert renderer data. Historical claims are checked together with
    // the other location fields below; art/layout tokens still come from local allowlists.
    if (raw.body) return { ...raw,
        title: raw.title || travelKeepsakeTitle(raw.kind, item?.name),
        closing: raw.closing || core_text.normalizeText(memoryBank?.characterName, 80) || '寄信人',
        contentMode: 'character-prose', legacyEvidenceUnverified: false,
    };
    const presentExpressions = normalizeTravelPresentExpressions(raw.presentExpressions, memoryBank, 8);
    const lines = renderTravelPresentLines(presentExpressions, 12);
    const anchor = core_text.normalizeText(reference?.sourceMemoryAnchor, 160).replace(/\s+/g, '').toLowerCase();
    const requestedExcerpt = core_text.normalizeText(raw.evidenceExcerpt, 500);
    const excerpt = item?.basis === '记忆' && requestedExcerpt
        && anchor.includes(requestedExcerpt.replace(/\s+/g, '').toLowerCase()) ? requestedExcerpt : '';
    const body = [...lines, ...(excerpt ? [excerpt] : [])].join('\n\n');
    if (presentExpressions.length < 3 || body.length < 24) return null;
    const characterName = core_text.normalizeText(memoryBank?.characterName, 80);
    const userName = core_text.normalizeText(memoryBank?.userName, 80);
    const firstRegister = presentExpressions[0]?.register || 'plain';
    const greeting = firstRegister === 'classical' ? '致君' : firstRegister === 'futurist' ? '接收者：你' : (userName ? `${userName}：` : '写给你：');
    return {
        kind: raw.kind,
        title: travelKeepsakeTitle(raw.kind, item?.name),
        mark: core_text.normalizeText(item?.region, 80) || core_text.normalizeText(item?.distanceLabel, 80),
        greeting,
        body,
        closing: characterName,
        emblem: '',
        tone: raw.tone,
        presentExpressions,
        evidenceExcerpt: excerpt,
        contentMode: excerpt ? 'present-plus-anchor' : 'present-structured',
        legacyEvidenceUnverified: false,
    };
}

function postcardFromKeepsake(keepsake) {
    if (!keepsake || keepsake.kind !== 'postcard') return null;
    return {
        title: keepsake.title, postmark: keepsake.mark, greeting: keepsake.greeting, body: keepsake.body,
        closing: keepsake.closing, stampLabel: keepsake.emblem, tone: keepsake.tone,
    };
}

const TRAVEL_DISTANCE_LABELS = Object.freeze({
    walk: '步行可达', local: '同城可达', 'day-trip': '一日往返', journey: '需要远行', distant: '遥远', unknown: '距离未标注',
});

function travelReferencedMemoryText(reference, memoryBank) {
    const ids = new Set(core_text.cleanArray(reference?.sourceMemoryIds, 12, 40));
    return (Array.isArray(memoryBank?.memories) ? memoryBank.memories : [])
        .filter(memory => ids.has(core_text.normalizeText(memory?.id, 40)))
        .map(memory => [memory?.title, memory?.summary, ...(Array.isArray(memory?.anchors) ? memory.anchors : [])]
            .map(value => core_text.normalizeText(value, 3000)).filter(Boolean).join('\n'))
        .join('\n');
}

// Completed joint-history wording stays evidence-gated. Present invitations and future wishes
// are not history claims and therefore remain valid inferred route prose.
function evidenceBackedTravelLabel(value, evidence, fallback, limit = 100) {
    const label = core_text.normalizeText(value, limit);
    return label && core_worldPresentation.controlledEvidenceContains(evidence, label) ? label : fallback;
}

function normalizeTravelLocation(item, index, memoryBank, mapTheme, sourceMemoryIds = null, allowedKeepsakes = null, {
    allowLegacyStored = false,
    controlledEvidence = '',
} = {}) {
    const kindRaw = core_text.normalizeText(item?.kind, 20).toLowerCase();
    if (!core_constants.TRAVEL_LOCATION_KINDS.has(kindRaw)) return null;
    // Three bases, three different truth claims:
    //   记忆 — this stop is part of a shared past with {{user}}. Fabricating it would make
    //          the user believe something happened. Verbatim archive evidence required.
    //   设定 — this stop is written down in the card or world book. Verbatim quote required.
    //   推演 — this is somewhere the character would plausibly go, inferred from persona and
    //          world. That is ordinary characterisation, not a claim about the user's history,
    //          so it needs no quote — but it may never mention a shared past, and the UI
    //          always labels it as inferred.
    const basisRaw = core_text.normalizeText(item?.basis, 20);
    let basis = basisRaw === '记忆' ? '记忆' : basisRaw === '推演' ? '推演' : '设定';
    const settingEvidenceRaw = core_text.normalizeText(item?.sourceSettingEvidence, 800);
    const settingEvidence = basis === '设定' && settingEvidenceRaw.length >= 4
        && core_worldPresentation.controlledEvidenceContains(controlledEvidence, settingEvidenceRaw)
        ? settingEvidenceRaw : '';
    // r45 accepted persona/world-consistent places even when the exact place name was not written
    // verbatim. Keep the newer explicit "推演" label by downgrading an unquoted 设定 stop to
    // inferred instead of deleting the whole stop.
    if (!allowLegacyStored && basis === '设定' && !settingEvidence) basis = '推演';
    const dialogueActs = kindRaw === 'near' ? normalizeTravelPresentExpressions(item?.dialogueActs, memoryBank, 8) : [];
    const proseLines = kindRaw === 'near' ? core_text.cleanArray(item?.dialogueLines, 8, 1000) : [];
    const dialogueLines = proseLines.length ? proseLines : renderTravelPresentLines(dialogueActs, 8);
    const rawKeepsake = kindRaw === 'far' ? normalizeTravelKeepsake(item?.keepsake, item?.postcard, allowedKeepsakes) : null;
    // Incremental refreshes may only add stops proven by the newly scanned memories.
    // Stable setting-based stops belong to the initial map and would otherwise be
    // regenerated as fresh locations on every incremental pass.
    if (sourceMemoryIds && basis !== '记忆') return null;
    const evidenceBank = sourceMemoryIds ? core_incremental.incrementalPromptMemoryBank(memoryBank, sourceMemoryIds) : memoryBank;
    const reference = basis === '记忆'
        ? core_evidence.normalizeExactMemoryReference(item?.sourceMemoryIds, item?.sourceMemoryAnchor, evidenceBank, 1)
        : { sourceMemoryIds: [], sourceMemoryAnchor: '' };
    if (basis === '记忆' && (!reference.sourceMemoryIds.length || !reference.sourceMemoryAnchor)) return null;
    if (sourceMemoryIds && core_text.normalizeText(item?.sourceMemoryAnchor, 120) !== reference.sourceMemoryAnchor) return null;
    if (basis === '记忆' && sourceMemoryIds && !core_incremental.usesIncrementalMemoryId(reference.sourceMemoryIds, sourceMemoryIds)) return null;
    // A 推演 stop is the character's own routine, so any claim of a joint past is the one
    // thing it must not smuggle in. Reject the stop rather than silently rewriting it.
    const narrativeFields = [item?.name, item?.region, item?.summary, ...dialogueLines,
        ...['title', 'mark', 'greeting', 'body', 'closing', 'emblem'].map(key => rawKeepsake?.[key])];
    if (!allowLegacyStored && core_narrativeAuthority.narrativeClaimsSharedHistory(narrativeFields, { userName: memoryBank?.userName })) {
        const visible = narrativeFields.filter(Boolean).join('\n');
        if (basis !== '记忆' || !reference.sourceMemoryIds.length || !visible.includes(reference.sourceMemoryAnchor)) return null;
    }
    const labelEvidence = basis === '记忆' ? travelReferencedMemoryText(reference, memoryBank) : settingEvidence;
    const inferred = basis === '推演';
    const fallbackName = kindRaw === 'near' ? `附近停靠 ${index + 1}` : `远方坐标 ${index + 1}`;
    const name = allowLegacyStored || inferred
        ? (core_text.normalizeText(item?.name, 100) || fallbackName)
        : evidenceBackedTravelLabel(item?.name, labelEvidence, fallbackName, 100);
    const region = allowLegacyStored || inferred
        ? core_text.normalizeText(item?.region, 120)
        : evidenceBackedTravelLabel(item?.region, labelEvidence, kindRaw === 'near' ? '生活半径' : '远方', 120);
    const summary = core_text.normalizeText(item?.summary, 1800)
        || (basis === '记忆' ? reference.sourceMemoryAnchor : settingEvidence);
    const keepsake = kindRaw === 'far'
        ? secureTravelKeepsake(rawKeepsake, item, memoryBank, reference, { allowLegacyStored })
        : null;
    const postcard = postcardFromKeepsake(keepsake);
    const finalNarrative = [name, region, summary, ...dialogueLines,
        ...['title', 'mark', 'greeting', 'body', 'closing', 'emblem'].map(key => keepsake?.[key])];
    if (!allowLegacyStored && core_narrativeAuthority.narrativeClaimsSharedHistory(finalNarrative, { userName: memoryBank?.userName })
        && (basis !== '记忆' || !reference.sourceMemoryIds.length || !finalNarrative.filter(Boolean).join('\n').includes(reference.sourceMemoryAnchor))) return null;
    if (kindRaw === 'near' && !dialogueLines.length) return null;
    if (kindRaw === 'far' && (!keepsake?.title || !keepsake.body || !keepsake.closing)) return null;
    return {
        id: core_text.safeId(item?.id, `TR${String(index + 1).padStart(2, '0')}`),
        kind: kindRaw,
        name,
        region,
        distanceLabel: allowLegacyStored
            ? (core_text.normalizeText(item?.distanceLabel, 80) || (kindRaw === 'near' ? '附近' : '远方'))
            : (TRAVEL_DISTANCE_LABELS[core_text.normalizeText(item?.distanceToken, 30).toLowerCase()]
                || (kindRaw === 'near' ? TRAVEL_DISTANCE_LABELS.local : TRAVEL_DISTANCE_LABELS.distant)),
        summary,
        basis,
        sourceMemoryIds: reference.sourceMemoryIds,
        sourceMemoryAnchor: reference.sourceMemoryAnchor,
        sourceSettingEvidence: settingEvidence,
        dialogueActs,
        dialogueLines,
        legacyEvidenceUnverified: allowLegacyStored,
        keepsake,
        postcard,
        sceneTheme: kindRaw === 'far' ? resolveTravelSceneTheme({ ...item, name, region, summary }, mapTheme) : '',
    };
}

export function normalizeTravel(data, memoryBank, {
    allowPartial = false,
    sourceMemoryIds = null,
    worldPresentation = null,
    controlledEvidence = '',
    trustedStored = false,
} = {}) {
    const raw = Array.isArray(data?.locations) ? data.locations : [];
    const controlledProfile = worldPresentation && typeof worldPresentation === 'object' ? worldPresentation : null;
    const requestedTheme = core_text.normalizeText(data?.mapTheme, 30).toLowerCase();
    const themeSeed = [data?.title, data?.routeSummary, ...raw.flatMap(item => [item?.name, item?.region, item?.summary])].join('|');
    const mapTheme = controlledProfile ? safeTravelTheme(controlledProfile.mapTheme) : (core_constants.TRAVEL_MAP_THEMES.has(requestedTheme) ? requestedTheme : travelThemeFallback(themeSeed));
    const allowedKeepsakes = controlledProfile ? new Set(core_text.cleanArray(controlledProfile.allowedKeepsakes, 12, 30)) : null;
    const storedVersion = Number(data?.travelVersion);
    const allowLegacyStored = trustedStored === true
        && (!Number.isFinite(storedVersion) || storedVersion <= 0 || storedVersion < core_constants.TRAVEL_SESSION_VERSION);
    const seenIds = new Set();
    const locations = raw.slice(0, 12).map((item, index) => {
        const normalized = normalizeTravelLocation(item, index, memoryBank, mapTheme, sourceMemoryIds, allowedKeepsakes, {
            allowLegacyStored,
            controlledEvidence,
        });
        if (!normalized || seenIds.has(normalized.id)) return null;
        seenIds.add(normalized.id);
        return normalized;
    }).filter(Boolean);
    if (!allowPartial && !locations.length) {
        throw core_text.safeUserError('尚无通过证据与对白校验的地点；请确认档案或已选设定世界书包含地点。不会补造远方，旧地图保留。', 'RMT_TRAVEL_LOCATIONS');
    }
    return {
        kind: core_constants.MODE.TRAVEL,
        travelVersion: core_constants.TRAVEL_SESSION_VERSION,
        title: allowLegacyStored ? (core_text.normalizeText(data?.title, 120) || '他的出行路线') : '他的出行路线',
        routeSummary: allowLegacyStored
            ? (core_text.normalizeText(data?.routeSummary, 1800) || '沿着他真正会走过的地方，看看生活怎样在地图上留下痕迹。')
            : '沿着他可能经过的坐标，看看生活怎样在地图上展开。',
        mapTheme,
        worldPresentation: controlledProfile ? structuredClone(controlledProfile) : null,
        locations,
        selectedLocationId: locations.some(item => item.id === data?.selectedLocationId) ? data.selectedLocationId : '',
        dialogueIndex: Math.max(0, Math.floor(Number(data?.dialogueIndex) || 0)),
    };
}

export function compactTravelExisting(session) {
    return core_evidence.evenlySample(Array.isArray(session?.locations) ? session.locations : [], core_constants.MAX_INCREMENTAL_EXISTING_INDEX_ITEMS).map(item => ({
        id: core_text.normalizeText(item?.id, 60),
        kind: core_text.normalizeText(item?.kind, 20),
        name: core_text.normalizeText(item?.name, 100),
        region: core_text.normalizeText(item?.region, 120),
        sceneTheme: item?.kind === 'far' ? resolveTravelSceneTheme(item, session?.mapTheme) : '',
        basis: core_text.normalizeText(item?.basis, 20),
        sourceMemoryIds: core_text.cleanArray(item?.sourceMemoryIds, 8, 40),
        sourceMemoryAnchor: core_text.normalizeText(item?.sourceMemoryAnchor, 160),
    }));
}

export function travelPrompt(context, memoryBank, previous = null, sourceMemoryIds = null, worldPresentation = null) {
    const incremental = !!previous;
    const revisit = incremental && !core_incremental.incrementalArchiveMemoryIds(previous, memoryBank).length;
    const archiveBlock = incremental
        ? core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)
        : generation_prompts.promptArchiveSlice(memoryBank, 48);
    return `${generation_prompts.promptSafetyBoundary(context, '他的出行路线 / 独立地图')}
这是档案室里的独立地图，不是手机 App。请根据 {{char}} 的时代、身份、住处、职业、日常习惯和当前关系，整理他真正可能经过的路线。
UNTRUSTED_TRAVEL_ARCHIVE_JSON:
${archiveBlock}
EXISTING_TRAVEL_INDEX_JSON:
${JSON.stringify(compactTravelExisting(previous), null, 2)}
CONTROLLED_WORLD_PRESENTATION_JSON:
${JSON.stringify(worldPresentation || core_worldPresentation.resolveWorldPresentation('', memoryBank), null, 2)}

严格输出：
{"title":"他的出行路线","mapTheme":"neutral","locations":[{"id":"N1","kind":"near","name":"符合世界观的地点","region":"区域","distanceToken":"walk","summary":"角色此刻在这里做什么","basis":"推演","sourceMemoryIds":[],"sourceMemoryAnchor":"","sourceSettingEvidence":"","dialogueLines":["符合角色语气的当下对白"],"keepsake":null},{"id":"F1","kind":"far","name":"远方地点","region":"区域","distanceToken":"journey","summary":"此地的风景与他的当下心情","basis":"推演","sourceMemoryIds":[],"sourceMemoryAnchor":"","sourceSettingEvidence":"","dialogueLines":[],"sceneTheme":"mountain","keepsake":{"kind":"letter","title":"来信题目","mark":"","greeting":"收信称呼","body":"有画面感的信件正文，按角色与目前关系书写","closing":"角色署名","emblem":"","tone":"paper"}}]}

硬性要求：
 - mapTheme 必须照抄 CONTROLLED_WORLD_PRESENTATION_JSON.mapTheme。far.sceneTheme 应按该地点本身选择 city/coast/mountain/forest/campus/historic/fantasy/scifi/neutral；本地会再次依据地点语义校验，不能用一个全局主题覆盖雪山、海港等不同地点。keepsake.kind 只能从 allowedKeepsakes 中选择。keepsake.tone 只能 rose/ocean/forest/sunset/night/paper；它们只是本地白名单样式 token。禁止输出坐标、颜色值、CSS、HTML、JavaScript、URL、图片或 class。
 - ${revisit ? '本轮基于既有证据返回 0～3 个地点的新当下对话或纪念文字，可以重访原地点；文字不得重复已有版本，不得声称发生新旅程。' : incremental ? '本轮只返回 0～4 个由 incrementalMemoryIds 新证明且不在 EXISTING_TRAVEL_INDEX_JSON 中的地点；没有新地点时 locations 为空。' : '初次生成 5～8 个彼此不同、符合角色人设与世界观的地点，最多 8 个。优先使用档案/设定中已有地点；没有写明具体地点时用 basis=推演 合理补足，不要因为缺少逐字地名而返回空路线。near/far 不设最低配额，但应尽量同时有日常可达与远方地点。'}
- name/region：basis=记忆 时只能逐字取自所引 Mxxx；basis=设定 应以受控角色卡/世界书为依据，有逐字原文时填写 sourceSettingEvidence；若没有逐字地点证据，本地会按推演处理而不是删站。basis=推演 可按人设与世界观合理命名。distanceToken 只能为 walk/local/day-trip/journey/distant/unknown；不要输出自由 distanceLabel。
- near 是同城/日常可抵达地点。dialogueLines 写1～8句 {{char}} 对 {{user}} 的当下对白，推荐3～5句，必须有角色自己的措辞，不替 {{user}} 回应；可以观察、邀请、开玩笑，不能无据升级双方关系。不要返回 dialogueActs 枚举拼句。
- far 是远途、异地或世界观中的遥远地点。keepsake 必须有 body：写有风景、生活细节和角色心绪的信件/札记，推荐100～400字；title/greeting/closing 自拟，正文不是设定原文。kind 服从 allowedKeepsakes；现代可用 postcard，古代优先 letter/scroll/fieldnote，未来可用 datalog。画面由本地 HTML/SVG/CSS 渲染，不输出代码。
${core_narrativeAuthority.NARRATIVE_AUTHORITY_PROMPT}
- basis=推演：当档案与受控角色卡/世界书都没有写明具体地点时使用。这是“依据人设与世界观合理推断他会去的地方”，属于角色塑造，不是事实主张。此时 sourceMemoryIds/sourceMemoryAnchor/sourceSettingEvidence 全部留空，name/region/summary 由你自己写。可以有当下邀请或未来愿望（如“下次想和你一起去”）；只有把两人共同旅行/经历写成已经发生的过去事实时才会整站作废。
- basis=记忆 时必须引用真实 sourceMemoryIds + 完全匹配的 sourceMemoryAnchor${incremental ? '，且至少使用一个 incrementalMemoryIds' : ''}，sourceSettingEvidence 留空；keepsake.evidenceExcerpt 若填写，只能是该 exact anchor 的逐字子串。basis=设定 用于角色卡/世界书明确支持的生活与地点；有直接原文时填写 sourceSettingEvidence，没有逐字地名也不要为了通过校验伪造引文，本地会把它安全降级为推演。设定/推演都不能声称和 {{user}} 已经共同去过。
- 手机里的地图、导航、旅行与行程 App 已停用，不要描述手机界面。只输出 JSON。`;
}

export function travelLocationKey(item) {
    const ids = core_text.cleanArray(item?.sourceMemoryIds, 8, 40).sort().join(',');
    const anchor = core_incremental.normalizedContentKey(item?.sourceMemoryAnchor, 160);
    if (item?.basis === '记忆' && ids && anchor) return `memory|${ids}|${anchor}|${item?.expansionRound ? core_incremental.normalizedContentKey(JSON.stringify([item.dialogueLines, item.keepsake?.body]), 1600) : ''}`;
    return `${core_text.normalizeText(item?.kind, 20)}|${core_incremental.normalizedContentKey(item?.name, 120)}|${core_incremental.normalizedContentKey(item?.region, 120)}`;
}

export function mergeTravelIncremental(previous, fresh) {
    if (!previous?.locations?.length) return fresh;
    const merged = structuredClone(previous);
    if (!Number.isFinite(Number(previous?.travelVersion)) || Number(previous.travelVersion) < core_constants.TRAVEL_SESSION_VERSION) {
        merged.locations = (Array.isArray(merged.locations) ? merged.locations : []).map(item => ({
            ...item,
            legacyEvidenceUnverified: true,
            keepsake: item?.keepsake ? { ...item.keepsake, legacyEvidenceUnverified: true, contentMode: 'legacy-free-text' } : item?.keepsake,
        }));
    }
    const seen = new Set(merged.locations.map(travelLocationKey));
    const usedIds = new Set(merged.locations.map(item => item.id));
    let added = 0;
    for (const item of fresh.locations || []) {
        const key = travelLocationKey(item);
        if (!key || seen.has(key) || merged.locations.length >= 12) continue;
        seen.add(key);
        merged.locations.push({ ...structuredClone(item), id: core_incremental.uniqueGeneratedId(item.id, usedIds, 'TR') });
        added += 1;
    }
    merged.travelVersion = core_constants.TRAVEL_SESSION_VERSION;
    if (!merged.mapTheme && fresh.mapTheme) merged.mapTheme = fresh.mapTheme;
    return { session: merged, added };
}

export async function generateTravelWithRepair(context, memoryBank, origin, taskKey, options = {}) {
    const previous = options.replaceExisting === true ? null : core_cache.loadSession(core_constants.MODE.TRAVEL, {
        context, chatId: core_context.getChatId(context), memoryBank, clone: true,
    });
    const presentationContext = options.presentationContext || {};
    const worldPresentation = previous?.worldPresentation || presentationContext.profile
        || core_worldPresentation.resolveWorldPresentation(presentationContext.contextEnvelope || '', memoryBank);
    const sourceMemoryIds = core_incremental.derivedExpansionMemoryIds(previous, memoryBank, 'mode');
    const fresh = await generation_client.requestValidatedSegment(
        travelPrompt(context, memoryBank, previous, sourceMemoryIds, worldPresentation) + core_incremental.derivedExpansionDirective(previous, memoryBank),
        previous ? '他的出行路线 · 正在把新增地点标到地图上…' : '他的出行路线 · 正在绘制生活地图…',
        {
            maxTokens: core_constants.MODE_TOKEN_CAPS[core_constants.MODE.TRAVEL], temperature: 0.45,
            context, contextEnvelope: presentationContext.contextEnvelope, origin, taskKey: `${taskKey}:travel-map`, mode: core_constants.MODE.TRAVEL, background: true,
        },
        raw => normalizeTravel(raw, memoryBank, {
            allowPartial: !!previous,
            sourceMemoryIds: previous ? sourceMemoryIds : null,
            worldPresentation,
            controlledEvidence: presentationContext.settingEvidence || '',
        }),
    );
    if (!previous) {
        return core_incremental.stampIncrementalCoverage(fresh, null, memoryBank, 'mode', sourceMemoryIds, fresh.locations.length);
    }
    if (!fresh.locations.length) {
        return core_incremental.stampIncrementalCoverage(structuredClone(previous), previous, memoryBank, 'mode', sourceMemoryIds, 0);
    }
    if (!core_incremental.incrementalArchiveMemoryIds(previous, memoryBank).length) {
        const existingTexts = new Set(previous.locations.map(item => JSON.stringify([item.name, item.dialogueLines, item.keepsake?.body])));
        fresh.locations = fresh.locations.filter(item => !existingTexts.has(JSON.stringify([item.name, item.dialogueLines, item.keepsake?.body])))
            .map(item => ({ ...item, expansionRound: (Number(previous.generationMeta?.expansionRound) || 0) + 1 }));
    }
    const { session, added } = mergeTravelIncremental(previous, fresh);
    return core_incremental.stampIncrementalCoverage(session, previous, memoryBank, 'mode', sourceMemoryIds, added);
}

export function travelMarkerPosition(item, index = 0) {
    const positions = item?.kind === 'far' ? FAR_MARKER_POSITIONS : NEAR_MARKER_POSITIONS;
    const hash = core_text.hashString(`${core_text.normalizeText(item?.id, 80)}|${core_text.normalizeText(item?.name, 120)}`);
    const offset = Math.abs(Number(hash) || 0) % positions.length;
    const point = positions[(offset + Math.max(0, Number(index) || 0)) % positions.length];
    return { x: point[0], y: point[1] };
}

export function travelMarkerPositions(locations = []) {
    const occupied = new Set();
    const kindOrdinals = { near: 0, far: 0 };
    return (Array.isArray(locations) ? locations : []).map(item => {
        const positions = item?.kind === 'far' ? FAR_MARKER_POSITIONS : NEAR_MARKER_POSITIONS;
        const ordinal = kindOrdinals[item?.kind === 'far' ? 'far' : 'near']++;
        const hash = core_text.hashString(`${core_text.normalizeText(item?.id, 80)}|${core_text.normalizeText(item?.name, 120)}`);
        const preferred = (Math.abs(Number(hash) || 0) + ordinal) % positions.length;
        for (let probe = 0; probe < positions.length; probe += 1) {
            const point = positions[(preferred + probe) % positions.length];
            const key = `${point[0]}|${point[1]}`;
            if (occupied.has(key)) continue;
            occupied.add(key);
            return { x: point[0], y: point[1] };
        }
        const fallback = positions[preferred];
        return { x: fallback[0], y: fallback[1] };
    });
}
