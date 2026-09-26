import * as output_budget from '../core/outputBudget.js';
// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_constants from '../core/constants.js';
import * as core_text from '../core/text.js';

export function jsonOutputError(code, message, details = {}) {
    const error = new Error(message);
    error.name = 'JsonOutputError';
    error.code = code;
    error.safeToDisplay = true;
    error.safeUserMessage = message;
    error.retryableJson = true;
    error.details = details;
    return error;
}

export function extractBalancedJsonObjects(text) {
    const candidates = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') {
            if (depth > 0) inString = true;
            continue;
        }
        if (char === '{') {
            if (depth === 0) start = i;
            depth += 1;
            continue;
        }
        if (char === '}' && depth > 0) {
            depth -= 1;
            if (depth === 0 && start >= 0) {
                candidates.push(text.slice(start, i + 1));
                start = -1;
            }
        }
    }
    return { candidates, hasUnclosedObject: depth > 0 && start >= 0 };
}

// Read only values actually present in a JSON prefix. Unlike a JSON repairer,
// this never adds a quote/bracket, finishes a scalar, or invents a missing key.
// A partial object can expose closed child fields; arrays expose closed items
// only. JSON Pointer paths refer to their positions in the original response.
export function parsePartialJsonObject(raw) {
    const nodes = new Map();
    let text = typeof raw === 'string' ? raw.replace(/^\uFEFF/, '').trimStart() : '';
    text = text.replace(/^```(?:json)?[ \t]*(?:\r?\n)?/i, '').trimStart();
    const start = text.indexOf('{');
    if (start >= 0) text = text.slice(start);
    let cursor = 0;
    const whitespace = () => { while (/\s/.test(text[cursor] || '') && cursor < text.length) cursor++; };
    const escapedKey = key => String(key).replace(/~/g, '~0').replace(/\//g, '~1');
    const forget = pointer => { for (const key of nodes.keys()) if (key === pointer || key.startsWith(pointer + '/')) nodes.delete(key); };
    const stringToken = () => {
        const from = cursor++;
        let escaped = false;
        while (cursor < text.length) {
            const char = text[cursor++];
            if (escaped) { escaped = false; continue; }
            if (char === '\\') { escaped = true; continue; }
            if (char === '"') {
                try { return { complete: true, value: JSON.parse(text.slice(from, cursor)) }; } catch { return null; }
            }
        }
        return { complete: false };
    };
    const valueAt = pointer => {
        whitespace();
        const char = text[cursor];
        if (!char) return null;
        if (char === '{' || char === '[') {
            const array = char === '[', node = { type: array ? 'array' : 'object', value: array ? [] : {}, complete: false, children: [] };
            nodes.set(pointer, node); cursor++; whitespace();
            const closing = array ? ']' : '}';
            if (text[cursor] === closing) { cursor++; node.complete = true; return node; }
            let index = 0;
            while (cursor < text.length) {
                whitespace();
                let key = index;
                if (!array) {
                    if (text[cursor] !== '"') break;
                    const token = stringToken();
                    if (!token?.complete) break;
                    key = token.value; whitespace();
                    if (text[cursor] !== ':') break;
                    cursor++;
                }
                const path = pointer + '/' + escapedKey(key);
                forget(path);
                if (!array) delete node.value[key];
                const child = valueAt(path);
                if (!child) break;
                node.children.push({ path, node: child });
                if (array) {
                    if (child.complete) node.value.push(child.value);
                } else if (child.complete || child.type === 'object' || child.type === 'array') {
                    Object.defineProperty(node.value, key, { value: child.value, enumerable: true, configurable: true, writable: true });
                }
                if (!child.complete) break;
                whitespace();
                if (text[cursor] === closing) { cursor++; node.complete = true; break; }
                if (text[cursor] !== ',') break;
                cursor++; index++;
                // A trailing comma is not a closed item or a valid container.
                whitespace(); if (text[cursor] === closing) break;
            }
            return node;
        }
        let token;
        if (char === '"') token = stringToken();
        else {
            const rest = text.slice(cursor), literal = /^(?:true|false|null)/.exec(rest);
            if (literal) {
                const end = cursor + literal[0].length;
                if (end < text.length && !/[\s,}\]]/.test(text[end])) return null;
                cursor = end; token = { complete: true, value: JSON.parse(literal[0]) };
            } else {
                const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
                if (!number) return null;
                const end = cursor + number[0].length;
                // At EOF a number may still be receiving digits/exponent text.
                if (end === text.length || !/[\s,}\]]/.test(text[end])) return null;
                cursor = end; token = { complete: true, value: JSON.parse(number[0]) };
            }
        }
        if (!token?.complete) return null;
        const node = { type: 'scalar', complete: true, value: token.value };
        nodes.set(pointer, node); return node;
    };
    let root = null;
    try { if (start >= 0 && text[0] === '{') root = valueAt(''); } catch { nodes.clear(); }
    const clone = value => structuredClone(value);
    const skeleton = node => {
        if (node.type === 'scalar') return clone(node.value);
        if (node.type === 'array') return node.children.filter(child => child.node.complete || child.node.type !== 'scalar').map(child => skeleton(child.node));
        const result = {};
        for (const child of node.children) {
            if (nodes.get(child.path) !== child.node) continue;
            const key = child.path.slice(child.path.lastIndexOf('/') + 1).replace(/~1/g, '/').replace(/~0/g, '~');
            Object.defineProperty(result, key, { value: skeleton(child.node), enumerable: true, configurable: true, writable: true });
        }
        return result;
    };
    return {
        value: root?.type === 'object' ? clone(root.value) : null,
        partialValue: root?.type === 'object' ? skeleton(root) : null,
        complete: root?.type === 'object' && root.complete === true,
        has: pointer => typeof pointer === 'string' && nodes.get(pointer)?.complete === true,
        at: pointer => typeof pointer === 'string' && nodes.has(pointer) ? skeleton(nodes.get(pointer)) : undefined,
        items: pointer => {
            const node = typeof pointer === 'string' && nodes.get(pointer);
            return node?.type === 'array' ? node.children.filter(child => child.node.complete).map(child => clone(child.node.value)) : [];
        },
    };
}

const INBOX_SLOT = /"slot"\s*:\s*"(?:daily|stage)"/;

function looksLikeInboxPayload(text) {
    return /"letters"\s*:/.test(text) && INBOX_SLOT.test(text);
}

function usableInboxLetter(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const slot = value.slot === 'daily' || value.slot === 'stage' ? value.slot : '';
    if (!slot || typeof value.title !== 'string' || !value.title.trim()
        || typeof value.body !== 'string' || !value.body.trim()) return null;
    const letter = {
        slot,
        title: value.title,
        greeting: typeof value.greeting === 'string' ? value.greeting : '',
        body: value.body,
        closing: typeof value.closing === 'string' ? value.closing : '',
    };
    if (value.letterIllustration && typeof value.letterIllustration === 'object' && !Array.isArray(value.letterIllustration)) {
        letter.letterIllustration = value.letterIllustration;
    }
    return letter;
}

function collectInboxLetters(value, letters, seen) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.letters)) {
        for (const item of value.letters) collectInboxLetters(item, letters, seen);
    }
    const letter = usableInboxLetter(value);
    if (!letter) return;
    const key = `${letter.slot}\u001f${letter.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    letters.push(letter);
}

// Inbox-only. Reads already-closed letter fields from a broken reply.
// Does not invent quotes, commas, or missing title/body text.
export function salvageInboxLetters(raw) {
    const text = typeof raw === 'string' ? raw : '';
    if (!looksLikeInboxPayload(text)) return null;
    const letters = [];
    const seen = new Set();
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') { inString = true; continue; }
        if (char !== '{') continue;
        const peek = text.slice(i, i + 160);
        if (!/"letters"\s*:/.test(peek) && !INBOX_SLOT.test(peek)) continue;
        collectInboxLetters(parsePartialJsonObject(text.slice(i)).partialValue, letters, seen);
    }
    return letters.length ? { letters } : null;
}

export function jsonOutputBudgetSummary({ requestMaxTokens = 0, configuredMaxTokens = 0 } = {}) {
    const requestMax = Math.max(0, Math.floor(Number(requestMaxTokens) || 0));
    const configuredMax = output_budget.normalizeOutputTokens(configuredMaxTokens);
    const actual = requestMax || configuredMax;
    const segmentNote = actual < configuredMax
        ? `本段实际请求上限 ${actual.toLocaleString()} tokens（该功能使用较小的分段上限）`
        : `本段实际请求上限 ${actual.toLocaleString()} tokens`;
    return `${segmentNote}；当前插件设置 ${configuredMax.toLocaleString()} tokens；实际可用额度由所选模型／渠道决定。`;
}

export function extractJson(raw, { reasoning = '', requestMaxTokens = 0, configuredMaxTokens = 0 } = {}) {
    if (raw != null && typeof raw !== 'string') {
        const error = jsonOutputError('RMT_RESPONSE_FORMAT', '连接返回的正文结构暂不支持，未取得可解析的最终正文；旧内容未改变。');
        error.retryable = false;
        error.retryableJson = false;
        throw error;
    }
    let text = core_text.normalizeText(raw, core_constants.MAX_GENERATION_OUTPUT_CHARS).replace(/^\uFEFF/, '').trim();
    const reasoningChars = core_text.normalizeText(reasoning, core_constants.MAX_GENERATION_OUTPUT_CHARS).length;
    const budgetSummary = jsonOutputBudgetSummary({ requestMaxTokens, configuredMaxTokens });
    if (!text) {
        throw jsonOutputError(
            reasoningChars ? 'RMT_JSON_EMPTY_FINAL_WITH_REASONING' : 'RMT_JSON_EMPTY_FINAL',
            reasoningChars
                ? `模型本轮产生了推理内容，但没有返回最终正文 JSON。可能是推理预算耗尽或模型没有进入最终回答阶段。${budgetSummary} 可只重试这一项，或改用结构化输出更稳定的模型。`
                : `模型返回了空的最终正文，没有 JSON 可解析。${budgetSummary} 可只重试这一项，或检查所选模型/连接是否正常。`,
            { contentChars: 0, reasoningChars, requestMaxTokens: Math.floor(Number(requestMaxTokens) || 0), configuredMaxTokens: Math.floor(Number(configuredMaxTokens) || 0) },
        );
    }
    // Parse the complete document first so code-fence markers inside JSON strings
    // stay literal. A closed JSON fence is independent of unmatched braces in prose.
    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {}
    const fences = [...text.matchAll(/(?:^|\n)[ \t]*```json[ \t]*\n([\s\S]*?)\n[ \t]*```[ \t]*(?=\n|$)/gi)];
    for (let i = fences.length - 1; i >= 0; i -= 1) {
        try {
            const parsed = JSON.parse(fences[i][1].trim());
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch {}
    }
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const { candidates, hasUnclosedObject } = extractBalancedJsonObjects(text);
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
        try {
            const parsed = JSON.parse(candidates[i]);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch {}
    }
    const salvaged = salvageInboxLetters(text);
    if (salvaged) return salvaged;
    if (hasUnclosedObject) {
        throw jsonOutputError(
            'RMT_JSON_TRUNCATED',
            `模型返回的 JSON 疑似被截断：已经出现“{”，但没有完整闭合。${budgetSummary} 如果本段实际上限低于当前插件设置，继续提高全局“最大输出”不会突破该功能自己的分段上限；可只重试这一项，或换用输出更稳定的模型。`,
            { contentChars: text.length, reasoningChars, requestMaxTokens: Math.floor(Number(requestMaxTokens) || 0), configuredMaxTokens: Math.floor(Number(configuredMaxTokens) || 0) },
        );
    }
    if (!candidates.length) {
        throw jsonOutputError(
            'RMT_JSON_NOT_FOUND',
            `模型返回了最终正文（约 ${text.length.toLocaleString()} 字符），但其中没有完整 JSON 对象。插件没有保存或覆盖任何旧数据；可只重试这一项。`,
            { contentChars: text.length, reasoningChars },
        );
    }
    throw jsonOutputError(
        'RMT_JSON_INVALID',
        '模型返回了 JSON 外形，但格式无法解析。插件没有保存或覆盖任何旧数据；可只重试这一项。',
        { contentChars: text.length, reasoningChars },
    );
}
