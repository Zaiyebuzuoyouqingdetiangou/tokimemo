# Security Policy — 心跳回忆

## Trust boundaries

以下全部视为不可信输入：模型 JSON、聊天正文、角色卡、世界书、档案文本、Connection Manager Profile 显示字段、房间/每日生活数据以及模型提供的 memory IDs。

必须保持以下不变量：

1. 模型输出只作为结构化数据解析，不作为 HTML / CSS / JavaScript 执行。
2. DOM 动态文本必须经过转义或使用 `textContent`。
3. “过去已经发生”的内容必须来自用户最后一次手动创建/更新的聊天档案。
4. 与 {{user}} 有关的既往物件、事件、CG、房间痕迹和每日生活旧痕迹必须有有效 `sourceMemoryIds`，并通过被引用记忆 `anchors/title` 的 `sourceMemoryAnchor` 语义证据校验。
5. 聊天新增、编辑、删除不会自动重写聊天档案；只有用户手动更新档案才改变档案版本。
6. 房间可以按现实时间自动变化，但不得借此读取或推断尚未归档的新聊天。
7. 每日生活模型输出不得提供任意 CSS、URL 或脚本；视觉状态只能使用代码白名单枚举。
8. 心跳回忆不得实现自己的 API Key 明文存储。
9. 一键导入酒馆连接只能读取配置字段和当前 Secret ID；不得调用 Secret value 读取接口，不得把 Key 写入 extension settings、日志、DOM 或错误信息。
10. 心跳回忆固定使用显式选择的 Connection Manager Profile，不得在后台跟随主聊天连接悄悄切换模型。
11. 任何新增网络能力优先通过 SillyTavern 官方请求服务完成，不在扩展里直接向任意第三方地址发送聊天/档案数据。
12. 所有生成 session 必须绑定创建时的 `chatId` 与 `archiveRevision`；await 返回后必须重新校验，跨聊天或跨档案响应不得持久化。
13. 不对包含不可信档案/聊天正文的完整 Prompt 调用 SillyTavern 通用宏展开；仅允许本地展开 `{{char}}` / `{{user}}`，其余 `{{...}}` 必须中和。
14. 自动房间生活生成失败必须熔断当天自动重试；不得由定时器形成无上限 API 请求。
15. 生成输入在发送前必须执行字符/Token 预算；超限失败关闭，不把超大上下文交给模型。

## Credentials

API 凭据由 SillyTavern Secrets / Connection Manager 持有。插件设置只保存 Connection Manager Profile ID、输出上限、温度和功能开关。

“从酒馆当前连接一键导入”允许读取 `secret-id` slash command 返回的当前 Secret ID，但禁止读取 Secret value。
