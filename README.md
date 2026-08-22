## 1.4.30.12 TEST：恢复历史折叠镜“只做轻工作”的性能边界

- 直接基于 GitHub 1.4.30.10；不采用 1.4.30.11 的“历史 DOM 分批挂载”方案，历史镜仍按原有方式挂载。
- 延续 1.3.57 / 1.3.93 / 1.3.94 原则：CHAT_CHANGED / 全聊天恢复时，折叠历史镜只挂标题壳、工具按钮与首次打开监听；不做完整交互急救、即时维修候选巡检。
- 将后来新增但绕开旧保护的重工作纳入同一边界：历史折叠镜不启动 geometry settle、不做渲染态外框 computed-style/rect 采样、不跑 ready 主视觉 compact/wide-stage 后处理、不跑 layout-based legacy mobile row migration。
- 用户首次打开某一面历史镜时，只唤醒这一面的 geometry、外框融合、ready 后处理、移动端空间救援与既有维修兔/交互首开巡检。
- 新生成、Swipe、MESSAGE_UPDATED 等单条 targeted 更新保持原行为；独立 API Prompt、POST body、stream/retry/single-flight、世界书、视觉冷却与成品完整性门不变。

## 1.4.30.10 TEST：长聊天进入性能修复

- 聊天同步期间缓存外置兔子镜索引，避免每条历史消息反复全局扫描全部镜面。
- 稳定历史 ready 镜面不再重复 geometry / 主视觉 shell 后处理；桌面端不再跑移动端的多阶段 settle 定时器。
- 同一已健康 details 不再反复做 summary computed-style/rect 探针；已有 owner lock 时不再每次同步 clone + 序列化整面历史镜。
- 新镜面、owner DOM 替换、显示位置变化、真实 viewport resize 与移动端稳定校正仍按原逻辑处理。
- 不改变独立 API 请求、Prompt、世界书、维修兔、sanitizer 或生成内容。

## 1.4.30.9 TEST：独立 API 视觉程序完整性门

- 防止模型只返回大量 class / CSS 变量 / 状态控件，却漏掉整份样式程序时仍被当成成功成品保存。
- 只在高置信“样式程序缺失”时拒绝；正常 <style>、纯 inline-style 与简单 HTML 不受影响。
- 失败时保留原有单次请求语义，不自动重发；用户可显式重新生成。

## 1.4.30.9 TEST：聊天切换世界书 UI 性能修复

- 当前聊天切换只更新世界书数据状态；隐藏的兔子镜设置区不再同步创建世界书 checkbox DOM。
- 当前聊天相关世界书在设置区域真正可见时才延迟刷新；连续宿主事件会合并。
- “全部世界书”只有展开折叠区时才生成完整列表，关闭后立即释放列表 DOM。
- 世界书实际发送仍只复用当前主生成本轮最终激活条目；独立 API 请求链和其它功能不变。

## 1.4.30.7 TEST：当前聊天世界书 + 模型拉取防卡

- 世界书默认列表只显示当前聊天宿主实际加载过的关联书；完整世界书名单放进折叠区按需拉取。
- 一键配置不再等待远端模型列表；手动拉模型 12 秒超时并保留 Connection Manager 已保存模型。
- 独立 API 生成请求、Prompt、stream/retry/single-flight 与其它功能不变。

# RabbitMirror / 兔子镜 1.4.30.7 TEST

## 1.4.30.7 TEST：独立 API 一键复用酒馆连接

- 独立 API 设置页新增“从酒馆当前连接一键配置”：优先直接引用 SillyTavern Connection Manager 当前选中的 Chat Completion 配置；如果当前连接尚未保存为 profile，则在可安全读取的 Chat Completion 场景下创建兔子镜专用 profile。
- API Key 不复制进兔子镜设置，继续由 SillyTavern Secrets 管理；兔子镜只保存 Connection Manager profile ID 与模型选择。
- 原 Base URL / API Key 手动输入仍完整保留，移动到“高级：手动 OpenAI 兼容接口（旧配置兼容）”，可一键切回旧模式。
- 仅修改连接配置便利层；独立 API 原有 Prompt、messages、temperature、max_tokens、stream、兼容 profile、手动重试、single-flight、超时与错误语义保持不变。

