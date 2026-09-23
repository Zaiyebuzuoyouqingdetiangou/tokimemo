import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as targets from '../src/core/cgTargets.js';
import * as patch from '../src/core/cgImagePatch.js';
import * as images from '../src/generation/imageGeneration.js';
import * as language from '../src/ui/languageView.js';
import * as editor from '../src/ui/cgPromptEditor.js';
import * as constants from '../src/core/constants.js';
import * as text from '../src/core/text.js';
import {state} from '../src/core/state.js';
import {normalizeHeart,makeHeartSession} from '../src/modes/heart.js';
import * as expanded from '../src/ui/expandedCgView.js';
import {normalizeEndingRouteDetail,normalizeEndingConfessionReplays} from '../src/modes/ending.js';
const image=(name,time=1)=>({url:`/user/images/${name}.png`,prompt:'saved visual prompt',provider:'baibai-image',generatedAt:time});
const memory={characterName:'甲',userName:'乙',memories:[{id:'M001',title:'雨夜约定',anchors:['雨夜约定'],summary:'约定仍在。'}]};
function draw(session,input,name){
 const descriptor=targets.describeExpandedCgTarget(session,input);assert.ok(descriptor);
 const {item}=targets.expandedCgItem(session,descriptor);
 const result=patch.applyCgImagePatch(session,{version:1,mode:session.kind,itemId:item.id,expectedSignature:patch.cgItemSignature(item),image:image(name)});
 assert.equal(result.status,'applied');return {session:result.session,descriptor};
}
test('expanded slots accept safe encoded Chinese paths using the same stored-file rule and reject traversal',()=>{
 const url='/user/images/%E5%B2%9A.png';
 assert.equal(patch.savedLocalImagePath(url),url);
 assert.equal(targets.normalizeLocalCgSlots({visual:{cgImage:{...image('x'),url}}}).visual.cgImage.url,url);
 for(const bad of ['/user/images/%2e%2e/a.png','/user/images/%252e.png','/user/images/a%2fb.png','https://other.invalid/user/images/a.png','/user/images/a.png?x=1'])
   assert.equal(targets.normalizeLocalCgSlots({visual:{cgImage:{...image('x'),url:bad}}}).visual,undefined);
});
test('initial drama image draft excludes script and explicit reconceiving retains source prose',()=>{
 const session={kind:'heart',voiceDramas:[{id:'V1',title:'春风',setting:'桂花树下的石阶',visualTone:'温暖午后',script:[{speaker:'char',text:'ONLY_SOURCE_DIALOGUE'}]}]};
 const descriptor=targets.describeExpandedCgTarget(session,{kind:'heart-voice',containerId:'V1'});
 const item=targets.expandedCgItem(session,descriptor).item;
 const initial=images.cgImagePromptForItem(item,'','nai5-natural');
 assert.match(initial,/桂花树下/);assert.doesNotMatch(initial,/ONLY_SOURCE_DIALOGUE|char:/);
 assert.match(images.buildCgReconceptPrompt(item,{name1:'乙',name2:'甲'},'heart',null,'nai5-natural'),/ONLY_SOURCE_DIALOGUE/);
});
test('each of three epilogue scenes has an independent image and original prose remains unchanged',()=>{
 let session={kind:'ending',endings:[{id:'E1',title:'归途',subtitle:'相守',endingScene:'终章原文',epilogue:{title:'之后',scenes:[0,1,2].map(i=>({title:`场景${i}`,text:`ONLY_FULL_PROSE_${i}`}))}}]};
 const prose=structuredClone(session.endings[0].epilogue);
 const descriptors=[];
 for(let i=0;i<3;i++) {const result=draw(session,{kind:'ending-epilogue-scene',containerId:'E1',slot:`scene:${i}`},`scene-${i}`);session=result.session;descriptors.push(result.descriptor);}
 assert.deepEqual(session.endings[0].epilogue,prose);
 session.endings[0]={...session.endings[0],...targets.normalizeLocalCgSlots(session.endings[0])};
 descriptors.forEach((descriptor,i)=>{const {item}=targets.expandedCgItem(session,descriptor);assert.equal(item.cgImage.url,image(`scene-${i}`).url);assert.doesNotMatch(images.cgImagePromptForItem({...item,cgImage:null},'','nai5-natural'),/ONLY_FULL_PROSE/);});
 session.endings[0].epilogue.scenes[2].text='已修改';
 assert.equal(targets.expandedCgItem(session,descriptors[2]),null);
 assert.ok(targets.expandedCgItem(session,descriptors[0]));
});
test('confession replay can draw and normalize/reopen its separate image',()=>{
 let session={kind:'ending',confessionReplays:[{id:'C1',title:'雨夜约定',scene:'雨夜约定'.repeat(40),confessionText:'雨夜约定'.repeat(20),sourceMemoryIds:['M001'],sourceMemoryAnchor:'雨夜约定'}]};
 const result=draw(session,{kind:'ending-confession',containerId:'C1'},'confession');
 session={...result.session,confessionReplays:normalizeEndingConfessionReplays(result.session.confessionReplays,memory)};
 assert.equal(targets.expandedCgItem(session,result.descriptor).item.cgImage.url,image('confession').url);
});
test('one portrait survives changing greeting category and appending lines; old per-line images remain browsable',()=>{
 let session=normalizeHeart({kind:'heart',greetings:{morning:['早安'],night:['晚安']},languagePortrait:{scenePrompt:images.DEFAULT_LANGUAGE_PORTRAIT}},memory);
 const result=draw(session,{kind:'heart-portrait',containerId:'language'},'portrait');session=result.session;
 const old={category:'morning',lineHash:targets.heartLanguageLineHash('morning','旧早安'),scenePrompt:'旧场景',visual:{sourceHash:'old',cgImage:image('old-line')}};
 session.languageVisuals=[old];
 const reopened=normalizeHeart(makeHeartSession({...session,greetings:{morning:['新的早安'],night:['晚安','再一条']}},session),memory);
 assert.equal(targets.expandedCgItem(reopened,result.descriptor).item.cgImage.url,image('portrait').url);
 assert.match(language.legacyLanguageGalleryHtml(reopened),/old-line\.png/);
 assert.equal(reopened.languageVisuals.length,1);
 const metadata=editor.portraitCgMetadata({cgPortrait:true},{characters:[{role:'char',name:'甲',tag:'black hair'},{role:'user',name:'乙',tag:'long hair'}]});
 assert.deepEqual(metadata.characters.map(row=>row.role),['char']);
});
test('changing an old language scene keeps more than five prior scene references through actual save callback',async()=>{
 const source=await readFile(new URL('../src/generation/imageGeneration.js',import.meta.url),'utf8');
 const start=source.indexOf('export async function prepareLanguageCgTarget('),end=source.indexOf('\nexport const DEFAULT_LANGUAGE_PORTRAIT',start);
 const old={scenePrompt:'current',category:'morning',lineHash:targets.heartLanguageLineHash('morning','早安'),visual:{sourceHash:'s',cgImage:image('current')},previousSceneVisuals:Array.from({length:7},(_,i)=>({scenePrompt:`old${i}`,visual:{sourceHash:`s${i}`,cgImage:image(`old${i}`)}}))};
 const session={kind:'heart',chatId:'c',archiveRevision:'r',greetings:{morning:['早安']},languageVisuals:[old]};
 const deps={archive_library:{requireWritableArchiveAction:()=>true},sanitizeCgVisualText:x=>x,runtimeState:{activeMode:'heart',activeSession:session},core_constants:constants,core_text:text,cg_targets:targets,
 core_context:{currentCharacterGuard:()=>({}),getChatId:()=> 'c',comparableChatId:x=>x,captureTaskOrigin:()=>({})},archive_repository:{requireArchive:()=>({archiveRevision:'r'})},
 core_cache:{commitSessionMutation:async(m,c,o,mutate)=>mutate(structuredClone(session))}};
 const prepare=new Function(...Object.keys(deps),`${source.slice(start,end).replace(/^export /,'')};return prepareLanguageCgTarget;`)(...Object.values(deps));
 await prepare({category:'morning',line:'早安',scenePrompt:'new'});
 assert.equal(session.languageVisuals[0].previousSceneVisuals.length,8);
 assert.equal(session.languageVisuals[0].previousSceneVisuals[0].visual.cgImage.url,image('old0').url);
});
test('history counter displays on image and read-only switching never edits saved records',async()=>{
 const item={id:'A1',title:'回忆',cgImage:image('v3',3),cgImageHistory:[image('v1',1),image('v2',2)]};
 const html=images.cgImageLayerHtml(item);
 assert.match(html,/data-rmt-cg-history-controls/);assert.match(html,/3 \/ 3/);
 const saved={activeSession:state.activeSession,activeMode:state.activeMode,activeArchiveSnapshot:state.activeArchiveSnapshot};
 const session={kind:'album',entries:[item]};const before=structuredClone(session);
 const imageElement={src:item.cgImage.url,getAttribute(){return this.src;}};const count={};
 const controls={dataset:{rmtCgItem:'A1'},parentElement:{querySelector:()=>imageElement},querySelector:()=>count};
 const button={dataset:{rmtCgHistoryStep:'-1'},closest:()=>controls};
 Object.assign(state,{activeSession:session,activeMode:'album',activeArchiveSnapshot:{entryId:'readonly'}});
 try{assert.equal(await images.handleCgHistorySwitch(button),true);assert.equal(imageElement.src,image('v2').url);assert.equal(count.textContent,'2 / 3');assert.deepEqual(session,before);}finally{Object.assign(state,saved);}
});
test('live history switching commits one guarded image pointer and preserves unrelated content without model calls',async()=>{
 const source=await readFile(new URL('../src/generation/imageGeneration.js',import.meta.url),'utf8');
 const start=source.indexOf('export async function restoreSelectedCgImageVersion('),end=source.indexOf('\nexport function handleOverlayMediaError',start);
 const session={kind:'album',chatId:'c',archiveRevision:'r',entries:[{id:'A1',title:'old',cgImage:image('current',2),cgImageHistory:[image('older')]}]};
 const target={mode:'album',session,itemId:'A1',origin:{},signature:patch.cgItemSignature(session.entries[0])};
 let conflict=false,calls=0;
 const deps={archive_library:{requireWritableArchiveAction:()=>true},cgItemInSession:patch.cgItemInSession,isCgImageDrawing:()=>false,image_patch:patch,cgItemSignature:patch.cgItemSignature,
 assertCgImageTargetCurrent:()=>{},core_context:{currentCharacterGuard:()=>({}),getChatId:()=> 'c',isCurrentTaskOrigin:()=>true},runtimeState:{activeSession:session},
 renderCurrentCgMode:()=>{},core_cache:{commitSessionMutation:async(m,c,o,mutate)=>{calls++;const latest=structuredClone(session);latest.unrelated='preserved concurrent note';if(conflict)latest.entries[0].title='changed';return mutate(latest);}}};
 const restore=new Function(...Object.keys(deps),`${source.slice(start,end).replace(/^export /,'')};return restoreSelectedCgImageVersion;`)(...Object.values(deps));
 assert.equal(await restore(image('older').url,target,{confirm:false}),true);
 assert.equal(session.entries[0].cgImage.url,image('older').url);assert.equal(session.unrelated,'preserved concurrent note');
 assert.equal(session.entries[0].cgImageHistory[0].url,image('current').url);assert.equal(calls,1);
 target.signature=patch.cgItemSignature(session.entries[0]);conflict=true;const before=structuredClone(session);
 assert.equal(await restore(image('current').url,target,{confirm:false}),undefined);assert.deepEqual(session,before);
});

test('regenerating ending prose retains old source images and histories in a visible archive',()=>{
 let session={kind:'ending',endings:[{id:'E1',title:'归途',subtitle:'相守',endingScene:'旧终章',epilogue:{title:'之后',scenes:[{title:'旧段落',text:'旧故事'}]}}]};
 session=draw(session,{kind:'ending-ending',containerId:'E1'},'old-ending').session;
 session=draw(session,{kind:'ending-epilogue-scene',containerId:'E1',slot:'scene:0'},'old-scene').session;
 const original=structuredClone(session.endings[0]);
 const result=normalizeEndingRouteDetail({endingScene:'新终章'.repeat(120),epilogue:{scenes:[0,1,2].map(i=>({title:'新段落'+i,text:'新故事'.repeat(40)}))}},session.endings[0]);
 assert.deepEqual(session.endings[0],original,'normalization must not mutate prior archive');
 assert.equal(result.visuals.ending,undefined);assert.equal(result.visuals['scene:0'],undefined);
 assert.equal(result.previousCgVisuals.length,2);
 const html=expanded.previousExpandedImagesHtml({endings:[result]},{kind:'ending-ending',containerId:'E1'});
 assert.match(html,/old-ending.png/);assert.match(html,/old-scene.png/);
});
