import test from 'node:test';
import assert from 'node:assert/strict';
import * as art from '../src/core/letterIllustrationV2.js';
import * as legacy from '../src/core/letterIllustration.js';
import {normalizeInboxLetters,normalizeInboxSession} from '../src/modes/inbox.js';
import {harness} from './runtime-harness.mjs';
const envelope=(card,world='')=>`CHARACTER_CARD_JSON:\n${JSON.stringify(card)}\nUSER_PERSONA_JSON:\n{}\nWORLD_INFO_TEXT:\n${world}\n【上下文结束】`;
const design=(name='甲',quote='黑色长发')=>({version:2,characterName:name,focus:'person',visualFacts:[{kind:'hairColor',value:'black',evidence:quote}],scene:{kind:'tea',evidence:'我正在喝茶'}});
const person=(id,name,content)=>({id,name,identity:'character',sourceRefs:[{world:'人物',uid:id,title:name,content}]});
test('single-card appearance after the old 20k JSON and 5k field cuts remains available',()=>{
 const evidence=art.captureEvidence(envelope({name:'甲',description:'设定'.repeat(12000)+'\n黑色长发'}));
 assert.ok(art.normalizeGenerated(design(),{characterEvidence:evidence,characterNames:['甲'],letterText:'我正在喝茶'}));
});
test('single-card omitted model illustration recovers only factual appearance and letter scene locally',()=>{
 const evidence=art.captureEvidence(envelope({name:'甲',description:'黑色长发。戴眼镜。'}));
 const value=art.normalizeGenerated(null,{characterEvidence:evidence,characterNames:['甲'],letterText:'我正在喝茶'});
 assert.equal(value.characterName,'甲');assert.ok(value.visualFacts.some(f=>f.kind==='hairColor'&&f.value==='black'));
 assert.match(legacy.renderLetterIllustration(value),/<svg/);
});
test('multiplayer world-book source ownership does not require name in every quote',()=>{
 const snapshot={people:[person('a','甲','黑色长发'),person('b','乙','白色短发')]};
 const evidence=art.captureEvidence(envelope({selectedPeople:[{name:'甲'},{name:'乙'}]},'黑色长发\n白色短发'),snapshot);
 const value=art.normalizeGenerated(design(),{characterEvidence:evidence,characterNames:['甲','乙'],letterText:'我正在喝茶'});
 assert.equal(value.characterName,'甲');assert.equal(value.visualFacts[0].value,'black');
 const other=art.normalizeGenerated(design('乙'),{characterEvidence:evidence,characterNames:['甲','乙'],letterText:'我正在喝茶'});
 assert.ok(other.visualFacts.every(f=>!(f.kind==='hairColor'&&f.value==='black')));
});
test('a shared world-book uses named sections and never lends another persons appearance',()=>{
 const content='【甲】\n黑色长发\n【乙】\n白色短发';
 const evidence=art.captureEvidence(envelope({},content),{people:[person('a','甲',content),person('b','乙',content)]});
 const value=art.normalizeGenerated(design('乙'),{characterEvidence:evidence,characterNames:['甲','乙'],letterText:'我正在喝茶'});
 assert.equal(value.characterName,'乙');assert.ok(value.visualFacts.some(f=>f.value==='white'));assert.ok(!value.visualFacts.some(f=>f.value==='black'));
});
test('omitted art in a multi-person letter follows the named sender rather than first selected person',()=>{
 const snapshot={people:[person('a','甲','黑色长发'),person('b','乙','白色短发')]};
 const evidence=art.captureEvidence(envelope({},'黑色长发\n白色短发'),snapshot);
 const value=art.normalizeGenerated(null,{characterEvidence:evidence,characterNames:['甲','乙'],letterText:'我正在喝茶\n乙'});
 assert.equal(value.characterName,'乙');
 assert.equal(art.normalizeGenerated(null,{characterEvidence:evidence,characterNames:['甲','乙'],letterText:'我正在喝茶'}),null);
});
test('sources not sent, unknown names, missing facts and missing scenes cannot invent art',()=>{
 const evidence=art.captureEvidence(envelope({},''),{people:[person('a','甲','黑色长发')]});
 assert.equal(art.normalizeGenerated(design(),{characterEvidence:evidence,characterNames:['甲'],letterText:'我正在喝茶'}),null);
 assert.equal(art.normalizeGenerated(null,{characterEvidence:'性格温柔',characterNames:['甲'],letterText:'我正在喝茶'}),null);
 assert.equal(art.normalizeGenerated(null,{characterEvidence:'黑色长发',characterNames:['甲'],letterText:'一切安好'}),null);
});
test('whitespace-normalized quoted appearance still matches frozen original text',()=>{
 const value=design('甲','黑色\n长发');
 assert.ok(art.normalizeGenerated(value,{characterEvidence:'黑色\n长发',characterNames:['甲'],letterText:'我正在喝茶'}));
});
test('single-card appearance from named selected world book is usable',()=>{
 const evidence=art.captureEvidence(envelope({name:'甲',description:'温柔'},'【甲】\n黑色长发'));
 assert.ok(art.normalizeGenerated(design(),{characterEvidence:evidence,characterNames:['甲'],letterText:'我正在喝茶'}));
});
test('normal inbox normalization saves local art and reopening preserves its exact drawing',()=>{
 const memory={chatId:'test',archiveRevision:'r',characterName:'甲',userName:'你',memories:[]};
 const evidence=art.captureEvidence(envelope({name:'甲',description:'黑色长发'}));
 const session=normalizeInboxLetters({letters:[{slot:'daily',title:'近况',greeting:'你好',body:'我正在喝茶。',closing:'甲'}]},memory,[{slot:'daily',eventKey:'daily:1',sourceMemoryIds:[],sourceMemoryAnchor:''}],new Date(),{characterEvidence:evidence});
 assert.ok(session.letters[0].illustration);assert.deepEqual(normalizeInboxSession(session).letters[0].illustration,session.letters[0].illustration);
});
test('malformed model markup is never used as SVG or executed',()=>{
 const value=art.normalizeGenerated({version:2,svg:'<script>alert(1)</script>'},{characterEvidence:'黑色长发',characterNames:['甲'],letterText:'我正在喝茶'});
 const rendered=legacy.renderLetterIllustration(value);assert.ok(!rendered.includes('<script'));assert.match(rendered,/<svg/);
});
test('actual bundled single inbox preparation carries full card evidence to its normalizer',async()=>{
 const h=await harness({messages:2,bundle:true});
 h.host.characters[0].data.description='黑色长发';h.host.getCharacterCardFields=()=>({description:'黑色长发'});
 const presentation=await h.originalClient.buildWorldPresentationContext(h.host,h.copy({characterName:'Char',memories:[]}),h.module('core/constants.js').MODE.INBOX);
 const value=h.module('core/letterIllustrationV2.js').normalizeGenerated(null,h.copy({characterEvidence:presentation.characterEvidence,characterNames:['Char'],letterText:'我正在喝茶'}));
 assert.ok(value,JSON.stringify(presentation));assert.equal(h.providerCalls.length,0);
});
test('actual bundled multiplayer inbox preparation freezes world-book ownership',async()=>{
 const h=await harness({messages:2,bundle:true});const snapshot=h.copy({people:[person('a','甲','黑色长发'),person('b','乙','白色短发')]});
 const presentation=await h.originalClient.buildWorldPresentationContext(h.host,h.copy({characterName:'群像',memories:[]}),h.module('core/constants.js').MODE.INBOX,null,snapshot);
 const value=h.module('core/letterIllustrationV2.js').normalizeGenerated(h.copy(design('乙','白色短发')),{characterEvidence:presentation.characterEvidence,characterNames:h.copy(['甲','乙']),letterText:'我正在喝茶'});
 assert.ok(value,JSON.stringify(presentation));assert.equal(value.characterName,'乙');assert.equal(h.providerCalls.length,0);
});
test('merged inbox receives its selected source bodies once and accepts their owned art',async()=>{
 const h=await harness({messages:2,bundle:true});
 const snapshot=h.copy({version:1,people:[person('a','甲','黑色长发'),person('b','乙','白色短发')]});
 const memory=h.copy({chatId:'test-chat',archiveRevision:'r',characterName:'群像',userName:'User',memories:[]});
 const merged=h.module('generation/mergedGeneration.js');
 const task=merged.buildMergeTask('inbox',h.host,memory,null,new Date(),{participantSnapshot:snapshot});
 assert.equal(task.taskText.split('黑色长发').length-1,1);
 const sources=snapshot.people.flatMap(p=>p.sourceRefs.map(r=>r.content)).join('\n');
 const evidence=h.module('core/letterIllustrationV2.js').captureEvidence(envelope({name:'群像'}),snapshot,sources);
 merged.applyInboxEvidence(task,evidence);
 const session=task.accept(h.copy({letters:[{slot:'daily',title:'近况',greeting:'你好',body:'我正在喝茶。',closing:'乙'}]}));
 assert.equal(session.letters[0].illustration.characterName,'乙');assert.equal(h.providerCalls.length,0);
});
test('world-book CRLF normalization preserves the participant source binding',()=>{
 const snapshot={people:[person('a','甲','黑色长发\r\n性格温柔')]};
 const evidence=art.captureEvidence(envelope({},'黑色长发\n性格温柔'),snapshot);
 assert.ok(art.normalizeGenerated(design(),{characterEvidence:evidence,characterNames:['甲'],letterText:'我正在喝茶'}));
});
