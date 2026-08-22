# Changelog

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
