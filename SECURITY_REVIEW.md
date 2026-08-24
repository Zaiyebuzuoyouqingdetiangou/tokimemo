## r21 targeted diff review — archive grouping / banned phrases / room layouts

- Scope: local r20 → r21 only. Reviewed archive-index grouping/migration, ambiguous legacy same-avatar handling, manual classification UI/actions, archive delete/index-remove actions, live-origin matching, task scope identity, generated-phrase enforcement, and room rendering/prompt changes.
- New/current archive index rows persist only a non-reversible local card fingerprint hash in addition to existing lightweight metadata. Automatic grouping prefers that fingerprint, so two cards with the same displayed name/avatar can remain separate when their card content differs; legacy rows without a fingerprint fall back to avatar+name and can be manually split.
- Archive classification writes only `heartbeatMemoriesArchiveIndexV1` plus lightweight `heartbeatMemoriesArchiveGroupsV1` metadata. It does not move, rename, delete, or rewrite SillyTavern chat files and does not mutate `MEMORY_KEY`/derived caches or grant write authority.
- Manual “new group” requires a user-selected SillyTavern character; manual move locks the row against later automatic reassignment. No host character/chat navigation was added.
- Legacy scans fetch each unique avatar once. If an old row has no fingerprint and multiple same-avatar/same-name cards are plausible, the scanner does not guess: it assigns a per-archive “待手动分类” presentation group until the user explicitly moves it.
- Actual archive deletion is live-current-chat only, double-confirmed, and rechecks runtime character identity + chatId before deleting Heartbeat metadata. It removes only Heartbeat archive/cache/runtime state and the lightweight index row; it never deletes/clears host chat messages. Non-live historical rows can only be removed from the library index.
- Cache compression persistence now revalidates the live archive and matching chatId/archiveRevision immediately before writing, so an in-flight gzip cannot resurrect CACHE_KEY after an explicit archive delete or revision change.
- Default banned generated phrase is `老子`. The Prompt asks the model not to use it; parsed derivative JSON is checked locally before normalization/save. Evidence-anchor fields are exempt so archived verbatim evidence remains byte-for-byte unchanged. Violations fail closed and do not auto-retry.
- Room diversity maps normalized room type/label to a fixed code-owned scene class plus one of three deterministic layout variants, and adds code-owned room-type props (e.g. studio monitors, bookshelves, bath fixtures, dining chairs, plants). Model output still cannot supply CSS/HTML/script/URL or arbitrary positioning.
- Focused smoke tests cover same-name/same-avatar cards with different fingerprints, ambiguous legacy rows, manual group creation/move, archive deletion metadata-only behavior, banned-phrase rejection with evidence-anchor exemption, and distinct room scene/layout mapping.
- No formal hosted Codex Security scan was available in this environment; this is a targeted manual diff review following Codex Security diff-review invariants.


## r18 targeted manual diff review — r17 audit follow-up

Scope: local r17 package SHA-256 `60f7926aee15223cecf8c88a7eb67ee1a0cab2b6735a2b549e7661ae773e352e` -> local r18 patch. This is a targeted Codex-Security-style manual diff review in this host, not a formal hosted Codex Security scan.

- Addressed audit R-1 by removing the ignored `preserveMode` argument from `showIndexedArchiveSnapshot`.
- Addressed audit R-2 by counting ordinary requests, mode-build reservations, ADV bulk/repair reservations, and CG/daily-strip image tasks in one logical admission set. ADV batch/repair and room-life now perform a front-door capacity check; `requestJson` retains an independent send-time gate.
- Addressed audit R-3 without weakening upgrade durability: shutdown still writes the complete raw fallback cache; caches over ~2M JSON characters only emit a console warning and are never selectively truncated.
- Addressed audit R-4 by renaming the overview route to `openArchiveSnapshotFromOverview` with an explicit no-host-navigation comment.
- Addressed audit R-5 by updating SECURITY.md to include the explicit “扫描记忆 / 摘要” preflight as an authorized external-memory trigger.
- Hardened audit R-7: dynamic third-party public memory reader execution now requires a separate explicit opt-in setting and defaults off. Passive prompt/metadata summaries remain available without executing third-party methods.
- Audit R-6 was checked against SillyTavern's public `SlashCommand` contract: callbacks explicitly accept `NamedArgumentsCapture`. Heartbeat now routes these calls through one helper that intentionally supplies only that public capture shape and does not fabricate parser-private scope/flags/controller objects. The current official `imagine` callback uses the named arguments plus trigger and remains compatible.
- Audit R-8 remains same-origin host behavior; UI/security documentation now states that custom Chat Completion headers may be passed to SillyTavern's hard-coded local model-status backend and are not persisted by Heartbeat.
- No automatic `selectCharacterById`, `openCharacterChat`, `reloadCurrentChat`, or `clearChat` path was introduced. No new arbitrary fetch target, WebSocket/EventSource, eval/new Function, secret-value storage, or external image URL acceptance was introduced.

