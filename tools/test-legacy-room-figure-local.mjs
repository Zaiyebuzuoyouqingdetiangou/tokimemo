import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// r84.75 房间 Q 版小人按人设显示（dev/active/room-figure）。直接运行真实源码模块。
const local = await import('../src/modes/roomFigureLocal.js');
const pixel = await import('../src/ui/roomPixelFigure.js');
const blank = { hairTone: 'unspecified', hairShape: 'unspecified', outfit: 'unspecified', build: 'unspecified', detail: 'none' };

test('card appearance becomes figure fields (hair, outfit colour, eyes, accessories)', () => {
    assert.deepEqual(local.localRoomFigure(blank, { cardTexts: ['方祁洛，剑修，一袭玄衣，墨发以玉冠高束，身形修长，眸色漆黑。'] }),
        { hairTone: 'black', hairShape: 'tied', outfit: 'historical', build: 'slender', detail: 'headwear', outfitTone: 'black', eyeTone: 'black' });
    const dragon = local.localRoomFigure(blank, { cardTexts: ['她有一头银白色的长发，金瞳，穿着白色法袍，头上有一对龙角。'] });
    assert.equal(dragon.hairTone, 'silver'); assert.equal(dragon.eyeTone, 'gold'); assert.equal(dragon.detail, 'horns'); assert.equal(dragon.outfitTone, 'white');
    const ceo = local.localRoomFigure(blank, { cardTexts: ['{{char}}：黑色短发，戴着金丝眼镜，常穿深蓝西装。', '{{user}}穿着红裙，粉色长发。'] });
    assert.equal(ceo.outfit, 'formal'); assert.equal(ceo.outfitTone, 'blue'); assert.equal(ceo.detail, 'glasses'); assert.equal(ceo.hairShape, 'short');
});

test('negations, user lines and other people are not read as the character', () => {
    assert.equal(local.localRoomFigure(blank, { cardTexts: ['他不戴眼镜，棕色卷发。'] }).detail, 'none');
    assert.equal(local.localRoomFigure(blank, { cardTexts: ['{{user}}戴眼镜，穿白衣。'] }).outfitTone, undefined);
    const sources = local.roomFigureSources({ characterId: 0, name2: '方祁洛', characters: [{ name: '方祁洛', data: { name: '方祁洛', description: '性格冷淡。',
        character_book: { entries: [{ keys: ['方祁洛'], content: '方祁洛常穿青衫，束发。' }, { keys: ['师妹'], content: '师妹一身红衣。方祁洛腰悬长剑。' }, { keys: ['方祁洛'], content: '白衣。', enabled: false }] } } }] }, '方祁洛');
    assert.deepEqual(sources.worldTexts, ['方祁洛常穿青衫，束发。', '方祁洛腰悬长剑']);
    const fig = local.localRoomFigure(blank, sources);
    assert.equal(fig.outfitTone, 'cyan'); assert.equal(fig.hairShape, 'tied');
    const ambiguous = local.roomFigureSources({ characters: [{ name: '甲' }, { name: '甲' }] }, '甲');
    assert.deepEqual([ambiguous.cardTexts, ambiguous.worldTexts], [[], []], 'ambiguous card name reads nothing');
});

test('order: verified room fields > card > world book > identity guess', () => {
    assert.equal(local.localRoomFigure({ hairTone: 'red' }, { explicitFields: ['figure.hairTone'], cardTexts: ['墨发'] }).hairTone, 'red');
    assert.equal(local.localRoomFigure(blank, { cardTexts: ['墨发'], worldTexts: ['银发'] }).hairTone, 'black');
    assert.equal(local.localRoomFigure(blank, { worldTexts: ['银发'] }).hairTone, 'silver');
    const guessed = local.localRoomFigure(blank, { cardTexts: ['他是宗门掌门，性格冷淡。'] });
    assert.equal(guessed.outfit, 'historical'); assert.equal(guessed.hairShape, 'long'); assert.equal(guessed.hairTone, 'unspecified', 'hair colour is never guessed');
    assert.equal(local.localRoomFigure(blank, { worldStyle: 'scifi' }).outfit, 'technical');
    assert.equal(local.localRoomFigure({ ...blank, outfit: 'formal' }, { cardTexts: ['宗门掌门'] }).outfit, 'formal', 'a guess never replaces an existing value');
});

