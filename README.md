# XZ × OPU 仿真实验室

在线首页：<https://liziyaaa.github.io/xz-opu-simulator/>

合集发布 **v1.4.0 · 2026-11-04**。新版 XZ 增加 FES / RF 观察与 Bump 阵列；原 XZ 和独立光路演示保留不变。公开访问，无需密码或 ChatGPT 账号。

| 演示 | 固定入口 | 模型版本 | 内容 |
| --- | --- | --- | --- |
| XZ FES / RF Bump 观察版 | [打开](https://liziyaaa.github.io/xz-opu-simulator/xz/v1.3.0/) | v1.3.0 | 镜片/硅片实测配对信号、35%/95%材料锚点、2094个凸点、手动固定Y及多行记录。RF仅显示，不新增找焦策略。 |
| XZ 扩大量程测量 | [打开](https://liziyaaa.github.io/xz-opu-simulator/xz/v1.2.0/) | v1.2.0 | X 逐点扫描、FES / Z 找焦、统一基准合成高度；六种样品与三维 / 微观视图。 |
| OPU 光路 / 四象限 | [打开](https://liziyaaa.github.io/xz-opu-simulator/optics/v2.0.0/) | v2.0.0 | 650 nm 主通道往返传播、拖动 PC / 物镜 / 样品、焦斑、四象限积分与 S 曲线。 |

## 版本与兼容

- 首页提供三个固定入口，演示页顶部可切换实验或返回首页。
- 原 XZ 页面归档到 `docs/xz/v1.2.0/`；除 HTML 增加项目导航外，原仿真资产字节不变，记录见 `original-release.json`。旧 `/about.html` 自动转向归档说明页。
- 光路模型的 `engine.js`、`app.js` 和模板与本地最终版 SHA-256 一致；独立参数及校验见该目录 `version.json` 和 `model.html`。
- 保留已有 `v1.2.0` 标签，合集使用新 `v1.3.0` 标签；以后新增标签，不移动原标签。各模型版本号与合集版本号分开。
- 原 CAD、完整测试 CSV、整本手册、私人本地路径与凭据不随分享版上传。
- 新 XZ 观察版固定目录 `docs/xz/v1.3.0/`，用新合集标签 `v1.4.0`；旧 `v1.3.0` 合集标签也保持原指向。

## FES / RF 观察版

选择固定 Y 和 X 起终点后运行。开始后 Y 与材料/标定参数锁定，暂停不解锁；点击“结束并保存当前行”后可换 Y，保留历史行叠加并导出。刷新/关闭前请导出，历史不跨浏览器会话持久化。

历史汇总与历史原始信号分别导出，CSV 使用单一表头和行编号，并保留每行参数及基准。会话最多保存20行、约20 MB；单行超容量时先导出完整原始记录，确认文件已保存后，可只保留汇总并结束该行。超容量行的原始记录须使用之前单独保存的文件，不会静默丢弃或伪装为完整历史。

FES 和 RF 按同一扫描相位配对，不从单个 FES 电压反查唯一 RF。镜片95%、硅片35%是用户指定的反射率锚点，分别对两路电压线性插值并保留偏置。凸点95%只是初始模拟设置，不是锡实测；暂不考虑倾斜。默认4 µm中心支路宽度是演示空间尺度，原数据没有同步Z标定。RF独立时间导出与FES近似对齐，不支持亚秒延迟结论。

原始记录及几何位置来源审计在新目录 `version.json` 和派生数据中。开发时使用 `node tools/build-observation-data.cjs --silicon-dir <目录> --mirror-dir <目录> --bump-dir <目录> --out-dir docs/xz/v1.3.0`，不会修改原实验文件。

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
node --test checks/observation-*.test.cjs
node checks/observation-browser.cjs http://localhost:8000/xz/v1.3.0/
```

浏览器压力检查默认使用 `http://127.0.0.1:8796/xz/v1.3.0/`，可用 `OBSERVATION_URL` 指定正在运行的本地或线上新版地址。

`qa-results/` 为忽略的本地校验结果目录。`tools/import-optical.cjs <本地v2.0.0目录>` 可重新打包分享适配版，导入前会核对模型源码审计哈希。它不会复制原始测量数据或整本手册。

第三方 Three.js 授权见 `docs/xz/v1.2.0/vendor/THREE-LICENSE.txt`。项目自身未授予额外开源许可。
