# 测试分支残留文件清单（r84.94 更新）

GitHub 导入只新增 / 覆盖文件，**不会删除**。下面这些文件在交付包里早已删除，但仓库分支里还留着旧的一份。它们都不参与运行（插件只加载 `index.js`、`src/core/autoUpdatePolicy.js` 和 `dist/heartbeatMemories.bundle.js`），留着不影响使用；但以后有人从分支读代码，最容易改错的就是它们，尤其 `src/modes/styles.js`（254KB）、`src/modes/overlay.js`（94KB）、`src/modes/settingsPanel.js`（75KB）。

## 最省事的删法（电脑上装了 git 或 GitHub Desktop 时）

在仓库目录里切到 `测试` 分支，复制下面一整段运行，然后提交并推送：

```bash
git rm -r -- \
  src/modes/advEventView.js \
  src/modes/albumView.js \
  src/modes/archiveAvatars.js \
  src/modes/archivePortal.js \
  src/modes/butterflyView.js \
  src/modes/calendarView.js \
  src/modes/cgImageViewer.js \
  src/modes/cgPromptEditor.js \
  src/modes/contentManager.js \
  src/modes/endingView.js \
  src/modes/floatingArchive.js \
  src/modes/floatingAvatarButton.js \
  src/modes/heartView.js \
  src/modes/homeView.js \
  src/modes/immersionStyles.js \
  src/modes/inboxStyles.js \
  src/modes/inboxView.js \
  src/modes/navigationBookmark.js \
  src/modes/overlay.js \
  src/modes/pastLivesView.js \
  src/modes/phoneView.js \
  src/modes/readingStyles.js \
  src/modes/recoveryView.js \
  src/modes/settingsPanel.js \
  src/modes/styles.js \
  src/modes/themeSurfaces.js \
  src/modes/timeStoriesView.js \
  src/modes/travelView.js \
  src/ui/photoshootView.js \
  dev/active/refactor
git commit -m "删除不参与运行的旧文件"
```

只能用 GitHub 网页时，逐个打开文件，点右上角的垃圾桶图标删除即可（`dev/active/refactor/` 里有 4 个文件）。

## 清单

- `dev/active/refactor/`（整个目录；正式记录在 `dev/archive/refactor/`）
- `src/modes/advEventView.js`
- `src/modes/albumView.js`
- `src/modes/archiveAvatars.js`
- `src/modes/archivePortal.js`
- `src/modes/butterflyView.js`
- `src/modes/calendarView.js`
- `src/modes/cgImageViewer.js`
- `src/modes/cgPromptEditor.js`
- `src/modes/contentManager.js`
- `src/modes/endingView.js`
- `src/modes/floatingArchive.js`
- `src/modes/floatingAvatarButton.js`
- `src/modes/heartView.js`
- `src/modes/homeView.js`
- `src/modes/immersionStyles.js`
- `src/modes/inboxStyles.js`
- `src/modes/inboxView.js`
- `src/modes/navigationBookmark.js`
- `src/modes/overlay.js`
- `src/modes/pastLivesView.js`
- `src/modes/phoneView.js`
- `src/modes/readingStyles.js`
- `src/modes/recoveryView.js`
- `src/modes/settingsPanel.js`
- `src/modes/styles.js`
- `src/modes/themeSurfaces.js`
- `src/modes/timeStoriesView.js`
- `src/modes/travelView.js`
- `src/ui/photoshootView.js`

注意：`src/modes/` 里的其他文件（room.js、heart.js、phone.js 等）正在使用，不要删；只删上面列出的路径。

删完后，下一轮开工时 AI 会复查“入口不可达的源文件为 0”（重构清单 1-2）。
