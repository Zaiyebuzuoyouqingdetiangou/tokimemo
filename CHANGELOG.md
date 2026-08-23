## 0.8.10 concurrent-drama-r27

- **修复五季按钮仍共用同一 HEART 锁**：未来/后日谈、春、夏、秋、冬改用独立 `heart-season:<scope>:<season>` 逻辑任务键，可以同时点击。最多 5 个用户逻辑任务可排队，真正发往 Connection Manager 的请求仍最多 2 个同时执行，避免重新引入 r23 的 429/断连问题。
- **单季再拆 Voice / Scenario**：春夏秋冬不再要求一个 JSON 同时装下 Voice + Scenario；每季按 Voice → Scenario 两个小请求生成，任一小段成功立即保存。只完成一半时 UI 显示 `1/2`，再次点击只补缺失部分；完整后再次点击才会整季重生成。
- **降低 Drama 脆弱完整度门槛**：四季 Voice 调整为至少 5 节点 / 280 字，Scenario 至少 6 节点 / 360 字；未来/后日谈 Voice 调整为至少 8 节点 / 420 字。对应单段输出预算降到 3k～3.8k tokens，并使用较低的结构化创作温度，减少长 JSON 截断或格式漂移。
- **并发写回改为 patch 合并**：每个季节/Voice/Scenario 只写自己的 patch，提交前重新读取当前 HEART session 合并；不同季节同时完成不会互相覆盖。切到别的聊天后完成的 patch 会按 origin + archiveRevision 延迟写回，并在回到原聊天时重新归一化。
- **回归测试 18 项通过**：新增不同季节独立逻辑键、Provider 两并发上限、轻量 Voice/Scenario 校验和兄弟季节 patch 不互相覆盖测试。

## 0.8.10 lean-resume-seasons-r26

- **设置页删除 API 说明长文**：连接/模型等控件仍保留，但删除手动生图勾选框下方从“专用连接：…”到“模型刷新只调用…”的整块说明，避免移动端设置页被大段文字撑长。
- **HEART 说话人显示真实姓名**：日常一格和 Voice/Scenario 剧本中的 char/user 标签均改用当前档案角色名与 user 名，并继续经过 HTML 转义。
- **私人终端中断后可续写**：计划成功后立即建立 phone draft；每个 App 通过现有详情/证据校验后再以白名单字段写入草稿。失败时保留已完成 App，回到房间可从 N/总数继续；成功写入 Phone session 时清草稿，档案 revision 变化时也清草稿。
- **春夏秋冬 Drama 完全逐季生成**：不再用一个“生成春夏秋冬”动作串行跑完五段后才保存。未来/后日谈、春、夏、秋、冬各有独立生成按钮，每一季成功后马上经过 normalizeHeart + origin/revision fence 保存；其它季失败不影响已成功季节。
- **回归测试扩展到 15 项**：覆盖设置说明删除、真实姓名标签、单季 Drama 可独立归一化，以及终端续写草稿只保留已知有界字段。

## 0.8.10 incremental-achievements-r25

- **相簿与 CG/ADV 改为重要节点增量收藏**：不再强制 15 张 / 12 张或固定总量。每次从当前档案挑选约 3～6 个真正重要、适合视觉化的节点，与旧收藏按证据锚点合并；旧 CG 实图和已生成 ADV 会保留，后续档案更新继续往收藏中追加。共同回忆每张只需 4～6 段；界面删除“现在的他 → 现在的你”说明。
- **ADV 每批最多 6 篇**：收藏以后即使累计到十几、几十个节点，一次批量正文请求也只处理最多 6 篇；失败批优先局部重试，成功后再继续下一批。
- **告白头像对话只属于“告白回看”**：已发生告白通过真实 memory ID + anchor 校验后，可用角色卡本地头像逐句回看；未来 ENDING 路线不再生成/展示头像告白播放器。旧路线缓存里的 confession 字段仅保留兼容读取，不再作为路线完成条件。
- **角色互动拆成三个独立生成入口**：“各种时期的对话”“春夏秋冬 / Drama”“日常一格”互不连坐。初次只生成时期对话；四季页再按后日谈、春、夏、秋、冬小请求生成，日常一格单独生成。某一组未生成或失败不妨碍其它组保存和使用。
- **私人终端降低条目压力**：现代手机继续保留 10 类 App，但总目录约 32～33 条；深聊改为 2 个聊天各至少 12 条消息。terminal / watch / communicator 同步按设备能力降低总条目和深聊门槛，不再为了数量堆空内容。
- **新增档案室“成就库”**：类似成就墙，分已解锁 / 未解锁。已解锁成就必须由当前档案真实证据锚定；未解锁只允许写条件/提示，不能伪装成已经发生。成就库增量更新，不写回正式聊天记忆。
- **UI 瘦身**：删除相簿、ENDING、HEART、手机、档案浏览、加载页等大量重复说明文字，保留必要状态、错误、只读/写入保护和破坏性确认。
- **r24 请求协调器继续保留**：全局最多 2 个 Connection Manager 请求、单请求生命周期超时、错误分类、重试白名单、跨聊天 origin/revision fence 与最终原子提交均未放宽。

## 0.8.10 request-coordinator-r24

