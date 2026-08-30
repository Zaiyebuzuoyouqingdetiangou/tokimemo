import test from 'node:test';
import assert from 'node:assert/strict';

import { state as runtimeState } from '../src/core/state.js';
import { albumPage } from '../src/ui/albumView.js';
import { scheduleChooserRefresh } from '../src/archive/snapshots.js';
import { setArchiveIndex } from '../src/archive/groups.js';
import { createEndingEasterEggRuntime, endingEasterEggTick, renderEnding } from '../src/ui/endingView.js';

test('r44 delayed album navigation cannot mutate another mode, a closed page, or shared memory', () => {
    const saved = { document: globalThis.document, setTimeout: globalThis.setTimeout, mode: runtimeState.activeMode, session: runtimeState.activeSession };
    const pending = [];
    globalThis.document = { querySelector: () => null };
    globalThis.setTimeout = callback => { pending.push(callback); return pending.length; };
    const freshAlbum = () => ({ kind: 'album', entries: [{ id: 'CG1' }, { id: 'CG2' }], category: '全部', pageSize: 1, page: 1, selectedId: 'CG1', sharedMemory: false });
    try {
        runtimeState.activeMode = 'album';
        runtimeState.activeSession = freshAlbum();
        albumPage(1);
        const travel = { kind: 'travel', locations: [] };
        runtimeState.activeMode = 'travel';
        runtimeState.activeSession = travel;
        assert.doesNotThrow(() => pending.shift()());
        assert.equal('page' in travel, false);

        runtimeState.activeMode = 'album';
        runtimeState.activeSession = freshAlbum();
        albumPage(1);
        runtimeState.activeSession = null;
        assert.doesNotThrow(() => pending.shift()());

        runtimeState.activeSession = freshAlbum();
        albumPage(1);
        runtimeState.activeSession.sharedMemory = true;
        pending.shift()();
        assert.equal(runtimeState.activeSession.page, 1);
        assert.equal(runtimeState.activeSession.sharedMemory, true);
    } finally {
        globalThis.document = saved.document;
        globalThis.setTimeout = saved.setTimeout;
        runtimeState.activeMode = saved.mode;
        runtimeState.activeSession = saved.session;
    }
});

test('r44 pending chooser refresh does not override a mode or another archive level', () => {
    const saved = { document: globalThis.document, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, mode: runtimeState.activeMode, session: runtimeState.activeSession, level: runtimeState.archiveViewLevel, timer: runtimeState.chooserRefreshTimer };
    const pending = [];
    globalThis.document = { getElementById: () => { throw new Error('stale refresh reached DOM'); } };
    globalThis.setTimeout = callback => { pending.push(callback); return pending.length; };
    globalThis.clearTimeout = () => {};
    runtimeState.chooserRefreshTimer = 0;
    try {
        runtimeState.archiveViewLevel = 'library';
        scheduleChooserRefresh(0);
        assert.equal(pending.length, 0);

        runtimeState.archiveViewLevel = 'chooser';
        runtimeState.activeMode = null;
        runtimeState.activeSession = null;
        scheduleChooserRefresh(0);
        runtimeState.activeMode = 'travel';
        runtimeState.activeSession = { kind: 'travel' };
        assert.doesNotThrow(() => pending.shift()());

        runtimeState.activeMode = null;
        runtimeState.activeSession = null;
        scheduleChooserRefresh(0);
        runtimeState.archiveViewLevel = 'character';
        assert.doesNotThrow(() => pending.shift()());
    } finally {
        globalThis.document = saved.document;
        globalThis.setTimeout = saved.setTimeout;
        globalThis.clearTimeout = saved.clearTimeout;
        runtimeState.activeMode = saved.mode;
        runtimeState.activeSession = saved.session;
        runtimeState.archiveViewLevel = saved.level;
        runtimeState.chooserRefreshTimer = saved.timer;
    }
});

test('r44 archive reclassification invalidates cached identities and updates the active snapshot', () => {
    const savedCache = runtimeState.archiveSnapshotCache;
    const savedSnapshot = runtimeState.activeArchiveSnapshot;
    runtimeState.archiveSnapshotCache = new Map([['old-cache', { archiveGroupId: 'old' }]]);
    runtimeState.activeArchiveSnapshot = { entryId: 'E1', archiveGroupId: 'old' };
    try {
        setArchiveIndex({ extensionSettings: {} }, [{ entryId: 'E1', characterKey: 'role.png', characterName: '角色', chatId: 'chat', archiveGroupId: 'new' }]);
        assert.equal(runtimeState.archiveSnapshotCache.size, 0);
        assert.equal(runtimeState.activeArchiveSnapshot.archiveGroupId, 'new');
    } finally {
        runtimeState.archiveSnapshotCache = savedCache;
        runtimeState.activeArchiveSnapshot = savedSnapshot;
    }
});

test('r44 empty ending routes render a real empty state and a stale easter-egg tick shuts down', () => {
    const saved = { document: globalThis.document, mode: runtimeState.activeMode, session: runtimeState.activeSession, snapshot: runtimeState.activeArchiveSnapshot, egg: runtimeState.endingEasterEggRuntime, timer: runtimeState.endingEasterEggTimer };
    const body = { innerHTML: 'MANAGER_SENTINEL' };
    globalThis.document = { querySelector: selector => selector.includes('.rmt-body') ? body : null };
    runtimeState.activeMode = 'ending';
    runtimeState.activeSession = { kind: 'ending', endings: [], confessionReplays: [], view: 'routes', relationshipState: '相互信任', relationshipSummary: '仍然在延续。' };
    runtimeState.activeArchiveSnapshot = null;
    runtimeState.endingEasterEggRuntime = null;
    runtimeState.endingEasterEggTimer = 0;
    try {
        renderEnding();
        assert.doesNotMatch(body.innerHTML, /MANAGER_SENTINEL/);
        assert.match(body.innerHTML, /当前没有结局路线/);
        assert.match(body.innerHTML, /data-rmt-ending-view="confessions"/);

        runtimeState.endingEasterEggRuntime = createEndingEasterEggRuntime({ id: 'CONF1', confessionText: '我仍然想你。' });
        runtimeState.activeMode = 'travel';
        runtimeState.activeSession = { kind: 'travel' };
        assert.equal(endingEasterEggTick(), false);
        assert.equal(runtimeState.endingEasterEggRuntime, null);
        assert.equal(runtimeState.endingEasterEggTimer, 0);
    } finally {
        globalThis.document = saved.document;
        runtimeState.activeMode = saved.mode;
        runtimeState.activeSession = saved.session;
        runtimeState.activeArchiveSnapshot = saved.snapshot;
        runtimeState.endingEasterEggRuntime = saved.egg;
        runtimeState.endingEasterEggTimer = saved.timer;
    }
});
