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
import * as home_view from './homeView.js';
import * as ui_overlay from './overlay.js';
import * as participant_picker from './participantPicker.js';
import * as ui_taskCenter from './taskCenter.js';
import * as ui_workspaceState from './workspaceState.js';

let draft = null;
let step = 0;
let scope = '';
let showingSummary = false;
let roster = null;
let rosterRevision = '';

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

function moduleHtml() {
    return cards().map(item => `<article class="rmt-settings-card"><h3>${core_text.esc(item.title)}</h3><p>${core_text.esc(item.contentLabel)} · 正常请求 ${core_text.esc(item.normalRequestEstimate)}</p><p>${core_text.esc(item.description)}</p>${item.autoEligible ? '' : `<p>${core_text.esc(item.unavailableReason)}</p>`}</article>`).join('');
}

function cardBar() {
    const label = draft.cardType === 'single' ? '当前是单人卡。'
        : draft.cardType === 'multiple' ? `当前是一张卡内多人，已选 ${draft.participantIds.length} 人。`
            : '还没有选择单人卡或一张卡内多人。';
    const people = draft.cardType === 'multiple' ? '<button type="button" class="rmt-btn" data-rmt-auto-memory-people>调整人物</button>' : '';
    return `<p>${label}可以随时改，改名单本身不请求模型。</p><p><button type="button" class="rmt-btn" data-rmt-auto-memory-card="single">改成单人卡</button><button type="button" class="rmt-btn" data-rmt-auto-memory-card="multiple">改成一张卡内多人</button>${people}</p>`;
}

function preferenceHtml() {
    const rows = cards().filter(item => item.inDrawPool);
    const choices = rows.map(item => {
        const note = item.autoEligible ? '' : `<p>${core_text.esc(item.title)}：暂不可自动生成。勾选只会先记下，现在不会抽中，也不会请求。</p>`;
        return `${note}<label class="rmt-settings-check"><input type="checkbox" data-rmt-auto-memory-prefer="${core_text.esc(item.id)}" ${draft.preferredModuleIds.includes(item.id) ? 'checked' : ''}><span>希望自动跑${core_text.esc(item.title)}</span></label><label class="rmt-settings-check"><input type="checkbox" data-rmt-auto-memory-exclude="${core_text.esc(item.id)}" ${draft.excludedModuleIds.includes(item.id) ? 'checked' : ''}><span>排除${core_text.esc(item.title)}，以后也不要抽中</span></label>`;
    }).join('');
    const report = apiReport();
    const api = report.ready ? '' : `<p>${core_text.esc(report.message)}</p><p>${core_text.esc(report.action)}</p>`;
    return `${api}${cardBar()}<p>选人和原来一样，从世界书里的人设条目勾选。已经有档案时，改了人物会先问要不要按新名单和当前剧情重新建档；不重新建档就继续用旧档案。</p><p>勾选的是以后想自动跑的条目；还没适配的不会进入抽签。</p>${choices}`;
}

function previewHtml(context) {
    const scan = sourceScan(context);
    const routes = wizard_plan.firstQueueRoutes(draft, queueableIds());
    const split = wizard_plan.splitRequestPreview(scan.estimate, routes);
    const moduleLines = split.moduleEstimates.length ? split.moduleEstimates.map(item => `<li>${core_text.esc(item.title)}：${core_text.esc(item.estimate)}</li>`).join('') : '<li>这次不生成模块。</li>';
    return `<p>建档请求和模块请求分开计算。</p><p>建档预计：聊天 ${split.chatRequests} 次，外部摘要 ${split.externalRequests} 次，合计 ${split.archiveRequests} 次。这次${draft.doArchive ? '会' : '不会'}发起建档。聊天可能分成 ${scan.estimate.checkpoints} 个检查点，长聊天不会只调用一次。</p>${scan.unknownExternal ? '<p>还有未扫描的外部来源，上面的次数不含它们。</p>' : ''}<p>首次模块：${split.moduleCount} 项，和建档次数不是同一笔。</p><ul>${moduleLines}</ul><p>${core_text.esc(scan.preview.label)}</p>`;
}

