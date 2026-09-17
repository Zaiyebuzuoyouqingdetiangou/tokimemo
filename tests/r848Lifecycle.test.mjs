import * as overlay from '../src/ui/overlay.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/r847Host.mjs';
import * as constants from '../src/core/constants.js';
import * as cache from '../src/core/cache.js';
import * as client from '../src/generation/client.js';
import * as heart from '../src/modes/heart.js';
import * as phone from '../src/modes/phone.js';
import * as phoneView from '../src/ui/phoneView.js';
import * as room from '../src/modes/room.js';
import * as contextApi from '../src/core/context.js';
import * as heartView from '../src/ui/heartView.js';
import * as language from '../src/core/heartLanguage.js';
import * as recovery from '../src/generation/recovery.js';
import { state } from '../src/core/state.js';

const core = greetings => ({title:'基础语言',relationshipSummary:'按当前关系自然相处。',greetings});
const script = () => Array.from({length:6},(_,i)=>({speaker:i%2?'user':'char',text:'今天的风很轻，想安静地看看院子里的花，把手边的书慢慢读完。'.repeat(3)}));
const voice = (id) => ({id,color:'white',title:'话题'+id,script:[
 {speaker:'char',text:'下雨的时候，我很喜欢把窗户开一条缝，坐下来翻几页自己没读完的书，声音让人安心。'+id},
 {speaker:'user',text:'是雨声吗？'},
 {speaker:'char',text:'对，雨点碰到窗沿，有轻有重，像是有人替我慢慢翻页。那种节奏，不需要解释也觉得很好。'},
 {speaker:'user',text:'听起来很安静。'},
 {speaker:'char',text:'有时候我也会放下书，听一会儿再继续。你今天坐在旁边，我好像比平时更不着急读完了。'},
]});
const strip = id => ({id,title:'小纸鸢'+id,subtitle:'午后的小事',panelCount:1,panels:[{action:'风把纸鸢吹到窗边。',charLine:'刚好停在这里。'}],visualSeed:['纸鸢'],imagePrompt:'Two adult chibi characters watch a paper kite resting by the sunny window. The kite fills the foreground, with no text or lettering.'});
async function seed(f,mode,session){
 const obj={...session,kind:mode,chatId:f.liveBank.chatId,archiveRevision:f.liveBank.archiveRevision};
 f.liveCache[mode]=structuredClone(obj);f.ctx.chatMetadata[constants.CACHE_KEY]=structuredClone(f.liveCache);
 f.records.get(f.aEntry.entryId).cache=structuredClone(f.liveCache);state.runtimeSessionCache.clear();return obj;
}
function clearPhone(f){ delete f.liveCache.phone;delete f.ctx.chatMetadata[constants.CACHE_KEY].phone;delete f.records.get(f.aEntry.entryId).cache.phone; }
const note = id => ({id,title:'新笔记'+id,preview:'今天想安静看书。',detail:'今天想坐在窗边慢慢读书。',basis:'推演',fields:[],messages:[]});
const appPlan={deviceKind:'phone',apps:[{id:'A1',kind:'notes',label:'备忘',entries:['a','b','c'].map(id=>({id,title:'记录'+id}))}]};

