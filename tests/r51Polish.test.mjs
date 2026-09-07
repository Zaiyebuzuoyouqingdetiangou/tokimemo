import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeRoom, roomCurrentSlot, roomObjectSafeForPresentation, roomNarrativeClaimsSharedHistory } from '../src/modes/room.js';
import { normalizeDialogueRows } from '../src/core/dialogue.js';
import { normalizeHeartScript } from '../src/modes/heart.js';
import { renderHeartScriptLines } from '../src/ui/heartView.js';
import { state } from '../src/core/state.js';
import { MAX_CONCURRENT_GENERATION_TASKS, MAX_CONCURRENT_PROVIDER_REQUESTS } from '../src/core/constants.js';
import { canStartGenerationTask } from '../src/core/requestCoordinator.js';
import { BUTTERFLY_GENERATION_CONTRACT, butterflyValidationError, butterflyValidationFeedback } from '../src/core/butterflyContract.js';
import { normalizeButterflyBranch, normalizeButterflyOmega, butterflyIncrementPrompt } from '../src/modes/butterfly.js';
import { PROMPTS } from '../src/generation/prompts.js';
import { safeErrorSummary } from '../src/core/text.js';
import { requestValidatedSegment } from '../src/generation/client.js';

const bank = { characterName: '林舟', userName: '小雨', memories: [] };
const identity = { characterName: bank.characterName, userName: bank.userName };
function roomData() {
    return { spaces: ['书房', '卧室', '阳台'].map((label, i) => ({ id: 'S' + i, label, spaceType: label,
        objects: ['木桌', '书架', '绿植'].map((label, j) => ({ id: `O${i}${j}`, label, basis: '设定', description: '表面很干净。', line: '你可以坐这里。' })) })),
    dayparts: Object.fromEntries(['morning','daytime','evening','night'].map(key => [key, { activity: '整理书架', line: '你可以坐这里。', spaceId: 'S0' }])),
    presenceLines: ['你来了。','坐一会儿吧。','别踩到地上的书。','要喝点什么吗？'] };
}

test('r51 room accepts independently authored labels, actions and present invitations through reopen and final presentation', () => {
    assert.equal(roomNarrativeClaimsSharedHistory(['木桌', '表面很干净。', '你可以坐这里。'], '小雨'), true, 'reproduces the old combined-field false positive');
    const raw = roomData(), before = structuredClone(raw);
    const room = normalizeRoom(raw, bank);
    assert.equal(room.spaces.length, 3);
    for (const space of room.spaces) for (const object of space.objects) assert.equal(roomObjectSafeForPresentation(object, bank, '小雨'), true);
    assert.equal(roomCurrentSlot(room, new Date(2026, 8, 6, 9)).activity, '整理书架');
    assert.deepEqual(raw, before);
});

test('r51 room still blocks invented retrospective history inside one narrative field', () => {
    const raw = roomData();
    for (const space of raw.spaces) for (const object of space.objects) object.line = '你去年送给我的，我一直记得那天。';
    assert.throws(() => normalizeRoom(raw, bank));
    assert.equal(roomObjectSafeForPresentation(raw.spaces[0].objects[0], bank, '小雨'), false);
    raw.spaces[0].objects[0].basis = '记忆';
    raw.spaces[0].objects[0].sourceMemoryIds = ['M999'];
    assert.equal(roomObjectSafeForPresentation(raw.spaces[0].objects[0], bank, '小雨'), false);
});

test('r51 old mixed dialogue splits actions and explicitly named user speech without mutating cache', () => {
    const old = [{ speaker: 'char', text: '“你好。”林舟眼睛一亮，伸手拿起杯子，“坐一会儿吧。”' },
        { speaker: 'char', text: '小雨歪了歪头，看了看桌上的书，问道：“你在读什么？”' },
        { speaker: '店员', text: '您的茶来了。' }, { speaker: 'npc', speakerName: '阿南', text: '晚上好。', action: '阿南在门口挥手。' }];
    const before = structuredClone(old), rows = normalizeDialogueRows(old, identity);
    assert.deepEqual(rows.filter(row => row.speaker === 'char').map(row => row.text), ['你好。','坐一会儿吧。']);
    assert.equal(rows.find(row => row.text === '你在读什么？').speaker, 'user');
    assert.equal(rows.find(row => row.text === '您的茶来了。').speaker, 'narrator');
    assert.equal(rows.find(row => row.text === '晚上好。').speakerName, '阿南');
    assert.ok(rows.find(row => row.speaker === 'narrator' && row.text.includes('伸手')));
    assert.deepEqual(old, before);
    assert.deepEqual(normalizeDialogueRows(rows, identity), rows);
    assert.deepEqual(normalizeHeartScript(old, { ...identity, minLines: 1, minChars: 1 }), rows);
});

