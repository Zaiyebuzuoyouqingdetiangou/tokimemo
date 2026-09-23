import * as mirror from '../core/mirrorTts.js';

// Whitelist rendered prose, never the whole overlay, forms, settings or host chat.
const PROSE = [
    '.rmt-heart-line p', '.rmt-heart-narration', '.rmt-adv-para', '.rmt-dialogue-text',
    '.rmt-ending-confession-bubble p', '.rmt-ending-prose', '.rmt-phone-message p',
    '.rmt-time-line p', '.rmt-time-prose p', '.rmt-mail-paper > p', '.rmt-firefly-thoughts p',
    '.rmt-avatar-dialog-bubble', '.rmt-past-slip p', '.rmt-past-evidence p', '.rmt-past-echo > p',
    '.rmt-past-reflection p', '.rmt-past-closing p', '.rmt-travel-artifact-copy > p',
    '.rmt-travel-postcard-copy > p', '.rmt-room-caption', '.rmt-room-object-desc',
    '.rmt-room-object-line', '.rmt-room-atmosphere', '.rmt-room-summary',
    '.rmt-bedtime-chapter > p', '.rmt-past-paper > p', '.rmt-past-annotation p', '.rmt-journal-prose',
].join(',');
const reader = mirror.createMirrorReader();
let mounted = null;
let preferredVoice = '';
try { preferredVoice = globalThis.localStorage?.getItem('hearttraceReaderVoice') || ''; } catch {}
export function showMirrorSettings(body) {
    if (!mounted || !body) return false;
    if (mounted.bar.parentElement !== body) body.append(mounted.bar);
    if (mounted.bar.hidden) mounted.bar.hidden = false;
    if (!mounted.bar.open) mounted.bar.open = true;
    return true;
}
export function parkMirrorSettings() {
    if (!mounted || mounted.bar.hidden && mounted.bar.parentElement === mounted.overlay) return;
    mounted.bar.hidden = true; mounted.overlay.append(mounted.bar);
}
export function stopMirrorReader() { reader.stop('已切换到实时通话。'); }

function readable(node, body) {
    if (!node || !body.contains(node) || node.closest('input,textarea,select,button,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"]')) return false;
    for (let parent = node; parent && parent !== body; parent = parent.parentElement) {
        if (parent.matches('details:not([open])')) return false;
        const style = getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return node.getClientRects().length > 0;
}

export function collectReadingNodes(body) {
    return [...body.querySelectorAll(PROSE)].filter(node => readable(node, body) && node.textContent.trim())
        .filter((node, _, nodes) => !nodes.some(other => other !== node && other.contains(node)));
}

function proseText(node, body) {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1 || !readable(node, body)) return '';
    if (node.tagName === 'BR') return '\n';
    return [...node.childNodes].map(child => proseText(child, body)).join('');
}

export function disposeMirrorReader() {
    reader.stop('阅读页已关闭。');
    if (!mounted) return;
    mounted.observer.disconnect();
    mounted.unsubscribe();
    document.removeEventListener('selectionchange', mounted.selectionListener);
    window.removeEventListener('pagehide', mounted.pagehide);
    mounted.overlay.removeEventListener('click', mounted.click);
    mounted.bar.remove();
    mounted = null;
}

