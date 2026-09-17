import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/r847Host.mjs';
import * as calendar from '../src/modes/calendar.js';
import * as prompts from '../src/generation/prompts.js';
import * as cache from '../src/core/cache.js';
import * as constants from '../src/core/constants.js';
import * as client from '../src/generation/client.js';
import * as view from '../src/ui/calendarView.js';
import {state} from '../src/core/state.js';
const bank=()=>({chatId:'c',archiveRevision:'r',characterName:'林舟',userName:'小月',memories:[{id:'M001',date:'2008/05/18',title:'一起栽花',summary:'两人在庭院一起栽花。',anchors:['庭院']} ]});
const data=()=>({past:[],promised:[],future:[],stickyNotes:[],moodNotes:[{id:'MOOD',textMode:'persona-expression',text:'此刻的风很安静，我想把这份心情留在这里。',date:'2099/12/31',calendarEntryId:''}]});
const allNotes=s=>Object.values(s.dayPages).flatMap(p=>p.moodNotes||[]);
for(const [name,dates,expected]of [
 ['full date',['2008/05/18'],'2008/05/18'],['yearless',['06/30'],'06/30'],['unrecorded',['未知',''],''],
 ['archive order not numerical maximum',['2030/05/20','2008/05/18'],'2008/05/18'],
 ['invalid tail',['2008/05/18','待定','2026/02/30'],'2008/05/18']])test('story date: '+name,()=>{
 const memories=dates.map((date,i)=>({id:'M'+(i+1),date}));assert.equal(calendar.storyCalendarDate({memories}),expected);
});
test('timestamp fields, future lists and nonarchive IDs do not authorize story date',()=>assert.equal(calendar.storyCalendarDate({generatedAt:Date.now(),currentDate:'2099/01/01',future:[{date:'2099/01/01'}],memories:[{id:'M001',timestamp:Date.now()},{id:'FOREIGN',date:'2099/01/01'}]}),''));
test('mood without an event belongs to latest story date, ignores model date and wall-clock option',()=>{
 const s=calendar.normalizeCalendar(data(),bank(),{currentDate:'2099/01/01'});assert.equal(s.storyDate,'2008/05/18');assert.equal(s.dateBasis,'story');assert.equal(allNotes(s)[0].date,'2008/05/18');assert.equal(s.selectedMonth,'2008-05');assert.equal(s.selectedDateKey,'date:2008/05/18');
});
test('no recorded story date remains pending; no fabricated wall-clock day or annual month',()=>{
 const b={...bank(),memories:[]};const s=calendar.normalizeCalendar(data(),b,{currentDate:'2099/01/01'});assert.equal(allNotes(s)[0].date,'待定');assert.equal(s.storyDate,'');assert.equal(s.selectedMonth,'');assert.ok(Object.keys(s.dayPages).some(k=>k.startsWith('pending:')));
});
test('yearless story stays yearless; no invented current year',()=>{
 const b=bank();b.memories[0].date='06/30';const s=calendar.normalizeCalendar(data(),b);assert.equal(s.storyDate,'06/30');assert.equal(s.selectedMonth,'annual-06');assert.equal(allNotes(s)[0].date,'06/30');assert.ok(!JSON.stringify(s.dayPages).includes('2026'));
});
test('past entry keeps its own evidence date when a later story scene exists',()=>{
 const b=bank();b.memories.push({id:'M002',date:'2008/07/03',title:'一同去看展',summary:'两人一同去看展。',anchors:['去看展']});
 const d=data();d.past=[{id:'P',title:'一起栽花',sourceMemoryIds:['M001'],sourceMemoryAnchor:'庭院'}];
 const s=calendar.normalizeCalendar(d,b);assert.equal(s.storyDate,'2008/07/03');assert.equal(s.entries[0].date,'2008/05/18');
});
test('mood explicitly bound to an existing event uses that date, not current story page',()=>{
 const b=bank();b.memories.push({id:'M002',date:'2008/07/03',title:'一同看展',anchors:['看展']});const d=data();d.past=[{id:'P',title:'一起栽花',sourceMemoryIds:['M001'],sourceMemoryAnchor:'庭院'}];d.moodNotes[0].calendarEntryId='P';const s=calendar.normalizeCalendar(d,b);assert.equal(allNotes(s)[0].date,'2008/05/18');
});
test('old saved day pages and personal drafts never relocate during migration',()=>{
 const b=bank(),s=calendar.normalizeCalendar(data(),b,{dateBasis:'legacy-local',currentDate:'2026/09/16'});delete s.dateBasis;delete s.storyDate;s.selectedDateKey='';
 const oldPages=JSON.stringify(s.dayPages),original=JSON.stringify(s);const migrated=calendar.migrateCalendarSession(s,b);
 assert.equal(migrated.storyDate,'2008/05/18');assert.equal(migrated.selectedMonth,'2008-05');assert.equal(JSON.stringify(migrated.dayPages),oldPages);assert.equal(JSON.stringify(s),original);
});
test('manual selected reading month/day is preserved even when story reference changes',()=>{
 const b=bank(),s=calendar.normalizeCalendar(data(),b);s.selectedMonth='2008-04';s.selectedDateKey='date:2008/04/07';const m=calendar.migrateCalendarSession(s,b);assert.equal(m.selectedMonth,'2008-04');assert.equal(m.selectedDateKey,'date:2008/04/07');assert.equal(m.storyDate,'2008/05/18');
});
test('holiday equality has no implicit device date, and full-year dates need known story year',()=>{
 assert.equal(calendar.calendarDateMatchesToday('06/30','06/30'),true);assert.equal(calendar.calendarDateMatchesToday('2008/06/30','06/30'),false);assert.equal(calendar.calendarDateMatchesToday('06/30'),false);assert.equal(calendar.calendarDateMatchesToday('06/30','2008/06/30'),true);
});
test('new calendar prompt names story date; original recipe preserved for legacy only',()=>{
 const ctx={name2:'林舟',name1:'小月'},old=prompts.calendarPrompt(ctx,bank(),{currentDate:'2026/09/16'}),fresh=prompts.calendarStoryPrompt(ctx,bank(),{currentDate:'2008/05/18'});
 assert.match(old,/CURRENT_LOCAL_DATE/);assert.doesNotMatch(fresh,/CURRENT_LOCAL_DATE/);assert.match(fresh,/CURRENT_STORY_DATE/);assert.match(fresh,/不得用电脑\/手机日期/);assert.match(fresh,/2008\/05\/18/);
});
for(const date of ['2008/05/18','06/30',''])test('actual calendar generation capture/save/reopen uses story date '+JSON.stringify(date),async t=>{
 const f=await fixture(t);f.liveBank.memories[0].date=date;f.ctx.chatMetadata[constants.MEMORY_KEY].memories[0].date=date;
 f.setResponse(data());const before=await f.persisted();const result=await client.generateMode('calendar',{background:true});assert.ok(result,JSON.stringify(f.notices));assert.equal(f.requests.length,1);
 const prompt=JSON.stringify(f.requests[0]);assert.match(prompt,/CURRENT_STORY_DATE/);const saved=await f.persisted();assert.equal(saved.calendar.storyDate,date);assert.equal(allNotes(saved.calendar)[0].date,date||'待定');assert.deepEqual(saved.phone,before.phone);
 state.runtimeSessionCache.clear();await cache.ensureCacheHydrated(f.ctx);await f.open('calendar');assert.equal(state.activeSession.storyDate,date);if(!date)assert.match(f.body.innerHTML,/剧情日期未记录/);
});

