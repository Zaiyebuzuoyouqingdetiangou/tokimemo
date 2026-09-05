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

export function jsonOutputBudgetSummary({ requestMaxTokens = 0, configuredMaxTokens = 0 } = {}) {
    const requestMax = Math.max(0, Math.floor(Number(requestMaxTokens) || 0));
    const configuredMax = Math.max(1024, Math.min(core_constants.MAX_GENERATION_OUTPUT_TOKENS, Math.floor(Number(configuredMaxTokens) || core_constants.MAX_GENERATION_OUTPUT_TOKENS)));
    const actual = requestMax ? Math.min(requestMax, configuredMax) : configuredMax;
    const segmentNote = actual < configuredMax
        ? `本段实际请求上限 ${actual.toLocaleString()} tokens（该功能使用较小的分段上限）`
        : `本段实际请求上限 ${actual.toLocaleString()} tokens`;
    return `${segmentNote}；当前插件设置 ${configuredMax.toLocaleString()} tokens；插件允许最高 ${core_constants.MAX_GENERATION_OUTPUT_TOKENS.toLocaleString()} tokens。`;
}

export function extractJson(raw, { reasoning = '', requestMaxTokens = 0, configuredMaxTokens = 0 } = {}) {
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
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const { candidates, hasUnclosedObject } = extractBalancedJsonObjects(text);
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
        try {
            const parsed = JSON.parse(candidates[i]);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch {}
    }
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
