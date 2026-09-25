// Bounded, inert fiction data. The renderer owns all markup and controls.
import * as constants from './constants.js';
import * as text from './text.js';

export const BEDTIME_MODE = 'bedtime';
export const BEDTIME_VERSION = 1;
export const BEDTIME_LIMITS = Object.freeze({
    get title() { return constants.MAX_CACHE_DECOMPRESSED_BYTES; },
    get genre() { return constants.MAX_CACHE_DECOMPRESSED_BYTES; },
    get premise() { return constants.MAX_CACHE_DECOMPRESSED_BYTES; },
    get direction() { return constants.MAX_CACHE_DECOMPRESSED_BYTES; },
    get chapterTitle() { return constants.MAX_CACHE_DECOMPRESSED_BYTES; },
    get chapterText() { return constants.MAX_CACHE_DECOMPRESSED_BYTES; },
});

export function bedtimeError(code, message) {
    return text.safeUserError(message, `RMT_BEDTIME_${code}`);
}

export function bedtimeData(value, maxBytes = constants.MAX_CACHE_DECOMPRESSED_BYTES) {
    try {
        const seen = new WeakSet();
        let nodes = 0;
        const visit = (item, depth = 0) => {
            if (++nodes > maxBytes || depth > 32) throw new Error('bounded structure');
            if (item == null || typeof item === 'string' || typeof item === 'boolean') return;
            if (typeof item === 'number') { if (!Number.isFinite(item)) throw new Error('finite number'); return; }
            if (typeof item !== 'object' || seen.has(item)) throw new Error('plain data');
            seen.add(item);
            const prototype = Object.getPrototypeOf(item);
            if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) throw new Error('plain data');
            const descriptors = Object.getOwnPropertyDescriptors(item);
            for (const [key, descriptor] of Object.entries(descriptors)) {
                if (key === '__proto__' || key === 'prototype' || key === 'constructor' || descriptor.get || descriptor.set)
                    throw new Error('safe key');
                visit(descriptor.value, depth + 1);
            }
        };
        visit(value);
        const serialized = JSON.stringify(value);
        if (typeof serialized !== 'string' || new TextEncoder().encode(serialized).byteLength > maxBytes) throw new Error('byte limit');
        return JSON.parse(serialized);
    } catch { throw bedtimeError('STRUCTURE', '这份睡前故事不是可安全读取的有界文字，旧故事仍保留。'); }
}

export function bedtimeText(value, max, required = false) {
    if (value == null && !required) return '';
    if (typeof value !== 'string' || value.length > max)
        throw bedtimeError('STRUCTURE', '故事文字缺失或超过本地安全容量，旧故事仍保留。');
    if (value.includes('\u0000') || required && !value.trim()) throw bedtimeError('STRUCTURE', '这一段故事还没有完整返回。');
    // Validation must not rewrite a saved chapter. Leading/trailing whitespace,
    // blank lines and the provider's original newline convention are content.
    return value;
}

function requireShape(condition) {
    if (!condition) throw bedtimeError('STRUCTURE', '这份睡前故事结构暂不可读取，旧故事仍保留。');
}

function storyId(value) {
    const result = bedtimeText(value, 100, true);
    requireShape(/^BED_[a-z0-9_-]{1,80}$/u.test(result));
    return result;
}

function chapterId(value, parentId) {
    const result = bedtimeText(value, 160, true);
    requireShape(new RegExp(`^${parentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-C\\d+$`, 'u').test(result));
    return result;
}

export function emptyBedtime(memory, ownerKey = '') {
    return {
        kind: BEDTIME_MODE,
        bedtimeVersion: BEDTIME_VERSION,
        chatId: bedtimeText(memory?.chatId, 240, true),
        archiveRevision: bedtimeText(memory?.archiveRevision, 240, true),
        ownerKey: bedtimeText(ownerKey, 1200),
        characterName: bedtimeText(memory?.characterName, 120, true),
        userName: bedtimeText(memory?.userName, 120, true),
        stories: [], selectedId: '', view: 'library', chapterIndex: 0,
    };
}

