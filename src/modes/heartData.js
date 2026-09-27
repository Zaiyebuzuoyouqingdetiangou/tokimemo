import * as cg_visual from '../core/cgVisualRules.js';
import * as cg_targets from '../core/cgTargets.js';
import * as photoshoots from '../core/photoshootContract.js';
import * as core_constants from '../core/constants.js';
import * as core_heartLanguage from '../core/heartLanguage.js';
import * as core_dialogue from '../core/dialogue.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import * as core_participants from '../core/participants.js';
import * as core_text from '../core/text.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as ui_heartReader from '../ui/heartReaderState.js';
import * as ui_overlay from '../ui/overlay.js';
// HEART 数据：剧本/片段/萤火虫/四季规范化、增量合并、局部补丁与会话外壳
// 从 modes/heart.js 原样搬出（重构阶段 2），声明文本一字未改；modes/heart.js 仍转发原有导出。

export function showSavedHeartTaskResult(draftId, context) {
    try { Promise.resolve(ui_overlay.presentGenerationTaskResult?.(draftId, context)).catch(() => {}); }
    catch { /* Saved paid content remains available if the current view cannot open. */ }
}

export function normalizeHeartCore(data, memoryBank) {
    const relationshipState = core_text.normalizeText(data?.relationshipState, 120) || '关系仍在发展';
    const relationshipSummary = core_text.normalizeText(data?.relationshipSummary, 1800);
    if (!relationshipSummary) throw core_text.safeUserError('角色互动时期对话缺少关系摘要。', 'RMT_HEART_INCOMPLETE');
    const relationshipReference = core_evidence.normalizeMemoryReference(data?.relationshipSourceMemoryIds, data?.relationshipSourceMemoryAnchor, `${relationshipState}\n${relationshipSummary}`, memoryBank, 1);
    // HEART dialogue is present/future character interaction, not a historical claim.
    // If the archive cannot prove a relationship stage, keep evidence empty and use the
    // controlled character/persona/world context only for characterization.

    const greetings = {};
    for (const key of core_constants.HEART_GREETING_KEYS) greetings[key] = core_text.cleanArray(data?.greetings?.[key], 6, 600);
    if (!Object.values(greetings).some(lines => lines.length)) {
        throw core_text.safeUserError('这次没有可保存的基础语言；旧台词保留。', 'RMT_HEART_INCOMPLETE');
    }

    return {
        title: core_text.normalizeText(data?.title, 120) || 'HEART VOICE / 角色互动',
        relationshipState,
        relationshipSummary,
        relationshipSourceMemoryIds: relationshipReference.sourceMemoryIds,
        relationshipSourceMemoryAnchor: relationshipReference.sourceMemoryAnchor,
        birthdayMmDd: core_text.normalizeText(data?.birthdayMmDd, 20),
        userBirthdayMmDd: core_text.normalizeText(data?.userBirthdayMmDd, 20),
        specialDays: Array.isArray(data?.specialDays) ? data.specialDays : [],
        greetings,
    };
}

function heartStoryIdentities(memoryBank) {
    const story = core_participants.resolveStoryIdentities(memoryBank);
    return {
        characterName: story.ownerNames[0] || memoryBank?.characterName || '',
        userName: story.userDisplay,
        userAliases: story.userAliases,
        characterAliases: story.ownerNames,
    };
}

export function normalizeHeartCoreIncrement(data, memoryBank, sourceMemoryIds) {
    const relationshipState = core_text.normalizeText(data?.relationshipState, 120) || '关系继续发展';
    const relationshipSummary = core_text.normalizeText(data?.relationshipSummary, 1800);
    if (!relationshipSummary) throw core_text.safeUserError('角色互动增量缺少关系摘要。', 'RMT_HEART_INCOMPLETE');
    const reference = core_evidence.normalizeMemoryReference(
        data?.relationshipSourceMemoryIds,
        data?.relationshipSourceMemoryAnchor,
        `${relationshipState}\n${relationshipSummary}`,
        memoryBank,
        1,
    );
    const hasIncrementalRelationshipEvidence = !!reference.sourceMemoryIds.length
        && !!reference.sourceMemoryAnchor
        && core_incremental.usesIncrementalMemoryId(reference.sourceMemoryIds, sourceMemoryIds);
    // No proven relationship change is a valid HEART increment: keep evidence empty so the
    // merge preserves the previous relationship stage while still accepting new persona-led lines.
    const relationshipSourceMemoryIds = hasIncrementalRelationshipEvidence ? reference.sourceMemoryIds : [];
    const relationshipSourceMemoryAnchor = hasIncrementalRelationshipEvidence ? reference.sourceMemoryAnchor : '';
    const greetings = {};
    let total = 0;
    for (const key of core_constants.HEART_GREETING_KEYS) {
        greetings[key] = core_text.cleanArray(data?.greetings?.[key], 2, 600);
        total += greetings[key].length;
    }
    if (!total) throw core_text.safeUserError('角色互动增量没有生成任何新台词。', 'RMT_HEART_INCOMPLETE');
    return {
        relationshipState,
        relationshipSummary,
        relationshipSourceMemoryIds,
        relationshipSourceMemoryAnchor,
        birthdayMmDd: core_text.normalizeText(data?.birthdayMmDd, 20),
        userBirthdayMmDd: core_text.normalizeText(data?.userBirthdayMmDd, 20),
        specialDays: Array.isArray(data?.specialDays) ? data.specialDays : [],
        greetings,
    };
}

