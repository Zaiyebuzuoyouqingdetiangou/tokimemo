// Shortest shape examples appended after the output seal.
// Placeholder sentences show field names and nesting only. Length floors stay in the page contract.

const PREFACE = `【最短合法例子】
只示范字段名和层数。花括号里的短句是占位，不要照抄字数；句数、字数下限、证据和身份规则仍按上面的合同。按同一种形状填写真实内容。`;

function block(sample) {
    return `${PREFACE}\n${JSON.stringify(sample, null, 2)}`;
}

const anchor = { sourceMemoryIds: ['M001'], sourceMemoryAnchor: '从所引记忆原样复制的一句' };
const voiceScript = [{ speaker: 'char', text: '今天想出去走走。' }, { speaker: 'user', text: '好。' }];

function voiceExample(kind, title) {
    return { voiceDramas: [{ id: 'VOICE_1', kind, title, subtitle: '一段未来日常', setting: '这是未来模拟', visualTone: 'soft', script: voiceScript }] };
}
function scenarioExample(kind, title) {
    return { scenarioDramas: [{ id: 'SCENARIO_1', kind, title, subtitle: '一天里的一件小事', setting: '这是未来模拟', visualTone: 'clear', script: [...voiceScript, { speaker: 'narrator', text: '风从窗边过去。' }] }] };
}

const butterflyNode = {
    node: {
        id: 'EG01', label: '分歧点：另一条路', code: '> SIMULATION RECORD #EG-01', locked: false, trueEnding: false,
        ...anchor, sourceMemoryIds: [], sourceMemoryAnchor: '',
        worldSpec: { primaryAxis: 'decision', era: '这个世界的时代', identity: '这个世界的身份', occupation: '这个世界的谋生方式', location: '主要生活地点', keyDecision: '改变人生的选择', encounterWithUser: '如何相遇', bondWithUser: '与用户的关系', finalFate: '这个世界的结局', thirdPartyRomance: false },
        monologue: '平行世界里的我这样过日子。', intervention: '现世的我看见后停了一下。', systemNote: '关键变量已经改变。',
    },
};

