import test from 'node:test';
import assert from 'node:assert/strict';
import * as heart from '../src/modes/heart.js';
import * as access from '../src/core/heartLanguage.js';
import * as phone from '../src/modes/phone.js';
import * as room from '../src/modes/room.js';
import * as items from '../src/modes/items.js';

const bank = { chatId: 'actual-count', archiveRevision: 'rev-1', characterName: '林舟', userName: '小雨',
  archiveSummary: '两人刚认识。', memories: [{id:'M001',title:'庭院',summary:'两人一同栽花。',anchors:['庭院']}] };
const partialLanguage = () => ({relationshipSummary:'按当前人设保持自然距离。',greetings:{morning:['早安，窗边的茶还温着。'],night:['晚安，明天见。']}});
const voice = (id = 'f1', color = 'white') => ({id,color,title:'雨夜的书',script:[
  {speaker:'char',text:'下雨的时候，我很喜欢把窗户开一条缝，坐下来翻几页自己没读完的书，声音让人安心。'},
  {speaker:'user',text:'是雨声吗？'},
  {speaker:'char',text:'对，雨点碰到窗沿，有轻有重，像是有人替我慢慢翻页。那种节奏，不需要解释也觉得很好。'},
  {speaker:'user',text:'听起来很安静。'},
  {speaker:'char',text:'有时候我也会放下书，听一会儿再继续。你今天坐在旁边，我好像比平时更不着急读完了。'},
]});
const plan = {id:'notes',label:'备忘',kind:'notes',entries:[{id:'a'},{id:'b'},{id:'c'}]};
const note = (id,text='今天想安静地读一会儿书。') => ({id,title:'读书',preview:text,detail:text,basis:'推演',messages:[],fields:[]});
const phoneOptions = {allowPartial:true,controlledEvidence:'林舟喜欢读书。',requireLifestyleContent:true};

test('language: fewer sentences/categories are ready, not a quota failure',()=>{
  const data = heart.normalizeHeartCore(partialLanguage(),bank);
  const status = access.heartLanguageStatus(data);
  assert.equal(status.complete,true); assert.equal(status.status,'ready'); assert.equal(status.total,2);
  assert.deepEqual(data.greetings.birthday,[]);
});
test('language: empty result or missing required summary still fails',()=>{
  assert.throws(()=>heart.normalizeHeartCore({relationshipSummary:'自然相处',greetings:{}},bank));
  assert.throws(()=>heart.normalizeHeartCore({greetings:{morning:['早上好']}},bank));
});
test('fireflies: two complete conversations of one color are usable without topping up',()=>{
  assert.equal(heart.normalizeFireflyVoicesPart({fireflyVoices:[voice(),voice('f2')]}).length,2);
});
test('fireflies: per-conversation structure remains required',()=>{
  assert.throws(()=>heart.normalizeFireflyVoicesPart({fireflyVoices:[{...voice(),script:[{speaker:'char',text:'标题而已'}]}]}));
});
test('phone: successful 2/3 is two entries, no pending missing slot',()=>{
  const app = phone.normalizePhoneDraftApp({id:'notes',entries:[note('a'),note('b')]},plan,bank,'phone',null,phoneOptions);
  assert.equal(app.entries.length,2); assert.deepEqual(app.omittedEntryIds,['c']);
  assert.equal(phone.phoneHasMissingEntries({apps:[app]}),false);
  const status = phone.phoneCompletionSummary({plan:{apps:[plan]},completedApps:[app]});
  assert.equal(status.readableItems,2); assert.equal(status.missingItems,0); assert.equal(status.partial,false);
  assert.equal(status.omittedItems,1);
});
test('phone: an actually invalid returned item remains retryable beside saved siblings',()=>{
  const app = phone.normalizePhoneDraftApp({id:'notes',entries:[note('a'),{id:'b',preview:'',detail:''}]},plan,bank,'phone',null,phoneOptions);
  assert.equal(phone.phoneCompletionSummary({apps:[app]}).readableItems,1);
  assert.equal(phone.phoneCompletionSummary({apps:[app]}).missingItems,1);
  assert.equal(phone.phoneHasMissingEntries({apps:[app]}),true);
});
test('phone: omitted slots survive draft revalidation and are not classified as failed',()=>{
  const app = phone.normalizePhoneDraftApp({id:'notes',entries:[note('a')]},plan,bank,'phone',null,phoneOptions);
  const reopened = phone.normalizePhoneDraftApp(app,plan,bank,'phone',null,{trustedStored:true});
  assert.deepEqual(reopened.omittedEntryIds,['b','c']); assert.equal(reopened.entries.length,1);
});
test('phone: zero valid content is not success',()=>{
  assert.throws(()=>phone.normalizePhoneDraftApp({id:'notes',entries:[]},plan,bank,'phone',null,phoneOptions));
});
test('room: one complete space/object is sufficient, no minimum presence lines repair',()=>{
  const data={spaces:[{id:'study',label:'书房',spaceType:'study',atmosphere:'此刻窗前很安静。',objects:[{id:'book',label:'书',basis:'推演',description:'此刻书页正翻到一半。',line:'要看看这一页吗？'}]}],presenceLines:[],dayparts:{}};
  for(const key of ['morning','daytime','evening','night']) data.dayparts[key]={spaceId:'study',activity:'正在看书。',line:'此刻这里很安静。',focusObjectId:'book'};
  const out=room.normalizeRoom(data,bank); assert.equal(out.spaces.length,1); assert.equal(out.spaces[0].objects.length,1);
  assert.equal(room.roomCandidateRepairSlots(data,bank).filter(slot=>slot.path[0]==='presenceLines').length,0);
});
test('items: a single complete item in one container can be used',()=>{
  const data={containers:[{id:'box',label:'书匣',nodes:[{id:'b',kind:'item',label:'书签',summary:'此刻一枚素色纸书签放在书旁。',line:'正好用它夹住这一页。',basis:'推演',children:[]}]}]};
  assert.equal(items.normalizeItems(data,bank).containers[0].nodes.length,1);
});


