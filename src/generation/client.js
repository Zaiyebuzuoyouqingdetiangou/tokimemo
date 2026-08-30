// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_groups from '../archive/groups.js';
import * as archive_repository from '../archive/repository.js';
import * as archive_snapshots from '../archive/snapshots.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import * as core_independentApi from '../core/independentApi.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_jsonParser from './jsonParser.js';
import * as generation_normalizers from './normalizers.js';
import * as generation_prompts from './prompts.js';
import * as modes_achievements from '../modes/achievements.js';
import * as modes_advEvent from '../modes/advEvent.js';
import * as modes_album from '../modes/album.js';
import * as modes_butterfly from '../modes/butterfly.js';
import * as modes_calendar from '../modes/calendar.js';
import * as modes_ending from '../modes/ending.js';
import * as modes_heart from '../modes/heart.js';
import * as modes_items from '../modes/items.js';
import * as modes_phone from '../modes/phone.js';
import * as modes_room from '../modes/room.js';
import * as modes_relations from '../modes/relations.js';
import * as modes_travel from '../modes/travel.js';
import * as ui_overlay from '../ui/overlay.js';
import * as ui_settingsPanel from '../ui/settingsPanel.js';

export function generationWorldInfoScanTerms(mode, context = {}) {
    const characterName = core_text.normalizeText(context?.name2, 120);
    const common = characterName ? [characterName] : [];
    if (mode === core_constants.MODE.ROOM) return [...common, '外貌', '发色', '发型', '穿着', '制服', '服饰', '种族', '住处', '房间', '居所', '时代', '职业', '阶层', '生活习惯', '宠物', '猫', '狗', '鸟', '鹦鹉', '兔', '鱼', '爬宠', '仓鼠', '豚鼠', '灵兽', '使魔', '动物伙伴', 'appearance', 'hair', 'outfit', 'species', 'residence', 'room', 'home', 'pet', 'cat', 'dog', 'bird', 'parrot', 'rabbit', 'fish', 'reptile', 'hamster', 'familiar', 'animal companion'];
    if (mode === core_constants.MODE.PHONE) return [...common, '通讯', '终端', '手机', '设备', '职业', '爱好', '生活习惯', '科技', '时代', '世界观', 'phone', 'device', 'terminal', 'communication', 'hobby', 'occupation'];
    if (mode === core_constants.MODE.TRAVEL) return [...common, '住处', '工作', '学校', '地点', '交通', '出行', '旅行', '路线', '世界观', 'residence', 'work', 'school', 'location', 'travel', 'route', 'transport'];
    if (mode === core_constants.MODE.BUTTERFLY) return [...common, '身份', '职业', '时代', '地点', '关系', '选择', '命运', '相遇', '世界线', '平行世界', 'identity', 'occupation', 'era', 'location', 'fate', 'encounter'];
    if (mode === core_constants.MODE.CALENDAR) return [...common, '节日', '日历', '生日', '纪念日', '祭典', '庆典', 'festival', 'holiday', 'calendar', 'birthday', 'anniversary'];
    return common;
}

export function chunkForGeneration(items, size) {
    const safeSize = Math.max(1, Math.floor(Number(size) || 1));
    const out = [];
    for (let index = 0; index < (Array.isArray(items) ? items.length : 0); index += safeSize) {
        out.push(items.slice(index, index + safeSize));
    }
    return out;
}

export async function mapGenerationConcurrent(items, limit, worker) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return [];
    const results = new Array(list.length);
    let cursor = 0;
    let firstError = null;
    const workerCount = Math.max(1, Math.min(Math.floor(Number(limit) || 1), list.length));
    async function run() {
        while (!firstError) {
            const index = cursor;
            cursor += 1;
            if (index >= list.length) return;
            try {
                results[index] = await worker(list[index], index);
            } catch (error) {
                firstError = firstError || error;
                return;
            }
        }
    }
    await Promise.all(Array.from({ length: workerCount }, () => run()));
    if (firstError) throw firstError;
    return results;
}