const EXAMPLES = {
    '两个人的日历': {
        title: '两个人的日历',
        past: [{ id: 'CAL_PAST_01', title: '去水族馆', tags: ['约会'], ...anchor }],
        promised: [{ id: 'CAL_PROMISE_01', date: '待定', title: '下次去看灯', tags: ['约定'], ...anchor }],
        future: [],
        holidayCards: [],
        stickyNotes: [{ id: 'CAL_NOTE_01', kind: 'memo', title: '记得', text: '别把那天排太满。', sourceType: 'archive', ...anchor, sourceLabel: '', sourceEvidence: '', calendarEntryId: 'CAL_PAST_01', date: '' }],
        moodNotes: [{ id: 'CAL_MOOD_01', textMode: 'persona-expression', text: '今天的风很轻。', sourceMemoryIds: [], sourceMemoryAnchor: '', calendarEntryId: 'CAL_PAST_01', date: '' }],
    },
    '蝴蝶效应': {
        title: '平行时空观测终端', subject: '角色名', status: 'UNSTABLE',
        nodes: [
            { id: 'MAIN', label: '主时间线（锁定）：现世', code: '> SIMULATION RECORD #MAIN', locked: true, trueEnding: false, ...anchor, monologue: '现世的我记得我们怎么走到这里。', intervention: '这就是现在。', systemNote: '主时间线已锁定。' },
            butterflyNode.node,
            { id: 'OMEGA', label: '观测点 Ω：回归现世', code: '> OBSERVATION POINT #OMEGA', locked: false, trueEnding: true, sourceMemoryIds: [], sourceMemoryAnchor: '', monologue: '', intervention: '看完之后，我还是想回到你身边。', systemNote: '观测结束，主体回归主时间线。' },
        ],
    },
    '蝴蝶效应 / 增量分歧': butterflyNode,
    '蝴蝶效应 / 单个观测节点重新生成': { node: { label: '另一条路', primaryAxis: 'decision', worldSpec: butterflyNode.node.worldSpec, monologue: '平行世界里的我这样过日子。', intervention: '现世的我看见后停了一下。', systemNote: '关键变量已经改变。' } },
    '结局路线判定 / 分段 1': {
        title: 'ENDING / 结局档案', relationshipState: '关系仍在发展', relationshipSummary: '档案能证明的当前关系。', ...{ relationshipSourceMemoryIds: ['M001'], relationshipSourceMemoryAnchor: '从所引记忆原样复制的一句' },
        recommendedEndingId: 'END_ROUTE',
        endings: [
            { id: 'END_ROUTE', type: 'route', title: '当前路线', subtitle: '沿现在的关系走下去', available: true, unlockHint: '当前关系已经成立', ...anchor },
            { id: 'END_ROMANCE', type: 'romance', title: '恋爱路线', subtitle: '尚未确认', available: false, unlockHint: '还没有双方确认的恋爱推进', ...anchor },
            { id: 'END_REVERSE', type: 'reverse', title: '动摇路线', subtitle: '尚未确认', available: false, unlockHint: '还没有可核验的动摇', ...anchor },
            { id: 'END_BOND', type: 'bond', title: '羁绊路线', subtitle: '并肩', available: true, unlockHint: '档案里有信赖与陪伴', ...anchor },
            { id: 'END_OPEN', type: 'open', title: '未定路线', subtitle: '还没写完', available: true, unlockHint: '关系仍开放', ...anchor },
        ],
    },
    '结局路线判定 / 增量目录': {
        title: 'ENDING / 结局档案', relationshipState: '关系仍在发展', relationshipSummary: '新增档案能证明的变化。', relationshipSourceMemoryIds: ['M001'], relationshipSourceMemoryAnchor: '从所引记忆原样复制的一句', recommendedEndingId: 'END_ROUTE', endings: [],
    },
    '结局路线正文 / 分段详情': {
        ending: { id: 'END_ROUTE', endingScene: '未来的一个下午，两个人仍按现在的关系相处。', creditsLine: '故事在这里先停下。', epilogue: { title: '后日谈', timeSkip: '数周后', scenes: [{ title: '寻常的一天', text: '生活照常继续。' }, { title: '另一天', text: '小事堆成习惯。' }, { title: '再后来', text: '关系没有被改写。' }], finalLine: '这样就好。' } },
    },
    '告白回看增量扫描': { confessionReplays: [] },
    'ENDING / 未解锁路线单项重新生成': { ending: { title: '未解锁路线', subtitle: '还差一步', unlockHint: '需要档案里出现对应推进。' } },
    'ENDING / 单个告白回看重新生成': { confessionReplays: [{ id: 'CONF_01', title: '那次告白', subtitle: '已经发生', type: 'other', date: '', ...anchor, scene: '当时的场景。', confessionText: '说出口的那句。', confessionLines: ['第一句。', '第二句。', '第三句。', '第四句。'], responseSummary: '对方当时的反应。', afterEffect: '之后的变化。', easterEgg: { moduleType: 'heartbeat_console', title: '此刻', statusLine: '还在跳', logs: ['日志一', '日志二', '日志三', '日志四'], monologue: ['没说完的话。', '还想再说一句。'], poem: ['一句。', '两句。', '三句。', '四句。'], feedback: { pulse: '碰一下', hover: '停一下', reveal: '看见了', stabilize: '稳下来', pause: '先停', resume: '继续' } } }] },
    '角色互动 / 时期对话': {
        title: '角色互动', relationshipState: '关系仍在发展', relationshipSummary: '按档案能证明的距离说话。', relationshipSourceMemoryIds: [], relationshipSourceMemoryAnchor: '', birthdayMmDd: '', userBirthdayMmDd: '', specialDays: [],
        greetings: { morning: ['早。'], noon: [], evening: ['回来了。'], night: [], weekend: [], birthday: [], userBirthday: [], holiday: [], absenceWorry: [], absenceSulky: [], absenceJealous: [] },
    },
    '角色互动 / 时期对话增量': {
        relationshipState: '关系继续发展', relationshipSummary: '新增档案还不足以改写阶段。', relationshipSourceMemoryIds: [], relationshipSourceMemoryAnchor: '', birthdayMmDd: '', userBirthdayMmDd: '', specialDays: [],
        greetings: { morning: ['今天也早。'], noon: [], evening: [], night: [], weekend: [], birthday: [], userBirthday: [], holiday: [], absenceWorry: [], absenceSulky: [], absenceJealous: [] },
    },
    '角色互动 / Drama：未来': voiceExample('postending', '后日谈'),
    '角色互动 / 萤火虫栖息地': { fireflyVoices: [{ id: 'F01', color: 'white', title: '喜欢的食物', script: [{ speaker: 'char', text: '我其实很挑食。' }, { speaker: 'user', text: '这样啊。' }, { speaker: 'char', text: '甜的容易腻。' }, { speaker: 'user_thought', text: '刚才那句像是心声。' }] }] },
    '角色互动 / 单个萤火虫追加约会会话重新生成': { fireflyVoices: [{ id: 'F01', color: 'white', title: '喜欢的食物', script: [{ speaker: 'char', text: '我其实很挑食。' }, { speaker: 'user', text: '这样啊。' }, { speaker: 'char', text: '甜的容易腻。' }, { speaker: 'user_thought', text: '刚才那句像是心声。' }] }] },
    '角色互动 / 旧版萤火虫升级为 GS4 式会话': { fireflyVoices: [{ id: '原ID', color: '原颜色', title: '想靠近一点', script: [{ speaker: 'char', text: '坐近一点也没关系。' }, { speaker: 'user', text: '嗯。' }, { speaker: 'char', text: '我就说这一句。' }, { speaker: 'user_thought', text: '刚才那句像心声。' }] }] },
    '角色互动 / 日常一格': { dailyStrips: [{ id: 'STRIP01', title: '买菜回来', subtitle: '袋子还在门口。', panelCount: 1, panels: [{ caption: '刚到门口。', action: '把袋子放下。', charLine: '今天就这些。', userLine: '我来拿。' }], visualSeed: ['门口', '菜袋'], imagePrompt: 'Q版，门口，人物侧身放下菜袋，no text, no speech bubble, no watermark' }] },
    '回忆相簿 / 重要 CG 节点': { title: '回忆相簿', entries: [{ id: 'CG01', title: '雨天的车站', date: '待定', desc: '两个人站在屋檐下。', category: '日常', unlocked: true, ...anchor, visualSeed: ['雨', '屋檐', '车站', '侧身'], imagePrompt: '雨天车站屋檐下，两人侧身，湿地面，冷色光线。', hintLines: [] }] },
    '回忆相簿 / 分段 2：当下关系扫描': { people: [{ speakerId: '所选人物id', charState: '态度克制', userState: '未确认', relationshipState: '关系仍在发展', relationshipSummary: '只写这条证据能证明的关系。', relationshipSourceMemoryIds: ['M001'], relationshipSourceMemoryAnchor: '从所引记忆原样复制的一句' }] },
    '回忆相簿 / 分段 3：当下共同回忆': { items: [{ id: 'CG01', comments: [{ speakerId: '所选人物id', text: '那天的雨还没停。' }] }] },
    '回忆相簿 / 单项重新生成': { entries: [{ id: 'CG01', title: '雨天的车站', date: '待定', desc: '两个人站在屋檐下。', category: '日常', unlocked: true, ...anchor, visualSeed: ['雨', '屋檐', '车站', '侧身'], imagePrompt: '雨天车站屋檐下，两人侧身。', hintLines: [] }] },
    '回忆相簿 / 单项重新判断分类': { category: '日常' },
    'ADV EVENT 事件索引': { title: '回想：ADV EVENT', events: [{ id: 'EV01', title: '雨天车站', date: '待定', cgDesc: '屋檐下，两人侧身，雨线落在台阶上。', ...anchor, visualSeed: ['雨', '屋檐', '台阶', '侧身'], imagePrompt: '雨天车站屋檐，两人侧身，湿台阶。' }] },
    'ADV EVENT 重要事件索引': { title: '回想：ADV EVENT', events: [{ id: 'EV01', title: '雨天车站', date: '待定', cgDesc: '屋檐下，两人侧身，雨线落在台阶上。', ...anchor, visualSeed: ['雨', '屋檐', '台阶', '侧身'], imagePrompt: '雨天车站屋檐，两人侧身，湿台阶。' }] },
    'ADV EVENT 单条索引补齐': { event: { id: 'EV02', title: '夜路', date: '待定', cgDesc: '路灯下，一个人放慢了脚步。', ...anchor, visualSeed: ['路灯', '夜路', '脚步', '侧影'], imagePrompt: '夜路路灯下，人物侧影，脚步放慢。' } },
    'ADV EVENT / 单个事件重新生成': { events: [{ id: 'EV01', title: '雨天车站', date: '待定', cgDesc: '屋檐下的侧身。', ...anchor, visualSeed: ['雨', '屋檐', '台阶', '侧身'], imagePrompt: '雨天车站屋檐，两人侧身。' }] },
    '单篇 ADV 正文': { narrator: 'char_first_person', sections: [{ type: 'during', paragraphs: ['我站在屋檐下。', '雨声比话多。'] }, { type: 'after', paragraphs: ['后来我还记得那一站。', '没把这句话说完。'] }] },
    '批量 ADV 正文': { items: [{ eventId: 'EV01', narrator: 'char_first_person', sections: [{ type: 'during', paragraphs: ['我站在屋檐下。', '雨声比话多。'] }, { type: 'after', paragraphs: ['后来我还记得。', '话没说完。'] }] }] },
    '他的房间': {
        title: '他的房间', homeName: '住处', homeSummary: '按现在的生活条件住着。',
        visualProfile: { explicitFields: [], explicitEvidence: {}, worldStyle: 'contemporary', palette: 'mist', material: 'wood', density: 'balanced', figure: { build: 'unspecified', hairShape: 'unspecified', hairTone: 'unspecified', outfit: 'casual', detail: 'none', posture: 'reserved' } },
        spaces: [{ id: 'SP01', label: '房间', spaceType: '卧室', atmosphere: '灯还亮着。', objects: [{ id: 'OBJ01', label: '桌子', zone: '中央', basis: '设定', searchable: false, description: '桌上有杯子。', line: '先坐吧。', sourceMemoryIds: [], sourceMemoryAnchor: '' }] }],
        dayparts: { morning: { spaceId: 'SP01', activity: '拉开窗帘', line: '早。', focusObjectId: 'OBJ01' }, daytime: { spaceId: 'SP01', activity: '在桌边做事', line: '还有一点。', focusObjectId: 'OBJ01' }, evening: { spaceId: 'SP01', activity: '把灯打开', line: '回来了。', focusObjectId: 'OBJ01' }, night: { spaceId: 'SP01', activity: '靠在桌边', line: '还不睡。', focusObjectId: 'OBJ01' } },
        presenceLines: ['在这里。'],
    },
    '共同居住的房间': {
        title: '共同住处', homeName: '这套房间', homeSummary: '按选定人物的条件一起使用。', visualProfile: {},
        spaces: [{ id: 'SP01', label: '起居', spaceType: '客厅', atmosphere: '灯还亮着。', objects: [{ id: 'OBJ01', label: '桌子', zone: '中央', basis: '设定', searchable: false, description: '桌上有杯子。', line: '先坐。', speakerId: '所选人物id', sourceMemoryIds: [], sourceMemoryAnchor: '' }] }],
        residents: [{ participantId: '所选人物id', visualProfile: { figure: {}, explicitFields: [], explicitEvidence: {} }, dayparts: { morning: { spaceId: 'SP01', activity: '拉开窗帘', line: '早。', focusObjectId: 'OBJ01' }, daytime: { spaceId: 'SP01', activity: '在桌边', line: '还有一点。', focusObjectId: 'OBJ01' }, evening: { spaceId: 'SP01', activity: '开灯', line: '回来了。', focusObjectId: 'OBJ01' }, night: { spaceId: 'SP01', activity: '还在桌边', line: '不睡。', focusObjectId: 'OBJ01' } }, presenceLines: ['在这里。'] }],
    },
    '他的房间 / 增量物件': { additions: [{ spaceId: 'SP01', objects: [{ id: 'OBJ_NEW', label: '杯子', basis: '设定', zone: '中央', description: '用过的杯子。', line: '我的。', sourceMemoryIds: [], sourceMemoryAnchor: '' }] }] },
    '房间今日生活时间线': { date: 'YYYY-MM-DD', beats: [{ time: '08:10', spaceId: 'SP01', activity: '拉开窗帘', line: '早。', focusObjectId: 'OBJ01', ambient: '光从窗进来。', trace: '杯子还在桌上。', visualState: { lighting: 'soft', window: 'open', order: 'used', surface: 'drink' }, temporaryObjects: [], sourceMemoryIds: [], sourceMemoryAnchor: '' }] },
    '共同房间的今日生活': { date: 'YYYY-MM-DD', beats: [{ time: '08:10', participants: [{ participantId: '所选人物id', spaceId: 'SP01', activity: '拉开窗帘', line: '早。', focusObjectId: 'OBJ01', ambient: '光从窗进来。', trace: '杯子还在桌上。', visualState: { lighting: 'soft', window: 'open', order: 'used', surface: 'drink' }, temporaryObjects: [], sourceMemoryIds: [], sourceMemoryAnchor: '' }] }] },
    '他的物品 / 储物': { title: '他的物品', containers: [{ id: 'BOX01', label: '床头柜', containerType: '抽屉', spaceLabel: '卧室', description: '随手放东西的地方。', nodes: [{ id: 'IT01', label: '票据', kind: 'item', basis: '设定', summary: '折过的纸。', line: '先别翻。', sourceMemoryIds: [], sourceMemoryAnchor: '', children: [] }] }] },
    '他的物品 / 人设扩展': { containers: [{ id: '已有容器id', nodes: [{ id: 'IT_NEW', kind: 'item', label: '新物件', basis: '设定', summary: '符合人设的一件东西。', line: '这个留着。', sourceMemoryIds: [], sourceMemoryAnchor: '', children: [] }] }] },
    '两个人的陈列柜': { items: [{ name: '票根', objectEvidence: '从所引记忆原样复制、含物件名和两人关联的一句', ...anchor }] },
    '私人终端 / 分段 1：设备与 App 目录': {
        title: '他的私人终端', deviceName: '私人终端', deviceKind: 'neutral', lockText: '还在。',
        ownerMembers: [{ name: '成员真名', sourceEvidence: '受控资料里的原句' }],
        uiProfile: { explicitFields: [], palette: 'ink-blue', wallpaper: 'paper', typography: 'serif', iconStyle: 'glyph', density: 'cozy', shellTone: 'ivory' },
        liveStates: { morning: { lockText: '早。', statusLine: '刚醒来', badgeCounts: {} }, daytime: { lockText: '在忙。', statusLine: '白天', badgeCounts: {} }, evening: { lockText: '回来了。', statusLine: '傍晚', badgeCounts: {} }, night: { lockText: '还不睡。', statusLine: '夜里', badgeCounts: {} } },
        apps: [{ id: 'NOTES', label: '备忘', kind: 'notes', icon: 'note', summary: '自己的短记录', entries: [{ id: 'N01', title: '成员真名的备忘', meta: '今天' }] }],
    },
    '他的私人终端': {
        title: '他的私人终端', deviceName: '私人终端', deviceKind: 'phone', lockText: '还在。',
        uiProfile: { explicitFields: [], palette: 'ink-blue', wallpaper: 'paper', typography: 'serif', iconStyle: 'glyph', density: 'cozy', shellTone: 'ivory' },
        liveStates: { morning: { lockText: '早。', statusLine: '刚醒来', badgeCounts: {} }, daytime: { lockText: '在忙。', statusLine: '白天', badgeCounts: {} }, evening: { lockText: '回来了。', statusLine: '傍晚', badgeCounts: {} }, night: { lockText: '还不睡。', statusLine: '夜里', badgeCounts: {} } },
        apps: [{ id: 'NOTES', label: '备忘', kind: 'notes', icon: 'note', summary: '自己的短记录', entries: [{ id: 'N01', title: '今天的备忘', meta: '今天', preview: '记得带钥匙。', detail: '出门前写的一句。', basis: '设定', sourceMemoryIds: [], sourceMemoryAnchor: '' }] }],
    },
    '私人终端 / App 详情': {
        app: { id: '与计划id相同', label: '与计划相同', kind: '与计划相同', summary: '这一屏在用什么', entries: [{ id: '计划中的原id', title: '计划中的标题', meta: '今天', preview: '列表上一句', detail: '点开后的短正文', contactName: '', conversationMode: '', messages: [], fields: [], imageCaption: '', basis: '推演', sourceMemoryIds: [], sourceMemoryAnchor: '', sourceMemoryEvidence: '', sourceSettingEvidence: '' }] },
    },
    '私人终端 / 增量目录': { apps: [{ id: '已有App的id', label: '原label', kind: 'notes', summary: '本轮新增的一条', entries: [{ id: 'N_NEW', title: '新的备忘', meta: '今天' }] }] },
    '他的出行路线 / 独立地图': {
        title: '他的出行路线', mapTheme: 'neutral',
        locations: [{ id: 'N1', kind: 'near', name: '街角', region: '住处附近', distanceToken: 'walk', summary: '顺路会经过。', basis: '推演', sourceMemoryIds: [], sourceMemoryAnchor: '', sourceSettingEvidence: '', dialogueLines: ['这边走。'], keepsake: null }],
    },
    '本世界线人际庭园': {
        title: '本世界线人际关系', summary: '当前能证明的人际状态。',
        discoveries: [{ id: 'DISC_01', label: '兴趣', value: '摄影', summary: '这个窗口里后来得知的资料。', ...anchor }],
        relationships: [{ id: 'REL_CHAT_01', name: '用户显示名', relation: '关系仍在发展', category: 'special', state: '相识', sentiments: ['在意'], summary: '只写这条证据能证明的关系。', isUser: true, npcPerspective: '', ...anchor }],
        settingRelationships: [],
    },
    '档案室 / 成就库': { title: '成就库', entries: [{ id: 'ACH01', title: '第一次一起出门', description: '档案里能核对的一次共同出门。', category: '事件', tier: 'bronze', unlocked: true, unlockedAt: '已解锁', unlockCondition: '一起出过一次门。', ...anchor, hint: '' }] },
    '成就库 / 单项重新生成': { entries: [{ id: 'ACH01', title: '第一次一起出门', description: '档案里能核对的一次。', category: '事件', tier: 'bronze', unlocked: true, unlockedAt: '已解锁', unlockCondition: '一起出过一次门。', ...anchor, hint: '' }] },
    '前世今生 · 独立虚构番外': { title: '另一页', opening: { title: '引子', motif: '旧信', text: '这是虚构的开卷。', ...anchor }, dossiers: [{ title: '第一卷', era: '另一个时代', intent: '要看的那个选择' }] },
    '前世今生 · 虚构卷宗': { title: '第一卷', era: '另一个时代', synopsis: '这一卷是虚构的。', clues: [{ kind: 'note', title: '残页', speaker: 'narrator', text: '看得见的一行。', revealedText: '' }] },
    '前世今生 · 今生回响与落款': { echoes: [{ kind: 'possibility', title: '也许', text: '这只是可能。', reflection: '', sourceMemoryIds: [], sourceMemoryAnchor: '' }], annotations: [], closing: { text: '今生还没被写死。', signature: '落款' } },
    '时空回响': { title: '一篇回响', opening: '两端还没对齐。', closing: '话送到了另一端。', palette: 'slate', motif: '旧线路', medium: { kind: 'object', label: '一封没有寄出的信' }, ends: [{ role: 'char', time: '过去的一个晚上' }, { role: 'user', time: '现在' }], lines: [{ speaker: 'a', text: '你听得到吗。' }, { speaker: 'b', text: '听到了。' }], message: '只说这一句。' },
    '两个人的日历 / 单项重新整理': { entry: { title: '去水族馆', tags: ['约会'] } },
    '两个人的日历 / 单张便签重新生成': { note: { title: '记得', text: '别排太满。' } },
    '两个人的日历 / 页角随笔重新生成': { mood: { text: '今天的风很轻。' } },
};

