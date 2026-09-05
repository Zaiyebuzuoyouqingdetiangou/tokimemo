// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_constants from '../core/constants.js';
import { state as runtimeState } from '../core/state.js';
import * as core_text from '../core/text.js';
import * as modes_room from '../modes/room.js';
import * as ui_overlay from './overlay.js';

const PHONE_HOME_APP_ID = '__PHONE_HOME__';
const PHONE_VIEW_VALUES = new Set(['home', 'list', 'detail']);
const PHONE_PRESENTATION_KINDS = new Set([
    'moments', 'chat', 'gallery', 'camera', 'notes', 'store', 'browser', 'contacts', 'location', 'music',
    'work', 'study', 'health', 'fitness', 'training', 'reading', 'books', 'files', 'research', 'games', 'finance', 'travel', 'security', 'creative',
    'weather', 'tools', 'misc',
]);
const PHONE_UI_TOKEN_VALUES = Object.freeze({
    palette: new Set(['noir-gold', 'ink-blue', 'frost', 'moss', 'ember', 'lilac', 'sky', 'sand']),
    wallpaper: new Set(['smoke', 'rain', 'grid', 'starfield', 'library', 'aurora', 'minimal', 'paper']),
    typography: new Set(['modern', 'serif', 'mono']),
    iconStyle: new Set(['rounded', 'square', 'glyph', 'glass']),
    density: new Set(['compact', 'cozy', 'roomy']),
    shellTone: new Set(['graphite', 'silver', 'ivory', 'bronze', 'navy']),
});
const PHONE_UI_FALLBACKS = Object.freeze({
    palette: ['noir-gold', 'ink-blue', 'frost', 'moss', 'ember', 'lilac', 'sky', 'sand'],
    wallpaper: ['smoke', 'rain', 'grid', 'starfield', 'library', 'aurora', 'minimal', 'paper'],
    typography: ['modern', 'serif', 'mono'],
    iconStyle: ['rounded', 'square', 'glyph', 'glass'],
    density: ['compact', 'cozy', 'roomy'],
    shellTone: ['graphite', 'silver', 'ivory', 'bronze', 'navy'],
});
const PHONE_ICON_CLASSES = Object.freeze({
    message: 'fa-comment-dots', people: 'fa-user-group', photo: 'fa-images', camera: 'fa-camera', note: 'fa-note-sticky',
    bag: 'fa-bag-shopping', globe: 'fa-globe', contact: 'fa-address-book', pin: 'fa-location-dot', music: 'fa-music',
    briefcase: 'fa-briefcase', book: 'fa-book-open', heart: 'fa-heart-pulse', activity: 'fa-person-running', game: 'fa-gamepad',
    wallet: 'fa-wallet', plane: 'fa-plane', shield: 'fa-shield-halved', palette: 'fa-palette', cloud: 'fa-cloud-sun',
    tool: 'fa-screwdriver-wrench', spark: 'fa-star', grid: 'fa-table-cells-large',
});
const PHONE_KIND_ICONS = Object.freeze({
    moments: 'people', chat: 'message', gallery: 'photo', camera: 'camera', notes: 'note', store: 'bag', browser: 'globe',
    contacts: 'contact', location: 'pin', music: 'music', work: 'briefcase', study: 'book', health: 'heart', fitness: 'activity', training: 'activity',
    reading: 'book', books: 'book', files: 'briefcase', research: 'tool', games: 'game', finance: 'wallet', travel: 'plane', security: 'shield', creative: 'palette',
    weather: 'cloud', tools: 'tool', misc: 'spark',
});

function visiblePhoneApps(session) {
    return (Array.isArray(session?.apps) ? session.apps : []).filter(app => {
        const kind = core_text.normalizeText(app?.kind, 60).toLowerCase();
        const label = core_text.normalizeText(app?.label, 60);
        return app?.id !== PHONE_HOME_APP_ID && !core_constants.PHONE_EXCLUDED_APP_KINDS.has(kind) && !/日历|calendar|schedule/i.test(label);
    });
}

function phonePresentationKind(app) {
    const kind = core_text.normalizeText(app?.kind, 60).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return PHONE_PRESENTATION_KINDS.has(kind) ? kind : 'misc';
}

