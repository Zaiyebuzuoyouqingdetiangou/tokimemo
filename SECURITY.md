# Security Policy — 心跳回忆

## Trust boundaries

以下全部视为不可信输入：模型 JSON、聊天正文、角色卡、世界书、档案文本、Connection Manager Profile 显示字段、远端模型列表结果、房间/每日生活数据以及模型提供的 memory IDs。

必须保持以下不变量：

1. 模型输出只作为结构化数据解析，不作为 HTML / CSS / JavaScript 执行。
2. DOM 动态文本必须经过转义或使用 `textContent`。
3. “过去已经发生”的内容必须来自用户最后一次手动创建/更新的聊天档案。
4. 与 {{user}} 有关的既往物件、事件、CG、房间痕迹和每日生活旧痕迹必须有有效 `sourceMemoryIds`，并通过被引用记忆 `anchors/title` 的 `sourceMemoryAnchor` 证据校验。
5. 聊天新增、编辑、删除不会自动重写聊天档案；只有用户手动更新档案才改变档案版本。
6. 房间可以按现实时间自动变化，但不得借此读取尚未归档的新聊天。
7. 每日生活模型输出不得提供任意 CSS、URL 或脚本；视觉状态只能使用代码白名单枚举。
8. 心跳回忆不得实现自己的 API Key 明文存储或 Secret value 读取。
9. 一键导入酒馆连接只能读取配置字段和 Secret ID；不得把 Key 写入 extension settings、日志、DOM、Prompt 或错误信息。
10. 心跳回忆固定使用显式选择的 Connection Manager Profile；可保存独立 `modelOverride`，但不得修改用户主聊天的模型来完成心跳回忆生成。
11. 模型生成必须通过 SillyTavern 官方 Connection Manager Request Service。浏览器 `fetch` 只允许四个明确场景：硬编码同源 `/api/backends/chat-completions/status` 用于刷新模型；硬编码同源 `/api/characters/chats` 用于“档案室一览/手动旧档案扫描”；硬编码同源 `/api/chats/get` 用于读取用户点选的单篇历史档案；以及用户手动创建/更新档案时，经 SillyTavern `/proxy` 读取已启用记忆插件自己配置的当前聊天窗口记忆 API。任何模型输出都不得控制 fetch 目标 URL。
12. 模型列表刷新只可把 Profile 的 Secret ID 引用交给 SillyTavern 后端，由后端读取 Secret；浏览器端不得读取 API Key 明文。
13. 所有生成 session 必须绑定创建时的 `chatId` 与 `archiveRevision`；await 返回后重新校验，跨聊天或跨档案响应不得持久化。
14. 不对包含不可信档案/聊天正文的完整 Prompt 调用 SillyTavern 通用宏展开；仅允许本地展开 `{{char}}` / `{{user}}`，其余 `{{...}}` 必须中和。
15. 自动房间生活生成失败必须熔断当天自动重试；不得由定时器形成无上限 API 请求。
16. 生成输入在发送前必须执行字符/Token 预算；超限失败关闭。
17. 内容生成采用显式并行任务表，五个主入口最多 5 项同时运行；每个任务必须有独立 task key、AbortController、characterKey、chatId 与 archiveRevision。同一 task key 不得重复启动；准入统计必须同时覆盖已注册请求与正在构建的模式任务。
18. 后台生成完成时仍必须执行与前台完全相同的 chatId/archiveRevision 校验；关闭 overlay 不能绕过数据隔离。
19. User Persona 可以作为设定上下文和世界书 dry-run 的 personaDescription，但不得被当作“已经发生的共同往事”证据。
20. 档案室查看入口不得隐式触发模型请求；未生成主入口只能由其自己的显式“生成这一项”按钮启动。物品/私人终端只能从房间内部的显式生成按钮启动。

35. 各玩法 prompt 可以只携带与本模式相关的档案子集以控制输入长度，但这只是“减少模型可见证据”，不得降低本地 `normalizeMemoryReference` 对完整当前档案的 ID + anchor 校验；单篇/批量 ADV 只允许使用对应 CG 已经引用的 sourceMemories。
36. 储物深层 prompt 只允许收到房间中 `searchable=true` 的收纳对象及其关联记忆；不得为了缩短 prompt 而重新允许普通床、桌面、灯、照片等成为可翻找容器。

37. 私人终端 chat 的 `speakerRole` / `speaker` / `contactName` 都属于模型生成展示数据，不得控制身份、权限、缓存键、URL、命令或档案证据。新生成的 chat 必须可区分 `owner` 与 `contact` 两侧；UI 只用转义后的名字和文本渲染。
38. 模块化扩展更新必须避免同一运行实例混用不同发布版本的 ES module graph。r38 通过 build token 在版本变化时执行一次页面刷新后再动态导入运行时；该刷新不得修改聊天、档案或派生缓存。

39. 萤火虫栖息地属于派生追加约会会话库：旧光点只能由用户显式管理/重建删除，增量生成不得覆盖既有光点；新批次只在当前档案存在尚未消费的 Mxxx 时生成。模型不得控制光点坐标、CSS、URL 或动画。为避免长期累积造成移动端渲染退化，缓存最多 240 条且 UI 每页最多渲染 6 个发光节点，达到上限后停止追加而不是淘汰旧内容。新格式仅接受结构化 `title + script[]`，script speaker 白名单为 `char / user / user_thought`；`user` 只能表示非正史、中性、即时的展示性回应，不得创建用户偏好、承诺、决定、行动或历史事实，`user_thought` 最多一条且只能位于结尾。旧版 `line/thoughts` 光点只能在用户显式点击升级时改写其派生展示；升级必须保持原 id、颜色与来源/批次元数据，不消耗新的 Mxxx 覆盖游标，也不得写入或改写 `MEMORY_KEY`。

## Credentials

API 凭据由 SillyTavern Secrets / Connection Manager 持有。插件设置只保存 Connection Manager Profile ID、可选模型覆盖 ID、输出上限、温度和功能开关。

模型列表刷新向 SillyTavern 的同源后端提交 `secret_id`，而不是 Secret value。Profile 中的第三方 API URL 只作为后端状态请求参数，不会成为浏览器 `fetch()` 的目标地址。


## Current-chat external memory boundary

21. 外部记忆桥接只允许在用户显式“扫描记忆 / 摘要”预检或“创建/更新档案”流程中运行；CG / ADV / 房间（含物品/私人终端深层视图）/ 蝴蝶效应 / ENDING / HEART 不得直接读取外部记忆服务。
22. 每个 provider 必须绑定发起任务时的 `chatId`；任何 await 返回后如果当前 `chatId` 变化，数据必须丢弃/中止。
23. EverMind 适配器只允许读取当前聊天 metadata 中的 `st_evermind.group_id`；禁止读取或搜索 `char_group_id` / 角色级跨聊天记忆。
24. 外部 provider 凭据不得复制到心跳回忆 extension settings、chat metadata、日志、DOM、Prompt 或错误文本。对 EverMind 的现有明文 key 仅允许作为一次 `/proxy` 请求的瞬时 Authorization header；目标必须是 HTTPS，HTTP 只允许 URL 解析后的 `localhost`、`127.0.0.0/8` 或 `::1` loopback。
25. 外部记忆内容与 API 响应均视为不可信数据；进入心跳回忆档案前必须经过结构化模型抽取、真实 provider record ID 白名单校验以及 `sourceExternalAnchor` 逐字证据校验。
26. 外部记忆桥接必须有独立条数/字符预算，不得因为 provider 数据规模绕过主生成输入预算。

