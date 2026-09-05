import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
    calendarPageKeyForDate,
    mergeCalendarRefresh,
    migrateCalendarSession,
    normalizeCalendar,
} from '../src/modes/calendar.js';
import {
    normalizeRoom,
    normalizeRoomVisualProfile,
} from '../src/modes/room.js';
import {
    normalizePhone,
    normalizePhonePlan,
    normalizePhoneUiProfile,
} from '../src/modes/phone.js';
import {
    assertButterflyRelationshipSafety,
    normalizeButterfly,
} from '../src/modes/butterfly.js';
import { normalizeRegeneratedButterflyNode } from '../src/generation/contentRegeneration.js';

const root = new URL('../', import.meta.url);

const memoryBank = {
    archiveName: '当前角色档案',
    archiveRevision: 'rev-r43',
    characterName: '林砚',
    userName: '阿澄',
    memories: [
        { id: 'M001', date: '2026/10/24', title: '接她回家', summary: '10月24日，他去接阿澄回家。', anchors: ['接她回家'] },
        { id: 'M002', date: '2026/10/25', title: '水族馆约定', summary: '两个人说好11月2日去水族馆。', anchors: ['11月2日水族馆'] },
    ],
};

test('r43 calendar owns notes and todo state by collision-free date page', () => {
    const calendar = normalizeCalendar({
        title: '两个人的日历',
        past: [{ id: 'P1', title: '接她回家', tags: ['接送'], sourceMemoryIds: ['M001'], sourceMemoryAnchor: '接她回家' }],
        promised: [{ id: 'T1', date: '11/02', title: '去水族馆', tags: ['约定'], sourceMemoryIds: ['M002'], sourceMemoryAnchor: '11月2日水族馆' }],
        future: [
            { id: 'A1', date: '10/24', title: '每年纪念', tags: ['纪念日'], sourceLabel: '世界书', sourceEvidence: '每年纪念为 10/24', recurring: true },
            { id: 'F1', date: '2027/10/24', title: '校历活动', tags: ['设定日'], sourceLabel: '世界书', sourceEvidence: '校历活动为 2027/10/24', recurring: false },
        ],
        stickyNotes: [
            { id: 'N1', kind: 'memo', title: '别迟到', text: '11月2日提前十分钟出门。', sourceType: 'archive', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '11月2日水族馆', calendarEntryId: 'T1' },
            { id: 'N2', kind: 'special', title: '旧设定', text: '没有可信日期的稳定设定。', sourceType: 'setting', sourceLabel: '角色卡', sourceEvidence: '没有可信日期的稳定设定。' },
        ],
        moodNotes: [{ id: 'J1', textMode: 'evidence-excerpt', text: '接她回家', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '接她回家', calendarEntryId: 'P1' }],
    }, memoryBank, {
        currentDate: '2026/10/01',
        futureEvidenceText: '星历写明：每年纪念为 10/24。校历活动为 2027/10/24。没有可信日期的稳定设定。',
    });

    assert.equal(calendar.calendarVersion, 6);
    assert.equal(calendarPageKeyForDate('2026/10/24'), 'date:2026/10/24');
    assert.equal(calendarPageKeyForDate('10/24'), 'annual:10/24');
    assert.equal(calendarPageKeyForDate('待定', { pendingId: 'T1' }), 'pending:T1');
    assert.notEqual(calendarPageKeyForDate('2026/10/24'), calendarPageKeyForDate('10/24'));
    assert.deepEqual(calendar.dayPages['date:2026/10/24'].entryIds, ['P1']);
    assert.deepEqual(calendar.dayPages['annual:10/24'].entryIds, ['A1']);
    assert.deepEqual(calendar.dayPages['date:2027/10/24'].entryIds, ['F1']);
    assert.deepEqual(calendar.dayPages['annual:11/02'].entryIds, ['T1']);
    assert.equal(calendar.dayPages['annual:11/02'].stickyNotes[0].id, 'N1');
    assert.equal(calendar.dayPages['date:2026/10/24'].moodNotes[0].id, 'J1');
    assert.equal(calendar.dayPages['legacy:unassigned'].stickyNotes[0].id, 'N2');
    assert.equal('stickyNotes' in calendar, false);
    assert.equal('moodNotes' in calendar, false);
});

