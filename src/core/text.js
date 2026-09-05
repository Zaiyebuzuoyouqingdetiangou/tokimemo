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

const SAFE_ERROR_CODE_MESSAGES = Object.freeze({
    RMT_PROFILE_CAPABILITY: '1.1.18 一键配置要求新版连接能力；当前页面未提供安全的配置读取能力，本次没有发送请求。',
    RMT_MANUAL_API_URL: '手动 API 地址无效；请检查地址，并把 Key、Token 或密码放在独立凭据输入框中。',
    RMT_MANUAL_API_TRANSPORT: '远程手动 API 必须使用 HTTPS；只有本机地址可以使用 HTTP。',
    RMT_MANUAL_RESPONSE_TOO_LARGE: '模型服务返回内容过大，已停止读取。',
    RMT_RESPONSE_HTML: '上游返回了非 API 的 HTML 页面；响应正文已隐藏。',
    RMT_MANUAL_INVALID_JSON: '模型服务没有返回可解析的 JSON；响应正文已隐藏。',
    RMT_MANUAL_HTTP: '手动 API 请求失败；请检查手动配置与服务状态。',
    RMT_MANUAL_PROVIDER_ERROR: '手动 API 返回了错误状态；响应详情已隐藏，请检查服务配置后重试。',
    RMT_MANUAL_FETCH_UNAVAILABLE: '当前环境没有可用的网络请求能力。',
    RMT_MANUAL_MODELS_EMPTY: '接口没有返回可用模型；仍可直接填写模型 ID。',
    RMT_MANUAL_MODEL_TIMEOUT: '拉取模型超时；仍可直接填写模型 ID。',
    RMT_MANUAL_MODEL: '请先填写手动 API 的模型 ID。',
    RMT_MANUAL_MESSAGES: '手动 API 请求缺少必要消息，本次没有发送。',
    RMT_MANUAL_EMPTY: '手动 API 没有返回可见正文。',
    RMT_API_CONFIG_CHANGED: 'API 配置在生成期间发生变化，本次旧连接结果已丢弃。',
    RMT_API_CONFIGURATION_SUPERSEDED: 'API 设置已经变化，本次旧配置操作已取消。',
    RMT_API_MODEL_REQUEST_SUPERSEDED: '模型列表请求已被更新的请求取代。',
    RMT_PROFILE_PROXY_UNAVAILABLE: '这一键连接指定的代理无法从该 Profile 自身安全解析；已停止远端拉取。',
    RMT_PROFILE_MODEL_STATUS: '这一键连接的模型列表返回了错误状态；响应详情已隐藏。',
    RMT_PROFILE_MODEL_TIMEOUT: '一键连接的模型列表请求超时；仍可使用该连接自己保存的模型。',
    RMT_CONNECTION_FAILED: '专用连接请求失败；响应详情已隐藏，请检查当前独立 API 设置。',
    RMT_CONNECTION_AUTH: '专用连接认证失败；请检查当前配置、API Key 与账号权限。',
    RMT_CONNECTION_RATE_LIMIT: '模型服务正在限流或额度不足；请稍后重试。',
    RMT_CONNECTION_CONTEXT_LIMIT: '本段输入超过模型或代理的上下文上限；请减少导入资料或更换模型。',
    RMT_CONNECTION_CONFIG: '专用连接、模型或上游端点不可用；请重新检查配置。',
    RMT_CONNECTION_INVALID_REQUEST: '上游拒绝了本段请求；请检查模型兼容性与输出设置。',
    RMT_CONNECTION_SERVER: '模型服务或代理暂时不可用；请稍后重试。',
    RMT_CONNECTION_NETWORK: '无法连接模型服务；请检查地址、网络、代理与服务状态后重试。',
    RMT_REQUEST_TIMEOUT: '模型请求超时，已停止等待并释放任务位；请稍后重试。',
    RMT_SEGMENT_VALIDATION: '模型结果没有通过本地完整性校验；旧内容未被覆盖。',
    RMT_BANNED_GENERATED_PHRASE: '模型新生成内容命中了本地禁用词；本次结果没有保存。',
    RMT_JSON_EMPTY_FINAL: '模型没有返回最终正文 JSON；旧内容未被覆盖。',
    RMT_JSON_EMPTY_FINAL_WITH_REASONING: '模型产生了推理内容，但没有返回最终正文 JSON；旧内容未被覆盖。',
    RMT_JSON_NOT_FOUND: '模型最终正文中没有完整 JSON；旧内容未被覆盖。',
    RMT_JSON_TRUNCATED: '模型返回的 JSON 疑似被截断；旧内容未被覆盖。',
    RMT_PHONE_DRAFT_AVAILABLE: '私人终端只完成了部分内容；已保留可继续生成的草稿。',
    RMT_INPUT_BUDGET: '本次输入超过安全预算，已在发送前拦截。',
    RMT_JSON_INVALID: '模型没有返回完整、可解析的 JSON；响应正文已隐藏。',
    RMT_ARCHIVE_DELETED_FENCE: '目标档案已被明确删除；较早启动的任务不会重新创建它。',
    RMT_METADATA_DURABILITY_UNAVAILABLE: '当前页面无法确认档案已经持久保存；结果保留待重试，不会假装成功。',
});

const SAFE_DIAGNOSTIC_CODES = new Set([
    ...Object.keys(SAFE_ERROR_CODE_MESSAGES),
    'ABORT_ERR', 'RMT_LOCAL_OPERATION',
]);

function safeErrorStatus(error) {
    const value = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
    return Number.isFinite(value) && value >= 100 && value <= 599 ? Math.floor(value) : 0;
}

