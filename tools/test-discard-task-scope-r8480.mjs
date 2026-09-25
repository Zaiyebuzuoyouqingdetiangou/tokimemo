import test from 'node:test';
import assert from 'node:assert/strict';
import * as contextApi from '../src/core/context.js';
import * as coordinator from '../src/core/requestCoordinator.js';

test('explicit discard can find the same card owner after edits without selecting another chat or avatar', async () => {
    const context = { characterId: 0, chatId: 'chat', characters: [{ name: '岚', avatar: 'lan.png', description: 'old' }] };
    const task = coordinator.beginLogicalGenerationTask({ kind: 'archive-import', context, origin: contextApi.captureTaskOrigin(context) });
    try {
        context.characters[0].description = 'new';
        assert.deepEqual(coordinator.queryParticipantGenerationTasks(context), []);
        assert.deepEqual(coordinator.queryParticipantGenerationTasks(context, { stableIdentity: true }).map(row => row.id), [task.id]);
        assert.deepEqual(coordinator.queryParticipantGenerationTasks({ ...context, chatId: 'other' }, { stableIdentity: true }), []);
        context.characters[0].avatar = 'other.png';
        assert.deepEqual(coordinator.queryParticipantGenerationTasks(context, { stableIdentity: true }), []);
    } finally { coordinator.finishLogicalGenerationTask(task); }
});

test('a selected retry owns its draft from preparation through origin rebinding', () => {
    const context = { characterId: 0, chatId: 'chat', characters: [{ name: '岚', avatar: 'lan.png' }] };
    const origin = contextApi.captureTaskOrigin(context);
    const task = coordinator.beginLogicalGenerationTask({ mode: 'inbox', pageId: 'inbox', draftId: 'retry-b', context, origin });
    try {
        assert.equal(coordinator.queryParticipantGenerationTasks(context)[0].draftId, 'retry-b');
        coordinator.bindLogicalGenerationTask(task, { ...origin });
        assert.equal(coordinator.queryParticipantGenerationTasks(context)[0].draftId, 'retry-b');
    } finally { coordinator.finishLogicalGenerationTask(task); }
});
