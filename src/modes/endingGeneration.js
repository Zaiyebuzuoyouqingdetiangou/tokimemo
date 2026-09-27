import * as cg_visual from '../core/cgVisualRules.js';
import * as core_cache from '../core/cache.js';
import * as cg_targets from '../core/cgTargets.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import { endingConfessionRefreshPrompt, endingIncrementOutlinePrompt, endingNeedsScenes, endingOutlinePrompt, endingRouteDetailPrompt, endingRouteEvidenceKey, mergeEndingConfessions, normalizeEndingConfessionLines, normalizeEndingConfessionReplays, normalizeEndingIncrementOutline, normalizeEndingOutline, normalizeEndingRouteDetail } from './endingData.js';
// 结局生成：整体规范化、增量合并、整体生成与修复
// 从 modes/ending.js 原样搬出（重构阶段 2），声明文本一字未改；modes/ending.js 仍转发原有导出。

export function mergeEndingIncremental(previous, outline, detailed, freshConfessions, memoryBank, revisit = false, catalogOnly = false) {
    if (revisit) outline = { ...outline, relationshipState: previous.relationshipState, relationshipSummary: previous.relationshipSummary,
        relationshipSourceMemoryIds: previous.relationshipSourceMemoryIds, relationshipSourceMemoryAnchor: previous.relationshipSourceMemoryAnchor };
    const merged = structuredClone(previous);
    const history = Array.isArray(merged.relationshipHistory) ? merged.relationshipHistory : [];
    const oldHistoryKey = `${core_incremental.normalizedContentKey(previous.relationshipState, 120)}|${core_incremental.normalizedContentKey(previous.relationshipSummary, 400)}`;
    if (previous.relationshipSummary && !history.some(item => `${core_incremental.normalizedContentKey(item?.relationshipState, 120)}|${core_incremental.normalizedContentKey(item?.relationshipSummary, 400)}` === oldHistoryKey)) {
        history.push({
            relationshipState: previous.relationshipState,
            relationshipSummary: previous.relationshipSummary,
            relationshipSourceMemoryIds: previous.relationshipSourceMemoryIds,
            relationshipSourceMemoryAnchor: previous.relationshipSourceMemoryAnchor,
            archivedAt: Date.now(),
        });
    }
    merged.relationshipHistory = history.slice(-60);
    merged.relationshipState = outline.relationshipState;
    merged.relationshipSummary = outline.relationshipSummary;
    merged.relationshipSourceMemoryIds = outline.relationshipSourceMemoryIds;
    merged.relationshipSourceMemoryAnchor = outline.relationshipSourceMemoryAnchor;

    const detailById = new Map((detailed || []).map(item => [item.id, item]));
    const incoming = (outline.endings || []).map(item => detailById.get(item.id) || item).map(item => revisit ? { ...item, expansionRound: (Number(previous.generationMeta?.expansionRound) || 0) + 1 } : item);
    const byKey = new Map((merged.endings || []).map((item, index) => [endingRouteEvidenceKey(item), index]));
    const usedIds = new Set((merged.endings || []).map(item => item.id));
    let added = 0;
    let recommended = previous.recommendedEndingId;
    for (const item of incoming) {
        const key = endingRouteEvidenceKey(item);
        let existingIndex = byKey.get(key);
        if (existingIndex === undefined) {
            existingIndex = merged.endings.findIndex(old => old.type === item.type && core_incremental.normalizedContentKey(old.title, 120) === core_incremental.normalizedContentKey(item.title, 120));
        }
        if (existingIndex !== undefined && existingIndex >= 0) {
            const old = merged.endings[existingIndex];
            if (!revisit && !old.available && item.available) {
                merged.endings[existingIndex] = { ...old, ...structuredClone(item), id: old.id };
                added += 1;
                if (outline.recommendedEndingId === item.id) recommended = old.id;
            }
            continue;
        }
        if (merged.endings.length >= core_constants.MAX_DERIVED_CONTENT_ITEMS) continue;
        const next = { ...structuredClone(item), id: core_incremental.uniqueGeneratedId(item.id, usedIds, 'END') };
        merged.endings.push(next);
        byKey.set(key, merged.endings.length - 1);
        added += 1;
        if (outline.recommendedEndingId === item.id && item.available) recommended = next.id;
    }
    const confessionMerge = mergeEndingConfessions(previous.confessionReplays, freshConfessions);
    merged.confessionReplays = confessionMerge.items;
    merged.recommendedEndingId = recommended;
    const normalized = normalizeEnding(merged, memoryBank, { catalogOnly });
    // Expansion identity is local metadata, never authority accepted from model output.
    const localRounds = new Map(merged.endings.map(item => [item.id, item.expansionRound]));
    normalized.endings.forEach(item => { if (localRounds.get(item.id)) item.expansionRound = localRounds.get(item.id); });
    return { session: normalized, added: added + confessionMerge.added };
}

