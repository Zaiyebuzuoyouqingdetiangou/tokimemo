// Run with: node --experimental-vm-modules tests/healthcheck-extras-mv-audio.mjs
// Runs complete production MV, song player, media store and video inspection modules.
// Only host/DOM, media decode and IndexedDB boundaries are controlled. MV private
// state is exposed in memory for setup/observation; writes use the public UI handlers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = process.env.HEARTTRACE_AUDIO_SOURCE_ROOT || fileURLToPath(new URL('../', import.meta.url));
const tick = () => new Promise(setImmediate);
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

async function harness() {
    const listeners = new Map();
    const rows = new Map(), transactions = [], probes = [], revoked = [], patches = [], events = [];
    let serial = 0, holdReads = false, storageUnavailable = false, currentScope = 'chat-A';
    const db = {
        objectStoreNames: { contains: () => true },
        transaction(_store, mode) {
            if (storageUnavailable) throw new Error('storage unavailable');
            const tx = { mode, done: false, request: null, error: null,
                objectStore() { return {
                    put(value) { tx.value = value; return tx.request = {}; },
                    delete(key) { tx.deleted = key; return tx.request = {}; },
                    get(key) { tx.request = { result: rows.get(key) }; if (!holdReads) queueMicrotask(() => tx.commit()); return tx.request; },
                }; },
                abort() { if (tx.done) throw new DOMException('finished', 'InvalidStateError'); tx.done = true; tx.aborted = true; queueMicrotask(() => tx.onabort?.()); },
                succeedRequest() {
                    if (tx.done || tx.requestSucceeded) return;
                    tx.requestSucceeded = true;
                    tx.request?.onsuccess?.();
                },
                commit(deferEvent = false) {
                    if (tx.done) return;
                    tx.succeedRequest();
                    if (tx.done) return;
                    tx.done = true;
                    if (tx.value) rows.set(tx.value.key, tx.value);
                    if (tx.deleted) rows.delete(tx.deleted);
                    if (!deferEvent) queueMicrotask(() => tx.oncomplete?.());
                },
                fail() { tx.error = new Error('disk write failed'); tx.abort(); },
            };
            transactions.push(tx); return tx;
        },
    };
    const indexedDB = { open() { const request = { result: db }; queueMicrotask(() => request.onsuccess?.()); return request; } };
    const context = vm.createContext({
        console, Blob, AbortController, DOMException, setTimeout, clearTimeout, queueMicrotask, indexedDB,
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
        addEventListener: (name, fn) => { const set = listeners.get(name) || new Set(); set.add(fn); listeners.set(name, set); },
        dispatchEvent: event => { events.push(event); for (const fn of listeners.get(event.type) || []) fn(event); },
        URL: { createObjectURL: () => `blob:test-${++serial}`, revokeObjectURL: value => revoked.push(value) },
        Audio: class { constructor() { probes.push(this); } set src(value) { this.url = value; } removeAttribute() {} load() {} },
    });
    const source = new vm.SourceTextModule(fs.readFileSync(root + 'src/extras/mvAudioSource.js', 'utf8'), { context });
    await source.link(() => {}); await source.evaluate();
    const media = new vm.SourceTextModule(fs.readFileSync(root + 'src/extras/mvMedia.js', 'utf8'), { context });
    await media.link(() => {}); await media.evaluate();
    const deps = {
        '../extras/mv.js': {
            captureMvTarget: (ctx, songId) => ({ scope: ctx.scope, songId }),
            patchRecord: (songId, patch, target) => { if (currentScope !== target.scope) return null; patches.push({ songId, ...patch, scope: target.scope }); return patch; },
        },
        '../extras/mvMusicLink.js': { musicUrl: value => value, readMusicLink: async url => ({ url, name: url.split('/').at(-1) }) },
        '../core/context.js': { chatScopeKey: ctx => ctx.scope },
        '../core/text.js': { esc: String, normalizeText: value => String(value || ''), safeErrorSummary: error => error.message,
            safeUserError: (message, code) => Object.assign(new Error(message), { code }) },
    };
    const player = new vm.SourceTextModule(fs.readFileSync(root + 'src/ui/songPlayer.js', 'utf8'), { context });
    await player.link(specifier => {
        if (specifier === '../extras/mvMedia.js') return media;
        if (specifier === '../extras/mvAudioSource.js') return source;
        const values = deps[specifier];
        return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });
    });
    await player.evaluate();
    const api = player.namespace, ctx = { scope: 'chat-A' }, song = 'song-1', key = api.songAudioKey(ctx, song);
    const ready = (index = probes.length - 1, duration = 120) => { const probe = probes[index]; probe.duration = duration; probe.readyState = 4; probe.onloadedmetadata?.(); };
    const write = () => transactions.find(tx => tx.mode === 'readwrite' && !tx.done);
    const until = async predicate => { for (let n = 0; n < 20 && !predicate(); n++) await tick(); assert.ok(predicate(), 'expected boundary was reached'); };
    const seed = async () => { rows.set(key, { key, mediaUrl: 'https://audio.example/original.mp3', name: 'original' }); await api.loadSongAudio(ctx, song); };
    return { context, sourceModule: source, mediaModule: media, api, media: media.namespace, ctx, song, key, rows, transactions, probes, revoked, patches, events, ready, write, until, seed,
        holdReads: value => { holdReads = value; }, storageUnavailable: value => { storageUnavailable = value; }, switchScope: value => { currentScope = value; } };
}


