# RabbitMirror 1.4.30.12 TEST

## 1.4.30.12 - 2026-08-23

- 修正长聊天性能修复方向：不再新增“历史 DOM 分批挂载”机制，而是回到正式版 1.3.57 / 1.3.93 / 1.3.94 的既有不变量——折叠历史镜在 CHAT_CHANGED/full-chat restore 期间只能做轻量恢复。
- `ensureExternalTools()` 的 full-history 路径现在显式传入 `historyRestoreLight`：保留工具按钮、首次打开 patrol/toggle 与持久化结构标记，但跳过即时 nested-details candidate pass、自动维修签名/排队以及 layout-based legacy mobile row migration。
- 后续版本新增的 external geometry / shell integration / ready postprocess 也纳入历史轻量边界：折叠历史镜不启动 geometry settle，不执行 rendered-body `getComputedStyle`/rect 外框采样，也不执行主视觉 wide-stage/compact 后处理。
- 历史镜首次真正打开时，移除 runtime-only historical-light 标记，并只为该镜恢复 geometry、外框融合、ready 后处理、inline mobile spatial rescue 与原有交互/维修首开链。
- 新消息、Swipe、MESSAGE_UPDATED 等 targeted 单条更新不进入 history-light scope；保持原本即时修复/后处理语义。
- 基线为 GitHub 1.4.30.10；未合入此前 1.4.30.11 候选版的历史 DOM hydration batching。
- 不修改独立 API Prompt、POST body、temperature/max tokens、stream/retry/single-flight、一键连接、模型拉取、世界书、视觉冷却或 1.4.30.9 成品完整性门。

# RabbitMirror 1.4.30.10 TEST

## 1.4.30.10 - 2026-08-22

- 修复长聊天进入时的 CPU/主线程高负载：一次同步周期只扫描一次全局外置兔子镜 DOM，并按 mesid / owner key 建索引，避免逐消息重复 `document.querySelectorAll()` 形成近平方级放大。
- 已稳定且 owner DOM 未变化的历史独立镜面不再重复启动 geometry；同一 geometry cycle 只允许一个 scheduler。桌面端新 cycle 只做即时测量 + 双 rAF 确认，不再启动 120/420/1500ms 的移动端/WebView settle 链；移动端原 settle 语义保留。
- 已完成且 HTML/placement 未变化的 ready 镜面跳过重复主视觉 shell / compact / wide-stage 后处理；真实重挂载、显示位置变化或新 HTML 仍会重新执行。
- 历史 ready 镜面的“summary 是否视觉塌缩”改为同一 details DOM 只做一次布局探针；已有 owner lock 时也不再每轮 clone + 序列化整份 mounted HTML。
- `CHAT_CHANGED` 不再无条件让所有已挂载镜面 geometry epoch 失效；owner DOM replacement 与真实 viewport resize 仍分别触发必要重算。
- 不修改独立 API Prompt、POST body、stream/retry/single-flight、一键连接、模型拉取、世界书、visual cooldown、sanitizer、维修兔或生成结果内容。

# RabbitMirror 1.4.30.9 TEST

## 1.4.30.9 - 2026-08-22

- 独立 API 新增“视觉程序完整性门”：在已有正文/空壳检查之后，继续识别“HTML 主体存在但依赖的 CSS 程序整块缺失”的半成品。
- 高置信命中包括：多处本地 CSS 变量被引用却没有定义、checkbox/radio 状态交互明显依赖 class 但没有有效样式表、或大量 class 几乎没有 inline 样式且没有有效样式表。命中后不保存、不进入历史、不让维修兔猜 CSS，直接提示重新生成。
- 保留合法纯 inline-style、简单无样式 HTML、宿主/兔子镜已提供 CSS 变量，以及带有效 <style> 的正常兔子镜。
- 不修改独立 API Prompt、请求 body、stream/retry/single-flight、一键连接、模型拉取、世界书、视觉冷却、外置框、sanitizer 或维修兔其它模块。

# RabbitMirror 1.4.30.9 TEST

## 1.4.30.9 - 2026-08-22

- 修复 1.4.30.7 的聊天切换性能回归：`CHAT_CHANGED` / `WORLDINFO_ENTRIES_LOADED` 不再同步重建世界书设置 DOM，而是仅标记当前聊天列表待刷新，并在设置区域真正可见时延迟合并刷新。
- “全部世界书”折叠区改为真正懒渲染：折叠时不创建完整 checkbox 列表，关闭折叠区会立即释放该大列表 DOM；只有用户展开时才按当前内存名单构建。
- API 请求诊断更新不再顺带重绘世界书设置；世界书 UI listener 与延迟/可见性 observer 在销毁时完整清理。
- 不修改世界书 loaded→activated 实际捕获语义、独立 API Prompt / POST body / stream / retry / single-flight、模型拉取逻辑、维修兔、sanitizer、外容器或六维视觉冷却。

# 1.4.30.7 TEST

- 世界书设置按当前聊天隔离：默认列表只显示 SillyTavern 在当前聊天 World Info 生命周期中加载过的书，不再把其他角色/聊天的历史观察缓存混进来。实际发送逻辑仍只复用本轮最终激活条目，不重扫、不重掷 probability。
- “全部世界书”移入默认折叠区，需要时再手动拉取完整名单，避免设置页被大量世界书撑长。
- 一键配置酒馆 API 后不再同步等待远端 `/models`；先使用当前 Connection Manager 已保存模型。手动“拉取模型”增加 12 秒超时，失败/超时时保留已保存模型和手动模型 ID，不再无限卡住。
- 不修改独立 API 生成 Prompt、POST 请求 body、stream/retry/single-flight、维修兔、外容器、sanitizer、视觉冷却或世界书实际激活捕获语义。

# RabbitMirror 1.4.30.7 TEST

## 1.4.30.7 - 2026-08-22

- 独立 API 设置页新增“从酒馆当前连接一键配置”，参考 tokimemo 的 Connection Manager 导入方式：优先引用酒馆当前选中的 Chat Completion profile；没有可引用 profile 时，只在当前主 API 本身为 Chat Completion 时读取现有连接参数并创建兔子镜专用 Connection Manager profile。
- 一键模式只保存 Connection Manager profile ID 与模型 ID；API Key 不复制到兔子镜设置，继续由 SillyTavern Secrets 保管。
- 原 Base URL / API Key 手动输入移到“高级：手动 OpenAI 兼容接口（旧配置兼容）”，原有用户配置不删除，可显式切回。
- 生成仍使用兔子镜原有 system/user Prompt、profile body、temperature/max_tokens、stream、手动兼容切换、single-flight、超时与失败语义；Connection Manager 只负责把既有请求交给酒馆已保存的 Chat Completion 连接与 Secrets。
- 不修改维修兔、外容器、视觉家族冷却、sanitizer、随机/黑名单、世界书上下文或重说语义。


## 1.4.30.5 - 2026-08-22

- 基于 1.4.30.4，小修独立 API 视觉优先级：近因视觉避让先执行，用户视觉偏好改为近输出阶段的最终视觉裁决，避免“连续暗底冷却”把成品直接推成不符合美化主题的极亮/极淡方案。
- 近输出短锁增加关键文字可读性底线，明确禁止正文/按钮/标签为了明暗避让而贴近实际背景色。
- 维修兔新增严重低对比文字检测与 `text-contrast-repair`：仅对真实显示、直接承载正文且对比度低于保守阈值的元素介入；隐藏态/透明交互内容不参与。
- 独立 API 纯外置模式重新启用既有 `applyExternalShellIntegration()`，从本体 surface/header/border/radius 采样外置标题框，避免标题条与兔子镜本体颜色脱节。
- 保留 1.4.30.4 手动“重说” single-flight 修复、1.4.30.3 六维视觉家族冷却、1.4.30.2 主 API 维修兔身份识别；不改请求参数/stream/retry、sanitizer 主体、checked/radio 或母本。

- 直接基于 1.4.30.1，小修两处；底座仍是 1.4.30，不合并 1.4.25.1/1.4.25.2。
- 配色冷却取消“冷青蓝”及其它具体颜色家族的特殊待遇；所有颜色统一按主色相、冷暖、底盘、明度/饱和度/对比结构做近期 3 面短期避重。仅换主色相但继续沿用同一白底/深底、冷暖与明暗结构，也视为近似模板复用。
- 跟随主 API 的兔子镜识别不再只靠 summary 中“兔子镜”三个字：优先兼容兔子镜/兔子鏡/Rabbit Mirror 标题，同时接受 RabbitMirror 自己生成的 `data-rabbit-mirror-css-scope=rmcss-*` 结构身份；标题被显示正则改名、且 `<toto>` 被宿主剥掉时，维修兔仍可找到外层 details。
- 结构身份只认最外层受 scope 标记的 details，避免把镜内嵌套 details 当成独立兔子镜。
- 不修改 1.4.30/1.4.30.1 的 sanitizer 主体、checked/radio 别名、外置 shell/外容器、Prompt 母本、抽签、独立 API stream/retry/single-flight。

# RabbitMirror 1.4.30 TEST

- 修复 1.4.26 起 strict sanitizer 对 `@import` 的整份 `<style>` 删除：现在只移除 `@import` 语句，保留同一 stylesheet 中的本地外框、`display:none` 默认隐藏态、`:checked` 交互规则与布局。外部字体/样式仍不会发起网络请求。
- 再收窄 1.4.28/1.4.29 的 checked/radio ID 别名：别名不再写入全局 ID 映射，不再重写普通 panel/SVG/base selector；只允许修 `label[for]` 与作为 `:checked` / `:not(:checked)` 主体的控件选择器。
- sanitizer 若真的因剩余本地 CSS 仍不安全而不得不删除整份 style，会写入诊断标记；维修兔/全链路诊断不再沉默，会明确报告“外框/默认隐藏态/交互显示规则可能丢失”。
- 保留 1.4.26+ 的 script/iframe/form/外部资源安全边界、WeakMap + DOM clone、popover/local route；不修改 Prompt、母本、抽签、独立 API stream/retry/single-flight。

# RabbitMirror 1.4.29 TEST

- 修复 1.4.28 checked/radio ID 别名修复的范围过宽回归：不再把任意 CSS `#id`、`aria-controls`、锚点目标等都当作 checkbox/radio 控件引用，避免把结果面板/装饰节点的隐藏规则错误重定向到 input，导致“本应点击后出现的内容默认全展开”。
- checked/radio 别名只在有明确控件证据时生效：`label[for]`，或 CSS 中作为 `:checked` / `:not(:checked)` 主体的 `#id` / `[id=...]`。候选目标也只允许真实 checkbox/radio input。
- 修复必须保持初始可见状态：若某个 checkbox 原本因坏掉的 `:checked` 引用而“看起来未开启”，1.4.29 不会在修好引用的同一刻把第二层内容突然展开；仅对这种新修复且之前没有有效 checked 路线的 checkbox 清除错误的初始 checked，用户首次点击后再正常显示第二层。radio 默认分支不动。
- 保留 1.4.28 对 `toggle/chk/check/checkbox/cb/switch` 与 `rad/radio/rb` 的高置信唯一别名能力，因此上一轮“按钮能点但 CSS 永远找不到真实 checked 控件”的修复不回滚。
- 保留 1.4.27 的 sanitizer、WeakMap + DOM clone、CSS 声明级净化、popover/local route 与外部资源边界；不修改 Prompt、母本、抽签、独立 API 请求参数/stream/retry/single-flight。

# RabbitMirror 1.4.28 TEST

- 修复 checked/radio 交互引用的高置信别名漏判：模型把真实控件 ID 写成 `...-toggle-analysis`，却在 CSS/label 中引用 `...-chk-analysis`（或 checkbox/check/cb/switch、rad/radio/rb 同族命名）时，维修兔/独立 API 的 ID 隔离现在可在“唯一目标 + 语义尾部一致”前提下同步引用。
- 不放宽跨镜/歧义映射：若同一别名能命中多个不同控件，仍保持不修；不同语义尾部（如 analysis vs danmaku）不会互相串接。
- 保留 1.4.27 的未信任 HTML sanitizer、WeakMap + DOM clone、CSS 声明级净化、popover/local route、外部资源阻断。
- 不修改 Prompt、母本、抽签、独立 API 请求参数/stream/retry/single-flight、World Info 或其它维修兔模块。

# RabbitMirror 1.4.27 TEST

- 回修 1.4.26 strict sanitizer 的兼容性误杀，同时保留原安全边界。
- CSS overlay 判定从“任何 fixed/sticky 都危险”缩窄为真实全视口覆盖；局部 fixed 浮层、sticky 吸顶、普通 absolute 不再导致整份样式被删除。
- 外部 `url()` / legacy executable CSS 改为声明级剔除，安全布局/配色声明继续保留；`@import` 仍整块拒绝。
- 恢复同镜、唯一 ID、合法动作的 popover/commandfor 路由；无效/歧义/跨目标路由继续删除。dialog 保留结构但移除自动 open。
- data image 增加 2,000,000 字符上限；塔罗固定图源、SVG fragment 与既有严格 URL 规则保持。
- 不修改 Prompt、抽签、独立 API 请求参数/stream/retry/single-flight、World Info 或维修兔其它功能。

# RabbitMirror 1.4.26 TEST

- F1：自修改交互 baseline/active 改为 runtime-only WeakMap + DOM clone；不再从模型 attribute 回读，不再通过 `innerHTML` 恢复 baseline。
- F2/F3/F7：独立 API 首次挂载与维修兔 direct-DOM recovery 共用未信任 HTML sanitizer；默认拒绝任意外部资源、form 提交与越界覆盖层，同时保留 checkbox/radio、普通 absolute CSS、本地 SVG fragment、健康 data image。
- 塔罗 Prompt/规则文件保持 1.4.25 原样；运行时仅放行既有 `gfx.tarot.com/images/site/decks/rider/full_size/0-77.jpg` 固定路径，query/fragment 不放行。
- F4：删除误残留 dead file `data/safetyPatch.js`，不接入 Prompt。
- F5：只把设置页文案改为“清除抽签历史与冷却记录”，不扩大 `onClean()` 的删除语义。
- F6：本轮不处理；`response.text()`、stream/non-stream、retry/single-flight 等独立 API 高风险请求链保持原行为。

# RabbitMirror 1.4.25 TEST

- 「拉取世界书」增加 15 秒本地超时；宿主卡住时会自动结束并恢复按钮。
- 世界书说明改成更准确的大白话：只拿名单/元数据用于逐本选择，不会重新扫描或重掷激活概率。
- 其余功能沿用 1.4.24。

- 设置页说明文字全面压短，改成直接的大白话；独立 API、Token、生成设置、黑名单、自定义视觉等不再堆技术说明。
- 世界书区域新增“拉取世界书”按钮与可滚动逐本勾选框，可主动读取当前 SillyTavern 的世界书名单。
- 拉取只调用 SillyTavern 世界书列表接口，不读取条目内容、不运行 World Info scanner、不触发 probability；真正发送给独立 API 的仍只限主生成本轮已经激活、且逐本开关允许的条目。
- 世界书列表使用 file_id 作为实际筛选身份，显示名仅用于 UI，避免显示名与实际 entry.world 不一致。
- 保留 1.4.23 的 reset 指纹隔离、512 字符书名边界、fail-closed 与 512 本缓存修复。

# RabbitMirror 1.4.23 TEST

- 修复“恢复交互初始状态”按 chat/mesid/swipe 复用旧快照导致串镜：复位快照现在同时绑定当前渲染镜面实例和消息/外置源码指纹；同一消息重绘、编辑或同消息多镜面不会共用 baseline。
- 世界书逐本筛选：合法名称上限统一为 512 字符；无法安全表示的身份改为 fail-closed，不再默认放行到独立 API。
- 世界书逐本关闭不再静默截断为 256 本；观察缓存内存与 localStorage 统一使用 512 本 LRU 上限。
- 逐本切换 toast 对书名做 HTML 转义。
- 不重扫世界书、不重掷 probability；独立 API 请求、12k World Info 预算、大接近与维修兔其它链保持。

# 1.4.22 TEST — 2026-08-20

- World Info：保留原有全局开关，并新增逐本启用/停用。逐本设置只过滤 SillyTavern 本轮已经加载且最终激活的条目，不主动调用 World Info scanner、不重掷 probability、不增加独立 API 请求；新观察到的世界书默认启用。
- World Info：逐本禁用集合在主生成开始时冻结，生成途中修改只影响下一轮；继续复用原 12k chars 共享预算与 loaded-key → activated 双证明链。
- 维修兔菜单新增「⏪ 恢复交互初始状态」：第一次真实交互发生前按需保存该镜面 DOM 基线，之后可重复恢复 checkbox/radio、内部 details、交互产生的 DOM 状态和大接近 reaction/approach，无需刷新整个页面。
- 交互复位使用 clone + replace 生成新 DOM，避免旧 listener / WeakMap 状态继续污染；外层兔子镜当前展开状态保持不变。执行任何维修前会使旧交互基线失效，避免“恢复交互”反向撤销刚完成的维修。
- 不为逐本世界书增加扫描器/Observer，不为交互复位新增全局 listener/Observer/polling/API；复位快照按实际首次交互懒创建并限量保存。

# 1.4.21 TEST — 2026-08-20

- 修复大接近 threshold 初始状态与运行时 WeakMap 脱节：加载／新插入舞台统一归一到 neutral，threshold reaction 由运行时强制隐藏，达到临界点后才解锁。
- 私密 mystery 成人边界改为双门槛：模型的 adult/intimate 仅作为候选，首次实际触发还需用户在 DOM 外本地确认当前角色成年；确认按当前角色在本次扩展会话内复用。
- 成人门槛收口到真实 radio/checkbox 状态源：直接 input、第二个普通 label、舞台外 label 指向私密 input 都 fail-closed；合法 canonical hotspot 通过一次性 input 激活令牌继续工作。
- 无 for、无真实 input、disabled、共用/歧义 input 的坏热点不再写 last-zone、不推进 approach、不触发 Live2D。
- 为防流式／动态插入时 threshold 短暂泄露，新增 1 个仅监听 #chat 子节点插入的窄 MutationObserver；不扫描文本、不轮询、不发 API。

# 1.4.20 TEST — 2026-08-20

- 大接近模式：新输出常规热点以 head / face / shoulder / chest / hand / waist / thigh / knee / calf 为候选，并允许明确成年角色在关系/情境适合时额外生成 0～2 个 mystery 私密随机隐藏触点。
- 热恋／高亲密回合新增仅属于当前舞台的本地 approach state：默认 natural 不显示数字，少数 gs 回合可显示作者自定义 meter；达到 threshold 仅揭示本轮已经预生成的关系变化反应。
- approach 使用 WeakMap 临时状态，不写聊天历史、不跨兔子镜继承；重复同区推进自动衰减，热点可用 1～3 的本轮剧情权重，但不建立固定部位分值表。
- mystery Live2D 仅接受受控通用语义映射到本地既有 hit area；继续只执行本地 expression / motion，忽略 message，不新增模型请求、timer、Observer 或 listener。
- 未同时满足 `data-rm-touch-adult=true` + `data-rm-touch-intimate=true` 的 mystery 点击运行时 fail-closed，并阻止 label 原生激活。

# 1.4.19 TEST — 2026-08-19

- 大接近模式：明确无固定图床套数；reaction 对话框新增强制 close/neutral DOM 契约，并由现有单一 click 委托提供关闭兜底，关闭不派发 input/change、不触发 Live2D message 或模型生成。
- 维修兔：新增手机端极窄长正文救援，针对横排长文本被压成一两字宽的高瘦竖柱；排除作者有意竖排、侧栏/导航、诗歌/引文、旋转元素、触摸热点、短文本与正常宽度内容。
- 不新增请求、timer、Observer、polling 或全局 listener；其它高风险链保持。

# 1.4.18 TEST — 2026-08-19

- 修复 1.4.17 styleless fallback 的三类反例：外部/美化 CSS 误覆盖、中等 inline 视觉误覆盖、无真实第二状态却伪造“触碰”按钮。
- 修复 underfill 对显式 `max-width`、竖排和明确物理窄媒介的误拉宽；忽略小型装饰媒体 sibling，避免主正文因此漏救。
- 只改 `src/outputSanitizer.js` 的功能逻辑；其余文件仅版本/cache-bust。

# 1.4.17 TEST — 2026-08-19

- 维修兔：新增“DOM 完整但 CSS 完全缺失”的中性结构降级救援。
- 维修兔：新增手机端主正文 underfill rescue；严格排除常见有意窄媒介与侧栏/工具组件。
- 回归样本：`全链路2.txt`（纯文字/无 CSS）与 `全链路.txt`（260px 符纸窄面）。
- 不新增 API 请求、timer、Observer、轮询或全局 listener。

# RabbitMirror 1.4.16 TEST

## 1.4.16 TEST

- 将 `6.2.1.2 触摸小剧场 (Touch Theater)` 重构为 `6.2.1.1.e 大接近模式 (大接近モード)`，真正归入「心跳回忆 GS 模式」子项。
- 参考用户提供的纯角色卡母本统一新输出九区语义：head / face / shoulder / chest / arm / hand / waist / thigh / knee；不捆绑母本 Base64 立绘或 Regex 安装包。
- 大接近模式新根标记为 `data-rm-dai-sekkin-mode="true"`；Live2D 桥保留 1.4.15 旧根标记与 left-hand/right-hand/hair 兼容。
- 兼容迁移 1.4.15 的旧 `6.2.1.2` 收藏、黑名单、倍率与 Eligible Misses 到 `6.2.1.1.e`。
- 触摸基础层仍为纯 HTML/CSS，Live2D 只允许 expression/motion，不发送 hit-area message、不触发 generate 或其它模型请求。


## 1.4.15 TEST

- 新增独立展现形式 `6.2.1.2 触摸小剧场 (Touch Theater)`：5～9 个移动端可触摸人物热区，每个热区在本轮预生成独立反应。
- 新增条件式 `TOUCH_THEATER_RULES`，只有抽中／点名触摸小剧场时才进入 Prompt；普通兔子镜不承担这段专用规则。
- 新增可选 Live2D 动作桥：若官方 Live2D 扩展已启用且当前角色 hit area 能高置信匹配，只复用其 expression / motion；不发送映射 message、不调用 generate。
- 运行时仅增加一个全局委托 click listener，无 Observer、polling 或定时器；基础触摸交互在 Live2D 缺失时仍由 HTML/CSS 独立工作。
- 保留 1.4.14 Android／小米外置宽度与 1.4.12 checked 正文优先级修复。

## 1.4.15 TEST

- 修复 Android／小米 external host 从 PC lane 切入 mobile lane 后遗留 `data-rm-independent-external-compact-shell` / `--rm-external-compact-width`，避免旧 320px 左右 compact 宽度继续压窄已经判定为手机布局的外置兔子镜。
- viewport refresh signature 与 1.4.13 的多源宽度判断对齐，综合 `visualViewport.width`、`innerWidth`、`documentElement.clientWidth`、`screen.width`；resize 先共用原 160ms debounce，再比较复合 signature，避免在高频事件中反复读取布局。
- 新增 `visualViewport.resize` 到现有 geometry refresh 队列，并在 disable/cleanup 成对移除；宽度未变化时 settle 后直接 no-op，不新增 observer / polling / API generation。
- 为避免桌面 pinch/browser zoom 的 `visualViewport.width` 单独变小就误入 mobile lane，visualViewport-only 的窄宽只在移动平台提示成立时作为 mobile 证据；手机 `screen/inner/clientWidth` 任一已窄时仍按手机 lane。
- 1.4.12 checked 正文强／弱隐藏优先级、独立 API 请求闸门、Prompt、抽签、收藏、World Info、维修兔其它链保持不变。


# RabbitMirror 1.4.13 TEST

## 1.4.13 TEST

- 基于 1.4.12，仅修复独立 API 纯外置在部分 Android／小米浏览器或 WebView 上的窄面误判。
- 新增外置专用有效 viewport 宽度判定：综合 `visualViewport.width`、`innerWidth`、`document.documentElement.clientWidth`、`screen.width` 的有效 CSS 宽度，避免真实手机因 desktop-like `innerWidth` 被误送进 PC-only compact/wide-stage 路径。
- 手机结构宽度计划、auto-root fill rescue、PC compact shell、PC wide-stage neutralization 使用同一有效宽度判定；原来的 resize signature 仍保持 DOM-read-free，不新增 observer、polling 或 timer。
- 1.4.12 `src/outputSanitizer.js` 的 BUG-1 强／弱隐藏证据优先级修复保留；独立 API 请求次数、Prompt、维修兔、黑名单／收藏等其它逻辑不改。


## 1.4.12 TEST

- 修复 1.4.11「checked 内层正文残留兜底」的候选优先级：`display:none` / `visibility:hidden|collapse` 作为强隐藏证据优先处理；只有不存在强隐藏候选时，才允许 `height<=1` / `opacity<=0.05` / 折叠 `max-height` 作为弱证据进入兜底。
- 防止正文之前的零高度包装层、占位行、绝对定位 wrapper 或动画初始 0 高度节点先被修复并把父容器撑高，从而触发提前 `break`、真正正文仍保持隐藏。
- 保留 1.4.11 的浅层直接子节点范围、第三层交互/独立伪类跳过、inline override 可逆回滚与“恢复出真实内容盒后立即停止”保护。
- 不修改独立 API、近输出短锁、重 Roll 配色、World Info、抽签、收藏倍率、Eligible Misses、维修兔其它模块或请求次数。

# RabbitMirror 1.4.11 TEST

## 1.4.11 TEST

- 维修兔新增「checked 内层正文残留兜底」：当 checkbox/radio 的 checked 分支已经明确展开一个结果容器，但该容器的直接正文子节点仍被无条件 `display:none` / `visibility:hidden` / `opacity:0` / 零高度残留样式卡住时，只恢复这些无独立交互状态的正文/媒体子节点。
- 该兜底只作用于已经由 checked 规则证明为当前选中结果的容器；带 input/button/label/details 等嵌套交互的子区，以及拥有自己 `:checked/:hover/:focus/:active/:target/:has()` 状态规则的子内容会跳过，避免把真正的第三层交互粗暴摊开。
- 切换 radio/checkbox 时使用既有 inline override 回滚机制恢复原样，不让多个分支同时展开；全链路诊断新增「checked内层正文残留兜底」计数，便于确认是否命中。
- 不修改独立 API、抽签、World Info、近输出短锁、重 Roll 配色、收藏/fairness、Prompt 或请求次数。

