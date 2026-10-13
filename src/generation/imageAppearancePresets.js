// The selected provider's public, synchronous appearance snapshot. This module
// never generates, expands macros, changes provider settings or saves a draft.
import * as settings from '../core/settings.js';
import * as visual from '../core/cgVisualRules.js';
import * as chatu8 from './chatu8Presets.js';

const INVALID = Symbol('unsupported-preset-data');

function field(value, key) {
    if (!value || typeof value !== 'object' && typeof value !== 'function') return INVALID;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return !descriptor ? undefined : Object.hasOwn(descriptor, 'value') ? descriptor.value : INVALID;
}

function nameKey(name) {
    return typeof name === 'string' ? name.normalize('NFKC').toLowerCase().replace(/-/g, ' ')
        .replace(/[‘’`´]/g, "'").replace(/\s+/g, ' ').trim() : '';
}

// Same name typed slightly differently: full/half width, outer spaces, letter case.
// Nothing else is loosened; a different name never matches.
function looseKey(name) {
    return typeof name === 'string' ? name.normalize('NFKC').trim().toLowerCase() : '';
}

// 柏宝绘 entries are often named after the ST macro instead of the persona
// name ({{user}} / {{char}}). Those aliases point at the current user/char only.
const USER_ALIASES = new Set(['{{user}}', '<user>', 'user']);
const CHAR_ALIASES = new Set(['{{char}}', '<char>', 'char']);
// Macro spellings stand for the current user/char only.
function libraryAliasMatches(entryName, person, context) {
    const entry = nameKey(entryName), own = nameKey(person.name);
    if (!entry || !own) return false;
    if (USER_ALIASES.has(entry)) return person.id === 'user' || own === nameKey(context?.name1);
    if (CHAR_ALIASES.has(entry)) return person.id === 'char' || own === nameKey(context?.name2);
    return false;
}

// Exact name first, then the same name typed loosely, then {{user}}/{{char}}.
// The first step that finds anything decides; it must find exactly one.
function libraryMatches(library, person, context) {
    const exact = library.filter(entry => entry.name === person.name);
    if (exact.length) return exact;
    const own = looseKey(person.name);
    const loose = own ? library.filter(entry => looseKey(entry.name) === own) : [];
    if (loose.length) return loose;
    return library.filter(entry => libraryAliasMatches(entry.name, person, context));
}

// null: this 柏宝绘 has no readable character library (missing, old, or malformed).
function baiBaiLibrary(api) {
    if (field(api, 'apiVersion') !== 1 || field(field(api, 'capabilities'), 'characterLibrary') !== true) return null;
    const read = field(api, 'getCharacters');
    if (typeof read !== 'function') return null;
    const snapshot = read.call(api);
    const rows = field(snapshot, 'characters');
    if (field(snapshot, 'apiVersion') !== 1 || !Array.isArray(rows)) return null;
    const result = [];
    for (let index = 0; index < rows.length; index++) {
        const row = field(rows, String(index)), name = field(row, 'name');
        // An unknown name could hide a duplicate; no unique match is provable.
        if (typeof name !== 'string') return null;
        result.push({ row, name });
    }
    return result;
}
function publicBaiBaiCharacters(api) {
    return baiBaiLibrary(api) || [];
}

// The public tag contains the whole character-library entry, including outfits.
// Keep only stable appearance clauses. Classification uses an unweighted copy;
// the emitted clause retains the user's weighting and has no character quota.
const SCENE_OR_ACTION = /\b(?:standing|sitting|walking|running|holding|waving|dancing|kneeling|lying|leaning|looking|gazing|smiling|crying|laughing|embracing|hugging|kissing|gripping|touching|pointing|raised|outstretched|crossed|clasped|clenched|open mouth|closed eyes|closed mouth|full[- ]body|upper[- ]body|lower[- ]body|portrait|close[- ]up|cowboy shot|from behind|front view|back view|dress|shirt|jacket|coat|skirt|pants|trousers|shorts|boots|shoes|gloves|hat|cap|ribbon|necklace|bracelet|earrings?|glasses|mask|armor|armour|cape|sleeves?|uniform|swimsuit|bikini|lingerie)\b|站|坐|走|跑|跪|躺|倚|挥|揮|握|举|舉|抱|亲吻|親吻|牵|牽|抬|垂(?:眸|眼|首|头|手|下(?:头|眼|眸|手))|转身|轉身|看着|望着|闭眼|閉眼|闭嘴|張嘴|张嘴|全身|半身|特写|特寫|正面|背面|服|衣|裙|裤|褲|鞋|靴|手套|帽|丝带|絲帶|项链|項鏈|手链|手鏈|耳环|耳環|眼镜|眼鏡|面具|铠甲|鎧甲/iu;

function stableAppearance(value, visible, subject) {
    const literal = chatu8.literalPresetAppearanceText(value);
    if (!literal) return '';
    const stable = visual.appearanceSourceClauses(literal, subject).filter(part => {
        const classification = part.replace(/[{}\[\]()]/g, '').replace(/[-+]?(?:\d+(?:\.\d+)?|\.\d+)::/g, '')
            .replace(/::/g, '').replace(/:\s*[-+]?(?:\d+(?:\.\d+)?|\.\d+)/g, '').replace(/_/g, ' ');
        return !!visual.automaticAppearanceClause(classification)
            && (visual.appearanceTraitClause(classification) || visual.explicitAppearanceIdentityClause(classification))
            && !SCENE_OR_ACTION.test(classification);
    }).join(', ');
    return chatu8.visiblePresetAppearance(chatu8.balancedPresetAppearance(stable), visible);
}

export function resolveImageAppearancePresets(context, people, { provider, api } = {}) {
    const result = new Map();
    try {
        const selected = provider === undefined ? settings.getPluginSettings(context).imageGenerationProvider : provider;
        if (!['chatu8-image', 'baibai-image'].includes(selected) || !Array.isArray(people)) return result;
        const roster = people.filter(person => person && typeof person.id === 'string' && person.id && nameKey(person.name));
        const names = new Map(), ids = new Map();
        for (const person of roster) {
            const name = nameKey(person.name);
            names.set(name, (names.get(name) || 0) + 1);
            ids.set(person.id, (ids.get(person.id) || 0) + 1);
        }
        const library = selected === 'baibai-image' ? publicBaiBaiCharacters(api === undefined ? field(globalThis, 'STBaiBaiImage') : api) : [];
        const claims = new Map(), matches = [];
        for (const person of roster) {
            let found = null;
            if (selected === 'chatu8-image') {
                // Resolve identity before cropping: an off-screen alias still
                // makes that preset unsafe for a different person in this cast.
                found = chatu8.chatu8PresetAppearance(context, person.name)
                    || chatu8.chatu8PresetAppearance(context, person.name, { visible: 'back' })
                    || chatu8.chatu8PresetAppearance(context, person.name, { visible: 'hands' });
            } else {
                const matched = libraryMatches(library, person, context);
                if (matched.length === 1) found = { row: matched[0].row, source: 'baibai', presetKey: matched[0].name };
            }
            if (!found) continue;
            const key = `${found.source}:${found.presetKey}`;
            claims.set(key, (claims.get(key) || 0) + 1);
            matches.push({ person, found, key });
        }
        for (const { person, found, key } of matches) {
            if (claims.get(key) !== 1 || names.get(nameKey(person.name)) !== 1 || ids.get(person.id) !== 1) continue;
            const visible = person.visible === undefined ? 'full' : person.visible;
            if (!['full', 'face', 'hands', 'back'].includes(visible)) continue;
            if (selected === 'chatu8-image') {
                const appearance = chatu8.chatu8PresetAppearance(context, person.name, { visible });
                // Preserve the same preset's optional literal negative together
                // with its identity; collisions omit both channels for this person.
                if (appearance?.tag) result.set(person.id, appearance);
            } else {
                const subject = { name: person.name, otherNames: roster.filter(row => row.id !== person.id).map(row => row.name) };
                const tag = stableAppearance(field(found.row, 'tag'), visible, subject);
                const nl = stableAppearance(field(found.row, 'nl'), visible, subject);
                if (tag || nl) result.set(person.id, { tag, ...(nl ? { nl } : {}), source: 'baibai', presetKey: found.presetKey });
            }
        }
    } catch {
        // Missing/unsupported public snapshots are absence, never a generation
        // error or an invitation to query the other provider.
        return new Map();
    }
    return result;
}

// Plain-language reason for each person in this picture: where the appearance
// came from, or why the 柏宝绘 character library was not used. Read-only.
// Returns null when the selected provider is not 柏宝绘 or 柏宝绘 is absent.
export function describeBaiBaiAppearanceSources(context, people, { provider, api } = {}) {
    try {
        const selected = provider === undefined ? settings.getPluginSettings(context).imageGenerationProvider : provider;
        const source = api === undefined ? field(globalThis, 'STBaiBaiImage') : api;
        if (selected !== 'baibai-image' || !source || !Array.isArray(people)) return null;
        const roster = people.filter(person => person && typeof person.id === 'string' && person.id && nameKey(person.name));
        let library;
        try { library = baiBaiLibrary(source); } catch { library = null; }
        const result = new Map();
        if (!library) {
            for (const person of roster) result.set(person.id, { status: 'unsupported', text: '当前柏宝绘版本不支持读角色库，需要更新柏宝绘；现在用的是心迹回廊里的外貌。' });
            return result;
        }
        const resolved = resolveImageAppearancePresets(context, roster, { provider: 'baibai-image', api: source });
        const names = library.map(entry => entry.name.trim()).filter(Boolean);
        const listed = names.length ? `，库里有：${names.slice(0, 8).join('、')}${names.length > 8 ? ` 等 ${names.length} 个` : ''}` : '，库里还没有角色';
        const sameName = new Map();
        for (const person of roster) sameName.set(looseKey(person.name), (sameName.get(looseKey(person.name)) || 0) + 1);
        for (const person of roster) {
            const name = person.name.trim(), found = resolved.get(person.id);
            if (found) { result.set(person.id, { status: 'matched', text: `外貌来自柏宝绘角色库「${found.presetKey}」。` }); continue; }
            const matched = libraryMatches(library, person, context);
            if (!matched.length) result.set(person.id, { status: 'missing', text: `柏宝绘角色库里没有叫「${name}」的角色${listed}。名字要和这里一样（全角半角、空格、大小写可以不同）。` });
            else if (matched.length > 1) result.set(person.id, { status: 'ambiguous', text: `柏宝绘角色库里有 ${matched.length} 个角色都能对上「${name}」：${matched.map(entry => entry.name).join('、')}，没有选用；改成只有一个就行。` });
            else if (sameName.get(looseKey(person.name)) > 1 || roster.some(other => other.id !== person.id && libraryMatches(library, other, context).some(entry => entry === matched[0])))
                result.set(person.id, { status: 'shared', text: `柏宝绘角色库「${matched[0].name}」同时对上了本图不止一个人，没有选用。` });
            else result.set(person.id, { status: 'empty', text: `对上了柏宝绘角色库「${matched[0].name}」，但里面没有能用的外貌（只写了衣着、动作或镜头这类内容），现在用的是心迹回廊里的外貌。` });
        }
        return result;
    } catch {
        return null;
    }
}
