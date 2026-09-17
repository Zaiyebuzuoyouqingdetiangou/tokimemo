import {r8414ContractSource} from './r8414SourceCompatibility.mjs';
// Test-only: project explicitly authorized r84.13 source edits onto the exact r84.12
// bytes for historical freeze tests. No production function or behavior is replaced.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const delta=JSON.parse(fs.readFileSync(new URL('./r8413-source-deltas.json',import.meta.url),'utf8'));
const sha=x=>createHash('sha256').update(x).digest('hex');
export function r8413ContractSource(path,value){
 const spec=delta[path];if(spec&&sha(String(value))===spec.baselineSha256)return String(value);
 const raw=r8414ContractSource(path,value);if(!spec||sha(raw)===spec.baselineSha256)return raw;
 assert.equal(sha(raw),spec.candidateSha256,path+' differs outside r84.13 authorized edits');
 const lines=raw.match(/[^\n]*\n|[^\n]+$/g)||[];
 for(const part of [...spec.changes].reverse())lines.splice(part.start,part.remove,...(part.old.match(/[^\n]*\n|[^\n]+$/g)||[]));
 const result=lines.join('');assert.equal(sha(result),spec.baselineSha256,path+' inverse mismatch');return result;
}
