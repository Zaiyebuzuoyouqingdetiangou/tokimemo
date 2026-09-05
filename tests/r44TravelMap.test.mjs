import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    normalizeTravel,
    resolveTravelSceneTheme,
    safeTravelLocationKind,
    safeTravelTheme,
    travelMarkerPosition,
    travelMarkerPositions,
    travelPrompt,
} from '../src/modes/travel.js';
import { state as runtimeState } from '../src/core/state.js';
import { travelPostcardHtml } from '../src/ui/travelView.js';

const root = new URL('../', import.meta.url);
const memoryBank = {
    archiveName: '路线测试档案', archiveRevision: 'rev-r44-travel', characterName: '林砚', userName: '阿澄',
    memories: [
        { id: 'M001', date: '2026/08/01', title: '河边散步', summary: '两个人在河边散步后一起回家。', anchors: ['河边散步'] },
        { id: 'M002', date: '2026/08/03', title: '车站送别', summary: '他在车站送阿澄离开。', anchors: ['车站送别'] },
    ],
};

const SETTING_EVIDENCE = '林砚常去夜间书店，也可能沿工作路线抵达北方海港和山间终点；这些地点位于旧街、北岸和西岭。';
const presentActs = () => [
    { time: 'today', wish: 'peace', gesture: 'walk', tone: 'quiet', register: 'plain', image: 'path', intensity: 'low', cadence: 'fragments' },
    { time: 'now', emotion: 'grateful', wish: 'joy', tone: 'warm', register: 'restrained', image: 'light', intensity: 'medium', cadence: 'single' },
    { time: 'tonight', wish: 'good-dreams', gesture: 'listen', tone: 'quiet', register: 'lyrical', image: 'stars', intensity: 'low', cadence: 'stacked' },
];
const keepsake = tone => ({ kind: 'postcard', tone, presentExpressions: presentActs() });

function validLocations() {
    return [
        { id: 'N1', kind: 'near', name: '河边散步', region: '城南', distanceToken: 'walk', summary: '模型简介会被忽略。', basis: '记忆', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '河边散步', dialogueActs: presentActs(), dialogueLines: ['旧自由台词必须被忽略。'], x: 'url(evil)', css: '<style>' },
        { id: 'N2', kind: 'near', name: '夜间书店', region: '旧街', distanceToken: 'local', summary: '模型简介会被忽略。', basis: '设定', sourceSettingEvidence: SETTING_EVIDENCE, dialogueActs: presentActs() },
        { id: 'F1', kind: 'far', name: '北方海港', region: '北岸', distanceToken: 'journey', summary: '模型简介会被忽略。', basis: '设定', sourceSettingEvidence: SETTING_EVIDENCE, keepsake: keepsake('ocean') },
        { id: 'F2', kind: 'far', name: '山间终点', region: '西岭', distanceToken: 'distant', summary: '模型简介会被忽略。', basis: '设定', sourceSettingEvidence: SETTING_EVIDENCE, keepsake: keepsake('forest') },
    ];
}

test('r44 travel normalizer keeps safe text, real evidence and code-owned geometry', () => {
    const session = normalizeTravel({ title: '伪造标题', mapTheme: 'javascript:alert(1)', routeSummary: '伪造共同历史。', locations: validLocations() }, memoryBank, { controlledEvidence: SETTING_EVIDENCE });
    assert.equal(session.kind, 'travel');
    assert.equal(session.locations.length, 4);
    assert.equal(session.locations[0].sourceMemoryAnchor, '河边散步');
    assert.equal(session.locations[0].summary, '河边散步');
    assert.equal(session.locations[1].summary, SETTING_EVIDENCE);
    assert.doesNotMatch(session.locations[0].dialogueLines.join(' '), /旧自由台词/);
    assert.equal(session.title, '他的出行路线');
    assert.equal(session.routeSummary, '沿着他可能经过的坐标，看看生活怎样在地图上展开。');
    assert.equal('x' in session.locations[0], false);
    assert.equal('css' in session.locations[0], false);
    assert.notEqual(session.mapTheme, 'javascript:alert(1)');
    const first = travelMarkerPosition(session.locations[0], 0);
    assert.deepEqual(first, travelMarkerPosition(session.locations[0], 0));
    assert.ok(first.x >= 0 && first.x <= 100 && first.y >= 0 && first.y <= 100);
    const crowded = Array.from({ length: 12 }, (_, index) => ({ id: `ID${index}`, name: `任意${index * 7 + 3}`, kind: 'near' }));
    const positions = travelMarkerPositions(crowded);
    assert.equal(new Set(positions.map(point => `${point.x}|${point.y}`)).size, crowded.length);
    assert.deepEqual(positions, travelMarkerPositions(crowded));
    assert.equal(safeTravelLocationKind('far'), 'far');
    assert.equal(safeTravelLocationKind('x\" onclick=\"alert(1)'), 'near');
});

