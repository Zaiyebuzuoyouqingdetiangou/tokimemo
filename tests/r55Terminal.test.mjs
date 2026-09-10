import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhonePlan, normalizePhoneDraftApp, normalizePhone, phoneAppPrompt } from '../src/modes/phone.js';
import { safeErrorSummary } from '../src/core/text.js';

const summary = '晚间聊天，林舟问小雨：“明天还来吗？”小雨回答：“我会等你。”';
const bank = { characterName: '林舟', userName: '小雨', memories: [{ id: 'M001', title: '晚间聊天', anchors: ['晚间聊天'], summary }] };
const app = { id: 'CHAT', label: '通讯', kind: 'chat', entries: [{ id: 'C1', title: '晚间聊天' }] };
const entry = { id: 'C1', title: '晚间聊天', preview: '晚间聊天', detail: '', basis: '记忆', sourceMemoryIds: ['M001'],
    sourceMemoryAnchor: '晚间聊天', sourceMemoryEvidence: summary, contactName: '小雨', messages: [
        { speakerRole: 'owner', speaker: '林舟', text: '明天还来吗？' }, { speakerRole: 'contact', speaker: '小雨', text: '我会等你。' },
    ] };
test('r55 every device accepts a short proven conversation and reopens it intact', () => {
    for (const deviceKind of ['phone', 'watch', 'terminal', 'communicator', 'folio', 'relic', 'neutral']) {
        const normalized = normalizePhoneDraftApp({ id: 'CHAT', entries: [entry] }, app, bank, deviceKind);
        const session = normalizePhone({ deviceKind, apps: [normalized] }, bank);
        assert.equal(session.apps[0].entries[0].messages.length, 2);
        assert.deepEqual(normalizePhone(session, bank, { trustedStored: true }).apps[0].entries[0].messages, session.apps[0].entries[0].messages);
        assert.doesNotMatch(phoneAppPrompt({}, bank, { deviceKind }, app), /达到 (8|10|12) 条/);
    }
});
test('r55 source-dependent plan does not force a fabricated chat or arbitrary app count', () => {
    const plan = normalizePhonePlan({ deviceKind: 'folio', apps: [{ id: 'NOTES', kind: 'notes', entries: [{ id: 'N1' }] }] }, bank);
    assert.equal(plan.apps.length, 1);
    assert.equal(plan.apps[0].kind, 'notes');
});
test('r55 chat still rejects invented lines and one-sided dialogue', () => {
    assert.throws(() => normalizePhoneDraftApp({ id: 'CHAT', entries: [{ ...entry, messages: [{ ...entry.messages[0], text: '不存在的结婚宣言' }, entry.messages[1]] }] }, app, bank, 'folio'));
    assert.throws(() => normalizePhoneDraftApp({ id: 'CHAT', entries: [{ ...entry, messages: [entry.messages[0]] }] }, app, bank, 'folio'));
    assert.throws(() => normalizePhoneDraftApp({ id: 'CHAT', entries: [{ ...entry, basis: '设定', sourceSettingEvidence: summary }] }, app, bank, 'folio', null, { controlledEvidence: summary }));
});
test('r55 explicit unavailable records show no invented content and cannot make an entirely empty terminal succeed', () => {
    const missing = normalizePhoneDraftApp({ id: 'CHAT', entries: [{ id: 'C1', unavailable: true, detail: '<script>invented</script>' }] }, app, bank, 'folio');
    assert.equal(missing.entries[0].sourceStatus, 'unavailable');
    assert.doesNotMatch(JSON.stringify(missing), /invented|script/);
    assert.throws(() => normalizePhone({ deviceKind: 'folio', apps: [missing] }, bank), error => error.code === 'RMT_PHONE_SOURCE_EMPTY');
});
test('r55 partial terminal errors retain safe cause and progress, never arbitrary text', () => {
    const message = safeErrorSummary({ code: 'RMT_PHONE_DRAFT_AVAILABLE', message: 'private-body',
        partialProgress: { completed: 2, total: 5 }, failure: { code: 'RMT_CONNECTION_AUTH', status: 401, message: 'private-secret' } });
    assert.match(message, /2\/5/);
    assert.match(message, /认证/);
    assert.doesNotMatch(message, /private/);
});
