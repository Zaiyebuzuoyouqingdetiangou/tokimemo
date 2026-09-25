import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { preparationFixture } from './preparation-harness-r8481.mjs';

async function fixture() {
    const f = await preparationFixture();
    f.data = value => vm.runInContext(`JSON.parse(${JSON.stringify(JSON.stringify(value))})`, f.sandbox);
    f.sandbox.structuredClone = value => f.data(value);
    f.targets = await f.api('core/cgTargets.js'); f.patch = await f.api('core/cgImagePatch.js');
    f.sandbox.location = { href: 'https://fixture.invalid/', origin: 'https://fixture.invalid' };
    return f;
}
const visual = {
    imagePrompt: '雨后的石阶前，岚侧身站在窗边，左手扶着打开的书。暖灯照亮深色短发和灰色外衣，前景花叶带着水珠，远处街道沉入蓝色夜色，平视中景。',
    cgPromptDraft: { schemaVersion: 1, sceneTags: 'window, open book, standing, night, warm light', flatPrompt: '岚侧身站在雨后窗边，左手扶着打开的书。暖灯照亮短发和灰色外衣，前景花叶带着水珠，远处街道沉入蓝色夜色。', characters: [{role:'char',tag:'short black hair',nl:'黑色短发'}] },
};
const memory = {chatId:'preparation-check', archiveRevision:'rev1', characterName:'岚', userName:'阿宁'};
function bedtime() { return {kind:'bedtime',bedtimeVersion:1,...memory,ownerKey:'owner',stories:[{id:'BED_night',title:'窗边的书',genre:'奇幻',premise:'雨夜翻开书页',fiction:true,createdAt:1,updatedAt:1,chapters:[{id:'BED_night-C01',title:'灯下',text:'窗外下着小雨，他站在暖灯旁，垂眼翻开一本旧书。',createdAt:1,...visual}]}],selectedId:'BED_night',view:'story',chapterIndex:0}; }
function past() { return {kind:'pastLives',...memory,version:1,title:'前世今生',presentation:'neutral',episodes:[{id:'PL01',title:'海边来信',fiction:true,presentation:'neutral',opening:{title:'引子',text:'灯下展开旧信。',motif:'信',sourceMemoryIds:['M001'],sourceMemoryAnchor:'一起读书'},dossiers:[{id:'D01',title:'雨夜',era:'海港旧城',synopsis:'他站在港口边，手中握着一盏灯，雨雾遮住远方的船。',clues:[],...visual}],annotations:[],echoes:[],closing:{text:'回到此刻'}}],selectedId:'PL01',selectedEntryId:'D01',view:'dossier'}; }

test('detailed first-draft policy covers seasons, postending, ending increments and new image modes without changing old journal prompts', async () => {
    const f = await fixture();
    const code = await readFile(new URL('../src/generation/cgPromptPolicy.js', import.meta.url),'utf8');
    const policy = new vm.SourceTextModule(code,{context:f.sandbox});
    await policy.link(async spec => {
        const ns = await f.api(spec.includes('cgPromptFormat')?'core/cgPromptFormat.js':'core/cgVisualRules.js');
        return new vm.SyntheticModule(Object.keys(ns),function(){for(const key of Object.keys(ns))this.setExport(key,ns[key]);},{context:f.sandbox});
    }); await policy.evaluate();
    for (const [mode,kind,key] of [['heart','heart-season','t:voice'],['heart','heart-season','t:scenario'],['ending','mode','t:route:END01'],['ending','mode','t:increment-route:END01'],['ending','mode','t:increment-confession'],['pastLives','mode','t:past-lives-dossier:D01'],['bedtime','mode','t:bedtime:BED_night-C01'],['butterfly','mode','t:slot:1'],['butterfly','mode','t:butterfly-prose']]) {
        const op=policy.namespace.cgRecoveryOperation(mode,{kind},null,'nai5-natural');
        assert.equal(op.cgPromptDialect,'r8483');
        const origin={}; policy.namespace.bindCgPromptFormat(origin,op.cgPromptFormat,op.cgPromptDialect);
        assert.match(policy.namespace.cgPromptForSegment('story',{mode,taskKey:key,origin}),/人物在画面中的位置/);
        policy.namespace.bindCgPromptFormat(origin,'nai5-natural','r8420');
        assert.equal(policy.namespace.cgPromptForSegment('old',{mode,taskKey:key,origin}),'old');
    }
    assert.equal(f.providerCalls,0);
});

