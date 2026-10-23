import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const realFiles = new Set([
    'autoMemory/scheduler.js', 'autoMemory/moduleHost.js', 'autoMemory/moduleRunner.js',
    'autoMemory/planStore.js', 'autoMemory/modulePlans.js', 'autoMemory/moduleRegistry.js',
    'autoMemory/combinedResult.js', 'autoMemory/incrementalGate.js', 'autoMemory/draw.js',
    'autoMemory/redo.js', 'autoMemory/roundContext.js', 'autoMemory/floorPace.js',
]);

// Exercise the actual scheduling loop and module host. Only browser/host, provider,
// cache, and durable I/O boundaries are replaced. A VM-only export exposes the
// private host-round entry point without changing its production implementation.
export async function lifecycleHarness({ onBoundary = async () => {}, journalNotes = false } = {}) {
    const sourceRoot = process.env.AUTO_MEMORY_TEST_SOURCE_ROOT || defaultRoot;
    const realm = vm.createContext({ AbortController, setTimeout, clearTimeout,
        console: { warn: () => {} } });
    const data = value => vm.runInContext(`(${JSON.stringify(value)})`, realm);
    const events = [];
    const requests = [];
    const imports = [];
    const jobs = [];
    const tasks = new Map();
    const finishedTasks = [];
    const state = { lifecycle: 1, cancelledScopes: new Set(), uiOpen: true, saveCount: 0 };
    const chats = Object.fromEntries(['A', 'B'].map(id => [id, data({
        chatId: id, characterId: 0, name1: 'User', name2: 'Character',
        chat: [{ mes: 'a completed assistant message', is_user: false }], chatMetadata: {},
        memory: { chatId: id, archiveRevision: `archive-${id}`, memories: [{ id: 'M001' }] },
    })]));
    state.current = chats.A;
    let harness;
    async function boundary(name, detail = {}) {
        events.push({ name, ...detail });
        await onBoundary(name, harness, detail);
    }
    function abortError() { const error = new Error('Generation cancelled'); error.name = 'AbortError'; return error; }
    function assertTask(task) {
        if (task?.signal.aborted || task?.lifecycleEpoch !== state.lifecycle) throw abortError();
        return task;
    }
    let captureArmed = false;
    const held = new WeakMap();
    const stubs = {
        'archive/repository.js': {
            getImportedMemory: context => context.memory,
            importCurrentChatMemory: async options => {
                const context = options.context || state.current;
                imports.push({ options, chatId: context.chatId });
                context.memory.archiveRevision = `archive-${context.chatId}-2`;
                context.memory.memories.push(data({ id: 'M002' }));
                await boundary('archive.import', { chatId: context.chatId });
                return data({ status: 'committed', archiveRevision: `archive-${context.chatId}-2` });
            },
        },
        'core/context.js': {
            currentCharacterGuard: () => state.current, getContext: () => state.current,
            getChatId: context => context.chatId, chatScopeKey: context => `character|${context.chatId}`,
            captureTaskOrigin: (context, archiveRevision) => data({
                chatId: context.chatId, characterId: '0', characterKey: 'character',
                lifecycleEpoch: state.lifecycle, archiveRevision, archivePresent: !!archiveRevision,
            }),
            isCurrentTaskRunOrigin: (origin, context) => origin.chatId === context.chatId
                && origin.characterId === String(context.characterId) && origin.lifecycleEpoch === state.lifecycle,
            runtimeLifecycleStillCurrent: epoch => epoch === state.lifecycle,
        },
        'core/requestCoordinator.js': {
            createGenerationAbortError: abortError,
            beginLogicalGenerationTask: options => {
                const controller = new AbortController();
                const task = { ...options, controller, signal: controller.signal,
                    id: `logical-${tasks.size + finishedTasks.length + 1}`, lifecycleEpoch: state.lifecycle };
                tasks.set(task.id, task);
                events.push({ name: 'task.begin', chatId: options.context.chatId });
                return task;
            },
            assertLogicalGenerationTaskCurrent: assertTask,
            isLogicalGenerationTaskCurrent: task => !task.signal.aborted && task.lifecycleEpoch === state.lifecycle,
            bindLogicalGenerationTask: (task, origin) => {
                assertTask(task); task.origin = origin;
                events.push({ name: 'task.bind', archiveRevision: origin.archiveRevision });
            },
            finishLogicalGenerationTask: (task, outcome) => {
                tasks.delete(task.id); finishedTasks.push({ task, outcome });
            },
            chatScopeCancellationBlocksOrigin: origin => state.cancelledScopes.has(origin.chatId),
        },
        'core/cache.js': {
            loadSession: () => null,
            ensureCacheHydrated: async context => boundary('cache.hydrate', { chatId: context.chatId }),
        },
        'generation/client.js': {
            generateMode: async (mode, options = {}) => {
                // This is the production entry point's context selection contract.
                const context = options.context || state.current;
                requests.push({ mode, options, chatId: context.chatId, archiveRevision: context.memory.archiveRevision });
                await boundary('provider', { chatId: context.chatId, number: requests.length });
                return data({ status: 'committed', archiveRevision: context.memory.archiveRevision });
            },
        },
        'generation/achievementCapture.js': {
            armAchievementCapture: () => { captureArmed = true; },
            takeJournalNotes: () => data(journalNotes ? { page1: 'a note' } : {}),
            finishAchievementCapture: () => {
                const packet = captureArmed ? data({ id: 'achievement-A', title: 'A keepsake', kind: 'collection' }) : null;
                captureArmed = false; return packet;
            },
        },
        'core/journalPiggyback.js': {
            wantedJournalPages: async () => { await boundary('journal.read'); return data({ scope: 'A', pages: [] }); },
            saveJournalNotes: async scope => boundary('journal.save', { chatId: scope }),
        },
        'autoMemory/gapFill.js': {
            readPendingAchievement: metadata => held.get(metadata) || null,
            holdPendingAchievement: (metadata, packet) => { held.set(metadata, packet.achievement); return false; },
            clearPendingAchievement: metadata => held.delete(metadata),
            rememberAchievementTitle: () => false,
        },
        'autoMemory/achievementLibrary.js': {
            saveAutoAchievement: (context, result) => {
                events.push({ name: 'achievement.save', chatId: context.chatId, id: result.achievement?.id }); return true;
            },
        },
        'autoMemory/instanceLease.js': { groupChatNotice: () => '', claimWith: async () => null },
        'autoMemory/streamGate.js': { hostGenerationOpen: () => false, generationOpen: () => false, noteAssistantStream: () => {} },
        'core/settings.js': { getPluginSettings: () => data({ autoRetryEnabled: false }) },
        'core/text.js': { safeErrorDiagnostic: error => error?.message },
        'ui/taskCenter.js': {
            openAutoMemoryJob: () => {
                const owned = !state.jobActive; state.jobActive = true;
                return { owned, id: 'job-A' };
            },
            settleAutoMemoryJob: (id, status) => { jobs.push({ id, status }); state.jobActive = false; },
        },
        'ui/autoMemoryCountdown.js': { refreshAutoMemoryCountdown: () => {} },
    };
    const modules = new Map();
    const loading = new Map();
    async function load(relative) {
        if (!loading.has(relative)) loading.set(relative, (async () => {
            let module;
            if (realFiles.has(relative)) {
                let source = await readFile(path.join(sourceRoot, 'src', relative), 'utf8');
                if (relative === 'autoMemory/scheduler.js') source += '\nexport { runHostRound as testRunHostRound };\n';
                module = new vm.SourceTextModule(source, {
                    context: realm, identifier: relative,
                });
            } else {
                const exports = stubs[relative] || {};
                module = new vm.SyntheticModule(Object.keys(exports), function () {
                    for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
                }, { context: realm, identifier: relative });
            }
            modules.set(relative, module);
            return module;
        })());
        return loading.get(relative);
    }
    const schedulerModule = await load('autoMemory/scheduler.js');
    await schedulerModule.link((specifier, parent) => load(path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier), specifier))));
    await schedulerModule.evaluate();
    const scheduler = schedulerModule.namespace;
    const plans = modules.get('autoMemory/planStore.js').namespace;
    const modulePlans = modules.get('autoMemory/modulePlans.js').namespace;
    const snapshot = plans.parseAutoMemorySnapshot(data({
        plan: plans.createAutoMemoryPlan(data({ enabled: true, revision: 1, intervalFloors: 1,
            activeDrawTicketId: 'draw-fixtureA', nextDueFloor: 2 })),
        drawTickets: [{ id: 'draw-fixtureA', dueFloor: 1, archiveRevision: 'archive-A',
            candidates: [{ id: 'room', weight: 1 }], selectedModuleId: 'room', sourceMemoryIds: ['M001'], status: 'running' }],
        revealRecords: [], modulePlan: modulePlans.buildModulePlan('room', data({ drawId: 'draw-fixtureA',
            chatId: 'A', archiveRevision: 'archive-A', sourceMemoryIds: ['M001'], slots: 1 })),
    }));
    plans.assignAutoMemoryMetadata(chats.A.chatMetadata, snapshot);
    const recovery = new Map();
    plans.setAutoMemoryRecoveryBackendForTests({
        read: async key => { await boundary('recovery.read', { key }); return recovery.get(key) || null; },
        write: async (key, _expected, value, options = {}) => {
            options.assertCurrent?.();
            await boundary('recovery.write', { key });
            options.assertCurrent?.();
            if (options.signal?.aborted) throw abortError();
            recovery.set(key, value); return value;
        },
    });
    for (const [id, context] of Object.entries(chats)) {
        context.saveMetadataDebounced = async () => {
            state.saveCount += 1;
            await boundary('metadata.save', { chatId: id, number: state.saveCount });
        };
    }
    harness = { state, chats, events, requests, imports, jobs, tasks, finishedTasks, scheduler, plans, data, recovery,
        round: modules.get('autoMemory/roundContext.js')?.namespace,
        snapshot: () => plans.readAutoMemoryMetadata(chats.A.chatMetadata),
        switchChat: () => { state.current = chats.B; },
        cancel: () => {
            state.cancelledScopes.add('A');
            for (const task of tasks.values()) task.controller.abort(abortError());
        },
        disable: () => {
            const current = plans.readAutoMemoryMetadata(chats.A.chatMetadata);
            plans.assignAutoMemoryMetadata(chats.A.chatMetadata, data({ ...current,
                plan: { ...current.plan, enabled: false, revision: current.plan.revision + 1 } }));
        },
        prepareDueRound: () => {
            const registry = modules.get('autoMemory/moduleRegistry.js').namespace;
            const excludedModuleIds = Array.from(registry.listAutoMemoryModules()).map(item => item.id)
                .filter(id => id !== 'calendar' && registry.isAutoMemoryDrawModule(id));
            const due = plans.parseAutoMemorySnapshot(data({
                plan: plans.createAutoMemoryPlan(data({ enabled: true, revision: 1, intervalFloors: 1,
                    nextDueFloor: 1, lastCompletedFloor: 0, excludedModuleIds })),
                drawTickets: [], revealRecords: [], modulePlan: null,
            }));
            plans.assignAutoMemoryMetadata(chats.A.chatMetadata, due);
            recovery.set('chat:A', plans.parseAutoMemoryRecoveryRecord(data({
                key: 'chat:A', schemaVersion: 1, chatId: 'A', revision: due.plan.revision, payload: due,
            })));
        },
        runHost: () => scheduler.testRunHostRound(),
        async run() {
            try { return await scheduler.resumeFloorPlan(); }
            catch (error) { return { action: 'failed', error }; }
        },
    };
    return harness;
}
