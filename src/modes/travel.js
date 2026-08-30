// Heartbeat Memories r44 independent travel-map mode.
// Model output is normalized into text and allowlisted tokens only. Marker geometry, CSS and
// interactions are owned by local code so generated data can never inject executable UI.
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import * as core_text from '../core/text.js';
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

function travelThemeFallback(value) {
    const text = core_text.normalizeText(value, 5000).toLowerCase();
    if (/(?:海|港|船|岛|coast|ocean|harbou?r|maritime)/i.test(text)) return 'coast';
    if (/(?:林|森|园|植物|forest|woodland)/i.test(text)) return 'forest';
    if (/(?:山|高地|雪|mountain|alpine)/i.test(text)) return 'mountain';
    if (/(?:学校|学院|大学|校园|campus|school|academy)/i.test(text)) return 'campus';
    if (/(?:古代|历史|旧城|王国|histor|ancient|kingdom)/i.test(text)) return 'historic';
    if (/(?:魔法|幻想|精灵|龙|fantasy|magic)/i.test(text)) return 'fantasy';
    if (/(?:星际|赛博|太空|科幻|scifi|cyber|space)/i.test(text)) return 'scifi';
    return 'city';
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

function normalizeTravelLocation(item, index, memoryBank, sourceMemoryIds = null) {
    const kindRaw = core_text.normalizeText(item?.kind, 20).toLowerCase();
    if (!core_constants.TRAVEL_LOCATION_KINDS.has(kindRaw)) return null;
    const name = core_text.normalizeText(item?.name, 100);
    const region = core_text.normalizeText(item?.region, 120);
    const summary = core_text.normalizeText(item?.summary, 1800);
    if (!name || !summary) return null;
    const basis = item?.basis === '记忆' ? '记忆' : '设定';
    const dialogueLines = kindRaw === 'near' ? core_text.cleanArray(item?.dialogueLines, 8, 1000) : [];
    const postcard = kindRaw === 'far' ? normalizePostcard(item?.postcard) : null;
    if (kindRaw === 'near' && dialogueLines.length < 3) return null;
    if (kindRaw === 'far' && (!postcard.title || postcard.body.length < 80 || !postcard.closing)) return null;
    // Incremental refreshes may only add stops proven by the newly scanned memories.
    // Stable setting-based stops belong to the initial map and would otherwise be
    // regenerated as fresh locations on every incremental pass.
    if (sourceMemoryIds && basis !== '记忆') return null;
    const evidenceText = [name, region, summary, ...dialogueLines, postcard?.title, postcard?.body, postcard?.closing]
        .map(value => core_text.normalizeText(value, 4000)).filter(Boolean).join('\n');
    const evidenceBank = sourceMemoryIds ? core_incremental.incrementalPromptMemoryBank(memoryBank, sourceMemoryIds) : memoryBank;
    const reference = basis === '记忆'
        ? core_evidence.normalizeMemoryReference(item?.sourceMemoryIds, item?.sourceMemoryAnchor, evidenceText, evidenceBank, 1)
        : { sourceMemoryIds: [], sourceMemoryAnchor: '' };
    if (basis === '记忆' && (!reference.sourceMemoryIds.length || !reference.sourceMemoryAnchor)) return null;
    if (sourceMemoryIds && core_text.normalizeText(item?.sourceMemoryAnchor, 120) !== reference.sourceMemoryAnchor) return null;
    if (basis === '记忆' && sourceMemoryIds && !core_incremental.usesIncrementalMemoryId(reference.sourceMemoryIds, sourceMemoryIds)) return null;
    return {
        id: core_text.safeId(item?.id, `TR${String(index + 1).padStart(2, '0')}`),
        kind: kindRaw,
        name,
        region,
        distanceLabel: core_text.normalizeText(item?.distanceLabel, 80) || (kindRaw === 'near' ? '附近' : '远方'),
        summary,
        basis,
        sourceMemoryIds: reference.sourceMemoryIds,
        sourceMemoryAnchor: reference.sourceMemoryAnchor,
        dialogueLines,
        postcard,
    };
}

export function normalizeTravel(data, memoryBank, { allowPartial = false, sourceMemoryIds = null } = {}) {
    const raw = Array.isArray(data?.locations) ? data.locations : [];
    const seenIds = new Set();
    const locations = raw.slice(0, 12).map((item, index) => {
        const normalized = normalizeTravelLocation(item, index, memoryBank, sourceMemoryIds);
        if (!normalized || seenIds.has(normalized.id)) return null;
        seenIds.add(normalized.id);
        return normalized;
    }).filter(Boolean);
    const nearCount = locations.filter(item => item.kind === 'near').length;
    const farCount = locations.filter(item => item.kind === 'far').length;
    if (!allowPartial && (nearCount < 2 || farCount < 2)) {
        throw new Error(`出行地图地点不足：附近 ${nearCount}/2，远方 ${farCount}/2。`);
    }
    const requestedTheme = core_text.normalizeText(data?.mapTheme, 30).toLowerCase();
    const themeSeed = [data?.title, data?.routeSummary, ...locations.flatMap(item => [item.name, item.region])].join('|');
    return {
        kind: core_constants.MODE.TRAVEL,
        travelVersion: core_constants.TRAVEL_SESSION_VERSION,
        title: core_text.normalizeText(data?.title, 120) || '他的出行路线',
        routeSummary: core_text.normalizeText(data?.routeSummary, 1800) || '沿着他真正会走过的地方，看看生活怎样在地图上留下痕迹。',
        mapTheme: core_constants.TRAVEL_MAP_THEMES.has(requestedTheme) ? requestedTheme : travelThemeFallback(themeSeed),
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
        basis: core_text.normalizeText(item?.basis, 20),
        sourceMemoryIds: core_text.cleanArray(item?.sourceMemoryIds, 8, 40),
        sourceMemoryAnchor: core_text.normalizeText(item?.sourceMemoryAnchor, 160),
    }));
}

