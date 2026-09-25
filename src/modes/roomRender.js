import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import * as core_participants from '../core/participants.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import * as generation_recovery from '../generation/recovery.js';
import * as ui_overlay from '../ui/overlay.js';
import * as room_interior from '../ui/roomInterior.js';
import * as room_figure_local from './roomFigureLocal.js';
import * as recovery_view from '../ui/recoveryView.js';
import * as ui_generationCompletion from '../ui/generationCompletion.js';
import { normalizeRoomVisualProfile, roomNarrativeClaimsSharedHistory, roomVisualIdentitySeed } from './roomProfile.js';
import { roomClockText, roomDaypartState, roomDeepAvailability, roomLayoutCss, roomLayoutVariant, roomMotifToken, roomObjectLayout, roomObjectLayoutButtonHtml, roomObjectSafeForPresentation, roomPetNodeHtml, roomPetSummaryHtml, roomSceneClass } from './roomLayout.js';
import { fallbackRoomLifePlan, localDateKey, normalizeRoomLifePlan, normalizeRoomVisualState, normalizeTemporaryRoomObjects, roomLifeBeat, roomLifePrompt, roomParticipantSlots, roomPreservedLifeHtml } from './roomLife.js';
import { roomCandidateRepairSlots } from './roomData.js';
// 房间页面：渲染、时钟、选择与多人房间视图、生活日程生成入口
// 从 modes/room.js 原样搬出（重构阶段 2），声明文本一字未改；modes/room.js 仍转发原有导出。

export async function ensureRoomLifePlan(options = {}) {
    if (!options.participantRegeneration && !options.roomSession && runtimeState.activeSession?.kind !== core_constants.MODE.ROOM) return null;
    if (runtimeState.roomLifeRefreshPromise) return options.participantRegeneration ? { status: 'blocked' } : runtimeState.roomLifeRefreshPromise;
    const context = options.context || core_context.currentCharacterGuard();
    const roomSession = options.roomSession || (options.participantRegeneration
        ? core_cache.loadSession(core_constants.MODE.ROOM, { context, memoryBank: archive_repository.requireArchive(context), clone: true })
        : runtimeState.activeSession);
    if (!roomSession || roomSession.kind !== core_constants.MODE.ROOM) return options.participantRegeneration ? { status: 'blocked' } : null;
    const origin = core_context.captureTaskOrigin(context, archive_repository.getImportedMemory(context)?.archiveRevision || '');
    const logicalTask = core_requestCoordinator.beginLogicalGenerationTask({ kind: 'room-daily-life', mode: core_constants.MODE.ROOM,
        pageId: 'roomLife', context, origin, taskKey: `room-life-operation:${core_context.chatScopeKey(context)}`,
        parentTaskId: options.logicalParentTaskId, label: '今日生活' });
    if (roomSession.participantSnapshot) logicalTask.participantPromptIndexed = true;
    let result;
    try {
        result = await ensureRoomLifePlanOperation({ ...options, roomSession, logicalTask,
            ...(options.participantRegeneration ? { force: true } : {}) });
        return result;
    } catch (error) {
        result = { status: error?.name === 'AbortError' ? 'cancelled' : 'failed', error };
        if (options.participantRegeneration) return result;
        throw error;
    } finally { core_requestCoordinator.finishLogicalGenerationTask(logicalTask, result); }
}

