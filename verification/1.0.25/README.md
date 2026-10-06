# 1.0.25 核验记录

生产基线：用户本轮上传的 `tokimemo-- 10.zip`。

SHA-256：`e979c3eef45a08b57e6b68332e93632e9f3254fbf37ab7171e22f7ad6d1a97d5`。

| 记录 | 结果 |
| --- | --- |
| large-canvas-regression.tap | 当前最终运行包：296 项，290 通过；同样 3 项原有失败、3 项缺少 r84.215 历史包 |
| large-canvas-focused.tap | 大画布、收起工具、保留视图尺度／撤销、宽屏工具与暂存入口检查 30/30 |
| large-canvas-baseline.tap | 同套 30 项对上一份 1.0.25：24 通过、6 失败 |
| large-canvas-before.tap | 最初 24 项复现：21 通过、3 失败；此后补充了宽屏与暂存入口用例 |
| large-canvas-source.diff | 此次 3 个生产源文件相对上一份 1.0.25 的差异 |
| stream-canvas-final-regression.tap | 前次流式／焦点工作区：291 项，285 通过；3 项原有失败，3 项缺少 r84.215 历史包而未完成 |
| stream-canvas-focused.tap | 前次针对性检查 31/31，含流式、故障保旧、原生笔刷、焦点模式与生产结构 |
| stream-canvas-baseline.tap | 同套检查对上一份 1.0.25：31 项中 21 通过、10 失败 |
| stream-canvas-regression.tap | 本轮首次扩大检查：291 项中 284 通过；额外 1 项仍断言分镜请求 stream=false，现按明确的新传输行为改为 true，其他断言不变 |
| stream-canvas-source.diff | 本次 9 个生产源文件相对上一份 1.0.25 的完整差异 |
| feedback-regression.tap | 本次三项反馈相关检查：260 项，254 通过；3 项原有失败，3 项缺少 r84.215 历史包而未完成 |
| feedback-final-focused.tap | 最终重新构建的运行包反馈专项 9/9 |
| feedback-before.tap | 修正前同套新增检查：9 项中 8 失败、1 通过（原有预览与导出共用路径） |
| feedback-focused.tap | 首轮三项反馈集中检查 57/57；此后补充导出对照并纳入上面的 260 项 |
| mobile-height-regression.tap | 手机录屏反馈后的完整相关检查：187 项，184 通过、3 项与原包相同的失败 |
| mobile-height-focused.tap | 本次集中检查：高度规则、恢复入口、分页、布局集成、图片编辑 27/27 |
| mobile-height-before.tap | 刚交付的布局版：新补充的三项手机相关检查均失败 |
| layout-final-regression.tap | 手机录屏反馈前的记录：184 项，181 通过、3 失败；未能发现实际布局压缩 |
| layout-dom.tap | 正式运行包布局集成及 libxml 结构检查 10/10 |
| layout-first.tap | 布局接入首轮、图片编辑与音源检查 33/33 |
| layout-before.tap | 此前仅改 HTML 的运行包：首批五项正式布局检查全部失败（文件采用 Node 默认报告格式） |
| layout-regression.tap | 扩大范围试跑：191 项，187 通过、4 失败；额外一项缺少历史 r84.209 原包，未完成迁移验证 |
| final-regression.tap | 布局接入前的记录：170 项，167 通过、3 失败 |
| single-music-preview.tap | 单一音源、并发、更名安全、版本及 HTML 检查 11/11 |
| single-music-before.tap | 原包缺少功能的初始四项专项检查均失败 |
| editor-audio.tap | 首轮音源、图片编辑和取景等 121/121 |
| lifecycle.tap | 现版本请求生命周期 15/15 |
| lifecycle-uploaded-baseline.tap | 上传原包同套生命周期 15/15 |
| existing-mv.tap | 旧 MV 相关回归 24/27 |
| existing-mv-uploaded-baseline.tap | 上传原包同样 24/27，失败名称相同 |

此前手机高度修正的相关检查命令（插件根目录；布局结构检查需 Python lxml，像素检查需原生 Canvas 依赖）：

```sh
TEST_ROOT=. node --experimental-vm-modules --test --test-reporter=tap tools/verification/mv-mobile-height-regression.mjs tools/verification/mv-layout-integration-regression.mjs tools/verification/mv-layout-dom-regression.mjs tools/verification/mv-single-music-regression.mjs tools/verification/preview-single-music-regression.mjs tools/verification/mv-audio-source-regression.mjs tools/verification/mv-video-audio-import-regression.mjs tools/verification/mv-music-link-regression.mjs tools/verification/music-link-loading-regression.mjs tools/verification/mv-editor-workspace-regression.mjs tools/verification/mv-editor-native-regression.mjs tools/verification/mv-framing-paths-regression.mjs tools/verification/mv-request-lifecycle-regression.mjs tools/verification/mv-update-regression.mjs
```

