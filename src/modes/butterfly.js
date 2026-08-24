// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_constants from '../core/constants.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import * as generation_prompts from '../generation/prompts.js';

export function normalizeButterfly(data, memoryBank) {
    const rawNodes = Array.isArray(data?.nodes) ? data.nodes.slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS) : [];
    const normalized = rawNodes.map((node, rawIndex) => {
        const isMain = rawIndex === 0;
        const label = core_text.normalizeText(node?.label, 120);
        const monologue = core_text.normalizeText(node?.monologue, 12000);
        const intervention = core_text.normalizeText(node?.intervention, 12000);
        const systemNote = core_text.normalizeText(node?.systemNote, 5000);
        const reference = core_evidence.normalizeMemoryReference(
            node?.sourceMemoryIds,
            node?.sourceMemoryAnchor,
            `${label}\n${monologue}\n${intervention}\n${systemNote}`,
            memoryBank,
            isMain ? 1 : 0,
        );
        const numericCode = String(Math.max(1, rawIndex)).padStart(2, '0');
        return {
            id: core_text.safeId(node?.id, isMain ? 'MAIN' : `EG${numericCode}`),
            label,
            code: core_text.normalizeText(node?.code, 120) || (isMain ? '> SIMULATION RECORD #MAIN' : `> SIMULATION RECORD #EG-${numericCode}`),
            locked: isMain ? true : !!node?.locked,
            trueEnding: isMain ? false : !!node?.trueEnding,
            sourceMemoryIds: reference.sourceMemoryIds,
            sourceMemoryAnchor: reference.sourceMemoryAnchor,
            monologue,
            intervention,
            systemNote,
        };
    });
    const main = normalized[0];
    if (!main || !main.label || main.monologue.length < 100 || !main.intervention || !main.systemNote || !main.sourceMemoryIds.length || !main.sourceMemoryAnchor) {
        throw new Error('蝴蝶效应主时间线缺少有效档案锚点或深度内容。');
    }
    main.locked = true;
    main.trueEnding = false;
    main.code = '> SIMULATION RECORD #MAIN';

    const outerNodes = normalized.slice(1);
    if (outerNodes.length < 9) throw new Error(`平行时空节点不足：普通平行分歧与观测点 Ω 合计 ${outerNodes.length} 条，至少需要 9 条。`);

    // The final Ω node is not another parallel world. It represents the current-world
    // subject after observing every prior parallel subject, so it intentionally has no
    // parallel monologue and is validated separately from ordinary branches.
    const ending = outerNodes[outerNodes.length - 1];
    const normalBranches = outerNodes.slice(0, -1).filter(node => node.label && node.monologue.length >= 100 && node.intervention && node.systemNote);
    if (normalBranches.length < 8) throw new Error(`普通平行分歧不足：得到 ${normalBranches.length} 条，至少需要 8 条。`);
    for (const branch of normalBranches) {
        branch.trueEnding = false;
        branch.locked = false;
    }

    if (!ending?.label || !ending?.intervention || ending.intervention.length < 160 || !ending.systemNote) {
        throw new Error('观测点 Ω 缺少现世终局发言或系统结论。');
    }
    ending.id = 'OMEGA';
    ending.trueEnding = true;
    ending.locked = false;
    ending.code = '> OBSERVATION POINT #OMEGA';
    ending.monologue = '';
    ending.sourceMemoryIds = [];
    ending.sourceMemoryAnchor = '';
    if (!/(观测点\s*Ω|TRUE\s*ENDING)/i.test(ending.label)) ending.label = `观测点 Ω：${ending.label || '回归现世'}`;

    const nodes = [main, ...normalBranches, ending];
    return {
        kind: core_constants.MODE.BUTTERFLY,
        title: core_text.normalizeText(data?.title, 120) || '平行时空观测终端',
        subject: core_text.normalizeText(data?.subject, 120),
        status: 'UNSTABLE',
        nodes,
        selected: 1,
    };
}

