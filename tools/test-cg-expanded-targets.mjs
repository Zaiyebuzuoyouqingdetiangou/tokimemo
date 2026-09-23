import assert from 'node:assert/strict';
import * as targets from '../src/core/cgTargets.js';
import * as patch from '../src/core/cgImagePatch.js';
import * as constants from '../src/core/constants.js';
import * as photoshoots from '../src/core/photoshootContract.js';
import * as generation from '../src/generation/imageGeneration.js';

const image = url => ({ url, prompt: 'soft visual novel CG', provider: 'baibai-image', generatedAt: 1 });
function write(session, mode, descriptor, url) {
    const item = targets.expandedCgItem(session, descriptor).item;
    const result = patch.applyCgImagePatch(session, { version: 1, mode, itemId: item.id, expectedSignature: patch.cgItemSignature(item), image: image(url) });
    assert.equal(result.status, 'applied');
    return result.session;
}

let heart = { kind: constants.MODE.HEART, greetings: { morning: ['早安，窗边的光很柔和。'] }, dailyStrips: [{ id: 'STRIP_1', title: '旧一格', subtitle: '午后', panels: [], cgImage: image('/user/images/old.png') }],
    voiceDramas: [{ id: 'VOICE_POST', kind: 'postending', title: '多年以后', subtitle: '未来', setting: '雨后的厨房', visualTone: 'soft', script: [{ speaker: 'char', text: '热茶还在。' }] }],
    scenarioDramas: [{ id: 'SCENE_SPRING', season: 'spring', title: '春日散步', subtitle: '公园', setting: '樱花小径', visualTone: 'clear', script: [{ speaker: 'user', text: '风很轻。' }] }],
    languageVisuals: [] };
const voice = targets.describeExpandedCgTarget(heart, { kind: 'heart-voice', containerId: 'VOICE_POST' });
assert.equal(voice.kind, 'heart-voice');
assert.ok(voice.sourceHash);
assert.equal(targets.cgTargetDescriptorFromItemId(targets.cgTargetItemId(voice)).containerId, 'VOICE_POST');
heart = write(heart, constants.MODE.HEART, voice, '/user/images/voice-a.png');
assert.equal(heart.voiceDramas[0].visual.cgImage.url, '/user/images/voice-a.png');
const reopenedVoice = targets.expandedCgItem(heart, voice);
assert.equal(reopenedVoice.item.cgImage.url, '/user/images/voice-a.png');
heart = write(heart, constants.MODE.HEART, reopenedVoice.descriptor, '/user/images/voice-b.png');
assert.equal(heart.voiceDramas[0].visual.cgImageHistory[0].url, '/user/images/voice-a.png');
const voiceForRestore = targets.expandedCgItem(heart, reopenedVoice.descriptor).item;
assert.ok(patch.swapCgImageToVersion(voiceForRestore, '/user/images/voice-a.png'));
assert.equal(heart.voiceDramas[0].visual.cgImage.url, '/user/images/voice-a.png');
assert.equal(heart.voiceDramas[0].visual.cgImageHistory[0].url, '/user/images/voice-b.png');
const scenario = targets.describeExpandedCgTarget(heart, { kind: 'heart-scenario', containerId: 'SCENE_SPRING' });
heart = write(heart, constants.MODE.HEART, scenario, '/user/images/scenario.png');
assert.equal(heart.scenarioDramas[0].visual.cgImage.url, '/user/images/scenario.png');
const beforeVoiceTail = targets.expandedCgItem(heart, voice).item;
heart.voiceDramas[0].script.push(...Array.from({ length: 17 }, (_, index) => ({ speaker: 'char', text: `补充台词 ${index}` })));
assert.equal(patch.applyCgImagePatch(heart, { version: 1, mode: constants.MODE.HEART, itemId: beforeVoiceTail.id, expectedSignature: patch.cgItemSignature(beforeVoiceTail), image: image('/user/images/voice-stale.png') }).status, 'conflict');