async function ensureRoomLifePlanOperation(options = {}) {
    const { force = false, quiet = false } = options;
    const originalRoom = options.roomSession;
    let roomSession = structuredClone(originalRoom);
    const targetRuntime = options.context ? null : await archive_library.prepareArchiveTargetSubtask(core_constants.MODE.ROOM, 'daily-life');
    core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask);
    let context = targetRuntime?.context || options.context || core_context.currentCharacterGuard();
    const chatId = core_context.getChatId(context);
    let memoryBank = targetRuntime?.memoryBank || archive_repository.requireArchive(context);
    const targetMemoryBank = memoryBank, targetContext = context;
    const archiveRevision = memoryBank.archiveRevision;
    const existingRecovery = options.existing === undefined
        ? options.participantRegeneration && !options.draftId && !options.continueRecovery ? null
            : core_cache.loadGenerationRecovery(core_constants.MODE.ROOM, context, targetRuntime?.archiveTarget?.cache,
                { pageId: 'roomLife', ...(options.draftId ? { draftId: options.draftId } : {}) }) : options.existing;
    const originalMemory = generation_recovery.readGenerationContentSnapshot(existingRecovery)?.memoryBank;
    const crossesRevision = originalMemory?.archiveRevision && originalMemory.archiveRevision !== archiveRevision;
    let replacementTicket = null;
    if (options.participantRegeneration) {
        if (crossesRevision) {
            const version = await core_cache.readArchiveVersion(context, options.participantRegeneration.versionId);
            if (!version.selectedPages.includes('roomLife')) throw core_text.safeUserError('旧任务没有这一页的保存版本，草稿保留。', 'RMT_ARCHIVE_VERSION_REQUIRED');
            replacementTicket = { versionId: version.versionId, pageId: 'roomLife' };
        } else replacementTicket = await core_cache.assertArchiveVersionReplacement(context, options.participantRegeneration, core_constants.MODE.ROOM);
    }
    if (replacementTicket) {
        const snapshot = core_participants.normalizeParticipantSnapshot(options.participantRegeneration.participantSnapshot);
        if (!snapshot) throw new Error('明确重做缺少本次已确认的人物快照。');
        options.participantRegeneration = { ...replacementTicket, participantSnapshot: snapshot };
        core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, options.logicalTask.origin, { participantSnapshot: snapshot });
    }
    const settings = core_settings.getPluginSettings(context);
    const previousDate = existingRecovery?.operation?.kind === 'room-daily-life' ? existingRecovery.operation.dateKey : '';
    const today = /^\d{4}-\d{2}-\d{2}$/.test(previousDate) ? new Date(`${previousDate}T12:00:00`) : new Date();
    const dateKey = localDateKey(today);
    const current = roomSession.lifePlan;
    const attempt = roomSession.lifePlanAttempt;
    const recoverySummary = generation_recovery.generationRecoverySummary(existingRecovery);
    if (existingRecovery?.operation?.kind === 'room-daily-life' && recoverySummary?.completed
        && !recoverySummary.truncated && !recoverySummary.failed && !recoverySummary.failureCode
        && current?.dateKey === dateKey && current?.archiveRevision === archiveRevision) {
        // A deferred session can have committed before its UI cleanup ran. Re-run the
        // real daily-plan validator and compare saved beats, never infer completion
        // merely because an older plan for this day already exists.
        const last = [...existingRecovery.segments].reverse().find(segment => segment.state === 'complete');
        let matches = false;
        try {
            const savedParticipants = existingRecovery.frozenInputs?.['participants:room'];
            const accepted = normalizeRoomLifePlan(JSON.parse(last.rawJson), roomSession, memoryBank, today,
                { participantSnapshot: typeof savedParticipants === 'string' ? JSON.parse(savedParticipants) : null });
            matches = JSON.stringify(accepted.beats) === JSON.stringify(current.beats);
        } catch { /* An unmatched old plan is not proof that this task committed. */ }
        if (matches) {
            const completedOrigin = targetRuntime?.origin || core_context.captureTaskOrigin(context, archiveRevision);
            await core_cache.saveGenerationRecovery(context, memoryBank, core_constants.MODE.ROOM, null, completedOrigin, {
                archiveTarget: targetRuntime?.archiveTarget,
                archiveEntry: targetRuntime?.archiveTarget || core_cache.archiveBackupEntryForContext(context, memoryBank),
                stillCurrent: targetRuntime?.stillCurrent,
            });
            return current;
        }
    }
    if (!force && current?.dateKey === dateKey && current?.archiveRevision === archiveRevision && Array.isArray(current.beats)
        && (current.beats.length >= 1 || current.generatedAt === 0)) {
        return current;
    }
    if (!force && attempt?.dateKey === dateKey && Number(attempt.count) >= 1) {
        return current || fallbackRoomLifePlan(roomSession, today);
    }
    if (!settings.roomLifeAutoDaily && !force) return current || null;
    // Restoring the room must not spend another request on a saved failure.
    if (!force && !options.continueRecovery && (existingRecovery
        || core_cache.loadGenerationRecovery(core_constants.MODE.ROOM, context, targetRuntime?.archiveTarget?.cache))) return current || null;
    if (runtimeState.roomLifeRefreshPromise) return runtimeState.roomLifeRefreshPromise;
    const taskKey = `room-life:${targetRuntime?.scope || core_context.chatScopeKey(context)}:${dateKey}`;
    if (core_requestCoordinator.isModeGenerating(core_constants.MODE.ROOM, context) || !core_requestCoordinator.canStartGenerationTask(taskKey)) {
        if (!quiet && force) globalThis.toastr?.info?.('当前生成队列较忙，等房间主体/其他任务完成后再更新今日生活。', '心迹回廊');
        return replacementTicket ? { status: 'blocked' } : current || fallbackRoomLifePlan(roomSession, today);
    }
    let origin = targetRuntime?.origin || { ...core_context.captureTaskOrigin(context, archiveRevision), chatId: core_context.comparableChatId(chatId) };
    core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, origin);
    const archiveEntry = targetRuntime?.archiveTarget || core_cache.archiveBackupEntryForContext(context, memoryBank);
    const lifeCancel = new AbortController();
    runtimeState.roomLifeAbortController = lifeCancel;
    runtimeState.roomLifeRefreshOrigin = origin;
    runtimeState.roomLifeRefreshPromise = (async () => {
        try {
            if (targetRuntime) {
                await archive_library.beginArchiveTargetSubtask(targetRuntime);
                origin = targetRuntime.origin;
            } else {
                await core_cache.claimLiveModeGeneration(core_constants.MODE.ROOM, context, memoryBank,
                    { pageId: 'roomLife', draftId: options.draftId || existingRecovery?.draftId || '' });
                origin = core_context.captureTaskOrigin(context, archiveRevision);
            }
            core_requestCoordinator.bindLogicalGenerationTask(options.logicalTask, origin);
            runtimeState.roomLifeRefreshOrigin = origin;
            const handle = await generation_client.beginModeRecovery(core_constants.MODE.ROOM, context, memoryBank, origin, {
                ...options, existing: existingRecovery, pageId: 'roomLife', contentInputs: { previousSession: roomSession, roomSession }, operation: { kind: 'room-daily-life', dateKey,
                    ...(replacementTicket ? { participantRegeneration: options.participantRegeneration } : {}) },
                archiveTarget: targetRuntime?.archiveTarget, archiveEntry,
                stillCurrent: targetRuntime?.stillCurrent,
            });
            context = handle.contentContext; memoryBank = handle.contentBank;
            roomSession = structuredClone(handle.contentInputs?.roomSession || handle.contentInputs?.previousSession || roomSession);
            const participantSnapshot = await generation_client.captureRoomParticipantSnapshot(context, origin, { existing: existingRecovery,
                participantSnapshot: options.participantRegeneration?.participantSnapshot });
            const inputRoom = participantSnapshot
                ? await generation_recovery.frozenGenerationInput(origin, 'room:daily-blueprint', () => structuredClone(roomSession)) : roomSession;
            if (!quiet) ui_overlay.setInnerLoading(true, `正在生成 ${dateKey} 的生活时间线…`);
            if (lifeCancel.signal.aborted) throw core_requestCoordinator.createGenerationAbortError();
            const plan = await generation_client.requestValidatedSegment(
                roomLifePrompt(context, inputRoom, memoryBank, today, { participantSnapshot }),
                `正在让“他的房间”进入 ${dateKey} 的生活状态…`,
                { maxTokens: 6144, context, origin, signal: lifeCancel.signal, taskKey, mode: core_constants.MODE.ROOM, background: true },
                raw => normalizeRoomLifePlan(raw, inputRoom, memoryBank, today, { participantSnapshot }),
            );
            core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask);
            if (participantSnapshot) roomSession.participantSnapshot = core_participants.normalizeParticipantSnapshot(participantSnapshot);
            roomSession.lifePlan = plan;
            roomSession.lifePlanAttempt = { dateKey, count: 0, failedAt: 0 };
            if (memoryBank.archiveRevision !== archiveRevision || handle.contentInputs?.roomSession?.readableProgress?.complete === false) {
                const pending = await core_cache.saveGenerationTaskResult(targetContext, core_constants.MODE.ROOM, roomSession, origin,
                    { pageId: 'roomLife', memoryBank: targetMemoryBank, sourceMemory: memoryBank,
                        archiveTarget: targetRuntime?.archiveTarget, stillCurrent: targetRuntime?.stillCurrent });
                try { Promise.resolve(ui_overlay.presentGenerationTaskResult?.(pending.draftId, targetContext)).catch(() => {}); }
                catch { /* The result is durable; a reader failure never retries paid generation. */ }
                return pending;
            }
            if (replacementTicket) roomSession[core_cache.PARTICIPANT_REPLACEMENT_KEY] = replacementTicket;
            let committed = false;
            if (targetRuntime) {
                const result = await targetRuntime.options.commitArchiveTarget(targetRuntime.archiveTarget, core_constants.MODE.ROOM, roomSession, targetRuntime.stillCurrent, origin);
                archive_library.syncArchiveTargetSubtask(targetRuntime, result);
                committed = true;
            } else if (core_context.isCurrentTaskOrigin(origin)) {
                try { const latestMemory = archive_repository.requireArchive(core_context.currentCharacterGuard()); if (latestMemory.archiveRevision === archiveRevision) committed = await core_cache.commitSession(core_constants.MODE.ROOM, roomSession, chatId, origin); } catch {}
            }
            if (!committed) {
                core_requestCoordinator.assertLogicalGenerationTaskCurrent(options.logicalTask);
                core_requestCoordinator.queueDeferredCommit(origin, { kind: 'sessions', sessions: { [core_constants.MODE.ROOM]: roomSession } });
            }
            if (committed) await core_cache.saveGenerationRecovery(targetContext, targetMemoryBank, core_constants.MODE.ROOM, null, origin, {
                archiveTarget: targetRuntime?.archiveTarget, archiveEntry, stillCurrent: targetRuntime?.stillCurrent,
            });
            if (committed && runtimeState.activeMode === core_constants.MODE.ROOM && runtimeState.activeSession === originalRoom && !document.getElementById(core_constants.OVERLAY_ID)?.hidden) {
                runtimeState.activeSession = roomSession;
                renderRoom();
            }
            else globalThis.toastr?.success?.(`今日生活后台生成完成：${dateKey}${committed ? '' : '（回到原窗口自动写入）'}`, '心迹回廊');
            return replacementTicket ? { status: committed ? 'committed' : 'deferred', session: roomSession } : roomSession.lifePlan;
        } catch (error) {
            await generation_recovery.noteGenerationRecoveryFailure(origin, error);
            if (error?.name === 'AbortError' || !core_requestCoordinator.isLogicalGenerationTaskCurrent(options.logicalTask)) {
                return replacementTicket ? { status: 'cancelled' } : null;
            }
            if (replacementTicket) return { status: 'failed', error };
            console.warn('[HeartbeatMemories] room life plan failed, using one-day fallback without automatic retry', core_text.safeErrorDiagnostic(error));
            try {
                const latestContext = core_context.currentCharacterGuard();
                const latestMemory = archive_repository.requireArchive(latestContext);
                if (!targetRuntime && memoryBank.archiveRevision === archiveRevision && core_context.isCurrentTaskOrigin(origin) && core_context.getChatId(latestContext) === chatId && latestMemory.archiveRevision === archiveRevision) {
                    const previousCount = roomSession.lifePlanAttempt?.dateKey === dateKey ? Number(roomSession.lifePlanAttempt.count) || 0 : 0;
                    roomSession.lifePlanAttempt = { dateKey, count: previousCount + 1, failedAt: Date.now() };
                    // A failed refresh must not replace an already generated daily plan.
                    if (!roomSession.lifePlan) roomSession.lifePlan = fallbackRoomLifePlan(roomSession, today);
                    await core_cache.commitSession(core_constants.MODE.ROOM, roomSession, chatId, origin);
                    if (runtimeState.activeMode === core_constants.MODE.ROOM && runtimeState.activeSession === originalRoom && !document.getElementById(core_constants.OVERLAY_ID)?.hidden) {
                        runtimeState.activeSession = roomSession;
                        renderRoom();
                    }
                }
            } catch (guardError) {
                console.warn('[HeartbeatMemories] skipped fallback save after chat/session change', guardError);
            }
            if (!quiet) globalThis.toastr?.warning?.(core_text.toastText(`当天生活时间线生成失败，今日自动生成已停止；可稍后手动点击“更新今日生活”重试：${core_text.safeErrorSummary(error)}`), '心迹回廊');
            return roomSession.lifePlan?.dateKey === dateKey ? roomSession.lifePlan : null;
        } finally {
            generation_recovery.detachGenerationRecovery(origin);
            if (!quiet) ui_overlay.setInnerLoading(false);
            runtimeState.roomLifeRefreshPromise = null;
            if (runtimeState.roomLifeAbortController === lifeCancel) runtimeState.roomLifeAbortController = null;
            if (runtimeState.roomLifeRefreshOrigin === origin) runtimeState.roomLifeRefreshOrigin = null;
        }
    })();
    return runtimeState.roomLifeRefreshPromise;
}

