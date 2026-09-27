import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { preparationFixture } from './preparation-harness-r8481.mjs';
const bank={chatId:'preparation-check',archiveRevision:'rev1',characterName:'岚',userName:'阿宁',memories:[]};
const origin={characterKey:'owner',chatId:bank.chatId,archiveRevision:bank.archiveRevision,archiveTargetEntryId:'entry',modeWriteFences:{}};
function storage(){const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};}
test('cabinet and achievements accepted results carry trusted identity and save in one provider call',async()=>{
 const f=await preparationFixture(),m=await f.api('generation/mergedGeneration.js');
 await f.api('modes/cabinet.js');
 await f.api('modes/achievements.js');
 const tasks=['cabinet','achievements'].map(route=>m.buildMergeTask(route,f.host,bank));let calls=0,saves=[];
 const result=await m.runMergedBatch({tasks,request:async()=>{calls++;return {modules:{cabinet:{items:[]},achievements:{title:'成就库',entries:[]}}};},
 save:async(mode,session)=>{m.assertMergedSaveIdentity(session,origin,bank);saves.push(mode);}});
 assert.equal(calls,1);assert.equal(result.failed.length,0);assert.equal(saves.length,2);
});
test('legacy unstamped checked result can resave without another model call; explicit foreign identity cannot',async()=>{
 const f=await preparationFixture(),m=await f.api('generation/mergedGeneration.js');let calls=0,saved=0;
 const result=await m.runMergedRepair({item:{kind:'unsaved',mode:'cabinet',session:{kind:'cabinet',items:[]}},request:()=>{calls++;},
 save:async(mode,s)=>{m.assertMergedSaveIdentity(s,origin,bank);saved++;}});
 assert.equal(result.requested,false);assert.equal(saved,1);assert.equal(calls,0);
 assert.throws(()=>m.assertMergedSaveIdentity({chatId:'another-chat'},origin,bank),{code:'RMT_MERGED_ORIGIN'});
 assert.throws(()=>m.assertMergedSaveIdentity({archiveRevision:'another-source'},origin,bank),{code:'RMT_MERGED_ORIGIN'});
});
test('pending old archive revision remains accessible and removal is exact-owner exact-id',async()=>{
 const f=await preparationFixture(),m=await f.api('generation/mergedGeneration.js'),p=m.createPendingStore(storage());
 const own={id:'one',route:'cabinet',origin}, foreign={id:'other',route:'cabinet',origin:{...origin,characterKey:'other'}};
 p.write(bank.chatId,[own,foreign,{...own,id:'two'}]);const updated={...origin,archiveRevision:'rev2'};
 assert.equal(p.readForOrigin(updated).length,2);p.removeForOrigin(updated,'one');
 assert.deepEqual(Array.from(p.read(bank.chatId),r=>r.id),['other','two']);
 assert.equal(p.readForOrigin({...updated,archiveTargetEntryId:'different'}).length,0);
});
test('storage failure leaves pending successful result intact',async()=>{
 const f=await preparationFixture(),m=await f.api('generation/mergedGeneration.js'),st=storage(),p=m.createPendingStore(st);
 p.write(bank.chatId,[{id:'one',route:'cabinet',origin,kind:'unsaved',session:{items:[]}}]);st.setItem=()=>{throw Error('quota');};
 assert.throws(()=>p.removeForOrigin(origin,'one'),{code:'RMT_MERGED_STORAGE'});assert.equal(p.readForOrigin(origin).length,1);
});
test('header renders one task summary for arbitrarily many tasks',async()=>{
 const source=await readFile(new URL('../src/ui/taskCenter.js',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('export function liveTaskStripHtml'),source.indexOf('\nfunction paintLiveStrip'));
 const c=vm.createContext({});vm.runInContext(body.replace('export ',''),c);
 const html=c.liveTaskStripHtml(7,120);assert.equal((html.match(/<button/g)||[]).length,1);assert.match(html,/120 项待处理/);assert.equal(c.liveTaskStripHtml(0,0),'');
});
async function recoveryBoundary(overrides={}, localStorage=storage()) {
 const f=await preparationFixture(), file=new URL('../src/generation/mergedGeneration.js',import.meta.url);
 const context=vm.createContext({localStorage,structuredClone,console,DOMException,Date,JSON,Set,Map,Number,Object,Array,Math});
 const source=await readFile(file,'utf8'),mod=new vm.SourceTextModule(source,{context,identifier:file.href});
 await mod.link(async spec=>{
   const path=new URL(spec,file).pathname.split('/src/')[1],real=await f.api(path),values={...real,...(overrides[path]||{})};
   return new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value] of Object.entries(values))this.setExport(key,value);},{context});
 });await mod.evaluate();return mod.namespace;
}
test('explicit resave stages old source then applies with version preservation instead of rejecting new revision',async()=>{
 const st=storage(),calls=[];let m;
 const live={...bank,archiveRevision:'rev2'},fresh={...origin,archiveRevision:'rev2'};
 const cache={archiveBackupEntryForContext:()=>({entryId:'entry'}),loadGenerationRecovery:()=>({identity:{mode:'cabinet'},draftId:'one'}),listGenerationTaskResults:()=>[],
   saveGenerationTaskResult:async(ctx,mode,session,o,options)=>{calls.push('stage');assert.equal(session.archiveRevision,'rev1');assert.equal(options.sourceMemory.archiveRevision,'rev1');assert.equal(options.memoryBank.archiveRevision,'rev2');},
   resolveGenerationTaskResult:async(ctx,id,choice)=>{calls.push('apply');assert.equal(choice,'apply');assert.equal(id,'one');}};
 m=await recoveryBoundary({'core/context.js':{currentCharacterGuard:()=>({}),captureTaskOrigin:()=>fresh,comparableChatId:x=>x,deferredCommitOriginMatchesContext:()=>true},
 'archive/repository.js':{requireArchive:()=>live,getImportedMemory:()=>live},'core/cache.js':cache,
 'generation/recovery.js':{readGenerationContentSnapshot:()=>({memoryBank:bank})},
 'core/requestCoordinator.js':{isModeGenerating:()=>false,generationTaskKeyForMode:x=>x}},st);
 // Default store uses the module context global localStorage.
 // Supply storage via the same module context by reconstructing the factory default's global.
 const factory=m.createPendingStore;const pending=factory(st);pending.write(bank.chatId,[{id:'one',route:'cabinet',mode:'cabinet',kind:'unsaved',origin:{...origin,generationRecoveryDraftId:'one'},session:{kind:'cabinet',items:[]}}]);
 const result=await m.repairPending('cabinet','one');assert.equal(result.requested,false);assert.deepEqual(calls,['stage','apply']);assert.equal(pending.readForOrigin(origin).length,0);
});
test('discard removes only chosen pending and journal after stopping its exact owner',async()=>{
 const st=storage(),calls=[];
 const m=await recoveryBoundary({'core/context.js':{currentCharacterGuard:()=>({}),captureTaskOrigin:()=>({...origin}),comparableChatId:x=>x,isCurrentTaskOrigin:()=>true},
 'archive/repository.js':{requireArchive:()=>bank,getImportedMemory:()=>bank},
 'core/cache.js':{listGenerationTaskResults:()=>[],archiveBackupEntryForContext:()=>({entryId:'entry'}),loadGenerationRecovery:()=>({identity:{mode:'cabinet'}}),saveGenerationRecovery:async(ctx,b,mode,j,o,opt)=>{calls.push(['close',opt.draftId]);return true;}},
 'generation/recovery.js':{discardGenerationRecoveryHeldReplies:()=>{}},
 'core/requestCoordinator.js':{queryParticipantGenerationTasks:()=>[{id:'running-one',draftId:'one'},{id:'running-two',draftId:'two'}],cancelParticipantGenerationTasks:async ids=>calls.push(['cancel',...ids])}},st);
 const p=m.createPendingStore(st);p.write(bank.chatId,[{id:'one',mode:'cabinet',route:'cabinet',origin:{...origin,generationRecoveryDraftId:'one'}},{id:'two',mode:'cabinet',route:'cabinet',origin:{...origin,generationRecoveryDraftId:'two'}}]);
 assert.equal(await m.discardPending('cabinet','one'),true);assert.deepEqual(calls,[['cancel','running-one'],['close','one']]);assert.deepEqual(Array.from(p.readForOrigin(origin),r=>r.id),['two']);
});
test('deferred results survive former count size and age limits',async()=>{
 const f=await preparationFixture(),d=await f.api('core/deferredCommitStore.js'),st=storage(),map=d.createDurableDeferredCommitMap({storage:st});
 map.set('owner',Array.from({length:25},(_,i)=>({kind:'sessions',origin,queuedAt:1,session:{text:'x'.repeat(145000),id:i}})));
 assert.equal(map.persistenceStatus().healthy,true);assert.equal(d.createDurableDeferredCommitMap({storage:st}).get('owner').length,25);
});
