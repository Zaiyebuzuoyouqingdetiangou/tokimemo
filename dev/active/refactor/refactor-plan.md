# 重构计划（refactor）

开始：2026-09-25，基线 r84.71 / 0.99.19。用户授权：“我是想让你给我重构”“你帮我做吧”。

## 目标

让代码能被一个会话读得完、改得准，同时**行为完全不变**。具体是：

1. 没有死文件，没有“改错文件”的陷阱。
2. 单个源文件不超过约 60KB（现在最大的 284KB，一个会话读不完）。
3. 依赖方向尽量清楚，缩小那个 125 个模块的循环。

不是目标：修 bug、加功能、改文案、改 Prompt、改界面样子、改存档格式。过程中发现的问题记进 context「发现的问题」，另开任务。

## 不变量（每个阶段都必须证明）

1. 用户存档完全兼容：存储键、字段、数据格式不改。
2. Prompt 逐字不变；CSS 最终输出逐字不变。
3. bundle 对外 5 个导出（openArchiveLibrary、openSettingsHome、isGenerationBusy、initMemoryTheater、destroyMemoryTheater）与 `index.js` 启动层行为不变。
4. 每个阶段一个新候选包（新 build 身份），用户在 `测试` 分支验证后再进下一阶段。

证明手段：`tools/refactor-guard.mjs check` 对比 `verification/refactor-baseline.json`（r84.71 基线）。

- declarations：每个顶层声明的源码文本（忽略 import 行和 `export` 关键字）。纯搬家不变，改一个字就报。
- surface：bundle 在 VM 里跑起来后，每个模块每个导出的名字和函数源码。
- css：各 `ensure…Styles` / `…Css` 实际产出的 CSS。
- bindings：初始化时仍是 undefined 的别名。基线为 0，新增即初始化顺序错。

加上现有 70 个测试和“连续两次构建逐字节一致”。

## 阶段

### 阶段 0 · 护栏（r84.72 已完成）

写 `tools/refactor-guard.mjs`，拍 r84.71 基线。已验证：改 Prompt 一个字、改 CSS 一个值、搬函数后初始化顺序错，三种情况都能报出来；纯搬家能通过。

### 阶段 1 · 删死文件 + 文档归位（r84.72 已完成）

- 删 29 个不可达源文件。证明：bundle SHA 与 r84.71 逐字节相同（`f7d2259…`）。
- 去掉 ZIP 里的乱码 / `#U` 文件名副本；`P0-修复说明`、旧版施工方案改回正常中文名。
- 建 `dev/`：PROJECT.md、active/refactor、archive。
- CURRENT 拆成需求合同（§1–§6，留根目录）和历史（`dev/archive/CURRENT-历史.md`）。只改了两行与已定决定冲突的数字（240 条、12MB）。

### 阶段 2 · 拆大文件（纯搬家）

方法：

- 按职责把一组互相调用的顶层声明**原样**搬进新文件。新文件沿用原文件的 import 别名名字，这样搬过去的代码一个字不用改。
- 原文件留下 `export const 名字 = 新模块.名字;` 转发，外部调用方一个都不用改。
- 新模块在 `runtime-module-order.json` 里插在原模块**之前**；新模块尽量不反向依赖原模块（按调用关系成组搬，把被调用的私有助手一起带走）。
- 每搬一个文件：构建 → guard check → 全部测试。三项全过才算这一格完成。

顺序（先易后难，先有测试覆盖的）：

1. `ui/styles.js`（284KB，几乎全是 CSS 字符串）：按页面拆成若干 `…Css()` 函数，`ensureStyles` 拼接顺序不变。这里 `ensureStyles` 的函数文本必然改变，靠 css 指纹证明输出逐字相同。需先给 guard 加“允许变化清单”（写明原因）。
2. `archive/repository.js`（216KB，81 个导出）：现有测试主要覆盖它，最有保障。
3. `core/cache.js`（199KB，71 个导出，被 41 个模块引用）。
4. `modes/room.js`、`modes/heart.js`、`modes/phone.js`：没有测试，只靠 guard；用户需在测试分支手动点一遍对应页面。
5. `generation/client.js`、`ui/overlay.js`、`ui/settingsPanel.js`：测试夹具按路径假冒它们，拆之前先改 `tests/runtime-harness.mjs`，放最后。

每个大文件一个候选包，或几个小的合一个包，以用户能验证的节奏为准。

### 阶段 3 · 理依赖（阶段 2 完成后再决定做不做）

`generation→modes` 85 处改注册表，`core` 反向依赖（→archive / modes / generation / ui 共 29 处）改注入。这会改初始化顺序，风险最高，需要用户确认后再开。

## 风险

- 初始化顺序：guard 的 bindings 检查只覆盖顶层 `const a = ns.b;` 形式的别名；其他顶层求值依赖靠测试和手动加载验证。
- UI 模块没有自动测试，也没有浏览器环境；guard 能证明代码文本不变，不能证明“在酒馆里点起来一样”。每个动 UI 文件的候选包都要真机点一遍。
- `dev/` 会随 ZIP 进入测试分支和公开仓库（md 文件，不参与运行）。
- 把根目录文件移进 `dev/archive/` 后，测试分支上旧位置的文件会不会被删除，取决于导入工作流（`.github` 不在包里，无法核对）。
