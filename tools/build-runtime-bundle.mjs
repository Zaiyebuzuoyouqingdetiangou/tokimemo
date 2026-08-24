import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(repoRoot, 'src');
const entry = 'heartbeatMemories.js';
const outFile = path.join(repoRoot, 'dist', 'heartbeatMemories.bundle.js');

const namespaceImport = /^import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['\"]([^'\"]+)['\"];?\s*$/gm;
const stateImport = /^import\s*\{\s*state\s+as\s+([A-Za-z_$][\w$]*)\s*\}\s*from\s*['\"]([^'\"]+)['\"];?\s*$/gm;
const unsupportedImport = /^import\s+/m;
const exportPatterns = [
    /^export\s+async\s+function\s+([A-Za-z_$][\w$]*)/gm,
    /^export\s+function\s+([A-Za-z_$][\w$]*)/gm,
    /^export\s+const\s+([A-Za-z_$][\w$]*)/gm,
    /^export\s+let\s+([A-Za-z_$][\w$]*)/gm,
];

async function collectJs(dir, prefix = '') {
    const rows = [];
    for (const item of await readdir(dir, { withFileTypes: true })) {
        const rel = path.posix.join(prefix, item.name);
        if (item.isDirectory()) rows.push(...await collectJs(path.join(dir, item.name), rel));
        else if (item.isFile() && item.name.endsWith('.js')) rows.push(rel);
    }
    return rows.sort();
}

const moduleRows = new Map();
const moduleFiles = await collectJs(sourceRoot);

function resolveDependency(rel, specifier) {
    const clean = specifier.split('?')[0];
    if (!clean.startsWith('.')) throw new Error(`External import is not supported in runtime bundle: ${rel} -> ${specifier}`);
    return path.posix.normalize(path.posix.join(path.posix.dirname(rel), clean));
}

function safeName(prefix, rel) {
    return `${prefix}_${rel.replace(/[^A-Za-z0-9_$]/g, '_')}`;
}

for (const rel of moduleFiles) {
    const source = await readFile(path.join(sourceRoot, rel), 'utf8');
    const namespaceImports = [...source.matchAll(namespaceImport)].map(match => ({ local: match[1], specifier: match[2] }));
    const stateImports = [...source.matchAll(stateImport)].map(match => ({ local: match[1], specifier: match[2] }));
    let importsStripped = source.replace(namespaceImport, '').replace(stateImport, '');
    if (unsupportedImport.test(importsStripped)) throw new Error(`Unsupported import syntax remains in ${rel}`);
    const exports = [];
    for (const pattern of exportPatterns) {
        pattern.lastIndex = 0;
        for (const match of source.matchAll(pattern)) exports.push(match[1]);
    }
    importsStripped = importsStripped
        .replace(/^export\s+async\s+function\s+/gm, 'async function ')
        .replace(/^export\s+function\s+/gm, 'function ')
        .replace(/^export\s+const\s+/gm, 'const ')
        .replace(/^export\s+let\s+/gm, 'let ');
    if (/^export\s+/m.test(importsStripped)) throw new Error(`Unsupported export syntax remains in ${rel}`);
    const dependencies = [...namespaceImports, ...stateImports].map(item => resolveDependency(rel, item.specifier));
    moduleRows.set(rel, { source, body: importsStripped, namespaceImports, stateImports, dependencies, exports: [...new Set(exports)] });
}

if (!moduleRows.has(entry)) throw new Error(`Missing runtime entry ${entry}`);

const reachable = new Set();
function markReachable(rel) {
    if (reachable.has(rel)) return;
    const row = moduleRows.get(rel);
    if (!row) throw new Error(`Missing dependency module ${rel}`);
    reachable.add(rel);
    for (const dep of row.dependencies) markReachable(dep);
}
markReachable(entry);

const order = [];
const visiting = new Set();
const finished = new Set();
function visit(rel) {
    if (finished.has(rel)) return;
    if (visiting.has(rel)) return; // ESM cycle: namespace placeholder is linked before evaluation.
    visiting.add(rel);
    for (const dep of moduleRows.get(rel).dependencies) visit(dep);
    visiting.delete(rel);
    finished.add(rel);
    order.push(rel);
}
visit(entry);

const fingerprint = createHash('sha256');
for (const rel of [...reachable].sort()) {
    fingerprint.update(rel).update('\0').update(moduleRows.get(rel).source).update('\0');
}
const sourceSha256 = fingerprint.digest('hex');

const chunks = [
    '// GENERATED FILE. Do not edit by hand.\n',
    `// Source modules: ${reachable.size}\n`,
    `// Source SHA-256: ${sourceSha256}\n`,
    '// Build: node tools/build-runtime-bundle.mjs\n\n',
];

for (const rel of [...reachable].sort()) chunks.push(`const ${safeName('__m', rel)} = Object.create(null);\n`);
chunks.push('\n');

for (const rel of order) {
    const row = moduleRows.get(rel);
    const aliases = [];
    for (const item of row.namespaceImports) aliases.push(`const ${item.local} = ${safeName('__m', resolveDependency(rel, item.specifier))};`);
    for (const item of row.stateImports) aliases.push(`const ${item.local} = ${safeName('__m', resolveDependency(rel, item.specifier))}.state;`);
    const assignments = row.exports.map(name => `${safeName('__m', rel)}.${name} = ${name};`).join('\n');
    chunks.push(`function ${safeName('__init', rel)}() {\n// MODULE: ${rel}\n${aliases.join('\n')}\n${row.body}\n${assignments}\n}\n\n`);
}
for (const rel of order) chunks.push(`${safeName('__init', rel)}();\n`);
chunks.push('\n');
for (const name of moduleRows.get(entry).exports) chunks.push(`export const ${name} = ${safeName('__m', entry)}.${name};\n`);

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, chunks.join(''), 'utf8');
console.log(JSON.stringify({ modules: reachable.size, sourceSha256, outFile: path.relative(repoRoot, outFile) }));
