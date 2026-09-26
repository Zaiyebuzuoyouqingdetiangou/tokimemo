import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, parsePartialJsonObject, salvageInboxLetters } from '../src/generation/jsonParser.js';
import { generationProgressSegments } from '../src/generation/partialProgress.js';
import * as inbox from '../src/modes/inbox.js';

const brokenInbox = `Need to draft two letters.
{"letters":[{"slot":"stage","title":"关于阵眼与心跳的余波","greeting":"夏：","body":"正经给你写点东西。当时那个复合锁阵压下来的时候。","closing":"你的 鹤丸国永","letterIllustration":{"version":2,"characterName":"鹤丸国永","focus":"person","visualFacts":[{"kind":"hairColor","value":"white","evidence":"Short layered white hair"}],"scene":{"kind":"write","evidence":"正经给你写点东西"满足关键词"写"之要求，信件为写就之物。}}}{"slot":"daily","title":"檐廊下的消遣与新计划","greeting":"夏：","body":"我刚才在回廊散步的时候，发现后院的枫叶落得很有趣。","closing":"鹤丸国永"}]}`;

function mailBank() {
    return {
        version: 3, chatId: 'mail-chat', archiveRevision: 'r1',
        characterName: '鹤丸国永', userName: '风早夏',
        memories: [{ id: 'M281', title: '复合锁阵', summary: '解开了复合锁阵', anchors: ['复合锁阵'] }],
    };
}

function mailContext(bank) {
    return {
        characterId: 0, name1: '风早夏', name2: '鹤丸国永', chatId: bank.chatId,
        extensionSettings: {}, characters: [{ name: '鹤丸国永', avatar: 'tsuru.png' }],
    };
}

test('closed braces with leaked illustration evidence is not valid JSON', () => {
    assert.equal(parsePartialJsonObject(brokenInbox).items('/letters').length, 0);
    assert.throws(() => JSON.parse(brokenInbox.slice(brokenInbox.indexOf('{'))), SyntaxError);
});

test('salvage keeps both finished inbox letters and drops the broken illustration fence', () => {
    const salvaged = salvageInboxLetters(brokenInbox);
    assert.equal(salvaged.letters.length, 2);
    assert.equal(salvaged.letters[0].slot, 'stage');
    assert.equal(salvaged.letters[0].title, '关于阵眼与心跳的余波');
    assert.match(salvaged.letters[0].body, /复合锁阵/);
    assert.equal(salvaged.letters[1].slot, 'daily');
    assert.match(salvaged.letters[1].body, /回廊散步/);
});

test('extractJson accepts the broken inbox reply instead of RMT_JSON_INVALID', () => {
    const parsed = extractJson(brokenInbox);
    assert.equal(parsed.letters.length, 2);
    const bank = mailBank();
    const date = new Date('2026-09-26T12:00:00+09:00');
    const session = inbox.normalizeInboxLetters(parsed, bank, inbox.inboxPlan(bank, null, date), date);
    assert.equal(session.letters.length, 2);
    assert.equal(session.letters[0].type, 'stage');
    assert.equal(session.letters[1].type, 'daily');
});

test('inbox recovery can read salvaged letters from a truncated draft', () => {
    const bank = mailBank();
    const context = mailContext(bank);
    const date = new Date('2026-09-26T12:00:00+09:00');
    const segments = generationProgressSegments({
        identity: { mode: 'inbox' },
        segments: [{ slot: 'inbox', state: 'truncated', partial: brokenInbox }],
    });
    assert.equal(segments[0].items('/letters').length, 2);
    const progress = inbox.projectInboxProgress({
        segments, memoryBank: bank, context, previousSession: null,
        operation: { inboxDate: date.toISOString() }, createdAt: date.toISOString(),
    });
    assert.equal(progress.letters.length, 2);
});

test('valid inbox JSON is unchanged and non-mail invalid JSON still fails', () => {
    const valid = { letters: [{ slot: 'daily', title: '今日', greeting: '夏：', body: '今天天守阁的阳光正好。', closing: '鹤丸' }] };
    assert.deepEqual(extractJson(JSON.stringify(valid)), valid);
    assert.equal(salvageInboxLetters('{"pages":[{"title":"相簿","note":"a"坏}]}'), null);
    assert.throws(() => extractJson('{"pages":[{"title":"相簿","note":"a"坏}]}'), error => error.code === 'RMT_JSON_INVALID');
    assert.equal(salvageInboxLetters('{"letters":[{"slot":"daily","title":"空","letterIllustration":{"scene":{"evidence":"a"坏}}}]}'), null);
});
