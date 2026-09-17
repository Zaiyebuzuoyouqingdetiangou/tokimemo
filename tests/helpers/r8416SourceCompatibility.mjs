// Test-only EXACT inverse of this user-authorized delta. Behavior tests always
// import the actual candidate. Unknown source bytes are never normalized away.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const delta=JSON.parse(fs.readFileSync(new URL('./r8416-source-deltas.json',import.meta.url),'utf8'));
const sha=s=>createHash('sha256').update(s).digest('hex');
export function r8416ContractSource(path,value) {
 const raw=String(value),spec=delta[path];
 if(!spec || sha(raw)!==spec.candidateSha256) return raw;
 const lines=raw.match(/[^\n]*\n|[^\n]+$/g)||[];
 for(const edit of [...spec.changes].reverse())lines.splice(edit.start,edit.remove,...(edit.old.match(/[^\n]*\n|[^\n]+$/g)||[]));
 const old=lines.join('');assert.equal(sha(old),spec.baselineSha256,path+' inverse must exactly equal uploaded r84.15');return old;
}
