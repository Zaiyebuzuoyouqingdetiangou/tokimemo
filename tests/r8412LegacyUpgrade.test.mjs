import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const root=new URL('../',import.meta.url),imp=p=>import(new URL(p,root));
const {fixture}=await imp('tests/helpers/r847Host.mjs'),heart=await imp('src/modes/heart.js'),overlay=await imp('src/ui/overlay.js'),gen=await imp('src/generation/client.js'),C=await imp('src/core/constants.js'),cache=await imp('src/core/cache.js'),{state}=await imp('src/core/state.js');
// Captured by running the untouched r84.11 ZIP, not synthesized by the candidate.
const fixtures=JSON.parse(fs.readFileSync(new URL('./helpers/r8412-legacy-fixtures.json',import.meta.url),'utf8'));
const text='这一天的阳光很好，我想和你一起看看院子里的花，等你把手里的事情做完，再慢慢读几页书。'.repeat(4),script=()=>Array.from({length:8},()=>({speaker:'char',text}));
const voice={voiceDramas:[{id:'V',kind:'spring',title:'新一页',setting:'日常模拟',script:script()}]},scene={scenarioDramas:[{id:'S',season:'spring',title:'小花园',setting:'日常模拟',script:script()}]};
const isVoice=m=>JSON.stringify(m).includes('Voice Drama 新增一篇');
for(const failed of ['voice','scenario','both','language'])test('actual r84.11 serialized draft -> r84.12 continuation '+failed,async t=>{
 const f=await fixture(t);await overlay.openCachedOrGenerate('heart');
 const saved=structuredClone(fixtures[failed]);
 // Keep the original request hashes and data; only the fixture age is made current.
 saved.__generationRecoveryV1.heart.createdAt=Date.now();saved.__generationRecoveryV1.heart.updatedAt=Date.now();
 Object.assign(f.liveCache,structuredClone(saved));f.ctx.chatMetadata[C.CACHE_KEY]=structuredClone(saved);f.records.get(f.aEntry.entryId).cache=structuredClone(saved);state.runtimeSessionCache.clear();await overlay.openCachedOrGenerate('heart');
 if(failed==='language')f.setResponse({relationshipState:'自然相处',relationshipSummary:'彼此倾听',greetings:{morning:['早，院子里花开了。']}});
 else f.setResponse(m=>isVoice(m)?voice:scene);
 await gen.continueSavedGeneration('heart');
 const after=await f.persisted();assert.equal(f.requests.length,failed==='both'?2:1,JSON.stringify(f.notices));
 if(failed==='language'){assert.equal(after.heart.greetings.morning.length,1);assert.equal(after.heart.greetings.birthday.length,0);}
 else{assert.equal(after.heart.voiceDramas.length,1);assert.equal(after.heart.scenarioDramas.length,1);for(const name of ['voiceDramas','scenarioDramas'])if(saved.heart?.[name]?.length)assert.deepEqual(after.heart[name],saved.heart[name]);}
 assert.equal(cache.loadGenerationRecovery('heart',f.ctx),null);assert.deepEqual(after.phone,saved.phone);assert.deepEqual(after.cabinet,saved.cabinet);
});
