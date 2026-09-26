import * as archive_coverage from '../archive/coverageRanges.js';
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as source_guard from '../archive/sourceReadGuard.js';
import * as auto_memory_registry from '../autoMemory/moduleRegistry.js';
import * as auto_memory_plan from '../autoMemory/planStore.js';
import * as auto_memory_redo from '../autoMemory/redo.js';
import * as auto_memory_scheduler from '../autoMemory/scheduler.js';
import * as wizard_plan from '../autoMemory/wizardPlan.js';
import * as core_autoUpdatePolicy from '../core/autoUpdatePolicy.js';
import * as core_autoUpdates from '../core/autoUpdates.js';
import * as core_chatReadRange from '../core/chatReadRange.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_contextTags from '../core/contextTags.js';
import * as output_budget from '../core/outputBudget.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_selfUpdater from '../core/selfUpdater.js';
import * as core_settings from '../core/settings.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as core_theme from '../core/theme.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as advanced_ui from './advancedGenerationUi.js';
import * as auto_memory_wizard from './autoMemoryWizard.js';
import * as cg_format_ui from './cgFormatControl.js';
import * as floating_archive from './floatingArchive.js';
import * as mirrorReader from './mirrorTtsReader.js';
import * as ui_overlay from './overlay.js';
import * as ui_scenePicker from './scenePicker.js';
import * as dispatch_settingsPanelMarkup from './settingsPanelMarkup.js';
import { SETTINGS_LAUNCHER_ID, bindManualAutosave, manualAutosaves, paintCoverageMap, refreshGenerationSettingsUi, refreshImageGenerationSettingsUi, refreshManualModelOptions, refreshModelOptions, refreshReadingSettingsUi, refreshSettingsMemoryStatus, refreshThemeUi, saveManualPanel } from './settingsPanelParts.js';
import * as ui_styles from './styles.js';

// mountSettings 的连续语句分组放在 ui/settingsPanelHome.js；分组函数返回它表示“没处理”，接着往下走。
export const SETTINGS_BIND_UNHANDLED = Symbol('SETTINGS_BIND_UNHANDLED');
// mountSettings 的连续语句分组放在 ui/settingsPanelMarkup.js；分组函数返回它表示“没处理”，接着往下走。
export const SETTINGS_MOUNT_UNHANDLED = Symbol('SETTINGS_MOUNT_UNHANDLED');
// 设置页主体：主页设置面板状态、记忆导入入口刷新、设置页挂载与填充
// 从 ui/settingsPanel.js 原样搬出（重构阶段 2），声明文本一字未改；ui/settingsPanel.js 仍转发原有导出。

let homeSettingsPanel = null;

async function runCurrentMemoryRedo(panel, mode, moduleId) {
  const status = panel.querySelector('[data-rmt-auto-memory-redo-status]');
  if (status) status.textContent = '正在重写这一份回忆…';
  try {
    const result = await auto_memory_scheduler.regenerateCurrentMemory({ mode, moduleId });
    if (!status) return;
    if (result?.action === 'idle') status.textContent = '还没有可以重写的这一份。先等抽签写过一次。';
    else if (result?.action === 'busy') status.textContent = '这一份正在写，等它停下来再点。';
    else if (result?.action === 'failed') status.textContent = '这一次没写完。可以再点一次。';
    else
      status.textContent =
        mode === 'redraw'
          ? '已按新抽到的模块再写。'
          : mode === 'pick'
            ? '已按选中的模块再写。'
            : '已按原来抽中的模块再写。';
  } catch (error) {
    if (status) status.textContent = core_text.safeErrorSummary(error);
  }
}

let homeSettingsEpoch = -1;

let homeSettingsScope = '';

let memoryFilePreviewEpoch = 0;

export function clearHomeSettingsPanel() {
  mirrorReader.parkMirrorSettings();
  homeSettingsPanel?.remove();
  homeSettingsPanel = null;
  homeSettingsEpoch = -1;
  pendingMemoryFilePreview = null;
  memoryIngressRequestEpoch += 1;
  memoryFilePreviewEpoch += 1;
  homeSettingsScope = '';
  document.getElementById(SETTINGS_LAUNCHER_ID)?.remove();
}

let pendingMemoryFilePreview = null;

let memoryIngressRequestEpoch = 0;

export async function refreshMemoryIngressUi() {
  const requestEpoch = ++memoryIngressRequestEpoch;
  const panel = document.getElementById(core_constants.SETTINGS_ID);
  if (!panel) return;
  const status = panel.querySelector('[data-rmt-memory-ingress-status]');
  const details = panel.querySelector('[data-rmt-memory-source-list]');
  const historyBooks = panel.querySelector('[data-rmt-memory-history-books]');
  let capturedScopeKey = '';
  const isCurrent = () => {
    if (requestEpoch !== memoryIngressRequestEpoch || !capturedScopeKey) return false;
    try {
      const liveContext = core_context.currentCharacterGuard();
      return archive_repository.memorySourceScopeForContext(liveContext).key === capturedScopeKey;
    } catch {
      return false;
    }
  };
  try {
    const context = core_context.currentCharacterGuard();
    capturedScopeKey = archive_repository.memorySourceScopeForContext(context).key;
    const summary = await archive_repository.currentMemorySourceLedgerSummary(context);
    if (!isCurrent()) return;
    const preflight = archive_repository.getMemoryPreflight(context);
    const displayedSources = [...summary.sources];
    for (const source of preflight?.sources || []) {
      const latest = {
        provider: source.label || source.id,
        id: source.id,
        coverage: source.coverage,
        count: source.count,
      };
      const index = displayedSources.findIndex(item => (item.provider || item.id) === source.id);
      if (index >= 0) displayedSources[index] = latest;
      else displayedSources.push(latest);
    }
    if (status)
      status.textContent = summary.sources.length
        ? `● 已保存 ${summary.sources.length} 个来源 · ${summary.recordCount} 条记录 · ${summary.totalChars.toLocaleString()} 字符`
        : '○ 当前聊天还没有已保存来源';
    if (details) {
      details.replaceChildren();
      for (const source of displayedSources) {
        const row = document.createElement('div');
        const coverage = source.coverage?.status || 'partial';
        const labels = { complete: '完整', partial: '部分', truncated: '已截断', failed: '失败' };
        row.textContent = `${labels[coverage] || '部分'} · ${source.label || source.provider || source.id}${source.coverage?.returned ? ` · ${source.coverage.returned} 条` : ''}${source.coverage?.reason ? ` · ${source.coverage.reason}` : ''}`;
        details.appendChild(row);
      }
      if (!details.childElementCount) details.textContent = '暂无持久化来源。';
    }
    if (historyBooks) {
      const selection = archive_repository.getMemoryWorldInfoSelection(context);
      historyBooks.innerHTML = selection.books.length
        ? selection.books
            .map(
              book =>
                `<label class="checkbox_label rmt-settings-check"><input type="checkbox" data-rmt-memory-history-book="${core_text.esc(book.name)}" ${book.historySource ? 'checked' : ''}> ${core_text.esc(book.name)} · 作为历史摘要</label>`,
            )
            .join('')
        : '<small>请先在档案室选择记忆相关世界书；默认仍只作设定解释。</small>';
    }
  } catch (error) {
    if (capturedScopeKey && !isCurrent()) return;
    if (status)
      status.textContent = capturedScopeKey
        ? '○ ' + core_text.safeErrorSummary({ code: 'RMT_LEDGER_UNAVAILABLE' })
        : '○ 请先打开一个单角色聊天，再查看该聊天的来源账本。';
    if (details) details.textContent = '无法读取当前聊天来源。';
    if (historyBooks) historyBooks.textContent = '请先打开单角色聊天。';
  }
}

