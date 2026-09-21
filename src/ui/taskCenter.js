import * as archive_groups from '../archive/groups.js';
import * as archive_library from '../archive/library.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import { state as runtimeState } from '../core/state.js';
import * as ui_overlay from './overlay.js';

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

export function queuePickHtml(mode) {
    syncPickScope();
    const checked = picks.has(mode) ? 'checked' : '';
    return `<label class="rmt-queue-pick"><input type="checkbox" data-rmt-queue-mode="${core_text.esc(mode)}" ${checked}>排队</label>`;
}

export function setQueuePick(mode, on) {
    syncPickScope();
    if (!mode || mode === core_constants.MODE.HEART) return;
    if (on) picks.add(mode);
    else picks.delete(mode);
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

export function enqueueSelectedModes(modes) {
    const scope = currentScope();
    if (!scope) return 0;
    let added = 0;
    for (const mode of modes) {
        if (!mode || mode === core_constants.MODE.HEART || !Object.values(core_constants.MODE).includes(mode)) continue;
        if (queue.some(item => item.scope === scope && item.mode === mode && (item.status === 'queued' || item.status === 'running'))) continue;
        queue.push({
            id: `queue-${Date.now().toString(36)}-${queue.length}`,
            mode,
            label: core_constants.MODE_LABEL[mode] || mode,
            scope,
            status: 'queued',
            attached: false,
        });
        picks.delete(mode);
        added += 1;
    }
    trimQueue();
    refreshTaskCenterView();
    void pumpQueue();
    return added;
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
                result = await generation_client.generateMode(next.mode, { background: true });
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

function syncTaskCenterBadge() {
    const running = core_requestCoordinator.listChatTaskSnapshot().filter(row => row.running).length;
    const waiting = queuedForScope().length;
    const total = running + waiting;
    const badge = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-task-count]`);
    if (!badge) return;
    badge.hidden = total <= 0;
    badge.textContent = String(Math.min(99, total));
    const button = taskButton();
    if (button) button.setAttribute('aria-label', total ? `任务，${running} 项进行中，${waiting} 项排队` : '任务');
}

function recoverySectionHtml(esc) {
    let drafts = [];
    try { drafts = core_cache.listGenerationDrafts(); }
    catch { drafts = []; }
    const visible = drafts.filter(row => row.completed || row.truncated || row.failed || row.failureCode || row.oversized).slice(0, 8);
    if (!visible.length) return '';
    return `<h3>未完成草稿</h3>${visible.map(row => {
        const oversized = row.oversized === true;
        const name = core_constants.MODE_LABEL[row.mode] || row.pageId || row.mode;
        const action = row.canContinue ? '继续生成' : '重试未完成部分';
        const reason = oversized
            ? '草稿超出本地保存上限，不能继续生成'
            : row.failureCode
                ? core_text.safeErrorSummary({ code: row.failureCode, archiveInputCategory: row.failureCategory, recoveryPhase: row.failurePhase })
                : (row.canContinue ? '正文未写完' : '任务尚未完成');
        const attrs = `data-rmt-recovery-draft-id="${esc(row.draftId)}" data-rmt-recovery-page-id="${esc(row.pageId || '')}"`;
        const retry = oversized ? '' : `<button type="button" class="rmt-btn" data-rmt-recovery-mode="${esc(row.mode)}" ${attrs}>${action}</button>`;
        return `<article class="rmt-task-row">
          <header><b>${esc(name)} · 已保留 ${Number(row.completed) || 0} 个成功分段</b><span>${oversized ? '只能导出' : action}</span></header>
          <p>${esc(String(reason || '').replace(/[。\s]+$/, ''))}</p>
          <div class="rmt-task-actions">${retry}
            <button type="button" class="rmt-btn" data-rmt-recovery-export="${esc(row.mode)}" ${attrs}>导出未提交草稿</button>
            <button type="button" class="rmt-btn" data-rmt-recovery-discard="${esc(row.mode)}" ${attrs}>放弃这份草稿</button>
          </div>
        </article>`;
    }).join('')}`;
}

function paintTaskCenter(panel) {
    const rows = core_requestCoordinator.listChatTaskSnapshot();
    const running = rows.filter(row => row.running);
    const settled = rows.filter(row => !row.running);
    const currentNames = running.filter(row => row.currentChat).map(row => row.label);
    const esc = core_text.esc;
    const rowHtml = row => `<article class="rmt-task-row">
      <header><b>${esc(row.label)}</b><span>${esc(row.phaseLabel)}</span></header>
      <p>${esc(row.chatCaption)}</p>
      <p>${esc(row.progressText)}</p>
      <div class="rmt-task-actions">
        ${row.running ? `<button type="button" class="rmt-btn" data-rmt-action="task-cancel" data-rmt-task-id="${esc(row.id)}">取消这项</button>` : ''}
        ${row.canOpen ? `<button type="button" class="rmt-btn" data-rmt-action="task-open" data-rmt-task-id="${esc(row.id)}">回到原聊天并打开结果</button>` : ''}
      </div>
    </article>`;
    const scope = currentScope();
    const mine = queue.filter(item => item.scope === scope);
    const waiting = mine.filter(item => item.status === 'queued');
    const active = mine.find(item => item.status === 'running');
    const recentQueue = mine.filter(item => item.status !== 'queued' && item.status !== 'running').slice(-4);
    const queueRow = (item, order) => `<article class="rmt-task-row">
      <header><b>${order ? `${order}. ` : ''}${esc(item.label)}</b><span>${esc(QUEUE_STATUS[item.status] || item.status)}</span></header>
      <p>${item.kind === 'recovery' ? '自动重试未完成部分' : '当前聊天 · 串行队列'}</p>
      ${item.status === 'queued' ? `<div class="rmt-task-actions"><button type="button" class="rmt-btn" data-rmt-action="task-queue-remove" data-rmt-queue-id="${esc(item.id)}">移出队列</button></div>` : ''}
    </article>`;
    const recoveryHtml = recoverySectionHtml(esc);
    const queueHtml = (active || waiting.length || recentQueue.length)
        ? `<h3>排队</h3>${active ? `<p class="rmt-task-note">正在串行处理「${esc(active.label)}」，完成后才开始下一项。</p>` : ''}${waiting.map((item, index) => queueRow(item, index + 1)).join('')}${recentQueue.map(item => queueRow(item, 0)).join('')}`
        : '';
    const top = panel.scrollTop;
    panel.innerHTML = `<div class="rmt-task-head">
      <b>任务</b>
      <button type="button" class="rmt-btn" data-rmt-action="task-center-close">关闭</button>
    </div>
    <p class="rmt-task-note">这里只显示任务名称、阶段和是否落盘。不会显示密钥、提示词或世界书正文。档案整理完成后可以多选，再按顺序一次生成一项。</p>
    ${queueHtml}
    ${recoveryHtml}
    ${running.length ? running.map(rowHtml).join('') : '<p class="rmt-task-empty">当前没有进行中的任务。</p>'}
    <div class="rmt-task-actions">
      <button type="button" class="rmt-btn" data-rmt-action="task-cancel-current" ${currentNames.length || waiting.length ? '' : 'disabled'}>取消当前聊天全部任务</button>
    </div>
    ${settled.length ? `<h3>刚结束</h3>${settled.map(rowHtml).join('')}` : ''}`;
    panel.scrollTop = top;
}

function refreshTaskCenterView() {
    if (painting) return;
    painting = true;
    try {
        syncPickScope();
        dropForeignQueue();
        syncTaskCenterBadge();
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

export function syncTaskCenterChrome() {
    bindTaskCenterRefresh();
    refreshTaskCenterView();
}

async function openSettledTask(id) {
    const row = core_requestCoordinator.settledChatTaskRecord(id);
    if (!row?.chatId) {
        globalThis.toastr?.info?.('这份任务没有可打开的原聊天结果。', '心迹回廊');
        return;
    }
    const live = core_context.currentCharacterGuard();
    const same = core_context.comparableChatId(core_context.getChatId(live)) === row.chatId
        && (!row.characterId || String(live.characterId ?? '') === row.characterId);
    if (same) {
        if (row.draftId) return archive_library.openGenerationTaskResult(row.draftId, live);
        return ui_overlay.showChooser();
    }
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
        if (row.draftId) return archive_library.openGenerationTaskResult(row.draftId, next);
        return ui_overlay.showChooser();
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
    if (action === 'queue-selected') {
        syncPickScope();
        const order = core_constants.ARCHIVE_PORTAL_MODES;
        const added = enqueueSelectedModes([...picks].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
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
    }
}
