import * as routePeople from '../core/routeParticipants.js';
import * as commonStatus from '../core/generationStatus.js';
import * as statusView from './generationStatus.js';
import * as composerOptions from '../core/generationOptions.js';
import * as archive_groups from '../archive/groups.js';
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import * as generation_recovery from '../generation/recovery.js';
import * as generation_merged from '../generation/mergedGeneration.js';
import * as modes_heart from '../modes/heart.js';
import { state as runtimeState } from '../core/state.js';
import * as ui_overlay from './overlay.js';
import * as ui_workspaceState from './workspaceState.js';

let painting = false;
let pumping = false;
const queue = [];
const autoRetryUsed = new Map();
const picks = new Set();
let pickScope = '';
const QUEUE_STATUS = { queued: '排队', running: '进行中', done: '完成', failed: '失败', cancelled: '已取消' };

function currentScope() {
    try { return core_context.chatScopeKey(); }
    catch { return ''; }
}

function syncPickScope() {
    const scope = currentScope();
    if (pickScope && scope && pickScope !== scope) picks.clear();
    if (scope) pickScope = scope;
}

export function queuePickHtml(route) {
    syncPickScope();
    const checked = picks.has(route) ? 'checked' : '';
    return `<label class="rmt-queue-pick"><input type="checkbox" data-rmt-queue-route="${core_text.esc(route)}" aria-label="选择${core_text.esc(ui_workspaceState.WORKSPACE_ROUTES[route]?.title || route)}加入队列" ${checked}></label>`;
}

export function selectedQueueRoutes() {
    syncPickScope();
    const order = Object.keys(ui_workspaceState.WORKSPACE_ROUTES);
    return [...picks].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export function setQueuePick(route, on) {
    syncPickScope();
    const spec = ui_workspaceState.WORKSPACE_ROUTES[route];
    if (!spec?.mode || spec.deep || spec.manualOnly) return;
    if (on) picks.add(route);
    else picks.delete(route);
}

function queuedForScope(scope = currentScope()) {
    return queue.filter(item => item.scope === scope && item.status === 'queued');
}

function dropForeignQueue() {
    const scope = currentScope();
    if (!scope) return;
    for (const item of queue) {
        if (item.scope !== scope && (item.status === 'queued' || item.status === 'running')) item.status = 'cancelled';
    }
}

function trimQueue() {
    const settled = queue.filter(item => item.status !== 'queued' && item.status !== 'running');
    const extra = settled.length - 8;
    if (extra <= 0) return;
    let removed = 0;
    for (let i = 0; i < queue.length && removed < extra; i += 1) {
        if (queue[i].status !== 'queued' && queue[i].status !== 'running') {
            queue.splice(i, 1);
            i -= 1;
            removed += 1;
        }
    }
}

export function noteRetryableGeneration(info) {
    const settings = core_settings.getPluginSettings();
    if (settings.autoRetryEnabled !== true) return;
    const mode = info?.mode;
    const draftId = info?.draftId || '';
    const pageId = info?.pageId || mode;
    if (!mode || !draftId || !Object.values(core_constants.MODE).includes(mode)) return;
    const scope = currentScope();
    if (!scope) return;
    const key = `${scope}|${draftId}|${pageId}|${mode}`;
    const used = autoRetryUsed.get(key) || 0;
    if (used >= settings.autoRetryCount) return;
    if (queue.some(item => item.kind === 'recovery' && item.draftId === draftId && item.pageId === pageId && item.status === 'queued')) return;
    autoRetryUsed.set(key, used + 1);
    queue.push({
        id: `retry-${Date.now().toString(36)}-${queue.length}`,
        kind: 'recovery',
        mode,
        draftId,
        pageId,
        label: info.label || core_constants.MODE_LABEL[mode] || mode,
        scope,
        status: 'queued',
        attached: false,
        automatic: true,
    });
    trimQueue();
    refreshTaskCenterView();
    // The failed task is still registered until its own finally runs. Start the
    // retry on the next turn so it does not overlap that same mode.
    setTimeout(() => { void pumpQueue(); }, 0);
}

export function enqueueSelectedModes(routes, frozenOptions = null) {
    const scope = currentScope();
    if (!scope) return 0;
    const pending = [];
    for (const route of routes) {
        const spec = ui_workspaceState.WORKSPACE_ROUTES[route];
        if (!spec?.mode || spec.deep || spec.manualOnly) continue;
        if ([...queue, ...pending].some(item => item.scope === scope && item.route === route && (item.status === 'queued' || item.status === 'running'))) continue;
        pending.push({
            id: `queue-${Date.now().toString(36)}-${queue.length + pending.length}`,
            route,
            mode: spec.mode,
            label: spec.title,
            scope,
            status: 'queued',
            attached: false,
            songOptions: frozenOptions?.[route]?.songOptions ?? (spec.mode === core_constants.MODE.THEME_SONG ? structuredClone(composerOptions.readSongOptions()) : undefined),
            participantSnapshot: frozenOptions && Object.hasOwn(frozenOptions, route) ? structuredClone(frozenOptions[route].participantSnapshot) : routePeople.captureRoutePeople(route),
        });

    }
    queue.push(...pending);
    for (const item of pending) picks.delete(item.route);
    trimQueue();
    refreshTaskCenterView();
    void pumpQueue();
    return pending.length;
}

function cancelQueuedItem(id) {
    const item = queue.find(row => row.id === id && row.status === 'queued');
    if (!item) return false;
    item.status = 'cancelled';
    trimQueue();
    refreshTaskCenterView();
    return true;
}

function cancelQueuedForCurrentScope() {
    for (const item of queuedForScope()) item.status = 'cancelled';
    trimQueue();
}

async function pumpQueue() {
    if (pumping) return;
    pumping = true;
    try {
        for (;;) {
            dropForeignQueue();
            const scope = currentScope();
            const attached = queue.find(item => item.status === 'running' && item.attached && item.scope === scope);
            if (attached) {
                if (core_requestCoordinator.isModeGenerating(attached.mode) || runtimeState.busy) return;
                attached.status = 'done';
                attached.attached = false;
                trimQueue();
                refreshTaskCenterView();
            }
            const next = queue.find(item => item.status === 'queued' && item.scope === scope);
            if (!next || runtimeState.busy) return;
            if (next.kind === 'recovery') {
                if (core_requestCoordinator.isModeGenerating(next.mode)) return;
                next.status = 'running';
                refreshTaskCenterView();
                try {
                    const result = await generation_client.continueSavedGeneration(next.mode, {
                        draftId: next.draftId, pageId: next.pageId, skipConfirm: true, background: true,
                    });
                    if (next.status === 'running') next.status = result == null ? 'failed' : 'done';
                } catch (error) {
                    if (next.status === 'running') next.status = error?.name === 'AbortError' ? 'cancelled' : 'failed';
                }
                trimQueue();
                refreshTaskCenterView();
                if (currentScope() !== scope) return;
                continue;
            }
            if (core_requestCoordinator.isModeGenerating(next.mode)) {
                // Heart pages share one mode id but are different jobs. Wait for the
                // current page instead of treating the next page as already running.
                if (next.mode === core_constants.MODE.HEART) return;
                next.status = 'running';
                next.attached = true;
                refreshTaskCenterView();
                return;
            }
            next.status = 'running';
            next.attached = false;
            refreshTaskCenterView();
            let result;
            try {
                result = await runQueuedGeneration(next);
            } catch (error) {
                if (next.status === 'running') next.status = error?.name === 'AbortError' ? 'cancelled' : 'failed';
                trimQueue();
                refreshTaskCenterView();
                if (currentScope() !== scope) return;
                continue;
            }
            if (next.status !== 'running') {
                trimQueue();
                refreshTaskCenterView();
                continue;
            }
            if (result == null && core_requestCoordinator.isModeGenerating(next.mode)) {
                next.attached = true;
                refreshTaskCenterView();
                return;
            }
            if (result?.status === 'cancelled') next.status = 'cancelled';
            else if (result?.status === 'failed' || result?.status === 'blocked') next.status = 'failed';
            else if (result != null) next.status = 'done';
            else {
                const settled = core_requestCoordinator.listChatTaskSnapshot().find(row => !row.running && row.label === next.label);
                next.status = settled?.phase === 'cancelled' || settled?.phaseLabel === '已取消' ? 'cancelled' : 'failed';
            }
            trimQueue();
            refreshTaskCenterView();
            if (currentScope() !== scope) return;
        }
    } finally {
        pumping = false;
    }
}

export async function runQueuedGeneration(item) {
    if (item.mode !== core_constants.MODE.HEART || item.route === 'language') {
        return generation_client.generateMode(item.mode, { background: true, songOptions: item.songOptions, participantSnapshot: item.participantSnapshot, workspaceRoute: item.route });
    }
    const backgroundTarget = modes_heart.captureHeartBackgroundTarget();
    const selected = backgroundTarget.session?.selectedSeason;
    const season = ['spring', 'summer', 'autumn', 'winter'].includes(selected) ? selected : 'spring';
    const options = { background: true, participantSnapshot: item.participantSnapshot, backgroundTarget };
    let result;
    if (item.route === 'fireflies') result = await modes_heart.generateHeartFirefliesSection(options);
    else if (item.route === 'strips') result = await modes_heart.generateHeartSection('strips', options);
    else if (item.route === 'postending') result = await modes_heart.generateHeartSeasonSection('postending', options);
    else if (item.route === 'heart') result = await modes_heart.generateHeartSeasonSection(season, options);
    else result = { status: 'blocked' };
    return result ?? { status: 'blocked' };
}

function taskPanel() {
    return document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-task-center]`);
}

function taskButton() {
    return document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-action="tasks"]`);
}

