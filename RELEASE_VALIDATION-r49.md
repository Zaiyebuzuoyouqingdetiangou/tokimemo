# 心跳回忆 0.8.45 / r49.0 候选验证记录

## 基线与范围

- 输入基线：`心跳回忆-0.8.44-r48.0-世界观节日贺卡候选.zip`
- 基线 SHA-256：`d991463d99829f7edae53f889d52333b61a2d5e3a7853e2eb37ce9e5422bdd49`
- 基线共 95 个 ZIP entries，CRC 检查通过；原 ZIP 保持未修改。
- 基线及初始工作树均没有用户要求先读的 `Heartbeat-Memories-Project-CURRENT.md`。本候选新增的同名文件明确标为“依据 r48 实际代码、已有架构/安全文档和本轮需求重建”，不是伪称读到了缺失旧文件。
- 兔子镜 ZIP 只作为用户自有的 API 稳定性行为参考；没有复制其 UI、存储、状态机、命名或代码。

## 已完成的根因修复

- ArchiveTarget 冻结并只读写用户明确选择的 A；B 可继续正常聊天。A 的 revision、删除、重建、同模式新任务、lifecycle 或持久 mode fence 变化都会令旧结果失败关闭。
- 派生内容按规范化、压缩、独立备份、metadata commit 的顺序保全；每个异步边界重查角色槽、chat、revision、delete fence 与 runtime lifecycle。IndexedDB 删除写 exact durable-key tombstone。
- Connection Profile 与手动 API 是两个独立 transport；一键入口明确要求 1.1.18。Profile B 不借用正文 A，手动线路不借用 Profile；模型列表、超时、abort、配置 epoch 与 saved-model fallback 均按本线路隔离。
- 删除 EverMind 私有 settings/metadata/API key 读取、任意全局 reader 和 ambient prompt/metadata 猜测。自动来源只保留登记的 `sillytavern-memory` 与柏宝书公开 API v1；未知插件走显式、惰性的 JSON/JSONL/TXT/Markdown 导入。
- 外部来源完整性矛盾一律降为 partial；公开 DTO 只读自有 data descriptor，不触发 getter；节点、记录与文本总量有界，来源账本保留出处、版本、覆盖状态和删除语义。
- World Presentation 统一 Room、Travel、Private Terminal 与 Holiday Card 的世界观权限；模型不能提供 HTML/CSS/JS/SVG path/URL/class/坐标/事件/目标身份。
- 共同回忆对白前扫描双方完整感情状态。Room 固定无正脸、按受控设定差异化；当前态与共同历史逐分句隔离，历史必须 exact Mxxx + 可见锚点。受控设定明确宠物时，漏掉对应物种会触发修复重试。
- Calendar 只有角色 authored 的 memo/todo/备注/随笔；贺卡要求今日精确节日证据并由本地有界 SVG 绘制。成就显示解锁条件，关系头像显示 NPC 视角，Travel 作为独立地图，Ending 彩蛋由本地交互代码驱动。
- 主题 alpha 只影响卡片表面，文字和主阅读层不使用父 `opacity`；文字对固体/合成背景均做 4.5:1 保护，关键 UI 抵抗普通宿主 CSS 的颜色、透明度和 writing-mode 污染。
- 反查用户私人终端因缺少能证明允许来源的隐私 schema 而安全阻断，没有用模拟内容冒充实现。

## 自动验证

- Node 完整回归：`310/310` 通过，`0 fail`。
- JavaScript / MJS 语法：`84/84` 通过。
- runtime：54 modules，连续两次构建字节一致。
  - source graph SHA-256：`b444c86b00bc3e5d45c98b7aa6bea51e8f06a7276bdeb6ce91eaae954af7b5e3`
  - bundle SHA-256：`da4821f43997fd1756a39f5a8a0a02dd600b6966f3d4c99eb020c7bb131a809a`
- Edge/Chromium bootstrap：320/375/390/430/768 px 无横向溢出，触摸按钮 46 px；普通启动和零解压诊断均 `0` 次 runtime request。
- Edge/Chromium IndexedDB：首次写读、同 browser context 新页面冷读、删除栅栏冷读、来源账本冷删除全部为 `true`。
- Edge/Chromium theme：host light/dark、card alpha、contrast、外部 CSS 污染、320/375/390/430 px overflow 与 44×44 关闭按钮全部通过；320 px 截图另经人工查看。
- Travel near 标记、下一句、重听以及 NPC 头像视角已固化为调用真实 overlay dispatcher 的永久动态回归。

## 多 reviewer 与安全结论

- Persistence / Archive、Connection / API、Room 文本与宠物、World/UI、测试覆盖及最终安全复核均为只读独立审查；生产代码只由主流程统一修改。
- 预发布共发现并阻断八类实质候选：旧 bundle、ambient 未登记来源、覆盖完整性矛盾、DTO getter、缓存 class authority、Room 历史改写/当前态误拦、明确宠物遗漏、主题 alpha 无效与宿主 CSS 祖先污染。它们均在共同权限边界修复并进入回归。
- 最终独立安全复核未发现仍可复现的 Critical / High / Medium / Low 问题。某个早期 UI reviewer 的最终工具回执未能取得，但它此前提供的全部具体反例均已永久测试化并由其他独立 reviewer 复核，不以“无回执”掩盖问题。
- 正式 Codex Security immutable-diff 报告、最终 ZIP SHA-256、CRC 与 fresh-extract 结果在封包后作为相邻交付物报告；这些值不能自引用地写入待哈希 ZIP 本身。

## 未修改与尚待真机

- 保留 `heartbeatMemoriesArchiveV3`、`heartbeatMemoriesTheaterV3`、Calendar v6、Phone v4、Room v3、Travel v4 与旧数据迁移；没有删除或改写 SillyTavern 聊天正文及第三方插件数据。
- 未执行 commit、push、branch、PR、Release 或任何 GitHub 写入。
- 自动测试不等于 iPhone + TT + 实际 SillyTavern。iPhone IndexedDB/WebView 杀进程恢复、TT safe area/触控/切聊、真实 1.1.18 Connection Manager、真实供应商/记忆插件、Cloudflare 老聊天复现、实际第三方主题污染、调色盘触控、房间/小人/Terminal/贺卡/纯书法视觉，以及 A 后台生成期间 B 真实继续聊天仍待宿主真机验收。
