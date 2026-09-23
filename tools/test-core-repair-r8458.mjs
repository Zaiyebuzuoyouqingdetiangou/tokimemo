import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { admitArchiveMemories } from '../src/archive/capacity.js';
import { memoryPayload, memoryIdSet } from '../src/core/evidence.js';
import { selectConnectionTransport, connectionPoolFingerprint } from '../src/core/connectionPool.js';
import * as recovery from '../src/generation/recovery.js';
import * as sourcePolicy from '../src/core/recoverySourcePolicy.js';

const memory = (id, date = '2026-01-01') => ({ id, date, title: `事件 ${id}`, summary: `正文 ${id}`, anchors: [`锚点 ${id}`] });
test('new memories are not victims of their own admission batch, even with a full cold archive', () => {
    const hot = Array.from({length:239}, (_,i) => memory(`M${i + 1}`));
    const cold = Array.from({length:100}, (_,i) => memory(`M${i + 300}`, '2025-01-01'));
    const fresh = [memory('early', '2020-01-01'), memory('late', '2027-01-01')];
    const original = structuredClone({hot, cold, fresh});
    const result = admitArchiveMemories(hot, fresh, cold);
    assert.equal(result.memories.length, 240);
    for (const item of fresh) assert.ok(result.memories.some(row => row.title === item.title));
    assert.equal(result.evicted.length, 1);
    assert.ok(result.evicted.every(row => hot.some(old => old.id === row.id)));
    assert.deepEqual({hot, cold, fresh}, original);
});
test('batch beyond eligible old slots is preserved pending rather than replacing another new memory', () => {
    const result = admitArchiveMemories([ {...memory('M1'), locked:true}, memory('M2') ],
        [memory('a','2020-01-01'), memory('b'), memory('c')], [], {maxHot:3,maxCold:3,maxEvict:10});
    assert.equal(result.memories.length,3);
    assert.equal(result.pending.length,1);
    assert.equal(result.evicted.length,1);
    assert.equal(result.memories[0].id,'M1');
    assert.equal(result.lockedFull,false);
    const all = [...result.memories,...result.pending];
    for (const title of ['事件 a','事件 b','事件 c']) assert.equal(all.filter(row=>row.title===title).length,1);
});
test('targeted cold evidence supplies the same accepted identifier and original text', () => {
    const bank={memories:[memory('M1')],coldArchive:[memory('M900')]};
    assert.ok(memoryIdSet(bank).has('M900'));
    assert.equal(memoryPayload(bank,['M900'])[0]?.summary,'正文 M900');
    assert.deepEqual(memoryPayload(bank,['unknown']),[]);
    assert.deepEqual(memoryPayload(bank).map(row=>row.id),['M1']);
});
test('album text regeneration preserves current CG and every saved image version', async () => {
    const source=await readFile(new URL('../src/generation/contentRegeneration.js',import.meta.url),'utf8');
    const start=source.indexOf('async function regenerateAlbumEntry(');
    const end=source.indexOf('\n// Lightweight category',start);
    const image={url:'/user/images/current.png'}, history=Array.from({length:7},(_,i)=>({url:`/user/images/old-${i}.png`}));
    const item={id:'A1',title:'原题',sourceMemoryIds:['M900'],sourceMemoryAnchor:'锚点 M900',unlocked:false,cgImage:image,cgImageHistory:history};
    let sent='';
    const deps={core_evidence:{memoryPayload},generation_prompts:{promptSafetyBoundary:()=>''},core_text:{esc:x=>x},
        core_constants:{MODE:{ALBUM:'album'}},taskOptions:()=>({}),sameEvidence:()=>true,
        modes_album:{normalizeAlbumIndex:x=>x},generation_client:{requestValidatedSegment:async (prompt,label,options,validate)=>{
            sent=prompt; return validate({entries:[{id:'ignored',title:'新题',sourceMemoryIds:['M900'],sourceMemoryAnchor:'锚点 M900'}]});
        }}};
    const regenerate=new Function(...Object.keys(deps),`${source.slice(start,end)};return regenerateAlbumEntry;`)(...Object.values(deps));
    const result=await regenerate({},item,{}, {memories:[],coldArchive:[memory('M900')]},{},'task');
    assert.equal(result.title,'新题'); assert.deepEqual(result.cgImage,image);assert.deepEqual(result.cgImageHistory,history);
    assert.doesNotMatch(sent,/\/user\/images\//);
});
test('a serialized connection selection stays pinned and rejects changed or forged pool membership', () => {
    const settings={apiConnectionMode:'profile',connectionProfileId:'a',modelOverride:'main',connectionPoolEnabled:true,connectionPoolIds:['a','b']};
    const first=selectConnectionTransport(settings,{});
    const selected=JSON.parse(JSON.stringify({id:first.connectionProfileId,fingerprint:connectionPoolFingerprint(settings)}));
    const resumed=selectConnectionTransport(settings,{},selected);
    assert.equal(resumed.connectionProfileId,first.connectionProfileId);
    assert.throws(()=>selectConnectionTransport({...settings,connectionPoolIds:['c']},{},selected),{code:'RMT_API_CONFIG_CHANGED'});
    assert.throws(()=>selectConnectionTransport(settings,{}, {...selected,id:'outside'}),{code:'RMT_API_CONFIG_CHANGED'});
});

const origin={characterKey:'card',characterId:'1',characterAvatar:'card.png',chatId:'chat',archiveRevision:'r1'};
test('frozen non-secret connection selection survives actual recovery save and reload', async () => {
    const settings={apiConnectionMode:'profile',connectionProfileId:'a',connectionPoolEnabled:true,connectionPoolIds:['a','b']};
    const firstOrigin={...origin};
    const first=await recovery.createGenerationRecovery({origin:firstOrigin,mode:'heart',settingsIdentity:'same',contentSnapshot:{fields:{}},save:async()=>true});
    recovery.attachGenerationRecovery(firstOrigin,first);
    const selection=await recovery.frozenGenerationInput(firstOrigin,'transport:connection',()=>({id:selectConnectionTransport(settings,firstOrigin).connectionProfileId,fingerprint:connectionPoolFingerprint(settings)}));
    const saved=JSON.parse(JSON.stringify(recovery.generationRecoverySnapshot(first)));
    const nextOrigin={...origin};
    const resumed=await recovery.createGenerationRecovery({origin:nextOrigin,mode:'heart',settingsIdentity:'same',existing:saved,continueRequested:true,save:async()=>true});
    recovery.attachGenerationRecovery(nextOrigin,resumed);
    const restored=await recovery.frozenGenerationInput(nextOrigin,'transport:connection',()=>assert.fail('must not select again'));
    assert.equal(selectConnectionTransport(settings,nextOrigin,restored).connectionProfileId,selection.id);
    assert.doesNotMatch(JSON.stringify(saved),/apiKey|token|password/);
});

async function legacyFailure(state='retry') {
    const handle=await recovery.createGenerationRecovery({origin,mode:'heart',settingsIdentity:'old-settings',save:async()=>true});
    const journal=recovery.generationRecoverySnapshot(handle);
    journal.segments=[{slot:'voice:spring',requestHash:await recovery.generationRecoveryDigest('old-request'),state,
        ...(state==='complete'?{rawJson:'{"text":"原正文"}'}:state==='truncated'?{partial:'{"text":"未完',failureCode:'RMT_JSON_TRUNCATED'}:{})}];
    return journal;
}
test('legacy configuration restart requires confirmation and preserves the entire failed attempt durably', async () => {
    const journal=await legacyFailure(), before=structuredClone(journal);let saved, confirmations=0;
    const handle=await recovery.createGenerationRecovery({origin,mode:'heart',settingsIdentity:'new-settings',existing:journal,continueRequested:true,
        contentSnapshot:{fields:{name2:'原角色'},contentSettings:{}},
        confirmLegacyRestart:async({reason})=>{assert.equal(reason,'configuration');confirmations++;return true;},
        save:async value=>{saved=structuredClone(value);return true;}});
    const after=recovery.generationRecoverySnapshot(handle);
    assert.equal(confirmations,1);assert.equal(after.previousAttempts.length,1);
    assert.deepEqual(after.previousAttempts[0],before);assert.deepEqual(journal,before);
    assert.equal(saved.settingsHash,await recovery.generationRecoveryDigest('new-settings'));
    assert.equal(after.segments.length,0);assert.equal(after.contentSnapshot.fields.name2,'原角色');
});
test('legacy restart never discards complete/truncated/retained content, cancellation, or failed durable storage', async () => {
    for (const state of ['complete','truncated','retained']) {
        const journal=await legacyFailure(state==='retained'?'retry':state);
        if(state==='retained')journal.segments[0].retainedPartials=['付费旧稿'];
        let calls=0;
        await assert.rejects(recovery.createGenerationRecovery({origin,mode:'heart',settingsIdentity:'changed',existing:journal,continueRequested:true,
            confirmLegacyRestart:()=>{calls++;return true;},save:async()=>true}),{code:'RMT_RECOVERY_INPUT_CHANGED'});
        assert.equal(calls,0);
    }
    const journal=await legacyFailure();
    await assert.rejects(recovery.createGenerationRecovery({origin,mode:'heart',settingsIdentity:'changed',existing:journal,continueRequested:true,
        confirmLegacyRestart:()=>false,save:async()=>assert.fail('cancel must not save')}),{code:'RMT_RECOVERY_INPUT_CHANGED'});
    await assert.rejects(recovery.createGenerationRecovery({origin,mode:'heart',settingsIdentity:'changed',existing:journal,continueRequested:true,
        confirmLegacyRestart:()=>true,save:async()=>false}),{code:'RMT_RECOVERY_STORAGE'});
    await assert.rejects(recovery.createGenerationRecovery({origin:{...origin,chatId:'other'},mode:'heart',settingsIdentity:'changed',existing:journal,continueRequested:true,
        confirmLegacyRestart:()=>assert.fail('identity failure must not ask'),save:async()=>true}),{code:'RMT_RECOVERY_INPUT_CHANGED'});
});
test('preflight approval binds to exact current configuration and is consumed once; source changes still block', async () => {
    const context={extensionSettings:{heartbeatMemories:{creativeSupplementEnabled:true,creativeSupplement:'current'}},chatMetadata:{}};
    const journal=await legacyFailure();let confirmations=0;
    sourcePolicy.setLegacyConfigurationRestartConfirmation(()=>{confirmations++;return true;});
    try {
        await sourcePolicy.assertRecoverySourcePolicy(journal,context,origin);
        await sourcePolicy.assertRecoverySourcePolicy(journal,context,origin);
        assert.equal(confirmations,1);
        assert.equal(await sourcePolicy.consumeLegacyConfigurationRestart(journal,context),true);
        assert.equal(await sourcePolicy.consumeLegacyConfigurationRestart(journal,context),false);
        await sourcePolicy.assertRecoverySourcePolicy(journal,context,origin);
        context.extensionSettings.heartbeatMemories.creativeSupplement='changed after dialog';
        assert.equal(await sourcePolicy.consumeLegacyConfigurationRestart(journal,context),false);
        await assert.rejects(sourcePolicy.assertRecoverySourcePolicy(journal,context,{...origin,chatId:'different'}),{code:'RMT_RECOVERY_SOURCE_CHANGED'});
        const withSources={...journal,sourcePolicy:await sourcePolicy.recoverySourcePolicy(context)};
        context.name1='different persona';
        const count=confirmations;
        await assert.rejects(sourcePolicy.assertRecoverySourcePolicy(withSources,context,origin),{code:'RMT_RECOVERY_SOURCE_CHANGED'});
        assert.equal(confirmations,count);
    } finally {sourcePolicy.setLegacyConfigurationRestartConfirmation(null);}
});
