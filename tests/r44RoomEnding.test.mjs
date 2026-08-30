import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { state as runtimeState } from '../src/core/state.js';
import {
    ROOM_PET_SPECIES,
    mergeRoomIncremental,
    normalizeRoom,
    normalizeRoomVisualProfile,
    roomBlueprintPayload,
    roomMotifToken,
    roomNeedsSchemaUpgrade,
    roomObjectVisualKind,
    roomPetNodeHtml,
    roomPetSummaryHtml,
} from '../src/modes/room.js';
import {
    ENDING_EASTER_EGG_MODULES,
    normalizeEndingConfessionReplays,
    normalizeEndingEasterEgg,
} from '../src/modes/ending.js';
import {
    closeEndingEasterEgg,
    createEndingEasterEggRuntime,
    endingEasterEggHover,
    endingEasterEggPopupHtml,
    endingEasterEggPulse,
    endingEasterEggReveal,
    endingEasterEggStabilize,
    endingEasterEggTick,
    endingEasterEggToggleLogs,
    stopEndingEasterEggTimer,
} from '../src/ui/endingView.js';

const memoryBank = {
    archiveName: '当前角色档案',
    archiveRevision: 'rev-r44',
    characterName: '林砚',
    userName: '阿澄',
    memories: [
        { id: 'M001', title: '小狗窝', summary: '他在书房给小狗准备了长期使用的小狗窝。', anchors: ['小狗窝'] },
        { id: 'M002', title: '告白夜', summary: '两个人已经把心意讲清楚。', anchors: ['告白夜'] },
    ],
};

function roomFixture() {
    return {
        title: '他的房间',
        homeName: '旧宅二层',
        homeSummary: '书、植物和旅行旧物构成了很明确的生活空间。',
        spaces: ['书房', '卧室', '阳台'].map((label, spaceIndex) => ({
            id: `SP${spaceIndex + 1}`,
            label,
            spaceType: label,
            atmosphere: `${label}保留着长期生活和使用的痕迹。`,
            objects: ['旧书架', '绿植架', '旅行箱'].map((objectLabel, objectIndex) => ({
                id: `SP${spaceIndex + 1}O${objectIndex + 1}`,
                label: objectLabel,
                zone: ['左上', '中央', '右下'][objectIndex],
                basis: '设定',
                searchable: objectLabel === '旅行箱',
                description: `${objectLabel}一直放在这里。`,
                line: `这是${objectLabel}留下的生活痕迹。`,
            })),
        })),
        pets: [
            { id: 'CAT', name: '墨点', species: '猫', spaceId: 'SP3', basis: '设定', description: '它喜欢趴在阳台的暖光里。', line: '尾巴轻轻扫过花盆。' },
            { id: 'DOG', name: '小满', species: 'dog', spaceId: 'SP1', basis: '记忆', description: '小狗窝就放在书桌边。', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '小狗窝' },
            { id: 'GHOST', name: '错误空间', species: 'cat', spaceId: 'SP404', basis: '设定', description: '不应被保留。' },
            { id: 'FAKE', name: '错误证据', species: 'dog', spaceId: 'SP1', basis: '记忆', description: '没有真实证据。', sourceMemoryIds: ['M404'], sourceMemoryAnchor: '不存在' },
            { id: 'OTHER', name: '<img src=x onerror=alert(1)>', species: 'url(javascript:1)', spaceId: 'SP2', basis: '设定', description: '<script>alert(1)</script>' },
        ],
        dayparts: Object.fromEntries(['morning', 'daytime', 'evening', 'night'].map((key, index) => [key, {
            spaceId: `SP${index % 3 + 1}`,
            activity: '处理自己的日常。',
            line: '这里很安静。',
            focusObjectId: `SP${index % 3 + 1}O1`,
        }])),
        presenceLines: ['你来了。', '坐一会儿吧。', '别踩到地上的书。', '要喝点什么吗？'],
    };
}

function confessionFixture(easterEgg) {
    return {
        id: 'CONF01',
        type: 'mutual',
        title: '告白夜',
        subtitle: '两个人终于把话说清楚',
        date: '2026/08/20',
        scene: '告白夜里，他们在熟悉的灯光下停下来，把长久以来没有说出口的心意一点点讲清楚。'.repeat(8),
        confessionText: '我不是一时冲动。我记得我们一起走过的每一个普通日子，也确定自己想继续站在你身边。'.repeat(3),
        confessionLines: ['我不是一时冲动。', '我记得那些普通的日子。', '我想继续站在你身边。', '这就是我没有说完的心意。'],
        responseSummary: '当时得到了明确回应。',
        afterEffect: '两个人从那天起确认了彼此的心意。',
        sourceMemoryIds: ['M002'],
        sourceMemoryAnchor: '告白夜',
        easterEgg,
    };
}

