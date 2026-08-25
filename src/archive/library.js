// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_groups from './groups.js';
import * as archive_repository from './repository.js';
import * as archive_snapshots from './snapshots.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as modes_room from '../modes/room.js';
import * as modes_relations from '../modes/relations.js';
import * as ui_overlay from '../ui/overlay.js';
import * as ui_phoneView from '../ui/phoneView.js';

export function showArchiveLibrary() {
    modes_room.stopRoomClock(); ui_phoneView.stopPhoneClock(); runtimeState.activeMode = null; runtimeState.activeSession = null; runtimeState.activeArchiveSnapshot = null; runtimeState.activeArchiveReadOnly = true; runtimeState.archiveLibraryCharacterKey = ''; runtimeState.archiveViewLevel = 'library';
    ui_overlay.openOverlay(); ui_overlay.setRegenerateVisible(false); ui_overlay.setBackVisible(false); ui_overlay.topTitle('心跳回忆 · 档案室');
    const body = ui_overlay.bodyEl(); if (!body) return;
    try { const ctx = core_context.currentCharacterGuard(); const mem = archive_repository.getImportedMemory(ctx); if (mem) archive_groups.upsertArchiveIndex(ctx, mem); } catch {}
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
            currentQuick = `<section class="rmt-archive-card rmt-current-archive-card" style="margin-top:12px"><div><b>当前聊天还没有档案</b></div><div class="rmt-current-archive-actions"><button type="button" class="rmt-btn" data-rmt-action="current-archive-import">生成当前窗口档案</button></div></section>`;
        }
    } catch {}
    body.innerHTML = `<div class="rmt-archive-room"><section class="rmt-archive-card"><div class="rmt-archive-kicker">MEMORY ARCHIVE LIBRARY</div><strong class="rmt-archive-title">档案室一览</strong><div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="rmt-btn" data-rmt-action="archive-group-manager">管理角色分类</button><button type="button" class="rmt-btn" data-rmt-action="archive-auto-classify">自动分类</button><button type="button" class="rmt-btn" data-rmt-action="rebuild-archive-index">扫描旧版本已有档案</button></div></section>${calendarQuick}${cards ? `<section class="rmt-archive-portals rmt-character-portals">${cards}</section>` : '<div class="rmt-archive-overview-empty">还没有已索引的档案。当前版本创建/更新档案后会自动加入这里；旧版本档案可点上方按钮手动扫描一次。</div>'}${currentQuick}</div>`;
}

