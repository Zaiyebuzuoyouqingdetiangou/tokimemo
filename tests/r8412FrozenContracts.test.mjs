import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {r8412ContractSource} from './helpers/r8412SourceCompatibility.mjs';
import * as heart from '../src/modes/heart.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sha=v=>createHash('sha256').update(v).digest('hex');
const same=JSON.parse(read('tests/helpers/r8412-unchanged.json'));
const changes=JSON.parse(read('tests/helpers/r8412-source-deltas.json'));
for(const dir of ['src/archive/','src/core/','src/generation/','src/modes/','src/ui/','tools/'])test('r8412 all out-of-scope production files frozen: '+dir,()=>{
 const matches=Object.entries(same).filter(([p])=>p.startsWith(dir));assert.ok(matches.length);for(const [p,hash] of matches)assert.equal(sha(read(p)),hash,p);
});
for(const [p,spec] of Object.entries(changes))test('r8412 exact allowed diff + reversible original: '+p,()=>{
 assert.equal(sha(read(p)),spec.candidateSha256,p);assert.equal(sha(r8412ContractSource(p,read(p))),spec.baselineSha256,p);
 assert.throws(()=>r8412ContractSource(p,read(p)+'\n// unexpected test change\n'));
});
function func(source,name){const start=source.search(new RegExp('^(?:export )?(?:async )?function '+name+'\\(', 'm'));assert.ok(start>=0,name);const next=source.slice(start+1).search(/\n(?:export )?(?:async )?function /);return source.slice(start,next<0?source.length:start+1+next);}
test('existing narrative/evidence validators and reader-safe commit functions unchanged',()=>{
 const current=read('src/modes/heart.js'),before=r8412ContractSource('src/modes/heart.js',current);
 for(const name of ['normalizeHeartCore','normalizeHeartCoreIncrement','heartCoreIncrementPrompt','heartSeasonVoicePrompt','heartSeasonScenarioPrompt','heartPostVoicePrompt','heartFireflyPrompt','normalizeHeart','normalizeHeartScript','normalizeVoiceDramaPart','normalizeScenarioDramaPart','persistHeartPartialPatch','applyHeartPartialPatch','preserveHeartSelection'])assert.equal(func(current,name),func(before,name),name);
});
test('legacy birthday prompt helper reconstructs original core request exactly for fixture',()=>{
 const s=r8412ContractSource('src/modes/heart.js',read('src/modes/heart.js'));
 const legacy=heart.heartCoreLegacyPrompt({name1:'乙',name2:'甲'},{memories:[]});
 assert.ok(s.includes('birthday/userBirthday/holiday/absenceWorry/absenceSulky 建议各 1～2 条；没有合适台词的类别留空。'));
 assert.match(legacy,/birthday\/userBirthday\/holiday/);assert.doesNotMatch(legacy,/不主动补生日祝福/);
});
test('core recovery identity/hash matching/validation functions are not loosened',()=>{
 const current=read('src/generation/recovery.js'),before=r8412ContractSource('src/generation/recovery.js',current);
 for(const name of ['recoveryIdentity','validJournal','createGenerationRecovery','requestIdentity','compatibilityContract','permitsLegacyRequest','withRecoverySegment','recordRecoveryTruncation'])assert.equal(func(current,name),func(before,name),name);
 assert.match(current,/'heart-season-siblings-r8412': Object.freeze\(\{ mode: 'heart'/);
 assert.match(current,/'heart-language-birthday-r8412': Object.freeze\(\{ mode: 'heart'/);
});
test('song change is rendering only, generator/export/parser untouched and inert',()=>{
 for(const p of ['src/modes/themeSong.js','src/core/themeSongContract.js','src/generation/prompts.js','src/generation/client.js','src/generation/imageGeneration.js','src/core/cache.js'])assert.equal(sha(read(p)),same[p]);
 const s=read('src/ui/themeSongView.js');assert.match(s,/songLyricsReadingHtml/);assert.doesNotMatch(s,/\bfetch\s*\(|\beval\s*\(|\bFunction\s*\(|\bAuthorization\b|\bmanualApiKey\b|\bSuno\b/i);
 assert.match(s,/confirmExplicitActionTwice/);assert.match(s,/未署名/);
});
test('desktop button styling remains scoped, with disabled/focus/danger and narrow pager guards',()=>{
 const css=read('src/ui/workspaceStyles.js');assert.match(css,/\.rmt-body button\.rmt-btn/);assert.match(css,/min-height:44px!important/);assert.match(css,/border-style:solid!important/);
 assert.match(css,/rmt-adv-mobile-picker>button\.rmt-btn\{padding:0!important;width:44px!important/);
 assert.match(css,/:disabled\{opacity:\.55!important/);assert.match(css,/:focus-visible/);assert.match(css,/rmt-manage-danger/);
 assert.equal(sha(read('src/ui/overlay.js')),same['src/ui/overlay.js']);
});
test('only manifest/build identity changes in bootstrap; runtime remains deferred',()=>{
 const index=read('index.js'),before=r8412ContractSource('index.js',index);
 assert.equal(index.replaceAll('0.8.88-tt-cg-r84.12-song-recovery','0.8.87-tt-cg-r84.11-song-reader').replace("const VERSION = '0.8.88';","const VERSION = '0.8.87';"),before);
 const manifest=JSON.parse(read('manifest.json'));assert.equal(manifest.version,'0.8.88');assert.equal(manifest.js,'index.js?heartbeat=0.8.88-tt-cg-r84.12-song-recovery');
 assert.doesNotMatch(index,/heartbeatMemories\.bundle\.css/);
});
