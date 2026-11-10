(function (root) {
  'use strict';
  const A = root.XZCameraAlignment;
  const { rig } = A;
  const $ = id => document.getElementById(id);
  const byId = new Map(root.XZBumpData.bumps.map(bump => [bump.id, bump]));
  const signed = (value, decimals = 1) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(decimals)}`;

  class Station {
    constructor(hooks) {
      this.hooks = hooks;
      this.mode = 'opu';
      this.pose = null;
      this.target = null;
      this.direction = null;
      this.canvas = $('industrial-frame');
      this.message = '先移到拍照工位，样片将在退让高度停稳后取一帧。';
      this.cameraCenter = 4000;
      this.canvas.addEventListener('pointerup', event => this.pick(event));
      $('camera-photo').addEventListener('click', () => this.photo());
      $('camera-calibrate').addEventListener('click', () => {
        this.calibration = A.calibrate();
        this.message = '九点标定已拟合，并记录了同一虚拟靶在两个工位的 X 读数。';
        this.refresh(); this.draw();
      });
      $('camera-pick-direction').addEventListener('click', () => {
        this.pickDirection = !this.pickDirection;
        this.refresh();
      });
      $('camera-align-y').addEventListener('click', () => this.align(false));
      $('camera-align-theta').addEventListener('click', () => this.align(true));
      $('camera-y').addEventListener('change', event => {
        this.hooks.configure({ row: Number(event.target.value) });
        event.target.value = this.hooks.setup().row.toFixed(2);
        this.refresh();
      });
      $('camera-zoom').addEventListener('change', () => this.draw());
      $('camera-back').addEventListener('click', () => this.back());
      $('camera-transfer').addEventListener('click', () => this.transfer());
      new ResizeObserver(() => this.draw()).observe(this.canvas);
    }

    get isMoving() { return this.mode === 'moving'; }
    get allowsScan() { return this.mode === 'opu'; }
    get active() { return this.hooks.setup()?.sample.id === 'bump-2x3' && this.hooks.unlocked(); }
    get atCamera() { return this.mode === 'photo'; }

    photo() {
      if (!this.active || this.isMoving) return;
      const value = $('camera-center-x').valueAsNumber;
      const x = A.stageX(rig.cameraX, value);
      if (!Number.isFinite(value) || value < 0 || value > this.hooks.setup().sample.width || !A.withinTravel(x)) {
        this.message = `拍照位超出样片或候选 X 行程 ±${rig.xLimit} mm。请把视场中心向样片 X 起点移近。`;
        this.refresh(); return;
      }
      this.travel({ x, z: rig.photoZ }, 'photo', () => {
        if (this.cameraCenter !== value) this.target = this.direction = null;
        this.cameraCenter = value;
        this.pickDirection = false;
        this.capture();
        this.message = '拍摄完成。点击一颗凸点作为目标，也可以再选同一行的第二颗。';
      });
    }

    travel(to, mode, finish) {
      const from = this.pose || this.hooks.opuPose();
      const route = A.transport(from, to);
      this.mode = 'moving';
      this.pose = from;
      this.motion = { route, to, mode, finish, from, started: performance.now() };
      this.hooks.changed();
    }

    tick(t) {
      if (!this.motion) return;
      const move = this.motion, next = move.route[0];
      if (!next) {
        this.mode = move.mode; this.pose = this.atCamera ? move.to : null;
        this.motion = null;
        move.finish?.();
        this.hooks.changed();
        return;
      }
      const distance = Math.abs(next.x - move.from.x) + Math.abs(next.z - move.from.z);
      const ratio = Math.max(0, Math.min(1, (t - move.started) / Math.max(200, distance * 37)));
      const f = ratio * ratio * (3 - 2 * ratio);
      this.pose = { x: move.from.x + (next.x - move.from.x) * f, z: move.from.z + (next.z - move.from.z) * f };
      if (ratio >= 1) {
        move.route.shift(); move.from = next; move.started = t;
      }
      this.hooks.poseChanged();
      this.showPosition(next.label);
    }

    showPosition(label) {
      const p = this.pose || this.hooks.opuPose();
      $('camera-stage').textContent = p ? `${label} · 滑台 X ${signed(p.x, 3)} mm · Z ${signed(p.z, 3)} mm` : label;
    }

    capture() {
      const sim = this.hooks.setup();
      this.image = { center: this.cameraCenter, row: sim.row, pose: sim.placement, sample: sim.sample };
      const visible = id => !id || this.inside(this.project(byId.get(id)).uv, 1);
      if (!visible(this.target)) this.target = this.direction = null;
      if (!visible(this.direction)) this.direction = null;
      this.draw();
    }

    configurationChanged() {
      if (this.atCamera) this.capture();
      this.refresh();
    }

    project(bump) {
      const [x, y] = this.image.pose.forward(bump.x, bump.y);
      const uv = A.pixel(x - this.image.center, y - this.image.row);
      return { uv, measured: A.sensorPoint(uv) };
    }

    bounds(zoom) {
      const u = rig.roiXUm / rig.pixelUm / (2 * zoom), v = rig.roiYUm / rig.pixelUm / (2 * zoom);
      return [rig.widthPx / 2 - u, rig.heightPx / 2 - v, 2 * u, 2 * v];
    }

    inside([u, v], zoom) {
      const [left, top, w, h] = this.bounds(zoom);
      return u >= left && u <= left + w && v >= top && v <= top + h;
    }

    pick(event) {
      if (!this.atCamera || !this.image || !this.active) return;
      const rect = this.canvas.getBoundingClientRect(), zoom = Number($('camera-zoom').value);
      const [left, top, w, h] = this.bounds(zoom);
      const u = left + (event.clientX - rect.left) * w / rect.width;
      const v = top + (event.clientY - rect.top) * h / rect.height;
      let match = null, best = Infinity;
      for (const bump of byId.values()) {
        const { uv } = this.project(bump);
        if (!this.inside(uv, zoom)) continue;
        const distance = Math.hypot(uv[0] - u, uv[1] - v);
        if (distance < best && distance <= bump.radius / rig.pixelUm + 4 * w / rect.width) {
          best = distance; match = bump;
        }
      }
      if (!match) this.message = '这里没有找到凸点。放大画面或移动视场后再点选。';
      else if (this.pickDirection && match.id !== this.target) {
        this.direction = match.id; this.pickDirection = false;
        this.message = '已记录方向点。请确认两颗凸点属于同一行。';
      } else {
        this.target = match.id; this.direction = null; this.pickDirection = false;
        this.message = `已选中 ${match.id}。标定后可查看横向偏差并转运。`;
      }
      this.refresh(); this.draw();
    }

    plan() {
      if (!this.image || !this.target || !this.calibration || !this.atCamera) return null;
      const sim = this.hooks.setup(), target = this.project(byId.get(this.target));
      const lead = $('camera-lead').valueAsNumber;
      const p = A.handoff(this.calibration, target.measured, this.pose.x, lead);
      const end = p.startUm + (sim.end - sim.start);
      let line = null;
      if (this.direction) {
        const b = this.calibration.toPlane(this.project(byId.get(this.direction)).measured);
        const dx = b[0] - p.dxUm, dy = b[1] - p.dyUm;
        line = { deltaY: dy, angle: Math.atan2(dx < 0 ? -dy : dy, Math.abs(dx)) * 180 / Math.PI };
      }
      const inside = x => {
        const [u, v] = sim.placement.inverse(x, sim.row);
        return u >= 0 && u <= sim.sample.width && v >= 0 && v <= sim.sample.depth;
      };
      let reason = '';
      if (!Number.isFinite(lead) || lead < 0 || lead > 1000) reason = '起点前留量须为 0–1000 µm。';
      else if (sim.end - sim.start < lead) reason = '扫描长度小于起点前留量，扫描段到不了所选凸点。';
      else if (!A.withinTravel(p.opuStartX) || !A.withinTravel(p.opuTargetX) || !A.withinTravel(A.stageX(rig.opuX, end))) reason = '目标或扫描段超出候选 X 行程。';
      else if (!inside(p.startUm) || !inside(end)) reason = '扫描段超出样片，请缩短当前扫描长度或另选目标。';
      else if (Math.abs(p.dyUm) > 5) reason = '先把目标的 Y 偏差调到 ±5 µm 内。';
      else if (line && Math.abs(line.deltaY) > 5) reason = '两点的 Y 差超出 5 µm，请调整 θ。';
      else if (!sim.waferZone(p.startUm)) reason = '起点落在凸点或其保护区，请调整前留量，使起点落在裸硅上。';
      return { ...p, end, line, reason };
    }

    align(theta) {
      const p = this.plan(), sim = this.hooks.setup();
      if (!p || !this.active || theta && !p.line) return;
      const values = theta ? { yaw: sim.yaw - p.line.angle } : { row: sim.row + p.dyUm };
      if (Math.abs(values.yaw || 0) > 3 || !this.hooks.configure(values)) {
        this.message = '调整超出样片范围或 ±3°，请核对所选两颗凸点与扫描范围。';
      } else this.message = theta ? '已模拟调整 θ，请复查 Y 偏差。' : '已模拟调整 Y 并重新拍摄。';
      this.refresh();
    }

    back() {
      if (!this.atCamera || !this.active) return;
      const pose = this.hooks.opuPose();
      if (!A.withinTravel(pose.x)) return;
      this.travel(pose, 'opu', () => { this.message = '已返回 OPU 工位，保留最近一次拍摄画面。'; });
    }

    transfer() {
      const p = this.plan();
      if (!this.active || !p || p.reason) return;
      if (!this.hooks.configure({ start: p.startUm, end: p.end })) return;
      this.lastTransfer = { target: this.target, station_offset_mm: this.calibration.transferMm,
        start_um: p.startUm, target_opu_x_mm: p.opuTargetX, y_offset_um: p.dyUm };
      this.hooks.recordTransfer(this.lastTransfer);
      this.travel(this.hooks.opuPose(), 'opu', () => { this.message = '样片已到 OPU。已填入扫描起点，点击「开始扫描」进行 FES 测高。'; });
    }

    refresh() {
      const block = !this.active || this.isMoving, ready = this.atCamera && !block;
      const p = this.plan(), sim = this.hooks.setup();
      $('camera-photo').disabled = block;
      $('camera-center-x').disabled = block;
      $('camera-lead').disabled = block;
      $('camera-yaw').disabled = block;
      $('camera-y').disabled = block;
      if (sim && document.activeElement !== $('camera-y')) $('camera-y').value = sim.row.toFixed(2);
      $('camera-calibrate').disabled = !ready;
      $('camera-pick-direction').disabled = !ready || !this.target;
      $('camera-pick-direction').textContent = this.pickDirection ? '点选同一行的第二颗' : '选第二颗定方向';
      $('camera-align-y').disabled = !ready || !p;
      $('camera-align-theta').disabled = !ready || !p?.line;
      $('camera-back').disabled = !ready;
      $('camera-transfer').disabled = !ready || !p || !!p.reason;
      const c = this.calibration;
      $('camera-calibration').textContent = c ? `${c.pointCount} 点 · 拟合残差 ${c.rmsUm.toFixed(2)} µm · 同靶转运 ${signed(c.transferMm, 4)} mm` : '等待模拟点阵与同靶标定';
      $('camera-selection').textContent = this.target ? `${this.target}${this.direction ? ` → ${this.direction}` : ''}` : '未选中凸点';
      const delivered = sim?.cameraTransfer;
      $('camera-plan').textContent = p && Number.isFinite(p.startUm)
        ? `Y 偏差 ${signed(p.dyUm, 2)} µm${p.line ? ` · 行偏角 ${signed(p.line.angle, 3)}°` : ''} · 样片 X 起点 ${p.startUm.toFixed(1)} µm · OPU 滑台 X ${signed(p.opuStartX, 3)} mm`
        : delivered ? `已交给 OPU · ${delivered.target} · 样片 X 起点 ${delivered.start_um.toFixed(1)} µm`
        : '在拍照工位完成标定并点选凸点后显示预测坐标。';
      $('camera-message').textContent = !this.active ? (sim?.sample.id === 'bump-2x3' ? '当前扫描行锁定，结束并保存后可使用相机。' : '相机演示使用 Bump 2×3 样片。')
        : this.isMoving ? '工位转运中' : p?.reason || this.message;
      this.showPosition(this.atCamera ? '拍照工位' : this.isMoving ? '转运中' : 'OPU 工位');
    }

    draw() {
      const { width: w, height: h } = this.canvas.getBoundingClientRect();
      if (!w || !h) return;
      const dpr = Math.min(2, devicePixelRatio);
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      const c = this.canvas.getContext('2d');
      c.scale(dpr, dpr);
      c.fillStyle = '#202b37'; c.fillRect(0, 0, w, h);
      c.font = '12px sans-serif';
      if (!this.image) {
        c.fillStyle = '#b2c0cc'; c.textAlign = 'center';
        c.fillText('移到拍照工位后显示模拟画面', w / 2, h / 2);
        return;
      }
      const zoom = Number($('camera-zoom').value), [left, top, bw, bh] = this.bounds(zoom);
      const screen = ([u, v]) => [(u - left) * w / bw, (v - top) * h / bh];
      const { pose, center, row, sample } = this.image;
      const corners = [[0, 0], [sample.width, 0], [sample.width, sample.depth], [0, sample.depth]];
      c.beginPath();
      corners.forEach(([x, y], i) => {
        const [u, v] = pose.forward(x, y);
        const p = screen(A.pixel(u - center, v - row));
        if (i) c.lineTo(...p); else c.moveTo(...p);
      });
      c.closePath(); c.fillStyle = '#646d77'; c.fill();
      for (const bump of byId.values()) {
        const { uv } = this.project(bump);
        if (!this.inside(uv, zoom)) continue;
        const [x, y] = screen(uv), r = Math.max(1.5, bump.radius * w / (rig.pixelUm * bw));
        const shade = c.createRadialGradient(x - r * .25, y - r * .25, 0, x, y, r);
        shade.addColorStop(0, '#ecedf0'); shade.addColorStop(.61, '#a7adb4'); shade.addColorStop(1, '#50565d');
        c.fillStyle = shade; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
        if (bump.id === this.target || bump.id === this.direction) {
          c.strokeStyle = bump.id === this.target ? '#ffce71' : '#64daff';
          c.lineWidth = 2; c.beginPath(); c.arc(x, y, r + 4, 0, Math.PI * 2); c.stroke();
        }
      }
      if (this.calibration) {
        const line = (a, b) => { c.moveTo(...screen(this.calibration.toPixel(a))); c.lineTo(...screen(this.calibration.toPixel(b))); };
        c.strokeStyle = '#5ad5e9'; c.lineWidth = 1; c.setLineDash([6, 4]); c.beginPath();
        line([-rig.roiXUm, 0], [rig.roiXUm, 0]); line([0, -100], [0, 100]); c.stroke(); c.setLineDash([]);
      }
      c.fillStyle = '#17232ee8'; c.fillRect(0, 0, w, 24); c.fillRect(0, h - 24, w, 24);
      c.fillStyle = '#e4edf4';
      c.fillText(`模拟帧 · ROI ${(rig.roiXUm / zoom / 1000).toFixed(2)} × ${(rig.roiYUm / zoom / 1000).toFixed(2)} mm`, 10, 16);
      c.fillText(this.calibration ? '青线为 OPU 虚拟扫描线' : '等待相机标定', 10, h - 8);
    }
  }

  function addModel(scene) {
    const group = new THREE.Group(); group.name = '固定工业相机与候选支架'; scene.add(group);
    const steel = new THREE.MeshStandardMaterial({ color: '#60768a', roughness: .66 });
    const blue = new THREE.MeshStandardMaterial({ color: '#3277a2', roughness: .65 });
    const barrel = new THREE.MeshStandardMaterial({ color: '#20394a', roughness: .64 });
    const glass = new THREE.MeshStandardMaterial({ color: '#376d7d', metalness: .25, roughness: .22 });
    const place = (geo, material, x, y, z) => {
      const mesh = new THREE.Mesh(geo, material); mesh.position.set(x, y, z); group.add(mesh); return mesh;
    };
    const box = (w, h, d, material, x, y, z) => place(new THREE.BoxGeometry(w, h, d), material, x, y, z);
    const front = rig.photoPlane + rig.workingDistance, flange = front + rig.barrelLength;
    const { cameraX: x, depth: z, bodyWidth: b, bodyLength: length } = rig;
    place(new THREE.CylinderGeometry(rig.barrelDiameter / 2, rig.barrelDiameter / 2, rig.barrelLength, 48), barrel, x, (front + flange) / 2, z);
    place(new THREE.CylinderGeometry(10.5, 10.5, .45, 48), glass, x, front - .22, z);
    box(b, length, b, blue, x, flange + length / 2, z);
    // Concept bracket supported by the fixed backplate. These blocks are envelopes.
    box(26, 26, 8, steel, 100, 282, 30);
    box(14, 76, 14, steel, 100, 316, 37);
    box(14, 12, z - 37, steel, 100, 354, (37 + z) / 2);
    box(x - b / 2 - 100, 12, 14, steel, (x - b / 2 + 100) / 2, 354, z);
    const footprint = [];
    for (const [dx, dz] of [[-2.6, -2], [2.6, -2], [2.6, 2], [-2.6, 2], [-2.6, -2]]) {
      footprint.push(new THREE.Vector3(x + dx, rig.photoPlane + .05, z + dz));
    }
    const rayColor = new THREE.LineBasicMaterial({ color: '#34bfdb', opacity: .72, transparent: true });
    const rays = new THREE.Group(); rays.visible = false;
    rays.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(footprint), rayColor));
    rays.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, front, z),
      new THREE.Vector3(x, rig.photoPlane, z)]), rayColor));
    group.add(rays);
    return { group, rays };
  }

  root.XZCameraView = { Station, addModel };
})(globalThis);