- **修复 r23 分段任务重复占槽**：一个相簿/私人终端/HEART/ENDING 模式无论包含多少子请求，都只占 1 个用户可见逻辑任务位；子请求不再与父任务重复挤占 5 槽上限。
- **统一模型请求协调器**：Connection Manager 同时最多发送 2 个模型请求；同一分段模式内部按顺序生成，避免 r23 的三路长请求并发触发 429、代理断连或兄弟请求互相拒绝。
- **不再无限生成中**：每个模型请求默认 300 秒超时。即使上游不响应 AbortSignal，插件也会停止等待、释放任务位并保留旧 session；为避免重复扣费，超时不会自动重试。
- **错误不再全部只显示 API request failed**：认证、限流、上下文超限、连接/模型配置、无效请求、上游 5xx/超时分别显示安全的分类提示；不会把模型正文、请求体、密钥或上游响应体写进提示。
- **重试边界收紧**：只有 JSON/本地完整度校验、429 和暂时性上游错误会对当前小段自动重试 1 次；认证、配置、上下文超限、无效请求、禁用词与单请求超时不自动重试。
- **ENDING 告白演出**：路线正文新增 6～10 句 `confessionLines`。界面使用本地角色头像、角色名与单句对话框逐页播放第一人称告白，提供上一句/下一句/重播；旧缓存只有 `confession` 时会在本地按句拆页，仍可直接阅读。
- **兼容与原子提交保持**：没有降低相簿 15/12/3、Phone 10 App/65 条、HEART Voice/Scenario、ENDING 路线/后日谈等完整度门槛；所有必需分段仍需通过本地归一化后才覆盖旧内容。

## 0.8.10 stable-segments-r23

- **修复私人终端经常生成失败**：不再要求模型一次返回完整 10 App / 65+ 条目 / 多组 24 消息深聊。先生成设备与 App/条目目录，再按 App 最多 3 路并行补详情；目录和单 App 均只局部重试 1 次，全部通过后才一次性提交 session。现代 phone 仍保留 10 类 / 65 条完整度；terminal 与 watch/communicator 的深聊门槛改为与“可压缩设备能力”的 prompt 一致，不再错误地一律要求 3 个 24 消息深聊。
- **修复回忆相簿经常 JSON 截断/校验失败**：先生成 15+ CG 目录与真实证据，再把已解锁 CG 每 4 张一组并行生成 6～8 段“现在的他陪现在的你看旧 CG”的 comments；单组失败只重试该组，最终仍走原完整相簿归一化。
- **修复 HEART / Voice Drama 经常生成失败**：关系锚点、问候、特别日、日常一格作为基础包；后日谈 Voice、四季 Voice、四季 Scenario 拆成 3 个并行小请求，各段独立完整度校验与一次局部重试，最后合并后仍经过原 `normalizeHeart`。
- **ENDING 提速**：关系路线目录与已发生告白扫描并行；拿到目录后，已解锁路线正文最多 3 路并行，而不是逐条串行排队。仍保留每条路线最多一次重试、任一路线失败则本轮不覆盖旧 ENDING。
- **输出预算更可控**：新增分段请求的单段上限为 5.5k～12k tokens；默认设置 16,384 tokens 足以容纳每个设计分段，同时仍严格取 `min(用户设置, 请求上限)`，不会绕过用户/provider 限制。

## 0.8.10 ending-album-image-r22

- **ENDING 改为分段生成**：先单独判断当前关系与 5～7 条路线目录，再单独扫描“已发生告白回看”，最后只对 `available=true` 的路线逐条生成长篇终章 / confession / 后日谈；不再把关系判定、告白回看、所有长结局一次塞进同一个 JSON 请求。每条已解锁路线失败会在短 prompt 下最多重试 1 次；仍失败则整次 ENDING 不覆盖旧缓存。告白扫描单独失败时保留旧告白回看缓存（没有旧缓存则为空），不再拖垮全部 ENDING。
- **共同回忆回归“一起翻相册”**：回忆相簿 `comments` 明确改为“现在的角色对着现在的用户，看过去这张 CG 时说的话”，禁止写成 ADV 式过去内心独白或从头复述事件；界面增加 `NOW · 一起翻相册 / 现在的角色 → 现在的你` 标识。旧相簿缓存仍可读，重新生成相簿后会获得新语义内容。
- **Image Generation 检测与手动兜底**：自动检测从只认 `/imagine` 扩展为 `/imagine`、`/sd`、`/img` callback；设置中新增“手动确认 Image Generation 已启用”。只有用户显式勾选后、自动检测仍失败时，才会通过 SillyTavern 公开 `executeSlashCommandsWithOptions` 调用 `/sd quiet=true`。进入 STscript 的视觉 prompt 会去掉宏花括号、折叠换行并转义管道，避免模型生成文本被解释成额外脚本。

## 0.8.10 archive-room-r21

- 档案室角色分组不再只依赖 avatar：新写入/重新扫描的索引会记录当前角色卡内容指纹（avatar + 名称 + description/personality/scenario/first_mes/mes_example），优先据此区分 `char` 与同头像/同名的 `char 2.0`；旧索引没有指纹时退回 avatar + 角色名并可手动拆分。
- 新增“管理角色分类”：可以一键自动分类未锁定档案、把单个聊天档案移动到已有角色组，或从当前 SillyTavern 角色列表手动选择 char 新建角色组。手动移动后的档案不会被后续自动分类覆盖。
- 旧档案如果“同头像 + 同名”且没有历史角色卡指纹，自动扫描不会猜版本：每个无法唯一判断的档案单独进入“待手动分类”，由用户移动到正确角色组。重扫同一头像时只请求一次聊天列表，避免不同版本循环互相覆盖索引归属。
- 新增档案删除入口：当前真实聊天可在两次破坏性确认后删除 Heartbeat 自己的档案与派生缓存，但明确保留 SillyTavern 聊天正文；其它历史档案只能“从档案室移除”轻量索引，插件不会为删除而自动切换聊天或删除聊天文件。
- 分类操作只修改 Heartbeat extension settings 中的轻量档案索引/角色组元数据；不会移动、重命名、删除 SillyTavern 聊天文件，不会改 `MEMORY_KEY`、CG/ADV 缓存，也不会切换宿主聊天。
- 同头像角色的 live 写入校验增加角色名匹配；运行中生成 task scope 使用当前角色卡内容指纹，避免两个共享 avatar 的不同角色把并发任务/迟到结果视为同一 origin。
- 新增“生成禁用词”设置，默认包含“老子”。禁用词同时进入派生生成 Prompt 与本地结果校验；命中时拒绝保存且不自动重试。`sourceMemoryAnchor` / `relationshipSourceMemoryAnchor` / `sourceExternalAnchor` 等证据锚点不参与过滤，历史聊天与正式档案原文不会被改写。
- 房间可视化不再所有空间复用同一“窗 + 床/沙发 + 小柜”骨架：卧室、客厅、厨房、书房、音乐/录音工作室、实验室、浴室、餐厅、阳台/庭院、工作间、办公室、营帐/船舱等映射到固定代码布局；同类型再按空间 ID 做 3 种稳定位置变体。旧房间缓存只要已有明确 `spaceType/label` 也会直接获得新布局。

