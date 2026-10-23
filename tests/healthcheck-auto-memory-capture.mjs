import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = process.env.CAPTURE_TEST_SOURCE_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFileSync(path.join(root, 'src', file), 'utf8');
const plain = body => body.replace(/^import .+;\n/gm, '').replace(/^export /gm, '');
const factory = (body, dependencies, exports) => new Function(...Object.keys(dependencies), plain(body) + `\nreturn {${exports}};`)(...Object.values(dependencies));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const packet = title => ({ title, kind: 'collection' });

// The production module host, mode entry, task/origin registry, segment runner and
// capture module are retained. Only provider, cache/recovery persistence, UI and
// the mode's prose generation body are controlled boundaries.
function harness({ onAccepted = async () => {} } = {}) {
    const capture = factory(source('generation/achievementCapture.js'), {}, 'armAchievementCapture, achievementCaptureArmed, achievementPromptSuffix, stripAchievementField, takeJournalNotes, finishAchievementCapture' +
        (source('generation/achievementCapture.js').includes('function achievementCaptureForTask') ? ', achievementCaptureForTask' : ''));
    const runtimeState = { runtimeLifecycleEpoch: 1, activeModeBuildScopes: new Set(), activeGenerationTasks: new Map(), activeCgImageTasks: new Map(), activeAdvBulkScopes: new Set(), cancelledChatScopeAt: new Map(), busy: false };
    const context = { chatId: 'same-chat', characterId: 0, name1: 'User', name2: 'Character', chatMetadata: {} };
    let clock = 0;
    const core_context = { currentCharacterGuard: () => context, chatScopeKey: () => 'character|same-chat',
        getChatId: ctx => ctx.chatId, comparableChatId: id => id || '', stableArchiveHash: () => 'fixture', runtimeLifecycleStillCurrent: epoch => epoch === 1,
        captureTaskOrigin: ctx => ({ characterKey: 'character', characterId: '0', characterAvatar: 'card.png', chatId: ctx.chatId, archiveRevision: 'r1', startedAt: ++clock }) };
    const core_constants = { MODE: { ROOM: 'room', THEME_SONG: 'themeSong', CALENDAR: 'calendar' }, MODE_LABEL: {}, MAX_CONCURRENT_GENERATION_TASKS: 5 };
    const coordinator = factory(source('core/requestTasks.js'), { core_constants, core_context, runtimeState,
        core_text: { normalizeText: value => String(value || ''), safeUserError: (message,code) => Object.assign(new Error(message),{code}) }, image_patch:{}, generation_recovery:{}, modes_heart:{} },
        'logicalGenerationTasks, beginLogicalGenerationTask, bindLogicalGenerationTask, logicalGenerationTaskForOrigin, assertLogicalGenerationTaskCurrent, chatScopeCancellationBlocksOrigin, createGenerationAbortError, generationTaskKeyForMode, isModeGenerating, canStartGenerationTask');
    coordinator.finishLogicalGenerationTask = task => coordinator.logicalGenerationTasks.delete(task.id);
    coordinator.validateGeneratedSegment = (raw, validator) => validator(raw);
    const requests = [], savedNotes = [], segments = [];
    const none = () => {};
    const requestSource = source('generation/generationRequest.js');
    const requestBody = requestSource.slice(requestSource.indexOf('export async function requestValidatedSegment'), requestSource.indexOf('export function normalizeConnectionManagerError'));
    const segment = factory(requestBody, {
        core_requestCoordinator: coordinator, core_participants: {}, cg_policy: { cgPromptForSegment:p=>p, cgSegmentValidator:v=>v }, generation_achievement:capture,
        generationTrace:()=>null, core_taskTrace:{startTaskTrace:()=>({}),markStage:none,beginStage:none,finishSegmentTrace:none}, generationContentContext:(_,ctx)=>ctx,
        core_context,core_cache:{},generationWorldInfoScanTerms:none,
        generation_recovery:{withRecoverySegment:async(prompt,options,validator,run)=>run(prompt,options,async()=>onAccepted(options))},
        requestJson: async(prompt,status,options)=>{ const wait=deferred(); requests.push({prompt,mode:options.mode,options,...wait}); return wait.promise; },
        core_butterflyContract:{},core_text:{},inboxReceivedText:new WeakMap(),
    }, 'requestValidatedSegment').requestValidatedSegment;
    const modesSource=source('generation/generationModes.js');
    const modesBody=modesSource.slice(modesSource.indexOf('export async function generateMode('),modesSource.indexOf('async function generateModeOperation('));
    const generateMode=factory(modesBody, {core_constants,core_context,core_requestCoordinator:coordinator,
        content_selection:{supportsContentSelection:()=>false},core_cache:{loadGenerationRecovery:()=>null},routePeople:{captureRoutePeople:()=>null},archive_repository:{getImportedMemory:()=>({archiveRevision:'r1'})},
        generateModeOperation:async(mode,options)=>{
            // Production setup binds additional recovery/origin snapshots to the
            // same logical task. A capture must survive that identity update.
            const origin=core_context.captureTaskOrigin(options.context || context);
            coordinator.bindLogicalGenerationTask(options.logicalTask,origin);
            const value=await segment(mode+' prose','fixture',{...options,mode,origin,context:options.context || context,contextEnvelope:''},raw=>raw);
            segments.push({mode,value}); return {status:'committed'};
        },startAdvScriptSecondStep:none,
    },'generateMode').generateMode;
    const moduleSource=source('autoMemory/moduleHost.js');
    const moduleNames=[...moduleSource.matchAll(/^import \* as (\w+) from .+;$/gm)].map(match=>match[1]);
    const moduleEnv={generation_achievement:capture,generation_client:{generateMode},
        auto_memory_round:{assertAutoMemoryRound:round=>coordinator.assertLogicalGenerationTaskCurrent(round.task),generationOptions:round=>({context,origin:round.origin,logicalParentTaskId:round.task.id,signal:round.task.signal})},
        journal_piggyback:{wantedJournalPages:async()=>({scope:'same-chat',pages:[{pageId:'page-a',text:'The saved journal page'}]}),saveJournalNotes:async(scope,notes)=>savedNotes.push({scope,notes})},
    };
    const host=factory(moduleSource,Object.fromEntries(moduleNames.map(name=>[name,moduleEnv[name] || {}])),'executeModuleStep');
    const auto=(mode,carryAchievement=true)=>{
        const origin=core_context.captureTaskOrigin(context);
        const task=coordinator.beginLogicalGenerationTask({kind:'auto-memory',mode:'auto-memory',context,origin,taskKey:'round:'+mode});
        const step={id:mode+'-prose',kind:'prose',order:0};
        const pending=host.executeModuleStep({step,plan:{moduleId:mode,steps:[step]},carryAchievement},context,{task,origin})
            .finally(()=>coordinator.finishLogicalGenerationTask(task));
        return {pending,task};
    };
    const untilRequests=async n=>{ for(let i=0;i<30 && requests.length<n;i++) await Promise.resolve(); assert.equal(requests.length,n); };
    return {capture,context,coordinator,requests,savedNotes,segments,auto,untilRequests,manual:mode=>generateMode(mode,{context})};
}

