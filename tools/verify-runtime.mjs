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
const instrumented = 'const __bindingFailures=[];\n' + bundle.replace(/^(const ([\w$]+) = __m_[\w$]+\.[\w$]+;)$/gm,
    (line, _declaration, name) => `${line}\nif (${name} === undefined) __bindingFailures.push(${JSON.stringify(line)});`)
    + '\nexport const bindingFailures=__bindingFailures;\n';
const temp = await mkdtemp(path.join(tmpdir(), 'hearttrace-runtime-check-'));
const probe = path.join(temp, 'probe.mjs');
await writeFile(probe, instrumented);
const runtime = await import(pathToFileURL(probe).href);
if (runtime.bindingFailures.length) throw new Error(JSON.stringify(runtime.bindingFailures));
for (const name of ['initMemoryTheater','destroyMemoryTheater','openArchiveLibrary','openSettingsHome','isGenerationBusy']) {
    if (typeof runtime[name] !== 'function') throw new Error(`Missing runtime export: ${name}`);
}
console.log(JSON.stringify({ syntaxFiles: syntaxFiles.length, undefinedBindings: 0, runtimeExports: 5,
    bundleSha256: createHash('sha256').update(bundle).digest('hex') }));
