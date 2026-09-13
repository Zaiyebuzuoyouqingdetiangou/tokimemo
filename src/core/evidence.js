// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_constants from './constants.js';
import * as core_text from './text.js';

export function memoryIdSet(memoryBank) {
    return new Set((memoryBank?.memories || []).map(item => String(item.id)));
}

export function normalizeSourceMemoryIds(value, memoryBank, minimum = 1) {
    const allowed = memoryIdSet(memoryBank);
    const ids = core_text.cleanArray(value, 16, 40).filter(id => allowed.has(id));
    const unique = [...new Set(ids)];
    if (unique.length < minimum) return [];
    return unique;
}

export function memoryEvidenceTerms(memoryBank, sourceMemoryIds) {
    const ids = new Set(sourceMemoryIds || []);
    const terms = [];
    for (const memory of memoryBank?.memories || []) {
        if (!ids.has(String(memory?.id))) continue;
        const title = core_text.normalizeText(memory?.title, 100);
        if (title.length >= 2) terms.push(title);
        for (const anchor of core_text.cleanArray(memory?.anchors, 8, 120)) {
            if (anchor.length >= 2) terms.push(anchor);
        }
    }
    return [...new Set(terms)];
}

export function normalizeMemoryReference(sourceIdsValue, evidenceValue, evidenceText, memoryBank, minimum = 1) {
    const sourceMemoryIds = normalizeSourceMemoryIds(sourceIdsValue, memoryBank, minimum);
    if (sourceMemoryIds.length < minimum) return { sourceMemoryIds: [], sourceMemoryAnchor: '' };
    if (!sourceMemoryIds.length) return { sourceMemoryIds: [], sourceMemoryAnchor: '' };
    const allowedTerms = memoryEvidenceTerms(memoryBank, sourceMemoryIds);
    const requested = core_text.normalizeText(evidenceValue, 120);
    const folded = value => core_text.normalizeText(value, 160).replace(/\s+/g, '').toLowerCase();
    const requestedFolded = folded(requested);
    let matched = allowedTerms.find(term => folded(term) === requestedFolded) || '';
    if (!matched) {
        const haystack = folded(evidenceText);
        matched = allowedTerms.find(term => {
            const needle = folded(term);
            return needle.length >= 2 && haystack.includes(needle);
        }) || '';
    }
    if (!matched) return { sourceMemoryIds: [], sourceMemoryAnchor: '' };
    return { sourceMemoryIds, sourceMemoryAnchor: matched };
}

// Use this at authority boundaries where the producer is required to submit an exact
// title/anchor. Unlike normalizeMemoryReference(), it never discovers a different real anchor
// inside model-authored prose, so a valid fragment cannot launder an invalid requested anchor.
export function normalizeExactMemoryReference(sourceIdsValue, evidenceValue, memoryBank, minimum = 1) {
    return normalizeMemoryReference(sourceIdsValue, evidenceValue, '', memoryBank, minimum);
}

export function evenlySample(items, limit) {
    if (!Array.isArray(items) || items.length <= limit) return Array.isArray(items) ? [...items] : [];
    if (limit <= 1) return [items[items.length - 1]];
    const selected = [];
    const seen = new Set();
    for (let i = 0; i < limit; i += 1) {
        const index = Math.round((i * (items.length - 1)) / (limit - 1));
        if (!seen.has(index)) {
            seen.add(index);
            selected.push(items[index]);
        }
    }
    return selected;
}

export function memoryPayload(memoryBank, onlyIds = null, limit = core_constants.MAX_MEMORY_PROMPT_ITEMS) {
    const filter = onlyIds ? new Set(onlyIds) : null;
    const source = (memoryBank?.memories || []).filter(item => !filter || filter.has(item.id));
    const safeLimit = Math.max(1, Math.min(core_constants.MAX_MEMORY_ITEMS, Number(limit) || core_constants.MAX_MEMORY_PROMPT_ITEMS));
    const selected = filter ? source.slice(0, safeLimit) : evenlySample(source, safeLimit);
    return selected.map(item => ({
        id: core_text.normalizeText(item?.id, 40),
        date: core_text.normalizeText(item?.date, 60),
        title: core_text.normalizeText(item?.title, 100),
        summary: core_text.normalizeText(item?.summary, 700),
        anchors: core_text.cleanArray(item?.anchors, 6, 100),
        participants: core_text.cleanArray(item?.participants, 6, 80),
        messageRange: [Number(item?.messageStart) || 0, Number(item?.messageEnd) || 0],
        sourceKind: core_text.normalizeText(item?.sourceKind, 60) || 'chat',
        externalSource: core_text.cleanArray(item?.externalSourceIds, 6, 100),
    }));
}

export function roomReferencedMemoryIds(roomSession, focusObject = null) {
    const ids = [];
    const seen = new Set();
    const add = value => {
        for (const id of core_text.cleanArray(value, 16, 40)) {
            if (seen.has(id)) continue;
            seen.add(id);
            ids.push(id);
            if (ids.length >= 24) return;
        }
    };
    add(focusObject?.sourceMemoryIds);
    for (const space of Array.isArray(roomSession?.spaces) ? roomSession.spaces : []) {
        for (const item of Array.isArray(space?.objects) ? space.objects : []) {
            if (isSearchableRoomObject(item) || item?.basis === '记忆') add(item?.sourceMemoryIds);
            if (ids.length >= 24) return ids;
        }
    }
    return ids;
}

export function isSearchableRoomObject(value) {
    const text = core_text.normalizeText(`${value?.label || ''} ${value?.description || ''}`, 1800);
    const containerLike = /(?:盒|匣|箱|柜|抽屉|衣柜|床头柜|储物|收纳|行李|旅行袋|背包|手提包|袋|工具箱|药箱|首饰盒|数据匣|储物格|箱格|柜格|夹层|暗格|case|box|drawer|cabinet|chest|locker|bag|pouch|compartment|wardrobe|storage)/i.test(text);
    return containerLike && value?.searchable !== false;
}
