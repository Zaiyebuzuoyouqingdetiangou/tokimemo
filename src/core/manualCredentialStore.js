// Explicitly entered manual credentials only. Settings keep an opaque reference.
// AES-GCM prevents plaintext in ordinary settings/export files; same-origin scripts
// still share browser privileges. This is not a password-protected external vault.
import * as store from './localRecoveryStore.js';
const REF = /^credential:[a-f0-9-]{36}$/;
const lanes = new Map();
export const validManualSecretRef = value => typeof value === 'string' && REF.test(value) ? value : '';
function credentialError() {
    const error = new Error('手动 API Key 未能从本机加密存储保存或取回；没有使用其他连接的 Key。请保留页面并检查本机存储，或重新输入。');
    Object.assign(error, { code: 'RMT_MANUAL_KEY_STORAGE', safeToDisplay: true, safeUserMessage: error.message, retryable: false, retryableJson: false });
    return error;
}
function inLane(id, action) {
    const next = (lanes.get(id) || Promise.resolve()).catch(() => {}).then(action);
    lanes.set(id, next); void next.finally(() => { if (lanes.get(id) === next) lanes.delete(id); }).catch(() => {});
    return next;
}
export async function saveManualCredential(base, value, reference = '') {
    if (typeof base !== 'string' || !base || typeof value !== 'string' || !value || value.length > 4000) throw credentialError();
    let id;
    try { id = validManualSecretRef(reference) || `credential:${globalThis.crypto.randomUUID()}`; } catch { throw credentialError(); }
    return inLane(id, async () => {
        try {
            const crypto = globalThis.crypto;
            const old = await store.readLocalRecoveryRecord(id);
            const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const bytes = new TextEncoder().encode(value);
            let ciphertext;
            try { ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(JSON.stringify([id, base])) }, key, bytes); }
            finally { bytes.fill(0); }
            await store.compareLocalRecoveryRecord(id, old?.revision || 0, { version: 1, base, key, iv, ciphertext });
            return id;
        } catch { throw credentialError(); }
    });
}
export async function readManualCredential(base, reference) {
    const id = validManualSecretRef(reference);
    if (!id) return '';
    try {
        await lanes.get(id);
        const saved = (await store.readLocalRecoveryRecord(id))?.payload;
        if (saved?.version !== 1 || saved.base !== base || !saved.key || saved.key.extractable !== false
            || !(saved.iv instanceof Uint8Array) || saved.iv.byteLength !== 12
            || !(saved.ciphertext instanceof ArrayBuffer) || saved.ciphertext.byteLength > 16016) throw credentialError();
        const decrypted = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: saved.iv,
            additionalData: new TextEncoder().encode(JSON.stringify([id, base])) }, saved.key, saved.ciphertext);
        const bytes = new Uint8Array(decrypted);
        try { const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes); if (!value || value.length > 4000) throw credentialError(); return value; }
        finally { bytes.fill(0); }
    } catch { throw credentialError(); }
}
export async function clearManualCredential(reference) {
    const id = validManualSecretRef(reference); if (!id) return true;
    return inLane(id, async () => {
        try { const old = await store.readLocalRecoveryRecord(id); await store.compareLocalRecoveryRecord(id, old?.revision || 0, null); return true; }
        catch { throw credentialError(); }
    });
}
