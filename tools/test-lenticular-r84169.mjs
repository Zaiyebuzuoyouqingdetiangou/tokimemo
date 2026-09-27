import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { preparationFixture } from './preparation-harness-r8481.mjs';
import { harness } from './runtime-harness.mjs';

export function cardFixture() {
    return { kind: 'pastLives', version: 1, title: '前世今生', presentation: 'neutral', chatId: 'preparation-check', archiveRevision: 'rev1', characterName: '岚', userName: '阿宁',
        episodes: [{ id: 'PL01', title: '灯下', fiction: true, presentation: 'neutral', opening: { title: '信', motif: '旧信', text: '灯下展开旧信。', sourceMemoryIds: ['M001'], sourceMemoryAnchor: '一起读书' },
            dossiers: [{ id: 'D01', title: '前世', synopsis: '灯下研墨。', clues: [] }], annotations: [], echoes: [{ id: 'E01', title: '回响', text: '一起读书', kind: 'memory', sourceMemoryIds: ['M023'], sourceMemoryAnchor: '一起读书' }], closing: { text: '回到此刻' } }],
        selectedId: 'PL01', selectedEntryId: 'D01', view: 'dossier' };
}

test('前世卷宗提供横版光栅卡与本地选图入口', async () => {
    const f = await preparationFixture();
    const targets = await f.api('core/cgTargets.js');
    const copy = value => vm.runInContext(`JSON.parse(${JSON.stringify(JSON.stringify(value))})`, f.sandbox);
    f.sandbox.structuredClone = copy;
    const session = copy(cardFixture());
    targets.cgTargetInSession('pastLives', session, 'rmtcg2:past-life-dossier:PL01:dossier%3AD01').cgImage = copy({ url: '/user/images/past.png', generatedAt: 1 });
    const html = (await f.api('ui/pastLivesView.js')).pastLivesHtml(session);
    assert.match(html, /data-rmt-lenticular/);
    assert.match(html, /挑一张今生/);
    assert.equal(f.providerCalls, 0);
});

const itemId = 'rmtcg2:past-life-dossier:PL01:dossier%3AD01';
const descriptor = { version: 1, kind: 'past-life-dossier', containerId: 'PL01', slot: 'dossier:D01' };
const photo = (name, generatedAt = 1) => ({ url: '/user/images/' + name + '.png', generatedAt });
async function fixture() {
    const f = await preparationFixture();
    f.copy = value => vm.runInContext(`JSON.parse(${JSON.stringify(JSON.stringify(value))})`, f.sandbox);
    f.sandbox.structuredClone = f.copy;
    f.cards = await f.api('core/lenticularCards.js'); f.targets = await f.api('core/cgTargets.js');
    f.session = f.copy(cardFixture());
    f.source = f.copy({ kind: 'album', chatId: f.session.chatId, archiveRevision: 'rev1', entries: [
        { id: 'AL01', title: '雨夜', desc: '窗边', sourceMemoryIds: ['M999'], cgImage: photo('unrelated', 20) },
        { id: 'AL02', title: '书页', desc: '灯下看书', sourceMemoryIds: ['M023'], cgImage: photo('related', 1) },
    ] });
    f.cache = f.copy({ album: f.source });
    f.ref = f.cards.cardImageCatalog(f.cache, f.session, ['M023'])[0].reference;
    f.hash = f.targets.cgTargetInSession('pastLives', f.session, itemId).sourceHash;
    f.pair = () => f.cards.applyPastLivesCardPair(f.session, itemId, f.hash, 'null', f.ref);
    return f;
}

test('精确同记忆推荐，不使用未来回响、相似编号或其他聊天', async () => {
    const f = await fixture();
    f.session.episodes[0].echoes.push(f.copy({ kind: 'possibility', sourceMemoryIds: ['M999'] }));
    assert.deepEqual(Array.from(f.cards.cardEchoMemoryIds(f.session, 'PL01')), ['M023']);
    f.cache.adv = f.copy({ kind: 'adv', chatId: 'elsewhere', archiveRevision: 'rev1', events: [{ id: 'E1', cgImage: photo('foreign'), sourceMemoryIds: ['M023'] }] });
    f.cache.album.entries.push(f.copy({ id: 'AL03', title: '编号近似', desc: 'M023', sourceMemoryIds: ['M0230'], cgImage: photo('near', 100) }));
    const entries = f.cards.cardImageCatalog(f.cache, f.session, f.cards.cardEchoMemoryIds(f.session, 'PL01'));
    assert.equal(entries.length, 3); assert.equal(entries[0].title, '书页');
    assert.equal(entries[1].sharedMemoryIds.length, 0);
    assert.equal(f.providerCalls, 0);
});

