import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './runtime-harness.mjs';

const at = '2026-09-26T12:00:00Z';
const stage = { slot: 'stage', title: '原阶段信', greeting: '你好', body: '原阶段信正文，已经写完。', closing: '署名' };
const daily = { slot: 'daily', title: '原日常信', greeting: '你好', body: '原日常信正文，已经写完。', closing: '署名' };
const corrupt = letter => JSON.stringify(letter).slice(0, -1) + ',"letterIllustration":{"scene":{"kind":"write","evidence":"写信"错误解释}}}';
const damaged = `{"letters":[${corrupt(stage)}${JSON.stringify(daily)}]}`;
const mixed = `{"letters":[${JSON.stringify(stage)},${corrupt(daily)}]}`;
const textFields = letters => Array.from(letters, ({ title, greeting, body, closing }) => ({ title, greeting, body, closing }));

async function fixture({ technical = false, legacy = false } = {}) {
    const h = await harness({ messages: 2, bundle: true });
    const bank = h.copy({ version: 3, chatId: h.host.chatId, archiveRevision: 'r1', characterName: 'Char', userName: 'User',
        memories: [{ id: 'M281', title: technical ? '复合锁阵' : '争执后和好', anchors: [technical ? '复合锁阵' : '和好'] }] });
    const operation = { kind: 'mode', mode: 'inbox', inboxDate: at, ...(!legacy ? { inboxPlanVersion: 2 } : {}) };
    const snapshot = { memoryBank: bank, fields: { characterId: 0, name1: 'User', name2: 'Char', chatId: bank.chatId }, contentInputs: { previousSession: null } };
    const journal = raw => h.copy({ identity: { mode: 'inbox' }, segments: [{ slot: 'inbox', state: 'truncated', partial: raw }],
        createdAt: at, operation, contentSnapshotVersion: 1, contentSnapshot: snapshot });
    const inbox = h.module('modes/inbox.js'), progress = h.module('generation/partialProgress.js');
    const plan = inbox.inboxPlan(bank, null, new Date(at), { legacyStageMatching: legacy });
    const validate = raw => inbox.normalizeInboxLetters(raw, bank, plan, new Date(at));
    return { ...h, bank, inbox, progress, journal, operation, snapshot, validate };
}

test('旧草稿可读的两封正文在重试合并后逐字保留', async () => {
    const f = await fixture(), journal = f.journal(damaged);
    const before = await f.progress.projectGenerationProgress(journal, { context: f.host });
    assert.equal(before.letters.length, 2);
    const reply = f.copy({ letters: [stage, { ...daily, title: '重试的新标题', body: '重试改写的不同正文。' }] });
    const merged = await f.progress.mergeGenerationRecoveryResponse(journal, journal.segments[0], reply, f.validate);
    assert.deepEqual(textFields(merged.value.letters), textFields(before.letters));
});

test('重试同时改写两封信时仍保留原文，不误报合并冲突', async () => {
    const f = await fixture(), journal = f.journal(damaged);
    const reply = f.copy({ letters: [stage, daily].map(row => ({ ...row, body: '重试写出的新正文。' })) });
    const merged = await f.progress.mergeGenerationRecoveryResponse(journal, journal.segments[0], reply, f.validate);
    assert.deepEqual(textFields(merged.value.letters), textFields([stage, daily]));
});

test('一封完整、一封可选配图损坏：恢复投影保留两封完整正文', async () => {
    const f = await fixture(), journal = f.journal(mixed);
    const segments = f.progress.generationProgressSegments(journal);
    assert.equal(segments[0].complete, false, '恢复预览不能伪装成完整的成功段');
    assert.equal(segments[0].items('/letters').length, 2);
    const shown = await f.progress.projectGenerationProgress(journal, { context: f.host });
    assert.deepEqual(textFields(shown.letters), textFields([stage, daily]));
});

test('多次部分回复中的原信仍可读取，不被后来同 slot 的正文覆盖', async () => {
    const f = await fixture(), journal = f.journal(JSON.stringify({ letters: [{ ...stage, body: '后来的另一版正文。' }] }));
    journal.segments[0].retainedPartials = f.copy([damaged]);
    const shown = await f.progress.projectGenerationProgress(journal, { context: f.host });
    assert.deepEqual(textFields(shown.letters), textFields([stage, daily]));
});

test('只有 title 而 body 未闭合的信不能被当成已完成正文', async () => {
    const f = await fixture(), journal = f.journal(`{"letters":[${JSON.stringify(stage)},{"slot":"daily","title":"未写完","body":"还在写`);
    const shown = await f.progress.projectGenerationProgress(journal, { context: f.host });
    assert.equal(shown.letters.length, 1);
    assert.equal(shown.letters[0].body, stage.body);
    const merged = await f.progress.mergeGenerationRecoveryResponse(journal, journal.segments[0], f.copy({ letters: [stage, daily] }), f.validate);
    assert.deepEqual(textFields(merged.value.letters), textFields([stage, daily]));
});

test('新任务不把复合锁阵、复合材料、复合函数当作关系复合', async () => {
    const f = await fixture({ technical: true });
    for (const title of ['复合锁阵', '研究复合材料', '复合函数的求导', '修好了复合弓']) {
        const bank = f.copy({ ...f.bank, memories: [{ id: 'M281', title, anchors: [title] }] });
        assert.deepEqual(Array.from(f.inbox.inboxPlan(bank, null, new Date(at)), row => row.slot), ['daily'], title);
    }
});

