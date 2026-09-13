import * as context from '../core/context.js';
import * as text from '../core/text.js';
import * as repository from '../archive/repository.js';
import * as overlay from './overlay.js';
import * as settings from './settingsPanel.js';
import * as navigation from './navigationBookmark.js';
import * as room from '../modes/room.js';
import * as phone from './phoneView.js';
import { state as runtimeState } from '../core/state.js';

export function homeHeadingHtml(ctx = context.getContext()) {
    const name = text.normalizeText(ctx?.name2, 120);
    const bank = repository.getImportedMemory(ctx);
    return `<header class="rmt-home-heading"><small>HEARTTRACE ARCHIVE</small><h1>心迹回廊</h1>
      <p>${name ? `${text.esc(name)} · ${bank ? '故事已归档，可以从下方打开档案室。' : '从当前聊天，留下一份属于你们的档案。'}` : '打开一个角色聊天后，即可整理你们的故事。'}</p>
      <span>首页不会自动整理记忆或发起生成。</span></header>`;
}

export function showHome({ section = '' } = {}) {
    navigation.rememberReadingPosition();
    room.stopRoomClock(); phone.stopPhoneClock();
    runtimeState.activeMode = null; runtimeState.activeSession = null; runtimeState.activeArchiveSnapshot = null; runtimeState.activeArchiveReadOnly = true;
    runtimeState.archiveViewLevel = 'home'; runtimeState.contentManagerOpen = false;
    overlay.openOverlay(); overlay.topTitle('心迹回廊'); overlay.setBackVisible(false);
    overlay.setRegenerateVisible(false); overlay.setManageVisible(false);
    const body = overlay.bodyEl();
    body.innerHTML = `<main class="rmt-home">${homeHeadingHtml()}<div data-rmt-home-settings></div></main>`;
    settings.mountSettings({ homeTarget: body.querySelector('[data-rmt-home-settings]') });
    if (section && ['api', 'image', 'creative', 'filter', 'theme', 'auto', 'memory', 'reading'].includes(section)) {
        const details = body.querySelector(`[data-rmt-settings-section="${section}"]`);
        if (details) { details.open = true; settings.hydrateSettingsPanel({ memory: section === 'memory' }); details.scrollIntoView?.({ block: 'start' }); }
    }
    return true;
}