export function roomCurrentSlot(session = runtimeState.activeSession, date = new Date()) {
    if (!session || session.kind !== core_constants.MODE.ROOM) return null;
    if (session.participantSnapshot) {
        const slots = roomParticipantSlots(session, date);
        return { id: JSON.stringify(slots.map(slot => [slot.participantId, slot.id, slot.spaceId, slot.activity, slot.line])),
            participants: slots };
    }
    const live = roomLifeBeat(session, date);
    if (live) return live;
    const state = roomDaypartState(date);
    const stored = session.dayparts?.[state.key] || session.dayparts?.evening || null;
    if (!stored) return null;
    const memoryBank = runtimeState.activeArchiveSnapshot?.memory || null;
    if (![stored.activity, stored.line].some(field => roomNarrativeClaimsSharedHistory(field, memoryBank))) return stored;
    return {
        ...stored,
        activity: '按自己的节奏处理此刻的日常。',
        line: '',
    };
}

export function selectedRoomSpace() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ROOM) return null;
    const slot = roomCurrentSlot(runtimeState.activeSession);
    return runtimeState.activeSession.spaces.find(item => item.id === runtimeState.activeSession.selectedSpaceId)
        || runtimeState.activeSession.spaces.find(item => item.id === slot?.spaceId)
        || runtimeState.activeSession.spaces[0]
        || null;
}

export function selectedRoomObject(space = selectedRoomSpace()) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ROOM || !space) return null;
    return space.objects.find(item => item.id === runtimeState.activeSession.selectedObjectId) || space.objects[0] || null;
}

export function stopRoomClock() {
    if (runtimeState.roomClockTimer) clearInterval(runtimeState.roomClockTimer);
    runtimeState.roomClockTimer = 0;
}

