import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import vm from 'node:vm';
// 重构清单 C-3b（r84.99）：core 不再 import generation；生成函数由各 generation 文件登记到 core/generationBridge.js。
const bridgeText = fs.readFileSync(new URL('../src/core/generationBridge.js', import.meta.url), 'utf8');
const NAMES = [...bridgeText.matchAll(/^export function (\w+)\(\.\.\.args\)/gm)].map(m => m[1]);

test('core files import no generation module', () => {
  for (const file of fs.readdirSync(new URL('../src/core/', import.meta.url))) {
    if (!file.endsWith('.js')) continue;
    const text = fs.readFileSync(new URL(`../src/core/${file}`, import.meta.url), 'utf8');
    assert.equal(/^import .* from '\.\.\/generation\//m.test(text), false, file);
  }
  assert.equal(NAMES.length, 11);
});

test('in the real bundle every bridged generation function is registered; the recovery cache key keeps its value', async () => {
  const el=()=>({style:{},dataset:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},setAttribute(){},appendChild(){},append(){},addEventListener(){},removeEventListener(){},querySelector:()=>null,querySelectorAll:()=>[]});
  const document={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],createElement:el,head:{appendChild(){}},body:el(),documentElement:{style:{setProperty(){}}},addEventListener(){},removeEventListener(){}};
  const host={chat:[],characters:[],chatMetadata:{},extensionSettings:{},saveSettingsDebounced(){},saveMetadata:async()=>{}};
  const ctx=vm.createContext({console:{log(){},warn(){},error(){}},TextEncoder,TextDecoder,AbortController,URL,Blob,Response,CompressionStream,DecompressionStream,Uint8Array,ArrayBuffer,DataView,queueMicrotask,setTimeout,clearTimeout,setInterval,clearInterval,performance,structuredClone,btoa,atob,crypto:globalThis.crypto,document,window:{addEventListener(){}},navigator:{},location:{protocol:'https:',origin:'https://x'},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},SillyTavern:{getContext:()=>host},toastr:{info(){},success(){},warning(){},error(){}}});
  const code=fs.readFileSync(new URL('../dist/heartbeatMemories.bundle.js', import.meta.url),'utf8');
  const paths=[...code.matchAll(/^\/\/ MODULE: (.+)$/gm)].map(m=>m[1]);
  const m=new vm.SourceTextModule(code+'\nexport const N={'+paths.map(f=>JSON.stringify(f)+':__m_'+f.replace(/[^a-zA-Z0-9]/g,'_')).join(',')+'};',{context:ctx});await m.link(()=>{});await m.evaluate();
  const N=m.namespace.N;
  const B = N['core/generationBridge.js'];
  for (const name of NAMES) assert.equal(B.generationBridgeRegistered(name), true, name);
  assert.equal(B.GENERATION_RECOVERY_CACHE_KEY, '__generationRecoveryV1');
  assert.equal(N['generation/recovery.js'].GENERATION_RECOVERY_CACHE_KEY, '__generationRecoveryV1');
  const home = { generateMode: 'generation/client.js', promptSafetyBoundary: 'generation/prompts.js', promptArchiveSlice: 'generation/prompts.js', normalizeCgPromptMetadata: 'generation/cgAppearance.js' };
  for (const name of NAMES) assert.ok(typeof N[home[name] || 'generation/recovery.js'][name] === 'function', `${name} still exported by its generation module`);
  assert.deepEqual(B.normalizeCgPromptMetadata({}), N['generation/cgAppearance.js'].normalizeCgPromptMetadata({}));
});

test('an unregistered name fails loudly instead of guessing', async () => {
  const fresh = await import(new URL('../src/core/generationBridge.js', import.meta.url).href + '?isolated');
  assert.throws(() => fresh.generateMode('room'), /尚未登记/);
});
