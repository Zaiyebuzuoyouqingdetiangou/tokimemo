# r84.82 魔法棒图标复核

0.99.30 / 0.99.30-r84.82-wand-icon，基线 78b6b07。

按用户截图，复用兔子镜 index.js 中 viewBox 0 0 32 32 的兔子 SVG 路径、18px 尺寸、1.7 线宽和 currentColor。仅替换心迹回廊 index.js 启动壳及 src/ui/archivePortal.js 运行入口的图标，更新生成运行包、版本及缓存查询串。标签、click/Enter/Space 处理不变；没有增加请求、依赖、设置或限制。图标为装饰，aria-hidden，SVG 不抢焦点。

验证：281 个 JS/MJS 语法通过，239 模块运行包连续构建字节一致，具名导入 undefined=0，5 个运行入口有效。现有 45/45 回归通过，见 verification/repair-r84.82-tests.txt。本地浏览器用 tools/icon-r8482-preview.html 执行真实启动壳和运行入口挂载，观察两处兔子图标及对齐，并确认 SVG 一致。该页面不会调用生成模型；未对真实酒馆主题或手机实测。

运行包 SHA-256：3c624c637fa7d71b81bc21381e481f767d852bc6e518fe96887265c093db99a2。
