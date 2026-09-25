import * as archive_backupStore from './backupStore.js';
import * as archive_repository from './repository.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as modes_room from '../modes/room.js';
import * as ui_overlay from '../ui/overlay.js';
import * as ui_phoneView from '../ui/phoneView.js';
import * as ui_endingView from '../ui/endingView.js';
import { archiveTargetGenerationOptions, contentRegenerationDraftHtml, hydrateSnapshotCache } from './libraryCharacter.js';
// 档案快照写入：内容重新生成草稿、档案目标子任务、只读 / 可写判断、版本草稿
// 从 archive/library.js 原样搬出（重构阶段 2），声明文本一字未改；archive/library.js 仍转发原有导出。

export async function openContentRegenerationDraft(draftId, context = core_context.currentCharacterGuard(), { snapshot: sourceSnapshot = null } = {}) {
    const lifecycle = runtimeState.runtimeLifecycleEpoch, scope = core_context.chatScopeKey(context);
    const targetContext = sourceSnapshot ? archiveTargetGenerationOptions(sourceSnapshot).context : context;
    const bank = archive_repository.requireArchive(targetContext);
    const entry = sourceSnapshot || core_cache.archiveBackupEntryForContext(targetContext, bank);
    // Read the acknowledged local checkpoint, including a child that failed
    // after the last visible historical snapshot was rendered. No host/model
    // request is needed merely to open already received prose.
    const stored = await archive_backupStore.readArchiveBackupState(entry);
    core_context.assertRuntimeLifecycleCurrent(lifecycle);
    if (sourceSnapshot ? runtimeState.activeArchiveSnapshot !== sourceSnapshot
        : core_context.chatScopeKey(core_context.currentCharacterGuard()) !== scope) throw new DOMException('Chat changed', 'AbortError');
    if (stored.deleted || !stored.record) throw new Error('这份草稿所属的本机档案已不存在。');
    const savedCache = await hydrateSnapshotCache(stored.record.cache, stored.record.memory, bank.chatId, lifecycle);
    const row = core_cache.generationDraftRows(savedCache, bank).find(item => item.draftId === draftId);
    const journal = row && core_cache.loadGenerationRecovery(row.mode, targetContext, savedCache, { draftId });
    if (!journal || journal.operation?.kind !== 'content-item' || !journal.operation.sourceDraftId) throw new Error('找不到对应的单项重新生成草稿；没有请求模型，也没有改写原内容。');
    core_context.assertRuntimeLifecycleCurrent(lifecycle);
    if (sourceSnapshot ? runtimeState.activeArchiveSnapshot !== sourceSnapshot
        : core_context.chatScopeKey(core_context.currentCharacterGuard()) !== scope) throw new DOMException('Chat changed', 'AbortError');
    if (sourceSnapshot && sourceSnapshot.memory?.archiveRevision === stored.record.archiveRevision) sourceSnapshot.cache = structuredClone(savedCache);
    ui_endingView.closeEndingEasterEgg({ restoreFocus: false }); modes_room.stopRoomClock(); ui_phoneView.stopPhoneClock();
    runtimeState.activeMode = null; runtimeState.activeSession = null; runtimeState.contentManagerOpen = false;
    // Retain the actual B snapshot while A remains the live host chat. The
    // existing back/continuation routes must still refer to B after reading.
    runtimeState.activeArchiveSnapshot = sourceSnapshot;
    runtimeState.archiveViewLevel = sourceSnapshot ? 'snapshot' : 'recovery';
    ui_overlay.openOverlay(); ui_overlay.setRegenerateVisible(false); ui_overlay.setManageVisible(false); ui_overlay.setBackVisible(true);
    ui_overlay.topTitle('心迹回廊 · 单项草稿正文');
    const body = ui_overlay.bodyEl(); if (body) body.innerHTML = contentRegenerationDraftHtml(journal);
    return journal;
}

export async function prepareArchiveTargetSubtask(mode, taskPart, snapshot = runtimeState.activeArchiveSnapshot) {
    const lifecycleEpoch = runtimeState.runtimeLifecycleEpoch;
    core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
    if (!snapshot) return null;
    if (snapshot.backupOnly) throw new Error('当前查看的是只读备份，不能启动派生生成；可返回档案页重试读取源聊天。');
    const options = archiveTargetGenerationOptions(snapshot, lifecycleEpoch);
    const latest = await options.revalidateArchiveTarget(options.archiveTarget, lifecycleEpoch);
    core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
    const archiveTarget = {
        ...options.archiveTarget,
        ...latest,
        memory: structuredClone(latest.memory),
        cache: structuredClone(latest.cache || {}),
        archiveRevision: core_text.normalizeText(latest.memory?.archiveRevision, 240),
    };
    const context = options.context;
    context.chatMetadata[core_constants.MEMORY_KEY] = structuredClone(archiveTarget.memory);
    context.chatMetadata[core_constants.CACHE_KEY] = structuredClone(archiveTarget.cache);
    const expectedChatId = core_context.comparableChatId(archiveTarget.chatId);
    const expectedArchiveRevision = archiveTarget.archiveRevision;
    const epochKey = `${archiveTarget.entryId}:${core_text.normalizeText(mode, 80)}:${core_text.normalizeText(taskPart, 120)}`;
    const origin = {
        ...core_context.captureTaskOrigin(context, expectedArchiveRevision),
        chatId: expectedChatId,
        archiveTargetEntryId: archiveTarget.entryId,
    };
    return {
        archiveTarget,
        context,
        memoryBank: archiveTarget.memory,
        expectedChatId,
        expectedArchiveRevision,
        scope: `archive-target:${archiveTarget.entryId}`,
        mode: core_text.normalizeText(mode, 80),
        origin,
        stillCurrent: () => true,
        epochKey,
        epoch: 0,
        begun: false,
        lifecycleEpoch,
        options,
    };
}