test('pixel figure draws the new fields from code-owned colours only', () => {
    const base = pixel.pixelFigureSvg({});
    const fang = pixel.pixelFigureSvg({ hairTone: 'black', outfit: 'historical', outfitTone: 'black', hairShape: 'tied', detail: 'headwear', eyeTone: 'gold' });
    assert.notEqual(base, fang);
    assert.equal(pixel.pixelFigureSvg({ outfitTone: '"/><script>', eyeTone: 'url(x)', detail: '<g>' }), base);
    for (const detail of ['glasses', 'animal_ears', 'pointed_ears', 'horns', 'headwear', 'visor', 'headphones', 'scarf']) assert.notEqual(pixel.pixelFigureSvg({ detail }), base, detail);
    assert.ok([...fang.matchAll(/fill="([^"]+)"/g)].every(match => /^#[0-9a-f]{6,8}$/i.test(match[1])));
});

test('local figure never asks the model', () => {
    const source = fs.readFileSync(new URL('../src/modes/roomFigureLocal.js', import.meta.url), 'utf8');
    assert.ok(!/generation\/|requestValidatedSegment|generateConfiguredJson/.test(source));
});

// r84.79 复核修复
const pick = figure => Object.fromEntries(Object.entries(figure).filter(([, v]) => !['unspecified', 'none'].includes(v)));
test('English words match whole words only (that/childhood/himself/image/pursuit/abroad/wardrobe)', () => {
    for (const text of ['She has a smile that lights the room.', 'In his childhood he used to wear simple clothes.', 'He is a quiet man who keeps to himself.',
        'He cares about his public image.', 'His pursuit of power never ends, he wears it well.', 'He studied abroad and wears what he likes.', 'Her wardrobe is full of dresses.',
        'She dresses like a bunny in a bundle of cloth.']) assert.deepEqual(pick(local.localRoomFigure(blank, { cardTexts: [text] })), {}, text);
    const knight = local.localRoomFigure(blank, { cardTexts: ['He is a knight with long black hair and bright blue eyes. He does not wear glasses.'] });
    assert.deepEqual(pick(knight), { hairTone: 'black', hairShape: 'long', outfit: 'combat', eyeTone: 'blue' });
});

test('clauses about the user or other people are not the character', () => {
    assert.deepEqual(pick(local.localRoomFigure(blank, { cardTexts: ['他沉默寡言。你穿着一条红裙，黑色长发。'] })), {});
    assert.deepEqual(pick(local.localRoomFigure(blank, { cardTexts: ['他一头墨发，你穿着红裙。'] })), { hairTone: 'black' });
    assert.deepEqual(pick(local.localRoomFigure(blank, { cardTexts: ['小雨穿着白裙。方祁洛一袭玄衣。'], charName: '方祁洛', userName: '小雨' })), { outfit: 'historical', outfitTone: 'black' });
    assert.deepEqual(pick(local.localRoomFigure(blank, { cardTexts: ['{{char}}的妹妹总穿粉色的裙子。他的师父一身白衣。'] })), {});
    assert.deepEqual(pick(local.localRoomFigure(blank, { cardTexts: ['{{char}} has short brown hair. You wear a red dress and a hat. His sister wears glasses.'] })), { hairTone: 'brown', hairShape: 'short' });
});

test('identity guess needs an identity statement about the character', () => {
    assert.equal(local.localRoomFigure(blank, { cardTexts: ['他是一名教授，带过很多学生。'] }).outfit, 'unspecified');
    assert.equal(local.localRoomFigure(blank, { cardTexts: ['方祁洛，剑修，性格冷淡。'], charName: '方祁洛' }).outfit, 'historical');
    assert.equal(local.localRoomFigure(blank, { cardTexts: ['他是一名高中生。'] }).outfit, 'academic');
    assert.equal(local.localRoomFigure(blank, { cardTexts: ['你是一名学生，他是你的邻居。'] }).outfit, 'unspecified');
    assert.equal(local.localRoomFigure(blank, { cardTexts: ['He works as a doctor.'] }).outfit, 'technical');
});
