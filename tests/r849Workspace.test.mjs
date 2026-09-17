import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/r847Host.mjs';
import * as overlay from '../src/ui/overlay.js';
import * as workspaceUI from '../src/ui/workspace.js';
import * as navigation from '../src/ui/navigationBookmark.js';
import * as prefs from '../src/ui/workspaceState.js';
import * as album from '../src/ui/albumView.js';
import * as category from '../src/ui/albumCategory.js';
import * as langView from '../src/ui/languageView.js';
import * as heart from '../src/modes/heart.js';
import * as cache from '../src/core/cache.js';
import * as constants from '../src/core/constants.js';
import * as room from '../src/modes/room.js';
import * as interior from '../src/ui/roomInterior.js';
import { state } from '../src/core/state.js';
function save(f, mode, value) {
 const obj={...value,kind:mode,chatId:f.liveBank.chatId,archiveRevision:f.liveBank.archiveRevision};
 f.liveCache[mode]=structuredClone(obj);f.ctx.chatMetadata[constants.CACHE_KEY]=structuredClone(f.liveCache);
 f.records.get(f.aEntry.entryId).cache=structuredClone(f.liveCache);state.runtimeSessionCache.clear();return obj;
}
const core = () => heart.normalizeHeart({relationshipSummary:'按既有人设自然相处。',greetings:{morning:['第一句。','第二句。'],night:['晚安。']}},null);
const fakeAction=(action,extra={})=>({target:{closest:s=>s==='[data-rmt-action]'?{dataset:{rmtAction:action,...extra}}:null}});
for (const [route,spec] of Object.entries(prefs.WORKSPACE_ROUTES)) {
 test('actual read-only entry: '+route+' opens without generating, saving or migrating data',async t=>{
  const f=await fixture(t);const before=JSON.stringify(f.ctx.chatMetadata);const source=JSON.stringify([...f.records]);
  await overlay.openCachedOrGenerate(spec.mode,{workspaceRoute:route});
  assert.equal(f.requests.length,0);assert.equal(JSON.stringify(f.ctx.chatMetadata),before);assert.equal(JSON.stringify([...f.records]),source);
  assert.equal(state.activeMode,spec.mode);assert.equal(prefs.workspace.route,route);
 });
}
test('all model/view aliases keep a single HEART data target and original siblings',async t=>{
 const f=await fixture(t);const h=save(f,'heart',core());const before=JSON.stringify(f.liveCache.heart);
 for(const route of ['language','postending','strips','fireflies','heart']){
  await overlay.openCachedOrGenerate('heart',{workspaceRoute:route});assert.equal(state.activeSession.kind,'heart');
  assert.equal(state.activeSession.greetings.morning[0],h.greetings.morning[0]);assert.equal(JSON.stringify(f.liveCache.heart),before);
 }
 assert.equal(f.requests.length,0);
});
test('malformed existing records never get an empty-generation overwrite action',async t=>{
 const f=await fixture(t);
 for(const mode of ['heart','phone','album','adv','pastLives']){
  save(f,mode,{kind:'wrong'});f.liveCache[mode].kind='wrong';f.ctx.chatMetadata[constants.CACHE_KEY]=structuredClone(f.liveCache);state.runtimeSessionCache.clear();
  await overlay.openCachedOrGenerate(mode);assert.equal(state.activeSession,null);assert.match(f.body.innerHTML,/原数据保留/);assert.doesNotMatch(f.body.innerHTML,/data-rmt-generate-mode=/);
 }
 assert.equal(f.requests.length,0);
});
test('basic-language reader selects all actual lines instead of one repeated line',async t=>{
 const f=await fixture(t);save(f,'heart',core());await overlay.openCachedOrGenerate('heart',{workspaceRoute:'language'});
 assert.match(f.body.innerHTML,/第一句/);
 langView.handleLanguageClick({target:{closest:()=>({dataset:{rmtLanguageStep:'1'}})}});assert.match(f.body.innerHTML,/第二句/);
 langView.handleLanguageChange({target:{matches:()=>true,value:'birthday'}});assert.match(f.body.innerHTML,/这个类别还没有台词/);
 assert.match(f.body.innerHTML,/生成当前类别/);assert.equal(f.requests.length,0);
});
test('new language UI action reaches original generator and saves only selected category',async t=>{
 const f=await fixture(t);save(f,'heart',core());await overlay.openCachedOrGenerate('heart',{workspaceRoute:'language'});
 const original=f.body.querySelector.bind(f.body);f.body.querySelector=s=>s==='[data-rmt-language-category]'?{value:'birthday'}:original(s);
 f.setResponse({relationshipSummary:'按既有人设自然相处。',greetings:{birthday:['生日快乐，今天好好歇一会儿。'],morning:['不能覆盖旧句。']}});
 overlay.handleOverlayClick(fakeAction('heart-add-language'));
 for(let i=0;i<300;i++){await new Promise(r=>setTimeout(r,5));if(f.requests.length&&!state.activeModeBuildScopes.size&&!state.activeGenerationTasks.size)break;}
 const stored=await f.persisted();assert.equal(f.requests.length,1);assert.equal(stored.heart.greetings.birthday.length,1);
 assert.deepEqual(stored.heart.greetings.morning,['第一句。','第二句。']);assert.equal(prefs.workspace.route,'language');
});
test('replacement cancellation via actual new UI sends no request and keeps every record',async t=>{
 const f=await fixture(t);save(f,'heart',core());await overlay.openCachedOrGenerate('heart',{workspaceRoute:'language'});
 let confirms=0;globalThis.confirm=()=>{confirms++;return false};const before=JSON.stringify([...f.records]);
 overlay.handleOverlayClick(fakeAction('heart-generate-language',{rmtHeartLanguageReplace:'1'}));
 await new Promise(r=>setTimeout(r,30));assert.equal(confirms,1);assert.equal(f.requests.length,0);assert.equal(JSON.stringify([...f.records]),before);
});
test('leaving for a different module while language runs does not replace that reader',async t=>{
 const f=await fixture(t);save(f,'heart',core());await overlay.openCachedOrGenerate('heart',{workspaceRoute:'language'});
 const wait=f.pauseProvider();f.setResponse({relationshipSummary:'自然相处。',greetings:{night:['夜深了。']}});
 const running=heart.generateHeartSection('dialogues',{languageCategory:'night'});await wait.ready;
 await overlay.openCachedOrGenerate('phone');wait.release();await running;
 assert.equal(state.activeMode,'phone');assert.equal(prefs.workspace.route,'phone');assert.equal((await f.persisted()).heart.greetings.night.length,2);
});
test('language bookmark reopens its own alias without a second store or model call',async t=>{
 const f=await fixture(t);save(f,'heart',core());await overlay.openCachedOrGenerate('heart',{workspaceRoute:'language'});navigation.rememberReadingPosition();
 prefs.workspace.route='heart';state.activeMode=null;state.activeSession=null;
 assert.equal(navigation.restoreReadingPosition({open:overlay.openOverlay,render:overlay.renderActive}),true);
 assert.equal(prefs.workspace.route,'language');assert.match(f.body.innerHTML,/基础语言/);assert.equal(f.requests.length,0);
});
test('private category sorting is display only and handles multiple selected private entries',async t=>{
 const f=await fixture(t);save(f,'album',{category:'全部',page:1,pageSize:6,sharedMemory:false,selectedId:'P2',entries:[
 {id:'P1',title:'分类记录1',category:'日常',tags:['nsfw'],unlocked:false,hintLines:[],comments:[]},
 {id:'P2',title:'分类记录2',category:'约会',tags:['成人内容'],unlocked:false,hintLines:[],comments:[]},
 {id:'N',title:'窗边拥抱',desc:'温柔的拥抱。',category:'约会',unlocked:false,hintLines:[],comments:[]}]});
 await overlay.openCachedOrGenerate('album');album.albumFilter('私密');state.activeSession.selectedId='P2';album.renderAlbum();
 assert.equal(state.activeSession.selectedId,'P2');assert.equal(album.filteredAlbumEntries().length,2);assert.equal(f.liveCache.album.entries[1].category,'约会');
 album.albumFilter('全部');assert.equal(album.filteredAlbumEntries().length,3);assert.deepEqual(category.ALBUM_DISPLAY_CATEGORIES,['全部','日常','约会','私密','结局']);
});
for(const [entry,answer] of [[{desc:'普通拥抱，窗边的晚安吻。'},false],[{tags:['R18']},true],[{imagePrompt:'no nsfw, no explicit sexual content'},false],[{desc:'仅做分类测试，NSFW内容标签。'},true],[{category:'结局'},false]]){
 test('private classifier bounded explicit evidence '+JSON.stringify(entry),()=>assert.equal(category.albumIsPrivate(entry),answer));
}
test('profile SVG and furniture IDs cannot become HTML, CSS or code',()=>{
 const a=interior.roomFigureSvg({hairShape:'short',hairTone:'dark',outfit:'casual'}),b=interior.roomFigureSvg({hairShape:'long',hairTone:'silver',outfit:'historical'});assert.notEqual(a,b);
 assert.match(interior.roomFigureSvg({}),/silhouette/);
 const html=interior.roomInteriorHtml([{id:'"><img src=x>',number:1,item:{label:'<script>bad</script>'},visualKind:'<svg onload=bad>'}],{figure:{hairShape:'<svg>',hairTone:'red;url(x)'},personIsHere:true,charName:'<img src=x>'});
 assert.doesNotMatch(html,/<script>|<img|onload=bad|url\(x\)/);assert.match(html,/&lt;script&gt;/);
});
test('large room still has every item on original rail while selected scene paginates',()=>{
 const space={objects:Array.from({length:25},(_,i)=>({id:'O'+i,label:'书本'+i,zone:'中央'}))};const layout=room.roomObjectLayout(space);
 const html=interior.roomInteriorHtml(layout,{selectedId:layout[24].id});assert.equal(layout.length,25);assert.equal((html.match(/class="rmt-interior"/g)||[]).length,1);assert.match(html,new RegExp(`data-rmt-room-id="${layout[24].id}"`));
});
test('UI preference store rejects unknown keys/modes and contains no story data',async t=>{
 const f=await fixture(t);assert.equal(prefs.setWorkspacePreference('archiveRevision','bad'),false);assert.equal(prefs.setWorkspacePreference('layout','<svg>'),false);
 assert.equal(prefs.setWorkspacePreference('layout','list'),true);assert.equal(prefs.setWorkspacePreference('startup','content'),true);
 const data=globalThis.localStorage.getItem('heartbeatMemoriesWorkspaceUiV1');assert.ok(data.length<300);assert.doesNotMatch(data,/memories|greetings|secret|api|title|archiveRevision/);
 prefs.setWorkspacePreference('layout','cards');prefs.setWorkspacePreference('startup','settings');
});

