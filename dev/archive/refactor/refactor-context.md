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

## 各轮身份

| 轮次 | 版本 / build | bundle SHA-256 | 说明 |
|---|---|---|---|
| r84.71 | 0.99.19 | `f7d2259…` | 起点 |
| r84.72 | 0.99.20 / `0.99.20-r84.72-refactor-p1` | `f7d2259…`（与起点相同） | 阶段 0、1；用户已在测试分支确认能打开 |
| r84.73 | 0.99.21 / `0.99.21-r84.73-refactor-p2a` | `0e2c7675…` | styles、repository、cache 拆分；197 个模块；用户已验收 |
| r84.74 | 0.99.22 / `0.99.22-r84.74-refactor-p2b` | `e110055d…` | room 拆分；角色页继承入口（功能改动，已登记 allow） |
| r84.75 | 0.99.23 / `0.99.23-r84.75-room-figure` | `461e8fa6…` | 房间小人按人设（功能改动，任务 room-figure，已登记 allow） |
| r84.76 | 0.99.24 / `0.99.24-r84.76-refactor-p2c` | `65f6a9f0…` | heart、phone 拆分；215 个模块 |
| r84.77 | 0.99.25 / `0.99.25-r84.77-refactor-p2d` | `866e97ba…` | 其余 8 个大文件拆分；修旧版萤火虫升级；235 个模块 |
| r84.78 | 0.99.26 / `0.99.26-r84.78-refactor-p3` | 见 checks.json | 阶段 3：点击分发与设置页 HTML；任务收尾；238 个模块 |

## 决策记录（续）

- D6 拆分用 `tools/split-module.mjs`：按调用关系分组，组与组之间只允许“后面的依赖前面的”，新模块全部排在原文件之前；原文件只留转发。工具发现反向依赖直接报错，不靠人工检查。
- D7 repository 分组：archiveCore → worldInfoSources → externalMemory → importPrompts → importIdentity → recoveryDrafts → archiveVerdict → importOperation。`restartCurrentArchiveImport`、`continueCurrentArchiveImport`、建档入口和测试开关 `autoPartialCommitEnabled` 留在 repository（它们依赖入口函数，搬走会反向依赖）。`normalizeExternalMemoryRecords` 放进 worldInfoSources、`finishArchiveTaskTrace` / `isArchiveCancellation` 放进 archiveCore，都是为了消除组间循环。
- D8 cache 分组：cacheRecords → cacheCommit → cacheVersions → cacheGenerationDrafts → cacheSessions → cacheArchiveMemory；`buildControlledContextEnvelope` 留在 cache.js。`cacheRecordUpdatedAt` 原本就没人调用，照搬到 cacheArchiveMemory，不删（删除属于改行为，另记）。
- D9 测试分支导入流程只覆盖不删除（用户 2026-09-25 确认）。移动 / 删除文件后，仓库里会留下旧文件；清单在 `branch-cleanup.md`。

## 发现的问题（续）

- `core/cache.js` 原有未使用的内部函数 `cacheRecordUpdatedAt`。

## 同轮的功能改动（不属于重构，单独登记）

- r84.74 角色页继承入口：`archive/library.js` `showArchiveCharacter`。已登记在 `verification/refactor-allow.json`，并加测试 `tests/archive-inherit-entry.test.mjs`。
- 房间小人按人设：另开任务 `dev/active/room-figure/`，等用户确认。

## 当前进度 / 下一步

- 已完成：阶段 0、1；阶段 2 的 styles、repository、cache（r84.73 已验收）、room（r84.74 待验收）。
- 等用户：装 r84.74，手点房间页；看角色页继承入口。
- D10 heart 分组：heartData → heartPrompts → heartRuntime → heartGeneration。phone 分组：phoneBasics → phoneEvidence → phonePrompts → phoneData → phoneIncrement → phoneGeneration（`projectPhoneProgress` 依赖增量规划，放进 phoneIncrement，工具报出后调整）。
- D11 `split-module --plan` 自动分组：强连通分量整组、按依赖排序、按字节切段；`let` 和所有读写它的函数强制同组（打包器把命名导入变成初始化时的拷贝，可变变量绝不能跨模块）；顶层语句留原文件。
- D12 r84.76 后用户报“什么都生成不了”：诊断显示模型 1 秒内回 94 字、非 JSON，换模型后恢复，与插件无关。排查时用 TypeScript 扫描未定义名字，发现 `heartFireflyUpgradePrompt` 引用未定义 `memoryBank`（r84.71 基线就有），r84.77 修复并加测试（修复前测试确认会失败）。
- 阶段 2 完成（r84.77）。阶段 3：用户说“不知道哪个重要，你帮我选”，选了 3A（按钮最多、最常改）和 3B 中能证明不变的部分，3C 不做。
- D13 超大函数用 `tools/split-dispatch.mjs`：只接受同步函数；分组 = 连续语句原样搬；分组拿到它读的外层局部变量作同名参数，不许改写它们，分组里声明的名字不许在后面用；读模块级 `let` 的分组不能搬出本文件。`mountSettings` 的 change / click 两个处理函数都改写局部变量 `tagScanEpoch`，所以没搬。
- 结束状态：最大的源文件是 `generation/generationModes.js` 60KB（`generateMode` 是一个异步大函数，工具不处理异步）。
- 任务已归档。以后要继续解循环依赖，新开任务。
- 未打包的改动：无。
