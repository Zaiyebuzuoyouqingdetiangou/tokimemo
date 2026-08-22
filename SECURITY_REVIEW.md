## 0.8.10 confirmation / current archive r10 focused diff review

Scope: exact current GitHub `main` r9 blob `24312b4f9980c4d41fd318a6fe7eb830873b1e25` → local r10 candidate (`src/heartbeatMemories.js`, cache-key metadata, docs).

- Added a local, fixed-string confirmation gate for every explicit overwrite path: portal-level regeneration, topbar regeneration, room “今日生活” forced refresh, and current-window archive create/update. Cancel returns before any generation/import request is started.
- Restored a direct “生成/更新当前窗口档案” action in plugin settings and made current-window archive actions visible on the archive-library home whether an archive already exists or not. The existing chooser action is retained and renamed explicitly to “当前窗口档案”.
- Updating an existing archive now warns before action that a new `archiveRevision` will invalidate the old derived theater cache. This matches the pre-existing `saveImportedMemory()` behavior; the patch does not change cache invalidation semantics.
- Confirmation title/body strings are local constants. No model output, world-info text, archive text, HTML, URL, or secret data is injected into the confirmation surface.
- Static diff found no increase in `fetch(`, WebSocket, EventSource, `eval(`, `new Function`, `document.write`, or `insertAdjacentHTML`. No new network destination or credential-handling path was added.
- Counts of `expectedChatId`, `expectedArchiveRevision`, `normalizeMemoryReference`, `isCurrentTaskOrigin`, and `saveSession` are unchanged from the exact GitHub r9 baseline.
- `importCurrentChatMemory()` is now invoked only through the confirmation wrapper from user-facing actions; the implementation of archive import, external-memory scoping, origin binding, and archive write checks is unchanged.

Result: no newly introduced Critical / High / Medium issue found in this targeted r9 → r10 review. Native browser confirmation behavior still needs real-device UX validation, but failure to display confirmation is fail-closed: the destructive action is cancelled.

## 0.8.10 ending / epilogue r9 focused diff review

Scope: r8 → r9 (`src/heartbeatMemories.js`, cache-key metadata, docs).

- Removed the entire Gallery external-media chain: world-info URL extraction/cache, `imageUrl` normalization, preview state, image preview DOM, click handlers, and third-party `<img>` loads. This is a net reduction in browser network/privacy attack surface.
- Added `MODE.ENDING` as a normal archive-derived session. It uses the existing generation task/origin pipeline and the unchanged `saveSession` chatId + archiveRevision guard.
- Current relationship classification requires a real archive ID + anchor, and every ending route also requires a real archive ID + anchor. Future ending/epilogue prose remains simulation-only and is not written to the formal archive.
- Added strings continue to be rendered through `esc()`; no HTML/CSS/JS returned by the model is executed.
- Static diff found no newly added `fetch`, WebSocket, EventSource, `eval`, `new Function`, secret/API-key read, or external URL target. Existing same-origin Connection Manager/model-list and archive APIs are unchanged.
- Counts of `expectedChatId`, `expectedArchiveRevision`, `isCurrentTaskOrigin`, `saveSession`, and `archiveRevision` are unchanged from r8; `normalizeMemoryReference` usage increased because ENDING adds more evidence checks.

Result: no newly introduced Critical / High / Medium issue found in this targeted r8 → r9 review. Runtime validation is still needed for model compliance with the new ENDING schema.

## 0.8.10 r7 butterfly semantics delta

- Scope: `src/heartbeatMemories.js` butterfly prompt/normalizer/renderer plus resource cache keys and changelog.
- No new network endpoints, `fetch`, WebSocket, dynamic code execution, or credential/secret handling.
- Existing `normalizeMemoryReference`, chat/revision origin guards, archive storage boundaries, and generated-string escaping remain unchanged.
- Ω now clears `sourceMemoryIds/sourceMemoryAnchor` because it is a post-simulation current-world observation point, preventing simulated branch content from being presented as archive evidence.
- Rendered model strings remain passed through `esc()`.

## 0.8.10 mobile UI r6 — targeted diff review

- Scope: responsive CSS plus one presentation-only `rmt-character-portals` class and resource cache key.
- No generation, archive persistence, cross-chat guards, evidence validation, connection profiles, secrets, or network behavior changed from r5.
- No new `fetch`, `WebSocket`, `eval`, or `new Function` use was introduced.
- r5 mobile archive open/top-layer behavior is unchanged.

# Codex Security Targeted Diff Review — 心跳回忆 0.8.9

日期：2026-08-22

## 范围与基线

