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
11. 模型生成必须通过 SillyTavern 官方 Connection Manager Request Service。浏览器 `fetch` 只允许三个明确场景：硬编码同源 `/api/backends/chat-completions/status` 用于刷新模型；硬编码同源 `/api/characters/chats` 用于“档案室一览”；以及用户手动创建/更新档案时，经 SillyTavern `/proxy` 读取已启用记忆插件自己配置的当前聊天窗口记忆 API。任何模型输出都不得控制 fetch 目标 URL。
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

## Credentials

API 凭据由 SillyTavern Secrets / Connection Manager 持有。插件设置只保存 Connection Manager Profile ID、可选模型覆盖 ID、输出上限、温度和功能开关。

模型列表刷新向 SillyTavern 的同源后端提交 `secret_id`，而不是 Secret value。Profile 中的第三方 API URL 只作为后端状态请求参数，不会成为浏览器 `fetch()` 的目标地址。


## Current-chat external memory boundary

21. 外部记忆桥接只允许在用户显式“扫描记忆 / 摘要”预检或“创建/更新档案”流程中运行；CG / ADV / 房间（含物品/私人终端深层视图）/ 蝴蝶效应 / ENDING / HEART 不得直接读取外部记忆服务。
22. 每个 provider 必须绑定发起任务时的 `chatId`；任何 await 返回后如果当前 `chatId` 变化，数据必须丢弃/中止。
23. EverMind 适配器只允许读取当前聊天 metadata 中的 `st_evermind.group_id`；禁止读取或搜索 `char_group_id` / 角色级跨聊天记忆。
24. 外部 provider 凭据不得复制到心跳回忆 extension settings、chat metadata、日志、DOM、Prompt 或错误文本。对 EverMind 的现有明文 key 仅允许作为一次 `/proxy` 请求的瞬时 Authorization header。
25. 外部记忆内容与 API 响应均视为不可信数据；进入心跳回忆档案前必须经过结构化模型抽取、真实 provider record ID 白名单校验以及 `sourceExternalAnchor` 逐字证据校验。
26. 外部记忆桥接必须有独立条数/字符预算，不得因为 provider 数据规模绕过主生成输入预算。

27. 第三方公开记忆 reader 必须由用户显式 opt-in，默认关闭。启用后只允许调用已加载插件主动暴露的 `getInjectedHistory()` / `getCurrentChatMemories()` / `getCurrentChatMemory()` / `getCurrentChatSummary()` / `getCurrentSummary()` 与可选 `getSnapshot()`；不得遍历其私有数据库、执行访问器 getter 或调用模型/记忆内容指定的函数。调用前后必须校验当前 chatId；若返回/快照显式携带的 chat ID 与任务 chatId 不同，整份来源拒绝。
28. 公开记忆接口返回的文本、nodes、coverage、revision 都是不可信数据；只允许进入外部记忆归一化与证据抽取链，不能进入 HTML/CSS/脚本执行面。
29. “档案室一览 / 只读旧档案”只允许请求 SillyTavern 同源 `/api/characters/chats`，且目标 chat ID 必须来自本地档案索引或本轮服务器返回的 allowlist。查看旧档案不得隐式调用 `selectCharacterById/openCharacterChat`、不得改变宿主当前角色/聊天，也不得让模型输出或 DOM 篡改构造任意聊天路径。
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
- Compressed chat metadata is untrusted input. Base64 input, pre-compression JSON size and streamed decompressed output are all hard-capped before parsing to reduce decompression-bomb / memory-exhaustion risk.
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
- Closing the Heartbeat overlay or navigating to another chat may hide the UI, but must not retarget active tasks. Extension destruction must abort every active controller.


### 0.8.10 UX / phone r8 additional invariants

- “返回上级”只能改变插件本地视图层级，不得更改 `chatId`、`archiveRevision`、任务 origin 或把后台结果重定向到其他聊天。
- 房间移动端重排只改变 DOM 展示顺序；SPACE NOTE / PRIVATE LIFE / PRIVATE ACCESS 中引用的房间对象、记忆 basis 与证据校验仍来自同一已归一化 room session。
- ADV 手机选择器只能从当前 `session.events` 的现有 ID 中切换；不得从 DOM/select 值创建新事件或更换档案作用域。
- 私人终端扩容不会放宽共同历史边界：凡是声称 `{{user}}` 与 `{{char}}` 已发生的聊天、合照、纪念日、订单、约会或共同事件，仍必须 `basis=记忆` 并通过完整当前档案的 `sourceMemoryIds + sourceMemoryAnchor` 本地校验。
- r9 起私人终端相册不再接受外部媒体 URL；Gallery 仅保存和渲染转义后的文字照片描述。


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
- CG 实图自动检测只允许检查 SillyTavern 已暴露的 `/imagine`、`/sd`、`/img` Slash Command callback；不得遍历任意第三方扩展对象或调用私有 provider API。
- 自动检测到 callback 时继续直接调用 callback，不把视觉 prompt 交给通用 STscript 解析器。只有用户显式打开 `imageGenerationManualEnabled` 且 callback 自动检测失败时，才允许使用 SillyTavern 公开 `executeSlashCommandsWithOptions('/sd quiet=true ...')` 兜底。
- 手动 `/sd` 兜底的视觉 prompt 在进入 STscript 前必须再次中和脚本语法：删除 `{}` 宏花括号、折叠换行、转义反斜杠和管道；不得让模型生成的视觉文字变成额外 Slash Command、宏或管道阶段。
- r12 的其它 CG 边界继续成立：生图只能由用户显式点击触发；只发送单张 CG 的有界纯视觉描述；不发送聊天/档案/世界书/记忆原文或凭据；返回路径仍必须通过同源图片 URL 归一化；写回仍受 `characterKey + chatId + archiveRevision` 与 lifecycle epoch 保护。

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
