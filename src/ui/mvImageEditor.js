import * as pixels from '../extras/mvImageTools.js';

// Isolated editor: drafts and undo buffers live here until an explicit save.
export function mountAssetEditor(host, options) {
    host.innerHTML = `<section class="rmt-mv-editor rmt-x-card">
      <div class="rmt-mv-editor-tools"><button type="button" data-edit="select">1 · 选单格</button><button type="button" data-edit="paint">2 · 处理背景</button></div>
      <div data-select-tools><label>拼图排列 <select data-grid><option value="free">手动框选</option><option value="1:1">整张</option><option value="2:1">上下两格</option><option value="3:1">上下三格</option><option value="4:1">上下四格</option><option value="1:2">左右两格</option><option value="1:3">左右三格</option><option value="1:4">左右四格</option><option value="2:2">四宫格</option><option value="3:3">九宫格</option></select></label>
      <p class="rmt-x-note" data-selection-note>拖动框选画面，或选择排列后点选一格。</p><button type="button" data-edit="apply-crop">使用选中画面</button></div>
      <div data-paint-tools hidden><div class="rmt-mv-editor-tools"><button type="button" data-edit="auto">${options.motif ? '尝试去背景' : '尝试去白底'}</button><button type="button" data-edit="erase" aria-pressed="true">擦除</button><button type="button" data-edit="restore" aria-pressed="false">恢复</button><button type="button" data-edit="undo">撤销</button><button type="button" data-edit="reset">还原选中画面</button></div>
      <label>笔刷 <input data-brush type="range" min="1" max="100" value="20"></label>
      <label><input data-layer type="checkbox">使用此透明图叠背景</label><p class="rmt-x-note">先看预览再保存；自动处理可能误删白纱、白衣，可用恢复笔刷修回。</p></div>
      <label>放大 <input data-zoom type="range" min="1" max="4" step="0.25" value="1"></label><div class="rmt-mv-editor-tools"><button type="button" data-edit="pan">移动画布</button></div>
      <div class="rmt-mv-editor-viewport"><canvas data-editor-canvas aria-label="素材裁切与抠图画布"></canvas></div>
      <p role="status" data-editor-status></p>
      <div class="rmt-mv-editor-tools"><label class="rmt-mv-editor-upload">导入图片<input type="file" accept="image/*" data-import="full"></label><label class="rmt-mv-editor-upload">导入透明图<input type="file" accept="image/png,image/webp" data-import="cutout"></label><button type="button" data-edit="download">下载当前 PNG</button><button type="button" data-edit="original">恢复原图</button></div>
      <label>本张生图提示词<textarea data-editor-prompt rows="7"></textarea></label><div class="rmt-mv-editor-tools"><button type="button" data-edit="default-prompt">恢复默认提示词</button></div>
      <div class="rmt-mv-editor-tools"><button type="button" data-edit="save">保存修改</button><button type="button" data-edit="close">取消</button></div>
      <p class="rmt-x-note">保存不会重新生图；返回构图卡片后点重画才会使用新提示词。</p>
    </section>`;
    const root = host.firstElementChild;
    const find = s => root.querySelector(s);
    const canvas = find('[data-editor-canvas]'), g = canvas.getContext('2d', { willReadFrequently: true });
    const prompt = find('[data-editor-prompt]'), status = find('[data-editor-status]');
    prompt.value = options.prompt || '';
    let active = true, busy = false, loadToken = 0, source = null, sourceBlob = null, importing = false;
    let crop = pixels.normalizeCrop(options.image?.crop) || { x: 0, y: 0, w: 1, h: 1 };
    let stage = 'select', brush = 'erase', grid = 'free', anchor = null, pointerId = null, panning = false;
    let original = null, working = null, changed = false, restoreOriginal = false, selectionDirty = false;
    const history = [], urls = new Set();
    const originalRef = options.image?.original || options.image || null;
    const say = text => { if (active) status.textContent = text; };
    const layer = () => find('[data-layer]');
    const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const duplicate = data => new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
    const load = url => new Promise((resolve, reject) => {
        const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('image unavailable')); img.src = url;
    });
    function dimensions(w, h) { canvas.width = w; canvas.height = h; }
    function show() {
        if (!active || !source) return;
        find('[data-select-tools]').hidden = stage !== 'select'; find('[data-paint-tools]').hidden = stage !== 'paint';
        if (stage === 'select') {
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
        const availableWidth = find('.rmt-mv-editor-viewport').clientWidth || 360;
        const fitted = Math.min(availableWidth, (globalThis.innerHeight || 800) * 0.55 * canvas.width / canvas.height);
        canvas.style.width = `${fitted * Number(find('[data-zoom]').value)}px`;
        canvas.style.maxWidth = 'none';
        canvas.style.touchAction = panning ? 'pan-x pan-y' : 'none';
    }
    function selectPixels() {
        const [x, y, w, h] = pixels.pixelRect(crop, source.naturalWidth, source.naturalHeight);
        const c = makeCanvas(w, h), context = c.getContext('2d', { willReadFrequently: true });
        context.drawImage(source, x, y, w, h, 0, 0, w, h);
        return context.getImageData(0, 0, w, h);
    }
    function applyCrop() {
        if (!source) return;
        try { original = selectPixels(); working = duplicate(original); history.length = 0; changed = true; selectionDirty = false; restoreOriginal = false; stage = 'paint'; layer().checked = false; show(); say('已选定单格。可以直接保存，或继续处理背景。'); }
        catch { say('这张图片无法读取像素。可先下载原图，再从“导入图片”打开；提示词仍可编辑。'); }
    }
    function pushUndo() { if (working) history.push({ data: duplicate(working), layer: layer().checked }); }
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
        if (busy || panning || !source || pointerId !== null) return;
        event.preventDefault(); pointerId = event.pointerId; canvas.setPointerCapture?.(pointerId); anchor = point(event);
        if (stage === 'paint' && working) { pushUndo(); paint(anchor, anchor); }
        else if (grid !== 'free') {
            const [rows, cols] = grid.split(':').map(Number);
            crop = pixels.gridCrop(rows, cols, Math.min(rows - 1, Math.floor(anchor.y / canvas.height * rows)) * cols + Math.min(cols - 1, Math.floor(anchor.x / canvas.width * cols))); selectionDirty = true; show();
        }
    });
    canvas.addEventListener('pointermove', event => {
        if (event.pointerId !== pointerId || !anchor) return;
        event.preventDefault(); const next = point(event);
        if (stage === 'paint' && working) { paint(anchor, next); anchor = next; }
        else if (grid === 'free') {
            crop = pixels.normalizeCrop({ x: Math.min(anchor.x, next.x) / canvas.width, y: Math.min(anchor.y, next.y) / canvas.height, w: Math.abs(next.x - anchor.x) / canvas.width, h: Math.abs(next.y - anchor.y) / canvas.height }) || crop; selectionDirty = true; show();
        }
    });
    const endStroke = event => { if (event.pointerId === pointerId) { if (stage === 'paint') compactUndo(); anchor = null; pointerId = null; } };
    canvas.addEventListener('pointerup', endStroke); canvas.addEventListener('pointercancel', endStroke); canvas.addEventListener('lostpointercapture', endStroke);
    find('[data-grid]').addEventListener('change', event => { grid = event.target.value; if (grid !== 'free') { const [rows, cols] = grid.split(':').map(Number); crop = pixels.gridCrop(rows, cols, 0); selectionDirty = true; } show(); });
    find('[data-zoom]').addEventListener('input', show);
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
    root.addEventListener('click', async event => {
        const button = event.target.closest('[data-edit]'); if (!button || busy) return;
        event.preventDefault(); const action = button.dataset.edit;
        if (action === 'close') { options.onClose(); return; }
        if (action === 'default-prompt') { prompt.value = options.defaultPrompt || ''; return; }
        if (importing) { say('图片正在读取，请稍候再保存或编辑。'); return; }
        if (action === 'pan') { panning = !panning; button.textContent = panning ? '继续编辑' : '移动画布'; show(); return; }
        if (action === 'select') { stage = 'select'; show(); return; }
        if (action === 'paint') { if (!working || selectionDirty) applyCrop(); else { stage = 'paint'; show(); } return; }
        if (action === 'apply-crop') { applyCrop(); return; }
        if (action === 'erase' || action === 'restore') {
            brush = action; for (const value of ['erase', 'restore']) find(`[data-edit="${value}"]`).setAttribute('aria-pressed', String(value === brush)); return;
        }
        if (action === 'undo') { const last = history.pop(); if (last) {
            if (last.data) working = last.data;
            else last.positions.forEach((pos, i) => working.data.set(last.values.subarray(i * 4, i * 4 + 4), pos));
            layer().checked = last.layer; changed = true; restoreOriginal = false; show();
        } return; }
        if (action === 'reset' && original) { pushUndo(); working = duplicate(original); compactUndo(); layer().checked = false; changed = true; restoreOriginal = false; show(); return; }
        if (action === 'auto' && working) {
            const data = options.motif ? pixels.prepareMotifPixels(working.data, working.width, working.height).data : pixels.eraseEdgeWhite(working.data, working.width, working.height);
            if (!data) { say('未能分离意象背景，可用擦除笔刷处理或导入透明图。'); return; }
            pushUndo(); working.data.set(data); compactUndo(); changed = true; restoreOriginal = false; layer().checked = true; show();
            say(options.motif ? '已处理意象背景，请检查边缘后保存。' : '这是去白底预览，请检查边缘和白色衣物；不满意可撤销或用恢复笔刷。'); return;
        }
        if (action === 'original') {
            // Restore the saved original reference without rewriting or deleting its pixels.
            restoreOriginal = true; changed = true; selectionDirty = false; sourceBlob = null; crop = { x: 0, y: 0, w: 1, h: 1 }; history.length = 0;
            const token = ++loadToken;
            try { if (options.sourceUrl) { const img = await load(options.sourceUrl); if (!active || token !== loadToken) return; source = img; original = selectPixels(); working = duplicate(original); layer().checked = false; stage = 'paint'; show(); say('原图已恢复，保存后生效。'); } }
            catch { say('原图暂时无法读取；保存仍可恢复原图引用。'); }
            return;
        }
        if (action !== 'save' && action !== 'download') return;
        if (action === 'save' && selectionDirty) { say('请先点“使用选中画面”，确认单格预览。'); return; }
        busy = true; root.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = true; });
        try {
            const blob = (action === 'download' || (changed && !restoreOriginal)) ? await blobOfWorking() : null;
            if (!active) return;
            if (action === 'download') {
                const url = URL.createObjectURL(blob); urls.add(url); const a = document.createElement('a'); a.href = url; a.download = 'hearttrace-frame.png'; a.click(); say('已下载当前 PNG。');
            } else {
                const result = await options.onSave({ prompt: !prompt.value.trim() || prompt.value === options.defaultPrompt ? null : prompt.value,
                    ...(changed ? { image: { blob, sourceBlob, originalRef, crop, mode: layer().checked ? 'cutout' : 'full', restoreOriginal } } : {}) });
                if (active && result !== false) options.onClose();
            }
        } catch { say('保存未完成，编辑内容仍在这里；可重试或先下载 PNG。'); }
        finally { busy = false; if (active) root.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = false; }); }
    });
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
            if (options.motif) {
                const prepared = pixels.prepareMotifPixels(working.data, working.width, working.height);
                if (prepared.data) {
                    working.data.set(prepared.data); layer().checked = true; stage = 'paint';
                    // Saving confirms the derived PNG; the original reference is retained.
                    changed = prepared.status === 'prepared';
                }
            }
            show(); say('');
        } catch { if (active && token === loadToken) { show(); say('无法读取图片像素，可导入本机图片继续处理；提示词仍可编辑。'); } }
    })();
    return { ready, dispose() { active = false; loadToken++; for (const url of urls) URL.revokeObjectURL(url); history.length = 0; } };
}