export function normalizeStoredBedtime(value, memory = null) {
    const raw = bedtimeData(value), L = BEDTIME_LIMITS;
    requireShape(raw.kind === BEDTIME_MODE && raw.bedtimeVersion === BEDTIME_VERSION && Array.isArray(raw.stories));
    for (const key of ['chatId', 'archiveRevision']) bedtimeText(raw[key], 240, true);
    for (const key of ['characterName', 'userName']) bedtimeText(raw[key], 120, true);
    bedtimeText(raw.ownerKey, 1200);
    if (memory) requireShape(raw.chatId === memory.chatId && raw.archiveRevision === memory.archiveRevision
        && raw.characterName === memory.characterName && raw.userName === memory.userName);
    const storyIds = new Set();
    for (const story of raw.stories) {
        requireShape(story && story.fiction === true && story.generationIncomplete !== true && Number.isFinite(story.createdAt) && story.createdAt >= 0
            && Number.isFinite(story.updatedAt) && story.updatedAt >= story.createdAt && Array.isArray(story.chapters)
            && story.chapters.length > 0);
        const id = storyId(story.id);
        requireShape(!storyIds.has(id)); storyIds.add(id);
        bedtimeText(story.title, L.title, true); bedtimeText(story.genre, L.genre, true);
        bedtimeText(story.premise, L.premise, true);
        const chapterIds = new Set();
        for (const chapter of story.chapters) {
            requireShape(chapter && chapter.generationIncomplete !== true && Number.isFinite(chapter.createdAt) && chapter.createdAt >= story.createdAt);
            const idValue = chapterId(chapter.id, id);
            requireShape(!chapterIds.has(idValue)); chapterIds.add(idValue);
            bedtimeText(chapter.title, L.chapterTitle, true);
            bedtimeText(chapter.text, L.chapterText, true);
        }
    }
    raw.selectedId = typeof raw.selectedId === 'string' && storyIds.has(raw.selectedId) ? raw.selectedId : raw.stories[0]?.id || '';
    raw.view = raw.view === 'story' && raw.selectedId ? 'story' : 'library';
    const selected = raw.stories.find(item => item.id === raw.selectedId);
    raw.chapterIndex = Math.max(0, Math.min(Math.max(0, (selected?.chapters.length || 1) - 1), Math.floor(Number(raw.chapterIndex) || 0)));
    return raw;
}

export function readableBedtime(value, memory) {
    try { normalizeStoredBedtime(value, memory); return true; } catch { return false; }
}

export function bedtimeReadingState(session) {
    const stories = Array.isArray(session?.stories) ? session.stories : [];
    const selected = stories.find(item => item?.id === session?.selectedId) || stories[0] || null;
    return {
        selectedId: selected?.id || '',
        view: selected && session?.view === 'story' ? 'story' : 'library',
        chapterIndex: Math.max(0, Math.min(Math.max(0, (selected?.chapters?.length || 1) - 1), Math.floor(Number(session?.chapterIndex) || 0))),
    };
}

export function mergeBedtime(latest, incoming) {
    const next = normalizeStoredBedtime(incoming);
    if (!latest) return next;
    const previous = normalizeStoredBedtime(latest);
    for (const key of ['chatId', 'archiveRevision', 'characterName', 'userName']) {
        if (previous[key] !== next[key]) throw bedtimeError('SOURCE', '睡前故事所属角色、聊天或档案版本已变化。');
    }
    if (previous.ownerKey && next.ownerKey && previous.ownerKey !== next.ownerKey)
        throw bedtimeError('SOURCE', '睡前故事所属角色已变化。');
    const byId = new Map(previous.stories.map(story => [story.id, story]));
    for (const story of next.stories) {
        const saved = byId.get(story.id);
        if (!saved) {
            const added = structuredClone(story); previous.stories.push(added); byId.set(added.id, added); continue;
        }
        for (const key of ['id', 'title', 'genre', 'premise', 'createdAt', 'fiction']) {
            if (JSON.stringify(saved[key]) !== JSON.stringify(story[key]))
                throw bedtimeError('CONFLICT', '同一篇故事的已有内容已经变化，本次没有覆盖旧故事。');
        }
        const chapters = new Map(saved.chapters.map(chapter => [chapter.id, chapter]));
        for (const chapter of story.chapters) {
            const prior = chapters.get(chapter.id);
            if (prior) {
                // A separately saved picture must not block a completed continuation.
                // Keep the latest local visual while comparing the immutable chapter.
                const { visual: priorVisual, ...priorText } = prior;
                const { visual: incomingVisual, ...incomingText } = chapter;
                if (JSON.stringify(priorText) !== JSON.stringify(incomingText))
                    throw bedtimeError('CONFLICT', '同一章已经变化，本次没有覆盖旧章节。');
                continue;
            }
            const expected = `${saved.id}-C${String(saved.chapters.length + 1).padStart(2, '0')}`;
            if (chapter.id !== expected) throw bedtimeError('CONFLICT', '续章次序已经变化，本次没有插入到错误位置。');
            const appended = structuredClone(chapter); saved.chapters.push(appended); chapters.set(appended.id, appended);
        }
        saved.updatedAt = Math.max(saved.updatedAt, story.updatedAt);
    }
    if (next.selectedId && byId.has(next.selectedId)) previous.selectedId = next.selectedId;
    Object.assign(previous, bedtimeReadingState({ ...previous, selectedId: previous.selectedId, view: next.view, chapterIndex: next.chapterIndex }));
    return normalizeStoredBedtime(previous);
}
