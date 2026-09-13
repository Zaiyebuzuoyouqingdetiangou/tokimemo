import * as contract from '../core/pastLivesContract.js';
import * as text from '../core/text.js';
import * as evidence from '../core/evidence.js';
import * as narrative from '../core/narrativeAuthority.js';
import * as contextApi from '../core/context.js';
import * as cache from '../core/cache.js';
import * as incremental from '../core/incremental.js';
import * as generation from '../generation/client.js';
import * as prompts from '../generation/prompts.js';
import * as relationshipSafety from '../core/relationshipSafety.js';

export const PAST_LIVES_VERSION = contract.PAST_LIVES_VERSION;
export const PAST_LIVES_MODE = contract.PAST_LIVES_MODE;
const L = contract.PAST_LIVES_LIMITS;
const clean = contract.pastLivesText;
const list = contract.pastLivesArray;
const fail = contract.pastLivesError;
const localId = (prefix, index) => `${prefix}${String(index + 1).padStart(2, '0')}`;
const roleContext = memory => ({ name1: memory?.userName || '', name2: memory?.characterName || '' });

function fictionalText(value, memory, max = L.prose, required = false, speaker = 'char') {
    const result = clean(value, max, required);
    const context = roleContext(memory);
    if (speaker === 'user') [context.name1, context.name2] = [context.name2, context.name1];
    try { relationshipSafety.assertPairRelationshipSafety(result, context, '前世今生', undefined, { fictionPairScope: true }); }
    catch { throw fail('RELATIONSHIP', '番外只能围绕两人展开，不增加前任或第三人的恋爱婚姻。'); }
    return result;
}

function presentText(value, memory, max = L.prose, required = false) {
    const result = fictionalText(value, memory, max, required);
    if (narrative.narrativeClaimsSharedHistory(result, { userName: memory?.userName })
        || /(?:今生|现实|此生).{0,16}(?:已经应验|确实发生|命中注定|注定.{0,6}(?:恋人|夫妻|相爱))/u.test(result))
        throw fail('HISTORY', '今生的新文字只写当下感受或未来可能；真正共同往事请放入有真实引文的记忆回响。');
    if (!relationshipSafety.presentRelationshipAllows(result, memory)) throw fail('RELATIONSHIP', '今生称呼超出了两人当前关系，请保留原本的关系和选择。');
    return result;
}

function annotationText(value, memory) {
    const result = fictionalText(value, memory, L.prose, true);
    for (const sentence of result.split(/[。！？!?；;\n]+/u)) {
        if (!narrative.narrativeClaimsSharedHistory(sentence, { userName: memory?.userName })) continue;
        const explicitStory = /(?:前世|旧世|卷(?:宗|中|内|里)|虚构(?:人生|故事)|这(?:段|个)(?:故事|梦))/u.test(sentence);
        const currentLife = /(?:今生|此生|这一世|这辈子|现实|昨天|昨晚|去年|今年|今天)/u.test(sentence);
        if (!explicitStory || currentLife) throw fail('HISTORY', '旁批可以重读明确标注的虚构卷宗；今生共同往事必须放入有真实引文的记忆回响。');
    }
    return result;
}

function exactReference(raw, memory) {
    const requested = list(raw.sourceMemoryIds, 16);
    if (!requested.length || requested.some(id => typeof id !== 'string' || !/^M\d+$/u.test(id)))
        throw fail('SOURCE', '引子和真实记忆必须引用当前档案的 Mxxx 与完整 anchor。');
    const reference = evidence.normalizeExactMemoryReference(requested, clean(raw.sourceMemoryAnchor, 120, true), memory, 1);
    if (reference.sourceMemoryIds.length !== new Set(requested).size || !reference.sourceMemoryAnchor)
        throw fail('SOURCE', '记忆来源或完整 anchor 与当前档案不符，不能把番外写成真实往事。');
    return reference;
}

function sourceText(memory, ids) {
    return (memory?.memories || []).filter(item => ids.includes(item.id))
        .flatMap(item => [item.title, item.summary, ...(Array.isArray(item.anchors) ? item.anchors : [])])
        .filter(item => typeof item === 'string').join('\n');
}

