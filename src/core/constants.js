// Heartbeat Memories r35 modular runtime.
// Extracted from r34 without changing archive/cache storage contracts.
export const THEATER_ID = 'heartbeat_memories';

export const OVERLAY_ID = 'heartbeat_memories_overlay';

export const SETTINGS_ID = 'heartbeat_memories_settings';

export const MENU_ID = 'heartbeat_memories_menu_item';

export const STYLE_ID = 'heartbeat_memories_styles';

export const SETTINGS_STYLE_ID = 'heartbeat_memories_settings_styles';

export const CACHE_KEY = 'heartbeatMemoriesTheaterV3';

export const PHONE_DRAFT_CACHE_KEY = 'phoneGenerationDraftV1';

export const MEMORY_KEY = 'heartbeatMemoriesArchiveV3';

export const ARCHIVE_SCHEMA_VERSION = 3;

export const MIN_SUPPORTED_ARCHIVE_SCHEMA_VERSION = 3;

export const MEMORY_VERSION = ARCHIVE_SCHEMA_VERSION;

export const CACHE_STORAGE_FORMAT = 'gzip-base64-v1';

export const CACHE_STORAGE_VERSION = 1;

export const CALENDAR_SESSION_VERSION = 5;

export const PHONE_SESSION_VERSION = 2;

export const MAX_CACHE_COMPRESSED_BASE64_CHARS = 4000000;

export const MAX_CACHE_DECOMPRESSED_BYTES = 12000000;

export const MAX_CACHE_SOURCE_BYTES = MAX_CACHE_DECOMPRESSED_BYTES;

export const ARCHIVE_BACKUP_DB_NAME = 'heartbeatMemoriesArchiveBackupsV1';

export const ARCHIVE_BACKUP_STORE_NAME = 'archives';

export const ARCHIVE_BACKUP_STORAGE_VERSION = 1;

// Compatibility alias for test/tooling consumers from r42.2 and earlier. The cache writer no
// longer compares this budget with String.length; UTF-8 bytes are the authoritative unit.
export const MAX_CACHE_SOURCE_CHARS = MAX_CACHE_SOURCE_BYTES;

export const MAX_IMPORT_MESSAGES = 4000;

export const MAX_IMPORT_TOTAL_CHARS = 1200000;

export const IMPORT_CHUNK_CHARS = 30000;

export const MAX_MEMORY_ITEMS = 240;

export const MAX_MEMORY_PROMPT_ITEMS = 64;

export const DERIVED_INCREMENTAL_SCHEMA_VERSION = 1;

export const MAX_DERIVED_CONTENT_ITEMS = MAX_MEMORY_ITEMS;

export const MAX_INCREMENTAL_EXISTING_INDEX_ITEMS = 120;

export const MAX_GENERATION_INPUT_TOKENS = 32000;

export const MAX_GENERATION_OUTPUT_TOKENS = 60000;

export const MAX_GENERATION_OUTPUT_CHARS = 600000;

export const MAX_GENERATION_INPUT_CHARS = 96000;

export const MAX_EXTERNAL_MEMORY_ITEMS = 256;

export const MAX_EXTERNAL_MEMORY_CHARS = 240000;

export const EXTERNAL_MEMORY_CHUNK_CHARS = 26000;

export const EXTERNAL_MEMORY_FETCH_LIMIT = 200;

export const ARCHIVE_INDEX_SETTINGS_KEY = 'heartbeatMemoriesArchiveIndexV1';

export const ARCHIVE_INDEX_MAX = 1200;

export const ARCHIVE_GROUPS_SETTINGS_KEY = 'heartbeatMemoriesArchiveGroupsV1';

export const ARCHIVE_GROUPS_MAX = 240;

export const ARCHIVE_DELETED_CHARACTERS_SETTINGS_KEY = 'heartbeatMemoriesDeletedCharactersV1';

export const ARCHIVE_DELETED_CHARACTERS_MAX = 240;

export const ARCHIVE_CHARACTER_PROFILES_SETTINGS_KEY = 'heartbeatMemoriesCharacterProfilesV1';

