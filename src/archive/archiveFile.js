// 档案文件：把当前聊天的心迹回廊档案（记忆 + 全部生成内容 + 本插件的聊天附加数据）导出成一个文件，
// 再导入到另一个没有档案的聊天（例如检查点副本、复制出来的聊天）。图片按地址保存，换一台酒馆需要图片仍在原位置。
import * as core_cache from '../core/cache.js';
import * as core_constants from '../core/constants.js';
import * as core_context from '../core/context.js';
import * as core_text from '../core/text.js';
import * as archive_repository from './repository.js';
import * as archive_inheritance from './inheritance.js';

export const ARCHIVE_FILE_FORMAT = 'hearttrace-archive-file';
const EXCLUDED_KEYS = new Set([core_constants.MEMORY_KEY, core_constants.CACHE_KEY]);

function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

// 本插件写在聊天里的其他数据（外貌、他在等你、朋友情报、MV 等），键名都以 heartbeatMemories 开头。
function pluginMetadata(context) {
    const out = {};
    for (const [key, value] of Object.entries(context?.chatMetadata || {})) {
        if (!key.startsWith('heartbeatMemories') || EXCLUDED_KEYS.has(key)) continue;
        try { out[key] = clone(value); } catch { /* 无法序列化的项跳过。 */ }
    }
    return out;
}

export async function buildArchiveFile(context = core_context.currentCharacterGuard()) {
    const memory = archive_repository.requireArchive(context);
    let cache = null;
    try { cache = await core_cache.ensureCacheHydrated(context); } catch { cache = null; }
    if (!cache || typeof cache !== 'object') cache = core_cache.getCache(context) || {};
    if (core_cache.isCompressedCacheRecord(cache)) throw core_text.safeUserError('生成内容还没有读取完成，请稍后再导出。', 'RMT_ARCHIVE_FILE_CACHE');
    return {
        format: ARCHIVE_FILE_FORMAT,
        version: 1,
        exportedAt: new Date().toISOString(),
        characterName: core_text.normalizeText(context?.name2, 120),
        sourceChatId: core_text.normalizeText(core_context.getChatId(context), 240),
        memory: clone(memory),
        cache: clone(cache),
        metadata: pluginMetadata(context),
    };
}