export async function beginArchiveTargetSubtask(targetRuntime) {
    if (!targetRuntime?.archiveTarget) return targetRuntime;
    if (targetRuntime.begun) return targetRuntime;
    core_context.assertRuntimeLifecycleCurrent(targetRuntime.lifecycleEpoch);
    // The user may spend an arbitrary amount of time in a confirmation dialog after the
    // read-only preflight. Revalidate once more at the actual admission boundary so a target
    // deleted/rebuilt in the meantime is rejected before a provider request or durable claim.
    const latest = await targetRuntime.options.revalidateArchiveTarget(targetRuntime.archiveTarget, targetRuntime.lifecycleEpoch);
    core_context.assertRuntimeLifecycleCurrent(targetRuntime.lifecycleEpoch);
    syncArchiveTargetSubtask(targetRuntime, latest);
    const epoch = (Number(runtimeState.archiveTargetTaskEpochs.get(targetRuntime.epochKey)) || 0) + 1;
    runtimeState.archiveTargetTaskEpochs.set(targetRuntime.epochKey, epoch);
    targetRuntime.epoch = epoch;
    targetRuntime.begun = true;
    targetRuntime.stillCurrent = () => core_context.runtimeLifecycleStillCurrent(targetRuntime.lifecycleEpoch)
        && runtimeState.archiveTargetTaskEpochs.get(targetRuntime.epochKey) === epoch;
    const claimed = await targetRuntime.options.claimArchiveTarget(
        targetRuntime.archiveTarget,
        targetRuntime.mode,
        targetRuntime.stillCurrent,
    );
    core_context.assertRuntimeLifecycleCurrent(targetRuntime.lifecycleEpoch);
    if (!targetRuntime.stillCurrent()) throw new DOMException('Runtime destroyed', 'AbortError');
    targetRuntime.archiveTarget.cache = structuredClone(claimed.cache);
    targetRuntime.context.chatMetadata[core_constants.CACHE_KEY] = structuredClone(claimed.cache);
    targetRuntime.origin = {
        ...core_context.captureTaskOrigin(targetRuntime.context, targetRuntime.expectedArchiveRevision),
        chatId: targetRuntime.expectedChatId,
        archiveTargetEntryId: targetRuntime.archiveTarget.entryId,
    };
    return targetRuntime;
}

export function syncArchiveTargetSubtask(targetRuntime, snapshot) {
    if (!targetRuntime?.archiveTarget || !snapshot?.memory) return;
    targetRuntime.archiveTarget = {
        ...targetRuntime.archiveTarget,
        ...snapshot,
        memory: structuredClone(snapshot.memory),
        cache: structuredClone(snapshot.cache || {}),
        archiveRevision: core_text.normalizeText(snapshot.memory.archiveRevision, 240),
    };
    targetRuntime.memoryBank = targetRuntime.archiveTarget.memory;
    targetRuntime.context.chatMetadata[core_constants.MEMORY_KEY] = structuredClone(targetRuntime.archiveTarget.memory);
    targetRuntime.context.chatMetadata[core_constants.CACHE_KEY] = structuredClone(targetRuntime.archiveTarget.cache);
}

export function archiveSnapshotEditableUi() {
    return !!runtimeState.activeArchiveSnapshot
        && runtimeState.activeArchiveSnapshot.backupOnly !== true
        && !runtimeState.activeArchiveReadOnly;
}

export function snapshotWriteBlockMessage() {
    const snapshot = runtimeState.activeArchiveSnapshot;
    if (!snapshot) return '';
    return `这份档案当前不是 SillyTavern 正在打开的聊天。\n\n为避免再次出现“关闭只读后自动切聊天、刷新后档案看起来消失”的问题，r18 不会替你自动切换。请先手动在酒馆打开「${snapshot.characterName || '该角色'}」对应的这个聊天窗口，再回到档案室执行写入。现有档案不会因此被删除。`;
}

