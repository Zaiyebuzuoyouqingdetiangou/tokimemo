import test from 'node:test';
import assert from 'node:assert/strict';

import { loadSession, migrateLegacyTravelSession } from '../src/core/cache.js';
import { MODE, PHONE_SESSION_VERSION, TRAVEL_SESSION_VERSION } from '../src/core/constants.js';
import { relationshipExpressionTier } from '../src/core/presentExpression.js';
import { fetchModelsForConnection, getPluginSettings } from '../src/core/settings.js';
import { requestManualApiCompletion } from '../src/core/independentApi.js';
import { state as runtimeState } from '../src/core/state.js';
import { safeErrorSummary } from '../src/core/text.js';
import { resolveWorldPresentation } from '../src/core/worldPresentation.js';
import { generateConfiguredJson, normalizeConnectionManagerError } from '../src/generation/client.js';
import { MEMORY_PROVIDER_REGISTRY } from '../src/archive/memoryProviders.js';
import { collectCurrentChatExternalMemory, externalMemorySourceSummary } from '../src/archive/repository.js';
import { setMemorySourceLedgerBackendForTests } from '../src/archive/sourceLedger.js';
import { normalizePhoneConversationMessages } from '../src/modes/phone.js';
import { normalizeRoomPets } from '../src/modes/room.js';
import { renderPhoneEntryDetail } from '../src/ui/phoneView.js';

test.afterEach(() => {
    runtimeState.connectionModelCache.clear();
    runtimeState.connectionModelRequestEpochs.clear();
    runtimeState.activeGenerationTasks.clear();
    runtimeState.apiConfigurationEpoch = 0;
    setMemorySourceLedgerBackendForTests(null);
    delete globalThis.SillyTavern;
    delete globalThis.STBaiBaiBook;
});

test('r49 registered memory adapters never read an unregistered plugin private settings, prompt, metadata or credential', async () => {
    assert.deepEqual(MEMORY_PROVIDER_REGISTRY.map(item => item.id), ['sillytavern-memory', 'baibai-book-public-api']);
    const context = {
        characterId: 0,
        groupId: null,
        chatId: 'private-boundary-chat',
        name1: '用户',
        name2: '角色',
        characters: [{ name: '角色', avatar: 'private-boundary.png', data: { name: '角色', avatar: 'private-boundary.png' } }],
        getCurrentChatId: () => 'private-boundary-chat',
        extensionPrompts: {
            unknown_memory_plugin: { name: 'Memory Summary', summary: 'UNREGISTERED_PROMPT_SENTINEL' },
        },
        extensionSettings: {
            heartbeatMemories: { useCurrentChatExternalMemory: true, usePublicMemoryProviderReaders: true },
            st_evermind: { enabled: true, api_key: 'must-not-be-read', api_base_url: 'https://private.invalid' },
        },
        chatMetadata: {
            st_evermind: { group_id: 'private-group' },
            unknown_memory_bridge: { summary: 'UNREGISTERED_METADATA_SENTINEL' },
        },
    };
    assert.deepEqual(externalMemorySourceSummary(context), []);
    const writes = [];
    setMemorySourceLedgerBackendForTests({
        async read() { return null; },
        async write(value) { writes.push(structuredClone(value)); return true; },
        async delete() { return true; },
    });
    const collected = await collectCurrentChatExternalMemory(context, 'private-boundary-chat', new AbortController().signal);
    assert.deepEqual(collected.records, []);
    assert.deepEqual(collected.sources, []);
    assert.equal(writes.length, 0);
    assert.doesNotMatch(JSON.stringify(collected), /UNREGISTERED_PROMPT_SENTINEL|UNREGISTERED_METADATA_SENTINEL|must-not-be-read|private-group/);
    getPluginSettings(context);
    assert.equal(Object.hasOwn(context.extensionSettings.heartbeatMemories, 'usePublicMemoryProviderReaders'), false);
});

function envelope(card = {}, world = '') {
    return `CHARACTER_CARD_JSON:\n${JSON.stringify(card, null, 2)}\nUSER_PERSONA_JSON:\n{}\nWORLD_INFO_TEXT:\n${world}\n【上下文结束】`;
}

