import * as core_butterflyContract from '../core/butterflyContract.js';
import * as core_cache from '../core/cache.js';
// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_constants from '../core/constants.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import * as core_text from '../core/text.js';
import * as core_relationshipSafety from '../core/relationshipSafety.js';
import * as generation_client from '../generation/client.js';
import * as generation_prompts from '../generation/prompts.js';
import * as generation_recovery from '../generation/recovery.js';
import * as legacy_recovery from '../core/butterflyLegacyRecovery.js';

export const BUTTERFLY_PRIMARY_AXES = core_butterflyContract.BUTTERFLY_PRIMARY_AXES;

const PRIMARY_AXIS_SET = new Set(BUTTERFLY_PRIMARY_AXES);
const PRIMARY_AXIS_ALIASES = Object.freeze({
    era: 'era', period: 'era', time: 'era', '时代': 'era', '年代': 'era',
    identity: 'identity', role: 'identity', status: 'identity', '身份': 'identity', '出身': 'identity',
    occupation: 'occupation', job: 'occupation', career: 'occupation', '职业': 'occupation', '工作': 'occupation',
    location: 'location', place: 'location', residence: 'location', '地点': 'location', '地域': 'location',
    decision: 'decision', choice: 'decision', '决定': 'decision', '选择': 'decision', '抉择': 'decision',
    encounter: 'encounter', meeting: 'encounter', '相遇': 'encounter', '遇见': 'encounter',
    bond: 'bond', relationship: 'bond', '羁绊': 'bond', '关系': 'bond',
    fate: 'fate', outcome: 'fate', ending: 'fate', '命运': 'fate', '结局': 'fate',
});
const WORLD_FIELDS = Object.freeze([
    'era', 'identity', 'occupation', 'location', 'keyDecision', 'encounterWithUser', 'bondWithUser', 'finalFate',
]);
const WORLD_FIELD_ALIASES = Object.freeze({
    era: ['era', 'period', 'timePeriod'],
    identity: ['identity', 'role', 'status'],
    occupation: ['occupation', 'job', 'career'],
    location: ['location', 'place', 'residence'],
    keyDecision: ['keyDecision', 'decision', 'choice'],
    encounterWithUser: ['encounterWithUser', 'meetingWithUser', 'encounter', 'meeting'],
    bondWithUser: ['bondWithUser', 'relationshipWithUser', 'bond', 'relationship'],
    finalFate: ['finalFate', 'fate', 'outcome', 'ending'],
});
const WORLD_PLACEHOLDER_RE = /^(?:同上|同现世|不变|照旧|原样|未知|不详|待定|未设定|无资料|none|null|unknown|unchanged|same|n\/?a|[-—_.。…?？]+)$/i;
function normalizedPrimaryAxis(value) {
    const raw = core_text.normalizeText(value, 40).toLowerCase().replace(/[\s_-]+/g, '');
    return PRIMARY_AXIS_ALIASES[raw] || '';
}

function worldSource(node) {
    if (node?.worldSpec && typeof node.worldSpec === 'object') return node.worldSpec;
    if (node?.worldProfile && typeof node.worldProfile === 'object') return node.worldProfile;
    if (node?.divergence && typeof node.divergence === 'object') return node.divergence;
    return {};
}

function worldField(source, names) {
    for (const name of names) {
        const text = core_text.normalizeText(source?.[name], 240);
        if (text) return text;
    }
    return '';
}

export function butterflyHanCount(value) {
    return (String(value ?? '').match(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g) || []).length;
}

export function butterflyFirstPersonCount(value) {
    return (String(value ?? '').match(/我/g) || []).length;
}

export function normalizeButterflyWorldSpec(node) {
    const source = worldSource(node);
    const primaryAxis = normalizedPrimaryAxis(node?.primaryAxis || source?.primaryAxis || source?.axis);
    if (!PRIMARY_AXIS_SET.has(primaryAxis)) throw core_butterflyContract.butterflyValidationError('worldSpec');
    const worldSpec = { primaryAxis };
    for (const field of WORLD_FIELDS) {
        const text = worldField(source, WORLD_FIELD_ALIASES[field]);
        const compact = text.replace(/\s+/g, '');
        if (compact.length < 2 || WORLD_PLACEHOLDER_RE.test(compact)) throw core_butterflyContract.butterflyValidationError('worldSpec');
        worldSpec[field] = text;
    }
    const thirdPartyRomance = source?.thirdPartyRomance ?? node?.thirdPartyRomance;
    if (thirdPartyRomance !== false) throw core_butterflyContract.butterflyValidationError('worldSpec');
    worldSpec.thirdPartyRomance = false;
    return worldSpec;
}

