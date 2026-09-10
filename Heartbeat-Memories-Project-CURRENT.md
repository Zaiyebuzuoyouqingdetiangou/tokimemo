# Heartbeat Memories Project CURRENT

> r49.0 重建说明：用户指定的 r48 基线压缩包及本轮工作区中未包含同名 CURRENT 文件。本文件不是对缺失旧文件的转录；它依据 r48 实际生产代码、`ARCHITECTURE.md`、`SECURITY.md`、本轮需求与 r49 已验证实现重建，自 r49.0 起作为当前契约。

## 当前候选

- 产品名：心跳回忆
- version：`0.8.51`
- BUILD / runtime cache-bust：`0.8.51-cover-terminal-r55.0`
- 正式档案 key：`heartbeatMemoriesArchiveV3`
- 派生缓存 key：`heartbeatMemoriesTheaterV3`
- 压缩格式：`gzip-base64-v1`
- Calendar / Phone / Room / Travel session：v6 / v4 / v3 / v4
- SillyTavern 最低版本：`1.18.0`；一键配置入口明确标注 `1.1.18`

V3 metadata key 为旧档案兼容边界，不随发布版本改名。浏览器加载 r55 runtime 由 manifest 与 index 中一致的 BUILD query 隔离，不能继续命中旧 bundle。

## r55 当前增补契约（覆盖旧终端固定数量约束）

- archiveVerdict v1 仅是封面表现字段，不作为 Mxxx、关系状态或历史事实来源。提示先读双方态度与关系，再写 1～3 句、12～160 字符的题辞；来源 ID 与完整 title/anchor 本地校验，拒绝整段复制或超长总结。语义与文学质量仍需真实模型验收，不把格式校验冒充语义证明。
- 旧 archiveSummary 保留用于历史上下文，首页/快照折叠显示。旧封面没有判词时不自动生成；点击写下/重写判词使用独立 API，仅允许修改 archiveName、archiveVerdict、archiveCoverUpdatedAt。历史基线、Mxxx、缓存、终端草稿不可改变，保留 CAS、角色/聊天/revision/lifecycle 围栏。
- 终端按来源允许 1～10 个应用（紧凑设备上限 8），每个至少 1 个目录项，不再强制 chat 或 8/10/12 句。新聊天必须有至少两条、双方可归属的逐字原話；明确群聊参与者可保留。无法明确归属的转述不猜测。旧 trustedStored 内容不按新配额裁剪。
- unavailable 是固定本地非事实空态；模型附带正文全部丢弃，不能覆盖已有有效条目，也不进入后续已有事实索引。全空终端不算生成成功；全空完成草稿重开按未完成处理，避免 N/N 零请求循环。最终重验不能静默过滤已完成应用；来源变化显式失败并保留草稿。
- 草稿 failure 只保存 safeErrorDiagnostic 白名单，页面显示固定原因和 x/y 进度；不显示模型响应、Key、URL、旧 failedMessage 原文。认证失败不自动重试，限流遵守有界 Retry-After；过长等待停止，真正额度不足不重试。
- Profile 与手动 HTTP 200 错误封装均进入正常错误归一化；明确数字状态优先于歧义词，仅 cloudflare 单词不等于 HTML。Heart 季节组合在认证/连接/限流失败后停止兄弟请求；已有成功部分保留并显示安全原因。
- 单 App/entry 重生成在读取世界书前后与返回候选前检查原聊天、角色、revision、lifecycle，防止 A 记忆混入 B 世界书后发送。旧提交围栏保留。
- 本轮仅修复用户截图中的封面、终端与连接错误，不全站重美化、不发布远端；独立 reviewer 只读，生产代码由主 agent 收口。

## r54 当前增补契约

