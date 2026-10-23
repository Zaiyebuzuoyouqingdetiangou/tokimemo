import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = process.env.RMT_BUILD_SOURCE_ROOT || repository;
const builder = join(repository, 'tools/verification/build.py');
const orderFile = process.env.RMT_BUILD_MODULE_ORDER || join(repository, 'tools/verification/module-order.json');
const build = (...args) => JSON.parse(execFileSync('python3', [builder, ...args], { encoding: 'utf8' }));

test('a full source rebuild reproduces the checked-in runtime deterministically', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'hearttrace-build-'));
    try {
        const first = join(temporary, 'first.js');
        const second = join(temporary, 'second.js');
        const firstResult = build(sourceRoot, '--module-order', orderFile, '--output', first);
        const secondResult = build(sourceRoot, '--module-order', orderFile, '--output', second);
        assert.deepEqual(firstResult, secondResult);
        assert.equal(firstResult.modules, JSON.parse(await readFile(orderFile, 'utf8')).length);
        const generated = await readFile(first);
        assert.deepEqual(generated, await readFile(second));
        assert.deepEqual(generated, await readFile(join(sourceRoot, 'dist/heartbeatMemories.bundle.js')));
        assert.equal(build(sourceRoot, '--module-order', orderFile, '--check').check, 'passed');
        const runtime = new vm.SourceTextModule(generated.toString('utf8'));
        await runtime.link(() => { throw new Error('runtime bundle must be self-contained'); });
        await runtime.evaluate();
        const publicFunctions = ['autoMemoryContractSurface', 'destroyMemoryTheater', 'initMemoryTheater',
            'isGenerationBusy', 'openArchiveLibrary', 'openSettingsHome'];
        assert.deepEqual(Object.keys(runtime.namespace).sort(), publicFunctions);
        for (const name of publicFunctions) assert.equal(typeof runtime.namespace[name], 'function');
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
});

test('runtime imports link successfully and the complete graph matches the initializer inventory', async () => {
    const modules = new Map();
    const context = vm.createContext({});
    const src = join(sourceRoot, 'src');
    async function inspect(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) await inspect(path);
            else if (entry.name.endsWith('.js')) modules.set(path, new vm.SourceTextModule(await readFile(path, 'utf8'), { context, identifier: path }));
        }
    }
    await inspect(src);
    const entry = join(src, 'heartbeatMemories.js');
    const reached = new Set([entry]);
    await modules.get(entry).link((specifier, importing) => {
        assert.ok(specifier.startsWith('.'), `unexpected external runtime import: ${specifier}`);
        const target = resolve(dirname(importing.identifier), specifier);
        assert.ok(modules.has(target), `missing import: ${target}`);
        reached.add(target);
        return modules.get(target);
    });
    const expected = JSON.parse(await readFile(orderFile, 'utf8')).map(path => join(src, path));
    assert.deepEqual([...reached].sort(), expected.sort());
});

test('builder works without a preexisting bundle and reflects changed source', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'hearttrace-builder-fixture-'));
    try {
        await mkdir(join(temporary, 'src'));
        const order = join(temporary, 'order.json');
        await writeFile(order, JSON.stringify(['dependency.js', 'heartbeatMemories.js']));
        await writeFile(join(temporary, 'src/dependency.js'), 'export const value = 7;\n');
        await writeFile(join(temporary, 'src/heartbeatMemories.js'), "import { value as answer } from './dependency.js';\nexport function result() { return answer; }\nexport const untouched = 'export function stays in strings';\n");
        const output = join(temporary, 'result.js');
        const first = build(temporary, '--module-order', order, '--output', output);
        const firstModule = new vm.SourceTextModule(await readFile(output, 'utf8'));
        await firstModule.link(() => { throw new Error('bundle must be self-contained'); });
        await firstModule.evaluate();
        assert.equal(firstModule.namespace.result(), 7);
        assert.equal(firstModule.namespace.untouched, 'export function stays in strings');
        await writeFile(join(temporary, 'src/dependency.js'), 'export const value = 9;\n');
        const second = build(temporary, '--module-order', order, '--output', output);
        assert.notEqual(first.source_sha256, second.source_sha256);
        assert.notEqual(first.bundle_sha256, second.bundle_sha256);
        const secondModule = new vm.SourceTextModule(await readFile(output, 'utf8'));
        await secondModule.link(() => { throw new Error('bundle must be self-contained'); });
        await secondModule.evaluate();
        assert.equal(secondModule.namespace.result(), 9);

        await writeFile(join(temporary, 'src/dependency.js'), 'export default 9;\n');
        const unsupported = spawnSync('python3', [builder, temporary, '--module-order', order, '--output', output], { encoding: 'utf8' });
        assert.equal(unsupported.status, 1);
        assert.match(unsupported.stderr, /unsupported export declaration/);
        await writeFile(join(temporary, 'src/dependency.js'), "import * as added from './new.js';\nexport const value = 9;\n");
        await writeFile(join(temporary, 'src/new.js'), 'export const added = true;\n');
        const changedGraph = spawnSync('python3', [builder, temporary, '--module-order', order, '--output', output], { encoding: 'utf8' });
        assert.equal(changedGraph.status, 1);
        assert.match(changedGraph.stderr, /runtime graph differs.*new\.js/);
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
});

test('release notes generation embeds the complete README only when requested', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'hearttrace-release-fixture-'));
    try {
        await mkdir(join(temporary, 'src/core'), { recursive: true });
        const readme = '# Release\n\n包含中文和完整说明。\n';
        await writeFile(join(temporary, 'README.md'), readme);
        await writeFile(join(temporary, 'src/core/releaseNotes.js'), 'export const RELEASE_README = "old";\n');
        await writeFile(join(temporary, 'src/heartbeatMemories.js'), "import * as notes from './core/releaseNotes.js';\nexport function currentNotes() { return notes.RELEASE_README; }\n");
        const order = join(temporary, 'order.json');
        await writeFile(order, JSON.stringify(['core/releaseNotes.js', 'heartbeatMemories.js']));
        build(temporary, '--module-order', order, '--sync-release-notes');
        const result = new vm.SourceTextModule(await readFile(join(temporary, 'dist/heartbeatMemories.bundle.js'), 'utf8'));
        await result.link(() => { throw new Error('bundle must be self-contained'); });
        await result.evaluate();
        assert.equal(result.namespace.currentNotes(), readme);
        await writeFile(join(temporary, 'README.md'), '# Changed later\n');
        assert.equal(build(temporary, '--module-order', order, '--check').check, 'passed');
        assert.match(await readFile(join(temporary, 'src/core/releaseNotes.js'), 'utf8'), /包含中文和完整说明/);
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
});
