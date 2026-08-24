// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as archive_groups from '../archive/groups.js';
import * as archive_library from '../archive/library.js';
import * as archive_repository from '../archive/repository.js';
import * as archive_snapshots from '../archive/snapshots.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_requestCoordinator from '../core/requestCoordinator.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as generation_client from '../generation/client.js';
import * as generation_imageGeneration from '../generation/imageGeneration.js';
import * as ui_overlay from './overlay.js';

export function heartCharacterAvatarUrl(entry = runtimeState.activeArchiveSnapshot, context = core_context.getContext()) {
    try {
        if (entry) return archive_snapshots.archiveCharacterAvatar(entry, context);
        const avatar = archive_snapshots.currentCharacterAvatar(context);
        return avatar ? (context.getThumbnailUrl?.('avatar', avatar) || '') : '';
    } catch {
        return '';
    }
}

export function heartUserAvatarUrl(context = core_context.getContext()) {
    try {
        const raw = core_text.normalizeText(context?.user_avatar || context?.userAvatar || globalThis.user_avatar, 300);
        return raw ? (context.getThumbnailUrl?.('avatar', raw) || '') : '';
    } catch {
        return '';
    }
}

export function heartDaypartKey(now = new Date()) {
    const hour = now.getHours();
    if (hour < 10) return 'morning';
    if (hour < 17) return 'noon';
    if (hour < 22) return 'evening';
    return 'night';
}

