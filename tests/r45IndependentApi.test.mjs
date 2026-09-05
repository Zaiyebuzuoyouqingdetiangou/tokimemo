import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as api from './testingFacade.mjs';
import { state } from '../src/core/state.js';

const settingsSource = await readFile(new URL('../src/ui/settingsPanel.js', import.meta.url), 'utf8');
const stylesSource = await readFile(new URL('../src/ui/styles.js', import.meta.url), 'utf8');

function compatibleService(handler = async () => ({ content: '{"ok":true}' })) {
    return {
        getSupportedProfiles() { return []; },
        validateProfile() { return { selected: 'openai', source: 'custom' }; },
        sendRequest(profileId, messages, maxTokens, options, overridePayload) {
            const profile = { model: 'profile-default', 'secret-id': 'secret-reference' };
            const payload = { secret_id: profile['secret-id'], model: profile.model, ...overridePayload };
            return handler(profileId, messages, maxTokens, options, payload);
        },
    };
}

function contextWithSettings(settings = {}, extra = {}) {
    return {
        extensionSettings: { heartbeatMemories: settings, connectionManager: { profiles: [] } },
        saveCount: 0,
        saveSettingsDebounced() { this.saveCount += 1; },
        getRequestHeaders() { return { 'X-CSRF-Token': 'csrf' }; },
        ...extra,
    };
}

test.afterEach(() => {
    state.connectionModelCache.clear();
    state.connectionModelRequestEpochs.clear();
    state.activeGenerationTasks.clear();
    state.apiConfigurationEpoch = 0;
    delete globalThis.SillyTavern;
});