function looseWorldSpec(node) {
    const source = worldSource(node);
    const result = { primaryAxis: normalizedPrimaryAxis(node?.primaryAxis || source?.primaryAxis || source?.axis) };
    for (const field of WORLD_FIELDS) result[field] = worldField(source, WORLD_FIELD_ALIASES[field]);
    return result;
}

export function butterflyWorldSignature(node) {
    const spec = looseWorldSpec(node);
    if (!spec.primaryAxis) return '';
    const values = WORLD_FIELDS.map(field => spec[field]);
    if (values.some(value => !value)) return '';
    return core_incremental.normalizedContentKey(values.join('|'), 2400);
}

export function assertButterflyRelationshipSafety(value, context = {}, label = '蝴蝶效应内容') {
    return core_relationshipSafety.assertPairRelationshipSafety(value, context, label,
        () => core_butterflyContract.butterflyValidationError('relationship'), { fictionPairScope: true });
}

export function assertButterflyColdSystemNote(value, label = 'SYSTEM NOTE') {
    const text = core_text.normalizeText(value, 5000);
    if (!text || core_text.isPlaceholderText(text)) {
        throw core_butterflyContract.butterflyValidationError('systemNote');
    }
    return text;
}

function normalizeNarrative(node, context, options = {}) {
    const label = core_text.normalizeText(node?.label, 120);
    const monologue = core_text.normalizeText(node?.monologue, 12000);
    const intervention = core_text.normalizeText(node?.intervention, 12000);
    const systemNote = assertButterflyColdSystemNote(node?.systemNote, `${options.label || label || '观测节点'} SYSTEM NOTE`);
    if (!label || core_text.isPlaceholderText(label)) throw new Error(`${options.label || '观测节点'}缺少有效标题。`);
    if (!monologue || core_text.isPlaceholderText(monologue)) {
        throw core_butterflyContract.butterflyValidationError('monologue');
    }
    if (!intervention || core_text.isPlaceholderText(intervention)) {
        throw core_butterflyContract.butterflyValidationError('intervention');
    }
    for (const [field, value] of Object.entries({ label, monologue, intervention, systemNote })) {
        assertButterflyRelationshipSafety(value, context, `${options.label || label} ${field}`);
    }
    return { label, monologue, intervention, systemNote };
}

export function normalizeButterflyBranch(node, index, memoryBank, context = {}, options = {}) {
    const serial = String(Math.max(1, Number(index) || 1)).padStart(2, '0');
    const worldSpec = normalizeButterflyWorldSpec(node);
    const narrative = normalizeNarrative(node, context, {
        label: options.label || `平行分歧 ${serial}`,
    });
    for (const [field, value] of Object.entries(worldSpec)) {
        if (field !== 'thirdPartyRomance') assertButterflyRelationshipSafety(value, context, `平行分歧 ${serial} worldSpec.${field}`);
    }
    const reference = core_evidence.normalizeMemoryReference(
        node?.sourceMemoryIds,
        node?.sourceMemoryAnchor,
        `${narrative.label}\n${narrative.monologue}\n${narrative.intervention}\n${narrative.systemNote}`,
        memoryBank,
        0,
    );
    const incremental = options.incremental === true;
    return {
        id: incremental ? `EG_NEW_${serial}` : `EG${serial}`,
        label: narrative.label,
        code: incremental ? `> SIMULATION RECORD #NEW-${serial}` : `> SIMULATION RECORD #EG-${serial}`,
        signal: 'IMAGE_DATA_CORRUPTED',
        locked: false,
        trueEnding: false,
        primaryAxis: worldSpec.primaryAxis,
        worldSpec,
        sourceMemoryIds: reference.sourceMemoryIds,
        sourceMemoryAnchor: reference.sourceMemoryAnchor,
        monologue: narrative.monologue,
        intervention: narrative.intervention,
        systemNote: narrative.systemNote,
    };
}

