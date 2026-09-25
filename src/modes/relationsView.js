import * as archive_groups from '../archive/groups.js';
import * as archive_repository from '../archive/repository.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_evidence from '../core/evidence.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as ui_overlay from '../ui/overlay.js';
import { MAX_DYNAMIC_RELATIONS, PROFILE_DISCOVERY_LABELS, PROFILE_FACT_ORDER, RELATION_LAYERS, RELATION_STATES, archiveCharacterProfileKey, factValueBackedByEvidence, foldEvidence, getCharacterProfile, normalizeProfileFactLabel, normalizeSettingRelationships, relationParticipantNames } from './characterProfile.js';
// 关系：关系数据规范化与进度、关系层合并、关系花园与页面渲染
// 从 modes/relations.js 原样搬出（重构阶段 2），声明文本一字未改；modes/relations.js 仍转发原有导出。

export function normalizeRelations(data, memoryBank, context = null) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.relationships)) throw new Error('人际庭园 JSON 结构不完整。');
    const seen = new Set();
    const userName = core_text.normalizeText(context?.name1, 120);
    const participantNames = relationParticipantNames(memoryBank, context);
    const memoryById = new Map((memoryBank?.memories || []).map(item => [String(item?.id), item]));
    const discoverySeen = new Set();
    const discoveries = (Array.isArray(data?.discoveries) ? data.discoveries : []).slice(0, 16).map((item, index) => {
        const label = core_text.normalizeText(item?.label, 40);
        const value = core_text.normalizeText(item?.value, 160);
        const summary = core_text.normalizeText(item?.summary, 500);
        if (!PROFILE_DISCOVERY_LABELS.has(label) || !value) return null;
        const reference = core_evidence.normalizeMemoryReference(item?.sourceMemoryIds, item?.sourceMemoryAnchor, `${label}\n${value}\n${summary}`, memoryBank, 1);
        if (!reference.sourceMemoryIds.length || !reference.sourceMemoryAnchor) return null;
        const evidenceText = reference.sourceMemoryIds.map(id => {
            const memory = memoryById.get(String(id));
            return [memory?.title, memory?.summary, ...(Array.isArray(memory?.anchors) ? memory.anchors : [])].filter(Boolean).join(' ');
        }).join(' ');
        if (!factValueBackedByEvidence(value, evidenceText)) return null;
        const identity = `${label.toLocaleLowerCase()}\u001f${value.toLocaleLowerCase()}`;
        if (discoverySeen.has(identity)) return null;
        discoverySeen.add(identity);
        return {
            id: core_text.safeId(item?.id, `DISC_${String(index + 1).padStart(2, '0')}`),
            label,
            value,
            summary,
            sourceMemoryIds: reference.sourceMemoryIds,
            sourceMemoryAnchor: reference.sourceMemoryAnchor,
        };
    }).filter(Boolean);
    const relationships = (Array.isArray(data?.relationships) ? data.relationships : []).slice(0, MAX_DYNAMIC_RELATIONS).map((item, index) => {
        const ownerName = core_text.normalizeText(item?.ownerName, 120);
        const name = core_text.normalizeText(item?.name, 120);
        const relation = core_text.normalizeText(item?.relation, 120);
        const summary = core_text.normalizeText(item?.summary, 700);
        if (!ownerName || !participantNames.includes(ownerName) || !name || !relation || !summary) return null;
        const reference = core_evidence.normalizeMemoryReference(item?.sourceMemoryIds, item?.sourceMemoryAnchor, `${name}\n${relation}\n${summary}`, memoryBank, 1);
        if (!reference.sourceMemoryIds.length || !reference.sourceMemoryAnchor) return null;
        const isUser = item?.isUser === true;
        if (isUser && userName && name !== userName && name !== '{{user}}') return null;
        if (!isUser && userName && name === userName) return null;
        const referencedText = reference.sourceMemoryIds.map(id => {
            const memory = memoryById.get(String(id));
            return [
                memory?.title,
                memory?.summary,
                ...(Array.isArray(memory?.anchors) ? memory.anchors : []),
                ...(Array.isArray(memory?.participants) ? memory.participants : []),
            ].filter(Boolean).join(' ');
        }).join(' ');
        if (!foldEvidence(referencedText).includes(foldEvidence(ownerName))) return null;
        if (!isUser) {
            const personNeedle = foldEvidence(name);
            if (personNeedle.length >= 2 && !foldEvidence(referencedText).includes(personNeedle)) return null;
        }
        const identity = `${ownerName.toLocaleLowerCase()}\u001f${isUser ? '__user__' : name.toLocaleLowerCase()}`;
        if (seen.has(identity)) return null;
        seen.add(identity);
        const categoryRaw = core_text.normalizeText(item?.category, 30).toLowerCase();
        const stateRaw = core_text.normalizeText(item?.state, 40);
        const npcPerspective = isUser ? '' : core_text.normalizeText(item?.npcPerspective, 900);
        if (!isUser && !npcPerspective) throw new Error(`本世界线 NPC「${name}」缺少 npcPerspective。`);
        return {
            id: core_text.safeId(item?.id, `REL_CHAT_${String(index + 1).padStart(2, '0')}`),
            ownerName,
            name,
            relation,
            category: RELATION_LAYERS.has(categoryRaw) ? categoryRaw : 'acquaintance',
            state: RELATION_STATES.has(stateRaw) ? stateRaw : '普通',
            sentiments: core_text.cleanArray(item?.sentiments, 4, 40),
            summary,
            isUser,
            npcPerspective,
            sourceMemoryIds: reference.sourceMemoryIds,
            sourceMemoryAnchor: reference.sourceMemoryAnchor,
        };
    }).filter(Boolean);
    return {
        kind: core_constants.MODE.RELATIONS,
        title: core_text.normalizeText(data?.title, 100) || '本世界线人际关系',
        summary: core_text.normalizeText(data?.summary, 700),
        participantNames,
        discoveries,
        relationships,
    };
}