function chatMemory(id, start, end, summary) {
    return { id, sourceKind: 'chat', messageStart: start, messageEnd: end, title: '', summary, anchors: [] };
}

function worldStyle({ card = {}, world = '', memories = [], revision = 'rev', binding = null } = {}) {
    return resolveWorldPresentation(envelope(card, world), { archiveRevision: revision, memories }, binding);
}

test('r49 relationship state uses the complete pair timeline without third-party or suffix escalation', () => {
    const base = { characterName: '林砚', userName: '小月', archiveSummary: '', memories: [] };
    assert.equal(relationshipExpressionTier({ ...base, archiveSummary: '林砚和小月刚认识' }), 0);
    assert.equal(relationshipExpressionTier({ ...base, archiveSummary: '双方是合作伙伴' }), 1);
    assert.equal(relationshipExpressionTier({ ...base, archiveSummary: 'We are close friends' }), 2);
    assert.equal(relationshipExpressionTier({ ...base, archiveSummary: '林砚与小月稳定交往中' }), 3);
    assert.equal(relationshipExpressionTier({ ...base, archiveSummary: '林砚和小月过去分手。现在复合' }), 3);
    assert.equal(relationshipExpressionTier({ ...base, archiveSummary: 'Lin and May once had conflict. Now reconciled', characterName: 'Lin', userName: 'May' }), 2);
    assert.equal(relationshipExpressionTier({ ...base, archiveSummary: '关于 Alice 和 Bob，我们得知两人已婚' }), 0);
    assert.equal(relationshipExpressionTier({ ...base, archiveSummary: 'We heard both are married' }), 0);
    assert.equal(relationshipExpressionTier({ ...base, archiveSummary: '林砚和小月是情侣主题展策展人' }), 0);
    assert.equal(relationshipExpressionTier({ ...base, archiveSummary: 'Lin and May are partners in a law firm', characterName: 'Lin', userName: 'May' }), 0);

    const timeline = {
        ...base,
        memories: [
            { summary: '正式交往', participants: ['林砚', '小月'] },
            ...Array.from({ length: 11 }, (_, index) => ({ summary: `普通日常 ${index}`, participants: ['林砚', '小月'] })),
        ],
    };
    assert.equal(relationshipExpressionTier(timeline), 3);
    timeline.memories.push({ summary: '关系结束', participants: ['林砚', '小月'] });
    assert.equal(relationshipExpressionTier(timeline), 0);
    timeline.memories.push({ summary: '双方过去分手；如今重新交往', participants: ['林砚', '小月'] });
    assert.equal(relationshipExpressionTier(timeline), 3);
});

test('r49 world presentation rejects media cues and accepts explicit setting evidence', () => {
    assert.equal(worldStyle().worldStyle, 'neutral');
    assert.equal(worldStyle({ card: { name: '林砚', description: '林砚常驻空间站，担任星舰工程师' } }).worldStyle, 'scifi');
    assert.equal(worldStyle({ card: { name: '林砚', description: '他喜欢看科幻电影' } }).worldStyle, 'neutral');
    assert.equal(worldStyle({ card: { name: '林砚', description: '最喜欢的游戏是魔法与龙族' } }).worldStyle, 'neutral');
    assert.equal(worldStyle({ world: '博物馆正在举办中世纪骑士展' }).worldStyle, 'neutral');
    assert.equal(worldStyle({ card: { description: '他喜欢一部电影，主角常驻空间站' } }).worldStyle, 'neutral');
    assert.equal(worldStyle({ world: '博物馆正在展览，中世纪王朝的骑士生活在城堡' }).worldStyle, 'neutral');
    assert.equal(worldStyle({ card: { description: '生活在江户时代，担任武士' } }).worldStyle, 'historical');
    assert.equal(worldStyle({ card: { description: '居住在精灵王国，是魔法师' } }).worldStyle, 'fantasy');
    assert.equal(worldStyle({ card: { description: '生活在现代都市，每天乘地铁上班' } }).worldStyle, 'contemporary');
});

