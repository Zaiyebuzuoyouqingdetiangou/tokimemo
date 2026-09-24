import * as v2 from './letterIllustrationV2.js';

// Local, inert legacy letter-end illustration. Existing v1 mail keeps this exact renderer;
// SVG structure, geometry, colours and accessibility markup stay in this file.
export const LETTER_ILLUSTRATION_VERSION = 1;
export const LETTER_ILLUSTRATION_GENERATION_VERSION = v2.VERSION;
export const LETTER_ILLUSTRATION_SUBJECTS = Object.freeze(['person', 'pony', 'cat', 'rabbit', 'flowers', 'cup', 'book']);
export const LETTER_ILLUSTRATION_ACTIONS = Object.freeze(['pet', 'hold', 'read', 'shareTea', 'rest', 'bloom']);
export const LETTER_ILLUSTRATION_PALETTES = Object.freeze(['cream', 'rose', 'sage', 'sky', 'lilac', 'peach']);
export const LETTER_ILLUSTRATION_ACCESSORIES = Object.freeze(['heart', 'star', 'bow', 'letter', 'flower', 'tea', 'book', 'leaf']);
export const MAX_LETTER_ILLUSTRATION_BYTES = 2048;
export const MAX_LETTER_ILLUSTRATION_ACCESSORIES = 3;

// Kept deliberately short so the parent prompt can include it without describing markup.
export const LETTER_ILLUSTRATION_CONTRACT = v2.CONTRACT;

const rootKeys = Object.freeze(['version', 'subject', 'companion', 'action', 'palette', 'accessories']);
const paletteValues = Object.freeze({
    cream: ['#fff4d9', '#8d694f', '#d99e79', '#d75d78', '#8db59a'],
    rose: ['#fff0ef', '#8b6370', '#d996a8', '#d5677d', '#98b99e'],
    sage: ['#eff4e8', '#617362', '#b9c99e', '#cc7681', '#8aa98c'],
    sky: ['#edf7fa', '#55747c', '#93c6d1', '#d77d91', '#91b69e'],
    lilac: ['#f5eff8', '#705f7d', '#b9a2cf', '#cc728d', '#91af99'],
    peach: ['#fff0e4', '#866957', '#e7a678', '#d7687e', '#96b398'],
});

function ownRecord(value, allowedKeys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    try {
        const proto = Object.getPrototypeOf(value);
        if (proto !== Object.prototype && proto !== null) return null;
        const names = Reflect.ownKeys(value);
        if (names.some(key => typeof key !== 'string' || !allowedKeys.includes(key))) return null;
        const copy = Object.create(null);
        for (const key of names) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) return null;
            copy[key] = descriptor.value;
        }
        return copy;
    } catch { return null; }
}
function enumValue(value, allowed, fallback = null) {
    return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}
function safeArray(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX_LETTER_ILLUSTRATION_ACCESSORIES) return null;
    if (Reflect.ownKeys(value).length !== value.length + 1) return null;
    const items = [];
    for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string') return null;
        const item = enumValue(descriptor.value, LETTER_ILLUSTRATION_ACCESSORIES);
        if (item && !items.includes(item)) items.push(item);
    }
    return items;
}

function normalizeLegacyLetterIllustration(value) {
    try {
        const raw = ownRecord(value, rootKeys);
        if (!raw || raw.version !== LETTER_ILLUSTRATION_VERSION) return null;
        const subject = enumValue(raw.subject, LETTER_ILLUSTRATION_SUBJECTS);
        if (!subject) return null;
        const accessories = safeArray(raw.accessories);
        if (!accessories) return null;
        // Unknown optional choices safely disappear. A single recognised subject remains useful.
        const design = {
            version: LETTER_ILLUSTRATION_VERSION,
            subject,
            companion: enumValue(raw.companion, LETTER_ILLUSTRATION_SUBJECTS),
            action: enumValue(raw.action, LETTER_ILLUSTRATION_ACTIONS, 'rest'),
            palette: enumValue(raw.palette, LETTER_ILLUSTRATION_PALETTES, 'cream'),
            accessories,
        };
        if (new TextEncoder().encode(JSON.stringify(design)).byteLength > MAX_LETTER_ILLUSTRATION_BYTES) return null;
        return design;
    } catch { return null; }
}

