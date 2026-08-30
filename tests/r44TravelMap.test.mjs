import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    normalizeTravel,
    safeTravelLocationKind,
    travelMarkerPosition,
    travelMarkerPositions,
    travelPrompt,
} from '../src/modes/travel.js';

const root = new URL('../', import.meta.url);
const memoryBank = {
    archiveName: '路线测试档案', archiveRevision: 'rev-r44-travel', characterName: '林砚', userName: '阿澄',
    memories: [
        { id: 'M001', date: '2026/08/01', title: '河边散步', summary: '两个人在河边散步后一起回家。', anchors: ['河边散步'] },
        { id: 'M002', date: '2026/08/03', title: '车站送别', summary: '他在车站送阿澄离开。', anchors: ['车站送别'] },
    ],
};

function validLocations() {
    return [
        { id: 'N1', kind: 'near', name: '旧河堤', region: '城南', distanceLabel: '步行十分钟', summary: '他偶尔绕路经过的河岸。', basis: '记忆', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '河边散步', dialogueLines: ['风比那天小。', '我记得我们从这里慢慢走回去。', '今天也陪我走一段吧。'], x: 'url(evil)', css: '<style>' },
        { id: 'N2', kind: 'near', name: '夜间书店', region: '旧街', distanceLabel: '两站路', summary: '下班后会停留的安静去处。', basis: '设定', dialogueLines: ['这里关门很晚。', '我通常站在最里面那排。', '你想看的书，可以告诉我。'] },
        { id: 'F1', kind: 'far', name: '北方海港', region: '北岸', distanceLabel: '夜车一程', summary: '工作路线可能抵达的远方港口。', basis: '设定', postcard: { title: '潮声寄来', postmark: 'NORTH', greeting: '阿澄：', body: '海风把纸页吹得一直翻动。我站在码头边想，如果你也在，这段等待大概不会显得这么长。等我回去，再把没有写进这张卡片里的细节慢慢告诉你。灯塔刚刚又亮了一次，潮水正在退，我却比刚到这里时更清楚自己想回到哪里。', closing: '林砚', stampLabel: '潮', tone: 'ocean' } },
        { id: 'F2', kind: 'far', name: '山间终点', region: '西岭', distanceLabel: '很远', summary: '地图尽头的一处高地。', basis: '设定', postcard: { title: '山雾之后', postmark: 'WEST', greeting: '写给你：', body: '雾散开时能看到很远的灯。我本来只想确认路线，却在那一刻认真地想起你。这里安静得能听见自己的心跳，所以藏不住任何想念。等云再低一点，我会把这张卡片收好寄出；希望它先替我抵达你身边，也替我说出一路上反复想起却没能当面说的话。', closing: '等我回来', stampLabel: '岭', tone: 'forest' } },
    ];
}

test('r44 travel normalizer keeps safe text, real evidence and code-owned geometry', () => {
    const session = normalizeTravel({ title: '他的出行路线', mapTheme: 'javascript:alert(1)', routeSummary: '他的日常路线。', locations: validLocations() }, memoryBank);
    assert.equal(session.kind, 'travel');
    assert.equal(session.locations.length, 4);
    assert.equal(session.locations[0].sourceMemoryAnchor, '河边散步');
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

test('r44 travel rejects a memory stop without matching evidence and requires both map ranges', () => {
    const bad = validLocations();
    bad[0] = { ...bad[0], sourceMemoryIds: ['M404'], sourceMemoryAnchor: '不存在' };
    assert.throws(() => normalizeTravel({ locations: bad }, memoryBank), /地点不足/);
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