export function hydrateSettingsPanel({ memory = false } = {}) {
  const panel = document.getElementById(core_constants.SETTINGS_ID);
  if (!panel) return false;
  refreshSettingsMemoryStatus({ lightweight: true });
  if (memory) {
    void refreshMemoryIngressUi();
    const picker = panel.querySelector('[data-rmt-scene-picker]');
    if (picker && !picker.querySelector('[data-rmt-scene-picker-root]')) ui_scenePicker.mountScenePicker(picker);
  }
  if (panel.dataset.rmtHydrated === '1') return true;
  refreshGenerationSettingsUi();
  panel.dataset.rmtHydrated = '1';
  return true;
}

async function restoreLegacyAutoUpdates(panel) {
  const note = panel.querySelector('[data-rmt-auto-memory-gate]');
  let context;
  try {
    context = core_context.currentCharacterGuard();
  } catch (error) {
    if (note) note.textContent = core_text.safeErrorSummary(error);
    return;
  }
  const metadata = context.chatMetadata;
  const keys = [
    auto_memory_plan.AUTO_MEMORY_PLAN_KEY,
    auto_memory_plan.AUTO_MEMORY_REVEAL_KEY,
    auto_memory_plan.AUTO_MEMORY_DRAW_TICKETS_KEY,
    auto_memory_plan.AUTO_MEMORY_MODULE_PLAN_KEY,
  ];
  const had = {};
  const previous = {};
  for (const key of keys) {
    had[key] = Object.prototype.hasOwnProperty.call(metadata, key);
    if (had[key]) previous[key] = metadata[key];
  }
  let result;
  try {
    result = wizard_plan.disableAutoMemoryPlan(metadata, Date.now());
  } catch (error) {
    if (note) note.textContent = error?.safeToDisplay ? error.safeUserMessage : '这份记录没有改写。';
    return;
  }
  if (!result.changed) {
    refreshGenerationSettingsUi();
    return;
  }
  try {
    const before = auto_memory_plan.readAutoMemoryMetadata(metadata);
    auto_memory_plan.commitAutoMemoryMetadata(metadata, result.snapshot, before.plan.revision);
    await context.saveMetadataDebounced?.();
  } catch (error) {
    for (const key of keys) {
      if (had[key]) metadata[key] = previous[key];
      else delete metadata[key];
    }
    if (note) note.textContent = error?.safeToDisplay ? error.safeUserMessage : '没有恢复。原来的开关也没有被改写。';
    return;
  }
  core_autoUpdates.notifyAutoUpdateSettingsChanged();
  refreshGenerationSettingsUi();
  if (note) note.textContent = '自动留忆已关闭。你可以继续手动生成，也可以再打开回忆向导。';
}

