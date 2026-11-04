# XZ FES / RF Bump Observation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a versioned XZ observation demonstration using paired measured FES/RF responses, two-anchor reflectance interpolation, the provided Bump array and manually selected fixed Y rows, without adding an RF focus strategy.

**Architecture:** Preserve the old releases byte-for-byte. Create XZ v1.3.0 with isolated response, sample, row-history and chart modules; adapt the existing controller and rendering shell to consume those modules. Package measured reference arrays at development time so the deployed simulator stays static and browser-local.

**Tech Stack:** Existing plain JavaScript, HTML/CSS, local Three.js, Node.js built-in test runner and Playwright/Edge. No new frontend runtime dependency or backend.

**Spec:** `docs/superpowers/specs/2026-11-04-xz-fes-rf-observation-design.md` (approved 2026-11-04).

## Global Constraints

- 新 XZ 模型版本 v1.3.0，合集发布 v1.4.0；不覆盖 XZ v1.2.0 和独立光路 v2.0.0。
- 找焦沿用原办法；RF 暂不作为新增控制输入。
- 硅片 rho=0.35，镜片 rho=0.95；FES 与 RF 分别采用两锚点线性函数，保留偏置。
- 硅基底默认 35%；凸点默认 95% 仅为模拟值，非锡实测。
- 默认硅片 35% 参考标定，每行开始冻结；首点设零不重拟合斜率。
- 默认 4 um 可用线性区只作初始展示假设，不声称为实测空间标定。
- Y 开始扫描后锁定；换行结束当前行并保留历史，不模拟自动 Y 电机。
- 暂不考虑倾斜；不得由模型真实高度替控制器直接指定 Z 目标。
- 原始 CSV、STEP 只读；发布仅包含必要派生数据及来源摘要，不含个人路径、凭据或整份原始文件。

## Review Focus

- RF 缺口或文件采样率不同：按时间配对，长缺口不生成虚构 RF，控制器不因此获得新的 RF 门限。
- 反射率 0/35/65/95/100%、NaN 和材料突变：精确复现锚点，外推标注，非法参数拒绝，跨材料不暗中改标定。
- 暂停、搜索失败和换 Y：不能篡改当前行坐标或历史行；失败保留双路数据，不冒充有效高度。
- 截底球和 0.2 mm 连接带：同一几何源驱动三维、剖面、俯视与材料判断，连接带不能变成洞。
- 大范围/小步长/高采样率与手机：预估数据上限、分帧绘制及明确提示，不把未完成扫描显示为成功。

## File Map

- `tools/build-observation-data.cjs`: read-only CSV/CAD-parameter importer; writes only explicitly selected new-version outputs.
- `docs/xz/v1.3.0/measured_response.js`: generated public `XZMeasuredData` with two anchors, per-pass/representative traces, gaps, provenance and hashes.
- `docs/xz/v1.3.0/bump_data.js`: generated `XZBumpData` in um, six origins, 2094 centers/radii, carrier bounds and source assumptions.
- `docs/xz/v1.3.0/response.js`: pure UMD `XZResponse`; paired response lookup, interpolation and fixed reference calibration.
- `docs/xz/v1.3.0/samples.js`: pure UMD `XZSamples`; sample geometry and material lookup, including retained old sample definitions.
- `docs/xz/v1.3.0/rows.js`: pure UMD `XZRows`; immutable archived-row snapshots and row configuration locking.
- `docs/xz/v1.3.0/signals_view.js`: aligned FES/RF reference and time plots, workpoints and provenance labels.
- `docs/xz/v1.3.0/{index.html,style.css,app.js,physics.js,micro_view.js,geometry.js,about.html}`: versioned shell copied from old release, then scoped edits.
- `checks/observation-*.test.cjs`: pure module, integration, preservation and public data tests.
- `checks/observation-browser.cjs`: browser interactions, exports and responsive regression.
- `docs/{index.html,releases.json}`, `README.md`: new entry and fixed historical links; no edits to old release files.

## Task 1: Paired measured response and reflectance model

**Files:** Create importer, measured_response.js, response.js, `checks/observation-response.test.cjs`.

**Interfaces:**
- `XZMeasuredData.anchors`: `{silicon,mirror}`, each with `reflectance`, `passes[]`, `representative`, `sourceHashes`, `timingWarning`; traces have sorted `{u,fesMv,rfMv,rfAvailable}` points.
- `XZResponse.at(u, reflectance, selection='representative')`: `{fesMv,rfMv,rfAvailable,extrapolated,inDomain}`. Null RF denotes unavailable, never zero by substitution.
- `XZResponse.calibration({linearUm:4,referenceReflectance:.35,selection})`: immutable `{centerMv,slopeMvPerUm,uPerUm,linearUm,referenceReflectance,selection,assumedSpatialScale:true}`.
- `XZResponse.atDisplacement(residualUm,reflectance,calibration)`: same response structure plus `u`; uses that fixed calibration mapping.

