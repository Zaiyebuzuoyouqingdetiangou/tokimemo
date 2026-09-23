import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as people from '../src/core/routeParticipants.js';
import * as composer from '../src/core/generationOptions.js';
import * as constants from '../src/core/constants.js';
import * as workspace from '../src/ui/workspaceState.js';
import * as bookmark from '../src/ui/navigationBookmark.js';
const roster={version:1,cardType:'multi',revision:'r1',selectedIds:['a'],people:[{id:'user',name:'我',identity:'user',sourceRefs:[]},{id:'a',name:'甲',sourceRefs:[]},{id:'b',name:'乙',sourceRefs:[]}]};
const bank={chatId:'c1',archiveRevision:'rev1',characterName:'群像',userName:'我',participantsV1:roster,memories:[]};
const context={characterId:0,name1:'我',name2:'群像',chatMetadata:{}};
const disk=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};};
async function load(file,overrides){const url=new URL(file,import.meta.url);const m=new vm.SourceTextModule(await readFile(url,'utf8'),{identifier:url.href});await m.link(async spec=>{const real=await import(new URL(spec,url));const values={...real,...overrides[spec]};return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);});});await m.evaluate();return m.namespace;}
async function extract(file,start,end,name,deps){const source=await readFile(new URL(file,import.meta.url),'utf8');const begin=source.indexOf(start),finish=source.indexOf(end,begin);assert.ok(begin>=0&&finish>begin);return new Function(...Object.keys(deps),source.slice(begin,finish).replace(/^export /,'')+';return '+name+';')(...Object.values(deps));}
function select(route,strategy,ids,storage){people.writeRoutePeople(route,{strategy,selectedIds:ids},context,bank,storage);}

test('per-page participant choices isolate route, chat, and archive revision',()=>{
 const storage=disk();select('inbox','specified',['a'],storage);select('themeSong','specified',['b'],storage);
 assert.deepEqual(people.captureRoutePeople('inbox',context,bank,{storage}).people.map(p=>p.id),['a']);
 assert.deepEqual(people.captureRoutePeople('themeSong',context,bank,{storage}).people.map(p=>p.id),['b']);
 for(const other of [{...bank,chatId:'c2'},{...bank,archiveRevision:'rev2'}])assert.equal(people.readRoutePeople('themeSong',context,other,storage).strategy,'default');
 assert.deepEqual(bank.participantsV1.selectedIds,['a']);
});

test('random page choice is drawn once at enqueue and reused by actual queued execution',async()=>{
 const storage=disk();select('inbox','random',[],storage);let draws=0;const queue=[];const requests=[];
 const enqueue=await extract('../src/ui/taskCenter.js','export function enqueueSelectedModes(','\nfunction cancelQueuedItem','enqueueSelectedModes',{
  currentScope:()=> 'scope',queue,picks:new Set(),ui_workspaceState:workspace,core_constants:constants,composerOptions:composer,
  routePeople:{captureRoutePeople:route=>people.captureRoutePeople(route,context,bank,{storage,random:()=>{draws++;return .99;}})},trimQueue:()=>{},refreshTaskCenterView:()=>{},pumpQueue:()=>{},
 });
 assert.equal(enqueue(['inbox']),1);assert.equal(draws,1);assert.deepEqual(queue[0].participantSnapshot.people.map(p=>p.id),['b']);
 select('inbox','specified',['a'],storage);
 const runner=await load('../src/ui/taskCenter.js',{'../generation/client.js':{generateMode:async(mode,options)=>{requests.push({mode,options});return {};}}});
 await runner.runQueuedGeneration(queue[0]);await runner.runQueuedGeneration(queue[0]);
 assert.equal(draws,1);for(const request of requests){assert.equal(request.mode,'inbox');assert.deepEqual(request.options.participantSnapshot.people.map(p=>p.id),['b']);assert.equal(request.options.background,true);}
});

test('startTogether solo song freezes people and composer options before confirmation and queue never rereads them',async()=>{
 const storage=disk(),savedStorage=globalThis.localStorage;globalThis.localStorage=storage;
 try{
 select('themeSong','random',[],storage);composer.writeSongOptions({subject:'character',language:'zh',voice:'char',direction:'原方向'},context,bank,storage);let draws=0;
 const mod=await load('../src/generation/mergedGeneration.js',{
  '../core/context.js':{currentCharacterGuard:()=>context,getContext:()=>context,captureTaskOrigin:()=>({characterKey:'char0',chatId:'c1',archiveRevision:'rev1'}),getChatId:()=> 'c1'},
  '../archive/repository.js':{requireArchive:()=>bank,getImportedMemory:()=>bank},
  '../core/cache.js':{loadGenerationRecovery:()=>null,loadSession:()=>null,buildControlledContextEnvelope:async()=>'',archiveBackupEntryForContext:()=>({entryId:'entry1'}),getCache:()=>({}),modeWriteFenceForCache:()=>''},
  '../core/settings.js':{getPluginSettings:()=>({maxTokens:60000,inputBudgetTokens:60000})},
  '../core/routeParticipants.js':{captureRoutePeople:route=>people.captureRoutePeople(route,context,bank,{storage,random:()=>{draws++;return .99;}})},
  './client.js':{generationWorldInfoScanTerms:()=>[],composeOutgoingGenerationPrompt:p=>p},
 });
 const result=await mod.startTogether(['themeSong'],{confirm:()=>{composer.writeSongOptions({subject:'character',language:'ja',voice:'user',direction:'确认时改变'},context,bank,storage);select('themeSong','specified',['a'],storage);return true;}});
 assert.deepEqual(result.soloRoutes,['themeSong']);assert.equal(result.providerRequests,0);assert.equal(draws,1);
 assert.equal(result.frozenOptions.themeSong.songOptions.direction,'原方向');assert.deepEqual(result.frozenOptions.themeSong.participantSnapshot.people.map(p=>p.id),['b']);
 const queue=[];const enqueue=await extract('../src/ui/taskCenter.js','export function enqueueSelectedModes(','\nfunction cancelQueuedItem','enqueueSelectedModes',{
  currentScope:()=> 'scope',queue,picks:new Set(),ui_workspaceState:workspace,core_constants:constants,
  composerOptions:{readSongOptions:()=>{throw Error('must not reread form');}},routePeople:{captureRoutePeople:()=>{throw Error('must not reroll');}},trimQueue:()=>{},refreshTaskCenterView:()=>{},pumpQueue:()=>{},
 });
 enqueue(result.soloRoutes,result.frozenOptions);assert.equal(queue[0].songOptions.direction,'原方向');assert.deepEqual(queue[0].participantSnapshot.people.map(p=>p.id),['b']);
 }finally{globalThis.localStorage=savedStorage;}
});

