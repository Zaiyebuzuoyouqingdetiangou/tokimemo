import test from 'node:test';
import assert from 'node:assert/strict';
import * as format from '../src/core/cgPromptFormat.js';
import * as policy from '../src/generation/cgPromptPolicy.js';
import * as images from '../src/generation/imageGeneration.js';
import * as appearance from '../src/generation/cgAppearance.js';
import * as patch from '../src/core/cgImagePatch.js';
import * as context from '../src/core/context.js';
import * as constants from '../src/core/constants.js';
import * as settings from '../src/core/settings.js';
import * as client from '../src/generation/client.js';
import * as recovery from '../src/generation/recovery.js';
import * as cache from '../src/core/cache.js';
import * as overlay from '../src/ui/overlay.js';
import * as controls from '../src/ui/cgFormatControl.js';
import { fixture } from './helpers/r847Host.mjs';
import { state } from '../src/core/state.js';
const scene='2people, 1boy, 1girl, gardening, seedling, watering can, courtyard, wide shot, warm light, no text';
const flat='1boy, black hair, green eyes, left, holding seedling, 1girl, silver hair, brown eyes, right, watering flowers, courtyard, wide shot, warm light, no text';
const natural='In a sunlit courtyard, the black-haired man on the left holds a seedling while the silver-haired woman on the right waters it. Show both adults and the watering can in a wide shot, without text.';
const meta=fmt=>({promptFormat:fmt,sceneTags:scene,flatPrompt:fmt==='nai45-tags'?flat:natural,characters:[{role:'char',name:'林舟',tag:'black hair, green eyes',nl:'中文旧描述不应覆盖编辑结果'},{role:'user',name:'小月',tag:'silver hair, brown eyes',nl:''}]});
function provider(t, supportsCharacters) {
 const before=Object.getOwnPropertyDescriptor(globalThis,'STBaiBaiImage'),location=Object.getOwnPropertyDescriptor(globalThis,'location');const calls=[];
 t.after(()=>{for(const [k,d] of [['STBaiBaiImage',before],['location',location]]){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}});
 globalThis.location={href:'tauri://localhost/'};
 globalThis.STBaiBaiImage={apiVersion:1,capabilities:{generate:true,saveToGallery:true},getBackendStatus:()=>({configured:true,supportsCharacters}),generate:async r=>{calls.push(structuredClone(r));return {path:'/user/images/fixture/format.png'}}};return calls;
}
for(const fmt of format.CG_PROMPT_FORMATS)for(const multi of [false,true])test(`real public provider and send preview agree: ${fmt}, separate characters=${multi}`,async t=>{
 const calls=provider(t,multi),m=meta(fmt),s=fmt==='nai45-tags'?scene:natural;
 const expected=images.cgEditorSendPreview('album',{},s,m,fmt);
 await images.invokeImageGeneration(s,{name2:'林舟'},{promptMetadata:m});assert.equal(calls.length,1);
 const r=calls[0];assert.equal(r.prompt,expected.prompt);assert.equal(r.nl,expected.nl);assert.deepEqual(r.characters,expected.characters);assert.equal(r.model,undefined);assert.equal(r.character,'林舟');
 if(fmt==='nai45-tags')for(const text of [r.prompt,r.nl,...(r.characters||[]).flatMap(c=>[c.tag,c.nl||''])])assert.doesNotMatch(text,/[^\x20-\x7e\r\n]/u);
 assert.match(r.prompt,/courtyard/);assert.match(r.prompt,/seedling/);if(!multi||fmt==='nai5-natural')assert.match(r.prompt,/silver[- ]hair/);
});
for(const count of [1,2,3,4])for(const fmt of format.CG_PROMPT_FORMATS)test(`comic final payload retains ${count} panels with ${fmt}`,async t=>{
 const calls=provider(t,false),item={panelCount:count,panels:Array.from({length:count},()=>({action:'源分镜中文只作生成依据，不能拼回标签'}))};const m=meta(fmt),s=fmt==='nai45-tags'?scene:natural;
 const parts=images.prepareCgSendParts('heart',item,s,m,fmt),expected=images.cgEditorSendPreview('heart',item,s,m,fmt);
 await images.invokeImageGeneration(parts.prompt,{name2:'林舟'},{promptMetadata:parts.metadata});const r=calls[0];
 assert.equal(r.prompt,expected.prompt);assert.equal(r.nl,expected.nl);assert.match(r.prompt,fmt==='nai45-tags'?(count===1?/single panel/:new RegExp(count+'koma')):new RegExp(count+' (panel|vertically)'));
 assert.doesNotMatch(r.prompt,/源分镜|DAILY_COMIC_Q_V1/);assert.equal(format.formatDailyComicPrompt(item,parts.prompt,fmt),parts.prompt);
});
test('invalid tags, mixed Chinese or missing flat fallback never reach provider',async t=>{
 const calls=provider(t,false);
 for(const [s,m] of [['两人在窗边看书',meta('nai45-tags')],[scene,{...meta('nai45-tags'),flatPrompt:'English, 中文'}],[scene,{...meta('nai45-tags'),flatPrompt:''}],[scene,{...meta('nai45-tags'),characters:[{role:'char',name:'甲',tag:'黑发'}]}]]){
  await assert.rejects(images.invokeImageGeneration(s,{name2:'甲'},{promptMetadata:m}),e=>e.code==='RMT_CG_TAG_FORMAT');
 }
 assert.equal(calls.length,0);
});
test('metadata format is local whitelist, legacy signatures unchanged, new format survives deferred patch',()=>{
 const oldLocation=globalThis.location;globalThis.location={href:'tauri://localhost/'};
 try {const legacy={url:'/user/images/old.png',prompt:'旧图',provider:'baibai-image',generatedAt:1};assert.deepEqual(patch.normalizeCgImageRecord(legacy),legacy);
 const s={kind:'album',entries:[{id:'a',desc:'旧回忆',cgImage:legacy}]};const m=meta('nai45-tags');m.comicPanels=2;
 const image={...legacy,url:'/user/images/new.png',prompt:scene,promptMetadata:m};const change={version:1,mode:'album',itemId:'a',expectedSignature:patch.cgItemSignature(s.entries[0]),image};
 const result=patch.applyCgImagePatch(s,change);assert.equal(result.status,'applied');const saved=JSON.parse(JSON.stringify(result.session));assert.equal(saved.entries[0].cgImage.promptMetadata.promptFormat,'nai45-tags');assert.equal(saved.entries[0].cgImage.promptMetadata.comicPanels,2);assert.equal(patch.applyCgImagePatch(saved,change).status,'already-applied');assert.deepEqual(s.entries[0].cgImage,legacy);
 assert.equal(appearance.normalizeCgPromptMetadata({promptFormat:'provider-other-model'}),null);
 const edited=appearance.metadataAfterSceneEdit(m);assert.equal(edited.promptFormat,'nai45-tags');assert.equal(edited.flatPrompt,undefined);assert.equal(edited.sceneTags,'');assert.equal(edited.characters.length,2);
 }finally{globalThis.location=oldLocation}
});
test('confirmed Chinese looks are translation sources only; English known tags stay exact',()=>{
 const e={characters:[{role:'char',name:'林舟',description:'成年男子',knownTag:'黑发，绿眼',knownNl:'不能复制为tag'},{role:'user',name:'小月',knownTag:'silver hair, brown eyes',description:'',knownNl:''}]};const before=JSON.stringify(e),source=appearance.appearanceEvidenceForFormat(e,'nai45-tags');
 assert.equal(JSON.stringify(e),before);assert.equal(source.characters[0].knownTag,'');assert.match(source.characters[0].description,/黑发，绿眼/);assert.equal(source.characters[1].knownTag,'silver hair, brown eyes');
 const raw={imagePrompt:scene,sceneTags:scene,flatPrompt:flat,characters:[{role:'char',tag:'black hair, green eyes'},{role:'user',tag:'silver hair, brown eyes'}]};
 const result=appearance.validateCgPreparedFormat(appearance.normalizeCgPreparedPrompt(raw,source),'nai45-tags');assert.equal(result.promptFormat,'nai45-tags');assert.equal(result.characters[0].name,'林舟');
 assert.throws(()=>appearance.normalizeCgPreparedPrompt({...raw,characters:[{role:'user',tag:'blond hair'}]},source),e=>e.code==='RMT_CG_PROMPT_INVALID');
 assert.throws(()=>appearance.validateCgPreparedFormat({...result,imagePrompt:'中文字'},'nai45-tags'),e=>e.code==='RMT_CG_TAG_FORMAT');
});
test('image re-preparation recipe is selected, legacy default is unchanged in intent, no conflicting Chinese prose in 4.5 output requirements',()=>{
 const e={characters:[]};const p=images.buildCgReconceptPrompt({desc:'在窗边读书'},{name1:'乙',name2:'甲'},'album',e,'nai45-tags');assert.match(p,/英文逗号/);assert.doesNotMatch(p,/可使用自然中文|完整场景自然语言/);assert.match(p,/不改写这条回忆/);
 assert.match(images.buildCgReconceptPrompt({desc:'在窗边读书'},{},'album',e,'nai5-natural'),/优先英文/);
});
test('only exact CG-field segments receive a format instruction; story and authority prompts remain intact',()=>{
 const origin={};policy.bindCgPromptFormat(origin,'nai45-tags');
 for(const [mode,key] of [['album','a:index'],['album','a:album'],['adv','a:index'],['adv','a:event'],['heart','a:strips'],['heart','a:strip']])assert.match(policy.cgPromptForSegment('ORIGINAL',{origin,mode,taskKey:key}),/CG_PROMPT_FORMAT_V1/);
 for(const [mode,key] of [['archive','a:index'],['heart','a:dialogues'],['heart','a:voice:spring'],['album','a:comments'],['adv','a:prose'],['butterfly','a:index'],['ending','a:event']])assert.equal(policy.cgPromptForSegment('ORIGINAL',{origin,mode,taskKey:key}),'ORIGINAL');
 assert.equal(policy.cgPromptForSegment('ORIGINAL',{origin:{},mode:'album',taskKey:'a:index'}),'ORIGINAL');
});
test('new image operation records format, legacy continuation preserves hashes and no image dialect on other operations',()=>{
 const op={kind:'mode',mode:'album'};
 assert.equal(policy.cgRecoveryOperation('album',op,null,'nai45-tags').cgPromptFormat,'nai45-tags');
 assert.deepEqual(policy.cgRecoveryOperation('album',op,{operation:op},'nai45-tags'),op);
 assert.equal(policy.cgRecoveryOperation('album',op,{operation:{...op,cgPromptFormat:'nai45-tags'}},'nai5-natural').cgPromptFormat,'nai45-tags');
 for(const mode of ['heart','archive','ending','butterfly']){const value={kind:'mode',mode};assert.deepEqual(policy.cgRecoveryOperation(mode,value,null,'nai45-tags'),value)}
});
for(const fmt of format.CG_PROMPT_FORMATS)test(`actual request pipeline receives only image-field supplement ${fmt}, one explicit call`,async t=>{
 const f=await fixture(t);const origin=context.captureTaskOrigin(f.ctx,f.liveBank.archiveRevision);policy.bindCgPromptFormat(origin,fmt);f.setResponse({imagePrompt:scene});
 await client.requestValidatedSegment('ORIGINAL_STORY_UNCHANGED','test',{context:f.ctx,contextEnvelope:'',origin,mode:'album',taskKey:'test:index',maxTokens:3000,background:true},x=>x);
 assert.equal(f.requests.length,1);const all=f.requests[0].map(m=>m.content).join('\n');assert.match(all,/ORIGINAL_STORY_UNCHANGED/);assert.match(all,new RegExp('CG_PROMPT_FORMAT_V1 · '+fmt));
 assert.match(all,/不改标题、日期、剧情正文/);
});
test('actual recovery resumes same CG segment locally even after global choice changes',async t=>{
 const f=await fixture(t);settings.updatePluginSettings({cgPromptFormat:'nai45-tags'});let origin=context.captureTaskOrigin(f.ctx,f.liveBank.archiveRevision);
 await client.beginModeRecovery('album',f.ctx,f.liveBank,origin,{operation:{kind:'mode',mode:'album'}});f.setResponse({imagePrompt:scene});
 const args=o=>({context:f.ctx,contextEnvelope:'',origin:o,mode:'album',taskKey:'fixture:index',maxTokens:3000,background:true});
 await client.requestValidatedSegment('BASE', 'test',args(origin),x=>x);assert.equal(f.requests.length,1);
 recovery.detachGenerationRecovery(origin);const existing=cache.loadGenerationRecovery('album',f.ctx);assert.equal(existing.operation.cgPromptFormat,'nai45-tags');
 settings.updatePluginSettings({cgPromptFormat:'nai5-natural'});origin=context.captureTaskOrigin(f.ctx,f.liveBank.archiveRevision);
 await client.beginModeRecovery('album',f.ctx,f.liveBank,origin,{operation:{kind:'mode',mode:'album'},existing});
 const out=await client.requestValidatedSegment('BASE','test',args(origin),x=>x);assert.equal(out.imagePrompt,scene);assert.equal(f.requests.length,1);recovery.detachGenerationRecovery(origin);
});
test('format select changes only local preference, not model profile, journal or provider',async t=>{
 const f=await fixture(t);const before=JSON.stringify(f.ctx.chatMetadata),profile=settings.getPluginSettings(f.ctx).connectionProfileId;
 controls.handleCgFormatChange({target:{matches:s=>s==='[data-rmt-cg-prompt-format]',value:'nai45-tags'}});
 assert.equal(settings.getPluginSettings(f.ctx).cgPromptFormat,'nai45-tags');assert.equal(settings.getPluginSettings(f.ctx).connectionProfileId,profile);assert.equal(JSON.stringify(f.ctx.chatMetadata),before);assert.equal(f.requests.length,0);
 controls.handleCgFormatChange({target:{matches:()=>true,value:'invalid-model'}});assert.equal(settings.getPluginSettings(f.ctx).cgPromptFormat,'nai45-tags');
});
function seedAlbum(f){const item={id:'a',title:'庭院栽花',desc:'两位成年人在院子栽花',imagePrompt:scene,unlocked:true,cgImage:{url:'/user/images/old.png',prompt:'旧图不变',provider:'baibai-image',generatedAt:1}};
 const s={kind:'album',chatId:f.liveBank.chatId,archiveRevision:f.liveBank.archiveRevision,entries:[item],selectedId:'a',page:1,category:'全部'};f.liveCache.album=structuredClone(s);f.ctx.chatMetadata[constants.CACHE_KEY]=structuredClone(f.liveCache);state.runtimeSessionCache.clear();return s;}
