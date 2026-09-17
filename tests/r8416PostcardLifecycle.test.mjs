import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {fixture} from './helpers/r847Host.mjs';
import {scenes,location,design,el} from './helpers/r8416DesignFixtures.mjs';
import * as client from '../src/generation/client.js';
import * as cache from '../src/core/cache.js';
import * as context from '../src/core/context.js';
import * as C from '../src/core/constants.js';
import * as inboxView from '../src/ui/inboxView.js';
import * as travelView from '../src/ui/travelView.js';
import * as travel from '../src/modes/travel.js';
import {state} from '../src/core/state.js';
const raw=scene=>({locations:[location(scene)]});
const legacy=JSON.parse(fs.readFileSync(new URL('./helpers/r8416LegacyJournals.json',import.meta.url),'utf8'));
async function write(f,mode,session){await cache.commitSession(mode,session,f.liveBank.chatId,context.captureTaskOrigin(f.ctx,f.liveBank.archiveRevision));state.runtimeSessionCache.clear();await cache.ensureCacheHydrated(f.ctx);}

test('one real generation chain carries design, saves, reopens and does not touch siblings',async t=>{
 const f=await fixture(t),before=await f.persisted();f.setResponse(raw('lake'));
 const got=await client.generateMode('travel',{background:true});assert.ok(got,JSON.stringify(f.notices));assert.equal(f.requests.length,1);
 assert.match(JSON.stringify(f.requests[0]),/keepsake.design|keepsake\.design/);assert.doesNotMatch(JSON.stringify(f.requests[0]),/picturePlan 可同时|foreground.*前景元素/);
 const saved=await f.persisted();assert.deepEqual(saved.travel.locations[0].keepsake.design,scenes.lake);assert.deepEqual(saved.phone,before.phone);assert.deepEqual(saved.cabinet,before.cabinet);
 state.runtimeSessionCache.clear();await cache.ensureCacheHydrated(f.ctx);await f.open('travel');travelView.selectTravelLocation('F1');
 assert.match(f.body.innerHTML,/data-rmt-design-palette="night"/);assert.equal(f.requests.length,1);
});
for(const kind of ['absent','overbudget','unknown-field'])test('invalid visual '+kind+' preserves valid prose, saves once without retries',async t=>{
 const f=await fixture(t);const result=raw('pavilion');
 if(kind==='absent')delete result.locations[0].keepsake.design;
 else result.locations[0].keepsake.design=kind==='overbudget'?design(Array.from({length:21},()=>el('water'))):{...scenes.pavilion,unapprovedField:'ignored-not-accepted'};
 f.setResponse(result);assert.ok(await client.generateMode('travel',{background:true}),JSON.stringify(f.notices));const saved=await f.persisted();
 assert.equal(saved.travel.locations[0].keepsake.body,result.locations[0].keepsake.body);assert.equal(saved.travel.locations[0].keepsake.design,null);assert.equal(f.requests.length,1);
});
test('complete design replay after failed save costs no additional provider request',async t=>{
 const f=await fixture(t);f.setResponse(raw('bridge'));f.failCompletedSave('travel',s=>s?.locations?.length);
 await client.generateMode('travel',{background:true});const journal=cache.loadGenerationRecovery('travel',f.ctx);assert.ok(journal);assert.equal(journal.segments[0].contract,'travel-structured-design-r8416');
 assert.equal(f.requests.length,1);assert.equal((await f.persisted()).travel,undefined);
 f.failCompletedSave('');await client.continueSavedGeneration('travel');assert.equal(f.requests.length,1);assert.deepEqual((await f.persisted()).travel.locations[0].keepsake.design,scenes.bridge);
});
test('new failed generation resumes exactly the new request',async t=>{
 const f=await fixture(t);f.setResponse(()=>{throw new Error('fixture-provider-failed');});await client.generateMode('travel',{background:true});
 assert.ok(cache.loadGenerationRecovery('travel',f.ctx));f.setResponse(raw('snow'));await client.continueSavedGeneration('travel');
 assert.equal(f.requests.length,2);assert.deepEqual(f.requests[1],f.requests[0]);assert.deepEqual((await f.persisted()).travel.locations[0].keepsake.design,scenes.snow);
});
for(const [name,old] of Object.entries(legacy))test('actual uploaded r84.15 '+name+' journal resumes its original recipe',async t=>{
 const f=await fixture(t);const saved=structuredClone(old.saved);const j=saved.__generationRecoveryV1.travel;j.createdAt=j.updatedAt=Date.now();
 Object.assign(f.liveCache,structuredClone(saved));f.ctx.chatMetadata[C.CACHE_KEY]=structuredClone(saved);f.records.get(f.aEntry.entryId).cache=structuredClone(saved);state.runtimeSessionCache.clear();await f.open('travel');
 f.setResponse(old.response);await client.continueSavedGeneration('travel');const after=await f.persisted();assert.ok(after.travel,JSON.stringify(f.notices));
 assert.equal(f.requests.length,name==='failed'?1:0);assert.ok(!Object.hasOwn(after.travel.locations[0].keepsake,'design'));assert.equal(after.travel.locations[0].keepsake.picturePlan.layout,'left');
 if(f.requests.length)assert.match(JSON.stringify(f.requests[0]),/picturePlan/);
});
test('identity mismatch blocks old draft before paid request',async t=>{
 const f=await fixture(t);const saved=structuredClone(legacy.failed.saved);const j=saved.__generationRecoveryV1.travel;j.createdAt=j.updatedAt=Date.now();j.identity.chatId='foreign';
 Object.assign(f.liveCache,saved);f.ctx.chatMetadata[C.CACHE_KEY]=saved;f.records.get(f.aEntry.entryId).cache=structuredClone(saved);state.runtimeSessionCache.clear();await f.open('travel');
 f.setResponse(raw('lake'));await client.continueSavedGeneration('travel');assert.equal(f.requests.length,0);assert.equal((await f.persisted()).travel,undefined);
});
test('original recovery hash never bypassed when creative settings change',async t=>{
 const f=await fixture(t);f.setResponse(()=>{throw new Error('fixture');});await client.generateMode('travel',{background:true});
 f.ctx.extensionSettings[C.EXTENSION_SETTINGS_KEY].creativeSupplementEnabled=true;f.ctx.extensionSettings[C.EXTENSION_SETTINGS_KEY].creativeSupplement='changed';f.setResponse(raw('lake'));
 await client.continueSavedGeneration('travel');assert.equal(f.requests.length,1);assert.equal((await f.persisted()).travel,undefined);
});
test('actual mailbox action freezes design and repeated collect/changed art does not duplicate letters',async t=>{
 const f=await fixture(t);f.setResponse(raw('lake'));await client.generateMode('travel',{background:true});await f.open('inbox');
 await inboxView.handleInboxAction('postcards');let saved=await f.persisted();assert.equal(saved.inbox.letters.length,1,JSON.stringify(f.notices));const letter=structuredClone(saved.inbox.letters[0]);
 assert.deepEqual(letter.travelSnapshot.location.postcard.design,scenes.lake);await inboxView.handleInboxAction('postcards');assert.equal((await f.persisted()).inbox.letters.length,1);
 const source=structuredClone(saved.travel);source.locations[0].keepsake.design=scenes.snow;source.locations[0].postcard.design=scenes.snow;await write(f,'travel',source);
 await f.open('inbox');await inboxView.handleInboxAction('postcards');saved=await f.persisted();assert.equal(saved.inbox.letters.length,1);assert.deepEqual(saved.inbox.letters[0],letter);
 await inboxView.handleInboxAction('read',letter.id);assert.match(f.body.innerHTML,/data-rmt-design-palette="night"/);assert.equal(f.requests.length,1);
});
test('revisit appends new prose, keeps earlier design unchanged, copied body with new art remains duplicate',async t=>{
 const f=await fixture(t);f.setResponse(raw('pavilion'));await client.generateMode('travel',{background:true});const old=structuredClone((await f.persisted()).travel.locations[0]);
 const copied=raw('pavilion');copied.locations[0].id='F2';copied.locations[0].keepsake.design=scenes.snow;f.setResponse(copied);await client.generateMode('travel',{background:true});assert.equal((await f.persisted()).travel.locations.length,1);
 f.setResponse(raw('lake'));await client.generateMode('travel',{background:true});const result=await f.persisted();assert.equal(result.travel.locations.length,2);assert.deepEqual(result.travel.locations[0],old);assert.equal(f.requests.length,3);
});
test('revision change drops late design and leaves other modes unchanged',async t=>{
 const f=await fixture(t),old=await f.persisted();f.setResponse(raw('lake'));const hold=f.pauseProvider();const pending=client.generateMode('travel',{background:true});await hold.ready;
 f.ctx.chatMetadata[C.MEMORY_KEY].archiveRevision='new-revision';hold.release();await pending;const saved=await f.persisted();assert.equal(saved.travel,undefined);assert.deepEqual(saved.phone,old.phone);assert.deepEqual(saved.cabinet,old.cabinet);
});
test('deleting mode during generation retains the original busy guard',async t=>{
 const f=await fixture(t);f.setResponse(raw('lake'));const hold=f.pauseProvider();const pending=client.generateMode('travel',{background:true});await hold.ready;
 try { await assert.rejects(cache.deleteSession('travel',f.liveBank.chatId),e=>e.code==='RMT_DELETE_DURING_GENERATION'); } finally { hold.release();await pending; }
 assert.ok((await f.persisted()).travel);
});
test('historical target generates only into its own archive; readonly collect refused',async t=>{
 const f=await fixture(t);const opts=await f.historical('travel');const response=raw('lake');response.locations[0].keepsake.kind='letter';f.setResponse(response);await client.generateMode('travel',{...opts,background:true});
 assert.equal((await f.persisted()).travel,undefined);assert.ok((await f.persisted(f.bEntry)).travel.locations[0].keepsake.design);
 await f.historical('inbox');state.activeArchiveReadOnly=true;const before=await f.persisted(f.bEntry);await inboxView.handleInboxAction('postcards');assert.deepEqual(await f.persisted(f.bEntry),before);assert.equal(f.requests.length,1);
});
test('lifecycle invalidation drops pending output',async t=>{
 const f=await fixture(t);f.setResponse(raw('lake'));const hold=f.pauseProvider();const pending=client.generateMode('travel',{background:true});await hold.ready;
 state.runtimeLifecycleEpoch+=1;hold.release();await pending;assert.equal((await f.persisted()).travel,undefined);
});
test('model error never leaks text into public notices',async t=>{
 const f=await fixture(t);f.setResponse(()=>{throw new Error('RAW_SYNTHETIC_PROVIDER_RESPONSE');});await client.generateMode('travel',{background:true});assert.doesNotMatch(JSON.stringify(f.notices),/RAW_SYNTHETIC_PROVIDER_RESPONSE/);
});

test('HTML-envelope protection remains intact before optional design normalization',async t=>{
 const f=await fixture(t),old=await f.persisted();const response=raw('lake');response.locations[0].keepsake.design={html:'<img src=x>'};f.setResponse(response);await client.generateMode('travel',{background:true});
 assert.equal((await f.persisted()).travel,undefined);assert.deepEqual((await f.persisted()).phone,old.phone);assert.equal(f.requests.length,1);
});
test('a newer canonical mode fence prevents an older design from overwriting it',async t=>{
 const f=await fixture(t);f.setResponse(raw('lake'));const hold=f.pauseProvider();const pending=client.generateMode('travel',{background:true});await hold.ready;
 try { await cache.claimLiveModeGeneration('travel',f.ctx,f.liveBank); } finally { hold.release();await pending; }
 assert.equal((await f.persisted()).travel,undefined);
});
