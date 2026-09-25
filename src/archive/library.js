import * as workspace_ui from '../ui/workspace.js';
import * as archive_groups from './groups.js';
import * as archive_backupStore from './backupStore.js';
import * as archive_repository from './repository.js';
import * as archive_coverage from './coverageRanges.js';
import * as archive_snapshots from './snapshots.js';
import * as core_cache from '../core/cache.js';
import * as core_archiveCover from '../core/archiveCover.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as modes_room from '../modes/room.js';
import * as ui_overlay from '../ui/overlay.js';
import * as ui_phoneView from '../ui/phoneView.js';
import * as ui_endingView from '../ui/endingView.js';
import * as recovery_view from '../ui/recoveryView.js';
import * as host_compatibility from '../core/hostCompatibility.js';
import * as split_libraryCharacter from './libraryCharacter.js';
import * as split_librarySnapshots from './librarySnapshots.js';
import { snapshotCalendarQuickAccessHtml } from './librarySnapshots.js';
// 以下导出已搬到 archive/libraryCharacter.js、archive/librarySnapshots.js，这里原样转发，调用方不用改。
export const showArchiveCharacter = split_libraryCharacter.showArchiveCharacter;
export const showArchiveGroupManager = split_libraryCharacter.showArchiveGroupManager;
export const archiveSnapshotCacheKey = split_libraryCharacter.archiveSnapshotCacheKey;
export const rememberArchiveSnapshot = split_libraryCharacter.rememberArchiveSnapshot;
export const contentRegenerationDraftHtml = split_libraryCharacter.contentRegenerationDraftHtml;
export const openContentRegenerationDraft = split_librarySnapshots.openContentRegenerationDraft;
export const archiveRecoveryDraftHtml = split_libraryCharacter.archiveRecoveryDraftHtml;
export const openArchiveRecoveryDraft = split_libraryCharacter.openArchiveRecoveryDraft;
export const fetchIndexedArchiveSnapshot = split_libraryCharacter.fetchIndexedArchiveSnapshot;
export const freezeArchiveTarget = split_libraryCharacter.freezeArchiveTarget;
export const revalidateArchiveTarget = split_libraryCharacter.revalidateArchiveTarget;
export const commitArchiveTargetSession = split_libraryCharacter.commitArchiveTargetSession;
export const commitArchiveTargetSessionMutation = split_libraryCharacter.commitArchiveTargetSessionMutation;
export const claimArchiveTargetMode = split_libraryCharacter.claimArchiveTargetMode;
export const archiveTargetGenerationOptions = split_libraryCharacter.archiveTargetGenerationOptions;
export const prepareArchiveTargetSubtask = split_librarySnapshots.prepareArchiveTargetSubtask;
export const beginArchiveTargetSubtask = split_librarySnapshots.beginArchiveTargetSubtask;
export const syncArchiveTargetSubtask = split_librarySnapshots.syncArchiveTargetSubtask;
export const archiveSnapshotEditableUi = split_librarySnapshots.archiveSnapshotEditableUi;
export const snapshotWriteBlockMessage = split_librarySnapshots.snapshotWriteBlockMessage;
export const promoteSnapshotToLiveIfCurrent = split_librarySnapshots.promoteSnapshotToLiveIfCurrent;
export const requireWritableArchiveAction = split_librarySnapshots.requireWritableArchiveAction;
export const archiveVersionDraftsHtml = split_librarySnapshots.archiveVersionDraftsHtml;

let archiveLibraryRenderSequence = 0;

let indexedArchiveOpenSequence = 0;

