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
