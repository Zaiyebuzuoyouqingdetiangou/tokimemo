## 0.8.10 archive-ending-r15

- 只读历史档案新增“只读查看”开关。默认保持只读；关闭时先明确询问是否切换到该档案对应聊天，切换本身不会自动生成任何内容。
- 只有显式关闭只读、并且 SillyTavern 成功进入同角色/同 chatId 的真实聊天后，才恢复重新生成、CG 绘制、ADV 补齐等写操作；每次“重新生成”继续使用独立二次确认。
- 关闭只读属于用户主动导航，不再是档案浏览的隐式副作用；跨聊天任务进行中时禁止关闭只读，避免后台结果被重定向。
- ENDING 新增“告白回看”分页：从当前手动档案中检测已经真实发生的真心告白、双向告白、友情告白、间接告白、关系确认、未被接受告白等；不要求凑齐类型。
- 告白回看与未来 ending confession 严格分离：每条回看必须有真实 sourceMemoryIds + sourceMemoryAnchor；无证据时返回空列表，不凭空制造过去告白。
- 告白回看的场景/告白文字标明为档案式演出重构，不宣称逐字复现聊天原文；{{user}} 的回应只允许摘要已经归档的结果。

## 0.8.10 cg-ui-r14

- CG 生图入口不再藏在详情深处：回忆相簿每张已解锁 CG 卡片右下角直接显示“🎨 绘制 / ↻ 重绘”。
- CG/ADV 详情顶部新增 CG 实图状态条，明确显示 SillyTavern Image Generation 是否已检测到；绘制按钮提升为第一主操作。
- 从全角色档案馆打开的条目如果正好就是 SillyTavern 当前已打开的同角色、同聊天档案，则直接使用 live 当前档案，不再误标为只读；不会触发角色或聊天切换。
- 真正的其他历史档案继续保持只读，不能从 snapshot 发起生图、重生成或缓存写入。
- 保留 r13 的增量档案、派生缓存迁移、ADV 批量失败人工选择以及只读跨档案浏览边界。

## 0.8.10 r12 — CG Image Generation 适配

- 回忆相簿与 CG/ADV 事件新增显式“绘制CG / 重绘CG / 恢复抽象CG”。没有实图时继续使用原有抽象 CG；绘制成功后同位置用实图覆盖。
- 只复用 SillyTavern 已注册的官方 `imagine` 图像生成命令；不直连 Stable Diffusion / ComfyUI / NovelAI / OpenAI 等 provider，也不读取任何生图 API Key。
- 绘制前始终提示可能消耗算力/额度/付费点数；默认不会自动批量绘制。`quiet=true`，因此心跳回忆绘图不会向聊天正文额外发送图片消息；`gallery=false` 避免强制写入角色 Gallery。
- CG/ADV JSON 新增纯视觉 `imagePrompt`，只允许角色可见外貌、服装、动作、场景、构图、时间与光线；旧 r11 缓存没有 `imagePrompt` 时会从已有 `desc/cgDesc + visualSeed` 本地构造，不要求重新生成档案。
- 生图插件返回值只接受 SillyTavern 当前同源的本地图片路径；拒绝 `data:` / `blob:` / 外站 URL。缓存只保存短 URL、视觉 prompt、provider 标记与时间，不保存 base64 图片。
- 图片加载失败时自动露出下方原抽象 CG；更新档案/重新生成相簿或 CG/ADV 时，旧实图引用随派生缓存一起失效，但不会主动删除 SillyTavern 已保存的图片文件。
- CG 图片生成完成前后继续校验原 `chatId + archiveRevision`；切换聊天或销毁插件后，迟到图片不会写入别的档案。

## 0.8.10 r11 — 多来源记忆 / 摘要适配

