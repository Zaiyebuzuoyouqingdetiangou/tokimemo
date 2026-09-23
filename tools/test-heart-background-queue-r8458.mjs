import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { state } from '../src/core/state.js';

async function load(file, overrides = {}) {
    const url = new URL(file, import.meta.url);
    const module = new vm.SourceTextModule(await readFile(url, 'utf8'), { identifier: url.href });
    await module.link(async specifier => {
        const real = await import(new URL(specifier, url).href);
        const values = { ...real, ...(overrides[specifier] || {}) };
        return new vm.SyntheticModule(Object.keys(values), function () {
            for (const [name, value] of Object.entries(values)) this.setExport(name, value);
        });
    });
    await module.evaluate();
    return module.namespace;
}

async function fixture({ failing = false } = {}) {
    const bank = { chatId:'queue-chat', archiveRevision:'queue-rev', characterName:'岚', userName:'读者',
        archiveSummary:'', archiveKeywords:[], memories:[{id:'M1',title:'窗边',summary:'岚看着窗外。',anchors:['看着窗外']}] };
    const context = { name1:'读者',name2:'岚',characterId:0,chatMetadata:{} };
    let saved = null, current = true;
    const requests=[], failures=[], begins=[];
    const origin = () => ({ chatId:bank.chatId,archiveRevision:bank.archiveRevision,characterKey:'queue-card',lifecycleEpoch:state.runtimeLifecycleEpoch });
    const contextApi = { currentCharacterGuard:()=>context,getContext:()=>context,getChatId:()=>bank.chatId,
        captureTaskOrigin:origin,isCurrentTaskOrigin:()=>current,comparableChatId:value=>String(value||''),
        chatScopeKey:()=>bank.chatId,stableArchiveHash:value=>String(value).length.toString(36) };
    const cache = { getCache:()=>saved?{heart:saved}:{},loadSession:()=>saved?structuredClone(saved):null,
        loadGenerationRecovery:()=>null,archiveBackupEntryForContext:()=>null,claimLiveModeGeneration:async()=>true,
        saveGenerationRecovery:async()=>true,readParticipantRoster:()=>null,
        commitSessionMutation:async (_mode,_id,_origin,mutator,base)=>{
            saved=mutator(saved?structuredClone(saved):structuredClone(base),bank); return saved;
        } };
    const coordinator = { beginLogicalGenerationTask:input=>({ ...input }),bindLogicalGenerationTask:()=>{},
        finishLogicalGenerationTask:()=>{},assertLogicalGenerationTaskCurrent:()=>{
            if (!current) throw new DOMException('changed','AbortError');
        },isLogicalGenerationTaskCurrent:()=>current,isModeGenerating:()=>false,isGenerationTaskRunning:()=>false,
        canStartGenerationTask:()=>true,registerArchiveTargetReservation:()=>{},unregisterArchiveTargetReservation:()=>{},
        refreshConcurrentTaskUi:()=>{},noteSecondStepOffer:()=>{},createGenerationAbortError:()=>new DOMException('changed','AbortError') };
    const line = '窗外的风带来一点清凉，我把桌边的东西收好，留出一处安静的位置。等你愿意的时候，我们再慢慢说今天想做的事情。';
    const provider = {
        generateMode:async()=>{ throw new Error('Unrequested foundation generation'); },
        beginModeRecovery:async (_mode,_context,_memory,_origin,options)=>{
            begins.push(options.operation);
            return {journal:{frozenInputs:{},pageId:options.pageId},contentContext:context,contentBank:structuredClone(bank),contentInputs:options.contentInputs};
        },
        requestValidatedSegment:async (prompt,label,options,validator)=>{
            requests.push({prompt,label,mode:options.mode});
            if (failing) throw new Error('provider fixture failure');
            const raw = label.includes('日常一格') ? {dailyStrips:[{id:'strip-one',title:'窗边',panelCount:1,
                panels:[{action:'岚把书放在桌上，抬起头笑了。',charLine:'先休息一会儿。'}],imagePrompt:'chibi adult character placing a book on the desk, no text'}]}
                : label.includes('萤火虫') ? {fireflyVoices:[{id:'firefly-one',color:'white',title:'关于窗外的风',
                    script:Array.from({length:5},(_,i)=>({speaker:i===3?'user':'char',text:i===3?'好啊。':line}))}]}
                    : {voiceDramas:[{id:'voice-one',kind:label.includes('后日谈')?'postending':'spring',title:'窗外有风',
                        script:Array.from({length:8},(_,i)=>({speaker:i%2?'char':'narrator',text:line}))}]};
            return validator(raw);
        },
    };
    const overrides = {'../core/context.js':contextApi,'../core/cache.js':cache,
        '../archive/repository.js':{requireArchive:()=>bank,getImportedMemory:()=>bank},
        '../core/requestCoordinator.js':coordinator,'../core/settings.js':{getPluginSettings:()=>({autoSecondPass:false})},
        '../archive/library.js':{prepareArchiveTargetSubtask:async()=>{throw new Error('Visible snapshot must not own queue');},requireWritableArchiveAction:()=>{throw new Error('Visible reader must not own queue');}},
        '../generation/client.js':provider,'../generation/prompts.js':{promptSafetyBoundary:()=>''},
        '../generation/recovery.js':{readGenerationContentSnapshot:()=>null,generationRecoverySummary:()=>null,
            frozenGenerationInput:async(_origin,_key,fn)=>fn(),noteGenerationRecoveryFailure:async(_origin,error)=>failures.push(error),detachGenerationRecovery:()=>{}},
    };
    const heart=await load('../src/modes/heart.js',overrides);
    const queue=await load('../src/ui/taskCenter.js',{...overrides,'../modes/heart.js':heart});
    return {queue,heart,bank,context,requests,failures,begins,saved:()=>saved,change:()=>{current=false;}};
}

