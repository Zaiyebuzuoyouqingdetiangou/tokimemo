import assert from 'node:assert/strict';
import test from 'node:test';
import { createMirrorCall, inspectMirrorCall } from '../src/core/mirrorCall.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function api({ llmStream, sttStart } = {}) {
    const handles = [];
    return { handles, tts: { apiVersion: 1, status: () => ({ enabled: true, hasKey: true, busy: false }), stream: () => {
        const done = deferred(), handle = { pushed: [], cancelled: false, unsubscribed: false, reject: done.reject, push(v) { this.pushed.push(v); }, end() { done.resolve(); }, cancel() { this.cancelled = true; done.resolve(); }, done: done.promise, on() { return () => { this.unsubscribed = true; }; } }; handles.push(handle); return handle;
    } }, stt: { status: () => ({ available: true }), start: sttStart || (async () => ({ stop: async () => '语音内容', cancel() {} })) }, llm: { status: () => ({ connection: true, streams: 0 }), stream: llmStream || (async ({ onText }) => { onText('你好'); onText('你好，世界'); return '你好，世界'; }) } };
}
const description = () => ({ scope: 'scope-1', speaker: '岚', user: '你', system: '保持角色口吻。' });

test('uses cumulative LLM text as deltas and retains complete turns', async () => {
    const mirror = api(), call = createMirrorCall({ resolve: () => mirror, describe: description, isCurrent: () => true });
    assert.equal(call.start(), true);
    assert.equal(await call.send('早上好'), true);
    assert.deepEqual(mirror.handles[0].pushed, ['你好', '，世界']);
    assert.equal(mirror.handles[0].unsubscribed, true);
    assert.deepEqual(call.snapshot().turns.map(t => t.content), ['早上好', '你好，世界']);
    assert.equal(call.snapshot().phase, 'ready');
});

test('hangup cancels a late stream and prevents late text from speaking', async () => {
    const gate = deferred(), mirror = api({ llmStream: async ({ onText }) => { await gate.promise; onText('迟到的文字'); return '迟到的文字'; } });
    const call = createMirrorCall({ resolve: () => mirror, describe: description, isCurrent: () => true }); call.start();
    const sending = call.send('现在说'); call.hangup(); gate.resolve();
    assert.equal(await sending, false); assert.equal(mirror.handles[0].cancelled, true); assert.equal(mirror.handles[0].pushed.length, 0); assert.equal(call.snapshot().phase, 'idle');
});

test('late microphone permission is cancelled after hangup', async () => {
    const gate = deferred(), cancelled = { value: false }, mirror = api({ sttStart: async () => gate.promise });
    const call = createMirrorCall({ resolve: () => mirror, describe: description, isCurrent: () => true }); call.start();
    const recording = call.record(); call.hangup(); gate.resolve({ stop: async () => 'late', cancel() { cancelled.value = true; } });
    assert.equal(await recording, false); assert.equal(cancelled.value, true); assert.equal(call.snapshot().phase, 'idle');
});

test('scope changes cancel output without adding a late assistant turn', async () => {
    let valid = true, lateToken; const gate = deferred(), mirror = api({ llmStream: async ({ onText }) => { lateToken = onText; return gate.promise; } });
    const call = createMirrorCall({ resolve: () => mirror, describe: description, isCurrent: () => valid }); call.start(); const sending = call.send('测试'); valid = false; lateToken('不能说');
    assert.equal(mirror.handles[0].cancelled, true); gate.resolve('不能说');
    assert.equal(await sending, false); assert.equal(mirror.handles[0].cancelled, true); assert.equal(mirror.handles[0].pushed.length, 0); assert.equal(call.snapshot().turns.length, 1);
});

test('a TTS completion rejection during generation is handled and stops late speech', async () => {
    const gate = deferred(), mirror = api({ llmStream: async ({ onText }) => { await gate.promise; onText('不应朗读'); return '不应朗读'; } });
    const call = createMirrorCall({ resolve: () => mirror, describe: description, isCurrent: () => true }); call.start(); const sending = call.send('测试');
    mirror.handles[0].reject(new Error('audio')); gate.resolve();
    assert.equal(await sending, false); assert.equal(mirror.handles[0].pushed.length, 0);
});

test('reports unavailable beta interfaces clearly', () => {
    assert.equal(inspectMirrorCall(() => null).ok, false);
    assert.match(inspectMirrorCall(() => null).message, /实时通话 Beta/);
});

test('public state event exposes blocked audio and explicit resume without a second request', async () => {
    const done=deferred();let listener, resumed=0, requests=0;
    const mirror=api({llmStream:async ({onText})=>{requests++;onText('等你点一下播放。');listener({state:'paused',blocked:true});return '等你点一下播放。';}});
    mirror.tts.stream=()=>({push(){},end(){},cancel(){done.resolve({cancelled:true});},resume(){resumed++;listener({state:'speaking',blocked:false});done.resolve({pieces:1,played:1,cancelled:false});},done:done.promise,on(event,fn){assert.equal(event,'state');listener=fn;return()=>{};}});
    const call=createMirrorCall({resolve:()=>mirror,describe:description});call.start();const pending=call.send('你好');await Promise.resolve();
    assert.equal(call.snapshot().audioPaused,true);assert.equal(call.resume(),true);assert.equal(await pending,true);
    assert.equal(resumed,1);assert.equal(requests,1);assert.equal(call.snapshot().audioPaused,false);
});

test('resolved beta playback with no played pieces retains text and reports unavailable audio', async () => {
    const mirror=api();mirror.tts.stream=()=>({push(){},end(){},cancel(){},done:Promise.resolve({pieces:1,played:0,cancelled:false}),on:()=>()=>{}});
    const call=createMirrorCall({resolve:()=>mirror,describe:description});call.start();assert.equal(await call.send('你好'),false);
    assert.equal(call.snapshot().phase,'error');assert.match(call.snapshot().message,/语音未能播放/);assert.equal(call.snapshot().turns.at(-1).content,'你好，世界');
});

test('a missing microphone still permits text, but recording explains the local reason', async () => {
    const mirror = api(); mirror.stt.status = () => ({ available: false, reason: '权限未授予' });
    const call = createMirrorCall({ resolve: () => mirror, describe: description, isCurrent: () => true });
    assert.equal(call.start(), true); assert.equal(await call.send('文字继续'), true); assert.equal(await call.record(), false); assert.match(call.snapshot().message, /权限未授予/);
});

test('a changed scope or speaker starts isolated temporary history', async () => {
    const mirror = api(); let info = description(); const call = createMirrorCall({ resolve: () => mirror, describe: () => info, isCurrent: () => true });
    call.start(); await call.send('旧角色'); call.hangup(); info = { ...description(), scope: 'scope-2', speaker: '澄' }; call.start();
    assert.deepEqual(call.snapshot().turns, []);
});

test('second send and repeated record/finish are mutually exclusive', async () => {
    const gate = deferred(), mirror = api({ llmStream: async () => gate.promise }); const call = createMirrorCall({ resolve: () => mirror, describe: description, isCurrent: () => true }); call.start();
    const first = call.send('第一句'); assert.equal(await call.send('第二句'), false); call.interrupt(); gate.resolve('迟到'); await first;
    assert.equal(await call.record(), true); assert.equal(await call.record(), false); const finish = call.finishRecording(); assert.equal(await call.finishRecording(), false); await finish;
});