旧失败对照：将 `TEST_ROOT` 指向上传 ZIP 解压后的 `tokimemo--` 目录，再运行 `mv-update-regression.mjs`。原包不包含工具目录；本轮恢复的是验证工具，没有以旧生产源覆盖上传包。

三项原有失败为 `revision drift journals paid result and survives a fresh runtime`、`frame cast is the exact intersection of shot people and appearance preference`、`settings updater entry renders escaped complete running version independently of update status`。第三项仍断言旧设置页入口，而上传分支已改为设置标题旁的入口；未删除失败或改回旧界面。

扩大试跑额外包含 `mv-index-regression.mjs`，其中 `fresh runtime can repair an actual r84.209 blocked paid result with save-only retry` 报 `BASELINE_ROOT must identify delivered r84.209`。本轮仅有用户上传的 1.0.24 原包，不能拿它冒充该历史迁移素材。最终命令不含这组历史迁移检查，测试文件和失败记录保留。

构建：`BASELINE_ROOT=/原包解压路径/tokimemo-- python3 tools/verification/build.py /当前源码路径/tokimemo-main`。原包存在两处无行为差别的打包形式差异：`homeView.js` 的两个完整函数声明位置不同、`settingsPanelMarkup.js` 的运行包保留两个没有引用的旧导入。构建器仅接受已核对的完整声明移位和未引用绑定，函数内容变化仍会报错。

新布局已经进入生产源码和运行包，不是只改独立 HTML。此前新增 7 项正式运行包集成、3 项生产 HTML/CSS 结构及 4 项原生图片编辑检查，覆盖单一歌曲入口、统一进度、页面清理、分区滚动、共享素材与单镜替换图隔离、保存失败不跳镜、原图对照和画布适配。此次增加三份待保存结果、短／长分镜分页及防止画布压成细条的规则检查。这句所述为此前手机高度修正范围；当前清理与画幅修正版已修改 `src/extras/mv.js` 和 `src/ui/mvStageCanvas.js`。`src/ui/homeView.js` 继续保持上传原包内容。

用户录屏确认上一版在手机上出现严重压缩，证明之前的结构检查不足以验收布局。新增高度检查仍然只验证 CSS 规则，不计算 Safari／TT 的真实排版。当前没有可运行的本地浏览器，因此此次修正的实际尺寸、触控、滚动衔接与视觉结果仍未验收；不能把 184 项通过解释为真机成功。

测试包含合成 MP4/MOV、ffprobe 对照和原生 Canvas；页面宿主、媒体解码和录制为模拟。生产 HTML 使用 libxml 检查结构，CSS 检查作用域与规则；独立 HTML 做结构、JavaScript 语法和有限状态检查。这些不是浏览器排版截图、真实媒体播放或真机触控检查。不能据此宣称 PC、iPhone、TT 全部实测通过。

打包核对：`python3 tools/verification/package.py /当前源码路径/tokimemo-main /输出目录/hearttrace-upload-1.0.25.zip`。检查 ZIP CRC、完整文件内容、统一根目录、无 `.github`、版本与 BUILD 完全一致；跳过依赖目录和 Python 缓存。显示版本与 BUILD 仍为 `1.0.25`，当前入口和运行包 URL 使用 `layout=5` 以区分同号旧包缓存。输出 JSON 给出文件数、包大小与 SHA-256。


## 本次清理／画幅／面板修正

新增 9 项：暂存单条与全部清除、刷新后不恢复、隔离已保存作品及其他聊天、清理存储失败保留原结果；实际窗口点击分发到更多／关闭／素材库／清理；面板挂载与撤销时保持在原生宿主窗口内且释放背景；横竖精确宽高参数；两种画幅的手臂贴边、底部断口、推进和入场；原生 Canvas 导出与预览像素一致。界面宿主是模拟节点，不能验证真实点击命中与 Safari 排版。

