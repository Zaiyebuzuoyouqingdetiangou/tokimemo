import * as context from '../core/context.js';
import * as text from '../core/text.js';
import * as repository from '../archive/repository.js';
import * as overlay from './overlay.js';
import * as settings from './settingsPanel.js';
import * as navigation from './navigationBookmark.js';
import * as diagnostics from '../core/diagnosticReport.js';
import * as room from '../modes/room.js';
import * as phone from './phoneView.js';
import { state as runtimeState } from '../core/state.js';
import * as workspace_ui from './workspace.js';
import * as ui_workspaceState from './workspaceState.js';
import * as mirrorReader from './mirrorTtsReader.js';
import * as updater from '../core/selfUpdater.js';
import * as requestCoordinator from '../core/requestCoordinator.js';

export function homeHeadingHtml(ctx = context.getContext()) {
    const name = text.normalizeText(ctx?.name2, 120);
    const bank = repository.getImportedMemory(ctx);
    return `<header class="rmt-home-heading"><div class="rmt-home-heading-top"><h1>设置</h1><div class="rmt-update-row" data-rmt-update-row></div></div><p>${name ? text.esc(name) + ' · ' : ''}连接、主题与生成参数</p></header>`;
}

export function showHome({ section = '' } = {}) {
    navigation.rememberReadingPosition();
    mirrorReader.parkMirrorSettings();
    ui_workspaceState.leaveWorkspaceReader(); ui_workspaceState.workspace.tab = 'settings';
    room.stopRoomClock(); phone.stopPhoneClock();
    runtimeState.activeMode = null; runtimeState.activeSession = null; runtimeState.activeArchiveSnapshot = null; runtimeState.activeArchiveReadOnly = true;
    runtimeState.archiveViewLevel = 'home'; runtimeState.contentManagerOpen = false;
    overlay.openOverlay(); overlay.topTitle('心迹回廊'); overlay.setBackVisible(false);
    overlay.setRegenerateVisible(false); overlay.setManageVisible(false);
    const body = overlay.bodyEl();
    body.innerHTML = `<main class="rmt-home">${homeHeadingHtml()}<div data-rmt-home-settings></div></main>`;
    mountHomeUpdateChrome(body.querySelector('[data-rmt-update-row]'));
    settings.mountSettings({ homeTarget: body.querySelector('[data-rmt-home-settings]') });
    mountHomeDiagnostics(body.querySelector('.rmt-home'));
    workspace_ui.arrangeSettingsHome(body);
    if (section && ['api', 'image', 'creative', 'filter', 'theme', 'auto', 'memory', 'reading', 'voice'].includes(section)) {
        const details = body.querySelector(`[data-rmt-settings-section="${section}"]`);
        if (details) { const more = details.closest('.rmt-workspace-more'); if (more) more.open = true; details.open = true; if (section !== 'voice') settings.hydrateSettingsPanel({ memory: section === 'memory' }); details.scrollIntoView?.({ block: 'start' }); }
    }
    return true;
}

const scrollIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M7 4h8a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z"/><path d="M7 4v13a3 3 0 0 0 3 3"/><path d="M10 8h5M10 12h5"/></svg>';
let updateSheet = null;
let updateApplying = false;
let updateSheetKey = false;
let stopUpdateChrome = null;

function hearttraceBusy() {
    return !!(runtimeState.busy || requestCoordinator.hasGenerationTasks?.() || runtimeState.roomLifeRefreshPromise);
}

function closeUpdateSheet() {
    if (!updateSheet?.isConnected || updateApplying) return;
    updateSheet.remove();
}

function changelogBlock(section) {
    const block = document.createElement('section');
    block.style.cssText = 'margin:0 0 14px;';
    const heading = document.createElement('strong');
    heading.style.cssText = 'display:block;margin:0 0 6px;';
    heading.textContent = section.version ? (section.title ? `${section.version} · ${section.title}` : section.version) : (section.title || '更新说明');
    block.append(heading);
    const list = document.createElement('ul');
    list.style.cssText = 'margin:0;padding-left:1.2em;';
    for (const item of section.items || []) {
        const li = document.createElement('li');
        li.style.cssText = 'margin:4px 0;';
        li.textContent = item;
        list.append(li);
    }
    if (!section.items?.length) {
        const empty = document.createElement('p');
        empty.textContent = '这一版没有写出条目。';
        block.append(empty);
    } else block.append(list);
    return block;
}

