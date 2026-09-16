import {r8412ContractSource} from './helpers/r8412SourceCompatibility.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {r8411ContractSource} from './helpers/r8411SourceCompatibility.mjs';
import * as constants from '../src/core/constants.js';
import * as policy from '../src/core/autoUpdatePolicy.js';
const read=p=>r8412ContractSource(p,fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const sha=v=>createHash('sha256').update(v).digest('hex');
const same=JSON.parse(read('tests/helpers/r8411-unchanged.json'));
const changes=JSON.parse(read('tests/helpers/r8411-source-deltas.json'));
for(const dir of ['src/archive/','src/core/','src/generation/','src/modes/','src/ui/'])test('all untouched production files match r84.10: '+dir,()=>{
 for(const [path,hash] of Object.entries(same).filter(([path])=>path.startsWith(dir)))assert.equal(sha(read(path)),hash,path);
});
for(const [path,spec]of Object.entries(changes))test('r84.11 exact authorized diff and reversible baseline: '+path,()=>{
 assert.equal(sha(read(path)),spec.candidateSha256,path);assert.equal(sha(r8411ContractSource(path,read(path))),spec.baselineSha256);
});
test('bootstrap has only new version/cache identity and startup still cannot load song work',()=>{
 const stripped=read('index.js').replace("const VERSION = '0.8.87';","const VERSION = '0.8.86';")
  .replace("const BUILD = '0.8.87-tt-cg-r84.11-song-reader';","const BUILD = '0.8.86-tt-cg-r84.10-reader-cg';");
 assert.equal(sha(stripped),changes['index.js'].baselineSha256);
 assert.equal(policy.AUTO_UPDATE_MODES.includes(constants.MODE.THEME_SONG),false);
 const m=JSON.parse(read('manifest.json'));assert.equal(m.version,'0.8.87');assert.equal(m.js,'index.js?heartbeat=0.8.87-tt-cg-r84.11-song-reader');
});
function funcs(s){return [...s.matchAll(/^(?:export )?(?:async )?function ([\w$]+)\(/gm)].map((m,i,all)=>({name:m[1],source:s.slice(m.index,all[i+1]?.index??s.length)}));}
test('all existing HEART prompt builders and narrative validators remain verbatim',()=>{
 const s=read('src/modes/heart.js'),old=r8411ContractSource('src/modes/heart.js',s);
 for(const f of funcs(old).filter(x=>/Prompt|^normalize(HeartCore|HeartScript|HeartStripsPart|Heart$|VoiceDrama|ScenarioDrama|Firefly)/.test(x.name))) {
  const current=funcs(s).find(x=>x.name===f.name);assert.ok(current);assert.equal(current.source,f.source,f.name);
 }
});
test('single song uses existing generation/canonical cache pipeline and no external service/client',()=>{
 const s=read('src/modes/themeSong.js');assert.equal((s.match(/generation\.requestValidatedSegment\(/g)||[]).length,1);
 for(const file of ['src/core/themeSongContract.js','src/modes/themeSong.js','src/ui/themeSongStyles.js']) {
  assert.doesNotMatch(read(file),/\bfetch\s*\(|\beval\s*\(|\bFunction\s*\(|\blocalStorage\b|\bindexedDB\b|\bAuthorization\b|\bmanualApiKey\b|\bSuno\b/i,file);
 }
 assert.doesNotMatch(read('src/ui/themeSongView.js'),/\bfetch\s*\(|\beval\s*\(|\bFunction\s*\(|\bAuthorization\b|\bmanualApiKey\b|\.innerHTML\s*=\s*(?:song|content|lyrics|raw)|\bSuno\b/i);
 assert.match(read('src/ui/themeSongView.js'),/confirmExplicitActionTwice/);assert.match(read('src/ui/themeSongView.js'),/commitSessionMutation/);
});
test('all previous CG format and image transport modules remain byte identical',()=>{
 for(const [path,hash] of Object.entries(same).filter(([p])=>/cg[A-Z]|imageGeneration|baibaiImage|independentApi/.test(p)))assert.equal(sha(read(path)),hash,path);
 assert.equal(sha(read('src/generation/prompts.js')),'70a615e2af5dd680e80ba7b06f7ad502cffacf4a8c4d9ed22ea67039c3a5ff25');
});
