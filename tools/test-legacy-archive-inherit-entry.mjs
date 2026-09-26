import test from 'node:test';
import assert from 'node:assert/strict';
// r84.74: 角色页（档案室 → 某个角色）在“当前聊天无档案且本角色有可继承旧档案”时固定显示继承入口。
// 运行真实打包产物；宿主、界面容器与档案索引在命名空间边界替换。
import fs from 'node:fs'; import vm from 'node:vm';
const el=()=>({style:{},dataset:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},setAttribute(){},appendChild(){},append(){},addEventListener(){},removeEventListener(){},querySelector:()=>null,querySelectorAll:()=>[]});
const document={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],createElement:el,head:{appendChild(){}},body:el(),documentElement:{style:{setProperty(){}}},addEventListener(){},removeEventListener(){}};
const host={chat:[],characters:[],chatMetadata:{},extensionSettings:{},saveSettingsDebounced(){},saveMetadata:async()=>{}};
const ctx=vm.createContext({console:{log(){},warn(){},error(){}},TextEncoder,TextDecoder,AbortController,URL,Blob,Response,CompressionStream,DecompressionStream,Uint8Array,ArrayBuffer,DataView,queueMicrotask,setTimeout,clearTimeout,setInterval,clearInterval,performance,structuredClone,btoa,atob,crypto:globalThis.crypto,document,window:{addEventListener(){}},navigator:{},location:{protocol:'https:',origin:'https://x'},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},SillyTavern:{getContext:()=>host},toastr:{info(){},success(){},warning(){},error(){}}});
const code=fs.readFileSync(new URL('../dist/heartbeatMemories.bundle.js', import.meta.url),'utf8');
const paths=[...code.matchAll(/^\/\/ MODULE: (.+)$/gm)].map(m=>m[1]);
const m=new vm.SourceTextModule(code+'\nexport const N={'+paths.map(f=>JSON.stringify(f)+':__m_'+f.replace(/[^a-zA-Z0-9]/g,'_')).join(',')+'};',{context:ctx});await m.link(()=>{});await m.evaluate();
const N=m.namespace.N; const body={innerHTML:''};
Object.assign(N['ui/overlay.js'],{openOverlay(){},setRegenerateVisible(){},setManageVisible(){},setBackVisible(){},topTitle(){},bodyEl:()=>body,formatArchiveTime:()=>'t'});
const A={id:'a',chatId:'old',archiveName:'旧档',characterName:'方祁洛',characterKey:'k',memoryCount:3,updatedAt:2}, B={...A,id:'b',chatId:'old2',updatedAt:1};
Object.assign(N['archive/groups.js'],{archiveGroupEntries:()=>[A,B],archiveGroupMeta:()=>({characterName:'方祁洛'}),archiveGroupAvatarUrl:()=>'',matchArchiveEntryToCharacter:()=>null,characterDescriptor:()=>null});
Object.assign(N['modes/relations.js'],{archiveCharacterProfileKey:()=>'k',getCharacterProfile:()=>null,characterProfileHtml:()=>'<PROFILE>'});
Object.assign(N['core/context.js'],{currentCharacterGuard:()=>({}),archiveIndexEntryId:e=>e.id,getContext:()=>host});
const run=(mem,cands)=>{N['archive/repository.js'].getImportedMemory=()=>mem;N['archive/inheritance.js'].inheritanceCandidates=()=>cands;N['archive/library.js'].showArchiveCharacter('k');return body.innerHTML;};
const has=h=>h.includes('data-rmt-action="archive-inheritance-open"');
test('r84.74 character page shows the inheritance entry only when the current chat can inherit from this character', () => {
  const shown=run(null,[A]);
  assert.equal(has(shown),true);
  assert.ok(shown.indexOf('<PROFILE>')<shown.indexOf('archive-inheritance-open'));
  assert.ok(shown.indexOf('archive-inheritance-open')<shown.indexOf('CHAT ARCHIVES'));
  assert.equal(has(run({memories:[]},[A])),false,'current chat already has an archive');
  assert.equal(has(run(null,[{id:'other'}])),false,'candidate belongs to another character page');
  assert.equal(has(run(null,[])),false,'no candidates');
});