const line = heart.greetings.morning[0];
const lineHash = targets.heartLanguageLineHash('morning', line);
heart.languageVisuals.push({ category: 'morning', lineHash, scenePrompt: '清晨窗边递来热茶。', title: '早安' });
const language = targets.describeExpandedCgTarget(heart, { kind: 'heart-language', category: 'morning', line });
assert.ok(language && language.sourceHash);
heart = write(heart, constants.MODE.HEART, language, '/user/images/language.png');
assert.equal(heart.languageVisuals[0].visual.cgImage.url, '/user/images/language.png');
const beforeLanguage = targets.expandedCgItem(heart, language).item;
heart.greetings.morning[0] = '早安，今天也要慢慢来。';
assert.equal(patch.applyCgImagePatch(heart, { version: 1, mode: constants.MODE.HEART, itemId: beforeLanguage.id, expectedSignature: patch.cgItemSignature(beforeLanguage), image: image('/user/images/stale.png') }).status, 'conflict');

let ending = { kind: constants.MODE.ENDING, endings: [{ id: 'END_1', type: 'soft', title: '归处', subtitle: '终章', endingScene: '他们在傍晚回到熟悉的房间。', creditsLine: '未完待续。', epilogue: { title: '后日谈', timeSkip: '一年后', scenes: [{ title: '春天', text: '花开在窗边。' }], finalLine: '仍旧如此。' } }] };
const endingSlot = targets.describeExpandedCgTarget(ending, { kind: 'ending-ending', containerId: 'END_1' });
const epilogueSlot = targets.describeExpandedCgTarget(ending, { kind: 'ending-epilogue', containerId: 'END_1' });
assert.notEqual(targets.cgTargetItemId(endingSlot), targets.cgTargetItemId(epilogueSlot));
ending = write(ending, constants.MODE.ENDING, endingSlot, '/user/images/ending.png');
ending = write(ending, constants.MODE.ENDING, epilogueSlot, '/user/images/epilogue.png');
assert.equal(ending.endings[0].visuals.ending.cgImage.url, '/user/images/ending.png');
assert.equal(ending.endings[0].visuals.epilogue.cgImage.url, '/user/images/epilogue.png');
const beforeEpilogueTail = targets.expandedCgItem(ending, epilogueSlot).item;
ending.endings[0].epilogue.scenes.push(...Array.from({ length: 13 }, (_, index) => ({ title: `续章 ${index}`, text: `这是第 ${index} 段。` })));
assert.equal(patch.applyCgImagePatch(ending, { version: 1, mode: constants.MODE.ENDING, itemId: beforeEpilogueTail.id, expectedSignature: patch.cgItemSignature(beforeEpilogueTail), image: image('/user/images/epilogue-stale.png') }).status, 'conflict');

const legacy = { kind: constants.MODE.HEART, dailyStrips: [{ id: 'STRIP_1', title: '旧一格', subtitle: '午后', panels: [] }] };
const legacyItem = patch.cgItemInSession(constants.MODE.HEART, legacy, 'STRIP_1');
const legacyResult = patch.applyCgImagePatch(legacy, { version: 1, mode: constants.MODE.HEART, itemId: 'STRIP_1', expectedSignature: patch.cgItemSignature(legacyItem), image: image('/user/images/legacy.png') });
assert.equal(legacyResult.status, 'applied');
assert.equal(legacyResult.session.dailyStrips[0].cgImage.url, '/user/images/legacy.png');

const local = targets.normalizeLocalCgSlots({
    visual: { sourceHash: 'cgsrc-v1-live', cgImage: { ...image('/user/images/live.png'), promptMetadata: { promptFormat: 'nai5-natural' } }, cgImageHistory: [image('/user/images/live-old.png')] },
    previousCgVisuals: [{ sourceHash: 'cgsrc-v1-previous', cgImage: image('/user/images/previous.png') }],
    visuals: { ending: { sourceHash: 'cgsrc-v1-ending', cgImage: image('/user/images/ending-local.png') } },
});
assert.equal(local.visual.cgImage.promptMetadata.promptFormat, 'nai5-natural');
assert.equal(local.visual.cgImageHistory[0].url, '/user/images/live-old.png');
assert.equal(local.previousCgVisuals[0].cgImage.url, '/user/images/previous.png');
assert.equal(local.visuals.ending.cgImage.url, '/user/images/ending-local.png');
const languageLocal = targets.normalizeLanguageCgVisuals([{ category: 'morning', lineHash, scenePrompt: '清晨窗边递来热茶。',
    visual: { sourceHash: 'cgsrc-v1-now', cgImage: image('/user/images/language-live.png') },
    previousSceneVisuals: [{ scenePrompt: '旧场景', visual: { sourceHash: 'cgsrc-v1-old', cgImage: image('/user/images/language-old.png'), cgImageHistory: [image('/user/images/language-older.png')] } }] }]);
