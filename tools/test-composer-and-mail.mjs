import test from 'node:test';
import assert from 'node:assert/strict';
import { readSongOptions, writeSongOptions } from '../src/core/generationOptions.js';
import * as coreCache from '../src/core/cache.js';
import { buildMergeTask, assembleMergedPrompt } from '../src/generation/mergedGeneration.js';
import { emptyInbox, inboxPlan, inboxPrompt, normalizeInboxLetters, normalizeInboxSession, mergeInboxLatest } from '../src/modes/inbox.js';
import { inboxSenderLabel } from '../src/ui/inboxView.js';
import { renderLetterIllustration } from '../src/core/letterIllustration.js';
const bank = { chatId: 'fixture', archiveRevision: 'v1', characterName: '林深', userName: '阿宁', memories: [{ id: 'M001', title: '雨天的票根', summary: '两人在窗边说起票根。', anchors: ['票根'] }] };
const context = { characterId: 0, name2: '林深', characters: [{ name: '林深', avatar: 'one.png' }] };
const when = new Date('2026-09-23T12:00:00+09:00');

test('merged pages retain different saved participants and freeze them into recovery recipes', () => {
    const roster = name => ({version:1,cardType:'multi',revision:'r1',selectedIds:[name],people:[{id:name,name,sourceRefs:[]}]});
    const multi = {...bank, characterName:'群像卡', participantsV1:roster('当前全局人物')};
    const a = buildMergeTask('cabinet',context,multi,{generationSources:{cabinet:{sourceMemory:{...multi,participantsV1:roster('陈列柜人物')}}}},when);
    const b = buildMergeTask('themeSong',context,multi,{songs:[],generationSources:{themeSong:{sourceMemory:{...multi,participantsV1:roster('印象曲人物')}}}},when);
    assert.deepEqual(a.snapshot.participantSnapshot.people.map(p=>p.name),['陈列柜人物']);
    assert.deepEqual(b.snapshot.participantSnapshot.people.map(p=>p.name),['印象曲人物']);
    assert.ok(a.taskText.includes('陈列柜人物')); assert.ok(b.taskText.includes('印象曲人物'));
    const prompt=assembleMergedPrompt({sharedBackground:'共同背景',tasks:[a,b]});
    assert.ok(prompt.includes('陈列柜人物') && prompt.includes('印象曲人物'));
    const recovered=buildMergeTask('themeSong',context,{...multi,participantsV1:roster('后来换的人')},b.snapshot.previous,when,{frozenPlan:b.snapshot.plan,participantSnapshot:b.snapshot.participantSnapshot});
    assert.equal(recovered.singlePrompt,b.singlePrompt);
    assert.deepEqual(multi.participantsV1.selectedIds,['当前全局人物']);
});

