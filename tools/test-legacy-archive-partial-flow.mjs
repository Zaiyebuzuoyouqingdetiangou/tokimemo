import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './runtime-harness.mjs';
test('15 successes survive local partial commit, reload and continuation without duplicate requests',async()=>{
 const h=await harness();const first=await h.repo.importCurrentChatMemory();
 assert.equal(first.status,'failed',JSON.stringify(h.events));assert.equal(h.providerCalls.length,15);
 let summary=h.repo.getCurrentArchiveImportRecoverySummary(h.host);assert.equal(summary.completed,15,JSON.stringify(h.events));
 const before=JSON.stringify(h.host.chat);await h.reload();
 const result=await h.repo.continueCurrentArchiveImport({commitCompletedOnly:true});
 assert.equal(result.status,'committed',JSON.stringify(h.events));assert.equal(h.providerCalls.length,15);
 let bank=h.repo.getImportedMemory(h.host);assert.equal(bank.memories.length,15);assert.equal(bank.archiveImportProgress.nextBatch,0);assert.equal(bank.archivePartialDraft.slots.length,15);
 const ids=bank.memories.map(m=>m.id);assert.equal(h.repo.getCurrentArchiveImportRecoverySummary(h.host).completed,15);
 await h.reload();h.allow(100);
 const done=await h.repo.continueCurrentArchiveImport();assert.equal(done.status,'committed',JSON.stringify(h.events));
 bank=h.repo.getImportedMemory(h.host);assert.ok(bank.memories.length>15);assert.deepEqual(Array.from(bank.memories.slice(0,15),m=>m.id),Array.from(ids));assert.equal(bank.archivePartialDraft,undefined);
 assert.equal(h.providerCalls.length,new Set(h.providerCalls).size);assert.equal(JSON.stringify(h.host.chat),before);
 assert.equal(bank.coverageMode,'batched-complete');
});
test('a failed canonical write keeps the original draft and does not advance coverage',async()=>{
 const h=await harness({messages:12,failAfter:1});await h.repo.importCurrentChatMemory();
 h.module('archive/backupStore.js').setArchiveBackupBackendForTests({read:async()=>null,put:async()=>{throw new Error('fixture storage unavailable');}});
 const before=h.providerCalls.length;const result=await h.repo.continueCurrentArchiveImport({commitCompletedOnly:true});
 assert.equal(result.status,'failed');assert.equal(h.repo.getImportedMemory(h.host),null);
 assert.equal(h.providerCalls.length,before);assert.equal(h.repo.getCurrentArchiveImportRecoverySummary(h.host).completed,1);
});
test('changed chat cannot receive partial results from an earlier source snapshot',async()=>{
 const h=await harness({messages:12,failAfter:1});await h.repo.importCurrentChatMemory();h.host.chat[0].mes='edited';
 const result=await h.repo.continueCurrentArchiveImport({commitCompletedOnly:true});assert.equal(result.status,'failed',JSON.stringify(h.events));
 assert.equal(h.repo.getImportedMemory(h.host),null);assert.equal(h.providerCalls.length,1);
});
test('export and import preserve successful recipes and sources, without model calls',async()=>{
 const h=await harness({messages:12,failAfter:1});await h.repo.importCurrentChatMemory();const data=await h.repo.exportCurrentArchiveRecoveryAfterLoad(h.host);
 await h.repo.discardCurrentArchiveImportRecovery(h.host);const result=await h.repo.importCurrentArchiveRecoveryFile(data,h.host);
 assert.equal(result.completed,1);assert.equal(h.providerCalls.length,1);
 const saved=await h.repo.continueCurrentArchiveImport({commitCompletedOnly:true});assert.equal(saved.status,'committed',JSON.stringify(h.events));assert.equal(h.providerCalls.length,1);
});
test('importing a different source snapshot is rejected without writing',async()=>{
 const h=await harness({messages:12,failAfter:1});await h.repo.importCurrentChatMemory();const data=await h.repo.exportCurrentArchiveRecoveryAfterLoad(h.host);
 await h.repo.discardCurrentArchiveImportRecovery(h.host);h.host.chat[0].mes='different history';
 await assert.rejects(h.repo.importCurrentArchiveRecoveryFile(data,h.host),{code:'RMT_RECOVERY_INPUT_CHANGED'});assert.equal(h.providerCalls.length,1);
});
test('discarding the remaining draft after partial save does not re-request committed source parts',async()=>{
 const h=await harness({messages:12,failAfter:1});await h.repo.importCurrentChatMemory();await h.repo.continueCurrentArchiveImport({commitCompletedOnly:true});
 await h.repo.discardCurrentArchiveImportRecovery(h.host);await h.reload();h.allow(100);
 const result=await h.repo.continueCurrentArchiveImport();assert.equal(result.status,'committed',JSON.stringify(h.events));assert.equal(h.providerCalls.length,new Set(h.providerCalls).size);
});
test('old duplicated snapshots migrate without altering successful request recipes',async()=>{
 const h=await harness({messages:12,failAfter:1});await h.repo.importCurrentChatMemory();
 const record=[...h.disk.values()][0],entry=record.payload.rows[0][1],inputs=entry.inputs,data=inputs.taskInputV1.data;
 data.snapshotForIdentity.messages=h.copy(data.snapshot.messages);data.snapshotForIdentity.incrementalMessages=h.copy(data.snapshot.messages);data.snapshot.incrementalMessages=h.copy(data.snapshot.messages);
 const hash=h.module('archive/draftInputs.js').inputHash;inputs.taskInputV1.digest=hash(data);
 inputs.progress.taskInputV1=h.copy(inputs.taskInputV1);inputs.external=h.copy(data.external);inputs.contextEnvelope=data.contextEnvelope;
 entry.journal.contentSnapshot.archiveInputsHash=hash(inputs);const recipes=JSON.stringify(entry.journal.segments);
 await h.reload();const draft=h.module('archive/importRecovery.js').exportArchiveRecovery(h.module('core/context.js').captureTaskOrigin(h.host))[0];
 assert.equal(JSON.stringify(draft.journal.segments),recipes);assert.ok(!draft.inputs.progress.taskInputV1);
 assert.equal((await h.repo.continueCurrentArchiveImport({commitCompletedOnly:true})).status,'committed',JSON.stringify(h.events));assert.equal(h.providerCalls.length,1);
});
test('switching chats during draft persistence cannot write a partial archive',async()=>{
 const h=await harness({messages:12,failAfter:1});await h.repo.importCurrentChatMemory();
 h.module('core/localRecoveryStore.js').setLocalRecoveryBackendForTests({read:async key=>h.copy(h.disk.get(key)||null),compare:async(key,revision,payload)=>{
   h.disk.set(key,{key,revision:revision+1,payload:h.copy(payload)});h.host.chatId='other-chat';return revision+1;
 }});
 const result=await h.repo.continueCurrentArchiveImport({commitCompletedOnly:true});assert.ok(['failed','cancelled'].includes(result.status),JSON.stringify(h.events));assert.equal(h.repo.getImportedMemory(h.host),null);assert.equal(h.providerCalls.length,1);
});
test('a concurrent formal archive write wins over a stale partial commit',async()=>{
 const h=await harness({messages:12,failAfter:1});await h.repo.importCurrentChatMemory();
 const foreign={version:3,chatId:'test-chat',archiveRevision:'concurrent',memories:[],archiveName:'Other operation'};
 h.module('archive/backupStore.js').setArchiveBackupBackendForTests({read:async()=>null,put:async()=>{h.host.chatMetadata.heartbeatMemoriesArchiveV3=h.copy(foreign);return true;}});
 const result=await h.repo.continueCurrentArchiveImport({commitCompletedOnly:true});assert.equal(result.status,'failed',JSON.stringify(h.events));
 assert.equal(h.host.chatMetadata.heartbeatMemoriesArchiveV3.archiveRevision,'concurrent');assert.equal(h.providerCalls.length,1);
});