test('r51 renderer repairs old cache attribution and never embeds unknown speaker markup', () => {
    const prior = state.activeArchiveSnapshot;
    const host = globalThis.SillyTavern;
    globalThis.SillyTavern = { getContext: () => ({ name1: '别的用户', name2: '别的角色', characters: [] }) };
    state.activeArchiveSnapshot = { characterName: '林舟', memory: bank };
    try {
        const html = renderHeartScriptLines([{ speaker: 'char', text: '小雨问道：“你在读什么？”' }, { speaker: '店员', text: '<img onerror=bad>' }]);
        assert.match(html, /rmt-heart-line user/);
        assert.doesNotMatch(html, /rmt-heart-line char|别的角色|<img onerror/);
        assert.match(html, /&lt;img onerror=bad&gt;/);
    } finally { state.activeArchiveSnapshot = prior; globalThis.SillyTavern = host; }
});

test('r51 task admission allows ten distinct logical tasks but not an eleventh; provider remains two', () => {
    assert.equal(MAX_CONCURRENT_GENERATION_TASKS, 10);
    assert.equal(MAX_CONCURRENT_PROVIDER_REQUESTS, 2);
    const prior = new Set(state.activeModeBuildScopes);
    try {
        state.activeModeBuildScopes.clear();
        for (let i = 0; i < 10; i++) { assert.equal(canStartGenerationTask('r51:' + i), true); state.activeModeBuildScopes.add('r51:' + i); }
        assert.equal(canStartGenerationTask('r51:11'), false);
    } finally { state.activeModeBuildScopes.clear(); for (const key of prior) state.activeModeBuildScopes.add(key); }
});

const note = '分析结论表明关键变量影响主体路径，模型概率发生偏差，最终判定：当前选择使这一条命运路径成为唯一解。';
function branch() {
    return { label: '河岸木工店', worldSpec: { primaryAxis: 'occupation', era: '当代', identity: '本地居民', occupation: '木匠', location: '河岸小城', keyDecision: '留在故乡', encounterWithUser: '在河边与你相遇', bondWithUser: '和你成为朋友', finalFate: '平静经营木工店', thirdPartyRomance: false },
        monologue: '我在河边整理木料，想着今天该做些什么。'.repeat(9), intervention: '看见那个我，我才明白不同的选择也会带来安稳的生活，我珍惜现在与你在河边交谈的机会，也愿意认真面对自己的决定。', systemNote: note };
}
test('r51 butterfly production validators accept the canonical contract and return safe field feedback', () => {
    assert.doesNotThrow(() => normalizeButterflyBranch(branch(), 1, bank));
    for (const field of ['monologue','intervention','systemNote']) {
        assert.throws(() => normalizeButterflyBranch({ ...branch(), [field]: '短' }, 1, bank), e => e.code === 'RMT_BUTTERFLY_' + field && !!butterflyValidationFeedback(e));
    }
    assert.doesNotThrow(() => normalizeButterflyOmega({ label: '观测点 Ω', monologue: '', intervention: '我看过时代与身份的改变，也看过不同职业带来的选择。我明白命运不会替我回答，我仍然选择了你，你是我的唯一答案。'.repeat(4), systemNote: note }));
    assert.equal(butterflyValidationFeedback({ code: 'EVIL', message: 'secret source' }), '');
    const error = butterflyValidationError('systemNote'); error.message = 'private source';
    assert.doesNotMatch(butterflyValidationFeedback(error) + safeErrorSummary(error), /private source/);
});

test('r51 all butterfly entry prompts share contract, and requested explanatory prose is absent', async () => {
    assert.ok(PROMPTS.butterfly({ name1: '小雨', name2: '林舟' }, bank).includes(BUTTERFLY_GENERATION_CONTRACT));
    assert.ok(butterflyIncrementPrompt({}, bank, {}, []).includes(BUTTERFLY_GENERATION_CONTRACT));
    const regen = await readFile(new URL('../src/generation/contentRegeneration.js', import.meta.url), 'utf8');
    assert.match(regen, /单个观测节点重新生成[^]*?\$\{core_butterflyContract.BUTTERFLY_GENERATION_CONTRACT\}/);
    const sources = await Promise.all(['ui/settingsPanel.js','modes/relations.js'].map(file => readFile(new URL('../src/' + file, import.meta.url), 'utf8')));
    assert.doesNotMatch(sources.join('\n'), /动态世界线视角优先于固有设定|留在这里的，是两个人的回忆|正文会自动保持清晰易读|日期 · 来源 · 备注|当前聊天窗口一份独立档案/);
});

