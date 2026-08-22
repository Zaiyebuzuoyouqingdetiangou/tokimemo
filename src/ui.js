import { DEFAULT_VISUAL_PROMPT, VISUAL_AVOID_PROMPT_MAX_CHARS, VISUAL_EXTRA_PROMPT_MAX_CHARS, VISUAL_PROMPT_MAX_CHARS, getSettings, updateSettings, resetSettings } from './settings.js?rmv=1.4.30.12';
import { clearLastCombo } from './storage.js?rmv=1.4.30.12';
import { clearRabbitMirrorPrompt } from './injector.js?rmv=1.4.30.12';
import { clearFeedbackCatExtensionPrompt, getActiveFeedbackForCurrentChat, syncFeedbackCatExtensionPrompt } from './feedbackCat.js?rmv=1.4.30.12';
import { configureMaintenanceAutoSafeMode, refreshFeedbackCats, refreshMaintenanceRabbits, refreshRecipeButtons } from './outputSanitizer.js?rmv=1.4.30.12';
import { scanMemoryPlugins, testMemoryProvider } from './memoryScanner.js?rmv=1.4.30.12';
import { getLastRabbitMirrorTokenRecord, TOKEN_METER_EVENT } from './tokenMeter.js?rmv=1.4.30.12';
import { API_REQUEST_DIAGNOSTIC_EVENT, WORLD_INFO_BOOKS_CHANGED_EVENT, fetchIndependentModels, fetchWorldInfoBooks, getIndependentConnectionProfiles, getIndependentSavedModels, getLastIndependentApiRequestDiagnostic, getObservedWorldInfoBooks, importCurrentSillyTavernConnection, refreshRabbitMirrorGenerationMode, testIndependentConnection } from './independentApi.js?rmv=1.4.30.12';
import { BLACKLIST_CHANGED_EVENT, blacklistEntries, blacklistPoolStats, clearBlacklist, removeBlacklistItem, setBlacklistEnabled } from './blacklist.js?rmv=1.4.30.12';

const SETTINGS_UI_VERSION = '1.4.30.12-visual-maintenance';
const RUNTIME_VERSION = '1.4.30.12';

function isCurrentRuntime() {
    return globalThis.__rabbitMirrorRuntimeVersion === RUNTIME_VERSION;
}
let uiMountRetryTimer = 0;
let uiMountRetryCount = 0;
let pulledWorldInfoBooks = [];
let worldInfoBookRenderTimer = 0;
let worldInfoBookVisibilityObserver = null;
let worldInfoBookCurrentVisible = false;
let worldInfoBookCurrentDirty = true;
const WORLD_INFO_BOOK_RENDER_DEBOUNCE_MS = 140;

function scheduleUiMountRetry() {
    if (!isCurrentRuntime() || uiMountRetryTimer || uiMountRetryCount >= 20) return;
    uiMountRetryCount += 1;
    uiMountRetryTimer = setTimeout(() => {
        uiMountRetryTimer = 0;
        initRabbitMirrorUI();
    }, Math.min(1000, 120 + uiMountRetryCount * 40));
}

function checked(id, value) {
    $(id).prop('checked', !!value);
}

function renderVisualPromptStatus(settings = getSettings()) {
    const target = $('#rh_visual_prompt_status');
    if (!target.length) return;
    const enabled = !!settings?.visualPromptEditingEnabled;
    const official = String(settings?.visualPrompt ?? DEFAULT_VISUAL_PROMPT).replace(/\r\n?/g, '\n');
    const extra = String(settings?.visualExtraPrompt || '').trim();
    const avoid = String(settings?.visualAvoidPrompt || '').trim();
    const parts = [];
    if (official !== DEFAULT_VISUAL_PROMPT) parts.push('默认规则已改');
    if (extra) parts.push('想要的视觉已保存');
    if (avoid) parts.push('不想要的视觉已保存');
    // 1.3.69: 开启编辑后，「通用视觉审美规则」这一栏就是整套配色组织与反通用面板规则的
    // 唯一来源（关闭时走 legacyPresentationEmbodimentRule 内置同样内容）。清空它不会报错，
    // 但下一面开始这些规则会整体消失，只有画面变差能看出来，因此这里明确提示。
    if (enabled && !official.trim()) {
        target.text('已开启，但默认视觉规则是空的；建议恢复默认。');
        return;
    }
    if (!enabled) {
        target.text(parts.length
            ? `未开启；已保存内容不会发送（${parts.join(' / ')}）。`
            : '未开启；使用默认视觉规则。');
        return;
    }
    target.text(parts.length
        ? `已开启（${parts.join(' / ')}）`
        : '已开启；从下一面生效。');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}


function renderBlacklistSettings() {
    const target = $('#rh_blacklist_summary');
    if (!target.length) return;
    const settings = getSettings();
    const themes = blacklistEntries('theme');
    const formats = blacklistEntries('format');
    const stats = blacklistPoolStats();
    const row = item => `<div style="display:flex;align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid color-mix(in srgb,currentColor 10%,transparent);">
      <span style="min-width:0;flex:1;overflow-wrap:anywhere;">${escapeHtml(item.id)} ${escapeHtml(item.title)}</span>
      <button type="button" class="menu_button rh-blacklist-remove" data-kind="${escapeHtml(item.kind)}" data-id="${escapeHtml(item.id)}" style="padding:2px 7px;min-height:24px;">解除</button>
    </div>`;
    const section = (title, items) => `<div style="margin-top:7px;"><div style="font-weight:700;font-size:11px;opacity:.74;margin-bottom:2px;">${title}（${items.length}）</div>${items.length ? items.map(row).join('') : '<div style="opacity:.55;font-size:11px;padding:3px 0;">暂无</div>'}</div>`;
    const warnings = [];
    if (stats.themePoolEmpty) warnings.push('主题 / 元素候选已全部加入黑名单，随机主题将没有候选。');
    if (stats.formatPoolEmpty) warnings.push('展现形式候选已全部加入黑名单，随机形式将没有候选。');
    target.html(`<div style="font-size:11px;line-height:1.5;opacity:.78;">当前${settings.blacklistEnabled !== false ? '启用' : '暂停'}；主题 ${themes.length}/${stats.themeTotal}，形式 ${formats.length}/${stats.formatTotal}。只影响随机抽取。</div>
      ${warnings.length ? `<div style="margin-top:5px;color:#d97706;font-size:11px;line-height:1.45;">${warnings.map(escapeHtml).join('<br>')}</div>` : ''}
      ${section('主题 / 元素', themes)}
      ${section('展现形式', formats)}`);
}

