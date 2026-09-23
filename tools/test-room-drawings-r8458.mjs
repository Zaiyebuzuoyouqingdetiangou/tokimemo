import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_OBJECT_DRAWINGS, roomDrawingKind } from '../src/ui/roomObjectDrawing.js';
import { roomInteriorHtml } from '../src/ui/roomInterior.js';

test('actual object nouns produce different silhouettes instead of generic boxes', () => {
    const cases = [
        ['自编麻绳猫窝与草垫','petBed'], ['编绳小竹篓','basket'], ['爆改过的逐璧剑','sword'],
        ['便携式医疗急救箱','medical'], ['重型防暴单扇钢门','door'], ['铸铁转角扶手楼梯','stairs'],
        ['七弦古琴','zither'], ['琴房里的钢琴','piano'], ['外袍衣架','rack'], ['草垫','mat'],
        ['铜镜','mirror'], ['绘画卷轴','scroll'], ['装水的瓷碗','bowl'], ['细颈花瓶','vase'],
        ['贴墙的长矛','spear'], ['擦亮的刀','saber'], ['旧相机','camera'],
    ];
    for (const [label, kind] of cases) assert.equal(roomDrawingKind(label, 'other'), kind, label);
    assert.equal(new Set(cases.map(([,kind]) => ROOM_OBJECT_DRAWINGS[kind])).size, cases.length);
    const layout = cases.slice(0,6).map(([label],index)=>({ id:'o'+index, item:{label}, visualKind:'other', number:index+1 }));
    const original = structuredClone(layout);
    const html = roomInteriorHtml(layout);
    for (const [,kind] of cases.slice(0,6)) assert.ok(html.includes(`data-rmt-furniture="${kind}"`));
    assert.deepEqual(layout, original);
});

test('location prefixes do not turn the named object into unrelated furnishings', () => {
    assert.equal(roomDrawingKind('窗边的椅子', 'window', { window:'',seat:'' }), 'seat');
    assert.equal(roomDrawingKind('椅子旁的竹篓', 'seat', { seat:'' }), 'basket');
    assert.equal(roomDrawingKind('猫窝旁的木剑', 'pet'), 'sword');
    assert.equal(roomDrawingKind('书房靠墙的书柜', 'storage', { shelf:'' }), 'shelf');
});

test('unknown objects remain unknown, and labels cannot inject SVG code', () => {
    assert.equal(roomDrawingKind('某个没有描述形状的旧物', 'invented-geometry'), 'other');
    const html = roomInteriorHtml([{ id:'a\" onclick=\"bad', visualKind:'<image href="https://bad">', item:{label:'<script>alert(1)</script>'} }]);
    assert.match(html,/data-rmt-furniture="other"/);
    assert.doesNotMatch(html,/<script|<image| onclick="bad|M-35 20 5 3l40 17/);
    assert.match(html,/&lt;script&gt;/);
});

test('every selected existing item remains reachable after the former forty-item cutoff', () => {
    const layout=Array.from({length:49},(_,index)=>({ id:'item-'+(index+1), number:index+1, visualKind:'book', item:{label:'书卷'+(index+1)} }));
    for (const selected of [1, 7, 40, 41, 49]) {
        const html=roomInteriorHtml(layout,{selectedId:'item-'+selected});
        assert.match(html,new RegExp(`data-rmt-room-id="item-${selected}" aria-pressed="true"`));
        assert.match(html,new RegExp(`aria-label="${selected}\\. 书卷${selected}"`));
        assert.ok((html.match(/data-rmt-furniture=/g)||[]).length<=6, 'paging limits visible density, not accessible content');
    }
});