export function projectRelationsProgress({ segments, memoryBank, context, previousSession, frozenInputs = {} }) {
    const keys = ['relationships', 'discoveries', 'settingRelationships'];
    const segment = segments.findLast(item => keys.some(key => item.items('/' + key).length));
    if (!segment) return null;
    const relationships = segment.items('/relationships').filter(item => {
        try { return normalizeRelations({ relationships: [item], discoveries: [] }, memoryBank, context).relationships.length > 0; }
        catch { return false; }
    });
    const raw = { ...segment.value, relationships, discoveries: segment.items('/discoveries') };
    const fresh = normalizeRelations(raw, memoryBank, context);
    const selected = frozenInputs['relations:setting-books'] || {};
    fresh.settingRelationships = normalizeSettingRelationships(segment.items('/settingRelationships'), selected.entries || [], context);
    if (!fresh.relationships.length && !fresh.discoveries.length && !fresh.settingRelationships.length) return null;
    fresh.characterName = memoryBank.characterName;
    if (!previousSession) return fresh;
    const next = { ...structuredClone(previousSession), ...fresh };
    for (const key of keys) {
        const values = new Map((previousSession[key] || []).map(item => [item.id || item.name, structuredClone(item)]));
        for (const item of fresh[key] || []) values.set(item.id || item.name, item);
        next[key] = [...values.values()];
    }
    return next;
}

function currentProfileForContext(context) {
    try {
        const memory = archive_repository.getImportedMemory(context);
        const currentGroup = archive_groups.currentArchiveGroupKey(context, memory);
        if (!currentGroup) return null;
        const entries = archive_groups.archiveGroupEntries(currentGroup, context);
        const meta = archive_groups.archiveGroupMeta(currentGroup, entries, context);
        return getCharacterProfile(context, archiveCharacterProfileKey(currentGroup, meta, entries));
    } catch {
        return null;
    }
}

