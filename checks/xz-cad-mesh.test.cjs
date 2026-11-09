const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const dir = path.join(__dirname, '../docs/xz/v1.5.1');
const release = JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8'));
require(path.join(dir, 'assembly.js'));
const cad = globalThis.XZAssembly;

test('the STEP release retains motion groups, major parts and their CAD extents', () => {
  for (const [file, hash] of Object.entries(release.sha256)) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(dir, file))).digest('hex'), hash, file);
  }
  const before = JSON.parse(fs.readFileSync(path.join(dir, '../v1.5.0/version.json'), 'utf8'));
  assert.equal(cad.sourceSHA256, before.modelSource.sha256);
  assert.equal(Object.keys(cad.groups).length, cad.parts);
  assert.equal(Object.keys(cad.partAudit).length, cad.parts);
  const expected = {
    LeftTriangularSupport: ['fixed', 'frame'],
    RightTriangularSupport: ['fixed', 'frame'],
    AssemblyPart_02: ['fixed', 'mount'],
    CNC_Sample_InvertedL: ['XZ', 'mount'],
    X_AssemblyPart_04: ['X', 'x'],
    X_AssemblyPart_22: ['fixed', 'motor'],
    Z_D28_48: ['X', 'motor'],
    Z_D28_65: ['XZ', 'z'],
    Revised_OPU_01: ['fixed', 'opu'],
  };
  for (const [name, [group, category]] of Object.entries(expected)) {
    assert.equal(cad.groups[name], group, name);
    assert.equal(cad.partAudit[name].category, category, name);
    assert.ok(cad.partAudit[name].triangles > 100, name);
  }
  assert.ok(Object.values(cad.partAudit).every(part => part.projectedExtentErrorMm < .0045));
  assert.deepEqual(Object.entries(cad.partAudit).filter(([, part]) => part.simplifiedInternalThreads)
    .map(([name, part]) => [name, part.simplifiedInternalThreads]), [['AssemblyPart_01', 121], ['VerticalOpticalPlate', 96]]);
});

test('renderable mesh batches have valid indices and a distinct assembly palette', () => {
  const colors = Object.values(cad.palette).filter(entry => entry.label).map(entry => entry.color);
  assert.equal(new Set(colors).size, 7);
  let triangles = 0;
  for (const mesh of cad.meshes) {
    assert.ok(cad.palette[mesh.category]);
    assert.equal(mesh.origin.length, 3);
    assert.ok(mesh.origin.every(Number.isFinite));
    const points = Buffer.from(mesh.positions, 'base64');
    const indices = Buffer.from(mesh.indices, 'base64');
    const width = mesh.wide ? 4 : 2;
    assert.equal(points.length % 6, 0);
    assert.equal(indices.length % (width * 3), 0);
    const count = points.length / 6;
    for (let i = 0; i < indices.length; i += width) {
      const index = mesh.wide ? indices.readUInt32LE(i) : indices.readUInt16LE(i);
      assert.ok(index < count, mesh.category);
    }
    triangles += indices.length / (width * 3);
  }
  assert.equal(triangles, cad.triangles);
});