test('one request saves two language lines, empty birthday is not pending and reopen sends nothing',async t=>{
 const f=await fixture(t);f.open('heart');f.setResponse(core({morning:['早安。'],night:['晚安。']}));
 await heart.generateHeartSection('dialogues');assert.equal(f.requests.length,1);
 const saved=await f.persisted();assert.equal(language.heartLanguageStatus(saved.heart).total,2);assert.equal(saved.heart.generationParts.dialogues,true);
 assert.deepEqual(saved.heart.greetings.birthday,[]);assert.equal(cache.loadGenerationRecovery('heart',f.ctx),null);
 state.runtimeSessionCache.clear();await cache.ensureCacheHydrated(f.ctx);overlay.openCachedOrGenerate('heart',{workspaceRoute:'language'});
 assert.match(f.body.innerHTML,/已有 2 句/);assert.doesNotMatch(f.body.innerHTML,/补全基础语言/);assert.equal(f.requests.length,1);
});
test('birthday-only addition preserves all old lines and other HEART submodules',async t=>{
 const f=await fixture(t);const s=heart.normalizeHeart(heart.makeHeartSession(core({morning:['旧早安。']})),f.liveBank);
 s.voiceDramas=[{id:'V1',kind:'spring',title:'旧春天',script:script()}];await seed(f,'heart',s);f.open('heart');
 f.setResponse(core({birthday:['生日快乐，今天好好歇一会儿。'],morning:['不属于本次选择的句子。']}));
 await heart.generateHeartSection('dialogues',{languageCategory:'birthday'});
 const saved=await f.persisted();assert.equal(f.requests.length,1);assert.deepEqual(saved.heart.greetings.morning,['旧早安。']);
 assert.equal(saved.heart.greetings.birthday.length,1);assert.equal(saved.heart.voiceDramas[0].title,'旧春天');
});
test('two fireflies of one color save after exactly one request, no refill draft',async t=>{
 const f=await fixture(t);f.open('heart');f.setResponse({fireflyVoices:[voice('a'),voice('b')]});
 await heart.generateHeartFirefliesSection();const saved=await f.persisted();
 assert.equal(saved.heart?.fireflyVoices?.length,2,JSON.stringify(f.notices));assert.equal(f.requests.length,1);
 assert.equal(cache.loadGenerationRecovery('heart',f.ctx),null);assert.equal(saved.heart.collectionIssues.fireflies,0);
 state.runtimeSessionCache.clear();await cache.ensureCacheHydrated(f.ctx);f.open('heart');assert.equal(state.activeSession.fireflyVoices.length,2);
});
test('valid firefly siblings saved; a malformed conversation is a separate optional retry',async t=>{
 const f=await fixture(t);f.open('heart');f.setResponse({fireflyVoices:[voice('a'),voice('b'),{id:'c',color:'white',script:[{speaker:'char',text:'未写完'}]}]});
 await heart.generateHeartFirefliesSection();let saved=await f.persisted();assert.equal(f.requests.length,1);
 assert.equal(saved.heart.fireflyVoices.length,2);assert.equal(saved.heart.collectionIssues.fireflies,1);
 const kept=JSON.stringify(saved.heart.fireflyVoices);f.setResponse({fireflyVoices:[voice('d')]});
 await heart.generateHeartFirefliesSection();saved=await f.persisted();
 assert.equal(f.requests.length,2);assert.equal(saved.heart.fireflyVoices.length,3);assert.equal(JSON.stringify(saved.heart.fireflyVoices.slice(0,2)),kept);
 assert.equal(saved.heart.collectionIssues.fireflies,0);
});
test('two complete daily strips plus one incomplete four-panel: only complete strips saved',async t=>{
 const f=await fixture(t);f.open('heart');f.setResponse({dailyStrips:[strip('a'),strip('b'),{...strip('c'),panelCount:4}]});
 await heart.generateHeartSection('strips');const saved=await f.persisted();assert.equal(f.requests.length,1);
 assert.equal(saved.heart.dailyStrips.length,2);assert.equal(saved.heart.collectionIssues.strips,1);
});
test('normal two-of-three phone response is complete for this run, not an unavailable slot',async t=>{
 const f=await fixture(t);clearPhone(f);f.setResponse(messages=>messages[0].content.includes('UNTRUSTED_APP_PLAN_JSON')?{app:{id:'A1',entries:[note('a'),note('b')]}}:appPlan);
 const result=await client.generateMode('phone',{background:true});assert.ok(result,JSON.stringify(f.notices));assert.equal(f.requests.length,2);
 const saved=await f.persisted();assert.equal(saved.phone.apps[0].entries.length,2);assert.deepEqual(saved.phone.apps[0].omittedEntryIds,['c']);
 assert.equal(phone.phoneHasMissingEntries(saved.phone),false);assert.equal(cache.loadGenerationRecovery('phone',f.ctx),null);
 state.runtimeSessionCache.clear();await cache.ensureCacheHydrated(f.ctx);f.open('phone');assert.match(f.body.innerHTML,/已有 2 项内容/);
 assert.doesNotMatch(f.body.innerHTML,/2\/3|待补齐|重试未完成项/);assert.equal(f.requests.length,2);
});
test('phone actual invalid row is separate from normal omission and retry requests only invalid id',async t=>{
 const f=await fixture(t);clearPhone(f);f.setResponse(messages=>messages[0].content.includes('UNTRUSTED_APP_PLAN_JSON')?{app:{id:'A1',entries:[note('a'),{id:'b',preview:'',detail:''}]}}:appPlan);
 const result=await client.generateMode('phone',{background:true});assert.ok(result,JSON.stringify(f.notices));let saved=await f.persisted();
 assert.equal(phone.phoneCompletionSummary(saved.phone).readableItems,1);assert.equal(phone.phoneCompletionSummary(saved.phone).missingItems,1);
 const kept=JSON.stringify(saved.phone.apps[0].entries[0]);state.runtimeSessionCache.clear();await cache.ensureCacheHydrated(f.ctx);f.open('phone');
 assert.match(f.body.innerHTML,/已有 1 项内容/);assert.match(f.body.innerHTML,/另有 1 项未通过校验/);assert.doesNotMatch(f.body.innerHTML,/1\/3/);
 f.setResponse(messages=>{const p=messages[0].content;const planBlock=p.split('UNTRUSTED_APP_PLAN_JSON:\n')[1].split('\n\n严格输出')[0];assert.deepEqual(JSON.parse(planBlock).entries.map(item=>item.id),['b']);return {app:{id:'A1',entries:[note('b')]}};});
 await client.generateMode('phone',{background:true,fillMissing:true});saved=await f.persisted();
 assert.equal(f.requests.length,3);assert.equal(JSON.stringify(saved.phone.apps[0].entries[0]),kept);assert.equal(phone.phoneHasMissingEntries(saved.phone),false);
});
test('genuine second season request failure preserves first story and offers optional retry, not count matching',async t=>{
 const f=await fixture(t);f.open('heart');let calls=0;
 f.setResponse(()=>{if(++calls===2)throw new Error('fixture transport failure');return {voiceDramas:[{id:'V1',kind:'spring',title:'春日',script:script()}]};});
 await heart.generateHeartSeasonSection('spring');const saved=await f.persisted();assert.equal(f.requests.length,2);
 assert.equal(saved.heart.voiceDramas.length,1);assert.equal(saved.heart.scenarioDramas.length,0);
 state.runtimeSessionCache.clear();await cache.ensureCacheHydrated(f.ctx);f.open('heart');state.activeSession.selectedSeason='spring';heartView.renderHeart();
 assert.match(f.body.innerHTML,/重试未完成篇/);assert.match(f.body.innerHTML,/共 1 篇/);
 f.setResponse({scenarioDramas:[{id:'S1',season:'spring',title:'春日小事',script:script()}]});await client.continueSavedGeneration('heart');
 assert.equal(f.requests.length,3);assert.equal((await f.persisted()).heart.voiceDramas.length,1);
});
test('uneven saved seasons without an error journal are just readable works, not mandatory completion',async t=>{
 const f=await fixture(t),s=language.makeHeartShell(f.liveBank);s.voiceDramas=[{id:'V1',kind:'spring',title:'旧春天',script:script()}];
 await seed(f,'heart',s);f.open('heart');state.activeSession.selectedSeason='spring';heartView.renderHeart();
 assert.match(f.body.innerHTML,/追加生成/);assert.doesNotMatch(f.body.innerHTML,/继续补全|重试未完成篇/);assert.equal(f.requests.length,0);
});
test('empty language is still failure; quota policy never turns empty response into a saved success',async t=>{
 const f=await fixture(t);f.open('heart');f.setResponse(core({}));await heart.generateHeartSection('dialogues');
 assert.equal(f.requests.length,1);assert.ok(!(await f.persisted()).heart);assert.ok(cache.loadGenerationRecovery('heart',f.ctx));
});