test('r49 world presentation keeps media scope separate from replaceable state negation', () => {
    const framed = [
        '书里，主角生活在魔法王国',
        '荧幕上，他在空间站工作',
        '银幕上，他在空间站工作',
        '屏幕中，他在空间站工作',
        '电视里，他在空间站工作',
        '连续剧里，他住在魔法王国',
        '同人文里，他住在魔法王国',
        '人设中，他是星舰工程师',
        'VR世界中，他在空间站工作',
        '梦乡里，他在空间站工作',
        '脑海里，他在空间站工作',
        '设想中，他住在魔法王国',
        '臆想中，他住在魔法王国',
        'On television, he works at a space station',
        'In fanfic, he lives at a space station',
        '视频里，主角在空间站工作',
        '短视频中，主角在空间站工作',
        '影像中，主角在空间站工作',
        'MV里，主角在空间站工作',
        '戏里，主角住在魔法王国',
        '童话里，主角住在魔法王国',
        '寓言中，主角住在魔法王国',
        '画册中，主角住在魔法王国',
        'In a screenplay, he works at a space station',
        'In a video, he works at a space station',
        'Suppose he lives in a magic kingdom',
        '如果他在空间站工作',
        '倘若他乘坐星舰工作',
        '假如本人生活在魔法世界',
        '要是本人生活在魔法世界',
        '幻象中，他生活在魔法王国',
        '遐想中，他生活在魔法王国',
        '手游里，主角在空间站工作',
    ];
    for (const description of framed) {
        assert.equal(worldStyle({ card: { description } }).worldStyle, 'neutral', description);
    }

    const negated = [
        '尚未在空间站工作',
        '未在空间站工作',
        '并未在空间站工作',
        '未能在空间站工作',
        '无法在空间站工作',
        '不再在空间站工作',
        '不再担任星舰工程师',
        '并未担任星舰工程师',
        'He no longer works at a space station',
        'She is not a starship engineer',
        '从不在空间站工作',
        '不在魔法世界生活',
        '未担任星舰工程师',
        '未使用星舰终端',
        '未驾驶星舰工作',
        '已非星舰工程师',
        '没去过空间站工作',
        '并无在空间站工作的经历',
        '未就读星舰学院',
    ];
    for (const description of negated) {
        assert.equal(worldStyle({ card: { description } }).worldStyle, 'neutral', description);
    }

    const corrected = [
        ['本人不是星舰工程师，而是法师', 'fantasy'],
        ['本人并非生活在空间站，而是住在魔法王国', 'fantasy'],
        ['过去从未在魔法世界生活。现在本人常驻空间站', 'scifi'],
        ['此前不是法师；如今本人是星舰工程师', 'scifi'],
        ['虚构作品中的法师。实际上本人是法师', 'fantasy'],
        ['喜欢电影。本人常驻空间站', 'scifi'],
        ['生活在未来世界，使用星舰终端', 'scifi'],
    ];
    for (const [description, expected] of corrected) {
        assert.equal(worldStyle({ card: { description } }).worldStyle, expected, description);
    }
});