# RabbitMirror 1.4.10 TEST

## 1.4.10 TEST

- 独立 API 的“最终执行锁”压缩为真正的近输出短锁：只重复本轮抽中 identity、实际生效的近因避让、可选点菜/视觉偏好与最短输出契约；不再重复基础 Prompt 已包含的展现形式母本、全局视觉地板、完整冷却段、风险纠偏和五项自检。
- 手动“重新生成兔子镜”现在会读取同槽位上一版真实配色指纹；除非用户明确固定配色，否则本次重 roll 必须换配色家族。
- 独立 API 的近期配色守卫改为优先读取真实历史版本，而不是只看每个消息槽位当前保留的一版，因此同一兔子镜连续重 roll 也会进入重复配色判断。


- 独立 API 的“读取本轮已激活世界书”从仅 Global selector 扩展为复用 SillyTavern 主生成当轮已加载并最终激活的 全局／角色／聊天／Persona World Info。
- 仍以 `WORLDINFO_ENTRIES_LOADED` 建立本轮合法条目集合、再以 `WORLD_INFO_ACTIVATED` 取真正激活项；不调用 `getWorldInfoPrompt()`，不重新扫描、不重新掷 probability，也不读取未激活条目。
- 四类 World Info 共用原有单一 12,000 字符独立预算，不按来源各给 12,000；关闭开关时行为与 1.4.8 一致，不为此增加上下文。
- 内部 settings 键 `independentReadGlobalWorldInfo` 暂保留用于旧设置兼容；用户界面与诊断文案改为“已激活世界书”。
- 1.4.8 的全池一览、×1～×50 收藏倍率、Eligible Misses soft pity、独立 API 请求 profile、single-flight、维修兔与 Prompt 主结构不作其它功能修改。

# RabbitMirror 1.4.8 TEST

- ⭐ 收藏室单项自定义倍率上限由 `×20` 提升到 `×50`（仍为 0.5 步进、默认 `×3`）。`×50` 只是相对 weighted-random 权重，不是 50% 命中率，也不形成硬保底。
- 主题继续保持双层保护：单个收藏主题可以设到 `×50`，但家族层额外加权仍保持 `×6` 封顶，避免一个高倍率子项把整个家族一起抬到 50 倍。
- 黑名单、hard exclusion、近期 exact-ID 冷却与 1.4.6 Eligible Misses fairness 优先级不变；收藏倍率仍只服务本地抽签，不进入 Prompt、API 或 World Info。
- 反向审计修复一个确定的倍率输入边界：输入框清空／非法时不再因为 `Number('') === 0` 被静默夹成 `×1`，而是恢复当前已保存倍率并提示重新输入。
- 本轮同步执行 1.4.7 功能反向审计，重点复查全池一览可达性、倍率生命周期、cache identity、fairness 组合、DOM 转义与 listener 清理。

# RabbitMirror 1.4.7 TEST

- 🎲 本轮抽签新增「📚 全池一览」：无需等待项目先被随机抽中，即可按“主题／元素 → 大组 → 父项 → 子项”逐层浏览全部当前索引，也可按名称／ID／说明搜索；任意项目可直接加入 ⭐ 收藏室或 🚫 黑名单。目录按需逐层渲染，不一次性铺满全部项目，不新增 Observer／poll／timer。
- ⭐ 收藏室新增逐项倍率：每个收藏项目可独立设置 `×1～×20`（0.5 步进），旧收藏与新收藏在未设置时继续默认 `×3`。展现形式直接使用该单项倍率；主题保留“家族 + 子项”两级结构，默认 `×3` 仍精确对应既有家族 `×2.5`，高倍率时家族层额外权重最多 `×6`，避免收藏一个子项把整个大家族一起无限放大。
- 收藏倍率与 1.4.6 的 Eligible Misses 公平性继续独立相乘；黑名单、hard exclusion、近期 exact-ID 冷却与明确点菜仍优先。倍率变化加入部分点菜随机缓存 identity，避免缓存继续沿用旧倍率。
- 收藏／黑名单互斥继续保持：加入黑名单会移除对应收藏倍率；解除后重新收藏默认从 `×3` 开始。倍率设置持久化在现有 extension settings，不进入 Prompt，不增加 Token 或 API 请求。
- 不修改独立 API、Gemini／DeepSeek、Global World Info、维修兔、挨打猫、Prompt 母本、主题／展现形式数据源或 1.4.6 soft-pity 状态机。

# RabbitMirror 1.4.6 TEST

- 展现形式随机抽签新增 Eligible Misses + bounded soft pity：只有“本轮真实通过 mode／黑名单／近期 exact-ID 资格过滤、实际进入随机候选池但最终未命中”的 format 才累计一次 miss；一轮抽 2 个时其它 eligible 候选仍只 +1。
- 公平性倍率分档为 `0–39 ×1.00 / 40–79 ×1.10 / 80–139 ×1.25 / 140–219 ×1.45 / 220–319 ×1.70 / 320+ ×2.00`，320 封顶；不做硬保底或固定轮播。
- 收藏室继续作为独立偏好权重与公平性相乘；黑名单与 hard exclusion 不会被 aging 复活。强制 Visual Scenery、明确展现形式点菜等没有普通 format 随机资格的轮次不累计 miss。
- 公平性状态使用现有 `storage.js` 本地持久化风格保存稀疏 `formatId -> eligibleMisses`；非法值、过期 ID、负数与超 cap 数值在读取／下一次写入时清洗。解除展现形式黑名单（含收藏自动解除、清空黑名单）会把对应 miss 重置为 0。
- 不增加 Prompt／Token、API 请求、Observer、poll 或 timer；独立 API、Gemini／DeepSeek、Global World Info、维修兔、Prompt 结构与主题抽签逻辑不改。

# RabbitMirror 1.4.5 TEST

- 修复 🎲 本轮抽签中的「⭐ 收藏室」总管理入口不可达：事件委托现在同时接收收藏室与黑名单管理按钮。
- 加固维修兔 direct-DOM 恢复边界：危险 URL 属性覆盖 `href/src/xlink:href/formaction/action/poster`，同时拦截 JavaScript/VBScript、`data:text/html`、控制字符混淆、`srcdoc` 与危险内联 CSS。
- 异常设置读时去冲突：若旧备份/外部写入让同一 ID 同时存在于收藏与黑名单，黑名单在有效状态中优先；不主动改写用户 settings。
- 独立 API、Gemini／DeepSeek、Global World Info、付费 POST/single-flight、维修兔自动巡检与 Prompt 结构未改。

# RabbitMirror 1.4.4 TEST

- 同一个 🎲 本轮抽签载体新增 ⭐ 收藏室：可对本轮真实抽中的主题／元素与展现形式直接收藏、取消收藏、查看收藏室或清空收藏。收藏项只在本地提高后续随机候选权重（展现形式 ×3；主题家族 ×2.5、家族内收藏项 ×3），不向 Prompt 注入“喜欢”文字，也不会越过近期冷却或黑名单。
- 收藏室与黑名单互斥：把同一项目加入收藏室会自动解除该项目黑名单；加入黑名单会自动移出收藏室。旧版 `1.3.3` 歧义展现形式沿用现有双目标兼容规则。
- 新增布尔变量 / UI 开关 `presentationWorldviewLock`（“展现形式世界观锁”），默认关闭。开启且本轮抽中的主题没有 `if` 标签时，仅追加一条极简规则：`世界观载体锁：保留展现形式功能与结构；不合当前世界观的具体载体必须换成世界观内功能等价物。不得删形式、改剧情或套固定模板。`；抽中 `if` 主题时代码层自动不注入该规则。
- 收藏室变化会进入部分点菜的随机缓存身份，避免已经缓存的“另一侧随机结果”忽略用户刚刚更新的收藏偏好。
- 独立 API、Global WI capture / 12,000 字符预算、Gemini／DeepSeek profile、Load failed 手动降级、一轮失败不自动重复 POST、维修兔与宽度链不改。
- 测试仓库：`https://github.com/Zaiyebuzuoyouqingdetiangou/tototest`。

# RabbitMirror 1.4.3 TEST

- 修复全局世界书 capture 的漏结束事件串轮边界：`GENERATION_STARTED` 不再仅凭 RabbitMirror 自己短期保留的 `hostGenerationInProgress` 事件提示判断“嵌套生成”。若上一轮 `GENERATION_ENDED` 偶发漏收、但 SillyTavern 已无 streaming DOM / isGenerating / is_send_press / group generating 等真实生成证据，则下一次正常生成会重建 capture，不继承上一轮已激活世界书。
- 保留真实嵌套生成：SillyTavern 工具调用递归期间生成状态仍保持 active，因此递归 `Generate('normal')` 继续复用同一 capture；不使用 30s/60s 等固定超时，不会因为主模型生成较慢而强制切断 capture。
- 其余 1.4.2 行为不变：Global WI 默认关闭；只复用当轮已激活 global 条目；独立 12,000 字符预算、参考资料边界与 `<toto>` 定界符中和不改；Gemini／DeepSeek profile、Load failed 手动降级、一轮失败不自动重复 POST、维修兔、Prompt、视觉与宽度链不改。
- 测试仓库：`https://github.com/Zaiyebuzuoyouqingdetiangou/tototest`。

# RabbitMirror 1.4.2 TEST

- 修复全局世界书 capture 在主回复尚未完成时被嵌套／辅助 `GENERATION_STARTED` 无条件覆盖的问题：同一聊天、同一 assistant baseline 且宿主仍处于生成中的嵌套 start 不再夺走已有 capture；真正新的顶层生成仍可正常重建 capture。
- World Info 事件入口增加保守形状校验：`GENERATION_STARTED` type 异常、options 非对象、显式 dry-run、quiet、impersonate 均不会开启世界书 capture；`WORLDINFO_ENTRIES_LOADED` 非 `globalLore[]` 结构时不标记已加载。
- 已激活全局世界书改为“参考资料”块；明确不得覆盖 RabbitMirror 系统规则，并 neutralize 世界书中裸 `<toto>` / `</toto>` 起始标记，降低模型误模仿输出定界符的风险。
- 全局世界书增加独立 12,000 字符预算；按条目优先完整保留，单条超长时才截断并注明，其余条目注明省略数量。开启该功能时先为固定上下文与世界书预留预算，再从最新聊天向前取正文，避免大世界书把刚完成的 assistant 正文从总上下文中挤掉。
- 默认开关仍为关闭；关闭时不增加世界书上下文。Gemini／DeepSeek 请求 profile、Load failed 手动降级、维修兔、Prompt 母本、视觉与宽度链不改。
- 测试仓库：`https://github.com/Zaiyebuzuoyouqingdetiangou/tototest`。

# RabbitMirror 1.4.1 TEST

- 独立 API 新增“读取本轮已激活的全局世界书”开关，默认关闭。
- 开启后通过 SillyTavern 现有 World Info 生命周期事件复用主生成当轮实际激活的“全局选择器”条目；不额外调用 `getWorldInfoPrompt()`，因此不会为了兔子镜重新扫描、重新掷概率或再次加载整本世界书。
- 只带入已激活的全局条目正文；角色绑定、聊天绑定、Persona 绑定世界书不因本开关额外加入。
- 关闭时不增加该部分上下文；现有独立 API、Gemini/DeepSeek兼容、维修兔、宽度、Prompt、黑名单等逻辑不变。
- 测试仓库：`https://github.com/Zaiyebuzuoyouqingdetiangou/tototest`。

# v1.4 / 正式版

- 以 `1.3.102 TEST / RC` 的实际源码为唯一基线转为正式仓库版本；功能逻辑、Prompt、主题／展现形式母本、独立 API、Gemini／DeepSeek 请求链、维修兔、挨打猫、黑名单、配色与布局修复均不改。
- 对外显示名称统一为“兔子镜小剧场”，发布版本为 `v1.4`（manifest 技术版号 `1.4.0`）；仅同步运行时／缓存／诊断版本标识。
- 发布通道切换为正式仓库 `https://github.com/Zaiyebuzuoyouqingdetiangou/toto`，重新开启 `auto_update`。
- 正式发布 ZIP 固定命名为 `兔子镜小剧场.zip`。

# 1.3.102 TEST / RC

- 撤回 1.3.101 的激进副 API 启动加速：弱生成 flag 宽限恢复 30s，普通正文稳定窗恢复 1400ms，弱证据稳定窗恢复 4500ms，前 15 秒轮询恢复 760ms。目的只是在正文确实结束后再启动付费副 API，降低主正文尚未完成时误启动、随后 sourceHash 变化导致旧请求已计费却被取消的风险。
- DeepSeek / 中转流式传输出现 `Load failed`、响应体读取失败或其他 transport 错误时，本轮仍严格只发送 1 次生成 POST，绝不自动重试。若失败 profile 原本为 stream=true，仅暂存一个“所有其它参数完全相同、只把 stream 改为 false”的兼容 profile；只有玩家明确点击“重新生成兔子镜”才会发送下一次请求。
- 新增同参数 non-stream profile 对：保留 system/user 消息结构、temperature、`max_tokens` / `max_completion_tokens` 字段，只切换 stream。修正旧 `*_nostream` 命名把 temperature 和 token field 一并改变的问题；旧 profile 名仍保留兼容读取。
- 失败诊断新增 `transport-fetch` / `transport-body` 与 `nextProfile`，错误框会明确告知本轮 1 次请求、不会自动重发，以及手动重试将尝试的非流式模式。
- 不修改 Prompt、成人内容规则、维修兔、宽度链、Gemini 请求策略、黑名单、配色、交互或缓存身份；不新增 Observer、轮询、网络请求或自动 retry。

# 1.3.101 TEST / RC

- 独立 API 单次请求契约：一次自动兔子镜最多只发送 1 次正文生成 POST。删除 1.3.100 的 transient 自动补救、同轮 profile fallback 与空流自动切非流式重发；HTTP/网络/解析失败均结束本轮并显示可手动重新生成的错误。
- 保留历代 API 兼容成果：12 套 system/user、token 字段、temperature、stream/non-stream profile 不删除。参数/流式兼容失败时只把“下一候选 profile”暂存到本地；只有玩家明确点击“重新生成兔子镜”时，下一轮才使用该候选，因此每次点击仍只有 1 次 POST。语义完整成功后继续记忆已验证 profile，后续自动兔子镜直接复用成功组合。
- 防旧版无限请求回归：新增 exact chat+mesid+swipe+sourceHash 失败闸门。某一轮失败后，即使 SillyTavern 再次触发 MESSAGE_UPDATED / CHARACTER_MESSAGE_RENDERED / GENERATION_ENDED 等事件，也不会为同一正文重新自动 POST；玩家手动重试会清除此闸门，若再次失败则重新锁住。
- 防双击重复计费：同一 exact identity 已有 pending/global flight 时，即使再次点击手动重说也复用现有 task，不会 cancel 后另起第二个并发请求。
- 启动速度：在保留 DOM streaming / 宿主生成事件强门控的前提下，将弱生成 flag 宽限从 30s 降至 8s、普通正文稳定窗从 1400ms 降至 800ms、弱证据稳定窗从 4500ms 降至 1500ms、前 15 秒轮询粒度从 760ms 降至 350ms；正常收到生成结束事件时，副 API 可更快启动。
- 等待失败不静默：消息身份连续无法重建到 60s 时也显示明确错误与“重新生成兔子镜”入口，并明确该轮 0 次副 API 请求。
- 不修改 Prompt、维修兔、模型列表 UI、配色、黑名单、独立 API URL 归一化、SillyTavern 内置 custom generate 通道、5 分钟请求 timeout 或成品挂载结构。

# 1.3.100 TEST / RC

- 独立 API：修正 1.3.99 对临时网关/连接失败“第一次失败即结束”的过度收紧。明确的 408/502/503/504/520/522/523，以及带网关/连接临时故障证据的 500，可在同一个 single-flight / runId 内对同一 profile 自动补救 1 次；补救前短暂等待 1.6 秒。
- 防无限请求：临时补救预算是整个逻辑请求共享的硬上限 1 次，不按 profile 重置；第二次仍失败立即结束并显示现有错误，不从 `finally()`、宿主事件或生成轮询另起新一轮。参数不兼容仍只走固定有限 profile 列表。
- 防重复计费边界：429、鉴权、额度/余额、普通未知 500、HTTP 200 已收到非空但无法解析的流/正文均不进入临时自动重试；真正参数错误仍按兼容 profile fallback，真正空流仍保留原有一次非流式兼容兜底。
- 保留 1.3.99 的 `upstream`/`stream` 误判修复和弱生成/正文稳定超时提示；不修改 Prompt、维修兔、模型列表、配色、黑名单、挂载链或生成调度。

# 1.3.99 TEST / RC

- 独立 API：修正兼容参数判定中 `/stream/i` 会误命中 `upstream` 的问题。HTTP 500 现在只有在“已知请求字段 + 明确不兼容词”同时出现时才允许 profile fallback，普通网关/上游 500 会立即停止，避免全 profile 扇出和潜在重复计费。
- 独立 API：弱生成标志/正文稳定门在 60 秒窗口耗尽后不再裸 `finish()`；现在显示“等待正文稳定超时”，并明确本轮没有发送副 API 请求，可手动重新生成。
- 防回归：保留同一 chat+mesid+swipe+sourceHash 的 pending/global-flight 单飞锁、成功 owner/cache 短路、render-only `hasGenerationWorkFor` 门控以及 `finally()` 不自动再调度，防止恢复旧版“同一正文反复请求/一直生成”问题。
- 其余 Prompt、维修兔、模型列表 UI、配色、黑名单与请求 5 分钟超时边界不变。

# 1.3.98 TEST / RC

- 修复独立 API 的参数 profile 记忆实际从未落盘的问题：只有在 HTTP 成功、正文可解析、完整兔子镜结构与非空主体全部通过后，才调用 `rememberApiProfile()`；下一轮优先复用真正验证过的参数组合。
- 已记忆 profile 不再成为单点失败：仍然优先尝试记忆项，但若供应商能力变化并返回可判定的参数不兼容错误，会继续后续兼容 profile，而不是只试一次就结束。
- 主回复生成门拆分强/弱证据：DOM streaming 与短期宿主生命周期事件继续严格等待；`isGenerating / is_send_press / is_group_generating` 等可能残留的全局布尔值只保留有限宽限，超过宽限后仍要求当前正文指纹额外稳定再启动副 API，避免移动端 stale flag 把请求锁死十分钟。
- 强生成证据持续超过原 10 分钟上限时不再静默 `finish()`；外置占位会明确显示“等待正文结束超时”，允许用户确认正文已结束后手动重新生成。
- HTTP 200 不再直接等同于兼容成功：`error:true`/错误 payload 会按真实语义处理；明确属于参数兼容问题才继续 fallback。真正空的流式 body 可跳过其余 streaming 组合并尝试非流式兼容；若已收到无法解析的流数据或非空成功 payload，为避免重复计费不自动二次请求，而是明确报错。
- 不修改 Prompt、上下文预算、维修兔、模型列表 UI、配色/黑名单、独立 API 5 分钟请求 timeout 或成品挂载链。

# 1.3.97 TEST / RC

- 修复独立 API 模型列表“已拉取 N 个，但下拉只显示少量模型”的 UI 回归。根因是 1.3.90 为支持手动 model ID 改成 `input[list] + datalist` 后，浏览器会按输入框当前值自动过滤原生 datalist；例如后端实际返回 23 个，当前模型字符串只匹配 2 个时，界面看起来就像只剩 2 个。
- 模型选择改为“完整 `<select>` + 独立手动 model ID 输入框”：拉取成功后所有返回模型始终保留在下拉框；从下拉选择会同步写入 model ID；手动填写未出现在 `/models` 中的自定义 ID 仍然有效。
- 拉取失败只重置候选下拉，不清手动 model ID；不新增 API 请求，不修改 `/models` 解析、生成请求、stream/retry、Prompt、维修兔、配色或黑名单。

# 1.3.95 TEST / RC

- 小小维修兔自动安全层新增 `viewport-layout-rescue`，但只在外层兔子镜已展开且根节点存在真实可测宽高时运行；折叠态/0×0 布局直接跳过，继续依赖 1.3.94 的单镜展开巡检在绘制稳定后补查。
- `nested-details-popup-flow-repair` 进入自动安全层时额外要求对应内层 `<details>` 已由用户主动打开；原有候选条件仍必须同时满足 absolute/fixed 内容、hidden/clip 裁切祖先与实际几何/offset 越界证据。手动维修保持原行为，可处理折叠态源码层候选。
- 不提升 `text-clipping-repair`、`mobile-layout-rescue`、`mobile-inline-annotation-flow-repair`、`complete-interaction-library` 或 code/plain/rendered DOM 源码恢复；这些仍需手动确认，避免自动改变内容呈现、状态桥接或消息源。
- 不新增 observer、timer、轮询或额外 toggle listener；复用 1.3.94 已有的“当前消息定点巡检 + 单镜展开补巡检”。Prompt、API、配色、黑名单、维修兔手动完整库均不改。

# 1.3.94 TEST / RC

- 修复“小小维修兔自动巡检”偶发完全不运行：`MESSAGE_RECEIVED / CHARACTER_MESSAGE_RENDERED / GENERATION_ENDED / GENERATION_STOPPED / MESSAGE_SWIPED / MESSAGE_UPDATED / MESSAGE_EDITED` 现在优先定位当前消息做 scoped 工具恢复与巡检，不再依赖 MutationObserver 恰好命中新节点。
- 启动 1.1 秒历史保护期内，如果可靠宿主事件确认是当前新消息，不再把它写进历史 baseline；改为保护期结束后延迟巡检。历史聊天进入时仍不会全量自动维修。
- 自动巡检去重从“只看聊天源码 signature”改为“源码 + 当前 live DOM/checked/open 状态”；同一消息源码未变但 DOM 被重建、clone 或状态结构变化时可重新检查。
- 历史镜面只绑定轻量 `toggle` 监听；用户真正打开某一面时，才对该面补一次 live DOM 巡检。未打开的历史镜面不做重巡检。
- 保留自动模式的安全边界：仍只自动执行不会擅自改变用户展开/选择状态的高置信修复；完整检查发现其余问题时将维修兔标成可维修，交给用户手动确认。
- 当前消息事件解析成功时不再额外触发一次全聊天工具扫描；无法解析消息 ID 时才回退到原有 coalesced 全聊天轻量恢复，避免长聊天性能回退。

# 1.3.93 TEST / RC

- **进入长聊天减负**：`CHAT_CHANGED` 的全聊天工具恢复不再对所有历史兔子镜同步执行嵌套 `<details>` 的 `getComputedStyle / getBoundingClientRect` 候选检测；历史镜面只恢复轻量监听与已持久化的维修标记，真正的重布局判断延迟到该嵌套折叠被打开，或外层兔子镜打开时其中已有折叠处于 open 状态后再执行。
- `CHAT_CHANGED` 的历史工具恢复也不再为每面历史兔子镜计算完整 `outerHTML` 自动维修指纹或排队自动维修；自动安全维修继续只在新生成／新渲染的 scoped message 路径运行。
- 新生成/新渲染消息仍保留原来的即时嵌套交互检测，避免为了性能牺牲当前镜面的可用性；clone/cache 恢复后的 live listener 会重新绑定，同一 live DOM 不重复叠加。
- README / LICENSE 补充 AI 与二改边界：不授权把仓库链接、源码、源码压缩包、规则、母本或实现逻辑提交给生成式 AI / 代码生成工具，用于仿制、替代、生成初始版或继续开发衍生项目；并明确“先做初始版、后导入源码”不构成独立开发授权。
- 不修改 Prompt、配色冷却、黑名单、独立 API stream/retry、pure-external 宽度救援或维修兔实际修复算法。

# 1.3.92 TEST

- 正式版前稳定性收口：跟随主 API 的横向裁切急救不再在全聊天工具刷新时同步读取历史镜面布局；改为仅给 live `<details>` 绑定轻量 toggle，镜面实际展开并完成一帧绘制后才检测当前镜面。收起状态不会先清空已有 transient 修复；维修兔关闭时已有监听也立即失效，重新开启无需重复叠监听；独立 API 外置链继续走原有专用入口。
- 独立 API Base URL 正规化改为按 URL pathname 处理：新增 `/models` 完整端点剥离，query 参数保留在请求末尾，hash 丢弃；`/v1`、`/v2`、`/v4`、`/v1beta` 等显式版本仍被尊重；交给 SillyTavern 的 `custom_url` 复用同一正规化，避免 query 场景再次把完整端点当 base。
- 独立 API 成品在绕过 SillyTavern 消息净化链并挂入 DOM 前增加安全边界：删除 script/iframe/object/embed/link/meta/base、所有 `on*` 与 `srcdoc`，剥离 javascript/vbscript/data:text/html 危险 URL；保留 checkbox/radio/label/details/style/svg 等兔子镜 CSS-only 交互与视觉结构。同一边界也用于跟随模式热更新/BFCache 从消息源码恢复 DOM 的路径。
- CSS 隔离收口：删除 `@import`（含 CSS 转义写法），防止外部样式绕过逐镜 selector scope；递归 at-rule 同样按 CSS 标识符规则识别，转义 `@media/@supports` 不再漏过内部 selector scope。已有 scope 只有在当前镜面的精确 token 位于安全起点且不以兄弟/column combinator 向外逃逸时才跳过前缀；泛化 `[data-rabbit-mirror-css-scope]` 与跨镜 selector 不再生效。
- 删除未被任何运行路径读取的 `includeSafetyPatch` 默认死配置。
- 未改 Prompt 内容、Lannuomi 副 API 行为层、API stream/retry、维修兔修复主体、配色/黑名单、pure-external 宽度救援。

## 1.3.91 TEST — Base URL 剥离误填端点路径 / 跟随模式补齐横向裁切自动急救

