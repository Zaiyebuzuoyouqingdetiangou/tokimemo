// Scan src/ for names that are used but never defined / imported, or defined twice
// (dev tool). A verbatim split that forgets an import only fails at call time, which
// refactor-guard cannot see; TypeScript's checker can. typescript is resolved from
// TYPESCRIPT_PATH, NODE_PATH, the Claude sandbox global npm tree, or node_modules
// next to node itself.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function tscPath() {
    const candidates = [];
    if (process.env.TYPESCRIPT_PATH) candidates.push(path.join(process.env.TYPESCRIPT_PATH, 'bin', 'tsc'));
    for (const dir of (process.env.NODE_PATH || '').split(path.delimiter)) if (dir) candidates.push(path.join(dir, 'typescript', 'bin', 'tsc'));
    candidates.push('/home/claude/.npm-global/lib/node_modules/typescript/bin/tsc');
    let dir = path.dirname(process.execPath);
    for (let i = 0; i < 6; i += 1) {
        candidates.push(path.join(dir, 'node_modules', 'typescript', 'bin', 'tsc'));
        dir = path.dirname(dir);
    }
    return candidates.find(file => fs.existsSync(file));
}
const tsc = tscPath();
if (!tsc) throw new Error('typescript not found; set TYPESCRIPT_PATH');
const files = [];
(function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (full.endsWith('.js')) files.push(path.relative(root, full)); } })(path.join(root, 'src'));
let output = '';
try { execFileSync(process.execPath, [tsc, '--allowJs', '--checkJs', '--noEmit', '--target', 'es2022', '--module', 'es2022', '--moduleResolution', 'bundler', '--lib', 'es2022,dom', '--skipLibCheck', ...files], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }); }
catch (error) { output = String(error.stdout || ''); }
// 2304/2552 cannot find name, 18004 shorthand without a value, 2448/2454 used before declaration, 2300/2451 duplicate, 2305/2724/2614 missing export.
// 18004 = shorthand property with no value in scope ({ completedOnly } where completedOnly is undefined).
const problems = output.split('\n').filter(line => /error TS(2304|2552|2448|2454|2300|2451|2305|2724|2614|2306|18004):/.test(line));
console.log(JSON.stringify({ ok: problems.length === 0, files: files.length, problems }, null, 2));
if (problems.length) process.exitCode = 1;
