(function (root) {
  'use strict';

  const rig = Object.freeze({
    cameraX: 136, opuX: 150, depth: 91.5, photoZ: -10, photoPlane: 208, xLimit: 15,
    mountX: 142.39759, widthPx: 2448, heightPx: 2048, pixelUm: 2.74,
    roiXUm: 5200, roiYUm: 4000, workingDistance: 62.2, barrelLength: 65,
    barrelDiameter: 28, bodyWidth: 29, bodyLength: 48.1,
  });
  const radians = Math.PI / 180;

  function placement(angle, width, depth) {
    if (angle === 0) {
      const identity = (x, y) => [x, y];
      return { forward: identity, inverse: identity };
    }
    const c = Math.cos(angle * radians), s = Math.sin(angle * radians);
    const cx = width / 2, cy = depth / 2;
    return {
      forward: (x, y) => [cx + c * (x - cx) - s * (y - cy), cy + s * (x - cx) + c * (y - cy)],
      inverse: (x, y) => [cx + c * (x - cx) + s * (y - cy), cy - s * (x - cx) + c * (y - cy)],
    };
  }

  // Fixed virtual detector roll and origin let the calibration recover a
  // mapping instead of relying on perfectly aligned pixels.
  const roll = 1.2 * radians, cos = Math.cos(roll), sin = Math.sin(roll);
  function pixel(xUm, yUm) {
    return [rig.widthPx / 2 + 2.4 + (cos * xUm - sin * yUm) / rig.pixelUm,
      rig.heightPx / 2 - 1.7 + (sin * xUm + cos * yUm) / rig.pixelUm];
  }

  function solve(matrix, vector) {
    const a = matrix.map((row, i) => [...row, vector[i]]);
    for (let i = 0; i < 3; i++) {
      const pivot = [i, i + 1, i + 2].filter(k => k < 3)
        .reduce((p, k) => Math.abs(a[k][i]) > Math.abs(a[p][i]) ? k : p, i);
      if (Math.abs(a[pivot][i]) < 1e-9) throw new RangeError('标定点分布不足');
      [a[i], a[pivot]] = [a[pivot], a[i]];
      const scale = a[i][i];
      for (let j = i; j < 4; j++) a[i][j] /= scale;
      for (let k = 0; k < 3; k++) {
        if (k === i) continue;
        const factor = a[k][i];
        for (let j = i; j < 4; j++) a[k][j] -= factor * a[i][j];
      }
    }
    return a.map(row => row[3]);
  }

  function fitPlane(pairs) {
    if (pairs.length < 3) throw new RangeError('至少需要三个不共线的标定点');
    const center = [rig.widthPx / 2, rig.heightPx / 2];
    const matrix = Array.from({ length: 3 }, () => [0, 0, 0]);
    const terms = [[0, 0, 0], [0, 0, 0]];
    for (const { uv, xy } of pairs) {
      const q = [uv[0] - center[0], uv[1] - center[1], 1];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) matrix[i][j] += q[i] * q[j];
        for (let d = 0; d < 2; d++) terms[d][i] += q[i] * xy[d];
      }
    }
    const [x, y] = terms.map(term => solve(matrix, term));
    const toPlane = ([u, v]) => {
      const du = u - center[0], dv = v - center[1];
      return [x[0] * du + x[1] * dv + x[2], y[0] * du + y[1] * dv + y[2]];
    };
    const determinant = x[0] * y[1] - x[1] * y[0];
    if (Math.abs(determinant) < 1e-9) throw new RangeError('标定矩阵不可逆');
    const toPixel = ([px, py]) => {
      const dx = px - x[2], dy = py - y[2];
      return [center[0] + (y[1] * dx - x[1] * dy) / determinant,
        center[1] + (x[0] * dy - y[0] * dx) / determinant];
    };
    const rmsUm = Math.sqrt(pairs.reduce((sum, { uv, xy }) => {
      const [a, b] = toPlane(uv);
      return sum + (a - xy[0]) ** 2 + (b - xy[1]) ** 2;
    }, 0) / pairs.length);
    return { toPlane, toPixel, rmsUm };
  }

  const stageX = (axis, sampleXUm) => axis - rig.mountX - sampleXUm / 1000;
  const withinTravel = x => Number.isFinite(x) && Math.abs(x) <= rig.xLimit + 1e-8;
  const sensorPoint = ([u, v]) => [Math.round(u * 4) / 4, Math.round(v * 4) / 4];
  function calibrate() {
    const pairs = [-2100, 0, 2100].flatMap(x => [-1600, 0, 1600].map(y => ({ xy: [x, y], uv: sensorPoint(pixel(x, y)) })));
    // A single virtual fiducial at two stations, with rounded position readings.
    const cameraReading = Number(stageX(rig.cameraX, 3900).toFixed(4));
    const opuReading = Number(stageX(rig.opuX, 3900).toFixed(4));
    return { ...fitPlane(pairs), transferMm: opuReading - cameraReading, cameraReading, opuReading, pointCount: pairs.length };
  }

  function handoff(calibration, uv, photoX, leadUm) {
    const [dxUm, dyUm] = calibration.toPlane(uv);
    const opuTargetX = photoX + calibration.transferMm - dxUm / 1000;
    const opuStartX = opuTargetX + leadUm / 1000;
    return { dxUm, dyUm, opuTargetX, opuStartX, startUm: (rig.opuX - rig.mountX - opuStartX) * 1000 };
  }

  function transport(from, to) {
    if (Math.abs(to.x - from.x) + Math.abs(to.z - from.z) <= 1e-7) return [];
    const route = [
      { x: from.x, z: rig.photoZ, label: 'Z 下降至转运高度' },
      { x: to.x, z: rig.photoZ, label: '在退让高度转运 X' },
      { ...to, label: '在 OPU 下抬升 Z' },
    ];
    let last = from;
    return route.filter(point => {
      const changed = Math.abs(point.x - last.x) + Math.abs(point.z - last.z) > 1e-7;
      last = point;
      return changed;
    });
  }

  const api = { rig, placement, pixel, fitPlane, sensorPoint, stageX, withinTravel, calibrate, handoff, transport };
  if (typeof module !== 'undefined') module.exports = api;
  else root.XZCameraAlignment = api;
})(globalThis);