- 档案室将“蝴蝶效应”固定放在主入口最下方；桌面端也单独占最后一行。
- 公开记忆插件兼容从单一 `getInjectedHistory()` 扩展为安全探测 `getInjectedHistory` / `getCurrentChatMemories` / `getCurrentChatMemory` / `getCurrentChatSummary` / `getCurrentSummary`。
- 新增当前窗口提示注入摘要适配：仅扫描名称明确包含 memory/summary/摘要/总结等语义、且不是世界书/角色卡/作者设定的注入项。
- 新增当前聊天 metadata 摘要适配：只读取摘要/记忆相关键，并且只递归白名单内容字段，避免把任意设置或凭据当作记忆。
- 世界书、角色卡、作者设定继续仅作为生成时的设定上下文，不自动导入为“已经发生的聊天事实”。
- 公开 API 发现继续避免执行全局 getter，并进一步避免通过访问器探测第三方 API 方法/名称。

# 0.8.10 confirm / current archive r10

- 所有会覆盖现有生成内容的“重新生成”入口增加显式确认，取消不会启动请求。
- “更新今日生活”增加覆盖确认。
- 恢复并强化“生成 / 更新当前窗口档案”：设置面板、档案室首页、当前档案页均有明确入口。
- 更新当前窗口档案前明确提示：成功更新会使旧 archiveRevision 对应的 CG / ADV / 房间 / 蝴蝶效应 / ENDING / 储物 / 私人终端派生缓存失效。
- 首次生成当前窗口档案也有非破坏性确认，避免误触触发长时间档案整理。

## 0.8.10 ending / epilogue r9
- 私人终端 Gallery 改为纯文字照片档案：删除世界书 URL 扫描、`imageUrl` 字段、外部图片预览 DOM 与点击加载逻辑；保留 imageCaption / detail 的照片描述。
- 档案室新增独立 `ENDING / 后日谈` 主入口，和 CG/ADV、房间、蝴蝶效应一样单独请求、单独缓存。
- ENDING 至少生成当前路线、恋爱、羁绊、开放 4 类路线；`available` 只代表当前档案是否具备进入条件，不代表结局已经发生。
- 当前关系摘要本身也要求真实 `relationshipSourceMemoryIds + relationshipSourceMemoryAnchor`；每条结局路线继续要求真实档案锚点作为未来推演起点。
- 恋爱证据不足时恋爱路线保持未解锁，只显示解锁提示；证据足够时才生成完整恋爱终章。所有已解锁路线都包含 3+ 段后日谈。
- 结局/后日谈永远作为未来路线推演展示，不写回聊天档案，不替 `{{user}}` 发明未来回应。
- 档案室主入口总数更新为 5；移动端继续沿用 r8 的单列紧凑布局与返回上级行为。

## 0.8.10 butterfly semantics r7
- 修正蝴蝶效应“观测点 Ω”语义：Ω 不再被当成额外平行世界，而是现世 {{char}} 看完全部平行世界后的最终观测点。
- 普通平行节点继续要求由该世界的 {{char}} 本人第一人称发言；现世反应保留在 intervention，明确区分两个说话者。
- Ω 强制 `id=OMEGA`、`monologue=""`，只保留现世最终发言与系统结论；最终发言需综合多个前置分歧，而非只回应最后一个世界。
- Ω 本地归一化不再要求 100 字平行体独白，并主动清空 Ω 的 monologue/sourceMemoryIds，防止把模拟平行体误当成现世证据。
- 渲染 Ω 时移除“PARALLEL SUBJECT / 平行体独白”区块，改为“CURRENT WORLD SUBJECT / 现世最终发言”；旧 r6 缓存也会按新语义显示。
- 仅修改蝴蝶效应 prompt、归一化、渲染和缓存键；手机档案室、头像、移动 UI、CG/ADV、房间、储物、私人终端逻辑不变。

