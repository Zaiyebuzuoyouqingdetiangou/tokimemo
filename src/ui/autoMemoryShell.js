// 外置壳贴在角色楼层下面，点开才展开。档案没写完时不挂壳，也不显示建档进度。
import * as archive_avatars from './archiveAvatars.js';
import * as archive_repository from '../archive/repository.js';
import * as archive_snapshots from '../archive/snapshots.js';
import * as incremental_view from '../autoMemory/incrementalView.js';
import * as core_cache from '../core/cache.js';
import * as auto_memory_library from '../autoMemory/achievementLibrary.js';
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
import * as room_layout from '../modes/roomLayout.js';
import * as ui_styles from './styles.js';
import * as ui_taskCenter from './taskCenter.js';

let cleanup = null;
let lastPhase = '';
let sawPhase = false;
let autoRepairLatch = '';
let timer = 0;
let stallState = { signature: '', since: 0 };
let stallNoted = false;

export function floorShellCss() {
    return shell_state.floorShellCss();
}

function ensureCss() {
    if (!document.getElementById('rmt-floor-shell-style')) {
        const style = document.createElement('style');
        style.id = 'rmt-floor-shell-style';
        style.textContent = floorShellCss();
        document.head?.appendChild(style);
    }
    let guard = document.getElementById('rmt-letter-guard');
    if (!guard) {
        guard = document.createElement('style');
        guard.id = 'rmt-letter-guard';
        guard.textContent = `#chat .mes .rmt-floor-shell .rmt-heart-letter-paper .rmt-floor-body,#chat .mes .rmt-floor-shell .rmt-heart-letter-paper .rmt-floor-body :is(p,h1,h2,h3,h4,h5,h6,article,pre,main,header,section,aside,figure,blockquote),.rmt-floor-shell .rmt-letter-song,.rmt-floor-shell .rmt-letter-song-line,.rmt-floor-shell .rmt-letter-song-title,.rmt-floor-shell .rmt-letter-song-label,.rmt-floor-shell [data-rmt-letter-achievement],.rmt-floor-shell [data-rmt-letter-copy]{display:block!important;visibility:visible!important;height:auto!important;max-height:none!important;overflow:visible!important;opacity:1!important;position:static!important;color:#5c463c!important;-webkit-text-fill-color:#5c463c!important;font-size:15px!important;line-height:1.8!important;white-space:pre-wrap!important}#chat .mes .rmt-floor-shell .rmt-heart-letter-paper .rmt-floor-body{max-height:70vh!important;overflow:auto!important}.rmt-floor-shell .rmt-letter-song-title{font-size:22px!important;font-weight:700!important}`;
    }
    document.head?.appendChild(guard);
}

function pinLetterNode(node, scrolling = false) {
    if (!node?.style?.setProperty) return;
    node.style.setProperty('display', 'block', 'important');
    node.style.setProperty('visibility', 'visible', 'important');
    node.style.setProperty('height', 'auto', 'important');
    node.style.setProperty('max-height', scrolling ? '70vh' : 'none', 'important');
    node.style.setProperty('overflow', scrolling ? 'auto' : 'visible', 'important');
    node.style.setProperty('opacity', '1', 'important');
    node.style.setProperty('position', 'static', 'important');
    node.style.setProperty('transform', 'none', 'important');
    node.style.setProperty('color', '#5c463c', 'important');
    node.style.setProperty('-webkit-text-fill-color', '#5c463c', 'important');
    node.style.setProperty('font-size', '15px', 'important');
    node.style.setProperty('line-height', '1.8', 'important');
    node.style.setProperty('white-space', 'pre-wrap', 'important');
}

const PINNED_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'ARTICLE', 'PRE', 'MAIN', 'HEADER', 'SECTION', 'ASIDE', 'FIGURE', 'FIGCAPTION', 'BLOCKQUOTE']);