async function fillEndingScenes(context, memoryBank, origin, taskKey, previous) {
    core_requestCoordinator.noteSecondStepOffer(origin, null);
    const available = previous.endings.filter(item => item.available && String(item.endingScene || '').length < 320);
    if (!available.length) return previous;
    const outline = {
        title: previous.title,
        relationshipState: previous.relationshipState,
        relationshipSummary: previous.relationshipSummary,
        relationshipSourceMemoryIds: previous.relationshipSourceMemoryIds,
        relationshipSourceMemoryAnchor: previous.relationshipSourceMemoryAnchor,
        recommendedEndingId: previous.recommendedEndingId,
        endings: previous.endings,
    };
    const detailed = await generation_client.mapGenerationConcurrent(available, core_constants.SEGMENT_REQUEST_CONCURRENCY,
        (route, index) => generation_client.requestValidatedSegment(
            endingRouteDetailPrompt(context, memoryBank, outline, route),
            `ENDING · 路线正文 ${index + 1}/${available.length}：${route.title}…`,
            { maxTokens: 9000, context, origin, taskKey: `${taskKey}:route:${route.id}`, mode: core_constants.MODE.ENDING, background: true },
            raw => normalizeEndingRouteDetail(raw, route),
        ));
    let confessionReplays = previous.confessionReplays || [];
    try {
        confessionReplays = await generation_client.requestValidatedSegment(
            endingConfessionRefreshPrompt(context, memoryBank, previous),
            'ENDING · 正在扫描已发生告白…',
            { maxTokens: 8000, temperatureCeiling: 0.35, context, origin, taskKey: `${taskKey}:confession`, mode: core_constants.MODE.ENDING, background: true, segmentMaxAttempts: 1 },
            raw => normalizeEndingConfessionReplays(raw?.confessionReplays, memoryBank),
        );
    } catch (error) {
        if (error?.name === 'AbortError' || error?.code === 'RMT_BANNED_GENERATED_PHRASE'
            || error?.code === 'RMT_JSON_TRUNCATED' || String(error?.code || '').startsWith('RMT_RECOVERY_')) throw error;
        confessionReplays = previous.confessionReplays || [];
    }
    const detailedById = new Map(detailed.map(item => [item.id, item]));
    return normalizeEnding({
        ...previous,
        confessionReplays,
        endings: previous.endings.map(route => detailedById.get(route.id) || route),
    }, memoryBank);
}

