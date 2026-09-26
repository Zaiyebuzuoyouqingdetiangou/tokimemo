// 启用新计划后，楼层到点就读最近这一窗正文，做成增量回忆再抽签。没有新记忆或没有可抽模块时不发模块请求。
import * as archive_external from '../archive/externalMemory.js';
import * as archive_repository from '../archive/repository.js';
import * as auto_memory_floor from './floorPace.js';
import * as auto_memory_gap from './gapFill.js';
import * as auto_memory_gate from './incrementalGate.js';
import * as auto_memory_host from './moduleHost.js';
import * as auto_memory_lease from './instanceLease.js';
import * as auto_memory_plan from './planStore.js';
import * as auto_memory_registry from './moduleRegistry.js';
import * as chat_read_range from '../core/chatReadRange.js';
import * as core_cache from '../core/cache.js';
import * as core_context from '../core/context.js';
import * as core_settings from '../core/settings.js';
import * as core_text from '../core/text.js';
import * as generation_request from '../generation/generationRequest.js';
import * as ui_countdown from '../ui/autoMemoryCountdown.js';

let cleanup = null;
let leaseOwner = '';
let fillInflight = false;
const handledFloors = new Map();
const inflightScopes = new Set();
const noticedGroups = new Set();

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
    const stream = context?.streamingProcessor;
    if (stream && stream.finished !== true && stream.isStopped !== true) return true;
    if (context?.generating === true || context?.isGenerating === true) return true;
    const stop = globalThis.document?.getElementById?.('mes_stop');
    if (!stop) return false;
    if (stop.hidden === true || stop.style?.display === 'none') return false;
    return stop.offsetParent !== null;
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
        text: core_text.normalizeText(row.message?.mes, 4000),
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
            const result = await auto_memory_gate.runAutoMemoryRound({
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
                startModule: next => auto_memory_host.runModulePlan(next, persist, core_context.currentCharacterGuard(), Date.now()),
                resumeModule: current => auto_memory_host.runModulePlan(current, persist, core_context.currentCharacterGuard(), Date.now()),
            });
            if (result.action === 'arm' || result.action === 'noop' || result.action === 'drawn' || result.action === 'wait') {
                handledFloors.set(scope, floor);
            }
            ui_countdown.refreshAutoMemoryCountdown();
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
            startModule: next => auto_memory_host.runModulePlan(next, persist, core_context.currentCharacterGuard(), Date.now()),
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

export async function resumeFloorPlan() {
    const context = core_context.currentCharacterGuard();
    const snapshot = auto_memory_plan.readAutoMemoryMetadata(context.chatMetadata);
    if (!snapshot?.modulePlan) return { action: 'idle' };
    const persist = next => persistSnapshot(context, next);
    const result = await auto_memory_host.runModulePlan(snapshot, persist, context, Date.now());
    ui_countdown.refreshAutoMemoryCountdown();
    return result;
}

export function stopAutoMemoryScheduler() {
    cleanup?.();
    cleanup = null;
    handledFloors.clear();
    inflightScopes.clear();
    noticedGroups.clear();
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
        types.GENERATION_ENDED,
        types.CHARACTER_MESSAGE_RENDERED,
        types.CHAT_CHANGED,
        types.CHAT_LOADED,
    ].filter(Boolean))];
    const listener = () => { void runHostRound(); };
    for (const type of events) source.on(type, listener);
    cleanup = () => { for (const type of events) source.off?.(type, listener); };
    listener();
}
