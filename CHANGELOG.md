# 0.8.41 / r45.0 — 独立 API 双配置与稳定性修复

- 设置页新增同级醒目的“1.1.18 一键配置”和“手动配置”入口，沿用心跳回忆粉蓝纸张风格，仅保留短状态与必要字段。
- 一键 Profile 在导入、模型刷新和生成前校验 Secret 转发与请求级模型覆盖能力；重复选择同一 Profile 保留模型覆盖，换 Profile 才清理旧覆盖，异步迟到结果不能反写。
- 新增手动 OpenAI 兼容 Base URL / API Key / model 配置；模型列表和生成均只经 SillyTavern 固定同源 custom backend，浏览器不直连第三方地址。
- 修复 Profile B 模型刷新误借主聊天 Profile A custom headers 的跨连接问题；模型缓存加入 transport fingerprint 与 lifecycle/configuration epoch。
- Profile 生成改为结构化 messages 并关闭 preset/instruct 注入；manual 响应增加常见正文提取、4 MB 字节上限与不回显 provider body / API Key 的错误边界。
- 手动地址支持省略协议、端口和已粘贴的常见生成端点；带 Key 的远端明文 HTTP 在保存和发送前都会拒绝，本机 loopback HTTP 仍可用于开发。
- API 配置变更会取消当前请求并丢弃旧连接迟到结果；默认生成超时扩展为 10 分钟、绝对上限 20 分钟。
- SillyTavern 以 HTTP 200 返回的 Profile 错误包络不再伪装成模型列表成功；只有可确认的限流、超时或服务端故障才自动重试一次，无法判断原因的泛化失败不会重复发起付费请求。
- 发布身份更新为 `0.8.41`，runtime build token 更新为 `0.8.41-independent-api-dual-stable-r45.0`。

# 0.8.40 / r44.0 — 感情扫描共同回忆 / 独立出行地图 / 背影房间与告白彩蛋

- **共同回忆关系前置扫描**：完整生成和单张重新生成都严格执行当前双方感情扫描，再生成 6～8 段一起看旧 CG 的对白；分别校验 `charState / userState / relationshipState` 和真实档案锚点，并把快照保存到新条目。
- **角色只读日历**：移除访客草稿、手动待办输入框、添加和勾选交互，只展示 {{char}} 的备忘、待办、特别备注和页角随笔；旧人工数据保留但不暴露。
- **背影房间与宠物**：删除正脸、眼睛和嘴部几何，人物固定背向或侧后；按房间功能和人物兴趣生成代码内置视觉母题。明确存在宠物时生成有证据、可转义的宠物节点与说明，没有依据时保持空数组。
- **NPC 视角与成就条件**：人际庭园非用户节点新增 NPC 对 {{char}} 的视角，动态层优先；已解锁成就显示具体解锁条件和时间，旧缓存有安全回退。
- **独立出行路线**：新增档案室地图入口，附近地点逐句播放角色对白，远方地点显示 CSS+文字明信片；坐标、连线和样式均由本地代码决定。私人终端过滤地图、导航、路线、出行和交通 App。
- **Ending 本地心跳彩蛋**：已发生告白回看可打开动态弹窗，包含心跳、悬停、逐句揭示、日志暂停/恢复、信号稳定等至少四类实时交互；模型只能返回结构化文字，JavaScript、HTML、CSS、URL 和事件处理器均禁止进入执行路径。
- **旧房间显式补全与校验**：旧 schema 允许一次无新记忆的宠物扫描，保留已有房间和深层内容；普通增量只合并本轮新锚点能证明的生活痕迹。新生成拒绝重复空间和过度相似的可见结构，NPC 新生成强制具备视角文本。
- **回归收口**：快照身份不串当前聊天、重分类同步失效旧缓存、地图坐标去重、相簿延迟翻页与 chooser 刷新不覆盖新视图、切聊天清理彩蛋定时器、删空 Ending 路线后正确显示空状态。单项重生成证据集必须完全一致。
- 发布身份更新为 `0.8.40`，runtime build token 更新为 `0.8.40-emotion-travel-easter-r44.0`。

# 0.8.39 / r43.0 — 人设化空间与终端 / Calendar v5 逐日页 / 蝴蝶内容强化

- **Calendar v5 逐日隔离**：具体日期、无年份纪念日、待定约定和旧版未归档内容使用互不碰撞的页面键；草稿、便签、特别备注、页角随笔和手动 To-Do 只读写当前页，空白日期也可进入独立页面。跨日同文、重复 ID、超过 480 个长期页面和刷新合并都不再静默丢内容。
- **无 fanout 迁移**：v4 根级便签/随笔只在日期、日历项或可信档案证据足以确定时归入对应页面；无法确定的内容保留在单一“旧版未归档”页，不猜日期、不复制到全部日期，也不修改正式 Mxxx 档案。
- **房间与人物共同人设化**：世界书/角色设定明确描述优先，否则根据时代、身份、职业、生活方式与气质选择代码内置的安全房型、配色、陈设、服装、发型和体态枚举，脸型比例由角色身份种子在本地有界生成。模型照抄合法示例时也会触发人设补全；房中 CSS 人物不粘贴档案头像。
- **私人终端完整设备导航**：以设备主页为入口，App 图标进入独立列表，条目再进入详情；设备外壳、壁纸、主题、图标风格和 App 组合随人物与设备类型变化，合法示例配色不再成为全角色默认。旧终端移除退役日历 App 后仍可反复保存与读取。
- **蝴蝶 UI 冻结、内容强化**：保留 r42.7 的分歧树、配色、SIGNAL 动画和 Ω 页面，只加强角色卡 / Persona / 世界书驱动的平行人生差异及本地校验；普通分歧至少 8 条，初始、增量和单节点重生成都验证第一人称独白、现世回应、SYSTEM NOTE、Ω 终局和第三方恋爱/成家禁令。
- 发布身份更新为 `0.8.39`，runtime build token 更新为 `0.8.39-persona-surfaces-dated-calendar-r43.0`。