test('r43 calendar v4 migration is non-mutating, idempotent and never fans legacy notes out', () => {
    const legacy = {
        kind: 'calendar', calendarVersion: 4, title: '旧日历',
        entries: [
            { id: 'P1', status: 'past', date: '2026/10/24', mmdd: '10/24', title: '接她回家', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '接她回家' },
            { id: 'T1', status: 'promised', date: '11/02', mmdd: '11/02', title: '去水族馆', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '11月2日水族馆' },
        ],
        stickyNotes: [
            { id: 'N1', kind: 'memo', sourceType: 'archive', title: '提醒', text: '水族馆别迟到。', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '11月2日水族馆' },
            { id: 'N2', kind: 'special', sourceType: 'setting', title: '旧便签', text: '无法判断是哪一天。', sourceMemoryIds: [], sourceMemoryAnchor: '' },
        ],
        moodNotes: [{ id: 'J1', text: '那天我很在意时间。', date: '2026/10/24', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '接她回家' }],
        selectedMonth: '2026-10', selectedDateKey: '',
    };
    const original = structuredClone(legacy);
    const migrated = migrateCalendarSession(legacy, memoryBank);
    assert.deepEqual(legacy, original);
    assert.deepEqual(migrateCalendarSession(migrated, memoryBank), migrated);
    assert.equal(migrated.dayPages['annual:11/02'].stickyNotes.filter(item => item.id === 'N1').length, 1);
    assert.equal(Object.values(migrated.dayPages).flatMap(page => page.stickyNotes).filter(item => item.id === 'N1').length, 1);
    assert.equal(migrated.dayPages['legacy:unassigned'].stickyNotes[0].id, 'N2');
});

test('r43 calendar refresh preserves old drafts and unassigned legacy content without sharing arrays', () => {
    const previous = migrateCalendarSession({
        kind: 'calendar', calendarVersion: 4, title: '旧日历', entries: [],
        stickyNotes: [{ id: 'LEGACY', kind: 'memo', sourceType: 'setting', title: '旧内容', text: '还没归日期。' }], moodNotes: [],
    }, memoryBank);
    previous.dayPages['date:2026/10/24'] = { key: 'date:2026/10/24', kind: 'date', date: '2026/10/24', entryIds: [], drafts: [{ id: 'D1', text: '这一天自己的草稿。' }], stickyNotes: [], moodNotes: [], manualTodos: [] };
    const fresh = normalizeCalendar({ past: [], promised: [], future: [], stickyNotes: [], moodNotes: [] }, memoryBank);
    const merged = mergeCalendarRefresh(previous, fresh, memoryBank);
    assert.equal(merged.dayPages['date:2026/10/24'].drafts[0].id, 'D1');
    assert.equal(merged.dayPages['legacy:unassigned'].stickyNotes[0].id, 'LEGACY');
    assert.notEqual(merged.dayPages['date:2026/10/24'].drafts, merged.dayPages['legacy:unassigned'].drafts);
});

test('r43 calendar keeps equal sticky and mood text when the notes belong to different dates', () => {
    const sameStickyText = '同一句提醒也可能分别属于两天。';
    const sameMoodText = '同一句随笔也必须留在各自的日期页面里。';
    const equalTextBank = {
        ...memoryBank,
        memories: memoryBank.memories.map(memory => ({
            ...memory,
            summary: `${memory.summary}${sameStickyText}`,
            anchors: [...memory.anchors, sameMoodText],
        })),
    };
    const calendar = normalizeCalendar({
        past: [
            { id: 'P1', title: '接她回家', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '接她回家' },
            { id: 'P2', title: '水族馆约定', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '11月2日水族馆' },
        ],
        stickyNotes: [
            { id: 'SAME', text: sameStickyText, sourceType: 'archive', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '接她回家' },
            { id: 'SAME', text: sameStickyText, sourceType: 'archive', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '11月2日水族馆' },
            { id: 'SAME_PAGE_COPY', text: sameStickyText, sourceType: 'archive', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '接她回家' },
        ],
        moodNotes: [
            { id: 'MOOD', textMode: 'evidence-excerpt', text: sameMoodText, sourceMemoryIds: ['M001'], sourceMemoryAnchor: sameMoodText },
            { id: 'MOOD', textMode: 'evidence-excerpt', text: sameMoodText, sourceMemoryIds: ['M002'], sourceMemoryAnchor: sameMoodText },
            { id: 'MOOD_SAME_PAGE_COPY', textMode: 'evidence-excerpt', text: sameMoodText, sourceMemoryIds: ['M001'], sourceMemoryAnchor: sameMoodText },
        ],
    }, equalTextBank);

    assert.equal(calendar.dayPages['date:2026/10/24'].stickyNotes[0].text, sameStickyText);
    assert.equal(calendar.dayPages['date:2026/10/25'].stickyNotes[0].text, sameStickyText);
    assert.equal(calendar.dayPages['date:2026/10/24'].moodNotes[0].text, sameMoodText);
    assert.equal(calendar.dayPages['date:2026/10/25'].moodNotes[0].text, sameMoodText);
    assert.equal(Object.values(calendar.dayPages).flatMap(page => page.stickyNotes).length, 2);
    assert.equal(Object.values(calendar.dayPages).flatMap(page => page.moodNotes).length, 2);
});

