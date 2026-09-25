import * as archive_repository from '../archive/repository.js';
import * as archive_coverage from '../archive/coverageRanges.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_independentApi from '../core/independentApi.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as core_theme from '../core/theme.js';
import * as core_autoUpdatePolicy from '../core/autoUpdatePolicy.js';
import * as core_autoUpdates from '../core/autoUpdates.js';
// 设置页组件：启动入口、生图 / 语音 / 读取范围设置、模型列表、任务与记忆状态刷新
// 从 ui/settingsPanel.js 原样搬出（重构阶段 2），声明文本一字未改；ui/settingsPanel.js 仍转发原有导出。

let imageProviderEventCleanup = null;

export const SETTINGS_LAUNCHER_ID = core_constants.SETTINGS_ID + '_launcher';

export function refreshImageGenerationSettingsUi() {
    const panel = document.getElementById(core_constants.SETTINGS_ID);
    if (!panel) return;
    const settings = core_settings.getPluginSettings();
    const choice = panel.querySelector('[data-rmt-image-generation-provider]');
    if (choice) choice.value = settings.imageGenerationProvider;
    const statusNode = panel.querySelector('[data-rmt-image-generation-status]');
    const status = generation_imageGeneration.imageGenerationUiState();
    if (statusNode) statusNode.textContent = status.available ? '柏宝绘已连接 · 公开 API v1' : status.reason || '请单独安装、启用并配置柏宝绘公开 API v1。';
}

export function voiceSettingsHtml() {
    return `<details class="rmt-settings-card" data-rmt-settings-section="voice">
      <summary class="rmt-settings-card-head"><span>VOICE</span><div><b>镜译 · 语音设置</b><small>连接与朗读音色</small></div></summary>
      <div class="rmt-settings-section-body"><p>在镜译中配置语音服务后，可从各内容页的更多菜单朗读正文或选中文字。</p><div data-rmt-voice-settings></div></div>
    </details>`;
}

export function chatReadingSettingsHtml(settings = core_settings.getPluginSettings()) {
    const range = settings.chatReadRange || { mode: 'recent', recent: 50, start: 1, end: 100, includeHidden: false };
    return `<details class="rmt-settings-card" data-rmt-settings-section="reading">
      <summary class="rmt-settings-card-head"><span>READ</span><div><b>聊天读取范围</b><small>按原始楼号选择 · 不改旧档案</small></div></summary>
      <div class="rmt-settings-section-body">
        <label class="rmt-settings-field"><span>读取方式</span><select class="text_pole" data-rmt-read-mode><option value="recent" ${range.mode === 'recent' ? 'selected' : ''}>最近若干楼</option><option value="range" ${range.mode === 'range' ? 'selected' : ''}>指定楼号范围</option><option value="all" ${range.mode === 'all' ? 'selected' : ''}>当前聊天全部楼层</option></select></label>
        <label class="rmt-settings-field" data-rmt-read-recent-row ${range.mode === 'recent' ? '' : 'hidden'}><span>最近多少楼</span><input class="text_pole" type="number" min="1" step="1" data-rmt-read-recent value="${core_text.esc(range.recent)}"></label>
        <div class="rmt-api-grid" data-rmt-read-range-row ${range.mode === 'range' ? '' : 'hidden'}><label class="rmt-settings-field"><span>从第几楼</span><input class="text_pole" type="number" min="1" step="1" data-rmt-read-start value="${core_text.esc(range.start)}"></label><label class="rmt-settings-field"><span>到第几楼</span><input class="text_pole" type="number" min="1" step="1" data-rmt-read-end value="${core_text.esc(range.end)}"></label></div>
        <label class="rmt-settings-check"><input type="checkbox" data-rmt-read-hidden ${range.includeHidden ? 'checked' : ''}><span>包含范围内被隐藏的普通聊天楼层</span></label>
        <p>每条消息为一楼，从 1 开始，隐藏楼层仍保留原楼号。只限制聊天正文；世界书与外部记忆摘要仍按“记忆来源”单独读取。不删除已有记忆。</p>
        <button type="button" class="menu_button rmt-settings-wide" data-rmt-read-preview>预览当前读取量（不生成）</button>
        <div data-rmt-read-preview-status role="status" aria-live="polite">默认只读最近 50 楼；可主动选择全部。</div>
        <div data-rmt-coverage-map class="rmt-coverage-map"></div>
        <p data-rmt-coverage-status role="status"></p>
      </div></details>`;
}

