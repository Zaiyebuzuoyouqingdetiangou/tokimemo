// r84.10 independent failure reproductions, promoted without weakening assertions.
// Only the host/provider are mocked; production modules are never replaced.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=new URL('../',import.meta.url);
const imp=p=>import(new URL(p,root));
const {fixture}=await imp('tests/helpers/r847Host.mjs');
const h=await imp('src/ui/heartView.js'), heart=await imp('src/modes/heart.js');
const overlay=await imp('src/ui/overlay.js'), routes=await imp('src/ui/workspaceState.js');
const reader=await imp('src/ui/heartReaderState.js');
const constants=await imp('src/core/constants.js');
const {state}=await imp('src/core/state.js');
const prose='我把手里的书放回原处，接着走向窗边。此刻想与你说说院子里新开的花，也想听你慢慢说今天的小事。'.repeat(4);
const drama=(id,kind)=>({id,kind,title:id,setting:'未来日常模拟',script:Array.from({length:10},()=>({speaker:'char',text:prose}))});
const fields=['view','selectedSeason','selectedVoiceId','selectedScenarioId','selectedDramaKey','selectedStripId','selectedFireflyId'];
const selected=s=>Object.fromEntries(fields.map(k=>[k,s?.[k]||'']));
function seed(f){
 reader.clearHeartReaderPositions(); routes.workspace.route='';
 const s={kind:'heart',chatId:f.liveBank.chatId,archiveRevision:f.liveBank.archiveRevision,relationshipSummary:'自然相处。',greetings:{morning:['早安。']},voiceDramas:[drama('AU1','autumn'),drama('SU1','summer'),drama('PO1','postending')],scenarioDramas:[],dailyStrips:[{id:'ST1',title:'读书一格',panelCount:1,panels:[{action:'在窗边看书。'}],imagePrompt:'1boy, reading, window',cgImage:null}],fireflyVoices:[],view:'seasons',selectedSeason:'autumn',selectedVoiceId:'AU1',selectedDramaKey:'voice:AU1',selectedStripId:'ST1',selectedFireflyId:''};
 f.liveCache.heart=structuredClone(s);f.ctx.chatMetadata[constants.CACHE_KEY]=structuredClone(f.liveCache);f.records.get(f.aEntry.entryId).cache=structuredClone(f.liveCache);state.runtimeSessionCache.clear();return s;
}
async function startGeneration(f,route){
 if(route==='postending'){f.setResponse({voiceDramas:[drama('NEWPOST','postending')]});return heart.generateHeartSeasonSection('postending');}
 if(route==='strips'){f.setResponse({dailyStrips:[{id:'NEWSTRIP',title:'栽花一格',panelCount:1,panels:[{action:'在院子整理花盆。'}],imagePrompt:'1boy, gardening, courtyard'}]});return heart.generateHeartSection('strips');}
 f.setResponse({fireflyVoices:[{id:'NEWF',title:'读书',color:'white',script:[{speaker:'char',text:prose},{speaker:'user',text:'然后呢？'},{speaker:'char',text:prose},{speaker:'char',text:prose},{speaker:'user_thought',text:'是在对我说吗？'}]}]});return heart.generateHeartFirefliesSection();
}
for(const route of ['postending','strips','fireflies'])test(`control: opening ${route} does not alter canonical selections`,async t=>{
 const f=await fixture(t);seed(f);await overlay.openCachedOrGenerate('heart');const before=selected(state.activeSession);
 await overlay.openCachedOrGenerate('heart',{workspaceRoute:route});assert.deepEqual(selected(state.activeSession),before);assert.equal(f.requests.length,0);
});
for(const route of ['postending','strips','fireflies'])test(`required invariant: ${route} generation must not persist route selection into ordinary HEART`,async t=>{
 const f=await fixture(t);const seedValue=seed(f);await overlay.openCachedOrGenerate('heart',{workspaceRoute:route});await startGeneration(f,route);
 assert.equal(f.requests.length,1);const saved=(await f.persisted()).heart;
 const collection=route==='postending'?'voiceDramas':route==='strips'?'dailyStrips':'fireflyVoices';
 assert.equal(saved[collection].length,seedValue[collection].length+1,'the generated content must really have been committed');
 assert.deepEqual(selected(saved),selected(seedValue),'content-only standalone commit must preserve ordinary page selections');
});
test('required invariant: pending standalone generation must not hijack the ordinary page on completion',async t=>{
 const f=await fixture(t);seed(f);await overlay.openCachedOrGenerate('heart');h.heartSetSeason('summer');
 await overlay.openCachedOrGenerate('heart',{workspaceRoute:'postending'});const pending=f.pauseProvider();const job=startGeneration(f,'postending');await pending.ready;
 await overlay.openCachedOrGenerate('heart',{workspaceRoute:'heart'});h.heartSetSeason('summer');const before=selected(state.activeSession);
 pending.release();await job;assert.equal(f.requests.length,1);assert.equal(routes.workspace.route,'heart');
 assert.deepEqual(selected(state.activeSession),before,'background completion must leave the reader on the chosen summer chapter');
});
const cache=await imp('src/core/cache.js');
const contextApi=await imp('src/core/context.js');
const repository=await imp('src/archive/repository.js');
const generation=await imp('src/generation/client.js');
const library=await imp('src/archive/library.js');