async function mvHarness(h) {
 const production=fs.readFileSync(root+'src/ui/mvView.js','utf8');
 const state = { activeMode: 'songMv' };
 let validTarget = true;
 const errors=[];let rendered='';h.context.document={querySelectorAll:()=>{const url=rendered.match(/<audio[^>]*src="([^"]+)"/)?.[1];return url?[{isConnected:true,getAttribute:()=>url}]:[];}};h.context.toastr={error:x=>errors.push(x),info:()=>{}};
 const overrides={
  './songPlayer.js':{...h.api},
  '../core/constants.js':{MODE:{THEME_SONG:'themeSong'}},
  './overlay.js':{bodyEl:()=>null,openCachedOrGenerate:()=>{rendered=h.api.songPlayerHtml(h.ctx,h.song);}},
  '../core/context.js':{currentCharacterGuard:()=>h.ctx},
  '../core/text.js':{esc:String,normalizeText:x=>x,safeUserError:(message,code)=>Object.assign(new Error(message),{code}),safeErrorSummary:e=>e.message,toastText:x=>x},
  '../core/state.js':{state},
  '../extras/mv.js':{captureMvTarget:(context,songId)=>({scope:context.scope,songId}),mvScope:c=>c.scope,isCurrentMvTarget:()=>validTarget,patchRecord:(_id,p)=>{h.patches.push(p);return p;},readMv:()=>({settings:{},shots:[]}),normalizeSettings:()=>({})},
  '../extras/mvMusicLink.js':{musicUrl:x=>x},
  '../extras/mvAudioSource.js':{...h.sourceModule.namespace}
 };
 const imports=[...production.matchAll(/import \* as (\w+) from '([^']+)'/g)];
 const mod=new vm.SourceTextModule(production+`
Object.assign(view,{scope:'chat-A',songId:'song-1',epoch:1,sub:'asset-editor'});export const audit={restoreAudio,acceptAudio,removeMusic,returnToSong,disposeMv,handleMvChange,handleMvClick,audioBySong,audioLoads,audioTried,view};`,{context:h.context});
 await mod.link(specifier=>{
  if(specifier==='../extras/mvMedia.js')return h.mediaModule;
  const alias=imports.find(x=>x[2]===specifier)?.[1];
  const keys=alias?[...new Set([...production.matchAll(new RegExp('\\b'+alias+'\\.(\\w+)','g'))].map(x=>x[1]))]:['state'];
  const values=Object.fromEntries(keys.map(k=>[k,()=>{}]));Object.assign(values,overrides[specifier]);
  return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context:h.context});
 });await mod.evaluate();return {...mod.namespace.audit,state,errors,rendered:()=>rendered,changeSong:()=>{validTarget=false;}};
}
const file = (name='audio.wav') => Object.assign(new Blob(['audio'], {type:'audio/wav'}), {name});
const choose = (m, chosen) => m.handleMvChange({target:{matches:s=>s==='[data-rmt-mv-audio]',files:[chosen],value:'file'}});
const remove = m => m.handleMvClick({target:{closest:()=>({dataset:{rmtMv:'audio-remove'}})},preventDefault(){}});
async function flush() { await tick(); await tick(); }
async function seedMv(h,m) { await h.seed(); m.restoreAudio(); await h.until(()=>h.probes.length===1);h.ready();await flush(); }