## 1.4.30.5 TEST：视觉偏好末位裁决 + 可读性维修 + 外置框融合

- 唯一基线为 1.4.30.4；保留手动“重说”跳过旧 single-flight 的修复，以及 1.4.30.3 六维视觉家族冷却。
- 独立 API 近输出短锁调整优先级：近期视觉避让先执行，用户视觉偏好在其后做最终裁决；冷却不得为了“脱离暗底/亮底”反向覆盖美化主题。
- 近输出短锁增加可读性底线：关键正文、按钮、标签不得因为明暗冷却而与实际背景形成近似同色。
- 维修兔新增“严重低对比文字”巡逻与手动修复：只处理实际渲染后对比度极低、几乎不可读的正文，不碰 display:none / opacity≈0 的隐藏交互内容；修复时把文字向当前背景的高对比方向拉回。
- 独立 API 纯外置模式重新启用项目已有的 `applyExternalShellIntegration()`：标题条、边框、圆角从实际兔子镜本体采样，不再长期保持与本体脱节的独立深色/浅色标题条。
- 不修改 1.4.30.4 的请求参数、stream、retry、single-flight、新请求计费语义；不修改六维历史记录、主 API 维修兔身份识别、checked/radio、sanitizer 主体和母本。

## 1.4.30 TEST：保住整份本地 CSS，修复“隐藏内容全展开 + 外框消失”

- 1.4.26～1.4.29 的严格净化遇到任意 `@import` 会删除整个 `<style>`；这会同时丢掉外层容器边框、默认 `display:none` 与 `:checked` 显示规则。1.4.30 改成只删 `@import` 本身，本地 CSS 原样继续参与后续安全声明过滤。
- checked/radio 的 `toggle ↔ chk` 别名不再混入全局 ID map；只修真正的控件 `for` 和 checked 主体，避免再次把普通内容面板选择器改到 input 上。
- 如果 sanitizer 以后确实删除了仍含本地规则的整份 style，全链路诊断和维修兔会留下明确 finding，而不是显示“没有发现问题”。


## 1.4.29 TEST：checked 别名修复收窄，避免隐藏内容默认全展开

- 1.4.28 的回归原因是把所有破损 CSS `#id` 都纳入控件别名候选，普通结果面板/装饰节点也可能被误认成 checkbox/radio 引用；随后 CSS 隐藏/显示规则被改写到 input，原本需点击后显示的内容可能直接露出。
- 现在仅在 `label[for]` 或 `:checked` / `:not(:checked)` 明确证明“这个 id 是状态控件”时做 `toggle/chk`、`rad/radio` 别名同步；候选也只接受真实 checkbox/radio input。
- 对“坏引用刚修好就把原本隐藏的第二层立刻打开”做状态保全：仅当 checkbox 的新 alias 是它第一次获得有效 checked 路线时，把错误的初始 checked 还原为未勾选；用户点击后仍能正常展开。radio 的默认选中分支不改。
- 上一版针对 `toggle-analysis` vs `chk-analysis` 的真实交互断链仍能修复，不回退 sanitizer 与其它交互能力。


## 1.4.28 TEST：checked 控件引用别名修复

- 针对本轮全链路诊断暴露的真实失败：input 使用 `...-toggle-<语义>`，CSS/label 却引用 `...-chk-<语义>` 时，ID 隔离会在唯一且高置信的条件下把引用同步到真实控件。
- checkbox 同族仅归一 `chk/check/checkbox/cb/toggle/switch`；radio 同族仅归一 `rad/radio/rb`。不同尾部语义或多目标歧义继续 fail-closed。
- 1.4.27 的 sanitizer 安全边界、Prompt/母本、独立 API 请求链和其它维修兔能力不变。

## 1.4.27 TEST：1.4.26 安全收口的兼容性回修

