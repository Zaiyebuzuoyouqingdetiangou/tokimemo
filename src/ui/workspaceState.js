// UI-only preferences and routes. No archive data, credentials, model output or request state.
const KEY = 'heartbeatMemoriesWorkspaceUiV1';
export const workspace = { tab: 'settings', group: 'memory', layout: 'cards', expanded: false,
    startup: 'settings', restore: true, route: '', empty: null, epoch: 0 };
let loaded = false;
export function loadWorkspacePreferences() {
    if (loaded) return workspace;
    loaded = true;
    try {
        const raw = globalThis.localStorage?.getItem(KEY);
        if (typeof raw === 'string' && raw.length <= 1024) {
            const data = JSON.parse(raw);
            if (['cards', 'list'].includes(data?.layout)) workspace.layout = data.layout;
            if (['memory', 'life', 'interaction', 'stories'].includes(data?.group)) workspace.group = data.group;
            if (['settings', 'archive', 'content'].includes(data?.startup)) workspace.startup = data.startup;
            if (typeof data?.expanded === 'boolean') workspace.expanded = data.expanded;
            if (typeof data?.restore === 'boolean') workspace.restore = data.restore;
        }
    } catch { /* UI preferences are optional, including private browsing. */ }
    return workspace;
}
export function setWorkspacePreference(key, value) {
    loadWorkspacePreferences();
    const allowed = { layout: ['cards', 'list'], group: ['memory', 'life', 'interaction', 'stories'], startup: ['settings', 'archive', 'content'] };
    if (key === 'expanded' || key === 'restore') { if (typeof value !== 'boolean') return false; }
    else if (!Object.hasOwn(allowed, key) || !allowed[key].includes(value)) return false;
    workspace[key] = value;
    try { globalThis.localStorage?.setItem(KEY, JSON.stringify({ layout: workspace.layout, group: workspace.group,
        expanded: workspace.expanded, startup: workspace.startup, restore: workspace.restore })); } catch {}
    return true;
}
export function leaveWorkspaceReader() { workspace.epoch++; workspace.empty = null; workspace.route = ''; }
export const WORKSPACE_ROUTES = Object.freeze({
    album: { mode: 'album', title: '回忆相簿', group: 'memory' },
    adv: { mode: 'adv', title: 'ADV EVENT', group: 'memory' },
    cabinet: { mode: 'cabinet', title: '两个人的陈列柜', group: 'memory' },
    room: { mode: 'room', title: '他的房间', group: 'life' },
    phone: { mode: 'phone', title: '他的私人终端', group: 'life' },
    inbox: { mode: 'inbox', title: '你的邮箱', group: 'life' },
    travel: { mode: 'travel', title: '他的出行路线', group: 'life' },
    themeSong: { mode: 'themeSong', title: '角色印象曲', group: 'interaction' },
    heart: { mode: 'heart', title: '角色互动', group: 'interaction', view: 'seasons' },
    language: { mode: 'heart', title: '基础语言', group: 'interaction' },
    fireflies: { mode: 'heart', title: '萤火虫栖息地', group: 'interaction', view: 'fireflies' },
    strips: { mode: 'heart', title: '日常一格', group: 'interaction', view: 'strips' },
    relations: { mode: 'relations', title: '人际庭园', group: 'interaction' },
    achievements: { mode: 'achievements', title: '成就库', group: 'interaction' },
    ending: { mode: 'ending', title: 'ENDING', group: 'stories' },
    postending: { mode: 'heart', title: '未来 / 后日谈', group: 'stories', view: 'seasons', season: 'postending' },
    butterfly: { mode: 'butterfly', title: '蝴蝶效应', group: 'stories' },
    pastLives: { mode: 'pastLives', title: '前世今生', group: 'stories' },
    calendar: { mode: 'calendar', title: '两个人的日历', group: 'life', deep: true },
    items: { mode: 'items', title: '他的物品', group: 'life', deep: true },
    timeEcho: { mode: 'timeEcho', title: '时空回响', group: 'stories', deep: true },
});
export function workspaceRoute(mode, preferred = '') {
    return Object.hasOwn(WORKSPACE_ROUTES, preferred) && WORKSPACE_ROUTES[preferred].mode === mode
        ? preferred : Object.hasOwn(WORKSPACE_ROUTES, mode) ? mode : '';
}
export function prepareWorkspaceSession(mode, session, route = '') {
    const key = workspaceRoute(mode, route);
    workspace.route = key; workspace.empty = null; workspace.tab = 'content';
    if (!session) return;
    if (mode === 'adv') { session.view = 'adv'; session.paragraphIndex = Number(session.paragraphIndex) || 0; }
    // HEART route presentation is projected by heartReaderState; never overwrite
    // the shared live session just to enter an independent reader.
}

// Filter only the visible management list. The original target validator and mutations
// still receive the original HEART session and IDs; no second store or write scope is created.
export function workspaceManagementScope(session, targets) {
    if (session?.kind !== 'heart') return { targets, title: '', wholeCategory: true };
    const key = workspaceRoute('heart', workspace.route);
    const page = key === 'strips' ? 'strips' : key === 'fireflies' || key === 'heart' && session.view === 'fireflies' ? 'fireflies'
        : key === 'postending' ? 'postending' : key === 'language' ? 'language' : 'seasons';
    const voiceIds = new Set((session.voiceDramas || []).filter(item => page === 'postending' ? item.kind === 'postending' : item.kind !== 'postending').map(item => item.id));
    const visible = targets.filter(item => page === 'strips' ? ['heart-strip','heart-strip-image'].includes(item.type)
        : page === 'fireflies' ? item.type === 'heart-firefly'
        : page === 'language' ? false
        : item.type === 'heart-voice' && voiceIds.has(item.id) || page === 'seasons' && item.type === 'heart-scenario');
    const title = {seasons:'春夏秋冬',strips:'日常一格',fireflies:'萤火虫栖息地',postending:'未来 / 后日谈',language:'基础语言'}[page];
    return { targets: visible, title, wholeCategory: false };
}