test('furniture description location prefix does not turn a chair into a window',()=>{
 const html=interior.roomInteriorHtml([{id:'chair',number:'<img src=x>',item:{label:'窗边的扶手椅'},visualKind:'window'}]);
 assert.match(html,/data-rmt-furniture="seat"/);assert.doesNotMatch(html,/<img|data-rmt-furniture="window"/);
 assert.doesNotMatch(interior.roomFigureSvg({build:'__proto__',hairTone:'constructor',outfit:'__proto__'}),/function Object|\[object Object\]/);
});

test('independent HEART managers retain correct per-item operations without whole-HEART deletion',async t=>{
 const f=await fixture(t);const manager=await import('../src/ui/contentManager.js');
 const session={...core(),kind:'heart',voiceDramas:[{id:'s',kind:'spring',title:'春雨'},{id:'p',kind:'postending',title:'后日谈'}],scenarioDramas:[{id:'c',season:'spring',title:'春日'}],fireflyVoices:[{id:'f',title:'光点',color:'white'}],dailyStrips:[{id:'d',title:'一格',cgImage:{url:'fixture'}}]};
 state.activeMode='heart';state.activeSession=session;
 const originals=manager.managementTargetsForSession(session);const before=JSON.stringify(session);
 const expected={strips:['heart-strip','heart-strip-image'],fireflies:['heart-firefly'],postending:['heart-voice'],heart:['heart-voice','heart-scenario'],language:[]};
 for(const [route,types] of Object.entries(expected)){
  prefs.workspace.route=route;state.activeSession.view='seasons';
  const scope=prefs.workspaceManagementScope(session,originals);assert.deepEqual(scope.targets.map(i=>i.type),types);assert.equal(scope.wholeCategory,false);
  if(route==='postending')assert.equal(scope.targets[0].id,'p');
  if(route==='heart')assert.equal(scope.targets[0].id,'s');
  manager.renderContentManager();assert.doesNotMatch(f.body.innerHTML,/data-rmt-action="manage-delete-category"|data-rmt-action="manage-regenerate-category"/);
  if(route==='strips'){assert.match(f.body.innerHTML,/data-rmt-manage-type="heart-strip-image"/);assert.match(f.body.innerHTML,/data-rmt-manage-id="d"/);}
 }
 assert.equal(JSON.stringify({...session,view:JSON.parse(before).view}),before);assert.equal(f.requests.length,0);
});