export function mountSettings({ homeTarget = null } = {}) {
  ui_styles.ensureSettingsStyles();
  if (!homeTarget) {
    document.getElementById(SETTINGS_LAUNCHER_ID)?.remove();
    // The full settings and normal diagnostics entry belong to Hearttrace home.
    return true;
  }
  const existing = homeSettingsEpoch === runtimeState.runtimeLifecycleEpoch ? homeSettingsPanel : null;
  let scope = '';
  try {
    scope = core_context.chatScopeKey(core_context.currentCharacterGuard());
  } catch {}
  if (scope !== homeSettingsScope) {
    homeSettingsScope = scope;
    pendingMemoryFilePreview = null;
    memoryIngressRequestEpoch += 1;
    memoryFilePreviewEpoch += 1;
    const preview = existing?.querySelector('[data-rmt-memory-file-preview]');
    if (preview) preview.hidden = true;
    const status = existing?.querySelector('[data-rmt-memory-ingress-status]');
    if (status) status.textContent = '聊天已切换；展开记忆来源后查看状态。';
    const sourceList = existing?.querySelector('[data-rmt-memory-source-list]');
    const historyBooks = existing?.querySelector('[data-rmt-memory-history-books]');
    if (sourceList) sourceList.textContent = '';
    if (historyBooks) historyBooks.textContent = '';
  }
  if (existing) {
    homeTarget.appendChild(existing);
    mirrorReader.showMirrorSettings(existing.querySelector('[data-rmt-voice-settings]'));
    paintCoverageMap(existing);
    refreshSettingsMemoryStatus({ lightweight: true });
    if (existing.dataset.rmtHydrated === '1') refreshGenerationSettingsUi();
    return true;
  }
  const mount = homeTarget;
  const panel = document.createElement('div');
  panel.id = core_constants.SETTINGS_ID;
  panel.className = 'rmt-home-settings';
  homeSettingsPanel = panel;
  homeSettingsEpoch = runtimeState.runtimeLifecycleEpoch;
  if (dispatch_settingsPanelMarkup.renderSettingsPanelMarkup(panel) !== SETTINGS_MOUNT_UNHANDLED) return;
  mount.appendChild(panel);
  mirrorReader.showMirrorSettings(panel.querySelector('[data-rmt-voice-settings]'));
  paintCoverageMap(panel);
  refreshThemeUi();
  const tagDraft = panel.querySelector('[data-rmt-tag-draft]');
  const tagStatus = panel.querySelector('[data-rmt-tag-status]');
  const tagState = { tagChoices: new Map(), tagScanned: false, tagEdited: false, tagScanEpoch: 0 }; // r84.96: 标签扫描的共享状态，供拆出去的监听器一起读写
  const savedTagDraft = () => {
    const settings = core_settings.getPluginSettings();
    return settings.excludedContextTags;
  };
  const renderTagChoices = () => {
    const selected = new Set(core_contextTags.normalizeExcludedTags(tagDraft.value));
    for (const name of selected) if (!tagState.tagChoices.has(name)) tagState.tagChoices.set(name, 0);
    const result = panel.querySelector('[data-rmt-tag-results]');
    // Empty/legacy initial state does not need to allocate a tag subtree.
    if (!tagState.tagChoices.size) {
      result.textContent = '';
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const [name, count] of tagState.tagChoices) {
      const label = document.createElement('label');
      label.className = 'rmt-tag-choice';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.rmtTagName = name;
      input.checked = selected.has(name);
      const text = document.createElement('span');
      text.textContent = name + (count ? ' · ' + count : '');
      label.append(input, text);
      fragment.appendChild(label);
    }
    result.replaceChildren(fragment);
  };
  tagDraft.value = savedTagDraft().join(', ');
  tagStatus.textContent =
    core_settings.getPluginSettings().contextTagMode === 'keep'
      ? '旧版保留规则尚未更改。当前显示原有排除名单；请自行勾选并保存，之后勾选的标签内容不读取。'
      : '勾选的标签内容不读取；保存后用于后续整理。';
  renderTagChoices();
  const scanTagChoices = async () => {
    const epoch = ++tagState.tagScanEpoch,
      context = core_context.currentCharacterGuard();
    const scope = core_context.chatScopeKey(context),
      chat = context.chat,
      length = chat?.length;
    const lifecycle = runtimeState.runtimeLifecycleEpoch;
    const sourceSignature = source_guard.sourceReadSignature(context);
    const assertCurrent = () => {
      if (
        epoch !== tagState.tagScanEpoch ||
        !panel.isConnected ||
        lifecycle !== runtimeState.runtimeLifecycleEpoch ||
        core_context.chatScopeKey(core_context.currentCharacterGuard()) !== scope ||
        core_context.getContext().chat !== chat ||
        chat?.length !== length ||
        source_guard.sourceReadSignature(core_context.getContext()) !== sourceSignature
      )
        throw new DOMException('Changed', 'AbortError');
    };
    tagStatus.textContent = '正在扫描当前聊天的标签…';
    const scanned = await core_contextTags.scanContextTagChoices(chat, { assertCurrent });
    assertCurrent();
    const names = new Map(scanned.tags.map(tag => [tag.name, tag.count]));
    for (const name of core_contextTags.normalizeExcludedTags(tagDraft.value)) if (!names.has(name)) names.set(name, 0);
    tagState.tagChoices = names;
    tagState.tagScanned = true;
    if (!tagState.tagEdited) tagDraft.value = savedTagDraft().join(', ');
    renderTagChoices();
    tagStatus.textContent =
      '已扫描 ' + scanned.usedMessages + ' 条消息／' + scanned.tags.length + ' 种标签；选择后保存生效。';
  };
  const refreshCreative = () => {
    const settings = core_settings.getPluginSettings();
    panel.querySelector('[data-rmt-creative-text]').value = settings.creativeSupplement;
    panel.querySelector('[data-rmt-creative-enabled]').checked = settings.creativeSupplementEnabled;
    panel.querySelector('[data-rmt-creative-count]').textContent =
      settings.creativeSupplement.length.toLocaleString() + ' / 20,000';
  };
  refreshCreative();
  advanced_ui.bindAdvancedGenerationUi(panel);
  bindManualAutosave(panel);
  if (bindSettingsChange(panel, tagDraft, tagStatus, tagState) !== SETTINGS_BIND_UNHANDLED) return;
  panel.addEventListener('input', event => {
    if (event.target.closest?.('[data-rmt-scene-picker-root]')) {
      void ui_scenePicker.handleScenePickerEvent(event);
      return;
    }
    if (event.target === tagDraft) {
      ++tagState.tagScanEpoch;
      tagState.tagEdited = true;
      const selected = new Set(core_contextTags.normalizeExcludedTags(tagDraft.value));
      for (const input of panel.querySelectorAll('[data-rmt-tag-name]'))
        input.checked = selected.has(input.dataset.rmtTagName);
      tagStatus.textContent = '选择已更新；尚未保存。';
      return;
    }
    if (event.target.matches?.('[data-rmt-creative-text]'))
      panel.querySelector('[data-rmt-creative-count]').textContent =
        event.target.value.length.toLocaleString() + ' / 20,000';
    if (event.target.matches?.('[data-rmt-manual-api-base],[data-rmt-manual-api-key],[data-rmt-manual-api-model]')) {
      panel.dataset.rmtManualDirty = '1';
      if (event.target.matches?.('[data-rmt-manual-api-model]')) {
        const picker = panel.querySelector('[data-rmt-manual-api-models]');
        if (picker)
          picker.value = [...picker.options].some(option => option.value === event.target.value)
            ? event.target.value
            : '';
      }
    }
    if (event.target.matches?.('[data-rmt-theme-alpha]')) {
      core_settings.updatePluginSettings({
        themeAlpha: Math.max(0.72, Math.min(1, Number(event.target.value) || 0.96)),
      });
      refreshThemeUi();
    }
  });
  if (
    bindSettingsClick(
      panel,
      tagDraft,
      tagStatus,
      tagState,
      savedTagDraft,
      renderTagChoices,
      scanTagChoices,
      refreshCreative,
    ) !== SETTINGS_BIND_UNHANDLED
  )
    return;
  panel.addEventListener('focusin', event => {
    if (event.target.closest?.('[data-rmt-settings-section="voice"]')) return;
    if (panel.dataset.rmtHydrated !== '1' && event.target.matches?.('input,select,button,textarea'))
      hydrateSettingsPanel();
  });
  refreshSettingsMemoryStatus({ lightweight: true });
  return true;
}