export async function showArchiveLibrary() {
    const renderSequence = ++archiveLibraryRenderSequence;
    const openingContext = core_context.getContext();
    const openingScope = core_context.chatScopeKey(openingContext), openingGroup = openingContext.groupId;
    ui_endingView.closeEndingEasterEgg({ restoreFocus: false });
    modes_room.stopRoomClock(); ui_phoneView.stopPhoneClock(); runtimeState.activeMode = null; runtimeState.activeSession = null; runtimeState.activeArchiveSnapshot = null; runtimeState.activeArchiveReadOnly = true; runtimeState.archiveLibraryCharacterKey = ''; runtimeState.archiveViewLevel = 'library';
    ui_overlay.openOverlay(); ui_overlay.setRegenerateVisible(false); ui_overlay.setManageVisible(false); ui_overlay.setBackVisible(false); ui_overlay.topTitle('心迹回廊 · 档案室');
    const body = ui_overlay.bodyEl(); if (!body) return;
    const overlay = document.getElementById(core_constants.OVERLAY_ID);
    body.innerHTML = '<div class="rmt-loading"><div class="rmt-loading-card"><div class="rmt-spinner"></div><b>正在核对档案室…</b><div class="rmt-loading-note">只读取心迹回廊自己的本机删除记录，不扫描或改写聊天正文。</div></div></div>';
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    const viewStillCurrent = () => {
        try {
            const live = core_context.getContext();
            return renderSequence === archiveLibraryRenderSequence && lifecycleEpoch === runtimeState.runtimeLifecycleEpoch
                && core_context.chatScopeKey(live) === openingScope && live.groupId === openingGroup
                && runtimeState.archiveViewLevel === 'library' && !runtimeState.activeMode && !runtimeState.activeSession
                && document.getElementById(core_constants.OVERLAY_ID) === overlay && !overlay.hidden
                && ui_overlay.bodyEl() === body;
        } catch { return false; }
    };
    const indexedBefore = archive_groups.getArchiveIndex(core_context.getContext());
    const deletedEntryIds = new Set();
    await Promise.all(indexedBefore.map(async entry => {
        try {
            if (await archive_backupStore.hasArchiveBackupDeletionFence(entry)) {
                deletedEntryIds.add(core_context.archiveIndexEntryId(entry));
            }
        } catch {}
    }));
    if (!viewStillCurrent()) return;
    if (deletedEntryIds.size) {
        const liveContext = core_context.getContext();
        const rawMemory = archive_repository.migrateArchiveInMemory(liveContext.chatMetadata?.[core_constants.MEMORY_KEY]);
        for (const entry of indexedBefore) {
            if (!deletedEntryIds.has(core_context.archiveIndexEntryId(entry))) continue;
            if (rawMemory && core_context.comparableChatId(entry.chatId) === core_context.comparableChatId(rawMemory.chatId)
                && Number(entry.characterIndexHint) === Number(liveContext.characterId)) {
                runtimeState.archiveDeletionFences.add(archive_repository.archiveDeletionFenceKey(liveContext, rawMemory, core_context.archiveIndexEntryId(entry)));
            }
        }
        archive_groups.setArchiveIndex(liveContext, indexedBefore.filter(entry => !deletedEntryIds.has(core_context.archiveIndexEntryId(entry))));
    }
    try {
        let ctx = core_context.currentCharacterGuard();
        await core_cache.ensureCurrentArchiveBackup(ctx);
        if (!viewStillCurrent()) return;
        ctx = core_context.currentCharacterGuard();
        const mem = archive_repository.getImportedMemory(ctx);
        if (mem) {
            // r42.5 could commit an explicit fresh archive while leaving an older character-level
            // library tombstone behind. Repair only when createdAt proves this archive was created
            // after the tombstone; genuinely old source metadata stays hidden.
            const resolvedEntry = core_cache.archiveBackupEntryForContext(ctx, mem);
            const backupState = await archive_backupStore.readArchiveBackupState(resolvedEntry);
            if (!viewStillCurrent()) return;
            if (backupState.deleted) {
                runtimeState.archiveDeletionFences.add(archive_repository.archiveDeletionFenceKey(ctx, mem, resolvedEntry.entryId));
            } else {
                archive_groups.restoreCurrentCharacterArchiveVisibility(ctx, mem);
                archive_groups.upsertArchiveIndex(ctx, mem, { existingEntryId: resolvedEntry.entryId });
            }
        }
    } catch {}
    const archiveContext = core_context.getContext();
    const index = archive_groups.getArchiveIndex(archiveContext);
    const deletedIndex = archive_groups.buildDeletedArchiveCharacterIndex(archiveContext);
    const groups = new Map();
    for (const item of index) {
        if (archive_groups.isArchiveEntryDeletedFromLibrary(item, archiveContext, deletedIndex)) continue;
        const groupId = archive_groups.archiveGroupKeyForEntry(item);
        if (!groupId) continue;
        const current = groups.get(groupId) || { groupId, entries: [] };
        current.entries.push(item);
        groups.set(groupId, current);
    }
    const cards = [...groups.values()].sort((a,b) => Math.max(...b.entries.map(x=>x.updatedAt)) - Math.max(...a.entries.map(x=>x.updatedAt))).map(group => {
        const meta = archive_groups.archiveGroupMeta(group.groupId, group.entries, archiveContext);
        const src = archive_groups.archiveGroupAvatarUrl(meta, group.entries[0], archiveContext);
        const name = core_text.normalizeText(meta.label || meta.characterName || group.entries[0]?.characterName, 120) || '角色档案';
        const charHint = Number(meta.characterIndexHint) >= 0 ? ` · char #${Number(meta.characterIndexHint) + 1}` : '';
        return `<article class="rmt-archive-portal ready rmt-character-archive-card"><button type="button" class="rmt-portal-open rmt-character-portal-open" data-rmt-archive-character="${core_text.esc(group.groupId)}"><span class="rmt-portal-avatar" data-rmt-avatar-talk="${core_text.esc(group.groupId)}" title="点头像听他说一句">${src ? `<img src="${core_text.esc(src)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : '<i class="fa-solid fa-user"></i>'}<i class="fa-solid fa-comment-dots rmt-avatar-talk-mark"></i></span><span class="rmt-portal-title">${core_text.esc(name)}</span><span class="rmt-portal-subtitle">${group.entries.length} 个聊天档案${core_text.esc(charHint)}</span><span class="rmt-portal-status">${meta.manual ? '手动角色组' : '自动分类'} · 点击查看</span></button><button type="button" class="rmt-character-archive-delete" data-rmt-action="archive-character-delete" data-rmt-archive-group-id="${core_text.esc(group.groupId)}"><i class="fa-solid fa-trash-can"></i><span>删除角色档案</span></button></article>`;
    }).join('');
    let currentQuick = '';
    let calendarQuick = snapshotCalendarQuickAccessHtml({ ready: false, generated: false, readOnly: false, generating: false });
    try {
        const ctx = core_context.currentCharacterGuard();
        const mem = archive_repository.getImportedMemory(ctx);
        const deletedFromLibrary = archive_groups.isCurrentCharacterDeletedFromLibrary(ctx, mem);
        if (deletedFromLibrary) {
            currentQuick = '';
            calendarQuick = '';
        } else if (mem) {
            const name = core_text.normalizeText(mem.archiveName, 120) || archive_repository.fallbackArchiveName(mem.memories);
            currentQuick = `<section class="rmt-archive-card rmt-current-archive-card" style="margin-top:12px"><div><b>当前窗口档案</b><small>${core_text.esc(name)} · ${mem.memories.length} 条记忆</small></div><div class="rmt-current-archive-actions"><button type="button" class="rmt-btn" data-rmt-action="current-archive">打开当前窗口档案</button><button type="button" class="rmt-btn" data-rmt-action="current-archive-import">增量更新当前窗口档案</button><button type="button" class="rmt-btn" data-rmt-action="current-archive-delete">删除当前档案</button></div></section>`;
            const calendarPortal = archive_snapshots.baseModeAvailability({ context: ctx, chatId: core_context.getChatId(ctx), memoryBank: mem, clone: false })
                .find(item => item.mode === core_constants.MODE.CALENDAR) || { session: null };
            calendarQuick = snapshotCalendarQuickAccessHtml({
                ready: true,
                generated: !!calendarPortal.session,
                readOnly: false,
                generating: core_requestCoordinator.isModeGenerating(core_constants.MODE.CALENDAR),
            });
        } else {
            const inheritanceDescriptor = archive_groups.characterDescriptor(ctx, Number(ctx.characterId));
            const inheritanceAvailable = archive_groups.getArchiveIndex(ctx).some(entry =>
                core_context.comparableChatId(entry.chatId) !== core_context.comparableChatId(core_context.getChatId(ctx))
                && Number(entry.characterIndexHint) === Number(ctx.characterId)
                && !!core_context.currentCharacterAvatar(ctx)
                && core_context.archiveStoredAvatar(entry) === core_context.currentCharacterAvatar(ctx)
                && (!entry.characterFingerprint || !inheritanceDescriptor?.fingerprint
                    || entry.characterFingerprint === inheritanceDescriptor.fingerprint));
            currentQuick = `<section class="rmt-archive-card rmt-current-archive-card" style="margin-top:12px"><div><b>当前聊天还没有档案</b></div><div class="rmt-current-archive-actions"><button type="button" class="rmt-btn" data-rmt-action="current-archive-import">生成当前窗口档案</button>${inheritanceAvailable ? '<button type="button" class="rmt-btn" data-rmt-action="archive-inheritance-open">从这个角色的旧聊天继承…</button>' : ''}</div></section>`;
        }
    } catch {}
    if (!viewStillCurrent()) return;
    body.innerHTML = `<div class="rmt-archive-room"><section class="rmt-archive-card"><div class="rmt-archive-kicker">MEMORY ARCHIVE LIBRARY</div><strong class="rmt-archive-title">档案室一览</strong><div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="rmt-btn" data-rmt-action="archive-group-manager">管理角色分类</button><button type="button" class="rmt-btn" data-rmt-action="archive-auto-classify">自动分类</button><button type="button" class="rmt-btn" data-rmt-action="rebuild-archive-index">扫描旧版本已有档案</button></div></section>${calendarQuick}${cards ? `<section class="rmt-archive-portals rmt-character-portals">${cards}</section>` : '<div class="rmt-archive-overview-empty">还没有已索引的档案。当前版本创建/更新档案后会自动加入这里；旧版本档案可点上方按钮手动扫描一次。</div>'}${currentQuick}</div>`;
}