export function ensureTaskCenterChrome(overlay) {
    const bar = overlay?.querySelector?.('.rmt-topbar');
    if (bar && !bar.querySelector('[data-rmt-action="tasks"]')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.rmtAction = 'tasks';
        button.setAttribute('aria-label', '任务');
        button.title = '任务';
        button.innerHTML = '<i class="fa-solid fa-list-check" aria-hidden="true"></i><span class="rmt-task-count" data-rmt-task-count hidden>0</span>';
        const close = bar.querySelector('[data-rmt-action="close"]');
        if (close) bar.insertBefore(button, close);
        else bar.appendChild(button);
    }
    bindTaskCenterRefresh();
    const shell = overlay?.querySelector?.('.rmt-shell');
    const topbar = shell?.querySelector?.('.rmt-topbar');
    if (topbar) {
        let strip = shell.querySelector('[data-rmt-live-tasks]');
        if (!strip) {
            strip = document.createElement('div');
            strip.className = 'rmt-live-tasks';
            strip.dataset.rmtLiveTasks = '';
            strip.hidden = true;
        }
        const title = topbar.querySelector('.rmt-topbar-title');
        if (strip.parentElement !== topbar) {
            if (title) title.insertAdjacentElement('afterend', strip);
            else topbar.prepend(strip);
        }
    }
    if (shell && !shell.querySelector('[data-rmt-task-center]')) {
        const panel = document.createElement('div');
        panel.className = 'rmt-task-center';
        panel.dataset.rmtTaskCenter = '';
        panel.hidden = true;
        shell.appendChild(panel);
    }
}

export function hideTaskCenter() {
    const panel = taskPanel();
    if (panel) panel.hidden = true;
}