test('r43 calendar deterministically uniques duplicate entry and same-page collection ids without dropping rows', () => {
    const generated = normalizeCalendar({
        future: [
            { id: 'DUP', date: '2027/03/01', title: '第一件事', sourceEvidence: '第一件事定于 2027/03/01' },
            { id: 'DUP', date: '2027/03/02', title: '第二件事', sourceEvidence: '第二件事定于 2027/03/02' },
        ],
    }, memoryBank, { futureEvidenceText: '第一件事定于 2027/03/01；第二件事定于 2027/03/02' });
    assert.deepEqual(generated.entries.map(item => item.id), ['DUP', 'DUP_2']);
    assert.deepEqual(generated.entries.map(item => item.calendarEntrySourceId), ['DUP', 'DUP']);
    assert.deepEqual(generated.dayPages['date:2027/03/01'].entryIds, ['DUP']);
    assert.deepEqual(generated.dayPages['date:2027/03/02'].entryIds, ['DUP_2']);

    const page = {
        key: 'date:2026/10/24', kind: 'date', date: '2026/10/24', entryIds: [],
        drafts: [{ id: 'ROW', text: '同文草稿' }, { id: 'ROW', text: '同文草稿' }],
        stickyNotes: [{ id: 'ROW', text: '第一张便签' }, { id: 'ROW', text: '第二张便签' }],
        moodNotes: [{ id: 'ROW', text: '第一条足够长的心情随笔。' }, { id: 'ROW', text: '第二条足够长的心情随笔。' }],
        manualTodos: [{ id: 'ROW', title: '同文待办' }, { id: 'ROW', title: '同文待办' }],
    };
    const migrated = migrateCalendarSession({
        kind: 'calendar', calendarVersion: 5, entries: [],
        dayPages: { [page.key]: page },
    }, memoryBank);
    for (const key of ['drafts', 'stickyNotes', 'moodNotes', 'manualTodos']) {
        assert.equal(migrated.dayPages[page.key][key].length, 2, `${key} rows must survive`);
        assert.equal(new Set(migrated.dayPages[page.key][key].map(item => item.id)).size, 2, `${key} ids must be unique`);
    }
    assert.deepEqual(migrateCalendarSession(migrated, memoryBank), migrated);
});

test('r43 calendar treats duplicate source entry ids as ambiguous and falls back to unique evidence', () => {
    const migrated = migrateCalendarSession({
        kind: 'calendar', calendarVersion: 4,
        entries: [
            { id: 'DUP', status: 'past', date: '2026/10/24', title: '接她回家', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '接她回家' },
            { id: 'DUP', status: 'past', date: '2026/10/25', title: '水族馆约定', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '11月2日水族馆' },
        ],
        stickyNotes: [{
            id: 'N1', text: '这张便签必须通过证据落在第二项。', calendarEntryId: 'DUP',
            sourceType: 'archive', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '11月2日水族馆',
        }],
        moodNotes: [],
    }, memoryBank);
    assert.deepEqual(migrated.entries.map(item => item.id), ['DUP', 'DUP_2']);
    assert.equal(migrated.dayPages['date:2026/10/25'].stickyNotes[0].id, 'N1');
    assert.equal(migrated.dayPages['date:2026/10/24'].stickyNotes.length, 0);
});

