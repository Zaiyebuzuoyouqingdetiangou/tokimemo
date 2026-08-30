// Heartbeat Memories independent API transport boundary.
// Manual providers are reached only through SillyTavern's fixed same-origin custom backend.
import * as core_constants from './constants.js';
import * as core_text from './text.js';

export const PROFILE_ONE_CLICK_UI_VERSION = '1.1.18';
export const PROFILE_ONE_CLICK_TECHNICAL_VERSION = 'SillyTavern 1.18.0+';

const MANUAL_STATUS_ENDPOINT = '/api/backends/chat-completions/status';
const MANUAL_GENERATE_ENDPOINT = '/api/backends/chat-completions/generate';
const KNOWN_API_ENDPOINT_RE = /\/(?:chat\/completions|completions|responses|messages|embeddings|models)\/?$/i;

function apiError(message, code, status = 0) {
    const error = new Error(message);
    error.code = code;
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
        `一键配置要求 ${PROFILE_ONE_CLICK_UI_VERSION} 对应的新版 Connection Manager 能力（${PROFILE_ONE_CLICK_TECHNICAL_VERSION}）。当前页面未提供安全的 Profile Secret 与模型覆盖能力；本次没有发送请求。`,
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
        ]);
    }
    return JSON.stringify([
        mode,
        core_text.normalizeText(settings?.connectionProfileId, 160),
        core_text.normalizeText(settings?.modelOverride, 240),
        Number(settings?.maxTokens) || 0,
        Number(settings?.temperature) || 0,
    ]);
}

export function manualModelCacheKey(settings) {
    let base = '';
    try { base = normalizeManualApiBaseUrl(settings?.manualApiBaseUrl); } catch { base = 'invalid'; }
    const key = core_text.normalizeText(settings?.manualApiKey, 4000);
    return `manual:${core_text.hashString(`${base}|${key.length}:${core_text.hashString(key)}`)}`;
}

function requestHeaders(context) {
    let headers = {};
    try { headers = typeof context?.getRequestHeaders === 'function' ? context.getRequestHeaders() : {}; } catch {}
    return { ...(headers && typeof headers === 'object' ? headers : {}), 'Content-Type': 'application/json' };
}

