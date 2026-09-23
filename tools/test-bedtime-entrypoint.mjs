// Run with: node --experimental-vm-modules --test tools/test-bedtime-entrypoint.mjs
// Production generateMode/recovery orchestration with in-memory host and provider seams.
import * as assert from 'node:assert/strict';
import * as testApi from 'node:test';
import * as vm from 'node:vm';
import * as fs from 'node:fs/promises';
import * as recovery from '../src/generation/recovery.js';
import * as bedtimeContract from '../src/core/bedtimeContract.js';
import * as participants from '../src/core/participants.js';
import * as coreState from '../src/core/state.js';

async function load(file, overrides) {
    const url = new URL(file, import.meta.url);
    const module = new vm.SourceTextModule(await fs.readFile(url, 'utf8'), { identifier: url.href });
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
    const bank = {
        version: 3, chatId: 'bed-chat', archiveRevision: 'bed-rev', characterName: '群像卡', userName: '读者',
        memories: [], archiveSummary: '', archiveKeywords: [],
        participantsV1: { version: 1, cardType: 'multi', revision: 'roster-a', people: [
            { id: 'a', name: '岚', identity: 'character', selected: true, sourceRefs: [] },
            { id: 'b', name: '澄', identity: 'character', selected: false, sourceRefs: [] },
        ], selectedIds: ['a'] },
    };
    const context = { name1: '读者', name2: '群像卡', characterId: 0, chatMetadata: {}, powerUserSettings: { persona_description: '' },
        getCharacterCardFields: () => ({ name: '群像卡' }) };
    const sessions = new Map(), journals = new Map(), journalHistory = [], requests = [];
    let failRequest = false;
    const origin = () => ({ startedAt: 123, lifecycleEpoch: coreState.state.runtimeLifecycleEpoch,
        characterKey: 'card-1', characterId: '0', characterAvatar: 'card.png', chatId: bank.chatId,
        archiveRevision: bank.archiveRevision, archivePresent: true, modeWriteFences: {} });
    let logical = null;
    const coordinator = {
        beginLogicalGenerationTask: input => { logical = { ...input }; return logical; },
        bindLogicalGenerationTask: (task, taskOrigin, values = {}) => { if (task) Object.assign(task, values, { origin: taskOrigin }); },
        finishLogicalGenerationTask: () => { logical = null; },
        logicalGenerationTaskForOrigin: () => logical,
        assertLogicalGenerationTaskCurrent: () => true,
        isLogicalGenerationTaskCurrent: () => true,
        isModeGenerating: () => false,
        canStartGenerationTask: () => true,
        generationTaskKeyForMode: mode => `mode:bed-chat:${mode}`,
        registerArchiveTargetReservation: () => {}, unregisterArchiveTargetReservation: () => {},
        refreshConcurrentTaskUi: () => {}, noteChatTaskPhase: () => {}, rememberStandaloneChatTask: () => {},
        chatScopeCancellationBlocksOrigin: () => false, activeLogicalGenerationKeys: () => new Set(),
        activeModeBuildScopeForTask: () => '', advBulkReservationKeyForTask: () => '',
    };
    const cacheObject = () => ({ chatId: bank.chatId, archiveRevision: bank.archiveRevision,
        ...(sessions.has('bedtime') ? { bedtime: structuredClone(sessions.get('bedtime')) } : {}) });
    const cache = {
        loadSession: mode => sessions.has(mode) ? structuredClone(sessions.get(mode)) : null,
        loadGenerationRecovery: (mode, _context, _cache, options = {}) => structuredClone(options.draftId
            ? journals.get(options.draftId) || null : [...journals.values()].find(row => row.identity.mode === mode) || null),
        getCache: cacheObject,
        claimLiveModeGeneration: async () => true,
        modeWriteFenceForCache: () => '', modeWriteFenceSignature: () => '',
        archiveBackupEntryForContext: () => ({ entryId: 'archive-bed', chatId: bank.chatId }),
        buildControlledContextEnvelope: async (_context, options = {}) => `FROZEN:${JSON.stringify(options.participantSnapshot || null)}`,
        readParticipantRoster: () => structuredClone(bank.participantsV1),
        saveGenerationRecovery: async (_context, _bank, _mode, journal, itemOrigin) => {
            if (journal) { journals.set(journal.draftId, structuredClone(journal)); journalHistory.push(structuredClone(journal)); }
            else journals.delete(itemOrigin.generationRecoveryDraftId);
            return true;
        },
        saveGenerationTaskResult: async (_context, mode, session) => ({ draftId: session.readableProgress?.draftId || `partial-${mode}` }),
        commitSession: async (mode, incoming, _chatId, itemOrigin) => {
            assert.equal(itemOrigin.archiveRevision, 'bed-rev');
            const saved = mode === 'bedtime' ? bedtimeContract.mergeBedtime(sessions.get(mode) || null, incoming) : incoming;
            sessions.set(mode, structuredClone(saved)); journals.delete(itemOrigin.generationRecoveryDraftId); return true;
        },
    };
    const contextApi = {
        currentCharacterGuard: () => context, getContext: () => context, getChatId: () => bank.chatId,
        captureTaskOrigin: origin, assertRuntimeLifecycleCurrent: () => {}, runtimeLifecycleStillCurrent: () => true,
        isCurrentTaskOrigin: () => true, deferredCommitOriginMatchesContext: value => value?.chatId === bank.chatId,
        comparableChatId: value => String(value || ''), stableArchiveHash: value => String(value).length.toString(36),
        chatScopeKey: () => 'scope-bed', currentCharacterRuntimeKey: () => 'owner-bed', yieldToUi: async () => {},
    };
    const repository = { requireArchive: () => bank, getImportedMemory: () => bank,
        collectSelectedMemoryWorldInfo: async () => ({ entries: [], coverage: { status: 'complete' } }) };
    const provider = {
        requestValidatedSegment: async (prompt, _label, options, validator) => {
            const task = coordinator.logicalGenerationTaskForOrigin(options.origin);
            if (task?.participantSnapshot) prompt += participants.participantPromptBlock(task.participantSnapshot);
            return recovery.withRecoverySegment(prompt, options, validator, async (_prompt, _options, accepted) => {
                requests.push(prompt);
                if (failRequest) throw Object.assign(new Error('mock provider interrupted'), { code: 'RMT_CONNECTION_FAILED' });
                const continuation = prompt.includes('只续写下一章');
                const raw = continuation
                    ? { ignoredProviderField: 'must not persist', chapter: { title: '第二夜', text: '  第二章第一行\r\n\r\n第二章末行  '.repeat(12) } }
                    : { ignoredProviderField: 'must not persist', title: '失重夜航', genre: '太空悬疑', premise: '维修员追查一段消失的航迹。',
                        chapter: { title: '第一夜', text: '  第一章第一行\r\n\r\n第一章末行  '.repeat(12) } };
                const normalized = validator(raw); await accepted(raw); return normalized;
            });
        },
    };
    const taskTrace = { startTaskTrace: () => ({}), markStage: () => {}, beginStage: () => {}, endTaskTrace: () => {}, recordTaskFailure: () => {} };
    const overlay = { confirmExplicitAction: () => true, openOverlay: () => {}, setInnerLoading: () => {}, renderActive: () => {},
        showChooser: () => {}, showInlineError: () => {}, showInlinePreflight: () => {}, presentGenerationTaskResult: async () => {}, refreshPartialGenerationView: async () => {} };
    const overrides = {
        '../core/cache.js': cache, '../core/context.js': contextApi, '../archive/repository.js': repository,
        '../core/requestCoordinator.js': coordinator, '../core/settings.js': { getPluginSettings: () => ({ maxTokens: 6500, inputBudgetTokens: 60000, cgPromptFormat: 'nai5-natural' }) },
        '../core/taskTrace.js': taskTrace, '../ui/overlay.js': overlay,
        '../ui/settingsPanel.js': { refreshSettingsTaskStatus: () => {}, refreshSettingsMemoryStatus: () => {} },
        '../archive/snapshots.js': { scheduleChooserRefresh: () => {} },
        '../ui/navigationBookmark.js': { readingPosition: session => ({ selectedId: session?.selectedId || '', chapterIndex: session?.chapterIndex || 0 }) },
        '../core/recoverySourcePolicy.js': { recoverySettingsIdentity: () => 'settings', recoverySourceValues: () => ({}),
            assertRecoverySourcePolicy: async () => {}, recoverySourcePolicy: async () => ({}) },
        './cgPromptPolicy.js': { cgRecoveryOperation: (_mode, operation) => operation, bindCgPromptFormat: () => {},
            cgPromptForSegment: prompt => prompt, cgSegmentValidator: validator => validator },
    };
    const bedtime = await load('../src/modes/bedtime.js', { ...overrides, '../generation/client.js': provider });
    const client = await load('../src/generation/client.js', { ...overrides, '../modes/bedtime.js': bedtime });
    return { bank, client, sessions, journals, journalHistory, requests,
        fail(value) { failRequest = value; },
    };
}

