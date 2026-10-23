// Run with: node --experimental-vm-modules tests/healthcheck-extras-audio.mjs
// Uses production songPlayer + mvMedia, with controllable browser/IndexedDB boundaries.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = process.env.HEARTTRACE_AUDIO_SOURCE_ROOT || fileURLToPath(new URL('../', import.meta.url));
const tick = () => new Promise(setImmediate);
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

async function harness() {
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
        dispatchEvent: event => events.push(event),
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
    const ready = (index = probes.length - 1, duration = 120) => { const probe = probes[index]; probe.duration = duration; probe.onloadedmetadata?.(); };
    const write = () => transactions.find(tx => tx.mode === 'readwrite' && !tx.done);
    const until = async predicate => { for (let n = 0; n < 20 && !predicate(); n++) await tick(); assert.ok(predicate(), 'expected boundary was reached'); };
    const seed = async () => { rows.set(key, { key, mediaUrl: 'https://audio.example/original.mp3', name: 'original' }); await api.loadSongAudio(ctx, song); };
    return { api, media: media.namespace, ctx, song, key, rows, transactions, probes, revoked, patches, events, ready, write, until, seed,
        holdReads: value => { holdReads = value; }, storageUnavailable: value => { storageUnavailable = value; }, switchScope: value => { currentScope = value; } };
}