test('first voice draft retains authored scene and appearance through normalization and editor metadata', async () => {
    const f=await fixture(), heart=await f.api('modes/heartData.js');
    const script=Array.from({length:10},(_,i)=>({speaker:i%2?'char':'narrator',text:'他站在窗边，望着灯光映在书页上的纹路，把手中的书轻轻翻过一页。'.repeat(3)}));
    const rows=heart.normalizeVoiceDramaPart(f.data({voiceDramas:[{id:'VOICE1',kind:'spring',title:'春夜',setting:'窗边',script,...visual}]}),['spring'],f.data(memory));
    const session=f.data({kind:'heart',voiceDramas:rows});
    const descriptor=f.targets.describeExpandedCgTarget(session,{kind:'heart-voice',containerId:'VOICE1'});
    const item=f.targets.expandedCgItem(session,descriptor).item;
    assert.equal(item.imagePrompt,visual.imagePrompt);
    const metadata=(await f.api('generation/cgAppearance.js')).initialCgAppearanceMetadata(item,f.host);
    assert.equal(metadata.flatPrompt,visual.cgPromptDraft.flatPrompt);
    assert.equal(metadata.characters[0].tag,'short black hair');
    const legacy=f.targets.expandedCgItem(f.data({kind:'heart',voiceDramas:[{id:'OLD',title:'旧信',setting:'雨夜',script:[{speaker:'narrator',text:'他站在窗边，手里握着书，灯光照亮了桌面。'},{speaker:'char',text:'这是不应进入提示词的对白'}]}]}),{version:1,kind:'heart-voice',containerId:'OLD',slot:'voice'}).item;
    assert.match(legacy.cgDesc,/握着书/); assert.doesNotMatch(legacy.cgDesc,/对白|clear/);
});

test('new image modes persist independent images/history, detect changed story and keep long chapters sendable', async () => {
    const f=await fixture();
    const cases=[ [bedtime(),{kind:'bedtime-chapter',containerId:'BED_night',slot:'chapter:BED_night-C01'}], [past(),{kind:'past-life-dossier',containerId:'PL01',slot:'dossier:D01'}], [{kind:'butterfly',nodes:[{id:'EG1',label:'航海',monologue:'我站在船头，海风吹动衣角。',worldSpec:{era:'未来',location:'港口'},...visual}]},{kind:'butterfly-node',containerId:'EG1'}], [{kind:'heart',characterName:'岚',fireflyVoices:[]},{kind:'heart-firefly',containerId:'habitat'}] ];
    for(const [raw,input] of cases){
        let session=f.data(raw), descriptor=f.targets.describeExpandedCgTarget(session,input);
        assert.ok(descriptor,input.kind);
        for(const name of ['one','two']){
            const resolved=f.targets.expandedCgItem(session,descriptor);
            const patch=f.data({version:1,mode:resolved.mode,itemId:resolved.item.id,expectedSignature:f.patch.cgItemSignature(resolved.item),image:{url:`/user/images/${name}.png`,provider:'baibai-image',prompt:visual.imagePrompt,generatedAt:1}});
            const result=f.patch.applyCgImagePatch(session,patch);
            assert.equal(result.status,'applied',input.kind); session=f.data(result.session);
        }
        const image=f.targets.expandedCgItem(session,descriptor).item;
        assert.equal(image.cgImage.url,'/user/images/two.png'); assert.equal(image.cgImageHistory[0].url,'/user/images/one.png');
        const html=(await f.api('ui/expandedCgView.js')).expandedCgHtml(session,input);
        assert.match(html,/two\.png/); assert.match(html,/data-rmt-expanded-cg/);
        if(raw.kind==='heart'){
            const made=(await f.api('modes/heartData.js')).makeHeartSession(session,session);
            assert.equal(f.targets.expandedCgItem(made,descriptor).item.cgImage.url,'/user/images/two.png');
            assert.match((await f.api('ui/expandedCgView.js')).expandedCgBackdropHtml(session,input),/two\.png/);
        }
    }
    const long=bedtime(); long.stories[0].chapters[0].text='他站在窗边。'.repeat(30000);
    const item=f.targets.expandedCgItem(f.data(long),f.targets.describeExpandedCgTarget(long,cases[0][1])).item;
    assert.ok(f.patch.cgItemSignature(item).length<10000);
    long.stories[0].chapters[0].text+='人物换了地方';
    assert.equal(f.targets.resolveCgTargetDescriptor(long,item.__rmtCgDescriptor),null);
    assert.equal(f.providerCalls,0);
});