Targeted conclusion: no new Critical / High / Medium security finding identified in the r18 audit-follow-up diff. Real SillyTavern validation is still required for provider-specific Image Generation behavior and third-party memory readers after explicit opt-in.

## r17 targeted manual diff review — archive write gating / isolated confession refresh / 5-task concurrency

Scope: exact current GitHub `src/heartbeatMemories.js` r16 blob `5873a4d8cdfa8f6bb29e6f81828c4070b0435ddf` -> local r17 patch. This is a targeted Codex-Security-style manual diff review in this host, not a formal hosted Codex Security scan.

- Removed the r15/r16 explicit host-navigation implementation from the read-only toggle: r17 contains no `selectCharacterById` or `openCharacterChat` call. Toggling read-only changes Heartbeat UI state only.
- Cross-archive snapshot write actions are gated by an exact live-context match (`characterKey + chatId + current MEMORY_KEY`). If the user has not manually opened that chat, the operation is rejected without host navigation. If a mode has no hydrated live session, the snapshot is not used as a substitute for write-back.
- ENDING confession refresh is a dedicated request with its own bounded task key. It normalizes the returned list through the same `normalizeMemoryReference` ID+anchor validator and merges only `confessionReplays`; existing endings/epilogues are preserved.
- Main generation concurrency increases from 4 to 5. Admission now counts the union of active request keys and mode-build scopes, closing the rapid-click window where several modes could pass admission before their request objects were registered.
- Image Generation re-detection only re-reads the already-registered local `imagine` command and rerenders Heartbeat UI. It adds no fetch/provider endpoint, secret read, or automatic image request.
- Added-line review found no new `fetch(`, XMLHttpRequest, WebSocket, EventSource, `eval(`, `new Function`, Authorization/API-key read, external network destination, or arbitrary DOM execution path.

Targeted conclusion: no new Critical / High / Medium security finding identified in the r17 changed behavior. Residual compatibility risk is limited to SillyTavern runtime timing (manual chat opening/cache hydration) and third-party Image Generation initialization; both fail closed rather than writing snapshot data into an unmatched chat.

## r16 targeted manual diff review — HEART / seasonal drama / daily strip / reverse confession

Scope: local r15 package -> local r16 patch. This is a targeted Codex-Security-style manual diff review in the current host, not a formal hosted Codex Security scan.

- Added `MODE.HEART` only as a derived session. Relationship tone requires a validated archive anchor; generated greetings, Voice Drama, Scenario Drama, and daily-strip scripts remain non-canonical simulations and never write `MEMORY_KEY`.
- Avatar clicks do not add a network destination or model call. For another character/history row they reuse the existing allowlisted same-origin archive snapshot loader, and they do not call `selectCharacterById/openCharacterChat`. Missing HEART content requires a separate explicit user generation action on the live current chat.
- The only new persistent global state is a bounded map of character key -> last avatar-visit timestamp. It carries no archive text, prompt content, credentials, URLs, or model result.
- Daily-strip drawing reuses the existing `imagine` provider path and same-origin image URL validator. The visual prompt is capped/sanitized and explicitly excludes text/speech bubbles; the stored image record remains path/prompt/provider/timestamp only.
- Reverse-confession availability remains model-proposed but is constrained by required archive memory IDs/anchor and future-simulation semantics; the prompt prohibits coercion and ungrounded third-party romance facts.
- No new direct provider API client, arbitrary fetch destination, WebSocket/EventSource, eval/new Function, Authorization/API-key read, or new secret storage was introduced by this patch.

Targeted review conclusion: no new Critical / High / Medium finding identified in the r16 changed behavior. Residual compatibility risk remains in third-party Image Generation runtime/provider behavior and in model completeness for the larger HEART JSON; both fail without lowering the archive evidence boundary.

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



## 0.8.10 memory-worldinfo r19 targeted diff review

Scope: r18 audit package -> r19 memory-related world-info selector.

