import * as postcard_design from './postcardDesign.js';
import * as generation_recovery from '../generation/recovery.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_incremental from '../core/incremental.js';
import * as core_narrativeAuthority from '../core/narrativeAuthority.js';
import * as core_text from '../core/text.js';
import * as core_worldPresentation from '../core/worldPresentation.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import * as generation_client from '../generation/client.js';
import * as generation_prompts from '../generation/prompts.js';
import { FAR_MARKER_POSITIONS, NEAR_MARKER_POSITIONS, compactTravelExisting, normalizeTravel, normalizeTravelLocation, travelPostcardContentKey, travelPrompt } from './travelScenes.js';
// 出行生成：结构化提示词、地点键、增量合并、进度、正文补写、生成与修复、地图标记位置
// 从 modes/travel.js 原样搬出（重构阶段 2），声明文本一字未改；modes/travel.js 仍转发原有导出。

// New tasks request bounded composition, not keyword-matched free text. Existing
// recovery tasks deliberately keep their exact original recipe below.
export function structuredTravelPrompt(context, memoryBank, previous = null, sourceMemoryIds = null, worldPresentation = null, legacyWaterSupport = false) {
    return travelPrompt(context, memoryBank, previous, sourceMemoryIds, worldPresentation)
        .replace('"picturePlan":{"summary":"画面重点","foreground":"前景元素","midground":"中景元素","background":"远景元素","details":"可见细节","atmosphere":"整体氛围","layout":"left/center/right"}',
            '"design":{"version":1,"sky":"clear","light":"day","palette":"paper","density":"balanced","elements":[{"kind":"peak","layer":"far","x":35,"size":"m","count":2},{"kind":"pavilion","layer":"mid","x":70,"size":"m","count":1}]}')
        .replace('keepsake.picturePlan 可选；如果填写，只写简短自然语言设计说明（summary / foreground / midground / background / details / atmosphere / layout），用于本地 SVG 明信片构图。禁止输出坐标、颜色值、CSS、HTML、JavaScript、URL、图片、Base64 或 class。',
            'keepsake.design 只接收下方规定的受限图元数据，x仅为0～100的横向位置，不是SVG坐标。禁止自定义坐标、颜色值、CSS、HTML、JavaScript、URL、图片、Base64 或 class。')
        .replace('picturePlan 可同时描述这封纪念页想呈现的画面重点与构图（例如前景亭子、远景雪峰、雨后湖面等），但不要输出任何代码；最终画面由本地 SVG/CSS 安全渲染。',
            'design 与本封正文同时设计，图元与文字保持一致；设计缺失或不适用时可为null，不影响合格信件正文。最终画面由本地 SVG/CSS 安全渲染。')
        + '\n' + postcard_design.postcardDesignInstructions(legacyWaterSupport);
}

