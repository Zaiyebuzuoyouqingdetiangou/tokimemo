import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sameEvidence } from '../src/generation/contentRegeneration.js';
import { MODE } from '../src/core/constants.js';
import { state as runtimeState } from '../src/core/state.js';
import { handleOverlayClick } from '../src/ui/overlay.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('r44 targeted CG regeneration scans both-side relationship state before comments', async () => {
    const source = await read('src/generation/contentRegeneration.js');
    const fn = source.slice(source.indexOf('async function regenerateAlbumEntry'), source.indexOf('async function regenerateAdvEvent'));
    const scan = fn.indexOf('albumRelationshipScanPrompt');
    const comments = fn.indexOf('albumCommentsPrompt');
    assert.ok(scan >= 0 && comments > scan);
    assert.match(fn, /normalizeAlbumRelationshipSnapshot/);
    assert.match(fn, /albumCommentsPrompt\([^\n]+relationshipSnapshot\)/);
    assert.match(fn, /relationshipSnapshot, cgImage: null/);
});

test('r44 overlay wires and cleans the fixed local ending module while calendar inputs stay absent', async () => {
    const overlay = await read('src/ui/overlay.js');
    const runtime = await read('src/heartbeatMemories.js');
    for (const action of ['open', 'close', 'pulse', 'reveal', 'toggle', 'stabilize']) {
        assert.match(overlay, new RegExp(`ending-easter-${action}`));
    }
    assert.match(overlay, /closeEndingEasterEgg\(\{ restoreFocus: false \}\)/);
    assert.match(runtime, /stopEndingEasterEggTimer\(\)/);
    assert.doesNotMatch(overlay, /calendar-add-draft|calendar-add-todo|calendar-toggle-todo/);
});

