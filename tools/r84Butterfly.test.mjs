import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const source = process.env.R84_BUTTERFLY_BASELINE
    ? pathToFileURL(`${process.env.R84_BUTTERFLY_BASELINE}/src/`)
    : new URL('../src/', import.meta.url);
const butterfly = await import(new URL('modes/butterfly.js', source));
const recovery = await import(new URL('generation/recovery.js', source));
const prompts = await import(new URL('generation/prompts.js', source));
const legacy = await import(new URL('core/butterflyLegacyRecovery.js', source));
const regeneration = await import(new URL('generation/contentRegeneration.js', source));
const constants = await import(new URL('core/constants.js', source));
const coordinator = await import(new URL('core/requestCoordinator.js', source));
const trace = await import(new URL('core/taskTrace.js', source));
const { state } = await import(new URL('core/state.js', source));

const context = { name1: '乙', name2: '甲' };
const bank = { chatId: 'butterfly-chat', archiveRevision: 'butterfly-revision', memories: [
    { id: 'M001', title: '雨夜重逢', anchors: ['车站重逢'], summary: '两人在车站重逢。' },
] };
const taskKey = 'butterfly-fixture';

function rawNode(kind, branchAxes = ['decision']) {
    if (kind === 'MAIN') return { id: 'MAIN', label: '主时间线：雨夜重逢', branchAxes,
        sourceMemoryIds: ['M001'], sourceMemoryAnchor: '车站重逢', monologue: '我记得那盏灯。',
        intervention: '这次，留下。', systemNote: '主线已锁定。' };
    if (kind === 'OMEGA') return { id: 'OMEGA', label: '观测点 Ω：灯仍亮着', monologue: '',
        intervention: '走过那些岔路，仍然想回到你身边。', systemNote: '观测结束。' };
    return { label: `分歧：${kind} 的另一条路`, primaryAxis: kind, sourceMemoryIds: [], sourceMemoryAnchor: '',
        monologue: `我留在了${kind}的另一端。`, intervention: '看见另一个自己，才明白今天的选择。',
        systemNote: '路径封存。', worldSpec: { primaryAxis: kind, era: '暮春时节', identity: '车站旅人',
            occupation: '列车司机', location: '北方车站', keyDecision: `选择${kind}远行`,
            encounterWithUser: '在月台错过乙', bondWithUser: '仍然记得乙', finalFate: '独自在异乡生活', thirdPartyRomance: false } };
}

async function fixture(t, { existing, assertCurrent = () => true } = {}) {
    const origin = { characterKey: 'butterfly-character', characterId: '0', characterAvatar: 'butterfly.png', ...bank };
    const makeHandle = existing => recovery.createGenerationRecovery({ origin, mode: 'butterfly', settingsIdentity: 'fixture-settings',
        existing, continueRequested: !!existing, save: async () => true, assertCurrent });
    let handle = await makeHandle(existing);
    recovery.attachGenerationRecovery(origin, handle);
    t.after(() => recovery.detachGenerationRecovery(origin));
    const sent = [], validated = [], receivedPrompts = [];
    let failKind = '', axes = ['decision'];
    const request = (prompt, _status, options, validator) => {
        const kind = JSON.parse(prompt.match(/CURRENT_SLOT_JSON:([^\n]+)/u)[1]).kind;
        receivedPrompts.push({ kind, prompt, options });
        return recovery.withRecoverySegment(prompt, options, raw => { validated.push(kind); return validator(raw); },
            async (_prompt, _options, accepted) => {
                sent.push(kind);
                if (kind === failKind) throw Object.assign(new Error('fixture interrupted'), { code: 'RMT_CONNECTION_FAILED' });
                const raw = { node: rawNode(kind, axes) };
                const value = validator(raw);
                validated.push(kind);
                await accepted(raw);
                return value;
            });
    };
    return { origin, sent, validated, receivedPrompts, request,
        set axes(value) { axes = value; }, set failKind(value) { failKind = value; },
        snapshot: () => recovery.generationRecoverySnapshot(handle),
        async resume(existing = recovery.generationRecoverySnapshot(handle)) {
            handle = await makeHandle(existing); recovery.attachGenerationRecovery(origin, handle);
            sent.length = 0; validated.length = 0; receivedPrompts.length = 0;
        },
        generate: () => butterfly.generateButterflyWithRepair(context, bank, origin, taskKey, { request, contextEnvelope: '' }),
    };
}

