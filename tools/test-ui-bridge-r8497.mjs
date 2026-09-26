import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import vm from 'node:vm';
// 重构清单 C-2（r84.97）：core 不再 import ui；ui 函数经 core/uiBridge.js 转过去。
const bridgeSource = new URL('../src/core/uiBridge.js', import.meta.url);

test('bridge before registration: confirmation is treated as not confirmed, refresh does nothing', async () => {
  const bridge = await import(bridgeSource.href + '?fresh');
  assert.equal(bridge.confirmExplicitAction('t', 'b'), false);
  assert.equal(bridge.refreshSettingsTaskStatus(), undefined);
  bridge.registerUiBridge({ confirmExplicitAction: (title) => `ok:${title}`, notAHook: () => 1 });
  assert.equal(bridge.confirmExplicitAction('t'), 'ok:t');
});

test('core modules no longer import the ui layer', () => {
  for (const file of ['core/recoverySourcePolicy.js', 'core/requestTaskCenter.js']) {
    const text = fs.readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.equal(/from '\.\.\/ui\//.test(text), false, file);
  }
});

test('in the real bundle the entry registers the bridge and calls reach the (replaceable) ui functions', async () => {
  const el=()=>({style:{},dataset:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},setAttribute(){},appendChild(){},append(){},addEventListener(){},removeEventListener(){},querySelector:()=>null,querySelectorAll:()=>[]});
  const document={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],createElement:el,head:{appendChild(){}},body:el(),documentElement:{style:{setProperty(){}}},addEventListener(){},removeEventListener(){}};
  const host={chat:[],characters:[],chatMetadata:{},extensionSettings:{},saveSettingsDebounced(){},saveMetadata:async()=>{}};
  const ctx=vm.createContext({console:{log(){},warn(){},error(){}},TextEncoder,TextDecoder,AbortController,URL,Blob,Response,CompressionStream,DecompressionStream,Uint8Array,ArrayBuffer,DataView,queueMicrotask,setTimeout,clearTimeout,setInterval,clearInterval,performance,structuredClone,btoa,atob,crypto:globalThis.crypto,document,window:{addEventListener(){}},navigator:{},location:{protocol:'https:',origin:'https://x'},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},SillyTavern:{getContext:()=>host},toastr:{info(){},success(){},warning(){},error(){}}});
  const code=fs.readFileSync(new URL('../dist/heartbeatMemories.bundle.js', import.meta.url),'utf8');
  const paths=[...code.matchAll(/^\/\/ MODULE: (.+)$/gm)].map(m=>m[1]);
  const m=new vm.SourceTextModule(code+'\nexport const N={'+paths.map(f=>JSON.stringify(f)+':__m_'+f.replace(/[^a-zA-Z0-9]/g,'_')).join(',')+'};',{context:ctx});await m.link(()=>{});await m.evaluate();
  const N=m.namespace.N;
  const calls = [];
  N['ui/overlay.js'].confirmExplicitAction = (title) => { calls.push(['confirm', title]); return true; };
  N['ui/settingsPanel.js'].refreshSettingsTaskStatus = () => calls.push(['task']);
  N['ui/settingsPanel.js'].refreshSettingsMemoryStatus = () => calls.push(['memory']);
  assert.equal(N['core/uiBridge.js'].confirmExplicitAction('标题', '正文'), true);
  N['core/uiBridge.js'].refreshSettingsTaskStatus(); N['core/uiBridge.js'].refreshSettingsMemoryStatus();
  assert.deepEqual(calls, [['confirm', '标题'], ['task'], ['memory']]);
});
