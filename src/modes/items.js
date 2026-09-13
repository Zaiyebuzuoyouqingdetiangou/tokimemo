// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_constants from '../core/constants.js';
import * as core_evidence from '../core/evidence.js';
import * as core_incremental from '../core/incremental.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import * as generation_prompts from '../generation/prompts.js';
import * as ui_overlay from '../ui/overlay.js';

export function normalizePossessionNode(node, memoryBank, depth = 0, fallbackId = 'IT01') {
    if (!node || typeof node !== 'object' || depth > 3) return null;
    const kind = node?.kind === 'container' ? 'container' : 'item';
    const basis = core_constants.ROOM_BASIS_VALUES.has(node?.basis) ? node.basis : '设定';
    const label = core_text.normalizeText(node?.label, 80) || '未命名物件';
    const summary = core_text.normalizeText(node?.summary, 1600);
    const line = core_text.normalizeText(node?.line, 900);
    const reference = basis === '记忆' ? core_evidence.normalizeMemoryReference(node?.sourceMemoryIds, node?.sourceMemoryAnchor, `${label}\n${summary}\n${line}`, memoryBank, 1) : { sourceMemoryIds: [], sourceMemoryAnchor: '' };
    if (!summary || !line || (basis === '记忆' && !reference.sourceMemoryIds.length)) return null;
    const children = (Array.isArray(node?.children) ? node.children : []).slice(0, 12).map((child, index) => normalizePossessionNode(child, memoryBank, depth + 1, `${fallbackId}_${index + 1}`)).filter(Boolean);
    return { id: core_text.safeId(node?.id, fallbackId), label, kind, basis, summary, line, sourceMemoryIds: reference.sourceMemoryIds, sourceMemoryAnchor: reference.sourceMemoryAnchor, children };
}

export function countItemNodes(nodes) {
    return (Array.isArray(nodes) ? nodes : []).reduce(
        (total, node) => total + 1 + countItemNodes(node?.children),
        0,
    );
}

export function normalizeItems(data, memoryBank) {
    const raw = Array.isArray(data?.containers) ? data.containers : [];
    let totalNodes = 0;
    const containers = raw.slice(0, 10).map((box, boxIndex) => {
        const id = core_text.safeId(box?.id, `BOX${String(boxIndex + 1).padStart(2, '0')}`);
        const nodes = (Array.isArray(box?.nodes) ? box.nodes : []).slice(0, 12).map((node, index) => normalizePossessionNode(node, memoryBank, 0, `${id}_IT${String(index + 1).padStart(2, '0')}`)).filter(Boolean);
        totalNodes += countItemNodes(nodes);
        return { id, label: core_text.normalizeText(box?.label, 80) || `收纳处 ${boxIndex + 1}`, containerType: core_text.normalizeText(box?.containerType, 100) || '私人收纳容器', spaceLabel: core_text.normalizeText(box?.spaceLabel, 100), description: core_text.normalizeText(box?.description, 1200) || '这是他日常会使用的收纳位置。', nodes };
    }).filter(box => box.nodes.length >= 3);
    if (containers.length < 1 || totalNodes < 4) throw new Error(`“他的物品”内容不足：${containers.length} 个容器 / ${totalNodes} 个节点。`);
    if (totalNodes > core_constants.MAX_DERIVED_CONTENT_ITEMS) throw new Error(`“他的物品”节点过多：${totalNodes} 个，最多允许 ${core_constants.MAX_DERIVED_CONTENT_ITEMS} 个，避免递归结构拖慢界面。`);
    return { kind: core_constants.MODE.ITEMS, title: core_text.normalizeText(data?.title, 100) || '他的物品', containers, selectedContainerId: containers[0].id, viewPath: [], selectedNodeId: containers[0].nodes[0]?.id || '' };
}

export function compactItemsExisting(session) {
    return (Array.isArray(session?.containers) ? session.containers : []).slice(0, 20).map(box => ({
        id: core_text.normalizeText(box?.id, 80),
        label: core_text.normalizeText(box?.label, 100),
        spaceLabel: core_text.normalizeText(box?.spaceLabel, 100),
        nodes: (Array.isArray(box?.nodes) ? box.nodes : []).slice(0, 40).map(node => ({
            id: core_text.normalizeText(node?.id, 80),
            label: core_text.normalizeText(node?.label, 100),
            kind: core_text.normalizeText(node?.kind, 20),
            sourceMemoryIds: core_text.cleanArray(node?.sourceMemoryIds, 8, 40),
            sourceMemoryAnchor: core_text.normalizeText(node?.sourceMemoryAnchor, 120),
        })),
    }));
}