export function relationsViewIdentity(session, snapshot = null, context = core_context.getContext()) {
    let profile = null;
    let authoritativeGroupId = '';
    let groupMeta = null;
    if (snapshot) {
        const entryId = core_text.normalizeText(snapshot?.entryId, 120);
        const currentEntry = entryId
            ? archive_groups.getArchiveIndex(context).find(item => core_context.archiveIndexEntryId(item) === entryId)
            : null;
        authoritativeGroupId = currentEntry
            ? archive_groups.archiveGroupKeyForEntry(currentEntry)
            : core_text.normalizeText(snapshot?.archiveGroupId, 120);
        if (authoritativeGroupId) {
            const entries = archive_groups.archiveGroupEntries(authoritativeGroupId, context);
            groupMeta = archive_groups.archiveGroupMeta(authoritativeGroupId, entries, context);
            profile = getCharacterProfile(context, archiveCharacterProfileKey(authoritativeGroupId, groupMeta, entries));
        }
    } else {
        profile = currentProfileForContext(context);
        if (!profile && session?.profileKey) profile = getCharacterProfile(context, session.profileKey);
    }
    const characterName = core_text.normalizeText(
        profile?.characterName || groupMeta?.characterName || snapshot?.characterName || session?.characterName || context?.name2,
        120,
    ) || '{{char}}';
    const avatarName = core_text.normalizeText(
        profile?.avatar || groupMeta?.avatar || snapshot?.avatar || session?.characterAvatar,
        300,
    );
    return { profile, profileKey: core_text.normalizeText(profile?.key, 160), authoritativeGroupId, characterName, avatarName };
}

function relationDistanceRank(item) {
    if (item?.isUser === true) return 0;
    const relation = item?.dynamic || item?.base || {};
    const state = core_text.normalizeText(relation?.state, 40);
    if (['恋爱', '伴侣', '亲密', '家人'].includes(state)) return 0;
    if (['友好', '暧昧', '特殊'].includes(state)) return 1;
    const category = core_text.normalizeText(relation?.category, 30).toLowerCase();
    if (['family', 'special', 'close'].includes(category)) return 0;
    if (category === 'friend') return 1;
    if (['work', 'school', 'rival'].includes(category)) return 2;
    return 3;
}

export function mergeRelationLayers(sharedRelations = [], dynamicRelations = [], limit = 18) {
    const merged = new Map();
    const add = (item, layer) => {
        const key = item?.isUser === true ? '__user__' : core_text.normalizeText(item?.name, 120).toLocaleLowerCase();
        if (!key) return;
        const existing = merged.get(key) || { key, name: core_text.normalizeText(item?.name, 120), isUser: item?.isUser === true, base: null, dynamic: null };
        existing[layer] = item;
        if (item?.isUser === true) existing.isUser = true;
        if (!existing.name) existing.name = core_text.normalizeText(item?.name, 120);
        merged.set(key, existing);
    };
    for (const item of sharedRelations || []) add(item, 'base');
    for (const item of dynamicRelations || []) add(item, 'dynamic');
    return [...merged.values()]
        .sort((a, b) => relationDistanceRank(a) - relationDistanceRank(b) || a.name.localeCompare(b.name, 'zh-CN'))
        .slice(0, Math.max(1, Math.min(120, Number(limit) || 18)));
}

export function relationGardenPositions(count) {
    const n = Math.max(0, Math.min(18, Number(count) || 0));
    const out = [];
    for (let i = 0; i < n; i += 1) {
        const ring = i < 8 ? 0 : 1;
        const ringIndex = ring ? i - 8 : i;
        const ringCount = ring ? Math.max(1, n - 8) : Math.min(8, n);
        const angle = (-Math.PI / 2) + (Math.PI * 2 * ringIndex / ringCount) + (ring ? Math.PI / Math.max(4, ringCount) : 0);
        const radiusX = ring ? 39 : 30;
        const radiusY = ring ? 36 : 27;
        out.push({ x: 50 + Math.cos(angle) * radiusX, y: 50 + Math.sin(angle) * radiusY });
    }
    return out;
}

function relationCategoryLabel(category) {
    return ({ family: '家人', close: '亲近', friend: '朋友', work: '工作', school: '学校', rival: '竞争', acquaintance: '熟人', special: '特殊' })[category] || '关系';
}

