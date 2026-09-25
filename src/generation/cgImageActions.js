import * as cg_format from '../core/cgPromptFormat.js';
import * as baibai_image from './baibaiImage.js';
import * as cg_appearance from './cgAppearance.js';
import * as backup_diagnostics from '../core/backupDiagnostics.js';
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as core_cache from '../core/cache.js';
import * as image_patch from '../core/cgImagePatch.js';
import * as core_constants from '../core/constants.js';
import * as cast_looks from '../core/castLooks.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import * as core_settings from '../core/settings.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as ui_overlay from '../ui/overlay.js';
import { assertCgImageTargetCurrent, captureCgImageTarget, cgDraftRecord, cgImagePromptForItem, cgImageReservationKey, cgImageStartBlockedReason, cgImageTaskKey, cgImageVersions, cgItemInSession, cgItemSignature, dailyComicImagePrompt, deferCgImageIfOriginChanged, imageGenerationUiState, imageGenerationUnavailableMessage, invokeImageGeneration, isCgImageDrawing, isCgImageTargetCurrent, normalizeCgImageRecord, normalizeCgImageUrl, pendingCgImages, refreshSettledCgImage, renderCapturedCgMode, renderCurrentCgMode, sanitizeCgVisualText, selectedCgTarget, updateCgImageProgress } from './cgImageCore.js';
// CG 生图操作：待补图重试、切换与恢复版本、媒体错误、发送前组装、绘制与预览
// 从 generation/imageGeneration.js 原样搬出（重构阶段 2），声明文本一字未改；generation/imageGeneration.js 仍转发原有导出。

export async function handleCgHistorySwitch(eventOrButton) {
    const button = eventOrButton?.target?.closest?.('[data-rmt-cg-history-step]') || eventOrButton;
    const controls = button?.closest?.('[data-rmt-cg-history-controls]');
    if (!controls || button.disabled) return false;
    const session = runtimeState.activeSession, mode = runtimeState.activeMode;
    const item = cgItemInSession(mode,session,controls.dataset.rmtCgItem);
    const versions = cgImageVersions(item);
    const imageElement = controls.parentElement?.querySelector('[data-rmt-cg-image]');
    if (!item || versions.length < 2 || !imageElement) return false;
    eventOrButton?.preventDefault?.(); eventOrButton?.stopPropagation?.();
    const shown = normalizeCgImageUrl(imageElement.getAttribute('src'));
    const current = Math.max(0,versions.findIndex(row => row.url === shown));
    const index = (current + (Number(button.dataset.rmtCgHistoryStep) < 0 ? -1 : 1) + versions.length) % versions.length;
    if (runtimeState.activeArchiveSnapshot) {
        // Historical/read-only browsing affects this image element only.
        imageElement.src = versions[index].url;
        controls.querySelector('[data-rmt-cg-history-count]').textContent = `${index+1} / ${versions.length}`;
        return true;
    }
    button.disabled = true;
    try {
        const captured = captureCgImageTarget({mode,session,item});
        if (!captured) return false;
        return await restoreSelectedCgImageVersion(versions[index].url,captured,{confirm:false});
    } catch(error) { globalThis.toastr?.error?.(core_text.safeErrorSummary(error),'心迹回廊'); return false; }
    finally { if(button.isConnected)button.disabled=false; }
}

function pendingCgImage(target) {
    for (const [key, pending] of pendingCgImages) {
        if (pending.target.imageLifecycleEpoch !== runtimeState.cgImageLifecycleEpoch
            || pending.target.origin.lifecycleEpoch !== runtimeState.runtimeLifecycleEpoch) {
            pendingCgImages.delete(key); continue;
        }
        if (pending.target.mode === target?.mode && pending.target.itemId === target?.itemId
            && pending.target.signature === target?.signature && pending.target.revision === target?.revision
            && core_context.isCurrentTaskOrigin(pending.target.origin)
            && isCgImageTargetCurrent(target, { requireSelection: false })) return pending;
    }
    return null;
}

