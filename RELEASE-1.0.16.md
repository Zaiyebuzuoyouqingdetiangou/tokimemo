# 1.0.16：歌曲收纳、抠图与手书合成

构建：`1.0.16-r84.233-mv-composite`。基于已交付的 1.0.15 老 UI 独立修改，原包保持原样。

## 本次修改

1. 歌曲列表默认折叠，摘要显示首数与当前歌名；展开后可以滚动选歌。阅读模式、创作格式、做成 MV 放在当前歌曲的封面上方，MV 按钮继续绑定该歌曲。
2. 自动抠图补清理单人躯干两侧符合残底特征的封闭纯色区域，保护中央白衣和小面积眼白。已保存透明图可利用保留的原稿再次处理；新增“点除残底”，只清除所点击的连通色块，支持撤销、恢复和保存 PNG。
3. 人物缩放、位置按可见轮廓计算，不再受到透明画布留白影响。全身、远景按底部落位并使用小范围接触阴影；半身裁切边缘落在画面外。明确的眼部等局部特写按镜头比例铺满。大幅偏移的高不透明度人影改为贴近主体的轻微阴影。
4. 舞台字幕按语义分配到两侧，每句只出现一份，避开人物与入场动作范围。空间不足时转为前景字幕；按可用空间缩小字号，普通英文单词保持完整。深浅文字均增加反差描边；关键词与完整歌词不会挤在同一个底部区域。转场不再重绘上一句字幕。空格、标点差异不会触发重复歌词。

## 已有内容

- 原有歌曲、分镜、素材引用、图片原稿、手动透明蒙版、段落定点和逐句定点继续使用；无数据迁移。
- 播放端的尺寸、落位与字幕修正无需重新生图。已手动保存的旧蒙版不会被后台改写；可打开素材重新一键处理，再保存。
- 复杂背景、多人交叠、白纱或难以区分的白色区域仍需预览和局部处理；本次不承诺任何图片都能自动抠净。
- 生成请求、提示词模板、模型接口、档案、缓存、保存机制、轻量启动和其他功能不变。没有调用收费服务，没有写入 GitHub。

## 验证结果

详见 `verification/1.0.16/`：

- 最终 bundle 全量回归：432 项，429 通过、3 失败、0 跳过。新增 15 项全部通过。
- 原版 1.0.15 使用原测试独立复测：417 项，414 通过、同样 3 失败。失败名称与断言内容一致，无新增回归失败。
- 根据本次明确的界面需求，仅更新旧测试中“MV 按钮在整页最上方”的断言；其余原回归测试文件保持原字节。
- 400 个 JS/MJS/CJS 文件语法检查通过，2602 个静态相对导入解析通过；运行包初始化 prematureReads、undefinedBindings 均为 0。
- 320 个源模块连续两次构建结果一致；167 个导出的提示词相关函数与原版一致。
- Native Canvas 覆盖横竖屏、透明留白、封闭残底、白衣与眼白、重复清理、点除撤销与 PNG 保存、局部特写、字幕避让、转场去重，以及预览/导出同时间像素一致性。
- `native-composition-sheet.png` 为最终合成逻辑使用免费几何测试图生成的画面，已人工查看。它不是用户完整 MV 的重导出，也不是浏览器 DOM 截图。当前环境无中文字体，中文测试验证文本完整性与测量约束；真机字形仍需确认。
- 新代码差异安全检查：没有新增网络入口、外部依赖或动态代码执行；歌曲标题和 ID 继续转义，付费请求与数据归属边界不变。当前环境没有 Codex Security 专用工具。
- 1.0.15 包中没有旧文档提及的 `tools/refactor-guard.mjs` 等旧工具。本轮使用该包已有的 `tools/verification/build.py`、运行绑定检查、全量回归，以及与原包逐文件哈希对比；未声称运行缺失的工具。

原版同样存在的三项失败，本轮未修改其断言或相关生产逻辑：

1. `a verse-only export does not preload a motif that is only rendered in the chorus`
2. `revision drift journals paid result and survives a fresh runtime`
3. `frame cast is the exact intersection of shot people and appearance preference`

未执行：真实 iPhone/TT/SillyTavern 操作、浏览器 DOM/CSS、收费生成、用户 3:03 工程完整重导出。

Bundle SHA-256：`07a924ba159c87928c9a42dd9bacc65bb276756dfaf3ec51f2c5f03c91456e19`

## 复核命令

```bash
python3 tools/verification/build.py .
TEST_ROOT=. BASELINE_ROOT=/path/to/r84.209/tokimemo-main PREVIOUS_BUILD_ROOT=/path/to/r84.215/tokimemo-main node --experimental-vm-modules --test --test-concurrency=4 --test-reporter=tap tools/verification/*regression.mjs
node --experimental-vm-modules tools/verification/runtime-bindings.mjs .
TEST_ROOT=. node --experimental-vm-modules tools/verification/mv-composite-visual.mjs verification/1.0.16
```

Native Canvas 测试需要 `@napi-rs/canvas`。完整 ZIP 内保留源码、构建运行包、原有工具、回归测试和本轮验证记录。