function travelPromptLegacyR8414(context, memoryBank, previous = null, sourceMemoryIds = null, worldPresentation = null) {
    const incremental = !!previous;
    const revisit = incremental && !core_incremental.incrementalArchiveMemoryIds(previous, memoryBank).length;
    const archiveBlock = incremental
        ? core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)
        : generation_prompts.promptArchiveSlice(memoryBank, 48);
    return `${generation_prompts.promptSafetyBoundary(context, '他的出行路线 / 独立地图', null, memoryBank)}
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
 - ${revisit ? '本轮返回 0～3 个新的角色生活扩展：可以重访原地点写新的当下对白/纪念文字，也可以依据明确人设与世界观补充此前未出现的 basis=推演 地点；不得重复已有版本，不得声称推演地点是已经发生的新旅程。' : incremental ? '本轮返回 0～4 个新增地点：新增记忆明确证明的地点用 basis=记忆；也允许依据明确人设、职业、时代和世界观补充此前未出现的 basis=推演 地点。没有合适新增时 locations 为空。' : '初次建议生成 5～8 个彼此不同、符合角色人设与世界观的地点；可以少写，最多 8 个，不为数量凑地点。优先使用档案/设定中已有地点；没有写明具体地点时用 basis=推演 合理补足，不要因为缺少逐字地名而返回空路线。near/far 不设最低配额，但应尽量同时有日常可达与远方地点。'}
- name/region：basis=记忆 时只能逐字取自所引 Mxxx；basis=设定 应以受控角色卡/世界书为依据，有逐字原文时填写 sourceSettingEvidence；若没有逐字地点证据，本地会按推演处理而不是删站。basis=推演 可按人设与世界观合理命名。distanceToken 只能为 walk/local/day-trip/journey/distant/unknown；不要输出自由 distanceLabel。
- near 是同城/日常可抵达地点。dialogueLines 写1～8句 {{char}} 对 {{user}} 的当下对白，推荐3～5句，必须有角色自己的措辞，不替 {{user}} 回应；可以观察、邀请、开玩笑，不能无据升级双方关系。不要返回 dialogueActs 枚举拼句。
- far 是远途、异地或世界观中的遥远地点。keepsake 必须有 body：写有风景、生活细节和角色心绪的信件/札记，推荐100～400字；title/greeting/closing 自拟，正文不是设定原文。kind 服从 allowedKeepsakes；现代可用 postcard，古代优先 letter/scroll/fieldnote，未来可用 datalog。画面由本地 HTML/SVG/CSS 渲染，不输出代码。
${core_narrativeAuthority.NARRATIVE_AUTHORITY_PROMPT}
- basis=推演：当档案与受控角色卡/世界书都没有写明具体地点时使用。这是“依据人设与世界观合理推断他会去的地方”，属于角色塑造，不是事实主张。此时 sourceMemoryIds/sourceMemoryAnchor/sourceSettingEvidence 全部留空，name/region/summary 由你自己写。可以有当下邀请或未来愿望（如“下次想和你一起去”）；只有把两人共同旅行/经历写成已经发生的过去事实时才会整站作废。
- basis=记忆 时必须引用真实 sourceMemoryIds + 完全匹配的 sourceMemoryAnchor${incremental ? '，且至少使用一个 incrementalMemoryIds' : ''}，sourceSettingEvidence 留空；keepsake.evidenceExcerpt 若填写，只能是该 exact anchor 的逐字子串。basis=设定 用于角色卡/世界书明确支持的生活与地点；有直接原文时填写 sourceSettingEvidence，没有逐字地名也不要为了通过校验伪造引文，本地会把它安全降级为推演。设定/推演都不能声称和 {{user}} 已经共同去过。
- 手机里的地图、导航、旅行与行程 App 已停用，不要描述手机界面。只输出 JSON。`;
}

function legacyTravelRecoveryPromptR8415(context, memoryBank, previous, sourceMemoryIds, worldPresentation, allowPersonaExpansion) {
    return travelPromptLegacyR8414(context, memoryBank, previous, sourceMemoryIds, worldPresentation)
        + core_incremental.derivedExpansionDirective(previous, memoryBank)
        + (previous && allowPersonaExpansion !== true ? '\n本轮只同步历史：所有新地点必须 basis=记忆，引用本轮 incrementalMemoryIds；不补人设推演地点。' : '');
}

export function travelLocationKey(item) {
    const ids = core_text.cleanArray(item?.sourceMemoryIds, 8, 40).sort().join(',');
    const anchor = core_incremental.normalizedContentKey(item?.sourceMemoryAnchor, 160);
    if (item?.basis === '记忆' && ids && anchor) return `memory|${ids}|${anchor}|${item?.expansionRound ? core_incremental.normalizedContentKey(JSON.stringify([item.dialogueLines, item.keepsake?.body]), 1600) : ''}`;
    // Preserve earlier pages on revisits. Equal words stay a no-op across rounds.
    return `${core_text.normalizeText(item?.kind, 20)}|${core_incremental.normalizedContentKey(item?.name, 120)}|${core_incremental.normalizedContentKey(item?.region, 120)}|${core_incremental.normalizedContentKey(JSON.stringify([item?.dialogueLines, item?.keepsake?.body]), 6000)}`;
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
    const seenPostcards = new Set(merged.locations.map(travelPostcardContentKey).filter(Boolean));
    const usedIds = new Set(merged.locations.map(item => item.id));
    let added = 0;
    for (const item of fresh.locations || []) {
        const key = travelLocationKey(item);
        const contentKey = travelPostcardContentKey(item);
        if (!key || seen.has(key) || (contentKey && seenPostcards.has(contentKey)) || merged.locations.length >= 12) continue;
        seen.add(key);
        if (contentKey) seenPostcards.add(contentKey);
        merged.locations.push({ ...structuredClone(item), id: core_incremental.uniqueGeneratedId(item.id, usedIds, 'TR') });
        added += 1;
    }
    merged.travelVersion = core_constants.TRAVEL_SESSION_VERSION;
    if (!merged.mapTheme && fresh.mapTheme) merged.mapTheme = fresh.mapTheme;
    return { session: merged, added };
}

