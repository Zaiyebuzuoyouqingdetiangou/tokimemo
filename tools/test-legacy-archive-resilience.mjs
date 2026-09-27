import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './runtime-harness.mjs';
const chatCalls=calls=>calls.filter(p=>p.includes('UNTRUSTED_CHAT_JSON:\n'));
const batchChars=parts=>parts.filter(p=>p.kind==='chat').reduce((n,p)=>n+p.refs.reduce((m,r)=>m+r.length,0),0);

test('r84.71 default batches checkpoint about every 150k characters at request boundaries, cover only on the last batch',async()=>{
 const h=await harness({messages:80,failAfter:10000,batchChars:150000});
 const first=await h.repo.importCurrentChatMemory();assert.equal(first.status,'committed',JSON.stringify(h.events));
 let bank=h.repo.getImportedMemory(h.host);const progress=bank.archiveImportProgress;
 assert.ok(progress.batches.length>=3,String(progress.batches.length));
 for(const parts of progress.batches)assert.ok(batchChars(parts)<=150000,String(batchChars(parts)));
 const floors=new Set(progress.batches.flatMap(parts=>parts.flatMap(p=>p.refs.map(r=>r.index))));assert.equal(floors.size,80,'every floor planned, nothing sampled');
 assert.equal(progress.nextBatch,1);assert.equal(h.providerCalls.length,chatCalls(h.providerCalls).length,'no paid cover request on an intermediate batch');
 assert.equal(h.providerCalls.length,progress.batches[0].length);
 for(let i=1;i<progress.batches.length;i+=1){const r=await h.repo.continueCurrentArchiveImport();assert.equal(r.status,'committed',JSON.stringify(h.events));}
 bank=h.repo.getImportedMemory(h.host);assert.equal(bank.coverageMode,'batched-complete');
 assert.equal(h.providerCalls.length-chatCalls(h.providerCalls).length,1,'exactly one cover request, on the final batch');
 assert.equal(new Set(chatCalls(h.providerCalls)).size,chatCalls(h.providerCalls).length,'no chat source sent twice');
});

test('transient 502 / network failures are retried automatically and the batch still completes',async()=>{
 const clean=await harness({messages:12,failAfter:10000});await clean.repo.importCurrentChatMemory();
 const h=await harness({messages:12,failAfter:10000,transientFailures:2});
 const result=await h.repo.importCurrentChatMemory();assert.equal(result.status,'committed',JSON.stringify(h.events));
 assert.equal(h.providerCalls.length,clean.providerCalls.length);
 assert.equal(h.repo.getImportedMemory(h.host).memories.length,clean.repo.getImportedMemory(clean.host).memories.length);
});

test('transient retries are bounded; more consecutive failures stop and keep the draft',async()=>{
 const h=await harness({messages:12,failAfter:10000,transientFailures:3});
 const result=await h.repo.importCurrentChatMemory();assert.equal(result.status,'failed');
 assert.equal(h.providerCalls.length,0);assert.equal(h.repo.getImportedMemory(h.host),null);
 assert.ok(h.repo.getCurrentArchiveImportRecoverySummary(h.host));
});

test('unclassified connection failures are not retried automatically',async()=>{
 const h=await harness({messages:12,failAfter:1});
 const result=await h.repo.importCurrentChatMemory();assert.equal(result.status,'failed');assert.equal(h.providerCalls.length,1);
});

test('a failed chunk automatically saves the successful chunks without a model request; retry sends only the rest',async()=>{
 const h=await harness({autoPartial:true});
 const first=await h.repo.importCurrentChatMemory();assert.equal(first.status,'failed');assert.equal(h.providerCalls.length,15);
 let bank=h.repo.getImportedMemory(h.host);assert.ok(bank,JSON.stringify(h.events));assert.equal(bank.memories.length,15);
 const ids=bank.memories.map(m=>m.id);
 await h.reload();h.allow(1000);
 const done=await h.repo.continueCurrentArchiveImport();assert.equal(done.status,'committed',JSON.stringify(h.events));
 bank=h.repo.getImportedMemory(h.host);assert.ok(bank.memories.length>15);assert.deepEqual(Array.from(bank.memories.slice(0,15),m=>m.id),Array.from(ids));
 const chats=chatCalls(h.providerCalls);assert.equal(new Set(chats).size,chats.length);
});

test('automatic partial save does not repeat when nothing new succeeded',async()=>{
 const h=await harness({autoPartial:true});await h.repo.importCurrentChatMemory();
 const revision=h.repo.getImportedMemory(h.host).archiveRevision;
 const again=await h.repo.continueCurrentArchiveImport();assert.equal(again.status,'failed');
 assert.equal(h.repo.getImportedMemory(h.host).archiveRevision,revision);
});

test('rebuilt runtime bundle: transient retry, small batches and automatic partial save',async()=>{
 const h=await harness({bundle:true,autoPartial:true,transientFailures:1,batchChars:150000});
 const first=await h.repo.importCurrentChatMemory();assert.equal(first.status,'committed',JSON.stringify(h.events));
 const bank=h.repo.getImportedMemory(h.host);assert.ok(bank.archiveImportProgress.batches.length>=3);assert.equal(bank.archiveImportProgress.nextBatch,1);
 h.allow(h.providerCalls.length+2);
 const second=await h.repo.continueCurrentArchiveImport();assert.equal(second.status,'failed');
 const after=h.repo.getImportedMemory(h.host);assert.ok(after.memories.length>bank.memories.length,'successful chunks of the failed batch were saved automatically');
});