function pageHtml(context) {
    const name = wizard_plan.WIZARD_STEPS[step];
    const report = apiReport();
    if (name === 'api') return `<h2>API 就绪检查</h2><p>${core_text.esc(report.message)}</p>${report.action ? `<p>${core_text.esc(report.action)}</p>` : ''}`;
    if (name === 'card') return `<h2>单人卡，还是一张卡里的多个人？</h2><p>原生群聊暂不支持。这里沿用现有的人物选择。</p><p>${draft.cardType === 'single' ? '已选单人卡。' : draft.cardType === 'multiple' ? '已选一张卡内多人。' : '还没有选择。'}</p><button type="button" class="rmt-btn" data-rmt-auto-memory-card="single">单人卡</button><button type="button" class="rmt-btn" data-rmt-auto-memory-card="multiple">一张卡内多人</button>`;
    if (name === 'people') return `<h2>人物名单</h2>${draft.cardType === 'single' ? '<p>单人卡沿用原来的建档方式，不用另选名单。</p>' : `<p>从世界书的人设条目里选，和原来的人物选择一样。确认名单不请求模型。</p><p>${draft.participantConfirmed ? `已选 ${draft.participantIds.length} 人。` : '请先确认名单。'}</p><button type="button" class="rmt-btn" data-rmt-auto-memory-people>选择人物</button>`}`;
    if (name === 'sources') {
        const scan = sourceScan(context);
        const names = scan.sources.length ? scan.sources.map(item => core_text.esc(item.label)).join('、') : '没有检测到外部来源';
        return `<h2>聊天读取范围与外部来源</h2><p>${core_text.esc(scan.preview.label)}</p><p>约 ${scan.preview.characters.toLocaleString()} 个聊天字符。外部来源：${names}。${scan.externalOn ? '' : '外部记忆开关是关的。'}</p><p>这一步只在本地计数，不会请求模型。</p>`;
    }
    if (name === 'modules') return `<h2>模块介绍</h2><p>性质和正常请求范围如下。未适配的不能自动生成。</p>${moduleHtml()}`;
    if (name === 'preference') return `<h2>选择想自动跑的条目</h2>${preferenceHtml()}`;
    if (name === 'interval') return `<h2>自动间隔</h2><p>默认 5 楼，只能填 1 到 1000 的整数。到了这个间隔会检查有没有新记忆。还没有可抽的模块时，不会为模块发请求。</p><label>每 <input type="number" min="1" max="1000" step="1" data-rmt-auto-memory-interval value="${draft.intervalFloors}"> 楼</label><p data-rmt-auto-memory-interval-error role="alert"></p>`;
    if (name === 'archive') return `<h2>建档预计</h2>${previewHtml(context)}<label class="rmt-settings-check"><input type="checkbox" data-rmt-auto-memory-archive ${draft.doArchive ? 'checked' : ''}><span>这次整理档案</span></label>`;
    if (name === 'first') {
        const choices = cards().filter(item => item.queueable).map(item => `<label class="rmt-settings-check"><input type="checkbox" data-rmt-auto-memory-first="${core_text.esc(item.id)}" ${draft.firstModuleIds.includes(item.id) ? 'checked' : ''} ${draft.skipFirst || draft.archiveOnly ? 'disabled' : ''}><span>${core_text.esc(item.title)}：${core_text.esc(item.normalRequestEstimate)}</span></label>`).join('');
        return `<h2>首次生成</h2><p>可以跳过，也可以多选后放进现有任务中心。一项失败不会撤销其他项。深层页面仍从自己的页面手动生成。</p><label class="rmt-settings-check"><input type="checkbox" data-rmt-auto-memory-skip ${draft.skipFirst ? 'checked' : ''}><span>跳过全部首次生成</span></label><label class="rmt-settings-check"><input type="checkbox" data-rmt-auto-memory-archive-only ${draft.archiveOnly ? 'checked' : ''}><span>只建档</span></label>${choices}`;
    }
    return `<h2>确认后在后台执行</h2>${previewHtml(context)}<p>保存成功后才会建档或排队。关闭这个窗口不会取消已经开始的任务，聊天输入也不会被锁住。</p><button type="button" class="rmt-btn" data-rmt-auto-memory-save>保存并开始</button>`;
}