export function heartMmDd(now = new Date()) {
    return `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
}

export function chooseHeartLine(lines, salt = '') {
    const list = Array.isArray(lines) ? lines.filter(Boolean) : [];
    if (!list.length) return '';
    const seed = core_text.hashString(`${salt}|${Date.now()}|${Math.random()}`);
    return list[Math.abs(seed) % list.length] || list[0];
}

export function selectHeartGreeting(session, characterKey, { repeat = false, previousCategory = '' } = {}) {
    const now = new Date();
    const mmdd = heartMmDd(now);
    const greetings = session?.greetings || {};
    const specialDay = (session?.specialDays || []).find(item => item.mmdd === mmdd);
    let category = '';
    let label = '';
    let text = '';

    if (repeat && previousCategory && Array.isArray(greetings[previousCategory]) && greetings[previousCategory].length) {
        category = previousCategory;
    } else if (session?.userBirthdayMmDd && session.userBirthdayMmDd === mmdd) {
        category = 'userBirthday';
        label = '你的生日';
    } else if (session?.birthdayMmDd && session.birthdayMmDd === mmdd) {
        category = 'birthday';
        label = '角色生日';
    } else if (specialDay?.line) {
        category = 'holiday';
        label = specialDay.label || '特别日';
        text = specialDay.line;
    } else {
        const last = archive_groups.lastAvatarVisitAt(characterKey);
        const gapDays = last > 0 ? (Date.now() - last) / 86400000 : 0;
        if (gapDays >= 14 && Array.isArray(greetings.absenceJealous) && greetings.absenceJealous.length) {
            category = 'absenceJealous';
            label = `好久不见 · ${Math.floor(gapDays)}天`;
        } else if (gapDays >= 7 && Array.isArray(greetings.absenceSulky) && greetings.absenceSulky.length) {
            category = 'absenceSulky';
            label = `闹别扭 · ${Math.floor(gapDays)}天`;
        } else if (gapDays >= 3 && Array.isArray(greetings.absenceWorry) && greetings.absenceWorry.length) {
            category = 'absenceWorry';
            label = `有点担心 · ${Math.floor(gapDays)}天`;
        } else if ([0, 6].includes(now.getDay()) && Array.isArray(greetings.weekend) && greetings.weekend.length) {
            category = 'weekend';
            label = '周末';
        } else {
            category = heartDaypartKey(now);
        }
    }

    const labels = {
        morning: '早晨', noon: '白天', evening: '傍晚', night: '夜晚', weekend: '周末', birthday: '角色生日', userBirthday: '你的生日', holiday: '节日',
        absenceWorry: '有点担心', absenceSulky: '闹别扭', absenceJealous: '吃醋了',
    };
    if (!label) label = labels[category] || '角色互动';
    if (!text) text = chooseHeartLine(greetings[category], `${characterKey}|${category}`);
    if (!text) {
        const fallbackKey = heartDaypartKey(now);
        category = fallbackKey;
        label = labels[fallbackKey];
        text = chooseHeartLine(greetings[fallbackKey], `${characterKey}|fallback`);
    }
    return { category, label, text };
}

export function renderAvatarDialoguePopup(state = runtimeState.activeAvatarDialogue, { repeat = false } = {}) {
    if (!state) return;
    const body = ui_overlay.bodyEl();
    if (!body) return;
    body.querySelector('.rmt-avatar-dialog-pop')?.remove();
    const { characterKey, session, avatarSrc, readOnly, entry } = state;
    let speech = null;
    if (session) {
        speech = selectHeartGreeting(session, characterKey, { repeat, previousCategory: repeat ? state.category : '' });
        state.category = speech.category;
        archive_groups.touchAvatarVisit(characterKey);
    }
    const canGenerate = !readOnly && !!entry && generation_imageGeneration.indexedArchiveMatchesCurrentChat(entry, core_context.getContext());
    const actions = session
        ? `<button type="button" class="rmt-btn" data-rmt-action="avatar-talk-again">再说一句</button><button type="button" class="rmt-btn rmt-cg-primary" data-rmt-action="avatar-heart-open">打开角色互动 / Voice Drama</button>`
        : canGenerate
            ? `<button type="button" class="rmt-btn rmt-cg-primary" data-rmt-action="avatar-heart-generate">生成角色互动 / Voice Drama</button>`
            : `<button type="button" class="rmt-btn" data-rmt-action="avatar-heart-open-archive">打开这份档案</button>`;
    const message = session
        ? speech?.text || '……'
        : readOnly
            ? '这份历史档案还没有生成角色互动台词库。为了不偷偷切换聊天，我不会在这里只读状态下直接发起生成。'
            : '这份当前档案还没有角色互动台词库。生成后，点头像会按早中晚、周末、生日、节日和久未访问状态自动换台词。';
    const label = session ? speech?.label || '角色互动' : 'HEART VOICE';
    const pop = document.createElement('div');
    pop.className = 'rmt-avatar-dialog-pop';
    pop.innerHTML = `<div class="rmt-avatar-dialog-card"><button type="button" class="rmt-avatar-dialog-close" data-rmt-action="avatar-dialog-close" aria-label="关闭">×</button><div class="rmt-avatar-dialog-head"><span class="rmt-avatar-dialog-avatar">${avatarSrc ? `<img src="${core_text.esc(avatarSrc)}" alt="">` : '<i class="fa-solid fa-heart"></i>'}</span><div><b>${core_text.esc(state.characterName || session?.characterName || entry?.characterName || '角色')}</b><small>${core_text.esc(label)}</small></div></div><div class="rmt-avatar-dialog-bubble">${core_text.esc(message)}</div><div class="rmt-avatar-dialog-actions">${actions}</div>${readOnly ? '<div class="rmt-avatar-dialog-note">只读档案：可以听已保存台词，但不能在这里重生成。</div>' : ''}</div>`;
    body.appendChild(pop);
}

export async function showAvatarDialogueForCharacter(characterKey) {
    const key = core_text.normalizeText(characterKey, 300);
    if (!key) return;
    const requestEpoch = ++runtimeState.avatarDialogueRequestEpoch;
    const context = core_context.getContext();
    const entries = archive_groups.getArchiveIndex(context)
        .filter(item => archive_groups.archiveGroupKeyForEntry(item) === key)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    // Prefer the already-open live chat for this character when it has an archive.
    // Otherwise fall back to the newest indexed archive as a read-only snapshot.
    const entry = entries.find(item => generation_imageGeneration.indexedArchiveMatchesCurrentChat(item, context)) || entries[0];
    if (!entry) return;
    const avatarSrc = archive_snapshots.archiveCharacterAvatar(entry, context);
    try {
        let session = null;
        let snapshot = null;
        let readOnly = false;
        if (generation_imageGeneration.indexedArchiveMatchesCurrentChat(entry, context)) {
            const live = core_context.currentCharacterGuard();
            const memory = archive_repository.getImportedMemory(live);
            if (memory) session = core_cache.loadSession(core_constants.MODE.HEART, { context: live, chatId: core_context.getChatId(live), memoryBank: memory });
        } else {
            readOnly = true;
            snapshot = await archive_library.fetchIndexedArchiveSnapshot(entry, context);
            session = core_cache.loadSession(core_constants.MODE.HEART, { cache: snapshot.cache, chatId: snapshot.chatId, memoryBank: snapshot.memory });
        }
        if (requestEpoch !== runtimeState.avatarDialogueRequestEpoch) return;
        runtimeState.activeAvatarDialogue = { characterKey: key, characterName: entry.characterName, entry, snapshot, session, readOnly, avatarSrc, category: '' };
        renderAvatarDialoguePopup(runtimeState.activeAvatarDialogue);
    } catch (error) {
        if (requestEpoch !== runtimeState.avatarDialogueRequestEpoch) return;
        globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆');
    }
}

export function openHeartFromAvatar() {
    const state = runtimeState.activeAvatarDialogue;
    if (!state?.session) return;
    if (state.readOnly && state.snapshot) { runtimeState.activeArchiveSnapshot = state.snapshot; runtimeState.activeArchiveReadOnly = true; }
    else { runtimeState.activeArchiveSnapshot = null; runtimeState.activeArchiveReadOnly = true; }
    runtimeState.activeMode = core_constants.MODE.HEART;
    runtimeState.activeSession = structuredClone(state.session);
    ui_overlay.renderActive();
}

export function openHeartMode() {
    if (runtimeState.activeArchiveSnapshot) {
        const session = core_cache.loadSession(core_constants.MODE.HEART, {
            cache: runtimeState.activeArchiveSnapshot.cache,
            chatId: runtimeState.activeArchiveSnapshot.chatId,
            memoryBank: runtimeState.activeArchiveSnapshot.memory,
        });
        if (!session) {
            globalThis.toastr?.info?.('这份只读档案还没有生成角色互动 / Voice Drama。关闭只读并进入对应聊天后即可生成。', '心跳回忆');
            return;
        }
        runtimeState.activeMode = core_constants.MODE.HEART;
        runtimeState.activeSession = session;
        return ui_overlay.renderActive();
    }
    const session = core_cache.loadSession(core_constants.MODE.HEART);
    if (session) {
        runtimeState.activeMode = core_constants.MODE.HEART;
        runtimeState.activeSession = session;
        return ui_overlay.renderActive();
    }
    if (!ui_overlay.confirmExplicitAction('生成角色互动？', '首次先生成关系状态与头像专属时期台词。角色互动页面只展示未来/春夏秋冬 Drama 与日常一格；四季番外之后可随时继续追加。', { destructive: false })) return;
    void generation_client.generateMode(core_constants.MODE.HEART, { background: true });
}

export function heartVoiceKindLabel(kind) {
    return ({ postending: '后日谈', spring: '春', summer: '夏', autumn: '秋', winter: '冬' })[kind] || 'Voice';
}

export function heartSeasonLabel(season) {
    return ({ postending: '未来 / 后日谈', spring: '春', summer: '夏', autumn: '秋', winter: '冬' })[season] || season || '四季';
}

export function selectedHeartVoice() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return null;
    return runtimeState.activeSession.voiceDramas.find(item => item.id === runtimeState.activeSession.selectedVoiceId) || runtimeState.activeSession.voiceDramas[0] || null;
}

export function selectedHeartScenario() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return null;
    return runtimeState.activeSession.scenarioDramas.find(item => item.id === runtimeState.activeSession.selectedScenarioId) || runtimeState.activeSession.scenarioDramas[0] || null;
}

export function selectedHeartStrip() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return null;
    return runtimeState.activeSession.dailyStrips.find(item => item.id === runtimeState.activeSession.selectedStripId) || runtimeState.activeSession.dailyStrips[0] || null;
}

export function renderHeartScriptLines(lines) {
    const charAvatar = heartCharacterAvatarUrl(runtimeState.activeArchiveSnapshot);
    const userAvatar = heartUserAvatarUrl();
    const charName = core_text.normalizeText(runtimeState.activeArchiveSnapshot?.characterName || core_context.getContext().name2, 120) || '角色';
    const userName = core_text.normalizeText(runtimeState.activeArchiveSnapshot?.memory?.userName || core_context.getContext().name1, 120) || '你';
    return `<div class="rmt-heart-script">${(lines || []).map(line => {
        if (line.speaker === 'narrator') return `<div class="rmt-heart-narration">${core_text.esc(line.text)}</div>`;
        const isUser = line.speaker === 'user';
        const avatar = isUser ? userAvatar : charAvatar;
        const fallback = isUser ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-heart"></i>';
        return `<div class="rmt-heart-line ${isUser ? 'user' : 'char'}"><span class="rmt-heart-line-avatar">${avatar ? `<img src="${core_text.esc(avatar)}" alt="">` : fallback}</span><div><small>${core_text.esc(isUser ? userName : charName)}</small><p>${core_text.esc(line.text)}</p></div></div>`;
    }).join('')}</div>`;
}

export function heartStripImagePrompt(item) {
    const authored = generation_imageGeneration.sanitizeCgVisualText(item?.imagePrompt, core_constants.MAX_CG_IMAGE_PROMPT_CHARS);
    if (!authored) return '';
    const layout = Number(item?.panelCount) === 1 ? 'single-panel comic illustration' : Number(item?.panelCount) === 4 ? 'clean four-panel yonkoma comic layout' : 'clean vertical two-panel comic layout';
    const seeds = core_text.cleanArray(item?.visualSeed, 10, 100).map(seed => generation_imageGeneration.sanitizeCgVisualText(seed, 100)).filter(Boolean);
    return core_text.normalizeText([
        'cute chibi slice-of-life anime comic, consistent character design across every panel',
        layout,
        authored,
        seeds.length ? `visible details: ${seeds.join(', ')}` : '',
        'clear readable poses and facial expressions, simple warm background, no text, no letters, no speech bubbles, no subtitle, no logo, no watermark',
    ].filter(Boolean).join(', '), core_constants.MAX_CG_IMAGE_PROMPT_CHARS);
}

export async function drawHeartStripImage(stripId) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return;
    if (!archive_library.requireWritableArchiveAction()) return;
    const item = runtimeState.activeSession.dailyStrips.find(strip => strip.id === stripId) || selectedHeartStrip();
    if (!item) return;
    const context = core_context.currentCharacterGuard();
    const imageState = generation_imageGeneration.imageGenerationUiState(context);
    if (!imageState.available) {
        globalThis.toastr?.info?.(generation_imageGeneration.imageGenerationUnavailableMessage(imageState), '心跳回忆');
        return;
    }
    if (runtimeState.activeCgImageTasks.size >= 1) {
        globalThis.toastr?.info?.('当前已有一张图片正在绘制，请等它完成。', '心跳回忆');
        return;
    }
    const previous = generation_imageGeneration.normalizeCgImageRecord(item.cgImage);
    const ok = ui_overlay.confirmExplicitAction(
        previous ? `重新绘制「${item.title}」？` : `绘制「${item.title}」？`,
        `${previous ? '成功后会替换当前图片引用；旧文件不会由心跳回忆主动删除。\n\n' : ''}会调用${imageState.providerLabel || '已配置的生图插件'}，可能消耗额度。为了减少 AI 画坏文字，图片提示只要求 Q 版分镜和动作，真正台词仍由心跳回忆界面显示。`,
        { destructive: !!previous },
    );
    if (!ok) return;
    const prompt = heartStripImagePrompt(item);
    if (!prompt) return globalThis.toastr?.error?.('这条日常一格没有可用的视觉提示。', '心跳回忆');
    const expectedChatId = core_context.getChatId(context);
    const memoryBank = archive_repository.requireArchive(context);
    const origin = { ...core_context.captureTaskOrigin(context, memoryBank.archiveRevision), chatId: core_context.comparableChatId(expectedChatId) };
    const lifecycleEpoch = runtimeState.cgImageLifecycleEpoch;
    const taskKey = generation_imageGeneration.cgImageTaskKey(core_constants.MODE.HEART, item.id, context);
    if (!core_requestCoordinator.canStartGenerationTask(taskKey)) {
        globalThis.toastr?.info?.(`当前已有 ${core_constants.MAX_CONCURRENT_GENERATION_TASKS} 项同时生成，请等其中一项完成后再绘制日常一格。`, '心跳回忆');
        return;
    }
    const controller = new AbortController();
    runtimeState.activeCgImageTasks.set(taskKey, { mode: core_constants.MODE.HEART, itemId: item.id, startedAt: Date.now(), controller });
    renderHeart();
    try {
        const generated = await generation_imageGeneration.invokeImageGeneration(prompt, context, {
            orientation: Number(item.panelCount) === 1 ? 'landscape' : 'portrait',
            provider: imageState.provider,
            signal: controller.signal,
        });
        const url = generation_imageGeneration.normalizeCgImageUrl(generated?.url);
        if (!url) throw new Error('生图插件没有返回可保存的 SillyTavern 本地图片路径。');
        if (runtimeState.cgImageLifecycleEpoch !== lifecycleEpoch || !core_context.isCurrentTaskOrigin(origin)) {
            globalThis.toastr?.warning?.('图片已经生成，但期间聊天或插件状态发生变化，因此没有写入当前档案缓存。', '心跳回忆');
            return;
        }
        const liveContext = core_context.currentCharacterGuard();
        const liveMemory = archive_repository.requireArchive(liveContext);
        const latest = core_cache.loadSession(core_constants.MODE.HEART, { context: liveContext, chatId: expectedChatId, memoryBank: liveMemory, clone: false }) || runtimeState.activeSession;
        const liveItem = latest.dailyStrips?.find(strip => strip.id === item.id);
        if (!liveItem) throw new Error('日常一格条目已经变化，停止保存图片。');
        const oldImage = liveItem.cgImage;
        const nextImage = {
            url,
            prompt,
            provider: core_constants.CG_IMAGE_PROVIDER,
            generatedAt: Date.now(),
        };
        liveItem.cgImage = nextImage;
        if (!core_cache.saveSession(core_constants.MODE.HEART, latest, expectedChatId)) {
            liveItem.cgImage = oldImage;
            throw new Error('图片已生成，但档案版本已经变化，因此未保存引用。');
        }
        const activeItem = runtimeState.activeSession.dailyStrips?.find(strip => strip.id === item.id);
        if (activeItem) activeItem.cgImage = nextImage;
        globalThis.toastr?.success?.(`日常一格已绘制：${item.title}`, '心跳回忆');
    } catch (error) {
        console.error('[HeartbeatMemories] daily strip image generation failed', error);
        globalThis.toastr?.error?.(core_text.toastText(error?.message || error), '心跳回忆');
    } finally {
        runtimeState.activeCgImageTasks.delete(taskKey);
        if (runtimeState.activeMode === core_constants.MODE.HEART && runtimeState.activeSession?.kind === core_constants.MODE.HEART) renderHeart();
    }
}

export function clearHeartStripImage(stripId) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return;
    if (!archive_library.requireWritableArchiveAction()) return;
    const item = runtimeState.activeSession.dailyStrips.find(strip => strip.id === stripId) || selectedHeartStrip();
    if (!item || !generation_imageGeneration.normalizeCgImageRecord(item.cgImage)) return;
    if (!ui_overlay.confirmExplicitAction(`恢复「${item.title}」的文字/抽象小剧场？`, '只会移除心跳回忆缓存中的图片引用，不会删除 SillyTavern 已保存的图片文件。', { destructive: true })) return;
    const previous = item.cgImage;
    item.cgImage = null;
    if (!core_cache.saveSession(core_constants.MODE.HEART, runtimeState.activeSession)) {
        item.cgImage = previous;
        return globalThis.toastr?.error?.('当前档案状态已变化，未修改图片引用。', '心跳回忆');
    }
    renderHeart();
}

export function heartSetView(view) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return;
    const allowed = new Set(['seasons', 'strips']);
    runtimeState.activeSession.view = allowed.has(view) ? view : 'seasons';
    renderHeart();
}

export function heartSetSeason(season) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return;
    const allowed = new Set(['postending', 'spring', 'summer', 'autumn', 'winter']);
    runtimeState.activeSession.selectedSeason = allowed.has(season) ? season : 'postending';
    const voices = runtimeState.activeSession.voiceDramas.filter(item => item.kind === runtimeState.activeSession.selectedSeason);
    const scenarios = runtimeState.activeSession.scenarioDramas.filter(item => item.season === runtimeState.activeSession.selectedSeason);
    if (voices.length) runtimeState.activeSession.selectedVoiceId = voices[voices.length - 1].id;
    if (scenarios.length) runtimeState.activeSession.selectedScenarioId = scenarios[scenarios.length - 1].id;
    runtimeState.activeSession.view = 'seasons';
    renderHeart();
}

export function heartSelectVoice(id) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return;
    const item = runtimeState.activeSession.voiceDramas.find(entry => entry.id === id);
    if (!item) return;
    runtimeState.activeSession.selectedVoiceId = id;
    if (item.incrementBatchId) {
        const paired = runtimeState.activeSession.scenarioDramas.find(entry => entry.season === item.kind && entry.incrementBatchId === item.incrementBatchId);
        if (paired) runtimeState.activeSession.selectedScenarioId = paired.id;
    }
    runtimeState.activeSession.selectedSeason = item.kind;
    runtimeState.activeSession.view = 'seasons';
    renderHeart();
}

export function heartSelectScenario(id) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return;
    const item = runtimeState.activeSession.scenarioDramas.find(entry => entry.id === id);
    if (!item) return;
    runtimeState.activeSession.selectedScenarioId = id;
    if (item.incrementBatchId) {
        const paired = runtimeState.activeSession.voiceDramas.find(entry => entry.kind === item.season && entry.incrementBatchId === item.incrementBatchId);
        if (paired) runtimeState.activeSession.selectedVoiceId = paired.id;
    }
    runtimeState.activeSession.selectedSeason = item.season;
    runtimeState.activeSession.view = 'seasons';
    renderHeart();
}

export function heartSelectStrip(id) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return;
    if (!runtimeState.activeSession.dailyStrips.some(item => item.id === id)) return;
    runtimeState.activeSession.selectedStripId = id;
    runtimeState.activeSession.view = 'strips';
    renderHeart();
}

export function renderHeart() {
    const session = runtimeState.activeSession;
    if (!session || session.kind !== core_constants.MODE.HEART) return;
    const readOnly = !!runtimeState.activeArchiveSnapshot && runtimeState.activeArchiveReadOnly;
    ui_overlay.setBackVisible(true, runtimeState.activeArchiveSnapshot ? (readOnly ? '只读档案' : '档案') : '当前档案');
    ui_overlay.topTitle('角色互动');
    const view = ['seasons', 'strips'].includes(session.view) ? session.view : 'seasons';
    session.view = view;
    const parts = session.generationParts || {};
    const heartSeasons = ['postending', 'spring', 'summer', 'autumn', 'winter'];
    const selectedHeartSeason = heartSeasons.includes(session.selectedSeason) ? session.selectedSeason : 'postending';
    const heartSeasonLabels = { postending: '未来 / 后日谈', spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
    const selectedHeartSeasonVoiceCount = session.voiceDramas.filter(item => item.kind === selectedHeartSeason).length;
    const selectedHeartSeasonScenarioCount = session.scenarioDramas.filter(item => item.season === selectedHeartSeason).length;
    const selectedHeartSeasonReady = selectedHeartSeason === 'postending'
        ? selectedHeartSeasonVoiceCount > 0
        : selectedHeartSeasonVoiceCount > 0 && selectedHeartSeasonScenarioCount > 0;
    const selectedHeartSeasonPartial = selectedHeartSeason !== 'postending' && selectedHeartSeasonVoiceCount !== selectedHeartSeasonScenarioCount;
    const tabs = `<div class="rmt-heart-tabs">
      <button type="button" data-rmt-heart-view="seasons" class="${view === 'seasons' ? 'active' : ''}">春夏秋冬 / Drama</button>
      <button type="button" data-rmt-heart-view="strips" class="${view === 'strips' ? 'active' : ''}">日常一格</button>
    </div>`;
    const generationButton = readOnly ? '' : view === 'seasons'
        ? `<button type="button" class="rmt-btn" data-rmt-action="heart-generate-season" data-rmt-heart-season-target="${core_text.esc(selectedHeartSeason)}">${selectedHeartSeasonPartial ? '继续补全本次' : selectedHeartSeasonReady ? '追加一篇' : '生成首篇'}${core_text.esc(heartSeasonLabels[selectedHeartSeason])}</button>`
        : `<button type="button" class="rmt-btn" data-rmt-action="heart-generate-part" data-rmt-heart-part="strips">${parts.strips ? '从新增档案追加日常一格' : '生成日常一格'}</button>`;
    const topActions = `<div class="rmt-heart-top-actions">${generationButton}</div>`;
    const summary = `<section class="rmt-heart-summary"><div><b>${core_text.esc(session.relationshipState)}</b><p>${core_text.esc(session.relationshipSummary)}</p></div>${topActions}</section>`;
    let content = '';

    if (view === 'seasons') {
        const availableSeasons = heartSeasons;
        const selectedSeason = selectedHeartSeason;
        session.selectedSeason = selectedSeason;
        const seasonLabels = heartSeasonLabels;
        const nav = availableSeasons.map(season => {
            const voiceCount = session.voiceDramas.filter(item => item.kind === season).length;
            const scenarioCount = session.scenarioDramas.filter(item => item.season === season).length;
            const status = season === 'postending'
                ? (voiceCount ? `${voiceCount} 篇` : '未生成')
                : (voiceCount || scenarioCount ? `Voice ${voiceCount} / Scenario ${scenarioCount}` : '未生成');
            return `<button type="button" class="rmt-heart-drama-card ${season === selectedSeason ? 'active' : ''}" data-rmt-heart-season="${core_text.esc(season)}"><b>${core_text.esc(seasonLabels[season])}</b><span>${core_text.esc(status)}</span></button>`;
        }).join('');
        const voices = session.voiceDramas.filter(item => item.kind === selectedSeason);
        const scenarios = selectedSeason === 'postending' ? [] : session.scenarioDramas.filter(item => item.season === selectedSeason);
        const voice = voices.find(item => item.id === session.selectedVoiceId) || voices[voices.length - 1] || null;
        const scenario = scenarios.find(item => item.id === session.selectedScenarioId) || scenarios[scenarios.length - 1] || null;
        if (voice) session.selectedVoiceId = voice.id;
        if (scenario) session.selectedScenarioId = scenario.id;
        const voiceCards = voices.map((item, index) => `<button type="button" class="rmt-heart-strip-card ${item.id === voice?.id ? 'active' : ''}" data-rmt-heart-voice-id="${core_text.esc(item.id)}"><b>Voice ${index + 1} · ${core_text.esc(item.title)}</b><span>${core_text.esc(item.subtitle || item.setting)}</span></button>`).join('');
        const scenarioCards = scenarios.map((item, index) => `<button type="button" class="rmt-heart-strip-card ${item.id === scenario?.id ? 'active' : ''}" data-rmt-heart-scenario-id="${core_text.esc(item.id)}"><b>Scenario ${index + 1} · ${core_text.esc(item.title)}</b><span>${core_text.esc(item.subtitle || item.setting)}</span></button>`).join('');
        let detail = '';
        if (voiceCards || scenarioCards) {
            detail += `<section class="rmt-heart-drama-section"><div class="rmt-heart-drama-head"><div><h2>${core_text.esc(seasonLabels[selectedSeason])}篇目</h2><p>旧篇保留；可以继续追加新的未来日常。</p></div></div><div class="rmt-heart-strip-nav">${voiceCards}${scenarioCards}</div></section>`;
        }
        if (voice) {
            detail += `<section class="rmt-heart-drama-section"><div class="rmt-heart-drama-head"><div><h2>${core_text.esc(voice.title)}</h2><p>${core_text.esc(voice.subtitle)}</p></div></div><div class="rmt-heart-setting">${core_text.esc(voice.setting)}</div>${renderHeartScriptLines(voice.script)}</section>`;
        }
        if (scenario) {
            detail += `<section class="rmt-heart-drama-section"><div class="rmt-heart-drama-head"><div><h2>${core_text.esc(scenario.title)}</h2><p>${core_text.esc(scenario.subtitle)}</p></div></div><div class="rmt-heart-setting">${core_text.esc(scenario.setting)}</div>${renderHeartScriptLines(scenario.script)}</section>`;
        }
        if (!detail) detail = `<div class="rmt-heart-empty">${readOnly ? '这一部分还没有生成。' : `点击上方按钮生成${core_text.esc(seasonLabels[selectedSeason])}首篇；之后可继续追加新的未来日常。`}</div>`;
        content = `<div class="rmt-heart-drama-layout"><nav>${nav}</nav><main>${detail}</main></div>`;
    } else {
        const selected = selectedHeartStrip();
        if (selected) session.selectedStripId = selected.id;
        const nav = session.dailyStrips.map(item => `<button type="button" class="rmt-heart-strip-card ${item.id === selected?.id ? 'active' : ''}" data-rmt-heart-strip-id="${core_text.esc(item.id)}"><b>${core_text.esc(item.title)}</b><span>${core_text.esc(item.subtitle || `${item.panelCount}格`)}</span><em>${generation_imageGeneration.normalizeCgImageRecord(item.cgImage) ? '实图✓' : `${item.panelCount}格`}</em></button>`).join('');
        let detail = '';
        if (selected) {
            const image = generation_imageGeneration.normalizeCgImageRecord(selected.cgImage);
            const charDisplayName = core_text.normalizeText(runtimeState.activeArchiveSnapshot?.characterName || core_context.getContext().name2, 120) || '角色';
            const userDisplayName = core_text.normalizeText(runtimeState.activeArchiveSnapshot?.memory?.userName || core_context.getContext().name1, 120) || '你';
            const panels = selected.panels.map((panel, index) => `<article class="rmt-heart-panel"><b>${index + 1}</b><div><small>${core_text.esc(panel.caption || `第 ${index + 1} 格`)}</small><p>${core_text.esc(panel.action)}</p>${panel.charLine ? `<div class="rmt-heart-panel-line"><strong>${core_text.esc(charDisplayName)}</strong>${core_text.esc(panel.charLine)}</div>` : ''}${panel.userLine ? `<div class="rmt-heart-panel-line user"><strong>${core_text.esc(userDisplayName)}</strong>${core_text.esc(panel.userLine)}</div>` : ''}</div></article>`).join('');
            detail = `<div class="rmt-heart-strip-head"><div><h2>${core_text.esc(selected.title)}</h2><p>${core_text.esc(selected.subtitle)}</p></div><span>${selected.panelCount}格</span></div><div class="rmt-heart-strip-image">${generation_imageGeneration.cgImageLayerHtml(selected, { lazy: false })}</div><div class="rmt-heart-strip-actions">${readOnly ? '' : `<button type="button" class="rmt-btn rmt-cg-primary" data-rmt-action="draw-heart-strip" data-rmt-heart-strip-id="${core_text.esc(selected.id)}" ${generation_imageGeneration.isCgImageDrawing(core_constants.MODE.HEART, selected.id) ? 'disabled' : ''}>${generation_imageGeneration.isCgImageDrawing(core_constants.MODE.HEART, selected.id) ? '正在绘制…' : image ? '↻ 重绘日常一格' : '🎨 绘制日常一格'}</button>${image ? `<button type="button" class="rmt-btn" data-rmt-action="clear-heart-strip" data-rmt-heart-strip-id="${core_text.esc(selected.id)}">恢复文字版</button>` : ''}`}</div><div class="rmt-heart-panels">${panels}</div>`;
        } else {
            detail = `<div class="rmt-heart-empty">${readOnly ? '日常一格还没有生成。' : '点击上方按钮单独生成日常一格。'}</div>`;
        }
        content = `<div class="rmt-heart-drama-layout rmt-heart-strip-layout"><nav>${nav}</nav><main>${detail}</main></div>`;
    }

    ui_overlay.bodyEl().innerHTML = `<div class="rmt-heart">${summary}${tabs}${content}</div>`;
}
