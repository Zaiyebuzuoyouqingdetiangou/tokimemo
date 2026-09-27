import * as manual_credentials from './manualCredentialStore.js';
import * as advanced_generation from './advancedGeneration.js';
import * as output_budget from './outputBudget.js';
import * as core_constants from './constants.js';
import * as core_text from './text.js';
import { MANUAL_GENERATE_ENDPOINT, MANUAL_STATUS_ENDPOINT, apiError, assertManualApiCredentialTransport, boundedJson, boundedResponseText, emptyFinalFailure, extractIndependentResponseContent, extractManualModelIds, httpFailure, manualApiHeadersJson, normalizeManualApiBaseUrl, payloadHasProviderError, providerEnvelopeFailure, requestHeaders, responseShapeSummary, streamAbortReason, streamCompletion, streamFinishReason, streamReadError, visibleContentText } from './independentApiConfig.js';
// 独立 API 请求：拉取模型列表、发起补全请求
// 从 core/independentApi.js 原样搬出（重构阶段 2），声明文本一字未改；core/independentApi.js 仍转发原有导出。

async function readManualApiStream(response, options = {}) {
    const maxBytes = core_constants.MAX_MANUAL_API_RESPONSE_BYTES;
    const declaredBytes = Number(response?.headers?.get?.('content-length'));
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
        try { void response?.body?.cancel?.()?.catch?.(() => {}); } catch {}
        throw apiError('模型服务返回内容过大，已停止读取。', 'RMT_MANUAL_RESPONSE_TOO_LARGE');
    }
    const reader = response?.body?.getReader?.();
    if (!reader) throw streamReadError();
    const signal = options.signal || null;
    const decoder = new TextDecoder('utf-8');
    let bytes = 0, content = '', line = '', eventType = '', dataLines = [], reasoningChars = 0, protocol = '';
    const blockKinds = new Map();
    let responseOutputIndex = null;
    const chooseProtocol = kind => { if (protocol && protocol !== kind) throw streamReadError(); protocol = kind; };
    const countReasoning = payload => { reasoningChars = Math.min(core_constants.MAX_GENERATION_OUTPUT_CHARS, reasoningChars + responseShapeSummary(payload).reasoningChars); };
    let previousCR = false, firstCharacter = true, terminal = false, finishReason = '', interrupted = false;
    const cancel = () => { try { void reader.cancel().catch(() => {}); } catch {} };
    // reader.cancel settles outstanding read() calls. Avoid adding one reaction per
    // tiny network fragment to a long-lived abort promise.
    const onAbort = () => { cancel(); };
    const append = value => {
        if (content.length + value.length > core_constants.MAX_GENERATION_OUTPUT_CHARS) {
            throw apiError('模型服务返回内容过大，已停止读取。', 'RMT_MANUAL_RESPONSE_TOO_LARGE');
        }
        content += value;
    };
    const dispatch = () => {
        const data = dataLines.join('\n');
        const type = eventType;
        dataLines = [];
        eventType = '';
        if (!data) return;
        if (type === 'error') throw streamReadError('RMT_MANUAL_PROVIDER_ERROR');
        if (data.trim() === '[DONE]') {
            if (!finishReason) finishReason = 'done';
            terminal = true;
            return;
        }
        let payload;
        try { payload = JSON.parse(data); } catch { throw streamReadError(); }
        if (payloadHasProviderError(payload)) throw streamReadError('RMT_MANUAL_PROVIDER_ERROR');
        if (!payload || typeof payload !== 'object') throw streamReadError();
        // Accept only documented final-bearing event shapes, never JSON from
        // reasoning/tool blocks. A stream cannot silently switch protocols.
        const semanticType = payload.type || type;
        if (Array.isArray(payload.candidates)) {
            chooseProtocol('gemini');
            const candidate = payload.candidates.find(value => value?.index === 0) || payload.candidates.find(value => value?.index == null);
            if (!candidate) return;
            countReasoning({ candidates: [candidate] });
            const visible = visibleContentText(candidate.content?.parts); if (visible) append(visible);
            if (candidate.finishReason) {
                const mapped = { STOP:'stop', MAX_TOKENS:'max_tokens', SAFETY:'content_filter', RECITATION:'content_filter', BLOCKLIST:'content_filter', PROHIBITED_CONTENT:'content_filter' };
                finishReason = mapped[candidate.finishReason] || 'unknown'; terminal = true;
            }
            return;
        }
        if (typeof semanticType === 'string' && semanticType.startsWith('response.')) {
            chooseProtocol('responses');
            if (semanticType === 'response.output_text.delta') {
                // Responses output may begin with a reasoning item; the first
                // visible message is not necessarily output_index 0. Never join
                // a second output item into the selected final message.
                const index = payload.output_index ?? 0;
                if (!Number.isSafeInteger(index) || index < 0) throw streamReadError();
                responseOutputIndex ??= index;
                if (index === responseOutputIndex && typeof payload.delta === 'string') append(payload.delta);
            } else if (/^response\.reasoning(?:_summary)?_text\.delta$/.test(semanticType)) {
                if (typeof payload.delta === 'string') reasoningChars = Math.min(core_constants.MAX_GENERATION_OUTPUT_CHARS, reasoningChars + payload.delta.length);
            } else if (['response.completed','response.incomplete','response.failed'].includes(semanticType)) {
                if (semanticType === 'response.failed') throw streamReadError('RMT_MANUAL_PROVIDER_ERROR');
                const full = extractIndependentResponseContent(payload.response);
                if (typeof full === 'string' && full) {
                    if (content && !full.startsWith(content)) throw streamReadError();
                    if (full.length > content.length) append(full.slice(content.length));
                }
                finishReason = semanticType === 'response.completed' ? 'stop' : 'length'; terminal = true;
            }
            return;
        }
        if (['message_start','content_block_start','content_block_delta','content_block_stop','message_delta','message_stop','ping'].includes(semanticType)) {
            if (semanticType === 'ping') return;
            chooseProtocol('anthropic');
            if (semanticType === 'message_start' && payload.message?.role !== 'assistant') throw streamReadError();
            if (semanticType === 'content_block_start') {
                if (!Number.isSafeInteger(payload.index) || payload.index < 0 || blockKinds.size >= 4096) throw streamReadError();
                blockKinds.set(payload.index, payload.content_block?.type || 'unknown');
                if (payload.content_block?.type === 'text') append(visibleContentText(payload.content_block));
                else countReasoning(payload.content_block);
            } else if (semanticType === 'content_block_delta') {
                const kind = blockKinds.get(payload.index);
                if (kind === 'text' && payload.delta?.type === 'text_delta' && typeof payload.delta.text === 'string') append(payload.delta.text);
                else if (kind === 'thinking' && typeof payload.delta?.thinking === 'string') reasoningChars = Math.min(core_constants.MAX_GENERATION_OUTPUT_CHARS, reasoningChars + payload.delta.thinking.length);
            } else if (semanticType === 'message_delta') finishReason = streamFinishReason(payload.delta?.stop_reason) || finishReason;
            else if (semanticType === 'message_stop') { finishReason ||= 'unknown'; terminal = true; }
            return;
        }
        // OpenAI-compatible choice deltas (DeepSeek, Qwen, GLM, Doubao, Gemini
        // compatibility endpoints etc.) share this path regardless of model name.
        const choices = Array.isArray(payload.choices) ? payload.choices : [];
        const choice = choices.find(value => value?.index === 0)
            || choices.find(value => value && value.index == null);
        if (!choice) return;
        chooseProtocol('choices'); countReasoning({ choices: [choice] });
        let visible = visibleContentText(choice.delta?.content);
        if (!visible && typeof choice.text === 'string') visible = choice.text;
        if (!visible && choice.message?.content != null) {
            const full = visibleContentText(choice.message.content);
            if (content && !full.startsWith(content)) throw streamReadError();
            visible = full.slice(content.length);
        }
        if (visible) append(visible);
        if (choice.delta?.refusal || choice.message?.refusal) {
            finishReason = 'content_filter';
            terminal = true;
            return;
        }
        const reason = streamFinishReason(choice.finish_reason);
        if (reason) {
            finishReason = reason;
            terminal = true;
        }
    };
    const consumeLine = () => {
        if (!line) dispatch();
        else if (!line.startsWith(':')) {
            // A transport wrapper is not an SSE field; do not fish valid events
            // out of an HTML page merely because its header/comment looks SSE-like.
            if (line.trimStart().startsWith('<')) throw apiError('模型服务返回了 HTML 页面，响应正文已隐藏。', 'RMT_RESPONSE_HTML');
            const colon = line.indexOf(':');
            const field = colon < 0 ? line : line.slice(0, colon);
            let value = colon < 0 ? '' : line.slice(colon + 1);
            if (value.startsWith(' ')) value = value.slice(1);
            if (field === 'data') dataLines.push(value);
            else if (field === 'event') eventType = value;
            // id/retry are deliberately ignored: this paid request never reconnects.
        }
        line = '';
    };
    const consume = text => {
        // SSE permits CRLF, CR, or LF; a split CRLF is one newline, not two.
        for (const character of text) {
            if (terminal) break;
            if (firstCharacter) { firstCharacter = false; if (character === '\uFEFF') continue; }
            if (previousCR) { previousCR = false; if (character === '\n') continue; }
            if (character === '\r' || character === '\n') {
                consumeLine();
                previousCR = character === '\r';
            } else line += character;
        }
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });
    try {
        if (signal?.aborted) throw streamAbortReason(signal);
        while (!terminal) {
            const { value, done } = await reader.read();
            if (signal?.aborted) throw streamAbortReason(signal);
            if (done) {
                consume(decoder.decode());
                // Per SSE framing, EOF does not dispatch an unfinished event.
                if (!terminal) interrupted = true;
                break;
            }
            bytes += value?.byteLength || 0;
            if (bytes > maxBytes) throw apiError('模型服务返回内容过大，已停止读取。', 'RMT_MANUAL_RESPONSE_TOO_LARGE');
            consume(decoder.decode(value, { stream: true }));
        }
    } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw streamAbortReason(signal);
        if (!content.trim()) {
            if (['RMT_MANUAL_INVALID_JSON', 'RMT_MANUAL_PROVIDER_ERROR', 'RMT_MANUAL_RESPONSE_TOO_LARGE', 'RMT_RESPONSE_HTML'].includes(error?.code)) throw error;
            throw streamReadError();
        }
        // Previously dispatched visible text may be recoverable; never append the
        // malformed/error event, put provider text in an Error, or issue another fetch.
        interrupted = true;
    } finally {
        signal?.removeEventListener?.('abort', onAbort);
        cancel();
        try { reader.releaseLock(); } catch {}
    }
    if (signal?.aborted) throw streamAbortReason(signal);
    if (!content.trim()) throw emptyFinalFailure({ shape: protocol === 'gemini' ? 'candidates' : 'choices', reasoningChars, finishReason });
    return streamCompletion(content, finishReason, interrupted, reasoningChars);
}

