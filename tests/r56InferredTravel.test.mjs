import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTravel } from '../src/modes/travel.js';

const bank = { archiveName: 'a', archiveRevision: 'r', characterName: '常拾青', userName: '纪时卿',
    memories: [{ id: 'M001', title: '摄影棚的一瞥', summary: '在摄影棚里。', anchors: ['摄影棚'] }] };
const acts = n => Array.from({ length: n }, (_, i) => ({ time: ['today', 'tonight', 'now'][i % 3], emotion: 'care',
    wish: 'peace', gesture: 'stay', tone: 'quiet', register: 'plain', image: 'light', intensity: 'low', cadence: 'single' }));
const near = (id, name, extra = {}) => ({ id, kind: 'near', name, region: '旧城', distanceToken: 'walk',
    summary: '他下班常绕过去的地方。', basis: '推演', sourceMemoryIds: [], sourceMemoryAnchor: '',
    sourceSettingEvidence: '', dialogueActs: acts(3), ...extra });
const far = (id, name, extra = {}) => ({ id, kind: 'far', name, region: '北方', distanceToken: 'journey',
    summary: '工作可能去的远处。', basis: '推演', sourceMemoryIds: [], sourceMemoryAnchor: '', sourceSettingEvidence: '',
    sceneTheme: 'coast', keepsake: { kind: 'letter', tone: 'ocean', presentExpressions: acts(3), evidenceExcerpt: '' }, ...extra });
// A card with no place name anywhere: the case that used to produce zero locations.
const thinCard = { controlledEvidence: '常拾青是个摄影师。' };

test('r56 a card with no place names can still produce an inferred route', () => {
    const session = normalizeTravel({ title: 'x', mapTheme: 'city', routeSummary: 'r',
        locations: [near('N1', '旧河堤'), near('N2', '夜间书店'), far('F1', '北方海港'), far('F2', '山间终点')] }, bank, thinCard);
    assert.equal(session.locations.length, 4);
    assert.ok(session.locations.every(l => l.basis === '推演'));
    // The model's own wording survives instead of collapsing to "远方坐标 1".
    assert.deepEqual(session.locations.map(l => l.name), ['旧河堤', '夜间书店', '北方海港', '山间终点']);
});

test('r56 an inferred stop may never claim a shared past with the user', () => {
    for (const claim of ['我们一起去过的河堤。', '你陪我走过的那条路。', '上次你带我去的地方。']) {
        const session = normalizeTravel({ title: 'x', mapTheme: 'city', routeSummary: 'r',
            locations: [near('N1', '旧河堤', { summary: claim }), near('N2', '夜间书店'), near('N3', '旧车站'),
                far('F1', '北方海港'), far('F2', '山间终点')] }, bank, thinCard);
        assert.ok(!session.locations.some(l => l.name === '旧河堤'), `未拦截：${claim}`);
        assert.equal(session.locations.length, 4, '其余站点应保留');
    }
});

test('r56 evidenced bases keep their original strictness', () => {
    // basis=设定 without a verbatim quote is still dropped ...
    const weak = normalizeTravel({ title: 'x', mapTheme: 'city', routeSummary: 'r',
        locations: [near('N1', '旧河堤', { basis: '设定', sourceSettingEvidence: '这句话不在角色卡里' }),
            near('N2', '夜间书店'), near('N3', '旧车站'), far('F1', '北方海港'), far('F2', '山间终点')] }, bank, thinCard);
    assert.ok(!weak.locations.some(l => l.name === '旧河堤'));
    // ... and basis=记忆 without a real anchor is still dropped.
    const fake = normalizeTravel({ title: 'x', mapTheme: 'city', routeSummary: 'r',
        locations: [near('N1', '旧河堤', { basis: '记忆', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '从未出现过的锚点' }),
            near('N2', '夜间书店'), near('N3', '旧车站'), far('F1', '北方海港'), far('F2', '山间终点')] }, bank, thinCard);
    assert.ok(!fake.locations.some(l => l.name === '旧河堤'));
});

test('r56 incremental passes still admit memory-backed stops only', () => {
    const session = normalizeTravel({ title: 'x', mapTheme: 'city', routeSummary: 'r',
        locations: [near('N1', '旧河堤'), far('F1', '北方海港')] }, bank, { ...thinCard, allowPartial: true, sourceMemoryIds: ['M001'] });
    assert.equal(session.locations.length, 0, '增量刷新不得引入推演站');
});
