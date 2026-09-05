# Heartbeat Memories Project CURRENT

> r49.0 重建说明：用户指定的 r48 基线压缩包及本轮工作区中未包含同名 CURRENT 文件。本文件不是对缺失旧文件的转录；它依据 r48 实际生产代码、`ARCHITECTURE.md`、`SECURITY.md`、本轮需求与 r49 已验证实现重建，自 r49.0 起作为当前契约。

## 当前候选

- 产品名：心跳回忆
- version：`0.8.45`
- BUILD / runtime cache-bust：`0.8.45-deep-review-r49.0`
- 正式档案 key：`heartbeatMemoriesArchiveV3`
- 派生缓存 key：`heartbeatMemoriesTheaterV3`
- 压缩格式：`gzip-base64-v1`
- Calendar / Phone / Room / Travel session：v6 / v4 / v3 / v4
- SillyTavern 最低版本：`1.18.0`；一键配置入口明确标注 `1.1.18`

V3 metadata key 为旧档案兼容边界，不随发布版本改名。浏览器加载 r49 runtime 由 manifest 与 index 中一致的 BUILD query 隔离，不能继续命中 r48 bundle。

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
- 普通启动不打开 IndexedDB、不解压大缓存、不扫描聊天；恢复只在完整 runtime 和用户实际打开相关档案路径发生。

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
- 主题只支持 Heartbeat 默认、标准计算样式跟随宿主、自定义严格 `#RRGGBB` 与有界 alpha；不得读取第三方主题插件私有状态。alpha 只作用于卡片表面，主阅读底色与文字保持不透明，文字对固体和合成卡片背景都需满足 4.5:1。关键背景、文字、按钮、输入框和横排结构必须以插件自身选择器抵抗普通宿主 CSS 污染。

## 性能与移动端

- lazy bootstrap 保持：普通启动不扫描长聊天、不读世界书、不枚举连接、不打开 IndexedDB、不解压缓存、不调用模型。
- 普通 MESSAGE 事件不扫描完整历史、不重建角色资料、不恢复其他档案、不发 provider 请求。
- provider 并发不超过 2，逻辑主任务不超过 5；所有请求有 timeout、abort、epoch 与 stale-result discard。
- 320 / 375 / 390 / 430 px 不应横向溢出，主要触摸目标适合 iPhone；界面不堆玩法说明，只保留必要标题、内容、状态、操作、简短错误与风险确认。

## 发布门槛

- 必须完成本轮定向回归、完整测试、全部 JS/MJS 语法检查、runtime 连续两次确定性构建、差异安全复核、最终 ZIP 新鲜解压复测、文件清单/CRC/SHA-256 与身份核对。
- Critical / High / Medium 安全问题未关闭时不得封候选。
- 自动测试不能替代 iPhone + TT + 实际 SillyTavern。未执行的杀进程、WebView/IndexedDB、Cloudflare 老聊天、safe area、主题污染、调色触控、各视觉面和 A/B 真聊天必须列为“尚待真机验证”。
- 本轮仅授权本地工作副本和新 ZIP；不得 commit、push、建 branch/PR/Release 或修改远端。
