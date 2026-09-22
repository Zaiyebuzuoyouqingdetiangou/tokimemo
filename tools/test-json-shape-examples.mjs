import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonShapeExampleBlock } from '../src/generation/jsonShapeExamples.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
function fail(message) { failures.push(message); }

function parseExample(block) {
    const start = block.indexOf('{');
    if (start < 0) throw new Error('example has no object');
    return JSON.parse(block.slice(start));
}
function keysOf(value, out = new Set()) {
    if (Array.isArray(value)) { for (const item of value) keysOf(item, out); return out; }
    if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) { out.add(key); keysOf(child, out); }
    }
    return out;
}
function assertKeysIn(text, sample, where) {
    for (const key of keysOf(sample)) {
        if (!new RegExp(`(^|[^A-Za-z0-9_])${key}([^A-Za-z0-9_]|$)`).test(text)) fail(`${where} 的例子字段 "${key}" 不在该页 Prompt 格式里`);
    }
}

const scenario = jsonShapeExampleBlock('写出【角色互动 / Drama：春 Scenario】的数据\n{"scenarioDramas":[{"id":"SCENE_SPRING","season":"spring","title":"春 Scenario Drama"}]}');
const scenarioJson = parseExample(scenario);
if (scenarioJson.scenarioDramas[0].kind) fail('Scenario 例子仍使用 kind');
if (scenarioJson.scenarioDramas[0].season !== 'spring') fail('Scenario 例子 season 不是 spring');
if (scenarioJson.scenarioDramas[0].id !== 'SCENE_SPRING') fail('Scenario 例子 id 不是 SCENE_SPRING');
assertKeysIn('{"scenarioDramas":[{"season":"spring","id":"SCENE_SPRING","title":"","subtitle":"","setting":"","visualTone":"","script":[{"speaker":"","text":""}]}]}', scenarioJson, '春 Scenario');

const singleScan = parseExample(jsonShapeExampleBlock('写出【回忆相簿 / 分段 2：当下关系扫描】\n{"charState":"","userState":"","relationshipState":"","relationshipSummary":"","relationshipSourceMemoryIds":[],"relationshipSourceMemoryAnchor":""}'));
if (singleScan.people) fail('单人相簿关系扫描仍是 people 数组');
if (!singleScan.charState) fail('单人相簿关系扫描缺少 charState');

const multiScan = parseExample(jsonShapeExampleBlock('写出【回忆相簿 / 分段 2：当下关系扫描】\nUNTRUSTED_SELECTED_PARTICIPANTS_JSON:\n{"people":[{"speakerId":"","charState":"","userState":"","relationshipState":"","relationshipSummary":"","relationshipSourceMemoryIds":[],"relationshipSourceMemoryAnchor":""}]}'));
if (!Array.isArray(multiScan.people)) fail('多人相簿关系扫描不是 people 数组');

const singleComments = parseExample(jsonShapeExampleBlock('写出【回忆相簿 / 分段 3：当下共同回忆】\n{"items":[{"id":"CG01","comments":["当下对白1"]}] }'));
if (!singleComments.items[0].comments.every(line => typeof line === 'string')) fail('单人相簿共同回忆 comments 不是字符串');

const multiComments = parseExample(jsonShapeExampleBlock('写出【回忆相簿 / 分段 3：当下共同回忆】\nUNTRUSTED_SELECTED_PARTICIPANTS_JSON:\n{"items":[{"comments":[{"speakerId":"","text":""}]}]}'));
if (typeof multiComments.items[0].comments[0] === 'string') fail('多人相簿共同回忆 comments 仍是字符串');

const increment = parseExample(jsonShapeExampleBlock('写出【蝴蝶效应 / 增量分歧】\n{"nodes":[{"id":"EG_NEW_01","primaryAxis":"","worldSpec":{},"monologue":"","intervention":"","systemNote":""}],"omega":{"id":"OMEGA","monologue":"","intervention":"","systemNote":""}}'));
if (!Array.isArray(increment.nodes) || increment.node) fail('增量分歧例子不是 nodes 数组');
if (!increment.omega) fail('增量分歧例子缺少 omega');

