import * as connection_pool from './connectionPool.js';
import * as advanced_generation from './advancedGeneration.js';
import * as core_constants from './constants.js';
import * as core_text from './text.js';
// 独立 API 配置：连接管理器能力检查、地址与请求头规范化、配置指纹
// 从 core/independentApi.js 原样搬出（重构阶段 2），声明文本一字未改；core/independentApi.js 仍转发原有导出。

export const PROFILE_ONE_CLICK_UI_VERSION = '凭证绑定';

export const MANUAL_STATUS_ENDPOINT = '/api/backends/chat-completions/status';

export const MANUAL_GENERATE_ENDPOINT = '/api/backends/chat-completions/generate';

const KNOWN_API_ENDPOINT_RE = /\/(?:chat\/completions|completions|responses|messages|embeddings|models)\/?$/i;

export function apiError(message, code, status = 0) {
    const error = new Error(message);
    error.code = code;
    error.safeToDisplay = true;
    error.safeUserMessage = message;
    if (status) error.status = status;
    return error;
}

export function connectionManagerHasProfileSecrets(service) {
    if (typeof service?.sendRequest !== 'function') return false;
    try {
        const source = Function.prototype.toString.call(service.sendRequest);
        return /\bsecret_id\s*:/.test(source) && /profile\s*\[\s*['"]secret-id['"]\s*\]/.test(source);
    } catch {
        return false;
    }
}

export function connectionManagerSupportsRequestOverrides(service) {
    if (typeof service?.sendRequest !== 'function') return false;
    try {
        const source = Function.prototype.toString.call(service.sendRequest);
        const profileModelIndex = source.search(/\bmodel\s*:\s*profile(?:\.model|\s*\[\s*['"]model['"]\s*\])/);
        const overrideIndex = source.search(/\.\.\.\s*overridePayload\b/);
        return profileModelIndex >= 0 && overrideIndex > profileModelIndex;
    } catch {
        return false;
    }
}

export function assertConnectionManagerProfileSupport(service) {
    const validService = typeof service?.validateProfile === 'function' && typeof service?.sendRequest === 'function';
    if (validService && connectionManagerHasProfileSecrets(service) && connectionManagerSupportsRequestOverrides(service)) return true;
    throw apiError(
        '当前酒馆没有一键配置所需的配置与密钥绑定能力（Profile Secret）或模型覆盖能力。请使用手动独立 API，填写地址、密钥和模型；不会改动主聊天连接。本次没有发送请求。',
        'RMT_PROFILE_CAPABILITY',
    );
}

function stripKnownEndpoint(url) {
    let pathname = String(url.pathname || '').replace(/\/+$/, '');
    for (let index = 0; index < 3; index += 1) {
        const next = pathname.replace(KNOWN_API_ENDPOINT_RE, '');
        if (next === pathname) break;
        pathname = next.replace(/\/+$/, '');
    }
    url.pathname = pathname || '/';
    url.hash = '';
    return url;
}

export function normalizeManualApiBaseUrl(value, { required = false } = {}) {
    const raw = String(value ?? '').trim();
    if (!raw) {
        if (required) throw apiError('请填写手动 API 地址。', 'RMT_MANUAL_API_URL');
        return '';
    }
    if (raw.length > 2000 || /[\u0000-\u001f\u007f]/.test(raw)) {
        throw apiError('手动 API 地址格式无效。', 'RMT_MANUAL_API_URL');
    }
    const explicitScheme = raw.match(/^([a-z][a-z0-9+.-]*):(.*)$/i);
    const looksLikeHostPort = !!explicitScheme
        && /^\d+(?:[/?#]|$)/.test(explicitScheme[2])
        && /^(?:[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)$/i.test(explicitScheme[1]);
    if (explicitScheme && !/^https?:\/\//i.test(raw) && !looksLikeHostPort) {
        throw apiError('手动 API 地址必须是无内嵌账号密码的 HTTP(S) 地址。', 'RMT_MANUAL_API_URL');
    }
    const hostPart = raw.split('/')[0];
    const localHost = /^(?:localhost|127(?:\.\d{1,3}){3}|\[[0-9a-f:]+\])(?::\d+)?$/i.test(hostPart);
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `${localHost ? 'http' : 'https'}://${raw}`;
    let parsed;
    try {
        parsed = new URL(withScheme);
    } catch {
        throw apiError('手动 API 地址格式无效。', 'RMT_MANUAL_API_URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
        throw apiError('手动 API 地址必须是无内嵌账号密码的 HTTP(S) 地址。', 'RMT_MANUAL_API_URL');
    }
    const credentialQueryNames = new Set([
        'apikey', 'key', 'token', 'accesstoken', 'refreshtoken', 'idtoken', 'sessiontoken',
        'secret', 'clientsecret', 'apisecret', 'authorization', 'auth', 'xapikey', 'bearertoken',
        'password', 'passwd', 'proxypassword', 'credential', 'credentials', 'signature', 'sig',
        'accesskey', 'accesskeyid', 'secretkey', 'xamzcredential', 'xamzsecuritytoken', 'xamzsignature',
        'apitoken', 'authtoken', 'oauthtoken', 'clientpassword', 'clientid', 'privatekey',
        'subscriptionkey', 'awsaccesskeyid', 'googleaccessid', 'licensekey', 'servicekey',
    ]);
    for (const [name, value] of parsed.searchParams.entries()) {
        const normalizedName = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const credentialLike = credentialQueryNames.has(normalizedName)
            || /(?:token|secret|password|passwd|credential|signature|authorization|bearer)/.test(normalizedName)
            || /^(?:api|access|auth|client|private|public|secret|xamz).*(?:key|keyid)$/.test(normalizedName);
        const normalizedValue = String(value || '').trim();
        const credentialValue = /^(?:bearer\s+|(?:sk|rk|pk|key|token|secret)[-_])[a-z0-9._~+\/-]{6,}$/i.test(normalizedValue)
            || /^eyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}(?:\.[a-z0-9_-]{8,})?$/i.test(normalizedValue)
            || /^AKIA[A-Z0-9]{12,}$/i.test(normalizedValue);
        if (credentialLike || credentialValue) {
            throw apiError('手动 API 地址不能在查询参数中携带 Key、Token、Secret 或账号凭据；请使用独立的 API Key 输入框。', 'RMT_MANUAL_API_URL');
        }
    }
    stripKnownEndpoint(parsed);
    const normalized = parsed.toString().replace(/\/(?=\?|$)/, '');
    if (normalized.length > 2000) throw apiError('手动 API 地址过长。', 'RMT_MANUAL_API_URL');
    return normalized;
}

export function manualApiHeadersJson(apiKey) {
    const key = core_text.normalizeText(apiKey, 4000);
    return JSON.stringify(key ? { Authorization: `Bearer ${key}` } : {});
}

export function apiConfigurationFingerprint(settings) {
    const mode = settings?.apiConnectionMode === 'manual' ? 'manual' : 'profile';
    if (mode === 'manual') {
        let base = '';
        try { base = normalizeManualApiBaseUrl(settings?.manualApiBaseUrl); } catch { base = 'invalid'; }
        const key = core_text.normalizeText(settings?.manualApiKey, 4000);
        return JSON.stringify([
            mode,
            base,
            core_text.normalizeText(settings?.manualApiModel, 240),
            key ? `${key.length}:${core_text.hashString(key)}` : '',
            Number(settings?.maxTokens) || 0,
            Number(settings?.temperature) || 0,
            settings?.manualApiStreaming === true,
            ...(!key && settings?.manualApiSecretRef ? [settings.manualApiSecretRef] : []),
            ...(advanced_generation.advancedFingerprint(settings) ? [advanced_generation.advancedFingerprint(settings)] : []),
        ]);
    }
    return JSON.stringify([
        mode,
        core_text.normalizeText(settings?.connectionProfileId, 160),
        core_text.normalizeText(settings?.modelOverride, 240),
        Number(settings?.maxTokens) || 0,
        Number(settings?.temperature) || 0,
        ...(connection_pool.connectionPoolFingerprint(settings) ? [connection_pool.connectionPoolFingerprint(settings)] : []),
        ...(advanced_generation.advancedFingerprint(settings) ? [advanced_generation.advancedFingerprint(settings)] : []),
    ]);
}

export function manualModelCacheKey(settings) {
    let base = '';
    try { base = normalizeManualApiBaseUrl(settings?.manualApiBaseUrl); } catch { base = 'invalid'; }
    const key = core_text.normalizeText(settings?.manualApiKey, 4000);
    return `manual:${core_text.hashString(`${base}|${key.length}:${core_text.hashString(key)}${!key && settings?.manualApiSecretRef ? `|${settings.manualApiSecretRef}` : ''}`)}`;
}

export function requestHeaders(context) {
    let headers = {};
    try { headers = typeof context?.getRequestHeaders === 'function' ? context.getRequestHeaders() : {}; } catch {}
    return { ...(headers && typeof headers === 'object' ? headers : {}), 'Content-Type': 'application/json' };
}

export async function boundedResponseText(response, maxBytes = core_constants.MAX_MANUAL_API_RESPONSE_BYTES) {
    const contentLength = Number(response?.headers?.get?.('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        throw apiError('模型服务返回内容过大，已停止读取。', 'RMT_MANUAL_RESPONSE_TOO_LARGE', Number(response?.status) || 0);
    }
    const reader = response?.body?.getReader?.();
    if (!reader) {
        const text = await response.text();
        const size = typeof TextEncoder === 'function' ? new TextEncoder().encode(text).byteLength : text.length * 3;
        if (size > maxBytes) throw apiError('模型服务返回内容过大，已停止读取。', 'RMT_MANUAL_RESPONSE_TOO_LARGE', Number(response?.status) || 0);
        return text;
    }
    const decoder = new TextDecoder();
    let total = 0;
    let text = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value?.byteLength || 0;
        if (total > maxBytes) {
            try { await reader.cancel(); } catch {}
            throw apiError('模型服务返回内容过大，已停止读取。', 'RMT_MANUAL_RESPONSE_TOO_LARGE', Number(response?.status) || 0);
        }
        text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
}

export async function boundedJson(response, maxBytes) {
    const contentType = String(response?.headers?.get?.('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
        try { await response?.body?.cancel?.(); } catch {}
        throw apiError('模型服务返回了 HTML 页面，响应正文已隐藏。', 'RMT_RESPONSE_HTML', Number(response?.status) || 0);
    }
    const text = await boundedResponseText(response, maxBytes);
    if (looksLikeHtmlResponse(text)) {
        throw apiError('模型服务返回了 HTML 页面，响应正文已隐藏。', 'RMT_RESPONSE_HTML', Number(response?.status) || 0);
    }
    try {
        return JSON.parse(text);
    } catch {
        throw apiError('模型服务没有返回可解析的 JSON。', 'RMT_MANUAL_INVALID_JSON', Number(response?.status) || 0);
    }
}

export function looksLikeHtmlResponse(value) {
    const body = String(value ?? '').replace(/^\uFEFF/, '').trimStart();
    // A complete JSON document is data, including any quoted markup in its strings.
    // Only a whole-document parse grants this exception; never extract a JSON island
    // from an HTML error page here. No response text is rendered or executed.
    const jsonBody = body.replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i, '$1').trim();
    if (jsonBody.startsWith('{') || jsonBody.startsWith('[')) {
        try { const parsed = JSON.parse(jsonBody); if (parsed && typeof parsed === 'object') return false; } catch {}
    }
    // Proxies commonly prepend comments/meta tags or wrap a JSON-looking fragment in an error
    // page. Detect markup anywhere near the response head, before JSON extraction can mistake an
    // embedded object for the provider payload. The body is never included in the public error.
    return /<!--[\s\S]*?-->/i.test(body)
        || /<\s*!doctype\b/i.test(body)
        || /<\s*\/?\s*[a-z][a-z0-9:-]*(?:\s+[^<>]*?)?\s*\/?\s*>/i.test(body);
}

export async function readBoundedJsonResponse(response, maxBytes = core_constants.MAX_MANUAL_API_RESPONSE_BYTES) {
    return await boundedJson(response, maxBytes);
}

export function httpFailure(response) {
    const code = Number(response?.status) || 0;
    const html = /text\/html/i.test(String(response?.headers?.get?.('content-type') || ''));
    const error = apiError(
        code ? `手动 API 请求失败（HTTP ${code}）。请检查手动配置与服务状态。` : '手动 API 请求失败。请检查手动配置与服务状态。',
        html ? 'RMT_RESPONSE_HTML' : 'RMT_MANUAL_HTTP',
        code,
    );
    const retryAfter = String(response?.headers?.get?.('retry-after') || '').slice(0, 100).trim();
    const delay = /^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
    if (code === 429 && Number.isFinite(delay) && delay > 0) error.retryAfterMs = Math.min(86400000, Math.ceil(delay));
    return error;
}

export function providerEnvelopeFailure(payload, manual = true) {
    // Read only bounded error metadata. Never propagate a provider message/body as a cause.
    const seen = new Set();
    let status = 0, typeStatus = 0, quota = false;
    const visit = (node, depth) => {
        if (!node || typeof node !== 'object' || seen.has(node) || depth > 4 || seen.size >= 24) return;
        seen.add(node);
        for (const key of ['status', 'statusCode', 'code', 'type']) {
            const descriptor = Object.getOwnPropertyDescriptor(node, key);
            const value = descriptor && 'value' in descriptor ? descriptor.value : null;
            if (!['string', 'number'].includes(typeof value)) continue;
            const token = String(value).slice(0, 100).toLowerCase();
            const numeric = Number(token);
            if (!status && Number.isInteger(numeric) && numeric >= 400 && numeric <= 599) status = numeric;
            if (['insufficient_quota', 'billing_hard_limit_reached', 'credit_balance_too_low'].includes(token)) quota = true;
            if (['rate_limit_error', 'rate_limit_exceeded', 'resource_exhausted'].includes(token)) typeStatus = 429;
            else if (!typeStatus && ['invalid_api_key', 'authentication_error', 'unauthorized', 'unauthenticated'].includes(token)) typeStatus = 401;
            else if (!typeStatus && ['permission_denied', 'permission_error', 'forbidden'].includes(token)) typeStatus = 403;
        }
        for (const key of ['error', 'errors', 'data', 'result', 'response', 'body', 'details']) {
            const descriptor = Object.getOwnPropertyDescriptor(node, key);
            if (descriptor && 'value' in descriptor) visit(descriptor.value, depth + 1);
        }
        if (Array.isArray(node)) for (let i = 0; i < Math.min(4, node.length); i++) {
            const descriptor = Object.getOwnPropertyDescriptor(node, String(i));
            if (descriptor && 'value' in descriptor) visit(descriptor.value, depth + 1);
        }
    };
    visit(payload, 0);
    if (quota && (!status || status === 429)) {
        const error = apiError('服务商报告额度不足，请检查该账号额度。', 'RMT_CONNECTION_QUOTA', status);
        error.retryable = false;
        return error;
    }
    if (status || typeStatus) return apiError('模型服务返回错误状态；详情已隐藏。', 'RMT_PROVIDER_STATUS', status || typeStatus);
    const error = apiError('专用连接返回了错误状态，请检查服务配置后重试。', manual ? 'RMT_MANUAL_PROVIDER_ERROR' : 'RMT_CONNECTION_FAILED');
    error.retryable = false;
    return error;
}

export function assertManualApiCredentialTransport(baseUrl, apiKey) {
    const normalized = normalizeManualApiBaseUrl(baseUrl, { required: true });
    const parsed = new URL(normalized);
    const loopback = /^(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/i.test(parsed.hostname);
    if (parsed.protocol !== 'https:' && !loopback) {
        throw apiError('手动 API 地址必须使用 HTTPS；仅本机 localhost/127.0.0.1/::1 可使用 HTTP。', 'RMT_MANUAL_API_TRANSPORT');
    }
    return normalized;
}

function modelId(value) {
    if (typeof value === 'string') return core_text.normalizeText(value, 240);
    if (!value || typeof value !== 'object') return '';
    return core_text.normalizeText(value.id ?? value.model ?? value.model_id ?? value.name ?? value.slug, 240);
}

export function extractManualModelIds(payload) {
    const lists = [];
    const visit = (value, depth = 0) => {
        if (depth > 3 || value == null) return;
        if (Array.isArray(value)) {
            lists.push(value);
            return;
        }
        if (typeof value !== 'object') return;
        for (const key of ['data', 'models', 'items', 'result', 'results']) {
            if (Object.prototype.hasOwnProperty.call(value, key)) visit(value[key], depth + 1);
        }
    };
    visit(payload);
    return [...new Set(lists.flatMap(list => list.map(modelId)).filter(Boolean))].slice(0, 2000);
}

function responseField(value, key) {
    if (!value || typeof value !== 'object') return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function hasResponseField(value, key) {
    const descriptor = value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key) : null;
    return !!descriptor && 'value' in descriptor;
}

function nonFinalContent(value) {
    const type = responseField(value, 'type');
    const role = responseField(value, 'role');
    return (typeof type === 'string' && /(?:reasoning|thought|thinking|analysis|tool|function|refusal|error|_call(?:_output)?$)/i.test(type))
        || responseField(value, 'thought') === true
        || (typeof role === 'string' && !['assistant', 'model'].includes(role))
        || !!responseField(value, 'refusal');
}

// null means an unsupported shape; an empty string means a recognized but empty
// final channel. Do not promote reasoning/tool text when the final channel is empty.
function finalContentText(value, depth = 0) {
    if (depth > 6) return null;
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        if (value.length > 4096) return null;
        const parts = [];
        for (let i = 0; i < value.length; i += 1) {
            const text = finalContentText(responseField(value, String(i)), depth + 1);
            // Responses may interleave visible messages with non-text output.
            // Unknown blocks never contribute text and are not serialized.
            if (text !== null) parts.push(text);
        }
        return parts.join('');
    }
    if (typeof value !== 'object') return null;
    if (nonFinalContent(value)) return '';
    const text = responseField(value, 'text');
    if (typeof text === 'string') return text;
    if (typeof responseField(text, 'value') === 'string') return responseField(text, 'value');
    if (typeof responseField(value, 'output_text') === 'string') return responseField(value, 'output_text');
    if (hasResponseField(value, 'content')) return finalContentText(responseField(value, 'content'), depth + 1);
    if (['assistant', 'model'].includes(responseField(value, 'role'))
        || ['reasoning', 'reasoning_content', 'thinking'].some(key => hasResponseField(value, key))) return '';
    return null;
}

export function visibleContentText(value, depth = 0) { return finalContentText(value, depth) || ''; }

function finalResponseSelection(payload, depth = 0, seen = new Set()) {
    const unsupported = { shape: 'unsupported', text: null };
    if (depth > 4) return unsupported;
    if (typeof payload === 'string') return { shape: 'text', text: payload };
    if (payload == null) return { shape: 'empty', text: '' };
    if (typeof payload !== 'object' || Array.isArray(payload) || seen.has(payload)) return unsupported;
    seen.add(payload);
    const selected = (shape, value) => {
        const text = finalContentText(value);
        return text === null ? unsupported : { shape, text };
    };
    if (nonFinalContent(payload)) return { shape: 'content', text: '' };
    const choices = responseField(payload, 'choices');
    if (Array.isArray(choices)) {
        const choice = choices.find(item => responseField(item, 'index') === 0)
            || choices.find(item => item && responseField(item, 'index') == null);
        if (!choice || ['tool_calls', 'function_call', 'content_filter'].includes(responseField(choice, 'finish_reason'))) {
            return { shape: 'choices', text: '' };
        }
        for (const key of ['message', 'delta']) {
            if (hasResponseField(choice, key)) return selected('choices', responseField(choice, key));
        }
        return selected('choices', responseField(choice, 'text'));
    }
    for (const key of ['content', 'output_text', 'output', 'message']) {
        if (!hasResponseField(payload, key)) continue;
        const value = responseField(payload, key);
        // A wrapper's generic message string is not an assistant message.
        if (key === 'message' && (!value || typeof value !== 'object')) continue;
        return selected(key, value);
    }
    const candidates = responseField(payload, 'candidates');
    if (Array.isArray(candidates)) {
        const candidate = responseField(candidates, '0');
        const parts = responseField(responseField(candidate, 'content'), 'parts');
        return selected('candidates', parts ?? responseField(candidate, 'output'));
    }
    // Only known response containers are traversed. Never scan arbitrary keys or
    // serialize an API envelope/parsed application object into generated JSON.
    let hadWrapper = false;
    for (const key of ['data', 'result', 'response', 'body']) {
        if (!hasResponseField(payload, key)) continue;
        hadWrapper = true;
        const value = responseField(payload, key);
        if (key === 'response' && typeof value === 'string') return selected('wrapped', value);
        if (!value || typeof value !== 'object') continue;
        const nested = finalResponseSelection(value, depth + 1, seen);
        if (nested.text !== null) return { shape: 'wrapped', text: nested.text };
    }
    if (hadWrapper) return unsupported;
    if (hasResponseField(payload, 'text')) return selected('text_fallback', responseField(payload, 'text'));
    if (['reasoning', 'reasoning_content', 'thinking'].some(key => hasResponseField(payload, key))) {
        return { shape: 'empty', text: '' };
    }
    return unsupported;
}

export function extractIndependentResponseContent(payload) {
    const selected = finalResponseSelection(payload);
    return selected.text === null ? payload : selected.text;
}

const SUMMARY_FINISH_REASONS = new Set(['stop', 'end_turn', 'stop_sequence', 'length', 'max_tokens',
    'content_filter', 'tool_calls', 'function_call', 'completed', 'incomplete', 'done']);

// Pure diagnostics: fixed labels and bounded counts only. Provider text, keys,
// identifiers and error messages are never returned, even for unsupported shapes.
export function responseShapeSummary(payload) {
    const summary = { shape: 'unsupported', finalChars: 0, reasoningChars: 0, finishReason: 'none' };
    try {
        const selected = finalResponseSelection(payload);
        summary.shape = payloadHasProviderError(payload) ? 'error' : selected.shape;
        summary.finalChars = summary.shape === 'error' ? 0 : Math.min(core_constants.MAX_GENERATION_OUTPUT_CHARS, selected.text?.length || 0);
        const seen = new Set();
        const addReasoning = value => {
            if (typeof value === 'string') summary.reasoningChars = Math.min(core_constants.MAX_GENERATION_OUTPUT_CHARS, summary.reasoningChars + value.length);
        };
        const visit = (node, depth = 0, reasoning = false) => {
            if (depth > 8 || seen.size >= 256) return;
            if (typeof node === 'string') { if (reasoning) addReasoning(node); return; }
            if (!node || typeof node !== 'object' || seen.has(node)) return;
            seen.add(node);
            if (Array.isArray(node)) {
                for (let i = 0; i < Math.min(node.length, 256); i += 1) visit(responseField(node, String(i)), depth + 1, reasoning);
                return;
            }
            const type = responseField(node, 'type');
            reasoning = reasoning || responseField(node, 'thought') === true
                || (typeof type === 'string' && /(?:reasoning|thought|thinking|analysis)/i.test(type));
            for (const key of ['reasoning', 'reasoning_content', 'thinking']) visit(responseField(node, key), depth + 1, true);
            for (const key of ['finish_reason', 'finishReason', 'stop_reason', 'status']) {
                const raw = responseField(node, key);
                if (typeof raw !== 'string' || (key === 'status' && !['completed', 'incomplete'].includes(raw))) continue;
                if (summary.finishReason === 'none') summary.finishReason = SUMMARY_FINISH_REASONS.has(raw.toLowerCase()) ? raw.toLowerCase() : 'unknown';
            }
            for (const key of ['choices', 'message', 'delta', 'content', 'output', 'candidates', 'parts', 'data', 'result', 'response', 'body']) {
                visit(responseField(node, key), depth + 1, reasoning);
            }
            if (reasoning) for (const key of ['text', 'value', 'output_text', 'summary']) visit(responseField(node, key), depth + 1, true);
        };
        visit(payload);
        const completion = manualStreamCompletionInfo(payload);
        if (completion) { summary.finishReason = SUMMARY_FINISH_REASONS.has(completion.finishReason) ? completion.finishReason : 'unknown';
            summary.reasoningChars = Math.max(summary.reasoningChars, completion.reasoningChars || 0); }
    } catch { return { shape: 'unsupported', finalChars: 0, reasoningChars: 0, finishReason: 'none' }; }
    return summary;
}

export function payloadHasProviderError(payload) {
    const seen = new Set();
    const presentError = value => value === true
        || (Number.isFinite(Number(value)) && Number(value) >= 400 && Number(value) <= 599)
        || (typeof value === 'string' && !!value.trim())
        || (Array.isArray(value) && value.length > 0)
        || (!!value && typeof value === 'object');
    const visit = (node, depth) => {
        if (!node || typeof node !== 'object' || seen.has(node) || depth > 4) return false;
        seen.add(node);
        if (presentError(node.error) || presentError(node.errors) || node.ok === false || node.success === false) return true;
        for (const value of [node.status, node.statusCode, node.code]) {
            const numeric = Number(value);
            if (Number.isFinite(numeric) && numeric >= 400 && numeric <= 599) return true;
            const label = String(value || '').trim().toLowerCase();
            if (['error', 'failed', 'failure', 'denied', 'unauthorized', 'forbidden'].includes(label)) return true;
        }
        const message = String(node.message || node.detail || '').trim();
        if (message && /(?:unauthori[sz]ed|forbidden|authentication\s+failed|invalid\s+(?:api\s*)?key|access\s+denied|quota\s+exceeded)/i.test(message)) return true;
        return ['data', 'result', 'response', 'body', 'details'].some(key => visit(node[key], depth + 1));
    };
    return visit(payload, 0);
}

export function assertIndependentResponsePayload(payload) {
    if (payloadHasProviderError(payload)) {
        throw providerEnvelopeFailure(payload, false);
    }
    const content = extractIndependentResponseContent(payload);
    if (typeof content !== 'string') {
        const error = apiError('连接返回的正文结构暂不支持，尚未取得可解析的最终正文；旧内容未改变。请导出诊断报告检查返回形态。', 'RMT_RESPONSE_FORMAT');
        error.retryable = false;
        error.retryableJson = false;
        throw error;
    }
    if (typeof content === 'string' && looksLikeHtmlResponse(content)) {
        const error = apiError('专用连接返回了 HTML 页面；响应正文已隐藏。', 'RMT_RESPONSE_HTML');
        error.retryable = false;
        throw error;
    }
    if (!content.trim()) throw emptyFinalFailure(responseShapeSummary(payload));
    return content;
}

// Transport completion is local authority, not model JSON. A provider cannot forge it
// by emitting fields named complete/finishReason. Keep partial text out of Error objects.
const manualStreamCompletions = new WeakMap();

const STREAM_FINISH_REASONS = new Set(['stop', 'end_turn', 'stop_sequence', 'length', 'max_tokens', 'content_filter', 'tool_calls', 'function_call']);

const COMPLETE_STREAM_REASONS = new Set(['stop', 'end_turn', 'stop_sequence', 'done']);

export function streamFinishReason(value) {
    if (value == null || value === '') return '';
    return typeof value === 'string' && STREAM_FINISH_REASONS.has(value) ? value : 'unknown';
}

export function streamCompletion(content, finishReason, interrupted = false, reasoningChars = 0, publicStream = false) {
    const result = Object.freeze({ content });
    manualStreamCompletions.set(result, Object.freeze({
        complete: !interrupted && COMPLETE_STREAM_REASONS.has(finishReason),
        finishReason, interrupted: interrupted === true, reasoningChars: Math.max(0, Math.min(core_constants.MAX_GENERATION_OUTPUT_CHARS, Number(reasoningChars) || 0)), publicStream,
    }));
    return result;
}

export function manualStreamCompletionInfo(result) {
    return result && typeof result === 'object' ? manualStreamCompletions.get(result) || null : null;
}

// Call inside the JSON-parser/recovery try block, after the normal origin/config guard.
// Its catch can pass the separately held content to recordRecoveryTruncation unchanged.
export function assertManualStreamComplete(result) {
    const completion = manualStreamCompletionInfo(result);
    const rawFinish = completion ? '' : responseShapeSummary(result).finishReason;
    if (['length', 'max_tokens', 'incomplete'].includes(rawFinish)) {
        const error = apiError('渠道明确报告输出未完成；原成功分段保留，不会自动请求。', 'RMT_JSON_TRUNCATED');
        error.retryable = false; error.retryableJson = false; throw error;
    }
    if (completion && !completion.complete && !(completion.publicStream && !completion.interrupted && completion.finishReason === 'unknown')) {
        const error = apiError('流式正文尚未完整结束；已停止本段，不会自动重发请求。可保留草稿后显式继续。', 'RMT_JSON_TRUNCATED');
        error.retryable = false;
        error.retryableJson = false;
        throw error;
    }
    return true;
}

const transportFailures = new WeakMap();

export function transportFailureSummary(error) { return transportFailures.get(error) || null; }

export function emptyFinalFailure(summary) {
    const error = apiError(summary.reasoningChars ? '本次响应只有推理字段，没有最终正文；未采用推理内容，也没有自动重试。请按渠道文档调整推理参数或流式设置后再点击。' : '本次响应没有最终正文；未自动重试，请检查渠道状态和参数。',
        summary.reasoningChars ? 'RMT_JSON_EMPTY_FINAL_WITH_REASONING' : 'RMT_JSON_EMPTY_FINAL');
    error.retryable = false; error.retryableJson = false;
    transportFailures.set(error, { shape: summary.shape || 'empty', finalChars: 0,
        reasoningChars: Math.min(core_constants.MAX_GENERATION_OUTPUT_CHARS, summary.reasoningChars || 0), finishReason: summary.finishReason || 'unknown' });
    return error;
}

// Public ConnectionManager streaming contract: cumulative text + separate reasoning.
// Its API does not expose the provider finish reason; do not manufacture a stop code.
export async function readProfileCompletion(result, { signal = null } = {}) {
    if (typeof result !== 'function') return result;
    const iterator = result();
    if (!iterator || typeof iterator.next !== 'function') throw apiError('连接未提供可读取的流式结果。', 'RMT_RESPONSE_FORMAT');
    let content = '', reasoningChars = 0, interrupted = false, rejectAbort;
    const abort = new Promise((_,reject) => { rejectAbort = reject; });
    const onAbort = () => { rejectAbort(streamAbortReason(signal)); };
    signal?.addEventListener?.('abort', onAbort, { once:true });
    try {
        if (signal?.aborted) throw streamAbortReason(signal);
        for (;;) {
            const item = await Promise.race([iterator.next(), abort]);
            if (signal?.aborted) throw streamAbortReason(signal);
            if (item.done) break;
            const next = responseField(item.value, 'text');
            if (typeof next !== 'string' || !next.startsWith(content)) throw apiError('连接的流式正文结构异常。', 'RMT_RESPONSE_FORMAT');
            const reasoning = responseField(responseField(item.value, 'state'), 'reasoning');
            reasoningChars = Math.max(reasoningChars, typeof reasoning === 'string' ? reasoning.length : 0);
            if (next.length > core_constants.MAX_GENERATION_OUTPUT_CHARS
                || new TextEncoder().encode(next).byteLength > core_constants.MAX_MANUAL_API_RESPONSE_BYTES
                || reasoningChars > core_constants.MAX_MANUAL_API_RESPONSE_BYTES) throw apiError('流式响应超过安全范围。', 'RMT_MANUAL_RESPONSE_TOO_LARGE');
            content = next;
        }
    } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw streamAbortReason(signal);
        if (error?.code === 'RMT_MANUAL_RESPONSE_TOO_LARGE' || error?.code === 'RMT_RESPONSE_FORMAT') throw error;
        if (!content.trim()) throw error;
        interrupted = true;
    } finally {
        signal?.removeEventListener?.('abort', onAbort);
        try { void iterator.return?.()?.catch?.(() => {}); } catch {}
    }
    if (!content.trim()) throw emptyFinalFailure({ reasoningChars });
    return streamCompletion(content, 'unknown', interrupted, reasoningChars, true);
}

export function streamReadError(code = 'RMT_MANUAL_INVALID_JSON') {
    const error = apiError(code === 'RMT_MANUAL_PROVIDER_ERROR'
        ? '手动 API 在流式响应中返回错误；详情已隐藏，本段不会自动重发。'
        : '流式响应没有完整结束或格式无效；详情已隐藏，本段不会自动重发。', code);
    error.retryable = false;
    error.retryableJson = false;
    return error;
}

export function streamAbortReason(signal) {
    return signal?.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError');
}