- 修复用户把文档里的完整请求地址整条粘进「Base URL」时仍然 404 的问题。1.3.90 已修好「结尾是版本段就不再补 /v1」，但若用户填的是 `https://open.bigmodel.cn/api/paas/v4/chat/completions`，结尾不是版本段，仍会再补一次 `/v1`，拼出 `.../chat/completions/v1/chat/completions`。其报错形态与补 `/v1` 修复前完全一致，极易被误判为没修好。
- `normalizeBase()` 新增 `stripKnownEndpointPath()`：规范化阶段循环剥离结尾的 `chat/completions`、`completions`、`responses`、`messages`、`embeddings`（最多三轮，覆盖 `/v1/chat/completions` 这类连续两段的写法）。只剥端点动词，绝不剥 `/v1`、`/v4`、`/v1beta` 等版本段。
- 覆盖验证：智谱正确填法与误填完整路径、DeepSeek 两种填法、OpenAI 完整路径、Anthropic `/v1/messages`、Gemini `v1beta`、Kimi `/v1`、结尾斜杠、本地数字 IP，共 10 种输入全部拼出正确地址。
- 补齐跟随模式（主 API）的横向裁切自动急救。该模块此前只挂在独立 API 的 `ensureExternalTools()` 上，跟随模式的兔子镜只有用户手动点维修兔时才会执行，同一故障在两条链路上的自愈能力不一致。现在在两条链路共用的 `installMaintenanceRabbitsInScope()` 中补上，受维修兔开关约束。
- 该模块自身已按「窄视口 + 真实 `scrollWidth` 溢出证据」严格门控，桌面端与无溢出时是廉价空跑；且完全幂等（每次先撤回上一轮 transient 产物再重新实测），与独立 API 侧重复执行无副作用。
- 不新增 observer / timer / 轮询；不改 Prompt、不增加 Token、不新增 API 请求；未改动独立 API 请求与重试链、外置几何、配色冷却、黑名单与抽签记录。

## 1.3.90 TEST — 独立 API 版本路径兼容 / 手动模型 ID

- 修复独立 API Base URL 被固定补 `/v1` 的兼容性缺陷。若用户地址已经以 `/v1`、`/v2`、`/v4`、`/v1beta` 等显式版本段结尾，兔子镜尊重该版本并直接拼接 `/models` 或 `/chat/completions`；未带版本段的既有地址仍默认补 `/v1`，保持旧配置兼容。
- 模型控件由只能依赖 `/models` 的下拉框改成“可手动输入 + datalist 建议”。模型列表能拉取时提供候选；拉取失败、返回空列表或服务根本不实现 `/models` 时，不清空已填写模型，用户仍可直接输入 model ID 并生成。
- “测试连接”仍以 `/models` 为无付费检测，不伪造成功；当模型列表不可用但已填手动 model ID 时，明确提示可直接生成验证，而不是阻断配置。
- 不增加自动生成请求或重试；不修改副 API Prompt、stream/参数兼容重试、维修兔、宽度救援、折叠交互、配色冷却和随机黑名单。

## 1.3.89 TEST — Lannuomi 原文保留 + 副 API 执行边界

- 将用户提供的完整 Lannuomi 文本逐字保存在 `data/independentBehaviorPatch.js` 的 `LANNUOMI_REFERENCE_TEXT` 中，作为项目参考文本。
- `LANNUOMI_REFERENCE_TEXT` 不进入任何模型 Prompt；副 API 仍只注入 `INDEPENDENT_BEHAVIOR_PATCH`，主 API 继续 0 注入。
- 未修改展现形式、视觉、交互、配色、维修兔、独立 API 请求/stream/重试、宽度救援或折叠修复。

## 1.3.89 TEST — 副 API 专用创作行为层

- 旧 `data/safetyPatch.js` 在 1.3.87 中没有任何 import/call site，实际未进入主 API 或副 API Prompt；本版移除该死代码，替换为 `data/independentBehaviorPatch.js`。
- 新行为层只在 `callIndependentApi()` 组装副 API system prompt 时注入；主 API / 跟随注入的 `promptBuilder` 不引用它。
- 行为层只负责响应姿态：直接生成、减少无关说教/警告、不无故柔化、不擅改人物关系/冲突/审美/剧情方向；不重复兔子镜已有的展现形式、视觉、交互、配色或输出规则。
- 副 API Token 计量同步计入该行为层，避免设置页低报兔子镜自身 Prompt。
- 除版本缓存字符串外，不修改 1.3.87 的宽度救援、折叠交互、维修兔、配色冷却、随机黑名单或 API 请求/stream/重试逻辑。

## 1.3.87 TEST — 短全局视觉地板 / 折叠交互重绑定与首次展开减卡顿

- 基于 1.3.86 实际源码继续修改。把「全局成品完成度地板」与默认「配色构成下限」合并为一条短「全局视觉地板」：展现形式与媒介本体继续决定具体长相；只要求主次、比例、空间、材质、信息组织、细节与配色符合本轮媒介/内容，配色不得平均竞争，并禁止为了“高级感”固定套用某一种布局、材质、视觉效果或配色。删除主 Prompt 与独立 API near-output 中重复的主色相≤2 / 高彩≤10% 等固定数值地板；配色冷却、米黄/暗底重复识别与既有色彩组织规则保持。
- 审计可折叠交互发现一个真实的重绑定缺口：`installNestedDetailsFallback()` 过去把 `data-rabbit-mirror-details-fallback=true` 当作监听器仍存活的证据，但 DOM clone / HTML 序列化只会保留 data 属性，不会保留 `addEventListener`。因此维修、缓存恢复或重新挂载后的镜面可能带着“已安装”标记却没有兜底监听器，内部 `<details>/<summary>` 在宿主/WebKit 原生切换失灵时就会出现点不开。全高替换式内部 details 的“点击内容返回上一面”也存在同类 `bound` 标记残留问题。1.3.87 两处都改用 live DOM 上不可序列化的 handler/binding 记录作为真实性判断；克隆/重挂载会重新绑定，同一 live DOM 重复扫描不会叠加监听器，子内容被真正替换时也会移除旧监听并绑定新内容。
- 独立 API 外层折叠还有一个首开展示卡顿风险：1.3.86 在 native `toggle` 回调里同步跑完整 interaction rescue library，复杂镜面会让 Safari 在完成这批 DOM/CSS 扫描前无法先绘制已展开正文，成功点击看起来像“没点开/卡住”。1.3.87 保留 collapsed 历史镜面延迟激活策略，但打开时先做必要宽度校正，再让浏览器完成一次绘制，随后立即执行完整交互急救和横向裁切复测。没有新增 observer、轮询或 API 请求。
- 不修改维修兔的维修模块本体、米黄/黑色冷却、pure-external 宽度判定、独立 API 请求/stream/重试、抽签黑名单或通用作品子元素宽度。

## 1.3.86 TEST — 全局成品完成度地板 / 展现形式优先的反模板约束

- 基于 1.3.85 实际源码继续调整生成 Prompt；不修改 1.3.84/85 的 Safari pure-external 宽度救援、米黄/黑色冷却、独立 API 请求、维修兔、交互与抽签黑名单。
- 新增始终适用的短「全局成品完成度地板」：展现形式与媒介本体决定成品具体长相；地板只负责主次、比例/空间、信息组织与材质逻辑等质量下限，不提供统一布局模板，也不得覆盖、削弱或现代 UI 化本轮展现形式。
- 明确圆角、投影、渐变、发光、玻璃拟态等只是可选手段：当本轮媒介天然适合时可以充分使用，但不得被当作固定的“高级感公式”。因此高级毛玻璃 UI 仍可正常生成，同时不把所有媒介收敛成玻璃卡片。
- 明确禁止预设标题区、卡片区、信息栏、三段式或统一组件顺序；构图、密度、留白、形状与交互方式必须从本轮媒介和内容重新决定。原先视觉编辑完成度规则里的“固定三层”改成非固定的主次/空间/工艺补足，降低模板化诱导。
- 「高级感」不再固定对应任何单一配色、材质或设计流派。配色构成下限仍限制色相家族与明度/光源关系，但不再绝对要求所有大面积区域低彩度：若媒介本体天然依赖高彩度色域，可突破“高彩度≤十分之一”的面积限制，但必须保持明确主次，避免多个高彩度色相平均竞争。
- 独立 API 的近输出执行锁同步加入压缩版全局完成度地板，避免长上下文把“展现形式优先、地板只管质量”的关系冲淡。

## 1.3.85 TEST — 配色构成下限 / 解除冷却与色彩组织的指令冲突

- 修复既有「色彩组织」与「配色重复冷却」之间的直接冲突。色彩组织写明「不得为了避免重复或追求独特强行改变色相」，而重复冷却要求「明度、冷暖、色相、饱和度四项中至少有两项必须发生可见变化」。模型在互相矛盾的指令下最常见的反应是随机化，随机换色相恰恰是产出不协调配色的最短路径——表现为在「颜色单一」与「乱换配色」之间跳。
- 重复冷却改为只负责「不重复」：不再规定要改动几个维度，改为要求重新从本轮展现形式的材质、环境与光线关系推导配色，让色相自然落到不同家族；并明确「若重新推导后仍落回同一家族，说明推导过度依赖默认审美而非本轮媒介」。与色彩组织的约束方向从此一致。
- 新增「配色构成下限」，始终发出，不随视觉提示词编辑开关变化。既有色彩组织六条方向正确但全是形容词（「有限」辅助色、「清晰」分层、面积「克制」），模型无法执行形容词。这里把真正区分高级与普通配色的四件事翻译成可检验特征，与 1.3.72 的「成品完成度下限」同一思路：
  - 主色相不超过 2 个；连同中性色系在内，全画面色相家族不超过 3 个。
  - 主承载面与其余大面积区域使用低彩度色；高彩度只允许出现在强调元素上，总面积不超过画面十分之一。
  - 主承载面、正文、次级文字三者之间必须存在可辨认的明度差；不得用色相差异代替明度差。
  - 阴影与高光的冷暖须来自同一个光源假设。
- 构成下限排在冷却之前；冷却段落明确声明「换家族不解除配色构成下限」，避免换色相时把结构要求一并丢掉。同一套下限以压缩形式进入近输出执行锁，独立 API 路线同样覆盖。
- Token 开销：构成下限约 167 token，始终发出；冷却段落改写后长度基本持平。
- 不改独立 API 请求/stream/重试、维修兔排版与交互链、横向裁切急救、黑名单与抽签记录、外置几何。

## 1.3.84 TEST — pure-external 尺寸意图豁免 / 米黄吸引子识别补强

- 基于 1.3.83 实际源码继续修正 Safari/iOS 手机版 independent pure-external auto-root rescue 的作者尺寸意图判定。
- `max-width/max-inline-size:100%` 与 `none/initial/unset/revert/revert-layer` 视为通用包含/非约束声明，不再误判为“作者要求保持窄宽”；明确 `width:320px`、`max-width:800px`、`fit-content` 等真实尺寸意图仍会阻止 rescue。
- 配色审计发现 1.3.52 的“米黄/奶油吸引子”仍有 HSL 饱和度盲点：标准 beige/ivory/old-lace/cream 在接近白色时 HSL saturation 可呈中/高值，导致不能合并为同一重复家族。现在保留原低饱和判断，并把高明度的暖橙/黄/中性色家族合并进 cream-attractor；粉色、冷色不受影响。
- 黑色/近黑识别与五轮暗底冷却保持原逻辑；本版不增加副 API 重试、不新增请求，也不为了配色强制重生成。
- 未修改维修兔、horizontal clip、external lane 几何、Prompt 主结构、独立 API 请求/stream/重试、抽签黑名单或交互修复。

## 1.3.83 TEST — Safari 手机版 pure-external 正文根 auto-width 定点修复

- 基于 1.3.82 实际源码，仅修复独立 API `pure external` 在 Safari/iOS 窄屏下的正文直接根元素异常 shrink-to-fit；不再改 external lane 几何。
- 运行时 A/B 已证明：同一消息、同一 HTML 下 host / details / `::details-content` 均为约 367px，但 pure-external 的无显式宽度正文根会被 Safari 算成约 254px；显式 `width:100%` 可立即恢复，切回 `auto` 又复现。
- 新增高置信 auto-root rescue：仅 `independent + placement=external + ready + details 已展开 + viewport < 900px`，且正文根必须是普通 block/flex/grid/flow-root/list-item、非 absolute/fixed、非 float、无明显水平 margin、实际宽度低于可用 content lane 的 84%。
- 尊重作者尺寸意图：正文根自身 inline style 或本镜作者 `<style>` 若声明 `width / inline-size / min/max-width / min/max-inline-size`，即跳过；固定 280px/320px、`fit-content`、明确 `max-width` 等设计不被拉宽。RabbitMirror 自己带 `data-rabbit-mirror-*` 的维修/救援 style 不计为作者尺寸意图。
- 命中后只给正文直接根补 `width/inline-size/max-width/max-inline-size:100%` 与 `box-sizing:border-box`，并在写入后复测；若未恢复到至少 94% 可用宽度立即撤回，不保留无效补丁。
- 修复是 transient：复用既有 baseline 机制，不写入缓存/聊天 metadata；切回 external_then_inline 或真实 viewport 跨到桌面断点时恢复原始 inline style。
- 展开镜面复用既有 toggle/interaction 激活路径，不新增 observer、轮询或新的事件监听；横向裁切维修兔仍保持原逻辑，只在 auto-root 宽度纠正后照常运行。
- 未修改 Prompt、Token、独立 API 请求/stream/重试、黑名单/抽签、embedded/inline、follow-current、维修兔实现或内部作品子元素通用宽度规则。

## 1.3.82 TEST — 手机版 pure-external 与 external_then_inline 同 lane

- 基于 1.3.81 实际源码，仅调整手机版独立 API 的 pure-external 外层几何。
- pure-external 不再把 `.mes_text` 的测量宽度作为外壳宽度 authority；改为直接使用与 external_then_inline 相同的 structural content lane（通常是 `.mes_text` 的 containing block / `.mes_block`）。
- `.mes_text` 宽度仍保留为只读诊断值，不再写入 `--rm-external-lane-width`。
- 这次不修改 `<details>` 内部作品宽度：280px 票根、320px 舞台、固定 SVG、满宽或超宽作品都继续尊重模型自身 CSS。
- 保留 1.3.81 的 geometry cycle / 420ms + 1500ms 诊断复测，但 canonical structural lane 立即生效，不允许旧的 message-text last-known-good 再把 pure-external 拉窄。
- 未修改 external_then_inline、embedded/inline、维修兔、horizontal clip rescue、Prompt、Token、独立 API 请求链。

## 1.3.80 TEST — 手机纯外置正文 lane 共识纠偏 / 两次 settle 复测真正执行

- 对比正式 1.3.20 与测试 1.3.77 后定位：正式版 pure-external 始终跟随稳定父 lane，容易偏宽；1.3.77 手机端改为优先当前 `.mes_text`，方向更接近正文，但某些 iOS/缓存恢复帧会把临时偏窄的正文盒子当成最终宽度并写进 `--rm-external-lane-width`。
- 新增有界 nearby-message lane consensus：只在窄屏、当前 `.mes_text` 可测且明显比附近普通消息正文比例更窄时触发；最多检查相邻 8 个 sibling 位置、收集最多 4 条有效消息，至少 2 条且宽度比例 spread ≤0.14 才视为稳定共识。纠偏使用中位宽度比例与中位左 inset，不直接回退正式版的整块父 lane，因此避免从「过窄」跳成「过宽」。
- 正常当前 `.mes_text` 与附近消息一致时完全不改，仍保持 1.3.51 以来「手机纯外置跟随正文 lane」的设计；没有可靠邻近样本时沿用既有 body/lane fallback。
- 修复 `scheduleExternalHostGeometrySettleRecheck()` 的逻辑遗漏：旧代码只有 420ms 复测已经改变宽度时才会安排 1500ms；若布局在 420ms 之后才稳定，第二次复测永远不会发生。现在 420ms 与 1500ms 两次都会真正执行，仍然是每个 host 每次挂载最多两次一次性 timeout。
- 不修改内置/外置后内嵌宽度，不修改模型生成的内部视觉宽度，不新增 observer、resize listener、轮询或全聊天扫描；Prompt、Token、API、黑名单、挨打猫、维修兔交互链保持不变。

## 1.3.77 TEST — 撤回 1.3.76 正文缩宽步骤 / 横向裁切只开滚动

- 修复 1.3.76 新增横向裁切急救的回归：当模型有意使用固定宽度视觉舞台、轨道、网格或其它语义内容时，第一层 `min-width:0 / max-width:100%` 会把正常内容主动压成父容器宽度，出现“标题仍宽、正文突然变窄”。
- 删除横向急救对内容 contributor 的宽度改写。确认存在真实横向溢出、有意义内容越界且最近祖先 `overflow-x:hidden/clip` 后，只把该最近裁切祖先改为 `overflow-x:auto`；作者原本的固定宽度、网格比例与视觉几何保持不变。
- 继续保留 1.3.76 的高置信装饰跳过、已有 scroller 跳过、只在窄视口/展开镜面运行、transient 不持久化与诊断统计。
- 不修改独立 API 请求、Prompt、Token、黑名单、挨打猫、维修交互链或桌面布局；不新增 observer、resize 监听、轮询或全聊天扫描。

## 1.3.76 TEST — 移动端横向裁切急救（单独一版，只修有真实裁切证据的最近祖先）

- 只处理一种形态：窄屏下确实存在横向内容溢出，而最近的祖先用 `overflow-x:hidden/clip` 把它裁掉，用户既看不到完整内容也无法横向滚动。不覆盖「外置几何把整面镜子量窄」——那是 1.3.75 几何复测的职责。
- 触发条件按序收紧：手机窄视口（≤640px）→ root 可见 → 语义候选预筛（跳过插件自身 UI 与无子元素容器，上限 140）→ 真实几何溢出（`scrollWidth - clientWidth ≥ 8px`，不靠 CSS 猜）→ 最近裁切祖先 computed `overflow-x` 必须为 `hidden`/`clip`。`getComputedStyle` 只对确认溢出的少数容器调用，不对全部 descendants 无差别执行布局读。
- 装饰判定要求组合证据，不使用单信号 OR：必须同时满足脱离文档流（absolute/fixed）、无有意义文本（压缩后 <12 字）、无交互后代、无正文／状态语义，再叠加 `pointer-events:none` 或明显小装饰尺寸（≤64px）才升级为高置信装饰。`img/video/iframe/canvas/svg/picture/object/embed` 及包含它们的容器一律按内容处理，不因无文本判装饰。
- 确有溢出但找不到任何明确的有意义正文越界贡献者时保守跳过，不改动 `overflow`，并计入新增的 `horizontalClipSkippedUncertain`。
- 修复分两层且顺序保守：先只修内容自身的可收缩性（`min-width:0` / `max-width:100%` / `box-sizing:border-box` / 子项 `min-width:0`）；若真实溢出已消除则停止，不碰祖先。仅在仍存在明确横向裁切时才改最近裁切祖先，且只改 `overflow-x:auto`，按原 computed 值保留 `overflow-y`（`hidden`/`clip`/`scroll`/`auto` 原样保留，规范上已计算为 auto 的 `visible` 归一到 auto），绝不把整个 `overflow:hidden` 粗暴改成 `overflow:auto`，也不解除纵向裁切。
- 幂等：每次执行先整体撤回上一轮 transient 产物再重新实测，连跑多次不会继续叠加。
- 完全不持久化：不写任何 marker、不做 rehydrate，因此不会出现「marker 还在但修复能力没恢复」。全部产物统一使用专用前缀 `data-rm-hclip-*` 与独立的 `<style data-rabbit-mirror-horizontal-clip-rescue>`，不复用既有 mobile / viewport rescue 的持久化标记。
- `stripIndependentTransientLayoutArtifacts()` 在读取 `preserveMaintenance` 之前无条件清理这些产物，因此即使 root 带 `data-rabbit-mirror-maintenance-persisted-layout="true"` 也不会被保留；手动维修触发的持久化路径（`scrubIndependentInteractionState()`）同样无条件剔除，不会被序列化进缓存或聊天 metadata。
- 折叠的历史镜面不做深度几何扫描：已展开的 ready 镜面立即检测，折叠镜面复用 `armExternalInteractionTools()` 既有的 ready / toggle 首次激活路径，在真正展开后才检测。不新增 toggle、resize、MutationObserver、ResizeObserver 或轮询。
- 诊断新增：`horizontalClipCandidates`、`horizontalClipRepaired`、`horizontalClipSkippedDecorative`、`horizontalClipSkippedExistingScroller`、`horizontalClipSkippedUncertain`，并输出实际修改的祖先定位、修复前后的 `overflow-x/y` 与 `scrollWidth/clientWidth`。
- 不改 Prompt、不增加 Token、不新增 API 请求；不改动 desktop 健康布局；未修改任何既有维修兔模块，仅新增 `horizontal-clip-rescue` 一条。

## 1.3.75 TEST — 外置几何冷启动复测 / 🎲 按钮保留 / 本地状态生命周期三项修复

- 修复「退出很久重新进入变窄、出下一条回复又自己恢复」。`runQueuedExternalHostGeometryRefresh()` 的宽度签名守卫只在浏览器宽度真的变化时才允许重算几何，这在稳态下正确；但页面刚加载时第一次测量常常发生在字体、头像与主题 CSS 尚未稳定的时刻，量到偏窄的 `.mes_text` 盒子并写入 `--rm-external-lane-width` 后，`innerWidth` 一直不变，这个偏窄值再也不会被更正，直到下一条回复重新挂载 host。
- 新增 `scheduleExternalHostGeometrySettleRecheck()`：挂载／缓存恢复完成后做最多两次定点复测（420ms、1500ms）。首次复测结果与首测一致即停止，不安排第二次；每个 host 每次挂载只安排一轮，重复调用 `ensureExternalTools()` 不会累积定时器。首测被推翻时同步让宽度签名失效，避免后续 resize 因签名相同被跳过。不新增 MutationObserver、ResizeObserver、addEventListener 或轮询。
- 🎲 按钮在没有抽签记录时不再消失。1.3.65 收紧 `getRabbitMirrorRecipe()`（Swipe 已知时只认该 Swipe 的精确记录，避免上一个 Swipe 的配方冒充当前正文）是正确的，但 `ensureRecipeButton()` 当时直接删除按钮，导致所有没有精确记录的兔子镜——尤其是记录功能上线前生成的全部历史镜面——看起来像功能整个消失。现在按钮保留，标题改为「本轮抽签：这一面没有可读取的记录」，点开沿用既有提示。
- 修复 stale pending 污染冷却历史。`pendingTs` 此前只写入、从不读取；生成被取消、请求失败或页面刷新后，pending 会一直留在 localStorage，之后任意一面兔子镜渲染完成都会把这个从未生成过的组合当作本轮结果写进正式历史，并把新镜面的视觉指纹贴到旧组合上。现改为双判据：页面会话标记不同即确定丢弃；同会话内超过 12 小时上限兜底丢弃。该上限远大于任何仍可能完成的生成（副 API 单次 5 分钟 × 最多 12 次 profile 回退 ≈ 60 分钟；跟随模式无自有超时），宁可漏判也不误杀慢请求。
- 修复 scoped store 的读路径写放大与外来 chat 桶永不回收。读路径改为只做内存过滤、不再写盘；回收挂到 `recordGenerationAttempt()` / `setDirectiveScopedPick()` 本来就要写盘的时刻，每次额外回收一个已整桶过期的外来 chat，无需定时器且回收速度与使用频率成正比。
- 修复 `writeScopedStore()` 配额失败后无恢复。仅在确认为容量类错误（QuotaExceededError / NS_ERROR_DOM_QUOTA_REACHED / code 22 / 1014）时丢弃最旧的外来 chat 桶并重试一次；SecurityError、存储被禁用等非容量错误保持原样告警返回，不删除任何数据、不重试。永不动当前 chat 的数据。
- 不改 Prompt、不增加 Token、不新增 API 请求；不改独立 API 请求／stream／重试／超时；未改动维修兔排版与交互链、配色冷却、黑名单候选池。

## 1.3.74 TEST — 动画移动交互与维修工具重建

- 修复持续旋转/移动的小型 label 在部分 Safari/WebView 中 pointerdown 与 pointerup 之间发生位移，最终 click 被浏览器丢弃、导致隐藏 radio/checkbox 无法切换的问题。仅对“小命中区 + 动画移动 + checked 已证明存在第二层内容”的高置信结构启用 pointer 补偿；正常 click 成功时不重复触发。
- 修复维修兔对独立外置 `<details>` 执行 clone+replace 时，先移除运行时工具后调用 `refreshRabbitMirrorToolsInScope(details)`，但根节点发现器只搜索后代、不包含 scope 自身，导致维修兔、挨打猫、抽签按钮可能一起消失的问题。现在 scope 自己若就是兔子镜根节点，也会被纳入工具重建。
- 本版不修改 Prompt、Token、独立 API 请求链、黑名单/抽签逻辑、调色盘冷却，也不新增 observer、timer 轮询或全聊天扫描。

## 1.3.73 TEST — 视觉编辑种子补全与完成度地板收紧

- 个性化视觉提示词继续只开放“成品视觉层”，不开放输出协议、HTML/CSS 安全、手机适配、近期冷却、交互兼容或维修兔工程契约。
- 将额外视觉偏好按 `seed / sketch / detailed` 三档处理：像“毛玻璃”“粉嫩清新”这类短偏好只作为设计种子，模型必须主动补足构图、层级、材质工艺、光线、排版与交互第二状态；已有若干方向的视觉草图只补缺口；接近完整规格的长描述优先忠实执行，不再被“通用高级感”二次改写。
- 完成度下限仍仅在“启用视觉提示词编辑注入”时生效，不做全局常驻，避免无编辑需求时固定增加 Token，也避免误伤本来就应克制的展现形式。
- 重写完成度下限，明确“完成度不等于复杂度”：三层可以由材质、光影、排版、空间或状态形成，不要求额外卡片/面板；极简形式允许克制，但必须靠比例、留白、微纹理和精细边界成立；禁止为了凑高级感退回统一圆角、无意义投影和装饰堆叠。
- 完整规则与近输出执行锁共用同一套完成度定义，避免两处文案以后漂移；近输出继续只做压缩提醒。
- 设置页“额外视觉偏好”占位符改成完整但不冗长的示范句，并明确提示：简单词也可以直接写，系统会把它当设计种子补足未指定维度。
- 不改独立 API 请求/stream/重试、黑名单候选池、🎲 记录、维修兔、排版修复、配色冷却与视觉母本。

## 1.3.72 TEST — 短偏好不再等于简化指令

