import test from 'node:test';
import assert from 'node:assert/strict';
import * as contract from '../src/core/timeStoriesContract.js';
import * as stories from '../src/modes/timeStories.js';
import * as view from '../src/ui/timeStoriesView.js';

const memory = { chatId: 'journey-chat', archiveRevision: 'journey-v1', characterName: '林舟', userName: '小月', memories: [] };
const rawStory = traveler => ({ title: '灯还亮着', opening: '晚饭时，时间忽然带走了一个人。', closing: '门开了，灯仍亮着。', traveler,
    encounters: [{ title: '无法约定的归期', charTime: '离开后的傍晚', userTime: '一年后的雨夜', charOrder: 1, userOrder: 1,
        text: '没有人能决定离开的时刻。他们只能再次握住彼此的手。', waiting: '留下的人照旧做饭、生活，把灯留到很晚。' }] });
const episode = raw => stories.normalizeTimeStoryEpisode('timeJourney', raw, memory, { profile: { worldStyle: 'historical', technology: 'low' } });
const session = raw => ({ ...stories.emptyTimeStories('timeJourney', memory), episodes: [episode(raw)],
    selectedId: 'TS01', selectedEntryId: 'S01', view: 'story' });

test('one complete departure and return scene works without a forced reverse encounter order', () => {
    const result = episode(rawStory('char'));
    assert.equal(result.encounters.length, 1);
    assert.equal(result.encounters[0].waiting, rawStory('char').encounters[0].waiting);
    assert.equal(result.presentation, 'classical');
    const sequential = rawStory('char'); sequential.encounters.push({ ...sequential.encounters[0], charOrder: 2, userOrder: 2 });
    assert.equal(episode(sequential).encounters.length, 2);
    assert.throws(() => episode({ ...rawStory('char'), encounters: [] }), { code: 'RMT_TIME_STORY_STRUCTURE' });
});

test('either partner can travel and the reader names the correct partner living through the absence', () => {
    for (const traveler of ['char', 'user']) {
        const story = session(rawStory(traveler)); const html = view.timeStoriesHtml(story);
        const travelerName = traveler === 'char' ? memory.characterName : memory.userName;
        const waitingName = traveler === 'char' ? memory.userName : memory.characterName;
        assert.match(html, new RegExp(`被时间带走的人</small><b>${travelerName}`));
        assert.match(html, new RegExp(`等待归来的人</small><b>${waitingName}`));
        assert.match(html, new RegExp(`${waitingName} · 等待中的日子`));
        assert.ok(html.indexOf('rmt-time-encounter') < html.indexOf('<details class="rmt-time-timeline-details">'), 'story and waiting are primary; timelines are secondary');
        assert.match(html, /时空旅行者的妻子/);
        assert.doesNotMatch(html, /错时相逢|错位相逢/);
    }
});

test('r79 episodes without waiting text reopen with their saved ending and viewpoint intact', () => {
    const old = session(rawStory('user')); delete old.episodes[0].encounters[0].waiting;
    old.title = '错时相逢'; old.reading = true; old.tab = 'user';
    const before = JSON.stringify(old); const loaded = stories.normalizeTimeStories(old, memory);
    assert.equal(loaded.version, 1); assert.equal(loaded.kind, 'timeJourney');
    assert.equal(loaded.selectedId, 'TS01'); assert.equal(loaded.selectedEntryId, 'S01');
    assert.equal(loaded.reading, true); assert.equal(loaded.tab, 'user');
    assert.equal(JSON.stringify(old), before);
    const html = view.timeStoriesHtml(loaded);
    assert.match(html, /门开了，灯仍亮着/);
    assert.doesNotMatch(html, /等待中的日子/);
});

test('optional waiting prose is bounded inert text and cannot introduce executable markup', () => {
    const raw = rawStory('user'); raw.encounters[0].waiting = '<img src=x onerror=alert(1)>夜深了。';
    const result = session(raw); const restored = stories.normalizeTimeStories(JSON.parse(JSON.stringify(result)), memory);
    assert.equal(restored.episodes[0].encounters[0].waiting, raw.encounters[0].waiting);
    const html = view.timeStoriesHtml(restored);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/); assert.doesNotMatch(html, /<img/);
    raw.encounters[0].waiting = '等'.repeat(contract.TIME_STORY_LIMITS.prose + 1);
    assert.throws(() => episode(raw), { code: 'RMT_TIME_STORY_STRUCTURE' });
});

test('journey prompt centers uncontrolled absence, waiting and love without imposing gender, marriage or inverted scene counts', () => {
    const prompt = stories.timeStoryPrompt('timeJourney', { name1: memory.userName, name2: memory.characterName }, memory, null,
        { worldStyle: 'historical', technology: 'low' });
    assert.match(prompt, /无法决定何时离开、去往何时或何时回来/);
    assert.match(prompt, /缺席中的日常/); assert.match(prompt, /等待/); assert.match(prompt, /重新相爱/);
    assert.match(prompt, /traveler 可为 char 或 user/); assert.match(prompt, /不要求谁必须为女性或已经结婚/);
    assert.match(prompt, /日常生活、用语与器物适配原世界/);
    assert.doesNotMatch(prompt, /至少两次相遇|先后颠倒/);
    assert.match(prompt, /不凑数量或刻意制造逆序/);
    assert.ok(prompt.length < 6000);
});
