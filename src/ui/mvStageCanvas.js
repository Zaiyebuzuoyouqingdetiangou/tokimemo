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

function words(value) {
    try { return Array.from(new Intl.Segmenter('zh', { granularity: 'word' }).segment(value), x => x.segment); }
    catch { return value.match(/[a-zA-Z0-9]+|\s+|[^\s]/gu) || []; }
}

function linesFor(g, value, width, splitLongWords = false) {
    const lines = []; let line = '';
    const put = token => {
        if (splitLongWords && g.measureText(token).width > width && Array.from(token).length > 1) { for (const ch of token) put(ch); return; }
        if (line && g.measureText(line + token).width > width && !/^[，。！？、；：,.!?;:]+$/u.test(token)) {
            lines.push(line.trim()); line = token.trimStart();
        } else line += token;
    };
    for (const [i, paragraph] of String(value).split('\n').entries()) {
        if (i && line) { lines.push(line.trim()); line = ''; }
        for (const token of words(paragraph)) put(token);
    }
    if (line.trim()) lines.push(line.trim());
    return lines;
}

function divideText(value) {
    const tokens = words(value), mid = value.length / 2;
    if (tokens.length < 2 || value.length < 5) return [value];
    let length = 0, best = 1, score = Infinity;
    for (let i = 1; i < tokens.length; i++) {
        length += tokens[i - 1].length;
        if (/^[，。！？、；：,.!?;:]/u.test(tokens[i])) continue;
        const distance = Math.abs(length - mid) - (/\s|[，。！？、；：,.!?;:]$/u.test(tokens[i - 1]) ? 1.5 : 0);
        if (distance < score) { score = distance; best = i; }
    }
    return [tokens.slice(0, best).join('').trim(), tokens.slice(best).join('').trim()].filter(Boolean);
}

export function textRegions(state, group, w, h, subject = null, forceFront = false) {
    let layout = forceFront ? 'banner' : state.cue.layout || 'sides';
    const margin = w * .05, gap = w * .025;
    const left = subject ? Math.max(0, subject.x - gap - margin) : w * .28;
    const rightX = subject ? Math.min(w - margin, subject.x + subject.width + gap) : w * .67;
    const right = subject ? Math.max(0, w - margin - rightX) : w * .28;
    const regions = [];
    if (layout !== 'banner') {
        if (layout === 'sides' && left >= w * .16 && right >= w * .16) {
            const parts = divideText(state.text);
            if (parts.length === 2) regions.push({ text: parts[0], x: margin + left / 2, width: left }, { text: parts[1], x: rightX + right / 2, width: right });
            else { const useLeft = left >= right; regions.push({ text: state.text, x: useLeft ? margin + left / 2 : rightX + right / 2, width: useLeft ? left : right }); }
        } else {
            const useLeft = subject ? left >= right : group?.position === 'right';
            const width = useLeft ? left : right;
            if (width >= w * .18) regions.push({ text: state.text, x: useLeft ? margin + left / 2 : rightX + right / 2, width });
            else layout = 'banner';
        }
    }
    if (layout === 'banner') return { layout, front: true, regions: [{ text: state.text, x: w / 2, width: w * .88 }] };
    return { layout, front: state.cue.depth === 'front', regions };
}