// Saved versions never read /api/chats/get and never enter the live snapshot
// cache. The existing permanent read-only capability protects every old reader.
export async function openArchiveVersion(versionId, context = core_context.currentCharacterGuard()) {
    const lifecycle = runtimeState.runtimeLifecycleEpoch;
    const scope = core_context.chatScopeKey(context);
    const record = await core_cache.readArchiveVersion(context, versionId);
    core_context.assertRuntimeLifecycleCurrent(lifecycle);
    if (core_context.chatScopeKey(core_context.currentCharacterGuard()) !== scope) throw new DOMException('Chat changed', 'AbortError');
    const snapshot = {
        ...record.entry,
        entryId: `${record.entryId}:version:${record.versionId}`,
        archiveGroupId: record.entry.archiveGroupId || archive_groups.archiveGroupKeyForEntry(record.entry),
        chatId: record.chatId, archiveName: record.memory.archiveName || '未命名档案',
        characterName: record.memory.characterName || record.entry.characterName,
        memory: structuredClone(record.memory), cache: structuredClone(record.cache),
        historyVersionId: record.versionId, historyCreatedAt: record.createdAt,
        historyReason: record.reason, historySelectedPages: [...record.selectedPages],
        historyDrafts: structuredClone(record.drafts),
        backupOnly: true, sourceError: '', sourceMirrorLagging: false, settingBookSelection: { books: [] },
        loadedAt: Date.now(),
    };
    showIndexedArchiveSnapshot(snapshot);
    return snapshot;
}

