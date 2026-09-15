import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const src = process.env.HEART_DIALOGUE_BASELINE
    ? pathToFileURL(`${process.env.HEART_DIALOGUE_BASELINE}/src/`) : new URL('../src/', import.meta.url);
const dialogue = await import(new URL('core/dialogue.js', src));
const heart = await import(new URL('modes/heart.js', src));
const view = await import(new URL('ui/heartView.js', src));
const id = { characterName: '林舟', userName: '小雨' };
const norm = rows => dialogue.normalizeDialogueRows(rows, id);
const speech = rows => rows.filter(row => row.speaker !== 'narrator');
const userLine = text => ({ speaker: 'user', text });
const charLine = text => ({ speaker: 'char', text });
const narrator = text => ({ speaker: 'narrator', text });
// Most fixtures assert public text/role behavior. Canonical local speakerName is
// checked separately below; NPC names must never be stripped from assertions.
function sameRows(actual, expected, message) {
    const shape = value => Array.isArray(value) ? value.map(row => {
        if (row && ['char', 'user'].includes(row.speaker)) {
            const { speakerName, ...rest } = row;
            return rest;
        }
        if (row?.unresolvedSpeaker === true) { const { unresolvedSpeaker, ...rest } = row; return rest; }
        return row;
    }) : value;
    assert.deepEqual(shape(actual), shape(expected), message);
}


const cases = [
    ['explicit user stays user', [userLine('你还好吗？')], [userLine('你还好吗？')]],
    ['name label overrides an enum', [charLine('小雨：你还好吗？')], [userLine('你还好吗？')]],
    ['ordinary named speech', [narrator('小雨说：“你还好吗？”')], [narrator('小雨说：'), userLine('你还好吗？')]],
    ['adverb before speech', [narrator('小雨很自然地问：“你还好吗？”')], [narrator('小雨很自然地问：'), userLine('你还好吗？')]],
    ['typed user survives a pronoun speech aside', [userLine('她轻声问道：“你还好吗？”')], [narrator('她轻声问道：'), userLine('你还好吗？')]],
    ['named speech cue in preceding row', [narrator('小雨问道：'), narrator('“你还好吗？”')], [narrator('小雨问道：'), userLine('你还好吗？')]],
    ['preceding cue fixes unquoted wrongly tagged speech', [narrator('小雨问道：'), charLine('你还好吗？')], [narrator('小雨问道：'), userLine('你还好吗？')]],
    ['known speakerName overrides a generic char enum', [{ speaker: 'char', speakerName: '小雨', text: '你还好吗？' }], [userLine('你还好吗？')]],
    ['known speakerName works with narrator output', [{ speaker: 'narrator', speakerName: '小雨', text: '你还好吗？' }], [userLine('你还好吗？')]],
    ['narrative sound stays whole', [narrator('林舟脑子里“轰”的一声，差点忘了说什么。')], [narrator('林舟脑子里“轰”的一声，差点忘了说什么。')]],
    ['a quote inside ordinary speech stays whole', [userLine('我只想说“谢谢”，真的。')], [userLine('我只想说“谢谢”，真的。')]],
    ['split attributed speech without quotation marks', [charLine('小雨很自然地问：你还好吗？')], [narrator('小雨很自然地问：'), userLine('你还好吗？')]],
    ['separate action field supplies its subject', [{ speaker: 'char', action: '小雨轻声问道：', text: '你还好吗？' }], [narrator('小雨轻声问道：'), userLine('你还好吗？')]],
    ['two speakers in one narrative row', [narrator('林舟说：“太热了。”小雨问：“要喝水吗？”')], [narrator('林舟说：'), charLine('太热了。'), narrator('小雨问：'), userLine('要喝水吗？')]],
    ['unknown quoted narrative stays neutral and intact', [narrator('有人说：“你还好吗？”')], [narrator('有人说：“你还好吗？”')]],
    ['unattributed quote remains neutral', [narrator('“你还好吗？”')], [narrator('“你还好吗？”')]],
    ['name prefix is not the subject', [narrator('小雨的妹妹说：“你还好吗？”')], [narrator('小雨的妹妹说：“你还好吗？”')]],
    ['name prefix is not a longer name', [narrator('小雨伞店老板说：“你还好吗？”')], [narrator('小雨伞店老板说：“你还好吗？”')]],
    ['object name is not the speaker', [narrator('林舟看着小雨，轻声问：“你还好吗？”')], [narrator('林舟看着小雨，轻声问：'), charLine('你还好吗？')]],
    ['ambiguous named third person does not borrow typed user', [userLine('小雨的妹妹问：“你还好吗？”')], [narrator('小雨的妹妹问：“你还好吗？”')]],
    ['self-speech aside keeps its tagged owner', [userLine('“等一下，”我说，“一起走吧。”')], [userLine('等一下，'), narrator('我说，'), userLine('一起走吧。')]],
    ['explicit action remains narration', [charLine('小雨转身看了看窗外。')], [narrator('小雨转身看了看窗外。')]],
    ['parenthetic action remains narration', [userLine('（轻轻点头）')], [narrator('（轻轻点头）')]],
    ['thought is not spoken dialogue', [narrator('小雨心想：“他怎么还不回来？”')], [narrator('小雨心想：“他怎么还不回来？”')]],
    ['known NPC stays separate', [{ speaker: 'npc', speakerName: '店员', text: '请慢用。' }], [{ speaker: 'npc', speakerName: '店员', text: '请慢用。' }]],
    ['unnamed NPC stays neutral', [{ speaker: 'npc', text: '请慢用。' }], [narrator('请慢用。')]],
];
for (const [name, raw, expected] of cases) {
    test(name, () => {
        sameRows(norm(raw), expected);
        sameRows(norm(norm(raw)), expected, 'normalizing a saved script twice must not change its roles or paragraphs');
    });
}

