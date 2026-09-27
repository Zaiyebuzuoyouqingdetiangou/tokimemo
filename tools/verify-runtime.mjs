import { readdir, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
async function files(dir) {
    const rows = [];
    for (const file of await readdir(new URL(dir, root), { withFileTypes: true })) {
        if (file.isDirectory()) rows.push(...await files(`${dir}${file.name}/`));
        else if (/\.m?js$/.test(file.name)) rows.push(`${dir}${file.name}`);
    }
    return rows;
}
const syntaxFiles = ['index.js', ...await files('src/'), ...await files('tools/'), 'dist/heartbeatMemories.bundle.js'];
for (const file of syntaxFiles) execFileSync(process.execPath, ['--check', new URL(file, root).pathname.replace(/^\/(\w:)/, '$1')], { stdio: 'pipe' });
const bundle = await readFile(new URL('dist/heartbeatMemories.bundle.js', root), 'utf8');
// r84.122：每个模块对象在自己的初始化函数返回之前被读取，都算失败。
// 旧检查只认 const a = __m_x.b，看不到顶层解构，也看不到间接读取。
const prelude = `const __bindingFailures=[];
const __premature=[];
const __inited=new Set();
let __current=null;
function __track(suffix){
  const target=Object.create(null);
  return new Proxy(target,{
    get(t,prop,recv){
      if(typeof prop==='string'&&!__inited.has(suffix)) __premature.push(suffix+' '+prop+' during '+__current);
      return Reflect.get(t,prop,recv);
    },
    has(t,prop){
      if(typeof prop==='string'&&!__inited.has(suffix)) __premature.push(suffix+' in:'+prop+' during '+__current);
      return Reflect.has(t,prop);
    },
    ownKeys(t){
      if(!__inited.has(suffix)) __premature.push(suffix+' <ownKeys> during '+__current);
      return Reflect.ownKeys(t);
    },
  });
}
`;
let instrumented = bundle.replace(/^const (__m_([\w$]+)) = Object\.create\(null\);$/gm, (_line, name, suffix) => `const ${name} = __track(${JSON.stringify(suffix)});`);
instrumented = instrumented.replace(/^(__init_([\w$]+))\(\);$/gm, (_line, fn, suffix) => `__current=${JSON.stringify(suffix)}; ${fn}(); __inited.add(${JSON.stringify(suffix)}); __current=null;`);
instrumented = instrumented.replace(/^(const ([\w$]+) = __m_[\w$]+\.[\w$]+;)$/gm,
    (line, _declaration, name) => `${line}\nif (${name} === undefined) __bindingFailures.push(${JSON.stringify(line)});`);
instrumented = prelude + instrumented + '\nexport const bindingFailures=__bindingFailures;\nexport const prematureReads=[...new Set(__premature)];\n';
const temp = await mkdtemp(path.join(tmpdir(), 'hearttrace-runtime-check-'));
const probe = path.join(temp, 'probe.mjs');
await writeFile(probe, instrumented);
const runtime = await import(pathToFileURL(probe).href);
if (runtime.bindingFailures.length || runtime.prematureReads.length) throw new Error(JSON.stringify({ undefinedBindings: runtime.bindingFailures, prematureReads: runtime.prematureReads }));
for (const name of ['initMemoryTheater','destroyMemoryTheater','openArchiveLibrary','openSettingsHome','isGenerationBusy']) {
    if (typeof runtime[name] !== 'function') throw new Error(`Missing runtime export: ${name}`);
}
console.log(JSON.stringify({ syntaxFiles: syntaxFiles.length, undefinedBindings: 0, prematureReads: 0, runtimeExports: 5,
    bundleSha256: createHash('sha256').update(bundle).digest('hex') }));