export function normalizeButterflyOmega(node, context = {}) {
    const label = core_text.normalizeText(node?.label, 120);
    const monologue = core_text.normalizeText(node?.monologue, 12000);
    const intervention = core_text.normalizeText(node?.intervention, 12000);
    const systemNote = assertButterflyColdSystemNote(node?.systemNote, '观测点 Ω SYSTEM NOTE');
    if (!label || !/(?:观测点\s*Ω|TRUE\s*ENDING)/i.test(label)) throw core_butterflyContract.butterflyValidationError('omega');
    if (monologue) throw core_butterflyContract.butterflyValidationError('omega');
    if (!intervention || core_text.isPlaceholderText(intervention)) {
        throw core_butterflyContract.butterflyValidationError('omega');
    }
    for (const [field, value] of Object.entries({ label, intervention, systemNote })) {
        assertButterflyRelationshipSafety(value, context, `观测点 Ω ${field}`);
    }
    return {
        id: 'OMEGA', label, code: '> OBSERVATION POINT #OMEGA', locked: false, trueEnding: true,
        sourceMemoryIds: [], sourceMemoryAnchor: '', monologue: '', intervention, systemNote,
    };
}

function isOmegaCandidate(node) {
    const id = core_text.safeId(node?.id, '').toUpperCase();
    const label = core_text.normalizeText(node?.label, 160);
    return id === 'OMEGA' || node?.trueEnding === true || /(?:观测点\s*Ω|TRUE\s*ENDING)/i.test(label);
}

function normalizedMainNode(node, memoryBank, context) {
    const narrative = normalizeNarrative(node, context, {
        label: '主时间线',
    });
    const reference = core_evidence.normalizeMemoryReference(
        node?.sourceMemoryIds, node?.sourceMemoryAnchor,
        `${narrative.label}\n${narrative.monologue}\n${narrative.intervention}\n${narrative.systemNote}`,
        memoryBank, 1,
    );
    if (!reference.sourceMemoryIds.length || !reference.sourceMemoryAnchor) throw new Error('蝴蝶效应主时间线缺少有效档案锚点。');
    return {
        id: 'MAIN', label: narrative.label, code: '> SIMULATION RECORD #MAIN', locked: true, trueEnding: false,
        sourceMemoryIds: reference.sourceMemoryIds, sourceMemoryAnchor: reference.sourceMemoryAnchor,
        monologue: narrative.monologue, intervention: narrative.intervention, systemNote: narrative.systemNote,
    };
}

export function normalizeButterfly(data, memoryBank, context = {}, options = {}) {
    const rawNodes = Array.isArray(data?.nodes) ? data.nodes.slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS) : [];
    if (rawNodes.length < 2) throw new Error('当前观测尚未收尾：需要主线与唯一 Ω，已完成内容仍保留。');
    const omegaIndexes = rawNodes.map((node, index) => isOmegaCandidate(node) ? index : -1).filter(index => index >= 0);
    if (omegaIndexes.length !== 1 || omegaIndexes[0] !== rawNodes.length - 1) {
        throw new Error('蝴蝶效应必须只有一个 Ω / TRUE ENDING，且它必须是数组末项。');
    }
    const main = normalizedMainNode(rawNodes[0], memoryBank, context);
    const normalBranches = rawNodes.slice(1, -1).map((node, index) => normalizeButterflyBranch(node, index + 1, memoryBank, context));
    const expectedAxes = options.expectedAxes;
    if (expectedAxes && (normalBranches.length !== expectedAxes.length
        || normalBranches.some((node, index) => node.primaryAxis !== expectedAxes[index]))) {
        throw new Error('观测节点与本次本地计划不符；保留旧内容。');
    }
    const labels = new Set();
    const signatures = new Set();
    const monologues = new Set();
    for (const branch of normalBranches) {
        const labelKey = core_incremental.normalizedContentKey(branch.label, 180);
        const signature = butterflyWorldSignature(branch);
        const monologueKey = core_incremental.normalizedContentKey(branch.monologue, 12000);
        if (!labelKey || labels.has(labelKey)) throw new Error('平行世界标题重复，不能只换节点编号。');
        if (!signature || signatures.has(signature)) throw new Error('平行世界 worldSpec 重复，必须是实质不同的生活轨迹。');
        if (!monologueKey || monologues.has(monologueKey)) throw new Error('平行世界独白重复，不能只替换标题或设定标签。');
        labels.add(labelKey);
        signatures.add(signature);
        monologues.add(monologueKey);
    }
    const ending = normalizeButterflyOmega(rawNodes[rawNodes.length - 1], context);
    return {
        kind: core_constants.MODE.BUTTERFLY,
        title: core_text.normalizeText(data?.title, 120) || '平行时空观测终端',
        subject: core_text.normalizeText(context?.name2, 120) || '{{char}}',
        status: 'UNSTABLE',
        nodes: [main, ...normalBranches, ending],
        omegaHistory: [],
        selected: 1,
    };
}

