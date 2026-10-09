import * as cast_looks from '../core/castLooks.js';
import * as appearance_presets from '../generation/imageAppearancePresets.js';

const text = value => typeof value === 'string' ? value.trim() : '';

// Explicit per-person refresh only. Do not call this while opening the page,
// changing styles or normalizing history: saved and handwritten drafts stay put.
export function readCoupleAppearance(settings, index, context) {
    const people = settings?.people;
    const person = [0, 1].includes(index) && Array.isArray(people) ? people[index] : null;
    if (!context || !person) return null;
    const role = person.id === 'char' && text(person.name) && text(person.name) === text(context.name2) ? 'char'
        : person.id === 'user' && text(person.name) && text(person.name) === text(context.name1) ? 'user' : '';
    let local = '';
    if (role) {
        let saved = null, card = {};
        try { saved = cast_looks.readCastLooks(context); } catch { /* Current card remains available. */ }
        if (saved?.manual === true) local = text(saved[role]);
        if (!local) {
            try { card = context.getCharacterCardFields?.() || {}; } catch { /* No source is not an error. */ }
            const description = role === 'char' ? text(card.description)
                : text(card.persona) || text(context.powerUserSettings?.persona_description);
            local = cast_looks.lookFromDescription(description);
        }
    }
    // The whole cast is needed for collision checks, but only this result is
    // returned. A refresh must never update the other subject's saved preset.
    const preset = appearance_presets.resolveImageAppearancePresets(context, people).get(person.id);
    const appearance = text(preset?.tag) || text(preset?.nl) || local;
    if (!appearance) return null;
    const replacement = { ...person, appearance };
    delete replacement.appearanceOverride;
    delete replacement.presetAppearance;
    delete replacement.presetNegative;
    delete replacement.fallbackAppearance;
    if (text(preset?.tag) || text(preset?.nl)) {
        replacement.presetAppearance = appearance;
        replacement.fallbackAppearance = local || text(person.fallbackAppearance) || text(person.appearance);
        if (text(preset.negative)) replacement.presetNegative = text(preset.negative);
    }
    return { person: replacement, source: preset ? 'preset' : 'local' };
}
