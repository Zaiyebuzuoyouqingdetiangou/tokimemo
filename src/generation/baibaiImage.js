// Original adapter for the author's documented STBaiBaiImage API v1.
// No third-party implementation, settings, credentials or DOM are accessed.
import * as core_text from '../core/text.js';

export const BAIBAI_IMAGE_PROVIDER = 'baibai-image';
export const BAIBAI_IMAGE_TIMEOUT_MS = 300000;
export const BAIBAI_IMAGE_CONCURRENCY = 2;
// Keep a cancelled provider call reserved until its promise really settles.
// Otherwise an uncooperative backend could be charged twice for the same item.
const pendingGenerations = new Map();
const ownErrors = new WeakSet();

const MESSAGES = Object.freeze({
    BBI_NOT_READY: '未检测到柏宝绘公开 API v1。若已安装柏宝绘，请更新到支持公开接口的版本，启用后刷新页面；刚完成加载可点击“重新检测”。',
    BBI_VERSION: '柏宝绘接口版本或能力不兼容，需要公开 API v1 和图库保存能力。',
    BBI_NOT_CONFIGURED: '柏宝绘出图渠道尚未配置完成，请在柏宝绘中检查 NAI / ComfyUI 设置。',
    BBI_INVALID_ARGS: '柏宝绘未接受这次画面提示，请检查画面描述后重试。',
    BBI_RATE_LIMITED: '柏宝绘生图限流，内置等待已结束；本次不会再自动重试或切换渠道。',
    BBI_BACKEND_ERROR: '柏宝绘出图失败，请检查其渠道配置与请求历史。旧图已保留。',
    BBI_SAVE_FAILED: '图片已生成，但没有取得可保存的本地路径。旧图已保留；请检查柏宝绘的图库保存状态，避免重复出图。',
    BBI_TIMEOUT: '等待柏宝绘超过 5 分钟，已请求取消。旧图已保留；请先检查柏宝绘任务状态。',
    BBI_ABORTED: '已取消接收本次图片，旧图已保留。',
    BBI_BUSY: '已有两张图片提交给柏宝绘，请等其中一张结束后再绘制。',
    BBI_TARGET_BUSY: '这张图片的绘制请求还未结束，请先等待，避免重复出图。',
});

export function baiBaiImageError(code) {
    const safeCode = Object.hasOwn(MESSAGES, code) ? code : 'BBI_BACKEND_ERROR';
    const error = new Error(MESSAGES[safeCode]);
    error.code = safeCode;
    error.safeUserMessage = error.message;
    error.safeToDisplay = true;
    ownErrors.add(error);
    if (safeCode === 'BBI_ABORTED') error.name = 'AbortError';
    return error;
}

export function baiBaiImageState() {
    try {
        const api = globalThis.STBaiBaiImage;
        if (!api) return { available: false, detected: false, reason: MESSAGES.BBI_NOT_READY, code: 'BBI_NOT_READY' };
        if (api.apiVersion !== 1 || api.capabilities?.generate !== true || api.capabilities?.saveToGallery !== true
            || typeof api.generate !== 'function' || typeof api.getBackendStatus !== 'function') {
            return { available: false, detected: true, reason: MESSAGES.BBI_VERSION, code: 'BBI_VERSION' };
        }
        const status = api.getBackendStatus();
        if (status?.configured !== true) return { available: false, detected: true, reason: MESSAGES.BBI_NOT_CONFIGURED, code: 'BBI_NOT_CONFIGURED' };
        return { api, available: true, detected: true, reason: '柏宝绘已连接 · API v1', code: '' };
    } catch {
        return { available: false, detected: false, reason: MESSAGES.BBI_BACKEND_ERROR, code: 'BBI_BACKEND_ERROR' };
    }
}

