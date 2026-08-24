// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_constants from '../core/constants.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as modes_room from '../modes/room.js';
import * as ui_overlay from './overlay.js';

export function selectedPhoneApp() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.PHONE) return null;
    return runtimeState.activeSession.apps.find(app => app.id === runtimeState.activeSession.selectedAppId) || runtimeState.activeSession.apps[0] || null;
}

export function phoneLiveState(session = runtimeState.activeSession, date = new Date()) {
    if (!session || session.kind !== core_constants.MODE.PHONE) return { key: 'daytime', lockText: session?.lockText || 'PRIVATE', statusLine: '', badgeCounts: {} };
    const key = modes_room.roomDaypartState(date).key;
    const raw = session.liveStates?.[key] || {};
    return {
        key,
        lockText: core_text.normalizeText(raw.lockText, 400) || session.lockText || 'PRIVATE',
        statusLine: core_text.normalizeText(raw.statusLine, 500),
        badgeCounts: raw.badgeCounts && typeof raw.badgeCounts === 'object' ? raw.badgeCounts : {},
    };
}

export function stopPhoneClock() {
    if (runtimeState.phoneClockTimer) clearInterval(runtimeState.phoneClockTimer);
    runtimeState.phoneClockTimer = 0;
}

export function startPhoneClock() {
    stopPhoneClock();
    runtimeState.phoneClockTimer = setInterval(() => {
        if (runtimeState.activeMode !== core_constants.MODE.PHONE || runtimeState.activeSession?.kind !== core_constants.MODE.PHONE) return stopPhoneClock();
        const now = new Date();
        const live = phoneLiveState(runtimeState.activeSession, now);
        const shell = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-phone-daypart]`);
        if (shell && shell.dataset.rmtPhoneDaypart !== live.key) {
            renderPhone();
            return;
        }
        const clock = document.querySelector(`#${core_constants.OVERLAY_ID} [data-rmt-phone-clock]`);
        if (clock) clock.textContent = modes_room.roomClockText(now);
    }, 30000);
}

function phoneRenderedSpeakerRole(message, session) {
    const role = core_text.normalizeText(message?.speakerRole, 20).toLowerCase();
    if (role === 'owner' || role === 'contact') return role;
    const speaker = core_text.normalizeText(message?.speaker, 100);
    const ownerName = core_text.normalizeText(session?.ownerName, 100);
    if (speaker && ownerName && speaker === ownerName) return 'owner';
    if (/^(?:我|本人|自己|设备主人|主人|char|owner)$/iu.test(speaker)) return 'owner';
    return 'contact';
}

function phoneConversationNeedsSpeakerRepair(entry, session) {
    const messages = Array.isArray(entry?.messages) ? entry.messages : [];
    if (messages.length < 2) return false;
    const roles = new Set(messages.map(message => phoneRenderedSpeakerRole(message, session)));
    const hasExplicitRole = messages.some(message => ['owner', 'contact'].includes(core_text.normalizeText(message?.speakerRole, 20).toLowerCase()));
    return !hasExplicitRole || !roles.has('owner') || !roles.has('contact');
}

export function renderPhoneEntryDetail(entry, app, session = runtimeState.activeSession) {
    if (!entry) return '<div class="rmt-phone-detail rmt-phone-detail-empty">选择一条记录查看详情。</div>';
    const messages = entry.messages?.length ? `<div class="rmt-phone-chat-thread">${entry.messages.map(message => {
        const role = phoneRenderedSpeakerRole(message, session);
        const speaker = role === 'owner'
            ? (core_text.normalizeText(session?.ownerName, 100) || core_text.normalizeText(message?.speaker, 100) || '设备主人')
            : (core_text.normalizeText(message?.speaker, 100) || core_text.normalizeText(entry?.contactName, 100) || '联系人');
        return `<div class="rmt-phone-message rmt-phone-message-${role}"><div><b>${core_text.esc(speaker)}</b>${message.time ? `<small>${core_text.esc(message.time)}</small>` : ''}</div><p>${core_text.esc(message.text)}</p></div>`;
    }).join('')}</div>` : '';
    const speakerRepair = app?.kind === 'chat' && phoneConversationNeedsSpeakerRepair(entry, session)
        ? '<div class="rmt-phone-speaker-warning">这条是旧版聊天缓存，缺少可靠的双向发言人标记。可在“管理”里重新生成这一条，修复为设备主人 / 联系人分开的对话。</div>'
        : '';
    const fields = entry.fields?.length ? `<dl class="rmt-phone-fields">${entry.fields.map(field => `<div><dt>${core_text.esc(field.label)}</dt><dd>${core_text.esc(field.value)}</dd></div>`).join('')}</dl>` : '';
    const gallery = entry.imageCaption ? `<div class="rmt-phone-image-caption">${core_text.esc(entry.imageCaption)}</div>` : '';
    return `<div class="rmt-phone-detail"><div class="rmt-phone-detail-toolbar"><button type="button" class="rmt-btn" data-rmt-action="phone-entry-back">← 返回${core_text.esc(app?.label || '列表')}</button><span>${core_text.esc(entry.meta || app?.label || '')}</span></div><h3>${core_text.esc(entry.title)}</h3>${gallery}${entry.detail ? `<p>${core_text.esc(entry.detail)}</p>` : ''}${fields}${speakerRepair}${messages}${entry.basis === '记忆' ? `<div class="rmt-phone-evidence">档案痕迹：${core_text.esc(entry.sourceMemoryAnchor)}</div>` : ''}</div>`;
}