- Added an explicit current-chat selector for companion worldbooks used to interpret memory-plugin summaries. Users may select a whole book or exact entry UIDs. The selection is stored in chat metadata as names/mode/UIDs only; raw worldbook content is not persisted by Heartbeat.
- Selected worldbook text is **context-only**, not evidence. It is appended only to the external-memory extraction prompt, cannot supply sourceExternalId/sourceExternalAnchor, and cannot generate an archive memory without a real current-chat external-memory record that passes the unchanged exact-anchor validation.
- Book names are allowlisted via SillyTavern public `getWorldInfoNames()` and read only through public `loadWorldInfo(name)`. The patch adds no direct fetch, external endpoint, credential read, host-chat navigation, or dynamic-code execution sink.
- World-info input is bounded to 8 books / 160 entries / 52k characters so an external-memory chunk plus its explanation context remains under the existing 96k input-character safety envelope.
- Changing any whole-book or exact-entry selection invalidates the current chat's preflight cache. The selector metadata key is excluded from generic chat-metadata summary discovery so it cannot recursively identify itself as memory content.
- Dynamic worldbook/entry labels and previews are escaped before HTML insertion; worldbook entry objects are read through data-property-safe helpers.

Targeted manual diff conclusion: no new Critical / High / Medium issue identified. Real SillyTavern device testing is still needed for large-worldbook UI ergonomics and the exact runtime return shape of installed-version `loadWorldInfo()`.


## 0.8.10 json-output-r20 targeted diff review

Scope: exact r19 package / GitHub-main source blob `3a962f8878dc8eb4214b986bbd2a08f26ae7739a` -> local r20 JSON-output patch.

- The previous archive-import `maxTokens: 4096` cap was removed. Archive chat/external-memory chunks request up to the user's configured limit, hard-capped at 30,000; the default user setting remains 16,384 so upgrades do not silently increase an existing user's spend ceiling. Main mode caps were raised to the same 30k ceiling but `generateConfiguredJson()` still takes `min(settings.maxTokens, requestedMax)`.
- JSON extraction no longer takes the substring from the first `{` through the last `}`. A quote/escape-aware balanced-object scanner considers complete top-level objects and parses the last valid one, which tolerates fenced JSON and surrounding prose without accepting an unclosed/truncated object.
- Empty final content, reasoning-only finalization, no JSON object, truncated JSON and invalid JSON are classified separately. Diagnostics expose only error type and character counts; reasoning/content text is not logged or persisted by the new code.
- Archive chunk retry is explicit and bounded: only a `retryableJson` error offers one native confirmation; cancel sends no extra request, confirm sends exactly one retry of that same chunk, and a second failure propagates. The archive write still occurs only after every chunk has succeeded and local normalization/evidence checks complete, so the old archive/cache remains intact on failure.
- Structured archive extraction temperature is capped at 0.35 without changing the user's configured temperature for creative modes.
- Added-line review found no new `fetch`, XMLHttpRequest, WebSocket/EventSource, dynamic-code execution, secret/API-key access, host chat navigation, or new metadata write sink. Existing `characterKey + chatId + archiveRevision` write guards are unchanged.
- Focused runtime tests covered fenced/prose JSON, braces inside strings, multiple top-level objects, reasoning-only empty final content, truncated output, non-JSON output, explicit one-time retry, and cancel-with-no-retry. Syntax/import checks pass.

Targeted manual conclusion: no newly introduced Critical / High / Medium issue identified in this patch. Provider-side behavior when a model cannot support the requested output length remains a runtime dependency; such provider errors are surfaced rather than retried automatically.

## r22 ENDING / shared-album / Image Generation targeted diff review

Scope: r21 archive-room package -> r22 ending-album-image patch. Changed runtime source: `src/heartbeatMemories.js`; packaging/docs: `index.js`, `manifest.json`, `README.md`, `CHANGELOG.md`, `SECURITY.md`, `SECURITY_REVIEW.md`.