test('three ending epilogue images retain their own detailed first prompt', async()=>{
    const f=await fixture(), ending=await f.api('modes/ending.js');
    const row=ending.normalizeEndingRouteDetail(f.data({endingScene:'他站在窗边，灯光照在书页上。'.repeat(30),...visual,epilogue:{scenes:[0,1,2].map(i=>({title:'场景'+i,text:'他坐在窗边，把书轻轻放在桌上。'.repeat(12),...visual,imagePrompt:visual.imagePrompt+' 场景'+i}))}}),f.data({id:'END01',title:'终章'}));
    for(let i=0;i<3;i++){
        const session=f.data({kind:'ending',endings:[row]}), d=f.targets.describeExpandedCgTarget(session,{kind:'ending-epilogue-scene',containerId:'END01',slot:'scene:'+i});
        assert.equal(f.targets.expandedCgItem(session,d).item.imagePrompt,visual.imagePrompt+' 场景'+i);
    }
});

test('chapter continuation preserves a concurrently saved picture and UI renders new controls',async()=>{
    const f=await fixture(), contract=await f.api('core/bedtimeContract.js');
    const latest=f.data(bedtime()), incoming=f.data(bedtime());
    latest.stories[0].chapters[0].visual={sourceHash:'saved',cgImage:{url:'/user/images/kept.png'}};
    incoming.stories[0].chapters.push({id:'BED_night-C02',title:'下一夜',text:'又一阵雨落在窗外。',createdAt:2});incoming.stories[0].updatedAt=2;
    const merged=contract.mergeBedtime(f.data(latest),f.data(incoming));
    assert.equal(merged.stories[0].chapters.length,2);assert.equal(merged.stories[0].chapters[0].visual.cgImage.url,'/user/images/kept.png');
    assert.match((await f.api('ui/bedtimeView.js')).bedtimeHtml(merged),/data-rmt-expanded-cg/);
    assert.match((await f.api('ui/pastLivesView.js')).pastLivesHtml(f.data(past())),/data-rmt-expanded-cg/);
    const pastMode=await f.api('modes/pastLives.js');
    assert.ok(pastMode.readablePastLivesSession(f.data(past()),f.data(memory)));
    const dossier=pastMode.normalizePastLivesDossier(f.data(past().episodes[0].dossiers[0]),f.data(memory));
    assert.equal(dossier.imagePrompt,visual.imagePrompt);
});

test('group card keeps first scene fields without assigning char traits to arbitrary participant IDs; together bedtime includes optional fields',async()=>{
    const f=await fixture(), constants=await f.api('core/constants.js');
    f.host.chatMetadata[constants.MEMORY_KEY]=f.data({version:3,...memory,memories:[{id:'M001',title:'读书',summary:'一起读书。',anchors:['一起读书']}],participantsV1:{version:1,cardType:'multi',people:[{id:'person-1',name:'岚',sourceRefs:[]},{id:'person-2',name:'明',sourceRefs:[]}],selectedIds:['person-1','person-2']}});
    const metadata=(await f.api('generation/cgAppearance.js')).initialCgAppearanceMetadata(f.data(visual),f.host);
    assert.equal(metadata.flatPrompt,visual.cgPromptDraft.flatPrompt);
    assert.equal(metadata.castSnapshot.people.length,2);assert.equal(metadata.characters.length,0);
    const merged=await f.api('generation/mergedGeneration.js');
    const task=merged.buildMergeTask('bedtime',f.host,f.host.chatMetadata[constants.MEMORY_KEY],null,new Date(1000));
    assert.match(task.singlePrompt,/本模块画面字段位置/);assert.match(task.taskText,/本模块画面字段位置/);
    assert.equal(task.snapshot.singlePrompt,task.singlePrompt);assert.equal(f.providerCalls,0);
});
