import test from 'node:test';
import assert from 'node:assert/strict';

import { state as runtimeState } from '../src/core/state.js';
import { captureTaskOrigin, deferredCommitOriginMatchesContext, isCurrentTaskOrigin } from '../src/core/context.js';
import {
    currentChatBlockingTasks,
    hasUnloadRisk,
    queueDeferredCommit,
} from '../src/core/requestCoordinator.js';
import {
    createDurableDeferredCommitMap,
    DEFERRED_COMMIT_STORE_MAX_BYTES,
    DEFERRED_COMMIT_STORE_MAX_ITEMS,
} from '../src/core/deferredCommitStore.js';

function contextFor(chatId) {
    return {
        chat: [], chatMetadata: {}, characterId: 0, groupId: null,
        name1: 'User', name2: 'Char', characters: [{ name: 'Char', avatar: 'char.png' }],
        getCurrentChatId: () => chatId,
    };
}

function installContext(chatId = 'A') {
    const context = contextFor(chatId);
    globalThis.SillyTavern = { getContext: () => context };
    return context;
}

function memoryStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        getItem: key => data.has(key) ? data.get(key) : null,
        setItem: (key, value) => data.set(key, String(value)),
        removeItem: key => data.delete(key),
        snapshot: () => Object.fromEntries(data),
    };
}

function resetRuntime() {
    runtimeState.busy = false;
    runtimeState.activeTaskOrigin = null;
    runtimeState.activeGenerationTasks.clear();
    runtimeState.activeCgImageTasks.clear();
    runtimeState.roomLifeRefreshPromise = null;
    runtimeState.roomLifeRefreshOrigin = null;
    runtimeState.deferredChatCommits.clear();
}

test('ordinary, CG, and room-life blockers are all restricted to their captured chat', () => {
    resetRuntime();
    const a = installContext('A');
    const origin = captureTaskOrigin(a, 'rev-A');
    runtimeState.activeGenerationTasks.set('ordinary', { origin, label: '普通生成' });
    runtimeState.activeCgImageTasks.set('cg', { origin, label: 'CG 绘制' });
    runtimeState.roomLifeRefreshPromise = Promise.resolve();
    runtimeState.roomLifeRefreshOrigin = origin;

    assert.deepEqual(currentChatBlockingTasks(a), ['普通生成', 'CG 绘制', '今日生活生成']);
    assert.deepEqual(currentChatBlockingTasks(contextFor('B')), []);
    assert.equal(hasUnloadRisk(), true, 'foreign-chat running work still makes a full-page refresh unsafe');
    resetRuntime();
});

test('deferred commits survive a fresh map instance and redact credential-shaped fields', () => {
    const storage = memoryStorage();
    const first = createDurableDeferredCommitMap({ storage });
    first.set('character:char.png|A', [{
        kind: 'sessions', queuedAt: Date.now(),
        origin: { characterKey: 'character:char.png', chatId: 'A', archiveRevision: 'rev-A', lifecycleEpoch: 0 },
        sessions: { album: { kind: 'album', title: 'kept', apiKey: 'must-not-persist', authorization: 'secret' } },
    }]);
    assert.equal(first.persistenceStatus().healthy, true);

    const raw = Object.values(storage.snapshot()).join('');
    assert.doesNotMatch(raw, /must-not-persist|secret/);
    const restored = createDurableDeferredCommitMap({ storage });
    assert.equal(restored.get('character:char.png|A')?.[0]?.sessions?.album?.title, 'kept');
    assert.equal(restored.get('character:char.png|A')?.[0]?.sessions?.album?.apiKey, undefined);
});

test('deferred origin survives ordinary card edits only for one unambiguous avatar', () => {
    const context = contextFor('A');
    context.characters[0].data = { name: 'Char', avatar: 'char.png', description: 'v1' };
    const origin = captureTaskOrigin(context, 'rev-A');
    context.characters[0].data.description = 'v2';
    assert.equal(deferredCommitOriginMatchesContext(origin, context), true);
    context.name2 = 'Renamed';
    context.characters[0].name = 'Renamed';
    context.characters[0].data.name = 'Renamed';
    assert.equal(deferredCommitOriginMatchesContext(origin, context), true);
    context.characters.push({ name: 'Duplicate', avatar: 'char.png', data: { name: 'Duplicate', avatar: 'char.png' } });
    assert.equal(deferredCommitOriginMatchesContext(origin, context), true, 'the captured character slot remains authoritative');
    context.characterId = 1;
    assert.equal(deferredCommitOriginMatchesContext(origin, context), false, 'switching to the duplicate slot must fail closed');
    context.characterId = 0;
    const legacyOrigin = { characterKey: origin.characterKey.replace(/\u001fcharacter:\d+$/, ''), chatId: 'A' };
    assert.equal(deferredCommitOriginMatchesContext(legacyOrigin, context), false, 'legacy rows fail closed after a card edit when no saved avatar exists');
});