test('fresh butterfly generation honors MAIN branch selection instead of treating an empty journal as legacy', async t => {
    const f = await fixture(t);
    const result = await f.generate();
    assert.deepEqual(f.sent, ['MAIN', 'decision', 'OMEGA']);
    assert.deepEqual(result.nodes.map(node => node.id === 'MAIN' || node.id === 'OMEGA' ? node.id : node.primaryAxis),
        ['MAIN', 'decision', 'OMEGA']);
});

test('fresh empty branch selection still produces one divergence without requesting eight compulsory branches', async t => {
    const f = await fixture(t); f.axes = [];
    const result = await f.generate();
    assert.deepEqual(f.sent, ['MAIN', 'decision', 'OMEGA']);
    assert.equal(result.nodes.length, 3);
});

test('manual continuation revalidates successful segments locally and sends only the unfinished work', async t => {
    const f = await fixture(t); f.failKind = 'decision';
    await assert.rejects(f.generate(), { code: 'RMT_CONNECTION_FAILED' });
    assert.deepEqual(f.sent, ['MAIN', 'decision']);
    assert.equal(f.snapshot().segments.filter(segment => segment.state === 'complete').length, 1);
    await f.resume(); f.failKind = '';
    const result = await f.generate();
    assert.deepEqual(f.sent, ['decision', 'OMEGA']);
    assert.ok(f.validated.includes('MAIN'));
    await f.resume();
    assert.deepEqual(await f.generate(), result);
    assert.deepEqual(f.sent, []);
    assert.deepEqual(f.validated, ['MAIN', 'decision', 'OMEGA']);
});

test('restored narrative applies to fresh and incremental prompts without rejecting readable short saved prose', () => {
    const previous = butterfly.normalizeButterfly({ nodes: [rawNode('MAIN'), rawNode('decision'), rawNode('OMEGA')] }, bank, context);
    for (const prompt of [prompts.PROMPTS.butterfly(context, bank), butterfly.butterflyIncrementPrompt(context, bank, previous, ['M001'])]) {
        assert.match(prompt, /第一人称/u);
        assert.match(prompt, /冷酷/u);
        assert.match(prompt, /汇合|汇总/u);
        assert.match(prompt, /情绪|余韵/u);
        assert.doesNotMatch(prompt, /短句也可以|不强迫告白|不强制告白|简短观测结论/u);
    }
    assert.equal(previous.nodes.length, 3, 'existing valid short prose remains readable without word/person quotas');
    const increment = butterfly.normalizeButterflyIncrementPart({ nodes: [rawNode('era')], omega: rawNode('OMEGA') }, bank, context);
    const merged = butterfly.mergeButterflyIncremental(previous, increment, ['M001']);
    assert.equal(merged.nodes.length, 4);
    assert.deepEqual(merged.nodes.slice(0, 2), previous.nodes.slice(0, 2));
});

test('recovery cancellation and changed archive identity stop before any provider work', async t => {
    let current = true;
    const f = await fixture(t, { assertCurrent: () => current });
    await f.generate(); await f.resume();
    current = false;
    await assert.rejects(f.generate(), { name: 'AbortError' });
    assert.deepEqual(f.sent, []);
    current = true; f.origin.chatId = 'another-chat';
    await assert.rejects(f.generate(), { code: 'RMT_RECOVERY_INPUT_CHANGED' });
    assert.deepEqual(f.sent, []);
});