export async function generateButterflyWithRepair(context, memoryBank, origin, taskKey, dependencies = {}) {
    const plan = core_butterflyContract.buildButterflyPlan(memoryBank);
    if (!plan.total) throw new Error('当前没有可用记忆，请先生成当前窗口档案。');
    const request = dependencies.request || generation_client.requestValidatedSegment;
    const basePrompt = generation_prompts.PROMPTS[core_constants.MODE.BUTTERFLY](context, memoryBank);
    const contextEnvelope = dependencies.contextEnvelope ?? await core_cache.buildControlledContextEnvelope(context, { worldInfoScanTerms: generation_client.generationWorldInfoScanTerms(core_constants.MODE.BUTTERFLY, context) });
    const nodes = [];
    const labels = new Set(), signatures = new Set(), monologues = new Set();
    // MAIN plans only the branches this story needs. The plan is an allowlisted
    // axis list, never model-owned task keys, markup or a request count.
    const slots = ['MAIN'];
    let plannedAxes = plan.axes;
    const savedSegments = generation_recovery.generationRecoverySegmentsForOrigin(origin) || [];
    const savedMain = savedSegments.find(segment => /:slot:0$/u.test(segment.slot));
    const legacyPlan = legacy_recovery.legacyButterflyPlan(memoryBank);
    const continueLegacyPlan = !!savedMain && (!savedMain.contract || savedMain.contract === 'butterfly-legacy-plan-r62');
    const attemptedLegacyBranches = continueLegacyPlan ? Math.max(0, ...savedSegments.map(segment => {
        const index = Number(segment.slot.match(/:slot:(\d+)$/u)?.[1]);
        return index > 0 && index <= legacyPlan.axes.length ? index : 0;
    })) : 0;
    for (let index = 0; index < slots.length; index++) {
        const slot = slots[index];
        // A legacy Ω keeps its original slot number, even when unstarted old
        // quota slots are omitted. This makes a second interruption resumable.
        const requestIndex = continueLegacyPlan && slot === 'OMEGA' ? legacyPlan.axes.length + 1 : index;
        const existing = nodes.map(node => ({ label: node.label, primaryAxis: node.primaryAxis, worldSpec: node.worldSpec }));
        const prompt = basePrompt + '\n【本请求的分段输出规则替代上面的整批输出 schema】'
            + '\n你这次只输出 {"node":{当前一个完整节点}}，不要返回 nodes 数组或其他节点。不凑节点数量。'
            + '\nCURRENT_SLOT_JSON:' + JSON.stringify({ index, kind: slot, primaryAxis: PRIMARY_AXIS_SET.has(slot) ? slot : undefined })
            + '\nMAIN 只写主时间线，并可给 node.branchAxes 数组，从 era/identity/occupation/location/decision/encounter/bond/fate 选择真正需要的维度。可为空，缺省只展开一个 decision。普通槽位使用指定 primaryAxis；OMEGA 只写终点。没有字数、人称次数或凑齐维度的要求。'
            + '\nEXISTING_VALID_WORLD_INDEX_JSON:' + JSON.stringify(existing)
            + (slot === 'OMEGA' ? '\nVALIDATED_VOICES_JSON:' + JSON.stringify(nodes.map(node => ({ label: node.label, monologue: node.monologue.slice(0, 700), intervention: node.intervention.slice(0, 500) }))) : '');
        const node = await request(prompt, '蝴蝶效应 · 节点 ' + (index + 1) + '/' + (index ? slots.length : '待定') + ' · ' + slot,
            { maxTokens: 4096, temperature: 0.55, context, contextEnvelope, origin, taskKey: taskKey + ':slot:' + requestIndex, mode: core_constants.MODE.BUTTERFLY, background: true,
                recoveryCompatibility: { contract: continueLegacyPlan ? 'butterfly-legacy-plan-r62' : 'butterfly-readable-r62',
                    legacyPrompts: [legacy_recovery.legacyButterflySlotPrompt(context, memoryBank, requestIndex, nodes)] } },
            value => {
                const raw = value?.node;
                if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw core_butterflyContract.butterflyValidationError('worldSpec');
                const candidate = index === 0 ? normalizedMainNode(raw, memoryBank, context)
                    : slot === 'OMEGA' ? normalizeButterflyOmega(raw, context)
                    : normalizeButterflyBranch(raw, index, memoryBank, context);
                if (index === 0) candidate.branchAxes = core_butterflyContract.normalizeButterflyBranchAxes(raw.branchAxes);
                if (PRIMARY_AXIS_SET.has(slot)) {
                    const label = core_incremental.normalizedContentKey(candidate.label, 180);
                    const signature = butterflyWorldSignature(candidate);
                    const monologue = core_incremental.normalizedContentKey(candidate.monologue, 12000);
                    if (candidate.primaryAxis !== slot || labels.has(label) || signatures.has(signature) || monologues.has(monologue)) {
                        throw core_butterflyContract.butterflyValidationError('unique');
                    }
                }
                return candidate;
            });
        nodes.push(node);
        if (index === 0) {
            plannedAxes = continueLegacyPlan ? legacyPlan.axes.slice(0, attemptedLegacyBranches) : node.branchAxes;
            slots.push(...plannedAxes, 'OMEGA');
        }
        if (PRIMARY_AXIS_SET.has(slot)) {
            labels.add(core_incremental.normalizedContentKey(node.label, 180));
            signatures.add(butterflyWorldSignature(node));
            monologues.add(core_incremental.normalizedContentKey(node.monologue, 12000));
        }
    }
    return normalizeButterfly({ nodes }, memoryBank, context, { expectedAxes: plannedAxes });
}
export function butterflyIncrementPrompt(context, memoryBank, previous, sourceMemoryIds) {
    const existing = (Array.isArray(previous?.nodes) ? previous.nodes.slice(1, -1) : []).slice(-core_constants.MAX_INCREMENTAL_EXISTING_INDEX_ITEMS).map(item => ({
        id: core_text.normalizeText(item?.id, 50),
        label: core_text.normalizeText(item?.label, 120),
        code: core_text.normalizeText(item?.code, 120),
        primaryAxis: core_text.normalizeText(item?.primaryAxis || item?.worldSpec?.primaryAxis, 40),
        worldSpec: looseWorldSpec(item),
    }));
    return `${generation_prompts.promptSafetyBoundary(context, '蝴蝶效应 / 增量分歧')}
${core_butterflyContract.BUTTERFLY_GENERATION_CONTRACT}
旧终端节点由本地原样保留。本请求只根据当前档案写确有不同的平行分歧，最多三个是容量上限，不是目标数量。没有新分歧可以只写新观测点 Ω；禁止改写或换措辞复述旧节点。
UNTRUSTED_INCREMENTAL_TIMELINE_JSON:
${core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)}
EXISTING_DIVERGENCE_INDEX_JSON:
${JSON.stringify(existing, null, 2)}

严格输出：
{"nodes":[{"id":"EG_NEW_01","label":"新的分歧点","primaryAxis":"era","worldSpec":{"primaryAxis":"era","era":"具体时代","identity":"具体身份","occupation":"具体职业","location":"具体地点","keyDecision":"关键选择","encounterWithUser":"与 {{user}} 如何相遇或错过","bondWithUser":"与 {{user}} 的关系结果","finalFate":"最终命运","thirdPartyRomance":false},"sourceMemoryIds":[],"sourceMemoryAnchor":"","monologue":"该平行世界角色的心声","intervention":"现世角色读后的回应","systemNote":"简短观测结论"}],"omega":{"id":"OMEGA","label":"观测点 Ω：再次回归现世","monologue":"","intervention":"回应已经看到的分歧与当下选择","systemNote":"本次观测的收尾"}}

要求：
- nodes 可以为空，最多三个真正新的普通分歧；primaryAxis 只能是 era/identity/occupation/location/decision/encounter/bond/fate。
- worldSpec 八个文本字段都要具体，不得写“同上/不变/未知”，thirdPartyRomance 必须为 false，且整体命运组合不得与旧 worldSpec 重复。
- monologue、intervention、systemNote 有完整内容即可，不要求字数、人称次数或算法词配额。
- 新分歧应由 incrementalMemoryIds 带来的关系变化、选择或理解触发，但仍明确是模拟，不伪装成真实历史。
- 必须避开 EXISTING_DIVERGENCE_INDEX_JSON 的标签和命运条件。
- omega.monologue 为空，intervention 自然收尾，不强迫告白或凑齐差异维度。
- 禁止前任/前女友；禁止 {{char}} 与 {{user}} 以外任何人恋爱、结婚或组建家庭。只输出 JSON。`;
}