test('r49 Character Profile is identity-bound and revalidated against the current controlled source', () => {
    const card = { name: '林砚', description: '星舰工程师' };
    const profile = {
        key: 'group:a', characterName: '林砚', avatar: 'lin.png', introduction: '来自未来',
        facts: [{ label: '职业 / 学校', value: '星舰工程师', sourceType: 'character_card', sourceEvidence: '星舰工程师' }],
    };
    const binding = { profile, expectedProfileKey: 'group:a', characterName: '林砚', avatar: 'lin.png' };
    const accepted = worldStyle({ card, binding });
    assert.equal(accepted.worldStyle, 'scifi');
    assert.equal(accepted.evidenceSource, 'character-profile');
    assert.ok(accepted.evidenceIds.every(id => id.startsWith('profile:group:a:')));

    assert.equal(worldStyle({ card: { name: '林砚', description: '普通人' }, binding }).worldStyle, 'neutral');
    assert.equal(worldStyle({ card, binding: { ...binding, expectedProfileKey: 'group:b' } }).worldStyle, 'neutral');
    assert.equal(worldStyle({ card, binding: { ...binding, characterName: '另一角色' } }).worldStyle, 'neutral');
    assert.equal(worldStyle({ card, binding: { ...binding, avatar: 'other.png' } }).worldStyle, 'neutral');
    assert.equal(worldStyle({
        card: { name: '林砚', description: '喜欢魔法题材电影' },
        binding: {
            ...binding,
            profile: { ...profile, facts: [{ label: '职业 / 学校', value: '魔法师', sourceType: 'character_card', sourceEvidence: '喜欢魔法题材电影' }] },
        },
    }).worldStyle, 'neutral');
    assert.equal(worldStyle({
        card: { name: '林砚', description: '电影中的星舰工程师' },
        binding: { ...binding, profile: { ...profile, facts: [{ label: '职业 / 学校', value: '星舰工程师', sourceType: 'character_card', sourceEvidence: '星舰工程师' }] } },
    }).worldStyle, 'neutral');
    assert.equal(worldStyle({
        card: { name: '林砚', description: '游戏角色是魔法师' },
        binding: { ...binding, profile: { ...profile, facts: [{ label: '职业 / 学校', value: '魔法师', sourceType: 'character_card', sourceEvidence: '魔法师' }] } },
    }).worldStyle, 'neutral');
    assert.equal(worldStyle({ card: { name: '林砚', description: '普通人' }, binding: { ...binding, profile: { ...profile, facts: [] } } }).worldStyle, 'neutral');
});

test('r49 formal archive needs two independent real-chat evidence clusters and never overrides higher authority', () => {
    const one = [chatMemory('M001', 1, 2, '在空间站宿舍醒来')];
    assert.equal(worldStyle({ memories: one }).worldStyle, 'neutral');
    const two = [...one, chatMemory('M002', 8, 9, '乘星舰去轨道城上班')];
    const consensus = worldStyle({ memories: two });
    assert.equal(consensus.worldStyle, 'scifi');
    assert.equal(consensus.evidenceSource, 'archive-consensus');
    assert.match(consensus.evidenceIds.join('|'), /M001/);
    assert.match(consensus.evidenceIds.join('|'), /range:8-9/);

    const overlap = [chatMemory('M001', 1, 4, '在空间站宿舍醒来'), chatMemory('M002', 3, 5, '乘星舰回家')];
    assert.equal(worldStyle({ memories: overlap }).worldStyle, 'neutral');
    const entertainment = [chatMemory('M001', 1, 2, '看科幻电影'), chatMemory('M002', 8, 9, '玩机甲游戏')];
    assert.equal(worldStyle({ memories: entertainment }).worldStyle, 'neutral');
    const dreamLaundering = [chatMemory('M001', 1, 2, '他梦见，自己在空间站宿舍醒来'), chatMemory('M002', 8, 9, '梦境中，自己乘坐星舰去工作')];
    assert.equal(worldStyle({ memories: dreamLaundering }).worldStyle, 'neutral');
    assert.equal(worldStyle({ memories: [chatMemory('M001', 1, 2, '在空间站工作'), chatMemory('M002', 8, 9, '观看科幻电影')] }).worldStyle, 'neutral');
    const conflict = [...two, chatMemory('M003', 20, 21, '每日在法师塔施法')];
    assert.equal(worldStyle({ memories: conflict }).worldStyle, 'neutral');
    const fantasy = [chatMemory('M010', 2, 3, '每日在法师塔施法'), chatMemory('M011', 9, 10, '在精灵城使用传送阵工作')];
    assert.equal(worldStyle({ memories: fantasy }).worldStyle, 'fantasy');

    assert.equal(worldStyle({ card: { description: '生活在江户时代' }, memories: two }).worldStyle, 'historical');
    assert.equal(worldStyle({ card: { description: '常驻空间站' }, world: '生活在魔法王国' }).worldStyle, 'neutral');

    const coast = worldStyle({ memories: [chatMemory('M020', 30, 31, '在海港散步')] });
    assert.equal(coast.worldStyle, 'neutral');
    assert.equal(coast.mapTheme, 'coast');
    assert.equal(worldStyle({ memories: [{ ...chatMemory('M021', 0, 0, '在海港散步') }] }).mapTheme, 'neutral');
    assert.equal(worldStyle({ memories: [{ ...chatMemory('M022', 40, 41, '在海港散步'), sourceKind: 'world-info-history-book' }] }).mapTheme, 'neutral');
    const changed = worldStyle({ memories: two.slice(0, 1), revision: 'rev-next' });
    assert.notEqual(changed.evidenceHash, consensus.evidenceHash);
});

