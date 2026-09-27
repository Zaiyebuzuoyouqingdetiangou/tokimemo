export const AUTO_UPDATE_MODES = Object.freeze(['archive', 'album', 'adv', 'room', 'phone', 'inbox', 'cabinet', 'travel', 'ending', 'calendar', 'relations', 'heart', 'achievements', 'butterfly']);

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
