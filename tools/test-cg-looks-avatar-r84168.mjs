import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './runtime-harness.mjs';

const draft = (schemaVersion = 1, characters = [
    { role: 'char', tag: 'black hair', nl: '黑发' },
    { role: 'user', tag: 'white hair', nl: '白发' },
]) => ({ schemaVersion, sceneTags: 'window, book, rain, warm light',
    flatPrompt: '窗边，两人一起看书。暖灯照着书页，雨滴沿窗流下。', characters });
const people = [
    { id: 'p-one', name: '同名', sourceRefs: [] },
    { id: 'p-two', name: '同名', sourceRefs: [] },
    { id: 'p-other', name: '未选人物', sourceRefs: [] },
];
const multiRows = [
    { participantId: 'p-one', tag: 'silver hair', nl: '银发' },
    { participantId: 'p-two', tag: 'red hair', nl: '红发' },
];

async function fixture({ multi = false } = {}) {
    const h = await harness({ messages: 12, failAfter: 1000, bundle: true });
    h.module('archive/sourceLedger.js').setMemorySourceLedgerBackendForTests({ read: async () => null, write: async () => true, delete: async () => true });
    assert.equal((await h.repo.importCurrentChatMemory()).status, 'committed');
    const constants = h.module('core/constants.js');
    if (multi) h.host.chatMetadata[constants.MEMORY_KEY].participantsV1 = h.copy({
        version: 1, cardType: 'multi', people, selectedIds: ['p-one', 'p-two'],
    });
    h.bank = h.repo.requireArchive(h.host);
    h.origin = h.module('core/context.js').captureTaskOrigin(h.host, h.bank.archiveRevision);
    h.looks = h.module('core/castLooks.js');
    h.appearance = h.module('generation/cgAppearance.js');
    h.saveSingle = value => h.looks.saveConfirmedCastLooks(h.copy(value), {
        origin: h.origin, expectedSignature: h.looks.castLooksSignature(h.looks.readCastLooks(h.host)),
    });
    h.saveMulti = rows => h.looks.saveConfirmedParticipantLooks(h.copy(rows), {
        origin: h.origin, expectedSignature: h.looks.participantLooksSignature(h.looks.readParticipantLooks(h.host)),
    });
    h.begin = options => h.module('generation/generationSavedActions.js').beginModeRecovery('album', h.host, h.bank, h.origin, {
        existing: null, cgPromptFormat: 'nai5-natural', operation: h.copy({ kind: 'mode', mode: 'album' }), ...options,
    });
    h.prompt = () => h.module('generation/cgPromptPolicy.js').cgPromptForSegment('BASE', {
        mode: 'album', taskKey: 'test:album', origin: h.origin,
    });
    return h;
}

test('保存的外貌与新草稿一致：场景 tag 和完整提示保留，原条目不变', async () => {
    const h = await fixture(); h.saveSingle({ char: 'black hair', user: 'white hair' });
    const item = h.copy({ cgPromptDraft: draft() }), before = JSON.stringify(item);
    const result = h.appearance.initialCgAppearanceMetadata(item, h.host);
    assert.equal(result.sceneTags, draft().sceneTags);
    assert.equal(result.flatPrompt, draft().flatPrompt);
    assert.equal(JSON.stringify(item), before);
});

test('外貌确实改变：不复用依赖旧外貌的场景字段，已保存外貌优先', async () => {
    const h = await fixture(); h.saveSingle({ char: 'green hair', user: 'white hair' });
    const result = h.appearance.initialCgAppearanceMetadata(h.copy({ cgPromptDraft: draft() }), h.host);
    assert.equal(result.flatPrompt, undefined);
    assert.equal(result.sceneTags, '');
    assert.equal(result.characters.find(row => row.role === 'char').tag, 'green hair');
});