- 定位「用户写很短的偏好 → 成品反而更简单」的根因：近输出执行锁与可编辑层规则都写着「用户偏好必须成为**整面作品**可明确辨认的视觉主导」。当偏好是「毛玻璃」「低饱和冷色」这类三五个字的材质／色调词时，这条指令的最省力合规方式就是把整面做成一块该材质的面板——**指令本身在要求简化**，而且偏好越短、被提升成整面设计说明的力度越大。
- 「视觉主导」的判定改为**按能否认出，而不是按覆盖面积**：偏好须在主承载面、次级结构、边界与接缝、文字层、交互第二状态之中至少四处留下同一套处理痕迹。同时明确「偏好是处理本轮展现形式的方式，不是替代它」，把整面做成一块该材质的面板视为未完成。
- 新增偏好具体度分级 `visualPreferenceSpecificity()`：≤26 字且 ≤2 个短句判为 `seed`。命中 seed 时追加展开规则，明确告诉模型这是种子而非完整设计说明，其余维度必须由它补足到同等完成度并共用同一套材质与光线逻辑，并列出六条待补维度（构图与视线路径、层级与密度、材质接缝与工艺细节、光源方向与阴影逻辑、排版层级、第二状态如何在同一材质体系内变化）。
- 新增「成品完成度下限」，与偏好无关、开启视觉编辑即生效。用可检验特征替代「要高级」这类无法执行的形容：≥3 层视觉层级、边界不得只有单一 1px 实线、存在可辨认的对齐系统与留白节奏、文字有字号／字重／字距层级、至少一处近看才可见的工艺细节。同一套下限以压缩形式进入近输出执行锁，独立 API 路线同样覆盖。
- Token 开销：有 seed 偏好时约 435 token，无偏好时只保留完成度下限约 168 token；两者都只在开启视觉提示词编辑时发出。
- 不改独立 API 请求/stream/重试、维修兔排版与交互链、黑名单候选池、🎲 记录与配色冷却；未扩大视觉提示词的开放范围。

## 1.3.71 TEST — 可编辑视觉 Prompt 输入上限收紧

- 将可编辑视觉层上限从 `8000 / 4000 / 4000` 收紧为：通用视觉规则 `5000` 字符、额外视觉偏好 `1000` 字符、不希望出现的视觉 `1000` 字符，降低误粘长文本导致每轮 Prompt 膨胀的风险。
- 三个上限统一由 `settings.js` 常量提供，设置归一化、Prompt 构建和设置 UI 共用同一来源，避免界面提示与实际截断值漂移。
- 三个 textarea 增加 `maxlength`，用户在输入阶段即可受到明确上限约束；保存时仍做二次截断保护。
- 不改变默认视觉规则内容，也不改变关闭视觉编辑时的原始 Prompt 路线。未修改维修兔、黑名单、独立 API 请求 / stream / 重试、配色冷却与生成结构规则。

## 1.3.70 TEST — 视觉编辑边界 / 独立 API Token 可见性 / 维修兔 ~ 位置约束

- 修复 1.3.69 近输出视觉执行锁的语义冲突：此前只填写「不希望出现的视觉」时，会形成「避用：XXX；必须主导整面作品」的自相矛盾强锁；现在偏好与避用分开执行，只有偏好要求成为可辨认主导，避用项只负责禁止主动出现。
- 视觉提示词仍只开放成品视觉层，不开放输出协议、HTML/CSS 安全、手机适配、近期冷却、交互兼容与维修契约；设置页明确说明该边界。清空高级通用视觉规则仍允许，但编辑注入开启时保存会使用 warning 明确提示，不再一边显示成功 toast 一边在状态栏警告。
- 补齐独立 API 模式的 Token 可见性：原 Token 面板在独立 API 下固定显示「0 Token」，因此 1.3.69 新增的「可编辑视觉层字符数」对实际常用的独立 API 路线仍不可见。现在独立 API 请求会记录兔子镜自身写入的规则 Prompt 估算，并单独显示聊天／角色卡／世界书等上下文字符数；统计仍是本地计算，不增加模型 Token。
- 修复维修兔 `class-local / generic-local` 的 `:checked ~ target` 错位兜底：原生 `~` 只允许命中控件后方兄弟，但旧 fallback 在直接匹配失败后会查询整个局部容器，可能把控件前面的同类块也当成目标，表现为「点下面 A，上面某块跟着变」。现在 malformed-structure fallback 只在控件后方兄弟区域及其后代中寻找，再保留原 label 代理路线。
- 不扩大视觉提示词开放范围；不改黑名单候选池、抽签记录、独立 API 请求参数/stream/重试、配色冷却、外置几何与长聊天延迟急救。

## 1.3.69 TEST — 视觉提示词编辑三处修正

- 修复「最终视觉偏好执行锁」空转。`compactVisualPreferenceExecutionLock()` 原本只要打开编辑开关就无条件发出；额外偏好与避雷两栏都为空时会退回占位文案「以上用户可编辑视觉层」，向模型强硬要求「必须主导整面作品的绘制、材质、轮廓与界面／装饰语言；第一眼无法辨认该偏好即视为未完成」——而用户根本没写任何偏好。这既白烧 token，也会让模型去猜一个不存在的偏好并压过本轮展现形式本体。现在只有真的填了偏好或避用项才发出。
- 该占位文案在独立 API 路线下还是悬空的：可编辑视觉层在 system prompt，执行锁在 user prompt，「以上」指向的内容不在同一条消息里。
- Token 计量补上可编辑视觉层。`editableVisualChars` 此前在 `promptBuilder` 的 metadata 里算了却从未进入 `tokenMeter` 的字符口径，设置页也不显示；而这一层恰恰是用户唯一能直接把 Prompt 撑大的部分（8000 + 4000 + 4000 上限）。现在与母本补充、共同回忆并列显示。
- 开启编辑后清空「通用视觉审美规则」时给出明确提示。该栏在编辑开启时是整套「色彩组织」与「反通用面板」规则的唯一来源（关闭时由 `legacyPresentationEmbodimentRule()` 内置同样内容）；清空不会报错，但下一面开始这一整层会消失，此前只能靠画面变差才发现。
- 核对通过、未改动：编辑注入 ON/OFF 两条路线默认内容等价（`DEFAULT_VISUAL_PROMPT` 是 legacy 规则的忠实迁移）；`cleanEditableVisualPrompt()` 会剥掉三个包裹标签，用户文本不会破坏 Prompt 结构；执行锁在跟随 API 与独立 API 之间不重复注入。
- 不改独立 API 请求/stream/重试、维修兔排版与交互链、黑名单候选池、🎲 记录与配色冷却。

## 1.3.68 TEST — 聊天内查看 / 管理抽签黑名单

- `🎲 本轮抽签` 浮层新增 `🚫 查看黑名单` 入口，并显示当前黑名单总数。无需离开聊天或进入扩展设置页。
- 新增同浮层黑名单管理视图：按“主题 / 元素”“展现形式”分组列出全部已拉黑项目，支持逐项解除、清空全部、暂停 / 启用黑名单，并可一键返回当前这面的本轮抽签。
- 管理视图复用现有单实例浮层与 outside-close cleanup，不新增轮询或全聊天扫描；名单较长时浮层自身滚动。
- 黑名单仍只过滤本地随机候选池，不向 Prompt 注入禁止文字，不增加模型 Token；不改独立 API、维修兔、排版/交互修复、stream、重试或配色冷却。

## 1.3.67 TEST — 设置页滚动恢复

- 修复兔子镜设置页内容变长后出现“右侧宿主滚动条存在，但兔子镜设置内容无法继续滚动”的问题。设置页此前完全依赖 SillyTavern 外层抽屉滚动；黑名单区加入后总高度增大，部分桌面/浏览器组合会暴露宿主滚动边界问题。
- 兔子镜自己的 `inline-drawer-content` 现在拥有独立、受视口高度限制的纵向滚动区域：桌面鼠标滚轮、触控板和手机触摸均可直接滚动设置内容；不覆盖宿主的展开/折叠 display 状态。
- 黑名单列表保留独立最大高度，但 `overscroll-behavior` 改为允许在列表滚到顶/底后继续把滚动链交给设置页，避免鼠标停在黑名单区域时形成“滚轮陷阱”。
- 修正设置标题水印仍显示 `1.3.62` 的旧版本文本。
- 仅修改设置 UI/CSS；不改黑名单候选池、🎲 记录、独立 API 请求/stream/重试、维修兔、Prompt 或 Token。

## 1.3.67 TEST — 黑名单缓存旁路 / 暂停警告 / 菜单监听清理

- 保留 1.3.65 的三处修复：Swipe 精确绑定、toggle 返回真实状态、删除不可达整池回退。
- 修复「部分点菜 + 另一侧随机」的 7 天 directive cache 可绕过后来新增黑名单：directive cache key 现在包含黑名单启停状态与主题/形式 ID 集合指纹。拉黑后重新生成同一条部分点菜，不再复用含已拉黑随机项的旧组合；明确点菜本身仍可覆盖黑名单。
- 修复展现形式索引里两个不同项目共用 `1.3.3` 的身份冲突：`网站与应用平台` 改用内部唯一 ID `1.3.3.platform`，`评论系统` 改用 `1.3.3.review`。此前两者共用 `1.3.3`，随机实际抽到“网站与应用平台”时，🎲 会因 Map 后写覆盖显示成“评论系统”，拉黑一个也会把两个一起排除；现在新生成记录可独立显示、独立拉黑，原始母本仍通过标题回退取回。旧版已保存的模糊 `1.3.3` 黑名单会安全迁移为同时屏蔽两个新 ID；旧版 `1.3.3` 抽签记录则明确标为“无法区分”，不再冒充具体项目。
- 新抽签记录额外保存当前消息/Swipe 的本地指纹；读取 🎲 时若同一 chat+mesid+swipe 后来已被编辑、截断后复用或替换，指纹不一致就拒绝显示旧配方，避免“键相同但内容已经不是那一条”的陈旧记录再次误导拉黑。1.3.64/1.3.65 的旧记录没有指纹，继续兼容读取。
- 修复暂停黑名单后设置页仍提示“候选已全部拉黑，随机将没有候选”。`themePoolEmpty/formatPoolEmpty` 现在只有黑名单实际启用时才判空。
- 修复 🎲 菜单外部关闭 listener 在键盘/程序化反复开关时可能暂存多个 detached-panel listener：改为单实例 cleanup，关闭菜单和销毁输出净化器时立即解除。
- 修复未来异常/容量上限下 toggle 失败仍可能被解释成“已解除黑名单”：菜单现在比较操作前后真实状态，未变化时明确提示失败，不再谎报成功。当前主题/形式数量仍低于 512 单类上限。
- `selection_recipes` 增加 raw-string 内存缓存；进入长聊天为多面兔子镜安装 🎲 时不再为每一面重复 JSON.parse 同一份最多 600 条记录，避免黑名单功能重新制造不必要的聊天入口 CPU 峰值。
- 黑名单仍为本地候选池过滤，不增加 Prompt / Token；不改独立 API 请求、stream、重试、维修兔排版交互、配色冷却与视觉 Prompt。

- 修复「本轮抽签」跨 Swipe 冒充。`getRabbitMirrorRecipe()` 在找不到该 swipe 的精确记录时，会回落到「同一条消息的任意 swipe」，因此新 swipe（旧版本生成或记录写入失败）会显示上一个 swipe 的抽签结果。用户据此拉黑的其实是别的兔子镜用过的项目。这与 1.3.64 声明的「按聊天 + 消息 + Swipe 绑定」「旧版本生成且没有记录的历史兔子镜不会伪造本轮抽签」直接冲突。现在 swipe 已知时只认该 swipe 自己的记录，找不到就返回 null，由 `showRecipeMenu()` 正常提示「没有可读取的记录」；只有调用方传入 swipeId = -1（确实无法确定）时才保留原回落。
- 修复 `toggleBlacklistItem()` 谎报结果。原实现无论 `addBlacklistItem()` / `removeBlacklistItem()` 是否真的成功都固定返回 true/false，而 `addBlacklistItem()` 在 id 不在索引中（索引升级后旧 id 失效、kind 传错、或到达 512 上限）时返回 false。表现为：🎲 面板弹出「已加入黑名单」成功提示，面板重绘后按钮却仍是「🚫 加入黑名单」。现在返回操作后的真实状态。
- `blacklistPoolStats()` 增加 `themePoolEmpty` / `formatPoolEmpty`，设置页「候选已全部拉黑」警告改用这两个字段。当前 `allowByMode()` 对非 off 模式是直通的，与旧写法等价；但一旦模式重新参与池过滤，只比较总数会在「该模式下候选已被拉黑光」时漏报，随机主题静默变空而没有任何提示。
- 清理 `pickCombination()` 里两行不可达的「整池恢复」兜底：条件写成 `!pool.length && blacklistEnabled === false`，而该状态下 `filterRandomXxxPool()` 已原样返回整池，池为空只可能是 `allowByMode()` 自己筛空的，恢复出来仍是空——在任何可达状态下都是 no-op。留着的真实风险是后来者误以为它是安全网而把条件反过来，从而把用户明确拉黑的项目重新放回随机池。用户故意拉黑整池时必须保持空池。
- 核对通过、未改动：黑名单确实是候选池级排除而非 Prompt 文本（不增加 token）；用户点菜与固定动态视觉场景走 `directive.themes/formats` 与 `forcedFormats`，不经随机池，仍高于黑名单；独立 API 的 `requestSelectionDiagnostic` 确实带 `themeIds`/`formatIds`，🎲 在副 API 模式下可正常记录；整池拉黑不会崩溃，抽签返回空主题。
- 不改动独立 API 请求/重试/stream、维修兔排版与交互链、配色冷却、视觉 Prompt。

## 1.3.64 TEST — 本轮抽签 / 随机黑名单

- 新增标题工具入口 `🎲 本轮抽签`：对有可靠生成记录的兔子镜，直接列出这一轮实际抽中的“主题 / 元素”和“展现形式”内部 ID 与名称；记录来自插件自己的抽签元数据，不使用 AI 事后分析。
- 新增主题 / 元素、展现形式两套精确 ID 黑名单。加入后从下一轮随机候选池中直接过滤，不向 Prompt 追加“不要出现某某”的文字，因此黑名单功能本身不增加模型 Token。
- 黑名单只约束随机抽取；用户明确点菜以及主动开启的固定“动态视觉场景”继续拥有更高优先级，不会被随机黑名单阻断。
- 设置页新增“启用抽签黑名单”、当前黑名单清单、逐项解除与一键清空；可暂时停用而保留名单。若某一候选池被全部拉黑，保持空池并在设置页警告，不会偷偷把黑名单项目重新放回随机池。
- 本轮抽签记录按聊天 + 消息 + Swipe 绑定。跟随当前 API 通过生成快照提交真实抽签记录；独立 API 在成功完成并保存兔子镜时提交记录。旧版本生成且没有记录的历史兔子镜不会伪造“本轮抽签”。
- `🎲` 与现有 🐇 / 🐈 共用标题工具宿主，不新增全聊天轮询；跟随模式记录落地后仅刷新对应消息的工具入口，避免重新引入长聊天全量扫描。
- 不修改独立 API 请求参数、stream、重试、维修兔排版/交互链、配色冷却或视觉 Prompt；黑名单与抽签菜单均为本地逻辑。

## 1.3.63 TEST — 全链路诊断卡死修复

- 修复一次性全链路诊断在特定 Grid / label 结构上永久停留在“正在检查…”的问题。1.3.61/1.3.62 的若干结构判断调用了不存在的 `cssEscape()`；只有命中特定结构时才触发 `ReferenceError`，因此此前语法检查无法发现。
- 三处 label-for 匹配改为直接遍历 `label[for]` 并比较原始 `for`/`id` 字符串，不再依赖 CSS selector 转义，也不会因特殊字符 id 触发 selector 异常。
- 诊断完成阶段增加异常兜底：以后即使某个诊断子模块再次抛错，面板会直接显示 `[诊断内部错误]` 与错误信息并停止诊断，而不是无限停在等待状态。
- “复制诊断＋代码”增加异常兜底；整理源码失败时按钮会恢复并显示失败提示，不再永久卡在“正在整理源码…”。
- 不改变 1.3.62 的确定性 Grid 正文全宽修复、1.3.61 手机/当前视口布局策略、独立 API 请求链或 Prompt；不增加 token。

## 1.3.62 TEST

- 修复电脑端“选择卡正常横排，但下方正文被 Grid 自动挤成一根竖长细柱”的漏判：新增确定性结构识别，不再依赖高宽比、当前可见 panel 或旧维修标记。
- 当同一多列 Grid 内存在 2 个以上状态控件、一个明确跨满整行的 label 选择卡行，以及 2 个以上由 `:checked` CSS 控制的正文型 panel，且 panel 没有作者指定的 grid 位置时，所有结果 panel 自动跨满 `grid-column: 1 / -1`。
- 该修复在兔子镜首次展开/交互激活时执行，不在进入长聊天时对所有历史镜面做重型扫描；手动“排版/内容显示不全”维修也复用同一结构修复。
- 不修改 Prompt，不增加模型 token，不改独立 API 请求/重试/stream 链。

# 1.3.62 TEST — 当前视口排版/裁切闭环，收紧维修兔误修

- 审计 1.3.60 后保留“宽屏必须按当前实际几何判断”的方向，但修正四个遗漏：新定义的滚动属性此前从未被任何元素标记；隐藏的同组状态 panel 不会被修；宽屏自动维修仍会写入整套手机预置；新宽屏候选未进入维修兔 finding，因此自动维修并不会因为“竖长柱”主动选择排版路线。
- `viewport-layout-rescue` 现在只对高置信 Grid 竖长正文跨满整行：父 Grid 至少 480px、正文宽度 <320px 且 <父宽 42%、文字≥60、高宽比≥4，并排除 sidebar/nav/menu/toolbar 等窄栏提示、作者显式 grid placement 和显式窄尺寸约束。
- 已经由“叠层正文互斥”识别的状态 panel 会按同一 Grid 父层成组处理；当前可见 panel 一旦证实被压窄，同组隐藏 panel 一起获得同样的 full-span，切换选项后不会再次变成细长柱。
- 长内容滚动真正落地：对当前可见、正文型容器中真实 `overflow:hidden/clip` 且 `scrollWidth/scrollHeight` 超出 client box 的候选，分别恢复横向/纵向 `overflow:auto`；若同一可见正文里有可交互控件但祖先 `pointer-events:none`，只在该正文容器上恢复 pointer-events。跑马灯/绝对定位视觉层仍跳过。
- 新增当前视口排版 inspection/finding：维修兔可直接报告“当前窗口正文被异常压窄或裁切”，自动维修会因此进入 `text` 路线，而不再依赖手机诊断。全链路诊断新增当前窗口 squeeze/overflow/x/y/pointer 计数。
- `mobile-layout-rescue` 不再在 2500px/3400px 等宽屏先写几十个 `data-rm-mobile-*` 预置。只有当前实际视口 ≤640px 且只读巡逻确实发现 mobile layout 风险时才执行；避免排版本来正常时点自动维修却把未来手机布局一起改掉。
- 独立 API 的 text/style/interaction 手动维修不再在 80/350/900/1800ms 把整套维修库重复执行四遍，只保留一次轻量工具/持久化刷新，降低误修累积和 CPU 峰值。
- 新 viewport layout 样式/标记正式纳入独立 API 维修持久化分类：只有带维修持久化标记的镜面保留；普通运行时缓存不会意外留下。
- 不改独立 API 请求发送、stream、重试、超时、外置挂载、配色冷却和 1.3.57 长聊天延迟激活链。

## 1.3.59-test — persisted stacked-grid migration

- Fix 1.3.58 not reaching some already-repaired historical independent mirrors. The full-width Grid logic itself was correct, but it lived only inside the complete interaction-rescue install pass; older mirrors can retain `data-rm-exclusive-stacked-state-*` ownership markers without necessarily re-entering that detector after an upgrade.
- Add a lightweight persisted-state migration in `ensureExternalTools()`: only mirrors that already own 2+ exclusive-state panels under the same direct Grid parent are considered; the same full-width selector-row proof is required and authored panel grid placement is still refused.
- The migration writes `grid-column: 1 / -1 !important` directly to the already-owned panels and is idempotent. It does not run the complete interaction library, add observers, or scan unrelated historical message DOM.
- Keep 1.3.57 chat-entry performance changes, 1.3.56 radio/stack fixes, maintenance persistence, and palette cooldown unchanged.

## 1.3.58-test — desktop stacked-state grid span repair

- Fix mutually-exclusive state/result panels that were correctly switched but auto-placed into only one column of a multi-column CSS Grid.
- The repair is deliberately narrow: it activates only when the same grid contains 2+ mapped controls, a control/selector row that explicitly spans the full grid (or occupies essentially the full grid width), and result panels with no authored grid placement of their own.
- Result panels receive a reversible `grid-column: 1 / -1 !important`; authored grid layouts are left untouched.
- Keeps 1.3.57 lazy historical-mirror activation/performance changes and all 1.3.56 interaction fixes.

# 1.3.57 TEST — 长聊天进入减负 / 历史外置交互按需激活

- 定位进入长聊天时瞬时卡顿/CPU 峰值：历史独立 API 兔子镜从缓存恢复时，完整 `installIntelligentInteractionRescue()` 交互急救库会在 detached `extractReadyDetails()` 阶段执行一次，挂载后 `ensureExternalTools()` 又执行一次；聊天中历史兔子镜越多，重复 CSS/DOM 解析越集中。
- detached 缓存解析现在只执行 ID / radio name / CSS 引用作用域隔离，不再提前安装完整交互急救 listener。
- 历史 ready 外置镜默认折叠时只挂工具和轻量结构；完整交互急救与维修兔结构 listener 重建延迟到该面 `<details>` 第一次真正展开时执行，并用 live-DOM WeakSet 保证同一节点只执行一次。
- 错误/生成中占位壳不运行完整交互急救；其重试/挨打猫按钮继续使用原直接 listener。
- 输出净化器初始化时删除“立即全聊天装工具后 180ms 再重复同一遍”的冗余第二次全量工具扫描；后续 CHAT_CHANGED / MESSAGE_* 与 MutationObserver 仍保留原合并调度。
- 延迟激活标记为运行时状态，不写入独立 API 永久缓存。
- 保留 1.3.56 `class-local` 精确目标和叠层正文互斥；不修改副 API 请求、stream、重试、超时、缓存身份、外置几何、配色冷却。

# 1.3.56 TEST — radio class-local 精确目标 / 叠层正文互斥

- 根据「黑石深处感官弹幕」1.3.55 全链路诊断确认：上一版 stale inline 清理已生效，但 `class-local` 的单个 `+` 规则仍会在直接兄弟不匹配时退化为父容器 class 查询。baseline/close radio 与其他分支共用 trigger class 时，会把两个 `.rm-focus-node` 同时当成目标，重新制造叠字。
- 单个 `:checked + X` 现在与连续 `+ A + B` 一样保持位置语义：直接兄弟不匹配时仅允许 wrapping-label 代理；普通局部 class fallback 只有唯一目标时才可采用，多个同类目标时直接放弃，禁止扩散到兄弟分支。
- 手机端状态内容解析改为复用同一安全 target resolver，避免窄屏单独走旧的宽松 class-local 路径。
- `叠层正文互斥` 识别新增 `focus` 面板类，并识别同 radio 组中 `data-rm-reversible-radio-initial-checked=true` 的 baseline/close radio 后紧邻默认 panel；三层同一 grid-area 时由该路线独占可见状态。
- baseline/default panel 会在返回状态下强制恢复可见 display；选中其他分支时隐藏。被叠层互斥接管的 controls 不再进入通用 checked visual fallback，避免延迟验证再次把多个 panel 打开。
- 不修改独立 API 请求、stream、重试、超时、缓存身份、外置几何、配色冷却或维修兔持久化链；不新增 Observer、轮询或全聊天扫描。

# 1.3.55 TEST

- 修复同组 radio 切换/独立 API 重挂载后，已 unchecked 的旧分支仍残留 checked 急救 inline `!important`，导致多个 grid/叠层正文同时可见、文字重叠。
- 清理仅作用于维修兔拥有且与该控件自身 `:checked` 声明逐项一致的 stale inline 属性；不修改普通字号、行高或用户原始样式。
- 在 radio 手动切换、延迟校验、可逆返回、程序化 checked 恢复与已挂载镜面初始化时统一清理旧分支。
- 保留 1.3.54 连续兄弟链 `:checked + A + B` 单目标修复、1.3.53 维修持久化和配色冷却。

## 1.3.55

- 修复有 label 的 checkbox 在 `:checked + A + B` 连续兄弟链中，class-local 急救退化为父容器全局查询，导致点击一个选项同时展开多个同类结果的问题。现在连续 `+` 链按当前 input 逐级匹配，只允许命中自己的分支；识别为连续兄弟链后禁止再退回整组容器搜索。
- 兼容生成 HTML 中首个 label class 未完成作用域改写但 `for` 仍明确指向当前 input 的情况，仅允许该显式 label 作为链路第一跳，不扩散到其他分支。
- 删除已废弃且无运行代码依赖的 `SERVER-BRIDGE-INSTALL.txt`，继续使用 SillyTavern 内置 `/api/backends/chat-completions/status` 与 `/api/backends/chat-completions/generate`。

# 1.3.55 TEST — 修正维修兔持久化重挂载 / 保留 1.3.52 双向配色冷却

- 基于 1.3.51 实际源码合入 `files.zip` 的 1.3.52 修复，但不原样采用其中的重挂载实现。
- 修正 1.3.52 `rehydrateRabbitMirrorMaintenanceRepairs()` 的关键遗漏：普通 `installStructuredStaticDisclosureFallback()` 会被已保存的 `role=button/tabindex` 判定为“已有交互”，`installFillInChoiceFallback()` 会被已保存的 count 标记直接跳过，因此两类 listener 实际没有重绑。
- 改为只针对带 `data-rabbit-mirror-maintenance-persisted-layout=true` 的镜面，直接根据已保存的维修标记重建静态选项、静态分段折叠、填空选择的 WeakMap 状态与 click/keydown listener；同一 live root 已重建后不重复绑定。
- 保存独立 API 维修结果时新增 `aria-checked` 净化，并把填空选择的本次已填文字、运行时 aria-label 与 blank code 恢复到生成时基线，避免“修交互”把用户当次选择写死进永久缓存。
- 保留 1.3.52 的四张结构性急救样式持久化、孤儿清理保护、保存失败 debug，以及 hueFamily/temperature/saturation 双向配色重复冷却与 `cream-attractor` 米黄归并。
- 不改独立 API 请求发送、重试、超时、外置几何、compact-shell、MutationObserver、resize/scroll/focus 监听与轮询链。

# 1.3.52 TEST — 维修兔结构性修复可持久化 / 配色冷却改为双向

