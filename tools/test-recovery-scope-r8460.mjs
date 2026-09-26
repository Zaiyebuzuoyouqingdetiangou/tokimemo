import test from 'node:test';
import assert from 'node:assert/strict';
import * as cache from '../src/core/cache.js';
import * as recovery from '../src/generation/recovery.js';
import * as contextApi from '../src/core/context.js';
import * as constants from '../src/core/constants.js';
// C-4（r84.120）：生成层不再 import HEART。这个测试只加载恢复模块，要先加载 HEART，档案函数才会登记。断言没改。
import '../src/modes/heart.js';

async function fixture({ frozen = true, legacy = false } = {}) {
    const bank = { version: 3, chatId: 'same-chat', archiveRevision: 'r1', characterName: '林深', userName: '阿宁',
        memories: [{ id: 'M1', title: '旧事', summary: '原文保留', anchors: ['原锚点'] }] };
    const context = { characterId: 0, name2: '林深', name1: '阿宁', chatId: bank.chatId,
        characters: [{ name: '林深', avatar: 'lin.png', description: '旧人设' }], extensionSettings: {},
        __rmtArchiveTargetEntryId: 'entry', chatMetadata: { [constants.MEMORY_KEY]: bank } };
    const origin = () => ({ ...contextApi.captureTaskOrigin(context, bank.archiveRevision), archiveTargetEntryId: 'entry' });
    const stored = {};
    const save = async journal => {
        if (legacy) stored[recovery.GENERATION_RECOVERY_CACHE_KEY] = { inbox: structuredClone(journal) };
        else stored[cache.GENERATION_DRAFTS_CACHE_KEY] = { version: 1, records: { d1: { status: 'open', journal: structuredClone(journal) } } };
        return true;
    };
    const firstOrigin = origin();
    const first = await recovery.createGenerationRecovery({ origin: firstOrigin, mode: 'inbox', settingsIdentity: 'settings',
        ...(frozen ? { contentSnapshot: { memoryBank: structuredClone(bank), cardFields: { description: '旧人设' }, contentSettings: {} } } : {}),
        draftId: 'd1', pageId: 'inbox', save });
    first.journal[constants.SESSION_MODE_WRITE_FENCE_KEY] = '';
    await save(recovery.generationRecoverySnapshot(first));
    recovery.attachGenerationRecovery(firstOrigin, first);
    return { bank, context, stored, origin, save, first, firstOrigin,
        journal: () => legacy ? stored[recovery.GENERATION_RECOVERY_CACHE_KEY].inbox : stored[cache.GENERATION_DRAFTS_CACHE_KEY].records.d1.journal };
}

test('same character card edits do not strand frozen drafts in pool or legacy storage', async () => {
    for (const legacy of [false, true]) {
        const f = await fixture({ legacy }), before = structuredClone(f.stored);
        f.context.characters[0].description = '修改过的人设';
        assert.equal(cache.generationDraftRows(f.stored, f.bank).length, 1);
        const loaded = cache.loadGenerationRecovery('inbox', f.context, f.stored, legacy ? {} : { draftId: 'd1' });
        assert.ok(loaded, 'a displayed frozen task remains actionable for the same character and chat');
        assert.equal(loaded.identity.characterKey, f.first.journal.identity.characterKey, 'loading preserves original attribution');
        assert.deepEqual(f.stored, before);
    }
});

test('explicit inspect keeps old drafts exportable and discardable without treating them as resumable', async () => {
    for (const legacy of [false, true]) {
        const f = await fixture({ frozen: false, legacy });
        f.journal()[constants.SESSION_MODE_WRITE_FENCE_KEY] = 'older task fence';
        const original = structuredClone(f.stored);
        f.bank.archiveRevision = 'r2'; f.context.characters[0].description = '新资料';
        assert.equal(cache.loadGenerationRecovery('inbox', f.context, f.stored, { draftId: 'd1' }), null);
        assert.equal(cache.loadGenerationRecovery('inbox', f.context, f.stored, { intent: 'inspect' }), null, 'inspection must select a named draft');
        const inspected = cache.loadGenerationRecovery('inbox', f.context, f.stored, { draftId: 'd1', intent: 'inspect' });
        assert.ok(inspected);
        const bundle = recovery.exportGenerationRecovery(inspected);
        assert.equal(bundle.journal.identity.archiveRevision, 'r1');
        assert.deepEqual(f.stored, original);
    }
});

test('inspection does not revive closed drafts or select a different requested page', async () => {
    const f = await fixture();
    assert.equal(cache.loadGenerationRecovery('inbox', f.context, f.stored, { draftId: 'd1', pageId: 'other', intent: 'inspect' }), null);
    for (const status of ['complete', 'discarded']) {
        f.stored[cache.GENERATION_DRAFTS_CACHE_KEY].records.d1.status = status;
        assert.equal(cache.loadGenerationRecovery('inbox', f.context, f.stored, { draftId: 'd1', intent: 'inspect' }), null);
    }
});