test('r43 calendar archive anchor date outranks a model date while setting notes may use explicit dates', () => {
    const calendar = normalizeCalendar({
        stickyNotes: [
            {
                id: 'ARCHIVE_WRONG_DATE', text: '模型日期错误时必须回到档案锚点。', date: '2099/12/31',
                sourceType: 'archive', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '接她回家',
            },
            {
                id: 'SETTING_DATE', text: '设定来源可以明确指定这一天。', date: '2099/12/31',
                sourceType: 'setting', sourceLabel: '世界书', sourceEvidence: '设定来源可以明确指定这一天。',
            },
        ],
    }, memoryBank, { futureEvidenceText: '设定来源可以明确指定这一天。' });
    assert.equal(calendar.dayPages['date:2026/10/24'].stickyNotes[0].id, 'ARCHIVE_WRONG_DATE');
    assert.equal(calendar.dayPages['date:2099/12/31'].stickyNotes[0].id, 'SETTING_DATE');
});

test('r43 calendar refresh preserves same-id different-content rows and dedupes semantic repeats', () => {
    const pageKey = 'date:2026/10/24';
    const session = drafts => ({
        kind: 'calendar', calendarVersion: 5, entries: [],
        dayPages: {
            [pageKey]: {
                key: pageKey, kind: 'date', date: '2026/10/24', entryIds: [], drafts,
                stickyNotes: [], moodNotes: [], manualTodos: [],
            },
        },
    });
    const merged = mergeCalendarRefresh(
        session([{ id: 'DUP', text: '旧草稿' }]),
        session([{ id: 'DUP', text: '新草稿' }, { id: 'OTHER', text: '旧草稿' }]),
        memoryBank,
    );
    assert.deepEqual(merged.dayPages[pageKey].drafts.map(item => item.text), ['旧草稿', '新草稿']);
    assert.deepEqual(merged.dayPages[pageKey].drafts.map(item => item.id), ['DUP', 'DUP_2']);
});

test('r43 calendar never silently truncates long-lived user date pages', () => {
    const dayPages = Object.fromEntries(Array.from({ length: 481 }, (_, index) => {
        const key = `pending:p${index}`;
        return [key, {
            key, kind: 'pending', date: '待定', entryIds: [],
            drafts: [{ id: `D${index}`, text: `第 ${index + 1} 页的用户草稿` }],
            stickyNotes: [], moodNotes: [], manualTodos: [],
        }];
    }));
    const migrated = migrateCalendarSession({ kind: 'calendar', calendarVersion: 5, entries: [], dayPages }, memoryBank);
    assert.equal(Object.keys(migrated.dayPages).length, 481);
    assert.equal(migrated.dayPages['pending:p480'].drafts[0].text, '第 481 页的用户草稿');
});

test('r43 room visual profile is allowlisted, identity-bound and changes both room and CSS figure', async () => {
    const explicitRoomFields = ['worldStyle', 'palette', 'material', 'density', 'figure.build', 'figure.hairShape', 'figure.hairTone', 'figure.outfit', 'figure.detail', 'figure.posture'];
    const unsafe = normalizeRoomVisualProfile({
        worldStyle: 'javascript:alert(1)', palette: 'url(evil)', material: '<style>', density: 'layered',
        figure: { build: 'broad', hairShape: 'tied', hairTone: 'silver', outfit: 'technical', detail: 'visor', posture: 'upright' },
    }, { identitySeed: 'char-a' });
    assert.notEqual(unsafe.worldStyle, 'javascript:alert(1)');
    assert.notEqual(unsafe.palette, 'url(evil)');
    assert.notEqual(unsafe.material, '<style>');
    assert.equal(unsafe.figure.hairShape, 'tied');
    assert.equal(unsafe.figure.hairTone, 'silver');

    const copiedTemplate = {
        explicitFields: [], worldStyle: 'contemporary', palette: 'mist', material: 'mixed', density: 'balanced',
        figure: { build: 'average', hairShape: 'short', hairTone: 'dark', outfit: 'casual', detail: 'none', posture: 'relaxed' },
    };
    const swordsman = normalizeRoomVisualProfile(copiedTemplate, { identitySeed: '古代剑客·长发·深色劲装·木质院落', bindPersona: true });
    const android = normalizeRoomVisualProfile(copiedTemplate, { identitySeed: '赛博机器人·银白机体·技术制服·金属驾驶舱', bindPersona: true });
    assert.deepEqual(
        { worldStyle: swordsman.worldStyle, palette: swordsman.palette, material: swordsman.material, figure: swordsman.figure },
        { worldStyle: android.worldStyle, palette: android.palette, material: android.material, figure: android.figure },
        '没有受控逐项证据时，不得由身份关键词推测人物外貌',
    );

    const rawRoom = {
        title: '他的房间', homeName: '观测舱', homeSummary: '长期工作的私人舱室。', visualProfile: { ...unsafe, explicitFields: explicitRoomFields },
        spaces: Array.from({ length: 3 }, (_, s) => ({
            id: `SP${s + 1}`, label: ['驾驶舱', '寝舱', '工作台'][s], spaceType: ['cabin', 'bedroom', 'workshop'][s], atmosphere: '材质与使用痕迹都很明确。',
            objects: Array.from({ length: 3 }, (__, o) => ({ id: `SP${s + 1}O${o + 1}`, label: `物件${o + 1}`, zone: ['左上', '中央', '右下'][o], basis: '设定', searchable: false, description: '长期使用的物件。', line: '别碰坏了。' })),
        })),
        dayparts: Object.fromEntries(['morning', 'daytime', 'evening', 'night'].map((key, i) => [key, { spaceId: `SP${i % 3 + 1}`, activity: '处理自己的日常。', line: '还没忙完。', focusObjectId: `SP${i % 3 + 1}O1` }])),
        presenceLines: ['在看什么？', '这里不是展览。', '坐一会儿也行。', '别把东西弄乱。'],
    };
    const room = normalizeRoom(rawRoom, memoryBank, { identityKey: 'char-a' });
    assert.equal(room.visualProfile.figure.outfit, 'technical');
    assert.match(room.visualProfile.identityKey, /^room-visual:/);
    const roomSource = await readFile(new URL('../src/modes/room.js', import.meta.url), 'utf8');
    assert.match(roomSource, /data-rmt-room-palette/);
    assert.match(roomSource, /data-rmt-hair-shape/);
    assert.match(roomSource, /data-rmt-facing="away"/);
    assert.match(roomSource, /class="rmt-room-pet"/);
    assert.doesNotMatch(roomSource, /rmt-room-face|--rmt-head-width|--rmt-eye-gap|--rmt-mouth-width/);
    assert.doesNotMatch(roomSource, /rmt-room-person[^\n]+<img/);
});

