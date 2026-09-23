import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseRandomParticipantId } from '../src/ui/participantPicker.js';
import { resolveGenerationParticipantSnapshot, deriveGenerationParticipantMemoryBank } from '../src/core/generationParticipants.js';
import { resolveStoryIdentities } from '../src/core/participants.js';
import { calendarPrompt } from '../src/generation/prompts.js';
import { inboxPrompt } from '../src/modes/inbox.js';
import { themeSongPrompt } from '../src/modes/themeSong.js';
import { timeStoryPrompt } from '../src/modes/timeStories.js';
import { normalizeCabinet } from '../src/modes/cabinet.js';

const roster = {
    version: 1, cardType: 'multi', revision: 'roster-r1', selectedIds: ['a'],
    people: [
        { id: 'user', name: '我', identity: 'user', sourceRefs: [] },
        { id: 'a', name: '甲', sourceRefs: [] },
        { id: 'b', name: '乙', sourceRefs: [] },
    ],
};

test('random participant is drawn once and confirmation can retain the chosen ID', () => {
    let calls = 0;
    const picked = chooseRandomParticipantId(roster, { excludedIds: roster.selectedIds, random: () => { calls += 1; return .99; } });
    assert.equal(picked, 'b');
    assert.equal(calls, 1);
    const confirmed = { ...roster, selectedIds: [...roster.selectedIds, picked] };
    assert.deepEqual(confirmed.selectedIds, ['a', 'b']);
});

test('frozen snapshot wins and the derived bank is isolated', () => {
    const frozen = { version: 1, people: [roster.people[1]] };
    const resolved = resolveGenerationParticipantSnapshot({ roster: { ...roster, selectedIds: ['b'] }, frozenSnapshot: frozen });
    assert.deepEqual(resolved, frozen);
    const explicit = resolveGenerationParticipantSnapshot({ roster, selectedIds: ['user', 'b'] });
    assert.deepEqual(explicit.people.map(person => person.id), ['user', 'b']);
    const bank = { characterName: '卡名', chatId: 'chat-1', archiveRevision: 'rev-1', participantsV1: roster };
    const derived = deriveGenerationParticipantMemoryBank(bank, { version: 1, people: [roster.people[1], roster.people[2]] });
    assert.equal(derived.characterName, '卡名');
    assert.equal(derived.chatId, 'chat-1');
    assert.equal(derived.archiveRevision, 'rev-1');
    assert.deepEqual(resolveStoryIdentities(derived).ownerNames, ['甲', '乙']);
    assert.deepEqual(bank.participantsV1.selectedIds, ['a']);
});

test('participant-aware module prompts retain every selected character name', () => {
    const bank = { characterName: '某某世界', userName: '我', chatId: 'chat-1', archiveRevision: 'rev-1', memories: [],
        participantsV1: { ...roster, selectedIds: ['a', 'b'] } };
    const context = { name1: '我', name2: '某某世界' };
    assert.match(calendarPrompt(context, bank), /甲、乙/);
    assert.match(inboxPrompt(bank, []), /甲、乙/);
    assert.match(themeSongPrompt({ subject: 'character', language: 'zh', voice: 'char', singer: '甲、乙', direction: '' }, bank), /角色：甲、乙/);
    assert.match(timeStoryPrompt('timeEcho', context, bank), /"chars":\["甲","乙"\]/);
});

test('cabinet accepts evidence tied to a later selected character', () => {
    const anchor = '乙和我一起留下了车票';
    const bank = { characterName: '某某世界', userName: '我', chatId: 'chat-1', archiveRevision: 'rev-1',
        participantsV1: { ...roster, selectedIds: ['a', 'b'] },
        memories: [{ id: 'M001', title: anchor, summary: anchor, anchors: [anchor], participants: ['乙', '我'] }] };
    const cabinet = normalizeCabinet({ items: [{ name: '车票', objectEvidence: anchor, sourceMemoryIds: ['M001'], sourceMemoryAnchor: anchor }] }, bank);
    assert.equal(cabinet.items.length, 1);
});
