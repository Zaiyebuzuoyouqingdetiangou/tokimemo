import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as core_text from '../src/core/text.js';
import * as core_evidence from '../src/core/evidence.js';
import * as narrative_authority from '../src/core/narrativeAuthority.js';

// Evaluate the unchanged production module body against its actual pure collaborators.
// Only host/storage/network boundaries are supplied here; native ESM application
// cycles otherwise require the production bundle's module initialization order.
function loadIntel(overrides = {}) {
    const source = readFileSync(new URL('../src/extras/intel.js', import.meta.url), 'utf8');
    const names = [...source.matchAll(/^import \* as (\w+) from .+;$/gm)].map(match => match[1]);
    const modules = { core_text, core_evidence, narrative_authority, ...overrides };
    const body = source.replace(/^import .+;\n/gm, '').replace(/^export /gm, '');
    return new Function(...names, body + '\nreturn {normalizeIntel, askIntel, intelRecordForDisplay: typeof intelRecordForDisplay === "function" ? intelRecordForDisplay : null};')(...names.map(name => modules[name] || {}));
}
const memory = {chatId:'chat-a', archiveRevision:'r1', characterName:'甲', userName:'乙', memories:[
    {id:'M001',title:'公园散步',anchors:['一起走过公园'],summary:'甲和乙一起走过公园。'}
]};
const person = {name:'丙'};
const section = (text, extra = {}) => ({kind:'mention', text, sourceMemoryIds:[], ...extra});
const normal = (text, extra = {}) => loadIntel().normalizeIntel({scene:'街口',sections:[section(text, extra)]},memory,person);
const evidenceError = error => error?.code === 'RMT_INTEL_EVIDENCE';