# 0.8.38 / r42.7 — ADV 第一人称硬校验与静态注释移除

- 移除萤火虫栖息地标题下及旧光点内的静态玩法说明，保留光点、分页、图例与实际会话 / 旧心声。
- 移除 Character Profile 未生成卡和已生成卡里的静态说明，保留真实生成简介、固定资料格与生成 / 重读操作。
- 单篇和批量 ADV 的输出契约改为 `narrator: char_first_person` 与带 `past / daily / during / after` 类型的 `sections`；每篇至少实质覆盖两类。
- 本地新增保存前质量栅栏：类别不足、类别只有空标签、第一人称密度不足、段数或总字数不足的结果均不落盘；批量请求只保留通过校验的篇目，失败项继续走现有补全流程。
- 已有 ADV 仍保留原 `paragraphs` 阅读兼容；未修改正式 Mxxx、派生缓存键、独立备份、索引恢复、lazy bootstrap 或安全边界。
- 新增 ADV 视角 / 四类覆盖 / 批量局部失败与两处注释移除回归测试。

# 0.8.37 / r42.6 — 明确重新建档后恢复档案室索引

- 修复角色级删除墓碑与“明确重新建档”的语义冲突：新档案和独立备份成功提交后，会撤销当前角色的旧墓碑并立即加入档案室索引。
- 增加 r42.5 状态修复：若当前正式档案的 `createdAt` 明确晚于匹配墓碑的 `deletedAt`，首次打开档案室时自动恢复可见性，不需要重新付费生成。
- 删除前的旧聊天 metadata 仍然不会自动复活；仅匹配当前角色且时间证据成立的新档案可触发迁移。
- 增加“墓碑后显式新建立即入库”与“r42.5 新档案修复 / 旧 metadata 继续拦截”回归测试。

# 0.8.36 / r42.5 — 独立档案备份与数据安全修复

- 新增仅由完整 runtime 使用的浏览器本机 IndexedDB 档案备份。正式 Mxxx 档案与有界派生缓存不再只存在于源聊天 metadata；源聊天丢失时可从备份永久只读恢复。
- 正式档案唯一提交边界增加显式 `{present, revision}` compare-and-set；前台完成、后台 deferred commit、首次创建、增量更新和完全重建统一拒绝旧版本覆盖。
- 原始缓存的 12 MB 上限改为全写入路径共同执行，并在 runtime 缓存与 legacy raw metadata 之间使用 copy-on-write。销毁阶段发现超大缓存时不再写回 raw，而是保留最后一份有效缓存。
- 明确删除当前档案或整个角色档案时同步删除独立备份内容，并保留无内容删除栅栏阻止在飞行的 seed/cache 写入复活备份；仅移除轻量索引不删除源档案或备份。
- 新增源聊天删除恢复、超大 raw cache、copy-on-write 与并发旧结果覆盖回归测试；轻量启动和零解压诊断边界保持不变。

# 0.8.35 / r42.4 — 性能诊断关闭交互修复

- 轻量 bootstrap 诊断结果增加明确的“关闭诊断”按钮；再次点击原诊断按钮也会收起，并同步恢复按钮标签与 `aria-expanded=false`。
- 完整 runtime 设置面板采用相同的可逆交互，修复诊断结果打开后只能随设置抽屉一起关闭的问题。
- 关闭与再次打开只切换现有 DOM 状态；诊断仍不执行 Base64 解码、gzip 解压、正文遍历或网络请求，bootstrap 分支仍不导入 runtime。
- 新增真实状态切换与两套关闭入口的回归测试。

# 0.8.34 / r42.3 — 安全边界与长期状态收口

- EverMind 远程读取强制 HTTPS；HTTP 只允许 URL 解析后的严格 loopback。远程明文地址会在创建 Authorization header 和发起 fetch 前被拒绝。
- 修复缓存写入 12M 字符、读取 12M UTF-8 字节的单位不一致：写入前按 Blob UTF-8 byte size 检查，新 manifest 增加 `sourceBytes`，同时保留旧 `sourceChars` 兼容字段。
- 零解压性能诊断优先读取 `sourceBytes`；旧 manifest 用 `sourceChars × 3` 做保守上界估算，不执行 TextEncoder、Base64 解码、gzip 解压或大对象序列化。
- `destroyMemoryTheater()` 完整清理 preflight、deferred commit、snapshot、model、overview 与邻近 UI/task 状态；runtime lifecycle epoch 阻止旧网络 Promise、in-flight gzip 落盘和 gunzip hydrate 在 disable / clean 后回填。旧 hydration 的 `finally` 只按 Promise 身份删除，不能误删新生命周期任务。
- 单篇历史档案从“同角色全部聊天 `metadata:true`”改为 `/api/chats/get` 定点读取目标聊天；手动旧档案扫描仍保留原有全角色 discovery 语义。
- README 当前版本已同步；发布 ZIP 不再包含空 `artifacts/` 目录。GitHub `main` 继续只读，不在本地候选包修复中改写。