function savedImagePath(value) {
    if (typeof value !== 'string' || value.length > 4096 || !value.trim()) return '';
    try {
        const base = globalThis.location?.href || 'http://localhost/';
        const parsed = new URL(value, base);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== new URL(base).origin
            || parsed.username || parsed.password || !/^\/user\/images\/.+\.(?:png|jpe?g|webp|gif)$/i.test(parsed.pathname)) return '';
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch { return ''; }
}

function publicFailure(error) {
    const mapped = {
        aborted: 'BBI_ABORTED', not_configured: 'BBI_NOT_CONFIGURED', invalid_args: 'BBI_INVALID_ARGS',
        rate_limited: 'BBI_RATE_LIMITED', backend_error: 'BBI_BACKEND_ERROR',
    };
    // Never forward third-party message, cause, response, prompt or credentials.
    let code;
    try { code = typeof error?.code === 'string' ? mapped[error.code] : ''; } catch {}
    return baiBaiImageError(code);
}

export function baiBaiImagePendingCount() { return pendingGenerations.size; }
export function isBaiBaiImageTargetPending(targetKey) { return !!targetKey && pendingGenerations.has(targetKey); }

export async function generateBaiBaiImage(prompt, { signal = null, orientation = 'landscape', characterName = '', onProgress = null, onSettled = null, targetKey = '' } = {}) {
    if (signal?.aborted) throw baiBaiImageError('BBI_ABORTED');
    const state = baiBaiImageState();
    if (!state.available) throw baiBaiImageError(state.code);
    const reservation = typeof targetKey === 'string' && targetKey ? targetKey : Symbol('image');
    if (pendingGenerations.has(reservation)) throw baiBaiImageError('BBI_TARGET_BUSY');
    if (pendingGenerations.size >= BAIBAI_IMAGE_CONCURRENCY) throw baiBaiImageError('BBI_BUSY');
    const visual = core_text.normalizeText(prompt, 1800);
    if (!visual) throw baiBaiImageError('BBI_INVALID_ARGS');
    // Freeze grouping before the provider awaits; its default otherwise reads the new chat at save time.
    const request = {
        prompt: visual, nl: visual, size: orientation === 'portrait' ? 'portrait' : 'landscape',
        save: true, character: core_text.normalizeText(characterName, 120) || '心迹回廊 CG',
    };
    const controller = new AbortController();
    let timer;
    let stopped = false;
    let rejectStop;
    const stopPromise = new Promise((_, reject) => { rejectStop = reject; });
    const stop = code => {
        if (stopped) return;
        stopped = true;
        controller.abort();
        rejectStop(baiBaiImageError(code));
    };
    const onAbort = () => stop('BBI_ABORTED');
    const report = progress => {
        if (stopped || controller.signal.aborted || typeof onProgress !== 'function') return;
        const phase = progress?.phase;
        if (!['queued', 'generating', 'queued-remote', 'retrying', 'saving'].includes(phase)) return;
        try { onProgress({ phase }); } catch {}
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => stop('BBI_TIMEOUT'), BAIBAI_IMAGE_TIMEOUT_MS);
    pendingGenerations.set(reservation, controller);
    let providerPromise;
    try {
        // No await before generate: caller's captured chat and chosen provider are still current.
        providerPromise = Promise.resolve(state.api.generate(request, { signal: controller.signal, onProgress: report }))
            .catch(error => { throw publicFailure(error); })
            .finally(() => {
                pendingGenerations.delete(reservation);
                try { onSettled?.(); } catch {}
            });
        const result = await Promise.race([providerPromise, stopPromise]);
        if (signal?.aborted || stopped) throw baiBaiImageError('BBI_ABORTED');
        const path = savedImagePath(result?.path);
        if (!path) throw baiBaiImageError('BBI_SAVE_FAILED');
        // Drop the potentially multi-MB dataUrl; only durable image references enter archive metadata.
        return { url: path, provider: BAIBAI_IMAGE_PROVIDER };
    } catch (error) {
        if (!providerPromise) pendingGenerations.delete(reservation); // synchronous API failure
        if (ownErrors.has(error)) throw error;
        throw publicFailure(error);
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}
