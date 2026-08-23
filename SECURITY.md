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
17. 内容生成采用显式并行任务表，最多 4 项同时运行；每个任务必须有独立 task key、AbortController、characterKey、chatId 与 archiveRevision。同一 task key 不得重复启动。
18. 后台生成完成时仍必须执行与前台完全相同的 chatId/archiveRevision 校验；关闭 overlay 不能绕过数据隔离。
19. User Persona 可以作为设定上下文和世界书 dry-run 的 personaDescription，但不得被当作“已经发生的共同往事”证据。
20. 档案室查看入口不得隐式触发模型请求；未生成主入口只能由其自己的显式“生成这一项”按钮启动。物品/私人终端只能从房间内部的显式生成按钮启动。

35. 各玩法 prompt 可以只携带与本模式相关的档案子集以控制输入长度，但这只是“减少模型可见证据”，不得降低本地 `normalizeMemoryReference` 对完整当前档案的 ID + anchor 校验；单篇/批量 ADV 只允许使用对应 CG 已经引用的 sourceMemories。
36. 储物深层 prompt 只允许收到房间中 `searchable=true` 的收纳对象及其关联记忆；不得为了缩短 prompt 而重新允许普通床、桌面、灯、照片等成为可翻找容器。

## Credentials

API 凭据由 SillyTavern Secrets / Connection Manager 持有。插件设置只保存 Connection Manager Profile ID、可选模型覆盖 ID、输出上限、温度和功能开关。

模型列表刷新向 SillyTavern 的同源后端提交 `secret_id`，而不是 Secret value。Profile 中的第三方 API URL 只作为后端状态请求参数，不会成为浏览器 `fetch()` 的目标地址。


## Current-chat external memory boundary

21. 外部记忆桥接只允许在用户显式“创建/更新档案”时运行；CG / ADV / 房间（含物品/私人终端深层视图）/ 蝴蝶效应 / ENDING 不得直接读取外部记忆服务。
22. 每个 provider 必须绑定发起任务时的 `chatId`；任何 await 返回后如果当前 `chatId` 变化，数据必须丢弃/中止。
23. EverMind 适配器只允许读取当前聊天 metadata 中的 `st_evermind.group_id`；禁止读取或搜索 `char_group_id` / 角色级跨聊天记忆。
24. 外部 provider 凭据不得复制到心跳回忆 extension settings、chat metadata、日志、DOM、Prompt 或错误文本。对 EverMind 的现有明文 key 仅允许作为一次 `/proxy` 请求的瞬时 Authorization header。
25. 外部记忆内容与 API 响应均视为不可信数据；进入心跳回忆档案前必须经过结构化模型抽取、真实 provider record ID 白名单校验以及 `sourceExternalAnchor` 逐字证据校验。
26. 外部记忆桥接必须有独立条数/字符预算，不得因为 provider 数据规模绕过主生成输入预算。

27. 对公开记忆插件只允许调用已加载插件主动暴露的 `getInjectedHistory()` 与可选 `getSnapshot()`；不得遍历其私有数据库或调用模型/记忆内容指定的函数。调用前后必须校验当前 chatId；若返回/快照显式携带的 chat ID 与任务 chatId 不同，整份来源拒绝。
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

- Parallel generation is bounded to four active content tasks. Archive creation/update and external-memory preflight remain mutually exclusive with content generation because they can change archive evidence/revision.
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

- 任何显式覆盖已有派生内容的“重新生成”操作必须经过用户确认；确认取消时不得创建请求、修改 session 或改变 archive revision。
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