export function normalizeButterflyIncrementPart(data, memoryBank, context = {}) {
    const rawBranches = Array.isArray(data?.nodes) ? data.nodes : null;
    if (!rawBranches || rawBranches.length > 3) throw core_butterflyContract.butterflyValidationError('worldSpec');
    const branches = rawBranches.map((node, index) => {
        if (isOmegaCandidate(node)) throw new Error('增量 nodes 不得混入 Ω / TRUE ENDING。');
        return normalizeButterflyBranch(node, index + 1, memoryBank, context, { incremental: true });
    });
    const signatures = new Set();
    const labels = new Set();
    const monologues = new Set();
    for (const branch of branches) {
        const signature = butterflyWorldSignature(branch);
        const labelKey = core_incremental.normalizedContentKey(branch.label, 180);
        const monologueKey = core_incremental.normalizedContentKey(branch.monologue, 12000);
        if (!signature || signatures.has(signature) || !labelKey || labels.has(labelKey) || !monologueKey || monologues.has(monologueKey)) {
            throw new Error('蝴蝶效应增量分歧彼此重复。');
        }
        signatures.add(signature);
        labels.add(labelKey);
        monologues.add(monologueKey);
    }
    if (!data?.omega || typeof data.omega !== 'object') throw new Error('蝴蝶效应增量缺少唯一观测点 Ω。');
    return { branches, omega: normalizeButterflyOmega(data.omega, context) };
}
export function butterflyBranchKey(item) {
    return butterflyWorldSignature(item)
        || core_incremental.normalizedContentKey(item?.label, 120)
        || core_incremental.normalizedContentKey(item?.monologue, 360);
}