## 0.8.10 mobile UI r6
- 手机档案室角色头像恢复为真正居中，不再因为角色卡直接使用 portal 容器而贴左。
- 手机档案室主内容入口从 2×2 大卡改为单列横向紧凑卡，减少拥挤与过宽感；生成按钮缩短。
- 手机角色档案列表使用 auto-fit 居中网格：只有一个角色时卡片居中，多角色时自动排列。
- 收紧手机档案摘要、顶部栏、间距与圆角；顶部“档案室”改为主页图标，给标题留更多空间。
- 仅修改移动端 CSS/展示 class 与资源缓存键；不改 r5 的手机打开逻辑、Prompt、生成、档案/证据校验。

## 0.8.10 mobile archive r5
- 手机云酒馆：撤销会干扰宿主手势的 touchend/pointerup/click 阻断式兜底。
- 在 touchstart/pointerdown 捕获阶段只观察、不阻断宿主事件，尽早打开档案室。
- 移动端使用原生 dialog.showModal() top layer，避免右侧设置抽屉/固定定位层遮住档案室。
- 打开失败时显示 toastr 并记录 console 错误，不再表现为“点了没反应”。

## 0.8.10

- Prompt-split r3: CG 相簿、CG/ADV 索引、房间、储物、私人终端、蝴蝶效应改为模式独立 prompt；不再给每个模式重复附带一整份公共长 prompt。
- 模式化档案载荷：CG/ADV 索引最多 48 条采样，房间/私人终端最多 24 条，蝴蝶效应主时间线锚点最多 16 条；单篇/批量 ADV 只发送对应 CG 已引用的 sourceMemories。
- 储物只发送 searchable 收纳物的轻量房间上下文和关联记忆；房间“今日生活”优先只发送房间对象已引用的记忆，避免重复整份档案。
- 批量 ADV 改用去重 `MEMORY_POOL_JSON`：事件只携带 `sourceMemoryIds`，同一档案记忆不会在多个事件里重复嵌入。
- 证据校验未放宽：模型仍只能引用实际提供且存在于当前 archiveRevision 的 sourceMemoryIds/sourceMemoryAnchor，最终仍由本地完整档案校验。
- Resource cache key changed to `0.8.10-prompt-r3` so mobile/cloud clients reload the prompt-split bundle instead of reusing r2.

- UI regression correction build: restored the complete 0.8.9.1 theater/settings/room/phone CSS as the visual baseline; only additive 0.8.10 styles remain.
- Resource cache key changed to `0.8.10-ui-r2` so browsers do not reuse the earlier broken 0.8.10 UI bundle.

- 性能：浏览相簿、房间、物品、终端、ADV 时不再因为选择状态反复压缩整份剧场缓存；缓存落盘防抖延长，关闭档案室会释放大 DOM。
- 性能：移除全屏和加载遮罩的 `backdrop-filter`，并尊重 `prefers-reduced-motion`，降低桌面和移动 WebView 的 GPU 压力。
- CG / ADV：CG 事件索引先整批生成，校验失败的条目逐条补；ADV 正文新增“一次请求生成全部”，批量失败/缺失后自动逐篇重试。
- 房间：常规空间提高到 5～8、最多 10；房间内同时保留普通可观察物与少量可翻找收纳物。
- 物品：只有盒、匣、箱、抽屉、柜、包、储物格等真实收纳物可进入翻找，且生成结果与当前房间/物件对齐。
- 私人终端：新增 phone/watch/terminal/communicator 设备形态；依据人设可表现儿童电话手表等设备，并按设备本地现实时间切换四个时段状态与未读数。
- 移动/云酒馆：用 document capture 级 pointer/click 兜底打开档案室，绕过部分移动设置面板对冒泡点击的拦截。

# Changelog

## 0.8.9.1

