import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import vm from 'node:vm';
// 重构清单 C-3（r84.98）：core 不再 import modes；玩法函数由各 modes 文件登记到 core/modesBridge.js。
const bridgeText = fs.readFileSync(new URL('../src/core/modesBridge.js', import.meta.url), 'utf8');
const NAMES = [...bridgeText.matchAll(/^export function (\w+)\(\.\.\.args\)/gm)].map(m => m[1]);

test('core files import no modes module', () => {
  for (const file of fs.readdirSync(new URL('../src/core/', import.meta.url))) {
    if (!file.endsWith('.js')) continue;
    const text = fs.readFileSync(new URL(`../src/core/${file}`, import.meta.url), 'utf8');
    assert.equal(/^import .* from '\.\.\/modes\//m.test(text), false, file);
  }
  assert.equal(NAMES.length, 15);
});

test('in the real bundle every bridged function is registered and is the modes function itself', async () => {
  const el=()=>({style:{},dataset:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},setAttribute(){},appendChild(){},append(){},addEventListener(){},removeEventListener(){},querySelector:()=>null,querySelectorAll:()=>[]});
  const document={getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],createElement:el,head:{appendChild(){}},body:el(),documentElement:{style:{setProperty(){}}},addEventListener(){},removeEventListener(){}};
  const host={chat:[],characters:[],chatMetadata:{},extensionSettings:{},saveSettingsDebounced(){},saveMetadata:async()=>{}};
  const ctx=vm.createContext({console:{log(){},warn(){},error(){}},TextEncoder,TextDecoder,AbortController,URL,Blob,Response,CompressionStream,DecompressionStream,Uint8Array,ArrayBuffer,DataView,queueMicrotask,setTimeout,clearTimeout,setInterval,clearInterval,performance,structuredClone,btoa,atob,crypto:globalThis.crypto,document,window:{addEventListener(){}},navigator:{},location:{protocol:'https:',origin:'https://x'},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},SillyTavern:{getContext:()=>host},toastr:{info(){},success(){},warning(){},error(){}}});
  const code=fs.readFileSync(new URL('../dist/heartbeatMemories.bundle.js', import.meta.url),'utf8');
  const paths=[...code.matchAll(/^\/\/ MODULE: (.+)$/gm)].map(m=>m[1]);
  const m=new vm.SourceTextModule(code+'\nexport const N={'+paths.map(f=>JSON.stringify(f)+':__m_'+f.replace(/[^a-zA-Z0-9]/g,'_')).join(',')+'};',{context:ctx});await m.link(()=>{});await m.evaluate();
  const N=m.namespace.N;
  const B = N['core/modesBridge.js'];
  const home = { calendarEntryPageKey: 'modes/calendar.js', migrateCalendarSession: 'modes/calendar.js', normalizePhonePlan: 'modes/phone.js',
    normalizePhoneDraftApp: 'modes/phone.js', migrateLegacyPhoneSession: 'modes/phone.js', mergeInboxLatest: 'modes/inbox.js', normalizeInboxSession: 'modes/inbox.js',
    readablePastLivesProgressSession: 'modes/pastLives.js', readablePastLivesSession: 'modes/pastLives.js', readableTimeStoriesProgressSession: 'modes/timeStories.js',
    readableTimeStoriesSession: 'modes/timeStories.js', readableThemeSongProgressSession: 'modes/themeSong.js', readableBedtimeProgressSession: 'modes/bedtime.js',
    renderRoom: 'modes/room.js', mergeDeferredHeartPatches: 'modes/heart.js' };
  for (const name of NAMES) {
    assert.equal(B.modesBridgeRegistered(name), true, name);
    // Same answer through the bridge as from the modes module for a harmless input.
    if (name === 'calendarEntryPageKey') assert.deepEqual(B[name]({ date: '2026-09-25', title: 'x' }), N[home[name]][name]({ date: '2026-09-25', title: 'x' }));
  }
  assert.deepEqual(Object.keys(home).sort(), [...NAMES].sort());
});

test('an unregistered name fails loudly instead of guessing', async () => {
  const fresh = await import(new URL('../src/core/modesBridge.js', import.meta.url).href + '?isolated');
  assert.throws(() => fresh.renderRoom(), /尚未登记/);
});