export function emptyPastLives(memoryBank, context = null) {
    return { kind: PAST_LIVES_MODE, version: PAST_LIVES_VERSION,
        chatId: text.normalizeText(memoryBank?.chatId, 240), archiveRevision: text.normalizeText(memoryBank?.archiveRevision, 240),
        ownerKey: context ? contextApi.currentCharacterRuntimeKey(context) : '',
        characterName: text.normalizeText(memoryBank?.characterName, 120), userName: text.normalizeText(memoryBank?.userName, 120),
        title: '前世今生', presentation: 'neutral', episodes: [], selectedId: '', selectedEntryId: '', selectedKey: '',
        view: 'library', pastLivesReadMask: '', pastLivesDrawn: false, pastLivesClosing: false };
}

export function normalizePastLivesOpening(value, memory) {
    const raw = contract.pastLivesData(value, L.episodeChars);
    return { title: fictionalText(raw.title, memory, L.title, true), text: fictionalText(raw.text, memory, L.prose, true),
        motif: fictionalText(raw.motif, memory, 300, true), ...exactReference(raw, memory) };
}

export function normalizePastLivesPlan(value, memory) {
    const raw = contract.pastLivesData(value, L.episodeChars);
    return { title: fictionalText(raw.title, memory, L.title, true), opening: normalizePastLivesOpening(raw.opening, memory),
        dossiers: list(raw.dossiers, L.dossiers).map((item, index) => ({ id: localId('D', index),
            title: fictionalText(item.title, memory, L.title, true), era: fictionalText(item.era, memory, 240),
            intent: fictionalText(item.intent, memory, 1200, true) })) };
}

export function normalizePastLivesDossier(value, memory, { id = 'D01', title = '' } = {}) {
    const raw = contract.pastLivesData(value, L.episodeChars);
    return { id, title: fictionalText(title || raw.title, memory, L.title, true), era: fictionalText(raw.era, memory, 240),
        synopsis: fictionalText(raw.synopsis, memory, L.prose, true),
        clues: list(raw.clues, L.clues).map((clue, index) => {
            if (!contract.PAST_LIVES_CLUE_KINDS.includes(clue.kind)) throw fail('STRUCTURE', '卷宗线索类型无法读取，请使用物证、证词、缺页或旁记。');
            const speaker = ['char', 'user', 'narrator'].includes(clue.speaker) ? clue.speaker : 'narrator';
            return { id: localId(`${id}-C`, index), kind: clue.kind, speaker,
                title: fictionalText(clue.title, memory, L.title, true),
                text: fictionalText(clue.text, memory, L.prose, true, speaker),
                revealedText: fictionalText(clue.revealedText, memory, L.prose, clue.kind === 'missing', speaker) };
        }) };
}

export function normalizePastLivesFinale(value, memory, dossiers) {
    const raw = contract.pastLivesData(value, L.episodeChars);
    const clueIds = new Set(dossiers.flatMap(item => item.clues.map(clue => clue.id)));
    const echoes = list(raw.echoes, L.echoes).map((echo, index) => {
        if (echo.kind === 'memory') {
            const reference = exactReference(echo, memory);
            const quote = clean(echo.text, L.prose, true);
            if (!sourceText(memory, reference.sourceMemoryIds).includes(quote))
                throw fail('HISTORY', '今生记忆须为所引 Mxxx 的真实原文片段，不能借一个 anchor 添加新往事。');
            const source = memory.memories.find(item => item.id === reference.sourceMemoryIds[0]);
            return { id: localId('E', index), kind: 'memory', title: text.normalizeText(source?.title || reference.sourceMemoryAnchor, L.title),
                text: quote, reflection: presentText(echo.reflection, memory, 1800), ...reference };
        }
        if (echo.kind !== 'possibility') throw fail('STRUCTURE', '回响须区分真实记忆与未来可能。');
        const prose = presentText(echo.text, memory, L.prose, true);
        if (!/(?:可能|也许|或许|如果|假如|愿|希望|未必|不一定)/u.test(prose))
            throw fail('HISTORY', '未来回响应写成可能、愿望或假设，不预先替两人确定未来。');
        return { id: localId('E', index), kind: 'possibility', title: presentText(echo.title, memory, L.title, true),
            text: prose, reflection: presentText(echo.reflection, memory, 1800), sourceMemoryIds: [], sourceMemoryAnchor: '' };
    });
    const annotations = list(raw.annotations, L.annotations).map((annotation, index) => {
        const afterClueIds = [...new Set(list(annotation.afterClueIds, L.dossiers * L.clues))];
        if (afterClueIds.some(id => typeof id !== 'string' || !clueIds.has(id))) throw fail('STRUCTURE', '旁批引用了不存在的线索，请只对应本篇已写出的线索。');
        return { id: localId('A', index), afterClueIds, text: annotationText(annotation.text, memory) };
    });
    return { echoes, annotations, closing: { text: presentText(raw.closing?.text, memory, L.prose, true),
        signature: presentText(raw.closing?.signature, memory, 240) || text.normalizeText(memory.characterName, 120) } };
}

