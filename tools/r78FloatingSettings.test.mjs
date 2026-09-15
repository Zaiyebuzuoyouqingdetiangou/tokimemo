import test from 'node:test';
import assert from 'node:assert/strict';
import * as settings from '../src/core/settings.js';
import * as constants from '../src/core/constants.js';
import { state } from '../src/core/state.js';

test('avatar preferences survive a settings reload without changing API identity or aborting generation', t => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'SillyTavern');
    const ctx = { extensionSettings: {}, saveSettingsDebounced() {} };
    globalThis.SillyTavern = { getContext: () => ctx };
    const controller = new AbortController(), epoch = state.apiConfigurationEpoch;
    state.activeGenerationTasks.set('floating-settings-test', { controller });
    t.after(() => {
        state.activeGenerationTasks.delete('floating-settings-test');
        previous ? Object.defineProperty(globalThis, 'SillyTavern', previous) : delete globalThis.SillyTavern;
    });
    assert.equal(settings.getPluginSettings(ctx).floatingAvatar, 'char');
    settings.updatePluginSettings({ floatingAvatar: 'user', floatingAvatarPosition: { x: 0.123456, y: 0.75 } });
    const reloaded = settings.getPluginSettings({ extensionSettings: JSON.parse(JSON.stringify(ctx.extensionSettings)) });
    assert.equal(reloaded.floatingAvatar, 'user');
    assert.deepEqual(reloaded.floatingAvatarPosition, { x: 0.1235, y: 0.75 });
    assert.equal(state.apiConfigurationEpoch, epoch);
    assert.equal(controller.signal.aborted, false);
    assert.equal(settings.updatePluginSettings({ floatingAvatar: 'off' }).floatingAvatar, 'off');
    const persisted = ctx.extensionSettings[constants.EXTENSION_SETTINGS_KEY];
    assert.equal(Object.hasOwn(persisted, 'avatarImage'), false);
});

test('bad or oversized position values are bounded and invalid avatar choices return to char', () => {
    const ctx = { extensionSettings: { [constants.EXTENSION_SETTINGS_KEY]: {
        floatingAvatar: 'invalid', floatingAvatarPosition: { x: -500, y: 1000000, image: 'discard this' },
    } } };
    const value = settings.getPluginSettings(ctx);
    assert.equal(value.floatingAvatar, 'char');
    assert.deepEqual(value.floatingAvatarPosition, { x: 0, y: 1 });
    assert.equal(settings.normalizeFloatingAvatarPosition({ x: NaN, y: 1 }), null);
    assert.equal(settings.normalizeFloatingAvatarPosition({ x: '0.2', y: 1 }), null);
});
