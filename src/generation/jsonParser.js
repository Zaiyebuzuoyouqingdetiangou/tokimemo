import * as response_config from '../core/independentApiConfig.js';
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
    return { candidates, hasUnclosedObject: depth > 0 && start >= 0,
        unclosedObject: depth > 0 && start >= 0 ? text.slice(start) : '' };
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

// An optional drawing before letters can be malformed even though the mail
// fields after it are intact. Recognize only the selected object's root key;
// quoted strings and nested examples cannot qualify another response object.
function hasInboxRootField(text, field = 'letters') {
    let depth = 0, inString = false, escaped = false, stringStart = -1;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') {
                inString = false;
                if (depth === 1 && /^\s*:/.test(text.slice(i + 1))) {
                    try { if (JSON.parse(text.slice(stringStart, i + 1)) === field) return true; } catch {}
                }
            }
        } else if (char === '"') { inString = true; stringStart = i; }
        else if (char === '{' || char === '[') depth++;
        else if (char === '}' || char === ']') depth--;
    }
    return false;
}

// Choose the last actual mailbox, never pool examples with the final answer.
// Fences have independent boundaries, so unmatched braces in prose do not hide
// their contents. An unrelated trailing brace cannot displace received letters.
function inboxResponseCandidate(raw, selection = null, rootField = 'letters') {
    const text = response_config.finalResponseText(raw);
    const choices = [];
    const collect = (body, offset) => {
        const { candidates, unclosedObject } = extractBalancedJsonObjects(body);
        let cursor = 0;
        for (const candidate of [...candidates, ...(unclosedObject ? [unclosedObject] : [])]) {
            const index = body.indexOf(candidate, cursor);
            if (index < 0) continue;
            cursor = index + candidate.length;
            let complete = false;
            try { const parsed = JSON.parse(candidate); complete = !!parsed && typeof parsed === 'object' && !Array.isArray(parsed); } catch {}
            // A later legal non-mail object is still the provider's final answer.
            // Keep it for the inbox validator to reject, rather than using an example.
            if (complete || hasInboxRootField(candidate, rootField)) choices.push({ text: candidate, position: offset + index, complete });
        }
    };
    collect(text, 0);
    for (const fence of text.matchAll(/(?:^|\n)[ \t]*```json[ \t]*\n([\s\S]*?)\n[ \t]*```[ \t]*(?=\n|$)/gi)) {
        collect(fence[1], fence.index + fence[0].indexOf(fence[1]));
    }
    choices.sort((a, b) => b.position - a.position);
    if (selection) selection.suppressedEarlierParsed = choices.some(choice => choice.complete && choice.position < choices[0].position);
    return choices[0]?.text || '';
}

// Inbox-only. Reads already-closed letter fields from a broken reply.
// Does not invent quotes, commas, or missing title/body text.
export function salvageInboxLetters(raw) {
    const text = typeof raw === 'string' ? inboxResponseCandidate(raw) : '';
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
    if (!letters.length) return null;
    // Text is emitted before the optional art array. Keep only whole received
    // art records; an unfinished SVG must not discard earlier drawings or mail.
    const letterIllustrations = parsePartialJsonObject(text).items('/letterIllustrations');
    return { letters, ...(letterIllustrations.length ? { letterIllustrations } : {}) };
}

