import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('public extension identity stays fixed while version is separate', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  const readme = await readFile(new URL('README.md', root), 'utf8');
  const index = await readFile(new URL('index.js', root), 'utf8');

  assert.equal(manifest.display_name, '心跳回忆');
  assert.equal(manifest.version, '0.8.41');
  assert.equal(manifest.auto_update, true);
  assert.equal(manifest.homePage, 'https://github.com/Zaiyebuzuoyouqingdetiangou/tokimemo');
  assert.doesNotMatch(manifest.display_name, /\d+\.\d+/);
  assert.match(readme, /^# 心跳回忆\s*$/m);
  assert.doesNotMatch(readme.split('\n')[0], /\d+\.\d+/);
  assert.match(index, /const VERSION = '0\.8\.41'/);
});


test('release runtime bundle is generated from the current modular source tree', async () => {
  const srcRoot = new URL('../src/', import.meta.url);
  const files = (await readdir(srcRoot, { recursive: true })).filter(name => name.endsWith('.js')).map(name => name.replaceAll('\\', '/')).sort();
  const byFile = new Map();
  for (const name of files) byFile.set(name, await readFile(new URL(name, srcRoot), 'utf8'));
  const dependencyRe = /^import\s+.*?from\s+['\"]([^'\"]+)['\"]/gm;
  const reachable = new Set();
  const visit = name => {
    if (reachable.has(name)) return;
    reachable.add(name);
    const source = byFile.get(name);
    assert.ok(source, `missing source module ${name}`);
    for (const match of source.matchAll(dependencyRe)) {
      const specifier = match[1].split('?')[0];
      if (!specifier.startsWith('.')) continue;
      const parts = name.split('/'); parts.pop();
      for (const part of specifier.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') parts.pop(); else parts.push(part);
      }
      visit(parts.join('/'));
    }
  };
  visit('heartbeatMemories.js');
  const hash = createHash('sha256');
  for (const name of [...reachable].sort()) hash.update(name).update('\0').update(byFile.get(name)).update('\0');
  const digest = hash.digest('hex');
  const bundle = await readFile(new URL('../dist/heartbeatMemories.bundle.js', import.meta.url), 'utf8');
  assert.match(bundle, new RegExp(`Source SHA-256: ${digest}`));
  assert.match(bundle, new RegExp(`Source modules: ${reachable.size}`));
});


test('relationship calendar is visible on the archive-library landing screen', async () => {
  const library = await readFile(new URL('../src/archive/library.js', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/ui/styles.js', import.meta.url), 'utf8');
  assert.match(library, /export function showArchiveLibrary\(\)[\s\S]*let calendarQuick = snapshotCalendarQuickAccessHtml/);
  assert.match(library, /body\.innerHTML = `[\s\S]*\$\{calendarQuick\}[\s\S]*rmt-character-portals/);
  assert.match(library, /!ready \|\| generating \? 'disabled' : ''/);
  assert.match(styles, /\.rmt-calendar-quick\{display:grid/);
});
