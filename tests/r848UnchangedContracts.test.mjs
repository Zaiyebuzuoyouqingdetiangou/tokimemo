import { r8411ContractSource } from './helpers/r8411SourceCompatibility.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const specs=[
  {
    "path": "src/modes/heart.js",
    "name": "normalizeHeartCoreIncrement",
    "hash": "2875e66b3d620719710d8c3854a05746802934fc5f903cef4f19bed98203f431"
  },
  {
    "path": "src/modes/heart.js",
    "name": "normalizeHeartScript",
    "hash": "92d4d620bc6444b444b1da7f9ae857f80b84fa55975895b413b2e6aaf002789b"
  },
  {
    "path": "src/modes/heart.js",
    "name": "normalizeHeartStripsPart",
    "hash": "7fbb9205e38cf2b8786d9e58e4665636dc04d420ac16d3a0f1b2081439f577c6"
  },
  {
    "path": "src/modes/heart.js",
    "name": "normalizeFireflyScript",
    "hash": "f887d5a72e5d382aaa5d9c9aa82cc7e63791e000f17a0a67d4ab0604d1fe52f8"
  },
  {
    "path": "src/modes/heart.js",
    "name": "normalizeFireflyVoice",
    "hash": "f7c72a44bfabdf6a091403e0022d83f7460fbd8107a98cd1d8fa855c77267769"
  },
  {
    "path": "src/modes/phone.js",
    "name": "normalizePhoneSettingEvidence",
    "hash": "d97551249013a22aae0ffd8c032d1c7a2a17c9e1dd9cf66d4965e7c0097aa707"
  },
  {
    "path": "src/modes/phone.js",
    "name": "phoneMemoryStructuredFactsSupported",
    "hash": "e6ba2d3aa5835b6847e011c379c5299ed358570697e4afc090dc88f0ed79a975"
  },
  {
    "path": "src/modes/phone.js",
    "name": "phoneInferredEntryAllowed",
    "hash": "34165a576d14e6958f57040154328ac0248c98096d7f08e701aa13b741618f87"
  },
  {
    "path": "src/modes/phone.js",
    "name": "validatePhoneAppPart",
    "hash": "a6085206ec7d326b7a308ac5e547f0f6416230b37bb8b9fa267d9950936f54c5"
  },
  {
    "path": "src/modes/phone.js",
    "name": "assertPhoneConversation",
    "hash": "1b1238e2ce3301f49405e89adb7057b73ea3b0c8366280096d5ee97bd56a851c"
  },
  {
    "path": "src/modes/phone.js",
    "name": "mergePhoneMissingEntries",
    "hash": "fe30ac6649216e2eb3aff4ab6f5360e2aab49dbfa8e9c7481e3b120d726c29e2"
  },
  {
    "path": "src/modes/room.js",
    "name": "roomLifeNarrativeEvidenceState",
    "hash": "490365ffcebc69335d297fc0c3d3f28bac1b018213e601e4e18b0d1e34211385"
  },
  {
    "path": "src/modes/room.js",
    "name": "roomObjectSafeForPresentation",
    "hash": "4186f30b7c6282c4204fe8ed773f4d8a12312666cb96d2dc623aa4eeffaee0f6"
  },
  {
    "path": "src/modes/heart.js",
    "name": "normalizeVoiceDramaPart",
    "hash": "4962de3a20e8375db8c0cc160b9cdef3eb076dda05ba47e9dfdb3ada811baa1d"
  },
  {
    "path": "src/modes/heart.js",
    "name": "normalizeScenarioDramaPart",
    "hash": "3fa83cedd05986c219859004baafe0c634c27deeb7d5d031fd4ec436e0b807bd"
  }
];
for(const spec of specs) test('r848 keeps single-item/evidence contract: '+spec.name,()=>{
 const text=fs.readFileSync(new URL('../'+spec.path,import.meta.url),'utf8');
 const start=text.search(new RegExp('^(?:export )?(?:async )?function '+spec.name+'\\(', 'm'));
 assert.ok(start>=0);
 const tail=text.slice(start+1);const next=tail.search(/\n(?:export )?(?:async )?function /);
 const body=text.slice(start,next<0?text.length:start+1+next);
 assert.equal(createHash('sha256').update(body).digest('hex'),spec.hash);
});

test('r848 bootstrap contract survives r8410 version/build identity',()=>{
 const source=r8411ContractSource('index.js',fs.readFileSync(new URL('../index.js',import.meta.url),'utf8'));
 const restored=source.replace("const VERSION = '0.8.86';", "const VERSION = '0.8.83';").replace("const BUILD = '0.8.86-tt-cg-r84.10-reader-cg';", "const BUILD = '0.8.83-tt-cg-r84.7-scopefix';");
 assert.equal(createHash('sha256').update(restored).digest('hex'),'39458198b99160a5425038e089a02f956d913c6a61ef357ee589d26ad6cf169f');
 const manifest=JSON.parse(r8411ContractSource('manifest.json',fs.readFileSync(new URL('../manifest.json',import.meta.url),'utf8')));
 assert.equal(manifest.version,'0.8.86');assert.equal(manifest.js,'index.js?heartbeat=0.8.86-tt-cg-r84.10-reader-cg');
});