## 0.8.10 json-output-r20

- “最大输出”允许设置到 **30,000 tokens**；保留用户自己的较低设置，不在升级时强制改成 30k。各主模式的请求上限不再被旧的 8k/10k/16k 模式常量提前卡住，最终仍以用户设置和模型/服务端实际能力为准。
- 当前聊天档案与记忆/摘要分块抽取移除硬编码的 `4096` 输出上限，改为使用用户“最大输出”（最高 30k）；结构化档案抽取温度最多 0.35，降低长 JSON 漂移概率。
- JSON 提取器改为字符串感知的平衡花括号扫描，可从 Markdown/说明文字中提取最后一个完整顶层 JSON 对象，不再简单截取“第一个 `{` 到最后一个 `}`”。
- 结构化输出错误区分为空最终正文（含“只有 reasoning、没有 final content”）、无 JSON、疑似截断、JSON 格式错误；错误只报告类型/长度，不把模型正文或推理内容写进日志/提示。
- 档案聊天分块或记忆/摘要分块遇到可重试 JSON 输出错误时，停止并询问是否**只重试当前分块**。只有用户明确确认才额外发送 1 次请求；取消或第二次失败都会终止本轮，旧档案与既有派生缓存保持不变。

## 0.8.10 memory-worldinfo-r19

- Added “选择记忆相关世界书” next to the memory/summary preflight. A companion worldbook can be imported as a whole or narrowed to exact entry UIDs.
- Memory-related worldbooks are context-only: they help interpret current-chat memory/summary records but cannot independently create happened-memory evidence or supply external anchors.
- Selection is stored per chat as book names/mode/UIDs only and is read only during explicit preflight through SillyTavern public world-info APIs.
- Added hard limits of 8 books / 160 entries / 52k world-info characters and invalidate the preflight cache whenever selection changes.

## 0.8.10 audit-r18

- 根据 r17 独立安全审计报告收尾低风险回归：删除只读重绘残留的无效 `preserveMode` 实参，并将 `openArchiveChatFromOverview` 重命名为只读语义明确的 `openArchiveSnapshotFromOverview`，继续保证档案一览不会切换宿主聊天。
- 五任务并发计数现在统一覆盖主模式构建、普通请求、ADV 批量/逐项恢复保留槽位以及 CG/日常一格生图任务；ADV 批量与房间“今日生活”在构建 Prompt 前也会执行前置容量检查，发送口继续保留第二道硬闸门。
- 第三方记忆插件公开 current-chat reader 改为 **显式 opt-in，默认关闭**。提示注入摘要、当前聊天 metadata 摘要继续可被动读取；只有用户勾选“允许调用第三方记忆插件公开 current-chat 读取函数”后才会探测/执行其它扩展的 reader。
- 调用 SillyTavern Slash Command 统一经过受控 `NamedArgumentsCapture` helper；不伪造 `_scope/_parserFlags/_abortController` 等解析器私有对象。Image Generation 仍只调用本地已注册 `imagine`，参数限 `quiet/gallery` 与净化后的视觉 prompt。
- 扩展销毁时仍完整保留未压缩 runtime cache 作为升级/重载兜底，不为了优化体积丢弃任何模式；超过约 2M 字符仅输出 console 体积告警。
- 文档同步：外部记忆预检入口、公开 reader 白名单、五任务并发以及自定义 header 仅提交 SillyTavern 同源模型状态后端的边界与实现保持一致。

## 0.8.10 state-cg-r17

- ENDING 的“告白回看”新增独立 **“只重新读取告白”**：只重新扫描当前手动档案里已发生的告白/关系确认并替换 `confessionReplays`，不会重生成结局路线、逆转告白、后日谈或 HEART/Voice Drama。
- 五个主入口的内容生成并发上限从 4 调整为 **5**；同时修正快速连点时仅统计已发出请求、未统计正在构建的模式任务的竞态，确保最多 5 个逻辑生成任务。
- 历史档案“只读查看”改成纯 UI 保护开关。关闭只读只显示重新生成/绘制等编辑按钮，**不再调用角色切换、聊天切换，也不再触发宿主界面刷新**。
- 对跨聊天历史档案执行写操作时，若当前 SillyTavern 并未手动打开该档案对应的真实聊天，只提示用户手动打开；不会自动切换，也不会用 snapshot 覆盖当前聊天 metadata。
- 当目标历史档案后来恰好成为当前真实聊天时，写入前重新校验 `characterKey + chatId + MEMORY_KEY`；若对应 live 派生缓存尚未加载，拒绝用只读快照替代。
- CG/ADV 与相簿的 Image Generation 状态条新增 **“重新检测”**。用户在打开档案后再启动生图扩展，无需关闭/重开档案；绘制按钮本身不再依赖首次检测结果。
- 删除 r15 的自动 `selectCharacterById/openCharacterChat` 编辑转换路径，修复关闭只读后宿主自动刷新、目标聊天未完成保存导致“档案读取失败/看起来消失”的问题。