// The host may forward SSE without Content-Type, or a provider may answer a
// streaming request with ordinary JSON. Inspect only a bounded prefix of this
// response, then replay every consumed byte into the existing parser. No tee,
// second fetch, persistent setting change or provider-body diagnostics are used.
const MANUAL_RESPONSE_SNIFF_BYTES = 8192;

function manualResponseKind(prefix, ended, contentType) {
    const head = prefix.replace(/^\uFEFF/, '').trimStart();
    if (!head) return ended ? (contentType.includes('text/event-stream') ? 'sse' : 'json') : '';
    // JSON always wins over a misleading event-stream header. HTML goes through
    // the existing whole-document HTML rejection, never a JSON-island search.
    if ('{["<'.includes(head[0]) || /[0-9tfn-]/.test(head[0])) return 'json';
    if (head.startsWith(':')) return 'sse';
    for (const field of ['data', 'event', 'id', 'retry']) {
        if (head.startsWith(`${field}:`) || head.startsWith(`${field}\n`) || head.startsWith(`${field}\r`)) return 'sse';
        if (!ended && field.startsWith(head)) return '';
    }
    // With a real SSE header, unknown SSE fields retain their original handling.
    // Without it, unknown/plain content is not upgraded to a model completion.
    return contentType.includes('text/event-stream') ? 'sse' : 'json';
}