test('background merged completion refreshes only original visible page, never newer navigation',async()=>{
 const overlay={isConnected:true,hidden:false};const oldDoc=globalThis.document;globalThis.document={getElementById:()=>overlay};
 try{let renders=0;const session={kind:'album'},runtimeState={activeMode:'album',activeSession:session};const w={epoch:4,tab:'content',route:'album'};
 const refresh=await extract('../src/ui/taskCenter.js','function refreshMergedCompletion(','\nfunction exportMergedResult','refreshMergedCompletion',{
  refreshTaskCenterView:()=>{},currentScope:()=> 'same',ui_workspaceState:{workspace:w},runtimeState,core_constants:constants,ui_overlay:{refreshSavedActiveSession:()=>{renders++;},showChooser:()=>{renders++;}},
 });
 const mark={scope:'same',epoch:4,route:'album',mode:'album',session,overlay};refresh(mark);assert.equal(renders,1);
 for(const change of [()=>{w.epoch++;},()=>{w.route='inbox';},()=>{runtimeState.activeSession={kind:'album'};},()=>{overlay.hidden=true;},()=>{runtimeState.activeArchiveSnapshot={};}]){
  w.epoch=4;w.route='album';runtimeState.activeSession=session;runtimeState.activeArchiveSnapshot=null;overlay.hidden=false;change();refresh(mark);assert.equal(renders,1);
 }
 }finally{globalThis.document=oldDoc;}
});

test('saved reader refresh preserves reading position, unsent controls and scroll; active edits and drafts are untouched',async()=>{
 const oldDoc=globalThis.document;globalThis.document={activeElement:null};
 try{
 let controls=[{id:'song-direction',type:'text',value:'尚未发送的方向'}],renders=0,loads=0;
 const body={scrollTop:492,querySelector:()=>null,querySelectorAll:()=>controls,contains:el=>!!el};
 const runtimeState={activeMode:'album',activeSession:{kind:'album',selectedId:'a2',page:2,entries:['old']}};
 const refresh=await extract('../src/ui/overlay.js','export function refreshSavedActiveSession(','\nexport function renderActive','refreshSavedActiveSession',{
  runtimeState,bodyEl:()=>body,document:globalThis.document,core_context:{currentCharacterGuard:()=>context},archive_repository:{getImportedMemory:()=>bank},
  core_cache:{loadSession:()=>{loads++;return {kind:'album',selectedId:'a1',page:1,entries:['old','new']};}},navigation_bookmark:bookmark,
  renderActive:()=>{renders++;body.scrollTop=0;controls=[{id:'song-direction',type:'text',value:'default'}];},
 });
 assert.equal(refresh(),true);assert.equal(runtimeState.activeSession.selectedId,'a2');assert.equal(runtimeState.activeSession.page,2);assert.deepEqual(runtimeState.activeSession.entries,['old','new']);assert.equal(body.scrollTop,492);assert.equal(controls[0].value,'尚未发送的方向');
 globalThis.document.activeElement={matches:()=>true};assert.equal(refresh(),false);globalThis.document.activeElement=null;
 for(const field of ['activeArchiveSnapshot','contentManagerOpen']){runtimeState[field]=true;assert.equal(refresh(),false);runtimeState[field]=null;}
 runtimeState.activeSession.readableProgress={};assert.equal(refresh(),false);assert.equal(loads,1);assert.equal(renders,1);
 }finally{globalThis.document=oldDoc;}
});


test('blocked local storage retains the selected people for this session',()=>{
 const storage={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
 select('storage-check','specified',['b'],storage);
 assert.deepEqual(people.captureRoutePeople('storage-check',context,bank,{storage}).people.map(p=>p.id),['b']);
});

test('invalid later route does not leave a half-enqueued batch',async()=>{
 const queue=[], picks=new Set(['inbox','themeSong']); let pumps=0;
 const enqueue=await extract('../src/ui/taskCenter.js','export function enqueueSelectedModes(','\nfunction cancelQueuedItem','enqueueSelectedModes',{
  currentScope:()=> 'scope',queue,picks,ui_workspaceState:workspace,core_constants:constants,composerOptions:{readSongOptions:()=>({})},
  routePeople:{captureRoutePeople:route=>{if(route==='themeSong')throw new Error('choose people');return null;}},
  trimQueue:()=>{},refreshTaskCenterView:()=>{},pumpQueue:()=>{pumps++;},
 });
 assert.throws(()=>enqueue(['inbox','themeSong']),/choose people/);
 assert.equal(queue.length,0);assert.equal(pumps,0);assert.equal(picks.size,2);
});