export function butterflyIncrementPrompt(context, memoryBank, previous, sourceMemoryIds) {
    const existing = (Array.isArray(previous?.nodes) ? previous.nodes.slice(1, -1) : []).slice(-core_constants.MAX_INCREMENTAL_EXISTING_INDEX_ITEMS).map(item => ({
        id: core_text.normalizeText(item?.id, 50),
        label: core_text.normalizeText(item?.label, 120),
        code: core_text.normalizeText(item?.code, 120),
    }));
    return `${generation_prompts.promptSafetyBoundary(context, '蝴蝶效应 / 增量分歧')}
旧终端节点由本地原样保留。本请求只根据新增档案生成 1～3 个尚未出现的平行分歧，并给出看完全部旧分歧和新分歧后的新观测点 Ω；禁止改写或换措辞复述旧节点。
UNTRUSTED_INCREMENTAL_TIMELINE_JSON:
${core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)}
EXISTING_DIVERGENCE_INDEX_JSON:
${JSON.stringify(existing, null, 2)}

严格输出：
{"nodes":[{"id":"EG_NEW_01","label":"新的分歧点","code":"> SIMULATION RECORD #NEW-01","locked":false,"trueEnding":false,"sourceMemoryIds":[],"sourceMemoryAnchor":"","monologue":"该平行世界 {{char}} 第一人称发言","intervention":"现世 {{char}} 的即时回应","systemNote":"系统判定"}],"omega":{"id":"OMEGA","label":"观测点 Ω：再次回归现世","code":"> OBSERVATION POINT #OMEGA","locked":false,"trueEnding":true,"sourceMemoryIds":[],"sourceMemoryAnchor":"","monologue":"","intervention":"现世 {{char}} 看完全部既有和新增分歧后的新最终发言","systemNote":"完整观测后的系统判定"}}

要求：
- nodes 只给 1～3 个真正新的普通分歧；每个 monologue 不少于100汉字，intervention/systemNote 必须有内容。
- 新分歧应由 incrementalMemoryIds 带来的关系变化、选择或理解触发，但仍明确是模拟，不伪装成真实历史。
- 必须避开 EXISTING_DIVERGENCE_INDEX_JSON 的标签和命运条件。
- omega.monologue 必须为空，omega.intervention 不少于160汉字，并综合旧分歧与本轮新分歧；旧 Ω 会由本地保存成历史观测记录。
- 禁止前任/前女友与第三方恋爱；只输出 JSON。`;
}

export function normalizeButterflyIncrementPart(data, memoryBank) {
    const branches = (Array.isArray(data?.nodes) ? data.nodes : []).slice(0, 3).map((node, index) => {
        const label = core_text.normalizeText(node?.label, 120);
        const monologue = core_text.normalizeText(node?.monologue, 12000);
        const intervention = core_text.normalizeText(node?.intervention, 12000);
        const systemNote = core_text.normalizeText(node?.systemNote, 5000);
        if (!label || monologue.length < 100 || !intervention || !systemNote) return null;
        const reference = core_evidence.normalizeMemoryReference(node?.sourceMemoryIds, node?.sourceMemoryAnchor, `${label}\n${monologue}\n${intervention}\n${systemNote}`, memoryBank, 0);
        return {
            id: core_text.safeId(node?.id, `EG_NEW_${String(index + 1).padStart(2, '0')}`),
            label,
            code: core_text.normalizeText(node?.code, 120) || `> SIMULATION RECORD #NEW-${String(index + 1).padStart(2, '0')}`,
            locked: false,
            trueEnding: false,
            sourceMemoryIds: reference.sourceMemoryIds,
            sourceMemoryAnchor: reference.sourceMemoryAnchor,
            monologue,
            intervention,
            systemNote,
        };
    }).filter(Boolean);
    if (!branches.length) throw new Error('蝴蝶效应增量没有生成可用的新分歧。');
    const rawOmega = data?.omega && typeof data.omega === 'object' ? data.omega : {};
    const omega = {
        id: 'OMEGA',
        label: core_text.normalizeText(rawOmega?.label, 120) || '观测点 Ω：再次回归现世',
        code: '> OBSERVATION POINT #OMEGA',
        locked: false,
        trueEnding: true,
        sourceMemoryIds: [],
        sourceMemoryAnchor: '',
        monologue: '',
        intervention: core_text.normalizeText(rawOmega?.intervention, 12000),
        systemNote: core_text.normalizeText(rawOmega?.systemNote, 5000),
    };
    if (omega.intervention.length < 160 || !omega.systemNote) throw new Error('蝴蝶效应增量观测点 Ω 内容不足。');
    if (!/(观测点\s*Ω|TRUE\s*ENDING)/i.test(omega.label)) omega.label = `观测点 Ω：${omega.label}`;
    return { branches, omega };
}

