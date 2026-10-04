# 1.0.21 验证记录

- `content-selection.log` / `.json`：38 项新增专项，退出 0。
- `related-regressions.log` / `.json`：115 项相关既有检查，113 通过、2 项已知失败，退出 1。
- `baseline-gap.log` / `.json`：用 1.0.20 bundle 跑两条覆盖断言，两条都因实际 500、期望 48 而失败。
- `baseline-known-failures.log` / `.json`：同样两项旧失败在 1.0.20 重现。
- `build-1.json` / `build-2.json`：两次确定性重建，核对基线模块转换与源码 / bundle 摘要。
- `summary.json`：版本、改动文件、已验证与未验证范围。

新增检查源为 `tools/verification/content-selection-regression.mjs`，依赖已有 `fixture.mjs`。运行时设置 `TEST_ROOT` 为本包根目录、`BASELINE_ROOT` 为原始 1.0.20 根目录，再执行：

```sh
node --experimental-vm-modules --test tools/verification/content-selection-regression.mjs
```

`BASELINE_ROOT` 用于“创作提示词模板保持一致”的字节对照；不从网上下载替代基线。

宿主、提供者、持久化与 DOM 是模拟。没有真实付费模型调用，也没有实际浏览器 / 手机 / TT 截图或验收。修复前后的断言对照证明已定位的实现缺口，不证明用户所有真实存档均已通过。