test('actual re-preparation uses one text request, never saves looks, alters story or sends images',async t=>{
 const f=await fixture(t);seedAlbum(f);await overlay.openCachedOrGenerate('album');const before=JSON.stringify(f.ctx.chatMetadata),imageBefore=JSON.stringify(state.activeSession);
 f.setResponse({imagePrompt:scene,sceneTags:scene,flatPrompt:flat,characters:[{role:'char',tag:'black hair'},{role:'user',tag:'brown hair'}]});
 const target=images.captureCgImageTarget();const out=await images.reconceiveCgImagePrompt(target,{promptFormat:'nai45-tags'});assert.equal(out.promptFormat,'nai45-tags');assert.equal(f.requests.length,1);assert.equal(JSON.stringify(f.ctx.chatMetadata),before);assert.equal(JSON.stringify(state.activeSession),imageBefore);assert.equal(state.activeCgImageTasks.size,0);
});
test('actual redraw cancellation and mixed-format refusal preserve images and have zero provider sends',async t=>{
 const f=await fixture(t);seedAlbum(f);await overlay.openCachedOrGenerate('album');const calls=provider(t,false),old=JSON.stringify(state.activeSession);globalThis.confirm=()=>false;
 await images.drawSelectedCgImage({promptOverride:scene,promptMetadata:meta('nai45-tags'),promptFormat:'nai45-tags'});assert.equal(calls.length,0);assert.equal(JSON.stringify(state.activeSession),old);
 globalThis.confirm=()=>true;await images.drawSelectedCgImage({promptOverride:'两位角色在院子里',promptMetadata:meta('nai45-tags'),promptFormat:'nai45-tags'});assert.equal(calls.length,0);assert.equal(JSON.stringify(state.activeSession),old);assert.equal(state.activeCgImageTasks.size,0);
});