// Saved v1 and v2 designs are both readable. New provider output must use the
// evidence-gated function below, which intentionally rejects legacy v1 choices.
export function normalizeLetterIllustration(value) {
    if (value?.version === v2.VERSION) return v2.normalize(value);
    return normalizeLegacyLetterIllustration(value);
}

export function normalizeGeneratedLetterIllustration(value, options = {}) {
    return v2.normalizeGenerated(value, options);
}

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function safeId(value) {
    const compact = String(value ?? 'letter').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
    return compact || 'letter';
}
function stroke(colours) { return `fill="none" stroke="${colours[1]}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"`; }
function person(x, y, colours, pose) {
    const arm = pose === 'pet' ? `M${x + 7} ${y + 30} Q${x + 19} ${y + 33} ${x + 27} ${y + 25}` : `M${x + 7} ${y + 30} Q${x + 17} ${y + 36} ${x + 23} ${y + 35}`;
    return `<g ${stroke(colours)}><circle cx="${x}" cy="${y + 14}" r="8" fill="${colours[0]}"/><path d="M${x - 8} ${y + 14} Q${x - 5} ${y + 3} ${x + 4} ${y + 6} Q${x + 10} ${y + 10} ${x + 7} ${y + 21}" fill="${colours[2]}"/><path d="M${x - 10} ${y + 31} Q${x} ${y + 24} ${x + 10} ${y + 31} L${x + 13} ${y + 53} L${x - 13} ${y + 53}Z" fill="${colours[2]}"/><path d="${arm}M${x - 6} ${y + 31} Q${x - 12} ${y + 38} ${x - 15} ${y + 43}"/><path d="M${x - 6} ${y + 53} L${x - 9} ${y + 65}M${x + 6} ${y + 53} L${x + 10} ${y + 65}"/></g>`;
}
function pony(x, y, colours) {
    // A sitting, round-headed pony reads clearly at letter scale.  The slightly
    // offset mane and contour strokes intentionally retain a coloured-pencil feel.
    return `<g ${stroke(colours)}><path d="M${x - 23} ${y + 58} Q${x - 38} ${y + 51} ${x - 35} ${y + 38} Q${x - 30} ${y + 29} ${x - 20} ${y + 36} Q${x - 25} ${y + 47} ${x - 23} ${y + 58}Z" fill="${colours[2]}" opacity=".72"/><ellipse cx="${x - 1}" cy="${y + 62}" rx="28" ry="20" fill="#fffdf8"/><path d="M${x - 22} ${y + 63} Q${x - 36} ${y + 73} ${x - 25} ${y + 82} Q${x - 15} ${y + 87} ${x - 7} ${y + 77} Q${x - 5} ${y + 88} ${x + 8} ${y + 84} Q${x + 19} ${y + 81} ${x + 14} ${y + 67}" fill="#fffdf8"/><path d="M${x + 18} ${y + 53} Q${x + 35} ${y + 44} ${x + 36} ${y + 61} Q${x + 35} ${y + 74} ${x + 18} ${y + 70} Q${x + 28} ${y + 62} ${x + 18} ${y + 53}Z" fill="${colours[2]}" opacity=".62"/><path d="M${x + 18} ${y + 55} Q${x + 33} ${y + 48} ${x + 33} ${y + 62} Q${x + 27} ${y + 66} ${x + 19} ${y + 65}" fill="none" stroke="#fffdf8" stroke-width="1.5" stroke-linecap="round"/><circle cx="${x}" cy="${y + 36}" r="27" fill="#fffdf8"/><path d="M${x - 17} ${y + 20} Q${x - 11} ${y + 4} ${x - 1} ${y + 13} L${x - 5} ${y + 25}Z" fill="#fffdf8"/><path d="M${x + 8} ${y + 13} Q${x + 20} ${y + 5} ${x + 20} ${y + 23} L${x + 10} ${y + 27}Z" fill="#fffdf8"/><path d="M${x + 1} ${y + 12} L${x + 6} ${y - 2} L${x + 12} ${y + 15}" fill="${colours[2]}"/><path d="M${x - 25} ${y + 31} Q${x - 30} ${y + 17} ${x - 18} ${y + 12} Q${x - 10} ${y + 6} ${x - 4} ${y + 14} Q${x - 18} ${y + 25} ${x - 15} ${y + 37} Q${x - 4} ${y + 20} ${x + 3} ${y + 18} Q${x + 12} ${y + 17} ${x + 17} ${y + 26} Q${x + 6} ${y + 31} ${x + 5} ${y + 42} Q${x - 7} ${y + 31} ${x - 25} ${y + 31}Z" fill="${colours[2]}" opacity=".76"/><path d="M${x - 26} ${y + 28} Q${x - 18} ${y + 11} ${x - 5} ${y + 13} Q${x + 7} ${y + 13} ${x + 15} ${y + 24}" fill="none" stroke="${colours[3]}" stroke-width="3.8" stroke-linecap="round" opacity=".78"/><path d="M${x - 10} ${y + 39} q4 5 8 0M${x + 7} ${y + 39} q4 5 8 0M${x + 3} ${y + 48} q4 4 8 0" fill="none" stroke="${colours[1]}" stroke-width="1.45" stroke-linecap="round"/><ellipse cx="${x - 12}" cy="${y + 47}" rx="5" ry="2.7" fill="${colours[3]}" opacity=".38"/><ellipse cx="${x + 17}" cy="${y + 47}" rx="5" ry="2.7" fill="${colours[3]}" opacity=".38"/><path d="M${x - 13} ${y + 77} q7 8 14 0M${x + 3} ${y + 78} q7 8 14 0" fill="#fffdf8"/><path d="M${x - 12} ${y + 80} q6 4 12 0M${x + 4} ${y + 81} q6 4 12 0" fill="none" stroke="${colours[1]}" stroke-width="1.5" stroke-linecap="round"/><path d="M${x - 23} ${y + 65} Q${x - 37} ${y + 71} ${x - 35} ${y + 82}" fill="none" stroke="${colours[3]}" stroke-width="2.5" stroke-linecap="round" opacity=".7"/></g>`;
}
function cat(x, y, colours) {
    return `<g ${stroke(colours)}><path d="M${x - 17} ${y + 44} Q${x - 21} ${y + 22} ${x - 6} ${y + 23} L${x} ${y + 13} L${x + 7} ${y + 23} Q${x + 22} ${y + 24} ${x + 16} ${y + 44} Q${x} ${y + 52} ${x - 17} ${y + 44}Z" fill="${colours[0]}"/><path d="M${x + 15} ${y + 42} Q${x + 34} ${y + 45} ${x + 27} ${y + 24}"/><path d="M${x - 9} ${y + 48} L${x - 9} ${y + 58}M${x + 7} ${y + 48} L${x + 7} ${y + 58}"/><circle cx="${x - 4}" cy="${y + 31}" r="1" fill="${colours[1]}"/><circle cx="${x + 7}" cy="${y + 31}" r="1" fill="${colours[1]}"/></g>`;
}
function rabbit(x, y, colours) {
    return `<g ${stroke(colours)}><ellipse cx="${x}" cy="${y + 35}" rx="16" ry="16" fill="${colours[0]}"/><ellipse cx="${x - 7}" cy="${y + 13}" rx="4" ry="13" fill="${colours[0]}"/><ellipse cx="${x + 7}" cy="${y + 13}" rx="4" ry="13" fill="${colours[0]}"/><circle cx="${x - 5}" cy="${y + 33}" r="1" fill="${colours[1]}"/><circle cx="${x + 5}" cy="${y + 33}" r="1" fill="${colours[1]}"/><path d="M${x - 8} ${y + 49} L${x - 9} ${y + 59}M${x + 8} ${y + 49} L${x + 9} ${y + 59}"/></g>`;
}
function flowers(x, y, colours) {
    return `<g ${stroke(colours)}><path d="M${x} ${y + 55} Q${x - 5} ${y + 34} ${x - 13} ${y + 21}M${x} ${y + 55} Q${x + 7} ${y + 37} ${x + 15} ${y + 25}"/><g fill="${colours[3]}" stroke="${colours[1]}" stroke-width="1"><circle cx="${x - 16}" cy="${y + 18}" r="5"/><circle cx="${x - 10}" cy="${y + 16}" r="5"/><circle cx="${x - 13}" cy="${y + 23}" r="5"/><circle cx="${x + 12}" cy="${y + 22}" r="5"/><circle cx="${x + 18}" cy="${y + 20}" r="5"/></g><path d="M${x - 2} ${y + 42} l-8 -4M${x + 4} ${y + 40} l8 -4" stroke="${colours[4]}"/></g>`;
}
function cup(x, y, colours) { return `<g ${stroke(colours)}><path d="M${x - 14} ${y + 25} L${x + 13} ${y + 25} L${x + 9} ${y + 45} Q${x} ${y + 51} ${x - 9} ${y + 45}Z" fill="${colours[0]}"/><path d="M${x + 13} ${y + 30} Q${x + 25} ${y + 30} ${x + 18} ${y + 40}M${x - 5} ${y + 18} Q${x - 9} ${y + 10} ${x - 4} ${y + 4}M${x + 5} ${y + 18} Q${x + 9} ${y + 10} ${x + 4} ${y + 4}"/></g>`; }
function book(x, y, colours) { return `<g ${stroke(colours)}><path d="M${x - 20} ${y + 22} Q${x - 8} ${y + 17} ${x} ${y + 25} Q${x + 10} ${y + 17} ${x + 21} ${y + 22} L${x + 19} ${y + 48} Q${x + 9} ${y + 43} ${x} ${y + 51} Q${x - 9} ${y + 43} ${x - 19} ${y + 48}Z" fill="${colours[0]}"/><path d="M${x} ${y + 25}V${y + 51}M${x - 15} ${y + 29} L${x - 4} ${y + 27}M${x + 4} ${y + 27} L${x + 15} ${y + 29}"/></g>`; }
function motif(kind, x, y, colours, action) {
    if (kind === 'person') return person(x, y, colours, action);
    if (kind === 'pony') return pony(x, y, colours);
    if (kind === 'cat') return cat(x, y, colours);
    if (kind === 'rabbit') return rabbit(x, y, colours);
    if (kind === 'flowers') return flowers(x, y, colours);
    if (kind === 'cup') return cup(x, y, colours);
    return book(x, y, colours);
}
function accessory(kind, x, y, colours) {
    if (kind === 'heart') return `<path d="M${x} ${y + 4} C${x - 9} ${y - 7} ${x - 17} ${y + 5} ${x} ${y + 17} C${x + 17} ${y + 5} ${x + 9} ${y - 7} ${x} ${y + 4}Z" fill="${colours[3]}" opacity=".8"/>`;
    if (kind === 'star') return `<path d="M${x} ${y} l3 7 8 1 -6 5 2 8 -7 -4 -7 4 2 -8 -6 -5 8 -1Z" fill="${colours[2]}" opacity=".75"/>`;
    if (kind === 'bow') return `<path d="M${x} ${y + 7} Q${x - 13} ${y - 6} ${x - 14} ${y + 8} Q${x - 8} ${y + 14} ${x} ${y + 9} Q${x + 9} ${y + 14} ${x + 14} ${y + 8} Q${x + 13} ${y - 6} ${x} ${y + 7}Z" fill="${colours[3]}"/>`;
    if (kind === 'letter') return `<rect x="${x - 11}" y="${y}" width="22" height="15" rx="2" fill="${colours[0]}" stroke="${colours[1]}" stroke-width="1.3"/><path d="M${x - 10} ${y + 2} L${x} ${y + 10} L${x + 10} ${y + 2}" fill="none" stroke="${colours[1]}" stroke-width="1.3"/>`;
    if (kind === 'flower') return flowers(x, y - 25, colours);
    if (kind === 'tea') return cup(x, y - 25, colours);
    if (kind === 'book') return book(x, y - 25, colours);
    return `<path d="M${x} ${y + 13} Q${x - 13} ${y + 3} ${x - 4} ${y} Q${x + 6} ${y + 3} ${x} ${y + 13}Z" fill="${colours[4]}" opacity=".85"/>`;
}
function pettingHand(x, y, colours) {
    return `<g data-rmt-pony-pet-hand="true" fill="none" stroke="${colours[1]}" stroke-linecap="round" stroke-linejoin="round"><path d="M${x - 70} ${y + 17} Q${x - 57} ${y + 12} ${x - 45} ${y + 21} L${x - 29} ${y + 29}" stroke="${colours[2]}" stroke-width="9"/><path d="M${x - 70} ${y + 17} Q${x - 57} ${y + 12} ${x - 45} ${y + 21} L${x - 29} ${y + 29}" stroke="${colours[1]}" stroke-width="1.5"/><path d="M${x - 32} ${y + 31} q5 -8 10 -3 q6 3 0 9 q-8 3 -14 -1Z" fill="#fff0e8" stroke-width="1.4"/><path d="M${x - 25} ${y + 30} l5 -4M${x - 24} ${y + 34} l6 -2M${x - 27} ${y + 37} l5 1" stroke-width="1.15"/></g><path d="M${x + 37} ${y + 16} C${x + 31} ${y + 8} ${x + 24} ${y + 16} ${x + 31} ${y + 24} C${x + 39} ${y + 16} ${x + 43} ${y + 8} ${x + 37} ${y + 16}Z" fill="${colours[3]}" opacity=".82"/>`;
}
function actionDetail(action, hasCompanion, colours, subject, primaryX) {
    if (action === 'pet' && subject === 'pony') return pettingHand(primaryX, 12, colours);
    if (action === 'read') return book(hasCompanion ? 111 : 110, 47, colours);
    if (action === 'shareTea') return `${cup(hasCompanion ? 105 : 97, 48, colours)}${hasCompanion ? cup(129, 48, colours) : ''}`;
    if (action === 'bloom') return flowers(hasCompanion ? 111 : 110, 49, colours);
    if (action === 'hold') return accessory('heart', hasCompanion ? 111 : 110, 42, colours);
    return '';
}

