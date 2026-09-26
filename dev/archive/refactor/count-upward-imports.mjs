// 统计“向上”的 import（core < archive < generation < modes < ui）。在插件根目录运行：node dev/archive/refactor/count-upward-imports.mjs
import fs from 'node:fs'; import path from 'node:path';
const re=/^import\s+(\*\s+as\s+(\w+)|\{([^}]+)\})\s+from\s+['"]([^'"]+)['"];?\s*$/gm;
const src={}; (function v(f){ if(src[f])return; src[f]=fs.readFileSync('src/'+f,'utf8'); for(const m of src[f].matchAll(re)) v(path.posix.normalize(path.posix.join(path.posix.dirname(f),m[4]))); })('heartbeatMemories.js');
const L=f=>f.split('/')[0]; const rank={core:0,archive:1,generation:2,modes:3,ui:4};
function namespaceNames(source, alias) {
    const dotted = [...source.matchAll(new RegExp('\\b' + alias + '\\.(\\w+)', 'g'))].map(row => row[1]);
    const pulled = [];
    for (const row of source.matchAll(new RegExp('(?:const|let|var)\\s*\\{([^}]+)\\}\\s*=\\s*' + alias + '\\b', 'g'))) {
        for (const part of row[1].split(',')) {
            const key = part.trim().split(/[:=]/)[0].trim();
            if (/^[A-Za-z_$][\w$]*$/.test(key)) pulled.push(key);
        }
    }
    return [...new Set([...dotted, ...pulled])];
}
const rows=[];
for(const [f,s] of Object.entries(src)) for(const m of s.matchAll(re)){ const t=path.posix.normalize(path.posix.join(path.posix.dirname(f),m[4]));
  if(rank[L(t)]>rank[L(f)]){ const names=m[2]?namespaceNames(s,m[2]):m[3].split(',').map(x=>x.trim().split(/\s+as\s+/)[0]);
   rows.push({from:f,to:t,pair:L(f)+'→'+L(t),names}); } }
const pairs={}; for(const r of rows){ const p=pairs[r.pair]??={lines:0,calls:0}; p.lines++; p.calls+=r.names.length; }
console.log(JSON.stringify(Object.entries(pairs).sort((a,b)=>a[1].lines-b[1].lines)));
for(const r of rows.filter(r=>r.pair==='core→ui')) console.log(r.from,'→',r.to,r.names.join(','));