- 关闭档案室直接关闭原生 dialog 并隐藏插件，不询问同步 confirm，不取消任务；宿主切聊事件仍不拦截。删除/重建确认、整页 beforeunload、原聊天提交围栏保留。后台仅指当前页面仍存活，不承诺关闭 TT 应用后继续请求。
- TT 隐藏普通角色/用户楼层只改变 is_system，不应改变档案正文指纹。仅严格布尔 is_user、精确匹配对应 name1/name2 且无真正系统/工具标记的隐藏消息可作为聊天证据；同一判定用于快照与可用消息计数，不改宿主正文。旧消息真正编辑/删除/重排仍拒绝覆盖；旧档案若原先已经漏收隐藏楼层，不得静默重设基线。
- 自动间隔仍按当前 chat.length 原始楼层计数，新增支持 event_types 宿主命名；缺少 Web Locks 时每项显示不可用，不启用无锁替代方案。付费请求前持久化、聊天隔离、失败退避不变。旧档案基线不一致可记录唯一白名单 failureCode=RMT_ARCHIVE_PREFIX_CHANGED 并显示固定提示，不记录异常原文或聊天。
- Room 必需宠物必须有同一物种、同一有界分句的所有权证据；不能把泛词“宠物”或别句动物画、职业、他人宠物当成必需物种。原 no-front-face、真实历史与宠物校验仍在。
- Travel 初次 1～8 个已验证地点即可，不要求 near/far 各固定数；无有效地点固定安全错误、保留旧结果。不改本地地图/对白/明信片结构，缓存重开允许一站，缺少近/远范围显示简短空状态。
- Room/Travel 复用已有显式选书只读入口，将目标档案的非历史设定世界书放进同一受控上下文；不恢复 detached context 的宿主 dry-run，不读取当前 B 的选择/Persona。live 读取前后核对角色/聊天/选择/lifecycle，缺失条目或超限明确失败，不能部分冒充完整。选书合计与 dry-run 不超过 16000 字符，且整段所选设定必须完整保留于本地 32000 字符合并证据中，否则请求前停止。
- 新生成禁词仅对 Room pets[].sourceEvidence、visualProfile.explicitEvidence 及 Travel locations[].sourceSettingEvidence 的受控逐字短引文作有限豁免；普通台词、伪造引文和其他路径不豁免。
- TT 样式修复仅限插件自己的设置字段与复选标签：自然高度、文本换行、移除覆盖文字的伪元素，保留可点击控件。r53 语义纸色/正文对比/设置折叠保留，不修改 TT 或用户主题。
- 本轮 TT 源码核对固定提交 9693a4ec47cd4552f90878bccab453f176de0f18；旧窗口化版本、用户自定义主题及真实移动 WebView/模型仍需实测。源码由主 agent 修改，独立 reviewer 只读。

## r53 当前增补契约（覆盖下方旧版固定数量约束）

- 初始 Butterfly 数量唯一由 core/butterflyContract.js 的 buildButterflyPlan 决定：有效且去重的 Mxxx，至少有一个与 MAIN 证据规则一致的双字符以上标题/锚点；summary 单独不计。普通分歧数 ceil(n/3)，最多 8 个，加 MAIN 与唯一末项 Ω，总计 3～10。无可用锚点在请求前停止。
- 提示词、槽位和进度共享计划；最终 expectedAxes 必须长度和顺序精确匹配。MAIN 来源、普通节点具体 worldSpec/独白/去重/关系安全、Ω 既有汉字与三类实际变化条件保留。少分歧时 Ω 综合已生成 worldSpec 的不同变化字段，不虚构额外世界。
- 数量策略只用于新生成，不对保存会话重算或裁剪。旧十节点直接读取，后续仍按原增量链路追加并保留历史 Ω，不推进正式事实。没有修改存储版本或删除数据。
- 同一主题服务分出结构卡片、黄/蓝便签、粉备注、紫随笔、暖纸页；纸张使用固定本地 HEX 与独立安全 ink。主页面不透明，卡片 alpha 不作用文字；受控装饰混色检查端点和采样中间色，自定义极端配色退回安全表面。
- 设置 API/标签/主题/自动更新/记忆来源原生 details 默认收起。展开不重建输入、不清草稿；档案与更新入口保留。专门点击 bootstrap 配置 API 时只自动展开目标 API 区。
- 本轮没有继续柏宝绘接入、运行朋友建议新玩法、自动发布、修改第三方插件。代码由主 agent 统一修改；独立 reviewer 只读审查。

