import test from 'node:test';
import assert from 'node:assert/strict';
import * as patch from '../src/core/cgImagePatch.js';
import * as images from '../src/generation/imageGeneration.js';
import * as bbi from '../src/generation/baibaiImage.js';
import * as constants from '../src/core/constants.js';

const imagePath = '/user/images/fixture/event.png';
const scene = '两位成年人物在庭院一同栽花，一人扶住花苗，另一人浇水。';
function setLocation(href) { globalThis.location = { href, origin: new URL(href).origin }; }

for (const href of ['https://cloud.example/', 'http://localhost:8000/', 'tauri://localhost/']) {
  test(`saved image reaches the album and survives reopening at ${href}`, async () => {
    setLocation(href);
    let calls = 0;
    globalThis.STBaiBaiImage = {
      apiVersion: 1, capabilities: { generate: true, saveToGallery: true },
      getBackendStatus: () => ({ configured: true }),
      generate: async request => { calls++; assert.equal(request.save, true); return { path: imagePath }; },
    };
    try {
      const result = await bbi.generateBaiBaiImage(scene);
      const image = { ...result, prompt: scene, generatedAt: 1 };
      assert.equal(images.normalizeCgImageUrl(result.url), imagePath);
      const session = { kind: constants.MODE.ALBUM, entries: [{ id: 'event', desc: scene }, { id: 'other', desc: '旧回忆' }] };
      const before = JSON.stringify(session);
      const change = { version: 1, mode: session.kind, itemId: 'event', expectedSignature: patch.cgItemSignature(session.entries[0]), image };
      const applied = patch.applyCgImagePatch(session, change);
      assert.equal(applied.status, 'applied');
      assert.equal(JSON.stringify(session), before, 'input session remains unchanged');
      assert.deepEqual(applied.session.entries[1], session.entries[1]);
      const reopened = JSON.parse(JSON.stringify(applied.session));
      assert.equal(images.normalizeCgImageRecord(reopened.entries[0].cgImage).url, imagePath);
      assert.match(images.cgImageLayerHtml(reopened.entries[0]), /<img\b/);
      assert.equal(patch.applyCgImagePatch(reopened, change).status, 'already-applied');
      reopened.entries[0].desc = '新回忆';
      reopened.entries[0].cgImage = { ...image, url: '/user/images/fixture/new.png' };
      assert.equal(patch.applyCgImagePatch(reopened, change).status, 'conflict');
      assert.equal(calls, 1);
    } finally { delete globalThis.STBaiBaiImage; }
  });
}

test('TT host checks reject opaque-origin lookalikes and unsafe schemes', () => {
  setLocation('tauri://localhost/');
  for (const url of ['tauri://evil/user/images/a.png', 'tauri://localhost:80/user/images/a.png', 'tauri://user@localhost/user/images/a.png', 'https://localhost/user/images/a.png', 'file:///user/images/a.png', 'data:image/png;base64,a', 'javascript:alert(1)', '//evil/user/images/a.png', 'blob:tauri://localhost/a', '\\evil\\a.png', '/user/images/a\u0000.png']) {
    assert.equal(patch.normalizeCgImageUrl(url), '', url);
  }
  assert.equal(patch.normalizeCgImageUrl('tauri://localhost' + imagePath), imagePath);
});

test('durable patches retain strict image-file checks across host types', () => {
  for (const href of ['https://cloud.example/', 'tauri://localhost/']) {
    setLocation(href);
    for (const url of ['/api/secrets.png', '/user/images/a.svg', '/user/images/a.png?query=1', '/user/images/a.png#fragment', '/user/images/%2e%2e/a.png', '/user/images/a%2fb.png', '/user/images/a%252fb.png']) {
      assert.equal(patch.savedLocalImagePath(url), '', url);
      assert.equal(patch.normalizeCgImagePatch({ version: 1, mode: constants.MODE.ALBUM, itemId: 'a', expectedSignature: 'fixture', image: { url, provider: 'baibai-image' } }), null, url);
    }
  }
  setLocation('https://cloud.example/');
  assert.equal(patch.normalizeCgImageUrl('/legacy/image.png?v=1'), '/legacy/image.png?v=1');
  assert.equal(patch.normalizeCgImageUrl('https://other.example/image.png'), '');
  for (const href of ['https://cloud.example/', 'tauri://localhost/']) {
    setLocation(href);
    assert.equal(patch.normalizeCgImageUrl(href + '/evil.example/user/images/a.png'), '');
    assert.equal(patch.normalizeCgImageRecord({ url: href + '/evil.example/user/images/a.png' }), null);
  }
});

test('initial prompt keeps the event when imagePrompt only describes appearance', () => {
  setLocation('https://cloud.example/');
  let cardReads = 0;
  globalThis.SillyTavern = { getContext: () => ({ getCharacterCardFields: () => { cardReads++; return { description: '不应读取的角色卡' }; } }) };
  try {
    const prompt = images.cgImagePromptForItem({ cgDesc: scene, imagePrompt: '黑发绿眼的成年男子，红衣，面部特写' });
    assert.ok(prompt.includes(scene));
    assert.ok(prompt.indexOf(scene) < prompt.indexOf('黑发绿眼'));
    assert.equal(cardReads, 0);
    assert.ok(prompt.length <= constants.MAX_CG_IMAGE_PROMPT_CHARS);
  } finally { delete globalThis.SillyTavern; }
});

test('long appearance supplement cannot truncate the event or visual constraints', () => {
  const prompt = images.cgImagePromptForItem({ desc: scene, imagePrompt: '外貌补充'.repeat(1000), visualSeed: ['花盆'] });
  assert.ok(prompt.includes(scene));
  assert.match(prompt, /no text/);
  assert.ok(prompt.includes('花盆'));
  assert.ok(prompt.length <= constants.MAX_CG_IMAGE_PROMPT_CHARS);
});

test('successful-image redraw keeps the previously confirmed prompt', () => {
  setLocation('tauri://localhost/');
  const prompt = '用户已确认的画面提示';
  assert.equal(images.cgImagePromptForItem({ cgImage: { url: imagePath, prompt }, imagePrompt: '其他描述', desc: scene }), prompt);
});