export function mergeHeartCoreIncremental(existing, core, preserveRelationship = false) {
    if (preserveRelationship) core = { ...core,
        relationshipState: existing.relationshipState, relationshipSummary: existing.relationshipSummary,
        relationshipSourceMemoryIds: existing.relationshipSourceMemoryIds, relationshipSourceMemoryAnchor: existing.relationshipSourceMemoryAnchor };
    const merged = structuredClone(existing);
    const previousState = {
        relationshipState: core_text.normalizeText(existing?.relationshipState, 120),
        relationshipSummary: core_text.normalizeText(existing?.relationshipSummary, 1800),
        relationshipSourceMemoryIds: core_text.cleanArray(existing?.relationshipSourceMemoryIds, 24, 40),
        relationshipSourceMemoryAnchor: core_text.normalizeText(existing?.relationshipSourceMemoryAnchor, 160),
        archivedAt: Date.now(),
    };
    const history = Array.isArray(existing?.relationshipHistory) ? structuredClone(existing.relationshipHistory) : [];
    const historyKey = `${core_incremental.normalizedContentKey(previousState.relationshipState, 120)}|${core_incremental.normalizedContentKey(previousState.relationshipSummary, 300)}`;
    if (previousState.relationshipSummary && !history.some(item => `${core_incremental.normalizedContentKey(item?.relationshipState, 120)}|${core_incremental.normalizedContentKey(item?.relationshipSummary, 300)}` === historyKey)) {
        history.push(previousState);
    }
    merged.relationshipHistory = history.slice(-60);
    merged.relationshipState = core.relationshipState;
    merged.relationshipSummary = core.relationshipSummary;
    merged.relationshipSourceMemoryIds = core.relationshipSourceMemoryIds;
    merged.relationshipSourceMemoryAnchor = core.relationshipSourceMemoryAnchor;
    merged.birthdayMmDd = core.birthdayMmDd || existing.birthdayMmDd || '';
    merged.userBirthdayMmDd = core.userBirthdayMmDd || existing.userBirthdayMmDd || '';
    let added = 0;
    merged.greetings = { ...(existing.greetings || {}) };
    for (const key of core_constants.HEART_GREETING_KEYS) {
        const lines = [...(existing.greetings?.[key] || [])];
        const seen = new Set(lines.map(line => core_incremental.normalizedContentKey(line, 600)));
        for (const line of core.greetings?.[key] || []) {
            const lineKey = core_incremental.normalizedContentKey(line, 600);
            if (!lineKey || seen.has(lineKey) || lines.length >= 40) continue;
            seen.add(lineKey);
            lines.push(line);
            added += 1;
        }
        merged.greetings[key] = lines;
    }
    const specialDays = [...(existing.specialDays || [])];
    const seenDays = new Set(specialDays.map(item => `${item.mmdd}|${core_incremental.normalizedContentKey(item.label, 80)}`));
    for (const item of core.specialDays || []) {
        const mmdd = core_text.normalizeText(item?.mmdd, 20);
        const label = core_text.normalizeText(item?.label, 80);
        const line = core_text.normalizeText(item?.line, 600);
        const key = `${mmdd}|${core_incremental.normalizedContentKey(label, 80)}`;
        if (!/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(mmdd) || !label || !line || seenDays.has(key)) continue;
        seenDays.add(key);
        specialDays.push({ mmdd, label, line });
        added += 1;
    }
    merged.specialDays = specialDays.slice(0, 60);
    return { session: merged, added };
}

export function normalizeFireflyScript(rawScript) {
    const allowed = new Set(['char', 'user', 'user_thought']);
    const script = (Array.isArray(rawScript) ? rawScript : []).slice(0, 10).map(node => {
        const speaker = core_text.normalizeText(node?.speaker, 40).toLowerCase();
        const text = core_text.normalizeText(node?.text, 700);
        if (!allowed.has(speaker) || !text) return null;
        return { speaker, text };
    }).filter(Boolean);
    if (!script.length) return [];
    const thoughts = script.filter(node => node.speaker === 'user_thought');
    if (thoughts.length > 1) return [];
    if (thoughts.length === 1 && script[script.length - 1]?.speaker !== 'user_thought') return [];
    return script;
}

export function normalizeFireflyVoice(item, index = 0) {
    const color = core_text.normalizeText(item?.color, 20).toLowerCase();
    if (!core_constants.HEART_FIREFLY_COLORS.has(color)) return null;
    const script = normalizeFireflyScript(item?.script);
    const legacyLine = core_text.normalizeText(item?.line, 520);
    const thoughts = core_text.cleanArray(item?.thoughts ?? item?.lines, 4, 360).filter(text => text.length >= 8);
    if (!script.length && !thoughts.length && legacyLine.length >= 8) thoughts.push(legacyLine);
    if (!script.length && !thoughts.length) return null;
    const seedText = script[0]?.text || thoughts[0] || legacyLine;
    const title = core_text.normalizeText(item?.title, 80) || core_text.normalizeText(seedText, 18) || `话题 ${index + 1}`;
    const line = script.length ? script.map(node => node.text).join(' ') : thoughts.join(' ');
    return {
        id: core_text.safeId(item?.id, `FIREFLY${String(index + 1).padStart(2, '0')}`),
        color,
        title,
        script,
        thoughts,
        line,
        sourceArchiveMemoryIds: core_text.cleanArray(item?.sourceArchiveMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40),
        incrementBatchId: core_text.normalizeText(item?.incrementBatchId, 80),
        generatedAt: Math.max(0, Number(item?.generatedAt) || Date.now()),
    };
}

export function fireflyVoiceKey(item) {
    const text = Array.isArray(item?.script) && item.script.length
        ? item.script.map(node => node?.text).join(' ')
        : (Array.isArray(item?.thoughts) && item.thoughts.length ? item.thoughts.join(' ') : item?.line);
    return core_incremental.normalizedContentKey(`${item?.title || ''} ${text || ''}`, 1600);
}

