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
    const confirmDraw = previous ? ui_overlay.confirmExplicitActionTwice : ui_overlay.confirmExplicitAction;
    const ok = confirmDraw(
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
    if (!ui_overlay.confirmExplicitActionTwice(`恢复「${item.title}」的文字/抽象小剧场？`, '只会移除心跳回忆缓存中的图片引用，不会删除 SillyTavern 已保存的图片文件。', { destructive: true })) return;
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
    const allowed = new Set(['seasons', 'strips', 'fireflies']);
    runtimeState.activeSession.view = allowed.has(view) ? view : 'seasons';
    renderHeart();
}

export function heartSetSeason(season) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return;
    const allowed = new Set(['postending', 'spring', 'summer', 'autumn', 'winter']);
    runtimeState.activeSession.selectedSeason = allowed.has(season) ? season : 'postending';
    const items = heartSeasonDramaItems(runtimeState.activeSession, runtimeState.activeSession.selectedSeason);
    const latest = items[items.length - 1] || null;
    if (latest?.type === 'voice') runtimeState.activeSession.selectedVoiceId = latest.item.id;
    if (latest?.type === 'scenario') runtimeState.activeSession.selectedScenarioId = latest.item.id;
    runtimeState.activeSession.selectedDramaKey = latest ? `${latest.type}:${latest.item.id}` : '';
    runtimeState.activeSession.view = 'seasons';
    renderHeart();
}

export function heartSelectVoice(id) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return;
    const item = runtimeState.activeSession.voiceDramas.find(entry => entry.id === id);
    if (!item) return;
    runtimeState.activeSession.selectedVoiceId = id;
    runtimeState.activeSession.selectedDramaKey = `voice:${id}`;
    runtimeState.activeSession.selectedSeason = item.kind;
    runtimeState.activeSession.view = 'seasons';
    renderHeart();
}

export function heartSelectScenario(id) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return;
    const item = runtimeState.activeSession.scenarioDramas.find(entry => entry.id === id);
    if (!item) return;
    runtimeState.activeSession.selectedScenarioId = id;
    runtimeState.activeSession.selectedDramaKey = `scenario:${id}`;
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

export function heartSeasonDramaItems(session, season) {
    const voices = (Array.isArray(session?.voiceDramas) ? session.voiceDramas : []).filter(item => item.kind === season).map(item => ({ type: 'voice', item }));
    const scenarios = season === 'postending' ? [] : (Array.isArray(session?.scenarioDramas) ? session.scenarioDramas : []).filter(item => item.season === season).map(item => ({ type: 'scenario', item }));
    return [...voices, ...scenarios].sort((a, b) => {
        const ta = Number(a.item?.generatedAt) || 0;
        const tb = Number(b.item?.generatedAt) || 0;
        if (ta !== tb) return ta - tb;
        if (a.type !== b.type) return a.type === 'voice' ? -1 : 1;
        return String(a.item?.id || '').localeCompare(String(b.item?.id || ''));
    });
}

export function heartCurrentDrama(session, season) {
    const items = heartSeasonDramaItems(session, season);
    if (!items.length) return { items, index: -1, current: null };
    const selectedDramaKey = core_text.normalizeText(session?.selectedDramaKey, 180);
    let index = selectedDramaKey ? items.findIndex(entry => `${entry.type}:${entry.item.id}` === selectedDramaKey) : -1;
    // Backward compatibility for caches created before r41.7.
    if (index < 0) index = items.findIndex(entry => entry.type === 'voice' && entry.item.id === session.selectedVoiceId);
    if (index < 0) index = items.findIndex(entry => entry.type === 'scenario' && entry.item.id === session.selectedScenarioId);
    if (index < 0) index = items.length - 1;
    return { items, index, current: items[index] };
}

export function heartStepDrama(delta) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return;
    const season = runtimeState.activeSession.selectedSeason || 'postending';
    const state = heartCurrentDrama(runtimeState.activeSession, season);
    if (!state.items.length) return;
    const nextIndex = (state.index + Number(delta || 0) + state.items.length) % state.items.length;
    const next = state.items[nextIndex];
    if (next.type === 'voice') runtimeState.activeSession.selectedVoiceId = next.item.id;
    else runtimeState.activeSession.selectedScenarioId = next.item.id;
    runtimeState.activeSession.selectedDramaKey = `${next.type}:${next.item.id}`;
    renderHeart();
}

