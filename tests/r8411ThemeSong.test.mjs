import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/r847Host.mjs';
import * as song from '../src/modes/themeSong.js';
import * as contract from '../src/core/themeSongContract.js';
import * as client from '../src/generation/client.js';
import * as cache from '../src/core/cache.js';
import * as core from '../src/core/context.js';
import * as constants from '../src/core/constants.js';
import * as overlay from '../src/ui/overlay.js';
import * as view from '../src/ui/themeSongView.js';
import { state } from '../src/core/state.js';
const MODE = constants.MODE.THEME_SONG;
const raw = (title = '把风留给明天') => ({title, vocalDescription:'角色独唱，温暖低音，副歌渐强。',
 styleDescription:'原声钢琴与轻弦乐，安静起笔，副歌温暖展开。',
 stylePrompt:'Indie pop ballad, warm low vocals, piano, soft strings, 82 BPM, intimate verse, uplifting chorus',
 lyrics:'[Verse 1]\n我把微光放在手心\n等一朵花慢慢苏醒\n[Chorus]\n把风留给明天\n把话留在你能听见的身边\n[Bridge]\n雨停之前也不必急着走远\n[Final Chorus]\n把风留给明天\n把话留在你能听见的身边\n[Outro]\n让微光陪着你入眠\n[End]'});
const opts = {subject:'character',language:'zh',voice:'char',direction:'克制、钢琴，副歌明亮'};
async function generate(f,title='把风留给明天',extra={}) {
 f.setResponse(raw(title)); return client.generateMode(MODE,{background:false,songOptions:opts,...extra});
}
function single(memory, overrides={}) {
 const plan=song.validateThemeSongPlan(song.createThemeSongPlan(opts,memory),memory);
 const item=song.normalizeGeneratedSong({...raw(),...overrides},plan,memory);
 return {...contract.emptyThemeSongs(memory),songs:[item],selectedId:item.id};
}
const mb={chatId:'test',archiveRevision:'rev',characterName:'林舟',userName:'小月',memories:[]};

