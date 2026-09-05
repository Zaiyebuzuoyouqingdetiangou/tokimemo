// Heartbeat Memories r44 independent travel-map mode.
// Model output is normalized into text and allowlisted tokens only. Marker geometry, CSS and
// interactions are owned by local code so generated data can never inject executable UI.
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
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
    )).filter(core_presentExpression.presentExpressionHasContent);
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
    const basis = item?.basis === '记忆' ? '记忆' : '设定';
    const dialogueActs = kindRaw === 'near' ? normalizeTravelPresentExpressions(item?.dialogueActs, memoryBank, 8) : [];
    const legacyDialogueLines = allowLegacyStored && kindRaw === 'near' ? core_text.cleanArray(item?.dialogueLines, 8, 1000) : [];
    const dialogueLines = allowLegacyStored ? legacyDialogueLines : renderTravelPresentLines(dialogueActs, 8);
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
    const settingEvidenceRaw = core_text.normalizeText(item?.sourceSettingEvidence, 800);
    const settingEvidence = basis === '设定' && settingEvidenceRaw.length >= 4
        && core_worldPresentation.controlledEvidenceContains(controlledEvidence, settingEvidenceRaw)
        ? settingEvidenceRaw : '';
    if (!allowLegacyStored && basis === '设定' && !settingEvidence) return null;
    const labelEvidence = basis === '记忆' ? travelReferencedMemoryText(reference, memoryBank) : settingEvidence;
    const fallbackName = kindRaw === 'near' ? `附近停靠 ${index + 1}` : `远方坐标 ${index + 1}`;
    const name = allowLegacyStored
        ? (core_text.normalizeText(item?.name, 100) || fallbackName)
        : evidenceBackedTravelLabel(item?.name, labelEvidence, fallbackName, 100);
    const region = allowLegacyStored
        ? core_text.normalizeText(item?.region, 120)
        : evidenceBackedTravelLabel(item?.region, labelEvidence, kindRaw === 'near' ? '生活半径' : '远方', 120);
    const summary = allowLegacyStored
        ? (core_text.normalizeText(item?.summary, 1800) || (kindRaw === 'near' ? '旧版附近地点。' : '旧版远方地点。'))
        : basis === '记忆'
            ? reference.sourceMemoryAnchor
            : settingEvidence;
    const keepsake = kindRaw === 'far'
        ? secureTravelKeepsake(rawKeepsake, item, memoryBank, reference, { allowLegacyStored })
        : null;
    const postcard = postcardFromKeepsake(keepsake);
    if (kindRaw === 'near' && dialogueLines.length < 3) return null;
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
    const nearCount = locations.filter(item => item.kind === 'near').length;
    const farCount = locations.filter(item => item.kind === 'far').length;
    if (!allowPartial && (nearCount < 2 || farCount < 2)) {
        throw new Error(`出行地图地点不足：附近 ${nearCount}/2，远方 ${farCount}/2。`);
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
{"title":"他的出行路线","routeSummary":"本地会生成","mapTheme":"city","locations":[{"id":"NEAR01","kind":"near","name":"从证据逐字复制的地点名","region":"从证据逐字复制的区域或空","distanceToken":"walk","summary":"本地会生成","basis":"设定","sourceMemoryIds":[],"sourceMemoryAnchor":"","sourceSettingEvidence":"从受控角色卡或世界书逐字复制的直接证据","dialogueActs":[{"time":"today","emotion":"joy","wish":"none","gesture":"walk","tone":"quiet","register":"plain","image":"path","intensity":"low","cadence":"fragments"}],"sceneTheme":null,"keepsake":null},{"id":"FAR01","kind":"far","name":"从证据逐字复制的远方地点","region":"从证据逐字复制的区域或空","distanceToken":"journey","summary":"本地会生成","basis":"设定","sourceMemoryIds":[],"sourceMemoryAnchor":"","sourceSettingEvidence":"从受控角色卡或世界书逐字复制的直接证据","dialogueActs":[],"sceneTheme":"city","keepsake":{"kind":"letter","tone":"paper","presentExpressions":[{"time":"now","emotion":"miss","wish":"peace","gesture":"none","tone":"warm","register":"lyrical","image":"light","intensity":"medium","cadence":"stacked"},{"time":"from-now-on","emotion":"cherish","wish":"warmth","gesture":"stay","tone":"quiet","register":"lyrical","image":"path","intensity":"low","cadence":"single"},{"time":"tonight","emotion":"care","wish":"good-dreams","gesture":"listen","tone":"warm","register":"lyrical","image":"stars","intensity":"medium","cadence":"stacked"}],"evidenceExcerpt":"basis=记忆 时可逐字摘录 exact sourceMemoryAnchor；设定时留空"}}]}

硬性要求：
 - mapTheme 必须照抄 CONTROLLED_WORLD_PRESENTATION_JSON.mapTheme。far.sceneTheme 应按该地点本身选择 city/coast/mountain/forest/campus/historic/fantasy/scifi/neutral；本地会再次依据地点语义校验，不能用一个全局主题覆盖雪山、海港等不同地点。keepsake.kind 只能从 allowedKeepsakes 中选择。keepsake.tone 只能 rose/ocean/forest/sunset/night/paper；它们只是本地白名单样式 token。禁止输出坐标、颜色值、CSS、HTML、JavaScript、URL、图片或 class。
- ${incremental ? '本轮只返回 0～4 个由 incrementalMemoryIds 新证明且不在 EXISTING_TRAVEL_INDEX_JSON 中的地点；没有新地点时 locations 为空。' : '初次生成 5～8 个彼此不同的地点：near 3～5 个，far 2～4 个。'}
- name/region 不是自由叙事槽。basis=记忆 时只能逐字取自所引 Mxxx；basis=设定 时必须逐字出现在 sourceSettingEvidence 中，而 sourceSettingEvidence 必须逐字取自受控角色卡/世界书。没有这种证据就不要生成该站。distanceToken 只能为 walk/local/day-trip/journey/distant/unknown；不要输出自由 distanceLabel。title、routeSummary、summary 均由本地生成，模型文字会被忽略。
- near 是同城/日常可抵达地点。提供 3～8 个 dialogueActs；不要写 dialogueLines 或任何自由台词。本地会依据双方真实关系层级裁剪 token 并组合成 {{char}} 对 {{user}} 的当下短句，不替 {{user}} 回应。关系证据不足时仅保留中性祝福/视觉，love、embrace 等越级 token 会被清空。
- far 是远途、异地或世界观中的遥远地点，点击后显示由插件本地 HTML/SVG/CSS + 纯文字渲染的纪念载体。载体必须跟随时代、科技、职业与世界观：现代世界可以是 postcard/letter/journal；古代或低科技世界优先考虑 letter/journal/scroll/fieldnote；机构/任务型背景可用 dossier/fieldnote；未来科技可用 datalog。每个 keepsake 提供 3～8 个 presentExpressions，并利用 register/image/intensity/cadence 等轴结合人设、世界观和关系阶段形成充沛但不伪造历史的文字；不要写 title/mark/greeting/body/closing/emblem，自由正文会被忽略，这些字段由本地安全构造。
- presentExpression 的白名单与贺卡相同：time=none/now/today/tonight/from-now-on；emotion=none/love/miss/cherish/care/calm/grateful/joy；wish=none/peace/joy/health/freedom/warmth/good-dreams/success；gesture=none/stay/meet/hold-hands/embrace/walk/listen；tone=quiet/direct/warm/playful/ceremonial；register=plain/restrained/lyrical/classical/futurist；image=none/light/stars/wind/rain/sea/home/path/season；intensity=low/medium/high；cadence=single/stacked/fragments。古代/奇幻/未来语境应选择合适 register，不要所有角色都用同一种现代语气。
- basis=记忆 时必须引用真实 sourceMemoryIds + 完全匹配的 sourceMemoryAnchor${incremental ? '，且至少使用一个 incrementalMemoryIds' : ''}，sourceSettingEvidence 留空；keepsake.evidenceExcerpt 若填写，只能是该 exact anchor 的逐字子串。basis=设定 时 sourceMemoryIds/sourceMemoryAnchor 与 evidenceExcerpt 必须为空，sourceSettingEvidence 必须逐字摘录受控角色卡/世界书；只能表达角色稳定生活/世界观或尚未发生的当下愿望，不能声称和 {{user}} 已经共同去过。
- 手机里的地图、导航、旅行与行程 App 已停用，不要描述手机界面。只输出 JSON。`;
}

export function travelLocationKey(item) {
    const ids = core_text.cleanArray(item?.sourceMemoryIds, 8, 40).sort().join(',');
    const anchor = core_incremental.normalizedContentKey(item?.sourceMemoryAnchor, 160);
    if (item?.basis === '记忆' && ids && anchor) return `memory|${ids}|${anchor}`;
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
    const sourceMemoryIds = core_incremental.incrementalArchiveMemoryIds(previous, memoryBank, 'mode');
    const fresh = await generation_client.requestValidatedSegment(
        travelPrompt(context, memoryBank, previous, sourceMemoryIds, worldPresentation),
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