# 0.8.33 / r42.2 — 移动端轻量 bootstrap 排版修复

- 修复 iPhone / SillyTavern 扩展设置页中 bootstrap 操作按钮继承宿主 `min-content` / `fit-content` 宽度后被压成中文逐字纵排的问题。
- bootstrap 操作区改为 mobile-first：小于 768px 上下排列并占满容器，桌面端双列；按钮固定为水平书写、不拆分中文，触摸高度至少 46px。
- 卡片、操作区、按钮、说明与诊断输出增加有界宽度和 `min-width: 0`，防止横向溢出；卡片高度继续只由真实内容决定。
- 保持 r42.0 的轻量启动边界：DOM ready 不加载 runtime；性能诊断不解压缓存且不触发 bundle；完整 CSS 仍不在 bootstrap 阶段注入。
- 新增 bootstrap 布局与懒加载契约测试、零依赖五视口几何基准，以及可在装有 Chromium 的环境执行的真实浏览器验证工具。

# 0.8.32 / r42.1 — GS4 式萤火虫追加约会会话修正

- 重新按 GS4「ホタルの住処」实际表现修正：萤火虫不再是“{{char}} 连续内心独白卡”，而是点亮一个颜色话题后展开一段当场追加约会会话，角色本音会在对话中不小心泄露，用户仅有非正史的中性即时回应，结尾可出现一条“刚才是不是心声”的即时想法。
- 恢复 GS4 原四色实际分类：💗 pink=恋爱、💙 blue=恋爱的烦恼、💛 yellow=朋友、🤍 white=お楽しみ/角色个性话题。♥️ desire 明确标记为本插件扩展，不再混同原作四色。
- 新萤火虫仍保持首次/增量每批 5～6 颗、单页最多 6 颗、旧光永久保留；每颗会话要求 5～10 个 script 节点、至少 3 条 char 与 1 条中性 user 即时回应。
- r41.7～r42.0 期间生成的旧 `line/thoughts` 独白光点不会丢失；会被识别为 legacy，可分批原地升级为 GS4 式会话，同时保留原 id、颜色、来源 Mxxx、批次与生成时间。
- 明确禁止萤火虫内容退化为连续“她怎么怎样”的第三人称总结；yellow/white 必须承担朋友与角色自身个性话题，避免所有内容都围绕 user 恋爱化。
- 完整继承 r42.0 轻量 bootstrap / 零解压性能诊断，以及 r41.5～r41.9 的普通聊天性能、Profile、人际庭园、安全删除、Drama 翻页等修复。

# 0.8.31 / r42.0 — 轻量 bootstrap / 零解压性能诊断

- 酒馆启动不再立即 import/解析完整 `dist/heartbeatMemories.bundle.js`。`index.js` 只挂载轻量“档案室”菜单、轻量设置入口与性能诊断；第一次显式打开档案室或加载完整设置时才动态加载 runtime。
- 完整 runtime 一旦加载，继续使用原来的单 bundle 模式，并接管设置、菜单、聊天事件与档案 UI；不恢复 43 个源码模块的网络瀑布。
- 新增“性能诊断（不解压缓存）”：只读取当前 `chatMetadata` 中 Heartbeat MEMORY/CACHE manifest 的计数和字符串长度，显示 Mxxx 数量、派生模式、`sourceChars`、压缩 Base64 字符数与估算 gzip 大小。
- 诊断不会执行 Base64 解码、gzip 解压、缓存 JSON 序列化，也不会遍历聊天正文；在 runtime 尚未加载时也能使用，并且不会因为点击诊断而加载 bundle。
- 保留 r41.5～r41.9 的墓碑 Set、普通聊天 O(1) 状态、延迟完整 CSS、设置连接懒填充、HEART/Drama/萤火虫/Profile/单一人际庭园修复。

# 0.8.30 / r41.9 — 角色档案漏读修复 / 折叠 Profile / 单一人际庭园

