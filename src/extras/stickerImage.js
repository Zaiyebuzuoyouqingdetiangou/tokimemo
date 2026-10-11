// Pure pixel helpers for sticker sheets: no DOM, no canvas, no network.
// A sheet is RGBA data on a light background. Stickers are found as separate
// shapes; when the background is not clean enough the sheet is cut by grid.

// Light, nearly neutral pixels connected to the border are background.
function backgroundTest(data, width, height) {
    const corners = [0, width - 1, (height - 1) * width, height * width - 1];
    const matte = [0, 1, 2].map(k => corners.reduce((sum, p) => sum + data[p * 4 + k], 0) / 4);
    const usable = Math.min(...matte) >= 200 && Math.max(...matte) - Math.min(...matte) <= 24;
    const ref = usable ? matte : [255, 255, 255];
    return index => {
        const o = index * 4;
        if (data[o + 3] < 24) return true;
        const r = data[o], g = data[o + 1], b = data[o + 2];
        const near = Math.abs(r - ref[0]) <= 30 && Math.abs(g - ref[1]) <= 30 && Math.abs(b - ref[2]) <= 30;
        const white = Math.min(r, g, b) >= 236 && Math.max(r, g, b) - Math.min(r, g, b) <= 16;
        return near || white;
    };
}

// 1 = background reachable from the border. Enclosed white (eyes, teeth,
// a white shirt inside an outline) stays part of the sticker.
export function outsideMask(data, width, height) {
    const count = width * height, outside = new Uint8Array(count), queue = new Uint32Array(count);
    const bg = backgroundTest(data, width, height);
    let head = 0, tail = 0;
    const add = p => { if (!outside[p] && bg(p)) { outside[p] = 1; queue[tail++] = p; } };
    for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
    for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
    while (head < tail) {
        const p = queue[head++], x = p % width;
        if (x) add(p - 1); if (x + 1 < width) add(p + 1);
        if (p >= width) add(p - width); if (p + width < count) add(p + width);
    }
    return outside;
}

function components(outside, width, height) {
    const count = width * height, labels = new Int32Array(count), queue = new Uint32Array(count), list = [];
    for (let start = 0; start < count; start++) {
        if (outside[start] || labels[start]) continue;
        const id = list.length + 1, row = { id, area: 0, x0: width, y0: height, x1: -1, y1: -1 };
        let head = 0, tail = 0; labels[start] = id; queue[tail++] = start;
        while (head < tail) {
            const p = queue[head++], x = p % width, y = (p - x) / width;
            row.area++;
            if (x < row.x0) row.x0 = x; if (x > row.x1) row.x1 = x;
            if (y < row.y0) row.y0 = y; if (y > row.y1) row.y1 = y;
            const visit = q => { if (!outside[q] && !labels[q]) { labels[q] = id; queue[tail++] = q; } };
            if (x) visit(p - 1); if (x + 1 < width) visit(p + 1);
            if (y) visit(p - width); if (y + 1 < height) visit(p + width);
        }
        list.push(row);
    }
    return { labels, list };
}