export function normalizePastLivesEpisode(value, memory, { id = 'PL01', presentation = 'neutral' } = {}) {
    const raw = contract.pastLivesData(value, L.episodeChars);
    const opening = normalizePastLivesOpening(raw.opening, memory);
    const dossiers = list(raw.dossiers, L.dossiers).map((item, index) => normalizePastLivesDossier(item, memory, { id: localId('D', index) }));
    return { id, title: fictionalText(raw.title, memory, L.title, true), presentation: ['classical', 'modern', 'fantasy', 'neutral'].includes(presentation) ? presentation : 'neutral',
        fiction: true, opening, dossiers, ...normalizePastLivesFinale(raw, memory, dossiers) };
}

export function normalizePastLives(value, memory, options = {}) {
    const raw = contract.pastLivesData(value);
    if (raw.kind !== PAST_LIVES_MODE || raw.version !== PAST_LIVES_VERSION) throw fail('VERSION', '这份前世今生版本暂不可读取，原记录保持不变。');
    if ((raw.chatId && raw.chatId !== memory?.chatId) || (raw.archiveRevision && raw.archiveRevision !== memory?.archiveRevision))
        throw fail('SOURCE', '番外所属聊天或档案版本不一致，原记录保持不变。');
    const result = emptyPastLives(memory, options.context);
    result.ownerKey = result.ownerKey || clean(raw.ownerKey, 1200);
    result.presentation = ['classical', 'modern', 'fantasy', 'neutral'].includes(raw.presentation) ? raw.presentation : 'neutral';
    result.episodes = list(raw.episodes, L.episodes).map((episode, index) => normalizePastLivesEpisode(episode, memory,
        { id: localId('PL', index), presentation: episode.presentation || result.presentation }));
    Object.assign(result, contract.pastLivesReadingState({ ...result, ...Object.fromEntries(['selectedId', 'selectedEntryId', 'selectedKey', 'view', 'pastLivesReadMask', 'pastLivesDrawn', 'pastLivesClosing'].map(key => [key, raw[key]])) }));
    return result;
}

// Reopening checks safe storage structure and identity, not today's interpretation
// of yesterday's writing. Generation alone revalidates current evidence/relationship.
export function readablePastLivesSession(value, memory) {
    try {
        const raw = contract.pastLivesStoredData(value);
        if (raw.chatId !== memory?.chatId || raw.archiveRevision !== memory?.archiveRevision
            || raw.characterName !== memory?.characterName || raw.userName !== memory?.userName) return null;
        return value;
    } catch { return null; }
}

export function pastLivesHasSource(memory) {
    return (Array.isArray(memory?.memories) ? memory.memories : []).some(item =>
        /^M\d+$/u.test(String(item?.id || '')) && evidence.memoryEvidenceTerms(memory, [item.id]).length > 0);
}