export function promoteSnapshotToLiveIfCurrent() {
    if (!runtimeState.activeArchiveSnapshot) return true;
    if (runtimeState.activeArchiveSnapshot.historyVersionId) {
        runtimeState.activeArchiveReadOnly = true;
        globalThis.toastr?.info?.(runtimeState.activeArchiveSnapshot.taskResultDraftId ? '当前查看的是独立保存的成果；请返回当前档案继续操作。' : '当前查看的是重做前旧版本；请返回当前档案，旧版本不能覆盖或绑定为当前内容。', '心迹回廊');
        return false;
    }
    if (runtimeState.activeArchiveSnapshot.backupOnly) {
        runtimeState.activeArchiveReadOnly = true;
        globalThis.toastr?.warning?.('当前查看的是只读备份，不能重新绑定或写入当前聊天；请重试读取源聊天。', '心迹回廊');
        return false;
    }
    if (runtimeState.activeArchiveReadOnly) {
        globalThis.toastr?.info?.('当前仍是只读查看。请先关闭“只读查看”开关。', '心迹回廊');
        return false;
    }
    const snapshot = runtimeState.activeArchiveSnapshot;
    const context = core_context.getContext();
    if (!generation_imageGeneration.indexedArchiveMatchesCurrentChat(snapshot, context)) {
        globalThis.toastr?.warning?.(snapshotWriteBlockMessage(), '心迹回廊');
        return false;
    }
    const mode = runtimeState.activeMode;
    const oldSession = runtimeState.activeSession;
    let live = null;
    if (mode) {
        live = core_cache.loadSession(mode);
        if (!live) {
            globalThis.toastr?.warning?.('当前真实聊天的这项已生成缓存尚未加载，心迹回廊不会用只读快照覆盖它。请先从“当前窗口档案”打开一次这项，再执行绘制/修改。', '心迹回廊');
            return false;
        }
    }
    runtimeState.activeArchiveSnapshot = null;
    runtimeState.activeArchiveReadOnly = true;
    if (live) {
        // Preserve only harmless view/selection state from the read-only clone.
        for (const key of ['selectedId', 'selectedConfessionId', 'selectedVoiceId', 'selectedScenarioId', 'selectedDramaKey', 'selectedStripId', 'selectedSpaceId', 'selectedObjectId', 'view', 'page', 'paragraphIndex', 'dialogueIndex', 'confessionLineIndex']) {
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

export function snapshotCalendarQuickAccessHtml({ ready = true, generated = false, readOnly = true, generating = false, canGenerate = !readOnly } = {}) {
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
    const generateButton = canGenerate
        ? `<button type="button" class="rmt-btn" data-rmt-generate-mode="${core_text.esc(core_constants.MODE.CALENDAR)}" ${generated ? 'data-rmt-regenerate="true"' : ''} ${!ready || generating ? 'disabled' : ''}>${generating ? '生成中…' : generated ? '刷新日历' : '生成日历'}</button>`
        : '';
    return `<section class="rmt-calendar-quick ${generated ? 'ready' : 'empty'}">
      <div class="rmt-calendar-quick-icon"><i class="fa-solid fa-calendar"></i></div>
      <div class="rmt-calendar-quick-copy"><span>RELATIONSHIP CALENDAR</span><b>两个人的日历</b><small>${core_text.esc(status)}</small></div>
      <div class="rmt-calendar-quick-actions">${openButton}${generateButton}</div>
    </section>`;
}

export function archiveVersionDraftsHtml(snapshot) {
    if (!snapshot?.historyVersionId || !snapshot.historyDrafts) return '';
    const parts = [];
    const seen = new Set();
    const show = (label, value) => `<details class="rmt-archive-card"><summary>${core_text.esc(label)}</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${core_text.esc(value)}</pre></details>`;
    const appendJournal = (mode, journal) => {
        const key = journal?.draftId || JSON.stringify(journal);
        if (seen.has(key)) return;
        seen.add(key);
        const label = core_constants.MODE_LABEL[mode] || mode;
        for (const [index, segment] of (journal?.segments || []).entries()) {
            const value = segment.state === 'complete' ? segment.rawJson : segment.state === 'truncated' ? segment.partial : '';
            if (typeof value !== 'string' || !value) continue;
            parts.push(show(`${label} · 第 ${index + 1} 段 · ${segment.state === 'complete' ? '已生成片段' : '未完成片段'}`, value));
        }
    };
    for (const journal of Object.values(snapshot.historyDrafts.tasks || {})) appendJournal(journal?.identity?.mode || journal?.operation?.mode || '草稿', journal);
    for (const [mode, journal] of Object.entries(snapshot.historyDrafts.modules || {})) appendJournal(mode, journal);
    if (snapshot.historyDrafts.phone && Object.keys(snapshot.historyDrafts.phone).length) parts.push(show('私人终端 · 保存的未完成草稿', JSON.stringify(snapshot.historyDrafts.phone, null, 2)));
    return parts.length ? `<section data-rmt-version-drafts><h3>重做前的未完成草稿</h3><p>以下是原任务已收到的内容，可能尚未组成完整作品；查看不会调用 API。</p>${parts.join('')}</section>` : '';
}
