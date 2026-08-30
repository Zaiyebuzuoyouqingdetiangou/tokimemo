// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_constants from './constants.js';
import * as core_context from './context.js';
import * as core_independentApi from './independentApi.js';
import { state as runtimeState } from './state.js';
import * as core_text from './text.js';

export function normalizeBannedGeneratedPhrases(value) {
    const source = Array.isArray(value) ? value : String(value ?? '').split(/[\n,，]+/g);
    return [...new Set(source.map(item => core_text.normalizeText(item, 40).trim()).filter(Boolean))]
        .slice(0, core_constants.MAX_BANNED_GENERATED_PHRASES);
}

export function getPluginSettings(context = core_context.getContext()) {
    if (!context.extensionSettings || typeof context.extensionSettings !== 'object') return { ...core_constants.DEFAULT_SETTINGS };
    const raw = context.extensionSettings[core_constants.EXTENSION_SETTINGS_KEY];
    const settings = raw && typeof raw === 'object' ? raw : {};
    let manualApiBaseUrl = '';
    try { manualApiBaseUrl = core_independentApi.normalizeManualApiBaseUrl(settings.manualApiBaseUrl); }
    catch { manualApiBaseUrl = core_text.normalizeText(settings.manualApiBaseUrl, 2000); }
    const normalized = {
        apiConnectionMode: settings.apiConnectionMode === 'manual' ? 'manual' : 'profile',
        connectionProfileId: core_text.normalizeText(settings.connectionProfileId, 160),
        modelOverride: core_text.normalizeText(settings.modelOverride, 240),
        manualApiBaseUrl,
        manualApiKey: core_text.normalizeText(settings.manualApiKey, 4000),
        manualApiModel: core_text.normalizeText(settings.manualApiModel, 240),
        maxTokens: Math.max(1024, Math.min(core_constants.MAX_GENERATION_OUTPUT_TOKENS, Number(settings.maxTokens) || core_constants.DEFAULT_SETTINGS.maxTokens)),
        temperature: Math.max(0, Math.min(2, Number.isFinite(Number(settings.temperature)) ? Number(settings.temperature) : core_constants.DEFAULT_SETTINGS.temperature)),
        roomLifeAutoDaily: settings.roomLifeAutoDaily !== false,
        useCurrentChatExternalMemory: settings.useCurrentChatExternalMemory !== false,
        usePublicMemoryProviderReaders: settings.usePublicMemoryProviderReaders === true,
        imageGenerationManualEnabled: settings.imageGenerationManualEnabled === true,
        ttDisplayMode: settings.ttDisplayMode === true,
        bannedGeneratedPhrases: settings.bannedGeneratedPhrases === undefined
            ? [...core_constants.DEFAULT_SETTINGS.bannedGeneratedPhrases]
            : normalizeBannedGeneratedPhrases(settings.bannedGeneratedPhrases),
    };
    if (!raw || JSON.stringify(raw) !== JSON.stringify(normalized)) {
        context.extensionSettings[core_constants.EXTENSION_SETTINGS_KEY] = normalized;
        context.saveSettingsDebounced?.();
    }
    return normalized;
}

export function updatePluginSettings(patch) {
    const context = core_context.getContext();
    const current = getPluginSettings(context);
    const previousApiFingerprint = core_independentApi.apiConfigurationFingerprint(current);
    const next = { ...current, ...(patch || {}) };
    context.extensionSettings[core_constants.EXTENSION_SETTINGS_KEY] = next;
    context.saveSettingsDebounced?.();
    const normalized = getPluginSettings(context);
    if (core_independentApi.apiConfigurationFingerprint(normalized) !== previousApiFingerprint) {
        runtimeState.apiConfigurationEpoch += 1;
        runtimeState.connectionModelCache.clear();
        runtimeState.connectionModelRequestEpochs.clear();
        for (const task of runtimeState.activeGenerationTasks.values()) {
            try { task?.controller?.abort?.(new DOMException('API configuration changed', 'AbortError')); } catch {}
        }
    }
    return normalized;
}

export function beginApiConfigurationOperation() {
    runtimeState.apiConfigurationEpoch += 1;
    return runtimeState.apiConfigurationEpoch;
}

