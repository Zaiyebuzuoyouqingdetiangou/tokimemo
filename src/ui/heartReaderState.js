// Route-local reading cursors, not a second HEART store. Only bounded selection
// scalars are retained; content, task origins and persisted sessions remain canonical.
import * as context from '../core/context.js';
import { state as runtimeState } from '../core/state.js';
import * as routes from './workspaceState.js';
const cursors = new Map();
const standalone = new Set(['postending', 'strips', 'fireflies', 'language']);
const fields = ['view', 'selectedSeason', 'selectedVoiceId', 'selectedScenarioId',
    'selectedDramaKey', 'selectedStripId', 'selectedFireflyId'];
const views = new Set(['seasons', 'strips', 'fireflies']);
const seasons = new Set(['spring', 'summer', 'autumn', 'winter', 'postending']);
function routeKey(route = routes.workspace.route) { return routes.workspaceRoute('heart', route) || 'heart'; }
export function isStandaloneHeartRoute(route = routes.workspace.route) { return standalone.has(routeKey(route)); }
function owner(session) {
    if (session?.kind !== 'heart') return '';
    try {
        const snapshot = runtimeState.activeArchiveSnapshot;
        const identity = snapshot ? ['snapshot', snapshot.entryId || '', snapshot.characterKey || '', snapshot.backupOnly === true]
            : ['live', context.chatScopeKey(context.getContext())];
        return JSON.stringify([runtimeState.runtimeLifecycleEpoch, identity, session.chatId || '', session.archiveRevision || '']);
    } catch { return ''; }
}
export function heartSelectionScalars(value) {
    const out = {};
    for (const field of fields) {
        const v = value?.[field];
        if (typeof v !== 'string' || v.length > 240) continue;
        if (field === 'view' && !views.has(v) || field === 'selectedSeason' && !seasons.has(v)) continue;
        out[field] = v;
    }
    return out;
}
function cursorKey(session, route) { const id = owner(session); return id ? id + '\n' + routeKey(route) : ''; }
function store(key, values) {
    if (!key) return;
    cursors.delete(key); cursors.set(key, heartSelectionScalars(values));
    while (cursors.size > 80) cursors.delete(cursors.keys().next().value);
}
export function heartReaderSession(session = runtimeState.activeSession, route = routes.workspace.route) {
    if (session?.kind !== 'heart') return session;
    const key = routeKey(route);
    if (!standalone.has(key)) return session;
    const cursor = cursors.get(cursorKey(session, key));
    // Shallow projection: data lists retain their canonical item references so draw,
    // delete and management validate the actual item, never a copied content store.
    const view = { ...session, ...cursor };
    if (key === 'postending') { view.view = 'seasons'; view.selectedSeason = 'postending'; }
    if (key === 'strips') view.view = 'strips';
    if (key === 'fireflies') view.view = 'fireflies';
    return view;
}
export function rememberHeartReader(view = heartReaderSession(), route = routes.workspace.route) {
    const session = runtimeState.activeSession;
    if (view?.kind !== 'heart' || session?.kind !== 'heart') return;
    store(cursorKey(session, route), view);
    // Preserve the ordinary page's original remember-selection semantics. A
    // standalone route must never write these scalars into the active session.
    if (!isStandaloneHeartRoute(route)) Object.assign(session, heartSelectionScalars(view));
}
export function captureHeartReaderBookmark(session = runtimeState.activeSession) {
    return session?.kind === 'heart' ? heartSelectionScalars(heartReaderSession(session)) : null;
}
export function restoreHeartReaderBookmark(session, bookmark, route = routes.workspace.route) {
    if (session?.kind !== 'heart' || !bookmark) return;
    store(cursorKey(session, route), bookmark);
}
export function clearHeartReaderPositions() { cursors.clear(); }

export function enterHeartReader(session, route = routes.workspace.route) {
    if (session?.kind !== 'heart' || isStandaloneHeartRoute(route)) return;
    const cursor = cursors.get(cursorKey(session, route));
    if (cursor) Object.assign(session, heartSelectionScalars(cursor));
}
