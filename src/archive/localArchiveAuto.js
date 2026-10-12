// 打开聊天就有档案：心迹回廊运行时加载后，单人聊天还没有档案时自动本地建档；
// 本地建的档案在聊天往下走时自动补上新楼层。全程不调用 API。
import * as local_archive from './localArchive.js';
import * as archive_repository from './repository.js';
import * as archive_groups from './groups.js';
import * as archive_snapshots from './snapshots.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import * as core_state from '../core/state.js';

// Set once per chat when an archive was created automatically. If the archive is
// later deleted, the chat is not given a new one behind the user's back.
export const AUTO_MARK_KEY = 'heartbeatMemoriesLocalArchiveAutoV1';
const APPEND_EVERY = 6;   // new floors before a local archive is extended

let timer = 0, running = false, stopHost = null;

function eligible(context) {
    if (!context || context.groupId || context.characterId === undefined || context.characterId === null) return false;
    try { if (core_settings.getPluginSettings(context).localArchiveAuto === false) return false; } catch { return false; }
    if (core_state.state?.busy || core_requestCoordinator.hasGenerationTasks?.()) return false;
    return !!context.chatMetadata && typeof context.chatMetadata === 'object';
}

export async function maybeAutoLocalArchive(reason = 'auto') {
    if (running) return null;
    let context;
    try { context = core_context.currentCharacterGuard(); } catch { return null; }
    if (!eligible(context)) return null;
    const existing = archive_repository.getImportedMemory(context);
    running = true;
    try {
        if (!existing) {
            if (context.chatMetadata[AUTO_MARK_KEY]) return null;
            if (archive_groups.currentCharacterArchiveDeletionFence(context, null)) return null;
            if (archive_repository.getCurrentArchiveImportRecoverySummary?.(context)) return null;
            const usable = (context.chat || []).filter(message => message?.mes && !message.is_system).length;
            if (usable < 2) return null;
            const result = await local_archive.buildLocalArchive({ context, mode: 'create' });
            context.chatMetadata[AUTO_MARK_KEY] = { createdAt: Date.now(), reason };
            context.saveMetadataDebounced?.();
            archive_snapshots.scheduleChooserRefresh?.(0);
            return result;
        }
        const local = local_archive.localArchiveState(existing);
        if (!local || existing.coverageMode !== 'local-quick') return null;
        // coveredFloor is a chat floor number (1-based position in the chat file).
        if ((context.chat || []).length - local.coveredFloor < APPEND_EVERY && reason !== 'open') return null;
        const result = await local_archive.buildLocalArchive({ context, mode: 'append' });
        if (result.added) archive_snapshots.scheduleChooserRefresh?.(0);
        return result;
    } catch (error) {
        console.warn('[HeartbeatMemories] local archive skipped', error?.code || error?.message);
        return null;
    } finally { running = false; }
}

function queue(reason) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = 0; void maybeAutoLocalArchive(reason); }, 2500);
}

export function startLocalArchiveAuto() {
    stopLocalArchiveAuto();
    let context;
    try { context = core_context.getContext(); } catch { return; }
    const source = context?.eventSource, types = context?.eventTypes || context?.event_types || {};
    const events = [types.CHAT_CHANGED, types.MESSAGE_RECEIVED, types.CHARACTER_MESSAGE_RENDERED].filter(Boolean);
    const onEvent = () => queue('chat');
    for (const type of events) source?.on?.(type, onEvent);
    stopHost = () => { for (const type of events) (source?.off || source?.removeListener)?.call(source, type, onEvent); };
    queue('start');
}

export function stopLocalArchiveAuto() {
    if (timer) clearTimeout(timer);
    timer = 0;
    try { stopHost?.(); } catch { /* Host already gone. */ }
    stopHost = null;
}