test('temporary song audio is usable in MV without a disk row', async()=>{
 const h=await harness(),m=await mvHarness(h);h.storageUnavailable(true);m.state.activeMode='themeSong';
 const p=h.api.importSongFile(h.ctx,h.song,file('temporary.wav'));await h.until(()=>h.probes.length===1);h.ready();assert.equal(await p,true);
 m.state.activeMode='songMv';m.restoreAudio();await h.until(()=>h.probes.length===2);h.ready();await flush();
 assert.equal(m.audioBySong.get(h.key)?.name,'temporary.wav');assert.equal(h.rows.has(h.key),false);
});
test('MV temporary import can be removed while device storage is unavailable',async()=>{
 const h=await harness(),m=await mvHarness(h);h.storageUnavailable(true);choose(m,file('mv-temporary.wav'));
 await h.until(()=>h.probes.length===1);h.ready();await flush();
 if(h.probes.length>1)h.ready();await flush();
 assert.equal(m.audioBySong.get(h.key)?.name,'mv-temporary.wav');remove(m);await flush();
 assert.equal(m.audioBySong.has(h.key),false);assert.equal(h.api.currentSongAudio(h.ctx,h.song),null);assert.equal(m.errors.length,0);
});
test('MV removal invalidates song page audio before returning and releasing',async()=>{
 const h=await harness(),m=await mvHarness(h);await seedMv(h,m);remove(m);await h.until(h.write);h.write().commit();await flush();m.returnToSong();await flush();
 assert.equal(h.api.currentSongAudio(h.ctx,h.song),null);assert.doesNotMatch(m.rendered(),/<audio/);assert.equal(h.rows.has(h.key),false);
});
test('MV replacement appears on the song page when returning',async()=>{
 const h=await harness(),m=await mvHarness(h);await seedMv(h,m);choose(m,file('replacement.wav'));await h.until(()=>h.probes.length===2);h.ready();await h.until(h.write);h.write().commit();await flush();
 if(h.probes.length>2)h.ready();await flush();m.returnToSong();await flush();
 assert.equal(h.api.currentSongAudio(h.ctx,h.song)?.name,'replacement.wav');assert.match(m.rendered(),/replacement.wav/);assert.equal(h.rows.get(h.key).name,'replacement.wav');
});
test('failed MV replacement keeps durable audio and its duration',async()=>{
 const h=await harness(),m=await mvHarness(h);await seedMv(h,m);const patches=h.patches.length;choose(m,file('failed.wav'));await h.until(()=>h.probes.length===2);h.ready(1,240);await h.until(h.write);h.write().fail();await flush();
 assert.equal(m.audioBySong.get(h.key)?.name,'original');assert.equal(h.api.currentSongAudio(h.ctx,h.song)?.name,'original');assert.equal(h.patches.length,patches);assert.equal(h.rows.get(h.key).name,'original');
});

