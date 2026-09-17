import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {r8416ContractSource} from './helpers/r8416SourceCompatibility.mjs';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8'),sha=s=>createHash('sha256').update(s).digest('hex');
const same=JSON.parse(read('tests/helpers/r8416-unchanged.json')),delta=JSON.parse(read('tests/helpers/r8416-source-deltas.json')),added=JSON.parse(read('tests/helpers/r8416-new-source.json'));
for(const dir of ['src/archive/','src/core/','src/generation/','src/modes/','src/ui/','tools/'])test('actual unchanged bytes vs uploaded r84.15: '+dir,()=>{
 for(const [path,hash]of Object.entries(same).filter(([p])=>p.startsWith(dir)))assert.equal(sha(read(path)),hash,path);
});
for(const [path,contract]of Object.entries(delta))test('new authorized diff is exact, reversible and cannot absorb arbitrary edits: '+path,()=>{
 const raw=read(path);assert.equal(sha(raw),contract.candidateSha256);assert.equal(sha(r8416ContractSource(path,raw)),contract.baselineSha256);
 assert.equal(r8416ContractSource(path,raw+'\n// unexpected'),raw+'\n// unexpected');
});
for(const [path,hash]of Object.entries(added))test('new isolated source pinned: '+path,()=>assert.equal(sha(read(path)),hash));
function fn(s,name){const start=s.search(new RegExp('^(?:export )?(?:async )?function '+name+'\\(','m'));assert.ok(start>=0,name);const next=s.slice(start+1).search(/^(?:export )?(?:async )?function /m);return s.slice(start,next<0?undefined:start+1+next);}
test('recovery matching, replay validator, error classification and save logic unchanged',()=>{
 const s=read('src/generation/recovery.js'),b=r8416ContractSource('src/generation/recovery.js',s);
 for(const n of ['withRecoverySegment','requestIdentity','permitsLegacyRequest','compatibilityContract','createGenerationRecovery','currentAttachedJournal','jsonData'])assert.equal(fn(s,n),fn(b,n),n);
});
test('legacy travel prompts and nearby/merge/scene identity rules stay unchanged',()=>{
 const s=read('src/modes/travel.js'),b=r8416ContractSource('src/modes/travel.js',s);
 for(const n of ['travelPromptLegacyR8414','legacyTravelRecoveryPromptR8415','travelLocationKey','mergeTravelIncremental','travelMarkerPositions','travelPostcardContentKey','travelPostcardSceneProfile'])assert.equal(fn(s,n),fn(b,n),n);
 // travelPrompt's body is unchanged, apart from the following new function's comment boundary.
 assert.equal(fn(s,'travelPrompt').split('// New tasks')[0].trim(),fn(b,'travelPrompt').trim());
});
test('old rendered scenery and nearby dialogue functions have no edits',()=>{
 const s=read('src/ui/travelView.js'),b=r8416ContractSource('src/ui/travelView.js',s);
 for(const n of ['sceneRandom','travelPostcardScene','travelPostcardPicturePlan','travelDialogueHtml','sceneTrees','scenePeaks','sceneWaves'])assert.equal(fn(s,n),fn(b,n),n);
});
test('daily inbox generation and existing letter validator unchanged',()=>{
 const s=read('src/modes/inbox.js'),b=r8416ContractSource('src/modes/inbox.js',s);
 for(const n of ['inboxPrompt','generateInbox','inboxPlan','emptyInbox','normalizeInboxLetters'])assert.equal(fn(s,n).split('function postcardLetterKey')[0].trim(),fn(b,n).trim(),n);
});
test('mailbox action changes only postcard selection; writes/read-only/CAS stay unchanged',()=>{
 const s=read('src/ui/inboxView.js'),b=r8416ContractSource('src/ui/inboxView.js',s);
 for(const n of ['mutateInbox','assertShownInboxTarget','renderInbox'])assert.equal(fn(s,n),fn(b,n),n);
});
test('styles appended only inside runtime styles; no global dependency or old CSS edits',()=>{
 const s=read('src/ui/styles.js'),b=r8416ContractSource('src/ui/styles.js',s);
 const stripped=s.replace("import * as postcard_design_view from './postcardDesignView.js';\n",'').replace("    style.textContent += postcard_design_view.postcardDesignCss('#' + core_constants.OVERLAY_ID);\n",'');assert.equal(stripped,b);
 assert.match(fn(s,'ensureStyles'),/postcardDesignCss/);assert.doesNotMatch(fn(s,'ensureSettingsStyles'),/postcardDesignCss/);
});
test('new schema and renderer grant no provider, storage or dynamic-code capability',()=>{
 for(const path of Object.keys(added))assert.doesNotMatch(read(path),/\bfetch\s*\(|\beval\s*\(|\bFunction\s*\(|\bindexedDB\b|localStorage|Authorization|requestValidatedSegment|commitSession|createElement/);
});
test('one versioned lazy bundle and no standalone CSS bundle; boot only version changed',()=>{
 const m=JSON.parse(read('manifest.json'));assert.equal(m.version,'0.8.92');assert.equal(m.js,'index.js?heartbeat=0.8.92-tt-cg-r84.16-structured-postcards');
 assert.equal(read('index.js').replaceAll('0.8.92-tt-cg-r84.16-structured-postcards','0.8.91-tt-cg-r84.15-postcard-design').replace("const VERSION = '0.8.92'","const VERSION = '0.8.91'"),r8416ContractSource('index.js',read('index.js')));
 assert.ok(!fs.existsSync(new URL('dist/heartbeatMemories.bundle.css',root)));
});
