import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from '../src/generation/jsonParser.js';

const example = '{"title":"示例","body":"示例正文"}';
const actual = { title: '实际回答', body: '真正的正文' };
const cut = '{"title":"实际回答","body":"尚未写完';
const fence = body => '```json\n' + body + '\n```';
const errorCode = code => error => error?.code === code;

test('完整 JSON 的字符串中含代码围栏仍按原文保留', () => {
    const value = { body: '引用\n```json\n{"example":true}\n```\n结束' };
    assert.deepEqual(extractJson(JSON.stringify(value)), value);
});
test('多个完整对象选择末尾实际回答', () => {
    assert.deepEqual(extractJson(example + '\n实际回答：' + JSON.stringify(actual)), actual);
});
test('完整示例后实际回答截断不能保存示例', () => {
    assert.throws(() => extractJson(example + '\n实际回答：' + cut), errorCode('RMT_JSON_TRUNCATED'));
});
test('围栏示例不能遮蔽后面截断的实际回答', () => {
    assert.throws(() => extractJson(fence(example) + '\n实际回答：' + cut), errorCode('RMT_JSON_TRUNCATED'));
});
test('后续未关闭围栏内的实际回答优先于前面的示例', () => {
    assert.throws(() => extractJson(example + '\n```json\n' + cut), errorCode('RMT_JSON_TRUNCATED'));
});
test('末尾实际回答的小格式错误应本地修复，不回退示例', () => {
    assert.deepEqual(extractJson(example + '\n实际回答：{"title":"实际回答","body":"真正的正文",}'), actual);
});
test('末尾实际回答的注释和中文引号仍可修补', () => {
    assert.deepEqual(extractJson(example + '\n实际回答：{/* 说明 */“title”:“实际回答”,“body”:“真正的正文”,}'), actual);
});
test('末尾完整但无效的实际回答不能回退示例', () => {
    assert.throws(() => extractJson(example + '\n实际回答：{"title":undefined}'), errorCode('RMT_JSON_INVALID'));
});
test('末尾实际对象的单引号与未引用 key 不能让前面示例冒充回答', () => {
    for (const malformed of ["{'title':'实际回答'}", '{title:"实际回答"}', '{标题:"实际回答"}', '{/* 说明 */title:"实际回答"}']) {
        assert.throws(() => extractJson(example + '\n实际回答：' + malformed), errorCode('RMT_JSON_INVALID'));
        assert.throws(() => extractJson(fence(example) + '\n实际回答：' + fence(malformed)), errorCode('RMT_JSON_INVALID'));
    }
});
test('末尾未引用 key 的截断对象不能回退示例', () => {
    assert.throws(() => extractJson(example + '\n实际回答：{title:"尚未写完'), errorCode('RMT_JSON_TRUNCATED'));
});
test('前文未配对大括号不妨碍独立 JSON 围栏', () => {
    assert.deepEqual(extractJson('说明中的 { 尚未配对\n' + fence(JSON.stringify(actual))), actual);
});
test('有效正文后的孤立说明括号不冒充新回答', () => {
    assert.deepEqual(extractJson(JSON.stringify(actual) + '\n说明符号：{'), actual);
    assert.deepEqual(extractJson(JSON.stringify(actual) + '\n附记 {说明}'), actual);
    assert.deepEqual(extractJson(JSON.stringify(actual) + '\n附记 {ordinary prose}'), actual);
});
test('真实截断仍保留截断分类，不补造正文', () => {
    assert.throws(() => extractJson(cut), errorCode('RMT_JSON_TRUNCATED'));
});
test('信件已完整正文和损坏可选小画的兼容路径保留', () => {
    const raw = '{"letters":[{"slot":"daily","title":"晚安","body":"今天也想和你说晚安。"}],"letterIllustrations":[{"svg":"';
    const value = extractJson(raw, { mode: 'inbox' });
    assert.equal(value.letters[0].body, '今天也想和你说晚安。');
});