test('引用随原条目重画更新，删除、改写、换聊天和换修订不串图', async () => {
    const f = await fixture();
    const paired = f.pair();
    const ref = f.cards.pastLivesCardPair(paired, itemId).reference;
    assert.doesNotMatch(JSON.stringify(paired.lenticularCardsV1), /url|prompt|data:|\/user\/images/);
    f.cache.album.entries[1].cgImage = f.copy(photo('redrawn'));
    assert.equal(f.cards.resolveCardReference(f.cache, paired, ref).image.url, '/user/images/redrawn.png');
    assert.equal(f.cards.resolveCardReference(f.cache, { ...paired, chatId: 'other' }, ref), null);
    f.cache.album.entries[1].desc = '另一个场景';
    assert.equal(f.cards.resolveCardReference(f.cache, paired, ref), null);
    f.cache.album.entries[1].desc = '灯下看书'; f.cache.album.archiveRevision = 'rev2';
    assert.equal(f.cards.resolveCardReference(f.cache, paired, ref), null);
    f.cache.album.archiveRevision = 'rev1'; f.cache.album.entries.splice(1, 1);
    assert.equal(f.cards.resolveCardReference(f.cache, paired, ref), null);
});

test('冲突保存不覆盖新配对；续生成保留引用，改写前世后不继承旧配对', async () => {
    const f = await fixture(), paired = f.pair();
    assert.equal(f.cards.applyPastLivesCardPair(paired, itemId, f.hash, 'null', null), null);
    const progress = await f.api('core/cacheGenerationDrafts.js');
    const next = progress.preserveProgressLocalState(f.copy(f.session), paired);
    assert.equal(f.cards.cardPairSignature(next, itemId), f.cards.cardPairSignature(paired, itemId));
    next.episodes[0].dossiers[0].synopsis = '更换了故事';
    assert.equal(progress.preserveProgressLocalState(next, paired).lenticularCardsV1.length, 0);
    const removed = f.cards.applyPastLivesCardPair(paired, itemId, f.hash, f.cards.cardPairSignature(paired, itemId), null);
    assert.equal(f.cards.pastLivesCardPair(removed, itemId), null);
    assert.equal(removed.lenticularCardsV1[0].reference, null, '撤销记录阻止旧快照复活配对');
    assert.equal(f.cache.album.entries.length, 2, '移除配对不删原图');
});

test('跨模块目录含已有章节、互动、ADV与推演，保留来源标签', async () => {
    const f = await fixture();
    f.cache.adv = f.copy({ kind: 'adv', chatId: f.session.chatId, archiveRevision: 'rev1', events: [{ id: 'ADV1', title: 'ADV', sourceMemoryIds: ['M023'], cgImage: photo('adv') }] });
    f.cache.bedtime = f.copy({ kind: 'bedtime', chatId: f.session.chatId, archiveRevision: 'rev1', stories: [{ id: 'BED_night', title: '睡前', chapters: [{ id: 'BED_night-C01', title: '灯', text: '窗前的灯' }] }] });
    f.cache.heart = f.copy({ kind: 'heart', chatId: f.session.chatId, archiveRevision: 'rev1', dailyStrips: [{ id: 'S1', title: '漫画', cgImage: photo('comic') }], voiceDramas: [{ id: 'VOICE1', title: '对白', script: [{ speaker: 'char', text: '晚上好' }] }] });
    f.cache.butterfly = f.copy({ kind: 'butterfly', chatId: f.session.chatId, archiveRevision: 'rev1', nodes: [{ id: 'EG1', label: '未来', monologue: '我走到海边。' }] });
    for (const [mode, input, name] of [
        ['bedtime', { version: 1, kind: 'bedtime-chapter', containerId: 'BED_night', slot: 'chapter:BED_night-C01' }, 'bed'],
        ['heart', { version: 1, kind: 'heart-voice', containerId: 'VOICE1', slot: 'voice' }, 'voice'],
        ['butterfly', { version: 1, kind: 'butterfly-node', containerId: 'EG1', slot: 'scene' }, 'butterfly'],
    ]) f.targets.cgTargetInSession(mode, f.cache[mode], f.targets.cgTargetItemId(input)).cgImage = f.copy(photo(name));
    const entries = f.cards.cardImageCatalog(f.cache, f.session);
    assert.equal(entries.length, 7);
    assert.match(entries.find(row => row.reference.mode === 'bedtime').label, /创作/);
    assert.match(entries.find(row => row.reference.mode === 'butterfly').label, /推演/);
    for (const entry of entries) assert.ok(f.cards.resolveCardReference(f.cache, f.session, entry.reference));
});