let unfinishedCache = { at: 0, count: 0 };

function unfinishedReminderCount() {
    const now = Date.now();
    if (now - unfinishedCache.at < 1500) return unfinishedCache.count;
    let count = 0;
    try {
        count += core_cache.listGenerationDrafts().filter(row => row.completed || row.truncated || row.failed || row.failureCode || row.oversized).length;
    } catch { /* A missing archive has nothing unfinished to badge. */ }
    try {
        if (archive_repository.getCurrentArchiveImportRecoverySummary()) count += 1;
        if (archive_repository.getCurrentArchiveProfileRecoverySummary()) count += 1;
    } catch { /* Archive recovery is optional until a chat is open. */ }
    try {
        const ids = new Set(core_cache.listGenerationDrafts().map(row => row.draftId));
        count += statusView.currentPendingRows().filter(row => !ids.has(row.origin?.generationRecoveryDraftId || row.id)).length;
    } catch { /* Corrupt raw data is exportable from the task card. */ }
    unfinishedCache = { at: now, count };
    return count;
}

function syncTaskCenterBadge() {
    const running = core_requestCoordinator.listChatTaskSnapshot().filter(row => row.running).length;
    const waiting = queuedForScope().length;
    const unfinished = unfinishedReminderCount();
    const total = running + waiting + unfinished;
    const badge = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-task-count]`);
    const button = taskButton();
    if (badge) {
        badge.hidden = total <= 0;
        badge.textContent = String(Math.min(99, total));
        badge.classList.toggle('rmt-task-count-alert', unfinished > 0);
    }
    if (button) {
        button.classList.toggle('rmt-task-alert', unfinished > 0);
        const parts = [];
        if (unfinished) parts.push(`${unfinished} 项未完成`);
        if (running) parts.push(`${running} 项进行中`);
        if (waiting) parts.push(`${waiting} 项排队`);
        button.setAttribute('aria-label', parts.length ? `任务，${parts.join('，')}` : '任务');
    }
}

const PAGE_LABELS = { language: '基础语言', strips: '日常一格', fireflies: '萤火虫', spring: '春', summer: '夏', autumn: '秋', winter: '冬', postending: '后日谈', roomLife: '今日生活', dialogues: '基础语言' };
const CARD_RANK = { running: 0, queued: 1, unsaved: 2, retry: 3, failed: 4, done: 5, cancelled: 6 };
const CARD_LABEL = commonStatus.GENERATION_STATUS_LABELS;

function taskLabel(mode, pageId, fallback) {
    return PAGE_LABELS[pageId] || core_constants.MODE_LABEL[mode] || fallback || pageId || mode || '任务';
}

function pageRoute(mode, pageId, label) {
    const page = String(pageId || '');
    if (page && ui_workspaceState.WORKSPACE_ROUTES[page]) return page;
    if (mode === core_constants.MODE.HEART) {
        if (['spring', 'summer', 'autumn', 'winter'].includes(page)) return 'heart';
        if (page === 'language' || page === 'dialogues') return 'language';
        if (page === 'strips') return 'strips';
        if (page === 'fireflies') return 'fireflies';
        if (page === 'postending') return 'postending';
        return 'heart';
    }
    if (mode && ui_workspaceState.WORKSPACE_ROUTES[mode]) return mode;
    const titled = Object.entries(ui_workspaceState.WORKSPACE_ROUTES).find(([, spec]) => spec.title === label);
    if (titled) return titled[0];
    const labeled = Object.entries(core_constants.MODE_LABEL).find(([, text]) => text === label);
    if (labeled && ui_workspaceState.WORKSPACE_ROUTES[labeled[0]]) return labeled[0];
    return '';
}

function sameJob(left, right) {
    if (!left || !right) return false;
    if (left.draftId && right.draftId && left.draftId === right.draftId) return true;
    if (left.mode && right.mode && left.mode === right.mode) {
        const leftPage = left.pageId || '';
        const rightPage = right.pageId || '';
        if (leftPage && rightPage) return leftPage === rightPage;
        if (!leftPage && !rightPage) return true;
    }
    const leftLabel = left.label || '';
    const rightLabel = right.label || '';
    return !!leftLabel && !!rightLabel && (leftLabel === rightLabel || leftLabel.startsWith(rightLabel) || rightLabel.startsWith(leftLabel));
}

function draftCards() {
    let drafts = [];
    try { drafts = core_cache.listGenerationDrafts(); }
    catch { drafts = []; }
    return drafts.filter(row => row.completed || row.truncated || row.failed || row.failureCode || row.oversized).map(row => {
        const oversized = row.oversized === true;
        const classified = generation_recovery.generationFailureReason(row);
        const reason = oversized
            ? '草稿超出本地保存上限，不能继续生成'
            : classified || (row.failureCode
                ? core_text.safeErrorSummary({ code: row.failureCode, archiveInputCategory: row.failureCategory, recoveryPhase: row.failurePhase })
                : (row.canContinue ? '正文写到一半，可以继续补完' : '已保存成功部分'));
        const attrs = `data-rmt-recovery-draft-id="${core_text.esc(row.draftId)}" data-rmt-recovery-page-id="${core_text.esc(row.pageId || '')}"`;
        const retry = oversized ? '' : `<button type="button" class="rmt-btn" data-rmt-recovery-mode="${core_text.esc(row.mode)}" ${attrs}>${row.canContinue ? '继续生成' : '重试未完成部分'}</button>`;
        const fresh = !runtimeState.activeArchiveSnapshot && ['mode', 'merged'].includes(row.journal?.operation?.kind || 'mode')
            ? `<button type="button" class="rmt-btn" data-rmt-action="merged-new" data-rmt-mode="${core_text.esc(row.mode)}" data-rmt-route="${core_text.esc(pageRoute(row.mode, row.pageId, row.mode) || row.mode)}">开始新任务</button>` : '';
        return {
            state: oversized || row.failed || row.failureCode ? 'failed' : 'retry',
            label: taskLabel(row.mode, row.pageId, row.mode),
            mode: row.mode,
            pageId: row.pageId || '',
            draftId: row.draftId,
            detail: `已保留 ${Number(row.completed) || 0} 个成功分段 · ${String(reason || '').replace(/[。\s]+$/, '')}`,
            at: Number(row.updatedAt) || Number(row.createdAt) || 0,
            actions: `${retry}${fresh}<button type="button" class="rmt-btn" data-rmt-recovery-export="${core_text.esc(row.mode)}" ${attrs}>导出未提交草稿</button><button type="button" class="rmt-btn" data-rmt-recovery-discard="${core_text.esc(row.mode)}" ${attrs}>放弃这份草稿</button>`,
        };
    });
}

function secondStepButton(record, id) {
    if (!record?.secondStepKind || !record?.secondStepLabel || !id) return '';
    return `<button type="button" class="rmt-btn" data-rmt-action="task-second-step" data-rmt-task-id="${core_text.esc(id)}">第二次生成${core_text.esc(record.secondStepLabel)}</button>`;
}

function openAction(record) {
    if (!record?.id) return '';
    if (record.outcome !== 'done' && record.outcome !== 'failed' && record.phase !== 'done' && record.phase !== 'failed') return '';
    if (!pageRoute(record.mode, record.pageId, record.label) && !record.draftId) return '';
    return `<button type="button" class="rmt-btn" data-rmt-action="task-open" data-rmt-task-id="${core_text.esc(record.id)}">打开结果</button>`;
}

function mergedPendingCards() {
    let rows;
    try { rows = statusView.currentPendingRows(); }
    catch { return [{ state: 'failed', label: '暂存区', detail: '读取失败，旧数据保留。请导出未归属的旧暂存记录。', actions: '<button type="button" class="rmt-btn" data-rmt-action="merged-export-legacy">导出旧暂存记录</button>', at: 0 }]; }
    const cards = rows.map(row => {
        const state = row.kind === 'unsaved' ? 'unsaved' : 'retry';
        const attrs = `data-rmt-pending-id="${core_text.esc(row.id)}" data-rmt-route="${core_text.esc(row.route)}"`;
        return { state, label: row.label, mode: row.mode, pageId: row.route, draftId: row.origin?.generationRecoveryDraftId || row.id, at: Number(row.at) || 0,
            detail: state === 'unsaved' ? '正文已生成，仅重新保存；不会再调用模型。' : '原批次仍保留，只补未完成的这一页。',
            actions: `<button type="button" class="rmt-btn" data-rmt-action="${state === 'unsaved' ? 'merged-resave' : 'merged-repair'}" ${attrs} ${row.origin ? '' : 'disabled'}>${state === 'unsaved' ? '重新保存' : '只补这一页'}</button><button type="button" class="rmt-btn" data-rmt-action="merged-export" ${attrs}>导出成果</button><button type="button" class="rmt-btn" data-rmt-action="merged-new" ${attrs}>开始新任务</button><button type="button" class="rmt-btn" data-rmt-action="merged-discard" ${attrs}>放弃这份成果</button>` };
    });
    let legacy = [];
    try { legacy = statusView.currentUnattributedPendingRows(); } catch { /* The guarded export action remains available through read failure. */ }
    if (legacy.length) cards.push({ state: 'failed', label: '未归属的旧暂存记录', detail: `有 ${legacy.length} 条旧记录缺少所属人物，已保留且不会显示为当前人物内容。`, actions: '<button type="button" class="rmt-btn" data-rmt-action="merged-export-legacy">导出旧暂存记录</button><button type="button" class="rmt-btn" data-rmt-action="merged-discard-legacy">导出并丢弃</button>', at: 0 });
    return cards;
}

function collectTaskCards() {
    const cards = mergedPendingCards();
    cards.push(...draftCards().filter(row => !cards.some(card => card.draftId && card.draftId === row.draftId)));
    const rows = core_requestCoordinator.listChatTaskSnapshot();
    for (const row of rows.filter(item => item.running)) {
        const existing = cards.find(card => sameJob(card, row));
        const next = {
            state: 'running',
            label: row.label,
            mode: existing?.mode || '',
            pageId: existing?.pageId || '',
            draftId: existing?.draftId || '',
            detail: [row.chatCaption, row.progressText].filter(Boolean).join(' · '),
            at: Date.now(),
            actions: `<button type="button" class="rmt-btn" data-rmt-action="task-cancel" data-rmt-task-id="${core_text.esc(row.id)}">取消这项</button>`,
        };
        if (existing) Object.assign(existing, next);
        else cards.push(next);
    }
    const scope = currentScope();
    const mine = queue.filter(item => item.scope === scope);
    mine.filter(item => item.status === 'queued').forEach((item, index) => {
        if (cards.some(card => sameJob(card, item) && card.state === 'running')) return;
        const existing = cards.find(card => sameJob(card, item));
        const next = {
            state: 'queued',
            label: item.label,
            mode: item.mode || existing?.mode || '',
            pageId: item.pageId || existing?.pageId || '',
            draftId: item.draftId || existing?.draftId || '',
            detail: item.kind === 'recovery' ? '自动重试未完成部分 · 排队等待' : '当前聊天 · 排队等待，上一项结束后才开始',
            at: -index,
            actions: `<button type="button" class="rmt-btn" data-rmt-action="task-queue-remove" data-rmt-queue-id="${core_text.esc(item.id)}">移出队列</button>`,
        };
        if (existing && existing.state !== 'running') Object.assign(existing, next, { actions: `${existing.actions || ''}${next.actions}` });
        else if (!existing) cards.push(next);
    });
    for (const row of rows.filter(item => !item.running)) {
        const record = core_requestCoordinator.settledChatTaskRecord(row.id) || {};
        const state = row.phase === 'failed' || record.outcome === 'failed' ? 'failed' : row.phase === 'cancelled' || record.outcome === 'cancelled' ? 'cancelled' : 'done';
        if (cards.some(card => sameJob(card, { label: row.label, mode: record.mode, pageId: record.pageId, draftId: record.draftId }))) continue;
        cards.push({
            state,
            label: taskLabel(record.mode, record.pageId, row.label),
            mode: record.mode || '',
            pageId: record.pageId || '',
            draftId: record.draftId || '',
            detail: [row.chatCaption, row.progressText].filter(Boolean).join(' · '),
            at: Number(record.endedAt) || 0,
            actions: `${secondStepButton(record, row.id)}${openAction({ ...record, id: row.id, label: row.label, outcome: record.outcome || state, phase: row.phase })}`,
        });
    }
    for (const item of mine) {
        if (item.status !== 'done' && item.status !== 'failed' && item.status !== 'cancelled') continue;
        if (cards.some(card => sameJob(card, item))) continue;
        cards.push({
            state: item.status === 'failed' ? 'failed' : item.status === 'cancelled' ? 'cancelled' : 'done',
            label: item.label,
            mode: item.mode || '',
            pageId: item.pageId || '',
            draftId: item.draftId || '',
            detail: item.kind === 'recovery' ? '自动重试未完成部分' : '当前聊天 · 串行队列',
            at: 0,
            actions: item.status === 'done' || item.status === 'failed' ? openAction({ id: '', mode: item.mode, pageId: item.pageId, label: item.label, outcome: item.status }) : '',
        });
    }
    return cards.sort((left, right) => (CARD_RANK[left.state] ?? 9) - (CARD_RANK[right.state] ?? 9) || right.at - left.at);
}

export function liveTaskStripHtml(active, waiting) {
    return !active && !waiting ? '' : `<button type="button" class="rmt-live-chip ${active ? 'rmt-live-run' : ''}" data-rmt-action="tasks" aria-label="打开任务中心"><b>任务</b><em>${active ? `${active} 项进行中` : ''}${active && waiting ? ' · ' : ''}${waiting ? `${waiting} 项待处理` : ''}</em></button>`;
}

function paintLiveStrip() {
    const host = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-live-tasks]`);
    if (!host) return;
    const esc = core_text.esc;
    let rows = [];
    try { rows = core_requestCoordinator.listChatTaskSnapshot(); } catch { rows = []; }
    const running = rows.filter(row => row.running);
    const runningLabels = new Set(running.map(row => row.label));
    const failed = rows.filter(row => !row.running && (row.phase === 'failed' || row.outcome === 'failed') && !runningLabels.has(row.label));
    const chips = [];
    if (runtimeState.busy && !running.some(row => row.id === 'archive-import' || row.kind === 'archive')) {
        const text = core_text.normalizeText(runtimeState.activeTaskLabel, 80) || '正在整理聊天档案';
        chips.push(`<button type="button" class="rmt-live-chip rmt-live-run" data-rmt-action="tasks"><i></i><b>档案整理</b><em>${esc(text)}</em></button>`);
    }
    for (const row of running) {
        chips.push(`<button type="button" class="rmt-live-chip rmt-live-run" data-rmt-action="tasks"><i></i><b>${esc(row.label)}</b><em>${esc(row.phaseLabel || '进行中')}</em></button>`);
    }
    const failedLabels = failed.map(row => row.label);
    for (const row of failed.slice(0, 4)) {
        chips.push(`<button type="button" class="rmt-live-chip rmt-live-fail" data-rmt-action="tasks"><b>${esc(row.label)}</b><em>失败了</em></button>`);
    }
    for (const card of draftCards()) {
        if (card.state !== 'failed' || runningLabels.has(card.label) || failedLabels.some(label => label === card.label || label.startsWith(card.label) || card.label.startsWith(label))) continue;
        failedLabels.push(card.label);
        chips.push(`<button type="button" class="rmt-live-chip rmt-live-fail" data-rmt-action="tasks"><b>${esc(card.label)}</b><em>失败了</em></button>`);
    }
    for (const card of mergedPendingCards()) {
        if (runningLabels.has(card.label)) continue;
        chips.push(`<button type="button" class="rmt-live-chip" data-rmt-action="tasks"><b>${esc(card.label)}</b><em>${esc(CARD_LABEL[card.state])}</em></button>`);
    }
    // Keep detailed rows in the task panel; one summary never pushes reading controls away.
    const active = running.length + (runtimeState.busy && !running.some(row => row.id === 'archive-import' || row.kind === 'archive') ? 1 : 0);
    const waiting = Math.max(0, chips.length - active);
    host.hidden = !active && !waiting;
    host.innerHTML = liveTaskStripHtml(active, waiting);

}