export function itemsIncrementPrompt(basePrompt, memoryBank, previous, sourceMemoryIds) {
    return `${basePrompt}

【本轮是增量追加】旧容器、旧节点、旧描述和旧台词由本地原样保留。本请求只返回由新增档案带来的新物件/新夹层；为通过结构校验可以连同旧容器骨架返回，但禁止重写或换名复述旧节点。
UNTRUSTED_INCREMENTAL_ITEMS_ARCHIVE_JSON:
${core_incremental.incrementalArchiveSlice(memoryBank, sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS)}
EXISTING_ITEMS_INDEX_JSON:
${JSON.stringify(compactItemsExisting(previous), null, 2)}

- 每个真正新增的节点都必须 basis=记忆，且该节点自身至少引用一个 incrementalMemoryIds；旧父节点只可作为已有树中的定位骨架，不能换名后携带一个新子节点整棵追加。纯设定物件不得在每次更新时无限添加。
- 必须避开已有 label、锚点和 sourceMemoryIds 组合。
- 只追加真正的新内容；本地不会接受对旧节点的改写。`;
}

export function itemContainerKey(box) {
    return `${core_incremental.normalizedContentKey(box?.spaceLabel, 100)}|${core_incremental.normalizedContentKey(box?.label, 100)}`;
}

export function itemNodeKey(node) {
    const ids = core_text.cleanArray(node?.sourceMemoryIds, 8, 40).sort().join(',');
    const anchor = core_incremental.normalizedContentKey(node?.sourceMemoryAnchor, 140);
    return ids && anchor
        ? `memory|${ids}|${anchor}`
        : `${core_text.normalizeText(node?.kind, 20)}|${core_incremental.normalizedContentKey(node?.label, 100)}`;
}

export function itemNodeDirectlyUsesIncrement(node, sourceMemoryIds) {
    const allowed = new Set(core_text.cleanArray(sourceMemoryIds, core_constants.MAX_MEMORY_PROMPT_ITEMS, 40));
    return node?.basis === '记忆' && core_text.cleanArray(node?.sourceMemoryIds, 12, 40).some(id => allowed.has(id));
}

export function itemNodeUsesIncrement(node, sourceMemoryIds) {
    if (itemNodeDirectlyUsesIncrement(node, sourceMemoryIds)) return true;
    return (Array.isArray(node?.children) ? node.children : []).some(child => itemNodeUsesIncrement(child, sourceMemoryIds));
}

export function collectItemNodeIds(nodes, out = new Set()) {
    for (const node of Array.isArray(nodes) ? nodes : []) {
        const id = core_text.normalizeText(node?.id, 80);
        if (id) out.add(id);
        collectItemNodeIds(node?.children, out);
    }
    return out;
}

export function mergeItemNodeArrays(target, incoming, sourceMemoryIds, usedIds, state, prefix) {
    const byKey = new Map((target || []).map((node, index) => [itemNodeKey(node), index]));
    for (const fresh of incoming || []) {
        if (state.total >= core_constants.MAX_DERIVED_CONTENT_ITEMS || !itemNodeUsesIncrement(fresh, sourceMemoryIds)) continue;
        const key = itemNodeKey(fresh);
        const existingIndex = byKey.get(key);
        if (existingIndex !== undefined) {
            const old = target[existingIndex];
            if (!Array.isArray(old.children)) old.children = [];
            mergeItemNodeArrays(old.children, fresh.children || [], sourceMemoryIds, usedIds, state, `${old.id}_`);
            continue;
        }
        // A matching historical node may be returned as a read-only skeleton so its genuinely new
        // descendants can be located above. A brand-new node, however, must itself cite this batch;
        // otherwise an old-evidence parent could smuggle a rewritten copy into the append-only tree
        // merely by attaching one incremental child.
        if (!itemNodeDirectlyUsesIncrement(fresh, sourceMemoryIds)) continue;
        const next = structuredClone(fresh);
        next.id = core_incremental.uniqueGeneratedId(next.id, usedIds, prefix || 'IT');
        next.children = [];
        target.push(next);
        byKey.set(key, target.length - 1);
        state.added += 1;
        state.total += 1;
        mergeItemNodeArrays(next.children, fresh.children || [], sourceMemoryIds, usedIds, state, `${next.id}_`);
    }
}

