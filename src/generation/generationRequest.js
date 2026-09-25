import * as connection_pool from '../core/connectionPool.js';
import * as advanced_generation from '../core/advancedGeneration.js';
import * as recovery_source from '../core/recoverySourcePolicy.js';
import * as output_budget from '../core/outputBudget.js';
import * as archive_requestBudget from '../archive/requestBudget.js';
import * as cg_policy from './cgPromptPolicy.js';
import * as core_butterflyContract from '../core/butterflyContract.js';
import * as archive_repository from '../archive/repository.js';
import * as core_cache from '../core/cache.js';
import * as core_participants from '../core/participants.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_independentApi from '../core/independentApi.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import * as creative_supplement from '../core/creativeSupplement.js';
import * as generation_recovery from './recovery.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as core_taskTrace from '../core/taskTrace.js';
import * as core_contextTags from '../core/contextTags.js';
import * as core_worldPresentation from '../core/worldPresentation.js';
import * as generation_jsonParser from './jsonParser.js';
import * as generation_prompts from './prompts.js';
import * as generation_jsonShapeExamples from './jsonShapeExamples.js';
import * as generation_requestTemperature from './requestTemperature.js';
import * as ui_overlay from '../ui/overlay.js';
import { assertNoBannedGeneratedPhrase, assertPromptBudget, contentContextSources, enrichInputBudgetError, generatedPhrasePolicyText, generationContentContext, generationContentSettings, generationTrace, generationWorldInfoScanTerms, notifyInputPackingOnce } from './generationContext.js';
// 请求发送：连接错误规范化、组装外发提示词、生成 JSON、请求与分段校验、建档分块请求
// 从 generation/client.js 原样搬出（重构阶段 2），声明文本一字未改；generation/client.js 仍转发原有导出。

export async function requestValidatedSegment(prompt, status, options, validator) {
    const logicalTask = core_requestCoordinator.logicalGenerationTaskForOrigin(options?.origin);
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
    if (logicalTask?.participantSnapshot && !options?.participantPromptApplied) {
        const block = logicalTask.participantPromptIndexed
            ? core_participants.participantIndexPromptBlock(logicalTask.participantSnapshot)
            : core_participants.participantPromptBlock(logicalTask.participantSnapshot);
        if (block && !prompt.includes(block)) prompt += block;
        options = { ...options, participantPromptApplied: true };
    }
    if (core_requestCoordinator.chatScopeCancellationBlocksOrigin(options?.origin)) {
        throw core_requestCoordinator.createGenerationAbortError();
    }
    prompt = cg_policy.cgPromptForSegment(prompt, options);
    validator = cg_policy.cgSegmentValidator(validator, options);
    const parentTrace = generationTrace(options);
    const taskTrace = core_taskTrace.startTaskTrace('', options?.mode, parentTrace);
    core_taskTrace.markStage(taskTrace, 'start');
    core_taskTrace.beginStage(taskTrace, 'prompt');
    try {
    const context = generationContentContext(options?.origin, options?.context || core_context.currentCharacterGuard());
    options = { ...options, taskTrace, context, contextEnvelope: typeof options?.contextEnvelope === 'string'
        ? options.contextEnvelope : await generation_recovery.frozenGenerationInput(options?.origin, `context:${options?.mode || 'segment'}`,
            () => core_cache.buildControlledContextEnvelope(context, { worldInfoScanTerms: generationWorldInfoScanTerms(options?.mode, context) })) };
    const result = await generation_recovery.withRecoverySegment(prompt, options, validator, async (prompt, options, accepted) => {
    let lastError = null;
    // Automatic retry is off by default. A failed segment used to silently re-run prompt
    // building, token counting and a second paid request; on a slow host that turned one
    // failure into minutes of extra billing the user could not stop. Successful segments
    // are already kept by the recovery draft, so the run stops and waits for「续写」.
    const allowAutoRetry = options?.allowAutoRetry === true;
    const configuredAttempts = allowAutoRetry
        ? Math.max(1, Math.min(core_requestCoordinator.MAX_RATE_LIMIT_ATTEMPTS, Number(options?.segmentMaxAttempts) || core_requestCoordinator.MAX_RATE_LIMIT_ATTEMPTS))
        : 1;
    const maxAttempts = Math.max(configuredAttempts, 2);
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const retryNote = attempt && lastError
            ? '\n\n【本地校验反馈】' + (core_butterflyContract.butterflyValidationFeedback(lastError) || generation_recovery.generationRetryFeedbackText(lastError?.code, lastError) || core_text.normalizeText(lastError?.repairHint, 600) || (String(lastError.code || '').startsWith('RMT_ROOM_') ? core_text.safeErrorSummary(lastError) : '上一轮结构或完整度没有通过。')) + ' 请严格按原硬性要求重新输出完整 JSON，不要解释，也不要引用这条反馈作为内容。'
            : '';
        try {
            const raw = await requestJson(`${prompt}${retryNote}`, `${status}${attempt ? `（重试 ${attempt}/${maxAttempts - 1}）` : ''}`, options);
            core_taskTrace.beginStage(options.taskTrace, 'validate');
            const value = core_requestCoordinator.validateGeneratedSegment(raw, validator);
            core_taskTrace.markStage(options.taskTrace, 'validate');
            await accepted(raw);
            return value;
        } catch (error) {
            if (options.taskTrace?.activeStage === 'validate') core_taskTrace.markStage(options.taskTrace, 'validate', false);
            if (error?.name === 'AbortError' || error?.nonRetryable === true || error?.code === 'RMT_PHONE_NO_CONVERSATION' || error?.code === 'RMT_BANNED_GENERATED_PHRASE' || error?.code === 'RMT_JSON_TRUNCATED') throw error;
            lastError = error;
            const emptyReroll = attempt === 0 && ['RMT_JSON_EMPTY_FINAL', 'RMT_JSON_EMPTY_FINAL_WITH_REASONING', 'RMT_JSON_NOT_FOUND'].includes(error?.code);
            const configuredRetry = attempt + 1 < configuredAttempts && core_requestCoordinator.shouldRetrySegmentRequest(error, attempt);
            if (attempt + 1 < maxAttempts && (emptyReroll || configuredRetry)) {
                core_taskTrace.recordRetry(options.taskTrace, error);
                core_taskTrace.beginStage(options.taskTrace, 'retry');
                try { await core_requestCoordinator.waitBeforeSegmentRetry(error, attempt); }
                finally { core_taskTrace.markStage(options.taskTrace, 'retry'); }
                continue;
            }
            throw error;
        }
    }
    throw lastError || new Error(`${status}失败。`);
    });
    core_taskTrace.finishSegmentTrace(parentTrace, taskTrace, 'ok');
    return result;
    } catch (error) {
        core_taskTrace.finishSegmentTrace(parentTrace, taskTrace, error?.name === 'AbortError' ? 'cancelled' : 'failed', error);
        throw error;
    }
}