- 修复 Character Profile “简介已经读到年龄/职业，但固定资料格仍显示？？？”：对角色卡结构化字段与 description/creator notes/scenario/depth prompt 中的明确生日、年龄、身高、血型、职业等增加本地保守抽取兜底；AI facts 同时兼容“年龄/职业/学校”等常见 label 别名。
- Profile 的客观 fact 不再接受 User Persona 作为人物事实来源，避免把 {{user}} 的年龄/职业误写到 {{char}}；Persona 仍可作为故事开始前明确特殊关系的证据。
- 已存在的旧 Character Profile 在打开角色页时会对安全匹配到的角色卡做一次 O(角色卡长度) 的本地补读；例如人设明确写“30岁、网文作家/编剧/讲师”，升级后无需重新调用 API 即可补进固定格。
- Character Profile 改为原生 `<details>` 可折叠卡片，默认收起；摘要只显示头像、姓名与“已读取 N/9 项”，展开后才显示大图、简介和全部资料格。
- 删除角色总页重复的“人际庭园 · 固有设定”。固定关系仍保存在角色主档案中，但只在进入具体聊天后的唯一一张「人际庭园」里与本世界线变化合并显示。
- 完整继承 r41.5 性能收口、r41.6 启动减负/HEART 修复、r41.7 Drama/完整心声与 r41.8 萤火虫 5～6 颗小批次。

# 0.8.29 / r41.8 — 萤火虫小批次点亮

- 完整继承 r41.5 性能收口、r41.6 真机故障修复/启动减负与 r41.7 Drama 翻页 + 2～4 段完整心声结构。
- 萤火虫首次点亮由 18～22 颗改为 **5～6 颗**；后续有新增 Mxxx 时每批也只生成 **5～6 颗**。
- 单页发光节点由 18 颗进一步降为 **6 颗**；永久库上限不变，旧光继续永久保留并分页回看。
- 首次颜色校验从“五色各至少 3 条”改为“5～6 颗中至少覆盖 3 种颜色”，避免小批次为了凑色强行生成不合人设的 ♥️。
- 旧版短句萤火虫升级批次由最多 12 颗降为最多 **6 颗**；对应生成 token 上限同步收敛。

# 0.8.28 / r41.7 — 萤火虫完整心声 + 四季 Drama 翻页修复

- 修复春 / 夏 / 秋 / 冬与后日谈左右箭头：旧实现同时保存 `selectedVoiceId` 与 `selectedScenarioId`，读取时总是先命中 Voice，导致从 Voice 翻到 Scenario 后又被旧 Voice 状态拉回。新增 `selectedDramaKey=voice:ID|scenario:ID` 作为当前篇唯一选择，旧缓存继续兼容。
- 萤火虫从“一颗光 = 一句短心声”升级为“一颗光 = 一个心声主题 + 2～4 段内心展开”；旧版 `line` 缓存会自动作为单段旧光继续显示，不丢历史内容。
- 首次点亮改为 18～22 个完整主题；后续有新增 Mxxx 时每批生成 8～12 个，不再以最低 5 个通过校验。
- 单颗萤火虫重新生成同步升级为 2～4 段主题；去重键覆盖 title + 全部 thoughts，降低不同光点只换措辞的重复。
- 单页发光节点仍保持 18 颗，永久库上限与 r41.6 启动减负不变。

# 0.8.27 / r41.6 — 首次 HEART 修复 + 酒馆启动再减负

- 修复首次生成“角色互动与 Voice Drama”时 `makeHeartSession()` 访问不存在的 `data` 变量，导致 Safari 报 `Can't find variable: data` 的确定性错误。
- 补首次 HEART session 组装回归测试，防止同类局部变量残留再次进入发布包。
- 心跳回忆设置面板启动时只挂轻量 DOM 与档案存在状态；Connection Manager 配置、模型列表等只在用户真正打开/聚焦插件设置时填充。
- `CHAT_CHANGED / CHAT_LOADED` 的设置状态刷新改为轻量路径，不再为了按钮状态遍历整段聊天。
- 延续 r41.5：墓碑 Set 索引、萤火虫单页 18 颗、完整 UI CSS 首次打开档案室才注入。

# 0.8.26 / r41.5 — 性能收口：普通聊天近零额外成本

- **角色删除墓碑索引化**：档案室首页与“扫描旧版本已有档案”现在每次操作只解析一次删除墓碑，并建立 `Set` 索引；不再对每个聊天档案重复 normalize 全部墓碑，避免“档案数 × 已删除角色数”的长期放大。
- **萤火虫单页 18 颗**：永久解锁库上限保持不变，只把同时渲染/发光的节点从 30 降到 18；旧光点仍可分页回看。
- **普通消息热路径轻量化**：`MESSAGE_SENT / RECEIVED / EDITED / DELETED / UPDATED` 刷新设置按钮时只判断当前聊天是否已有 Heartbeat 档案，不再调用 `getMemoryState()` 遍历整段 `context.chat`。
- **完整 UI CSS 延迟注入**：启动只注入设置面板所需的小型 CSS；相簿、ADV、Room、Phone、HEART、萤火虫、Profile、人际庭园等完整样式仅在第一次真正打开 Heartbeat overlay 时进入 CSSOM。仍保持单 bundle 启动。
- 未改变 Character Profile / 人际庭园 / 档案 / 主 API 的数据与安全边界。

# 0.8.25 / r41.4 — 统一角色主档案 + Character Profile + 双层人际庭园

