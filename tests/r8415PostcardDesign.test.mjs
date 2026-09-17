import test from 'node:test';
import assert from 'node:assert/strict';
import * as travel from '../src/modes/travel.js';
import * as travelView from '../src/ui/travelView.js';
import * as inbox from '../src/modes/inbox.js';

const memory={chatId:'audit-a',archiveRevision:'audit-r',characterName:'林舟',userName:'小月',memories:[]};
const letter='此刻站在山顶，眼前的白雪落在山脊，我把安静的风写进这张寄给你的明信片。';

function loc(id='F1', extra={}) {return {id,kind:'far',name:'雪峰观景台',region:'远方',basis:'推演',summary:'眼前是雪山。',sceneTheme:'mountain',sourceMemoryIds:[],sourceMemoryAnchor:'',
 keepsake:{kind:'postcard',title:'峰顶来信',body:letter,closing:'林舟',tone:'paper'},...extra};}

const normalize=(rows,options={})=>travel.normalizeTravel({locations:rows},memory,{...options});

const customPlan={
  summary:'前景是一座带栏杆的小亭，远景是雪峰。',
  foreground:'小亭与山道',
  midground:'石阶和风吹动的旗帜',
  background:'覆雪山脊与云层',
  details:'左侧留出一条上山小路',
  atmosphere:'清冷安静的午后',
  layout:'left',
};

test('keepsake picturePlan is normalized and preserved on accepted travel items',()=>{
  const item=normalize([loc('F1',{keepsake:{...loc().keepsake,picturePlan:customPlan}})]).locations[0];
  assert.deepEqual(item.keepsake.picturePlan,customPlan);
});

test('picturePlan changes postcard illustration layout and motif while text stays local-safe',()=>{
  const base=travelView.travelPostcardHtml(loc('F1'),{mapTheme:'neutral'},{recipient:'小月'});
  const planned=travelView.travelPostcardHtml(loc('F2',{keepsake:{...loc().keepsake,picturePlan:customPlan}}),{mapTheme:'neutral'},{recipient:'小月'});
  assert.notEqual(base,planned);
  assert.match(planned,/data-rmt-plan-layout="left"/);
  assert.match(planned,/data-rmt-postcard-theme="mountain"/);
  assert.ok((planned.match(/class="pc-solid"/g)||[]).length>(base.match(/class="pc-solid"/g)||[]).length);
});

test('neutral base theme can be guided by picturePlan into a better-matching local scene',()=>{
  const item=loc('F1',{name:'远方',summary:'此刻写一封信。',sceneTheme:'neutral',keepsake:{...loc().keepsake,body:'午后在湖边码头写信。',picturePlan:{summary:'湖边码头停着小船',foreground:'木栈桥与小船',background:'平静湖面',details:'右侧',atmosphere:'有风的白天',layout:'right'}}});
  const html=travelView.travelPostcardHtml(item,{mapTheme:'neutral'},{recipient:'小月'});
  assert.match(html,/data-rmt-postcard-theme="coast"/);
  assert.match(html,/data-rmt-plan-layout="right"/);
});

test('picturePlan survives postcard-to-inbox snapshot and reopens with the same layout guidance',()=>{
  const current=normalize([loc('F1',{keepsake:{...loc().keepsake,picturePlan:customPlan}})]).locations[0];
  const travelSession={kind:'travel',chatId:memory.chatId,archiveRevision:memory.archiveRevision,mapTheme:'neutral',locations:[current]};
  const mail=inbox.postcardInboxItem(current,travelSession,memory);
  assert.deepEqual(mail.letters[0].travelSnapshot.location.postcard.picturePlan,customPlan);
  const html=travelView.travelPostcardHtml(mail.letters[0].travelSnapshot.location,mail.letters[0].travelSnapshot,{recipient:'小月'});
  assert.match(html,/data-rmt-plan-layout="left"/);
});

test('malicious picturePlan remains inert and does not escape into markup or handlers',()=>{
  const evil={summary:'<script>bad()</script> 左侧灯塔',foreground:'<img src=x onerror=bad()>',details:'right',layout:'right'};
  const html=travelView.travelPostcardHtml(loc('F1',{sceneTheme:'neutral',keepsake:{...loc().keepsake,picturePlan:evil}}),{mapTheme:'neutral'},{recipient:'小月'});
  assert.doesNotMatch(html,/<script>|<img src=x|onerror=|onclick=/);
  assert.match(html,/data-rmt-plan-layout="right"/);
});
