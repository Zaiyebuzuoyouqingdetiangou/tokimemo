import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.env.R57_CHECKS_OUTPUT;
const invoke = args => spawnSync(process.execPath, args, {
    cwd: root, encoding: 'utf8', timeout: 30000, maxBuffer: 20 * 1024 * 1024,
});
const run = args => {
    const result = invoke(args);
    if (result.status !== 0) throw new Error('Check failed: ' + args.join(' ') + '\n' + (result.stderr || result.stdout).slice(-10000));
    return result.stdout;
};
const digest = data => createHash('sha256').update(data).digest('hex');
const bundle = path.join(root, 'dist/heartbeatMemories.bundle.js');
run(['tools/build-runtime-bundle.mjs']);
const first = digest(await readFile(bundle));
run(['tools/build-runtime-bundle.mjs']);
assert.equal(digest(await readFile(bundle)), first);
const files = await readdir(root, { recursive: true });
const scripts = files.filter(name => /\.(?:js|mjs)$/.test(name));
for (const script of scripts) run(['--check', script]);
const tests = files.filter(name => name.replaceAll('\\', '/').startsWith('tests/') && name.endsWith('.test.mjs')).sort();
const result = invoke(['--test', '--test-reporter=tap', ...tests]);
const output = result.stdout || '';
const count = name => Number(output.match(new RegExp('^# ' + name + ' (\\d+)', 'm'))?.[1]);
const module = await import('../dist/heartbeatMemories.bundle.js');
const bundleImport = typeof module.initMemoryTheater === 'function' && typeof module.destroyMemoryTheater === 'function';
const ok = result.status === 0 && count('tests') > 0 && count('fail') === 0 && count('pass') === count('tests') && bundleImport;
const report = {
    ok, version: JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')).version,
    tests: count('tests'), pass: count('pass'), fail: count('fail'), syntaxFiles: scripts.length,
    deterministicBundleSha256: first, bundleImport, time: new Date().toISOString(), source: root,
    failingTests: output.split('\n').filter(line => /^not ok /.test(line)), processStatus: result.status,
};
// Save fresh evidence even on a failed suite; never hide earlier failures behind a success-only report.
if (out) {
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, 'checks.json'), JSON.stringify(report, null, 2));
    await writeFile(path.join(out, 'tests.tap'), output);
    await writeFile(path.join(out, 'stderr.txt'), result.stderr || '');
}
console.log(JSON.stringify(report));
if (!ok) process.exitCode = 1;