- 修复独立 API 兔子镜「维修兔修好后刷新又坏、永远修不了」的根因。1.3.43 的 `scrubIndependentInteractionState()` 把维修兔自己注入的四张结构性急救样式表（静态选项、静态分段折叠、填空选择、focus-within 持久桥接）当成运行时污染一并删除，因此每次保存都会把修复结果一起抹掉。
- `PERSISTED_STATE_STYLE_ATTRS` 拆分为 `RUNTIME_STATE_STYLE_ATTRS`（checked 伪元素补丁，仍然永远净化）与 `MAINTENANCE_STRUCTURAL_STYLE_ATTRS`（受 `data-rabbit-mirror-maintenance-persisted-layout` 保护），与 1.3.45 的排版维修保持同一套判定。
- checkbox/radio 当前选中状态、`aria-pressed`、临时 active/selected/open 标记仍然照旧净化，不会被写死进永久缓存。
- 修复第二条链路：`clearOrphanedStructuredStaticDisclosureArtifacts()` 会在 `installMaintenanceRabbitForRoot()` 装按钮的同一步里，把重新挂载后 WeakMap 为空的镜面判成「旧版孤儿标记」而清空。带维修持久化标记的镜面现在跳过该清理。
- 修复第三条链路：静态选项／静态分段折叠／填空选择这三条只登记在维修兔急救库里，挂载链不会调用，而 `addEventListener` 无法随 HTML 保存。新增 `rehydrateRabbitMirrorMaintenanceRepairs()`，在 `ensureExternalTools()` 挂载时按已有维修标记重新绑定，消除「样式还在、点了没反应」的死 UI。该函数只对已带维修标记的镜面生效，不会给没修过的镜面凭空加交互。
- `persistIndependentRepairFromEvent()` 原本有 7 处静默 `return false`，维修保存失败时界面上没有任何痕迹。改为统一 `console.debug` 记录放弃原因。
- 修复「一直出米黄色」。整条配色反馈链原本是单向的：`isDarkPaletteTrigger()` 与 `recentIndependentPaletteGuard()` 都只识别暗色，冷却提示词又持续要求「中／高明度」「非黑主背景」，而米黄是 `brightness:light` + `temperature:warm` + `saturation:low`，永远不触发任何冷却——反黑规则本身把模型推向了唯一的收敛点。
- `classifyPaletteSamples()` 早已计算出的 `hueFamily` / `temperature` / `saturation` 此前完全未被使用（`getRecentPaletteFingerprints()` 是零调用死代码）。新增 `paletteFamilyKey()` / `describePaletteFamily()` / `getRepeatedPaletteFamily()`，配色冷却改为对任何家族一视同仁的双向判定。
- 米黄／奶油／米色／羊皮纸／做旧纸张归为同一个 `cream-attractor` 家族键，避免它们在 orange/yellow/neutral 之间漂移而各自算作不同家族、恰好绕开重复检测。
- 近期视觉避让文本现在会列出每轮实际使用的配色家族；此前模型完全看不到自己上几轮用过什么颜色。
- 不改动外置几何、compact-shell、外置后内嵌、视觉提示词编辑与 1.3.20 性能冻结链；不新增 MutationObserver、focus/resize/scroll 监听或轮询。

# 1.3.51 TEST — 手机纯外置跟随正文 / PC compact 保留

- 手机／窄屏纯外置不再使用固定 `vw` 或固定边距猜宽度。
- 现有外置几何同步在 `<900px` 时优先读取当前消息真实 `.mes_text` 正文区域，纯外置 host 使用同一宽度与横向起点。
- 若正文框尚未稳定，则回退到原 `.mes_block` 内容轨道；CSS 最终兜底仍保留流动宽度，避免空宽度。
- PC 端继续使用原正文轨道，并保留 `compact-shell` 对窄视觉本体的上限控制。
- 未新增 MutationObserver、ResizeObserver、focus 处理或持续扫描；继续使用既有几何同步／双 RAF／120ms settle／真实 viewport resize 刷新链。
- 维修兔、挨打猫、视觉提示词编辑、独立 API 与外置后内嵌逻辑不变。

# 1.3.50 TEST — 手机纯外置 viewport 自适应宽度

- 修复 1.3.49 在部分 iPhone / 外置几何状态下再次缩成窄列的问题。
- 手机／窄屏独立 API 纯外置不再用 `calc(100% - clamp(...))`：`100%` 仍会继承可能已被旧几何快照压窄的父级。
- 改为直接以 viewport 为基准的 `84vw`，即左右约各保留 `8vw`；440px、390px、375px 等屏宽都会连续自适应。
- 手机端继续强制取消 compact-shell 的像素宽度影响；PC 几何与 compact-shell、外置后内嵌、维修兔、视觉提示词、性能冻结链均不改。

# 1.3.50 TEST — 手机纯外置宽度自适应

- 窄屏（<900px）独立 API 纯外置不再固定减去 72px，而改为 `calc(100% - clamp(36px, 16vw, 72px))` 并居中。
- 约 440px 宽手机时仍接近左右各 35～36px；390px 时约 31px/侧；375px 时约 30px/侧；屏幕越小，边距会继续自动缩小，避免固定 36px 把正文挤窄。
- 最大总留白仍限制为 72px，最小总留白为 36px，因此不会重新贴边铺满；内部 `<details>` 继续 100% 填满宿主。
- PC 几何、compact-shell、外置后内嵌、维修兔、视觉提示词以及 1.3.20 性能冻结链均不改；不新增 observer、focus/resize/scroll 监听或轮询。

# 1.3.48 TEST — 手机纯外置宽度对齐外置后内嵌

- 根据同一台 iPhone、同一面兔子镜的并排截图校准：1.3.47 纯外置约只有 16px/侧边距，而外置后内嵌约为 36px/侧。
- 窄屏（<900px）独立 API 纯外置从 `calc(100% - 32px)` 调整为 `calc(100% - 72px)` 并居中，使正文视觉宽度与外置后内嵌一致。
- 内部 `<details>` 继续 100% 填满宿主；标题仍为轻壳。PC 的正文几何、compact-shell、外置维修、视觉提示词和 1.3.20 性能冻结链均不改。
- 本版不修改 `src/independentApi.js` / `src/outputSanitizer.js` 的运行逻辑，不新增 observer、focus/resize/scroll 监听或轮询。

# 1.3.48 TEST — 手机纯外置宿主宽度稳定化 / PC 几何冻结

- 1.3.46 只把纯外置内部 `<details>` 改为 100%，但父级 external host 仍由一次性 `--rm-external-lane-width` 像素快照决定宽度；如果 iPhone 首帧测量时 `.mes_block` 尚未稳定，父级会永久锁在偏窄宽度，因此 1.3.46 对该现象无效。
- 窄屏（<900px）独立 API 纯外置现在直接使用稳定 CSS 内容通道 `calc(100% - 32px)` 并居中，显式覆盖 stale lane-width / compact-width；内部 `<details>` 继续 100% 填满。
- PC 端仍保留原来的正文几何对齐、compact-shell 与宽背景处理；外置后内嵌不变。
- 本版除版本号外不修改 `src/independentApi.js`、`src/outputSanitizer.js` 等运行逻辑；不新增 observer、focus/resize/scroll 监听或轮询。

# 1.3.46 TEST — 手机纯外置正文宽度恢复 / PC 贴合保留

- 修复独立 API「轻壳外置」在 iPhone / 窄屏下，标题壳接近正常宽度但生成正文主体被 `details { width:auto }` 收缩成窄列的问题。
- 在 `<900px` 窄屏中，纯外置 `details` 强制恢复为 `width:100%`，正文重新填满外置内容通道；「外置后内嵌」逻辑不变。
- PC 仍保留原来的 `width:auto` 与外层 `data-rm-independent-external-compact-shell` / `--rm-external-compact-width` 贴合逻辑，桌面端行为不改。
- 除版本号外不修改 `src/independentApi.js`、`src/outputSanitizer.js` 等运行逻辑；保留 1.3.20 性能冻结链、视觉提示词编辑、1.3.45 外置维修工作副本与正文更新误判修复。

# 1.3.45 TEST — 外置维修工作副本 / 正文更新误判修复

- 恢复旧满意版 1.2.19 的关键维修行为：手动维修独立 API 外置镜时，只替换当前 `<details>` 为干净工作副本，外置 host、owner/sourceHash 与位置不动；旧 listener / WeakMap 交互状态随旧节点一起丢弃，再在新节点上重新绑定工具与维修。
- 工作副本与“返回修复前”快照都不克隆运行时工具栏、诊断面板或菜单，避免保存出“长得像按钮但没有 listener”的死 UI。
- `GENERATION_STARTED` 不再单凭宿主事件就把已完成镜面隐藏成“正文正在更新”；真正正文/Swipe 的 sourceHash 变化仍由既有 syncMessages 精确检测并进入 awaiting-fresh-source。
- 不新增 MutationObserver、focus/resize/scroll 监听、轮询或全聊天扫描；副 API 请求、stream、重试、外置几何和视觉 Prompt 不变。

# 1.3.44 TEST — 诊断面板禁止持久化 / 死按钮清理

- 修复独立 API 外置镜在维修保存／重挂载时，把一次性全链路诊断面板连同兔子镜正文一起序列化的问题。DOM 可以被保存，但 `addEventListener()` 不能，因此旧报告会变成“看得到按钮、点了完全没反应”的静态死面板。
- 独立 API 保存前与缓存恢复前都会剔除 `[data-rabbit-mirror-interaction-diagnostic]`；诊断报告不再进入兔子镜缓存、历史快照或维修后的 source。
- 输出净化器初始化与销毁时会清理页面中上一运行时遗留的旧诊断面板，避免旧版报告跨版本残留。
- 不修改 1.3.43 的 checked/radio 维修算法、副 API 请求链、外置布局、focus/Observer 性能冻结链；不新增监听、轮询或全聊天扫描。

# 1.3.43 TEST — 恢复旧版外置 checked 维修 / 点击减负

- 根因确认：1.3.39 起的 `independent-native-checked-restore` 只凭静态 `:checked` 规则存在就认为原生交互可用，导致完整 checked/label/radio 兜底被跳过；诊断却能出现 `matched=false`，说明该假设不成立。
- 恢复 1.2.19 满意版行为：清理旧急救内联状态后仍继续安装 `applyCheckedVisualFallback`、label fallback、radio fallback 等已验证交互路线，不再因“规则看起来完整”而绕开维修。
- 已存在的 `data-rabbit-mirror-independent-native-checked-restored` 旧标记会在维修时撤销，避免历史外置镜继续绕开 checked 维修库。
- 独立 API 的“点了没有反应”只执行一次完整当前镜面维修，后续仅做一次轻量工具/持久化刷新；不恢复四轮重复扫描。
- 不新增 MutationObserver、focus/resize/scroll 监听、轮询或全聊天扫描；独立 API 请求/重试/外置同步链保持 1.3.41。

# 1.3.43 TEST — 恢复旧版独立 API 交互状态净化基线

- 对比用户提供的 `副api满意版(2).zip`（内部 1.2.19）后确认：旧版 1.2.12 起存在完整的独立 API 交互状态净化层，当前 1.3.x 已将其移除。
- 恢复 `initialHtml` 干净基线、`scrubIndependentInteractionState()`、运行时状态属性／临时救援 style 清理，以及旧缓存污染迁移。
- 维修结果仍可保存结构修复，但 checkbox/radio 当前选中状态、`aria-pressed`、临时 active/selected/open 标记、checked 伪元素补丁与可逆内联样式不再被写死进永久外置缓存。
- 已有 1.3.x 污染缓存会在启动／恢复时优先从兼容历史中寻找更干净的初始基线并做一次性净化；不会重新请求副 API。
- 不回退现有外置几何、跨设备元数据、维修兔 v2.18、视觉提示词编辑或 1.3.20 性能冻结链；不新增 MutationObserver、focus/resize/scroll 监听或轮询。

# 1.3.43 TEST — 外置维修原生恢复 / 点击减负 / 视觉偏好收口

- 撤回 1.3.38 的 `independent-checked-runtime-reset` 双重重建链；该链会在同一次交互维修中重复解析 checked CSS、撤样式并再次进入完整交互维修库，造成额外卡顿。
- PC 独立 API 外置镜面若 checkbox/radio、label 与 checked 目标结构完整且无 unresolved 规则，维修兔优先只清理旧维修遗留的 `!important` checked 内联状态，恢复浏览器原生 label/input/:checked CSS；不再把正常结构强行接管成第二套手动状态机。
- 已安装过的通用 label / 可逆 radio 监听会动态识别“原生 checked 已恢复”标记并让行，不继续 preventDefault 或重复写入状态。只有结构真的不完整时才进入原有重维修库。
- 维修兔菜单打开时不再同步执行整面 `inspectMaintenanceRabbit()`；选择自动判断、巡逻或诊断后才检测，减少点击兔子时的瞬时卡顿。
- 视觉偏好最终锁改为：偏好必须主导整面作品的绘制、材质、轮廓与界面／装饰语言；第一眼无法辨认即视为未完成。仍不写死像素、赛璐璐等具体风格。
- 不新增 MutationObserver、focus/resize/scroll 监听、轮询或全聊天扫描；1.3.20 性能冻结链、1.3.35 外置贴合与既有副 API 请求参数保持不变。

# 1.3.37 TEST — 副 API 视觉锁去重 / 生成链冻结

- 1.3.36 的视觉偏好锁在独立 API 中会同时进入 system Prompt 与最终 execution lock，副 API 实际收到两次相同约束；本版改为副 API 只在最靠近输出的 execution lock 保留一次。
- 跟随当前 API 仍在输出协议前保留一次视觉偏好锁，像素 / 赛璐璐 / 水墨等通用视觉偏好强度不降级。
- 独立 API 请求函数、stream、max_tokens、重试、超时与完整 `<toto>` 校验逻辑全部保持 1.3.36 不变。
- 不新增 MutationObserver、focus/resize/scroll 监听、轮询或全聊天扫描；1.3.33 维修兔与 1.3.35 外置贴合继续保留。

# 1.3.37 TEST — 视觉偏好最终执行锁 / 性能冻结

- 修复视觉偏好虽然已进入 Prompt 中段，但独立 API 的近输出“最终执行锁”只再次强调主题、展现形式、交互与冷却，导致用户写入的“像素 / 赛璐璐 / 水墨”等风格在最后一步被稀释的问题。
- 用户填写了额外视觉偏好时，只追加一条短锁：复述用户实际填写内容，并要求它成为整面兔子镜可明确辨认的视觉主导；不写死任何具体风格。
- 主 API 也会在输出协议前追加同一条短锁；未填写额外视觉偏好时不增加任何内容，关闭视觉编辑总开关时继续保持旧流程。
- 不新增 MutationObserver、focus/resize/scroll 监听、轮询或全聊天扫描；1.3.35 的纯外置标题壳贴合与 1.3.33 的维修兔修复保持不变。

# 1.3.35 TEST — 修复 1.3.34 不加载 / 保留外置贴合与视觉偏好

- 修复 1.3.34 打包时 `index.js` 已切到 1.3.34、但 `ui / independentApi / outputSanitizer / feedbackCat` 内部 runtime 仍停在 1.3.33，导致 UI 与独立 API 在启动检查时直接 return 的问题。
- 以用户确认可加载的 1.3.33 原包重新制作，不在坏掉的 1.3.34 上补丁叠补丁。
- 保留视觉偏好一句话强约束，以及独立 API 纯外置标题壳贴近窄本体的修复。
- 不新增 MutationObserver、focus/resize/scroll 监听、轮询或全聊天扫描；1.3.20 性能冻结链与 1.3.33 维修兔修复保持不变。

# 1.3.33 TEST — 外置维修兔真实执行 / checked 后代误写恢复

- 修复独立 API 纯外置维修前为了回滚而 clone+replace 整个 `<details>` 的问题：外置镜现在只保存克隆快照，维修直接作用于当前 connected live DOM，不再先把真实维修目标换掉。
- 修复 `:checked ~ .paper.manuscript` 这类常见模型误写：当同节点复合 class 完全匹配不到，但后续唯一 `.paper` 内存在唯一 `.manuscript`，且该后代确实是默认隐藏、checked 后应显现的正文时，交互急救会高置信恢复为实际后代目标。
- 维修诊断不再把“checked 规则存在但目标元素为 0”算成有效第二层；新增 unresolved 计数，避免只看到提示卡变色/缩放就误报维修成功。
- 不新增 MutationObserver、focus/resize/scroll 监听、轮询或全聊天扫描；外置宽度、视觉 Prompt、独立 API 请求链保持不变。

# 1.3.33 TEST — 外置维修兔持久化修复 / 性能冻结

- 对比 1.2.69 后确认：维修兔核心检测、菜单、点击、维修库本身未回归；问题位于后来新增的独立 API 外置布局清理链。
- 1.3.31 的 `stripIndependentTransientLayoutArtifacts()` 会把维修兔写入的 mobile-layout 标记与救援 CSS 当成运行时临时布局，在外置 ready 后处理／重挂载时清除；1.2.69 不存在该清理链。
- 现在 user-triggered 维修兔修复会写入持久化标记；重新挂载时保留维修兔的 media-scoped 布局修复，同时仍清理独立 API 自己的 runtime-only spatial fitting。
- 外置 ready 后处理不再对已经挂载的 live DOM 做无条件 transient-layout strip，避免“刚修好又被擦掉”。
- 不新增 MutationObserver、focus/resize/scroll 监听、轮询或全聊天扫描；1.3.20 性能修复、1.3.29/1.3.30 外置显示修复、1.3.31 Prompt 修复均保留。

# 1.3.33 TEST — 视觉偏好只改成品视觉 / 老流程冻结

- 仅在“启用视觉提示词编辑注入”开启时增加防跑偏约束；关闭开关时不增加本修复文案，继续保持原老流程。
- 用户视觉偏好只能改变最终兔子镜成品如何呈现，不能把任务改写成“解释 / 分析 / 策划 / 描述兔子镜”。
- 禁止用“观察视角 / 视觉转译 / 交互反馈 / 设计说明”等解释文字代替实际成品；CSS 声明了按钮、状态选择器、内容面板或交互反馈时，HTML 必须真实存在对应结构。
- 规则位于主 API 与独立 API 共用的视觉编辑注入分支，不新增第二套 Prompt，不增加像素风等具体风格教程。
- 未修改 independentApi / outputSanitizer / settings / ui / style 的运行逻辑，不新增 MutationObserver、focus/resize/scroll 监听、轮询或输入框实时监听。

# 1.3.33 TEST — PC 纯外置窄本体贴合标题壳 / 性能冻结

- 修复独立 API「轻壳外置」在 PC 端出现“标题壳在上方一条，真正的窄本体却悬在整行正文容器中央”的问题。
- 当结果属于明显更窄、居中、以单个主要视觉本体承载内容的外置结果时，外置宿主会在 ready 后一次性收缩到“标题壳与主本体的较大宽度”，让本体直接挂在标题条下方。
- 不放大、不压缩、不重排模型生成的真实本体；只修正外置宿主宽度与挂载关系。
- 仅在 PC 宽屏、独立 API、纯外置、ready 状态下执行一次检测，不新增持续监听、轮询或额外观察器。
- 1.3.29 的宽背景透明化、1.3.28 的提示词强注入、以及既有不卡顿链保持不变。

# 1.3.29 TEST — PC 纯外置宽背景收束 / 性能冻结

- 修复独立 API「轻壳外置」在 PC 宽屏中，模型生成物本体明显较窄且居中，但最外层纯色舞台容器铺满整个正文内容通道，造成两侧大片同色背景的问题。
- 仅在 PC 宽屏、独立 API、纯外置、ready 结果下做一次性检测；必须同时确认“外层为全宽纯色背景”以及“内部存在明显更窄、居中、承载绝大多数正文的纸页／文档式本体”才会透明化外层舞台。
- 不放大或压缩模型生成的真实本体，不改变本体背景、边框、内容、交互或动画；场景型背景图／渐变背景不参与此修复。
- 此修复只挂在既有 ready 后处理里执行一次，不新增 MutationObserver、focus/resize/scroll 监听、轮询或持续布局扫描。
- 1.3.20 已确认不卡的 focus 恢复链与 #chat MutationObserver 消息隔离逻辑保持不变；视觉提示词强注入流程保持 1.3.28 不变。

# 1.3.28 TEST — 视觉编辑强注入 / 性能冻结

- 直接加硬现有视觉提示词编辑注入流程；没有新增第二套 Prompt。
- “额外视觉偏好”开启后视为本轮明确视觉指令，必须在整面主要视觉中明显、成体系落实，而不是仅作点缀或弱参考。
- “不希望出现的视觉”开启后视为明确避用项。
- 用户本轮明确偏好／避用项与通用视觉审美规则冲突时，优先采用用户填写内容；锁定工程规则与展现形式本体仍不可覆盖。
- 关闭视觉提示词编辑注入时，继续逐字使用 1.3.20 原版视觉流程。
- 不修改已冻结的卡顿修复逻辑，不新增 MutationObserver / focus / resize / scroll 监听或输入框实时保存。

# 1.3.27 TEST — 视觉编辑文案口语化 / 测试版名称隔离

- 测试仓库扩展显示名称由“兔子镜小剧场”改为“兔子镜测试版”，设置页标题与全链路诊断同步显示测试版名称，便于和正式版区分；内部设置键与运行架构不变。
- “个性化视觉提示词”标题移除 🎨 图标，使设置页风格与其它分区保持一致。
- 视觉偏好说明改为普通用户更直观的说法：可直接描述喜欢画面怎么排、什么质感、什么颜色、什么光线、想要简洁还是丰富、想要平面还是有前后层次；不要求理解“构图 / 材质 / 光影 / 装饰密度 / 空间层次”等设计术语。
- 高级区名称改为“高级：修改通用视觉规则 / 通用视觉审美规则（高级，可编辑）”，并明确普通用户无需修改。
- 保留 1.3.26 的显式注入开关：默认关闭时仍逐字走 1.3.20 原版视觉 Prompt 流程；开启后才发送可编辑视觉层。
- 本版不修改 independentApi 的 focus 恢复链、outputSanitizer 的 MutationObserver 消息隔离、外置尺寸、独立 API、维修兔交互修复或动画弹幕修复，不新增高频输入监听、轮询或布局监听。

# 1.3.26 — 视觉提示词编辑注入显式开关

- 新增“启用视觉提示词编辑注入”总开关，默认关闭。
- 未勾选时不发送 `visualPrompt` / `visualExtraPrompt` / `visualAvoidPrompt`，Prompt 组装直接恢复 1.3.20 原版 `展现形式落地 + 色彩组织` 流程。
- 勾选后才启用可编辑官方视觉基线、额外视觉偏好与视觉避雷，并随实际生成兔子镜的模型请求发送。
- 关闭开关不会清空已编辑内容；用户可先保存草稿，之后再开启。
- 本次不修改 independentApi / outputSanitizer 的性能修复逻辑，不新增 input/keyup/keydown 高频监听、MutationObserver、focus/resize/scroll 监听或轮询。

# 1.3.26 — 视觉提示词设置页强制刷新 / 旧 UI 残留修复

- 修复覆盖安装或热更新后，旧的兔子镜设置面板 DOM 被误判为当前 UI，导致 1.3.21 起新增的“个性化视觉提示词”入口没有显示的问题。
- 设置面板现在只有在运行版本、UI 版本以及“额外视觉偏好 / 不希望出现的视觉 / 保存视觉提示词”关键控件全部匹配时才会复用；否则自动移除旧面板并按当前版本重建。
- 设置标题旁新增内部版本 `1.3.26`，便于直接确认浏览器实际加载版本。
- 不修改 1.3.20 已验证的 focus / MutationObserver 性能修复，不修改独立 API、外置、维修兔、挨打猫、随机冷却或视觉 Prompt 拼接逻辑。

# 1.3.24 TEST — radio 弹幕互斥 / 动画溢出误修 / CSS 类选择器笔误修复

- 修复模型把多个 radio 状态组的弹幕条目全部挂上公共 `active-danmaku`／跑马灯 class 时，未选中组也因公共 `opacity + animation` 规则持续可见，造成三组文本同时叠在同一画布的问题。维修兔现在可把这类“同一绝对定位画布、同一弹幕公共 class、由多个 radio 的 `:checked` 规则分别激活”的条目识别为互斥状态集合；只保留当前选中组可见并运行，其他组隐藏且暂停动画。
- 对这类被动动画条目保留 `pointer-events:none`，不会因为互斥急救而让飞行文字反过来遮挡触摸；普通叠层正文仍沿用原有互斥 panel 维修逻辑。
- 手机排版巡逻不再把 `position:absolute/fixed + nowrap + animation + pointer-events:none` 的弹幕／跑马灯当作普通正文横向溢出；其跨画布移动属于设计本身，不会再被错误压宽、换行或持续报黄兔。
- 清洗 CSS 时新增高置信类选择器笔误修复：模型偶发输出的 `. className` 会恢复为合法的 `.className`。本例中的 `. reality-text` / `. reality-sub` 因此可重新命中原本的文字样式。
- 继续保留 1.3.23 的外层 `<details>` 手机 overflow 误报修复、1.3.22 个性化视觉提示词，以及 1.3.20 已实机确认不卡的 `focus` / MutationObserver 性能修复；本版未修改两条性能链。

# 1.3.23 — 手机端根节点横向溢出误报修复

- 修复维修兔在手机窄屏下把兔子镜最外层 `<details>` 根节点也计入“正文横向溢出”的问题。外层根节点的 `scrollWidth` 会包含标题文字与 🐇/🐈 工具入口，长标题可能因此被误判为正文内容溢出。
- 手机排版诊断现在与实际维修范围保持一致：只检查维修器真正会处理的镜面内部生成内容，不再让不可维修的外层根节点形成“检测到 1 处风险 → 维修无改动 → 风险永久残留”的黄兔循环。
- 不改变正文、标题、外置尺寸或交互结构；真实的内部横向溢出、固定宽度、Grid/Flex、媒体和状态内容风险仍按原规则检测。
- 1.3.20 起已验证的性能修复继续冻结：普通 `focus` 不触发全聊天 `syncAll()`，聊天 MutationObserver 只处理真实消息作用域。本版未修改这两条性能链。
- 保留 1.3.22 的个性化视觉提示词编辑功能与测试仓库发布通道。

# 1.3.22 TEST — 可编辑视觉提示词