export async function requestValidatedSegment(prompt, status, options, validator) {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const retryNote = attempt && lastError
            ? '\n\n【本地校验反馈】上一轮结构或完整度没有通过。请严格按原硬性要求重新输出完整 JSON，不要解释，也不要引用这条反馈作为内容。'
            : '';
        try {
            const raw = await requestJson(`${prompt}${retryNote}`, `${status}${attempt ? '（重试）' : ''}`, options);
            return core_requestCoordinator.validateGeneratedSegment(raw, validator);
        } catch (error) {
            if (error?.name === 'AbortError' || error?.code === 'RMT_BANNED_GENERATED_PHRASE') throw error;
            lastError = error;
            if (!attempt && core_requestCoordinator.shouldRetrySegmentRequest(error)) {
                await core_requestCoordinator.waitBeforeSegmentRetry(error);
                continue;
            }
            throw error;
        }
    }
    throw lastError || new Error(`${status}失败。`);
}

export async function assertPromptBudget(context, prompt, { skipTokenCount = false } = {}) {
    if (prompt.length > core_constants.MAX_GENERATION_INPUT_CHARS) {
        throw new Error(`本次心跳回忆输入过大（${prompt.length.toLocaleString()} 字符），已在发送前拦截。请更新/精简档案或减少世界书内容。`);
    }
    if (!skipTokenCount && typeof context.getTokenCountAsync === 'function') {
        try {
            const tokens = Number(await context.getTokenCountAsync(prompt));
            if (Number.isFinite(tokens) && tokens > core_constants.MAX_GENERATION_INPUT_TOKENS) {
                throw new Error(`本次心跳回忆输入约 ${Math.round(tokens).toLocaleString()} tokens，超过 ${core_constants.MAX_GENERATION_INPUT_TOKENS.toLocaleString()} 的安全预算，已在发送前拦截。`);
            }
        } catch (error) {
            if (/安全预算/.test(String(error?.message || ''))) throw error;
            console.warn('[HeartbeatMemories] input token count unavailable; using character budget only', error);
        }
    }
}

export const GENERATED_PHRASE_EVIDENCE_KEYS = new Set([
    'sourceMemoryAnchor', 'relationshipSourceMemoryAnchor', 'sourceExternalAnchor',
]);

export function generatedPhrasePolicyText(settings) {
    const banned = core_settings.normalizeBannedGeneratedPhrases(settings?.bannedGeneratedPhrases);
    if (!banned.length) return '';
    return `\n\n【新生成文本禁用词】除 sourceMemoryAnchor / relationshipSourceMemoryAnchor / sourceExternalAnchor 等证据锚点必须忠实引用原档案外，任何新生成的标题、叙述、角色台词、模拟用户台词、摘要、场景文本中都禁止出现以下词语：${banned.map(item => `「${item}」`).join('、')}。不要解释这条规则，只需改用符合人设且不含禁用词的表达。`;
}

export function findBannedGeneratedPhrase(value, banned, key = '') {
    if (GENERATED_PHRASE_EVIDENCE_KEYS.has(key)) return '';
    if (typeof value === 'string') return banned.find(phrase => phrase && value.includes(phrase)) || '';
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findBannedGeneratedPhrase(item, banned, key);
            if (found) return found;
        }
        return '';
    }
    if (value && typeof value === 'object') {
        for (const [childKey, childValue] of Object.entries(value)) {
            const found = findBannedGeneratedPhrase(childValue, banned, childKey);
            if (found) return found;
        }
    }
    return '';
}

