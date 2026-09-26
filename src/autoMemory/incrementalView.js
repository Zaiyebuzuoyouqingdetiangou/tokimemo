// 楼层里只放这一轮新增的段落。旧信、旧章节和旧日记留在插件页面。

const LIST_KEYS = ['items', 'letters', 'entries', 'chapters', 'stories', 'songs', 'apps', 'events', 'routes', 'episodes', 'pages', 'nodes'];

function listedIds(item) {
    const rows = [];
    if (Array.isArray(item?.sourceMemoryIds)) rows.push(...item.sourceMemoryIds);
    if (typeof item?.sourceMemoryId === 'string') rows.push(item.sourceMemoryId);
    return rows;
}

function matches(item, ids, createdAt) {
    if (!item || typeof item !== 'object') return false;
    if (listedIds(item).some(id => ids.has(id))) return true;
    return Number.isFinite(item.createdAt) && createdAt > 0 && item.createdAt >= createdAt;
}

function trimStory(story, ids, createdAt) {
    if (!Array.isArray(story?.chapters)) return matches(story, ids, createdAt) ? story : null;
    const chapters = story.chapters.filter(chapter => matches(chapter, ids, createdAt) || matches(story, ids, createdAt));
    if (!chapters.length) return null;
    return { ...story, chapters };
}

function lastUpdateOf(session) {
    const last = session?.generationMeta?.lastUpdate;
    if (!last || typeof last !== 'object') return null;
    return {
        added: Math.max(0, Math.floor(Number(last.added) || 0)),
        updatedAt: Number(last.updatedAt) || 0,
        consumed: Array.isArray(last.consumedMemoryIds) ? last.consumedMemoryIds : [],
    };
}

function narrowToRound(original, filtered, added) {
    if (!Array.isArray(original) || added < 1) return filtered;
    const tail = original.slice(-added);
    if (!filtered.length) return tail;
    if (filtered.length <= added) return filtered;
    const tailIds = new Set(tail.map(item => item?.id).filter(Boolean));
    const narrowed = filtered.filter(item => tailIds.has(item?.id));
    return narrowed.length ? narrowed : tail;
}

export function incrementalProjection(session, { sourceMemoryIds = [], createdAt = 0, since = 0 } = {}) {
    if (!session || typeof session !== 'object') return { kept: false, session: null };
    const ids = new Set(Array.isArray(sourceMemoryIds) ? sourceMemoryIds : []);
    const copy = structuredClone(session);
    const last = lastUpdateOf(session);
    const sinceAt = Number(since) || 0;
    const predates = !!(last && sinceAt > 0 && last.updatedAt > 0 && last.updatedAt < sinceAt);
    const belongs = !!(last && !predates && ((sinceAt > 0 && last.updatedAt >= sinceAt) || last.consumed.some(id => ids.has(id))));
    let kept = false;
    for (const key of LIST_KEYS) {
        if (!Array.isArray(copy[key])) continue;
        if (predates || (belongs && last.added < 1)) {
            copy[key] = [];
            continue;
        }
        const original = Array.isArray(session[key]) ? session[key] : [];
        const filtered = key === 'stories'
            ? original.map(story => trimStory(story, ids, createdAt)).filter(Boolean)
            : original.filter(item => matches(item, ids, createdAt));
        copy[key] = key === 'stories' || !belongs ? filtered : narrowToRound(original, filtered, last.added);
        if (copy[key].length) kept = true;
    }
    copy.incrementalOnly = true;
    return { kept, session: copy };
}
