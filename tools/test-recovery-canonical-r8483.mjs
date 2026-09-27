import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { preparationFixture } from './preparation-harness-r8481.mjs';
// Production recovery/cache/backup implementations; only browser storage and host are replaced.
async function canonicalFixture(){
const f=await preparationFixture();f.sandbox.Blob=Blob;vm.runInContext('structuredClone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))',f.sandbox);
const cc=await f.api('core/context.js'),cache=await f.api('core/cache.js'),backup=await f.api('archive/backupStore.js'),rec=await f.api('generation/recovery.js'),m=await f.api('generation/mergedGeneration.js');
const records=new Map(),ls=new Map();let failApply=false;f.sandbox.localStorage={getItem:k=>ls.get(k)||null,setItem:(k,v)=>ls.set(k,v)};
backup.setArchiveBackupBackendForTests({read:async e=>structuredClone(records.get(e.entryId)||null),put:async(r,expected)=>{if(failApply && r.cache?.__generationDraftsV2?.records?.one?.status==='applied'){failApply=false;throw Error('write failed');}if(expected?.present && records.get(r.entryId)?.archiveRevision!==expected.revision)throw Error('CAS'); records.set(r.entryId,structuredClone(r));return true;}});
const old={version:3,chatId:f.host.chatId,archiveRevision:'rev1',characterName:'岚',userName:'阿宁',memories:[{id:'M001',title:'礼物',summary:'岚送给阿宁一封信',anchors:['一封信']}]};
f.host.chatMetadata.heartbeatMemoriesArchiveV3=old;
const entry=cache.archiveBackupEntryForContext(f.host,old),origin={...cc.captureTaskOrigin(f.host,'rev1'),archiveTargetEntryId:entry.entryId,generationRecoveryDraftId:'one'};
const h=await rec.createGenerationRecovery({origin,mode:'cabinet',settingsIdentity:'x',draftId:'one',pageId:'cabinet',contentSnapshot:vm.runInContext('('+JSON.stringify({memoryBank:old,fields:{},cardFields:{}})+')',f.sandbox)});h.journal.operation=vm.runInContext('({kind:"merged",mode:"cabinet"})',f.sandbox);
const newer={...old,archiveRevision:'rev2'};f.host.chatMetadata.heartbeatMemoriesArchiveV3=newer;
const original={kind:'cabinet',chatId:old.chatId,archiveRevision:'rev2',title:'旧柜子',items:[{id:'keep',name:'信'}]};
const data={chatId:old.chatId,archiveRevision:'rev2',cabinet:original,__generationDraftsV2:{version:1,records:{one:{status:'open',journal:h.journal}}}};
f.host.chatMetadata.heartbeatMemoriesTheaterV3=data;
await backup.seedArchiveBackup(entry,newer,data);
const p=m.createPendingStore(f.sandbox.localStorage);p.write(old.chatId,[{id:'one',route:'cabinet',mode:'cabinet',kind:'unsaved',origin,session:{kind:'cabinet',items:[{name:'新信'}]}}]);

return {f,cc,cache,backup,rec,m,entry,origin,old,newer,p,original,failNextApply(){failApply=true;}};
}
test('real canonical save-only updates current revision, preserves prior page and original source',async()=>{
 const x=await canonicalFixture();assert.ok(x.cache.loadGenerationRecovery('cabinet',x.f.host,undefined,{draftId:'one',intent:'inspect'}));
 assert.equal((await x.m.repairPending('cabinet','one')).requested,false);
 const saved=await x.backup.readArchiveBackup(x.entry);
 assert.equal(saved.memory.archiveRevision,'rev2');assert.equal(saved.cache.cabinet.items[0].name,'新信');
 assert.equal(saved.cache.cabinet.generationSources.cabinet.sourceMemory.archiveRevision,'rev1');
 assert.equal(saved.cache.__archiveVersionsV1.length,1);assert.equal(saved.cache.__archiveVersionsV1[0].cache.cabinet.title,'旧柜子');
 assert.equal(saved.cache.__generationDraftsV2.records.one.status,'applied');assert.equal(x.f.providerCalls,0);
});
test('real staged save survives failed apply, retries once, and already-applied pending cleanup is idempotent',async()=>{
 const x=await canonicalFixture();const pending=x.p.readForOrigin(x.origin)[0];x.failNextApply();
 await assert.rejects(x.m.repairPending('cabinet','one'));
 let saved=await x.backup.readArchiveBackup(x.entry);assert.equal(saved.cache.__generationDraftsV2.records.one.status,'awaiting-choice');assert.equal(saved.cache.cabinet.title,'旧柜子');
 await x.m.repairPending('cabinet','one');saved=await x.backup.readArchiveBackup(x.entry);assert.equal(saved.cache.__archiveVersionsV1.length,1);
 x.p.write(x.old.chatId,[pending]);await x.m.repairPending('cabinet','one');saved=await x.backup.readArchiveBackup(x.entry);
 assert.equal(saved.cache.__archiveVersionsV1.length,1);assert.equal(x.p.readForOrigin(x.origin).length,0);assert.equal(x.f.providerCalls,0);
});
test('real canonical empty achievements save and reopen remains valid',async()=>{
 const x=await canonicalFixture(),a=await x.f.api('modes/achievements.js');const session=a.normalizeAchievements({entries:[]},x.newer);
 assert.equal(await x.cache.commitSession('achievements',session,x.old.chatId,x.cc.captureTaskOrigin(x.f.host,'rev2')),true);
 const saved=await x.backup.readArchiveBackup(x.entry),shown=x.cache.loadSession('achievements',{context:x.f.host,cache:saved.cache,memoryBank:x.newer,chatId:x.old.chatId});
 assert.ok(shown);assert.equal(shown.entries.length,0);assert.equal(x.f.providerCalls,0);
});
test('real canonical discard after failed apply closes only pending result and preserves current page',async()=>{
 const x=await canonicalFixture();x.failNextApply();await assert.rejects(x.m.repairPending('cabinet','one'));
 assert.equal(await x.m.discardPending('cabinet','one'),true);const saved=await x.backup.readArchiveBackup(x.entry);
 assert.equal(saved.cache.__generationDraftsV2.records.one.status,'discarded');assert.equal(saved.cache.cabinet.title,'旧柜子');assert.equal(x.p.readForOrigin(x.origin).length,0);
});
test('new-task duplicate key is reserved synchronously until the first task settles',async()=>{
 const x=await canonicalFixture(),c=x.f.coordinator,key=c.generationTaskKeyForMode('cabinet',x.f.host);
 const task=c.beginLogicalGenerationTask({kind:'mode',mode:'cabinet',context:x.f.host,taskKey:key});
 assert.throws(()=>c.beginLogicalGenerationTask({kind:'mode',mode:'cabinet',context:x.f.host,taskKey:key}),{code:'RMT_LOGICAL_TASK_BUSY'});
 c.finishLogicalGenerationTask(task,{status:'settled'});
 const next=c.beginLogicalGenerationTask({kind:'mode',mode:'cabinet',context:x.f.host,taskKey:key});c.finishLogicalGenerationTask(next,{status:'settled'});
});