export async function openGenerationTaskResult(draftId, context = core_context.currentCharacterGuard(), { snapshot: sourceSnapshot = null } = {}) {
    const lifecycle = runtimeState.runtimeLifecycleEpoch;
    const scope = core_context.chatScopeKey(context);
    const record = await core_cache.readGenerationTaskResult(context, draftId, sourceSnapshot ? { cache: sourceSnapshot.cache } : {});
    core_context.assertRuntimeLifecycleCurrent(lifecycle);
    if (sourceSnapshot ? runtimeState.activeArchiveSnapshot !== sourceSnapshot
        : core_context.chatScopeKey(core_context.currentCharacterGuard()) !== scope) throw new DOMException('Chat changed', 'AbortError');
    const memory = structuredClone(record.sourceMemory);
    if (!memory?.memories || !record.session) throw new Error('这份成果的原始资料暂时无法读取，已保存的成果仍保留。');
    if (record.status === 'open' && record.session.readableProgress?.complete === false
        && (!sourceSnapshot || (!sourceSnapshot.historyVersionId && !sourceSnapshot.backupOnly
            && generation_imageGeneration.indexedArchiveMatchesCurrentChat(sourceSnapshot, context)))) {
        const current = sourceSnapshot ? await core_cache.readGenerationTaskResult(context, draftId) : record;
        core_context.assertRuntimeLifecycleCurrent(lifecycle);
        if (core_context.chatScopeKey(core_context.currentCharacterGuard()) !== scope) throw new DOMException('Chat changed', 'AbortError');
        ui_overlay.openPartialTaskSession(current);
        return current;
    }
    const entry = record.targetEntry || core_cache.archiveBackupEntryForContext(context, memory);
    const snapshot = {
        ...entry, entryId: `${record.entryId || entry.entryId}:task:${draftId}`,
        archiveGroupId: entry.archiveGroupId || archive_groups.archiveGroupKeyForEntry(entry),
        chatId: memory.chatId, archiveName: `${core_constants.MODE_LABEL[record.mode] || '旧任务'} · 独立成果`,
        characterName: memory.characterName || entry.characterName,
        memory, cache: { chatId: memory.chatId, archiveRevision: memory.archiveRevision, [record.mode]: structuredClone(record.session) },
        taskResultDraftId: draftId, historyVersionId: `task:${draftId}`, historyCreatedAt: record.createdAt,
        historyReason: '按原任务资料生成，独立保留的成果', historySelectedPages: [record.pageId],
        backupOnly: true, sourceError: '', sourceMirrorLagging: false, settingBookSelection: { books: [] }, loadedAt: Date.now(),
    };
    showIndexedArchiveSnapshot(snapshot);
    return snapshot;
}

export function setArchiveReadOnly(readOnly) {
    if (!runtimeState.activeArchiveSnapshot) return;
    if (runtimeState.activeArchiveSnapshot.historyVersionId) {
        runtimeState.activeArchiveReadOnly = true;
        if (readOnly === false) globalThis.toastr?.info?.(runtimeState.activeArchiveSnapshot.taskResultDraftId ? '当前是独立保存的成果；请返回当前档案继续操作。' : '旧版本永久只读；请返回当前档案继续操作。', '心迹回廊');
        return showIndexedArchiveSnapshot(runtimeState.activeArchiveSnapshot);
    }
    if (runtimeState.activeArchiveSnapshot.backupOnly && readOnly === false) {
        runtimeState.activeArchiveReadOnly = true;
        globalThis.toastr?.info?.('源聊天暂不可读，当前查看只读备份。请重试读取源聊天；备份本身不能解除只读或绑定到其他聊天。', '心迹回廊');
        return showIndexedArchiveSnapshot(runtimeState.activeArchiveSnapshot);
    }
    runtimeState.activeArchiveReadOnly = readOnly !== false;
    if (runtimeState.activeMode && runtimeState.activeSession) ui_overlay.renderActive();
    else showIndexedArchiveSnapshot(runtimeState.activeArchiveSnapshot);
    if (!runtimeState.activeArchiveReadOnly) {
        const live = generation_imageGeneration.indexedArchiveMatchesCurrentChat(runtimeState.activeArchiveSnapshot, core_context.getContext());
        globalThis.toastr?.info?.(
            live
                ? '已关闭只读保护。当前酒馆正好打开这份档案对应聊天；增量追加/绘制仍会逐项确认。'
                : '已关闭只读保护，但心迹回廊不会自动切换聊天。你可以查看编辑按钮；真正写入前必须先手动在酒馆打开这份档案对应聊天。',
            '心迹回廊',
        );
    }
}

