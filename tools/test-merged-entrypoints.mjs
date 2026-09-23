// Run with: node --experimental-vm-modules --test tools/test-merged-entrypoints.mjs
// Real production entrypoints + real recovery journals; only host storage and
// provider boundaries are simulated. No paid requests or user chat writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as recovery from '../src/generation/recovery.js';
import { state } from '../src/core/state.js';

async function load(file, overrides) {
    const url = new URL(file, import.meta.url);
    const module = new vm.SourceTextModule(await readFile(url, 'utf8'), { identifier: url.href });
    await module.link(async specifier => {
        const absolute = new URL(specifier, url).href;
        const real = await import(absolute);
        const values = { ...real, ...(overrides[specifier] || {}) };
        const stub = new vm.SyntheticModule(Object.keys(values), function () {
            for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        });
        return stub;
    });
    await module.evaluate();
    return module.namespace;
}
async function fixture() {
    const bank = { chatId: 'chat-one', archiveRevision: 'rev-one', characterName: '林深', userName: '阿宁', memories: [], archiveSummary: '', archiveKeywords: [] };
    const context = { name1: '阿宁', name2: '林深', characterId: 0, chatMetadata: {} };
    let pendingWriteFailure = false, omitSong = false, omitInbox = false;
    let controlledEnvelope = 'CHARACTER_CARD_JSON:\n{"name":"林深","description":"林深留着黑色长发，戴着细框眼镜。"}\nUSER_PERSONA_JSON:\n{}\nWORLD_INFO_TEXT:\n\n【上下文结束】';
    const disk = new Map();
    globalThis.localStorage = { getItem: key => disk.get(key) ?? null, setItem: (key, value) => { if (pendingWriteFailure) throw new Error('quota'); disk.set(key, value); } };
    const journals = new Map(), sessions = new Map(), requests = [], commits = [];
    let failMode = '', failRequest = false;
    const origin = () => ({ startedAt: 123, lifecycleEpoch: state.runtimeLifecycleEpoch, characterKey: 'person-1', characterId: '0', characterAvatar: 'one.png', chatId: 'chat-one', archiveRevision: bank.archiveRevision, archivePresent: true, modeWriteFences: {} });
    const cache = {
        loadSession: mode => sessions.get(mode) || null,
        loadGenerationRecovery: (mode, _context, _cache, options = {}) => structuredClone(options.draftId ? journals.get(options.draftId) || null : [...journals.values()].find(row => row.identity.mode === mode) || null),
        buildControlledContextEnvelope: async () => controlledEnvelope,
        getCache: () => ({}), modeWriteFenceForCache: () => '',
        archiveBackupEntryForContext: () => ({ entryId: 'archive-original' }),
        saveGenerationRecovery: async (_context, _bank, mode, journal, itemOrigin) => journal ? journals.set(journal.draftId, structuredClone(journal)) : journals.delete(itemOrigin.generationRecoveryDraftId),
        commitSession: async (mode, session, chatId, itemOrigin) => {
            commits.push(structuredClone({ mode, session, chatId, origin: itemOrigin }));
            if (mode === failMode) throw new Error('disk full');
            assert.equal(itemOrigin.archiveRevision, 'rev-one');
            assert.equal(session.archiveRevision, 'rev-one');
            sessions.set(mode, structuredClone(session)); journals.delete(itemOrigin.generationRecoveryDraftId); return true;
        },
    };
    const contextApi = { currentCharacterGuard: () => context, getContext: () => context, getChatId: () => bank.chatId,
        captureTaskOrigin: origin, deferredCommitOriginMatchesContext: value => value.characterKey === 'person-1' && value.chatId === bank.chatId };
    const repository = { requireArchive: () => bank, getImportedMemory: () => bank };
    const coordinator = { isModeGenerating: () => false, generationTaskKeyForMode: mode => `mode:original:${mode}`,
        beginLogicalGenerationTask: () => ({}), bindLogicalGenerationTask: () => {}, finishLogicalGenerationTask: () => {} };
    const provider = {
        beginModeRecovery: async (mode, _context, memory, itemOrigin, options) => {
            const handle = await recovery.createGenerationRecovery({ origin: itemOrigin, mode, settingsIdentity: {}, existing: options.existing,
                continueRequested: !!options.existing, draftId: options.existing?.draftId || options.draftId,
                contentSnapshot: { fields: { name1: context.name1, name2: context.name2 }, memoryBank: structuredClone(memory), contentSettings: {} },
                assertCurrent: () => true, save: async journal => { if (journal) journals.set(journal.draftId, structuredClone(journal)); } });
            handle.journal.operation = structuredClone(options.operation);
            recovery.attachGenerationRecovery(itemOrigin, handle); itemOrigin.generationRecoveryDraftId = handle.journal.draftId;
            await recovery.persistGenerationRecovery(handle);
            handle.contentContext = context; return handle;
        },
        generationWorldInfoScanTerms: () => [], composeOutgoingGenerationPrompt: prompt => prompt,
        requestValidatedSegment: async (prompt, _label, options, validator) => recovery.withRecoverySegment(prompt, options, validator, async (_prompt, _options, accepted) => {
            requests.push(prompt); options.taskTrace.providerRequests++;
            if (failRequest) throw Object.assign(new Error('network interrupted'), { code: 'RMT_CONNECTION_FAILED' });
            const letter = { slot: 'daily', title: '窗边', greeting: '阿宁', body: '今晚窗开了一条缝，风是凉的，先把灯留着。', closing: '林深', letterIllustration: {
                version: 2, characterName: '林深', focus: 'person', visualFacts: [
                    { kind: 'hairLength', value: 'long', evidence: '林深留着黑色长发' },
                    { kind: 'hairColor', value: 'black', evidence: '林深留着黑色长发' },
                    { kind: 'marker', value: 'glasses', evidence: '戴着细框眼镜' },
                ], scene: { kind: 'lamp', evidence: '先把灯留着' },
            } };
            const song = { title: '窗边', vocalDescription: '低音', styleDescription: '钢琴慢板', stylePrompt: 'slow piano', lyrics: '[Verse 1]\n窗边有风\n[Chorus]\n把灯留着\n[End]' };
            const raw = prompt.includes('"modules"')
                ? { modules: { inbox: omitInbox ? null : { letters: [letter] }, themeSong: omitSong ? null : song } }
                : prompt.includes('LOCAL_MAIL_PLAN') ? { letters: [letter] } : song;
            const output = validator(raw); await accepted(raw); return output;
        }),
    };
    const overrides = { '../core/cache.js': cache, '../core/context.js': contextApi, '../archive/repository.js': repository,
        '../core/requestCoordinator.js': coordinator, '../core/settings.js': { getPluginSettings: () => ({ maxTokens: 60000, inputBudgetTokens: 60000 }) },
        '../core/taskTrace.js': { startTaskTrace: () => ({ providerRequests: 0 }), endTaskTrace: () => {} }, './client.js': provider };
    const merged = await load('../src/generation/mergedGeneration.js', overrides);
    const client = await load('../src/generation/client.js', { ...overrides, './mergedGeneration.js': merged });
    return { bank, merged, client, journals, sessions, requests, commits,
        failSave: mode => { failMode = mode; }, failRequest: value => { failRequest = value; }, pendingWriteFailure: value => { pendingWriteFailure = value; },
        omitSong: value => { omitSong = value; }, omitInbox: value => { omitInbox = value; }, envelope: value => { controlledEnvelope = value; } };
}

