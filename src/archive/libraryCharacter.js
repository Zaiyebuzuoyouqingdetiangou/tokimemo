import * as archive_groups from './groups.js';
import * as archive_inheritance from './inheritance.js';
import * as archive_backupStore from './backupStore.js';
import * as archive_repository from './repository.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as generation_jsonParser from '../generation/jsonParser.js';
import * as modes_room from '../modes/room.js';
import * as modes_relations from '../modes/relations.js';
import * as ui_overlay from '../ui/overlay.js';
import * as archive_avatars from '../ui/archiveAvatars.js';
import * as ui_phoneView from '../ui/phoneView.js';
import * as ui_endingView from '../ui/endingView.js';
// 档案室角色页与快照：角色页、分类管理、快照缓存、恢复草稿入口、档案目标冻结
// 从 archive/library.js 原样搬出（重构阶段 2），声明文本一字未改；archive/library.js 仍转发原有导出。

export function showArchiveCharacter(groupId) {
    modes_room.stopRoomClock(); ui_phoneView.stopPhoneClock(); ui_endingView.closeEndingEasterEgg({ restoreFocus: false });
    runtimeState.activeMode = null;
    runtimeState.activeSession = null;
    runtimeState.activeArchiveSnapshot = null;
    runtimeState.activeArchiveReadOnly = true;
    const key = core_text.normalizeText(groupId, 120); if (runtimeState.archiveLibraryCharacterKey !== key) runtimeState.archiveCharacterRelationSelection = ''; runtimeState.archiveLibraryCharacterKey = key; runtimeState.archiveViewLevel = 'character';
    ui_overlay.openOverlay(); ui_overlay.setRegenerateVisible(false); ui_overlay.setManageVisible(false); ui_overlay.setBackVisible(true, '所有角色');
    const context = core_context.getContext();
    const entries = archive_groups.archiveGroupEntries(key, context).sort((a,b)=>b.updatedAt-a.updatedAt);
    const meta = archive_groups.archiveGroupMeta(key, entries, context);
    const name = core_text.normalizeText(meta.label || meta.characterName || entries[0]?.characterName, 120) || '角色档案'; ui_overlay.topTitle(`心迹回廊 · ${name}`);
    const body = ui_overlay.bodyEl(); if (!body) return;
    const charAvatar = archive_groups.archiveGroupAvatarUrl(meta, entries[0] || null, context);
    const profileKey = modes_relations.archiveCharacterProfileKey(key, meta, entries);
    let profile = modes_relations.getCharacterProfile(context, profileKey);
    const expectedProfileName = core_text.normalizeText(meta?.characterName || name, 120);
    const expectedProfileAvatar = core_text.normalizeText(meta?.avatar || core_context.archiveStoredAvatar(entries[0]), 300);
    const hintedDescriptor = Number(meta.characterIndexHint) >= 0 ? archive_groups.characterDescriptor(context, Number(meta.characterIndexHint)) : null;
    const safeHintedDescriptor = hintedDescriptor
        && (!expectedProfileName || hintedDescriptor.name === expectedProfileName)
        && (!expectedProfileAvatar || hintedDescriptor.avatar === expectedProfileAvatar)
        ? hintedDescriptor : null;
    const matchedDescriptor = entries.map(item => archive_groups.matchArchiveEntryToCharacter(item, context)).find(Boolean) || safeHintedDescriptor;
    if (profile && matchedDescriptor) profile = modes_relations.patchCharacterProfileFromCard(context, profile, matchedDescriptor.index);
    const canGenerateProfile = !!matchedDescriptor;
    const profileHtml = modes_relations.characterProfileHtml({ profile, profileKey, characterName: name, avatarUrl: charAvatar, canGenerate: canGenerateProfile });
    // r84.74: 当前聊天还没有档案、且这个角色页里有可继承的旧档案时，把“继承”入口固定放在这里，
    // 不用再回档案室最底部找。判断沿用 archive/inheritance.js 的候选规则（同角色卡位置与头像）。
    let inheritHtml = '';
    try {
        const current = core_context.currentCharacterGuard();
        const entryIds = new Set(entries.map(item => core_context.archiveIndexEntryId(item)));
        if (!archive_repository.getImportedMemory(current)
            && archive_inheritance.inheritanceCandidates(current).some(candidate => entryIds.has(core_context.archiveIndexEntryId(candidate)))) {
            inheritHtml = `<section class="rmt-archive-card rmt-current-archive-card rmt-character-inherit-card"><div><b>当前聊天还没有档案</b><small>可以把这个角色某个旧聊天的档案复制过来，旧档案保持原样。</small></div><div class="rmt-current-archive-actions"><button type="button" class="rmt-btn" data-rmt-action="archive-inheritance-open">从这个角色的旧聊天继承…</button></div></section>`;
        }
    } catch {}
    const rows = entries.map(item => `<button type="button" class="rmt-archive-overview-item" data-rmt-indexed-chat="${core_text.esc(item.chatId)}" data-rmt-indexed-character="${core_text.esc(item.characterKey)}" data-rmt-indexed-entry="${core_text.esc(core_context.archiveIndexEntryId(item))}"><span class="rmt-overview-dot">●</span><span><b>${core_text.esc(item.archiveName)}</b><small>${core_text.esc(item.characterName)} · ${core_text.esc(item.chatId)} · ${item.memoryCount} 条记忆 · ${core_text.esc(ui_overlay.formatArchiveTime(item.updatedAt))}</small></span><i class="fa-solid fa-chevron-right"></i></button>`).join('');
    body.innerHTML = `<div class="rmt-archive-room">${profileHtml}${inheritHtml}<section class="rmt-archive-card rmt-character-chat-archives"><div class="rmt-character-heart-head"><button type="button" class="rmt-character-heart-avatar" data-rmt-avatar-talk="${core_text.esc(key)}" aria-label="和角色说话">${charAvatar ? `<img src="${core_text.esc(charAvatar)}" alt="">` : '<i class="fa-solid fa-user"></i>'}<span><i class="fa-solid fa-comment-dots"></i></span></button><div><div class="rmt-archive-kicker">CHAT ARCHIVES</div><strong class="rmt-archive-title">${core_text.esc(name)} · 不同聊天世界线</strong></div></div><div style="margin:10px 0"><button type="button" class="rmt-btn" data-rmt-action="archive-group-manager">管理角色分类</button></div><div class="rmt-archive-overview-list" style="max-height:none">${rows || '<div class="rmt-archive-overview-empty">这个角色组还没有已索引档案。</div>'}</div></section></div>`;
}