test('manual generation cannot receive or replace an automatic round achievement and journal notes', async()=>{
    const held=deferred(), accepted=deferred();
    const h=harness({onAccepted:async options=>{if(options.mode==='room'){accepted.resolve();await held.promise;}}});
    const a=h.auto('room'); await h.untilRequests(1);
    h.requests[0].resolve({room:'ok',achievement:packet('Room achievement'),journalNotes:[{pageId:'page-a',text:'Room note'}]});
    await accepted.promise;
    assert.equal(h.coordinator.isModeGenerating('themeSong',h.context),false);
    assert.equal(h.coordinator.canStartGenerationTask(h.coordinator.generationTaskKeyForMode('themeSong',h.context)),true);
    const b=h.manual('themeSong'); await h.untilRequests(2);
    assert.doesNotMatch(h.requests[1].prompt,/UNTRUSTED_JOURNAL_PAGES|本轮成就/);
    h.requests[1].resolve({song:'ok',achievement:packet('Song achievement'),journalNotes:[{pageId:'page-a',text:'Song note'}]});
    await b; held.resolve();
    const result=await a.pending;
    assert.equal(result.achievement.title,'Room achievement');
    assert.deepEqual(h.savedNotes,[{scope:'same-chat',notes:{'page-a':'Room note'}}]);
    assert.equal(h.segments.find(row=>row.mode==='themeSong').value.achievement.title,'Song achievement','ordinary task data is not consumed by another task capture');
});

