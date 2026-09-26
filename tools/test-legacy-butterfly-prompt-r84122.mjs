import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// r84.122：继续 r62 旧格式、还没生成完的蝴蝶效应草稿时，真实运行包会调用这两个函数。
// 它们在模块顶层从生成桥解构取值。桥上没有 promptArchiveSlice，或者生成桥比这个文件更晚初始化，
// 都会在发出请求前抛错。修之前，这份测试在 r84.121 的运行包上失败。
test('legacy butterfly prompts return text from the real bundle', async () => {
    const el = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, appendChild() {}, append() {}, addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
    const document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: el, head: { appendChild() {} }, body: el(), documentElement: { style: { setProperty() {} } }, addEventListener() {}, removeEventListener() {} };
    const host = { chat: [], characters: [], chatMetadata: {}, extensionSettings: {}, saveSettingsDebounced() {}, saveMetadata: async () => {} };
    const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} }, TextEncoder, TextDecoder, AbortController, URL, Blob, Response, CompressionStream, DecompressionStream, Uint8Array, ArrayBuffer, DataView, queueMicrotask, setTimeout, clearTimeout, setInterval, clearInterval, performance, structuredClone, btoa, atob, crypto: globalThis.crypto, document, window: { addEventListener() {} }, navigator: {}, location: { protocol: 'https:', origin: 'https://x' }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, SillyTavern: { getContext: () => host }, toastr: { info() {}, success() {}, warning() {}, error() {} } });
    const code = fs.readFileSync(new URL('../dist/heartbeatMemories.bundle.js', import.meta.url), 'utf8');
    const mod = new vm.SourceTextModule(code + '\nexport const legacy = __m_core_butterflyLegacyRecovery_js;\n', { context: ctx });
    await mod.link(() => {});
    await mod.evaluate();
    const legacy = mod.namespace.legacy;
    const context = { name2: '他', name1: '你' };
    const bank = { archiveName: '旧档', characterName: '他', userName: '你', memories: [{ id: 'M001', title: '第一次见面', anchors: ['雨天'] }] };
    const prompt = legacy.legacyButterflyPrompt(context, bank);
    const slot = legacy.legacyButterflySlotPrompt(context, bank, 0, []);
    assert.equal(typeof prompt, 'string');
    assert.equal(typeof slot, 'string');
    assert.match(prompt, /蝴蝶效应/);
    assert.match(prompt, /UNTRUSTED_TIMELINE_ANCHORS_JSON/);
    assert.match(prompt, /"archiveName"/);
    assert.match(slot, /CURRENT_SLOT_JSON/);
    assert.match(slot, /"archiveName"/);
});
