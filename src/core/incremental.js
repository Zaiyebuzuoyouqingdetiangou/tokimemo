// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_constants from './constants.js';
import * as core_context from './context.js';
import * as core_evidence from './evidence.js';
import * as core_text from './text.js';

export function archiveMemoryIds(memoryBank) {
    return (Array.isArray(memoryBank?.memories) ? memoryBank.memories : [])
        .map(item => core_text.normalizeText(item?.id, 40))
        .filter(Boolean)
        .slice(0, core_constants.MAX_MEMORY_ITEMS);
}

export function collectSessionEvidenceIds(value, out = new Set(), seen = new WeakSet(), depth = 0) {
    if (!value || typeof value !== 'object' || depth > 10 || out.size >= core_constants.MAX_MEMORY_ITEMS) return out;
    if (seen.has(value)) return out;
    seen.add(value);
    if (Array.isArray(value)) {
        for (const item of value) collectSessionEvidenceIds(item, out, seen, depth + 1);
        return out;
    }
    for (const [key, item] of Object.entries(value)) {
        if (key === 'sourceMemoryIds' || key === 'sourceArchiveMemoryIds' || key === 'coveredMemoryIds') {
            for (const id of core_text.cleanArray(item, core_constants.MAX_MEMORY_ITEMS, 40)) out.add(id);
            continue;
        }
        if (key === 'generationMeta') continue;
        collectSessionEvidenceIds(item, out, seen, depth + 1);
    }
    return out;
}

export function legacyIncrementalEvidenceIds(session, part = 'mode') {
    if (!session || typeof session !== 'object') return [];
    if (part.startsWith('season:')) {
        const season = part.slice('season:'.length);
        const related = [
            ...(Array.isArray(session.voiceDramas) ? session.voiceDramas.filter(item => item.kind === season) : []),
            ...(Array.isArray(session.scenarioDramas) ? session.scenarioDramas.filter(item => item.season === season) : []),
        ];
        return [...collectSessionEvidenceIds(related)];
    }
    if (part === 'strips') return [...collectSessionEvidenceIds(session.dailyStrips || [])];
    if (part === 'dialogues') {
        return [...new Set([
            ...core_text.cleanArray(session.relationshipSourceMemoryIds, 24, 40),
            ...collectSessionEvidenceIds(session.greetings || {}),
        ])];
    }
    if (part === 'confessions') return [...collectSessionEvidenceIds(session.confessionReplays || [])];
    return [...collectSessionEvidenceIds(session)];
}

export function incrementalPartRecord(session, part = 'mode') {
    const raw = session?.generationMeta?.parts?.[part];
    if (!raw || typeof raw !== 'object') return null;
    return {
        coveredMemoryIds: core_text.cleanArray(raw.coveredMemoryIds, core_constants.MAX_MEMORY_ITEMS, 40),
        archiveRevision: core_text.normalizeText(raw.archiveRevision, 240),
        updatedAt: Math.max(0, Number(raw.updatedAt) || 0),
    };
}

export function legacyIncrementalPartHasContent(session, part = 'mode') {
    if (!session || typeof session !== 'object') return false;
    if (part.startsWith('season:')) {
        const season = part.slice('season:'.length);
        return (Array.isArray(session.voiceDramas) && session.voiceDramas.some(item => item?.kind === season))
            || (Array.isArray(session.scenarioDramas) && session.scenarioDramas.some(item => item?.season === season));
    }
    if (part === 'strips') return Array.isArray(session.dailyStrips) && session.dailyStrips.length > 0;
    if (part === 'dialogues') {
        return !!core_text.normalizeText(session.relationshipSummary, 40)
            || Object.values(session.greetings || {}).some(lines => Array.isArray(lines) && lines.length > 0);
    }
    if (part === 'confessions') return Array.isArray(session.confessionReplays) && session.confessionReplays.length > 0;
    return !!session.kind;
}

export function incrementalCoveredMemoryIds(session, memoryBank, part = 'mode') {
    const valid = new Set(archiveMemoryIds(memoryBank));
    const record = incrementalPartRecord(session, part);
    // A pre-r30 cache has no per-part cursor. If that part already contains generated material
    // and its exact older archive snapshot is unavailable, the conservative migration is to
    // regard the current archive as its baseline. Replaying only the few evidence IDs embedded
    // in old output would misclassify the rest as new and make the model retell old material.
    const fallback = record
        ? record.coveredMemoryIds
        : legacyIncrementalPartHasContent(session, part)
            ? archiveMemoryIds(memoryBank)
            : legacyIncrementalEvidenceIds(session, part);
    return [...new Set(fallback.filter(id => valid.has(id)))];
}