27. 第三方公开记忆 reader 必须由用户显式 opt-in，默认关闭。启用后只允许调用已加载插件主动暴露的 `getInjectedHistory()` / `getCurrentChatMemories()` / `getCurrentChatMemory()` / `getCurrentChatSummary()` / `getCurrentSummary()` 与可选 `getSnapshot()`；不得遍历其私有数据库、执行访问器 getter 或调用模型/记忆内容指定的函数。调用前后必须校验当前 chatId；若返回/快照显式携带的 chat ID 与任务 chatId 不同，整份来源拒绝。
28. 公开记忆接口返回的文本、nodes、coverage、revision 都是不可信数据；只允许进入外部记忆归一化与证据抽取链，不能进入 HTML/CSS/脚本执行面。
29. “档案室一览”只允许以 `simple:true` 请求 SillyTavern 同源 `/api/characters/chats`；“只读单篇旧档案”只允许请求同源 `/api/chats/get`。目标 chat ID 必须来自本地档案索引或本轮服务器返回的 allowlist。查看旧档案不得隐式调用 `selectCharacterById/openCharacterChat`、不得改变宿主当前角色/聊天，也不得把返回的正文复制到 Heartbeat snapshot、Prompt 或 DOM；手动旧档案 discovery 可继续按明确用户操作使用 `metadata:true`。
30. 蝴蝶效应外延节点属于显式模拟数据，不作为 archive evidence、不写回 `MEMORY_KEY`；取消外延 `sourceMemoryIds` 强制要求不得削弱相簿/ADV/房间实际既往事实的证据校验。
31. “他的物品 / 私人终端”保留独立内部 session 仅作为房间深层缓存，但不得暴露为档案室主入口；所有 basis=“记忆”的内容仍必须通过 `sourceMemoryIds + sourceMemoryAnchor`。
32. 房间内部的物品递归容器最大深度与总节点数必须受限；所有模型文本仍经过 `esc()`，模型不得提供 HTML/CSS/脚本。私人终端 Gallery 只允许纯文字照片档案，不接受或保存模型/世界书提供的外部媒体 URL。
33. 私人终端模型内容仅作为本地结构化展示数据；不得触发真实短信、邮件、联系人操作、设备 API 或第三方图片请求。相册不得创建 `<img>` 外部加载面。
34. 档案扫描允许跳过重复 token 化仅限于已经被保守字符上限约束的固定大小分块；字符预算仍必须在发送前执行，不能因此绕过总输入限制。


### 0.8.7 additional invariants

- Background results are bound to `characterKey + chatId + archiveRevision`; chat navigation must not retarget them.
- Deferred archive writes are applied only when the original chat is current again; archive imports also verify the usable message count before write-back.
- External memory is read only after an explicit per-chat preflight and only from the current chat scope; cross-chat provider responses remain rejected.
- The global archive index stores only lightweight metadata (character key/avatar/name, chat id, archive name, memory count, update time), never raw memory text.
- Legacy archive discovery using `metadata:true` is explicit/manual and never runs on normal chat navigation.

### 0.8.8 storage / upgrade invariants

- Plugin release version and archive schema version are separate concepts. A routine extension upgrade must not delete or invalidate a still-supported archive schema.
- The currently supported archive schema is V3. Future schema changes require an explicit migration path; unsupported unknown schemas must not be silently coerced.
- Derived theater cache stored in chat metadata may use the fixed `gzip-base64-v1` wrapper. Compression is a storage optimization only; chatId and archiveRevision isolation rules remain unchanged.
- Compressed chat metadata is untrusted input. Base64 input、pre-compression JSON UTF-8 bytes and streamed decompressed output are all hard-capped before parsing to reduce decompression-bomb / memory-exhaustion risk. 写入与读取共享同一 12 MB UTF-8 字节预算；manifest 的 `sourceBytes` 只供零解压诊断展示，不能替代读取时的真实 streamed cap。
- Ordinary chat navigation must not hydrate/decompress theater cache. Hydration is allowed only when Heartbeat actually needs generated content.
- Old uncompressed theater caches remain readable and are migrated lazily; migration must never delete the old durable value before a valid compressed replacement is ready for the same chat scope.
- Ordinary manual archive update is append-only/incremental: existing Mxxx memory records and IDs remain byte-for-byte evidence anchors, and compatible derived theater sessions may migrate only their archiveRevision fence. A full rebuild may invalidate derived theater cache because it is allowed to renumber/rewrite memory evidence. A plugin version update by itself may not clear the archive or theater cache.
- Decompressed runtime caches are bounded and evicted across chat scopes; they must not become an unbounded cross-chat memory store.


### 0.8.9.1 concurrency invariants

- Parallel generation is bounded to five logical content tasks. Admission counts mode-build reservations, active model requests, ADV bulk-recovery reservations, and CG/daily-strip image tasks; archive creation/update and external-memory preflight remain mutually exclusive with content generation because they can change archive evidence/revision.
- Task identity is scoped by chat for mode generation. A mode running in chat A must not mark the same mode in chat B as running or prevent B from rendering its own cached content.
- Deferred `sessions` commits for the same origin chat must merge by mode instead of replacing the entire deferred sessions batch. Concurrent completion of album/room/butterfly/ADV must not drop previously queued modes.
- Full CG/ADV index regeneration must not race a concrete ADV-body request in the same chat; only one concrete ADV body may run per chat at a time.
- Room daily-life generation must not race replacement of the room base session. If capacity is full or room base generation is active, daily-life generation waits/falls back without overwriting a newer room session.
- Closing the Heartbeat overlay or navigating to another chat may hide the UI, but must not retarget active tasks. Extension destruction must abort every active controller, advance the runtime lifecycle epoch, clear transient caches, and prevent in-flight gzip/gunzip/network work from writing metadata or repopulating runtime state afterward.


### 0.8.10 UX / phone r8 additional invariants

- “返回上级”只能改变插件本地视图层级，不得更改 `chatId`、`archiveRevision`、任务 origin 或把后台结果重定向到其他聊天。
- 房间移动端重排只改变 DOM 展示顺序；SPACE NOTE / PRIVATE LIFE / PRIVATE ACCESS 中引用的房间对象、记忆 basis 与证据校验仍来自同一已归一化 room session。
- ADV 手机选择器只能从当前 `session.events` 的现有 ID 中切换；不得从 DOM/select 值创建新事件或更换档案作用域。
- 私人终端扩容不会放宽共同历史边界：凡是声称 `{{user}}` 与 `{{char}}` 已发生的聊天、合照、纪念日、订单、约会或共同事件，仍必须 `basis=记忆` 并通过完整当前档案的 `sourceMemoryIds + sourceMemoryAnchor` 本地校验。
- r9 起私人终端相册不再接受外部媒体 URL；Gallery 仅保存和渲染转义后的文字照片描述。

### 0.8.10 mobile close r32 additional invariants

- iOS 安全区适配和移动端触摸兜底只能改变插件 overlay 的布局与关闭时机，不得更改 `chatId`、`characterKey`、`archiveRevision`、任务 origin 或后台结果写回目标。
- 早期手势拦截必须严格限定为代码自带的 `.rmt-topbar > button[data-rmt-action="close"]`；不得拦截 document 全局触摸、宿主侧滑手势、模型文本或档案内容生成的任意元素。
- 关闭手势必须阻止同一次点击穿透到 overlay 背后的 SillyTavern 控件；重复的 pointer/touch/click 序列必须保持幂等，不得重复取消或重定向后台任务。


### 0.8.10 ending / epilogue r9 additional invariants

- ENDING 是派生的未来路线模拟 session，不得写入 `MEMORY_KEY`，不得反向修改正式聊天档案或把未来推演当成已发生事实。
- `relationshipState/relationshipSummary` 必须有真实 `relationshipSourceMemoryIds + relationshipSourceMemoryAnchor`；每条 ending 也必须有真实档案锚点作为路线起点。
- `available=true` 只表示当前档案具备该路线的进入条件；UI 必须持续标注“未来路线推演”。未解锁恋爱路线不得预先展示完整恋爱终章/后日谈。
- 若角色/用户为未成年人或低龄设定，恋爱路线只能生成年龄适当的非性内容；成人承诺必须明确发生在双方成年后的未来。
- Gallery r9 禁止模型/世界书 URL 进入结构化输出与 DOM；不得从相册创建新的浏览器第三方网络目的地。

