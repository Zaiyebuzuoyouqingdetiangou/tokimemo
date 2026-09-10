import test from 'node:test';
import assert from 'node:assert/strict';
import * as cache from '../src/core/cache.js';
import * as constants from '../src/core/constants.js';
import * as ctx from '../src/core/context.js';
import { state } from '../src/core/state.js';
import { generateConfiguredJson } from '../src/generation/client.js';
import { stopsCompositeGeneration } from '../src/core/requestCoordinator.js';
import { rewriteCurrentArchiveVerdict } from '../src/archive/repository.js';
import { generatePhoneWithRepair, normalizePhonePlan, normalizePhoneDraftApp, assertPhoneReplacementPreservesRecords } from '../src/modes/phone.js';
import { generateHeartSeasonSection } from '../src/modes/heart.js';
import { regenerateManagedTarget } from '../src/generation/contentRegeneration.js';
import { setArchiveBackupBackendForTests } from './testingFacade.mjs';

const evidence = '晚间聊天，林舟问小雨：“明天还来吗？”小雨回答：“我会等你。”';
const verdict = { archiveName: '雨停之前', archiveVerdict: '把等待留在雨声里，把明天留给还没有说完的话。',
    relationshipReading: { char: '他愿意等候', user: '她答应再见', relation: '已约好再见，未确认恋爱' },
    verdictSources: [{ memoryId: 'M001', anchor: '晚间聊天' }], keywords: ['等候'] };
const app = { id: 'CHAT', label: '通讯', kind: 'chat', entries: [{ id: 'C1', title: '晚间聊天' }] };
const entry = { id: 'C1', title: '晚间聊天', preview: '晚间聊天', basis: '记忆', sourceMemoryIds: ['M001'],
    sourceMemoryAnchor: '晚间聊天', sourceMemoryEvidence: evidence, contactName: '小雨', messages: [
        { speakerRole: 'owner', speaker: '林舟', text: '明天还来吗？' }, { speakerRole: 'contact', speaker: '小雨', text: '我会等你。' },
    ] };
let serial = 0;
function fixture(handler = async () => ({ content: JSON.stringify(verdict) })) {
    const context = { characterId: 0, groupId: null, chatId: 'r55-' + ++serial, name1: '小雨', name2: '林舟',
        characters: [{ name: '林舟', avatar: 'fixture.png' }], chat: [], chatMetadata: {},
        extensionSettings: { heartbeatMemories: { apiConnectionMode: 'profile', connectionProfileId: 'p', useCurrentChatExternalMemory: false, bannedGeneratedPhrases: [] },
            connectionManager: { profiles: [{ id: 'p', mode: 'cc', api: 'custom', model: 'fixture', 'secret-id': 'test-reference' }] } },
        saveSettingsDebounced() {}, saveMetadataDebounced() {}, getRequestHeaders: () => ({}),
        ConnectionManagerRequestService: {
            getSupportedProfiles() { return []; }, validateProfile() { return { selected: 'openai', source: 'custom' }; },
            sendRequest(profileId, messages, maxTokens, options, overridePayload) {
                const profile = { model: 'fixture', 'secret-id': 'test-reference' };
                const payload = { secret_id: profile['secret-id'], model: profile.model, ...overridePayload };
                return handler({ profileId, messages, maxTokens, options, payload });
            },
        },
    };
    const bank = { version: 3, chatId: context.chatId, archiveRevision: 'rev-A', characterName: '林舟', userName: '小雨',
        archiveName: '旧标题', archiveSummary: evidence, sourceMessageCount: 2, sourceFingerprint: 'unchanged',
        memories: [{ id: 'M001', title: '晚间聊天', anchors: ['晚间聊天'], summary: evidence }] };
    context.chatMetadata[constants.MEMORY_KEY] = bank;
    const records = new Map();
    setArchiveBackupBackendForTests({
        async read(entry) { return structuredClone(records.get(entry.entryId) || null); },
        async put(record, expected) {
            const old = records.get(record.entryId);
            if (old && expected?.present && old.archiveRevision !== expected.revision) throw new Error('CAS mismatch');
            records.set(record.entryId, structuredClone(record)); return true;
        },
        async delete() {},
    });
    globalThis.SillyTavern = { getContext: () => context };
    globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
    state.busy = false; state.activeMode = null; state.activeSession = null; state.activeArchiveSnapshot = null;
    state.activeArchiveReadOnly = false; state.archiveViewLevel = 'library';
    state.activeGenerationTasks.clear(); state.activeModeBuildScopes.clear();
    return { context, bank, records, origin: ctx.captureTaskOrigin(context, bank.archiveRevision) };
}
test.afterEach(() => {
    delete globalThis.SillyTavern; delete globalThis.document; delete globalThis.toastr;
    setArchiveBackupBackendForTests(null);
    state.busy = false; state.activeSession = null; state.activeMode = null;
    state.activeGenerationTasks.clear(); state.activeModeBuildScopes.clear();
});

