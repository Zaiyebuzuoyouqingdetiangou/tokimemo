// View a saved local image inside the existing archive dialog. No navigation,
// generation, cache writes, or listeners survive this temporary view.
import * as core_constants from '../core/constants.js';
import * as image_patch from '../core/cgImagePatch.js';
import * as core_text from '../core/text.js';

let viewer = null;

export function hasCgImageViewer() { return !!viewer?.element?.isConnected; }

export function closeCgImageViewer({ restoreFocus = true } = {}) {
    const current = viewer;
    if (!current) return false;
    viewer = null;
    current.observer?.disconnect();
    current.document.removeEventListener('keydown', current.onKeydown, true);
    current.host.removeEventListener('cancel', current.onCancel, true);
    current.element.removeEventListener('click', current.onClick);
    current.image.removeEventListener('load', current.onLoad);
    current.image.removeEventListener('error', current.onError);
    current.element.remove();
    if (restoreFocus && current.opener?.isConnected) current.opener.focus();
    return true;
}

export function openCgImageViewer(record, title = '原图', { opener = null } = {}) {
    const imageRecord = image_patch.normalizeCgImageRecord(record);
    if (!imageRecord) {
        globalThis.toastr?.warning?.('这张图片没有可查看的本地路径。', '心迹回廊');
        return false;
    }
    const doc = globalThis.document;
    const host = doc?.getElementById(core_constants.OVERLAY_ID);
    const shell = host?.querySelector('.rmt-shell');
    if (!shell || host.hidden) return false;
    const previousOpener = opener || doc.activeElement;
    closeCgImageViewer({ restoreFocus: false });
    const make = (tag, className, text) => {
        const node = doc.createElement(tag);
        node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };
    const element = make('section', 'rmt-cg-viewer');
    element.setAttribute('role', 'dialog');
    element.setAttribute('aria-modal', 'true');
    element.setAttribute('aria-label', '查看原图');
    const toolbar = make('div', 'rmt-cg-viewer-toolbar');
    const heading = make('b', 'rmt-cg-viewer-title', core_text.normalizeText(title, 120) || '原图');
    const toggle = make('button', 'rmt-cg-viewer-toggle', '原尺寸');
    toggle.type = 'button';
    toggle.disabled = true;
    toggle.setAttribute('aria-pressed', 'false');
    const close = make('button', 'rmt-cg-viewer-close', '返回');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭原图，返回上一层');
    toolbar.appendChild(close);
    toolbar.appendChild(heading);
    toolbar.appendChild(toggle);
    const status = make('p', 'rmt-cg-viewer-status', '正在加载图片…');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const stage = make('div', 'rmt-cg-viewer-stage');
    stage.tabIndex = 0;
    stage.setAttribute('role', 'region');
    stage.setAttribute('aria-label', '原图，原尺寸模式下可滚动查看');
    const image = make('img', 'rmt-cg-viewer-image');
    image.alt = core_text.normalizeText(title, 120) || '原图';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    stage.appendChild(image);
    element.appendChild(toolbar);
    element.appendChild(status);
    element.appendChild(stage);
    const current = { element, host, document: doc, image, opener: previousOpener, observer: null };
    const dismiss = event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeCgImageViewer();
    };
    current.onCancel = dismiss;
    current.onKeydown = event => {
        if (event.key === 'Escape') { dismiss(event); return; }
        if (event.key !== 'Tab') return;
        const controls = toggle.disabled ? [close, stage] : [close, toggle, stage];
        const active = doc.activeElement;
        if (!element.contains(active) || (event.shiftKey && active === controls[0])) {
            event.preventDefault();
            (event.shiftKey ? controls[controls.length - 1] : controls[0]).focus();
        } else if (!event.shiftKey && active === controls[controls.length - 1]) {
            event.preventDefault(); close.focus();
        }
    };
    current.onClick = event => {
        event.stopPropagation();
        if (event.target === close) { dismiss(event); return; }
        if (event.target !== toggle || toggle.disabled) return;
        const native = !element.classList.contains('rmt-cg-viewer-native');
        element.classList.toggle('rmt-cg-viewer-native', native);
        toggle.textContent = native ? '适屏' : '原尺寸';
        toggle.setAttribute('aria-pressed', String(native));
        stage.scrollTop = 0;
        stage.scrollLeft = 0;
    };
    current.onLoad = () => {
        if (viewer !== current) return;
        status.textContent = '';
        image.hidden = false;
        toggle.disabled = false;
    };
    current.onError = () => {
        if (viewer !== current) return;
        image.hidden = true;
        toggle.disabled = true;
        status.setAttribute('role', 'alert');
        status.textContent = '图片加载失败，请返回后重试。原图和档案没有改变。';
    };
    viewer = current;
    image.addEventListener('load', current.onLoad);
    image.addEventListener('error', current.onError);
    element.addEventListener('click', current.onClick);
    doc.addEventListener('keydown', current.onKeydown, true);
    host.addEventListener('cancel', current.onCancel, true);
    shell.appendChild(element);
    // Watch only structural replacements while the viewer is open. Ordinary
    // text/animation changes do not trigger a document-wide subtree observer.
    if (typeof globalThis.MutationObserver === 'function') {
        const body = host.querySelector('.rmt-body');
        const content = body?.firstChild;
        current.observer = new MutationObserver(() => {
            if (viewer !== current) return;
            if (!element.isConnected || !host.isConnected || body?.firstChild !== content) {
                closeCgImageViewer({ restoreFocus: false });
            }
        });
        current.observer.observe(doc.body, { childList: true });
        current.observer.observe(shell, { childList: true });
        if (body) current.observer.observe(body, { childList: true });
    }
    image.src = imageRecord.url;
    close.focus();
    return true;
}