function hideMainRecoveryCards() {
    document.querySelectorAll(`#${core_constants.OVERLAY_ID} [data-rmt-generation-recoveries]`).forEach(node => node.remove());
}

function paintTaskCenter(panel) {
    const cards = collectTaskCards();
    const open = cards.filter(card => card.state !== 'done' && card.state !== 'cancelled');
    const finished = cards.filter(card => card.state === 'done' || card.state === 'cancelled');
    const waiting = queuedForScope();
    const runningNow = cards.some(card => card.state === 'running') || waiting.length > 0;
    const esc = core_text.esc;
    const cardHtml = card => `<article class="rmt-task-card" data-state="${card.state}">
      <div class="rmt-task-main"><b>${esc(card.label)}</b><span class="rmt-task-state" data-state="${card.state}">${esc(CARD_LABEL[card.state] || card.state)}</span></div>
      <p>${esc(card.detail || '')}</p>
      ${card.actions ? `<div class="rmt-task-actions">${card.actions}</div>` : ''}
    </article>`;
    const top = panel.scrollTop;
    panel.innerHTML = `<div class="rmt-task-head">
      <b>任务</b>
      <div class="rmt-task-head-actions">
        <button type="button" class="rmt-btn" data-rmt-action="task-clear-done" ${finished.length ? '' : 'disabled'}>清空已完成</button>
        <button type="button" class="rmt-btn" data-rmt-action="task-center-close">关闭</button>
      </div>
    </div>
    <p class="rmt-task-note">一项一行。进行中和未完成在上面，串行完成的在下面。不会显示密钥、提示词或世界书正文。</p>
    ${open.length ? open.map(cardHtml).join('') : '<p class="rmt-task-empty">当前没有进行中或未完成的任务。</p>'}
    <div class="rmt-task-actions">
      <button type="button" class="rmt-btn" data-rmt-action="task-cancel-current" ${runningNow ? '' : 'disabled'}>取消当前聊天全部任务</button>
    </div>
    ${finished.length ? `<h3>已完成</h3>${finished.map(cardHtml).join('')}` : ''}`;
    panel.scrollTop = top;
}

