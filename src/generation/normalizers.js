// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
import * as song_contract from '../core/themeSongContract.js';
import * as bedtime_contract from '../core/bedtimeContract.js';
import * as core_constants from '../core/constants.js';
// C-4（r84.116）：别名沿用 modes_achievements，函数体一字不改；实际指向生成层的桥，不再 import 成就库模块。
import * as modes_achievements from './modesBridge.js';
// C-4（r84.118）：别名沿用 modes_advEvent，函数体一字不改；实际指向生成层的桥，不再 import ADV 模块。
import * as modes_advEvent from './modesBridge.js';
// C-4（r84.119）：别名沿用 modes_album，函数体一字不改；实际指向生成层的桥，不再 import 相簿模块。
import * as modes_album from './modesBridge.js';
// C-4（r84.111）：别名沿用 modes_butterfly，函数体一字不改；实际指向生成层的桥，不再 import 蝴蝶效应模块。
import * as modes_butterfly from './modesBridge.js';
// C-4（r84.113）：别名沿用 modes_calendar，函数体一字不改；实际指向生成层的桥，不再 import 日历模块。
import * as modes_calendar from './modesBridge.js';
// C-4（r84.117）：别名沿用 modes_ending，函数体一字不改；实际指向生成层的桥，不再 import 结局模块。
import * as modes_ending from './modesBridge.js';
// C-4（r84.120）：别名沿用 modes_heart，函数体一字不改；实际指向生成层的桥，不再 import HEART 模块。
import * as modes_heart from './modesBridge.js';
// C-4（r84.109）：别名沿用 modes_items，函数体一字不改；实际指向生成层的桥，不再 import 物品模块。
import * as modes_items from './modesBridge.js';
// C-4（r84.115）：别名沿用 modes_cabinet，函数体一字不改；实际指向生成层的桥，不再 import 陈列柜模块。
import * as modes_cabinet from './modesBridge.js';
// C-4（r84.114）：别名沿用 modes_phone，函数体一字不改；实际指向生成层的桥，不再 import 私人终端模块。
import * as modes_phone from './modesBridge.js';
// C-4（r84.104）：别名沿用 modes_pastLives，函数体一字不改；实际指向生成层的桥，不再 import 前世今生模块。
import * as modes_pastLives from './modesBridge.js';
// C-4（r84.105）：别名沿用 modes_timeStories，函数体一字不改；实际指向生成层的桥，不再 import 时间故事模块。
import * as modes_timeStories from './modesBridge.js';
import * as time_stories from '../core/timeStoriesContract.js';
// C-4（r84.110）：别名沿用 modes_room，函数体一字不改；实际指向生成层的桥，不再 import 房间模块。
import * as modes_room from './modesBridge.js';
// C-4（r84.112）：别名沿用 modes_relations，函数体一字不改；实际指向生成层的桥，不再 import 关系模块。
import * as modes_relations from './modesBridge.js';
// C-4（r84.107）：别名沿用 modes_travel，函数体一字不改；实际指向生成层的桥，不再 import 出行路线模块。
import * as modes_travel from './modesBridge.js';

export function normalizeByMode(mode, data, memoryBank, context = null) {
    if (mode === core_constants.MODE.THEME_SONG) return song_contract.normalizeStoredThemeSongs(data, memoryBank);
    if (mode === core_constants.MODE.BEDTIME) return bedtime_contract.normalizeStoredBedtime(data, memoryBank);
    if (time_stories.isTimeStoryMode(mode)) return modes_timeStories.normalizeTimeStories(data, memoryBank, { context });
    if (mode === core_constants.MODE.PAST_LIVES) return modes_pastLives.normalizePastLives(data, memoryBank, { context });
    if (mode === core_constants.MODE.CALENDAR) return modes_calendar.normalizeCalendar(data, memoryBank);
    if (mode === core_constants.MODE.RELATIONS) return modes_relations.normalizeRelations(data, memoryBank, context);
    if (mode === core_constants.MODE.BUTTERFLY) return modes_butterfly.normalizeButterfly(data, memoryBank, context);
    if (mode === core_constants.MODE.ALBUM) return modes_album.normalizeAlbum(data, memoryBank);
    if (mode === core_constants.MODE.ADV) return modes_advEvent.normalizeEventList(data, memoryBank);
    if (mode === core_constants.MODE.ROOM) return modes_room.normalizeRoom(data, memoryBank, context);
    if (mode === core_constants.MODE.ITEMS) return modes_items.normalizeItems(data, memoryBank);
    if (mode === core_constants.MODE.CABINET) return modes_cabinet.normalizeCabinet(data, memoryBank);
    if (mode === core_constants.MODE.PHONE) return modes_phone.normalizePhone(data, memoryBank, context);
    if (mode === core_constants.MODE.TRAVEL) return modes_travel.normalizeTravel(data, memoryBank);
    if (mode === core_constants.MODE.ENDING) return modes_ending.normalizeEnding(data, memoryBank);
    if (mode === core_constants.MODE.HEART) return modes_heart.normalizeHeart(data, memoryBank);
    if (mode === core_constants.MODE.ACHIEVEMENTS) return modes_achievements.normalizeAchievements(data, memoryBank);
    throw new Error('未知心迹回廊模式。');
}
