// 外置壳贴在角色楼层下面，不悬浮。点开详情进入插件里原来的那一页。
import * as auto_memory_plan from '../autoMemory/planStore.js';
import * as auto_memory_registry from '../autoMemory/moduleRegistry.js';
import * as shell_state from '../autoMemory/shellState.js';
import * as core_context from '../core/context.js';
import * as generation_status from '../core/generationStatus.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_taskTrace from '../core/taskTrace.js';
import * as core_text from '../core/text.js';
import * as ui_overlay from './overlay.js';
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

function latestAssistantIndex(chat) {
    if (!Array.isArray(chat)) return -1;
    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const message = chat[index];
        if (message && message.is_user !== true && message.is_system !== true) return index;
    }
    return -1;
}

function messageNode(index) {
    if (!Number.isSafeInteger(index) || index < 0) return null;
    return document.querySelector(`#chat .mes[mesid="${index}"]`) || document.querySelector(`.mes[mesid="${index}"]`);
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

function archiveProgress(rows) {
    const traces = core_taskTrace.taskTraceSnapshot();
    const trace = [...traces].reverse().find(row => row.mode === 'archive' && row.outcome === 'running' && row.chunks?.total > 0);
    const running = rows.find(row => row.currentChat && row.running && (row.kind === 'archive' || row.id === 'archive-import'));
    if (!running && !trace) return { archive: null, paused: false };
    if (running?.phase === 'queue') return { archive: null, paused: true };
    return {
        paused: false,
        archive: {
            waiting: running?.phase === 'prepare' && !trace,
            done: trace ? trace.chunks.ok : null,
            total: trace ? trace.chunks.total : null,
        },
    };
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
    const archive = archiveProgress(rows);
    const steps = snapshot.modulePlan?.steps || [];
    const failedStep = steps.some(step => step.status === 'failed') || ticket?.status === 'failed';
    const running = rows.some(row => row.currentChat && row.running);
    const common = generation_status.resolveGenerationStatus({
        running, partial: failedStep, hasContent: steps.some(step => step.status === 'completed'),
    });
    const moduleComplete = item?.isComplete?.(null, snapshot.modulePlan) === true && steps.length > 0 && steps.every(step => step.status === 'completed');
    return shell_state.shellView({
        enabled: true,
        moduleId,
        moduleTitle: item?.title || '',
        moduleComplete,
        steps,
        ticketStatus: ticket?.status || '',
        revealStatus: reveal?.status || '',
        revealLine: shell_state.revealFace({ userName: context.name1, achievementTitle: '', moduleTitle: item?.title || '' }),
        failureRecoverable: !running && (failedStep || common.state === 'failed' || common.state === 'retry'),
        paused: archive.paused,
        archive: archive.archive,
    });
}

function paint(context) {
    if (shell_state.shellBlocksChatInput()) return;
    const view = viewFor(context);
    const toast = shell_state.toastForTransition(lastPhase, view.phase, { line: view.title }, { initial: !sawPhase });
    sawPhase = true;
    lastPhase = view.phase;
    if (toast) globalThis.toastr?.[toast.level]?.(toast.message, toast.title);
    if (view.phase === 'hidden') { clearShells(); return; }
    const index = latestAssistantIndex(context.chat);
    const mes = messageNode(index);
    if (!mes) { clearShells(); return; }
    ensureCss();
    let host = mes.nextElementSibling;
    if (!host || host.dataset.rmtFloorShell !== '1') {
        clearShells();
        host = document.createElement('div');
        host.dataset.rmtFloorShell = '1';
        host.className = 'rmt-floor-shell';
        mes.insertAdjacentElement('afterend', host);
    }
    const open = view.showReveal && view.moduleId
        ? `<button type="button" class="rmt-btn" data-rmt-floor-open="${core_text.esc(view.moduleId)}">查看详情</button>`
        : '';
    const tasks = view.phase === 'reveal' ? '' : '<button type="button" class="rmt-btn" data-rmt-floor-tasks>任务里也能看到</button>';
    host.innerHTML = `<article class="rmt-floor-card"><b>${core_text.esc(view.title)}</b><p>${core_text.esc(view.detail)}</p>${open}${tasks}</article>`;
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

function openDetail(moduleId) {
    const item = auto_memory_registry.autoMemoryModuleById(moduleId);
    if (!item) return;
    try {
        ui_overlay.openOverlay();
        ui_overlay.openCachedOrGenerate(item.id, { workspaceRoute: item.id });
    } catch (error) {
        console.warn('[HeartbeatMemories] floor detail skipped', core_text.safeErrorDiagnostic(error));
        globalThis.toastr?.error?.('这一页暂时没能打开。回忆还在，可以再点一次。', '心口顿了一下');
    }
}

function openTasks() {
    try {
        ui_overlay.openOverlay();
        ui_taskCenter.handleTaskCenterAction('tasks');
    } catch (error) {
        console.warn('[HeartbeatMemories] floor tasks skipped', core_text.safeErrorDiagnostic(error));
        globalThis.toastr?.error?.('任务页暂时没能打开。楼层下面的进度还在。', '心口顿了一下');
    }
}

function onClick(event) {
    const open = event.target?.closest?.('[data-rmt-floor-open]');
    if (open) { openDetail(open.dataset.rmtFloorOpen || ''); return; }
    if (event.target?.closest?.('[data-rmt-floor-tasks]')) openTasks();
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
    const removeClick = () => document.removeEventListener('click', onClick);
    const previous = cleanup;
    cleanup = () => { previous?.(); removeClick(); };
    timer = setInterval(sync, 2000);
    sync();
}