test('long named action followed by a colon can introduce the next line, without guessing by gender', () => {
    const lead = '小雨眨了眨眼，似乎在认真思索。随后，她主动上前一步，微微踮起脚尖，张开双臂想要环住他的腰：';
    const rows = [narrator(lead), narrator('那你要抱我吗？我身上很凉快。')];
    sameRows(norm(rows), [narrator(lead), userLine('那你要抱我吗？我身上很凉快。')]);
});

test('a preceding cue expires at intervening narration and after one utterance', () => {
    sameRows(norm([narrator('小雨问道：'), narrator('窗外落下了雨。'), narrator('“你还好吗？”')]),
        [narrator('小雨问道：'), narrator('窗外落下了雨。'), narrator('“你还好吗？”')]);
    sameRows(norm([narrator('小雨问道：'), narrator('“你还好吗？”'), charLine('我没事。')]),
        [narrator('小雨问道：'), userLine('你还好吗？'), charLine('我没事。')]);
    sameRows(norm([narrator('小雨问道：')]), [narrator('小雨问道：')]);
    sameRows(norm([narrator('“你还好吗？”')]), [narrator('“你还好吗？”')], 'no state shared across scripts');
});

test('exact next speaker label wins over a preceding cue', () => {
    sameRows(norm([narrator('小雨问道：'), charLine('林舟：等一下。')]),
        [narrator('小雨问道：'), charLine('等一下。')]);
});

test('ordinary direct speech is never alternated to guess who is talking', () => {
    sameRows(norm([charLine('你还好吗？'), charLine('我是说，你累不累？')]),
        [charLine('你还好吗？'), charLine('我是说，你累不累？')]);
});

test('identical character and user names are ambiguous rather than selecting char first', () => {
    sameRows(dialogue.normalizeDialogueRows([narrator('同名说：“走吧。”')], { characterName: '同名', userName: '同名' }),
        [narrator('同名说：“走吧。”')]);
});

test('physical line labels and all supported quote styles retain the explicit speaker', () => {
    sameRows(norm([charLine('小雨：你好。\n林舟：走吧。')]), [userLine('你好。'), charLine('走吧。')]);
    for (const [open, close] of [['“', '”'], ['「', '」'], ['"', '"']]) {
        sameRows(speech(norm([narrator(`小雨很自然地问：${open}你还好吗？${close}`)])), [userLine('你还好吗？')]);
    }
});