## 0.8.10 heart-drama-r16

- ENDING 新增 `reverse / 逆转告白` 路线：只有真实档案能证明强烈依恋，并出现吃醋、竞争感、明显错过时机、关系摇摆或差点失去 {{user}} 的压力时才可解锁；允许急切争取但禁止威胁、强迫或把第三方恋爱写成既成事实。
- 新增独立 `HEART / 角色互动与 Voice Drama` 派生模式。角色头像可按本地早/中/晚/夜、周末、角色生日、用户生日（仅设定明确时）、特别日以及距上次点头像的时间弹出不同台词；久未访问可出现担心、闹别扭或关系适配的轻度吃醋。头像点击本身不调用模型。
- Voice Drama 增加后日谈长篇生活剧场与春夏秋冬四季内容；四季 Voice 以角色本人回想某一天的想法为中心，另设四季 Scenario Drama 作为普通日常事件剧场。所有剧场明确为模拟，不写回档案。
- Voice/Scenario 对话使用角色/用户头像气泡；`user` 行固定标注“剧本中的你 · 非正史”，不代表真实用户选择。
- 新增“日常一格”：至少 4 个 1/2/4 格 Q 版日常小剧场。文本分镜始终可读；用户可显式调用已配置的 SillyTavern Image Generation 绘制无文字漫画图，台词仍由 DOM 显示，避免图像模型乱码。
- 档案室角色头像增加对话入口；查看其他角色历史档案时仍只读取 metadata snapshot，不会因点头像自动切换宿主聊天。

## 0.8.10 archive-ending-r15

- 只读历史档案新增“只读查看”开关。默认保持只读；关闭时先明确询问是否切换到该档案对应聊天，切换本身不会自动生成任何内容。
- 只有显式关闭只读、并且 SillyTavern 成功进入同角色/同 chatId 的真实聊天后，才恢复重新生成、CG 绘制、ADV 补齐等写操作；每次“重新生成”继续使用独立二次确认。
- 关闭只读属于用户主动导航，不再是档案浏览的隐式副作用；跨聊天任务进行中时禁止关闭只读，避免后台结果被重定向。
- ENDING 新增“告白回看”分页：从当前手动档案中检测已经真实发生的真心告白、双向告白、友情告白、间接告白、关系确认、未被接受告白等；不要求凑齐类型。
- 告白回看与未来 ending confession 严格分离：每条回看必须有真实 sourceMemoryIds + sourceMemoryAnchor；无证据时返回空列表，不凭空制造过去告白。
- 告白回看的场景/告白文字标明为档案式演出重构，不宣称逐字复现聊天原文；{{user}} 的回应只允许摘要已经归档的结果。

## 0.8.10 cg-ui-r14

- CG 生图入口不再藏在详情深处：回忆相簿每张已解锁 CG 卡片右下角直接显示“🎨 绘制 / ↻ 重绘”。
- CG/ADV 详情顶部新增 CG 实图状态条，明确显示 SillyTavern Image Generation 是否已检测到；绘制按钮提升为第一主操作。
- 从全角色档案馆打开的条目如果正好就是 SillyTavern 当前已打开的同角色、同聊天档案，则直接使用 live 当前档案，不再误标为只读；不会触发角色或聊天切换。
- 真正的其他历史档案继续保持只读，不能从 snapshot 发起生图、重生成或缓存写入。
- 保留 r13 的增量档案、派生缓存迁移、ADV 批量失败人工选择以及只读跨档案浏览边界。

## 0.8.10 r12 — CG Image Generation 适配

- 回忆相簿与 CG/ADV 事件新增显式“绘制CG / 重绘CG / 恢复抽象CG”。没有实图时继续使用原有抽象 CG；绘制成功后同位置用实图覆盖。
- 只复用 SillyTavern 已注册的官方 `imagine` 图像生成命令；不直连 Stable Diffusion / ComfyUI / NovelAI / OpenAI 等 provider，也不读取任何生图 API Key。
- 绘制前始终提示可能消耗算力/额度/付费点数；默认不会自动批量绘制。`quiet=true`，因此心跳回忆绘图不会向聊天正文额外发送图片消息；`gallery=false` 避免强制写入角色 Gallery。
- CG/ADV JSON 新增纯视觉 `imagePrompt`，只允许角色可见外貌、服装、动作、场景、构图、时间与光线；旧 r11 缓存没有 `imagePrompt` 时会从已有 `desc/cgDesc + visualSeed` 本地构造，不要求重新生成档案。
- 生图插件返回值只接受 SillyTavern 当前同源的本地图片路径；拒绝 `data:` / `blob:` / 外站 URL。缓存只保存短 URL、视觉 prompt、provider 标记与时间，不保存 base64 图片。
- 图片加载失败时自动露出下方原抽象 CG；更新档案/重新生成相簿或 CG/ADV 时，旧实图引用随派生缓存一起失效，但不会主动删除 SillyTavern 已保存的图片文件。
- CG 图片生成完成前后继续校验原 `chatId + archiveRevision`；切换聊天或销毁插件后，迟到图片不会写入别的档案。

## 0.8.10 r11 — 多来源记忆 / 摘要适配

