import * as core_text from './text.js';

export const ARCHIVE_INTRO_STYLES = Object.freeze({
    'light-novel': '日式轻小说', 'classical-affinity': '古典情缘', imagery: '易象取意',
    psychological: '细腻心理', epistolary: '书信叙事', 'urban-noir': '都市悬疑',
    'quiet-life': '生活散文', 'coming-of-age': '青春成长', fable: '寓言童话',
});

// Same presentation-only field and write path. Legacy reading is a local option;
// a model-supplied version must never downgrade the new introduction contract.
export function normalizeArchiveVerdict(data, memories = [], { legacy = false } = {}) {
    const text = typeof data?.archiveVerdict === 'string' ? data.archiveVerdict.trim() : '';
    const readings = data?.relationshipReading;
    const readingKeys = legacy ? ['char', 'user', 'relation'] : ['char', 'user', 'relation', 'tension', 'direction'];
    const length = Array.from(text).length;
    if (length < (legacy ? 12 : 80) || length > (legacy ? 160 : 900) || /[<>]|\{\{|\}\}/.test(text)
        || (legacy ? (text.match(/[。！？!?]/g) || []).length > 3 : text.split(/\n\s*\n/).length > 3)
        || (!legacy && !Object.hasOwn(ARCHIVE_INTRO_STYLES, data?.verdictStyle || ''))
        || !readingKeys.every(key => typeof readings?.[key] === 'string' && readings[key].trim().length >= 2 && readings[key].length <= 240)) return null;
    const sources = Array.isArray(data?.verdictSources) ? data.verdictSources : [];
    if (!sources.length || sources.length > 6) return null;
    const byId = new Map(memories.map(memory => [memory.id, memory]));
    const verified = [];
    for (const source of sources) {
        const memory = byId.get(source?.memoryId);
        const anchor = typeof source?.anchor === 'string' ? source.anchor.trim() : '';
        if (!memory || anchor.length < 2 || anchor.length > 100
            || ![memory.title, ...(Array.isArray(memory.anchors) ? memory.anchors : [])].includes(anchor)) return null;
        verified.push({ memoryId: memory.id, anchor });
    }
    const compact = value => String(value || '').replace(/[\s\p{P}\p{S}]/gu, '');
    const verdict = compact(text);
    // Do not disguise a copied source paragraph as a new verdict (including tiny summaries).
    for (const memory of memories) {
        const source = compact(memory.summary);
        if (source.length >= 12 && (source === verdict || (legacy && verdict.length >= 20
            && Array.from({ length: verdict.length - 19 }, (_, i) => verdict.slice(i, i + 20)).some(part => source.includes(part)))
            || (!legacy && source.length >= 40 && verdict.includes(source)))) return null;
    }
    if (!legacy) {
        const sourceText = memories.map(memory => compact(memory.summary)).join('\n');
        let copied = 0;
        for (let i = 0; i + 12 <= verdict.length; i++) if (sourceText.includes(verdict.slice(i, i + 12))) copied++;
        if (copied / Math.max(1, verdict.length - 11) > 0.6) return null;
    }
    return { version: legacy ? 1 : 2, text, ...(!legacy ? { style: data.verdictStyle } : {}),
        readings: Object.fromEntries(readingKeys.map(key => [key, readings[key].trim()])), sources: verified };
}

export function archiveVerdictText(memory) {
    const verdict = memory?.archiveVerdict;
    if (![1, 2].includes(verdict?.version)) return '';
    return normalizeArchiveVerdict({ archiveVerdict: verdict.text, relationshipReading: verdict.readings,
        verdictStyle: verdict.style, verdictSources: verdict.sources }, memory?.memories || [], { legacy: verdict.version === 1 })?.text || '';
}

export function archiveCoverHtml(memory, { writable = false, busy = false } = {}) {
    const verdict = archiveVerdictText(memory);
    const oldSummary = core_text.normalizeText(memory?.archiveSummary, 1800);
    const titles = (memory?.memories || []).slice(0, 7).map(item => core_text.normalizeText(item?.title, 100)).filter(Boolean);
    return `<div class="rmt-archive-cover">
      ${verdict ? `<div class="rmt-archive-verdict">${verdict.split(/\n\s*\n/).map(paragraph => `<p>${core_text.esc(paragraph)}</p>`).join('')}</div>` : '<p class="rmt-archive-verdict-empty">尚未写下档案简介。</p>'}
      ${writable ? `<button class="rmt-btn rmt-cover-rewrite" type="button" data-rmt-action="rewrite-archive-verdict" ${busy ? 'disabled' : ''}>${verdict ? '重写简介' : '写下简介'}</button>` : !verdict ? '<small>回到这份档案的聊天窗口，可单独写下简介。</small>' : ''}
      ${oldSummary || titles.length ? `<details class="rmt-archive-source-fold"><summary>查看记忆梗概与索引</summary>${oldSummary ? `<p>${core_text.esc(oldSummary)}</p>` : ''}${titles.length ? `<p>${titles.map(core_text.esc).join(' · ')}</p>` : ''}</details>` : ''}
    </div>`;
}