- 保留 1.4.26 的 WeakMap + DOM clone 交互基线、独立 API 挂载 sanitizer、维修兔二次解析 sanitizer，以及 script/iframe/form/外部网络资源阻断。
- `position: fixed/sticky` 不再一刀切：局部浮层、吸顶元素继续保留；只有真实全视口覆盖特征才会中和定位声明。普通 absolute 继续可用。
- `<style>` / inline style 从“发现一个危险声明就整块删除”改为声明级剔除；外部 `url()` 等危险资源只删除对应声明，其余布局/配色继续保留。`@import` 仍 fail-closed。
- 恢复同一兔子镜内部、唯一 ID 指向的原生 `popover/popoverTarget` 交互；无目标、重复 ID、跨目标或非 popover command 自动移除。
- `<dialog>` 不再被无条件拆壳，但自动 `open` 仍被去除；form 继续拆壳，password/file input 继续删除。
- 健康 data image 继续允许，并增加 2,000,000 字符上限；SVG 仍保留 300,000 解码字符与外链/脚本阻断。
- Prompt、主题/展现形式母本、随机抽签、独立 API stream/non-stream/retry/single-flight、World Info、维修兔其它能力均未改。


## 1.4.26 TEST：未信任 HTML 安全边界收口

- 自修改交互 baseline/active 改为扩展运行时 WeakMap + DOM clone 管理，不再从模型 `data-rm-*` attribute 回读，也不再用 `innerHTML` 恢复 baseline。
- 维修兔代码块/纯文字直插路线在最终 parse/insert 前统一经过同一 strict sanitizer。
- 生成内容的网络资源默认拒绝；保留原有塔罗规则，并只允许既有 `gfx.tarot.com/.../0-77.jpg` 固定牌面路径（无 query/fragment）。安全的内联 data image / SVG fragment 继续可用。
- renderer 移除 form 提交面、password/file 输入、外部跳转/自动资源属性及 fixed/sticky/明显全视口覆盖样式；checkbox/radio 与普通 absolute CSS 交互保留。
- 删除误残留、无 import/call site 的 `data/safetyPatch.js`；不注入 Prompt。设置页按钮文案明确为“清除抽签历史与冷却记录”。
- 本轮明确不处理 F6：独立 API 的 `response.text()` / stream / non-stream / retry / single-flight 请求链保持 1.4.25 行为。

## 1.4.25 TEST：世界书拉取超时保护

- 世界书列表 15 秒未返回会自动结束，不再一直卡在“正在拉取”。
- 拉取只用于拿名单/元数据和逐本开关，不会重新扫描世界书。

## 1.4.25 TEST：设置页大白话 + 主动拉取世界书列表

- 设置页长说明改成简短大白话。
- 世界书新增“拉取世界书”按钮；拉取后可在列表里逐本勾选。
- 拉取只拿世界书名单，不扫描条目、不重掷 probability；独立 API 仍只复用本轮真正激活且允许的条目。

## 1.4.23 TEST：世界书逐本边界修复 + 单镜面交互复位防串镜

- 1.4.23 修复同一消息重绘/编辑或同消息多镜面时 reset baseline 串镜；复位身份同时绑定当前渲染实例与消息/外置源码指纹。
- 逐本世界书不再对 161+ 字符身份 fail-open；合法名称统一到 512 字符，超出范围 fail-closed。逐本关闭列表不再静默截断 256 本；观察缓存内存与持久化统一 512 本 LRU。

- 原有「读取本轮已激活的世界书」总开关保留；设置页新增逐本世界书开关。列表来自 SillyTavern 自身 World Info load 事件，RabbitMirror 不主动再扫描世界书、不重掷 probability。
- 逐本筛选只作用于本轮 host 已加载且最终 activated 的条目；禁用集合在主生成开始时冻结，途中改动下一轮生效；新世界书默认启用，原 12k 世界书预算不变。
- 维修兔菜单新增「⏪ 恢复交互初始状态」。RabbitMirror 在该镜面第一次真实交互的 capture phase 懒保存基线；之后可以反复把 checkbox/radio、内部 details、交互产生的 DOM 状态和大接近 approach/reaction 恢复到首次交互前，无需刷新页面。
- 复位通过替换为干净 clone 丢弃旧 DOM listener / WeakMap 状态，再按现有链重装交互救援和工具；外层兔子镜当前展开状态保持不变。维修发生前会使旧交互基线失效，避免复位把维修结果一起撤销。
- 本版不新增世界书扫描调用，不为复位新增全局 listener/Observer/polling/API；交互快照限量保存。