test('actual confirmed redraw commits exact selected dialect metadata and preserves sibling data',async t=>{
 const f=await fixture(t);seedAlbum(f);await overlay.openCachedOrGenerate('album');const calls=provider(t,false);let confirmations=0;globalThis.confirm=()=>{confirmations++;return true};
 await images.drawSelectedCgImage({promptOverride:scene,promptMetadata:meta('nai45-tags'),promptFormat:'nai45-tags'});
 assert.equal(confirmations,2);assert.equal(calls.length,1);assert.equal(f.requests.length,0);const saved=(await f.persisted()).album.entries[0];assert.equal(saved.cgImage.promptMetadata.promptFormat,'nai45-tags');assert.equal(saved.cgImage.url,'/user/images/fixture/format.png');assert.equal(saved.desc,'两位成年人在院子栽花');assert.equal(state.activeCgImageTasks.size,0);
});
test('format change while request is in flight cannot change captured segment dialect',async t=>{
 const f=await fixture(t);let origin=context.captureTaskOrigin(f.ctx,f.liveBank.archiveRevision);settings.updatePluginSettings({cgPromptFormat:'nai45-tags'});
 await client.beginModeRecovery('album',f.ctx,f.liveBank,origin,{operation:{kind:'mode',mode:'album'}});f.setResponse({imagePrompt:scene});const pending=f.pauseProvider();
 const job=client.requestValidatedSegment('BASE','test',{context:f.ctx,contextEnvelope:'',origin,mode:'album',taskKey:'fixture:index',maxTokens:3000,background:true},x=>x);
 await pending.ready;settings.updatePluginSettings({cgPromptFormat:'nai5-natural'});pending.release();await job;
 assert.match(f.requests[0].map(x=>x.content).join('\n'),/CG_PROMPT_FORMAT_V1 · nai45-tags/);assert.equal(cache.loadGenerationRecovery('album',f.ctx).operation.cgPromptFormat,'nai45-tags');assert.equal(f.requests.length,1);recovery.detachGenerationRecovery(origin);
});
test('actual legacy journal replays identical hashes after new preference is selected',async t=>{
 const f=await fixture(t);let origin=context.captureTaskOrigin(f.ctx,f.liveBank.archiveRevision);
 // A legacy journal has no cgPromptFormat. Explicit existing operation forces the old recipe.
 let handle=await client.beginModeRecovery('album',f.ctx,f.liveBank,origin,{operation:{kind:'mode',mode:'album'}});policy.bindCgPromptFormat(origin,'');f.setResponse({imagePrompt:'legacy scene'});
 await client.requestValidatedSegment('LEGACY','test',{context:f.ctx,contextEnvelope:'',origin,mode:'album',taskKey:'fixture:index',maxTokens:3000,background:true},x=>x);recovery.detachGenerationRecovery(origin);
 const existing=cache.loadGenerationRecovery('album',f.ctx);delete existing.operation.cgPromptFormat;settings.updatePluginSettings({cgPromptFormat:'nai45-tags'});origin=context.captureTaskOrigin(f.ctx,f.liveBank.archiveRevision);
 handle=await client.beginModeRecovery('album',f.ctx,f.liveBank,origin,{operation:{kind:'mode',mode:'album'},existing});
 const out=await client.requestValidatedSegment('LEGACY','test',{context:f.ctx,contextEnvelope:'',origin,mode:'album',taskKey:'fixture:index',maxTokens:3000,background:true},x=>x);assert.equal(out.imagePrompt,'legacy scene');assert.equal(f.requests.length,1);recovery.detachGenerationRecovery(origin);
});
test('late reconceive after archive revision change cannot replace the current draft',async t=>{
 const f=await fixture(t);seedAlbum(f);await overlay.openCachedOrGenerate('album');const target=images.captureCgImageTarget(),before=JSON.stringify(state.activeSession);const pending=f.pauseProvider();
 f.setResponse({imagePrompt:scene,sceneTags:scene,flatPrompt:flat,characters:[]});const job=images.reconceiveCgImagePrompt(target,{promptFormat:'nai45-tags'});const caught=assert.rejects(job,e=>e.name==='AbortError'||e.code==='RMT_CG_TARGET_CHANGED');await pending.ready;f.ctx.chatMetadata[constants.MEMORY_KEY].archiveRevision='new';pending.release();await caught;assert.equal(JSON.stringify(state.activeSession),before);assert.equal(state.activeCgImageTasks.size,0);
});