export function butterflyBranchKey(item) {
    return core_incremental.normalizedContentKey(item?.label, 120) || core_incremental.normalizedContentKey(item?.monologue, 360);
}

export function mergeButterflyIncremental(previous, part, sourceMemoryIds) {
    // Turning the current Ω into a historical observation and appending the next Ω costs one
    // extra slot even before a new branch is added. Never evict an older node to make room.
    const branchCapacity = core_constants.MAX_DERIVED_CONTENT_ITEMS - (previous.nodes.length + 1);
    if (branchCapacity < 1) return structuredClone(previous);
    const main = structuredClone(previous.nodes[0]);
    const previousBranches = previous.nodes.slice(1, -1).map(item => structuredClone(item));
    const previousOmega = structuredClone(previous.nodes[previous.nodes.length - 1]);
    const usedIds = new Set(previous.nodes.map(item => core_text.normalizeText(item?.id, 60)).filter(Boolean));
    const seen = new Set(previousBranches.map(butterflyBranchKey));
    const batchId = core_incremental.incrementalBatchId('butterfly', sourceMemoryIds);
    const historicalOmega = {
        ...previousOmega,
        id: core_incremental.uniqueGeneratedId(`OBS_${batchId.slice(0, 10)}`, usedIds, 'OBS'),
        label: core_text.normalizeText(`历史观测记录 · ${previousOmega.label || '观测点 Ω'}`, 120),
        historicalObservation: true,
        trueEnding: true,
    };
    const addedBranches = [];
    for (const branch of part.branches || []) {
        if (addedBranches.length >= branchCapacity) break;
        const key = butterflyBranchKey(branch);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        addedBranches.push({
            ...structuredClone(branch),
            id: core_incremental.uniqueGeneratedId(branch.id, usedIds, 'EG'),
            sourceArchiveMemoryIds: core_text.cleanArray(sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40),
            incrementBatchId: batchId,
        });
    }
    const omega = {
        ...structuredClone(part.omega),
        id: 'OMEGA',
        sourceArchiveMemoryIds: core_text.cleanArray(sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40),
        incrementBatchId: batchId,
    };
    const nodes = [main, ...previousBranches, historicalOmega, ...addedBranches, omega];
    return {
        ...structuredClone(previous),
        nodes,
        selected: Math.max(1, nodes.length - 1),
    };
}

export async function generateButterflyIncrementalWithRepair(context, memoryBank, origin, taskKey, previous) {
    const sourceMemoryIds = core_incremental.incrementalArchiveMemoryIds(previous, memoryBank, 'mode');
    if (previous.nodes.length + 2 > core_constants.MAX_DERIVED_CONTENT_ITEMS) {
        return core_incremental.stampIncrementalCoverage(structuredClone(previous), previous, memoryBank, 'mode', sourceMemoryIds, 0);
    }
    const part = await generation_client.requestValidatedSegment(
        butterflyIncrementPrompt(context, memoryBank, previous, sourceMemoryIds),
        '蝴蝶效应 · 正在追加新的平行分歧…',
        { maxTokens: 7000, temperature: 0.55, context, origin, taskKey: `${taskKey}:increment`, mode: core_constants.MODE.BUTTERFLY, background: true },
        raw => normalizeButterflyIncrementPart(raw, memoryBank),
    );
    const merged = mergeButterflyIncremental(previous, part, sourceMemoryIds);
    return core_incremental.stampIncrementalCoverage(merged, previous, memoryBank, 'mode', sourceMemoryIds, Math.max(0, merged.nodes.length - previous.nodes.length));
}