export function heartSelectFirefly(id) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return;
    const item = runtimeState.activeSession.fireflyVoices?.find(entry => entry.id === id);
    if (!item) return;
    runtimeState.activeSession.selectedFireflyId = id;
    runtimeState.activeSession.view = 'fireflies';
    renderHeart();
}

export function heartStepFireflyPage(direction) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.HEART) return;
    const voices = Array.isArray(runtimeState.activeSession.fireflyVoices) ? runtimeState.activeSession.fireflyVoices : [];
    if (!voices.length) return;
    const selectedIndex = Math.max(0, voices.findIndex(item => item.id === runtimeState.activeSession.selectedFireflyId));
    const pageSize = core_constants.HEART_FIREFLY_PAGE_SIZE;
    const pageCount = Math.max(1, Math.ceil(voices.length / pageSize));
    const currentPage = Math.min(pageCount - 1, Math.floor(selectedIndex / pageSize));
    const nextPage = Math.max(0, Math.min(pageCount - 1, currentPage + (Number(direction) < 0 ? -1 : 1)));
    if (nextPage === currentPage) return;
    const next = voices[nextPage * pageSize];
    if (next) runtimeState.activeSession.selectedFireflyId = next.id;
    runtimeState.activeSession.view = 'fireflies';
    renderHeart();
}

function fireflyPointStyle(id, index) {
    const text = `${id}|${index}`;
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
    const x = 7 + (hash % 87);
    const y = 8 + ((hash >>> 8) % 78);
    const size = 8 + ((hash >>> 16) % 9);
    const delay = ((hash >>> 20) % 18) / 10;
    return `--fx:${x}%;--fy:${y}%;--fs:${size}px;--fd:${delay}s`;
}

function fireflyMeta(color) {
    return ({
        pink: { icon: '💗', label: '恋爱' },
        blue: { icon: '💙', label: '恋爱的烦恼' },
        yellow: { icon: '💛', label: '朋友' },
        white: { icon: '🤍', label: 'お楽しみ / 个性话题' },
        desire: { icon: '♥️', label: '扩展 · 直白渴望' },
    })[color] || { icon: '✦', label: '话题' };
}

