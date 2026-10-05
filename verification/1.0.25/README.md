# 1.0.25 核验记录

生产基线：用户本轮上传的 `tokimemo-- 10.zip`。

SHA-256：`e979c3eef45a08b57e6b68332e93632e9f3254fbf37ab7171e22f7ad6d1a97d5`。

| 记录 | 结果 |
| --- | --- |
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

最终完整相关检查命令（插件根目录；布局结构检查需 Python lxml，像素检查需原生 Canvas 依赖）：

```sh
TEST_ROOT=. node --experimental-vm-modules --test --test-reporter=tap tools/verification/mv-mobile-height-regression.mjs tools/verification/mv-layout-integration-regression.mjs tools/verification/mv-layout-dom-regression.mjs tools/verification/mv-single-music-regression.mjs tools/verification/preview-single-music-regression.mjs tools/verification/mv-audio-source-regression.mjs tools/verification/mv-video-audio-import-regression.mjs tools/verification/mv-music-link-regression.mjs tools/verification/music-link-loading-regression.mjs tools/verification/mv-editor-workspace-regression.mjs tools/verification/mv-editor-native-regression.mjs tools/verification/mv-framing-paths-regression.mjs tools/verification/mv-request-lifecycle-regression.mjs tools/verification/mv-update-regression.mjs
```

旧失败对照：将 `TEST_ROOT` 指向上传 ZIP 解压后的 `tokimemo--` 目录，再运行 `mv-update-regression.mjs`。原包不包含工具目录；本轮恢复的是验证工具，没有以旧生产源覆盖上传包。

三项原有失败为 `revision drift journals paid result and survives a fresh runtime`、`frame cast is the exact intersection of shot people and appearance preference`、`settings updater entry renders escaped complete running version independently of update status`。第三项仍断言旧设置页入口，而上传分支已改为设置标题旁的入口；未删除失败或改回旧界面。

扩大试跑额外包含 `mv-index-regression.mjs`，其中 `fresh runtime can repair an actual r84.209 blocked paid result with save-only retry` 报 `BASELINE_ROOT must identify delivered r84.209`。本轮仅有用户上传的 1.0.24 原包，不能拿它冒充该历史迁移素材。最终命令不含这组历史迁移检查，测试文件和失败记录保留。

构建：`BASELINE_ROOT=/原包解压路径/tokimemo-- python3 tools/verification/build.py /当前源码路径/tokimemo-main`。原包存在两处无行为差别的打包形式差异：`homeView.js` 的两个完整函数声明位置不同、`settingsPanelMarkup.js` 的运行包保留两个没有引用的旧导入。构建器仅接受已核对的完整声明移位和未引用绑定，函数内容变化仍会报错。

新布局已经进入生产源码和运行包，不是只改独立 HTML。此前新增 7 项正式运行包集成、3 项生产 HTML/CSS 结构及 4 项原生图片编辑检查，覆盖单一歌曲入口、统一进度、页面清理、分区滚动、共享素材与单镜替换图隔离、保存失败不跳镜、原图对照和画布适配。此次增加三份待保存结果、短／长分镜分页及防止画布压成细条的规则检查。`src/extras/mv.js`、`src/ui/mvStageCanvas.js`、`src/ui/homeView.js` 与上传原包逐字节一致。

用户录屏确认上一版在手机上出现严重压缩，证明之前的结构检查不足以验收布局。新增高度检查仍然只验证 CSS 规则，不计算 Safari／TT 的真实排版。当前没有可运行的本地浏览器，因此此次修正的实际尺寸、触控、滚动衔接与视觉结果仍未验收；不能把 184 项通过解释为真机成功。

测试包含合成 MP4/MOV、ffprobe 对照和原生 Canvas；页面宿主、媒体解码和录制为模拟。生产 HTML 使用 libxml 检查结构，CSS 检查作用域与规则；独立 HTML 做结构、JavaScript 语法和有限状态检查。这些不是浏览器排版截图、真实媒体播放或真机触控检查。不能据此宣称 PC、iPhone、TT 全部实测通过。

打包核对：`python3 tools/verification/package.py /当前源码路径/tokimemo-main /输出目录/hearttrace-upload-1.0.25.zip`。检查 ZIP CRC、完整文件内容、统一根目录、无 `.github`、版本与 BUILD 完全一致；跳过依赖目录和 Python 缓存。显示版本与 BUILD 仍为 `1.0.25`，入口和运行包 URL 加入 `layout=2` 以区分同号旧包缓存。输出 JSON 给出文件数、包大小与 SHA-256。
