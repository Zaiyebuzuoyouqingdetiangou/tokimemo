import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/r847Host.mjs';
import * as groups from '../src/archive/groups.js';
import * as constants from '../src/core/constants.js';
import * as cache from '../src/core/cache.js';
import * as contextApi from '../src/core/context.js';
import * as incremental from '../src/core/incremental.js';
import * as client from '../src/generation/client.js';
import * as heart from '../src/modes/heart.js';
import * as view from '../src/ui/heartView.js';
import * as overlay from '../src/ui/overlay.js';
import * as language from '../src/core/heartLanguage.js';
import {state} from '../src/core/state.js';

const completeCore = (text='今天想在这里和你说说话。')=>({title:'基础语言',relationshipState:'保持当前关系',relationshipSummary:'按人设的当下互动。',relationshipSourceMemoryIds:[],relationshipSourceMemoryAnchor:'',birthdayMmDd:'',userBirthdayMmDd:'',specialDays:[],greetings:Object.fromEntries(constants.HEART_GREETING_KEYS.map(key=>[key,[text,text+'早安。']]))});
const script=()=>Array.from({length:6},(_,i)=>({speaker:i%2?'user':'char',text:'今天的风很轻，想安静地看看院子里的花，把手边的书慢慢读完。'.repeat(3)}));
function seasonResponse(messages){const p=messages[0].content;return p.includes('scenarioDramas') && !p.includes('voiceDramas') ? {scenarioDramas:[{id:'SC1',season:'spring',title:'春日小事',setting:'院子',script:script()}]} : {voiceDramas:[{id:'V1',kind:'spring',title:'春日的声音',setting:'院子',script:script()}]};}
async function seed(f,mode,session){
 const obj={...session,kind:mode,chatId:f.liveBank.chatId,archiveRevision:f.liveBank.archiveRevision};
 f.liveCache[mode]=structuredClone(obj);f.ctx.chatMetadata[constants.CACHE_KEY]=structuredClone(f.liveCache);
 const record=f.records.get(f.aEntry.entryId);record.cache=structuredClone(f.liveCache);f.records.set(f.aEntry.entryId,record);state.runtimeSessionCache.clear();
 return obj;
}
const oldRoom=()=>({kind:'room',roomVersion:constants.ROOM_SESSION_VERSION,homeName:'居所',homeSummary:'原房间不变',spaces:[{id:'S1',label:'书房',spaceType:'书房',atmosphere:'安静',objects:[{id:'BOX',label:'书桌抽屉',basis:'推演',description:'一格普通抽屉',line:'里面放着文具。',searchable:true}]},{id:'S2',label:'客厅',spaceType:'客厅',atmosphere:'明亮',objects:[]}],pets:[],presenceLines:['旧语音'],selectedSpaceId:'S1',selectedObjectId:'BOX'});