const gapBetween = (a, b) => Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1), Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
function union(a, b) {
    return { ids: [...a.ids, ...b.ids], area: a.area + b.area, x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

// Reading order: top to bottom by rows, then left to right.
export function readingOrder(groups) {
    const rows = [], sorted = [...groups].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
    const tall = sorted.reduce((sum, g) => sum + (g.y1 - g.y0 + 1), 0) / Math.max(1, sorted.length);
    for (const group of sorted) {
        const cy = (group.y0 + group.y1) / 2, row = rows.find(r => Math.abs(r.cy - cy) <= tall * 0.5);
        if (row) row.items.push(group); else rows.push({ cy, items: [group] });
    }
    return rows.sort((a, b) => a.cy - b.cy).flatMap(row => row.items.sort((a, b) => (a.x0 + a.x1) - (b.x0 + b.x1)));
}

export function gridRects(width, height, rows, cols) {
    const rects = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x0 = Math.round(c * width / cols), x1 = Math.round((c + 1) * width / cols) - 1;
        const y0 = Math.round(r * height / rows), y1 = Math.round((r + 1) * height / rows) - 1;
        rects.push({ x0, y0, x1, y1 });
    }
    return rects;
}

// Returns pieces in reading order. mode 'shapes' when exactly `count` separate
// stickers were found, otherwise 'grid'. Each piece carries the bounds to crop
// and a membership test for its pixels.
export function splitSheet(data, width, height, { rows = 3, cols = 2, count = rows * cols, grid = false } = {}) {
    if (!width || !height || data.length !== width * height * 4) throw new Error('图片数据不完整。');
    const outside = outsideMask(data, width, height);
    const { labels, list } = components(outside, width, height);
    const total = width * height, side = Math.max(width, height);
    const big = list.filter(row => row.area >= total * 0.004);
    let groups = big.map(row => ({ ids: [row.id], area: row.area, x0: row.x0, y0: row.y0, x1: row.x1, y1: row.y1 }));
    // Sparkles, tears and loose hearts join the nearest sticker when close.
    for (const row of list) {
        if (row.area >= total * 0.004 || row.area < 6 || !groups.length) continue;
        let best = null, distance = Infinity;
        for (const group of groups) { const d = gapBetween(group, row); if (d < distance) { distance = d; best = group; } }
        if (best && distance <= side * 0.035) {
            best.ids.push(row.id); best.area += row.area;
            best.x0 = Math.min(best.x0, row.x0); best.y0 = Math.min(best.y0, row.y0);
            best.x1 = Math.max(best.x1, row.x1); best.y1 = Math.max(best.y1, row.y1);
        }
    }
    // Parts of one sticker that only touch through near-white gaps.
    let merged = true;
    while (merged) {
        merged = false;
        outer: for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
            if (gapBetween(groups[i], groups[j]) <= side * 0.01) {
                groups[i] = union(groups[i], groups[j]); groups.splice(j, 1); merged = true; break outer;
            }
        }
    }
    while (groups.length > count) {
        let best = [0, 1], distance = Infinity;
        for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
            const d = gapBetween(groups[i], groups[j]) + Math.min(groups[i].area, groups[j].area) / total * side;
            if (d < distance) { distance = d; best = [i, j]; }
        }
        groups[best[0]] = union(groups[best[0]], groups[best[1]]); groups.splice(best[1], 1);
    }
    const areas = groups.map(g => g.area).sort((a, b) => a - b), median = areas[Math.floor(areas.length / 2)] || 0;
    const balanced = !grid && groups.length === count && areas[0] >= median * 0.2;
    if (balanced) {
        return { mode: 'shapes', outside, pieces: readingOrder(groups).map(group => {
            const ids = new Set(group.ids);
            return { x0: group.x0, y0: group.y0, x1: group.x1, y1: group.y1, keep: p => !outside[p] && ids.has(labels[p]) };
        }) };
    }
    const cells = gridRects(width, height, rows, cols).slice(0, count);
    return { mode: 'grid', outside, pieces: cells.map(cell => {
        let x0 = cell.x1, y0 = cell.y1, x1 = cell.x0, y1 = cell.y0;
        for (let y = cell.y0; y <= cell.y1; y++) for (let x = cell.x0; x <= cell.x1; x++) {
            if (outside[y * width + x]) continue;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        if (x1 < x0) ({ x0, y0, x1, y1 } = cell);
        return { x0, y0, x1, y1, keep: p => { const x = p % width, y = (p - x) / width;
            return !outside[p] && x >= cell.x0 && x <= cell.x1 && y >= cell.y0 && y <= cell.y1; } };
    }) };
}

// Largest single shape; used when one sticker is redrawn on its own.
export function splitSingle(data, width, height) {
    return splitSheet(data, width, height, { rows: 1, cols: 1, count: 1 });
}

export function cropPiece(data, width, piece) {
    const w = piece.x1 - piece.x0 + 1, h = piece.y1 - piece.y0 + 1, out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = (piece.y0 + y) * width + piece.x0 + x, o = (y * w + x) * 4;
        if (!piece.keep(p)) continue;
        out[o] = data[p * 4]; out[o + 1] = data[p * 4 + 1]; out[o + 2] = data[p * 4 + 2]; out[o + 3] = data[p * 4 + 3];
    }
    return { data: out, width: w, height: h };
}

