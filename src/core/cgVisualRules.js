// Shared authoring rules for CG text generation only. These are not send-time
// filters: an explicit editor draft keeps the existing editing/sending contract.
import * as text from './text.js';

export const CG_VISUAL_AUTHORING_RULES = `【CG_VISUAL_AUTHORING_V2 · 共用视觉提炼规则】
这组要求仅用于生图字段，不改标题、日期、剧情正文、台词、证据或关系：
1. 稳定外貌只取资料明确记载的发色、发型、眼睛、肤色、脸型、体型和辨识特征；分别绑定原画面实际出场的人物。不凭名字、性格或衣着推断性别、年龄或未知外貌，不添加人物。
2. 当前衣着、姿态、动作和表情只取当前事件／当前分镜明确出现的内容。性格评价、习惯、条件反应、口癖、关系履历和抽象气质不是稳定外貌，不自动写进任何生图字段。
3. “平时总带着笑”“笑起来眼睛弯成月牙”“被调侃会红耳朵”等只能是资料中的习惯或条件反应，不能变成画面指令；当前画面没有笑就不补笑，没有脸红就不补脸红。画面确实写明的笑、哭、窘迫等只在该画面／该格描述，不写进稳定外貌。
4. 提炼视觉事实，不粘贴人设段落、Markdown标题、口癖引语、断裂句子或坏标点。不要把“缺失就留空”等说明当成画面文字。未知保持未知，不能靠猜测补全。
5. 场景、人物、动作及外貌一一对应，不能将双方特征混成一人；人物动作与事件环境是主体，不退化成纯肖像。同一字段内不机械重复外貌或禁字要求。
6. 5／4.5只决定自动构思的写法，不决定实际后端模型；所有输出均为受限文字数据，不提供HTML、脚本、URL或执行指令。图片不画对白框、字幕、Logo、水印和文字，剧情台词仍由原模块显示。`;

export function cgComicLayoutInstructions(item = null) {
    const count = Array.isArray(item?.panels) && item.panels.length >= 1 && item.panels.length <= 4
        ? item.panels.length : Number.isInteger(item?.panelCount) && item.panelCount >= 1 && item.panelCount <= 4 ? item.panelCount : 0;
    return `【CG_COMIC_LAYOUT_V2】日常一格使用Q版成年角色漫画，不是海报或拼贴。${count ? `本条已保存${count}格，必须按从上到下的顺序描述恰好${count}格。` : '以本条实际panels数组的数量和顺序为准，与panelCount一致，几格就描述几格。'}1格为单幅；多格为单列竖向分格（上下排列），4格就是上下四格，不能改成2×2、左右两列或少格。按“第1格（最上方）…第N格（最下方）”分别描述原分镜已经写明的人物、动作和表情，不使用“左格／右格”指代整格；格内人物的左右位置可以保留。人物身份与服装连续性保持，除非原分镜明确换装；不新增动作、表情或台词。此规则只影响图像构思，不改panels中的原剧情和台词。`;
}

export function cgInitialVisualInstructions(promptFormat, comic = false) {
    const tags = promptFormat === 'nai45-tags';
    return `\n\n【CG_PROMPT_FORMAT_V1 · ${promptFormat}】\n${CG_VISUAL_AUTHORING_RULES}\n${comic ? cgComicLayoutInstructions() : '画面类型沿用本任务原有单幅CG要求，不加漫画分格。'}
【CG_VISUAL_FIELDS_V2】保持原JSON结构及其必需字段；只整理每个条目的imagePrompt，并可在同一条目增加可选cgPromptDraft。不增加一次单独请求。
imagePrompt：${tags ? '英文Danbooru风格逗号分隔短Tag，不输出中文人设原文或解释句；按人物位置与动作区分双方。' : '连贯的自然场景描述，允许中文，不强制英文，不用标签堆砌代替完整描述。'}保持原事件、人数、动作和场景。
cgPromptDraft：{"schemaVersion":1,"sceneTags":"场景、人数、衣着、动作、镜头的英文短Tag，不堆双方稳定外貌，最多600字符","flatPrompt":"可独立用于单提示词后端的完整${tags ? '英文Tag' : '自然语言'}画面，将明确外貌分别绑定对应人物的当前动作，最多1800字符","characters":[{"role":"char或user","tag":"仅该人物稳定可见特征的英文短Tag，最多400字符","nl":"${tags ? '留空' : '仅该人物稳定可见外貌简述，允许中文，最多400字符'}"}]}。
characters仅填写当前画面实际出场且有外貌依据的角色，role按原任务char/user身份，不填姓名、URL或其他身份键；没有外貌依据时留空数组。cgPromptDraft不是原始人设备份。若写了cgPromptDraft，各字段与imagePrompt必须描述同一画面；不重新编故事、不把习惯性表情加进任何字段。其他字段继续严格按原任务输出。`;
}

function dataObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value)
        && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function field(value, key) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}
function visualText(value, limit) {
    if (typeof value !== 'string' || value.length > limit) return null;
    return text.normalizeText(value.replace(/https?:\/\/\S+/gi, ' ')
        .replace(/\{\{[^{}]{1,100}\}\}/g, ' ').replace(/<[^>]{0,500}>/g, ' ')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' '), limit);
}

// Optional generated image metadata is never an authority for a name, target,
// URL, model or write location. Unknown/malformed drafts fall back without making
// the original domain-validated story fail. Legacy items get no additional key.
export function normalizeGeneratedCgDraft(value) {
    if (!dataObject(value) || field(value, 'schemaVersion') !== 1) return null;
    const sceneTags = visualText(field(value, 'sceneTags'), 600);
    const flatPrompt = visualText(field(value, 'flatPrompt'), 1800);
    const rows = field(value, 'characters');
    if (!sceneTags || !flatPrompt || !Array.isArray(rows) || rows.length > 2) return null;
    const characters = [], seen = new Set();
    for (let index = 0; index < rows.length; index += 1) {
        const row = field(rows, String(index));
        if (!dataObject(row)) return null;
        const role = field(row, 'role');
        if (!['char', 'user'].includes(role) || seen.has(role)) return null;
        seen.add(role);
        const tag = visualText(field(row, 'tag'), 400);
        const nlValue = field(row, 'nl');
        const nl = visualText(nlValue === undefined ? '' : nlValue, 400);
        if (tag === null || nl === null) return null;
        if (tag) characters.push({ role, tag, nl });
    }
    return { schemaVersion: 1, sceneTags, flatPrompt, characters };
}
export function generatedCgDraftFields(item) {
    const draft = dataObject(item) ? normalizeGeneratedCgDraft(field(item, 'cgPromptDraft')) : null;
    return draft ? { cgPromptDraft: draft } : {};
}

