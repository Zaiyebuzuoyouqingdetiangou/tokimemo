import test from 'node:test';
import assert from 'node:assert/strict';
import { render, normalizeGenerated } from '../src/core/letterIllustrationV2.js';
import { roomInteriorHtml, roomArchitectureKind } from '../src/ui/roomInterior.js';
import { roomDrawingKind } from '../src/ui/roomObjectDrawing.js';
const design = evidence => ({version:2, characterName:'岚', focus:'person', visualFacts:[{kind:'eyeColor',value:'amber',evidence:'琥珀色眼睛'}],scene:{kind:'music',evidence}});
test('missing hair facts do not render an exposed bald scalp and do not mutate archived design',()=>{
 const d=design('在钢琴旁演奏。'), before=JSON.stringify(d); const html=render(d);
 assert.match(html,/unspecified-pencil/); assert.equal(JSON.stringify(d),before);
});
test('two music letters use their piano or record-store scene, not identical music-note composition',()=>{
 const piano=render(design('在琴房的钢琴前演奏。')); const records=render(design('街角音像店放着音乐，挑了唱片。'));
 assert.match(piano,/data-rmt-letter-setting="piano"/); assert.match(records,/data-rmt-letter-setting="records"/);
 assert.doesNotMatch(piano,/data-rmt-letter-scene-motif="music"/);
 assert.notEqual(piano,records);
});
test('English intervening hair colour remains recognized instead of losing hair length',()=>{
 const d=normalizeGenerated(null,{characterNames:['岚'],characterEvidence:'short black hair, amber eyes',letterText:'岚在琴房演奏音乐。'});
 assert.ok(d); assert.ok(d.visualFacts.some(f=>f.kind==='hairLength'&&f.value==='short'));
});
test('selected room name reaches semantic architecture while objects stay reachable',()=>{
 const layout=[{id:'A',number:1,item:{label:'老式山地自行车'},visualKind:'other'}];
 const balcony=roomInteriorHtml(layout,{space:{label:'老阳台',spaceType:'阳台'}});
 const bedroom=roomInteriorHtml(layout,{space:{label:'卧室'}});
 const study=roomInteriorHtml(layout,{space:{label:'书房'}});
 assert.match(balcony,/data-rmt-architecture="balcony"/); assert.match(bedroom,/data-rmt-architecture="bedroom"/);
 assert.match(study,/data-rmt-architecture="study"/); assert.notEqual(balcony,bedroom);
 assert.match(balcony,/data-rmt-room-id="A"/); assert.match(balcony,/data-rmt-furniture="bicycle"/);
 assert.equal(roomArchitectureKind({label:'琴房兼书房练习室'}),'music');
 assert.equal(roomDrawingKind('墙边的木吉他','other'),'guitar');
});
test('shared occupants retain the selected balcony shell and malicious labels remain escaped',()=>{
 const html=roomInteriorHtml([{id:'x',item:{label:'<img onerror=bad>'}}],{space:{label:'阳台'},participants:[{id:'p',name:'岚',figure:{}}]});
 assert.match(html,/data-rmt-architecture="balcony"/); assert.doesNotMatch(html,/<img onerror/); assert.match(html,/&lt;img/);
});
test('night outdoor shells follow local clock option without changing stored space or objects',()=>{
 const space={label:'阳台'}; const saved=JSON.stringify(space);
 const day=roomInteriorHtml([],{space});const night=roomInteriorHtml([],{space,night:true});
 assert.match(day,/#cbdde6/);assert.match(night,/#273848/);assert.doesNotMatch(night,/#cbdde6/);
 assert.equal(JSON.stringify(space),saved);
});
test('music scenes change character gesture and held prop rather than only scenery',()=>{
 const piano=render(design('琴房演奏钢琴。'));const record=render(design('音像店挑唱片听音乐。'));const guitar=render(design('抱起吉他唱歌。'));
 assert.match(piano,/playing-keys/);assert.match(piano,/piano-bench/);
 assert.match(record,/selecting-record/);assert.match(record,/data-rmt-letter-held="record"/);
 assert.match(guitar,/holding-guitar/);assert.match(guitar,/data-rmt-letter-held="guitar"/);
});