function legacyRelationGardenHtml({ characterName, avatarUrl = '', sharedRelations = [], dynamicRelations = [], selectedKey = '' } = {}) {
    const allRelations = mergeRelationLayers(sharedRelations, dynamicRelations, 120);
    const selected = allRelations.find(item => item.key === selectedKey) || allRelations[0] || null;
    const merged = allRelations.slice(0, 18);
    if (selected && !merged.includes(selected)) merged[merged.length - 1] = selected;
    const positions = relationGardenPositions(merged.length);
    const edges = merged.map((item, index) => {
        const pos = positions[index];
        const lines = [];
        if (item.base) lines.push(`<line class="rmt-relation-edge base" x1="50" y1="50" x2="${pos.x.toFixed(2)}" y2="${pos.y.toFixed(2)}"/>`);
        if (item.dynamic) lines.push(`<line class="rmt-relation-edge dynamic" x1="50" y1="50" x2="${pos.x.toFixed(2)}" y2="${pos.y.toFixed(2)}"/>`);
        return lines.join('');
    }).join('');
    const nodes = merged.map((item, index) => {
        const pos = positions[index];
        const rel = item.dynamic || item.base || {};
        const key = item.key;
        const classes = ['rmt-relation-node', item.isUser ? 'user' : '', item.base ? 'has-base' : '', item.dynamic ? 'has-dynamic' : '', key === selected?.key ? 'selected' : ''].filter(Boolean).join(' ');
        const title = item.dynamic?.relation || item.base?.relation || relationCategoryLabel(rel.category);
        return `<button type="button" class="${classes}" data-rmt-action="relation-select" data-rmt-relation-key="${core_text.esc(key)}" style="left:${pos.x.toFixed(2)}%;top:${pos.y.toFixed(2)}%"><span class="rmt-relation-node-avatar">${item.isUser ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-solid fa-user"></i>'}</span><b>${core_text.esc(item.name || (item.isUser ? '{{user}}' : '人物'))}</b><small>${core_text.esc(title)}</small></button>`;
    }).join('');
    const base = selected?.base;
    const dynamic = selected?.dynamic;
    const npcPerspective = selected && !selected.isUser
        ? core_text.normalizeText(dynamic?.npcPerspective || base?.npcPerspective, 900)
        : '';
    const npcPerspectiveDetail = selected && !selected.isUser
        ? `<div class="rmt-relation-layer-row npc-perspective"><strong>NPC视角</strong><span>${npcPerspective ? core_text.esc(npcPerspective) : '尚未生成'}</span>${npcPerspective ? '' : '<small>刷新本世界线关系或重新读取固定设定后可查看。</small>'}</div>`
        : '';
    const detail = selected ? `<article class="rmt-relation-detail">
      <div class="rmt-relation-detail-head"><b>${core_text.esc(selected.name || '{{user}}')}</b>${selected.isUser ? '<span>USER</span>' : ''}</div>
      ${base ? `<div class="rmt-relation-layer-row"><strong>固有设定</strong><span>${core_text.esc(base.relation)}${base.state ? ` · ${core_text.esc(base.state)}` : ''}</span><small>${core_text.esc(base.summary || '')}</small>${base.sentiments?.length ? `<em>${base.sentiments.map(core_text.esc).join(' · ')}</em>` : ''}</div>` : ''}
      ${dynamic ? `<div class="rmt-relation-layer-row dynamic"><strong>本世界线</strong><span>${core_text.esc(dynamic.relation)}${dynamic.state ? ` · ${core_text.esc(dynamic.state)}` : ''}</span><small>${core_text.esc(dynamic.summary || '')}</small>${dynamic.sentiments?.length ? `<em>${dynamic.sentiments.map(core_text.esc).join(' · ')}</em>` : ''}<i>${core_text.esc(dynamic.sourceMemoryAnchor || '')}</i></div>` : ''}
      ${npcPerspectiveDetail}
    </article>` : '<div class="rmt-heart-empty">还没有可展示的人际关系。</div>';
    return `<section class="rmt-relation-garden-wrap">
      ${allRelations.length > 18 ? `<details class="rmt-archive-card"><summary>全部 ${allRelations.length} 人 · 地图同时显示 18 人</summary><div class="rmt-mode-actions">${allRelations.map(item => `<button type="button" class="rmt-btn" data-rmt-action="relation-select" data-rmt-relation-key="${core_text.esc(item.key)}">${core_text.esc(item.name)}</button>`).join('')}</div></details>` : ''}
      <div class="rmt-relation-legend"><span><i class="base"></i>固有设定</span><span><i class="dynamic"></i>本世界线</span></div>
      <div class="rmt-relation-garden">
        <svg class="rmt-relation-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${edges}</svg>
        <div class="rmt-relation-center">${avatarUrl ? `<img src="${core_text.esc(avatarUrl)}" alt="">` : '<i class="fa-solid fa-user"></i>'}<b>${core_text.esc(characterName || '{{char}}')}</b></div>
        ${nodes}
      </div>
      ${detail}
    </section>`;
}

