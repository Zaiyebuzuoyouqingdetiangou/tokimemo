import * as archive_inheritance_view from './archiveInheritance.js';
import { applyArchiveMobileSafeArea, bindOverlayCloseFallback, bindToolbarMoreMenu, bodyEl, calendarQuickAccessHtml, closeArchiveOverlayFromUser, closeToolbarMoreMenu, confirmExplicitAction, confirmExplicitActionTwice, confirmModeRegeneration, confirmRoomLifeRefresh, decorateReadOnlyModeUi, emptyArchiveMode, formatArchiveTime, isArchiveMobileViewport, loadChooserArchiveRecovery, memoryLockPanelHtml, readableModePortals, requestParticipantSelection, requestParticipantVersions, revealArchiveOverlay, setBackVisible, setManageVisible, setRegenerateVisible, toggleToolbarMoreMenu, toolbarMoreMenu, topTitle } from './overlayShell.js';
import * as ui_workspaceState from './workspaceState.js';
import * as core_context from '../core/context.js';
import * as core_text from '../core/text.js';
import { state as runtimeState } from '../core/state.js';
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as ui_inboxView from './inboxView.js';
import * as ui_travelView from './travelView.js';
import * as ui_taskCenter from './taskCenter.js';
import * as home_view from './homeView.js';
import * as ui_heartView from './heartView.js';
import * as archive_groups from '../archive/groups.js';
import * as modes_heart from '../modes/heart.js';
import * as core_constants from '../core/constants.js';
import * as generation_client from '../generation/client.js';
import * as ui_settingsPanel from './settingsPanel.js';
import * as modes_relations from '../modes/relations.js';
import * as ui_contentManager from './contentManager.js';
import { deleteManagedTarget, recategorizeManagedTarget, refreshMemoryWorldInfoBookControls, regenerateManagedCategory, regenerateManagedTarget } from './overlayManage.js';
import * as archive_snapshots from '../archive/snapshots.js';
import * as modes_room from '../modes/room.js';
import * as ui_endingView from './endingView.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as ui_albumView from './albumView.js';
import * as cg_editor from './cgPromptEditor.js';
import * as ui_advEventView from './advEventView.js';
import * as modes_advEvent from '../modes/advEvent.js';
import * as ui_phoneView from './phoneView.js';
import * as modes_items from '../modes/items.js';
import { OVERLAY_CLICK_UNHANDLED, deleteManagedCategory, navigateBack, openCachedOrGenerate, requestCurrentArchiveFullRebuild, requestCurrentArchiveImport, showChooser } from './overlayCore.js';
import * as ui_floor from './chatFloorNav.js';
// ui/overlayCore.js handleOverlayClick 的分组处理（重构阶段 3）。每个函数是原函数里连续的一段语句，一字未改；
// 返回 OVERLAY_CLICK_UNHANDLED 表示“这一段没有处理”，原函数接着往下走，和拆分前完全相同。

// 按 data-rmt-action 分发：继承、改写、任务、首页 / 档案室、HEART、头像、当前档案、阅读、终端、记忆、角色档案、关系、管理、重建 / 导入、参与者、重新生成（原第 126–187 条语句）
function revealModuleId(achievementId) {
    try {
        const records = core_context.getContext()?.chatMetadata?.revealRecordsV1;
        const row = [...(Array.isArray(records) ? records : [])].reverse().find(item => item?.achievementId === achievementId && item?.moduleId);
        return typeof row?.moduleId === 'string' ? row.moduleId : '';
    } catch { return ''; }
}

