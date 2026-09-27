import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function load(file, overrides) {
    const url = new URL(file, import.meta.url);
    const module = new vm.SourceTextModule(await readFile(url, 'utf8'), { identifier: url.href });
    await module.link(async spec => {
        const values = { ...await import(new URL(spec, url)), ...overrides[spec] };
        return new vm.SyntheticModule(Object.keys(values), function () {
            for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        });
    });
    await module.evaluate();
    return module.namespace;
}

async function fixture({ writeOk = true, switchDuringSave = false } = {}) {
    const events = [], context = {}, bank = { archiveRevision: 'r1' };
    const origin = { characterKey: 'card', characterId: '0', characterAvatar: 'card.png', chatId: 'chat', archiveRevision: 'r1' };
    const journal = { draftId: 'selected', pageId: 'inbox', identity: { ...origin, mode: 'inbox' } };
    let current = true;
    const state = { busy: true, activeArchiveSnapshot: null, deferredChatCommits: new Map() };
    const owners = [
        { id: 'target', mode: 'inbox', pageId: 'inbox', pageIds: [], draftId: 'selected', origin: {} },
        { id: 'not-bound', mode: 'inbox', pageId: 'inbox', pageIds: [], origin: {} },
        { id: 'unrelated-mode', mode: 'room', pageId: 'room', pageIds: [], origin: {} },
        { id: 'unrelated-draft', mode: 'inbox', pageId: 'inbox', pageIds: [], origin: { generationRecoveryDraftId: 'another-draft' } },
        { id: 'historical', mode: 'inbox', pageId: 'inbox', pageIds: [], origin: { archiveTargetEntryId: 'old-entry' } },
    ];
    const overrides = {
        '../core/state.js': { state },
        '../core/context.js': { currentCharacterGuard: () => context, getContext: () => context,
            captureTaskOrigin: () => ({ ...origin }), runtimeLifecycleStillCurrent: () => true,
            isCurrentTaskOrigin: () => current },
        '../archive/repository.js': { requireArchive: () => bank },
        '../core/cache.js': {
            loadGenerationRecovery: (_mode, _context, _cache, options) => { assert.equal(options.intent, 'inspect'); return journal; },
            saveGenerationRecovery: async (_context, _bank, _mode, value, _origin, options) => {
                assert.equal(value, null); assert.equal(options.draftId, 'selected'); assert.equal(options.discardDraft, true);
                events.push('write'); if (switchDuringSave) current = false; return writeOk;
            },
        },
        '../core/requestCoordinator.js': {
            queryParticipantGenerationTasks: () => owners,
            cancelParticipantGenerationTasks: async ids => { events.push(['cancel', ids]); await Promise.resolve(); events.push('settled'); },
        },
        '../ui/overlay.js': { confirmExplicitAction: () => true, showChooser: () => events.push('render') },
    };
    globalThis.toastr = { success: () => events.push('success') };
    return { api: await load('../src/generation/generationSavedActions.js', overrides), events };
}

test('discard stops only the selected page owner and waits for cleanup; unrelated busy work does not block', async () => {
    const f = await fixture();
    assert.equal(await f.api.discardSavedGeneration('inbox', { draftId: 'selected' }), true);
    assert.deepEqual(f.events, [['cancel', ['target']], 'settled', 'write', 'render', 'success']);
});

test('failed durable discard reports storage failure without claiming success', async () => {
    const f = await fixture({ writeOk: false });
    await assert.rejects(f.api.discardSavedGeneration('inbox', { draftId: 'selected' }), { code: 'RMT_RECOVERY_DISCARD_STORAGE' });
    assert.deepEqual(f.events, [['cancel', ['target']], 'settled', 'write']);
});

test('a completed discard does not navigate another chat opened during persistence', async () => {
    const f = await fixture({ switchDuringSave: true });
    await f.api.discardSavedGeneration('inbox', { draftId: 'selected' });
    assert.equal(f.events.includes('render'), false);
});