export const ARCHIVE_CHARACTER_PROFILES_MAX = 240;

export const EXTENSION_SETTINGS_KEY = 'heartbeatMemories';

export const AVATAR_VISIT_SETTINGS_KEY = 'heartbeatMemoriesAvatarVisitsV1';

export const MAX_BANNED_GENERATED_PHRASES = 24;

export const MEMORY_WORLD_INFO_SETTINGS_KEY = 'heartbeatMemoriesMemoryWorldInfoV1';

export const MAX_MEMORY_WORLD_INFO_BOOKS = 8;

export const MAX_MEMORY_WORLD_INFO_ENTRIES = 160;

export const MAX_MEMORY_WORLD_INFO_CHARS = 52000;

export const DEFAULT_SETTINGS = Object.freeze({
    connectionProfileId: '',
    modelOverride: '',
    maxTokens: 16384,
    temperature: 0.9,
    roomLifeAutoDaily: true,
    useCurrentChatExternalMemory: true,
    // Executing another extension's public reader is an explicit opt-in. Prompt/metadata summaries
    // remain available without this because they are passive data already present in SillyTavern.
    usePublicMemoryProviderReaders: false,
    // Manual fallback for hosts where Image Generation is active but its SlashCommand object is
    // not exposed through the current context registry. Off by default; when enabled we may use
    // the public executeSlashCommandsWithOptions('/sd quiet=true ...') path with a sanitized prompt.
    imageGenerationManualEnabled: false,
    // Optional r32-style mobile safe-area presentation. Off keeps the long-standing edge-to-edge fullscreen UI.
    ttDisplayMode: false,
    // Applies only to newly model-generated derivative content. Never rewrite chat/archive evidence.
    bannedGeneratedPhrases: ['老子'],
});

export const MODE = Object.freeze({
    BUTTERFLY: 'butterfly',
    ALBUM: 'album',
    ADV: 'adv',
    ROOM: 'room',
    ITEMS: 'items',
    PHONE: 'phone',
    ENDING: 'ending',
    CALENDAR: 'calendar',
    RELATIONS: 'relations',
    HEART: 'heart',
    ACHIEVEMENTS: 'achievements',
});

export const MODE_LABEL = Object.freeze({
    [MODE.BUTTERFLY]: '蝴蝶效应的时间节点',
    [MODE.ALBUM]: '回忆相簿',
    [MODE.ADV]: 'ADV EVENT',
    [MODE.ROOM]: '他的房间',
    [MODE.ITEMS]: '他的物品',
    [MODE.PHONE]: '他的私人终端',
    [MODE.ENDING]: '结局与后日谈',
    [MODE.CALENDAR]: '两个人的日历',
    [MODE.RELATIONS]: '人际庭园',
    [MODE.HEART]: '角色互动与 Voice Drama',
    [MODE.ACHIEVEMENTS]: '成就库',
});

export const MODE_TOKEN_CAPS = Object.freeze({
    [MODE.BUTTERFLY]: MAX_GENERATION_OUTPUT_TOKENS,
    [MODE.ALBUM]: MAX_GENERATION_OUTPUT_TOKENS,
    [MODE.ADV]: MAX_GENERATION_OUTPUT_TOKENS,
    [MODE.ROOM]: MAX_GENERATION_OUTPUT_TOKENS,
    [MODE.ITEMS]: MAX_GENERATION_OUTPUT_TOKENS,
    [MODE.PHONE]: MAX_GENERATION_OUTPUT_TOKENS,
    [MODE.ENDING]: MAX_GENERATION_OUTPUT_TOKENS,
    [MODE.CALENDAR]: 6000,
    [MODE.RELATIONS]: 7000,
    [MODE.HEART]: MAX_GENERATION_OUTPUT_TOKENS,
    [MODE.ACHIEVEMENTS]: 6000,
});

export const ARCHIVE_PORTAL_MODES = Object.freeze([MODE.ALBUM, MODE.ADV, MODE.ROOM, MODE.ENDING, MODE.CALENDAR, MODE.RELATIONS, MODE.HEART, MODE.ACHIEVEMENTS, MODE.BUTTERFLY]);