// 设置页“改设置”监听器（change）：切换下拉框、勾选开关、填完输入框（mountSettings 原第 31–31 条语句，一字未改地搬出）
function bindSettingsChange(panel, tagDraft, tagStatus, tagState) {
  panel.addEventListener('change', async event => {
    if (await ui_scenePicker.handleScenePickerEvent(event)) return;
    if (cg_format_ui.handleCgFormatChange(event)) return;
    const target = event.target;
    if (target.matches?.('[data-rmt-tag-name]')) {
      ++tagState.tagScanEpoch;
      const selected = new Set(core_contextTags.normalizeExcludedTags(tagDraft.value));
      if (target.checked) selected.add(target.dataset.rmtTagName);
      else selected.delete(target.dataset.rmtTagName);
      tagDraft.value = [...selected].join(', ');
      tagState.tagEdited = true;
      tagStatus.textContent = '选择已更新；尚未保存。';
      return;
    }
    if (target.matches?.('[data-rmt-source-external]')) {
      core_settings.updatePluginSettings({ useCurrentChatExternalMemory: !!target.checked });
      return;
    }
    if (target.matches?.('[data-rmt-source-world-info]')) {
      core_settings.updatePluginSettings({ useActivatedWorldInfo: !!target.checked });
      return;
    }
    if (target.matches?.('[data-rmt-manual-streaming]')) {
      core_settings.updatePluginSettings({ manualApiStreaming: !!target.checked });
      return;
    }
    if (target.matches?.('[data-rmt-auto-second]')) {
      core_settings.updatePluginSettings({ autoSecondPass: !!target.checked });
      return;
    }
    if (target.matches?.('[data-rmt-auto-retry]')) {
      core_settings.updatePluginSettings({ autoRetryEnabled: !!target.checked });
      const count = panel.querySelector('[data-rmt-auto-retry-count]');
      if (count) count.disabled = !target.checked;
      const memoryRetry = panel.querySelector('[data-rmt-auto-memory-retry]');
      if (memoryRetry) memoryRetry.checked = !!target.checked;
      return;
    }
    if (target.matches?.('[data-rmt-auto-retry-count]')) {
      core_settings.updatePluginSettings({ autoRetryCount: target.value });
      target.value = String(core_settings.getPluginSettings().autoRetryCount);
      return;
    }
    if (
      target.matches?.(
        '[data-rmt-read-mode], [data-rmt-read-recent], [data-rmt-read-start], [data-rmt-read-end], [data-rmt-read-hidden]',
      )
    ) {
      const range = {
        mode: panel.querySelector('[data-rmt-read-mode]').value,
        recent: Number(panel.querySelector('[data-rmt-read-recent]').value),
        start: Number(panel.querySelector('[data-rmt-read-start]').value),
        end: Number(panel.querySelector('[data-rmt-read-end]').value),
        includeHidden: panel.querySelector('[data-rmt-read-hidden]').checked,
      };
      core_settings.updatePluginSettings({ chatReadRange: range });
      refreshReadingSettingsUi(panel);
      panel.querySelector('[data-rmt-read-preview-status]').textContent =
        '已保存，之后读取聊天时生效；已有记忆保持不变。';
      return;
    }
    const autoMode = target.dataset?.rmtAutoEnabled || target.dataset?.rmtAutoEvery;
    if (core_autoUpdatePolicy.AUTO_UPDATE_MODES.includes(autoMode)) {
      const rules = core_autoUpdatePolicy.normalizeAutoUpdates(core_settings.getPluginSettings().autoUpdates);
      rules[autoMode] = {
        ...rules[autoMode],
        epoch: Date.now(),
        ...(target.dataset.rmtAutoEnabled ? { enabled: target.checked } : { every: Number(target.value) }),
      };
      core_settings.updatePluginSettings({ autoUpdates: rules });
      core_autoUpdates.notifyAutoUpdateSettingsChanged();
      refreshGenerationSettingsUi();
      return;
    }
    if (target.matches?.('[data-rmt-memory-file-input]')) {
      const file = target.files?.[0];
      pendingMemoryFilePreview = null;
      const previewEpoch = ++memoryFilePreviewEpoch;
      const previewScope = homeSettingsScope;
      const previewStillCurrent = () => {
        try {
          return (
            previewEpoch === memoryFilePreviewEpoch &&
            homeSettingsPanel === panel &&
            previewScope === core_context.chatScopeKey(core_context.currentCharacterGuard())
          );
        } catch {
          return false;
        }
      };
      if (!file) return;
      const previewPanel = panel.querySelector('[data-rmt-memory-file-preview]');
      const title = panel.querySelector('[data-rmt-memory-file-preview-title]');
      const meta = panel.querySelector('[data-rmt-memory-file-preview-meta]');
      const binding = panel.querySelector('[data-rmt-memory-file-preview-binding]');
      const sample = panel.querySelector('[data-rmt-memory-file-preview-sample]');
      const historyConfirm = panel.querySelector('[data-rmt-memory-file-history-confirm]');
      const commitButton = panel.querySelector('[data-rmt-memory-file-commit]');
      archive_repository
        .previewCurrentChatMemoryFile(file)
        .then(preview => {
          if (!previewStillCurrent()) return;
          pendingMemoryFilePreview = preview;
          if (title) title.textContent = preview.fileName;
          if (meta) {
            const skipped = Number(preview.skippedSensitiveFields || 0) + Number(preview.skippedConfigFields || 0);
            meta.textContent = `${preview.records.length} 条 · ${preview.totalChars.toLocaleString()} 字符 · ${(preview.bytes / 1024).toFixed(1)} KB${skipped ? ` · 已排除敏感/配置字段 ${skipped} 个` : ''}`;
          }
          if (binding)
            binding.textContent = `归属：${preview.scope.characterName || '当前角色'} · ${preview.scope.chatId}`;
          if (sample) {
            const excerpt = preview.records
              .slice(0, 3)
              .map((item, index) => {
                const label = item.title ? `${item.title}：` : '';
                return `${index + 1}. ${label}${core_text.normalizeText(item.content, 220)}`;
              })
              .join('\n');
            sample.textContent = `内容预览\n${excerpt}`;
          }
          if (historyConfirm) historyConfirm.checked = false;
          if (commitButton) commitButton.disabled = true;
          if (previewPanel) previewPanel.hidden = false;
        })
        .catch(error => {
          if (!previewStillCurrent()) return;
          if (previewPanel) previewPanel.hidden = true;
          globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊');
        })
        .finally(() => {
          target.value = '';
        });
      return;
    }
    if (target.matches?.('[data-rmt-memory-file-history-confirm]')) {
      const commitButton = panel.querySelector('[data-rmt-memory-file-commit]');
      if (commitButton) commitButton.disabled = !target.checked || !pendingMemoryFilePreview;
      return;
    }
    if (target.matches?.('[data-rmt-memory-history-book]')) {
      let context = null;
      let previousSelection = null;
      let attemptedSelectionJson = '';
      try {
        context = core_context.currentCharacterGuard();
        previousSelection = archive_repository.getMemoryWorldInfoSelection(context);
        archive_repository.updateMemoryWorldInfoBookSelection(context, target.dataset.rmtMemoryHistoryBook, {
          historySource: !!target.checked,
        });
        attemptedSelectionJson = JSON.stringify(archive_repository.getMemoryWorldInfoSelection(context).books);
        const worldInfo = await archive_repository.syncSelectedWorldInfoHistoryLedger(context);
        const bookResult = worldInfo.books?.find(book => book.name === target.dataset.rmtMemoryHistoryBook);
        if (target.checked && bookResult?.coverageInfo?.status !== 'complete') {
          globalThis.toastr?.warning?.(
            `已标记，但本轮只完成部分同步：${bookResult?.coverageInfo?.reason || '请查看来源状态'}`,
            '心迹回廊',
          );
        } else {
          globalThis.toastr?.success?.(
            target.checked ? '已标记为历史摘要来源。' : '已恢复为设定解释来源。',
            '心迹回廊',
          );
        }
        void refreshMemoryIngressUi();
      } catch (error) {
        if (
          !error?.worldHistoryPersisted &&
          context &&
          previousSelection &&
          JSON.stringify(archive_repository.getMemoryWorldInfoSelection(context).books) === attemptedSelectionJson
        ) {
          archive_repository.setMemoryWorldInfoSelection(context, previousSelection);
          const previousBook = previousSelection.books.find(book => book.name === target.dataset.rmtMemoryHistoryBook);
          target.checked = previousBook?.historySource === true;
        }
        if (error?.name !== 'AbortError')
          globalThis.toastr?.error?.(
            `历史来源没有同步，已恢复原选择：${core_text.toastText(core_text.safeErrorSummary(error))}`,
            '心迹回廊',
          );
        void refreshMemoryIngressUi();
      }
      return;
    }
    if (target.matches?.('[data-rmt-api-profile]')) {
      panel.dataset.rmtApiEditor = 'profile';
      const connectionProfileId = core_text.normalizeText(target.value, 160);
      core_settings.updatePluginSettings({ apiConnectionMode: 'profile', connectionProfileId, modelOverride: '' });
      refreshGenerationSettingsUi();
      void refreshModelOptions({ fetchRemote: !!connectionProfileId });
      return;
    }
    if (target.matches?.('[data-rmt-api-pool-enabled], [data-rmt-api-pool-profile]')) {
      const connectionPoolIds = [...panel.querySelectorAll('[data-rmt-api-pool-profile]:checked')].map(
        input => input.dataset.rmtApiPoolProfile,
      );
      core_settings.updatePluginSettings({
        connectionPoolEnabled: panel.querySelector('[data-rmt-api-pool-enabled]')?.checked === true,
        connectionPoolIds,
      });
      refreshGenerationSettingsUi();
      return;
    }
    if (target.matches?.('[data-rmt-api-model]')) {
      panel.dataset.rmtApiEditor = 'profile';
      core_settings.updatePluginSettings({
        apiConnectionMode: 'profile',
        modelOverride: core_text.normalizeText(target.value, 240),
      });
      refreshGenerationSettingsUi();
      return;
    }
    if (target.matches?.('[data-rmt-api-max-tokens]')) {
      if (target.validity?.badInput || (target.value.trim() && !output_budget.isValidOutputTokens(target.value))) {
        globalThis.toastr?.warning?.('最大输出请填写正整数；原设置未改动。', '心迹回廊');
        target.value = String(core_settings.getPluginSettings().maxTokens);
        return;
      }
      core_settings.updatePluginSettings({ maxTokens: output_budget.normalizeOutputTokens(target.value) });
      refreshGenerationSettingsUi();
      return;
    }
    if (target.matches?.('[data-rmt-api-input-budget]')) {
      if (target.validity?.badInput || (target.value.trim() && !output_budget.isValidInputBudgetTokens(target.value))) {
        globalThis.toastr?.warning?.(
          '输入预算请填写 8000–200000 的整数；原设置未改动。打开设置 → 输入预算，不是最大输出。',
          '心迹回廊',
        );
        target.value = String(core_settings.getPluginSettings().inputBudgetTokens);
        return;
      }
      core_settings.updatePluginSettings({ inputBudgetTokens: output_budget.normalizeInputBudgetTokens(target.value) });
      refreshGenerationSettingsUi();
      return;
    }
    if (target.matches?.('[data-rmt-api-temperature]')) {
      core_settings.updatePluginSettings({
        temperature: Math.max(
          0,
          Math.min(
            2,
            Number.isFinite(Number(target.value)) ? Number(target.value) : core_constants.DEFAULT_SETTINGS.temperature,
          ),
        ),
      });
      refreshGenerationSettingsUi();
      return;
    }
    if (target.matches?.('[data-rmt-room-life-auto]')) {
      core_settings.updatePluginSettings({ roomLifeAutoDaily: !!target.checked });
      refreshGenerationSettingsUi();
      return;
    }
    if (target.matches?.('[data-rmt-image-generation-provider]')) {
      core_settings.updatePluginSettings({ imageGenerationProvider: target.value });
      refreshImageGenerationSettingsUi();
      generation_imageGeneration.refreshCgImageProviderBars();
      return;
    }
    if (target.matches?.('[data-rmt-tt-display]')) {
      core_settings.updatePluginSettings({ ttDisplayMode: !!target.checked });
      const overlay = document.getElementById(core_constants.OVERLAY_ID);
      if (overlay) ui_overlay.applyArchiveMobileSafeArea(overlay);
      refreshGenerationSettingsUi();
      return;
    }
    if (target.matches?.('[data-rmt-floating-avatar]')) {
      core_settings.updatePluginSettings({ floatingAvatar: target.value });
      floating_archive.refreshFloatingArchive();
      return;
    }
    if (target.matches?.('[data-rmt-theme-mode]')) {
      core_settings.updatePluginSettings({
        themeMode: core_constants.THEME_MODES.has(target.value) ? target.value : 'default',
      });
      refreshThemeUi();
      refreshGenerationSettingsUi();
      return;
    }
    if (target.matches?.('[data-rmt-theme-alpha]')) {
      core_settings.updatePluginSettings({ themeAlpha: Math.max(0.72, Math.min(1, Number(target.value) || 0.96)) });
      refreshThemeUi();
      return;
    }
    if (target.matches?.('[data-rmt-theme-color]')) {
      const key = target.dataset.rmtThemeColor;
      const settings = core_settings.getPluginSettings();
      if (key && Object.prototype.hasOwnProperty.call(settings.themeCustom || {}, key)) {
        core_settings.updatePluginSettings({
          themeMode: 'custom',
          themeCustom: core_theme.normalizeThemeCustom({ ...settings.themeCustom, [key]: target.value }),
        });
        refreshThemeUi();
        refreshGenerationSettingsUi();
      }
      return;
    }
    if (target.matches?.('[data-rmt-manual-api-models]')) {
      const manualInput = panel.querySelector('[data-rmt-manual-api-model]');
      if (manualInput && target.value) {
        manualInput.value = target.value;
        panel.dataset.rmtManualDirty = '1';
      }
      return;
    }
    if (target.matches?.('[data-rmt-banned-generated-phrases]')) {
      core_settings.updatePluginSettings({
        bannedGeneratedPhrases: core_settings.normalizeBannedGeneratedPhrases(target.value),
      });
      refreshGenerationSettingsUi();
    }
  });
  return SETTINGS_BIND_UNHANDLED;
}

