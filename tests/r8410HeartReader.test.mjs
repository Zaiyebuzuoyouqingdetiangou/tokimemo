import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/r847Host.mjs';
import * as h from '../src/ui/heartView.js';
import * as reader from '../src/ui/heartReaderState.js';
import * as prefs from '../src/ui/workspaceState.js';
import * as overlay from '../src/ui/overlay.js';
import * as navigation from '../src/ui/navigationBookmark.js';
import * as images from '../src/generation/imageGeneration.js';
import * as constants from '../src/core/constants.js';
import { state } from '../src/core/state.js';
function seed(f) {
 reader.clearHeartReaderPositions(); prefs.workspace.route='';
 const prose='我想陪你读完这一页，然后走到窗边，看院子里的花。'.repeat(24);
 const drama=(id,kind)=>({id,kind,title:id,script:Array.from({length:10},()=>({speaker:'char',text:prose}))});
 const v={kind:'heart',chatId:f.liveBank.chatId,archiveRevision:f.liveBank.archiveRevision,relationshipSummary:'自然相处。',
 greetings:{morning:['早安。'],night:['晚安。']},voiceDramas:[drama('AU1','autumn'),drama('SU1','summer'),drama('PO1','postending'),drama('PO2','postending')],scenarioDramas:[],
 dailyStrips:['ST1','ST2'].map(id=>({id,title:id,panelCount:1,panels:[{action:'一起看书。'}],imagePrompt:'two adults reading together',cgImage:{url:'/user/images/'+id+'.png',prompt:'reading',generatedAt:1,provider:'baibai-image'}})),
 fireflyVoices:Array.from({length:13},(_,i)=>({id:'F'+i,color:'yellow',title:'F'+i,line:'今天花开了。',thoughts:['想说说新开的花。']})),
 view:'seasons',selectedSeason:'autumn',selectedVoiceId:'AU1',selectedDramaKey:'voice:AU1',selectedStripId:'ST1',selectedFireflyId:'F0'};
 f.liveCache.heart=structuredClone(v); f.ctx.chatMetadata[constants.CACHE_KEY]=structuredClone(f.liveCache); f.records.get(f.aEntry.entryId).cache=structuredClone(f.liveCache);state.runtimeSessionCache.clear();return v;
}
const pick=s=>reader.heartSelectionScalars(s);
test('entry and renderer do not mutate canonical state for ANY standalone route',async t=>{
 const f=await fixture(t);seed(f);await overlay.openCachedOrGenerate('heart');
 h.heartSetSeason('summer');const active=state.activeSession, before=pick(active), cache=JSON.stringify(f.liveCache);
 for(const route of ['strips','fireflies','postending','language']){
  prefs.prepareWorkspaceSession('heart',active,route);assert.deepEqual(pick(active),before);
  h.renderHeart();assert.deepEqual(pick(active),before);assert.equal(state.activeSession,active);
 }
 assert.equal(JSON.stringify(f.liveCache),cache);assert.equal(f.requests.length,0);
});
test('each real entry/return preserves nondefault ordinary page and all sibling content',async t=>{
 const f=await fixture(t);seed(f);await overlay.openCachedOrGenerate('heart');h.heartSetSeason('summer');
 for(const route of ['postending','strips','fireflies','language']){
  await overlay.openCachedOrGenerate('heart',{workspaceRoute:route});const canonical=JSON.stringify(state.activeSession);
  h.renderHeart();assert.equal(JSON.stringify(state.activeSession),canonical);
  await overlay.openCachedOrGenerate('heart',{workspaceRoute:'heart'});assert.equal(state.activeSession.selectedSeason,'summer');assert.equal(state.activeSession.selectedVoiceId,'SU1');
 }
 assert.equal(f.requests.length,0);
});
test('postending pager and direct item select operate on postending, not ordinary autumn',async t=>{
 const f=await fixture(t);seed(f);await overlay.openCachedOrGenerate('heart');const before=pick(state.activeSession);
 prefs.prepareWorkspaceSession('heart',state.activeSession,'postending');h.renderHeart();
 assert.match(f.body.innerHTML,/PO2/);h.heartStepDrama(-1);assert.match(f.body.innerHTML,/PO1/);
 assert.equal(h.heartCurrentDrama(reader.heartReaderSession(),'postending').current.item.id,'PO1');assert.deepEqual(pick(state.activeSession),before);
 h.heartSelectVoice('PO2');assert.equal(reader.heartReaderSession().selectedVoiceId,'PO2');assert.deepEqual(pick(state.activeSession),before);
});
test('strip and firefly actual UI selection, image target and pages use route cursor',async t=>{
 const f=await fixture(t);seed(f);await overlay.openCachedOrGenerate('heart');const before=pick(state.activeSession);
 prefs.prepareWorkspaceSession('heart',state.activeSession,'strips');h.heartSelectStrip('ST2');
 assert.equal(h.selectedHeartStrip().id,'ST2');assert.deepEqual(pick(state.activeSession),before);
 const target=images.captureCgImageTarget({mode:'heart',session:state.activeSession,item:h.selectedHeartStrip()});assert.equal(images.isCgImageTargetCurrent(target),true);
 h.heartSelectStrip('ST1');assert.equal(images.isCgImageTargetCurrent(target),false);
 prefs.prepareWorkspaceSession('heart',state.activeSession,'fireflies');h.heartSelectFirefly('F6');h.heartStepFireflyPage(1);
 assert.equal(reader.heartReaderSession().selectedFireflyId,'F12');assert.deepEqual(pick(state.activeSession),before);
});
test('explicit strip image removal commits intended item but NOT route selectors',async t=>{
 const f=await fixture(t);seed(f);await overlay.openCachedOrGenerate('heart');const before=pick(state.activeSession);
 prefs.prepareWorkspaceSession('heart',state.activeSession,'strips');h.heartSelectStrip('ST2');let confirms=0;globalThis.confirm=()=>{confirms++;return true};
 await h.clearHeartStripImage('ST2');assert.equal(confirms,2);const saved=(await f.persisted()).heart;
 assert.equal(saved.dailyStrips[1].cgImage,null);assert.ok(saved.dailyStrips[0].cgImage);assert.deepEqual(pick(saved),before);assert.equal(f.requests.length,0);
});
test('standalone bookmark restore stores its cursor separately from ordinary selections',async t=>{
 const f=await fixture(t);seed(f);await overlay.openCachedOrGenerate('heart');h.heartSetSeason('summer');
 await overlay.openCachedOrGenerate('heart',{workspaceRoute:'postending'});h.heartSelectVoice('PO1');navigation.rememberReadingPosition();
 state.activeMode=null;state.activeSession=null;prefs.workspace.route='';
 assert.equal(navigation.restoreReadingPosition({open:overlay.openOverlay,render:overlay.renderActive}),true);
 assert.equal(prefs.workspace.route,'postending');assert.equal(reader.heartReaderSession().selectedVoiceId,'PO1');
 assert.equal(state.activeSession.selectedSeason,'autumn');
 await overlay.openCachedOrGenerate('heart');assert.equal(state.activeSession.selectedSeason,'summer');assert.equal(f.requests.length,0);
});
test('revision, chat, snapshot and lifecycle isolate cursors; stale selection falls back in renderer',async t=>{
 const f=await fixture(t);seed(f);await overlay.openCachedOrGenerate('heart',{workspaceRoute:'postending'});h.heartSelectVoice('PO1');
 const s=state.activeSession;assert.equal(reader.heartReaderSession().selectedVoiceId,'PO1');
 for(const patch of [{archiveRevision:'new'},{chatId:'other'}]){const v=reader.heartReaderSession({...s,...patch});assert.notEqual(v.selectedVoiceId,'PO1');}
 state.activeArchiveSnapshot={entryId:'snapshot-only',characterKey:'other'};assert.notEqual(reader.heartReaderSession().selectedVoiceId,'PO1');state.activeArchiveSnapshot=null;
 state.runtimeLifecycleEpoch++;assert.notEqual(reader.heartReaderSession().selectedVoiceId,'PO1');
});

