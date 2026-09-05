// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_constants from './constants.js';
import * as core_context from './context.js';
import * as core_independentApi from './independentApi.js';
import { state as runtimeState } from './state.js';
import * as core_text from './text.js';
import * as core_theme from './theme.js';

export function normalizeBannedGeneratedPhrases(value) {
    const source = Array.isArray(value) ? value : String(value ?? '').split(/[\n,，]+/g);
    return [...new Set(source.map(item => core_text.normalizeText(item, 40).trim()).filter(Boolean))]
        .slice(0, core_constants.MAX_BANNED_GENERATED_PHRASES);
}

export function getPluginSettings(context = core_context.getContext()) {
    if (!context.extensionSettings || typeof context.extensionSettings !== 'object') {
        return { ...core_constants.DEFAULT_SETTINGS, manualApiKey: core_text.normalizeText(runtimeState.manualApiKey, 4000) };
    }
    const raw = context.extensionSettings[core_constants.EXTENSION_SETTINGS_KEY];
    const settings = raw && typeof raw === 'object' ? raw : {};
    let manualApiBaseUrl = '';
    try { manualApiBaseUrl = core_independentApi.normalizeManualApiBaseUrl(settings.manualApiBaseUrl); }
    catch { manualApiBaseUrl = ''; }
    const persisted = {
        apiConnectionMode: settings.apiConnectionMode === 'manual' ? 'manual' : 'profile',
        connectionProfileId: core_text.normalizeText(settings.connectionProfileId, 160),
        modelOverride: core_text.normalizeText(settings.modelOverride, 240),
        manualApiBaseUrl,
        manualApiModel: core_text.normalizeText(settings.manualApiModel, 240),
        maxTokens: Math.max(1024, Math.min(core_constants.MAX_GENERATION_OUTPUT_TOKENS, Number(settings.maxTokens) || core_constants.DEFAULT_SETTINGS.maxTokens)),
        temperature: Math.max(0, Math.min(2, Number.isFinite(Number(settings.temperature)) ? Number(settings.temperature) : core_constants.DEFAULT_SETTINGS.temperature)),
        roomLifeAutoDaily: settings.roomLifeAutoDaily !== false,
        useCurrentChatExternalMemory: settings.useCurrentChatExternalMemory !== false,
        imageGenerationManualEnabled: settings.imageGenerationManualEnabled === true,
        ttDisplayMode: settings.ttDisplayMode === true,
        themeMode: core_constants.THEME_MODES.has(settings.themeMode) ? settings.themeMode : 'default',
        themeAlpha: Math.max(0.72, Math.min(1, Number.isFinite(Number(settings.themeAlpha)) ? Number(settings.themeAlpha) : core_constants.DEFAULT_SETTINGS.themeAlpha)),
        themeCustom: core_theme.normalizeThemeCustom(settings.themeCustom),
        bannedGeneratedPhrases: settings.bannedGeneratedPhrases === undefined
            ? [...core_constants.DEFAULT_SETTINGS.bannedGeneratedPhrases]
            : normalizeBannedGeneratedPhrases(settings.bannedGeneratedPhrases),
    };
    if (!raw || JSON.stringify(raw) !== JSON.stringify(persisted)) {
        // Older releases persisted arbitrary provider keys here. Remove them rather than
        // migrating them into another browser store; pure front-end storage is not a secret vault.
        context.extensionSettings[core_constants.EXTENSION_SETTINGS_KEY] = persisted;
        context.saveSettingsDebounced?.();
    }
    return { ...persisted, manualApiKey: core_text.normalizeText(runtimeState.manualApiKey, 4000) };
}

export function updatePluginSettings(patch) {
    const context = core_context.getContext();
    const current = getPluginSettings(context);
    const previousApiFingerprint = core_independentApi.apiConfigurationFingerprint(current);
    const supplied = patch && typeof patch === 'object' ? { ...patch } : {};
    if (Object.prototype.hasOwnProperty.call(supplied, 'manualApiKey')) {
        runtimeState.manualApiKey = core_text.normalizeText(supplied.manualApiKey, 4000);
        delete supplied.manualApiKey;
    }
    const next = { ...current, ...supplied };
    delete next.manualApiKey;
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
    const selected = rawConnectionProfile(profileId, context);
    if (!selected) return [];
    const own = core_text.normalizeText(selected?.model, 240);
    return own ? [own] : [];
}

