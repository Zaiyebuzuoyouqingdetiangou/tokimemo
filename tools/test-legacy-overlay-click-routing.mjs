import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import vm from 'node:vm';
// 重构阶段 3：主窗口点击分发拆成分组后，真实打包产物里各组的按钮仍路由到原处理函数。
const el=()=>({style:{},dataset:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},setAttribute(){},appendChild(){},append(){},addEventListener(){},removeEventListener(){},querySelector:()=>null,querySelectorAll:()=>[]});
const document={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],createElement:el,head:{appendChild(){}},body:el(),documentElement:{style:{setProperty(){}}},addEventListener(){},removeEventListener(){}};
const host={chat:[],characters:[],chatMetadata:{},extensionSettings:{},saveSettingsDebounced(){},saveMetadata:async()=>{}};
const ctx=vm.createContext({console:{log(){},warn(){},error(){}},TextEncoder,TextDecoder,AbortController,URL,Blob,Response,CompressionStream,DecompressionStream,Uint8Array,ArrayBuffer,DataView,queueMicrotask,setTimeout,clearTimeout,setInterval,clearInterval,performance,structuredClone,btoa,atob,crypto:globalThis.crypto,document,window:{addEventListener(){}},navigator:{},location:{protocol:'https:',origin:'https://x'},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},SillyTavern:{getContext:()=>host},toastr:{info(){},success(){},warning(){},error(){}}});
const code=fs.readFileSync(new URL('../dist/heartbeatMemories.bundle.js', import.meta.url),'utf8');
const paths=[...code.matchAll(/^\/\/ MODULE: (.+)$/gm)].map(m=>m[1]);
const m=new vm.SourceTextModule(code+'\nexport const N={'+paths.map(f=>JSON.stringify(f)+':__m_'+f.replace(/[^a-zA-Z0-9]/g,'_')).join(',')+'};',{context:ctx});await m.link(()=>{});await m.evaluate();
const N=m.namespace.N;
const calls=[];
const spy=(file,name)=>{N[file][name]=(...args)=>{calls.push(`${name}:${JSON.stringify(args[0])}`);};};
spy('ui/advEventView.js','advStep'); spy('ui/advEventView.js','advEventStep'); spy('archive/snapshots.js','renderArchiveOverviewAsync'); spy('ui/pastLivesView.js','handlePastLivesAction');
N['ui/workspace.js'].handleWorkspaceClick=()=>false; N['ui/languageView.js'].handleLanguageClick=()=>false;
N['ui/archiveInheritance.js'].clearArchiveInheritancePreview=()=>{};
const click=(selectorHit)=>{ const target={closest:sel=>{ for(const [k,v] of Object.entries(selectorHit)) if(sel===k) return v; return null; }};
  const overlayEl={querySelector:()=>null,querySelectorAll:()=>[]};
  N['ui/overlay.js'].handleOverlayClick({target,currentTarget:overlayEl,preventDefault(){},stopPropagation(){}}); };
const act=a=>({'[data-rmt-action]':{dataset:{rmtAction:a}}});
test('overlay click groups still route buttons to their original handlers', () => {
  calls.length=0; click(act('adv-next')); assert.deepEqual(calls,['advStep:1']);
  calls.length=0; click(act('adv-event-prev')); assert.deepEqual(calls,['advEventStep:-1']);
  calls.length=0; click(act('archive-overview-refresh')); assert.deepEqual(calls,['renderArchiveOverviewAsync:{"force":true}']);
  calls.length=0; click({'[data-rmt-past-lives]':{dataset:{rmtPastLives:'open',rmtPastLivesId:'x'}}}); assert.equal(calls[0],'handlePastLivesAction:"open"');
  calls.length=0; click(act('no-such-action')); assert.deepEqual(calls,[]);
});