export async function exportArchiveFile(context = core_context.currentCharacterGuard()) {
    const data = await buildArchiveFile(context);
    const name = `${core_text.normalizeText(data.memory.archiveName || data.characterName || 'Hearttrace', 40).replace(/[\\/:*?"<>|]+/g, '_')}-心迹回廊档案-${data.exportedAt.slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = name; link.hidden = true;
    try { document.body.appendChild(link); link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); }
    return { name, memories: Array.isArray(data.memory.memories) ? data.memory.memories.length : 0 };
}

export function parseArchiveFile(text) {
    let data;
    try { data = JSON.parse(text); } catch { throw core_text.safeUserError('这个文件不是心迹回廊的档案文件。', 'RMT_ARCHIVE_FILE_FORMAT'); }
    if (data?.format !== ARCHIVE_FILE_FORMAT || data?.version !== 1 || !data.memory) throw core_text.safeUserError('这个文件不是心迹回廊的档案文件。', 'RMT_ARCHIVE_FILE_FORMAT');
    if (!archive_repository.isCompatibleArchive(data.memory)) throw core_text.safeUserError('文件里的档案格式无法在这个版本中读取。', 'RMT_ARCHIVE_FILE_FORMAT');
    return data;
}

// 当前聊天里带着别的聊天的档案（酒馆的检查点 / 复制聊天会连同插件数据一起复制，但聊天 ID 变了，
// 插件按“一个窗口一个指纹”就把它当成别人的档案隐藏起来）。
export function foreignArchiveInChat(context = core_context.currentCharacterGuard()) {
    const memory = context?.chatMetadata?.[core_constants.MEMORY_KEY];
    if (!memory || typeof memory !== 'object') return null;
    const current = core_context.comparableChatId(core_context.getChatId(context));
    const owner = core_context.comparableChatId(memory.chatId);
    if (!current || !owner || owner === current) return null;
    return { memory, memories: Array.isArray(memory.memories) ? memory.memories.length : 0, archiveName: core_text.normalizeText(memory.archiveName, 120) };
}

async function installArchiveData(data, { sameHistory, context }) {
    const chatId = core_context.comparableChatId(core_context.getChatId(context));
    if (!chatId) throw core_text.safeUserError('无法识别当前聊天，请先打开一个具体的聊天。', 'RMT_ARCHIVE_FILE_CHAT');
    const existing = context?.chatMetadata?.[core_constants.MEMORY_KEY];
    if (existing && core_context.comparableChatId(existing.chatId) === chatId) {
        throw core_text.safeUserError('当前聊天已经有档案了。请在没有档案的聊天里导入，避免覆盖现有内容。', 'RMT_ARCHIVE_FILE_OCCUPIED');
    }
    const entryId = `file-${core_context.stableArchiveHash(`${data.sourceChatId}\u001f${data.memory.archiveRevision || ''}\u001f${data.exportedAt}`)}`;
    const prepared = archive_inheritance.prepareInheritedArchive({ entryId, memory: data.memory, cache: data.cache || {} }, context);
    if (sameHistory) {
        const snapshot = await core_context.buildChatSnapshot(context, { completeSource: true, expectedChatId: core_context.getChatId(context) });
        prepared.memory.sourceMessageCount = snapshot.totalMessages;
        prepared.memory.sourceFingerprint = `${snapshot.fingerprint}:`;
        if (snapshot.fullFingerprint) prepared.memory.fullSourceFingerprint = snapshot.fullFingerprint;
    }
    // 复制过来的旧绑定先取下（已读进 prepared），写入失败时原样放回。
    const backup = { memory: context.chatMetadata[core_constants.MEMORY_KEY], cache: context.chatMetadata[core_constants.CACHE_KEY] };
    if (backup.memory) { delete context.chatMetadata[core_constants.MEMORY_KEY]; delete context.chatMetadata[core_constants.CACHE_KEY]; }
    let saved;
    try {
        saved = await core_cache.saveImportedMemory(context, prepared.memory, chatId, {
            expectedPreviousArchiveState: { present: false },
            explicitCreate: true,
            expectedTaskOrigin: { ...core_context.captureTaskOrigin(context, ''), startedAt: prepared.memory.createdAt, archivePresent: false },
            initialCache: prepared.cache,
        });
    } catch (error) {
        if (backup.memory && !context.chatMetadata[core_constants.MEMORY_KEY]) {
            context.chatMetadata[core_constants.MEMORY_KEY] = backup.memory;
            if (backup.cache !== undefined) context.chatMetadata[core_constants.CACHE_KEY] = backup.cache;
        }
        throw error;
    }
    for (const [key, value] of Object.entries(data.metadata || {})) {
        if (!key.startsWith('heartbeatMemories') || EXCLUDED_KEYS.has(key)) continue;
        if (context.chatMetadata[key] === undefined) context.chatMetadata[key] = value;
    }
    try { context.saveMetadataDebounced?.(); } catch { /* 档案本体已经保存。 */ }
    return { memories: Array.isArray(saved?.memories) ? saved.memories.length : 0 };
}

// sameHistory：当前聊天就是导出时那个聊天的副本（检查点、复制）。这时把当前聊天全部楼层视为已整理，
// 之后只整理新增的楼层；否则当作“在新聊天里继续这份档案”，当前聊天的楼层之后会被整理成新的记忆。
export async function importArchiveFile(text, { sameHistory = true, context = core_context.currentCharacterGuard() } = {}) {
    return installArchiveData(parseArchiveFile(text), { sameHistory, context });
}

// 接管检查点 / 复制聊天里带过来的档案：直接用聊天里已有的那份数据，不需要文件。
export async function adoptForeignArchive({ sameHistory = true, context = core_context.currentCharacterGuard() } = {}) {
    const foreign = foreignArchiveInChat(context);
    if (!foreign) throw core_text.safeUserError('这个聊天里没有可以接管的档案。', 'RMT_ARCHIVE_FILE_FORMAT');
    if (!archive_repository.isCompatibleArchive(foreign.memory)) throw core_text.safeUserError('带过来的档案格式无法在这个版本中读取。', 'RMT_ARCHIVE_FILE_FORMAT');
    const stored = context.chatMetadata[core_constants.CACHE_KEY];
    let cache = {};
    if (core_cache.isCompressedCacheRecord(stored)) cache = await core_cache.gunzipJson(stored.data) || {};
    else if (stored && typeof stored === 'object') cache = clone(stored);
    return installArchiveData({ memory: clone(foreign.memory), cache, metadata: {}, sourceChatId: foreign.memory.chatId, exportedAt: String(foreign.memory.updatedAt || Date.now()) }, { sameHistory, context });
}
