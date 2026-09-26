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
- 文档文件名只用正常中文或 ASCII。禁止新建、提交、推送 `#Uxxxx`、盒线/西里尔乱码、或 Windows 超长转义名。同一份文档只留 `dev/archive/` 里已有的正常中文名；根目录旧副本和乱码名不要再导回来。ZIP 导入不删除旧文件，导入后若根目录又出现乱码或重复文档，删掉再交，不要当新文件留下。
- GitHub 默认只读。未经本轮明确授权，不 commit / push / 建分支 / 发布。main 不改；候选在 `测试` 分支验收。
- 只改获准事项。不顺手加功能、不加门槛、不改其他功能的 Prompt。
- “检查 / 诊断 / 复核”不等于允许改代码。
- 先找根因，不叠补丁，不改错死文件。加载顺序由 `tools/build-runtime-bundle.mjs` 生成，写进 `tools/runtime-module-order.json`。
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
| 恢复快照 / journal / 成功段 | 无固定字符数与段数额度；结构与实际存储校验保留 | r84.81 | 120万 / 180万 / 60万字符、128段 |
| 未完成建档草稿数量 | 无固定份数额度；按聊天与草稿身份保存 | r84.81 | 全局4份 |
| 本地历史来源 / 文件导入 | 无固定条数、字符数、文件大小额度；历史世界书数量及精选条目完整保留 | r84.81 | 8000条 / 800万字符、文件4MB / 5000条、200本 |
| 普通世界书设定背景 | 发给模型的背景仍取160条 / 52000字符；不是本地历史保存额度 | 保留 | — |
| 来源读取无响应 | 沿用单项来源读取15s等待；主动取消立即退出；不改变模型180s/360s等待 | r84.81覆盖世界书激活及账本 | — |
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
tools/  verification/     构建、测试（tools/test-*.mjs）、护栏工具与校验结果；tools/ 只在交付 ZIP 里，不进 GitHub（见第 6 节）
dev/                      开发文档（本目录）
```

必须知道的坑：

- **自制打包器**（`tools/build-runtime-bundle.mjs`）只认单行 `import * as X from '…'` 和 `import { a, b } from '…'`；导出只认 `export function`、`export async function`、`export const`。不支持 `export let`、`export default`、`export class`、`export {…}`、多行 import。
- **初始化顺序自动计算**（r84.121，r84.122 补上顶层解构）：279 个运行模块里，全部 import 仍有一个 97 个模块的圈（`import * as` 互相引用，要等调用才读）。初始化时真正取值的边没有圈：命名导入，模块顶层（含顶层直接调用的本文件函数）对 `import * as` 的属性读取，以及从这种别名做的解构。`tools/build-runtime-bundle.mjs` 按这些边排序，并写出 `tools/runtime-module-order.json`。不要手改这个文件。新增模块只要 import 写对，下次构建会排进去。`const a = 别名.b` 这种如果顺序错了，整包加载会失败（历史上出现过「心迹回廊加载失败」）。从别名解构取值时，整包仍可能加载成功，要等走到那段代码才报错。`verify-runtime` 和护栏把「初始化完成前被读取」算作失败。
- **测试夹具按路径假冒**：`tools/runtime-harness.mjs`（旧 `tests/` 里的夹具，r84.93 找回）把 `ui/overlay.js`、`ui/settingsPanel.js`、`generation/client.js` 换成假模块。这三个文件拆分后只剩转发，夹具按导出名假冒转发层，外部调用照样被拦住。不要让别的模块绕过转发层直接 import 拆出去的新文件，否则会逃出假冒。
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
  - `core/requestCoordinator.js` → `core/requestTasks.js`、`requestTaskCenter.js`；`core/independentApi.js` → `core/independentApiConfig.js`、`independentApiRequest.js`；`modes/ending.js` → `modes/endingData.js`、`endingGeneration.js`；`modes/advEvent.js` → `modes/advEventData.js`、`advEventGeneration.js`；`modes/travel.js` → `modes/travelScenes.js`、`travelGeneration.js`（r84.95）
  - **core 不许 import ui**（r84.97 起）：core 需要的 ui 函数加进 `core/uiBridge.js`，并在入口 `src/heartbeatMemories.js` 的 `registerUiBridge` 里登记；调用方沿用原别名，只改 import 那一行
  - **core 不许 import modes**（r84.98 起）：core 要用的玩法函数加进 `core/modesBridge.js`，并在该玩法的 modes 文件末尾 `registerModesBridge({ … })` 登记；未登记就调用会报错
  - **core 不许 import generation**（r84.99 起，r84.102 起没有例外）：同上，用 `core/generationBridge.js`，由 generation 文件末尾 `registerGenerationBridge({ … })` 登记。生成恢复缓存键 `GENERATION_RECOVERY_CACHE_KEY` 定义在这个桥里。生成恢复登记表 `handles` 和进度计算在 `core/recoveryRegistry.js`（编解码在 `core/recoveryPayload.js`），`generation/recoveryFeedback.js` 与 `generation/recoveryPayload.js` 仍导出同一个值。r84.122 补上当时漏登记的 `promptArchiveSlice`（旧蝴蝶效应提示词在顶层解构它）
  - **core 不许 import archive**（r84.101 起）：用 `core/archiveBridge.js`，由 archive 文件末尾 `registerArchiveBridge({ … })` 登记；角色身份描述 `characterDescriptor` 已挪到 `core/characterDescriptor.js`
  - **generation 按玩法登记**（r84.103 起）：生成层要用的玩法函数加进 `generation/modesBridge.js`，由该玩法文件末尾 `registerGenerationModesBridge({ … })` 登记。调用方只改 import 行、别名不变。未登记就调用会报错。已做：睡前故事（r84.103，3 行 / 6 个函数）、前世今生（r84.104，4 行 / 3 个函数；其中 1 行是没有调用的 import，已删）、时间故事（r84.105，4 行 / 3 个函数）、印象曲（r84.106，4 行 / 6 个函数；其中 1 行是没有调用的 import，已删）、出行路线（r84.107，4 行 / 4 个函数；登记表在加载顺序里挪到该玩法之前）、邮箱（r84.108，4 行 / 6 个函数）、他的物品（r84.109，4 行 / 6 个函数）、他的房间（r84.110，4 行 / 10 个函数）、蝴蝶效应（r84.111，5 行 / 7 个函数；其中 1 行是没有调用的 import，已删；界面补了一行 import，否则玩法不会被加载）、关系（r84.112，5 行 / 7 个函数）、日历（r84.113，5 行 / 8 个函数；其中 1 行是没有调用的 import，已删）、私人终端（r84.114，5 行 / 10 个函数）、陈列柜（r84.115，6 行 / 4 个函数；登记表在加载顺序里挪到该玩法之前）、成就库（r84.116，6 行 / 5 个函数）、结局（r84.117，6 行 / 7 个函数；其中 1 行是没有调用的 import，已删；告白正则经桥上的同名 `test` 转发）、ADV（r84.118，6 行 / 9 个函数）、相簿（r84.119，6 行 / 10 个函数）、HEART（r84.120，6 行 / 18 个函数）
  - 桥的限制：只 import core 文件的代码（包括测试）拿不到上层登记的函数。桥过去的函数如果依赖上层正在运行的状态，就不能走桥，要先把状态挪下来
  - 设置页：`mountSettings` 只负责组装；“改设置”监听器是同文件的 `bindSettingsChange`，“点按钮”监听器是 `bindSettingsClick`，标签扫描状态放在共享对象 `tagState` 里（r84.96）
  - 不拆：`generation/mergedGeneration.js`、`generation/generationSavedActions.js`、`generation/cgPromptPolicy.js` 被测试当作单独边界加载（只替换它们直接 import 的模块），拆开会让测试替身失效
  - 主窗口按钮：`overlayCore.js` 的 `handleOverlayClick` 依次调用 `ui/overlayClickTargets.js`（按元素属性）和 `ui/overlayClickActions.js`（按 `data-rmt-action`）里的 4 个分组；加新按钮就加进对应分组，**分组顺序不能调换**。设置页整页 HTML 在 `ui/settingsPanelMarkup.js`。
- 拆大文件用 `tools/split-module.mjs`：先 `--plan 文件 最大字节` 出分组草稿（按依赖排序；`let` 与所有读写它的函数必须同组；顶层语句留在原文件），给每组改名写说明，再用 spec 运行（原样搬声明、自动补 import / 转发 / 模块顺序，发现反向依赖直接报错）。拆完必须跑第 6 节全部命令。
- 拆超大同步函数用 `tools/split-dispatch.mjs`：连续语句原样搬成分组函数；分组读这个文件的模块级 `let` 时，把分组的 module 写成源文件本身，就会变成同文件的具名函数；函数里被回调改写的局部变量不能按值传，先改成共享对象（工具会拦住）。

---

## 6. 验证命令（每轮都跑）

```bash
node tools/build-runtime-bundle.mjs .                                   # 打包；连续两次 sha256 必须一致
node --experimental-vm-modules --test tools/test-*.mjs                  # 全部测试（r84.123 实测 228）
node --experimental-vm-modules tools/verify-runtime.mjs                 # 语法 + 初始化绑定：undefinedBindings 与 prematureReads 必须为 0
node --experimental-vm-modules tools/refactor-guard.mjs check           # 重构护栏：代码文本、导出、CSS、初始化绑定与基线一致
node tools/check-undefined-names.mjs                                    # 用 TypeScript 找“用了没定义 / 定义两次”的名字
```

**`tools/` 和 `tests/` 永远不会出现在 GitHub 上**：`.github/workflows/import-hearttrace-zip.yml` 导入交付 ZIP 时会把它们排除，并删掉仓库里已有的 `tools/`、`tests/`。它们只随交付 ZIP 流转。所以：

- 每轮开工必须用**上一轮的交付 ZIP**，不能用 GitHub 分支下载的包；分支包里没有打包脚本、模块顺序表、测试和护栏。
- 如果手里只有分支包（没有 `tools/`），先向用户要上一轮的交付 ZIP，不要凭记忆重写工具。
- r84.80 – r84.92 之间护栏和旧测试丢失，就是因为某一轮从分支包开工。r84.93 已找回，旧测试以 `tools/test-legacy-*.mjs` 的名字放回（81 个全部通过）。

护栏基线是 r84.123（`verification/refactor-baseline.json`）。r84.122 与 r84.92 的基线另存为 `refactor-baseline-r84.122.json`、`refactor-baseline-r84.92.json`。更早的 `refactor-baseline-r84.71.json`、`refactor-baseline-r84.78.json` 和旧允许清单只作记录。重构中必须改写的声明写进 `verification/refactor-allow.json` 并写原因；CSS 输出和初始化绑定不能放行。功能改动轮次改完后重拍基线：`… refactor-guard.mjs snapshot`，并在 CHANGELOG 里写明。

`build-runtime-bundle`、`refactor-guard`、`split-module`、`split-dispatch` 需要 acorn，`check-undefined-names` 需要 typescript。acorn 从 `ACORN_PATH`、`NODE_PATH`、Claude 沙箱的全局 npm，或 node 程序旁边的 `node_modules` 里找。typescript 从 `TYPESCRIPT_PATH`、`NODE_PATH`、同一条沙箱路径，或 node 旁边的 `node_modules` 里找。

## 7. 交付

- 新候选：新的 manifest `version`、`js` 查询串、`index.js` 的 `BUILD`，三处一致。
- 完整 ZIP，文件名 `hearttrace-upload.zip`，内部单根 `tokimemo-main/`，不含 `.git` / `.github`。
- 报告写：改了什么、没改什么、测试与语法结果、bundle SHA、ZIP SHA-256、GitHub 写入状态、待真机项。
- 用户现场环境：SillyTavern 1.18.0（P0 轮只读核对时所见）；另有 iPhone、TT/Tauri、云酒馆。