export function mergeItemsIncremental(previous, fresh, sourceMemoryIds) {
    const merged = structuredClone(previous);
    const usedContainerIds = new Set((merged.containers || []).map(box => box.id));
    const existingNodes = (merged.containers || []).flatMap(box => box.nodes || []);
    const usedNodeIds = collectItemNodeIds(existingNodes);
    // IDs are model-controlled de-duplication hints. Capacity must count actual nodes so duplicate
    // IDs in a legacy/normalized tree cannot create extra local-storage and rendering headroom.
    const state = { added: 0, total: countItemNodes(existingNodes) };
    const byContainer = new Map((merged.containers || []).map((box, index) => [itemContainerKey(box), index]));
    for (const freshBox of fresh.containers || []) {
        if (state.total >= core_constants.MAX_DERIVED_CONTENT_ITEMS) break;
        const key = itemContainerKey(freshBox);
        const existingIndex = byContainer.get(key);
        if (existingIndex === undefined) {
            if (!(freshBox.nodes || []).some(node => itemNodeUsesIncrement(node, sourceMemoryIds)) || merged.containers.length >= 20) continue;
            const next = { ...structuredClone(freshBox), id: core_incremental.uniqueGeneratedId(freshBox.id, usedContainerIds, 'BOX'), nodes: [] };
            mergeItemNodeArrays(next.nodes, freshBox.nodes || [], sourceMemoryIds, usedNodeIds, state, `${next.id}_IT`);
            if (!next.nodes.length) continue;
            byContainer.set(key, merged.containers.length);
            merged.containers.push(next);
            continue;
        }
        const target = merged.containers[existingIndex];
        if (!Array.isArray(target.nodes)) target.nodes = [];
        mergeItemNodeArrays(target.nodes, freshBox.nodes || [], sourceMemoryIds, usedNodeIds, state, `${target.id}_IT`);
    }
    return { session: merged, added: state.added };
}

export async function generateItemsIncrementalWithRepair(context, memoryBank, roomSession, focusObject, origin, taskKey, previous) {
    const sourceMemoryIds = core_incremental.incrementalArchiveMemoryIds(previous, memoryBank, 'mode');
    const basePrompt = generation_prompts.roomDeepGenerationPrompt(core_constants.MODE.ITEMS, context, core_incremental.incrementalPromptMemoryBank(memoryBank, sourceMemoryIds), roomSession, focusObject);
    const fresh = await generation_client.requestValidatedSegment(
        itemsIncrementPrompt(basePrompt, memoryBank, previous, sourceMemoryIds),
        '他的物品 · 正在从新增档案追加物件…',
        { maxTokens: core_constants.MODE_TOKEN_CAPS[core_constants.MODE.ITEMS], temperature: 0.45, context, origin, taskKey: `${taskKey}:increment`, mode: core_constants.MODE.ITEMS, background: true },
        raw => normalizeItems(raw, memoryBank),
    );
    const { session, added } = mergeItemsIncremental(previous, fresh, sourceMemoryIds);
    return core_incremental.stampIncrementalCoverage(session, previous, memoryBank, 'mode', sourceMemoryIds, added);
}

export function selectedItemsContainer() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ITEMS) return null;
    return runtimeState.activeSession.containers.find(box => box.id === runtimeState.activeSession.selectedContainerId) || runtimeState.activeSession.containers[0] || null;
}

export function possessionPathNodes(container, path) {
    let nodes = container?.nodes || []; const parents = [];
    for (const id of Array.isArray(path) ? path : []) { const found = nodes.find(node => node.id === id && node.kind === 'container'); if (!found) break; parents.push(found); nodes = found.children || []; }
    return { nodes, parents };
}

