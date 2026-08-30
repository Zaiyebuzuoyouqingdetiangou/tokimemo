// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as core_constants from '../core/constants.js';
import * as modes_achievements from '../modes/achievements.js';
import * as modes_advEvent from '../modes/advEvent.js';
import * as modes_album from '../modes/album.js';
import * as modes_butterfly from '../modes/butterfly.js';
import * as modes_calendar from '../modes/calendar.js';
import * as modes_ending from '../modes/ending.js';
import * as modes_heart from '../modes/heart.js';
import * as modes_items from '../modes/items.js';
import * as modes_phone from '../modes/phone.js';
import * as modes_room from '../modes/room.js';
import * as modes_relations from '../modes/relations.js';
import * as modes_travel from '../modes/travel.js';

export function normalizeByMode(mode, data, memoryBank, context = null) {
    if (mode === core_constants.MODE.CALENDAR) return modes_calendar.normalizeCalendar(data, memoryBank);
    if (mode === core_constants.MODE.RELATIONS) return modes_relations.normalizeRelations(data, memoryBank, context);
    if (mode === core_constants.MODE.BUTTERFLY) return modes_butterfly.normalizeButterfly(data, memoryBank, context);
    if (mode === core_constants.MODE.ALBUM) return modes_album.normalizeAlbum(data, memoryBank);
    if (mode === core_constants.MODE.ADV) return modes_advEvent.normalizeEventList(data, memoryBank);
    if (mode === core_constants.MODE.ROOM) return modes_room.normalizeRoom(data, memoryBank, context);
    if (mode === core_constants.MODE.ITEMS) return modes_items.normalizeItems(data, memoryBank);
    if (mode === core_constants.MODE.PHONE) return modes_phone.normalizePhone(data, memoryBank, context);
    if (mode === core_constants.MODE.TRAVEL) return modes_travel.normalizeTravel(data, memoryBank);
    if (mode === core_constants.MODE.ENDING) return modes_ending.normalizeEnding(data, memoryBank);
    if (mode === core_constants.MODE.HEART) return modes_heart.normalizeHeart(data, memoryBank);
    if (mode === core_constants.MODE.ACHIEVEMENTS) return modes_achievements.normalizeAchievements(data, memoryBank);
    throw new Error('未知心跳回忆模式。');
}