test('真正的复合、复合后、复合成功和和好仍可产生阶段信', async () => {
    const f = await fixture();
    for (const title of ['两人决定复合', '复合后的第一次见面', '终于复合成功', '争执后和好']) {
        const bank = f.copy({ ...f.bank, memories: [{ id: 'M281', title, anchors: [title] }] });
        assert.deepEqual(Array.from(f.inbox.inboxPlan(bank, null, new Date(at)), row => row.slot), ['stage', 'daily'], title);
    }
});

test('旧任务继续沿用旧阶段计划，更新不丢掉已写好的阶段信', async () => {
    const f = await fixture({ technical: true, legacy: true }), journal = f.journal(damaged);
    const before = await f.progress.projectGenerationProgress(journal, { context: f.host });
    assert.equal(before.letters.length, 2);
    const merged = await f.progress.mergeGenerationRecoveryResponse(journal, journal.segments[0], f.copy({ letters: [stage, daily] }), f.validate);
    assert.deepEqual(textFields(merged.value.letters), textFields([stage, daily]));
});

test('新计划的旧草稿不接受模型自行多写的 stage', async () => {
    const f = await fixture({ technical: true }), journal = f.journal(damaged);
    const shown = await f.progress.projectGenerationProgress(journal, { context: f.host });
    assert.deepEqual(Array.from(shown.letters, letter => letter.type), ['daily']);
    assert.throws(() => f.validate(f.copy({ letters: [stage, daily] })), { code: 'RMT_INBOX_INCOMPLETE' });
});

test('非邮箱草稿保持原解析规则，不能因出现 letters 字段就触发邮箱容错', async () => {
    const f = await fixture(), journal = f.journal(damaged);
    journal.identity.mode = 'album';
    assert.equal(f.progress.generationProgressSegments(journal)[0].items('/letters').length, 0);
});

test('草稿续写保存、重新载入和成功段重放都保留原信，成功段不再请求模型', async () => {
    const f = await fixture(), recovery = f.module('generation/recovery.js');
    const origin = f.module('core/context.js').captureTaskOrigin(f.host, f.bank.archiveRevision);
    let stored;
    const create = extra => recovery.createGenerationRecovery({ origin, mode: 'inbox', settingsIdentity: 'same-settings',
        contentSnapshot: f.copy(f.snapshot), save: async value => { stored = f.copy(value); return true; }, ...extra });
    const first = await create();
    first.journal.operation = f.copy(f.operation);
    recovery.attachGenerationRecovery(origin, first);
    const options = { origin, mode: 'inbox', taskKey: 'mail:recovery', contextEnvelope: 'same-source' };
    await assert.rejects(recovery.withRecoverySegment('original prompt', options, f.validate, async (_prompt, request) => {
        await recovery.freezeRecoveryRequestPayload(request, f.copy({ actualPrompt: 'original prompt', contentSettings: {} }));
        const error = Object.assign(new Error('fixture interruption'), { code: 'RMT_JSON_TRUNCATED' });
        await recovery.recordRecoveryTruncation(request, damaged, error);
        throw error;
    }), { code: 'RMT_JSON_TRUNCATED' });
    assert.equal(stored.segments[0].state, 'truncated');
    const resumed = await create({ existing: stored, continueRequested: true });
    recovery.attachGenerationRecovery(origin, resumed);
    let calls = 0;
    const session = await recovery.withRecoverySegment('original prompt', options, f.validate, async (_prompt, _request, accepted) => {
        calls++;
        await accepted(f.copy({ letters: [stage, { ...daily, body: '重试写了另一封。' }] }));
    });
    assert.deepEqual(textFields(session.letters), textFields([stage, daily]));
    assert.equal(stored.segments[0].state, 'complete');
    assert.deepEqual(textFields(JSON.parse(stored.segments[0].rawJson).letters), textFields([stage, daily]));
    const reopened = await create({ existing: stored, continueRequested: true });
    recovery.attachGenerationRecovery(origin, reopened);
    const replay = await recovery.withRecoverySegment('original prompt', options, f.validate, () => assert.fail('成功段不应再次付费生成'));
    assert.deepEqual(textFields(replay.letters), textFields([stage, daily]));
    assert.equal(calls, 1);
    await assert.rejects(create({ existing: stored, continueRequested: true, origin: { ...origin, chatId: 'other-chat' } }), { code: 'RMT_RECOVERY_INPUT_CHANGED' });
});

test('真正收信入口的新请求与旧请求各自沿用对应计划', async () => {
    const f = await fixture({ technical: true });
    const client = f.module('generation/client.js');
    const original = client.requestValidatedSegment;
    const seen = [];
    client.requestValidatedSegment = async (prompt, _status, _options, validate) => {
        const plan = JSON.parse(prompt.split('LOCAL_MAIL_PLAN:\n')[1].split('\nUNTRUSTED_RELATIONSHIP_ARCHIVE:')[0]);
        seen.push(plan.map(row => row.slot));
        return validate(f.copy({ letters: plan.map(row => row.slot === 'stage' ? stage : daily) }));
    };
    try {
        const fresh = await f.inbox.generateInbox(f.host, f.bank, {}, 'mail:new', null, { date: new Date(at) });
        const legacy = await f.inbox.generateInbox(f.host, f.bank, {}, 'mail:old', null, { date: new Date(at), legacyStageMatching: true });
        assert.equal(fresh.letters.length, 1);
        assert.equal(legacy.letters.length, 2);
        assert.deepEqual(seen, [['daily'], ['stage', 'daily']]);
    } finally { client.requestValidatedSegment = original; }
});