export function mountMirrorReader(overlay) {
    if (mounted?.overlay === overlay) return;
    disposeMirrorReader();
    const body = overlay.querySelector('.rmt-body');
    if (!body) return;
    const bar = document.createElement('details');
    bar.className = 'rmt-mirror-reader';
    bar.innerHTML = `<summary>朗读 · 镜译</summary>
      <div class="rmt-mirror-controls">
        <label>朗读音色 <select aria-label="朗读音色"><option value="">旁白（镜译默认）</option></select></label>
        <button type="button" data-reader="page">朗读本页正文</button>
        <button type="button" data-reader="selection">朗读选中文字</button>
        <button type="button" data-reader="stop" disabled>停止</button>
        <button type="button" data-reader="check">检查连接 / 刷新音色</button>
      </div>
      <p class="rmt-mirror-status" role="status" aria-live="polite"></p>
      <small>音色由镜译配置；本次朗读使用所选音色。语音生成使用镜译所连服务的额度。切页或关闭会停止；已提交的生成请求可能仍会计费。</small>
      <style>
      .rmt-mirror-reader{flex:0 0 auto;min-width:0;max-height:none;overflow:visible;padding:8px 16px;border-bottom:1px solid var(--rmt-theme-border,#cbd5e1);color:var(--rmt-theme-text,#344454);background:var(--rmt-theme-bg,#fff);font-size:14px}
      .rmt-mirror-reader[hidden]{display:none!important}.rmt-mirror-reader summary{cursor:pointer;min-height:44px;display:list-item;align-content:center;font-weight:600}
      .rmt-mirror-controls{display:flex;align-items:center;flex-wrap:wrap;gap:8px}
      .rmt-mirror-controls button,.rmt-mirror-controls select{min-height:44px!important;height:auto!important;width:auto!important;max-width:100%;padding:8px 12px!important;border:1px solid var(--rmt-theme-border,#cbd5e1);border-radius:10px;color:inherit;background:var(--rmt-theme-surface-solid,#fff);font:inherit;white-space:normal}
      .rmt-mirror-controls label{display:flex;align-items:center;gap:8px;min-width:0;max-width:100%}
      .rmt-mirror-controls select{min-width:0;flex:1}
      .rmt-mirror-controls button:disabled{opacity:.55;cursor:not-allowed}
      .rmt-mirror-reader :focus-visible{outline:2px solid currentColor;outline-offset:2px}
      .rmt-mirror-status{margin:8px 0;overflow-wrap:anywhere}
      .rmt-mirror-reader small{display:block;font-size:12px;line-height:1.6}
      </style>`;
    bar.hidden = true; overlay.append(bar);
    const voice = bar.querySelector('select');
    const status = bar.querySelector('[role="status"]');
    let savedSelection = null;
    let tracked = [];
    let previousPhase = '';
    const connection = () => {
        const result = mirror.inspectMirror();
        const previous = voice.value || preferredVoice;
        voice.replaceChildren(new Option('旁白（镜译默认）', ''));
        if (result.ok) {
            const names = new Set();
            for (const item of result.voices) {
                if (names.has(item.name)) continue;
                names.add(item.name);
                voice.add(new Option(`${item.name}${item.hasOwnVoice ? '' : '（镜译回退音色）'}`, item.name));
            }
        }
        if ([...voice.options].some(o => o.value === previous)) voice.value = previous;
        if (!reader.snapshot().locked) status.textContent = result.message;
    };
    const unsubscribe = reader.subscribe(state => {
        // Announce phase/paragraph changes, not every audio time event.
        if (status.textContent !== state.message) status.textContent = state.message;
        for (const name of ['page', 'selection', 'check']) bar.querySelector(`[data-reader="${name}"]`).disabled = state.locked;
        voice.disabled = state.locked;
        bar.querySelector('[data-reader="stop"]').disabled = !state.locked || state.phase === 'stopped';
        bar.querySelector('summary').textContent = state.locked ? '朗读 · 镜译（会话进行中）' : '朗读 · 镜译';
        if (state.phase === 'error' && state.phase !== previousPhase) { bar.open = true; if (bar.hidden) globalThis.toastr?.error?.(state.message, '镜译朗读'); }
        previousPhase = state.phase;
    });
    const selectionListener = () => {
        const selection = document.getSelection();
        if (!selection?.rangeCount || selection.isCollapsed) {
            if (!bar.contains(document.activeElement) && !document.activeElement?.closest?.('[data-rmt-toolbar-more-menu],[data-rmt-action=toolbar-more]')) savedSelection = null;
            return;
        }
        const range = selection.getRangeAt(0);
        const start = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
        const end = range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement;
        if (!readable(start, body) || !readable(end, body)) { savedSelection = null; return; }
        // Require each selected text node to be visible, non-form content of our reader.
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
        const pieces = [];
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (!range.intersectsNode(node)) continue;
            if (!readable(node.parentElement, body)) continue;
            const from = node === range.startContainer ? range.startOffset : 0;
            const to = node === range.endContainer ? range.endOffset : node.textContent.length;
            pieces.push({ node: node.parentElement, text: node.textContent.slice(from, to), original: node.parentElement.textContent });
        }
        savedSelection = pieces;
    };
    const observer = new MutationObserver(() => {
        savedSelection = null;
        if (reader.snapshot().locked && tracked.some(item => !readable(item.node, body) || item.node.textContent !== item.original)) {
            reader.stop('页面内容已切换。');
        }
    });
    observer.observe(body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'class', 'style', 'open'] });
    const click = event => {
        const action = event.target.closest('[data-reader]')?.dataset.reader;
        if (!action) return;
        event.preventDefault();
        if (action === 'stop') { reader.stop(); return; }
        if (action === 'check') { connection(); return; }
        if (reader.snapshot().locked) return;
        tracked = action === 'selection' ? (savedSelection || []).filter(item => readable(item.node, body) && item.node.textContent === item.original)
            : collectReadingNodes(body).map(node => ({ node, text: proseText(node, body), original: node.textContent }));
        void reader.read({ text: tracked.map(item => item.text).join(action === 'selection' ? '' : '\n'), speaker: voice.value });
    };
    voice.addEventListener('change', () => { preferredVoice = voice.value; try { globalThis.localStorage?.setItem('hearttraceReaderVoice', preferredVoice); } catch {} });
    overlay.addEventListener('click', click);
    const pagehide = () => reader.stop('页面已离开。');
    document.addEventListener('selectionchange', selectionListener);
    window.addEventListener('pagehide', pagehide);
    mounted = { overlay, bar, observer, unsubscribe, selectionListener, pagehide, click };
    connection();
}