test('actual archive entry opens HEART without language, provider or blank shell storage write',async t=>{
 const f=await fixture(t),before=JSON.stringify(f.records.get(f.aEntry.entryId));f.open('heart');
 assert.equal(state.activeSession.kind,'heart');assert.equal(state.activeSession.generationParts.dialogues,false);assert.equal(f.requests.length,0);
 assert.doesNotMatch(f.body.innerHTML,/data-rmt-action="heart-generate-language"/);assert.match(f.body.innerHTML,/萤火虫栖息地/);
 overlay.openCachedOrGenerate('heart',{workspaceRoute:'language'});assert.match(f.body.innerHTML,/生成当前类别/);assert.equal(f.requests.length,0);assert.equal(JSON.stringify(f.records.get(f.aEntry.entryId)),before);
});
test('actual HEART language generation commits to backup and reopens without relationship anchor',async t=>{
 const f=await fixture(t);f.open('heart');f.setResponse(completeCore());await heart.generateHeartSection('dialogues');
 assert.equal(f.requests.length,1);const stored=await f.persisted();assert.ok(stored.heart,JSON.stringify(f.notices));
 assert.equal(stored.heart.relationshipSourceMemoryAnchor,'');assert.equal(stored.heart.generationParts.dialogues,true);
 state.runtimeSessionCache.clear();await f.open('heart');assert.equal(state.activeSession.generationParts.dialogues,true);assert.equal(f.requests.length,1);
});
test('empty language fails only that task and preserves readable season + continuation path',async t=>{
 const f=await fixture(t),s=language.makeHeartShell(f.liveBank);s.voiceDramas=[{id:'V1',kind:'spring',title:'原春篇',script:script()}];
 await seed(f,'heart',s);f.open('heart');const bad=completeCore();bad.greetings={};f.setResponse(bad);
 await heart.generateHeartSection('dialogues');assert.equal(f.requests.length,1);
 let saved=await f.persisted();assert.equal(saved.heart.voiceDramas[0].title,'原春篇');assert.equal(saved.heart.generationParts.dialogues,false);
 state.runtimeSessionCache.clear();await f.open('heart');assert.equal(state.activeSession.voiceDramas.length,1);
 f.setResponse(completeCore());await client.continueSavedGeneration('heart');assert.equal(f.requests.length,2);
 saved=await f.persisted();assert.equal(saved.heart.generationParts.dialogues,true);assert.equal(saved.heart.voiceDramas[0].title,'原春篇');
});
test('actual new spring can save and reopen even before base language; language later preserves its scripts',async t=>{
 const f=await fixture(t);f.open('heart');f.setResponse(messages=>({voiceDramas:[{id:'V1',kind:'spring',title:'春日的声音',setting:'院子',script:script()}],scenarioDramas:[{id:'S1',season:'spring',title:'春日小事',setting:'院子',script:script()}]}));
 await heart.generateHeartSeasonSection('spring');
 let saved=await f.persisted();assert.ok(saved.heart?.voiceDramas?.length,JSON.stringify(f.notices));assert.ok(saved.heart?.scenarioDramas?.length,JSON.stringify(f.notices));
 const siblings=JSON.stringify([saved.heart.voiceDramas,saved.heart.scenarioDramas]);state.runtimeSessionCache.clear();await f.open('heart');
 assert.equal(state.activeSession.generationParts.dialogues,false);f.setResponse(completeCore());await heart.generateHeartSection('dialogues');
 saved=await f.persisted();assert.equal(JSON.stringify([saved.heart.voiceDramas,saved.heart.scenarioDramas]),siblings);
});
test('regenerate language cancelled at either confirmation makes zero requests and zero storage changes',async t=>{
 const f=await fixture(t);await seed(f,'heart',heart.normalizeHeart(heart.makeHeartSession(completeCore()),f.liveBank));f.open('heart');
 const before=JSON.stringify(f.records.get(f.aEntry.entryId));let calls=0;globalThis.confirm=()=>{calls++;return false;};
 await heart.generateHeartSection('dialogues',{replaceDialogues:true});assert.equal(calls,1);assert.equal(f.requests.length,0);assert.equal(JSON.stringify(f.records.get(f.aEntry.entryId)),before);
 calls=0;globalThis.confirm=()=>++calls===1;await heart.generateHeartSection('dialogues',{replaceDialogues:true});assert.equal(calls,2);assert.equal(f.requests.length,0);assert.equal(JSON.stringify(f.records.get(f.aEntry.entryId)),before);
});
test('regenerate confirmed language changes only its core; concurrent duplicate does not send twice',async t=>{
 const f=await fixture(t);const s=heart.normalizeHeart(heart.makeHeartSession(completeCore('旧话。')),f.liveBank);s.voiceDramas=[{id:'V1',kind:'spring',title:'原春篇',script:script()}];s.fireflyVoices=[];
 await seed(f,'heart',s);f.open('heart');let confirms=0;globalThis.confirm=()=>{confirms++;return true;};f.setResponse(completeCore('新话。'));const pause=f.pauseProvider();
 const pending=heart.generateHeartSection('dialogues',{replaceDialogues:true});await pause.ready;
 await heart.generateHeartSection('dialogues',{replaceDialogues:true});assert.equal(f.requests.length,1);pause.release();await pending;
 const saved=await f.persisted();assert.equal(saved.heart.greetings.morning[0],'新话。');assert.equal(saved.heart.voiceDramas[0].title,'原春篇');assert.equal(confirms,2);
});
test('actual room manual expansion runs with no new Mxxx; background historical sync remains a no-op',async t=>{
 const f=await fixture(t),r=incremental.stampIncrementalCoverage(oldRoom(),null,f.liveBank,'mode',['M001'],1);await seed(f,'room',r);
 const before=JSON.stringify(f.liveBank);f.setResponse({additions:[{spaceId:'S1',objects:[{id:'NEW',label:'书签',basis:'推演',description:'普通书签。',line:'今天先夹在这一页。'}]}]});
 await client.generateMode('room',{background:true,automatic:true});assert.equal(f.requests.length,0);
 const generated=await client.generateMode('room',{background:true});assert.ok(generated,JSON.stringify(f.notices));assert.equal(f.requests.length,1);
 const stored=await f.persisted();assert.equal(stored.room.spaces[0].objects.length,2);assert.equal(stored.room.spaces[0].objects[0].label,'书桌抽屉');assert.equal(JSON.stringify(f.liveBank),before);
});
test('actual items manual expansion reaches patch validator and saves one item without minimum-four quota',async t=>{
 const f=await fixture(t);await seed(f,'room',oldRoom());
 const s=incremental.stampIncrementalCoverage({kind:'items',containers:[{id:'B1',label:'书桌抽屉',spaceLabel:'书房',description:'旧抽屉',nodes:[{id:'OLD',label:'旧物',kind:'item',basis:'推演',summary:'旧描述',line:'旧台词',children:[]}]}],selectedContainerId:'B1',viewPath:[],selectedNodeId:'OLD'},null,f.liveBank,'mode',['M001'],1);
 await seed(f,'items',s);f.setResponse({containers:[{id:'B1',nodes:[{id:'NEW',label:'书签',basis:'推演',summary:'一枚普通书签。',line:'今天先夹在这里。',children:[]}]}]});
 await client.generateMode('items',{background:true,automatic:true});assert.equal(f.requests.length,0);
 const generated=await client.generateMode('items',{background:true});assert.ok(generated,JSON.stringify(f.notices));assert.equal(f.requests.length,1);
 const stored=await f.persisted();assert.equal(stored.items.containers[0].nodes.length,2);assert.equal(stored.items.containers[0].nodes[0].summary,'旧描述');
});
test('actual inbox uses current captured setting and does not put it into archive evidence',async t=>{
 const f=await fixture(t);f.ctx.characters[0].data.description+='林舟与小月是夫妻。';
 f.setResponse({letters:[{slot:'daily',title:'晚安',greeting:'亲爱的妻子',body:'今天想安静地坐一会儿，手边有一杯热茶，窗外的风也很轻。',closing:'林舟'}]});
 const s=await client.generateMode('inbox',{background:true});assert.ok(s,JSON.stringify(f.notices));assert.equal(s.letters[0].greeting,'亲爱的妻子');assert.deepEqual(s.letters[0].sourceMemoryIds,[]);
});
test('actual pastLives carries setting through the final assembly and canonical storage',async t=>{
 const f=await fixture(t);f.ctx.characters[0].data.description+='林舟与小月是夫妻。';
 f.setResponse(messages=>messages[0].content.includes('UNTRUSTED_COMPLETED_STORY_JSON') ? {echoes:[],annotations:[],closing:{text:'亲爱的妻子，晚安。',signature:'林舟'}} : {title:'旧梦',opening:{title:'旧纸',text:'虚构卷里有一张纸。',motif:'纸张',sourceMemoryIds:['M001'],sourceMemoryAnchor:'庭院'},dossiers:[]});
 const s=await client.generateMode('pastLives',{background:true});assert.ok(s,JSON.stringify(f.notices));assert.equal(s.episodes[0].closing.text,'亲爱的妻子，晚安。');
 state.runtimeSessionCache.clear();await cache.ensureCacheHydrated(f.ctx);f.open('pastLives');assert.equal(state.activeSession.episodes[0].closing.text,'亲爱的妻子，晚安。');
});