- ENDING is split into an evidence-backed route outline, a separate historical-confession scan, and one request per currently available route. The outline and final merged session still use the existing local memory-ID/anchor normalization; the change reduces model request size without weakening the archive evidence boundary. A route detail is rejected when its route ID changes, its terminal scene/confession is undersized, or fewer than three substantial epilogue scenes survive normalization. A route gets at most one bounded retry; persistent failure returns before the normal session commit, so the old ENDING cache is not replaced by a partial result.
- Album `comments` changed semantics and presentation only. They remain escaped model text attached to an already normalized CG item and do not become archive evidence or executable content.
- Image Generation capability discovery now accepts the public `/imagine`, `/sd`, or `/img` callback objects exposed by SillyTavern. Direct callback invocation remains the preferred path and bypasses the STscript parser entirely.
- The new manual fallback is explicit opt-in and uses only SillyTavern's public `executeSlashCommandsWithOptions` with the fixed `/sd quiet=true` command. Before parser entry, `{}` are removed, CR/LF are collapsed, backslashes are doubled, and `|` is escaped. A focused test used `{{getvar::secret}}`, a newline, `| /send`, and a backslash and verified that no macro braces, newline, or unescaped pipeline remained in the executed command.
- The r12 outgoing visual prompt sanitizer still runs before either image path, so URL-like text, memory/world envelope labels and HTML-like tags remain stripped. The patch adds no provider endpoint, credential/API-key read, arbitrary fetch target, dynamic-code execution sink, background image trigger, or cross-chat write path. Existing same-origin image URL validation and image-task origin/revision fencing are unchanged.
- Static syntax checks passed for `src/heartbeatMemories.js` and `index.js`. Focused normalization tests rejected an ENDING outline missing `open` and one with `route.available=false`; a direct `/sd` callback test preserved its parser-free callback contract while supplying only `quiet=true` and `gallery=false` named arguments.

Targeted diff conclusion: no new Critical / High / Medium security issue identified in the r22 change set. Residual runtime dependency: exact `/sd` registration and provider behavior vary by SillyTavern/Image Generation version; when automatic callback discovery fails, the parser fallback remains disabled until the user explicitly enables it.

## r23 stable segmented generation targeted diff review

Scope: GitHub-main r22 `ending-album-image` -> local r23 `stable-segments`. Runtime source change: `src/heartbeatMemories.js`; packaging/docs: `index.js`, `manifest.json`, `README.md`, `CHANGELOG.md`, `SECURITY.md`, `SECURITY_REVIEW.md`.

- The large ALBUM, PHONE and HEART outputs are decomposed into bounded child requests. ENDING keeps its r22 outline/detail split but runs the independent confession scan concurrently and generates available route bodies with a maximum of three sibling workers. Every child request still goes through the existing `requestJson()` / `generateConfiguredJson()` / Connection Manager boundary; the patch adds no provider endpoint, raw credential access, arbitrary fetch, Slash Command execution, dynamic-code execution, HTML execution sink, or host-chat navigation.
- Segmentation does not make partial model output authoritative. Album CG directory/evidence, album comment batches, phone plan/App details, HEART core/drama parts and ENDING route details are locally normalized before merge; the existing final mode normalizer runs again on the merged object. `generateMode()` still writes only after a complete session exists, then requires the original task origin and unchanged `archiveRevision`; otherwise the already-existing deferred-commit path is used. A failed child therefore does not save a half-built session over the prior cache.
- Child concurrency is bounded to three per segmented mode and remains under the pre-existing global generation-task gate. The concurrent mapper preserves deterministic result order and, after the first child error, stops scheduling additional siblings; already in-flight calls are allowed to settle. Child task keys derive from `safeId`-bounded model IDs where model-generated identifiers participate in a task key.
- PHONE's previous one-shot output required a very large device tree and also applied three 24-message deep chats to compact devices. r23 makes the device/App directory one evidence-light plan, then validates each App independently. `basis=记忆` entries still require valid current-archive memory IDs and anchors. Phone keeps three 24-message deep chats; terminal requires two; watch/communicator require one 12-message chat, matching their compact-device semantics instead of silently weakening phone requirements.
- Prompt-trust review found two hardening opportunities while implementing segmentation. Model-generated phone labels/device names are never interpolated into trusted instruction text; they are carried only in `UNTRUSTED_PHONE_DEVICE_JSON` / `UNTRUSTED_APP_PLAN_JSON`. ENDING route titles are likewise no longer interpolated into `promptSafetyBoundary()` labels. Retry instructions use a fixed local validation message rather than inserting model/error-derived prose back into the trusted prompt.
- ALBUM comments remain derivative present-day dialogue attached to already evidence-normalized CG rows and cannot become archive evidence. HEART Voice/Scenario material remains explicitly simulated and is never written into `MEMORY_KEY`. ENDING availability is still decided by the evidence-backed normalized outline before route bodies are requested.
- Static syntax checks passed for `src/heartbeatMemories.js` and `index.js`; `manifest.json` parses. Focused runtime normalization tests cover a 15/12/3 album index plus comment batches, HEART core + post/seasonal Voice + Scenario parts, a 10-App/65-entry phone including three 24-message deep chats, a compact watch with one 12-message deep chat, deterministic max-three concurrency, and stop-scheduling-after-first-error behavior. Added-line sink review found no new `fetch`, `XMLHttpRequest`, `eval`, `new Function`, HTML insertion, storage, Slash Command, `saveSession`, or deferred-commit sink.

