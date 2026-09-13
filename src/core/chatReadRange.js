// Pure selection over original host floors. No chat/storage mutation or provider work.
import * as core_text from './text.js';

export const DEFAULT_CHAT_READ_RANGE = Object.freeze({ mode: 'recent', recent: 50, start: 1, end: 100, includeHidden: false });

function positiveFloor(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 1 ? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number)) : fallback;
}

export function normalizeChatReadRange(settingsOrRange = {}) {
    const value = settingsOrRange?.chatReadRange ?? settingsOrRange ?? {};
    return {
        mode: ['recent', 'range', 'all'].includes(value.mode) ? value.mode : 'recent',
        recent: positiveFloor(value.recent, 50),
        start: positiveFloor(value.start, 1),
        end: positiveFloor(value.end, 100),
        includeHidden: value.includeHidden === true,
    };
}

function floorWindow(totalFloors, range) {
    if (!totalFloors) return { start: 0, end: 0 };
    const start = range.mode === 'range' ? range.start : range.mode === 'recent' ? Math.max(1, totalFloors - range.recent + 1) : 1;
    const end = range.mode === 'range' ? Math.min(totalFloors, range.end) : totalFloors;
    // Do not reorder a reversed interval or expand an out-of-bounds selection.
    return start > end ? { start: 0, end: 0 } : { start, end };
}

export function isChatReadRangeHidden(message) {
    return !!message?.is_system || message?.is_hidden === true || message?.extra?.is_hidden === true;
}

export function isChatReadRangeDialogue(message, context) {
    if (!message || typeof message !== 'object' || ['system', 'tool', 'developer'].includes(message.role)
        || message.extra?.uses_system_ui || message.extra?.tool_invocations) return false;
    if (!isChatReadRangeHidden(message)) return true;
    // Host hide toggles are not authority to recover an arbitrary system floor.
    if (typeof message.is_user !== 'boolean' || message.extra?.type) return false;
    const name = core_text.normalizeText(message.name, 120);
    const expected = core_text.normalizeText(message.is_user ? context?.name1 : context?.name2, 120);
    return !!name && !!expected && name === expected;
}

function selection(context, settings) {
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const range = normalizeChatReadRange(settings);
    const { start, end } = floorWindow(chat.length, range);
    const rows = [];
    let visibleCount = 0, hiddenCount = 0, characters = 0;
    if (start) for (let index = start; index <= end; index += 1) {
        const message = chat[index - 1];
        if (!isChatReadRangeDialogue(message, context)) continue;
        const text = core_text.normalizeText(message.mes, 8000);
        if (!text) continue;
        const hidden = isChatReadRangeHidden(message);
        if (hidden) hiddenCount += 1;
        else visibleCount += 1;
        if (hidden && !range.includeHidden) continue;
        rows.push({ index, message, hidden });
        characters += text.length;
    }
    const modeLabel = range.mode === 'all' ? '全部楼层' : range.mode === 'recent' ? `最近 ${range.recent} 楼` : '指定范围';
    const boundsLabel = start ? `第 ${start}–${end} 楼` : '无匹配楼层';
    return { rows, preview: {
        totalFloors: chat.length, selectedFloors: rows.length, visibleCount, hiddenCount, characters, start, end,
        label: `${modeLabel} · ${boundsLabel} · 读取 ${rows.length} 条正文 · ${range.includeHidden ? '含隐藏对话' : '不含隐藏对话'}`,
    } };
}

// Each index remains the 1-based host floor, including gaps left by excluded messages.
export function selectChatReadRange(context, settings = {}) {
    return selection(context, settings).rows;
}

// hiddenCount counts eligible hidden dialogue inside the interval, even when excluded.
// characters estimates normalized per-floor text before downstream tag/budget filtering.
export function readRangePreview(context, settings = {}) {
    return selection(context, settings).preview;
}
