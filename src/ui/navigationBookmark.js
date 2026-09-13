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
        const ctx = context.currentCharacterGuard(), bank = repository.requireArchive(ctx);
        if (!runtimeState.activeMode || !runtimeState.activeSession || runtimeState.activeSession.chatId !== context.getChatId(ctx)
            || runtimeState.activeSession.archiveRevision !== bank.archiveRevision) return;
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
        const key = context.chatScopeKey(ctx);
        const scroller = document.querySelector('#' + constants.OVERLAY_ID + ' .rmt-body');
        positions.delete(key);
        positions.set(key, { mode: runtimeState.activeMode, revision: bank.archiveRevision,
            ...(indexed ? { entryId: context.archiveIndexEntryId(indexed), readOnly: runtimeState.activeArchiveReadOnly || snapshot.backupOnly === true } : {}),
            fence: cache.modeWriteFenceForCache(snapshot?.cache || cache.getCache(ctx), runtimeState.activeMode),
            ui: readingPosition(runtimeState.activeSession), scroll: Math.max(0, Math.min(1000000, Number(scroller?.scrollTop) || 0)) });
        while (positions.size > 20) positions.delete(positions.keys().next().value);
    } catch {}
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
        Object.assign(session, mark.ui);
        // Read from the current canonical chat, never restore a stale snapshot from another chat.
        runtimeState.activeArchiveSnapshot = null;
        runtimeState.activeArchiveReadOnly = false;
        runtimeState.activeMode = mark.mode; runtimeState.activeSession = session;
        open(); render(); stopAutomaticLife?.();
        const scroller = document.querySelector('#' + constants.OVERLAY_ID + ' .rmt-body');
        if (scroller) scroller.scrollTop = mark.scroll;
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
export async function restoreIndexedReadingPosition({ open, render, stopAutomaticLife, fallback } = {}) {
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
        if (!indexed || mark.revision !== bank.archiveRevision || !Object.values(constants.MODE).includes(mark.mode)) {
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
        const session = cache.loadSession(mark.mode, { context: live, memoryBank: snapshot.memory, cache: snapshot.cache, clone: true });
        const selected = mark.ui.selectedId, items = session?.entries || session?.events || session?.nodes || session?.episodes;
        if (!session || (selected && Array.isArray(items) && !items.some(item => item.id === selected))) { fallback?.(); return false; }
        Object.assign(session, mark.ui);
        runtimeState.activeArchiveSnapshot = snapshot;
        runtimeState.activeArchiveReadOnly = mark.readOnly !== false || snapshot.backupOnly === true;
        runtimeState.archiveViewLevel = 'snapshot'; runtimeState.archiveLibraryCharacterKey = snapshot.archiveGroupId || '';
        runtimeState.activeMode = mark.mode; runtimeState.activeSession = session;
        open(); render(); stopAutomaticLife?.();
        const scroller = document.querySelector('#' + constants.OVERLAY_ID + ' .rmt-body');
        if (scroller) scroller.scrollTop = mark.scroll;
        return true;
    } catch {
        if (stillCurrent()) fallback?.();
        return false;
    }
}
export function clearReadingPositions() { restoreSequence += 1; positions.clear(); }