const generatedEntry={id:'cg-one',title:'庭院栽花',date:'日期未记录',desc:'两人在庭院栽花。',cgDesc:'两人在庭院栽花。',unlocked:true,category:'日常',sourceMemoryIds:['M001'],sourceMemoryAnchor:'庭院',imagePrompt:scene,visualSeed:['庭院','花苗','水壶','人物']};
test('actual ADV index generation persists chosen tags without requesting or changing ADV prose',async t=>{
 const f=await fixture(t);settings.updatePluginSettings({cgPromptFormat:'nai45-tags'});f.setResponse({events:[generatedEntry]});
 const out=await client.generateMode('adv',{background:true});assert.ok(out,JSON.stringify(f.notices));assert.equal(f.requests.length,1);assert.match(f.requests[0].map(m=>m.content).join('\n'),/CG_PROMPT_FORMAT_V1 · nai45-tags/);const saved=(await f.persisted()).adv;assert.equal(saved.events[0].imagePrompt,scene);assert.equal(saved.events[0].adv,null);
});
test('actual standalone strip generation records selected format but keeps source panel text unmodified',async t=>{
 const f=await fixture(t);settings.updatePluginSettings({cgPromptFormat:'nai45-tags'});await overlay.openCachedOrGenerate('heart',{workspaceRoute:'strips'});f.setResponse({dailyStrips:[{id:'new-strip',title:'栽花日常',panelCount:1,panels:[{action:'一起在院子栽花。',charLine:'把水壶给我吧。'}],imagePrompt:scene}]});
 const heart=await import('../src/modes/heart.js');await heart.generateHeartSection('strips');assert.equal(f.requests.length,1);assert.match(f.requests[0].map(m=>m.content).join('\n'),/CG_PROMPT_FORMAT_V1 · nai45-tags/);const saved=(await f.persisted()).heart;assert.equal(saved.dailyStrips[0].imagePrompt,scene);assert.equal(saved.dailyStrips[0].panels[0].charLine,'把水壶给我吧。');
});
test('actual album flow changes ONLY imagePrompt request, not relationship scan or comment prompts',async t=>{
 const f=await fixture(t);settings.updatePluginSettings({cgPromptFormat:'nai45-tags'});
 f.setResponse(messages=>{const p=messages.map(m=>m.content).join('\n');if(p.includes('ALBUM_RELATIONSHIP_FULL_ARCHIVE_JSON'))return {charState:'友好',userState:'未确认',relationshipSummary:'一同栽花。',relationshipSourceMemoryIds:['M001'],relationshipSourceMemoryAnchor:'庭院'};
 if(p.includes('CG_PROMPT_FORMAT_V1'))return {entries:[generatedEntry]};return {items:[{id:'cg-one',comments:Array.from({length:6},(_,i)=>'现在看看这张照片，我还想和你聊聊庭院里的花。'+i)}]};});
 const out=await client.generateMode('album',{background:true});assert.ok(out,JSON.stringify(f.notices));assert.equal(f.requests.length,3);assert.match(f.requests[0].map(x=>x.content).join('\n'),/CG_PROMPT_FORMAT_V1/);for(const r of f.requests.slice(1))assert.doesNotMatch(r.map(x=>x.content).join('\n'),/CG_PROMPT_FORMAT_V1/);assert.equal((await f.persisted()).album.entries[0].imagePrompt,scene);
});