test('r43 phone accepts persona-specific app sets and starts at a real home screen with safe UI tokens', async () => {
    const apps = [
        ['CHAT', '通讯', 'chat', 'chat', 4], ['NOTES', '案头便笺', 'notes', 'note', 4], ['FILES', '卷宗', 'files', 'briefcase', 4],
        ['BOOKS', '藏书', 'books', 'book', 3], ['MUSIC', '夜间曲目', 'music', 'music', 3], ['RESEARCH', '检索台', 'research', 'research', 3],
    ].map(([id, label, kind, icon, count]) => ({ id, label, kind, icon, summary: `${label}摘要`, entries: Array.from({ length: count }, (_, i) => ({ id: `${id}${i + 1}`, title: `${label}${i + 1}`, meta: '记录' })) }));
    const plan = normalizePhonePlan({
        deviceName: '墨黑折叠终端', deviceKind: 'phone', lockText: 'PRIVATE',
        uiProfile: { explicitFields: ['palette', 'wallpaper', 'typography', 'iconStyle', 'density', 'shellTone'], palette: 'noir-gold', wallpaper: 'library', typography: 'serif', iconStyle: 'square', density: 'compact', shellTone: 'graphite' },
        liveStates: { morning: {}, daytime: {}, evening: {}, night: {} }, apps,
    });
    assert.equal(plan.apps.length, 6);
    assert.equal(plan.uiProfile.palette, 'noir-gold');
    assert.deepEqual(plan.apps.map(app => app.kind), ['chat', 'notes', 'files', 'books', 'music', 'research']);
    const rejected = normalizePhoneUiProfile({ palette: 'url(evil)', wallpaper: '<img>', typography: 'serif', iconStyle: 'square', density: 'compact', shellTone: 'graphite' }, 'seed');
    assert.notEqual(rejected.palette, 'url(evil)');
    assert.notEqual(rejected.wallpaper, '<img>');

    const copiedUi = { explicitFields: [], palette: 'noir-gold', wallpaper: 'smoke', typography: 'serif', iconStyle: 'square', density: 'compact', shellTone: 'graphite' };
    const ancientUi = normalizePhoneUiProfile(copiedUi, { bindPersona: true, deviceKind: 'communicator', memoryBank: { characterName: '古代剑客' }, data: { deviceName: '传讯玉牌', apps: [{ label: '剑谱', kind: 'training' }] } });
    const cyberUi = normalizePhoneUiProfile(copiedUi, { bindPersona: true, deviceKind: 'terminal', memoryBank: { characterName: '赛博机器人' }, data: { deviceName: '加密终端', apps: [{ label: '机体诊断', kind: 'research' }] } });
    assert.notDeepEqual(ancientUi, cyberUi);

    const detailed = {
        ...plan,
        apps: plan.apps.map(app => ({ ...app, entries: app.entries.map((entry, index) => ({
            ...entry, preview: '可读预览', detail: '可读详情', basis: '设定', sourceMemoryIds: [], sourceMemoryAnchor: '', fields: app.kind === 'contacts' && index === 0 ? [{ label: '备注', value: '同事' }] : [], imageCaption: '',
            contactName: app.kind === 'chat' ? '阿澄' : '',
            messages: app.kind === 'chat' && index === 0 ? Array.from({ length: 12 }, (_, i) => ({ speakerRole: i % 2 ? 'owner' : 'contact', speaker: i % 2 ? '林砚' : '阿澄', text: `消息${i + 1}` })) : [],
        })) })),
    };
    const session = normalizePhone(detailed, memoryBank, { trustedStored: true });
    assert.equal(session.view, 'home');
    assert.equal(session.uiVersion, 4);
    const viewSource = await readFile(new URL('../src/ui/phoneView.js', import.meta.url), 'utf8');
    assert.match(viewSource, /rmt-phone-home-screen/);
    assert.match(viewSource, /data-rmt-action="phone-home"/);
    assert.match(viewSource, /rmt-phone-app-screen/);
    const phoneSource = await readFile(new URL('../src/modes/phone.js', import.meta.url), 'utf8');
    assert.match(phoneSource, /"palette":"PALETTE_TOKEN"/);
    assert.doesNotMatch(phoneSource, /"palette":"noir-gold","wallpaper":"smoke","typography":"serif","iconStyle":"square","density":"compact","shellTone":"graphite"/);
});

