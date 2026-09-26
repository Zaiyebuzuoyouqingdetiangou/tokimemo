// 启用新计划后，楼层到点就读最近这一窗正文，做成增量回忆再抽签。没有新记忆或没有可抽模块时不发模块请求。
import * as archive_repository from '../archive/repository.js';
import * as auto_memory_gate from './incrementalGate.js';
import * as auto_memory_host from './moduleHost.js';
import * as auto_memory_lease from './instanceLease.js';
import * as auto_memory_plan from './planStore.js';
import * as auto_memory_registry from './moduleRegistry.js';
import * as core_context from '../core/context.js';
import * as core_settings from '../core/settings.js';
import * as auto_memory_floor from './floorPace.js';
import * as ui_countdown from '../ui/autoMemoryCountdown.js';

let cleanup = null;
let leaseOwner = '';
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
            const persist = async next => {
                const current = auto_memory_plan.readAutoMemoryMetadata(metadata);
                auto_memory_plan.commitAutoMemoryMetadata(metadata, next, current ? current.plan.revision : 0);
                await context.saveMetadataDebounced?.();
                try {
                    const chatId = core_context.getChatId(context);
                    const recovery = await auto_memory_plan.readAutoMemoryRecovery(chatId);
                    const expected = recovery ? recovery.revision : 0;
                    if (next.plan.revision === expected + 1) await auto_memory_plan.writeAutoMemoryRecovery(chatId, next, expected);
                } catch { /* 聊天记录已经写下。备份写失败时不改主档，也不补发请求。 */ }
            };
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
    const events = [...new Set([types.MESSAGE_SENT, types.MESSAGE_RECEIVED, types.CHAT_CHANGED, types.CHAT_LOADED].filter(Boolean))];
    const listener = () => { void runHostRound(); };
    for (const type of events) source.on(type, listener);
    cleanup = () => { for (const type of events) source.off?.(type, listener); };
    listener();
}