export const ROOM_DEEP_MODES = Object.freeze([MODE.ITEMS, MODE.PHONE]);

export const MEMORY_PROVIDER_TRACE_RE = /(memory|memories|memo|recall|remember|summary|summar|history|lore|horae|vector|记忆|回忆|忆|摘要|总结|往事|历史)/i;

export const CURRENT_CHAT_MEMORY_SOURCE_RE = /(memory|memories|memo|recall|remember|summary|summar|recap|history|记忆|回忆|摘要|总结|小结|回顾|历史)/i;

export const SETTING_ONLY_SOURCE_RE = /(world(?:[_ -]?(?:info|book))?|lore(?:[_ -]?book)?|character|persona|author|scenario|世界书|世界观|设定|角色卡|人设|作者|场景)/i;

export const PUBLIC_MEMORY_READER_NAMES = Object.freeze(['getInjectedHistory', 'getCurrentChatMemories', 'getCurrentChatMemory', 'getCurrentChatSummary', 'getCurrentSummary']);

export const ARCHIVE_OVERVIEW_CACHE_MS = 60000;

export const MEMORY_PROVIDER_DISCOVERY_CACHE_MS = 120000;

export const CATEGORY_VALUES = new Set(['日常', '约会', '结局']);

export const ROOM_ZONE_VALUES = new Set(['左上', '右上', '左下', '右下', '中央', '近景']);

export const ROOM_BASIS_VALUES = new Set(['设定', '记忆']);

export const PHONE_DEVICE_KINDS = new Set(['phone', 'watch', 'terminal', 'communicator']);

export const PHONE_EXCLUDED_APP_KINDS = new Set(['schedule', 'calendar']);

export const ROOM_DAYPART_KEYS = ['morning', 'daytime', 'evening', 'night'];

export const ENDING_TYPES = new Set(['route', 'romance', 'reverse', 'bond', 'open', 'personal']);

export const CONFESSION_REPLAY_TYPES = new Set(['true', 'mutual', 'friendship', 'indirect', 'relationship', 'rejected', 'other']);

export const CG_IMAGE_PROVIDER = 'sillytavern-imagine';

export const MAX_CG_IMAGE_PROMPT_CHARS = 1800;

export const HEART_GREETING_KEYS = Object.freeze(['morning', 'noon', 'evening', 'night', 'weekend', 'birthday', 'userBirthday', 'holiday', 'absenceWorry', 'absenceSulky', 'absenceJealous']);

export const HEART_VOICE_KINDS = new Set(['postending', 'spring', 'summer', 'autumn', 'winter']);

export const HEART_SCENARIO_SEASONS = new Set(['spring', 'summer', 'autumn', 'winter']);

export const HEART_DRAMA_VISUAL_TONES = new Set(['soft', 'clear', 'muted', 'deep']);

export const HEART_FIREFLY_COLORS = new Set(['pink', 'blue', 'yellow', 'white', 'desire']);
export const HEART_FIREFLY_MAX_ITEMS = MAX_DERIVED_CONTENT_ITEMS;
export const HEART_FIREFLY_PAGE_SIZE = 6;

export const HEART_STRIP_PANEL_COUNTS = new Set([1, 2, 4]);

export const MAX_CONCURRENT_GENERATION_TASKS = 5;

export const ADV_BULK_BATCH_SIZE = 6;

export const MAX_CONCURRENT_PROVIDER_REQUESTS = 2;

export const CACHE_PERSIST_IDLE_RETRY_MS = 1200;

export const DEFAULT_GENERATION_REQUEST_TIMEOUT_MS = 300000;

export const MIN_GENERATION_REQUEST_TIMEOUT_MS = 30000;

export const MAX_GENERATION_REQUEST_TIMEOUT_MS = 600000;

export const SEGMENT_REQUEST_CONCURRENCY = 1;

export const ARCHIVE_SNAPSHOT_CACHE_MAX = 4;

export const RUNTIME_SESSION_CACHE_MAX = 3;