test('草稿完成后引用转至正式页，删除不从旧草稿复活；历史版本限定原档案', async () => {
    const f = await fixture();
    f.cache = f.copy({ __generationDraftsV2: { records: { draft1: { status: 'open', result: { mode: 'album', sourceMemory: { chatId: f.session.chatId }, session: f.source } } } } });
    const ref = f.cards.cardImageCatalog(f.cache, f.session, ['M023'])[0].reference;
    assert.equal(ref.source, 'draft');
    f.cache.__generationDraftsV2.records.draft1.status = 'complete';
    assert.equal(f.cards.resolveCardReference(f.cache, f.session, ref), null);
    f.cache.album = f.copy(f.source);
    assert.ok(f.cards.resolveCardReference(f.cache, f.session, ref));
    f.cache.album.entries.splice(1, 1);
    assert.equal(f.cards.resolveCardReference(f.cache, f.session, ref), null);
    f.cache = f.copy({ __archiveVersionsV1: [{ version: 1, versionId: 'old', memory: { chatId: f.session.chatId }, cache: { album: f.source } }] });
    const old = f.cards.cardImageCatalog(f.cache, f.session, ['M023'])[0];
    assert.equal(old.reference.source, 'version'); assert.ok(f.cards.resolveCardReference(f.cache, f.session, old.reference));
    f.cache.__archiveVersionsV1[0].memory.chatId = 'other';
    assert.equal(f.cards.cardImageCatalog(f.cache, f.session).length, 0);
    assert.equal(f.cards.resolveCardReference(f.cache, f.session, old.reference), null);
});

test('无第二面保留单图；只读不选图；失效引用提示重选且文本安全转义', async () => {
    const f = await fixture(), view = await f.api('ui/pastLivesCard.js');
    f.targets.cgTargetInSession('pastLives', f.session, itemId).cgImage = f.copy(photo('past'));
    let html = view.pastLivesCardHtml(f.session, descriptor, f.cache, true);
    assert.match(html, /data-card-both="false"/); assert.doesNotMatch(html, /data-card-pick/); assert.match(html, /past\.png/);
    const paired = f.pair();
    html = view.pastLivesCardHtml(paired, descriptor, f.cache);
    assert.match(html, /data-card-both="true"/);
    f.cache.album.entries[1].cgImage.url = 'javascript:alert(1)';
    html = view.pastLivesCardHtml(paired, descriptor, f.cache);
    assert.match(html, /原图已不可用/); assert.doesNotMatch(html, /javascript:/);
    f.session.episodes[0].dossiers[0].title = '<img onerror=boom>';
    html = view.pastLivesCardHtml(f.session, descriptor, f.cache);
    assert.doesNotMatch(html, /<img onerror/);
});

async function durableFixture() {
    const h = await harness({ messages: 12, failAfter: 1000, bundle: true });
    h.module('archive/sourceLedger.js').setMemorySourceLedgerBackendForTests({ read: async () => null, write: async () => true, delete: async () => true });
    assert.equal((await h.repo.importCurrentChatMemory()).status, 'committed');
    h.bank = h.repo.requireArchive(h.host); h.cache = h.module('core/cache.js'); h.contextApi = h.module('core/context.js');
    h.cards = h.module('core/lenticularCards.js'); h.actions = h.module('generation/pastLivesCardActions.js'); h.state = h.module('core/state.js').state;
    const origin = h.contextApi.captureTaskOrigin(h.host, h.bank.archiveRevision);
    h.session = h.copy({ ...cardFixture(), chatId: h.bank.chatId, archiveRevision: h.bank.archiveRevision, characterName: h.bank.characterName, userName: h.bank.userName });
    const album = h.copy({ kind: 'album', chatId: h.bank.chatId, archiveRevision: h.bank.archiveRevision, entries: [{ id: 'AL1', title: '灯下', desc: '读书', cgImage: photo('present'), sourceMemoryIds: ['M023'] }] });
    assert.ok(await h.cache.commitSessionMutation('album', h.bank.chatId, origin, () => album, album));
    assert.ok(await h.cache.commitSessionMutation('pastLives', h.bank.chatId, origin, () => h.session, h.session));
    h.state.activeMode = 'pastLives'; h.state.activeSession = h.session;
    h.ref = h.cards.cardImageCatalog(h.cache.getCache(h.host), h.session)[0].reference;
    return h;
}

test('正式页配对经过真实持久化提交，重新加载保留，旧窗口冲突不覆盖', async () => {
    const h = await durableFixture(), calls = h.providerCalls.length;
    const a = h.actions.capturePastLivesCard(h.session, descriptor), b = h.actions.capturePastLivesCard(h.session, descriptor);
    assert.ok(a); await h.actions.savePastLivesCard(a, h.ref);
    const loaded = h.cache.loadSession('pastLives', { context: h.host, memoryBank: h.bank });
    assert.ok(loaded); assert.equal(h.cards.pastLivesCardPair(loaded, itemId).reference.itemId, 'AL1');
    await assert.rejects(h.actions.savePastLivesCard(b, null));
    const c = h.actions.capturePastLivesCard(h.session, descriptor);
    await h.actions.savePastLivesCard(c, null);
    assert.equal(h.cards.pastLivesCardPair(h.cache.loadSession('pastLives', { context: h.host, memoryBank: h.bank }), itemId), null);
    assert.equal(h.providerCalls.length, calls);
});

