import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/r847Host.mjs';
import * as song from '../src/modes/themeSong.js';
import * as songContract from '../src/core/themeSongContract.js';
import * as songView from '../src/ui/themeSongView.js';
import * as travel from '../src/modes/travel.js';
import * as travelView from '../src/ui/travelView.js';
import * as client from '../src/generation/client.js';
import * as cache from '../src/core/cache.js';
import * as context from '../src/core/context.js';
import * as C from '../src/core/constants.js';
import * as incremental from '../src/core/incremental.js';
import {state} from '../src/core/state.js';
const memory={chatId:'audit-a',archiveRevision:'audit-r',characterName:'林舟',userName:'小月',memories:[]};
const lyrics='[Verse 1]\n风把回声留在窗外\n每一个名字带着微光走来\n[Chorus]\n让不同的声音成为一片海\n我们把歌唱给尚未抵达的未来\n[Outro]\n回声慢慢落下\n[End]';
const songRaw={title:'微光同声',vocalDescription:'多声部轮唱，副歌合唱。',styleDescription:'钢琴与弦乐交织的群像抒情曲。',stylePrompt:'Ensemble vocals, alternating voices, piano and strings, group chorus, 80 BPM',lyrics};
const letter='此刻站在山顶，眼前的白雪落在山脊，我把安静的风写进这张寄给你的明信片。';
function loc(id='F1', extra={}) {return {id,kind:'far',name:'雪峰观景台',region:'远方',basis:'推演',summary:'眼前是雪山。',sceneTheme:'mountain',sourceMemoryIds:[],sourceMemoryAnchor:'',
 keepsake:{kind:'postcard',title:'峰顶来信',body:letter,closing:'林舟',tone:'paper'},...extra};}
const normalize=(rows,options={})=>travel.normalizeTravel({locations:rows},memory,{...options});
const picture=(item)=>travelView.travelPostcardHtml(item,{mapTheme:'neutral'},{recipient:'小月'});
async function seed(f, mode, session){const origin=context.captureTaskOrigin(f.ctx,f.liveBank.archiveRevision);await cache.commitSession(mode,session,f.liveBank.chatId,origin);state.runtimeSessionCache.clear();await cache.ensureCacheHydrated(f.ctx);await f.open(mode);}

