// Split a big source module into several modules by moving top-level
// declarations verbatim (dev tool, not loaded by the extension).
//
//   node tools/split-module.mjs spec.json
//   node tools/split-module.mjs --analyze archive/repository.js   (list declarations, sizes, who uses whom)
//   node tools/split-module.mjs --plan modes/relations.js [maxBytes]  (print a draft spec: dependency-ordered
//        groups under maxBytes; mutable bindings and everything that reads them stay in the source.
//        Rename the draft files / notes by what they contain before running it.)
//
// spec.json:
// { "source": "archive/repository.js",
//   "modules": [ { "file": "archive/archiveCore.js", "note": "一句话说明", "names": ["fnA", "fnB"] }, ... ] }
//
// Rules the tool enforces (so tools/refactor-guard.mjs can prove nothing changed):
// - Each moved declaration keeps its exact text and its leading comments. Only an
//   `export ` keyword may be added when another module now needs it.
// - New modules copy the source's own import lines they need (same aliases) and
//   import each other with single-line named imports. A new module may only
//   depend on modules listed before it; nothing may depend back on the source.
// - The source keeps every export it had: moved exports become
//   `export const name = alias.name;` right after its imports.
// - Initialization order is computed by tools/build-runtime-bundle.mjs. This
//   tool does not edit tools/runtime-module-order.json.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
function load(name) {
    const dirs = [process.env.ACORN_DIR, '/home/claude/.npm-global/lib/node_modules/ts-node/node_modules'].filter(Boolean);
    for (const dir of dirs) { try { return require(path.join(dir, name)); } catch {} }
    throw new Error(`${name} not found; set ACORN_DIR to a node_modules directory containing acorn and acorn-walk`);
}
const acorn = load('acorn'), walk = load('acorn-walk');
const analyzeOnly = process.argv[2] === '--analyze', planOnly = process.argv[2] === '--plan';
const spec = analyzeOnly || planOnly ? { source: process.argv[3], modules: [] } : JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const srcFile = path.join(root, 'src', spec.source);
const source = fs.readFileSync(srcFile, 'utf8');
const program = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module' });

const imports = [], decls = [];
let previousEnd = 0;
for (const node of program.body) {
    if (node.type === 'ImportDeclaration') {
        imports.push({ text: source.slice(node.start, node.end), locals: node.specifiers.map(s => s.local.name), node });
        previousEnd = node.end;
        continue;
    }
    const exported = node.type === 'ExportNamedDeclaration';
    const decl = exported ? node.declaration : node;
    if (exported && !decl) throw new Error('unsupported export form');
    // Top-level statements (e.g. a registration call) always stay in the source, in order.
    const isDeclaration = decl.type === 'FunctionDeclaration' || decl.type === 'VariableDeclaration';
    const names = !isDeclaration ? [] : decl.type === 'FunctionDeclaration' ? [decl.id.name] : decl.declarations.map(d => d.id.name);
    // Leading comments travel with the declaration; blank lines before them do not.
    const lead = source.slice(previousEnd, node.start).replace(/^\s*\n/, '');
    decls.push({ names, exported, decl, lead, text: source.slice(node.start, node.end), kind: isDeclaration ? (decl.kind || 'function') : 'statement' });
    previousEnd = node.end;
}
const tail = source.slice(previousEnd);
const owner = new Map();
decls.forEach((d, i) => d.names.forEach(n => owner.set(n, i)));
const importLocal = new Map();
imports.forEach((imp, i) => imp.locals.forEach(n => importLocal.set(n, i)));