## 1.4.21 TEST：大接近反向审查修复

- threshold reaction 不再相信模型初始 `hidden/stage`：运行时把现有和新插入舞台统一归一，达到 threshold 前强制锁闭；关闭反应仍保留本轮 approach。
- `data-rm-touch-adult=true` 不再等于“运行时已确认成年”。私密 mystery 首次实际触发时需要用户本地确认一次；年龄候选标记缺失、用户拒绝或环境无法确认时均 fail-closed。
- 成人确认不能被旁路：直接点私密 radio/checkbox、第二 label、舞台外 label 都不能揭示私密 reaction；只有唯一 canonical hotspot 能获得一次性状态源激活许可。
- malformed hotspot 没有真实、唯一、非 disabled input 路线时，不推进 approach、不触发 Live2D。
- 新增 1 个只观察 `#chat` 子节点插入的轻量 observer，用来在动态/流式大接近 DOM 进入页面时立即归一化；不增加 API、polling 或 timer。

## 1.4.20 TEST：大接近自然接近 / GS 稀有演出 / 成人私密随机触点

- 常规热点候选调整为头、脸、肩、胸、手、腰、大腿、膝盖、小腿；明确成年且情境适合时可额外出现 0～2 个 `mystery-1/2` 私密随机隐藏触点。
- 普通关系仍只有本轮预生成触摸反应；热恋／高亲密才可启用本轮 approach。默认 `natural` 只暴露阶段，不显示数字；少数 `gs` 演出才允许 meter。
- 达到 threshold 只解锁本轮已预生成的关系变化反应，不触发新 API；关闭 reaction 不清空 approach，本轮结束后 WeakMap 状态自然消失。
- Live2D 常规热点继续按语义匹配本地 hit area；mystery 仅允许映射到受控的 chest/waist/thigh/knee/calf/hip/leg/body 通用区域，模型不能指定 motion/expression/command。
- 规则文本相较 1.4.19 反而缩短，不写医院/雨天/冬天等“场景→固定 UI”模板。


## 1.4.19 TEST：大接近 reaction 收起 + 手机极窄正文救援

- 大接近模式专用规则明确：人物舞台不是固定“图床/皮肤套数”，CSS 剪影、线稿、局部近景、半身等只是模型本轮构图，不存在内置固定 3D 图床。
- 每个大接近 reaction 对话框要求提供 `data-rm-touch-close="true"` 的明确关闭入口；radio 方案使用同组中立状态，运行时同一 click 委托提供无事件派发的关闭兜底，不触发 Live2D message 或模型生成。
- 维修兔新增 `mobile squeezed text`：只在手机窄屏下，对横排、长正文、实际宽度极窄且呈“高瘦竖柱”的高置信候选提高最小可读宽度；排除竖排、sidebar/nav、诗歌/引文、旋转元素、触摸热点、短文本与已正常宽度内容。
- 不新增 API 请求、timer、Observer、轮询或全局 listener；1.4.18 styleless/underfill、1.4.16 大接近 Live2D、1.4.14 Android/Xiaomi、1.4.12 checked BUG-1 继续保留。


## 1.4.18 TEST：收紧无样式降级救援 + 欠宽救援作者意图保护