// Only the explicitly marked merged-mail request may use this recovery path.
// Its letters array must already be closed, and parsing must have stopped in
// the optional illustration array. Other modules remain atomic closed values.
function salvageMergedInboxIllustrations(text) {
    const parsed = parsePartialJsonObject(text);
    const artPath = '/modules/inbox/letterIllustrations';
    if (!parsed.has('/modules/inbox/letters') || !Array.isArray(parsed.at(artPath)) || parsed.has(artPath)) return null;
    const received = parsed.items('/modules/inbox/letters');
    const letters = received.map(usableInboxLetter);
    if (!letters.length || letters.some(letter => !letter)) return null;
    const letterIllustrations = parsed.items(artPath);
    const modules = Object.fromEntries(Object.keys(parsed.at('/modules') || {}).filter(key => key !== 'inbox'
        && parsed.has('/modules/' + key.replace(/~/g, '~0').replace(/\//g, '~1')))
        .map(key => [key, parsed.at('/modules/' + key.replace(/~/g, '~0').replace(/\//g, '~1'))]));
    modules.inbox = { letters, ...(letterIllustrations.length ? { letterIllustrations } : {}) };
    return { modules };
}

// A transport exception for optional mail art, not a generic HTML/JSON repair.
// The response itself must start as JSON (or a JSON fence), and complete prose
// must precede its art array. HTML wrappers, comments and JSON islands fail.
export function hasCompleteInboxProseBeforeArt(raw, { mode = '', mergedInboxIllustrations = false } = {}) {
    if (typeof raw !== 'string' || (mode !== 'inbox' && mergedInboxIllustrations !== true)) return false;
    let source = response_config.finalResponseText(raw).trim();
    if (/^```(?:json)?[ \t]*(?:\r?\n)/i.test(source)) {
        source = source.replace(/^```(?:json)?[ \t]*(?:\r?\n)/i, '').replace(/\r?\n```[ \t]*$/u, '').trim();
    }
    if (!source.startsWith('{')) return false;
    const parsed = parsePartialJsonObject(source);
    // A closed root followed by anything else is not a rooted JSON response.
    if (parsed.complete) { try { JSON.parse(source); } catch { return false; } }
    const prefix = mergedInboxIllustrations === true ? '/modules/inbox' : '';
    const artPath = prefix + '/letterIllustrations';
    if (!parsed.has(prefix + '/letters') || !Array.isArray(parsed.at(artPath))) return false;
    if (!parsed.complete && parsed.has(artPath)) return false;
    const letters = parsed.items(prefix + '/letters');
    return letters.length > 0 && letters.every(value => !!usableInboxLetter(value));
}

// Recovery uses the same received letter fields as the live inbox parser. A
// broken optional drawing must not hide a closed body from merge/preservation.
// The original response is still incomplete; only its readable letters close.
function bindInboxRecoveryIllustrations(value) {
    if (!Array.isArray(value?.letters) || !Array.isArray(value?.letterIllustrations)) return value;
    const letterIllustrations = value.letterIllustrations.flatMap(art => {
        if (!art || typeof art !== 'object' || Array.isArray(art)) return [];
        const matches = value.letters.filter(letter => letter?.slot === art.slot && usableInboxLetter(letter));
        if (matches.length !== 1) return [];
        const letter = matches[0];
        const key = JSON.stringify(['slot', 'title', 'greeting', 'body', 'closing'].map(field => typeof letter[field] === 'string' ? letter[field] : ''));
        // Always overwrite provider data: this binding is local recovery metadata.
        return [{ ...art, _rmtLetterTextKey: key }];
    });
    return { ...value, letterIllustrations };
}
export function parseInboxRecoveryObject(raw) {
    const candidate = inboxResponseCandidate(raw);
    const parsed = parsePartialJsonObject(candidate);
    if (parsed.complete) return parsed.value?.letterIllustrations
        ? parsePartialJsonObject(JSON.stringify(bindInboxRecoveryIllustrations(parsed.value))) : parsed;
    const salvaged = salvageInboxLetters(candidate);
    if (!salvaged) return parsed;
    const readable = parsePartialJsonObject(JSON.stringify(bindInboxRecoveryIllustrations(salvaged)));
    return { ...readable, complete: false,
        has: pointer => pointer === '' || pointer === '/letters' ? false : readable.has(pointer) };
}

// One conservative repair pass for a reply that is JSON apart from common
// slips: trailing commas before } or ], raw control characters/newlines inside
// strings, Chinese curly quotes used as string delimiters, and // or /* */
// comments outside strings. Text inside an ASCII-quoted string is copied as is,
// except that raw control characters are escaped. Nothing is invented: no
// missing quote, bracket or value is added. Returns '' when nothing changed.
export function repairJsonCandidate(text) {
    if (typeof text !== 'string' || !text) return '';
    const CURLY_OPEN = '“', CURLY_CLOSE = '”';
    const controlEscape = char => char === '\n' ? '\\n' : char === '\r' ? '\\r' : char === '\t' ? '\\t'
        : `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
    const structuralAfter = index => {
        let cursor = index;
        while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
        return cursor >= text.length || ':,}]'.includes(text[cursor]);
    };
    let out = '';
    let quote = ''; // '' outside strings, '"' in an ASCII string, '”' in a curly one
    let escaped = false;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (quote) {
            if (escaped) { escaped = false; out += char; continue; }
            if (char === '\\') { escaped = true; out += char; continue; }
            if (quote === '"' && char === '"') { quote = ''; out += char; continue; }
            if (quote === CURLY_CLOSE && (char === CURLY_CLOSE || char === CURLY_OPEN) && structuralAfter(i + 1)) {
                quote = ''; out += '"'; continue;
            }
            if (quote === CURLY_CLOSE && char === '"') { out += '\\"'; continue; }
            out += char.charCodeAt(0) < 0x20 ? controlEscape(char) : char;
            continue;
        }
        if (char === '"') { quote = '"'; out += char; continue; }
        if (char === CURLY_OPEN || char === CURLY_CLOSE) { quote = CURLY_CLOSE; out += '"'; continue; }
        if (char === '/' && text[i + 1] === '/') {
            while (i < text.length && text[i] !== '\n') i += 1;
            out += '\n';
            continue;
        }
        if (char === '/' && text[i + 1] === '*') {
            const end = text.indexOf('*/', i + 2);
            if (end < 0) return '';
            i = end + 1;
            out += ' ';
            continue;
        }
        if (char === '}' || char === ']') {
            let tail = out.length - 1;
            while (tail >= 0 && /\s/.test(out[tail])) tail -= 1;
            if (out[tail] === ',') out = out.slice(0, tail) + out.slice(tail + 1);
        }
        out += char;
    }
    return out !== text ? out : '';
}

function parseRepairedObject(text) {
    const repaired = repairJsonCandidate(text);
    if (!repaired) return null;
    try {
        const parsed = JSON.parse(repaired);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
}

// Pick the answer before attempting to repair it. A complete example earlier in
// the reply must not replace a later answer just because that answer is cut off
// or has a repairable comma. Fences are scanned independently so prose braces
// cannot swallow their JSON. A lone prose brace is not a new object candidate.
function finalJsonResponseCandidate(text) {
    const choices = [];
    const collect = (body, offset) => {
        const { candidates, unclosedObject } = extractBalancedJsonObjects(body);
        let cursor = 0;
        for (const candidate of [...candidates, ...(unclosedObject ? [unclosedObject] : [])]) {
            const index = body.indexOf(candidate, cursor);
            if (index < 0) continue;
            cursor = index + candidate.length;
            const recognizable = repairJsonCandidate(candidate) || candidate;
            // Invalid quote/key styles still identify a later attempted object.
            // Select it for an error instead of silently accepting an earlier
            // example; an unstructured prose brace remains outside this rule.
            if (!/^\{\s*(?:["“”]|\}|(?:'(?:\\.|[^'\\\r\n])*'|[\p{L}\p{N}_$][\p{L}\p{N}_$-]*)\s*:)/u.test(recognizable)) continue;
            choices.push({ text: candidate, position: offset + index });
        }
    };
    collect(text, 0);
    for (const fence of text.matchAll(/(?:^|\n)[ \t]*```(?:json)?[ \t]*\r?\n([\s\S]*?)(?:\r?\n[ \t]*```[ \t]*(?=\r?\n|$)|$)/gi)) {
        collect(fence[1], fence.index + fence[0].indexOf(fence[1]));
    }
    choices.sort((left, right) => right.position - left.position);
    return choices[0]?.text || '';
}

// A reply whose final } balances its first { when string state is ignored has
// most likely ended; an unescaped quote inside a string only makes the
// string-aware scan look unclosed. Real cut-offs still have unclosed brackets.
// A string the scan is still inside at the end only counts as such a stray
// quote when it did not open where a JSON string may start (after { [ , :).
// A properly opened string that never closed, e.g. {"a":"x","b":"y}, is a cut-off.
function unclosedObjectLooksEnded(unclosed, finishReason = '') {
    if (['length', 'max_tokens', 'incomplete'].includes(String(finishReason || '').toLowerCase())) return false;
    const body = String(unclosed || '').trim();
    if (!body.startsWith('{') || !body.endsWith('}')) return false;
    let inString = false, escaped = false, openedAtValue = false, previous = '';
    for (const char of body) {
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') { inString = false; previous = char; }
            continue;
        }
        if (char === '"') { inString = true; openedAtValue = '{[,:'.includes(previous); continue; }
        if (!/\s/.test(char)) previous = char;
    }
    if (inString && openedAtValue) return false;
    let braces = 0, brackets = 0;
    for (const char of body) {
        if (char === '{') braces += 1;
        else if (char === '}') braces -= 1;
        else if (char === '[') brackets += 1;
        else if (char === ']') brackets -= 1;
    }
    return braces === 0 && brackets === 0;
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

export function extractJson(raw, { reasoning = '', requestMaxTokens = 0, configuredMaxTokens = 0, mode = '', mergedInboxIllustrations = false, finishReason = '' } = {}) {
    if (raw != null && typeof raw !== 'string') {
        const error = jsonOutputError('RMT_RESPONSE_FORMAT', '连接返回的正文结构暂不支持，未取得可解析的最终正文；旧内容未改变。');
        error.retryable = false;
        error.retryableJson = false;
        throw error;
    }
    let text = response_config.finalResponseText(core_text.normalizeText(raw, core_constants.MAX_GENERATION_OUTPUT_CHARS)).trim();
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
    if (mergedInboxIllustrations === true) {
        const candidate = inboxResponseCandidate(text, null, 'modules');
        if (candidate) {
            try { const parsed = JSON.parse(candidate); if (parsed && typeof parsed === 'object') return parsed; } catch {}
            const repaired = parseRepairedObject(candidate);
            if (repaired) return repaired;
            const salvaged = salvageMergedInboxIllustrations(candidate);
            if (salvaged) return salvaged;
            // Never promote an earlier example when the actual merged reply
            // has started, even when its damage is outside the optional art.
            text = candidate;
        }
    }
    const inboxSelection = {};
    const inboxCandidate = mode === 'inbox' ? inboxResponseCandidate(text, inboxSelection) : '';
    if (inboxCandidate) {
        try { const parsed = JSON.parse(inboxCandidate); if (parsed && typeof parsed === 'object') return parsed; } catch {}
        const repaired = parseRepairedObject(inboxCandidate);
        if (repaired) return repaired;
        const salvaged = salvageInboxLetters(inboxCandidate);
        if (salvaged) return salvaged;
        // Do not fall back to an earlier example when the answer has started.
        text = inboxCandidate;
    }
    // Mail keeps its existing optional-art salvage path. Other modes must work
    // only with the last actual answer, including when it is still incomplete.
    if (!inboxCandidate && mergedInboxIllustrations !== true) {
        text = finalJsonResponseCandidate(text) || text;
    }
    const fences = [...text.matchAll(/(?:^|\n)[ \t]*```json[ \t]*\n([\s\S]*?)\n[ \t]*```[ \t]*(?=\n|$)/gi)];
    for (let i = fences.length - 1; i >= 0; i -= 1) {
        try {
            const parsed = JSON.parse(fences[i][1].trim());
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch {}
    }
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const { candidates, hasUnclosedObject, unclosedObject } = extractBalancedJsonObjects(text);
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
        try {
            const parsed = JSON.parse(candidates[i]);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch {}
    }
    // Nothing parsed as it stands: one conservative repair pass on the selected
    // candidate (the final, possibly unclosed, object), then parse again.
    const selected = hasUnclosedObject ? unclosedObject : candidates[candidates.length - 1] || '';
    const repaired = selected ? parseRepairedObject(selected) : null;
    if (repaired) return repaired;
    const salvaged = salvageInboxLetters(text);
    if (salvaged) return salvaged;
    // A reply that visibly ended with its closing } is malformed, not cut off:
    // report it as invalid so no continuation request is sent for it.
    const endedMalformed = hasUnclosedObject && unclosedObjectLooksEnded(unclosedObject, finishReason);
    if (hasUnclosedObject && !endedMalformed) {
        const error = jsonOutputError(
            'RMT_JSON_TRUNCATED',
            `模型返回的 JSON 疑似被截断：已经出现“{”，但没有完整闭合。${budgetSummary} 如果本段实际上限低于当前插件设置，继续提高全局“最大输出”不会突破该功能自己的分段上限；可只重试这一项，或换用输出更稳定的模型。`,
            { contentChars: text.length, reasoningChars, requestMaxTokens: Math.floor(Number(requestMaxTokens) || 0), configuredMaxTokens: Math.floor(Number(configuredMaxTokens) || 0) },
        );
        // This newly recognized final answer must be saved without turning the
        // rejected earlier example into either success or another paid attempt.
        if (inboxSelection.suppressedEarlierParsed) error.preserveInboxWithoutAutoContinue = true;
        throw error;
    }
    if (!candidates.length && !endedMalformed) {
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
