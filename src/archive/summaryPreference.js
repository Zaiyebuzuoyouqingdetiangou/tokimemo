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