function freeRefs(node, own) {
    const refs = new Set(), aliases = new Set();
    walk.full(node, n => {
        if (n.type !== 'Identifier' || own.includes(n.name)) return;
        if (owner.has(n.name)) refs.add(n.name);
        if (importLocal.has(n.name)) aliases.add(importLocal.get(n.name));
    });
    return { refs, aliases };
}
decls.forEach(d => Object.assign(d, freeRefs(d.decl, d.names)));
if (planOnly) {
    const maxBytes = Number(process.argv[4]) || 45000;
    const n = decls.length, uses = decls.map(d => [...d.refs].map(r => owner.get(r)));
    const stay = new Set(decls.map((d, i) => d.names.length !== 1 ? i : -1).filter(i => i >= 0));
    // Mutable bindings travel with all their users (edge both ways → same SCC); statements that use one keep it here.
    decls.forEach((d, i) => { if (d.kind === 'let' || d.kind === 'var') decls.forEach((o, j) => { if (j !== i && o.refs.has(d.names[0])) { uses[i].push(j); if (o.kind === 'statement') stay.add(i); } }); });
    for (let changed = true; changed;) { changed = false; for (let i = 0; i < n; i++) if (!stay.has(i) && uses[i].some(j => stay.has(j))) { stay.add(i); changed = true; } }
    for (let changed = true; changed;) { changed = false; decls.forEach((d, i) => { if (!stay.has(i) || (d.kind !== 'let' && d.kind !== 'var')) return;
        decls.forEach((o, j) => { if (!stay.has(j) && o.refs.has(d.names[0])) { stay.add(j); changed = true; } }); }); }
    // Tarjan SCC over movable declarations.
    let counter = 0; const index = new Map(), low = new Map(), onStack = new Set(), stack = [], comp = new Array(n).fill(-1), comps = [];
    const strong = v => {
        index.set(v, counter); low.set(v, counter); counter++; stack.push(v); onStack.add(v);
        for (const w of uses[v]) { if (stay.has(w)) continue;
            if (!index.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w))); }
        if (low.get(v) === index.get(v)) { const c = []; let w; do { w = stack.pop(); onStack.delete(w); comp[w] = comps.length; c.push(w); } while (w !== v); comps.push(c.sort((a, b) => a - b)); }
    };
    for (let i = 0; i < n; i++) if (!stay.has(i) && !index.has(i)) strong(i);
    const deps = comps.map(c => new Set(c.flatMap(v => uses[v]).filter(w => !stay.has(w)).map(w => comp[w]).filter(k => k !== comp[c[0]])));
    const placed = new Set(), order = [];
    while (order.length < comps.length) {
        const ready = comps.map((c, k) => k).filter(k => !placed.has(k) && [...deps[k]].every(d => placed.has(d))).sort((a, b) => comps[a][0] - comps[b][0]);
        placed.add(ready[0]); order.push(ready[0]);
    }
    const size = i => Buffer.byteLength(decls[i].lead + decls[i].text);
    const groups = []; let current = [], bytes = 0;
    for (const k of order) {
        const b = comps[k].reduce((sum, i) => sum + size(i), 0);
        if (current.length && bytes + b > maxBytes) { groups.push(current); current = []; bytes = 0; }
        current.push(...comps[k]); bytes += b;
    }
    if (current.length) groups.push(current);
    const base = spec.source.replace(/\.js$/, '');
    console.log(JSON.stringify({ source: spec.source, stays: [...stay].sort((a, b) => a - b).map(i => decls[i].names.join(',')),
        modules: groups.map((g, k) => ({ file: `${base}Part${k + 1}.js`, note: 'TODO', bytes: g.reduce((s, i) => s + size(i), 0),
            exported: g.filter(i => decls[i].exported).map(i => decls[i].names[0]).slice(0, 12), names: g.sort((a, b) => a - b).map(i => decls[i].names[0]) })) }, null, 1));
    process.exit(0);
}
if (analyzeOnly) {
    // index line export kind bytes name -> uses (indices) <- used by (indices)
    const usedBy = decls.map(() => []);
    decls.forEach((d, i) => d.refs.forEach(r => usedBy[owner.get(r)].push(i)));
    decls.forEach((d, i) => console.log([String(i).padStart(3), d.exported ? 'E' : ' ', d.kind.padEnd(8),
        String(Buffer.byteLength(d.text)).padStart(6), d.names.join(',').padEnd(40), '->', [...d.refs].map(r => owner.get(r)).join(','),
        '<-', usedBy[i].join(',')].join(' ')));
    process.exit(0);
}

const moduleOf = new Map();
spec.modules.forEach((m, mi) => m.names.forEach(n => {
    if (!owner.has(n)) throw new Error(`${spec.source} has no top-level ${n}`);
    const d = decls[owner.get(n)];
    if (d.names.length > 1) throw new Error(`multi-name declaration ${d.names} not supported`);
    moduleOf.set(n, mi);
}));
// A mutable binding may move only together with every declaration that reads or writes it:
// the bundler turns named imports into init-time copies, so it must never be imported.
decls.forEach(d => {
    if (d.kind !== 'let' && d.kind !== 'var') return;
    const home = moduleOf.has(d.names[0]) ? moduleOf.get(d.names[0]) : -1;
    for (const other of decls) if (other !== d && other.refs.has(d.names[0])) {
        const at = other.names.length && moduleOf.has(other.names[0]) ? moduleOf.get(other.names[0]) : -1;
        if (at !== home) throw new Error(`mutable binding ${d.names[0]} and its user ${other.names[0] || '(statement)'} must be in the same module`);
    }
});
const where = n => moduleOf.has(n) ? moduleOf.get(n) : -1; // -1 = stays in source