function ownedRelationKey(item) {
    return `owner:${core_text.normalizeText(item?.ownerName, 120)}\u001f${item?.isUser ? '__user__' : core_text.normalizeText(item?.name, 120).toLocaleLowerCase()}`;
}

function groupGardenLayout(ownerCount, targetCount) {
    const nodeWidth = 112, nodeHeight = 92, gapX = 34, gapY = 52, padding = 30;
    const targetColumns = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, targetCount))));
    const columns = Math.max(ownerCount, targetColumns, 3);
    const width = Math.max(420, padding * 2 + columns * nodeWidth + (columns - 1) * gapX);
    const ownerY = padding + nodeHeight / 2;
    const targetStartY = padding + nodeHeight + gapY + nodeHeight / 2;
    const targetRows = Math.max(1, Math.ceil(targetCount / targetColumns));
    const height = Math.max(330, targetStartY + (targetRows - 1) * (nodeHeight + gapY) + nodeHeight / 2 + padding);
    const centeredX = (count, index) => (width - (count * nodeWidth + Math.max(0, count - 1) * gapX)) / 2 + nodeWidth / 2 + index * (nodeWidth + gapX);
    return {
        width, height,
        owner: index => ({ x: centeredX(ownerCount, index), y: ownerY }),
        target: index => ({ x: centeredX(targetColumns, index % targetColumns), y: targetStartY + Math.floor(index / targetColumns) * (nodeHeight + gapY) }),
    };
}

function ownedRelationDetail(selected) {
    if (!selected) return '<div class="rmt-heart-empty">还没有可展示的人际关系。</div>';
    const npcPerspective = !selected.isUser ? core_text.normalizeText(selected.npcPerspective, 900) : '';
    return `<article class="rmt-relation-detail">
      <div class="rmt-relation-detail-head"><b>${core_text.esc(selected.name || '{{user}}')}</b>${selected.isUser ? '<span>USER</span>' : ''}</div>
      <div class="rmt-relation-layer-row dynamic"><strong>${core_text.esc(selected.ownerName)} 的本世界线</strong><span>${core_text.esc(selected.relation)}${selected.state ? ` · ${core_text.esc(selected.state)}` : ''}</span><small>${core_text.esc(selected.summary || '')}</small>${selected.sentiments?.length ? `<em>${selected.sentiments.map(core_text.esc).join(' · ')}</em>` : ''}<i>${core_text.esc(selected.sourceMemoryAnchor || '')}</i></div>
      ${!selected.isUser ? `<div class="rmt-relation-layer-row npc-perspective"><strong>NPC视角</strong><span>${npcPerspective || '尚未生成'}</span></div>` : ''}
    </article>`;
}