test('rebuilt runtime bundle supports zero-request partial save and remaining-only continuation',async()=>{
 const h=await harness({messages:12,failAfter:1,bundle:true});await h.repo.importCurrentChatMemory();
 assert.equal((await h.repo.continueCurrentArchiveImport({commitCompletedOnly:true})).status,'committed',JSON.stringify(h.events));assert.equal(h.providerCalls.length,1);
 await h.reload();h.allow(100);assert.equal((await h.repo.continueCurrentArchiveImport()).status,'committed',JSON.stringify(h.events));
 assert.equal(h.providerCalls.length,new Set(h.providerCalls).size);assert.equal(h.repo.getImportedMemory(h.host).coverageMode,'batched-complete');
});
test('switching at the partial commit boundary leaves the resumable original draft intact',async()=>{
 const h=await harness({messages:12,failAfter:1,bundle:true});await h.repo.importCurrentChatMemory();
 h.module('ui/overlay.js').updateBackgroundTaskLabel=label=>{if(label.includes('简介'))h.host.chatId='other-chat';};
 const result=await h.repo.continueCurrentArchiveImport({commitCompletedOnly:true});assert.ok(['failed','cancelled'].includes(result.status));assert.equal(h.providerCalls.length,1);
 h.host.chatId='test-chat';const rows=h.module('archive/importRecovery.js').listArchiveRecoveryDrafts(h.module('core/context.js').captureTaskOrigin(h.host));
 assert.equal(rows[0].stage,'segments');assert.equal(h.repo.getImportedMemory(h.host),null);
});
test('external-source partial save retains validated anchors and never claims chat floor coverage',async()=>{
 const h=await harness({messages:2,failAfter:1});
 const scenes=Array.from({length:8},(_,i)=>({id:`scene-${i}`,plot:'已散步。'+'风'.repeat(9000)}));
 await h.repo.importSelectedStoryScenes(scenes);assert.equal(h.providerCalls.length,1);
 const saved=await h.repo.continueCurrentArchiveImport({commitCompletedOnly:true});assert.equal(saved.status,'committed',JSON.stringify(h.events));
 const bank=h.repo.getImportedMemory(h.host);assert.equal(bank.memories[0].sourceKind,'external-current-chat');assert.ok(bank.memories[0].externalSourceAnchor);assert.equal(bank.coveredRanges?.length||0,0);
 await h.reload();h.allow(100);const completed=await h.repo.continueCurrentArchiveImport();assert.equal(completed.status,'committed',JSON.stringify(h.events));assert.equal(h.providerCalls.length,new Set(h.providerCalls).size);
});