function phonePresentationIcon(app) {
    const requested = core_text.normalizeText(app?.icon, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (Object.prototype.hasOwnProperty.call(PHONE_ICON_CLASSES, requested)) return requested;
    return PHONE_KIND_ICONS[phonePresentationKind(app)] || 'spark';
}

function phoneIconHtml(app) {
    const icon = phonePresentationIcon(app);
    return `<span class="rmt-phone-icon rmt-phone-icon-${icon}" aria-hidden="true"><i class="fa-solid ${PHONE_ICON_CLASSES[icon]}"></i></span>`;
}

function phoneViewUiProfile(session) {
    const source = session?.uiProfile && typeof session.uiProfile === 'object' ? session.uiProfile : {};
    const seed = [session?.ownerName, session?.deviceName, session?.title, ...visiblePhoneApps(session).flatMap(app => [app?.label, app?.kind])].join('|');
    const hash = core_text.hashString(seed || session?.deviceKind || 'private-device');
    const result = {};
    let shift = 0;
    for (const field of ['palette', 'wallpaper', 'typography', 'iconStyle', 'density', 'shellTone']) {
        const requested = core_text.normalizeText(source[field], 40).toLowerCase().replace(/_/g, '-');
        const fallbacks = PHONE_UI_FALLBACKS[field];
        result[field] = PHONE_UI_TOKEN_VALUES[field].has(requested) ? requested : fallbacks[(hash >>> shift) % fallbacks.length];
        shift += 4;
    }
    return result;
}

function upgradePhoneViewSession(session) {
    const wasLegacy = Number(session?.uiVersion) !== core_constants.PHONE_SESSION_VERSION;
    session.uiVersion = core_constants.PHONE_SESSION_VERSION;
    session.uiProfile = phoneViewUiProfile(session);
    if (wasLegacy) {
        session.view = 'home';
        session.selectedEntryId = '';
    } else if (!PHONE_VIEW_VALUES.has(session.view)) {
        session.view = 'home';
        session.selectedEntryId = '';
    }
    const apps = visiblePhoneApps(session);
    if (!apps.some(app => app.id === session.selectedAppId)) session.selectedAppId = apps[0]?.id || '';
    const selected = apps.find(app => app.id === session.selectedAppId);
    if (session.view === 'detail' && !selected?.entries?.some(entry => entry.id === session.selectedEntryId)) {
        session.view = 'list';
        session.selectedEntryId = '';
    }
    if (session.view === 'list' && !selected) session.view = 'home';
    return session;
}

export function selectedPhoneApp() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.PHONE) return null;
    const apps = visiblePhoneApps(runtimeState.activeSession);
    return apps.find(app => app.id === runtimeState.activeSession.selectedAppId) || apps[0] || null;
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
    const appKind = phonePresentationKind(app);
    const messages = entry.messages?.length ? `<div class="rmt-phone-chat-thread">${entry.messages.map(message => {
        const role = phoneRenderedSpeakerRole(message, session);
        const speaker = role === 'owner'
            ? (core_text.normalizeText(session?.ownerName, 100) || core_text.normalizeText(message?.speaker, 100) || '设备主人')
            : (core_text.normalizeText(message?.speaker, 100) || core_text.normalizeText(entry?.contactName, 100) || '联系人');
        return `<div class="rmt-phone-message rmt-phone-message-${role}"><div><b>${core_text.esc(speaker)}</b>${message.time ? `<small>${core_text.esc(message.time)}</small>` : ''}</div><p>${core_text.esc(message.text)}</p></div>`;
    }).join('')}</div>` : '';
    const speakerRepair = appKind === 'chat' && phoneConversationNeedsSpeakerRepair(entry, session)
        ? '<div class="rmt-phone-speaker-warning">旧版对话缺少发言人标记，可在“管理”中重新生成。</div>'
        : '';
    const fields = entry.fields?.length ? `<dl class="rmt-phone-fields">${entry.fields.map(field => `<div><dt>${core_text.esc(field.label)}</dt><dd>${core_text.esc(field.value)}</dd></div>`).join('')}</dl>` : '';
    const gallery = entry.imageCaption ? `<div class="rmt-phone-image-caption">${core_text.esc(entry.imageCaption)}</div>` : '';
    const legacyWarning = entry.legacyEvidenceUnverified === true
        ? '<div class="rmt-phone-legacy-warning">旧版内容 · 证据未重新核验。内容原样保留，但不会作为新增事实的依据。</div>'
        : '';
    return `<div class="rmt-phone-detail rmt-phone-detail-${appKind}"><div class="rmt-phone-detail-toolbar"><button type="button" class="rmt-btn" data-rmt-action="phone-entry-back">← 返回${core_text.esc(app?.label || '列表')}</button><span>${core_text.esc(entry.meta || app?.label || '')}</span></div>${legacyWarning}<h3>${core_text.esc(entry.title)}</h3>${gallery}${entry.detail ? `<p>${core_text.esc(entry.detail)}</p>` : ''}${fields}${speakerRepair}${messages}${entry.basis === '记忆' ? `<div class="rmt-phone-evidence">档案痕迹：${core_text.esc(entry.sourceMemoryAnchor)}</div>` : ''}</div>`;
}