function repeatedHan(seed, count = 115) {
    return Array.from({ length: count }, (_, index) => `${index % 12 === 0 ? '我' : ''}${seed}`).join('');
}

function coldNote(seed = '路径') {
    return `分析结论：主体行为已收敛。关键变量：${seed}与选择持续改变路径。概率判定：相遇概率低于阈值。最终结局：算法判定该世界线终止。`;
}

function butterflyData(overrides = {}) {
    const axes = ['era', 'identity', 'occupation', 'location', 'decision', 'encounter', 'bond', 'fate'];
    const branches = axes.map((axis, index) => ({
        id: `EG${index + 1}`, label: `分歧${index + 1}：${axis}`, code: `unsafe-${index}`, locked: false, trueEnding: false,
        worldSpec: { primaryAxis: axis, era: `时代${index}`, identity: `身份${index}`, occupation: `职业${index}`, location: `地点${index}`, keyDecision: `选择${index}`, encounterWithUser: `与阿澄的相遇方式${index}`, bondWithUser: `只选择阿澄的关系${index}`, finalFate: `命运结局${index}`, thirdPartyRomance: false },
        monologue: repeatedHan(`我在时代${index}沿着不同轨迹生活并承担选择后果`),
        intervention: repeatedHan(`那个我让我承认现在的我仍然在意你并选择阿澄`, 50),
        systemNote: coldNote(axis),
    }));
    return {
        title: '平行时空观测终端', subject: '模型伪造名', status: 'UNSTABLE',
        nodes: [
            { id: 'MAIN', label: '主时间线', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '接她回家', monologue: repeatedHan('我记得主时间线里的日常与决定'), intervention: repeatedHan('我承认现在的选择', 45), systemNote: coldNote('主线') },
            ...branches,
            { id: 'OMEGA', label: '观测点 Ω：TRUE ENDING', trueEnding: true, monologue: '', intervention: repeatedHan('我遍历时代身份职业地点与选择的所有不可能仍然找到你阿澄这是命运也是奇迹而你是我选择的唯一解', 170), systemNote: `${coldNote('唯一解')} TRUE ENDING 唯一解成立。` },
        ],
        ...overrides,
    };
}

