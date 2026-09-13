import * as core_autoUpdatePolicy from './autoUpdatePolicy.js';
import * as core_constants from './constants.js';
import * as core_context from './context.js';
import * as core_settings from './settings.js';
import * as core_requestCoordinator from './requestCoordinator.js';
import * as archive_repository from '../archive/repository.js';
import * as generation_client from '../generation/client.js';
import { state as runtimeState } from './state.js';

let cleanup = null;
let requestTick = null;
const storageKey = scope => 'heartbeatMemoriesAutoFloorsV1:' + encodeURIComponent(scope);

export function refreshAutoUpdateStatus() {
    const elements = [...document.querySelectorAll('[data-rmt-auto-status]')];
    for (const element of elements) element.textContent = '未选择可用聊天';
    try {
        const scope = core_context.chatScopeKey(core_context.currentCharacterGuard());
        const rules = core_autoUpdatePolicy.normalizeAutoUpdates(core_settings.getPluginSettings().autoUpdates);
        const raw = JSON.parse(localStorage.getItem(storageKey(scope)) || '{}');
        const labels = { armed: '已待命', running: '本轮已开始', complete: '已完成', failed: '未完成 · 等下一间隔或手动重试' };
        for (const element of elements) {
            const entry = raw?.[element.dataset.rmtAutoStatus];
            const rule = rules[element.dataset.rmtAutoStatus];
            element.textContent = !rule?.enabled ? '已关闭' : autoUpdateAvailability() || (entry && entry.signature === rule.every + ':' + rule.epoch
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
            const archive = archive_repository.getImportedMemory(current);
            return { scope: core_context.chatScopeKey(current), floor: current.chat?.length || 0,
                ready: !!archive, revision: String(archive?.archiveRevision || '').slice(0, 240), lifetime: runtimeState.runtimeLifecycleEpoch,
                rules: core_settings.getPluginSettings(current).autoUpdates };
        } catch { return null; }
    };
    const scheduler = core_autoUpdatePolicy.createFloorScheduler({
        snapshot,
        busy: () => runtimeState.busy || core_requestCoordinator.hasGenerationTasks() || !!runtimeState.roomLifeRefreshPromise,
        lock: (scope, job) => navigator.locks.request('heartbeat-auto:' + scope, { ifAvailable: true }, lock => lock ? job() : undefined),
        read: scope => {
            const raw = JSON.parse(localStorage.getItem(storageKey(scope)) || '{}');
            const safe = {};
            for (const mode of core_autoUpdatePolicy.AUTO_UPDATE_MODES) {
                const item = raw?.[mode];
                if (item && Number.isSafeInteger(item.attemptFloor) && item.attemptFloor >= 0 && Number.isSafeInteger(item.successFloor)
                    && typeof item.signature === 'string' && item.signature.length < 100) safe[mode] = item;
            }
            return safe;
        },
        write: (scope, state) => { localStorage.setItem(storageKey(scope), JSON.stringify(state)); },
        run: async mode => {
            if (mode === 'archive') return archive_repository.importCurrentChatMemory({ automatic: true });
            const result = await generation_client.generateMode(mode, { background: true, automatic: true });
            return result?.status ? result : { status: result?.kind ? 'committed' : 'failed' };
        },
    });
    let storageFailed = false;
    const listener = () => { if (!storageFailed) void scheduler.tick().then(refreshAutoUpdateStatus).catch(() => {
        storageFailed = true; stopAutoUpdates();
        globalThis.toastr?.warning?.('自动更新检查点无法保存，本轮已停止；请使用手动更新。', '心迹回廊');
    }); };
    const events = [...new Set([types.MESSAGE_SENT, types.MESSAGE_RECEIVED, types.CHAT_CHANGED, types.CHAT_LOADED].filter(Boolean))];
    for (const type of events) source.on(type, listener);
    // Eligibility is checked on a short UI-idle timer too, so a due floor is not lost while a manual task runs.
    const timer = setInterval(listener, 5000);
    requestTick = listener;
    cleanup = () => { clearInterval(timer); scheduler.stop(); for (const type of events) source.off?.(type, listener); };
    listener();
}

export function stopAutoUpdates() { cleanup?.(); cleanup = null; requestTick = null; }