export function normalizeFireflyVoicesPart(data, { minTotal = 1, requireDistribution = false, requireRich = true } = {}) {
    const out = (Array.isArray(data?.fireflyVoices) ? data.fireflyVoices : []).slice(0, 6).map(normalizeFireflyVoice).filter(Boolean);
    if (out.length < minTotal) throw core_text.safeUserError(`萤火虫会话不足：${out.length}/${minTotal}。`, 'RMT_HEART_INCOMPLETE');
    if (requireRich) {
        const invalid = out.find(item => {
            const script = Array.isArray(item?.script) ? item.script : [];
            const chars = script.filter(node => node.speaker === 'char').length;
            const users = script.filter(node => node.speaker === 'user').length;
            const totalChars = script.reduce((sum, node) => sum + String(node?.text || '').length, 0);
            return script.length < 5 || chars < 3 || users < 1 || totalChars < 120;
        });
        if (invalid) throw core_text.safeUserError(`萤火虫「${invalid.title || invalid.id}」不是完整的追加约会会话；至少需要 5 个节点、3 条角色台词和 1 条用户即时回应。`, 'RMT_HEART_INCOMPLETE');
    }
    if (requireDistribution) {
        const represented = new Set(out.map(item => item.color));
        if (represented.size < 3) throw core_text.safeUserError(`萤火虫颜色分布过窄：${represented.size}/3。首次至少覆盖 3 种颜色。`, 'RMT_HEART_INCOMPLETE');
        if (![...represented].some(color => color === 'yellow' || color === 'white')) {
            throw core_text.safeUserError('首次萤火虫不能全部围绕恋爱/渴望；至少需要 1 个 yellow「朋友」或 white「个性话题」。', 'RMT_HEART_INCOMPLETE');
        }
    }
    return out;
}

export function legacyFireflyVoices(session) {
    return (Array.isArray(session?.fireflyVoices) ? session.fireflyVoices : []).filter(item => {
        const script = Array.isArray(item?.script) ? item.script : [];
        return script.length < 5;
    });
}

export function normalizeFireflyUpgradePart(data, expectedItems) {
    const expected = (Array.isArray(expectedItems) ? expectedItems : []).slice(0, 6);
    if (!expected.length) return [];
    const out = normalizeFireflyVoicesPart(data, { minTotal: expected.length, requireDistribution: false, requireRich: true });
    const byId = new Map(out.map(item => [item.id, item]));
    return expected.map(item => {
        const id = core_text.normalizeText(item?.id, 80);
        const color = core_text.normalizeText(item?.color, 20).toLowerCase();
        const candidate = byId.get(id);
        if (!candidate) throw core_text.safeUserError(`旧版萤火虫升级缺少 ${id}。`, 'RMT_HEART_INCOMPLETE');
        if (candidate.color !== color) throw core_text.safeUserError(`旧版萤火虫 ${id} 升级时改变了颜色。`, 'RMT_HEART_INCOMPLETE');
        return candidate;
    });
}

export function normalizeVoiceDramaPart(data, expectedKinds, memoryBank = {}) {
    const raw = Array.isArray(data?.voiceDramas) ? data.voiceDramas : [];
    const out = [];
    for (const expected of expectedKinds) {
        const item = raw.find(candidate => core_text.normalizeText(candidate?.kind, 40).toLowerCase() === expected);
        if (!item) throw core_text.safeUserError(`Voice Drama 缺少 ${expected}。`, 'RMT_HEART_INCOMPLETE');
        const post = expected === 'postending';
        const script = normalizeHeartScript(item?.script, {
            ...heartStoryIdentities(memoryBank),
            minLines: post ? 8 : 5,
            maxLines: post ? 24 : 16,
            minChars: post ? 420 : 280,
        });
        if (!script.length) throw core_text.safeUserError(`Voice Drama ${expected} 长度不足。`, 'RMT_HEART_INCOMPLETE');
        out.push({
            id: core_text.safeId(item?.id, `VOICE_${expected.toUpperCase()}`),
            kind: expected,
            title: core_text.normalizeText(item?.title, 120) || 'Voice Drama',
            subtitle: core_text.normalizeText(item?.subtitle, 240),
            setting: core_text.normalizeText(item?.setting, 1200),
            visualTone: core_constants.HEART_DRAMA_VISUAL_TONES.has(core_text.normalizeText(item?.visualTone, 20).toLowerCase()) ? core_text.normalizeText(item?.visualTone, 20).toLowerCase() : 'soft',
            script,
            ...cg_visual.generatedCgSceneFields(item),
            ...cg_targets.normalizeLocalCgSlots(item),
        });
    }
    return out;
}

export function normalizeScenarioDramaPart(data, expectedSeason = '', memoryBank = {}) {
    const raw = Array.isArray(data?.scenarioDramas) ? data.scenarioDramas : [];
    const seasons = expectedSeason ? [expectedSeason] : ['spring', 'summer', 'autumn', 'winter'];
    const out = [];
    for (const expected of seasons) {
        const item = raw.find(candidate => core_text.normalizeText(candidate?.season, 40).toLowerCase() === expected);
        if (!item) throw core_text.safeUserError(`Scenario Drama 缺少 ${expected}。`, 'RMT_HEART_INCOMPLETE');
        const script = normalizeHeartScript(item?.script, { minLines: 6, maxLines: 20, minChars: 360, ...heartStoryIdentities(memoryBank) });
        if (!script.length) throw core_text.safeUserError(`Scenario Drama ${expected} 长度不足。`, 'RMT_HEART_INCOMPLETE');
        out.push({
            id: core_text.safeId(item?.id, `SCENE_${expected.toUpperCase()}`),
            season: expected,
            title: core_text.normalizeText(item?.title, 120) || `${expected} Scenario Drama`,
            subtitle: core_text.normalizeText(item?.subtitle, 240),
            setting: core_text.normalizeText(item?.setting, 1200),
            visualTone: core_constants.HEART_DRAMA_VISUAL_TONES.has(core_text.normalizeText(item?.visualTone, 20).toLowerCase()) ? core_text.normalizeText(item?.visualTone, 20).toLowerCase() : 'soft',
            script,
            ...cg_visual.generatedCgSceneFields(item),
            ...cg_targets.normalizeLocalCgSlots(item),
        });
    }
    return out;
}

