// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_groups from './groups.js';
import * as archive_library from './library.js';
import * as archive_repository from './repository.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as ui_overlay from '../ui/overlay.js';

export function memoryStateLabel(state) {
    if (state.status === 'missing') return '这个聊天窗口还没有自己的“心跳回忆”档案。';
    const memory = state.memory;
    const suffix = memory?.truncated ? `；超长聊天已从全窗口均匀覆盖 ${memory.usedMessageCount} / ${memory.sourceMessageCount} 条消息` : '';
    let pending = '当前没有检测到新增聊天。';
    if (state.pendingMessages > 0) {
        pending = `当前还有 ${state.pendingMessages} 条新聊天未收录；档案不会自动更新。`;
    } else if (state.sourceChanged) {
        pending = '当前聊天内容与上次记录点有修改；档案仍保留上次手动版本，除非你主动更新。';
    }
    return `已收录 ${memory.memories.length} 条记忆，记录到 ${memory.sourceMessageCount} 条聊天消息${suffix}。${pending}`;
}

export function currentCharacterAvatar(context = core_context.currentCharacterGuard()) {
    return core_text.normalizeText(context.characters?.[context.characterId]?.avatar || context.characters?.[context.characterId]?.data?.avatar, 300);
}

export function archiveOverviewKey(context = core_context.currentCharacterGuard()) {
    return `${context.characterId ?? ''}|${currentCharacterAvatar(context)}`;
}

export function archiveOverviewArchiveSummary(memory) {
    if (!archive_repository.isCompatibleArchive(memory)) return null;
    return {
        name: core_text.normalizeText(memory.archiveName, 120) || archive_repository.fallbackArchiveName(memory.memories),
        summary: core_text.normalizeText(memory.archiveSummary, 420),
        memoryCount: memory.memories.length,
        updatedAt: Number(memory.updatedAt || memory.createdAt) || 0,
    };
}

export function rememberCurrentArchiveForOverview(context = core_context.currentCharacterGuard()) {
    const chatId = core_context.comparableChatId(core_context.getChatId(context));
    if (!chatId) return;
    const archive = archiveOverviewArchiveSummary(archive_repository.getImportedMemory(context));
    if (archive) runtimeState.archiveOverviewKnownArchives.set(chatId, archive);
    else runtimeState.archiveOverviewKnownArchives.delete(chatId);
}

export function syncArchiveOverviewCurrentRow(context = core_context.currentCharacterGuard()) {
    const key = archiveOverviewKey(context);
    const chatId = core_context.comparableChatId(core_context.getChatId(context));
    rememberCurrentArchiveForOverview(context);
    if (runtimeState.archiveOverviewCache.key !== key || !Array.isArray(runtimeState.archiveOverviewCache.items)) return;
    runtimeState.archiveOverviewCache.items = runtimeState.archiveOverviewCache.items.map(item => ({
        ...item,
        current: item.chatId === chatId,
        archive: item.chatId === chatId ? (runtimeState.archiveOverviewKnownArchives.get(chatId) || null) : item.archive,
    })).sort((a, b) => (b.current - a.current) || String(a.chatId).localeCompare(String(b.chatId), 'zh-CN'));
}

export function resetArchiveOverviewForCharacter(context = core_context.currentCharacterGuard()) {
    const key = archiveOverviewKey(context);
    if (runtimeState.archiveOverviewLastKey && runtimeState.archiveOverviewLastKey !== key) {
        runtimeState.archiveOverviewCache = { key: '', fetchedAt: 0, items: [] };
        runtimeState.archiveOverviewAllowedChats.clear();
        runtimeState.archiveOverviewKnownArchives.clear();
        runtimeState.archiveSnapshotCache.clear();
        runtimeState.activeArchiveSnapshot = null;
        runtimeState.activeArchiveReadOnly = true;
    }
    runtimeState.archiveOverviewLastKey = key;
}

export function scheduleChooserRefresh(delay = 40) {
    if (runtimeState.chooserRefreshTimer) clearTimeout(runtimeState.chooserRefreshTimer);
    runtimeState.chooserRefreshTimer = setTimeout(() => {
        runtimeState.chooserRefreshTimer = 0;
        if (runtimeState.activeArchiveSnapshot && runtimeState.archiveViewLevel === 'snapshot') return;
        const overlay = document.getElementById(core_constants.OVERLAY_ID);
        if (!overlay || overlay.hidden || runtimeState.busy) return;
        let context;
        try { context = core_context.currentCharacterGuard(); } catch { ui_overlay.showChooser(); return; }
        const scope = core_cache.cacheScopeFromContext(context);
        void core_cache.ensureCacheHydrated(context).then(() => {
            let latest;
            try { latest = core_context.currentCharacterGuard(); } catch { return; }
            if (core_cache.cacheScopeFromContext(latest) !== scope) return;
            const currentOverlay = document.getElementById(core_constants.OVERLAY_ID);
            if (currentOverlay && !currentOverlay.hidden && !runtimeState.busy) ui_overlay.showChooser();
        }).catch(error => console.warn('[HeartbeatMemories] cache hydration failed', error));
    }, Math.max(0, Number(delay) || 0));
}

