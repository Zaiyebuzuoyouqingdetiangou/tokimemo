// r84.176 · 把一页手帐存成长图。用 Canvas 2D 一笔一笔画出来（不借网页截图），
// 电脑、手机浏览器和 TT 都能用；不发请求，不上传，只在本机生成图片。
// 读不到的图片（跨站且不允许读取的）画成一个说明框，其他内容照常导出。
import * as journal from '../core/handJournal.js';
import * as constants from '../core/constants.js';

const WIDTH = 1080;
const PAD = 72;
const INNER = WIDTH - PAD * 2;
const MAX_AREA = 16_000_000; // iPhone / TT 的画布面积上限附近；超过就整体缩小，不截断内容。
const SERIF = "'Noto Serif SC','Songti SC','STSong',Georgia,serif";
const SANS = "-apple-system,'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif";
const HAND = "'LXGW WenKai','Kaiti SC','STKaiti','KaiTi',serif";

function wrap(ctx, text, width) {
    const lines = [];
    for (const paragraph of String(text || '').split('\n')) {
        let line = '';
        for (const char of Array.from(paragraph)) {
            const next = line + char;
            if (line && ctx.measureText(next).width > width) { lines.push(line); line = char.trim() ? char : ''; }
            else line = next;
        }
        lines.push(line);
    }
    return lines;
}

async function loadImage(url) {
    const safe = journal.safeJournalImageUrl(url);
    if (!safe) return null;
    try {
        const response = await fetch(safe, { credentials: 'same-origin' });
        if (!response.ok) return null;
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        try {
            const img = new Image();
            img.decoding = 'async';
            await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = objectUrl; });
            return { img, dispose: () => URL.revokeObjectURL(objectUrl) };
        } catch { URL.revokeObjectURL(objectUrl); return null; }
    } catch { return null; }
}

async function loadSvg(svgText) {
    if (typeof svgText !== 'string' || !svgText.includes('<svg')) return null;
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const objectUrl = URL.createObjectURL(blob);
    try {
        const img = new Image();
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = objectUrl; });
        return { img, dispose: () => URL.revokeObjectURL(objectUrl) };
    } catch { URL.revokeObjectURL(objectUrl); return null; }
}

