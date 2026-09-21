import * as archive_groups from '../archive/groups.js';
import * as archive_library from '../archive/library.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_text from '../core/text.js';
import * as ui_overlay from './overlay.js';

let painting = false;

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
        button.innerHTML = '任务 <span class="rmt-task-count" data-rmt-task-count hidden>0</span>';
        const close = bar.querySelector('[data-rmt-action="close"]');
        if (close) bar.insertBefore(button, close);
        else bar.appendChild(button);
    }
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
    const badge = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-task-count]`);
    if (!badge) return;
    badge.hidden = running <= 0;
    badge.textContent = String(Math.min(99, running));
    const button = taskButton();
    if (button) button.setAttribute('aria-label', running ? `任务，${running} 项进行中` : '任务');
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
    const top = panel.scrollTop;
    panel.innerHTML = `<div class="rmt-task-head">
      <b>任务</b>
      <button type="button" class="rmt-btn" data-rmt-action="task-center-close">关闭</button>
    </div>
    <p class="rmt-task-note">这里只显示任务名称、阶段和是否落盘。不会显示密钥、提示词或世界书正文。</p>
    ${running.length ? running.map(rowHtml).join('') : '<p class="rmt-task-empty">当前没有进行中的任务。</p>'}
    <div class="rmt-task-actions">
      <button type="button" class="rmt-btn" data-rmt-action="task-cancel-current" ${currentNames.length ? '' : 'disabled'}>取消当前聊天全部任务</button>
    </div>
    ${settled.length ? `<h3>刚结束</h3>${settled.map(rowHtml).join('')}` : ''}`;
    panel.scrollTop = top;
}

function refreshTaskCenterView() {
    if (painting) return;
    painting = true;
    try {
        syncTaskCenterBadge();
        const panel = taskPanel();
        if (panel && !panel.hidden) paintTaskCenter(panel);
    } finally {
        painting = false;
    }
}

core_requestCoordinator.setTaskCenterRefresh(refreshTaskCenterView);

export function syncTaskCenterChrome() {
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
    if (action === 'task-cancel-current') {
        const names = core_requestCoordinator.currentChatBlockingTasks();
        if (!names.length) return;
        if (!ui_overlay.confirmExplicitAction('取消当前聊天的全部任务？', `会中止这些任务：\n${names.map(label => `· ${label}`).join('\n')}\n\n其他聊天的任务不受影响。已落盘成果保留，未完成部分停止，不会自动重试。`, { destructive: true })) return;
        core_requestCoordinator.cancelCurrentChatBlockingTasks(null, 'task-center');
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