export function showArchiveCharacter(groupId) {
    runtimeState.activeArchiveSnapshot = null;
    runtimeState.activeArchiveReadOnly = true;
    const key = core_text.normalizeText(groupId, 120); if (runtimeState.archiveLibraryCharacterKey !== key) runtimeState.archiveCharacterRelationSelection = ''; runtimeState.archiveLibraryCharacterKey = key; runtimeState.archiveViewLevel = 'character';
    ui_overlay.openOverlay(); ui_overlay.setRegenerateVisible(false); ui_overlay.setBackVisible(true, '所有角色');
    const context = core_context.getContext();
    const entries = archive_groups.archiveGroupEntries(key, context).sort((a,b)=>b.updatedAt-a.updatedAt);
    const meta = archive_groups.archiveGroupMeta(key, entries, context);
    const name = core_text.normalizeText(meta.label || meta.characterName || entries[0]?.characterName, 120) || '角色档案'; ui_overlay.topTitle(`心跳回忆 · ${name}`);
    const body = ui_overlay.bodyEl(); if (!body) return;
    const charAvatar = archive_groups.archiveGroupAvatarUrl(meta, entries[0] || null, context);
    const profileKey = modes_relations.archiveCharacterProfileKey(key, meta, entries);
    const profile = modes_relations.getCharacterProfile(context, profileKey);
    const canGenerateProfile = Number(meta.characterIndexHint) >= 0 || entries.some(item => !!archive_groups.matchArchiveEntryToCharacter(item, context));
    const profileHtml = modes_relations.characterProfileHtml({ profile, profileKey, characterName: name, avatarUrl: charAvatar, selectedKey: runtimeState.archiveCharacterRelationSelection, canGenerate: canGenerateProfile });
    const rows = entries.map(item => `<button type="button" class="rmt-archive-overview-item" data-rmt-indexed-chat="${core_text.esc(item.chatId)}" data-rmt-indexed-character="${core_text.esc(item.characterKey)}" data-rmt-indexed-entry="${core_text.esc(core_context.archiveIndexEntryId(item))}"><span class="rmt-overview-dot">●</span><span><b>${core_text.esc(item.archiveName)}</b><small>${core_text.esc(item.characterName)} · ${core_text.esc(item.chatId)} · ${item.memoryCount} 条记忆 · ${core_text.esc(ui_overlay.formatArchiveTime(item.updatedAt))}</small></span><i class="fa-solid fa-chevron-right"></i></button>`).join('');
    body.innerHTML = `<div class="rmt-archive-room">${profileHtml}<section class="rmt-archive-card rmt-character-chat-archives"><div class="rmt-character-heart-head"><button type="button" class="rmt-character-heart-avatar" data-rmt-avatar-talk="${core_text.esc(key)}" aria-label="和角色说话">${charAvatar ? `<img src="${core_text.esc(charAvatar)}" alt="">` : '<i class="fa-solid fa-user"></i>'}<span><i class="fa-solid fa-comment-dots"></i></span></button><div><div class="rmt-archive-kicker">CHAT ARCHIVES</div><strong class="rmt-archive-title">${core_text.esc(name)} · 不同聊天世界线</strong></div></div><div style="margin:10px 0"><button type="button" class="rmt-btn" data-rmt-action="archive-group-manager">管理角色分类</button></div><div class="rmt-archive-overview-list" style="max-height:none">${rows || '<div class="rmt-archive-overview-empty">这个角色组还没有已索引档案。</div>'}</div></section></div>`;
}

export function showArchiveGroupManager() {
    const context = core_context.getContext();
    const overlay = document.getElementById(core_constants.OVERLAY_ID);
    if (!overlay) return;
    overlay.querySelector('.rmt-archive-group-manager')?.remove();
    const items = archive_groups.getArchiveIndex(context).sort((a,b) => b.updatedAt - a.updatedAt);
    const registered = archive_groups.getArchiveGroups(context);
    const groupMap = new Map(registered.map(group => [group.id, group]));
    for (const item of items) {
        const id = archive_groups.archiveGroupKeyForEntry(item);
        if (!groupMap.has(id)) groupMap.set(id, archive_groups.archiveGroupMeta(id, [item], context));
    }
    const groups = [...groupMap.values()].sort((a,b) => String(a.label).localeCompare(String(b.label), 'zh-CN'));
    const groupOptions = groups.map(group => `<option value="${core_text.esc(group.id)}">${core_text.esc(group.label)}${group.manual ? ' · 手动' : ' · 自动'}</option>`).join('');
    const characterOptions = (Array.isArray(context.characters) ? context.characters : []).map((_, index) => archive_groups.characterDescriptor(context, index)).filter(Boolean).map(item => `<option value="${item.index}">${core_text.esc(item.name)} · #${item.index + 1}${item.avatar ? ` · ${core_text.esc(item.avatar)}` : ''}</option>`).join('');
    const rows = items.map(item => {
        const entryId = core_context.archiveIndexEntryId(item);
        const ambiguous = archive_groups.archiveEntryNeedsManualClassification(item, context);
        const live = (() => { try { return generation_imageGeneration.indexedArchiveMatchesCurrentChat(item, context); } catch { return false; } })();
        const status = item.archiveGroupManual ? '手动归类' : ambiguous ? '待手动分类' : '自动归类';
        return `<article class="rmt-archive-group-entry"><div><b>${core_text.esc(item.archiveName)}</b><small>${core_text.esc(item.characterName)} · ${core_text.esc(item.chatId)} · ${status}${item.characterFingerprint ? ' · 已绑定角色卡指纹' : ''}</small></div><div class="rmt-archive-group-entry-actions"><select class="text_pole" data-rmt-archive-move-select="${core_text.esc(entryId)}"><option value="__AUTO__">恢复自动分类</option>${groupOptions}</select><button type="button" class="rmt-btn" data-rmt-action="archive-group-move" data-rmt-archive-entry-id="${core_text.esc(entryId)}">移动</button><button type="button" class="rmt-btn" data-rmt-action="${live ? 'archive-delete-live' : 'archive-remove-index'}" data-rmt-archive-entry-id="${core_text.esc(entryId)}">${live ? '删除心跳回忆档案' : '从档案室移除'}</button></div></article>`;
    }).join('');
    const modal = document.createElement('div');
    modal.className = 'rmt-archive-group-manager';
    modal.innerHTML = `<div class="rmt-memory-wi-picker-card"><div class="rmt-memory-wi-picker-head"><div><b>角色档案分类</b><small>自动分类 / 手动移动 / 绑定 SillyTavern 角色新建组</small></div><button type="button" class="rmt-btn" data-rmt-action="archive-group-close">完成</button></div><div class="rmt-memory-wi-picker-note">这里移动的是心跳回忆的轻量档案索引。不会移动、重命名、删除聊天文件，不会切换宿主角色/聊天，也不会改 MEMORY_KEY / ADV EVENT 缓存。自动分类优先按角色卡指纹区分（即使同名/同头像）；旧索引没有指纹且同头像/同名无法唯一判断时会拆成“待手动分类”，不会猜着合并。手动移动后自动分类不会覆盖。删除真实心跳回忆档案只允许当前真实聊天；历史档案只能先从列表移除。</div><div class="rmt-archive-group-create"><select class="text_pole" data-rmt-archive-new-character><option value="">选择一个 SillyTavern char…</option>${characterOptions}</select><button type="button" class="rmt-btn" data-rmt-action="archive-group-create">按所选 char 新建组</button><button type="button" class="rmt-btn" data-rmt-action="archive-auto-classify">自动分类未锁定档案</button></div><div class="rmt-archive-group-entries">${rows || '<div class="rmt-memory-wi-empty">还没有档案可以分类。</div>'}</div></div>`;
    overlay.appendChild(modal);
    for (const select of modal.querySelectorAll('[data-rmt-archive-move-select]')) {
        const item = items.find(entry => core_context.archiveIndexEntryId(entry) === select.dataset.rmtArchiveMoveSelect);
        if (item) select.value = item.archiveGroupManual ? archive_groups.archiveGroupKeyForEntry(item) : '__AUTO__';
    }
}

