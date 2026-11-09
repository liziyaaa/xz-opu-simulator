const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const P = require('../docs/xz/v1.3.0/physics.js');
const R = require('../docs/xz/v1.3.0/response.js').create(require('../docs/xz/v1.3.0/measured_response.js'));
const { Simulation, fitSweep } = require('../docs/xz/v1.4.0/paper-scan.js');

function scan(scanMode, row, config = {}, range = {}) {
  const cfg = { ...P.defaultConfig(), spot: 1.22 * 0.650 / 0.60, rawHz: 500, scanMode,
    flatBand: 0.25, rfTolerance: 3, rescanInterval: 20, ...config };
  const sim = new Simulation('bump-2x3', cfg, { start: 3600, end: 4500, step: 2, row, ...range });
  while (!sim.done && !sim.halted) sim.commit();
  return sim;
}

test('center fit removes a shared offset and is invariant to a pure change in gain', () => {
  const trace = gain => Array.from({ length: 201 }, (_, i) => {
    const zEncoder = i / 10 - 10;
    const d = zEncoder - 0.13;
    return { zEncoder, v: -60 - gain * d * Math.exp(-0.5 * (d / 4) ** 2), fesAvailable: true };
  });
  const a = fitSweep(trace(28), -60);
  const b = fitSweep(trace(186), -60);
  assert.ok(Math.abs(a.focus - 0.13) < 0.005);
  assert.ok(Math.abs(a.focus - b.focus) < 1e-9);
  assert.ok(Math.abs(b.slope / a.slope - 186 / 28) < 1e-9);
  assert.equal(fitSweep(trace(28).filter(p => p.zEncoder > 0), -60).reason, 'sweep_range');
});

test('flat silicon skips 428 scans while retaining the first focus and periodic anchors', () => {
  const every = scan('every', 1800);
  const adaptive = scan('adaptive', 1800);
  assert.equal(every.sweepCount, 451);
  assert.equal(adaptive.sweepCount, 23);
  assert.equal(adaptive.holds, 428);
  assert.equal(adaptive.records[0].trigger, 'baseline');
  assert.equal(adaptive.records[0].estimate, 0);
  assert.equal(adaptive.records[20].trigger, 'periodic');
  assert.equal(adaptive.records[21].anchorIndex, 20);
  assert.equal(adaptive.records[21].zTrue, adaptive.records[20].zTrue);
  assert.ok(adaptive.elapsed < every.elapsed * 0.25);
});

test('both strategies cross the mixed-material Bump row with the same empty edge points', () => {
  const every = scan('every', 3542.168675);
  const adaptive = scan('adaptive', 3542.168675);
  assert.ok(every.done && adaptive.done);
  const invalid = sim => sim.records.filter(p => !p.valid).map(p => [p.x, p.reason]);
  assert.equal(invalid(every).length, 30);
  assert.deepEqual(invalid(every), invalid(adaptive));
  assert.ok(adaptive.records.some(p => p.trigger === 'after_invalid' && p.valid));
  assert.ok(adaptive.records.some(p => p.sweepAttempts === 2 && p.valid && p.material === 'bump' && p.estimate > 40));
  assert.ok(adaptive.records.filter(p => p.valid).every(p => Math.abs(p.error) < 0.10));
  assert.ok(adaptive.sweepCount < every.sweepCount * 0.25);
});

test('sampling spacing and missing RF fail safely without inventing a height', () => {
  const range = { end: 3604 };
  const sparse = scan('every', 1800, { zSpeed: 1000 }, range);
  assert.equal(sparse.haltReason, 'sweep_sampling');
  assert.equal(sparse.records[0].estimate, null);
  assert.equal(sparse.baselineReady, false);
  assert.ok(scan('every', 1800, { zSpeed: 1000, rawHz: 5000 }, range).done);

  const responseEngine = { ...R, atDisplacement(...args) {
    return { ...R.atDisplacement(...args), rfMv: null, rfAvailable: false };
  } };
  const missingRF = scan('adaptive', 1800, { responseEngine }, range);
  assert.ok(missingRF.done);
  assert.equal(missingRF.records[1].trigger, 'signal_missing');
  assert.equal(missingRF.holds, 0);
  assert.equal(missingRF.sweepCount, 3);
  const limited = scan('adaptive', 1800, { maxRaw: 10 }, range);
  assert.equal(limited.haltReason, 'capture_limit');
  assert.equal(limited.raw.length, 10);
  assert.equal(limited.records[0].estimate, null);
});

test('release manifest audits the new module', () => {
  const dir = path.join(__dirname, '../docs/xz/v1.4.0');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8'));
  for (const [file, hash] of Object.entries(manifest.sha256)) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(dir, file))).digest('hex'), hash, file);
  }
});
