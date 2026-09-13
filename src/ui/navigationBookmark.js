// Page-lifetime navigation bookmarks. Only identity/selection scalars, never content or tasks.
import * as context from '../core/context.js';
import * as cache from '../core/cache.js';
import * as constants from '../core/constants.js';
import * as repository from '../archive/repository.js';
import * as groups from '../archive/groups.js';
import * as library from '../archive/library.js';
import { state as runtimeState } from '../core/state.js';
const positions = new Map();
let restoreSequence = 0;
let visibleScope = '';
let viewportCleanup = null;
const fields = ['selectedId','selectedSpaceId','selectedObjectId','selectedContainerId','selectedAppId','selectedEntryId','selectedLocationId','selectedLetterId','selectedSeason','selectedVoiceId','selectedScenarioId','selectedDramaKey','selectedStripId','selectedFireflyId','selectedConfessionId','selectedNodeId','confessionLineIndex','category','page','view','viewMode','sharedMemory','dialogueIndex','paragraphIndex','presenceIndex','reading','cgOnly','tab','selectedDate','selectedKey','selectedMonth','selectedDateKey','fireflyPage','pastLivesReadMask','pastLivesDrawn','pastLivesClosing'];
const sections = ['api','image','creative','filter','theme','auto','memory','reading'];
const detailSelectors = ['details.rmt-character-profile', 'details.rmt-archive-source-fold'];
function currentScope() {
    try {
        const ctx = context.getContext();
        if (ctx.groupId) return `library-group:${String(ctx.groupId).slice(0, 240)}`;
        if (ctx.characterId === undefined || ctx.characterId === null) return 'library-no-character';
        return context.chatScopeKey(ctx);
    } catch { return ''; }
}
function body() { return document.querySelector('#' + constants.OVERLAY_ID + ' .rmt-body'); }
function isVisible() {
    const element = document.getElementById(constants.OVERLAY_ID);
    return !!element && !element.hidden;
}
export function noteArchiveViewOpened() { visibleScope = currentScope(); }
export function cancelReadingRestore() {
    restoreSequence += 1;
    viewportCleanup?.(); viewportCleanup = null;
}
export function readingPosition(session) {
    const result = {};
    for (const key of fields) {
        const value = session?.[key];
        if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000)
            || (typeof value === 'string' && value.length <= 240)) result[key] = value;
    }
    if (Array.isArray(session?.viewPath) && session.viewPath.length <= 8
        && session.viewPath.every(value => typeof value === 'string' && value.length <= 240)) result.viewPath = [...session.viewPath];
    return result;
}
function pagePosition() {
    const scroller = body();
    // Do not copy input values, arbitrary selectors, markup or generated text.
    return {
        scroll: Math.max(0, Math.min(1000000, Number(scroller?.scrollTop) || 0)),
        sections: sections.filter(id => scroller?.querySelector(`details[data-rmt-settings-section="${id}"]`)?.open),
        details: detailSelectors.map(selector => scroller?.querySelector(selector)?.open === true),
    };
}
function identityFor(entry) {
    return { entryId: context.archiveIndexEntryId(entry), chatId: context.comparableChatId(entry.chatId),
        source: context.archiveSourceIdentityKey(entry) };
}
function sameTarget(entry, target) {
    return !!entry && !!target && context.archiveIndexEntryId(entry) === target.entryId
        && context.comparableChatId(entry.chatId) === target.chatId
        && context.archiveSourceIdentityKey(entry) === target.source;
}
function matchingIndexedEntry(target, ctx) {
    const matches = groups.getArchiveIndex(ctx).filter(entry => sameTarget(entry, target)
        && !groups.isArchiveEntryDeletedFromLibrary(entry, ctx));
    return matches.length === 1 ? matches[0] : null;
}
function availableGroup(key, ctx) {
    return typeof key === 'string' && !!key && key.length <= 120
        && groups.archiveGroupEntries(key, ctx).some(entry => !groups.isArchiveEntryDeletedFromLibrary(entry, ctx));
}
function put(scope, value) {
    positions.delete(scope); positions.set(scope, Object.freeze(value));
    while (positions.size > 20) positions.delete(positions.keys().next().value);
}
export function rememberReadingPosition() {
    cancelReadingRestore(); // Closing cancels in-flight restoration and delayed scroll adjustment.
    try {
        const ctx = context.getContext(), scope = currentScope();
        if (!isVisible() || visibleScope !== scope || body()?.querySelector('.rmt-loading, .rmt-error')) return;
        const page = pagePosition(), mode = runtimeState.activeMode, session = runtimeState.activeSession;
        if (!mode) {
            const level = runtimeState.archiveViewLevel;
            if (level === 'home' || level === 'library') { put(scope, { level, page }); return; }
            if (level === 'character' && availableGroup(runtimeState.archiveLibraryCharacterKey, ctx)) {
                put(scope, { level, groupId: runtimeState.archiveLibraryCharacterKey, page }); return;
            }
        }
        const snapshot = runtimeState.activeArchiveSnapshot;
        if (snapshot) {
            const target = identityFor(snapshot), entry = matchingIndexedEntry(target, ctx);
            if (!entry || !snapshot.memory?.archiveRevision
                || context.comparableChatId(snapshot.memory.chatId) !== target.chatId) return;
            if (mode && (!Object.values(constants.MODE).includes(mode) || session?.chatId !== snapshot.chatId
                || session.archiveRevision !== snapshot.memory.archiveRevision)) return;
            if (!mode && runtimeState.archiveViewLevel !== 'snapshot') return;
            put(scope, { level: mode ? 'mode' : 'snapshot', target, revision: snapshot.memory.archiveRevision,
                mode: mode || null, fence: mode ? cache.modeWriteFenceForCache(snapshot.cache, mode) : '',
                ui: mode ? readingPosition(session) : {}, page });
            return;
        }
        context.currentCharacterGuard();
        const bank = repository.getImportedMemory(ctx);
        if (!bank || groups.isCurrentCharacterDeletedFromLibrary(ctx, bank)) return;
        if (!mode && runtimeState.archiveViewLevel === 'chooser') {
            put(scope, { level: 'chooser', revision: bank.archiveRevision, page }); return;
        }
        if (!Object.values(constants.MODE).includes(mode) || !session || session.chatId !== context.getChatId(ctx)
            || session.archiveRevision !== bank.archiveRevision) return;
        put(scope, { level: 'mode', mode, revision: bank.archiveRevision,
            fence: cache.modeWriteFenceForCache(cache.getCache(ctx), mode), ui: readingPosition(session), page });
    } catch { /* Missing/deleted archives never authorize reconstruction or generation. */ }
}
function beginRestore() {
    cancelReadingRestore();
    const scope = currentScope(), sequence = restoreSequence, epoch = runtimeState.runtimeLifecycleEpoch;
    return { scope, current: () => !!scope && sequence === restoreSequence
        && context.runtimeLifecycleStillCurrent(epoch) && currentScope() === scope, epoch };
}
function restorePage(page, stillCurrent) {
    const scroller = body();
    if (!scroller) return;
    for (const section of sections) {
        const node = scroller.querySelector(`details[data-rmt-settings-section="${section}"]`);
        if (node) node.open = page?.sections?.includes(section) === true;
    }
    detailSelectors.forEach((selector, i) => {
        const node = scroller.querySelector(selector);
        if (node) node.open = page?.details?.[i] === true;
    });
    const apply = () => {
        if (stillCurrent() && isVisible() && body() === scroller) scroller.scrollTop = page?.scroll || 0;
    };
    apply();
    // Images may finish layout after render. Bounded retry; the first user gesture wins.
    const images = Array.from(scroller.querySelectorAll('img')).slice(0, 24);
    const events = ['pointerdown', 'touchstart', 'wheel', 'keydown'];
    let timer, frame, active = true;
    const later = () => { if (active) apply(); };
    const cleanup = () => {
        if (!active) return;
        active = false; clearTimeout(timer);
        if (frame !== undefined) globalThis.cancelAnimationFrame?.(frame);
        for (const image of images) image.removeEventListener('load', later);
        for (const event of events) scroller.removeEventListener(event, cleanup);
    };
    for (const image of images) image.addEventListener('load', later, { once: true });
    for (const event of events) scroller.addEventListener(event, cleanup, { once: true, passive: true });
    if (typeof globalThis.requestAnimationFrame === 'function') frame = globalThis.requestAnimationFrame(later);
    timer = setTimeout(cleanup, 1500);
    viewportCleanup = cleanup;
}
function selectionExists(session, ui) {
    const contains = (list, id) => !id || (Array.isArray(list) && list.some(item => item?.id === id));
    if (ui.selectedId) {
        const list = session.entries || session.events || session.nodes || session.episodes || session.endings;
        if (Array.isArray(list) && !contains(list, ui.selectedId)) return false;
    }
    for (const [key, list] of [['selectedSpaceId', session.spaces], ['selectedAppId', session.apps],
        ['selectedLocationId', session.locations], ['selectedLetterId', session.letters],
        ['selectedVoiceId', session.voiceDramas], ['selectedScenarioId', session.scenarioDramas], ['selectedStripId', session.dailyStrips]]) {
        if (key === 'selectedAppId' && ui[key] === '__PHONE_HOME__') continue;
        if (ui[key] && !contains(list, ui[key])) return false;
    }
    if (ui.selectedConfessionId && !contains(session.confessionReplays, ui.selectedConfessionId)) return false;
    if (ui.selectedFireflyId && !contains(session.fireflyVoices, ui.selectedFireflyId)) return false;
    if (ui.selectedContainerId) {
        const container = session.containers?.find(item => item.id === ui.selectedContainerId);
        if (!container) return false;
        let nodes = container.nodes;
        for (const id of ui.viewPath || []) {
            nodes = nodes?.find(node => node.id === id)?.children;
            if (!Array.isArray(nodes)) return false;
        }
        if (!contains(nodes, ui.selectedNodeId)) return false;
    }
    const space = session.spaces?.find(item => item.id === ui.selectedSpaceId);
    if (space && !contains(space.objects, ui.selectedObjectId)) return false;
    const app = session.apps?.find(item => item.id === ui.selectedAppId);
    if (app && !contains(app.entries, ui.selectedEntryId)) return false;
    return true;
}
function restoreSession(mark, bank, currentCache, ctx, options, token, snapshot = null) {
    if (mark.revision !== bank.archiveRevision || cache.modeWriteFenceForCache(currentCache, mark.mode) !== mark.fence) return false;
    const session = cache.loadSession(mark.mode, { context: ctx, chatId: bank.chatId, memoryBank: bank, cache: currentCache, clone: true });
    if (!session || !selectionExists(session, mark.ui)) return false;
    Object.assign(session, mark.ui);
    runtimeState.activeArchiveSnapshot = snapshot;
    // Bookmarks restore a view, never a previous permission grant.
    runtimeState.activeArchiveReadOnly = !!snapshot;
    runtimeState.archiveViewLevel = snapshot ? 'snapshot' : 'chooser';
    runtimeState.archiveLibraryCharacterKey = snapshot?.archiveGroupId || '';
    runtimeState.activeMode = mark.mode; runtimeState.activeSession = session;
    options.open(); options.render(); options.stopAutomaticLife?.();
    restorePage(mark.page, token.current);
    return true;
}
function currentRoot(options, ctx) {
    runtimeState.activeArchiveSnapshot = null; runtimeState.activeArchiveReadOnly = true;
    return repository.getImportedMemory(ctx) && !groups.isCurrentCharacterDeletedFromLibrary(ctx)
        ? options.chooser?.() : options.home?.();
}
export function restoreReadingPosition(options = {}) {
    try {
        const ctx = context.getContext(), mark = positions.get(currentScope());
        if (!mark || mark.target || mark.level === 'library' || needsLocalHydration(mark, ctx)) return false;
        const token = beginRestore();
        if (mark.level === 'home' && options.home) {
            options.home();
            // showHome closes/replaces existing views, which cancels any older restore token.
            const pageToken = beginRestore(); restorePage(mark.page, pageToken.current); return true;
        }
        if (mark.level === 'character' && options.character) {
            if (!availableGroup(mark.groupId, ctx)) { positions.delete(token.scope); return false; }
            options.character(mark.groupId); restorePage(mark.page, token.current); return true;
        }
        context.currentCharacterGuard();
        const bank = repository.getImportedMemory(ctx);
        if (mark.level === 'chooser' && options.chooser) {
            if (!bank || groups.isCurrentCharacterDeletedFromLibrary(ctx, bank)) { positions.delete(token.scope); return false; }
            currentRoot(options, ctx);
            if (bank.archiveRevision === mark.revision) restorePage(mark.page, token.current);
            return true;
        }
        if (mark.level !== 'mode' || !bank || !Object.values(constants.MODE).includes(mark.mode)
            || groups.isCurrentCharacterDeletedFromLibrary(ctx, bank)) { positions.delete(token.scope); return false; }
        if (restoreSession(mark, bank, cache.getCache(ctx), ctx, options, token)) return true;
        positions.delete(token.scope);
        if (options.chooser) { currentRoot(options, ctx); return true; }
        return false;
    } catch { return false; }
}
function needsLocalHydration(mark, ctx) {
    return !!mark && !mark.target && ['mode', 'chooser'].includes(mark.level)
        && cache.isCompressedCacheRecord(ctx?.chatMetadata?.[constants.CACHE_KEY])
        && !runtimeState.runtimeSessionCache.has(cache.cacheScopeFromContext(ctx));
}
export function hasIndexedReadingPosition() {
    try {
        const mark = positions.get(currentScope());
        return !!mark && (!!mark.target || mark.level === 'library' || needsLocalHydration(mark, context.getContext()));
    } catch { return false; }
}
export async function restoreIndexedReadingPosition(options = {}) {
    const token = beginRestore();
    const fallback = () => { if (token.current()) { positions.delete(token.scope); (options.fallback || options.home)?.(); } };
    try {
        const ctx = context.getContext(), mark = positions.get(token.scope);
        if (!mark) { fallback(); return false; }
        if (needsLocalHydration(mark, ctx)) {
            options.pending?.();
            await cache.ensureCacheHydrated(ctx);
            if (!token.current()) return false;
            if (restoreReadingPosition(options)) return true;
            // The synchronous dispatcher may have invalidated its own stale bookmark.
            // No await intervenes: use the current fallback, not the superseded token.
            (options.fallback || options.home)?.(); return false;
        }
        if (mark.level === 'library' && options.library) {
            await options.library({ canContinue: token.current });
            if (!token.current()) return false;
            restorePage(mark.page, token.current); return true;
        }
        const indexed = mark.target && matchingIndexedEntry(mark.target, ctx);
        if (!indexed) { fallback(); return false; }
        options.pending?.();
        // Only re-read the explicitly selected archive. No chat switch and no memory rebuild.
        const snapshot = await library.fetchIndexedArchiveSnapshot(indexed, ctx, { force: true, lifecycleEpoch: token.epoch });
        if (!token.current()) return false;
        const live = context.getContext();
        if (!matchingIndexedEntry(mark.target, live) || !sameTarget(snapshot, mark.target)
            || context.comparableChatId(snapshot.memory?.chatId) !== mark.target.chatId) { fallback(); return false; }
        if (mark.level === 'mode' && Object.values(constants.MODE).includes(mark.mode)
            && restoreSession(mark, snapshot.memory, snapshot.cache, live, options, token, snapshot)) return true;
        runtimeState.activeArchiveSnapshot = null; runtimeState.activeArchiveReadOnly = true;
        library.showIndexedArchiveSnapshot(snapshot);
        runtimeState.archiveLibraryCharacterKey = snapshot.archiveGroupId || '';
        if (mark.level === 'snapshot' && mark.revision === snapshot.memory.archiveRevision) restorePage(mark.page, token.current);
        return true;
    } catch { fallback(); return false; }
}
export function clearReadingPositions() { cancelReadingRestore(); positions.clear(); visibleScope = ''; }