- 档案室将“蝴蝶效应”固定放在主入口最下方；桌面端也单独占最后一行。
- 公开记忆插件兼容从单一 `getInjectedHistory()` 扩展为安全探测 `getInjectedHistory` / `getCurrentChatMemories` / `getCurrentChatMemory` / `getCurrentChatSummary` / `getCurrentSummary`。
- 新增当前窗口提示注入摘要适配：仅扫描名称明确包含 memory/summary/摘要/总结等语义、且不是世界书/角色卡/作者设定的注入项。
- 新增当前聊天 metadata 摘要适配：只读取摘要/记忆相关键，并且只递归白名单内容字段，避免把任意设置或凭据当作记忆。
- 世界书、角色卡、作者设定继续仅作为生成时的设定上下文，不自动导入为“已经发生的聊天事实”。
- 公开 API 发现继续避免执行全局 getter，并进一步避免通过访问器探测第三方 API 方法/名称。

# 0.8.10 confirm / current archive r10

- 所有会覆盖现有生成内容的“重新生成”入口增加显式确认，取消不会启动请求。
- “更新今日生活”增加覆盖确认。
- 恢复并强化“生成 / 更新当前窗口档案”：设置面板、档案室首页、当前档案页均有明确入口。
- 更新当前窗口档案前明确提示：成功更新会使旧 archiveRevision 对应的 CG / ADV / 房间 / 蝴蝶效应 / ENDING / 储物 / 私人终端派生缓存失效。
- 首次生成当前窗口档案也有非破坏性确认，避免误触触发长时间档案整理。

## 0.8.10 ending / epilogue r9
- 私人终端 Gallery 改为纯文字照片档案：删除世界书 URL 扫描、`imageUrl` 字段、外部图片预览 DOM 与点击加载逻辑；保留 imageCaption / detail 的照片描述。
- 档案室新增独立 `ENDING / 后日谈` 主入口，和 CG/ADV、房间、蝴蝶效应一样单独请求、单独缓存。
- ENDING 至少生成当前路线、恋爱、羁绊、开放 4 类路线；`available` 只代表当前档案是否具备进入条件，不代表结局已经发生。
- 当前关系摘要本身也要求真实 `relationshipSourceMemoryIds + relationshipSourceMemoryAnchor`；每条结局路线继续要求真实档案锚点作为未来推演起点。
- 恋爱证据不足时恋爱路线保持未解锁，只显示解锁提示；证据足够时才生成完整恋爱终章。所有已解锁路线都包含 3+ 段后日谈。
- 结局/后日谈永远作为未来路线推演展示，不写回聊天档案，不替 `{{user}}` 发明未来回应。
- 档案室主入口总数更新为 5；移动端继续沿用 r8 的单列紧凑布局与返回上级行为。

## 0.8.10 butterfly semantics r7
- 修正蝴蝶效应“观测点 Ω”语义：Ω 不再被当成额外平行世界，而是现世 {{char}} 看完全部平行世界后的最终观测点。
- 普通平行节点继续要求由该世界的 {{char}} 本人第一人称发言；现世反应保留在 intervention，明确区分两个说话者。
- Ω 强制 `id=OMEGA`、`monologue=""`，只保留现世最终发言与系统结论；最终发言需综合多个前置分歧，而非只回应最后一个世界。
- Ω 本地归一化不再要求 100 字平行体独白，并主动清空 Ω 的 monologue/sourceMemoryIds，防止把模拟平行体误当成现世证据。
- 渲染 Ω 时移除“PARALLEL SUBJECT / 平行体独白”区块，改为“CURRENT WORLD SUBJECT / 现世最终发言”；旧 r6 缓存也会按新语义显示。
- 仅修改蝴蝶效应 prompt、归一化、渲染和缓存键；手机档案室、头像、移动 UI、CG/ADV、房间、储物、私人终端逻辑不变。

## 0.8.10 mobile UI r6
- 手机档案室角色头像恢复为真正居中，不再因为角色卡直接使用 portal 容器而贴左。
- 手机档案室主内容入口从 2×2 大卡改为单列横向紧凑卡，减少拥挤与过宽感；生成按钮缩短。
- 手机角色档案列表使用 auto-fit 居中网格：只有一个角色时卡片居中，多角色时自动排列。
- 收紧手机档案摘要、顶部栏、间距与圆角；顶部“档案室”改为主页图标，给标题留更多空间。
- 仅修改移动端 CSS/展示 class 与资源缓存键；不改 r5 的手机打开逻辑、Prompt、生成、档案/证据校验。

## 0.8.10 mobile archive r5
- 手机云酒馆：撤销会干扰宿主手势的 touchend/pointerup/click 阻断式兜底。
- 在 touchstart/pointerdown 捕获阶段只观察、不阻断宿主事件，尽早打开档案室。
- 移动端使用原生 dialog.showModal() top layer，避免右侧设置抽屉/固定定位层遮住档案室。
- 打开失败时显示 toastr 并记录 console 错误，不再表现为“点了没反应”。

## 0.8.10

- Prompt-split r3: CG 相簿、CG/ADV 索引、房间、储物、私人终端、蝴蝶效应改为模式独立 prompt；不再给每个模式重复附带一整份公共长 prompt。
- 模式化档案载荷：CG/ADV 索引最多 48 条采样，房间/私人终端最多 24 条，蝴蝶效应主时间线锚点最多 16 条；单篇/批量 ADV 只发送对应 CG 已引用的 sourceMemories。
- 储物只发送 searchable 收纳物的轻量房间上下文和关联记忆；房间“今日生活”优先只发送房间对象已引用的记忆，避免重复整份档案。
- 批量 ADV 改用去重 `MEMORY_POOL_JSON`：事件只携带 `sourceMemoryIds`，同一档案记忆不会在多个事件里重复嵌入。
- 证据校验未放宽：模型仍只能引用实际提供且存在于当前 archiveRevision 的 sourceMemoryIds/sourceMemoryAnchor，最终仍由本地完整档案校验。
- Resource cache key changed to `0.8.10-prompt-r3` so mobile/cloud clients reload the prompt-split bundle instead of reusing r2.