Targeted diff conclusion: no newly introduced Critical / High / Medium security issue identified in r23. Residual runtime uncertainty is provider-side: some Connection Manager/provider configurations may rate-limit three concurrent long requests, and no live SillyTavern/provider integration environment is available in this review. Such failures remain bounded to their child segment and do not authorize a partial session commit.

## r24 request coordinator / confession player targeted diff review

Scope: local r23 `stable-segments` package -> local r24 `request-coordinator`. Runtime source: `src/heartbeatMemories.js`; packaging/docs: `index.js`, `manifest.json`, `README.md`, `CHANGELOG.md`, `SECURITY.md`, `SECURITY_REVIEW.md`.

- The r23 double-accounting path was reproduced from the actual task registry: a parent `activeModeBuildScope` and its differently named child requests were separate logical keys. With another mode active, an ENDING parent plus confession/route children could reach the five-task gate and reject a sibling request created by the same parent. r24 folds child task keys back to their longest active parent scope while preserving distinct child AbortControllers and labels.
- Provider traffic now crosses a FIFO permit queue capped at two active requests. Segmented ALBUM comments, PHONE Apps, HEART parts and ENDING route bodies are scheduled sequentially inside each mode. Queue waiters listen to their request signal and are removed on abort; permit release is idempotent and runs in `requestJson()` `finally` handling.
- `requestJson()` wraps the Connection Manager promise in a local 300-second lifecycle timeout (hard-clamped to 30–600 seconds). The local timeout rejects and releases task/permit state even if an upstream adapter ignores AbortSignal; the late promise already has resolution/rejection handlers and cannot commit a session. Timeout is deliberately non-retryable to avoid overlapping a possibly still-running provider request or charging the same segment twice.
- Connection failures are converted into bounded local categories for auth, rate limit, context limit, missing profile/model/endpoint, invalid request, upstream timeout/server failure, and unknown failure. User-visible messages include at most a numeric HTTP status or short code and do not include model content, prompt/context envelopes, response bodies, headers or credentials.
- Retry behavior is now allowlisted. JSON extraction and local segment validation, 429, and temporary upstream/server errors can retry the same segment once; authentication, configuration, context limit, invalid request, banned phrase, abort, and local lifecycle timeout do not. Completed segments remain in memory only until the final mode normalizer succeeds; the existing atomic session commit and origin/revision fences are unchanged.
- ENDING route detail adds `confessionLines` and keeps a derived legacy `confession` string. The player obtains the avatar only through `heartCharacterAvatarUrl()`, escapes avatar/name/text before HTML insertion, and performs old-cache sentence splitting locally. It adds no model-supplied URL, fetch, storage authority, chat write, world-info write, Slash Command, or dynamic execution sink.

Focused verification covered syntax/import parsing, parent/child logical-key folding, a two-permit maximum with FIFO release, queued abort removal, timeout rejection and permit/task release, non-retryable timeout/auth/context classes, one-time retry eligibility for validation/429/5xx, new confession line normalization, and legacy confession splitting. Full live provider integration was not available; actual upstream cancellation still depends on the Connection Manager adapter, while local waiting and writeback are bounded independently.

## r25 incremental important nodes / split HEART / achievements targeted diff review

Scope: r24 `request-coordinator` package -> local r25 `incremental-achievements`. Runtime source: `src/heartbeatMemories.js`; regression tests: `tests/requestCoordinator.test.mjs`; packaging/docs: `index.js`, `manifest.json`, `README.md`, `CHANGELOG.md`, `SECURITY.md`, `SECURITY_REVIEW.md`.