async function seedOldDraft(f, { readable = true, axes = ['decision'], mislabeledLegacy = false } = {}) {
    const kinds = ['MAIN', ...(readable ? axes : legacy.legacyButterflyPlan(bank).axes), 'OMEGA'];
    const rawNodes = kinds.map(kind => rawNode(kind, mislabeledLegacy ? ['decision'] : axes));
    const normalized = butterfly.normalizeButterfly({ nodes: rawNodes }, bank, context).nodes;
    normalized[0].branchAxes = axes;
    // Captured from the uploaded r83-noretry generator with this exact fixture,
    // before the r84 change; the compatibility helper must reconstruct it exactly.
    const readableHashes = ['2d1ffb4a8e55b4c0bdfed3146ca6a5c3d994d438dbe536e61a2fc4635cc0f273',
        '6405b11a4ad47ef2d6da49129f39a6c25e2added3bbd7656a1a7a16dcf9ed32b',
        'f727a5b5246f6c230a9477bab95fe33cd7250b39ae176b22b78ea13ba4183efd'];
    for (let index = 0; index < kinds.length; index++) {
        const requestIndex = mislabeledLegacy && kinds[index] === 'OMEGA' ? legacy.legacyButterflyPlan(bank).axes.length + 1 : index;
        const options = { origin: f.origin, mode: 'butterfly', taskKey: `${taskKey}:slot:${requestIndex}`,
            context, contextEnvelope: '', maxTokens: 4096, temperature: 0.55,
            ...(readable ? { recoveryCompatibility: { contract: mislabeledLegacy ? 'butterfly-legacy-plan-r62' : 'butterfly-readable-r62', legacyPrompts: [] } } : {}) };
        const prompt = readable
            ? butterfly.butterflySlotPrompt(context, bank, index, kinds[index], normalized.slice(0, index), { readableR62: true })
            : legacy.legacyButterflySlotPrompt(context, bank, index, normalized.slice(0, index));
        if (readable && axes.length === 1 && axes[0] === 'decision') {
            assert.equal(await recovery.generationRecoveryDigest(prompt), readableHashes[index]);
        }
        await recovery.withRecoverySegment(prompt, options, () => normalized[index], async (_prompt, _options, accepted) => {
            await accepted({ node: rawNodes[index] });
            return normalized[index];
        });
    }
    await f.resume();
    return normalized;
}

test('old readable-r62 successful nodes replay through current validators without any new provider sends', async t => {
    const f = await fixture(t);
    const previousNodes = await seedOldDraft(f);
    const result = await f.generate();
    assert.deepEqual(f.sent, []);
    assert.deepEqual(f.validated, ['MAIN', 'decision', 'OMEGA']);
    const expected = structuredClone(previousNodes); delete expected[0].branchAxes;
    assert.deepEqual(result.nodes, expected);
});

test('an old readable empty-axis plan remains empty when resumed rather than silently gaining paid work', async t => {
    const f = await fixture(t);
    await seedOldDraft(f, { axes: [] });
    const result = await f.generate();
    assert.deepEqual(result.nodes.map(node => node.id), ['MAIN', 'OMEGA']);
    assert.deepEqual(f.sent, []);
    assert.deepEqual(f.validated, ['MAIN', 'OMEGA']);
});

test('exact unmarked legacy successful nodes are authenticated and replayed with no provider sends', async t => {
    const f = await fixture(t);
    await seedOldDraft(f, { readable: false });
    const result = await f.generate();
    assert.deepEqual(f.sent, []);
    assert.deepEqual(f.validated, ['MAIN', 'era', 'OMEGA']);
    assert.equal(result.nodes[1].primaryAxis, 'era');
    await f.resume();
    assert.deepEqual(await f.generate(), result, 'a second reopen also authenticates upgraded legacy progress');
    assert.deepEqual(f.sent, []);
});