test('read path does not mutate frozen old cache, and real renderer selects user avatar', () => {
    const rows = Object.freeze([Object.freeze({ speaker: 'char', speakerName: '小雨', text: '你还好吗？' }),
        Object.freeze(narrator('林舟脑子里“轰”的一声。'))]);
    const before = JSON.stringify(rows);
    const html = view.renderHeartScriptLines(rows, { ...id, charAvatar: '/characters/char.png', userAvatar: '/User%20Avatars/user.png' });
    assert.match(html, /class="rmt-heart-line user"/);
    assert.match(html, /src="\/User%20Avatars\/user.png"/);
    assert.doesNotMatch(html, /class="rmt-heart-line char"/);
    assert.match(html, /<small>小雨<\/small>/);
    assert.match(html, /<div class="rmt-heart-narration">林舟脑子里“轰”的一声。<\/div>/);
    assert.equal(JSON.stringify(rows), before);
});

test('model speaker, names and text cannot inject HTML or select an arbitrary avatar', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const html = view.renderHeartScriptLines([{ speaker: 'char', speakerName: '小雨', text: payload },
        { speaker: 'npc', speakerName: payload, text: '<script>bad()</script>' },
        { speaker: payload, text: payload }], { ...id, charAvatar: '/c.png', userAvatar: '/u.png' });
    assert.match(html, /rmt-heart-line user/);
    assert.match(html, /&lt;img/);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>|<img src=x|class="[^"]*onerror/);
    assert.equal((html.match(/<img /g) || []).length, 1);
});

test('row, post-split and character budgets remain bounded and fail closed', () => {
    const tooMany = Array.from({ length: 121 }, () => userLine('好。'));
    const tooLong = [userLine('文'.repeat(50401))];
    const expanded = [narrator('小雨说：“好。”'.repeat(61))];
    for (const raw of [tooMany, tooLong, expanded]) {
        assert.throws(() => dialogue.normalizeDialogueRows(raw, { ...id, strict: true }), /120|50400/);
        const display = norm(raw);
        assert.equal(display.length, 1);
        assert.equal(display[0].speaker, 'narrator');
        assert.match(display[0].text, /安全显示限额/);
    }
    assert.equal(norm(Array.from({ length: 120 }, () => userLine('好。'))).length, 120);
    assert.equal(norm([userLine('文'.repeat(50400))])[0].text.length, 50400);
});

const longScript = () => Array.from({ length: 8 }, (_, i) => ({ speaker: 'char', speakerName: i % 2 ? '林舟' : '小雨',
    text: `${i}，${'今天的风很轻，我们沿着河边慢慢走，树叶在头顶轻响。'.repeat(3)}` }));
test('production Voice/Scenario validators correct named roles before saving all four seasons and future', () => {
    for (const season of ['spring', 'summer', 'autumn', 'winter', 'postending']) {
        const raw = longScript();
        const voice = heart.normalizeVoiceDramaPart({ voiceDramas: [{ kind: season, script: raw }] }, [season], id)[0];
        assert.equal(voice.script[0].speaker, 'user');
        assert.equal(voice.script[1].speaker, 'char');
        if (season !== 'postending') {
            const scenario = heart.normalizeScenarioDramaPart({ scenarioDramas: [{ season, script: raw }] }, season, id)[0];
            assert.equal(scenario.script[0].speaker, 'user');
            sameRows(norm(scenario.script), scenario.script);
        }
    }
});

test('HEART persona fallback and incremental relationship preservation remain intact', () => {
    const greetings = Object.fromEntries(['morning', 'noon', 'evening', 'night', 'weekend', 'birthday', 'userBirthday', 'holiday', 'absenceWorry', 'absenceSulky']
        .map(key => [key, ['今天过得怎么样？', '歇一会儿吧。']]));
    const bank = { ...id, memories: [] };
    const data = { relationshipState: '相识', relationshipSummary: '仍在了解彼此，按人设互动。', greetings };
    const core = heart.normalizeHeartCore(data, bank);
    sameRows(core.relationshipSourceMemoryIds, []);
    assert.equal(core.relationshipSourceMemoryAnchor, '');
    sameRows(heart.normalizeHeart(data, bank).relationshipSourceMemoryIds, []);
    const incremental = heart.normalizeHeartCoreIncrement({ ...data, relationshipState: '未来模拟' }, bank, []);
    sameRows(incremental.relationshipSourceMemoryIds, []);
    const merged = heart.mergeHeartCoreIncremental({ ...core, specialDays: [] }, incremental, true).session;
    assert.equal(merged.relationshipState, core.relationshipState);
});

