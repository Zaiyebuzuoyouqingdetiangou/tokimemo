import * as core_autoUpdatePolicy from './autoUpdatePolicy.js';
import * as core_constants from './constants.js';
import * as core_context from './context.js';
import * as core_settings from './settings.js';
import * as core_requestCoordinator from './requestCoordinator.js';
// C-3c（r84.100）：别名沿用 archive_repository，函数体一字不改；实际指向 core 层的桥，不再 import archive 层。
import * as archive_repository from './archiveBridge.js';
// C-3b（r84.99）：别名沿用 generation_client，函数体一字不改；实际指向 core 层的桥，不再 import generation 层。
import * as generation_client from './generationBridge.js';
import { state as runtimeState } from './state.js';

let cleanup = null;
let requestTick = null;
const storageKey = core_autoUpdatePolicy.autoUpdateStorageKey;

export function refreshAutoUpdateStatus() {
    const elements = [...document.querySelectorAll('[data-rmt-auto-status]')];
    if (!elements.length) return;
    for (const element of elements) element.textContent = '未选择可用聊天';
    try {
        const context = core_context.currentCharacterGuard();
        const scope = core_context.chatScopeKey(context);
        const gate = core_autoUpdatePolicy.readLegacySchedulerGate(context.chatMetadata);
        const rules = core_autoUpdatePolicy.normalizeAutoUpdates(core_settings.getPluginSettings().autoUpdates);
        const raw = JSON.parse(localStorage.getItem(storageKey(scope)) || '{}');
        const labels = { armed: '已待命', running: '本轮已开始', complete: '已完成', failed: '未完成 · 等下一间隔或手动重试' };
        for (const element of elements) {
            const entry = raw?.[element.dataset.rmtAutoStatus];
            const rule = rules[element.dataset.rmtAutoStatus];
            element.textContent = !gate.allowLegacy
                ? (gate.source === 'paused-corrupt' ? '记录无法读取，已暂停，没有改写' : '新计划已启用，本项已暂停')
                : !rule?.enabled ? '已关闭' : autoUpdateAvailability() || (entry && entry.signature === rule.every + ':' + rule.epoch
                && labels[entry.status] && Number.isSafeInteger(entry.attemptFloor)
                ? entry.attemptFloor + ' 楼 · ' + (entry.status === 'failed' && entry.failureCode === 'RMT_ARCHIVE_PREFIX_CHANGED'
                    ? '原档案基线不一致 · 请检查来源，旧内容保留' : labels[entry.status]) : '尚未计数');
        }
    } catch {}
}

export function notifyAutoUpdateSettingsChanged() {
    if (!cleanup) startAutoUpdates();
    else requestTick?.();
    refreshAutoUpdateStatus();
}

export function autoUpdateAvailability() {
    if (!globalThis.navigator?.locks?.request) return '当前浏览器缺少跨页面任务锁，自动更新暂不可用；手动生成不受影响。';
    try { if (!globalThis.localStorage) return '浏览器本地存储不可用。'; } catch { return '浏览器本地存储不可用。'; }
    return '';
}

export function startAutoUpdates() {
    stopAutoUpdates();
    const context = core_context.getContext(), source = context.eventSource, types = context.eventTypes || context.event_types || {};
    if (!source?.on || autoUpdateAvailability()) return;
    const snapshot = () => {
        try {
            const current = core_context.currentCharacterGuard();
            const gate = core_autoUpdatePolicy.readLegacySchedulerGate(current.chatMetadata);
            core_autoUpdatePolicy.noteLegacySchedulerSource(gate, core_context.chatScopeKey(current));
            if (!gate.allowLegacy) return null;
            const rules = core_autoUpdatePolicy.normalizeAutoUpdates(current.extensionSettings?.[core_constants.EXTENSION_SETTINGS_KEY]?.autoUpdates);
            if (!core_autoUpdatePolicy.hasEnabledAutoUpdates(rules)) return null;
            const archive = archive_repository.getImportedMemory(current);
            return { scope: core_context.chatScopeKey(current), floor: current.chat?.length || 0,
                ready: !!archive, revision: String(archive?.archiveRevision || '').slice(0, 240), lifetime: runtimeState.runtimeLifecycleEpoch,
                rules };
        } catch { return null; }
    };
    const scheduler = core_autoUpdatePolicy.createFloorScheduler({
        snapshot,
        busy: () => runtimeState.busy || core_requestCoordinator.hasGenerationTasks() || !!runtimeState.roomLifeRefreshPromise,
        lock: (scope, job) => navigator.locks.request('heartbeat-auto:' + scope, { ifAvailable: true }, lock => lock ? job() : undefined),
        read: scope => {
            const raw = JSON.parse(localStorage.getItem(storageKey(scope)) || '{}');
            return core_autoUpdatePolicy.normalizeAutoUpdateCheckpoint(raw);
        },
        write: (scope, state) => { localStorage.setItem(storageKey(scope), JSON.stringify(state)); },
        run: async mode => {
            if (mode === 'archive') return archive_repository.importCurrentChatMemory({ automatic: true });
            const result = await generation_client.generateMode(mode, { background: true, automatic: true });
            return result?.status ? result : { status: result?.kind ? 'committed' : 'failed' };
        },
    });
    let storageFailed = false, timer = 0;
    const listener = () => {
        if (storageFailed) return Promise.resolve();
        let enabled = false;
        try {
            const current = core_context.getContext();
            const gate = core_autoUpdatePolicy.readLegacySchedulerGate(current.chatMetadata);
            enabled = gate.allowLegacy && core_autoUpdatePolicy.hasEnabledAutoUpdates(current.extensionSettings?.[core_constants.EXTENSION_SETTINGS_KEY]?.autoUpdates);
        } catch {}
        if (!enabled) {
            if (timer) clearInterval(timer);
            timer = 0;
            refreshAutoUpdateStatus();
            return Promise.resolve();
        }
        // Keep due floors eligible after a manual task ends, without polling archives while off.
        if (!timer) timer = setInterval(listener, 5000);
        return scheduler.tick().then(refreshAutoUpdateStatus).catch(() => {
            storageFailed = true; stopAutoUpdates();
            globalThis.toastr?.warning?.('自动更新检查点无法保存，本轮已停止；请使用手动更新。', '心迹回廊');
        });
    };
    const events = [...new Set([types.MESSAGE_SENT, types.MESSAGE_RECEIVED, types.CHAT_CHANGED, types.CHAT_LOADED].filter(Boolean))];
    for (const type of events) source.on(type, listener);
    requestTick = listener;
    cleanup = () => { clearInterval(timer); scheduler.stop(); for (const type of events) source.off?.(type, listener); };
    listener();
}

export function stopAutoUpdates() { cleanup?.(); cleanup = null; requestTick = null; }