test('ensemble is a local fourth voice, with no invented singer from provider',()=>{
 assert.deepEqual(songContract.SONG_VOICES,{char:'角色独唱',duet:'双人合唱',narrator:'旁观者演唱',ensemble:'群像'});
 const plan=song.createThemeSongPlan({voice:'ensemble'},memory);
 const result=song.normalizeGeneratedSong({...songRaw,voice:'duet',singer:'另一个人',sourceMemoryIds:['M999']},plan,memory);
 assert.equal(result.voice,'ensemble');assert.equal(result.singer,'群像');assert.deepEqual(result.sourceMemoryIds,[]);
 const safe=song.validateThemeSongPlan(plan,memory);assert.match(song.themeSongPrompt(safe,memory),/群像演唱/);assert.match(song.themeSongPrompt(safe,memory),/不凭空新增/);
});
for(const [voice,singer] of [['char','林舟'],['duet','林舟 / 小月'],['narrator','旁观者']])test('old voice is unchanged: '+voice,()=>{
 const plan=song.validateThemeSongPlan(song.createThemeSongPlan({voice},memory),memory);assert.equal(plan.singer,singer);assert.doesNotMatch(song.themeSongPrompt(plan,memory),/群像演唱/);
});
for(const language of ['zh','ja','en','ko','custom'])test('ensemble generates, persists, reopens and exports '+language,async t=>{
 const f=await fixture(t);await f.open('themeSong');const old=await f.persisted();f.setResponse(songRaw);
 const got=await client.generateMode('themeSong',{background:true,songOptions:{voice:'ensemble',language,customLanguage:'粤语'}});assert.ok(got,JSON.stringify(f.notices));
 const saved=await f.persisted();const track=saved.themeSong.songs[0];assert.equal(track.voice,'ensemble');assert.equal(track.singer,'群像');assert.equal(track.language,language);
 assert.equal(f.requests.length,1);assert.match(JSON.stringify(f.requests[0]),/群像演唱/);assert.deepEqual(saved.phone,old.phone);assert.deepEqual(saved.cabinet,old.cabinet);
 state.runtimeSessionCache.clear();await cache.ensureCacheHydrated(f.ctx);await f.open('themeSong');assert.equal(state.activeSession.songs[0].voice,'ensemble');
 assert.equal(songContract.themeSongExport(track,'lyrics'),lyrics);assert.match(songContract.themeSongExport(track),/群像/);
});
test('ensemble selection is present without a view rewrite; view switch sends nothing',async t=>{
 const f=await fixture(t);await f.open('themeSong');assert.match(f.body.innerHTML,/<option value="ensemble"[^>]*>群像<\/option>/);
 const before=await f.persisted();await songView.handleThemeSongAction('view-format');await songView.handleThemeSongAction('view-read');assert.equal(f.requests.length,0);assert.deepEqual(await f.persisted(),before);
});
test('failed ensemble can resume its own original plan without changing successful lyrics',async t=>{
 const f=await fixture(t);await f.open('themeSong');f.setResponse(songRaw);await client.generateMode('themeSong',{background:true,songOptions:{voice:'char'}});const old=(await f.persisted()).themeSong.songs[0];
 f.setResponse({...songRaw,lyrics:'unfinished'});await client.generateMode('themeSong',{background:true,songOptions:{voice:'ensemble'}});const draft=cache.loadGenerationRecovery('themeSong',f.ctx);assert.equal(draft.operation.themeSongPlan.voice,'ensemble');
 f.setResponse(songRaw);await client.continueSavedGeneration('themeSong',{songOptions:{voice:'duet'}});const tracks=(await f.persisted()).themeSong.songs;
 assert.deepEqual(tracks[0],old);assert.equal(tracks[1].voice,'ensemble');assert.equal(f.requests.length,3);
});
test('ensemble event still requires the selected current-memory source',async t=>{
 const f=await fixture(t);f.setResponse(songRaw);const got=await client.generateMode('themeSong',{songOptions:{voice:'ensemble',subject:'event',eventId:'M001'},background:true});
 assert.ok(got,JSON.stringify(f.notices));const track=(await f.persisted()).themeSong.songs[0];assert.deepEqual(track.sourceMemoryIds,['M001']);assert.equal(track.sourceMemoryAnchor,'庭院');
 await client.generateMode('themeSong',{songOptions:{voice:'ensemble',subject:'event',eventId:'M999'},background:true});assert.equal(f.requests.length,1);
});
test('historical ensemble stays with that archive; read-only still cannot generate',async t=>{
 const f=await fixture(t);const opts=await f.historical('themeSong');f.setResponse(songRaw);await client.generateMode('themeSong',{...opts,songOptions:{voice:'ensemble'},background:true});
 assert.equal((await f.persisted()).themeSong,undefined);assert.equal((await f.persisted(f.bEntry)).themeSong.songs[0].voice,'ensemble');assert.doesNotMatch(JSON.stringify(f.requests),/CARD_A_ONLY/);
 state.activeArchiveReadOnly=true;await songView.handleThemeSongAction('generate');assert.equal(f.requests.length,1);
});
test('ensemble late response cannot cross a changed archive revision',async t=>{
 const f=await fixture(t);f.setResponse(songRaw);const wait=f.pauseProvider();const pending=client.generateMode('themeSong',{songOptions:{voice:'ensemble'},background:true});await wait.ready;
 f.ctx.chatMetadata[C.MEMORY_KEY].archiveRevision='changed';wait.release();await pending;assert.equal((await f.persisted()).themeSong,undefined);
});

