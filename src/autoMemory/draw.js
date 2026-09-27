// 抽签候选与权重。不读聊天，不发请求。
// 近期命中只降权，不永久排除。长期没抽中才加权重。

function drawable(item, excluded, satisfied) {
    if (!item?.id || excluded.has(item.id)) return false;
    if (item.inDrawPool !== true || item.autoEligible !== true || item.achievementMerged !== true) return false;
    const needs = Array.isArray(item.prerequisites) ? item.prerequisites : [];
    return !needs.some(need => !satisfied.has(need));
}

// 到点后的抽签池：没生成过的模块留在池里，当作第一次生成。只有用户排除的模块拿掉。
export function roundCandidateIds(modules, { excludedModuleIds = [], satisfiedPrerequisiteIds = [] } = {}) {
    const excluded = new Set(Array.isArray(excludedModuleIds) ? excludedModuleIds : []);
    const satisfied = new Set(Array.isArray(satisfiedPrerequisiteIds) ? satisfiedPrerequisiteIds : []);
    const seen = new Set();
    const selected = [];
    for (const item of Array.isArray(modules) ? modules : []) {
        if (!drawable(item, excluded, satisfied) || seen.has(item.id)) continue;
        seen.add(item.id);
        selected.push(item.id);
    }
    return selected;
}

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

// r84.173：「很久没抽到」的加权只从它上次被抽中之后开始算。以前不清零，抽中过的模块仍带着旧的加权，容易连着被抽到。
export function weightCandidates(ids, tickets = []) {
    const history = Array.isArray(tickets) ? tickets : [];
    const list = Array.isArray(ids) ? ids : [];
    const recent = history.slice(-3);
    const picks = history.map(ticket => ticket?.selectedModuleId || '');
    return list.map(id => {
        const recentHits = recent.filter(ticket => ticket?.selectedModuleId === id).length;
        const since = history.slice(picks.lastIndexOf(id) + 1);
        const eligible = since.filter(ticket => (Array.isArray(ticket?.candidates) ? ticket.candidates : []).some(item => item?.id === id));
        const misses = eligible.filter(ticket => ticket?.selectedModuleId !== id).length;
        const weight = Math.max(1, Math.floor(100 / (1 + recentHits))) + Math.min(misses, 20) * 25;
        return { id, weight };
    });
}

// r84.173：冷却。上一轮刚抽到的模块，这一轮不参与抽签；只剩它一个候选时照常抽。
// 抽签记录里仍保存完整候选和权重（权重必须 ≥1），冷却只影响这一轮从谁里面抽。
export function cooledCandidates(weighted, tickets = []) {
    const rows = Array.isArray(weighted) ? weighted : [];
    const history = Array.isArray(tickets) ? tickets : [];
    const last = [...history].reverse().find(ticket => ticket?.selectedModuleId)?.selectedModuleId || '';
    const rest = rows.filter(item => item?.id !== last);
    return last && rest.length ? rest : rows;
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

// 到点后只把这一窗楼层交给现有导入。分段上限仍由导入自己拆，这里不改成单次请求。
export function incrementalImportOptions(window = null) {
    const options = { automatic: true };
    const start = Math.floor(Number(window?.start));
    const end = Math.floor(Number(window?.end));
    if (start >= 1 && end >= start) options.floorWindow = { start, end };
    return options;
}
