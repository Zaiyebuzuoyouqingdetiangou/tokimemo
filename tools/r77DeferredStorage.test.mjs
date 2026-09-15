import test from 'node:test';
import assert from 'node:assert/strict';
import { createDurableDeferredCommitMap, DEFERRED_COMMIT_STORE_KEY } from '../src/core/deferredCommitStore.js';

const item = { kind: 'archive', origin: { characterKey: 'private-card', chatId: 'private-chat' }, queuedAt: Date.now() };

test('actual deferred write failures retain only fixed cause labels and preserve the previous persisted snapshot', () => {
    for (const [name, category] of [['QuotaExceededError', 'quota'], ['SecurityError', 'security'], ['TypeError', 'unknown']]) {
        const previous = JSON.stringify({ version: 1, entries: [['old', [item]]] });
        const values = new Map([[DEFERRED_COMMIT_STORE_KEY, previous]]);
        const storage = { getItem: key => values.get(key) ?? null,
            setItem() { throw new DOMException('PRIVATE_SECRET_PAYLOAD', name); }, removeItem: key => values.delete(key) };
        const map = createDurableDeferredCommitMap({ storage });
        map.set('private-key', [item]);
        assert.equal(map.get('private-key')[0], item);
        assert.equal(values.get(DEFERRED_COMMIT_STORE_KEY), previous);
        assert.equal(map.diagnosticStatus().errorCode, `RMT_DEFERRED_${category.toUpperCase()}`);
        assert.equal(map.diagnosticStatus().errorCategory, category);
        assert.ok(!JSON.stringify(map.persistenceStatus()).includes('PRIVATE_SECRET_PAYLOAD'));
        map.values = map.entries = map.itemCount = () => { throw new Error('diagnostics must not traverse payloads'); };
        assert.deepEqual(map.diagnosticStatus(), { available: true, healthy: false,
            errorCode: `RMT_DEFERRED_${category.toUpperCase()}`, errorCategory: category });
    }
});

test('a later successful persist clears the failure, without dropping the pending result on failure', () => {
    let fail = true;
    const map = createDurableDeferredCommitMap({ storage: { getItem: () => null,
        setItem() { if (fail) throw new DOMException('', 'QuotaExceededError'); },
        removeItem() { if (fail) throw new DOMException('', 'SecurityError'); } } });
    map.set('key', [item]);
    assert.equal(map.delete('key'), false);
    assert.equal(map.get('key')[0], item);
    fail = false;
    assert.equal(map.persistNow(), true);
    assert.deepEqual(map.diagnosticStatus(), { available: true, healthy: true, errorCode: '', errorCategory: '' });
});

test('unavailable, bounded limit and serialization failures stay distinct', () => {
    const missing = createDurableDeferredCommitMap({ storage: null });
    assert.equal(missing.diagnosticStatus().errorCode, 'RMT_DEFERRED_UNAVAILABLE');
    const map = createDurableDeferredCommitMap({ storage: { getItem: () => null, setItem() {} } });
    map.set('key', Array.from({ length: 25 }, () => item));
    assert.equal(map.diagnosticStatus().errorCode, 'RMT_DEFERRED_LIMIT');
    const cyclic = { ...item }; cyclic.self = cyclic;
    map.set('key', [cyclic]);
    assert.equal(map.diagnosticStatus().errorCode, 'RMT_DEFERRED_SERIALIZE');
});

test('diagnostics never access a host storage method getter', () => {
    const storage = { getItem: () => null, setItem() {} };
    const map = createDurableDeferredCommitMap({ storage });
    Object.defineProperty(storage, 'setItem', { get() { throw new Error('must not access storage from diagnostics'); } });
    assert.deepEqual(map.diagnosticStatus(), { available: true, healthy: true, errorCode: '', errorCategory: '' });
    const unavailable = createDurableDeferredCommitMap({ storage });
    assert.equal(unavailable.diagnosticStatus().available, false);
    assert.equal(unavailable.diagnosticStatus().errorCode, 'RMT_DEFERRED_UNKNOWN');
});
