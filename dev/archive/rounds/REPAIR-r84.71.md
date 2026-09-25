# r84.71 / 0.99.19 — 建档不卡住、邮箱小画覆盖

基线：r84.70 / 0.99.18 上传包（hearttrace-upload.zip）。main 未改动，未推送。

## 建档

原因：一批最多 120 万字 ≈ 20～40 个依次发送的请求，全部成功才正式保存；5xx / 网络 / 超时从不自动重试；成功分块要用户自己点“先将成功分段入档”。代理不稳时一次断线就整批停在“已正式保存 0”。

改动：
- `constants.ARCHIVE_BATCH_CHAT_CHARS = 150000`：聊天来源每约 15 万字（约 5 个请求）一个正式检查点，只在请求之间切批。单次请求 30k 字、模型输入/输出预算未改。下一批仍需用户点击。
- `importRecovery.requestArchiveWithTransientRetry`：仅 `RMT_CONNECTION_SERVER / NETWORK / RATE_LIMIT / RMT_REQUEST_TIMEOUT` 自动重试 2 次（5s、15s；限流尊重 Retry-After，超过 60s 不重试）。`RMT_CONNECTION_FAILED`（原因不明）、鉴权、配置、上下文超限、校验失败、取消照旧立即停。
- 建档请求超时下限 `ARCHIVE_REQUEST_TIMEOUT_MS = 360000`，其它页面仍 180s。
- `repository.importCurrentChatMemory` 失败后：若草稿有新的成功分块，自动调用原 `commitCompletedOnly` 路径（同一来源校验 / CAS，不请求模型，跳过确认框），并提示用户；原失败仍照常报告。没有新成功分块时不重复保存。
- 新建档案分多批时，中间批次使用本地简介并在进度里标 `coverDeferred`，档案简介只在最后一批请求一次；增量更新保持原行为（不改用户已有简介）。
- 恢复面板写出“建议下一步”，需要先入档时该按钮排第一。

## 邮箱小画

原因（用原代码实测）：单人卡的世界书只取写了角色名的行；卡名带装饰时对不上；“发色：银白 / 瞳色：金”、英文 silver/crimson、一行多个颜色都会被丢弃。

改动（`core/letterIllustrationV2.js`）：
- 单人卡（无人物名单）：证据 = 角色卡 + 世界书中点名行 + 本次实际发送的整份世界书，点名行优先。取舍：未标人名的 NPC 外貌可能被借用。
- 多人卡：额外读取角色卡中只点名该人物的行；未点名的世界书仍不跨人物借用。
- 词表补充；同一行多颜色时取离“发/眼/衣”类别词最近的颜色，完全并列时仍放弃。
- `missingReason()`：新信没画时记录 `illustrationMissing`（appearance / scene），信下显示一行说明。旧信、旧图不改、不重绘。

## 验证

`node tools/build-runtime-bundle.mjs`（两次构建逐字节一致）、216 个 JS/MJS 语法检查、`node --experimental-vm-modules --test tests/*.test.mjs`：70/70 通过（原 54 + 新 16）。

新增：`tests/archive-resilience.test.mjs`（小批次与楼层全覆盖、简介只在末批请求一次、502 重试后完成、重试上限、原因不明不重试、失败后自动入档且续跑不重发、无新成功不重复保存、运行包版本）；`tests/mail-art-coverage.test.mjs`（无名世界书、装饰卡名、点名优先、混合颜色、英文、子串与否定、多人点名、多人不借用、无画原因）。

测试框架 `runtime-harness.mjs` 新增选项：旧用例默认固定旧的 120 万字批次并关闭自动入档，以继续覆盖手动路径；新用例用真实默认值。重试等待在测试中为 0。

## 边界

- 模拟宿主 / 存储 / 模型边界，运行真实源码与打包运行时；没有真机、真实 SillyTavern、真实代理或用户实际草稿。
- 已在旧版开始、按 120 万字规划的建档任务保持原批次划分（检查点已保存），新任务才用小批次。
- 打包未运行 `tools/package-release.py`（需要 git 与 .github 工作流，本环境没有）；改为在原上传 ZIP 基础上逐项替换/新增文件，单根 `tokimemo-main/`，不含 .git/.github。