export function archiveSnapshotCacheKey(entry) {
    const entryId = core_text.normalizeText(entry?.entryId, 120) || core_context.archiveIndexEntryId(entry);
    return `${entryId}|${core_context.comparableChatId(entry?.chatId)}`;
}

export function rememberArchiveSnapshot(snapshot) {
    const key = archiveSnapshotCacheKey(snapshot);
    if (!key || key === '|') return snapshot;
    runtimeState.archiveSnapshotCache.delete(key);
    runtimeState.archiveSnapshotCache.set(key, snapshot);
    while (runtimeState.archiveSnapshotCache.size > core_constants.ARCHIVE_SNAPSHOT_CACHE_MAX) {
        runtimeState.archiveSnapshotCache.delete(runtimeState.archiveSnapshotCache.keys().next().value);
    }
    return snapshot;
}

export async function fetchIndexedArchiveSnapshot(entry, context = core_context.getContext()) {
    const key = archiveSnapshotCacheKey(entry);
    const cached = runtimeState.archiveSnapshotCache.get(key);
    if (cached && Date.now() - Number(cached.loadedAt || 0) < 120000) return cached;
    const avatar = core_context.archiveEntryAvatarName(entry, context);
    if (!avatar || typeof context.getRequestHeaders !== 'function') throw new Error('无法定位这个角色的聊天档案文件。');
    const response = await fetch('/api/characters/chats', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        cache: 'no-cache',
        body: JSON.stringify({ avatar_url: avatar, metadata: true }),
    });
    if (!response.ok) throw new Error(`读取档案失败：HTTP ${response.status}`);
    const rows = await response.json();
    const wantedChatId = core_context.comparableChatId(entry.chatId);
    const row = (Array.isArray(rows) ? rows : []).find(item => core_context.comparableChatId(item?.file_id || item?.file_name) === wantedChatId);
    if (!row) throw new Error('没有在这个角色的聊天文件中找到对应档案。');
    const metadata = row?.chat_metadata && typeof row.chat_metadata === 'object' ? row.chat_metadata : {};
    const memory = archive_repository.migrateArchiveInMemory(metadata[core_constants.MEMORY_KEY]);
    if (!memory || core_context.comparableChatId(memory.chatId) !== wantedChatId) throw new Error('这个聊天文件里没有可读取的心跳回忆档案。');
    const indexedName = core_text.normalizeText(entry?.characterName, 120);
    const memoryName = core_text.normalizeText(memory?.characterName, 120);
    if (indexedName && memoryName && indexedName !== memoryName) throw new Error('同头像下检测到不同角色身份；为避免读错聊天，已拒绝打开。请在“管理角色分类”里手动归类后再试。');
    let cache = {};
    const stored = metadata[core_constants.CACHE_KEY];
    if (core_cache.isCompressedCacheRecord(stored)) {
        const hydrated = await core_cache.gunzipJson(stored.data);
        if (!hydrated || typeof hydrated !== 'object') throw new Error('这个档案的已生成内容缓存无法解压。');
        cache = hydrated;
    } else if (stored && typeof stored === 'object') {
        cache = stored;
    }
    if (Object.keys(cache).length) {
        if (core_text.normalizeText(cache.chatId, 240) && core_context.comparableChatId(cache.chatId) !== wantedChatId) cache = {};
        else if (core_text.normalizeText(cache.archiveRevision, 240) && cache.archiveRevision !== memory.archiveRevision) cache = {};
    }
    return rememberArchiveSnapshot({
        entryId: core_context.archiveIndexEntryId(entry),
        archiveGroupId: archive_groups.archiveGroupKeyForEntry(entry),
        characterKey: core_text.normalizeText(entry.characterKey, 300),
        avatar,
        characterName: core_text.normalizeText(entry.characterName || memory.characterName, 120) || '未命名角色',
        chatId: wantedChatId,
        archiveName: core_text.normalizeText(memory.archiveName, 160) || archive_repository.fallbackArchiveName(memory.memories),
        memory,
        cache,
        loadedAt: Date.now(),
    });
}