const PATTERNS = [
    [/^角色互动 \/ Drama：(.+) Voice$/u, label => voiceExample(seasonKind(label), `${label} Voice`)],
    [/^角色互动 \/ Drama：(.+) Scenario$/u, label => scenarioExample(seasonKind(label), `${label} Scenario`)],
];

function seasonKind(label) {
    return { 春: 'spring', 夏: 'summer', 秋: 'autumn', 冬: 'winter' }[label] || 'spring';
}

function taskLabel(prompt) {
    return String(prompt || '').match(/写出【([^】]{1,80})】/u)?.[1] || '';
}

export function jsonShapeExampleBlock(prompt) {
    const text = String(prompt || '');
    if (!text) return '';
    if (text.includes('【本请求的分段输出规则替代上面的整批输出 schema】')) return block(butterflyNode);
    if (text.includes('为当前角色或所选真实事件创作一首原创')) {
        return block({ title: '原创歌名', vocalDescription: '中低音，说着唱。', styleDescription: '慢，钢琴和人声。', stylePrompt: 'slow piano ballad, intimate vocal, sparse arrangement', lyrics: '[Verse 1]\n一句歌词。\n[Chorus]\n一句副歌。\n[Outro]\n收住。\n[End]' });
    }
    if (text.includes('写 char 寄给 User 的私人来信')) {
        return block({ letters: [{ slot: 'daily', title: '今天', greeting: '称呼', body: '顺手写的近况。', closing: '署名' }] });
    }
    const label = taskLabel(text);
    if (!label) return '';
    if (Object.hasOwn(EXAMPLES, label)) return block(EXAMPLES[label]);
    for (const [pattern, build] of PATTERNS) {
        const match = label.match(pattern);
        if (match) return block(build(match[1]));
    }
    return '';
}