// Only used for automatic source excerpts, never for a user-edited scene or
// confirmed appearance. This is a conservative fallback, not semantic extraction.
const AUTO_APPEARANCE_DROP = /(?:平时|平常|通常|总是|常常|经常|往往|笑起来|笑时|带着笑|微笑|会红|悄悄红|满脸通红|红着脸|出汗|满头大汗|被调侃|被夸|有人|莫名其妙|可怜什么|本人天生|接受|死皮赖脸|一定要|跑的急|跑得急|穿衣偏好|衣服|服装|穿着|衣着|中衣|长袍|外套|制服|衬衫|裙子|性格|习惯|喜欢|讨厌|口癖|口头禅|情绪|经历|履历|\b(?:always|usually|often|typically|habit|tends? to|when|whenever|smil(?:e|es|ing)|blush(?:es|ing)?|sweat(?:s|ing)?|personality|outfit|wears?|clothes|clothing|robe|jacket|shirt|dress|uniform)\b)/iu;
export function automaticAppearanceClause(value) {
    if (typeof value !== 'string') return '';
    const clean = value.replace(/[*#`]+/g, '').replace(/^\s*[-•]\s*/u, '').trim();
    return !clean || AUTO_APPEARANCE_DROP.test(clean) || /[“”「」"()（）]/u.test(clean)
        || /[:：]\s*$/u.test(clean) ? '' : clean;
}

// Optional visual fields never decide whether an otherwise valid story is kept.
export function generatedCgSceneFields(item) {
    const prompt = typeof item?.imagePrompt === 'string' ? visualText(item.imagePrompt, 1800) : '';
    return { ...(prompt ? { imagePrompt: prompt } : {}), ...generatedCgDraftFields(item) };
}

export function cgStoryVisualInstructions(format, mode) {
    const places = mode === 'heart' ? '每个 voiceDramas / scenarioDramas 条目'
        : mode === 'ending' ? 'ending 对象（终章）和每个 epilogue.scenes 条目，以及 confessionReplays 中每个重温条目'
        : mode === 'bedtime' ? 'chapter 对象'
        : mode === 'pastLives' ? '当前卷宗 dossier 对象（与 synopsis / clues 同级）'
        : '每个有正文的 node 对象';
    return cgInitialVisualInstructions(format, false) + `
【本模块画面字段位置】把 imagePrompt 与可选 cgPromptDraft 写在${places}，不是独立返回的新顶层对象。
从本次写出的正文选一个明确瞬间，直接完成可用于绘图的画面描述：人物在画面中的位置、当下动作与视线、实际衣着与可见外貌、发生地点的具体物件、时间与光源方向、前中后景和镜头距离。已知细节充分展开，未知外貌不捏造。不要只写标题、setting 一句话、季节或 soft/clear 气氛词，也不粘贴对白或整篇原文。可参考相簿事件CG的细致程度，但不靠重复形容词凑长度。画面字段随本次正文一起返回，不额外请求，不因为画面字段缺失丢弃正文。`;
}

// Legacy stories have no authored visual fields. Extract visible narration for
// the initial editable draft; keep the full source separate for reconception.
export function legacyCgSceneExcerpt(value, context = '') {
    const lines = String(value || '').split(/\r?\n/u).filter(line => !/^\s*(?:char|user)\s*[:：]/iu.test(line))
        .map(line => line.replace(/^\s*narrator\s*[:：]\s*/iu, ''));
    const clauses = lines.join(' ').replace(/[“「][^”」]*[”」]/gu, '').split(/(?<=[。！？.!?])\s*/u);
    const visible = clauses.filter(line => /(?:窗|灯|光|夜|雨|风|海|树|街|房|手|衣|发|眼|站|坐|走|倚|抱|握|抬|垂|桌|门|船|window|light|hand|hair|stand|sit|hold|room|street)/iu.test(line));
    return text.normalizeText([context, ...visible.slice(0, 5)].filter(Boolean).join(' '), 1500);
}

// 没有模型写好的 imagePrompt 时的编辑器初稿：设定放前面，再从正文挑几处看得见的动作和物件。
// 传闻、心理、判断和对白不进画面；第一人称的“我”换成角色名，“你”指谁不确定，整句跳过。
const DRAFT_VISIBLE = /(?:窗|灯|烛|光|火|炉|夜|雨|雪|风|海|河|湖|山|树|花|月|街|巷|桥|房|屋|门|槛|桌|椅|床|船|车|马|剑|刀|铁|锤|书|信|杯|茶|伞|衣|袖|裙|发|眼|脸|手|指|肩|膝|脚|站|坐|走|跑|跪|躺|倚|靠|抱|握|牵|拉|捏|拿|捧|举|推|抬头|低头|低着|垂着|回头|转身|看着|望着|盯着|看见|擦|抹|敲|编|window|light|hand|hair|stand|sit|hold|room|street)/iu;
const DRAFT_NOT_VISIBLE = /(?:都说|听说|据说|传说|觉得|以为|想着|想起|想到|记得|忘了|知道|明白|心里|心想|心中|仿佛|好像|似乎|大概|也许|或许|如果|要是|假如|倘若|因为|所以|可惜|从来|一辈子|永远|曾经|后来|总有一天|为什么|怎么|难道|是不是|会不会|应该|必须|不得不|决定|打算|希望|害怕|担心|后悔)/u;
function draftSettingPart(value) {
    const first = String(value || '').replace(/[“”「」"]/gu, '').split(/[，,。！？!?；;\n]/u)[0];
    const clean = text.normalizeText(first, 60);
    return clean.length >= 2 && clean.length <= 40 ? clean : '';
}
export function composedCgSceneDraft(value, { setting = [], subject = '', firstPerson = false } = {}) {
    const name = text.normalizeText(subject, 40);
    const lines = String(value || '').split(/\r?\n/u).filter(line => !/^\s*(?:char|user)\s*[:：]/iu.test(line))
        .map(line => line.replace(/^\s*narrator\s*[:：]\s*/iu, ''));
    const clauses = lines.join('，').replace(/[“「『][^”」』]*[”」』]/gu, '，').split(/[，,。！？!?；;…、]+/u);
    const moment = [];
    for (const raw of clauses) {
        let clause = text.normalizeText(raw, 80);
        if (clause.length < 4 || clause.length > 60 || !DRAFT_VISIBLE.test(clause) || DRAFT_NOT_VISIBLE.test(clause)) continue;
        if (firstPerson) {
            if (/[你您]/u.test(clause) || (!name && /我/u.test(clause))) continue;
            clause = clause.replace(/(?:我们|咱们)/gu, '两人').replace(/我/gu, name);
        } else if (/[我你您]/u.test(clause)) continue;
        if (!moment.includes(clause)) moment.push(clause);
        if (moment.length >= 4) break;
    }
    const parts = [];
    for (const part of (Array.isArray(setting) ? setting : [setting]).map(draftSettingPart)) {
        if (part && !parts.some(existing => existing.includes(part) || part.includes(existing))) parts.push(part);
    }
    const scene = parts.length ? `${parts.join('，')}。` : '';
    const action = moment.length ? `${moment.join('，')}。` : '';
    return text.normalizeText(`${scene}${action}`, 400);
}
