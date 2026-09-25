import * as auto_memory_plan from '../autoMemory/planStore.js';

// 成就已改成其他模块的末包，不再作为旧自动更新的独立候选。
export const AUTO_UPDATE_MODES = Object.freeze(['archive', 'album', 'adv', 'room', 'phone', 'inbox', 'cabinet', 'travel', 'ending', 'calendar', 'relations', 'heart', 'butterfly']);

export const autoUpdateStorageKey = scope => 'heartbeatMemoriesAutoFloorsV1:' + encodeURIComponent(scope);

export function hasEnabledAutoUpdates(value) {
    return !!value && AUTO_UPDATE_MODES.some(mode => Object.hasOwn(value, mode) && value[mode]?.enabled === true);
}

export function normalizeAutoUpdateCheckpoint(raw) {
    const safe = {};
    for (const mode of AUTO_UPDATE_MODES) {
        const item = raw?.[mode];
        if (item && Number.isSafeInteger(item.attemptFloor) && item.attemptFloor >= 0 && Number.isSafeInteger(item.successFloor)
            && typeof item.signature === 'string' && item.signature.length < 100) safe[mode] = item;
    }
    return safe;
}

export function normalizeAutoUpdates(value) {
    return Object.fromEntries(AUTO_UPDATE_MODES.map(mode => {
        const item = value && Object.hasOwn(value, mode) ? value[mode] : null;
        return [mode, { enabled: item?.enabled === true, every: Math.max(1, Math.min(1000, Math.floor(Number(item?.every) || 20))),
            epoch: Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(item?.epoch) || 0))) }];
    }));
}

let notedSchedulerSource = '';

// 新计划启用或记录损坏时，旧的按模块计数不再发请求。损坏记录只暂停，不改写。
export function readLegacySchedulerGate(chatMetadata) {
    try {
        const snapshot = auto_memory_plan.readAutoMemoryMetadata(chatMetadata);
        if (snapshot?.plan.enabled === true) return { allowLegacy: false, source: 'paused-new-plan' };
        return { allowLegacy: true, source: 'legacy' };
    } catch (error) {
        if (error?.code === 'RMT_AUTO_MEMORY_CORRUPT' || error?.code === 'RMT_AUTO_MEMORY_INTERVAL') {
            return { allowLegacy: false, source: 'paused-corrupt' };
        }
        throw error;
    }
}

export function noteLegacySchedulerSource(gate, scope = '') {
    const key = String(scope || '') + '\n' + (gate?.source || '');
    if (notedSchedulerSource === key) return;
    notedSchedulerSource = key;
    const text = gate?.source === 'paused-new-plan'
        ? '这一段聊天已启用自动留忆计划，原来的按模块自动更新已暂停。到了间隔会检查新记忆；还没有可抽模块时，不会为模块发请求。'
        : gate?.source === 'paused-corrupt'
            ? '这一段聊天的自动留忆记录无法读取，原来的按模块自动更新已暂停，记录没有改写。'
            : '这一段聊天使用原来的按模块自动更新。';
    console.info('[HeartbeatMemories] ' + text);
}

// 新计划到了间隔，或还没记下起点时，才把运行时拉起来。损坏记录不拉，也不改写。
export function autoMemoryRuntimeWake(chatMetadata, floor) {
    if (!Number.isSafeInteger(floor) || floor < 0) return false;
    try {
        const snapshot = auto_memory_plan.readAutoMemoryMetadata(chatMetadata);
        if (snapshot?.plan.enabled !== true) return false;
        const next = snapshot.plan.nextDueFloor;
        return next == null || floor >= next;
    } catch {
        return false;
    }
}