export function setArchiveReadOnly(readOnly) {
    if (!runtimeState.activeArchiveSnapshot) return;
    runtimeState.activeArchiveReadOnly = readOnly !== false;
    if (runtimeState.activeMode && runtimeState.activeSession) ui_overlay.renderActive();
    else showIndexedArchiveSnapshot(runtimeState.activeArchiveSnapshot);
    if (!runtimeState.activeArchiveReadOnly) {
        const live = generation_imageGeneration.indexedArchiveMatchesCurrentChat(runtimeState.activeArchiveSnapshot, core_context.getContext());
        globalThis.toastr?.info?.(
            live
                ? '已关闭只读保护。当前酒馆正好打开这份档案对应聊天；增量追加/绘制仍会逐项确认。'
                : '已关闭只读保护，但心跳回忆不会自动切换聊天。你可以查看编辑按钮；真正写入前必须先手动在酒馆打开这份档案对应聊天。',
            '心跳回忆',
        );
    }
}

export function archiveSnapshotEditableUi() {
    return !!runtimeState.activeArchiveSnapshot && !runtimeState.activeArchiveReadOnly;
}

export function snapshotWriteBlockMessage() {
    const snapshot = runtimeState.activeArchiveSnapshot;
    if (!snapshot) return '';
    return `这份档案当前不是 SillyTavern 正在打开的聊天。\n\n为避免再次出现“关闭只读后自动切聊天、刷新后档案看起来消失”的问题，r18 不会替你自动切换。请先手动在酒馆打开「${snapshot.characterName || '该角色'}」对应的这个聊天窗口，再回到档案室执行写入。现有档案不会因此被删除。`;
}

