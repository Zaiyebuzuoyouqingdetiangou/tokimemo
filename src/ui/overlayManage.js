import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as modes_calendar from '../modes/calendar.js';
import * as modes_room from '../modes/room.js';
import * as ui_contentManager from './contentManager.js';
import * as ui_heartView from './heartView.js';
import { confirmExplicitActionTwice, confirmRoomLifeRefresh, managedItemFromSession, managedTargetRecord, markUserManaged } from './overlayShell.js';
// 内容管理：删除 / 重新生成 / 重新分类已生成内容、世界书控件刷新
// 从 ui/overlay.js 原样搬出（重构阶段 2），声明文本一字未改；ui/overlay.js 仍转发原有导出。

function deleteManagedTargetFromSession(session, type, id, parentId = '') {
    const updated = structuredClone(session);
    const removeById = (list, wanted) => (Array.isArray(list) ? list : []).filter(item => item?.id !== wanted);
    if (type === 'album-entry') {
        updated.entries = removeById(updated.entries, id);
        if (updated.selectedId === id) updated.selectedId = updated.entries[0]?.id || '';
    } else if (type === 'album-image') {
        const item = updated.entries?.find(entry => entry.id === id); if (!item) throw new Error('找不到这张相簿 CG。'); item.cgImage = null;
    } else if (type === 'adv-event') {
        updated.events = removeById(updated.events, id);
        if (updated.selectedId === id) updated.selectedId = updated.events[0]?.id || '';
    } else if (type === 'adv-text') {
        const item = updated.events?.find(entry => entry.id === id); if (!item) throw new Error('找不到这个 ADV EVENT。'); item.adv = null;
    } else if (type === 'adv-image') {
        const item = updated.events?.find(entry => entry.id === id); if (!item) throw new Error('找不到这张 ADV EVENT CG。'); item.cgImage = null;
    } else if (type === 'room-life') {
        delete updated.lifePlan; delete updated.lifePlanAttempt;
    } else if (type === 'phone-app') {
        updated.apps = removeById(updated.apps, id);
        if (updated.selectedAppId === id) { updated.selectedAppId = updated.apps[0]?.id || ''; updated.selectedEntryId = ''; updated.view = 'list'; }
    } else if (type === 'phone-entry') {
        const app = updated.apps?.find(candidate => candidate.id === parentId); if (!app) throw new Error('找不到这个 App。');
        app.entries = removeById(app.entries, id);
        if (updated.selectedEntryId === id) { updated.selectedEntryId = ''; updated.view = 'list'; }
    } else if (type === 'ending-route') {
        updated.endings = removeById(updated.endings, id);
        if (updated.selectedId === id) updated.selectedId = updated.endings[0]?.id || '';
    } else if (type === 'ending-confession') {
        updated.confessionReplays = removeById(updated.confessionReplays, id);
        if (updated.selectedConfessionId === id) updated.selectedConfessionId = updated.confessionReplays[0]?.id || '';
    } else if (type === 'heart-voice') {
        updated.voiceDramas = removeById(updated.voiceDramas, id);
        if (updated.selectedVoiceId === id) updated.selectedVoiceId = '';
        if (updated.selectedDramaKey === `voice:${id}`) updated.selectedDramaKey = '';
    } else if (type === 'heart-scenario') {
        updated.scenarioDramas = removeById(updated.scenarioDramas, id);
        if (updated.selectedScenarioId === id) updated.selectedScenarioId = '';
        if (updated.selectedDramaKey === `scenario:${id}`) updated.selectedDramaKey = '';
    } else if (type === 'heart-strip') {
        updated.dailyStrips = removeById(updated.dailyStrips, id);
        if (updated.selectedStripId === id) updated.selectedStripId = updated.dailyStrips[0]?.id || '';
    } else if (type === 'heart-firefly') {
        updated.fireflyVoices = removeById(updated.fireflyVoices, id);
        if (updated.selectedFireflyId === id) updated.selectedFireflyId = updated.fireflyVoices[0]?.id || '';
    } else if (type === 'heart-strip-image') {
        const item = updated.dailyStrips?.find(entry => entry.id === id); if (!item) throw new Error('找不到这个日常一格。'); item.cgImage = null;
    } else if (type === 'achievement') {
        updated.entries = removeById(updated.entries, id);
    } else if (type === 'calendar-entry') {
        const pageKey = core_text.normalizeText(parentId, 160);
        const index = updated.entries?.findIndex(item => item?.id === id && modes_calendar.calendarEntryPageKey(item) === pageKey) ?? -1;
        if (index < 0) throw new Error('找不到这条日历项。');
        updated.entries.splice(index, 1);
        const page = modes_calendar.calendarDayPage(updated, pageKey);
        const sameIdStillOnPage = (updated.entries || []).some(item => item?.id === id && modes_calendar.calendarEntryPageKey(item) === pageKey);
        if (page && !sameIdStillOnPage) page.entryIds = (Array.isArray(page.entryIds) ? page.entryIds : []).filter(entryId => entryId !== id);
    } else if (type === 'calendar-note' || type === 'calendar-mood' || type === 'calendar-draft' || type === 'calendar-manual-todo') {
        const page = modes_calendar.calendarDayPage(updated, core_text.normalizeText(parentId, 160));
        if (!page) throw new Error('找不到这个日期页。');
        const field = type === 'calendar-note'
            ? 'stickyNotes'
            : type === 'calendar-mood'
                ? 'moodNotes'
                : type === 'calendar-draft'
                    ? 'drafts'
                    : 'manualTodos';
        const before = Array.isArray(page[field]) ? page[field].length : 0;
        page[field] = removeById(page[field], id);
        if (page[field].length === before) throw new Error('找不到这条日期页内容。');
    } else if (type === 'butterfly-node') {
        const node = updated.nodes?.find(entry => entry.id === id);
        if (!node || node.trueEnding || node.id === 'MAIN') throw new Error('主时间线和观测点 Ω 不能单独删除。');
        updated.nodes = removeById(updated.nodes, id);
        updated.selected = Math.max(1, Math.min(Number(updated.selected) || 1, Math.max(1, updated.nodes.length - 1)));
    } else {
        throw new Error('未知或不允许的单项删除目标。');
    }
    return markUserManaged(updated);
}