export function assertNoBannedGeneratedPhrase(value, settings) {
    const banned = core_settings.normalizeBannedGeneratedPhrases(settings?.bannedGeneratedPhrases);
    if (!banned.length) return;
    const found = findBannedGeneratedPhrase(value, banned);
    if (!found) return;
    const error = new Error(`模型新生成内容命中禁用词「${found}」。本次结果没有保存，也不会自动重试；请手动重试，或在插件设置里调整“生成禁用词”。历史聊天原文和证据锚点不会被改写。`);
    error.code = 'RMT_BANNED_GENERATED_PHRASE';
    throw error;
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
        'RMT_PROFILE_CAPABILITY', 'RMT_REQUEST_TIMEOUT', 'RMT_SEGMENT_VALIDATION',
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
    const status = hasRawStatus ? Number(rawStatus) : Number(messageStatus?.[1]) || 0;
    const technical = status ? `（HTTP ${status}）` : safeCode ? `（${safeCode}）` : '';
    const sourceName = error?.code === 'RMT_MANUAL_HTTP' ? '手动 API' : '专用连接';
    let code = 'RMT_CONNECTION_FAILED';
    let message = `${sourceName}请求失败${technical}。没有收到可判断是否可重试的模型结果；请检查当前独立 API 设置与 SillyTavern 控制台中的上游错误，本段不会自动重试。`;
    let retryable = false;
    if (status === 401 || status === 403 || /(unauthori[sz]ed|forbidden|authentication|(?:invalid|incorrect|expired) api key|api key.*(?:invalid|incorrect|expired)|key.*(?:invalid|incorrect|expired))/i.test(original)) {
        code = 'RMT_CONNECTION_AUTH';
        message = `${sourceName}认证失败${technical}。请检查当前配置、API Key 与账号权限；本段不会自动重试。`;
        retryable = false;
    } else if (status === 429 || /(too many requests|rate.?limit|quota exceeded|resource exhausted)/i.test(original)) {
        code = 'RMT_CONNECTION_RATE_LIMIT';
        message = `模型服务正在限流或额度不足${technical}。心跳回忆会降低并发并仅对本段等待后重试一次；若仍失败，请稍后再试。`;
        retryable = true;
    } else if (status === 413 || /(context length|context window|too many tokens|maximum context|payload too large|request too large)/i.test(original)) {
        code = 'RMT_CONNECTION_CONTEXT_LIMIT';
        message = `本段输入超过模型或代理的上下文上限${technical}。请换用更大上下文模型，或减少导入的世界书/记忆资料；本段不会自动重试。`;
        retryable = false;
    } else if (status === 404 || /(model.*not found|profile.*not found|endpoint.*not found)/i.test(original)) {
        code = 'RMT_CONNECTION_CONFIG';
        message = `${sourceName}、模型或上游端点不可用${technical}。请重新配置并确认模型名称；本段不会自动重试。`;
        retryable = false;
    } else if (status === 400 || status === 422 || /(invalid request|bad request|unprocessable)/i.test(original)) {
        code = 'RMT_CONNECTION_INVALID_REQUEST';
        message = `上游拒绝了本段请求${technical}。请检查所选模型是否支持当前 Connection Manager 请求格式与最大输出；本段不会自动重试。`;
        retryable = false;
    } else if (status === 408 || status === 504 || /(gateway timeout|request timeout|timed out|etimedout)/i.test(original)) {
        code = 'RMT_CONNECTION_SERVER';
        message = `模型服务或代理响应超时${technical}。本段会等待后重试一次；若再次失败，旧内容仍会保留。`;
        retryable = true;
    } else if (status >= 500 || /(bad gateway|service unavailable|upstream.*(?:failed|error)|econnreset|econnrefused)/i.test(original)) {
        code = 'RMT_CONNECTION_SERVER';
        message = `模型服务或代理暂时不可用${technical}。本段会等待后重试一次；若再次失败，旧内容仍会保留。`;
        retryable = true;
    }
    const normalized = new Error(message);
    normalized.code = code;
    normalized.status = status || undefined;
    normalized.retryable = retryable;
    return normalized;
}