test('手动清空外貌后不从旧草稿恢复已清空的特征', async () => {
    const h = await fixture(); h.saveSingle({ char: '', user: '' });
    const result = h.appearance.initialCgAppearanceMetadata(h.copy({ cgPromptDraft: draft() }), h.host);
    assert.equal(result?.flatPrompt, undefined);
    assert.equal(result?.characters.length || 0, 0);
});

test('单人出镜可保留匹配草稿，不为已保存另一人的外貌增加人物', async () => {
    const h = await fixture(); h.saveSingle({ char: 'black hair', user: 'white hair' });
    const value = draft(1, [{ role: 'char', tag: 'black hair', nl: '' }]);
    const result = h.appearance.initialCgAppearanceMetadata(h.copy({ cgPromptDraft: value }), h.host);
    assert.equal(result.flatPrompt, value.flatPrompt);
    assert.deepEqual(Array.from(result.characters, row => row.role), ['char']);
});

test('多人新任务带入按 ID 保存的外貌，不混淆同名人物或读未选人物', async () => {
    const h = await fixture({ multi: true });
    h.saveMulti([...multiRows, { participantId: 'p-other', tag: 'UNSELECTED_LOOK', nl: '' }]);
    const calls = h.providerCalls.length;
    const handle = await h.begin();
    const prompt = h.prompt();
    assert.match(prompt, /silver hair/); assert.match(prompt, /red hair/);
    assert.match(prompt, /p-one/); assert.match(prompt, /p-two/);
    assert.doesNotMatch(prompt, /UNSELECTED_LOOK|没有用户确认的人物外貌资料/);
    assert.match(prompt, /participantId/);
    assert.doesNotMatch(prompt, /role 按原任务 char\/user/);
    assert.equal(handle.journal.operation.cgPromptDialect, 'r84168');
    assert.equal(h.providerCalls.length, calls, '保存资料本身不请求模型');
});

test('每页指定人物优先于档案默认名单；显式 null 不变成多人任务', async () => {
    const h = await fixture({ multi: true }); h.saveMulti(multiRows);
    await h.begin({ participantSnapshot: h.copy({ version: 1, people: [people[1]] }) });
    assert.match(h.prompt(), /red hair/); assert.doesNotMatch(h.prompt(), /silver hair/);
    const single = await h.begin({ participantSnapshot: null, draftId: 'single-explicit' });
    assert.equal(single.journal.operation.cgPromptDialect, 'r84166');
    assert.doesNotMatch(h.prompt(), /silver hair|red hair/);
});

test('多人外貌与生成选项冻结：改外貌、改名单后继续旧任务保持原提示', async () => {
    const h = await fixture({ multi: true }); h.saveMulti(multiRows);
    const first = await h.begin({ participantSnapshot: h.copy({ version: 1, people: [people[0]] }) });
    const previous = h.prompt(), saved = h.copy(first.journal);
    h.saveMulti([{ participantId: 'p-one', tag: 'blue hair', nl: '蓝发' }]);
    await h.begin({ existing: saved, participantSnapshot: h.copy({ version: 1, people: [people[1]] }) });
    assert.equal(h.prompt(), previous);
    assert.match(previous, /silver hair/); assert.doesNotMatch(previous, /blue hair|red hair/);
});

test('旧 r84166 任务不补入多人资料，operation 和提示保持原样', async () => {
    const h = await fixture({ multi: true }); h.saveMulti(multiRows);
    const policy = h.module('generation/cgPromptPolicy.js');
    const operation = h.copy({ kind: 'mode', mode: 'album', cgPromptFormat: 'nai5-natural', cgPromptDialect: 'r84166', cgCastLooks: '原单人外貌' });
    const next = policy.cgRecoveryOperation('album', { kind: 'mode', mode: 'album' }, { operation }, 'nai45-tags', '新外貌', multiRows);
    assert.equal(JSON.stringify(next), JSON.stringify(operation));
    policy.bindCgPromptFormat(h.origin, next.cgPromptFormat, next.cgPromptDialect, next.cgCastLooks);
    assert.match(h.prompt(), /原单人外貌/); assert.doesNotMatch(h.prompt(), /silver hair|red hair|CG_PROMPT_FORMAT_V3/);
});