function worldInfoSourceLabel(value) {
    return ({ characterLore: '角色', chatLore: '当前聊天', personaLore: 'Persona', globalLore: '当前全局' })[String(value || '')] || String(value || '');
}
function renderWorldInfoRows(target, books, disabled, emptyText) {
    if (!target.length) return;
    const rows = books.map((item, index) => {
        const enabled = !disabled.has(item.id);
        const identity = item.label !== item.id ? `<br><span style="opacity:.55;font-size:10px;">${escapeHtml(item.id)}</span>` : '';
        const sourceText = Array.isArray(item.sources) && item.sources.length
            ? item.sources.map(worldInfoSourceLabel).filter(Boolean).join(' / ')
            : item.note || '';
        return `<label class="checkbox_label" style="display:flex;align-items:flex-start;gap:7px;margin:4px 0;">
          <input class="rh-world-info-book-toggle" type="checkbox" data-book-index="${index}" data-book-id="${escapeHtml(item.id)}" ${enabled ? 'checked' : ''}>
          <span style="min-width:0;flex:1;overflow-wrap:anywhere;"><b>${escapeHtml(item.label)}</b>${identity}${sourceText ? `<br><span style="opacity:.6;font-size:10px;">${escapeHtml(sourceText)}</span>` : ''}</span>
        </label>`;
    }).join('');
    target.data('rm-world-info-books', books.map(item => item.id));
    target.html(books.length ? rows : `<div style="font-size:11px;line-height:1.4;opacity:.66;">${escapeHtml(emptyText)}</div>`);
}
function clearWorldInfoBookRenderTimer() {
    if (!worldInfoBookRenderTimer) return;
    clearTimeout(worldInfoBookRenderTimer);
    worldInfoBookRenderTimer = 0;
}
function renderWorldInfoBookSettings({ current = true, all = false } = {}) {
    const currentTarget = $('#rh_world_info_book_filters');
    const allTarget = $('#rh_world_info_all_book_filters');
    if (!currentTarget.length && !allTarget.length) return;
    const settings = getSettings();
    const disabled = new Set(Array.isArray(settings.independentWorldInfoDisabledBooks) ? settings.independentWorldInfoDisabledBooks : []);

    if (current && currentTarget.length) {
        const currentBooks = getObservedWorldInfoBooks().map(item => ({
            id: String(item?.name || '').trim(),
            label: String(item?.name || '').trim(),
            sources: item?.sources || [],
        })).filter(item => item.id);
        renderWorldInfoRows(
            currentTarget,
            currentBooks,
            disabled,
            '当前聊天还没有观察到酒馆加载的世界书。进入角色聊天并正常生成后会自动显示当前聊天相关世界书；不会为了列表重新扫描条目。',
        );
        worldInfoBookCurrentDirty = false;
    }

    const allDetails = document.getElementById('rh_world_info_all_books');
    if (!all || !allTarget.length || !allDetails?.open) return;
    const byId = new Map();
    for (const item of pulledWorldInfoBooks) {
        const id = String(item?.id || item?.name || '').trim(); if (!id) continue;
        byId.set(id, { id, label: String(item?.label || id).trim() || id, sources: [], note: '全部世界书' });
    }
    for (const id of disabled) {
        if (!byId.has(id)) byId.set(id, { id, label: id, sources: [], note: '已保存为关闭' });
    }
    const allBooks = [...byId.values()].sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id), 'zh-Hans-CN'));
    renderWorldInfoRows(allTarget, allBooks, disabled, '尚未拉取全部世界书。');
}
function scheduleWorldInfoBookSettingsRender(delay = WORLD_INFO_BOOK_RENDER_DEBOUNCE_MS) {
    worldInfoBookCurrentDirty = true;
    clearWorldInfoBookRenderTimer();
    // When the extension drawer is closed, do not build even the current-chat checkbox DOM.
    // IntersectionObserver will render it when the user actually exposes this settings area.
    if (worldInfoBookVisibilityObserver && !worldInfoBookCurrentVisible) return;
    worldInfoBookRenderTimer = setTimeout(() => {
        worldInfoBookRenderTimer = 0;
        if (!isCurrentRuntime() || !worldInfoBookCurrentDirty) return;
        renderWorldInfoBookSettings({ current: true, all: false });
    }, Math.max(0, Number(delay) || 0));
}
function disconnectWorldInfoBookVisibilityObserver() {
    try { worldInfoBookVisibilityObserver?.disconnect?.(); } catch {}
    worldInfoBookVisibilityObserver = null;
    worldInfoBookCurrentVisible = false;
}
function installWorldInfoBookVisibilityObserver() {
    disconnectWorldInfoBookVisibilityObserver();
    const target = document.getElementById('rh_world_info_book_filters');
    if (!target) return;
    if (typeof IntersectionObserver !== 'function') {
        worldInfoBookCurrentVisible = true;
        scheduleWorldInfoBookSettingsRender(0);
        return;
    }
    worldInfoBookVisibilityObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (entry.target !== target) continue;
            worldInfoBookCurrentVisible = entry.isIntersecting === true;
            if (worldInfoBookCurrentVisible && worldInfoBookCurrentDirty) scheduleWorldInfoBookSettingsRender(0);
        }
    }, { root: null, threshold: 0 });
    worldInfoBookVisibilityObserver.observe(target);
}
function clearCollapsedAllWorldInfoBookRows() {
    const target = $('#rh_world_info_all_book_filters');
    if (!target.length) return;
    target.removeData('rm-world-info-books');
    target.html('<div style="font-size:11px;line-height:1.4;opacity:.66;">折叠时不创建完整世界书列表；展开后按需渲染。</div>');
}

function independentApiProfileLabel(diagnostic) {
    if (!diagnostic?.profile) return '暂无记录';
    const status = diagnostic.ok ? '成功' : `失败 HTTP ${diagnostic.status || '?'}`;
    const temp = diagnostic.temperatureSent ? `温度 ${Number(diagnostic.configuredTemperature ?? 0.8)}` : '默认温度';
    const stream = diagnostic.streamSent ? '流式' : '非流式';
    return `${status}｜${temp}｜${stream}`;
}

function renderIndependentApiDiagnostic(diagnostic = getLastIndependentApiRequestDiagnostic()) {
    const target = $('#rh_independent_api_diagnostic');
    if (!target.length) return;
    const text = independentApiProfileLabel(diagnostic);
    const attempts = '';
    const themes = Array.isArray(diagnostic?.themeLabels) ? diagnostic.themeLabels.join('＋') : '';
    const formats = Array.isArray(diagnostic?.formatLabels) ? diagnostic.formatLabels.join('＋') : '';
    const selection = themes || formats ? `<br><b>抽到：</b>${escapeHtml(themes || '仅当前语境')}｜${escapeHtml(formats || '未记录')}` : '';
    const worldInfo = diagnostic?.globalWorldInfoEnabled
        ? `<br><b>世界书：</b>${diagnostic.globalWorldInfoCaptured ? `已带入 ${formatMeterNumber(diagnostic.globalWorldInfoEntries)}／${formatMeterNumber(diagnostic.globalWorldInfoTotalEntries || diagnostic.globalWorldInfoEntries)} 条，${formatMeterNumber(diagnostic.globalWorldInfoChars)} 字符${diagnostic.globalWorldInfoTruncated ? '（已按独立预算裁剪）' : ''}` : '本轮无可用条目'}`
        : '<br><b>世界书：</b>关闭';
    target.html(`<b>最近请求：</b>${escapeHtml(text)}${escapeHtml(attempts)}${selection}${worldInfo}`);
}


function formatMeterNumber(value) {
    return Math.max(0, Number(value) || 0).toLocaleString('zh-CN');
}

function tokenMeterNoInjectionLabel(reason) {
    const labels = {
        disabled: '本轮未注入：兔子镜已关闭',
        'quiet-skipped': '本轮未注入：静默生成已跳过',
        'impersonate-skipped': '本轮未注入：角色扮演生成已跳过',
        'directive-skipped': '本轮未注入：用户指令要求跳过',
        'independent-api': '本轮未注入：兔子镜由独立 API 生成',
        'mode-change': '当前注入已按生成方式切换清空',
        empty: '本轮未注入：没有形成有效 Prompt',
        cleared: '当前注入已清空',
        manual: '当前注入已手动清空',
    };
    return labels[String(reason || '')] || '本轮未注入';
}

function renderTokenMeter(record = getLastRabbitMirrorTokenRecord()) {
    const root = $('#rh_token_meter');
    if (!root.length) return;
    const main = root.find('[data-rh-token-meter-main]');
    const exact = root.find('[data-rh-token-meter-exact]');
    const detail = root.find('[data-rh-token-meter-detail]');
    if (!record) {
        main.text('尚无生成记录');
        exact.text('下一轮生成后更新。');
        detail.text('只统计兔子镜自己的 Prompt。');
        return;
    }
    if (record.status === 'independent') {
        const tokens = record.tokens || {};
        const chars = record.chars || {};
        main.text(`独立 API 约 ${formatMeterNumber(tokens.estimated)} Token`);
        exact.text(`规则约 ${formatMeterNumber(tokens.min)}–${formatMeterNumber(tokens.max)} Token；上下文 ${formatMeterNumber(chars.independentContext)} 字符。`);
        const parts = [
            `基础约 ${formatMeterNumber(tokens.baseEstimated)}`,
            chars.feedback ? `反馈约 ${formatMeterNumber(tokens.feedbackEstimated)}` : '反馈 0',
            chars.executionLock ? `输出保护约 ${formatMeterNumber(tokens.executionLockEstimated)}` : '',
            `参考内容 ${formatMeterNumber(chars.motherLibrary)} 字符`,
            chars.sharedMemory ? `回忆资料 ${formatMeterNumber(chars.sharedMemory)} 字符` : '',
            chars.editableVisual ? `自定义视觉 ${formatMeterNumber(chars.editableVisual)} 字符` : '',
        ].filter(Boolean);
        detail.text(parts.join('；'));
        return;
    }
    if (record.status !== 'injected') {
        main.text('0 Token');
        exact.text(tokenMeterNoInjectionLabel(record.reason));
        detail.text('本轮没有追加兔子镜 Prompt。');
        return;
    }

    const tokens = record.tokens || {};
    const chars = record.chars || {};
    main.text(`约 ${formatMeterNumber(tokens.estimated)} Token`);
    exact.text(`保守范围 ${formatMeterNumber(tokens.min)}–${formatMeterNumber(tokens.max)}；精确字符数 ${formatMeterNumber(chars.total)}`);
    const parts = [
        `基础约 ${formatMeterNumber(tokens.baseEstimated)}`,
        chars.feedback ? `反馈约 ${formatMeterNumber(tokens.feedbackEstimated)}` : '反馈 0',
        `参考内容 ${formatMeterNumber(chars.motherLibrary)} 字符`,
        chars.sharedMemory ? `回忆资料 ${formatMeterNumber(chars.sharedMemory)} 字符` : '',
        chars.editableVisual ? `自定义视觉 ${formatMeterNumber(chars.editableVisual)} 字符` : '',
    ].filter(Boolean);
    detail.text(parts.join('；'));
}