export function hasPendingCgImage(target) { return !!pendingCgImage(target); }

async function commitCapturedCgImage(captured, image) {
    assertCgImageTargetCurrent(captured, { requireSelection: false });
    const context = core_context.currentCharacterGuard();
    const mutate = (latest, memory) => {
            const expectedRevision = captured.draftId && cgDraftRecord(context, captured.draftId)?.status === 'open'
                ? captured.session.archiveRevision : captured.revision;
            if (memory.archiveRevision !== expectedRevision) return null;
            const result = image_patch.applyCgImagePatch(latest, { version: 1, mode: captured.mode,
                itemId: captured.itemId, expectedSignature: captured.signature, image });
            return result.session;
        };
    let committed = null;
    if (captured.draftId && cgDraftRecord(context, captured.draftId)?.status === 'open') {
        committed = await core_cache.commitGenerationTaskResultMutation(context, captured.draftId, mutate, {
            expectedTaskOrigin: captured.origin,
            stillCurrent: () => runtimeState.cgImageLifecycleEpoch === captured.imageLifecycleEpoch,
        });
    }
    if (!committed && (!captured.draftId || cgDraftRecord(context, captured.draftId)?.status === 'complete')) {
        committed = await core_cache.commitSessionMutation(captured.mode, core_context.getChatId(), captured.origin,
            mutate, captured.draftId ? null : captured.session, { keepCommittedOnMirrorFailure: true });
    }
    if (!committed) throw core_text.safeUserError(
        '图片已生成，但回忆或缓存版本发生变化，尚未回填（RMT_CG_COMMIT_CONFLICT）。', 'RMT_CG_COMMIT_CONFLICT');
    if (core_context.isCurrentTaskOrigin(captured.origin)
        && runtimeState.cgImageLifecycleEpoch === captured.imageLifecycleEpoch
        && archive_repository.getImportedMemory(core_context.getContext())?.archiveRevision === captured.revision) {
        // Copy only this image into views that still show the captured item.
        for (const session of new Set([captured.session, runtimeState.activeSession])) {
            if (session?.kind !== captured.mode || (session.archiveRevision !== captured.revision
                && !(captured.draftId && session.readableProgress?.draftId === captured.draftId))
                || core_context.comparableChatId(session.chatId) !== core_context.comparableChatId(captured.origin.chatId)) continue;
            const item = cgItemInSession(captured.mode, session, captured.itemId);
            if (item && cgItemSignature(item) === captured.signature) item.cgImage = image;
        }
    }
    return committed;
}

function cgImageCommitErrorMessage(error) {
    const detail = backup_diagnostics.backupFailureSummary(error);
    const reason = detail.category !== 'unknown'
        ? `${detail.message}（${detail.code} / ${detail.stage}）`
        : '图片引用尚未写回回忆（RMT_CG_COMMIT_FAILED）。';
    return `图片已生成。${reason}可在“图片设置”点“回填已生成图片”，不再消耗生图额度；此结果暂存在当前页面，请先不要刷新。`;
}

export async function retryPendingCgImage(target) {
    if (!archive_library.requireWritableArchiveAction()) return false;
    const pending = pendingCgImage(target);
    if (!pending || pending.busy) return false;
    pending.busy = true;
    try {
        await commitCapturedCgImage(pending.target, pending.image);
        pendingCgImages.delete(pending.key);
        renderCapturedCgMode(pending.target);
        globalThis.toastr?.success?.('已回填原先生成的图片，没有再次生图。', '心迹回廊');
        return true;
    } catch (error) {
        globalThis.toastr?.error?.(cgImageCommitErrorMessage(error), '心迹回廊');
        return false;
    } finally { pending.busy = false; }
}