test('card edits never authorize another character, chat, or archive entry', async () => {
    for (const intent of [undefined, 'inspect']) for (const field of ['characterId', 'characterAvatar', 'chatId', 'archiveTargetEntryId']) {
        const f = await fixture();
        f.context.characters[0].description = '修改过的人设';
        f.journal().identity[field] = 'different';
        assert.equal(cache.loadGenerationRecovery('inbox', f.context, f.stored, { draftId: 'd1', intent }), null, `${intent || 'resume'}: ${field}`);
    }
    const f = await fixture({ frozen: false });
    f.context.characters[0].description = '修改过的人设';
    assert.equal(cache.loadGenerationRecovery('inbox', f.context, f.stored, { draftId: 'd1' }), null, 'missing source snapshot is not silently reconstructed');
});

test('resume after card edits replays saved segments and frozen requests, saves and reopens with source attribution intact', async () => {
    const f = await fixture();
    const options = slot => ({ origin: f.firstOrigin, mode: 'inbox', taskKey: slot, contextEnvelope: '原背景' });
    await recovery.frozenGenerationInput(f.firstOrigin, 'presentation:inbox', () => ({ characterEvidence: '旧人设' }));
    await recovery.withRecoverySegment('原成功请求', options('mail:complete'), x => x, async (_prompt, opts, accepted) => {
        await recovery.freezeRecoveryRequestPayload(opts, { actualPrompt: '原成功完整请求', contentSettings: {} });
        await accepted({ text: '原成功正文' });
    });
    await assert.rejects(recovery.withRecoverySegment('原失败请求', options('mail:retry'), x => x, async (_prompt, opts) => {
        await recovery.freezeRecoveryRequestPayload(opts, { actualPrompt: '原失败完整请求', contentSettings: {} });
        throw Object.assign(new Error('network'), { code: 'RMT_CONNECTION_NETWORK' });
    }));
    const before = structuredClone(f.journal());
    f.context.characters[0].description = '新的人设'; f.bank.archiveRevision = 'r2';
    const loaded = cache.loadGenerationRecovery('inbox', f.context, f.stored, { draftId: 'd1' });
    assert.ok(loaded);
    const nextOrigin = f.origin();
    const resumed = await recovery.createGenerationRecovery({ origin: nextOrigin, mode: 'inbox', settingsIdentity: 'different current settings',
        existing: loaded, continueRequested: true, save: f.save });
    recovery.attachGenerationRecovery(nextOrigin, resumed);
    assert.deepEqual(await recovery.frozenGenerationInput(nextOrigin, 'presentation:inbox', () => assert.fail('must keep original sources')), { characterEvidence: '旧人设' });
    const opts = slot => ({ ...options(slot), origin: nextOrigin, contextEnvelope: 'new context' });
    const complete = await recovery.withRecoverySegment('新成功请求', opts('mail:complete'), x => x, () => assert.fail('successful segment must not be requested again'));
    assert.deepEqual(complete, { text: '原成功正文' });
    await recovery.withRecoverySegment('新失败请求', opts('mail:retry'), x => x, async (prompt, request, accepted) => {
        assert.equal(prompt, '原失败请求');
        assert.equal((await recovery.freezeRecoveryRequestPayload(request, { actualPrompt: 'new request', contentSettings: {} })).actualPrompt, '原失败完整请求');
        await accepted({ text: '补齐正文' });
    });
    const reopened = cache.loadGenerationRecovery('inbox', f.context, f.stored, { draftId: 'd1' });
    assert.ok(reopened);
    assert.deepEqual(reopened.sourceIdentity, before.identity);
    assert.equal(reopened.identity.characterKey, nextOrigin.characterKey);
    assert.equal(reopened.identity.archiveRevision, 'r2');
    assert.deepEqual(reopened.contentSnapshot, before.contentSnapshot);
    assert.deepEqual(reopened.frozenInputs, before.frozenInputs);
    assert.deepEqual(reopened.segments.map(row => row.requestRecipe), before.segments.map(row => row.requestRecipe));
    assert.deepEqual(reopened.segments.map(row => row.requestHash), before.segments.map(row => row.requestHash));
    assert.equal(reopened.segments[0].rawJson, before.segments[0].rawJson);
    f.context.characters[0].description = '又一次普通修改';
    const again = await recovery.createGenerationRecovery({ origin: f.origin(), mode: 'inbox', settingsIdentity: 'settings',
        existing: cache.loadGenerationRecovery('inbox', f.context, f.stored, { draftId: 'd1' }), continueRequested: true, save: f.save });
    assert.deepEqual(again.journal.sourceIdentity, before.identity);
});
