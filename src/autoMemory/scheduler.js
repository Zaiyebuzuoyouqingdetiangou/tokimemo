// 启用新计划后，楼层到点就读最近这一窗正文，做成增量回忆再抽签。没有新记忆或没有可抽模块时不发模块请求。
import * as archive_external from '../archive/externalMemory.js';
import * as archive_repository from '../archive/repository.js';
import * as auto_memory_library from './achievementLibrary.js';
import * as auto_memory_lookback from './achievementLookback.js';
import * as auto_memory_floor from './floorPace.js';
import * as auto_memory_gap from './gapFill.js';
import * as auto_memory_gate from './incrementalGate.js';
import * as auto_memory_host from './moduleHost.js';
import * as auto_memory_lease from './instanceLease.js';
import * as auto_memory_plan from './planStore.js';
import * as auto_memory_combined from './combinedResult.js';
import * as auto_memory_draw from './draw.js';
import * as auto_memory_redo from './redo.js';
import * as auto_memory_view from './incrementalView.js';
import * as auto_memory_registry from './moduleRegistry.js';
import * as chat_read_range from '../core/chatReadRange.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_settings from '../core/settings.js';
import * as core_text from '../core/text.js';
import * as generation_request from '../generation/generationRequest.js';
import * as auto_memory_stream from './streamGate.js';
import * as ui_countdown from '../ui/autoMemoryCountdown.js';
import * as ui_taskCenter from '../ui/taskCenter.js';

let cleanup = null;
let leaseOwner = '';
let fillInflight = false;
let quietTimer = 0;
let stablePasses = 0;
let settleWaits = 0;
let lastSignature = '';
const handledFloors = new Map();
const inflightScopes = new Set();
const noticedGroups = new Set();
const autoUsed = new Map();
let autoRepairInflight = false;
let redoInflight = false;
let floorRecovery = '';
const sameFloor = auto_memory_redo.createSameFloorGate();

export function storyStillWriting(context) {
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    return auto_memory_stream.hostGenerationOpen(context) || auto_memory_floor.assistantStillTyping(chat);
}

function ownerId() {
    if (!leaseOwner) leaseOwner = `tab-${Math.random().toString(36).slice(2, 10)}`;
    return leaseOwner;
}

function collectMemoryIds(context) {
    const memory = archive_repository.getImportedMemory(context);
    const rows = Array.isArray(memory?.memories) ? memory.memories : [];
    return rows.map(item => item?.id).filter(id => typeof id === 'string' && /^M\d{3,6}$/.test(id));
}

function randomUnit() {
    const cryptoObj = globalThis.crypto;
    if (typeof cryptoObj?.getRandomValues === 'function') {
        const buf = new Uint32Array(1);
        cryptoObj.getRandomValues(buf);
        return buf[0] / 4294967296;
    }
    return Math.random();
}

function nextDrawId() {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let suffix = '';
    for (let index = 0; index < 12; index += 1) suffix += alphabet[Math.floor(randomUnit() * alphabet.length)];
    return 'draw' + suffix;
}

function satisfiedPrerequisiteIds(context) {
    return auto_memory_host.roomReady(context) ? ['room'] : [];
}

function generationStillOpen(context) {
    return auto_memory_stream.generationOpen(context);
}

async function rememberTitle(context, result) {
    const wroteTitle = auto_memory_gap.rememberAchievementTitle(context?.chatMetadata, result?.achievement);
    let wroteLibrary = false;
    if (result?.action === 'reveal') {
        try {
            await core_cache.ensureCacheHydrated(context);
            wroteLibrary = auto_memory_library.saveAutoAchievement(context, result);
        } catch (error) {
            console.warn('[HeartbeatMemories] achievement library skipped', core_text.safeErrorDiagnostic(error));
        }
    }
    if (wroteLibrary || result?.action === 'achievement-pending') {
        auto_memory_gap.clearPendingAchievement(context?.chatMetadata, result?.snapshot?.modulePlan?.drawId);
    }
    if (wroteTitle || wroteLibrary) context.saveMetadataDebounced?.();
}

function moduleLabel(moduleId) {
    return auto_memory_registry.autoMemoryModuleById(moduleId)?.title || '自动留忆';
}

function finishHostJob(job, result) {
    if (!job?.owned || !job.id) return;
    const moduleId = result?.snapshot?.modulePlan?.moduleId || '';
    const action = result?.action || 'failed';
    const detail = action === 'noop'
        ? '这一楼没有新的档案，所以没有重抽。'
        : action === 'hold'
            ? '接着写没完成的一轮。'
            : action === 'reuse'
                ? '接着写上一轮抽中的模块。'
                : action === 'failed'
                    ? '这一次没写完。可以再点补全。'
                    : action === 'drawn'
                        ? '抽中了，这一轮已经写上。'
                        : '这一楼先记着。';
    if (moduleId) ui_taskCenter.openAutoMemoryJob({ label: moduleLabel(moduleId), detail });
    ui_taskCenter.settleAutoMemoryJob(job.id, action === 'failed' ? 'failed' : 'done', detail);
}

async function withAutoMemoryJob(moduleId, detail, run) {
    const label = moduleLabel(moduleId);
    const job = ui_taskCenter.openAutoMemoryJob({ label, detail });
    if (!job.owned) return run();
    try {
        const result = await run();
        if (result?.action === 'idle') {
            ui_taskCenter.settleAutoMemoryJob(job.id, 'cancelled', '这一轮没有要补的内容。');
            return result;
        }
        const steps = result?.snapshot?.modulePlan?.steps || [];
        const failed = result !== true && (!result || result.action === 'failed' || steps.some(step => step.status === 'failed'));
        ui_taskCenter.settleAutoMemoryJob(job.id, failed ? 'failed' : 'done', failed ? '这一次没写完。可以再点补全。' : detail);
        return result;
    } catch (error) {
        ui_taskCenter.settleAutoMemoryJob(job.id, 'failed', '这一次没写完。可以再点补全。');
        console.warn('[HeartbeatMemories] auto memory job skipped', core_text.safeErrorDiagnostic(error));
        return { action: 'failed', error };
    }
}

// 计划最多 200 步。一次唤醒就把能写的都写完，不留到下一楼；失败或没有进展时停下，交给重试。
const PLAN_PASS_LIMIT = 200;

