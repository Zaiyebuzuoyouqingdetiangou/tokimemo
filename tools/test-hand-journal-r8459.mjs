import test from 'node:test';
import assert from 'node:assert/strict';
import * as journal from '../src/core/handJournal.js';

// Deterministic IDB API double: every readwrite transaction is serialized across
// separate connections and gets its own rollback copy. No alternate production
// storage backend is used; all production open/get/put/abort paths execute.
function idbFixture() {
 const rows=new Map();let serial=Promise.resolve();const api={rows,failPut:false,beforeGet:null};
 api.open=()=>{const request={};queueMicrotask(()=>{
  request.result={objectStoreNames:{contains:()=>true},createObjectStore:()=>{},close:()=>{},transaction(name,mode){
   assert.equal(name,'journals');assert.ok(['readonly','readwrite'].includes(mode));
   const operations=[];let aborted=false;const tx={error:null};
   tx.abort=()=>{aborted=true;};
   tx.objectStore=()=>({get(key){const req={};operations.push(()=>{api.beforeGet?.();req.result=structuredClone(local.get(key));req.onsuccess?.();});return req;},put(value){assert.equal(mode,'readwrite');const req={};const snapshot=structuredClone(value);operations.push(()=>{if(api.failPut)throw Object.assign(Error('quota'),{name:'QuotaExceededError'});local.set(snapshot.scope,snapshot);req.onsuccess?.();});return req;}});
   let local;
   serial=serial.then(async()=>{local=new Map([...rows].map(([k,v])=>[k,structuredClone(v)]));await new Promise(resolve=>setImmediate(resolve));try{while(operations.length&&!aborted){operations.shift()();await Promise.resolve();}if(aborted){tx.onabort?.();return;}if(mode==='readwrite'){rows.clear();for(const[k,v]of local)rows.set(k,v);}tx.oncomplete?.();}catch(error){tx.error=error;tx.onerror?.();}});
   return tx;
  }};request.onsuccess?.();});return request;};return api;
}
const entry=(text='正文',id='e1')=>({id,title:'题目',source:{mode:'inbox',id:'L1',title:'原信'},blocks:[{type:'text',text}]});
const page=(id='p1',text='正文')=>journal.createJournalPage({id,title:'手帐页',entries:[entry(text)],createdAt:123});

test('reading extraction preserves whitespace, sources and all image references while excluding transport/internal fields',()=>{
 const text='  第一行\n\n<script>alert(1)</script>\n尾部  ';
 const source={letters:[{id:'L1',title:'我的信',greeting:'开头',body:text,closing:'落款',prompt:'SECRET PROMPT',apiKey:'SECRET KEY',cgImage:{url:'/user/images/%E5%B2%9A.png',prompt:'SECRET IMAGE PROMPT'},cgImageHistory:[{url:'user/images/old.png'}],visuals:{ending:{cgImage:{url:'https://img.example.org/p.png'}}},illustration:{version:1,subject:'cat',action:'rest',palette:'cream',accessories:[]}}]};
 const [result]=journal.extractJournalEntries('inbox',source);assert.equal(result.blocks[1].text,text);assert.equal(result.source.id,'L1');assert.equal(result.source.title,'我的信');
 assert.deepEqual(result.blocks.filter(b=>b.type==='image').map(b=>b.url),['/user/images/%E5%B2%9A.png','/user/images/old.png','https://img.example.org/p.png']);
 assert.equal(result.blocks.at(-1).type,'letterIllustration');assert.doesNotMatch(JSON.stringify(result),/SECRET|apiKey|prompt/);
 const snapshot=journal.createJournalPage({id:'p1',entries:[result],title:'原题',createdAt:1});source.letters[0].body='新正文';assert.equal(snapshot.entries[0].blocks[1].text,text);assert.ok(Object.isFrozen(snapshot.entries[0].blocks));
});