test('r44 room fixes the character to a faceless rear silhouette and normalizes evidenced pets', async () => {
    const room = normalizeRoom(roomFixture(), memoryBank, { identityKey: '林砚-旧宅' });
    assert.equal(room.visualProfile.figure.facing, 'away');
    for (const legacyFaceField of ['faceWidth', 'faceHeight', 'eyeSpacing', 'mouthWidth']) {
        assert.equal(legacyFaceField in room.visualProfile.figure, false);
    }
    assert.deepEqual(room.pets.map(pet => pet.id), ['CAT', 'DOG', 'OTHER']);
    assert.deepEqual(room.pets.map(pet => pet.species), ['cat', 'dog', 'other']);
    assert.deepEqual(room.pets[1].sourceMemoryIds, ['M001']);
    assert.equal(room.pets[1].sourceMemoryAnchor, '小狗窝');
    assert.deepEqual(room.pets[0].sourceMemoryIds, []);
    assert.ok(room.pets.every(pet => room.spaces.some(space => space.id === pet.spaceId)));
    assert.ok(room.pets.every(pet => ROOM_PET_SPECIES.includes(pet.species)));
    assert.deepEqual(roomBlueprintPayload(room).pets.map(pet => pet.id), ['CAT', 'DOG', 'OTHER']);

    const legacyRaw = roomFixture();
    delete legacyRaw.pets;
    const legacy = normalizeRoom(legacyRaw, memoryBank);
    delete legacy.roomVersion;
    assert.equal(roomNeedsSchemaUpgrade(legacy), true);
    const merged = mergeRoomIncremental(legacy, room, ['M001']).session;
    assert.deepEqual(merged.pets.map(pet => pet.id), ['CAT', 'DOG', 'OTHER']);
    assert.ok(merged.pets.every(pet => merged.spaces.some(space => space.id === pet.spaceId)));
    assert.equal(roomNeedsSchemaUpgrade(merged), false);

    const legacyProfile = normalizeRoomVisualProfile({ figure: { faceWidth: 999, eyeSpacing: -20, mouthWidth: 500 } }, { identitySeed: 'legacy' });
    assert.equal(legacyProfile.figure.facing, 'away');
    assert.equal('faceWidth' in legacyProfile.figure, false);

    const source = await readFile(new URL('../src/modes/room.js', import.meta.url), 'utf8');
    assert.match(source, /data-rmt-facing="away"/);
    assert.match(source, /class="rmt-room-pet"/);
    assert.doesNotMatch(source, /rmt-room-face|--rmt-head-width|--rmt-eye-gap|--rmt-mouth-width/);
});

