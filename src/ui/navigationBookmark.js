import * as heart_reader from './heartReaderState.js';
import * as ui_workspaceState from './workspaceState.js';
// Reading positions only. Never store generated text, source context or live tasks.
import * as context from '../core/context.js';
import * as cache from '../core/cache.js';
import * as constants from '../core/constants.js';
import * as repository from '../archive/repository.js';
import * as groups from '../archive/groups.js';
import * as library from '../archive/library.js';
import { state as runtimeState } from '../core/state.js';
const positions = new Map();
let restoreSequence = 0;
const pages = new Set(['home', 'chooser', 'library', 'character']);
const settingsSections = ['api', 'image', 'creative', 'filter', 'theme', 'auto', 'memory', 'reading'];
function settingsSection(key) {
    return document.querySelector('#' + constants.OVERLAY_ID + ` [data-rmt-settings-section="${key}"]`);
}
function scrollPosition() {
    const scroller = document.querySelector('#' + constants.OVERLAY_ID + ' .rmt-body');
    return Math.max(0, Math.min(1000000, Number(scroller?.scrollTop) || 0));
}
function savePosition(key, mark) {
    positions.delete(key);
    positions.set(key, mark);
    while (positions.size > 20) positions.delete(positions.keys().next().value);
}
function restoreScroll(mark) {
    const scroller = document.querySelector('#' + constants.OVERLAY_ID + ' .rmt-body');
    if (scroller) scroller.scrollTop = mark.scroll;
}
const fields = ['selectedId','selectedSpaceId','selectedObjectId','selectedContainerId','selectedAppId','selectedEntryId','selectedLocationId','selectedLetterId','selectedSeason','selectedVoiceId','selectedScenarioId','selectedDramaKey','selectedStripId','category','page','view','viewMode','sharedMemory','dialogueIndex','paragraphIndex','reading','cgOnly','tab','selectedDate','selectedKey','fireflyPage','pastLivesReadMask','pastLivesDrawn','pastLivesClosing'];
export function readingPosition(session) {
    const result = {};
    for (const key of fields) {
        const value = session?.[key];
        if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000)
            || (typeof value === 'string' && value.length <= 240)) result[key] = value;
    }
    return result;
}
export function rememberReadingPosition() {
    restoreSequence += 1; // Closing also cancels an outstanding indexed read.
    try {
        const ctx = context.currentCharacterGuard(), key = context.chatScopeKey(ctx);
        const page = runtimeState.archiveViewLevel;
        if (!runtimeState.activeMode && !runtimeState.activeSession && !runtimeState.activeArchiveSnapshot && pages.has(page)) {
            savePosition(key, { page, scroll: scrollPosition(), workspaceTab: ui_workspaceState.workspace.tab,
                ...(page === 'home' ? { sections: settingsSections.filter(section => settingsSection(section)?.open === true) } : {}),
                ...(page === 'character' ? { groupId: runtimeState.archiveLibraryCharacterKey } : {}) });
            return;
        }
        const bank = repository.requireArchive(ctx);
        const snapshotPage = page === 'snapshot' && !runtimeState.activeMode && !runtimeState.activeSession;
        if (!snapshotPage && (!runtimeState.activeMode || !runtimeState.activeSession || runtimeState.activeSession.chatId !== context.getChatId(ctx)
            || runtimeState.activeSession.archiveRevision !== bank.archiveRevision)) return;
        const snapshot = runtimeState.activeArchiveSnapshot;
        let indexed = null;
        if (snapshot) {
            // A scalar chatId alone is not an identity proof. Other chats and
            // incomplete snapshots must not replace this chat's last location.
            if (!snapshot.entryId || snapshot.memory?.archiveRevision !== bank.archiveRevision
                || context.comparableChatId(snapshot.chatId) !== context.comparableChatId(context.getChatId(ctx))
                || context.comparableChatId(snapshot.memory?.chatId) !== context.comparableChatId(context.getChatId(ctx))) return;
            indexed = matchingIndexedEntry(snapshot.entryId, ctx);
            if (!indexed || !context.archiveEntryMatchesContextCharacter(snapshot, ctx)) return;
        }
        if (snapshotPage && !indexed) return;
        savePosition(key, { mode: runtimeState.activeMode, revision: bank.archiveRevision, workspaceRoute: ui_workspaceState.workspace.route, workspaceTab: ui_workspaceState.workspace.tab,
            ...(snapshotPage ? { page: 'snapshot' } : {}),
            ...(indexed ? { entryId: context.archiveIndexEntryId(indexed), readOnly: runtimeState.activeArchiveReadOnly || snapshot.backupOnly === true } : {}),
            fence: cache.modeWriteFenceForCache(snapshot?.cache || cache.getCache(ctx), runtimeState.activeMode),
            heartUi: heart_reader.captureHeartReaderBookmark(), ui: readingPosition(runtimeState.activeSession), scroll: scrollPosition() });
    } catch {}
}
// Page bookmarks do not need an archive: the user may leave the home/settings
// screen or the archive chooser before creating their first memory bank.
export function restorePagePosition({ home, chooser, library: showLibrary, character } = {}) {
    try {
        const ctx = context.currentCharacterGuard(), scope = context.chatScopeKey(ctx);
        const mark = positions.get(scope);
        if (!mark || !pages.has(mark.page)) return false;
        if (mark.page === 'character' && (typeof mark.groupId !== 'string' || mark.groupId.length > 120
            || !groups.archiveGroupEntries(mark.groupId, ctx).some(entry => !groups.isArchiveEntryDeletedFromLibrary(entry, ctx)))) return false;
        const show = { home, chooser, library: showLibrary, character }[mark.page];
        if (typeof show !== 'function') return false;
        let sequence = ++restoreSequence;
        const epoch = runtimeState.runtimeLifecycleEpoch;
        const finish = () => {
            try {
                if (sequence === restoreSequence && context.runtimeLifecycleStillCurrent(epoch)
                    && context.chatScopeKey(context.currentCharacterGuard()) === scope
                    && runtimeState.archiveViewLevel === mark.page && !runtimeState.activeMode
                    && !document.getElementById(constants.OVERLAY_ID)?.hidden) restoreScroll(mark);
            } catch {}
        };
        // The library renders asynchronously; do not apply its old scroll position
        // after a close, another navigation, or a change of chat.
        const sections = settingsSections.filter(section => mark.sections?.includes(section));
        if (['archive','content'].includes(mark.workspaceTab)) ui_workspaceState.workspace.tab = mark.workspaceTab;
        const result = show(mark.page === 'home'
            ? { section: sections.includes('memory') ? 'memory' : sections[0] || '' }
            : mark.groupId);
        if (mark.page === 'home') for (const key of settingsSections) {
            const details = settingsSection(key);
            if (details) details.open = sections.includes(key);
        }
        // showHome remembers the page it is leaving synchronously. That is part
        // of this navigation, not a later close that should cancel restoration.
        sequence = restoreSequence;
        if (result?.then) void result.then(finish).catch(() => {});
        else finish();
        return true;
    } catch { return false; }
}
export function restoreReadingPosition({ open, render, stopAutomaticLife } = {}) {
    try {
        const ctx = context.currentCharacterGuard(), bank = repository.requireArchive(ctx);
        const mark = positions.get(context.chatScopeKey(ctx));
        if (!mark || mark.entryId || mark.revision !== bank.archiveRevision || !Object.values(constants.MODE).includes(mark.mode)) return false;
        const current = cache.getCache(ctx);
        if (cache.modeWriteFenceForCache(current, mark.mode) !== mark.fence) return false;
        const session = cache.loadSession(mark.mode, {context:ctx,memoryBank:bank,clone:true});
        if (!session) return false;
        const selected = mark.ui.selectedId;
        const items = session.entries || session.events || session.nodes || session.episodes;
        if (selected && Array.isArray(items) && !items.some(item => item.id === selected)) return false;
        ui_workspaceState.workspace.route = ui_workspaceState.workspaceRoute(mark.mode, mark.workspaceRoute); ui_workspaceState.workspace.empty = null;
        Object.assign(session, mark.ui);
        // Read from the current canonical chat, never restore a stale snapshot from another chat.
        runtimeState.activeArchiveSnapshot = null;
        runtimeState.activeArchiveReadOnly = false;
        runtimeState.activeMode = mark.mode; runtimeState.activeSession = session;
        heart_reader.restoreHeartReaderBookmark(session, mark.heartUi);
        open(); render(); stopAutomaticLife?.();
        restoreScroll(mark);
        return true;
    } catch { return false; }
}
function matchingIndexedEntry(entryId, ctx) {
    const matches = groups.getArchiveIndex(ctx).filter(entry => context.archiveIndexEntryId(entry) === entryId
        && context.comparableChatId(entry.chatId) === context.comparableChatId(context.getChatId(ctx))
        && context.archiveEntryMatchesContextCharacter(entry, ctx)
        && !groups.isArchiveEntryDeletedFromLibrary(entry, ctx));
    return matches.length === 1 ? matches[0] : null;
}
export function hasIndexedReadingPosition() {
    try { return !!positions.get(context.chatScopeKey(context.currentCharacterGuard()))?.entryId; } catch { return false; }
}
export async function restoreIndexedReadingPosition({ open, render, renderSnapshot, stopAutomaticLife, fallback } = {}) {
    const sequence = ++restoreSequence;
    let scope, epoch;
    const stillCurrent = () => {
        try { return sequence === restoreSequence && context.runtimeLifecycleStillCurrent(epoch)
            && context.chatScopeKey(context.currentCharacterGuard()) === scope; } catch { return false; }
    };
    try {
        const ctx = context.currentCharacterGuard(), bank = repository.requireArchive(ctx);
        scope = context.chatScopeKey(ctx); epoch = runtimeState.runtimeLifecycleEpoch;
        const mark = positions.get(scope), indexed = mark?.entryId && matchingIndexedEntry(mark.entryId, ctx);
        const snapshotPage = mark?.page === 'snapshot';
        if (!indexed || mark.revision !== bank.archiveRevision || (!snapshotPage && !Object.values(constants.MODE).includes(mark.mode))) {
            if (stillCurrent()) fallback?.(); return false;
        }
        // Store only entry identity + UI scalars; never resurrect the old snapshot
        // content. Source chat and canonical IndexedDB are re-read on every open.
        const snapshot = await library.fetchIndexedArchiveSnapshot(indexed, ctx, { force: true, lifecycleEpoch: epoch });
        if (!stillCurrent()) return false;
        const live = context.currentCharacterGuard();
        if (!matchingIndexedEntry(mark.entryId, live) || snapshot.entryId !== mark.entryId
            || !context.archiveEntryMatchesContextCharacter(snapshot, live)
            || context.comparableChatId(snapshot.memory?.chatId) !== context.comparableChatId(context.getChatId(live))
            || snapshot.memory?.archiveRevision !== mark.revision
            || repository.requireArchive(live).archiveRevision !== mark.revision
            || cache.modeWriteFenceForCache(snapshot.cache, mark.mode) !== mark.fence) {
            fallback?.(); return false;
        }
        if (snapshotPage) {
            if (typeof renderSnapshot !== 'function') { fallback?.(); return false; }
            runtimeState.activeArchiveSnapshot = snapshot;
            runtimeState.activeArchiveReadOnly = mark.readOnly !== false || snapshot.backupOnly === true;
            if (['archive','content'].includes(mark.workspaceTab)) ui_workspaceState.workspace.tab = mark.workspaceTab;
            renderSnapshot(snapshot);
            stopAutomaticLife?.(); restoreScroll(mark);
            return true;
        }
        const session = cache.loadSession(mark.mode, { context: live, memoryBank: snapshot.memory, cache: snapshot.cache, clone: true });
        const selected = mark.ui.selectedId, items = session?.entries || session?.events || session?.nodes || session?.episodes;
        if (!session || (selected && Array.isArray(items) && !items.some(item => item.id === selected))) { fallback?.(); return false; }
        ui_workspaceState.workspace.route = ui_workspaceState.workspaceRoute(mark.mode, mark.workspaceRoute); ui_workspaceState.workspace.empty = null;
        Object.assign(session, mark.ui);
        runtimeState.activeArchiveSnapshot = snapshot;
        runtimeState.activeArchiveReadOnly = mark.readOnly !== false || snapshot.backupOnly === true;
        runtimeState.archiveViewLevel = 'snapshot'; runtimeState.archiveLibraryCharacterKey = snapshot.archiveGroupId || '';
        runtimeState.activeMode = mark.mode; runtimeState.activeSession = session;
        heart_reader.restoreHeartReaderBookmark(session, mark.heartUi);
        open(); render(); stopAutomaticLife?.();
        restoreScroll(mark);
        return true;
    } catch {
        if (stillCurrent()) fallback?.();
        return false;
    }
}
export function clearReadingPositions() { restoreSequence += 1; positions.clear(); heart_reader.clearHeartReaderPositions(); }
