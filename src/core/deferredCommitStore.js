// Heartbeat Memories r46: bounded, browser-local durability for completed results
// that are waiting for their origin chat to become current again.

export const DEFERRED_COMMIT_STORE_KEY = 'heartbeat_memories_deferred_commits_v1';
export const DEFERRED_COMMIT_STORE_VERSION = 1;
export const DEFERRED_COMMIT_STORE_MAX_ITEMS = 24;
export const DEFERRED_COMMIT_STORE_MAX_BYTES = 3_500_000;
export const DEFERRED_COMMIT_STORE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const SENSITIVE_FIELD = /^(?:api[_-]?key|authorization|proxy[_-]?password|password|secret|access[_-]?token|refresh[_-]?token|bearer[_-]?token)$/i;
const UNSAFE_FIELD = /^(?:__proto__|prototype|constructor)$/;

function defaultStorage() {
    try { return globalThis.localStorage || null; } catch { return null; }
}

function byteLength(value) {
    const text = String(value || '');
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).byteLength;
    return text.length * 2;
}

function safeSerializedPayload(entries) {
    return JSON.stringify({
        version: DEFERRED_COMMIT_STORE_VERSION,
        savedAt: Date.now(),
        entries,
    }, (key, value) => {
        if (SENSITIVE_FIELD.test(key) || UNSAFE_FIELD.test(key)) return undefined;
        if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') return undefined;
        return value;
    });
}

function validStoredList(value, now = Date.now()) {
    if (!Array.isArray(value)) return [];
    return value.filter(item => {
        if (!item || typeof item !== 'object' || !['archive', 'sessions', 'heartPatches'].includes(item.kind)) return false;
        if (!item.origin?.characterKey || !item.origin?.chatId) return false;
        const queuedAt = Number(item.queuedAt) || 0;
        return !queuedAt || now - queuedAt <= DEFERRED_COMMIT_STORE_MAX_AGE_MS;
    });
}

function restoredEntries(storage) {
    if (!storage?.getItem) return [];
    let raw = '';
    try { raw = storage.getItem(DEFERRED_COMMIT_STORE_KEY) || ''; }
    catch { return []; }
    if (!raw || byteLength(raw) > DEFERRED_COMMIT_STORE_MAX_BYTES) return [];
    try {
        const parsed = JSON.parse(raw, (key, value) => {
            if (SENSITIVE_FIELD.test(key) || UNSAFE_FIELD.test(key)) return undefined;
            return value;
        });
        if (Number(parsed?.version) !== DEFERRED_COMMIT_STORE_VERSION || !Array.isArray(parsed?.entries)) return [];
        const result = [];
        let count = 0;
        for (const row of parsed.entries) {
            const key = typeof row?.[0] === 'string' ? row[0].slice(0, 700) : '';
            const list = validStoredList(row?.[1]);
            if (!key || !list.length || count + list.length > DEFERRED_COMMIT_STORE_MAX_ITEMS) continue;
            result.push([key, list]);
            count += list.length;
        }
        return result;
    } catch {
        try { storage.removeItem?.(DEFERRED_COMMIT_STORE_KEY); } catch {}
        return [];
    }
}

class DurableDeferredCommitMap extends Map {
    constructor({ storage = defaultStorage(), onError = null } = {}) {
        super();
        this.storage = storage;
        this.onError = typeof onError === 'function' ? onError : null;
        this.lastPersistError = storage ? null : new Error('当前浏览器不允许使用本地待写回存储。');
        this.restoring = true;
        for (const [key, list] of restoredEntries(storage)) super.set(key, list);
        this.restoring = false;
    }

    itemCount() {
        let count = 0;
        for (const list of this.values()) count += Array.isArray(list) ? list.length : 0;
        return count;
    }

    persistenceStatus() {
        return {
            available: !!this.storage,
            healthy: !!this.storage && !this.lastPersistError,
            pendingItems: this.itemCount(),
            maxItems: DEFERRED_COMMIT_STORE_MAX_ITEMS,
            maxBytes: DEFERRED_COMMIT_STORE_MAX_BYTES,
            error: this.lastPersistError?.message || '',
        };
    }

    reportFailure(error) {
        this.lastPersistError = error instanceof Error ? error : new Error(String(error || '待写回结果无法持久化。'));
        // Keep the last successfully persisted snapshot intact. A quota or serialization
        // failure for a newer result must never erase older recoverable commits.
        try { this.onError?.(this.lastPersistError); } catch {}
        return false;
    }

    persistNow() {
        if (this.restoring) return true;
        if (!this.storage?.setItem) return this.reportFailure(new Error('当前浏览器不允许使用本地待写回存储。'));
        if (this.itemCount() > DEFERRED_COMMIT_STORE_MAX_ITEMS) {
            return this.reportFailure(new Error(`待写回结果超过 ${DEFERRED_COMMIT_STORE_MAX_ITEMS} 项安全上限。`));
        }
        let raw;
        try { raw = safeSerializedPayload([...this.entries()]); }
        catch (error) { return this.reportFailure(new Error(`待写回结果无法序列化：${error?.message || error}`)); }
        const bytes = byteLength(raw);
        if (bytes > DEFERRED_COMMIT_STORE_MAX_BYTES) {
            return this.reportFailure(new Error(`待写回结果超过 ${Math.round(DEFERRED_COMMIT_STORE_MAX_BYTES / 1_000_000 * 10) / 10} MB 安全上限。`));
        }
        try {
            if (this.size) this.storage.setItem(DEFERRED_COMMIT_STORE_KEY, raw);
            else this.storage.removeItem?.(DEFERRED_COMMIT_STORE_KEY);
            this.lastPersistError = null;
            return true;
        } catch (error) {
            return this.reportFailure(new Error(`浏览器没有保存待写回结果：${error?.message || error}`));
        }
    }

    set(key, value) {
        super.set(String(key || '').slice(0, 700), value);
        this.persistNow();
        return this;
    }

    delete(key) {
        const removed = super.delete(key);
        if (removed) this.persistNow();
        return removed;
    }

    clear() {
        super.clear();
        this.persistNow();
    }
}

export function createDurableDeferredCommitMap(options = {}) {
    return new DurableDeferredCommitMap(options);
}
