import * as core_constants from './constants.js';
import * as core_context from './context.js';
import * as image_patch from './cgImagePatch.js';
import { state as runtimeState } from './state.js';
import * as core_text from './text.js';
// C-3d（r84.102）：别名沿用 generation_recovery，函数体一字不改；登记表已在 core，不再 import generation 层。
import * as generation_recovery from './recoveryRegistry.js';
// C-3（r84.98）：别名沿用 modes_heart，函数体一字不改；实际指向 core 层的桥，不再 import modes 层。
import * as modes_heart from './modesBridge.js';
// 逻辑生成任务、参与者任务查询、延迟提交队列
// 从 core/requestCoordinator.js 原样搬出（重构阶段 2），声明文本一字未改；core/requestCoordinator.js 仍转发原有导出。

let deferredDurabilityWarningShown = false;

// Whole operations outlive their individual provider requests. A cancellation
// remains latched through preparation, gaps between segments and final writes.
export const logicalGenerationTasks = new Map();

const logicalTaskOrigins = new WeakMap();

export const cancelledLogicalOrigins = [];

export const recentChatTasks = [];

let logicalTaskSequence = 0;

export const TASK_PHASE_LABEL = Object.freeze({
    prepare: '准备',
    queue: '等待 provider',
    request: '请求',
    validate: '校验',
    save: '保存',
    cancelling: '取消中',
    done: '完成',
    failed: '失败',
    cancelled: '已取消',
});

function exactLogicalOrigin(left, right) {
    return !!left && !!right && ['startedAt', 'characterKey', 'characterId', 'characterAvatar', 'chatId', 'archiveRevision']
        .every(key => String(left[key] ?? '') === String(right[key] ?? ''));
}

export function beginLogicalGenerationTask({ kind = 'mode', mode = '', pageId = '', pageIds = [], draftId = '', context = null, origin = null, taskKey = '', label = '', parentTaskId = '', signal = null } = {}) {
    if (taskKey && [...logicalGenerationTasks.values()].some(task => task.taskKey === taskKey)) {
        throw core_text.safeUserError('这一项仍在处理，请等待当前任务完全结束。', 'RMT_LOGICAL_TASK_BUSY');
    }
    const controller = new AbortController();
    let resolveSettled;
    const settled = new Promise(resolve => { resolveSettled = resolve; });
    const parent = parentTaskId ? logicalGenerationTasks.get(parentTaskId) : null;
    if (parentTaskId && !parent) throw createGenerationAbortError();
    const externalSignal = signal || parent?.signal || null;
    const forwardAbort = () => controller.abort(createGenerationAbortError());
    if (externalSignal?.aborted) throw createGenerationAbortError();
    externalSignal?.addEventListener?.('abort', forwardAbort, { once: true });
    const handle = { id: `logical-generation-${++logicalTaskSequence}`, kind, mode, pageId, pageIds: [...pageIds], draftId, parentTaskId,
        label: label || core_constants.MODE_LABEL[mode] || kind, taskKey, controller,
        signal: controller.signal, settled, resolveSettled, lifecycleEpoch: runtimeState.runtimeLifecycleEpoch,
        scope: context ? core_context.chatScopeKey(context) : '', origin: null, origins: [], status: 'running', phase: 'prepare',
        releaseParent: () => externalSignal?.removeEventListener?.('abort', forwardAbort) };
    logicalGenerationTasks.set(handle.id, handle);
    if (origin) bindLogicalGenerationTask(handle, origin);
    return handle;
}

export function bindLogicalGenerationTask(handle, origin, options = {}) {
    if (!handle || logicalGenerationTasks.get(handle.id) !== handle) throw createGenerationAbortError();
    assertLogicalGenerationTaskCurrent(handle);
    if (origin && typeof origin === 'object') {
        logicalTaskOrigins.set(origin, handle);
        handle.origin = structuredClone(origin);
        if (origin.generationRecoveryDraftId) handle.draftId = origin.generationRecoveryDraftId;
        handle.origins.push(handle.origin);
    }
    if (options.taskKey) handle.taskKey = options.taskKey;
    if (Object.hasOwn(options, 'participantSnapshot')) handle.participantSnapshot = structuredClone(options.participantSnapshot);
    return handle;
}

export function logicalGenerationTaskForOrigin(origin) {
    if (!origin || typeof origin !== 'object') return null;
    const exact = logicalTaskOrigins.get(origin);
    if (exact) return exact;
    const cancelled = cancelledLogicalOrigins.find(task => task.lifecycleEpoch === runtimeState.runtimeLifecycleEpoch
        && task.origins.some(known => exactLogicalOrigin(known, origin)));
    if (cancelled) return cancelled;
    return [...logicalGenerationTasks.values()].reverse().find(task => task.origins.some(known => exactLogicalOrigin(known, origin))) || null;
}