// New group sessions have an explicit owner on every worldline edge. Older
// sessions intentionally keep the original single-centre layout and wording.
export function relationGardenHtml({ characterName, avatarUrl = '', participantNames = [], sharedRelations = [], dynamicRelations = [], selectedKey = '', selectedOwner = '' } = {}) {
    const owners = [...new Set((participantNames || []).map(name => core_text.normalizeText(name, 120)).filter(Boolean))];
    const owned = (dynamicRelations || []).filter(item => owners.includes(core_text.normalizeText(item?.ownerName, 120)));
    if (!owners.length || owned.length !== (dynamicRelations || []).length) {
        return legacyRelationGardenHtml({ characterName, avatarUrl, sharedRelations, dynamicRelations, selectedKey });
    }
    const activeOwner = owners.includes(selectedOwner) ? selectedOwner : '';
    const visible = activeOwner ? owned.filter(item => item.ownerName === activeOwner) : owned;
    const targetMap = new Map();
    for (const item of visible) {
        const key = item.isUser ? '__user__' : core_text.normalizeText(item.name, 120).toLocaleLowerCase();
        if (!targetMap.has(key)) targetMap.set(key, { key, name: item.name, isUser: item.isUser === true, relation: item });
    }
    const targets = [...targetMap.values()];
    const layout = groupGardenLayout(owners.length, targets.length);
    const ownerPositions = owners.map((_, index) => layout.owner(index));
    const ownerPositionByName = new Map(owners.map((name, index) => [name, ownerPositions[index]]));
    const targetPositions = targets.map((_, index) => layout.target(index));
    const targetPositionByKey = new Map(targets.map((item, index) => [item.key, targetPositions[index]]));
    const selected = visible.find(item => ownedRelationKey(item) === selectedKey) || visible[0] || null;
    const edges = visible.map(item => {
        const origin = ownerPositionByName.get(item.ownerName);
        const target = targetPositionByKey.get(item.isUser ? '__user__' : core_text.normalizeText(item.name, 120).toLocaleLowerCase());
        return origin && target ? `<line class="rmt-relation-edge dynamic" x1="${origin.x}" y1="${origin.y}" x2="${target.x}" y2="${target.y}"/>` : '';
    }).join('');
    const ownerNodes = owners.map(name => {
        const pos = ownerPositionByName.get(name);
        const selectedClass = name === activeOwner ? ' selected' : '';
        return `<button type="button" class="rmt-relation-node has-dynamic${selectedClass}" data-rmt-action="relation-owner-select" data-rmt-relation-owner="${core_text.esc(name)}" style="left:${pos.x}px;top:${pos.y}px"><span class="rmt-relation-node-avatar"><i class="fa-solid fa-user"></i></span><b>${core_text.esc(name)}</b><small>本次人物</small></button>`;
    }).join('');
    const targetNodes = targets.map(item => {
        const pos = targetPositionByKey.get(item.key);
        const matching = visible.filter(edge => (edge.isUser ? '__user__' : core_text.normalizeText(edge.name, 120).toLocaleLowerCase()) === item.key);
        const key = matching.length ? ownedRelationKey(matching[0]) : '';
        const isSelected = matching.some(edge => ownedRelationKey(edge) === ownedRelationKey(selected));
        const title = item.relation.relation || relationCategoryLabel(item.relation.category);
        return `<button type="button" class="rmt-relation-node${item.isUser ? ' user' : ''}${isSelected ? ' selected' : ''}" ${key ? `data-rmt-action="relation-select" data-rmt-relation-key="${core_text.esc(key)}"` : ''} style="left:${pos.x}px;top:${pos.y}px"><span class="rmt-relation-node-avatar">${item.isUser ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-solid fa-user"></i>'}</span><b>${core_text.esc(item.name || '{{user}}')}</b><small>${core_text.esc(title)}</small></button>`;
    }).join('');
    const switcher = `<div class="rmt-mode-actions"><button type="button" class="rmt-btn${activeOwner ? '' : ' active'}" data-rmt-action="relation-owner-select" data-rmt-relation-owner="">群像</button>${owners.map(name => `<button type="button" class="rmt-btn${name === activeOwner ? ' active' : ''}" data-rmt-action="relation-owner-select" data-rmt-relation-owner="${core_text.esc(name)}">${core_text.esc(name)}</button>`).join('')}</div>`;
    return `<section class="rmt-relation-garden-wrap">
      ${switcher}
      <div class="rmt-relation-legend"><span><i class="dynamic"></i>本世界线关系</span></div>
      <div class="rmt-relation-garden-scroll" aria-label="人际关系图，可横向或纵向滚动查看">
      <div class="rmt-relation-garden rmt-relation-garden-group" style="width:${layout.width}px;height:${layout.height}px;min-height:${layout.height}px">
        <svg class="rmt-relation-edges" viewBox="0 0 ${layout.width} ${layout.height}" preserveAspectRatio="none" aria-hidden="true">${edges}</svg>
        ${avatarUrl && owners.length === 1 ? `<div class="rmt-relation-center"><img src="${core_text.esc(avatarUrl)}" alt=""></div>` : ''}
        ${ownerNodes}${targetNodes}
      </div></div>
      ${ownedRelationDetail(selected)}
    </section>`;
}

