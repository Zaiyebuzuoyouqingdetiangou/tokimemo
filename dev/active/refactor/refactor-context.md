# 重构 · 上下文

## 基线身份

| 项 | 值 |
|---|---|
| 起点上传包 | `hearttrace-upload.zip`，SHA-256 `f55a78aca6c79529d6d04985f4c1f29ceda86b50272332eb4d6b2d1d12fd3353` |
| 起点版本 | 0.99.19 / `0.99.19-r84.71-archive-resilience` |
| 起点 bundle | 176 个模块，4,535,750 字节，SHA-256 `f7d2259666c0616478699350816e06fb2b4e613ba5fda794cac28c0ffd570a76` |
| 起点测试 | 70 / 70 通过（本环境实跑） |
| 护栏基线 | `verification/refactor-baseline.json`：声明 3532、导出 2047、CSS 10、初始化未解析绑定 0 |

## 关键文件

- `tools/build-runtime-bundle.mjs`：自制打包器，语法限制见 PROJECT.md §5。
- `tools/runtime-module-order.json`：钉死的初始化顺序。新增模块必须加进去，否则构建直接报错。
- `tools/refactor-guard.mjs`：重构护栏。`snapshot` 拍基线，`check` 对比。只在有意改行为时重拍。
- `tests/runtime-harness.mjs`：测试夹具；按路径假冒 `ui/overlay.js`、`ui/settingsPanel.js`、`generation/client.js`。
- 大文件（阶段 2 对象）：`ui/styles.js` 284KB · `archive/repository.js` 216KB · `core/cache.js` 199KB · `modes/room.js` 164KB · `ui/overlay.js` 152KB · `generation/client.js` 143KB · `modes/heart.js` 139KB · `modes/phone.js` 114KB · `ui/settingsPanel.js` 89KB · `archive/library.js` 85KB。

## 研究结论（r84.71 基线）

- 176 个可达模块里 125 个处在同一个强连通分量（循环依赖）。
- 反向依赖计数（按 core < archive < generation < modes < ui 的假定层次）：generation→modes 85、generation→ui 15、modes→ui 15、archive→ui 12、core→archive 11、core→modes 9、archive→generation 8、core→generation 7、archive→modes 3、core→ui 2。
- 被引用最多：core/text.js 108、core/constants.js 84、core/context.js 71、core/state.js 53、core/cache.js 41、archive/repository.js 39、ui/overlay.js 38。
- 现有测试只覆盖建档（archive/*）与邮箱小画；房间、HEART、终端、设置、样式、Prompt 没有自动测试。本环境没有浏览器。

## 决策记录

- D1 行为零改动：阶段 1–2 只搬家，不改任何声明的文本（styles 拆分除外，见 D4）。
- D2 删除死文件的依据是入口可达性（与打包器同一套 import 规则）+ `index.js` 的直接动态 import（`core/autoUpdatePolicy.js`）。29 个不可达文件在全仓库（src、tests、tools、index.js）都没有引用。删除后 bundle 逐字节不变。
- D3 CURRENT 拆分：§1–§6 留根目录，其余原样移入 `dev/archive/CURRENT-历史.md`。逐行核对，除两行有意更正外没有丢行。两行更正：“正式记忆240条保持”→ r84.70 起不设上限；“12MB存储…独立保留”→ r84.69 已取消。
- D4 `ui/styles.js` 拆分时 `ensureStyles` / `ensureSettingsStyles` 的函数文本必然改变；以 css 指纹逐字相同作为证明。需要先给 guard 加一个写明原因的允许变化清单，其他任何声明不得借此放行。
- D5 拆分转发方式：原文件 `export const f = 新模块.f;`，新模块在初始化顺序里排在原模块前面；新模块不反向 `import {…}` 原模块。

## 发现的问题（不在本任务里修，另开）

- `README.md` 顶部仍写“当前测试版 0.99.13-r84.58”，整份 124KB 多是逐轮记录。只改了 4 处指向已移动文件的链接。
- 上传包里的 `P0-修复说明.md` 原本只有乱码文件名，README 里指向它的链接之前就是断的（本轮已随改名修好）。
- CURRENT §1–§6 只扫描了 240 / 12MB / 冷归档 / 温度 / 写真 / 120 万这几个关键词，可能还有其他过期表述。

## 当前进度 / 下一步

- 已完成：阶段 0、阶段 1，交付 0.99.20 / `0.99.20-r84.72-refactor-p1`。bundle 仍是 `f7d2259…`，70/70 通过，guard ok。
- 等用户：在 `测试` 分支装上 r84.72，确认能正常打开（运行代码没变，主要确认导入工作流是否删掉了根目录旧文件）。
- 下一步：tasks 里阶段 2 第一项，给 guard 加允许变化清单，然后拆 `ui/styles.js`。
- 未打包的改动：无。