export function refreshReadingSettingsUi(panel) {
    const range = core_settings.getPluginSettings().chatReadRange || { mode: 'recent', recent: 50, start: 1, end: 100, includeHidden: false };
    for (const field of ['mode', 'recent', 'start', 'end']) {
        const input = panel.querySelector('[data-rmt-read-' + field + ']');
        if (input) input.value = range[field];
    }
    const hidden = panel.querySelector('[data-rmt-read-hidden]');
    if (hidden) hidden.checked = range.includeHidden === true;
    const recentRow = panel.querySelector('[data-rmt-read-recent-row]');
    const rangeRow = panel.querySelector('[data-rmt-read-range-row]');
    if (recentRow) recentRow.hidden = range.mode !== 'recent';
    if (rangeRow) rangeRow.hidden = range.mode !== 'range';
    paintCoverageMap(panel);
}

export function paintCoverageMap(panel) {
    const host = panel.querySelector('[data-rmt-coverage-map]');
    const status = panel.querySelector('[data-rmt-coverage-status]');
    if (!host || !status) return;
    let bank = null;
    try { bank = archive_repository.getImportedMemory(core_context.currentCharacterGuard()); } catch { bank = null; }
    const chat = core_context.getContext()?.chat;
    const total = Array.isArray(chat) ? chat.length : Math.max(0, Number(bank?.sourceMessageCount) || 0);
    if (!bank || !total) {
        host.replaceChildren();
        status.textContent = bank ? '' : '当前聊天还没有档案。建档之后，这里会标出已有记忆、只有摘要和还没整理的楼层。';
        return;
    }
    const runs = archive_coverage.buildFloorCoverage({
        totalFloors: total,
        memories: [...(bank.memories || []), ...(bank.coldArchive || [])],
        summaryFloors: archive_coverage.summaryFloorsFromChat(chat),
        coveredRanges: archive_coverage.bankCoveredRanges(bank),
    });
    const gaps = archive_coverage.coverageGapSlices(runs).slice(0, 12);
    const counts = runs.reduce((sum, row) => {
        sum[row.kind] = (sum[row.kind] || 0) + (row.end - row.start + 1);
        return sum;
    }, {});
    host.innerHTML = gaps.map(gap => `<button type="button" class="rmt-btn" data-rmt-coverage-gap="${gap.start}-${gap.end}">只整理第 ${gap.start}–${gap.end} 楼${gap.kind === 'summary' ? '（目前只有摘要）' : ''}${gap.fullEnd > gap.end ? '，这一段先取前 100 楼' : ''}</button>`).join('');
    const more = archive_coverage.coverageGapSlices(runs).length - gaps.length;
    status.textContent = `已有记忆 ${counts.memory || 0} 楼，只有摘要 ${counts.summary || 0} 楼，已扫过但没有单独记忆 ${counts.scanned || 0} 楼，还没整理 ${counts.open || 0} 楼。点上面的缺口只会把读取范围改成那一段，不会马上生成。${more > 0 ? `还有 ${more} 段缺口，整理完这一段后再看。` : ''}`;
}

export function bindImageProviderEvents() {
    if (imageProviderEventCleanup || typeof globalThis.addEventListener !== 'function') return;
    const changed = () => {
        refreshImageGenerationSettingsUi();
        generation_imageGeneration.refreshCgImageProviderBars();
    };
    globalThis.addEventListener('st-baibai-image:ready', changed);
    globalThis.addEventListener('st-baibai-image:changed', changed);
    imageProviderEventCleanup = () => {
        globalThis.removeEventListener('st-baibai-image:ready', changed);
        globalThis.removeEventListener('st-baibai-image:changed', changed);
        imageProviderEventCleanup = null;
    };
}

