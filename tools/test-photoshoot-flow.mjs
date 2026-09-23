import test from 'node:test';
import assert from 'node:assert/strict';
import * as photo from '../src/core/photoshootContract.js';
import * as targets from '../src/core/cgTargets.js';
import * as patch from '../src/core/cgImagePatch.js';
import * as image from '../src/generation/imageGeneration.js';
import * as provider from '../src/generation/baiBaiImage.js';
import * as appearance from '../src/generation/cgAppearance.js';
import * as heart from '../src/modes/heart.js';
import {WORKSPACE_ROUTES} from '../src/ui/workspaceState.js';

test('story remains reachable while cancelled failed photoshoot has no new-generation route',()=>{
    assert.equal(WSPACE('bedtime').mode,'bedtime');
    assert.equal(WORKSPACE_ROUTES['failed-photoshoot'],undefined);
});
function WSPACE(key){assert.ok(WORKSPACE_ROUTES[key]);return WORKSPACE_ROUTES[key];}

test('photoshoot save-normalize-reopen retains nine moments and its image without changing old strips',()=>{
    const plan=photo.createPhotoshootPlan({route:'failed-photoshoot',capture:'selfie',scenePrompt:'窗边，风吹乱头发。'},{id:'PHOTO_TEST',createdAt:1});
    const original={kind:'heart',chatId:'chat',archiveRevision:'r1',photoshoots:[plan],dailyStrips:[]};
    const descriptor=targets.describeExpandedCgTarget(original,{kind:'heart-photoshoot',containerId:plan.id});
    const item=targets.expandedCgItem(original,descriptor).item;
    const saved=patch.applyCgImagePatch(original,{version:1,mode:'heart',itemId:item.id,expectedSignature:patch.cgItemSignature(item),image:{url:'/user/images/photo.png',prompt:'用户手改提示',provider:'baibai-image'}});
    assert.equal(saved.status,'applied');
    const opened=heart.normalizeHeart(JSON.parse(JSON.stringify(saved.session)),{memories:[]});
    assert.equal(opened.photoshoots[0].moments.length,9);
    assert.equal(targets.expandedCgItem(opened,descriptor).item.cgImage.url,'/user/images/photo.png');
    assert.equal(original.photoshoots[0].visual,undefined);
});

test('public provider gets the same nine-grid prompt as preview, including edited flat prompt',async()=>{
    let request;
    globalThis.STBaiBaiImage={apiVersion:1,capabilities:{generate:true,saveToGallery:true},getBackendStatus:()=>({configured:true,backend:'comfy',supportsCharacters:false}),generate:async value=>{request=value;return {path:'/user/images/grid.png'};}};
    try {
        const parts=image.prepareCgSendParts('heart',{cgLayout:'photoshoot-9-grid'},'九个连续的拍摄意外',{flatPrompt:'A candid seaside photoshoot.',characters:[]},'nai5-natural');
        const preview=appearance.formattedCgProviderPrompts(parts.prompt,parts.metadata,false,'comfy');
        const result=await provider.generateBaiBaiImage(parts.prompt,{orientation:'portrait',promptMetadata:parts.metadata});
        assert.equal(request.size,'portrait');assert.equal(request.prompt,preview.prompt);assert.equal(request.nl,preview.nl);
        assert.match(request.prompt,/9:16.*3 by 3/s);assert.match(request.prompt,/A candid seaside photoshoot/);
        assert.equal(result.url,'/user/images/grid.png');
        assert.throws(()=>image.prepareCgSendParts('heart',{cgLayout:'photoshoot-9-grid'},'x'.repeat(1800),{},'nai5-natural'),{code:'RMT_CG_PROMPT_INVALID'});
    }finally{delete globalThis.STBaiBaiImage;}
});
