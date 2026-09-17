import * as cg_format_ui from './cgFormatControl.js';
// Production workspace: delegates every data operation to the existing module entry points.
// This file contains no sample records, generation prompts, or alternate persistence path.
import * as constants from '../core/constants.js';
import * as text from '../core/text.js';
import * as context from '../core/context.js';
import * as repository from '../archive/repository.js';
import * as library from '../archive/library.js';
import * as snapshots from '../archive/snapshots.js';
import * as coordinator from '../core/requestCoordinator.js';
import * as heartLanguage from '../core/heartLanguage.js';
import * as overlay from './overlay.js';
import * as home from './homeView.js';
import * as bookmark from './navigationBookmark.js';
import * as cgEditor from './cgPromptEditor.js';
import { state as state } from '../core/state.js';
import * as ui_workspaceState from './workspaceState.js';
const esc = text.esc;
const GROUPS = [['memory', '回忆'], ['life', '生活'], ['interaction', '互动'], ['stories', '番外']];
const ALIAS_META = {
    language: { icon: 'fa-comment', accent: 'heart', subtitle: '早晚、生日与特别时刻' },
    fireflies: { icon: 'fa-star', accent: 'heart', subtitle: '那些不经意说出口的心声' },
    strips: { icon: 'fa-images', accent: 'album', subtitle: '两个人的日常片刻' },
    postending: { icon: 'fa-book-open', accent: 'ending', subtitle: '未来生活的独立小剧场' },
    heart: { subtitle: '春夏秋冬的小剧场' }, ending: { subtitle: '结局路线与告白回看' },
};
export function syncWorkspaceChrome() {
    const host = globalThis.document?.getElementById?.(constants.OVERLAY_ID);
    if (!host?.querySelectorAll || !host.classList?.add) return;
    ui_workspaceState.loadWorkspacePreferences();
    host.classList.add('rmt-workspace');
    host.classList.toggle('rmt-workspace-expanded', ui_workspaceState.workspace.expanded);
    const tab = state.activeMode ? 'content' : state.archiveViewLevel === 'home' ? 'settings'
        : ['chooser','snapshot'].includes(state.archiveViewLevel) ? (ui_workspaceState.workspace.tab === 'content' ? 'content' : 'archive') : '';
    for (const button of host.querySelectorAll('[data-rmt-workspace-tab]')) {
        const active = button.dataset.rmtWorkspaceTab === tab;
        button.classList.toggle('active', active); button.setAttribute('aria-current', active ? 'page' : 'false');
    }
    const expand = host.querySelector('[data-rmt-action="workspace-expand"]');
    if (expand) { expand.setAttribute('aria-label', ui_workspaceState.workspace.expanded ? '还原窗口' : '展开窗口'); expand.setAttribute('aria-pressed', String(ui_workspaceState.workspace.expanded)); expand.title = ui_workspaceState.workspace.expanded ? '还原窗口' : '展开窗口'; }
    const crumb = host.querySelector('.rmt-workspace-location');
    if (!crumb) return;
    const route = ui_workspaceState.WORKSPACE_ROUTES[ui_workspaceState.workspace.route];
    const label = state.activeMode ? (route?.mode === state.activeMode ? route.title : constants.MODE_LABEL[state.activeMode] || '') : '';
    const snapshot = state.activeArchiveSnapshot;
    const target = snapshot ? (snapshot.backupOnly ? '独立备份 · 永久只读' : `${snapshot.characterName || ''} · ${state.activeArchiveReadOnly ? '只读档案' : '档案'}`) : '';
    crumb.hidden = !label && !target;
    crumb.replaceChildren();
    if (label) {
        const back = document.createElement('button'); back.type = 'button'; back.className = 'rmt-crumb-button';
        back.dataset.rmtWorkspaceTab = 'content'; back.textContent = '内容';
        const current = document.createElement('span'); current.textContent = '› ' + label;
        crumb.append(back, current);
    }
    if (target) { const badge = document.createElement('small'); badge.textContent = target; crumb.append(badge); }
}
export function workspaceNavHtml() {
    return '<nav class="rmt-workspace-tabs" aria-label="心迹回廊主导航">' + [['settings','设置'],['archive','当前档案'],['content','内容']]
        .map(([key,label]) => `<button type="button" data-rmt-workspace-tab="${key}">${label}</button>`).join('')
        + '</nav><div class="rmt-workspace-location" hidden></div>';
}
export function openWorkspaceTab(tab) {
    if (!['settings','archive','content'].includes(tab)) return false;
    // Keep close/cancel semantics of the real CG editor; changing tabs never starts a task.
    bookmark.rememberReadingPosition();
    cgEditor.closeCgPromptEditor({ restoreFocus: false });
    const snapshot = state.activeArchiveSnapshot;
    ui_workspaceState.leaveWorkspaceReader(); ui_workspaceState.workspace.tab = tab;
    if (tab === 'settings') return home.showHome();
    if (snapshot) return library.showIndexedArchiveSnapshot(snapshot);
    return overlay.showChooser({ section: tab });
}
export function routeHasContent(key, session) {
    if (!session) return false;
    if (key === 'themeSong') return !!session.songs?.length;
    if (key === 'language') return heartLanguage.heartLanguageStatus(session).hasContent;
    if (key === 'strips') return !!session.dailyStrips?.length;
    if (key === 'fireflies') return !!session.fireflyVoices?.length;
    if (key === 'postending') return !!session.voiceDramas?.some(item => item.kind === 'postending');
    if (key === 'heart') return !!session.voiceDramas?.some(item => item.kind !== 'postending') || !!session.scenarioDramas?.length;
    return true;
}
function countStatus(key, session) {
    if (!routeHasContent(key, session)) return '尚未生成 · 可先进入';
    if (key === 'themeSong') return `已有 ${session.songs.length} 首`;
    if (key === 'language') return `已有 ${heartLanguage.heartLanguageStatus(session).total} 句`;
    if (key === 'heart') return `已有 ${(session.voiceDramas || []).filter(i => i.kind !== 'postending').length + (session.scenarioDramas || []).length} 篇`;
    if (key === 'postending') return `已有 ${(session.voiceDramas || []).filter(i => i.kind === 'postending').length} 篇`;
    const collection = key === 'strips' ? session.dailyStrips : key === 'fireflies' ? session.fireflyVoices
        : session.entries || session.events || session.letters || session.locations || session.episodes;
    return Array.isArray(collection) ? `已有 ${collection.length} ${key === 'fireflies' ? '颗光' : '项内容'}` : '已有内容';
}
export function workspaceCatalogueHtml(portals = [], snapshot = null) {
    ui_workspaceState.loadWorkspacePreferences();
    const sessionMap = new Map(portals.map(item => [item.mode, item.session]));
    const cards = Object.entries(ui_workspaceState.WORKSPACE_ROUTES).filter(([,spec]) => !spec.deep && spec.group === ui_workspaceState.workspace.group).map(([key,spec]) => {
        const meta = { ...snapshots.modePortalMeta(spec.mode), ...(ALIAS_META[key] || {}) };
        const session = sessionMap.get(spec.mode);
        const running = snapshot ? coordinator.isArchiveTargetModeGenerating(spec.mode, snapshot) : coordinator.isModeGenerating(spec.mode);
        const ready = routeHasContent(key, session);
        const status = running ? (ready ? '生成中 · 已有内容可读' : '正在生成') : countStatus(key, session);
        return `<article class="rmt-archive-portal rmt-workspace-card ${ready ? 'ready' : 'empty'} rmt-archive-portal-${esc(meta.accent)}"><button type="button" class="rmt-portal-open" data-rmt-workspace-route="${key}"><span class="rmt-portal-avatar"><i class="fa-solid ${esc(meta.icon)}" aria-hidden="true"></i></span><span class="rmt-portal-title">${esc(spec.title)}</span><span class="rmt-portal-subtitle">${esc(meta.subtitle)}</span><span class="rmt-portal-status">${esc(status)}</span><span class="rmt-workspace-enter" aria-hidden="true">›</span></button></article>`;
    }).join('');
    return `<section class="rmt-workspace-catalogue"><header class="rmt-workspace-section-head"><div><h2>内容</h2><p>选择你想看的那一页</p></div><div class="rmt-layout-switch" aria-label="目录显示方式">${[['cards','卡片'],['list','列表']].map(([k,t])=>`<button type="button" data-rmt-workspace-layout="${k}" aria-pressed="${ui_workspaceState.workspace.layout === k}" class="${ui_workspaceState.workspace.layout === k ? 'active' : ''}">${t}</button>`).join('')}</div></header><nav class="rmt-workspace-groups" aria-label="内容分组">${GROUPS.map(([k,t])=>`<button type="button" data-rmt-workspace-group="${k}" class="${ui_workspaceState.workspace.group === k ? 'active' : ''}" aria-current="${ui_workspaceState.workspace.group === k ? 'page' : 'false'}">${t}</button>`).join('')}</nav><div class="rmt-archive-portals rmt-workspace-portals" data-rmt-layout="${ui_workspaceState.workspace.layout}">${cards}</div></section>`;
}
// Move existing validated markup, never replace the underlying archive or task objects.
export function arrangeArchiveWorkspace(body, { portals = [], ready = false, snapshot = null } = {}) {
    if (!body?.querySelector) return;
    ui_workspaceState.loadWorkspacePreferences();
    const old = body.querySelector('.rmt-archive-room'); if (!old?.querySelector || !old?.children) return;
    const gate = old.querySelector('.rmt-memory-gate');
    const sources = old.querySelector('.rmt-external-memory-row');
    const calendar = old.querySelector('.rmt-calendar-quick');
    const oldPortals = old.querySelector('.rmt-archive-portals'); oldPortals?.remove();
    const notices = [...old.children].filter(el => el !== gate && el !== sources && el !== calendar);
    const main = document.createElement('main'); main.className = 'rmt-archive-room rmt-workspace-page';
    for (const notice of notices) main.appendChild(notice);
    if (ui_workspaceState.workspace.tab === 'content') {
        const readOnlyControl = gate?.querySelector('.rmt-archive-readonly-control');
        if (readOnlyControl) main.appendChild(readOnlyControl);
        const section = document.createElement('div'); section.innerHTML = workspaceCatalogueHtml(portals, snapshot);
        main.appendChild(section);
    } else {
        ui_workspaceState.workspace.tab = 'archive';
        const heading = document.createElement('header'); heading.className = 'rmt-workspace-section-head';
        const title = document.createElement('h2'); title.textContent = snapshot ? '档案概览' : ready ? '当前档案' : '为当前聊天建立档案';
        heading.appendChild(title); main.appendChild(heading);
        if (sources) {
            const sourceTitle = document.createElement('h3'); sourceTitle.textContent = '记忆来源'; sources.prepend(sourceTitle);
            const sourceHelp = document.createElement('p'); sourceHelp.className = 'rmt-source-note'; sourceHelp.textContent = '聊天正文是建档来源；记忆 / 摘要为可选补充。'; sourceTitle.after(sourceHelp);
            for (const status of [...sources.querySelectorAll(':scope > small')]) {
                if ((status.textContent || '').length > 160) {
                    const details = document.createElement('details'); details.className = 'rmt-source-status';
                    const summary = document.createElement('summary');
                    summary.textContent = /部分|缺少|失败|不一致|截断/.test(status.textContent) ? '来源同步有待确认项 · 查看详情' : '查看来源扫描详情';
                    status.before(details); details.append(summary,status);
                }
            }
            main.appendChild(sources);
        }
        if (gate) {
            gate.querySelector('.rmt-archive-kicker')?.remove();
            const cover = gate.querySelector('.rmt-archive-cover');
            if (cover) {
                const fold = document.createElement('details'); fold.className = 'rmt-archive-full-details';
                const summary = document.createElement('summary'); summary.textContent = '查看完整简介与记忆索引';
                const preview = document.createElement('p'); preview.className = 'rmt-archive-summary-preview';
                preview.textContent = (cover.querySelector('.rmt-archive-verdict') || cover.querySelector('.rmt-archive-source-fold p'))?.textContent || '';
                cover.before(preview, fold); fold.append(summary, cover);
            }
            const actions = gate.querySelector('.rmt-current-archive-actions');
            if (actions) {
                const destructive = [...actions.querySelectorAll('[data-rmt-action="full-rebuild-memory"],[data-rmt-action="current-archive-delete"]')];
                if (destructive.length) {
                    const tools = document.createElement('details'); tools.className = 'rmt-archive-tools';
                    const summary = document.createElement('summary'); summary.textContent = '档案管理'; tools.append(summary, ...destructive); actions.appendChild(tools);
                }
            }
            main.appendChild(gate);
        }
        if (calendar) main.appendChild(calendar);
        const browse = document.createElement('button'); browse.type = 'button'; browse.className = 'rmt-btn rmt-workspace-browse'; browse.dataset.rmtWorkspaceTab = 'content'; browse.textContent = ready ? '浏览已生成内容' : '先浏览功能'; main.appendChild(browse);
    }
    body.replaceChildren(main); syncWorkspaceChrome();
}
export function arrangeSettingsHome(body) {
    if (!body?.querySelector) return;
    ui_workspaceState.workspace.tab = 'settings'; ui_workspaceState.workspace.route = ''; ui_workspaceState.workspace.empty = null;
    const panel = body.querySelector('[data-rmt-home-settings]');
    const content = panel?.querySelector('.rmt-settings-content');
    if (content) {
        const more = document.createElement('details'); more.className = 'rmt-workspace-more';
        const title = document.createElement('summary'); title.textContent = '更多设置'; more.appendChild(title);
        const sectionBody = document.createElement('div'); sectionBody.className = 'rmt-workspace-more-body'; more.appendChild(sectionBody);
        for (const card of [...content.querySelectorAll(':scope > [data-rmt-settings-section]')]) {
            if (!['api','theme','image','reading'].includes(card.dataset.rmtSettingsSection)) sectionBody.appendChild(card);
        }
        if (sectionBody.children.length) content.appendChild(more);
        const preferences = [...content.querySelectorAll(':scope > .rmt-workspace-preferences')];
        for (const duplicate of preferences.slice(1)) duplicate.remove();
        if (!preferences.length) {
            const ui = document.createElement('details'); ui.className = 'rmt-settings-card rmt-workspace-preferences';
            ui_workspaceState.loadWorkspacePreferences();
            ui.innerHTML = `<summary class="rmt-settings-card-head"><span>UI</span><div><b>窗口与导航</b><small>本设备的显示偏好</small></div></summary><div class="rmt-settings-section-body"><label class="rmt-settings-field"><span>首次打开页面</span><select data-rmt-workspace-startup>${[['settings','设置'],['archive','当前档案'],['content','内容']].map(([k,t])=>`<option value="${k}" ${ui_workspaceState.workspace.startup===k?'selected':''}>${t}</option>`).join('')}</select></label><label class="rmt-settings-check"><input type="checkbox" data-rmt-workspace-restore ${ui_workspaceState.workspace.restore?'checked':''}><span>重新打开时恢复阅读位置</span></label></div>`;
            content.appendChild(ui);
        }
    }
    syncWorkspaceChrome();
}
export function showEmptyWorkspace(mode, { memory = null, stored = false, noChat = false } = {}) {
    state.activeMode = mode; state.activeSession = null;
    ui_workspaceState.workspace.tab = 'content'; ui_workspaceState.workspace.empty = { mode, memoryReady: !!memory, stored, noChat };
    overlay.openOverlay(); renderEmptyWorkspace();
}
export function renderEmptyWorkspace() {
    const empty = ui_workspaceState.workspace.empty;
    if (!empty || empty.mode !== state.activeMode || state.activeSession) return false;
    const spec = ui_workspaceState.WORKSPACE_ROUTES[ui_workspaceState.workspace.route] || ui_workspaceState.WORKSPACE_ROUTES[empty.mode];
    const label = spec?.title || constants.MODE_LABEL[empty.mode] || '内容';
    const readOnly = !!state.activeArchiveSnapshot && state.activeArchiveReadOnly;
    const permanentlyReadOnly = state.activeArchiveSnapshot?.backupOnly === true;
    const message = empty.stored ? '已有内容暂时无法安全读取，原数据保留。'
        : !empty.memoryReady ? (empty.noChat ? '先打开一个角色聊天；这里可以浏览功能。' : '生成内容需要先建立当前聊天档案。')
        : '这里还没有内容。';
    const actions = empty.stored ? '<button type="button" class="rmt-btn" data-rmt-workspace-tab="archive">检查档案</button>'
        : !empty.memoryReady ? '<button type="button" class="rmt-btn" data-rmt-workspace-tab="archive">前往建立档案</button>'
        : permanentlyReadOnly ? '<span>独立备份仅供阅读</span>'
        : readOnly ? '<span>当前为只读查看；需要操作时可关闭只读。</span>'
        : `<button type="button" class="rmt-btn" data-rmt-generate-mode="${esc(empty.mode)}" data-rmt-reader-generation="true">生成${esc(label)}</button>`;
    const body = overlay.bodyEl(); if (!body) return false;
    body.innerHTML = `${cg_format_ui.cgFormatVisible(empty.mode, ui_workspaceState.workspace.route) ? cg_format_ui.cgFormatControlHtml({readOnly: !!state.activeArchiveSnapshot && state.activeArchiveReadOnly}) : ''}<section class="rmt-workspace-empty"><h2>${esc(label)}</h2><p>${esc(message)}</p><div>${actions}</div></section>`;
    overlay.topTitle(label); overlay.setBackVisible(true,'内容'); overlay.setManageVisible(false); overlay.setRegenerateVisible(false);
    overlay.decorateReadOnlyModeUi(); syncWorkspaceChrome(); return true;
}
export function handleWorkspaceClick(event) {
    const button = event.target?.closest?.('[data-rmt-workspace-tab],[data-rmt-workspace-group],[data-rmt-workspace-layout],[data-rmt-workspace-route],[data-rmt-action="workspace-expand"]');
    if (!button || button.disabled) return false;
    if (button.dataset.rmtWorkspaceTab) openWorkspaceTab(button.dataset.rmtWorkspaceTab);
    else if (button.dataset.rmtWorkspaceRoute && Object.hasOwn(ui_workspaceState.WORKSPACE_ROUTES, button.dataset.rmtWorkspaceRoute)) {
        bookmark.rememberReadingPosition();
        cgEditor.closeCgPromptEditor({ restoreFocus: false });
        const route = button.dataset.rmtWorkspaceRoute; ui_workspaceState.leaveWorkspaceReader(); ui_workspaceState.workspace.tab = 'content'; ui_workspaceState.workspace.route = route;
        void overlay.openCachedOrGenerate(ui_workspaceState.WORKSPACE_ROUTES[route].mode, { workspaceRoute: route });
    } else if (button.dataset.rmtWorkspaceGroup || button.dataset.rmtWorkspaceLayout) {
        ui_workspaceState.setWorkspacePreference(button.dataset.rmtWorkspaceGroup ? 'group' : 'layout', button.dataset.rmtWorkspaceGroup || button.dataset.rmtWorkspaceLayout);
        ui_workspaceState.workspace.tab = 'content'; state.activeArchiveSnapshot ? library.showIndexedArchiveSnapshot(state.activeArchiveSnapshot) : overlay.showChooser({ section: 'content' });
    } else if (button.dataset.rmtAction === 'workspace-expand') { ui_workspaceState.setWorkspacePreference('expanded', !ui_workspaceState.workspace.expanded); syncWorkspaceChrome(); }
    return true;
}
export function handleWorkspaceChange(event) {
    if (event.target?.matches?.('[data-rmt-workspace-startup]')) return ui_workspaceState.setWorkspacePreference('startup', event.target.value);
    if (event.target?.matches?.('[data-rmt-workspace-restore]')) return ui_workspaceState.setWorkspacePreference('restore', !!event.target.checked);
    return false;
}
