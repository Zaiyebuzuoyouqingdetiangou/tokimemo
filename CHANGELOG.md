## 0.8.10

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
- Removed automatic legacy theater-cache compression/migration from `CHAT_CHANGED` / `CHAT_LOADED`.
- Legacy generated content remains readable.