- [ ] Write tests for exact rho .35/.95 anchor values; .65 channel-wise midpoint; 0/1 marked extrapolation; NaN/out-of-range parameters rejected; two positions with similar FES retain separate RF; missing RF remains unavailable.
- [ ] Run `node --test checks/observation-response.test.cjs`; verify it fails because new modules do not exist.
- [ ] Implement importer arguments `--silicon-dir`, `--mirror-dir`, `--bump-dir`, `--out-dir`. Read the eight paired cropped traces and feature summaries; match `original_time_s`, never row indices. RF interpolation may span at most 0.5 s; record longer gaps.
- [ ] Normalize each pass using `u = -sign(central_slope_mv_per_s) * (original_time_s - fes_midpoint_time_s) / peak_interval_s`. This is dimensionless phase, not Z or absolute motor direction. Apply the identical transform to its RF. Store source direction/time ranges.
- [ ] Build the representative by pointwise median over valid per-pass interpolants on the common phase grid; do not interpolate over a pass's internal gap. Preserve individual-pass selection by paired scan ordinal, explicitly not common acquisition time across materials.
- [ ] Implement affine two-anchor interpolation per the spec. Derive the fixed reference central branch from the representative 20–80% peak-to-peak interval; map its width to configured `linearUm`, fit reference center slope once and label assumed scale.
- [ ] Test mismatched RF/FES lengths, a 1 s RF gap, reversed pass orientation and reproducibility/source-hash assertions. Reject absent/invalid peak interval instead of silently guessing.
- [ ] Run the response tests; expect all pass. Commit importer, generated minimized references, module and tests together.

## Task 2: Bump geometry and independent row history

**Files:** Create samples.js, bump_data.js, rows.js, `checks/observation-samples.test.cjs`, `checks/observation-rows.test.cjs`.

**Interfaces:**
- `XZSamples.surfaceAt(id,xUm,yUm)`: `{heightUm,material,inBounds,bumpId}`; material is `silicon`, `bump` or an explicitly mapped legacy sample material.
- `XZSamples.samples`: list consumed by selector, each with id/name/width/depth/body/max/step/row; new Bump id `bump-2x3`.
- `XZRows.Store`: `begin(config)`, `lock()`, `finish(snapshot)`, `list()`; rejects begin/config mutation while a row is locked. Archived snapshots are deep copies, not live simulation references.

- [ ] Write geometry tests for exactly 2094 Bumps, six groups, 15204.819277 × 7602.409639 um carrier, 1000 um body and 50 um Bump top; test inter-pattern connection as silicon at zero relative height.
- [ ] Write row tests for locked-Y mutation rejection, paused row remains locked, finish/new-row sequence, independent per-row baselines and immutable old reflectance/calibration after new settings change.
- [ ] Run both test files and verify missing modules fail.
- [ ] Import the provided coordinate/array files and preserve the CAD truncated-sphere definition: radius = model_diameter / 2, sphere-center relative height = 50 − radius; top envelope for rho ≤ radius is center + sqrt(radius²−rho²). Do not reinterpret maximum diameter as contact footprint.
- [ ] Retain the CAD edge-truncation/footprint limits and carrier extent. Use the same centers/radii for rendering and lookup; do not make a new regular grid.
- [ ] Implement row store with explicit start/finish transitions, deep copied configs/records and a bounded browser-local row history; expose clear capacity errors, not silent eviction.
- [ ] Run module tests and input count/bounds checks; expect all pass. Commit modules and tests.

## Task 3: Adapt the existing FES controller, not an RF controller

**Files:** Create versioned physics.js and `checks/observation-control.test.cjs`; copy unchanged geometry/vendor assets or reference the pinned old paths.

**Interfaces:**
- Preserve `XZPhysics.Simulation`, `prepare`, `commit`, `recover`, `skipInvalid` and old step phases.
- Config adds `baseReflectance`, `bumpReflectance`, `referenceReflectance`, `responseSelection`, `calibration`; each simulation freezes its calibration/config on creation.
- Raw records add `rfMv`, `rfAvailable`, `material`, `reflectance`, `y`; old internal 0–1 quality proxy is explicitly `returnQuality` and never fed from `rfMv`.
- Final records add averaged RF/availability plus material/reflection and calibration metadata; unsuccessful points keep null reconstructed height.

- [ ] Write regressions showing that changing only the RF arrays while keeping FES fixed leaves action, Z targets, validity and estimated heights unchanged. Tests must compare executed record sequences, not just config flags.
- [ ] Add tests for frozen calibration across a silicon/Bump transition, failed search retaining RF/FES traces, no valid height outside the accepted branch, and maxRaw stopping at the last retained position.
- [ ] Run tests and verify new interfaces fail before implementation.
- [ ] Copy the existing controller into the new directory. Substitute the new FES plant and material lookup while preserving search order, fixed-X search, history hints, stops, averaging and explicit recovery. Keep the legacy quality proxy semantically separate and unchanged.
- [ ] Keep controller reference center/slope fixed per row; do not substitute local material calibration or CAD-derived Z targets. Reuse old geometry-edge policy without adding a new surface-normal/tilt collection model.
- [ ] Validate start/end/step, data capacity and both reflectances at the configuration boundary; retain the full partial trace if capture limit is hit.
- [ ] Run module and control tests; expect pass. Commit controller adaptation and tests.