export function startRoomClock() {
    stopRoomClock();
    runtimeState.roomClockTimer = setInterval(() => {
        if (runtimeState.activeMode !== core_constants.MODE.ROOM || runtimeState.activeSession?.kind !== core_constants.MODE.ROOM) return stopRoomClock();
        const now = new Date();
        const state = roomDaypartState(now);
        const beat = roomCurrentSlot(runtimeState.activeSession, now);
        const clock = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-room-clock]`);
        const stage = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-room-beat]`);
        const beatId = String(beat?.id || `${state.key}:${beat?.spaceId || ''}:${beat?.activity || ''}`);
        if (stage?.dataset?.rmtRoomBeat && stage.dataset.rmtRoomBeat !== beatId) {
            renderRoom();
            return;
        }
        // Reading/clock ticks are local-only, including after a date change or
        // restoring an older session. A new life plan needs an explicit action.
        if (clock) clock.textContent = `${state.label} · ${roomClockText(now)}`;
    }, 30000);
}

export function openRoomDeepMode(mode) {
    if (!core_constants.ROOM_DEEP_MODES.includes(mode)) return;
    const snapshotOptions = runtimeState.activeArchiveSnapshot ? { chatId: runtimeState.activeArchiveSnapshot.chatId, memoryBank: runtimeState.activeArchiveSnapshot.memory, cache: runtimeState.activeArchiveSnapshot.cache, clone: true } : null;
    const room = runtimeState.activeMode === core_constants.MODE.ROOM && runtimeState.activeSession?.kind === core_constants.MODE.ROOM ? runtimeState.activeSession : core_cache.loadSession(core_constants.MODE.ROOM, { ...snapshotOptions, includePartial: true });
    const deep = core_cache.loadSession(mode, { ...snapshotOptions, includePartial: true });
    if (!room) {
        globalThis.toastr?.info?.('请先生成“他的房间”。', '心迹回廊');
        return;
    }
    const selectedSpace = room.spaces.find(space => space.id === room.selectedSpaceId) || room.spaces[0];
    const selectedObject = selectedSpace?.objects.find(item => item.id === room.selectedObjectId) || selectedSpace?.objects[0] || null;
    if (mode === core_constants.MODE.ITEMS && !core_evidence.isSearchableRoomObject(selectedObject)) {
        globalThis.toastr?.info?.('这个物件只能观察。请先点房间里的盒子、抽屉、柜子、包或其他收纳物，再进行翻找。', '心迹回廊');
        return;
    }
    if (!deep) {
        if (runtimeState.activeArchiveSnapshot) {
            if (runtimeState.activeArchiveReadOnly) {
                globalThis.toastr?.info?.('这份档案还没有生成这一层。关闭只读后会显示编辑入口，但心迹回廊不会自动切换聊天。', '心迹回廊');
                return;
            }
            if (!archive_library.requireWritableArchiveAction()) return;
            return openRoomDeepMode(mode);
        }
        const taskKey = core_requestCoordinator.generationTaskKeyForMode(mode);
        if (core_requestCoordinator.isGenerationTaskRunning(taskKey) || runtimeState.activeModeBuildScopes.has(taskKey)) {
            globalThis.toastr?.info?.(`「${core_constants.MODE_LABEL[mode]}」已经在后台生成中。`, '心迹回廊');
            return;
        }
        if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
            globalThis.toastr?.info?.(`当前已有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成，请等其中一项完成后再启动「${core_constants.MODE_LABEL[mode]}」。`, '心迹回廊');
            return;
        }
        let phoneDraft = null;
        if (mode === core_constants.MODE.PHONE) {
            try {
                const liveContext = core_context.currentCharacterGuard();
                phoneDraft = core_cache.loadPhoneGenerationDraft(liveContext, archive_repository.requireArchive(liveContext));
            } catch {}
        }
        void generation_client.generateMode(mode, {
            background: true,
            roomSessionOverride: room,
            focusObjectId: selectedObject?.id || '',
            continueDraft: mode === core_constants.MODE.PHONE && !!phoneDraft,
        });
        globalThis.toastr?.info?.(phoneDraft
            ? `已继续生成「${phoneDraft.plan.deviceName}」，已完成的 ${phoneDraft.completedApps.length}/${phoneDraft.plan.apps.length} 个 App 不会重做。`
            : `已开始后台生成「${core_constants.MODE_LABEL[mode]}」，你可以继续留在房间里。`, '心迹回廊');
        return;
    }
    if (mode === core_constants.MODE.ITEMS && selectedSpace && selectedObject) {
        const sameSpace = deep.containers.filter(box => core_text.normalizeText(box.spaceLabel, 100) === core_text.normalizeText(selectedSpace.label, 100));
        const needle = core_text.normalizeText(selectedObject.label, 100);
        const match = sameSpace.find(box => core_text.normalizeText(`${box.label} ${box.containerType} ${box.description}`, 1800).includes(needle))
            || deep.containers.find(box => core_text.normalizeText(`${box.label} ${box.containerType} ${box.description}`, 1800).includes(needle))
            || sameSpace[0];
        if (match) {
            deep.selectedContainerId = match.id;
            deep.viewPath = [];
            deep.selectedNodeId = match.nodes[0]?.id || '';
        }
    }
    deep.returnRoomSpaceId = selectedSpace?.id || '';
    deep.returnRoomObjectId = selectedObject?.id || '';
    runtimeState.activeMode = mode;
    runtimeState.activeSession = deep;
    ui_overlay.renderActive();
}

export function returnToRoomFromDeep() {
    const room = runtimeState.activeArchiveSnapshot
        ? core_cache.loadSession(core_constants.MODE.ROOM, { chatId: runtimeState.activeArchiveSnapshot.chatId, memoryBank: runtimeState.activeArchiveSnapshot.memory, cache: runtimeState.activeArchiveSnapshot.cache, clone: true })
        : core_cache.loadSession(core_constants.MODE.ROOM);
    if (!room) return runtimeState.activeArchiveSnapshot ? archive_library.showIndexedArchiveSnapshot(runtimeState.activeArchiveSnapshot) : ui_overlay.showChooser();
    const returnSpaceId = core_text.normalizeText(runtimeState.activeSession?.returnRoomSpaceId, 80);
    const returnObjectId = core_text.normalizeText(runtimeState.activeSession?.returnRoomObjectId, 80);
    if (returnSpaceId && room.spaces.some(space => space.id === returnSpaceId)) room.selectedSpaceId = returnSpaceId;
    const space = room.spaces.find(item => item.id === room.selectedSpaceId) || room.spaces[0];
    if (returnObjectId && space?.objects.some(item => item.id === returnObjectId)) room.selectedObjectId = returnObjectId;
    runtimeState.activeMode = core_constants.MODE.ROOM;
    runtimeState.activeSession = room;
    renderRoom();
}

