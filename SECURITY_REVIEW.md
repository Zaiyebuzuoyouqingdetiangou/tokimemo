# Codex Security 差分复核 — 心跳回忆 0.8.7

基线：GitHub `Zaiyebuzuoyouqingdetiangou/tokimemo` main 0.8.6（`src/heartbeatMemories.js` blob `605adcacfa2bbd516f2401f4f52e9d81f5ca5019`）。0.8.7 同时包含此前 0.8.6.1 的性能修复。

本次重点审查：跨聊天后台任务绑定、延迟写回、全角色档案索引、公开记忆插件接口预读取、旧档案手动迁移扫描。

结论：本地差分复核未发现新增 Critical / High / Medium 安全问题。没有把该结论冒充为 Codex Security 托管扫描完成；当前会话使用的是插件安全技能指导下的本地差分检查。

安全边界：

- 切聊天不再取消网络请求，但结果不允许写入当前新聊天；只可写回原 `characterKey + chatId`。
- 后台请求继续使用任务发起时捕获的 context 做 `{{char}}` / `{{user}}` 安全展开和受控 envelope，不因切到另一角色而借用新窗口身份。
- 基础包/单项/ADV/房间生活结果还要求原 archiveRevision 匹配。
- 档案整理若在后台完成，回到原窗口时先比较可用消息数量；已变化则拒绝覆盖并要求重新更新。
- 公共记忆接口仍校验返回 chatId；返回其他窗口时拒绝。
- 建档前预读取仅保存在当前页面内存，不写入全局档案索引。
- 外部记忆扩大扫描后按约 26k 字符分块进入整理模型，并在最终 240 条档案中保留独立来源配额；没有把 provider 原始正文写入全局索引。
- 全局索引不保存原始聊天、外部记忆正文或 API Key。
- `/api/characters/chats` 的 `metadata:true` 只在用户主动“扫描旧版本已有档案”时调用，不在切聊天热路径自动执行。
- 没有新增 `eval` / `new Function` / `document.write` / 任意模型控制 URL 执行。
