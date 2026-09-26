// 成就回看只使用档案里已经写下的记忆和覆盖范围。时期、楼层都不采用模型自己报的数字。

const MEMORY_ID = /^M\d{3,6}$/;

function clean(value, max) {
    return String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
}

function floorsBetween(start, end) {
    const first = Math.floor(Number(start));
    const last = Math.floor(Number(end));
    if (!Number.isSafeInteger(first) || first < 1 || !Number.isSafeInteger(last) || last < first) return [];
    const rows = [];
    const stop = Math.min(last, first + 39);
    for (let floor = first; floor <= stop; floor += 1) rows.push(floor);
    return rows;
}

function sourceKind(memory) {
    return clean(memory?.sourceKind, 40).toLowerCase() || 'chat';
}

function inheritedSource(kind) {
    return kind === 'inherited' || kind.startsWith('inherited');
}

function externalAway(kind) {
    return kind === 'external' || (kind.startsWith('external') && kind !== 'external-current-chat');
}

function blockedSource(kind) {
    return inheritedSource(kind) || externalAway(kind);
}

function safeMesid(value) {
    const index = Math.floor(Number(value));
    return Number.isSafeInteger(index) && index >= 0 ? index : null;
}

export function autoLetterMesid(entry, { snapshot = null, chat = [], latestFloor = false, locate = null } = {}) {
    const stored = safeMesid(entry?.messageIndex);
    if (stored != null) return stored;
    if (entry?.origin !== 'auto' || typeof locate !== 'function') return null;
    const ids = new Set((Array.isArray(entry?.sourceMemoryIds) ? entry.sourceMemoryIds : []).filter(id => MEMORY_ID.test(id)));
    const tickets = Array.isArray(snapshot?.drawTickets) ? snapshot.drawTickets : [];
    const ticket = [...tickets].reverse().find(item => {
        if (entry?.moduleId && item?.selectedModuleId && item.selectedModuleId !== entry.moduleId) return false;
        const own = Array.isArray(item?.sourceMemoryIds) ? item.sourceMemoryIds : [];
        return own.some(id => ids.has(id));
    }) || [...tickets].reverse().find(item => entry?.moduleId && item?.selectedModuleId === entry.moduleId);
    if (!ticket) return null;
    const located = typeof locate === 'function' ? locate(chat, ticket.dueFloor, latestFloor === true) : null;
    if (located) return safeMesid(located.index);
    if (latestFloor !== true) {
        const index = Math.floor(Number(ticket.dueFloor)) - 1;
        return index >= 0 ? index : null;
    }
    return null;
}

function covered(ranges) {
    return (Array.isArray(ranges) ? ranges : []).map(row => ({
        start: Math.floor(Number(row?.start)),
        end: Math.floor(Number(row?.end)),
    })).filter(row => row.start >= 1 && row.end >= row.start);
}

function floorIsCovered(floor, ranges) {
    return ranges.some(row => floor >= row.start && floor <= row.end);
}

export function achievementLookback(entry, memories = [], coveredRanges = [], extra = {}) {
    const ids = (Array.isArray(entry?.sourceMemoryIds) ? entry.sourceMemoryIds : []).filter(id => MEMORY_ID.test(id));
    const bank = new Map((Array.isArray(memories) ? memories : []).filter(item => MEMORY_ID.test(item?.id)).map(item => [item.id, item]));
    const linked = ids.map(id => bank.get(id)).filter(Boolean);
    const letterMesid = safeMesid(extra.messageIndex ?? entry?.messageIndex);
    const kind = (linked.length && entry?.kind !== 'collection') || letterMesid != null ? 'historical' : 'collection';
    const blocked = linked.filter(item => blockedSource(sourceKind(item)));
    const chat = linked.filter(item => !blockedSource(sourceKind(item)));
    const ledger = covered(coveredRanges);
    const floors = [];
    for (const item of chat) {
        for (const floor of floorsBetween(item.messageStart, item.messageEnd)) {
            if (ledger.length && !floorIsCovered(floor, ledger)) continue;
            if (!floors.includes(floor)) floors.push(floor);
        }
    }
    floors.sort((a, b) => a - b);
    const dates = [...new Set(linked.map(item => clean(item.date, 40)).filter(date => date && date !== '未标注'))];
    const summary = linked.map(item => clean(item.summary, 120)).find(Boolean) || '';
    const auto = entry?.origin === 'auto';
    const canJump = auto ? letterMesid != null : (floors.length > 0 || letterMesid != null);
    let sourceNote = '';
    if (!canJump && blocked.length) sourceNote = '这份成就来自外部或继承的记录，没有可以回到的聊天楼层。';
    else if (!canJump && kind === 'historical' && !auto) sourceNote = '档案里有这段经历，但没有对应的楼层编号。';
    return {
        kind,
        period: dates[0] || '',
        summary,
        floors: auto ? [] : (floors.length ? floors : []),
        jumpFloor: auto ? null : (floors[0] ?? null),
        jumpMesid: letterMesid,
        sourceNote,
        moduleId: clean(entry?.moduleId, 40),
    };
}

export function autoLetterOrphaned(entry, chat, extra = {}) {
    if (entry?.origin !== 'auto') return false;
    const mesid = safeMesid(extra.messageIndex ?? entry?.messageIndex);
    if (mesid == null) return false;
    const index = mesid;
    const list = Array.isArray(chat) ? chat : [];
    if (index >= list.length) return true;
    const message = list[index];
    if (!message) return true;
    const text = String(message?.mes ?? '').trim();
    return !text || /^[.。…．]{1,12}$/.test(text);
}
