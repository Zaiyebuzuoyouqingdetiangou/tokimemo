import test from 'node:test';
import assert from 'node:assert/strict';
import {compactArchiveInputs,compactArchiveEntry,inputHash} from '../src/archive/draftInputs.js';
import * as recovery from '../src/archive/importRecovery.js';
import * as engine from '../src/generation/recovery.js';
import {setLocalRecoveryBackendForTests} from '../src/core/localRecoveryStore.js';
const MAX_CACHE_SOURCE_BYTES = 12000000; // historical boundary, not current policy
import {partialProgress,partialReceipt,partialBaseForDraft} from '../src/archive/partialImport.js';
import {checkedProgress,savedSourceRefs,progressTotals,advanceProgress,sourceHash} from '../src/archive/importBatches.js';
import {coveredRangesForSave} from '../src/archive/coverageRanges.js';
const origin={characterKey:'char',characterId:'0',characterAvatar:'char.png',chatId:'chat',archiveRevision:'',lifecycleEpoch:0};
function fixture(chars=20) {
 const messages=[{index:1,text:'中'.repeat(chars)}],snapshot={messages,incrementalMessages:messages,fingerprint:'same',fullFingerprint:'full',totalMessages:1};
 const data={operation:'import',snapshot,snapshotForIdentity:snapshot,external:{records:[],worldInfo:{entries:[]}},identity:{chat:'same'},contextEnvelope:'same-envelope',inputOwner:'same-owner'};
 const taskInputV1={version:1,digest:inputHash(data),data};
 return {batchVersion:1,taskInputV1,external:data.external,contextEnvelope:data.contextEnvelope,identity:data.identity,inputOwner:data.inputOwner,progress:{taskInputV1,batches:[],nextBatch:0}};
}
function backend() {
 const rows=new Map();setLocalRecoveryBackendForTests({read:async key=>structuredClone(rows.get(key)||null),compare:async(key,rev,payload)=>{assert.equal(rows.get(key)?.revision||0,rev);rows.set(key,{key,revision:rev+1,payload:structuredClone(payload)});return rev+1;}});recovery.resetArchiveRecoveryMemoryForTests();return rows;
}
test('old duplicated source exceeds 12MB; projection fits without deleting authoritative text',()=>{
 const original=fixture(600000),before=JSON.stringify(original),slim=compactArchiveInputs(original);
 assert.ok(Buffer.byteLength(before)>MAX_CACHE_SOURCE_BYTES);
 assert.ok(Buffer.byteLength(JSON.stringify(slim))<MAX_CACHE_SOURCE_BYTES);
 assert.deepEqual(slim.taskInputV1.data.snapshot.messages,original.taskInputV1.data.snapshot.messages);
 assert.equal(slim.taskInputV1.data.snapshotForIdentity.fullFingerprint,'full');
 assert.equal(JSON.stringify(original),before);
 assert.deepEqual(compactArchiveInputs(slim),slim);
});
test('a different embedded task is never silently removed',()=>{
 const old=fixture();old.progress.taskInputV1=structuredClone(old.taskInputV1);old.progress.taskInputV1.data.contextEnvelope='different';
 assert.ok(compactArchiveInputs(old).progress.taskInputV1);
});
test('tampered task/input hash is rejected, not resealed',()=>{
 const old=fixture();old.taskInputV1.digest='0'.repeat(64);assert.throws(()=>compactArchiveInputs(old),{code:'RMT_RECOVERY_DATA'});
 assert.throws(()=>compactArchiveEntry({inputs:fixture(),journal:{contentSnapshot:{archiveInputsHash:'0'.repeat(64)}}}),{code:'RMT_RECOVERY_DATA'});
});
test('legacy entry projection preserves source hash, request hashes and complete replies',()=>{
 const inputs=fixture(),journal={contentSnapshot:{archiveInputsHash:inputHash(inputs)},segments:[{slot:'chat:0',state:'complete',rawJson:'{"memories":[]}',requestHash:'b'.repeat(64)}]};
 const slim=compactArchiveEntry({inputs,journal,sourceHash:'a'.repeat(64)});
 assert.deepEqual(slim.journal.segments,journal.segments);assert.equal(slim.sourceHash,'a'.repeat(64));
 assert.equal(slim.journal.contentSnapshot.archiveInputsHash,inputHash(slim.inputs));
});
test('modern draft persists, reloads, and remains bounded; CAS acknowledgement is used',async()=>{
 const records=backend(),inputs=fixture(600000);
 assert.equal(recovery.archiveRecoveryDraftPlanExceedsCapacity(origin,'import',inputs),false);
 const ticket=await recovery.beginArchiveRecovery({origin,sourceIdentity:'x',sourceFragments:['x'],settingsIdentity:'x',inputs});
 recovery.releaseArchiveRecovery(ticket);await recovery.flushArchiveRecovery(origin);
 assert.ok([...records.values()].every(row=>Buffer.byteLength(JSON.stringify(row.payload))<=MAX_CACHE_SOURCE_BYTES));
 recovery.resetArchiveRecoveryMemoryForTests();await recovery.hydrateArchiveRecovery(origin);
 const restored=recovery.archiveRecoveryInputs(origin);assert.equal(restored.taskInputV1.data.snapshot.messages[0].text.length,600000);
});
test('nonredundant drafts above the former 12MB boundary save, reload and import',async()=>{
 const records=backend();const inputs=fixture();inputs.large='中'.repeat(4000001);
 assert.equal(recovery.archiveRecoveryDraftPlanExceedsCapacity(origin,'import',inputs),false);
 const ticket=await recovery.beginArchiveRecovery({origin,sourceIdentity:'x',sourceFragments:['x'],settingsIdentity:'x',inputs});
 recovery.releaseArchiveRecovery(ticket);await recovery.flushArchiveRecovery(origin);
 assert.ok(Buffer.byteLength(JSON.stringify([...records.values()][0].payload))>MAX_CACHE_SOURCE_BYTES);
 recovery.resetArchiveRecoveryMemoryForTests();await recovery.hydrateArchiveRecovery(origin);
 assert.equal(recovery.archiveRecoveryInputs(origin).large,inputs.large);
 const rows=recovery.exportArchiveRecovery(origin);backend();
 await recovery.importArchiveRecoveryData(origin,{format:'hearttrace-unarchived-results-v2',pageDrafts:rows});
 assert.equal(recovery.exportArchiveRecovery(origin)[0].inputs.large,inputs.large);
});
test('actual storage quota failure keeps the draft available and never reports durable success',async()=>{
 backend();setLocalRecoveryBackendForTests({read:async()=>null,compare:async()=>{const e=new Error('quota');e.name='QuotaExceededError';throw e;}});
 await assert.rejects(recovery.beginArchiveRecovery({origin,sourceIdentity:'x',sourceFragments:['x'],settingsIdentity:'x',inputs:fixture()}),{code:'RMT_ARCHIVE_DRAFT_STORAGE'});
 assert.equal(recovery.archiveRecoveryInputs(origin).taskInputV1.version,1);
});
test('local-only recovery cannot dispatch an incomplete slot',async()=>{
 backend();const ticket=await recovery.beginArchiveRecovery({origin,sourceIdentity:'x',sourceFragments:['x'],settingsIdentity:'x',inputs:fixture(),completedOnly:true});
 await assert.rejects(recovery.requestArchiveRecoverySegment(ticket,'chat:0','never send',{},()=>{}),{code:'RMT_RECOVERY_INPUT_CHANGED'});
 recovery.releaseArchiveRecovery(ticket);
});
function plan() {const ref=(index,offset=0)=>({kind:'chat',index,offset,length:2,hash:sourceHash('ab')});return {version:1,taskId:'t',identity:{},nextBatch:0,batches:[[{kind:'chat',refs:[ref(1),ref(2)]},{kind:'chat',refs:[ref(3)]},{kind:'chat',refs:[ref(4),ref(5)]}]],capacityPending:[]};}
test('partial commit leaves failed middle ranges and batch unfinished',()=>{
 const p=partialProgress(plan(),new Set(['chat:0','chat:2']),'r1');checkedProgress(p);
 assert.equal(p.nextBatch,0);assert.equal(savedSourceRefs(p).length,4);assert.equal(progressTotals(p).remaining,1);
 assert.deepEqual(coveredRangesForSave(null,{window:{start:1,end:5},progress:p,revision:'r1'}).map(x=>[x.start,x.end]),[[1,2],[4,5]]);
 const complete=advanceProgress(p,{archiveRevision:'r2'});assert.equal(complete.nextBatch,1);assert.equal(complete.partialParts,undefined);assert.equal(progressTotals(complete).remaining,0);
});
test('half of a split floor is never marked covered',()=>{
 const p=plan();p.batches[0][1].refs[0].index=2;
 const part=partialProgress(p,new Set(['chat:0']),'r1');
 assert.deepEqual(coveredRangesForSave(null,{window:{start:1,end:5},progress:part}).map(x=>[x.start,x.end]),[[1,1]]);
});
test('invalid duplicate and out-of-range partial indexes are rejected',()=>{
 for(const partialParts of [[0,0],[8],[-1],['0']]) assert.throws(()=>checkedProgress({...plan(),partialParts}));
});
test('receipt cannot be reused for altered replies, a changed revision, or another draft',()=>{
 const entry={draftId:'d',sourceHash:'s',journal:{segments:[{slot:'chat:0',state:'complete',requestHash:'h',rawJson:'{"memories":[]}'},{slot:'chat:1',state:'retry'}]}};
 const bank={archiveRevision:'r',archivePartialDraft:partialReceipt(entry,'r')};assert.equal(partialBaseForDraft(entry,bank),bank);
 assert.equal(partialBaseForDraft({...entry,draftId:'other'},bank),null);
 assert.throws(()=>partialBaseForDraft(entry,{...bank,archiveRevision:'new'}));
 const changed=structuredClone(entry);changed.journal.segments[0].rawJson='{}';assert.throws(()=>partialBaseForDraft(changed,bank));
});
test('an unknown complete slot cannot be marked as covered or committed',()=>{
 assert.throws(()=>partialProgress(plan(),new Set(['chat:99']),'r'),{code:'RMT_RECOVERY_DATA'});
});
test('cache compression and decompression round-trip data above the former storage ceiling',async()=>{
 const {gzipJson,gunzipJson}=await import('../src/core/cache.js');
 const data={text:'中'.repeat(4000001)};
 const packed=await gzipJson(data);assert.ok(packed.sourceBytes>MAX_CACHE_SOURCE_BYTES);
 assert.deepEqual(await gunzipJson(packed.data),data);
});
test('compressed data above former 4M base64 boundary remains readable',async()=>{
 const {randomBytes}=await import('node:crypto');const {gzipJson,gunzipJson}=await import('../src/core/cache.js');
 const data={text:randomBytes(3300000).toString('base64')};const packed=await gzipJson(data);
 assert.ok(packed.data.length>4000000);assert.deepEqual(await gunzipJson(packed.data),data);
});
test('formal checkpoint and independent backup accept more than 12MB without bypassing write acknowledgement',async()=>{
 const backup=await import('../src/archive/backupStore.js');
 const progress={...plan(),sourceText:'中'.repeat(4000001)};assert.equal(checkedProgress(progress).sourceText.length,4000001);
 let record=null;backup.setArchiveBackupBackendForTests({read:async()=>record,put:async value=>{record=structuredClone(value);return true;}});
 const entry={characterName:'Char',characterKey:'char',avatar:'char.png',chatId:'chat',characterIndexHint:0};
 const memory={chatId:'chat',archiveRevision:'r',memories:[],archiveImportProgress:progress};
 await backup.replaceArchiveBackup(entry,memory,null,{present:false});
 assert.equal(record.memory.archiveImportProgress.sourceText.length,4000001);
 backup.setArchiveBackupBackendForTests({put:async()=>false});
 await assert.rejects(backup.replaceArchiveBackup(entry,memory,null,{present:false}));
 backup.setArchiveBackupBackendForTests(null);
});
