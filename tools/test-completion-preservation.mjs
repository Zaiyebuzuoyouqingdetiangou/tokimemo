import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGenerationStatus, sessionHasPendingParts } from '../src/core/generationStatus.js';
import { normalizeEndingEasterEgg } from '../src/modes/ending.js';
import { pendingHeartDramaBatchId, nextHeartDramaBatchId } from '../src/modes/heart.js';

test('validated unsaved replies never look finished or require a new generation', () => {
    assert.equal(resolveGenerationStatus({ pending:[{kind:'unsaved'}], hasContent:true }).state, 'unsaved');
    assert.equal(resolveGenerationStatus({ drafts:[{completed:1}], hasContent:false }).state, 'retry');
    assert.equal(resolveGenerationStatus({ pending:[{kind:'invalid'}] }).state, 'failed');
    assert.equal(resolveGenerationStatus({ running:true, pending:[{kind:'unsaved'}] }).state, 'running');
    assert.equal(sessionHasPendingParts({ entries:[{progressPending:['共同回忆']}] }),true);
    assert.equal(sessionHasPendingParts({entries:[{text:'complete'}]}),false);
});

test('season second step reuses the batch of its saved sibling', () => {
    const session = {voiceDramas:[{id:'oldVoice',kind:'spring',incrementBatchId:'saved-batch',generatedAt:1,text:'保留正文'}],scenarioDramas:[]};
    const before = structuredClone(session);
    assert.equal(pendingHeartDramaBatchId(session,'spring'),'saved-batch');
    assert.equal(nextHeartDramaBatchId(session,'spring'),'saved-batch');
    assert.deepEqual(session,before);
    session.scenarioDramas.push({season:'spring',incrementBatchId:'saved-batch'});
    assert.equal(pendingHeartDramaBatchId(session,'spring'),'');
});

test('missing hidden-heart prose is not replaced by invented generic romantic monologue', () => {
    const source = {id:'friendship',title:'未获回应的告白',sourceMemoryAnchor:'把信退了回来',confessionText:'历史正文必须保留'};
    const before = structuredClone(source);
    const empty = normalizeEndingEasterEgg({},source);
    assert.deepEqual(empty.monologue,[]); assert.deepEqual(empty.poem,[]);
    assert.match(empty.logs[0],/把信退了回来/);
    assert.deepEqual(source,before);
    const saved = {moduleType:'letter_archive',logs:['旧日志'],monologue:['旧独白'],poem:['旧短句'],feedback:{pulse:'旧反馈'}};
    const normalized = normalizeEndingEasterEgg(saved,source);
    assert.deepEqual(normalized.monologue,['旧独白']);assert.deepEqual(normalized.logs,['旧日志']);
    assert.equal(normalized.feedback.pulse,'旧反馈');
});
