import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { generationRecoveryDigest, legacyRecoveryPromptPermitted } from '../src/generation/recovery.js';
import { resolveRequestTemperature } from '../src/generation/requestTemperature.js';

test('resolveRequestTemperature follows the user setting and only lowers judgement steps', () => {
    assert.equal(resolveRequestTemperature({}, { temperature: 0.9 }), 0.9);
    assert.equal(resolveRequestTemperature({ temperatureCeiling: 0.25 }, { temperature: 1.2 }), 0.25);
    assert.equal(resolveRequestTemperature({ temperatureCeiling: 0.25 }, { temperature: 0.1 }), 0.1);
    assert.equal(resolveRequestTemperature({}, { temperature: 'hot' }), 0.9);
});

test('creative pages no longer hardcode a temperature literal', async () => {
    const files = [
        'src/modes/heart.js',
        'src/modes/advEvent.js',
        'src/modes/butterfly.js',
        'src/modes/pastLives.js',
        'src/modes/timeStories.js',
        'src/modes/room.js',
        'src/modes/items.js',
        'src/modes/travel.js',
        'src/generation/contentRegeneration.js',
    ];
    for (const file of files) {
        const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
        assert.equal(/temperature:\s*\d/.test(source), false, `${file} 仍写死了 temperature`);
    }
    const regen = await readFile(new URL('../src/generation/contentRegeneration.js', import.meta.url), 'utf8');
    const taskOptions = regen.slice(regen.indexOf('function taskOptions'), regen.indexOf('const CONTENT_TARGETS'));
    assert.equal(taskOptions.includes('temperature:'), false);
    assert.equal(taskOptions.includes('temperature,'), false);
});

test('legacy continuation accepts the old hardcoded temperature and rejects a missing list', async () => {
    const prompt = '旧 Prompt';
    const requestHash = await generationRecoveryDigest({
        prompt, contextEnvelope: '', temperature: 0.65, model: '', maxTokens: null, mode: '', phrasePolicy: true,
    });
    const previous = { requestHash };
    const withOld = { recoveryCompatibility: { legacyPrompts: [prompt], legacyTemperatures: [0.65] } };
    const withoutOld = { recoveryCompatibility: { legacyPrompts: [prompt] } };
    assert.equal(await legacyRecoveryPromptPermitted(previous, withOld), true);
    assert.equal(await legacyRecoveryPromptPermitted(previous, withoutOld), false);
});