export function drawText(g, state, group, w, h, font, forceFront = false, options = {}) {
    if (!state?.active || !state.text || state.cue.layout === 'none') return;
    g.save();
    let plan = textRegions(state, group, w, h, options.subject, forceFront);
    let size = Math.min(w, h) * (plan.layout === 'banner' ? .055 : .105), fitted;
    const fit = () => {
        g.font = `${font.weight} ${size}px ${font.stack}`;
        return plan.regions.map(r => ({ ...r, lines: linesFor(g, r.text, r.width) }));
    };
    const oversized = height => fitted.some(r => r.lines.length * size * 1.25 > height || r.lines.some(line => g.measureText(line).width > r.width));
    fitted = fit();
    while (oversized(h * (plan.layout === 'banner' ? .24 : .55)) && size > Math.min(w, h) * .045) {
        size *= .92; fitted = fit();
    }
    if (plan.layout !== 'banner' && oversized(h * .55)) {
        plan = textRegions(state, group, w, h, options.subject, true); size = Math.min(w, h) * .055; fitted = fit();
    }
    // Very long lyrics wrap without dropping words. Only the display size changes.
    while (oversized(h * .28) && plan.layout === 'banner' && size > 2) { size *= .92; fitted = fit(); }
    if (size <= 2) fitted = plan.regions.map(r => ({ ...r, lines: linesFor(g, r.text, r.width, true) }));
    if ((options.suppressBanner && plan.layout === 'banner') || (options.pass && options.pass !== (plan.front ? 'front' : 'back'))) { g.restore(); return; }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.font = `${font.weight} ${size}px ${font.stack}`;
    const candidate = /^#[0-9a-f]{6}$/iu.test(state.background.colors?.[1] || '') ? state.background.colors[1] : '#fffdf8';
    const rgb = [1, 3, 5].map(i => parseInt(candidate.slice(i, i + 2), 16));
    const dark = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 < 135;
    g.fillStyle = plan.layout === 'banner' ? '#fffdf8' : candidate;
    g.strokeStyle = plan.layout === 'banner' || !dark ? 'rgba(15,18,25,.92)' : 'rgba(255,253,248,.95)';
    g.lineWidth = Math.max(2, size * .11); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = size * .09;
    for (const r of fitted) {
        const lineHeight = size * 1.25;
        const y = plan.layout === 'banner' ? h * .91 - (r.lines.length - 1) * lineHeight / 2 : h * .38;
        for (let i = 0; i < r.lines.length; i++) {
            const yy = y + (i - (r.lines.length - 1) / 2) * lineHeight;
            g.strokeText(r.lines[i], r.x, yy); g.fillText(r.lines[i], r.x, yy);
        }
    }
    g.restore();
}

// Layout uses the visible subject rather than the transparent canvas margins.
export function foregroundPlacement(bounds, pw, ph, group, w, h) {
    const b = bounds || { cx: .5, bottom: 1, top: 0, x: 0, width: 1, height: 1 };
    const factor = { close: 1.22, medium: 1.02, full: .84, wide: .56 }[group?.scale] || 1.02;
    const body = group?.scale === 'full' || group?.scale === 'wide';
    const foot = body ? (group.scale === 'wide' ? .91 : .95) : 1.035;
    const scale = Math.min(h * factor / Math.max(1, ph * b.height), w * (body ? .88 : 1.04) / Math.max(1, pw * (b.width || 1)));
    const visibleW = pw * (b.width || 1) * scale;
    const nominal = w * ({ left: .32, right: .68, center: .5 }[group?.position] || .5);
    const cx = visibleW >= w * .95 ? w / 2 : Math.max(visibleW / 2 + w * .025, Math.min(w - visibleW / 2 - w * .025, nominal));
    const x = cx - pw * b.cx * scale, y = h * foot - ph * b.bottom * scale;
    return { x, y, width: pw * scale, height: ph * scale, foot: h * foot, grounded: body,
        subject: { x: x + pw * (b.x || 0) * scale, y: y + ph * (b.top || 0) * scale, width: visibleW, height: ph * b.height * scale } };
}

export function isDetailInsert(group, diff) {
    const description = `${group?.composition || ''} ${diff?.imagePrompt || ''} ${diff?.label || ''}`;
    const detail = /(?:眼睛|双眼|眼部|手部|手指|嘴唇|唇部|泪痣|物件|局部).{0,12}特写|特写.{0,12}(?:眼睛|双眼|眼部|手部|手指|嘴唇|唇部|泪痣|物件)|\bextreme\s+close[ -]?up\b|\b(?:eyes?|hands?|lips?|object)\s+close[ -]?up\b|\bclose[ -]?up\s+(?:of|on)\s+(?:the\s+)?(?:eyes?|hands?|lips?|object)\b/iu.test(description);
    const local = group?.scale === 'close' && group?.cast?.length && group.cast.every(p => ['hands', 'face'].includes(p.visible));
    return !!(detail || local);
}

export function poseTransform(state, w, h) {
    const progress = Math.min(1, state.poseTime / 0.24);
    if (state.entrance === 'pop') return { x: 0, y: 0, scale: 1 + 0.055 * Math.sin(progress * Math.PI) };
    if (state.entrance === 'slide') return { x: -w * 0.08 * (1 - progress) ** 3, y: 0, scale: 1 };
    return { x: 0, y: 0, scale: 1 };
}
