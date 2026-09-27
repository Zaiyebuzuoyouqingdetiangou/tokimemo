import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as art from '../src/core/letterIllustrationV2.js';

const envelope = card => `CHARACTER_CARD_JSON:\n${JSON.stringify(card)}\nUSER_PERSONA_JSON:\n{}\nWORLD_INFO_TEXT:\n\n【上下文结束】`;
const local = (description, letterText) => art.normalizeGenerated(null, {
    characterEvidence: art.captureEvidence(envelope({ name: '黎栖庭', description })), characterNames: ['黎栖庭'], letterText });

const letter = [
    '幼宁：', '肩上的齿痕还在发疼，但我没让医生处理，留着反倒能让我清醒。',
    '在更衣室里单膝跪地握住你的手时，我脑子里没有任何算计，只有慌乱。',
    '给我一点时间，也教教我。关于怎么去爱一个人，我确实是个新手，但我会学。',
    '今晚若是心里还觉得憋闷，随时过来咬我，别再一个人咬着被角掉眼泪。',
].join('\n');

test('an evening letter without the old scene words now gets a drawing from its own text', () => {
    const design = local('黑色短发，身形修长。', letter);
    assert.ok(design);
    assert.equal(design.scene.kind, 'lamp');
    assert.match(design.scene.evidence, /^今晚若是心里还觉得憋闷/);
    assert.ok(letter.includes(design.scene.evidence));
    assert.equal(design.visualFacts.find(fact => fact.kind === 'hairColor').value, 'black');
    assert.match(art.render(design, { idPrefix: 'r84123', label: '随信小画' }), /data-rmt-letter-scene="lamp"/);
});

test('common letter phrasings map to the existing scene kinds', () => {
    for (const [text, kind] of [['周末我们去公园走了一圈。', 'walk'], ['给你做了一桌菜，厨房还乱着。', 'cook'], ['今天翻到那张合影。', 'photo'], ['给你热了一杯牛奶。', 'tea']]) {
        assert.equal(local('黑色短发', text)?.scene.kind, kind, text);
    }
});

test('letters without a drawable scene still get no drawing', () => {
    for (const text of ['一切安好。', '明天送你回家。', '我住在酒店。']) assert.equal(local('黑色短发', text), null, text);
    assert.equal(local('性格冷淡', letter), null);
});

test('the letter page no longer prints a reason when there is no drawing', async () => {
    const source = await readFile(new URL('../src/ui/inboxView.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /这封没有小画|illustrationMissing/);
});
