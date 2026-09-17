import test from 'node:test';
import assert from 'node:assert/strict';
import * as schema from '../src/modes/postcardDesign.js';
import * as renderer from '../src/ui/postcardDesignView.js';
import * as travel from '../src/modes/travel.js';
import * as view from '../src/ui/travelView.js';
import * as inbox from '../src/modes/inbox.js';
import {el,design,scenes,location} from './helpers/r8416DesignFixtures.mjs';
const memory={chatId:'a',archiveRevision:'rev',characterName:'林砚',userName:'小月',memories:[]};
const nodeCount=html=>(html.match(/<(?:path|rect|circle|ellipse|g|polygon|text)\b/g)||[]).length;
const saved=loc=>travel.normalizeTravel({locations:[loc]},memory,{structuredDesign:true}).locations[0];
const postcard=(loc)=>view.travelPostcardHtml(loc,{mapTheme:'neutral'},{recipient:'小月'});

test('explicit whitelist contains the 24 named kinds, not an invented 25th kind',()=>{
 assert.deepEqual(schema.DESIGN_KINDS,'peak hill shore water field tree grove reed flower leaf pavilion cabin tower bridge gate wall boat orb cloud bird rain snow star lantern'.split(' '));
});
for(const kind of schema.DESIGN_KINDS)test('real SVG cost equals declared descendant cost: '+kind,()=>{
 for(const size of ['s','m','l'])for(const layer of ['far','mid','near'])for(const sky of ['clear','snow']){
  const rows=kind==='boat'?[el('water','far',50,'l'),el(kind,layer,50,size)]:[el(kind,layer,50,size)];
  const d=design(rows,{sky}),html=renderer.renderPostcardDesign(d);
  assert.ok(html,kind);assert.equal(nodeCount(html),schema.postcardDesignNodeCount(d));assert.ok(nodeCount(html)<=90);
 }
});
for(const [name,d]of Object.entries(scenes))test('sample design '+name+' is bounded, deterministic, serializable and unchanged by rendering',()=>{
 const before=JSON.stringify(d),normalized=schema.normalizePostcardDesign(d);assert.ok(normalized);
 const html=renderer.renderPostcardDesign(d);assert.equal(html,renderer.renderPostcardDesign(JSON.parse(before)));
 assert.equal(nodeCount(html),schema.postcardDesignNodeCount(d));assert.equal(JSON.stringify(d),before);
 assert.ok(new TextEncoder().encode(JSON.stringify(normalized)).length<=8192);
 assert.match(html,/viewBox="0 0 120 86"/);assert.doesNotMatch(html,/url\(|href=|<script|foreignObject|style=|NaN|Infinity/);
});
test('21 and 50 elements reject whole design; 20 cheap elements accepted',()=>{
 assert.ok(schema.normalizePostcardDesign(design(Array.from({length:20},()=>el('leaf')))));
 for(const count of [21,50])assert.equal(schema.normalizePostcardDesign(design(Array.from({length:count},()=>el('leaf')))),null);
});
test('exact 90-node design accepted, 91 rejected before render',()=>{
 const rows=[el('water','mid',50,'l',6),el('water','near',50,'l',3),el('leaf','near',30,'s',6),el('leaf')];
 const d=design(rows);assert.equal(schema.postcardDesignNodeCount(d),90);assert.equal(nodeCount(renderer.renderPostcardDesign(d)),90);
 rows.push(el('leaf'));assert.equal(schema.normalizePostcardDesign(design(rows)),null);assert.equal(renderer.renderPostcardDesign(design(rows)), '');
});
test('compound repetition cannot bypass node budget',()=>{
 assert.equal(schema.normalizePostcardDesign(design(Array.from({length:10},()=>el('water','mid',50,'m',6)))),null);
});
test('numeric bounds clamp without coercion or executable conversion',()=>{
 const d=schema.normalizePostcardDesign(design([el('leaf','near',9999,'s',10000)]));assert.equal(d.elements[0].x,100);assert.equal(d.elements[0].count,6);
 assert.equal(schema.normalizePostcardDesign(design([el('leaf','near',NaN)])),null);
 assert.equal(schema.normalizePostcardDesign(design([el('leaf','near','50')])),null);
 let called=0;assert.equal(schema.normalizePostcardDesign(design([el('leaf','near',{valueOf(){called++;return 50;}})])),null);assert.equal(called,0);
});
test('unknown markup/keys/kinds reject, palette strings never become CSS',()=>{
 for(const extra of [{html:'<svg onload=x>'},JSON.parse('{"__proto__":{"polluted":true}}'),{url:'https://x'},{elements:[{...el('leaf'),path:'M1 2'}]}]) assert.equal(schema.normalizePostcardDesign({...scenes.pavilion,...extra}),null);
 assert.equal(schema.normalizePostcardDesign(design([el('<svg onload=alert()>') ])),null);
 assert.equal(schema.normalizePostcardDesign(design([el('constructor')])),null);
 assert.equal(schema.normalizePostcardDesign(design([el('leaf')],{palette:'#ff0000'})).palette,'paper');
});
test('no getter, toJSON, prototype setter or cyclic data execution',()=>{
 let invoked=0;
 const root={...scenes.pavilion};Object.defineProperty(root,'palette',{get(){invoked++;return 'night';},enumerable:true});assert.equal(schema.normalizePostcardDesign(root),null);
 const item={...el('leaf')};Object.defineProperty(item,'x',{get(){invoked++;return 30;},enumerable:true});assert.equal(schema.normalizePostcardDesign(design([item])),null);
 const json=JSON.parse('{"version":1,"__proto__":{"polluted":true},"elements":[]}');assert.equal(schema.normalizePostcardDesign(json),null);
 const loop={...scenes.pavilion};loop.elements=[loop];assert.equal(schema.normalizePostcardDesign(loop),null);
 const hook={...scenes.pavilion,toJSON(){invoked++;return {};} };assert.equal(schema.normalizePostcardDesign(hook),null);
 assert.equal(invoked,0);assert.equal({}.polluted,undefined);
});
test('UTF-8 and oversized/hostile free-text input bounded before serialization',()=>{
 assert.equal(schema.normalizePostcardDesign({...scenes.pavilion,palette:'叶'.repeat(9000)}),null);
 assert.equal(schema.normalizePostcardDesign({...scenes.pavilion,notes:'叶'.repeat(9000)}),null);
});
test('array holes, extra keys and accessors rejected',()=>{
 const rows=[el('leaf')];rows.extra='x';assert.equal(schema.normalizePostcardDesign(design(rows)),null);
 const sparse=Array(2);sparse[1]=el('leaf');assert.equal(schema.normalizePostcardDesign(design(sparse)),null);
 let called=0;const arr=[el('leaf')];Object.defineProperty(arr,'0',{get(){called++;return el('leaf');}});assert.equal(schema.normalizePostcardDesign(design(arr)),null);assert.equal(called,0);
});
test('boat requires explicit water; renderer never invents missing pavilion/boat/weather',()=>{
 assert.equal(schema.normalizePostcardDesign(design([el('boat')])),null);
 const html=renderer.renderPostcardDesign(design([el('peak')]));assert.doesNotMatch(html,/data-pd-kind="(?:boat|pavilion|snow|star|rain|orb)"/);
});
test('same schema changes real layout not keyword selection',()=>{
 const a=design([el('pavilion','mid',25)]),b=design([el('pavilion','mid',75)]),c=design([el('tower','near',70,'l')]);
 assert.notEqual(renderer.renderPostcardDesign(a),renderer.renderPostcardDesign(b));assert.notEqual(renderer.renderPostcardDesign(b),renderer.renderPostcardDesign(c));
 assert.doesNotMatch(renderer.renderPostcardDesign(a),/data-pd-kind="peak"/);
});
test('malicious title only appears as escaped accessible text, never markup',()=>{
 const html=renderer.renderPostcardDesign(scenes.pavilion,'"><img src=x onerror=go()>');assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|<script/);
});
test('new design survives normalization and canonical postcard alias',()=>{
 const a=saved(location());assert.deepEqual(a.keepsake.design,scenes.pavilion);assert.deepEqual(a.postcard.design,a.keepsake.design);
 assert.notEqual(a.postcard.design,a.keepsake.design);assert.equal(travel.travelKeepsakeForItem(a).design.elements[0].kind,'peak');
});
for(const bad of [undefined,null,{},design(Array.from({length:21},()=>el('leaf'))),{version:999}])test('bad/missing design preserves text and uses simple fallback: '+String(bad?.version),()=>{
 const loc=location();if(bad===undefined)delete loc.keepsake.design;else loc.keepsake.design=bad;
 const result=saved(loc);assert.equal(result.keepsake.body,loc.keepsake.body);assert.equal(result.keepsake.design,null);
 assert.match(postcard(result),/data-rmt-design-state="fallback"/);
});
test('new missing design must not re-enter r84.15 keyword pipeline',()=>{
 const loc=location();delete loc.keepsake.design;loc.keepsake.picturePlan={foreground:'pavilion',layout:'left'};
 const a=saved(loc);assert.equal(a.keepsake.picturePlan,null);assert.doesNotMatch(postcard(a),/data-rmt-plan-layout/);
});
test('legacy absent design remains absent and original legacy fields remain readable',()=>{
 const loc=location();delete loc.keepsake.design;loc.keepsake.picturePlan={foreground:'小亭',layout:'left'};
 const a=travel.normalizeTravel({locations:[loc]},memory).locations[0];assert.ok(!Object.hasOwn(a.keepsake,'design'));assert.match(postcard(a),/data-rmt-plan-layout="left"/);
});
test('keepsake wins over stale postcard for picture, body and mailbox',()=>{
 const a=saved(location('lake'));a.postcard={...a.postcard,body:'过时的文字',design:scenes.snow};
 const mailbox=inbox.postcardInboxItem(a,{chatId:'a',archiveRevision:'rev',locations:[a],mapTheme:'neutral'},memory);
 const letter=mailbox.letters[0];assert.equal(letter.body,a.keepsake.body);assert.deepEqual(letter.travelSnapshot.location.postcard.design,scenes.lake);
 assert.match(postcard(letter.travelSnapshot.location),/data-rmt-design-palette="night"/);
});
test('mail snapshot deep freezes design and later route edits cannot affect it',()=>{
 const a=saved(location()),session={chatId:'a',archiveRevision:'rev',locations:[a],mapTheme:'neutral'};
 const mail=inbox.postcardInboxItem(a,session,memory);const str=JSON.stringify(mail);
 a.keepsake.design.elements[0].x=99;a.keepsake.body='changed';assert.equal(JSON.stringify(mail),str);
});
test('same letter with changed design/ID is not collected twice; new body and evidence remain distinct',()=>{
 const a=saved(location()),b=saved(location('pavilion','F2'));b.keepsake.design=scenes.lake;b.postcard.design=scenes.lake;
 const session={chatId:'a',archiveRevision:'rev',locations:[a,b],mapTheme:'neutral'};
 const first=inbox.postcardInboxItem(a,session,memory),second=inbox.postcardInboxItem(b,session,memory);
 assert.equal(inbox.mergeInboxLatest(first,second).letters.length,1);
 b.keepsake.body+='另一份心情。';assert.equal(inbox.mergeInboxLatest(first,inbox.postcardInboxItem(b,session,memory)).letters.length,2);
 const h={...a,id:'F3',basis:'记忆',sourceMemoryIds:['M002'],sourceMemoryAnchor:'不同历史'};session.locations.push(h);
 assert.equal(inbox.mergeInboxLatest(first,inbox.postcardInboxItem(h,session,memory)).letters.length,2);
});
test('event key independent of design; accepted alias preserved for already collected legacy letter',()=>{
 const a=saved(location()),session={chatId:'a',archiveRevision:'rev',locations:[a],mapTheme:'neutral'};
 const first=inbox.postcardInboxItem(a,session,memory);a.keepsake.design=scenes.snow;
 assert.equal(inbox.postcardInboxItem(a,session,memory).letters[0].eventKey,first.letters[0].eventKey);
});
test('foreign archive cannot be imported and original cache not mutated on rejection',()=>{
 const a=saved(location()),session={chatId:'another',archiveRevision:'rev',locations:[a]};const before=JSON.stringify(session);
 assert.throws(()=>inbox.postcardInboxItem(a,session,memory));assert.equal(JSON.stringify(session),before);
});
test('new design cannot authorize fabricated shared history',()=>{
 const a=location();a.basis='记忆';a.sourceMemoryIds=['M999'];a.sourceMemoryAnchor='missing';assert.equal(travel.normalizeTravel({locations:[a]},memory,{allowPartial:true,structuredDesign:true}).locations.length,0);
 const b=location();b.keepsake.body='去年我们一起在这里举行了婚礼。';assert.equal(travel.normalizeTravel({locations:[b]},memory,{allowPartial:true,structuredDesign:true}).locations.length,0);
});