- 角色档案页升级为 GS 风格 Character Profile：同一 char 的不同聊天窗口共用头像、人物简介与有明确设定证据的生日 / 身高 / 血型 / 学校职业 / 兴趣喜好等基础资料。
- 标准资料栏固定展示生日 / 年龄年级 / 身高 / 血型 / 职业学校 / 社团工作 / 兴趣喜好；没有明确证据的字段显示“？？？”，不因缺值隐藏，也不让模型补猜。
- 新增第一层“固有人际庭园”：只读取角色卡、User Persona、受控世界书；若 {{user}} 在故事开始前已有明确特殊身份/关系，则作为全窗口共用关系。缺失事实不得猜测，sourceEvidence 与 fact value 会再次本地核对。
- 新增每聊天窗口独立的 `MODE.RELATIONS`：当前世界线的人际变化必须引用真实 Mxxx + anchor；第三方人物名还必须实际出现在所引用记忆的标题/摘要/anchors/participants 中。
- UI 将固有关系与当前世界线关系叠加到同一个节点；不使用伪精确好感数值，人物位置由本地静态布局计算，不接受模型 CSS / URL / 坐标。
- 普通角色卡正文编辑导致 fingerprint 改变时，只要姓名与 avatar 能唯一确认是同一 char，继续复用原角色组，避免共用 Profile 被拆成多个角色档案。
- 删除角色档案时同步移除该角色的共享 Character Profile；SillyTavern 正文聊天与其 metadata 删除边界保持不变。
- 新增“这个世界线了解到的他”：生日 / 身高 / 血型 / 兴趣 / 喜好 / 习惯等后来得知的人物资料只保存在当前聊天的 `MODE.RELATIONS` session，并要求真实 Mxxx + anchor 与 literal value 双重核验；不会自动写回全窗口共享 Profile。

# 0.8.23 / r41.2 — 角色档案安全删除

- 档案室最外层角色卡新增“删除角色档案”，使用双重确认。
- 删除后移除该角色头像、角色组和全部聊天档案索引，但绝不删除、清空、重命名或改写 SillyTavern 正文聊天窗口。
- 新增删除墓碑记录；旧档案扫描和当前窗口自动 upsert 都会尊重删除状态，避免角色档案被自动复活。
- 当前正在查看被删除角色时，档案室不再显示该角色的当前窗口快捷档案或日历入口。
- 清理角色级头像访问记录和只读快照缓存，避免删除后残留 UI 状态。

# 0.8.22 / r41.1 — 萤火虫永久解锁库

- 萤火虫由整片替换改为追加式解锁：旧光点永久保留，新档案关系进展只增加新的心声。
- 首次生成 24～30 颗；后续每批 6～10 颗，并接入 `generationMeta.parts.fireflies` 增量游标。没有新的档案 Mxxx 时不发起模型请求。
- 本地按心声文本做去重，并使用唯一 ID 追加；每个新光点记录 `sourceArchiveMemoryIds`、`incrementBatchId` 与 `generatedAt`。旧 r41 萤火虫首次进入增量时会保存一次保守基线，避免无游标缓存反复把整份档案当成新增。
- 存储上限 240 颗且不做自动淘汰；达到上限后停止追加。UI 每页最多渲染 30 颗发光 DOM，可翻页回看旧光点，避免长期开启后移动端 GPU 压力随累计数量线性增长。
- 发布身份更新为 0.8.22 / r41.1，并修正 release identity 测试的旧版本硬编码。

# 0.8.21 / r41 — 萤火虫栖息地 + 四季 Drama 单篇翻阅

- HEART 新增「萤火虫栖息地」：一次生成 24～30 个可点击心声光点，💗/💙/💛/🤍 + ♥️ 五类。
- ♥️ 表示对 {{user}} 的直白渴望，允许拥抱/亲吻/靠近/占有欲等非露骨表达，禁止露骨色情过程。
- 四季 / 后日谈 Drama 不再把 Voice 与 Scenario 从上到下同时展开，改为单篇翻阅 + 前后切换。
- Drama 新增受限 visualTone（soft/clear/muted/deep），与季节共同决定背景；不接受模型 CSS。
- 萤火虫单个光点接入统一内容管理，删除 / 重新生成继续要求二次确认。

# 0.8.20 / r40.3

- 私人终端移除 schedule/calendar（日历）App，避免与独立“两个人的日历”重复。
- Phone 新生成目录改为 9 类 App；terminal/watch/communicator 同步取消日历硬性要求。
- 旧 Phone 缓存中的 schedule/calendar 在加载时自动迁出，其余 App 与条目保留。
- Phone 增量不会再向旧日历 App 追加内容；双方日期/约定/纪念日统一由关系日历承担。

## 0.8.19 / r40.2 — Calendar Notebook

- “两个人的日历”改成完整私人手账页：月历下方直接显示便签夹、全局 To-Do List、特别备注与少量页角随笔，不再把这些内容塞进单日详情。
- To-Do 仍由 evidence-gated `promised` 自动形成；已发生事项只在月历圈记与“最近划掉的”中出现，世界设定日期继续只作提醒。
- 新增 `stickyNotes`：档案来源便签必须通过 memory ID + anchor 校验；设定来源便签明确标记为非共同历史事实。
- 新增 `moodNotes`：最多 3 条、必须引用真实档案锚点，只作为角色第一人称的短手账随笔，不写回正式 Mxxx。
- 便签与页角随笔接入统一内容管理，支持单项删除 / 重新生成并继续执行连续二次确认。
- Calendar 派生 session 升至 v4，旧日历缓存只会失效重生；正式档案、Phone、HEART 与其他 mode 不迁移。