test('r49 legacy phone is preserved but downgraded through cache load and visibly warned', () => {
    const memoryBank = {
        chatId: 'phone-chat', archiveRevision: 'phone-rev', characterName: '纪时卿', userName: '小月',
        memories: [{ id: 'M001', title: '雨夜同行', summary: '纪时卿和小月在站台共撑一把伞。', anchors: ['站台雨伞'] }],
    };
    const legacy = {
        kind: MODE.PHONE, chatId: memoryBank.chatId, archiveRevision: memoryBank.archiveRevision,
        uiVersion: 2, deviceKind: 'phone', ownerName: '纪时卿', deviceName: '私人手机',
        selectedAppId: 'CHAT', selectedEntryId: 'C1', view: 'detail',
        apps: [{
            id: 'CHAT', label: '通讯', kind: 'chat', entries: [{
                id: 'C1', title: '前任爱丽丝', meta: '转账记录', preview: '她又转来五万元', detail: '隐瞒多年的前任关系',
                basis: '记忆', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '站台雨伞', sourceMemoryEvidence: '站台雨伞',
                messages: [
                    { speakerRole: 'contact', speaker: '爱丽丝', time: '10:24', text: '钱已经转给你了' },
                    { speakerRole: 'owner', speaker: '纪时卿', time: '10:25', text: '收到' },
                ],
            }],
        }],
    };
    const loaded = loadSession(MODE.PHONE, {
        cache: { chatId: memoryBank.chatId, archiveRevision: memoryBank.archiveRevision, [MODE.PHONE]: legacy },
        chatId: memoryBank.chatId,
        memoryBank,
    });
    assert.equal(loaded.uiVersion, PHONE_SESSION_VERSION);
    assert.equal(loaded.legacyEvidenceUnverifiedCount, 1);
    assert.equal(loaded.apps[0].entries[0].legacyEvidenceUnverified, true);
    assert.equal(loaded.apps[0].entries[0].messages.every(message => message.time === ''), true);
    assert.equal(loaded.apps[0].entries[0].title, '前任爱丽丝');
    const html = renderPhoneEntryDetail(loaded.apps[0].entries[0], loaded.apps[0], loaded);
    assert.match(html, /旧版内容 · 证据未重新核验/);
    assert.match(html, /前任爱丽丝/);
    assert.doesNotMatch(html, /10:24|10:25/);
    assert.throws(
        () => normalizePhoneConversationMessages({ title: '同事聊天', messages: [{ speaker: '同事', text: '你好' }] }, memoryBank, { strict: true }),
        /speakerRole/,
    );
});

test('r49 legacy travel migration is idempotent, readable and never reclassifies free prose as evidence', () => {
    const memoryBank = { chatId: 'travel-chat', archiveRevision: 'travel-rev', memories: [] };
    const locations = Array.from({ length: 4 }, (_, index) => ({
        id: `L${index + 1}`,
        kind: index < 2 ? 'near' : 'far',
        name: `旧地点 ${index + 1}`,
        summary: '旧版模型自由正文：曾在这里秘密结婚。',
        dialogueLines: ['旧版自由对话'],
        keepsake: index >= 2 ? { kind: 'postcard', title: '旧卡片', body: '旧版自由正文' } : null,
    }));
    const legacy = { kind: MODE.TRAVEL, chatId: memoryBank.chatId, archiveRevision: memoryBank.archiveRevision, locations };
    const loaded = loadSession(MODE.TRAVEL, {
        cache: { chatId: memoryBank.chatId, archiveRevision: memoryBank.archiveRevision, [MODE.TRAVEL]: legacy },
        chatId: memoryBank.chatId,
        memoryBank,
    });
    assert.equal(loaded.travelVersion, TRAVEL_SESSION_VERSION);
    assert.equal(loaded.locations.every(item => item.legacyEvidenceUnverified === true && item.contentMode === 'legacy-free-text'), true);
    assert.equal(loaded.locations.filter(item => item.keepsake).every(item => item.keepsake.legacyEvidenceUnverified === true), true);
    assert.match(loaded.locations[0].summary, /秘密结婚/);
    assert.equal(migrateLegacyTravelSession(loaded), loaded);
});