function pinRound(body) {
    pinLetterNode(body, true);
    body?.querySelectorAll?.('*')?.forEach(node => {
        if (node.tagName === 'BUTTON') return;
        const force = PINNED_TAGS.has(node.tagName) || node.classList?.contains('rmt-letter-song') || node.classList?.contains('rmt-letter-song-line') || node.classList?.contains('rmt-letter-song-title') || node.classList?.contains('rmt-round-reading');
        if (force) pinLetterNode(node);
        else if (node.style?.setProperty) {
            node.style.setProperty('visibility', 'visible', 'important');
            node.style.setProperty('opacity', '1', 'important');
            node.style.setProperty('max-height', 'none', 'important');
        }
    });
    const paper = body?.parentElement;
    if (paper?.classList?.contains('rmt-heart-letter-paper')) {
        paper.style.setProperty('overflow', 'visible', 'important');
        paper.style.setProperty('height', 'auto', 'important');
        paper.style.setProperty('max-height', 'none', 'important');
        paper.querySelectorAll?.('[data-rmt-letter-achievement],[data-rmt-letter-copy]')?.forEach(node => pinLetterNode(node));
    }
}

function mirrorModuleCss() {
    try { ui_styles.ensureStyles(); } catch { /* 样式还没准备好时，楼层壳仍显示摘要。 */ }
    const source = document.getElementById(core_constants.STYLE_ID);
    if (!source || document.getElementById('rmt-floor-module-css')) return;
    const copied = source.textContent.replaceAll(`#${core_constants.OVERLAY_ID}`, '.rmt-floor-shell');
    const roomCss = room_layout.roomLayoutCss('.rmt-floor-shell');
    const style = document.createElement('style');
    style.id = 'rmt-floor-module-css';
    style.textContent = `${copied}
.rmt-floor-shell{position:relative!important;inset:auto!important;z-index:auto!important;height:auto!important;width:min(96%,420px)!important;max-height:none!important;display:block!important;padding:0!important;background:transparent!important;backdrop-filter:none!important}
${shell_state.floorShellCss()}
${roomCss}
${shell_state.promoteNarrowLayout(`${copied}\n${roomCss}`)}`;
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

function roundIsEmpty(moduleId, reveal, running, steps, ticket, moduleComplete, previewKept) {
    const open = running
        || ticket?.status === 'drawn'
        || ticket?.status === 'running'
        || steps.some(step => step.status === 'pending' || step.status === 'running' || step.status === 'failed');
    if (open || !moduleId || previewKept === true) return false;
    const settled = moduleComplete === true || reveal?.status === 'ready' || reveal?.status === 'opened';
    if (!settled) return false;
    return true;
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
    const previewKept = moduleId ? incrementFor(moduleId, reveal?.id || '').kept === true : false;
    const stored = auto_memory_library.autoAchievementForReveal(context, {
        achievementId: reveal?.achievementId || '',
        moduleId,
        sourceMemoryIds: [...roundIds],
    });
    const rememberedTitle = auto_memory_gap.rememberedAchievementTitle(context.chatMetadata, reveal?.achievementId);
    const rememberedCopy = auto_memory_gap.rememberedAchievementCopy(context.chatMetadata, reveal?.achievementId);
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
        drawFloor: (snapshot.drawTickets.find(item => item.id === (snapshot.modulePlan?.drawId || snapshot.plan.activeDrawTicketId)) || ticket)?.dueFloor || 0,
        roundReveal: !!reveal && !stepsForReveal.some(step => step.status !== 'completed') && (reveal.status === 'ready' || reveal.status === 'opened'),
        revealLine: stored?.title || rememberedTitle || '',
        achievementCopy: stored?.description || rememberedCopy || '',
        preferLibraryAchievement: true,
        roundEmpty: roundIsEmpty(moduleId, reveal, running, steps, ticket, moduleComplete, previewKept),
        canOpen: previewKept,
        failureRecoverable: !running && (failedStep || common.state === 'failed' || common.state === 'retry'),
        paused: moduleRow?.phase === 'queue',
        floor: core_settings.getPluginSettings().autoMemoryLatestFloor === true
            ? auto_memory_floor.assistantFloorCount(context.chat)
            : (Array.isArray(context.chat) ? context.chat.length : 0),
        nextDueFloor: snapshot.plan.nextDueFloor,
        intervalFloors: snapshot.plan.intervalFloors,
        gapText: auto_memory_gap.readableGap(context.chatMetadata?.[auto_memory_gap.GAP_KEY])?.text || '',
        canFill: auto_memory_gap.readableGap(context.chatMetadata?.[auto_memory_gap.GAP_KEY])?.canFill === true,
    });
}

