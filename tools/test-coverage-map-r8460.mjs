import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFloorCoverage, coverageGapSlices, summaryFloorsFromChat } from '../src/archive/coverageRanges.js';

test('coverage map keeps memory above summary, and does not offer a scanned floor as a new gap', () => {
    const runs = buildFloorCoverage({
        totalFloors: 8,
        memories: [{ sourceKind: 'chat', messageStart: 1, messageEnd: 2 }, { sourceKind: 'external', messageStart: 3, messageEnd: 4 }],
        summaryFloors: [2, 5],
        coveredRanges: [{ start: 6, end: 7 }],
    });
    assert.deepEqual(runs, [
        { kind: 'memory', start: 1, end: 2 },
        { kind: 'open', start: 3, end: 4 },
        { kind: 'summary', start: 5, end: 5 },
        { kind: 'scanned', start: 6, end: 7 },
        { kind: 'open', start: 8, end: 8 },
    ]);
    const gaps = coverageGapSlices(runs, 100);
    assert.deepEqual(gaps.map(gap => gap.kind), ['open', 'summary', 'open']);
    assert.equal(gaps.some(gap => gap.start === 6), false);
});

test('a long open run is sliced to one hundred floors without hiding the real end', () => {
    const [gap] = coverageGapSlices(buildFloorCoverage({ totalFloors: 250 }), 100);
    assert.deepEqual(gap, { kind: 'open', start: 1, end: 100, fullEnd: 250 });
});

test('summary floors come only from a saved BaiBai leaf', () => {
    assert.deepEqual(summaryFloorsFromChat([
        { extra: { bbs_leaf: '摘要' } },
        { extra: { other: '不是摘要' } },
        { extra: { bbs_leaf: { text: '对象也算' } } },
        { extra: { bbs_leaf: '   ' } },
    ]), [1, 3]);
});