test('r44 room emits escaped pet markup and stable code-owned visual tokens', () => {
    const maliciousPet = normalizeRoom(roomFixture(), memoryBank).pets.find(pet => pet.id === 'OTHER');
    const node = roomPetNodeHtml(maliciousPet, 2);
    const note = roomPetSummaryHtml(maliciousPet);
    assert.match(node, /data-rmt-pet-species="other"/);
    assert.match(node, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(note, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(`${node}${note}`, /<script|<img\s/i);
    assert.equal(roomObjectVisualKind({ label: '旧书与杂志', description: '' }), 'book');
    assert.equal(roomObjectVisualKind({ label: '<style>', description: 'url(javascript:1)' }), 'other');
    assert.equal(roomMotifToken({ visualProfile: { density: 'balanced' } }, roomFixture().spaces[0]), 'literary');
});

test('r44 room rejects repetitive spaces and normal increments cannot add ungrounded pets or presence lines', () => {
    const repeated = roomFixture();
    repeated.spaces = repeated.spaces.map(space => ({ ...space, label: '卧室', spaceType: '卧室' }));
    assert.throws(() => normalizeRoom(repeated, memoryBank), /重复|功能差异/);

    const disguised = roomFixture();
    disguised.spaces = Array.from({ length: 5 }, (_, index) => ({
        ...structuredClone(disguised.spaces[0]),
        id: `SP${index + 1}`,
        label: index === 0 ? '卧室' : `日常角落${index}`,
        spaceType: index === 0 ? '卧室' : '私人空间',
    }));
    assert.throws(() => normalizeRoom(disguised, memoryBank), /可见结构过于相似/);

    const previous = normalizeRoom(roomFixture(), memoryBank);
    const candidate = roomFixture();
    candidate.pets = [{ id: 'NEW_SETTING', name: '凭新设定追加', species: 'cat', spaceId: 'SP1', basis: '设定', description: '本轮没有记忆证据。' }];
    candidate.presenceLines.push('没有本轮证据的新台词。');
    const fresh = normalizeRoom(candidate, memoryBank);
    const merged = mergeRoomIncremental(previous, fresh, ['M002']);
    assert.deepEqual(merged.session.pets, previous.pets);
    assert.deepEqual(merged.session.presenceLines, previous.presenceLines);
    assert.equal(merged.added, 0);

    const mixedEvidence = roomFixture();
    mixedEvidence.pets = [{ id: 'MIXED', name: '借旧锚点的宠物', species: 'dog', spaceId: 'SP1', basis: '记忆', description: '小狗窝的旧记忆。', sourceMemoryIds: ['M001', 'M002'], sourceMemoryAnchor: '小狗窝' }];
    const mixedFresh = normalizeRoom(mixedEvidence, memoryBank);
    const strictMerged = mergeRoomIncremental(previous, mixedFresh, ['M002'], { memoryBank });
    assert.deepEqual(strictMerged.session.pets, previous.pets);
});

test('r44 confession easter egg has structured legacy fallback and fixed safe enums', () => {
    const [legacyReplay] = normalizeEndingConfessionReplays([confessionFixture(undefined)], memoryBank);
    assert.ok(legacyReplay);
    assert.ok(ENDING_EASTER_EGG_MODULES.includes(legacyReplay.easterEgg.moduleType));
    assert.ok(legacyReplay.easterEgg.logs.length >= 4 && legacyReplay.easterEgg.logs.length <= 12);
    assert.ok(legacyReplay.easterEgg.monologue.length >= 2 && legacyReplay.easterEgg.monologue.length <= 4);
    assert.ok(legacyReplay.easterEgg.poem.length >= 4 && legacyReplay.easterEgg.poem.length <= 8);

    const egg = normalizeEndingEasterEgg({
        moduleType: 'javascript:alert(1)',
        title: '<img src=x onerror=alert(1)>',
        statusLine: '<script>alert(1)</script>',
        logs: ['<iframe src=javascript:alert(1)>', '二', '三', '四'],
        monologue: ['<style>body{display:none}</style>', '仍然只是文字。'],
        poem: ['<svg onload=alert(1)>', '第二行', '第三行', '第四行'],
        feedback: { pulse: '<script>pulse()</script>' },
    }, legacyReplay);
    assert.ok(ENDING_EASTER_EGG_MODULES.includes(egg.moduleType));
    assert.notEqual(egg.moduleType, 'javascript:alert(1)');

    const replay = { ...legacyReplay, easterEgg: egg };
    const html = endingEasterEggPopupHtml(replay);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script|<img\s|<iframe|<style|<svg\s/i);
    assert.match(html, /data-rmt-action="ending-easter-pulse"/);
    assert.match(html, /data-rmt-action="ending-easter-reveal"/);
    assert.match(html, /data-rmt-action="ending-easter-toggle"/);
    assert.match(html, /data-rmt-action="ending-easter-stabilize"/);
});

test('r44 local ending controller provides five bounded interactions and cleans timers', () => {
    const replay = confessionFixture({
        moduleType: 'heartbeat_console',
        logs: Array.from({ length: 12 }, (_, index) => `情感读取 ${index + 1}`),
        monologue: ['第一段内心独白。', '第二段内心独白。'],
        poem: ['第一行', '第二行', '第三行', '第四行'],
    });
    const previousMode = runtimeState.activeMode;
    const previousSession = runtimeState.activeSession;
    runtimeState.activeMode = 'ending';
    runtimeState.activeSession = { kind: 'ending', confessionReplays: [replay], view: 'confessions' };
    runtimeState.endingEasterEggRuntime = createEndingEasterEggRuntime(replay);
    const initialIntensity = runtimeState.endingEasterEggRuntime.intensity;

    assert.equal(endingEasterEggPulse(), true);
    assert.equal(runtimeState.endingEasterEggRuntime.pulseCount, 1);
    assert.ok(runtimeState.endingEasterEggRuntime.intensity > initialIntensity);
    assert.equal(endingEasterEggHover(true), true);
    assert.equal(runtimeState.endingEasterEggRuntime.hovered, true);
    assert.equal(endingEasterEggReveal(), true);
    assert.equal(runtimeState.endingEasterEggRuntime.poemIndex, 2);
    assert.equal(endingEasterEggToggleLogs(), true);
    assert.equal(runtimeState.endingEasterEggRuntime.paused, true);
    assert.equal(endingEasterEggTick(new Date('2026-08-29T10:24:00')), false);
    assert.equal(endingEasterEggToggleLogs(), true);
    assert.equal(runtimeState.endingEasterEggRuntime.paused, false);
    assert.equal(endingEasterEggStabilize(), true);
    assert.equal(runtimeState.endingEasterEggRuntime.stabilized, true);

    for (let index = 0; index < 30; index += 1) endingEasterEggTick(new Date(2026, 7, 29, 10, 24, index));
    assert.equal(runtimeState.endingEasterEggRuntime.visibleLogs.length, 12);

    runtimeState.endingEasterEggTimer = setInterval(() => {}, 10_000);
    stopEndingEasterEggTimer();
    assert.equal(runtimeState.endingEasterEggTimer, 0);
    closeEndingEasterEgg({ restoreFocus: false });
    assert.equal(runtimeState.endingEasterEggRuntime, null);
    runtimeState.activeMode = previousMode;
    runtimeState.activeSession = previousSession;
});