export function normalizeHeartStripsPart(data) {
    const dailyStrips = (Array.isArray(data?.dailyStrips) ? data.dailyStrips : []).slice(0, 3).map((item, index) => {
        const panelCountRaw = Number(item?.panelCount) || (Array.isArray(item?.panels) ? item.panels.length : 2);
        const panelCount = core_constants.HEART_STRIP_PANEL_COUNTS.has(panelCountRaw) ? panelCountRaw : 2;
        const panels = (Array.isArray(item?.panels) ? item.panels : []).slice(0, panelCount).map(panel => ({
            caption: core_text.normalizeText(panel?.caption, 300),
            action: core_text.normalizeText(panel?.action, 700),
            charLine: core_text.normalizeText(panel?.charLine, 500),
            userLine: core_text.normalizeText(panel?.userLine, 500),
        })).filter(panel => panel.action || panel.caption || panel.charLine || panel.userLine);
        const visualSeed = core_text.cleanArray(item?.visualSeed, 10, 100);
        const imagePrompt = generation_imageGeneration.sanitizeCgVisualText(item?.imagePrompt, core_constants.MAX_CG_IMAGE_PROMPT_CHARS);
        if (panels.length !== panelCount || !imagePrompt) return null;
        return {
            id: core_text.safeId(item?.id, `STRIP${String(index + 1).padStart(2, '0')}`),
            title: core_text.normalizeText(item?.title, 100) || `日常一格 ${index + 1}`,
            subtitle: core_text.normalizeText(item?.subtitle, 240),
            panelCount,
            panels,
            visualSeed,
            imagePrompt,
            ...cg_visual.generatedCgDraftFields(item),
            cgImage: generation_imageGeneration.normalizeCgImageRecord(item?.cgImage),
        };
    }).filter(Boolean);
    if (!dailyStrips.length) throw core_text.safeUserError('这次没有返回完整的日常一格；旧图与旧内容保留，可重试未完成部分。', 'RMT_SEGMENT_VALIDATION');
    return dailyStrips;
}

export function normalizeHeartCollectionBatch(data, part) {
    const field = part === 'fireflies' ? 'fireflyVoices' : part === 'strips' ? 'dailyStrips' : '';
    const max = part === 'fireflies' ? 6 : 3;
    if (!field || !Array.isArray(data?.[field]) || data[field].length > max) {
        throw core_text.safeUserError('本次条目列表结构不完整；旧内容保留。', 'RMT_HEART_INCOMPLETE');
    }
    const items = [], seen = new Set();
    let rejectedCount = 0;
    for (const raw of data[field]) {
        try {
            const item = part === 'fireflies'
                ? normalizeFireflyVoicesPart({ fireflyVoices: [raw] }, { minTotal: 1, requireDistribution: false, requireRich: true })[0]
                : normalizeHeartStripsPart({ dailyStrips: [raw] })[0];
            const key = part === 'fireflies' ? fireflyVoiceKey(item) : heartStripKey(item);
            if (!seen.has(key)) { seen.add(key); items.push(item); }
        } catch (error) {
            if (!['RMT_HEART_INCOMPLETE', 'RMT_SEGMENT_VALIDATION'].includes(error?.code)) throw error;
            rejectedCount++;
        }
    }
    if (!items.length) throw core_text.safeUserError('本次没有完整可保存的条目；旧内容保留。', 'RMT_HEART_INCOMPLETE');
    return { items, rejectedCount };
}

export function makeHeartShell(memoryBank) {
    return core_heartLanguage.makeHeartShell(memoryBank);
}