export function archiveOverviewEntryFromChat(chat, currentChatId) {
    const fileId = core_context.comparableChatId(chat?.file_id || chat?.file_name);
    if (!fileId) return null;
    const isCurrent = fileId === core_context.comparableChatId(currentChatId);
    if (isCurrent) rememberCurrentArchiveForOverview(core_context.currentCharacterGuard());
    return {
        chatId: fileId,
        fileName: core_text.normalizeText(chat?.file_name, 300) || `${fileId}.jsonl`,
        chatItems: Math.max(0, Number(chat?.chat_items) || 0),
        lastMessageAt: chat?.last_mes || 0,
        current: isCurrent,
        archive: runtimeState.archiveOverviewKnownArchives.get(fileId) || null,
    };
}

export async function refreshArchiveOverview({ force = false } = {}) {
    const context = core_context.currentCharacterGuard();
    resetArchiveOverviewForCharacter(context);
    rememberCurrentArchiveForOverview(context);
    const key = archiveOverviewKey(context);
    const now = Date.now();
    if (!force && runtimeState.archiveOverviewCache.key === key && runtimeState.archiveOverviewCache.fetchedAt > 0 && now - runtimeState.archiveOverviewCache.fetchedAt < core_constants.ARCHIVE_OVERVIEW_CACHE_MS) {
        syncArchiveOverviewCurrentRow(context);
        return runtimeState.archiveOverviewCache.items;
    }
    if (runtimeState.archiveOverviewPromise && runtimeState.archiveOverviewPromiseKey === key && !force) return runtimeState.archiveOverviewPromise;
    const avatar = currentCharacterAvatar(context);
    if (!avatar || typeof context.getRequestHeaders !== 'function') return [];
    const expectedCharacterId = context.characterId;
    const pendingOverview = (async () => {
        // IMPORTANT: simple=true only lists chat file ids/names. Using metadata=true makes
        // SillyTavern stream every JSONL chat file to EOF, which caused visible chat-switch jank.
        const response = await fetch('/api/characters/chats', {
            method: 'POST',
            headers: context.getRequestHeaders(),
            cache: 'no-cache',
            body: JSON.stringify({ avatar_url: avatar, simple: true }),
        });
        if (!response.ok) throw new Error(`档案室一览读取失败：HTTP ${response.status}`);
        const rows = await response.json();
        const latest = core_context.currentCharacterGuard();
        if (latest.characterId !== expectedCharacterId) throw new DOMException('Character changed', 'AbortError');
        rememberCurrentArchiveForOverview(latest);
        const currentChatId = core_context.getChatId(latest);
        const items = (Array.isArray(rows) ? rows : []).map(row => archiveOverviewEntryFromChat(row, currentChatId)).filter(Boolean)
            .sort((a, b) => (b.current - a.current) || String(a.chatId).localeCompare(String(b.chatId), 'zh-CN'));
        runtimeState.archiveOverviewAllowedChats.clear();
        for (const item of items) runtimeState.archiveOverviewAllowedChats.add(item.chatId);
        runtimeState.archiveOverviewCache = { key, fetchedAt: Date.now(), items };
        return items;
    })();
    runtimeState.archiveOverviewPromise = pendingOverview;
    runtimeState.archiveOverviewPromiseKey = key;
    try {
        return await pendingOverview;
    } finally {
        if (runtimeState.archiveOverviewPromise === pendingOverview) {
            runtimeState.archiveOverviewPromise = null;
            runtimeState.archiveOverviewPromiseKey = '';
        }
    }
}

export function archiveOverviewHtml(items, { loading = false, error = '' } = {}) {
    const list = Array.isArray(items) ? items : [];
    if (loading && !list.length) return '<div class="rmt-archive-overview-empty">正在读取这个角色的聊天档案一览…</div>';
    if (error && !list.length) return `<div class="rmt-archive-overview-empty">${core_text.esc(error)}</div>`;
    if (!list.length) return '<div class="rmt-archive-overview-empty">还没有可显示的聊天窗口。</div>';
    return list.map(item => {
        const archive = item.archive;
        const name = archive?.name || '尚未创建心跳回忆档案';
        const meta = archive ? `${archive.memoryCount} 条记忆 · 更新 ${ui_overlay.formatArchiveTime(archive.updatedAt)}` : (item.current ? '未建档' : '聊天档案 · 进入后读取详情');
        return `<button type="button" class="rmt-archive-overview-item ${item.current ? 'current' : ''}" data-rmt-archive-chat="${core_text.esc(item.chatId)}" ${runtimeState.busy && !item.current ? 'disabled' : ''}>
          <span class="rmt-overview-dot">${item.current ? '●' : '○'}</span><span><b>${core_text.esc(name)}</b><small>${item.current ? '当前窗口 · ' : ''}${core_text.esc(item.chatId)} · ${core_text.esc(meta)}</small></span><i class="fa-solid fa-chevron-right"></i>
        </button>`;
    }).join('');
}