export function isCurrentApiConfigurationOperation(epoch) {
    return Number(epoch) === runtimeState.apiConfigurationEpoch;
}

export function supportedConnectionProfiles(context = core_context.getContext()) {
    try {
        const service = context.ConnectionManagerRequestService;
        if (!service?.getSupportedProfiles) return [];
        return service.getSupportedProfiles().map(profile => ({
            id: core_text.normalizeText(profile?.id, 160),
            name: core_text.normalizeText(profile?.name, 180) || '未命名连接',
            model: core_text.normalizeText(profile?.model, 180),
            api: core_text.normalizeText(profile?.api, 120),
        })).filter(profile => {
            if (!profile.id) return false;
            const raw = rawConnectionProfile(profile.id, context);
            if (!raw || typeof service?.validateProfile !== 'function') return false;
            try {
                const apiMap = service.validateProfile(raw);
                return apiMap?.selected === 'openai' && !!apiMap?.source;
            } catch {
                return false;
            }
        });
    } catch {
        return [];
    }
}

export function generationSourceLabel(settings = getPluginSettings()) {
    if (settings.apiConnectionMode === 'manual') {
        const model = core_text.normalizeText(settings.manualApiModel, 240);
        return model ? `手动 API · ${model}` : '手动 API · 未完成';
    }
    let profile = supportedConnectionProfiles().find(item => item.id === settings.connectionProfileId);
    if (!profile && settings.connectionProfileId) {
        try {
            const raw = rawConnectionProfile(settings.connectionProfileId);
            if (raw) profile = { name: core_text.normalizeText(raw.name, 180) || '已保存连接', model: core_text.normalizeText(raw.model, 240) };
        } catch {}
    }
    if (!profile) return '一键连接 · 未选择';
    const model = core_text.normalizeText(settings.modelOverride, 240) || profile.model;
    return `一键连接 · ${profile.name}${model ? ` · ${model}` : ''}`;
}

export function rawConnectionProfile(profileId, context = core_context.getContext()) {
    const manager = connectionManagerSettings(context);
    return manager.profiles.find(item => String(item?.id || '') === String(profileId || '')) || null;
}

export function profileConnectionFingerprint(profile) {
    const keys = ['mode', 'api', 'api-url', 'proxy', 'secret-id'];
    return JSON.stringify(keys.map(key => core_text.normalizeText(profile?.[key], 1000)));
}

export function savedModelsForProfile(profileId, context = core_context.getContext()) {
    const manager = connectionManagerSettings(context);
    const selected = rawConnectionProfile(profileId, context);
    if (!selected) return [];
    const fingerprint = profileConnectionFingerprint(selected);
    const models = manager.profiles
        .filter(item => profileConnectionFingerprint(item) === fingerprint)
        .map(item => core_text.normalizeText(item?.model, 240))
        .filter(Boolean);
    const own = core_text.normalizeText(selected?.model, 240);
    if (own) models.unshift(own);
    return [...new Set(models)];
}

export function profileModelCacheKey(profileId, context = core_context.getContext()) {
    const id = core_text.normalizeText(profileId, 160);
    if (!id) return '';
    const profile = rawConnectionProfile(id, context);
    return profile ? `profile:${id}:${core_text.hashString(profileConnectionFingerprint(profile))}` : `profile:${id}:missing`;
}

function beginConnectionModelRequest(cacheKey) {
    const epoch = Number(runtimeState.connectionModelRequestEpochs.get(cacheKey) || 0) + 1;
    runtimeState.connectionModelRequestEpochs.set(cacheKey, epoch);
    return epoch;
}

function assertCurrentConnectionModelRequest(cacheKey, epoch) {
    if (runtimeState.connectionModelRequestEpochs.get(cacheKey) === epoch) return;
    const error = new Error('模型列表请求已被更新的请求取代。');
    error.code = 'RMT_API_MODEL_REQUEST_SUPERSEDED';
    throw error;
}

