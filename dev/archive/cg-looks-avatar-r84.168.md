# r84.168 完成记录

唯一基线为用户上传的 r84.167 ZIP；隔离副本修复三项审计发现及失真的验证记录。变更边界、兼容承诺与验证结果见 CHANGELOG 首条和 verification/checks.json。

- 画面草稿只在人物外貌匹配时复用；保存值和手动清空优先。
- 多人任务按选中 ID 冻结外貌；沿用旧任务与部分成果父任务的原始提示。新多人使用独立方言，旧声明保持原样。
- 历史用户头像只读当前展示的档案；缺失时不借用实时 Persona。
- 不额外发送模型请求，不修改成功段恢复、正文合同、请求次数、篇幅或存储限额。

重点连接：castLooks.participantLooksBasis → generationSavedActions.beginModeRecovery → cgPromptPolicy → cgVisualRules.cgParticipantVisualInstructions；多人草稿由 normalizeGeneratedCgDraft 接收，经 initialCgAppearanceMetadata 按本地 ID 绑定。合并睡前故事的完整提示存入既有 task.snapshot。

检查按三轮进行：根因复现和修复、全套兼容与差异核对、完整 ZIP 新目录解压验证。均为同一执行者自查，未使用独立审计服务；没有真实宿主/模型验证。
