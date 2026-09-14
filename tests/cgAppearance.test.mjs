import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CG_APPEARANCE_TAG_LIMIT,
    CG_SCENE_TAG_LIMIT,
    CG_PREPARED_NL_LIMIT,
    captureCgAppearanceEvidence,
    buildCgAppearanceInstructions,
    normalizeCgPreparedPrompt,
    normalizeCgPromptMetadata,
    cgPreparedVisualPrompt,
} from '../src/generation/cgAppearance.js';

const scene = '两位成年人物在庭院一同栽花，一人扶住花苗，另一人浇水。';
const flatPrompt = 'In a courtyard, an adult man with short black hair and green eyes steadies a seedling while an adult woman with long silver hair and brown eyes waters it. The man wears a blue jacket and the woman wears a white shirt. Landscape composition.';
const charName = '阿辰';
const userName = '小雨';
function host(fields = {}) {
    return {
        name1: userName,
        name2: charName,
        getCharacterCardFields: () => ({
            description: '成年男性，黑色短发、绿色眼睛，穿蓝色外套。',
            personality: '沉稳。',
            persona: '成年女性，银色长发、棕色眼睛，穿白色衬衣。',
            ...fields,
        }),
    };
}
function prepared(characters = [
    { role: 'char', tag: 'black hair, short hair, green eyes, blue jacket', nl: '黑色短发，绿色眼睛，蓝色外套。' },
    { role: 'user', tag: 'silver hair, long hair, brown eyes, white shirt', nl: '银色长发，棕色眼睛，白色衬衣。' },
]) {
    return { imagePrompt: scene, sceneTags: '2people, gardening, courtyard, watering can', flatPrompt, characters };
}
function byRole(value, role) { return value.characters.find(item => item.role === role); }

test('appearance evidence captures both host roles without reading live chat or worldbooks', () => {
    const context = host();
    Object.defineProperties(context, {
        chat: { get() { throw new Error('chat must not be read'); } },
        worldInfo: { get() { throw new Error('worldbooks must not be read'); } },
    });
    const evidence = captureCgAppearanceEvidence(context, { api: null });
    assert.equal(byRole(evidence, 'char').name, charName);
    assert.equal(byRole(evidence, 'user').name, userName);
    assert.match(byRole(evidence, 'char').description, /黑色短发/);
    assert.match(byRole(evidence, 'user').description, /银色长发/);
    assert.deepEqual(evidence.missingRoles, []);
});

test('persona uses the existing host fallback only when the card persona is absent', () => {
    const context = host({ persona: '' });
    context.powerUserSettings = { persona_description: '成年女性，红色卷发。' };
    const fallback = captureCgAppearanceEvidence(context, { api: null });
    assert.match(byRole(fallback, 'user').description, /红色卷发/);
    const complete = host();
    complete.powerUserSettings = { persona_description: '不应覆盖的旧人设' };
    const current = captureCgAppearanceEvidence(complete, { api: null });
    assert.match(byRole(current, 'user').description, /银色长发/);
    assert.doesNotMatch(byRole(current, 'user').description, /不应覆盖/);
});

test('excluded source blocks are removed from both roles before prompt instructions', () => {
    const context = host({
        description: '黑发。<thinking>HIDDEN_CHAR_TOKEN</thinking>',
        personality: '<secret>HIDDEN_PERSONALITY_TOKEN</secret>沉稳。',
        persona: '银发。&lt;secret&gt;HIDDEN_USER_TOKEN&lt;/secret&gt;',
    });
    context.extensionSettings = { heartbeatMemories: { excludedContextTags: ['thinking', 'secret'] } };
    const evidence = captureCgAppearanceEvidence(context, { api: null });
    const instructions = buildCgAppearanceInstructions(evidence);
    assert.doesNotMatch(JSON.stringify(evidence), /HIDDEN_/);
    assert.doesNotMatch(instructions, /HIDDEN_/);
    assert.ok(instructions.includes(charName));
    assert.ok(instructions.includes(userName));
    assert.match(byRole(evidence, 'char').description, /黑发/);
    assert.match(byRole(evidence, 'user').description, /银发/);
});

