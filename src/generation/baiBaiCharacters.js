// Only the author's PUBLIC_API.md v1 contract. No private character data/settings.
import * as text from '../core/text.js';
import * as context from '../core/context.js';
import * as image_rules from './imagePromptRules.js';
const snapshots = new WeakSet();
const bindings = new WeakSet();
function own(object, key) {
    try { const d = object && Object.getOwnPropertyDescriptor(object, key); return d && Object.hasOwn(d, 'value') ? d.value : undefined; } catch { return undefined; }
}
function clean(value, max) {
    if (typeof value !== 'string' || value.length > max) return '';
    // Public tags are inert provider data. Preserve the author's exact name and
    // tag string, including weights and LoRA syntax; never render them as markup.
    if (!value.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return '';
    return value;
}
function fail(code = 'BBI_LIBRARY') { throw text.safeUserError('', code); }
export function readBaiBaiCharacters(root = globalThis) {
    const api = own(root, 'STBaiBaiImage');
    const method = own(api, 'getCharacters');
    if (own(api, 'apiVersion') !== 1 || typeof method !== 'function') return fail();
    // The author's public createApi deliberately exposes capabilities as a getter
    // that returns a fresh copy. It is part of the API contract, not a DTO accessor.
    let capabilities;
    try { capabilities = api.capabilities; } catch { return fail(); }
    if (own(capabilities, 'characterLibrary') !== true) return fail();
    let raw;
    try { raw = method.call(api); } catch { return fail(); }
    const entries = own(raw, 'characters'), revision = own(raw, 'revision');
    const count = own(entries, 'length');
    if (own(raw, 'apiVersion') !== 1 || own(raw, 'floor') !== null || !Number.isSafeInteger(revision) || revision < 0
        || !Array.isArray(entries) || !Number.isSafeInteger(count) || count > 512) return fail();
    const characters = [];
    for (let index = 0; index < count; index++) {
        const row = own(entries, String(index));
        const name = clean(own(row, 'name'), 120), tag = clean(own(row, 'tag'), 5000), nl = clean(own(row, 'nl') || '', 3000);
        const scope = own(row, 'scope');
        if (!name || !tag || !['chat', 'global'].includes(scope)) continue;
        characters.push(Object.freeze({ name, tag, nl, scope }));
    }
    const snapshot = Object.freeze({ revision, characters: Object.freeze(characters), api });
    snapshots.add(snapshot);
    return snapshot;
}
export function uniqueBaiBaiCharacterIndex(snapshot, name) {
    if (!snapshots.has(snapshot) || typeof name !== 'string') return -1;
    const indices = snapshot.characters.map((row, i) => row.name === name ? i : -1).filter(i => i >= 0);
    return indices.length === 1 ? indices[0] : -1;
}
export function createBaiBaiAppearanceBinding(snapshot, indices, { allowUnbound = false, origin = null, userName = null } = {}) {
    if (!snapshots.has(snapshot) || !Array.isArray(indices) || indices.length > 2) return fail('BBI_BINDING');
    const selected = indices.filter(index => index !== -1);
    if (selected.some(index => !Number.isInteger(index) || !snapshot.characters[index]) || new Set(selected).size !== selected.length) return fail('BBI_BINDING');
    if (!selected.length && !allowUnbound) return fail('BBI_BINDING');
    const characters = selected.map(index => snapshot.characters[index]);
    if (new Set(characters.map(row => row.name)).size !== characters.length) return fail('BBI_BINDING');
    const binding = Object.freeze({ api: snapshot.api, revision: snapshot.revision, characters: Object.freeze(characters), roles: Object.freeze(indices.map((index, i) => index === -1 ? null : (i === 0 ? 'char' : 'user')).filter(Boolean)), allowUnbound, origin, userName });
    bindings.add(binding); return binding;
}
export function createUnboundBaiBaiAppearanceBinding(origin = null, userName = null) {
    // Only explicit local UI may choose to keep an old/manual prompt without binding.
    const binding = Object.freeze({ api: globalThis.STBaiBaiImage, revision: null, characters: Object.freeze([]), roles: Object.freeze([]), allowUnbound: true, origin, userName });
    bindings.add(binding); return binding;
}
export function imagePromptActors(binding) {
    if (!bindings.has(binding)) return fail('BBI_BINDING');
    return Object.freeze(binding.characters.map((row, slot) => Object.freeze({
        slot, role: binding.roles[slot], name: row.name, tag: row.tag, nl: row.nl,
    })));
}

export function buildBaiBaiCharacterRequest(binding, api, status, visual, sceneNl = visual, directions = null) {
    if (!bindings.has(binding) || binding.api !== api) return fail('BBI_BINDING');
    if (binding.origin) {
        let live;
        try { live = context.currentCharacterGuard(); } catch { return fail('BBI_BINDING'); }
        if (!context.isCurrentTaskOrigin(binding.origin, live) || (binding.userName !== null && live.name1 !== binding.userName)) return fail('BBI_BINDING');
    }
    const nl = text.normalizeText(sceneNl, 5000) || visual;
    const rows = binding.characters;
    const motion = directions === null ? null : image_rules.normalizeImageCharacterDirections(directions, rows.length);
    const poses = rows.map((row, i) => ({ name: row.name,
        tag: motion ? `${row.tag}, ${motion[i].actionTags}` : row.tag,
        nl: [row.nl, motion?.[i]?.actionNl].filter(Boolean).join('\n'),
    }));
    if (!rows.length) return { prompt: visual, nl };
    if (status?.supportsCharacters === true) return { prompt: visual, nl,
        characters: poses.map(row => ({ name: row.name, tag: row.tag, ...(row.nl ? { nl: row.nl } : {}) })) };
    if (rows.length > 1) return fail('BBI_CHARACTERS_UNSUPPORTED');
    // Public docs explicitly demonstrate a single character tag in the base prompt.
    // Never concatenate multiple character bodies into unsupported ComfyUI prompts.
    return { prompt: `${poses[0].tag}, ${visual}`, nl: [poses[0].nl, nl].filter(Boolean).join('\n') };
}
