// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_repository from '../archive/repository.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_independentApi from '../core/independentApi.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as ui_archivePortal from './archivePortal.js';
import * as ui_overlay from './overlay.js';
import * as ui_styles from './styles.js';

export async function refreshModelOptions({ fetchRemote = false } = {}) {
    const panel = document.getElementById(core_constants.SETTINGS_ID);
    if (!panel) return;
    const select = panel.querySelector('[data-rmt-api-model]');
    const refreshButton = panel.querySelector('[data-rmt-api-model-refresh]');
    if (!select) return;
    const requestEpoch = Number(panel.dataset.rmtProfileModelRequest || 0) + 1;
    panel.dataset.rmtProfileModelRequest = String(requestEpoch);
    const settings = core_settings.getPluginSettings();
    const profileId = core_text.normalizeText(settings.connectionProfileId, 160);
    const configurationEpoch = runtimeState.apiConfigurationEpoch;
    let profileCacheKey = '';
    let profileStateFingerprint = '';
    try { profileCacheKey = profileId ? core_settings.profileModelCacheKey(profileId) : ''; } catch {}
    const isCurrent = () => Number(panel.dataset.rmtProfileModelRequest || 0) === requestEpoch
        && runtimeState.apiConfigurationEpoch === configurationEpoch
        && core_settings.getPluginSettings().connectionProfileId === profileId
        && (() => {
            try {
                if (!profileId || core_settings.profileModelCacheKey(profileId) !== profileCacheKey) return !profileId;
                return core_settings.profileFingerprint(core_settings.rawConnectionProfile(profileId)) === profileStateFingerprint;
            }
            catch { return false; }
        })();
    if (refreshButton) {
        refreshButton.disabled = fetchRemote || !profileId;
        refreshButton.textContent = fetchRemote ? '正在拉取…' : '刷新模型';
    }
    if (!profileId) {
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '请先选择专用连接';
        select.replaceChildren(defaultOption);
        select.disabled = true;
        return { models: [], fallbackOnly: false };
    }
    let profile;
    try { profile = core_settings.rawConnectionProfile(profileId); } catch { profile = null; }
    profileStateFingerprint = profile ? core_settings.profileFingerprint(profile) : 'missing';
    const profileModel = core_text.normalizeText(profile?.model, 240);
    select.disabled = fetchRemote;
    let models = [];
    let fallbackOnly = false;
    try {
        if (fetchRemote) {
            const result = await core_settings.fetchModelsForConnection(profileId, { force: true, returnMeta: true });
            models = result.models;
            fallbackOnly = result.fallbackOnly;
        } else {
            models = runtimeState.connectionModelCache.get(profileCacheKey) || core_settings.savedModelsForProfile(profileId);
        }
    } catch (error) {
        if (!isCurrent() || error?.code === 'RMT_API_MODEL_REQUEST_SUPERSEDED' || error?.name === 'AbortError') return null;
        console.warn('[HeartbeatMemories] refresh model options failed', error);
        if (!fetchRemote) {
            models = profileModel ? [profileModel] : [];
        } else {
            if (refreshButton) {
                refreshButton.disabled = false;
                refreshButton.textContent = '刷新模型';
            }
            select.disabled = false;
            throw error;
        }
    }
    if (!isCurrent()) return null;
    const currentSettings = core_settings.getPluginSettings();
    const override = core_text.normalizeText(currentSettings.modelOverride, 240);
    if (override && !models.includes(override)) models.unshift(override);
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = profileModel ? `使用配置默认模型 · ${profileModel}` : '使用配置默认模型';
    select.replaceChildren(defaultOption);
    for (const model of [...new Set(models)]) {
        if (!model) continue;
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        select.appendChild(option);
    }
    select.value = override;
    select.disabled = false;
    if (refreshButton) {
        refreshButton.disabled = false;
        refreshButton.textContent = '刷新模型';
    }
    return { models, fallbackOnly };
}

function manualSettingsFromPanel(panel) {
    const current = core_settings.getPluginSettings();
    const keyInput = panel?.querySelector?.('[data-rmt-manual-api-key]');
    const baseInput = panel?.querySelector?.('[data-rmt-manual-api-base]');
    const modelInput = panel?.querySelector?.('[data-rmt-manual-api-model]');
    return {
        ...current,
        apiConnectionMode: 'manual',
        manualApiBaseUrl: baseInput ? baseInput.value : current.manualApiBaseUrl,
        manualApiKey: core_text.normalizeText(keyInput?.value, 4000) || current.manualApiKey,
        manualApiModel: modelInput ? modelInput.value : current.manualApiModel,
    };
}

