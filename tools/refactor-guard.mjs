// Refactor guard (dev tool, not loaded by the extension).
//
// A structural refactor may move code between files, add import lines and add
// alias shims. It may not change what any piece of code says. This tool records
// three independent fingerprints of the runtime and later proves they survived:
//
//   1. declarations — every top-level declaration of every module reachable from
//      src/heartbeatMemories.js, hashed by its exact source text (imports and the
//      `export` keyword are ignored, so moving a declaration to another file is
//      free, editing it is not);
//   2. surface      — the built bundle evaluated in a VM: every module's export
//      names, each function's exact source, every exported value;
//   3. css          — the CSS text actually produced by every zero-argument
//      `ensure…Styles` / `…Css` export;
//   4. bindings     — every top-level `const a = ns.b;` alias, and every destructure
//      of an `import * as` namespace, that is still undefined when its module
//      initialises. Reading a module object before that module finishes
//      initialising is the same bug. CSS output and these bindings are never
//      allowlisted.
//
// Usage:
//   node tools/refactor-guard.mjs snapshot [out.json]   (default verification/refactor-baseline.json)
//   node tools/refactor-guard.mjs check [baseline.json]
//
// verification/refactor-allow.json (optional) lists declarations / exports whose
// text is allowed to differ from the baseline, each with a written reason, e.g. a
// CSS function split into parts. CSS output and init bindings are never allowed
// to differ; only a new baseline can change those.
//
// Needs acorn (only for step 1). Resolved from ACORN_PATH, NODE_PATH, the
// Claude sandbox's global npm tree, or node_modules next to node itself.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [, , command = 'check', fileArg] = process.argv;
const baselinePath = path.resolve(fileArg || path.join(root, 'verification/refactor-baseline.json'));
const digest = text => crypto.createHash('sha256').update(text).digest('hex').slice(0, 20);

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
        try { return require(candidate); } catch {}
    }
    throw new Error('acorn not found; set ACORN_PATH to an acorn package directory');
}

// Same import grammar as tools/build-runtime-bundle.mjs, so "reachable" means the same thing.
const importRe = /^import\s+(\*\s+as\s+(\w+)|\{([^}]+)\})\s+from\s+['"]([^'"]+)['"];?\s*$/gm;
function reachableModules() {
    const seen = new Map();
    const visit = file => {
        if (seen.has(file)) return;
        const source = fs.readFileSync(path.join(root, 'src', file), 'utf8');
        seen.set(file, source);
        for (const match of source.matchAll(importRe)) visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), match[4])));
    };
    visit('heartbeatMemories.js');
    return seen;
}

function declarations(modules) {
    const acorn = loadAcorn();
    const table = {};
    for (const [file, source] of [...modules].sort(([a], [b]) => a.localeCompare(b))) {
        const program = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
        for (const node of program.body) {
            if (node.type === 'ImportDeclaration') continue;
            const body = node.type === 'ExportNamedDeclaration' && node.declaration ? node.declaration : node;
            const text = source.slice(body.start, body.end);
            const name = body.id?.name || body.declarations?.map(row => row.id?.name).filter(Boolean).join(',') || body.type;
            const key = digest(text);
            const row = table[key] ||= { count: 0, where: `${file}:${name}@${body.loc.start.line}` };
            row.count += 1;
        }
    }
    return table;
}

function describeValue(value, seen = new Set(), depth = 0) {
    if (typeof value === 'function') return `fn:${digest(Function.prototype.toString.call(value))}`;
    if (value === null || typeof value !== 'object') return `${typeof value}:${JSON.stringify(value) ?? String(value)}`;
    if (seen.has(value)) return '[cycle]';
    if (depth > 6) return '[deep]';
    seen.add(value);
    const tag = Object.prototype.toString.call(value);
    let out;
    if (Array.isArray(value)) out = value.map(item => describeValue(item, seen, depth + 1));
    else if (tag === '[object Map]' || tag === '[object Set]') out = `${tag}:${value.size}`;
    else {
        out = {};
        for (const key of Object.keys(value).sort()) {
            try { out[key] = describeValue(value[key], seen, depth + 1); } catch (error) { out[key] = `throws:${error?.message}`; }
        }
    }
    seen.delete(value);
    return out;
}

