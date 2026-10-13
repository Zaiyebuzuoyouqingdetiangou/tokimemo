// 本地建档：不调用任何 API，直接把当前聊天切成一段段原文摘录，作为档案记忆。
// 档案照旧保存在聊天文件（chatMetadata）和本机备份里：复制聊天就跟着走，删聊天就没了。
// 之后仍可以用 API「增量更新 / 完全重建」把原文摘录换成整理过的回忆。
import * as archive_capacity from './capacity.js';
import * as archive_repository from './repository.js';
import * as import_prompts from './importPrompts.js';
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_text from '../core/text.js';

export const LOCAL_ARCHIVE_KEY = 'localArchiveV1';
const AUTO_MARK_KEY = 'heartbeatMemoriesLocalArchiveAutoV1';

// Any sign that this chat already had an archive (a mirror for another chat id
// after a copy, branch or rename; a content cache; an index entry). A new local
// archive would replace it and hide its content, so creation stops here.
export function hasArchiveTraces(context) {
    const meta = context?.chatMetadata || {};
    if (Object.keys(meta).some(key => /^heartbeatMemories/u.test(key) && key !== AUTO_MARK_KEY)) return true;
    const chatId = core_context.comparableChatId(core_context.getChatId(context));
    const rows = context?.extensionSettings?.[core_constants.ARCHIVE_INDEX_SETTINGS_KEY];
    return !!chatId && Array.isArray(rows) && rows.some(row => core_context.comparableChatId(row?.chatId) === chatId);
}
const MAX_LOCAL_MEMORIES = 200;           // content prompts read at most 24; the rest is for browsing
const SEGMENT_CHARS = 700;                // story text per memory (about one scene)
const SEGMENT_FLOORS = 8;                // and never more floors than this
const SUMMARY_CHARS = 320;                // what a content prompt sees per memory
const MIN_NEW_FLOORS = 2;

const text = (value, max) => core_text.normalizeText(value, max);