test('first batch rejects copied full postcards with new IDs and decorative titles',()=>{
 const a=loc(),b=loc('F2',{name:'另一张寄页',keepsake:{...loc().keepsake,title:'新标题'}});const result=normalize([a,b]);assert.equal(result.locations.length,1);assert.equal(result.locations[0].id,'F1');
});
test('normalizing whitespace does not replace the accepted original prose',()=>{
 const a=loc(),b=loc('F2',{keepsake:{...loc().keepsake,body:'\n'+letter.replaceAll('，','，\n')+'\n'}});const result=normalize([a,b]);assert.equal(result.locations.length,1);assert.equal(result.locations[0].keepsake.body,letter);
});
test('whitespace comparison preserves meaningful Latin word boundaries',()=>{
 const card=body=>loc('F1',{keepsake:{...loc().keepsake,body}});
 assert.notEqual(travel.travelPostcardContentKey(card('We are nowhere.')),travel.travelPostcardContentKey(card('We are now here.')));
 assert.equal(travel.travelPostcardContentKey(card('I miss\nyou.')),travel.travelPostcardContentKey(card('I miss you.')));
});
test('different complete bodies remain distinct even at one place',()=>{
 const a=loc(),b=loc('F2',{keepsake:{...loc().keepsake,body:letter+'雪渐渐停了，风也安静下来。'}});assert.equal(normalize([a,b]).locations.length,2);
});
test('a shared paragraph alone is not a duplicate',()=>{
 const a=loc(),b=loc('F2',{keepsake:{...loc().keepsake,body:letter+'我换了一支笔，想写下另一种颜色。'}});assert.notEqual(travel.travelPostcardContentKey(a),travel.travelPostcardContentKey(b));
});
test('different sender and different historical reference are not erased by a content key',()=>{
 const a=loc(),b=loc('F2',{keepsake:{...loc().keepsake,closing:'沈砚'}});assert.equal(normalize([a,b]).locations.length,2);
 const history1={...a,basis:'记忆',sourceMemoryIds:['M001'],sourceMemoryAnchor:'一处'};const history2={...history1,sourceMemoryIds:['M002'],sourceMemoryAnchor:'另一处'};
 assert.notEqual(travel.travelPostcardContentKey(history1),travel.travelPostcardContentKey(history2));
});
test('nearby dialogue logic and its repeat visits are untouched',()=>{
 const a={id:'N1',kind:'near',basis:'推演',name:'河岸',summary:'现在听水声。',dialogueLines:['今天慢慢走。']};assert.equal(normalize([a,{...a,id:'N2'}]).locations.length,2);
});
test('incremental merge refuses identical full body with a new ID and region',()=>{
 const a=normalize([loc()]),b=normalize([loc('F2',{name:'寄往远方',region:'另一块区域'})]);const before=JSON.stringify(a);const result=travel.mergeTravelIncremental(a,b);assert.equal(result.added,0);assert.equal(JSON.stringify(a),before);
});
test('new revisit letter appends and replay is idempotent',()=>{
 const a=normalize([loc()]),b=normalize([loc('F2',{keepsake:{...loc().keepsake,body:'今天阳光落在山间小路上，我把风声写给你，纸上的墨迹慢慢晾干。'}})]);
 const added=travel.mergeTravelIncremental(a,b);assert.equal(added.added,1);assert.deepEqual(added.session.locations[0],a.locations[0]);assert.equal(travel.mergeTravelIncremental(added.session,b).added,0);
});
test('legacy postcard alias compares to a modern canonical keepsake',()=>{
 const a=loc();const b={...loc('F2'),keepsake:null,postcard:{...a.keepsake,postmark:'旧邮戳'}};
 assert.equal(travel.travelPostcardContentKey(a),travel.travelPostcardContentKey(b));assert.equal(travel.visibleTravelLocations([a,b]).length,1);
});
test('old duplicate records are preserved in cache data and only grouped in the route view',()=>{
 const a=loc(),b=loc('F2');const rows=[a,b];const old=JSON.stringify(rows);
 assert.equal(travel.visibleTravelLocations(rows).length,1);assert.equal(JSON.stringify(rows),old);
 const stored=travel.normalizeTravel({travelVersion:C.TRAVEL_SESSION_VERSION,locations:rows},memory,{trustedStored:true});assert.equal(stored.locations.length,2);
 const result=travel.mergeTravelIncremental(stored,normalize([loc('F3',{keepsake:{...a.keepsake,body:letter+'天色在慢慢变亮。'}})]));assert.equal(result.session.locations.length,3);assert.deepEqual(result.session.locations.slice(0,2),stored.locations);
});
test('capacity remains twelve, no silent eviction',()=>{
 const rows=Array.from({length:12},(_,i)=>loc('F'+i,{keepsake:{...loc().keepsake,body:letter+String(i)}}));const old=normalize(rows);
 const more=normalize([loc('F13',{keepsake:{...loc().keepsake,body:letter+'另一封信'}})]);assert.equal(travel.mergeTravelIncremental(old,more).added,0);assert.equal(old.locations.length,12);
});
test('fake history remains rejected before postcard de-duplication',()=>{
 const fake=loc('F1',{basis:'记忆',sourceMemoryIds:['M999'],sourceMemoryAnchor:'伪造'});assert.equal(normalize([fake],{allowPartial:true}).locations.length,0);
 const fake2=loc('F2',{keepsake:{...loc().keepsake,body:'去年我们一起来到这里，已经一起买了这座房子。'}});assert.equal(normalize([fake2],{allowPartial:true}).locations.length,0);
});