- 仓库：`Zaiyebuzuoyouqingdetiangou/tokimemo`
- GitHub `main` 当前版本：0.8.7
- 当前 `main` 提交：`3a4bd4d9373edca2e4ca8a4e98f5add22f283a4d`
- 0.8.9 开发基线：本地已验证的 0.8.8 候选
- 目标：本地 0.8.9 候选

本文件是针对 **0.8.8 → 0.8.9** 的定向差分安全复核，并结合当前 GitHub 0.8.7 正式基线确认兼容边界。当前会话没有 Codex Security 托管扫描执行器，因此不把本文件表述为完整服务端扫描。

## 0.8.9 主要变更

1. **移除“一次请求生成整套档案室内容”**
   - 回忆相簿、他的房间、蝴蝶效应分别由各自入口显式生成。
   - CG/ADV 的事件索引仍来源于相簿；具体 ADV 正文继续在用户点击某一事件后独立生成。
   - 他的物品 / 私人终端继续只从“他的房间”内部进入，并在缺失时由房间内显式按钮单独生成。

2. **引入有界并行生成任务注册表**
   - 内容生成使用独立 `activeGenerationTasks`，不再共享单一全局 AbortController。
   - 最大同时运行 4 个内容生成任务。
   - 每个任务有独立 AbortController、任务 key、发起时 character/chat/archiveRevision origin。
   - 同一任务 key 不允许重复启动。

3. **任务身份绑定聊天窗口**
   - 主入口任务 key 按 `character + chatId + mode` 分隔；不同聊天窗口同一模式不会互相误判为“正在生成”。
   - 任务完成后仍按发起时 chatId / archiveRevision 保存；当前已切换到别的聊天时进入延迟回写，而不是写入当前聊天。

4. **并发延迟回写的 lost-update 修复**
   - 多个模式在用户离开原聊天后先后完成时，`sessions` 类型延迟回写按 mode 合并，而不是后完成者覆盖前完成者。

5. **互斥边界**
   - 创建/更新正式档案、显式“读取记忆插件”预读取仍与内容生成互斥，避免生成过程中 archiveRevision 被改变。
   - 完整 ADV 索引重生成与具体 ADV 正文生成不并发，避免相同 ADV session 的覆盖竞争。
   - 房间基底重生成与房间 daily-life 更新不并发，避免旧生活状态覆盖新房间。

6. **房间深层内容上下文**
   - 物品 / 私人终端的独立请求只接收已校验的当前房间结构摘要；房间结构作为不可信数据输入，不作为模型指令执行。
   - 物品仍受 sourceMemoryIds/sourceMemoryAnchor 证据校验；独立生成不放宽共同回忆事实边界。

## 安全边界复核

- 并行请求数硬上限为 4，避免用户连续点击造成无界请求风暴。
- 同一入口重复点击不会创建重复任务。
- 关闭档案室 / 切换聊天不会把任务重新绑定到新聊天；销毁扩展时会逐一 abort 所有内容任务。
- 延迟回写仍要求原 chatId 与 archiveRevision 匹配，不允许旧结果覆盖已更新档案。
- 多任务延迟完成时，session 结果按 mode 合并，避免合法并发结果互相丢失。
- 0.8.8 的档案版本兼容、gzip 缓存大小限制、解压上限、损坏缓存熔断仍保留。
- Connection Manager / SillyTavern Secrets 边界未改变；没有新增读取明文 API Key 的路径。
- 本次差分未新增第三方浏览器网络目的地；现有网络调用仍为既有 SillyTavern same-origin API / 既有记忆 provider 路径。
- 静态检查未发现新增 `eval`、`new Function`、`document.write`、`insertAdjacentHTML`、`WebSocket`、`EventSource` 执行面。
- 模型输出继续通过各模式结构化 normalizer 与文字转义后展示，不执行模型返回 HTML/CSS/JS。

## 失败隔离收益

旧的一键整包请求把多个大型 schema 放入一个 JSON 响应：任一子区块缺字段、输出被截断或顶层 JSON 无法解析，整次生成都可能失败。0.8.9 将其拆成独立请求后：

- 一个入口失败不会使其他已成功入口失效；
- 重新生成某入口不会删除其他入口缓存；
- 每个响应输出预算更聚焦，降低长 JSON 截断与跨区块格式污染概率；
- 用户可按需要并行启动最多 4 个入口，而不是依赖一个超长响应。

## 差分复核结论

在本次 **0.8.8 → 0.8.9** 变更范围内，未发现新增的 **Critical / High / Medium** 安全问题。

## 仍需真实 SillyTavern 运行时验证