async function commitManagedSession(updated, expectedChatId, expectedArchiveRevision, origin) {
    if (!core_context.isCurrentTaskOrigin(origin)) throw new Error('操作期间聊天窗口已经变化，本次修改没有写入。');
    const context = core_context.currentCharacterGuard();
    const memoryBank = archive_repository.requireArchive(context);
    if (memoryBank.archiveRevision !== expectedArchiveRevision) throw new Error('操作期间正式档案已经更新，本次修改没有写入。');
    updated.chatId = expectedChatId;
    updated.archiveRevision = expectedArchiveRevision;
    if (!await core_cache.commitSession(runtimeState.activeMode, updated, expectedChatId, origin)) throw new Error('当前派生缓存版本已经变化，本次修改没有写入。');
    runtimeState.activeSession = updated;
    return true;
}

export async function deleteManagedTarget(type, id, parentId = '') {
    if (!archive_library.requireWritableArchiveAction()) return;
    const shownSession = runtimeState.activeSession, mode = runtimeState.activeMode;
    const shownSnapshot = runtimeState.activeArchiveSnapshot;
    const record = managedTargetRecord(type, id, parentId);
    if (!record || !ui_contentManager.isManageableTargetType(type) || record.canDelete === false) return;
    if (!confirmExplicitActionTwice(
        `删除「${record.label}」？`,
        '只删除当前心迹回廊派生缓存中的这一项；正式聊天档案 Mxxx、SillyTavern 聊天正文和世界书都不会修改。删除后如想恢复，需要重新生成。',
        { destructive: true },
    )) return;
    try {
        if (shownSession?.readableProgress?.complete === false) {
            const targetRuntime = shownSnapshot ? await archive_library.prepareArchiveTargetSubtask(mode, `delete:${type}:${parentId}:${id}`, shownSnapshot) : null;
            const context = targetRuntime?.context || core_context.currentCharacterGuard();
            const resolved = await core_cache.resolveGenerationProgressTarget(context, shownSession,
                session => managedItemFromSession(session, type, id, parentId), { cache: targetRuntime?.archiveTarget?.cache });
            if (!resolved) throw new Error('刚才选中的内容已经变化，未删除其他版本的同编号内容。请查看当前内容后再操作。');
            const expected = JSON.stringify(managedItemFromSession(resolved.session, type, id, parentId));
            const mutate = latest => {
                if (JSON.stringify(managedItemFromSession(latest, type, id, parentId)) !== expected) {
                    throw new Error('刚才选中的内容已被更新，本次没有删除新内容。');
                }
                return deleteManagedTargetFromSession(latest, type, id, parentId);
            };
            const bank = targetRuntime?.memoryBank || archive_repository.requireArchive(context);
            const origin = targetRuntime?.origin || core_context.captureTaskOrigin(context, bank.archiveRevision);
            let committed;
            if (resolved.draftId) {
                committed = await core_cache.commitGenerationTaskResultMutation(context, resolved.draftId, mutate, {
                    expectedTaskOrigin: origin, archiveTarget: targetRuntime?.archiveTarget,
                    stillCurrent: targetRuntime?.stillCurrent,
                });
            } else if (targetRuntime) {
                const result = await targetRuntime.options.commitArchiveTargetMutation(targetRuntime.archiveTarget, mode, origin, mutate, resolved.session, targetRuntime.stillCurrent);
                archive_library.syncArchiveTargetSubtask(targetRuntime, result.snapshot);
                committed = result.session;
            } else committed = await core_cache.commitSessionMutation(mode, core_context.getChatId(context), origin, mutate, resolved.session);
            if (!committed) throw new Error('这份内容的保存状态已变化，未删除其他版本。请重新打开当前内容后再操作。');
            if (runtimeState.activeMode === mode && (shownSnapshot
                ? runtimeState.activeArchiveSnapshot?.entryId === shownSnapshot.entryId : core_context.isCurrentTaskOrigin(origin))) {
                if (targetRuntime) runtimeState.activeArchiveSnapshot.cache = structuredClone(targetRuntime.archiveTarget.cache);
                runtimeState.activeSession = shownSession.readableProgress?.explicitDraft
                    ? { ...committed, readableProgress: { ...committed.readableProgress, explicitDraft: true }, generationSources: shownSession.generationSources }
                    : core_cache.loadSession(mode, { context, memoryBank: bank,
                    cache: targetRuntime?.archiveTarget?.cache, clone: true, includePartial: true }) || committed;
                ui_contentManager.renderContentManager();
            }
            globalThis.toastr?.success?.(`已删除：${record.label}`, '心迹回廊');
            return;
        }
        const context = core_context.currentCharacterGuard();
        const expectedChatId = core_context.getChatId(context);
        const memoryBank = archive_repository.requireArchive(context);
        const origin = { ...core_context.captureTaskOrigin(context, memoryBank.archiveRevision), chatId: core_context.comparableChatId(expectedChatId) };
        const base = core_cache.loadSession(runtimeState.activeMode, { context, chatId: expectedChatId, memoryBank, clone: true });
        if (!base) throw new Error('当前分类缓存已经变化，请返回后重新打开再操作。');
        const updated = deleteManagedTargetFromSession(base, type, id, parentId);
        await commitManagedSession(updated, expectedChatId, memoryBank.archiveRevision, origin);
        globalThis.toastr?.success?.(`已删除：${record.label}`, '心迹回廊');
        ui_contentManager.renderContentManager();
    } catch (error) {
        globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊');
    }
}

