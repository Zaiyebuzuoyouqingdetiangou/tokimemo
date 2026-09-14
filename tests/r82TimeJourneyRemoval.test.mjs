import test from 'node:test';
import assert from 'node:assert/strict';
import * as constants from '../src/core/constants.js';
import * as contract from '../src/core/timeStoriesContract.js';
import * as stories from '../src/modes/timeStories.js';
import * as view from '../src/ui/timeStoriesView.js';
import * as cache from '../src/core/cache.js';
import * as snapshots from '../src/archive/snapshots.js';
import * as recoveryView from '../src/ui/recoveryView.js';

const bank = { version: 3, chatId: 'retired-chat', archiveRevision: 'retired-rev',
    characterName: '甲', userName: '乙', memories: [] };
const legacy = { kind: 'timeJourney', version: 1, ...bank, title: '旧篇章',
    episodes: [{ id: 'TS01', title: 'OLD_JOURNEY_SENTINEL', encounters: [{ text: '原有内容' }] }],
    selectedId: 'TS01', view: 'story' };

test('retired journey has no portal or generation registration; neighboring modes stay available', () => {
    assert.equal(Object.values(constants.MODE).includes('timeJourney'), false);
    assert.equal(contract.isTimeStoryMode('timeJourney'), false);
    assert.equal(contract.isTimeStoryMode('timeEcho'), true);
    const portals = snapshots.baseModeAvailability({ cache: {}, chatId: bank.chatId, memoryBank: bank });
    assert.equal(portals.some(item => item.mode === 'timeJourney'), false);
    for (const mode of ['phone', 'butterfly', 'pastLives', 'album']) assert.ok(portals.some(item => item.mode === mode));
    assert.ok(constants.CREATIVE_EXPANSION_MODES.includes('timeEcho'));
    assert.equal(constants.CREATIVE_EXPANSION_MODES.includes('timeJourney'), false);
});

test('retired story is not normalized, rendered, or exposed as an active cached reader', () => {
    const stored = { chatId: bank.chatId, archiveRevision: bank.archiveRevision, timeJourney: structuredClone(legacy) };
    const before = JSON.stringify(stored);
    assert.equal(cache.loadSession('timeJourney', { cache: stored, chatId: bank.chatId, memoryBank: bank }), null);
    assert.equal(stories.readableTimeStoriesSession(legacy, bank), null);
    assert.throws(() => stories.emptyTimeStories('timeJourney', bank), { code: 'RMT_TIME_STORY_STRUCTURE' });
    assert.throws(() => contract.timeStoryReadingState(legacy), { code: 'RMT_TIME_STORY_STRUCTURE' });
    assert.doesNotMatch(view.timeStoriesHtml(legacy), /OLD_JOURNEY_SENTINEL|data-rmt-generate-mode|data-rmt-time-story/);
    assert.equal(JSON.stringify(stored), before, 'removing access must not rewrite the stored payload');
});

test('retired generation rejects before reading context and old recovery has no UI action', async () => {
    const ctx = new Proxy({}, { get() { throw new Error('retired mode must not read host context'); } });
    assert.throws(() => stories.timeStoryPrompt('timeJourney', ctx, bank), { code: 'RMT_TIME_STORY_STRUCTURE' });
    await assert.rejects(stories.generateTimeStoryWithRepair('timeJourney', ctx, bank), { code: 'RMT_TIME_STORY_STRUCTURE' });
    assert.equal(recoveryView.recoveryBannerHtml({ __generationRecoveryV1: { timeJourney: {} } }, bank), '');
    for (const action of ['order', 'encounter', 'prev-scene', 'next-scene', 'ending']) {
        assert.equal(view.handleTimeStoryAction(action, 'S01'), false);
    }
});