// Status bars, HTML panels, code and our own tokens are not story text.
export function storyText(value) {
    return String(value || '')
        .replace(/<details[\s\S]*?<\/details>/giu, ' ')
        .replace(/<(style|script|template)[\s\S]*?<\/\1>/giu, ' ')
        .replace(/```[\s\S]*?```/gu, ' ')
        .replace(/<[^>]{1,400}>/gu, ' ')
        .replace(/[\[【]\s*表情(?:包)?\s*[:：][^\]】\n]{1,80}[\]】]/gu, ' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/gu, ' ')
        .replace(/[*_~`#>|]+/gu, '')
        .replace(/[ \t　]+/gu, ' ')
        .replace(/\n\s*\n+/gu, '\n')
        .trim();
}

const QUOTE_EDGES = /^[\s“”「」『』"'，,、：:]+|[\s“”「」『』"'，,、：:]+$/gu;
function clauses(value) {
    return storyText(value).split(/[\n。！？!?；;…]+/u).map(part => part.replace(QUOTE_EDGES, '').trim()).filter(part => Array.from(part).length >= 4);
}
// Quoted speech first: it is what the two said, and it survives as an exact anchor.
function quotes(value) {
    return [...storyText(value).matchAll(/[“「『"]([^”」』"\n]{4,40})[”」』"]/gu)].map(match => match[1].replace(/[。！？!?，,…~～]+$/u, '').trim()).filter(line => Array.from(line).length >= 4);
}
const clip = (value, max) => { const chars = Array.from(value); return chars.length > max ? `${chars.slice(0, max).join('')}…` : value; };

export function segmentMessages(messages, { maxSegments = MAX_LOCAL_MEMORIES } = {}) {
    const rows = messages.map(item => ({ ...item, story: storyText(item.text) })).filter(item => item.story);
    if (!rows.length) return [];
    const totalChars = rows.reduce((sum, item) => sum + item.story.length, 0);
    const budget = Math.max(SEGMENT_CHARS, Math.ceil(totalChars / maxSegments));
    const segments = [];
    let current = [], chars = 0;
    for (const row of rows) {
        current.push(row); chars += row.story.length;
        // Close after a reply from the character once enough text has gathered.
        const floorsFull = current.length >= Math.max(SEGMENT_FLOORS, Math.ceil(rows.length / maxSegments));
        if ((chars >= budget || floorsFull) && row.role === 'char' && current.length >= 2) { segments.push(current); current = []; chars = 0; }
    }
    if (current.length) {
        if (segments.length && chars < budget / 3 && current.length <= 3) segments[segments.length - 1].push(...current);
        else segments.push(current);
    }
    return segments;
}

function memoryDate(rows) {
    for (const row of rows) {
        const parsed = Date.parse(row.date);
        if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
    }
    return '未标注';
}

export function localMemory(rows, { charName, userName, chatId }) {
    const charRows = rows.filter(row => row.role === 'char');
    const lead = clauses((charRows[0] || rows[0]).story);
    const spoken = rows.flatMap(row => quotes(row.story));
    const titleSource = spoken.find(line => Array.from(line).length <= 18) || lead[0] || clauses(rows[0].story)[0] || '';
    const title = clip(titleSource, 18);
    // Summary: who said/did what, in their own words, short enough for prompts.
    const pieces = [];
    let used = 0;
    for (const row of rows) {
        const who = row.role === 'user' ? userName : charName;
        const room = Math.max(40, Math.floor(SUMMARY_CHARS / Math.max(1, rows.length)));
        const piece = `${who}：${clip(clauses(row.story).slice(0, 2).join('，') || row.story, room)}`;
        if (used + piece.length > SUMMARY_CHARS && pieces.length) break;
        pieces.push(piece); used += piece.length;
    }
    const anchors = [...new Set([...spoken, ...rows.flatMap(row => clauses(row.story).slice(0, 1))]
        .map(value => Array.from(value).slice(0, 40).join('')).filter(value => Array.from(value).length >= 4))].slice(0, 4);
    const speakers = [...new Set(rows.map(row => row.role === 'user' ? userName : charName))].filter(Boolean);
    return {
        title: text(title, 100),
        date: memoryDate(rows),
        summary: text(pieces.join('；'), 2200),
        anchors: core_text.cleanArray(anchors.length ? anchors : [title], 8, 120),
        participants: core_text.cleanArray(speakers, 10, 120),
        messageStart: rows[0].index,
        messageEnd: rows[rows.length - 1].index,
        sourceKind: 'chat',
        ...(chatId ? { sourceChatId: chatId } : {}),
        localExcerpt: true,
    };
}

export function localArchiveState(memory) {
    const local = memory?.[LOCAL_ARCHIVE_KEY];
    return local && typeof local === 'object' ? { coveredFloor: Math.max(0, Number(local.coveredFloor) || 0), createdAt: Number(local.createdAt) || 0 } : null;
}

// Builds or extends the archive without any model request.
// mode 'create' needs an empty chat archive; 'append' adds floors after the last covered one.
export async function buildLocalArchive({ context = core_context.currentCharacterGuard(), mode = 'create' } = {}) {
    const existing = archive_repository.getImportedMemory(context);
    if (mode === 'create' && existing) throw core_text.safeUserError('这个聊天已经有档案了。', 'RMT_LOCAL_ARCHIVE_EXISTS');
    if (mode === 'create' && hasArchiveTraces(context)) throw core_text.safeUserError('这个聊天里还留着之前的档案或已生成的内容（可能是复制、分支或改名后的聊天），为了不覆盖它们，没有新建本地档案。可以先从档案页恢复或选择原来的档案。', 'RMT_LOCAL_ARCHIVE_TRACES');
    if (mode === 'append' && !existing) throw core_text.safeUserError('这个聊天还没有档案，先建档。', 'RMT_LOCAL_ARCHIVE_MISSING');
    const startedAt = Date.now();
    const origin = { ...core_context.captureTaskOrigin(context, existing?.archiveRevision || ''), startedAt, archivePresent: !!existing };
    const snapshot = await core_context.buildChatSnapshot(context, { completeSource: true, stillCurrent: () => core_context.isCurrentTaskOrigin(origin) });
    const covered = mode === 'append'
        ? Math.max(localArchiveState(existing)?.coveredFloor || 0, ...(existing.memories || []).map(item => Number(item?.messageEnd) || 0))
        : 0;
    const fresh = snapshot.messages.filter(item => item.index > covered);
    if (fresh.length < (mode === 'create' ? 1 : MIN_NEW_FLOORS)) {
        if (mode === 'create') throw core_text.safeUserError('聊天里还没有可以收进档案的对话，先聊几句再来。', 'RMT_LOCAL_ARCHIVE_EMPTY');
        return { status: 'unchanged', memory: existing, added: 0 };
    }
    const charName = text(context.name2, 120) || '角色', userName = text(context.name1, 120) || '我';
    const chatId = core_context.comparableChatId(snapshot.chatId);
    const room = Math.max(1, MAX_LOCAL_MEMORIES - (existing?.memories?.length || 0));
    const memories = segmentMessages(fresh, { maxSegments: Math.min(MAX_LOCAL_MEMORIES, room) })
        .map(rows => localMemory(rows, { charName, userName, chatId }))
        .filter(item => item.title && item.summary);
    if (!memories.length) return { status: 'unchanged', memory: existing, added: 0 };
    const admitted = archive_capacity.admitArchiveMemories(existing?.memories || [], memories, existing?.coldArchive || [], { homeChatId: chatId });
    const allMemories = admitted.memories;
    const now = Date.now();
    const lastFloor = fresh[fresh.length - 1].index;
    const memoryBank = {
        ...(existing ? structuredClone(existing) : {}),
        version: core_constants.MEMORY_VERSION,
        chatId: snapshot.chatId,
        characterName: charName,
        userName,
        archiveName: existing?.archiveName || import_prompts.fallbackArchiveName(allMemories),
        archiveSummary: existing?.archiveSummary || `${charName}和${userName}的聊天档案，按聊天原文分段收录，还没有经过 API 整理。`,
        archiveVerdict: existing?.archiveVerdict ?? null,
        archiveKeywords: existing?.archiveKeywords || [],
        createdAt: Number(existing?.createdAt) || now,
        updatedAt: now,
        archiveRevision: `${now}-${snapshot.fingerprint}-local`,
        sourceFingerprint: `${snapshot.fingerprint}:local`,
        sourceMessageCount: snapshot.totalMessages,
        usedMessageCount: snapshot.totalMessages,
        usedCharacterCount: snapshot.usedChars,
        coverageMode: existing ? (existing.coverageMode === 'local-quick' ? 'local-quick' : existing.coverageMode) : 'local-quick',
        truncated: false,
        memories: allMemories,
        coldArchive: Array.isArray(admitted.coldArchive) ? admitted.coldArchive : [],
        [LOCAL_ARCHIVE_KEY]: { coveredFloor: lastFloor, createdAt: localArchiveState(existing)?.createdAt || now, updatedAt: now },
    };
    if (!existing) memoryBank.externalMemorySources = [];
    const live = core_context.currentCharacterGuard();
    const saved = await core_cache.saveImportedMemory(live, memoryBank, snapshot.chatId, {
        preserveDerivedCache: !!existing,
        explicitCreate: !existing,
        expectedTaskOrigin: origin,
        expectedPreviousArchiveState: existing ? { present: true, revision: existing.archiveRevision || '' } : { present: false },
        assertTaskCurrent: () => { if (!core_context.isCurrentTaskOrigin(origin)) throw new DOMException('Chat changed', 'AbortError'); },
    });
    return { status: existing ? 'appended' : 'created', memory: saved || memoryBank, added: allMemories.length - (existing?.memories?.length || 0) };
}