export function isLogicalGenerationTaskCurrent(handleOrOrigin) {
    const handle = handleOrOrigin?.settled && handleOrOrigin?.signal ? handleOrOrigin : logicalGenerationTaskForOrigin(handleOrOrigin);
    return !handle || (!handle.signal.aborted && core_context.runtimeLifecycleStillCurrent(handle.lifecycleEpoch));
}

export function assertLogicalGenerationTaskCurrent(handleOrOrigin) {
    if (!isLogicalGenerationTaskCurrent(handleOrOrigin)) throw createGenerationAbortError();
}

export function queryParticipantGenerationTasks(context = core_context.getContext(), { stableIdentity = false } = {}) {
    const scope = core_context.chatScopeKey(context);
    return [...logicalGenerationTasks.values()].filter(task => task.scope === scope || (stableIdentity
        && core_context.taskOriginCharacterMatches(task.origin, context)
        && task.origin?.chatId === core_context.comparableChatId(core_context.getChatId(context)))).map(task => ({
        id: task.id, kind: task.kind, mode: task.mode, pageId: task.pageId, pageIds: [...task.pageIds], draftId: task.draftId, parentTaskId: task.parentTaskId, label: task.label,
        origin: task.origin ? structuredClone(task.origin) : null, status: task.status,
    }));
}

export async function cancelParticipantGenerationTasks(ids) {
    const selected = [...new Set(Array.isArray(ids) ? ids : [])].map(id => logicalGenerationTasks.get(id)).filter(Boolean);
    for (const task of selected) {
        task.status = 'cancelling';
        task.controller.abort(createGenerationAbortError());
    }
    // A provider abort only settles a segment. The owner resolves this promise
    // after its final draft/storage cleanup; a new roster must wait for that.
    return Promise.all(selected.map(task => task.settled));
}

function sameDeferredOrigin(left, right) {
    if (!left || !right) return false;
    return ['startedAt', 'characterKey', 'characterAvatar', 'characterId', 'chatId', 'archiveRevision', 'archivePresent', 'sourceMessageCount']
        .every(key => String(left?.[key] ?? '') === String(right?.[key] ?? ''))
        && JSON.stringify(left?.modeWriteFences || {}) === JSON.stringify(right?.modeWriteFences || {});
}

function reportDeferredDurability() {
    const status = runtimeState.deferredChatCommits.persistenceStatus?.() || { healthy: false, error: '本地待写回存储不可用。' };
    if (status.healthy) {
        deferredDurabilityWarningShown = false;
        return true;
    }
    if (!deferredDurabilityWarningShown) {
        deferredDurabilityWarningShown = true;
        const detail = core_text.normalizeText(status.error, 400) || '浏览器没有保存待写回结果。';
        console.error('[HeartbeatMemories] deferred commit is memory-only', detail);
        globalThis.toastr?.error?.(`生成结果暂时只能保留在当前页面内：${detail} 请先回到原聊天完成写回，不要刷新页面。`, '心迹回廊');
    }
    return false;
}

