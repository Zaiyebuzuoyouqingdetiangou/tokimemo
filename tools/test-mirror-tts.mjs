import test from 'node:test';
import assert from 'node:assert/strict';
import { createMirrorReader, inspectMirror, MAX_MIRROR_TEXT } from '../src/core/mirrorTts.js';

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
function fixture() {
    const start = deferred(), end = deferred();
    let listener, stopped = 0, unsubscribed = 0;
    const calls = [];
    const handle = { playing: true, index: 0, total: 3, done: end.promise,
        stop() { stopped++; this.playing = false; end.resolve(); },
        onProgress(fn) { listener = fn; return () => { unsubscribed++; }; },
    };
    const api = { tts: { apiVersion: 1, status: () => ({ enabled: true, hasKey: true }),
        voices: () => [{ name: '甲', hasOwnVoice: true }], speak: options => { calls.push(options); return start.promise; } } };
    return { api, calls, handle, start, end, reader: createMirrorReader(() => api),
        progress: event => listener?.(event), stops: () => stopped, unsubscribes: () => unsubscribed };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('public readiness fails closed without reading keys', () => {
    assert.match(inspectMirror(() => null).message, /未连接/);
    assert.match(inspectMirror(() => ({ tts: { apiVersion: 2 } })).message, /不兼容/);
    const f = fixture();
    f.api.tts.status = () => ({ enabled: false, hasKey: true });
    assert.match(inspectMirror(() => f.api).message, /打开朗读/);
    f.api.tts.status = () => ({ enabled: true, hasKey: false });
    assert.match(inspectMirror(() => f.api).message, /配置/);
    f.api.tts.status = () => { throw Error('secret token'); };
    assert.doesNotMatch(inspectMirror(() => f.api).message, /secret/);
});
test('explicit playback preserves text and voice, does not request analysis, follows progress and done', async () => {
    const f = fixture();
    assert.equal(f.calls.length, 0);
    const text = '  第一行\n\n 第二行  ';
    const result = f.reader.read({ text, speaker: '甲' });
    assert.equal(f.reader.snapshot().phase, 'preparing');
    assert.equal(f.calls[0].text, text);
    assert.equal(f.calls[0].speaker, '甲');
    assert.equal(f.calls[0].analyze, false);
    assert.equal(f.calls[0].play, true);
    f.start.resolve(f.handle); await tick();
    assert.equal(f.reader.snapshot().phase, 'playing');
    f.progress({ index: 1, total: 3, playing: true });
    assert.equal(f.reader.snapshot().index, 2);
    f.end.resolve(); assert.equal(await result, true);
    assert.equal(f.reader.snapshot().phase, 'ended');
    assert.equal(f.reader.snapshot().locked, false);
    assert.equal(f.unsubscribes(), 1);
});
test('double clicks and stop during synthesis cannot start a second request or accept stale progress', async () => {
    const f = fixture();
    const result = f.reader.read({ text: 'one' });
    assert.equal(await f.reader.read({ text: 'two' }), false);
    f.reader.stop();
    assert.equal(f.calls[0].signal.aborted, true);
    assert.equal(f.reader.snapshot().phase, 'stopped');
    assert.equal(f.reader.snapshot().locked, true);
    assert.equal(await f.reader.read({ text: 'three' }), false);
    f.start.resolve(f.handle); assert.equal(await result, false);
    assert.equal(f.stops(), 1);
    assert.equal(f.calls.length, 1);
    assert.equal(f.reader.snapshot().locked, false);
});
test('upstream cancelled before start yields inactive handle without stopping unrelated audio', async () => {
    const f = fixture(); const result = f.reader.read({ text: 'one' });
    f.reader.stop('切页。'); f.handle.playing = false;
    f.start.resolve(f.handle); f.end.resolve(); await result;
    assert.equal(f.stops(), 0);
});
test('stop during playback ignores late events and unsubscribes', async () => {
    const f = fixture(); const result = f.reader.read({ text: 'one' });
    f.start.resolve(f.handle); await tick();
    f.reader.stop('阅读页已关闭。');
    f.progress({ index: 2, total: 3, playing: true });
    assert.equal(f.reader.snapshot().phase, 'stopped');
    await result; assert.equal(f.unsubscribes(), 1); assert.equal(f.stops(), 1);
});
test('stop releases an owned paused handle rather than leaving its done promise hanging', async () => {
    const f = fixture(); const result = f.reader.read({ text: 'one' });
    f.start.resolve(f.handle); await tick(); f.handle.playing = false;
    f.reader.stop(); await result;
    assert.equal(f.stops(), 1); assert.equal(f.reader.snapshot().locked, false);
});
for (const stage of ['start', 'done']) test(`${stage} failure is safe, unlocks, and never retries`, async () => {
    const f = fixture(); const result = f.reader.read({ text: 'one' });
    if (stage === 'done') { f.start.resolve(f.handle); await tick(); f.end.reject(Error('https://secret.example/key?token=password')); }
    else f.start.reject(Error('Bearer SECRET'));
    assert.equal(await result, false);
    assert.equal(f.calls.length, 1);
    assert.equal(f.reader.snapshot().phase, 'error');
    assert.equal(f.reader.snapshot().locked, false);
    assert.doesNotMatch(f.reader.snapshot().message, /SECRET|password|secret.example/);
});
test('empty, upstream over-limit and another active playback fail before request', async () => {
    const f = fixture();
    assert.equal(await f.reader.read({ text: ' \n ' }), false);
    assert.equal(await f.reader.read({ text: '字'.repeat(MAX_MIRROR_TEXT + 1) }), false);
    assert.match(f.reader.snapshot().message, /没有被截断/);
    f.api.tts.status = () => ({ enabled: true, hasKey: true, busy: true });
    assert.equal(await f.reader.read({ text: 'one' }), false);
    assert.equal(f.calls.length, 0);
});
