# Hearttrace r80 验证记录

版本：0.8.75 / 0.8.75-tt-cg-r80.0。日期：2026-09-14。

## 范围与基线

从已交付 Hearttrace-r79-full.zip 解压修改，未使用 GitHub main；r79 SHA-256：88d7a47c47d3890c69b8d8f16cee9ac874b2e3576afdc66ed3874276a515b12d，1,674,259 bytes、149 文件。保留此前用户上传 r74 的修复链；原包不覆盖。本轮只修进入酒馆时可复现的备份误报，不进行多人卡适配。

## 问题与修复

用户截图：独立备份未更新，RMT_BACKUP_UNKNOWN/unknown。旧版 ensureCurrentArchiveBackup 的默认参数直接调用 currentCharacterGuard；无角色、群聊或宿主尚未就绪时，该调用在进入备份函数体之前抛普通上下文 Error。初始化 catch 随后将它归为未知备份失败。

已复现：无角色及群聊均得到与截图相同的代码/阶段，备份后端读取0次、写入0次。已保存的自动更新开关可以使 runtime 在角色聊天准备好之前加载，因此存在进入酒馆即出现的触发路径；并非证实用户数据库损坏。

修复仅在 src/core/cache.js 的 ensureCurrentArchiveBackup 入口：将上下文获取移入函数体，无合适聊天、角色、chatId 或 metadata 时返回 false；不访问 IndexedDB。角色 ID 0 保持合法。后续备份读写、压缩、事务、身份校验、删除保护与原 toast 均未更改。

真实存储错误仍传播，不靠屏蔽 warning 解决。打开有效聊天档案后沿用原路径正常备份，不新增重试循环、计时器、依赖或模型请求。

## 已执行验证

- 旧 r79 公开 API 定向复现：无角色/群聊抛 Error，映射 UNKNOWN/unknown，后端读写均0。
- r80 同条件返回 false，后端读写仍0。
- 受影响测试 **25/25**：r80BackupPreflight、r77StorageDiagnostics、r77ArchiveSaveRetry。
- 新增6项覆盖宿主不可用、未选角色、群聊、显式无效上下文、随后进入合法角色0恢复备份、真实 SecurityError/read、QuotaExceededError/write，以及读取等待期间切聊天不写错档案。
- 当前源码完整测试 **215/215**，27个文件；0失败、0取消、0跳过。
- 全部 JS/MJS 语法 **135/135**；97模块 bundle 连续重建一致，五个既有公共导出可正常导入。
- 独立只读复核确认角色0不被误拦，新增 catch 不覆盖真实读写路径，无阻断项；不是外部安全审计服务报告。

## 构建标识

- Source SHA-256：dbfb793ecd76fe5d3eafaabe4d22495302752d752a4417a151dd75063b7eb138
- Bundle SHA-256：9823499235fc2bcc4879c8cfc3d14bb128741e1059022181ccb629215058b0ff
- Bundle：2,717,777 bytes，比 r79 增加 467 bytes。

最终 ZIP 的 SHA、CRC、逐文件一致性及全新解压回归结果记录在外部交付的 Hearttrace-r80-validation.md，包内不写自身 ZIP 哈希。

## 限制与安装

以上使用真实插件函数及宿主/存储后端替身，未登录用户云酒馆，也未执行真实浏览器、iPhone、TT或安卓安装/IndexedDB测试。已修复一条可复现且与截图代码完全一致的误报链，截图仍不足以排除用户环境存在另一项实际存储错误。

覆盖原插件目录后刷新，确认0.8.75；无需清空站点数据或重建档案。若角色聊天已打开后仍显示备份错误，应查看当时的脱敏诊断代码与阶段，继续区分真实存储故障。原页若提示“仅本页保留”，先完成保存，再刷新升级。

r79时空回响、错时相逢和头像悬浮入口继续保留，多人卡仍未实现。