function attachTokenMeterListener() {
    try { globalThis.__rabbitMirrorTokenMeterUiCleanup?.(); } catch {}
    try { globalThis.__rabbitMirrorBlacklistUiCleanup?.(); } catch {}
    globalThis.__rabbitMirrorBlacklistUiCleanup = null;
    const handler = event => renderTokenMeter(event?.detail || getLastRabbitMirrorTokenRecord());
    globalThis.addEventListener?.(TOKEN_METER_EVENT, handler);
    globalThis.__rabbitMirrorTokenMeterUiCleanup = () => globalThis.removeEventListener?.(TOKEN_METER_EVENT, handler);
}

function renderMemoryScanResults(results) {
    const settings = getSettings();
    const selected = new Set(settings.memoryProviderIds || []);
    const container = $('#rh_memory_scan_results');
    if (!container.length) return;

    const list = Array.isArray(results) ? results : [];
    const readable = list.filter(item => item?.readable && item?.selectedAllowed);
    const pending = list.filter(item => !item?.readable);

    const contextBlock = `<div class="rh-memory-context" style="padding:8px 0 9px 0;">
      <div style="font-size:12px;"><b>当前模型上下文</b> <span style="font-size:11px;opacity:.82;">[已可用]</span></div>
      <div style="margin-top:3px;opacity:.68;font-size:11px;line-height:1.45;">当前模型已经知道的近期内容，不会重复读取。</div>
    </div>`;

    const readableRows = readable.map(item => {
        const checkedAttr = selected.has(item.id) ? ' checked' : '';
        return `<div class="rh-memory-provider" style="padding:8px 0;border-top:1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 65%, transparent);">
          <label class="checkbox_label" style="align-items:flex-start;">
            <input class="rh-memory-provider-check" type="checkbox" data-provider-id="${escapeHtml(item.id)}"${checkedAttr}>
            <span><b>${escapeHtml(item.name)}</b> <span style="font-size:11px;opacity:.82;">[可读取]</span><br><span style="opacity:.7;font-size:11px;line-height:1.45;">来源类型：公开资料接口</span></span>
          </label>
          ${item.details ? `<div style="margin:3px 0 0 26px;opacity:.62;font-size:11px;line-height:1.4;word-break:break-word;">${escapeHtml(item.details)}</div>` : ''}
          <button class="menu_button rh-memory-test" type="button" data-provider-id="${escapeHtml(item.id)}" style="margin:6px 0 0 26px;padding:3px 8px;min-height:unset;font-size:12px;">测试读取</button>
        </div>`;
    }).join('');

    const readableBlock = readableRows || '<div style="opacity:.75;font-size:12px;line-height:1.5;padding:6px 0;">未检测到可额外读取的资料来源。</div>';

    let pendingBlock = '';
    if (pending.length) {
        const visiblePending = pending.slice(0, 10);
        const pendingRows = visiblePending.map(item => `<div style="padding:5px 0;border-top:1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 45%, transparent);">
          <div style="font-size:12px;"><b>${escapeHtml(item.name)}</b> <span style="opacity:.58;font-size:11px;">[待适配]</span></div>
          <div style="opacity:.6;font-size:11px;line-height:1.4;word-break:break-word;">${escapeHtml(item.source || item.status || '')}</div>
        </div>`).join('');
        const omitted = pending.length > visiblePending.length
            ? `<div style="padding-top:5px;opacity:.58;font-size:11px;">另有 ${pending.length - visiblePending.length} 个候选未展开显示。</div>`
            : '';
        pendingBlock = `<details class="rh-memory-pending" style="margin-top:8px;border-top:1px dashed color-mix(in srgb, var(--SmartThemeBorderColor) 60%, transparent);padding-top:7px;">
          <summary style="cursor:pointer;font-size:12px;opacity:.72;">其他候选（${pending.length}）</summary>
          <div style="padding:4px 0 0 10px;">${pendingRows}${omitted}</div>
        </details>`;
    }

    if (!readable.length && !pending.length) {
        container.html(`${contextBlock}<div style="opacity:.75;font-size:12px;line-height:1.5;padding:6px 0;">未扫描到可额外读取的资料来源。</div>`);
        return;
    }
    container.html(`${contextBlock}${readableBlock}${pendingBlock}`);
}

function memoryTestMessage(result) {
    if (!result?.ok) return `读取失败：${result?.error || '未知错误'}`;
    const parts = [
        `${result.providerName || '资料来源'}读取成功`,
        `资料正文 ${result.chars} 字符`,
        result.characterName ? `角色：${result.characterName}` : '',
        result.chatId ? `聊天：${result.chatId}` : '',
        result.coverageComplete === false ? `覆盖不完整（缺失 ${result.missingFloors || 0} 个 AI 楼层）` : '',
        `耗时 ${result.elapsed || 0}ms`,
    ].filter(Boolean);
    return parts.join('；');
}

