import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    albumCommentsPrompt,
    albumRelationshipArchiveSlice,
    albumRelationshipScanPrompt,
    mergeAlbumIncremental,
    normalizeAlbum,
    normalizeAlbumCommentsBatch,
    normalizeAlbumRelationshipSnapshot,
} from '../src/modes/album.js';
import {
    characterProfilePrompt,
    mergeRelationLayers,
    normalizeCharacterProfile,
    normalizeRelations,
    relationGardenHtml,
    relationsPrompt,
    relationsViewIdentity,
} from '../src/modes/relations.js';
import { ARCHIVE_INDEX_SETTINGS_KEY, ARCHIVE_CHARACTER_PROFILES_SETTINGS_KEY } from '../src/core/constants.js';

const context = { name1: '小月', name2: '佐伯' };
const memoryBank = {
    archiveName: '小月与佐伯',
    archiveSummary: '从试探走到相互确认的当前关系。',
    archiveKeywords: ['关系', '信赖'],
    memories: [
        { id: 'M001', date: '08/01', title: '站台的雨', summary: '他们在伞下开始相互信任。', anchors: ['站台雨伞'], participants: ['小月', '佐伯'] },
        { id: 'M002', date: '08/20', title: '海边约定', summary: '两人明确了对彼此的心意，同意开始交往。', anchors: ['海边约定'], participants: ['小月', '佐伯'] },
        { id: 'M003', date: '08/25', title: '与志波见面', summary: '志波看见佐伯与小月相处，并表示信任佐伯。', anchors: ['志波说他信任佐伯'], participants: ['志波', '佐伯', '小月'] },
    ],
};

const relationshipSnapshotRaw = {
    charState: '已经明确爱意，愿意稳定陪伴小月。',
    userState: '已经给出明确的积极回应。',
    relationshipState: '稳定交往中',
    relationshipSummary: '海边约定后，双方已经确认关系。',
    relationshipSourceMemoryIds: ['M002'],
    relationshipSourceMemoryAnchor: '海边约定',
};

function albumEntry(overrides = {}) {
    return {
        id: 'CG01',
        title: '海边的约定',
        date: '08/20',
        desc: '夕阳下的海边，两人並肩站着。',
        category: '约会',
        unlocked: true,
        sourceMemoryIds: ['M002'],
        sourceMemoryAnchor: '海边约定',
        visualSeed: ['海', '夕阳', '并肩', '风'],
        imagePrompt: 'sunset beach, two people standing side by side',
        comments: ['一', '二', '三', '四', '五', '六'],
        hintLines: [],
        relationshipSnapshot: relationshipSnapshotRaw,
        ...overrides,
    };
}

test('album relationship scan covers every archive record and validates both-side state against real evidence', () => {
    const largeBank = {
        ...memoryBank,
        memories: Array.from({ length: 90 }, (_, index) => ({
            id: `M${String(index + 1).padStart(3, '0')}`,
            date: `08/${String((index % 28) + 1).padStart(2, '0')}`,
            title: `节点${index + 1}`,
            summary: `第${index + 1}个关系节点。`,
            anchors: [`锚点${index + 1}`],
        })),
    };
    const slice = JSON.parse(albumRelationshipArchiveSlice(largeBank));
    assert.equal(slice.memories.length, 90);
    assert.deepEqual(slice.memoryColumns, ['id', 'evidenceAnchor']);
    assert.equal(slice.memories[0][0], 'M001');
    assert.equal(slice.memories.at(-1)[0], 'M090');

    const normalized = normalizeAlbumRelationshipSnapshot(relationshipSnapshotRaw, memoryBank);
    assert.equal(normalized.charState, relationshipSnapshotRaw.charState);
    assert.equal(normalized.userState, relationshipSnapshotRaw.userState);
    assert.equal(normalized.relationshipState, '稳定交往中');
    assert.deepEqual(normalized.relationshipSourceMemoryIds, ['M002']);
    assert.throws(
        () => normalizeAlbumRelationshipSnapshot({ ...relationshipSnapshotRaw, relationshipSourceMemoryIds: ['M999'] }, memoryBank),
        /真实档案锚点/,
    );
    assert.throws(
        () => normalizeAlbumRelationshipSnapshot({ ...relationshipSnapshotRaw, relationshipSourceMemoryAnchor: '不存在的锚点' }, memoryBank),
        /真实档案锚点/,
    );
});

