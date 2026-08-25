// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_repository from '../archive/repository.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
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
    const settings = core_settings.getPluginSettings();
    const profileId = core_text.normalizeText(settings.connectionProfileId, 160);
    select.replaceChildren();
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    if (!profileId) {
        defaultOption.textContent = '请先选择专用连接';
        select.appendChild(defaultOption);
        select.disabled = true;
        if (refreshButton) refreshButton.disabled = true;
        return;
    }
    let profile;
    try { profile = core_settings.rawConnectionProfile(profileId); } catch { profile = null; }
    const profileModel = core_text.normalizeText(profile?.model, 240);
    defaultOption.textContent = profileModel ? `使用配置默认模型 · ${profileModel}` : '使用配置默认模型';
    select.appendChild(defaultOption);
    select.disabled = false;
    if (refreshButton) {
        refreshButton.disabled = false;
        refreshButton.textContent = fetchRemote ? '正在拉取…' : '刷新模型';
    }
    let models = [];
    try {
        models = fetchRemote
            ? await core_settings.fetchModelsForConnection(profileId, { force: true })
            : (runtimeState.connectionModelCache.get(profileId) || core_settings.savedModelsForProfile(profileId));
    } catch (error) {
        console.warn('[HeartbeatMemories] refresh model options failed', error);
        models = profileModel ? [profileModel] : [];
    }
    const currentSettings = core_settings.getPluginSettings();
    if (currentSettings.connectionProfileId !== profileId) return;
    const override = core_text.normalizeText(currentSettings.modelOverride, 240);
    if (override && !models.includes(override)) models.unshift(override);
    for (const model of [...new Set(models)]) {
        if (!model) continue;
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        select.appendChild(option);
    }
    select.value = override;
    if (refreshButton) refreshButton.textContent = '刷新模型';
}

export function refreshGenerationSettingsUi() {
    const panel = document.getElementById(core_constants.SETTINGS_ID);
    if (!panel) return;
    const settings = core_settings.getPluginSettings();
    const profile = panel.querySelector('[data-rmt-api-profile]');
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
        status.textContent = !settings.connectionProfileId
            ? '尚未选择心跳回忆专用连接。可一键读取酒馆当前已保存的连接；API Key 不会被显示或复制，只引用 SillyTavern 保存的 Secret ID。'
            : `${core_settings.generationSourceLabel(settings)}。心跳回忆固定使用这个连接；模型可在下方单独选择，不会跟着主聊天切换。API Key 仍由 SillyTavern Secrets 管理。`;
    }
    void refreshModelOptions();
}

export function hydrateSettingsPanel() {
    const panel = document.getElementById(core_constants.SETTINGS_ID);
    if (!panel) return false;
    refreshSettingsMemoryStatus({ lightweight: true });
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
          <div class="rmt-settings-card-head"><span>API</span><div><b>心跳回忆专用 API</b><small>只管理连接、模型与请求参数</small></div></div>
          <button type="button" class="menu_button rmt-settings-wide" data-rmt-api-import-current>从酒馆当前连接一键导入</button>
          <label class="rmt-settings-field"><span>连接配置</span><select class="text_pole" data-rmt-api-profile><option value="">选择 Connection Manager 配置</option></select></label>
          <div class="rmt-model-row">
            <label class="rmt-settings-field"><span>模型</span><select class="text_pole" data-rmt-api-model><option value="">请先选择专用连接</option></select></label>
            <button type="button" class="menu_button rmt-model-refresh" data-rmt-api-model-refresh>刷新模型</button>
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
          <div class="rmt-api-note">当前聊天窗口一份独立档案。普通更新只追加上次归档后的新内容并保留已生成 ADV EVENT / 房间 / ENDING；需要从头重整时请进入档案后明确选择“完全重建档案”。</div>
        </div>
      </div>`;
    mount.appendChild(panel);
    panel.addEventListener('change', event => {
        const target = event.target;
        if (target.matches?.('[data-rmt-api-profile]')) {
            const connectionProfileId = core_text.normalizeText(target.value, 160);
            core_settings.updatePluginSettings({ connectionProfileId, modelOverride: '' });
            if (connectionProfileId) runtimeState.connectionModelCache.delete(connectionProfileId);
            refreshGenerationSettingsUi();
            void refreshModelOptions({ fetchRemote: !!connectionProfileId });
            return;
        }
        if (target.matches?.('[data-rmt-api-model]')) {
            core_settings.updatePluginSettings({ modelOverride: core_text.normalizeText(target.value, 240) });
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
    panel.addEventListener('click', event => {
        if (event.target.closest?.('.rmt-settings-header')) hydrateSettingsPanel();
        const modelRefreshButton = event.target.closest?.('[data-rmt-api-model-refresh]');
        if (modelRefreshButton) {
            modelRefreshButton.disabled = true;
            refreshModelOptions({ fetchRemote: true })
                .then(() => globalThis.toastr?.success?.('模型列表已刷新。', '心跳回忆'))
                .catch(error => globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆'))
                .finally(() => { modelRefreshButton.disabled = false; });
            return;
        }
        const apiImportButton = event.target.closest?.('[data-rmt-api-import-current]');
        if (apiImportButton) {
            core_settings.importCurrentSillyTavernConnection().catch(error => {
                console.error('[HeartbeatMemories] import current connection failed', error);
                globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆');
            });
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
        if (event.target.matches?.('input,select,button,textarea')) hydrateSettingsPanel();
    });
    refreshSettingsMemoryStatus({ lightweight: true });
    return true;
}