export function projectTravelProgress({ segments, memoryBank, previousSession, frozenInputs = {}, operation = {} }) {
    const segment = segments.findLast(item => item.items('/locations').length);
    if (!segment) return null;
    const presentation = frozenInputs['presentation:travel'] || {};
    const fresh = normalizeTravel({ ...segment.value, locations: segment.items('/locations') }, memoryBank, {
        allowPartial: true,
        sourceMemoryIds: previousSession ? core_incremental.derivedExpansionMemoryIds(previousSession, memoryBank, 'mode') : null,
        allowPersonaExpansion: operation.allowPersonaExpansion === true,
        worldPresentation: presentation.profile,
        controlledEvidence: presentation.settingEvidence || '',
        structuredDesign: segment.contract === 'travel-structured-design-r8416' || segment.contract === 'travel-sketch-design-r8418',
    });
    if (!fresh.locations.length) return null;
    if (!previousSession) return fresh;
    const merged = mergeTravelIncremental(previousSession, fresh);
    return merged.session || merged;
}

function pendingTravelStops(session) {
    return (session?.locations || []).filter(item => item.prosePending === true);
}

export async function fillTravelProse(context, memoryBank, origin, taskKey, session, options = {}) {
    const pending = pendingTravelStops(session);
    if (!pending.length) {
        core_requestCoordinator.noteSecondStepOffer(origin, null);
        return session;
    }
    return generation_client.requestValidatedSegment(
        generation_prompts.promptSafetyBoundary(context, '他的出行路线 / 补正文', null, memoryBank)
        + '\n只补下面这些地点缺少的对白或纪念文字。不得改 id、name、basis、sourceMemoryIds、sourceMemoryAnchor。'
        + '\nnear 只写 dialogueLines。far 只写 title、greeting、body、closing。'
        + '\n只输出 {"repairs":[{"id":"地点id","dialogueLines":["对白"],"title":"题目","greeting":"称呼","body":"正文","closing":"落款"}]}。'
        + '\nPENDING_STOPS_JSON:\n' + JSON.stringify(pending.map(item => ({
            id: item.id, kind: item.kind, name: item.name, region: item.region, summary: item.summary, basis: item.basis,
        }))),
        '他的出行路线 · 正在补对白和纪念文字…',
        { maxTokens: 4000, context, contextEnvelope: options.contextEnvelope, origin, taskKey: `${taskKey}:travel-prose`, mode: core_constants.MODE.TRAVEL, background: true },
        raw => {
            const repairs = new Map((Array.isArray(raw?.repairs) ? raw.repairs : []).map(row => [core_text.normalizeText(row?.id, 80), row]));
            const locations = session.locations.map((item, index) => {
                if (!item.prosePending) return item;
                const patch = repairs.get(item.id);
                if (!patch) return item;
                const draft = { ...item };
                delete draft.prosePending;
                if (item.kind === 'near') draft.dialogueLines = patch.dialogueLines;
                if (item.kind === 'far') draft.keepsake = {
                    ...(item.keepsake || {}), kind: item.keepsake?.kind || 'letter', tone: item.keepsake?.tone || 'paper',
                    title: patch.title, greeting: patch.greeting, body: patch.body, closing: patch.closing,
                };
                const normalized = normalizeTravelLocation(draft, index, memoryBank, session.mapTheme, null, null, {
                    controlledEvidence: options.controlledEvidence || '', structuredDesign: true,
                });
                return normalized && !normalized.prosePending ? { ...normalized, id: item.id } : item;
            });
            if (locations.some(item => item.prosePending)) throw core_text.safeUserError('地点正文仍未补齐。', 'RMT_TRAVEL_LOCATIONS');
            core_requestCoordinator.noteSecondStepOffer(origin, null);
            return { ...session, locations };
        },
    );
}

async function settleTravelProse(session, context, memoryBank, origin, taskKey, options) {
    if (!pendingTravelStops(session).length) {
        core_requestCoordinator.noteSecondStepOffer(origin, null);
        return session;
    }
    if (options.secondStep === true || core_settings.getPluginSettings().autoSecondPass === true) {
        return fillTravelProse(context, memoryBank, origin, taskKey, session, options);
    }
    core_requestCoordinator.noteSecondStepOffer(origin, {
        label: '对白和纪念文字', kind: 'travel-prose', mode: core_constants.MODE.TRAVEL, pageId: core_constants.MODE.TRAVEL,
    });
    return session;
}

