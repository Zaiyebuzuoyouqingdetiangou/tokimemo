import assert from 'node:assert/strict';
import {
    LETTER_ILLUSTRATION_CONTRACT,
    LETTER_ILLUSTRATION_ACTIONS,
    LETTER_ILLUSTRATION_SUBJECTS,
    LETTER_ILLUSTRATION_VERSION,
    LETTER_ILLUSTRATION_GENERATION_VERSION,
    MAX_LETTER_ILLUSTRATION_ACCESSORIES,
    normalizeLetterIllustration,
    normalizeGeneratedLetterIllustration,
    renderLetterIllustration,
} from '../src/core/letterIllustration.js';

// Stored v1 art keeps the old renderer and normalization contract.
const legacy = {
    version: LETTER_ILLUSTRATION_VERSION,
    subject: 'person', companion: 'pony', action: 'pet', palette: 'cream',
    accessories: ['heart', 'letter'],
};
assert.deepEqual(normalizeLetterIllustration(legacy), legacy);
assert.equal(normalizeLetterIllustration(null), null);
assert.equal(normalizeLetterIllustration({ ...legacy, version: 3 }), null);
assert.equal(normalizeLetterIllustration({ ...legacy, subject: 'unicorn' }), null);
assert.equal(normalizeLetterIllustration({ ...legacy, accessories: Array(MAX_LETTER_ILLUSTRATION_ACCESSORIES + 1).fill('heart') }), null);
assert.deepEqual(normalizeLetterIllustration({ ...legacy, companion: 'dragon', action: 'dance', palette: 'neon', accessories: ['heart', 'script'] }), {
    ...legacy, companion: null, action: 'rest', palette: 'cream', accessories: ['heart'],
});
assert.equal(normalizeLetterIllustration({ ...legacy, html: '<svg onload=alert(1)>' }), null);

const first = renderLetterIllustration(legacy, { idPrefix: 'letter 01', label: '<warm & safe>' });
assert.equal(first, renderLetterIllustration(legacy, { idPrefix: 'letter 01', label: '<warm & safe>' }));
assert.match(first, /data-rmt-letter-illustration-version="1"/);
assert.match(first, /width="220" height="160"/);
assert.match(first, /aria-labelledby="letter01-illustration-title"/);
assert.match(first, /&lt;warm &amp; safe&gt;/);
assert.doesNotMatch(first, /onload=|javascript:|<script/i);
assert.match(renderLetterIllustration({ ...legacy, subject: 'pony', companion: null, accessories: [] }), /data-rmt-pony-pet-hand="true"/);
for (const subject of LETTER_ILLUSTRATION_SUBJECTS) {
    for (const action of LETTER_ILLUSTRATION_ACTIONS) {
        assert.match(renderLetterIllustration({ ...legacy, subject, companion: null, action, accessories: [] }), /data-rmt-letter-illustration-version="1"/);
    }
}

const lin = {
    version: LETTER_ILLUSTRATION_GENERATION_VERSION,
    characterName: '林深', focus: 'person',
    visualFacts: [
        { kind: 'hairLength', value: 'long', evidence: '林深留着黑色长发' },
        { kind: 'hairColor', value: 'black', evidence: '林深留着黑色长发' },
        { kind: 'outfitKind', value: 'coat', evidence: '常穿红色大衣' },
        { kind: 'outfitColor', value: 'red', evidence: '常穿红色大衣' },
        { kind: 'marker', value: 'glasses', evidence: '戴一副细框眼镜' },
    ],
    scene: { kind: 'lamp', evidence: '今晚先把灯留着' },
};
const linEvidence = '姓名：林深。林深留着黑色长发，常穿红色大衣，戴一副细框眼镜。';
const linLetter = '窗开了一条缝。今晚先把灯留着，等你回来。';
assert.deepEqual(normalizeGeneratedLetterIllustration(lin, {
    characterEvidence: linEvidence, letterText: linLetter, characterNames: ['林深'],
}), lin);

