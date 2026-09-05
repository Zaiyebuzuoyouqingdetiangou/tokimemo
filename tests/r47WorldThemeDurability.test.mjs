import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { safeErrorSummary } from '../src/core/text.js';
import { CACHE_KEY, MEMORY_KEY, DEFAULT_THEME_PALETTE } from '../src/core/constants.js';
import { normalizeThemeCustom, resolveThemePalette, contrastRatio, applyThemeToElement } from '../src/core/theme.js';
import { normalizeRoomVisualProfile } from '../src/modes/room.js';
import { normalizeTravel } from '../src/modes/travel.js';
import { archiveProfilePrompt, normalizeArchiveProfile } from '../src/archive/repository.js';
import { archiveBackupEntryForContext, ensureCurrentArchiveBackup, getCache } from '../src/core/cache.js';
import { seedArchiveBackup, setArchiveBackupBackendForTests } from '../src/archive/backupStore.js';
import { state as runtimeState } from '../src/core/state.js';

const memoryBank = {
    archiveName: '测试档案',
    archiveRevision: 'rev-r47',
    characterName: '方祁洛',
    userName: '用户',
    memories: [
        { id: 'M001', date: '未标注', title: '旧庭院', summary: '两个人曾在旧庭院里说过话。', anchors: ['旧庭院'] },
    ],
};

const SETTING_EVIDENCE = '方祁洛日常会经过旧庭院和书坊，也会前往北岭与南渡；这些地点位于城内和远方。';
const presentActs = () => [
    { time: 'today', wish: 'peace', gesture: 'walk', tone: 'quiet', register: 'classical', image: 'path', intensity: 'low', cadence: 'fragments' },
    { time: 'now', emotion: 'grateful', wish: 'joy', tone: 'warm', register: 'classical', image: 'light', intensity: 'medium', cadence: 'single' },
    { time: 'tonight', wish: 'good-dreams', gesture: 'listen', tone: 'quiet', register: 'classical', image: 'stars', intensity: 'low', cadence: 'stacked' },
];

function travelFixture(kind = 'scroll') {
    const far = (id, name) => ({
        id, kind: 'far', name, region: '远方', distanceLabel: '数日路程', basis: '设定',
        distanceToken: 'journey', sourceSettingEvidence: SETTING_EVIDENCE,
        summary: `${name}是角色设定中合理会抵达的远方。`,
        keepsake: {
            kind, title: `${name}留痕`, mark: '远行', greeting: '展信安：',
            body: '风从路的另一端吹过来，我把沿途真正值得记住的细节写在这里。'.repeat(5),
            closing: '待归', emblem: '记', tone: 'paper', presentExpressions: presentActs(),
        },
    });
    return {
        title: '他的出行路线', mapTheme: 'historic', routeSummary: '沿着生活与设定留下的路线。',
        locations: [
            { id: 'N1', kind: 'near', name: '旧庭院', region: '城内', distanceToken: 'walk', basis: '设定', sourceSettingEvidence: SETTING_EVIDENCE, summary: '日常会经过。', dialogueActs: presentActs(), dialogueLines: ['今日风小。', '这里还和从前一样。', '再走一会儿。'] },
            { id: 'N2', kind: 'near', name: '书坊', region: '城内', distanceToken: 'local', basis: '设定', sourceSettingEvidence: SETTING_EVIDENCE, summary: '偶尔停留。', dialogueActs: presentActs(), dialogueLines: ['新到了一卷书。', '我替你留着。', '慢慢看。'] },
            far('F1', '北岭'), far('F2', '南渡'),
        ],
    };
}