export function normalizeConnectionManagerError(error) {
    if (error?.name === 'AbortError' || error?.retryableJson === true) return error;
    const knownInternalCodes = new Set([
        'RMT_API_CONFIG_CHANGED', 'RMT_API_CONFIGURATION_SUPERSEDED', 'RMT_API_MODEL_REQUEST_SUPERSEDED',
        'RMT_BANNED_GENERATED_PHRASE', 'RMT_JSON_EMPTY_FINAL', 'RMT_JSON_EMPTY_FINAL_WITH_REASONING',
        'RMT_JSON_INVALID', 'RMT_JSON_NOT_FOUND', 'RMT_JSON_TRUNCATED', 'RMT_MANUAL_API_TRANSPORT',
        'RMT_MANUAL_API_URL', 'RMT_MANUAL_EMPTY', 'RMT_MANUAL_FETCH_UNAVAILABLE', 'RMT_MANUAL_INVALID_JSON',
        'RMT_MANUAL_MESSAGES', 'RMT_MANUAL_MODEL', 'RMT_MANUAL_MODEL_TIMEOUT', 'RMT_MANUAL_MODELS_EMPTY',
        'RMT_MANUAL_PROVIDER_ERROR', 'RMT_MANUAL_RESPONSE_TOO_LARGE', 'RMT_PHONE_DRAFT_AVAILABLE',
        'RMT_PROFILE_CAPABILITY', 'RMT_PROFILE_MODEL_TIMEOUT', 'RMT_PROFILE_PROXY_UNAVAILABLE',
        'RMT_REQUEST_TIMEOUT', 'RMT_RESPONSE_FORMAT', 'RMT_RESPONSE_HTML', 'RMT_SEGMENT_VALIDATION', 'RMT_CONNECTION_QUOTA',
    ]);
    if (knownInternalCodes.has(String(error?.code || ''))) return error;
    const evidence = [];
    const seen = new Set();
    let cursor = error;
    let rawStatus = null;
    let rawCode = '';
    for (let depth = 0; cursor && depth < 4 && !seen.has(cursor); depth += 1) {
        seen.add(cursor);
        if (rawStatus == null) rawStatus = cursor?.status ?? cursor?.statusCode ?? cursor?.response?.status ?? null;
        if (!rawCode) rawCode = core_text.normalizeText(cursor?.code || cursor?.type, 80);
        for (const value of [cursor?.name, cursor?.message, cursor?.code, cursor?.status, cursor?.statusCode]) {
            const part = core_text.normalizeText(value, 700);
            if (part) evidence.push(part);
        }
        cursor = cursor?.cause;
    }
    const safeCode = /^(?:E[A-Z0-9_]{2,40}|ERR_[A-Z0-9_]{2,60})$/.test(rawCode) ? rawCode : '';
    const original = evidence.join(' · ').toLowerCase();
    const messageStatus = original.match(/(?:http|status(?:\s+code)?|response)\s*[:=]?\s*(\d{3})/i)
        || original.match(/(?:api|request|response).{0,40}\b(400|401|403|404|408|413|422|429|500|502|503|504)\b/i);
    const hasRawStatus = rawStatus !== null && rawStatus !== '' && Number.isFinite(Number(rawStatus));
    const candidateStatus = hasRawStatus ? Number(rawStatus) : Number(messageStatus?.[1]) || 0;
    const status = Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus <= 599 ? candidateStatus : 0;
    // Numeric transport status is authoritative; generic words from wrappers may describe
    // an authentication service being rate-limited, not an invalid user credential.
    const hints = status ? '' : original;
    const technical = status ? `（HTTP ${status}）` : safeCode ? `（${safeCode}）` : '';
    const sourceName = error?.code === 'RMT_MANUAL_HTTP' ? '手动 API' : '专用连接';
    let code = 'RMT_CONNECTION_FAILED';
    let message = `${sourceName}请求失败${technical}。没有收到可判断是否可重试的模型结果；请检查当前独立 API 设置与 SillyTavern 控制台中的上游错误，本段不会自动重试。`;
    let retryable = false;
    if (/(?:<!doctype\s+html|<html\b|<head\b|<body\b|cf-error|cdn-cgi)/i.test(original)) {
        code = 'RMT_RESPONSE_HTML';
        message = `${sourceName}返回了网页错误页而不是模型数据${technical}。请检查代理地址、鉴权和上游状态；错误页正文不会显示或保存。`;
        retryable = false;
    } else if (status === 401 || status === 403 || /(unauthori[sz]ed|forbidden|authentication|(?:invalid|incorrect|expired) api key|api key.*(?:invalid|incorrect|expired)|key.*(?:invalid|incorrect|expired))/i.test(hints)) {
        code = 'RMT_CONNECTION_AUTH';
        message = `${sourceName}认证失败${technical}。请检查当前配置、API Key 与账号权限；本段不会自动重试。`;
        retryable = false;
    } else if (status === 429 || /(too many requests|rate.?limit|quota exceeded|resource exhausted)/i.test(hints)) {
        code = 'RMT_CONNECTION_RATE_LIMIT';
        // Single observation point: from here on the throttle serialises and paces
        // provider traffic until it decays.
        core_requestCoordinator.noteProviderRateLimit(error);
        message = `模型服务正在限流${technical}。请稍后再试，旧内容仍会保留。`;
        retryable = true;
    } else if (status === 413 || ((status === 400 || !status) && /(context length|context window|too many tokens|maximum context|payload too large|request too large)/i.test(original))) {
        code = 'RMT_CONNECTION_CONTEXT_LIMIT';
        message = `本段输入超过模型或代理的上下文上限${technical}。请换用更大上下文模型，或减少导入的世界书/记忆资料；本段不会自动重试。`;
        retryable = false;
    } else if (status === 404 || /(model.*not found|profile.*not found|endpoint.*not found)/i.test(hints)) {
        code = 'RMT_CONNECTION_CONFIG';
        message = `${sourceName}、模型或上游端点不可用${technical}。请重新配置并确认模型名称；本段不会自动重试。`;
        retryable = false;
    } else if (status === 400 || status === 422 || /(invalid request|bad request|unprocessable)/i.test(hints)) {
        code = 'RMT_CONNECTION_INVALID_REQUEST';
        message = `上游拒绝了本段请求${technical}。请检查所选模型是否支持当前 Connection Manager 请求格式与最大输出；本段不会自动重试。`;
        retryable = false;
    } else if (status === 408 || status === 504 || /(gateway timeout|request timeout|timed out|etimedout)/i.test(hints)) {
        code = 'RMT_CONNECTION_SERVER';
        message = `模型服务或代理响应超时${technical}。可以稍后重试，旧内容仍会保留。`;
        retryable = true;
    } else if (/(failed to fetch|networkerror|network request failed|load failed|enotfound|fetch failed)/i.test(hints)) {
        code = 'RMT_CONNECTION_NETWORK';
        message = '无法连接模型服务。请检查地址、网络、代理与服务状态，旧内容仍会保留。';
        retryable = true;
    } else if (status >= 500 || /(bad gateway|service unavailable|upstream.*(?:failed|error)|econnreset|econnrefused)/i.test(original)) {
        code = 'RMT_CONNECTION_SERVER';
        message = `模型服务或代理暂时不可用${technical}。可以稍后重试，旧内容仍会保留。`;
        retryable = true;
    }
    const normalized = new Error(message);
    normalized.code = code;
    normalized.safeToDisplay = true;
    normalized.safeUserMessage = message;
    normalized.status = status || undefined;
    normalized.retryable = retryable;
    if (code === 'RMT_CONNECTION_RATE_LIMIT' && Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0) {
        normalized.retryAfterMs = Math.min(86400000, Math.ceil(error.retryAfterMs));
    }
    return normalized;
}

