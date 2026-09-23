import assert from 'node:assert/strict';
import { countPendingGenerationItems, generationCompletionHtml } from '../src/ui/generationCompletion.js';

assert.equal(generationCompletionHtml({ missing: 0, action: 'phone-fill-missing' }), '');
assert.equal(generationCompletionHtml({ missing: -2, generateMode: 'album' }), '');
assert.equal(countPendingGenerationItems([{ progressPending: ['x'] }, {}, { progressPending: [] }]), 1);

const phone = generationCompletionHtml({
    missing: 2, unit: '条记录', action: 'phone-fill-missing', label: '重试未完成项',
    message: '已有 <安全> 内容。', className: 'rmt-phone-completion',
});
assert.match(phone, /data-rmt-generation-missing="2"/);
assert.match(phone, /data-rmt-action="phone-fill-missing"/);
assert.match(phone, /已有 &lt;安全&gt; 内容。/);
assert.doesNotMatch(phone, /<安全>|undefined/);

const season = generationCompletionHtml({
    missing: 1, action: 'heart-generate-season', actionData: { 'data-rmt-heart-season-target': 'spring' },
});
assert.match(season, /data-rmt-action="heart-generate-season"/);
assert.match(season, /data-rmt-heart-season-target="spring"/);
assert.doesNotMatch(generationCompletionHtml({ missing: 1, action: 'not valid!' }), /<button/);
assert.match(phone, /<h3>生成与补全<\/h3>/);

console.log('generation-completion-ok');
