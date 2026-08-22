# Changelog

## 0.8.1

- 修复“今日生活”缺失 `isPlaceholderText` 导致的运行时错误。
- 修复每日生活失败后每 30 秒无限静默重试；失败当天写入 fallback 并停止自动重试，保留手动刷新。
- session/cache 新增 `chatId` 绑定，所有生成回写校验 chatId + archiveRevision；跨聊天迟到结果直接丢弃。
- 聊天切换与扩展销毁时 abort 在途生成；档案更新中切聊天不再静默丢失后仍提示成功。
- 移除对整段生成 Prompt 的 `substituteParams`，仅安全展开 `{{char}}` / `{{user}}`，其余 ST 宏中和。
- `sourceMemoryIds` 增加 `sourceMemoryAnchor` 语义证据校验。
- 普通生成档案输入最多均匀抽样 48 条并压缩字段；最终输入增加约 32k token / 96k 字符硬预算。
- 档案分块整理复用同一受控角色卡/世界书 envelope，避免每个 chunk 重跑 dry-run。
- 修复临时物件“先截断后过滤占位符”导致有效物件被误丢的问题。

## 0.8.0

- 移除“跟随酒馆当前 API”生成路径；心跳回忆现在始终固定使用一个 Connection Manager 专用连接。
- 新增“从酒馆当前连接一键导入”。
- 如果当前已经选中 Connection Manager Profile，则直接引用，不复制配置。
- 如果当前没有选中 Profile，则通过 SillyTavern 官方 slash-command 状态读取 API / URL / Model / Preset / Secret ID 等字段，创建一个专用 Profile。
- 一键导入只引用 Secret ID，不读取、显示或保存 API Key 明文。
- 导入前使用 `ConnectionManagerRequestService.validateProfile()` 验证连接类型。
- 相同连接会复用已有 Profile，避免重复创建。
- 保留 0.7.0 的多空间房间、每日生活时间线与手动档案边界。

## 0.7.0

- 新增现实时间驱动的“今日生活时间线”。
- 新增 Connection Manager 生成配置。
- 强化未归档聊天与房间生活状态的数据边界。
