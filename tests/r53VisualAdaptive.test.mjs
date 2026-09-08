import test from 'node:test';
import assert from 'node:assert/strict';
import * as contract from '../src/core/butterflyContract.js';
import { resolveThemePalette, applyThemeToElement, contrastRatio } from '../src/core/theme.js';
import { generateButterflyWithRepair, normalizeButterfly, normalizeButterflyIncrementPart, mergeButterflyIncremental, BUTTERFLY_PRIMARY_AXES } from '../src/modes/butterfly.js';
import { PROMPTS } from '../src/generation/prompts.js';

const bank = count => ({ characterName: '林舟', userName: '小雨', memories: Array.from({ length: count }, (_, i) => ({
    id: 'M' + String(i + 1).padStart(3, '0'), title: '雨天借伞' + i, summary: '小雨送来木杯，林舟接过蓝伞。', anchors: ['蓝伞'],
})) });
const note = '分析结论表明关键变量影响主体路径，模型概率发生偏差，最终判定：当前选择使这一条命运路径成为唯一解。';
function node(kind) {
    if (kind === 'OMEGA') return { id: 'OMEGA', label: '观测点 Ω', monologue: '', intervention: '我看过时代与身份的改变，也看过不同职业带来的选择。我明白命运不会替我回答，我仍然选择了你，你是我的唯一答案。'.repeat(4), systemNote: note };
    return { label: '观测' + kind, sourceMemoryIds: kind === 'MAIN' ? ['M001'] : [], sourceMemoryAnchor: kind === 'MAIN' ? '蓝伞' : '',
        worldSpec: { primaryAxis: kind, era: '旧都年代', identity: '旅人' + kind, occupation: '木匠', location: '河岸', keyDecision: '留在故乡', encounterWithUser: '在河边与你相遇', bondWithUser: '和你成为朋友', finalFate: '平静经营木工店', thirdPartyRomance: false },
        monologue: ('我在' + kind + '整理蓝伞，想着今天该做些什么。').repeat(12),
        intervention: '看见那个我，我才明白不同的选择也会带来安稳的生活，我珍惜现在与你在河边交谈的机会，也愿意认真面对自己的决定。', systemNote: note };
}

test('r53 local plan scales by unique nonempty archive memories, never model counts', () => {
    for (const [count, total] of [[1,3],[3,3],[4,4],[6,4],[7,5],[21,9],[22,10],[100,10]]) {
        const plan = contract.buildButterflyPlan(bank(count));
        assert.equal(plan.total, total);
        assert.equal(plan.axes.length, total - 2);
        assert.equal(new Set(plan.axes).size, plan.axes.length);
    }
    const duplicate = bank(1); duplicate.memories.push(duplicate.memories[0], { id: 'M002' }, { id: 'FAKE', title: '伪造编号' });
    assert.equal(contract.buildButterflyPlan(duplicate).memoryCount, 1);
    assert.equal(contract.buildButterflyPlan({}).total, 0);
    assert.equal(contract.buildButterflyPlan({ memories: [{ id: 'M001', title: '雨', summary: '两个人一起在雨里走过长街。', anchors: [] }] }).total, 0);
});

test('r53 initial generation, prompt, progress and final validator agree for small and large banks', async () => {
    for (const count of [1,4,7,22]) {
        const memory = bank(count), plan = contract.buildButterflyPlan(memory), calls = [], old = structuredClone(memory);
        const prompt = PROMPTS.butterfly({ name1: '小雨', name2: '林舟' }, memory);
        assert.doesNotMatch(prompt, /至少 10 条|至少 8 条|EG01～EG08|前 8 个|组装十个/);
        const session = await generateButterflyWithRepair({ name1: '小雨' }, memory, null, 'adaptive', {
            contextEnvelope: '', request: async (prompt, status, options, validate) => {
                const slot = JSON.parse(prompt.match(/CURRENT_SLOT_JSON:([^\n]+)/)[1]);
                calls.push(slot.kind);
                assert.ok(status.includes('/' + plan.total + ' ·'));
                if (slot.kind === 'OMEGA') {
                    const voices = JSON.parse(prompt.match(/VALIDATED_VOICES_JSON:([^\n]+)/)[1]);
                    assert.equal(voices.length, plan.total - 1);
                }
                return validate({ node: node(slot.kind) });
            },
        });
        assert.equal(session.nodes.length, plan.total);
        assert.deepEqual(calls, ['MAIN', ...plan.axes, 'OMEGA']);
        assert.equal(session.nodes[0].locked, true);
        assert.equal(session.nodes.at(-1).trueEnding, true);
        assert.deepEqual(memory, old);
        assert.throws(() => normalizeButterfly({ nodes: session.nodes.filter((_, i) => i !== 1) }, memory, {}, { expectedAxes: plan.axes }));
        assert.throws(() => normalizeButterfly(session, memory, {}, { expectedAxes: [] }));
        assert.throws(() => normalizeButterfly(session, memory, {}, { expectedAxes: ['fate', ...plan.axes.slice(1)] }));
        assert.throws(() => normalizeButterfly({ nodes: [...session.nodes, session.nodes.at(-1)] }, memory, {}));
    }
});