test('displayed standalone strip owns progress/cancel, never its canonical sibling',async t=>{
 const f=await fixture(t);seed(f);await overlay.openCachedOrGenerate('heart',{workspaceRoute:'strips'});h.heartSelectStrip('ST2');
 const origin=images.captureCgImageTarget({mode:'heart',session:state.activeSession,item:h.selectedHeartStrip()}).origin;
 const a=new AbortController(),b=new AbortController();state.activeCgImageTasks.set('first',{mode:'heart',itemId:'ST1',origin,controller:a,imageProgress:'WRONG_PROGRESS'});state.activeCgImageTasks.set('second',{mode:'heart',itemId:'ST2',origin,controller:b,imageProgress:'VISIBLE_PROGRESS'});
 assert.match(images.cgImageProgressHtml(),/VISIBLE_PROGRESS/);assert.doesNotMatch(images.cgImageProgressHtml(),/WRONG_PROGRESS/);images.cancelCurrentCgImage();assert.equal(b.signal.aborted,true);assert.equal(a.signal.aborted,false);
});
test('stale route cursor falls back to surviving content without changing ordinary selections',async t=>{
 const f=await fixture(t);seed(f);await overlay.openCachedOrGenerate('heart',{workspaceRoute:'postending'});h.heartSelectVoice('PO1');const before=pick(state.activeSession);
 state.activeSession.voiceDramas=state.activeSession.voiceDramas.filter(x=>x.id!=='PO1');h.renderHeart();assert.equal(reader.heartReaderSession().selectedVoiceId,'PO2');assert.deepEqual(pick(state.activeSession),before);
});
test('restoring a live bookmark after viewing a foreign snapshot uses the live owner scope',async t=>{
 const f=await fixture(t);seed(f);await overlay.openCachedOrGenerate('heart',{workspaceRoute:'postending'});h.heartSelectVoice('PO1');navigation.rememberReadingPosition();reader.clearHeartReaderPositions();
 state.activeArchiveSnapshot={entryId:'foreign',characterKey:'other'};state.activeMode=null;state.activeSession=null;
 assert.equal(navigation.restoreReadingPosition({open:overlay.openOverlay,render:overlay.renderActive}),true);assert.equal(state.activeArchiveSnapshot,null);assert.equal(reader.heartReaderSession().selectedVoiceId,'PO1');assert.equal(state.activeSession.selectedSeason,'autumn');
});
test('indexed read-only cursor round-trip cannot contaminate the live chat cursor',async t=>{
 const f=await fixture(t);seed(f);await overlay.openCachedOrGenerate('heart',{workspaceRoute:'postending'});h.heartSelectVoice('PO1');
 const live=state.activeSession;state.activeArchiveSnapshot={...f.aEntry,memory:f.liveBank,cache:f.liveCache,loadedAt:1};state.activeArchiveReadOnly=true;state.activeSession=structuredClone(live);h.heartSelectVoice('PO2');const mark=reader.captureHeartReaderBookmark();
 assert.equal(mark.selectedVoiceId,'PO2');state.activeArchiveSnapshot=null;state.activeSession=live;assert.equal(reader.heartReaderSession().selectedVoiceId,'PO1');
 state.activeArchiveSnapshot={...f.aEntry,memory:f.liveBank,cache:f.liveCache,loadedAt:1};state.activeSession=structuredClone(live);reader.restoreHeartReaderBookmark(state.activeSession,mark);h.renderHeart();assert.equal(reader.heartReaderSession().selectedVoiceId,'PO2');assert.equal(state.activeSession.selectedVoiceId,'AU1');assert.equal(f.requests.length,0);
});
test('canceling explicit clear on standalone preserves original image and selectors',async t=>{
 const f=await fixture(t);seed(f);await overlay.openCachedOrGenerate('heart',{workspaceRoute:'strips'});h.heartSelectStrip('ST2');const before=JSON.stringify(state.activeSession),stored=JSON.stringify(f.ctx.chatMetadata);let confirmations=0;globalThis.confirm=()=>{confirmations++;return false};
 await h.clearHeartStripImage('ST2');assert.equal(confirmations,1);assert.equal(JSON.stringify(state.activeSession),before);assert.equal(JSON.stringify(f.ctx.chatMetadata),stored);
});

test('actual indexed bookmark restore re-reads correct archive then restores route-local cursor',async t=>{
 const f=await fixture(t);seed(f);const library=await import('../src/archive/library.js');
 const snapshot=await library.fetchIndexedArchiveSnapshot(f.aEntry,f.ctx,{force:true});state.activeArchiveSnapshot=snapshot;state.activeArchiveReadOnly=true;
 await overlay.openCachedOrGenerate('heart',{workspaceRoute:'postending'});h.heartSelectVoice('PO1');navigation.rememberReadingPosition();reader.clearHeartReaderPositions();state.activeArchiveSnapshot=null;state.activeSession=null;state.activeMode=null;
 let fallback=false;assert.equal(await navigation.restoreIndexedReadingPosition({open:overlay.openOverlay,render:overlay.renderActive,fallback:()=>{fallback=true}}),true);
 assert.equal(fallback,false);assert.equal(state.activeArchiveSnapshot.entryId,f.aEntry.entryId);assert.equal(reader.heartReaderSession().selectedVoiceId,'PO1');assert.equal(state.activeSession.selectedVoiceId,'AU1');assert.equal(f.requests.length,0);
});
