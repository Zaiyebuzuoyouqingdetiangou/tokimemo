import assert from 'node:assert/strict';
import test from 'node:test';
import * as plans from '../src/autoMemory/planStore.js';

const snapshot = () => plans.parseAutoMemorySnapshot({
    plan: plans.createAutoMemoryPlan({ enabled: true, revision: 1, intervalFloors: 1 }),
    drawTickets: [], revealRecords: [], modulePlan: null,
});

function fakeDatabase(boundary) {
    const state = { transactions: 0, puts: 0, committed: 0, closed: 0 };
    const db = {
        close() { state.closed += 1; },
        transaction() {
            state.transactions += 1;
            let ended = false;
            const tx = {
                abort() {
                    if (ended) return;
                    ended = true;
                    queueMicrotask(() => tx.onabort?.());
                },
                objectStore() { return {
                    get() {
                        const request = { result: null };
                        queueMicrotask(() => {
                            boundary('read');
                            if (!ended) request.onsuccess?.();
                        });
                        return request;
                    },
                    put() {
                        state.puts += 1;
                        queueMicrotask(() => {
                            boundary('put');
                            if (!ended) {
                                ended = true;
                                state.committed += 1;
                                tx.oncomplete?.();
                            }
                        });
                    },
                }; },
            };
            return tx;
        },
    };
    return { state, indexedDB: { open() {
        const request = { result: db };
        queueMicrotask(() => { boundary('open'); request.onsuccess?.(); });
        return request;
    } } };
}

for (const point of ['open', 'read', 'put', 'none']) {
    test(`backup transaction ${point === 'none' ? 'commits normally' : `cancels at ${point}`} without stale writes`, async () => {
        const controller = new AbortController();
        const error = Object.assign(new Error('Round cancelled'), { name: 'AbortError' });
        let valid = true;
        const fake = fakeDatabase(name => {
            if (name === point) { valid = false; controller.abort(error); }
        });
        const previous = globalThis.indexedDB;
        globalThis.indexedDB = fake.indexedDB;
        plans.setAutoMemoryRecoveryBackendForTests(null);
        try {
            const pending = plans.writeAutoMemoryRecovery('A', snapshot(), 0, {
                assertCurrent: () => { if (!valid) throw error; }, signal: controller.signal,
            });
            if (point === 'none') {
                assert.equal((await pending).chatId, 'A');
                assert.equal(fake.state.committed, 1);
            } else {
                await assert.rejects(pending, { name: 'AbortError' });
                assert.equal(fake.state.committed, 0);
                if (point === 'open') assert.equal(fake.state.transactions, 0);
                if (point === 'read') assert.equal(fake.state.puts, 0);
            }
            assert.equal(fake.state.closed, 1);
        } finally {
            globalThis.indexedDB = previous;
        }
    });
}
