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

function publicBaiBaiCharacters(api) {
    if (field(api, 'apiVersion') !== 1 || field(field(api, 'capabilities'), 'characterLibrary') !== true) return [];
    const read = field(api, 'getCharacters');
    if (typeof read !== 'function') return [];
    const snapshot = read.call(api);
    const rows = field(snapshot, 'characters');
    if (field(snapshot, 'apiVersion') !== 1 || !Array.isArray(rows)) return [];
    const result = [];
    for (let index = 0; index < rows.length; index++) {
        const row = field(rows, String(index)), name = field(row, 'name');
        // An unknown name could hide a duplicate; no unique match is provable.
        if (typeof name !== 'string') return [];
        result.push({ row, name });
    }
    return result;
}

// The public tag contains the whole character-library entry, including outfits.
// Keep only stable appearance clauses. Classification uses an unweighted copy;
// the emitted clause retains the user's weighting and has no character quota.
const SCENE_OR_ACTION = /\b(?:standing|sitting|walking|running|holding|waving|dancing|kneeling|lying|leaning|looking|gazing|smiling|crying|laughing|embracing|hugging|kissing|gripping|touching|pointing|raised|outstretched|crossed|clasped|clenched|open mouth|closed eyes|closed mouth|full[- ]body|upper[- ]body|lower[- ]body|portrait|close[- ]up|cowboy shot|from behind|front view|back view|dress|shirt|jacket|coat|skirt|pants|trousers|shorts|boots|shoes|gloves|hat|cap|ribbon|necklace|bracelet|earrings?|glasses|mask|armor|armour|cape|sleeves?|uniform|swimsuit|bikini|lingerie)\b|站|坐|走|跑|跪|躺|倚|挥|揮|握|举|舉|抱|亲吻|親吻|牵|牽|抬|垂|转身|轉身|看着|望着|闭眼|閉眼|闭嘴|張嘴|张嘴|全身|半身|特写|特寫|正面|背面|服|衣|裙|裤|褲|鞋|靴|手套|帽|丝带|絲帶|项链|項鏈|手链|手鏈|耳环|耳環|眼镜|眼鏡|面具|铠甲|鎧甲/iu;

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
                const matched = library.filter(entry => entry.name === person.name);
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