test('bedtime merged recipe retains its story identity and complete chapter body',()=>{
    const task=buildMergeTask('bedtime',context,bank,null,when);
    const body='  窗外的星光慢慢落进水杯里，钟表匠带着朋友寻找丢失的午夜。'.repeat(12)+'\n\n尾声仍保留。  ';
    const result=task.accept({title:'失落的午夜',genre:'奇幻',premise:'找回午夜',chapter:{title:'星光',text:body}});
    assert.equal(result.stories[0].chapters[0].text,body);
    assert.equal(result.stories[0].id,task.plan.storyId);
    assert.equal(result.generationSources.bedtime.sourceMemory.chatId,bank.chatId);
});
test('composer selections survive reopening and remain isolated across archive revisions', () => {
    const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    const options = { subject: 'event', eventId: 'M001', language: 'custom', customLanguage: '西班牙语', voice: 'ensemble', direction: '轻快的钢琴' };
    writeSongOptions(options, context, bank, storage);
    assert.deepEqual(readSongOptions(context, bank, storage), options);
    assert.deepEqual(readSongOptions(context, { ...bank, archiveRevision: 'v2' }, storage), {});
    const task = buildMergeTask('themeSong', context, bank, null, when, { songOptions: readSongOptions(context, bank, storage) });
    assert.equal(task.snapshot.plan.eventId, 'M001'); assert.equal(task.snapshot.plan.language, 'custom');
    assert.ok(task.singlePrompt.includes('西班牙语'));
    const restored = buildMergeTask('themeSong', context, bank, null, when, { frozenPlan: JSON.parse(JSON.stringify(task.snapshot.plan)) });
    assert.equal(restored.plan.id, task.plan.id);
    assert.equal(restored.singlePrompt, task.singlePrompt);
});
test('an optional invalid illustration never loses a valid letter', () => {
    const plan = inboxPlan(bank, null, when);
    const letters = [{ slot: 'daily', title: '窗边', greeting: '阿宁', body: '窗开了一条缝，风是凉的，今晚先把灯留着。', closing: '林深', letterIllustration: { version: 2, characterName: '林深', focus: 'person', visualFacts: [], scene: { kind: 'lamp', evidence: '今晚先把灯留着' }, svg: '<script>bad</script>' } }];
    const fresh = normalizeInboxLetters({ letters }, bank, plan, when);
    assert.equal(fresh.letters[0].body, letters[0].body);
    assert.equal(fresh.letters[0].illustration, null);
});
test('new inbox art is v2-only and requires both current-char and current-letter evidence', () => {
    const plan = inboxPlan(bank, null, when);
    const letterIllustration = { version: 2, characterName: '林深', focus: 'person', visualFacts: [
        { kind: 'hairLength', value: 'long', evidence: '林深留着黑色长发' },
        { kind: 'hairColor', value: 'black', evidence: '林深留着黑色长发' },
        { kind: 'marker', value: 'glasses', evidence: '戴着细框眼镜' },
    ], scene: { kind: 'lamp', evidence: '今晚先把灯留着' } };
    const raw = { slot: 'daily', title: '窗边', greeting: '阿宁', body: '窗开了一条缝，风是凉的，今晚先把灯留着。', closing: '林深', letterIllustration };
    const fresh = normalizeInboxLetters({ letters: [raw] }, bank, plan, when, {
        characterEvidence: '林深留着黑色长发，戴着细框眼镜。',
    });
    assert.deepEqual(fresh.letters[0].illustration, letterIllustration);
    assert.match(renderLetterIllustration(fresh.letters[0].illustration), /data-rmt-letter-person="true"/);
    assert.equal(normalizeInboxLetters({ letters: [raw] }, bank, plan, when).letters[0].illustration, null);
    const legacyAttempt = { ...raw, letterIllustration: { version: 1, subject: 'pony', action: 'pet', palette: 'lilac', accessories: ['heart'] } };
    assert.equal(normalizeInboxLetters({ letters: [legacyAttempt] }, bank, plan, when, { characterEvidence: '林深留着黑色长发。' }).letters[0].illustration, null);
    assert.match(inboxPrompt(bank, plan), /"letterIllustration":"可选的受控小画结构"/);
    assert.match(inboxPrompt(bank, plan), /只能使用 v2/);
});
test('new multi-person inbox metadata keeps selected names without changing the card sender', () => {
    const participantsV1 = { version: 1, cardType: 'multi', revision: 'r1', selectedIds: ['a', 'b'], people: [
        { id: 'a', name: '甲', sourceRefs: [] }, { id: 'b', name: '乙', sourceRefs: [] },
    ] };
    const session = emptyInbox({ ...bank, characterName: '某某世界', participantsV1 });
    assert.equal(session.sender, '某某世界');
    assert.deepEqual(session.participantNames, ['甲', '乙']);
});
test('each new letter freezes its selected senders while old letters retain their legacy session label', () => {
    const roster = (selectedIds, names) => ({ version: 1, cardType: 'multi', revision: selectedIds.join('-'), selectedIds,
        people: names.map(([id, name]) => ({ id, name, sourceRefs: [] })) });
    const firstBank = { ...bank, characterName: '群像卡', participantsV1: roster(['a'], [['a', '甲'], ['b', '乙']]) };
    const firstPlan = inboxPlan(firstBank, null, when);
    const first = normalizeInboxLetters({ letters: [{ slot: 'daily', title: '旧信', greeting: '阿宁', body: '窗开了一条缝，风是凉的，今晚先把灯留着。', closing: '' }] }, firstBank, firstPlan, when);
    delete first.letters[0].participantNames;
    const preservedLegacy = structuredClone(first.letters[0]);
    const nextBank = { ...bank, characterName: '群像卡', participantsV1: roster(['b'], [['a', '甲'], ['b', '乙']]) };
    const nextDate = new Date('2026-09-24T12:00:00+09:00');
    const nextPlan = inboxPlan(nextBank, first, nextDate);
    const incoming = normalizeInboxLetters({ letters: [{ slot: 'daily', title: '新信', greeting: '阿宁', body: '窗外的风停了，我把新的便签放在门边，等你回来时再一起读完。', closing: '' }] }, nextBank, nextPlan, nextDate);
    const merged = mergeInboxLatest(first, incoming);
    assert.deepEqual(merged.letters[0], preservedLegacy);
    assert.deepEqual(merged.letters[1].participantNames, ['乙']);
    assert.equal(inboxSenderLabel(merged.letters[0], merged), '甲');
    assert.equal(inboxSenderLabel(merged.letters[1], merged), '乙');
});
test('saved art reopens deterministically and receiving a duplicate never overwrites old mail', () => {
    const art = { version: 2, characterName: '林深', focus: 'person', visualFacts: [
        { kind: 'hairLength', value: 'long', evidence: '林深留着黑色长发' },
        { kind: 'hairColor', value: 'black', evidence: '林深留着黑色长发' },
    ], scene: { kind: 'lamp', evidence: '今晚先把灯留着' } };
    const plan = inboxPlan(bank, null, when);
    const letter = { slot: 'daily', title: '窗边', greeting: '阿宁', body: '窗开了一条缝，风是凉的，今晚先把灯留着。', closing: '林深', letterIllustration: art };
    const first = normalizeInboxLetters({ letters: [letter] }, bank, plan, when, { characterEvidence: '林深留着黑色长发。' });
    const reopened = normalizeInboxSession(JSON.parse(JSON.stringify(first)));
    assert.equal(renderLetterIllustration(first.letters[0].illustration), renderLetterIllustration(reopened.letters[0].illustration));
    const changed = structuredClone(first); changed.letters[0].body = '不应替换旧信'; changed.letters[0].illustration.palette = 'rose';
    assert.deepEqual(mergeInboxLatest(first, changed).letters, first.letters);
});
test('a saved v1 illustration survives the inbox-session reopen compatibility seam', () => {
    const legacyArt = { version: 1, subject: 'pony', action: 'pet', palette: 'lilac', accessories: ['heart'] };
    const saved = { ...emptyInbox(bank), letters: [{
        id: 'mail-legacy', eventKey: 'daily:legacy', type: 'daily', title: '旧信', greeting: '阿宁', body: '旧信正文仍在。', closing: '林深',
        createdAt: when.getTime(), sourceArchiveRevision: bank.archiveRevision, sourceMemoryIds: [], sourceMemoryAnchor: '',
        readAt: null, favorite: false, travelSnapshot: null, illustration: legacyArt,
    }] };
    const reopened = coreCache.loadSession('inbox', {
        cache: { chatId: bank.chatId, archiveRevision: bank.archiveRevision, inbox: JSON.parse(JSON.stringify(saved)) },
        chatId: bank.chatId, memoryBank: bank, clone: true,
    });
    assert.deepEqual(reopened.letters[0].illustration, legacyArt);
    assert.equal(renderLetterIllustration(reopened.letters[0].illustration), renderLetterIllustration(legacyArt));
    assert.match(renderLetterIllustration(reopened.letters[0].illustration), /data-rmt-letter-illustration-version="1"/);
});
