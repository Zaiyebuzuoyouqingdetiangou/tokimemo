# 心迹回廊（Hearttrace / 心跳回忆）· 开发总纲

每次开工先读这一份。它短，是故意的：新会话读完这份、再读 `dev/active/` 里当前任务的三份文件，就能接着干。其他文档按需查，不整份读。

---

## 1. 开工 / “继续” 顺序

1. 读本文件。
2. `ls dev/active/`，打开当前任务的 `*-tasks.md`，找第一个没勾的项。
3. 读同目录 `*-context.md`（基线身份、关键文件、决策、上次停在哪）。
4. 需要时再读 `*-plan.md` 的对应阶段。
5. 需求细节按章节 grep 根目录 `Heartbeat-Memories-Project-CURRENT.md`（§1–§6 需求合同），不要整份读。

上下文快用完时：先把进度写进 `*-tasks.md`（勾选）和 `*-context.md`「当前进度 / 下一步」，再打包交付。下个会话上传这个包，说“继续”。

任务完成后，整个任务目录移到 `dev/archive/`。

---

## 2. 工作规则（CURRENT §2 的压缩版，冲突时以 CURRENT §2 原文为准）

- 用户上传的 ZIP 是本轮唯一基线。不以 GitHub、旧报告或印象代替。先核对 manifest / index.js BUILD / bundle 头部身份。
- GitHub 默认只读。未经本轮明确授权，不 commit / push / 建分支 / 发布。main 不改；候选在 `测试` 分支验收。
- 只改获准事项。不顺手加功能、不加门槛、不改其他功能的 Prompt。
- “检查 / 诊断 / 复核”不等于允许改代码。
- 先找根因，不叠补丁，不改错死文件。真实运行路径以 `tools/runtime-module-order.json` 为准。
- 测试失败不删测试、不改预期、不放宽校验凑全绿。没执行的验证写“未执行”，模拟环境不冒充真机。
- 温度交给用户（r84.51）：写正文 / 对白的请求用用户温度；抽取、判断、核对证据的步骤取“用户温度与上限”的较小值。插件不封顶用户温度。

---

## 3. 现行边界（数字以这里为准；改了要写轮次）

| 项 | 现行 | 轮次 | 旧值（已作废） |
|---|---|---|---|
| 插件存储大小上限 | 无固定上限；实际存储失败如实停止并保留成果 | r84.69 | 12MB |
| 正式记忆 / 冷归档条数 | 默认不设上限，不淘汰旧 Mxxx | r84.70 | 240 / 100 |
| 建档聊天来源批次 | 约 15 万字一个正式检查点（`ARCHIVE_BATCH_CHAT_CHARS`），只在请求之间切批；下一批仍需用户点击 | r84.71 | 120 万字一批 |
| 建档单次请求 | 约 3 万字 | — | — |
| 建档请求超时 | 360s（`ARCHIVE_REQUEST_TIMEOUT_MS`）；其他页面 180s | r84.71 | — |
| 临时网络错误 | 仅 SERVER / NETWORK / RATE_LIMIT / REQUEST_TIMEOUT 自动重试 2 次（5s、15s）；原因不明、鉴权、配置、超限、校验、取消都立即停 | r84.71 | 不重试 |
| 建档失败后 | 有新成功分块时自动走原“只入档成功分块”路径，不请求模型 | r84.71 | 需手动点 |
| 派生任务输入预算 | 默认 6 万 token，可调 8 千–20 万 | r84.55 前 | 3.2 万 |
| 最大输出 | 未填默认 60,000 tokens，不是插件上限 | — | — |
| 恢复快照 | 120 万字符上限，超了报 `RMT_RECOVERY_SNAPSHOT_TOO_LARGE` | 施工方案 r84.55，之后未见变更 | — |
| 失败写真九宫格 | 新建与生成入口取消，旧数据兼容 | r84.57 | — |
| 字数 / 句数下限 | 不放宽 | 长期 | — |
| 自动连续请求 | 不做；每批由用户点击 | 长期 | — |
| “失败后自动重试未完成部分”、“第一次完成后自动第二次生成” | 默认关 | r84.44 前后 | — |

---