export async function regenerateManagedTarget(type, id, parentId = '') {
    if (!archive_library.requireWritableArchiveAction()) return;
    const record = managedTargetRecord(type, id, parentId);
    if (!record || !ui_contentManager.isManageableTargetType(type) || record.canRegenerate === false) return;
    // Image and daily-life regeneration already own their exact two confirmations.
    if (type === 'album-image' || type === 'adv-image') {
        runtimeState.activeSession.selectedId = id;
        runtimeState.contentManagerOpen = false;
        return generation_imageGeneration.drawSelectedCgImage();
    }
    if (type === 'heart-strip-image') {
        runtimeState.contentManagerOpen = false;
        return ui_heartView.drawHeartStripImage(id);
    }
    if (type === 'room-life') {
        if (!confirmRoomLifeRefresh()) return;
        runtimeState.contentManagerOpen = false;
        return modes_room.ensureRoomLifePlan({ force: true });
    }
    if (!confirmExplicitActionTwice(
        `重新生成「${record.label}」？`,
        '模型成功返回并通过校验后，才会用新内容替换这一项；如果生成失败、聊天切换或档案 revision 变化，旧内容会原样保留。正式档案 Mxxx 不会被修改。',
        { destructive: true },
    )) return;
    return ui_contentManager.runContentRegeneration(type, id, parentId, { confirmed: true });
}

