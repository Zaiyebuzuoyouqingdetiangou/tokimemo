import * as split_calendarBasics from './calendarBasics.js';
import * as split_calendarData from './calendarData.js';
import * as core_modesBridge from '../core/modesBridge.js';
import * as generation_modesBridge from '../generation/modesBridge.js';
// 以下导出已搬到 modes/calendarBasics.js、modes/calendarData.js，这里原样转发，调用方不用改。
export const CALENDAR_STATUS = split_calendarBasics.CALENDAR_STATUS;
export const CALENDAR_TAG_ALLOWLIST = split_calendarBasics.CALENDAR_TAG_ALLOWLIST;
export const CALENDAR_NOTE_KIND = split_calendarBasics.CALENDAR_NOTE_KIND;
export const CALENDAR_NOTE_SOURCE = split_calendarBasics.CALENDAR_NOTE_SOURCE;
export const CALENDAR_LEGACY_PAGE_KEY = split_calendarBasics.CALENDAR_LEGACY_PAGE_KEY;
export const HOLIDAY_CARD_EXPRESSIONS = split_calendarBasics.HOLIDAY_CARD_EXPRESSIONS;
export const HOLIDAY_CARD_MOTIFS = split_calendarBasics.HOLIDAY_CARD_MOTIFS;
export const HOLIDAY_CARD_PALETTES = split_calendarBasics.HOLIDAY_CARD_PALETTES;
export const HOLIDAY_CARD_MEDIA = split_calendarBasics.HOLIDAY_CARD_MEDIA;
export const HOLIDAY_CARD_STROKES = split_calendarBasics.HOLIDAY_CARD_STROKES;
export const HOLIDAY_CARD_FLOWS = split_calendarBasics.HOLIDAY_CARD_FLOWS;
export const calendarPageKeyForDate = split_calendarBasics.calendarPageKeyForDate;
export const calendarEntryPageKey = split_calendarBasics.calendarEntryPageKey;
export const createCalendarDayPage = split_calendarBasics.createCalendarDayPage;
export const calendarDayPage = split_calendarBasics.calendarDayPage;
export const normalizeCalendarTags = split_calendarBasics.normalizeCalendarTags;
export const normalizeCalendarDate = split_calendarBasics.normalizeCalendarDate;
export const currentCalendarDate = split_calendarBasics.currentCalendarDate;
export const storyCalendarDate = split_calendarBasics.storyCalendarDate;
export const calendarDateMatchesToday = split_calendarBasics.calendarDateMatchesToday;
export const derivePastCalendarEntries = split_calendarBasics.derivePastCalendarEntries;
export const holidayCardClaimsSharedHistory = split_calendarBasics.holidayCardClaimsSharedHistory;
export const calendarEntryKey = split_calendarData.calendarEntryKey;
export const calendarMonthKey = split_calendarData.calendarMonthKey;
export const calendarEntryMatchesMonth = split_calendarData.calendarEntryMatchesMonth;
export const calendarDateKeyForMonth = split_calendarData.calendarDateKeyForMonth;
export const defaultCalendarMonth = split_calendarData.defaultCalendarMonth;
export const migrateCalendarSession = split_calendarData.migrateCalendarSession;
export const mergeCalendarRefresh = split_calendarData.mergeCalendarRefresh;
export const normalizeCalendar = split_calendarData.normalizeCalendar;
export const projectCalendarProgress = split_calendarData.projectCalendarProgress;

// 重构清单 C-3（r84.98）：把 core 层要用的函数登记到 core/modesBridge.js（core 不再 import 本文件）。
core_modesBridge.registerModesBridge({ calendarEntryPageKey, migrateCalendarSession });
// 重构清单 C-4（r84.113）：把生成层要用的函数登记到 generation/modesBridge.js（生成层不再 import 本文件）。
generation_modesBridge.registerGenerationModesBridge({ normalizeCalendar, storyCalendarDate, normalizeCalendarDate, mergeCalendarRefresh, projectCalendarProgress, calendarDayPage, calendarEntryPageKey, normalizeCalendarTags });