for (const [route,field] of [['postending','voiceDramas'],['heart','voiceDramas'],['fireflies','fireflyVoices'],['strips','dailyStrips']]) {
    test(`queue executes ${route} against saved HEART without opening it or generating unrelated dialogue`,async()=>{
        globalThis.toastr={info(){},success(){},warning(){},error(){}};
        state.activeMode='inbox'; state.activeSession={kind:'inbox',letters:[{id:'kept'}]};
        state.activeArchiveSnapshot={entryId:'visible-other-archive'};
        const visible=state.activeSession, snapshot=state.activeArchiveSnapshot;
        const f=await fixture();
        const result=await f.queue.runQueuedGeneration({mode:'heart',route,participantSnapshot:null});
        assert.equal(result.status,'committed', f.failures.map(error=>error.stack).join('\n'));
        assert.equal(f.requests.length,1);
        assert.equal(f.saved()[field].length,1);
        assert.equal(Object.values(f.saved().greetings).flat().length,0,'no unwanted foundation dialogue');
        assert.equal(state.activeSession,visible);
        assert.equal(state.activeArchiveSnapshot,snapshot);
        assert.equal(state.activeMode,'inbox');
        state.activeArchiveSnapshot=null;
    });
}

test('provider failure is returned as failed, never silently marked done by the queue',async()=>{
    state.activeMode='inbox';state.activeSession={kind:'inbox',letters:[]};state.activeArchiveSnapshot=null;
    const f=await fixture({failing:true});
    const result=await f.queue.runQueuedGeneration({mode:'heart',route:'postending',participantSnapshot:null});
    assert.equal(result.status,'failed');assert.equal(f.saved(),null);assert.equal(f.requests.length,1);
});

test('a stale queued target cannot send after the chat origin changes',async()=>{
    const f=await fixture();
    const target=f.heart.captureHeartBackgroundTarget();f.change();
    await f.heart.generateHeartSeasonSection('postending',{background:true,backgroundTarget:target,participantSnapshot:null});
    assert.equal(f.requests.length,0);assert.equal(f.saved(),null);
});

test('an undefined subtask return remains blocked in the queue',async()=>{
    const queue=await load('../src/ui/taskCenter.js',{'../modes/heart.js':{
        captureHeartBackgroundTarget:()=>({session:{kind:'heart'}}),generateHeartFirefliesSection:async()=>undefined,
    }});
    assert.equal((await queue.runQueuedGeneration({mode:'heart',route:'fireflies'})).status,'blocked');
});