export async function recategorizeManagedTarget(id, parentId = '') {
    if (!archive_library.requireWritableArchiveAction()) return;
    const record = managedTargetRecord('album-category', id, parentId);
    if (!record || record.canRegenerate === false) return;
    if (!confirmExplicitActionTwice(
        `重新判断「${record.label}」？`,
        '只重新判断分类并写回这一项；标题、正文、共同回忆和已生成图片都保留。模型成功返回并通过校验后才保存。',
        { destructive: false },
    )) return;
    return ui_contentManager.runContentRegeneration('album-category', id, parentId, { confirmed: true });
}

export async function regenerateManagedCategory() {
    if (runtimeState.activeMode === core_constants.MODE.INBOX) return;
    if (!runtimeState.activeMode || !archive_library.requireWritableArchiveAction()) return;
    const mode = runtimeState.activeMode;
    const label = core_constants.MODE_LABEL[mode] || mode;
    if (!confirmExplicitActionTwice(
        `重新生成整个「${label}」？`,
        `成功后会用全新的分类基础内容替换当前分类；旧内容在新结果成功写入之前会一直保留。${mode === core_constants.MODE.ROOM ? '房间成功替换后，只清除依赖旧结构的“他的物品”；私人终端保留。' : ''} 实图/可选长正文等独立子内容可继续使用各自的单项重新生成按钮。正式档案不会修改。`,
        { destructive: true },
    )) return;
    runtimeState.contentManagerOpen = false;
    const fresh = await generation_client.generateMode(mode, { background: false, replaceExisting: true });
    if (fresh && mode === core_constants.MODE.ROOM) {
        try {
            const context = core_context.currentCharacterGuard();
            await core_cache.deleteSessions([core_constants.MODE.ITEMS], core_context.getChatId(context));
        } catch (error) {
            console.warn('[HeartbeatMemories] room dependent cache invalidation after replacement failed', core_text.safeErrorDiagnostic(error));
        }
    }
}

export function refreshMemoryWorldInfoBookControls(context, world, section, expectedScopeKey) {
    try {
        if (archive_repository.memorySourceScopeForContext(core_context.currentCharacterGuard()).key !== expectedScopeKey) return;
    } catch { return; }
    const book = archive_repository.getMemoryWorldInfoSelection(context).books.find(item => item.name === world);
    const all = book?.all === true;
    const selected = new Set(all ? [] : (book?.entryUids || []).map(String));
    const allInput = section?.querySelector?.('[data-rmt-memory-wi-all]');
    if (allInput) allInput.checked = all;
    const historyInput = section?.querySelector?.('[data-rmt-memory-wi-history]');
    if (historyInput) { historyInput.checked = book?.historySource === true; historyInput.disabled = !book; }
    section?.querySelectorAll?.('[data-rmt-memory-wi-entry]').forEach(input => {
        input.disabled = all;
        input.checked = !all && selected.has(String(input.dataset.rmtMemoryWiUid || ''));
    });
}
