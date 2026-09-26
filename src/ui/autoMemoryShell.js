// 外置壳贴在角色楼层下面，点开才展开。档案没写完时不挂壳，也不显示建档进度。
import * as archive_repository from '../archive/repository.js';
import * as incremental_view from '../autoMemory/incrementalView.js';
import * as core_cache from '../core/cache.js';
import { state as runtimeState } from '../core/state.js';
import * as auto_memory_floor from '../autoMemory/floorPace.js';
import * as auto_memory_gap from '../autoMemory/gapFill.js';
import * as auto_memory_plan from '../autoMemory/planStore.js';
import * as auto_memory_registry from '../autoMemory/moduleRegistry.js';
import * as auto_memory_scheduler from '../autoMemory/scheduler.js';
import * as auto_memory_stream from '../autoMemory/streamGate.js';
import * as shell_state from '../autoMemory/shellState.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_settings from '../core/settings.js';
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
let letterSession = null;
let letterMode = '';
let letterParked = false;
let parkedMode = null;
let parkedSession = null;

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
.rmt-floor-shell{position:relative!important;inset:auto!important;z-index:auto!important;height:auto!important;width:min(96%,640px)!important;max-height:none!important;display:block!important;padding:0!important;background:transparent!important;backdrop-filter:none!important}
${shell_state.floorShellCss()}`;
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

function releaseLetterRuntime() {
    if (letterParked && runtimeState.activeSession === letterSession) {
        runtimeState.activeMode = parkedMode;
        runtimeState.activeSession = parkedSession;
    }
    letterParked = false;
    parkedMode = null;
    parkedSession = null;
    letterSession = null;
    letterMode = '';
}

function clearShells() {
    releaseLetterRuntime();
    document.querySelectorAll('[data-rmt-floor-shell]').forEach(node => node.remove());
}

function roundReveal(records, moduleId, ids, steps, ticket) {
    const mine = records.filter(row => row.moduleId === moduleId);
    const matched = ids.size ? mine.find(row => (row.sourceMemoryIds || []).some(id => ids.has(id))) : null;
    if (matched) return matched;
    const busy = steps.some(step => step.status !== 'completed') || ticket?.status === 'drawn' || ticket?.status === 'running';
    if (busy || !moduleId) return null;
    return mine[0] || null;
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
    const stepsForReveal = snapshot.modulePlan?.steps || [];
    const roundIds = new Set([...(snapshot.modulePlan?.sourceMemoryIds || []), ...(ticket?.sourceMemoryIds || [])]);
    const reveal = roundReveal([...snapshot.revealRecords].reverse(), moduleId, roundIds, stepsForReveal, ticket);
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
        roundReveal: !!reveal && !stepsForReveal.some(step => step.status !== 'completed') && (reveal.status === 'ready' || reveal.status === 'opened'),
        revealLine: shell_state.revealFace({
            userName: context.name1,
            achievementTitle: auto_memory_gap.rememberedAchievementTitle(context.chatMetadata, reveal?.achievementId),
            moduleTitle: item?.title || '',
        }),
        failureRecoverable: !running && (failedStep || common.state === 'failed' || common.state === 'retry'),
        paused: moduleRow?.phase === 'queue',
        floor: core_settings.getPluginSettings().autoMemoryLatestFloor === true
            ? auto_memory_floor.assistantFloorCount(context.chat)
            : (Array.isArray(context.chat) ? context.chat.length : 0),
        nextDueFloor: snapshot.plan.nextDueFloor,
        gapText: auto_memory_gap.readableGap(context.chatMetadata?.[auto_memory_gap.GAP_KEY])?.text || '',
        canFill: auto_memory_gap.readableGap(context.chatMetadata?.[auto_memory_gap.GAP_KEY])?.canFill === true,
    });
}

function markup(view) {
    if (view.phase === 'pace') {
        const gap = view.gapText
            ? `<small>${core_text.esc(view.gapText)}</small>${view.canFill ? '<button type="button" class="rmt-btn rmt-floor-fill" data-rmt-floor-fill>补</button>' : ''}`
            : '';
        return `<p class="rmt-floor-pace" data-rmt-floor-pace><span>留忆</span><b>${core_text.esc(view.detail)}</b>${gap}</p>`;
    }
    const retry = view.phase === 'failed'
        ? '<button type="button" class="rmt-btn" data-rmt-floor-retry>重试</button>'
        : '';
    const revealPaper = view.phase === 'reveal' && view.showReveal;
    const heading = revealPaper ? '一封写给你的信' : view.title;
    const aside = revealPaper ? '点开看看' : view.detail;
    const paper = revealPaper
        ? `<p data-rmt-letter-title>${core_text.esc(view.title)}</p><button type="button" class="rmt-btn" data-rmt-letter-read data-rmt-reveal="${core_text.esc(view.revealId)}" data-rmt-module="${core_text.esc(view.moduleId)}">打开这封回忆</button>`
        : `<p data-rmt-letter-detail>${core_text.esc(view.detail)}</p>${view.moduleId ? `<button type="button" class="rmt-btn" data-rmt-letter-read data-rmt-reveal="${core_text.esc(view.revealId)}" data-rmt-module="${core_text.esc(view.moduleId)}">打开这页回忆</button>` : ''}`;
    return `<article class="rmt-heart-letter">
        <button type="button" class="rmt-heart-letter-seal" data-rmt-letter-open>
            <i aria-hidden="true">♥</i><b data-rmt-letter-title>${core_text.esc(heading)}</b><small data-rmt-letter-detail>${core_text.esc(aside)}</small>
        </button>
        <div class="rmt-heart-letter-paper" data-rmt-letter-paper hidden>
            ${paper}
            <div class="rmt-floor-body" data-rmt-floor-body data-rmt-reveal="${core_text.esc(view.revealId)}" data-rmt-module="${core_text.esc(view.moduleId)}"></div>
            ${retry}
        </div>
    </article>`;
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
    if (!auto_memory_floor.assistantBodyReady(context.chat, { generating: auto_memory_stream.generationOpen(context) })) {
        clearShells();
        return;
    }
    const index = latestAssistantIndex(context.chat);
    const mes = ui_floor.messageElement(index);
    if (!mes || ui_floor.writesMessageText()) { clearShells(); return; }
    ensureCss();
    mirrorModuleCss();
    let host = mes.querySelector('[data-rmt-floor-shell="1"]');
    if (!host) {
        clearShells();
        host = ui_floor.placeAfterMessage(mes);
    }
    if (!host) return;
    if (view.phase === 'pace' && host.dataset.rmtPhase === 'pace' && host.dataset.rmtPace === view.detail && host.dataset.rmtGap === (view.gapText || '')) return;
    const paper = host.querySelector('[data-rmt-letter-paper]');
    const body = host.querySelector('[data-rmt-floor-body]');
    const sameLetter = host.dataset.rmtPhase === view.phase && host.dataset.rmtReveal === view.revealId && host.dataset.rmtPace === (view.phase === 'pace' ? view.detail : '');
    host.dataset.rmtPhase = view.phase;
    host.dataset.rmtReveal = view.revealId;
    host.dataset.rmtPace = view.phase === 'pace' ? view.detail : '';
    host.dataset.rmtGap = view.gapText || '';
    host.dataset.rmtPending = view.phase === 'reveal' ? '0' : '1';
    if (sameLetter) {
        if (paper && !paper.hidden && body?.childElementCount) return;
        const title = host.querySelector('[data-rmt-letter-title]');
        const detail = host.querySelector('[data-rmt-letter-detail]');
        if (title && view.phase !== 'reveal') title.textContent = view.title;
        if (detail) detail.textContent = view.detail;
        if (title || detail || (paper && !paper.hidden)) return;
    }
    const paperWasOpen = paper && !paper.hidden;
    host.innerHTML = markup(view);
    if (paperWasOpen) {
        const nextPaper = host.querySelector('[data-rmt-letter-paper]');
        const seal = host.querySelector('[data-rmt-letter-open]');
        if (nextPaper) nextPaper.hidden = false;
        if (seal) seal.hidden = true;
    }
    try { ui_taskCenter.syncLiveTaskStrip(); } catch { /* 任务条刷新失败时，楼层下面的状态仍保留。 */ }
}

function sync() {
    let context;
    try { context = core_context.getContext(); }
    catch { clearShells(); return; }
    if (context?.groupId) { clearShells(); return; }
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
        const ticket = snapshot?.drawTickets?.find(item => item.id === snapshot.plan?.activeDrawTicketId && item.selectedModuleId === moduleId) || null;
        const reveal = snapshot?.revealRecords?.find(row => row.id === revealId && row.moduleId === moduleId);
        const sourceMemoryIds = plan?.sourceMemoryIds?.length
            ? plan.sourceMemoryIds
            : (ticket?.sourceMemoryIds?.length ? ticket.sourceMemoryIds : (reveal?.sourceMemoryIds || []));
        const memory = archive_repository.getImportedMemory(context);
        const session = core_cache.loadSession(moduleId, { context, memoryBank: memory, clone: true });
        return incremental_view.incrementalProjection(session, {
            sourceMemoryIds,
            createdAt: reveal?.createdAt || 0,
            since: plan?.frozenAt || 0,
        });
    } catch {
        return { kept: false, session: null };
    }
}

function engageLetter(body) {
    if (!body || !letterSession) return false;
    if (!letterParked) {
        parkedMode = runtimeState.activeMode;
        parkedSession = runtimeState.activeSession;
        letterParked = true;
    }
    body.dataset.rmtFloorLive = '1';
    runtimeState.activeMode = letterMode;
    runtimeState.activeSession = letterSession;
    return true;
}

async function openInFloor(body) {
    const moduleId = body?.dataset?.rmtModule || '';
    const revealId = body?.dataset?.rmtReveal || '';
    const item = auto_memory_registry.autoMemoryModuleById(moduleId);
    if (!item || !body) return;
    const increment = incrementFor(moduleId, revealId);
    letterSession = increment.kept ? increment.session : null;
    letterMode = item.id;
    if (!letterSession) {
        body.innerHTML = '<p class="rmt-floor-note">这一轮还没有新的段落。写好之后，这里只放新的。</p>';
        return;
    }
    mirrorModuleCss();
    try {
        if (!engageLetter(body)) return;
        await Promise.resolve(ui_overlay.openCachedOrGenerate(item.id, { workspaceRoute: item.id, incrementalSession: letterSession }));
    } catch (error) {
        console.warn('[HeartbeatMemories] floor detail skipped', core_text.safeErrorDiagnostic(error));
        globalThis.toastr?.error?.('这一页暂时没能打开。回忆还在，可以再点一次。', '心口顿了一下');
        return;
    }
    rememberOpened(revealId);
}

function openReveal(revealId) {
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(revealId || '')) return;
    const seal = document.querySelector(`[data-rmt-floor-shell][data-rmt-reveal="${revealId}"] [data-rmt-letter-open]`);
    if (!seal || seal.hidden) return;
    const paper = seal.parentElement?.querySelector('[data-rmt-letter-paper]');
    if (paper) paper.hidden = false;
    seal.hidden = true;
}

function onClick(event) {
    const fill = event.target?.closest?.('[data-rmt-floor-fill]');
    if (fill) {
        event.preventDefault();
        event.stopPropagation();
        fill.disabled = true;
        void auto_memory_scheduler.fillFloorGap().finally(() => { fill.disabled = false; sync(); });
        return;
    }
    const retry = event.target?.closest?.('[data-rmt-floor-retry]');
    if (retry) {
        event.preventDefault();
        event.stopPropagation();
        retry.disabled = true;
        void auto_memory_scheduler.resumeFloorPlan().catch(error => {
            console.warn('[HeartbeatMemories] floor retry skipped', core_text.safeErrorDiagnostic(error));
            globalThis.toastr?.error?.('这一封暂时没能续上。可以再点一次重试。', '心口顿了一下');
        }).finally(() => { retry.disabled = false; sync(); });
        return;
    }
    const read = event.target?.closest?.('[data-rmt-letter-read]');
    if (read) {
        event.preventDefault();
        event.stopPropagation();
        void openInFloor(read.parentElement?.querySelector('[data-rmt-floor-body]'));
        return;
    }
    const floorBody = event.target?.closest?.('[data-rmt-floor-body]');
    if (floorBody?.childElementCount && letterSession && floorBody.dataset.rmtModule === letterMode) {
        event.preventDefault();
        event.stopPropagation();
        if (engageLetter(floorBody)) ui_overlay.handleOverlayClick(event);
        return;
    }
    const seal = event.target?.closest?.('[data-rmt-letter-open]');
    if (!seal) return;
    event.preventDefault();
    event.stopPropagation();
    const paper = seal.parentElement?.querySelector('[data-rmt-letter-paper]');
    if (paper) paper.hidden = false;
    seal.hidden = true;
    const host = seal.closest?.('[data-rmt-floor-shell]');
    if (host?.dataset?.rmtPhase === 'reveal') return;
    const body = paper?.querySelector?.('[data-rmt-floor-body]');
    if (body?.dataset?.rmtModule) void openInFloor(body);
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
    const removeToggle = () => {
        document.removeEventListener('click', onClick);
    };
    const previous = cleanup;
    cleanup = () => { previous?.(); removeToggle(); };
    timer = setInterval(sync, 2000);
    sync();
}
