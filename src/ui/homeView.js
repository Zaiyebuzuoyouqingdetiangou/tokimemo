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

export function homeHeadingHtml(ctx = context.getContext()) {
    const name = text.normalizeText(ctx?.name2, 120);
    const bank = repository.getImportedMemory(ctx);
    return `<header class="rmt-home-heading"><h1>设置</h1><p>${name ? text.esc(name) + ' · ' : ''}自动留忆、连接与生成</p></header>`;
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
    settings.mountSettings({ homeTarget: body.querySelector('[data-rmt-home-settings]') });
    mountHomeDiagnostics(body.querySelector('.rmt-home'));
    workspace_ui.arrangeSettingsHome(body);
    if (section && ['api', 'image', 'creative', 'filter', 'theme', 'auto', 'memory', 'reading', 'voice'].includes(section)) {
        const details = body.querySelector(`[data-rmt-settings-section="${section}"]`);
        if (details) { const more = details.closest('.rmt-workspace-more'); if (more) more.open = true; details.open = true; if (section !== 'voice') settings.hydrateSettingsPanel({ memory: section === 'memory' }); details.scrollIntoView?.({ block: 'start' }); }
    }
    return true;
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