export function queueDeferredCommitRecord(origin, commit) {
    if (!origin?.characterKey || !origin?.chatId || !commit?.kind) return { durable: false, key: '', item: null };
    if (commit.kind === 'archive'
        && core_context.comparableChatId(commit?.memoryBank?.chatId) !== core_context.comparableChatId(origin.chatId)) {
        return { durable: false, key: '', item: null };
    }
    if (Number(origin.lifecycleEpoch) !== runtimeState.runtimeLifecycleEpoch) return { durable: false, key: '', item: null };
    const key = `${origin.characterKey}|${origin.chatId}`;
    const list = runtimeState.deferredChatCommits.get(key) || [];
    if (commit.kind === 'cgImagePatch') {
        const patch = image_patch.normalizeCgImagePatch(commit.patch);
        if (!patch) return { durable: false, key: '', item: null };
        const previous = list.find(item => item.kind === 'cgImagePatch' && sameDeferredOrigin(item.origin, origin)
            && item.patch?.mode === patch.mode && item.patch?.itemId === patch.itemId
            && (item.draftId || '') === (commit.draftId || ''));
        const item = { kind: 'cgImagePatch', patch, origin, queuedAt: Date.now(),
            ...(typeof commit.draftId === 'string' && commit.draftId ? { draftId: commit.draftId } : {}) };
        runtimeState.deferredChatCommits.set(key, [...list.filter(row => row !== previous), item]);
        return { durable: reportDeferredDurability(), key, item };
    }
    if (commit.kind === 'heartPatches') {
        const previous = list.find(item => item.kind === 'heartPatches' && sameDeferredOrigin(item.origin, origin));
        const mergedPatches = modes_heart.mergeDeferredHeartPatches(previous?.patches, commit.patches);
        const filtered = list.filter(item => item !== previous);
        const item = { kind: 'heartPatches', patches: mergedPatches, origin, queuedAt: Date.now() };
        filtered.push(item);
        runtimeState.deferredChatCommits.set(key, filtered);
        return { durable: reportDeferredDurability(), key, item };
    }
    if (commit.kind === 'sessions') {
        const previous = list.find(item => item.kind === 'sessions' && sameDeferredOrigin(item.origin, origin));
        const mergedSessions = { ...(previous?.sessions || {}), ...(commit.sessions || {}) };
        const filtered = list.filter(item => item !== previous);
        const item = { kind: 'sessions', sessions: mergedSessions, origin, queuedAt: Date.now() };
        filtered.push(item);
        runtimeState.deferredChatCommits.set(key, filtered);
        return { durable: reportDeferredDurability(), key, item };
    }
    const previous = list.find(item => item.kind === commit.kind && sameDeferredOrigin(item.origin, origin));
    const filtered = list.filter(item => item !== previous);
    const item = { ...commit, origin, queuedAt: Date.now() };
    filtered.push(item);
    runtimeState.deferredChatCommits.set(key, filtered);
    return { durable: reportDeferredDurability(), key, item };
}

export function queueDeferredCommit(origin, commit) {
    return queueDeferredCommitRecord(origin, commit).durable;
}

// A deferred (or rejected) commit whose durability was not confirmed lives only
// in volatile page memory. Say so explicitly at the point it is queued, in the
// established wording style; the queueing logic itself is unchanged.
export function notifyDeferredCommitNotDurable(durable) {
    if (durable) return false;
    globalThis.toastr?.warning?.('生成结果已保留在当前页面，但保存未确认；请先导出未提交草稿，确认保存前不要刷新页面。', '心迹回廊');
    return true;
}

export function acknowledgeDeferredCommit(key, completedItem) {
    const list = runtimeState.deferredChatCommits.get(key);
    if (!Array.isArray(list) || !completedItem) return false;
    // The flush loop receives the exact object stored in this Map. A same-kind result can
    // arrive while that flush is awaiting hydration/storage and replaces it with a new
    // object; timestamps are only millisecond-resolution and must never authorize deleting
    // that newer merged result.
    const remaining = list.filter(item => item !== completedItem);
    if (remaining.length === list.length) return false;
    if (remaining.length) {
        if (typeof runtimeState.deferredChatCommits.replaceDurably === 'function') {
            if (!runtimeState.deferredChatCommits.replaceDurably(key, remaining)) return false;
        } else runtimeState.deferredChatCommits.set(key, remaining);
    } else if (!runtimeState.deferredChatCommits.delete(key)) return false;
    reportDeferredDurability();
    return true;
}

export function deferredCommitPersistenceStatus() {
    return runtimeState.deferredChatCommits.persistenceStatus?.() || {
        available: false,
        healthy: false,
        pendingItems: [...runtimeState.deferredChatCommits.values()].reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0),
        error: '本地待写回存储不可用。',
    };
}

export function generationTaskKeyForMode(mode, context = null) {
    let scope = '';
    try {
        const ctx = context || core_context.currentCharacterGuard();
        const memory = ctx?.chatMetadata?.[core_constants.MEMORY_KEY];
        const chatId = core_context.comparableChatId(memory?.chatId || core_context.getChatId(ctx));
        const revision = core_text.normalizeText(memory?.archiveRevision, 240);
        let entryId = core_text.normalizeText(ctx?.__rmtArchiveTargetEntryId, 120);
        if (!entryId && chatId) {
            const memoryName = core_text.normalizeText(memory?.characterName, 120);
            const rows = Array.isArray(ctx?.extensionSettings?.[core_constants.ARCHIVE_INDEX_SETTINGS_KEY])
                ? ctx.extensionSettings[core_constants.ARCHIVE_INDEX_SETTINGS_KEY]
                : [];
            const matches = rows.filter(item => core_context.comparableChatId(item?.chatId) === chatId
                && (!memoryName || core_text.normalizeText(item?.characterName, 120) === memoryName));
            if (matches.length === 1) entryId = core_context.archiveIndexEntryId(matches[0]);
        }
        // The canonical archive identity deliberately excludes the mutable card fingerprint.
        // Editing a card while a generation is in flight must not create a second "latest" lane.
        scope = `${entryId || `archive:${core_context.stableArchiveHash(`${chatId}\u001f${core_text.normalizeText(memory?.characterName, 120)}`)}`}|${chatId}|${revision}`;
    } catch {}
    return `mode:${scope}:${core_text.normalizeText(mode, 80)}`;
}

