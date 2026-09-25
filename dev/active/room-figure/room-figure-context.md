# 房间小人 · 上下文

- 关键文件：`ui/roomPixelFigure.js`（画法）、`ui/roomInterior.js`（调用）、`modes/roomProfile.js`（`normalizeRoomVisualProfile`、`roomVisualEvidenceSupports`、`ROOM_VISUAL_VALUES`）、`modes/roomRender.js`（`renderRoom` 取 `session.visualProfile`）、`modes/roomData.js`（`refreshRoomFigure`：已有的“只更新人物外形”付费请求）、`core/castLooks.js`（`lookFromDescription`：从角色卡描述里挑外貌句）。
- 相关先例：r84.69 邮箱小画“模型漏画时只用已有明确外貌本地补绘，不额外请求”；r84.71 邮箱小画扩充了外貌词表（`core/letterIllustrationV2.js`）。
- 原则：模型输出只选枚举；颜色、坐标、形状都是代码自有。
- 新文件：`modes/roomFigureLocal.js`（`localRoomFigure`、`figureFromText`、`figureFromIdentity`、`roomFigureSources`）。
- 决策：
  - 优先级 已核验字段 > 角色卡 > 世界书 > 按身份推断 > 原值；推断只补空字段，**发色从不推断**。
  - 世界书：角色卡内嵌世界书同步读；角色卡绑定的外部世界书（`data.extensions.world`）异步读一次并缓存，读完若仍在同一房间就重画一次。只取关键词 / 标题含这个人名字的整条，或正文里点名他的句子。
  - 找卡：按名字唯一匹配角色卡；不唯一时只在当前聊天角色同名时用当前卡；否则不读卡，只按房间世界风格推断。
  - 结果只用于画小人，不写回房间存档，不改 `normalizeRoomVisualProfile`。
- 当前进度：r84.75 已实现，等用户看效果。
