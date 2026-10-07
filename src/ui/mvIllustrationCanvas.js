// Uses ordinary Canvas compositing, not CSS/Canvas filters or generated drawing code.
// Derived images are display-only. The source art, crop and saved pixels stay untouched.
// Only current/transition pictures keep a derived buffer; this never limits source assets.
let tones = new Map();
let revealSurface = null;

function surface(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

function variant(image, mode) {
    const row = tones.get(image);
    if (row?.mode === mode) return row.canvas;
    const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
    const c = surface(w, h), g = c.getContext('2d');
    g.drawImage(image, 0, 0, w, h);
    if (mode === 'silhouette') {
        g.globalCompositeOperation = 'source-in'; g.fillStyle = '#171b29'; g.fillRect(0, 0, w, h);
    } else {
        // Saturation blending removes colour without readback, including cross-origin art.
        g.globalCompositeOperation = 'saturation'; g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = 'destination-in'; g.drawImage(image, 0, 0, w, h);
    }
    tones.delete(image); tones.set(image, { mode, canvas: c });
    while (tones.size > 2) tones.delete(tones.keys().next().value);
    return c;
}

export function drawPicture(g, image, args, cue = null) {
    if (!cue || cue.reveal === 'none' || cue.progress >= 1) { g.drawImage(image, ...args); return; }
    let mono, overlay;
    try {
        mono = variant(image, cue.reveal);
        const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
        if (!revealSurface || revealSurface.width !== w || revealSurface.height !== h) revealSurface = surface(w, h);
        const c = revealSurface, paint = c.getContext('2d');
        paint.globalCompositeOperation = 'source-over'; paint.clearRect(0, 0, w, h); paint.drawImage(image, 0, 0, w, h);
        const feather = Math.max(1, w * .2), edge = cue.progress * (w + feather * 2) - feather * 2;
        const mask = paint.createLinearGradient(edge, 0, edge + feather, 0);
        mask.addColorStop(0, '#fff'); mask.addColorStop(1, 'rgba(255,255,255,0)');
        paint.globalCompositeOperation = 'destination-in'; paint.fillStyle = mask; paint.fillRect(0, 0, w, h);
        paint.globalCompositeOperation = 'source-over'; overlay = c;
    } catch { g.drawImage(image, ...args); return; }
    g.drawImage(mono, ...args); g.drawImage(overlay, ...args);
}

function colorOf(cue, palette) {
    const color = cue.color || palette?.[2] || '#ad96cc';
    return /^(?:#[0-9a-f]{6}|rgb\(\d{1,3},\d{1,3},\d{1,3}\))$/iu.test(color) ? color : '#ad96cc';
}

export function drawLight(g, cue, w, h, palette, foreground = false) {
    if (!cue || cue.light === 'none') return;
    const t = cue.songTime, x = w * (.52 + .07 * Math.sin(t * .28)), y = h * .38;
    g.save(); g.globalCompositeOperation = 'screen';
    g.globalAlpha *= (foreground ? .18 : .42) * (.86 + .14 * Math.sin(t * .9));
    const glow = g.createRadialGradient(x, y, 0, x, y, Math.max(w, h) * .65);
    glow.addColorStop(0, colorOf(cue, palette)); glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow; g.fillRect(0, 0, w, h);
    if (cue.light === 'rays') {
        g.translate(x, y); g.rotate(Math.sin(t * .18) * .2); g.globalAlpha *= .45;
        const length = Math.hypot(w, h);
        for (let i = 0; i < 3; i++) {
            g.rotate(.38); g.beginPath(); g.moveTo(-w * .025, -length); g.lineTo(w * .025, -length);
            g.lineTo(w * .13, length); g.lineTo(-w * .13, length); g.closePath(); g.fill();
        }
    }
    g.restore();
}

export function drawParticles(g, cue, w, h, palette) {
    if (!cue || cue.particles === 'none') return;
    g.save(); g.fillStyle = colorOf(cue, palette); g.globalCompositeOperation = 'screen';
    const scale = Math.min(w, h), t = cue.songTime;
    // A small local decoration pool, not a generation or saved-asset limit.
    for (let i = 0; i < 16; i++) {
        const seed = ((i * 73 + 19) % 101) / 101, side = i % 2 ? .7 : .05;
        const x = w * (side + seed * .23 + .012 * Math.sin(t * .6 + i));
        const y = (((i * .137 - t * (.017 + seed * .016)) % 1 + 1) % 1) * h;
        const radius = scale * (cue.particles === 'spark' ? .004 + seed * .006 : .002 + seed * .003);
        g.save(); g.globalAlpha *= .2 + .36 * (.5 + .5 * Math.sin(t * 1.7 + i * 2)); g.translate(x, y);
        g.beginPath();
        if (cue.particles === 'spark') {
            for (let n = 0; n < 8; n++) {
                const a = n * Math.PI / 4, r = n % 2 ? radius * .25 : radius;
                const xx = Math.cos(a) * r, yy = Math.sin(a) * r; if (!n) g.moveTo(xx, yy); else g.lineTo(xx, yy);
            }
            g.closePath();
        } else g.arc(0, 0, radius, 0, Math.PI * 2);
        g.fill(); g.restore();
    }
    g.restore();
}

export function clear() { tones.clear(); revealSurface = null; }