test('切换聊天、归档只读、原图片消失，拒绝陈旧保存且不请求模型', async () => {
    const h = await durableFixture(), calls = h.providerCalls.length;
    const captured = h.actions.capturePastLivesCard(h.session, descriptor);
    h.host.chatId = 'other-chat';
    await assert.rejects(h.actions.savePastLivesCard(captured, h.ref));
    h.host.chatId = h.bank.chatId;
    h.state.activeArchiveSnapshot = h.copy({ chatId: h.bank.chatId, memory: h.bank });
    await assert.rejects(h.actions.savePastLivesCard(captured, h.ref));
    h.state.activeArchiveSnapshot = null;
    const origin = h.contextApi.captureTaskOrigin(h.host, h.bank.archiveRevision);
    assert.ok(await h.cache.commitSessionMutation('album', h.bank.chatId, origin, latest => { latest.entries = []; return latest; }));
    await assert.rejects(h.actions.savePastLivesCard(captured, h.ref));
    assert.equal(h.cards.pastLivesCardPair(h.cache.loadSession('pastLives', { context: h.host, memoryBank: h.bank }), itemId), null);
    assert.equal(h.providerCalls.length, calls);
});

test('未完成草稿配对经持久化保留，后续分段与正式完成不丢配对', async () => {
    const h = await durableFixture(), calls = h.providerCalls.length;
    const origin = h.contextApi.captureTaskOrigin(h.host, h.bank.archiveRevision);
    const handle = await h.module('generation/generationSavedActions.js').beginModeRecovery('pastLives', h.host, h.bank, origin,
        { existing: null, draftId: 'card-progress', operation: h.copy({ kind: 'mode', mode: 'pastLives' }) });
    const partial = h.copy({ ...h.session, readableProgress: { version: 1, complete: false, draftId: handle.journal.draftId } });
    const options = { draftId: handle.journal.draftId, sourceMemory: h.bank, complete: false };
    await h.cache.saveGenerationTaskResult(h.host, 'pastLives', partial, origin, options);
    h.state.activeSession = partial;
    const captured = h.actions.capturePastLivesCard(partial, descriptor);
    assert.equal(captured.target.draftId, handle.journal.draftId);
    await h.actions.savePastLivesCard(captured, h.ref);
    await h.cache.saveGenerationTaskResult(h.host, 'pastLives', h.copy(partial), origin, options);
    const record = h.cache.getCache(h.host).__generationDraftsV2.records[handle.journal.draftId];
    assert.ok(h.cards.pastLivesCardPair(record.result.session, itemId));
    const completed = h.copy(h.session);
    const committed = await h.cache.commitSessionMutation('pastLives', h.bank.chatId, origin, () => completed, completed, { completeGeneration: true });
    assert.ok(committed); assert.ok(h.cards.pastLivesCardPair(committed, itemId));
    assert.equal(h.providerCalls.length, calls);
});

test('后台续写旧快照不能覆盖前台新配对或撤销操作', async () => {
    const h = await durableFixture();
    const old = h.copy(h.session);
    const captured = h.actions.capturePastLivesCard(h.session, descriptor);
    await h.actions.savePastLivesCard(captured, h.ref);
    const paired = h.copy(h.session);
    const origin = h.contextApi.captureTaskOrigin(h.host, h.bank.archiveRevision);
    assert.ok(await h.cache.commitSession('pastLives', old, h.bank.chatId, origin));
    assert.ok(h.cards.pastLivesCardPair(h.cache.loadSession('pastLives', { context: h.host, memoryBank: h.bank }), itemId));
    await h.actions.savePastLivesCard(h.actions.capturePastLivesCard(h.session, descriptor), null);
    assert.ok(await h.cache.commitSession('pastLives', paired, h.bank.chatId, origin));
    assert.equal(h.cards.pastLivesCardPair(h.cache.loadSession('pastLives', { context: h.host, memoryBank: h.bank }), itemId), null);
});

test('配对元数据不得使接近原有容量边界的番外变成不可读记录', async () => {
    const f = await fixture(), contract = await f.api('core/pastLivesContract.js');
    f.session.padding = '';
    f.session.padding = '字'.repeat(contract.PAST_LIVES_LIMITS.sessionChars - JSON.stringify(f.session).length);
    assert.ok(contract.pastLivesData(f.session));
    assert.throws(() => f.pair(), error => error.code === 'RMT_PAST_LIVES_STRUCTURE');
    assert.equal(Object.hasOwn(f.session, 'lenticularCardsV1'), false);
    assert.ok(contract.pastLivesData(f.session));
});