### 0.8.10 confirmation / current archive r10 additional invariants

- 任何显式覆盖已有状态的操作必须经过用户确认；确认取消时不得创建请求、修改 session 或改变 archive revision。r30 的普通内容按钮是非破坏性的增量追加，也必须由用户显式触发，并且不得借该入口覆盖旧集合。
- 普通“更新当前窗口档案”必须说明它是增量追加：只处理上次归档后的新聊天/变化的当前窗口摘要，保留既有 Mxxx ID 与已生成派生缓存。只有用户显式选择“完全重建档案”时，确认文本才允许说明旧派生剧场缓存会失效。首次建档、增量更新与完全重建都仍然是用户显式动作。
- 确认 UI 不得接受模型生成 HTML/URL；确认标题与说明全部来自本地固定字符串。
### 0.8.10 CG image generation r12 additional invariants

- CG 实图生成只能由用户显式点击“绘制CG / 重绘CG”触发；不得在打开相簿/ADV、切换事件或后台定时器中自动调用生图服务。
- 心跳回忆只调用 SillyTavern 已注册的 `imagine` 命令，不直连任何生图 provider、不读取 provider URL/Secret/API Key，也不探测其他扩展的私有生成函数。
- 送入生图扩展的内容只能是单张 CG 的纯视觉 `imagePrompt`（或 `desc/cgDesc + visualSeed` fallback）；不得发送聊天正文、M001 档案原文、世界书原文、记忆插件原文、私人终端内容或凭据。
- `imagine` 返回的图片引用必须归一化为当前 SillyTavern 同源的 http(s) 本地路径；`data:`、`blob:`、跨域 URL 和模型提供的 URL 均不得进入 CG 缓存或 DOM。
- CG 缓存只保存短路径、视觉 prompt、provider 固定标记和 generatedAt；禁止保存 base64 图片。加载失败必须回退显示原抽象 CG。
- CG 图片任务回写必须重新校验发起时的 `characterKey + chatId + archiveRevision`；插件销毁会推进本地 lifecycle epoch，使迟到的外部绘图结果无法写回已销毁实例。



### 0.8.10 state / archive r13 additional invariants

- 扩展升级、disable/clean/reload 不得把“内存中已经生成但 gzip debounce 尚未落盘”的当前聊天 theater cache 当作可丢弃数据；销毁前必须至少保留一个当前聊天可恢复的 metadata 副本。
- 压缩 theater cache 解压失败或浏览器缺少兼容解压能力时，UI 必须显示“缓存读取失败”，不得把该状态伪装成“尚未生成”并诱导用户覆盖重做。原压缩值保持不删除。
- 普通档案更新只允许在旧归档聊天前缀仍与旧 `sourceFingerprint` 一致时增量追加；若旧消息被编辑、删除或重排，更新必须停止并要求用户显式选择完全重建。
- 增量更新不得重新编号、删除或改写旧 Mxxx 记录；因此旧 session 迁移到新 `archiveRevision` 时只能修改 revision fence，不能放宽任何 `sourceMemoryIds + sourceMemoryAnchor` 验证语义。
- “完全重建档案”是唯一允许重新编号 Mxxx 并清空旧派生 theater cache 的档案更新路径，必须有明确破坏性确认。
- ADV 批量正文请求失败/部分成功后不得自动触发 N 个单篇修复请求。插件必须停止，并由用户显式选择“再次批量（一次请求）”或“逐个补完（最多 N 次请求）”。
- 跨角色/跨聊天档案查看使用只读 metadata snapshot。只读 snapshot 允许展示已保存的 Album/ADV/Room/Items/Phone/Butterfly/Ending session，但禁止生成、重绘 CG、更新今日生活、改档案或写回宿主当前聊天。
### 0.8.10 cg-ui-r14 additional invariants

- 档案馆索引条目只有在 `characterKey` 与当前角色一致、`chatId` 与当前聊天一致、并且当前 context 内确实存在该聊天的心跳回忆档案时，才能从只读索引入口退化为 live 当前档案。这个判断不能调用 `selectCharacterById` / `openCharacterChat`，也不能为了获得写权限切换宿主聊天。
- 相簿缩略图上的 CG 绘制快捷按钮只对 live 当前档案显示；历史 snapshot 继续禁止 `draw-cg` / `clear-cg-image`。快捷入口不得绕过原有用户确认、同源图片路径校验、`chatId + archiveRevision` origin 校验或单 CG 并发限制。


### 0.8.10 r15 read-only edit transition / confession replay invariants

- 历史档案 snapshot 默认只读。关闭“只读查看”只能由用户直接操作本地开关触发，并且必须再经过固定文本确认；模型输出、档案文本、世界书或 DOM 数据不得自动关闭只读。
- 从只读 snapshot 进入编辑模式允许显式调用 SillyTavern 的角色/聊天切换接口，但目标角色必须由本地档案索引的 avatar/characterKey 映射，目标 chatId 必须等于已加载 snapshot.chatId；切换完成后必须再次验证 characterKey + chatId + 当前 MEMORY_KEY，验证失败继续只读且不得生成/写入。
- 关闭只读只改变插件按钮可见性，不得导航宿主聊天或自动调用模型。任何“增量追加”仍必须经过独立确认，并继续使用原 chatId + archiveRevision task origin 防护。
- 有后台任务时禁止从 snapshot 关闭只读并切换聊天，避免旧任务完成后写入新的当前聊天。
- ENDING confessionReplays 仅表示已经发生的告白/关系确认回看，不是未来模拟；每条必须通过完整当前档案的 sourceMemoryIds + sourceMemoryAnchor 校验。无可验证告白时允许空数组，不得为了满足 UI 数量凭空制造过去事件。
- confession replay 的 scene/confessionText 是基于已归档事实的演出式重构，不得宣称为聊天逐字原文；对 {{user}} 的回应只能摘要已有档案结果，不得生成新的用户台词。
### 0.8.10 r16 HEART / reverse confession / daily-strip invariants

- `MODE.HEART`（头像问候、Voice Drama、四季 Scenario、日常一格）是派生模拟 session，不得写入 `MEMORY_KEY`，不得作为“过去已经发生”的 archive evidence。其 relationshipState/relationshipSummary 仍必须由真实 `sourceMemoryIds + sourceMemoryAnchor` 锚定。
- 点击档案室角色头像只允许读取已保存 HEART session；若目标不是当前聊天，只允许复用已允许的同源 archive metadata snapshot。头像点击不得自动切换角色/聊天、不得自动发起模型请求。缺少 HEART session 时只能展示显式“生成/打开档案”操作。
- 头像访问状态只允许在 extension settings 的 `heartbeatMemoriesAvatarVisitsV1` 中保存有界的 `characterKey -> lastVisitedAt` 时间戳（最多 240 项）；不得保存聊天原文、记忆正文、世界书、Secrets 或模型输出。
- 久未访问台词中的怨气/担心/吃醋属于模拟角色反应。吃醋不得演变成监控、威胁、限制 {{user}} 社交或宣称 {{user}} 与第三方已恋爱。
- Voice/Scenario 中 `speaker=user` 的内容必须在 UI 标注为“剧本中的你 · 非正史”，不得当成用户真实选择、档案事实或后续证据。
- “日常一格”生图只能由用户显式点击并确认后调用已注册的 SillyTavern `imagine` 能力；prompt 只包含经过清理的可见分镜，禁止聊天/档案/世界书全文、URL、宏和凭据。返回值继续只接受 SillyTavern 同源本地图片路径；不得接受外站 URL、data/blob URI 或把 base64 写入 chat metadata。只读 snapshot 不允许绘制/重绘。
- `reverse / 逆转告白` 仍是 ENDING 的未来路线模拟。只有本地归一化后的真实档案能够锚定强烈依恋与竞争/吃醋/错失时机/关系流失压力时才能 `available=true`；不得借此推断用户同意、第三方恋爱事实或写出强迫控制。



### 0.8.10 r17 archive-edit / confession-refresh invariants

