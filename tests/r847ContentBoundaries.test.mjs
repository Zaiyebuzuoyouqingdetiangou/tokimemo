import test from 'node:test';
import assert from 'node:assert/strict';
import * as calendar from '../src/modes/calendar.js';
import * as relation from '../src/core/relationshipSafety.js';
import * as phone from '../src/modes/phone.js';
import * as items from '../src/modes/items.js';
import * as room from '../src/modes/room.js';
import * as travel from '../src/modes/travel.js';
import * as cache from '../src/core/cache.js';
import * as heart from '../src/modes/heart.js';
import * as language from '../src/core/heartLanguage.js';
import * as constants from '../src/core/constants.js';
import * as past from '../src/modes/pastLives.js';
const memory = {version:3, chatId:'fixture-chat', archiveRevision:'fixture-rev', characterName:'林舟', userName:'小雨', archiveSummary:'', memories:[{id:'M001',date:'2026/09/16',title:'一起去看展',summary:'两人一起去看展。', anchors:['一起去看展']}]};
const noMem={...memory,memories:[]};
const note={id:'MOOD1',textMode:'persona-expression',text:'现在想把桌边这一点光留下来。',date:'1900/01/01',sourceMemoryIds:[],sourceMemoryAnchor:''};
const event={id:'EV1',title:'一起去看展',sourceMemoryIds:['M001'],sourceMemoryAnchor:'一起去看展'};
function moods(data,bank=memory){return calendar.normalizeCalendar({past:[],promised:[],future:[],stickyNotes:[],...data},bank,{currentDate:'2026/09/16'});}
const allNotes=s=>Object.values(s.dayPages).flatMap(p=>p.moodNotes);
test('persona mood uses validated entry date, not provider date; reload and day isolation preserve prose',()=>{
 const s=moods({past:[event],moodNotes:[{...note,calendarEntryId:'EV1'}]});
 assert.equal(allNotes(s).length,1);const n=allNotes(s)[0]; assert.equal(n.text,note.text);assert.equal(n.date,'2026/09/16');
 assert.ok(!n.legacyUnassigned); assert.ok(!s.dayPages['legacy:unassigned']);
 Object.assign(s,{chatId:memory.chatId,archiveRevision:memory.archiveRevision});
 const record={chatId:memory.chatId,archiveRevision:memory.archiveRevision,calendar:s};const old=JSON.stringify(record);
 const loaded=cache.loadSession('calendar',{cache:record,chatId:memory.chatId,memoryBank:memory});
 assert.ok(loaded);assert.equal(allNotes(loaded)[0].text,note.text);assert.equal(JSON.stringify(record),old);
});
test('no known story date keeps persona mood pending; invalid entry cannot choose arbitrary date',()=>{
 for(const calendarEntryId of ['', 'UNKNOWN']){
  const s=moods({moodNotes:[{...note,calendarEntryId}]},noMem);assert.equal(allNotes(s).length,1);assert.equal(allNotes(s)[0].date,'待定');
 }
});
for(const change of [
 {text:'昨天我们一起去海边看了日出。'},
 {textMode:'evidence-excerpt',text:'此刻想休息一下',sourceMemoryIds:['M999'],sourceMemoryAnchor:'不存在'},
 {textMode:'not-a-real-mode'},
]) test('mood refuses forged history/mode without converting it to persona '+JSON.stringify(change),()=>{
 assert.equal(allNotes(moods({moodNotes:[{...note,...change}]})).length,0);
});
test('historical excerpt still needs matching ID and exact anchor',()=>{
 const s=moods({past:[event],moodNotes:[{...note,textMode:'evidence-excerpt',text:'一起去看展',sourceMemoryIds:['M001'],sourceMemoryAnchor:'一起去看展'}]});
 assert.equal(allNotes(s)[0].evidenceMode,'memory-anchor-excerpt');
});
const spouse='亲爱的妻子，晚安。';
const settingsGood=['林舟与小雨是夫妻，已婚。','小雨是林舟的妻子。','{{char}}与{{user}}是夫妻。','{{user}} is the wife of {{char}}.','林舟 is married to 小雨.'];
for(const controlledEvidence of settingsGood) test('direct pair setting permits address: '+controlledEvidence,()=>{
 assert.equal(relation.presentRelationshipAllows(spouse,noMem,{controlledEvidence}),true);
});
const settingsBad=['林舟和小雨聊起同事阿远已婚的事。','假如林舟与小雨是夫妻，这只是梦里设想。','小说里：林舟与小雨是夫妻。','林舟与小雨不是夫妻。','林舟的妹妹和小雨是夫妻。','有人说林舟与小雨是夫妻。','林舟与小雨可能结婚。','{{user}} is not the wife of {{char}}.'];
for(const controlledEvidence of settingsBad) test('unrelated/uncertain setting grants no intimacy: '+controlledEvidence,()=>{
 assert.equal(relation.presentRelationshipAllows(spouse,noMem,{controlledEvidence}),false);
});
test('current archive divorce overrides initial marriage and later reconciliation is not remarriage',()=>{
 const m={...memory,archiveSummary:'两人已经离婚。',memories:[{id:'M001',title:'双方离婚',summary:'林舟与小雨已经离婚，两人只是普通朋友。',anchors:['两人已经离婚']}]};
 assert.equal(relation.presentRelationshipAllows(spouse,m,{controlledEvidence:settingsGood[0]}),false);
 m.memories.push({id:'M002',title:'林舟与小雨重新交往',summary:'林舟与小雨是恋人。'});
 assert.equal(relation.presentRelationshipAllows(spouse,m,{controlledEvidence:settingsGood[0]}),false);
 assert.equal(relation.presentRelationshipAllows('亲爱的恋人',m,{controlledEvidence:settingsGood[0]}),true);
 m.memories.push({id:'M003',title:'林舟与小雨结婚',summary:'林舟与小雨是夫妻。'});
 assert.equal(relation.presentRelationshipAllows(spouse,m,{controlledEvidence:settingsGood[0]}),true);
});
test('pastLives keeps controlled evidence through finale, episode and full normalization',()=>{
 const opts={controlledEvidence:settingsGood[0]}, raw={echoes:[],annotations:[],closing:{text:spouse,signature:'林舟'}};
 const finale=past.normalizePastLivesFinale(raw,memory,[],opts);
 const ep=past.normalizePastLivesEpisode({title:'旧梦',opening:{title:'旧纸',text:'虚构卷中有一张纸。',motif:'纸张',sourceMemoryIds:['M001'],sourceMemoryAnchor:'一起去看展'},dossiers:[],...finale},memory,opts);
 const session={...past.emptyPastLives(memory),episodes:[ep]};
 assert.equal(past.normalizePastLives(session,memory,opts).episodes[0].closing.text,spouse);
 assert.throws(()=>past.normalizePastLivesEpisode({ ...ep,closing:{text:'昨天我们一起去海边。',signature:'林舟'}},memory,opts));
});
const contact={id:'C1',title:'阿宁',contactName:'阿宁',preview:'阿宁的工作笔记',detail:'今天准备讨论一下排班。',basis:'设定',sourceMemoryIds:[],sourceMemoryAnchor:'',sourceSettingEvidence:'阿宁是林舟的同事。',fields:[{label:'关系',value:'同事'}]};
const contactPlan={id:'A1',label:'通讯录',kind:'contacts',entries:[{id:'C1'}]};
const contactOptions={controlledEvidence:'阿宁是林舟的同事。',allowPartial:true,requireLifestyleContent:true};
function normContact(c){return phone.normalizePhoneDraftApp({id:'A1',entries:[c]},contactPlan,noMem,'folio',null,contactOptions);}
test('known setting contact passes both production prevalidator and final normalizer',()=>{
 const app=normContact(contact);assert.equal(app.entries[0].basis,'设定');
 const full=phone.normalizePhone({deviceKind:'folio',apps:[app]},noMem,contactOptions);assert.equal(full.apps[0].entries[0].id,'C1');
});
for(const fields of [[{label:'电话号码',value:'000-TEST-000'}],[{label:'关系',value:'妻子'}],[{label:'职业',value:'演员'}]]) test('setting contact rejects unsupported private/identity fields '+fields[0].label,()=>{
 assert.throws(()=>normContact({...contact,fields}),{code:'RMT_PHONE_EVIDENCE'});
 assert.throws(()=>phone.normalizePhone({deviceKind:'folio',apps:[{...contactPlan,entries:[{...contact,fields}]}]},noMem,contactOptions));
});
test('phone keeps good sibling and marks bad contact pending; exact slot plan and old source are unchanged',()=>{
 const planned={...contactPlan,entries:[{id:'C1'},{id:'C2'}]}, bad={...contact,id:'C2',fields:[{label:'号码',value:'000-TEST-000'}]};
 const raw={...planned,entries:[contact,bad]};const old=JSON.stringify(raw);
 const app=phone.normalizePhoneDraftApp(raw,planned,noMem,'folio',null,contactOptions);
 assert.equal(app.entries[0].sourceStatus,undefined);assert.equal(app.entries[1].sourceStatus,'unavailable');assert.equal(JSON.stringify(raw),old);
 const full=phone.normalizePhone({deviceKind:'folio',apps:[app]},noMem,contactOptions);assert.equal(full.apps[0].entries.length,2);
});
test('room manual inference patch accepts no new memories, auto path rejects; merge leaves original intact',()=>{
 const prev={kind:'room',spaces:[{id:'S1',label:'书房',spaceType:'书房',atmosphere:'安静',objects:[]}],pets:[],presenceLines:['旧台词'],selectedSpaceId:'S1'};
 const raw={additions:[{spaceId:'S1',objects:[{id:'OBJ1',label:'书签',description:'一枚素色书签。',line:'今天先夹在这一页。',basis:'推演'}]}]};const old=JSON.stringify(prev);
 assert.throws(()=>room.normalizeRoomIncrementPatch(raw,prev,memory,[],{}));
 const fresh=room.normalizeRoomIncrementPatch(raw,prev,memory,[],{allowPersonaExpansion:true});
 const merged=room.mergeRoomIncremental(prev,fresh,[],{memoryBank:memory,allowPersonaExpansion:true});assert.equal(merged.added,1);assert.equal(JSON.stringify(prev),old);
 assert.equal(room.mergeRoomIncremental(merged.session,fresh,[],{memoryBank:memory,allowPersonaExpansion:true}).added,0);
 raw.additions[0].objects[0].description='这是昨天小雨送给我的礼物。';assert.throws(()=>room.normalizeRoomIncrementPatch(raw,prev,memory,[],{allowPersonaExpansion:true}));
});
test('items incremental patch has no initial-inventory quota, preserves parents, rejects fake history and duplicates',()=>{
 const prev={kind:'items',containers:[{id:'B1',label:'书桌抽屉',spaceLabel:'书房',description:'旧抽屉',nodes:[{id:'OLD1',label:'旧盒',kind:'container',basis:'推演',summary:'旧描述',line:'旧台词',children:[]}]}],viewPath:['OLD1']};
 const raw={containers:[{id:'B1',nodes:[{id:'OLD1',label:'被篡改的名称',children:[{id:'N1',label:'书签',basis:'推演',summary:'一枚普通书签。',line:'今天先夹在这里。'}]}]}]};const old=JSON.stringify(prev);
 const opts={allowPersonaExpansion:true,memoryBank:memory};
 const patch=items.normalizeItemsIncrementPatch(raw,prev,memory,[],opts);const merged=items.mergeItemsIncremental(prev,patch,[],opts);
 assert.equal(merged.added,1);assert.equal(merged.session.containers[0].nodes[0].label,'旧盒');assert.equal(JSON.stringify(prev),old);
 assert.equal(items.mergeItemsIncremental(merged.session,patch,[],opts).added,0);
 assert.equal(items.mergeItemsIncremental(prev,patch,[]).added,0);
 raw.containers[0].nodes[0].children[0].summary='昨天我们一起买了这枚书签。';assert.throws(()=>items.normalizeItemsIncrementPatch(raw,prev,memory,[],opts));
});
test('travel manual inferred revisits append new words only, cap stays 12 and auto does not infer',()=>{
 const loc={id:'N1',kind:'near',name:'河边书亭',region:'河岸',basis:'推演',sourceMemoryIds:[],sourceMemoryAnchor:'',dialogueLines:['现在想在这里坐一会儿。'],summary:'正在翻书。'};
 const opts={allowPartial:true,sourceMemoryIds:[],allowPersonaExpansion:true};
 const initial=travel.normalizeTravel({locations:[loc]},memory,opts);assert.equal(initial.locations.length,1);
 const fresh=travel.normalizeTravel({locations:[{...loc,dialogueLines:['今天想把这页书读完。']}]},memory,opts);
 const merged=travel.mergeTravelIncremental(initial,fresh);assert.equal(merged.added,1);assert.equal(merged.session.locations[0].dialogueLines[0],loc.dialogueLines[0]);
 assert.equal(travel.mergeTravelIncremental(merged.session,fresh).added,0);
 assert.equal(travel.normalizeTravel({locations:[loc]},memory,{...opts,allowPersonaExpansion:false}).locations.length,0);
 const full={...initial,locations:Array.from({length:12},(_,i)=>({...loc,id:'N'+i,name:'地点'+i}))};assert.equal(travel.mergeTravelIncremental(full,fresh).added,0);
});
test('HEART no-language and complete-empty-anchor libraries reopen without mutating canonical object',()=>{
 for(const greetings of [{},Object.fromEntries(constants.HEART_GREETING_KEYS.map(k=>[k,['早安。','晚安。']]))]){
  const s=heart.normalizeHeart({...language.makeHeartShell(memory),relationshipSummary:'保持当前关系。',greetings},memory);
  Object.assign(s,{chatId:memory.chatId,archiveRevision:memory.archiveRevision});const all={chatId:memory.chatId,archiveRevision:memory.archiveRevision,heart:s};const old=JSON.stringify(all);
  assert.ok(cache.loadSession('heart',{cache:all,chatId:memory.chatId,memoryBank:memory}));assert.equal(JSON.stringify(all),old);
  assert.equal(cache.loadSession('heart',{cache:all,chatId:'other',memoryBank:memory}),null);
  assert.equal(cache.loadSession('heart',{cache:all,chatId:memory.chatId,memoryBank:{...memory,archiveRevision:'other'}}),null);
 }
});
test('HEART short language is now usable under r84.8 actual-count policy',()=>{
 const partial=heart.normalizeHeart({greetings:{morning:['早安']},relationshipSummary:'普通问候。'},memory);
 assert.equal(partial.generationParts.dialogues,true);assert.equal(language.heartLanguageStatus(partial).status,'ready');
 assert.doesNotThrow(()=>heart.normalizeHeartCore(partial,memory));
});
for(const controlledEvidence of ['林舟与小雨是夫妻？','林舟与小雨是夫妻吗？','Are 林舟 and 小雨 married?']) test('question does not authorize spouse: '+controlledEvidence,()=>{
 assert.equal(relation.presentRelationshipAllows(spouse,noMem,{controlledEvidence}),false);
});
test('an unrelated pair cannot override archived relationship downgrade',()=>{
 const bank={...noMem,archiveSummary:'两人已经离婚。',memories:[{id:'M2',title:'阿远与阿宁是夫妻',summary:'两人已婚。',anchors:[],participants:['阿远','阿宁']}]};
 assert.equal(relation.presentRelationshipAllows(spouse,bank,{controlledEvidence:settingsGood[0]}),false);
});
for(const [quote,field] of [['阿宁不是林舟的同事。',{label:'关系',value:'同事'}],['阿宁提到了阿远是一名医生。',{label:'职业',value:'医生'}],['阿宁是林舟的同事。',{label:'备注',value:'fake@example.invalid'}]]) test('contact authority is about this subject only: '+quote+field.value,()=>{
 const c={...contact,sourceSettingEvidence:quote,fields:[field]};
 assert.throws(()=>phone.normalizePhoneDraftApp({id:'A1',entries:[c]},contactPlan,noMem,'folio',null,{...contactOptions,controlledEvidence:quote}),{code:'RMT_PHONE_EVIDENCE'});
});
test('existing item IDs cannot relocate a parent subtree into a different container',()=>{
 const prior={containers:[{id:'B1',label:'桌子',spaceLabel:'书房',nodes:[{id:'PARENT',kind:'container',label:'原盒子',summary:'原样',line:'原话',children:[]}]},{id:'B2',label:'书架',spaceLabel:'书房',nodes:[]}]};
 const payload={containers:[{id:'B2',nodes:[{id:'PARENT',children:[{id:'N1',label:'新书签',summary:'普通书签',line:'今天用。',basis:'推演'}]}]}]};
 assert.throws(()=>items.normalizeItemsIncrementPatch(payload,prior,noMem,[],{allowPersonaExpansion:true}),{code:'RMT_ITEMS_FIELDS'});
});
test('new ordinary contact path cannot add a third-party romantic spouse even with a copied setting sentence',()=>{
 const quote='阿宁是林舟的妻子。',c={...contact,sourceSettingEvidence:quote,fields:[{label:'关系',value:'妻子'}]};
 assert.throws(()=>phone.normalizePhoneDraftApp({id:'A1',entries:[c]},contactPlan,noMem,'folio',null,{...contactOptions,controlledEvidence:quote}),{code:'RMT_PHONE_EVIDENCE'});
});