## 4. 八条不变量（比任何单次补丁优先）

1. 每个聊天一份档案，不串世界线（绑定角色槽位 + 头像 + chatId）。
2. 共同往事只能来自 Mxxx，不能来自世界书扫到的句子。
3. 未点生成不请求模型；打开页面 ≠ 付费。
4. 先能保存，再允许发请求。
5. 成功段单调保留，失败不重做成功段。
6. 真换卡 / 换聊天 / 换来源就停，不猜“应该还是同一个人”。
7. 模型输出是数据，不是代码。
8. 诊断和 toast 不带 Prompt、卡正文、Key。

运行地图（两层启动、作用域、三层资料、存储位置、建档与派生流程）见 `dev/archive/docs/整体逻辑.md` §2–§13；那份的数字已过期，以上表为准。

---

## 5. 代码地图

```
index.js                  轻量启动壳（菜单、诊断、自动同步门槛）；直接 import src/core/autoUpdatePolicy.js
src/heartbeatMemories.js  runtime 入口，打进 dist/heartbeatMemories.bundle.js
src/core/                 设置、身份、常量、调度、诊断
src/archive/              建档、来源账本、导入批次、档案室、备份
src/generation/           请求客户端（所有出网走 client.js）、Prompt、恢复 journal、CG
src/modes/                各玩法的生成与校验逻辑
src/ui/                   现行界面（窗口、设置、各阅读页、样式）
dist/                     打包结果，安装用这份。手不改，用构建脚本生成
tests/  tools/  verification/   测试、构建与校验工具、结果
dev/                      开发文档（本目录）
```

必须知道的坑：

- **自制打包器**（`tools/build-runtime-bundle.mjs`）只认单行 `import * as X from '…'` 和 `import { a, b } from '…'`；导出只认 `export function`、`export async function`、`export const`。不支持 `export let`、`export default`、`export class`、`export {…}`、多行 import。
- **初始化顺序是钉死的**：176 个模块里 125 个在同一个循环依赖里，所以 `tools/runtime-module-order.json` 规定了初始化顺序。新增 / 拆分模块必须同时改这个文件；`import {x}` 在初始化时就取值，顺序错了会拿到 undefined，整包加载失败（历史上出现过“心迹回廊加载失败”）。
- **测试夹具按路径假冒**：`tests/runtime-harness.mjs` 把 `ui/overlay.js`、`ui/settingsPanel.js`、`generation/client.js` 换成假模块。这三个文件拆分后只剩转发，夹具按导出名假冒转发层，外部调用照样被拦住，所以夹具不用改（r84.77 实测 77/77）。不要让别的模块绕过转发层直接 import 拆出去的新文件，否则会逃出假冒。
- r84.72 删除了 29 个不可达旧文件（`src/modes/` 下 28 个与 `src/ui/` 同名的旧界面副本、`src/ui/photoshootView.js`）。测试分支的导入流程只覆盖不删除，所以仓库里它们可能还在；如果上传包里又出现这些文件，就是残留，不参与运行，可以删。
- **转发层**（r84.73 起）：大文件拆分后，原文件只剩 `export const 名字 = split_xxx.名字;` 转发和少量没拆的函数，外部调用方不用改。要改某个函数，去它真正所在的新文件改（看原文件顶部的 `import * as split_…` 就知道在哪）：
  - `ui/styles.js` 的主窗口 CSS → `ui/css/*.js`（7 个，按层叠顺序拼接，不要调换）
  - `archive/repository.js` → `archive/archiveCore.js`、`worldInfoSources.js`、`externalMemory.js`、`importPrompts.js`、`importIdentity.js`、`recoveryDrafts.js`、`archiveVerdict.js`、`importOperation.js`
  - `core/cache.js` → `core/cacheRecords.js`、`cacheCommit.js`、`cacheVersions.js`、`cacheGenerationDrafts.js`、`cacheSessions.js`、`cacheArchiveMemory.js`
  - `modes/room.js` → `modes/roomProfile.js`、`roomPets.js`、`roomLayout.js`、`roomParticipantData.js`、`roomLife.js`、`roomData.js`、`roomRender.js`（小人本地外形另在 `roomFigureLocal.js`）
  - `modes/heart.js` → `modes/heartData.js`、`heartPrompts.js`、`heartRuntime.js`、`heartGeneration.js`
  - `modes/phone.js` → `modes/phoneBasics.js`、`phoneEvidence.js`、`phonePrompts.js`、`phoneData.js`、`phoneIncrement.js`、`phoneGeneration.js`
  - `modes/relations.js` → `modes/characterProfile.js`、`relationsView.js`
  - `modes/calendar.js` → `modes/calendarBasics.js`、`calendarData.js`
  - `generation/imageGeneration.js` → `generation/cgImageCore.js`、`cgImageActions.js`
  - `generation/recovery.js` → `generation/recoveryFeedback.js`、`recoverySegments.js`（截断续写登记仍在 recovery.js）
  - `generation/client.js` → `generation/generationContext.js`、`generationRequest.js`、`generationSavedActions.js`、`generationModes.js`（顶层注册语句仍在 client.js）
  - `archive/library.js` → `archive/libraryCharacter.js`、`librarySnapshots.js`（档案室首页等读写模块状态的函数仍在 library.js）
  - `ui/settingsPanel.js` → `ui/settingsPanelParts.js`、`settingsPanelHome.js`
  - `ui/overlay.js` → `ui/overlayShell.js`、`overlayManage.js`、`overlayCore.js`、`overlayPartial.js`
  - 主窗口按钮：`overlayCore.js` 的 `handleOverlayClick` 依次调用 `ui/overlayClickTargets.js`（按元素属性）和 `ui/overlayClickActions.js`（按 `data-rmt-action`）里的 4 个分组；加新按钮就加进对应分组，**分组顺序不能调换**。设置页整页 HTML 在 `ui/settingsPanelMarkup.js`。