- UI regression correction build: restored the complete 0.8.9.1 theater/settings/room/phone CSS as the visual baseline; only additive 0.8.10 styles remain.
- Resource cache key changed to `0.8.10-ui-r2` so browsers do not reuse the earlier broken 0.8.10 UI bundle.

- 性能：浏览相簿、房间、物品、终端、ADV 时不再因为选择状态反复压缩整份剧场缓存；缓存落盘防抖延长，关闭档案室会释放大 DOM。
- 性能：移除全屏和加载遮罩的 `backdrop-filter`，并尊重 `prefers-reduced-motion`，降低桌面和移动 WebView 的 GPU 压力。
- CG / ADV：CG 事件索引先整批生成，校验失败的条目逐条补；ADV 正文新增“一次请求生成全部”，批量失败/缺失后自动逐篇重试。
- 房间：常规空间提高到 5～8、最多 10；房间内同时保留普通可观察物与少量可翻找收纳物。
- 物品：只有盒、匣、箱、抽屉、柜、包、储物格等真实收纳物可进入翻找，且生成结果与当前房间/物件对齐。
- 私人终端：新增 phone/watch/terminal/communicator 设备形态；依据人设可表现儿童电话手表等设备，并按设备本地现实时间切换四个时段状态与未读数。
- 移动/云酒馆：用 document capture 级 pointer/click 兜底打开档案室，绕过部分移动设置面板对冒泡点击的拦截。

# Changelog

## 0.8.9.1

- Emergency startup/mobile performance hotfix.
- Removed automatic legacy theater-cache compression/migration from `CHAT_CHANGED` / `CHAT_LOADED`; ordinary SillyTavern startup and chat navigation no longer schedule `JSON.stringify -> gzip -> Base64` work.
- Legacy uncompressed generated content remains readable and is not deleted or forcibly migrated.
- Mount retry now retries only missing UI mounts; an already-mounted settings panel is no longer rebuilt every 500 ms while another mount target is unavailable.
- No archive schema bump. Existing `heartbeatMemoriesArchiveV3` archives remain compatible.

## 0.8.9

- 移除一键整套基础包生成；回忆相簿、CG/ADV 事件索引、他的房间、蝴蝶效应改为独立生成 / 重生成。
- 新增按任务 key 隔离的并行生成管理器，最多 4 项同时运行；同一入口不可重复启动，不同入口可以并行。
- 每个并行任务独立持有 AbortController 与 origin `characterKey + chatId + archiveRevision`，聊天切换不会把结果写入新窗口。
- 修复跨聊天并行完成时 deferred `sessions` 以 kind 去重导致后完成任务覆盖先完成任务的问题；现在按 mode 合并待写回 session。
- “他的物品 / 私人终端”继续只在“他的房间”内部出现；缺失时可从房间内单独生成，并可和其他入口并行。
- 档案创建/更新、记忆插件预读取继续保持档案级互斥，避免并行生成过程中 archiveRevision 被修改。
- 保留 0.8.8 的旧档案兼容、gzip 剧场缓存和长聊天进入性能优化。

## 0.8.8

- 档案 schema 与插件版本号正式解耦：继续沿用稳定 `heartbeatMemoriesArchiveV3` / schema v3，普通 0.8.x 升级不再把既有正式 v3 档案判成失效；未来若 schema 真的升级必须走显式迁移。只有用户明确“更新聊天档案”时才会生成新的 archive revision。
- 保留既有生成内容：扩展更新、初始化、聊天切换都不会删除档案或剧场缓存；手动更新聊天档案时仍会按证据 revision 主动失效旧派生内容，这是数据一致性行为，不是版本升级清档。
- 修复长聊天进入时 CPU / 风扇高转的主要存储放大器：原先完整相簿、ADV 长文、房间、物品、手机和蝴蝶效应全部作为深层对象塞进 `chat_metadata`；0.8.8 改为 gzip+Base64 压缩保存剧场缓存。普通聊天加载只解析一个压缩字符串，真正打开档案室时才解压。
- 旧版未压缩剧场缓存采用懒迁移：第一次进入旧聊天仍可完整读取，浏览器空闲时压缩并原位保存；后续进入同一聊天不再反复解析巨大的嵌套缓存。
- 解压后的运行时缓存只保留最近 3 个聊天窗口，避免长时间切换多个角色后把所有 ADV / 房间缓存常驻内存。
- 普通 `CHAT_CHANGED / CHAT_LOADED` 热路径在档案室关闭时不再维护档案 UI；400 层聊天的可用消息计数增加按 chat scope 缓存，消息变化时才失效。
- 保留 0.8.7 的跨窗口后台任务、全角色档案馆、记忆插件预读取和分源记忆配额。

## 0.8.7

- 档案室重构为“全角色 → 角色的聊天窗口档案 → 单窗口档案内容”三级结构。
- 每个聊天窗口继续保留独立 archiveName；新增轻量全局档案索引。
- 新增建档前“读取记忆插件”预读取按钮与读取统计。
- 公共记忆接口同时合并 `getInjectedHistory()` 与 `getSnapshot()`；扩大外部记忆扫描上限并分块整理。
- 最终档案上限提高到 240 条；聊天正文与当前窗口记忆插件采用分源保留配额，避免超长正文先填满上限后把外部记忆全部挤掉。
- 切换聊天窗口不再 abort 已发出的心跳回忆生成任务；结果按原 chatId 延迟安全写回。
- 合并 0.8.6.1 的聊天切换性能修复：档案一览不再自动 `metadata:true` 全量扫描。

## 0.8.6.1

