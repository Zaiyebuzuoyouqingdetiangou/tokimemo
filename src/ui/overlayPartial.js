import * as heart_reader from './heartReaderState.js';
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import { state as runtimeState } from '../core/state.js';
import * as navigation_bookmark from './navigationBookmark.js';
import * as recovery_view from './recoveryView.js';
import * as ui_workspaceState from './workspaceState.js';
import { bodyEl, calendarQuickAccessHtml } from './overlayShell.js';
import { renderActive, showChooser } from './overlayCore.js';
// 未完成任务视图：局部生成刷新、打开未完成任务、刷新已保存会话
// 从 ui/overlay.js 原样搬出（重构阶段 2），声明文本一字未改；ui/overlay.js 仍转发原有导出。

export async function refreshPartialGenerationView(mode, context, { draftId, pageId, archiveTarget = null, readerStillCurrent = null } = {}) {
    const host = document.getElementById(core_constants.OVERLAY_ID);
    if (!host || host.hidden) return false;
    const snapshot = runtimeState.activeArchiveSnapshot;
    if (snapshot?.taskResultDraftId && snapshot.taskResultDraftId !== draftId) return false;
    if (snapshot && !snapshot.taskResultDraftId) {
        if (snapshot.historyVersionId || snapshot.backupOnly || !archiveTarget
            || snapshot.entryId !== archiveTarget.entryId
            || snapshot.memory?.archiveRevision !== archiveTarget.memory?.archiveRevision
            || core_context.comparableChatId(snapshot.chatId) !== core_context.comparableChatId(archiveTarget.chatId)) return false;
        snapshot.cache = structuredClone(archiveTarget.cache);
        if (!runtimeState.activeMode) {
            const scrollTop = bodyEl()?.scrollTop || 0;
            archive_library.showIndexedArchiveSnapshot(snapshot);
            if (bodyEl()) bodyEl().scrollTop = scrollTop;
            return true;
        }
    }
    if (!snapshot && core_context.chatScopeKey(context) !== core_context.chatScopeKey(core_context.getContext())) return false;
    if (!snapshot && !runtimeState.activeMode && runtimeState.archiveViewLevel === 'chooser') {
        if (ui_workspaceState.workspace.tab === 'content') {
            const scrollTop = bodyEl()?.scrollTop || 0;
            showChooser({ section: 'content' });
            if (bodyEl()) bodyEl().scrollTop = scrollTop;
        } else {
            // Archive source selections may be half edited. Refresh only the
            // received-content controls, leaving those inputs in place.
            const memory = archive_repository.getImportedMemory(context);
            const stored = core_cache.getCache(context);
            const recovery = bodyEl()?.querySelector?.('[data-rmt-generation-recoveries]');
            if (recovery) recovery.innerHTML = recovery_view.recoveryBannerHtml(stored, memory);
            const session = core_cache.loadSession(mode, { context, memoryBank: memory, includePartial: true });
            const portal = bodyEl()?.querySelector?.(`.rmt-archive-portal [data-rmt-mode="${mode}"]`)
                ?.closest?.('.rmt-archive-portal')
                || bodyEl()?.querySelector?.(`[data-rmt-generate-mode="${mode}"]`)?.closest?.('.rmt-archive-portal');
            if (session && portal) {
                portal.classList.remove('empty'); portal.classList.add('ready');
                const open = portal.querySelector('.rmt-portal-open');
                open.disabled = false; open.setAttribute('data-rmt-mode', mode);
                const status = portal.querySelector('.rmt-portal-status');
                if (status) status.textContent = '已生成部分内容 · 可以先查看';
                const dot = portal.querySelector('.rmt-portal-lock, .rmt-portal-ready-dot');
                if (dot) { dot.className = 'rmt-portal-ready-dot'; dot.textContent = '…'; }
            }
            if (mode === core_constants.MODE.CALENDAR) {
                const quick = bodyEl()?.querySelector?.('[data-rmt-calendar-quick]');
                if (quick) quick.innerHTML = calendarQuickAccessHtml({ ready: !!memory, generated: !!session,
                    generating: core_requestCoordinator.isModeGenerating(mode), partial: !!session?.readableProgress });
            }
        }
        return true;
    }
    if (runtimeState.activeMode !== mode) return false;
    const prior = runtimeState.activeSession;
    // A full-page/background task does not own every later reader of its mode.
    // An explicitly opened view of this very draft can keep receiving progress;
    // otherwise the caller's original reader and position must still be current.
    const ownsDraft = snapshot?.taskResultDraftId === draftId
        || (prior?.readableProgress?.complete === false && prior.readableProgress.draftId === draftId);
    if (prior?.readableProgress?.explicitDraft && !ownsDraft) return false;
    if (!ownsDraft && typeof readerStillCurrent === 'function' && !readerStillCurrent()) return false;
    if (mode === core_constants.MODE.HEART && pageId && pageId !== 'heart') {
        const shownPage = ui_workspaceState.workspace.route === 'heart'
            ? heart_reader.heartReaderSession(prior)?.selectedSeason || 'spring' : ui_workspaceState.workspace.route;
        if (shownPage !== pageId) return false;
    }
    let memory, stored;
    if (snapshot?.taskResultDraftId) {
        const result = await core_cache.readGenerationTaskResult(context, draftId);
        if (runtimeState.activeArchiveSnapshot !== snapshot || runtimeState.activeSession !== prior
            || runtimeState.activeMode !== mode || host.hidden) return false;
        memory = result.sourceMemory;
        stored = { chatId: memory.chatId, archiveRevision: memory.archiveRevision, [mode]: result.session };
        snapshot.memory = structuredClone(memory); snapshot.cache = structuredClone(stored);
    } else if (snapshot) {
        memory = snapshot.memory; stored = snapshot.cache;
    } else {
        memory = archive_repository.getImportedMemory(context); stored = core_cache.getCache(context);
    }
    const exactResult = prior?.readableProgress?.explicitDraft ? stored?.[core_cache.GENERATION_DRAFTS_CACHE_KEY]?.records?.[prior.readableProgress.draftId]?.result : null;
    const session = exactResult ? core_cache.generationTaskResultSession({ draftId: prior.readableProgress.draftId, ...exactResult })
        : core_cache.loadSession(mode, { context, chatId: memory?.chatId, memoryBank: memory, cache: stored, clone: true, includePartial: true });
    if (!session?.readableProgress) return false;
    if (!snapshot && !exactResult && stored?.[core_cache.GENERATION_DRAFTS_CACHE_KEY]?.records?.[draftId]?.result?.sourceMemory?.archiveRevision !== memory?.archiveRevision) return false;
    for (const key of ['selectedId', 'selectedEntryId', 'selectedContainerId', 'selectedNodeId', 'category', 'page', 'viewPath',
        'selectedMonth', 'selectedDateKey', 'view', 'tab', 'reading', 'dialogueIndex', 'sharedMemory',
        'selectedSeason', 'selectedVoiceId', 'selectedScenarioId', 'selectedStripId', 'selectedFireflyId', 'selectedDramaKey']) {
        if (prior && Object.hasOwn(prior, key)) session[key] = structuredClone(prior[key]);
    }
    const body = bodyEl(), scrollTop = body?.scrollTop || 0;
    // The generation caller uses this reference to recognize its original
    // foreground reader at the final save. Progress is a refresh of that same
    // reader, not navigation to a replacement reader.
    if (prior && typeof readerStillCurrent === 'function') {
        for (const key of Object.keys(prior)) delete prior[key];
        Object.assign(prior, session);
        runtimeState.activeSession = prior;
    } else runtimeState.activeSession = session;
    ui_workspaceState.workspace.empty = null;
    renderActive();
    if (body) body.scrollTop = scrollTop;
    return true;
}