test('explicit module maps keep chapter order, album dialogue and actual pastLives/HEART collections',()=>{
 const bedtime=journal.extractJournalEntries('bedtime',{stories:[{id:'S1',title:'故事',chapters:[{title:'章一',text:'  第一章 '},{title:'章二',text:'第二章\n'}]}]});
 assert.deepEqual(bedtime[0].blocks.map(b=>b.text),['章一','  第一章 ','章二','第二章\n']);
 assert.deepEqual(journal.extractJournalEntries('album',{entries:[{id:'A1',comments:['甲：你好','乙：好']} ]})[0].blocks.map(b=>b.text),['甲：你好','乙：好']);
 const past=journal.extractJournalEntries('pastLives',{episodes:[{id:'P1',dossiers:[{title:'卷一',synopsis:'简介',clues:[{title:'线索',text:'文字',revealedText:'显字'}]},{title:'卷二',synopsis:'尾卷'}]}]});
 assert.deepEqual(past[0].blocks.map(b=>b.text),['卷一','简介','线索','文字','显字','卷二','尾卷']);
 assert.equal(journal.extractJournalEntries('heart',{dailyStrips:[{id:'D1',panels:[{caption:'第一格'}]}],fireflyVoices:[{id:'F1',script:[{speaker:'char',text:'台词'}]}]}).length,2);
 assert.equal(journal.extractJournalEntries('adv',{events:[{id:'E1',adv:{paragraphs:['原正文']}}]})[0].blocks[0].text,'原正文');
});

test('portable JSON excludes scope/unknown secrets, rejects wrong types and does not truncate large pages',()=>{
 const text='空白\n '.repeat(20000);const pages=Array.from({length:80},(_,i)=>page('p'+i,text));
 const exported=journal.exportJournal(pages), imported=journal.importJournal(exported);assert.equal(imported.length,80);assert.equal(imported[79].entries[0].blocks[0].text,text);
 const data=JSON.parse(journal.exportJournal([page()]));data.scope='other';data.pages[0].apiKey='secret';assert.doesNotMatch(journal.exportJournal(journal.importJournal(data)),/other|secret|scope/);
 data.pages[0].entries[0].blocks[0].text={bad:true};assert.throws(()=>journal.importJournal(data),{code:'RMT_JOURNAL_DATA'});
 assert.throws(()=>journal.importJournal('{broken'),{code:'RMT_JOURNAL_DATA'});
});

test('image import permits ordinary local and HTTP(S) references but refuses executable and traversal URLs',()=>{
 for(const url of ['javascript:alert(1)','data:image/svg+xml,<svg/>','blob:https://example.org/a','//evil.org/x','/user/images/../x','/user/images/%2e%2e/x','https://u:p@example.org/a','/user/images/a\\b','https://example.org/a\n','/user/images/a%2fb']){
  assert.equal(journal.safeJournalImageUrl(url),'',url);const p=JSON.parse(journal.exportJournal([page()]));p.pages[0].entries[0].blocks=[{type:'image',url}];assert.throws(()=>journal.importJournal(p),{code:'RMT_JOURNAL_DATA'});
 }
 for(const url of ['/user/images/a.png','/characters/a.png','/custom/gallery/a.png','https://cdn.example.org/a.png','http://localhost:8000/user/images/a.png'])assert.equal(journal.safeJournalImageUrl(url),url);
});

test('actual IDB storage boundary saves/reopens and merges simultaneous append transactions without overwrites',async()=>{
 const idb=idbFixture();const store1=journal.createJournalStore({indexedDB:idb,currentScope:()=> 'a'}),store2=journal.createJournalStore({indexedDB:idb,currentScope:()=> 'a'});
 assert.deepEqual(await store1.read('a'),[]);
 await Promise.all([store1.append('a',[page('one')]),store2.append('a',[page('two')])]);
 const rows=await journal.createJournalStore({indexedDB:idb,currentScope:()=> 'a'}).read('a');assert.deepEqual(rows.map(p=>p.id),['one','two']);
 await store1.append('a',[page('one')]);assert.equal((await store1.read('a')).length,2);
 await assert.rejects(store1.append('a',[page('one','changed')]),{code:'RMT_JOURNAL_DATA'});assert.equal((await store1.read('a'))[0].entries[0].blocks[0].text,'正文');
});