- 以已实机确认不卡顿的 1.3.20 为唯一运行时基线；保留 1.3.19 的消息级 MutationObserver 隔离，以及 1.3.20“普通 focus 不触发整段聊天 syncAll”性能修复。
- 新增设置页“🎨 视觉提示词编辑”：把原 `presentationEmbodimentRule()` 中可归类为审美的默认主体、材质、配色、光影与反模板化规则拆成“官方默认视觉规则”，允许用户直接编辑。
- 新增“额外视觉偏好”和“不希望出现的视觉”两个可选输入框；三块内容保存后都会进入下一次兔子镜 Prompt。
- 跟随当前 API 与独立 API 共用同一 `buildRabbitMirrorPromptDetails()`，因此编辑后的视觉提示词会发送给实际负责生成兔子镜的模型；独立 API 不把它注入主 API 正文请求。
- 核心工程规则继续锁定：`<toto>` 输出协议、HTML/CSS 安全、中文硬锁、结构完整性、移动端可读性、交互可触发性、近期冷却、维修兔兼容均不可被视觉编辑覆盖。
- 设置页只在显式点击“保存视觉提示词”时持久化，不监听 textarea 的每次 input，避免重新引入移动端设置抽屉卡顿。
- 发布通道切回测试仓库 `https://github.com/Zaiyebuzuoyouqingdetiangou/tototest`；正式仓库 1.3.20 不受影响。

# 1.3.20 — 普通 SillyTavern 焦点切换不再触发整段聊天对账

- **正式仓库发布适配**：将已实机确认流畅的 1.3.20 测试确认包提升为 `toto` 正式发布包；`homePage` 与安装说明切换到正式仓库，运行源码、Prompt、母本、随机/冷却、维修兔、挨打猫与 API 链保持测试确认状态不变。
- 1.3.19 实机确认已明显改善，但仍有轻微顿挫；继续审计两种 API 模式共用的常驻链后，定位到 `independentApi.js` 的后台恢复监听在所有模式都会安装。
- 旧逻辑监听 `window focus`，任何 focus 都会在 80ms 后执行一次 `syncAll()`；iOS Safari / SillyTavern 打开抽屉、编辑器、角色卡或工具控件时也可能产生普通 focus 变化，因此即使页面从未进入后台，也会遍历整段聊天做兔子镜对账。
- 现在新增“真实后台恢复门”：只有页面确实经历过 `visibilityState=hidden`，或收到 `pageshow.persisted=true` 的 BFCache 恢复，才允许后续执行一次全量 `syncAll()`。
- 普通 `focus`、前台 `visibilitychange`、非 BFCache `pageshow` 在没有后台标记时立即返回，不读取聊天 DOM、不遍历消息。
- 保留真正从后台/锁屏/切换 App 返回时的镜面恢复，以及独立 API 原有的后台生成续接逻辑；未修改 1.3.19 的消息作用域 MutationObserver 隔离、维修兔、挨打猫、重说/历史、尺寸、Prompt、随机/冷却或 API 请求。

# 1.3.19 — 隔离 SillyTavern 面板 DOM 与兔子镜聊天观察器

- 根据实机补充确认：切换为“跟随当前 API”后仍会在打开插件、角色卡、魔法棒时卡顿，因此卡顿并非独立 API 网络请求或纯外置尺寸公式专属问题。
- 定位到两条 `#chat` subtree MutationObserver 共用热点：维修兔/挨打猫观察器在所有模式常驻；独立/跟随外置模式还会叠加外置同步观察器。旧逻辑会对 `#chat` 中每个新增节点先递归 `querySelector('toto, details')` / 扫描后代，即使新增内容只是 SillyTavern 的抽屉、角色卡或魔法棒 UI。
- 两套观察器新增“消息作用域前置门”：只有 mutation 已位于真实 `.mes/[mesid]` 消息内，或新增节点本身就是消息节点时，才允许向下检查兔子镜 DOM。
- 非消息的 SillyTavern UI 子树直接跳过，不再为插件菜单/角色卡/弹层遍历数百个后代节点；关闭面板时同样避免递归扫描非消息 removed subtree。
- 新消息插入、消息内部重新渲染、Swipe/正文替换、外置宿主同步、维修兔/挨打猫入口安装仍保留；没有修改独立 API 请求、Prompt、随机/冷却、OA/radio/checkbox 修复或现有尺寸公式。

# 1.3.18 — 移除 SillyTavern 面板开关触发的强制聊天布局读取

- 根据 1.2.69 → 1.3.x 的实际源码对照定位：1.2.69 的外置尺寸链不监听窗口 resize，也不会在 UI 面板开关时读取聊天 DOM；1.3.x 为了让纯外置对齐正文内容轨道，新增了 resize 几何同步。
- 1.3.15～1.3.17 的“横向签名”虽然能跳过部分刷新，但签名本身会先执行 `#chat.getBoundingClientRect()` / `clientWidth`。在 iOS Safari 中，这一步就足以强制整段聊天同步 style/layout，所以即使随后跳过，顶部插件、角色卡、右下魔法棒仍会先卡顿。
- resize 快速判定改为只读取 `window.innerWidth`（无 DOM / 无 layout read）；宽度未变时在事件入口直接返回，不创建 timer、不启动 RAF、不扫描任何兔子镜。
- 只有浏览器真实布局视口宽度变化时，才执行原来的纯外置正文轨道几何同步；屏幕旋转仍保留延迟后的强制刷新。
- 撤回 1.3.16 / 1.3.17 未能解决卡顿的 IntersectionObserver / 离屏 stylesheet 休眠实验，避免继续增加运行时观察器和状态复杂度。
- 新镜面挂载、Swipe / 重锚定时仍按原 1.3.17 尺寸公式即时对齐正文轨道；未修改维修兔、OA/radio/checkbox 修复、挨打猫、重说/历史、独立 API 请求、Prompt、随机和冷却逻辑。

# 1.3.17 — 历史纯外置渲染休眠性能补丁

- 根据实机对照确认：关闭兔子镜插件后 SillyTavern 顶部插件、角色卡、右下角魔法棒等面板立即恢复流畅，说明剩余卡顿来自兔子镜本身，而不是 SillyTavern。
- 1.3.15 / 1.3.16 只减少了 RabbitMirror 自己的几何扫描；历史纯外置镜面的完整 DOM 与每面独立的 scoped `<style>` 仍一直参与 Safari 的整页 style/layout 重算。长聊天中这仍会让任何无关面板打开时出现约 1 秒主线程停顿。
- 新增“离屏历史镜面休眠”：独立 API 的 ready + pure-external 镜面离当前视口 1000px 以上后，保留原 DOM、input/radio/checkbox 状态和事件监听，只暂停该镜面的渲染，并临时停用镜面内部 scoped `<style>`。
- 休眠时锁定镜面最后一次实际高度，聊天滚动位置不会因历史镜面停止渲染而跳动；滚动到视口附近前自动恢复原 stylesheet、原高度与正常渲染，再使用原尺寸算法同步。
- loading/error、正在重说、等待新正文、当前焦点所在镜面、外置后内嵌与跟随 API 镜面不会进入休眠。
- 切换模式、热更新或销毁 runtime 时会先恢复所有休眠镜面，避免休眠标记进入持久化/历史快照。
- 未修改 1.3.16 的尺寸公式、维修兔/OA/radio/checkbox 修复、挨打猫、重说/历史、独立 API 请求链、Prompt、Swipe/重锚定、随机与冷却逻辑。

# 1.3.16 — 手机版抽屉卡顿第二阶段性能修复

- 根据实机录屏确认：1.3.15 仍会在顶部插件/角色卡/右下角魔法棒等 UI 引起横向布局变化时，对整段聊天历史中的所有纯外置兔子镜执行几何测量，长聊天在 iOS Safari 上仍可阻塞主线程约 1 秒。
- 全局 resize / orientationchange 刷新改为“视口附近优先”：仅刷新当前屏幕上下约 1000px 范围内的独立 API 纯外置镜面，不再扫描所有离屏历史镜面。
- 离屏历史镜面由 IntersectionObserver 懒同步：滚动到视口附近时只刷新该面，仍使用与 1.3.15 完全相同的宽度/位置计算函数，不改变最终视觉尺寸。
- 不支持 IntersectionObserver 的旧浏览器自动退回 1.3.15 全量刷新逻辑。
- 保留 120ms resize 合并、横向签名跳过、读写分离，以及新挂载/Swipe/重锚定的单面即时尺寸同步。
- 未修改维修兔、OA/radio/checkbox 结构修复、挨打猫、重说/历史、独立 API 请求链、Prompt、外置后内嵌与随机/冷却逻辑。

# 1.3.15 — 外置尺寸刷新性能补丁

- 不改 1.3.14 的纯外置最终宽度/位置算法，只优化全局 resize / orientationchange 刷新链。
- resize 连续触发改为 120ms 合并；SillyTavern 打开/关闭角色卡、插件抽屉、魔法棒等 UI 时，不再每一帧重新测量全部历史外置兔子镜。
- 全局尺寸刷新改为“先统一读取全部几何信息，再统一写 CSS 变量”，避免 Safari 上 read→write→read→write 造成强制重复重排。
- 增加横向布局签名；若 viewport / #chat 的横向内容轨道没有变化，则跳过无意义的尺寸重算。仅高度变化（如 Safari 地址栏、键盘、覆盖层）不再触发全历史镜面重排。
- CSS 变量和 width-mode 只有实际值变化时才写入，减少 MutationObserver / style 重算压力。
- 单面新挂载、Swipe / 重新锚定时的即时尺寸同步仍保留；维修兔、挨打猫、独立 API、外置后内嵌、Prompt 与交互维修链均未改动。

# 1.3.14 — 非法嵌套交互结构 / radio 维修验证修复

- 修复模型漏写 `</label>` 时形成的“label 内再套 label”非法重复卡片结构：仅在高置信的同类重复节点中，把后续交互分支提升回正确的同级位置，避免 iOS Safari 点击后命中错误 label。
- 修复 class-local `:checked` 兜底作用域：如果 `closest(label)` 实际属于另一个控件，不再拿整张外层 label 当局部作用域，避免一个 radio 被选中后把多个兄弟分支一起写成 `display:block !important`。
- 对旧版已经持久化到当前镜面的错误 checked 内联样式进行定向清理；修复结构后只重建当前真实 checked 分支，不让多个审批节点同时展开。
- 维修兔隐藏隔离副本验证新增 radio 支持：优先在副本中切换未选中的 radio，不点击、不派发事件、不修改真实页面控件。
- 全链路诊断版本同步为 `1.3.14-FULL-CHAIN`，并新增“非法嵌套 label / 结构修复数”字段，避免实际装 1.3.13+ 却仍显示旧的 1.3.3 诊断头。
- 保留 1.3.13 的轻壳纯外置尺寸、挨打猫手机版历史/重说、独立 API、Prompt、随机抽取与其它维修能力。

## 1.3.13

- 修正轻壳纯外置的本体宽度基准：不再对齐 `.mes_text` 自身，而是与“外置后内嵌”相同，严格使用其实际容器（通常为 `.mes_block`）的内容轨道。避免部分主题下 `.mes_text` 的负 margin / 扩展宽度导致纯外置被横向撑宽、视觉压扁。
- 保留标题轻壳；生成内容仍不接受纯外置的 width / height / aspect-ratio 强制重写。
- 保留 1.3.12 的挨打猫手机版菜单与历史查看修复。

# 1.3.13

- 纯外置标题壳改为内容自适应宽度，不再横向铺满正文内容区。
- 纯外置生成本体继续沿用与「外置后内嵌」相同的正文内容区几何基准，不额外放大或缩小。
- 保留 1.3.11 的轻壳外置、交互隔离与挨打猫手机版历史滚动修复。

# 1.3.11

- 独立 API「纯外置」改为轻壳外置：外部宿主透明，仅标题栏保留兔子镜壳；生成内容不再被外壳包裹。
- 纯外置停止自动改写生成物的 width / height / aspect-ratio / 空间画布布局，避免与 checkbox/radio/翻面/滑入等交互状态冲突。
- 挨打猫「兔子镜历史」修复手机版高度分配与滚动区域，历史版本条和预览区可同时正常使用。
- 挨打猫菜单在手机版改为视觉视口内可滚动，底部「重说 / 兔子镜历史」不再被屏幕裁掉。
- 独立 API 展示选项文案更新为「轻壳外置（标题有壳）」与「外置后内嵌」。

# 1.3.10 — 外置兔子镜跟随实际正文内容盒留白

- 修正 1.3.9 在移动端把 `.mes_block` 误当成“正文留白”的问题；部分主题里 `.mes_block` 本身接近满宽，导致外置兔子镜仍然贴边。
- 独立 API 纯外置现在优先对齐 `.mes_text` 的实际 content box（包含正文自身 padding/margin 形成的左右留白），而不是只对齐外层消息块。
- 若 `.mes_text` 在首帧被其它状态栏/头像/扩展临时压窄，会通过相对父内容区的合理宽度检查拒绝异常测量。
- 若当前主题的正文内容盒本身没有任何可见左右留白，则保留 96% 居中兜底，避免外置兔子镜再次贴满屏幕。
- 跟随当前 API 的外置也增加同一保护：正文内容盒已有真实留白时保持 100% 跟随；若主题本身把正文做成近乎满宽，则整只外置兔子镜使用 96% 居中兜底。
- 不改变 inline / 外置后内嵌的 100% 正文容器自适配，也不改兔子镜内部 padding、Prompt、母本、随机抽取、独立 API 请求或维修兔逻辑。

# 1.3.9 — 外置兔子镜跟随正文稳定容器留白

- 独立 API 纯外置不再使用固定 `96%` 作为最终宽度；现在读取所属回复的稳定正文内容通道（通常为 `.mes_block`）左右边界，让“标题栏 + 外框 + 内容区”整只兔子镜与正文容器留白对齐。
- 明确不读取瞬时 `.mes_text` 宽度，避免手机渲染期间被状态栏、头像或其它扩展暂时压窄后把兔子镜宽度冻结。首帧若布局尚未稳定，暂用 96% 居中兜底，并在双 RAF / 120ms 后自动重算。
- 屏幕旋转或窗口尺寸变化时会重新同步正文内容通道宽度；不是给兔子镜内部追加 padding，也不会制造第二层留白。
- 跟随当前 API 的外置本来就在正文内容通道中，因此取消额外的 96% 二次缩进，直接 100% 使用其所在正文通道宽度。
- `external_then_inline` 完成后的 inline 保持原有 100% 正文容器自适配，不继承纯外置几何变量。
- 保留 1.3.8 之前的随机抽取、外置一体化、主视觉自适配、独立 API 与维修兔逻辑；本构建发布通道为正式仓库 `toto`。

# 1.3.8 — 外置兔子镜整体比例留白

- 外置兔子镜本体改为 96% 容器宽度并整体居中，标题栏、外框与内容区作为一个整体同步向内收，不再近乎贴满屏幕。
- 独立 API 外置与跟随 API 外置统一使用比例留白；不向内部内容追加 padding，也不缩第二层“兔子镜内容”。
- `external_then_inline` 完成后仍回到原有 `inline` 透明承载逻辑：宽度 100% 跟随正文容器，继续使用正文/聊天容器自身的留白，不继承外置 96% 规则。
- 保留 1.3.7 的随机源增强、父主题家族温和规模校正，以及 1.3.6 的外置一体化和 1.3.5 的自适配尺寸逻辑。

# 1.3.7 — 随机抽取恢复 / 正式仓库版

- 恢复 1.2.55 已验证的随机源：优先使用 `crypto.getRandomValues()`，在旧 WebView / 受限环境不可用时自动回退 `Math.random()`。
- 恢复父主题家族的温和规模校正：家族基础权重按有效条目数的 `0.9` 次方计算，降低单条/小家族在“家族完全等权”下异常偏高的单项命中率，同时避免大树家族按子项数量线性霸榜。
- 保留现有最近具体条目硬排除、同父类 `0.35` 降权、同主题家族 `0.25` 降权等冷却逻辑。
- 本次功能修改仅位于 `src/picker.js`；未修改 Prompt、母本、配色、材质、光影、Visual Scenery、独立 API 请求链、维修兔或 1.3.6 外置一体化/自适配逻辑。
- 正式仓库通道：`https://github.com/Zaiyebuzuoyouqingdetiangou/toto`。

# 1.3.6 — 外置一体化本体测试修复

- 正式仓库发布适配：本发布包的 `homePage` 与安装说明切换到 `https://github.com/Zaiyebuzuoyouqingdetiangou/toto`；功能代码与 1.3.6 测试确认包保持一致。
- 仅在独立 API 的 `data-rm-placement="external"` 阶段启用一体化外观：外置承载不再表现为独立的中性插件壳，而是读取当前兔子镜实际主承载面的背景、边框、圆角，并优先寻找主视觉顶部色带作为标题栏材质。
- 标题栏、外围背景、边界和圆角因此与当前兔子镜内容共享同一组运行时视觉 token；展开时，非物件型的顶层舞台承载面会去掉顶部重复圆角，减少“外壳 + 里面另一张卡”的拼装感。
- 手机、证件、书页等物件型本体仍保留自身顶部圆角和 1.3.5 的自适配尺寸，不把物件强行焊死到标题栏。
- `external_then_inline` 切回正文时会主动撤掉一体化标记；内嵌阶段继续使用原有透明 carrier，不继承外置专用标题、边框或圆角。
- 未修改 Prompt、母本、随机抽选、Visual Scenery、配色生成、材质/光影规则或独立 API 请求链。

# 1.3.5 — 主视觉本体自适配尺寸修复

- 对照 1.2.67 的手机端处理重新拆分“普通窄内容”和“手机/设备/证件/书页等物件型本体”：物件型本体不再被通用窄版心救援二次拉到接近满宽。
- 物件型本体改为 CSS 自适配尺寸：纵向物件使用 `clamp(320px, 78%, 460px)`，横向物件使用更宽的自适配区间；窗口变化时无需重新计算即可自动跟随兔子镜宽度，同时保持原始宽高比例。
- 已经处于合理尺寸的物件不会重复改写，避免不同窗口尺寸下忽大忽小。
- 保留 1.3.4 的兔子镜本体配色提取修复；未修改 Prompt、主题/展现形式、材质、光影或其它生成审美规则。

# 1.3.4 — 外置本体取色 / 单一视觉本体放大修复

- 修正“外置壳”和“兔子镜本体”的关系：外置容器本身就是兔子镜本体，不再维持中性的独立白壳逻辑。
- 外置兔子镜配色现在优先从实际主视觉本体提取（如手机壳、书页、证件、终端、档案等），再应用到兔子镜本体边框、背景和强调色。
- 新增“主视觉本体”识别与外置放大修复：当生成结果是单一手机/卡片/书页/终端式主画面时，会在保持比例的前提下尽量占满兔子镜展示区域，不再缩成中间一小块。
- 放宽独立 API 外置本体宽度：桌面端不再锁死 560px，移动端左右留白也进一步缩小。
- 版本号升至 1.3.4，并同步刷新 rmv 缓存键，便于前端正确加载修复后的 JS/CSS。

# 1.3.3 — 测试版容器宽度 / 独立 API 布局修复

- 修复 1.3.3 前“用浏览器窗口宽度判断是否需要窄版心/空间画布救援”的错误：独立 API 外置壳本身约 560px，即使桌面浏览器宽 2552px，内部仍可能被裁切。现在以实际挂载的兔子镜外置容器宽度为准。
- 独立 API 内部窄版心救援因此同时覆盖桌面窄外壳与手机，不再只在 `window.innerWidth <= 760` 时触发。
- 线索板/关系板/地图等绝对定位空间画布若真实超出外置承载面，会在该承载面局部横向滚动；不再受全局 `@media` 限制，保留原坐标关系，不重排卡片。
- 修复独立 API 缓存把手机维修标记、手机布局 CSS、空间画布状态带到另一设备的问题：这些布局维修现在只属于当前挂载环境，写入缓存前会剥离，下次按实际容器重新计算。
- 修复 checkbox 第二状态仅依赖 `transform` / `filter` 时诊断误判 `labeledVerified=failed`：安全隔离副本现在把滑入叠层和 blur 等视作可验证第二状态。
- 仅修改运行时布局、缓存清理和交互验证；未修改 Prompt、配色、材质、光影、母本、Visual Scenery 或其它生成审美规则。

# 1.3.3 — 1.2.9 审美冻结 / 1.2.69 运行时回移

- 本构建切换为测试仓库发布通道：`https://github.com/Zaiyebuzuoyouqingdetiangou/tototest`；仅修改仓库入口与说明，不改功能代码、Prompt、配色、材质、光影、Visual Scenery 或其它审美规则。
- 正式版对外标识更新为 `TOTOv1.3`；设置页右侧版本标识由 `Toto` 改为 `TOTOv1.3`，扩展显示名称“兔子镜小剧场”不变。

- 基线保持 1.2.9：`promptBuilder.js`、`picker.js`、全部主题/展现形式母本、Visual Scenery 规则、配色/材质/光影规则、`style.css` 与 1.2.9 原样保留，不移植 1.2.69 的配色去重、综合色调纠偏、动态视觉配色纠偏或其它审美相关 Prompt。
- 独立 API 回移 1.2.69 的运行时稳定能力：外置挂载、聊天级缓存/跨设备元数据恢复、稳定 owner 锁与重绘去重、单正文单次自动请求生命周期、旧外置缓存恢复、热更新/源切换被动恢复，以及独立 API 成品交互急救重新激活。
- 独立 API 回移手机“内部窄版心”救援：只在独立 API 外置成品中，高置信识别承担主要正文且明显过窄的内部承载页时扩宽；不修改其颜色、材质或生成 Prompt。
- 维修兔回移 1.2.69 的交互/布局维修：checkbox/radio 第二状态、radio 可逆返回、被 SillyTavern 删除的安全 inline onclick/hover、自身/closest class 切换、固定 ID `<script>` 时间线、details 裁切/状态层显示、手机布局、文字裁切、Visual Scenery 手机溢出，以及 scoped class / ID 引用修复。
- 全链路诊断升级到 1.2.69 维修链能力；未启用 1.2.69 的本地配色重映射。
- 新增“异模块包裹脱壳”运行时修复：兔子镜若被上一块状态栏、行动面板或其它模块错误包住，会在高置信条件下把现有 `<toto>` / 兔子镜 `<details>` 节点移回当前消息正文层并保持原先后顺序；只移动 DOM，不改 HTML/CSS、Prompt、配色或审美。

# 兔子镜小剧场更新记录

## 1.2.9 — 纯外置热更新复位与旧仓库降级保护（2026-08-02）

- 修复安装更新、Safari 页面恢复、SillyTavern 消息 DOM 重绘或旧扩展副本干扰后，独立 API 已勾选“纯外置”却把完成镜面留在正文内嵌锚点的问题。
- 每次有限消息对账都会重新读取当前 `independentDisplayMode`，并把同一独立 API shell 重新放到所选位置；“纯外置”保持正文外，“外置后内嵌”仍只在完成后进入正文下方。
- 对账只移动现有 shell，不重新调用 API、不重新随机、不生成第二面，也不修改正文、Swipe 或缓存身份。
- 当前公开 GitHub `main` 仍是旧 Beta v1.1，因此本包暂时将 `auto_update` 关闭，防止 SillyTavern 自动把本地新版本覆盖回旧仓库代码。待仓库先同步到本包后，再在后续版本重新开启。
- `loading_order` 从 99 调整为 100，使本包在遗留的旧 RabbitMirror 副本之后加载，并接管、清理旧运行时；显示名称仍固定为“兔子镜小剧场”。


## 1.2.8 — 名称统一与更新配置（2026-08-02）

- 扩展管理页面的显示名称固定为“兔子镜小剧场”，不再附带英文名或版本号。
- 设置页标题固定为“兔子镜小剧场”，作者水印固定为“Toto”。
- 发布压缩包固定命名为 `兔子镜小剧场.zip`，以后版本继续覆盖同名文件。
- `manifest.json` 的内部版本继续递增，用于更新判断、缓存刷新与诊断；内部版本不属于扩展名称。
- 当时曾开启扩展清单的 `auto_update`；由于仓库 `main` 尚未同步到该版本，已在 1.2.9 暂时关闭，避免自动降级。
- README 与许可证统一使用“兔子镜小剧场”作为产品名称。
- 未修改 Prompt、随机抽取、独立 API、主 API、缓存身份、外置／内嵌、Swipe、挨打猫或维修兔功能。

## 1.2.7 — 手机恢复与跨设备重绘去重（2026-08-02）

- 修复手机重新打开页面、Safari BFCache 恢复或 SillyTavern 重建消息 DOM 后，同一兔子镜可能同时留下“正文内嵌一份＋外置圆框一份”的问题。
- 跟随当前 API＋外置显示现在会优先复用已经存在的同 owner 外置 shell，并把新重绘出来的正文 `<details>` 移回该 shell，而不是再保留一份内嵌副本。
- 独立 API模式会按 owner key 与语义指纹核对正文内的意外副本；只有确认属于同一成品时才删除内嵌重复，不影响同一条回复中内容不同的其他镜面。
- 正文内嵌模式下若发现与正文镜面内容完全相同的遗留外置 shell，以正文内嵌版本为准并清理空锚点。
- `pageshow`、页面重新聚焦与从后台恢复时，所有启用中的显示模式都会执行一次有限去重／重新锚定；独立 API的原有后台续跑逻辑保持不变。
- 未新增轮询、MutationObserver、API 请求或生成次数；不修改随机抽取、Prompt、温度、正文、Swipe、缓存身份、维修兔或挨打猫。

---

## 1.2.6 — 副 API随机执行锁与请求模式透明化（2026-08-02）

- 在副 API用户消息最末尾新增“兔子镜最终执行锁”，汇总本轮实际抽中的主题、展现形式、内容构思重点、UI／媒介构思重点，以及近期实际视觉、交互、配色和内部折叠避让。
- 最终执行锁不会重新随机，也不会把前十轮全文重复注入；本轮完整组合负责“必须做什么”，前几轮压缩记录负责“必须避开什么”。
- 明确要求主题进入具体内容、关系和细节，展现形式成为首个主要视觉本体；输出前逐项检查是否退化成通用卡片、信息面板、按钮组或换皮标签页。
- 独立 API设置面板新增“最近一次实际请求”状态，显示 system＋user／仅 user、温度是否真正发送、输出上限字段、流式模式、兼容尝试次数，以及本轮实际抽取结果。
- 全链路诊断新增独立 API最近一次请求参数、实际抽取主题／展现形式与执行锁字符数，便于区分“抽签重复”和“抽签不同但模型执行收敛”。
- 旧版保存的裸字符串兼容模式在升级后会重新探测标准 `system＋user＋temperature` 请求；API地址、模型或温度变化时也会重新探测。降级模式每六小时允许再次验证标准模式，成功后自动退出降级。
- 修复温度设置为 `0` 时被错误回退成 `0.8` 的问题。
- 不修改随机池、抽取概率、主 API Prompt、正文、Swipe、显示模式、维修兔、挨打猫或缓存身份。副 API最终执行锁会增加少量副 API输入 Token，但不增加主 API Token，也不额外生成第二面兔子镜。