- `styleless-structured-mirror` 改为 fail-closed：外部/美化 CSS 已提供成体系的背景、边框、阴影、布局或 padding 时不接管；已有中等 inline 结构视觉、真实表单也不接管。
- 无 CSS fallback 只恢复可读结构，不再隐藏 checkbox/radio、也不再给空 label 伪造“触碰”按钮；没有真实第二状态时不会制造假交互。
- 手机 `underfill` 尊重显式小 `max-width`、非水平 writing-mode 与信函/书页/海报等明确窄媒介；小型装饰 SVG/图标不再阻断唯一主正文的欠宽救援。
- 仍用 `全链路2.txt`（无 CSS）与 `全链路.txt`（260px 符纸）作为正向回归；同时加入外部 CSS、中等 inline、native form、profile max-width、竖排信函和小装饰 sibling 的反例。
- 不增加 API 请求、timer、Observer、轮询或全局 listener；1.4.16 大接近、1.4.14 Android/Xiaomi 外置宽度、1.4.12 checked BUG-1 保持。

> 1.4.15：在 1.4.13 Android／小米外置宽度修复上补齐 mobile transition 与 viewport lifecycle：mobile 时清除旧 PC compact-shell，复合宽度 signature 与 visualViewport resize 共用现有 debounce；同时避免桌面仅因 visualViewport 缩放而进入手机 lane。1.4.12 的 checked 正文优先级修复与其它链路保持。

本测试版在 1.4.11 基础上修正 checked 内层正文兜底的候选优先级：优先处理明确的 `display:none` / `visibility:hidden` 正文，只有没有强隐藏候选时才使用零高度、低透明度、折叠 max-height 等弱证据，避免零高度包装节点抢先消耗修复机会；其它高风险链不变。

> **RabbitMirror 1.4.10 TEST / 兔子镜测试版**  
> 测试仓库：`https://github.com/Zaiyebuzuoyouqingdetiangou/tototest`。本版在 1.4.6 Eligible Misses soft pity 基础上补齐随机偏好控制面：🎲 新增可逐层浏览／搜索全部主题与展现形式的「📚 全池一览」，无需先抽中即可收藏或拉黑；收藏室支持每项独立设置 ×1～×50 倍率。全部仍为本地随机状态，不增加 Prompt／Token、API 请求、Observer、poll 或 timer。

# 兔子镜小剧场

当前正式版本：`v1.4`。

当前构建发布通道：正式仓库 `https://github.com/Zaiyebuzuoyouqingdetiangou/toto`。

> 源码可见，但不是开源软件（Source Available — Not Open Source）。  
> 仅授权个人、非商业安装和使用。禁止二改、提取代码、制作衍生版本、转载、重新打包、镜像分发、整合到其他项目或商业使用。详见 [LICENSE](./LICENSE)。

### 关于 AI、源码与二改

本项目同样**不授权将兔子镜的 GitHub／仓库链接、源码、源码压缩包、规则、母本或实现逻辑提交给生成式 AI、代码生成工具或 AI Agent，用于仿制、重做、生成替代版、制作初始版或继续开发衍生项目**。

请不要把我的 GitHub 链接发给 AI，说“这个插件不好用／不好看”，再让 AI 以兔子镜为参照给你做一个“初始版”。

请不要在“初始版”做出来以后，又把我的源码或源码压缩包上传给 AI，再说“是在开发过程中才用了我的源码”。先做初始版、后喂源码，同样属于使用兔子镜源码与实现逻辑进行后续开发，不会因此变成独立开发。

批评、吐槽、提出意见当然没有问题；但请不要一边说我的插件难用难看，一边抄袭、复制、移植、仿制或让 AI 复刻我的实现。

**脑洞多但不要把洞开到我的脑子里，谢谢！**

兔子镜小剧场是一个用于 SillyTavern 的互动小剧场扩展。它会根据当前对话生成不同主题、展现形式、动态场景与交互方式的“兔子镜”。

## 安装与更新

### 推荐：从仓库安装

在 SillyTavern 的扩展管理中使用正式仓库地址安装：

`https://github.com/Zaiyebuzuoyouqingdetiangou/toto`

以后保持仓库地址和扩展目录不变，直接在扩展管理中检查更新。正式版清单已开启 `auto_update`。

### ZIP 安装

正式发布包固定命名为：

`兔子镜小剧场.zip`

以后发布新版本时继续使用同一个压缩包名称。安装或覆盖更新后，请彻底刷新 SillyTavern 页面。

