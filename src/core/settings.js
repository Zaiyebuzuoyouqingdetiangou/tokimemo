// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_constants from './constants.js';
import * as core_context from './context.js';
import { state as runtimeState } from './state.js';
import * as core_text from './text.js';
import * as ui_settingsPanel from '../ui/settingsPanel.js';

export function normalizeBannedGeneratedPhrases(value) {
    const source = Array.isArray(value) ? value : String(value ?? '').split(/[\n,，]+/g);
    return [...new Set(source.map(item => core_text.normalizeText(item, 40).trim()).filter(Boolean))]
        .slice(0, core_constants.MAX_BANNED_GENERATED_PHRASES);
}

export function getPluginSettings(context = core_context.getContext()) {
    if (!context.extensionSettings || typeof context.extensionSettings !== 'object') return { ...core_constants.DEFAULT_SETTINGS };
    const raw = context.extensionSettings[core_constants.EXTENSION_SETTINGS_KEY];
    const settings = raw && typeof raw === 'object' ? raw : {};
    const normalized = {
        connectionProfileId: core_text.normalizeText(settings.connectionProfileId, 160),
        modelOverride: core_text.normalizeText(settings.modelOverride, 240),
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
    const next = { ...current, ...(patch || {}) };
    context.extensionSettings[core_constants.EXTENSION_SETTINGS_KEY] = next;
    context.saveSettingsDebounced?.();
    return getPluginSettings(context);
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
        })).filter(profile => profile.id);
    } catch {
        return [];
    }
}

export function generationSourceLabel(settings = getPluginSettings()) {
    const profile = supportedConnectionProfiles().find(item => item.id === settings.connectionProfileId);
    if (!profile) return '专用连接：未选择';
    const model = core_text.normalizeText(settings.modelOverride, 240) || profile.model;
    return `专用连接：${profile.name}${model ? ` · ${model}` : ''}`;
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
        payload.custom_include_headers = core_text.normalizeText(context.chatCompletionSettings?.custom_include_headers, 8000) || undefined;
    }
    return { apiMap, payload };
}

export async function fetchModelsForConnection(profileId, { force = false } = {}) {
    const id = core_text.normalizeText(profileId, 160);
    if (!id) return [];
    if (!force && runtimeState.connectionModelCache.has(id)) return runtimeState.connectionModelCache.get(id);
    const context = core_context.getContext();
    const profile = rawConnectionProfile(id, context);
    if (!profile) throw new Error('找不到当前选择的 Connection Manager 配置。');
    const fallback = savedModelsForProfile(id, context);
    const { payload } = connectionStatusPayload(profile, context);
    let models = [...fallback];
    if (payload && typeof context.getRequestHeaders === 'function') {
        try {
            const response = await fetch('/api/backends/chat-completions/status', {
                method: 'POST',
                headers: context.getRequestHeaders(),
                cache: 'no-cache',
                body: JSON.stringify(payload),
            });
            if (!response.ok) throw new Error(response.statusText || `HTTP ${response.status}`);
            const data = await response.json();
            const remote = Array.isArray(data?.data)
                ? data.data.map(item => core_text.normalizeText(item?.id || item?.name, 240)).filter(Boolean)
                : [];
            models = [...new Set([...fallback, ...remote])];
        } catch (error) {
            console.warn('[HeartbeatMemories] remote model list failed; using saved profile models', error);
        }
    }
    runtimeState.connectionModelCache.set(id, models);
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

export async function importCurrentSillyTavernConnection() {
    const context = core_context.getContext();
    const manager = connectionManagerSettings(context);

    const selectedId = core_text.normalizeText(manager.selectedProfile, 160);
    if (selectedId) {
        const selected = manager.profiles.find(item => String(item?.id) === selectedId);
        if (selected && supportedConnectionProfiles(context).some(item => item.id === selectedId)) {
            updatePluginSettings({ connectionProfileId: selectedId, modelOverride: '' });
            runtimeState.connectionModelCache.delete(selectedId);
            ui_settingsPanel.refreshGenerationSettingsUi();
            void ui_settingsPanel.refreshModelOptions({ fetchRemote: true });
            globalThis.toastr?.success?.('已引用酒馆当前选中的 Connection Manager 配置。', '心跳回忆');
            return selectedId;
        }
    }

    const mode = context.mainApi === 'openai' ? 'cc' : context.mainApi === 'textgenerationwebui' ? 'tc' : '';
    if (!mode) {
        throw new Error('当前酒馆 API 类型无法直接导入为独立连接。请先在 Connection Manager 中保存一个可用配置，再从下拉框选择。');
    }

    const commands = mode === 'cc'
        ? ['api', 'preset', 'api-url', 'model', 'proxy', 'prompt-post-processing', 'secret-id']
        : ['api', 'preset', 'api-url', 'model', 'instruct', 'secret-id'];
    const profile = {
        id: typeof context.uuidv4 === 'function' ? context.uuidv4() : `heartbeat-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        mode,
        exclude: [],
    };
    for (const command of commands) {
        const value = await readCurrentSlashSetting(command, context);
        if (value || command === 'api-url') profile[command] = value;
    }
    if (!profile.api) {
        throw new Error('没有读到当前酒馆的 API 类型，无法一键导入。请先确认主聊天 API 已连接。');
    }
    try {
        context.ConnectionManagerRequestService?.validateProfile?.(profile);
    } catch (error) {
        throw new Error('当前酒馆连接不是 Connection Manager 可复用的 Chat/Text Completion 类型，请先在 Connection Manager 中保存一个可用配置。', { cause: error });
    }

    const fingerprint = profileFingerprint(profile);
    const existing = manager.profiles.find(item => profileFingerprint(item) === fingerprint);
    if (existing?.id) {
        updatePluginSettings({ connectionProfileId: core_text.normalizeText(existing.id, 160), modelOverride: '' });
        runtimeState.connectionModelCache.delete(core_text.normalizeText(existing.id, 160));
        ui_settingsPanel.refreshGenerationSettingsUi();
        void ui_settingsPanel.refreshModelOptions({ fetchRemote: true });
        globalThis.toastr?.success?.('已找到相同的已保存连接，心跳回忆已直接引用。', '心跳回忆');
        return existing.id;
    }

    const displayApi = core_text.normalizeText(profile.api, 80) || 'API';
    const displayModel = core_text.normalizeText(profile.model, 100);
    profile.name = uniqueImportedProfileName(manager, `心跳回忆 · ${displayApi}${displayModel ? ` · ${displayModel}` : ''}`);
    manager.profiles.push(profile);
    context.saveSettingsDebounced?.();
    try {
        await context.eventSource?.emit?.(context.eventTypes?.CONNECTION_PROFILE_CREATED, profile);
    } catch (error) {
        console.warn('[HeartbeatMemories] connection profile created event failed', error);
    }
    updatePluginSettings({ connectionProfileId: core_text.normalizeText(profile.id, 160), modelOverride: '' });
    runtimeState.connectionModelCache.delete(core_text.normalizeText(profile.id, 160));
    ui_settingsPanel.refreshGenerationSettingsUi();
    void ui_settingsPanel.refreshModelOptions({ fetchRemote: true });
    globalThis.toastr?.success?.('已从酒馆当前连接创建“心跳回忆”专用配置；API Key 仍由 SillyTavern Secrets 保管。', '心跳回忆');
    return profile.id;
}