function fillChangelog(body, result, full) {
    body.replaceChildren();
    if (!result?.ok) {
        const fail = document.createElement('p');
        fail.textContent = result?.message || '没能读到更新日志。';
        body.append(fail);
        return;
    }
    const current = updater.installedVersion();
    const newer = result.sections.filter(section => section.version && updater.isNewerHearttraceVersion(section.version, current));
    const show = full ? result.sections : (newer.length ? newer : result.sections.slice(0, 1)).slice(0, 12);
    if (full && result.sections.length > 1) {
        const hint = document.createElement('p');
        hint.textContent = `共 ${result.sections.length} 个版本，向下滚动查看更早更新`;
        body.append(hint);
    } else if (!full && !newer.length) {
        const note = document.createElement('p');
        note.textContent = '更新日志里还没有比当前版本更高的条目，下面是这次读到的最新说明。';
        body.append(note);
    }
    for (const section of show) body.append(changelogBlock(section));
}

function ensureUpdateSheet() {
    if (!updateSheetKey) {
        updateSheetKey = true;
        document.addEventListener('keydown', event => { if (event.key === 'Escape') closeUpdateSheet(); });
    }
    if (updateSheet?.isConnected) return updateSheet;
    const overlay = document.createElement('dialog');
    overlay.setAttribute('data-rmt-update-sheet', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;border:0;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:rgba(0,0,0,.45);color:inherit;';
    const card = document.createElement('section');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', '更新日志');
    card.style.cssText = 'width:min(440px,100%);max-height:min(78vh,720px);display:flex;flex-direction:column;box-sizing:border-box;padding:16px;border:1px solid var(--rmt-theme-border,#dce7ec);border-radius:15px;background:var(--rmt-theme-surface-solid,#fff);color:var(--rmt-theme-text,#334155);box-shadow:0 8px 30px #0004;font:14px/1.5 sans-serif;';
    const title = document.createElement('strong');
    title.dataset.rmtUpdateTitle = 'true';
    title.style.cssText = 'display:block;margin-bottom:8px;font-size:16px;';
    const sheetBody = document.createElement('div');
    sheetBody.dataset.rmtUpdateBody = 'true';
    sheetBody.style.cssText = 'overflow:auto;min-height:0;flex:1 1 auto;';
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;margin-top:12px;';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '关闭';
    close.className = 'rmt-btn';
    close.style.cssText = 'flex:1;min-height:44px;';
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.dataset.rmtUpdateApply = 'true';
    apply.textContent = '确认更新';
    apply.className = 'rmt-btn';
    apply.style.cssText = 'flex:1;min-height:44px;';
    actions.append(close, apply);
    card.append(title, sheetBody, actions);
    overlay.append(card);
    overlay.addEventListener('cancel', event => { event.preventDefault(); closeUpdateSheet(); });
    overlay.addEventListener('pointerdown', event => { if (event.target === overlay) closeUpdateSheet(); });
    close.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); closeUpdateSheet(); });
    apply.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        void runHearttraceUpdate(apply, close, sheetBody);
    });
    document.body.append(overlay);
    try { if (typeof overlay.showModal === 'function' && !overlay.open) overlay.showModal(); }
    catch (error) {
        const host = document.getElementById('heartbeat_memories_overlay');
        if (host) host.append(overlay);
        console.warn('[Hearttrace] 更新日志没能单独盖住插件面板', error);
    }
    updateSheet = overlay;
    return overlay;
}

async function runHearttraceUpdate(apply, close, sheetBody) {
    if (updateApplying) return;
    updateApplying = true;
    apply.disabled = true;
    close.disabled = true;
    apply.textContent = '更新中…';
    const wait = document.createElement('p');
    wait.textContent = '正在向酒馆请求更新。完成后会刷新页面。';
    sheetBody.prepend(wait);
    try {
        const result = await updater.applyHearttraceUpdateAndReload({ isBusy: hearttraceBusy });
        if (result?.skipped) {
            globalThis.toastr?.info?.(result.message || '当前已是最新版本，无需更新', '心迹回廊');
            updateApplying = false;
            apply.disabled = false;
            close.disabled = false;
            apply.textContent = '确认更新';
            wait.remove();
            return;
        }
        apply.textContent = '正在刷新…';
    } catch (error) {
        updateApplying = false;
        apply.disabled = false;
        close.disabled = false;
        apply.textContent = '确认更新';
        wait.remove();
        globalThis.toastr?.error?.(error?.userMessage || error?.message || '更新失败，请检查宿主日志。', '心迹回廊');
    }
}