// Only closed values enter this reading projection. Acceptance of each drama,
// strip and firefly still uses the normal production item validator.
export function projectHeartProgress({ segments = [], memoryBank, previousSession = null, contentInputs = {}, pageId = 'heart', operation = {}, createdAt = 0 }) {
    let session = structuredClone(contentInputs.baseSession || previousSession || makeHeartShell(memoryBank));
    let added = false;
    const stamp = item => ({ ...item, ...(operation.batchId ? { incrementBatchId: operation.batchId } : {}), generatedAt: createdAt });
    for (const segment of segments) {
        const raw = segment.value || {};
        if (pageId === 'heart' || pageId === 'language') {
            const greetings = {};
            for (const key of core_constants.HEART_GREETING_KEYS) {
                const rows = segment.items(`/greetings/${key}`);
                const lines = core_text.cleanArray(rows, 6, 600);
                if (lines.length) greetings[key] = lines;
            }
            if (Object.keys(greetings).length) {
                try {
                    const core = normalizeHeartCore({ ...raw, greetings }, memoryBank);
                    session = applyHeartPartialPatch(session, { type: operation.dialogueMode === 'increment' ? 'dialogues-increment' : 'dialogues', core });
                } catch {
                    // A missing relationship summary does not hide already closed
                    // lines, and is never invented to make the whole part pass.
                    session.greetings = { ...(session.greetings || {}) };
                    for (const [key, lines] of Object.entries(greetings)) session.greetings[key] = [...new Set([...(session.greetings[key] || []), ...lines])];
                }
                added = true;
            }
        }
        for (const item of segment.items('/voiceDramas')) {
            if (!['spring', 'summer', 'autumn', 'winter', 'postending'].includes(item?.kind)) continue;
            if (!['heart', 'seasons', item.kind].includes(pageId)) continue;
            try {
                const voice = stamp(normalizeVoiceDramaPart({ voiceDramas: [item] }, [item.kind], memoryBank)[0]);
                session = applyHeartPartialPatch(session, { type: 'season', season: item.kind, voice }); added = true;
            } catch { /* The closed sibling still must satisfy its existing item contract. */ }
        }
        for (const item of segment.items('/scenarioDramas')) {
            if (!['spring', 'summer', 'autumn', 'winter'].includes(item?.season) || !['heart', 'seasons', item.season].includes(pageId)) continue;
            try {
                const scenario = stamp(normalizeScenarioDramaPart({ scenarioDramas: [item] }, item.season, memoryBank)[0]);
                session = applyHeartPartialPatch(session, { type: 'season', season: item.season, scenario }); added = true;
            } catch { /* Keep the unaccepted value only in the recoverable raw journal. */ }
        }
        for (const [field, part] of [['dailyStrips', 'strips'], ['fireflyVoices', 'fireflies']]) {
            if (!['heart', part].includes(pageId)) continue;
            const rows = segment.items(`/${field}`);
            if (!rows.length) continue;
            try {
                const batch = normalizeHeartCollectionBatch({ [field]: rows }, part);
                session = applyHeartPartialPatch(session, { type: part, [field]: batch.items.map(stamp), rejectedCount: batch.rejectedCount }); added = true;
            } catch { /* No completed valid item yet. */ }
        }
    }
    if (!added) return null;
    session.kind = core_constants.MODE.HEART; session.chatId = memoryBank.chatId; session.archiveRevision = memoryBank.archiveRevision;
    return session;
}

export function makeHeartSession(core, existing = null) {
    return {
        kind: core_constants.MODE.HEART,
        title: core.title || existing?.title || 'HEART VOICE / 角色互动',
        relationshipState: core.relationshipState,
        relationshipSummary: core.relationshipSummary,
        relationshipSourceMemoryIds: core.relationshipSourceMemoryIds,
        relationshipSourceMemoryAnchor: core.relationshipSourceMemoryAnchor,
        birthdayMmDd: core.birthdayMmDd || '',
        userBirthdayMmDd: core.userBirthdayMmDd || '',
        specialDays: Array.isArray(core.specialDays) ? core.specialDays : [],
        relationshipHistory: Array.isArray(existing?.relationshipHistory) ? existing.relationshipHistory : [],
        greetings: core.greetings || {},
        languageVisuals: cg_targets.normalizeLanguageCgVisuals(existing?.languageVisuals),
        languagePortrait: cg_targets.normalizeLanguagePortrait(existing?.languagePortrait),
        fireflyVisual: cg_targets.normalizeLocalCgSlots({ visual: existing?.fireflyVisual }).visual || null,
        photoshoots: normalizeHeartPhotoshoots(existing?.photoshoots),
        collectionIssues: core_heartLanguage.heartCollectionIssues(existing),
        voiceDramas: Array.isArray(existing?.voiceDramas) ? existing.voiceDramas : [],
        scenarioDramas: Array.isArray(existing?.scenarioDramas) ? existing.scenarioDramas : [],
        dailyStrips: Array.isArray(existing?.dailyStrips) ? existing.dailyStrips : [],
        fireflyVoices: Array.isArray(existing?.fireflyVoices) ? existing.fireflyVoices : [],
        selectedFireflyId: existing?.selectedFireflyId || '',
        selectedVoiceId: existing?.selectedVoiceId || '',
        selectedScenarioId: existing?.selectedScenarioId || '',
        selectedDramaKey: core_text.normalizeText(existing?.selectedDramaKey, 180),
        selectedStripId: existing?.selectedStripId || '',
        selectedSeason: existing?.selectedSeason || 'postending',
        view: ['seasons', 'strips', 'fireflies'].includes(existing?.view) ? existing.view : 'seasons',
        generationParts: {
            dialogues: true,
            seasons: !!(existing?.voiceDramas?.length || existing?.scenarioDramas?.length),
            strips: !!existing?.dailyStrips?.length,
            fireflies: !!existing?.fireflyVoices?.length,
        },
        generationMeta: existing?.generationMeta && typeof existing.generationMeta === 'object' ? structuredClone(existing.generationMeta) : undefined,
    };
}

export function heartDramaItemKey(item, kindKey) {
    const batch = core_text.normalizeText(item?.incrementBatchId, 80);
    return batch
        ? `${kindKey}|batch|${batch}`
        : `${kindKey}|${core_incremental.normalizedContentKey(item?.title, 120)}|${core_incremental.normalizedContentKey(item?.setting, 300)}`;
}

export function appendHeartDramaItem(list, item, kindKey, idPrefix) {
    if (!item) return { list: Array.isArray(list) ? list : [], item: null, added: 0 };
    const out = Array.isArray(list) ? list : [];
    const key = heartDramaItemKey(item, kindKey);
    const existing = out.find(candidate => heartDramaItemKey(candidate, kindKey) === key);
    if (existing) return { list: out, item: existing, added: 0 };
    if (out.length >= core_constants.MAX_DERIVED_CONTENT_ITEMS) return { list: out, item: null, added: 0 };
    const usedIds = new Set(out.map(candidate => candidate.id));
    const next = { ...structuredClone(item), id: core_incremental.uniqueGeneratedId(item.id, usedIds, idPrefix) };
    out.push(next);
    return { list: out, item: next, added: 1 };
}

