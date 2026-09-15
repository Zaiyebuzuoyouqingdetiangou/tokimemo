import test from 'node:test';
import assert from 'node:assert/strict';
import * as cl from '../src/core/castLooks.js';
import { cgImagePromptForItem } from '../src/generation/imageGeneration.js';

// The exact run-on card wording that leaked MBTI, star signs and food into an image request.
const RUN_ON = '谢晦川，男，31岁，身高192cm，MBTI：INTJ，太阳星座：天蝎座，月亮星座：双鱼座，身形修长，黑色短发，'
    + '深邃的眼眸藏在银丝眼镜之后，他的左手手腕有一道指甲长度的疤痕，他轻微近视，爱喝冰美式，偶尔抽烟缓解压力，'
    + '讨厌香菜、韭菜、芒果，他擅长伪装，习惯看父母眼色，成年后，他自然而然地戴上了「完美教授」的面具';

function installChats(current = 'chat-A') {
    const chats = { 'chat-A': {}, 'chat-B': {} };
    const state = { current };
    globalThis.SillyTavern = { getContext: () => ({
        chatMetadata: chats[state.current], name1: '江一帆', name2: '谢晦川',
        getCurrentChatId: () => state.current, saveMetadataDebounced() {},
        getCharacterCardFields: () => ({ description: RUN_ON, persona: '江一帆，棕色短发，常穿宽松卫衣，性格跳脱' }),
    }) };
    return state;
}

test('extraction keeps visible features and drops biography', () => {
    const look = cl.lookFromDescription(RUN_ON);
    for (const keep of ['身高192cm', '身形修长', '黑色短发', '银丝眼镜', '疤痕']) {
        assert.ok(look.includes(keep), `丢失外貌特征: ${keep}`);
    }
    // Splitting on the Chinese comma is what stops the run-on sentence leaking wholesale.
    for (const drop of ['MBTI', 'INTJ', '星座', '天蝎', '冰美式', '抽烟', '香菜', '父母', '伪装', '面具', '31岁']) {
        assert.ok(!look.includes(drop), `不该出现在生图请求里: ${drop}`);
    }
});

test('a hand-confirmed look is never replaced by automatic capture', () => {
    installChats();
    try {
        assert.equal(cl.ensureCastLooks().manual, false);
        cl.writeCastLooks(null, { char: '黑色短发，金色竖瞳，左眼下有泪痣', user: '棕色短发，戴鸭舌帽', manual: true }, 'chat-A');
        cl.ensureCastLooks();                       // as a later archive update would
        const after = cl.readCastLooks();
        assert.match(after.char, /金色竖瞳/);
        assert.equal(after.manual, true);
    } finally { delete globalThis.SillyTavern; }
});

test('looks never cross chats', () => {
    const state = installChats();
    try {
        cl.ensureCastLooks();
        assert.ok(cl.readCastLooks());
        state.current = 'chat-B';
        assert.equal(cl.readCastLooks(), null, '另一个聊天不得读到本聊天的外貌');
        state.current = 'chat-A';
        assert.ok(cl.readCastLooks(), '切回后应仍在');
    } finally { delete globalThis.SillyTavern; }
});

test('a stale chat id cannot write', () => {
    const state = installChats();
    try {
        state.current = 'chat-B';
        assert.throws(() => cl.writeCastLooks(null, { char: 'x', manual: true }, 'chat-A'),
            error => error.code === 'RMT_CAST_LOOKS_STALE');
    } finally { delete globalThis.SillyTavern; }
});

test('the prompt keeps the event first and the looks as supporting detail', () => {
    const scene = '谢晦川为电贝斯换弦，江一帆趴在桌沿歪头瞅着。';
    const line = cl.castLooksPromptLine({ char: '黑色短发，银丝眼镜', user: '棕色短发' }, { name1: '江一帆', name2: '谢晦川' });
    const prompt = cgImagePromptForItem({ cgDesc: scene, visualSeed: ['电贝斯'] }, line);
    assert.ok(prompt.includes(scene));
    assert.ok(prompt.indexOf(scene) < prompt.indexOf('黑色短发'), '事件必须排在外貌之前');
    assert.ok(prompt.includes('谢晦川: 黑色短发'), '外貌要绑定到人');
    assert.ok(prompt.includes('江一帆: 棕色短发'), 'user 侧外貌也要在');
    assert.ok(prompt.includes('电贝斯'), '道具不能被挤掉');
});

test('no looks means no invented cast', () => {
    const prompt = cgImagePromptForItem({ cgDesc: '空房间的清晨' }, '');
    assert.ok(!prompt.includes('fixed appearance'), '没有依据时不得编造人物');
});
