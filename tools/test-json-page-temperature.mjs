import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonPageTemperature } from '../src/generation/jsonPageTemperature.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function fail(message) { failures.push(message); }

if (jsonPageTemperature(0.65) !== 0.4) fail('0.65 没有降到 0.4');
if (jsonPageTemperature(0.8, 0.9) !== 0.4) fail('0.8 没有降到 0.4');
if (jsonPageTemperature(0.25) !== 0.25) fail('0.25 被抬高了');
if (jsonPageTemperature(0.2, 0.9) !== 0.2) fail('0.2 被抬高了');
if (jsonPageTemperature(undefined, 0.9) !== 0.4) fail('没写温度时仍跟着 0.9 走');
if (jsonPageTemperature(undefined, 0.2) !== 0.2) fail('没写温度且连接更冷时没有保持 0.2');

async function sourceFiles(dir) {
    const rows = [];
    for (const item of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) rows.push(...await sourceFiles(full));
        else if (item.name.endsWith('.js')) rows.push(full);
    }
    return rows;
}
for (const file of await sourceFiles(path.join(root, 'src'))) {
    if (file.endsWith(`${path.sep}constants.js`)) continue;
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/temperature:\s*(0\.\d+)/g)) {
        if (Number(match[1]) > 0.4) fail(`${path.relative(root, file)} 仍写着 temperature: ${match[1]}`);
    }
}

if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
}
console.log('json-page-temperature-ok');
