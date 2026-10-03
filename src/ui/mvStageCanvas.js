// Deterministic Canvas layers shared by preview, screen recording and export.
// The model supplies only enumerated scene data; it never supplies executable drawing code.
export function drawBackground(g, background, w, h, time, tone = 'base', picture = null) {
    const colors = background.colors || ['#203047', '#e4d6bb', '#bd6683'];
    const base = tone === 'accent' ? colors[2] : colors[0];
    g.save(); g.fillStyle = base; g.fillRect(0, 0, w, h);
    if (picture && background.kind === 'image') {
        const moving = background.motion !== 'still';
        const r = Math.max(w / picture.naturalWidth, h / picture.naturalHeight) * (moving ? 1.08 : 1);
        g.save(); g.translate(w / 2, h / 2);
        if (background.motion === 'rotate') g.rotate(Math.sin(time * 0.45) * 0.02);
        if (background.motion === 'drift') g.translate(Math.sin(time * 0.45) * w * 0.015, 0);
        g.drawImage(picture, -picture.naturalWidth * r / 2, -picture.naturalHeight * r / 2, picture.naturalWidth * r, picture.naturalHeight * r);
        g.restore();
        if (tone === 'accent') { g.globalAlpha = 0.2; g.fillStyle = colors[2]; g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
    } else {
        const kind = background.kind, size = Math.hypot(w, h);
        const angle = background.motion === 'rotate' ? time * 0.09 : 0;
        const drift = background.motion === 'drift' ? Math.sin(time * 0.45) * w * 0.025 : 0;
        g.save(); g.translate(w / 2 + drift, h / 2); g.rotate(angle);
        g.fillStyle = colors[1];
        if (kind === 'rays') {
            for (let i = 0; i < 12; i++) {
                const a = i * Math.PI / 6, b = a + Math.PI / 12;
                g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * size, Math.sin(a) * size);
                g.lineTo(Math.cos(b) * size, Math.sin(b) * size); g.closePath(); g.fill();
            }
        } else if (kind === 'stripes') {
            g.rotate(-0.4); const step = Math.min(w, h) * 0.16;
            for (let x = -size; x < size; x += step) g.fillRect(x, -size, step * 0.4, size * 2);
        } else if (kind === 'window') {
            g.globalAlpha = 0.4; const step = Math.min(w, h) * 0.22, line = Math.max(2, Math.min(w, h) * 0.008);
            for (let x = -size; x < size; x += step) g.fillRect(x, -size, line, size * 2);
            for (let y = -size; y < size; y += step * 1.4) g.fillRect(-size, y, size * 2, line);
        } else if (kind === 'paper') {
            g.globalAlpha = 0.13;
            for (let i = 0; i < 150; i++) {
                const x = ((i * 137) % 997) / 997 * size * 2 - size;
                const y = ((i * 293) % 991) / 991 * size * 2 - size;
                g.fillRect(x, y, Math.max(1, w * 0.012), Math.max(1, h * 0.002));
            }
        }
        g.restore();
    }
    if (tone === 'dark') { g.globalAlpha = 0.48; g.fillStyle = '#080c15'; g.fillRect(0, 0, w, h); }
    g.restore();
}

function linesFor(g, value, width) {
    const lines = []; let line = '';
    for (const c of Array.from(value)) {
        if (c === '\n' || (line && g.measureText(line + c).width > width)) { lines.push(line); line = c === '\n' ? '' : c; }
        else line += c;
    }
    if (line) lines.push(line);
    return lines;
}

export function drawText(g, state, group, w, h, font, forceFront = false) {
    if (!state?.active || !state.text || state.cue.layout === 'none') return;
    const layout = forceFront ? 'banner' : state.cue.layout || 'sides';
    const color = state.background.colors?.[1] || '#fffdf8';
    const front = forceFront || state.cue.depth === 'front';
    const width = w * (layout === 'banner' ? 0.82 : layout === 'stack' ? 0.38 : 0.28);
    const maxHeight = h * (layout === 'banner' ? 0.16 : 0.65);
    let size = Math.min(w, h) * (layout === 'banner' ? 0.065 : 0.14);
    g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.font = `${font.weight} ${size}px ${font.stack}`;
    let lines = linesFor(g, state.text, width);
    // Fit the actual text inside its reserved area; no clipping or lost words.
    while (lines.length * size * 1.2 > maxHeight && size > 2) {
        size *= 0.88; g.font = `${font.weight} ${size}px ${font.stack}`; lines = linesFor(g, state.text, width);
    }
    const points = layout === 'sides' ? [w * 0.18, w * 0.82]
        : [layout === 'stack' ? w * (group?.position === 'right' ? 0.24 : 0.76) : w / 2];
    const y = layout === 'banner' ? h * 0.83 : h * 0.44;
    g.fillStyle = color; g.strokeStyle = '#141722'; g.lineWidth = Math.max(1, size * (front ? 0.09 : 0.035));
    const count = layout === 'stack' ? Math.min(lines.length, 1 + Math.floor(state.textTime / 0.24)) : lines.length;
    for (const x of points) for (let i = 0; i < count; i++) {
        const yy = y + (i - (lines.length - 1) / 2) * size * 1.2;
        g.strokeText(lines[i], x, yy); g.fillText(lines[i], x, yy);
    }
    g.restore();
}

export function poseTransform(state, w, h) {
    const progress = Math.min(1, state.poseTime / 0.24);
    if (state.entrance === 'pop') return { x: 0, y: 0, scale: 1 + 0.055 * Math.sin(progress * Math.PI) };
    if (state.entrance === 'slide') return { x: -w * 0.08 * (1 - progress) ** 3, y: 0, scale: 1 };
    return { x: 0, y: 0, scale: 1 };
}
