# XZ × OPU 扩大量程仿真演示

在线演示：https://liziyaaa.github.io/xz-opu-simulator/

版本：v1.2.0 · GitHub Pages 分享版，2026-10-11。

纯 HTML/CSS/JavaScript 静态演示，不连接真实电机、串口或 OPU。公开分享，无需密码或 ChatGPT 账号。扫描数据仅保留在访问者浏览器内，导出为本地文件，没有数据上传接口。

## 功能

- X 逐点移动、FES 测量、Z 限程找焦与高度合成。
- 六种样品，三维装配视角与同方向微观视图。
- 光栅读数量化 10/50 nm、DVD/CD 理想焦斑选择。
- 实时 S 曲线、仿真结果及原始过程 CSV 导出。

量化分辨率不等于系统准确度；仿真参数不能用于硬件验收。源模型仅用于轮廓与尺寸参考，光学过程为理想示意。

## 本地打开

直接打开 `docs/index.html`，或者在本仓库运行 `python -m http.server 8000 --directory docs`，访问 `http://localhost:8000/`。

## 发布与版本

GitHub Pages 来源为 `main` 分支 `/docs`。推送该目录的改动后，GitHub 自动更新网页。保留 `v1.2.0` 标签以便下载此版本；以后新增标签，不移动已有发布标签。原始 CAD、完整测试 CSV、整本手册以及平台凭据均不上传。

## 检查

浏览器测试使用 Playwright 和 Microsoft Edge：安装 Playwright 后运行 `node checks/smoke.cjs <网址>`。也可通过环境变量 `PLAYWRIGHT_MODULE` 指定已有 Playwright 模块。

第三方 Three.js 授权见 `docs/vendor/THREE-LICENSE.txt`。项目自身未授予额外开源许可。