export function renderRoom() {
    const session = runtimeState.activeSession;
    if (!session || session.kind !== core_constants.MODE.ROOM || !Array.isArray(session.spaces) || !session.spaces.length) return;
    if (session.participantSnapshot) return renderRoomParticipants(session);
    ui_overlay.setBackVisible(true, runtimeState.activeArchiveSnapshot ? (runtimeState.activeArchiveReadOnly ? '只读档案' : '档案') : '当前档案');
    ui_overlay.topTitle(core_constants.MODE_LABEL[core_constants.MODE.ROOM]);
    const now = new Date();
    const daypart = roomDaypartState(now);
    const slot = roomCurrentSlot(session, now);
    const presentSpace = session.spaces.find(space => space.id === slot?.spaceId) || session.spaces[0];
    const roomMemoryBank = core_cache.generationPageSourceMemory(session, 'room', runtimeState.activeArchiveSnapshot?.memory || (() => {
        try { return archive_repository.requireArchive(core_context.currentCharacterGuard()); } catch { return null; }
    })());
    const selectedSpaceRaw = selectedRoomSpace() || presentSpace;
    const selectedSpace = {
        ...selectedSpaceRaw,
        atmosphere: roomNarrativeClaimsSharedHistory(selectedSpaceRaw?.atmosphere, roomMemoryBank)
            ? '这里保留着他长期生活留下的细小痕迹。'
            : core_text.normalizeText(selectedSpaceRaw?.atmosphere, 1800),
        objects: (Array.isArray(selectedSpaceRaw?.objects) ? selectedSpaceRaw.objects : [])
            .filter(item => roomObjectSafeForPresentation(item, roomMemoryBank)),
    };
    if (!session.selectedSpaceId) session.selectedSpaceId = selectedSpace.id;
    const selected = selectedRoomObject(selectedSpace);
    const selectedSearchable = core_evidence.isSearchableRoomObject(selected);
    const personIsHere = selectedSpace.id === presentSpace.id;
    const focusId = personIsHere ? (slot?.focusObjectId || '') : '';
    const visualState = normalizeRoomVisualState(slot?.visualState);
    const temporaryObjects = personIsHere ? normalizeTemporaryRoomObjects(slot?.temporaryObjects) : [];
    const archiveIdentity = runtimeState.activeArchiveSnapshot
        ? `${core_text.normalizeText(runtimeState.activeArchiveSnapshot.characterName, 120) || '{{char}}'}|${core_text.normalizeText(runtimeState.activeArchiveSnapshot.chatId, 240)}`
        : `${core_text.normalizeText(core_context.getContext().name2, 120) || '{{char}}'}|${core_text.normalizeText(session.chatId, 240)}`;
    const charName = core_text.normalizeText(runtimeState.activeArchiveSnapshot?.characterName || core_context.getContext().name2 || '{{char}}', 120);
    const visualProfile = normalizeRoomVisualProfile(session.visualProfile, {
        identitySeed: roomVisualIdentitySeed(session, runtimeState.activeArchiveSnapshot?.memory || null, archiveIdentity),
    });
    // r84.75: 小人按人设显示——本地读角色卡、绑定世界书，都没写时按身份推断；不请求模型、不写回存档。
    const figureSources = room_figure_local.roomFigureSources(core_context.getContext(), charName, () => {
        if (runtimeState.activeMode === core_constants.MODE.ROOM && runtimeState.activeSession === session) renderRoom();
    });
    const figureProfile = room_figure_local.localRoomFigure(visualProfile.figure, { explicitFields: visualProfile.explicitFields, ...figureSources, worldStyle: visualProfile.worldStyle });
    // Legacy caches did not have a pet schema. Treat absence as empty and keep any
    // newer cached array bounded before it reaches the DOM.
    const pets = (Array.isArray(session.pets) ? session.pets : []).slice(0, 6);
    const selectedPets = pets.filter(pet => pet?.spaceId === selectedSpace.id);
    const petNodes = selectedPets.map(roomPetNodeHtml).join('');
    const petNotes = selectedPets.map(roomPetSummaryHtml).join('');
    const objectLayout = roomObjectLayout(selectedSpace);
    const hotspots = room_interior.roomInteriorHtml(objectLayout, { figure: figureProfile, personIsHere, charName, selectedId: selected?.id, world: visualProfile.worldStyle });
    const objectRail = objectLayout.map(entry => roomObjectLayoutButtonHtml(entry, 'rail', selected?.id, focusId)).join('');
    const map = session.spaces.map(space => {
        const typeLabel = core_text.normalizeText(space.spaceType, 100);
        const showType = typeLabel && core_text.normalizeText(space.label, 100) !== typeLabel;
        const petCount = pets.filter(pet => pet?.spaceId === space.id).length;
        return `<button type="button" class="rmt-room-space ${space.id === selectedSpace.id ? 'active' : ''} ${space.id === presentSpace.id ? 'present' : ''}" data-rmt-room-space="${core_text.esc(space.id)}">${space.id === presentSpace.id ? '<span class="rmt-room-presence-dot">♥</span>' : ''}${petCount ? `<span class="rmt-room-pet-dot" aria-label="${petCount} 只宠物">🐾</span>` : ''}<b>${core_text.esc(space.label)}</b>${showType ? `<small>${core_text.esc(typeLabel)}</small>` : ''}</button>`;
    }).join('');
    const memorySource = selected?.basis === '记忆' && selected.sourceMemoryIds.length
        ? `档案痕迹：${selected.sourceMemoryIds.join(' · ')}`
        : '来源：角色设定 / 世界观';
    const safePresenceLines = (Array.isArray(session.presenceLines) ? session.presenceLines : [])
        .filter(line => !roomNarrativeClaimsSharedHistory(line, roomMemoryBank));
    const presenceLine = safePresenceLines[Math.max(0, Number(session.presenceIndex) || 0) % Math.max(1, safePresenceLines.length)] || slot?.line || '';
    const currentLocationText = `${daypart.label} · ${charName} 现在在「${presentSpace.label}」`;
    const deep = roomDeepAvailability();
    const itemsGenerating = core_requestCoordinator.isModeGenerating(core_constants.MODE.ITEMS);
    const readOnlyArchive = !!runtimeState.activeArchiveSnapshot && runtimeState.activeArchiveReadOnly;
    // A partial/snapshot render can occur before its current source archive is available.
    // Do not infer missing text without that source, because provenance checks need it.
    const roomRepairSlots = roomMemoryBank && typeof roomMemoryBank === 'object'
        ? roomCandidateRepairSlots(session, roomMemoryBank, { participantSnapshot: session.participantSnapshot }) : [];
    const missingRoomLines = roomRepairSlots.filter(slot => slot.reason === 'missing_text').length;
    const completionNotice = ui_generationCompletion.generationCompletionHtml({
        missing: missingRoomLines, unit: '条房间描述或当下台词', generateMode: core_constants.MODE.ROOM,
        actionData: { 'data-rmt-completion': 'room-lines' }, label: '重新尝试补全房间', readOnly: readOnlyArchive,
        message: `有 ${missingRoomLines} 条房间描述或当下台词尚未通过校验；现有空间与物件保持可读。`, className: 'rmt-room-completion',
    });
    const itemActionText = selectedSearchable
        ? (deep.items ? `翻找「${selected.label}」` : readOnlyArchive ? `「${selected.label}」尚未生成物品档案` : itemsGenerating ? '物品生成中…' : `生成并翻找「${selected.label}」`)
        : '先选中盒子 / 抽屉 / 柜子等收纳物';
    const sceneTitle = core_text.normalizeText(selectedSpace.label, 100) === core_text.normalizeText(selectedSpace.spaceType, 100)
        ? selectedSpace.label
        : `${selectedSpace.label} · ${selectedSpace.spaceType}`;
    const sceneKind = roomSceneClass(selectedSpace.spaceType, selectedSpace.label);
    const sceneLayout = roomLayoutVariant(selectedSpace);
    const sceneMotif = roomMotifToken(session, selectedSpace);
    const tempLine = temporaryObjects.length ? `<div class="rmt-room-temp-line">此刻临时物件：${temporaryObjects.map(item => core_text.esc(item)).join(' · ')}</div>` : '';
    const body = ui_overlay.bodyEl();
    body.innerHTML = `<style data-rmt-room-layout-css>${roomLayoutCss()}</style>${completionNotice}${!runtimeState.activeArchiveSnapshot || !runtimeState.activeArchiveReadOnly ? '<button type="button" class="rmt-btn" data-rmt-action="room-refresh-figure">更新人物外形 · 保留房间内容</button>' : ''}<div class="rmt-room-view" data-rmt-room-world="${core_text.esc(visualProfile.worldStyle)}" data-rmt-room-palette="${core_text.esc(visualProfile.palette)}" data-rmt-room-material="${core_text.esc(visualProfile.material)}" data-rmt-room-density="${core_text.esc(visualProfile.density)}" data-rmt-room-motif="${core_text.esc(sceneMotif)}">
      <div class="rmt-room-map" aria-label="私人空间地图">${map}</div>
      <div class="rmt-room-location"><div><b>${core_text.esc(currentLocationText)}</b><small>${core_text.esc(session.homeName)} · ${session.spaces.length} 个可观察区域</small></div><div class="rmt-room-location-actions">${!personIsHere ? `<button type="button" class="rmt-room-find" data-rmt-action="room-find-presence">去看看他</button>` : ''}${readOnlyArchive ? '' : `<button type="button" class="rmt-room-find" data-rmt-action="room-life-refresh" ${runtimeState.busy ? 'disabled' : ''}>更新今日生活</button>`}</div></div>

      <div class="rmt-room-flow">

        <section class="rmt-room-stage">
          <div class="rmt-room-stage-head"><b>${core_text.esc(sceneTitle)}</b><span class="rmt-room-clock" data-rmt-room-clock>${core_text.esc(daypart.label)} · ${core_text.esc(roomClockText(now))}</span></div>
          <div class="rmt-room-scene rmt-room-scene-${sceneKind} rmt-room-layout-scene" data-rmt-layout="${sceneLayout}" data-rmt-room-beat="${core_text.esc(String(slot?.id || `${daypart.key}:${slot?.spaceId || ''}:${slot?.activity || ''}`))}" data-rmt-room-daypart="${core_text.esc(daypart.key)}" data-rmt-lighting="${core_text.esc(visualState.lighting)}" data-rmt-window="${core_text.esc(visualState.window)}" data-rmt-order="${core_text.esc(visualState.order)}" data-rmt-surface="${core_text.esc(visualState.surface)}" data-rmt-room-motif="${core_text.esc(sceneMotif)}">
            <div class="rmt-room-interior-layout" aria-label="${core_text.esc(selectedSpace.label)}的物件布局">${hotspots}</div>
            ${selectedPets.length ? `<div class="rmt-room-pets-overlay">${petNodes}</div>` : ''}
          </div>
          <div class="rmt-room-object-rail" aria-label="房间物件">${objectRail}</div>
          <div class="rmt-room-activity-strip ${personIsHere ? '' : 'empty'}">
            ${personIsHere ? `<div><b>${core_text.esc(daypart.label)} · ${core_text.esc(slot?.time || roomClockText(now))}</b><span>${core_text.esc(slot?.activity || '')}</span>${slot?.ambient ? `<small>${core_text.esc(slot.ambient)}</small>` : ''}</div>` : `<div><b>当前不在这里</b><span>${core_text.esc(slot?.trace || '这个空间仍保留着刚刚使用过的痕迹。')}</span></div>`}
          </div>
          <div class="rmt-room-caption"><b>${core_text.esc(selectedSpace.label)}：</b>${core_text.esc(personIsHere ? (slot?.line || '') : selectedSpace.atmosphere)}${personIsHere && slot?.trace ? `<div class="rmt-room-live-trace">此刻留下的痕迹：${core_text.esc(slot.trace)}</div>` : ''}${tempLine}</div>
        </section>

        <section class="rmt-room-card rmt-room-space-note-card" id="${core_constants.OVERLAY_ID}_room_object_detail" aria-live="polite">
          <div class="rmt-room-card-kicker">物品介绍</div>
          <div class="rmt-room-object-title">${core_text.esc(selected?.label || selectedSpace.label)} ${selectedSearchable ? '<span class="rmt-room-searchable-tag">可翻找</span>' : ''}</div>
          <div class="rmt-room-object-desc">${core_text.esc(selected?.description || selectedSpace.atmosphere)}</div>
          ${selected ? `<div class="rmt-room-object-line"><b>${core_text.esc(charName)}的话</b><p>${core_text.esc(selected.line)}</p></div><div class="rmt-room-source">${core_text.esc(memorySource)}</div>` : ''}
        </section>

        <section class="rmt-room-card rmt-room-private-life-card">
          <div class="rmt-room-card-kicker">房间介绍</div>
          <div class="rmt-room-atmosphere">${core_text.esc(selectedSpace.atmosphere)}</div>
          <div class="rmt-room-summary" style="margin-top:9px">${core_text.esc(roomNarrativeClaimsSharedHistory(session.homeSummary, roomMemoryBank) ? '这些空间拼成了他日常生活真正会经过的路线。' : session.homeSummary)}</div>
          ${petNotes ? `<div class="rmt-room-pet-notes" aria-label="这个空间里的宠物">${petNotes}</div>` : ''}
          ${personIsHere ? `<div class="rmt-room-object-line">${core_text.esc(presenceLine)}</div>` : `<div class="rmt-room-object-line">${core_text.esc(charName)} 此刻在「${core_text.esc(presentSpace.label)}」。</div>`}
        </section>

        <section class="rmt-room-card rmt-room-deep-card rmt-room-private-access-card">
          <div class="rmt-room-card-kicker">PRIVATE ACCESS</div>
          <div class="rmt-room-deep-actions">
            <button type="button" class="rmt-btn" data-rmt-action="room-open-items" ${!selectedSearchable || itemsGenerating || (readOnlyArchive && !deep.items) ? 'disabled' : ''}><i class="fa-solid fa-box-open"></i> ${core_text.esc(itemActionText)}</button>
          </div>

        </section>
      </div>
    </div>`;
    const readingNotice = recovery_view.readableProgressHtml(session) + roomPreservedLifeHtml(session);
    if (readingNotice) {
        if (typeof body.insertAdjacentHTML === 'function') body.insertAdjacentHTML('afterbegin', readingNotice);
        else body.innerHTML = readingNotice + body.innerHTML;
    }
    startRoomClock();
}

