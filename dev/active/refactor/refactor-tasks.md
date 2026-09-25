# 重构 · 任务清单

每完成一项立刻勾选。每项的“完成”都要求：构建连续两次一致 + `refactor-guard check` ok + 全部测试通过。

## 阶段 0 · 护栏（r84.72）

- [x] 写 `tools/refactor-guard.mjs`（声明文本 / 导出 / CSS / 初始化绑定）
- [x] 拍 r84.71 基线 `verification/refactor-baseline.json`
- [x] 反向验证：改 Prompt 一字 → 报；改 CSS 一值 → 报；搬函数但初始化顺序错 → 报；纯搬家 → 通过

## 阶段 1 · 死文件与文档（r84.72）

- [x] 删 29 个不可达源文件；bundle SHA 仍为 `f7d2259…`
- [x] 去掉乱码 / `#U` 文件名副本，恢复 `P0-修复说明.md`、`施工方案-旧版.md`
- [x] 建 `dev/PROJECT.md`、`dev/active/refactor/`、`dev/archive/`
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
- [ ] 改 `tests/runtime-harness.mjs` 的按路径假冒，使其覆盖拆出去的函数
- [ ] `generation/client.js` 拆分
- [ ] `ui/overlay.js` 拆分
- [ ] `ui/settingsPanel.js` 拆分
- [ ] `archive/library.js`（89KB）、`generation/recovery.js`（70KB）、`modes/relations.js`（68KB）、`modes/calendar.js`、`generation/imageGeneration.js`（各约 63KB）
- [ ] 复查：没有源文件超过约 60KB

## 阶段 3 · 理依赖（待用户决定是否做）

- [ ] 用户确认开阶段 3
- [ ] generation→modes 85 处改注册表
- [ ] core 反向依赖 29 处改注入
- [ ] 重新测量循环依赖规模

## 收尾

- [ ] 更新 `dev/PROJECT.md` 代码地图
- [ ] 整个 `dev/active/refactor/` 移到 `dev/archive/`