export function renderPhone() {
    const session = runtimeState.activeSession;
    if (!session || session.kind !== core_constants.MODE.PHONE) return;
    ui_overlay.setBackVisible(true, '他的房间');
    ui_overlay.topTitle('他的房间 · 私人终端');
    const now = new Date();
    const live = phoneLiveState(session, now);
    const app = selectedPhoneApp();
    const entry = app?.entries.find(item => item.id === session.selectedEntryId) || null;
    if (session.view === 'detail' && !entry) session.view = 'list';
    const apps = session.apps.map(item => {
        const badge = Math.max(0, Number(live.badgeCounts?.[item.id]) || 0);
        return `<button type="button" class="rmt-phone-app ${item.id === app?.id ? 'active' : ''}" data-rmt-phone-app="${core_text.esc(item.id)}"><i class="fa-solid fa-square"></i><span>${core_text.esc(item.label)}</span>${badge ? `<em class="rmt-phone-badge">${badge}</em>` : ''}</button>`;
    }).join('');
    const entries = (app?.entries || []).map(item => `<button type="button" class="rmt-phone-entry ${item.id === entry?.id ? 'active' : ''}" data-rmt-phone-entry="${core_text.esc(item.id)}"><b>${core_text.esc(item.title)}</b><small>${core_text.esc(item.meta || item.preview)}</small><span>${core_text.esc(item.preview)}</span>${item.messages?.length ? `<em>${item.messages.length} 条消息</em>` : ''}</button>`).join('');
    const detail = renderPhoneEntryDetail(entry, app);
    const kind = core_constants.PHONE_DEVICE_KINDS.has(session.deviceKind) ? session.deviceKind : 'phone';
    ui_overlay.bodyEl().innerHTML = `<div class="rmt-room-deep-toolbar"><button type="button" class="rmt-btn" data-rmt-action="room-deep-back">← 返回他的房间</button></div><div class="rmt-phone"><div class="rmt-phone-shell rmt-device-${core_text.esc(kind)} rmt-phone-view-${session.view === 'detail' ? 'detail' : 'list'}" data-rmt-phone-daypart="${core_text.esc(live.key)}"><div class="rmt-phone-notch"></div><div class="rmt-phone-lock"><div><b>${core_text.esc(session.deviceName)}</b><small>${core_text.esc(live.statusLine || modes_room.roomDaypartState(now).label)}</small></div><span><b data-rmt-phone-clock>${core_text.esc(modes_room.roomClockText(now))}</b><small>${core_text.esc(live.lockText)}</small></span></div><div class="rmt-phone-apps">${apps}</div><div class="rmt-phone-content"><div class="rmt-phone-list"><div class="rmt-phone-app-summary"><b>${core_text.esc(app?.label || '')}</b><span>${core_text.esc(app?.summary || '')}</span><small>${app?.entries?.length || 0} 个可读条目</small></div>${entries}</div>${detail}</div></div></div>`;
    startPhoneClock();
}

export function phoneSelectApp(id) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.PHONE) return;
    const app = runtimeState.activeSession.apps.find(item => item.id === id);
    if (!app) return;
    runtimeState.activeSession.selectedAppId = app.id;
    runtimeState.activeSession.selectedEntryId = '';
    runtimeState.activeSession.view = 'list';
    renderPhone();
}

export function phoneSelectEntry(id) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.PHONE) return;
    const app = selectedPhoneApp();
    if (!app?.entries.some(item => item.id === id)) return;
    runtimeState.activeSession.selectedEntryId = id;
    runtimeState.activeSession.view = 'detail';
    renderPhone();
}

export function phoneEntryBack() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.PHONE) return;
    runtimeState.activeSession.view = 'list';
    renderPhone();
}