- Emergency startup/mobile performance hotfix.
- Removed automatic legacy theater-cache compression/migration from `CHAT_CHANGED` / `CHAT_LOADED`; ordinary SillyTavern startup and chat navigation no longer schedule `JSON.stringify -> gzip -> Base64` work.
- Legacy uncompressed generated content remains readable and is not deleted or forcibly migrated.
- Mount retry now retries only missing UI mounts; an already-mounted settings panel is no longer rebuilt every 500 ms while another mount target is unavailable.
- No archive schema bump. Existing `heartbeatMemoriesArchiveV3` archives remain compatible.

## 0.8.9

- 移除一键整套基础包生成；回忆相簿、CG/ADV 事件索引、他的房间、蝴蝶效应改为独立生成 / 重生成。
- 新增按任务 key 隔离的并行生成管理器，最多 4 项同时运行；同一入口不可重复启动，不同入口可以并行。
- 每个并行任务独立持有 AbortController 与 origin `characterKey + chatId + archiveRevision`，聊天切换不会把结果写入新窗口。
- 修复跨聊天并行完成时 deferred `sessions` 以 kind 去重导致后完成任务覆盖先完成任务的问题；现在按 mode 合并待写回 session。
- “他的物品 / 私人终端”继续只在“他的房间”内部出现；缺失时可从房间内单独生成，并可和其他入口并行。
- 档案创建/更新、记忆插件预读取继续保持档案级互斥，避免并行生成过程中 archiveRevision 被修改。
- 保留 0.8.8 的旧档案兼容、gzip 剧场缓存和长聊天进入性能优化。

## 0.8.8

- 档案 schema 与插件版本号正式解耦：继续沿用稳定 `heartbeatMemoriesArchiveV3` / schema v3，普通 0.8.x 升级不再把既有正式 v3 档案判成失效；未来若 schema 真的升级必须走显式迁移。只有用户明确“更新聊天档案”时才会生成新的 archive revision。
- 保留既有生成内容：扩展更新、初始化、聊天切换都不会删除档案或剧场缓存；手动更新聊天档案时仍会按证据 revision 主动失效旧派生内容，这是数据一致性行为，不是版本升级清档。
- 修复长聊天进入时 CPU / 风扇高转的主要存储放大器：原先完整相簿、ADV 长文、房间、物品、手机和蝴蝶效应全部作为深层对象塞进 `chat_metadata`；0.8.8 改为 gzip+Base64 压缩保存剧场缓存。普通聊天加载只解析一个压缩字符串，真正打开档案室时才解压。
- 旧版未压缩剧场缓存采用懒迁移：第一次进入旧聊天仍可完整读取，浏览器空闲时压缩并原位保存；后续进入同一聊天不再反复解析巨大的嵌套缓存。
- 解压后的运行时缓存只保留最近 3 个聊天窗口，避免长时间切换多个角色后把所有 ADV / 房间缓存常驻内存。
- 普通 `CHAT_CHANGED / CHAT_LOADED` 热路径在档案室关闭时不再维护档案 UI；400 层聊天的可用消息计数增加按 chat scope 缓存，消息变化时才失效。
- 保留 0.8.7 的跨窗口后台任务、全角色档案馆、记忆插件预读取和分源记忆配额。

## 0.8.7

- 档案室重构为“全角色 → 角色的聊天窗口档案 → 单窗口档案内容”三级结构。
- 每个聊天窗口继续保留独立 archiveName；新增轻量全局档案索引。
- 新增建档前“读取记忆插件”预读取按钮与读取统计。
- 公共记忆接口同时合并 `getInjectedHistory()` 与 `getSnapshot()`；扩大外部记忆扫描上限并分块整理。
- 最终档案上限提高到 240 条；聊天正文与当前窗口记忆插件采用分源保留配额，避免超长正文先填满上限后把外部记忆全部挤掉。
- 切换聊天窗口不再 abort 已发出的心跳回忆生成任务；结果按原 chatId 延迟安全写回。
- 合并 0.8.6.1 的聊天切换性能修复：档案一览不再自动 `metadata:true` 全量扫描。

## 0.8.6.1