test('album comments are conditioned on the normalized scan, require 6-8 segments, and persist the safe snapshot', () => {
    const snapshot = normalizeAlbumRelationshipSnapshot(relationshipSnapshotRaw, memoryBank);
    const prompt = albumCommentsPrompt(context, memoryBank, [albumEntry()], snapshot);
    assert.match(prompt, /CURRENT_RELATIONSHIP_SCAN_JSON/);
    assert.match(prompt, /稳定交往中/);
    assert.match(prompt, /6～8 段/);
    assert.match(prompt, /不得越过当前关系阶段/);

    assert.throws(
        () => normalizeAlbumCommentsBatch({ items: [{ id: 'CG01', comments: ['1', '2', '3', '4', '5'] }] }, [albumEntry()]),
        /不足 6 段/,
    );
    const comments = normalizeAlbumCommentsBatch({ items: [{ id: 'CG01', comments: ['1', '2', '3', '4', '5', '6', '7', '8', '9'] }] }, [albumEntry()]);
    assert.equal(comments.get('CG01').length, 8);

    const session = normalizeAlbum({ title: '回忆相簿', entries: [albumEntry()] }, memoryBank);
    assert.deepEqual(session.entries[0].relationshipSnapshot, snapshot);
});

test('album orchestration is index then relationship scan then comments, while incremental merge leaves old entries untouched', async () => {
    const source = await readFile(new URL('../src/modes/album.js', import.meta.url), 'utf8');
    const body = source.match(/export async function generateAlbumWithRepair[\s\S]*?\n}\n\nexport function normalizeAlbum/)?.[0] || '';
    const indexAt = body.indexOf('albumIndexPrompt(');
    const scanAt = body.indexOf('albumRelationshipScanPrompt(');
    const commentsAt = body.indexOf('albumCommentsPrompt(');
    assert.ok(indexAt >= 0 && scanAt > indexAt && commentsAt > scanAt, 'album generation order must be index -> scan -> comments');

    const oldEntry = albumEntry({
        id: 'CG_OLD',
        title: '旧雨夜',
        sourceMemoryIds: ['M001'],
        sourceMemoryAnchor: '站台雨伞',
        relationshipSnapshot: { ...relationshipSnapshotRaw, relationshipState: '相互试探', relationshipSourceMemoryIds: ['M001'], relationshipSourceMemoryAnchor: '站台雨伞' },
    });
    const previous = { kind: 'album', title: '旧相簿', entries: [oldEntry], selectedId: 'CG_OLD', dialogueIndex: 3 };
    const fresh = { kind: 'album', title: '新相簿', entries: [albumEntry({ id: 'CG_NEW' })] };
    const before = structuredClone(previous.entries[0]);
    const merged = mergeAlbumIncremental(previous, fresh, memoryBank);
    assert.deepEqual(merged.entries[0], before);
    assert.equal(merged.entries[1].relationshipSnapshot.relationshipState, '稳定交往中');
    assert.equal(merged.selectedId, 'CG_OLD');
    assert.equal(merged.dialogueIndex, 3);
});

test('base and dynamic non-user relations keep bounded NPC perspective, dynamic wins, and user nodes do not synthesize it', () => {
    const sources = {
        characterData: { name: '佐伯', avatar: 'saeki.png', description: '佐伯是学生。' },
        userData: { name: '小月', personaDescription: '小月和佐伯是青梅竹马。' },
        worldInfo: '志波是佐伯在学校最信任的朋友。',
    };
    const profile = normalizeCharacterProfile({
        title: 'CHARACTER PROFILE',
        introduction: '',
        facts: [],
        relationships: [
            { id: 'B1', name: '志波', relation: '挚友', category: 'friend', state: '友好', sentiments: ['信赖'], summary: '学校里的老朋友。', isUser: false, npcPerspective: '在我看来，他一直是可以交付后背的朋友。', sourceType: 'world_info', sourceEvidence: '志波是佐伯在学校最信任的朋友' },
            { id: 'BU', name: '小月', relation: '青梅竹马', category: 'close', state: '亲密', sentiments: [], summary: '从小认识。', isUser: true, npcPerspective: '不应保留', sourceType: 'user_persona', sourceEvidence: '小月和佐伯是青梅竹马' },
        ],
    }, sources, 'group:test', '佐伯', 'saeki.png');
    assert.match(profile.relationships.find(item => item.name === '志波').npcPerspective, /交付后背/);
    assert.equal(profile.relationships.find(item => item.isUser).npcPerspective, '');

    const dynamic = normalizeRelations({
        title: '本世界线人际关系', summary: '关系变化。', discoveries: [],
        relationships: [
            { id: 'D1', name: '志波', relation: '相互信任的朋友', category: 'friend', state: '友好', sentiments: ['放心'], summary: '志波在见面后明确表示信任佐伯。', isUser: false, npcPerspective: '现在我更确定，他值得我信赖。<script>alert(1)</script>', sourceMemoryIds: ['M003'], sourceMemoryAnchor: '志波说他信任佐伯' },
            { id: 'DU', name: '小月', relation: '恋人', category: 'special', state: '恋爱', sentiments: [], summary: '已确认关系。', isUser: true, npcPerspective: '不应保留', sourceMemoryIds: ['M002'], sourceMemoryAnchor: '海边约定' },
        ],
    }, memoryBank, context);
    assert.equal(dynamic.relationships.find(item => item.isUser).npcPerspective, '');

    const merged = mergeRelationLayers(profile.relationships, dynamic.relationships);
    const shiba = merged.find(item => item.name === '志波');
    assert.match(shiba.dynamic.npcPerspective, /更确定/);
    const html = relationGardenHtml({ characterName: '佐伯', sharedRelations: profile.relationships, dynamicRelations: dynamic.relationships, selectedKey: '志波' });
    assert.match(html, /NPC视角/);
    assert.match(html, /现在我更确定/);
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;/);
});