export function travelPrompt(context, memoryBank, previous = null, sourceMemoryIds = null) {
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

严格输出：
{"title":"他的出行路线","routeSummary":"这张地图如何体现角色生活","mapTheme":"city","locations":[{"id":"NEAR01","kind":"near","name":"地点名","region":"区域","distanceLabel":"步行十分钟","summary":"地点与角色生活的联系","basis":"设定","sourceMemoryIds":[],"sourceMemoryAnchor":"","dialogueLines":["{{char}} 对 {{user}} 说的第一句","第二句","第三句"],"postcard":null},{"id":"FAR01","kind":"far","name":"远方地点","region":"区域","distanceLabel":"很远","summary":"远方与角色的联系","basis":"设定","sourceMemoryIds":[],"sourceMemoryAnchor":"","dialogueLines":[],"postcard":{"title":"明信片标题","postmark":"邮戳短字","greeting":"写给 {{user}} 的开头","body":"充满角色个性的明信片正文","closing":"{{char}} 的落款","stampLabel":"邮票短字","tone":"paper"}}]}

硬性要求：
- mapTheme 只能是 city/coast/forest/mountain/campus/historic/fantasy/scifi；postcard.tone 只能是 rose/ocean/forest/sunset/night/paper。它们只是本地白名单样式 token。禁止输出坐标、颜色值、CSS、HTML、JavaScript、URL、图片或 class。
- ${incremental ? '本轮只返回 0～4 个由 incrementalMemoryIds 新证明且不在 EXISTING_TRAVEL_INDEX_JSON 中的地点；没有新地点时 locations 为空。' : '初次生成 5～8 个彼此不同的地点：near 3～5 个，far 2～4 个。'}
- near 是同城/日常可抵达地点，点击后播放 3～8 句 {{char}} 对 {{user}} 的当下短对话；只能写 {{char}} 台词，不替 {{user}} 回应，不越过当前关系阶段。
- far 是远途、异地或世界观中的遥远地点，点击后显示纯文字明信片。正文要充沛、具体、符合 {{char}}，但不能把未发生旅行冒充共同历史。
- basis=记忆 时必须引用真实 sourceMemoryIds + sourceMemoryAnchor${incremental ? '，且至少使用一个 incrementalMemoryIds' : ''}；basis=设定 时证据字段必须为空，只能表达角色稳定生活/世界观或明确标注的想象，不能声称和 {{user}} 已经共同去过。
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
    const sourceMemoryIds = core_incremental.incrementalArchiveMemoryIds(previous, memoryBank, 'mode');
    const fresh = await generation_client.requestValidatedSegment(
        travelPrompt(context, memoryBank, previous, sourceMemoryIds),
        previous ? '他的出行路线 · 正在把新增地点标到地图上…' : '他的出行路线 · 正在绘制生活地图…',
        {
            maxTokens: core_constants.MODE_TOKEN_CAPS[core_constants.MODE.TRAVEL], temperature: 0.45,
            context, origin, taskKey: `${taskKey}:travel-map`, mode: core_constants.MODE.TRAVEL, background: true,
        },
        raw => normalizeTravel(raw, memoryBank, { allowPartial: !!previous, sourceMemoryIds: previous ? sourceMemoryIds : null }),
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