> 扩展管理页面显示名称固定为“兔子镜小剧场”；对外发布版本为 `v1.4`，manifest 技术版号为 `1.4.0`，用于缓存刷新、诊断与更新判断。

## 视觉提示词编辑

界面提示改为口语化表达：可以直接描述“喜欢怎么排、什么质感、什么颜色、什么光线、想要简洁还是丰富、想要平面还是有前后层次”，不要求用户理解构图、材质、光影等设计术语。

自 1.3.33 起，“个性化视觉提示词”使用显式总开关，默认关闭。用户可以预先编辑官方视觉审美层、额外视觉偏好与不希望出现的视觉，但只有勾选“启用视觉提示词编辑注入”后才会随生成请求发送。

- 未勾选：完全沿用 1.3.20 原版 `展现形式落地 + 色彩组织` Prompt 流程，已保存的编辑内容不会发送给模型；
- 勾选后：跟随当前 API 时随兔子镜注入一起发送给当前主模型，独立 API 时随独立模型请求发送；
- 关闭开关不会清空已经编辑的内容，之后重新开启即可继续使用；
- 不开放 HTML 输出协议、CSS 安全、手机兼容、交互可触发性、维修兔、冷却等工程规则；
- 为避免重现设置页卡顿，只在点击“保存视觉提示词”时写入三个文本设置，不在每次键入时保存；总开关只监听一次普通 `change` 事件；
- “恢复官方视觉规则”只恢复官方审美层，不清空用户额外偏好和避雷内容。

## 主要功能

- 随机抽取主题、展现形式与玩法组合；展现形式对长期 eligible-but-missed 项目提供 2.0× 封顶的温和 soft pity，缩短极端长尾但不做固定轮播；
- 🎲 抽签载体除显示本轮真实抽签外，还可进入「📚 全池一览」按层级浏览／搜索全部主题与展现形式；无需等项目先出现即可直接 ⭐ 收藏或 🚫 拉黑；收藏室支持每项独立设置 ×1～×50 倍率，黑名单仍从随机池排除，均不增加 Prompt；
- 可选“展现形式世界观锁”：保留展现形式功能与结构，只转换不合当前世界观的具体载体；带 `if` 标签的主题自动放行；
- 用户指令优先，可自由点菜；
- 三档 Prompt 长度与随机发挥模式；
- 动态视觉场景与本地有限次视觉检查；
- 跟随当前 API 或使用独立 API 生成；
- 主 API 正文下方／外置弹窗显示；
- 独立 API 轻壳外置（标题有壳）／外置后内嵌显示；
- 外置标题壳与兔子镜本体分离，避免外壳强改生成物宽高与交互布局；
- 挨打猫：美化反馈、当前镜面重说与逐回复历史；
- 维修兔：检查和修复显示、排版及交互问题；
- 每轮注入字符数与 Token 估算；
- 手机 Safari／WebView 的交互、裁切和 3D 翻面兼容补救；
- 页面恢复、跨设备重绘后的同镜面去重；
- 副 API 本轮组合执行锁、近期视觉避让与实际请求状态诊断。

## 生成方式

### 跟随当前 API

兔子镜 Prompt 与正文使用同一次主 API 生成。可选择：

- **正文下方**：兔子镜自然留在本条回复中；
- **外置弹窗**：将同一面兔子镜移动到正文内容通道中的同色系圆角外框，不重新调用 API。

此模式不会使用独立 API 配置，也不会产生额外的独立 API 请求。

### 使用独立 API

主 API 只生成正文，不注入兔子镜 Prompt。正文与可用推理稳定后，兔子镜小剧场通过 SillyTavern 自带的 Custom Chat Completions 后端通道，请求用户配置的 OpenAI 兼容 API。

需要填写：

- API 地址；
- API Key；
- 模型；
- 温度；
- 最大输出。

独立显示方式：

