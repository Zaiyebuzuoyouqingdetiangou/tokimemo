import { normalizeDialogueRows } from '../src/core/dialogue.js';
import { renderHeartScriptLines } from '../src/ui/heartView.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { roomFigureSvg, roomInteriorHtml } from '../src/ui/roomInterior.js';
import { butterflySubjectName } from '../src/modes/butterfly.js';
test('local pixel figures retain profile differences and reject arbitrary markup', () => {
    const silverRobe = { hairTone: 'silver', hairShape: 'long', outfit: 'robe', build: 'slender' };
    const original = structuredClone(silverRobe);
    const a = roomFigureSvg(silverRobe);
    const b = roomFigureSvg({ hairTone: 'black', hairShape: 'short', outfit: 'combat', build: 'broad' });
    assert.notEqual(a, b); assert.match(a, /shape-rendering="crispEdges"/);
    assert.deepEqual(silverRobe, original);
    assert.doesNotMatch(roomFigureSvg({ hairTone: '"><script>alert(1)</script>', outfit: 'url(evil)' }), /script|url\(/);
});
test('shared room keeps every actual person and the existing speech actions', () => {
    const html = roomInteriorHtml([], { participants: [ { id: 'p1', name: '甲', figure: { outfit: 'robe' } }, { id: 'p2', name: '乙', figure: { outfit: 'combat' } } ] });
    assert.match(html, /data-rmt-participant-id="p1"/); assert.match(html, /data-rmt-participant-id="p2"/);
    assert.equal((html.match(/data-rmt-action="room-participant"/g) || []).length, 2);
});
test('butterfly display names use selected people, without banning legitimate single-card names', () => {
    const memory = { characterName: '群像故事', userName: '用户', participantsV1: { version: 1, cardType: 'multi', revision: '', people: [{ id: 'a', name: '真名甲', sourceRefs: [] }, { id: 'b', name: '真名乙', sourceRefs: [] }], selectedIds: ['b'] } };
    assert.equal(butterflySubjectName(memory, { name2: '群像故事' }), '真名乙');
    assert.equal(butterflySubjectName({ characterName: '单人真名' }, { name2: '单人真名' }), '单人真名');
});

test('two selected character names survive normalize-save-render without collapsing to the card title', () => {
    const identities = { characterName: '真名甲', characterAliases: ['真名甲', '真名乙'], userName: '用户' };
    const first = normalizeDialogueRows([{ speaker: 'char', speakerName: '真名乙', text: '今晚先把灯留着。' }], identities);
    assert.equal(first[0].speakerName, '真名乙');
    const reopened = normalizeDialogueRows(JSON.parse(JSON.stringify(first)), identities);
    assert.equal(reopened[0].speakerName, '真名乙');
    const html = renderHeartScriptLines(reopened, { ...identities, charAvatar: '', userAvatar: '' });
    assert.match(html, /<small>真名乙<\/small>/);
    const forged = normalizeDialogueRows([{ speaker: 'char', speakerName: '未知名字', text: '今晚先把灯留着。' }], identities);
    assert.equal(forged[0].speaker, 'narrator');
});