export async function generateConfiguredJson(prompt, options = {}) {
    const logicalTask = core_requestCoordinator.logicalGenerationTaskForOrigin(options.origin);
    if (!logicalTask) return generateConfiguredJsonOperation(prompt, options);
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
    const controller = new AbortController();
    const signals = [...new Set([options.signal, logicalTask.signal].filter(Boolean))];
    const abort = () => controller.abort(core_requestCoordinator.createGenerationAbortError());
    for (const signal of signals) {
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
    }
    if (logicalTask.participantSnapshot && !options.participantPromptApplied) {
        const block = logicalTask.participantPromptIndexed
            ? core_participants.participantIndexPromptBlock(logicalTask.participantSnapshot)
            : core_participants.participantPromptBlock(logicalTask.participantSnapshot);
        if (block && !prompt.includes(block)) prompt += block;
        if (typeof options.recoveryBasePrompt === 'string' && block && !options.recoveryBasePrompt.includes(block)) {
            options = { ...options, recoveryBasePrompt: options.recoveryBasePrompt + block };
        }
    }
    if (core_requestCoordinator.chatScopeCancellationBlocksOrigin(options.origin)) {
        throw core_requestCoordinator.createGenerationAbortError();
    }
    try {
        const result = await generateConfiguredJsonOperation(prompt, { ...options, signal: controller.signal });
        core_requestCoordinator.assertLogicalGenerationTaskCurrent(logicalTask);
        return result;
    } finally {
        for (const signal of signals) signal.removeEventListener('abort', abort);
    }
}