- 不同模型供应商 / 代理是否允许同一个 Connection Manager profile 同时存在 2–4 个请求；服务端可能限流或主动取消并发请求。此类失败会被隔离到对应入口，不应造成跨聊天写入。
- 低性能设备同时启动 4 个大型响应时的内存峰值需要实机观察；因此并发数没有设计成无限制。
- 历史 M6：一键导入当前 Connection Manager 配置涉及 SillyTavern slash-command callback 行为，仍需要真实 SillyTavern 环境验证。


## 0.8.9.1 startup hot-path review

- Ordinary `CHAT_CHANGED` / `CHAT_LOADED` no longer schedules legacy-cache gzip migration.
- Legacy cache remains read-only compatible on normal chat entry; no deletion or schema migration is performed.
- Mount retry performs only missing mounts and cannot repeatedly rebuild already-mounted API controls.
- No new network endpoint, dynamic code execution sink, secret read, or cross-chat write path was introduced by this hotfix.

## 0.8.10 mobile/avatar r4 targeted diff review

Scope: `0.8.10 prompt-r3 -> 0.8.10 mobile-avatar-r4`.

- Mobile archive-open fallback is limited to the two plugin-owned archive buttons and adds `touchend` alongside existing `pointerup`/`click`; it does not install a general touch interceptor.
- Character-avatar recovery only reads SillyTavern's existing `characters` metadata / archive-index metadata and still renders the resolved thumbnail URL through HTML escaping.
- A transient empty avatar can no longer overwrite a previously valid archive-index avatar. Existing entries with a usable avatar filename in `characterKey` can be recovered without rewriting memory text.
- `currentCharacterKey` keeps the same character-id fallback behavior used by task-origin isolation; the avatar repair does not replace security identity with character-name matching.
- No new `fetch`, WebSocket, dynamic-code execution, secret/API-key handling, raw-memory persistence, or external network destination was added.
- Counts/usages of `expectedChatId`, `expectedArchiveRevision`, `normalizeMemoryReference`, `isCurrentTaskOrigin`, and `saveSession` are unchanged from prompt-r3.
- The UI stylesheet block is byte-identical to prompt-r3; this hotfix does not alter the restored 0.8.9.1 visual baseline.

Targeted diff conclusion: no newly introduced Critical / High / Medium security issue found in this r4 change set. Real mobile-cloud browser behavior still requires device runtime verification because browser gesture synthesis differs across WebKit/Chromium wrappers.

## 0.8.10 UX / phone r8 focused diff review

Scope: `src/heartbeatMemories.js`, `manifest.json`, `index.js`, `CHANGELOG.md`, and `SECURITY.md`, compared with the r7 / current-GitHub functional baseline.

- Room rendering was reordered and de-overlapped without changing `normalizeRoom`, memory-reference validation, task origin binding, or session write scope.
- ADV mobile selection only accepts IDs already present in the current normalized `session.events`; the new top-level back path changes local view state only.
- Phone output is intentionally richer, but all `basis=记忆` entries still pass the unchanged `normalizeMemoryReference` ID + anchor check. Modern-phone core App counts (including location + persona-specific App), contact-detail depth, and 3×12-round deep-chat depth are now locally validated; one full regeneration retry is allowed if the first output is incomplete. Compact watch/communicator devices still have a higher richness floor (8 entries/apps minimum structure, 48 readable entries total) without forcing impossible modern-only features.
- The only new external-media surface is Gallery preview. A URL is retained only when it is valid http(s) and exactly matches a URL extracted from the current chat scope's already-activated `WORLD_INFO_TEXT`; the model cannot invent a new target. The image is not loaded until the user clicks the preview control and uses `referrerpolicy="no-referrer"`.
- No new `fetch()`, WebSocket, `eval()`, `new Function`, secret-value read, or cross-chat write path was added.
- `normalizeMemoryReference`, `saveSession`, `isCurrentTaskOrigin`, `captureTaskOrigin`, `requestJson`, `queueDeferredCommit`, `normalizeButterfly`, `normalizeAlbum`, `normalizeRoom`, and `normalizeItems` are byte-identical to r7.

Result: no new High/Medium security finding identified in this focused diff. Residual privacy note: if the user explicitly opens an allowlisted third-party Gallery image, that image host necessarily receives a network request from the browser; Referrer is suppressed and the load is never automatic.

## r11 memory-adapter delta

- Added only current-chat-scoped generic readers and summary adapters; no cross-chat index is used as evidence.
- Generic global discovery uses property descriptors and data-value method checks; it does not execute arbitrary getters while probing provider APIs.
- Chat metadata extraction traverses only summary/memory-labelled top-level keys and a fixed allowlist of content fields.
- World info, character cards, personas, and author-setting material remain setting-only context and are explicitly excluded from external-memory import evidence.
- External imported memories still require an existing externalId and an exact sourceExternalAnchor contained in the cited source content.