function envelopeArt() {
    return `<svg class="rmt-envelope" viewBox="0 0 280 190" aria-hidden="true">
        <rect x="8" y="18" width="264" height="164" rx="22" fill="#f6c6d4"/>
        <path d="M8 146 L140 86 L272 146 L272 160 Q272 182 250 182 L30 182 Q8 182 8 160 Z" fill="#f3b4c8"/>
        <path d="M8 146 L140 86 L140 182 L30 182 Q8 182 8 160 Z" fill="#eea9c0"/>
        <path d="M20 36 L260 36 L140 124 Z" fill="#fff2f5"/>
        <path d="M20 36 L140 124 L140 36 Z" fill="#fde7ee"/>
        <path d="M140 112c-15-13-34-26-34-43 0-12 9-21 21-21 7 0 13 4 13 4s6-4 13-4c12 0 21 9 21 21 0 17-19 30-34 43z" fill="#d64578"/>
    </svg>`;
}

function markup(view) {
    if (view.phase === 'pace') {
        const gap = view.gapText
            ? `<small>${core_text.esc(view.gapText)}</small>${view.canFill ? '<button type="button" class="rmt-btn rmt-floor-fill" data-rmt-floor-fill>补</button>' : ''}`
            : '';
        return `<p class="rmt-floor-pace" data-rmt-floor-pace><span>留忆</span><b>${core_text.esc(view.detail)}</b>${gap}</p>`;
    }
    const repair = view.canRepairAchievement
        ? '<button type="button" class="rmt-btn" data-rmt-floor-achievement>补成就</button>'
        : '';
    const complete = view.canComplete
        ? '<button type="button" class="rmt-btn" data-rmt-floor-complete>补全</button>'
        : '';
    const redo = view.canRedo
        ? '<button type="button" class="rmt-btn" data-rmt-floor-redo>重试</button>'
        : '';
    const retry = view.canRetry
        ? '<button type="button" class="rmt-btn" data-rmt-floor-retry>重试</button>'
        : '';
    const actions = repair || complete || redo || retry ? `<div class="rmt-heart-letter-actions">${repair}${complete}${redo}${retry}</div>` : '';
    const revealPaper = view.phase === 'reveal' && view.showReveal;
    const writing = view.phase === 'generating' || view.phase === 'planning';
    const caption = revealPaper ? '' : `<small data-rmt-letter-detail>${core_text.esc(view.detail || (writing ? '正在生成中' : ''))}</small>`;
    const heading = view.title ? `<div class="rmt-letter-song-title" data-rmt-letter-achievement>${core_text.esc(view.title)}</div>` : '';
    const copy = view.achievementCopy ? `<div class="rmt-letter-song-line" data-rmt-letter-copy>${core_text.esc(view.achievementCopy)}</div>` : '';
    const read = view.contentOpen ? '' : `<button type="button" class="rmt-btn" data-rmt-letter-read data-rmt-reveal="${core_text.esc(view.revealId)}" data-rmt-module="${core_text.esc(view.moduleId)}">打开回忆</button>`;
    const paper = revealPaper
        ? `<button type="button" class="rmt-btn rmt-heart-letter-close" data-rmt-letter-close>收起这封信</button>${heading}${copy}${read}`
        : '';
    return `<article class="rmt-heart-letter${writing ? ' is-writing' : ''}">
        <button type="button" class="rmt-heart-letter-seal" data-rmt-letter-open aria-label="${core_text.esc(revealPaper ? '拆开这封信' : view.detail || '回忆')}">
            ${envelopeArt()}${caption}
        </button>
        <div class="rmt-heart-letter-paper" data-rmt-letter-paper hidden>
            ${paper}
            <div class="rmt-floor-body" data-rmt-floor-body data-rmt-reveal="${core_text.esc(view.revealId)}" data-rmt-module="${core_text.esc(view.moduleId)}"></div>
        </div>
        ${actions}
    </article>`;
}