test('optional public character library is read once and conflicting generated appearances are rejected together', () => {
    let calls = 0;
    const api = {
        apiVersion: 1,
        capabilities: { characterLibrary: true },
        getCharacters() { calls++; return { apiVersion: 1, characters: [{ name: charName, tag: 'black hair, green eyes', nl: '黑发绿眼' }] }; },
        generate() { throw new Error('appearance capture must not generate images'); },
    };
    Object.defineProperties(api, {
        settings: { get() { throw new Error('private settings must not be read'); } },
        database: { get() { throw new Error('private database must not be read'); } },
    });
    const evidence = captureCgAppearanceEvidence(host(), { api });
    assert.equal(calls, 1);
    assert.equal(byRole(evidence, 'char').knownTag, 'black hair, green eyes');
    assert.throws(() => normalizeCgPreparedPrompt(prepared([
        { role: 'char', tag: 'blonde hair, blue eyes', nl: '不正确的新外貌' },
        { role: 'user', tag: 'silver hair, brown eyes', nl: '银发棕眼' },
    ]), evidence), error => error.code === 'RMT_CG_PROMPT_INVALID');
    const result = normalizeCgPreparedPrompt(prepared([
        { role: 'char', tag: 'black hair, green eyes', nl: '黑发绿眼' },
        { role: 'user', tag: 'silver hair, brown eyes', nl: '银发棕眼' },
    ]), evidence);
    assert.equal(byRole(result, 'char').tag, 'black hair, green eyes');
    assert.doesNotMatch(byRole(result, 'char').tag, /blonde/);
});

test('empty or unavailable public library falls back to host evidence', () => {
    for (const api of [null, {},
        { apiVersion: 1, capabilities: { characterLibrary: true }, getCharacters: () => ({ apiVersion: 1, characters: [] }) },
        { apiVersion: 1, capabilities: { characterLibrary: true }, getCharacters: () => { throw new Error('unavailable'); } },
        { apiVersion: 2, capabilities: { characterLibrary: true }, getCharacters: () => { throw new Error('unsupported API must not be read'); } },
        { apiVersion: 1, capabilities: { characterLibrary: false }, getCharacters: () => { throw new Error('disabled API must not be read'); } },
    ]) {
        const evidence = captureCgAppearanceEvidence(host(), { api });
        assert.match(byRole(evidence, 'char').description, /黑色短发/);
        assert.match(byRole(evidence, 'user').description, /银色长发/);
        assert.deepEqual(evidence.missingRoles, []);
    }
});

test('public library capability and API version gates prevent unsupported calls', () => {
    for (const declaration of [
        { apiVersion: 2, capabilities: { characterLibrary: true } },
        { apiVersion: 1, capabilities: { characterLibrary: false } },
        { apiVersion: 1, capabilities: {} },
    ]) {
        let calls = 0;
        captureCgAppearanceEvidence(host(), { api: {
            ...declaration,
            getCharacters() { calls++; return { apiVersion: 1, characters: [] }; },
        } });
        assert.equal(calls, 0);
    }
});

test('public library does not use partial or ambiguous name matches', () => {
    for (const records of [
        [{ name: charName + '的朋友', tag: 'pink hair' }],
        [{ name: charName, tag: 'pink hair' }, { name: charName, tag: 'blue hair' }],
    ]) {
        const evidence = captureCgAppearanceEvidence(host(), {
            api: { apiVersion: 1, capabilities: { characterLibrary: true }, getCharacters: () => ({ apiVersion: 1, characters: records }) },
        });
        assert.ok(!byRole(evidence, 'char').knownTag);
    }
});

test('captured evidence remains bound to the initiating names and persona after a context switch', () => {
    const context = host();
    const evidence = captureCgAppearanceEvidence(context, { api: null });
    context.name1 = '其他用户';
    context.name2 = '其他角色';
    context.getCharacterCardFields = () => ({ description: '另一角色外貌', persona: '另一用户外貌' });
    const result = normalizeCgPreparedPrompt(prepared(), evidence);
    assert.equal(byRole(result, 'char').name, charName);
    assert.equal(byRole(result, 'user').name, userName);
    assert.doesNotMatch(buildCgAppearanceInstructions(evidence), /其他用户|其他角色|另一角色|另一用户/);
});

