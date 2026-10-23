import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const gate = () => Function(`${readFileSync(`${root}/src/autoMemory/streamGate.js`, 'utf8').replace(/^export /gm, '')}
return { noteAssistantStream, generationOpen, hostGenerationOpen };`)();

test('a finished stream left on the context is not treated as still writing', () => {
    const g = gate();
    assert.equal(g.hostGenerationOpen({ streamingProcessor: { isFinished: true, isStopped: false } }), false);
    assert.equal(g.hostGenerationOpen({ streamingProcessor: { isFinished: false, isStopped: false } }), true);
});

test('a start without a matching end stops counting as generating once the host is idle for a while', () => {
    const g = gate();
    g.noteAssistantStream(true);
    assert.equal(g.generationOpen({}, 1000), true);
    assert.equal(g.generationOpen({}, 15000), true);
    assert.equal(g.generationOpen({}, 21001), false, 'latch expires after 20s with no host activity');
    g.noteAssistantStream(true);
    assert.equal(g.generationOpen({ generating: true }, 1000), true);
    assert.equal(g.generationOpen({ generating: true }, 60000), true, 'a real long generation keeps it open');
});

test('dry-run starts are ignored by the scheduler', () => {
    const source = readFileSync(`${root}/src/autoMemory/scheduler.js`, 'utf8');
    assert.match(source, /const dryRun = type === types\.GENERATION_STARTED && args\[2\] === true;/);
    assert.match(source, /const starting = !dryRun && /);
});
