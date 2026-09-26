// Split a huge *synchronous* dispatcher function into ordered group functions
// (dev tool, 重构阶段 3). Proof obligations are checked here and the result is
// re-checked by tests/dispatch-split-identity.test.mjs:
//
//   - each group is a contiguous run of the function's top-level statements, moved
//     byte-for-byte; the function keeps one call line per group in the same place:
//       if (alias.group(a, b) !== SENTINEL) return;
//     so replacing each call line with the group body gives back the original text;
//   - a group gets, as same-named parameters, exactly the function's own locals it
//     reads; it may not assign them, and nothing it declares is used after it;
//   - group bodies end with `return SENTINEL;` so "no branch returned" falls through
//     to the next statement exactly as before. The dispatcher's return value must be
//     unused (it is an event listener).
//
//   node tools/split-dispatch.mjs spec.json
//   spec: { "source": "ui/overlayCore.js", "function": "handleOverlayClick", "sentinel": "OVERLAY_CLICK_UNHANDLED",
//           "groups": [ { "module": "ui/overlayClickTargets.js", "name": "overlayClickRecordTargets", "from": 8, "to": 49, "note": "…" } ] }
//   Statement indices come from: node tools/split-dispatch.mjs --list ui/overlayCore.js handleOverlayClick
//   A group whose "module" is the source file itself becomes a named function in that same file (use this when
//   the group reads the file's module-level `let` state, which another module could only see as a stale copy).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
function load(name) {
    for (const dir of [process.env.ACORN_DIR, '/home/claude/.npm-global/lib/node_modules/ts-node/node_modules'].filter(Boolean)) { try { return require(path.join(dir, name)); } catch {} }
    throw new Error(`${name} not found; set ACORN_DIR`);
}
const acorn = load('acorn'), walk = load('acorn-walk');
const parse = text => acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module' });

function locate(file, fnName) {
    const source = fs.readFileSync(path.join(root, 'src', file), 'utf8');
    const program = parse(source);
    const node = program.body.map(n => n.declaration || n).find(n => n.type === 'FunctionDeclaration' && n.id.name === fnName);
    if (!node) throw new Error(`${file} has no function ${fnName}`);
    return { source, program, node, statements: node.body.body };
}