// The text that will actually be sent: macros, tag filter, output seal, shape example,
// shared envelope, creative supplement. Preview and the provider call both use this.
export function composeOutgoingGenerationPrompt(prompt, context, contentSettings = {}, contextEnvelope = '', { enforceGeneratedPhrasePolicy = false } = {}) {
    const originalExpanded = core_text.expandSafeRoleMacros(prompt, context);
    const expandedBody = core_contextTags.filterJsonPromptStrings(originalExpanded, core_contextTags.tagPolicyForSettings(contentSettings));
    const sealed = /【输出】\n只输出一个 JSON 对象/.test(expandedBody)
        ? expandedBody
        : `${expandedBody}\n\n${generation_prompts.jsonOutputSeal()}`;
    const shapeExample = expandedBody.includes('【最短合法例子】')
        ? ''
        : generation_jsonShapeExamples.jsonShapeExampleBlock(expandedBody);
    const expanded = shapeExample ? `${sealed}\n\n${shapeExample}` : sealed;
    const phrasePolicy = enforceGeneratedPhrasePolicy === true ? generatedPhrasePolicyText(contentSettings) : '';
    const creativeSupplement = creative_supplement.creativeSupplementBlock(contentSettings);
    return `${contextEnvelope}\n${expanded}${creativeSupplement}${phrasePolicy}`;
}

