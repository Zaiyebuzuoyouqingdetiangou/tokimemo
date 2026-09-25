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
- 当前进度：r84.75 实现，r84.79 修复复核问题，等用户看效果。

## r84.78 复核发现（2026-09-25）→ r84.79 已修（用户要求 1、2、3 一起修，第 4 条画法顺手调）

- 英文卡误判（子串匹配没有词边界）：that→头饰（hat）、childhood→兜帽（hood）、himself / herself→奇幻（elf）、image / damage→奇幻（mage）、pursuit→正装（suit）、abroad→宽肩（broad）、wardrobe→长袍（robe）、bunny / bundle→束发（bun）。
- 中文卡用“你”指用户时，“你穿着红裙”会算到角色身上（只过滤了 {{user}}）；写别人（“他的妹妹穿粉裙”）的句子也会算到角色身上。
- 按身份推断读整张卡：“带过很多学生”→校服（只在卡里完全没写外形时发生）。
- “long black hair” 认不出长发（只认 long hair 连写）。
- 多人房间的绑定世界书异步读完后不重画，下次打开才生效。
- 像素画：寸头与默认几乎一样（只是下巴变宽）、兜帽是一块方框、耳机头梁悬空、角像耳朵。

### r84.79 修法

- 英文关键词全部按整词匹配（`\b`）；英文发色 / 瞳色允许中间夹词（long black hair、bright blue eyes）；英文否定（not / never / without / doesn't）。
- `characterClauses`：按句、再按逗号分句判断主语——句首是 你 / 您 / {{user}} / 用户名（context.name1）→ 用户；“他的妹妹”“his sister”这类亲属 / 身边人称谓 → 别人；他 / 她 / 角色名 / {{char}} → 角色；没写主语的分句沿用同一句前一个分句，每句开头默认角色本人。只有角色本人的分句参与识别。
- 按身份推断：逐个分句看，身份词前面要有 是 / 为 / 身为 / 作为 / 担任 / 身份 / 职业…（英文 is a / works as…），或整个分句就是身份词（“剑修”）。
- 多人房间：绑定世界书读完后，若仍在同一房间就重画。
- 画法：寸头只留贴头皮一层头发；兜帽换成布料包住后脑、露出刘海；耳机头梁贴着头顶再接耳罩；角改为两段细角。其他发型的输出与 r84.75 逐字相同（已比对）。
- 测试：`tests/room-figure-local.test.mjs` 新增 3 组（英文整词、用户 / 别人分句、身份推断）。