- **轻壳外置（标题有壳）**：等待、生成成功与失败都保留在消息后；标题保留兔子镜工具壳，生成本体不再被整层外壳强改宽高；
- **外置后内嵌**：等待与失败时显示外置圆框，成功后将同一个宿主自然移入本条回复的正文内容区域，不复制第二份兔子镜，也不写入 `message.mes`、`display_text` 或 Swipe 正文。

可选开启 **“读取本轮已激活的世界书”**：复用 SillyTavern 主生成本轮已经加载并最终激活的全局／角色／聊天／Persona World Info 条目，不重新调用 World Info 扫描、不重新掷 probability、不读取未激活条目。四类来源共用同一份 12,000 字符独立预算；开启后这些已激活条目会作为参考资料发送给用户配置的独立 API，开关关闭时不会因为这项功能增加上下文。

切换生成来源只影响之后的新回复；已经生成的主 API／独立 API 兔子镜会尽量保留。

## 随机、冷却与交互多样性

跟随当前 API 与独立 API 共用同一套随机抽取器。近期成功成品会以压缩记录参与主题、展现形式、整体视觉、配色与交互骨架避让。

展现形式另有本地 Eligible Misses soft pity：只有某个 format 在本轮真实有资格进入随机池、但最终没有抽中时才累计一次 miss；黑名单、当前模式不允许、强制动态视觉或明确指定展现形式的轮次不会让普通 format aging。倍率按 40／80／140／220／320 个 eligible miss 分档上升并在 2.0× 封顶；抽中后归零。收藏室的偏好权重与这项公平性补偿彼此独立、可叠加。收藏项默认仍为 ×3，但可在收藏室逐项调整到 ×1～×50；主题的家族层加权单独在 ×6 封顶，避免高倍率把整个家族无界放大。

交互家族只用于识别近期重复，不是固定模板库。新的交互应从本轮展现形式、空间关系、物件行为、叙事推进与内容节奏中自行产生；radio、checkbox 与 details 不会被永久禁止。

独立 API 会在长上下文末尾追加本轮组合与近期避让的最终执行锁，避免本轮主题、展现形式和 UI 构思被长上下文冲淡。

### 温度建议

推荐从 **1.0** 开始：

- `0.8～0.9`：结构更稳，但可能更容易收敛为熟悉方案；
- `1.0～1.1`：通常兼顾规则执行与随机变化；
- `1.2`：更跳脱，适合仍明显重复时短期测试；
- 高于 `1.2`：更容易出现 HTML、CSS、结构或内容执行失控。

设置面板会显示最近一次请求是否真的发送了温度参数。

## 外置承载与跨设备恢复

独立 API 的轻壳外置只让标题工具区保留外置辨识，生成本体本身不再由外壳强制改写 `width`、`height` 或 `aspect-ratio`。手机重新打开页面、Safari 真正从后台恢复，或 SillyTavern 因同步／重绘重新插入消息 DOM 时，扩展会按聊天、mesid、Swipe、正文版本和镜面内容进行有限核对，同一面只保留当前显示模式应当存在的一份。

该核对不会持续轮询，也不会写入 `message.mes`、`display_text` 或 Swipe 正文。

## 挨打猫

- 美化反馈可多选，并选择影响下一轮、3 轮或 10 轮；
- 只有实际提交反馈时才会追加对应 Prompt；
- 独立 API 兔子镜可直接重说当前消息、当前 Swipe 的兔子镜，不重说正文；
- 重说期间保留旧镜并显示“正在重新生成”，新镜成功后原位替换；
- 每条独立 API 兔子镜可查看本地历史，历史预览不会替换当前镜面。

## 维修兔

- 只修模型已经输出的 HTML、CSS 与现有交互结构；
- 不凭空补写不存在的剧情、答案或结果；
- 独立 API 镜面维修不会读取、重绘或写回聊天正文；
- 修复结果与“返回修复前”会同步到对应的独立镜面缓存；
- 手动巡逻为默认方式；自动巡逻属于实验性功能，只尝试高置信的本地修复；
- 截断、空壳或请求失败无法由维修兔补写，只能重新生成；
- 完整诊断可能包含当前兔子镜正文，公开反馈前请先检查隐私。

## Token、隐私与本地数据