test('a saved segment that fails current validation is preserved and never silently regenerated', async t => {
    const f = await fixture(t);
    await f.generate();
    const draft = f.snapshot();
    const main = draft.segments.find(segment => /:slot:0$/u.test(segment.slot));
    const raw = JSON.parse(main.rawJson); raw.node.monologue = ''; main.rawJson = JSON.stringify(raw);
    await f.resume(draft);
    await assert.rejects(f.generate(), { code: 'RMT_RECOVERY_VALIDATION_CHANGED' });
    assert.deepEqual(f.sent, []);
    assert.equal(f.snapshot().segments.find(segment => /:slot:0$/u.test(segment.slot)).rawJson, main.rawJson);
});

test('the faulty r83-noretry MAIN-to-OMEGA draft keeps its exact slots and does not add hidden paid branches', async t => {
    const f = await fixture(t);
    await seedOldDraft(f, { axes: [], mislabeledLegacy: true });
    const result = await f.generate();
    assert.deepEqual(result.nodes.map(node => node.id), ['MAIN', 'OMEGA']);
    assert.deepEqual(f.sent, []);
    assert.deepEqual(f.validated, ['MAIN', 'OMEGA']);
});

function hostFixture(t) {
    const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
    const profile = { id: 'butterfly-profile', mode: 'cc', api: 'openai', model: 'fixture-model', 'secret-id': 'fixture-reference' };
    const sent = [];
    let response = {};
    const host = { ...context, chatMetadata: {}, getTokenCountAsync: async () => 100,
        extensionSettings: { [constants.EXTENSION_SETTINGS_KEY]: { apiConnectionMode: 'profile', connectionProfileId: profile.id,
            useActivatedWorldInfo: false }, connectionManager: { profiles: [profile] } },
        ConnectionManagerRequestService: { validateProfile: () => ({ selected: 'openai', source: 'openai' }),
            async sendRequest(_id, messages, _length, options, overridePayload) {
                const payload = { secret_id: profile['secret-id'], model: profile.model, ...overridePayload };
                assert.equal(payload.secret_id, 'fixture-reference');
                assert.equal(options.signal.aborted, false);
                sent.push(messages.map(message => message.content).join('\n'));
                return { content: JSON.stringify(response) };
            } },
    };
    t.after(() => {
        oldDocument ? Object.defineProperty(globalThis, 'document', oldDocument) : delete globalThis.document;
        coordinator.resetProviderRateLimitThrottle(); trace.clearTaskTrace();
        assert.equal(state.activeGenerationTasks.size, 0);
        assert.equal(state.activeProviderRequestCount, 0);
        assert.equal(state.providerRequestQueue.length, 0);
    });
    return { host, sent, set response(value) { response = value; } };
}

function assertNarrativePrompt(prompt) {
    assert.match(prompt, /第一人称/u); assert.match(prompt, /冷酷/u);
    assert.match(prompt, /汇合|汇总/u); assert.match(prompt, /情绪|余韵/u);
    assert.doesNotMatch(prompt, /短句也可以|不强迫告白|简短观测结论/u);
}

test('the actual incremental entry sends the restored narrative once and resumes locally without rewriting prior nodes', async t => {
    const host = hostFixture(t), f = await fixture(t);
    f.origin.lifecycleEpoch = state.runtimeLifecycleEpoch;
    const previous = butterfly.normalizeButterfly({ nodes: [rawNode('MAIN'), rawNode('decision'), rawNode('OMEGA')] }, bank, context);
    host.response = { nodes: [rawNode('era')], omega: rawNode('OMEGA') };
    const generate = () => butterfly.generateButterflyIncrementalWithRepair(host.host, bank, f.origin, taskKey, previous);
    const result = await generate();
    assert.equal(host.sent.length, 1); assertNarrativePrompt(host.sent[0]);
    assert.deepEqual(result.nodes.slice(0, 2), previous.nodes.slice(0, 2));
    assert.equal(result.nodes.length, 4);
    await f.resume();
    assert.deepEqual((await generate()).nodes, result.nodes);
    assert.equal(host.sent.length, 1, 'completed increment was revalidated without another provider send');
});