## 0.8.18 / r40.1 — Calendar To-Do

- “两个人的日历”详情改为标签 + To-Do List：已发生自动勾选、已约定保持待办、世界设定只作提醒。
- 移除默认事后感想/心情/期待长文本，降低剧情摘要感和生成冗余。
- 日历缓存 schema 升至 v3，旧 r40 日历派生缓存会自动失效；正式 Mxxx 档案不受影响。

## 0.8.17 personal-calendar-r40

- **日历语义重做**：不再把所有带日期的剧情档案自动映射为日历项；模型只提名真正适合“圈在私人日历上”的共同事项，插件再用真实 memory ID + anchor 校验。
- **past 日期由本地证据决定**：模型不能输出/修改已发生事项日期；必须引用当天有明确日期的档案锚点，插件从该记忆本地取日期。
- **短角色回望**：已发生事项保存 `decisionFeeling + afterthought`；未发生约定保存 `decisionFeeling + anticipation`，只做短心情，不扩写剧情。
- **未来约定日期二次核验**：模型输出具体日期时，该日期必须真实出现在引用档案中，否则条目被丢弃；证据没有具体日期只能写“待定”。
- **月历式 UI**：改为 7 列月历、圈日期、月份跳转、点击日期查看详情；待定约定单独列在月历下方。
- **旧 Calendar 派生缓存失效**：新增 `CALENDAR_SESSION_VERSION=2`，只淘汰旧日历派生缓存，不改正式档案 schema。

## 0.8.16 calendar-home-r39.1

- “两个人的日历”从具体档案二级页面提升到“心跳回忆 · 档案室”首页，打开插件即可看见。
- 未建档时日历入口仍显示但禁用生成，并提示先建立当前窗口档案；已有档案时直接提供生成 / 查看 / 刷新。
- 不改变日历数据、证据校验、正式档案、Phone 增量或单文件 bundle 运行方式。

## 0.8.15 single-runtime-r39

- 云酒馆启动：模块化源码保留，但实际运行改为单文件 bundle，启动网络请求从整套 42 模块依赖图降为 1 个版本化 runtime 文件。
- 移除 r38 的版本首次强制 reload，避免更新后额外整页重载。
- 日历：继续固定在档案第一屏；由于运行时不再混用旧子模块，Calendar 入口不会因子模块缓存滞后而消失。
- 私人终端：新增可见的“增量追加终端”按钮；旧顶栏增量能力继续保留。
- 数据/证据/正式 MEMORY_KEY schema 不变。

## 0.8.14 calendar-visible-r38.1

- **日历入口提升到档案首屏**：不再埋在第 5 张普通分类卡；当前档案与历史档案进入后都在摘要附近直接看到“两个人的日历”。
- **日历不再重复出现在普通入口网格**：生成/刷新/查看继续使用原 Calendar mode 与相同 evidence / cache / revision 边界。

## 0.8.13 calendar-phone-r38

- **Calendar 热更新可见性修复**：入口模块按 build 记录版本，并在版本变化时执行一次页面 reload 后动态加载运行时，避免浏览器继续复用 r35/r36 的旧 child-module graph 导致新入口缺失。
- **Phone/Terminal 双向聊天 schema**：chat message 增加 `speakerRole=owner|contact` 与 entry `contactName`；深聊必须同时包含 owner/contact，两边以实际名字渲染，拒绝整段只有“对方”的生成结果。
- **Legacy 对话保守兼容**：旧缓存不自动伪造 speaker attribution；若缺可靠双向角色，UI 提示用 r37 的单项重新生成修复。
- **Phone/Terminal 增量按钮恢复**：顶栏对 Phone 例外显示“增量追加”，调用现有增量生成链，不改变 Items 的结构型限制。
- **发布身份**：固定名“心跳回忆”，版本独立提升至 `0.8.13`。

## 0.8.12 content-controls-r37

- **统一内容管理入口**：所有已生成 mode 增加“管理”，支持整分类删除 / 重新生成，并对相簿、ADV EVENT、HEART、Phone、ENDING、Achievements、Calendar、Butterfly 等暴露经过 allowlist 的单项管理目标。
- **二次确认硬规则**：新增 `confirmExplicitActionTwice()`；所有新删除 / 重新生成按钮、已存在 CG 重绘 / 清图、日常一格重绘 / 清图、今日生活重新生成、完全重建正式档案、档案室索引移除都执行两次确认。
- **派生内容边界**：分类/单项删除只更新 theater cache；正式 `MEMORY_KEY` 不在删除路径中。用户主动删减后的 Phone / ENDING / Achievements 等 session 使用 `userManaged` 标记继续可读，不因低于初次生成数量门槛而被误判损坏。
- **单项原子替换**：单项重新生成在内存中完成并通过原 validator/evidence 约束后，再经过当前 chat + archive revision fence 保存；失败时旧项不变。
- **Room 依赖失效**：整房间删除/替换时同时清除 Items / Phone 派生缓存。
- **公开身份保持不变**：扩展继续固定名“心跳回忆”，版本独立提升至 `0.8.12`，ZIP 仍固定发布为 `心跳回忆.zip`。