async function evaluateBundle() {
    const styles = [];
    const element = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        setAttribute() {}, appendChild() {}, append() {}, addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
    const document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: element,
        head: { appendChild: node => styles.push(String(node.textContent ?? '')) }, body: element(),
        documentElement: { style: { setProperty() {} } }, addEventListener() {}, removeEventListener() {} };
    const host = { chat: [], characters: [], chatMetadata: {}, extensionSettings: {}, saveSettingsDebounced() {}, saveMetadata: async () => {} };
    const sandbox = { console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, TextEncoder, TextDecoder, AbortController, DOMException, URL, Blob,
        Response, CompressionStream, DecompressionStream, Uint8Array, ArrayBuffer, DataView, queueMicrotask, setTimeout, clearTimeout,
        setInterval, clearInterval, performance, structuredClone, btoa, atob, crypto: globalThis.crypto, document,
        window: { addEventListener() {}, removeEventListener() {} }, navigator: {}, location: { protocol: 'https:', origin: 'https://localhost' },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, SillyTavern: { getContext: () => host },
        toastr: { info() {}, success() {}, warning() {}, error() {} } };
    const context = vm.createContext(sandbox);
    const unresolved = new Set();
    sandbox.__guardBind = (owner, key, label) => {
        const value = owner?.[key];
        if (value === undefined) unresolved.add(label);
        return value;
    };
    const prelude = `const __premature=[];
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
    let module = '';
    const aliases = new Set();
    const code = fs.readFileSync(path.join(root, 'dist/heartbeatMemories.bundle.js'), 'utf8').split('\n').map(line => {
        const created = line.match(/^const (__m_([\w$]+)) = Object\.create\(null\);$/);
        if (created) return `const ${created[1]} = __track(${JSON.stringify(created[2])});`;
        const marker = line.match(/^\/\/ MODULE: (.+)$/);
        if (marker) { module = marker[1]; aliases.clear(); return line; }
        if (line.startsWith('function __init_')) { aliases.clear(); return line; }
        const initCall = line.match(/^(__init_([\w$]+))\(\);$/);
        if (initCall) return `__current=${JSON.stringify(initCall[2])}; ${initCall[1]}(); __inited.add(${JSON.stringify(initCall[2])}); __current=null;`;
        const namespace = line.match(/^const ([A-Za-z_$][\w$]*) = (__m_[\w$]+);$/);
        if (namespace) { aliases.add(namespace[1]); return line; }
        const alias = line.match(/^const (\w+) = ([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*);$/);
        if (alias) return `const ${alias[1]} = __guardBind(${alias[2]}, ${JSON.stringify(alias[3])}, ${JSON.stringify(module + ':' + alias[1])});`;
        const destructure = line.match(/^const \{([^{}]+)\} = ([A-Za-z_$][\w$]*);$/);
        if (destructure && aliases.has(destructure[2])) {
            const checks = [];
            for (const part of destructure[1].split(',')) {
                const piece = part.trim();
                if (!piece || piece.startsWith('...')) continue;
                const key = piece.split(':')[0].split('=')[0].trim();
                const local = (piece.includes(':') ? piece.split(':')[1] : piece).split('=')[0].trim();
                if (!/^[A-Za-z_$][\w$]*$/.test(key) || !/^[A-Za-z_$][\w$]*$/.test(local)) continue;
                checks.push(`__guardBind(${destructure[2]}, ${JSON.stringify(key)}, ${JSON.stringify(module + ':' + local)});`);
            }
            if (checks.length) return `${checks.join(' ')} ${line}`;
        }
        return line;
    }).join('\n');
    const paths = [...code.matchAll(/^\/\/ MODULE: (.+)$/gm)].map(match => match[1]);
    const exposed = '\nexport const __guardNamespaces={' + paths.map(file => JSON.stringify(file) + ':__m_' + file.replace(/[^a-zA-Z0-9]/g, '_')).join(',') + '};\nexport const __guardPremature=[...new Set(__premature)];\n';
    const compiled = new vm.SourceTextModule(prelude + code + exposed, { context, identifier: 'bundle' });
    await compiled.link(() => { throw new Error('bundle must not import'); });
    await compiled.evaluate();
    return { namespaces: compiled.namespace.__guardNamespaces, styles, unresolved: [...unresolved].sort(), premature: compiled.namespace.__guardPremature };
}

async function surfaceAndCss() {
    const { namespaces, styles, unresolved, premature } = await evaluateBundle();
    const surface = {}, css = {};
    for (const file of Object.keys(namespaces).sort()) {
        const ns = namespaces[file];
        surface[file] = {};
        for (const name of Object.keys(ns).sort()) {
            const value = ns[name];
            surface[file][name] = digest(JSON.stringify(describeValue(value)));
            if (typeof value === 'function' && value.length === 0 && (/^ensure\w*Styles?$/.test(name) || /Css$/.test(name))) {
                styles.length = 0;
                let result;
                try { result = value(); } catch (error) { result = `throws:${error?.message}`; }
                css[`${file}#${name}`] = digest(JSON.stringify([typeof result === 'string' ? result : null, styles.slice()]));
            }
        }
    }
    return { surface, css, unresolvedBindings: unresolved, premature };
}