function safeErrorCode(error) {
    const value = normalizeText(error?.code, 80);
    return SAFE_DIAGNOSTIC_CODES.has(value) ? value : '';
}

function sanitizedTrustedErrorMessage(value, max) {
    const raw = normalizeText(value, Math.max(1200, max * 2));
    if (!raw) return '';
    const sensitive = /authorization\s*[:=]|bearer\s+[a-z0-9._~+\/-]{8,}|\bsk-[a-z0-9_-]{8,}\b|[?&](?:api[_-]?key|key|token|secret|password)=|<!doctype\s+html|<html(?:\s|>)|<body(?:\s|>)|failed to generate chat completion\s*:/i;
    if (sensitive.test(raw)) return '';
    return normalizeText(raw.replace(/[\r\n]+/g, ' '), max);
}

export function safeUserError(message, code = 'RMT_LOCAL_OPERATION', options = {}) {
    const error = new Error(normalizeText(message, 1200) || '操作失败。');
    error.code = /^[A-Z][A-Z0-9_]{1,79}$/.test(String(code || '')) ? String(code) : 'RMT_LOCAL_OPERATION';
    error.safeToDisplay = true;
    error.safeUserMessage = error.message;
    if (Number.isFinite(Number(options.status))) error.status = Math.floor(Number(options.status));
    if (typeof options.retryable === 'boolean') error.retryable = options.retryable;
    return error;
}

/**
 * Return only low-cardinality, allowlisted diagnostic fields. This object is safe
 * for console logging and must never contain provider bodies, prompts, history,
 * world-book text, archive text, URLs, keys, tokens, or raw exception messages.
 */
export function safeErrorDiagnostic(error) {
    const diagnostic = {};
    const name = normalizeText(error?.name, 40);
    const code = safeErrorCode(error);
    const status = safeErrorStatus(error);
    const kind = normalizeText(error?.kind, 40);
    if (/^(?:Error|TypeError|RangeError|SyntaxError|AbortError|TimeoutError|DOMException)$/.test(name)) diagnostic.name = name;
    if (code) diagnostic.code = code;
    if (status) diagnostic.status = status;
    if (/^(?:network|timeout|transport|provider|validation|storage|lifecycle)$/.test(kind)) diagnostic.kind = kind;
    if (typeof error?.retryable === 'boolean') diagnostic.retryable = error.retryable;
    if (typeof error?.retryableJson === 'boolean') diagnostic.retryableJson = error.retryableJson;
    return diagnostic;
}

export function safeErrorSummary(error, max = 520) {
    const raw = normalizeText(error?.message, 12000);
    const status = safeErrorStatus(error);
    const code = safeErrorCode(error);
    const looksHtml = /<!doctype\s+html|<html(?:\s|>)|<head(?:\s|>)|<body(?:\s|>)|<title>[^<]*cloudflare|cf-error|cdn-cgi\//i.test(raw);
    const blocked = /cloudflare|sorry,? you have been blocked|attention required|unable to access/i.test(raw);
    const unauthorized = /unauthorized|authentication|invalid api key|\b401\b/i.test(raw) || status === 401;
    const forbidden = /forbidden|\b403\b/i.test(raw) || status === 403;
    if (code && SAFE_ERROR_CODE_MESSAGES[code]) return normalizeText(SAFE_ERROR_CODE_MESSAGES[code], max);
    if (looksHtml) {
        const details = [];
        if (status) details.push(`HTTP ${status}`);
        if (blocked) details.push('Cloudflare 拦截');
        const suffix = details.length ? `（${details.join(' / ')}；响应正文已隐藏）` : '（响应正文已隐藏）';
        if (blocked || forbidden) return `上游服务拒绝了请求${suffix}。`;
        if (unauthorized) return `上游服务认证失败${suffix}。`;
        return `上游返回了非 API 的 HTML 页面${suffix}。`;
    }
    if (/failed to generate chat completion\s*:/i.test(raw)) {
        if (unauthorized) return `上游服务认证失败${status ? `（HTTP ${status}）` : ''}。`;
        if (forbidden) return `上游服务拒绝了请求${status ? `（HTTP ${status}）` : ''}。`;
        return `上游生成请求失败${status ? `（HTTP ${status}）` : ''}；响应正文已隐藏。`;
    }
    if (unauthorized) return `上游服务认证失败${status ? `（HTTP ${status}）` : ''}；响应详情已隐藏。`;
    if (forbidden) return `上游服务拒绝了请求${status ? `（HTTP ${status}）` : ''}；响应详情已隐藏。`;
    if (status === 408 || status === 504 || error?.name === 'TimeoutError') return `请求超时${status ? `（HTTP ${status}）` : ''}，请稍后重试。`;
    if (status === 429) return '请求过于频繁（HTTP 429），请稍后重试。';
    if (status >= 500) return `上游服务暂时不可用（HTTP ${status}）；响应详情已隐藏。`;
    if (status >= 400) return `请求失败（HTTP ${status}）；响应详情已隐藏。`;
    if (error?.name === 'AbortError') return '操作已取消。';
    if (error?.safeToDisplay === true) {
        const trusted = sanitizedTrustedErrorMessage(error?.safeUserMessage || raw, max);
        if (trusted) return trusted;
    }
    if (/failed to fetch|networkerror|network request failed|load failed|econn(?:reset|refused)|enotfound|fetch failed/i.test(raw)) {
        return '网络连接失败；请检查地址、网络与服务状态后重试。';
    }
    return '操作失败；敏感详情已隐藏 [hidden]。请重试或检查设置。';
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