async function readManualCompletionResponse(response, options = {}) {
    const maxBytes = core_constants.MAX_MANUAL_API_RESPONSE_BYTES;
    const contentType = String(response?.headers?.get?.('content-type') || '').toLowerCase();
    const declaredBytes = Number(response?.headers?.get?.('content-length'));
    if (contentType.includes('text/html')) {
        try { void response?.body?.cancel?.()?.catch?.(() => {}); } catch {}
        throw apiError('模型服务返回了 HTML 页面，响应正文已隐藏。', 'RMT_RESPONSE_HTML', Number(response?.status) || 0);
    }
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
        try { void response?.body?.cancel?.()?.catch?.(() => {}); } catch {}
        throw apiError('模型服务返回内容过大，已停止读取。', 'RMT_MANUAL_RESPONSE_TOO_LARGE', Number(response?.status) || 0);
    }
    const signal = options.signal || null;
    let reader = response?.body?.getReader?.();
    if (!reader) {
        // Older fetch shims may only expose text(). Preserve their bounded read;
        // turn that single result into a replayable local byte reader, not IO.
        const text = await boundedResponseText(response, maxBytes);
        const bytes = new TextEncoder().encode(text);
        let used = false;
        reader = {
            read: async () => used ? { done: true } : (used = true, { done: false, value: bytes }),
            cancel: async () => { used = true; },
            releaseLock: () => {},
        };
    }
    const buffered = [];
    let cursor = 0, ended = false, cancelled = false;
    const cancel = () => {
        if (cancelled) return;
        cancelled = true;
        try { void reader.cancel()?.catch?.(() => {}); } catch {}
    };
    const onAbort = () => { cancel(); };
    const replay = {
        read: async () => {
            if (signal?.aborted) throw streamAbortReason(signal);
            if (cursor < buffered.length) {
                const value = buffered[cursor];
                buffered[cursor++] = null;
                return { done: false, value };
            }
            return ended ? { done: true } : await reader.read();
        },
        cancel: async () => { cancel(); },
        releaseLock: () => {}, // The owner below releases the original lock once.
    };
    const replayResponse = {
        status: response?.status, headers: response?.headers,
        body: { getReader: () => replay, cancel: async () => { cancel(); } },
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });
    try {
        if (signal?.aborted) throw streamAbortReason(signal);
        const decoder = new TextDecoder('utf-8');
        let prefix = '', prefixBytes = 0, receivedBytes = 0, kind = '';
        while (!kind) {
            const { value, done } = await reader.read();
            if (signal?.aborted) throw streamAbortReason(signal);
            if (done) { ended = true; prefix += decoder.decode(); }
            else {
                receivedBytes += value?.byteLength || 0;
                if (receivedBytes > maxBytes) throw apiError('模型服务返回内容过大，已停止读取。', 'RMT_MANUAL_RESPONSE_TOO_LARGE');
                if (value?.byteLength) {
                    buffered.push(value);
                    const head = value.subarray(0, Math.max(0, MANUAL_RESPONSE_SNIFF_BYTES - prefixBytes));
                    prefixBytes += head.byteLength;
                    prefix += decoder.decode(head, { stream: true });
                }
            }
            kind = manualResponseKind(prefix, ended || prefixBytes >= MANUAL_RESPONSE_SNIFF_BYTES, contentType);
        }
        if (kind === 'sse') return { streaming: true, payload: await readManualApiStream(replayResponse, options) };
        const payload = await boundedJson(replayResponse, maxBytes);
        if (signal?.aborted) throw streamAbortReason(signal);
        return { streaming: false, payload };
    } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError') throw streamAbortReason(signal);
        if (error?.safeToDisplay === true) throw error;
        throw streamReadError();
    } finally {
        signal?.removeEventListener?.('abort', onAbort);
        cancel();
        buffered.length = 0;
        try { reader.releaseLock(); } catch {}
    }
}