async function snapshot() {
    const modules = reachableModules();
    const bundleHeader = fs.readFileSync(path.join(root, 'dist/heartbeatMemories.bundle.js'), 'utf8').slice(0, 400);
    if (!bundleHeader.includes(`Source modules: ${modules.size}`)) throw new Error('dist bundle is stale: run node tools/build-runtime-bundle.mjs first');
    const measured = await surfaceAndCss();
    return { tool: 'refactor-guard/1', modules: modules.size, declarations: declarations(modules), ...measured };
}

const current = await snapshot();
if (command === 'snapshot') {
    if (current.premature.length) throw new Error(`binding read before init: ${current.premature.join('; ')}`);
    const { premature, ...recorded } = current;
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify(recorded) + '\n');
    console.log(JSON.stringify({ wrote: path.relative(root, baselinePath), modules: current.modules,
        declarations: Object.values(current.declarations).reduce((sum, row) => sum + row.count, 0),
        exports: Object.values(current.surface).reduce((sum, row) => sum + Object.keys(row).length, 0), css: Object.keys(current.css).length,
        unresolvedBindings: current.unresolvedBindings.length }));
} else if (command === 'check') {
    const base = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const allowPath = path.join(path.dirname(baselinePath), 'refactor-allow.json');
    const allow = fs.existsSync(allowPath) ? JSON.parse(fs.readFileSync(allowPath, 'utf8')) : { entries: [] };
    for (const entry of allow.entries) if (!entry.reason || !entry.declaration) throw new Error('refactor-allow.json: every entry needs declaration and reason');
    const allowed = new Set(allow.entries.map(entry => entry.declaration));
    const problems = [], added = [], allowedChanges = [];
    for (const [key, row] of Object.entries(base.declarations)) {
        const now = current.declarations[key]?.count || 0;
        if (now >= row.count) continue;
        const declaration = row.where.replace(/@\d+$/, '');
        if (allowed.has(declaration)) allowedChanges.push(`declaration: ${declaration}`);
        else problems.push(`declaration changed or removed: ${row.where}`);
    }
    for (const [key, row] of Object.entries(current.declarations)) {
        if ((base.declarations[key]?.count || 0) < row.count) added.push(row.where);
    }
    for (const [file, names] of Object.entries(base.surface)) {
        for (const [name, value] of Object.entries(names)) {
            if (!current.surface[file] || !(name in current.surface[file])) problems.push(`export missing: ${file} ${name}`);
            else if (current.surface[file][name] !== value) {
                if (allowed.has(`${file}:${name}`)) allowedChanges.push(`export: ${file} ${name}`);
                else problems.push(`export changed: ${file} ${name}`);
            }
        }
    }
    for (const row of current.premature) problems.push(`binding read before init: ${row}`);
    for (const label of current.unresolvedBindings) {
        if (!base.unresolvedBindings.includes(label)) problems.push(`binding undefined at init (module order): ${label}`);
    }
    for (const [key, value] of Object.entries(base.css)) {
        if (current.css[key] !== value) problems.push(`css changed: ${key}`);
    }
    const report = { ok: problems.length === 0, baselineModules: base.modules, modules: current.modules, problems, allowedChanges, addedDeclarations: added };
    console.log(JSON.stringify(report, null, 2));
    if (problems.length) process.exitCode = 1;
} else {
    console.error('usage: refactor-guard.mjs snapshot|check [file]');
    process.exitCode = 2;
}
