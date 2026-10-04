// Material selection for album / ADV. Output counts are never coverage cursors.
import * as constants from './constants.js';
import * as contextTools from './context.js';
import * as evidence from './evidence.js';
import * as incremental from './incremental.js';
import * as text from './text.js';

const requests = new Map();
let requestSerial = 0;

export function supportsContentSelection(mode) {
    return mode === constants.MODE.ALBUM || mode === constants.MODE.ADV;
}

export function selectionMemories(bank) {
    const seen = new Set();
    return [...(bank?.memories || []), ...(bank?.coldArchive || [])].filter(row => {
        const id = text.normalizeText(row?.id, 40);
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

export function contentSelectionStatus(session, bank) {
    const rows = selectionMemories(bank);
    const valid = new Set(rows.map(row => row.id));
    const record = session?.generationMeta?.contentSelection;
    const used = [...incremental.collectSessionEvidenceIds(session?.entries || session?.events || [])].filter(id => valid.has(id));
    // Older cursors stamped the entire bank, even when only 48 rows were sent.
    // Keep the works, but only their explicit references are confirmed material.
    const scanned = record?.schemaVersion === 1 ? text.cleanArray(record.scannedMemoryIds, Infinity, 40) : [];
    const scannedMemoryIds = [...new Set([...scanned, ...used])].filter(id => valid.has(id));
    const covered = new Set(scannedMemoryIds);
    return { rows, scannedMemoryIds, pendingMemoryIds: rows.map(row => row.id).filter(id => !covered.has(id)),
        legacyUnknown: record?.schemaVersion === 1 ? record.legacyUnknown === true : !!session };
}

function requestScope(context, bank, mode) {
    return JSON.stringify([contextTools.chatScopeKey(context), context?.__rmtArchiveTargetEntryId || '', bank?.archiveRevision || '', mode]);
}

export function readContentSelectionRequest(context, bank, mode, session = null) {
    const key = requestScope(context, bank, mode);
    const request = requests.get(key);
    if (request && session?.generationMeta?.contentSelection?.last?.requestKey === request.requestKey) {
        requests.delete(key);
        return null;
    }
    return request ? structuredClone(request) : null;
}

export function setContentSelectionRequest(context, bank, mode, memoryIds) {
    if (!supportsContentSelection(mode)) throw new Error('此内容暂不支持选择范围。');
    const key = requestScope(context, bank, mode);
    if (memoryIds === null) { requests.delete(key); return null; }
    const request = { archiveRevision: bank?.archiveRevision || '', memoryIds: [...new Set(memoryIds)],
        requestKey: `${Date.now()}:${++requestSerial}` };
    createContentSelectionPlan(bank, null, request);
    requests.set(key, request);
    return structuredClone(request);
}

export function createContentSelectionPlan(bank, previous, request = null) {
    const status = contentSelectionStatus(previous, bank);
    let memoryIds, revisit = false;
    if (request) {
        if (request.archiveRevision !== (bank?.archiveRevision || '')) throw new Error('档案已更新，请重新确认选材范围。');
        memoryIds = text.cleanArray(request.memoryIds, Infinity, 40);
        const valid = new Set(status.rows.map(row => row.id));
        if (!memoryIds.length || memoryIds.some(id => !valid.has(id))) throw new Error('选材范围已失效，请重新选择条目。');
        revisit = !!previous && memoryIds.every(id => status.scannedMemoryIds.includes(id));
    } else {
        memoryIds = status.pendingMemoryIds.slice(0, previous ? constants.MAX_MEMORY_PROMPT_ITEMS : 48);
        if (!memoryIds.length && previous) {
            revisit = true;
            const ids = status.rows.map(row => row.id);
            const offset = (Number(previous.generationMeta?.expansionRound) || 0) * 12 % Math.max(1, ids.length);
            memoryIds = [...ids.slice(offset), ...ids.slice(0, offset)].slice(0, constants.MAX_MEMORY_PROMPT_ITEMS);
        }
    }
    if (!memoryIds.length) throw new Error('档案中还没有可选材的记忆条目。');
    return { schemaVersion: 1, archiveRevision: bank?.archiveRevision || '', memoryIds,
        selectionKind: request ? 'manual' : 'auto', revisit, requestKey: request?.requestKey || '' };
}

export function validateContentSelectionPlan(plan, bank) {
    const valid = new Set(selectionMemories(bank).map(row => row.id));
    if (plan?.schemaVersion !== 1 || plan.archiveRevision !== (bank?.archiveRevision || '')
        || !Array.isArray(plan.memoryIds) || !plan.memoryIds.length || plan.memoryIds.some(id => !valid.has(id))) {
        throw new Error('本次选材与保存的档案不一致，请检查原任务；未发起新的生成。');
    }
    return structuredClone(plan);
}

export function selectionEvidenceBank(bank, plan) {
    if (!plan) return bank;
    validateContentSelectionPlan(plan, bank);
    const ids = new Set(plan.memoryIds);
    return { ...bank, memories: selectionMemories(bank).filter(row => ids.has(row.id)), coldArchive: [] };
}

export function selectionPromptArchive(bank, plan) {
    const selected = selectionEvidenceBank(bank, plan);
    const memories = [];
    // Preserve the existing per-record evidence format without silently sampling
    // a manual range at 48, 64 or 240 records. The existing input budget still applies.
    for (let i = 0; i < selected.memories.length; i += constants.MAX_MEMORY_ITEMS) {
        const chunk = selected.memories.slice(i, i + constants.MAX_MEMORY_ITEMS);
        memories.push(...evidence.memoryPayload({ ...selected, memories: chunk }, chunk.map(row => row.id), chunk.length));
    }
    return JSON.stringify({ archiveName: text.normalizeText(bank?.archiveName, 120),
        archiveSummary: text.normalizeText(bank?.archiveSummary, 1200), archiveKeywords: text.cleanArray(bank?.archiveKeywords, 8, 80),
        incrementalMemoryIds: plan.memoryIds, memories }, null, 2);
}

export function legacyContentSelectionPlan(bank, previous) {
    const ids = previous ? incremental.derivedExpansionMemoryIds(previous, bank, 'mode')
        : evidence.memoryPayload(bank, null, 48).map(row => row.id);
    return { schemaVersion: 1, archiveRevision: bank?.archiveRevision || '', memoryIds: ids,
        selectionKind: 'legacy', revisit: !!previous && !incremental.incrementalArchiveMemoryIds(previous, bank).length, requestKey: '' };
}

export function stampContentSelection(session, previous, bank, plan, added = 0) {
    const status = contentSelectionStatus(previous, bank);
    const valid = new Set(status.rows.map(row => row.id));
    const scannedMemoryIds = [...new Set([...status.scannedMemoryIds, ...plan.memoryIds])].filter(id => valid.has(id));
    const prior = structuredClone(session.generationMeta || previous?.generationMeta || {});
    const updatedAt = Date.now();
    const last = { memoryIds: [...plan.memoryIds], selectionKind: plan.selectionKind, requestKey: plan.requestKey,
        added: Math.max(0, Number(added) || 0), updatedAt };
    session.generationMeta = { ...prior, schemaVersion: constants.DERIVED_INCREMENTAL_SCHEMA_VERSION,
        expansionRound: (Number(prior.expansionRound) || 0) + (plan.revisit && added > 0 ? 1 : 0),
        parts: { ...(prior.parts || {}), mode: { coveredMemoryIds: scannedMemoryIds, archiveRevision: bank?.archiveRevision || '', updatedAt } },
        contentSelection: { schemaVersion: 1, scannedMemoryIds, legacyUnknown: status.legacyUnknown, last },
        lastUpdate: { part: 'mode', derivedExpansion: plan.revisit, consumedMemoryIds: [...plan.memoryIds], added: last.added, updatedAt } };
    return session;
}