export async function generateEndingWithRepair(context, memoryBank, origin, taskKey, options = {}) {
    const previous = options.replaceExisting === true ? null : core_cache.loadSession(core_constants.MODE.ENDING, { context, chatId: core_context.getChatId(context), memoryBank, clone: true });
    const sourceMemoryIds = core_incremental.derivedExpansionMemoryIds(previous, memoryBank, 'mode');
    const fillNow = options.secondStep === true || core_settings.getPluginSettings().autoSecondPass === true;
    if (options.secondStep === true && endingNeedsScenes(previous)) {
        return fillEndingScenes(context, memoryBank, origin, taskKey, previous);
    }
    if (previous) {
        const outline = await generation_client.requestValidatedSegment(
            endingIncrementOutlinePrompt(context, memoryBank, previous, sourceMemoryIds) + core_incremental.derivedExpansionDirective(previous, memoryBank),
            'ENDING · 正在从新增档案判断新路线…',
            { maxTokens: 5000, temperatureCeiling: 0.35, context, origin, taskKey: `${taskKey}:increment-outline`, mode: core_constants.MODE.ENDING, background: true },
            raw => normalizeEndingIncrementOutline(raw, memoryBank, sourceMemoryIds),
        );
        const usedIds = new Set(previous.endings.map(item => item.id));
        const revisit = !core_incremental.incrementalArchiveMemoryIds(previous, memoryBank).length;
        if (revisit) {
            Object.assign(outline, { relationshipState: previous.relationshipState, relationshipSummary: previous.relationshipSummary,
                relationshipSourceMemoryIds: previous.relationshipSourceMemoryIds, relationshipSourceMemoryAnchor: previous.relationshipSourceMemoryAnchor });
            const allowedTypes = new Set(previous.endings.filter(item => item.available).map(item => item.type));
            const lockedTitles = new Set(previous.endings.filter(item => !item.available).map(item => `${item.type}|${core_incremental.normalizedContentKey(item.title, 120)}`));
            outline.endings = outline.endings.filter(item => item.available && allowedTypes.has(item.type)
                && !lockedTitles.has(`${item.type}|${core_incremental.normalizedContentKey(item.title, 120)}`)).slice(0, 3);
        }
        const originalRecommended = outline.recommendedEndingId;
        for (const route of outline.endings) {
            const originalId = route.id;
            route.id = core_incremental.uniqueGeneratedId(route.id, usedIds, 'END');
            if (originalRecommended === originalId) outline.recommendedEndingId = route.id;
        }
        if (!fillNow) {
            if (!outline.endings.length) {
                return core_incremental.stampIncrementalCoverage(structuredClone(previous), previous, memoryBank, 'mode', sourceMemoryIds, 0);
            }
            const catalog = mergeEndingIncremental(previous, outline, [], [], memoryBank, revisit, true);
            core_requestCoordinator.noteSecondStepOffer(origin, {
                label: '路线正文', kind: 'ending-scenes', mode: core_constants.MODE.ENDING, pageId: core_constants.MODE.ENDING,
            });
            core_incremental.stampIncrementalCoverage(catalog.session, previous, memoryBank, 'mode', sourceMemoryIds, catalog.added);
            return catalog.session;
        }
        const available = outline.endings.filter(item => item.available);
        const detailed = await generation_client.mapGenerationConcurrent(available, core_constants.SEGMENT_REQUEST_CONCURRENCY, async (route, index) => generation_client.requestValidatedSegment(
            endingRouteDetailPrompt(context, memoryBank, outline, route),
            `ENDING · 新路线 ${index + 1}/${available.length}：${route.title}…`,
            { maxTokens: 9000, context, origin, taskKey: `${taskKey}:increment-route:${route.id}`, mode: core_constants.MODE.ENDING, background: true },
            raw => normalizeEndingRouteDetail(raw, route),
        ));
        let freshConfessions = [];
        let confessionScanSucceeded = false;
        try {
            freshConfessions = revisit ? [] : await generation_client.requestValidatedSegment(
                endingConfessionRefreshPrompt(context, memoryBank, previous, sourceMemoryIds),
                'ENDING · 正在从新增档案扫描新告白…',
                { maxTokens: 8000, temperatureCeiling: 0.35, context, origin, taskKey: `${taskKey}:increment-confession`, mode: core_constants.MODE.ENDING, background: true, segmentMaxAttempts: 1 },
                raw => normalizeEndingConfessionReplays(raw?.confessionReplays, memoryBank)
                    .filter(item => core_incremental.usesIncrementalMemoryId(item.sourceMemoryIds, sourceMemoryIds)),
            );
            confessionScanSucceeded = true;
        } catch (error) {
            if (error?.name === 'AbortError' || error?.code === 'RMT_BANNED_GENERATED_PHRASE'
                || error?.code === 'RMT_JSON_TRUNCATED' || String(error?.code || '').startsWith('RMT_RECOVERY_')) throw error;
            console.warn('[HeartbeatMemories] incremental ENDING confession scan failed; keeping old replays', core_text.safeErrorDiagnostic(error));
        }
        const merged = mergeEndingIncremental(previous, outline, detailed, freshConfessions, memoryBank, revisit);
        core_incremental.stampIncrementalCoverage(merged.session, previous, memoryBank, 'mode', sourceMemoryIds, merged.added);
        if (confessionScanSucceeded) {
            core_incremental.stampIncrementalCoverage(merged.session, previous, memoryBank, 'confessions', sourceMemoryIds, freshConfessions.length);
        }
        return merged.session;
    }
    const outline = await generation_client.requestValidatedSegment(
        endingOutlinePrompt(context, memoryBank),
        'ENDING · 正在判断关系与路线目录…',
        { maxTokens: 7000, temperatureCeiling: 0.35, context, origin, taskKey: `${taskKey}:outline`, mode: core_constants.MODE.ENDING, background: true },
        raw => normalizeEndingOutline(raw, memoryBank),
    );
    if (!fillNow) {
        const normalized = normalizeEnding({ ...outline, confessionReplays: [] }, memoryBank, { catalogOnly: true });
        core_requestCoordinator.noteSecondStepOffer(origin, {
            label: '路线正文', kind: 'ending-scenes', mode: core_constants.MODE.ENDING, pageId: core_constants.MODE.ENDING,
        });
        core_incremental.stampIncrementalCoverage(normalized, null, memoryBank, 'mode', sourceMemoryIds, normalized.endings.length);
        return normalized;
    }
    core_requestCoordinator.noteSecondStepOffer(origin, null);
    const available = outline.endings.filter(item => item.available);
    const detailed = await generation_client.mapGenerationConcurrent(available, core_constants.SEGMENT_REQUEST_CONCURRENCY,
        (route, index) => generation_client.requestValidatedSegment(
            endingRouteDetailPrompt(context, memoryBank, outline, route),
            `ENDING · 路线 ${index + 1}/${available.length}：${route.title}…`,
            { maxTokens: 9000, context, origin, taskKey: `${taskKey}:route:${route.id}`, mode: core_constants.MODE.ENDING, background: true, segmentMaxAttempts: 2 },
            raw => normalizeEndingRouteDetail(raw, route),
        ));
    let confessionReplays = [];
    let confessionScanSucceeded = false;
    try {
        confessionReplays = await generation_client.requestValidatedSegment(
            endingConfessionRefreshPrompt(context, memoryBank),
            'ENDING · 正在扫描已发生告白…',
            { maxTokens: 10000, temperatureCeiling: 0.35, context, origin, taskKey: `${taskKey}:confession`, mode: core_constants.MODE.ENDING, background: true, segmentMaxAttempts: 1 },
            raw => normalizeEndingConfessionReplays(raw?.confessionReplays, memoryBank),
        );
        confessionScanSucceeded = true;
    } catch (error) {
        if (error?.name === 'AbortError' || error?.code === 'RMT_BANNED_GENERATED_PHRASE'
            || error?.code === 'RMT_JSON_TRUNCATED' || String(error?.code || '').startsWith('RMT_RECOVERY_')) throw error;
        console.warn('[HeartbeatMemories] split ENDING confession scan failed; preserving the previous replay cache when available', core_text.safeErrorDiagnostic(error));
        try {
            const previous = core_cache.loadSession(core_constants.MODE.ENDING, { context, chatId: core_context.getChatId(context), memoryBank, clone: true });
            confessionReplays = Array.isArray(previous?.confessionReplays) ? previous.confessionReplays : [];
        } catch {
            confessionReplays = [];
        }
    }
    const detailedById = new Map(detailed.map(item => [item.id, item]));
    const merged = {
        title: outline.title,
        relationshipState: outline.relationshipState,
        relationshipSummary: outline.relationshipSummary,
        relationshipSourceMemoryIds: outline.relationshipSourceMemoryIds,
        relationshipSourceMemoryAnchor: outline.relationshipSourceMemoryAnchor,
        recommendedEndingId: outline.recommendedEndingId,
        confessionReplays,
        endings: outline.endings.map(route => detailedById.get(route.id) || route),
    };
    const normalized = normalizeEnding(merged, memoryBank);
    core_incremental.stampIncrementalCoverage(normalized, null, memoryBank, 'mode', sourceMemoryIds, normalized.endings.length);
    if (confessionScanSucceeded) {
        core_incremental.stampIncrementalCoverage(normalized, null, memoryBank, 'confessions', sourceMemoryIds, normalized.confessionReplays.length);
    }
    return normalized;
}