test('failed MV removal retains both players and the durable row', async () => {
    const h = await harness(), m = await mvHarness(h); await seedMv(h, m);
    remove(m); await h.until(h.write); h.write().fail(); await flush();
    assert.equal(m.audioBySong.get(h.key)?.name, 'original');
    assert.equal(h.api.currentSongAudio(h.ctx, h.song)?.name, 'original');
    assert.equal(h.rows.get(h.key).name, 'original');
    assert.equal(m.errors.length, 1);
});
test('leaving MV cancels a pending file probe before any storage write', async () => {
    const h = await harness(), m = await mvHarness(h); await seedMv(h, m);
    const patches = h.patches.length;
    choose(m, file('cancelled.wav')); await h.until(() => h.probes.length === 2);
    const late = h.probes[1].onloadedmetadata;
    m.disposeMv(); await flush(); h.probes[1].duration = 200; late(); await flush();
    assert.equal(h.transactions.some(tx => tx.mode === 'readwrite'), false);
    assert.equal(h.rows.get(h.key).name, 'original'); assert.equal(h.patches.length, patches);
});
test('changing chats during MV import cannot write to either song', async () => {
    const h = await harness(), m = await mvHarness(h); await seedMv(h, m);
    choose(m, file('wrong-chat.wav')); await h.until(() => h.probes.length === 2);
    h.ctx.scope = 'chat-B'; h.switchScope('chat-B'); h.ready(); await flush();
    assert.equal(h.transactions.some(tx => tx.mode === 'readwrite'), false);
    assert.equal(h.rows.get(h.key).name, 'original');
    assert.equal(h.api.currentSongAudio(h.ctx, h.song), null);
});
test('MV physical commit remains authoritative when its receipt arrives after leaving', async () => {
    const h = await harness(), m = await mvHarness(h); await seedMv(h, m);
    choose(m, file('committed.wav')); await h.until(() => h.probes.length === 2); h.ready();
    await h.until(h.write); const tx = h.write(); tx.commit(true);
    m.disposeMv(); tx.oncomplete(); await flush();
    assert.equal(h.rows.get(h.key).name, 'committed.wav');
    assert.equal((await h.api.loadSongAudio(h.ctx, h.song))?.name, 'committed.wav');
});
test('a delayed MV receipt cannot overwrite a newer song page import', async () => {
    const h = await harness(), m = await mvHarness(h); await seedMv(h, m);
    choose(m, file('older.wav')); await h.until(() => h.probes.length === 2); h.ready();
    await h.until(h.write); const older = h.write(); older.commit(true);
    const newer = h.api.importSongFile(h.ctx, h.song, file('newer.wav'));
    await h.until(() => h.probes.length === 3); h.ready(); await h.until(h.write); h.write().commit();
    assert.equal(await newer, true); older.oncomplete(); await flush();
    if (h.probes.length > 3) h.ready(); await flush();
    assert.equal(h.rows.get(h.key).name, 'newer.wav');
    assert.equal(h.api.currentSongAudio(h.ctx, h.song)?.name, 'newer.wav');
    assert.equal(m.audioBySong.get(h.key)?.name, 'newer.wav');
});
function videoFile(hasAudio = true) {
    const box = (name, ...parts) => { const payload = Buffer.concat(parts); const out = Buffer.alloc(8 + payload.length); out.writeUInt32BE(out.length); out.write(name, 4); payload.copy(out, 8); return out; };
    const handler = Buffer.alloc(12); handler.write('soun', 8);
    const samples = Buffer.alloc(12); samples.writeUInt32BE(1, 8);
    const track = box('trak', box('mdia', box('hdlr', handler), box('minf', box('stbl', box('stsz', samples)))));
    return Object.assign(new Blob([box('moov', ...(hasAudio ? [track] : []))], { type: 'video/mp4' }), { name: 'recording.mp4' });
}
test('a silent video cannot replace an existing MV song', async () => {
    const h = await harness(), m = await mvHarness(h); await seedMv(h, m);
    choose(m, videoFile(false)); await flush();
    assert.equal(h.probes.length, 1); assert.equal(h.transactions.some(tx => tx.mode === 'readwrite'), false);
    assert.equal(h.api.currentSongAudio(h.ctx, h.song)?.name, 'original');
    assert.match(m.view.musicLinkStatus, /没有可用音轨/);
});
test('video import requires decoded audio data as well as a real audio track', async () => {
    const h = await harness(), m = await mvHarness(h); await seedMv(h, m);
    choose(m, videoFile()); await h.until(() => h.probes.length === 2);
    const probe = h.probes[1]; probe.duration = 120; probe.readyState = 1; probe.onloadedmetadata(); await flush();
    assert.equal(h.transactions.some(tx => tx.mode === 'readwrite'), false);
    probe.readyState = 2; probe.onloadeddata(); await h.until(h.write); h.write().commit(); await flush();
    await h.until(() => h.probes.length === 3); h.ready(); await flush();
    assert.equal(h.rows.get(h.key).name, 'recording.mp4');
    assert.equal(h.api.currentSongAudio(h.ctx, h.song)?.name, 'recording.mp4');
    assert.equal(m.audioBySong.get(h.key)?.fromVideo, true);
});


test('changing the song itself during MV import rejects its old target before writing', async () => {
    const h = await harness(), m = await mvHarness(h); await seedMv(h, m);
    choose(m, file('stale-song.wav')); await h.until(() => h.probes.length === 2);
    m.changeSong(); h.ready(); await flush();
    const wrote = h.transactions.some(tx => tx.mode === 'readwrite');
    m.disposeMv(); await flush();
    assert.equal(wrote, false);
    assert.equal(h.rows.get(h.key).name, 'original');
});


test('changing the song while its audio write is pending aborts before storage commit', async () => {
    const h = await harness(), m = await mvHarness(h); await seedMv(h, m);
    const patches = h.patches.length;
    choose(m, file('stale-during-storage.wav')); await h.until(() => h.probes.length === 2); h.ready();
    await h.until(h.write); const tx = h.write(); m.changeSong(); tx.commit(); await flush();
    assert.equal(tx.aborted, true);
    assert.equal(h.rows.get(h.key).name, 'original');
    assert.equal(h.api.currentSongAudio(h.ctx, h.song)?.name, 'original');
    assert.equal(h.patches.length, patches);
});

let failed=0;
for(const {name,fn}of tests){try{await fn();console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.message);}}
console.log(`MV audio integration: ${tests.length-failed}/${tests.length} passed`);process.exitCode=failed?1:0;