test('structured output keeps scene and both separate appearance tags with trusted names', () => {
    const evidence = captureCgAppearanceEvidence(host(), { api: null });
    const raw = prepared();
    raw.characters[0].name = '模型试图替换的角色';
    raw.characters[1].name = '模型试图替换的用户';
    const result = normalizeCgPreparedPrompt(raw, evidence);
    assert.equal(result.imagePrompt, scene);
    assert.equal(result.sceneTags, raw.sceneTags);
    assert.equal(result.flatPrompt, flatPrompt);
    assert.equal(result.characters.length, 2);
    assert.equal(byRole(result, 'char').name, charName);
    assert.equal(byRole(result, 'user').name, userName);
    assert.match(byRole(result, 'char').tag, /black hair/);
    assert.match(byRole(result, 'user').tag, /silver hair/);
});

test('unknown roles and duplicate roles cannot add people to the prepared request', () => {
    const evidence = captureCgAppearanceEvidence(host(), { api: null });
    const result = normalizeCgPreparedPrompt(prepared([
        { role: 'char', tag: 'black hair' },
        { role: 'char', tag: 'pink hair' },
        { role: 'stranger', tag: 'blue hair' },
    ]), evidence);
    assert.deepEqual(result.characters, [], 'ambiguous duplicate roles must not choose an arbitrary appearance');
    const single = normalizeCgPreparedPrompt(prepared([{ role: 'char', tag: 'black hair' }]), evidence);
    assert.equal(single.characters.length, 1);
    assert.equal(single.characters[0].role, 'char');
    assert.equal(single.characters[0].name, charName);
    assert.ok(!single.characters.some(item => item.role === 'user'), 'a missing output role must not invent an extra person');
});

test('missing source evidence drops model-invented appearance instead of guessing', () => {
    const evidence = captureCgAppearanceEvidence(host({ description: '', personality: '', persona: '' }), { api: null });
    assert.deepEqual(new Set(evidence.missingRoles), new Set(['char', 'user']));
    const result = normalizeCgPreparedPrompt(prepared(), evidence);
    assert.deepEqual(result.characters, []);
    assert.equal(result.imagePrompt, scene);
});

test('malformed prepared output reports a safe error without reflecting raw source', () => {
    const evidence = captureCgAppearanceEvidence(host(), { api: null });
    for (const raw of [null, 'PRIVATE_RAW_RESPONSE', {},
        { imagePrompt: 'PRIVATE_RAW_RESPONSE', sceneTags: '', flatPrompt, characters: [] },
        { imagePrompt: 'a'.repeat(1801), sceneTags: 'courtyard', flatPrompt, characters: [] },
        { imagePrompt: scene, sceneTags: 'a'.repeat(CG_SCENE_TAG_LIMIT + 1), flatPrompt, characters: [] },
    ]) {
        assert.throws(() => normalizeCgPreparedPrompt(raw, evidence), error => {
            assert.equal(error.safeToDisplay, true);
            assert.doesNotMatch(String(error.message) + String(error.safeUserMessage), /PRIVATE_RAW_RESPONSE/);
            return true;
        });
    }
});

test('prepared output requires a complete bounded flat prompt and safely rejects missing or malformed values', () => {
    const evidence = captureCgAppearanceEvidence(host(), { api: null });
    for (const value of [undefined, '', '   ', null, 123, 'PRIVATE_RAW_RESPONSE'.repeat(100)]) {
        const raw = prepared();
        if (value === undefined) delete raw.flatPrompt;
        else raw.flatPrompt = value;
        assert.throws(() => normalizeCgPreparedPrompt(raw, evidence), error => {
            assert.equal(error.safeToDisplay, true);
            assert.doesNotMatch(String(error.message) + String(error.safeUserMessage), /PRIVATE_RAW_RESPONSE/);
            return true;
        });
    }
});

