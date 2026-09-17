import {r8416ContractSource} from './r8416SourceCompatibility.mjs';
// Test-only, exact-hash inverse for historical source snapshots. Behavior tests always
// import the real candidate. Unknown edits are rejected, not normalized away.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const changes=JSON.parse(fs.readFileSync(new URL('./r8414-source-deltas.json',import.meta.url),'utf8'));
const sha=x=>createHash('sha256').update(x).digest('hex');
export function r8414ContractSource(path,value){
 const raw=r8416ContractSource(path,value),spec=changes[path];if(!spec||sha(raw)===spec.baselineSha256)return raw;
 assert.equal(sha(raw),spec.candidateSha256,path+' differs outside r84.14 authorized edits');
 const lines=raw.match(/[^\n]*\n|[^\n]+$/g)||[];
 for(const part of [...spec.changes].reverse())lines.splice(part.start,part.remove,...(part.old.match(/[^\n]*\n|[^\n]+$/g)||[]));
 const result=lines.join('');assert.equal(sha(result),spec.baselineSha256,path+' inverse mismatch');return result;
}