export function showIndexedArchiveSnapshot(snapshot = runtimeState.activeArchiveSnapshot) {
    if (!snapshot?.memory) return showArchiveLibrary();
    modes_room.stopRoomClock(); ui_phoneView.stopPhoneClock(); ui_endingView.closeEndingEasterEgg({ restoreFocus: false });
    const isNewSnapshot = runtimeState.activeArchiveSnapshot !== snapshot;
    runtimeState.activeArchiveSnapshot = snapshot;
    if (isNewSnapshot || snapshot.backupOnly) runtimeState.activeArchiveReadOnly = true;
    runtimeState.activeMode = null;
    runtimeState.activeSession = null;
    runtimeState.archiveViewLevel = 'snapshot';
    ui_overlay.openOverlay();
    ui_overlay.setRegenerateVisible(false);
    ui_overlay.setManageVisible(false);
    ui_overlay.setBackVisible(true, '角色档案');
    ui_overlay.topTitle(`心迹回廊 · ${snapshot.characterName} · ${snapshot.taskResultDraftId ? '独立生成成果 · 只读' : snapshot.historyVersionId ? '重做前旧版本 · 只读' : snapshot.backupOnly ? '独立备份' : runtimeState.activeArchiveReadOnly ? '只读档案' : '编辑待命'}`);
    const body = ui_overlay.bodyEl();
    if (!body) return;
    const memory = snapshot.memory;
    const cachedRead = { chatId: snapshot.chatId, memoryBank: memory, cache: snapshot.cache, clone: false };
    const portals = ui_overlay.readableModePortals(archive_snapshots.baseModeAvailability(cachedRead), cachedRead);
    const generatedCount = portals.filter(item => !!item.session && !item.session.readableProgress).length;
    const canGenerateDerived = snapshot.backupOnly !== true;
    const calendarPortal = portals.find(item => item.mode === core_constants.MODE.CALENDAR) || { session: null };
    const calendarGenerating = core_requestCoordinator.isArchiveTargetModeGenerating(core_constants.MODE.CALENDAR, snapshot);
    const calendarQuick = snapshotCalendarQuickAccessHtml({ generated: !!calendarPortal.session, readOnly: runtimeState.activeArchiveReadOnly, canGenerate: canGenerateDerived, generating: calendarGenerating });
    const archiveCoverageText = archive_coverage.archiveCoverageText(memory);
    const portalHtml = portals.filter(item => item.mode !== core_constants.MODE.CALENDAR).map(({ mode, session, meta }) => {
        const generated = !!session;
        const generating = core_requestCoordinator.isArchiveTargetModeGenerating(mode, snapshot);
        const editAction = canGenerateDerived ? `<button type="button" class="rmt-btn rmt-portal-generate" ${mode === core_constants.MODE.HEART ? 'data-rmt-action="open-heart"' : `data-rmt-generate-mode="${core_text.esc(mode)}"`} ${generated ? 'data-rmt-regenerate="true"' : ''} ${generating ? 'disabled' : ''}>${mode === core_constants.MODE.HEART ? '打开角色互动' : generating ? '生成中…' : mode === core_constants.MODE.INBOX ? '收取新信' : mode === core_constants.MODE.PHONE ? (generated ? '追加 / 继续' : '生成 / 继续') : generated ? '增量追加' : '生成这一项'}</button>` : '';
        return `<article class="rmt-archive-portal ${generated ? 'ready' : 'empty'} rmt-archive-portal-${core_text.esc(meta.accent)}">
          <button type="button" class="rmt-portal-open" ${generated || [core_constants.MODE.INBOX, core_constants.MODE.PHONE, core_constants.MODE.HEART].includes(mode) ? `data-rmt-mode="${core_text.esc(mode)}"` : 'disabled'}>
            <span class="rmt-portal-avatar"><i class="fa-solid ${core_text.esc(meta.icon)}"></i>${generated ? '<span class="rmt-portal-ready-dot">✓</span>' : '<span class="rmt-portal-lock"><i class="fa-solid fa-lock"></i></span>'}</span>
            <span class="rmt-portal-title">${core_text.esc(meta.title)}</span>
            <span class="rmt-portal-subtitle">${core_text.esc(meta.subtitle)}</span>
            <span class="rmt-portal-status">${session?.readableProgress ? '部分内容已保存 · 可以先查看' : snapshot.taskResultDraftId ? (generated ? '独立成果已保存 · 只读查看' : '不属于这份独立成果') : snapshot.historyVersionId ? (generated ? '旧版本已保存 · 只读查看' : '这份旧版本尚未生成') : generating ? `正在为 ${core_text.esc(snapshot.characterName)} · ${core_text.esc(snapshot.archiveName)} 生成` : generated ? (runtimeState.activeArchiveReadOnly ? '已生成 · 安全写回本档案' : '已生成 · 可从新增档案继续追加') : (canGenerateDerived ? '尚未生成 · 可安全写回本档案' : '这份备份尚未生成')}</span>
          </button>
          ${editAction}
        </article>`;
    }).join('');
    body.innerHTML = `<div class="rmt-archive-room">
      ${recovery_view.recoveryBannerHtml(snapshot.cache, memory, { readOnly: runtimeState.activeArchiveReadOnly || snapshot.backupOnly })}
      <section class="rmt-memory-gate rmt-archive-card">
        <div class="rmt-memory-gate-text">
          <div class="rmt-archive-kicker">${snapshot.taskResultDraftId ? 'SAVED TASK RESULT' : snapshot.historyVersionId ? 'SAVED PREVIOUS VERSION' : snapshot.backupOnly ? 'RECOVERED LOCAL BACKUP' : 'READ-ONLY ARCHIVE'}</div>
          <strong class="rmt-archive-title">${core_text.esc(snapshot.archiveName)}</strong>
          ${core_archiveCover.archiveCoverHtml(memory, { writable: !snapshot.backupOnly && core_context.getChatId(core_context.getContext()) === snapshot.chatId && !runtimeState.activeArchiveReadOnly, busy: runtimeState.busy || core_requestCoordinator.hasGenerationTasks() })}
          <div class="rmt-memory-status ready">${snapshot.taskResultDraftId ? '独立生成成果 · 只读查看' : snapshot.historyVersionId ? '重做前旧版本 · 永久只读' : snapshot.backupOnly ? '源聊天暂不可读 · 当前查看只读备份' : runtimeState.activeArchiveReadOnly ? '只读查看' : '编辑待命'} · ${memory.memories.length} 条记忆 · 已生成 ${generatedCount}/${core_constants.ARCHIVE_PORTAL_MODES.length}</div>
          <div class="rmt-archive-meta">${snapshot.historyVersionId ? `${core_text.esc(new Date(snapshot.historyCreatedAt).toLocaleString())} · ${core_text.esc(snapshot.historyReason || '按选择重新生成前保存')} · 未完成草稿另行保留，不计作完整作品` : snapshot.backupOnly ? `本机备份 · ${core_text.esc(snapshot.sourceError || '源聊天无法读取')}` : (runtimeState.activeArchiveReadOnly ? '当前为只读档案' : '写入前会再次验证目标聊天')}</div>
          ${archiveCoverageText ? `<div class="rmt-archive-meta" data-rmt-archive-coverage>${core_text.esc(archiveCoverageText)}</div>` : ''}
          <div class="rmt-archive-readonly-control">
            <label><input type="checkbox" data-rmt-readonly-toggle ${runtimeState.activeArchiveReadOnly ? 'checked' : ''} ${snapshot.backupOnly ? 'disabled' : ''}> 只读查看</label>
            <small>${snapshot.taskResultDraftId ? '按原任务资料查看，当前档案与作品保留' : snapshot.historyVersionId ? '旧版本只读，当前档案与新作品不受影响' : snapshot.backupOnly ? '备份只读，不代表原聊天已删除' : runtimeState.activeArchiveReadOnly ? '关闭只读后可显示编辑操作' : '编辑待命'}</small>
            ${snapshot.backupOnly && !snapshot.historyVersionId ? `<button type="button" class="rmt-btn" data-rmt-indexed-character="${core_text.esc(snapshot.characterKey)}" data-rmt-indexed-chat="${core_text.esc(snapshot.chatId)}" data-rmt-indexed-entry="${core_text.esc(snapshot.entryId)}">重试读取源聊天</button>` : ''}
          </div>
        </div>
      </section>
      ${calendarQuick}
      <section class="rmt-archive-portals" aria-label="只读档案内容入口">${portalHtml}</section>
      ${archiveVersionDraftsHtml(snapshot)}
    </div>`;
    workspace_ui.arrangeArchiveWorkspace(body, { portals, ready: true, snapshot });

}