test('r49 room pet authority binds the current char and downgrades invented pet details', () => {
    const spaces = [{ id: 'BEDROOM' }];
    const memoryBank = { characterName: '林砚', memories: [] };
    const pet = [{
        id: 'PET1', spaceId: 'BEDROOM', species: '猫', name: '雪球', basis: '设定',
        description: '小月送给他的白猫。', line: '我记得小月送我的那天。', sourceEvidence: '林砚养着一只猫。',
    }];
    const normalized = normalizeRoomPets(pet, spaces, memoryBank, {
        controlledEvidence: '林砚养着一只猫。', characterEvidence: '林砚养着一只猫。',
    });
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].name, '猫咪');
    assert.equal(normalized[0].description, '猫咪长期生活在这个空间。');
    assert.equal(normalized[0].line, '');

    const thirdParty = normalizeRoomPets([{ ...pet[0], sourceEvidence: '城主养着一只猫。', name: '' }], spaces, memoryBank, {
        controlledEvidence: '城主养着一只猫。', characterEvidence: '城主养着一只猫。',
    });
    assert.deepEqual(thirdParty, []);

    const worldOnlyShorthand = normalizeRoomPets([{ ...pet[0], sourceEvidence: '宠物：猫', name: '' }], spaces, memoryBank, {
        controlledEvidence: '宠物：猫', characterEvidence: '角色没有宠物资料',
    });
    assert.deepEqual(worldOnlyShorthand, []);
    const cardShorthand = normalizeRoomPets([{ ...pet[0], sourceEvidence: '宠物：猫', name: '' }], spaces, memoryBank, {
        controlledEvidence: '宠物：猫', characterEvidence: '宠物：猫',
    });
    assert.equal(cardShorthand.length, 1);
});

test('r49 named proxy model discovery is saved-model-only while generation still uses the official service', async () => {
    let generationCalls = 0;
    const service = {
        getSupportedProfiles() { return []; },
        validateProfile() { return { selected: 'openai', source: 'custom' }; },
        sendRequest(profileId, messages, maxTokens, options, overridePayload) {
            const profile = { model: 'profile-default', 'secret-id': 'secret-reference' };
            const payload = { secret_id: profile['secret-id'], model: profile.model, ...overridePayload };
            generationCalls += 1;
            assert.equal(profileId, 'profile-proxy');
            assert.equal(payload.model, 'saved-model');
            assert.equal(options.includePreset, false);
            return { content: '{"official":true}' };
        },
    };
    const context = {
        extensionSettings: {
            heartbeatMemories: { apiConnectionMode: 'profile', connectionProfileId: 'profile-proxy', modelOverride: 'saved-model' },
            connectionManager: { profiles: [{ id: 'profile-proxy', api: 'custom', mode: 'cc', model: 'saved-model', proxy: 'private-proxy', 'secret-id': 'secret-reference' }] },
        },
        ConnectionManagerRequestService: service,
        getRequestHeaders() { return { 'X-CSRF-Token': 'csrf' }; },
    };
    globalThis.SillyTavern = { getContext: () => context };
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('named proxy discovery must not fetch'); };
    try {
        const modelResult = await fetchModelsForConnection('profile-proxy', { force: true, returnMeta: true });
        assert.deepEqual(modelResult.models, ['saved-model']);
        assert.equal(modelResult.fallbackOnly, true);
        const result = await generateConfiguredJson('Return JSON', { context, contextEnvelope: '', skipTokenCount: true, timeoutMs: 30000 });
        assert.equal(result.official, true);
        assert.equal(generationCalls, 1);
    } finally {
        globalThis.fetch = previousFetch;
    }
});

