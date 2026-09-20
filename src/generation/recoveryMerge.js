// Recovery-only received-data union. The path schema is supplied by the domain,
// never by model data. This module does not generate text or relax validation.
import * as json_parser from './jsonParser.js';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
const pointer = (base, key) => `${base}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
export function recoveryValueKey(value) {
    if (Array.isArray(value)) return `[${value.map(recoveryValueKey).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${recoveryValueKey(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
}
export function recoveryItemKey(...fields) {
    return value => {
        for (const field of fields) if (typeof value?.[field] === 'string' && value[field]) return `${field}:${value[field]}`;
        return recoveryValueKey(value);
    };
}
export function recoveryRecord(children, bind = []) { return { children, bind }; }
export function recoveryList(key, item = null, accept = null) { return { list: true, key, item, acceptItem: accept }; }
export function recoveryText(value) { return typeof value === 'string' && value.trim().length > 0; }
export function recoveryCheck(check) { try { return !!check(); } catch { return false; } }

function readTree(parsed, path = '') {
    const value = parsed.at(path);
    if (value === undefined) return null;
    const node = { value: copy(value), complete: parsed.has(path) };
    if (value && typeof value === 'object') {
        node.array = Array.isArray(value);
        node.children = {};
        for (const key of Object.keys(value)) {
            // An own-data map, not assignment to a model-controlled prototype key.
            Object.defineProperty(node.children, key, { value: readTree(parsed, pointer(path, key)), enumerable: true, writable: true, configurable: true });
        }
    }
    return node;
}
function data(node, partial = true) {
    if (!node) return undefined;
    if (!node.children) return copy(node.value);
    if (node.array) return Object.values(node.children).filter(child => child && (partial || child.complete)).map(child => data(child, partial));
    return Object.fromEntries(Object.entries(node.children).filter(([, child]) => child).map(([key, child]) => [key, data(child, partial)]));
}
function accepted(node, spec) {
    if (!node) return false;
    if (!node.complete && spec?.required?.some(key => !node.children?.[key]?.complete)) return false;
    if (typeof spec?.accept === 'function' && !recoveryCheck(() => spec.accept(data(node)))) return false;
    return true;
}
function bindingsMatch(a, b, spec) {
    for (const key of spec?.bind || []) {
        const old = a?.children?.[key], next = b?.children?.[key];
        if (old?.complete && next?.complete && recoveryValueKey(data(old)) !== recoveryValueKey(data(next))) return false;
    }
    return true;
}
function ignoreReplacement(node, state) {
    const visit = value => {
        if (typeof value === 'string') state.ignoredNewStrings.add(value.trim());
        else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    };
    visit(data(node));
}
function unite(a, b, spec, state, path = '', parentA = null, parentB = null) {
    if (!a || !accepted(a, spec)) return b;
    if (!b) return a;
    if (!spec) {
        // Atomic units keep their original text together with evidence/attribution.
        if (a.complete) { ignoreReplacement(b, state); return a; }
        return b;
    }
    if (!bindingsMatch(a, b, spec)) {
        state.conflicts.add(path || '/');
        return a;
    }
    if (spec.list) {
        if (!a.array) return b;
        if (!b.array) return a;
        const rows = [], positions = new Map(), oldOccurrences = new Map(), newOccurrences = new Map();
        const eligible = (node, parent) => node && (spec.item || node.complete)
            && (typeof spec.acceptItem !== 'function' || recoveryCheck(() => spec.acceptItem(data(node), data(parent))));
        const keyFor = (node, occurrence) => {
            const key = spec.key ? spec.key(data(node)) : recoveryValueKey(data(node));
            // Unkeyed dialogue is an ordered multiset: repeated equal lines remain repeated.
            if (spec.key) return key;
            const n = occurrence.get(key) || 0; occurrence.set(key, n + 1); return `${key}\u001f${n}`;
        };
        for (const node of Object.values(a.children || {}).filter(node => eligible(node, parentA))) {
            const key = keyFor(node, oldOccurrences);
            if (!positions.has(key)) { positions.set(key, rows.length); rows.push(node); }
        }
        for (const node of Object.values(b.children || {}).filter(node => eligible(node, parentB))) {
            const key = keyFor(node, newOccurrences), index = positions.get(key);
            if (index === undefined) { positions.set(key, rows.length); rows.push(node); }
            else rows[index] = unite(rows[index], node, spec.item, state, `${path}/*`);
        }
        return { array: true, complete: b.complete, children: Object.fromEntries(rows.map((row, index) => [index, row])) };
    }
    if (spec.children) {
        if (!a.children || a.array || !b.children || b.array) return a.complete ? a : b;
        const result = { array: false, complete: a.complete || b.complete,
            children: a.complete ? { ...b.children, ...a.children } : { ...a.children, ...b.children } };
        for (const [key, childSpec] of Object.entries(spec.children)) {
            const required = childSpec?.parentRequired || [];
            const old = required.every(field => a.children[field]?.complete) ? a.children[key] : null;
            const next = required.every(field => b.children[field]?.complete) ? b.children[key] : null;
            const merged = unite(old, next, childSpec, state, pointer(path, key), a, b);
            if (merged) Object.defineProperty(result.children, key, { value: merged, enumerable: true, configurable: true, writable: true });
        }
        // Preserve the original binding when retaining its children; a reply cannot
        // omit an owner and thereby reassign retained children to another owner.
        for (const key of spec.bind || []) if (a.children[key]?.complete) result.children[key] = a.children[key];
        return result;
    }
    if (a.complete && accepted(a, spec)) {
        if (typeof a.value === 'string' && typeof b.value === 'string' && b.complete && b.value.startsWith(a.value)) return b;
        ignoreReplacement(b, state); return a;
    }
    return b;
}
function view(tree, complete) {
    const nodes = new Map();
    const visit = (node, path) => {
        if (!node) return; nodes.set(path, node);
        for (const [key, child] of Object.entries(node.children || {})) visit(child, pointer(path, key));
    };
    visit(tree, '');
    return { value: data(tree, false), partialValue: data(tree), complete,
        has: path => !!nodes.get(path)?.complete,
        at: path => data(nodes.get(path)),
        items: path => {
            const node = nodes.get(path);
            return node?.array ? Object.values(node.children).filter(child => child?.complete).map(child => data(child, false)) : [];
        } };
}
export function mergeRecoveryPartials(raws, schema, { final = false } = {}) {
    const state = { conflicts: new Set(), ignoredNewStrings: new Set() }; let tree = null;
    for (const raw of raws) {
        const parsed = json_parser.parsePartialJsonObject(raw), next = readTree(parsed);
        if (!tree) tree = next;
        else if (schema) tree = unite(tree, next, schema, state);
        else tree = next;
    }
    const parsed = view(tree, final && state.conflicts.size === 0);
    return { ...parsed, conflicts: [...state.conflicts], ignoredNewStrings: [...state.ignoredNewStrings] };
}

// Storage history has no separate new capacity: the caller applies the existing
// per-segment and per-journal limits to this entire set, before replacing state.
export function retainedRecoveryPartials(segment, nextRaw) {
    const sources = [...(segment?.retainedPartials || []), ...(typeof segment?.partial === 'string' ? [segment.partial] : [])];
    return [...new Set(sources)].filter(raw => raw !== nextRaw);
}