assert.equal(languageLocal[0].visual.cgImage.url, '/user/images/language-live.png');
assert.equal(languageLocal[0].previousSceneVisuals[0].visual.cgImageHistory[0].url, '/user/images/language-older.png');
assert.equal(targets.normalizeLanguageCgVisuals(languageLocal, { morning: ['换了一句台词。'] }).length, 0);
const oldRoute = { id: 'END_KEEP', title: '归处', endingScene: '相同终章', creditsLine: '结束', epilogue: { title: '后日谈', scenes: [] }, visuals: { ending: { sourceHash: '', cgImage: image('/user/images/keep.png') }, epilogue: { sourceHash: 'cgsrc-v1-stale', cgImage: image('/user/images/stale-keep.png') } } };
const newRoute = { id: 'END_KEEP', title: '归处', endingScene: '相同终章', creditsLine: '结束', epilogue: { title: '后日谈', scenes: [] } };
// Fill the exact current hash through an ordinary descriptor result, then verify
// a normalizer that omitted `visuals` still receives the matching ending slot.
const routeDescriptor = targets.describeExpandedCgTarget({ kind: constants.MODE.ENDING, endings: [oldRoute] }, { kind: 'ending-ending', containerId: 'END_KEEP' });
oldRoute.visuals.ending.sourceHash = routeDescriptor.sourceHash;
targets.preserveCgSlots(oldRoute, newRoute, { kind: 'ending-ending' });
assert.equal(newRoute.visuals.ending.cgImage.url, '/user/images/keep.png');
assert.equal(newRoute.previousCgVisuals[0].cgImage.url, '/user/images/stale-keep.png');

let photoHeart = { kind: constants.MODE.HEART, photoshoots: [photoshoots.createPhotoshootPlan({ id: 'PHOTO_GRID_1', route: 'failed-photoshoot', capture: 'together', title: '失败写真', scenePrompt: '雨天的站台，雨伞总是歪一点。', moments: Array.from({ length: 9 }, (_, index) => `意外瞬间 ${index + 1}`) }, { createdAt: 1, promptMetadata: { castSnapshot: { version: 1, people: [] }, characters: [] } })] };
const photoTarget = targets.describeExpandedCgTarget(photoHeart, { kind: 'heart-photoshoot', containerId: 'PHOTO_GRID_1' });
assert.equal(photoTarget.kind, 'heart-photoshoot');
const photoItem = targets.expandedCgItem(photoHeart, photoTarget).item;
assert.equal(photoItem.cgOrientation, 'portrait');
assert.equal(photoItem.cgLayout, 'photoshoot-9-grid');
assert.match(photoItem.cgDesc, /格 9/);
assert.match(generation.prepareCgSendParts(constants.MODE.HEART, photoItem, '用户编辑的场景', null).prompt, /3 by 3 nine-cell/);
photoHeart = write(photoHeart, constants.MODE.HEART, photoTarget, '/user/images/photoshoot-grid.png');
assert.equal(photoHeart.photoshoots[0].visual.cgImage.url, '/user/images/photoshoot-grid.png');
const stalePhoto = targets.expandedCgItem(photoHeart, photoTarget).item;
photoHeart.photoshoots[0].moments[8] = '最后一格换成了新的意外。';
assert.equal(patch.applyCgImagePatch(photoHeart, { version: 1, mode: constants.MODE.HEART, itemId: stalePhoto.id, expectedSignature: patch.cgItemSignature(stalePhoto), image: image('/user/images/photoshoot-stale.png') }).status, 'conflict');
console.log('cg expanded targets: ok');