function historicalOmegaKey(item) {
    return core_incremental.normalizedContentKey([
        item?.incrementBatchId, item?.label, item?.intervention, item?.systemNote,
    ].filter(Boolean).join('|'), 2400);
}

function butterflyMergeBase(previous) {
    const rawNodes = Array.isArray(previous?.nodes) ? previous.nodes : [];
    const main = structuredClone(rawNodes[0] || {});
    const previousOmega = structuredClone(rawNodes[rawNodes.length - 1] || {});
    const middle = rawNodes.slice(1, -1);
    const legacyHistory = middle.filter(item => item?.historicalObservation === true || item?.formerOmega === true || isOmegaCandidate(item));
    const legacySet = new Set(legacyHistory);
    const previousBranches = middle.filter(item => !legacySet.has(item)).map(item => structuredClone(item));
    return { main, previousBranches, previousOmega, legacyHistory };
}

function cleanedHistory(items) {
    const seen = new Set();
    return items.map(item => ({
        ...structuredClone(item),
        historicalObservation: true,
        formerOmega: true,
        trueEnding: false,
    })).filter(item => {
        const key = historicalOmegaKey(item);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(-core_constants.MAX_DERIVED_CONTENT_ITEMS);
}

export function mergeButterflyIncremental(previous, part, sourceMemoryIds) {
    const { main, previousBranches, previousOmega, legacyHistory } = butterflyMergeBase(previous);
    const baseHistory = cleanedHistory([
        ...(Array.isArray(previous?.omegaHistory) ? previous.omegaHistory : []),
        ...legacyHistory,
    ]);
    const baseNodes = [main, ...previousBranches, previousOmega];
    const sanitizedBase = {
        ...structuredClone(previous),
        nodes: baseNodes,
        omegaHistory: baseHistory,
        selected: Math.max(1, baseNodes.length - 1),
    };
    const branchCapacity = core_constants.MAX_DERIVED_CONTENT_ITEMS - baseNodes.length;
    if (branchCapacity < 1) return sanitizedBase;

    const usedIds = new Set([
        ...baseNodes.map(item => core_text.normalizeText(item?.id, 60)),
        ...baseHistory.map(item => core_text.normalizeText(item?.id, 60)),
    ].filter(Boolean));
    const seen = new Set(previousBranches.map(butterflyBranchKey));
    const seenLabels = new Set(previousBranches.map(item => core_incremental.normalizedContentKey(item?.label, 180)).filter(Boolean));
    const seenMonologues = new Set(previousBranches.map(item => core_incremental.normalizedContentKey(item?.monologue, 12000)).filter(Boolean));
    const batchId = core_incremental.incrementalBatchId('butterfly', sourceMemoryIds);
    const addedBranches = [];
    for (const branch of part?.branches || []) {
        if (addedBranches.length >= branchCapacity) break;
        const key = butterflyBranchKey(branch);
        const labelKey = core_incremental.normalizedContentKey(branch?.label, 180);
        const monologueKey = core_incremental.normalizedContentKey(branch?.monologue, 12000);
        if (!key || seen.has(key) || !labelKey || seenLabels.has(labelKey) || !monologueKey || seenMonologues.has(monologueKey)) continue;
        seen.add(key);
        seenLabels.add(labelKey);
        seenMonologues.add(monologueKey);
        const serial = String(previousBranches.length + addedBranches.length + 1).padStart(2, '0');
        addedBranches.push({
            ...structuredClone(branch),
            id: core_incremental.uniqueGeneratedId(`EG${serial}`, usedIds, 'EG'),
            code: '> SIMULATION RECORD #EG-' + serial,
            signal: 'IMAGE_DATA_CORRUPTED',
            locked: false,
            trueEnding: false,
            sourceArchiveMemoryIds: core_text.cleanArray(sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40),
            incrementBatchId: batchId,
        });
    }
    if (!addedBranches.length && ((part?.branches || []).length
        || historicalOmegaKey(part?.omega) === historicalOmegaKey(previousOmega))) return sanitizedBase;

    const historicalOmega = {
        ...structuredClone(previousOmega),
        id: core_incremental.uniqueGeneratedId('OBS_' + batchId.slice(0, 10), usedIds, 'OBS'),
        label: core_text.normalizeText('历史观测记录 · ' + (previousOmega?.label || '观测点 Ω'), 120),
        code: '> HISTORICAL OBSERVATION #' + batchId.slice(0, 10).toUpperCase(),
        historicalObservation: true,
        formerOmega: true,
        trueEnding: false,
    };
    const omegaHistory = cleanedHistory([...baseHistory, historicalOmega]);
    const omega = {
        ...structuredClone(part.omega),
        id: 'OMEGA',
        code: '> OBSERVATION POINT #OMEGA',
        locked: false,
        trueEnding: true,
        monologue: '',
        sourceArchiveMemoryIds: core_text.cleanArray(sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40),
        incrementBatchId: batchId,
    };
    const nodes = [main, ...previousBranches, ...addedBranches, omega];
    return {
        ...structuredClone(previous),
        nodes,
        omegaHistory,
        selected: Math.max(1, nodes.length - 1),
    };
}
export async function generateButterflyIncrementalWithRepair(context, memoryBank, origin, taskKey, previous) {
    const sourceMemoryIds = core_incremental.derivedExpansionMemoryIds(previous, memoryBank, 'mode');
    const { previousBranches } = butterflyMergeBase(previous);
    if (previousBranches.length + 2 >= core_constants.MAX_DERIVED_CONTENT_ITEMS) {
        const sanitized = mergeButterflyIncremental(previous, { branches: [], omega: previous.nodes?.[previous.nodes.length - 1] }, sourceMemoryIds);
        return core_incremental.stampIncrementalCoverage(sanitized, previous, memoryBank, 'mode', sourceMemoryIds, 0);
    }
    const part = await generation_client.requestValidatedSegment(
        butterflyIncrementPrompt(context, memoryBank, previous, sourceMemoryIds) + core_incremental.derivedExpansionDirective(previous, memoryBank),
        '蝴蝶效应 · 正在追加新的平行分歧…',
        { maxTokens: 9000, temperature: 0.55, context, origin, taskKey: `${taskKey}:increment`, mode: core_constants.MODE.BUTTERFLY, background: true,
            recoveryCompatibility: { contract: 'butterfly-readable-r62', legacyPrompts: [
                legacy_recovery.legacyButterflyIncrementPrompt(context, memoryBank, previous, sourceMemoryIds) + core_incremental.derivedExpansionDirective(previous, memoryBank),
            ] } },
        raw => normalizeButterflyIncrementPart(raw, memoryBank, context),
    );
    const merged = mergeButterflyIncremental(previous, part, sourceMemoryIds);
    return core_incremental.stampIncrementalCoverage(merged, previous, memoryBank, 'mode', sourceMemoryIds, Math.max(0, merged.nodes.length - previous.nodes.length));
}