test('r55 public profile generation classifies HTTP200 error envelopes before composite decisions', async () => {
    for (const [status, code] of [[401, 'RMT_CONNECTION_AUTH'], [429, 'RMT_CONNECTION_RATE_LIMIT']]) {
        const { context } = fixture(async () => ({ error: { code: status, message: 'private-body' } }));
        await assert.rejects(generateConfiguredJson('fixture', { context, contextEnvelope: '', skipTokenCount: true }), error => {
            assert.equal(error.code, code); assert.equal(stopsCompositeGeneration(error), true); return true;
        });
    }
});

test('r55 only rewriting the verdict preserves memory history, cache content and a draft-only cache', async () => {
    for (const withSession of [false, true]) {
        const { context, bank, origin } = fixture();
        const plan = normalizePhonePlan({ deviceKind: 'folio', apps: [app] }, bank);
        await cache.savePhoneGenerationDraft(context, bank, plan, [], 'CHAT', '', origin, { failure: { code: 'RMT_CONNECTION_AUTH', message: 'secret' } });
        if (withSession) cache.getCache(context).album = { kind: 'album', archiveRevision: bank.archiveRevision, entries: [{ id: 'OLD', image: 'saved-image', text: 'old-content' }] };
        const before = structuredClone(bank), draft = structuredClone(cache.getCache(context)[constants.PHONE_DRAFT_CACHE_KEY]);
        const result = await rewriteCurrentArchiveVerdict();
        assert.equal(result.status, 'committed');
        const after = context.chatMetadata[constants.MEMORY_KEY];
        assert.equal(after.archiveVerdict.text, verdict.archiveVerdict);
        for (const [key, value] of Object.entries(before)) if (key !== 'archiveName') assert.deepEqual(after[key], value, key);
        assert.deepEqual(cache.getCache(context)[constants.PHONE_DRAFT_CACHE_KEY], draft);
        if (withSession) assert.equal(cache.getCache(context).album.entries[0].image, 'saved-image');
        await assert.rejects(cache.saveImportedMemory(context, { ...after, memories: [] }, bank.chatId,
            { presentationOnly: true, preserveDerivedCache: true, expectedTaskOrigin: origin,
                expectedPreviousArchiveState: { present: true, revision: bank.archiveRevision } }), error => error.code === 'RMT_ARCHIVE_VERDICT');
    }
});

test('r55 a late verdict cannot land after switching chats or changing the archive revision', async () => {
    for (const change of ['chat', 'revision']) {
        let release, entered;
        const arrived = new Promise(resolve => { entered = resolve; });
        const { context, bank } = fixture(async () => { entered(); return new Promise(resolve => { release = resolve; }); });
        const before = structuredClone(bank);
        const pending = rewriteCurrentArchiveVerdict(); await arrived;
        if (change === 'chat') context.chatId = 'B';
        else bank.archiveRevision = 'rev-B';
        release({ content: JSON.stringify(verdict) });
        assert.equal((await pending).status, 'failed');
        assert.equal(bank.archiveVerdict, undefined); assert.deepEqual(bank.memories, before.memories);
    }
});

test('r55 terminal saves safe failure, roundtrips, and requests only unfinished apps on resume', async () => {
    let calls = 0;
    const second = { id: 'NOTES', kind: 'notes', label: '备忘', entries: [{ id: 'N1', title: '晚间聊天' }] };
    let recover = false;
    const { context, bank, origin } = fixture(async () => {
        calls++;
        if (!recover) return { error: { code: 401, message: 'private-secret' } };
        return { content: JSON.stringify({ id: 'NOTES', entries: [{ ...entry, id: 'N1', messages: [], detail: '记住明天再见的约定。' }] }) };
    });
    const plan = normalizePhonePlan({ deviceKind: 'folio', apps: [app, second] }, bank);
    const done = normalizePhoneDraftApp({ id: 'CHAT', entries: [entry] }, plan.apps[0], bank, 'folio');
    await cache.savePhoneGenerationDraft(context, bank, plan, [done], '', '', origin);
    await assert.rejects(generatePhoneWithRepair(context, bank, origin, 'r55-resume', { continueDraft: true }),
        error => error.code === 'RMT_PHONE_DRAFT_AVAILABLE' && error.failure.code === 'RMT_CONNECTION_AUTH');
    assert.equal(calls, 1);
    const rawCache = cache.getCache(context);
    rawCache[constants.PHONE_DRAFT_CACHE_KEY] = JSON.parse(JSON.stringify(rawCache[constants.PHONE_DRAFT_CACHE_KEY]));
    const saved = cache.loadPhoneGenerationDraft(context, bank);
    assert.equal(saved.completedApps.length, 1); assert.equal(saved.failure.code, 'RMT_CONNECTION_AUTH');
    assert.doesNotMatch(JSON.stringify(saved), /private-secret/);
    recover = true;
    const result = await generatePhoneWithRepair(context, bank, origin, 'r55-recovered', { continueDraft: true });
    assert.equal(calls, 2); assert.deepEqual(result.apps[0].entries[0].messages, done.entries[0].messages);
    assert.equal(result.apps.length, 2);
});