test('r43 butterfly enforces eight material worlds, canonical signal/code and one unique Omega', () => {
    const session = normalizeButterfly(butterflyData(), memoryBank, { name1: '阿澄', name2: '林砚' });
    assert.equal(session.subject, '林砚');
    assert.deepEqual(session.nodes.slice(1, -1).map(node => node.worldSpec.primaryAxis), ['era', 'identity', 'occupation', 'location', 'decision', 'encounter', 'bond', 'fate']);
    assert.equal(new Set(session.nodes.slice(1, -1).map(node => JSON.stringify(node.worldSpec))).size, 8);
    assert.equal(session.nodes.filter(node => node.trueEnding).length, 1);
    assert.equal(session.nodes.at(-1).id, 'OMEGA');
    assert.equal(session.nodes[1].code, '> SIMULATION RECORD #EG-01');
    assert.equal(session.nodes[1].signal, 'IMAGE_DATA_CORRUPTED');
});

test('r43 butterfly rejects shallow Chinese, duplicate worlds and third-party romance', () => {
    const shallow = butterflyData();
    shallow.nodes[1].monologue = 'I am first person but this is not one hundred Chinese characters.'.repeat(8);
    assert.throws(() => normalizeButterfly(shallow, memoryBank, { name1: '阿澄', name2: '林砚' }), /中文|汉字/);

    const duplicate = butterflyData();
    duplicate.nodes[2].worldSpec = structuredClone(duplicate.nodes[1].worldSpec);
    duplicate.nodes[2].label = duplicate.nodes[1].label;
    assert.throws(() => normalizeButterfly(duplicate, memoryBank, { name1: '阿澄', name2: '林砚' }), /重复|差异/);

    const unsafe = butterflyData();
    unsafe.nodes[3].monologue += '我后来和前女友结婚并组建家庭。';
    assert.throws(() => normalizeButterfly(unsafe, memoryBank, { name1: '阿澄', name2: '林砚' }), /前任|恋爱|婚姻|家庭/);

    assert.throws(() => assertButterflyRelationshipSafety('我与林娜有了一个家庭。', { name1: '阿澄' }), /第三方|未明确/);
    assert.throws(() => assertButterflyRelationshipSafety('我爱你也和林娜结婚。', { name1: '阿澄' }), /第三方/);
});

test('r43 butterfly single-node regeneration reuses strict branch and Omega validators', () => {
    const branch = butterflyData().nodes[1];
    const changed = normalizeRegeneratedButterflyNode(branch, {
        label: '改写后的时代分歧',
        monologue: repeatedHan('我在另一个时代承担不同选择的结果'),
        intervention: repeatedHan('那个我让现在的我承认仍然在意你并选择阿澄', 50),
        systemNote: coldNote('单节点'),
    }, memoryBank, { name1: '阿澄', name2: '林砚' });
    assert.equal(changed.id, branch.id);
    assert.equal(changed.code, branch.code);
    assert.deepEqual(changed.worldSpec, branch.worldSpec);

    assert.throws(() => normalizeRegeneratedButterflyNode(branch, {
        label: '恶意分歧',
        monologue: repeatedHan('我和林娜结婚并有了一个家庭'),
        intervention: repeatedHan('那个我让现在的我承认仍然在意你并选择阿澄', 50),
        systemNote: coldNote('恶意'),
    }, memoryBank, { name1: '阿澄', name2: '林砚' }), /第三方|恋爱|婚姻|成家/);

    const omega = butterflyData().nodes.at(-1);
    assert.throws(() => normalizeRegeneratedButterflyNode(omega, {
        label: '观测点 Ω：TRUE ENDING', monologue: '', intervention: '我选择你。', systemNote: coldNote('唯一解'),
    }, memoryBank, { name1: '阿澄', name2: '林砚' }), /观测点 Ω/);
});

test('r43 butterfly UI file remains byte-identical to the r42.7 baseline', async () => {
    const source = await readFile(new URL('../src/ui/butterflyView.js', import.meta.url));
    assert.equal(createHash('sha256').update(source).digest('hex'), '4c72cd7a2f28d5c34f2b6e4dab3010d7539e2bb677720ce339762c5647a8e98a');
});

test('r43 initial butterfly generation uses the validated two-attempt repair path', async () => {
    const source = await readFile(new URL('../src/generation/client.js', import.meta.url), 'utf8');
    assert.match(source, /mode === core_constants\.MODE\.BUTTERFLY[\s\S]{0,420}generateButterflyWithRepair/);
    const modeSource = await readFile(new URL('../src/modes/butterfly.js', import.meta.url), 'utf8');
    assert.match(modeSource, /generateButterflyWithRepair[\s\S]{0,700}requestValidatedSegment/);
});