## 0.8.11 stable-identity-r36.1

- **固定扩展名称**：`manifest.display_name` 永远为“心跳回忆”，README 主标题和公开安装包名称不再拼接版本号。
- **版本号与名称分离**：发布版本从长期停留的 `0.8.10` 提升为 `0.8.11`；后续版本只更新 `manifest.version`，不改变扩展名称。
- **稳定更新来源**：manifest 增加固定 GitHub `homePage`，并启用 `auto_update`；从同一 Git 仓库安装的用户继续在原扩展上更新，不创建“心跳回忆0.x”副本。
- **稳定安装包名**：面向用户的 ZIP 固定发布为 `心跳回忆.zip`；版本号继续记录在 manifest / CHANGELOG / 内部 cache-buster 中。

## 0.8.10 relationship-calendar-r36

- **新增独立「两个人的日历」**：档案室在 ENDING 与角色互动之间增加 Calendar 入口，按「已经度过 / 已约定 · 未发生 / 未来 · 世界设定」三种时间状态整理；支持按状态与月份筛选。
- **过去事实不交给模型改写**：带明确日期的 Mxxx 由本地直接映射为「已经度过」，保留真实 memory ID + anchor；模型不能创建或修改 past 条目。
- **未兑现约定必须有证据**：模型只负责识别档案中明确双方约好但尚未兑现/取消的安排，结果必须通过现有 memory ID + anchor 校验；没有明确日期可标记「待定」，但没有可靠证据就不会进入日历。
- **未来仅为世界设定**：角色卡 / Persona / 世界书里存在明确 MM/DD 或 YYYY/MM/DD 的生日、节庆、纪念日等可整理为 future；没有精确日期时宁可为空，不猜日期，也不把世界设定误写成两个人已经约好或一定会发生的剧情。
- **先做日历，不自动续写节日剧情**：r36 不提供 Future Special / 节日特别篇按钮。未来日期只是设定参考；真正经历过以后再由正式档案进入「已经度过」。
- **保持模块边界**：新增 `modes/calendar.js` 与 `ui/calendarView.js`，不嵌入 HEART；Calendar 仍使用共享 Connection Manager、evidence、cache 与 chat/revision fence，不新增正式 MEMORY_KEY 写入。

## 0.8.10 modular-runtime-r35.1 startup hotfix

- **修复 r35 启动回归**：r35 将 `index.js` 从 DOM-ready 自启动误改成仅 `export function init()`，但 manifest 并未声明 init hook，SillyTavern 加载文件后不会调用该函数，导致插件虽安装/启用却没有挂载菜单和设置。r35.1 恢复 r34 及更早版本的 `jQuery(() => initMemoryTheater())` 启动契约。
- **不改模块化架构和数据**：38 个 ES module、legacy `adv` 缓存键、archive/cache schema、Prompt、TT/全屏、60k、副 API、四季未来日常等均保持 r35 不变。

## 0.8.10 modular-runtime-r35

- **拆除 79 万字符单文件运行时**：`heartbeatMemories.js` 仅保留 init / destroy，业务代码按 `core / archive / generation / modes / ui` 拆成独立 ES modules。
- **业务模式横向隔离**：Album、ADV EVENT、Room、Items、Phone、ENDING、HEART、Achievements、Butterfly 之间不再直接 import；共享 evidence / cache / revision / request coordinator 由统一边界拥有。
- **CG/ADV 更名为 ADV EVENT**：只改产品/UI/源码模块名称；持久化键仍为 legacy `adv`，无需迁移旧缓存。
- **零 schema 迁移**：`MEMORY_KEY`、`CACHE_KEY`、archive schema v3、压缩缓存格式、incremental coverage 与历史派生数据保持兼容。
- **回归/安全验证**：r34 原 45 项行为测试全部适配模块化后通过，并增加 entrypoint、mode 横向依赖、关键安全边界单一所有者与 legacy adv key 兼容测试。

## 0.8.10 future-daily-drama-r34

- **春夏秋冬 / 未来 Drama 改为真正的未来日常番外**：档案只用于已经校验过的关系阶段，不再把新增记忆、关系摘要、证据锚点或其中的具体物品当成剧情素材；无需等新 Mxxx 才能继续追加一篇。
- **场景类型更接近恋爱模拟游戏的生活番外结构**：二人约会、居家相处、跑腿购物、短途出行、工作/学习后的碰面，以及角色卡/世界书明确存在的朋友、家人、同事群体互动会轮换出现；未知关系不凭空创建固定重要 NPC。
- **时期对话改为头像专属**：角色互动页面不再展示“各种时期的对话”页签或“点头像听一句”按钮；已生成的早中晚、周末、生日、节日、久未访问台词继续保留，只在档案室点击角色头像时按状态显示。
- **安全与写回边界不变**：四季/未来仍是派生模拟，不写正式 MEMORY_KEY；季节与 patch key 仍由代码 allowlist 决定，Provider 两并发、chat/revision fence 和脚本 HTML 转义继续保留。

## 0.8.10 clean-tt-r33