export function renderItems() {
    const session = runtimeState.activeSession; if (!session || session.kind !== core_constants.MODE.ITEMS) return; ui_overlay.setBackVisible(true, '他的房间'); ui_overlay.topTitle('他的房间 · 翻找物品');
    const box = selectedItemsContainer(); const { nodes, parents } = possessionPathNodes(box, session.viewPath);
    const selected = nodes.find(node => node.id === session.selectedNodeId) || nodes[0] || null; if (selected) session.selectedNodeId = selected.id;
    const boxes = session.containers.map(item => `<button type="button" class="rmt-event ${item.id === box?.id ? 'active' : ''}" data-rmt-items-box="${core_text.esc(item.id)}"><b>${core_text.esc(item.label)}</b><small>${core_text.esc(item.containerType)}</small></button>`).join('');
    const crumbs = [box?.label, ...parents.map(item => item.label)].filter(Boolean);
    const list = nodes.map(node => `<button type="button" class="rmt-item-node ${node.id === selected?.id ? 'active' : ''}" data-rmt-item-node="${core_text.esc(node.id)}"><i class="fa-solid ${node.kind === 'container' ? 'fa-box' : 'fa-tag'}"></i><span><b>${core_text.esc(node.label)}</b><small>${core_text.esc(node.basis === '记忆' ? `档案痕迹 · ${node.sourceMemoryAnchor}` : '生活设定')}</small></span>${node.kind === 'container' ? '<i class="fa-solid fa-chevron-right"></i>' : ''}</button>`).join('');
    const detail = selected ? `<div class="rmt-item-detail"><div class="rmt-item-detail-head"><b>${core_text.esc(selected.label)}</b><span>${core_text.esc(selected.kind === 'container' ? '可继续打开' : '物件')}</span></div><p>${core_text.esc(selected.summary)}</p><blockquote>${core_text.esc(selected.line)}</blockquote>${selected.kind === 'container' && selected.children.length ? `<button class="rmt-btn" type="button" data-rmt-action="items-open">打开 / 继续翻找</button>` : ''}</div>` : '<div class="rmt-item-detail">这里暂时没有可查看的东西。</div>';
    ui_overlay.bodyEl().innerHTML = `<div class="rmt-room-deep-toolbar"><button type="button" class="rmt-btn" data-rmt-action="room-deep-back">← 返回他的房间</button><span>正在翻找他的私人收纳</span></div><div class="rmt-items"><aside class="rmt-items-boxes">${boxes}</aside><section class="rmt-items-main"><div class="rmt-items-toolbar"><span>${core_text.esc(crumbs.join(' › '))}</span>${session.viewPath.length ? '<button class="rmt-btn" type="button" data-rmt-action="items-back">返回上一层</button>' : ''}</div><div class="rmt-items-grid"><div class="rmt-items-list">${list}</div>${detail}</div></section></div>`;
}

export function itemsSelectBox(id) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ITEMS) return;
    const box = runtimeState.activeSession.containers.find(item => item.id === id);
    if (!box) return;
    runtimeState.activeSession.selectedContainerId = box.id;
    runtimeState.activeSession.viewPath = [];
    runtimeState.activeSession.selectedNodeId = box.nodes[0]?.id || '';
    renderItems();
}

export function itemsSelectNode(id) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ITEMS) return;
    runtimeState.activeSession.selectedNodeId = id;
    renderItems();
}

export function itemsOpenSelected() {
    const box = selectedItemsContainer();
    if (!box || !runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ITEMS) return;
    const { nodes } = possessionPathNodes(box, runtimeState.activeSession.viewPath);
    const node = nodes.find(item => item.id === runtimeState.activeSession.selectedNodeId);
    if (!node || node.kind !== 'container' || !node.children.length) return;
    runtimeState.activeSession.viewPath.push(node.id);
    runtimeState.activeSession.selectedNodeId = node.children[0]?.id || '';
    renderItems();
}

export function itemsBack() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.ITEMS || !runtimeState.activeSession.viewPath.length) return;
    runtimeState.activeSession.viewPath.pop();
    const box = selectedItemsContainer();
    const { nodes } = possessionPathNodes(box, runtimeState.activeSession.viewPath);
    runtimeState.activeSession.selectedNodeId = nodes[0]?.id || '';
    renderItems();
}
