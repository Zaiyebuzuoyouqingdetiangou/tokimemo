import test from 'node:test';
import assert from 'node:assert/strict';
import {selectConnectionTransport, connectionPoolSettings} from '../src/core/connectionPool.js';
import {apiConfigurationFingerprint} from '../src/core/independentApi.js';

const settings={apiConnectionMode:'profile',connectionProfileId:'a',modelOverride:'a-only-model',connectionPoolEnabled:true,connectionPoolIds:['a','b']};
test('round robin assigns distinct tasks while keeping a task and its retries on one profile',()=>{
    const first={},second={};
    const a=selectConnectionTransport(settings,first),b=selectConnectionTransport(settings,second);
    assert.notEqual(a.connectionProfileId,b.connectionProfileId);
    for(let i=0;i<4;i++) assert.equal(selectConnectionTransport(settings,first).connectionProfileId,a.connectionProfileId);
    assert.equal([a,b].find(row=>row.connectionProfileId==='b').modelOverride,'');
    assert.equal([a,b].find(row=>row.connectionProfileId==='a').modelOverride,'a-only-model');
    assert.deepEqual(settings.connectionPoolIds,['a','b']);
});
test('pool opt-in is explicit; empty or changed pool cannot silently choose an unrelated connection',()=>{
    assert.equal(selectConnectionTransport({...settings,connectionPoolEnabled:false}).connectionProfileId,'a');
    const manual={...settings,apiConnectionMode:'manual',manualApiKey:'private-test'};
    assert.equal(selectConnectionTransport(manual),manual);
    assert.throws(()=>selectConnectionTransport({...settings,connectionPoolIds:[]}),{code:'RMT_CONNECTION_POOL_EMPTY'});
    const task={};selectConnectionTransport(settings,task);
    assert.throws(()=>selectConnectionTransport({...settings,connectionPoolIds:['c']},task),{code:'RMT_API_CONFIG_CHANGED'});
    assert.notEqual(apiConfigurationFingerprint(settings),apiConfigurationFingerprint({...settings,connectionPoolIds:['c']}));
    assert.equal(apiConfigurationFingerprint({...settings,connectionPoolEnabled:false}),apiConfigurationFingerprint({...settings,connectionPoolEnabled:false,connectionPoolIds:['c']}));
    assert.deepEqual(connectionPoolSettings({...settings,connectionPoolIds:['a','a',{},'b']}),{connectionPoolEnabled:true,connectionPoolIds:['a','b']});
});