export function unbindImageProviderEvents() { imageProviderEventCleanup?.(); }

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
    let profile;
    try { profile = profileId ? core_settings.rawConnectionProfile(profileId) : null; } catch { profile = null; }
    profileStateFingerprint = profile ? core_settings.profileFingerprint(profile) : 'missing';
    try { profileCacheKey = profileId ? await core_settings.resolvedProfileModelCacheKey(profileId) : ''; } catch {}
    const isCurrent = () => Number(panel.dataset.rmtProfileModelRequest || 0) === requestEpoch
        && runtimeState.apiConfigurationEpoch === configurationEpoch
        && core_settings.getPluginSettings().connectionProfileId === profileId
        && (() => {
            try {
                if (!profileId) return true;
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
        console.warn('[HeartbeatMemories] refresh model options failed', core_text.safeErrorDiagnostic(error));
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
    const base = baseInput ? baseInput.value : current.manualApiBaseUrl;
    let sameBase = false;
    try { sameBase = core_independentApi.normalizeManualApiBaseUrl(base) === current.manualApiBaseUrl; } catch {}
    return {
        ...current,
        apiConnectionMode: 'manual',
        manualApiBaseUrl: base,
        manualApiKey: core_text.normalizeText(keyInput?.value, 4000) || (sameBase ? current.manualApiKey : ''),
        manualApiSecretRef: sameBase ? current.manualApiSecretRef : '',
        manualApiModel: modelInput ? modelInput.value : current.manualApiModel,
    };
}

export const manualAutosaves = new WeakMap();

export async function saveManualPanel(panel, activate = false) {
    clearTimeout(manualAutosaves.get(panel)); manualAutosaves.delete(panel);
    const status = panel.querySelector('[data-rmt-manual-save-status]');
    const candidate = manualSettingsFromPanel(panel);
    const keyInput = panel.querySelector('[data-rmt-manual-api-key]');
    const typedKey = keyInput?.value || '';
    if (status) status.textContent = '正在保存…';
    try {
        const result = await core_settings.saveManualApiConfiguration(candidate, { activate });
        if (keyInput?.value === typedKey) keyInput.value = '';
        if (keyInput) keyInput.placeholder = result.credentialSaved ? '已加密保存到本机；填写可替换' : 'API Key（可留空）';
        if (status) status.textContent = result.credentialSaved ? '连接信息与 Key 已保存到本机；刷新后可用。' : '连接信息已保存；未填写 Key。';
        if (activate) { panel.dataset.rmtApiEditor = 'manual'; panel.dataset.rmtManualDirty = '0'; refreshGenerationSettingsUi(); }
        return result;
    } catch (error) {
        if (status) status.textContent = error?.name === 'AbortError' ? '配置已再次编辑，旧保存已停止。' : core_text.safeErrorSummary(error);
        if (activate) globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊 · 未保存');
        return null;
    }
}

export function bindManualAutosave(panel) {
    const schedule = event => {
        if (!event.target.matches?.('[data-rmt-manual-api-base],[data-rmt-manual-api-key],[data-rmt-manual-api-model]')) return;
        clearTimeout(manualAutosaves.get(panel));
        manualAutosaves.set(panel, setTimeout(() => { void saveManualPanel(panel); }, event.type === 'change' ? 0 : 500));
    };
    panel.addEventListener('input', schedule); panel.addEventListener('change', schedule);
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
    panel.dataset.rmtManualModelFallback = '0';
    try {
        if (fetchRemote) models = await core_settings.fetchModelsForManualConnection(candidate, { force: true });
    } catch (error) {
        if (!isCurrent() || error?.code === 'RMT_API_MODEL_REQUEST_SUPERSEDED' || error?.name === 'AbortError') return null;
        const savedModel = core_text.normalizeText(candidate.manualApiModel, 240);
        models = [...new Set([...(models || []), savedModel].filter(Boolean))];
        if (!models.length) {
            if (button) { button.disabled = false; button.textContent = '拉取模型'; }
            throw error;
        }
        panel.dataset.rmtManualModelFallback = '1';
    }
    if (!isCurrent()) return null;
    const uniqueModels = [...new Set(models)].filter(Boolean);
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = uniqueModels.length ? `选择已拉取模型（${uniqueModels.length}）` : '没有可用模型';
    list.replaceChildren(placeholder);
    for (const model of uniqueModels) {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        list.appendChild(option);
    }
    list.hidden = uniqueModels.length === 0;
    list.value = uniqueModels.includes(input.value) ? input.value : '';
    if (!input.value && uniqueModels[0]) {
        input.value = uniqueModels[0];
        list.value = uniqueModels[0];
        panel.dataset.rmtManualDirty = '1';
    }
    if (button) {
        button.disabled = false;
        button.textContent = '拉取模型';
    }
    return models;
}

export function refreshThemeUi() {
    const settings = core_settings.getPluginSettings();
    for (const element of document.querySelectorAll('#' + core_constants.SETTINGS_ID + ',#' + core_constants.OVERLAY_ID + ',.rmt-avatar-dialog-pop')) core_theme.applyThemeToElement(element, settings);
    const panel = document.getElementById(core_constants.SETTINGS_ID);
    const custom = panel?.querySelector('[data-rmt-theme-custom-panel]');
    if (custom) custom.hidden = settings.themeMode !== 'custom';
    const opacity = panel?.querySelector('[data-rmt-theme-opacity]');
    if (opacity) opacity.textContent = Math.round(settings.themeAlpha * 100) + '%';
}

export function refreshGenerationSettingsUi() {
    const panel = document.getElementById(core_constants.SETTINGS_ID);
    if (!panel) return;
    const settings = core_settings.getPluginSettings();
    refreshThemeUi();
    const connectionMode = settings.apiConnectionMode === 'manual' ? 'manual' : 'profile';
    const editorMode = panel.dataset.rmtApiEditor === 'manual' || panel.dataset.rmtApiEditor === 'profile'
        ? panel.dataset.rmtApiEditor
        : connectionMode;
    panel.dataset.rmtApiEditor = editorMode;
    const profile = panel.querySelector('[data-rmt-api-profile]');
    const oneClick = panel.querySelector('[data-rmt-api-import-current]');
    const capability = panel.querySelector('[data-rmt-api-host-capability]');
    if (capability) capability.textContent = core_settings.oneClickConnectionCapability().message;
    const manualChoice = panel.querySelector('[data-rmt-api-select-manual]');
    const profilePanel = panel.querySelector('[data-rmt-api-profile-panel]');
    const manualPanel = panel.querySelector('[data-rmt-api-manual-panel]');
    const manualBase = panel.querySelector('[data-rmt-manual-api-base]');
    const manualKey = panel.querySelector('[data-rmt-manual-api-key]');
    const manualModel = panel.querySelector('[data-rmt-manual-api-model]');
    const maxTokens = panel.querySelector('[data-rmt-api-max-tokens]');
    const inputBudget = panel.querySelector('[data-rmt-api-input-budget]');
    const temperature = panel.querySelector('[data-rmt-api-temperature]');
    const roomDaily = panel.querySelector('[data-rmt-room-life-auto]');
    const manualStreaming = panel.querySelector('[data-rmt-manual-streaming]');
    const ttDisplay = panel.querySelector('[data-rmt-tt-display]');
    const themeMode = panel.querySelector('[data-rmt-theme-mode]');
    const themeAlpha = panel.querySelector('[data-rmt-theme-alpha]');
    const themeCustomPanel = panel.querySelector('[data-rmt-theme-custom-panel]');
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
    const poolEnabled = panel.querySelector('[data-rmt-api-pool-enabled]');
    if (poolEnabled) poolEnabled.checked = settings.connectionPoolEnabled === true;
    const poolChoices = panel.querySelector('[data-rmt-api-pool-choices]');
    if (poolChoices) poolChoices.innerHTML = core_settings.supportedConnectionProfiles().map(item => `<label class="rmt-settings-check"><input type="checkbox" data-rmt-api-pool-profile="${core_text.esc(item.id)}" ${(settings.connectionPoolIds || []).includes(item.id) ? 'checked' : ''}><span>${core_text.esc(item.name)}${item.model ? ` · ${core_text.esc(item.model)}` : ''}</span></label>`).join('') || '<p>先在 Connection Manager 中保存可用连接。</p>';
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
        manualKey.placeholder = settings.manualApiSecretRef ? '已加密保存到本机；填写可替换' : settings.manualApiKey ? '本页已有 Key；尚未确认持久保存' : 'API Key（可留空）';
    }
    if (maxTokens) maxTokens.value = String(settings.maxTokens);
    if (inputBudget) inputBudget.value = String(settings.inputBudgetTokens);
    if (temperature) {
        temperature.value = String(settings.temperature);
        temperature.disabled = false;
        temperature.title = '心迹回廊所有生成都使用这个温度';
        const temperatureNote = panel.querySelector('[data-rmt-temperature-note]');
        if (temperatureNote) temperatureNote.textContent = '写正文、对白和剧情时使用这里的温度。整理档案、判断关系、逐字核对证据的步骤会自动用更低的温度，以免抄错原文；你调得更低时，这些步骤也会跟着更低。';
    }
    if (roomDaily) roomDaily.checked = settings.roomLifeAutoDaily;
    if (manualStreaming) manualStreaming.checked = settings.manualApiStreaming === true;
    const externalSource = panel.querySelector('[data-rmt-source-external]');
    const worldInfoSource = panel.querySelector('[data-rmt-source-world-info]');
    if (externalSource) externalSource.checked = settings.useCurrentChatExternalMemory !== false;
    if (worldInfoSource) worldInfoSource.checked = settings.useActivatedWorldInfo !== false;
    refreshImageGenerationSettingsUi();
    if (ttDisplay) ttDisplay.checked = settings.ttDisplayMode;
    const floatingAvatar = panel.querySelector('[data-rmt-floating-avatar]');
    if (floatingAvatar) floatingAvatar.value = settings.floatingAvatar;
    if (themeMode) themeMode.value = settings.themeMode;
    const autoRules = core_autoUpdatePolicy.normalizeAutoUpdates(settings.autoUpdates);
    for (const input of panel.querySelectorAll('[data-rmt-auto-enabled]')) input.checked = autoRules[input.dataset.rmtAutoEnabled]?.enabled === true;
    for (const input of panel.querySelectorAll('[data-rmt-auto-every]')) input.value = String(autoRules[input.dataset.rmtAutoEvery]?.every || 20);
    const autoWarning = panel.querySelector('[data-rmt-auto-warning]');
    if (autoWarning) autoWarning.textContent = core_autoUpdates.autoUpdateAvailability();
    core_autoUpdates.refreshAutoUpdateStatus();
    if (themeAlpha) themeAlpha.value = String(settings.themeAlpha);
    if (themeCustomPanel) themeCustomPanel.hidden = settings.themeMode !== 'custom';
    for (const input of panel.querySelectorAll('[data-rmt-theme-color]')) {
        const key = input.dataset.rmtThemeColor;
        if (key && settings.themeCustom?.[key]) input.value = settings.themeCustom[key];
    }
    if (bannedPhrases) bannedPhrases.value = settings.bannedGeneratedPhrases.join('，');
    if (status) {
        const profileConfigured = settings.connectionPoolEnabled === true
            ? (settings.connectionPoolIds || []).some(id => core_settings.supportedConnectionProfiles().some(profile => profile.id === id))
            : !!settings.connectionProfileId;
        let profileCapabilityReady = false;
        let manualConfigurationReady = false;
        if (connectionMode === 'profile' && profileConfigured) {
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
            : profileConfigured && profileCapabilityReady;
        status.classList.toggle('is-ready', ready);
        status.textContent = `${ready ? '●' : '○'} ${ready
            ? core_settings.generationSourceLabel(settings)
            : connectionMode === 'manual' ? '手动配置未完成'
            : profileConfigured ? '需凭证绑定能力，可改用手动配置' : '一键连接未配置'}`;
    }
    void refreshModelOptions();
    void refreshManualModelOptions();
}

export function refreshSettingsTaskStatus() {
    const panel = document.getElementById(core_constants.SETTINGS_ID);
    if (!panel) return;
    const openButton = panel.querySelector('[data-rmt-settings-open-archive]');
    const taskRows = new Map();
    for (const [key, task] of runtimeState.activeGenerationTasks.entries()) {
        const logicalKey = core_text.normalizeText(task?.parentTaskKey, 240)
            || core_requestCoordinator.activeModeBuildScopeForTask(key)
            || key;
        taskRows.set(logicalKey, task);
    }
    for (const [key, reservation] of runtimeState.activeArchiveTargetReservations.entries()) {
        if (!taskRows.has(key)) taskRows.set(key, { ...reservation, origin: { archiveTargetEntryId: reservation.entryId } });
    }
    const taskCount = taskRows.size;
    const targetTasks = [...taskRows.values()].filter(task => core_text.normalizeText(task?.origin?.archiveTargetEntryId || task?.entryId, 120));
    const targetTaskLabel = core_text.normalizeText(targetTasks[0]?.label, 220);
    if (openButton) {
        openButton.disabled = false;
        openButton.textContent = runtimeState.busy
            ? '打开档案室 · 档案整理中'
            : targetTaskLabel
                ? `${targetTaskLabel}${targetTasks.length > 1 ? ` · 另有${targetTasks.length - 1}项` : ''}`
                : taskCount ? `打开档案室 · ${taskCount}项生成中` : '打开档案室';
        openButton.title = targetTaskLabel ? targetTasks.map(task => core_text.normalizeText(task?.label, 300)).filter(Boolean).join('\n') : '';
    }
}

export function refreshSettingsMemoryStatus({ lightweight = false } = {}) {
    const panel = document.getElementById(core_constants.SETTINGS_ID);
    if (!panel) return;
    refreshSettingsTaskStatus();
    const worldInfoPicker = panel.querySelector('[data-rmt-action="memory-worldinfo-picker"]');
    if (worldInfoPicker) worldInfoPicker.disabled = runtimeState.busy || core_requestCoordinator.hasGenerationTasks();
    const archiveButton = panel.querySelector('[data-rmt-settings-current-archive]');
    if (archiveButton) {
        let ready = false;
        let actionable = false;
        let mismatch = null;
        try {
            const context = core_context.currentCharacterGuard();
            actionable = !!core_context.getChatId(context);
            ready = lightweight
                ? !!archive_repository.getImportedMemory(context)
                : archive_repository.getMemoryState(context).status === 'ready';
            // An archive whose only problem is a different chat id used to dead-end here:
            // unreadable, and blocking a new one. Surface the way out on this very button.
            if (!ready) mismatch = archive_repository.mismatchedArchiveInfo(context);
        } catch {}
        archiveButton.disabled = runtimeState.busy || core_requestCoordinator.hasGenerationTasks() || !actionable;
        archiveButton.dataset.rmtArchiveClaim = mismatch ? '1' : '';
        const archiveLabelNode = archiveButton.querySelector('span') || archiveButton;
        archiveLabelNode.textContent = !actionable
            ? '当前窗口档案不可用'
            : runtimeState.busy ? '当前窗口档案整理中…'
            : mismatch ? `认领这份档案（${mismatch.memoryCount} 条记忆）`
            : ready ? '增量更新当前窗口档案' : '生成当前窗口档案';
        archiveButton.title = mismatch
            ? '这个聊天里存着一份档案，但它记录的聊天标识与当前不同（重命名、分支或复制聊天后会这样）。认领只改变绑定，不改动任何记忆内容。'
            : '';
    }
}