async function manualRequestSettings(settings, signal) {
    if (signal?.aborted) throw streamAbortReason(signal);
    const base = normalizeManualApiBaseUrl(settings?.manualApiBaseUrl, { required: true });
    if (settings?.manualApiKey || !settings?.manualApiSecretRef) return settings;
    const key = await manual_credentials.readManualCredential(base, settings.manualApiSecretRef);
    if (signal?.aborted) throw streamAbortReason(signal);
    return { ...settings, manualApiKey: key };
}

export async function fetchManualApiModels(settings, context, options = {}) {
    settings = await manualRequestSettings(settings, options.signal);
    const customUrl = assertManualApiCredentialTransport(settings?.manualApiBaseUrl, settings?.manualApiKey);
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw apiError('当前环境没有可用的网络请求能力。', 'RMT_MANUAL_FETCH_UNAVAILABLE');
    const controller = new AbortController();
    const externalSignal = options.signal || null;
    let timeoutId = 0;
    let rejectExternalAbort = null;
    const forwardAbort = () => {
        const reason = externalSignal?.reason instanceof Error ? externalSignal.reason : new DOMException('Aborted', 'AbortError');
        try { controller.abort(reason); } catch {}
        rejectExternalAbort?.(reason);
    };
    if (externalSignal?.aborted) {
        const reason = externalSignal.reason instanceof Error ? externalSignal.reason : new DOMException('Aborted', 'AbortError');
        try { controller.abort(reason); } catch {}
        throw reason;
    }
    externalSignal?.addEventListener?.('abort', forwardAbort, { once: true });
    try {
        const fetchPromise = fetchImpl(MANUAL_STATUS_ENDPOINT, {
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
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                const error = apiError('拉取模型超时；仍可直接填写模型 ID。', 'RMT_MANUAL_MODEL_TIMEOUT');
                try { controller.abort(error); } catch {}
                reject(error);
            }, core_constants.MANUAL_API_MODEL_LIST_TIMEOUT_MS);
        });
        const externalAbortPromise = new Promise((_, reject) => { rejectExternalAbort = reject; });
        const response = await Promise.race([fetchPromise, timeoutPromise, externalAbortPromise]);
        if (!response?.ok) {
            try { await response?.body?.cancel?.(); } catch {}
            throw httpFailure(response);
        }
        const payload = await boundedJson(response, 2000000);
        if (payloadHasProviderError(payload)) throw providerEnvelopeFailure(payload);
        const models = extractManualModelIds(payload);
        if (!models.length) throw apiError('接口没有返回可用模型；仍可直接填写模型 ID。', 'RMT_MANUAL_MODELS_EMPTY');
        return models;
    } finally {
        clearTimeout(timeoutId);
        rejectExternalAbort = null;
        try { externalSignal?.removeEventListener?.('abort', forwardAbort); } catch {}
    }
}

