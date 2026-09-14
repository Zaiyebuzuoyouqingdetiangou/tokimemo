import test from 'node:test';
import assert from 'node:assert/strict';
import * as images from '../src/generation/imageGeneration.js';
import * as appearance from '../src/generation/cgAppearance.js';
import * as patch from '../src/core/cgImagePatch.js';

const scene = '两位成年人物在庭院栽花，一人扶住花苗，另一人浇水。';
const metadata = { flatPrompt: 'In a courtyard, Jia with black hair and green eyes holds a seedling while Yi with silver hair and brown eyes waters it.', sceneTags: '2people, gardening, courtyard, wide shot', characters: [
    { role: 'char', name: '甲', tag: 'black hair, green eyes', nl: '' },
    { role: 'user', name: '乙', tag: 'silver hair, brown eyes', nl: '' },
] };
for (const supportsCharacters of [true, false]) {
    test(`confirmed scene and both appearances reach the public provider, multi-character=${supportsCharacters}`, async t => {
        const old = globalThis.STBaiBaiImage;
        const oldLocation = globalThis.location;
        t.after(() => { globalThis.STBaiBaiImage = old; globalThis.location = oldLocation; });
        globalThis.location = { href: 'tauri://localhost/' };
        let calls = 0;
        globalThis.STBaiBaiImage = { apiVersion: 1, capabilities: { generate: true, saveToGallery: true },
            getBackendStatus: () => ({ configured: true, supportsCharacters }),
            generate: async request => {
                calls++;
                assert.equal(request.prompt, supportsCharacters ? metadata.sceneTags : metadata.flatPrompt);
                assert.equal(request.nl, appearance.cgPreparedVisualPrompt(scene, metadata), 'send preview equals actual natural-language input');
                assert.ok(request.nl.startsWith(scene));
                assert.match(request.nl, /甲：black hair, green eyes/);
                assert.match(request.nl, /乙：silver hair, brown eyes/);
                assert.equal(request.character, '甲', 'gallery label is separate from appearance');
                if (supportsCharacters) assert.deepEqual(request.characters, [
                    { name: '甲', tag: 'black hair, green eyes' }, { name: '乙', tag: 'silver hair, brown eyes' },
                ]);
                else assert.equal(request.characters, undefined);
                return { path: '/user/images/fixture/garden.png' };
            } };
        await images.invokeImageGeneration(scene, { name2: '甲', getCharacterCardFields() { throw new Error('redraw must not reread card'); } }, { promptMetadata: metadata });
        assert.equal(calls, 1);
    });
}

test('appearance metadata survives deferred single-item patches without changing old image signatures', () => {
    const oldLocation = globalThis.location;
    globalThis.location = { href: 'tauri://localhost/' };
    try {
        const legacy = { url: '/user/images/fixture/old.png', prompt: scene, provider: 'baibai-image', generatedAt: 1 };
        assert.deepEqual(patch.normalizeCgImageRecord(legacy), legacy);
        const item = { id: 'event', desc: scene, cgImage: legacy };
        const image = { ...legacy, url: '/user/images/fixture/new.png', promptMetadata: metadata };
        const change = { version: 1, mode: 'album', itemId: item.id, expectedSignature: patch.cgItemSignature(item), image };
        const result = patch.applyCgImagePatch({ kind: 'album', entries: [item] }, change);
        assert.equal(result.status, 'applied');
        assert.deepEqual(result.session.entries[0].cgImage.promptMetadata, metadata);
        assert.equal(patch.applyCgImagePatch(result.session, change).status, 'already-applied');
        assert.deepEqual(item.cgImage, legacy, 'old session was not mutated');
    } finally { globalThis.location = oldLocation; }
});