- `activeArchiveReadOnly` is only a Heartbeat UI protection flag. Turning it off must never call `selectCharacterById`, `openCharacterChat`, or otherwise cause host chat navigation/refresh.
- An indexed archive snapshot remains non-authoritative for writes even when the UI read-only switch is off. Before incremental generation, CG drawing, ADV repair, room-life update, or isolated confession refresh, the current live SillyTavern context must already match the snapshot `characterKey + chatId` and contain the same `MEMORY_KEY` archive.
- Snapshot-derived sessions must never overwrite a missing/unhydrated live session. If the live derived cache for the selected mode is unavailable, the write fails closed and asks the user to open/hydrate the current-window archive first.
- Isolated ENDING confession refresh may replace only `confessionReplays` and its selection/view fields. It must preserve `endings`, `relationshipState`, `relationshipSummary`, recommended ending, epilogues, and HEART data; every replay still passes full archive ID + anchor validation.
- The global main-generation concurrency limit is 5 logical tasks. Admission counts both in-flight request tasks and mode-build scopes so rapid clicks cannot transiently exceed the limit.
- Image Generation availability may be re-detected from the registered local `imagine` command, but detection itself performs no provider request and grants no write authority. Existing CG prompt sanitization, same-origin result validation, explicit billing confirmation, and chat/revision origin checks remain mandatory.


### 0.8.10 audit-r18 additional invariants

- Archive-overview navigation is snapshot-only and must never call host character/chat navigation. Turning read-only off changes only Heartbeat UI state; actual writes still require an exact live `characterKey + chatId + MEMORY_KEY` match.
- Third-party public memory reader execution is opt-in and defaults off. Passive current-chat prompt summaries / metadata summaries do not require this permission.
- The five-task admission limit counts ADV bulk recovery and CG/daily-strip image tasks in addition to ordinary model requests; request send remains a second fail-closed capacity gate.
- Direct calls to registered SillyTavern Slash Command callbacks use only the public `NamedArgumentsCapture` contract. Heartbeat must not fabricate parser-private `_scope`, `_parserFlags`, `_abortController`, or debug-controller objects.
- Extension shutdown must not truncate or selectively discard derived theater modes to reduce metadata size. A large raw fallback may be warned about, but preservation takes priority until the compressed durable replacement is ready.
- Model-list refresh may forward user-configured `custom_include_headers` only to SillyTavern's hard-coded same-origin backend status endpoint, matching the host's connection configuration path; those headers must never be written into Heartbeat metadata, prompts, logs, or DOM.


### 0.8.10 r19 memory-related world-info invariants

- 普通世界书继续属于 setting-only，不得单独成为“过去已经发生”的证据。r19 的“记忆相关世界书”只是用户在**当前 live 聊天**显式选择的解释上下文，用来帮助理解真正的 current-chat 记忆/摘要。
- 选择只允许保存 `{book name, all|selected, entry UID list}` 到当前聊天 metadata；不得保存世界书正文到 extension settings、全局档案索引或日志，也不得修改、启用、禁用或重写世界书。
- 世界书名必须来自 SillyTavern `getWorldInfoNames()` 当前返回的 allowlist，读取只能经公开 `loadWorldInfo(name)`；模型输出、世界书正文、DOM 文本不得构造任意文件路径或网络目标。
- 整本/精确条目读取都受独立预算（最多 8 本、160 条、52,000 字符），随后仍受现有总输入 Token/字符预算。世界书正文视为不可信资料，其中的提示、宏、代码、格式指令不得执行。
- `MEMORY_RELATED_WORLD_INFO_CONTEXT` 不能提供 `sourceExternalId/sourceExternalAnchor`，不能单独生成 archive memory。外部记忆抽取仍必须引用真实 current-chat external record ID，并以 anchor 逐字命中该 record 的 content；若世界书与记忆/摘要冲突，以带真实 externalId+anchor 的来源为准。
- 记忆相关世界书选择是当前聊天级；历史 snapshot 不得修改它。修改选择必须清空本聊天的 memory preflight cache，下一次手动建档/更新前重新扫描。


### 0.8.10 r20 structured JSON / output-budget invariants

- 心跳回忆设置中的单次最大输出硬上限为 60,000 tokens；每个请求最终必须继续取 `min(用户设置, 请求上限)`，不得为了修复 JSON 截断而绕过用户设置或 provider/模型自己的限制。
- 档案聊天分块与 current-chat 记忆/摘要分块可以使用用户最大输出，但输入仍必须经过既有 32k-token / 96k-character 预算；提高输出额度不得放宽输入、证据或跨聊天边界。
- JSON 解析失败、空 final content、仅 reasoning、非 JSON 正文或疑似截断都属于**失败关闭**：在获得完整并通过本地归一化/证据校验的数据前，不得写 `MEMORY_KEY`、派生 session 或其它聊天 metadata。
- 对档案分块的失败重试必须由用户明确确认，最多只额外重试当前分块一次；不得自动循环重试、不得从头重放已经成功的分块来制造隐藏请求次数。取消或第二次失败时，本轮档案整理整体停止，旧档案与既有派生缓存不变。
- JSON/推理诊断只能记录错误类别与长度等非内容元数据；不得把模型 `reasoning`、模型正文、聊天/记忆原文复制进 console、toast、metadata 或错误遥测。


### 0.8.10 r21 archive-group / generated-language invariants

- 档案角色组是 extension-settings 中的**展示索引元数据**。自动分类、手动移动、新建角色组不得修改源 `chatId`、源 `characterKey/avatar`、`MEMORY_KEY`、theater cache 或 SillyTavern 聊天文件；不得调用宿主角色/聊天切换接口。
- 自动分类只能使用本地已知的角色名/avatar/角色卡内容指纹与当前 `context.characters` 做匹配；新索引可持久化非内容型 hash 指纹，旧索引缺失指纹时退回 avatar+名称并允许用户手动拆分。手动移动必须由用户直接操作，且手动归类标记必须阻止后续自动分类覆盖。无法唯一判断时宁可保留/要求手动处理，不得猜测后改写聊天。
- 角色组归属与 `characterFingerprint` 只属于展示/分类元数据，不得授予或撤销写权限。角色卡日常编辑可以改变分类指纹，但不得因此误删/误写档案。历史 snapshot 的生成/CG/更新仍必须由 live 当前聊天通过宿主角色 locator/name + `chatId` + 当前 `MEMORY_KEY` 校验；同 avatar 但不同角色名不得被当成同一 live 角色。
- 删除真实 Heartbeat 档案只允许针对当前已打开的 live 聊天：必须无后台任务、连续两次显式破坏性确认，并在实际删除前重新校验当前角色 runtime key 与 `chatId`。只能移除 Heartbeat 自己的 `MEMORY_KEY`/`CACHE_KEY`/运行缓存和对应轻量索引，不得调用宿主聊天删除/清空/切换接口，不得修改 `context.chat`。非当前历史档案只允许删除档案室轻量索引。
- 压缩缓存异步落盘在写入前必须重新验证 live `MEMORY_KEY` 仍存在且 `chatId/archiveRevision` 与待落盘缓存一致；显式删除档案或 revision 已变化后，迟到的 gzip 结果不得把旧 `CACHE_KEY` 重新写回。
- 运行中任务 origin/chat scope 必须能够区分共享 avatar 的不同角色卡，防止并发任务、延迟响应或 deferred commit 在角色版本之间串写。
- “生成禁用词”只适用于模型新生成的派生文本。不得改写聊天正文、正式 archive memory、世界书/外部记忆原文或任何 evidence anchor；命中禁用词时结果必须失败关闭、不得保存、不得自动重试。
- 房间视觉差异只能把归一化的 `spaceType/label` 映射到代码内固定 scene class 与布局变体；模型不得返回 CSS、HTML、URL、坐标脚本或任意样式值。房间布局变化不得扩大证据读取范围或触发额外模型/网络请求。

### 0.8.10 ENDING / album / Image Generation r22 additional invariants