function mergedNavigationMark() {
    return { scope: currentScope(), epoch: ui_workspaceState.workspace.epoch,
        route: ui_workspaceState.workspace.route, mode: runtimeState.activeMode, session: runtimeState.activeSession,
        overlay: globalThis.document?.getElementById(core_constants.OVERLAY_ID) };
}
function refreshMergedCompletion(mark) {
    refreshTaskCenterView();
    const workspace = ui_workspaceState.workspace;
    if (currentScope() === mark.scope && workspace.epoch === mark.epoch && workspace.tab === 'content' && workspace.route === mark.route
        && !runtimeState.activeArchiveSnapshot && mark.overlay?.isConnected && !mark.overlay.hidden
        && mark.overlay === globalThis.document?.getElementById(core_constants.OVERLAY_ID)) {
        if (!workspace.route) ui_overlay.showChooser({ section: 'content' });
        else if (runtimeState.activeMode === mark.mode && runtimeState.activeSession === mark.session) ui_overlay.refreshSavedActiveSession();
    }
}
function exportMergedResult(id = '') {
    const pending = generation_merged.createPendingStore();
    const chatId = core_context.comparableChatId(core_context.getChatId());
    let scope = null;
    try { scope = generation_merged.currentPendingScope(core_context.getContext()); } catch { /* Export only non-attributed preservation rows. */ }
    const entry = id ? pending.readForOrigin(scope).find(row => row.id === id) : null;
    if (id && !entry) return;
    const data = id ? JSON.stringify({ kind: 'hearttrace-merged-result', version: 1, entry }, null, 2) : pending.exportUnattributed(chatId);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'Hearttrace-Merged-Result.json';
    try { document.body.appendChild(link); link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

// 旧暂存记录缺少所属人物，无法再重试。先把它们下载成 JSON 文件保存到本机，
// 再从暂存区删除；删除范围只限于刚导出的这几条。
function discardLegacyPending() {
    const pending = generation_merged.createPendingStore();
    const chatId = core_context.comparableChatId(core_context.getChatId());
    const ids = pending.readUnattributed(chatId).map(row => row.id).filter(Boolean);
    if (!ids.length) return false;
    const ok = ui_overlay.confirmExplicitAction(`导出并清除 ${ids.length} 条旧暂存记录`,
        '这些记录缺少所属人物，已经无法重试。会先把它们下载为 JSON 文件保存到本机，然后从暂存区删除；删除后只能靠这个文件找回。', { destructive: true });
    if (!ok) return false;
    exportMergedResult('');
    const removed = pending.discardUnattributed(chatId, ids);
    globalThis.toastr?.success?.(`已导出并清除 ${removed} 条旧暂存记录。`, '心迹回廊');
    refreshTaskCenterView();
    return true;
}

function refreshTaskCenterView() {
    if (painting) return;
    painting = true;
    try {
        syncPickScope();
        dropForeignQueue();
        syncTaskCenterBadge();
        hideMainRecoveryCards();
        paintLiveStrip();
        const panel = taskPanel();
        if (panel && !panel.hidden) paintTaskCenter(panel);
    } finally {
        painting = false;
    }
    if (!pumping) void pumpQueue();
}

// The bundle initializes this file before requestCoordinator finishes, because the
// two modules import each other through the overlay. Register only after open.
function bindTaskCenterRefresh() {
    if (typeof core_requestCoordinator.setTaskCenterRefresh === 'function') {
        core_requestCoordinator.setTaskCenterRefresh(refreshTaskCenterView);
    }
    if (typeof core_requestCoordinator.setAutoRetryHandler === 'function') {
        core_requestCoordinator.setAutoRetryHandler(noteRetryableGeneration);
    }
}

export function syncLiveTaskStrip() {
    paintLiveStrip();
}

export function syncTaskCenterChrome({ refreshRecovery = false } = {}) {
    if (refreshRecovery) unfinishedCache.at = 0;
    bindTaskCenterRefresh();
    refreshTaskCenterView();
}

async function openSavedTaskPage(row, context) {
    if (row.draftId) {
        try {
            const listed = core_cache.listGenerationTaskResults(context);
            if (listed.some(item => item.draftId === row.draftId)) return archive_library.openGenerationTaskResult(row.draftId, context);
        } catch { /* The mode page is still the result when no separate draft result exists. */ }
    }
    const route = pageRoute(row.mode, row.pageId, row.label);
    const spec = ui_workspaceState.WORKSPACE_ROUTES[route];
    if (!spec?.mode) {
        globalThis.toastr?.info?.(row.failureSummary || '这次没有对应的结果页。', '心迹回廊');
        return;
    }
    ui_overlay.openCachedOrGenerate(spec.mode, { workspaceRoute: route });
}

async function openSettledTask(id) {
    const row = core_requestCoordinator.settledChatTaskRecord(id);
    if (!row) {
        globalThis.toastr?.info?.('这份任务已经不在列表里。', '心迹回廊');
        return;
    }
    hideTaskCenter();
    const live = core_context.currentCharacterGuard();
    const same = !row.chatId || (core_context.comparableChatId(core_context.getChatId(live)) === row.chatId
        && (!row.characterId || String(live.characterId ?? '') === row.characterId));
    if (same) return openSavedTaskPage(row, live);
    const opener = live.openCharacterChat;
    if (typeof opener === 'function') {
        await opener.call(live, row.chatId);
        const next = core_context.currentCharacterGuard();
        const matched = core_context.comparableChatId(core_context.getChatId(next)) === row.chatId
            && (!row.characterId || String(next.characterId ?? '') === row.characterId);
        if (!matched) {
            globalThis.toastr?.warning?.('酒馆没有切到原来的聊天，没有打开可写结果。', '心迹回廊');
            return openReadonlyTask(row);
        }
        return openSavedTaskPage(row, next);
    }
    globalThis.toastr?.info?.('当前酒馆没有切回原聊天的入口，改为只读查看，不会改当前聊天。', '心迹回廊');
    return openReadonlyTask(row);
}

function openReadonlyTask(row) {
    const context = core_context.getContext();
    const index = archive_groups.getArchiveIndex(context);
    const entry = index.find(item => core_context.comparableChatId(item?.chatId) === row.chatId
        && (!row.characterName || core_text.normalizeText(item?.characterName, 120) === row.characterName));
    if (!entry) {
        globalThis.toastr?.info?.('原聊天的档案索引里还没有这份结果。', '心迹回廊');
        return;
    }
    return archive_library.openIndexedArchive(entry.characterKey, entry.chatId, core_context.archiveIndexEntryId(entry));
}

export function handleTaskCenterAction(action, actionEl) {
    if (action === 'tasks') {
        const panel = taskPanel();
        if (!panel) return;
        panel.hidden = !panel.hidden;
        if (!panel.hidden) paintTaskCenter(panel);
        syncTaskCenterBadge();
        return;
    }
    if (action === 'task-center-close') return hideTaskCenter();
    if (action === 'task-cancel') {
        const id = actionEl?.dataset?.rmtTaskId || '';
        const row = core_requestCoordinator.listChatTaskSnapshot().find(item => item.id === id && item.running);
        if (!row) return;
        if (!ui_overlay.confirmExplicitAction(`取消「${row.label}」？`, '只会中止这一项。已经确认落盘的成果保留，未完成部分停止，不会自动重试。同聊天的其他任务继续。', { destructive: true })) return;
        const result = core_requestCoordinator.cancelChatTask(id, 'task-center');
        globalThis.toastr?.info?.(result.cancelled ? `已中止「${row.label}」。` : `「${row.label}」已在结束。`, '心迹回廊');
        refreshTaskCenterView();
        return;
    }
    if (action === 'task-queue-remove') {
        cancelQueuedItem(actionEl?.dataset?.rmtQueueId || '');
        return;
    }
    if (action === 'task-clear-done') {
        let queueRemoved = 0;
        for (let index = queue.length - 1; index >= 0; index -= 1) {
            if (queue[index].status === 'done' || queue[index].status === 'cancelled') {
                queue.splice(index, 1);
                queueRemoved += 1;
            }
        }
        const removed = core_requestCoordinator.clearCompletedChatTasks();
        refreshTaskCenterView();
        globalThis.toastr?.info?.(removed || queueRemoved ? '已清空完成的任务。未完成草稿还在。' : '没有可清空的已完成任务。', '心迹回廊');
        return;
    }
    if (action === 'merged-discard' || action === 'merged-new') {
        const route = actionEl?.dataset?.rmtRoute || '', id = actionEl?.dataset?.rmtPendingId || '';
        const mode = ui_workspaceState.WORKSPACE_ROUTES[route]?.mode || actionEl?.dataset?.rmtMode;
        if (!Object.values(core_constants.MODE).includes(mode)) return;
        const fresh = action === 'merged-new';
        if (!ui_overlay.confirmExplicitAction(fresh ? '开始一份新任务？' : '放弃这份未保存成果？', fresh
            ? '旧成果继续保留，可稍后保存或导出。新任务会使用文本生成额度。'
            : '仅移除这一份未提交成果及对应草稿，已保存页面、图片和其他任务保留。', { destructive: !fresh })) return;
        const operation = fresh ? generation_client.generateMode(mode, { newTask: true, background: true, workspaceRoute: route })
            : generation_merged.discardPending(route, id);
        void Promise.resolve(operation).catch(error => {
            if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊');
        }).finally(refreshTaskCenterView);
        return;
    }
    if (action === 'merged-discard-legacy') { discardLegacyPending(); return; }
    if (action === 'merged-export' || action === 'merged-export-legacy') { exportMergedResult(action === 'merged-export-legacy' ? '' : actionEl?.dataset?.rmtPendingId || ''); return; }
    if (action === 'generate-together') {
        const navigation = mergedNavigationMark();
        const routes = selectedQueueRoutes();
        if (routes.length < 2) {
            globalThis.toastr?.info?.('先勾选至少两项，再一起生成。', '心迹回廊');
            return;
        }
        void generation_merged.startTogether(routes).then(result => {
            if (!result || result.cancelled) return;
            for (const route of routes) {
                if (currentScope() === navigation.scope && !result.soloRoutes?.includes(route) && !result.heldRoutes?.includes(route)) picks.delete(route);
            }
            if (result.soloRoutes?.length && currentScope() === navigation.scope) enqueueSelectedModes(result.soloRoutes, result.frozenOptions);
            const waiting = result.waiting?.length || 0;
            const sent = result.providerRequests || 0;
            if (sent || waiting) {
                globalThis.toastr?.success?.(waiting
                    ? `一起生成实际发送 ${sent} 次。通过的页面已写上，还有 ${waiting} 项待补。`
                    : `一起生成实际发送 ${sent} 次，各页已写上。`, '心迹回廊');
            } else if (result.soloRoutes?.length) {
                globalThis.toastr?.info?.('这几项这次按单项发送。', '心迹回廊');
            }
            try { refreshMergedCompletion(navigation); } catch { /* Saved results remain durable. */ }
        }).catch(error => {
            if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊');
            try { refreshMergedCompletion(navigation); } catch { /* Original drafts remain durable. */ }
        });
        return;
    }
    if (action === 'merged-repair' || action === 'merged-resave') {
        const navigation = mergedNavigationMark();
        const route = actionEl?.dataset?.rmtRoute || '';
        void generation_merged.repairPending(route, actionEl?.dataset?.rmtPendingId || '').then(result => {
            const sent = result?.providerRequests || 0;
            globalThis.toastr?.success?.(action === 'merged-resave' || result?.requested === false
                ? '已重新保存，没有再次生成。'
                : `已只补这一项，实际发送 ${sent} 次。`, '心迹回廊');
        }).catch(error => {
            if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊');
        }).finally(() => {
            try { refreshMergedCompletion(navigation); } catch { /* Pending results remain available. */ }
        });
        return;
    }
    if (action === 'queue-selected') {
        syncPickScope();
        const order = Object.keys(ui_workspaceState.WORKSPACE_ROUTES);
        let added;
        try { added = enqueueSelectedModes([...picks].sort((a, b) => order.indexOf(a) - order.indexOf(b))); }
        catch (error) { globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊'); return; }
        if (!added) {
            globalThis.toastr?.info?.('先勾选要排队的项目。已经在队列里的不会重复加入。', '心迹回廊');
            return;
        }
        const panel = taskPanel();
        if (panel) {
            panel.hidden = false;
            paintTaskCenter(panel);
        }
        globalThis.toastr?.info?.(`已把 ${added} 项排进任务中心，会按顺序一次生成一项。`, '心迹回廊');
        return;
    }
    if (action === 'task-cancel-current') {
        const names = core_requestCoordinator.currentChatBlockingTasks();
        const waiting = queuedForScope().map(item => item.label);
        if (!names.length && !waiting.length) return;
        const lines = [...names, ...waiting.filter(label => !names.includes(label))];
        if (!ui_overlay.confirmExplicitAction('取消当前聊天的全部任务？', `会中止这些任务：\n${lines.map(label => `· ${label}`).join('\n')}\n\n还在排队、尚未开始的项目也会移出。其他聊天的任务不受影响。已落盘成果保留，未完成部分停止，不会自动重试。`, { destructive: true })) return;
        cancelQueuedForCurrentScope();
        if (names.length) core_requestCoordinator.cancelCurrentChatBlockingTasks(null, 'task-center');
        globalThis.toastr?.info?.('已中止当前聊天的任务。', '心迹回廊');
        refreshTaskCenterView();
        return;
    }
    if (action === 'task-open') {
        const id = actionEl?.dataset?.rmtTaskId || '';
        void openSettledTask(id).catch(error => {
            if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊');
        });
        return;
    }
    if (action === 'task-second-step') {
        const id = actionEl?.dataset?.rmtTaskId || '';
        const record = core_requestCoordinator.settledChatTaskRecord(id);
        if (!record?.secondStepKind) return;
        hideTaskCenter();
        const run = record.secondStepKind === 'heart-scenario'
            ? modes_heart.generateHeartSeasonSection(record.secondStepPageId || record.pageId, { secondStep: true })
            : record.secondStepKind === 'phone-apps'
                ? generation_client.generateMode(core_constants.MODE.PHONE, { continueDraft: true, secondStep: true, background: true })
                : record.secondStepKind === 'album-comments'
                    ? generation_client.generateMode(core_constants.MODE.ALBUM, { secondStep: true, background: true })
                    : record.secondStepKind === 'room-lines'
                        ? generation_client.generateMode(core_constants.MODE.ROOM, { fillRoomText: true, background: true })
                        : record.secondStepKind === 'items-lines'
                            ? generation_client.generateMode(core_constants.MODE.ITEMS, { fillItemsText: true, background: true })
                            : record.secondStepKind === 'travel-prose'
                                ? generation_client.generateMode(core_constants.MODE.TRAVEL, { fillTravelText: true, background: true })
                                : record.secondStepKind === 'butterfly-prose'
                                    ? generation_client.generateMode(core_constants.MODE.BUTTERFLY, { fillButterflyText: true, background: true })
                                    : record.secondStepKind === 'past-lives-prose'
                                        ? generation_client.generateMode(core_constants.MODE.PAST_LIVES, { secondStep: true, background: true })
                            : record.secondStepKind === 'ending-scenes'
                                ? generation_client.generateMode(core_constants.MODE.ENDING, { secondStep: true, background: true })
                                : record.secondStepKind === 'adv-scripts'
                                    ? generation_client.startAdvScriptSecondStep()
                                    : null;
        if (!run) return;
        void Promise.resolve(run).catch(error => {
            if (error?.name !== 'AbortError') globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊');
        });
    }
}