test('real startTogether + repairPending preserve original ownership and save without a request', async () => {
    const f = await fixture(); f.failSave('themeSong');
    const result = await f.merged.startTogether(['inbox', 'themeSong'], { confirm: () => true });
    assert.equal(result.waiting.length, 1);
    assert.equal(f.requests.length, 1);
    const item = result.waiting[0];
    assert.equal(item.origin.archiveTargetEntryId, 'archive-original');
    assert.ok(item.origin.generationRecoveryDraftId);
    assert.equal(f.sessions.get('inbox').letters[0].illustration.version, 2);
    f.failSave('');
    await f.merged.repairPending('themeSong', item.id);
    assert.equal(f.requests.length, 1);
    assert.deepEqual(f.commits.at(-1).origin, item.origin);
    assert.equal(f.merged.createPendingStore().read('chat-one').length, 0);
});
test('actual Continue button dispatcher resumes the modules contract with frozen song ID', async () => {
    const f = await fixture(); f.failRequest(true);
    await assert.rejects(f.merged.startTogether(['inbox', 'themeSong'], { confirm: () => true }));
    const before = [...f.journals.values()];
    assert.equal(before.length, 2);
    const inboxJournal = before.find(row => row.identity.mode === 'inbox');
    assert.match(JSON.parse(inboxJournal.frozenInputs['presentation:inbox']).characterEvidence, /黑色长发/);
    const frozenSong = before[0].operation.group.find(row => row.snapshot.route === 'themeSong').snapshot.plan.id;
    f.envelope('CHARACTER_CARD_JSON:\n{"name":"林深","description":"现在只有金色短发。"}\nUSER_PERSONA_JSON:\n{}\nWORLD_INFO_TEXT:\n\n【上下文结束】');
    f.failRequest(false);
    await f.client.continueSavedGeneration('inbox', { skipConfirm: true, draftId: before[0].draftId });
    assert.equal(f.requests.length, 2);
    assert.equal(f.requests[0], f.requests[1]);
    assert.equal(f.sessions.get('themeSong').songs[0].id, frozenSong);
    assert.equal(f.sessions.get('inbox').letters[0].illustration.visualFacts[0].value, 'long');
    assert.equal(f.journals.size, 0);
});
test('inbox repair validates v2 art with the original frozen envelope evidence', async () => {
    const f = await fixture(); f.omitInbox(true);
    const result = await f.merged.startTogether(['inbox', 'themeSong'], { confirm: () => true });
    const item = result.waiting.find(row => row.route === 'inbox');
    assert.ok(item);
    const journal = [...f.journals.values()].find(row => row.identity.mode === 'inbox');
    assert.match(JSON.parse(journal.frozenInputs['presentation:inbox']).characterEvidence, /黑色长发/);
    f.envelope('CHARACTER_CARD_JSON:\n{"name":"林深","description":"现在只有金色短发。"}\nUSER_PERSONA_JSON:\n{}\nWORLD_INFO_TEXT:\n\n【上下文结束】');
    f.omitInbox(false);
    await f.merged.repairPending('inbox', item.id);
    assert.equal(f.sessions.get('inbox').letters[0].illustration.visualFacts[0].value, 'long');
    assert.ok(!f.requests.at(-1).includes('"modules"'));
});
test('stale resave cannot relabel the result with a new archive revision', async () => {
    const f = await fixture(); f.failSave('themeSong');
    const result = await f.merged.startTogether(['inbox', 'themeSong'], { confirm: () => true });
    const count = f.commits.length; f.bank.archiveRevision = 'rev-two'; f.failSave('');
    await assert.rejects(f.merged.repairPending('themeSong', result.waiting[0].id), { code: 'RMT_MERGED_ORIGIN' });
    assert.equal(f.commits.length, count);
    assert.equal(f.requests.length, 1);
    assert.equal(f.merged.createPendingStore().read('chat-one')[0].session.archiveRevision, 'rev-one');
});

test('a failed pending index write recovers the original result then repairs only the missing page', async () => {
    const f = await fixture(); f.pendingWriteFailure(true); f.omitSong(true);
    await assert.rejects(f.merged.startTogether(['inbox', 'themeSong'], { confirm: () => true }), { code: 'RMT_MERGED_STORAGE' });
    assert.equal(f.requests.length, 1);
    assert.ok(f.sessions.get('inbox'));
    const songJournal = [...f.journals.values()].find(row => row.identity.mode === 'themeSong');
    assert.ok(songJournal.frozenInputs['merged:reply']);
    f.pendingWriteFailure(false); f.omitSong(false);
    await f.client.continueSavedGeneration('themeSong', { skipConfirm: true, draftId: songJournal.draftId });
    assert.equal(f.requests.length, 2);
    assert.ok(!f.requests[1].includes('"modules"'));
    assert.ok(f.sessions.get('themeSong'));
});
