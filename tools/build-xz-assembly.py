"""Pack the verified STEP tessellation into grouped browser meshes in CAD coordinates."""

import argparse
import base64
import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('--step', type=Path, required=True)
parser.add_argument('--motion-audit', type=Path, required=True)
parser.add_argument('--runtime', required=True)
args = parser.parse_args()
sys.path.insert(0, args.runtime)
import fast_simplification

repo = Path(__file__).resolve().parents[1]
verified = (repo / 'docs/wire/v1.1.0/assembly_data.js').read_text(encoding='utf-8')
source = json.loads(verified.split('r.WireAssemblyData=', 1)[1].rsplit(';})(', 1)[0])
assert hashlib.sha256(args.step.read_bytes()).hexdigest() == source['sourceSHA256']
motion = json.loads(args.motion_audit.read_text(encoding='utf-8'))['moving_groups']
groups = defaultdict(list)
parts = [p for p in source['parts'] if p['role'] == 'original']
assert len(parts) == 163 and set(motion) - {'Sample_4x4_reference'} == {p['name'] for p in parts}
for part in parts:
    points = np.asarray(part['vertices'], dtype=np.float64).reshape(-1, 3)
    faces = np.asarray(part['indices'], dtype=np.int32).reshape(-1, 3)
    name = part['name']
    size = max(b - a for a, b in zip(part['bbox'][:3], part['bbox'][3:]))
    target = 10000 if size >= 200 else 2000 if size >= 30 else 250
    if len(faces) > target * 1.5:
        points, remap = np.unique(np.round(points, 4), axis=0, return_inverse=True)
        points, faces = fast_simplification.simplify(points, remap[faces], target_count=target, agg=7)
    groups[motion[name], part['color']].append((points, faces))

def encode(values):
    return base64.b64encode(values.tobytes()).decode('ascii')

meshes = []
triangle_count = 0
for (group, color), entries in groups.items():
    points = np.concatenate([p for p, _ in entries])
    packed = np.rint(points * 100)
    assert np.abs(packed).max() < 32767
    indices, count = [], 0
    for p, f in entries:
        indices.append(f + count)
        count += len(p)
    indices = np.concatenate(indices)
    triangle_count += len(indices)
    wide = count > 65535
    meshes.append(dict(group=group, color=color, wide=wide,
                       positions=encode(packed.astype('<i2')), indices=encode(indices.astype('<u4' if wide else '<u2'))))

data = dict(sourceStep=args.step.name, sourceSHA256=source['sourceSHA256'], groups=motion,
            parts=len(parts), triangles=triangle_count, positionScaleMm=0.01,
            lens=[150, 229.75, 91.5], focus=[150, 218, 91.5], sampleMount=[142.39759, 217, 97.301205], meshes=meshes)
output = repo / 'docs/xz/v1.5.0/assembly.js'
output.write_text('globalThis.XZAssembly=' + json.dumps(data, separators=(',', ':')) + ';\n', encoding='utf-8', newline='\n')
print(f'{len(parts)} components, {len(meshes)} batches, {triangle_count} triangles, {output.stat().st_size} bytes')
