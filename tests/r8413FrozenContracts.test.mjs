import {r8414ContractSource} from './helpers/r8414SourceCompatibility.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {r8413ContractSource} from './helpers/r8413SourceCompatibility.mjs';
import './helpers/r847Host.mjs';
import * as song from '../src/modes/themeSong.js';import * as prompts from '../src/generation/prompts.js';
const root=new URL('../',import.meta.url),read=p=>r8414ContractSource(p,fs.readFileSync(new URL(p,root),'utf8')),sha=x=>createHash('sha256').update(x).digest('hex');
const same=JSON.parse(read('tests/helpers/r8413-unchanged.json')),changes=JSON.parse(read('tests/helpers/r8413-source-deltas.json'));
for(const dir of ['src/archive/','src/core/','src/generation/','src/modes/','src/ui/','tools/'])test('actual untouched production bytes frozen to r84.12: '+dir,()=>{for(const [path,hash]of Object.entries(same).filter(([p])=>p.startsWith(dir)))assert.equal(sha(read(path)),hash,path);});
for(const [path,spec]of Object.entries(changes))test('authorized diff pinned and reversible: '+path,()=>{assert.equal(sha(read(path)),spec.candidateSha256);assert.equal(sha(r8413ContractSource(path,read(path))),spec.baselineSha256);});
test('historical projection never accepts unreviewed source',()=>{assert.throws(()=>r8413ContractSource('src/ui/advEventView.js',read('src/ui/advEventView.js')+'\nunknown mutation'));});
function fn(source,name){const re=new RegExp('^(?:export )?(?:async )?function '+name+'\\(','m');const start=source.search(re);assert.ok(start>=0,name);const next=source.slice(start+1).search(/^(?:export )?(?:async )?function /m);return next<0?source.slice(start):source.slice(start,start+1+next);}
test('common story prompt boundary, all prior narrative mode rules and calendar fact validators retain original text',()=>{
 const source=read('src/generation/prompts.js'),base=r8413ContractSource('src/generation/prompts.js',source);
 for(const name of ['promptSafetyBoundary','calendarPrompt','promptArchiveSlice','endingArchiveSlice'])assert.equal(fn(source,name),fn(base,name),name);
 assert.equal(source.slice(source.indexOf('export const PROMPTS =')),base.slice(base.indexOf('export const PROMPTS =')));
 const cal=read('src/modes/calendar.js'),old=r8413ContractSource('src/modes/calendar.js',cal);
 for(const name of ['normalizePastMarkedEntries','normalizePromisedEntries','normalizeFutureEntries'])assert.equal(fn(cal,name),fn(old,name),name);
});
test('original song prompt is byte identical for existing Chinese Japanese English choices',()=>{
 const src=read('src/modes/themeSong.js'),base=r8413ContractSource('src/modes/themeSong.js',src);
 const template=fn(base,'themeSongPrompt').replace('export function','function');
 // The test compares original string recipe with actual implementation; no model is called.
 const contract={SONG_LANGUAGES:{zh:'中文',ja:'日语',en:'英语'}};const text={normalizeText:(x)=>x};const evidence={memoryPayload:()=>[]};const L={style:900,lyrics:5000};
 const original=new Function('contract','text','evidence','L',template+';return themeSongPrompt;')(contract,text,evidence,L);
 const bank={characterName:'林舟',userName:'小月',memories:[]};
 for(const language of ['zh','ja','en']){const plan={subject:'character',language,singer:'林舟',direction:'钢琴',sourceMemoryIds:[]};assert.equal(song.themeSongPrompt(plan,bank),original(plan,bank));}
});
test('new production blocks do not add provider routes, executable model output or storage authority',()=>{
 for(const path of ['src/core/cgPromptFormat.js','src/generation/cgPromptPolicy.js','src/core/themeSongContract.js','src/ui/themeSongStyles.js'])assert.doesNotMatch(read(path),/\bfetch\s*\(|\beval\s*\(|\bFunction\s*\(|\bindexedDB\b|\bAuthorization\b|\bmanualApiKey\b/);
 const ui=read('src/ui/themeSongView.js');assert.match(ui,/esc\(contract\.songLanguageLabel/);assert.match(read('src/modes/themeSong.js'),/JSON.stringify\(contract.customSongLanguage/);
});
test('bootstrap identity only; runtime remains lazy and there is no external stylesheet file',()=>{
 const src=read('index.js').replaceAll('0.8.89-tt-cg-r84.13-narrow','0.8.88-tt-cg-r84.12-song-recovery').replace("const VERSION = '0.8.89'","const VERSION = '0.8.88'");assert.equal(sha(src),changes['index.js'].baselineSha256);
 const m=JSON.parse(read('manifest.json'));assert.equal(m.version,'0.8.89');assert.equal(m.js,'index.js?heartbeat=0.8.89-tt-cg-r84.13-narrow');assert.ok(!fs.existsSync(new URL('dist/heartbeatMemories.bundle.css',root)));
});