test('无关记忆编号不能为虚构往事授权', () => {
    assert.throws(() => normal('他昨天向你求婚，你们已经订婚了。',{sourceMemoryIds:['M001']}), evidenceError);
});
test('空编号也不能把已完成的求婚降级成生活设定', () => {
    assert.throws(() => normal('他昨天向你求婚，你们已经订婚了。'), evidenceError);
});
test('真实但无关的 anchor 不能只填在隐藏字段里', () => {
    assert.throws(() => normal('昨天我们结婚了。',{sourceMemoryIds:['M001'],sourceMemoryAnchor:'一起走过公园'}), evidenceError);
});
test('正确编号与正文中的真实 anchor 可以通过', () => {
    const value = normal('他提起你们一起走过公园时，总会笑起来。',{sourceMemoryIds:['M001'],sourceMemoryAnchor:'一起走过公园'});
    assert.deepEqual(value.sections[0].sourceMemoryIds,['M001']);
    assert.equal(value.sections[0].sourceMemoryAnchor,'一起走过公园');
});
test('可见真实 anchor 不能为同段另一个无关求婚往事授权', () => {
    for (const separator of ['。', '，']) {
        assert.throws(() => normal(`你们一起走过公园${separator}昨天他向你求婚了。`,
            { sourceMemoryIds:['M001'], sourceMemoryAnchor:'一起走过公园' }), evidenceError);
    }
});
test('逗号后省略的共同主语仍不能掩护新历史', () => {
    for (const text of ['你们一起走过公园，昨天还交换了戒指。','你们一起走过公园，昨天还结婚了。']) {
        assert.throws(() => normal(text,{sourceMemoryIds:['M001'],sourceMemoryAnchor:'一起走过公园'}),evidenceError);
    }
});
test('包裹真实 anchor 的回忆和日期不被当成新事件', () => {
    for (const text of ['我还记得你们一起走过公园的那天，他看起来很开心。',
        '他每次想起你们一起走过公园的那天，都会忍不住笑。',
        '我还记得那天你们一起走过公园，他看起来很开心。']) {
        assert.equal(normal(text,{sourceMemoryIds:['M001'],sourceMemoryAnchor:'一起走过公园'}).sections[0].text,text);
    }
    assert.throws(() => normal('我还记得你们一起走过公园的那天，昨天还交换了戒指。',
        {sourceMemoryIds:['M001'],sourceMemoryAnchor:'一起走过公园'}),evidenceError);
});
test('同一已引用记忆的其他完整 anchor 仍可叙述，不必反复写首个 anchor', () => {
    const boundMemory = structuredClone(memory);
    boundMemory.memories[0].anchors.push('你们在桥上交换了礼物');
    const text = '你们一起走过公园。你们在桥上交换了礼物。他希望明天再和你散步。';
    const value = loadIntel().normalizeIntel({sections:[section(text,
        {sourceMemoryIds:['M001'],sourceMemoryAnchor:'一起走过公园'})]},boundMemory,person);
    assert.equal(value.sections[0].text,text);
});
test('未引用记忆的真实 anchor 不能替当前引用覆盖无关历史', () => {
    const otherMemory = structuredClone(memory);
    otherMemory.memories.push({id:'M002',title:'求婚',anchors:['昨天他向你求婚了']});
    assert.throws(() => loadIntel().normalizeIntel({sections:[section('你们一起走过公园。昨天他向你求婚了。',
        {sourceMemoryIds:['M001'],sourceMemoryAnchor:'一起走过公园'})]},otherMemory,person),evidenceError);
});
test('已引用往事旁的当下观察、未来建议及角色独立过去继续保留', () => {
    for (const extra of ['他看起来很在意你的想法。','以后他希望向你求婚。','明天可以再一起去散步。','他昨天独自去海边看了日落。',
        '昨天他独自去海边看了日落。','昨晚她一个人看了电影。','昨天甲独自去海边看了日落。','去年我独自去过海边。']) {
        for (const separator of ['。','，']) {
            const text=`你们一起走过公园${separator}${extra}`;
            assert.equal(normal(text,{sourceMemoryIds:['M001'],sourceMemoryAnchor:'一起走过公园'}).sections[0].text,text);
        }
    }
    assert.throws(() => normal('你们一起走过公园，昨晚我和你交换了戒指。',
        {sourceMemoryIds:['M001'],sourceMemoryAnchor:'一起走过公园'}),evidenceError);
});
test('anchor 的空格差异沿用已有匹配规则', () => {
    const text='你们一起 走过 公园。明天可以再去走走。';
    assert.equal(normal(text,{sourceMemoryIds:['M001'],sourceMemoryAnchor:'一起走过公园'}).sections[0].text,text);
});
test('普通当下观察与未来建议不强制引用往事', () => {
    for(const text of ['他看起来很在意你的想法。','如果你想见他，明天可以一起去散步。','他希望以后向你求婚。','这件事我不清楚。']) {
        assert.equal(normal(text).sections[0].text,text);
    }
});
test('普通 advice 不添加额外的证据要求', () => {
    const value=loadIntel().normalizeIntel({sections:[{kind:'advice',text:'明天可以去问问他的想法。',sourceMemoryIds:[]}]},memory,person);
    assert.equal(value.sections[0].kind,'advice');
});
test('建议字段不能夹带未验证的共同往事', () => {
    assert.throws(()=>loadIntel().normalizeIntel({sections:[{kind:'advice',text:'你们昨天结婚了，明天去旅行吧。'}]},memory,person),evidenceError);
});
test('旧记录保留可读且不再冒充验证通过，不原地修改', () => {
    const old={id:'old',sections:[section('他昨天向你求婚，你们已经订婚了。',{sourceMemoryIds:['M001']})]};
    const previous=structuredClone(old);
    const display=loadIntel().intelRecordForDisplay(old,memory);
    assert.equal(display.sections[0].text,old.sections[0].text);
    assert.deepEqual(display.sections[0].sourceMemoryIds,[]);
    assert.equal(display.sections[0].evidenceState,'unverified');
    assert.deepEqual(old,previous);
});
test('旧记录里的混合虚构往事保持原文且不继续显示为 verified', () => {
    const old={evidenceVersion:1,sections:[section('你们一起走过公园。昨天他向你求婚了。',
        {sourceMemoryIds:['M001'],sourceMemoryAnchor:'一起走过公园'})]};
    const previous=structuredClone(old);
    const display=loadIntel().intelRecordForDisplay(old,memory);
    assert.equal(display.sections[0].evidenceState,'unverified');
    assert.equal(display.sections[0].text,old.sections[0].text);
    assert.deepEqual(old,previous);
});
test('新有效记录显示仍重新核对当前档案', () => {
    const result=normal('你们一起走过公园。',{sourceMemoryIds:['M001'],sourceMemoryAnchor:'一起走过公园'});
    assert.equal(loadIntel().intelRecordForDisplay(result,memory).sections[0].evidenceState,'verified');
    assert.equal(loadIntel().intelRecordForDisplay(result,{...memory,memories:[]}).sections[0].evidenceState,'unverified');
});
test('旧情报的界面不再显示假依据标记', () => {
    const source=readFileSync(new URL('../src/ui/extrasView.js',import.meta.url),'utf8');
    const helpers=source.slice(source.indexOf('function sourceChips('),source.indexOf('function renderIntel('));
    const render=new Function('esc',helpers+'\nreturn intelSourceChips;')(core_text.esc);
    const old={sections:[section('昨天我们结婚了。',{sourceMemoryIds:['M001']})]};
    const display=loadIntel().intelRecordForDisplay(old,memory);
    const html=render(display.sections[0]);
    assert.match(html,/旧情报 · 依据未核实/);
    assert.doesNotMatch(html,/依据 M001|生活设定/);
    assert.match(render({kind:'advice',evidenceState:'none',sourceMemoryIds:[]}),/建议 · 不写入档案/);
});
test('校验失败的付费结果仅保留原始待检查，不作为有效记录保存', async () => {
    const stages=[]; let saves=0;
    const raw={sections:[section('他昨天向你求婚，你们已经订婚了。',{sourceMemoryIds:['M001']})]};
    const context={name1:'乙',name2:'甲'};
    const api=loadIntel({
        core_context:{currentCharacterGuard:()=>context,captureTaskOrigin:()=>({chatId:'chat-a',archiveRevision:'r1'})},
        archive_repository:{requireArchive:()=>memory},
        core_constants:{MODE:{RELATIONS:'relations'}},
        core_cache:{loadSession:()=>({relationships:[{name:'丙'}]})},
        modes_relations:{relationsViewIdentity:()=>({})},
        generation_prompts:{promptSafetyBoundary:()=>'',promptArchiveSlice:()=>''},
        generation_client:{requestJson:async()=>raw},
        extras_store:{extrasScope:()=> 'scope-a',readExtras:()=>({}),stageExtraResult:item=>{stages.push(item);return {durable:true};},extraRecordId:()=> 'intel-1',retryExtraSave:async()=>{saves++;}},
    });
    const result=await api.askIntel('丙');
    assert.equal(result.pending,true);
    assert.equal(result.record,null);
    assert.equal(stages.length,1);
    assert.equal(stages[0].raw,raw);
    assert.equal(stages[0].record,undefined);
    assert.equal(saves,0);
});
