import * as image_paths from '../core/cgImagePatch.js';
// In-page original image viewer. No window.open, location navigation, iframe or remote URL.
import * as core_text from '../core/text.js';
import * as core_constants from '../core/constants.js';
let viewer = null;
export const IMAGE_EXPORT_MAX_BYTES = 25 * 1024 * 1024;
export function imageViewerUrl(raw, base = image_paths.imageResourceBase()) {
    return image_paths.savedLocalImagePath(raw, base);
}
export function hasImageViewer() { return !!viewer?.node?.isConnected; }
export function closeImageViewer({ restoreFocus = true } = {}) {
    const old = viewer;
    if (!old) return;
    viewer = null; old.controller?.abort();
    old.host.removeEventListener('cancel', old.cancel, true);
    if (old.objectUrl) URL.revokeObjectURL(old.objectUrl);
    old.file = null; old.node.remove();
    if (restoreFocus && old.opener?.isConnected) old.opener.focus?.();
}
function message(viewState, text) { if (viewer === viewState) viewState.node.querySelector('[data-rmt-image-status]').textContent = text; }
export function openImageViewer(raw) {
    const url = imageViewerUrl(raw);
    if (!url) { globalThis.toastr?.error?.(core_text.safeErrorSummary({ code: 'RMT_IMAGE_VIEW_URL' }), '心迹回廊'); return false; }
    const host = document.getElementById(core_constants.OVERLAY_ID), shell = host?.querySelector('.rmt-shell');
    if (!shell) return false;
    closeImageViewer({ restoreFocus: false });
    const node = document.createElement('div'); node.className = 'rmt-image-viewer';
    node.setAttribute('role', 'dialog'); node.setAttribute('aria-modal', 'true'); node.setAttribute('aria-label', '完整原图');
    node.innerHTML = `<style>#${core_constants.OVERLAY_ID} .rmt-image-viewer{position:absolute;inset:0;z-index:100000;display:flex;flex-direction:column;box-sizing:border-box;background:var(--rmt-theme-surface,#fff);color:var(--rmt-theme-text,#25344a);padding:12px;gap:10px;min-width:0}#${core_constants.OVERLAY_ID} .rmt-image-viewer-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px}#${core_constants.OVERLAY_ID} .rmt-image-viewer button{min-height:46px;height:auto;min-width:66px;display:inline-flex;align-items:center;justify-content:center;padding:8px 14px;border:1px solid var(--rmt-theme-border,#b6cbd9);border-radius:24px;background:var(--rmt-theme-surface,#fff);color:inherit;font:inherit;cursor:pointer}#${core_constants.OVERLAY_ID} .rmt-image-viewer-viewport{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;touch-action:pan-x pan-y pinch-zoom;display:block;text-align:center;background:#131b24}#${core_constants.OVERLAY_ID} .rmt-image-viewer-viewport img{display:block;margin:auto;max-width:100%;height:auto;object-fit:contain;-webkit-touch-callout:default;user-select:auto}#${core_constants.OVERLAY_ID} .rmt-image-viewer-viewport.is-original img{max-width:none;width:auto;height:auto}#${core_constants.OVERLAY_ID} .rmt-image-viewer [data-rmt-image-status]{margin:0;font-size:13px;line-height:1.6;text-align:center}</style><div class="rmt-image-viewer-head"><b>完整原图</b><button type="button" data-rmt-image-view-action="zoom">原始尺寸</button><button type="button" data-rmt-image-view-action="save">准备保存</button><button type="button" data-rmt-image-view-action="close">关闭</button></div><div class="rmt-image-viewer-viewport"><img alt="完整回忆原图"></div><p data-rmt-image-status role="status">原图在当前页面查看，不会离开酒馆。可长按图片尝试保存。</p>`;
    const cancel = event => { event.preventDefault(); event.stopImmediatePropagation(); closeImageViewer(); };
    const viewState = { node, host, url, cancel, opener: document.activeElement, controller: new AbortController(), file: null, objectUrl: null, busy: false };
    viewer = viewState;
    const image = node.querySelector('img');
    image.addEventListener('error', () => message(viewState, core_text.safeErrorSummary({ code: 'RMT_IMAGE_VIEW_LOAD' })));
    image.src = url;
    node.addEventListener('click', event => { event.stopPropagation(); const action = event.target.closest?.('[data-rmt-image-view-action]')?.dataset.rmtImageViewAction; if (action) { event.preventDefault(); void handleImageViewerAction(action); } });
    node.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeImageViewer(); return; }
        if (event.key !== 'Tab') return;
        const controls = [...node.querySelectorAll('button:not(:disabled)')];
        if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    });
    host.addEventListener('cancel', cancel, true); shell.appendChild(node); node.querySelector('[data-rmt-image-view-action="close"]').focus();
    return true;
}
export function imageMagicType(bytes) {
    if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return ['image/png','png'];
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return ['image/jpeg','jpg'];
    if (bytes.length >= 6 && String.fromCharCode(...bytes.slice(0,6)).match(/^GIF8[79]a$/)) return ['image/gif','gif'];
    if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return ['image/webp','webp'];
    return null;
}
export async function prepareImageFile(url, signal) {
    const approved = imageViewerUrl(url);
    if (!approved) throw core_text.safeUserError('', 'RMT_IMAGE_VIEW_URL');
    const response = await fetch(approved, { signal, credentials: 'same-origin', redirect: 'error' });
    if (!response.ok) throw core_text.safeUserError('', 'RMT_IMAGE_VIEW_LOAD');
    const declared = Number(response.headers.get('content-length'));
    if (declared > IMAGE_EXPORT_MAX_BYTES) { try { await response.body?.cancel?.(); } catch {} throw core_text.safeUserError('', 'RMT_IMAGE_EXPORT_LIMIT'); }
    // Without a stream we cannot enforce an incremental memory cap in a WebView.
    if (!response.body?.getReader) throw core_text.safeUserError('', 'RMT_IMAGE_EXPORT');
    const reader = response.body.getReader(), chunks = []; let count = 0;
    try {
        while (true) {
            const part = await reader.read(); if (part.done) break;
            count += part.value.byteLength;
            if (count > IMAGE_EXPORT_MAX_BYTES) { await reader.cancel(); throw core_text.safeUserError('', 'RMT_IMAGE_EXPORT_LIMIT'); }
            chunks.push(part.value);
        }
    } finally { reader.releaseLock(); }
    if (!count) throw core_text.safeUserError('', 'RMT_IMAGE_VIEW_LOAD');
    const blob = new Blob(chunks);
    const header = new Uint8Array(await blob.slice(0,12).arrayBuffer());
    const type = imageMagicType(header);
    if (!type) throw core_text.safeUserError('', 'RMT_IMAGE_VIEW_LOAD');
    return new File([blob], `Hearttrace-CG.${type[1]}`, { type: type[0] });
}
export async function handleImageViewerAction(action) {
    const viewState = viewer;
    if (!viewState) return;
    if (action === 'close') { closeImageViewer(); return; }
    if (action === 'zoom') {
        const full = viewState.node.querySelector('.rmt-image-viewer-viewport').classList.toggle('is-original');
        viewState.node.querySelector('[data-rmt-image-view-action="zoom"]').textContent = full ? '适应屏幕' : '原始尺寸'; return;
    }
    if (action !== 'save' || viewState.busy) return;
    const button = viewState.node.querySelector('[data-rmt-image-view-action="save"]');
    try {
        if (!viewState.file) {
            viewState.busy = true; button.disabled = true;
            message(viewState, '正在准备图片文件…');
            const timer = setTimeout(() => viewState.controller.abort(), 15000);
            let file;
            try { file = await prepareImageFile(viewState.url, viewState.controller.signal); } finally { clearTimeout(timer); }
            if (viewer !== viewState) return;
            viewState.file = file;
            button.textContent = '分享 / 保存';
            message(viewState, '图片已准备好，再点“分享 / 保存”打开系统菜单。');
            return;
        }
        // A second explicit click preserves transient user activation after the fetch.
        if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [viewState.file] })) {
            viewState.busy = true;
            await navigator.share({ files: [viewState.file] });
            message(viewState, '已交给系统分享菜单；是否保存以系统操作为准。');
        } else if (globalThis.__TAURI_RUNNING__ === true || globalThis.__TAURITAVERN__ || (/iP(?:hone|ad|od)|Android|Mobile/i.test(navigator.userAgent || '') || Number(navigator.maxTouchPoints || 0) > 0 || globalThis.matchMedia?.('(pointer: coarse)')?.matches)) {
            message(viewState, '当前宿主没有可用的文件分享能力。请长按原图，或到柏宝绘图库保存；不会用网页跳转兜底。');
        } else {
            if (!viewState.objectUrl) viewState.objectUrl = URL.createObjectURL(viewState.file);
            const anchor = document.createElement('a'); anchor.href = viewState.objectUrl; anchor.download = viewState.file.name;
            viewState.node.appendChild(anchor); anchor.click(); anchor.remove();
            message(viewState, '已请求浏览器下载图片。');
        }
    } catch (error) {
        if (viewer === viewState) message(viewState, error?.name === 'AbortError' ? '已取消或读取超时，请关闭原图后重试。' : core_text.safeErrorSummary(error?.code ? error : { code: 'RMT_IMAGE_EXPORT' }));
    } finally { if (viewer === viewState) { viewState.busy = false; button.disabled = false; } }
}
