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
11. 模型生成必须通过 SillyTavern 官方 Connection Manager Request Service。浏览器 `fetch` 只允许两个明确场景：硬编码同源 `/api/backends/chat-completions/status` 用于刷新模型；以及用户手动创建/更新档案时，经 SillyTavern `/proxy` 读取已启用记忆插件自己配置的当前聊天窗口记忆 API。任何模型输出都不得控制 fetch 目标 URL。
12. 模型列表刷新只可把 Profile 的 Secret ID 引用交给 SillyTavern 后端，由后端读取 Secret；浏览器端不得读取 API Key 明文。
13. 所有生成 session 必须绑定创建时的 `chatId` 与 `archiveRevision`；await 返回后重新校验，跨聊天或跨档案响应不得持久化。
14. 不对包含不可信档案/聊天正文的完整 Prompt 调用 SillyTavern 通用宏展开；仅允许本地展开 `{{char}}` / `{{user}}`，其余 `{{...}}` 必须中和。
15. 自动房间生活生成失败必须熔断当天自动重试；不得由定时器形成无上限 API 请求。
16. 生成输入在发送前必须执行字符/Token 预算；超限失败关闭。
17. 同一时刻只允许一个心跳回忆生成任务。把任务转到后台只是隐藏 UI，不得创建第二条并行模型请求。
18. 后台生成完成时仍必须执行与前台完全相同的 chatId/archiveRevision 校验；关闭 overlay 不能绕过数据隔离。
19. User Persona 可以作为设定上下文和世界书 dry-run 的 personaDescription，但不得被当作“已经发生的共同往事”证据。
20. 档案室未生成入口只允许显示锁定状态；查看入口不得隐式触发模型请求，基础包生成必须由用户显式点击“生成整套档案室内容”。

## Credentials

API 凭据由 SillyTavern Secrets / Connection Manager 持有。插件设置只保存 Connection Manager Profile ID、可选模型覆盖 ID、输出上限、温度和功能开关。

模型列表刷新向 SillyTavern 的同源后端提交 `secret_id`，而不是 Secret value。Profile 中的第三方 API URL 只作为后端状态请求参数，不会成为浏览器 `fetch()` 的目标地址。


## Current-chat external memory boundary

21. 外部记忆桥接只允许在用户显式“创建/更新档案”时运行；CG / ADV / 房间 / 蝴蝶效应不得直接读取外部记忆服务。
22. 每个 provider 必须绑定发起任务时的 `chatId`；任何 await 返回后如果当前 `chatId` 变化，数据必须丢弃/中止。
23. EverMind 适配器只允许读取当前聊天 metadata 中的 `st_evermind.group_id`；禁止读取或搜索 `char_group_id` / 角色级跨聊天记忆。
24. 外部 provider 凭据不得复制到心跳回忆 extension settings、chat metadata、日志、DOM、Prompt 或错误文本。对 EverMind 的现有明文 key 仅允许作为一次 `/proxy` 请求的瞬时 Authorization header。
25. 外部记忆内容与 API 响应均视为不可信数据；进入心跳回忆档案前必须经过结构化模型抽取、真实 provider record ID 白名单校验以及 `sourceExternalAnchor` 逐字证据校验。
26. 外部记忆桥接必须有独立条数/字符预算，不得因为 provider 数据规模绕过主生成输入预算。