- 修复 0.8.6 “档案室一览”造成的聊天切换卡顿：一览从 `/api/characters/chats` 的 `metadata:true` 改为 `simple:true`，不再为了列目录让 SillyTavern 逐行扫描当前角色的所有 JSONL 聊天。
- 同一角色切换聊天时保留一览缓存，只更新“当前窗口”标记与已访问档案的轻量摘要；不再在 `CHAT_CHANGED` / `CHAT_LOADED` 上清空缓存后重复拉全量列表。
- 将 `CHAT_CHANGED` / `CHAT_LOADED` / 消息事件触发的档案室重绘改为合并调度，避免在 SillyTavern 的 awaited chat-change 热路径里同步重建整页 UI。
- 档案室状态检查改为复用当前 archive/context，并用 `clone:false` 做缓存可用性判断，避免每次打开档案室对相簿/ADV/房间/物品/手机/蝴蝶缓存做 6 次 `structuredClone()`。
- 公开记忆插件发现增加 120 秒缓存；扫描 `globalThis` 时跳过 accessor getter，避免单纯检测接口就触发任意全局 getter。手动创建/更新档案时仍会强制刷新一次 provider 发现。
- 保留“一聊天窗口一档案”、聊天切换 allowlist、跨窗口异步丢弃、手动档案更新边界和 0.8.6 全部功能。

## 0.8.6

- 档案室主入口收敛为“回忆相簿 → CG/ADV → 他的房间 → 蝴蝶效应”；“他的物品 / 他的手机”改为“他的房间”内部深层玩法。
- 房间新增 PRIVATE ACCESS，可从当前私人空间继续翻找任意时代/形态的储物容器，或查看现代手机/非现代私人通讯终端；均可返回房间。
- 新增“档案室一览”：通过 SillyTavern 同源 `/api/characters/chats` 列出当前角色各聊天窗口的独立档案状态、名称、记忆数与更新时间；结果缓存并限制为服务端返回的聊天 ID。
- 当前窗口记忆桥接增加通用公开接口适配，参考已有项目的公开接口思路检测 `getInjectedHistory()` / 可选 `getSnapshot()`；仅在手动建档/更新时调用，并在异步前后校验 chatId，明确跨窗口返回会被拒绝。
- 蝴蝶效应恢复原始五区终端规格：锁定主时间线 + 8 个以上世界书/人设外延分歧 + TRUE ENDING；上方常驻分歧树，下方观测屏，1 秒信号干扰后切换；现世介入与底部冷酷系统评价分区呈现。
- 蝴蝶外延节点明确属于模拟平行世界，不再错误要求每个节点伪造真实记忆引用；只有主时间线必须用 `sourceMemoryIds + sourceMemoryAnchor` 锚定当前世界。每个平行体独白至少 100 汉字。
- 保留全窗口档案覆盖、后台减卡、240 条档案上限与共同回忆 6～8 段等 0.8.5 改进。
- 许可证继续使用 Source Available / Not Open Source《心跳回忆有限个人使用许可证 Version 1.1》。

## 0.8.5

- 长聊天档案整理改为全窗口覆盖优先：提高扫描/档案上限，超限时从整个窗口均匀采样而不是只保留近期。
- 档案扫描分批让出 UI 主线程，并减少固定分块的重复 token 化，缓解后台建档时整个 SillyTavern 卡顿。
- 回忆相簿“共同回忆”从 3 句浅评论提高到 6～8 段角色回想。
- 增加“他的物品 / 他的手机”结构化深层内容与证据校验；0.8.6 起这两项只从“他的房间”进入，不再作为独立档案室入口。
- 许可证升级为 Source Available / Not Open Source《心跳回忆有限个人使用许可证 Version 1.1》。

## 0.8.4