test('a completely cloned character slot never inherits another slot task origin', () => {
    resetRuntime();
    const context = contextFor('A');
    context.characters = [
        { name: 'Char', avatar: 'char.png', data: { name: 'Char', avatar: 'char.png', description: 'identical' } },
        { name: 'Char', avatar: 'char.png', data: { name: 'Char', avatar: 'char.png', description: 'identical' } },
    ];
    context.characterId = 0;
    const origin = captureTaskOrigin(context, 'rev-A');
    runtimeState.activeGenerationTasks.set('clone-origin', { origin, label: '原角色生成' });

    context.characterId = 1;
    assert.equal(isCurrentTaskOrigin(origin, context), false);
    assert.equal(deferredCommitOriginMatchesContext(origin, context), false);
    assert.deepEqual(currentChatBlockingTasks(context), []);
    resetRuntime();
});

test('durable queue exposes bounded capacity and reports storage failure instead of claiming safety', () => {
    assert.ok(DEFERRED_COMMIT_STORE_MAX_ITEMS > 0);
    assert.ok(DEFERRED_COMMIT_STORE_MAX_BYTES > 0);
    const storage = memoryStorage();
    storage.setItem = () => { throw new Error('quota denied'); };
    const errors = [];
    const map = createDurableDeferredCommitMap({ storage, onError: error => errors.push(error.message) });
    map.set('character:char.png|A', [{ kind: 'sessions', queuedAt: 1, origin: { characterKey: 'character:char.png', chatId: 'A' }, sessions: {} }]);
    assert.equal(map.persistenceStatus().healthy, false);
    assert.match(errors.join('\n'), /quota denied/i);
});

test('a newer quota failure preserves the last successfully persisted recovery snapshot', () => {
    const storage = memoryStorage();
    const map = createDurableDeferredCommitMap({ storage });
    const origin = { characterKey: 'character:char.png', chatId: 'A' };
    const now = Date.now();
    map.set('character:char.png|A', [{ kind: 'sessions', queuedAt: now, origin, sessions: { album: { title: 'older-safe' } } }]);
    const safeSnapshot = Object.values(storage.snapshot()).join('');
    storage.setItem = () => { throw new Error('quota denied'); };
    map.set('character:char.png|B', [{ kind: 'sessions', queuedAt: now + 1, origin: { ...origin, chatId: 'B' }, sessions: { album: { title: 'new-memory-only' } } }]);
    assert.equal(Object.values(storage.snapshot()).join(''), safeSnapshot);
    assert.equal(createDurableDeferredCommitMap({ storage }).get('character:char.png|A')?.[0]?.sessions?.album?.title, 'older-safe');
});

test('a pending commit is included in full-page unload risk even when no request is running', () => {
    resetRuntime();
    const a = installContext('A');
    const origin = captureTaskOrigin(a, 'rev-A');
    queueDeferredCommit(origin, { kind: 'sessions', sessions: { album: { kind: 'album', title: 'pending' } } });
    assert.equal(runtimeState.deferredChatCommits.size, 1);
    assert.equal(hasUnloadRisk(), true);
    resetRuntime();
});

test('full-page unload guard sees a task from another chat', async () => {
    resetRuntime();
    const a = installContext('A');
    const origin = captureTaskOrigin(a, 'rev-A');
    runtimeState.activeGenerationTasks.set('ordinary', { origin, label: '普通生成' });
    installContext('B');
    let unloadHandler = null;
    globalThis.document = {
        addEventListener() {}, removeEventListener() {},
    };
    globalThis.addEventListener = (name, handler) => { if (name === 'beforeunload') unloadHandler = handler; };
    globalThis.removeEventListener = () => {};
    const portal = await import('../src/ui/archivePortal.js');
    portal.bindGenerationNavigationGuards();
    let prevented = false;
    const event = { preventDefault: () => { prevented = true; }, returnValue: undefined };
    unloadHandler(event);
    assert.equal(prevented, true);
    assert.equal(event.returnValue, '');
    globalThis.__heartbeatMemoriesNavigationGuardCleanup?.();
    resetRuntime();
});