test('interrupted phone draft reopens with short completed App and never refills its omitted ids',async t=>{
 const f=await fixture(t);clearPhone(f);const plan={deviceKind:'phone',apps:[...appPlan.apps,{id:'A2',kind:'reading',label:'书目',entries:[{id:'r1'}]}]};
 f.setResponse(messages=>{const p=messages[0].content;if(!p.includes('UNTRUSTED_APP_PLAN_JSON'))return plan;
  const app=JSON.parse(p.split('UNTRUSTED_APP_PLAN_JSON:\n')[1].split('\n\n严格输出')[0]);
  if(app.id==='A2')throw new Error('fixture interrupted App');return {app:{id:'A1',entries:[note('a'),note('b')]}};
 });
 const result=await client.generateMode('phone',{background:true});assert.ok(!result);assert.equal(f.requests.length,3);
 state.runtimeSessionCache.clear();await cache.ensureCacheHydrated(f.ctx);
 const draft=cache.loadPhoneGenerationDraft(f.ctx,f.liveBank);assert.deepEqual(draft.completedApps[0].omittedEntryIds,['c']);
 assert.equal(phone.phoneCompletionSummary(draft).readableItems,2);assert.equal(phone.phoneCompletionSummary(draft).missingItems,1);
 const kept=JSON.stringify(draft.completedApps[0].entries);
 f.setResponse(messages=>{const p=messages[0].content;const app=JSON.parse(p.split('UNTRUSTED_APP_PLAN_JSON:\n')[1].split('\n\n严格输出')[0]);assert.equal(app.id,'A2');return {app:{id:'A2',entries:[note('r1')]}};});
 await client.continueSavedGeneration('phone');assert.equal(f.requests.length,4);
 const saved=await f.persisted();assert.equal(saved.phone.apps.length,2);assert.equal(JSON.stringify(saved.phone.apps[0].entries),kept);
 assert.deepEqual(saved.phone.apps[0].omittedEntryIds,['c']);assert.equal(phone.phoneHasMissingEntries(saved.phone),false);
});
const smallRoom=()=>({spaces:[{id:'study',label:'书房',spaceType:'study',atmosphere:'此刻窗前很安静。',objects:[{id:'book',label:'书',basis:'推演',description:'此刻书页正翻到一半。',line:'要看看这一页吗？'}]}],presenceLines:[],dayparts:Object.fromEntries(constants.ROOM_DAYPART_KEYS.map(key=>[key,{spaceId:'study',activity:'正在看书。',line:'此刻这里很安静。',focusObjectId:'book'}]))});
test('one-space room initial generation uses one provider call, without presence/count repair calls',async t=>{
 const f=await fixture(t);f.setResponse(smallRoom());const out=await client.generateMode('room',{background:true});
 assert.ok(out,JSON.stringify(f.notices));assert.equal(f.requests.length,1);const saved=await f.persisted();assert.equal(saved.room.spaces.length,1);
 assert.equal(saved.room.spaces[0].objects.length,1);assert.equal(cache.loadGenerationRecovery('room',f.ctx),null);
});
test('single current-life node saves and reuses the same day instead of silently expanding to six',async t=>{
 const f=await fixture(t);t.after(()=>room.stopRoomClock());await seed(f,'room',room.normalizeRoom(smallRoom(),f.liveBank));f.open('room');
 f.setResponse({beats:[{time:'09:00',spaceId:'study',focusObjectId:'book',activity:'正在看书。',line:'此刻这里很安静。',ambient:'窗外光线明亮。',trace:'手边书页微微卷起。'}]});
 const first=await room.ensureRoomLifePlan({force:true});assert.equal(first?.beats?.length,1,JSON.stringify(f.notices));assert.equal(f.requests.length,1);
 state.runtimeSessionCache.clear();await cache.ensureCacheHydrated(f.ctx);f.open('room');const second=await room.ensureRoomLifePlan();assert.equal(second?.beats?.length,1);assert.equal(f.requests.length,1);
});
test('one item initial generation can commit without inventing extra containers or items',async t=>{
 const f=await fixture(t);const sr=smallRoom();sr.spaces[0].objects[0].label='书匣';sr.spaces[0].objects[0].searchable=true;await seed(f,'room',room.normalizeRoom(sr,f.liveBank));
 f.setResponse({containers:[{id:'b',label:'书匣',nodes:[{id:'b1',kind:'item',label:'书签',summary:'此刻一枚素色纸书签放在书旁。',line:'正好用它夹住这一页。',basis:'推演',children:[]}]}]});
 const out=await client.generateMode('items',{background:true});assert.ok(out,JSON.stringify(f.notices));assert.equal(f.requests.length,1);
 assert.equal((await f.persisted()).items.containers[0].nodes.length,1);
});
test('truncated JSON remains a real failure with recoverable draft, never normal omission',async t=>{
 const f=await fixture(t);f.open('heart');f.ctx.ConnectionManagerRequestService.sendRequest=async(_id,m,_length,_options,overridePayload)=>{const profile={model:'fixture-model','secret-id':'fixture-only'};const payload={secret_id:profile['secret-id'],model:profile.model,...overridePayload};f.requests.push(m);return {content:'{"greetings":{"morning":["你好"',finish_reason:'length'};};
 await heart.generateHeartSection('dialogues');assert.equal(f.requests.length,1);assert.ok(!(await f.persisted()).heart);
 assert.ok(cache.loadGenerationRecovery('heart',f.ctx));assert.equal(f.notices.filter(x=>x.kind==='success').length,0);
});
test('failed canonical save is never announced as saved or counted as committed',async t=>{
 const f=await fixture(t);f.open('heart');f.failCompletedSave('heart',v=>v?.fireflyVoices?.length);f.setResponse({fireflyVoices:[voice('a'),voice('b')]});
 await heart.generateHeartFirefliesSection();assert.equal(f.requests.length,1);assert.ok(f.rejectedWrites()>0);
 assert.ok(!(await f.persisted()).heart);assert.ok(!f.notices.some(x=>x.kind==='success'));
 assert.ok(cache.loadGenerationRecovery('heart',f.ctx));
});
test('late small batch never commits into the chat switched to while provider was pending',async t=>{
 const f=await fixture(t);f.open('heart');f.setResponse({fireflyVoices:[voice('a')]});const pause=f.pauseProvider();
 const pending=heart.generateHeartFirefliesSection();await pause.ready;
 f.ctx.chatId=f.otherBank.chatId;f.ctx.characterId=1;f.ctx.name1=f.otherBank.userName;f.ctx.name2=f.otherBank.characterName;
 f.ctx.chatMetadata={[constants.MEMORY_KEY]:structuredClone(f.otherBank),[constants.CACHE_KEY]:structuredClone(f.otherCache)};
 pause.release();await pending;assert.equal(f.requests.length,1);assert.ok(!(await f.persisted(f.bEntry)).heart);
 assert.ok(!f.ctx.chatMetadata[constants.CACHE_KEY]?.heart);assert.equal(state.activeGenerationTasks.size,0);
});
test('permanently read-only backup collections do not acquire generation permissions',async t=>{
 const f=await fixture(t);await f.historical('heart');state.activeArchiveReadOnly=true;state.activeArchiveSnapshot.backupOnly=true;const before=JSON.stringify(f.records.get(f.bEntry.entryId));
 f.setResponse({fireflyVoices:[voice('a')]});await heart.generateHeartFirefliesSection();
 assert.equal(f.requests.length,0);assert.equal(JSON.stringify(f.records.get(f.bEntry.entryId)),before);
});

test('missing birthday language falls back only with the correct daypart label, never a fabricated blessing',async t=>{
 const f=await fixture(t);const key=heartView.heartDaypartKey(new Date());const data=core({[key]:['今天先安静坐一会儿吧。']});
 data.userBirthdayMmDd=heartView.heartMmDd(new Date());const session=heart.normalizeHeart(data,f.liveBank);
 const picked=heartView.selectHeartGreeting(session,'fixture');assert.equal(picked.category,key);assert.doesNotMatch(picked.label,/生日/);assert.equal(f.requests.length,0);
});
