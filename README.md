# XZ × OPU 仿真实验室

在线首页：<https://liziyaaa.github.io/xz-opu-simulator/>

合集发布 **v1.3.0 · 2026-10-15**。两套独立仿真共用首页和页面导航，公开访问，无需密码或 ChatGPT 账号。没有把两个模型强行耦合，也没有改动其计算逻辑。

| 演示 | 固定入口 | 模型版本 | 内容 |
| --- | --- | --- | --- |
| XZ 扩大量程测量 | [打开](https://liziyaaa.github.io/xz-opu-simulator/xz/v1.2.0/) | v1.2.0 | X 逐点扫描、FES / Z 找焦、统一基准合成高度；六种样品与三维 / 微观视图。 |
| OPU 光路 / 四象限 | [打开](https://liziyaaa.github.io/xz-opu-simulator/optics/v2.0.0/) | v2.0.0 | 650 nm 主通道往返传播、拖动 PC / 物镜 / 样品、焦斑、四象限积分与 S 曲线。 |

## 版本与兼容

- 首页提供两个入口，演示页顶部可切换实验或返回首页。
- 原 XZ 页面归档到 `docs/xz/v1.2.0/`；除 HTML 增加项目导航外，原仿真资产字节不变，记录见 `original-release.json`。旧 `/about.html` 自动转向归档说明页。
- 光路模型的 `engine.js`、`app.js` 和模板与本地最终版 SHA-256 一致；独立参数及校验见该目录 `version.json` 和 `model.html`。
- 保留已有 `v1.2.0` 标签，合集使用新 `v1.3.0` 标签；以后新增标签，不移动原标签。各模型版本号与合集版本号分开。
- 原 CAD、完整测试 CSV、整本手册、私人本地路径与凭据不随分享版上传。

## 范围与隐私

纯静态 HTML / CSS / JavaScript，在访问者浏览器中运行，不连接实际电机、串口或 OPU；没有测量数据上传接口。GitHub Pages 负责页面托管。

XZ 的 10 / 50 nm 是读数量化，不是准确度。光路实验为声明假设下的标量参考模型，不是原厂光学处方复刻，也不预测实机绝对 mV 或测量精度。移除 PC 后最亮面不一定是 FES 零点。

## 本地打开与发布

可直接打开 `docs/index.html`。也可运行 `python -m http.server 8000 --directory docs`，访问 `http://localhost:8000/`。

GitHub Pages 来源仍是 `main` 分支 `/docs`。推送该目录后由 GitHub 自动构建；发布后核对 Pages 构建对应的提交及线上两套入口，不仅以推送成功作为完成依据。

## 检查

使用 Node.js、Playwright 和 Microsoft Edge；可通过 `PLAYWRIGHT_MODULE` 指定已有模块目录。

```text
node checks/portal.cjs http://localhost:8000/
node checks/smoke.cjs http://localhost:8000/xz/v1.2.0/
node checks/integrity.cjs
node checks/optics-engine.cjs
```

`qa-results/` 为忽略的本地校验结果目录。`tools/import-optical.cjs <本地v2.0.0目录>` 可重新打包分享适配版，导入前会核对模型源码审计哈希。它不会复制原始测量数据或整本手册。

第三方 Three.js 授权见 `docs/xz/v1.2.0/vendor/THREE-LICENSE.txt`。项目自身未授予额外开源许可。