export function showArchiveGroupManager() {
    const context = core_context.getContext();
    const overlay = document.getElementById(core_constants.OVERLAY_ID);
    if (!overlay) return;
    overlay.querySelector('.rmt-archive-group-manager')?.remove();
    const items = archive_groups.getArchiveIndex(context).sort((a,b) => b.updatedAt - a.updatedAt);
    const registered = archive_groups.getArchiveGroups(context);
    const groupMap = new Map(registered.map(group => [group.id, group]));
    for (const item of items) {
        const id = archive_groups.archiveGroupKeyForEntry(item);
        if (!groupMap.has(id)) groupMap.set(id, archive_groups.archiveGroupMeta(id, [item], context));
    }
    const groups = [...groupMap.values()].sort((a,b) => String(a.label).localeCompare(String(b.label), 'zh-CN'));
    const groupOptions = groups.map(group => `<option value="${core_text.esc(group.id)}">${core_text.esc(group.label)}${group.manual ? ' · 手动' : ' · 自动'}</option>`).join('');
    const characterOptions = (Array.isArray(context.characters) ? context.characters : []).map((_, index) => archive_groups.characterDescriptor(context, index)).filter(Boolean).map(item => `<option value="${item.index}">${core_text.esc(item.name)} · #${item.index + 1}${item.avatar ? ` · ${core_text.esc(item.avatar)}` : ''}</option>`).join('');
    const rows = items.map(item => {
        const entryId = core_context.archiveIndexEntryId(item);
        const ambiguous = archive_groups.archiveEntryNeedsManualClassification(item, context);
        const live = (() => { try { return generation_imageGeneration.indexedArchiveMatchesCurrentChat(item, context); } catch { return false; } })();
        const status = item.archiveGroupManual ? '手动归类' : ambiguous ? '待手动分类' : '自动归类';
        return `<article class="rmt-archive-group-entry"><div><b>${core_text.esc(item.archiveName)}</b><small>${core_text.esc(item.characterName)} · ${core_text.esc(item.chatId)} · ${status}${item.characterFingerprint ? ' · 已绑定角色卡指纹' : ''}</small></div><div class="rmt-archive-group-entry-actions"><select class="text_pole" data-rmt-archive-move-select="${core_text.esc(entryId)}"><option value="__AUTO__">恢复自动分类</option>${groupOptions}</select><button type="button" class="rmt-btn" data-rmt-action="archive-group-move" data-rmt-archive-entry-id="${core_text.esc(entryId)}">移动</button><button type="button" class="rmt-btn" data-rmt-action="${live ? 'archive-delete-live' : 'archive-remove-index'}" data-rmt-archive-entry-id="${core_text.esc(entryId)}">${live ? '删除心迹回廊档案' : '从档案室移除'}</button></div></article>`;
    }).join('');
    const modal = document.createElement('div');
    modal.className = 'rmt-archive-group-manager';
    modal.innerHTML = `<div class="rmt-memory-wi-picker-card"><div class="rmt-memory-wi-picker-head"><div><b>角色档案分类</b><small>自动分类 / 手动移动 / 绑定 SillyTavern 角色新建组</small></div><button type="button" class="rmt-btn" data-rmt-action="archive-group-close">完成</button></div><div class="rmt-memory-wi-picker-note">只整理心迹回廊的档案索引，不改酒馆聊天；无法可靠识别时保留为待手动分类。</div><div class="rmt-archive-group-create"><select class="text_pole" data-rmt-archive-new-character><option value="">选择一个 SillyTavern char…</option>${characterOptions}</select><button type="button" class="rmt-btn" data-rmt-action="archive-group-create">按所选 char 新建组</button><button type="button" class="rmt-btn" data-rmt-action="archive-auto-classify">自动分类未锁定档案</button></div><div class="rmt-archive-group-entries">${rows || '<div class="rmt-memory-wi-empty">还没有档案可以分类。</div>'}</div></div>`;
    overlay.appendChild(modal);
    for (const select of modal.querySelectorAll('[data-rmt-archive-move-select]')) {
        const item = items.find(entry => core_context.archiveIndexEntryId(entry) === select.dataset.rmtArchiveMoveSelect);
        if (item) select.value = item.archiveGroupManual ? archive_groups.archiveGroupKeyForEntry(item) : '__AUTO__';
    }
}