export function connectionStatusPayload(profile, context = core_context.getContext()) {
    const service = context.ConnectionManagerRequestService;
    if (!service?.validateProfile) throw new Error('当前 SillyTavern 没有 Connection Manager 校验接口。');
    const apiMap = service.validateProfile(profile);
    if (apiMap?.selected !== 'openai' || !apiMap?.source) {
        return { apiMap, payload: null };
    }
    const apiUrl = core_text.normalizeText(profile?.['api-url'], 2000);
    const payload = {
        chat_completion_source: apiMap.source,
        secret_id: core_text.normalizeText(profile?.['secret-id'], 240) || undefined,
    };
    if (apiUrl) {
        payload.custom_url = apiUrl;
        payload.vertexai_region = apiUrl;
        payload.zai_endpoint = apiUrl;
        payload.siliconflow_endpoint = apiUrl;
        payload.minimax_endpoint = apiUrl;
        payload.workers_ai_account_id = apiUrl;
    }
    if (apiMap.source === 'custom') {
        // A Connection Profile does not own the active main-chat custom headers. Borrowing them
        // here can send Profile A credentials while listing models for Profile B.
        payload.custom_include_headers = '';
        payload.custom_include_body = '';
        payload.custom_exclude_body = '';
    }
    return { apiMap, payload };
}