export async function drawSelectedCgImage({ promptOverride, promptMetadata, promptFormat = '', expectedTarget = null, onAccepted = null } = {}) {
    if (!archive_library.requireWritableArchiveAction()) return;
    const target = expectedTarget?.targetDescriptor ? selectedCgTarget(expectedTarget.targetDescriptor) : selectedCgTarget();
    if (!target) return;
    const { mode, session, item } = target;
    let captured;
    try { captured = expectedTarget || captureCgImageTarget(target); assertCgImageTargetCurrent(captured); }
    catch (error) { globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊'); return; }
    if (hasPendingCgImage(captured)) {
        globalThis.toastr?.info?.('这条回忆已有生成成功的图片，请在图片设置中回填，避免重复出图。', '心迹回廊');
        return;
    }
    let context;
    try { context = core_context.currentCharacterGuard(); }
    catch (error) {
        globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊');
        return;
    }
    const imageState = imageGenerationUiState(context);
    if (!imageState.available) {
        globalThis.toastr?.info?.(imageGenerationUnavailableMessage(imageState), '心迹回廊');
        return;
    }
    const blockedReason = cgImageStartBlockedReason(mode, item.id, context);
    if (blockedReason) {
        globalThis.toastr?.info?.(blockedReason, '心迹回廊');
        return;
    }
    const previous = normalizeCgImageRecord(item.cgImage);
    const confirmDraw = previous ? ui_overlay.confirmExplicitActionTwice : ui_overlay.confirmExplicitAction;
    const confirmed = confirmDraw(
        previous ? `重新绘制「${item.title}」CG？` : `绘制「${item.title}」CG？`,
        `${previous ? '新的图片成功后会替换当前 CG 图片引用；旧版本引用会保留在图片设置的历史版本中，旧图片文件不会由心迹回廊主动删除。\n\n' : ''}这会调用${imageState.providerLabel || '已配置的生图插件'}，可能消耗本地算力、额度或付费点数。只会发送这张 CG 的可见画面提示，不发送聊天原文、档案原文、世界书原文、私人终端内容或任何 API 凭据。`,
        { destructive: !!previous },
    );
    if (!confirmed) return;

    try { assertCgImageTargetCurrent(captured); }
    catch (error) { globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊'); return; }
    // Read only. Capture happens when the archive is built, so a draw never reads the
    // character card again — a confirmed appearance must survive untouched to the request.
    let castLooksLine = '';
    try { castLooksLine = cast_looks.castLooksPromptLine(cast_looks.readCastLooks(context), context); } catch {}
    const dailyStrip = mode === core_constants.MODE.HEART && !item.__rmtCgDescriptor;
    const savedMetadata = cg_appearance.normalizeCgPromptMetadata(promptMetadata === undefined
        ? cg_appearance.initialCgAppearanceMetadata(item, context) : promptMetadata);
    if (savedMetadata?.castSnapshot) castLooksLine = '';
    const selectedFormat = cg_format.normalizeCgPromptFormat(promptFormat || savedMetadata?.promptFormat
        || (!previous ? core_settings.getPluginSettings(context).cgPromptFormat : ''));
    let prompt, metadata;
    try {
    const rawPrompt = selectedFormat
        ? sanitizeCgVisualText(promptOverride === undefined ? cgImagePromptForItem(item, castLooksLine, selectedFormat) : promptOverride)
        : dailyStrip ? dailyComicImagePrompt(item, promptOverride)
        : promptOverride === undefined ? cgImagePromptForItem(item, castLooksLine) : sanitizeCgVisualText(promptOverride);
    ({ prompt, metadata } = prepareCgSendParts(mode, item, rawPrompt, savedMetadata, selectedFormat));
    // Validate both prompt channels BEFORE reserving/provider send; no silent Chinese stripping.
    const providerState = baibai_image.baiBaiImageState();
    cg_appearance.formattedCgProviderPrompts(prompt, metadata, providerState.supportsCharacters === true, providerState.backend);
    } catch (error) {
        globalThis.toastr?.error?.(core_text.safeErrorSummary(error), '心迹回廊');
        return false;
    }
    if (!prompt) {
        globalThis.toastr?.error?.('这张 CG 没有可用的可视化描述，无法绘制。', '心迹回廊');
        return;
    }
    const origin = captured.origin;
    const lifecycleEpoch = runtimeState.cgImageLifecycleEpoch;
    const itemId = item.id;
    const taskKey = cgImageTaskKey(mode, itemId, context);
    if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
        globalThis.toastr?.info?.(`当前已有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成，请等其中一项完成后再绘制 CG。`, '心迹回廊');
        return;
    }
    const controller = new AbortController();
    runtimeState.activeCgImageTasks.set(taskKey, {
        mode,
        itemId,
        origin,
        label: dailyStrip ? '日常一格绘制' : mode === core_constants.MODE.ALBUM ? '相簿 CG 绘制' : 'ADV CG 绘制',
        startedAt: Date.now(),
        phase: 'request',
        controller,
    });
    core_requestCoordinator.noteChatTaskPhase('request', { taskKey, origin });
    let completedImage = null;
    let imageOutcome = 'done';
    try {
        if (typeof onAccepted === 'function') onAccepted();
        renderCapturedCgMode(captured);
        const generated = await invokeImageGeneration(prompt, context, {
            provider: imageState.provider, signal: controller.signal,
            orientation: item.cgOrientation === 'portrait' || (dailyStrip && Number(item.panelCount) !== 1) ? 'portrait' : 'landscape', characterName: context.name2,
            promptMetadata: metadata,
            targetKey: cgImageReservationKey(mode, itemId, context),
            onSettled: () => refreshSettledCgImage(taskKey, origin),
            onProgress: progress => updateCgImageProgress(taskKey, progress),
        });
        const url = normalizeCgImageUrl(generated?.url);
        if (!url) throw baibai_image.baiBaiImageError('BBI_SAVE_FAILED');
        if (runtimeState.cgImageLifecycleEpoch !== lifecycleEpoch) {
            globalThis.toastr?.warning?.('CG 已由生图扩展完成，但插件已重载/停用，因此没有接收旧运行实例的图片结果。', '心迹回廊');
            return;
        }
        const nextImage = {
            url,
            prompt,
            provider: generated.provider,
            generatedAt: Date.now(),
            ...(metadata ? { promptMetadata: metadata } : {}),
        };
        if (!core_context.isCurrentTaskOrigin(origin)) {
            if (session.archiveRevision !== captured.session.archiveRevision || cgItemSignature(item) !== captured.signature) {
                throw core_text.safeUserError('原回忆已变化，新图片没有替换旧图；可以在生图插件图库中查看。', 'RMT_CG_TARGET_CHANGED');
            }
            const { durable } = deferCgImageIfOriginChanged(captured, nextImage);
            globalThis.toastr?.[durable ? 'success' : 'warning']?.(
                durable
                    ? `CG 已绘制并安全等待写回：${item.title}；回到原聊天后会自动保存引用。`
                    : `CG 已绘制：${item.title}；保存未确认，结果暂存在当前页面，请先导出未提交草稿，回到原聊天前不要刷新。`,
                '心迹回廊',
            );
            return;
        }
        completedImage = nextImage;
        await commitCapturedCgImage(captured, nextImage);
        completedImage = null;
        globalThis.toastr?.success?.(`CG 已绘制：${item.title}`, '心迹回廊');
    } catch (error) {
        imageOutcome = error?.name === 'AbortError' ? 'cancelled' : 'failed';
        if (completedImage && isCgImageTargetCurrent(captured, { requireSelection: false })) {
            if (pendingCgImages.size >= 32) pendingCgImages.delete(pendingCgImages.keys().next().value);
            pendingCgImages.set(taskKey, { key: taskKey, target: captured, image: completedImage, busy: false });
            globalThis.toastr?.error?.(cgImageCommitErrorMessage(error), '心迹回廊');
        } else {
            console.error('[HeartbeatMemories] CG image generation failed', core_text.safeErrorDiagnostic(error));
            globalThis.toastr?.error?.(core_text.toastText(core_text.safeErrorSummary(error)), '心迹回廊');
        }
    } finally {
        runtimeState.activeCgImageTasks.delete(taskKey);
        core_requestCoordinator.rememberStandaloneChatTask({
            label: dailyStrip ? '日常一格绘制' : mode === core_constants.MODE.ALBUM ? '相簿 CG 绘制' : 'ADV CG 绘制',
            mode, origin, outcome: imageOutcome, kind: 'cg',
        });
        renderCapturedCgMode(captured);
    }
}

export async function clearSelectedCgImage(expectedTarget = null) {
    if (!archive_library.requireWritableArchiveAction()) return;
    const target = expectedTarget?.targetDescriptor ? selectedCgTarget(expectedTarget.targetDescriptor) : selectedCgTarget();
    if (!target) return;
    const { mode, session, item } = target;
    if (isCgImageDrawing(mode, item.id)) return globalThis.toastr?.info?.('请先取消正在绘制的图片，再移除旧图引用。', '心迹回廊');
    const image = normalizeCgImageRecord(item.cgImage);
    if (!image) return;
    if (!ui_overlay.confirmExplicitActionTwice(
        `恢复「${item.title}」的抽象 CG？`,
        '只会从心迹回廊缓存中移除这张图片的引用，不会删除 SillyTavern 已保存的图片文件。',
        { destructive: false },
    )) return;
    const captured = expectedTarget || captureCgImageTarget(target);
    if (!captured) return;
    const previousImage = item.cgImage;
    const previousHistory = item.cgImageHistory;
    const clearedHistory = image_patch.cgImageHistoryWith(item.cgImageHistory, previousImage);
    item.cgImage = null;
    if (clearedHistory) item.cgImageHistory = clearedHistory;
    const expectedChatId = core_text.normalizeText(session.chatId, 240);
    const context = core_context.currentCharacterGuard();
    const memoryBank = archive_repository.requireArchive(context);
    const origin = { ...core_context.captureTaskOrigin(context, memoryBank.archiveRevision), chatId: core_context.comparableChatId(expectedChatId) };
    const committed = captured.draftId
        ? await core_cache.commitGenerationTaskResultMutation(context, captured.draftId, latest => {
            const savedItem = cgItemInSession(mode, latest, item.id);
            if (!savedItem || cgItemSignature(savedItem) !== captured.signature) return null;
            const history = image_patch.cgImageHistoryWith(savedItem.cgImageHistory, savedItem.cgImage);
            savedItem.cgImage = null;
            if (history) savedItem.cgImageHistory = history;
            return latest;
        }, { expectedTaskOrigin: origin })
        : await core_cache.commitSession(mode, session, expectedChatId, origin);
    if (!committed) {
        item.cgImage = previousImage;
        if (previousHistory === undefined) delete item.cgImageHistory; else item.cgImageHistory = previousHistory;
        globalThis.toastr?.error?.('当前档案版本已经变化，未移除 CG 图片引用。', '心迹回廊');
        return;
    }
    renderCurrentCgMode(mode, session);
}

// Promote one saved version back to the live image. Pure pointer swap through
// the same capture/CAS commit path as clearing: no redraw, no request, no file
// deletion, and the demoted current image stays in the bounded history.
export async function restoreSelectedCgImageVersion(url, expectedTarget = null, { confirm = true } = {}) {
    if (!archive_library.requireWritableArchiveAction()) return;
    const target = expectedTarget ? {mode:expectedTarget.mode,session:expectedTarget.session,
        item:cgItemInSession(expectedTarget.mode,expectedTarget.session,expectedTarget.itemId)} : selectedCgTarget();
    if (!target?.item) return;
    const { mode, session, item } = target;
    if (isCgImageDrawing(mode, item.id)) return globalThis.toastr?.info?.('请先取消正在绘制的图片，再恢复历史版本。', '心迹回廊');
    const wantedUrl = image_patch.normalizeCgImageUrl(url);
    if (!wantedUrl || !image_patch.normalizeCgImageHistory(item.cgImageHistory).some(record => record.url === wantedUrl)) return;
    if (confirm && !ui_overlay.confirmExplicitAction(
        `把「${item.title}」恢复为这个历史版本？`,
        '只切换档案里保存的图片引用：当前图片会转入历史版本，不重新生图、不删除任何已保存的图片文件。',
        { destructive: false },
    )) return;
    const captured = expectedTarget || captureCgImageTarget(target);
    if (!captured) return;
    assertCgImageTargetCurrent(captured,{requireSelection:false});
    const context = core_context.currentCharacterGuard();
    const mutate = latest => {
        const savedItem = cgItemInSession(mode,latest,item.id);
        if (!savedItem || cgItemSignature(savedItem) !== captured.signature) return null;
        return image_patch.swapCgImageToVersion(savedItem,url) ? latest : null;
    };
    const committed = captured.draftId
        ? await core_cache.commitGenerationTaskResultMutation(context,captured.draftId,mutate,{expectedTaskOrigin:captured.origin})
        : await core_cache.commitSessionMutation(mode,core_context.getChatId(context),captured.origin,mutate,session,{keepCommittedOnMirrorFailure:true});
    if (!committed) {
        globalThis.toastr?.error?.('当前档案版本已经变化，未恢复历史版本。', '心迹回廊');
        return;
    }
    if (runtimeState.activeSession === session && core_context.isCurrentTaskOrigin(captured.origin)) {
        // 切换图片版本只改存档里的图片引用。用存档数据刷新会话时必须保留当前界面位置
        // （是否在共同回忆大图里、对白读到第几句、所选条目、页码），否则重新渲染会把人
        // 从大图踢回相簿网格。字段与 overlay 保存后刷新会话时保留的一致。
        const next = structuredClone(committed);
        for (const key of ['selectedId','selectedEntryId','selectedStripId','view','page','dialogueIndex','sharedMemory']) {
            if (Object.hasOwn(session, key)) next[key] = structuredClone(session[key]);
        }
        Object.assign(session,next);
        renderCurrentCgMode(mode,session);
    }
    if (confirm) globalThis.toastr?.success?.('已恢复所选历史版本，原图已转入历史版本。', '心迹回廊');
    return true;
}

export function handleOverlayMediaError(event) {
    const image = event.target?.closest?.('[data-rmt-cg-image]');
    if (!image) return;
    image.hidden = true;
    image.nextElementSibling?.classList?.contains('rmt-cg-real-badge') && (image.nextElementSibling.hidden = true);
}

export function prepareCgSendParts(mode, item, scene, rawMetadata, selectedFormat = '') {
    const metadata = cg_appearance.normalizeCgPromptMetadata(rawMetadata);
    const promptFormat = cg_format.normalizeCgPromptFormat(selectedFormat || metadata?.promptFormat);
    if (item?.cgLayout === 'photoshoot-9-grid') {
        const prompt = cg_format.formatPhotoshootPrompt(scene);
        return { prompt, metadata: cg_appearance.normalizeCgPromptMetadata({ ...metadata, comicPanels:0, photoshootGrid:true, promptFormat:promptFormat || 'nai5-natural' }) };
    }
    if (!promptFormat) return {prompt: scene, metadata};
    const comicPanels = mode === core_constants.MODE.HEART && !item?.__rmtCgDescriptor ? Math.max(1, Math.min(4, item?.panels?.length || Number(item?.panelCount) || 1)) : 0;
    const prompt = comicPanels ? cg_format.formatDailyComicPrompt({panelCount:comicPanels}, scene, promptFormat) : scene;
    return {prompt, metadata: cg_appearance.normalizeCgPromptMetadata({...metadata, promptFormat, ...(comicPanels ? {comicPanels} : {})})};
}

export function cgEditorSendPreview(mode, item, scene, metadata, promptFormat) {
    const parts = prepareCgSendParts(mode, item, scene, metadata, promptFormat);
    const providerState = baibai_image.baiBaiImageState();
    return cg_appearance.formattedCgProviderPrompts(parts.prompt, parts.metadata, providerState.supportsCharacters === true, providerState.backend);
}