export function normalizeEnding(data, memoryBank, options = {}) {
    const relationshipState = core_text.normalizeText(data?.relationshipState, 120) || '关系仍在发展';
    const relationshipSummary = core_text.normalizeText(data?.relationshipSummary, 2400);
    if (!relationshipSummary) throw new Error('结局档案缺少当前关系摘要。');
    const relationshipReference = core_evidence.normalizeMemoryReference(
        data?.relationshipSourceMemoryIds,
        data?.relationshipSourceMemoryAnchor,
        `${relationshipState}
${relationshipSummary}`,
        memoryBank,
        1,
    );
    if (!relationshipReference.sourceMemoryIds.length || !relationshipReference.sourceMemoryAnchor) {
        throw new Error('结局档案的当前关系阶段缺少真实档案锚点。');
    }
    const confessionReplays = normalizeEndingConfessionReplays(data?.confessionReplays, memoryBank);
    const raw = Array.isArray(data?.endings) ? data.endings : [];
    const endings = raw.slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS).map((item, index) => {
        const typeRaw = core_text.normalizeText(item?.type, 40).toLowerCase();
        const type = core_constants.ENDING_TYPES.has(typeRaw) ? typeRaw : 'personal';
        const available = !!item?.available;
        const title = core_text.normalizeText(item?.title, 100) || `结局路线 ${index + 1}`;
        const subtitle = core_text.normalizeText(item?.subtitle, 240);
        const unlockHint = core_text.normalizeText(item?.unlockHint, 1200);
        const endingScene = available ? core_text.normalizeText(item?.endingScene, 12000) : '';
        const confessionLines = available ? normalizeEndingConfessionLines(item?.confessionLines, item?.confession) : [];
        const confession = available ? core_text.normalizeText(confessionLines.join('\n') || item?.confession, 6000) : '';
        const creditsLine = available ? core_text.normalizeText(item?.creditsLine, 600) : '';
        const rawEpilogue = item?.epilogue && typeof item.epilogue === 'object' ? item.epilogue : {};
        const epilogueScenes = available
            ? (Array.isArray(rawEpilogue?.scenes) ? rawEpilogue.scenes : []).slice(0, 6).map((scene, sceneIndex) => ({
                title: core_text.normalizeText(scene?.title, 120) || `后日谈 ${sceneIndex + 1}`,
                text: core_text.normalizeText(scene?.text, 5000),
        ...cg_visual.generatedCgSceneFields(scene),
            })).filter(scene => scene.text.length >= 90)
            : [];
        const epilogue = {
            title: core_text.normalizeText(rawEpilogue?.title, 120) || '后日谈',
            timeSkip: available ? core_text.normalizeText(rawEpilogue?.timeSkip, 200) : '',
            scenes: epilogueScenes,
            finalLine: available ? core_text.normalizeText(rawEpilogue?.finalLine, 1200) : '',
        };
        const evidenceText = `${relationshipState}\n${relationshipSummary}\n${title}\n${subtitle}\n${unlockHint}\n${endingScene}\n${confession}`;
        const reference = core_evidence.normalizeMemoryReference(item?.sourceMemoryIds, item?.sourceMemoryAnchor, evidenceText, memoryBank, 1);
        if (!reference.sourceMemoryIds.length || !reference.sourceMemoryAnchor) return null;
        if (available && !options.catalogOnly) {
            if (endingScene.length < 320) throw new Error(`已解锁结局“${title}”的终章场景不足 320 字。`);
            if (epilogueScenes.length < 3) throw new Error(`已解锁结局“${title}”的后日谈不足 3 段。`);
        } else if (!available && !unlockHint) {
            throw new Error(`未解锁结局“${title}”缺少解锁提示。`);
        }
        return {
            id: core_text.safeId(item?.id, `END${String(index + 1).padStart(2, '0')}`),
            type,
            title,
            subtitle,
            available,
            unlockHint,
            sourceMemoryIds: reference.sourceMemoryIds,
            sourceMemoryAnchor: reference.sourceMemoryAnchor,
            endingScene,
            confession,
            confessionLines,
            creditsLine,
            epilogue,
            ...cg_visual.generatedCgSceneFields(item),
            ...cg_targets.normalizeLocalCgSlots(item),
        };
    }).filter(Boolean);
    if (endings.length < 5) throw new Error(`结局路线不足：得到 ${endings.length} 条，至少需要 5 条。`);
    const byType = new Map(endings.map(item => [item.type, item]));
    for (const required of ['route', 'romance', 'reverse', 'bond', 'open']) {
        if (!byType.has(required)) throw new Error(`结局档案缺少 ${required} 路线。`);
    }
    const route = byType.get('route');
    const open = byType.get('open');
    if (!route.available || !open.available) throw new Error('当前路线结局与开放结局必须可观测。');
    const requestedRecommended = core_text.safeId(data?.recommendedEndingId, '');
    const recommended = endings.find(item => item.id === requestedRecommended && item.available)
        || endings.find(item => item.type === 'romance' && item.available)
        || endings.find(item => item.type === 'reverse' && item.available)
        || route
        || endings.find(item => item.available);
    return {
        kind: core_constants.MODE.ENDING,
        title: core_text.normalizeText(data?.title, 120) || 'ENDING / 结局档案',
        relationshipState,
        relationshipSummary,
        relationshipSourceMemoryIds: relationshipReference.sourceMemoryIds,
        relationshipSourceMemoryAnchor: relationshipReference.sourceMemoryAnchor,
        relationshipHistory: (Array.isArray(data?.relationshipHistory) ? data.relationshipHistory : []).slice(-60).map(item => ({
            relationshipState: core_text.normalizeText(item?.relationshipState, 120),
            relationshipSummary: core_text.normalizeText(item?.relationshipSummary, 2400),
            relationshipSourceMemoryIds: core_text.cleanArray(item?.relationshipSourceMemoryIds, 24, 40),
            relationshipSourceMemoryAnchor: core_text.normalizeText(item?.relationshipSourceMemoryAnchor, 160),
            archivedAt: Math.max(0, Number(item?.archivedAt) || 0),
        })).filter(item => item.relationshipSummary),
        recommendedEndingId: recommended?.id || endings[0].id,
        confessionReplays,
        endings,
        selectedId: endings.some(item => item.id === data?.selectedId) ? data.selectedId : (recommended?.id || endings[0].id),
        selectedConfessionId: confessionReplays.some(item => item.id === data?.selectedConfessionId) ? data.selectedConfessionId : (confessionReplays[0]?.id || ''),
        confessionLineIndex: Math.max(0, Number(data?.confessionLineIndex) || 0),
        view: data?.view === 'confessions' ? 'confessions' : 'routes',
        generationMeta: data?.generationMeta && typeof data.generationMeta === 'object' ? structuredClone(data.generationMeta) : undefined,
    };
}