- 干净构建：CG 实图仅保留 SillyTavern Image Generation 公共接口。
- 新增 TT 显示模式开关：开启为 r32 顶部安全区 UI，关闭为传统全屏 UI；默认关闭。
- 修复 r32 输出预算回归：用户在副 API 设置的最大输出就是实际发给 Connection Manager 的 maxTokens，最高 60,000。
- 角色互动升级为档案室独立入口，并排列在成就库之前。
- 保留 r32 的移动端关闭按钮触控加固、增量派生内容、请求协调、缓存 idle 持久化与跨聊天 revision fence。

## 0.8.10 mobile-close-r32

- **修复 iPhone / 一键安装 WebView 顶栏被系统状态区覆盖**：移动全屏档案室使用四向 `safe-area-inset-*`；对把 iOS 顶部安全区错误报告为 0 的 WebView，额外使用 52px 代码兜底，确保关闭按钮落在可触摸区域。
- **关闭按钮不再只依赖 click**：仅对代码自带的顶栏关闭按钮增加 capture 阶段 `pointerdown/touchstart` 关闭链路，并阻止该次触摸穿透；不恢复旧版的 document 全局手势拦截。
- **移动触摸目标增至 44px**：返回、主页、增量追加、关闭四个顶栏按钮统一为 44×44；关闭仍只隐藏 UI，不取消或重定向后台生成任务。

## 0.8.10 incremental-content-r30

- **全部派生内容改成真正的增量追加**：档案新增 Mxxx 后，相簿、CG/ADV、房间、物品、私人终端、ENDING、告白回看、蝴蝶效应、成就库以及 HEART 的时期对话/日常一格都会只消费各自尚未处理的新记忆；没有新记忆时不调用模型。
- **春夏秋冬从“每季一篇”变成“每季篇目库”**：每次档案增量后可为同一季再追加一篇 Voice + Scenario；旧春篇、夏篇、秋篇、冬篇与后日谈逐条保留，界面可在同季多篇间切换。单季只完成半篇时仍保存，重试只补同批缺失半篇。
- **旧内容不再交给模型重写**：模型只返回候选增量，本地用证据/内容键去重并追加。旧相簿文字、CG 图片记录、完整 ADV、房间/物品、终端条目、路线终章与后日谈都保留；锁定条目允许在新证据下升级为解锁，当前关系摘要更新前会进入历史。
- **每个模块独立游标**：HEART 的时期对话、日常一格、未来、春、夏、秋、冬，以及 ENDING 的路线与告白扫描均分别记录 `coveredMemoryIds`；生成春篇不会消耗夏篇的待处理档案。
- **r28/r29 无损迁移**：档案增量时先把更新前的全部 Mxxx 记为旧缓存基线，再迁移 revision；本轮新增 ID 仍保持待处理。若旧缓存已在当前 revision 且无法还原旧快照，保守地把当前档案视为基线，避免把旧内容误当新增而复述。
- **有界累积**：派生集合最多保留 240 项，与正式档案上限一致；达到上限时停止接受新项，绝不为腾位置删除旧项。r29 的 60,000 输出上限、r28 网络空闲缓存写回和 r24 请求协调器继续保留。

## 0.8.10 output-60k-r29

- **最大输出真正提升到 60,000 tokens**：修复 r28 仍由 `MAX_GENERATION_OUTPUT_TOKENS = 30000`、设置归一化和 HTML `max=30000` 三处共同把用户输入 60,000 自动压回 30,000 的问题。
- **响应解析容量同步扩展**：JSON 解析器的本地正文/推理保留上限从 240,000 字符提升到 600,000 字符，避免用户已设 60k tokens 却被插件在解析前自行截断。
- **错误提示显示真实预算**：JSON 空输出/截断错误同时显示“当前插件设置”“本段实际请求上限”“插件允许最高 60,000”。分段任务若自身只申请 3k/8k，不再误导用户以为把全局设置调高就一定会让该段使用 60k。
- 60k 是插件允许的用户上限，不保证所选模型/代理支持；具体功能的较小分段上限仍优先，避免为了追求大输出重新制造超长 JSON。

## 0.8.10 network-idle-cache-r28

- **生成期间不再反复上传整份剧场缓存**：手机逐 App、HEART Voice/Scenario、ADV 等局部结果仍即时写入当前 runtime cache，但 gzip/chat metadata 持久化会在 provider 请求仍在执行或排队时继续合并等待，等网络请求空闲后再一次写回，减少家庭上行带宽尖峰和 bufferbloat。
- **移除现代浏览器的未压缩缓存双写**：支持 `CompressionStream` 时不再先把完整未压缩 theater cache 塞入 metadata 再紧接着写压缩版；只在无法本地 gzip 的浏览器保留旧 fallback。
- **不降低数据隔离**：延迟持久化仍经过原有 chat scope、archiveRevision 与 current archive 校验；切聊天/改档案后的迟到压缩结果不会写回错误窗口。Provider 并发仍保持最多 2。
- **修正未来/后日谈假 `1/2`**：未来只有 Voice Drama，不存在 Scenario 半段；未生成时显示“未生成”，成功后直接显示“已生成”。

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