- Album and CG/ADV fixed-volume requirements were replaced with incremental important-node collection. Fresh rows are normalized before merge. Album's final merge goes back through `normalizeAlbum`; ADV merge was additionally challenged with a stale-cache case and now re-runs every retained row through `normalizeEventCandidate` against the current memory bank before preserving an old CG image or ADV body. A stale event whose current ID/anchor no longer validates is dropped instead of being kept authoritative by the merge key.
- ADV bulk text generation is capped at six events per provider request. Existing evidence-scoped `MEMORY_POOL_JSON` behavior is unchanged. The cap only selects the next unfinished/retry batch; it does not bypass normalization, task origin, archive revision, or session commit checks.
- ENDING avatar/dialogue playback moved from future route detail to evidence-backed confession replay. Route normalization no longer requires `confessionLines`; confession replay normalization still requires real current memory references. The player uses the existing local character-avatar helper and HTML-escapes character name and every generated line. No model URL is accepted for the avatar.
- HEART now permits a dialogue-only base session and independently generated seasonal/future Drama and daily strips. Each update re-runs `normalizeHeart` with the current memory bank before `saveSession`, then uses the existing current-origin plus unchanged-archive-revision fence; optional Voice/Scenario/strip data remains derivative simulation and does not write `MEMORY_KEY`.
- PHONE retains the fixed App-kind allowlist while reducing planned item/deep-chat counts. Review of the changed App prompt removed model-generated App label/kind interpolation from trusted instruction prose: the plan stays inside `UNTRUSTED_APP_PLAN_JSON`. Existing per-entry evidence normalization remains responsible for any claimed shared history.
- The new Achievement Library accepts only bounded plain-text fields plus a fixed tier enum. `unlocked=true` rows pass `normalizeMemoryReference`; locked rows do not receive authoritative memory references. Incremental merge is re-normalized against the current archive, so an old unlocked row cannot survive after its backing evidence disappears. Renderer review found all model strings passed through `esc()`, while icon classes come only from a local tier-to-icon mapping.
- Added-line sink review found no new arbitrary `fetch`, `XMLHttpRequest`, Slash Command execution, dynamic code execution, provider endpoint, credential/API-key read, model-controlled HTML/CSS/URL sink, world-info write, or host-chat navigation. The new session writes are HEART derivative updates and continue through the pre-existing writeability/origin/revision protections.
- UI simplification removes explanatory copy only. Read-only controls, explicit destructive confirmations, writable-archive checks, r24 two-provider permit queue, lifecycle timeout, retry allowlist, banned-generated-phrase policy, deferred-commit fencing, and existing image-generation boundaries remain present.

Focused verification: `node --check src/heartbeatMemories.js`, `node --check index.js`, `python -m json.tool manifest.json`, `git diff --check`, and the Node regression suite pass. The suite covers the six-ADV batch cap, parent/child request accounting, provider permit/abort/timeout behavior, safe error classification, route-vs-confession playback placement, small evidence-backed Album/ADV sets, stale ADV evidence removal during incremental merge, the ~33-entry 10-App phone plan, dialogue-only HEART persistence, and evidence-backed unlocked versus locked achievements.

Targeted diff conclusion: no newly introduced Critical / High / Medium security issue identified in r25. Remaining uncertainty is live integration only: no real SillyTavern Connection Manager/Image Generation provider is available in this local review, so provider-specific latency/format quirks cannot be reproduced here; failures remain bounded by the unchanged r24 request coordinator and atomic/deferred commit fences.

## r26 resumable phone / per-season Drama / compact settings targeted diff review

Scope: exact GitHub-main r25 `incremental-achievements` source blob `4497967996fd81be7925266557953c9c45fb349f` -> local r26 `lean-resume-seasons`. Runtime source: `src/heartbeatMemories.js`; regression tests: `tests/requestCoordinator.test.mjs`; packaging/docs: `index.js`, `manifest.json`, `README.md`, `CHANGELOG.md`, `SECURITY.md`, `SECURITY_REVIEW.md`.

