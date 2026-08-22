# 心跳回忆 0.8.6 — GitHub `main` → 0.8.6 差分安全复核

## 结论

**本地差分复核未发现本轮新增的 Critical / High / Medium 级安全问题，可作为真机候选版继续测试。** 本报告按 Codex Security `security-diff-scan` 的变更面思路逐项检查本轮新增路径；当前会话没有可调用的完整 Codex Security 扫描执行器，因此这不是“Codex Security 服务端扫描已通过”的声明。

### 基线校验

本轮不是拿本地 ZIP 猜 GitHub 版本。复核时逐文件对照了 `Zaiyebuzuoyouqingdetiangou/tokimemo` 当前 `main`：仓库的 README / LICENSE / manifest 等已经是 0.8.5 元数据，但 `src/heartbeatMemories.js` 的 Git blob SHA 仍为 `a55d50d71f340c61242c82928e0d039077d540c8`，与本地 0.8.4 主源码完全一致，而不是此前本地 0.8.5 候选源码。因此 0.8.6 同时把未真正进入 GitHub 主源码的长聊天覆盖、后台减卡、共同回忆加深等改进正式滚入当前 main 基线。

## 本轮新增/变更执行面

1. **档案室一览**：新增固定同源 `POST /api/characters/chats`，只请求当前角色 avatar 的聊天列表与 metadata。显示值全部 `esc()`；可切换的 chat ID 必须来自本轮服务端响应 allowlist。后台任务期间禁止通过一览切聊天。
2. **公开记忆插件桥接**：参考已有公开接口模式检测已加载记忆插件主动暴露的 `getInjectedHistory()` 与可选 `getSnapshot()`。不导入或依赖其他项目源码；不读取插件私有数据库。调用前后验证当前 chatId；接口显式返回的 chat ID 不同则整源拒绝。
3. **外部记忆仍只在手动建档/更新时读取**：公开 provider 返回值被当作不可信文本，经外部记录预算、结构化抽取、record ID + anchor 证据链后才可进入心跳档案。CG/ADV/房间/蝴蝶生成不会直接重新调用记忆 provider。
4. **房间深层玩法**：items / phone session 仍经过原有结构化 normalize、递归/数量限制和记忆证据校验，但从档案室主入口移除，只能由房间本地按钮打开；没有新增网络/设备调用。
5. **蝴蝶效应证据语义修正**：主时间线继续强制真实 `sourceMemoryIds + sourceMemoryAnchor`；8+ 外延节点与 TRUE ENDING 明确属于模拟世界线，因此不再要求伪造真实记忆引用。模拟数据不会写入 MEMORY_KEY。每个节点 monologue <100 字直接拒绝。
6. **蝴蝶 UI**：动态文本全部经 `esc()`；1 秒干扰动画和 CRT 噪点均为本地固定 CSS/DOM，不接受模型 HTML/CSS/URL。

## 网络面

源码中的浏览器 `fetch()` 当前只有：

- `/api/backends/chat-completions/status`：固定同源模型列表刷新；
- `/api/characters/chats`：固定同源档案室一览；
- `/proxy?url=...`：既有 EverMind 当前聊天适配，URL 只来自该记忆插件自身已保存配置，不来自模型输出。

通用 `getInjectedHistory()` provider 桥接本身不发网络请求；若 provider 自己内部联网，那属于该已安装插件自己的公开 API 行为。

## 回归验证

- `node --check index.js`：通过。
- `node --check src/heartbeatMemories.js`：通过。
- 模拟主线 + 8 外延 + Ω：10 个蝴蝶节点通过；外延节点无需 sourceMemoryIds，主线仍必须真实档案锚点；终端五区 I～V、1 秒本地干扰切换和末端 Ω 彩蛋均由固定本地 UI 实现。
- 公共记忆 provider：当前聊天返回可读取；显式返回另一个 chatId 时整源拒绝。
- 800 条可用消息（约 400 轮级规模）模拟：第 1～800 条均进入全窗口档案扫描，没有退回“只取近期”。
- 档案一览：单个 chat metadata 可正确映射为一条独立档案卡。
- 静态检查：档案室可见 portal 只有 album / adv / room / butterfly；items / phone 仅从 room action 进入。
- `eval` / `new Function`：无新增。

## 仍需真机验证

- `/api/characters/chats` 在拥有大量超大 chat metadata 时首次打开一览的响应体大小与手机端流畅度；已有 60 秒缓存并提供手动刷新，必要时可进一步改成轻量索引。
- 用户实际安装的各种 `getInjectedHistory()` provider 返回结构/异步语义；当前实现兼容 string、常见 text/content/summary 字段及 nodes。
- 房间 → 翻找物品 / 私人终端在真实手机屏幕上的返回层级与滚动。
- 蝴蝶效应 8+ 分支树在窄屏上的节点密度和 1 秒干扰动画体验。