`feedback-regression.tap` 为手机高度检查命令再加 `mv-feedback-repair-regression.mjs`、`mv-ratio-regression.mjs`、`mv-save-confirmation-regression.mjs`、`mv-journal-upgrade-regression.mjs`、`mv-stage-canvas-regression.mjs`、`mv-material-regression.mjs`、`mv-composite-regression.mjs`。其中 3 项 r84.215 迁移检查缺少 `PREVIOUS_BUILD_ROOT`，保留失败记录，不把它们计入通过。原比例检查中要求交换 1216×832 的断言已按本次明确要求改为精确 16:9／9:16，保留渠道配置不被修改、普通 CG 不变、横竖切换及备用渠道的检查。

精确宽高目前仅落实到已有参数依据的智绘姬请求；柏宝绘保留公开适配的横／竖约定，没有凭空增加未知字段，也没有限制用户继续生成。真实渠道返回和用户原素材都尚未验证。关闭面板改用宿主内独立层，44px 触控目标、相对宿主最大高度、独立内容滚动及键盘退场共用，仍需 PC／手机／TT 真实验收。

## 10 月 5 日晚：流式接收与图片编辑

本次先查看 9.133 秒用户录屏，并对照 503／524 诊断，再增加故障复现。31 项专项对修正前为 21 通过／10 失败，当前为 31 通过。首次较小复现记录为 `stream-canvas-before.tap`，只包含当时已增加的 22 项；不能与后续 31 项直接混为同一口径。

最终 291 项检查是在此前 260 项的命令上新增 `mv-stream-transport-regression.mjs`、`mv-host-response-regression.mjs`、`connection-error-category-regression.mjs`，并纳入图片编辑／手机焦点的新增用例。6 项失败仍为前述 3 项旧失败与 3 项缺失历史包。没有真实模型调用，也未验证云酒馆或 TT 是否端到端持续转发流片段。

新增行为：分镜的生成、补写和单镜改写使用 preferStream；Profile 与手动 API 尊重显式 off。测试涵盖一个点击一个请求、配置预算保持、流中断不覆盖、503／524 保旧、同次请求返回 JSON 不另发、首片段计时不含私密内容。收到片段数是接收接口的片段数，不是 token 数。

编辑器检查使用原生 Canvas 与模拟事件节点，确认移动后选笔刷可以实际擦除、笔刷预览不修改像素、裁切复位、异步保存期间返回、专注模式进入／退出恢复导航、加载前已有返回。生产 HTML 由 libxml 解析，CSS 只检查作用域、结构和规则，不等于手机布局或点击命中验收。

公共创作提示词 `src/generation/prompts.js` 与类型规则 `src/extras/mvDirection.js` 的 SHA-256 和上一份 1.0.25 完全相同；`src/extras/mv.js` 仅在三个调用处加入流式偏好，没有修改 Prompt、切批或生成范围。完整差异随包保留。

## 大画布与工具收起修正

根据用户澄清，目标不是阻止缩放挤压布局，而是增加画布原本的可视空间。移除始终展开的工具区分配，窄窗口默认只显示三种工具入口；透明底检查移入工具内容，底部保留独立的撤销／主保存／保存并下一镜。宽窗口仍可默认使用侧栏，布局仅取宿主自身宽度，不依赖 TT 专有接口。

放大后，工具折叠或宿主尺寸变化会保留图片当前的 CSS 显示尺寸，而不是跟着新的适配宽度再放大。模拟 360px 宽、200px 高画布中放大的图片，扩大到 500px 高后仍为相同显示宽度，查看中心保持；“看全图”则明确重新适配。这是受控几何检查，不是实测手机可视高度。

专项命令：`TEST_ROOT=. node --experimental-vm-modules --test --test-reporter=tap tools/verification/mv-editor-native-regression.mjs tools/verification/mv-layout-dom-regression.mjs tools/verification/mv-mobile-height-regression.mjs`。同套检查在前一包失败 6 项：窄屏折叠、宽屏折叠、缩放尺度、独立常驻操作结构、旧高度规则、暂存结果占用画布。当前 30 项通过，全部操作通过实际生产运行包执行，但 DOM/ResizeObserver 是模拟，像素使用原生 Canvas。

完整命令与前次 `stream-canvas-final-regression.tap` 相同的 24 个测试文件，增加本轮 5 个用例后共 296 项。仍为 3 项旧失败与 3 项缺少历史包，不计为通过。此次生产差异仅为图片编辑的 3 个源文件；未修改取景、生成、图片处理算法、音频、原档案或数据格式。没有可用的实际浏览器，本次没有制作伪装成真实测试的界面截图；PC／iPhone／TT 视觉排版和实际触控仍须验收。