export function promoteSnapshotToLiveIfCurrent() {
    if (!runtimeState.activeArchiveSnapshot) return true;
    if (runtimeState.activeArchiveReadOnly) {
        globalThis.toastr?.info?.('当前仍是只读查看。请先关闭“只读查看”开关。', '心跳回忆');
        return false;
    }
    const snapshot = runtimeState.activeArchiveSnapshot;
    const context = core_context.getContext();
    if (!generation_imageGeneration.indexedArchiveMatchesCurrentChat(snapshot, context)) {
        globalThis.toastr?.warning?.(snapshotWriteBlockMessage(), '心跳回忆');
        return false;
    }
    const mode = runtimeState.activeMode;
    const oldSession = runtimeState.activeSession;
    let live = null;
    if (mode) {
        live = core_cache.loadSession(mode);
        if (!live) {
            globalThis.toastr?.warning?.('当前真实聊天的这项已生成缓存尚未加载，心跳回忆不会用只读快照覆盖它。请先从“当前窗口档案”打开一次这项，再执行绘制/修改。', '心跳回忆');
            return false;
        }
    }
    runtimeState.activeArchiveSnapshot = null;
    runtimeState.activeArchiveReadOnly = true;
    if (live) {
        // Preserve only harmless view/selection state from the read-only clone.
        for (const key of ['selectedId', 'selectedConfessionId', 'selectedVoiceId', 'selectedScenarioId', 'selectedStripId', 'selectedSpaceId', 'selectedObjectId', 'view', 'page', 'paragraphIndex', 'dialogueIndex', 'confessionLineIndex']) {
            if (oldSession && Object.hasOwn(oldSession, key)) live[key] = oldSession[key];
        }
        runtimeState.activeSession = live;
    }
    return true;
}

export function requireWritableArchiveAction() {
    if (!runtimeState.activeArchiveSnapshot) return true;
    return promoteSnapshotToLiveIfCurrent();
}

function snapshotCalendarQuickAccessHtml({ ready = true, generated = false, readOnly = true, generating = false } = {}) {
    const status = !ready
        ? '当前聊天还没有正式档案。先生成当前窗口档案后，就可以整理两个人的日历。'
        : generating
            ? (generated ? '正在刷新 · 旧日历仍可查看' : '正在整理日历…')
            : generated
                ? '已整理：已度过 / 已约定未发生 / 未来世界设定'
                : (readOnly ? '这份档案还没有整理日历。' : '还没有整理日历。');
    const openButton = generated
        ? `<button type="button" class="rmt-btn rmt-calendar-quick-primary" data-rmt-mode="${core_text.esc(core_constants.MODE.CALENDAR)}">查看日历</button>`
        : '';
    const generateButton = !readOnly
        ? `<button type="button" class="rmt-btn" data-rmt-generate-mode="${core_text.esc(core_constants.MODE.CALENDAR)}" ${generated ? 'data-rmt-regenerate="true"' : ''} ${!ready || generating ? 'disabled' : ''}>${generating ? '生成中…' : generated ? '刷新日历' : '生成日历'}</button>`
        : '';
    return `<section class="rmt-calendar-quick ${generated ? 'ready' : 'empty'}">
      <div class="rmt-calendar-quick-icon"><i class="fa-solid fa-calendar"></i></div>
      <div class="rmt-calendar-quick-copy"><span>RELATIONSHIP CALENDAR</span><b>两个人的日历</b><small>${core_text.esc(status)}</small></div>
      <div class="rmt-calendar-quick-actions">${openButton}${generateButton}</div>
    </section>`;
}