function phoneStatusBar(now, kind) {
    if (kind === 'neutral') return '<div class="rmt-phone-statusbar rmt-phone-statusbar-neutral"><b>PRIVATE RECORD</b><span aria-hidden="true">—</span></div>';
    if (kind === 'folio') return '<div class="rmt-phone-statusbar rmt-phone-statusbar-folio"><b>PRIVATE FOLIO</b><span aria-hidden="true">✦</span></div>';
    if (kind === 'relic') return '<div class="rmt-phone-statusbar rmt-phone-statusbar-relic"><b>PRIVATE RELIC</b><span aria-hidden="true">◇</span></div>';
    return `<div class="rmt-phone-statusbar"><b data-rmt-phone-clock>${core_text.esc(modes_room.roomClockText(now))}</b><span aria-label="设备状态"><i class="fa-solid fa-signal" aria-hidden="true"></i><i class="fa-solid fa-wifi" aria-hidden="true"></i><i class="fa-solid fa-battery-three-quarters" aria-hidden="true"></i></span></div>`;
}

function phoneHardware(kind) {
    if (kind === 'neutral') return '<div class="rmt-phone-neutral-frame" aria-hidden="true"></div>';
    if (kind === 'watch') return '<div class="rmt-phone-watch-crown" aria-hidden="true"></div><div class="rmt-phone-watch-lug rmt-phone-watch-lug-top" aria-hidden="true"></div><div class="rmt-phone-watch-lug rmt-phone-watch-lug-bottom" aria-hidden="true"></div>';
    if (kind === 'terminal') return '<div class="rmt-phone-terminal-panel" aria-hidden="true"><i></i><i></i><i></i></div><div class="rmt-phone-terminal-rail" aria-hidden="true"></div>';
    if (kind === 'communicator') return '<div class="rmt-phone-communicator-antenna" aria-hidden="true"></div><div class="rmt-phone-communicator-grille" aria-hidden="true"><i></i><i></i><i></i></div>';
    if (kind === 'folio') return '<div class="rmt-phone-folio-spine" aria-hidden="true"></div><div class="rmt-phone-folio-corner" aria-hidden="true"></div>';
    if (kind === 'relic') return '<div class="rmt-phone-relic-crown" aria-hidden="true">✦</div><div class="rmt-phone-relic-rune" aria-hidden="true"></div>';
    return '<div class="rmt-phone-notch" aria-hidden="true"></div><div class="rmt-phone-side-key" aria-hidden="true"></div>';
}

function phoneAppButton(app, badge, className = '') {
    return `<button type="button" class="rmt-phone-app rmt-phone-home-app ${className}" data-rmt-phone-app="${core_text.esc(app.id)}" aria-label="打开 ${core_text.esc(app.label)}">${phoneIconHtml(app)}<span>${core_text.esc(app.label)}</span>${badge ? `<em class="rmt-phone-badge">${badge}</em>` : ''}</button>`;
}

