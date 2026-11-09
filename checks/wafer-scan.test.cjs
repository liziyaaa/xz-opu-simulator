const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const P = require('../docs/xz/v1.3.0/physics.js');
const R = require('../docs/xz/v1.3.0/response.js').create(require('../docs/xz/v1.3.0/measured_response.js'));
const { Simulation } = require('../docs/xz/v1.5.0/paper-scan.js');
const { Store } = require('../docs/xz/v1.5.0/rows.js');

function run(row, config = {}, range = {}, id = 'bump-2x3') {
  const cfg = { ...P.defaultConfig(), rawHz: 500, scanMode: 'adaptive', spot: 1.22 * .65 / .60,
    flatBand: .25, rfTolerance: 3, ...config };
  const sim = new Simulation(id, cfg, { row, start: 3600, end: 4500, step: 2, ...range });
  while (!sim.done && !sim.halted) sim.commit();
  return sim;
}

test('confirmed flat silicon scans once and holds Z for the rest of the line', () => {
  const sim = run(1800);
  assert.equal(sim.records.length, 451);
  assert.equal(sim.sweepCount, 1);
  assert.equal(sim.holds, 450);
  assert.equal(sim.losses, 0);
  assert.ok(sim.records.every(r => r.waferState === 'confirmed' && r.anchorIndex === 0 && r.estimate === 0));
});

test('equal-looking Bump remains a full sweep and re-entry needs confirmation', () => {
  const sim = run(3542.168675, { bumpReflectance: .35 });
  assert.ok(sim.done);
  assert.equal(sim.losses, 30);
  const bumps = sim.records.filter(r => r.material === 'bump' && r.valid);
  assert.ok(bumps.length > 0);
  assert.ok(bumps.every(r => r.action === 'sweep' && r.waferState === 'outside_recipe'));
  assert.equal(sim.records.filter(r => r.trigger === 'wafer_entry' && r.waferState === 'confirmed').length, 3);
  assert.equal(sim.waferZone(3870, 3940), false);
});

test('unknown materials or missing RF cannot skip S curves', () => {
  const responseEngine = { ...R, atDisplacement(...args) {
    return { ...R.atDisplacement(...args), rfMv: null, rfAvailable: false };
  } };
  const noRF = run(1800, { responseEngine }, { end: 3604 });
  assert.equal(noRF.sweepCount, 3);
  assert.ok(noRF.records.every(r => r.waferState === 'unconfirmed'));
  const unknown = run(1000, {}, { start: 0, end: 4 }, '04');
  assert.equal(unknown.sweepCount, 3);
  assert.ok(unknown.records.every(r => r.waferState === 'outside_recipe'));
});

test('large measurements can yield before commit and archives keep original raw arrays', () => {
  const sim = new Simulation('bump-2x3', { ...P.defaultConfig(), scanMode: 'adaptive', flatBand: .25,
    rfTolerance: 3, zSpeed: 2, rawHz: 500 }, { row: 1800, start: 3600, end: 3604, step: 2 });
  assert.equal(sim.prepareSlice(0), null);
  assert.equal(sim.records.length, 0);
  assert.equal(sim.raw.length, 0);
  assert.ok(sim.prepare().raw.length > 1000);
  assert.ok(sim.commit().valid);
  const rows = new Store({ maxSamples: sim.raw.length });
  rows.begin({ row: sim.row }); rows.lock();
  rows.finish({ raw: sim.raw, partial: [], records: sim.records });
  assert.strictEqual(rows.list()[0].raw, sim.raw);
  assert.strictEqual(rows.list()[0].records, sim.records);
  assert.equal(rows.list()[0].rawCount, sim.raw.length);
  rows.begin({ row: sim.row }); rows.lock();
  assert.throws(() => rows.finish({ raw: sim.raw, partial: [], records: sim.records }), /capacity/);
  assert.equal(rows.list().length, 1);
});

test('assembly is pinned to the selected STEP and X/Z motion groups are retained', () => {
  const dir = path.join(__dirname, '../docs/xz/v1.5.0');
  const release = JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8'));
  for (const [file, hash] of Object.entries(release.sha256)) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(dir, file))).digest('hex'), hash, file);
  }
  require(path.join(dir, 'assembly.js'));
  const data = globalThis.XZAssembly;
  assert.equal(data.sourceSHA256, 'f48fe9926674b2b1b2eb58b77bb2b9641db1f554c6e3469dd97777bff1c96388');
  assert.equal(data.parts, 163);
  assert.equal(data.groups.X_AssemblyPart_22, 'fixed');
  assert.equal(data.groups.Z_D28_48, 'X');
  assert.equal(data.groups.Z_D28_65, 'XZ');
  assert.equal(data.groups.CNC_Sample_InvertedL, 'XZ');
  assert.equal(data.groups.LeftTriangularSupport, 'fixed');
});