export function showIndexedArchiveSnapshot(snapshot = runtimeState.activeArchiveSnapshot) {
    if (!snapshot?.memory) return showArchiveLibrary();
    const isNewSnapshot = runtimeState.activeArchiveSnapshot !== snapshot;
    runtimeState.activeArchiveSnapshot = snapshot;
    if (isNewSnapshot) runtimeState.activeArchiveReadOnly = true;
    runtimeState.activeMode = null;
    runtimeState.activeSession = null;
    runtimeState.archiveViewLevel = 'snapshot';
    ui_overlay.openOverlay();
    ui_overlay.setRegenerateVisible(false);
    ui_overlay.setBackVisible(true, '角色档案');
    ui_overlay.topTitle(`心跳回忆 · ${snapshot.characterName} · ${runtimeState.activeArchiveReadOnly ? '只读档案' : '编辑待命'}`);
    const body = ui_overlay.bodyEl();
    if (!body) return;
    const memory = snapshot.memory;
    const portals = archive_snapshots.baseModeAvailability({ chatId: snapshot.chatId, memoryBank: memory, cache: snapshot.cache, clone: false });
    const generatedCount = portals.filter(item => !!item.session).length;
    const calendarPortal = portals.find(item => item.mode === core_constants.MODE.CALENDAR) || { session: null };
    const calendarQuick = snapshotCalendarQuickAccessHtml({ generated: !!calendarPortal.session, readOnly: runtimeState.activeArchiveReadOnly });
    const portalHtml = portals.filter(item => item.mode !== core_constants.MODE.CALENDAR).map(({ mode, session, meta }) => {
        const generated = !!session;
        const editAction = runtimeState.activeArchiveReadOnly ? '' : `<button type="button" class="rmt-btn rmt-portal-generate" data-rmt-generate-mode="${core_text.esc(mode)}" ${generated ? 'data-rmt-regenerate="true"' : ''}>${generated ? '增量追加' : '生成这一项'}</button>`;
        return `<article class="rmt-archive-portal ${generated ? 'ready' : 'empty'} rmt-archive-portal-${core_text.esc(meta.accent)}">
          <button type="button" class="rmt-portal-open" ${generated ? `data-rmt-mode="${core_text.esc(mode)}"` : 'disabled'}>
            <span class="rmt-portal-avatar"><i class="fa-solid ${core_text.esc(meta.icon)}"></i>${generated ? '<span class="rmt-portal-ready-dot">✓</span>' : '<span class="rmt-portal-lock"><i class="fa-solid fa-lock"></i></span>'}</span>
            <span class="rmt-portal-title">${core_text.esc(meta.title)}</span>
            <span class="rmt-portal-subtitle">${core_text.esc(meta.subtitle)}</span>
            <span class="rmt-portal-status">${generated ? (runtimeState.activeArchiveReadOnly ? '已生成 · 只读查看' : '已生成 · 可从新增档案继续追加') : (runtimeState.activeArchiveReadOnly ? '这份档案尚未生成' : '尚未生成 · 可选择生成')}</span>
          </button>
          ${editAction}
        </article>`;
    }).join('');
    body.innerHTML = `<div class="rmt-archive-room">
      <section class="rmt-memory-gate rmt-archive-card">
        <div class="rmt-memory-gate-text">
          <div class="rmt-archive-kicker">READ-ONLY ARCHIVE</div>
          <strong class="rmt-archive-title">${core_text.esc(snapshot.archiveName)}</strong>
          <div class="rmt-archive-summary">${core_text.esc(memory.archiveSummary || archive_repository.fallbackArchiveSummary(memory.memories))}</div>
          <div class="rmt-memory-status ready">${runtimeState.activeArchiveReadOnly ? '只读查看' : '编辑待命'} · ${memory.memories.length} 条记忆 · 已生成 ${generatedCount}/${core_constants.ARCHIVE_PORTAL_MODES.length}</div>
          <div class="rmt-archive-meta">关闭只读只改变心跳回忆里的按钮显示，不会自动切换角色/聊天、刷新宿主界面或删除档案。</div>
          <div class="rmt-archive-readonly-control">
            <label><input type="checkbox" data-rmt-readonly-toggle ${runtimeState.activeArchiveReadOnly ? 'checked' : ''}> 只读查看</label>
            <small>${runtimeState.activeArchiveReadOnly ? '关闭后会显示“增量追加 / 绘制”等按钮；真正写入前仍会验证当前酒馆是否正打开这份档案对应聊天。' : '编辑按钮已显示。若当前酒馆不是这份档案对应聊天，点击写操作只会提示你手动打开目标聊天，不会自动切换或刷新。每次追加仍会再次确认。'}</small>
          </div>
        </div>
      </section>
      ${calendarQuick}
      <section class="rmt-archive-portals" aria-label="只读档案内容入口">${portalHtml}</section>
    </div>`;
}