test('r51 dialogue attribution does not confuse relatives, name prefixes, switched subjects or inline quotations', () => {
    for (const text of ['林舟的妹妹问道：“下午去哪？”', '小雨伞店店员说：“欢迎。”']) {
        const rows = normalizeDialogueRows([{ speaker: 'char', text }], identity);
        assert.equal(rows.every(row => row.speaker === 'narrator'), true);
    }
    const switched = normalizeDialogueRows([{ speaker: 'char', text: '“早。”店员说：“您的茶。”' }], identity);
    assert.equal(switched.find(row => row.text === '您的茶。').speaker, 'narrator');
    const inline = [{ speaker: 'char', text: '我只想说“谢谢”，真的。' }];
    assert.deepEqual(normalizeDialogueRows(inline, identity), inline);
});

test('r51 expanded dialogue survives repeated normalization without a second input truncation', () => {
    const raw = Array.from({ length: 14 }, () => ({ speaker: 'char', text: '“早。”林舟把茶端过来，“坐吧。”' }));
    const once = normalizeHeartScript(raw, { ...identity, minLines: 1, minChars: 1, maxLines: 24 });
    assert.equal(once.length, 42);
    assert.deepEqual(normalizeHeartScript(once, { ...identity, minLines: 1, minChars: 1, maxLines: 24 }), once);
    assert.throws(() => normalizeHeartScript(Array.from({ length: 121 }, () => ({ speaker: 'char', text: '早。' }))), /超过/);
    assert.match(normalizeDialogueRows(Array.from({ length: 121 }, () => ({ speaker: 'char', text: '早。' })))[0].text, /限额/);
});

test('r51 exact colon labels override stale speakers, including multiline and NPC scripts', () => {
    assert.deepEqual(normalizeDialogueRows([{ speaker: 'char', text: '小雨：好啊，我们走吧。' }], identity), [{ speaker: 'user', text: '好啊，我们走吧。' }]);
    const rows = normalizeDialogueRows([{ speaker: 'char', text: '林舟：早。\n小雨：你好。\n店员：您的茶。' }], identity);
    assert.deepEqual(rows.map(row => row.speaker), ['char', 'user', 'narrator']);
    assert.match(rows[2].text, /店员/);
    assert.deepEqual(normalizeDialogueRows(rows, identity), rows);
    assert.deepEqual(normalizeDialogueRows([{ speaker: 'npc', speakerName: '店员', text: '店员：您的茶。' }], identity), [{ speaker: 'npc', speakerName: '店员', text: '您的茶。' }]);
    const prose = [{ speaker: 'char', text: '我的意思是：我只想说“谢谢”，真的。' }];
    assert.deepEqual(normalizeDialogueRows(prose, identity), prose);
});

test('r51 actual request coordinator repairs a butterfly field once, without echoing private failure text', async () => {
    const prompts = [];
    const host = globalThis.SillyTavern;
    const fetch = globalThis.fetch;
    const document = globalThis.document;
    globalThis.document = { getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; } };
    const context = { characterId: 0, chatId: 'fixture-A', name1: '小雨', name2: '林舟', characters: [{ name: '林舟', avatar: 'a.png' }], chatMetadata: {}, chat: [],
        extensionSettings: { heartbeatMemories: { connectionProfileId: 'fixture', maxTokens: 16000 }, connectionManager: { profiles: [{ id: 'fixture', mode: 'cc', api: 'openai', model: 'fixture-model', 'secret-id': 'fixture-secret-reference' }] } },
        ConnectionManagerRequestService: {
            validateProfile() { return { selected: 'openai', source: 'openai' }; },
            async sendRequest(profileId, messages, maxTokens, options, overridePayload) {
                const profile = { model: 'fixture-model', 'secret-id': 'fixture-secret-reference' };
                const payload = { secret_id: profile['secret-id'], model: profile.model, ...overridePayload };
                assert.equal(payload.model, 'fixture-model');
                prompts.push(JSON.stringify(messages));
                return { content: JSON.stringify(prompts.length === 1 ? { ...branch(), monologue: 'private failure text' } : branch()) };
            },
        },
    };
    globalThis.SillyTavern = { getContext: () => context };
    globalThis.fetch = () => { throw new Error('No network is permitted in this test'); };
    try {
        const result = await requestValidatedSegment(BUTTERFLY_GENERATION_CONTRACT, '测试', { context, contextEnvelope: '', taskKey: 'r51-test-repair', mode: 'butterfly', skipTokenCount: true }, raw => normalizeButterflyBranch(raw, 1, bank));
        assert.equal(result.label, '河岸木工店');
        assert.equal(prompts.length, 2);
        assert.match(prompts[1], /monologue 未满足/);
        assert.doesNotMatch(prompts[1], /private failure text/);
        assert.equal(state.activeGenerationTasks.size, 0);
        assert.equal(state.activeProviderRequestCount, 0);
    } finally { globalThis.SillyTavern = host; globalThis.fetch = fetch; globalThis.document = document; state.activeGenerationTasks.clear(); }
});