// Who needs what, and dependency direction.
const needsExport = new Set();
for (const d of decls) {
    const from = where(d.names[0]);
    for (const r of d.refs) {
        const to = where(r);
        if (to === from) continue;
        if (from >= 0 && to === -1) throw new Error(`${spec.modules[from].file}:${d.names[0]} would depend back on ${spec.source}:${r}`);
        if (from >= 0 && to > from) throw new Error(`${spec.modules[from].file}:${d.names[0]} depends on later module ${spec.modules[to].file}:${r}`);
        needsExport.add(r);
    }
}

const rel = (fromFile, toFile) => {
    let r = path.posix.relative(path.posix.dirname(fromFile), toFile);
    return r.startsWith('.') ? r : './' + r;
};
const aliasOf = file => 'split_' + path.posix.basename(file, '.js');
const chunk = d => {
    const exportIt = d.exported || needsExport.has(d.names[0]);
    const text = d.exported || !exportIt ? d.text : 'export ' + d.text;
    return (d.lead ? d.lead : '') + text;
};

const written = [];
spec.modules.forEach((m, mi) => {
    const own = decls.filter(d => where(d.names[0]) === mi);
    const usedImports = [...new Set(own.flatMap(d => [...d.aliases]))].sort((a, b) => a - b).map(i => imports[i].text);
    const fromOthers = new Map();
    for (const d of own) for (const r of d.refs) { const to = where(r); if (to !== mi) (fromOthers.get(to) || fromOthers.set(to, new Set()).get(to)).add(r); }
    const named = [...fromOthers].sort(([a], [b]) => a - b).map(([to, set]) => `import { ${[...set].sort().join(', ')} } from '${rel(m.file, spec.modules[to].file)}';`);
    const header = `// ${m.note}\n// 从 ${spec.source} 原样搬出（重构阶段 2），声明文本一字未改；${spec.source} 仍转发原有导出。\n`;
    const body = own.map(chunk).join('\n\n');
    const text = [...usedImports, ...named].join('\n') + '\n' + header + '\n' + body.replace(/^\n+/, '') + '\n';
    fs.writeFileSync(path.join(root, 'src', m.file), text);
    written.push({ file: m.file, bytes: Buffer.byteLength(text), declarations: own.length });
});

// Rewrite the source.
const stay = decls.filter(d => where(d.names[0]) === -1);
const stayAliases = new Set(stay.flatMap(d => [...d.aliases]));
const keptImports = imports.filter((imp, i) => stayAliases.has(i)).map(imp => imp.text);
const moduleImports = spec.modules.map(m => `import * as ${aliasOf(m.file)} from '${rel(spec.source, m.file)}';`);
const namedIntoSource = new Map();
for (const d of stay) for (const r of d.refs) {
    const to = where(r);
    if (to >= 0 && !decls[owner.get(r)].exported) (namedIntoSource.get(to) || namedIntoSource.set(to, new Set()).get(to)).add(r);
}
const namedLines = [...namedIntoSource].sort(([a], [b]) => a - b).map(([to, set]) => `import { ${[...set].sort().join(', ')} } from '${rel(spec.source, spec.modules[to].file)}';`);
const shims = decls.filter(d => d.exported && where(d.names[0]) >= 0)
    .map(d => `export const ${d.names[0]} = ${aliasOf(spec.modules[where(d.names[0])].file)}.${d.names[0]};`);
const newSource = [...keptImports, ...moduleImports, ...namedLines].join('\n') + '\n'
    + `// 以下导出已搬到 ${spec.modules.map(m => m.file).join('、')}，这里原样转发，调用方不用改。\n`
    + shims.join('\n') + '\n\n'
    + stay.map(chunk).join('\n\n').replace(/^\n+/, '') + tail;
fs.writeFileSync(srcFile, newSource);
console.log(JSON.stringify({ source: spec.source, sourceBytes: Buffer.byteLength(newSource), modules: written, shims: shims.length }, null, 2));