## r52 当前增补契约

- 初次 Butterfly 使用本地计划槽位顺序请求（r52 固定十槽已由 r53 自适应计划替代）；每槽独立有界修复，Ω 使用已校验前节点的有界内容，最后全量完整性校验才提交。成功槽在本轮内保留，不宣称刷新页面后仍可续跑。增量沿用较小的 1–3 分歧加 Ω 请求，不删除旧节点。
- Room 当前邀请与观察独立识别；具体文字路径、本地 spaces / pets 分组补齐，两个分组可依次修复且每组最多一次有界修复流程。未完整通过校验不覆盖旧房间。增量只接收有新增 Mxxx 精确锚点的新增物件 patch，不要求模型回传原始旧正文。
- User 实际台词单独给气泡；短“我说/我问/我答”插叙可保留已明确主体，动作独立。未知人物或换主体不得承接 char/user 气泡。明确拆开的第三方恋爱不因“我们”续句而放行。
- 私人终端成为独立档案入口，PHONE v4 和草稿键不变；返回档案，不依赖房间先生成。删除/重建房间只级联 ITEMS，不删 PHONE。有效终端草稿优先续写，自动档案同步遇到未完成终端草稿先暂停。
- 按楼层自动更新是用户明确授权后的例外：默认全部关闭，只在已有正式档案的当前单角色聊天工作。每项可设 1–1000 楼；每条消息算一楼，编辑不加楼。首次启用/改变规则从当前楼数起算，不追溯补跑；规则全局保存，检查点按角色/聊天隔离。归档与派生模块是独立开关，允许只扩写派生内容。
- 自动调度只有 core/autoUpdatePolicy.js 一个资格/去重实现，core/autoUpdates.js 负责宿主事件与调用现有入口。使用同源 Web Locks 和持久楼层检查点，缺锁停用自动更新。检查点键 heartbeatMemoriesAutoFloorsV1 仅含模式、楼数、状态、规则签名和档案 revision，不含聊天正文或凭据。
- 自动任务串行，手动生成/保存忙碌时等待；真正请求前记录尝试，忙碌竞态未请求则恢复资格。失败不紧循环重试，等下一间隔。档案同步失败阻断后续模块；检测到已确认的新正式 revision 可解除失败阻断。规则变化不销毁其他正在运行模块的成功登记。
- 关闭弹窗不是关闭自动开关；页面关闭/插件禁用不会新发请求，迟到结果仍受原生命周期、revision、CAS 与 delete fence 约束。自动同步不打开 UI、不切换聊天、不把当前 B 内容显示到 A 快照。
- 明确持久化自动开关开启时，bootstrap 可以加载完整 runtime 执行本聊天已授权任务；默认关闭和性能诊断仍保持惰性、零 provider。自动任务不生图、不 TTS、不写主聊天、不运行未来建议、不自动更新插件代码。
- 内置更新仅由用户点击触发：确定自身安装文件夹，走固定同源 discover/version/update，校验已核定项目 Git remote；不 reset/reinstall、不绕过管理员权限，不自动刷新页面。非 Git ZIP 安装提示手动覆盖，未代用户发布仓库。
- 主题在原四模式之外新增 gs1/gs2/gs3/gs4 原创色板，仍共用本地主题服务与 4.5:1 正文对比保护。没有复制 GS 游戏图片、字体、Logo 或商业 UI。
- 柏宝绘标签接入等待获授权仓库 URL 与消费者协议；本轮无未知 DOM、假聊天、私有 API/key 桥接。朋友建议仅见 FEATURE_DECISIONS-r52.md，没有隐式启用。

## r51 反馈修复契约