export function roomSelectSpace(id) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ROOM) return;
    const space = runtimeState.activeSession.spaces.find(item => item.id === id);
    if (!space) return;
    runtimeState.activeSession.selectedSpaceId = space.id;
    runtimeState.activeSession.selectedObjectId = space.objects[0]?.id || '';
    renderRoom();
}

export function roomFindPresence() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ROOM) return;
    const slot = roomCurrentSlot(runtimeState.activeSession);
    const space = runtimeState.activeSession.spaces.find(item => item.id === slot?.spaceId);
    if (!space) return;
    runtimeState.activeSession.selectedSpaceId = space.id;
    runtimeState.activeSession.selectedObjectId = space.objects.find(item => item.id === slot?.focusObjectId)?.id || space.objects[0]?.id || '';
    renderRoom();
}

export function roomSelect(id) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ROOM) return;
    const space = selectedRoomSpace();
    const item = space?.objects.find(x => x.id === id);
    if (!item) return;
    const active = globalThis.document?.activeElement;
    const restoreFocus = active?.getAttribute?.('data-rmt-room-id') === id;
    const fromRail = active?.classList?.contains('rmt-room-layout-chip') === true;
    runtimeState.activeSession.selectedObjectId = item.id;
    renderRoom();
    if (restoreFocus) {
        const matches = ui_overlay.bodyEl()?.querySelectorAll?.('[data-rmt-room-id]') || [];
        const target = [...matches].find(button => button.getAttribute('data-rmt-room-id') === id
            && button.classList.contains('rmt-room-layout-chip') === fromRail);
        try { target?.focus({ preventScroll: true }); } catch { target?.focus(); }
    }
}

