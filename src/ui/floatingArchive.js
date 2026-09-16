import * as ui_workspaceState from './workspaceState.js';
// One in-page reading bookmark; never retain a second archive or image payload.
import * as context from '../core/context.js';
import * as constants from '../core/constants.js';
import * as settings from '../core/settings.js';
import * as cache from '../core/cache.js';
import * as groups from '../archive/groups.js';
import * as library from '../archive/library.js';
import * as repository from '../archive/repository.js';
import * as avatars from './archiveAvatars.js';
import * as button from './floatingAvatarButton.js';
import * as navigation from './navigationBookmark.js';
import * as portal from './archivePortal.js';
import * as overlay from './overlay.js';
import * as room from '../modes/room.js';
import { state as runtimeState } from '../core/state.js';

let floating = null, target = null, sequence = 0, loading = 0;
function hostScope(ctx) { try { return context.chatScopeKey(ctx); } catch { return ''; } }
function scroll() { return Math.max(0, Math.min(1000000, Number(overlay.bodyEl()?.scrollTop) || 0)); }
function restoreScroll(mark) { const body = overlay.bodyEl(); if (body) body.scrollTop = mark.scroll; }
function liveAvatar(ctx) { return avatars.normalizeAvatarFile(ctx?.characters?.[ctx.characterId]?.avatar || ctx?.characters?.[ctx.characterId]?.data?.avatar); }
function entryFor(mark, ctx) {
    const matches = groups.getArchiveIndex(ctx).filter(entry => context.archiveIndexEntryId(entry) === mark.entryId
        && context.comparableChatId(entry.chatId) === context.comparableChatId(mark.chatId)
        && context.archiveSourceIdentityKey(entry) === mark.sourceKey
        && !groups.isArchiveEntryDeletedFromLibrary(entry, ctx));
    return matches.length === 1 ? matches[0] : null;
}
export function floatingArchiveTarget() { return target ? { ...target, ui: { ...target.ui } } : null; }

export function rememberFloatingArchive() {
    sequence += 1;
    if (loading) { loading = 0; return; }
    try {
        const ctx = context.getContext(), scope = hostScope(ctx);
        const page = runtimeState.archiveViewLevel;
        const snapshot = runtimeState.activeArchiveSnapshot;
        const indexed = snapshot && (page === 'snapshot' || runtimeState.activeMode)
            ? groups.getArchiveIndex(ctx).find(entry => context.archiveIndexEntryId(entry) === snapshot.entryId) : null;
        let memory = null;
        if (!snapshot) try { memory = repository.requireArchive(ctx); } catch {}
        const liveEntry = !snapshot && memory ? groups.getArchiveIndex(ctx).find(entry =>
            context.comparableChatId(entry.chatId) === context.comparableChatId(context.getChatId(ctx))
            && context.archiveEntryMatchesContextCharacter(entry, ctx)
            && !groups.isArchiveEntryDeletedFromLibrary(entry, ctx)) : null;
        const entry = indexed || liveEntry;
        const mode = runtimeState.activeMode;
        const mark = { scope, page, scroll: scroll(), mode: mode || null, ui: navigation.readingPosition(runtimeState.activeSession), workspaceRoute: ui_workspaceState.workspace.route, workspaceTab: ui_workspaceState.workspace.tab };
        if (indexed || (!snapshot && (mode || page === 'chooser'))) {
            const bank = indexed ? snapshot.memory : memory;
            Object.assign(mark, { chatId: indexed ? snapshot.chatId : context.getChatId(ctx),
                avatar: avatars.normalizeAvatarFile(indexed ? snapshot.avatar || context.archiveStoredAvatar(indexed) : liveAvatar(ctx)),
                userAvatar: indexed ? avatars.archiveUserAvatar(snapshot, indexed) || avatars.archiveUserAvatar(snapshot.memory)
                    : avatars.archiveUserAvatar(memory, liveEntry) || avatars.currentUserAvatar(ctx),
                label: String(indexed ? snapshot.characterName || indexed.characterName : ctx.name2 || '心迹回廊').slice(0, 120),
                revision: bank?.archiveRevision, indexed: !!indexed,
                fence: mode ? cache.modeWriteFenceForCache(indexed ? snapshot.cache : cache.getCache(ctx), mode) : '' });
            if (entry) Object.assign(mark, { entryId: context.archiveIndexEntryId(entry), sourceKey: context.archiveSourceIdentityKey(entry) });
        } else if (page === 'character') {
            const groupId = runtimeState.archiveLibraryCharacterKey;
            const entries = groups.archiveGroupEntries(groupId, ctx).filter(entry => !groups.isArchiveEntryDeletedFromLibrary(entry, ctx));
            const meta = groups.archiveGroupMeta(groupId, entries, ctx);
            const users = new Set(entries.map(entry => avatars.archiveUserAvatar(null, entry)));
            Object.assign(mark, { groupId, avatar: avatars.normalizeAvatarFile(meta.avatar),
                userAvatar: users.size === 1 ? [...users][0] : '', label: String(meta.label || '心迹回廊').slice(0, 120) });
        } else {
            // Home/settings have no archive owner. Keep the last room's face,
            // while the existing navigation bookmark restores the actual page.
            Object.assign(mark, { avatar: target?.avatar || liveAvatar(ctx),
                userAvatar: target ? target.userAvatar : avatars.currentUserAvatar(ctx), label: target?.label || '心迹回廊' });
        }
        target = mark;
    } catch { /* A missing host must not interrupt closing the archive. */ }
}