export function generationTaskKeyForArchiveTarget(mode, target) {
    const entryId = core_text.normalizeText(target?.entryId, 120);
    const chatId = core_context.comparableChatId(target?.chatId || target?.memory?.chatId);
    const revision = core_text.normalizeText(target?.archiveRevision || target?.memory?.archiveRevision, 240);
    if (!entryId || !chatId || !revision) return '';
    return `mode:${entryId}|${chatId}|${revision}:${core_text.normalizeText(mode, 80)}`;
}

export function registerArchiveTargetReservation(taskKey, targetRuntime, mode, label = '') {
    const key = core_text.normalizeText(taskKey, 240);
    const target = targetRuntime?.archiveTarget;
    const entryId = core_text.normalizeText(target?.entryId, 120);
    if (!key || !entryId) return;
    const modeKey = core_text.normalizeText(mode, 80);
    const characterName = core_text.normalizeText(target?.characterName, 120);
    const archiveName = core_text.normalizeText(target?.archiveName, 160);
    runtimeState.activeArchiveTargetReservations.set(key, {
        key,
        entryId,
        mode: modeKey,
        characterName,
        archiveName,
        label: core_text.normalizeText(label, 220) || `${characterName} · ${archiveName} · ${core_constants.MODE_LABEL?.[modeKey] || modeKey}生成中`,
        startedAt: Date.now(),
    });
}

export function unregisterArchiveTargetReservation(taskKey) {
    runtimeState.activeArchiveTargetReservations.delete(core_text.normalizeText(taskKey, 240));
}

export function isArchiveTargetModeGenerating(mode, target) {
    const key = generationTaskKeyForArchiveTarget(mode, target);
    const entryId = core_text.normalizeText(target?.entryId, 120);
    const activeSubtask = !!entryId && [...runtimeState.activeGenerationTasks.values()].some(task =>
        core_text.normalizeText(task?.origin?.archiveTargetEntryId, 120) === entryId
        && core_text.normalizeText(task?.mode, 80) === core_text.normalizeText(mode, 80));
    const reservedSubtask = !!entryId && [...runtimeState.activeArchiveTargetReservations.values()].some(task =>
        task.entryId === entryId && task.mode === core_text.normalizeText(mode, 80));
    return (!!key && (runtimeState.activeGenerationTasks.has(key) || runtimeState.activeModeBuildScopes.has(key))) || activeSubtask || reservedSubtask;
}

export function hasGenerationTasks() {
    return runtimeState.activeGenerationTasks.size > 0 || runtimeState.activeModeBuildScopes.size > 0 || runtimeState.activeAdvBulkScopes.size > 0 || runtimeState.activeArchiveTargetReservations.size > 0 || runtimeState.activeCgImageTasks.size > 0;
}

export function hasAnyTask() {
    return runtimeState.busy || hasGenerationTasks() || !!runtimeState.roomLifeRefreshPromise;
}

export function hasUnloadRisk() {
    return hasAnyTask()
        || runtimeState.deferredChatCommits.size > 0
        || runtimeState.pendingCompressedCacheWrites.size > 0
        || runtimeState.cachePersistTimers.size > 0
        || runtimeState.cachePersistChains.size > 0
        || runtimeState.archiveCommitChains.size > 0;
}

export function openAdvBulkCancellation(scope) {
    const controller = new AbortController();
    runtimeState.activeAdvBulkControllers.set(String(scope || ''), controller);
    return controller;
}

export function closeAdvBulkCancellation(scope, controller) {
    const key = String(scope || '');
    if (runtimeState.activeAdvBulkControllers.get(key) === controller) runtimeState.activeAdvBulkControllers.delete(key);
}

function liveTaskContext(context) {
    if (context) return context;
    try { return core_context.getContext(); } catch { return null; }
}

function chatTail(chatId) {
    const id = core_context.comparableChatId(chatId);
    return id ? `…${id.slice(-8)}` : '';
}