- Room 的独立字段分别检查既往历史，字段内部跨句检查保留；normalizer、四时段重开、最终物件显示均需一致。
- Butterfly 初始、增量、单节点提示引用同一份本地完整性契约。只回传固定错误分类，不能把异常 message 或来源正文放入校验反馈；原完整性、唯一性、关系与来源规则不减。
- 对话生成与旧缓存显示使用同一保守拆分器。动作独立，明确 user/NPC 不归入 char；未知归属显示中性旁白，不改缓存原文。无法从旧内容恢复的信息不得猜测。
- 脚本使用统一的 120 行 / 50400 字符上限，拆分后再次规范化不得按旧输入行数裁切。新生成超限拒绝，旧缓存超限显示明确限额说明并保留原文。
- 日间保留白色卡片与柔和色彩，正文正常字重，主要卡片留白。跟随宿主仍仅读取标准颜色；不运行生成代码。
- 用户指定逻辑任务上限改为 10；provider 请求仍最多 2，并保持已有串行提交与生命周期围栏。

## r50 用户反馈新增契约

- 正式记忆不变也可主动扩写派生内容；同一锚点的新正文用本地扩写身份去重。除 r52 用户逐项授权的楼层任务外不得自动扫描新聊天；不得推进双方感情、解锁旧锁定结局或冒充新历史。旧记录和图片保留，达到单模式内容上限仍停止。
- 庭园同时显示设定人物与剧情关系，证据层级分开。设定人物只来自目标档案明确勾选的非历史世界书及匹配 world/uid/逐字原文；不得读取当前另一聊天的勾选项。读取不完整不覆盖旧会话。
- 陈列柜只使用正式 Mxxx 中可核实的具体物件与两人关联，保留逐字证据；空结果合法。本地 SVG 仅作物件类别示意，不冒充真实照片。
- 主题含 default（日间）、night（夜间）、host（标准计算背景/文字）、custom。所有结构卡片共享主题；场景插画保留本地艺术配色。禁止读取第三方美化插件私有变量/状态或执行模型样式。
- 输入标签过滤扫描最近 500 条、最多 256000 字符；最多保存 32 个排除标签。支持嵌套、编码和未闭合块；只处理模型输入副本，不改持久化原文、fingerprint 或扫描范围，不执行 DOM。
- Room 校验失败允许原有上限内修复，固定安全原因码不回显私密源文。Butterfly 局部修复不能降低分歧维度、唯一性或关系安全。
- 分段并发上限 2，仍受 provider 全局 2 / 逻辑任务 10 限制。只复用同请求重试的受控上下文，不建立跨角色全局源缓存。

## 数据权威与世界线

- 每个聊天拥有独立正式档案；角色组资料与聊天世界线资料分开存储。
- 正式历史事实必须来自 live 当前聊天或已经验证、明确归属当前角色/聊天的外部历史来源。
- `sourceMemoryIds` 与 `sourceMemoryAnchor` 是派生历史事实的证据边界；Character Profile 不能授权一段“已经发生”的共同经历。
- 创建、增量更新与重建正式档案仍只针对当前 live chat。插件不得为非当前聊天偷偷扫描正文。
- 删除只删除 Heartbeat 自己的档案、派生缓存、来源账本或备份；不得删除或改写 SillyTavern 聊天正文和第三方插件数据。

## 通用记忆来源

- 原生适配只读取已登记、公开、只读且版本/能力可验证的接口。当前精确支持 SillyTavern `1_memory` 与柏宝书公开 API v1；公开 DTO 只取自有 data descriptor，不执行数组索引 getter。不得调用私有函数、DOM、metadata、IndexedDB、cache、settings、第三方 API Key，或枚举全局对象后猜测 reader。旧 EverMind 私有配置与实验全局 reader 均已退役，用户可显式导入历史。
- JSON、JSONL、TXT、MD、MARKDOWN 导入必须先预览角色/聊天归属与覆盖状态，并由用户确认其是已发生历史/摘要而非角色设定。
- 导入文本始终为 inert data。HTML、脚本、宏、URL 和提示指令不获得执行、网络或权限能力。
- 来源账本保存 provider/source/version/revision/coverage/hash 和有界原文；凭据与连接配置必须在预览、持久化和生成前剔除。遍历节点、记录数与总字符均有硬上限，fallback 不得绕过 8 MB 来源上限。
- 完整、部分、截断、失败必须显式显示；读取故障、缺失楼层或 returned/total 矛盾不得伪装成完整/空来源后覆盖旧完整基线。

