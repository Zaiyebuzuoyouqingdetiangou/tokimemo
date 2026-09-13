import * as core_constants from '../core/constants.js';
import * as core_text from '../core/text.js';
import * as core_evidence from '../core/evidence.js';
import * as generation_prompts from '../generation/prompts.js';
import * as ui_overlay from '../ui/overlay.js';
import { state as runtimeState } from '../core/state.js';

export function cabinetPrompt(context, memoryBank) {
    return generation_prompts.promptSafetyBoundary(context, '两个人的陈列柜') + '\n' +
        generation_prompts.promptArchiveSlice(memoryBank, 64) +
        '\n只收记忆中真实出现、与两个人有关的具体物件，如曾交换的礼物、共同使用的物品、留下的票根。不是他的全部私人物品。不得从世界书推测，不得编造礼物。无证据时返回空 items。最多 12 件。输出 {"items":[{"name":"原文中的物件名","objectEvidence":"从所引记忆 summary/anchors/title 中逐字复制的一句，须含物件名及两人关联","sourceMemoryIds":["M001"],"sourceMemoryAnchor":"原样锚点"}]}。';
}

export function normalizeCabinet(raw, memoryBank) {
    if (!Array.isArray(raw?.items)) throw new Error('陈列柜缺少物件列表');
    const items = [];
    const seen = new Set();
    for (const item of raw.items.slice(0, 24)) {
        const name = core_text.normalizeText(item?.name, 80);
        const evidence = core_text.normalizeText(item?.objectEvidence, 500);
        const reference = core_evidence.normalizeExactMemoryReference(item?.sourceMemoryIds, item?.sourceMemoryAnchor, memoryBank);
        const memories = (memoryBank?.memories || []).filter(memory => reference.sourceMemoryIds.includes(memory.id));
        const literal = memories.some(memory => [memory.title, memory.summary, ...(memory.anchors || [])].some(text => String(text || '').includes(evidence)));
        const names = [memoryBank?.characterName, memoryBank?.userName];
        const pair = names.every(value => value && evidence.includes(value))
            || (/两人|两个人|双方|彼此|我们/.test(evidence) && memories.some(memory =>
                names.every(name => name && memory.participants?.includes(name)) && memory.participants.length === 2));
        if (!name || evidence.length < 6 || !evidence.includes(name) || !literal || !pair || !reference.sourceMemoryAnchor || seen.has(name)) continue;
        seen.add(name);
        items.push({ id: 'KEEP_' + (items.length + 1), name, objectEvidence: evidence, ...reference });
    }
    return { kind: core_constants.MODE.CABINET, title: '两个人的陈列柜', items };
}

export function mergeCabinet(previous, fresh) {
    const items = structuredClone(previous?.items || []);
    const names = new Set(items.map(item => item.name));
    for (const item of fresh.items) if (!names.has(item.name) && items.length < core_constants.MAX_DERIVED_CONTENT_ITEMS) {
        names.add(item.name);
        items.push({ ...item, id: 'KEEP_' + (items.length + 1) });
    }
    return { ...fresh, items };
}

export function cabinetHtml(session) {
    const esc = core_text.esc;
    const items = (Array.isArray(session?.items) ? session.items : []).slice(0, core_constants.MAX_DERIVED_CONTENT_ITEMS)
        .filter(item => item && typeof item === 'object').map(item => ({ ...item, sourceMemoryIds: core_text.cleanArray(item.sourceMemoryIds, 8, 40) }));
    return '<section class="rmt-cabinet"><header class="rmt-archive-card"><small>OUR KEEPSAKES</small><h2>两个人的陈列柜</h2><p>把确实留下过的东西，放在这里。</p></header><div class="rmt-cabinet-shelves">' +
        (items.length ? items.map((item, index) => '<details class="rmt-cabinet-piece"><summary><span class="rmt-cabinet-object" aria-hidden="true">' + cabinetObjectArt(item.name) + '</span><small>No. ' + String(index + 1).padStart(2, '0') + '</small><b>' + esc(item.name) + '</b><span>打开回忆</span></summary><div class="rmt-cabinet-detail"><blockquote>' + esc(item.objectEvidence) + '</blockquote><small>' + esc(item.sourceMemoryIds.join(' · ')) + ' · ' + esc(item.sourceMemoryAnchor) + '</small></div></details>').join('')
            : '<p class="rmt-archive-card">这份记忆里还没有能核实的共同物件。柜子先空着，不替你们编造纪念品。</p>') + '</div></section>';
}

// Decorative silhouettes are owned entirely by the plugin, never model SVG.
export function cabinetObjectArt(name) {
    const text = core_text.normalizeText(name, 80);
    const shape = /票|ticket/i.test(text) ? '<path d="M12 24h72v12a12 12 0 0 0 0 24v12H12V60a12 12 0 0 0 0-24z"/><path d="M64 28v40M27 40h24M27 51h18"/>'
        : /信|纸条|letter|note/i.test(text) ? '<rect x="12" y="24" width="72" height="48" rx="3"/><path d="m14 28 34 28 34-28M14 69l23-23m45 23L59 46"/>'
        : /书|本|book|journal/i.test(text) ? '<path d="M22 12h54v68H28a8 8 0 0 1 0-16h48M28 12v52M39 28h25M39 39h18"/>'
        : /戒|ring/i.test(text) ? '<circle cx="48" cy="57" r="23"/><path d="m35 25 7-12h12l7 12-13 13zM35 25h26"/>'
        : /钥匙|key/i.test(text) ? '<circle cx="31" cy="32" r="18"/><path d="m43 45 36 36M64 66l10-10M73 75l10-10"/>'
        : /花|flower/i.test(text) ? '<path d="M48 81V48m0 23c-20 0-20-15-20-15 17-1 20 15 20 15m0-9c20 0 20-15 20-15-17-1-20 15-20 15"/><circle cx="48" cy="31" r="18"/><circle cx="48" cy="31" r="6"/>'
        : '<path d="M16 36h64v43H16zM12 25h72v14H12zM48 25v54M48 25C18 26 21 4 35 14zm0 0C78 26 75 4 61 14z"/>';
    return '<svg viewBox="0 0 96 96" width="112" height="112" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">' + shape + '</svg>';
}

export function renderCabinet() {
    if (runtimeState.activeSession?.kind !== core_constants.MODE.CABINET) return;
    ui_overlay.topTitle('两个人的陈列柜');
    ui_overlay.bodyEl().innerHTML = cabinetHtml(runtimeState.activeSession);
}
