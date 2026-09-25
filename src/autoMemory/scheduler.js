// 启用新计划后，由这一处按楼层做增量建档和抽签。没有新记忆或没有可抽模块时不发模块请求。
import * as archive_repository from '../archive/repository.js';
import * as auto_memory_gate from './incrementalGate.js';
import * as auto_memory_plan from './planStore.js';
import * as auto_memory_registry from './moduleRegistry.js';
import * as core_context from '../core/context.js';

let cleanup = null;
const handledFloors = new Map();
const inflightScopes = new Set();

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

function satisfiedPrerequisiteIds() {
    const done = [];
    for (const item of auto_memory_registry.listAutoMemoryModules()) {
        if (item.isComplete() === true) done.push(item.id);
    }
    return done;
}

async function runHostRound() {
    let context;
    try { context = core_context.currentCharacterGuard(); }
    catch { return; }
    const metadata = context.chatMetadata;
    if (!metadata || !Object.prototype.hasOwnProperty.call(metadata, auto_memory_plan.AUTO_MEMORY_PLAN_KEY)) return;
    const scope = core_context.chatScopeKey(context);
    const floor = Array.isArray(context.chat) ? context.chat.length : 0;
    if (handledFloors.get(scope) === floor || inflightScopes.has(scope)) return;
    await auto_memory_gate.withAutoMemoryLock(globalThis.navigator?.locks, scope, async () => {
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
            const live = core_context.currentCharacterGuard();
            if (core_context.chatScopeKey(live) !== scope) return;
            const result = await auto_memory_gate.runAutoMemoryRound({
                snapshot, floor, memoryIds: collectMemoryIds(live), seenFloor: handledFloors.get(scope), now: Date.now(),
                satisfiedPrerequisiteIds: satisfiedPrerequisiteIds(),
                archiveRevision: archive_repository.getImportedMemory(live)?.archiveRevision || 'current',
                chatId: core_context.getChatId(live),
            }, {
                importIncremental: options => archive_repository.importCurrentChatMemory(options),
                readMemoryIds: () => collectMemoryIds(core_context.currentCharacterGuard()),
                random: randomUnit,
                nextId: nextDrawId,
                prepareModulePlan: async request => {
                    const item = auto_memory_registry.autoMemoryModuleById(request.moduleId);
                    return item?.plan?.() || null;
                },
                persist: async next => {
                    const current = auto_memory_plan.readAutoMemoryMetadata(metadata);
                    auto_memory_plan.commitAutoMemoryMetadata(metadata, next, current ? current.plan.revision : 0);
                    await context.saveMetadataDebounced?.();
                    try {
                        const chatId = core_context.getChatId(context);
                        const recovery = await auto_memory_plan.readAutoMemoryRecovery(chatId);
                        const expected = recovery ? recovery.revision : 0;
                        if (next.plan.revision === expected + 1) await auto_memory_plan.writeAutoMemoryRecovery(chatId, next, expected);
                    } catch { /* 聊天记录已经写下。备份写失败时不改主档，也不补发请求。 */ }
                },
                startModule: async () => {
                    // 生成壳在后续轮次。票据已经先落盘，这里不调用模型。
                },
            });
            if (result.action === 'arm' || result.action === 'noop' || result.action === 'drawn' || result.action === 'wait') {
                handledFloors.set(scope, floor);
            }
        } finally {
            inflightScopes.delete(scope);
        }
    });
}

export function stopAutoMemoryScheduler() {
    cleanup?.();
    cleanup = null;
    handledFloors.clear();
    inflightScopes.clear();
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
