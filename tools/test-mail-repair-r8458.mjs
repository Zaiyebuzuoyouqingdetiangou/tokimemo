import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyInbox, inboxPlan, normalizeInboxLetters, normalizeInboxSession, mergeInboxLatest, projectInboxProgress } from '../src/modes/inbox.js';
import { normalizeGeneratedLetterIllustration, renderLetterIllustration } from '../src/core/letterIllustration.js';
import { savedMailDrawings } from '../src/core/mailGallery.js';
import { inboxGalleryHtml, inboxPaperTone } from '../src/ui/inboxView.js';
import { parsePartialJsonObject } from '../src/generation/jsonParser.js';

const bank = { chatId: 'mail-test', archiveRevision: 'r1', characterName: '林深', userName: '阿宁', memories: [] };
const date = new Date('2026-09-23T14:00:00+09:00');
const evidence = '林深留着黑色长发，扎着马尾，有琥珀色眼睛，穿蓝色长袍，戴着眼镜，手上拿着一本书。';
const art = { version: 2, characterName: '林深', focus: 'person', visualFacts: [
    { kind: 'hairLength', value: 'long', evidence: '林深留着黑色长发' },
    { kind: 'hairColor', value: 'black', evidence: '林深留着黑色长发' },
    { kind: 'hairStyle', value: 'ponytail', evidence: '扎着马尾' },
    { kind: 'eyeColor', value: 'amber', evidence: '有琥珀色眼睛' },
    { kind: 'outfitKind', value: 'robe', evidence: '穿蓝色长袍' },
    { kind: 'outfitColor', value: 'blue', evidence: '穿蓝色长袍' },
    { kind: 'marker', value: 'glasses', evidence: '戴着眼镜' },
    { kind: 'signatureObject', value: 'book', evidence: '手上拿着一本书' },
], scene: { kind: 'read', evidence: '正读着一本书' } };
const rawLetter = (title = '窗边的信') => ({ slot: 'daily', title, greeting: '阿宁', body: '风还没停，我正读着一本书，想等你回来时把结尾念给你听。', closing: '林深', letterIllustration: art });
const normalize = (previous, raw = rawLetter()) => normalizeInboxLetters({ letters: [raw] }, bank, inboxPlan(bank, previous, date), date, { characterEvidence: evidence });

test('each explicit receive appends another same-day letter; retrying one result is idempotent', () => {
    const initial = emptyInbox(bank);
    const fresh = normalize(initial);
    const first = mergeInboxLatest(initial, fresh);
    const firstSaved = structuredClone(first.letters[0]);
    const next = normalize(first, rawLetter('再写一封'));
    assert.notEqual(next.letters[0].eventKey, first.letters[0].eventKey);
    assert.notEqual(next.letters[0].id, first.letters[0].id);
    const second = mergeInboxLatest(first, next);
    assert.equal(second.letters.length, 2);
    assert.deepEqual(second.letters[0], firstSaved);
    assert.notEqual(inboxPaperTone(second.letters[0]), inboxPaperTone(second.letters[1]));
    assert.deepEqual(mergeInboxLatest(second, next), second);
    assert.deepEqual(mergeInboxLatest(second, fresh), second);
    assert.equal(initial.letters.length, 0, 'merging does not alter a captured request base');
});

test('same-day recovery reconstructs the same letter identity from the frozen previous inbox', () => {
    const first = mergeInboxLatest(emptyInbox(bank), normalize(null));
    const raw = rawLetter('途中未完成的信');
    const expected = normalize(first, raw);
    const partial = parsePartialJsonObject(JSON.stringify({ letters: [raw] }));
    const context = { characterId: 0, name2: '林深', characters: [{ name: '林深', avatar: 'lin.png' }] };
    const projected = projectInboxProgress({ segments: [partial], memoryBank: bank, previousSession: first, context,
        operation: { inboxDate: date.getTime() }, createdAt: date.getTime(),
        frozenInputs: { 'presentation:inbox': JSON.stringify({ characterEvidence: evidence }) } });
    assert.equal(projected.letters.length, 2);
    assert.equal(projected.letters[1].id, expected.letters[0].id);
    assert.deepEqual(mergeInboxLatest(projected, expected).letters, projected.letters);
});

