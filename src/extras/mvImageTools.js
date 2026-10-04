// Local pixel tools. A removed area is never a quality score or permission to layer.
export function normalizeCrop(value) {
    if (!value || !['x', 'y', 'w', 'h'].every(k => Number.isFinite(value[k]))) return null;
    const x = Math.max(0, Math.min(1, value.x)), y = Math.max(0, Math.min(1, value.y));
    const w = Math.min(1 - x, value.w), h = Math.min(1 - y, value.h);
    return w > 0 && h > 0 ? { x, y, w, h } : null;
}

export function gridCrop(rows, columns, index) {
    if (![rows, columns, index].every(Number.isInteger) || rows < 1 || columns < 1 || index < 0 || index >= rows * columns) return null;
    return { x: (index % columns) / columns, y: Math.floor(index / columns) / rows, w: 1 / columns, h: 1 / rows };
}

export function pixelRect(value, width, height) {
    const c = normalizeCrop(value) || { x: 0, y: 0, w: 1, h: 1 };
    const x = Math.min(width - 1, Math.floor(c.x * width)), y = Math.min(height - 1, Math.floor(c.y * height));
    return [x, y, Math.max(1, Math.min(width, Math.round((c.x + c.w) * width)) - x), Math.max(1, Math.min(height, Math.round((c.y + c.h) * height)) - y)];
}

// Preview only: remove edge-connected near-white. Enclosed white clothing stays intact.
export function eraseEdgeWhite(data, width, height) {
    const out = new Uint8ClampedArray(data), seen = new Uint8Array(width * height), queue = [];
    for (let x = 0; x < width; x++) queue.push(x, (height - 1) * width + x);
    for (let y = 0; y < height; y++) queue.push(y * width, y * width + width - 1);
    while (queue.length) {
        const p = queue.pop();
        if (seen[p]) continue;
        seen[p] = 1;
        const i = p * 4, min = Math.min(out[i], out[i + 1], out[i + 2]), max = Math.max(out[i], out[i + 1], out[i + 2]);
        if (out[i + 3] !== 0 && !(min > 228 && max - min < 26)) continue;
        out[i + 3] = 0;
        const x = p % width;
        if (x > 0) queue.push(p - 1);
        if (x + 1 < width) queue.push(p + 1);
        if (p >= width) queue.push(p - width);
        if (p + width < width * height) queue.push(p + width);
    }
    return out;
}

// Distance to a brush stroke segment, so fast pointer movement leaves no gaps.
export function paintAlpha(data, original, width, height, from, to, radius, restore = false) {
    const dx = to.x - from.x, dy = to.y - from.y, length = dx * dx + dy * dy;
    const x0 = Math.max(0, Math.floor(Math.min(from.x, to.x) - radius)), x1 = Math.min(width - 1, Math.ceil(Math.max(from.x, to.x) + radius));
    const y0 = Math.max(0, Math.floor(Math.min(from.y, to.y) - radius)), y1 = Math.min(height - 1, Math.ceil(Math.max(from.y, to.y) + radius));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const t = length ? Math.max(0, Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / length)) : 0;
        if ((x - from.x - t * dx) ** 2 + (y - from.y - t * dy) ** 2 > radius ** 2) continue;
        const i = (y * width + x) * 4;
        if (restore) for (let k = 0; k < 4; k++) data[i + k] = original[i + k];
        else data[i + 3] = 0;
    }
}

export function alphaBounds(data, width, height) {
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] <= 40) continue;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return x1 >= x0 ? { cx: (x1 + x0) / 2 / width, bottom: y1 / height, height: Math.max(1, y1 - y0 + 1) / height } : null;
}

