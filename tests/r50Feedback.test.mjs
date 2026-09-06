import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExcludedTags, stripExcludedTags, filterJsonPromptStrings, scanContextTags } from '../src/core/contextTags.js';
import { derivedExpansionMemoryIds, incrementalArchiveMemoryIds, stampIncrementalCoverage } from '../src/core/incremental.js';
import { advEvidenceKey, mergeAdvIncremental, advImportantIndexPrompt } from '../src/modes/advEvent.js';
import { albumEvidenceKey } from '../src/modes/album.js';
import { endingRouteEvidenceKey, mergeEndingIncremental } from '../src/modes/ending.js';
import { assertButterflyRelationshipSafety } from '../src/modes/butterfly.js';
import { normalizeCabinet, mergeCabinet, cabinetHtml } from '../src/modes/cabinet.js';
import { normalizeSettingRelationships, mergeRelationLayers, relationGardenHtml } from '../src/modes/relations.js';
import { endingEasterEggPopupHtml } from '../src/ui/endingView.js';
import { normalizeRoom } from '../src/modes/room.js';
import { safeErrorSummary } from '../src/core/text.js';
import { resolveThemePalette, contrastRatio } from '../src/core/theme.js';
import { readMemorySourceLedger, setMemorySourceLedgerBackendForTests } from '../src/archive/sourceLedger.js';

const bank = { archiveName: '河岸', archiveRevision: 'rev-A', characterName: '林舟', userName: '小雨',
    memories: [{ id: 'M001', title: '一起留下车票', anchors: ['一起留下车票'], summary: '林舟和小雨一起把回程车票放进盒子，留作两人的纪念。', participants: ['林舟', '小雨'] }] };

test('r50 derived expansion reuses evidence without resetting coverage or mutating history', () => {
    const before = structuredClone(bank), old = stampIncrementalCoverage({ kind: 'adv', events: [] }, null, bank, 'mode', [], 1);
    assert.deepEqual(incrementalArchiveMemoryIds(old, bank), []);
    assert.deepEqual(derivedExpansionMemoryIds(old, bank), ['M001']);
    assert.deepEqual(bank, before);
    assert.match(advImportantIndexPrompt({ name1: '小雨', name2: '林舟' }, bank, old, ['M001']), /用户主动扩写/);
});

test('r50 ADV revisits preserve completed original while deduping identical expansion evidence', () => {
    const event = { id: 'EV01', title: '旧镜头', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '一起留下车票', adv: { paragraphs: ['旧正文'] }, imageUrl: 'local-image' };
    const fresh = { ...event, id: 'EV01', title: '新侧面', expansionRound: 1, adv: null };
    const previous = { kind: 'adv', events: [event] };
    const merged = mergeAdvIncremental(previous, { events: [fresh, fresh] }, bank);
    assert.equal(merged.events.length, 2);
    assert.deepEqual(merged.events[0], event);
    assert.notEqual(advEvidenceKey(event), advEvidenceKey(fresh));
});

test('r50 butterfly permits negation and adjacent user antecedent, still rejects third parties', () => {
    for (const text of ['我并未爱上别人。', '我看见你成了我的妻子，婚姻使我懂得责任。']) assert.doesNotThrow(() => assertButterflyRelationshipSafety(text));
    for (const text of ['我爱上了别人。', '我与你看海，后来与小花结婚。', '我看见你。我的婚姻使我懂得责任。', '我并未爱上你而爱上别人。']) assert.throws(() => assertButterflyRelationshipSafety(text));
});

test('r50 cabinet only admits literal shared objects and renders evidence inertly', () => {
    const item = { name: '车票', objectEvidence: bank.memories[0].summary, sourceMemoryIds: ['M001'], sourceMemoryAnchor: '一起留下车票' };
    const session = normalizeCabinet({ items: [item, { ...item, name: '钻戒' }, { ...item, sourceMemoryIds: ['M777'] }] }, bank);
    assert.equal(session.items.length, 1);
    assert.equal(normalizeCabinet({ items: [] }, bank).items.length, 0);
    assert.equal(mergeCabinet(session, session).items.length, 1);
    const thirdParty = { ...bank, memories: [{ ...bank.memories[0], summary: '阿南送给小兰一张车票。', participants: ['阿南', '小兰'] }] };
    assert.equal(normalizeCabinet({ items: [{ ...item, objectEvidence: thirdParty.memories[0].summary }] }, thirdParty).items.length, 0);
    assert.match(cabinetHtml(session), /车票/);
    assert.doesNotMatch(cabinetHtml({ items: [{ ...session.items[0], name: '<img onerror=x>' }] }), /<img onerror/);
});

