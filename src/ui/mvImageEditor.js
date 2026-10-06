import * as pixels from '../extras/mvImageTools.js';
import * as image_ui from './mvImageEditorUi.js';

// Isolated editor: drafts and undo buffers live here until an explicit save.
export function mountAssetEditor(host, options) {
    host.innerHTML = image_ui.imageEditorMarkup({ hasNext: !!options.onNext, showPrompt: options.showPrompt !== false });
    const root = host.firstElementChild;
    const find = s => root.querySelector(s);
    const canvas = find('[data-editor-canvas]'), g = canvas.getContext('2d', { willReadFrequently: true });
    const prompt = find('[data-editor-prompt]'), status = find('[data-editor-status]');
    find('[data-image-title]').textContent = options.title || '图片编辑';
    find('[data-image-scope]').textContent = options.scopeLabel || '选格、裁切与修边';
    prompt.value = options.prompt || '';
    let active = true, busy = false, loadToken = 0, source = null, sourceBlob = null, importing = false;
    let crop = pixels.normalizeCrop(options.image?.crop) || { x: 0, y: 0, w: 1, h: 1 };
    let stage = 'select', brush = 'erase', grid = 'free', anchor = null, pointerId = null, panning = false;
    let tool = 'grid', comparing = false;
    let original = null, working = null, changed = false, restoreOriginal = false, selectionDirty = false;
    const history = [], urls = new Set();
    const originalRef = options.image?.original || options.image || null;
    const say = text => { if (active) status.textContent = text; };
    const layer = () => find('[data-layer]');
    const viewport = find('.rmt-mv-editor-viewport');
    const cursor = find('[data-brush-cursor]');
    const zoom = () => Number(find('[data-zoom]').value) || 1;
    let toolsOpen = (root.clientWidth || host.clientWidth || 0) >= 740;
    let fittedWidth = 0, fittedAspect = 0, viewSize = null;
    function resetView() {
        find('[data-zoom]').value = '1'; viewport.scrollTop = 0; viewport.scrollLeft = 0;
        fittedWidth = 0; viewSize = null;
    }
    function brushPreview(event = null) {
        const size = Number(find('[data-brush]').value) || 20;
        find('[data-brush-size]').textContent = `${size} 像素`;
        cursor.hidden = busy || stage !== 'paint' || panning || comparing || brush === 'region' || !source;
        if (cursor.hidden) return;
        const r = viewport.getBoundingClientRect();
        cursor.style.width = `${size}px`; cursor.style.height = `${size}px`;
        cursor.style.left = `${(viewport.scrollLeft || 0) + (event ? event.clientX - r.left : (viewport.clientWidth || 360) / 2)}px`;
        cursor.style.top = `${(viewport.scrollTop || 0) + (event ? event.clientY - r.top : (viewport.clientHeight || 180) / 2)}px`;
    }
    const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const duplicate = data => new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
    const load = url => new Promise((resolve, reject) => {
        const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('image unavailable')); img.src = url;
    });
    function dimensions(w, h) { canvas.width = w; canvas.height = h; }
    function show() {
        if (!active) return;
        root.dataset.toolsOpen = String(toolsOpen);
        find('.rmt-mvi-tool-scroll').hidden = !toolsOpen;
        find('[data-edit="tools"]').setAttribute('aria-expanded', String(toolsOpen));
        find('[data-edit="tools"]').textContent = toolsOpen ? '收起工具' : '展开工具';
        if (stage === 'paint') tool = 'brush';
        find('[data-select-tools]').hidden = stage !== 'select'; find('[data-paint-tools]').hidden = stage !== 'paint';
        find('[data-grid-picker]').hidden = tool === 'crop';
        for (const [action, value] of [['select', 'grid'], ['crop', 'crop'], ['paint', 'brush']]) find(`[data-edit="${action}"]`).setAttribute('aria-pressed', String(tool === value));
        find('[data-edit="compare"]').setAttribute('aria-pressed', String(comparing));
        find('[data-edit="pan"]').setAttribute('aria-pressed', String(panning));
        for (const value of ['erase', 'restore', 'region']) find(`[data-edit="${value}"]`).setAttribute('aria-pressed', String(!panning && brush === value));
        find('[data-zoom-value]').textContent = `${Math.round(zoom() * 100)}%`;
        cursor.hidden = true;
        if (!source) return;
        if (comparing) { dimensions(source.naturalWidth, source.naturalHeight); g.drawImage(source, 0, 0); }
        else if (stage === 'select') {
            dimensions(source.naturalWidth, source.naturalHeight); g.drawImage(source, 0, 0);
            if (grid !== 'free') {
                const [rows, cols] = grid.split(':').map(Number);
                g.strokeStyle = '#ffb800'; g.lineWidth = Math.max(1, canvas.width / 350);
                for (let i = 1; i < rows; i++) { g.beginPath(); g.moveTo(0, i * canvas.height / rows); g.lineTo(canvas.width, i * canvas.height / rows); g.stroke(); }
                for (let i = 1; i < cols; i++) { g.beginPath(); g.moveTo(i * canvas.width / cols, 0); g.lineTo(i * canvas.width / cols, canvas.height); g.stroke(); }
            }
            const [x, y, w, h] = pixels.pixelRect(crop, canvas.width, canvas.height);
            g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, canvas.width, y); g.fillRect(0, y + h, canvas.width, canvas.height - y - h); g.fillRect(0, y, x, h); g.fillRect(x + w, y, canvas.width - x - w, h);
            g.strokeStyle = '#ffb800'; g.lineWidth = Math.max(2, canvas.width / 180); g.strokeRect(x, y, w, h);
            find('[data-selection-note]').textContent = `选中 ${w} × ${h} 像素；可重新框选。`;
        } else if (working) { dimensions(working.width, working.height); g.putImageData(working, 0, 0); }
        const availableWidth = viewport.clientWidth || 360;
        const availableHeight = viewport.clientHeight || (globalThis.innerHeight || 800) * 0.55;
        const aspect = canvas.width / canvas.height;
        // At fit size the image follows the viewport. Once zoomed, opening or
        // folding tools must reveal/hide pixels, not rescale the image again.
        const sameImageShape = fittedAspect === aspect;
        if (zoom() === 1 || !fittedWidth || !sameImageShape) fittedWidth = Math.min(availableWidth, availableHeight * aspect);
        fittedAspect = aspect;
        const displayWidth = fittedWidth * zoom(), displayHeight = displayWidth / aspect;
        canvas.style.width = `${displayWidth}px`;
        canvas.style.maxWidth = 'none';
        if (zoom() > 1 && sameImageShape && viewSize && (viewSize.width !== availableWidth || viewSize.height !== availableHeight)) {
            // Keep the inspected detail near the centre when the tool dock or
            // host viewport changes, including phone rotation.
            const x = viewSize.imageWidth <= viewSize.width ? 0.5 : ((viewport.scrollLeft || 0) + viewSize.width / 2) / viewSize.imageWidth;
            const y = viewSize.imageHeight <= viewSize.height ? 0.5 : ((viewport.scrollTop || 0) + viewSize.height / 2) / viewSize.imageHeight;
            viewport.scrollLeft = Math.max(0, x * displayWidth - availableWidth / 2);
            viewport.scrollTop = Math.max(0, y * displayHeight - availableHeight / 2);
        }
        viewSize = { width: availableWidth, height: availableHeight, imageWidth: displayWidth, imageHeight: displayHeight };
        canvas.style.touchAction = panning || comparing ? 'pan-x pan-y' : 'none';
        find('[data-image-size]').textContent = `${canvas.width} × ${canvas.height}`;
    }
    function selectPixels() {
        const [x, y, w, h] = pixels.pixelRect(crop, source.naturalWidth, source.naturalHeight);
        const c = makeCanvas(w, h), context = c.getContext('2d', { willReadFrequently: true });
        context.drawImage(source, x, y, w, h, 0, 0, w, h);
        return context.getImageData(0, 0, w, h);
    }
    function applyCrop() {
        if (!source) return;
        try { original = selectPixels(); working = duplicate(original); history.length = 0; changed = true; selectionDirty = false; restoreOriginal = false; stage = 'paint'; panning = false; resetView(); layer().checked = false; show(); say('已选定画面。可保存，或继续抠图修边。'); }
        catch { say('这张图片无法读取像素。可先下载原图，再从“导入图片”打开；提示词仍可编辑。'); }
    }
    function pushUndo() { if (working) history.push({ data: duplicate(working), layer: layer().checked }); }
    function autoCutout() {
        if (!working) { say('请先载入图片。'); return; }
        if (selectionDirty) { say('请先点“使用选中画面”，再一键抠图。'); return; }
        stage = 'paint'; panning = false;
        const prepared = pixels.prepareCutoutPixels(working.data, working.width, working.height, { multiple: options.multipleCharacters, reference: original?.data || working.data });
        if (!prepared.data) {
            show();
            say(prepared.status === 'needs-selection' ? '这张像是多格图，请先选单格，再一键抠图。'
                : prepared.status === 'empty' ? '未能分离背景：没有识别到可保留的画面，图片未改动。'
                : '未能分离背景，图片未改动；可用擦除笔刷或导入透明图。');
            return;
        }
        pushUndo(); working.data.set(prepared.data); compactUndo();
        changed = true; restoreOriginal = false; layer().checked = true; show();
        say(prepared.borderOnly ? '已去掉外侧白边，画面内部仍保留；请检查后保存。'
            : prepared.status === 'transparent' ? '当前已是透明底，可保存或下载 PNG。'
            : '透明底预览已生成，请检查边缘后保存；可撤销或用恢复笔刷。');
    }
    function compactUndo() {
        const last = history.at(-1); if (!last?.data || !working) return;
        const before = last.data.data, after = working.data;
        let count = 0;
        for (let i = 0; i < before.length; i += 4) if (before[i] !== after[i] || before[i + 1] !== after[i + 1] || before[i + 2] !== after[i + 2] || before[i + 3] !== after[i + 3]) count++;
        if (count * 8 >= before.length) return;
        const positions = new Uint32Array(count), values = new Uint8ClampedArray(count * 4); let n = 0;
        for (let i = 0; i < before.length; i += 4) if (before[i] !== after[i] || before[i + 1] !== after[i + 1] || before[i + 2] !== after[i + 2] || before[i + 3] !== after[i + 3]) {
            positions[n] = i; values.set(before.subarray(i, i + 4), n * 4); n++;
        }
        delete last.data; last.positions = positions; last.values = values;
    }
    function point(event) { const r = canvas.getBoundingClientRect(); return { x: Math.max(0, Math.min(canvas.width, (event.clientX - r.left) / r.width * canvas.width)), y: Math.max(0, Math.min(canvas.height, (event.clientY - r.top) / r.height * canvas.height)) }; }
    function paint(from, to) {
        const radius = Number(find('[data-brush]').value) / 2 * canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
        pixels.paintAlpha(working.data, original.data, working.width, working.height, from, to, radius, brush === 'restore');
        changed = true; restoreOriginal = false; layer().checked = true; g.putImageData(working, 0, 0);
    }
    canvas.addEventListener('pointerdown', event => {
        if (busy || panning || comparing || !source || pointerId !== null) return;
        event.preventDefault(); pointerId = event.pointerId; canvas.setPointerCapture?.(pointerId); anchor = point(event);
        brushPreview(event);
        if (stage === 'paint' && working) {
            pushUndo();
            if (brush === 'region') {
                working.data.set(pixels.eraseMatteAt(working.data, working.width, working.height, anchor.x, anchor.y));
                changed = true; restoreOriginal = false; layer().checked = true; show();
            } else paint(anchor, anchor);
        }
        else if (grid !== 'free') {
            const [rows, cols] = grid.split(':').map(Number);
            crop = pixels.gridCrop(rows, cols, Math.min(rows - 1, Math.floor(anchor.y / canvas.height * rows)) * cols + Math.min(cols - 1, Math.floor(anchor.x / canvas.width * cols))); selectionDirty = true; show();
        }
    });
    canvas.addEventListener('pointermove', event => {
        brushPreview(event);
        if (event.pointerId !== pointerId || !anchor) return;
        event.preventDefault(); const next = point(event);
        if (stage === 'paint' && working) { if (brush !== 'region') paint(anchor, next); anchor = next; }
        else if (grid === 'free') {
            crop = pixels.normalizeCrop({ x: Math.min(anchor.x, next.x) / canvas.width, y: Math.min(anchor.y, next.y) / canvas.height, w: Math.abs(next.x - anchor.x) / canvas.width, h: Math.abs(next.y - anchor.y) / canvas.height }) || crop; selectionDirty = true; show();
        }
    });
    const endStroke = event => { if (event.pointerId === pointerId) { if (stage === 'paint') compactUndo(); anchor = null; pointerId = null; } };
    canvas.addEventListener('pointerup', endStroke); canvas.addEventListener('pointercancel', endStroke); canvas.addEventListener('lostpointercapture', endStroke);
    canvas.addEventListener('pointerleave', () => { cursor.hidden = true; });
    viewport.addEventListener('scroll', () => { cursor.hidden = true; }, { passive: true });
    find('[data-grid]').addEventListener('change', event => { grid = event.target.value; stage = 'select'; tool = 'grid'; panning = false; comparing = false; if (grid !== 'free') { const [rows, cols] = grid.split(':').map(Number); crop = pixels.gridCrop(rows, cols, 0); selectionDirty = true; } show(); });
    find('[data-zoom]').addEventListener('input', () => {
        const before = canvas.getBoundingClientRect(), area = viewport.getBoundingClientRect();
        const width = viewport.clientWidth || 360, height = viewport.clientHeight || 180;
        const x = Math.max(0, Math.min(1, (area.left + width / 2 - before.left) / Math.max(1, before.width)));
        const y = Math.max(0, Math.min(1, (area.top + height / 2 - before.top) / Math.max(1, before.height)));
        show();
        const after = canvas.getBoundingClientRect();
        viewport.scrollLeft = Math.max(0, x * after.width - width / 2);
        viewport.scrollTop = Math.max(0, y * after.height - height / 2);
    });
    find('[data-brush]').addEventListener('input', () => brushPreview());
    layer().addEventListener('change', () => { changed = true; restoreOriginal = false; });
    async function blobOfWorking() {
        if (!working) throw new Error('no pixels');
        const c = makeCanvas(working.width, working.height); c.getContext('2d').putImageData(working, 0, 0);
        return new Promise((resolve, reject) => c.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG unavailable')), 'image/png'));
    }
    async function importFile(input) {
        const file = input.files?.[0]; if (!file || busy) return;
        const token = ++loadToken, url = URL.createObjectURL(file); urls.add(url);
        importing = true;
        say('正在读取图片…');
        try {
            const img = await load(url); if (!active || token !== loadToken) return;
            source = img; sourceBlob = file; crop = { x: 0, y: 0, w: 1, h: 1 }; grid = 'free'; find('[data-grid]').value = grid;
            applyCrop(); layer().checked = input.dataset.import === 'cutout'; say(layer().checked ? '已导入透明图。请检查预览后保存。' : '已导入图片，可返回“选单格”裁切。');
        } catch { if (active && token === loadToken) say('这个图片文件无法打开，原素材未被替换。'); }
        finally { if (active && token === loadToken) importing = false; }
    }
    root.querySelectorAll('[data-import]').forEach(input => input.addEventListener('change', () => void importFile(input)));
    root.querySelectorAll('[data-matte]').forEach(button => button.addEventListener('click', () => {
        find('.rmt-mv-editor-viewport').dataset.editorMatte = button.dataset.matte;
        root.querySelectorAll('[data-matte]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    }));
    root.addEventListener('click', async event => {
        const button = event.target.closest('[data-edit]'); if (!button) return;
        event.preventDefault(); const action = button.dataset.edit;
        if (action === 'close') { options.onClose(); return; }
        if (busy) return;
        if (action === 'tools') { toolsOpen = !toolsOpen; show(); return; }
        if (action === 'default-prompt') { prompt.value = options.defaultPrompt || ''; return; }
        if (importing) { say('图片正在读取，请稍候再保存或编辑。'); return; }
        if (action === 'compare') { comparing = !comparing; show(); return; }
        if (action === 'fit') { resetView(); show(); return; }
        const wasComparing = comparing; comparing = false;
        if (wasComparing) show();
        if (action === 'pan') { panning = !panning; show(); return; }
        if (action === 'select' || action === 'crop') { toolsOpen = true; stage = 'select'; panning = false; tool = action === 'crop' ? 'crop' : 'grid'; if (tool === 'crop') { grid = 'free'; find('[data-grid]').value = grid; } show(); return; }
        if (action === 'paint') { toolsOpen = true; panning = false; if (!working || selectionDirty) applyCrop(); else { stage = 'paint'; show(); } return; }
        if (action === 'apply-crop') { applyCrop(); return; }
        if (action === 'full-crop') { crop = { x: 0, y: 0, w: 1, h: 1 }; grid = 'free'; find('[data-grid]').value = grid; applyCrop(); return; }
        if (action === 'erase' || action === 'restore' || action === 'region') {
            brush = action; panning = false; show(); brushPreview(); return;
        }
        if (action === 'undo') { const last = history.pop(); if (last) {
            if (last.data) working = last.data;
            else last.positions.forEach((pos, i) => working.data.set(last.values.subarray(i * 4, i * 4 + 4), pos));
            layer().checked = last.layer; changed = true; restoreOriginal = false; show();
        } return; }
        if (action === 'reset' && original) { pushUndo(); working = duplicate(original); compactUndo(); layer().checked = false; changed = true; restoreOriginal = false; show(); return; }
        if (action === 'auto') { autoCutout(); return; }
        if (action === 'original') {
            // Restore the saved original reference without rewriting or deleting its pixels.
            restoreOriginal = true; changed = true; selectionDirty = false; sourceBlob = null; crop = { x: 0, y: 0, w: 1, h: 1 }; history.length = 0;
            resetView(); panning = false;
            const token = ++loadToken;
            try { if (options.sourceUrl) { const img = await load(options.sourceUrl); if (!active || token !== loadToken) return; source = img; original = selectPixels(); working = duplicate(original); layer().checked = false; stage = 'paint'; show(); say('原图已恢复，保存后生效。'); } }
            catch { say('原图暂时无法读取；保存仍可恢复原图引用。'); }
            return;
        }
        const saving = action === 'save' || action === 'save-next';
        if (!saving && action !== 'download') return;
        if (saving && selectionDirty) { say('请先点“使用选中画面”，确认单格预览。'); return; }
        busy = true; cursor.hidden = true;
        root.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = el.dataset.edit !== 'close'; });
        say(saving ? '正在保存修改…' : '正在准备 PNG…');
        try {
            const blob = (action === 'download' || (changed && !restoreOriginal)) ? await blobOfWorking() : null;
            if (!active) return;
            if (action === 'download') {
                const url = URL.createObjectURL(blob); urls.add(url); const a = document.createElement('a'); a.href = url; a.download = 'hearttrace-frame.png'; a.click(); say('已下载当前 PNG。');
            } else {
                const result = await options.onSave({ prompt: !prompt.value.trim() || prompt.value === options.defaultPrompt ? null : prompt.value,
                    ...(changed ? { image: { blob, sourceBlob, originalRef, crop, mode: layer().checked ? 'cutout' : 'full', restoreOriginal } } : {}) });
                if (active && result !== false) {
                    if (action === 'save-next' && options.onNext) await options.onNext();
                    else options.onClose();
                }
            }
        } catch { say('保存未完成，编辑内容仍在这里；可重试或先下载 PNG。'); }
        finally { busy = false; if (active) root.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = false; }); }
    });
    const resize = typeof globalThis.ResizeObserver === 'function' ? new globalThis.ResizeObserver(show) : null;
    resize?.observe(find('.rmt-mv-editor-viewport'));
    show();
    const ready = (async () => {
        if (!options.sourceUrl) { say('可以先编辑提示词，或导入自己的图片。'); return; }
        const token = ++loadToken;
        try {
            const loaded = await load(options.sourceUrl); if (!active || token !== loadToken) return; source = loaded;
            original = selectPixels(); working = duplicate(original);
            if (options.image?.editMode && options.imageUrl) {
                const img = await load(options.imageUrl); if (!active || token !== loadToken) return;
                const c = makeCanvas(original.width, original.height); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                working = c.getContext('2d').getImageData(0, 0, c.width, c.height); layer().checked = options.image.editMode === 'cutout'; stage = 'paint';
            }
            if (options.motif && !options.autoCutout) {
                const prepared = pixels.prepareMotifPixels(working.data, working.width, working.height);
                if (prepared.data) {
                    working.data.set(prepared.data); layer().checked = true; stage = 'paint';
                    // Saving confirms the derived PNG; the original reference is retained.
                    changed = prepared.status === 'prepared';
                }
            }
            if (options.autoCharacter && !options.autoCutout && !options.image?.editMode) {
                const prepared = pixels.prepareCharacterPixels(working.data, working.width, working.height, { multiple: options.multipleCharacters });
                if (prepared.data) {
                    working.data.set(prepared.data); layer().checked = true; stage = 'paint';
                    // The current PNG can be downloaded immediately. A prompt-only
                    // save does not commit a replacement image or touch its source.
                }
            }
            show(); say('');
            if (options.autoCutout) autoCutout();
        } catch { if (active && token === loadToken) { show(); say('无法读取图片像素，可导入本机图片继续处理；提示词仍可编辑。'); } }
    })();
    return { ready, dispose() { active = false; loadToken++; resize?.disconnect(); for (const url of urls) URL.revokeObjectURL(url); history.length = 0; } };
}