## 持久化与恢复

- 正式档案写入遵循 copy-on-write、12 MB 上限、`archiveRevision`、CAS 与 delete fence。
- 派生生成完成后的顺序为：规范化结果 → 内存候选 → 压缩缓存 → 同源独立备份 → metadata commit；暂时失败可进入有容量/期限上限的 deferred commit。
- 每个 await 后重新验证角色槽、chatId、revision、mode fence、delete fence 与 runtime lifecycle。销毁后的旧任务不得再落盘。
- 同一 revision 下只允许身份一致且确实更新的独立备份补回 metadata；不同 revision、删除或重建一律不能复活旧缓存。
- 默认普通启动不打开 IndexedDB、不解压大缓存、不扫描聊天；完整 runtime 下的恢复仅限实际打开的档案或 r52 显式授权自动任务的当前聊天，不恢复无关档案。

## ArchiveTarget

- 只有用户在档案室明确选择的已存档案可成为 ArchiveTarget，且只用于派生内容生成。
- 请求前冻结 A 的角色/chat/archive/revision/cache fence/delete state、发起时 runtime lifecycle 和 A-only 上下文。用户切换到 B 后，A 请求可继续，B 可正常聊天。
- A 上下文不得包含 B 的正文、Persona、世界书、档案、缓存或新消息。B 的普通消息事件不得扫描、恢复或请求 A。
- 返回后重新读取 A 并执行 CAS。A revision 变化、增量更新、重建、删除、delete fence、同模式新任务或 lifecycle 变化都会使旧结果失效。
- 同模式 latest task wins；不同模式在各自 fence 下可以并存。UI 必须显示角色名、档案名与正在生成的模式。

## Connection 与错误边界

- `apiConnectionMode` 是唯一 transport 选择。Connection Profile 和 manual 具有独立配置指纹、epoch、模型缓存与保存模型回退，禁止跨线路静默回退。
- Profile B 只能使用 B 的 endpoint、Secret reference、named proxy 和模型信息；不能切换、复制或借用正文 A。
- 手动 API 只使用手动 endpoint/credential/model，并通过 SillyTavern 固定同源 `/status`、`/generate` 代理。远程带凭据地址要求 HTTPS，本机 loopback 可使用 HTTP。
- timeout、abort、401、403/HTML、429、5xx、network、invalid JSON、context limit 与 configuration error 必须分类；仅明确可重试状态允许一次有界重试。
- Heartbeat 的 toast/modal/status/console/error 不得包含 prompt、聊天、Persona、世界书、档案、Authorization、API key、Bearer token 或 provider response body。宿主自己的错误 UI 属于 SillyTavern 边界，不能宣传为 Heartbeat 已拦截。

## World Presentation

- `core/worldPresentation.js` 是 Room、Travel、Private Terminal 与 Calendar 表现层的唯一世界观决策，不是事实来源。
- 权威顺序：当前受控角色卡/激活世界书 → 与当前角色身份绑定且逐字复核的 Character Profile → 至少两段不重叠正式 real-chat 档案共识 → neutral。
- 世界观冲突、证据不足、电影/书本/屏幕/游戏/梦境/虚构/假设作用域或否定状态均不能升级表现。媒体作用域与可被明确正向纠正的否定作用域必须分开处理。
- 该服务只返回枚举、证据来源、证据 ID、置信度和稳定 hash；不得创建新职业、亲属、恋爱历史、共同经历或 NPC。

## 产品模式