// Character layers: accept real alpha, or a uniform light matte connected to
// the perimeter. Never select a panel or infer success from removed area.
export function prepareCharacterPixels(data, width, height, { multiple = false, manual = false } = {}) {
    const count = width * height;
    if (!count || data.length !== count * 4) return { status: 'empty' };
    const bounds = alphaBounds(data, width, height);
    if (!bounds) return { status: 'empty' };
    const edges = [[], [], [], []];
    for (let x = 0; x < width; x++) { edges[0].push(x); edges[1].push(count - width + x); }
    for (let y = 0; y < height; y++) { edges[2].push(y * width); edges[3].push(y * width + width - 1); }
    const edge = edges.flat(), corners = [0, width - 1, count - width, count - 1];
    // Existing alpha is kept exactly; a manually edited mask is never re-keyed.
    if (edge.some(p => data[p * 4 + 3] < 250) || (manual && data.some((v, i) => i % 4 === 3 && v < 255)))
        return { status: 'transparent', data };
    if (manual) return { status: 'needs-edit' };
    const matte = [0, 1, 2].map(k => corners.reduce((sum, p) => sum + data[p * 4 + k], 0) / 4);
    const neutral = Math.min(...matte) >= 180 && Math.max(...matte) - Math.min(...matte) <= 20;
    const blue = matte[2] > 160 && matte[2] - matte[0] > 120 && matte[2] - matte[1] > 100;
    const close = p => matte.every((v, k) => Math.abs(v - data[p * 4 + k]) <= 24);
    if ((!neutral && !blue) || !corners.every(close) || edges.filter(row => row.filter(close).length >= row.length * .9).length < 3)
        return { status: 'needs-edit' };
    const out = new Uint8ClampedArray(data), seen = new Uint8Array(count), removed = new Uint8Array(count), queue = new Uint32Array(count);
    let head = 0, tail = 0;
    const add = p => { if (!seen[p]) { seen[p] = 1; queue[tail++] = p; } };
    const neighbours = (p, visit) => {
        if (p % width) visit(p - 1); if (p % width + 1 < width) visit(p + 1);
        if (p >= width) visit(p - width); if (p + width < count) visit(p + width);
    };
    edge.forEach(add);
    while (head < tail) {
        const p = queue[head++]; if (!close(p)) continue;
        removed[p] = 1; out[p * 4 + 3] = 0; neighbours(p, add);
    }
    const rows = new Uint32Array(height), columns = new Uint32Array(width);
    let x0 = width, y0 = height, x1 = -1, y1 = -1, foreground = 0;
    for (let p = 0; p < count; p++) if (!removed[p]) {
        const x = p % width, y = Math.floor(p / width); rows[y]++; columns[x]++; foreground++;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (!foreground) return { status: 'empty' };
    // A white border around an opaque illustration is not a character cutout.
    const lineSolid = (from, length, step) => {
        let n = 0; for (let i = 0; i < length; i++) if (!removed[from + i * step]) n++;
        return n >= length * .9;
    };
    if (lineSolid(y0 * width + x0, x1 - x0 + 1, 1) && lineSolid(y1 * width + x0, x1 - x0 + 1, 1)
        && lineSolid(y0 * width + x0, y1 - y0 + 1, width) && lineSolid(y0 * width + x1, y1 - y0 + 1, width))
        return { status: 'needs-edit' };
    // Separated, substantial figures may be a contact sheet. Keep it intact
    // until a cell is chosen; never guess the upper/left half.
    const separated = projection => {
        let before = 0, gap = 0;
        for (const n of projection) {
            if (!n) gap++; else gap = 0;
            before += n;
            if (gap >= Math.max(2, Math.ceil(projection.length * .015)) && before > foreground * .25 && foreground - before > foreground * .25) return true;
        }
        return false;
    };
    if (separated(rows) || (!multiple && separated(columns))) return { status: 'needs-selection' };
    // Unmix the outer fringe only; enclosed whites (eyes, clothing) stay intact.
    for (let p = 0; p < count; p++) {
        if (removed[p]) continue;
        let fringe = false; neighbours(p, n => { if (removed[n]) fringe = true; });
        if (!fringe) continue;
        const i = p * 4;
        const alpha = Math.max(...matte.map((v, k) => Math.abs(data[i + k] - v) / Math.max(1, data[i + k] < v ? v : 255 - v)));
        if (alpha <= 0 || alpha >= .98) continue;
        out[i + 3] = Math.round(data[i + 3] * alpha);
        for (let k = 0; k < 3; k++) out[i + k] = Math.max(0, Math.min(255, Math.round((data[i + k] - matte[k] * (1 - alpha)) / alpha)));
    }
    return { status: 'prepared', data: out };
}

// Decorative sprites only. Keep genuine alpha and enclosed white details;
// flattening a background does not establish that the foreground was recovered.
export function prepareMotifPixels(data, width, height) {
    const count = width * height;
    const corners = [0, width - 1, count - width, count - 1];
    let visible = false;
    for (let p = 0; p < count; p++) if (data[p * 4 + 3] > 8) { visible = true; break; }
    if (!visible) return { status: 'empty' };
    if (corners.every(p => data[p * 4 + 3] <= 8)) return { status: 'transparent', data };
    const rgb = corners.map(p => [...data.slice(p * 4, p * 4 + 3)]);
    const matte = [0, 1, 2].map(k => rgb.reduce((sum, color) => sum + color[k], 0) / 4);
    const white = Math.min(...matte) >= 228 && Math.max(...matte) - Math.min(...matte) < 26;
    const blue = matte[2] > 160 && matte[2] - matte[0] > 120 && matte[2] - matte[1] > 100;
    const close = p => data[p * 4 + 3] <= 8 || matte.every((v, k) => Math.abs(v - data[p * 4 + k]) <= 30);
    if ((!white && !blue) || !corners.every(close)) return { status: 'needs-edit' };
    // Background evidence comes from a consistent perimeter, not removed area.
    let border = 0, matching = 0;
    const edge = [];
    for (let x = 0; x < width; x++) edge.push(x, (height - 1) * width + x);
    for (let y = 1; y < height - 1; y++) edge.push(y * width, y * width + width - 1);
    for (const p of edge) { border++; if (close(p)) matching++; }
    if (matching < border * 0.95) return { status: 'needs-edit' };
    const out = new Uint8ClampedArray(data), seen = new Uint8Array(count), removed = new Uint8Array(count);
    const queue = [...edge];
    const neighbours = (p, add) => {
        const x = p % width;
        if (x > 0) add(p - 1); if (x + 1 < width) add(p + 1);
        if (p >= width) add(p - width); if (p + width < count) add(p + width);
    };
    while (queue.length) {
        const p = queue.pop(); if (seen[p]) continue; seen[p] = 1;
        if (!close(p)) continue;
        removed[p] = 1; out[p * 4 + 3] = 0;
        neighbours(p, n => { if (!seen[n]) queue.push(n); });
    }
    // Unmix only the one-pixel outer fringe; never recolour an enclosed white part.
    for (let p = 0; p < count; p++) {
        if (removed[p]) continue;
        let fringe = false; neighbours(p, n => { if (removed[n]) fringe = true; });
        if (!fringe) continue;
        const i = p * 4;
        const alpha = Math.max(...matte.map((v, k) => Math.abs(data[i + k] - v) / Math.max(1, data[i + k] < v ? v : 255 - v)));
        if (alpha <= 0 || alpha >= 0.98) continue;
        out[i + 3] = Math.round(data[i + 3] * alpha);
        for (let k = 0; k < 3; k++) out[i + k] = Math.max(0, Math.min(255, Math.round((data[i + k] - matte[k] * (1 - alpha)) / alpha)));
    }
    if (!alphaBounds(out, width, height)) return { status: 'empty' };
    if (!corners.every(p => out[p * 4 + 3] <= 8)) return { status: 'needs-edit' };
    return { status: 'prepared', data: out };
}