async function openHearttraceChangelog(mode) {
    const overlay = ensureUpdateSheet();
    const sheetBody = overlay.querySelector('[data-rmt-update-body]');
    const title = overlay.querySelector('[data-rmt-update-title]');
    const apply = overlay.querySelector('[data-rmt-update-apply]');
    const updateMode = mode === 'update';
    apply.hidden = !updateMode;
    apply.style.setProperty('display', updateMode ? 'block' : 'none', 'important');
    const snap = updater.hearttraceUpdateSnapshot();
    title.textContent = updateMode ? (snap.remoteVersion ? `发现新版本 ${snap.remoteVersion}` : '发现新版本') : '更新日志';
    sheetBody.textContent = '正在读取更新日志…';
    const changelog = await updater.loadHearttraceChangelog({ remoteUrl: snap.remoteUrl, remoteBranch: snap.remoteBranch });
    if (!overlay.isConnected) return;
    fillChangelog(sheetBody, changelog, !updateMode);
}

function paintHomeUpdate(row, snap) {
    const badge = row.querySelector('[data-rmt-update-badge]');
    const action = row.querySelector('[data-rmt-update-action]');
    const version = updater.installedVersion();
    if (badge) badge.textContent = version ? `v${version}` : '版本未知';
    if (!action) return;
    const checking = snap.status === 'checking' || updateApplying;
    action.disabled = checking || snap.status === 'latest';
    if (snap.status === 'available') {
        action.textContent = updateApplying ? '更新中…' : '有更新';
        action.title = '发现新版本，点击查看更新日志';
        action.dataset.rmtUpdateMode = 'update';
    } else if (snap.status === 'latest') {
        action.textContent = '已是最新';
        action.title = '当前版本已是最新';
        action.dataset.rmtUpdateMode = 'latest';
    } else if (checking) {
        action.textContent = '检测中…';
        action.title = '正在检测更新';
        action.dataset.rmtUpdateMode = 'checking';
    } else if (snap.status === 'unknown') {
        action.textContent = '检测失败';
        action.title = snap.message || '网络不好，没能完成检测。点击再试一次。';
        action.dataset.rmtUpdateMode = 'check';
    } else {
        action.textContent = '检测更新';
        action.title = '检测心迹回廊是否有新版本';
        action.dataset.rmtUpdateMode = 'check';
    }
}

function mountHomeUpdateChrome(row) {
    if (!row) return;
    stopUpdateChrome?.();
    const badge = document.createElement('span');
    badge.className = 'rmt-update-badge';
    badge.dataset.rmtUpdateBadge = 'true';
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'rmt-update-action';
    action.dataset.rmtUpdateAction = 'true';
    const log = document.createElement('button');
    log.type = 'button';
    log.className = 'rmt-update-log';
    log.title = '查看更新日志';
    log.setAttribute('aria-label', '查看更新日志');
    log.innerHTML = scrollIcon;
    row.replaceChildren(badge, action, log);
    const render = () => { if (row.isConnected) paintHomeUpdate(row, updater.hearttraceUpdateSnapshot()); };
    stopUpdateChrome = updater.subscribeHearttraceUpdate(render);
    render();
    action.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (action.dataset.rmtUpdateMode === 'update') {
            void openHearttraceChangelog('update');
            return;
        }
        if (action.dataset.rmtUpdateMode !== 'check') return;
        void (async () => {
            const snap = await updater.checkHearttraceUpdate({ force: true });
            if (!row.isConnected) return;
            if (snap.status === 'available') void openHearttraceChangelog('update');
            else if (snap.status === 'latest') globalThis.toastr?.info?.('当前已是最新', '心迹回廊');
            else if (snap.status === 'unknown') globalThis.toastr?.warning?.(snap.message || '没能完成检测，请稍后再试。', '心迹回廊');
        })();
    });
    log.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        void openHearttraceChangelog('view');
    });
    void updater.checkHearttraceUpdate({ force: true });
}