- ENDING 分段只缩小每个模型请求的职责与输入范围，不降低证据边界：关系阶段和每条路线目录仍必须通过完整当前档案的 `sourceMemoryIds + sourceMemoryAnchor` 本地校验；未来路线正文仍是派生模拟，不写回 `MEMORY_KEY`。
- 分段 ENDING 的任一可用路线连续失败时，本轮不得覆盖旧 ENDING session；“已发生告白回看”分段失败可以保留上一份已归一化缓存或为空，但不得把失败/半成品当成新告白证据。
- 回忆相簿 `comments` 只是当下角色陪当下用户观看既有 CG 的派生对白；它不能创建新的过去事实，CG 的既往事件仍由相簿条目的现有记忆引用与锚点约束。
- CG 实图自动检测只允许检查 SillyTavern 已暴露的 `/imagine`、`/sd`、`/img` Slash Command callback；不得遍历任意第三方扩展对象、点击私有 DOM、导入第三方私有模块或直接调用其它 provider API。
- 自动检测到 callback 时继续直接调用 callback，不把视觉 prompt 交给通用 STscript 解析器。只有用户显式打开 `imageGenerationManualEnabled` 且 callback 自动检测失败时，才允许使用 SillyTavern 公开 `executeSlashCommandsWithOptions('/sd quiet=true ...')` 兜底。
- 手动 `/sd` 兜底的视觉 prompt 在进入 STscript 前必须再次中和脚本语法：删除 `{}` 宏花括号、折叠换行、转义反斜杠和管道；不得让模型生成的视觉文字变成额外 Slash Command、宏或管道阶段。

### 0.8.10 stable segmented generation r23 additional invariants

- Album / HEART / Phone 的拆分只改变模型请求粒度，不改变证据权限。任何 `basis=记忆`、相簿 CG、关系阶段仍必须由当前 live 档案中有效 `sourceMemoryIds + sourceMemoryAnchor` 通过本地归一化；子请求输出不能直接写 `MEMORY_KEY` 或独立成为 archive evidence。
- 分段生成在所有必需子段完成并通过最终 `normalizeAlbum` / `normalizeHeart` / `normalizePhone` 前不得调用 session commit。任一必需段失败时，本轮整体不覆盖旧 session；已经完成或仍在飞行的兄弟请求也不得单独提交。
- 每个并行子请求必须继承同一不可变 `origin`（character runtime key + chatId + archiveRevision），使用独立 task key，并继续通过全局 5 logical-task admission gate。并行 helper 首次失败后不得再调度新的兄弟请求；已经在飞行的请求允许自然结束，但结果在父任务失败后不得写回。
- ENDING 的目录、告白扫描和 route detail 可以并行，但 route availability 仍只能来自已本地归一化的 outline；route detail 只能填充对应 route id。任一路线连续两次失败时仍不得覆盖旧 ENDING。
- 私人终端的 device/app 目录不是证据。App 详情中 `basis=记忆` 的条目必须再次通过当前档案 ID/anchor 校验；watch/communicator 降低深聊数量/消息长度只是设备能力完整度调整，不得放宽历史证据或跨聊天写入边界。
- r23 不新增网络 endpoint、Slash Command、动态代码执行、HTML sink、URL sink、凭据读取或 provider 私有调用。所有模型请求仍只经既有 Connection Manager `sendRequest`，所有最终写回仍复用既有 `isCurrentTaskOrigin + archiveRevision` commit fence。

### 0.8.10 request coordinator / confession player r24 additional invariants

- 一个模式的父构建 scope 与其子请求必须折叠为同一个 logical task key；这个折叠只影响 admission accounting，不得改变原 `characterKey + chatId + archiveRevision` origin fence、task AbortController 或最终 session 原子提交边界。
- 真正进入 Connection Manager 的 provider request 必须经过固定上限为 2 的进程内 permit queue。排队中的请求在扩展销毁或任务取消时必须移除并拒绝；permit 必须在成功、错误、超时和取消四条路径上恰好释放一次。
- 每个普通派生请求默认 300 秒超时，最长不得超过代码硬上限 600 秒。超时必须停止本地等待、触发该请求 AbortController、释放任务注册与 provider permit，并作为非自动重试错误返回；不得把迟到响应写入任何 session。
- Connection Manager 错误分类只允许暴露本地分类、HTTP 状态和短错误 code；不得把响应正文、请求 prompt、角色卡/Persona/世界书、聊天档案、Authorization/header 或 API Key 拼入 toast/inline error。
- 自动分段重试只允许 JSON/本地完整度校验、429 和暂时性上游错误，且最多一次。认证、连接/模型配置、上下文超限、无效请求、禁用词、用户/扩展取消和本地 300 秒超时不得自动重试。
- r24 引入的告白逐句播放器必须继续满足文本转义与本地角色卡头像约束；r25 起播放器的权威入口仅为 evidence-backed `confessionReplays`，未来路线中的旧 `confession/confessionLines` 仅作兼容数据且不得显示为已发生告白。模型始终不能提供头像 URL，旧文本拆句只能在本地处理，不能触发额外模型或网络请求。

### 0.8.10 r25 incremental collection / split interaction / achievement invariants

- Album and CG/ADV may grow incrementally and no longer have a fixed 15/12 minimum. Reducing quantity must never reduce evidence requirements: every unlocked Album row and every ADV event still needs a current-archive `sourceMemoryIds + sourceMemoryAnchor` match before it can survive normalization or merge.
- Incremental merge keys are de-duplication hints only. Ordinary archive updates are append-only, so prior validated Album/ADV rows, image records and ADV bodies remain immutable while their stable Mxxx evidence remains in the archive. A full archive rebuild may renumber evidence and therefore invalidates the whole derived cache instead of selectively carrying rows across.
- Album present-day comments remain derivative display text attached to an already evidence-backed CG. They cannot create or update archive memory. The UI copy around those comments may be simplified without changing the evidence boundary.
- Bulk ADV generation processes at most six unfinished events in one provider request. A smaller batch is a reliability limit only; it does not change per-event memory scoping, normalization, task-origin checks, or session write permissions.
- Avatar + paged first-person confession playback belongs only to `confessionReplays`, which are historical rows validated by current archive IDs/anchors. Future ENDING route bodies no longer need or display avatar confession pages. Legacy route confession fields may remain readable for compatibility but are not evidence and are not a route-completion requirement.
- HEART is allowed to persist three independent derivative groups: period dialogue, seasonal/future Drama, and daily strips. The relationship state used by any group must still normalize against the current archive. Voice/Scenario/strip output remains simulation and must never write to `MEMORY_KEY` or become historical evidence.
- Phone content-volume reductions do not widen trust. A modern phone still uses the fixed supported App-kind model and all `basis=记忆` entries still need current archive evidence; fewer entries/deep chats must not turn model guesses about `{{user}}` into past facts.
- Achievement Library is derivative UI state. An `unlocked=true` achievement must pass current-archive memory-ID/anchor validation. Locked achievements must not carry authoritative archive evidence and cannot be described or committed as already happened. A previously unlocked cached achievement is preserved only if it revalidates against the current archive during merge.
- Achievement tier values map only to code-defined icon classes; model output cannot provide CSS classes, HTML, URLs, image sources, or executable behavior. All generated achievement titles/descriptions/categories/hints and confession dialogue lines must remain escaped at HTML insertion sinks.
- UI-copy removal must not remove write guards, destructive confirmations, archive read-only enforcement, generation-task/origin fences, or revision checks. r24 provider permits, lifecycle timeout, retry allowlist and safe error classification remain unchanged.

### 0.8.10 r26 resumable phone / per-season HEART / compact settings invariants