const scenes=[
 ['city name is not ocean',loc('F1',{name:'上海雪峰观景台',region:'上海'}),'mountain'],
 ['visible letter outweighs a wrong enum',loc('F1',{name:'远方寄语',region:'旅途中',summary:'站在这里写信。',sceneTheme:'city'}),'mountain'],
 ['unrelated metaphor does not choose sea',loc('F1',{keepsake:{...loc().keepsake,body:'今夜站在雪山上，眼前是山脊。想起海边的风。'}}),'mountain'],
 ['two conflicting real landscapes use neutral artwork',loc('F1',{name:'海港码头'}),'neutral'],
 ['unknown landscape does not borrow whole-map scifi',loc('F1',{name:'远方',summary:'此刻写下这封问候。',sceneTheme:'neutral',keepsake:{...loc().keepsake,title:'给你的信',body:'今天在这里给你写几句话，愿你此刻安好。'}}),'neutral'],
 ['forest current scene',loc('F1',{name:'森林步道',summary:'眼前是树林。',keepsake:{...loc().keepsake,title:'林间',body:'现在走在森林步道上，树影落在纸张上。'}}),'forest'],
];
for(const [name,item,expected]of scenes)test('postcard visual selection: '+name,()=>{
 assert.equal(travel.travelPostcardSceneProfile(item,'scifi').theme,expected);assert.match(picture(item),new RegExp('data-rmt-postcard-theme="'+expected+'"'));
});
test('picture and text use same current keepsake, not stale postcard compatibility data',()=>{
 const item=loc('F1',{postcard:{title:'旧海边',body:'海浪拍岸。',closing:'旧署名',tone:'ocean'}});const before=JSON.stringify(item),html=picture(item);
 assert.ok(html.includes(letter));assert.ok(!html.includes('海浪拍岸'));assert.match(html,/data-rmt-postcard-theme="mountain"/);assert.equal(JSON.stringify(item),before);
});
test('no automatic snowcap for ordinary mountains, no lighthouse without source mention',()=>{
 const summer=loc('F1',{summary:'白天走在群山间。',name:'山顶',keepsake:{...loc().keepsake,title:'夏日',body:'午后的阳光落在山顶，绿色山脊一直延伸到远处。'}});
 assert.doesNotMatch(picture(summer),/class="pc-snow"/);assert.match(picture(loc()),/class="pc-snow"/);
 const lake=loc('F2',{name:'湖畔',summary:'湖面很平静。',keepsake:{...loc().keepsake,title:'湖畔寄页',body:'午后坐在湖边，眼前的湖水很平静，想把这份安静写给你。'}});
 assert.equal(travel.travelPostcardSceneProfile(lake).lighthouse,false);assert.equal(travel.travelPostcardSceneProfile({...lake,summary:'海边灯塔亮着。'}).lighthouse,true);
});
test('night illustration has no daytime birds; negated snow is not drawn',()=>{
 const night=loc('F1',{name:'山顶',summary:'山脊没有雪。',keepsake:{...loc().keepsake,title:'夜里的信',body:'今夜走在山脊，月光落在纸上。'}});const html=picture(night);
 assert.match(html,/data-rmt-scene-time="night"/);assert.doesNotMatch(html,/class="pc-bird"|class="pc-snow"/);
});
test('illustration is deterministic across IDs; a new letter can change layout',()=>{
 const a=loc(),b=loc('different-id');assert.equal(picture(a),picture(b));
 const fresh=loc('F2',{keepsake:{...a.keepsake,body:letter+'太阳升起来了。'}});assert.notEqual(picture(a),picture(fresh));
});
test('all model strings remain inert and supplied SVG / class / coordinates do not execute',()=>{
 const item=loc('evil',{name:'<img src=x onerror=bad()>',sceneTheme:'"><script>bad()</script>',summary:'山顶',keepsake:{...loc().keepsake,body:'<script>bad()</script> 山顶的字迹',tone:'" onclick="bad'}});const html=picture(item);
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|<img src=x|onclick=/);assert.match(html,/tone-paper/);
});