- Album/CG 对白生成前扫描双方完整关系时间线，分别判断双方状态；单方心意不得升级成互相确认。
- Calendar 是角色自己的只读手账，界面不提供访客输入。每日 memo、todo、特别备注、随笔与旧数据按日期隔离。
- Holiday Card 只在当前日期存在精确、未否定的受控世界观节日时生成。卡片不得凭空补过去共同经历；模型只给受限 art direction，本地 renderer 生成有界、稳定 SVG。
- Room 不露正脸，通过受控发型/衣着/姿态/生活痕迹区分角色；帽子和宠物都要求当前角色的明确证据，模型宠物名称和台词不能反向授予所有权。受控设定明确某类宠物时，规范化结果必须至少保留该物种的一个有效节点，否则候选失败并修复重试。蓝图的设定字段只允许当下生活/稳定设定；提及用户后，每个分句都必须分别证明为有限当前态，“今天/现在”不能授权嵌套或相邻往事。既往共同叙事必须绑定 exact Mxxx，且可见文字包含该真实锚点。
- Relation Garden 点击 NPC 显示 NPC 对角色的视角；动态视角需要当前档案证据，不能冒充秘密。
- Travel 是档案内独立地图。近地点返回结构化对白；远地点返回符合世界观的 HTML + SVG + CSS + 文字纪念载体，模型不能直接提供标记、样式或路径。
- Private Terminal 根据世界观选择手机、终端、通讯器、册页或遗物等本地载体；聊天、记录、图库、音乐、联系人、文件使用不同信息结构，不复制商业软件 UI。
- Ending 回看彩蛋由本地代码提供至少四个交互触发点和实时反馈；模型文字只作为转义后的日志/独白，不执行模型 JS、HTML 或 CSS。
- 标签只用于有检索价值的内容层级，支持多选 OR、清除和当前会话状态保持；不复制兔子镜 storage/state/cache/命名或业务逻辑。
- 反查用户私人终端在缺少可证明隐私来源的 schema 前保持阻断，不生成真实联系人、前任、地址、账户、浏览记录或私密照片。

## DOM、模型与视觉安全

- 模型输出必须经过 JSON schema/normalizer 与本地 allowlist；从当前版本缓存重新打开时，Travel tone/mapTheme 和 Calendar status 等 class token 在最终 sink 仍要重新验证。模型不能决定 HTML、CSS、JavaScript、SVG/path、URL、class、事件、坐标、缓存键、写入路径或目标聊天身份。
- 动态文字写入 `textContent` 或先统一转义；不能执行模型提供的标记或代码。
- SVG 只使用代码拥有的 primitive、属性、复杂度上限与 deterministic seed。重新打开同一卡片/纪念载体必须稳定。
- 主题只支持本地枚举（含日/夜与四套 GS 灵感色板）、标准计算样式跟随宿主、自定义严格 `#RRGGBB` 与有界 alpha；不得读取第三方主题插件私有状态。alpha 只作用于卡片表面，主阅读底色与文字保持不透明，文字对固体和合成卡片背景都需满足 4.5:1。关键背景、文字、按钮、输入框和横排结构必须以插件自身选择器抵抗普通宿主 CSS 污染。

## 性能与移动端

- lazy bootstrap 保持：普通启动不扫描长聊天、不读世界书、不枚举连接、不打开 IndexedDB、不解压缓存、不调用模型。
- 默认普通 MESSAGE 事件不扫描完整历史、不重建角色资料、不恢复其他档案、不发 provider 请求；r52 显式开启的楼层任务仅在满足当前聊天阈值与资格后调用原生成入口。
- provider 并发不超过 2，逻辑主任务不超过 10；所有请求有 timeout、abort、epoch 与 stale-result discard。
- 320 / 375 / 390 / 430 px 不应横向溢出，主要触摸目标适合 iPhone；界面不堆玩法说明，只保留必要标题、内容、状态、操作、简短错误与风险确认。

## 发布门槛

- 必须完成本轮定向回归、完整测试、全部 JS/MJS 语法检查、runtime 连续两次确定性构建、差异安全复核、最终 ZIP 新鲜解压复测、文件清单/CRC/SHA-256 与身份核对。
- Critical / High / Medium 安全问题未关闭时不得封候选。
- 自动测试不能替代 iPhone + TT + 实际 SillyTavern。未执行的杀进程、WebView/IndexedDB、Cloudflare 老聊天、safe area、主题污染、调色触控、各视觉面和 A/B 真聊天必须列为“尚待真机验证”。
- 本轮仅授权本地工作副本和新 ZIP；不得 commit、push、建 branch/PR/Release 或修改远端。
