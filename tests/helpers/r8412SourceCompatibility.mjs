import {r8413ContractSource} from './r8413SourceCompatibility.mjs';
// Test-only, exact-hash-pinned inverse of the reviewed r84.12 delta. Historical
// source contracts still prove that every unrelated byte is unchanged. Behavior
// tests import the actual production files, never these reconstructed strings.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const delta=JSON.parse(fs.readFileSync(new URL('./r8412-source-deltas.json',import.meta.url),'utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
export function r8412ContractSource(path,value){
 const spec=delta[path];
 if(spec && sha(value)===spec.baselineSha256)return value; // already projected by a newer exact-hash contract
 const raw=r8413ContractSource(path,value);if(!spec)return raw;
 const hash=sha(raw);if(hash===spec.baselineSha256)return raw;
 assert.equal(hash,spec.candidateSha256,path+' differs outside reviewed r84.12 scope');
 const lines=raw.match(/[^\n]*\n|[^\n]+$/g)||[];
 for(const edit of [...spec.changes].reverse())lines.splice(edit.start,edit.remove,...(edit.old.match(/[^\n]*\n|[^\n]+$/g)||[]));
 const result=lines.join('');assert.equal(sha(result),spec.baselineSha256,path+' inverse diff mismatch');return result;
}
