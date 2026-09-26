// A view projection of received JSON, never a second generation or a relaxed
// final-response validator. Domain modules own validation of each readable item.
import * as json_parser from './jsonParser.js';
import * as recovery_merge from './recoveryMerge.js';
import * as recovery_adapters from './recoveryAdapters.js';
// C-4（r84.119）：别名沿用 album，函数体一字不改；实际指向生成层的桥，不再 import 相簿模块。
import * as album from './modesBridge.js';
// C-4（r84.111）：别名沿用 butterfly，函数体一字不改；实际指向生成层的桥，不再 import 蝴蝶效应模块。
import * as butterfly from './modesBridge.js';
// C-4（r84.117）：别名沿用 ending，函数体一字不改；实际指向生成层的桥，不再 import 结局模块。
import * as ending from './modesBridge.js';
// C-4（r84.104）：别名沿用 pastLives，函数体一字不改；实际指向生成层的桥，不再 import 前世今生模块。
import * as pastLives from './modesBridge.js';
// C-4（r84.118）：别名沿用 adv，函数体一字不改；实际指向生成层的桥，不再 import ADV 模块。
import * as adv from './modesBridge.js';
// C-4（r84.114）：别名沿用 phone，函数体一字不改；实际指向生成层的桥，不再 import 私人终端模块。
import * as phone from './modesBridge.js';
// C-4（r84.110）：别名沿用 room，函数体一字不改；实际指向生成层的桥，不再 import 房间模块。
import * as room from './modesBridge.js';
// C-4（r84.120）：别名沿用 heart，函数体一字不改；实际指向生成层的桥，不再 import HEART 模块。
import * as heart from './modesBridge.js';
// C-4（r84.109）：别名沿用 items，函数体一字不改；实际指向生成层的桥，不再 import 物品模块。
import * as items from './modesBridge.js';
// C-4（r84.115）：别名沿用 cabinet，函数体一字不改；实际指向生成层的桥，不再 import 陈列柜模块。
import * as cabinet from './modesBridge.js';
// C-4（r84.108）：别名沿用 inbox，函数体一字不改；实际指向生成层的桥，不再 import 邮箱模块。
import * as inbox from './modesBridge.js';
// C-4（r84.106）：别名沿用 themeSong，函数体一字不改；实际指向生成层的桥，不再 import 印象曲模块。
import * as themeSong from './modesBridge.js';
// C-4（r84.103）：别名沿用 bedtime，函数体一字不改；实际指向生成层的桥，不再 import 睡前故事模块。
import * as bedtime from './modesBridge.js';
// C-4（r84.105）：别名沿用 timeStories，函数体一字不改；实际指向生成层的桥，不再 import 时间故事模块。
import * as timeStories from './modesBridge.js';
// C-4（r84.107）：别名沿用 travel，函数体一字不改；实际指向生成层的桥，不再 import 出行路线模块。
import * as travel from './modesBridge.js';
// C-4（r84.113）：别名沿用 calendar，函数体一字不改；实际指向生成层的桥，不再 import 日历模块。
import * as calendar from './modesBridge.js';
// C-4（r84.112）：别名沿用 relations，函数体一字不改；实际指向生成层的桥，不再 import 关系模块。
import * as relations from './modesBridge.js';
// C-4（r84.116）：别名沿用 achievements，函数体一字不改；实际指向生成层的桥，不再 import 成就库模块。
import * as achievements from './modesBridge.js';