- Settings cleanup removes presentation-only explanatory paragraphs. Connection/model selectors, max-output/temperature controls, banned-phrase policy, Image Generation opt-in, memory-reader opt-in, archive write guards and destructive confirmations remain present. The removed status target had only a guarded optional UI update, so its absence does not change request or credential behavior.
- HEART speaker labels now resolve from the current SillyTavern context or already-loaded archive snapshot. Both names and generated dialogue remain passed through the existing HTML escaper before insertion; the model cannot provide an avatar URL or display-name HTML fragment through this change.
- Seasonal Drama is stored one season at a time. Review found a stale-base race in the initial implementation: two different season buttons could have generated concurrently from the same old HEART session and the later commit could have discarded the earlier successful season. The patch was hardened so period dialogue, strips and every season share one `heart-section:<scope>` build guard. Users may generate each season independently, but same-chat HEART section writes are serialized; each successful update still re-runs `normalizeHeart` and the existing current-origin + unchanged-archive-revision fence before save/deferred commit.
- Phone continuation data is stored only under the existing Heartbeat derived cache, never `MEMORY_KEY`. A draft is accepted only for the exact current `chatId + archiveRevision`, and archive revision migration deletes it. Each completed App must first pass the existing completeness/evidence validator, then is copied through a bounded field whitelist before persistence. Unknown model keys and nested objects are dropped.
- The phone plan written into a draft is also bounded. During review, `liveStates` was tightened from a pass-through plan object to four code-known dayparts with bounded lock/status text and badge counts restricted to planned App IDs. This prevents the new resume cache from persisting arbitrary model-owned nested state. Resume re-normalizes both the plan and each saved App before skipping it, and the final device still passes full `normalizePhone` before becoming a session.
- Successful Phone session commit deletes the draft. A failure preserves only validated completed Apps and a short bounded diagnostic; the next room action resumes remaining App IDs instead of replaying completed requests. If the current chat or archive revision changes, the draft is ignored/deleted rather than rebound.
- Added-line sink review found no new outbound `fetch`/XHR, Slash Command execution, dynamic-code execution, provider endpoint, credential/API-key read, model-controlled HTML/CSS/URL sink, world-info write, host-chat navigation, or authoritative archive-memory write. The only new persistent write is bounded derivative phone-draft state inside the pre-existing Heartbeat cache.

Focused verification passed: `node --check src/heartbeatMemories.js`, `node --check index.js`, `python -m json.tool manifest.json`, `git diff --check`, and the 15-test Node regression suite. Coverage includes settings-copy removal, real-name rendering, single-season normalization without sibling seasons, shared HEART section serialization, ~33-entry phone planning, draft-field whitelisting, draft-plan badge/state bounding, existing provider queue/abort/timeout/error classification, evidence checks and prior r25 regressions.

Targeted diff conclusion: no newly introduced Critical / High / Medium security issue identified after the two hardening changes above. Remaining uncertainty is live SillyTavern/provider integration only: this environment cannot reproduce provider-specific latency, response-shape or mobile UI behavior, but resume and writeback remain bounded by the existing request coordinator and chat/revision fences.


## r27 concurrent seasonal Drama targeted diff review

Scope: r26 `lean-resume-seasons` -> r27 `concurrent-drama`. Runtime changes are limited to HEART task coordination, split seasonal prompts/validators, partial patch persistence, deferred HEART patch merging, and small UI state labels; tests/docs/package queries changed accordingly.

- The r26 root cause was confirmed: every season used the same `heart-section:${scope}` build key, so a second season was rejected before reaching the provider. r27 uses a fixed internal key family `heart-season:${scope}:${normalizedSeason}`; season is constrained to the code-defined five-value allowlist. This increases logical concurrency but does not increase the existing two-permit provider ceiling.
- Spring/summer/autumn/winter no longer ask one model response to contain both Voice and Scenario. Each segment has a fixed expected kind/season and passes `normalizeVoiceDramaPart` or `normalizeScenarioDramaPart` before persistence. Threshold reductions only accept shorter bounded plain-text scripts; they do not introduce new fields, sinks, URLs, commands, HTML, or archive evidence.
- Concurrent completion was reviewed for lost-update behavior. r27 persists normalized HEART patches rather than stale whole-session snapshots. Before a live write it reloads the latest same-chat session, applies only the relevant season component, re-runs `normalizeHeart`, verifies origin/revision, then uses the existing `saveSession`. Deferred patches are merged by internal patch key and revalidated on return to the original chat.
- Model output cannot control patch keys or target season: both are derived from the UI action after a five-value allowlist check. Patch payloads are objects already normalized by existing bounded text/script normalizers. No new `fetch`, XMLHttpRequest, Slash Command execution, dynamic code execution, provider endpoint, credential/API-key access, world-info write, host-chat navigation, or `MEMORY_KEY` write was added.
- UI partial state (`1/2`, `补全`) is computed only from normalized session arrays. Script rendering continues through the existing escaped HEART renderer and real-name label path.
- Focused verification covers independent season logical keys, the unchanged two-provider permit cap, smaller Voice/Scenario validators, sibling-season patch merge, legacy r26 regressions, syntax, manifest parsing, and ZIP extraction.