test('scope changes before transaction write abort, distinct chats remain isolated, corrupt data stays intact',async()=>{
 const idb=idbFixture();let scope='a';const store=journal.createJournalStore({indexedDB:idb,currentScope:()=>scope});await store.append('a',[page('a')]);
 scope='b';await store.append('b',[page('b')]);assert.deepEqual((await store.read('b')).map(p=>p.id),['b']);await assert.rejects(store.append('a',[page('x')]),{code:'RMT_JOURNAL_SCOPE'});
 scope='a';idb.beforeGet=()=>{scope='b';};await assert.rejects(store.append('a',[page('late')]),{code:'RMT_JOURNAL_SCOPE'});idb.beforeGet=null;scope='a';assert.equal((await store.read('a')).length,1);
 idb.rows.set('a',{scope:'a',version:1,pages:'broken'});const before=structuredClone(idb.rows.get('a'));await assert.rejects(store.read('a'),{code:'RMT_JOURNAL_DATA'});await assert.rejects(store.append('a',[page('new')]),{code:'RMT_JOURNAL_DATA'});assert.deepEqual(idb.rows.get('a'),before);
});

test('quota-like put failure leaves old pages committed and incoming snapshots available for export',async()=>{
 const idb=idbFixture(),store=journal.createJournalStore({indexedDB:idb,currentScope:()=> 'a'});await store.append('a',[page('old')]);idb.failPut=true;const unsaved=page('new');await assert.rejects(store.append('a',[unsaved]),{code:'RMT_JOURNAL_STORAGE'});idb.failPut=false;assert.deepEqual((await store.read('a')).map(p=>p.id),['old']);assert.equal(journal.importJournal(journal.exportJournal([unsaved]))[0].id,'new');
});

test('production normalizers retain reader fields for greetings, comic panels, nested items and calendar day supplements',async()=>{
 const [heart,items,calendar,constants]=await Promise.all([import('../src/modes/heart.js'),import('../src/modes/items.js'),import('../src/modes/calendar.js'),import('../src/core/constants.js')]);
 const memory={characterName:'甲',userName:'乙',chatId:'c',archiveRevision:'r',memories:[]};
 for(const mode of Object.values(constants.MODE))assert.ok(Object.hasOwn(journal.JOURNAL_READING_FIELDS,mode),'explicit source mapping '+mode);
 const session=heart.normalizeHeart({greetings:{morning:['早安原文']}},memory);
 const strips=heart.normalizeHeartStripsPart({dailyStrips:[{id:'d',title:'日常',panelCount:2,imagePrompt:'private prompt',panels:[{caption:'一',action:'靠窗看书',charLine:'你好',userLine:'好'},{caption:'二',action:'翻页',charLine:'看这里',userLine:'嗯'}]}]});
 session.dailyStrips=strips;const extracted=journal.extractJournalEntries('heart',session);assert.ok(extracted.some(e=>e.blocks.some(b=>b.text==='早安原文')));assert.deepEqual(extracted.find(e=>e.source.id==='d').blocks.map(b=>b.text),['一','靠窗看书','你好','好','二','翻页','看这里','嗯']);
 const normalized=items.normalizeItems({containers:[{id:'box',label:'抽屉',description:'木制抽屉',nodes:[{id:'outer',label:'信封',summary:'纸质信封',line:'拆开吧',children:[{id:'inner',label:'纸条',summary:'淡黄色纸张',line:'给你'}]}]}]},memory);
 const savedItems=journal.extractJournalEntries('items',normalized);assert.equal(savedItems.length,3);assert.ok(savedItems.find(e=>e.source.id==='inner').blocks.some(b=>b.text==='给你'));
 const day=calendar.createCalendarDayPage('date:2026/09/24');day.drafts=[{id:'draft',text:'原草稿\n第二行',createdAt:1}];day.manualTodos=[{id:'todo',title:'买纸',completed:false}];
 const cal=calendar.migrateCalendarSession({kind:'calendar',calendarVersion:5,entries:[],dayPages:{'date:2026/09/24':day}},memory);
 const calEntries=journal.extractJournalEntries('calendar',cal);assert.ok(calEntries.some(e=>e.blocks.some(b=>b.text==='原草稿\n第二行')));assert.ok(calEntries.some(e=>e.blocks.some(b=>b.text==='买纸')));
});

