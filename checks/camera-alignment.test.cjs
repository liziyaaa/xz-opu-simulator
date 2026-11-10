const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const A = require('../docs/xz/v1.6.0/camera-alignment.js');
const P = require('../docs/xz/v1.3.0/physics.js');
const B = require('../docs/xz/v1.3.0/bump_data.js');
const { Simulation } = require('../docs/xz/v1.6.0/paper-scan.js');

const cfg = { ...P.defaultConfig(), spot: 1.22 * .65 / .60, scanMode: 'adaptive', flatBand: .25, rfTolerance: 3, rawHz: 500 };
const run = s => { while (!s.done && !s.halted) s.commit(); return s; };

test('camera recovers roll and plane coordinates and the same-fiducial offset has the correct sign', () => {
  const calibration = A.calibrate();
  assert.equal(calibration.pointCount, 9);
  assert.equal(calibration.transferMm, 14);
  assert.ok(calibration.rmsUm < .5);
  const measured = A.sensorPoint(A.pixel(-890, 193));
  const [x, y] = calibration.toPlane(measured);
  assert.ok(Math.abs(x + 890) < 1 && Math.abs(y - 193) < 1);
  assert.ok(Math.hypot(...calibration.toPixel([x, y]).map((p, i) => p - measured[i])) < 1e-8);
  assert.throws(() => A.fitPlane([1, 2, 3].map(x => ({ xy: [x, 0], uv: [x, 0] }))), /不足/);

  const bump = B.bumps[0], photoX = A.stageX(A.rig.cameraX, 4000);
  const plan = A.handoff(calibration, A.sensorPoint(A.pixel(bump.x - 4000, 0)), photoX, 120);
  assert.ok(Math.abs(plan.startUm - (bump.x - 120)) < 1);
  assert.ok(plan.opuStartX > plan.opuTargetX && plan.opuTargetX > photoX);
  assert.equal(A.withinTravel(A.stageX(A.rig.cameraX, 10000)), false);
});

test('transfers move X at the retracted Z before raising to the OPU', () => {
  const opu = { x: 3.82, z: 0 }, photo = { x: -10.4, z: -10 };
  assert.deepEqual(A.transport(opu, photo).map(({ x, z }) => [x, z]), [[3.82, -10], [-10.4, -10]]);
  assert.deepEqual(A.transport(photo, opu).map(({ x, z }) => [x, z]), [[3.82, -10], [3.82, 0]]);
  assert.deepEqual(A.transport(opu, opu), []);
});

test('the selected rotated Bump and the OPU surface share the same placement', () => {
  const bump = B.bumps[0], yaw = 2;
  const pose = A.placement(yaw, B.width, B.depth), [x, row] = pose.forward(bump.x, bump.y);
  const sim = run(new Simulation('bump-2x3', cfg, { start: x - 120, end: x + 120, step: 2, row, yaw }));
  assert.equal(sim.surface(x).bumpId, bump.id);
  assert.equal(sim.height(x), 50);
  assert.equal(sim.waferZone(x), false);
  assert.equal(sim.waferZone(sim.start), true);
  assert.ok(sim.done && !sim.halted);
  assert.ok(Math.max(...sim.records.filter(r => r.valid).map(r => r.estimate)) > 49.9);

  const flat = run(new Simulation('bump-2x3', cfg, { start: 3600, end: 4500, step: 2, row: 1800 }));
  assert.equal(flat.sweepCount, 1);
  assert.equal(flat.holds, 450);
});

test('camera release assets match their pinned hashes', () => {
  const dir = path.join(__dirname, '../docs/xz/v1.6.0');
  const release = JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8'));
  for (const [file, hash] of Object.entries(release.sha256)) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(dir, file))).digest('hex'), hash, file);
  }
});
