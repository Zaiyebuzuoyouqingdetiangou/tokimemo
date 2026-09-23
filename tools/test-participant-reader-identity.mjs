import assert from 'node:assert/strict';
import test from 'node:test';
import { state } from '../src/core/state.js';
import { assertShownPastLivesTarget } from '../src/ui/pastLivesView.js';
import { assertShownTimeStoryTarget as assertUiTimeStoryTarget } from '../src/ui/timeStoriesView.js';
import { assertShownTimeStoryTarget as assertModesTimeStoryTarget } from '../src/modes/timeStoriesView.js';
import { emptyTimeStories } from '../src/modes/timeStories.js';

const memory = {
    chatId: 'reader-chat', archiveRevision: 'reader-rev', characterName: '群像卡', userName: '读者', memories: [],
    participantsV1: { version: 1, cardType: 'multi', revision: 'reader-roster', selectedIds: ['a', 'b'], people: [
        { id: 'a', name: '岚', sourceRefs: [] }, { id: 'b', name: '澄', sourceRefs: [] },
    ] },
};

function withSnapshot(session, run) {
    const previous = { mode: state.activeMode, session: state.activeSession, snapshot: state.activeArchiveSnapshot };
    state.activeMode = session.kind;
    state.activeSession = session;
    state.activeArchiveSnapshot = { chatId: memory.chatId, memory };
    try { return run(); } finally {
        state.activeMode = previous.mode;
        state.activeSession = previous.session;
        state.activeArchiveSnapshot = previous.snapshot;
    }
}

test('participant-labelled Past Lives reader accepts the frozen owners and still rejects another name', () => {
    const session = { kind: 'pastLives', chatId: memory.chatId, archiveRevision: memory.archiveRevision,
        characterName: '岚、澄', userName: memory.userName };
    withSnapshot(session, () => assert.doesNotThrow(() => assertShownPastLivesTarget()));
    withSnapshot({ ...session, characterName: '其他人' }, () => assert.throws(() => assertShownPastLivesTarget()));
});

for (const [label, assertTarget] of [['ui reader', assertUiTimeStoryTarget], ['legacy mode reader', assertModesTimeStoryTarget]]) {
    test(`participant-labelled Time Stories ${label} accepts frozen owners and rejects another name`, () => {
        const session = emptyTimeStories('timeEcho', memory);
        withSnapshot(session, () => assert.doesNotThrow(() => assertTarget()));
        withSnapshot({ ...session, characterName: '其他人' }, () => assert.throws(() => assertTarget()));
    });
}