export async function refreshManualModelOptions({ fetchRemote = false } = {}) {
    const panel = document.getElementById(core_constants.SETTINGS_ID);
    if (!panel) return [];
    const input = panel.querySelector('[data-rmt-manual-api-model]');
    const list = panel.querySelector('[data-rmt-manual-api-models]');
    const button = panel.querySelector('[data-rmt-manual-api-model-refresh]');
    if (!input || !list) return [];
    const candidate = manualSettingsFromPanel(panel);
    const signature = core_independentApi.apiConfigurationFingerprint(candidate);
    const requestEpoch = Number(panel.dataset.rmtManualModelRequest || 0) + 1;
    panel.dataset.rmtManualModelRequest = String(requestEpoch);
    const isCurrent = () => Number(panel.dataset.rmtManualModelRequest || 0) === requestEpoch
        && core_independentApi.apiConfigurationFingerprint(manualSettingsFromPanel(panel)) === signature;
    if (button) {
        button.disabled = fetchRemote;
        button.textContent = fetchRemote ? '正在拉取…' : '拉取模型';
    }
    let models = runtimeState.connectionModelCache.get(core_independentApi.manualModelCacheKey(candidate)) || [];
    try {
        if (fetchRemote) models = await core_settings.fetchModelsForManualConnection(candidate, { force: true });
    } catch (error) {
        if (!isCurrent() || error?.code === 'RMT_API_MODEL_REQUEST_SUPERSEDED' || error?.name === 'AbortError') return null;
        if (button) { button.disabled = false; button.textContent = '拉取模型'; }
        throw error;
    }
    if (!isCurrent()) return null;
    list.replaceChildren();
    for (const model of [...new Set(models)]) {
        const option = document.createElement('option');
        option.value = model;
        list.appendChild(option);
    }
    if (!input.value && models[0]) {
        input.value = models[0];
        panel.dataset.rmtManualDirty = '1';
    }
    if (button) {
        button.disabled = false;
        button.textContent = '拉取模型';
    }
    return models;
}