async function runPlanToEnd(snapshot, persist, context) {
    let current = snapshot;
    let result = null;
    for (let pass = 0; pass < PLAN_PASS_LIMIT; pass += 1) {
        result = await auto_memory_host.runModulePlan(current, persist, context, Date.now());
        await rememberTitle(context, result);
        current = result?.snapshot || current;
        if (result?.action !== 'saved' && result?.action !== 'expanded') break;
        const steps = current?.modulePlan?.steps || [];
        if (steps.some(step => step.status === 'failed')) break;
        if (!steps.some(step => step.status !== 'completed')) break;
    }
    return result;
}

async function runModule(snapshot, persist, context) {
    return withAutoMemoryJob(snapshot?.modulePlan?.moduleId, '抽中了这一轮，正在写。', async () => {
        const result = await runPlanToEnd(snapshot, persist, context);
        return followIfEnabled(context, result);
    });
}

function moduleStillOpen(result) {
    const steps = result?.snapshot?.modulePlan?.steps || [];
    return steps.some(step => step.status !== 'completed');
}

async function followIfEnabled(context, result) {
    const settings = core_settings.getPluginSettings();
    if (settings.autoRetryEnabled !== true || autoRepairInflight) return result;
    const limit = Math.max(1, Math.min(5, Math.floor(Number(settings.autoRetryCount)) || 1));
    autoRepairInflight = true;
    let current = result;
    try {
        while (current?.action === 'achievement-pending' || moduleStillOpen(current)) {
            const drawId = current.snapshot?.modulePlan?.drawId || current.reveal?.id || 'round';
            const kind = current.action === 'achievement-pending' ? 'achievement' : 'module';
            const key = `${drawId}|${kind}`;
            const used = autoUsed.get(key) || 0;
            if (!auto_memory_redo.shouldAutoRepair({ enabled: true, used, limit })) break;
            autoUsed.set(key, used + 1);
            const next = kind === 'achievement'
                ? await repairFloorAchievement(context)
                : await resumeFloorPlan();
            if (!next || next.action === 'failed') {
                if (!auto_memory_redo.retryableFailure(next?.error)) autoUsed.set(key, limit);
                if (next?.action === 'failed') continue;
                break;
            }
            current = next;
        }
    } finally {
        autoRepairInflight = false;
    }
    return current;
}

async function persistSnapshot(context, next) {
    const metadata = context.chatMetadata;
    const current = auto_memory_plan.readAutoMemoryMetadata(metadata);
    auto_memory_plan.commitAutoMemoryMetadata(metadata, next, current ? current.plan.revision : 0);
    await context.saveMetadataDebounced?.();
    try {
        const chatId = core_context.getChatId(context);
        const recovery = await auto_memory_plan.readAutoMemoryRecovery(chatId);
        const expected = recovery ? recovery.revision : 0;
        if (next.plan.revision === expected + 1) await auto_memory_plan.writeAutoMemoryRecovery(chatId, next, expected);
    } catch { /* 聊天记录已经写下。备份写失败时不改主档。 */ }
}

async function writeGap(context, note) {
    const metadata = context.chatMetadata;
    if (!metadata) return;
    if (!note) delete metadata[auto_memory_gap.GAP_KEY];
    else {
        const latestFloor = core_settings.getPluginSettings().autoMemoryLatestFloor === true;
        const interval = auto_memory_plan.readAutoMemoryMetadata(metadata)?.plan?.intervalFloors || 5;
        let stored = note;
        if (latestFloor && note.windowStart && note.windowEnd) {
            const mapped = auto_memory_floor.chatRangeForAssistantSpan(context.chat, note.windowStart, note.windowEnd);
            if (mapped) stored = { ...note, windowStart: mapped.start, windowEnd: mapped.end, latestAssistant: true, interval };
        }
        metadata[auto_memory_gap.GAP_KEY] = stored;
    }
    await context.saveMetadataDebounced?.();
}

