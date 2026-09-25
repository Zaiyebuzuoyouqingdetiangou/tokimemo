// Heartbeat Memories r46: bounded, browser-local durability for completed results
// that are waiting for their origin chat to become current again.
import * as backupDiagnostics from './backupDiagnostics.js';

export const DEFERRED_COMMIT_STORE_KEY = 'heartbeat_memories_deferred_commits_v1';
export const DEFERRED_COMMIT_STORE_VERSION = 1;
export const DEFERRED_COMMIT_STORE_MAX_ITEMS = Infinity;
export const DEFERRED_COMMIT_STORE_MAX_BYTES = Infinity;
export const DEFERRED_COMMIT_STORE_MAX_AGE_MS = Infinity;

const SENSITIVE_FIELD = /^(?:api[_-]?key|authorization|proxy[_-]?password|password|secret|access[_-]?token|refresh[_-]?token|bearer[_-]?token)$/i;
const UNSAFE_FIELD = /^(?:__proto__|prototype|constructor)$/;
const FAILURE_MESSAGES = Object.freeze({
    quota: '本地待写回存储空间不足；新结果仅保留在当前页面。',
    security: '浏览器拒绝访问本地待写回存储；新结果仅保留在当前页面。',
    unavailable: '当前浏览器没有可用的本地待写回存储。',
    limit: '待写回结果超过本地安全上限；新结果仅保留在当前页面。',
    serialize: '待写回结果无法序列化；新结果仅保留在当前页面。',
    unknown: '浏览器没有保存待写回结果；具体原因尚未确定。',
});

function deferredFailure(category) {
    const fixed = Object.prototype.hasOwnProperty.call(FAILURE_MESSAGES, category) ? category : 'unknown';
    const error = new Error(FAILURE_MESSAGES[fixed]);
    error.code = `RMT_DEFERRED_${fixed.toUpperCase()}`;
    error.category = fixed;
    return error;
}

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
        if (!item || typeof item !== 'object' || !['archive', 'sessions', 'heartPatches', 'cgImagePatch'].includes(item.kind)) return false;
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
        this.storageAvailable = false;
        this.lastPersistError = null;
        try { this.storageAvailable = typeof storage?.setItem === 'function'; }
        catch (error) { this.lastPersistError = deferredFailure(backupDiagnostics.backupFailureSummary(error).category); }
        if (!this.storageAvailable && !this.lastPersistError) this.lastPersistError = deferredFailure('unavailable');
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
            ...this.diagnosticStatus(),
            pendingItems: this.itemCount(),
            maxItems: DEFERRED_COMMIT_STORE_MAX_ITEMS,
            maxBytes: DEFERRED_COMMIT_STORE_MAX_BYTES,
            error: this.lastPersistError?.message || '',
        };
    }

    // Fixed maintained scalars only: safe even with many large pending results.
    diagnosticStatus() {
        return {
            available: this.storageAvailable,
            healthy: this.storageAvailable && !this.lastPersistError,
            errorCode: this.lastPersistError?.code || '',
            errorCategory: this.lastPersistError?.category || '',
        };
    }

    reportFailure(error) {
        this.lastPersistError = deferredFailure(error?.category);
        // Keep the last successfully persisted snapshot intact. A quota or serialization
        // failure for a newer result must never erase older recoverable commits.
        try { this.onError?.(this.lastPersistError); } catch {}
        return false;
    }

    persistNow() {
        if (this.restoring) return true;
        if (!this.storage?.setItem) return this.reportFailure(deferredFailure('unavailable'));
        if (this.itemCount() > DEFERRED_COMMIT_STORE_MAX_ITEMS) {
            return this.reportFailure(deferredFailure('limit'));
        }
        let raw;
        try { raw = safeSerializedPayload([...this.entries()]); }
        catch { return this.reportFailure(deferredFailure('serialize')); }
        const bytes = byteLength(raw);
        if (bytes > DEFERRED_COMMIT_STORE_MAX_BYTES) {
            return this.reportFailure(deferredFailure('limit'));
        }
        try {
            if (this.size) this.storage.setItem(DEFERRED_COMMIT_STORE_KEY, raw);
            else this.storage.removeItem?.(DEFERRED_COMMIT_STORE_KEY);
            this.lastPersistError = null;
            return true;
        } catch (error) {
            const category = backupDiagnostics.backupFailureSummary(error).category;
            return this.reportFailure(deferredFailure(['quota', 'security', 'unavailable'].includes(category) ? category : 'unknown'));
        }
    }

    set(key, value) {
        super.set(String(key || '').slice(0, 700), value);
        this.persistNow();
        return this;
    }

    replaceDurably(key, value) {
        const normalizedKey = String(key || '').slice(0, 700);
        const hadPrevious = super.has(normalizedKey);
        const previous = super.get(normalizedKey);
        super.set(normalizedKey, value);
        if (!this.storage?.setItem) return true;
        if (this.persistNow()) return true;
        if (hadPrevious) super.set(normalizedKey, previous);
        else super.delete(normalizedKey);
        return false;
    }

    delete(key) {
        if (!super.has(key)) return false;
        const previous = super.get(key);
        super.delete(key);
        if (!this.storage?.setItem) return true;
        if (this.persistNow()) return true;
        super.set(key, previous);
        return false;
    }

    clear() {
        super.clear();
        this.persistNow();
    }
}

export function createDurableDeferredCommitMap(options = {}) {
    return new DurableDeferredCommitMap(options);
}