export function openPartialTaskSession(record) {
    runtimeState.activeArchiveSnapshot = null;
    runtimeState.activeArchiveReadOnly = false;
    runtimeState.activeMode = record.mode;
    runtimeState.activeSession = core_cache.generationTaskResultSession(record);
    runtimeState.archiveViewLevel = 'content';
    ui_workspaceState.prepareWorkspaceSession(record.mode, runtimeState.activeSession, record.pageId);
    renderActive();
}

// Refresh only the live saved reader. Drafts and historical views own separate data.
export function refreshSavedActiveSession() {
    if (runtimeState.activeArchiveSnapshot || !runtimeState.activeSession || !runtimeState.activeMode
        || (runtimeState.activeSession.readableProgress && runtimeState.activeSession.readableProgress.complete !== true) || runtimeState.contentManagerOpen) return false;
    const body = bodyEl();
    if (!body || body.querySelector('[data-rmt-cg-editor]')) return false;
    // Never replace an in-progress form edit in order to show a background result.
    if (body.contains(document.activeElement) && document.activeElement?.matches?.('input,textarea,select,[contenteditable=true]')) return false;
    const context = core_context.currentCharacterGuard();
    const memory = archive_repository.getImportedMemory(context);
    const next = core_cache.loadSession(runtimeState.activeMode, { context, memoryBank: memory, clone: true });
    if (!next) return false;
    const position = navigation_bookmark.readingPosition(runtimeState.activeSession);
    const scroll = body.scrollTop;
    const controls = [...body.querySelectorAll('input,textarea,select')].map(el => ({
        id: el.id, name: el.name, type: el.type, value: el.value, checked: el.checked,
    })).filter(el => el.id || el.name);
    runtimeState.activeSession = Object.assign(next, position);
    renderActive();
    for (const saved of controls) {
        const control = [...body.querySelectorAll('input,textarea,select')].find(el => saved.id ? el.id === saved.id : el.name === saved.name && el.type === saved.type);
        if (control) { control.value = saved.value; if ('checked' in control) control.checked = saved.checked; }
    }
    body.scrollTop = scroll;
    return true;
}