export function initRabbitMirrorUI() {
    if (!isCurrentRuntime()) return;
    const settings = getSettings();
    const noSendRegex = '/<toto\\b[^>]*>[\\s\\S]*?<\\/toto>\\s*/gi';
    const existing = $('#rabbit_mirror_theater_settings');
    if (existing.length) {
        const currentPanels = existing.filter(`[data-rabbit-mirror-ui-version="${SETTINGS_UI_VERSION}"][data-rabbit-mirror-runtime-version="${RUNTIME_VERSION}"]`)
            .filter((_, panel) => {
                const $panel = $(panel);
                return $panel.find('#rh_feedback_cat').length
                    && $panel.find('#rh_maintenance_rabbit').length
                    && $panel.find('#rh_visual_extra_prompt').length
                    && $panel.find('#rh_visual_avoid_prompt').length
                    && $panel.find('#rh_visual_prompt_save').length
                    && $panel.find('#rh_visual_prompt_enabled').length;
            });
        if (existing.length === 1 && currentPanels.length === 1) return;
        // A hot reload may leave the old settings DOM alive even after manifest.json has updated.
        // Remove every stale/duplicate panel so the claimed runtime becomes the only UI owner.
        existing.remove();
    }

    const settingsMount = $('#extensions_settings2');
    if (!settingsMount.length) {
        scheduleUiMountRetry();
        return;
    }
    uiMountRetryCount = 0;

    const html = `
<div id="rabbit_mirror_theater_settings" class="rabbit-mirror-settings" data-rabbit-mirror-ui-version="${SETTINGS_UI_VERSION}" data-rabbit-mirror-runtime-version="${RUNTIME_VERSION}">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>兔子镜小剧场</b><span class="rabbit-mirror-toto-watermark">TOTOv1.4.30.12</span>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <div class="rabbit-mirror-primary-toggle">
        <label class="checkbox_label"><input id="rh_enabled" type="checkbox"> 兔子镜自动注入</label>
        <div class="rabbit-mirror-subnote" style="margin:-2px 0 0 26px;opacity:.72;font-size:12px;line-height:1.45;">开启后每轮自动追加兔子镜规则。</div>
      </div>


      <details class="rabbit-mirror-section" open>
        <summary><span>兔子镜生成方式</span><span class="rabbit-mirror-section-note">二选一</span></summary>
        <div class="rabbit-mirror-section-content">
          <label class="checkbox_label"><input name="rh_generation_source" id="rh_generation_follow" type="radio" value="follow"> 跟随当前 API</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 8px 26px;opacity:.72;font-size:12px;line-height:1.45;">跟着当前回复一起生成兔子镜。</div>
          <div id="rh_follow_display_row" style="margin-left:26px;padding:7px 10px;border-left:2px solid color-mix(in srgb, var(--SmartThemeBorderColor) 60%, transparent);">
            <label><input name="rh_follow_display" type="radio" value="inline"> 正文下方</label>
            <label style="margin-left:14px;"><input name="rh_follow_display" type="radio" value="external"> 外置弹窗</label>
          </div>
          <label class="checkbox_label" style="margin-top:12px;"><input name="rh_generation_source" id="rh_generation_independent" type="radio" value="independent"> 使用独立 API</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 8px 26px;opacity:.72;font-size:12px;line-height:1.45;">正文先生成，回复结束后再用这里的 API 单独生成兔子镜。</div>
          <div id="rh_independent_api_fields" style="margin-left:26px;display:grid;gap:7px;">
            <div id="rh_independent_display_row" class="flex-container" style="gap:14px;flex-wrap:wrap;align-items:center;">
              <label><input name="rh_independent_display" type="radio" value="external"> ① 轻壳外置（标题有壳）</label>
              <label><input name="rh_independent_display" type="radio" value="external_then_inline"> ② 外置后内嵌</label>
            </div>
            <div style="padding:9px 10px;border:1px solid color-mix(in srgb, currentColor 16%, transparent);border-radius:9px;">
              <div class="flex-container" style="gap:7px;flex-wrap:wrap;align-items:center;">
                <button id="rh_independent_import_current" class="menu_button" type="button" style="font-weight:700;">从酒馆当前连接一键配置</button>
                <span id="rh_independent_connection_status" style="opacity:.72;font-size:11px;line-height:1.4;">尚未配置</span>
              </div>
              <div style="opacity:.66;font-size:11px;line-height:1.45;margin-top:5px;">直接复用 SillyTavern 当前 Chat Completion / Connection Manager 连接；API Key 继续由酒馆 Secrets 保管，不复制到兔子镜。</div>
            </div>
            <div class="flex-container" style="gap:7px;flex-wrap:wrap;">
              <button id="rh_independent_models" class="menu_button" type="button">拉取模型</button>
              <button id="rh_independent_test" class="menu_button" type="button">测试连接</button>
            </div>
            <select id="rh_independent_model_select" class="text_pole" aria-label="已拉取模型列表">
              <option value="">先点击“拉取模型”获取完整列表</option>
            </select>
            <input id="rh_independent_model" class="text_pole" type="text" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="模型 ID；可从上方完整列表选择，也可直接手动填写">
            <div style="opacity:.66;font-size:11px;line-height:1.45;">拉取后可从列表选模型；拉取失败也可以直接手填模型 ID。</div>
            <details id="rh_independent_manual_legacy" style="margin-top:2px;">
              <summary style="cursor:pointer;font-size:11px;opacity:.7;">高级：手动 OpenAI 兼容接口（旧配置兼容）</summary>
              <div style="display:grid;gap:6px;padding-top:7px;">
                <input id="rh_independent_base" class="text_pole" type="text" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="API 地址">
                <input id="rh_independent_key" class="text_pole" type="password" autocomplete="off" placeholder="API Key">
                <button id="rh_independent_use_manual" class="menu_button" type="button">改用这组手动接口</button>
              </div>
            </details>
            <div class="flex-container" style="gap:8px;flex-wrap:wrap;align-items:center;">
              <label>温度 <input id="rh_independent_temperature" class="text_pole" type="number" min="0" max="2" step="0.1" style="width:82px;"></label>
              <label>最大输出 <input id="rh_independent_max_tokens" class="text_pole" type="number" min="512" max="32000" step="256" style="width:110px;"></label>
            </div>
            <label class="checkbox_label"><input id="rh_independent_read_global_world_info" type="checkbox"> 读取世界书</label>
            <div class="rabbit-mirror-subnote" style="margin:-4px 0 4px 26px;opacity:.68;font-size:11px;line-height:1.45;">进入当前角色聊天后，优先显示酒馆为当前聊天加载过的角色／聊天／Persona／当前全局世界书；真正发送时仍只复用主生成本轮实际激活的条目，不会重新扫描或重掷概率。</div>
            <div style="margin:7px 0 2px 26px;font-size:11px;font-weight:700;opacity:.8;">当前聊天相关世界书</div>
            <div id="rh_world_info_book_filters" style="margin:4px 0 8px 26px;padding:7px 9px;border:1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 45%, transparent);border-radius:8px;max-height:180px;overflow:auto;"><div style="font-size:11px;line-height:1.4;opacity:.66;">打开此设置区域时自动显示当前聊天相关世界书。</div></div>
            <details id="rh_world_info_all_books" style="margin:4px 0 8px 26px;">
              <summary style="cursor:pointer;font-size:11px;opacity:.76;">更多：从全部世界书中选择（折叠）</summary>
              <div class="flex-container" style="gap:7px;flex-wrap:wrap;align-items:center;margin:7px 0 0;">
                <button id="rh_world_info_books_fetch" class="menu_button" type="button">拉取全部世界书</button>
                <span id="rh_world_info_books_fetch_status" style="opacity:.66;font-size:11px;">未拉取</span>
              </div>
              <div id="rh_world_info_all_book_filters" style="margin-top:7px;padding:7px 9px;border:1px solid color-mix(in srgb, var(--SmartThemeBorderColor) 45%, transparent);border-radius:8px;max-height:260px;overflow:auto;"><div style="font-size:11px;line-height:1.4;opacity:.66;">折叠时不创建完整世界书列表；展开后按需渲染。</div></div>
            </details>
            <div style="opacity:.72;font-size:11px;line-height:1.45;">温度建议 <b>1.0</b>；想更稳可用 0.9～1.1。</div>
            <div id="rh_independent_api_diagnostic" aria-live="polite" style="padding:7px 9px;border-left:2px solid color-mix(in srgb, var(--SmartThemeBorderColor) 65%, transparent);opacity:.78;font-size:11px;line-height:1.5;word-break:break-word;">最近请求：暂无记录</div>
            <div style="opacity:.66;font-size:11px;line-height:1.45;">一键配置时不保存 API Key；旧手动模式仍按原逻辑保存在当前 SillyTavern 扩展设置里。</div>
          </div>
        </div>
      </details>


      <div id="rh_token_meter" class="rabbit-mirror-token-meter" aria-live="polite">
        <div class="rabbit-mirror-token-meter-head">
          <b>本轮兔子镜 Token</b>
          <span data-rh-token-meter-main>尚无生成记录</span>
        </div>
        <div data-rh-token-meter-exact class="rabbit-mirror-token-meter-exact">下一轮生成后更新。</div>
        <div data-rh-token-meter-detail class="rabbit-mirror-token-meter-detail">只统计兔子镜自己的 Prompt。</div>
        <div class="rabbit-mirror-token-meter-note">Token 是估算值。</div>
      </div>

      <details class="rabbit-mirror-section">
        <summary><span>生成设置</span><span class="rabbit-mirror-section-note">抽取・视觉・冷却</span></summary>
        <div class="rabbit-mirror-section-content">
          <label for="rh_sampling_mode" class="flex-container alignitemscenter" style="gap:8px;flex-wrap:wrap;margin:8px 0;">
            <span>抽取模式</span>
            <select id="rh_sampling_mode" class="text_pole" style="max-width:260px;">
              <option value="classic">主题元素 + 展现形式（经典模式）</option>
              <option value="format_only">仅展现形式</option>
            </select>
          </label>

          <label for="rh_raw_policy" class="flex-container alignitemscenter" style="gap:8px;flex-wrap:wrap;margin:8px 0;">
            <span>参考内容</span>
            <select id="rh_raw_policy" class="text_pole" style="max-width:300px;">
              <option value="compact">精简：Prompt 较短，Token 较少</option>
              <option value="balanced">均衡：Prompt 长度适中（默认）</option>
              <option value="full">完整：Prompt 较长，参考内容更多</option>
            </select>
          </label>
          <div class="rabbit-mirror-subnote" style="margin:-4px 0 8px 0;opacity:.72;font-size:12px;line-height:1.45;">越完整，参考越多，Token 也越高。</div>

          <label class="checkbox_label"><input id="rh_creative_expansion" type="checkbox"> 更随机（测试版）</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">更随机，结果也更跳。</div>

          <label class="checkbox_label"><input id="rh_force_visual_scenery" type="checkbox"> 动态视觉场景</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">每轮固定使用动态视觉场景。</div>

          <label class="checkbox_label"><input id="rh_user_directive" type="checkbox"> 允许点菜</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">允许你直接点菜。</div>

          <label class="checkbox_label"><input id="rh_worldview_lock" type="checkbox"> 自动适配世界观</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 6px 26px;opacity:.72;font-size:12px;line-height:1.45;">保留玩法，把不合世界观的载体换成合适版本。</div>

          <label class="checkbox_label"><input id="rh_avoid_repeat" type="checkbox"> 避免最近 10 轮重复</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 2px 26px;opacity:.72;font-size:12px;line-height:1.45;">尽量避开最近 10 轮相似主题和画面。</div>

          <div style="margin-top:12px;padding-top:10px;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent);">
            <label class="checkbox_label" style="font-weight:700;"><input id="rh_blacklist_enabled" type="checkbox"> 🚫 启用黑名单</label>
            <div class="rabbit-mirror-subnote" style="margin:-2px 0 7px 26px;opacity:.76;font-size:12px;line-height:1.5;">黑名单排除随机项；收藏提高随机权重。都不增加 Prompt Token。</div>
            <div id="rh_blacklist_summary" class="rabbit-mirror-blacklist-summary" style="padding:8px 9px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:8px;font-size:11px;line-height:1.45;"></div>
            <button id="rh_blacklist_clear" class="menu_button" type="button" style="margin-top:7px;">清空全部黑名单</button>
          </div>
        </div>
      </details>

      <details class="rabbit-mirror-section rabbit-mirror-visual-prompt-test">
        <summary><span>自定义视觉</span><span class="rabbit-mirror-section-note">TEST</span></summary>
        <div class="rabbit-mirror-section-content">
          <div style="opacity:.82;font-size:12px;line-height:1.55;margin-bottom:9px;">写你想要或不想要的画面。打开下面的开关后才会发给模型。</div>
          <label class="checkbox_label" style="font-weight:700;"><input id="rh_visual_prompt_enabled" type="checkbox"> 启用自定义视觉</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 8px 26px;opacity:.76;font-size:12px;line-height:1.5;">关闭时只保存，不发送；打开后从下一面生效。</div>
          <div id="rh_visual_prompt_status" style="padding:7px 9px;border:1px solid color-mix(in srgb, currentColor 18%, transparent);border-radius:8px;opacity:.82;font-size:11px;line-height:1.45;margin-bottom:10px;">正在读取…</div>

          <label for="rh_visual_extra_prompt" style="display:block;font-weight:700;margin:8px 0 5px;">想要的视觉（可选）</label>
          <textarea id="rh_visual_extra_prompt" class="text_pole" rows="5" maxlength="${VISUAL_EXTRA_PROMPT_MAX_CHARS}" spellcheck="false" placeholder="例如：真实纸张拼贴、暖光、杂志排版" style="width:100%;min-height:100px;resize:vertical;box-sizing:border-box;line-height:1.5;"></textarea>
          <div style="opacity:.68;font-size:11px;line-height:1.45;margin:5px 0 10px;">写几个关键词或一句话即可。上限 ${VISUAL_EXTRA_PROMPT_MAX_CHARS} 字符。</div>

          <label for="rh_visual_avoid_prompt" style="display:block;font-weight:700;margin:10px 0 5px;">不希望出现的视觉（可选）</label>
          <textarea id="rh_visual_avoid_prompt" class="text_pole" rows="4" maxlength="${VISUAL_AVOID_PROMPT_MAX_CHARS}" spellcheck="false" placeholder="例如：不要荧光渐变、蓝白系统 UI、统一圆角卡片、廉价塑料感……" style="width:100%;min-height:88px;resize:vertical;box-sizing:border-box;line-height:1.5;"></textarea>
          <div style="opacity:.68;font-size:11px;line-height:1.45;margin:5px 0 10px;">写不想看到的颜色、质感或排版。上限 ${VISUAL_AVOID_PROMPT_MAX_CHARS} 字符。</div>

          <details style="margin-top:10px;">
            <summary style="cursor:pointer;font-weight:700;">高级：修改默认视觉规则 <span style="font-weight:400;opacity:.62;font-size:11px;">通常无需修改</span></summary>
            <div style="padding-top:9px;">
              <div style="opacity:.72;font-size:11px;line-height:1.5;margin-bottom:7px;">想改默认视觉规则时再用这里。</div>
              <label for="rh_visual_prompt" style="display:block;font-weight:700;margin:8px 0 5px;">默认视觉规则</label>
              <textarea id="rh_visual_prompt" class="text_pole" rows="14" maxlength="${VISUAL_PROMPT_MAX_CHARS}" spellcheck="false" style="width:100%;min-height:230px;resize:vertical;box-sizing:border-box;line-height:1.5;"></textarea>
              <div style="opacity:.68;font-size:11px;line-height:1.45;margin:5px 0 8px;">会替换默认视觉规则。上限 ${VISUAL_PROMPT_MAX_CHARS} 字符。</div>
              <button id="rh_visual_prompt_reset" class="menu_button" type="button">恢复默认视觉规则</button>
            </div>
          </details>

          <div class="flex-container" style="gap:8px;flex-wrap:wrap;margin-top:12px;">
            <button id="rh_visual_prompt_save" class="menu_button" type="button">保存并从下一面生效</button>
          </div>
          <div style="opacity:.66;font-size:11px;line-height:1.45;margin-top:7px;">输入时不会自动保存，点上面的按钮才保存。</div>
        </div>
      </details>

      <details class="rabbit-mirror-section rabbit-mirror-memory-test">
        <summary><span>共同回忆资料来源</span><span class="rabbit-mirror-section-note">TEST</span></summary>
        <div class="rabbit-mirror-section-content">
          <label class="checkbox_label"><input id="rh_memory_scan_enabled" type="checkbox"> 启用额外资料来源（实验性）</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 8px 26px;opacity:.76;font-size:12px;line-height:1.45;">开启后可使用额外回忆资料；只有用到时才增加 Token。</div>
          <button id="rh_memory_scan_now" class="menu_button" type="button">扫描可用资料来源</button>
          <div style="margin-top:6px;opacity:.68;font-size:11px;line-height:1.45;">查找可用的记忆资料来源。</div>
          <div id="rh_memory_scan_results" style="margin-top:8px;"></div>
        </div>
      </details>

      <details class="rabbit-mirror-section rabbit-mirror-emergency rabbit-mirror-emergency-prominent">
        <summary><span>反馈、急救与诊断</span><span class="rabbit-mirror-section-note">按需使用</span></summary>
        <div class="rabbit-mirror-section-content">
          <label class="checkbox_label" style="font-weight:700;"><input id="rh_feedback_cat" type="checkbox"> 🐈 启用挨打猫</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 8px 26px;opacity:.78;font-size:12px;line-height:1.5;">用于纠正兔子镜的美化效果；仅在实际提交美化反馈时增加额外 Token。</div>
          <label class="checkbox_label" style="font-weight:700;"><input id="rh_maintenance_rabbit" type="checkbox"> 🐇 启用维修兔</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 6px 26px;opacity:.78;font-size:12px;line-height:1.5;">兔子镜出问题时，可使用维修兔进行检查和修复；维修兔本身不会增加模型 Token。</div>
          <label class="checkbox_label" style="font-weight:700;"><input id="rh_maintenance_auto_safe" type="checkbox"> 🧪 维修兔自动巡逻（实验性）</label>
          <div class="rabbit-mirror-subnote" style="margin:-2px 0 8px 26px;opacity:.78;font-size:12px;line-height:1.5;">新生成的兔子镜会自动修常见小问题；复杂问题仍需手动修。</div>
        </div>
      </details>

      <details class="rabbit-mirror-section rabbit-mirror-tools">
        <summary><span>工具与维护</span><span class="rabbit-mirror-section-note">正则・清理・重置</span></summary>
        <div class="rabbit-mirror-section-content">
          <div class="rabbit-mirror-regex-helper">
            <div style="font-weight:600;margin-bottom:6px;">不发送小剧场正则</div>
            <div style="opacity:.82;font-size:12px;margin-bottom:8px;">设置：替换留空／勾选 AI输出／勾选 仅格式提示词</div>
            <button id="rh_copy_regex" class="menu_button" type="button">复制推荐正则</button>
          </div>

          <div class="rabbit-mirror-actions">
            <button id="rh_clear_last" class="menu_button">清除抽签历史与冷却记录</button>
            <button id="rh_clear_injection" class="menu_button">清空当前注入</button>
            <button id="rh_reset" class="menu_button">恢复默认设置</button>
          </div>
        </div>
      </details>

    </div>
  </div>
</div>`;

    settingsMount.append(html);
    attachTokenMeterListener();
    renderTokenMeter();

    checked('#rh_enabled', settings.autoRabbitMirrorInjection !== false && settings.enabled !== false);
    $(`input[name="rh_generation_source"][value="${settings.generationSource || 'follow'}"]`).prop('checked', true);
    $(`input[name="rh_follow_display"][value="${settings.followDisplayMode || 'inline'}"]`).prop('checked', true);
    $(`input[name="rh_independent_display"][value="${settings.independentDisplayMode || 'external'}"]`).prop('checked', true);
    $('#rh_independent_base').val(settings.independentApiBaseUrl || '');
    $('#rh_independent_key').val(settings.independentApiKey || '');
    $('#rh_independent_temperature').val(settings.independentApiTemperature ?? 0.8);
    $('#rh_independent_max_tokens').val(settings.independentApiMaxTokens ?? 12000);
    $('#rh_independent_model').val(settings.independentApiModel || '');
    const renderIndependentConnectionStatus = () => {
        const currentId=String(getSettings().independentConnectionProfileId||'').trim();
        const profile=getIndependentConnectionProfiles().find(item=>item.id===currentId);
        const target=$('#rh_independent_connection_status');
        if(!currentId){ target.text('当前：手动接口 / 尚未一键配置'); return; }
        if(!profile){ target.text('当前连接已失效，请重新一键配置'); return; }
        target.text(`当前：${profile.name}${profile.model?` · ${profile.model}`:''}`);
    };
    renderIndependentConnectionStatus();
    checked('#rh_independent_read_global_world_info', settings.independentReadGlobalWorldInfo === true);
    installWorldInfoBookVisibilityObserver();
    const syncGenerationModeFields = () => { const independent = getSettings().generationSource === 'independent'; $('#rh_independent_api_fields').toggle(independent); $('#rh_follow_display_row').toggle(!independent); };
    syncGenerationModeFields();
    renderIndependentApiDiagnostic();
    try { globalThis.__rabbitMirrorIndependentApiDiagnosticUiCleanup?.(); } catch {}
    const independentDiagnosticListener = event => { renderIndependentApiDiagnostic(event?.detail || null); };
    globalThis.addEventListener?.(API_REQUEST_DIAGNOSTIC_EVENT, independentDiagnosticListener);
    globalThis.__rabbitMirrorIndependentApiDiagnosticUiCleanup = () => globalThis.removeEventListener?.(API_REQUEST_DIAGNOSTIC_EVENT, independentDiagnosticListener);
    try { globalThis.__rabbitMirrorWorldInfoBooksUiCleanup?.(); } catch {}
    const worldInfoBooksListener = () => scheduleWorldInfoBookSettingsRender();
    globalThis.addEventListener?.(WORLD_INFO_BOOKS_CHANGED_EVENT, worldInfoBooksListener);
    globalThis.__rabbitMirrorWorldInfoBooksUiCleanup = () => globalThis.removeEventListener?.(WORLD_INFO_BOOKS_CHANGED_EVENT, worldInfoBooksListener);
    try { globalThis.__rabbitMirrorBlacklistUiCleanup?.(); } catch {}
    const blacklistListener = () => { checked('#rh_blacklist_enabled', getSettings().blacklistEnabled !== false); renderBlacklistSettings(); };
    globalThis.addEventListener?.(BLACKLIST_CHANGED_EVENT, blacklistListener);
    globalThis.__rabbitMirrorBlacklistUiCleanup = () => globalThis.removeEventListener?.(BLACKLIST_CHANGED_EVENT, blacklistListener);
    checked('#rh_feedback_cat', settings.feedbackCatEnabled);
    checked('#rh_maintenance_rabbit', settings.maintenanceRabbitEnabled);
    checked('#rh_maintenance_auto_safe', settings.maintenanceRabbitAutoSafeEnabled);
    $('#rh_sampling_mode').val(settings.samplingMode || 'classic');
    $('#rh_raw_policy').val(settings.rawPolicy || 'balanced');
    checked('#rh_user_directive', settings.userDirectivePriority);
    checked('#rh_worldview_lock', settings.presentationWorldviewLock === true);
    checked('#rh_creative_expansion', settings.creativeExpansionMode);
    checked('#rh_force_visual_scenery', settings.forceVisualScenery);
    checked('#rh_avoid_repeat', settings.avoidRepeat);
    checked('#rh_blacklist_enabled', settings.blacklistEnabled !== false);
    renderBlacklistSettings();
    checked('#rh_memory_scan_enabled', settings.memoryScanEnabled);
    checked('#rh_visual_prompt_enabled', settings.visualPromptEditingEnabled);
    $('#rh_visual_prompt').val(settings.visualPrompt ?? DEFAULT_VISUAL_PROMPT);
    $('#rh_visual_extra_prompt').val(settings.visualExtraPrompt || '');
    $('#rh_visual_avoid_prompt').val(settings.visualAvoidPrompt || '');
    renderVisualPromptStatus(settings);

    $('input[name="rh_generation_source"]').on('change', e => {
        const generationSource = e.target.value === 'independent' ? 'independent' : 'follow';
        updateSettings({ generationSource });
        clearRabbitMirrorPrompt(generationSource === 'independent' ? 'independent-api' : 'mode-change');
        syncGenerationModeFields();
        refreshRabbitMirrorGenerationMode();
        toastr?.info?.(generationSource === 'independent' ? '已切换为独立 API。' : '已切换为跟随当前 API。');
    });
    $('input[name="rh_follow_display"]').on('change', e => { updateSettings({ followDisplayMode: e.target.value === 'external' ? 'external' : 'inline' }); refreshRabbitMirrorGenerationMode(); });
    $('input[name="rh_independent_display"]').on('change', e => { updateSettings({ independentDisplayMode: e.target.value === 'external_then_inline' ? 'external_then_inline' : 'external' }); refreshRabbitMirrorGenerationMode(); });
    $('#rh_independent_read_global_world_info').on('change', e => {
        updateSettings({ independentReadGlobalWorldInfo: e.target.checked === true });
        toastr?.info?.(e.target.checked ? '已开启世界书读取，从下一轮生效。' : '已关闭世界书读取，从下一轮生效。');
    });
    $('#rh_world_info_all_books').on('toggle', function () {
        if (this.open) renderWorldInfoBookSettings({ current: false, all: true });
        else clearCollapsedAllWorldInfoBookRows();
    });
    $('#rh_world_info_books_fetch').on('click', async function () {
        const button = $(this);
        const status = $('#rh_world_info_books_fetch_status');
        button.prop('disabled', true);
        status.text('正在拉取…');
        try {
            pulledWorldInfoBooks = await fetchWorldInfoBooks();
            renderWorldInfoBookSettings({ current: false, all: true });
            status.text(`已拉取 ${pulledWorldInfoBooks.length} 本`);
            toastr?.success?.(`已拉取 ${pulledWorldInfoBooks.length} 本世界书；列表保留在折叠区内`);
        } catch (error) {
            pulledWorldInfoBooks = [];
            renderWorldInfoBookSettings({ current: false, all: true });
            const message = String(error?.message || error);
            status.text(message.includes('超时') ? '拉取超时' : '拉取失败');
            toastr?.warning?.(message);
        } finally {
            button.prop('disabled', false);
        }
    });
    $('#rh_world_info_book_filters, #rh_world_info_all_book_filters').on('change', '.rh-world-info-book-toggle', function () {
        const index = Number($(this).attr('data-book-index'));
        const container = $(this).closest('#rh_world_info_book_filters, #rh_world_info_all_book_filters');
        const books = container.data('rm-world-info-books') || [];
        const name = String(books[index] || '').trim();
        if (!name) return;
        const nextDisabled = new Set(getSettings().independentWorldInfoDisabledBooks || []);
        if (this.checked) nextDisabled.delete(name);
        else nextDisabled.add(name);
        updateSettings({ independentWorldInfoDisabledBooks: [...nextDisabled] });
        $('.rh-world-info-book-toggle').each(function () {
            if (String($(this).attr('data-book-id') || '') === name) $(this).prop('checked', !nextDisabled.has(name));
        });
        const safeName = escapeHtml(name);
        toastr?.info?.(this.checked ? `已开启「${safeName}」。` : `已关闭「${safeName}」。`);
    });
    $('#rh_independent_import_current').on('click', async function () {
        const button=$(this); button.prop('disabled',true);
        try {
            const imported=await importCurrentSillyTavernConnection();
            const fresh=getSettings();
            $('#rh_independent_model').val(fresh.independentApiModel||imported?.model||'');
            renderIndependentConnectionStatus();
            const savedModels=getIndependentSavedModels();
            renderIndependentModelSelect(savedModels,String($('#rh_independent_model').val()||''));
            refreshRabbitMirrorGenerationMode();
            toastr?.success?.(`已一键配置酒馆连接：${String(imported?.name||'当前连接')}`);
        } catch(error) {
            toastr?.error?.(`一键配置失败：${String(error?.message||error)}`);
        } finally { button.prop('disabled',false); }
    });
    $('#rh_independent_use_manual').on('click', () => {
        const temperature=Number($('#rh_independent_temperature').val());
        const maxTokens=Number($('#rh_independent_max_tokens').val());
        updateSettings({
            independentConnectionProfileId:'',
            independentApiBaseUrl:$('#rh_independent_base').val(),
            independentApiKey:$('#rh_independent_key').val(),
            independentApiModel:$('#rh_independent_model').val(),
            independentApiTemperature:Number.isFinite(temperature)?temperature:0.8,
            independentApiMaxTokens:Number.isFinite(maxTokens)&&maxTokens>0?maxTokens:12000,
        });
        renderIndependentConnectionStatus();
        refreshRabbitMirrorGenerationMode();
        toastr?.info?.('已切换为旧手动 OpenAI 兼容接口。');
    });
    const saveIndependentFields = () => {
        const temperature = Number($('#rh_independent_temperature').val());
        const maxTokens = Number($('#rh_independent_max_tokens').val());
        updateSettings({
            independentApiBaseUrl: $('#rh_independent_base').val(),
            independentApiKey: $('#rh_independent_key').val(),
            independentApiModel: $('#rh_independent_model').val(),
            independentApiTemperature: Number.isFinite(temperature) ? temperature : 0.8,
            independentApiMaxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 12000,
        });
    };
    // Do not serialize the whole extension settings object on every mobile input event.
    // Safari may emit repeated input/autofill events as the drawer opens, which made the UI stutter.
    $('#rh_independent_base, #rh_independent_key, #rh_independent_model').on('change blur', saveIndependentFields);
    $('#rh_independent_temperature, #rh_independent_max_tokens').on('change', saveIndependentFields);
    const renderIndependentModelSelect = (models, currentModel='') => {
        const select=$('#rh_independent_model_select');
        const current=String(currentModel||'').trim();
        select.empty().append($('<option>').val('').text(models.length ? `已拉取 ${models.length} 个模型，请选择` : '先点击“拉取模型”获取完整列表'));
        for(const id of models){
            select.append($('<option>').val(id).text(id));
        }
        // 只有当前手动模型确实存在于列表时才选中；自定义 ID 保持在文本框，不伪装成列表项。
        select.val(models.includes(current) ? current : '');
    };
    $('#rh_independent_model_select').on('change', e => {
        const model=String(e.target.value||'').trim();
        if(!model) return;
        $('#rh_independent_model').val(model);
        updateSettings({independentApiModel:model});
    });
    $('#rh_independent_model').on('change blur', () => {
        const current=String($('#rh_independent_model').val()||'').trim();
        const select=$('#rh_independent_model_select');
        const exists=select.find('option').toArray().some(option=>String(option.value||'')===current);
        select.val(exists ? current : '');
    });
    $('#rh_independent_models').on('click', async function () {
        saveIndependentFields();
        const button=$(this); const originalText=button.text();
        const current=String($('#rh_independent_model').val() || getSettings().independentApiModel || '').trim();
        const savedModels=getIndependentSavedModels();
        button.prop('disabled',true).text('正在拉取…');
        if(savedModels.length) renderIndependentModelSelect(savedModels,current);
        try {
            const models=await fetchIndependentModels();
            renderIndependentModelSelect(models,current);
            if(current) {
                $('#rh_independent_model').val(current);
            } else if(models[0]) {
                $('#rh_independent_model').val(models[0]);
                $('#rh_independent_model_select').val(models[0]);
                updateSettings({independentApiModel:models[0]});
            }
            toastr?.success?.(`已拉取 ${models.length} 个模型；完整列表已显示在模型下拉框中`);
        } catch(error) {
            // 远端 /models 卡住或失败时保留酒馆已保存模型与手动 ID，不让设置页无限等待。
            renderIndependentModelSelect(savedModels,current);
            if(current) $('#rh_independent_model').val(current);
            const fallbackText=savedModels.length ? `；已保留酒馆中已保存的 ${savedModels.length} 个模型` : '';
            toastr?.warning?.(`模型列表拉取失败${fallbackText}。${String(error?.message||error)}`);
        } finally {
            button.prop('disabled',false).text(originalText);
        }
    });
    $('#rh_independent_test').on('click', async () => {
        saveIndependentFields();
        const result=await testIndependentConnection();
        if(result.verified) {
            toastr?.success?.(`模型列表端点可用；检测到 ${result.models.length} 个模型`);
            return;
        }
        const manualModel=String($('#rh_independent_model').val() || result.manualModel || '').trim();
        toastr?.[manualModel ? 'warning' : 'error']?.(manualModel
            ? `无法用 /models 验证；已保留模型「${manualModel}」。可直接生成测试。${result.error}`
            : `连接检测未通过：${result.error}`);
    });

    $('#rh_enabled').on('change', e => { updateSettings({ enabled: e.target.checked, autoRabbitMirrorInjection: e.target.checked, mode: e.target.checked ? 'integrated' : 'off' }); if (e.target.checked) syncFeedbackCatExtensionPrompt(getActiveFeedbackForCurrentChat()); else clearFeedbackCatExtensionPrompt(); refreshRabbitMirrorGenerationMode(); });
    $('#rh_feedback_cat').on('change', e => {
        updateSettings({ feedbackCatEnabled: e.target.checked });
        if (e.target.checked) syncFeedbackCatExtensionPrompt(getActiveFeedbackForCurrentChat());
        else clearFeedbackCatExtensionPrompt();
        refreshFeedbackCats();
        toastr?.[e.target.checked ? 'info' : 'success']?.(e.target.checked
            ? '挨打猫已启用：每条兔子镜会显示独立的 🐈，没有反馈时不会追加 Prompt。'
            : '挨打猫已关闭：标题入口已移除，已保存反馈暂停注入。');
    });
    $('#rh_maintenance_rabbit').on('change', e => {
        const enabled = !!e.target.checked;
        updateSettings({
            maintenanceRabbitEnabled: enabled,
            ...(enabled ? {} : { maintenanceRabbitAutoSafeEnabled: false }),
        });
        if (!enabled) {
            checked('#rh_maintenance_auto_safe', false);
            configureMaintenanceAutoSafeMode(false);
        }
        refreshMaintenanceRabbits();
        toastr?.[enabled ? 'info' : 'success']?.(enabled
            ? '维修兔已启用：每条兔子镜会显示独立的 🐇⚪；默认仍为手动巡逻。'
            : '维修兔已关闭：自动巡逻同时关闭，标题入口已移除。');
    });
    $('#rh_maintenance_auto_safe').on('change', e => {
        const enabled = !!e.target.checked;
        if (enabled) checked('#rh_maintenance_rabbit', true);
        updateSettings({
            maintenanceRabbitEnabled: enabled ? true : getSettings().maintenanceRabbitEnabled,
            maintenanceRabbitAutoSafeEnabled: enabled,
        });
        configureMaintenanceAutoSafeMode(enabled);
        refreshMaintenanceRabbits();
        toastr?.[enabled ? 'info' : 'success']?.(enabled
            ? '自动巡逻已开启，只自动修简单问题。'
            : '自动巡逻已关闭：维修兔恢复为纯手动模式。');
    });

    $('#rh_visual_prompt_enabled').on('change', e => {
        const enabled = !!e.target.checked;
        updateSettings({ visualPromptEditingEnabled: enabled });
        renderVisualPromptStatus(getSettings());
        toastr?.[enabled ? 'info' : 'success']?.(enabled
            ? '视觉提示词编辑注入已启用：从下一面兔子镜开始使用已保存的可编辑视觉层。'
            : '自定义视觉已关闭；从下一面恢复默认规则。');
    });

    $('#rh_visual_prompt_save').on('click', () => {
        const visualPrompt = String($('#rh_visual_prompt').val() ?? '').replace(/\r\n?/g, '\n').slice(0, VISUAL_PROMPT_MAX_CHARS);
        const visualExtraPrompt = String($('#rh_visual_extra_prompt').val() ?? '').replace(/\r\n?/g, '\n').slice(0, VISUAL_EXTRA_PROMPT_MAX_CHARS);
        const visualAvoidPrompt = String($('#rh_visual_avoid_prompt').val() ?? '').replace(/\r\n?/g, '\n').slice(0, VISUAL_AVOID_PROMPT_MAX_CHARS);
        updateSettings({ visualPrompt, visualExtraPrompt, visualAvoidPrompt });
        renderVisualPromptStatus(getSettings());
        const total = visualPrompt.length + visualExtraPrompt.length + visualAvoidPrompt.length;
        if (getSettings().visualPromptEditingEnabled && !visualPrompt.trim()) {
            toastr?.warning?.(`已保存（${total} 字符），但默认视觉规则是空的；建议恢复默认。`);
        } else {
            toastr?.success?.(getSettings().visualPromptEditingEnabled
                ? `视觉提示词已保存（${total} 字符），编辑注入已开启，将从下一面兔子镜开始生效。`
                : `视觉提示词已保存（${total} 字符），但编辑注入当前关闭；不会发送给模型。`);
        }
    });
    $('#rh_visual_prompt_reset').on('click', () => {
        $('#rh_visual_prompt').val(DEFAULT_VISUAL_PROMPT);
        updateSettings({ visualPrompt: DEFAULT_VISUAL_PROMPT });
        renderVisualPromptStatus(getSettings());
        toastr?.success?.('已恢复默认视觉规则；额外视觉偏好与避雷内容保持不变。');
    });

    $('#rh_memory_scan_enabled').on('change', e => {
        updateSettings({ memoryScanEnabled: e.target.checked });
        toastr?.[e.target.checked ? 'info' : 'success']?.(e.target.checked
            ? '已开启共同回忆额外资料读取：只有抽中 I.1 时才会读取已勾选来源。'
            : '已关闭额外资料读取；扫描结果和勾选记录会保留。');
    });
    $('#rh_memory_scan_now').on('click', () => {
        const results = scanMemoryPlugins();
        renderMemoryScanResults(results);
        const readableCount = results.filter(item => item.readable).length;
        const pendingCount = results.length - readableCount;
        toastr?.info?.(`扫描完成：${readableCount} 个可读取${pendingCount ? `，${pendingCount} 个其他候选已收起` : ''}。`);
    });
    $('#rh_memory_scan_results').on('change', '.rh-memory-provider-check', function () {
        const id = String($(this).data('provider-id') || '');
        const current = new Set(getSettings().memoryProviderIds || []);
        if (this.checked) current.add(id); else current.delete(id);
        updateSettings({ memoryProviderIds: [...current] });
    });
    $('#rh_memory_scan_results').on('click', '.rh-memory-test', function () {
        const id = String($(this).data('provider-id') || '');
        const result = testMemoryProvider(id);
        if (result.ok) toastr?.success?.(memoryTestMessage(result));
        else toastr?.error?.(memoryTestMessage(result));
    });

    $('#rh_sampling_mode').on('change', e => updateSettings({ samplingMode: e.target.value }));
    $('#rh_raw_policy').on('change', e => updateSettings({ rawPolicy: e.target.value }));
    $('#rh_user_directive').on('change', e => updateSettings({ userDirectivePriority: e.target.checked }));
    $('#rh_worldview_lock').on('change', e => {
        updateSettings({ presentationWorldviewLock: e.target.checked });
        toastr?.info?.(e.target.checked
            ? '自动适配世界观已开启：非 IF 主题会把不合世界观的具体载体转换为等价载体。'
            : '自动适配世界观已关闭。');
    });
    $('#rh_creative_expansion').on('change', e => updateSettings({ creativeExpansionMode: e.target.checked }));
    $('#rh_force_visual_scenery').on('change', e => updateSettings({ forceVisualScenery: e.target.checked }));
    $('#rh_avoid_repeat').on('change', e => updateSettings({ avoidRepeat: e.target.checked }));
    $('#rh_blacklist_enabled').on('change', e => {
        setBlacklistEnabled(e.target.checked);
        renderBlacklistSettings();
        refreshRecipeButtons();
        toastr?.info?.(e.target.checked ? '黑名单已开启。' : '黑名单已暂停，名单仍保留。');
    });
    $('#rh_blacklist_summary').on('click', '.rh-blacklist-remove', function () {
        const kind = String($(this).data('kind') || '') === 'format' ? 'format' : 'theme';
        const id = String($(this).data('id') || '');
        if (removeBlacklistItem(kind, id)) toastr?.success?.(`已解除黑名单：${id}`);
        renderBlacklistSettings();
        refreshRecipeButtons();
    });
    $('#rh_blacklist_clear').on('click', () => {
        clearBlacklist('all');
        renderBlacklistSettings();
        refreshRecipeButtons();
        toastr?.success?.('已清空全部抽签黑名单');
    });

    $('#rh_copy_regex').on('click', async () => {
        try {
            await navigator.clipboard.writeText(noSendRegex);
            toastr?.success?.('已复制推荐正则');
        } catch (error) {
            const textarea = document.createElement('textarea');
            textarea.value = noSendRegex;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
            toastr?.success?.('已复制推荐正则');
        }
    });

    $('#rh_clear_last').on('click', () => {
        clearLastCombo();
        toastr?.success?.('已清除抽签历史与冷却记录');
    });
    $('#rh_clear_injection').on('click', () => {
        clearRabbitMirrorPrompt('manual');
        toastr?.success?.('已清空当前兔子镜注入');
    });
    // Memory-provider discovery can be expensive on mobile. Never rescan merely because
    // the settings drawer was mounted/opened; scan only from the explicit button.
    if (settings.memoryScanEnabled || (settings.memoryProviderIds || []).length) {
        $('#rh_memory_scan_results').html('<div style="padding:8px 0;opacity:.68;font-size:11px;line-height:1.45;">已保存资料来源设置。需要刷新列表时请点击“扫描可用资料来源”。</div>');
    }

    $('#rh_reset').on('click', () => {
        resetSettings();
        location.reload();
    });
}

export function destroyRabbitMirrorUI() {
    if (uiMountRetryTimer) {
        clearTimeout(uiMountRetryTimer);
        uiMountRetryTimer = 0;
    }
    uiMountRetryCount = 0;
    try { globalThis.__rabbitMirrorTokenMeterUiCleanup?.(); } catch {}
    try { globalThis.__rabbitMirrorBlacklistUiCleanup?.(); } catch {}
    globalThis.__rabbitMirrorBlacklistUiCleanup = null;
    globalThis.__rabbitMirrorTokenMeterUiCleanup = null;
    try { globalThis.__rabbitMirrorIndependentApiDiagnosticUiCleanup?.(); } catch {}
    globalThis.__rabbitMirrorIndependentApiDiagnosticUiCleanup = null;
    try { globalThis.__rabbitMirrorWorldInfoBooksUiCleanup?.(); } catch {}
    globalThis.__rabbitMirrorWorldInfoBooksUiCleanup = null;
    clearWorldInfoBookRenderTimer();
    disconnectWorldInfoBookVisibilityObserver();
    worldInfoBookCurrentDirty = true;
    $('#rabbit_mirror_theater_settings').remove();
}
