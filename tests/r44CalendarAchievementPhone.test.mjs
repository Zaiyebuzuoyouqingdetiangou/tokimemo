import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { state as runtimeState } from '../src/core/state.js';
import {
    normalizeAchievements,
    renderAchievements,
} from '../src/modes/achievements.js';
import {
    migrateLegacyPhoneSession,
    normalizePhonePlan,
} from '../src/modes/phone.js';

const memoryBank = {
    characterName: '纪时卿',
    archiveName: '共同档案',
    memories: [{
        id: 'M001',
        date: '2026/08/01',
        title: '雨夜同行',
        summary: '两个人在站台共撑一把伞。',
        anchors: ['站台雨伞'],
    }],
};

test('r44 calendar renders only char-authored notebook surfaces and hides legacy manual data controls', async () => {
    const calendarView = await readFile(new URL('../src/ui/calendarView.js', import.meta.url), 'utf8');
    const contentManager = await readFile(new URL('../src/ui/contentManager.js', import.meta.url), 'utf8');

    assert.doesNotMatch(calendarView, /<textarea\b|<input\b/);
    assert.doesNotMatch(calendarView, /calendar-add-draft|calendar-add-todo|calendar-toggle-todo/);
    assert.doesNotMatch(calendarView, /\bdrafts\b|\bmanualTodos\b|草稿|手动待办/);
    assert.match(calendarView, /memoNotes\.map\(stickyNoteCard\)/);
    assert.match(calendarView, /promised\.map\(item => calendarTodoRow\(item\)\)/);
    assert.match(calendarView, /特别备注/);
    assert.match(calendarView, /页角随笔/);

    assert.doesNotMatch(contentManager, /calendar-draft|calendar-manual-todo|safePage\.drafts|safePage\.manualTodos/);
    assert.match(contentManager, /calendar-note/);
    assert.match(contentManager, /calendar-mood/);
});

test('r44 achievements normalize and render an unlock condition while legacy cache falls back safely', () => {
    const normalized = normalizeAchievements({
        title: '成就库',
        entries: [{
            id: 'ACH01',
            title: '同一把伞',
            description: '第一次把这段雨夜真正留进共同记忆。',
            category: '日常',
            tier: 'bronze',
            unlocked: true,
            unlockedAt: '2026/08/01',
            unlockCondition: '与纪时卿在雨夜共撑一把伞。',
            sourceMemoryIds: ['M001'],
            sourceMemoryAnchor: '站台雨伞',
        }],
    }, memoryBank);
    assert.equal(normalized.entries[0].unlockCondition, '与纪时卿在雨夜共撑一把伞。');

    const body = { innerHTML: '' };
    const title = { textContent: '' };
    const back = { hidden: true, textContent: '', setAttribute() {} };
    const previousDocument = globalThis.document;
    const previousSession = runtimeState.activeSession;
    const previousSnapshot = runtimeState.activeArchiveSnapshot;
    const previousReadOnly = runtimeState.activeArchiveReadOnly;
    globalThis.document = {
        querySelector(selector) {
            if (selector.endsWith(' .rmt-body')) return body;
            if (selector.endsWith(' .rmt-topbar-title')) return title;
            if (selector.includes('[data-rmt-action="back"]')) return back;
            return null;
        },
    };
    runtimeState.activeArchiveSnapshot = null;
    runtimeState.activeArchiveReadOnly = false;
    runtimeState.activeSession = {
        kind: 'achievements',
        title: '旧成就库',
        entries: [{
            id: 'LEGACY',
            title: '旧版成就',
            description: '旧缓存没有独立条件字段。',
            category: '关系',
            tier: 'silver',
            unlocked: true,
            unlockedAt: '08/01',
            sourceMemoryIds: ['M001'],
            sourceMemoryAnchor: '站台雨伞',
        }],
    };
    try {
        renderAchievements();
        assert.match(body.innerHTML, /解锁条件：站台雨伞/);
        assert.match(body.innerHTML, /解锁时间：08\/01/);
    } finally {
        runtimeState.activeSession = previousSession;
        runtimeState.activeArchiveSnapshot = previousSnapshot;
        runtimeState.activeArchiveReadOnly = previousReadOnly;
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
    }
});

test('r44 phone removes route and travel aliases before migration or plan minimums are evaluated', () => {
    const entry = id => ({ id: `${id}_E1`, title: `${id} 条目` });
    const apps = [
        { id: 'CHAT', label: '通讯', kind: 'chat', entries: [entry('CHAT')] },
        { id: 'MAP', label: '足迹', kind: 'map', entries: [entry('MAP')] },
        { id: 'MAPS', label: '地点簿', kind: 'maps', entries: [entry('MAPS')] },
        { id: 'NAV', label: '方向仪', kind: 'navigation', entries: [entry('NAV')] },
        { id: 'TRANSIT', label: '车次', kind: 'transit', entries: [entry('TRANSIT')] },
        { id: 'ROUTE', label: '足迹簿', kind: 'route', entries: [entry('ROUTE')] },
        { id: 'LABEL', label: '他的通勤路线', kind: 'misc', entries: [entry('LABEL')] },
        { id: 'WORK', label: '案件记录', kind: 'work', entries: [entry('WORK')] },
    ];
    const migrated = migrateLegacyPhoneSession({
        kind: 'phone',
        uiVersion: 2,
        deviceKind: 'phone',
        selectedAppId: 'MAP',
        selectedEntryId: 'MAP_E1',
        view: 'detail',
        apps,
    }, memoryBank);
    assert.deepEqual(migrated.apps.map(app => app.id), ['CHAT', 'WORK']);
    assert.equal(migrated.selectedAppId, 'CHAT');
    assert.equal(migrated.view, 'list');

    const planApps = ['CHAT', 'NOTES', 'WORK', 'BOOKS'].map((id, index) => ({
        id,
        label: id,
        kind: index === 0 ? 'chat' : index === 1 ? 'notes' : index === 2 ? 'work' : 'books',
        entries: [0, 1, 2].map(itemIndex => ({ id: `${id}_${itemIndex}`, title: `${id} ${itemIndex}` })),
    }));
    planApps.push({
        id: 'HIDDEN_ROUTE',
        label: '足迹',
        kind: 'navigation',
        entries: [0, 1, 2].map(itemIndex => ({ id: `R_${itemIndex}`, title: `路线 ${itemIndex}` })),
    });
    assert.throws(() => normalizePhonePlan({
        title: '他的私人终端',
        deviceName: '私人手机',
        deviceKind: 'phone',
        apps: planApps,
    }, memoryBank), /App 不足：4\/5/);
});
