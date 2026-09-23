// Hot 240 + lock + cold archive 100. Rolling eviction is explicit and never
// silently deletes a locked Mxxx. New memories keep new ids.
import * as core_constants from '../core/constants.js';
import * as core_text from '../core/text.js';
import * as story_chronology from '../core/storyChronology.js';

function importedMemoryStableKey(item) {
    const title = core_text.normalizeText(item?.title, 100).replace(/\s+/g, '').toLowerCase();
    const summary = core_text.normalizeText(item?.summary, 260).replace(/\s+/g, ' ').toLowerCase();
    const anchors = core_text.cleanArray(item?.anchors, 8, 120).map(value => value.replace(/\s+/g, '').toLowerCase()).sort().join('|');
    const sourceKind = core_text.normalizeText(item?.sourceKind, 80) || 'chat';
    const messageRange = sourceKind.startsWith('chat') ? `${Number(item?.messageStart) || 0}-${Number(item?.messageEnd) || 0}` : '';
    const external = core_text.cleanArray(item?.externalSourceIds, 12, 100).sort().join(',');
    return `${sourceKind}|${messageRange}|${external}|${title}|${anchors || summary}`;
}

export function isMemoryLocked(item) {
    return item?.locked === true;
}

export function memoryNumber(item) {
    const match = String(item?.id || '').match(/^M(\d+)$/i);
    return match ? Number(match[1]) || 0 : 0;
}

export function nextMemoryNumber(hot, cold = []) {
    return [...(Array.isArray(hot) ? hot : []), ...(Array.isArray(cold) ? cold : [])]
        .reduce((max, item) => Math.max(max, memoryNumber(item)), 0) + 1;
}

export function canAdmitToHot(hot = []) {
    const list = Array.isArray(hot) ? hot : [];
    if (list.length < core_constants.MAX_MEMORY_ITEMS) return true;
    return list.some(item => !isMemoryLocked(item));
}

function evictionRank(item, index) {
    const date = story_chronology.comparableStoryDate(item?.date);
    // Unlabeled dates sort as latest so dated early memories are evicted first.
    const tagged = date ? 0 : 1;
    const parts = date?.parts || [9e15, 12, 31];
    const calendar = date?.calendar || '\uffff';
    return [tagged, calendar, parts[0] || 0, parts[1] || 0, parts[2] || 0, index];
}

function compareRank(left, right) {
    for (let i = 0; i < left.length; i += 1) {
        if (left[i] < right[i]) return -1;
        if (left[i] > right[i]) return 1;
    }
    return 0;
}

export function pickUnlockedForEviction(hot, count) {
    const ranked = (Array.isArray(hot) ? hot : [])
        .map((item, index) => ({ item, index, rank: evictionRank(item, index) }))
        .filter(row => !isMemoryLocked(row.item))
        .sort((left, right) => compareRank(left.rank, right.rank));
    return ranked.slice(0, Math.max(0, count)).map(row => row.item);
}

export function admitColdArchive(cold, incoming, { maxCold = core_constants.MAX_COLD_ARCHIVE_ITEMS } = {}) {
    const next = [...(Array.isArray(cold) ? cold.map(item => structuredClone(item)) : []),
        ...(Array.isArray(incoming) ? incoming.map(item => structuredClone(item)) : [])];
    const deleted = [];
    while (next.length > maxCold) {
        const ranked = next.map((item, index) => ({ item, index, rank: evictionRank(item, index) }))
            .sort((left, right) => compareRank(left.rank, right.rank));
        const victim = ranked[0];
        if (!victim) break;
        deleted.push(next.splice(victim.index, 1)[0]);
    }
    return { coldArchive: next, deleted };
}

export function assignFreshMemoryIds(items, startNumber) {
    let nextNumber = Math.max(1, Number(startNumber) || 1);
    return (Array.isArray(items) ? items : []).map(item => {
        const copy = structuredClone(item);
        delete copy.id;
        const memory = { id: `M${String(nextNumber).padStart(3, '0')}`, ...copy, locked: copy.locked === true };
        nextNumber += 1;
        return memory;
    });
}

export function admitArchiveMemories(existingHot, fresh, existingCold = [], {
    maxHot = core_constants.MAX_MEMORY_ITEMS,
    maxCold = core_constants.MAX_COLD_ARCHIVE_ITEMS,
    maxEvict = core_constants.MAX_ROLLING_EVICT_PER_BATCH,
} = {}) {
    const hot = (Array.isArray(existingHot) ? existingHot : []).map(item => structuredClone(item));
    const seen = new Set(hot.map(importedMemoryStableKey));
    for (const item of Array.isArray(existingCold) ? existingCold : []) seen.add(importedMemoryStableKey(item));
    const unique = [];
    for (const value of Array.isArray(fresh) ? fresh : []) {
        const item = structuredClone(value);
        delete item.id;
        const key = importedMemoryStableKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(item);
    }
    const numbered = assignFreshMemoryIds(unique, nextMemoryNumber(hot, existingCold));
    const admitted = [];
    const pending = [];
    const evicted = [];
    let remainingEvict = Math.max(0, maxEvict);
    for (const item of numbered) {
        if (hot.length - evicted.length + admitted.length < maxHot) {
            admitted.push(item);
            continue;
        }
        if (remainingEvict <= 0) { pending.push(item); continue; }
        // Only records that existed before this batch may make room for it.
        // Early story dates on newly admitted memories must not make them their
        // own batch's eviction victims; overflow remains explicitly pending.
        const working = hot.filter(row => !evicted.some(gone => gone.id === row.id));
        const [victim] = pickUnlockedForEviction(working, 1);
        if (!victim) { pending.push(item); continue; }
        evicted.push(victim);
        remainingEvict -= 1;
        admitted.push(item);
    }
    const nextHot = [...hot, ...admitted].filter(item => !evicted.some(gone => gone.id === item.id));
    const coldResult = admitColdArchive(existingCold, evicted, { maxCold });
    return {
        memories: nextHot,
        pending,
        evicted,
        coldArchive: coldResult.coldArchive,
        coldDeleted: coldResult.deleted,
        rolled: evicted.length > 0,
        lockedFull: pending.length > 0 && nextHot.length >= maxHot && nextHot.every(isMemoryLocked),
    };
}

export function capacityNotice(result) {
    if (result?.rolled) {
        return `已将最早的未锁定记忆移入冷归档，腾出热位给新记忆。锁上的条目未动。本次冷藏 ${result.evicted.length} 条${result.coldDeleted?.length ? `，冷归档溢出删除 ${result.coldDeleted.length} 条最早冷存` : ''}。`;
    }
    if (result?.lockedFull) {
        return '热位已满且均为锁定。新结果在待入档，可导出。已有相簿/ADV/房间仍可生成。';
    }
    return '';
}

export function evidenceMemories(memoryBank) {
    return [
        ...(Array.isArray(memoryBank?.memories) ? memoryBank.memories : []),
        ...(Array.isArray(memoryBank?.coldArchive) ? memoryBank.coldArchive : []),
    ];
}

export function findMemoryById(memoryBank, id) {
    const wanted = core_text.normalizeText(id, 40);
    return evidenceMemories(memoryBank).find(item => String(item?.id) === wanted) || null;
}