export function profileModelCacheKey(profileId, context = core_context.getContext(), transportFingerprint = '') {
    const id = core_text.normalizeText(profileId, 160);
    if (!id) return '';
    const profile = rawConnectionProfile(id, context);
    const resolved = core_text.normalizeText(transportFingerprint, 240);
    return profile ? `profile:${id}:${core_text.hashString(profileConnectionFingerprint(profile))}:${resolved || 'none'}` : `profile:${id}:missing`;
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

export function connectionStatusPayload(profile, context = core_context.getContext(), proxyPresets = []) {
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
        if (apiMap.source === 'custom') payload.custom_url = apiUrl;
        if (apiMap.source === 'vertexai') payload.vertexai_region = apiUrl;
        if (apiMap.source === 'zai') payload.zai_endpoint = apiUrl;
        if (apiMap.source === 'siliconflow') payload.siliconflow_endpoint = apiUrl;
        if (apiMap.source === 'minimax') payload.minimax_endpoint = apiUrl;
    }
    const proxyName = core_text.normalizeText(profile?.proxy, 240);
    if (proxyName && proxyName.toLowerCase() !== 'none') {
        const proxy = (Array.isArray(proxyPresets) ? proxyPresets : []).find(item => String(item?.name || '') === proxyName);
        if (!proxy) {
            const error = new Error('这一键连接指定的代理无法从 Profile 自身安全解析；已停止远端拉取，且不会借用正文连接。');
            error.code = 'RMT_PROFILE_PROXY_UNAVAILABLE';
            throw error;
        }
        const proxyUrl = core_text.normalizeText(proxy?.url, 2000);
        const proxyPassword = core_text.normalizeText(proxy?.password, 1000);
        let parsedProxy = null;
        try { parsedProxy = new URL(proxyUrl); } catch {}
        if (!proxyUrl || !parsedProxy || !['http:', 'https:'].includes(parsedProxy.protocol)
            || parsedProxy.username || parsedProxy.password) {
            const error = new Error('这一键连接指定的代理缺少有效的 HTTP(S) 地址；已停止远端拉取，且不会静默改为直连。');
            error.code = 'RMT_PROFILE_PROXY_UNAVAILABLE';
            throw error;
        }
        payload.reverse_proxy = parsedProxy.toString();
        if (proxyPassword) payload.proxy_password = proxyPassword;
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

async function resolvedProfileTransportSnapshot(profile) {
    const proxyName = core_text.normalizeText(profile?.proxy, 240);
    if (!proxyName || proxyName.toLowerCase() === 'none') {
        return {
            proxyPresets: [],
            fingerprint: `${core_text.hashString(profileFingerprint(profile))}:none`,
            remoteStatusSupported: true,
        };
    }
    // The current public Connection Manager API does not expose the named-proxy registry
    // through a documented read method. Generation still uses ConnectionManagerRequestService with the
    // selected Profile, but model discovery must not import private host modules or borrow
    // another transport's credentials. Use only the model saved on this Profile.
    return {
        proxyPresets: [],
        fingerprint: `${core_text.hashString(profileFingerprint(profile))}:named-proxy:${core_text.hashString(proxyName)}`,
        remoteStatusSupported: false,
    };
}

export async function resolvedProfileTransportFingerprint(profile) {
    return (await resolvedProfileTransportSnapshot(profile)).fingerprint;
}

export async function resolvedProfileModelCacheKey(profileId, context = core_context.getContext()) {
    const id = core_text.normalizeText(profileId, 160);
    if (!id) return '';
    const profile = rawConnectionProfile(id, context);
    if (!profile) return '';
    const fingerprint = await resolvedProfileTransportFingerprint(profile);
    return profileModelCacheKey(id, context, fingerprint);
}

export async function fetchModelsForConnection(profileId, { force = false, returnMeta = false } = {}) {
    const id = core_text.normalizeText(profileId, 160);
    if (!id) return [];
    const context = core_context.getContext();
    core_independentApi.assertConnectionManagerProfileSupport(context.ConnectionManagerRequestService);
    const profile = rawConnectionProfile(id, context);
    if (!profile) throw new Error('找不到当前选择的 Connection Manager 配置。');
    const proxyName = core_text.normalizeText(profile?.proxy, 240);
    const transportSnapshot = proxyName && proxyName.toLowerCase() !== 'none'
        ? await resolvedProfileTransportSnapshot(profile)
        : { proxyPresets: [], fingerprint: `${core_text.hashString(profileFingerprint(profile))}:none`, remoteStatusSupported: true };
    const cacheKey = profileModelCacheKey(id, context, transportSnapshot.fingerprint);
    if (!force && runtimeState.connectionModelCache.has(cacheKey)) {
        const cached = runtimeState.connectionModelCache.get(cacheKey);
        return returnMeta ? { models: cached, fallbackOnly: transportSnapshot.remoteStatusSupported === false, cached: true } : cached;
    }
    const requestEpoch = beginConnectionModelRequest(cacheKey);
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    const configurationEpoch = runtimeState.apiConfigurationEpoch;
    const profileStateFingerprint = transportSnapshot.fingerprint;
    const fallback = savedModelsForProfile(id, context);
    let models = [...fallback];
    let fallbackOnly = false;
    let payload = null;
    if (transportSnapshot.remoteStatusSupported === false) {
        if (!fallback.length) throw new Error('命名代理无法通过公开接口读取远程模型列表；请先在 Connection Manager 中为这个配置保存模型。');
        fallbackOnly = true;
    } else {
        try {
            ({ payload } = connectionStatusPayload(profile, context, transportSnapshot.proxyPresets));
        } catch (error) {
            if (!fallback.length) throw new Error('远程模型列表不可用，且这一键连接没有自己保存的模型。请先在 Connection Manager 中保存模型或修复该 Profile 的代理。');
            fallbackOnly = true;
        }
    }
    if (payload && typeof context.getRequestHeaders === 'function') {
        const controller = new AbortController();
        let timeoutId = 0;
        try {
            const fetchPromise = fetch('/api/backends/chat-completions/status', {
                method: 'POST',
                headers: context.getRequestHeaders(),
                cache: 'no-cache',
                credentials: 'same-origin',
                signal: controller.signal,
                body: JSON.stringify(payload),
            });
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    const error = new Error('一键连接模型列表请求超时。');
                    error.code = 'RMT_PROFILE_MODEL_TIMEOUT';
                    try { controller.abort(error); } catch {}
                    reject(error);
                }, core_constants.MANUAL_API_MODEL_LIST_TIMEOUT_MS);
            });
            const response = await Promise.race([fetchPromise, timeoutPromise]);
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
            if (!remote.length) {
                if (!fallback.length) throw core_text.safeUserError('接口没有返回可用模型，且这一键连接没有保存默认模型。', 'RMT_MANUAL_MODELS_EMPTY');
                models = [...fallback];
                fallbackOnly = true;
            } else models = [...new Set([...fallback, ...remote])];
        } catch (error) {
            console.warn('[HeartbeatMemories] profile model list unavailable; using same-transport saved models', core_text.safeErrorDiagnostic(error));
            if (!fallback.length) throw new Error('模型列表暂时不可用；请检查这一键连接，或在 Connection Manager 中保存模型后重试。');
            fallbackOnly = true;
        } finally {
            clearTimeout(timeoutId);
        }
    }
    if (lifecycleEpoch !== runtimeState.runtimeLifecycleEpoch) throw new DOMException('Runtime destroyed', 'AbortError');
    let latestTransportFingerprint = 'missing';
    try { latestTransportFingerprint = await resolvedProfileTransportFingerprint(rawConnectionProfile(id, context)); } catch {}
    if (configurationEpoch !== runtimeState.apiConfigurationEpoch
        || profileModelCacheKey(id, context, latestTransportFingerprint) !== cacheKey
        || latestTransportFingerprint !== profileStateFingerprint) {
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
        console.warn('[HeartbeatMemories] failed to read one current slash setting', core_text.safeErrorDiagnostic(error));
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
    const readHostConnectionSnapshot = async () => {
        const values = {};
        for (const command of commands) {
            values[command] = await readCurrentSlashSetting(command, context);
            assertStillCurrent();
        }
        return {
            mainApi: core_text.normalizeText(context.mainApi, 80),
            selectedProfile: core_text.normalizeText(manager.selectedProfile, 160),
            values,
        };
    };
    const firstHostSnapshot = await readHostConnectionSnapshot();
    const secondHostSnapshot = await readHostConnectionSnapshot();
    if (JSON.stringify(firstHostSnapshot) !== JSON.stringify(secondHostSnapshot)) {
        const error = new Error('读取期间酒馆主连接发生变化；本次一键配置已取消，请重试。');
        error.code = 'RMT_API_CONFIGURATION_SUPERSEDED';
        throw error;
    }
    for (const command of commands) {
        const value = secondHostSnapshot.values[command];
        if (value || command === 'api-url') profile[command] = value;
    }
    if (core_text.normalizeText(profile['api-url'], 2000)) {
        // Validate only. Connection Manager owns the exact path; Heartbeat must neither
        // normalize it into a different endpoint nor persist credentials hidden in its query.
        core_independentApi.normalizeManualApiBaseUrl(profile['api-url'], { required: true });
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
        console.warn('[HeartbeatMemories] connection profile created event failed', core_text.safeErrorDiagnostic(error));
    }
    return { id: profile.id, name: profile.name, model: displayModel, created: true };
}
