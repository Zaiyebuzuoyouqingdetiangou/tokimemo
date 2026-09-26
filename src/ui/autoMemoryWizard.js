// 自动留忆向导挂在插件窗口里。关闭窗口不取消已经开始的建档或任务队列，也不锁酒馆输入框。
import * as archive_external from '../archive/externalMemory.js';
import * as archive_repository from '../archive/repository.js';
import * as auto_memory_migrate from '../autoMemory/migrateLegacy.js';
import * as auto_memory_plan from '../autoMemory/planStore.js';
import * as wizard_plan from '../autoMemory/wizardPlan.js';
import * as core_autoUpdates from '../core/autoUpdates.js';
import * as core_cache from '../core/cache.js';
import * as core_chatReadRange from '../core/chatReadRange.js';
import * as core_context from '../core/context.js';
import * as core_independentApi from '../core/independentApi.js';
import * as core_settings from '../core/settings.js';
import * as core_text from '../core/text.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as cg_format_ui from './cgFormatControl.js';
import * as settings_parts from './settingsPanelParts.js';
import * as home_view from './homeView.js';
import * as ui_overlay from './overlay.js';
import * as participant_picker from './participantPicker.js';
import * as ui_taskCenter from './taskCenter.js';
import * as ui_workspaceState from './workspaceState.js';

let draft = null;
let step = 0;
let scope = '';
let showingSummary = false;
let guideDone = false;
let roster = null;
let rosterRevision = '';
let apiEditor = '';
let manualSaveTimer = 0;
let profileModels = [];
let manualModels = [];

function queueableIds() {
    return Object.entries(ui_workspaceState.WORKSPACE_ROUTES).filter(([route, spec]) => spec?.mode === route && !spec.deep && !spec.manualOnly
        && wizard_plan.wizardModuleCards([route]).some(item => item.id === route && item.queueable)).map(([route]) => route);
}

function liveContext() {
    return core_context.currentCharacterGuard();
}

function apiReport() {
    const settings = core_settings.getPluginSettings();
    const mode = settings.apiConnectionMode === 'manual' ? 'manual' : 'profile';
    let manualReady = false;
    let manualMessage = '';
    if (mode === 'manual') {
        try {
            core_independentApi.assertManualApiCredentialTransport(settings.manualApiBaseUrl, settings.manualApiKey);
            manualReady = !!core_text.normalizeText(settings.manualApiModel, 240);
            if (!manualReady) manualMessage = '请填写手动 API 的模型 ID。';
        } catch (error) {
            manualMessage = error?.safeToDisplay ? error.safeUserMessage : '手动 API 还没配好。';
        }
    }
    const profiles = core_settings.supportedConnectionProfiles();
    const profileConfigured = settings.connectionPoolEnabled === true
        ? (settings.connectionPoolIds || []).some(id => profiles.some(profile => profile.id === id))
        : !!settings.connectionProfileId;
    let profileReady = false;
    if (mode === 'profile' && profileConfigured) {
        try {
            core_independentApi.assertConnectionManagerProfileSupport(liveContext().ConnectionManagerRequestService);
            profileReady = true;
        } catch { profileReady = false; }
    }
    return wizard_plan.inspectAutoMemoryApi({ mode, manualReady, manualMessage, profileConfigured, profileReady });
}

function sourceScan(context) {
    const settings = core_settings.getPluginSettings(context);
    const preview = core_chatReadRange.readRangePreview(context, settings);
    const sources = archive_external.externalMemorySourceSummary(context);
    const summary = core_text.normalizeText(context.extensionPrompts?.['1_memory']?.value, 12000);
    const externalOn = settings.useCurrentChatExternalMemory !== false;
    const estimate = wizard_plan.archiveSegmentEstimate({
        chatCharacters: preview.characters,
        externalCharacters: externalOn ? summary.length : 0,
    });
    return { preview, sources, estimate, unknownExternal: externalOn && sources.some(item => item.id !== 'sillytavern-memory'), externalOn };
}

function cards() {
    return wizard_plan.wizardModuleCards(queueableIds());
}

function stepReady(context) {
    const name = wizard_plan.WIZARD_STEPS[step];
    if (name === 'api') return apiReport().ready;
    if (name === 'card') return draft.cardType === 'single' || draft.cardType === 'multiple';
    if (name === 'people') return draft.cardType === 'single' || (draft.cardType === 'multiple' && draft.participantConfirmed);
    if (name === 'interval') return wizard_plan.normalizeInterval(draft.intervalFloors).ok;
    if (name === 'sources') return !!sourceScan(context);
    return true;
}

const STEP_TITLES = Object.freeze({
    api: '接上 API',
    card: '单人还是多人',
    people: '人物名单',
    sources: '读取范围',
    image: 'CG 生图',
    archive: '建档预计',
    modules: '留下哪些回忆',
    offer: '要不要自动留忆',
    interval: '自动间隔',
    run: '确认并开始',
});

const MODULE_ICON_PATH = Object.freeze({
    album: 'M4 6h16v13H4z M8 6V4h8v2 M7 11h10 M7 14h6',
    adv: 'M5 5h14v14H5z M8 9h8 M8 12h8 M8 15h5',
    room: 'M4 11 12 4 20 11 V20 H4z M10 20v-6h4v6',
    items: 'M4 8h16v11H4z M8 8V5h8v3',
    phone: 'M8 3h8v18H8z M11 18h2',
    inbox: 'M3 8h18v11H3z M3 8l9 6 9-6',
    cabinet: 'M4 4h16v16H4z M12 4v16 M4 12h16',
    travel: 'M4 16c4-8 12-8 16 0 M12 8v3',
    ending: 'M6 4h9l3 3v13H6z M15 4v3h3',
    calendar: 'M5 6h14v13H5z M5 10h14 M8 4v4 M16 4v4',
    relations: 'M8 8a3 3 0 1 0 .1 0 M16 8a3 3 0 1 0 .1 0 M8 16a3 3 0 1 0 .1 0 M8 11v2',
    heart: 'M12 19s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z',
    butterfly: 'M12 12c-4-6-9-5-9 0s5 6 9 0z M12 12c4-6 9-5 9 0s-5 6-9 0z',
    pastLives: 'M12 4a8 8 0 1 0 8 8 M12 8v5l3 2',
    themeSong: 'M9 17a2 2 0 1 0 .1 0 V8l8-2v8',
    bedtime: 'M6 16a6 6 0 0 1 10-4 4 4 0 0 0 2 8H6',
    timeEcho: 'M12 6a6 6 0 1 0 6 6 M12 8v4l3 2',
});