test('mail body length and total mailbox size are not artificial receive quotas', () => {
    const body = '  我正读着一本书。\n\n' + '字'.repeat(2600) + '  ';
    assert.equal(normalize(null, { ...rawLetter(), body, letterIllustration: null }).letters[0].body, body);
    assert.equal(normalize(null, { ...rawLetter(), body: '等你。', letterIllustration: null }).letters[0].body, '等你。');
    const base = emptyInbox(bank);
    base.letters = Array.from({ length: 1000 }, (_, n) => ({ id: 'old-' + n, eventKey: 'old-' + n }));
    const merged = mergeInboxLatest(base, normalize(base));
    assert.equal(merged.letters.length, 1001);
    assert.equal(base.letters.length, 1000);
});

test('captured character relationship evidence reaches mailbox address validation', () => {
    const result = normalizeInboxLetters({ letters: [{ ...rawLetter(), greeting: '给我的妻子', letterIllustration: null }] },
        bank, inboxPlan(bank, null, date), date, { characterEvidence: '林深和阿宁是夫妻。' });
    assert.equal(result.letters[0].greeting, '给我的妻子');
    assert.throws(() => normalizeInboxLetters({ letters: [{ ...rawLetter(), greeting: '给我的妻子' }] }, bank, inboxPlan(bank, null, date), date), /关系/);
});

test('all eight supported appearance facts survive, but invented facts and executable markup do not', () => {
    const options = { characterEvidence: evidence, characterNames: ['林深'], letterText: rawLetter().body };
    const checked = normalizeGeneratedLetterIllustration(art, options);
    assert.equal(checked.visualFacts.length, 8);
    assert.equal(normalizeGeneratedLetterIllustration({ ...art, visualFacts: [...art.visualFacts, { kind: 'marker', value: 'scar', evidence: '有伤疤' }] }, options), null);
    assert.equal(normalizeGeneratedLetterIllustration({ ...art, svg: '<svg onload="alert(1)">' }, options), null);
    const unspecifiedEyes = { ...art, visualFacts: art.visualFacts.filter(fact => fact.kind !== 'eyeColor') };
    assert.match(renderLetterIllustration(unspecifiedEyes), /data-rmt-letter-eyes="unspecified"/);
    assert.match(renderLetterIllustration(checked), /data-rmt-letter-expression="attentive"/);
});

test('the growing gallery reads stored v1/v2 drawings without mutating or duplicating them', () => {
    const first = mergeInboxLatest(emptyInbox(bank), normalize(null));
    const legacy = { ...first.letters[0], id: 'legacy', eventKey: 'legacy', title: '旧画', illustration: { version: 1, subject: 'cat', action: 'rest', palette: 'sage', accessories: [] } };
    const second = mergeInboxLatest(first, normalize(first, rawLetter('第二页')));
    second.letters.push(legacy, { ...legacy, id: 'no-art', eventKey: 'no-art', illustration: null });
    const before = JSON.stringify(second);
    const reopened = normalizeInboxSession(JSON.parse(before));
    assert.equal(savedMailDrawings(reopened).length, 3);
    const html = inboxGalleryHtml(reopened);
    assert.equal((html.match(/data-rmt-inbox="read"/g) || []).length, 3);
    assert.match(html, /旧画/);
    assert.match(html, /第二页/);
    assert.match(html, /data-rmt-letter-illustration-version="1"/);
    assert.match(html, /data-rmt-letter-illustration-version="2"/);
    assert.equal(inboxGalleryHtml(reopened), html);
    assert.equal(JSON.stringify(second), before);
    assert.equal(savedMailDrawings({ letters: [...reopened.letters, reopened.letters[0]] }).length, 3);
});