test('r47 error sanitizer hides provider HTML/body and credential-shaped text', () => {
    const html = new Error('Failed to generate chat completion: Unauthorized: <!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head><body>Sorry, you have been blocked. You are unable to access youzi.today</body></html>');
    html.status = 403;
    const summary = safeErrorSummary(html);
    assert.match(summary, /上游服务拒绝了请求/);
    assert.match(summary, /HTTP 403/);
    assert.match(summary, /Cloudflare/);
    assert.match(summary, /响应正文已隐藏/);
    assert.doesNotMatch(summary, /DOCTYPE|<html|youzi\.today|Sorry, you have been blocked/i);

    const plainBody = safeErrorSummary(new Error('Failed to generate chat completion: upstream private response text that must not be shown'));
    assert.match(plainBody, /响应正文已隐藏/);
    assert.doesNotMatch(plainBody, /upstream private response text/);

    const secret = safeErrorSummary(new Error('Authorization: Bearer abcdefghijklmnopqrstuvwxyz sk-1234567890abcdef ?api_key=secret-value'));
    assert.doesNotMatch(secret, /abcdefghijklmnopqrstuvwxyz|sk-1234567890abcdef|secret-value/);
    assert.match(secret, /hidden/i);

    const privateSentinels = [
        'PROMPT_PRIVATE_74f2',
        'CHAT_PRIVATE_91cd',
        'PERSONA_PRIVATE_6e10',
        'WORLDBOOK_PRIVATE_5ac8',
        'ARCHIVE_PRIVATE_2b37',
    ];
    for (const sentinel of privateSentinels) {
        const rawError = new Error(`provider rejected request; copied context=${sentinel}`);
        const visible = safeErrorSummary(rawError);
        assert.doesNotMatch(visible, new RegExp(sentinel), `${sentinel} leaked into a user-visible error`);
        assert.match(visible, /敏感详情已隐藏|hidden/);
    }
});

