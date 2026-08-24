# NOTICE

“心跳回忆”扩展代码为本项目独立实现，与兔子镜无依赖、无共享运行时。

实现仅参考 SillyTavern 官方仓库公开的扩展上下文、Connection Manager、Secrets、chat metadata、世界书 dry-run 与事件接口；未复制第三方 SillyTavern 扩展代码。

0.8.1 的“一键导入当前连接”只参考 SillyTavern 官方 Connection Manager 读取当前连接配置的公开实现方式。插件读取 API / URL / Model / Preset 与 Secret ID 引用，不读取 API Key 明文。

视觉与玩法研究仅参考 KONAMI 官方公开的《ときめきメモリアル Girl’s Side》系列页面。私人生活空间功能只借鉴“观察角色私人日常、随现实时间变化”的抽象玩法概念；未复制、提取、重绘或嵌入任何商业游戏的角色、房间背景、原版布局、台词、音频、图片、UI 资源或代码。


0.8.6 的记忆互操作继续只使用公开接口。通用 `getInjectedHistory()` / `getSnapshot()` 适配方式参考了作者本人另一项目中已经验证过的公开接口桥接思路，但心跳回忆没有导入、复制或运行依赖该项目文件；实现保留在本仓库自己的当前聊天边界、归一化与证据校验链中。

0.8.10 r31 经用户确认已取得 ST-BaiBai-Image 作者授权后，研究其公开仓库 `baibai-git/ST-BaiBai-Image` 的 `0.1.22` / `e3d0c8c` 快照并实现跨插件联动。心跳回忆没有复制、嵌入或重新实现柏宝绘的 ComfyUI、NAI、工作流、队列、Vibe、设置、图库或上传逻辑；它只消费柏宝绘侧独立提供的版本化最小公开 API。配套桥接修改与构建保持为独立柏宝绘插件文件，不属于心跳回忆代码或授权范围。

本仓库原创代码采用根目录 `LICENSE` 所载 《心跳回忆有限个人使用许可证 Version 1.1》，非开源授权。