- 跟随当前 API 时，以设置页“本轮兔子镜小剧场注入”统计为准；
- 独立 API 模式下，兔子镜 Prompt 不注入主 API，但独立 API 会单独消耗请求 Token；
- 维修兔、诊断、本地取色、历史预览、模式迁移与返回修复前不增加模型 Token；
- API Key 保存在当前 SillyTavern 浏览器设置中；请求通过 SillyTavern 后端通道发送；
- 设置、抽取冷却、挨打猫状态、独立镜面与历史保存在浏览器本地；
- 兔子镜小剧场不包含遥测，也不主动向开发者上传聊天内容或使用数据；
- 某些塔罗展现形式可能加载第三方牌面图片。

## 内容提醒

本扩展面向成年角色扮演用户。随机主题可能涉及成人、恐怖、支配关系、催眠、羞辱或强烈情绪内容，请根据自身接受范围使用。

## 已知限制

- 不同模型、SillyTavern 版本、浏览器和其他扩展组合可能产生差异；
- 浏览器静态检查不能代替真实 iPhone／WebView 端到端验证；
- 本地存储容量由浏览器决定，极长兔子镜可能触发最旧历史自动淘汰；
- Token 数量是跨模型估算，字符数才是精确值；
- 持续动态视觉内容本身可能增加移动设备耗电与发热。

## 更新记录与反馈

版本更新内容见 [CHANGELOG](./CHANGELOG.md)。

请通过本仓库 Issues 反馈，并附：内部版本、SillyTavern 版本、设备、浏览器、生成方式、显示方式，以及已经检查隐私的诊断文本。


### 1.4.10 TEST：近输出短锁与重 roll 配色避重复
独立 API 的近输出层只保留本轮 identity、当前真正生效的短避让和最终 `<toto>` 输出契约；基础 Prompt 已经包含的长规则不再整段重复。手动重新生成同一面兔子镜时，会把上一版真实配色家族作为本次避让对象（用户明确固定配色时除外）。这不是预设固定色盘，也不会额外发起 API 请求。


## 1.4.16：大接近模式（大接近モード）

- 将 1.4.15 的 `6.2.1.2 触摸小剧场` 改为 `6.2.1.1.e 大接近模式`，正式归入「心跳回忆 GS 模式」子项。
- 参考用户提供的 `touch-theater-pure-card-v1.0.0.zip` 纯卡母本，默认语义热区改为 head / face / shoulder / chest / arm / hand / waist / thigh / knee；不把母本约 1.7MB 的 Base64 立绘或 Scoped Regex 打进 RabbitMirror。
- 新舞台使用 `data-rm-dai-sekkin-mode="true"`；运行时继续兼容 1.4.15 的 `data-rm-touch-theater` 及 left-hand / right-hand / hair 历史语义。
- 旧 `6.2.1.2` 的收藏、黑名单、收藏倍率和 Eligible Misses 读取时迁移到 `6.2.1.1.e`。
- 基础触摸仍不调用模型；Live2D 仍只复用用户本地已经配置的 expression / motion，忽略 hit-area message。

## 1.4.15：触摸小剧场 / Touch Theater

- 新展现形式 ID：`6.2.1.2`。可随机抽中，也可直接点名「兔子镜展现形式：触摸小剧场」。
- 模型只在本轮预生成触摸舞台、5～9 个热区和对应反应；点击不会再发一次 LLM 请求，也不伪造跨消息好感度。
- 基础交互使用 `radio/checkbox + label + CSS`，Live2D 未安装时仍完整可用。
- 可选 Live2D 增强：如果 SillyTavern 官方 Live2D 扩展已启用、当前角色已绑定模型且 hit area 有 expression / motion 映射，RabbitMirror 会在触摸对应区域时播放匹配动画。RabbitMirror 不执行 Live2D hit area 的 message 映射，也不会因此自动生成回复。
- 首版 Live2D 桥只处理单角色聊天；群聊为避免驱动错误角色会自动跳过 Live2D 动画，但 HTML/CSS 触摸反馈照常工作。

