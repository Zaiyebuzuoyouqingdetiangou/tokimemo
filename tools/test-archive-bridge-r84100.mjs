import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import vm from 'node:vm';
// 重构清单 C-3c（r84.100 第一轮、r84.101 第二轮）：core 不再 import archive；角色身份描述挪到 core。
const bridgeText = fs.readFileSync(new URL('../src/core/archiveBridge.js', import.meta.url), 'utf8');
const NAMES = [...bridgeText.matchAll(/^export function (\w+)\(\.\.\.args\)/gm)].map(m => m[1]);
// r84.101（C-3c 第二轮）：所有 core 文件都不再 import archive。
test('no core file imports an archive module', () => {
  for (const file of fs.readdirSync(new URL('../src/core/', import.meta.url))) {
    if (!file.endsWith('.js')) continue;
    const text = fs.readFileSync(new URL(`../src/core/${file}`, import.meta.url), 'utf8');
    assert.equal(/^import .* from '\.\.\/archive\//m.test(text), false, file);
  }
  assert.equal(NAMES.length, 22);
});

test('in the real bundle every bridged archive function is registered; characterDescriptor is one function in core', async () => {
  const el=()=>({style:{},dataset:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},setAttribute(){},appendChild(){},append(){},addEventListener(){},removeEventListener(){},querySelector:()=>null,querySelectorAll:()=>[]});
  const document={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],createElement:el,head:{appendChild(){}},body:el(),documentElement:{style:{setProperty(){}}},addEventListener(){},removeEventListener(){}};
  const host={chat:[],characters:[],chatMetadata:{},extensionSettings:{},saveSettingsDebounced(){},saveMetadata:async()=>{}};
  const ctx=vm.createContext({console:{log(){},warn(){},error(){}},TextEncoder,TextDecoder,AbortController,URL,Blob,Response,CompressionStream,DecompressionStream,Uint8Array,ArrayBuffer,DataView,queueMicrotask,setTimeout,clearTimeout,setInterval,clearInterval,performance,structuredClone,btoa,atob,crypto:globalThis.crypto,document,window:{addEventListener(){}},navigator:{},location:{protocol:'https:',origin:'https://x'},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},SillyTavern:{getContext:()=>host},toastr:{info(){},success(){},warning(){},error(){}}});
  const code=fs.readFileSync(new URL('../dist/heartbeatMemories.bundle.js', import.meta.url),'utf8');
  const paths=[...code.matchAll(/^\/\/ MODULE: (.+)$/gm)].map(m=>m[1]);
  const m=new vm.SourceTextModule(code+'\nexport const N={'+paths.map(f=>JSON.stringify(f)+':__m_'+f.replace(/[^a-zA-Z0-9]/g,'_')).join(',')+'};',{context:ctx});await m.link(()=>{});await m.evaluate();
  const N=m.namespace.N;
  const B = N['core/archiveBridge.js'];
  for (const name of NAMES) assert.equal(B.archiveBridgeRegistered(name), true, name);
  assert.equal(N['archive/groups.js'].characterDescriptor, N['core/characterDescriptor.js'].characterDescriptor);
  const context = { characterId: 0, characters: [{ name: '岚', avatar: 'lan.png' }] };
  assert.deepEqual(N['core/characterDescriptor.js'].characterDescriptor(context, 0), N['archive/groups.js'].characterDescriptor(context, 0));
});

test('an unregistered name fails loudly instead of guessing', async () => {
  const fresh = await import(new URL('../src/core/archiveBridge.js', import.meta.url).href + '?isolated');
  assert.throws(() => fresh.getImportedMemory({}), /尚未登记/);
});
