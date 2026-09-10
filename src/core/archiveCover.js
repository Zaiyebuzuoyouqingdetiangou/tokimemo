import * as core_text from './text.js';

// Presentation only. A verdict never becomes a historical memory or relationship authority.
export function normalizeArchiveVerdict(data, memories = []) {
    const text = typeof data?.archiveVerdict === 'string' ? data.archiveVerdict.trim() : '';
    const readings = data?.relationshipReading;
    if (Array.from(text).length < 12 || Array.from(text).length > 160 || /[<>]|\{\{|\}\}/.test(text)
        || (text.match(/[。！？!?]/g) || []).length > 3
        || !['char', 'user', 'relation'].every(key => typeof readings?.[key] === 'string' && readings[key].trim().length >= 2 && readings[key].length <= 240)) return null;
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
        if (source.length >= 12 && (source === verdict || (verdict.length >= 20
            && Array.from({ length: verdict.length - 19 }, (_, i) => verdict.slice(i, i + 20)).some(part => source.includes(part))))) return null;
    }
    return { version: 1, text, readings: Object.fromEntries(['char', 'user', 'relation'].map(key => [key, readings[key].trim()])), sources: verified };
}

export function archiveVerdictText(memory) {
    const verdict = memory?.archiveVerdict;
    if (verdict?.version !== 1) return '';
    return normalizeArchiveVerdict({ archiveVerdict: verdict.text, relationshipReading: verdict.readings,
        verdictSources: verdict.sources }, memory?.memories || [])?.text || '';
}

export function archiveCoverHtml(memory, { writable = false, busy = false } = {}) {
    const verdict = archiveVerdictText(memory);
    const oldSummary = core_text.normalizeText(memory?.archiveSummary, 1800);
    const titles = (memory?.memories || []).slice(0, 7).map(item => core_text.normalizeText(item?.title, 100)).filter(Boolean);
    return `<div class="rmt-archive-cover">
      ${verdict ? `<blockquote class="rmt-archive-verdict">${core_text.esc(verdict)}</blockquote>` : '<p class="rmt-archive-verdict-empty">这份回忆还没有写下判词。</p>'}
      ${writable ? `<button class="rmt-btn rmt-cover-rewrite" type="button" data-rmt-action="rewrite-archive-verdict" ${busy ? 'disabled' : ''}>${verdict ? '重写判词' : '写下判词'}</button>` : !verdict ? '<small>回到这份档案的聊天窗口，可单独写下判词。</small>' : ''}
      ${oldSummary || titles.length ? `<details class="rmt-archive-source-fold"><summary>查看记忆梗概与索引</summary>${oldSummary ? `<p>${core_text.esc(oldSummary)}</p>` : ''}${titles.length ? `<p>${titles.map(core_text.esc).join(' · ')}</p>` : ''}</details>` : ''}
    </div>`;
}