- 拆大文件用 `tools/split-module.mjs`：先 `--plan 文件 最大字节` 出分组草稿（按依赖排序；`let` 与所有读写它的函数必须同组；顶层语句留在原文件），给每组改名写说明，再用 spec 运行（原样搬声明、自动补 import / 转发 / 模块顺序，发现反向依赖直接报错）。拆完必须跑第 6 节全部命令。

---

## 6. 验证命令（每轮都跑）

```bash
node tools/build-runtime-bundle.mjs .                                   # 打包；连续两次必须逐字节一致
node --experimental-vm-modules --test tests/*.test.mjs                  # 全部测试
node --experimental-vm-modules tools/refactor-guard.mjs check           # 重构护栏：代码文本、导出、CSS、初始化绑定
node tools/verify-release.mjs .                                         # 全部 JS/MJS 语法、manifest、bundle SHA（需要 git 工作树）
node tools/check-undefined-names.mjs                                    # 用 TypeScript 找“用了没定义 / 定义两次”的名字（拆分漏 import 只在调用时才炸）
```

护栏基线是 r84.78（`verification/refactor-baseline.json`）；r84.71 的旧基线另存为 `refactor-baseline-r84.71.json`，供 `tests/dispatch-split-identity.test.mjs` 证明分发拆分逐字不变。`refactor-guard`、`split-module`、`split-dispatch` 需要 acorn（Claude 沙箱的全局 npm 里有；别处用 `ACORN_PATH` / `ACORN_DIR` 指定）。只有**有意改行为**的轮次才重拍基线：`… refactor-guard.mjs snapshot`，并在该轮 context 里写明原因。某个声明因拆分必须改写时（例如 CSS 字符串拆段），写进 `verification/refactor-allow.json` 并写原因；CSS 输出和初始化绑定不能放行。

---

## 7. 交付

- 新候选：新的 manifest `version`、`js` 查询串、`index.js` 的 `BUILD`，三处一致。
- 完整 ZIP，文件名 `hearttrace-upload.zip`，内部单根 `tokimemo-main/`，不含 `.git` / `.github`。
- 报告写：改了什么、没改什么、测试与语法结果、bundle SHA、ZIP SHA-256、GitHub 写入状态、待真机项。
- 用户现场环境：SillyTavern 1.18.0（P0 轮只读核对时所见）；另有 iPhone、TT/Tauri、云酒馆。