test('r53 no memories makes no provider request; legacy ten nodes are not trimmed as memory volume changes', async () => {
    let calls = 0;
    await assert.rejects(generateButterflyWithRepair({}, bank(0), null, 'empty', { contextEnvelope: '', request() { calls++; } }));
    await assert.rejects(generateButterflyWithRepair({}, { memories: [{ id: 'M001', title: '雨', summary: '一起走过长街', anchors: [] }] }, null, 'anchorless', { contextEnvelope: '', request() { calls++; } }));
    assert.equal(calls, 0);
    const old = { nodes: ['MAIN', ...BUTTERFLY_PRIMARY_AXES, 'OMEGA'].map(node) }, before = structuredClone(old);
    assert.equal(normalizeButterfly(old, bank(1)).nodes.length, 10);
    assert.deepEqual(old, before);
    const unsafe = structuredClone(old); unsafe.nodes[1].worldSpec.thirdPartyRomance = true;
    assert.throws(() => normalizeButterfly(unsafe, bank(1)));
    const invalidMain = structuredClone(old); invalidMain.nodes[0].sourceMemoryIds = ['M999'];
    assert.throws(() => normalizeButterfly(invalidMain, bank(1)));
});

test('r53 a small saved observation appends without replacing old worlds or inventing archive facts', () => {
    const memory = bank(1), beforeMemory = structuredClone(memory);
    const previous = normalizeButterfly({ nodes: ['MAIN','era','OMEGA'].map(node) }, memory);
    const before = structuredClone(previous);
    const fresh = node('era');
    fresh.label = '山城来信'; fresh.worldSpec.location = '山城'; fresh.monologue = fresh.monologue.replaceAll('era','山城');
    const part = normalizeButterflyIncrementPart({ nodes: [fresh], omega: node('OMEGA') }, memory);
    const merged = mergeButterflyIncremental(previous, part, ['M001']);
    assert.equal(merged.nodes.length, 4);
    assert.deepEqual(merged.nodes.slice(0,2), before.nodes.slice(0,2));
    assert.equal(merged.omegaHistory.length, 1);
    assert.deepEqual(previous, before);
    assert.deepEqual(memory, beforeMemory);
});

test('r53 semantic papers have independent readable inks instead of the universal card wash', () => {
    for (const themeMode of ['default','night','gs1','gs2','gs3','gs4','custom']) {
        const variables = new Map();
        const result = applyThemeToElement({ dataset: {}, style: { setProperty(k,v) { variables.set(k,v); } } }, { themeMode, themeAlpha: .72 });
        for (const kind of ['note','note-blue','note-rose','letter','journal']) {
            const paper = variables.get('--rmt-paper-' + kind), ink = variables.get('--rmt-paper-' + kind + '-ink');
            assert.ok(paper && ink, kind);
            assert.notEqual(paper, result.palette.surface);
            assert.ok(contrastRatio(ink, paper) >= 4.5, themeMode + kind);
        }
        assert.notEqual(variables.get('--rmt-paper-note'), variables.get('--rmt-paper-letter'));
    }
    for (const themeMode of ['gs1','gs2','gs3','gs4']) {
        const { palette } = resolveThemePalette({ themeMode });
        assert.notEqual(palette.background, palette.surface);
        assert.ok(contrastRatio(palette.text, palette.surface) >= 4.5);
    }
});

test('r53 custom grayscale extremes keep every controlled gradient endpoint readable', () => {
    for (const background of ['#707070', '#787878', '#999999', '#ffffff', '#171717']) {
        for (const accentAlt of ['#ffffff', '#000000', '#ff00ff']) for (const themeAlpha of [.72,1]) {
            const variables = new Map();
            const { palette } = applyThemeToElement({ dataset: {}, style: { setProperty(k,v) { variables.set(k,v); } } },
                { themeMode: 'custom', themeAlpha, themeCustom: { background, surface: background, accentAlt } });
            for (const name of ['--rmt-theme-surface-tint','--rmt-theme-bg-tint','--rmt-theme-header-tint','--rmt-theme-soft']) {
                assert.ok(contrastRatio(palette.text, variables.get(name)) >= 4.5, name + background);
                assert.ok(contrastRatio(palette.muted, variables.get(name)) >= 4.5, name + background);
            }
        }
    }
});