test('first-ever failed language has a safe continuation from an empty HEART, without rewriting archive',async t=>{
 const f=await fixture(t);f.open('heart');const before=JSON.stringify(f.liveBank),bad=completeCore();bad.greetings={};f.setResponse(bad);
 await heart.generateHeartSection('dialogues');assert.equal(f.requests.length,1);assert.ok(!(await f.persisted()).heart);
 state.activeMode=null;state.activeSession=null;state.runtimeSessionCache.clear();await f.open('heart');assert.equal(state.activeSession.generationParts.dialogues,false);
 f.setResponse(completeCore());await client.continueSavedGeneration('heart');assert.equal(f.requests.length,2);assert.ok((await f.persisted()).heart?.generationParts.dialogues,JSON.stringify(f.notices));assert.equal(JSON.stringify(f.liveBank),before);
});
test('generic language completion preserves a previously saved partial greeting',async t=>{
 const f=await fixture(t);const partial=language.makeHeartShell(f.liveBank);partial.relationshipSummary='旧关系说明';partial.greetings.morning=['不得覆盖这句旧问候。'];await seed(f,'heart',partial);f.setResponse(completeCore('这次新问候。'));
 await client.generateMode('heart',{background:true});const saved=await f.persisted();assert.ok(saved.heart?.greetings?.morning.includes('不得覆盖这句旧问候。'),JSON.stringify(f.notices));assert.ok(saved.heart?.generationParts.dialogues);
});
test('actual manual travel revisit with no new Mxxx keeps old words and saves the new version',async t=>{
 const f=await fixture(t);const old={id:'N1',kind:'near',name:'河岸',region:'生活半径',basis:'推演',summary:'正在看河水。',dialogueLines:['旧台词在这里。'],sourceMemoryIds:[],sourceMemoryAnchor:''};
 const s=incremental.stampIncrementalCoverage({kind:'travel',travelVersion:constants.TRAVEL_SESSION_VERSION,title:'路线',locations:[old],mapTheme:'neutral',selectedId:'N1'},null,f.liveBank,'mode',['M001'],1);await seed(f,'travel',s);
 f.setResponse({title:'路线',mapTheme:'neutral',locations:[{...old,dialogueLines:['今天想在河岸慢慢走。']}]});
 await client.generateMode('travel',{background:true,automatic:true});assert.equal((await f.persisted()).travel.locations.length,1);const automaticRequests=f.requests.length;
 const generated=await client.generateMode('travel',{background:true});assert.ok(generated,JSON.stringify(f.notices));assert.equal(f.requests.length,automaticRequests+1);const saved=await f.persisted();assert.equal(saved.travel.locations.length,2);assert.equal(saved.travel.locations[0].dialogueLines[0],'旧台词在这里。');
 state.runtimeSessionCache.clear();await cache.ensureCacheHydrated(f.ctx);f.open('travel');assert.equal(state.activeSession.locations.length,2);
});
test('actual phone directory, partial contact app, final cache and missing-only continuation agree',async t=>{
 const f=await fixture(t);delete f.liveCache.phone;delete f.ctx.chatMetadata[constants.CACHE_KEY].phone;delete f.records.get(f.aEntry.entryId).cache.phone;f.ctx.characters[0].data.description+='阿宁是林舟的同事。阿远是林舟的同事。';Object.assign(f.aEntry,groups.currentCharacterArchiveProbe(f.ctx,f.liveBank));
 const entry=(id,name)=>({id,title:name,contactName:name,preview:'今天的联系备注',detail:'今天想整理一下工作笔记。',fields:[{label:'关系',value:'同事'}],basis:'设定',sourceSettingEvidence:`${name}是林舟的同事。`,sourceMemoryIds:[],sourceMemoryAnchor:''});
 const good=entry('C1','阿宁'),bad={...entry('C2','阿远'),fields:[{label:'电话号码',value:'000-TEST-000'}]};
 f.setResponse(messages=>messages[0].content.includes('UNTRUSTED_APP_PLAN_JSON')?{app:{id:'A1',entries:[good,bad]}}:{deviceKind:'phone',apps:[{id:'A1',kind:'contacts',label:'通讯录',entries:[{id:'C1',title:'阿宁'},{id:'C2',title:'阿远'}]}]});
 const generated=await client.generateMode('phone',{background:true});assert.ok(generated,JSON.stringify(f.notices));assert.equal(f.requests.length,2);
 let saved=await f.persisted();assert.equal(saved.phone.apps[0].entries[0].contactName,'阿宁');assert.equal(saved.phone.apps[0].entries[1].sourceStatus,'unavailable');const kept=JSON.stringify(saved.phone.apps[0].entries[0]);
 state.runtimeSessionCache.clear();await cache.ensureCacheHydrated(f.ctx);f.open('phone');assert.equal(state.activeSession.apps[0].entries.length,2);
 f.setResponse({app:{id:'A1',entries:[entry('C2','阿远')]}});await client.generateMode('phone',{background:true,fillMissing:true});
 saved=await f.persisted();assert.equal(f.requests.length,3);assert.equal(JSON.stringify(saved.phone.apps[0].entries[0]),kept);assert.notEqual(saved.phone.apps[0].entries[1].sourceStatus,'unavailable',JSON.stringify(f.notices));
});
test('actual calendar persona mood commits to its day and target regeneration keeps that same day',async t=>{
 const f=await fixture(t);f.setResponse({past:[],promised:[],future:[],stickyNotes:[],moodNotes:[{id:'N1',textMode:'persona-expression',text:'今天想把窗边的一点光留在手账里。',date:'1900/01/01',sourceMemoryIds:[],sourceMemoryAnchor:''}]});
 const generated=await client.generateMode('calendar',{background:true});assert.ok(generated,JSON.stringify(f.notices));let saved=await f.persisted();const day=Object.keys(saved.calendar.dayPages).find(k=>saved.calendar.dayPages[k].moodNotes.length);assert.ok(day && day!=='legacy:unassigned');const original=saved.calendar.dayPages[day].moodNotes[0];
 const regen=await import('../src/generation/contentRegeneration.js');f.setResponse({mood:{text:'现在的风很安静，我也想歇一会儿。'}});
 const context=contextApi.currentCharacterGuard(),origin=contextApi.captureTaskOrigin(context,f.liveBank.archiveRevision);
 const updated=await regen.regenerateManagedTarget(saved.calendar,'calendar-mood',original.id,day,{context,memoryBank:f.liveBank,origin,taskKey:'fixture:calendar-mood'});
 assert.equal(updated.dayPages[day].moodNotes[0].date,original.date);assert.equal(updated.dayPages[day].moodNotes[0].text,'现在的风很安静，我也想歇一会儿。');assert.equal(saved.calendar.dayPages[day].moodNotes[0].text,original.text);
});
test('historical empty HEART opens locally and backup-only snapshots cannot generate language',async t=>{
 const f=await fixture(t);await f.historical('heart');assert.equal(state.activeSession.kind,'heart');assert.equal(f.requests.length,0);state.activeArchiveReadOnly=true;state.activeArchiveSnapshot.backupOnly=true;
 const before=JSON.stringify(f.records.get(f.bEntry.entryId));f.setResponse(completeCore());await heart.generateHeartSection('dialogues');assert.equal(f.requests.length,0);assert.equal(JSON.stringify(f.records.get(f.bEntry.entryId)),before);
});
test('language response cannot overwrite a newer archive revision; tasks are released',async t=>{
 const f=await fixture(t);await seed(f,'heart',heart.normalizeHeart(heart.makeHeartSession(completeCore('旧话。')),f.liveBank));f.open('heart');f.setResponse(completeCore('迟到新话。'));
 const paused=f.pauseProvider(),running=heart.generateHeartSection('dialogues',{replaceDialogues:true});await paused.ready;
 f.ctx.chatMetadata[constants.MEMORY_KEY]={...f.liveBank,archiveRevision:'newer-revision'};paused.release();await running;
 const saved=await f.persisted();assert.equal(saved.heart.greetings.morning[0],'旧话。');assert.equal(state.activeModeBuildScopes.size,0);assert.equal(state.activeGenerationTasks.size,0);
});
test('switching chat during language request never writes its result into the other worldline',async t=>{
 const f=await fixture(t);f.open('heart');f.setResponse(completeCore('只属于原聊天的新话。'));const paused=f.pauseProvider();const running=heart.generateHeartSection('dialogues');await paused.ready;
 f.ctx.characterId=1;f.ctx.name1=f.otherBank.userName;f.ctx.name2=f.otherBank.characterName;f.ctx.chatId=f.otherBank.chatId;
 f.ctx.chatMetadata={[constants.MEMORY_KEY]:structuredClone(f.otherBank),[constants.CACHE_KEY]:structuredClone(f.otherCache)};state.activeSession=null;state.activeMode=null;
 const before=JSON.stringify(f.ctx.chatMetadata),backupBefore=JSON.stringify(f.records.get(f.bEntry.entryId));paused.release();await running;
 assert.equal(JSON.stringify(f.ctx.chatMetadata),before);assert.equal(JSON.stringify(f.records.get(f.bEntry.entryId)),backupBefore);assert.equal(state.activeMode,null);assert.equal(state.activeGenerationTasks.size,0);assert.equal(state.activeModeBuildScopes.size,0);
});