export async function openIndexedArchive(characterKey, chatId, entryId = '') {
    const renderSequence = ++indexedArchiveOpenSequence;
    if (runtimeState.busy) runtimeState.activeTaskBackgrounded = true;
    const context = core_context.getContext();
    const index = archive_groups.getArchiveIndex(context);
    const wantedChatId = core_context.comparableChatId(chatId);
    const wantedEntryId = core_text.normalizeText(entryId, 120);
    const entry = (wantedEntryId ? index.find(item => core_context.archiveIndexEntryId(item) === wantedEntryId) : null)
        || index.find(item => item.characterKey === characterKey && item.chatId === wantedChatId && (!wantedEntryId || core_context.archiveIndexEntryId(item) === wantedEntryId))
        || index.find(item => core_context.archiveCanonicalCharacterKey(item, context) === characterKey && item.chatId === wantedChatId && (!wantedEntryId || core_context.archiveIndexEntryId(item) === wantedEntryId));
    if (!entry) return;
    // If the indexed row is exactly the chat that SillyTavern already has open, use the live
    // context instead of a read-only metadata snapshot. This keeps write actions such as CG
    // drawing available without ever switching the host character/chat.
    const retryingBackup = runtimeState.activeArchiveSnapshot?.backupOnly === true
        && archiveSnapshotCacheKey(runtimeState.activeArchiveSnapshot) === archiveSnapshotCacheKey(entry);
    if (!retryingBackup && generation_imageGeneration.indexedArchiveMatchesCurrentChat(entry, context)) {
        runtimeState.activeArchiveSnapshot = null;
        runtimeState.activeArchiveReadOnly = true;
        return ui_overlay.showChooser();
    }
    ui_overlay.openOverlay();
    ui_overlay.topTitle('心迹回廊 · 正在读取只读档案…');
    const body = ui_overlay.bodyEl();
    const overlay = document.getElementById(core_constants.OVERLAY_ID);
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    const openingScope = core_context.chatScopeKey(context), openingGroup = context.groupId;
    const personaKey = ctx => [String(ctx?.userAvatar ?? ctx?.personaAvatar ?? ctx?.user_avatar ?? globalThis.user_avatar ?? ''),
        String(ctx?.name1 ?? ''), String(ctx?.powerUserSettings?.persona_description ?? '')];
    const openingPersona = personaKey(context);
    const loadingHtml = '<div class="rmt-loading"><div class="rmt-loading-card"><div class="rmt-spinner"></div><b>正在读取这个聊天的档案与已生成内容…</b><div class="rmt-loading-note">只请求这一条目标聊天，不扫描同角色的其他聊天；不会切换当前角色或聊天。</div></div></div>';
    if (body) body.innerHTML = loadingHtml;
    const viewStillCurrent = () => {
        try {
            const live = core_context.getContext();
            return renderSequence === indexedArchiveOpenSequence && core_context.runtimeLifecycleStillCurrent(lifecycleEpoch)
                && core_context.chatScopeKey(live) === openingScope && live.groupId === openingGroup
                && personaKey(live).every((value, i) => value === openingPersona[i])
                && document.getElementById(core_constants.OVERLAY_ID) === overlay && overlay && !overlay.hidden
                && body && ui_overlay.bodyEl() === body && body.innerHTML === loadingHtml;
        } catch { return false; }
    };
    try {
        const snapshot = await fetchIndexedArchiveSnapshot(entry, context, { lifecycleEpoch });
        // Reads may finish after navigation. They must not re-enter a historical readonly
        // view over the live page, or cancel an explicit readonly choice made meanwhile.
        if (!viewStillCurrent()) return;
        showIndexedArchiveSnapshot(snapshot);
        if (snapshot.backupOnly) globalThis.toastr?.warning?.('源聊天暂不可读，当前查看只读备份。源聊天恢复后可重试读取，备份不会覆盖原聊天。', '心迹回廊');
    } catch (error) {
        if (!viewStillCurrent()) return;
        console.warn('[HeartbeatMemories] indexed archive read-only load failed', core_text.safeErrorDiagnostic(error));
        if (ui_overlay.bodyEl()) ui_overlay.bodyEl().innerHTML = `<div class="rmt-error"><div><b>档案读取失败</b><div style="margin-top:10px;white-space:pre-wrap;opacity:.78">${core_text.esc(core_text.safeErrorSummary(error))}</div><button type="button" class="rmt-btn" data-rmt-action="library-home">返回档案室</button></div></div>`;
    }
}