test('r44 room prompt, safe CSS and ending CSS expose the requested surfaces without a face', async () => {
    const prompts = await read('src/generation/prompts.js');
    const styles = await read('src/ui/styles.js');
    assert.match(prompts, /"pets": \[/);
    assert.match(prompts, /CHARACTER_CARD_JSON、WORLD_INFO_TEXT 与档案/);
    assert.match(prompts, /禁止正脸、眼睛、嘴部和写实肖像/);
    assert.match(prompts, /不得把同一个通用房间只改名称、颜色或三件摆设后重复输出/);
    assert.doesNotMatch(styles, /rmt-room-face|--rmt-head-width|--rmt-eye-gap|--rmt-mouth-width/);
    assert.match(styles, /\.rmt-room-pet\{/);
    assert.match(styles, /data-rmt-room-motif="literary"/);
    assert.match(styles, /\.rmt-ending-easter-layer\{/);
    assert.match(styles, /prefers-reduced-motion:reduce/);
});

test('r44 targeted regeneration keeps the exact evidence set', () => {
    const current = { sourceMemoryIds: ['M001', 'M002'], sourceMemoryAnchor: '同一锚点' };
    assert.equal(sameEvidence({ sourceMemoryIds: ['M002', 'M001', 'M001'], sourceMemoryAnchor: '同一锚点' }, current), true);
    assert.equal(sameEvidence({ sourceMemoryIds: ['M001', 'M003'], sourceMemoryAnchor: '同一锚点' }, current), false);
    assert.equal(sameEvidence({ sourceMemoryIds: ['M001'], sourceMemoryAnchor: '同一锚点' }, current), false);
});

test('r44 legacy room completion is explicitly wired and expands pet discovery aliases', async () => {
    const [client, overlay, room] = await Promise.all([read('src/generation/client.js'), read('src/ui/overlay.js'), read('src/modes/room.js')]);
    assert.match(client, /!pendingMemoryIds\.length && !roomSchemaUpgrade/);
    for (const alias of ['鹦鹉', '爬宠', '灵兽', '使魔', 'rabbit', 'fish', 'reptile', 'familiar']) assert.ok(client.includes(alias));
    assert.match(overlay, /action === 'room-schema-upgrade'/);
    assert.match(room, /旧版房间一次性补全/);
});

function routedEvent(selector, dataset) {
    const element = { dataset };
    return {
        target: {
            closest(query) {
                return query === selector ? element : null;
            },
        },
    };
}

test('r49 travel and NPC click routes render their interactive detail through the real overlay dispatcher', () => {
    const previousDocument = globalThis.document;
    const previousSillyTavern = globalThis.SillyTavern;
    const previousState = {
        activeMode: runtimeState.activeMode,
        activeSession: runtimeState.activeSession,
        activeArchiveSnapshot: runtimeState.activeArchiveSnapshot,
        activeArchiveReadOnly: runtimeState.activeArchiveReadOnly,
        relationSelectedKey: runtimeState.relationSelectedKey,
    };
    const body = { innerHTML: '' };
    const title = { textContent: '' };
    const back = { hidden: false, textContent: '', setAttribute() {} };
    globalThis.document = {
        querySelector(selector) {
            if (selector.endsWith(' .rmt-body')) return body;
            if (selector.endsWith(' .rmt-topbar-title')) return title;
            if (selector.includes('[data-rmt-action="back"]')) return back;
            return null;
        },
    };
    globalThis.SillyTavern = {
        getContext: () => ({ name1: '阿澄', name2: '林砚', extensionSettings: {}, getThumbnailUrl: () => '' }),
    };
    try {
        runtimeState.activeMode = MODE.TRAVEL;
        runtimeState.activeSession = {
            kind: MODE.TRAVEL,
            title: '出行路线',
            routeSummary: '他常去的地方。',
            mapTheme: 'neutral',
            selectedLocationId: '',
            dialogueIndex: 0,
            locations: [{
                id: 'N1', kind: 'near', name: '街角书店', region: '附近', distanceLabel: '步行十分钟',
                summary: '熟悉的书店。', dialogueLines: ['要找哪一本？', '慢慢挑。'], basis: '设定',
            }],
        };

        handleOverlayClick(routedEvent('[data-rmt-travel-location]', { rmtTravelLocation: 'N1' }));
        assert.equal(runtimeState.activeSession.selectedLocationId, 'N1');
        assert.equal(runtimeState.activeSession.dialogueIndex, 0);
        assert.match(body.innerHTML, /rmt-travel-dialogue/);
        assert.match(body.innerHTML, /要找哪一本？/);

        handleOverlayClick(routedEvent('[data-rmt-action]', { rmtAction: 'travel-dialogue-next' }));
        assert.equal(runtimeState.activeSession.dialogueIndex, 1);
        assert.match(body.innerHTML, /慢慢挑。/);

        handleOverlayClick(routedEvent('[data-rmt-action]', { rmtAction: 'travel-dialogue-replay' }));
        assert.equal(runtimeState.activeSession.dialogueIndex, 0);
        assert.match(body.innerHTML, /要找哪一本？/);

        runtimeState.activeMode = MODE.RELATIONS;
        runtimeState.activeArchiveSnapshot = null;
        runtimeState.activeArchiveReadOnly = false;
        runtimeState.relationSelectedKey = '';
        runtimeState.activeSession = {
            kind: MODE.RELATIONS,
            discoveries: [],
            relationships: [{
                id: 'R1', name: '志波', relation: '朋友', category: 'friend', state: '信任',
                sentiments: ['信赖'], summary: '长期朋友。', isUser: false, npcPerspective: '我信任他。',
            }],
        };
        handleOverlayClick(routedEvent('[data-rmt-action]', { rmtAction: 'relation-select', rmtRelationKey: '志波' }));
        assert.equal(runtimeState.relationSelectedKey, '志波');
        assert.match(body.innerHTML, /NPC视角/);
        assert.match(body.innerHTML, /我信任他。/);
    } finally {
        Object.assign(runtimeState, previousState);
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
        if (previousSillyTavern === undefined) delete globalThis.SillyTavern;
        else globalThis.SillyTavern = previousSillyTavern;
    }
});