test('从部分成果续做也沿用父任务冻结外貌，不换成今天的新外貌', async () => {
    const h = await fixture({ multi: true }); h.saveMulti(multiRows);
    const first = await h.begin({ participantSnapshot: h.copy({ version: 1, people: [people[0]] }) });
    const previous = h.prompt();
    h.saveMulti([{ participantId: 'p-one', tag: 'blue hair', nl: '蓝发' }]);
    await h.begin({ draftId: 'partial-child', partialSource: { draftId: first.journal.draftId },
        participantSnapshot: h.copy({ version: 1, people: [people[1]] }) });
    assert.equal(h.prompt(), previous);
});

test('多人外貌不被旧单人 1600 字总长截断，最后一个人物仍完整保存', async () => {
    const h = await fixture({ multi: true });
    const selected = Array.from({ length: 8 }, (_, index) => ({ id: `long-${index}`, name: `人物${index}`, sourceRefs: [] }));
    const rows = selected.map(person => ({ participantId: person.id, tag: Array(20).fill('long silver hair').join(', '), nl: '' }));
    h.saveMulti(rows);
    const handle = await h.begin({ participantSnapshot: h.copy({ version: 1, people: selected }) });
    assert.equal(handle.journal.operation.cgParticipantLooks.length, 8);
    assert.equal(handle.journal.operation.cgParticipantLooks[7].tag, rows[7].tag.trim());
    assert.match(h.prompt(), /long-7/);
});

test('Tag 模式的多人草稿允许 nl 留空，仍保留匹配场景；手动清空不恢复旧特征', async () => {
    const h = await fixture({ multi: true }); h.saveMulti(multiRows);
    await h.begin({ cgPromptFormat: 'nai45-tags' });
    assert.match(h.prompt(), /nl 留空/); assert.doesNotMatch(h.prompt(), /nl 非空时原样复制/);
    const value = draft(2, multiRows.map(row => ({ ...row, nl: '' })));
    const metadata = h.appearance.initialCgAppearanceMetadata(h.copy({ cgPromptDraft: value }), h.host);
    assert.equal(metadata.flatPrompt, value.flatPrompt);
    h.saveMulti([{ participantId: 'p-one', tag: '', nl: '' }]);
    const cleared = h.appearance.initialCgAppearanceMetadata(h.copy({ cgPromptDraft: value }), h.host);
    assert.equal(cleared.flatPrompt, undefined);
    assert.equal(cleared.characters.some(row => row.participantId === 'p-one'), false);
});

test('多人草稿的三个以上人物按 ID 保留，不受旧双人角色格式影响', async () => {
    const h = await fixture({ multi: true });
    const value = draft(2, [...multiRows, { participantId: 'p-other', tag: 'brown hair', nl: '棕发' }]);
    const result = h.module('core/cgVisualRules.js').generatedCgDraftFields(h.copy({ cgPromptDraft: value }));
    assert.equal(result.cgPromptDraft?.characters.length, 3);
    assert.equal(result.cgPromptDraft.schemaVersion, 2);
});

test('多人已保存外貌与新草稿匹配时保留场景，同名人物按 ID 对应', async () => {
    const h = await fixture({ multi: true }); h.saveMulti(multiRows);
    const value = draft(2, [...multiRows].reverse());
    const result = h.appearance.initialCgAppearanceMetadata(h.copy({ cgPromptDraft: value }), h.host);
    assert.equal(result.sceneTags, value.sceneTags); assert.equal(result.flatPrompt, value.flatPrompt);
    assert.equal(result.characters.find(row => row.participantId === 'p-one').tag, 'silver hair');
    assert.equal(result.characters.find(row => row.participantId === 'p-two').tag, 'red hair');
});

