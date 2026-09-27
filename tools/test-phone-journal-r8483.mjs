import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {preparationFixture} from './preparation-harness-r8481.mjs';
import {writeFile,readFile} from 'node:fs/promises';
async function fixture(){
 const f=await preparationFixture(),original=f.api,memo=new Map();
 f.api=async path=>{if(memo.has(path))return memo.get(path);try{return await original(path);}catch(error){if(error.code!=='ERR_VM_MODULE_STATUS')throw error;}
 const module=new vm.SourceTextModule(await readFile(new URL('../src/'+path,import.meta.url),'utf8'),{context:f.sandbox});
 await module.link(async spec=>{const target=new URL(spec,new URL('../src/'+path,import.meta.url)).pathname.split('/src/')[1];let ns;
 if(target==='ui/workspace.js')ns={};else ns=await f.api(target);
 return new vm.SyntheticModule(Object.keys(ns),function(){for(const key of Object.keys(ns))this.setExport(key,ns[key]);},{context:f.sandbox});});await module.evaluate();memo.set(path,module.namespace);return module.namespace;};return f;
}
test('journal palettes survive export/import, old pages stay readable, unsafe colors ignored',async()=>{
 const f=await fixture(),j=await f.api('core/handJournal.js');
 const page=j.createJournalPage({id:'p',createdAt:1,title:'旧文字',entries:[],palette:{id:'mint',paper:'#abcdef',ink:'#123456',accent:'#678901'}});
 assert.equal(j.importJournal(j.exportJournal([page]))[0].palette.paper,'#abcdef');
 assert.equal(j.createJournalPage({id:'old',createdAt:1,title:'旧页',entries:[]}).palette,undefined);
 assert.equal(j.journalPalette({paper:'red;display:none'}).paper,'#f0faf5');
 assert.equal(j.JOURNAL_PALETTES.length,6);
});
test('phone rendering retains conversation and removes repeated provenance, preview uses real renderers',async()=>{
 const f=await fixture(),p=await f.api('ui/phoneView.js'),j=await f.api('ui/handJournalView.js'),core=await f.api('core/handJournal.js'),css=await f.api('ui/css/phoneMobileCss.js');
 const entry={title:'留给你的话',detail:'雨停以后，一起去散步吧。',meta:'未发送草稿 · 不代表历史记录',conversationMode:'draft',messages:[{speakerRole:'owner',speaker:'岚',text:'把伞放在门边了。'}],fields:[{label:'日期',value:'9月26日'}]};
 const html=p.renderPhoneEntryDetail(entry,{kind:'chat',label:'微聊'},{ownerName:'岚'});
 assert.match(html,/把伞放在门边了/);assert.doesNotMatch(html,/不代表|非历史/);assert.equal(entry.meta,'未发送草稿 · 不代表历史记录');
 const cssText=Object.values(css).find(x=>typeof x==='function')();
 const cards=['chat','notes','music','finance','gallery','reading'].map(kind=>`<section class="rmt-phone-page rmt-phone-page-${kind}"><h2>${kind}</h2>${p.renderPhoneEntryDetail(entry,{kind,label:kind},{ownerName:'岚'})}</section>`).join('');
 const papers=core.JOURNAL_PALETTES.map((palette,index)=>j.journalPageHtml(core.createJournalPage({id:'p'+index,createdAt:1,title:palette.label,palette,entries:[{id:'e',title:'一起走过的午后',source:{mode:'inbox',id:'e',title:'来信'},blocks:[{type:'text',text:'风把窗边的书页轻轻翻过。这些小小的片段，都想留给你。'}]}]}),index)).join('');
 await writeFile(new URL('./phone-journal-r8483-interactive.html',import.meta.url),`<!doctype html><meta charset="utf-8"><title>Phone journal r8483</title><style>${cssText}body{margin:20px;background:#eef2f4;font:15px/1.7 system-ui;color:#344958}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px}.rmt-phone-page{padding:20px;border-radius:18px;min-height:300px}.rmt-btn{padding:8px;border:1px solid #ccd7dd;border-radius:20px;background:white;color:#345}.rmt-journal-page{padding:24px;margin:15px;border-radius:18px}.rmt-phone-detail-toolbar{display:flex;gap:12px}.rmt-phone-message{padding:12px}.rmt-phone-record-copy{white-space:pre-wrap}</style><h1>实际渲染函数 · 应用与信纸预览</h1><div class="grid">${cards}</div><h2>六组信纸</h2><div class="grid">${papers}</div>`);
 const source=await readFile(new URL('../src/ui/handJournalView.js',import.meta.url),'utf8');assert.doesNotMatch(source,/WHOLE_PAGE_LIMIT/);assert.match(source,/store.palette/);
});
test('palette save keeps page content and survives independent store reopen',async()=>{
 const f=await fixture(),j=await f.api('core/handJournal.js');let saved;
 const indexedDB={open(){const request={};queueMicrotask(()=>{request.result={objectStoreNames:{contains:()=>true},close(){},transaction(){const tx={objectStore(){return {get(){const r={};setTimeout(()=>{r.result=saved; r.onsuccess();setTimeout(()=>tx.oncomplete?.(),0);},0);return r;},put(value){saved=JSON.parse(JSON.stringify(value));}}},abort(){tx.onabort?.();}};return tx;}};request.onsuccess();});return request;}};
 const store=j.createJournalStore({indexedDB,currentScope:()=> 'same-chat'});
 const page=j.createJournalPage({id:'saved',createdAt:1,title:'不可丢失',entries:[]});await store.append('same-chat',[page]);
 await store.palette('same-chat','saved',{id:'sky',paper:'#e1eefa',ink:'#234567',accent:'#89abcd'});
 const reopened=await j.createJournalStore({indexedDB,currentScope:()=> 'same-chat'}).read('same-chat');
 assert.equal(reopened[0].title,'不可丢失');assert.equal(reopened[0].palette.paper,'#e1eefa');
 await store.rename('same-chat','saved','新标题');assert.equal((await store.read('same-chat'))[0].palette.ink,'#234567');
});