export function roomPresenceNext() {
    if (runtimeState.activeSession?.participantSnapshot) return roomSelectParticipant(runtimeState.activeSession.selectedParticipantId);
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ROOM || !runtimeState.activeSession.presenceLines.length) return;
    runtimeState.activeSession.presenceIndex = (Math.max(0, Number(runtimeState.activeSession.presenceIndex) || 0) + 1) % runtimeState.activeSession.presenceLines.length;
    renderRoom();
}

function roomSpeakerName(session, speakerId) {
    return core_participants.participantName(session.participantSnapshot, speakerId)
        || (session.residents || []).find(row => row.participantId === speakerId)?.name || '';
}

export function roomSelectParticipant(id) {
    const session = runtimeState.activeSession;
    if (!session?.participantSnapshot || !session.participantSnapshot.people.some(person => person.id === id)) return;
    const alreadySelected = session.selectedParticipantId === id;
    session.selectedParticipantId = id;
    const resident = (session.residents || []).find(row => row.participantId === id);
    if (alreadySelected && resident?.presenceLines?.length) resident.presenceIndex = ((Number(resident.presenceIndex) || 0) + 1) % resident.presenceLines.length;
    const slot = roomParticipantSlots(session).find(row => row.participantId === id);
    if (session.spaces.some(space => space.id === slot?.spaceId)) session.selectedSpaceId = slot.spaceId;
    renderRoom();
}