export async function openIndexedArchive(characterKey, chatId, entryId = '') {
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
    if (generation_imageGeneration.indexedArchiveMatchesCurrentChat(entry, context)) {
        runtimeState.activeArchiveSnapshot = null;
        runtimeState.activeArchiveReadOnly = true;
        return ui_overlay.showChooser();
    }
    ui_overlay.openOverlay();
    ui_overlay.topTitle('心跳回忆 · 正在读取只读档案…');
    const body = ui_overlay.bodyEl();
    if (body) body.innerHTML = '<div class="rmt-loading"><div class="rmt-loading-card"><div class="rmt-spinner"></div><b>正在读取这个聊天的档案与已生成内容…</b><div class="rmt-loading-note">只读取 metadata，不切换当前角色或聊天。</div></div></div>';
    try {
        const snapshot = await fetchIndexedArchiveSnapshot(entry, context);
        showIndexedArchiveSnapshot(snapshot);
    } catch (error) {
        console.warn('[HeartbeatMemories] indexed archive read-only load failed', error);
        if (ui_overlay.bodyEl()) ui_overlay.bodyEl().innerHTML = `<div class="rmt-error"><div><b>档案读取失败</b><div style="margin-top:10px;white-space:pre-wrap;opacity:.78">${core_text.esc(error?.message || String(error))}</div><button type="button" class="rmt-btn" data-rmt-action="library-home">返回档案室</button></div></div>`;
    }
}

export async function rebuildArchiveIndexFromExisting() {
    if (core_requestCoordinator.hasAnyTask()) { globalThis.toastr?.info?.('后台任务进行中，暂不扫描旧档案。', '心跳回忆'); return; }
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
    ui_overlay.openOverlay(); const body = ui_overlay.bodyEl(); ui_overlay.topTitle('心跳回忆 · 扫描旧档案');
    const avatarEntries = [...byAvatar.entries()];
    for (let i = 0; i < avatarEntries.length; i += 1) {
        const [avatar, avatarDescriptors] = avatarEntries[i];
        if (body) body.innerHTML = `<div class="rmt-loading"><div class="rmt-loading-card"><b>正在扫描旧档案 ${i + 1} / ${avatarEntries.length}</b><div class="rmt-loading-note">同头像只读取一次聊天列表；能唯一匹配角色卡时记录本地指纹，无法唯一判断时保持待手动分类。不会切换宿主聊天。</div></div></div>`;
        try {
            const response = await fetch('/api/characters/chats', { method:'POST', headers:context.getRequestHeaders(), cache:'no-cache', body:JSON.stringify({ avatar_url:avatar, metadata:true }) });
            if (!response.ok) continue;
            const rows = await response.json();
            for (const row of Array.isArray(rows) ? rows : []) {
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
                    chatId,
                    archiveName: core_text.normalizeText(mem.archiveName, 160) || archive_repository.fallbackArchiveName(mem.memories),
                    memoryCount: mem.memories.length,
                    updatedAt: Number(mem.updatedAt || mem.createdAt) || 0,
                    archiveGroupId: core_text.normalizeText(previous?.archiveGroupId, 120),
                    archiveGroupManual: previous?.archiveGroupManual === true,
                };
                candidate.entryId = candidate.entryId || core_context.archiveIndexEntryId(candidate);
                if (!archive_groups.isArchiveEntryDeletedFromLibrary(candidate, context, deletedIndex)) found.push(candidate);
            }
        } catch (error) {
            console.warn('[HeartbeatMemories] legacy archive index scan skipped avatar', avatar, error);
        }
        await core_context.yieldToUi();
    }
    // Keep previously indexed rows whose avatar could not be scanned this time; an intermittent
    // server/listing failure must never silently erase the user's library index.
    const seen = new Set(found.map(item => `${core_context.archiveStoredAvatar(item)}\u001f${item.chatId}`));
    for (const item of existing) {
        const key = `${core_context.archiveStoredAvatar(item)}${item.chatId}`;
        if (!seen.has(key) && !archive_groups.isArchiveEntryDeletedFromLibrary(item, context, deletedIndex)) found.push(item);
    }
    archive_groups.setArchiveIndex(context, found.sort((a,b) => b.updatedAt - a.updatedAt));
    archive_groups.autoClassifyArchiveIndex(context, { confirm: false });
    globalThis.toastr?.success?.(`旧档案扫描完成：索引 ${found.length} 个聊天档案。无法唯一判断的同头像/同名旧档案已单独列为“待手动分类”。`, '心跳回忆');
    showArchiveLibrary();
}