test('route reader uses the same visible IDs for map, list, detail and counts without mutating storage',async t=>{
 const f=await fixture(t);const rows=[loc('F1'),loc('F2')];const s={...normalize([rows[0]]),locations:rows,chatId:f.liveBank.chatId,archiveRevision:f.liveBank.archiveRevision,selectedLocationId:'F2'};
 await seed(f,'travel',s);const before=await f.persisted();travelView.renderTravel();assert.match(f.body.innerHTML,/<b>1<\/b> 远方/);assert.equal(travelView.selectedTravelLocation().id,'F1');
 assert.doesNotMatch(f.body.innerHTML,/data-rmt-travel-location="F2"/);assert.deepEqual(await f.persisted(),before);
});
test('actual fresh travel generation saves one copy and reopening preserves prose; no extra request',async t=>{
 const f=await fixture(t);const old=await f.persisted();f.setResponse({locations:[loc(),loc('F2',{name:'另一张'})]});
 const got=await client.generateMode('travel',{background:true});assert.ok(got,JSON.stringify(f.notices));assert.equal(f.requests.length,1);const saved=await f.persisted();assert.equal(saved.travel.locations.length,1);assert.equal(saved.travel.locations[0].keepsake.body,letter);assert.deepEqual(saved.phone,old.phone);
 state.runtimeSessionCache.clear();await cache.ensureCacheHydrated(f.ctx);await f.open('travel');assert.equal(state.activeSession.locations.length,1);assert.equal(f.requests.length,1);
});
test('actual revisit suppresses a duplicate but adds a genuinely new letter without rewriting old content',async t=>{
 const f=await fixture(t);const s=incremental.stampIncrementalCoverage(normalize([loc()]),null,f.liveBank,'mode',['M001'],1);await seed(f,'travel',s);const before=(await f.persisted()).travel.locations[0];
 f.setResponse({locations:[loc('F2',{name:'另一个标题'})]});assert.ok(await client.generateMode('travel',{background:true}),JSON.stringify(f.notices));assert.equal((await f.persisted()).travel.locations.length,1);
 f.setResponse({locations:[loc('F3',{keepsake:{...loc().keepsake,body:'今夜站在雪山上，月光沿着山脊落下来，我用另一张纸记下不同的心情。'}})]});assert.ok(await client.generateMode('travel',{background:true}),JSON.stringify(f.notices));
 const saved=await f.persisted();assert.equal(saved.travel.locations.length,2);assert.deepEqual(saved.travel.locations[0],before);assert.equal(f.requests.length,2);
});
test('travel failed save replays accepted segment with zero additional provider sends',async t=>{
 const f=await fixture(t);f.setResponse({locations:[loc()]});f.failCompletedSave('travel',s=>s?.locations?.length);
 await client.generateMode('travel',{background:true});assert.equal(f.requests.length,1);assert.equal((await f.persisted()).travel,undefined);assert.ok(cache.loadGenerationRecovery('travel',f.ctx));
 f.failCompletedSave('');await client.continueSavedGeneration('travel');assert.equal(f.requests.length,1);assert.equal((await f.persisted()).travel.locations.length,1);
});
test('travel revision change rejects late write without affecting another module',async t=>{
 const f=await fixture(t);const old=await f.persisted();f.setResponse({locations:[loc()]});const wait=f.pauseProvider();const pending=client.generateMode('travel',{background:true});await wait.ready;
 f.ctx.chatMetadata[C.MEMORY_KEY].archiveRevision='changed';wait.release();await pending;const saved=await f.persisted();assert.equal(saved.travel,undefined);assert.deepEqual(saved.phone,old.phone);
});

const baselineFixtures = JSON.parse((await import('node:fs')).readFileSync(new URL('./helpers/r8414-baseline-fixtures.json',import.meta.url),'utf8'));
for(const [name,fixtureData]of Object.entries(baselineFixtures.legacy))test('actual r84.13 travel journal resumes in this candidate: '+name,async t=>{
 const f=await fixture(t);const saved=structuredClone(fixtureData.saved);saved.__generationRecoveryV1.travel.createdAt=Date.now();saved.__generationRecoveryV1.travel.updatedAt=Date.now();
 Object.assign(f.liveCache,structuredClone(saved));f.ctx.chatMetadata[C.CACHE_KEY]=structuredClone(saved);f.records.get(f.aEntry.entryId).cache=structuredClone(saved);state.runtimeSessionCache.clear();await f.open('travel');
 f.setResponse(fixtureData.response);await client.continueSavedGeneration('travel');const after=await f.persisted();assert.equal(after.travel.locations.length,2,JSON.stringify(f.notices));assert.equal(f.requests.length,name==='validated'?0:1);assert.deepEqual(after.travel.locations[0],saved.travel.locations[0]);assert.equal(cache.loadGenerationRecovery('travel',f.ctx),null);
});