export function incrementalArchiveMemoryIds(session, memoryBank, part = 'mode', limit = core_constants.MAX_MEMORY_PROMPT_ITEMS) {
    const covered = new Set(incrementalCoveredMemoryIds(session, memoryBank, part));
    const safeLimit = Math.max(1, Math.min(core_constants.MAX_MEMORY_PROMPT_ITEMS, Math.floor(Number(limit) || core_constants.MAX_MEMORY_PROMPT_ITEMS)));
    return archiveMemoryIds(memoryBank).filter(id => !covered.has(id)).slice(0, safeLimit);
}

export function usesIncrementalMemoryId(referenceIds, sourceMemoryIds) {
    const allowed = new Set(core_text.cleanArray(sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40));
    return core_text.cleanArray(referenceIds, core_constants.MAX_MEMORY_ITEMS, 40).some(id => allowed.has(id));
}

export function incrementalArchiveSlice(memoryBank, sourceMemoryIds, limit = core_constants.MAX_MEMORY_PROMPT_ITEMS) {
    const ids = core_text.cleanArray(sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40);
    return JSON.stringify({
        archiveName: core_text.normalizeText(memoryBank?.archiveName, 120),
        incrementalMemoryIds: ids,
        memories: core_evidence.memoryPayload(memoryBank, ids, limit),
    }, null, 2);
}

export function incrementalPromptMemoryBank(memoryBank, sourceMemoryIds) {
    const ids = new Set(core_text.cleanArray(sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40));
    return {
        archiveName: core_text.normalizeText(memoryBank?.archiveName, 120),
        archiveSummary: '',
        archiveKeywords: [],
        memories: (Array.isArray(memoryBank?.memories) ? memoryBank.memories : []).filter(item => ids.has(core_text.normalizeText(item?.id, 40))),
    };
}

export function stampIncrementalCoverage(session, previous, memoryBank, part, consumedMemoryIds, added = 0) {
    if (!session || typeof session !== 'object') return session;
    const currentIds = new Set(archiveMemoryIds(memoryBank));
    const priorMeta = session.generationMeta && typeof session.generationMeta === 'object'
        ? structuredClone(session.generationMeta)
        : previous?.generationMeta && typeof previous.generationMeta === 'object'
            ? structuredClone(previous.generationMeta)
            : {};
    const priorCovered = previous
        ? incrementalCoveredMemoryIds(previous, memoryBank, part)
        : [];
    const consumed = previous
        ? core_text.cleanArray(consumedMemoryIds, core_constants.MAX_MEMORY_ITEMS, 40)
        : archiveMemoryIds(memoryBank);
    const coveredMemoryIds = [...new Set([...priorCovered, ...consumed])].filter(id => currentIds.has(id));
    session.generationMeta = {
        ...priorMeta,
        schemaVersion: core_constants.DERIVED_INCREMENTAL_SCHEMA_VERSION,
        parts: {
            ...(priorMeta.parts && typeof priorMeta.parts === 'object' ? priorMeta.parts : {}),
            [part]: {
                coveredMemoryIds,
                archiveRevision: core_text.normalizeText(memoryBank?.archiveRevision, 240),
                updatedAt: Date.now(),
            },
        },
        lastUpdate: {
            part,
            consumedMemoryIds: consumed,
            added: Math.max(0, Math.floor(Number(added) || 0)),
            updatedAt: Date.now(),
        },
    };
    return session;
}

export function normalizedContentKey(value, max = 300) {
    return core_text.normalizeText(value, max).replace(/\s+/g, '').toLowerCase();
}

export function uniqueGeneratedId(preferred, usedIds, prefix) {
    let id = core_text.safeId(preferred, '');
    let serial = Math.max(1, usedIds.size + 1);
    while (!id || usedIds.has(id)) id = `${prefix}${String(serial++).padStart(2, '0')}`;
    usedIds.add(id);
    return id;
}

export function incrementalBatchId(part, sourceMemoryIds) {
    return core_context.stableArchiveHash(`${core_text.normalizeText(part, 80)}|${core_text.cleanArray(sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40).join('|')}`);
}