test('an explicit host chat close fails open when native confirmation is unavailable', async () => {
    resetRuntime();
    const context = installContext('A');
    const origin = captureTaskOrigin(context, 'rev-A');
    runtimeState.activeGenerationTasks.set('ordinary', { origin, label: '普通生成' });

    const previousDocument = globalThis.document;
    const previousAddEventListener = globalThis.addEventListener;
    const previousRemoveEventListener = globalThis.removeEventListener;
    const previousConfirm = globalThis.confirm;
    const previousToastr = globalThis.toastr;
    let clickHandler = null;
    globalThis.document = {
        addEventListener(name, handler) { if (name === 'click') clickHandler = handler; },
        removeEventListener() {},
    };
    globalThis.addEventListener = () => {};
    globalThis.removeEventListener = () => {};
    delete globalThis.confirm;
    const warnings = [];
    globalThis.toastr = { warning: message => warnings.push(message), info() {}, error() {}, success() {} };

    try {
        const portal = await import('../src/ui/archivePortal.js');
        portal.bindGenerationNavigationGuards();
        assert.equal(typeof clickHandler, 'function');
        const hostClose = {};
        let prevented = false;
        let stopped = false;
        clickHandler({
            target: { closest: selector => selector.includes('#option_close_chat') ? hostClose : null },
            preventDefault: () => { prevented = true; },
            stopPropagation: () => { stopped = true; },
            stopImmediatePropagation: () => { stopped = true; },
        });
        assert.equal(prevented, false, 'an explicit host close must remain usable without native confirm');
        assert.equal(stopped, false, 'the host must receive its original close event');
        assert.match(warnings.join('\n'), /无法显示系统确认框/);
    } finally {
        globalThis.__heartbeatMemoriesNavigationGuardCleanup?.();
        delete globalThis.__heartbeatMemoriesNavigationGuardCleanup;
        globalThis.document = previousDocument;
        globalThis.addEventListener = previousAddEventListener;
        globalThis.removeEventListener = previousRemoveEventListener;
        if (previousConfirm === undefined) delete globalThis.confirm;
        else globalThis.confirm = previousConfirm;
        globalThis.toastr = previousToastr;
        resetRuntime();
    }
});

test('a CG result completed in another chat enters the durable session queue', async () => {
    resetRuntime();
    const a = installContext('A');
    const origin = captureTaskOrigin(a, 'rev-A');
    installContext('B');
    const storage = memoryStorage();
    const previousMap = runtimeState.deferredChatCommits;
    runtimeState.deferredChatCommits = createDurableDeferredCommitMap({ storage });
    const images = await import('../src/generation/imageGeneration.js');
    const session = { kind: 'album', chatId: 'A', archiveRevision: 'rev-A', entries: [{ id: 'E1', cgImage: { url: '/user/images/e1.png' } }] };
    const result = images.deferCgSessionIfOriginChanged(origin, 'album', session);
    assert.deepEqual(result, { deferred: true, durable: true });
    assert.equal(runtimeState.deferredChatCommits.get(`${origin.characterKey}|A`)?.[0]?.sessions?.album?.entries?.[0]?.cgImage?.url, '/user/images/e1.png');
    assert.match(Object.values(storage.snapshot()).join(''), /user\/images\/e1\.png/);
    runtimeState.deferredChatCommits.clear();
    runtimeState.deferredChatCommits = previousMap;
});

test('explicit close fallback does not weaken ordinary destructive confirmations', async () => {
    const overlay = await import('../src/ui/overlay.js');
    const previousConfirm = globalThis.confirm;
    delete globalThis.confirm;
    const notices = [];
    globalThis.toastr = { warning: message => notices.push(message), info() {}, error() {}, success() {} };
    assert.equal(overlay.confirmExplicitAction('删除？', '普通破坏性确认仍须关闭失败。', { destructive: true }), false);
    assert.equal(overlay.confirmExplicitAction('关闭？', '用户已经显式点击关闭。', { unavailableFallback: true }), true);
    assert.match(notices.join('\n'), /已按你的关闭操作退出档案室/);
    if (previousConfirm) globalThis.confirm = previousConfirm;
});
