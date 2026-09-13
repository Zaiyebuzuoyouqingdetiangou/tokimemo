export const AUTO_UPDATE_MODES = Object.freeze(['archive', 'album', 'adv', 'room', 'phone', 'inbox', 'cabinet', 'travel', 'ending', 'calendar', 'relations', 'heart', 'achievements', 'butterfly']);

export function normalizeAutoUpdates(value) {
    return Object.fromEntries(AUTO_UPDATE_MODES.map(mode => {
        const item = value && Object.hasOwn(value, mode) ? value[mode] : null;
        return [mode, { enabled: item?.enabled === true, every: Math.max(1, Math.min(1000, Math.floor(Number(item?.every) || 20))),
            epoch: Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(item?.epoch) || 0))) }];
    }));
}

// One scheduler owns eligibility, attempt dedupe and success checkpoints. No timers or APIs here.
export function createFloorScheduler({ snapshot, read, write, run, lock, busy, now = Date.now }) {
    let stopped = false, pending = null;
    const tick = () => {
        if (stopped || pending) return pending || Promise.resolve();
        const start = { ...snapshot() };
        if (!start?.scope || !start.ready || busy() || !AUTO_UPDATE_MODES.some(mode => start.rules?.[mode]?.enabled)) return Promise.resolve();
        pending = Promise.resolve(lock(start.scope, async () => {
            if (stopped || busy() || snapshot()?.scope !== start.scope) return;
            const state = await read(start.scope);
            const same = () => !stopped && snapshot()?.scope === start.scope && snapshot()?.lifetime === start.lifetime;
            // A confirmed manual archive commit supersedes a failed automatic attempt.
            if (same() && ['failed', 'running'].includes(state.archive?.status) && start.revision
                && state.archive.archiveRevision && start.revision !== state.archive.archiveRevision) {
                state.archive = { ...state.archive, status: 'complete', attemptFloor: start.floor,
                    successFloor: start.floor, archiveRevision: start.revision, at: now() };
                await write(start.scope, state);
            }
            for (const mode of AUTO_UPDATE_MODES) {
                if (!same() || busy()) break;
                const rule = snapshot()?.rules?.[mode];
                if (!rule?.enabled) continue;
                const archiveRule = snapshot()?.rules?.archive;
                if (mode !== 'archive' && archiveRule?.enabled && state.archive?.signature === archiveRule.every + ':' + archiveRule.epoch
                    && ['failed', 'running'].includes(state.archive?.status)) break;
                const signature = rule.every + ':' + rule.epoch;
                let cursor = state[mode];
                if (!cursor || cursor.signature !== signature || start.floor < cursor.attemptFloor) {
                    state[mode] = { signature, attemptFloor: start.floor, successFloor: start.floor, status: 'armed', archiveRevision: start.revision || '', at: now() };
                    await write(start.scope, state);
                    continue;
                }
                if (start.floor - cursor.attemptFloor < rule.every) continue;
                // Persist before requesting: reloads, duplicate events and another page cannot replay a paid attempt.
                const previousCursor = cursor;
                cursor = state[mode] = { ...cursor, failureCode: undefined, attemptFloor: start.floor, status: 'running', archiveRevision: start.revision || '', at: now() };
                await write(start.scope, state);
                const stillEligible = () => same() && snapshot()?.rules?.[mode]?.enabled
                    && snapshot().rules[mode].every + ':' + snapshot().rules[mode].epoch === signature;
                if (!stillEligible()) break;
                if (busy()) {
                    // No provider call occurred. Keep this interval eligible when the manual task ends.
                    state[mode] = previousCursor;
                    await write(start.scope, state);
                    break;
                }
                try {
                    const result = await run(mode);
                    if (!stillEligible()) break;
                    const success = result?.status === 'committed' || result?.status === 'noop';
                    state[mode] = { ...cursor, status: success ? 'complete' : 'failed', successFloor: success ? start.floor : cursor.successFloor,
                        archiveRevision: success ? snapshot()?.revision || cursor.archiveRevision : cursor.archiveRevision, at: now() };
                    await write(start.scope, state);
                    if (mode === 'archive' && !success) break;
                } catch (error) {
                    if (!stillEligible()) break;
                    // Only a fixed code may survive in a checkpoint, never source or error text.
                    state[mode] = { ...cursor, status: 'failed', at: now(), failureCode: error?.code === 'RMT_ARCHIVE_PREFIX_CHANGED' ? 'RMT_ARCHIVE_PREFIX_CHANGED' : undefined };
                    await write(start.scope, state);
                    if (mode === 'archive') break;
                }
            }
        })).finally(() => { pending = null; });
        return pending;
    };
    return { tick, stop() { stopped = true; } };
}
