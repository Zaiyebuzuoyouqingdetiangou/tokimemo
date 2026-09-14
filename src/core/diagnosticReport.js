// Copyable diagnostic report.
//
// Reachable from the extension settings page, so it still works when the archive room
// will not open or an import is stuck. It reads already-held state only: it never calls a
// generation API, never touches an archive, never retries and never repairs.
import * as core_castLooks from './castLooks.js';
import * as core_constants from './constants.js';
import * as core_context from './context.js';
import * as core_state from './state.js';
import * as core_taskTrace from './taskTrace.js';
import * as core_text from './text.js';

function hostCapabilities(context) {
    // Presence only — never a value.
    const names = ['getCharacterCardFields', 'getWorldInfoPrompt', 'getTokenCountAsync',
        'saveMetadataDebounced', 'ConnectionManagerRequestService', 'SlashCommandParser',
        'eventSource', 'loadWorldInfo'];
    const out = {};
    for (const name of names) {
        const value = context?.[name];
        out[name] = typeof value === 'function' || (value && typeof value === 'object');
    }
    out.imageProvider = !!globalThis.STBaiBaiImage;
    out.imageProviderApiVersion = Number(globalThis.STBaiBaiImage?.apiVersion) || 0;
    return out;
}

function storageState(context) {
    const meta = context?.chatMetadata && typeof context.chatMetadata === 'object' ? context.chatMetadata : {};
    const size = value => {
        try { return value === undefined ? 0 : JSON.stringify(value).length; } catch { return -1; }
    };
    const archive = meta[core_constants.MEMORY_KEY];
    const cache = meta[core_constants.CACHE_KEY];
    return {
        hasArchive: !!archive,
        archiveChars: size(archive),
        memoryCount: Array.isArray(archive?.memories) ? archive.memories.length : 0,
        hasCache: !!cache,
        cacheChars: size(cache),
        cacheCompressed: !!(cache && typeof cache === 'object' && typeof cache.gz === 'string'),
        cachedModes: cache && typeof cache === 'object'
            ? Object.keys(cache).filter(key => !['chatId', 'archiveRevision', 'updatedAt', 'gz'].includes(key)) : [],
        localStorageWritable: (() => {
            try { localStorage.setItem('__rmt_probe', '1'); localStorage.removeItem('__rmt_probe'); return true; }
            catch { return false; }
        })(),
    };
}

function castLooksState(context) {
    let record = null;
    try { record = core_castLooks.readCastLooks(context); } catch {}
    if (!record) return { present: false };
    // Lengths and flags only — never the appearance text itself.
    return { present: true, manual: record.manual === true,
        charChars: record.char.length, userChars: record.user.length,
        roles: [record.char ? 'char' : '', record.user ? 'user' : ''].filter(Boolean) };
}

export function buildDiagnosticReport() {
    let context = null;
    try { context = core_context.getContext(); } catch {}
    const state = core_state.state;
    return {
        generatedAt: new Date().toISOString(),
        plugin: {
            declaredVersion: core_text.normalizeText(globalThis.__heartbeatMemoriesVersion, 40) || 'unknown',
            runtimeLoaded: !!globalThis.__heartbeatMemoriesRuntimeLoaded,
            archiveSchema: core_constants.ARCHIVE_SCHEMA_VERSION,
        },
        host: {
            protocol: core_text.normalizeText(globalThis.location?.protocol, 20),
            // Hostname only; never the full href, which can carry query parameters.
            hostname: core_text.normalizeText(globalThis.location?.hostname, 60),
            capabilities: hostCapabilities(context),
        },
        chat: {
            hasContext: !!context,
            isGroup: !!context?.groupId,
            messageCount: Array.isArray(context?.chat) ? context.chat.length : -1,
        },
        runtime: {
            busy: state.busy === true,
            activeTaskLabel: core_text.normalizeText(state.activeTaskLabel, 60),
            generationTasks: state.activeGenerationTasks?.size ?? 0,
            cgImageTasks: state.activeCgImageTasks?.size ?? 0,
            providerInFlight: state.activeProviderRequestCount ?? 0,
            providerQueued: state.providerRequestQueue?.length ?? 0,
            rateLimitHits: state.rateLimitHits ?? 0,
            deferredCommits: state.deferredCommits?.size ?? 0,
        },
        storage: storageState(context),
        castLooks: castLooksState(context),
        recentTasks: core_taskTrace.taskTraceSnapshot(),
    };
}

export function diagnosticReportText() {
    try { return JSON.stringify(buildDiagnosticReport(), null, 2); }
    catch (error) { return `诊断报告生成失败：${core_text.safeErrorSummary(error)}`; }
}
