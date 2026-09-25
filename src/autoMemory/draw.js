// 抽签候选与权重。不读聊天，不发请求。
// 近期命中只降权，不永久排除。长期没抽中才加权重。

export function eligibleDrawIds(modules, { preferredModuleIds = [], excludedModuleIds = [], satisfiedPrerequisiteIds = [] } = {}) {
    const excluded = new Set(Array.isArray(excludedModuleIds) ? excludedModuleIds : []);
    const satisfied = new Set(Array.isArray(satisfiedPrerequisiteIds) ? satisfiedPrerequisiteIds : []);
    const byId = new Map((Array.isArray(modules) ? modules : []).map(item => [item?.id, item]));
    const seen = new Set();
    const selected = [];
    for (const id of Array.isArray(preferredModuleIds) ? preferredModuleIds : []) {
        const item = byId.get(id);
        if (!item || seen.has(id) || excluded.has(id)) continue;
        if (item.inDrawPool !== true || item.autoEligible !== true || item.achievementMerged !== true) continue;
        const needs = Array.isArray(item.prerequisites) ? item.prerequisites : [];
        if (needs.some(need => !satisfied.has(need))) continue;
        seen.add(id);
        selected.push(id);
    }
    return selected;
}

export function weightCandidates(ids, tickets = []) {
    const history = Array.isArray(tickets) ? tickets : [];
    const recent = history.slice(-3);
    return (Array.isArray(ids) ? ids : []).map(id => {
        const recentHits = recent.filter(ticket => ticket?.selectedModuleId === id).length;
        const eligible = history.filter(ticket => (Array.isArray(ticket?.candidates) ? ticket.candidates : []).some(item => item?.id === id));
        const misses = eligible.filter(ticket => ticket?.selectedModuleId !== id).length;
        const weight = Math.max(1, Math.floor(100 / (1 + recentHits))) + Math.min(misses, 20) * 25;
        return { id, weight };
    });
}

export function pickWeighted(weighted, random) {
    const rows = Array.isArray(weighted) ? weighted.filter(item => item && item.weight > 0) : [];
    const total = rows.reduce((sum, item) => sum + item.weight, 0);
    if (!rows.length || total < 1) return '';
    const roll = typeof random === 'function' ? Number(random()) : Number(random);
    const unit = Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 0.999999999999) : 0;
    let cursor = Math.floor(unit * total);
    if (cursor >= total) cursor = total - 1;
    for (const item of rows) {
        if (cursor < item.weight) return item.id;
        cursor -= item.weight;
    }
    return rows[rows.length - 1].id;
}

export function newMemoryIds(before, after) {
    const seen = new Set(Array.isArray(before) ? before : []);
    const out = [];
    for (const id of Array.isArray(after) ? after : []) {
        if (typeof id !== 'string' || !/^M\d{3,6}$/.test(id) || seen.has(id) || out.includes(id)) continue;
        out.push(id);
    }
    return out;
}

// 增量建档沿用现有导入。聊天和外部摘要按各自的分段上限拆开，这里不改成单次请求。
export function incrementalImportOptions() {
    return { automatic: true };
}