test('normalization roundtrip does not fill missing route cursors into saved content',async t=>{
 const f=await fixture(t);const base=seed(f);for(const key of fields)delete base[key];
 const result=heart.normalizeHeartContentPatch(base,[{type:'season',season:'postending',voice:drama('P2','postending')}],f.liveBank);
 for(const key of fields)assert.equal(Object.hasOwn(result,key),false,key);
 assert.equal(result.voiceDramas.length,4);assert.equal(f.requests.length,0);
});
test('non-route content patch cannot change canonical cursor by supplying unrelated selector keys',async t=>{
 const f=await fixture(t),base=seed(f);const before=selected(base);
 const got=heart.applyHeartPartialPatch(base,{type:'strips',view:'strips',selectedSeason:'postending',selectedVoiceId:'OWNED',dailyStrips:[{id:'NEW2',title:'新日常',panelCount:1,panels:[{action:'读书'}],imagePrompt:'reading'}]});
 assert.deepEqual(selected(got),before);assert.deepEqual(selected(base),before);
});
for(const route of ['postending','strips','fireflies'])test(`historical ${route} commits keep its ordinary selections and never touch live archive`,async t=>{
 const f=await fixture(t);const original=seed(f);f.otherCache.heart={...structuredClone(original),chatId:f.otherBank.chatId,archiveRevision:f.otherBank.archiveRevision};
 f.records.get(f.bEntry.entryId).cache=structuredClone(f.otherCache);
 await f.historical('heart');await overlay.openCachedOrGenerate('heart',{workspaceRoute:route});
 const before=selected(state.activeSession);await startGeneration(f,route);
 assert.equal(f.requests.length,1);assert.deepEqual(selected((await f.persisted(f.bEntry)).heart),before);
 assert.deepEqual((await f.persisted()).heart,original);assert.equal(f.ctx.chatId,f.liveBank.chatId);
});
test('background historical completion leaves the ordinary live HEART on its current chapter',async t=>{
 const f=await fixture(t);const original=seed(f);f.otherCache.heart={...structuredClone(original),chatId:f.otherBank.chatId,archiveRevision:f.otherBank.archiveRevision};f.records.get(f.bEntry.entryId).cache=structuredClone(f.otherCache);
 await f.historical('heart');await overlay.openCachedOrGenerate('heart',{workspaceRoute:'postending'});
 const wait=f.pauseProvider();const pending=startGeneration(f,'postending');await wait.ready;
 state.activeArchiveSnapshot=null;await overlay.openCachedOrGenerate('heart',{workspaceRoute:'heart'});h.heartSetSeason('summer');const before=selected(state.activeSession);
 wait.release();await pending;assert.deepEqual(selected(state.activeSession),before);assert.equal(state.activeSession.chatId,f.liveBank.chatId);
 assert.deepEqual((await f.persisted()).heart,original);assert.equal((await f.persisted(f.bEntry)).heart.voiceDramas.length,4);
});
test('postending generation while its own pager changes preserves the chosen existing postending chapter',async t=>{
 const f=await fixture(t);seed(f);await overlay.openCachedOrGenerate('heart',{workspaceRoute:'postending'});
 const before=selected(state.activeSession),wait=f.pauseProvider();const pending=startGeneration(f,'postending');await wait.ready;
 h.heartSelectVoice('PO1');wait.release();await pending;assert.deepEqual(selected(state.activeSession),before);
 assert.equal(h.heartCurrentDrama(reader.heartReaderSession(),'postending').current.item.id,'PO1');
});
test('generation failure has no cursor or work deletion side effects',async t=>{
 const f=await fixture(t);const original=seed(f);await overlay.openCachedOrGenerate('heart',{workspaceRoute:'strips'});const before=selected(state.activeSession);
 f.setResponse({dailyStrips:[]});await heart.generateHeartSection('strips');
 assert.equal(f.requests.length,1);assert.deepEqual(selected(state.activeSession),before);
 assert.deepEqual((await f.persisted()).heart.dailyStrips,original.dailyStrips);assert.deepEqual(selected((await f.persisted()).heart),selected(original));
});
test('a deferred HEART content patch is normalized without route contamination when returning to source chat',async t=>{
 const f=await fixture(t);const base=seed(f);await overlay.openCachedOrGenerate('heart',{workspaceRoute:'postending'});
 const origin=contextApi.captureTaskOrigin(f.ctx,f.liveBank.archiveRevision),chatId=f.ctx.chatId;
 f.ctx.chatId='temporary-other';
 const result=await heart.persistHeartPartialPatch('postending',{type:'season',season:'postending',voice:drama('DEFERRED','postending')},base,f.liveBank,origin,chatId,f.liveBank.archiveRevision);
 assert.equal(result.committed,false);assert.deepEqual(selected(result.updated),selected(base));
 f.ctx.chatId=chatId;await repository.flushDeferredCommitsForCurrentChat();
 const saved=(await f.persisted()).heart;assert.ok(saved.voiceDramas.some(v=>v.id==='DEFERRED'));assert.deepEqual(selected(saved),selected(base));
});
test('same-mode ordinary language completion cannot jump to another route selected during generation',async t=>{
 const f=await fixture(t);seed(f);await overlay.openCachedOrGenerate('heart');h.heartSetSeason('summer');
 f.setResponse({relationshipState:'自然相处',relationshipSummary:'彼此倾听',relationshipSourceMemoryIds:[],relationshipSourceMemoryAnchor:'',greetings:{morning:['早，花开了。']},specialDays:[]});
 const wait=f.pauseProvider();const pending=generation.generateMode('heart',{background:false});await wait.ready;
 await overlay.openCachedOrGenerate('heart',{workspaceRoute:'postending'});h.heartSelectVoice('PO1');const before=selected(state.activeSession);
 wait.release();await pending;assert.deepEqual(selected(state.activeSession),before);assert.equal(routes.workspace.route,'postending');assert.equal(reader.heartReaderSession().selectedVoiceId,'PO1');
});
test('readonly standalone generation request does not change reader or send a request',async t=>{
 const f=await fixture(t);seed(f);state.activeArchiveSnapshot=await library.fetchIndexedArchiveSnapshot(f.aEntry,f.ctx,{force:true});state.activeArchiveReadOnly=true;
 await overlay.openCachedOrGenerate('heart',{workspaceRoute:'postending'});const before=selected(state.activeSession);
 await heart.generateHeartSeasonSection('postending');assert.deepEqual(selected(state.activeSession),before);assert.equal(f.requests.length,0);
});