test('多人换外貌或草稿出现名单外 ID 时不复用旧完整提示', async () => {
    const h = await fixture({ multi: true }); h.saveMulti(multiRows);
    h.saveMulti([{ participantId: 'p-one', tag: 'blue hair', nl: '蓝发' }]);
    const changed = h.appearance.initialCgAppearanceMetadata(h.copy({ cgPromptDraft: draft(2, multiRows) }), h.host);
    assert.equal(changed.flatPrompt, undefined);
    assert.equal(changed.characters.find(row => row.participantId === 'p-one').tag, 'blue hair');
    const outside = h.appearance.initialCgAppearanceMetadata(h.copy({ cgPromptDraft: draft(2, [{ participantId: 'foreign', tag: 'pink hair', nl: '' }]) }), h.host);
    assert.equal(outside.flatPrompt, undefined);
    assert.equal(outside.characters.some(row => row.participantId === 'foreign'), false);
});

test('无保存外貌的多人新草稿也按名单 ID 对应；旧 char/user 草稿不猜 ID', async () => {
    const h = await fixture({ multi: true });
    const current = h.appearance.initialCgAppearanceMetadata(h.copy({ cgPromptDraft: draft(2, multiRows) }), h.host);
    assert.equal(current.characters.find(row => row.participantId === 'p-one')?.tag, 'silver hair');
    assert.equal(current.flatPrompt, draft().flatPrompt);
    const legacy = h.appearance.initialCgAppearanceMetadata(h.copy({ cgPromptDraft: draft() }), h.host);
    assert.equal(legacy.characters.length, 0);
});

test('可选画面草稿写坏不拖垮正文，重复人物 ID 不被接受', async () => {
    const h = await fixture();
    const scene = h.module('core/cgVisualRules.js').generatedCgSceneFields(h.copy({ imagePrompt: '窗边读书。', cgPromptDraft: draft(2, [multiRows[0], multiRows[0]]) }));
    assert.equal(scene.imagePrompt, '窗边读书。'); assert.equal(scene.cgPromptDraft, undefined);
});

test('一起生成的睡前故事也读取本任务多人外貌，原始任务提示随快照保存', async () => {
    const h = await fixture({ multi: true }); h.saveMulti(multiRows);
    const task = h.module('generation/mergedGeneration.js').buildMergeTask('bedtime', h.host, h.bank, null, new Date('2026-09-27T00:00:00Z'), {
        participantSnapshot: h.copy({ version: 1, people: [people[1]] }),
    });
    assert.match(task.singlePrompt, /red hair/); assert.doesNotMatch(task.singlePrompt, /silver hair/);
    assert.equal(task.snapshot.singlePrompt, task.singlePrompt);
    assert.equal(task.snapshot.taskText, task.taskText);
});

test('历史档案用户头像取自该档案，姓名头像不会混用当前 Persona', async () => {
    const h = await fixture(); h.host.user_avatar = 'live-user.png';
    h.module('core/state.js').state.activeArchiveSnapshot = h.copy({ characterName: '旧角色',
        memory: { userName: '旧用户', userAvatar: 'archive-user.png', characterName: '旧角色' } });
    const html = h.module('ui/heartView.js').renderHeartScriptLines(h.copy([{ speaker: 'user', text: '旧对白' }]));
    assert.match(html, /旧用户/); assert.match(html, /archive-user\.png/); assert.doesNotMatch(html, /live-user\.png/);
});

test('历史头像缺失时用占位，不借当前 Persona；当前聊天仍取当前头像', async () => {
    const h = await fixture(); h.host.user_avatar = 'live-user.png';
    const state = h.module('core/state.js').state, heart = h.module('ui/heartView.js');
    state.activeArchiveSnapshot = h.copy({ memory: { userName: '旧用户' } });
    assert.equal(heart.heartUserAvatarUrl(), '');
    state.activeArchiveSnapshot = null;
    assert.equal(heart.heartUserAvatarUrl(), '/User%20Avatars/live-user.png');
});