// Bilinear scale with premultiplied alpha so edges do not pick up dark fringes.
export function scaleImage(source, width, height) {
    const out = new Uint8ClampedArray(width * height * 4), sx = source.width / width, sy = source.height / height, src = source.data;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const fx = Math.max(0, (x + 0.5) * sx - 0.5), fy = Math.max(0, (y + 0.5) * sy - 0.5);
        const x0 = Math.min(source.width - 1, Math.floor(fx)), y0 = Math.min(source.height - 1, Math.floor(fy));
        const x1 = Math.min(source.width - 1, x0 + 1), y1 = Math.min(source.height - 1, y0 + 1), ax = fx - x0, ay = fy - y0;
        let r = 0, g = 0, b = 0, a = 0;
        for (const [px, py, wgt] of [[x0, y0, (1 - ax) * (1 - ay)], [x1, y0, ax * (1 - ay)], [x0, y1, (1 - ax) * ay], [x1, y1, ax * ay]]) {
            const o = (py * source.width + px) * 4, al = src[o + 3] / 255 * wgt;
            r += src[o] * al; g += src[o + 1] * al; b += src[o + 2] * al; a += al;
        }
        const o = (y * width + x) * 4;
        if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; out[o + 3] = a * 255; }
    }
    return { data: out, width, height };
}

// Chamfer distance from every pixel to the nearest opaque pixel.
function distanceToShape(alpha, width, height) {
    const INF = 1e9, d = new Float32Array(width * height);
    for (let i = 0; i < d.length; i++) d[i] = alpha[i] >= 128 ? 0 : INF;
    const a = 1, b = Math.SQRT2;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = y * width + x; let v = d[i];
        if (x) v = Math.min(v, d[i - 1] + a);
        if (y) { v = Math.min(v, d[i - width] + a); if (x) v = Math.min(v, d[i - width - 1] + b); if (x + 1 < width) v = Math.min(v, d[i - width + 1] + b); }
        d[i] = v;
    }
    for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
        const i = y * width + x; let v = d[i];
        if (x + 1 < width) v = Math.min(v, d[i + 1] + a);
        if (y + 1 < height) { v = Math.min(v, d[i + width] + a); if (x + 1 < width) v = Math.min(v, d[i + width + 1] + b); if (x) v = Math.min(v, d[i + width - 1] + b); }
        d[i] = v;
    }
    return d;
}

// Square transparent sticker with a white die-cut outline.
export function finishSticker(piece, size = 360, { outline = 0.035 } = {}) {
    const radius = Math.max(2, Math.round(size * outline)), inner = size - radius * 2 - 4;
    const scale = Math.min(inner / piece.width, inner / piece.height, 3);
    const w = Math.max(1, Math.round(piece.width * scale)), h = Math.max(1, Math.round(piece.height * scale));
    const scaled = scaleImage(piece, w, h), out = new Uint8ClampedArray(size * size * 4);
    const left = Math.floor((size - w) / 2), top = Math.floor((size - h) / 2), alpha = new Uint8Array(size * size);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const s = (y * w + x) * 4, o = ((top + y) * size + left + x) * 4;
        out[o] = scaled.data[s]; out[o + 1] = scaled.data[s + 1]; out[o + 2] = scaled.data[s + 2]; out[o + 3] = scaled.data[s + 3];
        alpha[(top + y) * size + left + x] = scaled.data[s + 3];
    }
    const distance = distanceToShape(alpha, size, size);
    for (let i = 0; i < alpha.length; i++) {
        const ring = Math.max(0, Math.min(1, radius + 1 - distance[i]));
        if (!ring) continue;
        const o = i * 4, fa = out[o + 3] / 255, oa = fa + ring * (1 - fa);
        if (oa <= 0) continue;
        // Source over the white outline.
        for (let k = 0; k < 3; k++) out[o + k] = (out[o + k] * fa + 255 * ring * (1 - fa)) / oa;
        out[o + 3] = oa * 255;
    }
    return { data: out, width: size, height: size };
}

export function stickerLayout(owner, count) {
    const n = Math.max(1, Math.min(owner === 'pair' ? 4 : 6, Math.floor(Number(count) || 0)));
    if (owner === 'pair') return { count: n, rows: n > 2 ? 2 : 1, cols: n > 1 ? 2 : 1, orientation: 'landscape' };
    return { count: n, rows: Math.ceil(n / 2), cols: n > 1 ? 2 : 1, orientation: 'portrait' };
}