test('old records remain without appearance metadata and normalized metadata needs no live context', () => {
    assert.equal(normalizeCgPromptMetadata(null), null);
    assert.equal(normalizeCgPromptMetadata({}), null);
    const metadata = normalizeCgPromptMetadata({ sceneTags: ' courtyard ', characters: [
        { role: 'char', name: charName, tag: ' black hair ', nl: ' 黑色短发 ' },
    ] });
    assert.equal(metadata.sceneTags, 'courtyard');
    assert.equal(metadata.characters[0].name, charName);
    assert.equal(metadata.characters[0].tag, 'black hair');
    assert.equal(Object.hasOwn(metadata, 'flatPrompt'), false, 'legacy metadata must not gain a signature-changing empty field');
    assert.deepEqual(normalizeCgPromptMetadata(JSON.parse(JSON.stringify(metadata))), metadata);
});

test('flat prompt metadata survives saving and reopening without adding empty fields to older records', () => {
    const metadata = normalizeCgPromptMetadata({ sceneTags: 'courtyard', flatPrompt: `  ${flatPrompt}  `, characters: [
        { role: 'char', name: charName, tag: 'black hair', nl: '黑发' },
    ] });
    assert.equal(metadata.flatPrompt, flatPrompt);
    assert.deepEqual(normalizeCgPromptMetadata(JSON.parse(JSON.stringify(metadata))), metadata);
    const empty = normalizeCgPromptMetadata({ sceneTags: 'courtyard', flatPrompt: ' ', characters: [] });
    assert.equal(Object.hasOwn(empty, 'flatPrompt'), false);
    assert.equal(normalizeCgPromptMetadata({ flatPrompt: '' }), null);
    const bounded = normalizeCgPromptMetadata({ flatPrompt: '<b>garden</b> https://evil.example/scene ' + 'garden, '.repeat(1000) });
    assert.ok(bounded.flatPrompt.length <= 1800);
    assert.doesNotMatch(bounded.flatPrompt, /<|>|https?:\/\//);
});

test('preview labels each appearance by name and uses editable tags instead of stale natural-language metadata', () => {
    const metadata = normalizeCgPromptMetadata({ sceneTags: 'courtyard', characters: [
        { role: 'char', name: charName, tag: 'black hair, green eyes', nl: 'STALE_PERSONA_DESCRIPTION' },
        { role: 'user', name: userName, tag: 'silver hair, brown eyes', nl: 'STALE_USER_DESCRIPTION' },
    ] });
    const preview = cgPreparedVisualPrompt(scene, metadata);
    assert.ok(preview.includes(scene));
    assert.ok(preview.includes(charName));
    assert.ok(preview.includes(userName));
    assert.ok(preview.includes('black hair, green eyes'));
    assert.ok(preview.includes('silver hair, brown eyes'));
    assert.doesNotMatch(preview, /STALE_/);
});

test('bounded hostile metadata cannot inject markup, URLs or extra roles into the visual prompt', () => {
    const raw = { sceneTags: 'garden, '.repeat(1000), characters: [
        { role: 'char', name: charName, tag: 'black hair, '.repeat(1000), nl: '<script>evil()</script>https://evil.example/private' },
        { role: 'user', name: userName, tag: 'silver hair, '.repeat(1000), nl: '银发' },
        { role: 'intruder', name: '陌生人', tag: 'red hair' },
    ] };
    const metadata = normalizeCgPromptMetadata(raw);
    assert.ok(metadata.sceneTags.length <= CG_SCENE_TAG_LIMIT);
    assert.ok(metadata.characters.length <= 2);
    for (const person of metadata.characters) assert.ok(person.tag.length <= CG_APPEARANCE_TAG_LIMIT);
    const preview = cgPreparedVisualPrompt(scene.repeat(1000), metadata);
    assert.ok(preview.length <= CG_PREPARED_NL_LIMIT);
    assert.doesNotMatch(preview, /<script|https?:\/\/|陌生人/);
    const dirty = normalizeCgPromptMetadata({ sceneTags: '<b>garden</b> https://evil.example/scene', characters: [
        { role: 'char', name: '<b>阿辰</b>', tag: '<i>black hair</i> https://evil.example/tag', nl: '<b>黑发</b>' },
    ] });
    assert.ok(dirty.characters[0].tag.includes('black hair'));
    assert.doesNotMatch(JSON.stringify(dirty), /<|>|https?:\/\//);
    const evidence = captureCgAppearanceEvidence(host({ description: '黑发'.repeat(10000), persona: '银发'.repeat(10000) }), { api: null });
    for (const person of evidence.characters) assert.ok(person.description.length <= 5000);
});