test('r55 entirely unavailable roundtripped drafts do not deadlock on N/N completion', async () => {
    let calls = 0;
    const { context, bank, origin } = fixture(async () => { calls++; return { content: JSON.stringify({ id: 'CHAT', entries: [entry] }) }; });
    const plan = normalizePhonePlan({ deviceKind: 'folio', apps: [app] }, bank);
    const empty = normalizePhoneDraftApp({ id: 'CHAT', entries: [{ id: 'C1', unavailable: true }] }, plan.apps[0], bank, 'folio');
    await cache.savePhoneGenerationDraft(context, bank, plan, [empty], '', '', origin);
    const saved = cache.loadPhoneGenerationDraft(context, bank);
    assert.equal(saved.completedApps.length, 0); assert.equal(saved.failure.code, 'RMT_PHONE_SOURCE_EMPTY');
    const result = await generatePhoneWithRepair(context, bank, origin, 'r55-empty', { continueDraft: true });
    assert.equal(calls, 1); assert.equal(result.apps[0].entries[0].messages.length, 2);
});

test('r55 single-item and app replacement cannot erase valid records with unavailable placeholders', () => {
    const previous = { entries: [entry] };
    const replacement = { entries: [{ id: entry.id, sourceStatus: 'unavailable' }] };
    assert.throws(() => assertPhoneReplacementPreservesRecords(previous, replacement), error => error.code === 'RMT_PHONE_EVIDENCE');
    assert.equal(assertPhoneReplacementPreservesRecords(replacement, replacement), replacement);
});

test('r55 quoted chat cannot swap speakers or clone one persons phrase to simulate two sides', () => {
    const { bank } = fixture();
    for (const messages of [[{ ...entry.messages[0], text: entry.messages[1].text }, { ...entry.messages[1], text: entry.messages[0].text }],
        [{ ...entry.messages[0], text: entry.messages[1].text }, entry.messages[1]]]) {
        assert.throws(() => normalizePhoneDraftApp({ id: 'CHAT', entries: [{ ...entry, messages }] }, app, bank, 'folio'));
    }
});

test('r55 Heart authentication failure stops before the sibling Scenario request', async () => {
    let calls = 0;
    const failures = [];
    const { context, bank } = fixture(async () => { calls++; return { error: { code: 401, message: 'private-secret' } }; });
    globalThis.toastr = { error(message) { failures.push(message); }, info() {}, warning() {} };
    state.activeMode = 'heart';
    state.activeSession = { kind: 'heart', chatId: context.chatId, archiveRevision: bank.archiveRevision,
        relationshipSummary: '两人约好再见', relationshipState: '相识', voiceDramas: [], scenarioDramas: [] };
    cache.getCache(context).heart = structuredClone(state.activeSession);
    await generateHeartSeasonSection('spring');
    assert.equal(calls, 1, failures.join('\n'));
    assert.ok(failures.some(message => /认证/.test(message)));
    assert.doesNotMatch(failures.join(''), /private-secret/);
});

test('r55 Heart rate limit retries only the failed part once, then stops; validation may continue a sibling', async () => {
    for (const [kind, expected] of [['rate', 2], ['validation', 4]]) {
        let calls = 0;
        const { context, bank } = fixture(async () => { calls++; return kind === 'rate' ? { error: { code: 429 } } : { content: '{}' }; });
        state.activeMode = 'heart';
        state.activeSession = { kind: 'heart', chatId: context.chatId, archiveRevision: bank.archiveRevision,
            relationshipSummary: '两人约好再见', relationshipState: '相识', voiceDramas: [], scenarioDramas: [] };
        cache.getCache(context).heart = structuredClone(state.activeSession);
        await generateHeartSeasonSection('spring');
        assert.equal(calls, expected, kind);
    }
});