function generationRunning(context) {
    try {
        return core_requestCoordinator.listChatTaskSnapshot(context).some(row => row.currentChat && row.running && row.kind !== 'archive' && row.id !== 'archive-import');
    } catch {
        return false;
    }
}

function watchStall(view, context) {
    const running = generationRunning(context);
    const active = view.phase === 'generating' || view.phase === 'planning';
    const signature = [view.phase, view.moduleId, view.revealId, view.progress?.done || 0, view.progress?.total || 0, view.detail].join('|');
    const next = shell_state.generationStall({
        active, running, storyOpen: auto_memory_scheduler.storyStillWriting(context),
        signature, previous: stallState, now: Date.now(),
    });
    stallState = { signature: next.signature, since: next.since };
    if (next.stalled) {
        const detail = '90 秒没有新的进度。可以补全没写完的部分，或再试一次。';
        if (!stallNoted) {
            stallNoted = true;
            ui_taskCenter.noteAutoMemoryFloorFailure({ label: view.moduleTitle || '自动留忆', detail });
            void auto_memory_scheduler.failStalledFloor().catch(error => {
                console.warn('[HeartbeatMemories] stall mark skipped', core_text.safeErrorDiagnostic(error));
            });
        }
        return { ...view, phase: 'failed', canRetry: true, canComplete: true, title: '这份回忆停住了', detail };
    }
    if (running || view.phase === 'reveal' || view.phase === 'pace' || view.phase === 'hidden') {
        stallNoted = false;
        ui_taskCenter.clearAutoMemoryFloorFailure();
        return view;
    }
    if (view.phase === 'failed') {
        ui_taskCenter.noteAutoMemoryFloorFailure({
            label: view.moduleTitle || '自动留忆',
            detail: view.detail || '可以补全没写完的部分，或再试一次。',
        });
    }
    return view;
}

function paint(context) {
    if (shell_state.shellBlocksChatInput()) return;
    if (auto_memory_scheduler.storyStillWriting(context)) {
        stallState = { signature: '', since: 0 };
        stallNoted = false;
        try { ui_taskCenter.clearAutoMemoryFloorFailure(); } catch { /* 任务条稍后还会刷。 */ }
        clearShells();
        return;
    }
    const view = watchStall(viewFor(context), context);
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
    const contentOpen = view.phase === 'reveal' && host.dataset.rmtRead === view.revealId;
    view.contentOpen = contentOpen;
    const sameLetter = host.dataset.rmtPhase === view.phase && host.dataset.rmtReveal === view.revealId && host.dataset.rmtPace === (view.phase === 'pace' ? view.detail : '') && host.dataset.rmtOpen === (contentOpen ? '1' : '');
    host.dataset.rmtPhase = view.phase;
    host.dataset.rmtReveal = view.revealId;
    host.dataset.rmtPace = view.phase === 'pace' ? view.detail : '';
    host.dataset.rmtGap = view.gapText || '';
    host.dataset.rmtOpen = contentOpen ? '1' : '';
    host.dataset.rmtPending = view.phase === 'reveal' ? '0' : '1';
    if (view.phase !== 'reveal') delete host.dataset.rmtRead;
    if (sameLetter) {
        if (view.phase !== 'reveal' && body) {
            body.replaceChildren();
            delete body.dataset.rmtLetterRead;
        } else if (body?.dataset?.rmtLetterRead === '1' && view.canOpen) {
            if (body.dataset.rmtFloorLive === '1') body.removeAttribute('data-rmt-floor-live');
            writeRound(body, view.moduleId, view.revealId);
        }
        const achievement = host.querySelector('[data-rmt-letter-achievement]');
        const copy = host.querySelector('[data-rmt-letter-copy]');
        const detail = host.querySelector('[data-rmt-letter-detail]');
        if (achievement && view.phase === 'reveal') achievement.textContent = view.title;
        if (copy && view.phase === 'reveal') copy.textContent = view.achievementCopy || '';
        if (detail && view.phase !== 'reveal') detail.textContent = view.detail || '正在生成中';
        if (view.phase !== 'reveal') closeLetter(host);
        host.querySelector('.rmt-heart-letter')?.classList.toggle('is-writing', view.phase === 'generating' || view.phase === 'planning');
        queueAutomaticRepair(view);
        return;
    }
    const paperWasOpen = view.phase === 'reveal' && ((paper && !paper.hidden) || contentOpen);
    host.innerHTML = markup(view);
    if (paperWasOpen) {
        const nextPaper = host.querySelector('[data-rmt-letter-paper]');
        const seal = host.querySelector('[data-rmt-letter-open]');
        const nextBody = host.querySelector('[data-rmt-floor-body]');
        if (nextPaper) nextPaper.hidden = false;
        if (seal) seal.hidden = true;
        if (contentOpen && nextBody) {
            nextBody.dataset.rmtLetterRead = '1';
            writeRound(nextBody, view.moduleId, view.revealId);
        }
    }
    try { ui_taskCenter.syncLiveTaskStrip(); } catch { /* 任务条刷新失败时，楼层下面的状态仍保留。 */ }
    queueAutomaticRepair(view);
}