export function hideFloatingArchive() { sequence += 1; loading = 0; floating?.update({ visible: false }); }
export function refreshFloatingArchive() {
    if (!floating) return;
    try {
        const ctx = context.getContext(), prefs = settings.getPluginSettings(ctx);
        const owner = target || { avatar: liveAvatar(ctx), userAvatar: avatars.currentUserAvatar(ctx), label: ctx?.name2 };
        floating.update({ visible: prefs.floatingAvatar !== 'off' && !!document.getElementById(constants.OVERLAY_ID)?.hidden,
            src: prefs.floatingAvatar === 'user' ? avatars.userAvatarUrl(owner.userAvatar) : avatars.characterAvatarUrl(owner.avatar, ctx),
            label: `${owner.label || '心迹回廊'} · 打开心迹回廊`, position: prefs.floatingAvatarPosition });
    } catch { floating.update({ visible: false }); }
}
export function initFloatingArchive() {
    if (floating) return;
    floating = button.createFloatingAvatarButton({ onOpen: () => { void openFloatingArchive(); },
        onMove: position => { try { settings.updatePluginSettings({ floatingAvatarPosition: position }); } catch {} },
        position: settings.getPluginSettings(context.getContext()).floatingAvatarPosition });
    refreshFloatingArchive();
}
export function destroyFloatingArchive() {
    sequence += 1; loading = 0; target = null;
    floating?.destroy(); floating = null;
}

export async function openFloatingArchive() {
    const mark = target;
    const ctx = context.getContext();
    if (!mark) return portal.safeShowArchiveLibrary('floating-avatar');
    // Same-chat live pages keep the existing navigation and edit guards.
    if (!mark.indexed && mark.scope === hostScope(ctx)) return portal.safeShowArchiveLibrary('floating-avatar');
    if (mark.page === 'character' && groups.archiveGroupEntries(mark.groupId, ctx).length) {
        library.showArchiveCharacter(mark.groupId); restoreScroll(mark); return true;
    }
    if (!mark.entryId || !entryFor(mark, ctx)) { target = null; portal.showHome(); return false; }
    const epoch = runtimeState.runtimeLifecycleEpoch, scope = hostScope(ctx);
    overlay.openOverlay();
    runtimeState.activeMode = null; runtimeState.activeSession = null; runtimeState.activeArchiveSnapshot = null;
    runtimeState.archiveViewLevel = 'snapshot';
    const body = overlay.bodyEl();
    const placeholder = '<div class="rmt-empty">正在打开档案…</div>';
    if (body) body.innerHTML = placeholder;
    overlay.topTitle('心迹回廊 · 打开档案');
    const request = ++sequence; loading = request;
    const current = () => request === sequence && context.runtimeLifecycleStillCurrent(epoch)
        && hostScope(context.getContext()) === scope && !document.getElementById(constants.OVERLAY_ID)?.hidden
        && overlay.bodyEl() === body && body?.innerHTML === placeholder;
    try {
        const snapshot = await library.fetchIndexedArchiveSnapshot(entryFor(mark, ctx), ctx, { force: true, lifecycleEpoch: epoch });
        if (!current()) return false;
        if (!entryFor(mark, context.getContext()) || snapshot.entryId !== mark.entryId
            || context.archiveSourceIdentityKey(snapshot) !== mark.sourceKey
            || context.comparableChatId(snapshot.memory?.chatId) !== context.comparableChatId(mark.chatId)) {
            target = null; portal.showHome(); return false;
        }
        // Re-read canonical contents. Changed/deleted details fall back to the
        // fresh overview, and a historical reopen always starts read-only.
        let session = null;
        if (snapshot.memory.archiveRevision === mark.revision && Object.values(constants.MODE).includes(mark.mode)
            && cache.modeWriteFenceForCache(snapshot.cache, mark.mode) === mark.fence) {
            session = cache.loadSession(mark.mode, { context: ctx, chatId: snapshot.chatId, memoryBank: snapshot.memory, cache: snapshot.cache, clone: true });
            const items = session?.entries || session?.events || session?.nodes || session?.episodes;
            if (mark.ui.selectedId && Array.isArray(items) && !items.some(item => item.id === mark.ui.selectedId)) session = null;
        }
        runtimeState.activeArchiveSnapshot = snapshot; runtimeState.activeArchiveReadOnly = true;
        runtimeState.archiveLibraryCharacterKey = snapshot.archiveGroupId || '';
        if (session) {
            ui_workspaceState.workspace.route = ui_workspaceState.workspaceRoute(mark.mode, mark.workspaceRoute); ui_workspaceState.workspace.empty = null;
            Object.assign(session, mark.ui);
            runtimeState.activeMode = mark.mode; runtimeState.activeSession = session;
            overlay.renderActive(); room.stopRoomClock(); restoreScroll(mark);
        } else {
            if (['archive','content'].includes(mark.workspaceTab)) ui_workspaceState.workspace.tab = mark.workspaceTab;
            library.showIndexedArchiveSnapshot(snapshot);
            if (!mark.mode && snapshot.memory.archiveRevision === mark.revision) restoreScroll(mark);
        }
        return true;
    } catch {
        if (current()) { portal.showHome(); globalThis.toastr?.warning?.('这份档案暂时无法打开，请从档案室重试。', '心迹回廊'); }
        return false;
    } finally {
        // A later open owns its own loading state.
        if (loading === request) loading = 0;
    }
}