export function renderLetterIllustration(value, { idPrefix = 'rmt-letter', label = '' } = {}) {
    if (value?.version === v2.VERSION) return v2.render(value, { idPrefix, label });
    const design = normalizeLegacyLetterIllustration(value);
    if (!design) return '';
    const colours = paletteValues[design.palette];
    const height = design.subject === 'pony' || design.companion === 'pony' ? 160 : 110;
    const titleId = `${safeId(idPrefix)}-illustration-title`;
    const named = typeof label === 'string' && label.trim().length > 0;
    const title = named ? `<title id="${titleId}">${esc(label.slice(0, 160))}</title>` : '';
    const semantic = named ? `role="img" aria-labelledby="${titleId}"` : 'aria-hidden="true"';
    const companion = design.companion && design.companion !== design.subject ? motif(design.companion, 151, 32, colours, design.action) : '';
    const primaryX = companion ? 75 : 110;
    const accents = design.accessories.map((item, index) => accessory(item, 30 + index * 75, index % 2 ? 17 : 8, colours)).join('');
    return `<svg class="rmt-letter-illustration" data-rmt-letter-illustration-version="1" data-rmt-letter-palette="${design.palette}" width="220" height="${height}" viewBox="0 0 220 ${height}" preserveAspectRatio="xMidYMid meet" ${semantic}>${title}<path d="M14 ${height - 22} Q54 ${height - 28} 96 ${height - 22} T206 ${height - 23}" fill="none" stroke="${colours[4]}" stroke-width="1.4" opacity=".65"/><path d="M18 ${height - 15} Q62 ${height - 19} 104 ${height - 14} T201 ${height - 15}" fill="none" stroke="${colours[2]}" stroke-width="1" opacity=".38"/>${motif(design.subject, primaryX, 31, colours, design.action)}${companion}${actionDetail(design.action, !!companion, colours, design.subject, primaryX)}${accents}</svg>`;
}

export function letterRelationshipEvidence(value) { return v2.relationshipEvidence(value); }
