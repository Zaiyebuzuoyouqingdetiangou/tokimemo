import {r8416ContractSource} from './helpers/r8416SourceCompatibility.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {r8414ContractSource} from './helpers/r8414SourceCompatibility.mjs';
import './helpers/r847Host.mjs';
import * as song from '../src/modes/themeSong.js';import * as travel from '../src/modes/travel.js';
const root=new URL('../',import.meta.url),read=p=>r8416ContractSource(p,fs.readFileSync(new URL(p,root),'utf8')),sha=x=>createHash('sha256').update(x).digest('hex');
const same=JSON.parse(read('tests/helpers/r8414-unchanged.json')),changes=JSON.parse(read('tests/helpers/r8414-source-deltas.json')),samples=JSON.parse(read('tests/helpers/r8414-baseline-fixtures.json'));
for(const dir of ['src/archive/','src/core/','src/generation/','src/modes/','src/ui/','tools/'])test('actual current untouched bytes equal r84.13: '+dir,()=>{
 for(const [path,hash]of Object.entries(same).filter(([p])=>p.startsWith(dir)))assert.equal(sha(read(path)),hash,path);
});
for(const [path,spec]of Object.entries(changes))test('authorized current diff pinned exactly: '+path,()=>{
 assert.equal(sha(read(path)),spec.candidateSha256,path);assert.equal(sha(r8414ContractSource(path,read(path))),spec.baselineSha256,path);
});
test('historical source bridge refuses any unknown extra edits',()=>{
 for(const path of Object.keys(changes))assert.throws(()=>r8414ContractSource(path,read(path)+'\nunknown-change'));
});
for(const voice of ['char','duet','narrator'])test('original song prompt hashes frozen for all languages and both subjects: '+voice,()=>{
 for(const sample of samples.song.filter(s=>s.options.voice===voice)){
  const plan=song.validateThemeSongPlan(song.createThemeSongPlan(sample.options,samples.memory),samples.memory);
  assert.equal(sha(song.themeSongPrompt(plan,samples.memory)),sample.sha256,JSON.stringify(sample.options));
 }
});
test('travel initial and incremental/revisit request recipes remain byte identical',()=>{
 for(const s of samples.travel)assert.equal(sha(travel.travelPrompt(samples.context,samples.memory,s.previous,s.ids,{mapTheme:'neutral',allowedKeepsakes:['postcard']})),s.sha256);
});
test('shared story prompts, evidence, regular-expression engine, CG transmission and calendar untouched',()=>{
 for(const path of ['src/generation/prompts.js','src/generation/client.js','src/generation/contentRegeneration.js','src/generation/imageGeneration.js','src/core/cgPromptFormat.js','src/core/dialogue.js','src/core/narrativeAuthority.js','src/core/cache.js','src/core/requestCoordinator.js','src/modes/heart.js','src/modes/calendar.js'])assert.equal(sha(read(path)),same[path],path);
});
test('new local postcard logic grants no network, storage, code, style or URL authority',()=>{
 const source=read('src/modes/travel.js');const local=source.slice(source.indexOf('const POSTCARD_SCENE_RULES'),source.indexOf('function normalizePostcard'));
 assert.doesNotMatch(local,/\bfetch\s*\(|\beval\s*\(|\bFunction\s*\(|\bindexedDB\b|localStorage|Authorization|manualApiKey|createElement/);
 for(const path of ['src/core/themeSongContract.js','src/ui/travelView.js'])assert.doesNotMatch(read(path),/\bfetch\s*\(|\beval\s*\(|\bFunction\s*\(|\bindexedDB\b|Authorization|manualApiKey/);
});
test('bootstrap identity only, manifest and runtime URL consistent, no external stylesheet',()=>{
 const src=read('index.js').replaceAll('0.8.90-tt-cg-r84.14-ensemble-postcards','0.8.89-tt-cg-r84.13-narrow').replace("const VERSION = '0.8.90'","const VERSION = '0.8.89'");assert.equal(sha(src),changes['index.js'].baselineSha256);
 const m=JSON.parse(read('manifest.json'));assert.equal(m.version,'0.8.90');assert.equal(m.js,'index.js?heartbeat=0.8.90-tt-cg-r84.14-ensemble-postcards');assert.equal(fs.existsSync(new URL('dist/heartbeatMemories.bundle.css',root)),false);
});
