// 自动留忆的成就追加进成就库。手动生成的条目留在原处，不互相覆盖。
import * as archive_repository from '../archive/repository.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import * as core_text from '../core/text.js';

function clip(value, max) {
    return String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
}

function unlockedOn(now) {
    const date = new Date(now);
    if (Number.isNaN(date.getTime())) return '已解锁';
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}/${month}/${day}`;
}

function sameAuto(existing, entry) {
    if (existing?.origin !== 'auto') return false;
    if (existing.id && existing.id === entry.id) return true;
    return clip(existing.title, 100).toLowerCase() === clip(entry.title, 100).toLowerCase();
}

export function libraryEntryFromAutoAchievement(achievement, { moduleId = '', sourceMemoryIds = [], memoryBank = null, now = Date.now() } = {}) {
    const title = clip(achievement?.title, 100);
    if (!title) return null;
    const kind = achievement?.kind === 'collection' ? 'collection' : 'historical';
    const ids = core_text.cleanArray(sourceMemoryIds, 8, 40).filter(id => /^M\d{3,6}$/.test(id));
    const known = memoryBank ? core_evidence.normalizeSourceMemoryIds(ids, memoryBank, 1) : ids;
    const anchor = core_evidence.memoryEvidenceTerms(memoryBank, known.length ? known : ids)[0]
        || clip(achievement?.sourceMemoryAnchor, 160);
    const description = clip(achievement?.description, 900) || title;
    const unlockCondition = clip(achievement?.unlockCondition, 300) || anchor || description;
    return {
        id: core_text.safeId(achievement?.id, '') || `auto-${clip(moduleId, 20) || 'memory'}-${String(now).slice(-8)}`,
        title,
        description,
        category: '特别',
        tier: 'bronze',
        unlocked: true,
        unlockedAt: unlockedOn(now),
        unlockCondition,
        sourceMemoryIds: known.length ? known : ids,
        sourceMemoryAnchor: anchor || unlockCondition,
        hint: '',
        kind,
        moduleId: clip(moduleId, 40),
        origin: 'auto',
    };
}

export function appendLibraryEntry(previous, entry) {
    if (!entry?.title) return previous || null;
    const entries = Array.isArray(previous?.entries) ? previous.entries.map(item => structuredClone(item)) : [];
    const index = entries.findIndex(item => sameAuto(item, entry));
    if (index >= 0) entries[index] = { ...entries[index], ...entry, id: entries[index].id || entry.id };
    else entries.push(structuredClone(entry));
    const seen = new Set();
    let serial = 1;
    const deduped = entries.map(item => {
        let id = core_text.safeId(item?.id, '');
        while (!id || seen.has(id)) id = `ACH${String(serial++).padStart(2, '0')}`;
        seen.add(id);
        return { ...item, id };
    });
    return {
        ...(previous && typeof previous === 'object' ? previous : {}),
        kind: core_constants.MODE.ACHIEVEMENTS,
        title: previous?.title || '成就库',
        entries: deduped,
    };
}

export function saveAutoAchievement(context, result, now = Date.now()) {
    const achievement = result?.achievement;
    const reveal = result?.reveal;
    if (!context || result?.action !== 'reveal' || !achievement?.title) return false;
    let memory = null;
    try { memory = archive_repository.getImportedMemory(context); } catch { memory = null; }
    const entry = libraryEntryFromAutoAchievement(achievement, {
        moduleId: reveal?.moduleId || '',
        sourceMemoryIds: reveal?.sourceMemoryIds || [],
        memoryBank: memory,
        now,
    });
    if (!entry) return false;
    const previous = core_cache.loadSession(core_constants.MODE.ACHIEVEMENTS, { context, memoryBank: memory, clone: true });
    const session = appendLibraryEntry(previous, entry);
    const chatId = core_context.getChatId(context);
    session.chatId = chatId;
    if (memory?.archiveRevision) session.archiveRevision = memory.archiveRevision;
    return core_cache.saveSession(core_constants.MODE.ACHIEVEMENTS, session, chatId) === true;
}