export function archiveSnapshotCacheKey(entry) {
    const entryId = core_text.normalizeText(entry?.entryId, 120) || core_context.archiveIndexEntryId(entry);
    return `${entryId}|${core_context.comparableChatId(entry?.chatId)}`;
}

export function rememberArchiveSnapshot(snapshot) {
    const key = archiveSnapshotCacheKey(snapshot);
    if (!key || key === '|') return snapshot;
    runtimeState.archiveSnapshotCache.delete(key);
    runtimeState.archiveSnapshotCache.set(key, snapshot);
    while (runtimeState.archiveSnapshotCache.size > core_constants.ARCHIVE_SNAPSHOT_CACHE_MAX) {
        runtimeState.archiveSnapshotCache.delete(runtimeState.archiveSnapshotCache.keys().next().value);
    }
    return snapshot;
}

const CONTENT_DRAFT_FIELD_LABELS = Object.freeze({
    title: '标题', subtitle: '副标题', label: '名称', name: '名称', date: '日期', setting: '场景', scene: '场景',
    description: '说明', desc: '画面说明', summary: '摘要', text: '正文', line: '台词', lines: '台词',
    body: '正文', greeting: '称呼', closing: '结尾', monologue: '独白', intervention: '回应', systemNote: '观测批语',
    preview: '摘要', detail: '正文', caption: '图片说明', imageCaption: '图片说明', cgDesc: '画面说明',
    unlockCondition: '达成条件', hint: '提示', hintLines: '提示', comments: '共同回忆',
    lyrics: '歌词', vocalDescription: '演唱描述', styleDescription: '音乐描述',
    speaker: '说话人', role: '说话人', value: '内容', content: '正文', message: '留言',
    dialogueLines: '台词', script: '对话', action: '动作', narration: '叙述',
    endingScene: '终章', confession: '告白', confessionText: '告白', confessionLines: '告白台词',
    creditsLine: '落幕语', timeSkip: '时间跨度', finalLine: '结语', unlockHint: '解锁提示',
    responseSummary: '回应', afterEffect: '后续影响', statusLine: '状态', logs: '记录', poem: '短句',
    pulse: '心跳反馈', hover: '悬停反馈', reveal: '揭示反馈', stabilize: '稳定反馈', pause: '暂停反馈', resume: '继续反馈',
    tags: '标签', opening: '开场', location: '地点', ending: '结尾',
    imagePrompt: '生图提示', flatPrompt: '生图提示', sceneTags: '场景标签', tag: '人物标签', nl: '画面描述',
});