async function generateConfiguredJsonOperation(prompt, options = {}) {
    const taskTrace = options.taskTrace || null;
    core_taskTrace.beginRequestAttempt(taskTrace);
    core_taskTrace.beginStage(taskTrace, 'prompt');
    const lifecycleEpoch = options.origin?.lifecycleEpoch ?? runtimeState.runtimeLifecycleEpoch;
    core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
    const context = generationContentContext(options.origin, options.context || core_context.currentCharacterGuard());
    const transportContext = contentContextSources.get(context) || context;
    await core_settings.prepareManualCredential(transportContext, { signal: options.signal });
    const configuredSettings = core_settings.getPluginSettings(transportContext);
    // Persist only the selected profile's inert identifier, never credentials.
    // A reopened recovery origin is a new object, so WeakMap pinning alone
    // cannot preserve the provider chosen before a browser restart.
    const frozenConnection = await generation_recovery.frozenGenerationInput(options.origin, 'transport:connection', () => {
        if (configuredSettings.apiConnectionMode === 'manual' || !configuredSettings.connectionPoolEnabled) return null;
        const selected = connection_pool.selectConnectionTransport(configuredSettings, options.origin || options);
        return { id: selected.connectionProfileId, fingerprint: connection_pool.connectionPoolFingerprint(configuredSettings) };
    });
    const settings = connection_pool.selectConnectionTransport(configuredSettings, options.origin || options, frozenConnection);
    const savedContent = options.recoveryContentSettings || generation_recovery.generationContentSnapshotForOrigin(options.origin)?.contentSettings;
    let contentSettings = { ...settings, ...(savedContent || {}) };
    const advanced = advanced_generation.parseAdvancedGeneration(settings);
    const configurationFingerprint = core_independentApi.apiConfigurationFingerprint(configuredSettings);
    const contextEnvelope = typeof options.contextEnvelope === 'string'
        ? options.contextEnvelope
        : await core_cache.buildControlledContextEnvelope(context, { worldInfoScanTerms: generationWorldInfoScanTerms(options.mode, context), signal: options.signal });
    let actualPrompt;
    if (typeof options.recoveryPreparedPrompt === 'string') actualPrompt = options.recoveryPreparedPrompt;
    else if (options.recoveryContinuationPartial) {
        const originalExpanded = core_text.expandSafeRoleMacros(options.recoveryBasePrompt ?? prompt, context);
        const expandedBody = core_contextTags.filterJsonPromptStrings(originalExpanded, core_contextTags.tagPolicyForSettings(contentSettings));
        const phrasePolicy = options.enforceGeneratedPhrasePolicy === true ? generatedPhrasePolicyText(contentSettings) : '';
        actualPrompt = `${contextEnvelope}\n${expandedBody}${creative_supplement.creativeSupplementBlock(contentSettings)}${phrasePolicy}`;
    } else {
        actualPrompt = composeOutgoingGenerationPrompt(options.recoveryBasePrompt ?? prompt, context, contentSettings, contextEnvelope, {
            enforceGeneratedPhrasePolicy: options.enforceGeneratedPhrasePolicy === true,
        });
    }
    const prepared = await generation_recovery.freezeRecoveryRequestPayload(options, {
        actualPrompt,
        contentSettings: generationContentSettings(contentSettings),
    });
    contentSettings = { ...settings, ...prepared.contentSettings };
    // Feedback is per attempt: preserve the frozen identity, then include the
    // actual retry note in both the budget measurement and provider request.
    const controlledPrompt = generation_recovery.generationRetryPrompt(
        generation_recovery.generationPhoneRetryPrompt(
            generation_recovery.generationContinuationPrompt(prepared.actualPrompt, options.recoveryContinuationPartial), options.recoveryPhoneRetryContract),
        options.recoveryRetryFeedback);
    if (options.archiveRequestBudget === true) {
        const budget = await archive_requestBudget.measureArchiveRequest(context, controlledPrompt,
            { signal: options.signal, stamp: options.archiveBudgetStamp,
                tokenCountState: options.skipTokenCount === true ? { unavailable: true } : null });
        core_taskTrace.recordInput(taskTrace, budget.utf16Chars, budget.inputTokens);
        if (taskTrace) taskTrace.archiveBudget = archive_requestBudget.publicBudget(budget);
        archive_requestBudget.assertArchiveRequestBudget(budget);
    } else {
        const logicalTask = core_requestCoordinator.logicalGenerationTaskForOrigin(options.origin);
        let budget;
        try {
            budget = await assertPromptBudget(context, controlledPrompt,
                { skipTokenCount: options.skipTokenCount === true, signal: options.signal,
                    tokenCountTimeoutMs: options.tokenCountTimeoutMs, taskTrace });
        } catch (error) {
            throw enrichInputBudgetError(error, logicalTask, controlledPrompt);
        }
        notifyInputPackingOnce(logicalTask, budget, controlledPrompt, options);
    }
    core_taskTrace.markStage(taskTrace, 'prompt');
    // The value configured in the dedicated secondary-API UI is the actual provider max output.
    // Per-feature options.maxTokens values are legacy sizing hints only and must not silently lower it.
    const responseLength = output_budget.normalizeOutputTokens(settings.maxTokens);
    const connectionMode = settings.apiConnectionMode === 'manual' ? 'manual' : 'profile';
    const service = context.ConnectionManagerRequestService;
    let selectedProfileFingerprint = '';
    let overridePayload = {
        temperature: generation_requestTemperature.resolveRequestTemperature(options, settings),
    };
    const modelOverride = core_text.normalizeText(options.model || (connectionMode === 'manual' ? settings.manualApiModel : settings.modelOverride), 240);
    if (modelOverride) overridePayload.model = modelOverride;
    const messages = [{ role: 'user', content: controlledPrompt }];
    if (connectionMode === 'manual') {
        core_independentApi.normalizeManualApiBaseUrl(settings.manualApiBaseUrl, { required: true });
        if (!modelOverride) throw core_text.safeUserError('手动 API 还没有模型 ID。请先在插件设置中完成手动配置。', 'RMT_MANUAL_MODEL');
    } else {
        if (!settings.connectionProfileId) {
            throw core_text.safeUserError(`心迹回廊还没有一键连接。请使用“${core_independentApi.PROFILE_ONE_CLICK_UI_VERSION} 一键配置”，或切换到手动配置。`);
        }
        core_independentApi.assertConnectionManagerProfileSupport(service);
        const rawProfile = core_settings.rawConnectionProfile(settings.connectionProfileId, context);
        if (!rawProfile) throw core_text.safeUserError('已保存的一键连接不存在，请重新配置。');
        selectedProfileFingerprint = await core_settings.resolvedProfileTransportFingerprint(rawProfile);
        const apiMap = service.validateProfile(rawProfile);
        if (apiMap?.selected !== 'openai' || !apiMap?.source) throw core_text.safeUserError('当前一键连接不是可复用的 Chat Completion 配置。');
        Object.assign(overridePayload, advanced_generation.advancedCarrier(advanced, apiMap.source));
        overridePayload = advanced_generation.applyAdvancedExclusions(overridePayload, advanced);
    }
    const assertConfigurationCurrent = async () => {
        const latestSettings = core_settings.getPluginSettings(context);
        let latestProfileFingerprint = '';
        if (connectionMode === 'profile') {
            try { latestProfileFingerprint = await core_settings.resolvedProfileTransportFingerprint(core_settings.rawConnectionProfile(settings.connectionProfileId, context)); }
            catch { latestProfileFingerprint = 'missing'; }
        }
        if (core_independentApi.apiConfigurationFingerprint(latestSettings) !== configurationFingerprint
            || (connectionMode === 'profile' && latestProfileFingerprint !== selectedProfileFingerprint)) {
            const error = new Error('API 配置或创作补充词在生成期间发生变化，本次旧请求已停止。');
            error.code = 'RMT_API_CONFIG_CHANGED';
            error.retryable = false;
            throw error;
        }
    };
    let result, responsePayload, releaseProviderPermit = null;
    const lifecycleController = new AbortController();
    const externalSignal = options.signal || null;
    const forwardAbort = () => {
        const reason = externalSignal?.reason;
        try { lifecycleController.abort(reason instanceof Error ? reason : core_requestCoordinator.createGenerationAbortError()); } catch {}
    };
    if (externalSignal?.aborted) forwardAbort();
    else externalSignal?.addEventListener?.('abort', forwardAbort, { once: true });
    const assertRequestCurrent = () => {
        if (lifecycleController.signal.aborted) throw lifecycleController.signal.reason instanceof Error
            ? lifecycleController.signal.reason : core_requestCoordinator.createGenerationAbortError();
        core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
    };
    try {
        assertRequestCurrent();
        core_taskTrace.beginStage(taskTrace, 'queue');
        core_requestCoordinator.noteChatTaskPhase('queue', { taskKey: options.taskKey, origin: options.origin });
        releaseProviderPermit = await core_requestCoordinator.acquireProviderRequestPermit(lifecycleController.signal);
        core_taskTrace.markStage(taskTrace, 'queue');
        core_taskTrace.beginStage(taskTrace, 'pacing');
        await core_requestCoordinator.waitForProviderPacing(lifecycleController.signal);
        core_taskTrace.markStage(taskTrace, 'pacing');
        assertRequestCurrent();
        await assertConfigurationCurrent();
        assertRequestCurrent();
        core_taskTrace.beginStage(taskTrace, 'request');
        core_requestCoordinator.noteChatTaskPhase('request', { taskKey: options.taskKey, origin: options.origin });
        result = await core_requestCoordinator.runGenerationRequestWithTimeout(
            async () => {
                assertRequestCurrent();
                core_taskTrace.recordProviderRequest(taskTrace);
                const returned = connectionMode === 'manual'
                ? core_independentApi.requestManualApiCompletion(settings, context, messages, responseLength, {
                    signal: lifecycleController.signal,
                    model: modelOverride,
                    temperature: overridePayload.temperature,
                })
                : service.sendRequest(
                    settings.connectionProfileId,
                    messages,
                    responseLength,
                    { stream: advanced.streamMode === 'on', extractData: false, includePreset: false, includeInstruct: false, signal: lifecycleController.signal },
                    overridePayload,
                );
                return core_independentApi.readProfileCompletion(await returned, { signal: lifecycleController.signal });
            },
            lifecycleController,
            options.timeoutMs,
            options.statusText || '',
        );
        core_taskTrace.markStage(taskTrace, 'request');
        core_taskTrace.markStage(taskTrace, 'response');
        core_taskTrace.recordResponse(taskTrace, core_independentApi.responseShapeSummary(result));
        // Observe error envelopes (including HTTP-200 429s) before draining the queue.
        responsePayload = core_independentApi.assertIndependentResponsePayload(result);
    } catch (error) {
        const shape = core_independentApi.transportFailureSummary(error);
        if (shape) core_taskTrace.recordResponse(taskTrace, shape);
        throw normalizeConnectionManagerError(error);
    } finally {
        try { releaseProviderPermit?.(); } catch {}
        try { externalSignal?.removeEventListener?.('abort', forwardAbort); } catch {}
    }
    // A settings edit cannot invalidate a reply that the selected provider has
    // already returned. Keep that paid result; the next request reads the new API.
    if (externalSignal?.aborted) forwardAbort();
    assertRequestCurrent();
    let parsed;
    core_taskTrace.beginStage(taskTrace, 'parse');
    try { core_independentApi.assertManualStreamComplete(result);
        parsed = generation_jsonParser.extractJson(responsePayload, {
        reasoning: result?.reasoning || '',
        requestMaxTokens: responseLength,
        configuredMaxTokens: settings.maxTokens,
    }); } catch (error) {
        await generation_recovery.recordRecoveryTruncation(options, responsePayload, error);
        throw error;
    }
    if (options.enforceGeneratedPhrasePolicy === true) assertNoBannedGeneratedPhrase(parsed, contentSettings, {
        mode: options.mode, settingText: core_worldPresentation.controlledWorldEvidence(contextEnvelope, null),
    });
    core_taskTrace.markStage(taskTrace, 'parse');
    core_requestCoordinator.noteChatTaskPhase('validate', { taskKey: options.taskKey, origin: options.origin });
    return parsed;
}