test('r47 default/custom theme uses semantic palette and contrast guard', () => {
    const def = resolveThemePalette({ themeMode: 'default' });
    assert.equal(def.mode, 'default');
    assert.deepEqual(def.palette, DEFAULT_THEME_PALETTE);
    assert.ok(contrastRatio(def.palette.text, def.palette.surface) >= 4.5);

    const normalized = normalizeThemeCustom({ background: 'javascript:red', surface: '#ffffff', text: '#ffffff', accent: '#AABBCC' });
    assert.equal(normalized.background, DEFAULT_THEME_PALETTE.background);
    assert.equal(normalized.accent, '#aabbcc');
    const guarded = resolveThemePalette({ themeMode: 'custom', themeCustom: normalized });
    assert.ok(contrastRatio(guarded.palette.text, guarded.palette.surface) >= 4.5);
    assert.notEqual(guarded.palette.text, '#ffffff');

    const styleValues = new Map();
    const element = {
        dataset: {},
        style: { setProperty(name, value) { styleValues.set(name, value); } },
    };
    const translucent = applyThemeToElement(element, {
        themeMode: 'custom',
        themeAlpha: 0.1,
        themeCustom: { background: '#101820', surface: '#ffffff', text: '#ffffff', muted: '#eeeeee' },
    });
    assert.equal(translucent.alpha, 0.72);
    assert.equal(styleValues.get('--rmt-theme-surface-alpha'), 'rgba(255, 255, 255, 0.72)');
    assert.match(styleValues.get('--rmt-theme-surface'), /^#[0-9a-f]{6}$/);
    assert.ok(contrastRatio(translucent.palette.text, '#bcc1c6') >= 4.5, 'text must remain readable over the alpha-composited card');

    const opaque = applyThemeToElement(element, { themeMode: 'default', themeAlpha: 1.5 });
    assert.equal(opaque.alpha, 1);
    assert.equal(styleValues.get('--rmt-theme-surface-alpha'), 'rgba(255, 255, 255, 1)');
    const fallbackAlpha = applyThemeToElement(element, { themeMode: 'default', themeAlpha: Number.NaN });
    assert.equal(fallbackAlpha.alpha, 0.96);
});

test('r47 room persona fallback does not infer headwear while explicit evidence can keep it', () => {
    const inferred = normalizeRoomVisualProfile({ figure: { hairShape: 'covered', detail: 'headwear' } }, { identitySeed: '古代王朝 宫殿', bindPersona: true });
    assert.notEqual(inferred.figure.hairShape, 'covered');
    assert.notEqual(inferred.figure.detail, 'headwear');

    const explicit = normalizeRoomVisualProfile({
        explicitFields: ['figure.hairShape', 'figure.detail'],
        figure: { hairShape: 'covered', detail: 'headwear' },
    }, { identitySeed: '角色设定明确佩戴兜帽', bindPersona: true });
    assert.equal(explicit.figure.hairShape, 'covered');
    assert.equal(explicit.figure.detail, 'headwear');
});

test('r47 far travel supports world-aware keepsakes while legacy postcards stay compatible', () => {
    const scroll = normalizeTravel(travelFixture('scroll'), memoryBank, { controlledEvidence: SETTING_EVIDENCE });
    const far = scroll.locations.find(item => item.id === 'F1');
    assert.equal(far.keepsake.kind, 'scroll');
    assert.equal(far.postcard, null);

    const legacyFixture = travelFixture('scroll');
    for (const item of legacyFixture.locations.filter(item => item.kind === 'far')) {
        delete item.keepsake;
        item.postcard = {
            title: '旧明信片', postmark: 'OLD', greeting: '你好：',
            body: '这是旧版本已经保存的明信片正文，为了兼容旧档案需要继续正常读取。'.repeat(5),
            closing: '旧签名', stampLabel: '旧', tone: 'paper',
        };
    }
    legacyFixture.travelVersion = 3;
    const legacy = normalizeTravel(legacyFixture, memoryBank, { trustedStored: true });
    const legacyFar = legacy.locations.find(item => item.id === 'F1');
    assert.equal(legacyFar.keepsake.kind, 'postcard');
    assert.equal(legacyFar.postcard.title, '旧明信片');
});

test('r47 archive title prompt asks for concise literary names and rejects overlong generated names', () => {
    const prompt = archiveProfilePrompt({ name1: '用户', name2: '方祁洛' }, memoryBank.memories);
    assert.match(prompt, /4～14 个汉字/);
    assert.match(prompt, /私人回忆册的章节名/);
    assert.match(prompt, /不要把整段剧情压成一句摘要/);
    assert.match(prompt, /宿命、契约、晨光、温柔/);

    const normalized = normalizeArchiveProfile({ archiveName: '这是一个明显过长而且像完整剧情摘要一样的档案标题名称', archiveSummary: '摘要' }, memoryBank.memories);
    assert.ok(normalized.archiveName.length <= 14);
    assert.equal(normalized.archiveName, '旧庭院');
});

test('r47 source wiring keeps durability/error/theme changes behind existing lifecycle boundaries', async () => {
    const client = await readFile(new URL('../src/generation/client.js', import.meta.url), 'utf8');
    const cache = await readFile(new URL('../src/core/cache.js', import.meta.url), 'utf8');
    const repository = await readFile(new URL('../src/archive/repository.js', import.meta.url), 'utf8');
    const settingsPanel = await readFile(new URL('../src/ui/settingsPanel.js', import.meta.url), 'utf8');
    const phone = await readFile(new URL('../src/modes/phone.js', import.meta.url), 'utf8');
    const phoneView = await readFile(new URL('../src/ui/phoneView.js', import.meta.url), 'utf8');
    const travel = await readFile(new URL('../src/modes/travel.js', import.meta.url), 'utf8');
    const library = await readFile(new URL('../src/archive/library.js', import.meta.url), 'utf8');
    const themeSource = await readFile(new URL('../src/core/theme.js', import.meta.url), 'utf8');
    assert.doesNotMatch(themeSource, /SmartTheme|third[- ]party|querySelector\(/i);

    assert.match(client, /safeErrorSummary\(error\)/);
    assert.match(client, /commitSession\(mode, session, expectedChatId, origin\)/);
    assert.match(client, /commitArchiveTarget\(latestTarget, mode, session, stillCurrent, origin\)/);
    assert.match(cache, /export async function flushSessionCacheNow/);
    assert.match(cache, /deferredCommitOriginMatchesContext/);
    assert.match(cache, /expectedTaskOrigin\?\.archiveRevision/);
    assert.match(repository, /await core_cache\.commitSession\(mode, session, item\.origin\.chatId, item\.origin\)/);

    assert.match(settingsPanel, /themeMode/);
    assert.match(settingsPanel, /恢复默认/);
    assert.match(settingsPanel, /远程模型列表暂不可用，已保留手动 API 自己保存的模型/);

    assert.match(phone, /folio/);
    assert.match(phone, /relic/);
    assert.match(phoneView, /function phoneEntryKindMarkup/);
    assert.match(phoneView, /rmt-phone-entry-\$\{kind\}/);
    assert.match(phoneView, /kind === 'chat'/);
    assert.match(phoneView, /\['gallery', 'camera'\]\.includes\(kind\)/);
    assert.match(travel, /keepsake/);
    assert.match(travel, /古代或低科技世界优先考虑 letter\/journal\/scroll\/fieldnote/);

    assert.doesNotMatch(library, /关闭只读只会改变心跳回忆里的按钮显示，不会自动切换角色\/聊天、刷新宿主界面或删除档案/);
    assert.doesNotMatch(library, /这个设置只改变心跳回忆档案室里的分类/);
});


test('r47 full-runtime backup reconciliation restores a newer same-revision derived cache', async () => {
    const originalSillyTavern = globalThis.SillyTavern;
    const records = new Map();
    const backend = {
        async read(entry) { return structuredClone(records.get(entry.entryId) || null); },
        async put(record) { records.set(record.entryId, structuredClone(record)); return true; },
        async delete() { return true; },
    };
    const bank = {
        version: 3, chatId: 'tt-recover-chat', archiveRevision: 'same-revision', characterName: '方祁洛', userName: '用户',
        archiveName: '旧庭院', createdAt: 1, updatedAt: 10,
        memories: [{ id: 'M001', title: '旧庭院', summary: '共同记忆', anchors: ['旧庭院'] }],
    };
    const oldCache = { chatId: bank.chatId, archiveRevision: bank.archiveRevision, updatedAt: 100, album: { kind: 'album', title: '旧相簿' } };
    const newerCache = { chatId: bank.chatId, archiveRevision: bank.archiveRevision, updatedAt: 200, album: { kind: 'album', title: '旧相簿' }, travel: { kind: 'travel', title: '刚生成的路线' } };
    const context = {
        characterId: 0, groupId: null, chatId: bank.chatId, name1: '用户', name2: '方祁洛',
        characters: [{ name: '方祁洛', avatar: 'fang.png', data: { name: '方祁洛', avatar: 'fang.png' } }],
        chat: [], chatMetadata: { [MEMORY_KEY]: bank, [CACHE_KEY]: oldCache }, extensionSettings: {},
        getCurrentChatId() { return this.chatId; }, saveMetadataDebounced() { this.metadataSaves = (this.metadataSaves || 0) + 1; }, saveSettingsDebounced() {},
    };
    globalThis.SillyTavern = { getContext: () => context };
    setArchiveBackupBackendForTests(backend);
    runtimeState.runtimeSessionCache.clear();
    try {
        await seedArchiveBackup(archiveBackupEntryForContext(context, bank), bank, newerCache);
        assert.equal(await ensureCurrentArchiveBackup(context), true);
        assert.equal(getCache(context).travel.title, '刚生成的路线');
        assert.equal(context.chatMetadata[CACHE_KEY].travel.title, '刚生成的路线');
        assert.ok(context.metadataSaves >= 1);
    } finally {
        runtimeState.runtimeSessionCache.clear();
        setArchiveBackupBackendForTests(null);
        globalThis.SillyTavern = originalSillyTavern;
    }
});
