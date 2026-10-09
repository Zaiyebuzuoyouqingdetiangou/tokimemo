import * as illustration from '../extras/mvIllustration.js';

// Display-only buffers. No source writes, segmentation service or image requests.
const cache = new Map();
let anchors = new WeakMap();
function surface(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function entry(image) {
    if (cache.has(image)) return cache.get(image);
    const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
    const scale = Math.min(1, 1440 / Math.max(iw, ih)), w = Math.max(1, Math.round(iw * scale)), h = Math.max(1, Math.round(ih * scale));
    const row = { iw, ih, w, h, base: surface(w, h), output: surface(w, h), mask: surface(w, h), graphic: null };
    // Check opacity once, only when readable. Opaque art can fill subpixel mesh
    // coverage gaps without leaving a second outline on transparent sprites.
    try {
        const g = row.base.getContext('2d'); g.drawImage(image, 0, 0, w, h);
        const pixels = g.getImageData(0, 0, w, h).data; row.opaque = true;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) { row.opaque = false; break; }
    } catch { row.opaque = false; }
    cache.set(image, row);
    while (cache.size > 2) cache.delete(cache.keys().next().value);
    return row;
}
function graphic(image, row) {
    if (row.graphic) return row.graphic;
    const { w, h } = row, c = surface(w, h), g = c.getContext('2d'); g.drawImage(image, 0, 0, w, h);
    try {
        const pixels = g.getImageData(0, 0, w, h), d = pixels.data;
        for (let i = 0; i < d.length; i += 4) {
            const l = d[i] * .2126 + d[i + 1] * .7152 + d[i + 2] * .0722;
            // Inverted ink masses retain narrow edge tones instead of flat grey art.
            const v = l < 102 ? 242 : l > 150 ? 19 : Math.round(242 - (l - 102) * 223 / 48);
            d[i] = d[i + 1] = d[i + 2] = v;
        }
        g.putImageData(pixels, 0, 0);
    } catch {
        // Cross-origin readback can fail; compositing still reveals the original art.
        g.globalCompositeOperation = 'saturation'; g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = 'destination-in'; g.drawImage(image, 0, 0, w, h);
    }
    row.graphic = c; return c;
}
function revealed(image, row, cue, legacy) {
    const { base, mask, w, h } = row, g = base.getContext('2d');
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h);
    if (cue.reveal !== 'bloom' || cue.progress >= 1) { legacy(g, image, [0, 0, w, h], cue); return base; }
    g.drawImage(graphic(image, row), 0, 0);
    const p = Math.max(0, cue.progress || 0);
    if (!p) return base;
    const mg = mask.getContext('2d'); mg.globalCompositeOperation = 'source-over'; mg.clearRect(0, 0, w, h);
    // Main focus opens first; two smaller, delayed regions make the spread irregular.
    const fx = cue.focusX ?? .5, fy = cue.focusY ?? .38;
    for (const [x, y, delay, scale] of [[fx, fy, 0, 1], [fx * .55, .76, .14, .72], [.62 + fx * .25, .5, .28, .7]]) {
        const q = Math.max(0, (p - delay) / (1 - delay)); if (!q) continue;
        const radius = Math.hypot(w, h) * q * scale * 1.3;
        const grad = mg.createRadialGradient(x * w, y * h, 0, x * w, y * h, Math.max(1, radius));
        grad.addColorStop(0, '#fff'); grad.addColorStop(.56, '#fff'); grad.addColorStop(1, 'rgba(255,255,255,0)');
        mg.fillStyle = grad; mg.fillRect(0, 0, w, h);
    }
    mg.globalCompositeOperation = 'source-in'; mg.drawImage(image, 0, 0, w, h);
    // source-atop keeps antialiased transparency equal to the source alpha.
    g.globalCompositeOperation = 'source-atop'; g.drawImage(mask, 0, 0);
    g.globalCompositeOperation = 'source-over'; return base;
}
function triangle(g, source, a, b, c, da, db, dc) {
    const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - a.x, vy = c.y - a.y, det = ux * vy - uy * vx;
    if (Math.abs(det) < .001) return;
    const ex = db.x - da.x, ey = db.y - da.y, fx = dc.x - da.x, fy = dc.y - da.y;
    const m0 = (ex * vy - fx * uy) / det, m1 = (ey * vy - fy * uy) / det;
    const m2 = (fx * ux - ex * vx) / det, m3 = (fy * ux - ey * vx) / det;
    g.save(); g.beginPath();
    // Subpixel overlap prevents fine cracks along the internal mesh edges.
    const cx = (da.x + db.x + dc.x) / 3, cy = (da.y + db.y + dc.y) / 3;
    [da, db, dc].forEach((v, i) => { const d = Math.max(1, Math.hypot(v.x - cx, v.y - cy)); const x = v.x + (v.x - cx) / d * 1.5, y = v.y + (v.y - cy) / d * 1.5; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.closePath(); g.clip(); g.transform(m0, m1, m2, m3, da.x - m0 * a.x - m2 * a.y, da.y - m1 * a.x - m3 * a.y);
    g.drawImage(source, 0, 0); g.restore();
}
function moved(source, row, cue) {
    if (cue.movement !== 'local' || !cue.motionRegions?.some(r => r.amount > 0)) return source;
    const { w, h, output } = row, g = output.getContext('2d'); g.clearRect(0, 0, w, h); g.drawImage(source, 0, 0);
    for (const region of cue.motionRegions) {
        if (!region.amount) continue;
        const x0 = Math.floor(region.x * w), y0 = Math.floor(region.y * h);
        const rw = Math.ceil((region.x + region.w) * w) - x0, rh = Math.ceil((region.y + region.h) * h) - y0;
        const point = (x, y) => ({ x, y });
        const move = p => { const d = illustration.localOffset(cue, p.x / w, p.y / h, cue.time || 0); return { x: p.x + d.x * w, y: p.y + d.y * h }; };
        g.save(); g.beginPath(); g.rect(x0, y0, rw, rh); g.clip(); g.clearRect(x0, y0, rw, rh);
        const nx = 4, ny = 6;
        for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
            const a = point(x0 + rw * x / nx, y0 + rh * y / ny), b = point(x0 + rw * (x + 1) / nx, a.y);
            const c = point(b.x, y0 + rh * (y + 1) / ny), d = point(a.x, c.y);
            const da = move(a), db = move(b), dc = move(c), dd = move(d);
            triangle(g, source, a, b, c, da, db, dc); triangle(g, source, a, c, d, da, dc, dd);
        }
        g.restore();
    }
    if (row.opaque) { g.globalCompositeOperation = 'destination-over'; g.drawImage(source, 0, 0); g.globalCompositeOperation = 'source-over'; }
    // Restore protected regions exactly; interpolation never redraws eyes or hands.
    for (const r of cue.protect || []) {
        const x = Math.floor(r.x * w), y = Math.floor(r.y * h), rw = Math.ceil(r.w * w), rh = Math.ceil(r.h * h);
        g.save(); g.beginPath(); g.rect(x, y, rw, rh); g.clip(); g.clearRect(x, y, rw, rh); g.drawImage(source, 0, 0); g.restore();
    }
    return output;
}
export function placeLight(g, image, args, cue) {
    if (!cue || (cue.light !== 'focus' && cue.particles !== 'glints')) return;
    const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
    let sx = 0, sy = 0, sw = iw, sh = ih, dx = args[0], dy = args[1], dw = args[2] ?? iw, dh = args[3] ?? ih;
    if (args.length === 8) [sx, sy, sw, sh, dx, dy, dw, dh] = args;
    const x = dx + ((cue.lightX ?? .72) * iw - sx) * dw / sw, y = dy + ((cue.lightY ?? .25) * ih - sy) * dh / sh;
    const m = g.getTransform(); anchors.set(cue, { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
}
export function drawPicture(g, image, args, cue, legacy) {
    // Completed, still artwork uses the untouched full-resolution image.
    if ((cue.reveal === 'none' || cue.progress >= 1) && (cue.movement !== 'local' || !cue.motionRegions?.some(r => r.amount > 0))) { g.drawImage(image, ...args); return; }
    try {
        const row = entry(image), result = moved(revealed(image, row, cue, legacy), row, cue);
        const a = [...args];
        if (a.length === 8) { a[0] *= row.w / row.iw; a[1] *= row.h / row.ih; a[2] *= row.w / row.iw; a[3] *= row.h / row.ih; }
        else if (a.length === 2) a.push(row.iw, row.ih);
        g.drawImage(result, ...a);
    } catch { g.drawImage(image, ...args); }
}
function color(cue, palette) {
    const value = cue.color || palette?.[2] || '#ad96cc';
    return /^(?:#[0-9a-f]{6}|rgb\(\d{1,3},\d{1,3},\d{1,3}\))$/iu.test(value) ? value : '#ad96cc';
}
function anchor(cue, w, h) { return anchors.get(cue) || { x: (cue.lightX ?? .72) * w, y: (cue.lightY ?? .25) * h }; }
export function drawLight(g, cue, w, h, palette) {
    const { x, y } = anchor(cue, w, h), size = Math.min(w, h), t = cue.songTime || 0;
    g.save(); g.globalCompositeOperation = 'screen'; g.globalAlpha *= .22 + .04 * Math.sin(t * .8);
    const glow = g.createRadialGradient(x, y, 0, x, y, size * .28);
    glow.addColorStop(0, color(cue, palette)); glow.addColorStop(.18, color(cue, palette)); glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow; g.fillRect(0, 0, w, h);
    g.globalAlpha *= .65; g.translate(x, y); g.rotate(.12 * Math.sin(t * .4));
    const flare = g.createLinearGradient(-size * .18, 0, size * .18, 0);
    flare.addColorStop(0, 'rgba(255,255,255,0)'); flare.addColorStop(.5, '#fff'); flare.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = flare; g.fillRect(-size * .18, -size * .0012, size * .36, size * .0024); g.restore();
}
export function drawParticles(g, cue, w, h, palette) {
    const { x, y } = anchor(cue, w, h), size = Math.min(w, h), t = cue.songTime || 0;
    g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = color(cue, palette);
    // Bounded local decoration pool, unrelated to requested or saved image counts.
    for (let i = 0; i < 9; i++) {
        const phase = i * 2.399, radius = size * (.025 + i * .015), pulse = .5 + .5 * Math.sin(t * 1.2 + phase);
        const px = x + Math.cos(phase + t * .045) * radius, py = y + Math.sin(phase) * radius * .7 - Math.sin(t * .45 + phase) * size * .015;
        g.save(); g.globalAlpha *= .14 + pulse * .34; g.beginPath(); g.arc(px, py, Math.max(.5, size * (.0008 + pulse * .0012)), 0, Math.PI * 2); g.fill(); g.restore();
    }
    g.restore();
}
export function clear() { cache.clear(); anchors = new WeakMap(); }