function deferredCountForOrigin(origin) {
    const key = origin?.characterKey && origin?.chatId ? `${origin.characterKey}|${core_context.comparableChatId(origin.chatId)}` : '';
    const list = key ? runtimeState.deferredChatCommits.get(key) : null;
    return Array.isArray(list) ? list.length : 0;
}

function progressText(progress, deferred, kind) {
    if (kind === 'cg') return deferred ? `绘制中；另有 ${deferred} 项待写回` : '绘制中';
    const received = Number(progress?.received) || 0;
    const saved = Number(progress?.saved) || 0;
    const base = received || saved ? `已收到 ${received} 段，已落盘 ${saved} 段` : '尚未收到可保存分段';
    return deferred ? `${base}；另有 ${deferred} 项待写回` : base;
}

function phaseOf(record) {
    if (record?.status === 'cancelling' || record?.controller?.signal?.aborted || record?.signal?.aborted) return 'cancelling';
    return TASK_PHASE_LABEL[record?.phase] ? record.phase : 'prepare';
}

function publicTaskRow(row) {
    return {
        id: row.id,
        label: row.label,
        kind: row.kind,
        phase: row.phase,
        phaseLabel: TASK_PHASE_LABEL[row.phase] || '准备',
        running: true,
        currentChat: row.currentChat === true,
        archiveTarget: row.archiveTarget === true,
        chatCaption: row.chatCaption,
        progressText: row.progressText,
        outcome: '',
        canOpen: false,
    };
}

function logicalOwnsGeneration(logical, task, taskKey) {
    if (!logical || !task) return false;
    if (logical.taskKey && (taskKey === logical.taskKey || taskKey.startsWith(`${logical.taskKey}:`) || task.parentTaskKey === logical.taskKey)) return true;
    const bound = logicalGenerationTaskForOrigin(task.origin);
    return bound?.id === logical.id && logicalGenerationTasks.get(logical.id) === logical;
}