testApi.test('public generateMode saves a story, filters provider fields and preserves exact chapter whitespace', async () => {
    globalThis.document = { getElementById: () => ({ hidden: true }) };
    globalThis.toastr = { info() {}, success() {}, error() {} };
    const f = await fixture();
    await f.client.generateMode('bedtime', { bedtimeOptions: { direction: '太空悬疑，不要童话' } });
    const saved = f.sessions.get('bedtime');
    assert.equal(saved.stories.length, 1);
    assert.equal(saved.stories[0].chapters[0].text.startsWith('  第一章'), true);
    assert.equal(saved.stories[0].chapters[0].text.includes('\r\n\r\n'), true);
    assert.equal(Object.hasOwn(saved.stories[0], 'ignoredProviderField'), false);
    const frozen = f.journalHistory.find(row => row.identity.mode === 'bedtime' && row.frozenInputs?.['participants:mode']);
    assert.ok(frozen);
    assert.deepEqual(JSON.parse(frozen.frozenInputs['participants:mode']).people.map(person => person.id), ['a']);
    assert.match(f.requests[0], /UNTRUSTED_SELECTED_PARTICIPANTS_JSON/u);
});

testApi.test('public continuation resumes the frozen plan and participants after interruption', async () => {
    globalThis.document = { getElementById: () => ({ hidden: true }) };
    globalThis.toastr = { info() {}, success() {}, error() {} };
    const f = await fixture();
    await f.client.generateMode('bedtime', { bedtimeOptions: { direction: '太空悬疑' } });
    const storyId = f.sessions.get('bedtime').stories[0].id;
    f.fail(true);
    await f.client.generateMode('bedtime', { bedtimeOptions: { action: 'continue', storyId, direction: '查明导航记录' } });
    const journal = [...f.journals.values()].find(row => row.identity.mode === 'bedtime');
    assert.ok(journal);
    const frozenPlan = structuredClone(journal.operation.bedtimePlan);
    const failedPrompt = f.requests.at(-1);
    f.bank.participantsV1.people[0].selected = false;
    f.bank.participantsV1.people[1].selected = true;
    f.bank.participantsV1.selectedIds = ['b'];
    f.fail(false);
    await f.client.continueSavedGeneration('bedtime', { skipConfirm: true, draftId: journal.draftId });
    const saved = f.sessions.get('bedtime');
    assert.equal(saved.stories[0].chapters.length, 2);
    assert.equal(saved.stories[0].chapters[1].id, frozenPlan.chapterId);
    assert.equal(saved.stories[0].chapters[0].title, '第一夜');
    assert.equal(f.requests.at(-1), failedPrompt);
    assert.equal(f.journals.size, 0);
});

testApi.test('legacy recovery without generic participant input remains byte-compatible', async () => {
    const f = await fixture();
    const legacy = { frozenInputs: {}, operation: { kind: 'mode', mode: 'bedtime' } };
    const result = await f.client.captureModeParticipantSnapshot('bedtime', {}, {}, { existing: legacy, memoryBank: f.bank });
    assert.equal(result, null);
    assert.deepEqual(legacy.frozenInputs, {});
});