---

## 1.2.5 — 交互冷却去模板菜单化（2026-08-02）

- 保留 v1.2.4 的交互家族识别与近期重复冷却，不删除复杂交互能力，也不永久禁止 radio、checkbox 或 details。
- 删除 Prompt 中“拉帘、空间热点、时间进程、滚动窗口、材质变化”等固定替代示例清单，避免模型把冷却理解成有限组件菜单。
- 冷却触发后只指出近期重复的操作路径；新交互必须从本轮展现形式的真实使用方式、空间关系、物件行为、叙事推进与内容节奏中自行推导。
- 明确允许未被现有识别器归类的全新交互；交互家族标签只用于发现重复，不是生成模板、候选库或轮换表。
- 未修改主／副 API、显示模式、缓存、维修兔、挨打猫、正文、Swipe、扫描频率或 Token 行为。

---

## 1.2.4 — 交互家族冷却与三按钮模板去重（2026-08-02）

- 新增本地“交互家族”识别，记录并列 radio 标签页、多控件状态面板、单入口揭示、多点勾选、内部折叠、翻面、锚点与弹层等实际 HTML/CSS 骨架。
- 当近五轮连续重复同一交互家族时，下一轮 Prompt 会强制更换交互家族；尤其阻止“多个同组 radio＋并列按钮／标签＋同位置正文面板”仅换标题、颜色和按钮数量后继续复用。
- 强化通用交互规则：三枚并列按钮切换三块正文不再被允许作为万能默认答案，但 radio、checkbox 与 details 并未永久禁用；媒介天然需要且近期未重复时仍可使用。
- 近期视觉避让摘要现在同时带入实际交互骨架，模型不再只看到主题、配色和版式差异。
- 交互家族只在生成完成后由插件做有限的一次性本地扫描并写入现有历史，不新增轮询、MutationObserver、API 请求或 Token。
- 未修改主／副 API请求、切换分界、缓存身份、外置／内嵌显示、维修兔交互修复、正文或 Swipe 数据。

---

## 1.2.3 — 跟随 API切换到独立 API重复生成修复（2026-08-01）

- 修复从“跟随当前 API”切换到“独立 API”时，切换前已存在且已经带有主 API兔子镜的旧回复仍可能被独立 API再次生成的问题。
- 切换分界从单纯的消息编号升级为“聊天＋mesid＋Swipe＋正文主文本指纹”的确切版本锁；残留的生成开始／结束事件不能再提前解除。
- 只有新回复、正文实际重说或Swipe／正文指纹确实变化时，才允许独立 API自动生成；挨打猫手动重说仍走明确的强制路径。
- 独立 API占位框也遵守同一分界，切换瞬间不会先冒出“正在生成中”再误请求。
- 加强主 API兔子镜存在检测，兼容内嵌、外置和不同DOM包裹形式。
- 不修改Prompt、正文、Swipe数据、独立API缓存格式、显示样式或外框取色。

---

## 1.2.1 — 来源切换缓存恢复修复（2026-08-01）

- 修复首次从独立 API切换到“跟随当前 API＋正文下方”时，既有独立 API兔子镜可能暂时全部消失的问题。
- 跟随内嵌模式现在只要当前聊天存在可恢复的独立 API缓存，即使宿主刚被 SillyTavern 的 DOM重建移除，也会保留轻量消息观察器。
- 来源切换后增加两次有限的一次性被动恢复（120ms／850ms），用于覆盖同步竞态；不会持续轮询、不会调用 API，也不会增加 Token。
- 切换生成来源仍然只影响之后的新回复，既有主 API／独立 API兔子镜继续共存。

---

## 1.2

## 1.2.0 — 正式公开版（2026-08-01）

- 以 `1.1.0-beta.14.68-test` 的实际源码作为功能基线，转换为公开仓库正式版本。
- 新增跟随当前 API／独立 API 双生成方式，以及各自的正文内嵌、外置和外置后内嵌显示。
- 模式切换只决定之后的新回复；已有主 API与独立 API兔子镜尽量共存并按精确聊天、消息、Swipe与正文版本恢复。
- 独立 API加入稳定正文等待、重复请求隔离、失败可重说、逐回复历史和挨打猫事务式重生成状态。
- 外置圆框按镜面主背景生成同色系配色；纯外置与等待状态保留可见圆框，外置后内嵌成功后自然融入正文。
- 维修兔结果可写回独立镜面缓存，正文、`message.mes`、`display_text` 与Swipe数据保持隔离。
- 动态视觉场景强化模型执行顺序，并合并生成结束附近的视觉扫描调度；不使用持续扫描。
- 正式版元数据、运行时版本、模块缓存标识、主页、设置页品牌和公开文档统一更新为 v1.2。
- 保留原有有限个人使用许可证；本次转换不改变许可范围。

---

# v1.2 开发历史

## 1.1.0-beta.14.68-test — 主副 API 切换分界修复

- 从“跟随当前 API”切换到“独立 API”时，只影响切换后的新回复；切换瞬间已经存在的正文版本不会被副 API自动补生成。
- 已经包含跟随正文 API兔子镜的消息，在独立模式启动、恢复、聚焦或页面重挂载时也不会重复生成第二面兔子镜。
- 为每个聊天记录切换分界；进入其他旧聊天时不会给历史尾消息自动补镜，新产生的消息仍正常走独立 API。
- Swipe或正文重说会显式解除对应消息的旧版本分界，允许新版本生成；挨打猫手动重说使用强制路径，不受自动跳过限制。
- 未修改主／副 API Prompt、缓存格式、显示模式、外框取色、正文或 Swipe数据。

## 1.1.0-beta.14.67-test — 挨打猫重说可见状态

- 点击挨打猫“重新生成”后继续保留当前成品，避免整块消失；同时在同一宿主顶部显示“正在重新生成兔子镜”，直到新结果成功提交。
- 提示同时覆盖纯外置与“外置后内嵌”完成后的自然内嵌状态，不再只有纯外置才能看到“重说中”。
- 旧镜在等待期间轻微降透明度，成功后原位替换；失败、取消、切换生成来源或恢复旧成品时都会清除提示与 `aria-busy`。
- 状态提示为真实 DOM `role=status`，不新增轮询、Observer、动画、API 请求或 Token。

## 1.1.0-beta.14.66-test — 动态视觉场景强化与扫描去重

- Visual Scenery 使用场景优先施工顺序，降低 Gemini 退化为静态卡片、播放器或弱动效头图的概率。
- 要求前景／中景／背景、主要持续动画、协同环境动态以及一条自然场景交互。
- 本地扫描新增动态场景专属风险标记，但不自动重生成，不增加 API 请求。
- 同一回复的 MESSAGE_RECEIVED／GENERATION_ENDED／GENERATION_STOPPED 扫描任务合并为唯一两次，减少重复调度。

## 1.1.0-beta.14.65-test — 副 API 失败状态可直接重说

- 修复新正文对应的副 API 兔子镜失败后只显示不可交互的 CSS 提示、没有挨打猫入口的问题。
- 失败状态改为真实的 `<details>` 错误面板，标题栏重新安装挨打猫，内容区同时提供“重新生成兔子镜”和“打开挨打猫”按钮。
- 直接重说沿用当前聊天、mesid、Swipe 与正文版本身份；旧正文的旧镜面不会重新显示到新正文旁边。
- 自动迁移 beta.14.54～beta.14.64 已经留下的 CSS-only 失败宿主，无需手动清理缓存。
- 未修改 Prompt、正文、Swipe、主／副 API 参数、外框取色、显示模式或生成时序。

## 1.1.0-beta.14.63-test — 双来源镜面共存与主 API 染色框恢复

- 修复切换到“跟随当前 API”后，既有副 API 兔子镜在消息 DOM 重建时不再恢复的问题；主 API 模式现在也会只读查询副 API 精确版本缓存并被动重新挂载，不发起副 API 请求。
- 切换生成来源前先快照当前已挂载的副 API 成品；切换只决定之后的新回复使用哪条生成链，既有主 API／副 API 兔子镜互不删除。
- “跟随当前 API＋正文下方”在存在历史副 API 外置镜时安装轻量 DOM 恢复观察器，只处理相关消息节点；不启动副 API 生成轮询。
- 恢复跟随主 API 外置镜的可见同色系圆角框：宿主增加 6px 染色留白，内部兔子镜不改色、不改布局，也不增加 API 请求。
- 未修改 Prompt、正文、Swipe、维修兔、挨打猫、主／副 API 请求参数与生成时序。

## 1.1.0-beta.14.57-test — 副 API 闭环、维修持久化与主背景同系外框

- 挨打猫反馈直接加入副 API Prompt；未选择时不追加字符，成功提交后才登记并消耗轮数，失败、取消、过期结果和旧请求晚到均不消耗。
- 副 API 维修兔通过独立持久化事件把修复后的当前 `<details>` 写回对应聊天／消息／Swipe／正文版本缓存，并保存修复前版本到历史。
- 正文身份加入 `display_text` 指纹；新增 beta.14.56 及更早 sourceHash 的兼容别名，避免升级后丢失旧缓存。
- 挨打猫动作桥增加显式聊天键校验；输出整理器等待 `#chat` 的临时 MutationObserver 改为模块级句柄，可在销毁时断开。
- 外框染色改为“主背景优先”：优先读取实际渲染背景，再读取主承载容器的 `background-color`／背景声明。黑底保持黑灰系，米黄保持米黄系，绿色保持绿色系；强调色不再反客为主。
- 纯外置与外置后内嵌继续复用同一个宿主和同一组 CSS 变量；同一镜面只计算一次主色，不增加持续扫描或 API 请求。
- 保留原有三层暗色限制，不修改兔子镜内部视觉、正文、主 API Token、母本库或生成架构。

## 1.1.0-beta.14.56-test — 外置圆框安全染色

- 只对副 API 外置宿主增加轻量专属染色，不修改兔子镜内部视觉、正文、Prompt 或生成逻辑。
- 从当前兔子镜已有 CSS 色值中选择代表色；黑色、近黑色、透明色和近白色不会直接作为外框底色。
- 外框背景始终与白色高比例混合，深色兔子镜也只得到浅色同系圆框，不会整框变黑。
- 取色失败时自动保留原白色圆角框。
- 纯外置与外置后内嵌复用同一宿主 CSS 变量，移动同一 DOM 时颜色不会丢失，也不会发起额外 API 请求。

## 1.1.0-beta.14.56-test — 新回复生成期间立即显示外置占位框

- 修复全新第二条及后续助手回复在流式生成期间没有任何副 API 外置宿主，用户无法判断兔子镜是否会生成的问题。
- 新助手消息 DOM 一出现即创建唯一白色圆角占位框；正文生成中显示“等待正文完成”，正文结束后同一宿主切换为“正在生成中”。
- 占位只建立宿主，不提前调用副 API；正式结果仍通过原有稳定正文、单任务和旧请求隔离链生成，并在同一 DOM 中原位替换。
- 流式正文指纹变化时只更新同一占位宿主的身份，不把它误判为旧正文镜面，也不创建第二个宿主。

## 1.1.0-beta.14.54-test — 正文重说旧镜占位隔离

- 区分“挨打猫重说兔子镜”和“SillyTavern 重说正文”：前者保留旧镜直到新镜成功，后者立即停止显示旧正文版本的兔子镜。
- 正文重说开始时不删除唯一宿主，而是隐藏旧 details，并在原白色圆框中显示“正文正在更新”占位。
- 新正文对应兔子镜成功后原位替换并清除占位；失败时保留宿主并显示可重说提示，不把旧镜重新显示到新正文旁。
- 新增只针对当前尾部助手消息的请求取消与宿主状态标记；新用户消息触发的新回复不会误隐藏上一条回复的兔子镜。
## 1.1.0-beta.14.53-test — 外置塌缩与统一白色圆框修复

- 修复纯外置宿主使用 `contain: layout style` 与 `overflow:hidden` 时，把绝对定位、变形或超出普通流的兔子镜内容裁成一条直线的问题；外置宿主改为 `contain:none` 与 `overflow:visible`。
- 纯外置与“外置后内嵌”现在复用同一套白色圆角边框、白底与柔和阴影；移动同一 DOM 后不再清空圆框样式。
- 本版只调整副 API 宿主布局 CSS，不修改缓存、历史、生成请求、Prompt、正文或兔子镜内部配色。

## 1.1.0-beta.14.52-test — 生成来源切换保留与旧键恢复

- 切换到“跟随当前 API”时不再删除已经生成的副 API 外置/内嵌宿主；切换只影响未来生成来源。
- 增加 beta.14.50 旧聊天键兼容：可按旧 `chat/mesid/swipe` 与旧 `chat/mesid/swipe/sourceHash` 键恢复缓存和历史，并迁移到当前完整版本键。
- 修复 beta.14.51 中宿主被删除后，切回独立 API 仍找不到旧外置兔子镜的问题。

## 1.1.0-beta.14.50-test — 旧外置缓存兼容恢复

- 修复 beta.14.49 的严格空壳检测在启动同步时误判并删除旧外置兔子镜缓存。
- 新结果继续严格拒收空壳；持久化旧结果改用宽松结构恢复，支持默认隐藏、交互后显示和嵌套容器型旧镜面。
- 兼容 beta.14.47 及更早版本的正文-only `sourceHash`，避免加入思维链指纹后把旧记录全部视为失配。
- 输出缓存已被 beta.14.49 移除时，按聊天／消息／Swipe／正文指纹从“兔子镜历史”恢复。
- 热更新前快照当前已挂载镜面，旧运行时清理后回填；普通同步不再破坏性删除无法确认的历史记录。
- 未修改新镜面空壳拦截、维修隔离、后台生成、配色冷却、Prompt、Token 或原始白色外置圆框。

## 1.1.0-beta.14.49-test — 副 API维修隔离、后台续跑与暗色冷却

- 副 API兔子镜的维修兔不再读取、重绘或写入 `mes`、`swipe`、`display_text`；强制维修只作用于当前镜面。
- 副 API成功结果必须包含真实可显示主体；只有标题或 CSS 的空壳直接判失败，不保存、不交给维修兔补写。
- 正文生成结束后立即在后台预启动副 API请求，实际显示仍等待正文＋思维链稳定；切回页面会自动同步与补挂载。
- 独立 API结果正式写入视觉签名／调色板历史，连续暗色时下一轮主动回避黑色、近黑色与透明主承载面。
- 加入明确的非透明主背景约束，不修改生成完成后的兔子镜内部 CSS，也不恢复外框自动染色。

## 1.1.0-beta.14.48-test — 状态机收口、挨打猫重说与可逆维修

- 挨打猫“重说／兔子镜历史”不再只依赖外置宿主层级：宿主与镜面写入稳定 owner 元数据，并通过当前运行时动作桥直接定位聊天、消息、Swipe 和记录 key；旧事件委托保留为回退。
- 独立 API 只在正文与可用思维链共同稳定 2.8 秒后生成；取消旧的 12 字门槛，短回复也能生成。
- 使用 AbortController 真正中止正文重说、Swipe、聊天切换、生成方式切换、API 设置变化、停用和热更新前的旧请求；旧任务无法回写新正文。
- 同一聊天、消息、Swipe、来源指纹只保留一个轮询、一个飞行任务和一个宿主；异步重新配置增加序列锁，避免并发安装两套宿主事件。
- MutationObserver 识别后来插入的旧版外置宿主并触发身份合并；纯外置与外置后内嵌只迁移同一 DOM。
- 维修兔“返回修复前”改为保存并换回原始 DOM 节点，保留原节点监听与运行状态；快照按聊天／消息／Swipe／外置 key 隔离并限量。
- 删除全局强制 summary 高度与 display 的“直线修复”样式；只在布局稳定后仍真实塌陷时从完整缓存重建当前镜面。
- 当前结果和历史按 UTF-8 实际字节预算裁剪；视觉扫描器、独立 API 与输出整理器的监听器／定时器均可在热更新时清理。
- 副 API 增加无 temperature 但保留最大输出的兼容档，并限制上下文总字符量。
- 失败卡片继续只显示失败原因；卡片内“重新生成／检测 API”及相关运行逻辑保持删除。
- 保留 beta.14.34 最初外置圆框，不恢复自动取色或整框染色。

## 1.1.0-beta.14.47-test

- 删除 beta.14.35-14.46 加入的背景色提取、整框染色、主题变量和主／副 API 自动补色逻辑。
- 独立 API 恢复 beta.14.34 最初的外置圆框样式；“外置后内嵌”恢复透明宿主，不再额外包一层染色框。
- 页面恢复时仅清理旧缓存遗留的 `data-rabbit-mirror-auto-frame*` 与 `--rm-auto-frame-*`，不修改兔子镜内部 HTML/CSS。
- 挨打猫重说与历史、单宿主模式切换、正文稳定生成、维修回退均保持不变。

## 1.1.0-beta.14.46-test
- 修复挨打猫“重说/兔子镜历史”误报当前兔子镜不支持：补齐宿主到消息索引的反查，并兼容纯外置、外置后内嵌与旧缓存迁移宿主。
- 重说仍仅作用于当前副 API 兔子镜，不修改正文。

## 1.1.0-beta.14.45-test

- 修复“纯外置”切换到“外置后内嵌”时复制第二个宿主：显示模式切换现在只迁移同一 DOM。
- 同一聊天、消息、Swipe、正文指纹的旧外置与内嵌宿主按身份合并，只保留一条完整结果。
- 显示模式切换不会重新请求副 API，也不会新增历史版本。

## 1.1.0-beta.14.44-test
- Added a cross-module/global in-flight lock keyed by chat, message, swipe and正文 fingerprint so duplicate trigger paths cannot start two independent 兔子镜小剧场 requests.
- Added DOM identity deduplication and startup recovery that keeps one newest valid host per reply.
- Added collapsed legacy-host recovery: invalid/empty ready shells are rebuilt from the saved complete HTML, preserving open state.

## 1.1.0-beta.14.43-test

- 修复正文重说时消息节点短暂消失导致稳定生成轮询直接退出、当前回复永远不再补生成兔子镜的问题。
- 稳定生成调度在 30 秒窗口内容忍消息替换，并在新正文重新出现后重新计算 2.6 秒安静窗口。
- source-aware 的 latest 调度统一走同一条可恢复轮询链，避免旧任务作废后没有新的入队机会。
- 不修改圆润染色框、挨打猫重说与历史、维修回退、Prompt 或 Token 逻辑。

## 1.1.0-beta.14.42-test
- Independent API generation now polls the selected reply source and requires a 2.6-second continuous stable window after regeneration events, preventing an early reasoning-pass 兔子镜小剧场 and a later duplicate.
- Maintenance Rabbit captures the current mirror DOM before a repair route changes it.
- Added “返回修复前” to Maintenance Rabbit; it restores only the current mirror and leaves chat text/history untouched.

## beta.14.40 — 正文重说提交锁与安全内嵌锚点

- 修复正文“重说”完成后，新正文与新兔子镜短暂出现、随后被旧 Swipe／旧缓存状态回写的问题。
- “外置后内嵌”的专属 anchor 从 `.mes_text` 内部迁移为紧邻 `.mes_text` 的消息级 sibling，保持原有视觉位置，但不再参与 SillyTavern 正文序列化、替换或提交。
- 独立兔子镜缓存恢复改为正文指纹严格匹配；正文变化后旧缓存立即失去回写资格。
- 副 API 任务新增逐消息修订号，旧请求即使在正文内容短暂往返时也不能落地覆盖新结果。
- 未修改正文内容、display_text、历史 Swipe、Prompt、Token、外置宽度、整框取色或挨打猫历史。

## beta.14.39 — 整框取色、挨打猫重说与逐回复历史

- 把插件原本的白色圆角框整体染成兔子镜自身背景色的柔和版本；保留圆角、留白、阴影及模型自带内框。
- 移除维修兔中的“强制删除兔子镜”。
- 独立 API 兔子镜的“重说”移入挨打猫菜单；重说前自动保存当前版本。
- 挨打猫菜单新增“兔子镜历史”，按聊天、消息与 Swipe 查看该回复下最多 10 个版本。
- 历史预览不替换当前兔子镜，不修改正文、display_text、Prompt 或 Token。

## beta.14.38 — 自动取色保守化与原框保护

- 修复自动取色覆盖模型原本深色／渐变标题栏的问题：外层 details 或 summary 已有明确背景、边框、阴影或文字设计时，完整保留原框，不再改成内层卡片的颜色。
- 普通默认外框只添加轻微标题色调与边线强调，不再重写标题文字颜色、外置 shell 背景或阴影。
- 取色只查看 details 自身与最外层视觉容器，不再深入扫描正文、反馈卡或第二状态，避免暖色内页把深色主框染成橙色。
- 无可靠背景色时保持原样，不再套用灰蓝兜底色。
- 未修改外置宽度、主／副 API 生成、Prompt、Token、正文、自适配或交互逻辑。

## beta.14.37 — 正文刷新后独立兔子镜同步再生成

- 修复“外置后内嵌”模式下，SillyTavern 刷新／重新生成正文后仍沿用旧副 API 兔子镜：成功记录新增正文指纹，生成结束、停止或 Swipe 完成时比对当前正文。
- 正文指纹改变时，旧缓存立即失效，并按新正文重新调用副 API；完成后仍按当前显示方式回到对应位置，不复制第二份。
- 副 API 请求进行中若正文再次变化，旧请求结果会被丢弃，并只为最新正文重新调度。
- 聊天首次打开与普通 DOM 重绘不会主动重生成旧兔子镜，避免升级后整段历史记录批量消耗 API。
- 未修改外置宽度、自动取色、Prompt、Token、正文、display_text、点菜或正 API 行为。

## beta.14.36 — 独立 API 失败按钮触控热修

- 修复 iPhone/Safari 独立 API 失败卡片“重新生成／检测 API”可见但点击无反应：在 window 捕获层优先接管两个专属动作，避开 document/chat 捕获链提前拦截。
- 保留按钮节点直接绑定作为兼容回退，并提高失败动作区点击层级与最小触控高度。
- 未修改自动取色、显示方式、外置宽度、Prompt、Token、正文或副 API 请求参数。

## beta.14.35 — 主／副 API 兔子镜外框自动取色

- 主 API 正文内兔子镜与独立 API 纯外置／外置后内嵌兔子镜，生成完成后均从自身主体背景一次性提取主题色。
- 只给最外层 details、summary 与独立外置 shell 写入边框／标题变量；不修改兔子镜内部卡片、媒体、动画、Grid、Flex 或媒体查询。
- 深浅背景自动选择标题文字对比色；透明或无法识别的背景使用稳定中性色。
- 取色仅在新镜面完成、旧缓存恢复或 Swipe 重绘后的首次安装执行，不持续监听动画。
- Prompt、Token、正文、display_text、点菜、副 API 请求与外置宽度均未修改。

## beta.14.34 — 移除标题栏重说入口

- 移除独立 API 兔子镜标题栏中的 `↻` 重说按钮。
- 升级后会清理旧缓存外置兔子镜中遗留的重说按钮。
- 失败卡片中的“重新生成 / 检测 API”继续保留。
- 纯外置 / 外置后内嵌、强制删除与默认最大输出 12000 均保持不变。

## beta.14.33 — 独立显示双模式、重说与强制删除

- 独立 API 显示方式新增：① 纯外置；② 外置后内嵌。
- 标题工具栏新增 ↻ 重说；只重新生成当前兔子镜，不重说正 API 正文。
- 维修兔菜单新增“强制删除兔子镜”；独立 API 会同时写入当前消息/Swipe 删除标记，避免重绘后恢复。
- 独立 API 默认最大输出改为 12000；已有用户手动设置不强制覆盖。
- 未修改 Prompt、美化母本、点菜、Token、正文、display_text 与历史 Swipe。

## 1.1.0-beta.14.35-test

- 修复 SillyTavern Swipe／“重新生成”替换整条 `.mes` 后，独立外置 shell 停留在旧 DOM 槽位、视觉上跑到新正文上方的问题。
- 外置 shell 仍只绑定 `chatId + mesid + swipeId`，不新建内置副本；当前 owner 节点被替换后，只在 shell 位于新 owner 之前时重新锚定到正文之后。
- 消息替换的短暂空档会隐藏旧 shell；新正文出现后恢复，若消息确实被删除则延迟清理孤儿 shell。
- `MESSAGE_SWIPED`、生成结束／停止事件会同步触发宿主重新锚定；不修改正文、外置宽度、Prompt、Token 或兔子镜内部自适配。

## 1.1.0-beta.14.31-test

- 修复独立 API 外置结果的最终净化入口：完整 `<details>` 不再依赖“作品长度/标签数量”启发式判断，成功结果、旧缓存和现存外置 DOM 都会强制经过逐镜 class、keyframe 与损坏标签清理。
- 修复“CSS 已有逐镜前缀，但 `<divclass=...>` 修复后仍保留原始 class”问题：为当前 scope 的旧前缀 class 建立后缀别名，恢复对应样式。
- 为外置结果写入净化版本标记；升级后会重新整理旧 beta.14.29/14.30 DOM，保留展开状态与维修兔、挨打猫节点。
- 增加已净化 HTML 的小型内存缓存，避免同一条长兔子镜在酒馆重绘时重复执行整套字符串清理。
- 外置宽度、内置自适配、Prompt、美化母本、点菜、Token、副 API 请求与自动维修业务规则未修改。

## 1.1.0-beta.14.30-test

## beta.14.30 — 动画、交互 ID 与损坏标签隔离