test('all public mode reader shapes yield selectable text instead of silently empty sections',async()=>{
 const {MODE}=await import('../src/core/constants.js');
 const fixtures={
  butterfly:{nodes:[{id:'b1',label:'分歧',monologue:'平行世界发言',intervention:'此刻回应',systemNote:'观测结语'}]},
  album:{entries:[{id:'a1',desc:'回忆画面',comments:['共同对白']}]},adv:{events:[{id:'a1',adv:{paragraphs:['ADV正文']}}]},
  room:{homeSummary:'他的住处',spaces:[{id:'s1',label:'书房',atmosphere:'午后微光',objects:[{label:'书',description:'旧书封面',line:'翻开看看'}]}],lifePlan:{beats:[{time:'傍晚',participants:[{activity:'看书',line:'一起看吧'}]}]}},
  items:{containers:[{id:'box',label:'抽屉',nodes:[{id:'item',label:'纸条',summary:'一封便条',line:'给你'}]}]},cabinet:{items:[{id:'c1',name:'车票',objectEvidence:'甲和乙一起留下了车票'}]},
  phone:{apps:[{id:'app',entries:[{id:'message',detail:'聊天开头',messages:[{speaker:'甲',text:'原消息'}]}]}]},
  inbox:{letters:[{id:'l1',body:'来信正文'}]},themeSong:{songs:[{id:'song',lyrics:'[Verse]\n原歌词'}]},
  bedtime:{stories:[{id:'story',chapters:[{title:'第一章',text:'睡前故事'}]}]},pastLives:{episodes:[{id:'past',opening:{text:'前世引子'}}]},timeEcho:{episodes:[{id:'echo',opening:'电话接通',lines:[{speaker:'a',text:'时空的另一边'}],closing:'回响结束'}]},
  travel:{locations:[{id:'far',postcard:{title:'远方来信',greeting:'你好',body:'明信片原文',closing:'落款'}}]},
  ending:{endings:[{id:'ending',endingScene:'终章',epilogue:{scenes:[{title:'后日谈',text:'之后的生活'}]}}]},
  calendar:{entries:[{id:'day',title:'纪念日',date:'2026/09/24'}],dayPages:{'date:2026/09/24':{drafts:[{id:'draft',text:'草稿正文'}]}}},
  relations:{relationships:[{id:'relation',name:'丙',relation:'友人',npcPerspective:'朋友的视角'}]},
  heart:{greetings:{morning:['早安']},voiceDramas:[{id:'voice',script:[{speaker:'char',text:'春天的对白'}]}]},
  achievements:{entries:[{id:'ach',description:'一起走到这里'}]},
 };
 for(const mode of Object.values(MODE)){const entries=journal.extractJournalEntries(mode,fixtures[mode]);assert.ok(entries.length>0,mode);assert.ok(entries.some(e=>e.blocks.some(b=>b.type==='text'&&b.text.length)),mode);}
 assert.equal(journal.safeJournalImageUrl('/my saved pictures/图一.png'),'/my%20saved%20pictures/%E5%9B%BE%E4%B8%80.png');
 assert.equal(journal.safeJournalImageUrl('my saved pictures/图一.png'),'/my%20saved%20pictures/%E5%9B%BE%E4%B8%80.png');
});