const legacyFixtures=JSON.parse((await import('node:fs')).readFileSync(new URL('./helpers/r8413-calendar-legacy.json',import.meta.url),'utf8'));
for(const kind of ['failed','complete'])test('actual r84.12 calendar '+kind+' draft resumes with exact prior recipe and original date',async t=>{
 const f=await fixture(t);f.liveBank.memories[0].date='2008/05/18';f.ctx.chatMetadata[constants.MEMORY_KEY].memories[0].date='2008/05/18';
 const saved=structuredClone(legacyFixtures[kind]);saved.__generationRecoveryV1.calendar.createdAt=Date.now();saved.__generationRecoveryV1.calendar.updatedAt=Date.now();const date=saved.__generationRecoveryV1.calendar.operation.calendarDate;
 Object.assign(f.liveCache,structuredClone(saved));f.ctx.chatMetadata[constants.CACHE_KEY]=structuredClone(saved);f.records.get(f.aEntry.entryId).cache=structuredClone(saved);state.runtimeSessionCache.clear();await cache.ensureCacheHydrated(f.ctx);
 f.setResponse(data());await client.continueSavedGeneration('calendar');const next=await f.persisted();assert.ok(next.calendar,JSON.stringify(f.notices));assert.equal(f.requests.length,kind==='complete'?0:1);assert.equal(allNotes(next.calendar)[0].date,date);assert.equal(cache.loadGenerationRecovery('calendar',f.ctx),null);
 if(f.requests.length){assert.match(JSON.stringify(f.requests[0]),/CURRENT_LOCAL_DATE/);assert.doesNotMatch(JSON.stringify(f.requests[0]),/CURRENT_STORY_DATE/);}
 assert.deepEqual(next.phone,saved.phone);assert.deepEqual(next.cabinet,saved.cabinet);
});