test('postposed explicit attribution recovers speech instead of relying on alternation', () => {
    sameRows(norm([narrator('“你还好吗？”小雨问。')]), [userLine('你还好吗？'), narrator('小雨问。')]);
    sameRows(norm([narrator('“等一下，”林舟说，“一起走吧。”')]),
        [charLine('等一下，'), narrator('林舟说，'), charLine('一起走吧。')]);
});

test('contradictory explicit names fail safely for new output and display neutrally for legacy', () => {
    const raw = [{ speaker: '林舟', speakerName: '小雨', text: '你还好吗？' }];
    assert.throws(() => dialogue.normalizeDialogueRows(raw, { ...id, strict: true }), e => {
        assert.equal(e.code, 'RMT_HEART_INCOMPLETE');
        assert.doesNotMatch(e.message, /林舟|小雨|你还好吗/);
        return true;
    });
    sameRows(norm(raw), [narrator('你还好吗？')]);
});

test('unknown name labels stay neutral instead of borrowing a typed char', () => {
    sameRows(norm([charLine('陌生人：你好。')]), [narrator('陌生人：你好。')]);
    sameRows(norm([{ speaker: 'char', speakerName: '另一个人', text: '你好。' }]), [narrator('你好。')]);
});

test('adverbs never turn a possessive or longer-name prefix into an identity', () => {
    for (const subject of ['小雨的妹妹', '小雨伞店老板']) {
        const text = `${subject}很自然地问：“你还好吗？”`;
        sameRows(norm([narrator(text)]), [narrator(text)]);
    }
});

test('quotation at the beginning of ordinary speech does not turn its suffix into narration', () => {
    for (const text of ['“谢谢”这个词很重要。', '“轰”的一声，吓了我一跳。', '“好吧”，真的，我同意了。']) {
        sameRows(norm([userLine(text)]), [userLine(text)]);
    }
});

test('legacy split sound fragments are joined only for display without changing stored text', () => {
    const old = Object.freeze([Object.freeze(narrator('林舟脑子里')), Object.freeze(narrator('轰')),
        Object.freeze(narrator('的一声，差点忘了说什么。'))]);
    sameRows(norm(old), [narrator('林舟脑子里轰的一声，差点忘了说什么。')]);
    sameRows(dialogue.normalizeDialogueRows(old, { ...id, strict: true }), old);
    const ambiguous = [narrator('远处'), narrator('轰'), narrator('的一声，雨落了下来。')];
    sameRows(norm(ambiguous), ambiguous);
});

test('bounded hostile-looking text does not require DOM, host, network, or expensive regex backtracking', () => {
    for (const text of ['林舟' + '很地'.repeat(18000), '“”'.repeat(25000), '林舟' + '自然地'.repeat(16000)]) {
        const out = norm([narrator(text)]);
        assert.equal(out.length, 1);
        assert.equal(out[0].speaker, 'narrator');
        assert.equal(out[0].text, text);
    }
});

test('a following narrator explicitly saying the named user spoke corrects a bare char enum', () => {
    const after = '小雨清澈的眼眸里透着一丝不解，她说着，十分自然地伸出手。';
    const raw = [charLine('你如果觉得热，为什么还要帮忙？'), narrator(after)];
    const expected = [userLine('你如果觉得热，为什么还要帮忙？'), narrator(after)];
    sameRows(norm(raw), expected);
    sameRows(norm(norm(raw)), expected);
    sameRows(norm([charLine('你还好吗？'), narrator('小雨说完，朝他点了点头。')]),
        [userLine('你还好吗？'), narrator('小雨说完，朝他点了点头。')]);
});