export function heartStripKey(item) {
    const batch = core_text.normalizeText(item?.incrementBatchId, 80);
    return `${batch ? `batch|${batch}|` : ''}${core_incremental.normalizedContentKey(item?.title, 120)}|${core_incremental.normalizedContentKey(item?.subtitle, 240)}`;
}

export function applyHeartPatchCoverage(updated, base, patch, added) {
    if (!patch?.coveragePart) return updated;
    const ids = core_text.cleanArray(patch.archiveMemoryIds, core_constants.MAX_STORED_MEMORY_ITEMS, 40);
    const pseudoBank = {
        archiveRevision: core_text.normalizeText(patch.archiveRevision, 240),
        memories: ids.map(id => ({ id })),
    };
    return core_incremental.stampIncrementalCoverage(
        updated,
        base,
        pseudoBank,
        core_text.normalizeText(patch.coveragePart, 80),
        core_text.cleanArray(patch.coverageConsumedMemoryIds || patch.sourceMemoryIds, core_constants.MAX_STORED_MEMORY_ITEMS, 40),
        added,
    );
}

export function preserveHeartSelection(target, source) {
    for (const key of ['view', 'selectedSeason', 'selectedVoiceId', 'selectedScenarioId',
        'selectedDramaKey', 'selectedStripId', 'selectedFireflyId']) {
        if (Object.hasOwn(source || {}, key)) target[key] = ui_heartReader.heartSelectionScalars(source)[key] || '';
        else delete target[key];
    }
    return target;
}

export function normalizeHeartContentPatch(base, patches, memoryBank) {
    let content = base;
    for (const patch of patches) content = applyHeartPartialPatch(content, patch);
    return preserveHeartSelection(normalizeHeart(content, memoryBank), base);
}

export function applyHeartPartialPatch(base, patch) {
    let updated = structuredClone(base || {});
    if (!patch || typeof patch !== 'object') return updated;
    let added = 0;
    if (['fireflies', 'strips'].includes(patch.type)) {
        updated.collectionIssues = { ...core_heartLanguage.heartCollectionIssues(updated),
            [patch.type]: Math.max(0, Math.min(6, Math.floor(Number(patch.rejectedCount) || 0))) };
    }
    if (patch.type === 'dialogues' && patch.core) {
        updated = makeHeartSession(patch.core, updated);
    } else if (patch.type === 'dialogues-increment' && patch.core) {
        const merged = mergeHeartCoreIncremental(updated, patch.core, patch.revisit === true);
        updated = merged.session;
        added += merged.added;
    } else if (patch.type === 'strips' && Array.isArray(patch.dailyStrips)) {
        const out = Array.isArray(updated.dailyStrips) ? updated.dailyStrips : [];
        const seen = new Set(out.map(heartStripKey));
        const usedIds = new Set(out.map(item => item.id));
        let latest = null;
        for (const strip of patch.dailyStrips) {
            const key = heartStripKey(strip);
            if (!key || seen.has(key) || out.length >= core_constants.MAX_DERIVED_CONTENT_ITEMS) continue;
            seen.add(key);
            latest = { ...structuredClone(strip), id: core_incremental.uniqueGeneratedId(strip.id, usedIds, 'STRIP') };
            out.push(latest);
            added += 1;
        }
        updated.dailyStrips = out;
        updated.generationParts = { ...(updated.generationParts || {}), strips: true };
    } else if (patch.type === 'fireflies' && Array.isArray(patch.fireflyVoices)) {
        const out = Array.isArray(updated.fireflyVoices) ? updated.fireflyVoices : [];
        const seen = new Set(out.map(fireflyVoiceKey).filter(Boolean));
        const usedIds = new Set(out.map(item => item.id));
        let latest = null;
        for (const voice of patch.fireflyVoices) {
            const key = fireflyVoiceKey(voice);
            if (!key || seen.has(key) || out.length >= core_constants.HEART_FIREFLY_MAX_ITEMS) continue;
            seen.add(key);
            latest = { ...structuredClone(voice), id: core_incremental.uniqueGeneratedId(voice.id, usedIds, 'FIREFLY') };
            out.push(latest);
            added += 1;
        }
        updated.fireflyVoices = out;
        updated.generationParts = { ...(updated.generationParts || {}), fireflies: out.length > 0 };
    } else if (patch.type === 'firefly-upgrade' && Array.isArray(patch.fireflyVoices)) {
        const replacements = new Map(patch.fireflyVoices.map(item => [core_text.normalizeText(item?.id, 80), item]));
        const out = (Array.isArray(updated.fireflyVoices) ? updated.fireflyVoices : []).map(item => {
            const next = replacements.get(core_text.normalizeText(item?.id, 80));
            if (!next || next.color !== item.color) return item;
            added += 1;
            return {
                ...structuredClone(item),
                title: next.title,
                script: structuredClone(next.script),
                thoughts: [],
                line: next.line,
                upgradedAt: Date.now(),
            };
        });
        updated.fireflyVoices = out;
        updated.generationParts = { ...(updated.generationParts || {}), fireflies: out.length > 0 };
    } else if (patch.type === 'season') {
        const season = core_text.normalizeText(patch.season, 40).toLowerCase();
        if (patch.voice?.kind === season) {
            const result = appendHeartDramaItem(updated.voiceDramas, patch.voice, `voice:${season}`, 'VOICE');
            updated.voiceDramas = result.list;
            added += result.added;
        }
        if (season !== 'postending' && patch.scenario?.season === season) {
            const result = appendHeartDramaItem(updated.scenarioDramas, patch.scenario, `scenario:${season}`, 'SCENE');
            updated.scenarioDramas = result.list;
            added += result.added;
        }
        updated.generationParts = { ...(updated.generationParts || {}), seasons: true };
    }
    // Generating content must not navigate any reader, including deferred replay.
    preserveHeartSelection(updated, base);
    return applyHeartPatchCoverage(updated, base, patch, added);
}