function render(context) {
    const body = ui_overlay.bodyEl();
    if (!body) return false;
    ui_overlay.openOverlay();
    ui_overlay.topTitle('心迹回廊 · 自动留忆');
    ui_overlay.setBackVisible(false);
    ui_overlay.setRegenerateVisible(false);
    ui_overlay.setManageVisible(false);
    const resume = showingSummary ? wizard_plan.wizardResumeView(auto_memory_plan.readAutoMemoryMetadata(context.chatMetadata), archive_repository.getCurrentArchiveImportRecoverySummary(context)) : { completed: false };
    const inner = resume.completed
        ? `<h2>向导已经保存</h2><p>间隔 ${resume.intervalFloors} 楼。记下 ${resume.preferredModuleIds.length} 项，其中已开放 ${cards().filter(item => item.autoEligible && resume.preferredModuleIds.includes(item.id)).length} 项，排除 ${resume.excludedModuleIds.length} 项。尚未适配的模块不会进入抽签，也不会发模块请求。</p><p>${resume.archiveStillRunning ? '建档还在原来的整理流程里，可以关闭窗口继续聊天。' : '刷新后这份设置还在。任务中心的队列不会在刷新后自动重发。'}</p><p>到了间隔会检查新记忆。这一段聊天会暂停原来的按模块自动更新；设置里可以恢复那些开关。</p><button type="button" class="rmt-btn" data-rmt-auto-memory-edit>重新设置</button>`
        : `${pageHtml(context)}<p><button type="button" class="rmt-btn" data-rmt-auto-memory-prev ${step === 0 ? 'disabled' : ''}>上一步</button><button type="button" class="rmt-btn" data-rmt-auto-memory-next ${step >= wizard_plan.WIZARD_STEPS.length - 1 ? 'disabled' : ''}>下一步</button></p>`;
    body.innerHTML = `<main class="rmt-home" data-rmt-auto-memory-root><p>第 ${showingSummary ? wizard_plan.WIZARD_STEPS.length : step + 1} / ${wizard_plan.WIZARD_STEPS.length} 步</p>${inner}<p><button type="button" class="rmt-btn" data-rmt-auto-memory-home>返回设置</button><button type="button" class="rmt-btn" data-rmt-auto-memory-close>关闭窗口，任务继续</button></p><p data-rmt-auto-memory-status role="status"></p></main>`;
    if (body.dataset.rmtAutoMemoryBound !== '1') {
        body.dataset.rmtAutoMemoryBound = '1';
        body.addEventListener('click', onClick);
        body.addEventListener('change', onChange);
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
    if (!existing) return wizard_plan.createWizardDraft(auto_memory_migrate.migrateLegacyAutoPreferences(null, legacy, 0).plan);
    if (!existing.plan.legacyPreferencesMigrated) {
        return wizard_plan.createWizardDraft(auto_memory_migrate.migrateLegacyAutoPreferences(existing.plan, legacy, Date.now()).plan);
    }
    return wizard_plan.createWizardDraft(existing.plan);
}

function sameChat(context) {
    try { return core_context.chatScopeKey(context) === scope && core_context.chatScopeKey(liveContext()) === scope; }
    catch { return false; }
}

async function saveAndStart(context) {
    if (!sameChat(context) || !apiReport().ready || !wizard_plan.normalizeInterval(draft.intervalFloors).ok) {
        status('设置还没通过，没有开始建档或排队。');
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
    let archiveStarted = false;
    let archiveNote = '';
    const cardDirty = draft.cardChoiceDirty === true;
    const archivePresent = !!archive_repository.getImportedMemory(context);
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
    showingSummary = true;
    core_autoUpdates.notifyAutoUpdateSettingsChanged();
    if (sameChat(context)) render(context);
    status(archiveNote || (queued ? `已把 ${queued} 项放进任务中心。关闭窗口后任务继续，聊天可以照常发送。` : '设置已保存。关闭窗口不会取消正在进行的整理。'));
}

function onChange(event) {
    if (!event.target.closest?.('[data-rmt-auto-memory-root]') || !draft) return;
    const exclude = event.target.dataset?.rmtAutoMemoryExclude;
    const prefer = event.target.dataset?.rmtAutoMemoryPrefer;
    const first = event.target.dataset?.rmtAutoMemoryFirst;
    if (exclude) draft = wizard_plan.preferenceUpdate(draft, exclude, event.target.checked ? 'exclude' : 'unset');
        if (prefer) draft = wizard_plan.preferenceUpdate(draft, prefer, event.target.checked ? 'prefer' : 'unset');
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
        if (draft.archiveOnly) { draft.doArchive = true; draft.skipFirst = true; }
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
        step = wizard_plan.WIZARD_STEPS.indexOf(currentEntry(context).step);
        render(context);
        return;
    }
    if (event.target.closest?.('[data-rmt-auto-memory-prev]')) { if (step > 0) step -= 1; render(context); return; }
    if (event.target.closest?.('[data-rmt-auto-memory-next]')) {
        if (!stepReady(context)) { status(wizard_plan.WIZARD_STEPS[step] === 'interval' ? wizard_plan.normalizeInterval(draft.intervalFloors).message : '这一步还没完成。'); return; }
        if (step < wizard_plan.WIZARD_STEPS.length - 1) step += 1;
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
    if (event.target.closest?.('[data-rmt-auto-memory-save]')) void saveAndStart(context);
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
        roster = null;
        rosterRevision = '';
        const entry = applyKnownCard(context);
        step = showingSummary ? 0 : wizard_plan.WIZARD_STEPS.indexOf(entry.step);
    }
    return render(context);
}