test('provider-supplied omission ids cannot suppress a returned invalid item',()=>{
 const app=phone.normalizePhoneDraftApp({id:'notes',omittedEntryIds:['b'],entries:[note('a'),{id:'b',preview:'',detail:''}]},plan,bank,'phone',null,phoneOptions);
 assert.deepEqual(app.omittedEntryIds,['c']);assert.equal(phone.phoneHasMissingEntries({apps:[app]}),true);
});
test('foreign/duplicate phone ids fail; a smaller result cannot select a different write target',()=>{
 for(const entries of [[note('evil')],[note('a'),note('a')]])assert.throws(()=>phone.normalizePhoneDraftApp({id:'notes',entries},plan,bank,'phone',null,phoneOptions));
 assert.throws(()=>phone.normalizePhoneDraftApp({id:'other',entries:[note('a')]},plan,bank,'phone',null,phoneOptions));
});
test('stored omitted id cannot overlap a present entry or escape its local plan',()=>{
 for(const ids of [['a'],['foreign']])assert.throws(()=>phone.normalizePhoneDraftApp({id:'notes',entries:[note('a')],omittedEntryIds:ids},plan,bank,'phone',null,{trustedStored:true}));
});
test('small room and items must still reject unsupported shared-history claims',()=>{
 const node={id:'b',kind:'item',label:'书签',summary:'去年小雨送给我的书签。',line:'还记得我们去年一起挑选的吗？',basis:'推演',children:[]};
 assert.throws(()=>items.normalizeItems({containers:[{id:'box',label:'书匣',nodes:[node]}]},bank));
 const beat={time:'09:00',spaceId:'S',activity:'去年我们一起去过海边。',line:'还记得去年我们一起去过海边吗？',ambient:'海边的风。',trace:'过去的合照。'};
 assert.throws(()=>room.normalizeRoomLifePlan({beats:[beat]},{spaces:[{id:'S',objects:[]}]},bank,new Date()));
});
test('incomplete four-panel content is not silently displayed as a three-panel success',()=>{
 const part={id:'S1',panelCount:4,panels:[{action:'a'},{action:'b'},{action:'c'}],imagePrompt:'no text'};
 assert.throws(()=>heart.normalizeHeartCollectionBatch({dailyStrips:[part]},'strips'));
});
test('actual collection caps remain in force',()=>{
 assert.throws(()=>heart.normalizeHeartCollectionBatch({fireflyVoices:Array.from({length:7},(_,i)=>voice(String(i)))},'fireflies'));
 assert.throws(()=>heart.normalizeHeartCollectionBatch({dailyStrips:[]},'strips'));
});
