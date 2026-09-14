import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiagnosticReport, diagnosticReportText } from '../src/core/diagnosticReport.js';
import * as tt from '../src/core/taskTrace.js';
import { writeCastLooks } from '../src/core/castLooks.js';

const SECRETS = ['sk-ABCDEF123456', 'Bearer tok_secret', '绝密聊天正文', '谢晦川爱喝冰美式', '你是一个角色扮演助手'];

function install() {
    const meta = {};
    globalThis.location = { protocol: 'http:', hostname: '127.0.0.1', href: 'http://127.0.0.1:8000/?api_key=sk-ABCDEF123456' };
    globalThis.SillyTavern = { getContext: () => ({
        chatMetadata: meta, name1: '江一帆', name2: '谢晦川', groupId: null,
        chat: [{ mes: SECRETS[2] }, { mes: SECRETS[3] }],
        getCurrentChatId: () => 'chat-A', saveMetadataDebounced() {},
        getCharacterCardFields: () => ({ description: SECRETS[3] }),
        getWorldInfoPrompt: () => {}, ConnectionManagerRequestService: {},
    }) };
    meta.heartbeatMemoriesArchiveV3 = { chatId: 'chat-A', memories: [{ id: 'M001', summary: SECRETS[2] }] };
    return meta;
}

test('the report carries the stage trail a stuck import needs', () => {
    install();
    tt.clearTaskTrace();
    try {
        const entry = tt.startTaskTrace('archive-import:chat-A', 'archive');
        for (const stage of ['prompt', 'request', 'response', 'parse', 'validate']) tt.markStage(entry, stage);
        tt.markChunks(entry, { total: 10, ok: 8, pending: 2 });
        tt.markStage(entry, 'profile', false);
        tt.endTaskTrace(entry, 'failed', { code: 'RMT_RECOVERY_INPUT_CHANGED', message: SECRETS[0] });

        const report = buildDiagnosticReport();
        const task = report.recentTasks.at(-1);
        assert.equal(task.outcome, 'failed');
        assert.equal(task.code, 'RMT_RECOVERY_INPUT_CHANGED');
        assert.deepEqual(task.chunks, { total: 10, ok: 8, failed: 0, pending: 2 });
        // The trail must show validate succeeded and profile is where it stopped.
        assert.ok(task.stages.some(s => s.startsWith('validate@')));
        assert.ok(task.stages.some(s => s.startsWith('profile!@')));
        assert.equal(report.storage.hasArchive, true);
        assert.equal(report.storage.memoryCount, 1);
    } finally { delete globalThis.SillyTavern; }
});

test('the report never carries chat, card, prompt, key or full url', () => {
    install();
    tt.clearTaskTrace();
    try {
        writeCastLooks(null, { char: '黑色短发，银丝眼镜', user: '棕色短发', manual: true }, 'chat-A');
        const entry = tt.startTaskTrace('x', 'archive');
        tt.endTaskTrace(entry, 'failed', { code: 'RMT_JSON_NOT_FOUND', message: SECRETS[1] });
        const text = diagnosticReportText();
        for (const secret of SECRETS) assert.ok(!text.includes(secret), `泄漏: ${secret}`);
        assert.ok(!text.includes('api_key'), '不得包含完整 href');
        // Appearance is reported as lengths and flags, never as text.
        assert.ok(!text.includes('银丝眼镜'), '不得包含外貌正文');
        assert.match(text, /"manual": true/);
    } finally { delete globalThis.SillyTavern; }
});

test('an uncoded failure is still reported as a stage, not as free text', () => {
    install();
    tt.clearTaskTrace();
    try {
        const entry = tt.startTaskTrace('y', 'room');
        tt.endTaskTrace(entry, 'failed', { message: '某个未分类异常的原文' });
        const task = buildDiagnosticReport().recentTasks.at(-1);
        assert.equal(task.code, 'RMT_UNCODED');
        assert.ok(!diagnosticReportText().includes('某个未分类异常的原文'));
    } finally { delete globalThis.SillyTavern; }
});