## Task 4: Observation UI, manual Y and exports

**Files:** Create versioned index/style/app/micro_view/about and signals_view.js; create browser test.

**Interfaces:**
- `signals_view.js` consumes raw response samples and current `{u,fesMv,rfMv,rfAvailable,material,reflectance}`; chart display cannot alter controller config/state.
- Controls: `base-reflectance`, `bump-reflectance`, `reference-reflectance`, `response-pass`, `row`, `row-slider`, `end-row`, `scan-start`, `scan-end`, `top-view`.
- `XZDemo` retains old test helpers and adds `get rowHistory()` and `finishRow()` for browser assertions.
- CSV metadata schema `xz_opu_observation_v1`; raw columns explicitly distinguish `rf_mv` from `legacy_return_quality` and include y/material/reflection/phase/valid/reason.

- [ ] Write browser tests for new default Bump, independent material inputs, synchronized FES/RF workpoint phase, missing RF display, Y locking during run/pause, finish-and-new-row overlay, and two-row CSV isolation.
- [ ] Run against a local server and confirm failure before new page exists.
- [ ] Copy the shell into v1.3.0. Keep left/front/right and same-angle microscopic view, add the six Bump groups using shared sphere geometry/instancing as appropriate; preserve physical mm sizes.
- [ ] Add the top-down Y picker with a fixed scan-line overlay, synchronized number/slider. Require finishing current row before changing Y or material/calibration settings; retain prior rows without recomputing them.
- [ ] Draw aligned FES/RF reference plots and raw-time plots with separate mV axes and shared workpoint. Show current material/reflection, source pass, approximate timing warning and assumed space scale. Never label computed time-interpolated values as new real-time hardware measurements.
- [ ] Keep run/pause/single-step/retry controls. Failure retains plots/position and explicit reason. Do not add automatic success, RF search or blind continuation policy.
- [ ] Add CSV exports with fixed row config, original data provenance hashes, assumed scale, RF and failure fields. Missing RF serializes blank plus availability flag, not zero.
- [ ] Verify at 360 px and desktop widths, resource loads, pause/resume, CSV downloads, old views and capacity handling; inspect screenshots. Run all module tests; commit new UI and tests.

## Task 5: Preserve historical releases, publish and verify

**Files:** Modify main portal, releases.json and README; extend preservation checks, add a version audit for the new release.

- [ ] Write preservation tests comparing complete old XZ and optical release hashes with the pre-change revision. Include the old HTML files, not only numerical assets.
- [ ] Run existing smoke and portal tests plus new observation tests locally. Resolve only in-scope failures; do not update old version files to make tests pass.
- [ ] Add a new XZ v1.3.0 entry, keep fixed old links, update collection to v1.4.0 and model disclaimer. Record minimized data hashes and generation method without private absolute paths.
- [ ] Run `checks/integrity.cjs`, old smoke, current portal and observation browser suites; validate export content, source privacy scan, new-version physics and row invariants. Review diff for accidental raw data/CAD uploads.
- [ ] Obtain independent whole-branch review per chosen execution workflow; address findings and rerun affected checks.
- [ ] Integrate into main without force/reset, preserve existing v1.3.0 collection tag, create new v1.4.0 tag, push only verified commits/tag to the requested repository.
- [ ] Verify Pages build matches the new commit, then run both original and new demo browser checks against the deployed URL. Do not claim complete from git push alone.
- [ ] Hand off new direct URL, retained old URL, key controls and the uncalibrated-space/material/timing limitations; do not claim real Bump measurement feasibility.

## Self-Review

- Spec coverage: paired data/reflection = Task 1; geometry/Y/history = Task 2/4; unchanged strategy/frozen calibration/failures = Task 3; observation/export/accessibility = Task 4; version/privacy/deployment = Task 5.
- Interfaces: `rfMv` is always measured-reference voltage; `returnQuality` is always legacy 0–1 proxy; `u` is always dimensionless; mm CAD converts once into um geometry data.
- Review focus: gap and parameter tests in Task 1, geometry/history in Task 2, material/failure/capture in Task 3, narrow display and export capacity in Task 4, full old-version preservation in Task 5.
- No added hardware control, no RF-driven strategy, no tilt loss model, no new dependency framework.

## Execution handoff

推荐 Native：本次数据、几何、控制、界面有连续接口依赖，在同一会话逐项实现更便于保持一致；全部完成后做一次独立审阅。用户尚未选择执行方式。实施开始前须让用户审阅此计划并选择 Native 或 Subagent-driven；本计划本身不代表代码已完成。