export function generationProgressSegments(journal, options = {}) {
    const inboxMode = journal?.identity?.mode === 'inbox';
    return (Array.isArray(journal?.segments) ? journal.segments : []).filter(segment =>
        segment.state === 'complete' || segment.state === 'truncated').map(segment => {
        const latest = segment.state === 'complete' ? segment.rawJson : segment.partial;
        const parsed = segment.retainedPartials?.length
            ? recovery_merge.mergeRecoveryPartials([...segment.retainedPartials, latest], generationRecoverySchema(journal, segment, options), { final: segment.state === 'complete' })
            : json_parser.parsePartialJsonObject(latest);
        const closedLetters = parsed.items('/letters');
        const salvagedLetters = inboxMode && typeof latest === 'string' && !closedLetters.length
            ? json_parser.salvageInboxLetters(latest)?.letters : null;
        return { slot: segment.slot, state: segment.state, contract: segment.contract, value: parsed.value, partialValue: parsed.partialValue,
            complete: segment.state === 'complete' && parsed.complete,
            items: pointer => pointer === '/letters' && salvagedLetters?.length ? salvagedLetters : parsed.items(pointer),
            has: parsed.has, at: parsed.at };
    });
}

function projectorFor(mode) {
    return {
        album: album.projectAlbumProgress, butterfly: butterfly.projectButterflyProgress,
        ending: ending.projectEndingProgress, pastLives: pastLives.projectPastLivesProgress,
        adv: adv.projectAdvProgress, phone: phone.projectPhoneProgress,
        room: room.projectRoomProgress, heart: heart.projectHeartProgress,
        items: items.projectItemsProgress, cabinet: cabinet.projectCabinetProgress,
        inbox: inbox.projectInboxProgress, themeSong: themeSong.projectThemeSongProgress,
        bedtime: bedtime.projectBedtimeProgress,
        timeEcho: timeStories.projectTimeStoriesProgress, travel: travel.projectTravelProgress,
        calendar: calendar.projectCalendarProgress, relations: relations.projectRelationsProgress,
        achievements: achievements.projectAchievementsProgress,
    }[mode];
}

export async function projectGenerationProgress(journal, options = {}) {
    const mode = journal?.identity?.mode, project = projectorFor(mode);
    if (typeof project !== 'function') return null;
    const segments = generationProgressSegments(journal, options);
    if (!segments.some(segment => segment.value && typeof segment.value === 'object')) return null;
    const frozenInputs = {};
    for (const [key, value] of Object.entries(journal.frozenInputs || {})) {
        try { frozenInputs[key] = JSON.parse(value); } catch { /* Old malformed evidence is not replaced by current data. */ }
    }
    const snapshot = journal.contentSnapshotVersion === 1 ? journal.contentSnapshot : null;
    const contentInputs = options.contentInputs || snapshot?.contentInputs || {};
    const memoryBank = options.memoryBank || snapshot?.memoryBank;
    if (!memoryBank) return null;
    const pageId = options.pageId || journal.pageId || mode;
    const session = await project({ segments, memoryBank, context: options.context,
        previousSession: options.previousSession !== undefined ? options.previousSession
            : contentInputs.previousSession !== undefined ? contentInputs.previousSession : contentInputs.baseSession || null,
        contentInputs, pageId, operation: journal.operation || {}, frozenInputs,
        createdAt: journal.createdAt, draftId: journal.draftId || '' });
    if (!session || typeof session !== 'object' || Array.isArray(session)) return null;
    return { ...session, chatId: memoryBank.chatId, archiveRevision: memoryBank.archiveRevision,
        readableProgress: { version: 1, complete: false, draftId: journal.draftId || '', pageId } };
}

// Schemas are code-owned recovery adapters. The frozen archive, never a model
// identity or the current UI selection, supplies the validation context.
export function generationRecoverySchema(journal, segment, options = {}) {
    const snapshot = journal.contentSnapshotVersion === 1 ? journal.contentSnapshot : null;
    const frozenInputs = {};
    for (const [key, value] of Object.entries(journal.frozenInputs || {})) {
        try { frozenInputs[key] = JSON.parse(value); } catch { /* No substitution from live settings. */ }
    }
    const contentInputs = options.contentInputs || snapshot?.contentInputs || {};
    return recovery_adapters.recoveryProgressSchema(journal?.identity?.mode, { slot: segment.slot, contract: segment.contract,
        memoryBank: options.memoryBank || snapshot?.memoryBank, context: options.context || snapshot?.fields, frozenInputs, contentInputs,
        previousSession: options.previousSession !== undefined ? options.previousSession : contentInputs.previousSession || contentInputs.baseSession || null,
        operation: journal.operation || {}, createdAt: journal.createdAt, segments: journal.segments || [] });
}

