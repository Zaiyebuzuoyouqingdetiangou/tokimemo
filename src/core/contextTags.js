export const DEFAULT_EXCLUDED_TAGS = Object.freeze(['thinking', 'updatevariable', 'updatevarible']);
export function normalizeExcludedTags(value) {
    const parts = Array.isArray(value) ? value : String(value || '').split(/[\s,，]+/);
    return [...new Set(parts.map(item => String(item).trim().replace(/^<\/?|\/?\s*>$/g, '').toLowerCase())
        .filter(item => /^[\p{L}][\p{L}\p{N}\p{M}._:-]{0,63}$/u.test(item)))];
}
export function excludedTagsForContext(context) {
    const source = context?.extensionSettings?.heartbeatMemories?.excludedContextTags;
    return normalizeExcludedTags(source === undefined ? DEFAULT_EXCLUDED_TAGS : source);
}
function symbolAt(source, index) {
    const entity = source.slice(index, index + 40).match(/^&(?:amp;){0,3}(lt;|gt;|#0*60;|#0*62;|#x0*3c;|#x0*3e;)/i);
    if (!entity) return { char: source[index], length: 1 };
    return { char: /^(lt;|#0*60;|#x0*3c;)$/i.test(entity[1]) ? '<' : '>', length: entity[0].length };
}
function tagAt(source, start) {
    const opener = symbolAt(source, start);
    if (opener.char !== '<') return null;
    let index = start + opener.length;
    while (/\s/.test(source[index] || '') && index < source.length) index++;
    const closing = source[index] === '/';
    if (closing) index++;
    while (/\s/.test(source[index] || '') && index < source.length) index++;
    const nameStart = index;
    const point = at => at < source.length ? String.fromCodePoint(source.codePointAt(at)) : '';
    if (!/\p{L}/u.test(point(index))) return null;
    let nameLength = 0;
    while (/[\p{L}\p{N}\p{M}._:-]/u.test(point(index)) && nameLength < 65) { index += point(index).length; nameLength++; }
    const name = source.slice(nameStart, index).toLowerCase();
    if (nameLength > 64) return null;
    const next = symbolAt(source, index).char;
    if (next !== undefined && !/[\s/>]/.test(next)) return null;
    let quote = '', previous = '';
    for (; index < source.length;) {
        const symbol = symbolAt(source, index);
        const char = symbol.char;
        if (quote) { if (char === quote) quote = ''; }
        else if (char === '"' || char === "'") quote = char;
        else if (char === '>') return { name, closing, selfClosing: previous === '/', end: index + symbol.length };
        else if (char === '<') return { name, closing, incomplete: true, end: index };
        if (!/\s/.test(char)) previous = char;
        index += symbol.length;
    }
    return { name, closing, incomplete: true, end: source.length };
}
// Preserve original bytes outside selected blocks, including HTML entities.
// Malformed/unclosed selected openers fail closed; nesting never releases early.
export function stripExcludedTags(value, tags, onRetainedSpan = null) {
    const source = String(value || ''), excluded = new Set(normalizeExcludedTags(tags));
    if (!excluded.size) { if (source.length) onRetainedSpan?.(0, source.length); return source; }
    const stack = [];
    let out = '', cursor = 0, index = 0;
    const retain = (start, end) => {
        if (end > start) { out += source.slice(start, end); onRetainedSpan?.(start, end); }
    };
    while (index < source.length) {
        if (source[index] !== '<' && source[index] !== '&') { index++; continue; }
        const token = tagAt(source, index);
        if (!token) { index++; continue; }
        if (token.incomplete) {
            if (stack.length || (excluded.has(token.name) && !token.closing)) {
                if (!stack.length) retain(cursor, index);
                return out;
            }
            index = Math.max(index + 1, token.end);
            continue;
        }
        if (!stack.length) retain(cursor, index);
        if (stack.length) {
            if (token.closing && stack[stack.length - 1] === token.name) stack.pop();
            else if (!token.closing && !token.selfClosing) stack.push(token.name);
        } else if (excluded.has(token.name)) {
            if (!token.closing && !token.selfClosing) stack.push(token.name);
        } else retain(index, token.end);
        cursor = token.end;
        index = cursor;
    }
    if (!stack.length) retain(cursor, source.length);
    return out;
}
// Only an explicit save enables keep mode. Legacy exclusion settings are not inverted.
export function savedTagSelection(settings) {
    return settings?.contextTagMode === 'keep'
        ? { contextTagMode: 'keep', retainedContextTags: normalizeExcludedTags(settings.retainedContextTags) } : {};
}
export function tagPolicyForSettings(settings) {
    return settings?.contextTagMode === 'keep'
        ? { mode: 'keep', tags: normalizeExcludedTags(settings.retainedContextTags) }
        : normalizeExcludedTags(settings?.excludedContextTags === undefined ? DEFAULT_EXCLUDED_TAGS : settings.excludedContextTags);
}
export function tagPolicyForContext(context) {
    return tagPolicyForSettings(context?.extensionSettings?.heartbeatMemories);
}
// Resolve the complement from the actual source, including tags absent from the UI
// scan. Reuse the original isolator: an unselected outer block includes its children.
// Plain text outside tags is never discarded and source strings are never mutated.
export function filterContextTags(value, policy, onRetainedSpan = null) {
    if (policy?.mode !== 'keep') return stripExcludedTags(value, policy, onRetainedSpan);
    const source = String(value || ''), retained = new Set(normalizeExcludedTags(policy.tags)), excluded = new Set();
    for (let index = 0; index < source.length; index++) {
        if (source[index] !== '<' && source[index] !== '&') continue;
        const token = tagAt(source, index);
        if (!token) continue;
        if (!retained.has(token.name)) excluded.add(token.name);
        index = Math.max(index, token.end - 1);
    }
    return stripExcludedTags(source, [...excluded], onRetainedSpan);
}
// Filter whole original records before splitting, while keeping each original
// fragment position (and therefore its evidence ID). A tag spanning fragments
// must not leak its middle as apparently untagged text. This is a read projection;
// original ledger bytes and the isolator's nesting/escaping rules stay unchanged.
export function filterContextTagSegments(value, policy, size) {
    const source = String(value || '');
    if (!Number.isSafeInteger(size) || size < 1) throw new TypeError('Invalid fragment size');
    const segments = Array.from({ length: Math.ceil(source.length / size) }, () => '');
    filterContextTags(source, policy, (start, end) => {
        while (start < end) {
            const part = Math.floor(start / size), stop = Math.min(end, (part + 1) * size);
            segments[part] += source.slice(start, stop); start = stop;
        }
    });
    return segments;
}
// Explicit UI scan only. Complete chat, no silent 32/100-tag truncation, with
// cooperative yielding and a caller-owned scope/lifecycle guard. No model or I/O.
export async function scanContextTagChoices(messages, { assertCurrent = () => {} } = {}) {
    const counts = new Map(); let usedMessages = 0, usedChars = 0, nextYield = Date.now() + 12;
    for (const message of Array.isArray(messages) ? messages : []) {
        assertCurrent();
        const source = String(message?.mes || ''); usedMessages++; usedChars += source.length;
        for (let index = 0; index < source.length; index++) {
            if ((index & 4095) === 0 && Date.now() >= nextYield) {
                await new Promise(resolve => setTimeout(resolve, 0)); assertCurrent(); nextYield = Date.now() + 12;
            }
            if (source[index] !== '<' && source[index] !== '&') continue;
            const token = tagAt(source, index);
            if (!token) continue;
            if (!token.closing) counts.set(token.name, (counts.get(token.name) || 0) + 1);
            index = Math.max(index, token.end - 1);
        }
        if (Date.now() >= nextYield) {
            await new Promise(resolve => setTimeout(resolve, 0)); assertCurrent(); nextYield = Date.now() + 12;
        }
    }
    assertCurrent();
    return { tags: [...counts].map(([name, count]) => ({ name, count })), usedMessages, usedChars, bounded: false };
}
// Only JSON string VALUES are filtered; property names and surrounding task
// schema remain intact, including when a source string has an unclosed tag.
export function filterJsonPromptStrings(prompt, tags) {
    const source = String(prompt || '');
    return source.replace(/"(?:\\.|[^"\\])*"/g, (literal, offset) => {
        if (/^\s*:/.test(source.slice(offset + literal.length, offset + literal.length + 80))) return literal;
        try { return JSON.stringify(filterContextTags(JSON.parse(literal), tags)); } catch { return literal; }
    });
}
export function scanContextTags(messages, maxChars = 256000) {
    let remaining = Math.max(0, Math.min(256000, maxChars)), used = 0;
    const counts = new Map();
    for (const message of (Array.isArray(messages) ? messages : []).slice(-500)) {
        const text = String(message?.mes || '').slice(0, remaining);
        remaining -= text.length; used++;
        for (let index = 0; index < text.length; index++) {
            if (text[index] !== '<' && text[index] !== '&') continue;
            const token = tagAt(text, index);
            if (!token) continue;
            if (!token.closing && (counts.has(token.name) || counts.size < 100)) counts.set(token.name, (counts.get(token.name) || 0) + 1);
            index = Math.max(index, token.end - 1);
        }
        if (!remaining) break;
    }
    return { tags: [...counts].map(([name, count]) => ({ name, count })), usedMessages: used, bounded: true };
}
