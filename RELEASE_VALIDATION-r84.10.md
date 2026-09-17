# r84.10 HEART 阅读隔离与 NAI 提示词格式

基线：Hearttrace-r84.9-workspace-ui-full.zip（原始 SHA-256 efedc3eac49da1bf58a1da19a54e9781268e715d25aca15656d7956ca96ad45c）。
候选身份：0.8.86-tt-cg-r84.10-reader-cg。

## 两项改动
1. HEART 独立后日谈、日常一格、萤火虫、基础语言不再把路由选择写入共用会话。显示投影与普通 HEART 选择分离，分别记住篇章；实际图片目标、进度/取消、翻页、书签恢复和明确移除图片引用使用一致目标。
2. 增加 NAI 4.5 英文 Tag / NAI 5 自然语言两种生图提示词格式。在 CG 设置、相簿、ADV 索引及日常一格入口、真实图片设置中可选。只决定提示文本写法，不切换第三方生图插件中的实际模型。默认 NAI 5 自然语言；旧图未选择转换时保留其已确认提示。

新内容生成：只在本地允许的含 imagePrompt 的请求分段追加格式约束，关系扫描、共同回忆对话、ADV 正文、四季等不追加。对已存在的中文提示，切换格式不自动翻译/重新请求/改写内容。用户可以手填英文 Tag，或明确点击重新构思（原有一次文本请求确认）并核对，再确认绘图。
实际发送与发送预览使用同一格式处理函数。4.5 分支拒绝中文混入，不偷偷剥词；支持人物分离的后端保留 char/user 对应标签，不支持时需要独立完整英文 flatPrompt。日常一格保留本地分镜数和 Q 版要求。新图 metadata 记住格式；旧图 metadata 缺少字段时签名兼容。

## 不变边界
全部 src/modes/ 原文不变，src/generation/prompts.js、normalizers.js、contentRegeneration.js、recovery.js 原文不变。档案库、证据、CAS、备份、删除栅栏、12MB、请求协调器、API Key 处理不动。bootstrap 只改版本身份。28 组历史重复文件不在本次清理范围。继续内置样式，无外置 CSS bundle / link 依赖。

## 已执行
- 原包完整测试 547：542 通过、5 个既存退役 timeJourney 测试失败。
- 新包完整测试 603：598 通过、同样 5 个失败；无 skip，无新增失败。
- 新增行为 44 项、新增冻结合同 12 项。
- JS/MJS 235/235 语法通过；108 模块 bundle 两次重建一致。
- bundle SHA-256：1b310532dd124d2119577d155bb26aedb22615d063fabc0bfc7d9937ec06a905
- Chromium 实际 bundle 隔离宿主：六种宽度 × 两主题 × 七界面 = 84 个布局组合；编辑器、格式切换、独立路由返回、重渲染交互通过，无横向溢出/脚本错误。没有真实网络/模型请求。
- 最终安装包 CRC、逐文件清单与解压后重建/测试结果见外附验证报告与 reviewer pack。

## 测试变更说明
旧的 r847/r849 全文件冻结，只更新本轮授权变更路径的哈希；r848/r849 bootstrap 断言更新版本；原 CG 持久化测试只增加默认格式 metadata 期望。既有证据/请求/存储断言不删除，不恢复已退役模块。新增 r8410FrozenContracts 额外冻结 116 个未改动源码，并对 constants/settings/client/public-provider 的允许差异归一化后复原原哈希，检查未扩大到其他逻辑。

## 安全与未执行
本地差异安全复核与模拟回归未发现本轮尚未处理的 High/Medium。Codex Security 插件目录可见，但没有可调用扫描 action，专用扫描未执行；独立回执未取得。GitHub 无写入。真实 NovelAI/provider、真实账户、iPhone/Android/TT/云酒馆未执行；提示格式检查不是 Tag 词典或模型 token 上限检查，不保证真实生成质量。
