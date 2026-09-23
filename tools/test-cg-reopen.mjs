import test from 'node:test';
import assert from 'node:assert/strict';
import * as targets from '../src/core/cgTargets.js';
import * as patch from '../src/core/cgImagePatch.js';
import { normalizeHeart, makeHeartSession } from '../src/modes/heart.js';
import { normalizeEnding } from '../src/modes/ending.js';

const memory = { characterName:'甲', userName:'乙', memories:[{id:'M001',title:'雨夜约定',anchors:['雨夜约定'],summary:'一起走过雨夜。'}] };
const image = name => ({url:`/user/images/${name}.png`,prompt:'已手改的画面提示',provider:'baibai-image',generatedAt:1});
function draw(session, input, name) {
    const descriptor = targets.describeExpandedCgTarget(session,input);
    assert.ok(descriptor);
    const target = targets.expandedCgItem(session,descriptor);
    const result = patch.applyCgImagePatch(session,{version:1,mode:session.kind,itemId:target.item.id,expectedSignature:patch.cgItemSignature(target.item),image:image(name)});
    assert.equal(result.status,'applied');
    return {session:result.session, descriptor};
}

test('HEART normalize, append-language and JSON reopen retain CGs and obsolete-language sidecars', () => {
    const script = Array.from({length:8},(_,i)=>({speaker:'char',text:`${i} ${'今晚的雨声落在屋檐上，你把那盏灯留在了窗前。'.repeat(4)}`}));
    let session = normalizeHeart({kind:'heart',relationshipSummary:'雨夜约定',greetings:{morning:['早安。']},voiceDramas:[{id:'VOICE_1',kind:'postending',title:'雨声',script}],scenarioDramas:[{id:'SCENE_1',season:'spring',title:'春雨',script}]},memory);
    session.languageVisuals = [{category:'morning',lineHash:targets.heartLanguageLineHash('morning','早安。'),scenePrompt:'雨后的窗边',title:'晨光'}];
    const inputs = [{kind:'heart-voice',containerId:'VOICE_1'},{kind:'heart-scenario',containerId:'SCENE_1'},{kind:'heart-language',category:'morning',line:'早安。'}];
    const descriptors=[];
    for(const [i,input] of inputs.entries()) { const out=draw(session,input,`saved-${i}`);session=out.session;descriptors.push(out.descriptor); }
    const original=structuredClone(session);
    const reopened=normalizeHeart(JSON.parse(JSON.stringify(session)),memory);
    for(const [i,descriptor] of descriptors.entries()) assert.equal(targets.expandedCgItem(reopened,descriptor).item.cgImage.url,image(`saved-${i}`).url);
    const changed=makeHeartSession({...reopened,greetings:{morning:['新的早安。']}},reopened);
    const normalized=normalizeHeart(changed,memory);
    assert.deepEqual(normalized.languageVisuals,reopened.languageVisuals,'old scene/image retained even when source line is replaced');
    assert.equal(targets.expandedCgItem(normalized,descriptors[2]),null,'obsolete source cannot receive new pictures');
    assert.deepEqual(session,original);
});

test('ENDING normalize-save-reopen preserves separate ending and epilogue images', () => {
    const raw={kind:'ending',relationshipState:'雨夜约定',relationshipSummary:'雨夜约定仍在继续。',relationshipSourceMemoryIds:['M001'],relationshipSourceMemoryAnchor:'雨夜约定',endings:['route','romance','reverse','bond','open'].map((type,i)=>({id:`END_${i}`,type,title:`雨夜约定 ${i}`,available:true,sourceMemoryIds:['M001'],sourceMemoryAnchor:'雨夜约定',endingScene:'灯还亮着。',epilogue:{title:'后来',scenes:[{title:'翌日',text:'窗边的雨声。'.repeat(30)}]}}))};
    let session=normalizeEnding(raw,memory,{catalogOnly:true});
    const ending=draw(session,{kind:'ending-ending',containerId:'END_0'},'ending');session=ending.session;
    const epilogue=draw(session,{kind:'ending-epilogue',containerId:'END_0'},'epilogue');session=epilogue.session;
    const reopened=normalizeEnding(JSON.parse(JSON.stringify(session)),memory,{catalogOnly:true});
    assert.equal(targets.expandedCgItem(reopened,ending.descriptor).item.cgImage.url,image('ending').url);
    assert.equal(targets.expandedCgItem(reopened,epilogue.descriptor).item.cgImage.url,image('epilogue').url);
});