test('r50 selected setting NPCs need exact entry identity and never turn history books into fixed relationships', () => {
    const entry = { world: '配角', uid: '5', content: '阿南是城中的木匠，还没有见过林舟。' };
    const npc = { name: '阿南', sourceWorld: '配角', sourceUid: '5', sourceEvidence: entry.content, npcPerspective: '我每天都在店里做木工。' };
    const accepted = normalizeSettingRelationships([npc], [entry]);
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0].settingOnly, true);
    assert.deepEqual(normalizeSettingRelationships([npc], [{ ...entry, historySource: true }]), []);
    assert.deepEqual(normalizeSettingRelationships([{ ...npc, name: '陌生人' }], [entry]), []);
    assert.deepEqual(normalizeSettingRelationships([npc], [{ ...entry, world: '聊天B' }]), []);
    assert.deepEqual(normalizeSettingRelationships([npc], [entry], { name2: '阿南' }), []);
    const layers = mergeRelationLayers(accepted, [{ name: '阿南', summary: '已见面' }]);
    assert.equal(layers.length, 1);
    assert.equal(layers[0].dynamic.summary, '已见面');
});

test('r50 tag filtering handles nested, quoted, encoded, self-closing, malformed and unclosed inputs', () => {
    const tags = ['thinking'];
    for (const source of ['A<THINKING a=">">secret</THINKING>B', 'A<thinking><x>secret</x></thinking>B', 'A&amp;lt;thinking&amp;gt;secret&amp;lt;/thinking&amp;gt;B', 'A<thinking/>B']) {
        assert.equal(stripExcludedTags(source, tags), 'AB');
    }
    assert.equal(stripExcludedTags('A<thinking><x>secret</thinking>still hidden', tags), 'A');
    assert.equal(stripExcludedTags('A<thinking>hidden forever', tags), 'A');
    assert.equal(stripExcludedTags('A<thinking', tags), 'A');
    assert.equal(stripExcludedTags('A&lt;thinking attr', tags), 'A');
    assert.equal(stripExcludedTags('A&lt;scene&gt;kept&lt;/scene&gt;&amp;B', tags), 'A&lt;scene&gt;kept&lt;/scene&gt;&amp;B');
    assert.equal(stripExcludedTags('A<thinking>kept</thinking>', []), 'A<thinking>kept</thinking>');
    assert.deepEqual(normalizeExcludedTags('<Thinking>, thinking, ../bad, UPDATEVARIABLE'), ['thinking', 'updatevariable']);
    assert.equal(normalizeExcludedTags(Array.from({ length: 40 }, (_, i) => 'tag' + i)).length, 32);
});