- Phone continuation drafts are derivative temporary cache only. A draft must be bound to the exact current `chatId + archiveRevision`; it must not be loaded after either value changes, and archive revision migration must delete it instead of rebinding it to the new revision.
- Only App data that already passes the existing App completeness and memory-evidence validator may enter a phone draft. Draft persistence must whitelist and bound known App/entry/message/field fields; unknown model keys, HTML, URLs, script fields or arbitrary nested objects must not be persisted merely because they were returned by the model.
- A completed Phone session commit must delete the draft. Resuming may skip already validated App IDs, but the final merged device must still pass the ordinary full `normalizePhone` checks before it becomes the authoritative derived session.
- HEART future/postending, spring, summer, autumn and winter may be generated independently. Every per-season update must start from the current normalized HEART relationship anchor, run the season-specific validator, then pass the existing current-origin and unchanged-archive-revision write fence before saving. A successful season must never be rolled back merely because another season later fails.
- Display names used for char/user labels come only from current SillyTavern context or the already loaded archive snapshot and must be escaped at the HTML sink. Model output cannot choose a display-name HTML fragment.
- Removing explanatory settings copy must not remove the actual connection/model controls, generation safety settings, write guards, origin/revision fences, retry policy, image-generation opt-in state, or destructive confirmations.
- All independently triggered HEART section writes for the same scope must share one build guard so two seasons cannot commit stale cloned bases over each other. Per-season UI independence does not authorize concurrent same-session writers.
- Phone draft plan `liveStates` must be reduced to the four known dayparts with bounded text and badge keys restricted to planned App IDs before draft persistence; arbitrary model-owned nested plan state must not enter metadata merely to support resume.


### 0.8.10 r27 concurrent HEART Drama invariants

- HEART season concurrency uses independent internal task keys only. The global provider permit remains capped at two simultaneous Connection Manager calls; queued season tasks must not bypass provider throttling or the global logical-task ceiling.
- Seasonal Voice and Scenario are separate derivative payloads. Each payload must pass its local bounded normalizer before it can become a HEART patch; model output cannot select another season, patch key, destination mode, chat, archive revision, HTML, URL, or executable action.
- A HEART partial patch may modify only dialogue-core fields, daily strips, or one fixed season's normalized Voice/Scenario entry. Commit code must reload the latest same-chat HEART session and merge the patch before `normalizeHeart` + `saveSession`, preventing stale concurrent snapshots from overwriting sibling season data.
- Deferred HEART patches are keyed by the captured character/chat origin and may be flushed only when the live archive revision still equals the captured revision. They must be re-normalized against the current archive before writeback.
- Reducing Drama node/character thresholds is a reliability change only. It does not turn Voice/Scenario into archive evidence, does not write `MEMORY_KEY`, and does not weaken the relationship memory-ID/anchor requirement carried by the parent HEART session.
### 0.8.10 r28 network-idle cache persistence invariants

- Derived theater cache persistence may be delayed while provider requests are active/queued, but the in-memory cache remains scoped by the existing character/chat/archiveRevision key. Delaying a write must never relax `cacheStillMatchesLiveArchive`, pending-write scope checks, or final `saveSession` origin/revision validation.
- A delayed gzip result must still be discarded or parked as pending when the live chat/scope changed. Network-idle coalescing is a performance optimization only; it cannot authorize cross-chat persistence.
- On browsers with `CompressionStream`, partial generation must not first persist the full uncompressed theater cache merely for durability. The uncompressed fallback is allowed only when local gzip is unavailable. Losing an unflushed newest derivative fragment on abrupt page termination is preferable to widening write scope or reintroducing large duplicate uploads.
- Network throttling must not alter canonical `MEMORY_KEY` archive writes, evidence anchors, model prompt safety boundaries, provider credential handling, or user-visible task cancellation semantics.

### 0.8.10 r29 60k output-limit invariants

- The user-configurable generation-output ceiling may be raised to 60,000 tokens, but remains bounded by the code-defined `MAX_GENERATION_OUTPUT_TOKENS`. The local response-text parser is separately bounded at 600,000 characters; this larger bound exists only to avoid self-truncating a valid 60k-token response. Provider/model limits remain authoritative and may reject a smaller value.
- Per-feature segment caps remain independent reliability limits. Raising the global setting must not silently raise a segment above its explicit `options.maxTokens` value.
- JSON error diagnostics may expose only numeric configured/request ceilings and existing safe error categories. They must not include prompt text, model output bodies, reasoning text, credentials, headers, world-info content, archive evidence, or provider response bodies.
- Increasing the ceiling must not change input-budget limits, provider concurrency, retry policy, archive evidence checks, origin/revision fences, cache persistence rules, or any write authority.

### 0.8.10 r30 append-only derived-content invariants

- Each derived mode owns an explicit `generationMeta.parts[part].coveredMemoryIds` cursor. HEART dialogue, strips, postending, spring, summer, autumn and winter are separate parts; ENDING routes and confession replay are separate parts. One part must never consume another part's pending archive IDs.
- During append-only archive revision migration, a legacy session with existing content is stamped against the exact pre-update memory list before its revision fence moves. If no older snapshot exists, current-revision legacy content is conservatively treated as having consumed the current archive; this may defer output until the next archive increment but must not replay old material.
- Old generated collection entries are immutable during incremental generation. Model output is normalized as a bounded candidate delta and merged locally; it cannot delete, reorder, retitle, rewrite, or replace prior prose, CG image records, ADV bodies, Drama scripts, terminal entries, ending scenes or epilogues. Explicit state transitions may unlock an old locked row while retaining its stable ID; replacing a current relationship summary must first archive the prior summary in bounded history.
- A successful empty delta still consumes the supplied incremental IDs so repeated clicks do not repeatedly bill for the same evidence. No pending IDs means no provider call. At most 64 pending IDs enter one request batch, allowing a large archive increment to be consumed over multiple explicit clicks.
- HEART seasonal Voice and Scenario use a deterministic batch ID. A locally validated half may be saved alone; coverage advances only when the required halves for that batch exist, and a retry may add only the missing half. Postending requires Voice only.
- Existing-content indexes included in prompts are untrusted, bounded de-duplication context. They confer no evidence or write authority. Fresh rows that claim happened facts must still satisfy the mode's local source-memory ID/anchor checks, and all model strings remain escaped at HTML sinks.
- Derived collections retain old items first and are bounded to 240 items. Capacity exhaustion must reject further additions rather than evict historical rows. These limits do not enlarge `MEMORY_KEY`, input budgets, provider concurrency, fetch destinations, credential access, or cross-chat write scope.
- Incremental commits remain fenced by captured character/chat/archiveRevision. Full archive rebuild continues to invalidate derived caches; r30 metadata must not be used to carry evidence-bound content across a rebuild that renumbers or rewrites Mxxx records.

### 0.8.10 r33 clean / TT display / user output invariants

- 图片生成只通过 SillyTavern Image Generation 公共路径，不探测其它生图 provider 的全局、DOM 或私有接口。
- `ttDisplayMode` 只改变档案室 overlay 的移动端布局 class 与安全区 padding，不得改变读写权限、任务 origin、archive revision、关闭按钮事件边界或生成逻辑。
- 副 API 用户设置的 `maxTokens` 是实际提交给 Connection Manager 的输出上限，仍受代码硬上限 60,000 约束；功能内部旧 `options.maxTokens` 只能作为历史尺寸提示，不能降低用户明确配置。
- 新增角色互动档案室入口只改变导航可达性和排序；只读档案、当前聊天可写检查、HEART 的证据锚点及派生内容边界保持不变。


### 0.8.10 r34 future-daily Drama / avatar-only dialogue invariants

