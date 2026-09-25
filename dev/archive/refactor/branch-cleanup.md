# 测试分支残留文件清单

测试分支的 ZIP 导入只新增 / 覆盖文件，不删除。下面这些文件在新包里已经删除或移走，但仓库里还留着旧的一份。它们**都不参与运行**（插件只加载 `index.js`、`src/core/autoUpdatePolicy.js` 和 `dist/heartbeatMemories.bundle.js`），留着不影响使用，只是会让以后读仓库的人（和 AI）看到过期内容。

想清理时，在本地仓库或 GitHub Desktop 里一次删掉这些路径再提交即可；网页上只能一个个删。

## 根目录旧文档（已移到 dev/archive/）

- LOCAL-REPAIR-r84.56.md
- REPAIR-r84.69.md、REPAIR-r84.70.md、REPAIR-r84.71.md
- REVIEW-r84.57.md、REVIEW-r84.58.md、REVIEW-r84.59.md
- REPLACE-INSTRUCTIONS.txt
- 施工方案.md、整体逻辑.md
- 问题分析-为什么会反复出现重试未完成部分.md、问题分析-房间预算与长记忆上限.md
- 乱码文件名的 .md（例如 `P0-╨▐╕┤╦╡├≈.md`、`╩⌐╣ñ╖╜░╕.md` 以及 `#U…` 开头的文件名），如果仓库里有

## 不可达旧源文件（r84.72 删除）

src/modes/ 下：advEventView.js、albumView.js、archiveAvatars.js、archivePortal.js、butterflyView.js、calendarView.js、cgImageViewer.js、cgPromptEditor.js、contentManager.js、endingView.js、floatingArchive.js、floatingAvatarButton.js、heartView.js、homeView.js、immersionStyles.js、inboxStyles.js、inboxView.js、navigationBookmark.js、overlay.js、pastLivesView.js、phoneView.js、readingStyles.js、recoveryView.js、settingsPanel.js、styles.js、themeSurfaces.js、timeStoriesView.js、travelView.js

src/ui/ 下：photoshootView.js

注意：只删上面列出的 `src/modes/` 文件。`src/modes/` 里其他文件（room.js、heart.js、phone.js 等）是正在用的。