export async function fetchModelsForConnection(profileId, { force = false, returnMeta = false } = {}) {
    const id = core_text.normalizeText(profileId, 160);
    if (!id) return [];
    const context = core_context.getContext();
    core_independentApi.assertConnectionManagerProfileSupport(context.ConnectionManagerRequestService);
    const cacheKey = profileModelCacheKey(id, context);
    if (!force && runtimeState.connectionModelCache.has(cacheKey)) {
        const cached = runtimeState.connectionModelCache.get(cacheKey);
        return returnMeta ? { models: cached, fallbackOnly: false, cached: true } : cached;
    }
    const requestEpoch = beginConnectionModelRequest(cacheKey);
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    const configurationEpoch = runtimeState.apiConfigurationEpoch;
    const profile = rawConnectionProfile(id, context);
    if (!profile) throw new Error('找不到当前选择的 Connection Manager 配置。');
    const profileStateFingerprint = profileFingerprint(profile);
    const fallback = savedModelsForProfile(id, context);
    const { payload } = connectionStatusPayload(profile, context);
    let models = [...fallback];
    let fallbackOnly = false;
    if (payload && typeof context.getRequestHeaders === 'function') {
        const controller = new AbortController();
        let timedOut = false;
        const timeoutId = setTimeout(() => {
            timedOut = true;
            try { controller.abort(); } catch {}
        }, core_constants.MANUAL_API_MODEL_LIST_TIMEOUT_MS);
        try {
            const response = await fetch('/api/backends/chat-completions/status', {
                method: 'POST',
                headers: context.getRequestHeaders(),
                cache: 'no-cache',
                credentials: 'same-origin',
                signal: controller.signal,
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                try { await response.body?.cancel?.(); } catch {}
                const error = new Error(`HTTP ${response.status}`);
                error.status = response.status;
                throw error;
            }
            const data = await core_independentApi.readBoundedJsonResponse(response, 2000000);
            if (core_independentApi.payloadHasProviderError(data)) {
                const error = new Error('Connection Profile model status returned an error envelope');
                error.code = 'RMT_PROFILE_MODEL_STATUS';
                throw error;
            }
            const remote = core_independentApi.extractManualModelIds(data);
            models = [...new Set([...fallback, ...remote])];
        } catch (error) {
            const safeDetail = timedOut ? 'timeout' : Number(error?.status) ? `HTTP ${Number(error.status)}` : core_text.normalizeText(error?.code, 80) || 'unavailable';
            console.warn(`[HeartbeatMemories] profile model list unavailable; using same-transport saved models (${safeDetail})`);
            if (!fallback.length) throw new Error('模型列表暂时不可用；请检查这一键连接，或在 Connection Manager 中保存模型后重试。');
            fallbackOnly = true;
        } finally {
            clearTimeout(timeoutId);
        }
    }
    if (lifecycleEpoch !== runtimeState.runtimeLifecycleEpoch) throw new DOMException('Runtime destroyed', 'AbortError');
    if (configurationEpoch !== runtimeState.apiConfigurationEpoch
        || profileModelCacheKey(id, context) !== cacheKey
        || profileFingerprint(rawConnectionProfile(id, context)) !== profileStateFingerprint) {
        throw new DOMException('API configuration changed', 'AbortError');
    }
    assertCurrentConnectionModelRequest(cacheKey, requestEpoch);
    runtimeState.connectionModelCache.set(cacheKey, models);
    return returnMeta ? { models, fallbackOnly, cached: false } : models;
}

export async function fetchModelsForManualConnection(settings, { force = false, context = core_context.getContext(), signal = null } = {}) {
    const candidate = {
        ...getPluginSettings(context),
        ...(settings || {}),
        apiConnectionMode: 'manual',
    };
    const cacheKey = core_independentApi.manualModelCacheKey(candidate);
    if (!force && runtimeState.connectionModelCache.has(cacheKey)) return runtimeState.connectionModelCache.get(cacheKey);
    const requestEpoch = beginConnectionModelRequest(cacheKey);
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    const configurationEpoch = runtimeState.apiConfigurationEpoch;
    const models = await core_independentApi.fetchManualApiModels(candidate, context, { signal });
    if (lifecycleEpoch !== runtimeState.runtimeLifecycleEpoch) throw new DOMException('Runtime destroyed', 'AbortError');
    if (configurationEpoch !== runtimeState.apiConfigurationEpoch) throw new DOMException('API configuration changed', 'AbortError');
    assertCurrentConnectionModelRequest(cacheKey, requestEpoch);
    runtimeState.connectionModelCache.set(cacheKey, models);
    return models;
}

export function connectionManagerSettings(context = core_context.getContext()) {
    const manager = context.extensionSettings?.connectionManager;
    if (!manager || !Array.isArray(manager.profiles)) {
        throw new Error('当前 SillyTavern 没有可用的 Connection Manager 配置，请先启用官方 Connection Manager。');
    }
    if (Array.isArray(context.extensionSettings?.disabledExtensions)
        && context.extensionSettings.disabledExtensions.includes('connection-manager')) {
        throw new Error('Connection Manager 当前已被禁用，请先在 SillyTavern 中启用它。');
    }
    return manager;
}

export function slashCommandObject(command, context = core_context.getContext()) {
    const key = core_text.normalizeText(command, 80);
    const value = key ? context.SlashCommandParser?.commands?.[key] : null;
    return value && typeof value.callback === 'function' ? value : null;
}

export async function invokeSlashCommandCapture(commandOrObject, namedArgs = {}, unnamed = '', context = core_context.getContext()) {
    const command = typeof commandOrObject === 'string'
        ? slashCommandObject(commandOrObject, context)
        : commandOrObject;
    if (!command || typeof command.callback !== 'function') throw new Error('目标 Slash Command 当前不可用。');
    // SillyTavern's public SlashCommand callback contract accepts a NamedArgumentsCapture object
    // without parser-internal _scope/_parserFlags fields. Do not fabricate those private objects.
    const capture = {};
    for (const [key, value] of Object.entries(namedArgs || {})) {
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(key)) continue;
        if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) capture[key] = value;
    }
    return await command.callback.call(command, capture, String(unnamed ?? ''));
}

export async function readCurrentSlashSetting(command, context = core_context.getContext()) {
    if (!slashCommandObject(command, context)) return '';
    try {
        return core_text.normalizeText(await invokeSlashCommandCapture(command, { quiet: 'true' }, '', context), 1000);
    } catch (error) {
        console.warn(`[HeartbeatMemories] failed to read current slash setting: ${command}`, error);
        return '';
    }
}

export function profileFingerprint(profile) {
    const keys = ['mode', 'api', 'preset', 'api-url', 'model', 'proxy', 'prompt-post-processing', 'instruct', 'secret-id'];
    return JSON.stringify(keys.map(key => core_text.normalizeText(profile?.[key], 1000)));
}

export function uniqueImportedProfileName(manager, base) {
    const names = new Set((manager.profiles || []).map(item => String(item?.name || '')));
    if (!names.has(base)) return base;
    let index = 2;
    while (names.has(`${base} ${index}`)) index += 1;
    return `${base} ${index}`;
}

