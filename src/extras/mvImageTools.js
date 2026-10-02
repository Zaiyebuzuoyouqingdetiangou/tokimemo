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