export function cardRelationSourcesHtml(profileRelations = [], settingRelations = []) {
    const profileItems = (profileRelations || []).map(item => `<li><b>${core_text.esc(item.name)}</b><span>${core_text.esc(item.relation || '固定设定')}</span></li>`).join('');
    const settingItems = (settingRelations || []).map(item => `<li><b>${core_text.esc(item.name)}</b><span>${core_text.esc(item.relation || '设定人物')}</span></li>`).join('');
    if (!profileItems && !settingItems) return '';
    return `<section class="rmt-archive-card"><div class="rmt-profile-section-head"><div><b>卡设定来源</b><small>角色卡与世界书的参考资料，不自动归到本次人物。</small></div></div>${profileItems ? `<h3>角色卡固定关系</h3><ul>${profileItems}</ul>` : ''}${settingItems ? `<h3>世界书人物</h3><ul>${settingItems}</ul>` : ''}</section>`;
}

export function characterProfileHtml({ profile, profileKey = '', characterName = '', avatarUrl = '', canGenerate = true } = {}) {
    const action = profile ? '重新读取固定设定' : '生成角色档案';
    const name = core_text.normalizeText(profile?.characterName || characterName, 120) || '角色档案';
    const knownCount = Array.isArray(profile?.facts) ? profile.facts.length : 0;
    const summaryAvatar = avatarUrl ? `<img src="${core_text.esc(avatarUrl)}" alt="">` : '<i class="fa-solid fa-user"></i>';
    if (!profile) {
        return `<details class="rmt-character-profile rmt-archive-card">
          <summary class="rmt-profile-collapse-summary"><span class="rmt-profile-collapse-avatar">${summaryAvatar}</span><span><small>CHARACTER PROFILE</small><b>${core_text.esc(name)}</b><em>尚未生成 · 点击展开</em></span><i class="fa-solid fa-chevron-down"></i></summary>
          <div class="rmt-profile-collapse-body"><div class="rmt-character-profile-empty"><div class="rmt-profile-photo">${summaryAvatar}</div><div><h2>${core_text.esc(name)}</h2>${canGenerate ? `<button type="button" class="rmt-btn" data-rmt-action="character-profile-generate" data-rmt-profile-key="${core_text.esc(profileKey)}">${action}</button>` : '<small>请先在角色分类里绑定正确的 SillyTavern char。</small>'}</div></div></div>
        </details>`;
    }
    const factMap = new Map((profile.facts || []).map(item => [normalizeProfileFactLabel(item?.label) || core_text.normalizeText(item?.label, 40), item]));
    const facts = PROFILE_FACT_ORDER.map(label => {
        const item = factMap.get(label);
        return `<div class="rmt-profile-fact${item ? '' : ' unknown'}"><small>${core_text.esc(label)}</small><b>${item ? core_text.esc(item.value) : '？？？'}</b></div>`;
    }).join('');
    return `<details class="rmt-character-profile rmt-archive-card">
      <summary class="rmt-profile-collapse-summary"><span class="rmt-profile-collapse-avatar">${summaryAvatar}</span><span><small>CHARACTER PROFILE</small><b>${core_text.esc(name)}</b><em>已读取 ${knownCount} / ${PROFILE_FACT_ORDER.length} 项固定资料 · 点击展开</em></span><i class="fa-solid fa-chevron-down"></i></summary>
      <div class="rmt-profile-collapse-body"><div class="rmt-profile-hero"><div class="rmt-profile-photo">${summaryAvatar}</div><div class="rmt-profile-copy"><h2>${core_text.esc(name)}</h2>${profile.introduction ? `<p>${core_text.esc(profile.introduction)}</p>` : ''}<div class="rmt-profile-facts">${facts}</div><button type="button" class="rmt-btn" data-rmt-action="character-profile-generate" data-rmt-profile-key="${core_text.esc(profileKey)}">${action}</button></div></div></div>
    </details>`;
}

