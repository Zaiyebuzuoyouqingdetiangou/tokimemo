// r84.166 · 模块生成时顺便写的生图字段：新任务 cgPromptDraft 必写、附人物外貌依据、给完整长度范例；
// 进行中的旧草稿沿用自己的方言和外貌快照，提示词不变；不增加请求。
import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './runtime-harness.mjs';

test('新任务：r84166 方言，外貌快照冻结在 operation 里', async () => {
    const h = await harness({ messages: 2, bundle: true });
    const policy = h.module('generation/cgPromptPolicy.js');
    const op = policy.cgRecoveryOperation('album', { kind: 'mode', mode: 'album' }, null, 'nai45-tags', 'char（岚）：short black hair, grey eyes');
    assert.equal(op.cgPromptDialect, 'r84166');
    assert.equal(op.cgCastLooks, 'char（岚）：short black hair, grey eyes');
    const origin = {};
    policy.bindCgPromptFormat(origin, op.cgPromptFormat, op.cgPromptDialect, op.cgCastLooks);
    const prompt = policy.cgPromptForSegment('BASE', { mode: 'album', taskKey: 't:album', origin });
    assert.match(prompt, /都必须同时写 imagePrompt 和 cgPromptDraft/);
    assert.match(prompt, /cgPromptDraft（必写）/);
    assert.equal(/可选cgPromptDraft|可选 cgPromptDraft/.test(prompt), false);
    assert.match(prompt, /UNTRUSTED_CAST_LOOKS: "char（岚）：short black hair, grey eyes"/);
    assert.match(prompt, /完整度参考/);
    assert.match(prompt, /不增加一次单独请求/);
});

test('没有外貌资料时不捏造；故事类模块同样必写', async () => {
    const h = await harness({ messages: 2, bundle: true });
    const policy = h.module('generation/cgPromptPolicy.js');
    const op = policy.cgRecoveryOperation('bedtime', { kind: 'mode', mode: 'bedtime' }, null, 'nai5-natural', '');
    assert.equal(op.cgPromptDialect, 'r84166');
    assert.equal('cgCastLooks' in op, false);
    const origin = {};
    policy.bindCgPromptFormat(origin, op.cgPromptFormat, op.cgPromptDialect, op.cgCastLooks || '');
    const prompt = policy.cgPromptForSegment('BASE', { mode: 'bedtime', taskKey: 't:bedtime:BED_night-C01', origin });
    assert.match(prompt, /没有用户确认的人物外貌资料/);
    assert.match(prompt, /写在chapter 对象/);
    assert.match(prompt, /cgPromptDraft（必写）/);
});

test('进行中的旧草稿：沿用原方言和外貌，操作摘要不变', async () => {
    const h = await harness({ messages: 2, bundle: true });
    const policy = h.module('generation/cgPromptPolicy.js');
    const old = { operation: { kind: 'mode', mode: 'album', cgPromptFormat: 'nai5-natural', cgPromptDialect: 'r8483' } };
    const op = policy.cgRecoveryOperation('album', { kind: 'mode', mode: 'album' }, old, 'nai45-tags', '新外貌');
    assert.equal(JSON.stringify(op), JSON.stringify(old.operation));
    const v2 = { operation: { kind: 'mode', mode: 'album', cgPromptFormat: 'nai5-natural', cgPromptDialect: 'r84166', cgCastLooks: '旧外貌' } };
    const again = policy.cgRecoveryOperation('album', { kind: 'mode', mode: 'album' }, v2, 'nai45-tags', '改过的外貌');
    assert.equal(JSON.stringify(again), JSON.stringify(v2.operation));
});