export function mergeDeferredHeartPatches(existing, incoming) {
    return { ...(existing || {}), ...(incoming || {}) };
}

export function normalizeHeartScript(rawLines, { minLines = 8, minChars = 500, characterName = '', userName = '', userAliases = [], characterAliases = [] } = {}) {
    // The shared post-split budget also applies on re-normalization; never slice an expanded script.
    const lines = core_dialogue.normalizeDialogueRows(rawLines, { strict: true, characterName, userName, userAliases, characterAliases });
    if (lines.length < minLines || lines.reduce((sum, line) => sum + line.text.length, 0) < minChars) return [];
    return lines;
}

export function normalizeHeartPhotoshoots(rows) {
    return (Array.isArray(rows) ? rows : []).map(raw => {
        const plan = photoshoots.normalizePhotoshootPlan(raw);
        return plan ? { ...plan, ...cg_targets.normalizeLocalCgSlots(raw) } : null;
    }).filter(Boolean);
}

export function normalizeHeart(data, memoryBank) {
    const relationshipState = core_text.normalizeText(data?.relationshipState, 120) || '关系仍在发展';
    const relationshipSummary = core_text.normalizeText(data?.relationshipSummary, 1800);
    const relationshipReference = core_evidence.normalizeMemoryReference(
        data?.relationshipSourceMemoryIds,
        data?.relationshipSourceMemoryAnchor,
        `${relationshipState}\n${relationshipSummary}`,
        memoryBank,
        1,
    );
    // HEART may legitimately have no archive-backed relationship evidence. In that case
    // the source fields stay empty; this mode must not invent an Mxxx/anchor merely to pass validation.

    const greetings = {};
    for (const key of core_constants.HEART_GREETING_KEYS) {
        greetings[key] = core_text.cleanArray(data?.greetings?.[key], 40, 600);
    }
    const birthdayRaw = core_text.normalizeText(data?.birthdayMmDd, 20);
    const birthdayMmDd = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(birthdayRaw) ? birthdayRaw : '';
    const userBirthdayRaw = core_text.normalizeText(data?.userBirthdayMmDd, 20);
    const userBirthdayMmDd = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(userBirthdayRaw) ? userBirthdayRaw : '';
    const specialDays = (Array.isArray(data?.specialDays) ? data.specialDays : []).slice(0, 60).map((item, index) => {
        const mmdd = core_text.normalizeText(item?.mmdd, 20);
        const label = core_text.normalizeText(item?.label, 80) || `特别日 ${index + 1}`;
        const line = core_text.normalizeText(item?.line, 600);
        if (!/^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/.test(mmdd) || !line) return null;
        return { mmdd, label, line };
    }).filter(Boolean);

    const voiceDramas = (Array.isArray(data?.voiceDramas) ? data.voiceDramas : []).slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS).map((item, index) => {
        const kindRaw = core_text.normalizeText(item?.kind, 40).toLowerCase();
        const kind = core_constants.HEART_VOICE_KINDS.has(kindRaw) ? kindRaw : '';
        if (!kind) return null;
        const script = normalizeHeartScript(item?.script, {
            ...heartStoryIdentities(memoryBank),
            minLines: kind === 'postending' ? 8 : 5,
            maxLines: kind === 'postending' ? 24 : 16,
            minChars: kind === 'postending' ? 420 : 280,
        });
        if (!script.length) return null;
        return {
            id: core_text.safeId(item?.id, `VOICE${String(index + 1).padStart(2, '0')}`),
            kind,
            title: core_text.normalizeText(item?.title, 120) || 'Voice Drama',
            subtitle: core_text.normalizeText(item?.subtitle, 240),
            setting: core_text.normalizeText(item?.setting, 1200),
            visualTone: core_constants.HEART_DRAMA_VISUAL_TONES.has(core_text.normalizeText(item?.visualTone, 20).toLowerCase()) ? core_text.normalizeText(item?.visualTone, 20).toLowerCase() : 'soft',
            script,
            ...cg_visual.generatedCgSceneFields(item),
            ...cg_targets.normalizeLocalCgSlots(item),
            sourceArchiveMemoryIds: core_text.cleanArray(item?.sourceArchiveMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40),
            incrementBatchId: core_text.normalizeText(item?.incrementBatchId, 80),
            generatedAt: Math.max(0, Number(item?.generatedAt) || 0),
        };
    }).filter(Boolean);
    const scenarioDramas = (Array.isArray(data?.scenarioDramas) ? data.scenarioDramas : []).slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS).map((item, index) => {
        const seasonRaw = core_text.normalizeText(item?.season, 40).toLowerCase();
        const season = core_constants.HEART_SCENARIO_SEASONS.has(seasonRaw) ? seasonRaw : '';
        if (!season) return null;
        const script = normalizeHeartScript(item?.script, { minLines: 6, maxLines: 20, minChars: 360, ...heartStoryIdentities(memoryBank) });
        if (!script.length) return null;
        return {
            id: core_text.safeId(item?.id, `SCENE${String(index + 1).padStart(2, '0')}`),
            season,
            title: core_text.normalizeText(item?.title, 120) || `${season} Scenario Drama`,
            subtitle: core_text.normalizeText(item?.subtitle, 240),
            setting: core_text.normalizeText(item?.setting, 1200),
            visualTone: core_constants.HEART_DRAMA_VISUAL_TONES.has(core_text.normalizeText(item?.visualTone, 20).toLowerCase()) ? core_text.normalizeText(item?.visualTone, 20).toLowerCase() : 'soft',
            script,
            ...cg_visual.generatedCgSceneFields(item),
            ...cg_targets.normalizeLocalCgSlots(item),
            sourceArchiveMemoryIds: core_text.cleanArray(item?.sourceArchiveMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40),
            incrementBatchId: core_text.normalizeText(item?.incrementBatchId, 80),
            generatedAt: Math.max(0, Number(item?.generatedAt) || 0),
        };
    }).filter(Boolean);
    const dailyStrips = (Array.isArray(data?.dailyStrips) ? data.dailyStrips : []).slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS).map((item, index) => {
        const panelCountRaw = Number(item?.panelCount) || (Array.isArray(item?.panels) ? item.panels.length : 2);
        const panelCount = core_constants.HEART_STRIP_PANEL_COUNTS.has(panelCountRaw) ? panelCountRaw : 2;
        const panels = (Array.isArray(item?.panels) ? item.panels : []).slice(0, panelCount).map((panel, panelIndex) => ({
            caption: core_text.normalizeText(panel?.caption, 300),
            action: core_text.normalizeText(panel?.action, 700),
            charLine: core_text.normalizeText(panel?.charLine, 500),
            userLine: core_text.normalizeText(panel?.userLine, 500),
        })).filter(panel => panel.action || panel.caption || panel.charLine || panel.userLine);
        if (panels.length !== panelCount) return null;
        const visualSeed = core_text.cleanArray(item?.visualSeed, 10, 100);
        const imagePrompt = generation_imageGeneration.sanitizeCgVisualText(item?.imagePrompt, core_constants.MAX_CG_IMAGE_PROMPT_CHARS);
        if (!imagePrompt) return null;
        return {
            id: core_text.safeId(item?.id, `STRIP${String(index + 1).padStart(2, '0')}`),
            title: core_text.normalizeText(item?.title, 100) || `日常一格 ${index + 1}`,
            subtitle: core_text.normalizeText(item?.subtitle, 240),
            panelCount,
            panels,
            visualSeed,
            imagePrompt,
            ...cg_visual.generatedCgDraftFields(item),
            cgImage: generation_imageGeneration.normalizeCgImageRecord(item?.cgImage),
            sourceArchiveMemoryIds: core_text.cleanArray(item?.sourceArchiveMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40),
            incrementBatchId: core_text.normalizeText(item?.incrementBatchId, 80),
            generatedAt: Math.max(0, Number(item?.generatedAt) || 0),
        };
    }).filter(Boolean);
    const fireflyVoices = (Array.isArray(data?.fireflyVoices) ? data.fireflyVoices : []).slice(0, core_constants.HEART_FIREFLY_MAX_ITEMS).map(normalizeFireflyVoice).filter(Boolean);

    return {
        kind: core_constants.MODE.HEART,
        title: core_text.normalizeText(data?.title, 120) || 'HEART VOICE / 角色互动',
        relationshipState,
        relationshipSummary,
        relationshipSourceMemoryIds: relationshipReference.sourceMemoryIds,
        relationshipSourceMemoryAnchor: relationshipReference.sourceMemoryAnchor,
        birthdayMmDd,
        userBirthdayMmDd,
        specialDays,
        relationshipHistory: (Array.isArray(data?.relationshipHistory) ? data.relationshipHistory : []).slice(-60).map(item => ({
            relationshipState: core_text.normalizeText(item?.relationshipState, 120),
            relationshipSummary: core_text.normalizeText(item?.relationshipSummary, 1800),
            relationshipSourceMemoryIds: core_text.cleanArray(item?.relationshipSourceMemoryIds, 24, 40),
            relationshipSourceMemoryAnchor: core_text.normalizeText(item?.relationshipSourceMemoryAnchor, 160),
            archivedAt: Math.max(0, Number(item?.archivedAt) || 0),
        })).filter(item => item.relationshipSummary),
        greetings,
        collectionIssues: core_heartLanguage.heartCollectionIssues(data),
        languageVisuals: cg_targets.normalizeLanguageCgVisuals(data?.languageVisuals),
        languagePortrait: cg_targets.normalizeLanguagePortrait(data?.languagePortrait),
        fireflyVisual: cg_targets.normalizeLocalCgSlots({ visual: data?.fireflyVisual }).visual || null,
        photoshoots: normalizeHeartPhotoshoots(data?.photoshoots),
        voiceDramas,
        scenarioDramas,
        dailyStrips,
        fireflyVoices,
        selectedFireflyId: core_text.normalizeText(data?.selectedFireflyId, 80) || fireflyVoices[0]?.id || '',
        selectedVoiceId: core_text.normalizeText(data?.selectedVoiceId, 80) || voiceDramas[0]?.id || '',
        selectedScenarioId: core_text.normalizeText(data?.selectedScenarioId, 80) || scenarioDramas[0]?.id || '',
        selectedDramaKey: core_text.normalizeText(data?.selectedDramaKey, 180),
        selectedStripId: core_text.normalizeText(data?.selectedStripId, 80) || dailyStrips[0]?.id || '',
        generationParts: {
            dialogues: core_heartLanguage.heartLanguageStatus({ ...data, greetings }).complete,
            seasons: data?.generationParts?.seasons === true || voiceDramas.length > 0 || scenarioDramas.length > 0,
            strips: data?.generationParts?.strips === true || dailyStrips.length > 0,
            fireflies: data?.generationParts?.fireflies === true || fireflyVoices.length > 0,
        },
        selectedSeason: ['postending', 'spring', 'summer', 'autumn', 'winter'].includes(data?.selectedSeason) ? data.selectedSeason : 'postending',
        view: ['seasons', 'strips', 'fireflies'].includes(data?.view) ? data.view : 'seasons',
        generationMeta: data?.generationMeta && typeof data.generationMeta === 'object' ? structuredClone(data.generationMeta) : undefined,
    };
}
