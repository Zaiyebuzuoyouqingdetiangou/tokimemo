import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

// Real runtime graph; only the host UI and paid provider boundary are substituted.
export async function preparationFixture({ timers = {}, hostOverrides = {}, storageRead = null } = {}) {
    const host = { characterId: 0, name1: '阿宁', name2: '岚', chatId: 'preparation-check',
        characters: [{ name: '岚', avatar: 'preparation-check.png', description: '在窗边读书的人。' }],
        chat: [{ is_user: true, mes: '我们今天一起读完了窗边的书。' }], chatMetadata: {}, powerUserSettings: {},
        extensionSettings: { heartbeatMemories: { apiConnectionMode: 'manual', manualApiBaseUrl: 'https://example.invalid/v1',
            manualApiModel: 'fixture-only', useCurrentChatExternalMemory: false, useActivatedWorldInfo: true } },
        getCurrentChatId() { return this.chatId; }, saveSettingsDebounced() {}, saveMetadata: async () => {},
        getTokenCountAsync: async () => 20, ...hostOverrides };
    const events = [], modules = new Map(), records = new Map();
    let providerCalls = 0;
    const sandbox = vm.createContext({ console: { warn() {}, error() {}, log() {} },
        setTimeout: timers.setTimeout || setTimeout, clearTimeout: timers.clearTimeout || clearTimeout,
        setInterval, clearInterval, AbortController, DOMException, TextEncoder, TextDecoder,
        URL, URLSearchParams, structuredClone, crypto: webcrypto, performance,
        SillyTavern: { getContext: () => host },
        document: { getElementById: () => null, querySelector: () => null, visibilityState: 'visible' },
        toastr: Object.fromEntries(['error', 'warning', 'info', 'success'].map(level => [level, message => events.push({ level, message })])),
    });
    async function moduleAt(url) {
        if (!modules.has(url.href)) modules.set(url.href, (async () => {
            const source = await readFile(url, 'utf8');
            if (/\/(ui\/(overlay|settingsPanel|taskCenter)|generation\/client)\.js$/.test(url.pathname)) {
                const names = [...source.matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+([\w$]+)/gm)].map(row => row[1]);
                return new vm.SyntheticModule(names, function () {
                    for (const name of names) this.setExport(name, name === 'generateConfiguredJson'
                        ? async () => { providerCalls++; throw Object.assign(new Error('Test provider boundary'), { code: 'RMT_TEST_PROVIDER' }); }
                        : name === 'confirmExplicitAction' ? () => true : () => {});
                }, { context: sandbox, identifier: url.href });
            }
            return new vm.SourceTextModule(source, { context: sandbox, identifier: url.href });
        })());
        return modules.get(url.href);
    }
    const root = await moduleAt(new URL('../src/archive/repository.js', import.meta.url));
    await root.link((spec, parent) => moduleAt(new URL(spec, parent.identifier)));
    await root.evaluate();
    const api = async path => {
        const mod = await moduleAt(new URL(`../src/${path}`, import.meta.url));
        if (mod.status === 'unlinked') {
            await mod.link((spec, parent) => moduleAt(new URL(spec, parent.identifier)));
            await mod.evaluate();
        }
        return mod.namespace;
    };
    const store = await api('core/localRecoveryStore.js');
    store.setLocalRecoveryBackendForTests({
        read: key => storageRead ? storageRead(key, records) : structuredClone(records.get(key) || null),
        compare: async (key, revision, payload) => {
            if ((records.get(key)?.revision || 0) !== revision) throw new Error('CAS');
            records.set(key, { key, revision: revision + 1, payload: structuredClone(payload) }); return revision + 1;
        },
    });
    (await api('archive/sourceLedger.js')).setMemorySourceLedgerBackendForTests({ read: async () => null, write: async () => true });
    const state = (await api('core/state.js')).state;
    return { api, repo: root.namespace, host, events, state, sandbox, records,
        coordinator: await api('core/requestCoordinator.js'), get providerCalls() { return providerCalls; } };
}

export async function until(predicate) {
    for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
    throw new Error('Expected stage was not reached within test deadline');
}

export async function settles(promise) {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Owner did not settle')), 1000); })]); }
    finally { clearTimeout(timer); }
}
