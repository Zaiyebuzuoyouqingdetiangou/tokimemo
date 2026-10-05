# 重构 · 任务清单

每完成一项立刻勾选。每项的“完成”都要求：构建连续两次一致 + `refactor-guard check` ok + 全部测试通过。

## 阶段 0 · 护栏（r84.72）

- [x] 写 `tools/refactor-guard.mjs`（声明文本 / 导出 / CSS / 初始化绑定）
- [x] 拍 r84.71 基线 `verification/refactor-baseline.json`
- [x] 反向验证：改 Prompt 一字 → 报；改 CSS 一值 → 报；搬函数但初始化顺序错 → 报；纯搬家 → 通过

## 阶段 1 · 死文件与文档（r84.72）

- [x] 删 29 个不可达源文件；bundle SHA 仍为 `f7d2259…`
- [x] 去掉乱码 / `#U` 文件名副本，恢复 `P0-修复说明.md`、`施工方案-旧版.md`
- [x] 建 `dev/PROJECT.md`、`dev/archive/refactor/`、`dev/archive/`
- [x] 逐轮文档移入 `dev/archive/rounds/`，旧方案 / 问题分析 / 运行地图移入 `dev/archive/docs/` 并加过期说明
- [x] CURRENT 拆成需求合同 + `dev/archive/CURRENT-历史.md`，逐行核对无丢失
- [x] README 中指向已移动文件的 4 处链接更新
- [x] 新身份 0.99.20 / `0.99.20-r84.72-refactor-p1`（manifest、index.js VERSION/BUILD）、CHANGELOG、checks.json
- [x] 70/70 测试、188 个 JS/MJS 语法检查、guard ok
- [x] 用户在 `测试` 分支装上后确认能打开（2026-09-25）
- [x] 确认导入工作流**不删除**旧文件：根目录旧文档仍在 → 清单见 `branch-cleanup.md`，由用户决定是否手动删

## 阶段 2 · 拆大文件（纯搬家）

- [x] guard 增加允许变化清单（`verification/refactor-allow.json`，每条写原因）；目前只有 styles 一条
- [x] `ui/styles.js` → `ui/css/*.js` 7 个；另用两份 bundle 直接比对 CSS：458,438 + 60,130 字符逐字相同（r84.73）
- [x] 写 `tools/split-module.mjs`（原样搬家工具）
- [x] `archive/repository.js` → 8 个模块，原文件 30KB 转发（r84.73）
- [x] `core/cache.js` → 6 个模块，原文件 12KB 转发（r84.73）
- [x] 用户在 `测试` 分支装 r84.73：档案室、建档、已生成页面、设置页均正常（2026-09-25）
- [x] `modes/room.js` → 7 个模块，原文件 6KB 转发（r84.74）
- [ ] 用户手点房间页（单人、多人房间各一次；切换空间、点物件、白天/夜晚）
- [x] `modes/heart.js` → 4 个模块，原文件 5KB 转发（r84.76）
- [ ] 用户手点 HEART 页（主线、萤火虫、四季、单页重新生成）
- [x] `modes/phone.js` → 6 个模块，原文件 3KB 转发（r84.76）
- [ ] 用户手点私人终端（设备首页、App 列表、通讯、补缺 / 增量生成）
- [x] 核实夹具不用改：转发层保留全部导出名，假冒仍然生效（r84.77，77/77）
- [x] `generation/client.js` → 4 个（r84.77）
- [x] `ui/overlay.js` → 4 个（r84.77）
- [x] `ui/settingsPanel.js` → 2 个（r84.77）
- [x] `archive/library.js`、`generation/recovery.js`、`modes/relations.js`、`modes/calendar.js`、`generation/imageGeneration.js` 各拆 2 个（r84.77）
- [x] 新增 `tools/check-undefined-names.mjs`；顺带修好 r84.71 起就有的旧版萤火虫升级 ReferenceError（用户要求）
- [ ] 用户在测试分支把各页面点一遍（主窗口、设置页、档案室、建档、各玩法生成、CG 生图、日历、关系）
- [x] 复查：只剩 3 个超过 60KB——`ui/overlayCore.js` 93KB（14 个函数共享窗口状态、互相调用，原样搬不开）、`ui/settingsPanelHome.js` 64KB（同理）、`generation/generationModes.js` 60KB（`generateMode` 本身就是一个大函数）。再拆需要改写函数，属于阶段 3

## 阶段 3 · 超大函数（用户让我选，选了 3A + 3B 可证明的部分；3C 不做）

- [x] 实测循环依赖与方案（见 plan「阶段 3」）
- [x] 写 `tools/split-dispatch.mjs`：把超大同步函数的连续语句原样搬成分组函数，原处改为依次调用
- [x] 3A `handleOverlayClick`（44KB、111 个按钮）→ `ui/overlayClickTargets.js`、`ui/overlayClickActions.js` 4 组（r84.78）
- [x] 3B `mountSettings` 的整页 HTML 语句 → `ui/settingsPanelMarkup.js`；两个大事件处理函数共用可变局部变量，不能原样搬，保留（r84.78）
- [x] 证明：`tests/dispatch-split-identity.test.mjs`（拼回后与 r84.71 逐字相同；改一个字即失败，已验证）；`tests/overlay-click-routing.test.mjs`（拆分前后的打包产物结果一致）
- [ ] 用户在测试分支把主窗口各页面按钮、设置页各项点一遍
- 3C 解循环依赖：不做（风险最高、用户感知不到；以后改到相关代码时顺手做）

## 收尾

- [x] 更新 `dev/PROJECT.md` 代码地图
- [x] 护栏基线换成 r84.78（旧基线与允许清单改名保存为 `verification/refactor-baseline-r84.71.json`、`refactor-allow-r84.71-r84.78.json`）
- [x] 整个任务目录移到 `dev/archive/refactor/`（r84.78）
