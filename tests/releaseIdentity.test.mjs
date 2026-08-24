import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('public extension identity stays fixed while version is separate', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  const readme = await readFile(new URL('README.md', root), 'utf8');
  const index = await readFile(new URL('index.js', root), 'utf8');

  assert.equal(manifest.display_name, '心跳回忆');
  assert.equal(manifest.version, '0.8.11');
  assert.equal(manifest.auto_update, true);
  assert.equal(manifest.homePage, 'https://github.com/Zaiyebuzuoyouqingdetiangou/tokimemo');
  assert.doesNotMatch(manifest.display_name, /\d+\.\d+/);
  assert.match(readme, /^# 心跳回忆\s*$/m);
  assert.doesNotMatch(readme.split('\n')[0], /\d+\.\d+/);
  assert.match(index, /const VERSION = '0\.8\.11'/);
});
