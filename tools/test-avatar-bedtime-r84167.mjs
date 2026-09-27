// r84.167 · 用户头像按 Persona 找（以前按角色头像找，坏图在 iPhone 上显示成问号）；
// 睡前故事插画做成绘本页，放在章节标题下、正文之前。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { harness } from './runtime-harness.mjs';

test('Persona 头像：缩略图类型 persona，拿不到时回退 User Avatars', async () => {
    const h = await harness({ messages: 2, bundle: true });
    const av = h.module('ui/archiveAvatars.js');
    const seen = [];
    const ctx = { getThumbnailUrl: (type, file) => { seen.push(type); return `/thumbnail?type=${type}&file=${encodeURIComponent(file)}`; } };
    assert.equal(av.personaAvatarUrl('user-default.png', ctx), '/thumbnail?type=persona&file=user-default.png');
    assert.deepEqual([...seen], ['persona']);
    assert.equal(av.personaAvatarUrl('me.png', {}), '/User%20Avatars/me.png');
    assert.equal(av.personaAvatarUrl('', ctx), '');
});

test('角色互动对白和聊天里的信都用 Persona 头像，不再按角色头像找用户', async () => {
    for (const file of ['../src/ui/heartView.js', '../src/ui/autoMemoryShell.js']) {
        const src = await readFile(new URL(file, import.meta.url), 'utf8');
        assert.match(src, /archive_avatars\.personaAvatarUrl\(/, file);
        assert.equal(/characterAvatarUrl\((file|userFile), context\) \|\| archive_avatars\.userAvatarUrl/.test(src), false, file);
    }
});

test('睡前故事：插画在正文之前，绘本页样式存在', async () => {
    const src = await readFile(new URL('../src/ui/bedtimeView.js', import.meta.url), 'utf8');
    const i = src.indexOf('bedtimePlate(expanded_cg_view.expandedCgHtml(');
    assert.ok(i > 0);
    assert.ok(i < src.indexOf('${paragraphs(chapter.text)}', i), '插画要在正文前');
    const h = await harness({ messages: 2, bundle: true });
    const css = h.module('ui/bedtimeView.js').bedtimeCss();
    assert.ok(css.includes('.rmt-bedtime-plate{'));
    assert.ok(css.includes('.rmt-bedtime-chapter>p:first-of-type::first-letter{'));
});