// One scheduler owns eligibility, attempt dedupe and success checkpoints. No timers or APIs here.
export function createFloorScheduler({ snapshot, read, write, run, lock, busy, wake, now = Date.now }) {
    let stopped = false, pending = null;
    const tick = () => {
        if (stopped || pending) return pending || Promise.resolve();
        const start = { ...snapshot() };
        if (!start?.scope || !start.ready || busy() || !AUTO_UPDATE_MODES.some(mode => start.rules?.[mode]?.enabled)) return Promise.resolve();
        pending = Promise.resolve(lock(start.scope, async () => {
            // Reuse the snapshot while no asynchronous operation can change the host.
            // Refresh at each await boundary; chat/opt-in/lifecycle checks must stay live.
            let current = snapshot();
            const refresh = () => { current = snapshot(); };
            const same = () => !stopped && current?.scope === start.scope && current?.lifetime === start.lifetime;
            if (!same() || busy()) return;
            const state = await read(start.scope);
            refresh();
            // A confirmed manual archive commit supersedes a failed automatic attempt.
            if (same() && ['failed', 'running'].includes(state.archive?.status) && start.revision
                && state.archive.archiveRevision && start.revision !== state.archive.archiveRevision) {
                state.archive = { ...state.archive, status: 'complete', attemptFloor: start.floor,
                    successFloor: start.floor, archiveRevision: start.revision, at: now() };
                await write(start.scope, state);
                refresh();
            }
            for (const mode of AUTO_UPDATE_MODES) {
                if (!same() || busy()) break;
                const rule = current?.rules?.[mode];
                if (!rule?.enabled) continue;
                const archiveRule = current?.rules?.archive;
                if (mode !== 'archive' && archiveRule?.enabled && state.archive?.signature === archiveRule.every + ':' + archiveRule.epoch
                    && ['failed', 'running'].includes(state.archive?.status)) break;
                const signature = rule.every + ':' + rule.epoch;
                let cursor = state[mode];
                if (!cursor || cursor.signature !== signature || start.floor < cursor.attemptFloor) {
                    state[mode] = { signature, attemptFloor: start.floor, successFloor: start.floor, status: 'armed', archiveRevision: start.revision || '', at: now() };
                    await write(start.scope, state);
                    refresh();
                    continue;
                }
                if (start.floor - cursor.attemptFloor < rule.every) continue;
                // The lightweight bootstrap hands over only a genuinely due interval.
                // It must leave attemptFloor untouched for the runtime's paid-request gate.
                if (wake) { wake(mode); break; }
                // Persist before requesting: reloads, duplicate events and another page cannot replay a paid attempt.
                const previousCursor = cursor;
                cursor = state[mode] = { ...cursor, failureCode: undefined, attemptFloor: start.floor, status: 'running', archiveRevision: start.revision || '', at: now() };
                await write(start.scope, state);
                refresh();
                const stillEligible = () => same() && current?.rules?.[mode]?.enabled
                    && current.rules[mode].every + ':' + current.rules[mode].epoch === signature;
                if (!stillEligible()) break;
                if (busy()) {
                    // No provider call occurred. Keep this interval eligible when the manual task ends.
                    state[mode] = previousCursor;
                    await write(start.scope, state);
                    break;
                }
                try {
                    const result = await run(mode);
                    refresh();
                    if (!stillEligible()) break;
                    const success = result?.status === 'committed' || result?.status === 'noop';
                    state[mode] = { ...cursor, status: success ? 'complete' : 'failed', successFloor: success ? start.floor : cursor.successFloor,
                        archiveRevision: success ? current?.revision || cursor.archiveRevision : cursor.archiveRevision, at: now() };
                    await write(start.scope, state);
                    refresh();
                    if (mode === 'archive' && !success) break;
                } catch (error) {
                    refresh();
                    if (!stillEligible()) break;
                    // Only a fixed code may survive in a checkpoint, never source or error text.
                    state[mode] = { ...cursor, status: 'failed', at: now(), failureCode: error?.code === 'RMT_ARCHIVE_PREFIX_CHANGED' ? 'RMT_ARCHIVE_PREFIX_CHANGED' : undefined };
                    await write(start.scope, state);
                    refresh();
                    if (mode === 'archive') break;
                }
            }
        })).finally(() => { pending = null; });
        return pending;
    };
    return { tick, stop() { stopped = true; } };
}
