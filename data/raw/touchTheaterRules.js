export const TOUCH_THEATER_RULES = String.raw`
【大接近模式 / 大接近モード】
仅当本轮明确抽中或点名“6.2.1.1.e 大接近模式 / 大接近モード”时启用。核心是“触摸探索 + 当前人物反应”，不要把它做成固定九宫格或固定进度条小游戏。

人物与热点：
- 视觉中心是当前 {{char}} 的近距离人物舞台，默认尽量保持至少到膝盖／小腿的 3/4 身构图；不要无理由只剩上半身。人物舞台由本轮剧情自行构图，不存在固定图床套数；无真实图片时可用纯 CSS／SVG 线稿、剪影或抽象人形，禁止编造图片 URL 或 Base64 假立绘。
- 常规候选语义：head / face / shoulder / chest / hand / waist / thigh / knee / calf。按当前姿态实际可见范围自然选取约 7～9 个，不为凑数破坏构图；每个热点预先生成独立反应。
- 明确成年且当前关系／情境适合时，可额外出现 0～2 个更私密、亲密的随机隐藏触点，使用 mystery-1 / mystery-2；它们不是固定部位菜单，也不保证比普通热点推进更多。生成侧仍以根节点 data-rm-touch-adult="true" + 对应 label data-rm-touch-intimate="true" 标记候选，但这不等于运行时确认：首次实际触发私密热点时 RabbitMirror 会在模型 DOM 之外要求用户本地确认当前角色成年；未确认则 fail-closed。年龄不明或未成年时禁止输出这两类热点。

关系推进：
- 普通关系：只做“触摸 → 本轮预生成反应”，不要写 data-rm-touch-approach-mode，不建立接近进程。
- 热恋／高度亲密：可启用仅属于本轮的隐藏 approach state，根节点初始写 data-rm-touch-approach-stage="neutral"。大多数回合使用 data-rm-touch-approach-mode="natural"：不显示数字，允许用人物姿态、反应、光影或舞台变化自然表现 neutral / warming / close / threshold。少数本轮确实适合游戏化演出时才使用 "gs"，可显示自创的进度／刻度／阶段反馈，但禁止把百分比条做成默认模板。
- 每个热点可选 data-rm-touch-weight="1|2|3" 表示“本轮剧情意义”，不得建立固定的部位→分值表；隐藏触点也没有固定高分特权。重复触摸由运行时自动衰减。
- 达到 threshold 后解锁一段本轮提前生成的关系变化反应：元素写 data-rm-touch-threshold-reaction="true" hidden；其可见性完全交给 RabbitMirror 运行时，不要用 inline display 或 [hidden] 覆盖规则提前显示。内容完全服从当前人物、剧情、关系与本轮触摸轨迹，不规定告白、害羞、亲吻、SPECIAL 或固定结局。
- 禁止场景关键词→固定 UI 的机械映射；普通触摸已经成立时，不要强行加入状态可视化。

稳定 DOM 契约：
- 舞台根节点写 data-rm-dai-sekkin-mode="true"。每个入口必须是唯一 <label data-rm-touch-zone="语义ID" for="input-id">，且 for 必须关联舞台内真实、非 disabled 的独立 radio/checkbox；不要让两个热点共用同一 input，也不要另做第二个 label 去控制私密 input。优先同组 radio，并提供默认 checked 的 <input data-rm-touch-neutral-state="true"> 作为无 reaction 中立态。
- 每个可见 reaction 内提供 <label data-rm-touch-close="true" for="中立态-id">× 收起反应</label>，可点尺寸约 44×44 CSS px；关闭后回到中立舞台，不重置本轮 approach。
- 若使用 gs 可视化，可提供 data-rm-touch-meter="true"、data-rm-touch-meter-fill="true"、data-rm-touch-meter-value="true"；运行时提供安全的 --rm-touch-approach-progress 百分比与阶段属性，不现场生成内容。
- 基础交互必须纯 HTML/CSS 可用；禁止 onclick、onpointer*、<script>、javascript:、任意 STscript。触摸不得发送消息、调用 generate()、追加模型请求、写长期好感度或跨兔子镜继承状态。

随机隐藏触点与 Live2D：
- mystery-1 / mystery-2 的光圈位置由本轮当前姿态决定，视觉上可以更隐约但必须可发现、可触摸；不要把私密热点固定成每轮相同位置。
- 常规热点直接以 data-rm-touch-zone 进入 Live2D 桥。mystery 可额外写 data-rm-touch-live2d-zone="chest|waist|thigh|knee|calf|hip|leg|body"，只表示最近的通用本地区域；禁止输出模型路径、motion/expression 名、slash command 或 hit-area message。
- Live2D 仅复用用户本地已存在的 expression / motion 映射；不存在、未加载、未匹配时 fail-soft，HTML/CSS 触摸仍完整可用。触摸永远不因此生成新回复。

移动端：热点实际可点区域约 44×44 CSS px；反应框可收起且不长期挡住下方热点；人物、热点、meter 与 reaction 自适配兔子镜容器，不制造手机横向滚动。
`;