export async function requestJson(prompt, statusText = '正在根据当前聊天档案生成…', options = {}) {
    if (runtimeState.busy) throw new Error('当前正在创建/更新聊天档案，请等档案整理结束后再生成内容。');
    const taskKey = core_text.normalizeText(options.taskKey, 240) || `request:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    if (core_requestCoordinator.isGenerationTaskRunning(taskKey)) throw new Error('这一项已经在生成中。');
    const parentTaskKey = core_text.normalizeText(options.parentTaskKey, 240) || core_requestCoordinator.activeModeBuildScopeForTask(taskKey);
    const logicalTaskKey = parentTaskKey || taskKey;
    const logicalKeys = core_requestCoordinator.activeLogicalGenerationKeys();
    logicalKeys.delete(logicalTaskKey);
    const bulkReservation = core_requestCoordinator.advBulkReservationKeyForTask(taskKey);
    if (bulkReservation) logicalKeys.delete(bulkReservation);
    if (logicalKeys.size >= core_constants.MAX_CONCURRENT_GENERATION_TASKS) {
        throw new Error(`当前已有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成，请等其中一项完成后再启动新的任务。`);
    }
    const controller = new AbortController();
    const requestContext = options.context || core_context.currentCharacterGuard();
    const origin = options.origin || core_context.captureTaskOrigin(requestContext, archive_repository.getImportedMemory(requestContext)?.archiveRevision || '');
    if (core_requestCoordinator.chatScopeCancellationBlocksOrigin(origin)) throw core_requestCoordinator.createGenerationAbortError();
    core_context.assertRuntimeLifecycleCurrent(origin.lifecycleEpoch);
    const externalSignal = options.signal || null;
    const forwardAbort = () => {
        try { controller.abort(externalSignal?.reason instanceof Error ? externalSignal.reason : core_requestCoordinator.createGenerationAbortError()); } catch {}
    };
    if (externalSignal?.aborted) forwardAbort();
    else externalSignal?.addEventListener?.('abort', forwardAbort, { once: true });
    const targetLabel = core_text.normalizeText(requestContext?.__rmtArchiveTargetLabel, 260);
    const displayStatus = targetLabel ? `正在为：${targetLabel} · ${core_text.normalizeText(statusText, 180)}` : statusText;
    runtimeState.activeGenerationTasks.set(taskKey, {
        key: taskKey, controller, origin, label: core_text.normalizeText(displayStatus, 360),
        mode: core_text.normalizeText(options.mode, 80), parentTaskKey, startedAt: Date.now(), phase: 'prepare',
    });
    core_requestCoordinator.noteChatTaskPhase('prepare', { taskKey, origin });
    core_requestCoordinator.refreshConcurrentTaskUi(core_text.normalizeText(options.mode, 80), origin);
    const inheritedTrace = generationTrace(options);
    const taskTrace = inheritedTrace || core_taskTrace.startTaskTrace(taskKey, options.mode);
    if (!inheritedTrace) core_taskTrace.markStage(taskTrace, 'start');
    let requestOutcome = 'done';
    try {
        core_context.assertRuntimeLifecycleCurrent(origin.lifecycleEpoch);
        const result = await generateConfiguredJson(prompt, {
            ...options, taskKey, taskTrace, origin, context: requestContext,
            signal: controller.signal,
            statusText,
            enforceGeneratedPhrasePolicy: options.enforceGeneratedPhrasePolicy !== false,
        });
        if (!inheritedTrace) core_taskTrace.endTaskTrace(taskTrace, 'ok');
        return result;
    } catch (error) {
        requestOutcome = error?.name === 'AbortError' ? 'cancelled' : 'failed';
        if (!inheritedTrace) core_taskTrace.endTaskTrace(taskTrace, error?.name === 'AbortError' ? 'cancelled' : 'failed', error);
        else if (taskTrace.activeStage) core_taskTrace.markStage(taskTrace, taskTrace.activeStage, false);
        throw error;
    } finally {
        try { externalSignal?.removeEventListener?.('abort', forwardAbort); } catch {}
        const current = runtimeState.activeGenerationTasks.get(taskKey);
        if (current?.controller === controller) runtimeState.activeGenerationTasks.delete(taskKey);
        core_requestCoordinator.rememberStandaloneChatTask({
            label: core_text.normalizeText(displayStatus, 120),
            mode: core_text.normalizeText(options.mode, 80),
            origin, outcome: requestOutcome, kind: 'generation',
        });
        core_requestCoordinator.refreshConcurrentTaskUi(core_text.normalizeText(options.mode, 80), origin);
    }
}

export async function generateArchiveChunkJson(prompt, options, label) {
    try {
        return await generateConfiguredJson(prompt, options);
    } catch (error) {
        if (error?.name === 'AbortError' || !error?.retryableJson) throw error;
        if (options.automatic === true) throw error;
        const retry = ui_overlay.confirmExplicitAction(
            `模型没有返回完整 JSON · ${label}`,
            `${core_text.safeErrorSummary(error, 900)}\n\n是否只重试这一块？重试会额外消耗 1 次模型请求；取消则停止本次档案整理，旧档案、旧 ADV EVENT / ENDING 等内容都不会被覆盖。`,
            { destructive: false },
        );
        if (!retry) throw error;
        return await generateConfiguredJson(prompt, options);
    }
}

export function recoverySettingsIdentity(context) {
    // Shared with admission so a failed comparison never advances a write fence.
    // Serialization remains byte-identical to the earlier settings fingerprint.
    return recovery_source.recoverySettingsIdentity(context);
}

export function recoveryModeTaskScopes(mode, context, bank, origin, entryId, existing, contentSnapshot) {
    // Scheduler lanes belong to the current write target; recovery segments
    // belong to the original task. Enumerate only this validated owner's known
    // source/current revisions, including the pre-index fallback serialization.
    const chatId = core_context.comparableChatId(origin.chatId);
    const modeName = core_text.normalizeText(mode, 80);
    const entries = new Set([core_text.normalizeText(entryId, 120)]);
    for (const memory of [bank, contentSnapshot?.memoryBank]) {
        if (memory && core_context.comparableChatId(memory.chatId) === chatId) {
            entries.add(`archive:${core_context.stableArchiveHash(`${chatId}\u001f${core_text.normalizeText(memory.characterName, 120)}`)}`);
        }
    }
    const revisions = new Set([origin.archiveRevision, existing?.identity?.archiveRevision,
        existing?.sourceIdentity?.archiveRevision, contentSnapshot?.memoryBank?.archiveRevision]
        .map(value => core_text.normalizeText(value, 240)).filter(Boolean));
    const scopes = new Set([core_requestCoordinator.generationTaskKeyForMode(mode, context)]);
    for (const entry of entries) if (entry) for (const revision of revisions) scopes.add(`mode:${entry}|${chatId}|${revision}:${modeName}`);
    return [...scopes];
}