test('far-place scene themes are allowlisted, place semantics outrank hints, and old caches infer safely', () => {
    assert.equal(resolveTravelSceneTheme({ sceneTheme: 'scifi', name: 'Ocean Port' }, 'coast'), 'coast');
    assert.equal(resolveTravelSceneTheme({ name: 'Ocean Port', region: 'North Shore' }, 'city'), 'coast');
    assert.equal(resolveTravelSceneTheme({ name: '山间终点', summary: '雪峰下的高地。' }, 'coast'), 'mountain');
    assert.equal(resolveTravelSceneTheme({ name: 'Cedar Grove', summary: 'A quiet woodland trail.' }, 'city'), 'forest');
    assert.equal(resolveTravelSceneTheme({ name: 'Ordinary Workshop', summary: 'No visual landmark.' }, 'fantasy'), 'fantasy');
    assert.equal(resolveTravelSceneTheme({ sceneTheme: 'url(evil)', name: 'Transport Hub', summary: 'A plain terminal.' }, 'historic'), 'historic');

    const input = validLocations();
    input[2] = { ...input[2], sceneTheme: 'scifi' };
    input[3] = { ...input[3], sceneTheme: '"><svg onload=alert(1)>' };
    const session = normalizeTravel({ mapTheme: 'coast', locations: input }, memoryBank, { controlledEvidence: SETTING_EVIDENCE });
    assert.equal(session.locations[2].sceneTheme, 'coast');
    assert.equal(session.locations[3].sceneTheme, 'mountain');
    assert.ok(session.locations.filter(item => item.kind === 'far').every(item => /^(?:city|coast|forest|mountain|campus|historic|fantasy|scifi)$/.test(item.sceneTheme)));
    assert.equal(safeTravelTheme('night injected-token'), 'neutral');
});

test('r49 travel revalidates cached class tokens at the final HTML sink', () => {
    const previousSnapshot = runtimeState.activeArchiveSnapshot;
    runtimeState.activeArchiveSnapshot = { memory: { userName: '阿澄' } };
    try {
        const html = travelPostcardHtml({
            id: 'F-CACHE', kind: 'far', name: '远方', region: '北岸', distanceLabel: '需要远行',
            postcard: {
                tone: 'warm"><img src=x onerror=alert(1)><article class="',
                title: '平安抵达', body: '这一刻只想和你说晚安。', closing: '林砚',
            },
        }, { mapTheme: 'night injected-token' });
        assert.match(html, /class="rmt-travel-postcard tone-paper"/);
        assert.doesNotMatch(html, /<img\s|onerror=|injected-token/i);
    } finally {
        runtimeState.activeArchiveSnapshot = previousSnapshot;
    }
});

test('r44 travel rejects a memory stop without matching evidence and requires both map ranges', () => {
    const bad = validLocations();
    bad[0] = { ...bad[0], sourceMemoryIds: ['M404'], sourceMemoryAnchor: '不存在' };
    assert.throws(() => normalizeTravel({ locations: bad }, memoryBank, { controlledEvidence: SETTING_EVIDENCE }), /地点不足/);
    const partial = normalizeTravel({ locations: [] }, memoryBank, { allowPartial: true, sourceMemoryIds: ['M002'] });
    assert.deepEqual(partial.locations, []);
    const settingOnlyIncrement = normalizeTravel({ locations: validLocations().filter(item => item.basis === '设定') }, memoryBank, {
        allowPartial: true,
        sourceMemoryIds: ['M002'],
    });
    assert.deepEqual(settingOnlyIncrement.locations, []);
    const oldAnchorWithNewId = normalizeTravel({ locations: [{
        ...validLocations()[0], sourceMemoryIds: ['M001', 'M002'], sourceMemoryAnchor: '河边散步',
    }] }, memoryBank, { allowPartial: true, sourceMemoryIds: ['M002'] });
    assert.deepEqual(oldAnchorWithNewId.locations, []);
});

test('r44 travel is an independent portal with nearby dialogue and CSS text postcards', async () => {
    const prompt = travelPrompt({ name1: '阿澄', name2: '林砚' }, memoryBank);
    assert.match(prompt, /独立地图，不是手机 App/);
    assert.match(prompt, /禁止输出坐标、颜色值、CSS、HTML、JavaScript、URL/);
    assert.match(prompt, /sceneTheme/);
    assert.match(prompt, /city\/coast\/mountain\/forest\/campus\/historic\/fantasy\/scifi\/neutral/);
    assert.match(prompt, /near 3～5 个，far 2～4 个/);
    const [constants, snapshots, overlay, view, styles] = await Promise.all([
        readFile(new URL('src/core/constants.js', root), 'utf8'),
        readFile(new URL('src/archive/snapshots.js', root), 'utf8'),
        readFile(new URL('src/ui/overlay.js', root), 'utf8'),
        readFile(new URL('src/ui/travelView.js', root), 'utf8'),
        readFile(new URL('src/ui/styles.js', root), 'utf8'),
    ]);
    assert.match(constants, /TRAVEL: 'travel'/);
    assert.match(snapshots, /他的出行路线/);
    assert.match(overlay, /ui_travelView\.renderTravel/);
    assert.match(view, /data-rmt-travel-location/);
    assert.match(view, /rmt-travel-postcard/);
    assert.match(view, /core_text\.esc\(card\.body\)/);
    assert.match(view, /activeArchiveSnapshot\.memory\?\.userName/);
    assert.match(view, /activeArchiveSnapshot\s*\n\s*\? runtimeState\.activeArchiveSnapshot\.memory\?\.userName/);
    assert.match(view, /modes_travel\.safeTravelLocationKind\(item\.kind\)/);
    assert.doesNotMatch(view, /rmt-travel-marker \$\{item\.kind\}/);
    assert.match(styles, /\.rmt-travel-map\{/);
    assert.match(styles, /\.rmt-travel-postcard\{/);
});
