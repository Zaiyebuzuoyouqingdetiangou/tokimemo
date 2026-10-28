# NOTICE

“心迹回廊”（曾用名“心跳回忆”）扩展代码为本项目独立实现，与兔子镜无依赖、无共享运行时。

实现仅参考 SillyTavern 官方仓库公开的扩展上下文、Connection Manager、Secrets、chat metadata、世界书 dry-run 与事件接口；未复制第三方 SillyTavern 扩展代码。

0.8.1 的“一键导入当前连接”只参考 SillyTavern 官方 Connection Manager 读取当前连接配置的公开实现方式。插件读取 API / URL / Model / Preset 与 Secret ID 引用，不读取 API Key 明文。

视觉与玩法研究仅参考 KONAMI 官方公开的《ときめきメモリアル Girl’s Side》系列页面。私人生活空间功能只借鉴“观察角色私人日常、随现实时间变化”的抽象玩法概念；未复制、提取、重绘或嵌入任何商业游戏的角色、房间背景、原版布局、台词、音频、图片、UI 资源或代码。


0.8.6 的记忆互操作继续只使用公开接口。通用 `getInjectedHistory()` / `getSnapshot()` 适配方式参考了作者本人另一项目中已经验证过的公开接口桥接思路，但心迹回廊没有导入、复制或运行依赖该项目文件；实现保留在本仓库自己的当前聊天边界、归一化与证据校验链中。

本仓库原创代码采用根目录 `LICENSE` 所载 《心迹回廊有限个人使用许可证 Version 1.3》，非开源授权。

## 第三方组件

公开发布的运行文件附带以下第三方开源组件，只用于解压插件自带的文字表：

- pako 1.0.11（解压缩）—— MIT License

```
(The MIT License)

Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