export function renderArchiveOverviewAsync({ force = false } = {}) {
    const host = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-archive-overview-list]`);
    if (!host) return;
    const cached = runtimeState.archiveOverviewCache.key === archiveOverviewKey(core_context.currentCharacterGuard()) ? runtimeState.archiveOverviewCache.items : [];
    host.innerHTML = archiveOverviewHtml(cached, { loading: !cached.length });
    refreshArchiveOverview({ force }).then(items => {
        const latestHost = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-archive-overview-list]`);
        if (latestHost) latestHost.innerHTML = archiveOverviewHtml(items);
    }).catch(error => {
        if (error?.name === 'AbortError') return;
        const latestHost = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-archive-overview-list]`);
        if (latestHost) latestHost.innerHTML = archiveOverviewHtml(cached, { error: error?.message || String(error) });
    });
}

export async function openArchiveSnapshotFromOverview(chatId) {
    const id = core_context.comparableChatId(chatId);
    if (!id || !runtimeState.archiveOverviewAllowedChats.has(id)) return;
    const context = core_context.currentCharacterGuard();
    if (core_context.comparableChatId(core_context.getChatId(context)) === id) return ui_overlay.showChooser();
    const entry = archive_groups.getArchiveIndex(core_context.getContext()).find(item => item.chatId === id && core_context.archiveEntryMatchesContextCharacter(item, context));
    if (!entry) {
        globalThis.toastr?.info?.('这个聊天还没有被索引为心跳回忆档案；不会为了查看而自动切换聊天。', '心跳回忆');
        return;
    }
    return archive_library.openIndexedArchive(entry.characterKey, id, core_context.archiveIndexEntryId(entry));
}

export function modePortalMeta(mode) {
    const meta = {
        [core_constants.MODE.ALBUM]: { title: '回忆相簿', subtitle: '共同回忆与 CG 收藏', icon: 'fa-images', accent: 'album' },
        [core_constants.MODE.ADV]: { title: 'ADV EVENT', subtitle: '重要事件与长篇回放', icon: 'fa-book-open', accent: 'adv' },
        [core_constants.MODE.ROOM]: { title: '他的房间', subtitle: '随现实时间流动的私人空间', icon: 'fa-house', accent: 'room' },
        [core_constants.MODE.ITEMS]: { title: '他的物品', subtitle: '翻找各种收纳容器与私人物件', icon: 'fa-box-open', accent: 'items' },
        [core_constants.MODE.PHONE]: { title: '他的手机', subtitle: '查看私人通讯与数字生活', icon: 'fa-mobile-screen-button', accent: 'phone' },
        [core_constants.MODE.BUTTERFLY]: { title: '蝴蝶效应', subtitle: '平行时间线观测终端', icon: 'fa-code-branch', accent: 'butterfly' },
        [core_constants.MODE.ENDING]: { title: 'ENDING / 后日谈', subtitle: '关系路线终章与未来生活', icon: 'fa-heart', accent: 'ending' },
        [core_constants.MODE.CALENDAR]: { title: '两个人的日历', subtitle: '已度过 / 已约定 / 未来', icon: 'fa-calendar-days', accent: 'calendar' },
        [core_constants.MODE.HEART]: { title: '角色互动', subtitle: '时期对话 / Drama / 日常一格', icon: 'fa-comments', accent: 'heart' },
        [core_constants.MODE.ACHIEVEMENTS]: { title: '成就库', subtitle: '已解锁 / 未解锁', icon: 'fa-trophy', accent: 'achievements' },
    };
    return meta[mode] || { title: core_constants.MODE_LABEL[mode] || mode, subtitle: '', icon: 'fa-circle', accent: 'default' };
}

export function baseModeAvailability(options = {}) {
    return core_constants.ARCHIVE_PORTAL_MODES.map(mode => ({ mode, session: core_cache.loadSession(mode, options), meta: modePortalMeta(mode) }));
}

export function archiveCharacterAvatar(entry, context = core_context.getContext()) {
    const avatar = core_context.archiveEntryAvatarName(entry, context);
    if (!avatar) return '';
    try { return context.getThumbnailUrl?.('avatar', avatar) || ''; } catch { return ''; }
}
