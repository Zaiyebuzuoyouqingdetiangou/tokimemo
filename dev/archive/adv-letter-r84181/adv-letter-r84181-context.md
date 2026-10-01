# r84.181 ADV 信封修复上下文

基线为已交付 r84.180 完整 ZIP，SHA-256 dc6b67c19cb06b64b1dc78985e9aad9d9d93b565ef713bdb98149d5b2c1ce411。独立副本修改，不写 GitHub。

用户截图：信封展开 ADV，事件标签挤成竖排、标题列只剩标题和大空白。
实际路径：ui/autoMemoryShell.writeRound → autoMemory/incrementalView.roundReadingHtml → advSurface。原表头只有一个状态子项，却复用主窗口三列选择器 CSS。原阅读器只读取 adv.paragraphs；没有正文时漏展示已保存的 cgDesc；HTML 的内部 div 还误写为 section 闭合。

修复边界：仅信封 ADV 的阅读 HTML 与专属 CSS。显示已保存的标题、日期、场景描述和全部正文；缺正文/部分正文明确短状态，不生成假正文、不额外发请求。保留原本按本轮信源筛选、主窗口选择器、全部 Prompt、生成与存储逻辑。

验证：先失败后通过的定向行为测试；Happy DOM 实际样式镜像与页面结构验证（不是 Chromium 真机）；三轮全量、第三轮 ZIP 新解压。当前环境只有 Playwright 客户端，无 Chromium/WebKit 可执行文件，未做真机布局结论。

封包状态：前两轮均为431/431，构建、语法、名字、护栏与DOM模拟全部通过；运行源码锁定。第三轮从最终ZIP新解压执行，结果记在随包交付的外部验证报告与证据ZIP，避免验证完再改动安装包。