// 先排版（算出每样东西的位置和总高度），再画。
function layout(ctx, page, pictures, renderIllustration) {
    const ops = [];
    let y = PAD + 40;
    const text = (value, { font, color, lineHeight, x = PAD, width = INNER, gap = 0 }) => {
        ctx.font = font;
        const lines = wrap(ctx, value, width);
        ops.push({ type: 'text', lines, font, color, lineHeight, x, y });
        y += lines.length * lineHeight + gap;
    };
    ops.push({ type: 'title', y });
    ctx.font = `600 50px ${SANS}`;
    const titleLines = wrap(ctx, page.title || '', INNER - 190);
    ops[0].lines = titleLines;
    y += titleLines.length * 66 + 18;
    ops.push({ type: 'rule', y });
    y += 36;
    let photo = 0;
    for (const [entryIndex, entry] of (page.entries || []).entries()) {
        const label = constants.MODE_LABEL?.[entry.source?.mode] || (entry.source?.mode === 'chat' ? '聊天' : '已存内容');
        text(label, { font: `26px ${SANS}`, color: 'muted', lineHeight: 38, gap: 6 });
        if (entry.title) text(entry.title, { font: `600 34px ${SANS}`, color: 'ink', lineHeight: 48, gap: 16 });
        for (const [blockIndex, block] of (entry.blocks || []).entries()) {
            if (block.type === 'text') {
                if (block.speaker) text(block.speaker, { font: `600 32px ${SERIF}`, color: 'ink', lineHeight: 50 });
                text(block.text, { font: `32px ${SERIF}`, color: 'ink', lineHeight: 56, gap: 22 });
            } else if (block.type === 'image' || block.type === 'letterIllustration') {
                const picture = pictures.get(`${entryIndex}:${blockIndex}`);
                const frame = 22;
                const w = Math.min(INNER - 40, 820);
                const h = picture ? Math.round(w * picture.img.naturalHeight / Math.max(1, picture.img.naturalWidth)) : 220;
                const caption = block.caption || entry.title || '';
                const tilt = block.type === 'image' ? ((photo++ % 2) ? 1.2 : -1.2) : 0;
                ops.push({ type: 'photo', y: y + 10, w, h, frame, picture, caption, tilt, illustration: block.type === 'letterIllustration' });
                y += h + frame * 2 + (caption ? 56 : 24) + 34;
            }
        }
        y += 18;
    }
    for (const [index, note] of (page.notes || []).entries()) {
        ctx.font = `30px ${SANS}`;
        const lines = wrap(ctx, note.text, 560);
        const h = lines.length * 48 + 44;
        ops.push({ type: 'note', y: y + 8, h, lines, tilt: index % 2 ? 1.5 : -1.5 });
        y += h + 34;
    }
    if (page.annotation?.text) {
        ctx.font = `32px ${HAND}`;
        const lines = wrap(ctx, page.annotation.text, INNER - 40);
        const h = lines.length * 56 + (page.annotation.by ? 48 : 0);
        ops.push({ type: 'annotation', y: y + 10, lines, by: page.annotation.by || '', h });
        y += h + 40;
    }
    return { ops, height: y + PAD };
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function draw(ctx, page, index, plan) {
    const colors = journal.journalPalette(page.palette, index);
    const muted = `${colors.ink}b3`;
    const color = key => key === 'muted' ? muted : colors.ink;
    ctx.fillStyle = '#f4f1ec';
    ctx.fillRect(0, 0, WIDTH, plan.height);
    roundRect(ctx, 24, 24, WIDTH - 48, plan.height - 48, 28);
    ctx.fillStyle = colors.paper;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors.accent;
    ctx.stroke();
    ctx.fillStyle = colors.accent;
    ctx.fillRect(24, 40, 12, plan.height - 80);
    ctx.save();
    ctx.translate(WIDTH / 2, 30);
    ctx.rotate(-3 * Math.PI / 180);
    ctx.globalAlpha = 0.8;
    ctx.fillRect(-110, -18, 220, 40);
    ctx.restore();
    const date = new Date(page.createdAt);
    for (const op of plan.ops) {
        if (op.type === 'title') {
            ctx.font = `600 50px ${SANS}`;
            ctx.fillStyle = colors.ink;
            ctx.textBaseline = 'top';
            op.lines.forEach((line, i) => ctx.fillText(line, PAD, op.y + i * 66));
            if (Number.isFinite(date.getTime())) {
                ctx.save();
                ctx.translate(WIDTH - PAD - 90, op.y + 24);
                ctx.rotate(6 * Math.PI / 180);
                ctx.globalAlpha = 0.75;
                ctx.strokeStyle = colors.ink;
                ctx.lineWidth = 3;
                roundRect(ctx, -70, -26, 140, 52, 10);
                ctx.stroke();
                ctx.font = `28px ${SANS}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = colors.ink;
                ctx.fillText(`${date.getMonth() + 1} · ${date.getDate()}`, 0, 1);
                ctx.restore();
            }
            if (page.favorite) { ctx.font = `36px ${SANS}`; ctx.fillStyle = colors.ink; ctx.textBaseline = 'top'; ctx.fillText('★', WIDTH - PAD - 10, op.y); }
        } else if (op.type === 'rule') {
            ctx.save();
            ctx.setLineDash([10, 10]);
            ctx.strokeStyle = colors.accent;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(PAD, op.y); ctx.lineTo(WIDTH - PAD, op.y); ctx.stroke();
            ctx.restore();
        } else if (op.type === 'text') {
            ctx.font = op.font;
            ctx.fillStyle = color(op.color);
            ctx.textBaseline = 'top';
            op.lines.forEach((line, i) => ctx.fillText(line, op.x, op.y + i * op.lineHeight));
        } else if (op.type === 'photo') {
            const outerW = op.w + op.frame * 2;
            const outerH = op.h + op.frame * 2 + (op.caption ? 44 : 0);
            ctx.save();
            ctx.translate(WIDTH / 2, op.y + outerH / 2);
            ctx.rotate(op.tilt * Math.PI / 180);
            ctx.shadowColor = 'rgba(0,0,0,.12)';
            ctx.shadowBlur = 18;
            ctx.shadowOffsetY = 6;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-outerW / 2, -outerH / 2, outerW, outerH);
            ctx.shadowColor = 'transparent';
            ctx.strokeStyle = colors.accent;
            ctx.lineWidth = 2;
            ctx.strokeRect(-outerW / 2, -outerH / 2, outerW, outerH);
            const ix = -op.w / 2, iy = -outerH / 2 + op.frame;
            if (op.picture) ctx.drawImage(op.picture.img, ix, iy, op.w, op.h);
            else {
                ctx.fillStyle = '#ece7df';
                ctx.fillRect(ix, iy, op.w, op.h);
                ctx.fillStyle = '#8a7f73';
                ctx.font = `28px ${SANS}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(op.illustration ? '这张插画没能导出' : '这张图片存在别的网站上，没能导出', 0, iy + op.h / 2);
            }
            if (op.caption) {
                ctx.fillStyle = '#6b5a50';
                ctx.font = `26px ${SANS}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(op.caption.slice(0, 40), 0, iy + op.h + 14);
            }
            ctx.restore();
        } else if (op.type === 'note') {
            ctx.save();
            const w = 640;
            ctx.translate(WIDTH - PAD - w / 2, op.y + op.h / 2);
            ctx.rotate(op.tilt * Math.PI / 180);
            ctx.fillStyle = colors.accent;
            ctx.fillRect(-w / 2, -op.h / 2, w, op.h);
            ctx.fillStyle = colors.ink;
            ctx.font = `30px ${SANS}`;
            ctx.textBaseline = 'top';
            op.lines.forEach((line, i) => ctx.fillText(line, -w / 2 + 40, -op.h / 2 + 22 + i * 48));
            ctx.restore();
        } else if (op.type === 'annotation') {
            ctx.fillStyle = colors.accent;
            ctx.fillRect(PAD, op.y, 4, op.h);
            ctx.fillStyle = colors.ink;
            ctx.font = `32px ${HAND}`;
            ctx.textBaseline = 'top';
            op.lines.forEach((line, i) => ctx.fillText(line, PAD + 24, op.y + i * 56));
            if (op.by) { ctx.font = `26px ${HAND}`; ctx.fillStyle = muted; ctx.fillText(`—— ${op.by}`, PAD + 24, op.y + op.lines.length * 56 + 8); }
        }
    }
}

export async function renderJournalPageImage(page, index = 0, { renderIllustration = null } = {}) {
    const pictures = new Map();
    const disposers = [];
    try {
        for (const [entryIndex, entry] of (page.entries || []).entries()) {
            for (const [blockIndex, block] of (entry.blocks || []).entries()) {
                let picture = null;
                if (block.type === 'image') picture = await loadImage(block.url);
                else if (block.type === 'letterIllustration' && typeof renderIllustration === 'function') {
                    try { picture = await loadSvg(renderIllustration(block.illustration, `${entryIndex}-${blockIndex}`)); } catch { picture = null; }
                }
                if (picture) { pictures.set(`${entryIndex}:${blockIndex}`, picture); disposers.push(picture.dispose); }
            }
        }
        const measure = document.createElement('canvas').getContext('2d');
        const plan = layout(measure, page, pictures, renderIllustration);
        const scale = Math.min(1, Math.sqrt(MAX_AREA / (WIDTH * plan.height)));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(WIDTH * scale);
        canvas.height = Math.round(plan.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        draw(ctx, page, index, plan);
        const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('浏览器没能生成图片。')), 'image/png'));
        return { blob, width: canvas.width, height: canvas.height, missing: [...(page.entries || []).entries()].reduce((n, [e, entry]) => n + (entry.blocks || []).filter((b, i) => (b.type === 'image' || b.type === 'letterIllustration') && !pictures.has(`${e}:${i}`)).length, 0) };
    } finally {
        for (const dispose of disposers) { try { dispose(); } catch {} }
    }
}