- 新增当前聊天窗口外部记忆桥接：仅在用户手动创建/更新档案时同步。
- 支持读取当前聊天的 SillyTavern `1_memory` 总结。
- 增加 EverMind 当前会话适配：只使用当前 chat metadata 的 `group_id`，不读取角色级 `char_group_id`。
- 外部记忆候选新增 provider record ID + `sourceExternalAnchor` 逐字证据校验，并限制为最多 64 条 / 约 30k 字符。
- 档案保存外部记忆来源计数与 fingerprint；外部记忆变化只有在用户再次手动更新档案时才进入新 archive revision。
- 档案室新增“当前窗口记忆插件档案补充”开关与上次同步来源提示。
- 新增 `LICENSE`：Tokimemo Proprietary Test License v1.0。本项目明确为专有测试软件，不采用开源许可证。

## 0.8.3

- 设置页进一步收敛为纯 API 面板：移除档案摘要、创建/更新按钮和四个玩法按钮，只保留连接/模型/Token/温度/每日生活请求控制。
- 新增独立“打开档案室”入口；扩展菜单也直接显示“心跳回忆 · 档案室”。
- 档案室改成头像式内容入口，只有已经缓存的项目可以点击查看；顺序固定为“回忆相簿 → CG/ADV → 他的房间 → 蝴蝶效应”。
- 未生成头像不再自动触发 API；新增唯一的“生成整套档案室内容”按钮，一次请求生成基础包并默认转入后台。
- 后台生成不再用全屏 loading 锁住档案室，也不再禁止浏览已有缓存；完成后仅刷新档案室状态，若用户正在查看已有内容不会强制把页面踢回首页。
- 设置页后台状态刷新降为轻量按钮文案更新，减少后台任务期间无意义 DOM 重绘。
- 受控上下文新增当前 `{{user}}` 的 Persona description，并把它传入世界书 dry-run 的 `personaDescription`，补齐 User 人设与相关世界书命中。
- 保留 0.8.1/0.8.2 的跨聊天写入保护、输入预算、记忆证据校验、Secret ID 边界与单请求基础包结构。

## 0.8.2

- 重做扩展设置页视觉，改为与心跳回忆剧场一致的蓝粉/奶白卡片语言；强制覆盖 SillyTavern `.menu_button` 的窄宽/书写方向，修复按钮文字被压成竖排的问题。
- 专用 Connection Manager Profile 与“模型选择”正式拆开：Profile 负责 API/URL/Secret，心跳回忆可以另外选择模型，不会修改主聊天模型。
- 新增“刷新模型”：通过 SillyTavern 自己的同源 `/api/backends/chat-completions/status` 读取模型列表，浏览器只提交 Connection Profile 中的 Secret ID 引用，不读取 API Key 明文。
- 首次进入任意基础入口时，改为一次模型请求生成完整基础包：蝴蝶效应 + 回忆相簿 + 他的房间；CG/ADV 事件索引直接由同一批已解锁相簿 CG 本地派生，因此四个入口共享同一套记忆事实与视觉事件。
- 长篇 ADV 正文仍在用户实际点开某事件时按需生成并缓存；“今日生活时间线”仍按日期独立生成，避免把每天变化的数据冻结进长期基础包。
- 生成界面新增“返回功能页 · 后台继续 / 关闭 · 后台继续”。离开弹层后请求继续，结果完成后写入当前聊天的安全缓存并以 toast 通知，不再强迫用户盯着 loading 页面等待。
- 档案整理、单项补生成、长 ADV、房间今日生活都补齐后台完成路径；后台期间设置页和功能页会显示/保持任务状态并阻止重复启动第二个生成任务。
- 保留 0.8.1 的跨聊天写入保护、宏隔离、记忆证据校验、输入预算与房间失败熔断。

## 0.8.1