function slotPrompt(slot) {
    return `写出【蝴蝶效应】\n【本请求的分段输出规则替代上面的整批输出 schema】\nCURRENT_SLOT_JSON:${JSON.stringify(slot)}\n{"node":{"id":"","label":"","code":"","locked":false,"trueEnding":false,"sourceMemoryIds":[],"sourceMemoryAnchor":"","monologue":"","intervention":"","systemNote":"","branchAxes":[],"worldSpec":{"primaryAxis":"","era":"","identity":"","occupation":"","location":"","keyDecision":"","encounterWithUser":"","bondWithUser":"","finalFate":"","thirdPartyRomance":false}}}`;
}
const main = parseExample(jsonShapeExampleBlock(slotPrompt({ index: 0, kind: 'MAIN' })));
if (main.node.id !== 'MAIN' || main.node.locked !== true || main.node.trueEnding !== false) fail('MAIN 槽位例子不是锁定主线');
const omega = parseExample(jsonShapeExampleBlock(slotPrompt({ index: 2, kind: 'OMEGA' })));
if (omega.node.id !== 'OMEGA' || omega.node.monologue !== '' || omega.node.trueEnding !== true) fail('Ω 槽位例子不是空独白终点');
const branch = parseExample(jsonShapeExampleBlock(slotPrompt({ index: 1, kind: 'decision', primaryAxis: 'decision' })));
if (branch.node.id === 'MAIN' || branch.node.id === 'OMEGA') fail('普通槽位拿到了特殊节点例子');
if (branch.node.worldSpec.primaryAxis !== 'decision' || branch.node.locked !== false) fail('普通槽位没有使用 CURRENT_SLOT_JSON 的轴');

for (const label of ['回忆相簿 / 单项重新生成', '角色互动 / 单个萤火虫追加约会会话重新生成', '成就库 / 单项重新生成', 'ADV EVENT / 单个事件重新生成', '蝴蝶效应 / 单个观测节点重新生成', '两个人的日历 / 单项重新整理', '两个人的日历 / 单张便签重新生成', '两个人的日历 / 页角随笔重新生成', 'ENDING / 未解锁路线单项重新生成', 'ENDING / 单个告白回看重新生成', '回忆相簿 / 单项重新判断分类']) {
    if (jsonShapeExampleBlock(`写出【${label}】的数据\n{"id":"原值","color":"pink","sourceMemoryIds":["M010"],"unlocked":true}`)) fail(`${label} 不应再附例子`);
}

async function sourceFiles(dir) {
    const rows = [];
    for (const item of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) rows.push(...await sourceFiles(full));
        else if (item.name.endsWith('.js')) rows.push(full);
    }
    return rows;
}
const labelRe = /promptSafetyBoundary\([\s\S]{0,240}?['"`]([^'"`]{1,80})['"`]/g;
for (const file of await sourceFiles(path.join(root, 'src'))) {
    const source = await readFile(file, 'utf8');
    const parts = source.split(/\nexport function /);
    for (const part of parts) {
        const labels = [...part.matchAll(labelRe)].map(match => match[1]).filter(label => !label.includes('${'));
        if (part.includes('Drama：${label} Scenario')) labels.push('角色互动 / Drama：春 Scenario');
        if (part.includes('Drama：${label} Voice')) labels.push('角色互动 / Drama：春 Voice');
        for (const label of labels) {
            const sampleText = `写出【${label}】的数据\n${part}`;
            const block = jsonShapeExampleBlock(sampleText);
            if (!block) continue;
            assertKeysIn(source, parseExample(block), `${path.relative(root, file)} / ${label}`);
        }
    }
}

if (failures.length) {
    console.error(failures.join('\n'));
    process.exit(1);
}
console.log('json-shape-examples-ok');