const GENERATION_RULES = `前世是明确标注的虚构番外，可写另一段人生；不能用它证明轮回、真实命理或今生已发生的事。不要求生日，不编四柱。
围绕角色与用户，遵循人物性格；不加前任或第三人恋爱婚姻。前世只是假设，今生关系不升级、不回填主聊天、不生成新的 Mxxx。
签、卷、线索和回响数量由内容决定；数组可为空，不凑最低数量或字数。不要用固定先凶后吉、永世相守代替人物选择。
模型只写 JSON 文本，禁止 HTML/CSS/JS/SVG、URL、事件、坐标、资源路径和执行指令。ID、界面与显字由本地代码控制。
所有前世场景写在 opening/dossiers 中。今生 memory 回响的 text 必须逐字摘录所引 Mxxx 的 title/summary/anchors；reflection 只写当下解读。possibility 明确写可能、愿望或假设。旁批和落款写对虚构卷宗的解读与当下选择，不夹带未证实的今生历史。`;

export function pastLivesPlanPrompt(context, memory, previous = null, presentation = 'neutral') {
    return `${prompts.promptSafetyBoundary(context, '前世今生 · 独立虚构番外')}
${GENERATION_RULES}
从档案中一件可追溯的物品、话语或选择取引子，写新的入卷计划。表现风格：${presentation}。不复制已有篇章，不重写它们。
输出 {"title":"篇名","opening":{"title":"引子名","motif":"画面意象","text":"短签文/旧信引子，属于虚构开卷","sourceMemoryIds":["真实Mxxx"],"sourceMemoryAnchor":"逐字完整anchor"},"dossiers":[{"title":"卷名","era":"另一人生的时代背景","intent":"这卷要揭示的选择或疑点"}]}。
dossiers 仅有安全上限 ${L.dossiers}，不是目标数量；引子和每卷都有内容即可，不设最低字数。
UNTRUSTED_EXISTING_EPISODE_TITLES_JSON:
${JSON.stringify((previous?.episodes || []).map(item => ({ title: item.title, motif: item.opening.motif })))}
UNTRUSTED_CURRENT_ARCHIVE_JSON:
${prompts.promptArchiveSlice(memory, 48)}`;
}