export async function requestManualApiCompletion(settings, context, messages, maxTokens, options = {}) {
    settings = await manualRequestSettings(settings, options.signal);
    if (options.signal?.aborted) throw streamAbortReason(options.signal);
    const customUrl = assertManualApiCredentialTransport(settings?.manualApiBaseUrl, settings?.manualApiKey);
    const model = core_text.normalizeText(options.model || settings?.manualApiModel, 240);
    if (!model) throw apiError('请先填写手动 API 的模型 ID。', 'RMT_MANUAL_MODEL');
    if (!Array.isArray(messages) || !messages.length) throw apiError('手动 API 请求缺少消息。', 'RMT_MANUAL_MESSAGES');
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw apiError('当前环境没有可用的网络请求能力。', 'RMT_MANUAL_FETCH_UNAVAILABLE');
    const advanced = advanced_generation.parseAdvancedGeneration(settings);
    let body = {
        model,
        messages,
        max_tokens: output_budget.normalizeOutputTokens(maxTokens),
        temperature: Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : settings?.temperature,
        stream: settings?.manualApiStreaming === true,
        chat_completion_source: 'custom',
        custom_url: customUrl,
        custom_include_headers: manualApiHeadersJson(settings?.manualApiKey),
        custom_include_body: '',
        custom_exclude_body: '',
    };
    Object.assign(body, advanced_generation.advancedCarrier(advanced, 'custom'));
    body = advanced_generation.applyAdvancedExclusions(body, advanced);
    if (advanced.streamMode !== 'original') body.stream = advanced.streamMode === 'on';
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
        throw httpFailure(response);
    }
    const decoded = await readManualCompletionResponse(response, options);
    if (decoded.streaming) return decoded.payload;
    const payload = decoded.payload;
    if (payloadHasProviderError(payload)) throw providerEnvelopeFailure(payload);
    const content = extractIndependentResponseContent(payload);
    const summary = responseShapeSummary(payload);
    if (typeof content === 'string' && !content.trim()) throw emptyFinalFailure(summary);
    if (typeof content === 'string' && (body.stream || summary.reasoningChars
        || ['length','max_tokens','incomplete','content_filter','tool_calls','function_call'].includes(summary.finishReason))) {
        // JSON answered this same request. Missing completion metadata remains
        // unknown; explicit truncation never becomes a successfully saved result.
        const reason = ['none','unknown'].includes(summary.finishReason) ? 'unknown' : summary.finishReason === 'completed' ? 'stop' : summary.finishReason;
        return streamCompletion(content, reason, false, summary.reasoningChars, reason === 'unknown');
    }
    return content;
}