export function contentRegenerationDraftHtml(journal) {
    const esc = core_text.esc;
    const sections = [];
    const pointerPart = key => String(key).replace(/~/g, '~0').replace(/\//g, '~1');
    for (const segment of journal?.segments || []) {
        if (!['complete', 'truncated'].includes(segment.state)) continue;
        const parsed = generation_jsonParser.parsePartialJsonObject(segment.state === 'complete' ? segment.rawJson : segment.partial);
        const fields = [];
        const visit = (value, pointer = '', field = '') => {
            if (typeof value === 'string') {
                if (value && CONTENT_DRAFT_FIELD_LABELS[field] && parsed.has(pointer)) fields.push(
                    `<article data-rmt-content-draft-field="${esc(pointer)}"><h4>${esc(CONTENT_DRAFT_FIELD_LABELS[field])}</h4><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(value)}</p></article>`);
            } else if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${pointer}/${index}`, field));
            else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) visit(item, `${pointer}/${pointerPart(key)}`, key);
        };
        visit(parsed.partialValue);
        if (fields.length) sections.push(`<section class="rmt-archive-card"><h3>第 ${sections.length + 1} 段 · ${segment.state === 'complete' ? '已保存的分段' : '已收到的完整字段'}</h3>${fields.join('')}</section>`);
    }
    return `<div class="rmt-content-draft-reader" data-rmt-content-draft-reader="${esc(journal?.draftId || '')}"><section class="rmt-recovery-status"><h2>单项重新生成 · 已收到的正文</h2><p>本项尚未完成，父草稿中的原内容没有被替换。这里只展示已完整收到的字段和段落；未写完的字段仍保存在原草稿中。</p><p>查看不会调用生成 API。完成本项校验并保存后，才会替换原草稿中的对应内容。</p></section>${sections.join('') || '<p>尚未收到可独立阅读的完整字段或段落，原草稿仍保留。</p>'}</div>`;
}

// An archive checkpoint is a reader, never a formal bank or writable archive
// snapshot. Its values were received from the original request; opening it does
// not issue a provider request or assign memory IDs to uncommitted entries.
export function archiveRecoveryDraftHtml(record) {
    const esc = core_text.esc;
    const paragraph = value => `<p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(value || '')}</p>`;
    const fields = { archiveName: '档案名称', archiveSummary: '已收到的摘要', archiveVerdict: '档案简介', verdictStyle: '叙述风格' };
    const readings = { char: '人物', user: '你', relation: '关系', tension: '张力', direction: '走向' };
    const sections = (record.sections || []).map(section => {
        if (section.kind === 'profile') return `<section class="rmt-archive-card"><h3>简介 · ${section.complete ? '已收到完整回复' : '已收到的完整字段'}</h3>${Object.entries(section.fields).map(([key, value]) => `<h4>${esc(fields[key] || key)}</h4>${paragraph(value)}`).join('')}${Object.entries(section.readings).map(([key, value]) => `<h4>${esc(readings[key] || key)}</h4>${paragraph(value)}`).join('')}${section.keywords.length ? paragraph(section.keywords.join(' · ')) : ''}</section>`;
        return `<section class="rmt-archive-card"><h3>${esc(section.label)}</h3>${section.kind === 'unverified' ? '<p>原来源字段不足以复核；以下仅为已收到的完整条目，尚未作为正式记忆。</p>' : '<p>以下条目已收到并通过单条来源检查；整批尚未正式保存。</p>'}${section.items.map(item => `<article data-rmt-archive-draft-memory><h4>${esc(item.title)}</h4>${paragraph(item.date || '')}${paragraph(item.summary)}${item.anchors?.length ? `<p>原文锚点：${esc(item.anchors.join(' · '))}</p>` : ''}</article>`).join('')}</section>`;
    }).join('');
    const profile = record.profileResult?.profile;
    const independent = profile ? `<section class="rmt-archive-card"><h3>独立保存的简介成果</h3><h4>${esc(profile.archiveName)}</h4>${paragraph(profile.archiveVerdict?.text || profile.archiveSummary)}<p>使用原任务资料完成，当前正式档案未被覆盖。</p></section>` : '';
    const bank = record.archiveResult?.memoryBank;
    const archive = bank ? `<section class="rmt-archive-card" data-rmt-independent-archive-result><h3>${esc(bank.archiveName || '原任务独立记忆成果')}</h3><p>本任务整理成果独立保存，当前正式档案未被覆盖。${record.hasNextBatch ? '原任务还有下一批，可单独继续。' : '本任务的来源批次已处理。'}${record.archiveResult.baseMemoryMissing ? '旧版草稿未保存原档案基线，这里仅显示本任务收到的条目，未拿当前记忆补写。' : ''}</p>${paragraph(bank.archiveVerdict?.text || bank.archiveSummary)}${(bank.memories || []).map(item => `<article data-rmt-independent-archive-memory><h4>${esc(item.id || '')} ${esc(item.title)}</h4>${paragraph(item.date)}${paragraph(item.summary)}${item.anchors?.length ? `<p>原文锚点：${esc(item.anchors.join(' · '))}</p>` : ''}</article>`).join('')}</section>` : '';
    const canImport = record.operation === 'import' && record.stage !== 'profile-only' && record.stage !== 'profile-result'
        && (record.stage !== 'archive-result' || record.hasNextBatch);
    const canProfile = record.operation === 'profile' && record.stage !== 'profile-result'
        || record.stage === 'profile-only' || record.stage === 'archive-result' && record.profilePending;
    const continuation = !record.active ? `${canImport ? `<button type="button" class="rmt-btn" data-rmt-archive-recovery="import" data-rmt-archive-recovery-draft-id="${esc(record.draftId)}">${record.stage === 'archive-result' ? '继续原任务下一批' : '继续这份原建档草稿'}</button>` : ''}${canProfile ? `<button type="button" class="rmt-btn" data-rmt-archive-recovery="profile" data-rmt-archive-recovery-draft-id="${esc(record.draftId)}">继续这份原简介草稿</button>` : ''}${!record.durable ? `<button type="button" class="rmt-btn" data-rmt-archive-save-draft="${record.operation}">保存已收到内容（不生成）</button>` : ''}` : '';
    return `<div class="rmt-archive-draft-reader" data-rmt-archive-draft-reader="${esc(record.draftId)}"><section class="rmt-recovery-status"><h2>${record.operation === 'profile' || record.stage === 'profile-only' || record.stage === 'profile-result' ? '名称与简介' : '建档'} · 草稿正文</h2><p>原档案与已生成内容保持原样。这里只展示已完整收到的条目或字段；未完成回复不会被标为生成完成。</p><p>${record.durable ? '本机已保存。' : '本页可阅读；尚未确认本机保存，刷新前请先保存或导出。'}${record.active ? ' 原任务正在继续，收到完整片段后更新。' : ''}</p>${continuation}</section>${archive}${independent}${sections || (!archive && !independent ? '<p>尚未收到可独立阅读的完整条目或字段，原草稿仍保留。</p>' : '')}</div>`;
}

export async function openArchiveRecoveryDraft(draftId, context = core_context.currentCharacterGuard()) {
    const lifecycle = runtimeState.runtimeLifecycleEpoch, scope = core_context.chatScopeKey(context);
    const record = await archive_repository.readCurrentArchiveRecoveryDraft(draftId, context);
    core_context.assertRuntimeLifecycleCurrent(lifecycle);
    if (core_context.chatScopeKey(core_context.currentCharacterGuard()) !== scope) throw new DOMException('Chat changed', 'AbortError');
    ui_endingView.closeEndingEasterEgg({ restoreFocus: false });
    modes_room.stopRoomClock(); ui_phoneView.stopPhoneClock();
    runtimeState.activeMode = null; runtimeState.activeSession = null; runtimeState.activeArchiveSnapshot = null;
    runtimeState.activeArchiveReadOnly = true; runtimeState.archiveViewLevel = 'recovery';
    ui_overlay.openOverlay(); ui_overlay.setRegenerateVisible(false); ui_overlay.setManageVisible(false); ui_overlay.setBackVisible(true);
    ui_overlay.topTitle('心迹回廊 · 已收到的草稿正文');
    const body = ui_overlay.bodyEl(); if (body) body.innerHTML = archiveRecoveryDraftHtml(record);
    return record;
}

export async function hydrateSnapshotCache(stored, memory, wantedChatId, lifecycleEpoch) {
    core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
    let cache = {};
    if (core_cache.isCompressedCacheRecord(stored)) {
        const hydrated = await core_cache.gunzipJson(stored.data);
        core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
        if (!hydrated || typeof hydrated !== 'object') throw new Error('这个档案的已生成内容缓存无法解压。');
        cache = hydrated;
    } else if (stored && typeof stored === 'object') {
        cache = core_cache.prepareBoundedRawCache(stored).value;
    }
    if (Object.keys(cache).length) {
        if (core_text.normalizeText(cache.chatId, 240) && core_context.comparableChatId(cache.chatId) !== wantedChatId) return {};
        if (core_text.normalizeText(cache.archiveRevision, 240) && cache.archiveRevision !== memory.archiveRevision) return {};
    }
    core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
    return cache;
}

export async function fetchIndexedArchiveSnapshot(entry, context = core_context.getContext(), options = {}) {
    if (entry?.historyVersionId) throw new Error('旧版本是独立只读记录，不能刷新为当前聊天内容。');
    const lifecycleEpoch = Number.isFinite(Number(options.lifecycleEpoch))
        ? Number(options.lifecycleEpoch)
        : runtimeState.runtimeLifecycleEpoch;
    core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
    const key = archiveSnapshotCacheKey(entry);
    const cached = runtimeState.archiveSnapshotCache.get(key);
    // Only explicit opens call this path. A cached fallback must not hide a recovered
    // source; keep the old backup object readonly and fetch a new verified snapshot.
    if (options.force !== true && cached && !cached.backupOnly && Date.now() - Number(cached.loadedAt || 0) < 120000) return cached;
    const avatar = core_context.archiveEntryAvatarName(entry, context);
    const wantedChatId = core_context.comparableChatId(entry.chatId);
    if (!wantedChatId) throw new Error('无法识别这个历史聊天的文件 ID。');
    const initialBackupState = await archive_backupStore.readArchiveBackupState(entry);
    core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
    if (initialBackupState.deleted) {
        const error = new Error('这份心迹回廊档案已被明确删除，旧聊天来源不会令它重新出现。');
        error.code = 'RMT_ARCHIVE_DELETED_FENCE';
        throw error;
    }
    let sourceError = null;
    let sourceMirrorLagging = false;
    let memory = null;
    let stored = null;
    let settingBookSelection = { books: [] };
    let sourceUserAvatar = '';
    let backupRecord = initialBackupState.record || null;
    try {
        if (!avatar || typeof context.getRequestHeaders !== 'function') throw new Error('无法定位这个角色的聊天档案文件。');
        const response = await fetch('/api/chats/get', {
            method: 'POST',
            headers: context.getRequestHeaders(),
            cache: 'no-cache',
            body: JSON.stringify({ avatar_url: avatar, file_name: wantedChatId }),
        });
        if (!response.ok) throw new Error(`读取源聊天失败：HTTP ${response.status}`);
        const chat = await response.json();
        core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
        const header = Array.isArray(chat) ? chat[0] : chat;
        const metadata = header?.chat_metadata && typeof header.chat_metadata === 'object' ? header.chat_metadata : {};
        sourceUserAvatar = archive_avatars.archiveUserAvatar(null, null, metadata);
        memory = archive_repository.migrateArchiveInMemory(metadata[core_constants.MEMORY_KEY]);
        if (!memory || core_context.comparableChatId(memory.chatId) !== wantedChatId) throw new Error('源聊天里已没有可读取的心迹回廊档案。');
        stored = metadata[core_constants.CACHE_KEY];
        settingBookSelection = archive_repository.getMemoryWorldInfoSelection({ chatMetadata: metadata });
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        sourceError = error;
    }
    // Re-read after the network await. Deletion wins immediately, while a newer canonical
    // IndexedDB memory wins over a stale source-chat metadata mirror left behind by a page
    // closing before SillyTavern's debounced metadata save completed.
    try {
        const latestBackupState = await archive_backupStore.readArchiveBackupState(entry);
        core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
        if (latestBackupState.deleted) {
            const deleted = new Error('这份心迹回廊档案已被明确删除，旧聊天来源不会令它重新出现。');
            deleted.code = 'RMT_ARCHIVE_DELETED_FENCE';
            throw deleted;
        }
        if (latestBackupState.record) backupRecord = latestBackupState.record;
    } catch (backupError) {
        if (backupError?.name === 'AbortError' || backupError?.code === 'RMT_ARCHIVE_DELETED_FENCE') throw backupError;
        console.warn('[HeartbeatMemories] independent archive backup read failed', core_text.safeErrorDiagnostic(backupError));
    }
    const backupMemory = archive_repository.migrateArchiveInMemory(backupRecord?.memory);
    if (sourceError) {
        if (!backupMemory) {
            const unavailable = new Error(`源聊天无法读取，且本机没有可用的独立档案备份。${core_text.safeErrorSummary(sourceError)} 如果这份档案从未建立过独立备份，将无法从本机恢复。`);
            unavailable.safeToDisplay = true;
            unavailable.safeUserMessage = unavailable.message;
            throw unavailable;
        }
        memory = backupMemory;
        stored = backupRecord.cache;
    } else if (backupMemory
        && backupRecord.archiveRevision !== core_text.normalizeText(memory?.archiveRevision, 240)) {
        // IndexedDB is the canonical committed archive. The source chat metadata is only an
        // asynchronous mirror, and equal/rolled-back clocks cannot establish newer ownership.
        memory = backupMemory;
        stored = backupRecord.cache;
        sourceMirrorLagging = true;
    }
    if (!memory || core_context.comparableChatId(memory.chatId) !== wantedChatId) throw new Error('独立档案备份的身份校验失败，已拒绝恢复。');
    const indexedName = core_text.normalizeText(entry?.characterName, 120);
    const memoryName = core_text.normalizeText(memory?.characterName, 120);
    if (indexedName && memoryName && indexedName !== memoryName) throw new Error('同头像下检测到不同角色身份；为避免读错聊天，已拒绝打开。请在“管理角色分类”里手动归类后再试。');
    let cache = {};
    let sourceCacheError = null;
    try { cache = await hydrateSnapshotCache(stored, memory, wantedChatId, lifecycleEpoch); }
    catch (error) {
        if (error?.name === 'AbortError') throw error;
        sourceCacheError = error;
    }
    if (!sourceError) {
        try {
            backupRecord = backupRecord || await archive_backupStore.readArchiveBackup(entry);
            core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
        }
        catch (backupError) {
            if (backupError?.name === 'AbortError') throw backupError;
            console.warn('[HeartbeatMemories] independent derived-cache backup read failed', core_text.safeErrorDiagnostic(backupError));
        }
        if (backupRecord?.cache && backupRecord.archiveRevision === memory.archiveRevision) {
            try {
                const recoveredCache = await hydrateSnapshotCache(backupRecord.cache, memory, wantedChatId, lifecycleEpoch);
                const backupWins = Object.keys(recoveredCache).length
                    && (!Object.keys(cache).length || sourceCacheError || core_cache.cacheOrderValue(backupRecord.cache) > core_cache.cacheOrderValue(stored));
                if (backupWins) {
                    cache = recoveredCache;
                    stored = backupRecord.cache;
                    sourceCacheError = null;
                }
            } catch (backupCacheError) {
                if (backupCacheError?.name === 'AbortError') throw backupCacheError;
                console.warn('[HeartbeatMemories] independent derived-cache backup hydrate failed', core_text.safeErrorDiagnostic(backupCacheError));
            }
        }
    }
    if (sourceCacheError) throw sourceCacheError;
    core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
    const snapshot = {
        entryId: core_context.archiveIndexEntryId(entry),
        archiveGroupId: archive_groups.archiveGroupKeyForEntry(entry),
        characterKey: core_text.normalizeText(entry.characterKey, 300),
        characterFingerprint: core_text.normalizeText(entry.characterFingerprint, 160),
        characterIndexHint: Number.isInteger(Number(entry.characterIndexHint)) ? Number(entry.characterIndexHint) : -1,
        avatar,
        userAvatar: archive_avatars.archiveUserAvatar(memory, entry) || (!sourceError ? sourceUserAvatar : ''),
        characterName: core_text.normalizeText(entry.characterName || memory.characterName, 120) || '未命名角色',
        chatId: wantedChatId,
        archiveName: core_text.normalizeText(memory.archiveName, 160) || archive_repository.fallbackArchiveName(memory.memories),
        memory,
        cache,
        backupOnly: !!sourceError,
        settingBookSelection: sourceError ? { books: [] } : settingBookSelection,
        sourceMirrorLagging,
        sourceError: sourceError ? core_text.safeErrorSummary(sourceError, 400) : '',
        loadedAt: Date.now(),
    };
    if (!sourceError && !sourceMirrorLagging) {
        // A successfully opened historical archive is an explicit full-runtime action, so this is
        // the safe migration point for old chat-only archives. Backup failures never hide the source.
        void archive_backupStore.seedArchiveBackup(entry, memory, stored, {
            stillCurrent: () => core_context.runtimeLifecycleStillCurrent(lifecycleEpoch),
        }).catch(error => {
            console.warn('[HeartbeatMemories] independent archive backup seed failed', core_text.safeErrorDiagnostic(error));
            globalThis.toastr?.warning?.(core_text.toastText(`档案已打开，但独立备份没有更新：${core_text.safeErrorSummary(error)}`), '心迹回廊');
        });
    }
    core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
    return rememberArchiveSnapshot(snapshot);
}

function archiveTargetCardFields(context, descriptor) {
    const character = context?.characters?.[descriptor?.index];
    const data = character?.data && typeof character.data === 'object' ? character.data : (character || {});
    const pick = (key, limit = 5000) => core_text.normalizeText(data?.[key] ?? character?.[key], limit);
    return {
        name: core_text.normalizeText(descriptor?.name || data?.name, 120),
        description: pick('description'),
        personality: pick('personality'),
        scenario: pick('scenario'),
        depth_prompt: pick('depth_prompt'),
        creator_notes: pick('creator_notes'),
        first_mes: pick('first_mes'),
        mes_example: pick('mes_example'),
        avatar: core_text.normalizeText(descriptor?.avatar || data?.avatar, 300),
    };
}

export function freezeArchiveTarget(snapshot, hostContext = core_context.getContext()) {
    if (!snapshot?.memory || snapshot.backupOnly) throw new Error('只有源聊天仍可读取的正式档案才能启动后台派生生成。');
    const entryId = core_context.archiveIndexEntryId(snapshot);
    const indexedMatches = archive_groups.getArchiveIndex(hostContext).filter(item =>
        core_context.archiveIndexEntryId(item) === entryId
        && core_context.comparableChatId(item?.chatId) === core_context.comparableChatId(snapshot?.chatId));
    const indexed = indexedMatches.length === 1 ? indexedMatches[0] : null;
    if (!indexed || archive_groups.isArchiveEntryDeletedFromLibrary(indexed, hostContext)) throw new Error('这份档案已经从档案室移除，不能启动生成。');
    const descriptor = archive_groups.matchArchiveEntryToCharacter(indexed, hostContext);
    if (!descriptor) throw new Error('无法把这份档案唯一对应到一张角色卡；请先在“管理角色分类”中完成归类。');
    const memory = structuredClone(snapshot.memory);
    const cache = structuredClone(snapshot.cache || {});
    const cardFields = archiveTargetCardFields(hostContext, descriptor);
    const sparseCharacters = new Array(Math.max(descriptor.index + 1, 1));
    sparseCharacters[descriptor.index] = { name: descriptor.name, avatar: descriptor.avatar, data: structuredClone(cardFields) };
    const target = {
        entryId,
        archiveGroupId: archive_groups.archiveGroupKeyForEntry(indexed),
        characterKey: core_text.normalizeText(indexed.characterKey, 300),
        avatar: core_context.archiveStoredAvatar(indexed),
        characterName: core_text.normalizeText(snapshot.characterName || memory.characterName, 120),
        characterFingerprint: core_text.normalizeText(indexed.characterFingerprint, 160),
        characterIndexHint: descriptor.index,
        chatId: core_context.comparableChatId(snapshot.chatId),
        archiveName: core_text.normalizeText(snapshot.archiveName || memory.archiveName, 160),
        archiveRevision: core_text.normalizeText(memory.archiveRevision, 240),
        memory,
        cache,
        backupOnly: false,
    };
    let worldPresentationProfileBinding = null;
    try {
        const groupEntries = archive_groups.archiveGroupEntries(target.archiveGroupId, hostContext);
        const groupMeta = archive_groups.archiveGroupMeta(target.archiveGroupId, groupEntries, hostContext);
        const expectedProfileKey = modes_relations.archiveCharacterProfileKey(target.archiveGroupId, groupMeta, groupEntries);
        const profile = modes_relations.getCharacterProfile(hostContext, expectedProfileKey);
        if (profile) {
            worldPresentationProfileBinding = {
                profile: structuredClone(profile),
                expectedProfileKey,
                characterName: target.characterName,
                avatar: core_text.normalizeText(descriptor.avatar, 300),
            };
        }
    } catch {}
    const context = Object.create(hostContext || null);
    Object.assign(context, {
        name1: core_text.normalizeText(memory.userName, 120) || '{{user}}',
        name2: target.characterName || '{{char}}',
        characterId: descriptor.index,
        groupId: null,
        chatId: target.chatId,
        chat: [],
        characters: sparseCharacters,
        chatMetadata: { [core_constants.MEMORY_KEY]: memory, [core_constants.CACHE_KEY]: cache,
            [core_constants.MEMORY_WORLD_INFO_SETTINGS_KEY]: structuredClone(snapshot.settingBookSelection || { books: [] }) },
        powerUserSettings: { ...(hostContext?.powerUserSettings || {}), persona_description: '' },
        getCurrentChatId: () => target.chatId,
        getCharacterCardFields: () => structuredClone(cardFields),
        getWorldInfoPrompt: undefined,
        // Always own this property, including the null case, so a frozen A task can never fall
        // through to B's live Character Profile via the prototype context.
        __rmtWorldPresentationProfileBinding: worldPresentationProfileBinding,
        __rmtArchiveTargetEntryId: entryId,
        __rmtArchiveTargetLabel: `${target.characterName || '角色'} · ${target.archiveName || '档案'}`,
    });
    if (typeof hostContext?.getRequestHeaders === 'function') context.getRequestHeaders = hostContext.getRequestHeaders.bind(hostContext);
    if (typeof hostContext?.getTokenCountAsync === 'function') context.getTokenCountAsync = hostContext.getTokenCountAsync.bind(hostContext);
    return { target: structuredClone(target), context };
}

export async function revalidateArchiveTarget(target, lifecycleEpoch = runtimeState.runtimeLifecycleEpoch) {
    core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
    const context = core_context.getContext();
    const matches = archive_groups.getArchiveIndex(context).filter(item =>
        core_context.archiveIndexEntryId(item) === core_text.normalizeText(target?.entryId, 120)
        && core_context.comparableChatId(item?.chatId) === core_context.comparableChatId(target?.chatId));
    const entry = matches.length === 1 ? matches[0] : null;
    if (!entry || archive_groups.isArchiveEntryDeletedFromLibrary(entry, context)) throw new Error('目标档案已经被删除或移除，本次旧结果没有写入。');
    const snapshot = await fetchIndexedArchiveSnapshot(entry, context, { force: true, lifecycleEpoch });
    core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
    if (snapshot.backupOnly) throw new Error('目标档案的源聊天已不可读取，本次结果没有写入只读备份。');
    if (core_context.comparableChatId(snapshot.chatId) !== core_context.comparableChatId(target?.chatId)
        || core_text.normalizeText(snapshot.memory?.archiveRevision, 240) !== core_text.normalizeText(target?.archiveRevision, 240)) {
        throw new Error('目标档案在生成期间已更新或重建，本次旧结果没有覆盖新版本。');
    }
    return snapshot;
}

export async function commitArchiveTargetSession(target, mode, session, stillCurrent = null, expectedTaskOrigin = null) {
    const committed = await core_cache.commitDetachedArchiveSession(target, mode, session, stillCurrent, expectedTaskOrigin);
    const snapshot = rememberArchiveSnapshot({ ...target, cache: committed.cache, loadedAt: Date.now() });
    if (runtimeState.activeArchiveSnapshot?.entryId === snapshot.entryId) runtimeState.activeArchiveSnapshot = snapshot;
    return snapshot;
}

export async function commitArchiveTargetSessionMutation(target, mode, expectedTaskOrigin, mutateSession, fallbackSession = null, stillCurrent = null) {
    const committed = await core_cache.commitDetachedArchiveSessionMutation(
        target,
        mode,
        expectedTaskOrigin,
        mutateSession,
        fallbackSession,
        stillCurrent,
    );
    const snapshot = rememberArchiveSnapshot({ ...target, cache: committed.cache, loadedAt: Date.now() });
    if (runtimeState.activeArchiveSnapshot?.entryId === snapshot.entryId) runtimeState.activeArchiveSnapshot = snapshot;
    return { snapshot, session: committed.session };
}

export async function claimArchiveTargetMode(target, mode, stillCurrent = null) {
    return core_cache.claimDetachedModeGeneration(target, mode, stillCurrent);
}

export function archiveTargetGenerationOptions(snapshot = runtimeState.activeArchiveSnapshot, lifecycleEpoch = runtimeState.runtimeLifecycleEpoch) {
    core_context.assertRuntimeLifecycleCurrent(lifecycleEpoch);
    const frozen = freezeArchiveTarget(snapshot, core_context.getContext());
    return {
        archiveTarget: frozen.target,
        context: frozen.context,
        revalidateArchiveTarget: (target, expectedLifecycleEpoch = lifecycleEpoch) => revalidateArchiveTarget(target, expectedLifecycleEpoch),
        claimArchiveTarget: claimArchiveTargetMode,
        commitArchiveTarget: commitArchiveTargetSession,
        commitArchiveTargetMutation: commitArchiveTargetSessionMutation,
    };
}