function queueAutomaticRepair(view) {
    if (!view?.canRetry && !view?.canRepairAchievement) {
        autoRepairLatch = '';
        return;
    }
    if (core_settings.getPluginSettings().autoRetryEnabled !== true) return;
    const token = `${view.phase}|${view.revealId}|${view.moduleId}|${view.canRepairAchievement ? 'achievement' : 'module'}`;
    if (autoRepairLatch === token) return;
    autoRepairLatch = token;
    void auto_memory_scheduler.automaticRepairIfNeeded().then(did => {
        if (did) sync();
    }).catch(error => {
        console.warn('[HeartbeatMemories] automatic repair skipped', core_text.safeErrorDiagnostic(error));
    });
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

function letterIdentity() {
    let context = null;
    try { context = core_context.getContext(); } catch { context = null; }
    const userFile = archive_avatars.currentUserAvatar(context);
    const userAvatar = userFile ? (archive_avatars.characterAvatarUrl(userFile, context) || archive_avatars.userAvatarUrl(userFile)) : '';
    let charAvatar = '';
    try {
        const file = archive_snapshots.currentCharacterAvatar(context);
        charAvatar = file ? (archive_avatars.characterAvatarUrl(file, context) || '') : '';
    } catch { charAvatar = ''; }
    return {
        characterName: context?.name2 || '角色',
        userName: context?.name1 || '你',
        charAvatar,
        userAvatar,
    };
}

function writeRound(body, moduleId, revealId) {
    const increment = incrementFor(moduleId, revealId);
    if (!increment.kept) {
        const phase = body.closest?.('[data-rmt-floor-shell]')?.dataset?.rmtPhase || '';
        const writing = phase === 'generating' || phase === 'planning';
        body.innerHTML = writing
            ? '<div class="rmt-letter-song-line">回忆正在生成中。</div>'
            : '<div class="rmt-letter-song"><div class="rmt-letter-song-line">这一轮写完了，但是没有新的段落。</div><div class="rmt-heart-letter-actions"><button type="button" class="rmt-btn" data-rmt-floor-complete>补全</button><button type="button" class="rmt-btn" data-rmt-floor-redo>重试</button></div></div>';
        pinRound(body);
        return false;
    }
    const html = incremental_view.roundReadingHtml(increment.session, letterIdentity());
    if (!html) {
        body.innerHTML = '<div class="rmt-letter-song"><div class="rmt-letter-song-line">这一轮写完了，但是没有新的段落。</div><div class="rmt-heart-letter-actions"><button type="button" class="rmt-btn" data-rmt-floor-complete>补全</button><button type="button" class="rmt-btn" data-rmt-floor-redo>重试</button></div></div>';
        pinRound(body);
        return false;
    }
    body.innerHTML = html;
    pinRound(body);
    const read = body.parentElement?.querySelector?.('[data-rmt-letter-read]');
    if (read) read.remove();
    const host = body.closest?.('[data-rmt-floor-shell]');
    if (host && revealId) {
        host.dataset.rmtRead = revealId;
        host.dataset.rmtOpen = '1';
    }
    return true;
}

function closeLetter(host) {
    const paper = host?.querySelector?.('[data-rmt-letter-paper]');
    const seal = host?.querySelector?.('[data-rmt-letter-open]');
    if (paper) paper.hidden = true;
    if (seal) seal.hidden = false;
}

async function openInFloor(body) {
    const moduleId = body?.dataset?.rmtModule || '';
    const revealId = body?.dataset?.rmtReveal || '';
    const item = auto_memory_registry.autoMemoryModuleById(moduleId);
    if (!item || !body) return;
    if (body.dataset.rmtFloorLive === '1') body.removeAttribute('data-rmt-floor-live');
    body.dataset.rmtLetterRead = '1';
    const host = body.closest?.('[data-rmt-floor-shell]');
    if (host?.dataset?.rmtPhase !== 'reveal') {
        body.replaceChildren();
        return;
    }
    if (!writeRound(body, moduleId, revealId)) return;
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

function watchFloorAction(promise, waiting) {
    return promise.then(result => {
        if (result?.action === 'wait' || result?.action === 'busy') {
            globalThis.toastr?.info?.(waiting, '心迹回廊');
        }
    });
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
    const repair = event.target?.closest?.('[data-rmt-floor-achievement]');
    if (repair) {
        event.preventDefault();
        event.stopPropagation();
        repair.disabled = true;
        void auto_memory_scheduler.repairFloorAchievement().catch(error => {
            console.warn('[HeartbeatMemories] achievement repair skipped', core_text.safeErrorDiagnostic(error));
            globalThis.toastr?.error?.('这一次没能补上成就。回忆还在，可以再点一次。', '心口顿了一下');
        }).finally(() => { repair.disabled = false; sync(); });
        return;
    }
    const complete = event.target?.closest?.('[data-rmt-floor-complete]');
    if (complete) {
        event.preventDefault();
        event.stopPropagation();
        complete.disabled = true;
        watchFloorAction(auto_memory_scheduler.completeFloorRound(), '等这楼正文写完，再补这一页。').catch(error => {
            console.warn('[HeartbeatMemories] floor complete skipped', core_text.safeErrorDiagnostic(error));
        }).finally(() => { complete.disabled = false; sync(); });
        return;
    }
    const redo = event.target?.closest?.('[data-rmt-floor-redo]');
    if (redo) {
        event.preventDefault();
        event.stopPropagation();
        redo.disabled = true;
        watchFloorAction(auto_memory_scheduler.retryFloorRound(), '等这楼正文写完，再重写这一页。').catch(error => {
            console.warn('[HeartbeatMemories] floor redo skipped', core_text.safeErrorDiagnostic(error));
        }).finally(() => { redo.disabled = false; sync(); });
        return;
    }
    const retry = event.target?.closest?.('[data-rmt-floor-retry]');
    if (retry) {
        event.preventDefault();
        event.stopPropagation();
        retry.disabled = true;
        watchFloorAction(auto_memory_scheduler.resumeFloorPlan(), '等这楼正文写完，再重写这一页。').catch(error => {
            console.warn('[HeartbeatMemories] floor retry skipped', core_text.safeErrorDiagnostic(error));
        }).finally(() => { retry.disabled = false; sync(); });
        return;
    }
    const close = event.target?.closest?.('[data-rmt-letter-close]');
    if (close) {
        event.preventDefault();
        event.stopPropagation();
        const paper = close.closest?.('[data-rmt-letter-paper]');
        const seal = paper?.parentElement?.querySelector?.('[data-rmt-letter-open]');
        if (paper) paper.hidden = true;
        if (seal) seal.hidden = false;
        return;
    }
    const read = event.target?.closest?.('[data-rmt-letter-read]');
    if (read) {
        event.preventDefault();
        event.stopPropagation();
        const paper = read.closest?.('[data-rmt-letter-paper]') || read.closest?.('[data-rmt-floor-shell]');
        void openInFloor(paper?.querySelector?.('[data-rmt-floor-body]'));
        return;
    }
    const seal = event.target?.closest?.('[data-rmt-letter-open]');
    if (!seal) return;
    event.preventDefault();
    event.stopPropagation();
    const host = seal.closest?.('[data-rmt-floor-shell]');
    if (host?.dataset?.rmtPhase !== 'reveal') return;
    const paper = seal.parentElement?.querySelector('[data-rmt-letter-paper]');
    if (paper) paper.hidden = false;
    seal.hidden = true;
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