export function refreshGenerationSettingsUi() {
    const panel = document.getElementById(core_constants.SETTINGS_ID);
    if (!panel) return;
    const settings = core_settings.getPluginSettings();
    const connectionMode = settings.apiConnectionMode === 'manual' ? 'manual' : 'profile';
    const editorMode = panel.dataset.rmtApiEditor === 'manual' || panel.dataset.rmtApiEditor === 'profile'
        ? panel.dataset.rmtApiEditor
        : connectionMode;
    panel.dataset.rmtApiEditor = editorMode;
    const profile = panel.querySelector('[data-rmt-api-profile]');
    const oneClick = panel.querySelector('[data-rmt-api-import-current]');
    const manualChoice = panel.querySelector('[data-rmt-api-select-manual]');
    const profilePanel = panel.querySelector('[data-rmt-api-profile-panel]');
    const manualPanel = panel.querySelector('[data-rmt-api-manual-panel]');
    const manualBase = panel.querySelector('[data-rmt-manual-api-base]');
    const manualKey = panel.querySelector('[data-rmt-manual-api-key]');
    const manualModel = panel.querySelector('[data-rmt-manual-api-model]');
    const maxTokens = panel.querySelector('[data-rmt-api-max-tokens]');
    const temperature = panel.querySelector('[data-rmt-api-temperature]');
    const roomDaily = panel.querySelector('[data-rmt-room-life-auto]');
    const imageGenerationManual = panel.querySelector('[data-rmt-image-generation-manual]');
    const ttDisplay = panel.querySelector('[data-rmt-tt-display]');
    const bannedPhrases = panel.querySelector('[data-rmt-banned-generated-phrases]');
    const status = panel.querySelector('[data-rmt-api-status]');
    if (profile) {
        const profiles = core_settings.supportedConnectionProfiles();
        profile.replaceChildren();
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = profiles.length ? '选择 Connection Manager 配置' : '没有可用的连接配置';
        profile.appendChild(empty);
        for (const item of profiles) {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `${item.name}${item.model ? ` · ${item.model}` : ''}`;
            profile.appendChild(option);
        }
        profile.value = profiles.some(item => item.id === settings.connectionProfileId) ? settings.connectionProfileId : '';
    }
    if (oneClick) {
        oneClick.classList.toggle('is-active', editorMode === 'profile');
        oneClick.setAttribute('aria-pressed', editorMode === 'profile' ? 'true' : 'false');
    }
    if (manualChoice) {
        manualChoice.classList.toggle('is-active', editorMode === 'manual');
        manualChoice.setAttribute('aria-pressed', editorMode === 'manual' ? 'true' : 'false');
    }
    if (profilePanel) profilePanel.hidden = editorMode !== 'profile';
    if (manualPanel) manualPanel.hidden = editorMode !== 'manual';
    const manualDirty = panel.dataset.rmtManualDirty === '1';
    if (!manualDirty && manualBase) manualBase.value = settings.manualApiBaseUrl;
    if (!manualDirty && manualModel) manualModel.value = settings.manualApiModel;
    if (!manualDirty && manualKey) {
        manualKey.value = '';
        manualKey.placeholder = settings.manualApiKey ? '已保存；留空则保留' : 'API Key（可留空）';
    }
    if (maxTokens) maxTokens.value = String(settings.maxTokens);
    if (temperature) {
        temperature.value = String(settings.temperature);
        temperature.disabled = false;
        temperature.title = '覆盖心跳回忆专用连接的温度';
    }
    if (roomDaily) roomDaily.checked = settings.roomLifeAutoDaily;
    if (imageGenerationManual) imageGenerationManual.checked = settings.imageGenerationManualEnabled;
    if (ttDisplay) ttDisplay.checked = settings.ttDisplayMode;
    if (bannedPhrases) bannedPhrases.value = settings.bannedGeneratedPhrases.join('，');
    if (status) {
        let profileCapabilityReady = false;
        let manualConfigurationReady = false;
        if (connectionMode === 'profile' && settings.connectionProfileId) {
            try {
                core_independentApi.assertConnectionManagerProfileSupport(core_context.getContext().ConnectionManagerRequestService);
                profileCapabilityReady = true;
            } catch {}
        }
        if (connectionMode === 'manual' && settings.manualApiModel) {
            try {
                core_independentApi.assertManualApiCredentialTransport(settings.manualApiBaseUrl, settings.manualApiKey);
                manualConfigurationReady = true;
            } catch {}
        }
        const ready = connectionMode === 'manual'
            ? manualConfigurationReady
            : !!settings.connectionProfileId && profileCapabilityReady;
        status.classList.toggle('is-ready', ready);
        status.textContent = `${ready ? '●' : '○'} ${ready
            ? core_settings.generationSourceLabel(settings)
            : connectionMode === 'manual' ? '手动配置未完成'
            : settings.connectionProfileId ? '需要 1.1.18 能力' : '一键连接未配置'}`;
    }
    void refreshModelOptions();
    void refreshManualModelOptions();
}

export function hydrateSettingsPanel() {
    const panel = document.getElementById(core_constants.SETTINGS_ID);
    if (!panel) return false;
    refreshSettingsMemoryStatus({ lightweight: true });
    if (panel.dataset.rmtHydrated === '1') return true;
    refreshGenerationSettingsUi();
    panel.dataset.rmtHydrated = '1';
    return true;
}

export function refreshSettingsMemoryStatus({ lightweight = false } = {}) {
    const panel = document.getElementById(core_constants.SETTINGS_ID);
    if (!panel) return;
    const openButton = panel.querySelector('[data-rmt-settings-open-archive]');
    const archiveButton = panel.querySelector('[data-rmt-settings-current-archive]');
    const taskCount = runtimeState.activeGenerationTasks.size;
    if (openButton) {
        openButton.disabled = false;
        openButton.textContent = runtimeState.busy ? '打开档案室 · 档案整理中' : taskCount ? `打开档案室 · ${taskCount}项生成中` : '打开档案室';
    }
    if (archiveButton) {
        let ready = false;
        let actionable = false;
        try {
            const context = core_context.currentCharacterGuard();
            actionable = !!core_context.getChatId(context);
            ready = lightweight
                ? !!archive_repository.getImportedMemory(context)
                : archive_repository.getMemoryState(context).status === 'ready';
        } catch {}
        archiveButton.disabled = runtimeState.busy || core_requestCoordinator.hasGenerationTasks() || !actionable;
        archiveButton.textContent = !actionable
            ? '当前窗口档案不可用'
            : runtimeState.busy ? '当前窗口档案整理中…'
            : ready ? '增量更新当前窗口档案' : '生成当前窗口档案';
    }
}