export function renderRoomParticipants(session = runtimeState.activeSession) {
    if (!session?.participantSnapshot || !session.spaces?.length) return;
    ui_overlay.setBackVisible(true, runtimeState.activeArchiveSnapshot ? '档案' : '当前档案');
    ui_overlay.topTitle(core_constants.MODE_LABEL[core_constants.MODE.ROOM]);
    const now = new Date(), slots = roomParticipantSlots(session, now), current = roomCurrentSlot(session, now);
    const storedSpace = session.spaces.find(space => space.id === session.selectedSpaceId) || session.spaces[0];
    let memoryBank = runtimeState.activeArchiveSnapshot?.memory || null;
    if (!memoryBank) { try { memoryBank = archive_repository.requireArchive(core_context.currentCharacterGuard()); } catch {} }
    memoryBank = core_cache.generationPageSourceMemory(session, 'room', memoryBank);
    const selectedSpace = { ...storedSpace,
        objects: (storedSpace.objects || []).filter(item => roomObjectSafeForPresentation(item, memoryBank)) };
    const selected = selectedRoomObject(selectedSpace);
    const present = slots.filter(slot => slot.spaceId === selectedSpace.id);
    const layout = roomObjectLayout(selectedSpace);
    const visual = normalizeRoomVisualProfile(session.visualProfile);
    const readOnly = !!runtimeState.activeArchiveSnapshot && runtimeState.activeArchiveReadOnly;
    const deep = roomDeepAvailability();
    const e = core_text.esc;
    const speaker = roomSpeakerName(session, selected?.speakerId);
    const people = slots.map(slot => `<button type="button" class="rmt-btn rmt-room-participant ${session.selectedParticipantId === slot.participantId ? 'active' : ''}" data-rmt-action="room-participant" data-rmt-participant-id="${e(slot.participantId)}" aria-pressed="${session.selectedParticipantId === slot.participantId}"><b>${e(slot.name)}</b><small>${e(session.spaces.find(space => space.id === slot.spaceId)?.label || '尚无当前空间记录')}</small></button>`).join('');
    const locations = session.spaces.map(space => `<button type="button" class="rmt-room-space ${space.id === selectedSpace.id ? 'active' : ''}" data-rmt-room-space="${e(space.id)}"><b>${e(space.label)}</b><small>${e(slots.filter(slot => slot.spaceId === space.id).map(slot => slot.name).join('、'))}</small></button>`).join('');
    const lines = present.map(slot => {
        const index = Number(slot.resident?.presenceIndex) || 0;
        const clickedLine = session.selectedParticipantId === slot.participantId ? slot.resident?.presenceLines?.[index] : '';
        return `<div class="rmt-room-participant-state" data-rmt-participant-state="${e(slot.participantId)}"><b>${e(slot.name)}</b><p>${e(slot.activity || '')}</p><p>${e(clickedLine || slot.line || '')}</p>${slot.ambient ? `<small>${e(slot.ambient)}</small>` : ''}${slot.trace ? `<p>${e(slot.trace)}</p>` : ''}</div>`;
    }).join('');
    const legacyLines = [...(session.presenceLines || []),
        ...Object.values(session.dayparts || {}).flatMap(slot => [slot.activity, slot.line]),
        ...(session.lifePlan?.beats || []).filter(beat => !Array.isArray(beat.participants)).flatMap(beat => [beat.activity, beat.line, beat.ambient, beat.trace]),
    ].filter(value => typeof value === 'string' && value);
    const legacy = legacyLines.length ? `<details class="rmt-room-legacy-lines"><summary>旧记录 · 未标注说话人</summary>${legacyLines.map(line => `<p>${e(line)}</p>`).join('')}</details>` : '';
    const searchable = core_evidence.isSearchableRoomObject(selected);
    const body = ui_overlay.bodyEl();
    if (!body) return;
    body.innerHTML = `<style data-rmt-room-layout-css>${roomLayoutCss()}</style><div class="rmt-room-view rmt-room-multi-view" data-rmt-room-world="${e(visual.worldStyle)}" data-rmt-room-palette="${e(visual.palette)}" data-rmt-room-material="${e(visual.material)}" data-rmt-room-density="${e(visual.density)}">
      <details class="rmt-room-find-person"><summary>找人 · ${slots.length} 人</summary><div class="rmt-room-participants" aria-label="查找人物所在空间">${people}</div></details><nav class="rmt-room-map" aria-label="切换空间">${locations}</nav>
      <div class="rmt-room-location"><b>${e(session.homeName)}</b><span data-rmt-room-clock>${e(roomDaypartState(now).label)} · ${e(roomClockText(now))}</span>${readOnly ? '' : '<button type="button" class="rmt-btn" data-rmt-action="room-refresh-figure">更新人物外形 · 保留房间内容</button><button type="button" class="rmt-btn" data-rmt-action="room-life-refresh">更新今日生活</button>'}</div>
      <div class="rmt-room-flow"><section class="rmt-room-stage"><div class="rmt-room-stage-head"><b>${e(selectedSpace.label)}</b><small>${e(present.length ? `在场：${present.map(slot => slot.name).join("、")}` : "此刻没有已记录的在场者")}</small></div><div class="rmt-room-scene rmt-room-layout-scene" data-rmt-room-beat="${e(current.id)}">
        ${room_interior.roomInteriorHtml(layout, { selectedId: selected?.id, world: visual.worldStyle, participants: present.map(slot => ({ id: slot.participantId, name: slot.name, figure: room_figure_local.localRoomFigure(slot.visualProfile?.figure || {}, { explicitFields: slot.visualProfile?.explicitFields, ...room_figure_local.roomFigureSources(core_context.getContext(), slot.name, () => {
            if (runtimeState.activeMode === core_constants.MODE.ROOM && runtimeState.activeSession === session) renderRoom();
        }), worldStyle: visual.worldStyle }) })) })}
        ${(session.pets || []).filter(pet => pet.spaceId === selectedSpace.id).map(roomPetNodeHtml).join('')}</div>
        <div class="rmt-room-object-rail">${layout.map(entry => roomObjectLayoutButtonHtml(entry, 'rail', selected?.id)).join('')}</div><div class="rmt-room-participant-states">${lines}</div></section>
      <section class="rmt-room-card" id="${core_constants.OVERLAY_ID}_room_object_detail"><div class="rmt-room-card-kicker">物品介绍</div><b>${e(selected?.label || selectedSpace.label)}</b><p>${e(selected?.description || selectedSpace.atmosphere)}</p>${selected?.line ? `<div class="rmt-room-object-line"><b>${e(speaker ? `${speaker}的话` : '未标注说话人')}</b><p>${e(selected.line)}</p></div>` : ''}</section>
      <section class="rmt-room-card"><div class="rmt-room-card-kicker">房间介绍</div><p>${e(selectedSpace.atmosphere)}</p><p>${e(session.homeSummary)}</p>${legacy}</section>
      <section class="rmt-room-card"><button type="button" class="rmt-btn" data-rmt-action="room-open-items" ${!searchable || (readOnly && !deep.items) ? 'disabled' : ''}>${e(searchable ? `翻找「${selected.label}」` : '先选中盒子 / 抽屉 / 柜子等收纳物')}</button></section></div></div>`;
    const readingNotice = recovery_view.readableProgressHtml(session) + roomPreservedLifeHtml(session);
    if (readingNotice) {
        if (typeof body.insertAdjacentHTML === 'function') body.insertAdjacentHTML('afterbegin', readingNotice);
        else body.innerHTML = readingNotice + body.innerHTML;
    }
    startRoomClock();
}
