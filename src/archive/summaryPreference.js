// 到点建档时，记忆插件已经写出的新摘要优先于再读一遍正文。

const PLUGIN_SUMMARY_SOURCE_IDS = new Set(['sillytavern-memory', 'baibai-book-public-api', 'qianqianjie-public-api']);

export function pluginSummaryCount(external) {
    let count = 0;
    for (const source of Array.isArray(external?.sources) ? external.sources : []) {
        if (!PLUGIN_SUMMARY_SOURCE_IDS.has(source?.id)) continue;
        const value = Math.floor(Number(source?.count) || 0);
        if (value > 0) count += value;
    }
    if (count) return count;
    return (Array.isArray(external?.records) ? external.records : []).filter(item => PLUGIN_SUMMARY_SOURCE_IDS.has(item?.provider) || item?.type === 'summary').length;
}

// summary：这一轮把插件摘要写入档案。floors：摘要没有更新，改读这一窗正文。
export function archiveSourceForDue({ summaryChanged = false, summaryCount = 0 } = {}) {
    if (summaryChanged === true && summaryCount > 0) return 'summary';
    return 'floors';
}

function namedFloors(record) {
    const floors = [];
    const single = [record?.messageStart, record?.messageEnd, record?.msgIndex, record?.floor, record?.messageIndex];
    const start = Math.floor(Number(record?.messageStart ?? record?.msgIndex ?? record?.floor ?? record?.messageIndex));
    const end = Math.floor(Number(record?.messageEnd ?? record?.msgIndex ?? record?.floor ?? record?.messageIndex));
    if (Number.isSafeInteger(start) && start >= 1 && Number.isSafeInteger(end) && end >= start && end - start <= 400) {
        for (let floor = start; floor <= end; floor += 1) floors.push(floor);
        return floors;
    }
    for (const value of single) {
        const floor = Math.floor(Number(value));
        if (Number.isSafeInteger(floor) && floor >= 1) floors.push(floor);
    }
    return floors;
}

// 摘要写明了楼号时，只补没被点名的楼，正文不截断。摘要没有楼号时，这一窗正文整段附上。
export function uncoveredWindowMessages(messages, records = []) {
    const rows = Array.isArray(messages) ? messages : [];
    const named = new Set();
    for (const record of Array.isArray(records) ? records : []) {
        for (const floor of namedFloors(record)) named.add(floor);
    }
    if (!named.size) return rows.map(item => ({ ...item }));
    return rows.filter(item => !named.has(Math.floor(Number(item?.index)))).map(item => ({ ...item }));
}