// Names a list of statements reads / assigns *freely* (not bound by a declaration,
// parameter or catch clause inside those statements), with a light scope analysis.
function patternNames(p, out = []) {
    if (!p) return out;
    if (p.type === 'Identifier') out.push(p.name);
    else if (p.type === 'ObjectPattern') p.properties.forEach(q => patternNames(q.type === 'RestElement' ? q.argument : q.value, out));
    else if (p.type === 'ArrayPattern') p.elements.forEach(q => patternNames(q, out));
    else if (p.type === 'RestElement') patternNames(p.argument, out);
    else if (p.type === 'AssignmentPattern') patternNames(p.left, out);
    return out;
}
function bindsHere(scope, name) {
    if (/Function/.test(scope.type)) { if (scope.params.some(p => patternNames(p).includes(name))) return true; if (scope.id?.name === name && scope.type === 'FunctionExpression') return true; }
    if (scope.type === 'CatchClause' && patternNames(scope.param).includes(name)) return true;
    if (/^For(In|Of)?Statement$/.test(scope.type)) { const init = scope.init || scope.left; if (init?.type === 'VariableDeclaration' && init.declarations.some(d => patternNames(d.id).includes(name))) return true; }
    const body = scope.type === 'BlockStatement' || scope.type === 'Program' ? scope.body : scope.type === 'SwitchCase' ? scope.consequent : null;
    if (body) for (const st of body) {
        if (st.type === 'VariableDeclaration' && st.declarations.some(d => patternNames(d.id).includes(name))) return true;
        if ((st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration') && st.id?.name === name) return true;
    }
    return false;
}
function usage(nodes) {
    const reads = new Set(), writes = new Set();
    for (const node of nodes) walk.fullAncestor(node, (n, _state, ancestors) => {
        if (n.type !== 'Identifier') return;
        const parent = ancestors[ancestors.length - 2];
        if (parent && ((parent.type === 'MemberExpression' && parent.property === n && !parent.computed)
            || (parent.type === 'Property' && parent.key === n && !parent.computed && !parent.shorthand)
            || (parent.type === 'MethodDefinition' && parent.key === n)
            || ((parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') && parent.label === n))) return;
        // bound inside the statements themselves (the outermost node's own declarations bind only if it is a nested scope)
        for (let i = ancestors.length - 2; i >= 0; i--) if (ancestors[i] !== node && bindsHere(ancestors[i], n.name)) return;
        if (ancestors[0] === node && node !== n && /Function/.test(node.type) && bindsHere(node, n.name)) return;
        const isDeclId = parent && ((parent.type === 'VariableDeclarator' && parent.id === n) || (/Function|Class/.test(parent.type) && parent.id === n));
        if (!isDeclId) reads.add(n.name);
        if (parent?.type === 'AssignmentExpression' && parent.left === n) writes.add(n.name);
        if (parent?.type === 'UpdateExpression' && parent.argument === n) writes.add(n.name);
    });
    return { reads, writes };
}
const declaredBy = node => node.type === 'VariableDeclaration' ? node.declarations.flatMap(d => d.id.type === 'Identifier' ? [d.id.name] : (() => { throw new Error('destructuring local not supported'); })())
    : node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration' ? [node.id.name] : [];

if (process.argv[2] === '--list') {
    const { source, statements } = locate(process.argv[3], process.argv[4]);
    statements.forEach((s, i) => console.log(String(i).padStart(3), String(s.end - s.start).padStart(6), source.slice(s.start, s.end).split('\n')[0].slice(0, 110)));
    process.exit(0);
}

const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { source, program, node, statements } = locate(spec.source, spec.function);
if (node.async || node.generator) throw new Error('only synchronous dispatchers are supported');
walk.full(node.body, n => { if (n.type === 'ThisExpression') throw new Error('this is not supported'); if (n.type === 'Identifier' && n.name === 'arguments') throw new Error('arguments is not supported'); });
const params = node.params.flatMap(p => patternNames(p));

const groups = [...spec.groups].sort((a, b) => a.from - b.from);
groups.forEach((g, i) => { if (g.from > g.to || (i && g.from <= groups[i - 1].to) || g.to >= statements.length) throw new Error(`bad range ${g.name}`); });
const groupOf = i => groups.find(g => i >= g.from && i <= g.to);

// Locals of the dispatcher, with the statement that declares them.
const localAt = new Map(params.map(name => [name, -1]));
const mutableLocals = new Set(statements.flatMap(s => s.type === 'VariableDeclaration' && s.kind !== 'const' ? declaredBy(s) : []));
statements.forEach((s, i) => declaredBy(s).forEach(name => localAt.set(name, i)));

for (const g of groups) {
    const own = statements.slice(g.from, g.to + 1);
    const { reads, writes } = usage(own);
    g.params = [...localAt.keys()].filter(name => reads.has(name) && (localAt.get(name) < g.from));
    for (const name of writes) if (localAt.has(name) && localAt.get(name) < g.from) throw new Error(`${g.name} assigns dispatcher local ${name}`);
    // r84.96: a parameter is a copy taken when the group runs. A `let` local passed in must therefore not be
    // written later by anyone: not by a statement at/after the group, and not inside any nested function
    // (a callback may run after the group has copied the value).
    for (const name of g.params) {
        if (!mutableLocals.has(name)) continue;
        statements.forEach((statement, index) => walk.fullAncestor(statement, (n, _state, ancestors) => {
            const target = n.type === 'AssignmentExpression' ? n.left : n.type === 'UpdateExpression' ? n.argument : null;
            if (target?.type !== 'Identifier' || target.name !== name) return;
            const nested = ancestors.slice(0, -1).some(a => /Function/.test(a.type));
            if (nested || index >= g.from) throw new Error(`${g.name} would copy mutable local ${name}, which is written ${nested ? 'inside a callback' : 'after the group starts'}; share it through an object first`);
        }));
    }
    const declared = own.flatMap(declaredBy);
    const later = usage(statements.slice(g.to + 1)).reads;
    for (const name of declared) if (later.has(name)) throw new Error(`${g.name} declares ${name}, which is used after the group`);
    g.body = source.slice(own[0].start, own[own.length - 1].end);
    g.reads = reads;
}

// Module-level names of the source that groups need: imports are copied, top-level declarations are imported by name.
const topNames = new Map(), importLines = [];
for (const n of program.body) {
    if (n.type === 'ImportDeclaration') { importLines.push({ text: source.slice(n.start, n.end), locals: n.specifiers.map(s => s.local.name) }); continue; }
    const d = n.declaration || n;
    for (const name of declaredBy(d)) topNames.set(name, { kind: d.kind || 'function', exported: n.type === 'ExportNamedDeclaration', start: n.start });
}
const needExport = new Set();
const modules = new Map();
for (const g of groups) {
    if (g.module === spec.source) continue;
    const m = modules.get(g.module) || modules.set(g.module, { groups: [], imports: new Set(), named: new Set([spec.sentinel]) }).get(g.module);
    m.groups.push(g);
    for (const name of g.reads) {
        if (localAt.has(name) && localAt.get(name) >= g.from && localAt.get(name) <= g.to) continue;
        if (g.params.includes(name)) continue;
        const imp = importLines.find(line => line.locals.includes(name));
        if (imp) { m.imports.add(imp.text); continue; }
        if (topNames.has(name) && name !== spec.function) {
            if (topNames.get(name).kind === 'let' || topNames.get(name).kind === 'var') throw new Error(`${g.name} reads mutable module binding ${name}; keep that group in the source`);
            m.named.add(name); if (!topNames.get(name).exported) needExport.add(name);
        }
    }
}

const rel = (from, to) => { const r = path.posix.relative(path.posix.dirname(from), to); return r.startsWith('.') ? r : './' + r; };
const aliasOf = file => 'dispatch_' + path.posix.basename(file, '.js');
for (const [file, m] of modules) {
    const text = [...m.imports].join('\n') + '\n'
        + `import { ${[...m.named].sort().join(', ')} } from '${rel(file, spec.source)}';\n`
        + `// ${spec.source} ${spec.function} 的分组处理（重构阶段 3）。每个函数是原函数里连续的一段语句，一字未改；\n`
        + `// 返回 ${spec.sentinel} 表示“这一段没有处理”，原函数接着往下走，和拆分前完全相同。\n`
        + m.groups.map(g => `\n// ${g.note}（原第 ${g.from}–${g.to} 条语句）\nexport function ${g.name}(${g.params.join(', ')}) {\n    ${g.body}\n    return ${spec.sentinel};\n}\n`).join('');
    fs.writeFileSync(path.join(root, 'src', file), text);
}

// Rewrite the source: replace group ranges from the end, add exports, sentinel and module imports.
let out = source;
for (const g of [...groups].reverse()) {
    const start = statements[g.from].start, end = statements[g.to].end;
    const callee = g.module === spec.source ? g.name : `${aliasOf(g.module)}.${g.name}`;
    out = out.slice(0, start) + `if (${callee}(${g.params.join(', ')}) !== ${spec.sentinel}) return;` + out.slice(end);
}
const local = groups.filter(g => g.module === spec.source);
if (local.length) out = out.replace(/\n*$/, '\n') + local.map(g => `\n// ${g.note}（${spec.function} 原第 ${g.from}–${g.to} 条语句，一字未改地搬出）\nfunction ${g.name}(${g.params.join(', ')}) {\n    ${g.body}\n    return ${spec.sentinel};\n}\n`).join('');
const exportTargets = [...needExport].map(name => topNames.get(name).start).sort((a, b) => b - a);
// positions before the function are unaffected by the replacements above only if they precede it; handle generally by re-parsing.
if (exportTargets.length) {
    const reparsed = parse(out);
    for (const n of [...reparsed.body].reverse()) {
        if (n.type === 'ImportDeclaration' || n.type === 'ExportNamedDeclaration') continue;
        if (declaredBy(n).some(name => needExport.has(name))) out = out.slice(0, n.start) + 'export ' + out.slice(n.start);
    }
}
const lastImport = parse(out).body.filter(n => n.type === 'ImportDeclaration').pop();
const homes = [...new Set(groups.map(g => g.module))];
const header = [...modules.keys()].map(file => `import * as ${aliasOf(file)} from '${rel(spec.source, file)}';`).join('\n')
    + `\n// ${spec.function} 的连续语句分组放在 ${homes.join('、')}；分组函数返回它表示“没处理”，接着往下走。\nexport const ${spec.sentinel} = Symbol('${spec.sentinel}');`;
out = out.slice(0, lastImport.end) + '\n' + header + out.slice(lastImport.end);
fs.writeFileSync(path.join(root, 'src', spec.source), out);
console.log(JSON.stringify({ source: spec.source, exportsAdded: [...needExport], modules: [...modules].map(([file, m]) => ({ file, groups: m.groups.map(g => `${g.name}(${g.params.join(', ')})`), bytes: fs.statSync(path.join(root, 'src', file)).size })) }, null, 2));
