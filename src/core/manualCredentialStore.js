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
// r84.177：有些内嵌浏览器（如 TT 的 WKWebView）不允许把加密钥匙存进本机数据库。
// 这不是 Key 错了：本次打开期间照常可用，只是没法存下来。不放宽加密，也不改成明文保存。
function sessionOnlyError() {
    const error = new Error('这台设备不支持把 Key 加密存进本机；本次打开期间照常可用，重新打开后需要再填一次，或改用一键配置。');
    Object.assign(error, { code: 'RMT_MANUAL_KEY_SESSION_ONLY', safeToDisplay: true, safeUserMessage: error.message, retryable: false, retryableJson: false });
    return error;
}
// 设置会随酒馆同步到别的设备，但 Key 只加密存在填写它的那台设备上。
function notOnDeviceError() {
    const error = new Error('这台设备还没保存过手动 API 的 Key，请在设置里填一次。');
    Object.assign(error, { code: 'RMT_MANUAL_KEY_NOT_ON_DEVICE', safeToDisplay: true, safeUserMessage: error.message, retryable: false, retryableJson: false });
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
            try { await store.compareLocalRecoveryRecord(id, old?.revision || 0, { version: 1, base, key, iv, ciphertext }); }
            catch (error) { if (error?.code === 'RMT_LOCAL_CLONE' || error?.name === 'DataCloneError') throw sessionOnlyError(); throw error; }
            return id;
        } catch (error) { if (error?.code === 'RMT_MANUAL_KEY_SESSION_ONLY') throw error; throw credentialError(); }
    });
}
export async function readManualCredential(base, reference) {
    const id = validManualSecretRef(reference);
    if (!id) return '';
    try {
        await lanes.get(id);
        const record = await store.readLocalRecoveryRecord(id);
        if (!record) throw notOnDeviceError();
        const saved = record.payload;
        if (saved?.version !== 1 || saved.base !== base || !saved.key || saved.key.extractable !== false
            || !(saved.iv instanceof Uint8Array) || saved.iv.byteLength !== 12
            || !(saved.ciphertext instanceof ArrayBuffer) || saved.ciphertext.byteLength > 16016) throw credentialError();
        const decrypted = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: saved.iv,
            additionalData: new TextEncoder().encode(JSON.stringify([id, base])) }, saved.key, saved.ciphertext);
        const bytes = new Uint8Array(decrypted);
        try { const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes); if (!value || value.length > 4000) throw credentialError(); return value; }
        finally { bytes.fill(0); }
    } catch (error) { if (error?.code === 'RMT_MANUAL_KEY_NOT_ON_DEVICE') throw error; throw credentialError(); }
}
export async function clearManualCredential(reference) {
    const id = validManualSecretRef(reference); if (!id) return true;
    return inLane(id, async () => {
        try { const old = await store.readLocalRecoveryRecord(id); await store.compareLocalRecoveryRecord(id, old?.revision || 0, null); return true; }
        catch { throw credentialError(); }
    });
}
