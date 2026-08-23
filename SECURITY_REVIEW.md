## r15 targeted diff review — read-only edit transition + confession replay

Scope: r14 -> r15. The change adds an explicit user-controlled transition from read-only indexed archive snapshots into the corresponding real SillyTavern chat, and adds evidence-bound confession replay data/UI inside ENDING.

- Read-only remains the default for cross-archive snapshots. Disabling it requires a local checkbox action plus a fixed confirmation dialog; no model/archive/worldbook text can trigger the transition.
- Editing a historical snapshot never writes directly through the metadata snapshot. The plugin explicitly opens the indexed character/chat only after user confirmation, then verifies characterKey + chatId + current archive before exposing write actions.
- Active background tasks block the transition. Regeneration remains separately confirmed and keeps existing chatId/archiveRevision origin checks.
- Confession replays are normalized through normalizeMemoryReference and may be empty. They do not relax ENDING route evidence or turn future simulation into archive truth.
- No new arbitrary network target, credential read, eval/new Function, WebSocket or EventSource path was introduced.

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

## r12 CG image-generation targeted diff review

Scope: exact GitHub r11 baseline (`src/heartbeatMemories.js` blob `576fc7e234eda448a2f9aa7ee2e0c25740edf61f`) to local r12 CG-image patch.

- No direct image-provider endpoint, credential read, or provider-specific API client was added. Heartbeat calls only the already-registered SillyTavern `imagine` slash-command callback with `quiet=true` / `gallery=false`.
- CG drawing is an explicit user action with a cost/credit warning. It is never started by opening an album/ADV, selecting a card, a timer, or background archive generation.
- The outgoing prompt is capped and sanitized. URL-like content, `{{...}}` macro syntax, source-memory field names, world/memory envelope labels, and HTML-like tags are stripped before the visual prompt reaches Image Generation. The full chat, archive records, world-book text, external-memory records, phone contents, and secrets are never passed to the image command.
- The returned image reference is accepted only when it resolves to the current SillyTavern origin using http(s). `data:`, `blob:`, and cross-origin URLs are rejected. The DOM receives only an escaped same-origin path with `referrerpolicy=no-referrer`.
- The cache stores only `{url,prompt,provider,generatedAt}`; no base64 image bytes are stored in `chatMetadata`. Invalid/broken image loads fall back to the existing abstract CG layer.
- A CG draw captures `characterKey + chatId + archiveRevision`, rejects stale completion, uses the latest cached session before merging the image field, and blocks whole-mode regeneration while that mode has an image task. This avoids stale image completion overwriting a newer ADV/session snapshot.
- Plugin destruction increments a lifecycle epoch and clears local image-task state; a late external image result cannot write into the destroyed instance. Archive create/update and memory preflight treat an active CG draw as an active generation task.
- Added-line scan found no new `fetch`, `XMLHttpRequest`, WebSocket, EventSource, `eval`, `new Function`, Authorization header, API-key read, or direct `/api/` destination.

Targeted diff conclusion: no new Critical / High / Medium issue identified in the r12 change set. Residual runtime dependency: compatibility and billing behavior depend on the user's installed SillyTavern Image Generation configuration; the first build intentionally supports the registered `imagine` capability rather than probing arbitrary third-party plugin internals.


## 0.8.10 state-r13 targeted diff review

Scope: r12 CG-image package -> r13 state/archive patch. Changed source: `src/heartbeatMemories.js`; packaging/docs: `manifest.json`, `index.js`, `README.md`, `CHANGELOG.md`, `SECURITY.md`, `SECURITY_REVIEW.md`.

Security-sensitive changes reviewed:
- Incremental archive updates preserve old Mxxx records verbatim and only migrate derived-session `archiveRevision` fences when the old archived chat prefix still hashes to the previous chat fingerprint. If old messages changed, incremental update fails closed and requires explicit full rebuild.
- Full rebuild remains destructive and clears derived content; it now has a separate explicit confirmation path.
- Cross-archive viewing no longer invokes host character/chat switching. It reads only the indexed character's same-origin `/api/characters/chats` metadata on explicit user selection and renders a read-only snapshot. Snapshot mode blocks generation, CG redraw/clear, archive updates and room-life regeneration.
- Compressed cache read failures no longer degrade to an empty “not generated” state. The compressed metadata is left intact and the UI surfaces a recovery error.
- ADV partial batch generation no longer automatically fans out into multiple model requests. Individual repair requires an additional explicit confirmation with the maximum request count.
- No new arbitrary network destination, WebSocket/EventSource, eval/new Function, secret storage, or model-controlled fetch target was introduced. The only new runtime fetch reuses the pre-existing same-origin `/api/characters/chats` archive-metadata endpoint with a locally indexed avatar/chat target.

Result: no newly introduced Critical/High/Medium security finding identified in the targeted manual diff review. Runtime compatibility of server-returned chat metadata fields and browser compression APIs still requires real SillyTavern device testing.
## 0.8.10 cg-ui-r14 targeted diff review

Scope: r13 state/archive package -> r14 CG discoverability patch. Changed source: `src/heartbeatMemories.js`; packaging/docs: `manifest.json`, `index.js`, `README.md`, `CHANGELOG.md`, `SECURITY.md`, `SECURITY_REVIEW.md`.

The patch changes presentation and the classification of one indexed archive case. An indexed row is promoted to the live current archive only when its canonical character key and chat id both match the already-open SillyTavern context and that context already contains the corresponding Heartbeat Memories archive. No character/chat selection method is invoked. Other indexed archives remain snapshots and retain the existing write-action block.

The new album-card paint shortcut reaches the same `drawSelectedCgImage()` path as the existing detail button. It therefore retains explicit billing confirmation, one-image concurrency, visual-prompt sanitization, same-origin local-image-path validation, and task-origin / archive-revision checks. No direct provider API, arbitrary URL load, secret read, or background image generation was added.

Targeted diff conclusion: no new Critical / High / Medium issue identified in the r14 change set. Residual dependency remains the user's configured SillyTavern Image Generation provider and its billing/runtime behavior.