export function collectChatTaskRows(context = null) {
    const live = liveTaskContext(context);
    let liveScope = '';
    try { liveScope = live ? core_context.chatScopeKey(live) : ''; } catch { liveScope = ''; }
    const rows = [];
    const claimedControllers = new Set();
    const claimedGeneration = new Set();
    const claimedCg = new Set();
    const claim = controller => { if (controller) claimedControllers.add(controller); };
    for (const logical of logicalGenerationTasks.values()) {
        const origin = logical.origin;
        const archiveTarget = !!core_text.normalizeText(origin?.archiveTargetEntryId, 120);
        const currentChat = !archiveTarget && (!!logical.scope && logical.scope === liveScope || originMatchesChatScope(origin, liveScope));
        const controllers = [];
        if (logical.controller) controllers.push(logical.controller);
        for (const [taskKey, task] of runtimeState.activeGenerationTasks.entries()) {
            if (!logicalOwnsGeneration(logical, task, taskKey)) continue;
            claimedGeneration.add(taskKey);
            if (task.controller) controllers.push(task.controller);
        }
        for (const [taskKey, task] of runtimeState.activeCgImageTasks.entries()) {
            if (!logicalOwnsGeneration(logical, task, taskKey)) continue;
            claimedCg.add(taskKey);
            if (task.controller) controllers.push(task.controller);
        }
        if (logical.taskKey?.startsWith('room-life:') && runtimeState.roomLifeAbortController) controllers.push(runtimeState.roomLifeAbortController);
        controllers.forEach(claim);
        const progress = generation_recovery.generationRecoveryProgress(origin);
        const name = core_text.normalizeText(origin?.characterName, 120) || '未命名角色';
        rows.push({
            id: logical.id,
            logicalId: logical.id,
            label: core_text.normalizeText(logical.label, 120) || '内容生成',
            kind: 'logical',
            phase: phaseOf(logical),
            running: true,
            currentChat,
            archiveTarget,
            controllers,
            chatCaption: archiveTarget ? `${name} · 指定档案` : currentChat ? `${name} · 当前聊天` : `${name} · 其他聊天 ${chatTail(origin?.chatId)}`,
            progressText: progressText(progress, deferredCountForOrigin(origin), 'logical'),
        });
    }
    const pushLoose = (id, task, kind, label) => {
        const origin = task?.origin || null;
        const archiveTarget = !!core_text.normalizeText(origin?.archiveTargetEntryId, 120);
        const currentChat = !archiveTarget && originMatchesChatScope(origin, liveScope);
        const controllers = task?.controller ? [task.controller] : [];
        controllers.forEach(claim);
        const progress = generation_recovery.generationRecoveryProgress(origin);
        const name = core_text.normalizeText(origin?.characterName, 120) || '未命名角色';
        rows.push({
            id, logicalId: '', label, kind, phase: phaseOf(task), running: true, currentChat, archiveTarget, controllers,
            chatCaption: archiveTarget ? `${name} · 指定档案` : currentChat ? `${name} · 当前聊天` : `${name} · 其他聊天 ${chatTail(origin?.chatId)}`,
            progressText: progressText(progress, deferredCountForOrigin(origin), kind),
        });
    };
    for (const [taskKey, task] of runtimeState.activeGenerationTasks.entries()) {
        if (claimedGeneration.has(taskKey)) continue;
        const fallback = taskKey.startsWith('room-life:') ? '今日生活生成'
            : taskKey.startsWith('adv-bulk:') || taskKey.startsWith('adv-user-repair:') ? 'ADV 批量生成'
            : core_text.normalizeText(task?.label || task?.mode, 120) || '内容生成';
        pushLoose(`gen:${taskKey}`, task, taskKey.startsWith('room-life:') ? 'room-life' : 'generation', fallback);
    }
    for (const [taskKey, task] of runtimeState.activeCgImageTasks.entries()) {
        if (claimedCg.has(taskKey) || runtimeState.activeGenerationTasks.has(taskKey)) continue;
        pushLoose(`cg:${taskKey}`, task, 'cg', core_text.normalizeText(task?.label, 120) || 'CG 绘制');
    }
    if (runtimeState.busy && runtimeState.activeTaskAbortController && !claimedControllers.has(runtimeState.activeTaskAbortController)) {
        const origin = runtimeState.activeTaskOrigin;
        const currentChat = !origin || originMatchesChatScope(origin, liveScope);
        const name = core_text.normalizeText(origin?.characterName, 120) || '未命名角色';
        claim(runtimeState.activeTaskAbortController);
        rows.push({
            id: 'archive-import',
            logicalId: '',
            label: core_text.normalizeText(runtimeState.activeTaskLabel, 120) || '正在整理聊天档案',
            kind: 'archive',
            phase: phaseOf({ controller: runtimeState.activeTaskAbortController, phase: 'prepare' }),
            running: true,
            currentChat: currentChat !== false,
            archiveTarget: false,
            controllers: [runtimeState.activeTaskAbortController],
            chatCaption: currentChat ? `${name} · 当前聊天` : `${name} · 其他聊天 ${chatTail(origin?.chatId)}`,
            progressText: progressText(generation_recovery.generationRecoveryProgress(origin), deferredCountForOrigin(origin), 'archive'),
        });
    }
    const roomOrigin = runtimeState.roomLifeRefreshOrigin;
    const roomRepresented = [...runtimeState.activeGenerationTasks.keys()].some(key => key.startsWith('room-life:'))
        || [...rows].some(row => runtimeState.roomLifeAbortController && row.controllers.includes(runtimeState.roomLifeAbortController));
    if (runtimeState.roomLifeRefreshPromise && !roomRepresented) {
        const archiveTarget = !!core_text.normalizeText(roomOrigin?.archiveTargetEntryId, 120);
        const currentChat = !archiveTarget && (!roomOrigin || originMatchesChatScope(roomOrigin, liveScope));
        const controllers = [];
        if (runtimeState.roomLifeAbortController) controllers.push(runtimeState.roomLifeAbortController);
        for (const [taskKey, task] of runtimeState.activeGenerationTasks.entries()) {
            if (taskKey.startsWith('room-life:') && task.controller && !controllers.includes(task.controller)) controllers.push(task.controller);
        }
        const name = core_text.normalizeText(roomOrigin?.characterName, 120) || '未命名角色';
        rows.push({
            id: 'room-life',
            logicalId: '',
            label: '今日生活生成',
            kind: 'room-life',
            phase: phaseOf({ controller: runtimeState.roomLifeAbortController, phase: 'prepare' }),
            running: true,
            currentChat,
            archiveTarget,
            controllers,
            chatCaption: currentChat ? `${name} · 当前聊天` : `${name} · 其他聊天 ${chatTail(roomOrigin?.chatId)}`,
            progressText: progressText(generation_recovery.generationRecoveryProgress(roomOrigin), deferredCountForOrigin(roomOrigin), 'room-life'),
        });
    }
    for (const scope of runtimeState.activeAdvBulkScopes) {
        if ([...runtimeState.activeGenerationTasks.keys()].some(key => key === `adv-bulk:${scope}` || key.startsWith(`adv-user-repair:${scope}:`))) continue;
        const controller = runtimeState.activeAdvBulkControllers.get(scope);
        const currentChat = scope === liveScope;
        rows.push({
            id: `adv-bulk:${scope}`,
            logicalId: '',
            label: 'ADV 批量生成',
            kind: 'adv-bulk',
            phase: phaseOf({ controller, phase: 'prepare' }),
            running: true,
            currentChat,
            archiveTarget: false,
            controllers: controller ? [controller] : [],
            chatCaption: currentChat ? '当前聊天' : '其他聊天',
            progressText: '准备中，尚未发出本批请求',
        });
    }
    return rows;
}