const qiao = {
    version: 2, characterName: '乔岚', focus: 'person',
    visualFacts: [
        { kind: 'hairLength', value: 'short', evidence: '乔岚是金色短发' },
        { kind: 'hairColor', value: 'blonde', evidence: '乔岚是金色短发' },
        { kind: 'outfitKind', value: 'suit', evidence: '穿蓝色西装' },
        { kind: 'outfitColor', value: 'blue', evidence: '穿蓝色西装' },
        { kind: 'marker', value: 'scar', evidence: '右眼旁有一道伤疤' },
    ],
    scene: { kind: 'photo', evidence: '把照片放进信封' },
};
const qiaoChecked = normalizeGeneratedLetterIllustration(qiao, {
    characterEvidence: '乔岚是金色短发，穿蓝色西装，右眼旁有一道伤疤。',
    letterText: '我把照片放进信封。', characterNames: ['乔岚'],
});
assert.deepEqual(qiaoChecked, qiao);

const linSvg = renderLetterIllustration(lin, { idPrefix: 'lin', label: '随信小画' });
const qiaoSvg = renderLetterIllustration(qiaoChecked, { idPrefix: 'qiao', label: '随信小画' });
assert.notEqual(linSvg, qiaoSvg, 'different evidenced people must produce different local drawings');
assert.match(linSvg, /data-rmt-letter-hair="long:unspecified:black"/);
assert.match(linSvg, /data-rmt-letter-outfit="coat:red"/);
assert.match(linSvg, /data-rmt-letter-marker="glasses"/);
assert.match(linSvg, /data-rmt-letter-scene-motif="lamp"/);
assert.ok(linSvg.indexOf('data-rmt-letter-hair="') < linSvg.indexOf('data-rmt-letter-face-opening="true"'));
assert.ok(linSvg.indexOf('data-rmt-letter-face-opening="true"') < linSvg.indexOf('data-rmt-letter-hair-fringe="true"'));
assert.match(qiaoSvg, /data-rmt-letter-hair="short:unspecified:blonde"/);
assert.match(qiaoSvg, /data-rmt-letter-marker="scar"/);
assert.match(qiaoSvg, /data-rmt-letter-scene-motif="photo"/);
assert.doesNotMatch(`${linSvg}${qiaoSvg}`, /pony|cat|rabbit|unicorn/i);

const camera = {
    version: 2, characterName: '林深', focus: 'object',
    visualFacts: [{ kind: 'signatureObject', value: 'camera', evidence: '林深随身带着一台旧相机' }],
    scene: { kind: 'photo', evidence: '把今天的照片寄给你' },
};
assert.deepEqual(normalizeGeneratedLetterIllustration(camera, {
    characterEvidence: '林深随身带着一台旧相机。', letterText: '把今天的照片寄给你。', characterNames: ['林深'],
}), camera);
assert.match(renderLetterIllustration(camera), /data-rmt-letter-signature-object="camera"/);

// Missing, mismatched, cross-person, legacy, and executable-looking input all become blank.
assert.equal(normalizeGeneratedLetterIllustration(lin, { characterEvidence: '', letterText: linLetter, characterNames: ['林深'] }), null);
assert.equal(normalizeGeneratedLetterIllustration(lin, { characterEvidence: linEvidence, letterText: '今天没有开灯。', characterNames: ['林深'] }), null);
assert.equal(normalizeGeneratedLetterIllustration({ ...lin, characterName: '别人' }, { characterEvidence: linEvidence, letterText: linLetter, characterNames: ['林深'] }), null);
assert.equal(normalizeGeneratedLetterIllustration({ ...lin, svg: '<svg onload=alert(1)>' }, { characterEvidence: linEvidence, letterText: linLetter, characterNames: ['林深'] }), null);
assert.equal(normalizeGeneratedLetterIllustration(legacy, { characterEvidence: linEvidence, letterText: linLetter, characterNames: ['林深'] }), null);
assert.equal(normalizeLetterIllustration({ ...lin, visualFacts: [{ kind: 'hairColor', value: 'black', evidence: '<script>bad</script>' }] }), null);

assert.match(LETTER_ILLUSTRATION_CONTRACT, /"version":2/);
assert.match(LETTER_ILLUSTRATION_CONTRACT, /不得默认动物/);
assert.match(LETTER_ILLUSTRATION_CONTRACT, /不得输出 version 1、HTML、SVG、CSS、URL、颜色、坐标或任何代码/);
assert.doesNotMatch(LETTER_ILLUSTRATION_CONTRACT, /\b(?:pony|cat|rabbit|unicorn)\b/i);

console.log('letter-illustration-ok');