export async function generateConfiguredJson(prompt, options = {}) {
    const context = options.context || core_context.currentCharacterGuard();
    const settings = core_settings.getPluginSettings(context);
    const configurationFingerprint = core_independentApi.apiConfigurationFingerprint(settings);
    const expanded = core_text.expandSafeRoleMacros(prompt, context);
    const contextEnvelope = typeof options.contextEnvelope === 'string'
        ? options.contextEnvelope
        : await core_cache.buildControlledContextEnvelope(context, { worldInfoScanTerms: generationWorldInfoScanTerms(options.mode, context) });
    const phrasePolicy = options.enforceGeneratedPhrasePolicy === true ? generatedPhrasePolicyText(settings) : '';
    const controlledPrompt = `${contextEnvelope}
${expanded}${phrasePolicy}`;
    await assertPromptBudget(context, controlledPrompt, { skipTokenCount: options.skipTokenCount === true });
    // The value configured in the dedicated secondary-API UI is the actual provider max output.
    // Per-feature options.maxTokens values are legacy sizing hints only and must not silently lower it.
    const responseLength = Math.max(1024, Math.min(core_constants.MAX_GENERATION_OUTPUT_TOKENS, Number(settings.maxTokens) || core_constants.DEFAULT_SETTINGS.maxTokens));
    const connectionMode = settings.apiConnectionMode === 'manual' ? 'manual' : 'profile';
    const service = context.ConnectionManagerRequestService;
    let selectedProfileFingerprint = '';
    const overridePayload = {
        temperature: Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : settings.temperature,
    };
    const modelOverride = core_text.normalizeText(options.model || (connectionMode === 'manual' ? settings.manualApiModel : settings.modelOverride), 240);
    if (modelOverride) overridePayload.model = modelOverride;
    const messages = [{ role: 'user', content: controlledPrompt }];
    if (connectionMode === 'manual') {
        core_independentApi.normalizeManualApiBaseUrl(settings.manualApiBaseUrl, { required: true });
        if (!modelOverride) throw new Error('手动 API 还没有模型 ID。请先在插件设置中完成手动配置。');
    } else {
        if (!settings.connectionProfileId) {
            throw new Error(`心跳回忆还没有一键连接。请使用“${core_independentApi.PROFILE_ONE_CLICK_UI_VERSION} 一键配置”，或切换到手动配置。`);
        }
        core_independentApi.assertConnectionManagerProfileSupport(service);
        const rawProfile = core_settings.rawConnectionProfile(settings.connectionProfileId, context);
        if (!rawProfile) throw new Error('已保存的一键连接不存在，请重新配置。');
        selectedProfileFingerprint = core_settings.profileFingerprint(rawProfile);
        const apiMap = service.validateProfile(rawProfile);
        if (apiMap?.selected !== 'openai' || !apiMap?.source) throw new Error('当前一键连接不是可复用的 Chat Completion 配置。');
    }
    let result;
    const lifecycleController = new AbortController();
    const externalSignal = options.signal || null;
    const forwardAbort = () => {
        const reason = externalSignal?.reason;
        try { lifecycleController.abort(reason instanceof Error ? reason : core_requestCoordinator.createGenerationAbortError()); } catch {}
    };
    if (externalSignal?.aborted) forwardAbort();
    else externalSignal?.addEventListener?.('abort', forwardAbort, { once: true });
    try {
        result = await core_requestCoordinator.runGenerationRequestWithTimeout(
            () => connectionMode === 'manual'
                ? core_independentApi.requestManualApiCompletion(settings, context, messages, responseLength, {
                    signal: lifecycleController.signal,
                    model: modelOverride,
                    temperature: overridePayload.temperature,
                })
                : service.sendRequest(
                    settings.connectionProfileId,
                    messages,
                    responseLength,
                    { stream: false, extractData: true, includePreset: false, includeInstruct: false, signal: lifecycleController.signal },
                    overridePayload,
                ),
            lifecycleController,
            options.timeoutMs,
            options.statusText || '',
        );
    } catch (error) {
        throw normalizeConnectionManagerError(error);
    } finally {
        try { externalSignal?.removeEventListener?.('abort', forwardAbort); } catch {}
    }
    const latestSettings = core_settings.getPluginSettings(context);
    let latestProfileFingerprint = '';
    if (connectionMode === 'profile') {
        try { latestProfileFingerprint = core_settings.profileFingerprint(core_settings.rawConnectionProfile(latestSettings.connectionProfileId, context)); }
        catch { latestProfileFingerprint = 'missing'; }
    }
    if (core_independentApi.apiConfigurationFingerprint(latestSettings) !== configurationFingerprint
        || (connectionMode === 'profile' && latestProfileFingerprint !== selectedProfileFingerprint)) {
        const error = new Error('API 配置在生成期间发生变化，本次旧连接结果已丢弃。');
        error.code = 'RMT_API_CONFIG_CHANGED';
        error.retryable = false;
        throw error;
    }
    const parsed = generation_jsonParser.extractJson(core_independentApi.extractIndependentResponseContent(result), {
        reasoning: result?.reasoning || '',
        requestMaxTokens: responseLength,
        configuredMaxTokens: settings.maxTokens,
    });
    if (options.enforceGeneratedPhrasePolicy === true) assertNoBannedGeneratedPhrase(parsed, settings);
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
    runtimeState.activeGenerationTasks.set(taskKey, {
        key: taskKey, controller, origin, label: core_text.normalizeText(statusText, 240),
        mode: core_text.normalizeText(options.mode, 80), parentTaskKey, startedAt: Date.now(),
    });
    core_requestCoordinator.refreshConcurrentTaskUi(core_text.normalizeText(options.mode, 80), origin);
    let releaseProviderPermit = null;
    try {
        releaseProviderPermit = await core_requestCoordinator.acquireProviderRequestPermit(controller.signal);
        return await generateConfiguredJson(prompt, {
            ...options,
            signal: controller.signal,
            statusText,
            enforceGeneratedPhrasePolicy: options.enforceGeneratedPhrasePolicy !== false,
        });
    } finally {
        try { releaseProviderPermit?.(); } catch {}
        const current = runtimeState.activeGenerationTasks.get(taskKey);
        if (current?.controller === controller) runtimeState.activeGenerationTasks.delete(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(core_text.normalizeText(options.mode, 80), origin);
    }
}

export async function generateArchiveChunkJson(prompt, options, label) {
    try {
        return await generateConfiguredJson(prompt, options);
    } catch (error) {
        if (error?.name === 'AbortError' || !error?.retryableJson) throw error;
        const retry = ui_overlay.confirmExplicitAction(
            `模型没有返回完整 JSON · ${label}`,
            `${core_text.normalizeText(error?.message || String(error), 900)}\n\n是否只重试这一块？重试会额外消耗 1 次模型请求；取消则停止本次档案整理，旧档案、旧 ADV EVENT / ENDING 等内容都不会被覆盖。`,
            { destructive: false },
        );
        if (!retry) throw error;
        return await generateConfiguredJson(prompt, options);
    }
}

export async function generateMode(mode, options = {}) {
    const background = options.background === true;
    const replaceExisting = options.replaceExisting === true;
    const context = core_context.currentCharacterGuard();
    const expectedChatId = core_context.getChatId(context);
    const memoryBank = archive_repository.requireArchive(context);
    const expectedArchiveRevision = memoryBank.archiveRevision;
    const promptFactory = generation_prompts.PROMPTS[mode];
    if (!promptFactory && ![core_constants.MODE.ACHIEVEMENTS, core_constants.MODE.RELATIONS, core_constants.MODE.TRAVEL].includes(mode)) return;
    const segmentedMode = [core_constants.MODE.ENDING, core_constants.MODE.ALBUM, core_constants.MODE.HEART, core_constants.MODE.PHONE, core_constants.MODE.ACHIEVEMENTS, core_constants.MODE.TRAVEL].includes(mode);
    let generationPrompt = segmentedMode || mode === core_constants.MODE.RELATIONS ? '' : promptFactory(context, memoryBank);
    let roomSession = null;
    let focusObject = null;
    if (core_constants.ROOM_DEEP_MODES.includes(mode)) {
        roomSession = options.roomSessionOverride
            || core_cache.loadSession(core_constants.MODE.ROOM, { context, chatId: expectedChatId, memoryBank, clone: false });
        if (!roomSession) {
            globalThis.toastr?.info?.('请先生成“他的房间”，再从房间内部生成这项深层内容。', '心跳回忆');
            return;
        }
        const selectedSpace = roomSession.spaces.find(space => space.id === roomSession.selectedSpaceId) || roomSession.spaces[0];
        focusObject = selectedSpace?.objects.find(item => item.id === options.focusObjectId)
            || selectedSpace?.objects.find(item => item.id === roomSession.selectedObjectId)
            || selectedSpace?.objects[0]
            || null;
        if (mode === core_constants.MODE.ITEMS && !core_evidence.isSearchableRoomObject(focusObject)) {
            globalThis.toastr?.info?.('只有房间里的盒子、抽屉、柜子、包等收纳物可以生成翻找内容。', '心跳回忆');
            return;
        }
        if (mode !== core_constants.MODE.PHONE) generationPrompt = generation_prompts.roomDeepGenerationPrompt(mode, context, memoryBank, roomSession, focusObject);
    }
    const previousSession = replaceExisting ? null : core_cache.loadSession(mode, { context, chatId: expectedChatId, memoryBank, clone: true });
    const incrementalPart = mode === core_constants.MODE.HEART ? 'dialogues' : 'mode';
    const refreshableCalendar = mode === core_constants.MODE.CALENDAR;
    const refreshableRelations = mode === core_constants.MODE.RELATIONS;
    const roomSchemaUpgrade = mode === core_constants.MODE.ROOM && modes_room.roomNeedsSchemaUpgrade(previousSession);
    if (previousSession && !refreshableCalendar && !refreshableRelations && !(mode === core_constants.MODE.PHONE && options.continueDraft === true)) {
        const pendingMemoryIds = core_incremental.incrementalArchiveMemoryIds(previousSession, memoryBank, incrementalPart);
        if (!pendingMemoryIds.length && !roomSchemaUpgrade) {
            globalThis.toastr?.info?.(`「${core_constants.MODE_LABEL[mode]}」已经覆盖当前档案。请先增量更新档案；下次只会追加新内容，旧内容不会重写。`, '心跳回忆');
            return;
        }
    }
    const taskKey = core_requestCoordinator.generationTaskKeyForMode(mode, context);
    if (core_requestCoordinator.isModeGenerating(mode, context)) {
        globalThis.toastr?.info?.(`「${core_constants.MODE_LABEL[mode]}」已经在生成/补齐中。`, '心跳回忆');
        return;
    }
    if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
        globalThis.toastr?.info?.(`当前已经有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成，请等其中一项完成。`, '心跳回忆');
        return;
    }
    if (mode === core_constants.MODE.ROOM && runtimeState.roomLifeRefreshPromise) {
        globalThis.toastr?.info?.('“今日生活”正在更新，请等它完成后再从新增档案追加房间内容。', '心跳回忆');
        return;
    }
    if (mode === core_constants.MODE.ADV && (core_requestCoordinator.hasGenerationTaskPrefix(`adv:${core_context.chatScopeKey(context)}:`) || runtimeState.activeAdvBulkScopes.has(core_context.chatScopeKey(context)))) {
        globalThis.toastr?.info?.('当前有 ADV 正文正在生成，请等它完成后再追加 ADV EVENT 事件索引。', '心跳回忆');
        return;
    }
    const origin = { ...core_context.captureTaskOrigin(context, expectedArchiveRevision), chatId: core_context.comparableChatId(expectedChatId) };
    runtimeState.activeModeBuildScopes.add(taskKey);
    core_requestCoordinator.refreshConcurrentTaskUi(mode, origin);
    if (!background) {
        ui_overlay.openOverlay();
        ui_overlay.setInnerLoading(true, replaceExisting ? `正在重新生成「${core_constants.MODE_LABEL[mode]}」…` : roomSchemaUpgrade ? '正在为旧版房间补全宠物与视觉设定…' : refreshableCalendar && previousSession ? '正在刷新「两个人的日历」…' : refreshableRelations && previousSession ? '正在刷新「本世界线人际关系」…' : previousSession ? `正在从新增档案追加「${core_constants.MODE_LABEL[mode]}」…` : `正在生成「${core_constants.MODE_LABEL[mode]}」…`);
    }
    try {
        let session;
        if (mode === core_constants.MODE.ADV) {
            session = await modes_advEvent.generateAdvIndexWithRepair(context, memoryBank, origin, expectedChatId, taskKey, { replaceExisting });
        } else if (mode === core_constants.MODE.BUTTERFLY) {
            session = previousSession
                ? await modes_butterfly.generateButterflyIncrementalWithRepair(context, memoryBank, origin, taskKey, previousSession)
                : await modes_butterfly.generateButterflyWithRepair(context, memoryBank, origin, taskKey);
        } else if (mode === core_constants.MODE.ROOM && previousSession) {
            session = await modes_room.generateRoomIncrementalWithRepair(context, memoryBank, origin, taskKey, previousSession);
        } else if (mode === core_constants.MODE.ITEMS && previousSession) {
            session = await modes_items.generateItemsIncrementalWithRepair(context, memoryBank, roomSession, focusObject, origin, taskKey, previousSession);
        } else if (mode === core_constants.MODE.ENDING) {
            session = await modes_ending.generateEndingWithRepair(context, memoryBank, origin, taskKey, { replaceExisting });
        } else if (mode === core_constants.MODE.ALBUM) {
            session = await modes_album.generateAlbumWithRepair(context, memoryBank, origin, taskKey, { replaceExisting });
        } else if (mode === core_constants.MODE.HEART) {
            session = await modes_heart.generateHeartWithRepair(context, memoryBank, origin, taskKey, { replaceExisting });
        } else if (mode === core_constants.MODE.PHONE) {
            session = previousSession && options.continueDraft !== true
                ? await modes_phone.generatePhoneIncrementalWithRepair(context, memoryBank, origin, taskKey, previousSession)
                : await modes_phone.generatePhoneWithRepair(context, memoryBank, origin, taskKey, { continueDraft: options.continueDraft === true });
        } else if (mode === core_constants.MODE.TRAVEL) {
            session = await modes_travel.generateTravelWithRepair(context, memoryBank, origin, taskKey, { replaceExisting });
        } else if (mode === core_constants.MODE.RELATIONS) {
            const raw = await requestJson(
                modes_relations.relationsPrompt(context, memoryBank),
                '正在整理当前世界线的人际关系…',
                { maxTokens: core_constants.MODE_TOKEN_CAPS[mode] || 7000, temperature: 0.3, context, origin, taskKey: `${taskKey}:relations`, mode, background: true },
            );
            session = modes_relations.normalizeRelations(raw, memoryBank, context);
            const relationGroupId = archive_groups.currentArchiveGroupKey(context, memoryBank);
            if (relationGroupId) {
                const relationEntries = archive_groups.archiveGroupEntries(relationGroupId, context);
                const relationMeta = archive_groups.archiveGroupMeta(relationGroupId, relationEntries, context);
                session.profileKey = modes_relations.archiveCharacterProfileKey(relationGroupId, relationMeta, relationEntries);
            }
            session.characterName = core_text.normalizeText(context.name2, 120);
            session.characterAvatar = core_context.contextCharacterAvatar(context, context.name2);
        } else if (mode === core_constants.MODE.ACHIEVEMENTS) {
            session = await modes_achievements.generateAchievementsWithRepair(context, memoryBank, origin, taskKey, { replaceExisting });
        } else {
            const contextEnvelope = mode === core_constants.MODE.CALENDAR
                ? await core_cache.buildControlledContextEnvelope(context, { worldInfoScanTerms: generationWorldInfoScanTerms(mode, context) })
                : undefined;
            const raw = await requestJson(
                generationPrompt,
                `正在根据当前聊天档案生成「${core_constants.MODE_LABEL[mode]}」…`,
                { maxTokens: core_constants.MODE_TOKEN_CAPS[mode] || 6144, context, contextEnvelope, origin, taskKey, mode, background: true },
            );
            session = generation_normalizers.normalizeByMode(mode, raw, memoryBank, context);
            if (mode === core_constants.MODE.CALENDAR && previousSession && !replaceExisting) {
                session = modes_calendar.mergeCalendarRefresh(previousSession, session, memoryBank);
            }
        }
        if (!core_incremental.incrementalPartRecord(session, incrementalPart)) {
            const sourceMemoryIds = core_incremental.incrementalArchiveMemoryIds(previousSession, memoryBank, incrementalPart);
            const added = previousSession ? 0 : 1;
            core_incremental.stampIncrementalCoverage(session, previousSession, memoryBank, incrementalPart, sourceMemoryIds, added);
        }
        session.chatId = expectedChatId;
        session.archiveRevision = expectedArchiveRevision;
        await core_context.yieldToUi();
        let committed = false;
        if (core_context.isCurrentTaskOrigin(origin)) {
            try {
                const latestMemory = archive_repository.requireArchive(core_context.currentCharacterGuard());
                if (latestMemory.archiveRevision === expectedArchiveRevision) committed = core_cache.saveSession(mode, session, expectedChatId);
            } catch {}
        }
        if (!committed) core_requestCoordinator.queueDeferredCommit(origin, { kind: 'sessions', sessions: { [mode]: session } });

        const overlay = document.getElementById(core_constants.OVERLAY_ID);
        const stayBackground = background || !committed || !core_context.isCurrentTaskOrigin(origin) || overlay?.hidden || runtimeState.activeMode !== mode;
        if (stayBackground) {
            ui_settingsPanel.refreshSettingsMemoryStatus();
            if (overlay && !overlay.hidden && !runtimeState.activeMode) archive_snapshots.scheduleChooserRefresh(20);
            if (mode === core_constants.MODE.ROOM && runtimeState.activeMode === core_constants.MODE.ROOM && committed) {
                runtimeState.activeSession = core_cache.loadSession(core_constants.MODE.ROOM) || runtimeState.activeSession;
                modes_room.renderRoom();
            }
            globalThis.toastr?.success?.(`${replaceExisting ? '后台重新生成完成' : refreshableCalendar && previousSession ? '后台刷新完成' : refreshableRelations && previousSession ? '后台刷新完成' : previousSession ? '后台增量追加完成' : '后台生成完成'}：${core_constants.MODE_LABEL[mode]}${committed ? '' : '（回到原窗口自动写入）'}`, '心跳回忆');
            return session;
        }
        runtimeState.activeMode = mode;
        runtimeState.activeSession = session;
        ui_overlay.renderActive();
        if (mode === core_constants.MODE.ROOM) void modes_room.ensureRoomLifePlan({ force: true });
        globalThis.toastr?.success?.(`${replaceExisting ? '已重新生成' : refreshableCalendar && previousSession ? '已刷新' : refreshableRelations && previousSession ? '已刷新' : previousSession ? '已增量追加' : '已生成'}：${core_constants.MODE_LABEL[mode]}${previousSession && !refreshableCalendar && !refreshableRelations && !replaceExisting ? '；旧内容保持不变' : ''}`, '心跳回忆');
        return session;
    } catch (error) {
        if (error?.name === 'AbortError') {
            console.warn('[HeartbeatMemories] generation aborted by extension/task cancellation', { mode });
            return null;
        }
        console.error('[HeartbeatMemories] generation failed', { mode, error });
        if (mode === core_constants.MODE.PHONE && error?.code === 'RMT_PHONE_DRAFT_AVAILABLE' && runtimeState.activeMode === core_constants.MODE.ROOM && runtimeState.activeSession?.kind === core_constants.MODE.ROOM) {
            modes_room.renderRoom();
        }
        if (background || document.getElementById(core_constants.OVERLAY_ID)?.hidden || runtimeState.activeMode !== mode) {
            globalThis.toastr?.error?.(core_text.toastText(error?.message || String(error)), `心跳回忆 · ${core_constants.MODE_LABEL[mode]}生成失败`);
            return null;
        }
        ui_overlay.showInlineError(error?.message || String(error));
        globalThis.toastr?.error?.(core_text.toastText(error?.message || String(error)), '心跳回忆');
        return null;
    } finally {
        runtimeState.activeModeBuildScopes.delete(taskKey);
        core_requestCoordinator.refreshConcurrentTaskUi(mode, origin);
        if (!background) ui_overlay.setInnerLoading(false);
    }
}