- 修复“今日生活”缺失 `isPlaceholderText` 导致的运行时错误。
- 修复每日生活失败后每 30 秒无限静默重试；失败当天写入 fallback 并停止自动重试，保留手动刷新。
- session/cache 新增 `chatId` 绑定，所有生成回写校验 chatId + archiveRevision；跨聊天迟到结果直接丢弃。
- 聊天切换与扩展销毁时 abort 在途生成；档案更新中切聊天不再静默丢失后仍提示成功。
- 移除对整段生成 Prompt 的 `substituteParams`，仅安全展开 `{{char}}` / `{{user}}`，其余 ST 宏中和。
- `sourceMemoryIds` 增加 `sourceMemoryAnchor` 语义证据校验。
- 普通生成档案输入最多均匀抽样 48 条并压缩字段；最终输入增加约 32k token / 96k 字符硬预算。
- 档案分块整理复用同一受控角色卡/世界书 envelope，避免每个 chunk 重跑 dry-run。

## 0.8.0

- 移除“跟随酒馆当前 API”生成路径；心跳回忆固定使用一个 Connection Manager 专用连接。
- 新增“从酒馆当前连接一键导入”，仅引用 Secret ID，不读取 API Key 明文。

### 0.8.10 mobile/avatar r4
- Mobile/cloud archive opener now handles touchend, pointerup, and click through one guarded capture path.
- Archive index updates no longer erase a previously valid character avatar when a transient context exposes an empty avatar.
- Archive cards recover missing avatar metadata from characterKey/current SillyTavern character data and merge canonical character groups.


### 0.8.10 UX / phone r8
- ADV 正文阅读时，顶栏“返回”会先回到当前事件 CG，再返回当前档案。
- 手机顶栏将返回/主页/重新生成/关闭压成图标，标题使用省略显示，减少窄屏文字互相挤压。
- 房间页按“地点 → SPACE NOTE → 大图 → PRIVATE LIFE → PRIVATE ACCESS”重排；大图内物件改成编号点，文字移到图下，避免手机互相遮挡。
- ADV 手机端新增原生事件选择器与上/下一事件按钮，桌面保留事件索引。
- 顶栏新增返回上级：档案层级、四个主入口、相簿共同回忆、房间深层内容均可逐级返回。
- 私人终端恢复丰富 App 规格：社交、深度聊天、相册、备忘、日历、购物、浏览、联系人、定位与人设专属功能；列表→详情双层导航。
- 现代手机对核心 App 数量做本地硬校验（动态5/聊天5/相册8/备忘15/日历8/购物8/浏览5/联系人5/定位3/人设专属3），并要求至少 1 个联系人详情含 3 项字段；3 个聊天必须至少 12 轮。首轮缩水会自动完整重做一次；手表/通讯器仍要求至少 8 个入口与 48 个可读条目。
- 相册外部图床只在用户点击后加载；URL 必须逐字命中本轮已激活世界书中预先抽取的 http/https allowlist，并使用 no-referrer，模型编造的 URL 会被本地丢弃。

## 0.8.10 state-r13

- Fixed derived theater content appearing ungenerated after extension reload/login: the current runtime cache is preserved before destroy, compressed-cache read errors are surfaced instead of silently becoming an empty cache, and save compression debounce is shortened.
- Changed current-window archive update to append-only incremental update. Existing Mxxx IDs and previously generated Album/CG/ADV/Room/Ending/Items/Phone content are retained when the archived chat prefix is unchanged.
- Added explicit “完全重建档案” for the destructive full rescan/renumber path. Edited/deleted/reordered old chat messages cause incremental update to stop instead of silently rebuilding.
- Changed ADV bulk recovery: one bulk request runs first. Partial/failed results stop and present two explicit choices: retry failed items in one batch (1 request) or repair failed items individually (up to N requests). No automatic N-request fallback.
- Changed archive-library browsing to read-only metadata snapshots. Opening A/B archives no longer calls SillyTavern character/chat switching APIs, so browsing archives cannot trigger the host “chat is being saved” switch guard.
- Added read-only viewing of already saved derived sessions from indexed archives; generation/mutation actions are blocked in snapshot mode.