async function boundedResponseText(response, maxBytes = core_constants.MAX_MANUAL_API_RESPONSE_BYTES) {
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

async function boundedJson(response, maxBytes) {
    const text = await boundedResponseText(response, maxBytes);
    try {
        return JSON.parse(text);
    } catch {
        throw apiError('模型服务没有返回可解析的 JSON。', 'RMT_MANUAL_INVALID_JSON', Number(response?.status) || 0);
    }
}

export async function readBoundedJsonResponse(response, maxBytes = core_constants.MAX_MANUAL_API_RESPONSE_BYTES) {
    return await boundedJson(response, maxBytes);
}

function httpFailure(status) {
    const code = Number(status) || 0;
    return apiError(
        code ? `手动 API 请求失败（HTTP ${code}）。请检查手动配置与服务状态。` : '手动 API 请求失败。请检查手动配置与服务状态。',
        'RMT_MANUAL_HTTP',
        code,
    );
}

function providerEnvelopeFailure() {
    const error = apiError('手动 API 返回了错误状态，请检查服务配置后重试。', 'RMT_MANUAL_PROVIDER_ERROR', 502);
    error.retryable = false;
    return error;
}

export function assertManualApiCredentialTransport(baseUrl, apiKey) {
    const normalized = normalizeManualApiBaseUrl(baseUrl, { required: true });
    const parsed = new URL(normalized);
    const loopback = /^(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/i.test(parsed.hostname);
    if (core_text.normalizeText(apiKey, 4000) && parsed.protocol !== 'https:' && !loopback) {
        throw apiError('带 API Key 的手动地址必须使用 HTTPS；仅本机 localhost/127.0.0.1/::1 可使用 HTTP。', 'RMT_MANUAL_API_TRANSPORT');
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

function visibleContentText(value, depth = 0) {
    if (depth > 5 || value == null) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(item => visibleContentText(item, depth + 1)).filter(Boolean).join('');
    if (typeof value !== 'object') return '';
    const type = String(value.type || '').toLowerCase();
    if (/(?:reasoning|thought|analysis)/.test(type)) return '';
    if (typeof value.text === 'string') return value.text;
    if (typeof value.text?.value === 'string') return value.text.value;
    if (typeof value.output_text === 'string') return value.output_text;
    if (Object.prototype.hasOwnProperty.call(value, 'content')) return visibleContentText(value.content, depth + 1);
    return '';
}

export function extractIndependentResponseContent(payload) {
    if (typeof payload === 'string') return payload;
    if (!payload || typeof payload !== 'object') return payload;
    const candidates = [
        payload?.choices?.[0]?.message?.content,
        payload?.choices?.[0]?.text,
        payload?.choices?.[0]?.delta?.content,
        payload?.message?.content,
        payload?.text,
        payload?.output_text,
        payload?.response,
        payload?.candidates?.[0]?.content?.parts,
        payload?.candidates?.[0]?.output,
        payload?.data?.choices?.[0]?.message?.content,
        payload?.data?.content,
        payload?.data?.text,
        payload?.data?.output_text,
        payload?.data?.response,
    ];
    if (Object.prototype.hasOwnProperty.call(payload, 'content')) candidates.push(payload.content);
    if (Array.isArray(payload.output)) candidates.push(payload.output);
    for (const candidate of candidates) {
        const text = visibleContentText(candidate);
        if (text) return text;
    }
    return payload;
}

export function payloadHasProviderError(payload) {
    return !!payload && typeof payload === 'object'
        && (payload.error === true || (typeof payload.error === 'string' && payload.error.trim()) || (payload.error && typeof payload.error === 'object'));
}

export async function fetchManualApiModels(settings, context, options = {}) {
    const customUrl = assertManualApiCredentialTransport(settings?.manualApiBaseUrl, settings?.manualApiKey);
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw apiError('当前环境没有可用的网络请求能力。', 'RMT_MANUAL_FETCH_UNAVAILABLE');
    const controller = new AbortController();
    const externalSignal = options.signal || null;
    let timedOut = false;
    const forwardAbort = () => {
        try { controller.abort(externalSignal?.reason); } catch {}
    };
    if (externalSignal?.aborted) forwardAbort();
    else externalSignal?.addEventListener?.('abort', forwardAbort, { once: true });
    const timeoutId = setTimeout(() => {
        timedOut = true;
        try { controller.abort(); } catch {}
    }, core_constants.MANUAL_API_MODEL_LIST_TIMEOUT_MS);
    try {
        const response = await fetchImpl(MANUAL_STATUS_ENDPOINT, {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-cache',
            headers: requestHeaders(context),
            signal: controller.signal,
            body: JSON.stringify({
                chat_completion_source: 'custom',
                custom_url: customUrl,
                custom_include_headers: manualApiHeadersJson(settings?.manualApiKey),
                custom_include_body: '',
                custom_exclude_body: '',
            }),
        });
        if (!response?.ok) {
            try { await response?.body?.cancel?.(); } catch {}
            throw httpFailure(response?.status);
        }
        const payload = await boundedJson(response, 2000000);
        if (payloadHasProviderError(payload)) throw providerEnvelopeFailure();
        const models = extractManualModelIds(payload);
        if (!models.length) throw apiError('接口没有返回可用模型；仍可直接填写模型 ID。', 'RMT_MANUAL_MODELS_EMPTY');
        return models;
    } catch (error) {
        if (timedOut) throw apiError('拉取模型超时；仍可直接填写模型 ID。', 'RMT_MANUAL_MODEL_TIMEOUT');
        throw error;
    } finally {
        clearTimeout(timeoutId);
        try { externalSignal?.removeEventListener?.('abort', forwardAbort); } catch {}
    }
}

export async function requestManualApiCompletion(settings, context, messages, maxTokens, options = {}) {
    const customUrl = assertManualApiCredentialTransport(settings?.manualApiBaseUrl, settings?.manualApiKey);
    const model = core_text.normalizeText(options.model || settings?.manualApiModel, 240);
    if (!model) throw apiError('请先填写手动 API 的模型 ID。', 'RMT_MANUAL_MODEL');
    if (!Array.isArray(messages) || !messages.length) throw apiError('手动 API 请求缺少消息。', 'RMT_MANUAL_MESSAGES');
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw apiError('当前环境没有可用的网络请求能力。', 'RMT_MANUAL_FETCH_UNAVAILABLE');
    const body = {
        model,
        messages,
        max_tokens: Math.max(1, Math.min(core_constants.MAX_GENERATION_OUTPUT_TOKENS, Number(maxTokens) || core_constants.DEFAULT_SETTINGS.maxTokens)),
        temperature: Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : settings?.temperature,
        stream: false,
        chat_completion_source: 'custom',
        custom_url: customUrl,
        custom_include_headers: manualApiHeadersJson(settings?.manualApiKey),
        custom_include_body: '',
        custom_exclude_body: '',
    };
    const response = await fetchImpl(MANUAL_GENERATE_ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-cache',
        headers: requestHeaders(context),
        signal: options.signal || null,
        body: JSON.stringify(body),
    });
    if (!response?.ok) {
        try { await response?.body?.cancel?.(); } catch {}
        throw httpFailure(response?.status);
    }
    const payload = await boundedJson(response, core_constants.MAX_MANUAL_API_RESPONSE_BYTES);
    if (payloadHasProviderError(payload)) throw providerEnvelopeFailure();
    const content = extractIndependentResponseContent(payload);
    if (typeof content === 'string' && !content.trim()) throw apiError('手动 API 没有返回可见正文。', 'RMT_MANUAL_EMPTY');
    return content;
}
