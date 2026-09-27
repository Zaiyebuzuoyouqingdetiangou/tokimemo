import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(repoRoot, 'src');
const entry = 'heartbeatMemories.js';
const outFile = path.join(repoRoot, 'dist', 'heartbeatMemories.bundle.js');

const namespaceImport = /^import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"];?\s*$/gm;
const stateImport = /^import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm;
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
    // Git may check out CRLF on Windows and LF on the host. Both builds must
    // produce the same source fingerprint and runtime bytes.
    const source = (await readFile(path.join(sourceRoot, rel), 'utf8')).replace(/\r\n/g, '\n');
    const namespaceImports = [...source.matchAll(namespaceImport)].map(match => ({ local: match[1], specifier: match[2] }));
    const stateImports = [...source.matchAll(stateImport)].flatMap(match => match[1].split(',').map(binding => { const [imported, local = imported] = binding.trim().split(/\s+as\s+/); return { imported, local, specifier: match[2] }; }).filter(item => item.imported));
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

function loadAcorn() {
    const require = createRequire(import.meta.url);
    const candidates = [process.env.ACORN_PATH];
    for (const dir of (process.env.NODE_PATH || '').split(path.delimiter)) if (dir) candidates.push(path.join(dir, 'acorn'));
    candidates.push(
        '/home/claude/.npm-global/lib/node_modules/ts-node/node_modules/acorn',
        '/home/claude/.npm-global/lib/node_modules/@mermaid-js/mermaid-cli/node_modules/acorn',
    );
    let dir = path.dirname(process.execPath);
    for (let i = 0; i < 6; i += 1) {
        candidates.push(path.join(dir, 'node_modules', 'acorn'));
        dir = path.dirname(dir);
    }
    for (const candidate of candidates.filter(Boolean)) {
        try { return require(candidate); } catch { /* keep looking */ }
    }
    throw new Error('acorn not found; set ACORN_PATH to an acorn package directory');
}

function isFunctionNode(node) {
    return node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression' || node.type === 'ClassDeclaration' || node.type === 'ClassExpression';
}

function localFunctions(ast) {
    const fns = new Map();
    const add = (name, fn) => { if (name && fn) fns.set(name, fn); };
    for (const stmt of ast.body) {
        const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
        if (!decl) continue;
        if (decl.type === 'FunctionDeclaration') add(decl.id?.name, decl);
        if (decl.type === 'VariableDeclaration') for (const item of decl.declarations) {
            if (item.id?.type === 'Identifier' && (item.init?.type === 'FunctionExpression' || item.init?.type === 'ArrowFunctionExpression')) add(item.id.name, item.init);
        }
    }
    return fns;
}

function initDependencies(acorn, rel, row) {
    const deps = new Set(row.stateImports.map(item => resolveDependency(rel, item.specifier)));
    const namespaces = new Map(row.namespaceImports.map(item => [item.local, resolveDependency(rel, item.specifier)]));
    if (!namespaces.size) return deps;
    const ast = acorn.parse(row.source, { ecmaVersion: 'latest', sourceType: 'module' });
    const fns = localFunctions(ast);
    const visiting = new Set();
    const scan = node => {
        if (!node || typeof node !== 'object' || isFunctionNode(node)) return;
        if (node.type === 'MemberExpression' && !node.computed && node.object?.type === 'Identifier' && namespaces.has(node.object.name)) deps.add(namespaces.get(node.object.name));
        if (node.type === 'VariableDeclarator' && node.id && node.id.type !== 'Identifier' && node.init?.type === 'Identifier' && namespaces.has(node.init.name)) deps.add(namespaces.get(node.init.name));
        if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && fns.has(node.callee.name) && !visiting.has(node.callee.name)) {
            visiting.add(node.callee.name);
            scan(fns.get(node.callee.name).body);
        }
        for (const key of Object.keys(node)) {
            if (key === 'loc' || key === 'range' || key === 'start' || key === 'end') continue;
            const value = node[key];
            if (Array.isArray(value)) value.forEach(scan);
            else if (value && typeof value === 'object' && value.type) scan(value);
        }
    };
    for (const stmt of ast.body) {
        if (stmt.type === 'ImportDeclaration' || stmt.type === 'FunctionDeclaration' || stmt.type === 'ClassDeclaration') continue;
        if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration?.type === 'FunctionDeclaration') continue;
        scan(stmt);
    }
    return deps;
}

// r84.121：初始化顺序由“初始化时会读到的导入”决定，不再读取手写表。
// 命名导入，模块顶层（含顶层直接调用的本文件函数）对 import * as 的属性读取，以及从这种别名做的解构，必须先初始化被依赖的模块。
// 这些边没有圈。只在函数里、要等调用才读的 import * as 可以互相引用，排序时忽略。
// r84.122：顶层解构原先没算进去，旧蝴蝶效应提示词会拿到 undefined。
const acorn = loadAcorn();
const hardPreds = new Map([...reachable].map(rel => [rel, new Set()]));
for (const rel of reachable) for (const dep of initDependencies(acorn, rel, moduleRows.get(rel))) if (dep !== rel && reachable.has(dep)) hardPreds.get(rel).add(dep);
const indeg = new Map([...reachable].map(rel => [rel, hardPreds.get(rel).size]));
const after = new Map([...reachable].map(rel => [rel, []]));
for (const [rel, deps] of hardPreds) for (const dep of deps) after.get(dep).push(rel);
const ready = [...reachable].filter(rel => indeg.get(rel) === 0).sort();
const order = [];
while (ready.length) {
    const next = ready.shift();
    order.push(next);
    for (const child of after.get(next)) {
        indeg.set(child, indeg.get(child) - 1);
        if (indeg.get(child) === 0) { ready.push(child); ready.sort(); }
    }
}
if (order.length !== reachable.size) throw new Error('初始化依赖出现了圈，自动排序停住了');
await writeFile(path.join(repoRoot, 'tools', 'runtime-module-order.json'), JSON.stringify(order, null, 2) + '\n', 'utf8');

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
    for (const item of row.stateImports) aliases.push(`const ${item.local} = ${safeName('__m', resolveDependency(rel, item.specifier))}.${item.imported};`);
    const assignments = row.exports.map(name => `${safeName('__m', rel)}.${name} = ${name};`).join('\n');
    chunks.push(`function ${safeName('__init', rel)}() {\n// MODULE: ${rel}\n${aliases.join('\n')}\n${row.body}\n${assignments}\n}\n\n`);
}
for (const rel of order) chunks.push(`${safeName('__init', rel)}();\n`);
chunks.push('\n');
for (const name of moduleRows.get(entry).exports) chunks.push(`export const ${name} = ${safeName('__m', entry)}.${name};\n`);

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, chunks.join(''), 'utf8');
console.log(JSON.stringify({ modules: reachable.size, sourceSha256, outFile: path.relative(repoRoot, outFile) }));
