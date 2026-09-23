import test from 'node:test';
import assert from 'node:assert/strict';
import * as context from '../src/core/context.js';
import { state } from '../src/core/state.js';

function host({ id = 0, chatId = 'chat-a', avatar = 'ensemble.png', name = '多人故事卡' } = {}) {
    const characters = [];
    characters[id] = { name, avatar, description: '受控人物甲、乙。', data: { name, description: '受控人物甲、乙。' } };
    return { characterId: id, characters, name1: '玩家', name2: name, chatId,
        getCurrentChatId: () => chatId, chatMetadata: {}, extensionSettings: {}, saveMetadataDebounced() {} };
}

test('same card and same chat accept original task; another chat cannot inherit it', () => {
    const first = host(); const origin = context.captureTaskOrigin(first, 'revision-a');
    assert.equal(context.isCurrentTaskRunOrigin(origin, first), true);
    assert.equal(context.isCurrentTaskRunOrigin(origin, host({ chatId: 'chat-b' })), false);
});
test('another card slot cannot inherit task even when avatar and display title are identical', () => {
    const origin = context.captureTaskOrigin(host(), 'revision-a');
    assert.equal(context.isCurrentTaskRunOrigin(origin, host({ id: 1 })), false);
});
test('changed avatar remains a different origin', () => {
    const origin = context.captureTaskOrigin(host(), 'revision-a');
    assert.equal(context.isCurrentTaskRunOrigin(origin, host({ avatar: 'different.png' })), false);
});
test('in-place display title rename permits active same-card work but does not rebind stale views', () => {
    const origin = context.captureTaskOrigin(host(), 'revision-a');
    const renamed = host({ name: '新的多人故事标题' });
    assert.equal(context.isCurrentTaskRunOrigin(origin, renamed), true);
    assert.equal(context.isCurrentTaskOrigin(origin, renamed), false);
});
test('destroyed runtime cannot commit a late task in the next lifetime', () => {
    const old = state.runtimeLifecycleEpoch;
    const current = host(); const origin = context.captureTaskOrigin(current, 'revision-a');
    try {
        state.runtimeLifecycleEpoch += 1;
        assert.equal(context.isCurrentTaskRunOrigin(origin, current), false);
    } finally { state.runtimeLifecycleEpoch = old; }
});
