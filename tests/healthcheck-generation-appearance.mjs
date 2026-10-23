import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Run the original module functions; only storage, host fields, external preset
// resolution and unrelated registration are boundaries. No provider is called.
function sourceModule(relative, bindings, names) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8')
        .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
    return Function(...Object.keys(bindings), `${source}\nreturn {${names.join(',')}};`)(...Object.values(bindings));
}
const text = {
    normalizeText: (value, max = 20000) => String(value ?? '').replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim().slice(0, max),
    safeUserError: (message, code) => Object.assign(new Error(message), { code }),
};
const participants = sourceModule('../src/core/participants.js', {}, ['normalizeParticipantSnapshot']);
const preset_text = sourceModule('../src/generation/chatu8Presets.js', {}, ['literalPresetAppearanceText']);
const character_scene = sourceModule('../src/generation/cgCharacterScene.js', { text }, ['cgCharacterSceneValue', 'cgCharacterSceneFields']);
function fixture({ saved = null, presets = new Map(), participantLooks = null, card = null, fallbackPersona = '' } = {}) {
    let reads = 0;
    const context = {
        name2: '角色甲', name1: '用户乙',
        getCharacterCardFields() {
            reads++;
            return card || { description: '角色甲，黑色短发，蓝色眼睛', personality: '', persona: '用户乙，白色长发，红色眼睛' };
        },
        powerUserSettings: { persona_description: fallbackPersona },
    };
    const api = sourceModule('../src/generation/cgAppearance.js', {
        text, character_scene, participants, preset_text,
        cast_looks: { readCastLooks: () => saved, readParticipantLooks: () => participantLooks },
        context_tags: { filterContextTags: value => value, tagPolicyForContext: () => ({}) },
        image_presets: { resolveImageAppearancePresets: () => presets },
        core_generationBridge: { registerGenerationBridge() {} },
        cache: { readParticipantRoster: () => null }, cg_visual: {}, format: {},
    }, ['captureCgAppearanceEvidence', 'appearanceEvidenceWithDraft']);
    return { api, context, reads: () => reads };
}
function row(evidence, role) { return evidence.characters.find(value => value.role === role); }
const savedBoth = { manual: true, char: 'short black hair, blue eyes', user: 'long white hair, red eyes' };

test('saving one role does not hide the other role persona', () => {
    const f = fixture({ saved: { ...savedBoth, user: '' } });
    const evidence = f.api.captureCgAppearanceEvidence(f.context);
    assert.equal(row(evidence, 'char').knownTag, savedBoth.char);
    assert.equal(row(evidence, 'char').description, '');
    assert.equal(row(evidence, 'user').description, '用户乙，白色长发，红色眼睛');
    assert.deepEqual(evidence.missingRoles, []);
});

test('explicitly clearing a saved role restores its own source and preserves the other manual look', () => {
    const f = fixture({ saved: savedBoth });
    const evidence = f.api.captureCgAppearanceEvidence(f.context);
    assert.equal(f.reads(), 0, 'nonempty manual looks need no host reread');
    const ready = f.api.appearanceEvidenceWithDraft(evidence, { char: { tag: '', appearanceOverride: true }, user: { tag: savedBoth.user } }, f.context);
    assert.equal(row(ready, 'char').knownTag, '');
    assert.equal(row(ready, 'char').description, '角色甲，黑色短发，蓝色眼睛');
    assert.equal(row(ready, 'user').knownTag, savedBoth.user);
    assert.equal(row(ready, 'user').description, '');
    assert.equal(row(evidence, 'char').knownTag, savedBoth.char, 'captured evidence remains immutable');
});

test('clearing both roles restores both sources with one host read', () => {
    const f = fixture({ saved: savedBoth });
    const evidence = f.api.captureCgAppearanceEvidence(f.context);
    const ready = f.api.appearanceEvidenceWithDraft(evidence, { char: '', user: '' }, f.context);
    assert.equal(row(ready, 'char').description, '角色甲，黑色短发，蓝色眼睛');
    assert.equal(row(ready, 'user').description, '用户乙，白色长发，红色眼睛');
    assert.equal(f.reads(), 1);
});

test('matched external preset retains priority over an untouched saved look', () => {
    const f = fixture({ saved: savedBoth, presets: new Map([['char', { tag: 'silver hair, violet eyes', negative: 'red hair' }]]) });
    const evidence = f.api.captureCgAppearanceEvidence(f.context);
    const ready = f.api.appearanceEvidenceWithDraft(evidence, { char: { tag: savedBoth.char, appearanceOverride: false } }, f.context);
    assert.equal(row(ready, 'char').knownTag, 'silver hair, violet eyes');
    assert.equal(row(ready, 'char').negative, 'red hair');
    assert.equal(row(ready, 'char').presetAppearance, true);
    assert.equal(f.reads(), 0);
});

test('nonempty editor override is preserved without rereading card sources', () => {
    const f = fixture({ saved: savedBoth });
    const evidence = f.api.captureCgAppearanceEvidence(f.context);
    const ready = f.api.appearanceEvidenceWithDraft(evidence, { char: { tag: 'curly auburn hair, freckles', appearanceOverride: true } }, f.context);
    assert.equal(row(ready, 'char').knownTag, 'curly auburn hair, freckles');
    assert.equal(row(ready, 'user').knownTag, savedBoth.user);
    assert.equal(f.reads(), 0);
});

test('missing unselected role does not read sources or enter the picture', () => {
    const f = fixture({ saved: { ...savedBoth, user: '' } });
    const evidence = f.api.captureCgAppearanceEvidence(f.context, { selectedRoles: ['char'] });
    assert.equal(evidence.characters.length, 1);
    assert.equal(evidence.characters[0].role, 'char');
    assert.equal(f.reads(), 0);
});

test('multiplayer clear remains bound to participant ID and selected source', () => {
    const snapshot = { version: 1, people: [{ id: 'p1', name: '同名人物', sourceRefs: [{ world: '甲', uid: '1', title: '甲人物', content: '<look>银色短发</look>' }] }, { id: 'p2', name: '同名人物', sourceRefs: [{ world: '乙', uid: '2', title: '乙人物', content: '<look>红色长发</look>' }] }] };
    const f = fixture({ participantLooks: { characters: [{ participantId: 'p1', tag: 'silver hair' }, { participantId: 'p2', tag: 'red hair' }] } });
    const evidence = f.api.captureCgAppearanceEvidence(f.context, { castSnapshot: snapshot });
    const ready = f.api.appearanceEvidenceWithDraft(evidence, { p1: { tag: '', appearanceOverride: true } }, f.context);
    assert.equal(ready.characters.find(value => value.participantId === 'p1').description, '银色短发');
    assert.equal(ready.characters.find(value => value.participantId === 'p2').knownTag, 'red hair');
    assert.equal(f.reads(), 0);
});

test('missing source stays empty instead of borrowing the other role source', () => {
    const f = fixture({ saved: savedBoth, card: { description: '', personality: '', persona: '用户乙，白色长发' } });
    const ready = f.api.appearanceEvidenceWithDraft(f.api.captureCgAppearanceEvidence(f.context), { char: '' }, f.context);
    assert.equal(row(ready, 'char').description, '');
    assert.equal(row(ready, 'char').knownTag, '');
    assert.equal(row(ready, 'user').knownTag, savedBoth.user);
});