function renderPhoneHome(session, apps, live, now, kind) {
    const launcher = apps.map(app => phoneAppButton(app, Math.max(0, Number(live.badgeCounts?.[app.id]) || 0))).join('');
    const dockCandidates = [];
    for (const preferred of ['chat', 'notes', 'contacts', 'browser']) {
        const app = apps.find(item => phonePresentationKind(item) === preferred && !dockCandidates.includes(item));
        if (app) dockCandidates.push(app);
    }
    for (const app of apps) {
        if (dockCandidates.length >= (['neutral', 'watch', 'folio', 'relic'].includes(kind) ? 2 : 4)) break;
        if (!dockCandidates.includes(app)) dockCandidates.push(app);
    }
    const dock = dockCandidates.map(app => phoneAppButton(app, Math.max(0, Number(live.badgeCounts?.[app.id]) || 0), 'rmt-phone-dock-app')).join('');
    const legacyCount = Math.max(0, Number(session?.legacyEvidenceUnverifiedCount) || 0);
    const legacyNotice = legacyCount
        ? `<div class="rmt-phone-legacy-notice">旧版内容 ${legacyCount} 项 · 已保留，证据未重新核验</div>`
        : '';
    return `<section class="rmt-phone-home rmt-phone-home-screen rmt-phone-wallpaper rmt-phone-wallpaper-${session.uiProfile.wallpaper}" aria-label="私人载体主页"><div class="rmt-phone-lock"><div><b>${core_text.esc(session.deviceName)}</b><small>${core_text.esc(live.statusLine || modes_room.roomDaypartState(now).label)}</small></div><span><small>${core_text.esc(live.lockText)}</small></span></div>${legacyNotice}<div class="rmt-phone-apps rmt-phone-home-grid">${launcher || '<div class="rmt-phone-home-empty">这个设备还没有可读入口。</div>'}</div>${dock ? `<div class="rmt-phone-dock" aria-label="常用功能">${dock}</div>` : ''}</section>`;
}

function phoneEntryKindMarkup(item, kind) {
    const title = core_text.esc(item?.title);
    const meta = core_text.esc(item?.meta || '');
    const preview = core_text.esc(item?.preview || item?.detail || '');
    const id = core_text.esc(item?.id);
    const messageCount = Array.isArray(item?.messages) ? item.messages.length : 0;
    const open = content => `<button type="button" class="rmt-phone-entry rmt-phone-entry-${kind}" data-rmt-phone-entry="${id}">${content}</button>`;
    if (kind === 'chat') return open(`<i class="rmt-phone-entry-avatar" aria-hidden="true">${title.slice(0, 1)}</i><span class="rmt-phone-entry-main"><b>${title}</b><small>${meta}</small><span>${preview}</span></span>${messageCount ? `<em>${messageCount}</em>` : ''}`);
    if (['gallery', 'camera'].includes(kind)) return open(`<span class="rmt-phone-entry-thumb" aria-hidden="true"><i class="fa-solid fa-image"></i></span><b>${title}</b><small>${meta}</small><span>${core_text.esc(item?.imageCaption || item?.preview || '')}</span>`);
    if (kind === 'contacts') return open(`<i class="rmt-phone-entry-avatar rmt-phone-entry-avatar-contact" aria-hidden="true">${title.slice(0, 1)}</i><span class="rmt-phone-entry-main"><b>${title}</b><small>${meta}</small><span>${preview}</span></span>`);
    if (kind === 'music') return open(`<i class="rmt-phone-entry-symbol fa-solid fa-music" aria-hidden="true"></i><span class="rmt-phone-entry-main"><b>${title}</b><small>${meta}</small><span>${preview}</span></span>`);
    if (kind === 'finance') return open(`<span class="rmt-phone-entry-main"><small>${meta || 'LEDGER'}</small><b>${title}</b><span>${preview}</span></span>`);
    if (kind === 'moments') return open(`<span class="rmt-phone-entry-feedmark" aria-hidden="true"></span><span class="rmt-phone-entry-main"><b>${title}</b><span>${preview}</span><small>${meta}</small></span>`);
    if (['notes', 'reading', 'books', 'files', 'research', 'work', 'study'].includes(kind)) return open(`<i class="rmt-phone-entry-symbol fa-solid fa-file-lines" aria-hidden="true"></i><span class="rmt-phone-entry-main"><b>${title}</b><small>${meta}</small><span>${preview}</span></span>`);
    return open(`<b>${title}</b><small>${meta}</small><span>${preview}</span>${messageCount ? `<em>${messageCount}</em>` : ''}`);
}

function renderPhoneAppList(app) {
    if (!app) return '<section class="rmt-phone-page rmt-phone-page-empty">这里暂时没有可读入口。</section>';
    const kind = phonePresentationKind(app);
    const entries = (Array.isArray(app.entries) ? app.entries : []).map(item => phoneEntryKindMarkup(item, kind)).join('');
    const legacyNotice = app.legacyEvidenceUnverified === true
        ? '<div class="rmt-phone-legacy-notice">此分区含旧版内容 · 证据未重新核验</div>'
        : '';
    return `<section class="rmt-phone-page rmt-phone-app-screen rmt-phone-page-list rmt-phone-page-${kind}"><div class="rmt-phone-page-header"><button type="button" class="rmt-phone-page-back" data-rmt-action="phone-home" data-rmt-phone-app="${PHONE_HOME_APP_ID}" aria-label="返回主页">‹</button>${phoneIconHtml(app)}<div><b>${core_text.esc(app.label)}</b><small>${core_text.esc(app.summary || `${app.entries?.length || 0} 项`)}</small></div></div>${legacyNotice}<div class="rmt-phone-list rmt-phone-list-${kind}">${entries || '<div class="rmt-phone-list-empty">这里暂时没有内容。</div>'}</div></section>`;
}

