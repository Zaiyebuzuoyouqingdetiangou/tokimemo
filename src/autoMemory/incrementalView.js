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

export function incrementalProjection(session, { sourceMemoryIds = [], createdAt = 0 } = {}) {
    if (!session || typeof session !== 'object') return { kept: false, session: null };
    const ids = new Set(Array.isArray(sourceMemoryIds) ? sourceMemoryIds : []);
    const copy = structuredClone(session);
    let kept = false;
    for (const key of LIST_KEYS) {
        if (!Array.isArray(copy[key])) continue;
        copy[key] = key === 'stories'
            ? copy[key].map(story => trimStory(story, ids, createdAt)).filter(Boolean)
            : copy[key].filter(item => matches(item, ids, createdAt));
        if (copy[key].length) kept = true;
    }
    copy.incrementalOnly = true;
    return { kept, session: copy };
}