test('r50 a crowded garden keeps off-map NPCs selectable instead of silently dropping them', () => {
    const people = Array.from({ length: 25 }, (_, i) => ({ name: '配角' + String(i).padStart(2, '0'), npcPerspective: '我在木工店工作。' }));
    const html = relationGardenHtml({ characterName: '林舟', sharedRelations: people, selectedKey: '配角24' });
    assert.match(html, /全部 25 人/);
    assert.match(html, /NPC视角/);
    assert.equal((html.match(/class="rmt-relation-node /g) || []).length, 18);
    assert.match(html, /配角24/);
});

test('r50 tag filtering in prompt JSON cannot eat adjacent fields or local instructions', () => {
    const source = { text: 'before<thinking>unclosed', following: 'retain this' };
    const encoded = filterJsonPromptStrings(JSON.stringify(source), ['thinking']);
    assert.deepEqual(JSON.parse(encoded), { text: 'before', following: 'retain this' });
    assert.equal(source.text, 'before<thinking>unclosed');
    assert.deepEqual(JSON.parse(filterJsonPromptStrings('{"<thinking>":"value"}', ['thinking'])), { '<thinking>': 'value' });
    const chat = [{ mes: '<thinking>secret</thinking><scene>x</scene>' }];
    const copy = structuredClone(chat);
    assert.deepEqual(scanContextTags(chat).tags, [{ name: 'thinking', count: 1 }, { name: 'scene', count: 1 }]);
    assert.deepEqual(chat, copy);
});

test('r50 album and ending reuse evidence without collapsing new variants or escalating the relationship', () => {
    const old = { id: 'E1', type: 'route', title: '旧篇', available: true, unlocked: true, sourceMemoryIds: ['M001'], sourceMemoryAnchor: '一起留下车票', endingScene: '相识之后一起留下车票。'.repeat(45), epilogue: { scenes: [1,2,3].map(n => ({ title: String(n), text: '在未来的想象中慢慢散步。'.repeat(12) })) } };
    const fresh = { ...old, title: '新篇', expansionRound: 1 };
    assert.notEqual(albumEvidenceKey(old), albumEvidenceKey(fresh));
    assert.notEqual(endingRouteEvidenceKey(old), endingRouteEvidenceKey(fresh));
    const previous = { kind: 'ending', endings: [old, ...['romance','reverse','bond','open'].map((type, i) => ({ ...old, type, id: 'E' + (i+2), title: type }))], relationshipState: '相识', relationshipSummary: '刚刚相识', relationshipSourceMemoryIds: ['M001'], relationshipSourceMemoryAnchor: '一起留下车票', confessionReplays: [] };
    const result = mergeEndingIncremental(previous, { endings: [fresh], relationshipState: '结婚', relationshipSummary: '编造新进展' }, [], [], bank, true);
    assert.equal(result.session.endings.length, 6);
    assert.equal(result.session.relationshipState, '相识');
    assert.equal(result.session.relationshipSummary, '刚刚相识');
    assert.equal(result.session.endings[0].endingScene, old.endingScene);
    assert.equal(result.session.endings.at(-1).expansionRound, 1);
    const locked = { ...old, type: 'romance', id: 'LOCK', title: '不能解锁', available: false, unlockHint: '尚无新证据' };
    previous.endings.push(locked);
    const blocked = mergeEndingIncremental(previous, { endings: [{ ...locked, available: true }], relationshipState: '相识', relationshipSummary: '刚刚相识' }, [], [], bank, true);
    assert.equal(blocked.session.endings.find(item => item.id === 'LOCK').available, false);
    assert.equal(blocked.added, 0);
});

test('r50 four hidden modules have distinct structures and four local actionable triggers', () => {
    for (const [moduleType, cls] of [['heartbeat_console', 'oscilloscope'], ['memory_constellation', 'constellation'], ['signal_lighthouse', 'lighthouse'], ['letter_archive', 'drawers']]) {
        const html = endingEasterEggPopupHtml({ id: moduleType, title: '告白', easterEgg: { moduleType, motif: '<script>x</script>' } });
        assert.match(html, new RegExp('rmt-easter-' + cls));
        for (const action of ['pulse', 'reveal', 'toggle', 'stabilize']) assert.match(html, new RegExp('data-rmt-action="ending-easter-' + action + '"'));
        assert.doesNotMatch(html, /<script>/);
    }
});

test('r50 room local failures have actionable safe codes, never echo source details', () => {
    try { normalizeRoom({ spaces: [] }, bank); assert.fail(); }
    catch (error) {
        assert.equal(error.code, 'RMT_ROOM_STRUCTURE');
        assert.doesNotMatch(safeErrorSummary(error), /hidden|敏感详情/);
    }
});

test('r50 night and conflicting custom colours keep body and card copy readable', () => {
    for (const settings of [{ themeMode: 'night' }, { themeMode: 'custom', themeCustom: { background: '#101820', surface: '#ffffff', text: '#ffffff' } }, { themeMode: 'custom', themeCustom: { background: '#6e6e6e', surface: '#bebebe' } }]) {
        const { palette } = resolveThemePalette(settings);
        assert.ok(contrastRatio(palette.text, palette.background) >= 4.5);
        assert.ok(contrastRatio(palette.text, palette.surface) >= 4.5);
        assert.ok(contrastRatio(palette.muted, palette.surface) >= 4.5);
    }
});

test('r50 a synchronous IndexedDB open failure is retryable on the next explicit read', async () => {
    const old = globalThis.indexedDB;
    let attempts = 0;
    setMemorySourceLedgerBackendForTests(null);
    globalThis.indexedDB = { open() { attempts++; throw new DOMException('disabled', 'InvalidStateError'); } };
    try {
        const scope = { characterKey: 'a.png', characterName: 'A', chatId: 'chat-A' };
        await assert.rejects(readMemorySourceLedger(scope));
        await assert.rejects(readMemorySourceLedger(scope));
        assert.equal(attempts, 2);
    } finally { globalThis.indexedDB = old; setMemorySourceLedgerBackendForTests(null); }
});
