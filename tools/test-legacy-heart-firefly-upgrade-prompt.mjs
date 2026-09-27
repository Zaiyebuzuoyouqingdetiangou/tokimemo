import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// r84.77: 旧版萤火虫升级提示词原先引用未定义的 memoryBank（r84.71 起），一调用就抛 ReferenceError。
test('legacy firefly upgrade prompt builds with the frozen memory bank', async () => {
    const host = { name1: 'User', name2: '方祁洛', characterId: 0, characters: [{ name: '方祁洛', data: { name: '方祁洛' } }], chat: [], chatMetadata: {}, extensionSettings: {} };
    const el = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
    const context = vm.createContext({ console: { log() {}, warn() {}, error() {} }, TextEncoder, TextDecoder, AbortController, URL, Blob, Response, CompressionStream, DecompressionStream, Uint8Array, ArrayBuffer, DataView,
        queueMicrotask, setTimeout, clearTimeout, setInterval, clearInterval, performance, structuredClone, btoa, atob, crypto: globalThis.crypto,
        document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: el, head: { appendChild() {} }, body: el(), documentElement: { style: { setProperty() {} } }, addEventListener() {} },
        window: { addEventListener() {} }, navigator: {}, location: { protocol: 'https:', origin: 'https://x' }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        SillyTavern: { getContext: () => host }, toastr: { info() {}, success() {}, warning() {}, error() {} } });
    const code = fs.readFileSync(new URL('../dist/heartbeatMemories.bundle.js', import.meta.url), 'utf8') + '\nexport const H = __m_modes_heart_js;';
    const bundle = new vm.SourceTextModule(code, { context }); await bundle.link(() => {}); await bundle.evaluate();
    const memoryBank = { characterName: '方祁洛', memories: [] };
    const prompt = bundle.namespace.H.heartFireflyUpgradePrompt(host, {}, [{ id: 'f1', color: 'blue', line: '旧台词' }], memoryBank);
    assert.equal(typeof prompt, 'string');
    assert.match(prompt, /旧版萤火虫升级/);
});