test('overlapping automatic steps retain their own capture after recovery origin rebinding',async()=>{
    const h=harness(); const a=h.auto('room'); await h.untilRequests(1);
    const b=h.auto('calendar'); await h.untilRequests(2);
    h.requests[0].resolve({room:'ok',achievement:packet('Room achievement'),journalNotes:[{pageId:'page-a',text:'Room note'}]});
    const ar=await a.pending;
    h.requests[1].resolve({calendar:'ok',achievement:packet('Calendar achievement'),journalNotes:[{pageId:'page-a',text:'Calendar note'}]});
    const br=await b.pending;
    assert.equal(ar.achievement.title,'Room achievement');assert.equal(br.achievement.title,'Calendar achievement');
    assert.deepEqual(h.savedNotes.map(row=>row.notes['page-a']),['Room note','Calendar note']);
});

test('a step without achievement ownership cannot finish a concurrent owner capture',async()=>{
    const h=harness();const a=h.auto('room');await h.untilRequests(1);
    const b=h.auto('calendar',false);await h.untilRequests(2);
    assert.doesNotMatch(h.requests[1].prompt,/UNTRUSTED_JOURNAL_PAGES|本轮成就/);
    h.requests[1].resolve({calendar:'ok'});await b.pending;
    h.requests[0].resolve({room:'ok',achievement:packet('Room achievement')});
    assert.equal((await a.pending).achievement.title,'Room achievement');
});

test('failure cleanup only closes the failed owner and leaves another automatic capture usable',async()=>{
    const h=harness();const a=h.auto('room');await h.untilRequests(1);
    const b=h.auto('calendar');await h.untilRequests(2);
    const rejection=assert.rejects(a.pending,{name:'AbortError'});
    h.requests[0].reject(Object.assign(new Error('cancelled fixture'),{name:'AbortError'}));await rejection;
    h.requests[1].resolve({calendar:'ok',achievement:packet('Calendar achievement')});
    assert.equal((await b.pending).achievement.title,'Calendar achievement');
});

test('cancelled owner ignores its late response and cannot contaminate another active capture',async()=>{
    const h=harness();const a=h.auto('room');await h.untilRequests(1);
    const b=h.auto('calendar');await h.untilRequests(2);
    const rejection=assert.rejects(a.pending,{name:'AbortError'});
    a.task.controller.abort();
    h.requests[0].resolve({room:'late',achievement:packet('Cancelled room'),journalNotes:[{pageId:'page-a',text:'Cancelled note'}]});
    await rejection;
    h.requests[1].resolve({calendar:'ok',achievement:packet('Calendar achievement'),journalNotes:[{pageId:'page-a',text:'Calendar note'}]});
    assert.equal((await b.pending).achievement.title,'Calendar achievement');
    assert.deepEqual(h.savedNotes,[{scope:'same-chat',notes:{'page-a':'Calendar note'}}]);
});

test('finished and unrecognized capture handles cannot be reused by later requests',async()=>{
    const h=harness();const a=h.auto('room');await h.untilRequests(1);
    const handle=h.requests[0].options.logicalTask.autoMemoryCapture;
    h.requests[0].resolve({room:'ok',achievement:packet('Room achievement')});await a.pending;
    assert.equal(h.capture.achievementCaptureForTask({autoMemoryCapture:handle}),null);
    assert.equal(h.capture.achievementCaptureForTask({autoMemoryCapture:{}}),null);
    assert.equal(h.capture.achievementPromptSuffix(handle),'');
    const raw={achievement:packet('Late'),journalNotes:[{pageId:'page-a',text:'Late note'}]};
    assert.equal(h.capture.stripAchievementField(raw,handle),raw);
    assert.deepEqual(h.capture.takeJournalNotes(handle),{});
    assert.equal(h.capture.finishAchievementCapture(handle),null);
});
