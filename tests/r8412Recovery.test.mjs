import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './helpers/r847Host.mjs';
import * as heart from '../src/modes/heart.js';
import * as overlay from '../src/ui/overlay.js';
import * as cache from '../src/core/cache.js';
import * as context from '../src/core/context.js';
import * as gen from '../src/generation/client.js';
import * as constants from '../src/core/constants.js';
import * as settings from '../src/core/settings.js';
import * as recovery from '../src/generation/recovery.js';
import {state} from '../src/core/state.js';
const text='我把手里的书放回原处，接着走向窗边。此刻想与你说说院子里新开的花，也想听你慢慢说今天的小事。'.repeat(3);
const script=()=>Array.from({length:8},()=>({speaker:'char',text}));
const voice=(season='spring')=>({voiceDramas:[{id:'VO',kind:season,title:'窗边的花',setting:'日常模拟',script:script()}]});
const scene=(season='spring')=>({scenarioDramas:[{id:'SC',season,title:'小院子',setting:'日常模拟',script:script()}]});
const core={relationshipState:'自然相处',relationshipSummary:'彼此倾听',greetings:{morning:['早安，窗边的花开了。']}};
const isVoice=m=>JSON.stringify(m).includes('Voice Drama 新增一篇');
async function open(f){await overlay.openCachedOrGenerate('heart',{workspaceRoute:'heart'});}
async function half(f,failed){f.setResponse(m=>isVoice(m)?failed.includes('voice')?{voiceDramas:[]}:voice():failed.includes('scenario')?{scenarioDramas:[]}:scene());await heart.generateHeartSeasonSection('spring');}
function good(f){f.setResponse(m=>isVoice(m)?voice():scene());}
for(const failed of [['voice'],['scenario'],['voice','scenario']])test(`real same-chat resume preserves sibling outputs: ${failed.join('+')}`,async t=>{
 const f=await fixture(t);await open(f);const before=await f.persisted();await half(f,failed);
 assert.equal(f.requests.length,2);const partial=await f.persisted();
 good(f);await heart.generateHeartSeasonSection('spring');
 assert.equal(f.requests.length,2+failed.length);const saved=await f.persisted();
 assert.equal(saved.heart.voiceDramas.length,1);assert.equal(saved.heart.scenarioDramas.length,1);
 for(const key of ['voiceDramas','scenarioDramas'])if(partial.heart?.[key]?.length)assert.deepEqual(saved.heart[key],partial.heart[key]);
 assert.deepEqual(saved.phone,before.phone);assert.deepEqual(saved.cabinet,before.cabinet);
 assert.equal(cache.loadGenerationRecovery('heart',f.ctx),null);
});
for(const [label,mutate] of [
 ['ordinary message appended',f=>f.ctx.chat.push({is_user:true,name:f.ctx.name1,mes:'普通新消息，没有更新档案。'})],
 ['unarchived message edit',f=>{f.ctx.chat[0].mes='同一条消息的编辑，不是档案重建。';}],
 ['same-chat reader navigation',async f=>{await overlay.openCachedOrGenerate('phone');await open(f);state.activeSession.selectedSeason='autumn';}],
 ['same-chat tab close and reopen',async f=>{state.activeSession=null;state.activeMode=null;await open(f);}]
])test(`same chat does not invent a source failure: ${label}`,async t=>{
 const f=await fixture(t);await open(f);await half(f,['voice']);await mutate(f);good(f);await heart.generateHeartSeasonSection('spring');
 assert.equal(f.requests.length,3);assert.equal((await f.persisted()).heart.voiceDramas.length,1);
 assert.ok(!f.notices.some(n=>/输入不一致|建档期间/.test(n.message)));
});
for(const [label,mutate] of [
 ['creative policy changed',f=>{settings.updatePluginSettings({creativeSupplementEnabled:true,creativeSupplement:'新的创作边界'}); }],
 ['archive revision changed',f=>{f.ctx.chatMetadata[constants.MEMORY_KEY].archiveRevision='different-rev';}],
 ['different chat ID',f=>{f.ctx.chatId='different-chat';}],

])test(`genuine changes still stop before resending: ${label}`,async t=>{
 const f=await fixture(t);await open(f);await half(f,['voice']);const partial=await f.persisted();await mutate(f);good(f);try{await heart.generateHeartSeasonSection('spring');}catch(error){assert.ok(['RMT_HEART_SOURCE_CHANGED','RMT_ARCHIVE_SOURCE_MISMATCH'].includes(error.code));}
 assert.equal(f.requests.length,2);const actual=structuredClone((await f.persisted()).heart),expected=structuredClone(partial.heart);delete actual._rmtModeWriteFence;delete expected._rmtModeWriteFence;assert.deepEqual(actual,expected);
});
test('different chat while transport is pending never writes a result into the new chat',async t=>{
 const f=await fixture(t);await open(f);good(f);const pause=f.pauseProvider();const run=heart.generateHeartSeasonSection('spring');await pause.ready;
 f.ctx.chatId='different-chat';pause.release();await run;
 assert.equal((await f.persisted(f.bEntry)).heart,undefined);assert.equal(f.ctx.chatId,'different-chat');
});
test('request base only removes same-batch same-season output, never mutates canonical data',()=>{
 const s={relationshipState:'一起生活',voiceDramas:[{id:'old',kind:'spring',incrementBatchId:'old'},{id:'peer',kind:'spring',incrementBatchId:'current'},{id:'other',kind:'summer',incrementBatchId:'current'}],scenarioDramas:[{id:'now',season:'spring',incrementBatchId:'current'}],greetings:{morning:['早安']}};
 const before=structuredClone(s),base=heart.heartSeasonRequestBase(s,'spring','current');assert.deepEqual(s,before);
 assert.deepEqual(base.voiceDramas.map(x=>x.id),['old','other']);assert.deepEqual(base.scenarioDramas,[]);assert.equal(base.greetings,s.greetings);
});
test('birthday not required through full provider, canonical save and reopen',async t=>{
 const f=await fixture(t);f.setResponse(core);await gen.generateMode('heart',{background:true});assert.equal(f.requests.length,1);
 const saved=await f.persisted();assert.equal(saved.heart.greetings.birthday.length,0);assert.equal(saved.heart.greetings.userBirthday.length,0);
 await open(f);assert.equal(state.activeSession.greetings.morning.length,1);assert.equal(state.activeSession.generationParts.dialogues,true);
});
test('full request no longer asks to fill birthday greetings; original non-birthday schema stays',()=>{
 const current=heart.heartCorePrompt({name1:'乙',name2:'甲'},{memories:[]});assert.match(current,/不主动补生日祝福/);
 assert.doesNotMatch(current,/birthday\/userBirthday\/holiday.*建议各 1/);
 assert.ok(heart.normalizeHeartCore(core,{memories:[]}));assert.throws(()=>heart.normalizeHeartCore({...core,greetings:{}},{memories:[]}));
});
for(const category of ['birthday','userBirthday'])test('explicit birthday category still generates independently: '+category,async t=>{
 const f=await fixture(t);await open(f);f.setResponse({...core,greetings:{[category]:['生日快乐，今天听你安排。']}});
 await heart.generateHeartSection('dialogues',{languageCategory:category});assert.equal(f.requests.length,1);
 const saved=await f.persisted();assert.equal(saved.heart.greetings[category].length,1);assert.equal(saved.heart.greetings.morning.length,0);
});
// Exact original request hashes are produced with the public recovery engine. The
// validator and provider callback are the same on the second pass; no hash bypass.
const ctx={name1:'乙',name2:'甲'},bank={chatId:'legacy-chat',archiveRevision:'legacy-rev',memories:[]};
const base={relationshipState:'自然相处',voiceDramas:[],scenarioDramas:[]};
async function legacyHarness(t,{mode='heart',slot='heart-season:legacy:spring:scenario',oldPrompt,newPrompt,changes={},complete=false,contract='heart-season-siblings-r8412'}={}){
 const origin={characterKey:'legacy-character',characterId:'0',characterAvatar:'fixture.png',chatId:bank.chatId,archiveRevision:bank.archiveRevision};
 const options={origin,mode,taskKey:slot,contextEnvelope:'FIXED-CONTROLLED-CONTEXT',temperature:.65,maxTokens:3200};
 let current=true,sends=0,validations=0;
 const validator=raw=>{validations++;if(raw.valid!==true)throw new Error('invalid fixture');return raw;};
 const handle=await recovery.createGenerationRecovery({origin,mode,settingsIdentity:'fixed',save:async()=>true,assertCurrent:()=>current});recovery.attachGenerationRecovery(origin,handle);
 const oldRun=async(_p,_o,accepted)=>{sends++;if(!complete)throw Object.assign(new Error('fixture transport failure'),{code:'RMT_CONNECTION_FAILED'});const raw={valid:true};const value=validator(raw);await accepted(raw);return value;};
 if(complete)await recovery.withRecoverySegment(oldPrompt,options,validator,oldRun);else await assert.rejects(recovery.withRecoverySegment(oldPrompt,options,validator,oldRun));
 let draft=recovery.generationRecoverySnapshot(handle);recovery.detachGenerationRecovery(origin);
 if(changes.segmentContract)draft.segments[0].contract=changes.segmentContract;
 const resumed=await recovery.createGenerationRecovery({origin,mode,settingsIdentity:'fixed',existing:draft,continueRequested:true,save:async()=>true,assertCurrent:()=>current});recovery.attachGenerationRecovery(origin,resumed);t.after(()=>recovery.detachGenerationRecovery(origin));
 const next={...options,...changes,recoveryCompatibility:{contract,legacyPrompts:[oldPrompt]}};delete next.segmentContract;
 return {run:()=>recovery.withRecoverySegment(newPrompt,next,validator,async(_p,_o,accepted)=>{sends++;const raw={valid:true};const value=validator(raw);await accepted(raw);return value;}),sends:()=>sends,validations:()=>validations,setCurrent:v=>current=v,origin,draft};
}
const peer={...base,voiceDramas:[{id:'V',kind:'spring',title:'同批已完成',setting:'日常',incrementBatchId:'B'}]};
const oldScenario=heart.heartSeasonScenarioPrompt(ctx,bank,base,'spring',peer);
const stableScenario=heart.heartSeasonScenarioPrompt(ctx,bank,base,'spring',heart.heartSeasonRequestBase(peer,'spring','B'));
for(const complete of [false,true])test('unmarked r84.11 same-batch scenario request has exact compatibility: '+(complete?'complete replay':'retry'),async t=>{
 const f=await legacyHarness(t,{oldPrompt:oldScenario,newPrompt:stableScenario,complete});await f.run();assert.equal(f.sends(),complete?1:2);assert.equal(f.validations(),complete?2:1);
});
for(const [label,changes] of [['context',{contextEnvelope:'CHANGED'}],['temperature',{temperature:.9}],['max output',{maxTokens:3600}],['model',{model:'other-model'}],['phrase policy',{enforceGeneratedPhrasePolicy:false}]])test('legacy compatibility cannot mask changed '+label,async t=>{
 const f=await legacyHarness(t,{oldPrompt:oldScenario,newPrompt:stableScenario,changes});await assert.rejects(f.run(),{code:'RMT_RECOVERY_INPUT_CHANGED'});assert.equal(f.sends(),1);
});
for(const slot of ['heart-season:legacy:postending:voice','heart-part:legacy:dialogues'])test('season compatibility only authorizes the intended season slots: '+slot,async t=>{
 const f=await legacyHarness(t,{oldPrompt:oldScenario,newPrompt:stableScenario,slot});await assert.rejects(f.run(),{code:'RMT_RECOVERY_INPUT_CHANGED'});assert.equal(f.sends(),1);
});
test('same slots under a non-HEART mode cannot use the compatibility contract',async t=>{const f=await legacyHarness(t,{oldPrompt:oldScenario,newPrompt:stableScenario,mode:'album'});await assert.rejects(f.run(),{code:'RMT_RECOVERY_INPUT_CHANGED'});});
test('marked new requests are not eligible for legacy fallback',async t=>{const f=await legacyHarness(t,{oldPrompt:oldScenario,newPrompt:stableScenario,changes:{segmentContract:'heart-season-siblings-r8412'}});await assert.rejects(f.run(),{code:'RMT_RECOVERY_INPUT_CHANGED'});});
test('lifecycle invalidation stops even an otherwise compatible legacy request',async t=>{const f=await legacyHarness(t,{oldPrompt:oldScenario,newPrompt:stableScenario});f.setCurrent(false);await assert.rejects(f.run(),{name:'AbortError'});assert.equal(f.sends(),1);});
for(const complete of [false,true])test('preexisting full language draft retains exact request identity: '+(complete?'complete':'pending'),async t=>{
 const oldPrompt=heart.heartCoreLegacyPrompt(ctx,bank),newPrompt=heart.heartCorePrompt(ctx,bank);
 assert.notEqual(oldPrompt,newPrompt);
 const f=await legacyHarness(t,{oldPrompt,newPrompt,complete,slot:'heart-part:legacy:dialogues:dialogues-full',contract:'heart-language-birthday-r8412'});await f.run();assert.equal(f.sends(),complete?1:2);
});

test('legacy recovery original character/chat identity cannot be transplanted',async t=>{const f=await legacyHarness(t,{oldPrompt:oldScenario,newPrompt:stableScenario});f.origin.chatId='other-chat';f.origin.characterKey='other-character';await assert.rejects(f.run(),{code:'RMT_RECOVERY_INPUT_CHANGED'});assert.equal(f.sends(),1);});