- Seasonal/future HEART Drama is derivative simulation and no longer consumes or requires a per-season incremental-memory cursor. The already-normalized parent HEART relationship state remains the only archive-derived relationship boundary used for seasonal prompt tone; raw archive memories, relationship summary text, source anchors and incremental archive slices must not be supplied as seasonal plot material.
- Generating another spring/summer/autumn/winter/postending episode without new Mxxx is allowed because the result is not historical evidence. It must not write `MEMORY_KEY`, alter the parent relationship evidence, or claim the simulated episode already happened.
- Supporting friends/family/colleagues may use names/relations only when CHARACTER_CARD_JSON or WORLD_INFO_TEXT clearly supplies them. Otherwise the model must prefer the char/user pair or non-specific background people rather than inventing durable named relatives or close relationships. Third-party romance remains prohibited.
- Seasonal batch IDs and target seasons are code-owned internal values. A half-finished Voice/Scenario pair may reuse its existing internal batch ID; model output cannot choose the destination chat, season, patch key, archive revision, URL, HTML or executable action.
- Hiding the period-dialogue library from the HEART page is presentation-only. Greetings remain bounded escaped derivative text and may be selected only through the existing archive-avatar interaction; removing the visible tab must not bypass read-only archive handling or trigger background generation from an avatar click.


## r35 modular architecture invariants

- `src/heartbeatMemories.js` 只能承担 extension init / destroy / bootstrap；不得重新堆回 Album/Phone/HEART 等业务实现。
- `src/modes/*` 之间不得直接 import。跨玩法共享信息必须通过 `core/*`、`archive/*` 或 `generation/*` 的受控接口取得。
- `normalizeMemoryReference` 的证据校验由 `core/evidence.js` 单一拥有；不得在 mode 内复制弱化版 ID/anchor 校验。
- Provider permit/timeout/task key 由 `core/requestCoordinator.js` 单一拥有；任何 mode 不得绕过队列直接新增第二套并发实现。
- `saveSession` / compressed derived-cache persistence 由 `core/cache.js` 单一拥有，并继续检查 chatId + archiveRevision。
- 历史只读档案的写入准入继续由唯一 `requireWritableArchiveAction` 边界控制；模块拆分不得因 UI 入口变化获得额外写权限。
- `ADV EVENT` 是展示/模块名称；持久化值继续使用 `MODE.ADV === "adv"`。未经独立 schema migration 版本，不得静默改成 `advEvent` 导致旧缓存失联。


### 0.8.10 r36 relationship calendar invariants

- Calendar is a derived organizer only. `MODE.CALENDAR` may be cached under the existing derived `CACHE_KEY`, but no calendar generation/refresh path may write, mutate, renumber, or promote data into canonical `MEMORY_KEY`.
- `past` calendar entries must be built locally from canonical archive memories that already contain an explicit valid date. Model output must never be accepted as a source of past facts. Their memory ID and anchor remain attached for provenance.
- `promised` entries are allowed only for an explicit still-pending arrangement and must pass the existing canonical memory-reference validator against the current archive. Model-supplied IDs/anchors are untrusted hints; a missing/invalid ID or anchor must drop the entry rather than downgrade it into an unverified promise.
- `future` entries are non-canonical setting references only. They may be derived from bounded character-card/persona/world-info context only when an explicit calendar date exists. They carry no archive memory IDs and must never be presented as something the couple promised, experienced, or will certainly do.
- Calendar-specific World Info scan terms may only influence the existing bounded/dry-run setting retrieval. They must not write World Info, fetch arbitrary external data, obtain credentials, or bypass prompt/data-size limits. Other modes must retain the default empty extra-term set.
- Calendar refreshes must reuse the shared provider permit/timeout/error policy and the existing chatId + archiveRevision save fence. Switching chat/archive revision while a refresh is in flight must not allow the result to land in another archive.
- Calendar rendering must escape every model/setting-derived title, summary, date label, source label and anchor before HTML insertion. No calendar item may supply HTML, URL, CSS, command, navigation target or executable action.

### r40.2 Calendar notebook invariants

- `stickyNotes` and `moodNotes` remain derived-cache display data. They must never write to canonical `MEMORY_KEY` or alter promise completion state.
- Archive-backed sticky notes and every mood note require a real memory ID + exact anchor accepted by `normalizeMemoryReference`; invalid references are discarded. Setting-backed sticky notes carry no memory IDs and must remain visibly non-canonical.
- The visible To-Do list is computed from validated `promised` Calendar entries. A UI checkbox is presentation only; no manual click may manufacture fulfillment or mutate Mxxx.
- Calendar note/mood single-item regeneration may rewrite only short display text and must preserve source type/evidence. Delete/regenerate actions stay behind the existing allowlist, writable-archive gate, double confirmation and chatId/archiveRevision fence.
- Every note, mood string, title, source label and anchor is escaped before the existing Calendar `innerHTML` render sink. No note may introduce URL, HTML, CSS, command or navigation authority.
- `CALENDAR_SESSION_VERSION=4` invalidates only stale Calendar derived cache. It must not migrate or delete formal archive data.

### r40 / r40.1 personal Calendar invariants

- Calendar remains derived-cache only and must never write to canonical `MEMORY_KEY`.
- A visible `past` calendar mark may only survive normalization when `sourceMemoryIds` are valid and `sourceMemoryAnchor` exactly resolves to a cited memory that itself has a parseable date; the model does not control the stored past date.
- A concrete `promised` date must be textually present in the cited archive evidence. If the evidence has no concrete date, only `待定` is accepted.
- Calendar detail content is intentionally limited to code-owned completion state plus a short title and semantic tags. It must not manufacture `decisionFeeling`, `afterthought`, `anticipation`, plot continuation, or canonical consequences.
- Calendar semantic tags are restricted to the code-owned allowlist and at most three values. Model-provided HTML/CSS/URL/command-like tag strings are discarded before rendering; surviving titles/tags/source labels/anchors are still HTML-escaped at insertion.
- `CALENDAR_SESSION_VERSION` may invalidate only the Calendar derived session; it must not migrate, delete, or rewrite the archive.

- r36 deliberately has no automatic holiday/story-generation action. Adding a future-special/holiday-story action later is a separate capability review and must not silently convert `future` setting rows into canonical facts.


## r37 destructive / replacement controls

- Every user-facing delete or true replacement/regeneration action must require two explicit confirmations. This is a UX safety invariant, not an authorization boundary.
- Content management may mutate only the current live chat's derived theater cache. Formal archive `MEMORY_KEY` / Mxxx evidence is out of scope except the separately named full-archive rebuild/delete workflows.
- A management target must be resolved from an allowlisted target type and looked up in the current normalized session. Dataset/model-controlled strings must never become arbitrary object paths or cache keys.
- Targeted regeneration must keep the old item until the new candidate passes the existing validator/evidence rules and the final current-chat + archive-revision fence. Failed regeneration must not first delete the old item.
- Historical snapshots remain read-only. Whole-room replacement/deletion must invalidate Items and Phone derived caches after the room operation succeeds.

### Calendar ownership invariant (r40.3+)

The standalone `MODE.CALENDAR` is the only derived feature allowed to organize shared dates, promises, anniversaries and relationship To-Do items. `MODE.PHONE` excludes `schedule` / `calendar` apps and must not duplicate that authority. Removing a legacy Phone calendar affects derivative cache only and never deletes or edits canonical `MEMORY_KEY` archive evidence.

## r41 HEART 萤火虫 / 四季 Drama 安全边界

- 「萤火虫栖息地」只生成 HEART 派生心声，不写入 `MEMORY_KEY`，不得把心声反向晋升为已发生剧情事实。
- 五类光点颜色只能来自 `pink / blue / yellow / white / desire` allowlist；`desire` 仅允许非露骨的亲密与渴望表达，禁止露骨性行为、身体部位细节或色情过程。
- 光点位置、大小与动画延时只由插件对本地 `id + index` 做确定性数值计算；模型不能提供 CSS、style、坐标或 URL。
- 四季 Drama 的 `visualTone` 只能来自 `soft / clear / muted / deep` allowlist；实际背景仍由本地季节样式 + allowlist class 决定，模型不能注入任意 class/CSS。
- 萤火虫单项删除/重新生成仍走统一内容管理的二次确认；删除只修改派生缓存。


## r41.8 萤火虫小批次安全边界

