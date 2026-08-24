// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_context from './context.js';

export function esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function normalizeText(value, max = 20000) {
    return String(value ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/\u0000/g, '')
        .trim()
        .slice(0, max);
}

export function isPlaceholderText(value) {
    const text = normalizeText(value, 120).replace(/\s+/g, '');
    if (!text) return true;
    return /^(?:暂无(?:数据|内容)?|待定|待补(?:全)?|未整理|整理中|内容整理中|略|省略|空白|无|none|null|n\/?a|[-—_]{2,}|[.。…?？]{2,})$/i.test(text);
}

export function expandSafeRoleMacros(value, context = core_context.getContext()) {
    const charName = normalizeText(context.name2 || '角色', 120);
    const userName = normalizeText(context.name1 || '用户', 120);
    return String(value ?? '')
        .replace(/\{\{char\}\}/gi, charName)
        .replace(/\{\{user\}\}/gi, userName)
        .replace(/\{\{([^{}\n]{1,200})\}\}/g, (_match, inner) => `｛｛${inner}｝｝`);
}

export function toastText(value, max = 800) {
    return normalizeText(value, max)
        .replace(/</g, '‹')
        .replace(/>/g, '›')
        .replace(/&/g, '＆');
}

export function cleanArray(value, maxItems = 64, maxChars = 12000) {
    if (!Array.isArray(value)) return [];
    return value
        .slice(0, maxItems)
        .map(item => normalizeText(item, maxChars))
        .filter(Boolean);
}

export function hashString(value) {
    let h = 2166136261;
    for (const ch of String(value ?? '')) {
        h ^= ch.codePointAt(0);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

export function safeId(value, fallback) {
    const raw = String(value ?? '').trim();
    const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    return cleaned || fallback;
}
