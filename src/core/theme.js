import * as core_constants from './constants.js';
import * as core_text from './text.js';

const HEX_COLOR_RE = /^#([0-9a-f]{6})$/i;

export function normalizeThemeColor(value, fallback) {
    const raw = core_text.normalizeText(value, 32).trim();
    if (HEX_COLOR_RE.test(raw)) return raw.toLowerCase();
    return String(fallback || '#000000').toLowerCase();
}

export function normalizeThemeCustom(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const fallback = core_constants.DEFAULT_THEME_PALETTE;
    return {
        background: normalizeThemeColor(source.background, fallback.background),
        surface: normalizeThemeColor(source.surface, fallback.surface),
        text: normalizeThemeColor(source.text, fallback.text),
        muted: normalizeThemeColor(source.muted, fallback.muted),
        accent: normalizeThemeColor(source.accent, fallback.accent),
        accentAlt: normalizeThemeColor(source.accentAlt, fallback.accentAlt),
        border: normalizeThemeColor(source.border, fallback.border),
    };
}

function parseRgbColor(value) {
    const text = String(value || '').trim();
    if (!text || /^transparent$/i.test(text) || /^rgba?\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(text)) return null;
    const hex = text.match(HEX_COLOR_RE);
    if (hex) {
        const n = Number.parseInt(hex[1], 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    const rgb = text.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (!rgb) return null;
    return { r: Math.max(0, Math.min(255, Number(rgb[1]))), g: Math.max(0, Math.min(255, Number(rgb[2]))), b: Math.max(0, Math.min(255, Number(rgb[3]))) };
}

function rgbToHex(rgb, fallback) {
    if (!rgb) return fallback;
    return `#${[rgb.r, rgb.g, rgb.b].map(value => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
}

function linearChannel(value) {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(foreground, background) {
    const fg = parseRgbColor(foreground);
    const bg = parseRgbColor(background);
    if (!fg || !bg) return 1;
    const luminance = rgb => 0.2126 * linearChannel(rgb.r) + 0.7152 * linearChannel(rgb.g) + 0.0722 * linearChannel(rgb.b);
    const a = luminance(fg);
    const b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function safeReadableColor(requested, surface, fallback, minimum = 4.5) {
    const candidates = [requested, fallback, '#111827', '#f8fafc', '#000000', '#ffffff']
        .map(value => rgbToHex(parseRgbColor(value), ''))
        .filter(Boolean);
    for (const candidate of candidates) {
        if (contrastRatio(candidate, surface) >= minimum) return candidate;
    }
    return candidates.sort((left, right) => contrastRatio(right, surface) - contrastRatio(left, surface))[0] || '#111827';
}

function normalizedThemeAlpha(value) {
    return Math.max(0.72, Math.min(1, Number(value) || 0.96));
}

function compositeHex(foreground, background, alpha) {
    const front = parseRgbColor(foreground);
    const back = parseRgbColor(background);
    if (!front || !back) return rgbToHex(front, foreground);
    const a = Math.max(0, Math.min(1, Number(alpha) || 0));
    return rgbToHex({
        r: front.r * a + back.r * (1 - a),
        g: front.g * a + back.g * (1 - a),
        b: front.b * a + back.b * (1 - a),
    }, foreground);
}

function safeReadableAcross(requested, surfaces, fallback, minimum = 4.5) {
    const candidates = [requested, fallback, '#111827', '#f8fafc']
        .map(value => rgbToHex(parseRgbColor(value), ''))
        .filter(Boolean);
    const validSurfaces = surfaces.map(parseRgbColor).filter(Boolean).map(rgb => rgbToHex(rgb, ''));
    for (const candidate of candidates) {
        if (validSurfaces.every(surface => contrastRatio(candidate, surface) >= minimum)) return candidate;
    }
    return candidates.sort((left, right) => {
        const leftWorst = Math.min(...validSurfaces.map(surface => contrastRatio(left, surface)));
        const rightWorst = Math.min(...validSurfaces.map(surface => contrastRatio(right, surface)));
        return rightWorst - leftWorst;
    })[0] || safeReadableColor(requested, surfaces[0], fallback, minimum);
}

function hostComputedPalette(documentLike = globalThis.document) {
    const fallback = core_constants.DEFAULT_THEME_PALETTE;
    try {
        const root = documentLike?.documentElement;
        const body = documentLike?.body || root;
        if (!body || typeof globalThis.getComputedStyle !== 'function') return { ...fallback };
        const bodyStyle = globalThis.getComputedStyle(body);
        const background = rgbToHex(parseRgbColor(bodyStyle.backgroundColor), fallback.background);
        const text = rgbToHex(parseRgbColor(bodyStyle.color), fallback.text);
        return {
            background,
            surface: compositeHex('#ffffff', background, contrastRatio('#ffffff', background) > 4.5 ? 0.06 : 0.65),
            text,
            muted: text,
            accent: fallback.accent,
            accentAlt: fallback.accentAlt,
            border: contrastRatio('#ffffff', background) > 4.5 ? '#586578' : fallback.border,
        };
    } catch {
        return { ...fallback };
    }
}

export function resolveThemePalette(settings, documentLike = globalThis.document) {
    const mode = core_constants.THEME_MODES.has(settings?.themeMode) ? settings.themeMode : 'default';
    let palette = mode === 'custom'
        ? normalizeThemeCustom(settings?.themeCustom)
        : mode === 'host'
            ? hostComputedPalette(documentLike)
            : mode === 'night' ? { ...core_constants.NIGHT_THEME_PALETTE }
                : { ...(core_constants.SEASON_THEME_PALETTES[mode] || core_constants.DEFAULT_THEME_PALETTE) };
    palette = normalizeThemeCustom(palette);
    // Custom colours must keep the page and card in the same luminance family.
    if (contrastRatio(palette.background, palette.surface) > 3) palette.surface = palette.background;
    const readableSurfaces = [palette.background, palette.surface, compositeHex(palette.surface, palette.background, settings?.themeAlpha)];
    palette.text = safeReadableAcross(palette.text, readableSurfaces, core_constants.DEFAULT_THEME_PALETTE.text, 4.5);
    palette.muted = safeReadableAcross(palette.muted, readableSurfaces, core_constants.DEFAULT_THEME_PALETTE.muted, 4.5);
    if (readableSurfaces.some(surface => contrastRatio(palette.text, surface) < 4.5 || contrastRatio(palette.muted, surface) < 4.5)) {
        palette.surface = palette.background;
        palette.text = safeReadableAcross(palette.text, [palette.background], '#000000');
        palette.muted = safeReadableAcross(palette.muted, [palette.background], palette.text);
    }
    return { mode, palette };
}

function rgba(hex, alpha) {
    const rgb = parseRgbColor(hex) || parseRgbColor('#ffffff');
    const a = normalizedThemeAlpha(alpha);
    return `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${a})`;
}

function readableTint(base, tint, inks, amount) {
    // Interpolated stops are sampled too: contrasting endpoints alone do not prove
    // arbitrary colourful gradients readable. Fade decoration back, never fade text.
    for (let step = 10; step >= 0; step--) {
        const end = compositeHex(tint, base, amount * step / 10);
        const stops = Array.from({ length: 17 }, (_, i) => compositeHex(end, base, i / 16));
        if (stops.every(stop => inks.every(ink => contrastRatio(ink, stop) >= 4.6))) return end;
    }
    return base;
}

export function applyThemeToElement(element, settings, documentLike = globalThis.document) {
    if (!element?.style) return null;
    const { mode, palette } = resolveThemePalette(settings, documentLike);
    const alpha = normalizedThemeAlpha(settings?.themeAlpha);
    element.dataset.rmtThemeMode = mode;
    // Primary reading surfaces remain opaque. Card-only alpha composites over this known
    // background, so text contrast is checked against both the solid and effective card surface;
    // no parent opacity is used and host-page colours cannot change the contrast calculation.
    element.style.setProperty('--rmt-theme-bg', palette.background);
    element.style.setProperty('--rmt-theme-surface', palette.surface);
    element.style.setProperty('--rmt-theme-surface-alpha', rgba(palette.surface, alpha));
    element.style.setProperty('--rmt-theme-surface-solid', palette.surface);
    element.style.setProperty('--rmt-theme-text', palette.text);
    element.style.setProperty('--rmt-theme-muted', palette.muted);
    element.style.setProperty('--rmt-theme-accent', palette.accent);
    element.style.setProperty('--rmt-theme-accent-alt', palette.accentAlt);
    element.style.setProperty('--rmt-theme-border', palette.border);
    element.style.setProperty('--rmt-theme-alpha', String(alpha));
    element.style.setProperty('--rmt-theme-accent-ink', safeReadableAcross(palette.accent, [palette.background, palette.surface], palette.text));
    const inks = [palette.text, palette.muted];
    element.style.setProperty('--rmt-theme-soft', readableTint(palette.surface, palette.accentAlt, inks, 0.08));
    element.style.setProperty('--rmt-theme-surface-tint', readableTint(compositeHex(palette.surface, palette.background, alpha), palette.accentAlt, inks, 0.11));
    element.style.setProperty('--rmt-theme-bg-tint', readableTint(palette.background, palette.accentAlt, inks, 0.03));
    element.style.setProperty('--rmt-theme-header-tint', readableTint(palette.surface, palette.accent, inks, 0.06));
    // Semantic paper is opaque, with its own validated ink. Theme changes never turn a
    // yellow memo, rose keepsake, or violet journal into the same structural white card.
    const dark = contrastRatio('#ffffff', palette.background) > 4.5;
    const papers = dark
        ? { note: ['#4b3d20', '#fff0ba'], 'note-blue': ['#203e55', '#dceeff'], 'note-rose': ['#512b3d', '#ffe2ed'], letter: ['#37312c', '#f9ecdc'], journal: ['#382f50', '#eee3ff'] }
        : { note: ['#ffecab', '#594019'], 'note-blue': ['#e0f0ff', '#264c70'], 'note-rose': ['#ffe2ec', '#71344e'], letter: ['#fff9ed', '#594934'], journal: ['#eee6fc', '#584070'] };
    for (const [kind, [paper, requestedInk]] of Object.entries(papers)) {
        element.style.setProperty('--rmt-paper-' + kind, paper);
        element.style.setProperty('--rmt-paper-' + kind + '-ink', safeReadableColor(requestedInk, paper, palette.text));
    }
    element.style.setProperty('--rmt-theme-wash', compositeHex(palette.accent, palette.surface, dark ? 0.12 : 0.10));
    element.style.setProperty('--rmt-theme-wash-ink', safeReadableColor(palette.text, compositeHex(palette.accent, palette.surface, dark ? 0.12 : 0.10), palette.text));
    element.style.setProperty('--rmt-theme-shadow', dark ? '#00000055' : '#26395316');
    element.style.setProperty('color-scheme', contrastRatio('#ffffff', palette.background) > 4.5 ? 'dark' : 'light');
    return { mode, palette, alpha };
}