export async function generatePastLivesWithRepair(context, memory, origin, taskKey, options = {}) {
    if (!pastLivesHasSource(memory)) throw fail('SOURCE', '当前档案还没有可追溯的物件、话语或选择；先整理真实记忆，再写这篇番外。');
    const previous = options.previousSession || (options.replaceExisting ? null : cache.loadSession(PAST_LIVES_MODE, { context, chatId: memory.chatId, memoryBank: memory, clone: true }));
    // Never treat an unreadable saved record as permission to overwrite it.
    if (!previous && options.replaceExisting !== true && cache.getCache(context)?.[PAST_LIVES_MODE])
        throw fail('VERSION', '已有番外暂不可安全读取，原记录保持不变；请先备份检查，不能直接覆盖。');
    if (previous && !readablePastLivesSession(previous, memory))
        throw fail('VERSION', '已有番外暂不可安全读取，原记录保持不变；不能直接覆盖。');
    if (previous?.episodes?.length >= L.episodes) throw fail('LIMIT', '番外篇章已达到本地容量上限；旧篇章仍保留，请先备份整理。');
    const assertContextRead = () => {
        contextApi.assertRuntimeLifecycleCurrent(origin.lifecycleEpoch);
        if (!context.__rmtArchiveTargetEntryId && !contextApi.isCurrentTaskOrigin(origin))
            throw new DOMException('Archive context changed before past-lives context capture', 'AbortError');
    };
    assertContextRead();
    const presentationContext = options.presentationContext || await generation.buildWorldPresentationContext(context, memory, PAST_LIVES_MODE);
    assertContextRead();
    const presentation = contract.pastLivesPresentation(presentationContext.profile);
    const baseOptions = { context, contextEnvelope: presentationContext.contextEnvelope, origin, mode: PAST_LIVES_MODE, background: true, temperature: 0.75 };
    // r62 changes only the validator for this mode, not its r61 prompt recipe.
    // The exact legacy prompt authenticates replay; it is not a general hash bypass.
    const planPrompt = pastLivesPlanPrompt(context, memory, previous, presentation);
    const compatibility = prompt => ({ contract: 'past-lives-readable-r62', legacyPrompts: [prompt] });
    const plan = await generation.requestValidatedSegment(planPrompt, '前世今生 · 正在写下入卷引子…',
        { ...baseOptions, taskKey: `${taskKey}:past-lives-plan`, maxTokens: 4200, recoveryCompatibility: compatibility(planPrompt) }, raw => normalizePastLivesPlan(raw, memory));
    const dossiers = [];
    for (const slot of plan.dossiers) {
        const prompt = `${prompts.promptSafetyBoundary(context, '前世今生 · 虚构卷宗')}
${GENERATION_RULES}
只完成 LOCAL_DOSSIER_PLAN 中这一卷，不写今生真实历史、不提前输出其他卷。用物证、证词、缺页或旁记展开角色与用户的选择；可少写，不凑线索数量。
输出 {"title":"卷名","era":"时代","synopsis":"这一卷的叙事正文","clues":[{"kind":"object|testimony|missing|note","title":"线索名","speaker":"char|user|narrator","text":"可见的线索正文","revealedText":"缺页点击后显示的完整字迹；其他类型可为空"}]}。
missing 必须有完整 revealedText，显字纯本地完成。每卷 clues 安全上限 ${L.clues}，不是配额。证词的 speaker 只表示虚构卷内的发言归属。
LOCAL_DOSSIER_PLAN:
${JSON.stringify({ opening: plan.opening, dossier: slot, presentation })}`;
        dossiers.push(await generation.requestValidatedSegment(prompt, `前世今生 · 正在展开「${slot.title}」…`,
            { ...baseOptions, taskKey: `${taskKey}:past-lives-dossier:${slot.id}`, maxTokens: 6800, recoveryCompatibility: compatibility(prompt) },
            raw => normalizePastLivesDossier(raw, memory, { id: slot.id, title: slot.title })));
    }
    const finalePrompt = `${prompts.promptSafetyBoundary(context, '前世今生 · 今生回响与落款')}
${GENERATION_RULES}
根据已完成卷宗，写今生回响、逐步出现的旁批和落款。annotations.afterClueIds 只用卷内提供的真实本地线索 id；空数组表示入卷即有的初批，有线索的旁批应补充或修正解读。读者可以略过探索直接看结尾，不设答题或付费解锁。
输出 {"echoes":[{"kind":"memory|possibility","title":"可能的标题；memory标题由本地取真实记忆标题","text":"memory须逐字引用档案，possibility明确是可能","reflection":"当下解读，可为空","sourceMemoryIds":["仅memory需要真实Mxxx"],"sourceMemoryAnchor":"仅memory需要完整anchor"}],"annotations":[{"afterClueIds":["已有线索id"],"text":"对虚构故事的初解、补充或修正"}],"closing":{"text":"结尾与当下选择，不替双方定命","signature":"落款"}}。
echoes、annotations 可为空，安全上限各 ${L.echoes}/${L.annotations}；不用固定结果。落款应完整，但没有字数闯关。
UNTRUSTED_COMPLETED_STORY_JSON:
${JSON.stringify({ title: plan.title, opening: plan.opening, dossiers })}
UNTRUSTED_CURRENT_ARCHIVE_JSON:
${prompts.promptArchiveSlice(memory, 48)}`;
    const finale = await generation.requestValidatedSegment(finalePrompt, '前世今生 · 正在写今生回响与落款…',
        { ...baseOptions, taskKey: `${taskKey}:past-lives-finale`, maxTokens: 6400, recoveryCompatibility: compatibility(finalePrompt) }, raw => normalizePastLivesFinale(raw, memory, dossiers));
    const episode = normalizePastLivesEpisode({ title: plan.title, opening: plan.opening, dossiers, ...finale }, memory,
        { id: localId('PL', previous?.episodes?.length || 0), presentation });
    const next = previous ? structuredClone(previous) : emptyPastLives(memory, context);
    next.presentation = presentation;
    next.episodes.push(episode);
    // Reset only the new reader position; every previously saved episode remains intact.
    Object.assign(next, { selectedId: episode.id, selectedEntryId: episode.dossiers[0]?.id || '', selectedKey: '',
        view: 'draw', pastLivesReadMask: '', pastLivesDrawn: false, pastLivesClosing: false });
    const covered = incremental.derivedExpansionMemoryIds(previous, memory);
    incremental.stampIncrementalCoverage(next, previous, memory, 'mode', covered, 1);
    contract.pastLivesData(next);
    return next;
}