Targeted diff conclusion: no new Critical / High / Medium security issue identified in the r27 change set. Residual runtime dependency remains the selected Connection Manager/provider: five season tasks may be queued, but only two provider calls are intentionally in flight at once.
## r28 network-idle cache persistence targeted diff review

Scope: r27 `concurrent-drama` -> r28 `network-idle-cache`. Runtime changes are limited to cache persistence scheduling and the immediate uncompressed-cache fallback predicate; tests/docs/package queries changed accordingly.

- Root cause review found that partial generators call `saveSession` / phone draft persistence frequently. The theater cache can legally reach 12,000,000 source characters and 4,000,000 base64 characters after gzip. Each durable metadata write therefore has a potentially much larger network footprint than the small partial result that triggered it. r28 keeps partial results in the existing runtime cache and postpones gzip/chat-metadata persistence while any provider request is active or queued, coalescing repeated partial saves into the latest cache object.
- The provider queue itself is unchanged at a maximum of two permits. The new `shouldDeferCachePersistForProviderTraffic()` predicate observes only internal counters and cannot be influenced by model output. No new timer input, URL, fetch, provider endpoint, Slash Command, DOM sink, credential read, or archive write capability was introduced.
- Modern browsers with `CompressionStream` no longer perform the previous immediate raw-cache metadata write before the compressed write. Browsers without that API keep the old uncompressed fallback, preserving compatibility. This changes durability timing only; canonical archive memory is not moved into runtime-only storage.
- Delayed persistence still enters `persistCompressedCacheNow`, which rechecks current chat scope and `cacheStillMatchesLiveArchive`; a stale compression result after navigation/revision change is rejected or parked in the existing pending map. Removing the immediate raw write therefore does not weaken cross-chat or revision isolation.
- Focused regression tests verify that cache persistence is considered deferred while provider permits/queue entries exist, becomes eligible after the provider queue drains, and that modern `CompressionStream` environments do not choose the immediate uncompressed-cache path. Existing r27 provider, HEART partial-patch, phone draft, evidence and error-classification tests remain green.
- The HEART season-card review also corrected a UI-only state bug: `postending` has no Scenario payload, so the card may never derive a synthetic `1/2` state from the placeholder `hasScenario=true`.

Targeted diff conclusion: no new Critical / High / Medium security issue identified. Residual trade-off is availability/durability rather than security: if the page is force-closed before the provider queue becomes idle and the scheduled gzip flush runs, the newest derivative partial result can be lost from persistent metadata; the previous durable cache remains authoritative.

## r29 60k output ceiling targeted diff review

Scope: r28 `network-idle-cache` -> r29 `output-60k`. Runtime changes are limited to the bounded output ceiling, settings input maximum, and safe JSON-output budget diagnostics.

- The prior 30k behavior was confirmed to be local: `MAX_GENERATION_OUTPUT_TOKENS = 30000`, settings normalization used `Math.min(MAX_GENERATION_OUTPUT_TOKENS, settings.maxTokens)`, and the settings number input declared `max="30000"`. r29 changes the single absolute ceiling and UI maximum to 60,000, so a user-selected 60,000 survives normalization.
- The local JSON parser previously truncated both final content and reasoning at 240,000 characters. r29 raises that parser-only bound to 600,000 characters so a valid 60k-token response is not self-truncated before balanced-object parsing; the value remains bounded and does not affect prompt/input budgets.
- `generateConfiguredJson` still computes `responseLength = min(user setting, explicit segment request)`. Therefore a feature requesting 3,000 tokens remains capped at 3,000 even when the global setting is 60,000. No feature-specific segment was silently expanded by this patch.
- JSON empty/truncated diagnostics now receive only the already-computed numeric `responseLength` and normalized user setting. The new diagnostic text exposes numeric budgets only; it does not include the prompt, response body, reasoning body, credentials, headers, archive/world-info data, or provider secrets.
- The change adds no new network endpoint, request concurrency, retry, fetch/XHR, Slash Command execution, dynamic code execution, HTML/CSS/URL sink, credential/API-key access, host-chat navigation, world-info write, or `MEMORY_KEY` write. Existing provider errors remain authoritative when the selected model/proxy rejects a requested output size.

Targeted diff conclusion: no newly introduced Critical / High / Medium security issue identified. Residual operational risk is provider compatibility/cost: models or proxies may reject or bill for large output ceilings; the plugin remains bounded at 60,000 and retains smaller per-feature segment caps where defined.