test('independent API shows equally prominent Heartbeat one-click and manual choices with concise copy', () => {
    assert.match(settingsSource, /rmt-api-source-grid/);
    assert.match(settingsSource, />1\.1\.18 一键配置</);
    assert.match(settingsSource, />手动配置</);
    assert.match(settingsSource, /data-rmt-manual-api-key type="password"/);
    assert.match(stylesSource, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    assert.match(stylesSource, /rmt-api-source-card\.is-active/);
    assert.doesNotMatch(settingsSource, /\brh_/);
    assert.doesNotMatch(settingsSource, /兔子镜|RabbitMirror/);
    assert.doesNotMatch(settingsSource, /尚未选择心跳回忆专用连接。可一键读取/);
    assert.match(settingsSource, /assertManualApiCredentialTransport\(settings\.manualApiBaseUrl, settings\.manualApiKey\)/);
});

test('legacy profile settings migrate to profile mode without losing their values', () => {
    const context = contextWithSettings({ connectionProfileId: 'profile-b', modelOverride: 'model-b', maxTokens: 32000, temperature: 0.4 });
    const first = api.getPluginSettings(context);
    assert.equal(first.apiConnectionMode, 'profile');
    assert.equal(first.connectionProfileId, 'profile-b');
    assert.equal(first.modelOverride, 'model-b');
    assert.equal(first.maxTokens, 32000);
    assert.equal(first.temperature, 0.4);
    assert.equal(first.manualApiKey, '');
    const saves = context.saveCount;
    api.getPluginSettings(context);
    assert.equal(context.saveCount, saves);
});

test('manual API URL normalization accepts pasted endpoints but rejects credential-bearing URLs', () => {
    assert.equal(api.normalizeManualApiBaseUrl('api.example.com/v1/chat/completions'), 'https://api.example.com/v1');
    assert.equal(api.normalizeManualApiBaseUrl('api.example.com:443/v1'), 'https://api.example.com/v1');
    assert.equal(api.normalizeManualApiBaseUrl('localhost:8000/v1'), 'http://localhost:8000/v1');
    assert.equal(api.normalizeManualApiBaseUrl('myproxy:8080/v1'), 'https://myproxy:8080/v1');
    assert.equal(api.normalizeManualApiBaseUrl('127.0.0.1:8080/v1/models'), 'http://127.0.0.1:8080/v1');
    assert.equal(api.normalizeManualApiBaseUrl('https://api.example.com/v1/responses?region=jp#ignored'), 'https://api.example.com/v1?region=jp');
    assert.throws(() => api.normalizeManualApiBaseUrl('https://user:secret@example.com/v1'), /无内嵌账号密码/);
    assert.throws(() => api.normalizeManualApiBaseUrl('file:///tmp/provider'), /HTTP\(S\)/);
    assert.throws(() => api.assertManualApiCredentialTransport('http://api.example.com/v1', 'secret'), /必须使用 HTTPS/);
    assert.equal(api.assertManualApiCredentialTransport('http://localhost:8000/v1', 'secret'), 'http://localhost:8000/v1');
});

test('independent response extraction accepts common top-level and nested content shapes', () => {
    assert.equal(api.extractIndependentResponseContent({ text: '{"shape":"text"}' }), '{"shape":"text"}');
    assert.equal(api.extractIndependentResponseContent({ data: { content: '{"shape":"data-content"}' } }), '{"shape":"data-content"}');
});

test('one-click capability gate requires Profile secret forwarding and late model override', () => {
    assert.equal(api.PROFILE_ONE_CLICK_UI_VERSION, '1.1.18');
    assert.throws(() => api.assertConnectionManagerProfileSupport({ validateProfile() {}, sendRequest() {} }), error => error?.code === 'RMT_PROFILE_CAPABILITY');
    assert.equal(api.assertConnectionManagerProfileSupport(compatibleService()), true);
});

test('same-profile one-click import preserves model override while switching profiles drops it', async () => {
    const service = compatibleService();
    service.getSupportedProfiles = () => [
        { id: 'profile-b', name: 'B', model: 'default-b', api: 'custom' },
        { id: 'profile-c', name: 'C', model: 'default-c', api: 'custom' },
    ];
    const context = contextWithSettings(
        { apiConnectionMode: 'profile', connectionProfileId: 'profile-b', modelOverride: 'chosen-b' },
        {
            ConnectionManagerRequestService: service,
            extensionSettings: {
                heartbeatMemories: { apiConnectionMode: 'profile', connectionProfileId: 'profile-b', modelOverride: 'chosen-b' },
                connectionManager: {
                    selectedProfile: 'profile-b',
                    profiles: [
                        { id: 'profile-b', name: 'B', mode: 'cc', api: 'custom', model: 'default-b', 'secret-id': 'secret-b' },
                        { id: 'profile-c', name: 'C', mode: 'cc', api: 'custom', model: 'default-c', 'secret-id': 'secret-c' },
                    ],
                },
            },
        },
    );
    globalThis.SillyTavern = { getContext: () => context };
    await api.importCurrentSillyTavernConnection({ isCurrent: () => true });
    assert.equal(api.getPluginSettings(context).modelOverride, 'chosen-b');
    context.extensionSettings.connectionManager.selectedProfile = 'profile-c';
    await api.importCurrentSillyTavernConnection({ isCurrent: () => true });
    assert.equal(api.getPluginSettings(context).connectionProfileId, 'profile-c');
    assert.equal(api.getPluginSettings(context).modelOverride, '');
});

test('a superseded one-click operation fails before changing the active transport', async () => {
    const service = compatibleService();
    const context = contextWithSettings(
        { apiConnectionMode: 'manual', manualApiBaseUrl: 'https://manual.example/v1', manualApiModel: 'm' },
        {
            ConnectionManagerRequestService: service,
            extensionSettings: {
                heartbeatMemories: { apiConnectionMode: 'manual', manualApiBaseUrl: 'https://manual.example/v1', manualApiModel: 'm' },
                connectionManager: { selectedProfile: 'profile-b', profiles: [{ id: 'profile-b', mode: 'cc', api: 'custom', model: 'b', 'secret-id': 'secret-b' }] },
            },
        },
    );
    globalThis.SillyTavern = { getContext: () => context };
    await assert.rejects(
        api.importCurrentSillyTavernConnection({ isCurrent: () => false }),
        error => error?.code === 'RMT_API_CONFIGURATION_SUPERSEDED',
    );
    assert.equal(api.getPluginSettings(context).apiConnectionMode, 'manual');
    assert.equal(api.getPluginSettings(context).connectionProfileId, '');
});

test('Profile B model discovery never borrows active Profile A custom headers', async () => {
    const service = compatibleService();
    service.getSupportedProfiles = () => [{ id: 'profile-b', name: 'B', model: 'model-b', api: 'custom' }];
    const context = contextWithSettings(
        { apiConnectionMode: 'profile', connectionProfileId: 'profile-b' },
        {
            ConnectionManagerRequestService: service,
            chatCompletionSettings: { custom_include_headers: '{"Authorization":"Bearer profile-a-secret"}' },
            extensionSettings: {
                heartbeatMemories: { apiConnectionMode: 'profile', connectionProfileId: 'profile-b' },
                connectionManager: {
                    selectedProfile: 'profile-a',
                    profiles: [{ id: 'profile-b', name: 'B', mode: 'cc', api: 'custom', model: 'model-b', 'api-url': 'https://b.example/v1', 'secret-id': 'secret-b' }],
                },
            },
        },
    );
    globalThis.SillyTavern = { getContext: () => context };
    const originalFetch = globalThis.fetch;
    let requestBody = null;
    globalThis.fetch = async (url, options) => {
        assert.equal(url, '/api/backends/chat-completions/status');
        requestBody = JSON.parse(options.body);
        return new Response(JSON.stringify({ data: [{ id: 'model-b' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    try {
        const models = await api.fetchModelsForConnection('profile-b', { force: true });
        assert.deepEqual(models, ['model-b']);
        assert.equal(requestBody.secret_id, 'secret-b');
        assert.equal(requestBody.custom_url, 'https://b.example/v1');
        assert.equal(requestBody.custom_include_headers, '');
        assert.equal(requestBody.custom_include_body, '');
        assert.equal(requestBody.custom_exclude_body, '');
        assert.equal(JSON.stringify(requestBody).includes('profile-a-secret'), false);
        assert.equal(context.extensionSettings.connectionManager.selectedProfile, 'profile-a');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('a Profile status 200 error envelope is reported as saved-model fallback, not remote success', async () => {
    const service = compatibleService();
    const context = contextWithSettings(
        { apiConnectionMode: 'profile', connectionProfileId: 'profile-b' },
        {
            ConnectionManagerRequestService: service,
            extensionSettings: {
                heartbeatMemories: { apiConnectionMode: 'profile', connectionProfileId: 'profile-b' },
                connectionManager: { profiles: [{ id: 'profile-b', mode: 'cc', api: 'custom', model: 'saved', 'secret-id': 'secret-b' }] },
            },
        },
    );
    globalThis.SillyTavern = { getContext: () => context };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ error: true, data: { data: [] } }), { status: 200 });
    try {
        const result = await api.fetchModelsForConnection('profile-b', { force: true, returnMeta: true });
        assert.deepEqual(result.models, ['saved']);
        assert.equal(result.fallbackOnly, true);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('an older profile model request cannot overwrite a newer same-profile result', async () => {
    const service = compatibleService();
    const context = contextWithSettings(
        { apiConnectionMode: 'profile', connectionProfileId: 'profile-b' },
        {
            ConnectionManagerRequestService: service,
            extensionSettings: {
                heartbeatMemories: { apiConnectionMode: 'profile', connectionProfileId: 'profile-b' },
                connectionManager: { profiles: [{ id: 'profile-b', mode: 'cc', api: 'custom', model: 'saved', 'secret-id': 'secret-b' }] },
            },
        },
    );
    globalThis.SillyTavern = { getContext: () => context };
    const originalFetch = globalThis.fetch;
    const releases = [];
    globalThis.fetch = () => new Promise(resolve => releases.push(resolve));
    try {
        const older = api.fetchModelsForConnection('profile-b', { force: true });
        const newer = api.fetchModelsForConnection('profile-b', { force: true });
        releases[1](new Response(JSON.stringify({ data: [{ id: 'newer' }] }), { status: 200 }));
        assert.deepEqual(await newer, ['saved', 'newer']);
        releases[0](new Response(JSON.stringify({ data: [{ id: 'older' }] }), { status: 200 }));
        await assert.rejects(older, error => error?.code === 'RMT_API_MODEL_REQUEST_SUPERSEDED');
        const cached = [...state.connectionModelCache.entries()].find(([key]) => key.startsWith('profile:profile-b:'))?.[1];
        assert.deepEqual(cached, ['saved', 'newer']);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('editing a Connection Profile in flight discards its old model-list result', async () => {
    const service = compatibleService();
    const profile = { id: 'profile-b', mode: 'cc', api: 'custom', model: 'saved', 'secret-id': 'secret-b' };
    const context = contextWithSettings(
        { apiConnectionMode: 'profile', connectionProfileId: 'profile-b' },
        {
            ConnectionManagerRequestService: service,
            extensionSettings: {
                heartbeatMemories: { apiConnectionMode: 'profile', connectionProfileId: 'profile-b' },
                connectionManager: { profiles: [profile] },
            },
        },
    );
    globalThis.SillyTavern = { getContext: () => context };
    const originalFetch = globalThis.fetch;
    let release;
    globalThis.fetch = () => new Promise(resolve => { release = resolve; });
    try {
        const pending = api.fetchModelsForConnection('profile-b', { force: true });
        await new Promise(resolve => setTimeout(resolve, 0));
        profile.model = 'edited-while-waiting';
        release(new Response(JSON.stringify({ data: [{ id: 'stale' }] }), { status: 200 }));
        await assert.rejects(pending, error => error?.name === 'AbortError');
        assert.equal(state.connectionModelCache.size, 0);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('manual model discovery uses only the fixed same-origin status endpoint and common list shapes', async () => {
    let calledUrl = '';
    let body = null;
    const context = contextWithSettings();
    const models = await api.fetchManualApiModels(
        { manualApiBaseUrl: 'https://manual.example/v1/models', manualApiKey: 'manual-secret' },
        context,
        {
            fetchImpl: async (url, options) => {
                calledUrl = url;
                body = JSON.parse(options.body);
                return new Response(JSON.stringify({ result: { items: [{ model_id: 'm2' }, { id: 'm1' }, { id: 'm1' }] } }), { status: 200 });
            },
        },
    );
    assert.equal(calledUrl, '/api/backends/chat-completions/status');
    assert.equal(body.custom_url, 'https://manual.example/v1');
    assert.deepEqual(JSON.parse(body.custom_include_headers), { Authorization: 'Bearer manual-secret' });
    assert.deepEqual(models, ['m2', 'm1']);
});

test('manual model results are discarded when API configuration changes in flight', async () => {
    const context = contextWithSettings({ apiConnectionMode: 'manual', manualApiBaseUrl: 'https://manual.example/v1', manualApiModel: 'old-model' });
    globalThis.SillyTavern = { getContext: () => context };
    const originalFetch = globalThis.fetch;
    let release;
    globalThis.fetch = () => new Promise(resolve => { release = resolve; });
    try {
        const candidate = api.getPluginSettings(context);
        const oldCacheKey = api.manualModelCacheKey(candidate);
        const pending = api.fetchModelsForManualConnection(candidate, { force: true, context });
        await new Promise(resolve => setTimeout(resolve, 0));
        api.updatePluginSettings({ manualApiModel: 'new-model' });
        release(new Response(JSON.stringify({ data: [{ id: 'stale-model' }] }), { status: 200 }));
        await assert.rejects(pending, error => error?.name === 'AbortError');
        assert.equal(state.connectionModelCache.has(oldCacheKey), false);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('manual model UI failure falls back only to its own saved model', async () => {
    const context = contextWithSettings({
        apiConnectionMode: 'manual',
        manualApiBaseUrl: 'https://manual.example/v1',
        manualApiKey: 'manual-secret',
        manualApiModel: 'manual-saved',
        connectionProfileId: 'profile-a',
        modelOverride: 'profile-a-model',
    });
    globalThis.SillyTavern = { getContext: () => context };
    state.connectionModelCache.set('profile:profile-a:foreign', ['profile-a-model', 'profile-a-remote']);
    const input = { value: 'manual-saved' };
    const base = { value: 'https://manual.example/v1' };
    const key = { value: '' };
    const options = [];
    const list = {
        replaceChildren() { options.length = 0; },
        appendChild(option) { options.push(option); },
    };
    const button = { disabled: false, textContent: '' };
    const panel = {
        dataset: {},
        querySelector(selector) {
            if (selector === '[data-rmt-manual-api-model]') return input;
            if (selector === '[data-rmt-manual-api-base]') return base;
            if (selector === '[data-rmt-manual-api-key]') return key;
            if (selector === '[data-rmt-manual-api-models]') return list;
            if (selector === '[data-rmt-manual-api-model-refresh]') return button;
            return null;
        },
    };
    const previousDocument = globalThis.document;
    const previousFetch = globalThis.fetch;
    globalThis.document = {
        getElementById: () => panel,
        createElement: () => ({ value: '', textContent: '' }),
    };
    globalThis.fetch = async () => new Response('<html>profile-a-secret</html>', { status: 503 });
    try {
        const models = await api.refreshManualModelOptions({ fetchRemote: true });
        assert.deepEqual(models, ['manual-saved']);
        assert.deepEqual(options.map(option => option.value), ['manual-saved']);
        assert.equal(panel.dataset.rmtManualModelFallback, '1');
        assert.equal(options.some(option => option.value.includes('profile-a')), false);
        assert.equal(button.disabled, false);
        assert.equal(button.textContent, '拉取模型');
    } finally {
        globalThis.fetch = previousFetch;
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});

test('manual model discovery has bounded timeout and external abort branches', async () => {
    const candidate = { manualApiBaseUrl: 'https://manual.example/v1', manualApiKey: 'secret' };
    const context = contextWithSettings();
    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    globalThis.setTimeout = callback => { queueMicrotask(callback); return 1; };
    globalThis.clearTimeout = () => {};
    try {
        await assert.rejects(
            api.fetchManualApiModels(candidate, context, { fetchImpl: () => new Promise(() => {}) }),
            error => error?.code === 'RMT_MANUAL_MODEL_TIMEOUT',
        );
    } finally {
        globalThis.setTimeout = previousSetTimeout;
        globalThis.clearTimeout = previousClearTimeout;
    }

    const controller = new AbortController();
    const pending = api.fetchManualApiModels(candidate, context, {
        signal: controller.signal,
        fetchImpl: () => new Promise(() => {}),
    });
    controller.abort(new DOMException('cancelled', 'AbortError'));
    await assert.rejects(pending, error => error?.name === 'AbortError');
});

test('profile model discovery treats timeout and transport abort as same-profile saved fallback', async () => {
    const service = compatibleService();
    const context = contextWithSettings(
        { apiConnectionMode: 'profile', connectionProfileId: 'profile-b' },
        {
            ConnectionManagerRequestService: service,
            extensionSettings: {
                heartbeatMemories: { apiConnectionMode: 'profile', connectionProfileId: 'profile-b' },
                connectionManager: { profiles: [{ id: 'profile-b', mode: 'cc', api: 'custom', model: 'profile-b-saved', 'secret-id': 'secret-b' }] },
            },
        },
    );
    globalThis.SillyTavern = { getContext: () => context };
    const previousFetch = globalThis.fetch;
    const previousSetTimeout = globalThis.setTimeout;
    const previousClearTimeout = globalThis.clearTimeout;
    try {
        globalThis.fetch = () => new Promise(() => {});
        globalThis.setTimeout = callback => { queueMicrotask(callback); return 1; };
        globalThis.clearTimeout = () => {};
        let result = await api.fetchModelsForConnection('profile-b', { force: true, returnMeta: true });
        assert.deepEqual(result.models, ['profile-b-saved']);
        assert.equal(result.fallbackOnly, true);

        state.connectionModelCache.clear();
        state.connectionModelRequestEpochs.clear();
        globalThis.setTimeout = previousSetTimeout;
        globalThis.clearTimeout = previousClearTimeout;
        globalThis.fetch = async () => { throw new DOMException('transport aborted', 'AbortError'); };
        result = await api.fetchModelsForConnection('profile-b', { force: true, returnMeta: true });
        assert.deepEqual(result.models, ['profile-b-saved']);
        assert.equal(result.fallbackOnly, true);
    } finally {
        globalThis.fetch = previousFetch;
        globalThis.setTimeout = previousSetTimeout;
        globalThis.clearTimeout = previousClearTimeout;
    }
});

test('manual completion stays same-origin, sends one non-stream request, and extracts visible content', async () => {
    let calls = 0;
    let request = null;
    const result = await api.requestManualApiCompletion(
        { manualApiBaseUrl: 'https://manual.example/v1', manualApiKey: 'manual-secret', manualApiModel: 'model-b', temperature: 0.6 },
        contextWithSettings(),
        [{ role: 'user', content: 'Return JSON' }],
        12000,
        {
            fetchImpl: async (url, options) => {
                calls += 1;
                assert.equal(url, '/api/backends/chat-completions/generate');
                request = JSON.parse(options.body);
                return new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":true}' } }] }), { status: 200 });
            },
        },
    );
    assert.equal(calls, 1);
    assert.equal(request.stream, false);
    assert.equal(request.custom_url, 'https://manual.example/v1');
    assert.equal(request.model, 'model-b');
    assert.equal(request.max_tokens, 12000);
    assert.deepEqual(JSON.parse(request.custom_include_headers), { Authorization: 'Bearer manual-secret' });
    assert.equal(result, '{"answer":true}');
});

test('manual HTTP errors never echo API keys or provider response bodies', async () => {
    const secret = 'sk-super-secret-value';
    await assert.rejects(
        api.requestManualApiCompletion(
            { manualApiBaseUrl: 'https://manual.example/v1', manualApiKey: secret, manualApiModel: 'm' },
            contextWithSettings(),
            [{ role: 'user', content: 'Return JSON' }],
            2000,
            { fetchImpl: async () => new Response(JSON.stringify({ error: { message: `bad ${secret}` } }), { status: 401 }) },
        ),
        error => error?.status === 401 && !error.message.includes(secret) && !error.message.includes('bad'),
    );
});

test('a 200 error envelope is not reported as HTTP 200 and is not automatically retried', async () => {
    await assert.rejects(
        api.requestManualApiCompletion(
            { manualApiBaseUrl: 'https://manual.example/v1', manualApiModel: 'm' },
            contextWithSettings(),
            [{ role: 'user', content: 'Return JSON' }],
            2000,
            { fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'upstream rejected' } }), { status: 200 }) },
        ),
        error => error?.code === 'RMT_MANUAL_PROVIDER_ERROR' && error?.retryable === false && !/HTTP 200/.test(error.message),
    );
});

test('manual response byte limits stop oversized payloads before JSON parsing', async () => {
    await assert.rejects(
        api.requestManualApiCompletion(
            { manualApiBaseUrl: 'https://manual.example/v1', manualApiModel: 'm' },
            contextWithSettings(),
            [{ role: 'user', content: 'Return JSON' }],
            2000,
            {
                fetchImpl: async () => new Response('{}', {
                    status: 200,
                    headers: { 'content-length': String(api.MAX_MANUAL_API_RESPONSE_BYTES + 1) },
                }),
            },
        ),
        error => error?.code === 'RMT_MANUAL_RESPONSE_TOO_LARGE',
    );
});

test('changing API settings advances the epoch and aborts active generation tasks', () => {
    const controller = new AbortController();
    const context = contextWithSettings({ apiConnectionMode: 'manual', manualApiBaseUrl: 'https://manual.example/v1', manualApiModel: 'model-a' });
    globalThis.SillyTavern = { getContext: () => context };
    state.activeGenerationTasks.set('task', { controller });
    const before = state.apiConfigurationEpoch;
    api.updatePluginSettings({ manualApiModel: 'model-b' });
    assert.equal(state.apiConfigurationEpoch, before + 1);
    assert.equal(controller.signal.aborted, true);
});

test('profile and manual generation transports are mutually exclusive and disable preset contamination', async () => {
    let profileCalls = 0;
    const service = compatibleService(async (_profileId, messages, _maxTokens, options) => {
        profileCalls += 1;
        assert.equal(Array.isArray(messages), true);
        assert.equal(options.includePreset, false);
        assert.equal(options.includeInstruct, false);
        return { content: '{"profile":true}' };
    });
    const profileContext = contextWithSettings(
        { apiConnectionMode: 'profile', connectionProfileId: 'profile-b', modelOverride: 'model-b' },
        {
            ConnectionManagerRequestService: service,
            extensionSettings: {
                heartbeatMemories: { apiConnectionMode: 'profile', connectionProfileId: 'profile-b', modelOverride: 'model-b' },
                connectionManager: { profiles: [{ id: 'profile-b', mode: 'cc', api: 'custom', model: 'model-a', 'secret-id': 'secret-b' }] },
            },
        },
    );
    const profileResult = await api.generateConfiguredJson('Return JSON', { context: profileContext, contextEnvelope: '', skipTokenCount: true, timeoutMs: 30000 });
    assert.equal(profileResult.profile, true);
    assert.equal(profileCalls, 1);

    const originalFetch = globalThis.fetch;
    let manualCalls = 0;
    globalThis.fetch = async url => {
        manualCalls += 1;
        assert.equal(url, '/api/backends/chat-completions/generate');
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"manual":true}' } }] }), { status: 200 });
    };
    try {
        const manualContext = contextWithSettings(
            { apiConnectionMode: 'manual', manualApiBaseUrl: 'https://manual.example/v1', manualApiKey: 'key', manualApiModel: 'manual-model' },
            { ConnectionManagerRequestService: { sendRequest() { throw new Error('must not run'); } } },
        );
        const manualResult = await api.generateConfiguredJson('Return JSON', { context: manualContext, contextEnvelope: '', skipTokenCount: true, timeoutMs: 30000 });
        assert.equal(manualResult.manual, true);
        assert.equal(manualCalls, 1);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('a response from an API configuration changed in flight is discarded', async () => {
    const originalFetch = globalThis.fetch;
    let release;
    globalThis.fetch = async () => {
        await new Promise(resolve => { release = resolve; });
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"stale":true}' } }] }), { status: 200 });
    };
    try {
        const context = contextWithSettings({ apiConnectionMode: 'manual', manualApiBaseUrl: 'https://manual.example/v1', manualApiKey: 'key', manualApiModel: 'model-a' });
        const pending = api.generateConfiguredJson('Return JSON', { context, contextEnvelope: '', skipTokenCount: true, timeoutMs: 30000 });
        await new Promise(resolve => setTimeout(resolve, 0));
        context.extensionSettings.heartbeatMemories.manualApiModel = 'model-b';
        release();
        await assert.rejects(pending, error => error?.code === 'RMT_API_CONFIG_CHANGED');
    } finally {
        globalThis.fetch = originalFetch;
    }
});