test('actual branch and Omega regeneration use restored narrative, preserve identity, and replay completed work', async t => {
    const host = hostFixture(t);
    const previous = butterfly.normalizeButterfly({ nodes: [rawNode('MAIN'), rawNode('decision'), rawNode('OMEGA')] }, bank, context);
    const untouched = structuredClone(previous);
    for (const index of [1, 2]) {
        const f = await fixture(t); f.origin.lifecycleEpoch = state.runtimeLifecycleEpoch;
        const item = previous.nodes[index];
        const raw = { ...rawNode(index === 2 ? 'OMEGA' : 'era'), id: 'MODEL_CANNOT_SELECT_ID', code: 'MODEL_CANNOT_SELECT_CODE',
            locked: true, trueEnding: index !== 2, sourceMemoryIds: ['M999'], sourceMemoryAnchor: 'MODEL_CANNOT_SELECT_EVIDENCE' };
        host.response = { node: raw };
        const before = host.sent.length;
        const generate = () => regeneration.regenerateManagedTarget(previous, 'butterfly-node', item.id, '',
            { context: host.host, memoryBank: bank, origin: f.origin, taskKey: `${taskKey}:regenerate:${item.id}` });
        const result = await generate();
        assert.equal(host.sent.length, before + 1); assertNarrativePrompt(host.sent.at(-1));
        if (index === 2) {
            assert.match(host.sent.at(-1), /VALIDATED_VOICES_JSON/u);
            assert.ok(host.sent.at(-1).includes(previous.nodes[1].monologue));
        }
        for (const key of ['id', 'code', 'locked', 'trueEnding', 'sourceMemoryIds', 'sourceMemoryAnchor', 'worldSpec']) {
            assert.deepEqual(result.nodes[index][key], item[key], `model did not replace immutable ${key}`);
        }
        for (let other = 0; other < previous.nodes.length; other++) if (other !== index) assert.deepEqual(result.nodes[other], previous.nodes[other]);
        assert.deepEqual(previous, untouched);
        await f.resume();
        assert.deepEqual(await generate(), result);
        assert.equal(host.sent.length, before + 1, 'completed regeneration was revalidated without another provider send');
    }
});

test('old ordinary and Omega single-item regeneration drafts retain exact request identity and replay with zero sends', async t => {
    const host = hostFixture(t);
    const previous = butterfly.normalizeButterfly({ nodes: [rawNode('MAIN'), rawNode('decision'), rawNode('OMEGA')] }, bank, context);
    // Request identities captured from the uploaded r83-noretry regeneration
    // entry with this fixture and its actual controlled context envelope.
    const oldHashes = ['b5749321c1e1bb39f66c90fe98f9088748c251750a84c3266d1f90ed117c7839',
        'b40a5e104a33e22083315d04a5136efcc7c612274c4662c1bd629beae51e6161'];
    for (const index of [1, 2]) {
        const f = await fixture(t); f.origin.lifecycleEpoch = state.runtimeLifecycleEpoch;
        const item = previous.nodes[index], key = `${taskKey}:legacy-regenerate:${item.id}`;
        const raw = { node: rawNode(index === 2 ? 'OMEGA' : 'era') };
        const draft = f.snapshot();
        draft.segments = [{ slot: `${key}:butterfly`, requestHash: oldHashes[index - 1], state: 'complete', rawJson: JSON.stringify(raw) }];
        await f.resume(draft);
        const result = await regeneration.regenerateManagedTarget(previous, 'butterfly-node', item.id, '',
            { context: host.host, memoryBank: bank, origin: f.origin, taskKey: key });
        assert.equal(result.nodes[index].monologue, index === 2 ? '' : raw.node.monologue);
        assert.equal(result.nodes[index].id, item.id);
        assert.deepEqual(host.sent, [], 'existing paid result must not be sent again to the provider');
    }
});
