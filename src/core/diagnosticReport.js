// Diagnostics read only already-held, bounded counters. Never serialize archives,
// inspect chat contents, probe storage, or call a provider to produce this report.
import * as core_constants from './constants.js';
import * as core_context from './context.js';
import * as core_state from './state.js';
import * as core_taskTrace from './taskTrace.js';

const MODES = Object.freeze(Object.values(core_constants.MODE));
const CAST_LOOKS_KEY = 'heartbeatMemoriesCastLooksV1';
const count = value => typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1_000_000_000, Math.floor(value))) : 0;
const length = value => typeof value === 'string' ? count(value.length) : 0;

function hostCapabilities(context) {
    const names = ['getCharacterCardFields', 'getWorldInfoPrompt', 'getTokenCountAsync',
        'saveMetadataDebounced', 'ConnectionManagerRequestService', 'SlashCommandParser',
        'eventSource', 'loadWorldInfo'];
    const out = {};
    for (const name of names) {
        const value = context?.[name];
        out[name] = typeof value === 'function' || (!!value && typeof value === 'object');
    }
    return out;
}

function storageState(context) {
    const meta = context?.chatMetadata && typeof context.chatMetadata === 'object' ? context.chatMetadata : {};
    const archive = meta[core_constants.MEMORY_KEY];
    const cache = meta[core_constants.CACHE_KEY];
    const compressed = !!cache && typeof cache === 'object'
        && cache.format === core_constants.CACHE_STORAGE_FORMAT && typeof cache.data === 'string';
    const cachedModes = [];
    if (compressed && Array.isArray(cache.modes)) {
        // At most 32 manifest entries; never enumerate an uncompressed cache.
        for (let i = 0; i < Math.min(32, cache.modes.length); i += 1) {
            const mode = cache.modes[i];
            if (MODES.includes(mode) && !cachedModes.includes(mode)) cachedModes.push(mode);
        }
    }
    return {
        hasArchive: !!archive,
        memoryCount: Array.isArray(archive?.memories) ? count(archive.memories.length) : 0,
        hasCache: !!cache,
        cacheCompressed: compressed,
        cacheFormat: compressed ? core_constants.CACHE_STORAGE_FORMAT : cache ? 'legacy-uncompressed' : 'none',
        base64Chars: compressed ? length(cache.data) : 0,
        sourceChars: compressed ? count(cache.sourceChars) : 0,
        sourceBytes: compressed ? count(cache.sourceBytes) : 0,
        cachedModes,
    };
}

function castLooksState(context) {
    const record = context?.chatMetadata?.[CAST_LOOKS_KEY];
    if (!record || typeof record !== 'object') return { present: false };
    const charChars = length(record.char), userChars = length(record.user);
    return { present: !!(charChars || userChars), manual: record.manual === true,
        charChars, userChars,
        roles: [charChars ? 'char' : '', userChars ? 'user' : ''].filter(Boolean) };
}

export function buildDiagnosticReport() {
    let context = null;
    try { context = core_context.getContext(); } catch {}
    const state = core_state.state;
    const version = globalThis.__heartbeatMemoriesVersion;
    const protocol = globalThis.location?.protocol;
    return {
        generatedAt: new Date().toISOString(),
        plugin: {
            declaredVersion: typeof version === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-tt-cg-r\d{1,3}\.\d{1,2})?$/.test(version) ? version : 'unknown',
            runtimeLoaded: !!globalThis.__heartbeatMemoriesRuntimeLoaded,
            archiveSchema: core_constants.ARCHIVE_SCHEMA_VERSION,
        },
        host: {
            protocol: ['https:', 'http:', 'tauri:', 'asset:', 'file:'].includes(protocol) ? protocol : 'other',
            capabilities: hostCapabilities(context),
        },
        chat: {
            hasContext: !!context,
            isGroup: !!context?.groupId,
            messageCount: Array.isArray(context?.chat) ? count(context.chat.length) : 0,
        },
        runtime: {
            busy: state.busy === true,
            hasActiveTask: !!state.activeTaskLabel,
            generationTasks: count(state.activeGenerationTasks?.size),
            cgImageTasks: count(state.activeCgImageTasks?.size),
            providerInFlight: count(state.activeProviderRequestCount),
            providerQueued: count(state.providerRequestQueue?.length),
            rateLimitHits: count(state.rateLimitHits),
            deferredCommits: count(state.deferredChatCommits?.size),
        },
        storage: storageState(context),
        castLooks: castLooksState(context),
        recentTasks: core_taskTrace.taskTraceSnapshot(),
    };
}

export function diagnosticReportText() {
    try { return JSON.stringify(buildDiagnosticReport(), null, 2); }
    catch { return JSON.stringify({ code: 'RMT_DIAGNOSTIC_UNAVAILABLE' }, null, 2); }
}

// The bootstrap keeps the external UI alive; this callback adds runtime counters
// only after the user has already loaded the runtime for another action.
export function installRuntimeDiagnostic() {
    globalThis.__heartbeatMemoriesRuntimeDiagnosticText = diagnosticReportText;
}

export function uninstallRuntimeDiagnostic() {
    if (globalThis.__heartbeatMemoriesRuntimeDiagnosticText === diagnosticReportText) {
        delete globalThis.__heartbeatMemoriesRuntimeDiagnosticText;
    }
}