export async function generateTravelWithRepair(context, memoryBank, origin, taskKey, options = {}) {
    const previous = options.replaceExisting === true ? null : core_cache.loadSession(core_constants.MODE.TRAVEL, {
        context, chatId: core_context.getChatId(context), memoryBank, clone: true,
    });
    const presentationContext = options.presentationContext || {};
    const worldPresentation = previous?.worldPresentation || presentationContext.profile
        || core_worldPresentation.resolveWorldPresentation(presentationContext.contextEnvelope || '', memoryBank);
    const sourceMemoryIds = core_incremental.derivedExpansionMemoryIds(previous, memoryBank, 'mode');
    const savedSegment = generation_recovery.generationRecoverySegmentsForOrigin(origin)?.find(segment => segment.slot.endsWith(':travel-map'));
    const legacyWaterSupport = savedSegment?.contract === 'travel-structured-design-r8416';
    const structuredDesign = !savedSegment || legacyWaterSupport || savedSegment.contract === 'travel-sketch-design-r8418';
    const designContract = legacyWaterSupport ? 'travel-structured-design-r8416' : 'travel-sketch-design-r8418';
    const promptBuilder = structuredDesign ? structuredTravelPrompt : travelPrompt;
    const fresh = await generation_client.requestValidatedSegment(
        promptBuilder(context, memoryBank, previous, sourceMemoryIds, worldPresentation, legacyWaterSupport) + core_incremental.derivedExpansionDirective(previous, memoryBank)
            + (previous && options.allowPersonaExpansion !== true ? '\n本轮只同步历史：所有新地点必须 basis=记忆，引用本轮 incrementalMemoryIds；不补人设推演地点。' : ''),
        previous ? '他的出行路线 · 正在把新增地点标到地图上…' : '他的出行路线 · 正在绘制生活地图…',
        {
            maxTokens: core_constants.MODE_TOKEN_CAPS[core_constants.MODE.TRAVEL],
            context, contextEnvelope: presentationContext.contextEnvelope, origin, taskKey: `${taskKey}:travel-map`, mode: core_constants.MODE.TRAVEL, background: true,
            recoveryCompatibility: structuredDesign ? { contract: designContract, legacyPrompts: [] }
                : { contract: 'travel-postcard-design-r8415', legacyPrompts: [
                legacyTravelRecoveryPromptR8415(context, memoryBank, previous, sourceMemoryIds, worldPresentation, options.allowPersonaExpansion),
            ], legacyTemperatures: [0.45] },
        },
        raw => normalizeTravel(raw, memoryBank, {
            allowPartial: !!previous,
            sourceMemoryIds: previous ? sourceMemoryIds : null,
            allowPersonaExpansion: options.allowPersonaExpansion === true,
            worldPresentation,
            controlledEvidence: presentationContext.settingEvidence || '',
            structuredDesign,
        }),
    );
    const proseOptions = { ...options, contextEnvelope: presentationContext.contextEnvelope, controlledEvidence: presentationContext.settingEvidence || '' };
    if (!previous) {
        return settleTravelProse(core_incremental.stampIncrementalCoverage(fresh, null, memoryBank, 'mode', sourceMemoryIds, fresh.locations.length), context, memoryBank, origin, taskKey, proseOptions);
    }
    if (!fresh.locations.length) {
        return settleTravelProse(core_incremental.stampIncrementalCoverage(structuredClone(previous), previous, memoryBank, 'mode', sourceMemoryIds, 0), context, memoryBank, origin, taskKey, proseOptions);
    }
    if (!core_incremental.incrementalArchiveMemoryIds(previous, memoryBank).length) {
        const existingTexts = new Set(previous.locations.map(item => JSON.stringify([item.name, item.dialogueLines, item.keepsake?.body])));
        fresh.locations = fresh.locations.filter(item => !existingTexts.has(JSON.stringify([item.name, item.dialogueLines, item.keepsake?.body])))
            .map(item => ({ ...item, expansionRound: (Number(previous.generationMeta?.expansionRound) || 0) + 1 }));
    }
    const { session, added } = mergeTravelIncremental(previous, fresh);
    return settleTravelProse(core_incremental.stampIncrementalCoverage(session, previous, memoryBank, 'mode', sourceMemoryIds, added), context, memoryBank, origin, taskKey, proseOptions);
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