test('normal link import commits audio and duration together', async () => {
    const h = await harness(); const pending = h.api.importSongLink(h.ctx, h.song, 'https://audio.example/normal.mp3');
    await h.until(() => h.probes.length === 1); h.ready(); await h.until(h.write); h.write().commit();
    assert.equal(await pending, true); assert.equal(h.rows.get(h.key).mediaUrl, 'https://audio.example/normal.mp3');
    assert.equal(h.api.currentSongAudio(h.ctx, h.song).url, h.rows.get(h.key).mediaUrl); assert.equal(h.patches.length, 1);
});
test('cancel during probe preserves old audio and duration', async () => {
    const h = await harness(); await h.seed(); const pending = h.api.importSongLink(h.ctx, h.song, 'https://audio.example/cancelled.mp3');
    await h.until(() => h.probes.length === 1); const late = h.probes[0].onloadedmetadata; h.api.cancelSongImport(h.ctx, h.song);
    h.probes[0].duration = 120; late(); await tick();
    assert.equal(h.transactions.some(tx => tx.mode === 'readwrite'), false, 'cancelled probe must never start a storage write');
    assert.equal(await pending, false);
    assert.equal(h.rows.get(h.key).mediaUrl, 'https://audio.example/original.mp3'); assert.equal(h.api.currentSongAudio(h.ctx, h.song).name, 'original'); assert.equal(h.patches.length, 0);
});
test('remove during probe cannot resurrect audio', async () => {
    const h = await harness(); await h.seed(); const pending = h.api.importSongLink(h.ctx, h.song, 'https://audio.example/late.mp3');
    await h.until(() => h.probes.length === 1); const late = h.probes[0].onloadedmetadata;
    const removal = h.api.removeSongAudio(h.ctx, h.song); await h.until(h.write); h.write().commit();
    assert.equal(await removal, true); h.probes[0].duration = 120; late(); assert.equal(await pending, false);
    assert.equal(h.rows.has(h.key), false); assert.equal(h.api.currentSongAudio(h.ctx, h.song), null); assert.equal(h.patches.length, 0);
});
test('new file import supersedes old link and is cancellable too', async () => {
    const h = await harness(); const first = h.api.importSongLink(h.ctx, h.song, 'https://audio.example/first.mp3');
    await h.until(() => h.probes.length === 1); const late = h.probes[0].onloadedmetadata;
    const blob = new Blob(['audio'], { type: 'audio/wav' }); blob.name = 'second.wav';
    const second = h.api.importSongFile(h.ctx, h.song, blob); await h.until(() => h.probes.length === 2);
    h.ready(1); await h.until(h.write); h.write().commit(); assert.equal(await second, true);
    h.probes[0].duration = 77; late(); assert.equal(await first, false); assert.equal(h.api.currentSongAudio(h.ctx, h.song).name, 'second.wav');
    assert.equal(h.patches.length, 1); assert.equal(h.patches[0].duration, 120);
    const cancelled = h.api.importSongFile(h.ctx, h.song, blob); await h.until(() => h.probes.length === 3); h.api.cancelSongImport(h.ctx, h.song);
    assert.equal(await cancelled, false); assert.equal(h.api.currentSongAudio(h.ctx, h.song).name, 'second.wav'); assert.ok(h.revoked.includes('blob:test-2'));
});
test('cancel during actual IDB write aborts transaction and keeps old row', async () => {
    const h = await harness(); await h.seed(); const pending = h.api.importSongLink(h.ctx, h.song, 'https://audio.example/writing.mp3');
    await h.until(() => h.probes.length === 1); h.ready(); await h.until(h.write); const tx = h.write();
    h.api.cancelSongImport(h.ctx, h.song); assert.equal(await pending, false); assert.equal(tx.aborted, true);
    assert.equal(h.rows.get(h.key).name, 'original'); assert.equal(h.api.currentSongAudio(h.ctx, h.song).name, 'original'); assert.equal(h.patches.length, 0);
});
test('cancel after commit respects transaction result without compensation', async () => {
    const h = await harness(); await h.seed(); const pending = h.api.importSongLink(h.ctx, h.song, 'https://audio.example/committed.mp3');
    await h.until(() => h.probes.length === 1); h.ready(); await h.until(h.write); const tx = h.write(); tx.commit(true);
    h.api.cancelSongImport(h.ctx, h.song); tx.oncomplete(); assert.equal(await pending, true);
    assert.equal(h.api.currentSongAudio(h.ctx, h.song).url, h.rows.get(h.key).mediaUrl); assert.equal(h.patches.length, 1);
});
for (const removing of [false, true]) test(`confirmed ${removing ? 'removal' : 'import'} remains visible when its replacement fails before commit`, async () => {
    const h = await harness(); await h.seed();
    const first = removing ? h.api.removeSongAudio(h.ctx, h.song)
        : h.api.importSongLink(h.ctx, h.song, 'https://audio.example/committed.mp3');
    if (!removing) { await h.until(() => h.probes.length === 1); h.ready(0, 144); }
    await h.until(h.write); const tx = h.write(); tx.commit(true);
    const second = h.api.importSongLink(h.ctx, h.song, 'https://audio.example/fails.mp3');
    await h.until(() => h.probes.length === (removing ? 1 : 2));
    tx.oncomplete(); h.probes.at(-1).onerror();
    await first; assert.equal(await second, false);
    assert.equal(h.api.currentSongAudio(h.ctx, h.song)?.url || null, h.rows.get(h.key)?.mediaUrl || null);
    assert.equal(h.api.currentSongAudio(h.ctx, h.song)?.url || null, removing ? null : 'https://audio.example/committed.mp3');
    assert.equal(h.patches.length, removing ? 0 : 1);
    if (!removing) assert.equal(h.patches[0].duration, 144);
});
test('late completion of an older committed write cannot replace a newer confirmed write', async () => {
    const h = await harness(); await h.seed();
    const first = h.api.importSongLink(h.ctx, h.song, 'https://audio.example/first-committed.mp3');
    await h.until(() => h.probes.length === 1); h.ready(0, 144); await h.until(h.write);
    const firstTx = h.write(); firstTx.commit(true);
    const second = h.api.importSongLink(h.ctx, h.song, 'https://audio.example/second-committed.mp3');
    await h.until(() => h.probes.length === 2); h.ready(1, 180); await h.until(h.write); h.write().commit();
    assert.equal(await second, true); firstTx.oncomplete(); assert.equal(await first, false);
    assert.equal(h.api.currentSongAudio(h.ctx, h.song).url, 'https://audio.example/second-committed.mp3');
    assert.equal(h.rows.get(h.key).mediaUrl, 'https://audio.example/second-committed.mp3');
    assert.equal(h.patches.length, 1); assert.equal(h.patches[0].duration, 180);
});
test('storage failure preserves old player and storyboard duration', async () => {
    const h = await harness(); await h.seed(); const file = new Blob(['bad-disk']); file.name = 'not-saved.wav';
    const pending = h.api.importSongFile(h.ctx, h.song, file); await h.until(() => h.probes.length === 1); h.ready(); await h.until(h.write); h.write().fail();
    assert.equal(await pending, false); assert.equal(h.rows.get(h.key).name, 'original'); assert.equal(h.api.currentSongAudio(h.ctx, h.song).name, 'original');
    assert.equal(h.patches.length, 0); assert.ok(h.revoked.includes('blob:test-1'));
});
test('first import retains temporary playback when device storage is unavailable', async () => {
    const h = await harness(); const file = new Blob(['temporary']); file.name = 'temporary.wav';
    const pending = h.api.importSongFile(h.ctx, h.song, file);
    await h.until(() => h.probes.length === 1); h.ready(); await h.until(h.write); h.write().fail();
    assert.equal(await pending, true); assert.equal(h.rows.has(h.key), false);
    assert.equal(h.api.currentSongAudio(h.ctx, h.song).name, 'temporary.wav');
    assert.equal(h.api.currentSongAudio(h.ctx, h.song).unsaved, true);
    h.api.releaseSongAudio(); assert.equal(h.api.currentSongAudio(h.ctx, h.song).name, 'temporary.wav');
});
async function temporaryFile(h, name = 'temporary.wav') {
    const file = new Blob(['temporary']); file.name = name;
    const index = h.probes.length;
    const pending = h.api.importSongFile(h.ctx, h.song, file);
    await h.until(() => h.probes.length === index + 1); h.ready();
    await h.until(h.write); h.write().fail();
    assert.equal(await pending, true);
    return h.api.currentSongAudio(h.ctx, h.song);
}
test('temporary audio can be replaced repeatedly while storage writes keep failing', async () => {
    const h = await harness(); const first = await temporaryFile(h, 'first.wav');
    const second = await temporaryFile(h, 'second.wav');
    assert.equal(second.name, 'second.wav'); assert.equal(second.unsaved, true);
    assert.ok(h.revoked.includes(first.url)); assert.equal(h.rows.has(h.key), false);
    assert.equal(h.patches.length, 2);
});
test('temporary audio can be removed when storage deletion fails', async () => {
    const h = await harness(); const first = await temporaryFile(h);
    const pending = h.api.removeSongAudio(h.ctx, h.song);
    await h.until(h.write); h.write().fail();
    assert.equal(await pending, true); assert.equal(h.api.currentSongAudio(h.ctx, h.song), null);
    assert.ok(h.revoked.includes(first.url)); assert.equal(h.rows.has(h.key), false);
    assert.match(h.api.songPlayerHtml(h.ctx, h.song), /已移除临时音源/);
});
test('cancelling replacement of temporary audio preserves its original URL and duration', async () => {
    const h = await harness(); const first = await temporaryFile(h);
    const pending = h.api.importSongLink(h.ctx, h.song, 'https://audio.example/cancel-temp.mp3');
    await h.until(() => h.probes.length === 2); h.ready(); await h.until(h.write);
    h.api.cancelSongImport(h.ctx, h.song);
    assert.equal(await pending, false); assert.equal(h.api.currentSongAudio(h.ctx, h.song).url, first.url);
    assert.equal(h.patches.length, 1);
});
test('a failed late removal cannot clear a newer temporary replacement', async () => {
    const h = await harness(); await temporaryFile(h, 'first.wav');
    const remove = h.api.removeSongAudio(h.ctx, h.song); await h.until(h.write);
    const second = await temporaryFile(h, 'second.wav');
    assert.equal(await remove, false); assert.equal(h.api.currentSongAudio(h.ctx, h.song).url, second.url);
});
test('removing a temporary track cancels its pending replacement without resurrection', async () => {
    const h = await harness(); await temporaryFile(h);
    const pending = h.api.importSongLink(h.ctx, h.song, 'https://audio.example/cancel-by-remove.mp3');
    await h.until(() => h.probes.length === 2); const late = h.probes[1].onloadedmetadata;
    const remove = h.api.removeSongAudio(h.ctx, h.song); await h.until(h.write); h.write().fail();
    assert.equal(await remove, true); h.probes[1].duration = 200; late();
    assert.equal(await pending, false); assert.equal(h.api.currentSongAudio(h.ctx, h.song), null);
    assert.equal(h.patches.length, 1);
});
test('successful storage recovery makes the replacement durable and preserves it on later failure', async () => {
    const h = await harness(); await temporaryFile(h);
    const saved = h.api.importSongLink(h.ctx, h.song, 'https://audio.example/recovered.mp3');
    await h.until(() => h.probes.length === 2); h.ready(); await h.until(h.write); h.write().commit();
    assert.equal(await saved, true); assert.equal(h.api.currentSongAudio(h.ctx, h.song).unsaved, undefined);
    const remove = h.api.removeSongAudio(h.ctx, h.song); await h.until(h.write); h.write().fail();
    assert.equal(await remove, false); assert.equal(h.api.currentSongAudio(h.ctx, h.song).name, 'recovered.mp3');
});
test('memory-only replacement and removal work when both reads and writes are unavailable', async () => {
    const h = await harness(); h.storageUnavailable(true);
    for (let index = 0; index < 2; index++) {
        const file = Object.assign(new Blob(['temporary']), { name: `temporary-${index}.wav` });
        const pending = h.api.importSongFile(h.ctx, h.song, file);
        await h.until(() => h.probes.length === index + 1); h.ready();
        assert.equal(await pending, true); assert.equal(h.api.currentSongAudio(h.ctx, h.song).name, file.name);
        assert.equal(h.api.currentSongAudio(h.ctx, h.song).unsaved, true);
    }
    assert.equal(await h.api.removeSongAudio(h.ctx, h.song), true);
    assert.equal(h.api.currentSongAudio(h.ctx, h.song), null);
    assert.equal(h.rows.size, 0);
});
for (const unreadable of [false, true]) for (const removing of [false, true]) test(`a delayed durable receipt prevents failed ${removing ? 'removal' : 'replacement'} from treating its row as temporary, readable=${!unreadable}`, async () => {
    const h = await harness(); const temporary = await temporaryFile(h);
    const durable = h.api.importSongLink(h.ctx, h.song, 'https://audio.example/durable.mp3');
    await h.until(() => h.probes.length === 2); h.ready(); await h.until(h.write);
    const committed = h.write(); committed.commit(true);
    const later = removing ? h.api.removeSongAudio(h.ctx, h.song)
        : h.api.importSongLink(h.ctx, h.song, 'https://audio.example/later.mp3');
    if (!removing) { await h.until(() => h.probes.length === 3); h.ready(); }
    await h.until(h.write); h.write().fail();
    if (unreadable) h.storageUnavailable(true);
    assert.equal(await later, false);
    assert.equal(h.api.currentSongAudio(h.ctx, h.song).url, temporary.url);
    committed.oncomplete(); await durable;
    assert.equal(h.api.currentSongAudio(h.ctx, h.song).url, 'https://audio.example/durable.mp3');
    assert.equal(h.rows.get(h.key).mediaUrl, 'https://audio.example/durable.mp3');
});
test('failed remove keeps existing audio', async () => {
    const h = await harness(); await h.seed(); const pending = h.api.removeSongAudio(h.ctx, h.song); await h.until(h.write); h.write().fail();
    assert.equal(await pending, false); assert.equal(h.api.currentSongAudio(h.ctx, h.song).name, 'original'); assert.equal(h.rows.get(h.key).name, 'original');
});
test('chat change keeps result in origin and cannot patch destination duration', async () => {
    const h = await harness(); const pending = h.api.importSongLink(h.ctx, h.song, 'https://audio.example/origin.mp3');
    await h.until(() => h.probes.length === 1); h.switchScope('chat-B'); h.ready(); await h.until(h.write); h.write().commit(); assert.equal(await pending, true);
    assert.equal(h.rows.get(h.key).mediaUrl, 'https://audio.example/origin.mp3'); assert.equal(h.api.currentSongAudio({ scope: 'chat-B' }, h.song), null); assert.equal(h.patches.length, 0);
});
test('late storage restore cannot replace newly imported audio', async () => {
    const h = await harness(); h.rows.set(h.key, { mediaUrl: 'https://audio.example/old.mp3', name: 'old' }); h.holdReads(true);
    const restoration = h.api.loadSongAudio(h.ctx, h.song); await h.until(() => h.transactions.some(tx => tx.mode === 'readonly'));
    const read = h.transactions.find(tx => tx.mode === 'readonly');
    const pending = h.api.importSongLink(h.ctx, h.song, 'https://audio.example/new.mp3'); await h.until(() => h.probes.length === 1); h.ready(); await h.until(h.write); h.write().commit(); await pending;
    read.commit(); await restoration; assert.equal(h.api.currentSongAudio(h.ctx, h.song).url, 'https://audio.example/new.mp3');
});
test('mvMedia optional guard cancels before write and leaves default calls working', async () => {
    const h = await harness(); const controller = new AbortController(); controller.abort();
    assert.equal(await h.media.putMedia('cancelled', new Blob(['x']), '', {}, { signal: controller.signal }), false);
    assert.equal(await h.media.putMedia('stale', new Blob(['x']), '', {}, { isCurrent: () => false }), false);
    assert.equal(h.transactions.length, 0);
    const put = h.media.putMedia('normal', new Blob(['x']), 'normal'); await h.until(h.write); h.write().commit(); assert.equal(await put, true); assert.equal(h.rows.get('normal').name, 'normal');
});

for (const { name, fn } of tests) { await fn(); console.log('PASS', name); }
console.log(`Audio healthcheck: ${tests.length}/${tests.length} passed`);