export function renderHeart() {
    const session = runtimeState.activeSession;
    if (!session || session.kind !== core_constants.MODE.HEART) return;
    const readOnly = !!runtimeState.activeArchiveSnapshot && runtimeState.activeArchiveReadOnly;
    ui_overlay.setBackVisible(true, runtimeState.activeArchiveSnapshot ? (readOnly ? '只读档案' : '档案') : '当前档案');
    ui_overlay.topTitle('角色互动');
    const view = ['seasons', 'strips', 'fireflies'].includes(session.view) ? session.view : 'seasons';
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
      <button type="button" data-rmt-heart-view="fireflies" class="${view === 'fireflies' ? 'active' : ''}">萤火虫栖息地</button>
      <button type="button" data-rmt-heart-view="strips" class="${view === 'strips' ? 'active' : ''}">日常一格</button>
    </div>`;
    const generationButton = readOnly ? '' : view === 'seasons'
        ? `<button type="button" class="rmt-btn" data-rmt-action="heart-generate-season" data-rmt-heart-season-target="${core_text.esc(selectedHeartSeason)}">${selectedHeartSeasonPartial ? '继续补全本次' : selectedHeartSeasonReady ? '追加一篇' : '生成首篇'}${core_text.esc(heartSeasonLabels[selectedHeartSeason])}</button>`
        : view === 'fireflies'
            ? (() => {
                const legacyCount = (Array.isArray(session.fireflyVoices) ? session.fireflyVoices : []).filter(item => !Array.isArray(item?.script) || item.script.length < 5).length;
                const label = legacyCount ? `升级旧版萤火虫（${legacyCount}）` : session.fireflyVoices?.length ? '解锁新的萤火虫' : '点亮萤火虫栖息地';
                return `<button type="button" class="rmt-btn" data-rmt-action="heart-generate-part" data-rmt-heart-part="fireflies">${core_text.esc(label)}</button>`;
            })()
            : `<button type="button" class="rmt-btn" data-rmt-action="heart-generate-part" data-rmt-heart-part="strips">${parts.strips ? '从新增档案追加日常一格' : '生成日常一格'}</button>`;
    const topActions = `<div class="rmt-heart-top-actions">${generationButton}</div>`;
    const summary = `<section class="rmt-heart-summary"><div><b>${core_text.esc(session.relationshipState)}</b><p>${core_text.esc(session.relationshipSummary)}</p></div>${topActions}</section>`;
    let content = '';

    if (view === 'seasons') {
        session.selectedSeason = selectedHeartSeason;
        const nav = heartSeasons.map(season => {
            const voiceCount = session.voiceDramas.filter(item => item.kind === season).length;
            const scenarioCount = session.scenarioDramas.filter(item => item.season === season).length;
            const total = voiceCount + (season === 'postending' ? 0 : scenarioCount);
            const status = total ? `${total} 篇 · 单篇翻阅` : '未生成';
            return `<button type="button" class="rmt-heart-drama-card ${season === selectedHeartSeason ? 'active' : ''}" data-rmt-heart-season="${core_text.esc(season)}"><b>${core_text.esc(heartSeasonLabels[season])}</b><span>${core_text.esc(status)}</span></button>`;
        }).join('');
        const state = heartCurrentDrama(session, selectedHeartSeason);
        const current = state.current;
        let detail = '';
        if (current) {
            const item = current.item;
            if (current.type === 'voice') session.selectedVoiceId = item.id;
            else session.selectedScenarioId = item.id;
            session.selectedDramaKey = `${current.type}:${item.id}`;
            const seasonClass = `season-${core_text.esc(selectedHeartSeason)}`;
            const tone = ['soft', 'clear', 'muted', 'deep'].includes(item.visualTone) ? item.visualTone : 'soft';
            const dots = state.items.map((entry, index) => `<button type="button" class="rmt-heart-drama-dot ${index === state.index ? 'active' : ''}" ${entry.type === 'voice' ? `data-rmt-heart-voice-id="${core_text.esc(entry.item.id)}"` : `data-rmt-heart-scenario-id="${core_text.esc(entry.item.id)}"`} aria-label="${core_text.esc(entry.item.title)}"></button>`).join('');
            detail = `<section class="rmt-heart-season-stage ${seasonClass} tone-${core_text.esc(tone)}">
              <div class="rmt-heart-drama-pager"><button type="button" data-rmt-action="heart-drama-prev" aria-label="上一篇">‹</button><div><small>${current.type === 'voice' ? 'VOICE DRAMA' : 'SCENARIO DRAMA'}</small><b>${state.index + 1} / ${state.items.length}</b></div><button type="button" data-rmt-action="heart-drama-next" aria-label="下一篇">›</button></div>
              <div class="rmt-heart-drama-dots">${dots}</div>
              <div class="rmt-heart-drama-head"><div><h2>${core_text.esc(item.title)}</h2><p>${core_text.esc(item.subtitle)}</p></div><span>${core_text.esc(heartSeasonLabels[selectedHeartSeason])}</span></div>
              <div class="rmt-heart-setting">${core_text.esc(item.setting)}</div>
              ${renderHeartScriptLines(item.script)}
            </section>`;
        } else {
            detail = `<div class="rmt-heart-empty">${readOnly ? '这一季还没有 Drama。' : `点击上方按钮生成${core_text.esc(heartSeasonLabels[selectedHeartSeason])}首篇；之后每次只新增并翻阅一篇。`}</div>`;
        }
        content = `<div class="rmt-heart-drama-layout rmt-heart-single-drama"><nav>${nav}</nav><main>${detail}</main></div>`;
    } else if (view === 'fireflies') {
        const voices = Array.isArray(session.fireflyVoices) ? session.fireflyVoices : [];
        const selected = voices.find(item => item.id === session.selectedFireflyId) || voices[voices.length - 1] || voices[0] || null;
        if (selected) session.selectedFireflyId = selected.id;
        const pageSize = core_constants.HEART_FIREFLY_PAGE_SIZE;
        const selectedIndex = Math.max(0, selected ? voices.findIndex(item => item.id === selected.id) : 0);
        const pageCount = Math.max(1, Math.ceil(voices.length / pageSize));
        const pageIndex = Math.min(pageCount - 1, Math.floor(selectedIndex / pageSize));
        const pageStart = pageIndex * pageSize;
        const visibleVoices = voices.slice(pageStart, pageStart + pageSize);
        const points = visibleVoices.map((item, index) => `<button type="button" class="rmt-firefly-point ${core_text.esc(item.color)} ${item.id === selected?.id ? 'active' : ''}" style="${fireflyPointStyle(item.id, pageStart + index)}" data-rmt-heart-firefly-id="${core_text.esc(item.id)}" aria-label="${core_text.esc(fireflyMeta(item.color).label)}"><span></span></button>`).join('');
        const legend = ['pink', 'blue', 'yellow', 'white', 'desire'].map(color => { const meta = fireflyMeta(color); return `<span class="${color}">${meta.icon} ${core_text.esc(meta.label)}</span>`; }).join('');
        const pager = voices.length > pageSize ? `<div class="rmt-firefly-pager"><button type="button" class="rmt-btn" data-rmt-action="heart-firefly-prev" ${pageIndex <= 0 ? 'disabled' : ''}>‹ 较早的光</button><span>${pageIndex + 1} / ${pageCount} · 本页 ${visibleVoices.length} 颗</span><button type="button" class="rmt-btn" data-rmt-action="heart-firefly-next" ${pageIndex >= pageCount - 1 ? 'disabled' : ''}>更新的光 ›</button></div>` : '';
        const whisper = selected ? (() => {
            const script = Array.isArray(selected.script) ? selected.script : [];
            if (script.length >= 5) {
                const lines = script.map(node => node.speaker === 'user_thought'
                    ? { speaker: 'narrator', text: `（${core_text.normalizeText(node.text, 700)}）` }
                    : node);
                return `<div class="rmt-firefly-whisper ${core_text.esc(selected.color)}"><small>${fireflyMeta(selected.color).icon} ${core_text.esc(fireflyMeta(selected.color).label)}</small><h3>${core_text.esc(selected.title || '萤火虫话题')}</h3><div class="rmt-firefly-conversation">${renderHeartScriptLines(lines)}</div></div>`;
            }
            const thoughts = Array.isArray(selected.thoughts) && selected.thoughts.length ? selected.thoughts : [selected.line].filter(Boolean);
            const paragraphs = thoughts.map(text => `<p>${core_text.esc(text)}</p>`).join('');
            return `<div class="rmt-firefly-whisper ${core_text.esc(selected.color)}"><small>${fireflyMeta(selected.color).icon} ${core_text.esc(fireflyMeta(selected.color).label)}</small><h3>${core_text.esc(selected.title || '旧版心声')}</h3><div class="rmt-firefly-legacy-note">这是一颗旧版独白光点；点击上方“升级旧版萤火虫”可改成 GS4 式追加约会会话。</div><div class="rmt-firefly-thoughts">${paragraphs}</div></div>`;
        })() : `<div class="rmt-heart-empty">${readOnly ? '这份档案还没有保存萤火虫话题。' : '点亮以后，这里会出现不同颜色的追加约会话题。'}</div>`;
        content = `<section class="rmt-firefly-shell"><div class="rmt-firefly-head"><div><small>FIREFLY HABITAT</small><h2>萤火虫栖息地</h2><p>像 GS4 一样，颜色代表不同话题。点一颗光，会展开一段两个人当场发生的追加约会会话；“心声”从对话里不小心漏出来，而不是整页独白。旧光永久保留，每页最多点亮 ${pageSize} 颗。</p></div><span>${voices.length} LIGHTS</span></div><div class="rmt-firefly-field">${points || '<div class="rmt-firefly-empty-stars">✦　·　✧　·　✦</div>'}</div>${pager}<div class="rmt-firefly-legend">${legend}</div>${whisper}</section>`;
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