export async function importCurrentSillyTavernConnection(options = {}) {
    const assertStillCurrent = () => {
        if (typeof options.isCurrent !== 'function' || options.isCurrent() !== false) return;
        const error = new Error('一键配置已取消：等待期间你选择了另一组 API 设置。');
        error.code = 'RMT_API_CONFIGURATION_SUPERSEDED';
        throw error;
    };
    const context = core_context.getContext();
    const manager = connectionManagerSettings(context);
    const service = context.ConnectionManagerRequestService;
    core_independentApi.assertConnectionManagerProfileSupport(service);
    assertStillCurrent();

    const selectedId = core_text.normalizeText(manager.selectedProfile, 160);
    if (selectedId) {
        const selected = manager.profiles.find(item => String(item?.id) === selectedId);
        if (selected) {
            const apiMap = service.validateProfile(selected);
            if (apiMap?.selected !== 'openai' || !apiMap?.source) {
                throw new Error('当前酒馆连接不是可复用的 Chat Completion 配置。');
            }
            assertStillCurrent();
            const current = getPluginSettings(context);
            const retainedModel = current.connectionProfileId === selectedId ? current.modelOverride : '';
            updatePluginSettings({ apiConnectionMode: 'profile', connectionProfileId: selectedId, modelOverride: retainedModel });
            return {
                id: selectedId,
                name: core_text.normalizeText(selected.name, 180) || '当前连接',
                model: retainedModel || core_text.normalizeText(selected.model, 240),
                created: false,
            };
        }
    }

    if (context.mainApi !== 'openai') {
        throw new Error('当前主连接不是 Chat Completion。请先切到可用连接，或改用手动配置。');
    }

    const commands = ['api', 'preset', 'api-url', 'model', 'proxy', 'prompt-post-processing', 'secret-id'];
    const profile = {
        id: typeof context.uuidv4 === 'function' ? context.uuidv4() : `heartbeat-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        mode: 'cc',
        exclude: [],
    };
    for (const command of commands) {
        const value = await readCurrentSlashSetting(command, context);
        assertStillCurrent();
        if (value || command === 'api-url') profile[command] = value;
    }
    if (!profile.api) {
        throw new Error('没有读到当前酒馆的 API 类型，无法一键导入。请先确认主聊天 API 已连接。');
    }
    try {
        const apiMap = service.validateProfile(profile);
        if (apiMap?.selected !== 'openai' || !apiMap?.source) throw new Error('Unsupported request family');
    } catch (error) {
        throw new Error('当前酒馆连接不是 Connection Manager 可复用的 Chat/Text Completion 类型，请先在 Connection Manager 中保存一个可用配置。', { cause: error });
    }

    const fingerprint = profileFingerprint(profile);
    const existing = manager.profiles.find(item => profileFingerprint(item) === fingerprint);
    if (existing?.id) {
        assertStillCurrent();
        const id = core_text.normalizeText(existing.id, 160);
        const current = getPluginSettings(context);
        const retainedModel = current.connectionProfileId === id ? current.modelOverride : '';
        updatePluginSettings({ apiConnectionMode: 'profile', connectionProfileId: id, modelOverride: retainedModel });
        return { id, name: core_text.normalizeText(existing.name, 180) || '已保存连接', model: retainedModel || core_text.normalizeText(existing.model, 240), created: false };
    }

    assertStillCurrent();
    const displayApi = core_text.normalizeText(profile.api, 80) || 'API';
    const displayModel = core_text.normalizeText(profile.model, 100);
    profile.name = uniqueImportedProfileName(manager, `心跳回忆 · ${displayApi}${displayModel ? ` · ${displayModel}` : ''}`);
    manager.profiles.push(profile);
    context.saveSettingsDebounced?.();
    assertStillCurrent();
    updatePluginSettings({ apiConnectionMode: 'profile', connectionProfileId: core_text.normalizeText(profile.id, 160), modelOverride: '' });
    try {
        await context.eventSource?.emit?.(context.eventTypes?.CONNECTION_PROFILE_CREATED, profile);
    } catch (error) {
        console.warn('[HeartbeatMemories] connection profile created event failed', error);
    }
    return { id: profile.id, name: profile.name, model: displayModel, created: true };
}