- 为每面兔子镜生成逐镜唯一的 keyframe 名称，并同步改写 style 块与 inline style 的 animation 引用，阻断多条永久外置兔子镜之间的全局动画名覆盖。
- 独立 API 结果在进入外置宿主前执行纯结构 ID 隔离，不启动额外交互兜底；同步 label、CSS、ARIA、href、SVG url(#id) 与 radio name。
- 增加通用的首属性粘连标签修复，覆盖 `<divclass>`、`<labelclass>`、`<labelfor>` 等及其损坏闭标签。
- 外置宿主宽度、内置模式、Prompt、Token、点菜和 API 请求策略未改。

## beta.14.29 — 外置宿主跨设备宽度适配

- 仅调整独立 API 外置宿主的视口宽度：手机保持 beta.14.28 的舒适宽度，平板、普通电脑与超宽屏分别使用独立比例和最大宽度封顶。
- 所有新规则只命中 `data-rm-source="independent"` 的外置 shell，不命中内置兔子镜、跟随当前 API 模式、`.mes_text` 或兔子镜内部生成内容。
- 未新增对子元素、媒体、Grid/Flex 或兔子镜内部 `max-width` 的覆盖；原有自适配继续由每面兔子镜自己的 CSS 决定。

## beta.14.28 — 稳定舒适宽度与内外一致性热修

- 撤销 beta.14.27 对每条 `.mes_text` 实时宽度的复制；该宽度会在手机渲染、状态栏或其他扩展插入时短暂缩窄，导致同一套兔子镜随机出现窄版。
- 独立 API 外置宿主统一采用稳定的聊天区相对宽度：手机目标约 84%，居中，最大 620px；窄屏自动保留安全边距。
- loading／ready／error 共用同一宽度，不再因生成内容、消息状态或横竖屏变化重新取样。
- 外置 `<details>` 的直接内容限制在宿主内，但不改变兔子镜自身的布局、比例、交互和美化规则。
- 仍保持 message-sibling 隔离、永久边框以及每消息／每 Swipe 唯一外置宿主。


- 保留 beta.14.26 的 message-sibling 隔离宿主，但外置模块宽度改为跟随所属消息的 `.mes_text` 实际矩形，恢复此前舒适的左右留白，不再铺满整个 `#chat`。
- 外置 shell 自身提供持续存在的边框、圆角与背景；loading、ready、error 以及折叠／展开状态均使用同一有框模块，不再在生成完成后退化为无边框标题。
- 生成结果、Prompt、美化母本、点菜、Token、自动维修业务规则和 `userRequestOverrideRules.js` 未修改。

## 1.1.0-beta.14.26-test

- 独立 API 兔子镜改为 `#chat` 下、整条消息之后的专属 sibling shell，不再挂入 `.mes_text`、状态栏或其他插件容器。
- loading、ready、error 始终复用同一 shell；完成态只替换 shell 内部内容，不再重排宿主。
- shell 绑定 chat / mesid / swipe，并由消息级查询恢复；新消息与其他插件插入节点不会删除或搬动旧 shell。
- 维修兔、挨打猫与诊断链可通过 shell owner 元数据定位原消息，不依赖 `closest(.mes)`。
- 外置 shell 全宽、无额外 padding/max-width，并使用 兔子镜小剧场 专属命名空间和 `isolation:isolate`，降低与其他插件样式及 DOM 管理冲突。

## 1.1.0-beta.14.25-test
- 独立 API 每条助手消息/Swipe 使用稳定槽位保存，外置宿主不会因正文哈希或后续消息变化丢失。
- 独立结果只保留在消息级外置宿主，并在宿主被酒馆重绘移动时恢复到正文后、状态栏前。
- 外置宿主与消息正文同宽，不增加横向 padding 或 max-width。
- 修复模型常见的 `<labelfor>` 等丢空格标签，并将 label[for] 重映射到隔离后的真实控件 ID。

# 1.1.0-beta.14.25-test

- 独立 API 去重键改为“聊天 + 消息序号 + Swipe”，同一条消息/Swipe 同时只允许一个生成任务。
- `MESSAGE_RECEIVED`、`CHARACTER_MESSAGE_RENDERED`、`MESSAGE_UPDATED` 仅刷新已有外置 UI，不再启动副 API；只在生成结束、停止、Swipe 或聊天载入后的稳定阶段启动。
- 请求完成前若正文或 Swipe 已变化，旧结果会被判定为过期并丢弃，不会先显示 A 再被 B 覆盖。
- 加载、成功、失败继续复用最初建立的同一个外置宿主；宿主一旦连接后不再因 ready/error/tool 更新重新插入，避免成功后改变到状态栏下方。
- 不修改 Prompt、美化母本、点菜、Token、自动维修、副 API 参数或正式版。

# 1.1.0-beta.14.23-test

- 修复 iPhone/Safari 外置失败卡片“重新生成”“检测 API”可见但点击无反应：按钮节点直接绑定 pointerup + click，不再依赖 window/document 捕获委托。
- 长度截断错误会显示当前最大输出值；低于 8192 时给出明确提高建议。
- 不修改 Prompt、美化母本、点菜、Token、自动维修或副 API 请求参数策略。

## 1.1.0-beta.14.22-test

- 独立 API 生成改为流式优先，避免长时间无首字节导致反向代理 HTTP 524。
- API 检测使用 32 Token 极小请求，降低等待时间与消耗。
- 524/HTML 网关错误不再整页显示，改为明确的超时摘要。

## 1.1.0-beta.14.22-test

- 修复独立 API 失败弹窗中“检测 API／重新生成”在手机端点击无反应。
- 失败操作委托从 document 捕获层提升到 window 捕获层，先于维修兔／挨打猫的文档级拦截处理。
- 不改变独立 API 请求、Prompt、外置宿主或自动维修逻辑。

# 1.1.0-beta.14.22-test

- 修复手机端高频循环：聊天工具观察器仅监听结构插入，不再监听 class/style/hidden/characterData。
- 外置兔子镜内部 DOM 与工具节点变化不再触发维修兔/挨打猫重新扫描。
- 独立 API 观察器忽略移除节点与自身外置宿主变化，避免宿主校正与工具安装互相触发。
- 宿主事件引起的全聊天工具扫描合并为单次 180ms 去抖。

## 1.1.0-beta.14.22-test

- 撤销必须额外安装 兔子镜小剧场服务端桥接插件 的方案。
- 模型列表、测试连接、失败检测、重新生成和正式生成统一复用 SillyTavern 内置 `/api/backends/chat-completions/status` 与 `/api/backends/chat-completions/generate`。
- 副 API Key 通过 Custom Chat Completions 的自定义请求头传递；不修改酒馆当前主 API 设置，也不写入 SillyTavern secrets。
- 不使用浏览器跨域直连、通用 `/proxy/` 或 `enableServerPlugins`，只安装一个前端 ZIP 即可。
- 保留 beta.14.18 的外置宿主锁定、自动维修状态保持、维修兔与挨打猫逻辑。

## 1.1.0-beta.14.22-test

- 独立 API 的加载、成功与失败状态现在始终锁定在同一个消息级外置宿主中。
- 成功内容只替换外置宿主内部的 details；即使酒馆重绘或其他扫描器尝试移动节点，也会按所有权标记恢复到 `.mes_text` 外侧。
- 不改独立 API 服务端桥接、Prompt、点菜、Token、维修兔或挨打猫业务逻辑。

## 1.1.0-beta.14.22-test

- 独立 API 模型列表、连接检测与正式生成统一改走 兔子镜小剧场 服务端桥接插件。
- 不再依赖浏览器 CORS，也不再访问 SillyTavern 通用 `/proxy/`。
- 新增配套 `server-plugin-rabbitmirror-independent-api`，路由为 `/api/plugins/rabbitmirror-independent-api/fetch`。
- 服务端桥接插件缺失时给出明确安装提示，不再静默回退到错误连接方式。

# 兔子镜小剧场更新记录

## 1.1.0-beta.14.22-test
- Independent API requests are now direct-only across model fetch, generation, retry and diagnostics.
- Removed every automatic SillyTavern `/proxy/` fallback that could trigger an HTTP Basic Auth credential dialog.
- Browser requests explicitly omit same-site credentials; direct CORS/TLS/network failures are reported without touching the protected Tavern route.

# 1.1.0-beta.14.22-test

- Fixed settings drawer stutter on mobile: removed automatic memory-provider scanning when the UI mounts or opens.
- Independent API fields no longer save the full extension settings object on every `input`/autofill event; text credentials save on change/blur and selectors/numbers save on change.
- Added layout/paint containment for settings sections and disabled the summary arrow transition on mobile.
- No generation, Prompt, picker, token, 兔子镜小剧场 output, independent API request, maintenance rabbit, or feedback cat behavior changed.

## 1.1.0-beta.14.22-test

- 模型列表拉取改为仅浏览器直连，不再在直连失败时自动访问 SillyTavern `/proxy/`。
- 避免启用酒馆访问认证时，点击“拉取模型”触发新的账号密码登录弹窗。
- 生成请求、参数兼容重试、失败重试与 API 检测链保持 beta.14.13-test 行为。

## 1.1.0-beta.14.13-test

- 独立 API 失败折叠页新增“重新生成”和“检测 API”按钮。
- 重新生成复用当前消息级外置宿主，并按当前消息与 Swipe 强制重新请求。
- API 检测先检查 `/models`，再发送一次极小真实生成请求，报告模型可见性、参数模式、代理路径与返回结果。
- 失败操作使用 document 捕获委托并在停用/热更新时解除，避免酒馆重绘后按钮失效或监听累积。

## 1.1.0-beta.14.13-test

- 独立 API 外置兔子镜从“生成中”阶段就使用完整原生折叠标题，并立即带有维修兔与挨打猫。
- 加载、成功、失败共用同一消息级外置宿主；成功更新时迁移并保留现有工具节点，避免按钮晚出现、闪动或重复挂载。
- 加载状态禁止自动巡逻；点击工具仅提示仍在生成。

# 1.1.0-beta.14.13-test

- 独立 API 请求不再只发送单条 system 消息。
- 新增 system+user、user-only 两类 Chat Completions 兼容请求。
- Chat Completions 均被参数错误拒绝时，继续尝试 Responses API。
- 成功的端点与消息格式仍按 API 地址+模型记忆。

# 1.1.0-beta.14.13-test

- 自动巡逻改为状态保持模式：不再安装会显隐正文的 focus-within / cross-parent / :has() 视觉桥接。
- 自动巡逻前后恢复 checkbox、radio 与 details 的原有 checked/open 状态，避免内容被提前展开或点击失效。
- 结构性高置信修复仍自动执行；视觉与第二层状态修复继续要求手动点击维修兔。

# 1.1.0-beta.14.13-test

- 独立 API 参数兼容重试：自动尝试 max_tokens / max_completion_tokens、去除 temperature/stream 与最小请求体，并按 API 地址+模型记住成功组合。
- 失败提示会列出已尝试的参数模式。

# 1.1.0-beta.14.13-test

- 外置兔子镜恢复为与正文内一致的原生 `<details><summary>【兔子镜：标题】</summary>` 折叠形态，仅改变挂载位置。
- 移除外置状态栏中的时间、角色信息、图标与二次开关，不再包裹额外主题 UI；兔子镜继续使用自身背景与配色。
- 外置运行时仅在“独立 API”或“跟随当前 API + 外置”模式下安装；正文内模式不安装聊天区观察器或宿主事件监听。
- MutationObserver 改为 120ms 去抖的消息级增量同步，忽略 兔子镜小剧场 自己新增的外置节点与工具入口，不再每次 DOM 变化扫描整段聊天。
- 宿主 eventSource 回调保存引用并在模式切换/停用/热更新时逐一解除；新增全局 cleanup，防止多版本热更新后监听累积。
- `syncMessages` 每轮只读取一次独立输出缓存；普通插件面板开关不再触发 兔子镜小剧场 全聊天重建。

## 1.1.0-beta.14.13-test

- 独立 API 外置兔子镜改为消息底部状态栏式折叠面板，不再使用右侧胶囊或全屏模态框。
- 修复入口同时绑定自身监听与 document 捕获委托导致一次点击被连续开关、表现为无法展开的问题。
- 状态栏和展开面板根据兔子镜实际背景色提取主题色，并自动选择可读前景色。
- API 地址输入允许数字 IP、端口和无协议地址；数字地址无协议时默认按 HTTP 处理。
- 浏览器直连因混合内容、CORS 或证书失败时，自动尝试 SillyTavern `/proxy/` 同源代理；代理不可用时显示具体配置提示。

## 1.1.0-beta.14.13-test
- 外置兔子镜入口改为每条消息/Swipe 单实例，修复生成中与成功入口重复堆叠。
- 外置入口改为完整构建后一次性插入，并清理同来源残留实例。
- 增加按钮自身点击监听与 document 捕获委托双保险，适配 SillyTavern 重绘/克隆。
- MutationObserver 改为微任务去抖并增加同步重入保护。

# 1.1.0-beta.14.13-test

- 修复独立 API 请求已成功但前端误判“兔子镜生成失败”的响应解析问题。
- 兼容 OpenAI content 字符串/数组、Responses output、Gemini candidates.parts、Anthropic content、SSE/NDJSON 与纯文本返回。
- 接受完整裸 `<details>` 兔子镜，不再强制服务商必须保留 `<toto>` 外壳。
- 对空正文、非完整兔子镜与输出截断分别显示更准确的失败原因和 finish_reason。

## 1.1.0-beta.14.13-test

- 测试仓新增“维修兔自动巡逻（测试）”本地开关，默认关闭。
- 开启时只对之后新生成或重新生成的兔子镜自动尝试一次高置信安全修复。
- 自动范围仅包括局部 ID/radio 隔离、精确 radio 取消程序、唯一缺失 checked 控制类、无 label focus-within 持久桥接、局部 checked/:has 状态桥、WebKit 3D 前缀。
- 手机排版、网格重排、静态内容改交互、源码恢复、内容猜测仍保持手动。
- 自动巡逻完全在本地运行，不增加 Prompt 或 Token。

## 1.1.0-beta.14.2

- 修复模型在 CSS 中写出 `.trigger:checked`，却遗漏将该 class 放到唯一隐藏 checkbox/radio 上时，label 可勾选但前后层永远不切换的问题。
- 仅在原始源码可证明：缺失 class 唯一、候选控件唯一、控件已有 label，且补上 class 后至少一至两条局部 `:checked` 规则能命中有正文的状态层时恢复。
- 只给当前兔子镜中的对应控件补回模型已经引用的 class；不执行脚本、不创建新分支、不改写正文，也不影响其他镜面。
- 维修兔诊断新增“checked缺失控制类恢复”统计；Prompt、点菜、随机抽取、母本库、Token、挨打猫及工具入口稳定性逻辑未改。

## 1.1.0-beta.14.1

- 正式仓库 SillyTavern 适配热修：维修兔与挨打猫改用独立工具入口容器，并以运行时内联 `!important` 样式隔离兔子镜自身的 `button`、`summary > *`、透明度、位移与裁切规则。
- 维修兔状态图标改为真实按钮文本，不再只依赖 `::before`，避免伪元素被宿主或局部 CSS 清除后入口看似消失。
- 新增聊天区捕获阶段事件委托；酒馆重绘、克隆或替换消息 DOM 后，即使节点属性被保留但原监听器丢失，两个入口仍可点击。
- 已存在的入口不再只做“存在即跳过”，每轮重挂载都会恢复容器位置、可见性、点击能力与当前版本。
- 观察器补充 `style` 节点、局部 class/style/hidden 变化及样式文本变化；兔子镜 CSS 晚于按钮到达时也会重新校正。
- 每面兔子镜的内部 details、维修兔、挨打猫安装分别隔离异常，一个复杂镜面失败不会阻断后续消息的入口安装。
- 不修改 Prompt、点菜、母本库、Token 统计、聊天原文、旧 Swipe 或 `display_text`。维修兔仍为手动模式。

## 1.1.0-beta.14 — 双列关系树手机保形

- 将“关系树／节点网络”从通用手机单列压缩中分离。
- 保留双列人物节点，并让展开详情在窄屏横跨两列，而不是把整棵关系图改成单列。
- 不再向关系树内部批量安装通用 fit/min/break-text 标记。
- 仅在两列网格、每列具有 label + checkbox/radio + 折叠详情，并存在关系/羁绊/节点语义时启用。

# Changelog

## 1.1.0-beta.14 — radio 取消程序局部恢复

- 修复宿主删除 `document.querySelectorAll('input[type=radio]').forEach(r => r.checked=false)` 后，恋爱游戏等 radio 分支只能进入结果、无法返回初始选项的问题。
- 只识别“固定选择器＋固定 `checked=false`”这一类安全程序；不执行任意原始 JavaScript，不把普通 label、按钮或其他脚本猜成取消操作。
- 原脚本的整页 `document` 作用域被收紧到当前兔子镜，取消时只复原本镜面的 radio 与已有 CSS 状态，不影响其他消息、旧 Swipe 或其他兔子镜。
- 取消操作会终止尚未完成的 label 状态校验，避免 0/70/240ms 的旧校验把刚取消的 radio 再次选中。
- 未修改 Prompt、点菜、随机抽取、母本库、挨打猫、Token 统计及其他维修路线；未点菜时不增加 Token。

## 1.1.0-beta.11 — 外置 checked CSS 回收与静态分段误修保护

- 修复宿主移除 `<toto>` 后，镜面作用域 `<style>` 留在 `<details>` 外侧时，控件 ID/label 已隔离但 `:checked` CSS 未同步，导致“生成报告／返回”按钮只切换 checkbox、内容区不变化的问题。
- 交互检测、checked 规则解析、3D/Touch Hover 等本地样式读取统一回收同一镜面 scope token 的外置样式，不跨镜面读取。
- 结构化静态分段急救新增明确交互意图门槛：普通漫画四格、通知卡、信息块不得被维修兔擅自改造成折叠控件。
- 升级后会撤回旧版本留在此类静态分段上的内部折叠标记与急救样式，不改原始正文和作者样式。

## 1.1.0-beta.10 — 触屏 Hover 仅接管真实第二状态

- 修复普通通知卡片的 `:hover { transform: translateX(...) }` 被错误安装为触屏持久状态，导致点击后卡片一直偏移的问题。
- 触屏 Hover 现在只接管真实揭示隐藏内容、从零尺寸展开、生成伪元素正文或执行 3D 翻面的规则；颜色、阴影、边框、平面位移、缩放等装饰 Hover 不再登记点击监听。
- 刷新扫描时会清除旧版误装的 `data-rm-touch-hover`、`data-rm-touch-hover-ready` 与对应救援 CSS；无合格候选时也会撤销当前根节点的触屏 Hover 标记。
- 真正的 Hover 第二层内容与 3D 翻面触屏兜底继续保留。
- 未修改 Prompt、主题库、展现形式库、点菜、每次重抽、挨打猫及其他维修路线；不增加模型 Token。

## 1.1.0-beta.9 — 无 label 的 focus-within 持久翻面恢复

- 修复透明 checkbox 没有 label、且背面只依赖父容器 `:focus-within` 显示时，在 iPhone Safari / WebView 中无法稳定翻面或再次关闭的问题。
- 仅在“透明绝对定位 checkbox＋同一局部容器＋原 CSS 明确揭示第二层正文”的高置信结构中建立持久状态桥接；普通焦点样式、按钮变色和静态 Hover 不接管。
- 第一次点击显示模型原有背面，第二次点击恢复正面；每张照片独立切换，并支持 Enter / 空格键。
- 原有 `:focus-within` CSS 会被等价映射到当前兔子镜内的本地状态属性，不执行模型脚本、不改写正文，也不补写不存在的内容。
- 维修兔诊断新增“无label focus-within持久桥接”统计，不再把这一结构误报为触屏 Hover 缺失。
- 未修改 Prompt、主题库、展现形式库、点菜、随机抽取、挨打猫及生成完整性逻辑；不增加模型 Token。

## 1.1.0-beta.8 — 生成完整性验收与本轮源码快照

- 生成结束后先检查兔子镜标题、正文主体、`details` 闭合及 CSS 结构；截断、空壳或样式中途结束不再视为成功输出。
- 不完整输出不会提交正式抽取历史，也不会消耗挨打猫反馈；无点菜时重说仍重新随机，有点菜时仍保持同一条用户消息的点菜组合。
- 在生成期间仅于浏览器 `sessionStorage` 保存当前消息、当前 swipe 的完整兔子镜临时快照；若完整源码后来被宿主显示链截断，维修兔可按同标题恢复。
- 所有来源都没有完整正文时，维修兔只显示不可恢复说明，并明确保持 `sourceRepair changed=false`，不再标记为已修复。
- 截断说明及其子节点不再进入“疑似隐藏内容”统计。
- 此功能全部在本地 JavaScript 中完成，不修改模型 Prompt，不增加 Token。

## 1.1.0-beta.7 — 维修兔跨容器 :has() 分支恢复

- 修复模型把 radio/checkbox 放在控制区，却把 `:has(input:checked)` 写在不包含控件的正文容器上，导致所有非默认正文永远透明的问题。
- 维修兔只在“控件明确位于 host 外、对应正文明确位于 host 内”的高置信结构中建立本地状态桥接；不执行脚本，也不补写不存在的剧情。
- 原始三组月相正文会随 radio 往返切换，不再被误判为“只有选中样式”，也不再生成虚假的缺失分支提示。
- 此路线由浏览器本地 JavaScript 与局部 CSS 完成，不修改模型 Prompt，不增加 Token。
- 未修改主题库、展现形式库、点菜逻辑、随机抽取、挨打猫或其他维修路线。

## 1.1.0-beta.6 — 维修兔静态 Hover 与隐藏候选误判修正

- 纯配色、阴影、边框和普通平面位移的 `onmouseover/onmouseout` 仅恢复桌面鼠标悬停，不再伪装成可点击按钮，也不会在触屏上形成持久选中状态。
- 只有明确揭示第二层内容或执行 3D 翻面的 Hover 才进入触屏交互急救。
- 全链路诊断不再用字符串片段判断透明度；`opacity:0.7`、`opacity:0.8` 等正常可见装饰不会再被列为“疑似隐藏内容”。
- 原始与渲染均没有 checkbox/radio 时，隔离副本验证显示“无需验证”，不再误报 `no-safe-candidate`。
- 未修改主题库、展现形式库、随机抽取、用户点菜、挨打猫或模型 Prompt。

## 1.1.0-beta.5 — 点菜同回复固定与非点菜每次重抽

- “用户指令优先”继续作为唯一总开关；未勾选时不识别点菜，勾选但没有明确点菜时不增加任何 Prompt。
- 同时识别“兔子镜”和“小剧场”的明确点菜句式；普通剧情中仅提到这些词不会误触发。
- 母本库外的点菜原文继续作为本轮最高优先要求直接注入，库内命中仅用于补充参考。
- 点菜按“聊天＋来源用户消息＋点菜内容”绑定：同一条用户消息下反复重说、重新生成或 Swipe，继续使用同一组主题、展现形式及随机补足项。
- 用户发送新的消息后，旧点菜自然失效；新消息没有点菜时恢复正常随机。
- 没有点菜时，每次新的助手生成或重说都会重新抽取，并在本地硬排除近期生成尝试中刚用过的主题与展现形式；不等待显示扫描完成。
- 同一次模型请求内部仍保留单次抽取缓存，避免 Prompt、母本检索与 Token 统计使用不同组合。
- 点菜缓存、生成尝试记录和避重判断均在浏览器本地完成，不新增模型 Prompt 或 Token。
- 更新内部缓存标识，避免覆盖安装后继续读取旧模块。

## 1.1.0-beta.4 — 本轮点菜强捕获

- 仅捕获带有“兔子镜／小剧场”明确点菜信号的指令区块，普通剧情发言和普通提及不会进入点菜 Prompt。
- 多行点菜原文完整写入本轮 Prompt，并设为最高优先；库内匹配只作为母本参考。
- 明确指定主题时不再随机补主题，明确指定展现形式时不再随机补形式；未分类自由点菜不会被随机主题或形式冲掉。
- 点菜不写入设置；新用户消息没有明确点菜时恢复正常随机。
- 更新内部缓存标识，避免覆盖安装后继续读取旧模块。

## 1.1.0-beta.3 — 用户自由点菜热修复

- “用户指令优先”开启时，母本库未收录的点菜内容不再丢失。
- 显式主题、显式展现形式与未分类点菜原文会直接写入本轮 Prompt，并高于随机抽取与母本补足。
- 自定义要求只作用于兔子镜内部，不反向改写主回复。
- 更新内部缓存标识，避免覆盖安装后继续读取旧模块。

## 1.1.0-beta.2 — Beta v1.1 索引整理版

- 重新整理结构化主题与展现形式索引顺序，使新增项目与母本库中的父子层级一致。
- 将 `11.2.1` 展现形式名称简化为“相册”，并同步结构化索引与母本库。
- 更新内部缓存标识，避免覆盖安装后继续读取旧索引。

## 1.1.0-beta.1 — Beta v1.1

- 将父主题中具有独立玩法、流程或执行要求的方向展开为正式子主题。
- 新增时间循环、身体互换、记忆丧失、每日新物种、荒野求生等可独立抽取与点菜的主题。
- 同步展开世界观、身份、种族、性转、关系、仪式与通灵类的明确独立方向。
- 普通情境修饰与仅用于举例的变体继续留在父主题内部，不机械拆分。
- 主题随机改为“先抽父主题家族，再抽家族内部项目”，避免子主题增多后抬高整类 IF 的总概率。
- 每轮仍只注入实际抽中的主题，母本检索预算与固定 Prompt 未增加。

## 1.0.0-beta.1 — Beta v1.0

- 发布 兔子镜小剧场 Beta v1.0。
- 简化设置页说明，让功能和 Token 影响更容易理解。
- “发散孵化模式”更名为“随机发挥模式”。
- “Visual Scenery”显示名称改为“动态视觉场景”，不公开具体实现方式。
- “用户指令优先”改为自由点菜说明。
- 共同回忆、挨打猫与维修兔的 Token 说明改为用户可直接理解的文案。
- “小小维修兔”更名为“维修兔”。
- 从设置页移除重复的全链路诊断入口；维修兔菜单内的诊断功能继续保留。
- 生成 Prompt、母本预算和正常每轮注入逻辑均未增加。

## 1.1.0-beta.14.13-test
- Added mutually exclusive 兔子镜小剧场 generation modes: follow the current API, or use a separately configured OpenAI-compatible API/model.
- Independent mode clears the current-model 兔子镜小剧场 injection and automatically generates one message-level external 兔子镜小剧场 after an assistant response.
- Added model-list retrieval, connection testing, fixed model selection, temperature and maximum-output controls.
- Independent context bundle includes chat messages, available stored reasoning fields, character card, Persona, world-info/author-note and extension-prompt context when exposed by SillyTavern.
- Added external presentation for follow-current-API mode without rewriting stored chat message text.
- Preserved safe auto-patrol as an opt-in test feature.