export function worldlineDiscoveriesHtml(discoveries = []) {
    const items = Array.isArray(discoveries) ? discoveries.slice(0, 16) : [];
    if (!items.length) {
        return `<section class="rmt-archive-card rmt-profile-discoveries"><div class="rmt-profile-section-head"><div><b>这个世界线了解到的他</b><small>只显示当前聊天档案中后来明确得知、并能回指 Mxxx 的资料。</small></div><span>0</span></div><div class="rmt-profile-discovery-empty">还没有可验证的新资料。角色卡 / 世界书里的固定资料仍在上层 Character Profile 中。</div></section>`;
    }
    const cards = items.map(item => `<article class="rmt-profile-discovery"><div><small>${core_text.esc(item.label)}</small><b>${core_text.esc(item.value)}</b></div>${item.summary ? `<p>${core_text.esc(item.summary)}</p>` : ''}<i>${core_text.esc((item.sourceMemoryIds || []).join(' · '))}${item.sourceMemoryAnchor ? ` · ${core_text.esc(item.sourceMemoryAnchor)}` : ''}</i></article>`).join('');
    return `<section class="rmt-archive-card rmt-profile-discoveries"><div class="rmt-profile-section-head"><div><b>这个世界线了解到的他</b><small>这些资料只属于当前聊天窗口，不会自动写进其它世界线的公共 Profile。</small></div><span>${items.length}</span></div><div class="rmt-profile-discovery-grid">${cards}</div></section>`;
}

export function renderRelations() {
    const session = runtimeState.activeSession;
    if (!session || session.kind !== core_constants.MODE.RELATIONS) return;
    const context = core_context.getContext();
    const { profile, characterName, avatarName } = relationsViewIdentity(session, runtimeState.activeArchiveSnapshot, context);
    let avatarUrl = '';
    try { avatarUrl = avatarName ? (context.getThumbnailUrl?.('avatar', avatarName) || '') : ''; } catch {}
    const selectedKey = core_text.normalizeText(runtimeState.relationSelectedKey, 160);
    const selectedOwner = core_text.normalizeText(runtimeState.relationSelectedOwner, 120);
    ui_overlay.setBackVisible(true, runtimeState.activeArchiveSnapshot ? (runtimeState.activeArchiveReadOnly ? '只读档案' : '档案') : '当前档案');
    ui_overlay.topTitle('人际庭园');
    ui_overlay.bodyEl().innerHTML = `<div class="rmt-relations-mode">
      <section class="rmt-archive-card rmt-relations-head"><div><div class="rmt-archive-kicker">RELATION GARDEN</div><h2>人际庭园</h2><p>群像共用一张关系网；可切换查看每位人物的关系。</p></div>${runtimeState.activeArchiveSnapshot && runtimeState.activeArchiveReadOnly ? '' : '<button type="button" class="rmt-btn" data-rmt-action="regenerate">刷新本世界线关系 / 资料</button>'}</section>
      ${worldlineDiscoveriesHtml(session.discoveries || [])}
      ${cardRelationSourcesHtml(profile?.relationships || [], session.settingRelationships || [])}
      ${relationGardenHtml({ characterName, avatarUrl, participantNames: session.participantNames || [], sharedRelations: [...(session.settingRelationships || []), ...(profile?.relationships || [])], dynamicRelations: session.relationships || [], selectedKey, selectedOwner })}
    </div>`;
}