// 设置页“点按钮”监听器（click）：扫描标签、测试连接等设置页按钮（mountSettings 原第 33–33 条语句，一字未改地搬出）
function bindSettingsClick(
  panel,
  tagDraft,
  tagStatus,
  tagState,
  savedTagDraft,
  renderTagChoices,
  scanTagChoices,
  refreshCreative,
) {
  panel.addEventListener('click', event => {
    if (event.target.closest?.('[data-rmt-scene-picker-root]')) {
      void ui_scenePicker.handleScenePickerEvent(event);
      return;
    }
    const coverageGap = event.target.closest?.('[data-rmt-coverage-gap]');
    if (coverageGap) {
      const [start, end] = String(coverageGap.dataset.rmtCoverageGap || '')
        .split('-')
        .map(Number);
      if (!start || !end || start > end) return;
      const current = core_settings.getPluginSettings().chatReadRange || {};
      core_settings.updatePluginSettings({ chatReadRange: { ...current, mode: 'range', start, end } });
      refreshReadingSettingsUi(panel);
      const preview = panel.querySelector('[data-rmt-read-preview-status]');
      if (preview)
        preview.textContent = `已把读取范围设为第 ${start}–${end} 楼。下次整理档案只读这一段，不会重做已有记忆，也还没有开始生成。`;
      return;
    }
    if (event.target.closest?.('[data-rmt-read-preview]')) {
      const status = panel.querySelector('[data-rmt-read-preview-status]');
      try {
        const context = core_context.currentCharacterGuard();
        const preview = core_chatReadRange.readRangePreview(context, core_settings.getPluginSettings());
        const bank = archive_repository.getImportedMemory(context);
        const coverage = archive_coverage.archiveCoverageSummary(bank, preview.start ? preview : null);
        const coverageNote = !bank
          ? ''
          : coverage.covered.length
            ? `档案已整理 ${archive_coverage.formatCoveredRanges(coverage.covered)}。`
            : '档案尚未记录已整理楼层区间。';
        const gapNote = !coverageNote
          ? ''
          : coverage.gaps.length
            ? `本次范围内缺口：${archive_coverage.formatFloorGaps(coverage.gaps)}。`
            : preview.start
              ? '本次范围内没有缺口。'
              : '';
        const suggestNote =
          coverageNote && coverage.suggested
            ? `建议下一段补录范围：第 ${coverage.suggested.start}–${coverage.suggested.end} 楼（切换为“指定楼号范围”后填写）。`
            : '';
        status.textContent = `${preview.label} · 共 ${preview.totalFloors} 楼，选中 ${preview.selectedFloors} 楼（普通 ${preview.visibleCount} / 隐藏 ${preview.hiddenCount}），约 ${preview.characters.toLocaleString()} 字符。仅本地预览，未发起生成。${coverageNote}${gapNote}${suggestNote}`;
      } catch (error) {
        status.textContent = core_text.safeErrorSummary(error);
      }
      return;
    }
    if (event.target.closest?.('[data-rmt-creative-save]')) {
      try {
        core_settings.updatePluginSettings({
          creativeSupplement: panel.querySelector('[data-rmt-creative-text]').value,
          creativeSupplementEnabled: panel.querySelector('[data-rmt-creative-enabled]').checked,
        });
        panel.querySelector('[data-rmt-creative-status]').textContent = '已保存；下次心迹回廊文本生成生效。';
      } catch (error) {
        panel.querySelector('[data-rmt-creative-status]').textContent = core_text.safeErrorSummary(error);
      }
      return;
    }
    if (event.target.closest?.('[data-rmt-creative-cancel]')) {
      refreshCreative();
      panel.querySelector('[data-rmt-creative-status]').textContent = '已撤销未保存编辑。';
      return;
    }
    if (event.target.closest?.('[data-rmt-auto-memory-wizard]')) {
      auto_memory_wizard.openAutoMemoryWizard();
      return;
    }
    const redoPick = event.target.closest?.('[data-rmt-auto-memory-pick-module]');
    if (redoPick) {
      void runCurrentMemoryRedo(panel, 'pick', redoPick.getAttribute('data-rmt-auto-memory-pick-module') || '');
      return;
    }
    const redoButton = event.target.closest?.('[data-rmt-auto-memory-redo]');
    if (redoButton) {
      const mode = redoButton.getAttribute('data-rmt-auto-memory-redo') || '';
      if (mode === 'pick') {
        const host = panel.querySelector('[data-rmt-auto-memory-pick]');
        if (host) {
          host.hidden = !host.hidden;
          if (!host.hidden && !host.childElementCount) {
            host.innerHTML = auto_memory_redo
              .choosableModules(auto_memory_registry.listAutoMemoryModules())
              .map(
                item =>
                  `<button type="button" class="menu_button" data-rmt-auto-memory-pick-module="${core_text.esc(item.id)}">${core_text.esc(item.title)}</button>`,
              )
              .join('');
          }
        }
        return;
      }
      void runCurrentMemoryRedo(panel, mode, '');
      return;
    }
    if (event.target.closest?.('[data-rmt-auto-memory-restore]')) {
      void restoreLegacyAutoUpdates(panel);
      return;
    }
    const updateButton = event.target.closest?.('[data-rmt-self-update]');
    if (updateButton) {
      void core_selfUpdater.updateFromButton(updateButton, panel.querySelector('[data-rmt-self-update-status]'), {
        isBusy: () =>
          runtimeState.busy || core_requestCoordinator.hasGenerationTasks() || !!runtimeState.roomLifeRefreshPromise,
      });
      return;
    }
    const tagAction = event.target.closest?.(
      '[data-rmt-tag-save],[data-rmt-tag-cancel],[data-rmt-tag-clear],[data-rmt-tag-scan],[data-rmt-tag-all],[data-rmt-tag-invert]',
    );
    if (tagAction) {
      void (async () => {
        try {
          if (tagAction.hasAttribute('data-rmt-tag-save')) {
            ++tagState.tagScanEpoch;
            const tags = core_contextTags.normalizeExcludedTags(tagDraft.value);
            core_settings.updatePluginSettings({ contextTagMode: 'exclude', excludedContextTags: tags });
            tagDraft.value = tags.join(', ');
            tagState.tagEdited = false;
            renderTagChoices();
            tagStatus.textContent =
              '已保存 ' + tags.length + ' 个过滤标签，标签内的内容不读取；下次整理生效，聊天和旧档案未改动。';
          } else if (tagAction.hasAttribute('data-rmt-tag-cancel')) {
            ++tagState.tagScanEpoch;
            tagState.tagEdited = false;
            tagDraft.value = savedTagDraft().join(', ');
            renderTagChoices();
            tagStatus.textContent = '已撤销未保存编辑。';
          } else if (tagAction.hasAttribute('data-rmt-tag-clear')) {
            ++tagState.tagScanEpoch;
            tagState.tagEdited = true;
            tagDraft.value = '';
            renderTagChoices();
            tagStatus.textContent = '已清空选择；尚未保存。';
          } else if (tagAction.hasAttribute('data-rmt-tag-scan')) {
            tagAction.disabled = true;
            await scanTagChoices();
          } else {
            tagAction.disabled = true;
            if (!tagState.tagScanned) await scanTagChoices();
            ++tagState.tagScanEpoch;
            const selected = new Set(core_contextTags.normalizeExcludedTags(tagDraft.value));
            tagDraft.value = [...tagState.tagChoices.keys()]
              .filter(name => tagAction.hasAttribute('data-rmt-tag-all') || !selected.has(name))
              .join(', ');
            tagState.tagEdited = true;
            renderTagChoices();
            tagStatus.textContent = '选择已更新；尚未保存。';
          }
        } catch (error) {
          if (error?.name !== 'AbortError') tagStatus.textContent = core_text.safeErrorSummary(error);
        } finally {
          tagAction.disabled = false;
        }
      })();
      return;
    }
    const preset = event.target.closest?.('[data-rmt-theme-preset]');
    if (preset) {
      core_settings.updatePluginSettings({
        themeMode: 'custom',
        themeCustom: {
          ...(preset.dataset.rmtThemePreset === 'night'
            ? core_constants.NIGHT_THEME_PALETTE
            : core_constants.DEFAULT_THEME_PALETTE),
        },
      });
      refreshGenerationSettingsUi();
      return;
    }
    const settingsSummary = event.target.closest?.('[data-rmt-settings-section] > summary');
    if (settingsSummary && settingsSummary.parentElement?.dataset.rmtSettingsSection !== 'voice')
      hydrateSettingsPanel({ memory: settingsSummary.parentElement?.dataset.rmtSettingsSection === 'memory' });
    const themeReset = event.target.closest?.('[data-rmt-theme-reset]');
    if (themeReset) {
      core_settings.updatePluginSettings({
        themeMode: 'default',
        themeAlpha: core_constants.DEFAULT_SETTINGS.themeAlpha,
        themeCustom: { ...core_constants.DEFAULT_THEME_PALETTE },
      });
      refreshThemeUi();
      refreshGenerationSettingsUi();
      globalThis.toastr?.success?.('已恢复心迹回廊默认配色。', '心迹回廊');
      return;
    }
    const memoryAutoRead = event.target.closest?.('[data-rmt-memory-auto-read]');
    if (memoryAutoRead) {
      memoryAutoRead.disabled = true;
      memoryAutoRead.querySelector('small')?.replaceChildren(document.createTextNode('正在读取…'));
      archive_repository
        .readCurrentChatMemoryPlugins()
        .then(() => refreshMemoryIngressUi())
        .catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'))
        .finally(() => {
          memoryAutoRead.disabled = false;
          const small = memoryAutoRead.querySelector('small');
          if (small) small.textContent = '已注册的当前聊天来源';
        });
      return;
    }
    const memoryFileChoose = event.target.closest?.('[data-rmt-memory-file-choose]');
    if (memoryFileChoose) {
      panel.querySelector('[data-rmt-memory-file-input]')?.click?.();
      return;
    }
    const memoryFileCommit = event.target.closest?.('[data-rmt-memory-file-commit]');
    if (memoryFileCommit) {
      if (!pendingMemoryFilePreview) {
        globalThis.toastr?.warning?.('请先选择并预览记忆文件。', '心迹回廊');
        return;
      }
      if (!panel.querySelector('[data-rmt-memory-file-history-confirm]')?.checked) {
        globalThis.toastr?.warning?.('请先确认：文件内容是已经发生的历史/摘要，不是角色设定。', '心迹回廊');
        return;
      }
      memoryFileCommit.disabled = true;
      archive_repository
        .commitCurrentChatMemoryFilePreview(pendingMemoryFilePreview, core_context.currentCharacterGuard(), {
          confirmedHistory: true,
        })
        .then(async summary => {
          pendingMemoryFilePreview = null;
          const previewPanel = panel.querySelector('[data-rmt-memory-file-preview]');
          if (previewPanel) previewPanel.hidden = true;
          globalThis.toastr?.success?.(`已导入来源账本：${summary.recordCount} 条。`, '心迹回廊');
          await refreshMemoryIngressUi();
        })
        .catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'))
        .finally(() => {
          memoryFileCommit.disabled = false;
        });
      return;
    }
    const memorySourceClear = event.target.closest?.('[data-rmt-memory-source-clear]');
    if (memorySourceClear) {
      if (
        !globalThis.confirm?.(
          '只清除当前角色、当前聊天在“心迹回廊”内保存的来源账本。正式 Mxxx、聊天和第三方记忆都不会删除。确定继续吗？',
        )
      )
        return;
      memorySourceClear.disabled = true;
      archive_repository
        .clearCurrentChatImportedSources()
        .then(async () => {
          pendingMemoryFilePreview = null;
          const previewPanel = panel.querySelector('[data-rmt-memory-file-preview]');
          if (previewPanel) previewPanel.hidden = true;
          await refreshMemoryIngressUi();
          globalThis.toastr?.success?.('当前聊天的心迹回廊来源账本已清除并验证。', '心迹回廊');
        })
        .catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'))
        .finally(() => {
          memorySourceClear.disabled = false;
        });
      return;
    }
    const manualChoiceButton = event.target.closest?.('[data-rmt-api-select-manual]');
    if (manualChoiceButton) {
      core_settings.beginApiConfigurationOperation();
      panel.dataset.rmtApiEditor = 'manual';
      refreshGenerationSettingsUi();
      return;
    }
    const manualClearButton = event.target.closest?.('[data-rmt-manual-api-key-clear]');
    if (manualClearButton) {
      clearTimeout(manualAutosaves.get(panel));
      manualAutosaves.delete(panel);
      const keyInput = panel.querySelector('[data-rmt-manual-api-key]');
      if (keyInput) keyInput.value = '';
      void core_settings
        .forgetManualApiCredential()
        .then(() => {
          refreshGenerationSettingsUi();
          const status = panel.querySelector('[data-rmt-manual-save-status]');
          if (status) status.textContent = '本插件手动 Key 已清除，主聊天连接未改。';
        })
        .catch(error => globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊'));
      return;
    }
    if (event.target.closest?.('[data-rmt-manual-api-save]')) {
      void saveManualPanel(panel, true);
      return;
    }
    const manualRefreshButton = event.target.closest?.('[data-rmt-manual-api-model-refresh]');
    if (manualRefreshButton) {
      refreshManualModelOptions({ fetchRemote: true })
        .then(models => {
          if (!models?.length) return;
          if (panel.dataset.rmtManualModelFallback === '1')
            globalThis.toastr?.warning?.('远程模型列表暂不可用，已保留手动 API 自己保存的模型。', '心迹回廊');
          else globalThis.toastr?.success?.(`已找到 ${models.length} 个模型。`, '心迹回廊');
        })
        .catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'));
      return;
    }
    const modelRefreshButton = event.target.closest?.('[data-rmt-api-model-refresh]');
    if (modelRefreshButton) {
      refreshModelOptions({ fetchRemote: true })
        .then(result => {
          if (!result) return;
          if (result.fallbackOnly)
            globalThis.toastr?.warning?.('远程列表暂不可用，已显示这一连接保存的模型。', '心迹回廊');
          else globalThis.toastr?.success?.('模型列表已更新。', '心迹回廊');
        })
        .catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'));
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
      core_settings
        .importCurrentSillyTavernConnection({
          isCurrent: () => core_settings.isCurrentApiConfigurationOperation(operationEpoch),
        })
        .then(result => {
          if (!isLatestUiRequest()) return;
          refreshGenerationSettingsUi();
          const current = core_settings.getPluginSettings();
          if (
            current.apiConnectionMode !== 'profile' ||
            current.connectionProfileId !== core_text.normalizeText(result?.id, 160)
          )
            return;
          globalThis.toastr?.success?.(result?.created ? '一键连接已创建并启用。' : '一键连接已启用。', '心迹回廊');
          void refreshModelOptions({ fetchRemote: true });
        })
        .catch(error => {
          if (!isLatestUiRequest()) return;
          if (error?.code !== 'RMT_API_CONFIGURATION_SUPERSEDED') {
            console.warn('[HeartbeatMemories] one-click configuration failed', core_text.safeErrorDiagnostic(error));
            globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊');
          }
          refreshGenerationSettingsUi();
        })
        .finally(() => {
          if (isLatestUiRequest()) apiImportButton.disabled = false;
        });
      return;
    }
    const currentArchiveButton = event.target.closest?.('[data-rmt-settings-current-archive]');
    if (currentArchiveButton) {
      // In claim mode this button re-binds the existing archive instead of paying for
      // a rebuild. Nothing is generated and no memory is altered.
      if (currentArchiveButton.dataset.rmtArchiveClaim === '1') {
        let info = null;
        try {
          info = archive_repository.mismatchedArchiveInfo(core_context.currentCharacterGuard());
        } catch {}
        if (!info) {
          refreshSettingsMemoryStatus();
          return;
        }
        const ok = ui_overlay.confirmExplicitAction(
          '认领这份档案到当前聊天？',
          `找到「${info.archiveName || '未命名档案'}」，共 ${info.memoryCount} 条记忆，但它记录的聊天标识与当前聊天不同。` +
            '\n\n聊天被重命名、分支或复制后会出现这种情况。' +
            '\n\n确定＝把它绑定到当前聊天。不改动任何记忆内容，不消耗生成额度，原标识会被保留备查。' +
            '\n取消＝保持原样。',
          { destructive: false },
        );
        if (!ok) return;
        try {
          const claimed = archive_repository.claimMismatchedArchive(core_context.currentCharacterGuard());
          globalThis.toastr?.success?.(`已认领 ${claimed.memoryCount} 条记忆到当前聊天。`, '心迹回廊');
        } catch (error) {
          globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊 · 认领失败');
        }
        refreshSettingsMemoryStatus();
        return;
      }
      ui_overlay.requestCurrentArchiveImport();
      return;
    }
    const openArchiveButton = event.target.closest?.('[data-rmt-settings-open-archive]');
    if (openArchiveButton) {
      void archive_library.showArchiveLibrary();
      return;
    }
  });
  return SETTINGS_BIND_UNHANDLED;
}