- 修复 0.8.6 “档案室一览”造成的聊天切换卡顿：一览从 `/api/characters/chats` 的 `metadata:true` 改为 `simple:true`，不再为了列目录让 SillyTavern 逐行扫描当前角色的所有 JSONL 聊天。
- 同一角色切换聊天时保留一览缓存，只更新“当前窗口”标记与已访问档案的轻量摘要；不再在 `CHAT_CHANGED` / `CHAT_LOADED` 上清空缓存后重复拉全量列表。
- 将 `CHAT_CHANGED` / `CHAT_LOADED` / 消息事件触发的档案室重绘改为合并调度，避免在 SillyTavern 的 awaited chat-change 热路径里同步重建整页 UI。
- 档案室状态检查改为复用当前 archive/context，并用 `clone:false` 做缓存可用性判断，避免每次打开档案室对相簿/ADV/房间/物品/手机/蝴蝶缓存做 6 次 `structuredClone()`。
- 公开记忆插件发现增加 120 秒缓存；扫描 `globalThis` 时跳过 accessor getter，避免单纯检测接口就触发任意全局 getter。手动创建/更新档案时仍会强制刷新一次 provider 发现。
- 保留“一聊天窗口一档案”、聊天切换 allowlist、跨窗口异步丢弃、手动档案更新边界和 0.8.6 全部功能。

## 0.8.6

- 档案室主入口收敛为“回忆相簿 → CG/ADV → 他的房间 → 蝴蝶效应”；“他的物品 / 他的手机”改为“他的房间”内部深层玩法。
- 房间新增 PRIVATE ACCESS，可从当前私人空间继续翻找任意时代/形态的储物容器，或查看现代手机/非现代私人通讯终端；均可返回房间。
- 新增“档案室一览”：通过 SillyTavern 同源 `/api/characters/chats` 列出当前角色各聊天窗口的独立档案状态、名称、记忆数与更新时间；结果缓存并限制为服务端返回的聊天 ID。
- 当前窗口记忆桥接增加通用公开接口适配，参考已有项目的公开接口思路检测 `getInjectedHistory()` / 可选 `getSnapshot()`；仅在手动建档/更新时调用，并在异步前后校验 chatId，明确跨窗口返回会被拒绝。
- 蝴蝶效应恢复原始五区终端规格：锁定主时间线 + 8 个以上世界书/人设外延分歧 + TRUE ENDING；上方常驻分歧树，下方观测屏，1 秒信号干扰后切换；现世介入与底部冷酷系统评价分区呈现。
- 蝴蝶外延节点明确属于模拟平行世界，不再错误要求每个节点伪造真实记忆引用；只有主时间线必须用 `sourceMemoryIds + sourceMemoryAnchor` 锚定当前世界。每个平行体独白至少 100 汉字。
- 保留全窗口档案覆盖、后台减卡、240 条档案上限与共同回忆 6～8 段等 0.8.5 改进。
- 许可证继续使用 Source Available / Not Open Source《心跳回忆有限个人使用许可证 Version 1.1》。

## 0.8.5

- 长聊天档案整理改为全窗口覆盖优先：提高扫描/档案上限，超限时从整个窗口均匀采样而不是只保留近期。
- 档案扫描分批让出 UI 主线程，并减少固定分块的重复 token 化，缓解后台建档时整个 SillyTavern 卡顿。
- 回忆相簿“共同回忆”从 3 句浅评论提高到 6～8 段角色回想。
- 增加“他的物品 / 他的手机”结构化深层内容与证据校验；0.8.6 起这两项只从“他的房间”进入，不再作为独立档案室入口。
- 许可证升级为 Source Available / Not Open Source《心跳回忆有限个人使用许可证 Version 1.1》。

## 0.8.4

- 新增当前聊天窗口外部记忆桥接：仅在用户手动创建/更新档案时同步。
- 支持读取当前聊天的 SillyTavern `1_memory` 总结。
- 增加 EverMind 当前会话适配：只使用当前 chat metadata 的 `group_id`，不读取角色级 `char_group_id`。
- 外部记忆候选新增 provider record ID + `sourceExternalAnchor` 逐字证据校验，并限制为最多 64 条 / 约 30k 字符。
- 档案保存外部记忆来源计数与 fingerprint；外部记忆变化只有在用户再次手动更新档案时才进入新 archive revision。
- 档案室新增“当前窗口记忆插件档案补充”开关与上次同步来源提示。
- 新增 `LICENSE`：Tokimemo Proprietary Test License v1.0。本项目明确为专有测试软件，不采用开源许可证。

## 0.8.3

- 设置页进一步收敛为纯 API 面板：移除档案摘要、创建/更新按钮和四个玩法按钮，只保留连接/模型/Token/温度/每日生活请求控制。
- 新增独立“打开档案室”入口；扩展菜单也直接显示“心跳回忆 · 档案室”。
- 档案室改成头像式内容入口，只有已经缓存的项目可以点击查看；顺序固定为“回忆相簿 → CG/ADV → 他的房间 → 蝴蝶效应”。
- 未生成头像不再自动触发 API；新增唯一的“生成整套档案室内容”按钮，一次请求生成基础包并默认转入后台。
- 后台生成不再用全屏 loading 锁住档案室，也不再禁止浏览已有缓存；完成后仅刷新档案室状态，若用户正在查看已有内容不会强制把页面踢回首页。
- 设置页后台状态刷新降为轻量按钮文案更新，减少后台任务期间无意义 DOM 重绘。
- 受控上下文新增当前 `{{user}}` 的 Persona description，并把它传入世界书 dry-run 的 `personaDescription`，补齐 User 人设与相关世界书命中。
- 保留 0.8.1/0.8.2 的跨聊天写入保护、输入预算、记忆证据校验、Secret ID 边界与单请求基础包结构。

## 0.8.2