function stepTitle(name) {
    return STEP_TITLES[name] || '回忆向导';
}

function requestTag(item) {
    const plain = item.requestPlain || '';
    if (plain.startsWith('2 次')) return '2 次请求·分两步';
    if (plain.includes('没有新信')) return '1 次请求·没新信是 0 次';
    if (plain.startsWith('1 次')) return '1 次请求';
    return plain.replace(/。/g, '').slice(0, 24);
}

function firstBlockReason(item) {
    if (item.queueable) return '';
    const spec = ui_workspaceState.WORKSPACE_ROUTES[item.id];
    if (spec?.deep) return '要打开对应页面才能写，向导不能直接排进任务中心。';
    if (spec?.manualOnly) return '只能手动打开，向导不能直接排进任务中心。';
    return '向导没有单独的排队入口，这次不能先生成。';
}

function moduleIcon(id) {
    const path = MODULE_ICON_PATH[id] || 'M6 4h9l3 3v13H6z';
    return `<svg class="rmt-auto-card-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
}

function moduleHtml() {
    const rows = cards().filter(item => item.id !== 'achievements' && item.inDrawPool);
    const achievement = cards().find(item => item.id === 'achievements');
    const selectable = rows.filter(item => item.autoEligible);
    const allOn = selectable.length > 0 && selectable.every(item => wizard_plan.moduleSelected(draft, item.id));
    const lead = `<label class="rmt-auto-all"><input type="checkbox" data-rmt-auto-memory-all ${allOn ? 'checked' : ''}><span>全选自动生成</span></label><p class="rmt-auto-lead">每张卡是一份回忆。标签上的次数，是生成这一份要调用 API 几次。写着「分两步」的，要请求两次，合在一起才是一份完整回忆。勾上「自动生成」，到了间隔会从里面抽一份；取消的以后不会抽到。「这次先生成」会在结束时放进任务中心，不勾就留着，以后自己打开页面再生成。</p>`;
    const picks = rows.map(item => {
        const autoOn = item.autoEligible && wizard_plan.moduleSelected(draft, item.id);
        const autoDisabled = item.autoEligible ? '' : 'disabled';
        const autoReason = item.autoEligible ? '' : (item.unavailableReason || '暂不可自动生成');
        const block = firstBlockReason(item);
        const firstOn = !block && draft.firstModuleIds.includes(item.id);
        return `<article class="rmt-auto-card">${moduleIcon(item.id)}<div><h3>${core_text.esc(item.title)}</h3><p>${core_text.esc(item.audience)}</p><span class="rmt-auto-tag">${core_text.esc(requestTag(item))}</span></div><div class="rmt-auto-switches"><label class="rmt-auto-switch"><input type="checkbox" data-rmt-auto-memory-prefer="${core_text.esc(item.id)}" ${autoOn ? 'checked' : ''} ${autoDisabled}><span>自动生成</span></label><label class="rmt-auto-switch"><input type="checkbox" data-rmt-auto-memory-first="${core_text.esc(item.id)}" ${firstOn ? 'checked' : ''} ${block ? 'disabled' : ''}><span>这次先生成</span></label></div>${autoReason ? `<small class="rmt-auto-why">${core_text.esc(autoReason)}</small>` : ''}${block ? `<small class="rmt-auto-why">${core_text.esc(block)}</small>` : ''}</article>`;
    }).join('');
    const hint = achievement
        ? `<p class="rmt-auto-achieve">${core_text.esc(achievement.audience)}</p>`
        : '';
    return `${lead}<div class="rmt-auto-cards">${picks}</div>${hint}`;
}

function apiEditorMode() {
    if (apiEditor === 'manual' || apiEditor === 'profile') return apiEditor;
    return core_settings.getPluginSettings().apiConnectionMode === 'manual' ? 'manual' : 'profile';
}

function apiConnectHtml() {
    const report = apiReport();
    if (report.ready) return `<h2>API 就绪检查</h2><p>${core_text.esc(report.message)}</p>`;
    const settings = core_settings.getPluginSettings();
    const editor = apiEditorMode();
    const capability = core_settings.oneClickConnectionCapability();
    const profiles = core_settings.supportedConnectionProfiles();
    const profileOptions = [`<option value="">${profiles.length ? '选择已有连接' : '没有可用的连接'}</option>`]
        .concat(profiles.map(item => `<option value="${core_text.esc(item.id)}" ${item.id === settings.connectionProfileId ? 'selected' : ''}>${core_text.esc(item.name)}${item.model ? ` · ${core_text.esc(item.model)}` : ''}</option>`))
        .join('');
    const modelOptions = ['<option value="">使用配置里的默认模型</option>']
        .concat(profileModels.map(model => `<option value="${core_text.esc(model)}" ${model === settings.modelOverride ? 'selected' : ''}>${core_text.esc(model)}</option>`))
        .join('');
    const manualOptions = ['<option value="">选择已拉取的模型</option>']
        .concat(manualModels.map(model => `<option value="${core_text.esc(model)}">${core_text.esc(model)}</option>`))
        .join('');
    const keyPlaceholder = settings.manualApiSecretRef ? '已加密保存到本机；填写可替换' : settings.manualApiKey ? '本页已有 Key；填写可替换' : 'API Key（可留空）';
    return `<h2>先接上 API</h2><p>${core_text.esc(report.message)} ${core_text.esc(report.action)}</p><section class="rmt-auto-api"><div class="rmt-auto-api-modes" role="group" aria-label="API 连接方式"><button type="button" class="rmt-auto-api-mode${editor === 'profile' ? ' is-on' : ''}" data-rmt-auto-api-mode="profile" aria-pressed="${editor === 'profile' ? 'true' : 'false'}"><b>一键配置</b><small>读取酒馆当前连接</small></button><button type="button" class="rmt-auto-api-mode${editor === 'manual' ? ' is-on' : ''}" data-rmt-auto-api-mode="manual" aria-pressed="${editor === 'manual' ? 'true' : 'false'}"><b>手动配置</b><small>地址 · Key · 模型</small></button></div><p class="rmt-auto-api-note">${core_text.esc(capability.message)}</p><div class="rmt-auto-api-panel" data-rmt-auto-api-profile-panel ${editor === 'profile' ? '' : 'hidden'}><label class="rmt-auto-field"><span>连接</span><select data-rmt-auto-api-profile-id>${profileOptions}</select></label><div class="rmt-auto-api-row"><label class="rmt-auto-field"><span>模型</span><select data-rmt-auto-api-model>${modelOptions}</select></label><button type="button" class="rmt-btn" data-rmt-auto-api-model-refresh>刷新模型</button></div></div><div class="rmt-auto-api-panel" data-rmt-auto-api-manual-panel ${editor === 'manual' ? '' : 'hidden'}><label class="rmt-auto-field"><span>API 地址</span><input data-rmt-manual-api-base type="url" inputmode="url" placeholder="https://api.example.com/v1" value="${core_text.esc(settings.manualApiBaseUrl)}"></label><label class="rmt-auto-field"><span>API Key</span><span class="rmt-auto-api-row"><input data-rmt-manual-api-key type="password" autocomplete="new-password" placeholder="${core_text.esc(keyPlaceholder)}"><button type="button" class="rmt-btn" data-rmt-auto-api-key-clear>清除 Key</button></span></label><div class="rmt-auto-api-row"><label class="rmt-auto-field"><span>模型 ID</span><input data-rmt-manual-api-model type="text" placeholder="例如 gpt-4.1" value="${core_text.esc(settings.manualApiModel)}">${manualModels.length ? `<select data-rmt-manual-api-models>${manualOptions}</select>` : ''}</label><button type="button" class="rmt-btn" data-rmt-auto-api-manual-refresh>拉取模型</button></div><button type="button" class="rmt-btn rmt-auto-api-save" data-rmt-manual-api-save>保存并使用</button><p data-rmt-manual-save-status role="status">填写后会保存到本机，不随档案导出。</p></div></section>`;
}

function archivePresentNow(context) {
    try { return !!archive_repository.getImportedMemory(context); }
    catch { return false; }
}

function shouldSkipArchive(context) {
    return wizard_plan.wizardSkipsArchiveStep({
        archivePresent: archivePresentNow(context),
        cardChoiceDirty: draft?.cardChoiceDirty === true,
    });
}

function previewHtml(context) {
    const scan = sourceScan(context);
    const routes = wizard_plan.firstQueueRoutes(draft, queueableIds());
    const split = wizard_plan.splitRequestPreview(scan.estimate, routes);
    if (shouldSkipArchive(context)) draft.doArchive = false;
    const archiveRequests = draft.doArchive ? split.archiveRequests : 0;
    const moduleRequests = split.moduleEstimates.reduce((sum, item) => sum + wizard_plan.plainRequestCount(item.estimate), 0);
    const present = archivePresentNow(context);
    const archiveNote = draft.doArchive
        ? '建档次数和首次生成是分开算的。聊天正文按字数分段请求，不会按每个模块再乘一遍。'
        : present
            ? '当前聊天已经有档案，这次跳过建档，不会为建档再请求。'
            : '这次不建档，也不会为建档再请求。';
    const unknown = scan.unknownExternal ? '<small>还有未扫描的外部来源，上面的次数不含它们。</small>' : '';
    return `<article class="rmt-auto-summary"><strong>建档 ${archiveRequests} 次 · 首次生成 ${split.moduleCount} 项 · 大约 ${archiveRequests + moduleRequests} 次请求</strong><small>${core_text.esc(archiveNote)}</small>${unknown}<small>${core_text.esc(scan.preview.label)}</small></article>`;
}

function pageHtml(context) {
    const name = wizard_plan.WIZARD_STEPS[step];
    if (name === 'api') return apiConnectHtml();
    if (name === 'card') return `<h2>单人卡，还是一张卡里的多个人？</h2><p>原生群聊暂不支持。这里沿用现有的人物选择。</p><p>${draft.cardType === 'single' ? '已选单人卡。' : draft.cardType === 'multiple' ? '已选一张卡内多人。' : '还没有选择。'}</p><button type="button" class="rmt-btn" data-rmt-auto-memory-card="single">单人卡</button><button type="button" class="rmt-btn" data-rmt-auto-memory-card="multiple">一张卡内多人</button>`;
    if (name === 'people') return `<h2>人物名单</h2>${draft.cardType === 'single' ? '<p>单人卡沿用原来的建档方式，不用另选名单。</p>' : `<p>从世界书的人设条目里选，和原来的人物选择一样。确认名单不请求模型。</p><p>${draft.participantConfirmed ? `已选 ${draft.participantIds.length} 人。` : '请先确认名单。'}</p><button type="button" class="rmt-btn" data-rmt-auto-memory-people>选择人物</button>`}`;
    if (name === 'sources') {
        const scan = sourceScan(context);
        const range = core_chatReadRange.normalizeChatReadRange(core_settings.getPluginSettings(context));
        const names = scan.sources.length ? scan.sources.map(item => core_text.esc(item.label)).join('、') : '没有检测到外部来源';
        return `<h2>聊天读取范围</h2><p>这里决定建档和以后生成会读哪一段聊天。改完只在本地计数，不会请求，也不会删掉已有档案。</p><label class="rmt-auto-field"><span>读取方式</span><select data-rmt-read-mode><option value="recent" ${range.mode === 'recent' ? 'selected' : ''}>最近若干楼</option><option value="range" ${range.mode === 'range' ? 'selected' : ''}>指定楼号范围</option><option value="all" ${range.mode === 'all' ? 'selected' : ''}>当前聊天全部楼层</option></select></label><label class="rmt-auto-field" data-rmt-read-recent-row ${range.mode === 'recent' ? '' : 'hidden'}><span>最近多少楼</span><input type="number" min="1" step="1" data-rmt-read-recent value="${core_text.esc(range.recent)}"></label><div data-rmt-read-range-row ${range.mode === 'range' ? '' : 'hidden'}><label class="rmt-auto-field"><span>从第几楼</span><input type="number" min="1" step="1" data-rmt-read-start value="${core_text.esc(range.start)}"></label><label class="rmt-auto-field"><span>到第几楼</span><input type="number" min="1" step="1" data-rmt-read-end value="${core_text.esc(range.end)}"></label></div><label class="rmt-settings-check"><input type="checkbox" data-rmt-read-hidden ${range.includeHidden ? 'checked' : ''}><span>包含范围内被隐藏的普通聊天楼层</span></label><p>${core_text.esc(scan.preview.label)}</p><p>约 ${scan.preview.characters.toLocaleString()} 个聊天字符。外部来源：${names}。${scan.externalOn ? '' : '外部记忆开关是关的。'}</p>`;
    }
    if (name === 'image') {
        let state = { available: false, reason: '柏宝绘还没接上。' };
        try { state = generation_imageGeneration.imageGenerationUiState(); } catch { state = { available: false, reason: '柏宝绘还没接上。' }; }
        const status = state.available ? '柏宝绘已连接 · 公开 API v1' : (state.reason || '未检测到柏宝绘公开 API v1。');
        return `<h2>CG 生图</h2><p>相簿、ADV、日常一格。和文字 API 不是同一个连接。这里配好后点下一步，不会现在出图。</p>${cg_format_ui.cgFormatControlHtml()}<label class="rmt-settings-field"><span>生图渠道</span><select class="text_pole" data-rmt-image-generation-provider aria-label="生图渠道"><option value="baibai-image">柏宝绘 · 公开 API v1</option></select></label><p role="status">${core_text.esc(status)}</p><p>柏宝绘需单独安装并配置出图渠道。只在点击绘制并确认后出图，失败不会自动换渠道。</p><p>先不配也可以。点下一步继续，跳过不会出图，也不挡住后面的回忆。</p>`;
    }
    if (name === 'modules') return `<h2>留下哪些回忆</h2>${moduleHtml()}`;
    if (name === 'offer') {
        const ending = shouldSkipArchive(context) ? '当前聊天已经有档案，结束时不会重新建档。' : '结束时会按前面的选择开始建档。';
        return `<h2>要不要打开自动留忆？</h2><p>不开的话，向导到这里结束。你可以自己打开各个页面手动生成。以后在设置里也能打开或关闭自动留忆。</p><p>${ending}上一页勾过「这次先生成」的，会放进任务中心。勾过「自动生成」的，只有打开之后才会到间隔抽签。</p><button type="button" class="rmt-btn" data-rmt-auto-memory-offer="no">先不用，我自己生成</button><button type="button" class="rmt-btn" data-rmt-auto-memory-offer="yes">打开自动留忆</button>`;
    }
    if (name === 'interval') return `<h2>自动间隔</h2><p>默认 5 楼，只能填 1 到 1000 的整数。到了这个间隔会检查有没有新记忆。还没有可抽的模块时，不会为模块发请求。</p><label>每 <input type="number" min="1" max="1000" step="1" data-rmt-auto-memory-interval value="${draft.intervalFloors}"> 楼</label><p data-rmt-auto-memory-interval-error role="alert"></p>`;
    if (name === 'archive') return `<h2>建档预计</h2>${previewHtml(context)}<label class="rmt-settings-check"><input type="checkbox" data-rmt-auto-memory-archive ${draft.doArchive ? 'checked' : ''}><span>这次整理档案</span></label>`;
    const archiveNote = shouldSkipArchive(context) ? '保存成功后才会排队。这次不建档。' : '保存成功后才会建档或排队。';
    return `<h2>确认后在后台执行</h2>${previewHtml(context)}<p>${archiveNote}关闭这个窗口不会取消已经开始的任务，聊天输入也不会被锁住。自动留忆以后可以在设置里关闭。</p>`;
}

function visibleWizardSteps(context) {
    return wizard_plan.wizardVisibleSteps({
        archivePresent: archivePresentNow(context),
        cardChoiceDirty: draft?.cardChoiceDirty === true,
        wantAuto: draft?.wantAuto === true,
    });
}

function stepHidden(name, context) {
    return !visibleWizardSteps(context).includes(name);
}

function moveWizardStep(delta, context) {
    const steps = wizard_plan.WIZARD_STEPS;
    let next = step;
    do {
        next += delta;
        if (next < 0 || next >= steps.length) return;
    } while (stepHidden(steps[next], context));
    if (shouldSkipArchive(context)) draft.doArchive = false;
    step = next;
}

function render(context) {
    if (draft && shouldSkipArchive(context)) draft.doArchive = false;
    if (!showingSummary && wizard_plan.WIZARD_STEPS[step] === 'archive' && shouldSkipArchive(context)) {
        if (step < wizard_plan.WIZARD_STEPS.length - 1) step += 1;
    }
    const body = ui_overlay.bodyEl();
    if (!body) return false;
    ui_overlay.openOverlay();
    const charName = core_text.normalizeText(context?.name2, 40) || '这个角色';
    const onAuto = ['interval', 'run'].includes(wizard_plan.WIZARD_STEPS[step]) || showingSummary;
    ui_overlay.topTitle(onAuto ? '心迹回廊 · 自动留忆' : `开始你和${charName}的回忆`);
    ui_overlay.setBackVisible(false);
    ui_overlay.setRegenerateVisible(false);
    ui_overlay.setManageVisible(false);
    const resume = showingSummary ? wizard_plan.wizardResumeView(auto_memory_plan.readAutoMemoryMetadata(context.chatMetadata), archive_repository.getCurrentArchiveImportRecoverySummary(context)) : { completed: false };
    const shownSteps = visibleWizardSteps(context);
    const shownIndex = Math.max(0, shownSteps.indexOf(wizard_plan.WIZARD_STEPS[step]));
    const atOffer = wizard_plan.WIZARD_STEPS[step] === 'offer';
    const atEnd = shownSteps[shownSteps.length - 1] === wizard_plan.WIZARD_STEPS[step];
    const browsing = !guideDone && !resume.completed;
    const stepName = wizard_plan.WIZARD_STEPS[step];
    const showSave = browsing && stepName === 'run';
    const inner = guideDone
        ? `<h2>可以开始了</h2><p>自动留忆没有打开。你可以自己打开各个页面手动生成。以后在设置里也能打开或关闭自动留忆。</p><p>关闭这个窗口不会取消已经开始的建档或排队。</p>`
        : resume.completed
        ? `<h2>自动留忆已经打开</h2><p>间隔 ${resume.intervalFloors} 楼。会自动生成 ${cards().filter(item => item.autoEligible && item.inDrawPool && !resume.excludedModuleIds.includes(item.id)).length} 项，已排除 ${resume.excludedModuleIds.length} 项。每份回忆都会带上成就。</p><p>${resume.archiveStillRunning ? '建档还在原来的整理流程里，可以关闭窗口继续聊天。' : '刷新后这份设置还在。任务中心的队列不会在刷新后自动重发。'}</p><p>设置里可以关闭自动留忆。关闭后仍能手动生成。</p><button type="button" class="rmt-btn" data-rmt-auto-memory-edit>重新设置</button>`
        : pageHtml(context);
    const progressName = guideDone ? '可以开始了' : resume.completed ? '自动留忆已经打开' : stepTitle(stepName);
    const progressIndex = browsing ? shownIndex : Math.max(0, shownSteps.length - 1);
    const progressCurrent = Math.min(shownSteps.length || 1, progressIndex + 1);
    const progressTotal = shownSteps.length || 1;
    const progressWidth = Math.round((progressCurrent / progressTotal) * 100);
    const prev = browsing ? `<button type="button" class="rmt-btn" data-rmt-auto-memory-prev ${step === 0 ? 'disabled' : ''}>上一步</button>` : '';
    const next = browsing && !atOffer && !atEnd ? `<button type="button" class="rmt-btn" data-rmt-auto-memory-next>下一步</button>` : '';
    const save = showSave ? `<button type="button" class="rmt-btn rmt-auto-save" data-rmt-auto-memory-save>保存并开始</button>` : '';
    body.innerHTML = `<main data-rmt-auto-memory-root><div class="rmt-auto-scroll"><div class="rmt-home rmt-auto-page"><div class="rmt-auto-progress"><div class="rmt-auto-progress-track" role="progressbar" aria-valuemin="1" aria-valuemax="${progressTotal}" aria-valuenow="${progressCurrent}" aria-valuetext="${core_text.esc(progressName)}，第 ${progressCurrent} / ${progressTotal} 步"><span style="width:${progressWidth}%"></span></div><p><b>${core_text.esc(progressName)}</b><small>第 ${progressCurrent} / ${progressTotal} 步</small></p></div>${inner}</div></div><div class="rmt-auto-bar"><p data-rmt-auto-memory-status role="status"></p><div class="rmt-auto-bar-main">${prev}${next}${save}</div><div class="rmt-auto-bar-quiet"><button type="button" data-rmt-auto-memory-home>返回设置</button><button type="button" data-rmt-auto-memory-close>关闭窗口，任务继续</button></div></div></main>`;
    if (body.dataset.rmtAutoMemoryBound !== '1') {
        body.dataset.rmtAutoMemoryBound = '1';
        body.addEventListener('click', onClick);
        body.addEventListener('change', onChange);
        body.addEventListener('input', onManualInput);
    }
    return true;
}

function openPeople(context) {
    void participant_picker.showParticipantPicker({ context, requireSelection: true, confirmLabel: '确认人物',
        onConfirm: (nextRoster, expectedRevision) => {
            roster = nextRoster; rosterRevision = expectedRevision;
            draft.cardType = 'multiple';
            draft.cardChoiceDirty = true;
            draft.participantConfirmed = true;
            draft.participantIds = Array.isArray(nextRoster?.selectedIds) ? nextRoster.selectedIds.filter(id => typeof id === 'string') : [];
            if (sameChat(context)) render(context);
        },
    }).catch(error => status(core_text.safeErrorSummary(error)));
}

function status(message) {
    const node = ui_overlay.bodyEl()?.querySelector?.('[data-rmt-auto-memory-status]');
    if (node) node.textContent = message;
}

function currentEntry(context) {
    const archive = archive_repository.getImportedMemory(context);
    const storedRoster = archive ? core_cache.readParticipantRoster(context) : null;
    return {
        entry: wizard_plan.wizardEntry({
            archivePresent: !!archive,
            cardType: storedRoster ? 'multiple' : (archive ? 'single' : ''),
            apiReady: apiReport().ready,
        }),
        storedRoster,
    };
}

function applyKnownCard(context) {
    const { entry, storedRoster } = currentEntry(context);
    if (entry.cardType) {
        draft.cardType = entry.cardType;
        draft.participantConfirmed = entry.cardType === 'single' || !!storedRoster;
        if (storedRoster) {
            roster = storedRoster;
            rosterRevision = storedRoster.revision || '';
            draft.participantIds = [...storedRoster.selectedIds];
        }
    }
    if (entry.skipArchive) draft.doArchive = false;
    return entry;
}

function seedDraft(existing) {
    const legacy = core_settings.getPluginSettings().autoUpdates;
    if (!existing) {
        const seeded = wizard_plan.createWizardDraft(auto_memory_migrate.migrateLegacyAutoPreferences(null, legacy, 0).plan);
        const saved = wizard_plan.normalizeInterval(core_settings.getPluginSettings().autoMemoryIntervalFloors);
        if (saved.ok) seeded.intervalFloors = saved.intervalFloors;
        return seeded;
    }
    if (!existing.plan.legacyPreferencesMigrated) {
        return wizard_plan.createWizardDraft(auto_memory_migrate.migrateLegacyAutoPreferences(existing.plan, legacy, Date.now()).plan);
    }
    return wizard_plan.createWizardDraft(existing.plan);
}

function sameChat(context) {
    try { return core_context.chatScopeKey(context) === scope && core_context.chatScopeKey(liveContext()) === scope; }
    catch { return false; }
}

async function saveAndStart(context, { enableAuto = false } = {}) {
    if (!sameChat(context) || !apiReport().ready || (enableAuto && !wizard_plan.normalizeInterval(draft.intervalFloors).ok)) {
        status('设置还没通过，没有开始建档或排队。');
        return;
    }
    if (!enableAuto) {
        await startChosenWork(context, { enableAuto: false });
        return;
    }
    const metadata = context.chatMetadata;
    const keys = [auto_memory_plan.AUTO_MEMORY_PLAN_KEY, auto_memory_plan.AUTO_MEMORY_REVEAL_KEY, auto_memory_plan.AUTO_MEMORY_DRAW_TICKETS_KEY, auto_memory_plan.AUTO_MEMORY_MODULE_PLAN_KEY];
    const had = {};
    const previous = {};
    for (const key of keys) {
        had[key] = Object.prototype.hasOwnProperty.call(metadata, key);
        if (had[key]) previous[key] = metadata[key];
    }
    let snapshot;
    let expected = 0;
    try {
        const before = auto_memory_plan.readAutoMemoryMetadata(metadata);
        expected = before ? before.plan.revision : 0;
        snapshot = wizard_plan.wizardCompletionSnapshot(metadata, draft, Date.now());
    } catch (error) {
        status(error?.safeToDisplay ? error.safeUserMessage : '这份自动留忆记录没有改写。');
        return;
    }
    try {
        auto_memory_plan.commitAutoMemoryMetadata(metadata, snapshot, expected);
        await context.saveMetadataDebounced?.();
    } catch (error) {
        for (const key of keys) {
            if (had[key]) metadata[key] = previous[key];
            else delete metadata[key];
        }
        status(error?.safeToDisplay ? error.safeUserMessage : '聊天记录没有确认保存，没有开始建档或排队。');
        return;
    }
    const chatId = core_context.getChatId(context);
    try {
        const recovery = await auto_memory_plan.readAutoMemoryRecovery(chatId);
        const recoveryExpected = recovery ? recovery.revision : 0;
        if (snapshot.plan.revision === recoveryExpected + 1) await auto_memory_plan.writeAutoMemoryRecovery(chatId, snapshot, recoveryExpected);
    } catch { status('聊天里的设置已保存。本机备份没有写上，没有用备份覆盖它。'); }
    await startChosenWork(context, { enableAuto: true });
}

async function startChosenWork(context, { enableAuto = false } = {}) {
    let archiveStarted = false;
    let archiveNote = '';
    const cardDirty = draft.cardChoiceDirty === true;
    const archivePresent = !!archive_repository.getImportedMemory(context);
    if (wizard_plan.wizardSkipsArchiveStep({ archivePresent, cardChoiceDirty: cardDirty })) draft.doArchive = false;
    if (cardDirty || draft.doArchive) {
        try {
            if (draft.cardType === 'multiple') {
                if (!roster) { status('请先确认人物名单。已保存的间隔和偏好还在。'); return; }
                roster = await core_cache.commitParticipantRoster(context, roster, { expectedRevision: rosterRevision });
                rosterRevision = roster?.revision || rosterRevision;
            } else if (draft.cardType === 'single') {
                await core_cache.selectSingleParticipantCard(context, { expectedRevision: rosterRevision });
                roster = null;
            }
            draft.cardChoiceDirty = false;
        } catch (error) { status(core_text.safeErrorSummary(error)); return; }
    }
    const asked = wizard_plan.archiveRebuildChoice({ cardChoiceDirty: cardDirty, archivePresent });
    let rebuild = false;
    if (asked === 'ask') {
        const settings = core_settings.getPluginSettings(context);
        const detected = archive_repository.externalMemorySourceSummary(context);
        const needsScan = settings.useCurrentChatExternalMemory && detected.length && !archive_repository.getMemoryPreflight(context);
        if (needsScan) archiveNote = '重新建档前要先扫描当前窗口的记忆或摘要。这次没有建档，旧档案还在。';
        else rebuild = ui_overlay.confirmExplicitAction(
            '按新人物重新建档',
            '人物或卡片类型改过了。重新建档会按当前剧情和这份名单重做档案，旧档案会被换掉。取消就继续用现在这份旧档案，不会为此发请求。',
            { destructive: true },
        ) === true;
    }
    const action = wizard_plan.archiveActionAfterChoice({ asked, rebuild, doArchive: draft.doArchive });
    if (action === 'rebuild') {
        const participantRoster = draft.cardType === 'multiple' ? roster : null;
        archiveStarted = true;
        void archive_repository.importCurrentChatMemory({ fullRebuild: true, participantRoster }).catch(error => {
            console.error('[HeartbeatMemories] auto memory rebuild failed', core_text.safeErrorDiagnostic(error));
            globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊');
        });
        archiveNote = '已按新名单开始重新建档，旧档案会在重建完成后被换掉。可以关闭窗口继续聊天。';
    } else if (action === 'create') {
        archiveStarted = ui_overlay.requestCurrentArchiveImport({ cardTypeConfirmed: true, participantRoster: draft.cardType === 'multiple' ? roster : null }) === true;
        if (!archiveStarted) archiveNote = '建档没有开始。已保存的间隔和偏好还在。';
    } else if (asked === 'ask' && !archiveNote) archiveNote = '继续使用旧档案，这次没有重新建档。';
    const routes = wizard_plan.firstQueueRoutes(draft, queueableIds());
    const queued = routes.length && (archiveStarted || !draft.doArchive) ? ui_taskCenter.enqueueSelectedModes(routes) : 0;
    guideDone = enableAuto !== true;
    showingSummary = enableAuto === true;
    if (enableAuto) core_autoUpdates.notifyAutoUpdateSettingsChanged();
    if (sameChat(context)) render(context);
    const idle = enableAuto ? '自动留忆已打开。关闭窗口不会取消正在进行的整理。' : '向导结束了。自动留忆没有打开，你可以自己手动生成。';
    status(archiveNote || (queued ? `已把 ${queued} 项放进任务中心。关闭窗口后任务继续，聊天可以照常发送。` : idle));
}

function syncSelectAll(root) {
    const all = root?.querySelector?.('[data-rmt-auto-memory-all]');
    if (!all) return;
    const ids = wizard_plan.selectableModuleIds();
    all.checked = ids.length > 0 && ids.every(id => wizard_plan.moduleSelected(draft, id));
}

function writeReadRange(root) {
    const mode = root?.querySelector?.('[data-rmt-read-mode]');
    if (!mode) return;
    core_settings.updatePluginSettings({ chatReadRange: core_chatReadRange.normalizeChatReadRange({
        mode: mode.value,
        recent: Number(root.querySelector('[data-rmt-read-recent]')?.value),
        start: Number(root.querySelector('[data-rmt-read-start]')?.value),
        end: Number(root.querySelector('[data-rmt-read-end]')?.value),
        includeHidden: root.querySelector('[data-rmt-read-hidden]')?.checked === true,
    }) });
}

function onManualInput(event) {
    const root = event.target.closest?.('[data-rmt-auto-memory-root]');
    if (root && event.target.matches?.('[data-rmt-read-recent],[data-rmt-read-start],[data-rmt-read-end]')) {
        writeReadRange(root);
        return;
    }
    if (!root || !event.target.matches?.('[data-rmt-manual-api-base],[data-rmt-manual-api-key],[data-rmt-manual-api-model]')) return;
    clearTimeout(manualSaveTimer);
    manualSaveTimer = setTimeout(() => { void settings_parts.saveManualPanel(root); }, 500);
}

async function importOneClick(context) {
    const operationEpoch = core_settings.beginApiConfigurationOperation();
    apiEditor = 'profile';
    if (sameChat(context)) render(context);
    const root = ui_overlay.bodyEl()?.querySelector?.('[data-rmt-auto-memory-root]');
    const button = root?.querySelector?.('[data-rmt-auto-api-mode="profile"]');
    if (button) button.disabled = true;
    try {
        const result = await core_settings.importCurrentSillyTavernConnection({
            isCurrent: () => core_settings.isCurrentApiConfigurationOperation(operationEpoch),
        });
        if (!sameChat(context)) return;
        const current = core_settings.getPluginSettings();
        if (current.apiConnectionMode === 'profile' && current.connectionProfileId === core_text.normalizeText(result?.id, 160)) {
            globalThis.toastr?.success?.(result?.created ? '一键连接已创建并启用。' : '一键连接已启用。', '心迹回廊');
        }
        render(context);
    } catch (error) {
        if (error?.code === 'RMT_API_CONFIGURATION_SUPERSEDED' || !sameChat(context)) return;
        status(core_text.safeErrorSummary(error));
        render(context);
    }
}

async function refreshWizardProfileModels(context) {
    const profileId = core_text.normalizeText(core_settings.getPluginSettings().connectionProfileId, 160);
    if (!profileId) { status('先选择一个连接，再刷新模型。'); return; }
    try {
        const result = await core_settings.fetchModelsForConnection(profileId, { force: true, returnMeta: true });
        profileModels = Array.isArray(result?.models) ? result.models.filter(Boolean) : [];
        if (!sameChat(context)) return;
        if (result?.fallbackOnly) status('远程列表暂不可用，已显示这一连接保存的模型。');
        else status(profileModels.length ? `已找到 ${profileModels.length} 个模型。` : '没有拉到模型。');
        render(context);
    } catch (error) {
        if (!sameChat(context)) return;
        status(core_text.safeErrorSummary(error));
    }
}

async function refreshWizardManualModels(root, context) {
    const current = core_settings.getPluginSettings();
    try {
        const models = await core_settings.fetchModelsForManualConnection({
            manualApiBaseUrl: root.querySelector('[data-rmt-manual-api-base]')?.value || current.manualApiBaseUrl,
            manualApiKey: core_text.normalizeText(root.querySelector('[data-rmt-manual-api-key]')?.value, 4000) || current.manualApiKey,
            manualApiModel: root.querySelector('[data-rmt-manual-api-model]')?.value || current.manualApiModel,
        }, { force: true });
        manualModels = Array.isArray(models) ? models.filter(Boolean) : [];
        if (!sameChat(context)) return;
        status(manualModels.length ? `已找到 ${manualModels.length} 个模型。` : '没有拉到模型。');
        render(context);
    } catch (error) {
        if (!sameChat(context)) return;
        status(core_text.safeErrorSummary(error));
    }
}

function onChange(event) {
    if (cg_format_ui.handleCgFormatChange(event)) return;
    const root = event.target.closest?.('[data-rmt-auto-memory-root]');
    if (!root || !draft) return;
    if (event.target.matches?.('[data-rmt-read-mode], [data-rmt-read-recent], [data-rmt-read-start], [data-rmt-read-end], [data-rmt-read-hidden]')) {
        writeReadRange(root);
        let context;
        try { context = liveContext(); } catch { return; }
        if (sameChat(context)) render(context);
        return;
    }
    if (event.target.matches?.('[data-rmt-auto-memory-all]')) {
        draft = wizard_plan.preferenceSelectAll(draft, event.target.checked === true);
        for (const input of root.querySelectorAll('[data-rmt-auto-memory-prefer]')) {
            if (!input.disabled) input.checked = event.target.checked === true;
        }
        return;
    }
    const prefer = event.target.dataset?.rmtAutoMemoryPrefer;
    const first = event.target.dataset?.rmtAutoMemoryFirst;
    if (prefer) {
        draft = wizard_plan.preferenceUpdate(draft, prefer, event.target.checked ? 'prefer' : 'exclude');
        syncSelectAll(root);
        return;
    }
    if (event.target.matches?.('[data-rmt-auto-api-profile-id]')) {
        apiEditor = 'profile';
        profileModels = [];
        core_settings.updatePluginSettings({
            apiConnectionMode: 'profile',
            connectionProfileId: core_text.normalizeText(event.target.value, 160),
            modelOverride: '',
        });
        let context;
        try { context = liveContext(); } catch { return; }
        if (sameChat(context)) render(context);
        return;
    }
    if (event.target.matches?.('[data-rmt-auto-api-model]')) {
        core_settings.updatePluginSettings({ apiConnectionMode: 'profile', modelOverride: core_text.normalizeText(event.target.value, 240) });
        let context;
        try { context = liveContext(); } catch { return; }
        if (sameChat(context) && apiReport().ready) render(context);
        return;
    }
    if (event.target.matches?.('[data-rmt-manual-api-models]')) {
        const manualInput = root.querySelector('[data-rmt-manual-api-model]');
        if (manualInput && event.target.value) manualInput.value = event.target.value;
        return;
    }
    if (first) {
        const ids = draft.firstModuleIds.filter(id => id !== first);
        if (event.target.checked) ids.push(first);
        draft.firstModuleIds = ids;
    }
    if (event.target.matches?.('[data-rmt-auto-memory-interval]')) {
        const value = Number(event.target.value);
        const interval = wizard_plan.normalizeInterval(value);
        const error = event.target.closest('[data-rmt-auto-memory-root]')?.querySelector('[data-rmt-auto-memory-interval-error]');
        if (!interval.ok) { draft.intervalFloors = value; if (error) error.textContent = interval.message; return; }
        draft.intervalFloors = interval.intervalFloors;
        if (error) error.textContent = '';
    }
    if (event.target.matches?.('[data-rmt-auto-memory-archive]')) draft.doArchive = event.target.checked === true;
    if (event.target.matches?.('[data-rmt-auto-memory-skip]')) draft.skipFirst = event.target.checked === true;
    if (event.target.matches?.('[data-rmt-auto-memory-archive-only]')) {
        draft.archiveOnly = event.target.checked === true;
        if (draft.archiveOnly) {
            draft.skipFirst = true;
            let context;
            try { context = liveContext(); } catch { context = null; }
            if (!context || !archivePresentNow(context)) draft.doArchive = true;
        }
    }
}

function onClick(event) {
    const root = event.target.closest?.('[data-rmt-auto-memory-root]');
    if (!root) return;
    let context;
    try { context = liveContext(); }
    catch (error) { status(core_text.safeErrorSummary(error)); return; }
    if (!sameChat(context)) { status('聊天已经换了，这次没有保存。'); return; }
    if (event.target.closest?.('[data-rmt-auto-memory-home]')) { showingSummary = false; home_view.showHome({ section: 'auto' }); return; }
    if (event.target.closest?.('[data-rmt-auto-memory-close]')) {
        showingSummary = false;
        ui_overlay.closeArchiveOverlayFromUser();
        return;
    }
    if (event.target.closest?.('[data-rmt-auto-memory-edit]')) {
        showingSummary = false;
        guideDone = false;
        draft.wantAuto = null;
        step = wizard_plan.WIZARD_STEPS.indexOf(currentEntry(context).entry.step);
        render(context);
        return;
    }
    const offer = event.target.closest?.('[data-rmt-auto-memory-offer]')?.dataset?.rmtAutoMemoryOffer;
    if (offer === 'yes') {
        draft.wantAuto = true;
        guideDone = false;
        step = wizard_plan.WIZARD_STEPS.indexOf('interval');
        render(context);
        return;
    }
    if (offer === 'no') {
        draft.wantAuto = false;
        void saveAndStart(context, { enableAuto: false });
        return;
    }
    const goto = event.target.closest?.('[data-rmt-auto-memory-goto]')?.dataset?.rmtAutoMemoryGoto;
    if (goto && wizard_plan.WIZARD_STEPS.includes(goto)) {
        step = wizard_plan.WIZARD_STEPS.indexOf(goto);
        render(context);
        return;
    }
    if (event.target.closest?.('[data-rmt-auto-memory-prev]')) { moveWizardStep(-1, context); render(context); return; }
    if (event.target.closest?.('[data-rmt-auto-memory-next]')) {
        if (!stepReady(context)) { status(wizard_plan.WIZARD_STEPS[step] === 'interval' ? wizard_plan.normalizeInterval(draft.intervalFloors).message : '这一步还没完成。'); return; }
        moveWizardStep(1, context);
        render(context);
        return;
    }
    const card = event.target.closest?.('[data-rmt-auto-memory-card]')?.dataset?.rmtAutoMemoryCard;
    if (card === 'single' || card === 'multiple') {
        draft.cardType = card;
        draft.cardChoiceDirty = true;
        draft.participantConfirmed = card === 'single' || (card === 'multiple' && !!roster);
        draft.participantIds = card === 'single' ? [] : draft.participantIds;
        if (card === 'single') roster = null;
        render(context);
        if (card === 'multiple') openPeople(context);
        return;
    }
    if (event.target.closest?.('[data-rmt-auto-memory-people]')) { openPeople(context); return; }
    const mode = event.target.closest?.('[data-rmt-auto-api-mode]')?.dataset?.rmtAutoApiMode;
    if (mode === 'manual') {
        core_settings.beginApiConfigurationOperation();
        apiEditor = 'manual';
        render(context);
        return;
    }
    if (mode === 'profile') { void importOneClick(context); return; }
    if (event.target.closest?.('[data-rmt-auto-api-key-clear]')) {
        clearTimeout(manualSaveTimer);
        const keyInput = root.querySelector('[data-rmt-manual-api-key]');
        if (keyInput) keyInput.value = '';
        void core_settings.forgetManualApiCredential().then(() => {
            if (!sameChat(context)) return;
            status('本插件的手动 Key 已清除，酒馆主聊天没有改。');
            render(context);
        }).catch(error => status(core_text.safeErrorSummary(error)));
        return;
    }
    if (event.target.closest?.('[data-rmt-manual-api-save]')) {
        clearTimeout(manualSaveTimer);
        void settings_parts.saveManualPanel(root, true).then(result => {
            if (result && sameChat(context)) render(context);
        });
        return;
    }
    if (event.target.closest?.('[data-rmt-auto-api-manual-refresh]')) { void refreshWizardManualModels(root, context); return; }
    if (event.target.closest?.('[data-rmt-auto-api-model-refresh]')) { void refreshWizardProfileModels(context); return; }
    if (event.target.closest?.('[data-rmt-auto-memory-save]')) void saveAndStart(context, { enableAuto: true });
}

export function openAutoMemoryWizard() {
    let context;
    try { context = liveContext(); }
    catch (error) {
        globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊');
        return false;
    }
    const nextScope = core_context.chatScopeKey(context);
    if (scope !== nextScope || !draft) {
        scope = nextScope;
        let existing = null;
        try { existing = auto_memory_plan.readAutoMemoryMetadata(context.chatMetadata); }
        catch (error) {
            globalThis.toastr?.error?.(core_text.toastText(error?.safeToDisplay ? error.safeUserMessage : '已有的自动留忆记录已损坏，没有覆盖。'), '心迹回廊');
            return false;
        }
        draft = seedDraft(existing);
        showingSummary = !!existing?.plan?.enabled;
        guideDone = false;
        roster = null;
        rosterRevision = '';
        apiEditor = '';
        profileModels = [];
        manualModels = [];
        const entry = applyKnownCard(context);
        step = showingSummary ? 0 : wizard_plan.WIZARD_STEPS.indexOf(entry.step);
    }
    return render(context);
}