function gapMessages(context, note) {
    const start = Math.floor(Number(note?.windowStart));
    const end = Math.floor(Number(note?.windowEnd));
    if (start < 1 || end < start) return [];
    const rows = chat_read_range.selectChatReadRange(context, { mode: 'range', start, end, includeHidden: false }).map(row => ({
        index: row.index,
        role: row.message?.is_user === true ? 'user' : 'char',
        name: core_text.normalizeText(row.message?.name, 120),
        text: String(row.message?.mes ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim(),
    })).filter(item => item.text);
    if (note.latestAssistant === true) return auto_memory_floor.latestAssistantWindow(rows, note.interval);
    return rows;
}

async function runHostRound() {
    let context;
    try { context = core_context.getContext(); }
    catch { return; }
    const notice = auto_memory_lease.groupChatNotice(context);
    if (notice) {
        const group = String(context.groupId);
        if (!noticedGroups.has(group)) {
            noticedGroups.add(group);
            globalThis.toastr?.info?.(notice, '心迹回廊');
        }
        return;
    }
    try { context = core_context.currentCharacterGuard(); }
    catch { return; }
    if (!auto_memory_floor.assistantBodyReady(context.chat, { generating: generationStillOpen(context) })) {
        ui_countdown.refreshAutoMemoryCountdown();
        return;
    }
    if (redoInflight) return;
    const metadata = context.chatMetadata;
    if (!metadata || !Object.prototype.hasOwnProperty.call(metadata, auto_memory_plan.AUTO_MEMORY_PLAN_KEY)) return;
    const scope = core_context.chatScopeKey(context);
    const latestFloor = core_settings.getPluginSettings().autoMemoryLatestFloor === true;
    const floor = latestFloor
        ? auto_memory_floor.assistantFloorCount(context.chat)
        : (Array.isArray(context.chat) ? context.chat.length : 0);
    if (handledFloors.get(scope) === floor || inflightScopes.has(scope)) return;
    const body = async claim => {
        if (handledFloors.get(scope) === floor || inflightScopes.has(scope)) return;
        inflightScopes.add(scope);
        try {
            let snapshot;
            try { snapshot = auto_memory_plan.readAutoMemoryMetadata(metadata); }
            catch (error) {
                if (auto_memory_gate.roundGuard(error)) return;
                throw error;
            }
            if (!snapshot?.plan.enabled) return;
            if (claim?.takeover && auto_memory_lease.takeoverDecision(snapshot) === 'skip') {
                handledFloors.set(scope, floor);
                return;
            }
            const live = core_context.currentCharacterGuard();
            if (core_context.chatScopeKey(live) !== scope) return;
            const persist = next => persistSnapshot(context, next);
            const due = snapshot.plan.nextDueFloor == null ? false : floor >= snapshot.plan.nextDueFloor;
            const continuing = auto_memory_gate.modulePlanOpen(snapshot.modulePlan);
            const hostJob = due || continuing
                ? ui_taskCenter.openAutoMemoryJob({
                    label: '自动留忆',
                    detail: continuing && due
                        ? '上一轮没写完，这一楼到点了，重新抽。'
                        : continuing
                            ? '接着写没完成的一轮。'
                            : '这一楼到点了，正在抽签。',
                })
                : { id: '', owned: false };
            let result;
            try {
            result = await auto_memory_gate.runAutoMemoryRound({
                snapshot, floor, memoryIds: collectMemoryIds(live), seenFloor: handledFloors.get(scope), now: Date.now(),
                satisfiedPrerequisiteIds: satisfiedPrerequisiteIds(live),
                archiveRevision: archive_repository.getImportedMemory(live)?.archiveRevision || 'current',
                chatId: core_context.getChatId(live),
            }, {
                importIncremental: options => {
                    const window = options?.floorWindow;
                    if (!latestFloor || !window) return archive_repository.importCurrentChatMemory(options);
                    const mapped = auto_memory_floor.chatRangeForAssistantSpan(live.chat, window.start, window.end);
                    const floorWindow = mapped
                        ? { ...mapped, latestAssistant: true, interval: snapshot.plan.intervalFloors }
                        : { ...window, latestAssistant: true, interval: snapshot.plan.intervalFloors };
                    return archive_repository.importCurrentChatMemory({ ...options, floorWindow });
                },
                readMemoryIds: () => collectMemoryIds(core_context.currentCharacterGuard()),
                random: randomUnit,
                nextId: nextDrawId,
                prepareModulePlan: async request => {
                    const item = auto_memory_registry.autoMemoryModuleById(request.moduleId);
                    const facts = auto_memory_host.collectModuleFacts(request.moduleId, core_context.currentCharacterGuard(), request);
                    return item?.plan?.(facts) || null;
                },
                persist,
                noteGap: note => writeGap(live, note),
                startModule: next => runModule(next, persist, core_context.currentCharacterGuard()),
                resumeModule: current => runModule(current, persist, core_context.currentCharacterGuard()),
            });
            if (['arm', 'noop', 'drawn', 'reuse', 'failed', 'wait'].includes(result.action)) {
                handledFloors.set(scope, floor);
            }
            if (result.action === 'drawn' || result.action === 'reuse') stampDrawSource(context, result.drawId);
            ui_countdown.refreshAutoMemoryCountdown();
            finishHostJob(hostJob, result);
            } catch (error) {
                finishHostJob(hostJob, { action: 'failed' });
                console.warn('[HeartbeatMemories] due floor skipped', core_text.safeErrorDiagnostic(error));
                globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊');
            }
        } finally {
            inflightScopes.delete(scope);
        }
    };
    const locks = globalThis.navigator?.locks;
    if (typeof locks?.request === 'function') {
        await auto_memory_gate.withAutoMemoryLock(locks, scope, () => body(null));
        return;
    }
    let claim = null;
    const compare = (key, decide) => auto_memory_plan.compareAutoMemoryRecord(key, decide);
    try {
        claim = await auto_memory_lease.claimWith(compare, {
            chatId: core_context.getChatId(context),
            dueFloor: floor,
            archiveRevision: archive_repository.getImportedMemory(context)?.archiveRevision || 'current',
            owner: ownerId(),
        }, Date.now());
    } catch { claim = null; }
    if (claim && claim.granted !== true) return;
    const timer = claim?.granted ? setInterval(() => {
        void auto_memory_lease.renewWith(compare, claim.lease, Date.now()).catch(() => {});
    }, auto_memory_lease.LEASE_HEARTBEAT_MS) : 0;
    try { await body(claim); }
    finally {
        if (timer) clearInterval(timer);
        if (claim?.granted) await auto_memory_lease.releaseWith(compare, claim.lease).catch(() => {});
    }
}

export async function fillFloorGap() {
    if (fillInflight) return { action: 'busy' };
    fillInflight = true;
    try {
        const context = core_context.currentCharacterGuard();
        const note = context.chatMetadata?.[auto_memory_gap.GAP_KEY];
        const readable = auto_memory_gap.readableGap(note);
        if (!readable?.canFill) return { action: 'idle' };
        const messages = gapMessages(context, note);
        if (!messages.length) {
            context.chatMetadata[auto_memory_gap.GAP_KEY] = { ...note, filled: true };
            await context.saveMetadataDebounced?.();
            globalThis.toastr?.info?.('这一窗没有可以阅读的正文。', '心迹回廊');
            return { action: 'empty' };
        }
        const memory = archive_repository.getImportedMemory(context);
        if (!memory) return { action: 'idle' };
        const titles = (memory.memories || []).map(item => item?.title).filter(Boolean);
        const data = await generation_request.requestJson(
            auto_memory_gap.supplementPrompt(messages, titles),
            '看一下要不要补一条档案',
            { automatic: true, mode: 'archive', taskKey: `auto-memory-fill:${core_context.chatScopeKey(context)}` },
        );
        const item = auto_memory_gap.oneSupplementMemory(data, { start: note.windowStart, end: note.windowEnd });
        const before = new Set(collectMemoryIds(context));
        const memories = item ? archive_external.appendImportedMemoriesStable(memory.memories, [item]) : memory.memories;
        const added = (memories || []).map(row => row?.id).filter(id => /^M\d{3,6}$/.test(id) && !before.has(id));
        if (!added.length) {
            context.chatMetadata[auto_memory_gap.GAP_KEY] = { ...note, filled: true };
            await context.saveMetadataDebounced?.();
            globalThis.toastr?.info?.('看过这一窗，没有要补的档案。', '心迹回廊');
            return { action: 'empty' };
        }
        await core_cache.saveImportedMemory(context, { ...memory, memories }, memory.chatId, {
            preserveDerivedCache: true,
            expectedPreviousArchiveState: { present: true, revision: memory.archiveRevision || '' },
        });
        delete context.chatMetadata[auto_memory_gap.GAP_KEY];
        await context.saveMetadataDebounced?.();
        const snapshot = auto_memory_plan.readAutoMemoryMetadata(context.chatMetadata);
        const live = core_context.currentCharacterGuard();
        const persist = next => persistSnapshot(live, next);
        const drawn = await auto_memory_gate.drawKnownMemories({
            snapshot, freshIds: added, floor: note.floor, now: Date.now(),
            satisfiedPrerequisiteIds: satisfiedPrerequisiteIds(live),
            archiveRevision: archive_repository.getImportedMemory(live)?.archiveRevision || 'current',
            chatId: core_context.getChatId(live),
        }, {
            persist,
            noteGap: () => writeGap(live, null),
            random: randomUnit,
            nextId: nextDrawId,
            prepareModulePlan: async request => {
                const moduleItem = auto_memory_registry.autoMemoryModuleById(request.moduleId);
                const facts = auto_memory_host.collectModuleFacts(request.moduleId, core_context.currentCharacterGuard(), request);
                return moduleItem?.plan?.(facts) || null;
            },
            startModule: next => runModule(next, persist, core_context.currentCharacterGuard()),
        });
        globalThis.toastr?.success?.(added.length ? `补上了 ${added[0]}。` : '这一窗已经看过。', '心迹回廊');
        ui_countdown.refreshAutoMemoryCountdown();
        return drawn;
    } catch (error) {
        console.warn('[HeartbeatMemories] gap fill skipped', core_text.safeErrorDiagnostic(error));
        globalThis.toastr?.error?.('这一次没能补上。档案还在，可以再点一次补。', '心口顿了一下');
        return { action: 'failed' };
    } finally {
        fillInflight = false;
    }
}

function currentPlanFloor(context, latestFloor) {
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    return latestFloor === true ? auto_memory_floor.assistantFloorCount(chat) : chat.length;
}

function queueFloorRecovery(kind) {
    floorRecovery = kind;
    return { action: 'wait' };
}

async function retryDueFloor(context) {
    const scope = core_context.chatScopeKey(context);
    handledFloors.delete(scope);
    await runHostRound();
    return { action: 'due-retry' };
}

export async function completeFloorRound() {
    const context = core_context.currentCharacterGuard();
    if (redoInflight) return { action: 'busy' };
    if (storyStillWriting(context)) return queueFloorRecovery('complete');
    const latest = core_settings.getPluginSettings().autoMemoryLatestFloor === true;
    const snapshot = auto_memory_plan.readAutoMemoryMetadata(context.chatMetadata);
    if (auto_memory_gate.shouldRetryDueRound(snapshot, currentPlanFloor(context, latest))) return retryDueFloor(context);
    const rewritten = await rerollOwnedFloor(null);
    if (rewritten) return { action: 'rerolled' };
    if (snapshot?.modulePlan?.steps?.length) return resumeFloorPlan();
    return regenerateCurrentMemory({ mode: 'keep' });
}

export async function retryFloorRound() {
    const context = core_context.currentCharacterGuard();
    if (redoInflight) return { action: 'busy' };
    if (storyStillWriting(context)) return queueFloorRecovery('redo');
    const latest = core_settings.getPluginSettings().autoMemoryLatestFloor === true;
    const snapshot = auto_memory_plan.readAutoMemoryMetadata(context.chatMetadata);
    if (auto_memory_gate.shouldRetryDueRound(snapshot, currentPlanFloor(context, latest))) return retryDueFloor(context);
    const rewritten = await rerollOwnedFloor(null);
    if (rewritten) return { action: 'rerolled' };
    return regenerateCurrentMemory({ mode: 'keep' });
}

export async function failStalledFloor() {
    if (redoInflight) return { action: 'busy' };
    let context;
    try { context = core_context.currentCharacterGuard(); }
    catch { return { action: 'idle' }; }
    if (storyStillWriting(context)) return { action: 'idle' };
    const snapshot = auto_memory_plan.readAutoMemoryMetadata(context.chatMetadata);
    const steps = snapshot?.modulePlan?.steps || [];
    if (!steps.length || steps.some(step => step.status === 'failed') || steps.every(step => step.status === 'completed')) return { action: 'idle' };
    const index = steps.findIndex(step => step.status === 'pending' || step.status === 'running');
    if (index < 0) return { action: 'idle' };
    const modulePlan = auto_memory_plan.parseModulePlan({
        ...snapshot.modulePlan,
        steps: steps.map((step, stepIndex) => stepIndex === index ? { ...step, status: 'failed' } : step),
    });
    const next = auto_memory_plan.parseAutoMemorySnapshot({
        plan: auto_memory_plan.parseAutoMemoryPlan({
            ...snapshot.plan,
            revision: snapshot.plan.revision + 1,
            updatedAt: Date.now(),
        }),
        revealRecords: snapshot.revealRecords,
        drawTickets: snapshot.drawTickets,
        modulePlan,
    });
    await persistSnapshot(context, next);
    return { action: 'failed' };
}

async function resumeFloorPlanOnce(context) {
    const snapshot = auto_memory_plan.readAutoMemoryMetadata(context.chatMetadata);
    if (!snapshot?.modulePlan) return { action: 'idle' };
    return withAutoMemoryJob(snapshot.modulePlan.moduleId, '接着写没完成的部分。', async () => {
        // 写完却没结算的一轮只补结算，不把最后一步重发一遍。
        const unsettled = snapshot.plan.activeDrawTicketId === snapshot.modulePlan.drawId
            && snapshot.modulePlan.steps.every(step => step.status === 'completed');
        const retryPlan = unsettled
            ? snapshot.modulePlan
            : auto_memory_plan.parseModulePlan(auto_memory_redo.modulePlanForRetry(snapshot.modulePlan));
        const prepared = auto_memory_plan.parseAutoMemorySnapshot({ ...snapshot, modulePlan: retryPlan });
        const persist = next => persistSnapshot(context, next);
        const result = await runPlanToEnd(prepared, persist, context);
        ui_countdown.refreshAutoMemoryCountdown();
        return followIfEnabled(context, result);
    });
}

export async function resumeFloorPlan() {
    const context = core_context.currentCharacterGuard();
    if (redoInflight) return { action: 'busy' };
    if (storyStillWriting(context)) return queueFloorRecovery('retry');
    try {
        return await resumeFloorPlanOnce(context);
    } catch (error) {
        if (error?.code !== 'RMT_AUTO_MEMORY_STALE') throw error;
        return resumeFloorPlanOnce(core_context.currentCharacterGuard());
    }
}

export async function repairFloorAchievement(context = core_context.currentCharacterGuard()) {
    const snapshot = auto_memory_plan.readAutoMemoryMetadata(context.chatMetadata);
    const reveal = auto_memory_redo.pendingReveal(snapshot);
    if (!reveal) return { action: 'idle', requests: 0 };
    const item = auto_memory_registry.autoMemoryModuleById(reveal.moduleId);
    const prompt = auto_memory_redo.achievementRepairPrompt({
        moduleTitle: item?.title || reveal.moduleId,
        sourceMemoryIds: reveal.sourceMemoryIds,
        allowHistorical: item?.contentKind === 'historical',
    });
    let packet = null;
    try {
        const raw = await generation_request.requestJson(prompt, '补这一份成就', {
            mode: 'auto-memory',
            taskKey: `auto-memory-achievement:${reveal.id}`,
        });
        packet = auto_memory_redo.achievementPacket(raw);
    } catch (error) {
        return { action: 'failed', requests: 1, error, snapshot };
    }
    const replaced = auto_memory_combined.replacePendingAchievement({
        snapshot,
        revealId: reveal.id,
        packet,
        allowHistorical: item?.contentKind === 'historical',
        sourceMemoryIds: reveal.sourceMemoryIds,
        now: Date.now(),
    });
    if (replaced.snapshot && replaced.snapshot !== snapshot) await persistSnapshot(context, replaced.snapshot);
    await rememberTitle(context, replaced);
    ui_countdown.refreshAutoMemoryCountdown();
    return replaced;
}

export async function automaticRepairIfNeeded() {
    if (autoRepairInflight || redoInflight) return false;
    if (core_settings.getPluginSettings().autoRetryEnabled !== true) return false;
    let context;
    try { context = core_context.currentCharacterGuard(); }
    catch { return false; }
    const snapshot = auto_memory_plan.readAutoMemoryMetadata(context.chatMetadata);
    if (!snapshot) return false;
    const pending = auto_memory_redo.pendingReveal(snapshot);
    const steps = snapshot.modulePlan?.steps || [];
    const running = steps.some(step => step.status === 'running');
    const incomplete = steps.some(step => step.status !== 'completed');
    if (running || (!pending && !incomplete)) return false;
    const seed = pending && !incomplete
        ? { action: 'achievement-pending', reveal: pending, snapshot }
        : { action: 'saved', snapshot };
    const followed = await followIfEnabled(context, seed);
    return followed !== seed;
}

function stampDrawSource(context, drawId) {
    if (!context?.chatMetadata || !drawId) return;
    const snapshot = auto_memory_plan.readAutoMemoryMetadata(context.chatMetadata);
    const ticket = (snapshot?.drawTickets || []).find(item => item.id === drawId) || auto_memory_redo.currentDrawTicket(snapshot);
    if (!ticket) return;
    const latest = core_settings.getPluginSettings().autoMemoryLatestFloor === true;
    const stamp = auto_memory_redo.sourceStamp(context.chat, ticket.dueFloor, latest, ticket.id);
    if (!stamp) return;
    context.chatMetadata[auto_memory_redo.SOURCE_STAMP_KEY] = stamp;
    context.saveMetadataDebounced?.();
}

function lastStoryIndex(chat) {
    const list = Array.isArray(chat) ? chat : [];
    for (let index = list.length - 1; index >= 0; index -= 1) {
        const message = list[index];
        if (!message || message.is_system === true) continue;
        if (message.is_user === true) return -1;
        return index;
    }
    return -1;
}

async function noteSwipedFloor(messageId) {
    const index = Number(messageId);
    if (!Number.isInteger(index) || index < 0 || redoInflight || autoRepairInflight) return;
    if (generationStillOpen()) {
        sameFloor.mark('swipe');
        return;
    }
    await rerollOwnedFloor(index);
}

// 抽签那一楼的正文被重 roll 或切 swipe 后：先撤回这一轮写过的回忆，再按新正文重写。间隔不往前走。
async function rerollOwnedFloor(messageIndex) {
    if (redoInflight || autoRepairInflight) return false;
    let context;
    try { context = core_context.currentCharacterGuard(); }
    catch { return false; }
    let snapshot;
    try { snapshot = auto_memory_plan.readAutoMemoryMetadata(context.chatMetadata); }
    catch { return false; }
    const ticket = auto_memory_redo.currentDrawTicket(snapshot);
    const modulePlan = snapshot?.modulePlan;
    if (!snapshot?.plan?.enabled || !ticket || !modulePlan || modulePlan.drawId !== ticket.id) return false;
    const latest = core_settings.getPluginSettings().autoMemoryLatestFloor === true;
    const located = auto_memory_redo.drawFloorMessage(context.chat, ticket.dueFloor, latest);
    if (!located) return false;
    const index = messageIndex == null ? lastStoryIndex(context.chat) : messageIndex;
    if (index !== located.index) return false;
    const hash = auto_memory_redo.bodyHash(located.message?.mes);
    const stamp = context.chatMetadata?.[auto_memory_redo.SOURCE_STAMP_KEY] || null;
    if (!auto_memory_redo.swipeNeedsRegenerate({
        stamp, messageIndex: index, hash, ticketMessageIndex: located.index,
    })) return false;
    if (storyStillWriting(context)) return false;
    redoInflight = true;
    const oldIds = [...(ticket.sourceMemoryIds || [])];
    try {
        const outcome = await withAutoMemoryJob(modulePlan.moduleId, '按新正文重写这一轮。', async () => {
        context.chatMetadata[auto_memory_redo.SOURCE_STAMP_KEY] = {
            drawId: ticket.id,
            dueFloor: ticket.dueFloor,
            latestAssistant: latest,
            messageIndex: index,
            hash,
        };
        const memory = archive_repository.getImportedMemory(context);
        const session = core_cache.loadSession(modulePlan.moduleId, { context, memoryBank: memory, clone: true });
        const reveal = [...(snapshot.revealRecords || [])].reverse().find(row => row.moduleId === modulePlan.moduleId
            && (oldIds.length ? (row.sourceMemoryIds || []).some(id => oldIds.includes(id)) : row.createdAt >= (modulePlan.frozenAt || 0)));
        const stripped = session
            ? auto_memory_view.sessionWithoutRound(session, {
                sourceMemoryIds: oldIds,
                createdAt: reveal?.createdAt || 0,
                since: modulePlan.frozenAt || 0,
            })
            : null;
        auto_memory_library.dropAutoRound(context, { moduleId: modulePlan.moduleId, sourceMemoryIds: oldIds });
        const frozenAt = Date.now();
        const revealRecords = snapshot.revealRecords.filter(row => {
            if (row.moduleId !== modulePlan.moduleId) return true;
            const own = row.sourceMemoryIds || [];
            if (oldIds.length && own.some(id => oldIds.includes(id))) return false;
            if (modulePlan.frozenAt && row.createdAt >= modulePlan.frozenAt) return false;
            return true;
        });
        const withdrawn = auto_memory_plan.parseAutoMemorySnapshot({
            plan: auto_memory_plan.parseAutoMemoryPlan({
                ...snapshot.plan,
                revision: snapshot.plan.revision + 1,
                updatedAt: frozenAt,
                activeDrawTicketId: ticket.id,
            }),
            revealRecords,
            drawTickets: snapshot.drawTickets.map(row => (row.id === ticket.id
                ? auto_memory_plan.parseDrawTicket({ ...row, status: 'drawn' })
                : row)),
            modulePlan: auto_memory_plan.parseModulePlan(auto_memory_redo.resetModuleSteps({ ...modulePlan, frozenAt })),
        });
        await persistSnapshot(context, withdrawn);
        if (stripped) {
            stripped.chatId = core_context.getChatId(context);
            if (memory?.archiveRevision) stripped.archiveRevision = memory.archiveRevision;
            core_cache.saveSession(modulePlan.moduleId, stripped, stripped.chatId);
        }
        if (memory && oldIds.length) {
            const memories = auto_memory_redo.memoriesWithoutIds(memory.memories, oldIds);
            await core_cache.saveImportedMemory(context, { ...memory, memories }, memory.chatId, {
                preserveDerivedCache: true,
                expectedPreviousArchiveState: { present: true, revision: memory.archiveRevision || '' },
            });
        }
        const window = auto_memory_redo.rerollWindow(ticket.dueFloor, snapshot.plan.intervalFloors);
        const before = new Set(collectMemoryIds(context));
        if (window) {
            const options = auto_memory_draw.incrementalImportOptions(window);
            if (latest) {
                const mapped = auto_memory_floor.chatRangeForAssistantSpan(context.chat, window.start, window.end);
                options.floorWindow = mapped
                    ? { ...mapped, latestAssistant: true, interval: snapshot.plan.intervalFloors }
                    : { ...window, latestAssistant: true, interval: snapshot.plan.intervalFloors };
            }
            await archive_repository.importCurrentChatMemory(options);
        }
        const fresh = auto_memory_draw.newMemoryIds([...before], collectMemoryIds(context));
        const liveMemory = archive_repository.getImportedMemory(context);
        if (stripped) {
            stripped.chatId = core_context.getChatId(context);
            if (liveMemory?.archiveRevision) stripped.archiveRevision = liveMemory.archiveRevision;
            else delete stripped.archiveRevision;
            core_cache.saveSession(modulePlan.moduleId, stripped, stripped.chatId);
        }
        if (!fresh.length) {
            const idle = auto_memory_plan.parseAutoMemorySnapshot({
                plan: auto_memory_plan.parseAutoMemoryPlan({
                    ...withdrawn.plan,
                    revision: withdrawn.plan.revision + 1,
                    updatedAt: Date.now(),
                    activeDrawTicketId: null,
                }),
                revealRecords,
                drawTickets: withdrawn.drawTickets.map(row => (row.id === ticket.id
                    ? auto_memory_plan.parseDrawTicket({ ...row, status: 'completed' })
                    : row)),
                modulePlan: null,
            });
            await persistSnapshot(context, idle);
            globalThis.toastr?.info?.('这一楼的正文换了，旧回忆已经撤回。这一窗没有新的档案。', '心迹回廊');
            ui_countdown.refreshAutoMemoryCountdown();
            return true;
        }
        const next = auto_memory_plan.parseAutoMemorySnapshot({
            plan: auto_memory_plan.parseAutoMemoryPlan({
                ...withdrawn.plan,
                revision: withdrawn.plan.revision + 1,
                updatedAt: Date.now(),
                activeDrawTicketId: ticket.id,
            }),
            revealRecords,
            drawTickets: withdrawn.drawTickets.map(row => (row.id === ticket.id
                ? auto_memory_plan.parseDrawTicket({ ...row, sourceMemoryIds: fresh, status: 'drawn' })
                : row)),
            modulePlan: auto_memory_plan.parseModulePlan({
                ...withdrawn.modulePlan,
                sourceMemoryIds: fresh,
            }),
        });
        await persistSnapshot(context, next);
        const persist = step => persistSnapshot(context, step);
        const result = await runPlanToEnd(next, persist, context);
        ui_countdown.refreshAutoMemoryCountdown();
        await followIfEnabled(context, result);
        return result || true;
        });
        return outcome?.action === 'failed' ? true : !!outcome;
    } finally {
        redoInflight = false;
    }
}

async function installRedraw(context, snapshot, ticket, moduleId) {
    const item = auto_memory_registry.autoMemoryModuleById(moduleId);
    if (!item?.inDrawPool) return null;
    const facts = auto_memory_host.collectModuleFacts(moduleId, context, {
        chatId: core_context.getChatId(context),
        archiveRevision: ticket.archiveRevision,
        sourceMemoryIds: ticket.sourceMemoryIds,
        drawId: ticket.id,
    });
    const built = await item.plan?.(facts);
    if (!built?.steps?.length) return null;
    const modulePlan = auto_memory_plan.parseModulePlan(auto_memory_redo.resetModuleSteps({
        ...built,
        drawId: ticket.id,
        moduleId,
        sourceMemoryIds: ticket.sourceMemoryIds,
    }));
    const candidates = ticket.candidates.some(row => row.id === moduleId)
        ? ticket.candidates
        : [...ticket.candidates, { id: moduleId, weight: 1 }];
    const nextTicket = auto_memory_plan.parseDrawTicket({
        ...ticket, candidates, selectedModuleId: moduleId, status: 'drawn',
    });
    return auto_memory_plan.parseAutoMemorySnapshot({
        plan: auto_memory_plan.parseAutoMemoryPlan({
            ...snapshot.plan,
            revision: snapshot.plan.revision + 1,
            updatedAt: Date.now(),
            activeDrawTicketId: ticket.id,
        }),
        revealRecords: snapshot.revealRecords,
        drawTickets: snapshot.drawTickets.map(row => (row.id === ticket.id ? nextTicket : row)),
        modulePlan,
    });
}

export async function regenerateCurrentMemory({ mode = 'keep', moduleId = '' } = {}) {
    if (redoInflight) return { action: 'busy' };
    redoInflight = true;
    try {
        const context = core_context.currentCharacterGuard();
        const snapshot = auto_memory_plan.readAutoMemoryMetadata(context.chatMetadata);
        const ticket = auto_memory_redo.currentDrawTicket(snapshot);
        if (!snapshot?.plan?.enabled || !ticket) return { action: 'idle' };
        let selected = ticket.selectedModuleId;
        if (mode === 'redraw') {
            const live = auto_memory_registry.autoMemoryRuntimeCandidates(snapshot.plan.preferredModuleIds, snapshot.plan.excludedModuleIds);
            const pool = live.length ? live.map(id => ({ id })) : ticket.candidates;
            selected = auto_memory_redo.redrawModuleId(pool, ticket.selectedModuleId, randomUnit());
        } else if (mode === 'pick') {
            const allowed = auto_memory_redo.choosableModules(auto_memory_registry.listAutoMemoryModules());
            if (!allowed.some(item => item.id === moduleId)) return { action: 'idle' };
            selected = moduleId;
        }
        if (!selected) return { action: 'idle' };
        return await withAutoMemoryJob(selected, '补上没写完的这一轮。', async () => {
        const keepPlan = mode === 'keep' && snapshot.modulePlan?.drawId === ticket.id
            ? auto_memory_plan.parseModulePlan(auto_memory_redo.resetModuleSteps(snapshot.modulePlan))
            : null;
        const next = keepPlan
            ? auto_memory_plan.parseAutoMemorySnapshot({
                plan: auto_memory_plan.parseAutoMemoryPlan({
                    ...snapshot.plan,
                    revision: snapshot.plan.revision + 1,
                    updatedAt: Date.now(),
                    activeDrawTicketId: ticket.id,
                }),
                revealRecords: snapshot.revealRecords,
                drawTickets: snapshot.drawTickets.map(row => (row.id === ticket.id
                    ? auto_memory_plan.parseDrawTicket({ ...row, status: 'drawn' })
                    : row)),
                modulePlan: keepPlan,
            })
            : await installRedraw(context, snapshot, ticket, selected);
        if (!next) return { action: 'idle' };
        const persist = step => persistSnapshot(context, step);
        await persist(next);
        stampDrawSource(context, ticket.id);
        const result = await runPlanToEnd(next, persist, context);
        ui_countdown.refreshAutoMemoryCountdown();
        return followIfEnabled(context, result);
        });
    } catch (error) {
        console.warn('[HeartbeatMemories] memory redo skipped', core_text.safeErrorDiagnostic(error));
        return { action: 'failed', error };
    } finally {
        redoInflight = false;
    }
}

export function stopAutoMemoryScheduler() {
    cleanup?.();
    cleanup = null;
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = 0;
    stablePasses = 0;
    settleWaits = 0;
    lastSignature = '';
    auto_memory_stream.noteAssistantStream(false);
    sameFloor.clear();
    floorRecovery = '';
    handledFloors.clear();
    inflightScopes.clear();
    noticedGroups.clear();
    autoUsed.clear();
}

function scheduleSettledRound() {
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = setTimeout(() => {
        quietTimer = 0;
        let context = null;
        try { context = core_context.getContext(); } catch { context = null; }
        const chat = Array.isArray(context?.chat) ? context.chat : [];
        const last = [...chat].reverse().find(item => item && item.is_system !== true);
        const signature = !last || last.is_user === true ? 'user' : `${String(last.mes ?? '').length}:${String(last.mes ?? '').slice(-24)}`;
        if (storyStillWriting(context)) {
            stablePasses = 0;
            lastSignature = signature;
            settleWaits += 1;
            if (settleWaits > 400) {
                settleWaits = 0;
                return;
            }
            scheduleSettledRound();
            return;
        }
        const ready = auto_memory_floor.assistantBodyReady(chat, { generating: false });
        if (auto_memory_stream.assistantStreamLatched()) {
            if (signature && signature === lastSignature && ready) stablePasses += 1;
            else stablePasses = 0;
            lastSignature = signature;
            if (stablePasses < 2) {
                settleWaits += 1;
                if (settleWaits > 40 && !ready) {
                    settleWaits = 0;
                    auto_memory_stream.noteAssistantStream(false);
                    return;
                }
                scheduleSettledRound();
                return;
            }
            auto_memory_stream.noteAssistantStream(false);
        }
        stablePasses = 0;
        settleWaits = 0;
        lastSignature = signature;
        if (!ready) return;
        void settleReadyRound();
    }, 800);
}

async function stripLostRound(context, { moduleId = '', sourceMemoryIds = [], createdAt = 0, frozenAt = 0, messageIndex = null } = {}) {
    const oldIds = [...(Array.isArray(sourceMemoryIds) ? sourceMemoryIds : [])].filter(id => /^M\d{3,6}$/.test(id));
    let memory = null;
    try { memory = archive_repository.getImportedMemory(context); } catch { memory = null; }
    const session = moduleId ? core_cache.loadSession(moduleId, { context, memoryBank: memory, clone: true }) : null;
    const stripped = session
        ? auto_memory_view.sessionWithoutRound(session, {
            sourceMemoryIds: oldIds,
            createdAt: createdAt || 0,
            since: frozenAt || 0,
        })
        : null;
    auto_memory_library.dropAutoRound(context, { moduleId, sourceMemoryIds: oldIds, messageIndex });
    if (stripped) {
        stripped.chatId = core_context.getChatId(context);
        if (memory?.archiveRevision) stripped.archiveRevision = memory.archiveRevision;
        core_cache.saveSession(moduleId, stripped, stripped.chatId);
    }
    if (memory && oldIds.length) {
        const memories = auto_memory_redo.memoriesWithoutIds(memory.memories, oldIds);
        await core_cache.saveImportedMemory(context, { ...memory, memories }, memory.chatId, {
            preserveDerivedCache: true,
            expectedPreviousArchiveState: { present: true, revision: memory.archiveRevision || '' },
        });
    }
}

async function sweepLostLetters(context) {
    if (!context?.chatMetadata || storyStillWriting(context) || generationStillOpen(context)) return false;
    let snapshot;
    try { snapshot = auto_memory_plan.readAutoMemoryMetadata(context.chatMetadata); }
    catch { return false; }
    if (!snapshot?.plan?.enabled) return false;
    let latest = false;
    try { latest = core_settings.getPluginSettings().autoMemoryLatestFloor === true; }
    catch { latest = false; }
    const stamp = context.chatMetadata?.[auto_memory_redo.SOURCE_STAMP_KEY] || null;
    const lost = [];
    for (const reveal of snapshot.revealRecords || []) {
        const ticket = auto_memory_redo.ticketMatchingReveal(snapshot, reveal);
        const mesid = auto_memory_redo.ticketLetterMesid(context.chat, ticket, latest, stamp);
        if (mesid == null || !auto_memory_redo.letterBodyGone(context.chat, mesid)) continue;
        lost.push({
            reveal,
            ticket,
            mesid,
            sourceMemoryIds: ticket?.sourceMemoryIds || reveal.sourceMemoryIds || [],
        });
    }
    let memory = null;
    try { memory = archive_repository.getImportedMemory(context); } catch { memory = null; }
    const library = core_cache.loadSession(core_constants.MODE.ACHIEVEMENTS, { context, memoryBank: memory, clone: true });
    const covered = new Set(lost.map(row => row.mesid));
    for (const entry of Array.isArray(library?.entries) ? library.entries : []) {
        if (entry?.origin !== 'auto') continue;
        const mesid = auto_memory_lookback.autoLetterMesid(entry, {
            snapshot,
            chat: context.chat,
            latestFloor: latest,
            locate: auto_memory_redo.drawFloorMessage,
        }) ?? (Number.isSafeInteger(Math.floor(Number(entry.messageIndex))) ? Math.floor(Number(entry.messageIndex)) : null);
        if (mesid == null || covered.has(mesid) || !auto_memory_lookback.autoLetterOrphaned(entry, context.chat, { messageIndex: mesid })) continue;
        lost.push({
            reveal: null,
            ticket: null,
            mesid,
            moduleId: entry.moduleId,
            sourceMemoryIds: entry.sourceMemoryIds || [],
        });
        covered.add(mesid);
    }
    if (!lost.length) return false;
    for (const row of lost) {
        await stripLostRound(context, {
            moduleId: row.ticket?.selectedModuleId || row.reveal?.moduleId || row.moduleId || '',
            sourceMemoryIds: row.sourceMemoryIds,
            createdAt: row.reveal?.createdAt || 0,
            frozenAt: snapshot.modulePlan?.drawId === row.ticket?.id ? snapshot.modulePlan.frozenAt : 0,
            messageIndex: row.mesid,
        });
    }
    const dropReveal = new Set(lost.map(row => row.reveal?.id).filter(Boolean));
    const dropTicket = new Set(lost.map(row => row.ticket?.id).filter(Boolean));
    const clearActive = dropTicket.has(snapshot.plan.activeDrawTicketId);
    const next = auto_memory_plan.parseAutoMemorySnapshot({
        plan: auto_memory_plan.parseAutoMemoryPlan({
            ...snapshot.plan,
            revision: snapshot.plan.revision + 1,
            updatedAt: Date.now(),
            activeDrawTicketId: clearActive ? null : snapshot.plan.activeDrawTicketId,
        }),
        revealRecords: snapshot.revealRecords.filter(row => !dropReveal.has(row.id)),
        drawTickets: snapshot.drawTickets.map(row => (dropTicket.has(row.id)
            ? auto_memory_plan.parseDrawTicket({ ...row, status: 'completed' })
            : row)),
        modulePlan: clearActive ? null : snapshot.modulePlan,
    });
    await persistSnapshot(context, next);
    try { ui_taskCenter.clearAutoMemoryFloorFailure(); } catch { /* 任务条稍后还会刷。 */ }
    globalThis.toastr?.info?.('这一楼的正文已经没了，那一轮的回忆和成就一起收走了。', '心迹回廊');
    return true;
}

async function settleReadyRound() {
    let context = null;
    try { context = core_context.getContext(); } catch { context = null; }
    if (storyStillWriting(context)) {
        scheduleSettledRound();
        return;
    }
    if (await sweepLostLetters(context)) ui_countdown.refreshAutoMemoryCountdown();
    if (!auto_memory_floor.assistantBodyReady(context?.chat, { generating: false })) return;
    if (sameFloor.pending()) {
        if (redoInflight || inflightScopes.size) {
            scheduleSettledRound();
            return;
        }
        const ran = await rerollOwnedFloor(null);
        sameFloor.consume();
        floorRecovery = '';
        if (ran) return;
    }
    const recovery = floorRecovery;
    floorRecovery = '';
    if (recovery === 'retry') {
        await resumeFloorPlan();
        return;
    }
    if (recovery === 'redo') {
        await retryFloorRound();
        return;
    }
    if (recovery === 'complete') {
        await completeFloorRound();
        return;
    }
    void runHostRound();
}

export function startAutoMemoryScheduler() {
    stopAutoMemoryScheduler();
    let context;
    try { context = core_context.getContext(); }
    catch { return; }
    const source = context?.eventSource;
    const types = context?.eventTypes || context?.event_types || {};
    if (!source?.on) return;
    const events = [...new Set([
        types.MESSAGE_SENT,
        types.MESSAGE_RECEIVED,
        types.MESSAGE_UPDATED,
        types.GENERATION_STARTED,
        types.GENERATION_ENDED,
        types.GENERATION_STOPPED,
        types.STREAM_TOKEN_RECEIVED,
        types.STREAM_TOKEN_RECEIVED_FULLY,
        types.CHARACTER_MESSAGE_RENDERED,
        types.MESSAGE_DELETED,
        types.CHAT_CHANGED,
        types.CHAT_LOADED,
    ].filter(Boolean))];
    const listener = (type, ...args) => {
        const starting = type === types.GENERATION_STARTED || type === types.STREAM_TOKEN_RECEIVED || type === types.STREAM_TOKEN_RECEIVED_FULLY;
        const ended = type === types.GENERATION_ENDED || type === types.GENERATION_STOPPED;
        if (type === types.GENERATION_STOPPED) {
            sameFloor.clear();
            floorRecovery = '';
        }
        if (type === types.GENERATION_STARTED && args[2] !== true && !redoInflight) sameFloor.mark(args[0]);
        if (starting) {
            auto_memory_stream.noteAssistantStream(true);
            stablePasses = 0;
            settleWaits = 0;
            scheduleSettledRound();
            return;
        }
        if (ended) auto_memory_stream.noteAssistantStream(false);
        if (auto_memory_stream.assistantStreamLatched()) return;
        scheduleSettledRound();
    };
    const bound = new Map();
    for (const type of events) {
        const handler = (...args) => listener(type, ...args);
        bound.set(type, handler);
        source.on(type, handler);
    }
    if (types.MESSAGE_SWIPED) {
        const swiped = messageId => { void noteSwipedFloor(messageId); };
        bound.set(types.MESSAGE_SWIPED, swiped);
        source.on(types.MESSAGE_SWIPED, swiped);
    }
    cleanup = () => { for (const [type, handler] of bound) source.off?.(type, handler); };
    if (!auto_memory_stream.generationOpen(context)) scheduleSettledRound();
}