test('song first entry is a theme-aware empty reader; zero provider sends and no empty-song commit',async t=>{
 const f=await fixture(t); const before=await f.persisted(); await f.open(MODE);
 assert.equal(state.activeMode,MODE); assert.equal(state.activeSession.songs.length,0);
 assert.match(f.body.innerHTML,/角色印象曲/);assert.match(f.body.innerHTML,/创作印象曲/);
 assert.equal(f.requests.length,0);assert.deepEqual(await f.persisted(),before);
});
test('character song uses controlled persona; real generation and backup/cache reopen need one request',async t=>{
 const f=await fixture(t);await f.open(MODE);const old=await f.persisted();const result=await generate(f);
 assert.ok(result,JSON.stringify(f.notices));assert.equal(f.requests.length,1);
 const saved=await f.persisted();assert.equal(saved.themeSong.songs.length,1);assert.deepEqual(saved.phone,old.phone);assert.deepEqual(saved.cabinet,old.cabinet);
 assert.equal(saved.themeSong.songs[0].singer,'林舟');assert.deepEqual(saved.themeSong.songs[0].sourceMemoryIds,[]);
 assert.equal(state.activeSession.songs[0].title,'把风留给明天');
 assert.match(JSON.stringify(f.requests[0]),/CARD_A_ONLY/);assert.match(JSON.stringify(f.requests[0]),/PERSONA_A_ONLY/);
 assert.doesNotMatch(JSON.stringify(f.requests[0]),/CARD_B_ONLY/);
 await f.open(MODE);assert.equal(state.activeSession.songs[0].lyrics,raw().lyrics);assert.equal(f.requests.length,1);
 assert.equal(cache.loadGenerationRecovery(MODE,f.ctx),null);
});
test('event song binds selected real Mxxx locally; model cannot choose IDs, singer, target or storage',async t=>{
 const f=await fixture(t);await f.open(MODE);
 f.setResponse({...raw('庭院里的回声'),id:'overwrite',singer:'别人的声音',subject:'character',sourceMemoryIds:['M999'],sourceMemoryAnchor:'伪造',chatId:'OTHER',url:'javascript:bad',__target:'phone'});
 const got=await client.generateMode(MODE,{songOptions:{...opts,subject:'event',eventId:'M001',voice:'duet'}});
 assert.ok(got,JSON.stringify(f.notices));const item=(await f.persisted()).themeSong.songs[0];
 assert.equal(item.subject,'event');assert.equal(item.singer,'林舟 / 小月');assert.deepEqual(item.sourceMemoryIds,['M001']);assert.equal(item.sourceMemoryAnchor,'庭院');
 assert.match(item.id,/^SONG_/);assert.equal(item.chatId,undefined);assert.equal(item.url,undefined);
 assert.match(JSON.stringify(f.requests[0]),/栽花/);assert.equal(f.requests.length,1);
});
test('fresh character lyrics need no historical memory at the song contract level',()=>{
 const songset=single(mb);assert.equal(songset.songs.length,1);assert.equal(songset.songs[0].subject,'character');
 assert.deepEqual(songset.songs[0].sourceMemoryIds,[]);
});
test('invalid/foreign event stops before any provider call',async t=>{
 const f=await fixture(t);await f.open(MODE);
 const result=await generate(f,'不应生成',{songOptions:{...opts,subject:'event',eventId:'M999'}});
 assert.equal(result,null);assert.equal(f.requests.length,0);assert.equal((await f.persisted()).themeSong,undefined);
});
test('new song appends, keeps prior lyrics and other modes, and no new Mxxx is required',async t=>{
 const f=await fixture(t);await f.open(MODE);await generate(f,'第一首');
 const first=(await f.persisted()).themeSong.songs[0];await f.open(MODE);await generate(f,'第二首');
 const saved=(await f.persisted()).themeSong;assert.equal(f.requests.length,2);assert.equal(saved.songs.length,2);
 assert.deepEqual(saved.songs[0],first);assert.equal(saved.songs[1].title,'第二首');
});
test('same-mode double click cannot send a second concurrent song request',async t=>{
 const f=await fixture(t);await f.open(MODE);f.setResponse(raw());const wait=f.pauseProvider();
 const first=client.generateMode(MODE,{songOptions:opts,background:true});await wait.ready;
 try {await client.generateMode(MODE,{songOptions:opts,background:true});assert.equal(f.requests.length,1);} finally {wait.release();}
 await first;assert.equal((await f.persisted()).themeSong.songs.length,1);
});
test('navigation during generation retains new song in original archive without stealing the reader',async t=>{
 const f=await fixture(t);await f.open(MODE);f.setResponse(raw());const wait=f.pauseProvider();
 const pending=client.generateMode(MODE,{songOptions:opts,background:false});await wait.ready;
 const reader={kind:'phone',marker:'keep-current-page'};state.activeMode='phone';state.activeSession=reader;
 wait.release();await pending;assert.equal(state.activeSession,reader);assert.equal(state.activeMode,'phone');
 assert.equal((await f.persisted()).themeSong.songs.length,1);
});
test('language and performer choices are local, not replaced by model response; exports separate fields',()=>{
 const plan=song.createThemeSongPlan({...opts,language:'ja',voice:'duet'},mb);
 const got=song.normalizeGeneratedSong({...raw(),language:'en',voice:'narrator'},plan,mb);
 assert.equal(got.language,'ja');assert.equal(got.voice,'duet');assert.equal(got.singer,'林舟 / 小月');
 assert.equal(contract.themeSongExport(got,'lyrics'),got.lyrics);assert.equal(contract.themeSongExport(got,'style'),got.stylePrompt);
 assert.equal(contract.themeSongExport(got,'title'),got.title);assert.match(contract.themeSongExport(got),/完整歌词/);
 assert.doesNotMatch(contract.themeSongExport(got,'style'),/完整歌词|\[Verse/);
});
for(const [name,lyrics] of [
 ['missing ending','[Verse 1]\n正文\n[Chorus]\n副歌'],
 ['empty chorus','[Verse 1]\n正文\n[Chorus]\n[Outro]\n收尾\n[End]'],
 ['empty verse','[Verse 1]\n[Chorus]\n副歌\n[End]'],
 ['placeholder','[Verse 1]\n正文\n[Chorus]\n副歌同上\n[End]'],
 ['early End','[Verse 1]\n正文\n[End]\n[Chorus]\n副歌\n[End]'],
 ['too long', '[Verse 1]\n'+'字'.repeat(5001)+'\n[Chorus]\n副歌\n[End]']])
 test('complete-lyrics validation rejects '+name,()=>assert.throws(()=>single(mb,{lyrics}),/歌词|过长/));
test('minimal complete verse and chorus works, no forced fixed verse count',()=>assert.ok(single(mb,{lyrics:'[Verse]\n主歌\n[Chorus]\n副歌\n[End]'})));
test('failed new song never replaces good songs or silently retries',async t=>{
 const f=await fixture(t);await f.open(MODE);await generate(f);const old=(await f.persisted()).themeSong;
 f.setResponse({...raw(),lyrics:'[Verse 1]\n未完'});await client.generateMode(MODE,{songOptions:opts,background:true});
 assert.deepEqual((await f.persisted()).themeSong.songs,old.songs);assert.equal(f.requests.length,2);
 assert.ok(cache.loadGenerationRecovery(MODE,f.ctx));
});
test('continuation reuses exact original song plan and language instead of new choices',async t=>{
 const f=await fixture(t);await f.open(MODE);f.setResponse({...raw(),lyrics:'未写完'});
 await client.generateMode(MODE,{songOptions:{...opts,language:'ja'},background:true});
 const draft=cache.loadGenerationRecovery(MODE,f.ctx);assert.ok(draft?.operation.themeSongPlan);
 const plan=draft.operation.themeSongPlan;f.setResponse(raw('续写完成'));
 await client.continueSavedGeneration(MODE,{songOptions:{...opts,language:'en'}});
 const item=(await f.persisted()).themeSong.songs[0];assert.equal(item.id,plan.id);assert.equal(item.language,'ja');
 assert.equal(f.requests.length,2);assert.equal(cache.loadGenerationRecovery(MODE,f.ctx),null);
});
test('automatic scheduler cannot initiate song generation and whole collection replacement is prohibited',async t=>{
 const f=await fixture(t);await f.open(MODE);assert.deepEqual(await client.generateMode(MODE,{automatic:true}),{status:'noop'});
 await assert.rejects(client.generateMode(MODE,{replaceExisting:true}),/不会整册覆盖/);assert.equal(f.requests.length,0);
 assert.equal(f.requests.length,0);
});
test('readonly and independent-backup song entry is viewable; action cannot generate',async t=>{
 const f=await fixture(t);await f.historical(MODE);state.activeArchiveReadOnly=true;
 await view.handleThemeSongAction('generate');assert.equal(f.requests.length,0);
 state.activeArchiveReadOnly=false;state.activeArchiveSnapshot.backupOnly=true;
 await view.handleThemeSongAction('generate');assert.equal(f.requests.length,0);
});
test('historical archive generation captures the historical card and stores only in its isolated backup',async t=>{
 const f=await fixture(t);const options=await f.historical(MODE);f.setResponse(raw());
 await client.generateMode(MODE,{...options,songOptions:opts,background:false});
 const a=await f.persisted(),b=await f.persisted(f.bEntry);
 assert.equal(a.themeSong,undefined);assert.equal(b.themeSong.songs.length,1);assert.equal(b.themeSong.songs[0].singer,'沈砚');
 assert.match(JSON.stringify(f.requests),/CARD_B_ONLY/);assert.doesNotMatch(JSON.stringify(f.requests),/CARD_A_ONLY/);
 assert.equal(f.ctx.chatId,f.liveBank.chatId);assert.equal(f.requests.length,1);
});
test('revision change while writing cannot overwrite archive or leak results into other mode',async t=>{
 const f=await fixture(t);await f.open(MODE);f.setResponse(raw());const wait=f.pauseProvider();
 const pending=client.generateMode(MODE,{songOptions:opts,background:true});await wait.ready;
 f.ctx.chatMetadata[constants.MEMORY_KEY].archiveRevision='rev-next';wait.release();await pending;
 assert.equal((await f.persisted()).themeSong,undefined);assert.equal(f.ctx.chatMetadata[constants.MEMORY_KEY].archiveRevision,'rev-next');
});
test('runtime destruction while writing cannot commit song result',async t=>{
 const f=await fixture(t);await f.open(MODE);f.setResponse(raw());const wait=f.pauseProvider();
 const pending=client.generateMode(MODE,{songOptions:opts,background:true});await wait.ready;
 state.runtimeLifecycleEpoch++;wait.release();await pending;assert.equal((await f.persisted()).themeSong,undefined);
});
test('canonical save failure preserves successful validated segment for zero-send replay, no false saved song',async t=>{
 const f=await fixture(t);await f.open(MODE);f.failCompletedSave(MODE,x=>x?.songs?.length);await generate(f);
 assert.equal((await f.persisted()).themeSong,undefined);assert.ok(f.rejectedWrites()>0);assert.equal(f.requests.length,1);
 f.failCompletedSave('');await client.continueSavedGeneration(MODE);
 assert.equal(f.requests.length,1);assert.equal((await f.persisted()).themeSong.songs.length,1);
});
test('malicious provider markup is rejected by existing safety gates, and stored text cannot execute in renderer',async t=>{
 const f=await fixture(t);await f.open(MODE);f.setResponse({...raw('<img src=x onerror=bad()>'),vocalDescription:'<script>bad()</script>'});
 await client.generateMode(MODE,{songOptions:opts,background:false});
 assert.equal((await f.persisted()).themeSong,undefined);
 state.activeSession=single(f.liveBank,{title:'<img src=x onerror=bad()>',vocalDescription:'<script>bad()</script>'});
 view.renderThemeSongs();assert.match(f.body.innerHTML,/&lt;img/);assert.doesNotMatch(f.body.innerHTML,/<img src=x|<script>bad/);
});
test('unreadable existing record cannot be overwritten by treating it as new',async t=>{
 const f=await fixture(t);await f.open(MODE);await generate(f);const bad=cache.getCache(f.ctx).themeSong;
 bad.themeSongVersion=999; // runtime cache candidate; canonical tests handle revalidation, contract fails closed
 assert.equal(cache.loadSession(MODE),null);assert.throws(()=>contract.mergeThemeSongs(bad,single(f.liveBank)),/结构/);
});
test('append CAS merge preserves latest sibling song and is idempotent for a replayed same song',()=>{
 const one=single(mb);const two=structuredClone(single(mb,{title:'第二首'}));two.songs[0].id+='_two';two.selectedId=two.songs[0].id;
 const merged=contract.mergeThemeSongs(one,two);assert.equal(merged.songs.length,2);assert.deepEqual(merged.songs[0],one.songs[0]);
 assert.deepEqual(contract.mergeThemeSongs(merged,two),merged);
 const collision=structuredClone(two);collision.songs[0].title='冒名覆盖';assert.throws(()=>contract.mergeThemeSongs(merged,collision),/覆盖/);
 const foreign=structuredClone(two);foreign.chatId='another';assert.throws(()=>contract.mergeThemeSongs(one,foreign),/聊天/);
});
test('one-song deletion has two confirmations and preserves other works in canonical cache',async t=>{
 const f=await fixture(t);await f.open(MODE);await generate(f,'第一首');await f.open(MODE);await generate(f,'第二首');await f.open(MODE);
 const old=await f.persisted();const id=state.activeSession.songs[0].id;let count=0;globalThis.confirm=()=>{count++;return true;};
 assert.equal(await view.deleteThemeSong(id),true);assert.equal(count,2);
 const saved=await f.persisted();assert.equal(saved.themeSong.songs.length,1);assert.equal(saved.themeSong.songs[0].title,'第二首');
 assert.deepEqual(saved.phone,old.phone);assert.deepEqual(saved.cabinet,old.cabinet);
});
test('cancel deletion or change reader during confirmation does not write',async t=>{
 const f=await fixture(t);await f.open(MODE);await generate(f);const saved=await f.persisted(),id=state.activeSession.songs[0].id;
 globalThis.confirm=()=>false;assert.equal(await view.deleteThemeSong(id),false);assert.deepEqual(await f.persisted(),saved);
 globalThis.confirm=()=>{state.activeMode='phone';return true;};assert.equal(await view.deleteThemeSong(id),false);assert.deepEqual(await f.persisted(),saved);
});
test('historical song delete changes only the explicitly selected archive',async t=>{
 const f=await fixture(t);const options=await f.historical(MODE);f.setResponse(raw());await client.generateMode(MODE,{...options,songOptions:opts});
 await f.historical(MODE);const id=state.activeSession.songs[0].id;assert.equal(await view.deleteThemeSong(id),true);
 assert.equal((await f.persisted(f.bEntry)).themeSong.songs.length,0);assert.equal((await f.persisted()).themeSong,undefined);
});