- r41.8 只缩小一次生成/升级/渲染批次，不改变 r41.7 的永久库、Mxxx 增量游标、来源证据或文本转义边界。
- 首次与后续增量每批仅接受 5～6 颗完整心声；首次至少覆盖 3 种颜色，但不强制 ♥️，避免为了颜色配额生成不符合关系阶段的内容。
- UI 同时存在的萤火虫发光 DOM 最多 6 个；永久库仍可继续累积并分页回看。
- 旧短句升级每批最多 6 颗，必须保留原 id / color / 来源批次，且不得写入 `MEMORY_KEY`。

## r41.7 萤火虫完整心声 / Drama 翻页安全边界

- 新萤火虫仍属于 HEART 派生数据；一颗光只增加结构化 `title + thoughts[2..4]`，所有标题/段落继续经过长度规范化与 HTML 转义，不允许模型提供 HTML、CSS、URL、坐标或执行动作。
- 新增光点首次生成目标为 5～6 个，后续只有当前档案存在未消费的新 Mxxx 时才允许增量生成 5～6 个；既有光点只作为有界去重摘要输入，不得因为内容变长而把整个永久库无限回送给模型。
- 旧版单句光点升级是用户显式触发的派生缓存迁移。模型必须返回原始 id 与原始颜色；本地验证不一致即拒绝。写回只替换同一光点的 `title/thoughts/line`，保留原来源 Mxxx、批次与生成时间，不修改正式档案，也不推进增量覆盖游标。
- Drama `selectedDramaKey` 仅是 UI 选中态，值只能由本地已存在的 `voice:<id>` / `scenario:<id>` 项产生；它不能成为任意对象路径、cache key、URL 或授权输入。旧 `selectedVoiceId/selectedScenarioId` 只作为兼容回退。
- 萤火虫 DOM 页大小固定为 6，内容段落变长不得增加同时运行的发光动画节点数。

## r41.4 Character Profile / Relation Garden 安全边界

- Character Profile 是角色组级、全聊天窗口共用的派生设定资料。生成上下文只允许目标角色卡、当前 User Persona 与代码触发的受控 World Info dry-run；不得读取聊天正文、Mxxx、archiveSummary 或任意历史快照来制造角色级“固有关系”。
- 客观 profile fact 必须携带 allowlisted `sourceType` 与逐字存在于该来源的 `sourceEvidence`，且显示 value 必须能从 evidence 直接核对；“很高”不得换算成厘米，未写血型/生日不得猜。第三方固定关系的人名/稳定称呼必须出现在 sourceEvidence；{{user}} 固有特殊关系只能在角色卡/世界书/Persona 明确写出时成立。
- `MODE.RELATIONS` 是 chat-scoped 派生 session，继续绑定 `chatId + archiveRevision`。每个 chat-scoped 动态关系必须通过真实 `sourceMemoryIds + sourceMemoryAnchor` 校验；非 user 的人物名还必须在所引用 Mxxx 的 title/summary/anchors/participants 中出现。角色级固有资料不能为聊天中的“已发生事实”授予证据。
- 角色级固定关系与 chat-scoped 动态关系只在 UI 本地 merge；不能互相写回、升级或跨窗口复制。r41.9 起 UI 只显示一张合并人际图，但某窗口的恋爱、冲突、同居、和解等状态仍不得写入全局 Character Profile。
- Relation Garden 的节点坐标、类别样式与中心头像 URL 由代码控制；模型不能输出 HTML、CSS、URL、坐标、命令或可执行动作。所有模型/设定文本在 `innerHTML` sink 前必须经过 `core_text.esc`。
- 同 char 在普通角色卡编辑后允许复用唯一的姓名 + avatar auto group；如果候选不唯一则 fail closed，不能靠新 fingerprint 猜合并。删除角色档案必须同时删除该 group 的共享 Profile，但不得删除、清空、重命名或改写 SillyTavern 正文聊天。

### r41.4 世界线人物资料解锁
- `MODE.RELATIONS.discoveries` 与 chat-scoped 动态人际关系一样属于派生数据，绑定当前 `chatId + archiveRevision`；不得写入角色组级 Character Profile。
- 可解锁字段使用固定 label allowlist；每项必须有真实 `sourceMemoryIds + sourceMemoryAnchor`，且 `value` 必须能在所引用 Mxxx 的 title / summary / anchors 中逐字核对。不能根据“很高”“经常做某事”等模糊叙述换算身高、血型、生日或长期喜好。
- UI 只显示转义后的结构化文字；资料卡不能提供 HTML、CSS、URL、头像或布局坐标。


## r41.9 Character Profile literal fallback / single-garden UI boundary

- Character Profile objective facts about `{{char}}` may be locally extracted only from the safely matched target character card's explicit structured fields or bounded identity/setup text (`description / creator notes / scenario / depth prompt`). First/example messages are excluded from deterministic extraction because they can mention `{{user}}` or third parties.
- Deterministic extraction is literal-only: no conversion of vague descriptions into dates, heights, blood types, ages or occupations. Common label aliases may normalize into the fixed GS fields, but values must remain source text/structured-field values.
- `user_persona` is not an allowed source for `{{char}}` objective profile facts. It remains permitted only for an explicit story-start relationship between `{{user}}` and `{{char}}`, preventing the user's own age/job/birthday from contaminating the character profile.
- Existing shared profiles may be patched from the character card only when the archive group can safely resolve the same SillyTavern character by the existing name/avatar matching rules. This patch happens only while opening that character archive page, never on ordinary chat startup/message events, and does not read chat text or Mxxx.
- r41.9 removes the duplicate base-only Relation Garden from the character overview. Shared fixed relations remain stored in the role-level profile because the single chat-scoped `MODE.RELATIONS` graph merges them with evidence-gated worldline relations for display. Removing the duplicate UI does not merge write authority: shared settings data and chat-scoped Mxxx-derived data remain separate.
- Character Profile collapse uses code-owned native `<details>/<summary>` markup. Model text remains escaped and cannot control open state, HTML, CSS, URL, coordinates or event handlers.

## r41.5 性能收口与安全边界

- 普通消息事件只允许读取当前聊天是否存在 `MEMORY_KEY`，不得在 `MESSAGE_SENT / RECEIVED / EDITED / UPDATED / DELETED` 中新增全聊天扫描、世界书 dry-run、派生缓存 hydrate/compress 或网络请求。
- 删除角色墓碑可建立本地只读 `Set` 索引用于一次 UI/扫描操作；索引只来源于已经规范化的 Heartbeat 删除记录，不扩大删除权限，也不写正文聊天。
- 完整档案室 CSS 延迟到 `openOverlay()` 注入；启动阶段只允许设置面板必要样式。延迟样式不能改变模型输出的 HTML/CSS/URL 安全边界。
- 萤火虫页面永久库与当前 DOM 数量分离；单页最多 6 个发光节点，关闭/切页后不保留后台动画节点。

## r42.0 lazy bootstrap / zero-decompression diagnostic boundary

- `index.js` bootstrap may create only code-owned fixed DOM. It cannot render model/chat/world-book strings with `innerHTML`; the diagnostic output is rendered with `textContent`.
- The full runtime import path is a fixed same-extension relative URL using the code-owned BUILD token. Chat metadata, model output, World Info, Persona, URL parameters and settings cannot select the imported module or network origin.
- Before first explicit Heartbeat use the bootstrap must not bind ordinary chat/message event handlers or execute archive/cache/world-info/provider work. The only repeated startup work is the existing bounded mount retry for missing SillyTavern menu/settings containers.
- The performance diagnostic is observational only. It may read `chat.length`, `MEMORY_KEY.memories.length` and compressed cache manifest/string-length fields already parsed by SillyTavern. It must not Base64-decode, decompress, JSON-stringify the theater cache, mutate metadata, save settings, scan message text, or start network/provider requests.
- A legacy uncompressed cache is reported as present but intentionally not sized, because serializing it merely for diagnostics would recreate the performance problem being investigated.
- Exposed diagnostic/bootstrap helpers do not grant archive write/delete authority; destructive operations remain inside the runtime's existing current-chat/revision/confirmation gates.