function rawStrings(raws) {
    const values = new Set();
    const visit = value => {
        if (typeof value === 'string') values.add(value.trim());
        else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    };
    raws.forEach(raw => visit(json_parser.parsePartialJsonObject(raw).partialValue));
    return values;
}
function receivedFacts(value, observed, facts = new Map(), field = '') {
    const ignored = new Set(['id', 'selectedId', 'selectedEntryId', 'selectedSpaceId', 'selectedObjectId', 'selectedContainerId',
        'selectedMonth', 'selectedDateKey', 'progressPending', 'generationIncomplete', 'readableProgress',
        'generatedAt', 'createdAt', 'updatedAt', 'draftId', 'pageId', 'ownerKey', 'chatId', 'archiveRevision']);
    if (ignored.has(field)) return facts;
    if (typeof value === 'string' && value.trim() && observed.has(value.trim())) {
        const key = `${field}\u001f${value.trim()}`; facts.set(key, (facts.get(key) || 0) + 1);
    } else if (Array.isArray(value)) value.forEach(item => receivedFacts(item, observed, facts, field));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => receivedFacts(item, observed, facts, key));
    return facts;
}
function containsFacts(container, required) {
    return [...required].every(([key, count]) => (container.get(key) || 0) >= count);
}
export async function mergeGenerationRecoveryResponse(journal, segment, raw, validator, schemaOverride) {
    const oldRaws = [...(segment?.retainedPartials || []), ...(typeof segment?.partial === 'string' ? [segment.partial] : [])];
    if (!oldRaws.length) return null;
    const schema = schemaOverride || generationRecoverySchema(journal, segment);
    if (!schema) return null; // No partially readable units in whole-plan stages.
    const nextRaw = JSON.stringify(raw);
    const merged = recovery_merge.mergeRecoveryPartials([...oldRaws, nextRaw], schema, { final: true });
    if (merged.conflicts.length) throw Object.assign(new Error('恢复内容的原人物、证据或父对象与新回复不同；双方草稿已保留，未拼接到错误对象。'),
        { code: 'RMT_RECOVERY_MERGE_CONFLICT', safeToDisplay: true });
    const combined = merged.value;
    const normalized = await validator(combined);
    // Check actual accepted content rather than character counts. A normalizer
    // must not silently slice old or newly accepted records off a merged array.
    const observedNew = rawStrings([nextRaw]);
    for (const value of merged.ignoredNewStrings) observedNew.delete(value);
    const fresh = await validator(raw);
    if (!containsFacts(receivedFacts(normalized, observedNew), receivedFacts(fresh, observedNew)))
        throw Object.assign(new Error('合并会超过原有内容范围或遗漏本次有效成果；双方草稿已保留，未覆盖旧进度。'),
            { code: 'RMT_RECOVERY_MERGE_CONFLICT', safeToDisplay: true });
    const withRow = row => ({ ...journal, segments: journal.segments.map(value => value.slot === row.slot ? row : value) });
    const oldSession = await projectGenerationProgress(journal);
    const newSession = await projectGenerationProgress(withRow({ ...segment, state: 'complete', rawJson: JSON.stringify(combined), retainedPartials: [] }));
    const observedOld = rawStrings(oldRaws);
    if (oldSession && !containsFacts(receivedFacts(newSession, observedOld), receivedFacts(oldSession, observedOld)))
        throw Object.assign(new Error('本次合并未能保留此前已验证的可读内容；双方草稿已保留，没有重置进度。'),
            { code: 'RMT_RECOVERY_MERGE_CONFLICT', safeToDisplay: true });
    return { raw: combined, value: normalized };
}
