import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source = await fs.readFile(new URL('../src/core/selfUpdater.js', import.meta.url), 'utf8');
async function updater({ response, thrown, reinstallThrown, branch = 'main', busy = false } = {}) {
    const calls = [];
    const context = vm.createContext({ URL, Headers, AbortController,
        setTimeout: () => 1, clearTimeout: () => {},
        __heartbeatMemoriesVersion: '1.0.58',
        getExtensionInstallationInfo: async () => ({ remoteUrl: 'https://github.com/Zaiyebuzuoyouqingdetiangou/tokimemo', currentBranchName: branch }),
        updateExtension: async folder => { calls.push(['update', folder]); if (thrown) throw thrown; return response; },
        reinstallExtension: async folder => { calls.push(['reinstall', folder]); if (reinstallThrown) throw reinstallThrown; return { ok: true }; },
    });
    const mod = new vm.SourceTextModule(source, { context, identifier: 'selfUpdater.js' });
    await mod.link(() => new vm.SyntheticModule(['RELEASE_README'], function () { this.setExport('RELEASE_README', ''); }, { context }));
    await mod.evaluate();
    const execute = () => mod.namespace.applyHearttraceUpdateAndReload({
        moduleUrl: 'https://example.test/scripts/extensions/third-party/tokimemo/dist/heartbeatMemories.bundle.js',
        origin: 'https://example.test', isBusy: () => busy,
        fetcher: async () => ({ ok: true, text: async () => '{"version":"9.9.9"}' }),
    });
    return { calls, execute };
}

for (const detail of ['TLS certificate verify failed', 'Internal Server Error', 'Unexpected token < in JSON', 'Authentication failed']) {
    test(`a generic HTTP 500 never reinstalls: ${detail}`, async () => {
        const app = await updater({ response: { ok: false, status: 500, text: async () => detail } });
        await assert.rejects(app.execute());
        assert.deepEqual(app.calls.map(row => row[0]), ['update']);
    });
}

test('a thrown JSON parser failure never reinstalls', async () => {
    const app = await updater({ thrown: new SyntaxError('Unexpected token <; response is not valid JSON') });
    await assert.rejects(app.execute());
    assert.deepEqual(app.calls.map(row => row[0]), ['update']);
});

const conflict = 'error: Your local changes to the following files would be overwritten by merge:\n index.js\nPlease commit your changes or stash them before you merge.';
test('a proven local-change conflict on main retains the existing overwrite path', async () => {
    const app = await updater({ response: { ok: false, status: 500, text: async () => conflict } });
    assert.equal((await app.execute()).overwritten, true);
    assert.deepEqual(app.calls.map(row => row[0]), ['update', 'reinstall']);
});

test('a local-change conflict on a test branch does not overwrite', async () => {
    const app = await updater({ branch: '测试', response: { ok: false, status: 500, text: async () => conflict } });
    await assert.rejects(app.execute(), /测试/);
    assert.deepEqual(app.calls.map(row => row[0]), ['update']);
});

test('a host reinstall exception exposes only a local summary and never retries', async () => {
    const app = await updater({ response: { ok: false, status: 500, text: async () => conflict },
        reinstallThrown: new Error('Authorization: sentinel-secret-reinstall') });
    await assert.rejects(app.execute(), error => /GitHub 覆盖失败/.test(error.message) && !/sentinel-secret/.test(error.message));
    assert.deepEqual(app.calls.map(row => row[0]), ['update', 'reinstall']);
});

test('Git untracked-file refusal and a thrown local-change refusal are recognized', async () => {
    const untracked = await updater({ response: { ok: false, status: 409, text: async () =>
        'error: The following untracked working tree files would be overwritten by merge:\n index.js' } });
    assert.equal((await untracked.execute()).overwritten, true);
    const thrown = await updater({ thrown: new Error(conflict) });
    assert.equal((await thrown.execute()).overwritten, true);
});

test('an authorization denial never becomes an overwrite even with conflict-like detail', async () => {
    const app = await updater({ response: { ok: false, status: 403, text: async () => conflict } });
    await assert.rejects(app.execute());
    assert.deepEqual(app.calls.map(row => row[0]), ['update']);
});

test('unknown host failures expose only a local summary', async () => {
    for (const failure of [
        { response: { ok: false, status: 500, text: async () => 'Authorization: secret-host-response' } },
        { thrown: new Error('Authorization: secret-host-response') },
        { thrown: Object.assign(new Error('Authorization: secret-host-response'), { userMessage: 'Authorization: secret-host-response' }) },
        { thrown: Object.assign(new Error(conflict), { status: 403 }) },
    ]) {
        const app = await updater(failure);
        await assert.rejects(app.execute(), error => !/secret-host-response|Your local changes/.test(error.message + ' ' + error.userMessage));
        assert.deepEqual(app.calls.map(row => row[0]), ['update']);
    }
});

test('a successful pull and the busy guard retain their behavior', async () => {
    const app = await updater({ response: { ok: true } });
    assert.equal((await app.execute()).ok, true);
    assert.deepEqual(app.calls.map(row => row[0]), ['update']);
    const blocked = await updater({ busy: true, response: { ok: true } });
    await assert.rejects(blocked.execute(), /生成和档案保存/);
    assert.equal(blocked.calls.length, 0);
});
