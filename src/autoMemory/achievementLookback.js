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

function blockedSource(kind) {
    return kind === 'external' || kind === 'inherited' || kind.startsWith('external') || kind.startsWith('inherited');
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

export function achievementLookback(entry, memories = [], coveredRanges = []) {
    const ids = (Array.isArray(entry?.sourceMemoryIds) ? entry.sourceMemoryIds : []).filter(id => MEMORY_ID.test(id));
    const bank = new Map((Array.isArray(memories) ? memories : []).filter(item => MEMORY_ID.test(item?.id)).map(item => [item.id, item]));
    const linked = ids.map(id => bank.get(id)).filter(Boolean);
    const kind = linked.length && entry?.kind !== 'collection' ? 'historical' : 'collection';
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
    const canJump = kind === 'historical' && blocked.length === 0 && floors.length > 0;
    let sourceNote = '';
    if (blocked.length) sourceNote = '这份成就来自外部或继承的记录，没有可以回到的聊天楼层。';
    else if (kind === 'historical' && !floors.length) sourceNote = '档案里有这段经历，但没有对应的楼层编号。';
    return {
        kind,
        period: dates[0] || '',
        summary,
        floors: canJump ? floors : [],
        jumpFloor: canJump ? floors[0] : null,
        sourceNote,
        moduleId: clean(entry?.moduleId, 40),
    };
}