function renderPhoneDetailPage(entry, app) {
    return `<section class="rmt-phone-page rmt-phone-app-screen rmt-phone-page-detail">${renderPhoneEntryDetail(entry, app)}</section>`;
}

export function renderPhone() {
    const session = runtimeState.activeSession;
    if (!session || session.kind !== core_constants.MODE.PHONE) return;
    upgradePhoneViewSession(session);
    ui_overlay.setBackVisible(true, '他的房间');
    ui_overlay.topTitle('他的房间 · 私人终端');
    const now = new Date();
    const live = phoneLiveState(session, now);
    const app = selectedPhoneApp();
    const entry = app?.entries.find(item => item.id === session.selectedEntryId) || null;
    if (session.view === 'detail' && !entry) session.view = 'list';
    const apps = visiblePhoneApps(session);
    const kind = core_constants.PHONE_DEVICE_KINDS.has(session.deviceKind) ? session.deviceKind : 'phone';
    const view = PHONE_VIEW_VALUES.has(session.view) ? session.view : 'home';
    const page = view === 'home'
        ? renderPhoneHome(session, apps, live, now, kind)
        : view === 'detail'
            ? renderPhoneDetailPage(entry, app)
            : renderPhoneAppList(app);
    const profile = phoneViewUiProfile(session);
    const profileClasses = [
        `rmt-phone-palette-${profile.palette}`,
        `rmt-phone-type-${profile.typography}`,
        `rmt-phone-icons-${profile.iconStyle}`,
        `rmt-phone-density-${profile.density}`,
        `rmt-phone-shell-${profile.shellTone}`,
    ].join(' ');
    const phoneWritable = !runtimeState.activeArchiveSnapshot || !runtimeState.activeArchiveReadOnly;
    const incrementalButton = phoneWritable
        ? '<button type="button" class="rmt-btn rmt-phone-increment" data-rmt-action="regenerate"><i class="fa-solid fa-plus"></i> 增量追加终端</button>'
        : '<button type="button" class="rmt-btn rmt-phone-increment" disabled title="关闭只读查看后可增量追加"><i class="fa-solid fa-lock"></i> 只读 · 无法增量</button>';
    const reversePrivacyGate = `<section class="rmt-reverse-terminal-gate" aria-label="反查终端隐私状态"><i class="fa-solid fa-user-shield" aria-hidden="true"></i><div><b>反查终端 · 隐私保护未开放</b><p>当前架构还不能可靠区分用户人设、正式档案与模拟内容，所以不会替你生成私人事实。</p></div><span>BLOCKED SAFELY</span></section>`;
    ui_overlay.bodyEl().innerHTML = `<div class="rmt-room-deep-toolbar"><button type="button" class="rmt-btn" data-rmt-action="room-deep-back">← 返回他的房间</button>${incrementalButton}</div>${reversePrivacyGate}<div class="rmt-phone"><div class="rmt-phone-shell rmt-device-${kind} rmt-phone-view-${view} ${profileClasses}" data-rmt-phone-daypart="${core_text.esc(live.key)}">${phoneHardware(kind)}<div class="rmt-phone-screen">${phoneStatusBar(now, kind)}<main class="rmt-phone-content rmt-phone-content-single">${page}</main></div></div></div>`;
    startPhoneClock();
}

export function phoneSelectApp(id) {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.PHONE) return;
    if (id === PHONE_HOME_APP_ID) return phoneHome();
    const app = visiblePhoneApps(runtimeState.activeSession).find(item => item.id === id);
    if (!app) return;
    runtimeState.activeSession.selectedAppId = app.id;
    runtimeState.activeSession.selectedEntryId = '';
    runtimeState.activeSession.view = 'list';
    renderPhone();
}

export function phoneHome() {
    if (!runtimeState.activeSession || runtimeState.activeSession.kind !== core_constants.MODE.PHONE) return;
    runtimeState.activeSession.selectedEntryId = '';
    runtimeState.activeSession.view = 'home';
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
