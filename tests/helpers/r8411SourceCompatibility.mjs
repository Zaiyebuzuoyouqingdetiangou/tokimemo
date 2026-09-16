import {r8412ContractSource} from './r8412SourceCompatibility.mjs';
// Retain historical hash assertions by reversing ONLY this reviewed, hash-pinned successor diff.
// This is test-only; production code is always executed as shipped, never patched in behavior tests.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const delta = JSON.parse(fs.readFileSync(new URL('./r8411-source-deltas.json',import.meta.url),'utf8'));
const sha = x => createHash('sha256').update(x).digest('hex');
export function r8411ContractSource(path, value) {
 const raw = r8412ContractSource(path,value), spec=delta[path];if(!spec)return raw;
 assert.equal(sha(raw),spec.candidateSha256,path+' changed beyond the reviewed r84.11 diff');
 const lines=raw.match(/[^\n]*\n|[^\n]+$/g)||[];
 for(const part of [...spec.changes].reverse()) lines.splice(part.start,part.remove,...(part.old.match(/[^\n]*\n|[^\n]+$/g)||[]));
 const restored=lines.join('');assert.equal(sha(restored),spec.baselineSha256,path+' inverse diff mismatch');return restored;
}
