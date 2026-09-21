// Diagnostics read only already-held, bounded counters. Never serialize archives,
// inspect chat contents, probe storage, or call a provider to produce this report.
import * as core_constants from './constants.js';
import * as core_context from './context.js';
import * as core_state from './state.js';
import * as core_taskTrace from './taskTrace.js';
import * as core_backupDiagnostics from './backupDiagnostics.js';

const MODES = Object.freeze(Object.values(core_constants.MODE));
const CAST_LOOKS_KEY = 'heartbeatMemoriesCastLooksV1';
const count = value => typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1_000_000_000, Math.floor(value))) : 0;
const length = value => typeof value === 'string' ? count(value.length) : 0;
const DEFERRED_ERROR_CODES = new Set(['RMT_DEFERRED_QUOTA', 'RMT_DEFERRED_SECURITY',
    'RMT_DEFERRED_UNAVAILABLE', 'RMT_DEFERRED_LIMIT', 'RMT_DEFERRED_SERIALIZE', 'RMT_DEFERRED_UNKNOWN']);
const DEFERRED_ERROR_CATEGORIES = new Set(['quota', 'security', 'unavailable', 'limit', 'serialize', 'unknown']);

function hostCapabilities(context) {
    const names = ['getCharacterCardFields', 'getWorldInfoPrompt', 'getTokenCountAsync',
        'saveMetadataDebounced', 'ConnectionManagerRequestService', 'SlashCommandParser',
        'eventSource', 'loadWorldInfo'];
    const out = {};
    for (const name of names) {
        const value = context?.[name];
        out[name] = typeof value === 'function' || (!!value && typeof value === 'object');
    }
    try { out.indexedDB = !!globalThis.indexedDB; } catch { out.indexedDB = false; }
    out.secureContext = typeof globalThis.isSecureContext === 'boolean' ? globalThis.isSecureContext : null;
    return out;
}

function deferredStorageState() {
    // diagnosticStatus reads scalar fields maintained at actual persistence
    // boundaries. Do not call persistenceStatus: it counts the pending payloads.
    let status = null;
    try { status = core_state.state.deferredChatCommits?.diagnosticStatus?.() || null; } catch {}
    return {
        available: typeof status?.available === 'boolean' ? status.available : null,
        healthy: typeof status?.healthy === 'boolean' ? status.healthy : null,
        errorCode: DEFERRED_ERROR_CODES.has(status?.errorCode) ? status.errorCode : '',
        errorCategory: DEFERRED_ERROR_CATEGORIES.has(status?.errorCategory) ? status.errorCategory : '',
    };
}

function archiveIdentityState(archive, context) {
    const versionValue = archive?.version;
    const version = typeof versionValue === 'number' || (typeof versionValue === 'string' && /^\d{1,3}$/.test(versionValue))
        ? Number(versionValue) : 0;
    const schema = Number.isInteger(version) && version > 0 && version < 1000 ? version : 0;
    // Compare already-held scalars only. Calling a host ID getter here would
    // make an otherwise passive diagnostic dependent on arbitrary host work.
    const heldId = value => typeof value === 'string' && value.length <= 512
        ? value.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim().slice(0, 240) : '';
    const archiveId = heldId(archive?.chatId), chatId = heldId(context?.chatId);
    const comparable = value => value.replace(/\.jsonl$/i, '').trim();
    const comparableIds = !!(archiveId && chatId);
    return {
        archiveSchema: schema,
        archiveSchemaSupported: !!archive && Array.isArray(archive.memories)
            && schema >= core_constants.MIN_SUPPORTED_ARCHIVE_SCHEMA_VERSION && schema <= core_constants.ARCHIVE_SCHEMA_VERSION,
        archiveChatComparisonSource: comparableIds ? 'context.chatId' : 'unavailable',
        archiveChatMatches: comparableIds ? comparable(archiveId) === comparable(chatId) : null,
        archiveChatExactMatch: comparableIds ? archiveId === chatId : null,
    };
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
        ...archiveIdentityState(archive, context),
        memoryCount: Array.isArray(archive?.memories) ? count(archive.memories.length) : 0,
        memoryCap: core_constants.MAX_MEMORY_ITEMS,
        coldArchiveCount: Array.isArray(archive?.coldArchive) ? count(archive.coldArchive.length) : 0,
        coldArchiveCap: core_constants.MAX_COLD_ARCHIVE_ITEMS,
        lockedCount: Array.isArray(archive?.memories) ? count(archive.memories.filter(item => item?.locked === true).length) : 0,
        inputBudgetTokens: count(context?.extensionSettings?.[core_constants.EXTENSION_SETTINGS_KEY]?.inputBudgetTokens),
        snapshotBudget: 1200000,
        hasCache: !!cache,
        cacheCompressed: compressed,
        cacheFormat: compressed ? core_constants.CACHE_STORAGE_FORMAT : cache ? 'legacy-uncompressed' : 'none',
        base64Chars: compressed ? length(cache.data) : 0,
        sourceChars: compressed ? count(cache.sourceChars) : 0,
        sourceBytes: compressed ? count(cache.sourceBytes) : 0,
        cachedModes,
        backup: core_backupDiagnostics.backupDiagnosticSnapshot(),
        deferred: deferredStorageState(),
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
            declaredVersion: typeof version === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[0-9a-z.\-]{1,40})?$/i.test(version) ? version : 'unknown',
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
            hasPendingWork: state.busy === true || !!state.activeTaskLabel
                || count(state.activeGenerationTasks?.size) > 0 || count(state.activeModeBuildScopes?.size) > 0
                || count(state.activeAdvBulkScopes?.size) > 0 || count(state.activeArchiveTargetReservations?.size) > 0
                || count(state.activeCgImageTasks?.size) > 0 || count(state.activeProviderRequestCount) > 0
                || count(state.providerRequestQueue?.length) > 0 || !!state.roomLifeRefreshPromise,
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

// The normal diagnostic entry lives on the plugin home page. The bootstrap
// retains an external fallback if runtime loading fails; this callback supplies
// counters only after the runtime has already been loaded for another action.
export function installRuntimeDiagnostic() {
    globalThis.__heartbeatMemoriesRuntimeDiagnosticText = diagnosticReportText;
}

export function uninstallRuntimeDiagnostic() {
    if (globalThis.__heartbeatMemoriesRuntimeDiagnosticText === diagnosticReportText) {
        delete globalThis.__heartbeatMemoriesRuntimeDiagnosticText;
    }
}