test('NPC perspective prompts state the evidence boundary and legacy nodes show an explicit refresh hint', () => {
    const sources = {
        characterData: { name: '佐伯' },
        userData: { name: '小月', personaDescription: '' },
        worldInfo: '志波是佐伯的朋友。',
    };
    assert.match(characterProfilePrompt(sources), /npcPerspective/);
    assert.match(characterProfilePrompt(sources), /非正史/);
    assert.match(relationsPrompt(context, memoryBank), /npcPerspective/);
    assert.match(relationsPrompt(context, memoryBank), /不能冒充已证实的秘密/);

    const html = relationGardenHtml({
        characterName: '佐伯',
        sharedRelations: [{ id: 'LEGACY', name: '志波', relation: '朋友', category: 'friend', state: '友好', isUser: false }],
        dynamicRelations: [],
        selectedKey: '志波',
    });
    assert.match(html, /NPC视角/);
    assert.match(html, /刷新本世界线关系或重新读取固定设定后可查看/);
});

test('relationship scan prompt is a dedicated full-archive stage rather than an incremental or CG-local prompt', () => {
    const prompt = albumRelationshipScanPrompt(context, memoryBank);
    assert.match(prompt, /ALBUM_RELATIONSHIP_FULL_ARCHIVE_JSON/);
    assert.match(prompt, /charState/);
    assert.match(prompt, /userState/);
    assert.match(prompt, /relationshipState/);
    assert.doesNotMatch(prompt, /UNTRUSTED_INCREMENTAL_CG_ARCHIVE_JSON/);
});

test('fresh NPC generations require perspective while archive identity follows the current classification', () => {
    const sources = { characterData: { name: '佐伯' }, userData: { name: '小月' }, worldInfo: '志波是佐伯的朋友。' };
    assert.throws(() => normalizeCharacterProfile({ facts: [], relationships: [{
        name: '志波', relation: '朋友', isUser: false, sourceType: 'world_info', sourceEvidence: '志波是佐伯的朋友',
    }] }, sources, 'group:test', '佐伯'), /npcPerspective/);
    assert.throws(() => normalizeRelations({ discoveries: [], relationships: [{
        name: '志波', relation: '朋友', summary: '志波说他信任佐伯。', isUser: false, sourceMemoryIds: ['M003'], sourceMemoryAnchor: '志波说他信任佐伯',
    }] }, memoryBank, context), /npcPerspective/);

    const viewContext = {
        name2: '当前聊天的人',
        extensionSettings: {
            [ARCHIVE_INDEX_SETTINGS_KEY]: [{ entryId: 'E1', characterKey: 'saeki.png', characterName: '佐伯', chatId: 'old-chat', archiveGroupId: 'manual:new' }],
            [ARCHIVE_CHARACTER_PROFILES_SETTINGS_KEY]: [
                { key: 'group:manual:old', characterName: '旧错分组', relationships: [] },
                { key: 'group:manual:new', characterName: '佐伯', avatar: 'saeki.png', relationships: [] },
            ],
        },
    };
    const identity = relationsViewIdentity({ profileKey: 'group:manual:old' }, { entryId: 'E1', archiveGroupId: 'manual:old', characterName: '佐伯' }, viewContext);
    assert.equal(identity.profileKey, 'group:manual:new');
    assert.equal(identity.characterName, '佐伯');
    const unknownLegacy = relationsViewIdentity({ profileKey: 'group:manual:old' }, { characterName: '孤立旧档案' }, viewContext);
    assert.equal(unknownLegacy.profile, null);
    assert.equal(unknownLegacy.characterName, '孤立旧档案');
});

test('archived shared memories use the saved character and a stale NPC selection still highlights its visible fallback', async () => {
    const source = await readFile(new URL('../src/ui/albumView.js', import.meta.url), 'utf8');
    assert.match(source, /activeArchiveSnapshot\?\.characterName/);
    const html = relationGardenHtml({ characterName: '佐伯', selectedKey: '其他档案的NPC', sharedRelations: [{ name: '志波', relation: '朋友', isUser: false, npcPerspective: '我信任他。' }] });
    assert.match(html, /rmt-relation-node[^\"]*selected/);
});