- 重做扩展设置页视觉，改为与心跳回忆剧场一致的蓝粉/奶白卡片语言；强制覆盖 SillyTavern `.menu_button` 的窄宽/书写方向，修复按钮文字被压成竖排的问题。
- 专用 Connection Manager Profile 与“模型选择”正式拆开：Profile 负责 API/URL/Secret，心跳回忆可以另外选择模型，不会修改主聊天模型。
- 新增“刷新模型”：通过 SillyTavern 自己的同源 `/api/backends/chat-completions/status` 读取模型列表，浏览器只提交 Connection Profile 中的 Secret ID 引用，不读取 API Key 明文。
- 首次进入任意基础入口时，改为一次模型请求生成完整基础包：蝴蝶效应 + 回忆相簿 + 他的房间；CG/ADV 事件索引直接由同一批已解锁相簿 CG 本地派生，因此四个入口共享同一套记忆事实与视觉事件。
- 长篇 ADV 正文仍在用户实际点开某事件时按需生成并缓存；“今日生活时间线”仍按日期独立生成，避免把每天变化的数据冻结进长期基础包。
- 生成界面新增“返回功能页 · 后台继续 / 关闭 · 后台继续”。离开弹层后请求继续，结果完成后写入当前聊天的安全缓存并以 toast 通知，不再强迫用户盯着 loading 页面等待。
- 档案整理、单项补生成、长 ADV、房间今日生活都补齐后台完成路径；后台期间设置页和功能页会显示/保持任务状态并阻止重复启动第二个生成任务。
- 保留 0.8.1 的跨聊天写入保护、宏隔离、记忆证据校验、输入预算与房间失败熔断。

## 0.8.1

- 修复“今日生活”缺失 `isPlaceholderText` 导致的运行时错误。
- 修复每日生活失败后每 30 秒无限静默重试；失败当天写入 fallback 并停止自动重试，保留手动刷新。
- session/cache 新增 `chatId` 绑定，所有生成回写校验 chatId + archiveRevision；跨聊天迟到结果直接丢弃。
- 聊天切换与扩展销毁时 abort 在途生成；档案更新中切聊天不再静默丢失后仍提示成功。
- 移除对整段生成 Prompt 的 `substituteParams`，仅安全展开 `{{char}}` / `{{user}}`，其余 ST 宏中和。
- `sourceMemoryIds` 增加 `sourceMemoryAnchor` 语义证据校验。
- 普通生成档案输入最多均匀抽样 48 条并压缩字段；最终输入增加约 32k token / 96k 字符硬预算。
- 档案分块整理复用同一受控角色卡/世界书 envelope，避免每个 chunk 重跑 dry-run。

## 0.8.0

- 移除“跟随酒馆当前 API”生成路径；心跳回忆固定使用一个 Connection Manager 专用连接。
- 新增“从酒馆当前连接一键导入”，仅引用 Secret ID，不读取 API Key 明文。

### 0.8.10 mobile/avatar r4
- Mobile/cloud archive opener now handles touchend, pointerup, and click through one guarded capture path.
- Archive index updates no longer erase a previously valid character avatar when a transient context exposes an empty avatar.
- Archive cards recover missing avatar metadata from characterKey/current SillyTavern character data and merge canonical character groups.


### 0.8.10 UX / phone r8
- ADV 正文阅读时，顶栏“返回”会先回到当前事件 CG，再返回当前档案。
- 手机顶栏将返回/主页/重新生成/关闭压成图标，标题使用省略显示，减少窄屏文字互相挤压。
- 房间页按“地点 → SPACE NOTE → 大图 → PRIVATE LIFE → PRIVATE ACCESS”重排；大图内物件改成编号点，文字移到图下，避免手机互相遮挡。
- ADV 手机端新增原生事件选择器与上/下一事件按钮，桌面保留事件索引。
- 顶栏新增返回上级：档案层级、四个主入口、相簿共同回忆、房间深层内容均可逐级返回。
- 私人终端恢复丰富 App 规格：社交、深度聊天、相册、备忘、日历、购物、浏览、联系人、定位与人设专属功能；列表→详情双层导航。
- 现代手机对核心 App 数量做本地硬校验（动态5/聊天5/相册8/备忘15/日历8/购物8/浏览5/联系人5/定位3/人设专属3），并要求至少 1 个联系人详情含 3 项字段；3 个聊天必须至少 12 轮。首轮缩水会自动完整重做一次；手表/通讯器仍要求至少 8 个入口与 48 个可读条目。
- 相册外部图床只在用户点击后加载；URL 必须逐字命中本轮已激活世界书中预先抽取的 http/https allowlist，并使用 no-referrer，模型编造的 URL 会被本地丢弃。

## 0.8.10 state-r13

- Fixed derived theater content appearing ungenerated after extension reload/login: the current runtime cache is preserved before destroy, compressed-cache read errors are surfaced instead of silently becoming an empty cache, and save compression debounce is shortened.
- Changed current-window archive update to append-only incremental update. Existing Mxxx IDs and previously generated Album/CG/ADV/Room/Ending/Items/Phone content are retained when the archived chat prefix is unchanged.
- Added explicit “完全重建档案” for the destructive full rescan/renumber path. Edited/deleted/reordered old chat messages cause incremental update to stop instead of silently rebuilding.
- Changed ADV bulk recovery: one bulk request runs first. Partial/failed results stop and present two explicit choices: retry failed items in one batch (1 request) or repair failed items individually (up to N requests). No automatic N-request fallback.
- Changed archive-library browsing to read-only metadata snapshots. Opening A/B archives no longer calls SillyTavern character/chat switching APIs, so browsing archives cannot trigger the host “chat is being saved” switch guard.
- Added read-only viewing of already saved derived sessions from indexed archives; generation/mutation actions are blocked in snapshot mode.