export function listChatTaskSnapshot(context = null) {
    let running = [];
    try { running = collectChatTaskRows(context).map(publicTaskRow); } catch { running = []; }
    const live = liveTaskContext(context);
    const settled = recentChatTasks.map(row => ({
        id: row.id,
        label: row.label,
        kind: row.kind,
        phase: row.phase,
        phaseLabel: TASK_PHASE_LABEL[row.phase] || '完成',
        running: false,
        currentChat: sameSettledChat(row, live),
        archiveTarget: row.archiveTarget === true,
        chatCaption: settledCaption(row, live),
        progressText: settledProgressText(row),
        outcome: row.outcome,
        canOpen: !!row.chatId && (row.outcome === 'done' || row.outcome === 'failed' || row.received > 0),
    }));
    return [...running, ...settled];
}

function sameSettledChat(row, context) {
    if (!row?.chatId || !context) return false;
    if (core_context.comparableChatId(core_context.getChatId(context)) !== row.chatId) return false;
    return !row.characterId || String(context.characterId ?? '') === row.characterId;
}

function settledCaption(row, context) {
    const name = row.characterName || '未命名角色';
    if (row.archiveTarget) return `${name} · 指定档案`;
    if (sameSettledChat(row, context)) return `${name} · 当前聊天`;
    return `${name} · 其他聊天 ${chatTail(row.chatId)}`;
}

function settledProgressText(row) {
    if (row.outcome === 'cancelled' || row.phase === 'cancelled') return '已取消';
    if (row.outcome === 'failed' || row.phase === 'failed') return row.failureSummary || '这次输出没有通过';
    if (row.secondStepLabel) return `第一次已完成，可以第二次生成${row.secondStepLabel}`;
    if (row.received || row.saved) return `已收到 ${row.received} 段，已落盘 ${row.saved} 段`;
    if (row.outcome === 'done' || row.phase === 'done') return '已生成';
    return '这次没有留下可保存的分段';
}

export function noteSecondStepOffer(origin, offer) {
    const payload = offer?.label ? {
        label: core_text.normalizeText(offer.label, 48),
        kind: core_text.normalizeText(offer.kind, 40),
        mode: core_text.normalizeText(offer.mode, 40),
        pageId: core_text.normalizeText(offer.pageId, 40),
    } : null;
    const task = logicalGenerationTaskForOrigin(origin);
    if (task) task.secondStepOffer = payload;
    if (origin && typeof origin === 'object') origin.rmtSecondStepOffer = payload;
}

export function settledChatTaskRecord(id) {
    const row = recentChatTasks.find(item => item.id === id);
    return row ? { ...row } : null;
}

export function currentChatBlockingTasks(context = null) {
    try {
        return listChatTaskSnapshot(context).filter(row => row.running && row.currentChat).map(row => row.label);
    } catch {
        return [];
    }
}

export function originMatchesChatScope(origin, scope) {
    if (!origin || !scope) return false;
    if (core_text.normalizeText(origin.archiveTargetEntryId, 120)) return false;
    const chatId = core_context.comparableChatId(origin.chatId);
    const characterKey = String(origin.characterKey || '');
    return !!chatId && !!characterKey && scope === `${characterKey}|${chatId}`;
}

export function abortTaskController(controller, seen) {
    if (!controller || seen.has(controller) || controller.signal?.aborted) return false;
    seen.add(controller);
    try { controller.abort(createGenerationAbortError()); } catch {}
    return true;
}

export function chatScopeCancellationBlocksOrigin(origin) {
    if (!origin?.startedAt) return false;
    let scope = '';
    try { scope = `${origin.characterKey}|${core_context.comparableChatId(origin.chatId)}`; } catch { return false; }
    const cancelledAt = runtimeState.cancelledChatScopeAt.get(scope);
    return !!cancelledAt && Number(origin.startedAt) <= cancelledAt;
}

export function hasCurrentChatBlockingTask(context = null) {
    return currentChatBlockingTasks(context).length > 0;
}

