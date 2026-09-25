// 外置壳贴在角色楼层下面，点开才展开。档案没写完时不挂壳，也不显示建档进度。
import * as archive_repository from '../archive/repository.js';
import * as incremental_view from '../autoMemory/incrementalView.js';
import * as core_cache from '../core/cache.js';
import { state as runtimeState } from '../core/state.js';
import * as auto_memory_plan from '../autoMemory/planStore.js';
import * as auto_memory_registry from '../autoMemory/moduleRegistry.js';
import * as shell_state from '../autoMemory/shellState.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as generation_status from '../core/generationStatus.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_text from '../core/text.js';
import * as ui_floor from './chatFloorNav.js';
import * as ui_reveal from './memoryReveal.js';
import * as ui_overlay from './overlay.js';
import * as ui_styles from './styles.js';
import * as ui_taskCenter from './taskCenter.js';

let cleanup = null;
let lastPhase = '';
let sawPhase = false;
let timer = 0;

export function floorShellCss() {
    return shell_state.floorShellCss();
}

function ensureCss() {
    if (document.getElementById('rmt-floor-shell-style')) return;
    const style = document.createElement('style');
    style.id = 'rmt-floor-shell-style';
    style.textContent = floorShellCss();
    document.head?.appendChild(style);
}

function mirrorModuleCss() {
    try { ui_styles.ensureStyles(); } catch { /* 样式还没准备好时，楼层壳仍显示摘要。 */ }
    const source = document.getElementById(core_constants.STYLE_ID);
    if (!source || document.getElementById('rmt-floor-module-css')) return;
    const style = document.createElement('style');
    style.id = 'rmt-floor-module-css';
    style.textContent = `${source.textContent.replaceAll(`#${core_constants.OVERLAY_ID}`, '.rmt-floor-shell')}
.rmt-floor-shell{position:relative!important;inset:auto!important;z-index:auto!important;height:auto!important;width:min(96%,640px)!important;max-height:none!important;display:block!important;padding:0!important;background:transparent!important;backdrop-filter:none!important}`;
    document.head?.appendChild(style);
}

function latestAssistantIndex(chat) {
    if (!Array.isArray(chat)) return -1;
    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const message = chat[index];
        if (message && message.is_user !== true && message.is_system !== true) return index;
    }
    return -1;
}

function clearShells() {
    document.querySelectorAll('[data-rmt-floor-shell]').forEach(node => node.remove());
}

function readSnapshot(context) {
    try { return auto_memory_plan.readAutoMemoryMetadata(context.chatMetadata); }
    catch (error) {
        if (error?.code === 'RMT_AUTO_MEMORY_CORRUPT' || error?.code === 'RMT_AUTO_MEMORY_INTERVAL') return null;
        throw error;
    }
}

function archiveIsReady(context, rows) {
    let memory = null;
    try { memory = archive_repository.getImportedMemory(context); } catch { memory = null; }
    const importing = rows.some(row => row.currentChat && row.running && (row.kind === 'archive' || row.id === 'archive-import'));
    return !!memory && !importing;
}

function viewFor(context) {
    const snapshot = readSnapshot(context);
    if (!snapshot?.plan.enabled) return shell_state.shellView({ enabled: false });
    const ticket = snapshot.drawTickets.find(item => item.id === snapshot.plan.activeDrawTicketId) || null;
    const moduleId = snapshot.modulePlan?.moduleId || ticket?.selectedModuleId || '';
    const item = auto_memory_registry.autoMemoryModuleById(moduleId);
    const reveal = [...snapshot.revealRecords].reverse().find(row => !moduleId || row.moduleId === moduleId) || null;
    let rows = [];
    try { rows = core_requestCoordinator.listChatTaskSnapshot(context); } catch { rows = []; }
    const steps = snapshot.modulePlan?.steps || [];
    const failedStep = steps.some(step => step.status === 'failed') || ticket?.status === 'failed';
    const moduleRow = rows.find(row => row.currentChat && row.running && row.kind !== 'archive' && row.id !== 'archive-import');
    const running = !!moduleRow;
    const common = generation_status.resolveGenerationStatus({
        running, partial: failedStep, hasContent: steps.some(step => step.status === 'completed'),
    });
    const moduleComplete = item?.isComplete?.(null, snapshot.modulePlan) === true;
    return shell_state.shellView({
        enabled: true,
        archiveReady: archiveIsReady(context, rows),
        moduleId,
        moduleTitle: item?.title || '',
        moduleComplete,
        steps,
        ticketStatus: ticket?.status || '',
        revealStatus: reveal?.status || '',
        revealId: reveal?.id || '',
        revealLine: shell_state.revealFace({ userName: context.name1, achievementTitle: '', moduleTitle: item?.title || '' }),
        failureRecoverable: !running && (failedStep || common.state === 'failed' || common.state === 'retry'),
        paused: moduleRow?.phase === 'queue',
        floor: Array.isArray(context.chat) ? context.chat.length : 0,
        nextDueFloor: snapshot.plan.nextDueFloor,
    });
}

function markup(view) {
    if (view.phase === 'pace') return `<p class="rmt-floor-pace" data-rmt-floor-pace><span>留忆</span><b>${core_text.esc(view.detail)}</b></p>`;
    const pending = view.phase === 'reveal' ? '' : ' data-rmt-pending="1"';
    const status = view.progress ? `<p class="rmt-floor-status">${core_text.esc(view.detail)}</p>` : '';
    const body = view.showReveal
        ? `<div class="rmt-floor-body" data-rmt-floor-body data-rmt-reveal="${core_text.esc(view.revealId)}" data-rmt-module="${core_text.esc(view.moduleId)}"></div><button type="button" class="rmt-btn" data-rmt-floor-plugin data-rmt-module="${core_text.esc(view.moduleId)}">以前的内容在插件里</button>`
        : `<p class="rmt-floor-note">${core_text.esc(view.detail)}</p>`;
    return `<div class="rmt-floor-external"${pending}>${status}<details data-rmt-floor-details><summary data-rmt-reveal="${core_text.esc(view.revealId)}"><b>${core_text.esc(view.title)}</b><small>${core_text.esc(view.detail)}</small></summary>${body}</details></div>`;
}

function paint(context) {
    if (shell_state.shellBlocksChatInput()) return;
    const view = viewFor(context);
    const toast = shell_state.toastForTransition(lastPhase, view.phase, { line: view.title }, { initial: !sawPhase });
    sawPhase = true;
    lastPhase = view.phase;
    if (toast) {
        const options = view.revealId ? { onclick: () => openReveal(view.revealId) } : undefined;
        globalThis.toastr?.[toast.level]?.(toast.message, toast.title, options);
    }
    if (view.phase === 'hidden') { clearShells(); return; }
    const index = latestAssistantIndex(context.chat);
    const mes = ui_floor.messageElement(index);
    if (!mes || ui_floor.writesMessageText()) { clearShells(); return; }
    ensureCss();
    let host = mes.nextElementSibling;
    if (!host || host.dataset.rmtFloorShell !== '1') {
        clearShells();
        host = ui_floor.placeAfterMessage(mes);
    }
    if (!host) return;
    if (view.phase === 'pace' && host.dataset.rmtPhase === 'pace' && host.dataset.rmtPace === view.detail) return;
    const details = host.querySelector('[data-rmt-floor-details]');
    const body = host.querySelector('[data-rmt-floor-body]');
    const sameReveal = host.dataset.rmtPhase === view.phase && host.dataset.rmtReveal === view.revealId && details?.open && body?.childElementCount;
    host.dataset.rmtPhase = view.phase;
    host.dataset.rmtReveal = view.revealId;
    host.dataset.rmtPace = view.phase === 'pace' ? view.detail : '';
    host.dataset.rmtPending = view.phase === 'reveal' ? '0' : '1';
    if (sameReveal) {
        const title = host.querySelector('summary b');
        const detail = host.querySelector('summary small');
        if (title) title.textContent = view.title;
        if (detail) detail.textContent = view.detail;
        return;
    }
    const wasOpen = !!details?.open;
    host.innerHTML = markup(view);
    if (wasOpen) host.querySelector('[data-rmt-floor-details]')?.setAttribute('open', '');
    try { ui_taskCenter.syncLiveTaskStrip(); } catch { /* 任务条刷新失败时，楼层下面的状态仍保留。 */ }
}

function sync() {
    let context;
    try { context = core_context.currentCharacterGuard(); }
    catch { clearShells(); return; }
    try { paint(context); }
    catch (error) {
        console.warn('[HeartbeatMemories] floor shell skipped', core_text.safeErrorDiagnostic(error));
        clearShells();
    }
}

function incrementFor(moduleId, revealId) {
    try {
        const context = core_context.currentCharacterGuard();
        const snapshot = readSnapshot(context);
        const plan = snapshot?.modulePlan?.moduleId === moduleId ? snapshot.modulePlan : null;
        const reveal = snapshot?.revealRecords?.find(row => row.id === revealId);
        const memory = archive_repository.getImportedMemory(context);
        const session = core_cache.loadSession(moduleId, { context, memoryBank: memory, clone: true });
        return incremental_view.incrementalProjection(session, {
            sourceMemoryIds: plan?.sourceMemoryIds || reveal?.sourceMemoryIds || [],
            createdAt: reveal?.createdAt || 0,
        });
    } catch {
        return { kept: false, session: null };
    }
}

async function openInFloor(body) {
    const moduleId = body?.dataset?.rmtModule || '';
    const revealId = body?.dataset?.rmtReveal || '';
    const item = auto_memory_registry.autoMemoryModuleById(moduleId);
    if (!item || !body) return;
    const increment = incrementFor(moduleId, revealId);
    if (!increment.kept) {
        body.innerHTML = '<p class="rmt-floor-note">这一轮没有单独的新增段落。以前的内容在插件里。</p>';
        rememberOpened(revealId);
        return;
    }
    mirrorModuleCss();
    body.dataset.rmtFloorLive = '1';
    const previousMode = runtimeState.activeMode;
    const previousSession = runtimeState.activeSession;
    try {
        await Promise.resolve(ui_overlay.openCachedOrGenerate(item.id, { workspaceRoute: item.id, incrementalSession: increment.session }));
    } catch (error) {
        console.warn('[HeartbeatMemories] floor detail skipped', core_text.safeErrorDiagnostic(error));
        globalThis.toastr?.error?.('这一页暂时没能打开。回忆还在，可以再点一次。', '心口顿了一下');
        return;
    } finally {
        delete body.dataset.rmtFloorLive;
        runtimeState.activeMode = previousMode;
        runtimeState.activeSession = previousSession;
    }
    rememberOpened(revealId);
}

function openPlugin(moduleId) {
    const item = auto_memory_registry.autoMemoryModuleById(moduleId);
    if (!item) return;
    try {
        ui_overlay.openOverlay();
        ui_overlay.openCachedOrGenerate(item.id, { workspaceRoute: item.id });
    } catch (error) {
        console.warn('[HeartbeatMemories] plugin page skipped', core_text.safeErrorDiagnostic(error));
        globalThis.toastr?.error?.('插件里的这一页暂时没能打开。已经记下的内容还在。', '心口顿了一下');
    }
}

function rememberOpened(revealId) {
    if (!revealId) return;
    try {
        const context = core_context.currentCharacterGuard();
        const snapshot = readSnapshot(context);
        const marked = ui_reveal.markRevealOpened(snapshot, revealId, Date.now());
        if (!marked.changed) return;
        auto_memory_plan.commitAutoMemoryMetadata(context.chatMetadata, marked.snapshot, snapshot.plan.revision);
        context.saveMetadataDebounced?.();
    } catch (error) {
        console.warn('[HeartbeatMemories] reveal read state skipped', core_text.safeErrorDiagnostic(error));
    }
}

function openReveal(revealId) {
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(revealId || '')) return;
    const details = document.querySelector(`[data-rmt-floor-shell][data-rmt-reveal="${revealId}"] [data-rmt-floor-details]`);
    if (!details) return;
    if (!details.open) details.open = true;
    else void openInFloor(details.querySelector('[data-rmt-floor-body]'));
}

function onClick(event) {
    const plugin = event.target?.closest?.('[data-rmt-floor-plugin]');
    if (!plugin) return;
    event.preventDefault();
    event.stopPropagation();
    openPlugin(plugin.dataset.rmtModule || '');
}

function onToggle(event) {
    const details = event.target?.closest?.('[data-rmt-floor-details]');
    if (!details?.open) return;
    const body = details.querySelector('[data-rmt-floor-body]');
    if (body) void openInFloor(body);
}

export function stopAutoMemoryShell() {
    cleanup?.();
    cleanup = null;
    if (timer) clearInterval(timer);
    timer = 0;
    lastPhase = '';
    sawPhase = false;
    clearShells();
}

export function startAutoMemoryShell() {
    stopAutoMemoryShell();
    let context;
    try { context = core_context.getContext(); }
    catch { return; }
    const source = context?.eventSource;
    const types = context?.eventTypes || context?.event_types || {};
    const events = [...new Set([types.MESSAGE_SENT, types.MESSAGE_RECEIVED, types.MESSAGE_UPDATED, types.CHARACTER_MESSAGE_RENDERED, types.CHAT_CHANGED, types.CHAT_LOADED].filter(Boolean))];
    const onChat = () => { lastPhase = ''; sawPhase = false; sync(); };
    const listener = () => sync();
    if (source?.on) {
        for (const type of events) source.on(type, type === types.CHAT_CHANGED ? onChat : listener);
        cleanup = () => { for (const type of events) source.off?.(type, type === types.CHAT_CHANGED ? onChat : listener); };
    }
    document.addEventListener('click', onClick);
    document.addEventListener('toggle', onToggle, true);
    const removeToggle = () => {
        document.removeEventListener('click', onClick);
        document.removeEventListener('toggle', onToggle, true);
    };
    const previous = cleanup;
    cleanup = () => { previous?.(); removeToggle(); };
    timer = setInterval(sync, 2000);
    sync();
}