// Keep the runtime usable when it is loaded directly without the bootstrap globals.
async function deliverHomeDiagnostic(action, { output, status, isCurrent }) {
    const deliver = globalThis.__heartbeatMemoriesDeliverDiagnostic;
    if (typeof deliver === 'function') return deliver(action, { output, status, isCurrent });
    if (!isCurrent()) return false;
    const report = diagnostics.diagnosticReportText();
    const show = message => {
        if (!isCurrent()) return;
        output.value = report; output.hidden = false;
        output.closest('[data-rmt-diagnostic-panel]').hidden = false;
        status.textContent = message;
    };
    if (action === 'copy') {
        try {
            if (typeof globalThis.navigator?.clipboard?.writeText !== 'function') throw new Error();
            await globalThis.navigator.clipboard.writeText(report);
            if (isCurrent()) status.textContent = '已复制诊断报告。';
            return true;
        } catch { show('无法自动复制，请长按下方报告手动复制。'); return false; }
    }
    if (action === 'export') {
        let url = '', link = null;
        try {
            url = URL.createObjectURL(new Blob([report], { type: 'application/json;charset=utf-8' }));
            link = document.createElement('a'); link.href = url;
            link.download = 'Hearttrace-diagnostic.json'; link.hidden = true;
            document.body.appendChild(link); link.click();
            if (isCurrent()) status.textContent = '已请求导出；若未出现下载，请使用“复制报告”或“查看报告”。';
            return true;
        } catch { show('无法下载，请复制下方报告。'); return false; }
        finally {
            link?.remove();
            if (url) setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 1000);
        }
    }
    show('报告不含聊天、外貌、提示词或密钥。');
    return true;
}

export function mountHomeDiagnostics(target) {
    if (!target) return false;
    if (target.querySelector('[data-rmt-home-diagnostic]')) return true;
    const panel = document.createElement('details');
    panel.setAttribute('data-rmt-home-diagnostic', ''); panel.open = false;
    const style = document.createElement('style');
    style.textContent = `
[data-rmt-home-diagnostic]{box-sizing:border-box;min-width:0;max-width:100%;margin-top:14px;padding:0 14px;border:1px solid var(--rmt-theme-line,#c6d8e7);border-radius:16px;color:inherit}
[data-rmt-home-diagnostic] [hidden]{display:none!important}
[data-rmt-home-diagnostic]>summary{box-sizing:border-box;min-height:46px;padding:14px 0;cursor:pointer;font-size:16px;writing-mode:horizontal-tb;touch-action:manipulation}
[data-rmt-home-diagnostic]:not([open])>.rmt-home-diagnostic-body{display:none!important}
[data-rmt-home-diagnostic] .rmt-home-diagnostic-actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;min-width:0;max-width:100%}
[data-rmt-home-diagnostic] button{box-sizing:border-box;width:100%;min-width:0;min-height:46px;height:auto;margin:0;padding:9px;white-space:normal;writing-mode:horizontal-tb;touch-action:manipulation}
[data-rmt-home-diagnostic] [role="status"]{display:block;margin:8px 0;font-size:13px;line-height:1.5;overflow-wrap:anywhere}
[data-rmt-home-diagnostic] textarea{box-sizing:border-box;display:block;width:100%;max-width:100%;min-width:0;height:240px;margin-bottom:14px;padding:8px;font-size:12px;line-height:1.5;resize:vertical;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;-webkit-user-select:text;touch-action:auto;color:inherit;background:inherit}
`;
    const heading = document.createElement('summary'); heading.textContent = '故障排查';
    const body = document.createElement('div'); body.className = 'rmt-home-diagnostic-body';
    const actions = document.createElement('div'); actions.className = 'rmt-home-diagnostic-actions';
    const status = document.createElement('span'); status.setAttribute('role', 'status');
    const report = document.createElement('div'); report.hidden = true;
    report.setAttribute('data-rmt-diagnostic-panel', '');
    const output = document.createElement('textarea'); output.readOnly = true;
    output.hidden = true; output.spellcheck = false; output.setAttribute('aria-label', '脱敏诊断报告');
    let reportEpoch = 0;
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    const clear = () => { reportEpoch += 1; output.value = ''; output.hidden = true; report.hidden = true; status.textContent = ''; };
    panel.addEventListener('toggle', () => { if (!panel.open) clear(); });
    for (const [action, label] of [['copy', '复制报告'], ['export', '导出 JSON'], ['show', '查看报告'], ['close', '关闭']]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.setAttribute('data-rmt-diagnostic-action', action);
        button.addEventListener('click', () => {
            clear();
            if (action === 'close') { panel.open = false; return; }
            const epoch = reportEpoch;
            void deliverHomeDiagnostic(action, { output, status,
                isCurrent: () => panel.isConnected && panel.open && epoch === reportEpoch
                    && lifecycleEpoch === runtimeState.runtimeLifecycleEpoch });
        });
        actions.appendChild(button);
    }
    report.appendChild(output); body.appendChild(actions); body.appendChild(status); body.appendChild(report);
    panel.appendChild(heading); panel.appendChild(style); panel.appendChild(body); target.appendChild(panel);
    return true;
}