test('r55 resumed terminal cannot silently drop an already completed app when setting sources change', async () => {
    let calls = 0;
    const { context, bank, origin } = fixture(async () => { calls++; throw new Error('must not request'); });
    const setting = '林舟习惯把纸页放在窗边。';
    const second = { id: 'NOTES', kind: 'notes', label: '备忘', entries: [{ id: 'N1', title: '纸页' }] };
    const plan = normalizePhonePlan({ deviceKind: 'folio', apps: [app, second] }, bank);
    const chat = normalizePhoneDraftApp({ id: 'CHAT', entries: [entry] }, plan.apps[0], bank, 'folio');
    const notes = normalizePhoneDraftApp({ id: 'NOTES', entries: [{ id: 'N1', title: '纸页', preview: '窗边', detail: setting,
        basis: '设定', sourceSettingEvidence: setting }] }, plan.apps[1], bank, 'folio', null, { controlledEvidence: setting });
    await cache.savePhoneGenerationDraft(context, bank, plan, [chat, notes], '', '', origin);
    await assert.rejects(generatePhoneWithRepair(context, bank, origin, 'r55-source-change', { continueDraft: true,
        presentationContext: { settingEvidence: '林舟现在把纸页收进抽屉。' } }), error => error.code === 'RMT_PHONE_SOURCE_CHANGED');
    assert.equal(calls, 0);
    assert.equal(cache.loadPhoneGenerationDraft(context, bank).completedApps.length, 2);
    const restored = await generatePhoneWithRepair(context, bank, origin, 'r55-source-restored', { continueDraft: true,
        presentationContext: { settingEvidence: setting } });
    assert.equal(restored.apps.length, 2);
});

test('r55 quotation attribution rejects a listener and accepts explicitly named group participants', () => {
    const { bank } = fixture();
    const indirect = '林舟听见小雨说：“我会等你。”小雨补充说：“路上小心。”';
    const indirectBank = { ...bank, memories: [{ ...bank.memories[0], summary: indirect }] };
    assert.throws(() => normalizePhoneDraftApp({ id: 'CHAT', entries: [{ ...entry, sourceMemoryEvidence: indirect,
        messages: [{ speakerRole: 'owner', speaker: '林舟', text: '我会等你。' }, { speakerRole: 'contact', speaker: '小雨', text: '路上小心。' }] }] }, app, indirectBank, 'folio'));
    const direct = '林舟说：“明天见。”小雨说：“我会等你。”老周说：“门口集合。”';
    const directBank = { ...bank, memories: [{ ...bank.memories[0], summary: direct }] };
    const result = normalizePhoneDraftApp({ id: 'CHAT', entries: [{ ...entry, sourceMemoryEvidence: direct,
        messages: [{ speakerRole: 'owner', speaker: '林舟', text: '明天见。' }, { speakerRole: 'contact', speaker: '小雨', text: '我会等你。' },
            { speakerRole: 'contact', speaker: '老周', text: '门口集合。' }] }] }, app, directBank, 'folio');
    assert.equal(result.entries[0].messages[2].speaker, '老周');
});

test('r55 terminal targeted regeneration stops before provider if chat changes during worldbook read', async () => {
    for (const type of ['phone-entry', 'phone-app']) {
        let calls = 0, release, entered;
        const waiting = new Promise(resolve => { entered = resolve; });
        const { context, bank, origin } = fixture(async () => { calls++; return { content: '{}' }; });
        context.getWorldInfoPrompt = async () => { entered(); return new Promise(resolve => { release = resolve; }); };
        const before = { kind: 'phone', deviceKind: 'folio', apps: [{ ...app, entries: [entry] }] };
        const pending = regenerateManagedTarget(before, type, type === 'phone-entry' ? entry.id : app.id, app.id,
            { context, memoryBank: bank, origin, taskKey: 'r55-targeted' });
        await waiting;
        globalThis.SillyTavern = { getContext: () => ({ ...context, chatId: 'B', name2: '另一角色' }) };
        release({ worldInfoString: 'B_WORLD_INFO_SENTINEL' });
        await assert.rejects(pending, error => error.name === 'AbortError');
        assert.equal(calls, 0); assert.deepEqual(before.apps[0].entries[0], entry);
    }
});

test('r55 real targeted replacement pipeline rejects an empty result without changing the old record', async () => {
    for (const type of ['phone-entry', 'phone-app']) {
        let calls = 0;
        const { context, bank, origin } = fixture(async () => { calls++; return { content: JSON.stringify({ id: 'CHAT', entries: [{ id: 'C1', unavailable: true }] }) }; });
        const before = { kind: 'phone', deviceKind: 'folio', apps: [{ ...app, entries: [entry] }] };
        await assert.rejects(regenerateManagedTarget(before, type, type === 'phone-entry' ? entry.id : app.id, app.id,
            { context, memoryBank: bank, origin, taskKey: 'r55-no-erase' }), error => error.code === 'RMT_PHONE_EVIDENCE');
        assert.equal(calls, 2); assert.deepEqual(before.apps[0].entries[0], entry);
    }
});