export function overlayArchiveActions(actionEl, action) {
    if (action === 'achievement-jump') {
        const jumped = ui_floor.highlightFloor(actionEl?.dataset?.rmtFloor);
        if (!jumped.ok) globalThis.toastr?.info?.('这一楼现在翻不到。成就还在这里。', '心迹回廊');
        return;
    }
    if (action === 'achievement-open') {
        const moduleId = actionEl?.dataset?.rmtMode || revealModuleId(actionEl?.dataset?.rmtAchievementId);
        if (!moduleId) {
            globalThis.toastr?.info?.('这段成就就在这一页。', '心迹回廊');
            return;
        }
        return openCachedOrGenerate(moduleId);
    }
    if (action === 'archive-inheritance-open') {
        archive_inheritance_view.clearArchiveInheritancePreview();
        if (bodyEl()) bodyEl().innerHTML = archive_inheritance_view.archiveInheritancePickerHtml();
        return;
    }
    if (action === 'archive-inheritance-preview' || action === 'archive-inheritance-confirm') {
        return void (async () => {
        const targetBody = bodyEl(), epoch = ui_workspaceState.workspace.epoch;
        const scope = core_context.chatScopeKey(core_context.getContext());
        const stillHere = () => targetBody?.isConnected && bodyEl() === targetBody && ui_workspaceState.workspace.epoch === epoch
            && core_context.chatScopeKey(core_context.getContext()) === scope && actionEl.isConnected;
        actionEl.disabled = true;
        try {
            if (action === 'archive-inheritance-preview') {
                const preview = await archive_inheritance_view.prepareArchiveInheritancePreview(actionEl.dataset.rmtInheritanceEntry);
                if (stillHere()) targetBody.innerHTML = archive_inheritance_view.archiveInheritancePreviewHtml(preview);
                else archive_inheritance_view.clearArchiveInheritancePreview();
            } else {
                await archive_inheritance_view.commitArchiveInheritance();
                if (stillHere()) showChooser();
            }
        } catch (error) { globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'); }
        finally { if (actionEl.isConnected) actionEl.disabled = false; }
        })();
    }
    if (action === 'rewrite-archive-verdict') {
        if (runtimeState.activeArchiveSnapshot && !archive_library.requireWritableArchiveAction()) return;
        if (!confirmExplicitAction('重写这份档案的简介？', '只读取已归档经历，使用当前独立 API；记忆和其他已生成内容保持不变。')) return;
        return archive_repository.rewriteCurrentArchiveVerdict();
    }
    if (runtimeState.activeArchiveSnapshot && ['regenerate', 'draw-cg', 'clear-cg-image', 'draw-heart-strip', 'clear-heart-strip', 'room-life-refresh', 'room-schema-upgrade', 'import-memory', 'full-rebuild-memory', 'read-memory-plugins', 'memory-worldinfo-picker', 'refresh-ending-confessions'].includes(action)) {
        if (!archive_library.requireWritableArchiveAction()) return;
    }
    if (action === 'inbox-back') return ui_inboxView.closeInboxLetter();
    if (action === 'back') return navigateBack();
    if (action === 'travel-close-detail') return ui_travelView.closeTravelDetail();
    if (action === 'travel-dialogue-prev') return ui_travelView.travelDialogueStep(-1);
    if (action === 'travel-dialogue-next') return ui_travelView.travelDialogueStep(1);
    if (action === 'travel-dialogue-replay') return ui_travelView.replayTravelDialogue();
    if (action === 'tasks' || action === 'task-center-close' || action === 'task-cancel' || action === 'task-cancel-current' || action === 'task-open' || action === 'task-second-step' || action === 'task-queue-remove' || action === 'task-clear-done' || action === 'task-retry-state' || action === 'task-floor-complete' || action === 'task-floor-retry' || action === 'queue-selected' || action === 'generate-together' || action === 'merged-repair' || action === 'merged-resave' || ['merged-discard', 'merged-new', 'merged-export', 'merged-export-legacy', 'merged-discard-legacy'].includes(action)) {
        return ui_taskCenter.handleTaskCenterAction(action, actionEl);
    }
    if (action === 'close') return closeArchiveOverlayFromUser();
    if (action === 'home') {
        if (runtimeState.busy) runtimeState.activeTaskBackgrounded = true;
        return home_view.showHome();
    }
    if (action === 'library-home') {
        if (runtimeState.busy) runtimeState.activeTaskBackgrounded = true;
        return archive_library.showArchiveLibrary();
    }
    if (action === 'archive-character-back') return runtimeState.archiveLibraryCharacterKey ? archive_library.showArchiveCharacter(runtimeState.archiveLibraryCharacterKey) : archive_library.showArchiveLibrary();
    if (action === 'open-heart') return ui_heartView.openHeartMode();
    if (action === 'heart-avatar-talk') {
        const key = runtimeState.activeArchiveSnapshot?.archiveGroupId || (() => { try { return archive_groups.currentArchiveGroupKey(core_context.getContext()); } catch { return ''; } })();
        return void ui_heartView.showAvatarDialogueForCharacter(key);
    }
    if (action === 'heart-generate-part') return void modes_heart.generateHeartSection(actionEl.dataset.rmtHeartPart || 'dialogues');
    if (action === 'heart-add-language') {
        const category = bodyEl()?.querySelector('[data-rmt-language-category]')?.value || '';
        return void modes_heart.generateHeartSection('dialogues', { languageCategory: category });
    }
    if (action === 'heart-generate-language') return void modes_heart.generateHeartSection('dialogues', {
        replaceDialogues: actionEl.dataset.rmtHeartLanguageReplace === '1',
    });
    if (action === 'heart-generate-season') return void modes_heart.generateHeartSeasonSection(actionEl.dataset.rmtHeartSeasonTarget || 'postending', { secondStep: actionEl.dataset.rmtHeartSecondStep === 'true' });
    if (action === 'heart-drama-prev') return ui_heartView.heartStepDrama(-1);
    if (action === 'heart-drama-next') return ui_heartView.heartStepDrama(1);
    if (action === 'heart-firefly-prev') return ui_heartView.heartStepFireflyPage(-1);
    if (action === 'heart-firefly-next') return ui_heartView.heartStepFireflyPage(1);
    if (action === 'avatar-talk-again') return ui_heartView.renderAvatarDialoguePopup(runtimeState.activeAvatarDialogue, { repeat: true });
    if (action === 'avatar-heart-open') return ui_heartView.openHeartFromAvatar();
    if (action === 'avatar-heart-generate') return ui_heartView.openHeartFromAvatar();
    if (action === 'avatar-heart-open-archive') {
        const state = runtimeState.activeAvatarDialogue;
        bodyEl()?.querySelector('.rmt-avatar-dialog-pop')?.remove();
        runtimeState.activeAvatarDialogue = null;
        if (state?.snapshot) return archive_library.showIndexedArchiveSnapshot(state.snapshot);
        if (state?.entry) return void archive_library.openIndexedArchive(state.entry.characterKey, state.entry.chatId, core_context.archiveIndexEntryId(state.entry));
        return archive_library.showArchiveLibrary();
    }
    if (action === 'avatar-dialog-close') {
        bodyEl()?.querySelector('.rmt-avatar-dialog-pop')?.remove();
        runtimeState.activeAvatarDialogue = null;
        return;
    }
    if (action === 'current-archive') return showChooser();
    if (action === 'current-archive-import') return requestCurrentArchiveImport();
    if (action === 'current-archive-delete') {
        void archive_groups.deleteCurrentHeartbeatArchive('').then(deleted => {
            if (!deleted) return;
            globalThis.toastr?.success?.('当前聊天的心迹回廊档案已删除；聊天正文没有删除。', '心迹回廊');
            archive_library.showArchiveLibrary();
        }).catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'));
        return;
    }
    if (action === 'read-memory-plugins') return void archive_repository.readCurrentChatMemoryPlugins().catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'));
    if (action === 'phone-fill-missing' || action === 'room-refresh-figure') {
        if (!archive_library.requireWritableArchiveAction()) return;
        const mode = action === 'phone-fill-missing' ? core_constants.MODE.PHONE : core_constants.MODE.ROOM;
        const extra = runtimeState.activeArchiveSnapshot ? archive_library.archiveTargetGenerationOptions(runtimeState.activeArchiveSnapshot) : {};
        return void generation_client.generateMode(mode, { ...extra, background: false, fillMissing: action === 'phone-fill-missing', visualOnly: action === 'room-refresh-figure' }).catch(error => {
            if (!error?.notified) globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊');
        });
    }
    if (action === 'memory-worldinfo-picker') return void archive_repository.showMemoryWorldInfoPicker();
    if (action === 'memory-worldinfo-close') {
        document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-memory-wi-picker`)?.remove();
        if (runtimeState.archiveViewLevel === 'home') { void ui_settingsPanel.refreshMemoryIngressUi(); return; }
        return showChooser();
    }
    if (action === 'memory-worldinfo-expand') return void archive_repository.expandMemoryWorldInfoBook(actionEl);
    if (action === 'archive-group-manager') return archive_library.showArchiveGroupManager();
    if (action === 'archive-group-close') { document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-archive-group-manager`)?.remove(); return archive_library.showArchiveLibrary(); }
    if (action === 'archive-character-delete') {
        const groupId = core_text.normalizeText(actionEl.dataset.rmtArchiveGroupId, 120);
        void archive_groups.deleteArchiveCharacterFromLibrary(groupId).then(deleted => {
            if (!deleted) return;
            globalThis.toastr?.success?.(`已从档案室删除“${deleted.name}”、其 ${deleted.count} 个聊天档案索引及独立备份；SillyTavern 正文聊天窗口没有删除。`, '心迹回廊');
            archive_library.showArchiveLibrary();
        }).catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'));
        return;
    }
    if (action === 'character-profile-generate') {
        const groupId = core_text.normalizeText(runtimeState.archiveLibraryCharacterKey, 120);
        if (!groupId) return globalThis.toastr?.info?.('请先打开一个角色档案。', '心迹回廊');
        if (!confirmExplicitAction('读取角色固定设定并更新 Character Profile？', '只会读取该角色卡、当前 User Persona 与本轮激活到的相关世界书，整理全窗口共用的客观资料，并保存故事开始前已经明确成立的固定关系供各聊天的人际庭园合并显示。不会读取聊天正文，也不会把某个聊天窗口的发展写进公共角色档案。', { destructive: false })) return;
        void modes_relations.generateCharacterProfileForGroup(groupId).then(() => {
            globalThis.toastr?.success?.('角色固定资料已更新；固定关系会在各聊天的人际庭园中合并显示。', '心迹回廊');
            archive_library.showArchiveCharacter(groupId);
        }).catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊 · Character Profile'));
        return;
    }
    if (action === 'relation-owner-select') {
        if (runtimeState.activeMode !== core_constants.MODE.RELATIONS) return;
        runtimeState.relationSelectedOwner = actionEl.dataset.rmtRelationOwner || '';
        runtimeState.relationSelectedKey = '';
        return modes_relations.renderRelations();
    }
    if (action === 'relation-select') {
        const key = core_text.normalizeText(actionEl.dataset.rmtRelationKey, 160);
        if (runtimeState.activeMode === core_constants.MODE.RELATIONS) {
            runtimeState.relationSelectedKey = key;
            return modes_relations.renderRelations();
        }
        return;
    }
    if (action === 'archive-auto-classify') {
        const changed = archive_groups.autoClassifyArchiveIndex(core_context.getContext(), { confirm: true });
        if (changed) globalThis.toastr?.success?.(`已自动分类 ${changed} 个档案索引。聊天文件没有移动。`, '心迹回廊');
        const manager = document.querySelector(`#${core_constants.OVERLAY_ID} .rmt-archive-group-manager`);
        return manager ? archive_library.showArchiveGroupManager() : archive_library.showArchiveLibrary();
    }
    if (action === 'archive-group-create') {
        const select = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-archive-new-character]`);
        if (!select?.value) return globalThis.toastr?.info?.('先选择一个 SillyTavern char。', '心迹回廊');
        try { archive_groups.createArchiveGroupForCharacter(core_context.getContext(), Number(select.value)); globalThis.toastr?.success?.('已新建角色档案组。现在可以把档案移动进去。', '心迹回廊'); archive_library.showArchiveGroupManager(); }
        catch (error) { globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'); }
        return;
    }
    if (action === 'archive-group-move') {
        const entryId = core_text.normalizeText(actionEl.dataset.rmtArchiveEntryId, 120);
        const select = [...document.querySelectorAll(`#${core_constants.OVERLAY_ID} [data-rmt-archive-move-select]`)].find(node => node.dataset.rmtArchiveMoveSelect === entryId);
        try { archive_groups.moveArchiveIndexEntryToGroup(core_context.getContext(), entryId, select?.value || '__AUTO__'); globalThis.toastr?.success?.('档案分类已更新；聊天文件没有移动。', '心迹回廊'); archive_library.showArchiveGroupManager(); }
        catch (error) { globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'); }
        return;
    }
    if (action === 'archive-remove-index') {
        const entryId = core_text.normalizeText(actionEl.dataset.rmtArchiveEntryId, 120);
        try {
            if (archive_groups.removeIndexedArchiveFromLibrary(entryId)) {
                globalThis.toastr?.success?.('已从档案室移除索引；聊天文件和真实档案未删除。', '心迹回廊');
                archive_library.showArchiveGroupManager();
            }
        } catch (error) { globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'); }
        return;
    }
    if (action === 'archive-delete-live') {
        const entryId = core_text.normalizeText(actionEl.dataset.rmtArchiveEntryId, 120);
        void archive_groups.deleteCurrentHeartbeatArchive(entryId).then(deleted => {
            if (!deleted) return;
            globalThis.toastr?.success?.('当前聊天的心迹回廊档案已删除；聊天正文没有删除。', '心迹回廊');
            archive_library.showArchiveLibrary();
        }).catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'));
        return;
    }
    if (action === 'manage') {
        if (!runtimeState.activeMode || !runtimeState.activeSession || !archive_library.requireWritableArchiveAction()) return;
        return ui_contentManager.renderContentManager();
    }
    if (action === 'manage-regenerate-category') return void regenerateManagedCategory();
    if (action === 'manage-delete-category') return void deleteManagedCategory();
    if (action === 'manage-regenerate-target') return void regenerateManagedTarget(actionEl.dataset.rmtManageType, actionEl.dataset.rmtManageId, actionEl.dataset.rmtManageParent);
    if (action === 'manage-recategorize-target') return void recategorizeManagedTarget(actionEl.dataset.rmtManageId, actionEl.dataset.rmtManageParent);
    if (action === 'manage-delete-target') return void deleteManagedTarget(actionEl.dataset.rmtManageType, actionEl.dataset.rmtManageId, actionEl.dataset.rmtManageParent);
    if (action === 'rebuild-archive-index') return void archive_library.rebuildArchiveIndexFromExisting();
    if (action === 'import-memory') return requestCurrentArchiveImport();
    if (action === 'participants-picker') return void requestParticipantSelection().catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'));
    if (action === 'participants-versions') return void requestParticipantVersions().catch(error => globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊'));
    if (action === 'full-rebuild-memory') return requestCurrentArchiveFullRebuild();
    if (action === 'archive-overview-refresh') return archive_snapshots.renderArchiveOverviewAsync({ force: true });
    if (action === 'regenerate') {
        if (!runtimeState.activeMode || !confirmModeRegeneration(runtimeState.activeMode)) return;
        if (runtimeState.activeMode === core_constants.MODE.HEART && runtimeState.activeSession?.kind === core_constants.MODE.HEART) {
            return void modes_heart.generateHeartSection('dialogues');
        }
        return generation_client.generateMode(runtimeState.activeMode, { background: false });
    }
    return OVERLAY_CLICK_UNHANDLED;
}

// 按 data-rmt-action 分发：房间、结局、相簿、共同回忆、CG、阅读、物品、ADV（原第 188–234 条语句）
export function overlayPageActions(actionEl, action) {
    if (action === 'room-schema-upgrade') {
        if (runtimeState.activeMode !== core_constants.MODE.ROOM || !modes_room.roomNeedsSchemaUpgrade(runtimeState.activeSession)) return;
        if (!confirmExplicitAction(
            '为旧版房间补全宠物设定？',
            '会重新扫描当前角色卡和世界书中明确存在的宠物/动物伙伴。只合并缺失的宠物与新证据，旧房间、旧物件、旧台词和深层内容都保留；没有明确宠物设定时不会凭空生成。',
            { destructive: false },
        )) return;
        return void generation_client.generateMode(core_constants.MODE.ROOM, { background: false });
    }
    if (action === 'refresh-ending-confessions') return void ui_endingView.refreshEndingConfessionReplays();
    if (action === 'ending-confession-prev') return ui_endingView.endingConfessionStep(-1);
    if (action === 'ending-confession-next') return ui_endingView.endingConfessionStep(1);
    if (action === 'ending-confession-replay') return ui_endingView.replayEndingConfession();
    if (action === 'ending-easter-open') return ui_endingView.openEndingEasterEgg();
    if (action === 'ending-easter-close') return ui_endingView.closeEndingEasterEgg();
    if (action === 'ending-easter-pulse') return ui_endingView.endingEasterEggPulse();
    if (action === 'ending-easter-reveal') return ui_endingView.endingEasterEggReveal();
    if (action === 'ending-easter-toggle') return ui_endingView.endingEasterEggToggleLogs();
    if (action === 'ending-easter-stabilize') return ui_endingView.endingEasterEggStabilize();
    if (action === 'cancel-cg-image') return generation_imageGeneration.cancelCurrentCgImage();
    if (action === 'view-heart-cg') return ui_heartView.viewHeartStripImage(actionEl);
    if (action === 'refresh-image-provider') return generation_imageGeneration.refreshImageGenerationUi();
    if (action === 'album-prev') return ui_albumView.albumPage(-1);
    if (action === 'album-next') return ui_albumView.albumPage(1);
    if (action === 'show-hint') return ui_albumView.showAlbumHint();
    if (action === 'album-cancel') {
        if (runtimeState.activeSession?.kind === core_constants.MODE.ALBUM) {
            runtimeState.activeSession.selectedId = '';
            runtimeState.activeSession.hintVisible = false;
            ui_albumView.renderAlbum();
        }
        return;
    }
    if (action === 'shared-memory') return ui_albumView.enterSharedMemory();
    if (action === 'shared-back') {
        if (runtimeState.activeSession?.kind === core_constants.MODE.ALBUM) {
            runtimeState.activeSession.sharedMemory = false;
            ui_albumView.renderAlbum();
        }
        return;
    }
    if (action === 'shared-prev') {
        if (runtimeState.activeSession?.kind === core_constants.MODE.ALBUM) {
            runtimeState.activeSession.dialogueIndex = Math.max(0, runtimeState.activeSession.dialogueIndex - 1);
            ui_albumView.renderSharedMemory();
        }
        return;
    }
    if (action === 'shared-next') {
        if (runtimeState.activeSession?.kind === core_constants.MODE.ALBUM) {
            runtimeState.activeSession.dialogueIndex += 1;
            ui_albumView.renderSharedMemory();
        }
        return;
    }
    if (action === 'shared-replay') {
        if (runtimeState.activeSession?.kind === core_constants.MODE.ALBUM) {
            runtimeState.activeSession.dialogueIndex = 0;
            ui_albumView.renderSharedMemory();
        }
        return;
    }
    if (action === 'edit-cg-prompt') return cg_editor.openCgPromptEditor();
    if (action === 'edit-heart-cg-prompt') return cg_editor.openCgPromptEditor({ heartStrip: true });
    if (action === 'draw-cg') return void generation_imageGeneration.drawSelectedCgImage();
    if (action === 'clear-cg-image') return generation_imageGeneration.clearSelectedCgImage();
    if (action === 'draw-heart-strip') return void ui_heartView.drawHeartStripImage(actionEl.dataset.rmtHeartStripId);
    if (action === 'clear-heart-strip') return ui_heartView.clearHeartStripImage(actionEl.dataset.rmtHeartStripId);
    if (action === 'cg-only') {
        if (runtimeState.activeSession?.kind === core_constants.MODE.ADV) {
            runtimeState.activeSession.view = 'cg';
            ui_advEventView.renderAdvMode();
        }
        return;
    }
    if (action === 'generate-all-adv') return modes_advEvent.generateAllAdvForSession();
    if (action === 'repair-failed-adv') return modes_advEvent.repairFailedAdvForSession();
    if (action === 'read-adv') {
        if (ui_advEventView.resumeAdvReading()) return;
        return modes_advEvent.generateAdvForSelected();
    }
    if (action === 'room-presence') return modes_room.roomPresenceNext();
    if (action === 'room-participant') return modes_room.roomSelectParticipant(actionEl.dataset.rmtParticipantId);
    if (action === 'room-find-presence') return modes_room.roomFindPresence();
    if (action === 'room-life-refresh') {
        if (!confirmRoomLifeRefresh()) return;
        return modes_room.ensureRoomLifePlan({ force: true });
    }
    if (action === 'room-open-items') return modes_room.openRoomDeepMode(core_constants.MODE.ITEMS);
    if (action === 'room-open-phone') return openCachedOrGenerate(core_constants.MODE.PHONE);
    if (action === 'room-deep-back') return modes_room.returnToRoomFromDeep();
    if (action === 'phone-entry-back') return ui_phoneView.phoneEntryBack();
    if (action === 'items-open') return modes_items.itemsOpenSelected();
    if (action === 'items-back') return modes_items.itemsBack();
    if (action === 'adv-event-prev') return ui_advEventView.advEventStep(-1);
    if (action === 'adv-event-next') return ui_advEventView.advEventStep(1);
    if (action === 'adv-prev') return ui_advEventView.advStep(-1);
    if (action === 'adv-next') return ui_advEventView.advStep(1);
    return OVERLAY_CLICK_UNHANDLED;
}