export function isGenerationTaskRunning(key) {
    return runtimeState.activeGenerationTasks.has(String(key || ''));
}

export function isModeGenerating(mode, context = null) {
    const ctx = context || (() => { try { return core_context.currentCharacterGuard(); } catch { return null; } })();
    const key = generationTaskKeyForMode(mode, ctx);
    let cgDrawing = false;
    try {
        const scope = ctx ? core_context.chatScopeKey(ctx) : '';
        const prefix = `cg-image:${scope}:${mode}:`;
        cgDrawing = !!scope && [...runtimeState.activeCgImageTasks.keys()].some(taskKey => taskKey.startsWith(prefix));
    } catch {}
    let isolatedEndingScan = false;
    try {
        const scope = ctx ? core_context.chatScopeKey(ctx) : '';
        isolatedEndingScan = mode === core_constants.MODE.ENDING && !!scope
            && (runtimeState.activeGenerationTasks.has(`ending-confessions:${scope}`) || runtimeState.activeModeBuildScopes.has(`ending-confessions:${scope}`));
    } catch {}
    return isGenerationTaskRunning(key) || runtimeState.activeModeBuildScopes.has(key) || cgDrawing || isolatedEndingScan;
}

export function hasGenerationTaskPrefix(prefix) {
    for (const key of runtimeState.activeGenerationTasks.keys()) if (key.startsWith(prefix)) return true;
    return false;
}

export function generationTaskLabels() {
    const labels = [...runtimeState.activeGenerationTasks.values()].map(task => task.label).filter(Boolean);
    for (const [taskKey, task] of runtimeState.activeCgImageTasks.entries()) {
        if (runtimeState.activeGenerationTasks.has(taskKey)) continue;
        labels.push(task?.mode === core_constants.MODE.HEART ? '日常一格绘制中' : 'CG 实图绘制中');
    }
    for (const scope of runtimeState.activeAdvBulkScopes) {
        const represented = [...runtimeState.activeGenerationTasks.keys()].some(key => key === `adv-bulk:${scope}` || key.startsWith(`adv-user-repair:${scope}:`));
        if (!represented) labels.push('ADV 批量任务准备中');
    }
    return [...new Set(labels)];
}

export function activeModeBuildScopeForTask(taskKey) {
    const key = String(taskKey || '');
    let match = '';
    for (const scope of runtimeState.activeModeBuildScopes) {
        if (key === scope || key.startsWith(`${scope}:`)) {
            if (scope.length > match.length) match = scope;
        }
    }
    return match;
}

export function activeLogicalGenerationKeys() {
    const keys = new Set(runtimeState.activeModeBuildScopes);
    for (const [taskKey, task] of runtimeState.activeGenerationTasks.entries()) {
        keys.add(core_text.normalizeText(task?.parentTaskKey, 240) || activeModeBuildScopeForTask(taskKey) || taskKey);
    }
    for (const taskKey of runtimeState.activeCgImageTasks.keys()) keys.add(taskKey);
    for (const scope of runtimeState.activeAdvBulkScopes) {
        const batchKey = `adv-bulk:${scope}`;
        const hasConcreteBatchRequest = [...keys].some(key => key === batchKey || key.startsWith(`adv-user-repair:${scope}:`));
        if (!hasConcreteBatchRequest) keys.add(batchKey);
    }
    return keys;
}

export function advBulkReservationKeyForTask(taskKey) {
    const key = String(taskKey || '');
    for (const scope of runtimeState.activeAdvBulkScopes) {
        if (key === `adv-bulk:${scope}` || key.startsWith(`adv-user-repair:${scope}:`)) return `adv-bulk:${scope}`;
    }
    return '';
}

export function activeLogicalGenerationCount() {
    return activeLogicalGenerationKeys().size;
}

export function canStartGenerationTask(key) {
    if (runtimeState.busy) return false;
    const taskKey = String(key || '');
    if (isGenerationTaskRunning(taskKey) || runtimeState.activeModeBuildScopes.has(taskKey)) return false;
    const keys = activeLogicalGenerationKeys();
    keys.delete(taskKey);
    const bulkReservation = advBulkReservationKeyForTask(taskKey);
    if (bulkReservation) keys.delete(bulkReservation);
    return keys.size < core_constants.MAX_CONCURRENT_GENERATION_TASKS;
}

export function createGenerationAbortError(message = '生成任务已取消。') {
    const error = new Error(message);
    error.name = 'AbortError';
    error.code = 'ABORT_ERR';
    return error;
}