test('the next action or an unknown relative is not retrospective speech attribution', () => {
    for (const after of ['小雨眨了眨眼，似乎在认真思索。', '小雨的妹妹说着，朝他点头。', '小雨清澈的眼眸里透着疑惑，有人说着']) {
        sameRows(norm([charLine('你还好吗？'), narrator(after)]), [charLine('你还好吗？'), narrator(after)]);
    }
});

test('an exact next narrator must not overwrite a named speaker or a complete paragraph', () => {
    const after = narrator('小雨说完，朝他点头。');
    sameRows(norm([{ speaker: 'char', speakerName: '林舟', text: '我没事。' }, after]), [charLine('我没事。'), after]);
    sameRows(norm([narrator('林舟脑子里“轰”的一声。'), after]), [narrator('林舟脑子里“轰”的一声。'), after]);
});

test('resolved speakerName survives save/display so a second pass cannot swap identities', () => {
    for (const raw of [
        [{ speaker: 'char', speakerName: '林舟', text: '我没事。' }, narrator('小雨说完，朝他点头。')],
        [charLine('林舟：我没事。'), narrator('小雨说完，朝他点头。')],
        [narrator('小雨问道：'), charLine('你还好吗？')],
    ]) {
        const once = norm(raw);
        assert.deepEqual(norm(once), once);
        for (const row of speech(once)) assert.equal(row.speakerName, row.speaker === 'user' ? id.userName : id.characterName);
    }
});

test('an explicitly named NPC cannot be rebound to the following narrator on a second pass', () => {
    const raw = [{ speaker: 'npc', speakerName: '店员', text: '她轻声问道：“你好。”' }, narrator('小雨说完，朝他点头。')];
    const once = norm(raw);
    assert.equal(speech(once)[0].speaker, 'npc');
    assert.equal(speech(once)[0].speakerName, '店员');
    assert.deepEqual(norm(once), once);
});

test('ambiguous legacy identity stays neutral through repeated rendering', () => {
    const raw = [{ speaker: '林舟', speakerName: '小雨', text: '你好。' }, narrator('小雨说完，朝他点头。')];
    const once = norm(raw);
    assert.equal(once[0].speaker, 'narrator');
    assert.equal(once[0].unresolvedSpeaker, true);
    assert.deepEqual(norm(once), once);
});

test('a completed legacy-shaped recovery checkpoint revalidates locally without another provider call', async t => {
    const recovery = await import(new URL('generation/recovery.js', src));
    const origin = { characterKey: 'fixture-character', characterId: '0', characterAvatar: 'fixture.png',
        chatId: 'fixture-chat', archiveRevision: 'fixture-revision' };
    const create = existing => recovery.createGenerationRecovery({ origin, mode: 'heart', settingsIdentity: 'fixture-settings',
        existing, continueRequested: !!existing, save: async () => true });
    let handle = await create();
    recovery.attachGenerationRecovery(origin, handle);
    t.after(() => recovery.detachGenerationRecovery(origin));
    const prompt = heart.heartSeasonVoicePrompt({ name1: id.userName, name2: id.characterName }, id, { relationshipState: '相识' }, 'summer');
    const options = { origin, mode: 'heart', taskKey: 'heart-season:fixture:summer:voice', maxTokens: 3000, temperature: 0.65 };
    const raw = { voiceDramas: [{ kind: 'summer', script: longScript() }] };
    // Seed a historical checkpoint whose raw JSON still includes the supplied names.
    await recovery.withRecoverySegment(prompt, options, value => value, async (_prompt, _options, accepted) => {
        await accepted(raw); return raw;
    });
    const checkpoint = recovery.generationRecoverySnapshot(handle);
    handle = await create(checkpoint);
    recovery.attachGenerationRecovery(origin, handle);
    let sends = 0;
    const result = await recovery.withRecoverySegment(prompt, options,
        value => heart.normalizeVoiceDramaPart(value, ['summer'], id), async () => { sends += 1; throw new Error('must not send'); });
    assert.equal(sends, 0);
    assert.equal(result[0].script[0].speaker, 'user');
    assert.equal(recovery.generationRecoverySnapshot(handle).segments[0].rawJson, checkpoint.segments[0].rawJson);
});