export async function rebuildArchiveIndexFromExisting() {
    if (core_requestCoordinator.hasAnyTask()) { globalThis.toastr?.info?.('后台任务进行中，暂不扫描旧档案。', '心迹回廊'); return; }
    const context = core_context.getContext();
    const descriptors = (context.characters || []).map((_, index) => archive_groups.characterDescriptor(context, index)).filter(item => item?.avatar);
    const byAvatar = new Map();
    for (const descriptor of descriptors) {
        const list = byAvatar.get(descriptor.avatar) || [];
        list.push(descriptor);
        byAvatar.set(descriptor.avatar, list);
    }
    const existing = archive_groups.getArchiveIndex(context);
    const deletedIndex = archive_groups.buildDeletedArchiveCharacterIndex(context);
    const existingByChatFile = new Map(existing.map(item => [`${core_context.archiveStoredAvatar(item)}\u001f${item.chatId}`, item]));
    const found = [];
    ui_overlay.openOverlay(); const body = ui_overlay.bodyEl(); ui_overlay.topTitle('心迹回廊 · 扫描旧档案');
    const controller = new AbortController();
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    let cancelled = false, failedReads = 0;
    const cancelScan = event => {
        if (event.target.closest?.('[data-rmt-cancel-legacy-scan]')) controller.abort();
    };
    const scanStillCurrent = () => lifecycleEpoch === runtimeState.runtimeLifecycleEpoch;
    body?.addEventListener('click', cancelScan);
    const avatarEntries = [...byAvatar.entries()];
    try {
    for (let i = 0; i < avatarEntries.length; i += 1) {
        const [avatar, avatarDescriptors] = avatarEntries[i];
        if (body) body.innerHTML = `<div class="rmt-loading"><div class="rmt-loading-card"><b>正在扫描旧档案 ${i + 1} / ${avatarEntries.length}</b><div class="rmt-loading-note">同头像只读取一次聊天列表；旧酒馆按需只读聊天文件。能唯一匹配角色卡时记录本地指纹，无法唯一判断时保持待手动分类。不会切换宿主聊天。</div><div data-rmt-legacy-scan-progress role="status"></div><button type="button" class="rmt-btn" data-rmt-cancel-legacy-scan>停止扫描</button></div></div>`;
        try {
            if (controller.signal.aborted || !scanStillCurrent()) throw new DOMException('Archive scan cancelled', 'AbortError');
            const response = await fetch('/api/characters/chats', { method:'POST', headers:context.getRequestHeaders(), cache:'no-cache', signal:controller.signal, body:JSON.stringify({ avatar_url:avatar, metadata:true }) });
            if (!response.ok) { failedReads++; continue; }
            const rows = await response.json();
            const listedRows = Array.isArray(rows) ? rows : [];
            if (!Array.isArray(rows)) failedReads++;
            for (let rowIndex = 0; rowIndex < listedRows.length; rowIndex++) {
                const progress = body?.querySelector('[data-rmt-legacy-scan-progress]');
                if (progress) progress.textContent = `聊天 ${rowIndex + 1} / ${listedRows.length}`;
                let row;
                try {
                    row = await host_compatibility.readArchiveRowMetadata(context, avatar, listedRows[rowIndex], {
                        signal: controller.signal, isCurrent: scanStillCurrent,
                    });
                } catch (error) {
                    if (error?.name === 'AbortError') throw error;
                    failedReads++;
                    console.warn('[HeartbeatMemories] legacy archive chat read failed', core_text.safeErrorDiagnostic(error));
                    continue;
                }
                const mem = archive_repository.migrateArchiveInMemory(row?.chat_metadata?.[core_constants.MEMORY_KEY]);
                if (!mem) continue;
                const chatId = core_context.comparableChatId(row.file_id || row.file_name);
                if (!chatId) continue;
                const memoryCharacterName = core_text.normalizeText(mem.characterName, 120);
                const candidates = memoryCharacterName
                    ? avatarDescriptors.filter(item => item.name === memoryCharacterName)
                    : avatarDescriptors;
                const unique = candidates.length === 1 ? candidates[0] : null;
                const previous = existingByChatFile.get(`${avatar}\u001f${chatId}`) || null;
                const candidate = {
                    entryId: core_text.normalizeText(previous?.entryId, 120),
                    characterKey: avatar,
                    avatar,
                    characterName: core_text.normalizeText(memoryCharacterName || unique?.name || previous?.characterName, 120) || '未命名角色',
                    characterFingerprint: core_text.normalizeText(previous?.characterFingerprint || unique?.fingerprint, 160),
                    characterIndexHint: Number.isInteger(Number(previous?.characterIndexHint))
                        ? Number(previous.characterIndexHint)
                        : Number.isInteger(Number(unique?.index)) ? Number(unique.index) : -1,
                    chatId,
                    archiveName: core_text.normalizeText(mem.archiveName, 160) || archive_repository.fallbackArchiveName(mem.memories),
                    memoryCount: mem.memories.length,
                    updatedAt: Number(mem.updatedAt || mem.createdAt) || 0,
                    archiveGroupId: core_text.normalizeText(previous?.archiveGroupId, 120),
                    archiveGroupManual: previous?.archiveGroupManual === true,
                };
                candidate.entryId = candidate.entryId || core_context.archiveIndexEntryId(candidate);
                if (!archive_groups.isArchiveEntryDeletedFromLibrary(candidate, context, deletedIndex)
                    && !await archive_backupStore.hasArchiveBackupDeletionFence(candidate)) found.push(candidate);
            }
        } catch (error) {
            if (error?.name === 'AbortError') { cancelled = true; break; }
            failedReads++;
            console.warn('[HeartbeatMemories] legacy archive index scan skipped avatar', { avatar: core_text.normalizeText(avatar, 300), ...core_text.safeErrorDiagnostic(error) });
        }
        await core_context.yieldToUi();
    }
    } finally {
        body?.removeEventListener('click', cancelScan);
    }
    if (!scanStillCurrent()) return;
    // Keep previously indexed rows whose avatar could not be scanned this time; an intermittent
    // server/listing failure must never silently erase the user's library index.
    const seen = new Set(found.map(item => `${core_context.archiveStoredAvatar(item)}\u001f${item.chatId}`));
    for (const item of existing) {
        const key = `${core_context.archiveStoredAvatar(item)}${item.chatId}`;
        if (!seen.has(key) && !archive_groups.isArchiveEntryDeletedFromLibrary(item, context, deletedIndex)
            && !await archive_backupStore.hasArchiveBackupDeletionFence(item)) found.push(item);
    }
    archive_groups.setArchiveIndex(context, found.sort((a,b) => b.updatedAt - a.updatedAt));
    archive_groups.autoClassifyArchiveIndex(context, { confirm: false });
    const scanMessage = `旧档案扫描${cancelled ? '已停止' : failedReads ? '部分完成' : '完成'}：索引 ${found.length} 个聊天档案。${failedReads ? `有 ${failedReads} 处读取失败，可再次手动扫描；` : ''}${cancelled ? '已保留读到的索引和原有索引；' : ''}无法唯一判断的同头像/同名旧档案已单独列为“待手动分类”。`;
    if (cancelled || failedReads) globalThis.toastr?.warning?.(scanMessage, '心迹回廊');
    else globalThis.toastr?.success?.(scanMessage, '心迹回廊');
    showArchiveLibrary();
}