export function mountSettings() {
    ui_styles.ensureSettingsStyles();
    const existing = document.getElementById(core_constants.SETTINGS_ID);
    if (existing) {
        refreshSettingsMemoryStatus({ lightweight: true });
        if (existing.dataset.rmtHydrated === '1') refreshGenerationSettingsUi();
        return true;
    }
    const mount = document.querySelector('#extensions_settings2');
    if (!mount) return false;
    const panel = document.createElement('div');
    panel.id = core_constants.SETTINGS_ID;
    panel.className = 'inline-drawer';
    panel.innerHTML = `
      <div class="inline-drawer-toggle inline-drawer-header rmt-settings-header">
        <div><b>心跳回忆</b><small> API SETTINGS</small></div>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content rmt-settings-content">
        <div class="rmt-settings-card rmt-api-box">
          <div class="rmt-settings-card-head"><span>API</span><div><b>心跳回忆独立 API</b><small>请选择一种配置方式</small></div></div>
          <div class="rmt-api-source-grid" role="group" aria-label="独立 API 配置方式">
            <button type="button" class="menu_button rmt-api-source-card" data-rmt-api-import-current aria-pressed="false"><span class="rmt-api-source-badge">要求</span><b>1.1.18 一键配置</b><small>读取酒馆当前连接</small></button>
            <button type="button" class="menu_button rmt-api-source-card" data-rmt-api-select-manual aria-pressed="false"><span class="rmt-api-source-badge">OPENAI</span><b>手动配置</b><small>URL · Key · 模型</small></button>
          </div>
          <div class="rmt-api-status" data-rmt-api-status role="status">○ 一键连接未配置</div>
          <div class="rmt-api-source-panel" data-rmt-api-profile-panel>
            <label class="rmt-settings-field"><span>连接配置</span><select class="text_pole" data-rmt-api-profile><option value="">选择 Connection Manager 配置</option></select></label>
            <div class="rmt-model-row">
              <label class="rmt-settings-field"><span>模型</span><select class="text_pole" data-rmt-api-model><option value="">请先选择专用连接</option></select></label>
              <button type="button" class="menu_button rmt-model-refresh" data-rmt-api-model-refresh>刷新模型</button>
            </div>
          </div>
          <div class="rmt-api-source-panel" data-rmt-api-manual-panel hidden>
            <label class="rmt-settings-field"><span>API 地址</span><input class="text_pole" data-rmt-manual-api-base type="url" inputmode="url" placeholder="https://api.example.com/v1"></label>
            <label class="rmt-settings-field"><span>API Key</span><div class="rmt-manual-key-row"><input class="text_pole" data-rmt-manual-api-key type="password" autocomplete="new-password" placeholder="API Key（可留空）"><button type="button" class="menu_button" data-rmt-manual-api-key-clear>清除 Key</button></div></label>
            <div class="rmt-model-row">
              <label class="rmt-settings-field"><span>模型 ID</span><input class="text_pole" data-rmt-manual-api-model list="heartbeat_memories_manual_models" type="text" placeholder="例如 gpt-4.1"><datalist id="heartbeat_memories_manual_models" data-rmt-manual-api-models></datalist></label>
              <button type="button" class="menu_button rmt-model-refresh" data-rmt-manual-api-model-refresh>拉取模型</button>
            </div>
            <button type="button" class="menu_button rmt-settings-wide rmt-manual-save" data-rmt-manual-api-save>保存并使用</button>
          </div>
          <div class="rmt-api-grid">
            <label class="rmt-settings-field"><span>最大输出</span><input class="text_pole" data-rmt-api-max-tokens type="number" min="1024" max="60000" step="1"></label>
            <label class="rmt-settings-field"><span>温度</span><input class="text_pole" data-rmt-api-temperature type="number" min="0" max="2" step="0.1"></label>
          </div>
          <label class="rmt-settings-field"><span>生成禁用词</span><input class="text_pole" data-rmt-banned-generated-phrases type="text" placeholder="用逗号分隔，例如：老子"></label>
          <label class="checkbox_label rmt-settings-check"><input data-rmt-room-life-auto type="checkbox"> 每天首次打开房间时允许一次“今日生活”自动请求</label>
          <label class="checkbox_label rmt-settings-check"><input data-rmt-image-generation-manual type="checkbox"> 手动确认 SillyTavern Image Generation 已启用（自动检测失败时使用 /sd 兜底）</label>
          <label class="checkbox_label rmt-settings-check"><input data-rmt-tt-display type="checkbox"> TT 显示模式（勾选＝r32 顶部安全区；不勾选＝全屏）</label>
        </div>
        <div class="rmt-settings-archive-actions">
          <button type="button" class="menu_button rmt-open-archive-room" data-rmt-settings-current-archive><i class="fa-solid fa-file-circle-plus"></i><span>生成当前窗口档案</span></button>
          <button type="button" class="menu_button rmt-open-archive-room" data-rmt-settings-open-archive><i class="fa-solid fa-box-archive"></i><span>打开档案室</span></button>
          <button type="button" class="menu_button rmt-open-archive-room" data-rmt-performance-diagnostic aria-expanded="false" aria-controls="heartbeat_memories_performance_diagnostic"><i class="fa-solid fa-gauge-high"></i><span data-rmt-diagnostic-label>性能诊断（不解压缓存）</span></button>
          <div class="rmt-performance-diagnostic-panel" id="heartbeat_memories_performance_diagnostic" data-rmt-diagnostic-panel hidden>
            <div class="rmt-performance-diagnostic-head"><b>诊断结果</b><button type="button" class="menu_button rmt-performance-diagnostic-close" data-rmt-performance-diagnostic-close>关闭诊断</button></div>
            <pre class="rmt-performance-diagnostic-output" data-rmt-performance-diagnostic-output></pre>
          </div>
          <div class="rmt-api-note">当前聊天窗口一份独立档案。普通更新只追加上次归档后的新内容并保留已生成 ADV EVENT / 房间 / ENDING；需要从头重整时请进入档案后明确选择“完全重建档案”。性能诊断只读取缓存 manifest/字符串长度，不会解压缓存或遍历聊天正文。</div>
        </div>
      </div>`;
    mount.appendChild(panel);
    panel.addEventListener('change', event => {
        const target = event.target;
        if (target.matches?.('[data-rmt-api-profile]')) {
            panel.dataset.rmtApiEditor = 'profile';
            const connectionProfileId = core_text.normalizeText(target.value, 160);
            core_settings.updatePluginSettings({ apiConnectionMode: 'profile', connectionProfileId, modelOverride: '' });
            refreshGenerationSettingsUi();
            void refreshModelOptions({ fetchRemote: !!connectionProfileId });
            return;
        }
        if (target.matches?.('[data-rmt-api-model]')) {
            panel.dataset.rmtApiEditor = 'profile';
            core_settings.updatePluginSettings({ apiConnectionMode: 'profile', modelOverride: core_text.normalizeText(target.value, 240) });
            refreshGenerationSettingsUi();
            return;
        }
        if (target.matches?.('[data-rmt-api-max-tokens]')) {
            core_settings.updatePluginSettings({ maxTokens: Math.max(1024, Math.min(core_constants.MAX_GENERATION_OUTPUT_TOKENS, Number(target.value) || core_constants.DEFAULT_SETTINGS.maxTokens)) });
            refreshGenerationSettingsUi();
            return;
        }
        if (target.matches?.('[data-rmt-api-temperature]')) {
            core_settings.updatePluginSettings({ temperature: Math.max(0, Math.min(2, Number.isFinite(Number(target.value)) ? Number(target.value) : core_constants.DEFAULT_SETTINGS.temperature)) });
            refreshGenerationSettingsUi();
            return;
        }
        if (target.matches?.('[data-rmt-room-life-auto]')) {
            core_settings.updatePluginSettings({ roomLifeAutoDaily: !!target.checked });
            refreshGenerationSettingsUi();
            return;
        }
        if (target.matches?.('[data-rmt-image-generation-manual]')) {
            core_settings.updatePluginSettings({ imageGenerationManualEnabled: !!target.checked });
            refreshGenerationSettingsUi();
            if (runtimeState.activeMode && runtimeState.activeSession) ui_overlay.renderActive();
            return;
        }
        if (target.matches?.('[data-rmt-tt-display]')) {
            core_settings.updatePluginSettings({ ttDisplayMode: !!target.checked });
            const overlay = document.getElementById(core_constants.OVERLAY_ID);
            if (overlay) ui_overlay.applyArchiveMobileSafeArea(overlay);
            refreshGenerationSettingsUi();
            return;
        }
        if (target.matches?.('[data-rmt-banned-generated-phrases]')) {
            core_settings.updatePluginSettings({ bannedGeneratedPhrases: core_settings.normalizeBannedGeneratedPhrases(target.value) });
            refreshGenerationSettingsUi();
        }
    });
    panel.addEventListener('input', event => {
        if (event.target.matches?.('[data-rmt-manual-api-base],[data-rmt-manual-api-key],[data-rmt-manual-api-model]')) {
            panel.dataset.rmtManualDirty = '1';
        }
    });
    panel.addEventListener('click', event => {
        if (event.target.closest?.('.rmt-settings-header')) hydrateSettingsPanel();
        const manualChoiceButton = event.target.closest?.('[data-rmt-api-select-manual]');
        if (manualChoiceButton) {
            core_settings.beginApiConfigurationOperation();
            panel.dataset.rmtApiEditor = 'manual';
            refreshGenerationSettingsUi();
            return;
        }
        const manualClearButton = event.target.closest?.('[data-rmt-manual-api-key-clear]');
        if (manualClearButton) {
            const keyInput = panel.querySelector('[data-rmt-manual-api-key]');
            if (keyInput) keyInput.value = '';
            core_settings.updatePluginSettings({ manualApiKey: '' });
            if (keyInput) keyInput.placeholder = 'API Key（可留空）';
            refreshGenerationSettingsUi();
            globalThis.toastr?.success?.('手动 API Key 已清除。', '心跳回忆');
            return;
        }
        const manualSaveButton = event.target.closest?.('[data-rmt-manual-api-save]');
        if (manualSaveButton) {
            try {
                const candidate = manualSettingsFromPanel(panel);
                const manualApiBaseUrl = core_independentApi.assertManualApiCredentialTransport(candidate.manualApiBaseUrl, candidate.manualApiKey);
                const manualApiModel = core_text.normalizeText(candidate.manualApiModel, 240);
                if (!manualApiModel) throw new Error('请填写手动 API 的模型 ID。');
                core_settings.updatePluginSettings({
                    apiConnectionMode: 'manual',
                    manualApiBaseUrl,
                    manualApiKey: candidate.manualApiKey,
                    manualApiModel,
                });
                panel.dataset.rmtApiEditor = 'manual';
                panel.dataset.rmtManualDirty = '0';
                const keyInput = panel.querySelector('[data-rmt-manual-api-key]');
                if (keyInput) keyInput.value = '';
                refreshGenerationSettingsUi();
                globalThis.toastr?.success?.('手动 API 已保存并启用。', '心跳回忆');
            } catch (error) {
                globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆');
            }
            return;
        }
        const manualRefreshButton = event.target.closest?.('[data-rmt-manual-api-model-refresh]');
        if (manualRefreshButton) {
            refreshManualModelOptions({ fetchRemote: true })
                .then(models => {
                    if (models?.length) globalThis.toastr?.success?.(`已找到 ${models.length} 个模型。`, '心跳回忆');
                })
                .catch(error => globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆'));
            return;
        }
        const modelRefreshButton = event.target.closest?.('[data-rmt-api-model-refresh]');
        if (modelRefreshButton) {
            refreshModelOptions({ fetchRemote: true })
                .then(result => {
                    if (!result) return;
                    if (result.fallbackOnly) globalThis.toastr?.warning?.('远程列表暂不可用，已显示这一连接保存的模型。', '心跳回忆');
                    else globalThis.toastr?.success?.('模型列表已更新。', '心跳回忆');
                })
                .catch(error => globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆'));
            return;
        }
        const apiImportButton = event.target.closest?.('[data-rmt-api-import-current]');
        if (apiImportButton) {
            panel.dataset.rmtApiEditor = 'profile';
            const operationEpoch = core_settings.beginApiConfigurationOperation();
            const uiRequestEpoch = Number(panel.dataset.rmtOneClickRequest || 0) + 1;
            panel.dataset.rmtOneClickRequest = String(uiRequestEpoch);
            const isLatestUiRequest = () => Number(panel.dataset.rmtOneClickRequest || 0) === uiRequestEpoch;
            apiImportButton.disabled = true;
            core_settings.importCurrentSillyTavernConnection({
                isCurrent: () => core_settings.isCurrentApiConfigurationOperation(operationEpoch),
            }).then(result => {
                if (!isLatestUiRequest()) return;
                refreshGenerationSettingsUi();
                const current = core_settings.getPluginSettings();
                if (current.apiConnectionMode !== 'profile' || current.connectionProfileId !== core_text.normalizeText(result?.id, 160)) return;
                globalThis.toastr?.success?.(result?.created ? '一键连接已创建并启用。' : '一键连接已启用。', '心跳回忆');
                void refreshModelOptions({ fetchRemote: true });
            }).catch(error => {
                if (!isLatestUiRequest()) return;
                if (error?.code !== 'RMT_API_CONFIGURATION_SUPERSEDED') {
                    console.warn(`[HeartbeatMemories] one-click configuration failed (${core_text.normalizeText(error?.code, 80) || 'unavailable'})`);
                    globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆');
                }
                refreshGenerationSettingsUi();
            }).finally(() => {
                if (isLatestUiRequest()) apiImportButton.disabled = false;
            });
            return;
        }
        const diagnosticCloseButton = event.target.closest?.('[data-rmt-performance-diagnostic-close]');
        if (diagnosticCloseButton) {
            const output = panel.querySelector('[data-rmt-performance-diagnostic-output]');
            const trigger = panel.querySelector('[data-rmt-performance-diagnostic]');
            const hide = globalThis.__heartbeatMemoriesHidePerformanceDiagnostic;
            if (typeof hide === 'function') hide(output, trigger);
            else {
                const diagnosticPanel = output?.closest?.('[data-rmt-diagnostic-panel]') || output;
                if (diagnosticPanel) diagnosticPanel.hidden = true;
                trigger?.setAttribute?.('aria-expanded', 'false');
                const label = trigger?.querySelector?.('[data-rmt-diagnostic-label]');
                if (label) label.textContent = '性能诊断（不解压缓存）';
            }
            return;
        }
        const diagnosticButton = event.target.closest?.('[data-rmt-performance-diagnostic]');
        if (diagnosticButton) {
            const output = panel.querySelector('[data-rmt-performance-diagnostic-output]');
            const toggle = globalThis.__heartbeatMemoriesTogglePerformanceDiagnostic;
            if (typeof toggle === 'function') toggle(output, diagnosticButton);
            else if (output) {
                const diagnosticPanel = output.closest?.('[data-rmt-diagnostic-panel]') || output;
                const expanded = !diagnosticPanel.hidden;
                diagnosticPanel.hidden = expanded;
                diagnosticButton.setAttribute?.('aria-expanded', expanded ? 'false' : 'true');
                const label = diagnosticButton.querySelector?.('[data-rmt-diagnostic-label]');
                if (label) label.textContent = expanded ? '性能诊断（不解压缓存）' : '关闭性能诊断';
                if (!expanded) output.textContent = '性能诊断器尚未就绪。';
            }
            return;
        }
        const currentArchiveButton = event.target.closest?.('[data-rmt-settings-current-archive]');
        if (currentArchiveButton) {
            ui_overlay.requestCurrentArchiveImport();
            return;
        }
        const openArchiveButton = event.target.closest?.('[data-rmt-settings-open-archive]');
        if (openArchiveButton) {
            ui_archivePortal.safeShowArchiveLibrary('settings-click');
            return;
        }
    });
    panel.addEventListener('focusin', event => {
        if (panel.dataset.rmtHydrated !== '1' && event.target.matches?.('input,select,button,textarea')) hydrateSettingsPanel();
    });
    refreshSettingsMemoryStatus({ lightweight: true });
    return true;
}
