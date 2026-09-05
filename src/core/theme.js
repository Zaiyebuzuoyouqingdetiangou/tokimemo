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
    const candidates = [requested, fallback, '#111827', '#f8fafc']
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
    const a = normalizedThemeAlpha(alpha);
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
            surface: background,
            text,
            muted: fallback.muted,
            accent: fallback.accent,
            accentAlt: fallback.accentAlt,
            border: fallback.border,
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
            : { ...core_constants.DEFAULT_THEME_PALETTE };
    palette = normalizeThemeCustom(palette);
    const effectiveSurface = compositeHex(palette.surface, palette.background, settings?.themeAlpha);
    const readableSurfaces = [palette.surface, effectiveSurface];
    palette.text = safeReadableAcross(palette.text, readableSurfaces, core_constants.DEFAULT_THEME_PALETTE.text, 4.5);
    palette.muted = safeReadableAcross(palette.muted, readableSurfaces, core_constants.DEFAULT_THEME_PALETTE.muted, 4.5);
    return { mode, palette };
}

function rgba(hex, alpha) {
    const rgb = parseRgbColor(hex) || parseRgbColor('#ffffff');
    const a = normalizedThemeAlpha(alpha);
    return `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${a})`;
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
    return { mode, palette, alpha };
}