test('r49 connection errors classify retryability without exposing HTML, credentials or provider bodies', () => {
    const cases = [
        [{ status: 403, message: '<html>Cloudflare blocked sk-private-key</html>' }, 'RMT_RESPONSE_HTML', false],
        [{ status: 429, message: 'quota exceeded sk-private-key' }, 'RMT_CONNECTION_RATE_LIMIT', true],
        [{ status: 503, message: 'private upstream body sk-private-key' }, 'RMT_CONNECTION_SERVER', true],
        [{ status: 504, message: 'request timeout private provider trace' }, 'RMT_CONNECTION_SERVER', true],
    ];
    for (const [raw, code, retryable] of cases) {
        const error = normalizeConnectionManagerError(raw);
        assert.equal(error.code, code);
        assert.equal(error.retryable, retryable);
        assert.doesNotMatch(error.message, /<html|<body|sk-private-key|private upstream body|private provider trace/i);
    }
    const aborted = normalizeConnectionManagerError(new DOMException('secret abort reason', 'AbortError'));
    assert.equal(aborted.name, 'AbortError');
    assert.equal(safeErrorSummary(aborted), '操作已取消。');
    const invalid = normalizeConnectionManagerError(new SyntaxError('Unexpected token < in JSON at position 0: private body'));
    assert.doesNotMatch(invalid.message, /private body|Unexpected token/);
});

test('r49 manual API transport sanitizes the real 401/403 HTML/429/5xx/invalid JSON and abort paths', async () => {
    const secret = 'sk-r49-never-display';
    const prompt = 'PRIVATE_PROMPT_SENTINEL';
    const settings = { manualApiBaseUrl: 'https://manual.example/v1', manualApiKey: secret, manualApiModel: 'model-r49' };
    const context = { getRequestHeaders: () => ({ 'X-CSRF-Token': 'csrf' }) };
    const invoke = fetchImpl => requestManualApiCompletion(settings, context, [{ role: 'user', content: prompt }], 2000, { fetchImpl });
    for (const [status, body, contentType] of [
        [401, JSON.stringify({ error: { message: `bad ${secret} ${prompt}` } }), 'application/json'],
        [403, `<html><body>${secret} ${prompt}</body></html>`, 'text/html'],
        [429, JSON.stringify({ error: { message: `quota ${secret}` } }), 'application/json'],
        [503, `private upstream ${prompt}`, 'text/plain'],
    ]) {
        await assert.rejects(
            invoke(async () => new Response(body, { status, headers: { 'content-type': contentType } })),
            error => error?.code === 'RMT_MANUAL_HTTP'
                && error?.status === status
                && !new RegExp(`${secret}|${prompt}|<html|private upstream`, 'i').test(error.message),
        );
    }
    await assert.rejects(
        invoke(async () => new Response(`<html><body>${secret}</body></html>`, { status: 200, headers: { 'content-type': 'text/html' } })),
        error => error?.code === 'RMT_RESPONSE_HTML' && !error.message.includes(secret),
    );
    await assert.rejects(
        invoke(async () => new Response(`not-json ${secret} ${prompt}`, { status: 200, headers: { 'content-type': 'application/json' } })),
        error => error?.code === 'RMT_MANUAL_INVALID_JSON' && !error.message.includes(secret) && !error.message.includes(prompt),
    );
    const controller = new AbortController();
    controller.abort(new DOMException('private abort reason', 'AbortError'));
    await assert.rejects(
        requestManualApiCompletion(settings, context, [{ role: 'user', content: prompt }], 2000, {
            signal: controller.signal,
            fetchImpl: async (_url, options) => { throw options.signal.reason; },
        }),
        error => error?.name === 'AbortError' && safeErrorSummary(error) === '操作已取消。',
    );
});
