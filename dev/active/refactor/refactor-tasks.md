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
- [ ] 用户在 `测试` 分支装上后确认能打开；确认根目录旧文档是否被导入工作流删除

## 阶段 2 · 拆大文件（纯搬家）

- [ ] guard 增加允许变化清单（`dev/active/refactor/guard-allow.json`，每条写原因），只用于 styles 拆分
- [ ] `ui/styles.js` → 按页面拆出若干 `…Css()`；css 指纹逐字相同 → 候选 r84.73
- [ ] `archive/repository.js` 按职责拆（建档 / 入档提交 / 恢复 / 容量等），原文件转发
- [ ] `core/cache.js` 按玩法拆，原文件转发
- [ ] `modes/room.js` 拆分（无自动测试：需用户手点房间页）
- [ ] `modes/heart.js` 拆分（需手点 HEART 页）
- [ ] `modes/phone.js` 拆分（需手点私人终端）
- [ ] 改 `tests/runtime-harness.mjs` 的按路径假冒，使其覆盖拆出去的函数
- [ ] `generation/client.js` 拆分
- [ ] `ui/overlay.js` 拆分
- [ ] `ui/settingsPanel.js` 拆分
- [ ] 复查：没有源文件超过约 60KB（CSS 数据文件除外需单独说明）

## 阶段 3 · 理依赖（待用户决定是否做）

- [ ] 用户确认开阶段 3
- [ ] generation→modes 85 处改注册表
- [ ] core 反向依赖 29 处改注入
- [ ] 重新测量循环依赖规模

## 收尾

- [ ] 更新 `dev/PROJECT.md` 代码地图
- [ ] 整个 `dev/active/refactor/` 移到 `dev/archive/`
