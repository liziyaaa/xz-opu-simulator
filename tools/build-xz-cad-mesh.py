"""Build the browser geometry directly from STEP using the FreeCAD Python runtime."""

import argparse
import base64
import hashlib
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(sys.executable).parent))
import FreeCAD as App
import MeshPart
import Part


LINEAR_DEFLECTION = 0.025
ANGULAR_DEFLECTION = 0.24
POSITION_SCALE = 0.005
PLATE_THREADS = {'AssemblyPart_01': (2, 121), 'VerticalOpticalPlate': (1, 96)}
PALETTE = {
    'frame': {'label': '底板 / 后支撑', 'color': '#8B9AA9'},
    'x': {'label': 'X 滑台', 'color': '#477DAD'},
    'z': {'label': 'Z 滑台', 'color': '#7969A5'},
    'motor': {'label': '电机', 'color': '#353F50'},
    'mount': {'label': '转接板 / 支架', 'color': '#C38343'},
    'opu': {'label': '固定 OPU', 'color': '#278975'},
    'sample': {'label': '硅基底 / 凸点', 'color': '#C4AE6E'},
    'steel': {'color': '#65717F'},
    'lens': {'color': '#74B5AF'},
}


def vector(point):
    return point.x, point.y, point.z


def signature(solid):
    return tuple(round(value, 4) for value in (solid.Volume, *vector(solid.CenterOfMass)))


def named_step_solids(step_path, native_path):
    # This STEP is a flattened compound. Its same-release native companion
    # supplies the names only. Every rendered solid below comes from STEP.
    doc = App.openDocument(str(native_path))
    named = sorted((signature(solid), obj.Name)
                   for obj in doc.Objects if obj.TypeId == 'Part::Feature' and not obj.Shape.isNull()
                   for solid in obj.Shape.Solids)
    step = Part.read(str(step_path))
    assert step.isValid()
    solids = sorted(((signature(solid), solid) for solid in step.Solids), key=lambda entry: entry[0])
    assert len(named) == len(solids) == 2258
    by_name = defaultdict(list)
    for (reference, name), (observed, solid) in zip(named, solids):
        assert abs(reference[0] - observed[0]) < .02 and max(abs(a - b) for a, b in zip(reference[1:], observed[1:])) < .0002, name
        by_name[name].append(solid)
    App.closeDocument(doc.Name)
    return by_name


def material(name):
    if name in {'X_AssemblyPart_22', 'X_AssemblyPart_23', 'Z_D28_48'}:
        return 'motor'
    if name in {'AssemblyPart_02', 'CNC_OPU_Embedded_Simplified', 'CNC_Sample_InvertedL', 'X_AssemblyPart_21'}:
        return 'mount'
    if name in {'Revised_OPU_11', 'Revised_OPU_12'}:
        return 'lens'
    if name.startswith('Revised_OPU_'):
        return 'opu'
    if name.startswith('X_AssemblyPart_'):
        return 'x'
    if name.startswith('Z_D28_'):
        return 'z'
    if name in {'AssemblyPart_01', 'VerticalOpticalPlate', 'LeftTriangularSupport', 'RightTriangularSupport'}:
        return 'frame'
    return 'steel'


def projected_extents(points, directions):
    projections = np.einsum('nd,kd->nk', points, directions)
    return projections.min(axis=0), projections.max(axis=0)


def screen_directions():
    # The front, left, right and focus views from the browser.
    up = np.array([0., 1., 0.])
    directions = []
    for camera in [(0, 0, 700), (-390, 20, 690), (390, 20, 690), (70, 22, 150)]:
        axis = np.asarray(camera, dtype=float)
        axis /= np.linalg.norm(axis)
        right = np.cross(up, axis)
        right /= np.linalg.norm(right)
        vertical = np.cross(axis, right)
        for angle in np.linspace(0, np.pi, 8, endpoint=False):
            directions.append(right * np.cos(angle) + vertical * np.sin(angle))
    return np.asarray(directions)


def inner_threads(faces, axis):
    by_center = defaultdict(list)
    for i, face in enumerate(faces):
        surface = face.Surface
        if not isinstance(surface, (Part.Cylinder, Part.Cone)) or abs(vector(surface.Axis)[axis]) < .999999:
            continue
        center = tuple(round(v, 5) for k, v in enumerate(vector(surface.Center)) if k != axis)
        by_center[center].append(i)
    # These holes are modeled as 41 coaxial surfaces. Ordinary mounting
    # counterbores and the four outside corner radii have different topology.
    return {center: ids for center, ids in by_center.items() if len(ids) == 41}


def tube_triangles(points, walls, axis, center):
    depth = points[walls, axis]
    transverse = [i for i in range(3) if i != axis]

    def ring(level):
        ids = np.unique(walls[np.abs(depth - level) < 1e-5])
        xy = points[ids][:, transverse] - center
        angle = np.mod(np.arctan2(xy[:, 1], xy[:, 0]), 2 * np.pi)
        order = np.argsort(angle)
        assert len(order) >= 12 and np.ptp(np.linalg.norm(xy, axis=1)) < .001
        return ids[order], angle[order]

    lo, lo_angle = ring(depth.min())
    hi, hi_angle = ring(depth.max())
    li = ri = 0
    triangles = []
    while li < len(lo) or ri < len(hi):
        left, right = lo[li % len(lo)], hi[ri % len(hi)]
        next_l = lo_angle[li + 1] if li + 1 < len(lo) else lo_angle[0] + 2 * np.pi if li < len(lo) else np.inf
        next_r = hi_angle[ri + 1] if ri + 1 < len(hi) else hi_angle[0] + 2 * np.pi if ri < len(hi) else np.inf
        if next_l <= next_r:
            triangles.append([left, lo[(li + 1) % len(lo)], right])
            li += 1
        else:
            triangles.append([left, hi[(ri + 1) % len(hi)], right])
            ri += 1
    # The visible normals point into the bore. The handedness depends on the plate axis.
    triangles = np.asarray(triangles, dtype=np.int32)
    a, b, c = (points[triangles[:, i]] for i in range(3))
    radial = (a[:, transverse] + b[:, transverse] + c[:, transverse]) / 3 - center
    flip = np.einsum('ij,ij->i', np.cross(b - a, c - a)[:, transverse], radial) > 0
    triangles[flip] = triangles[flip][:, [0, 2, 1]]
    return triangles


def tessellate(name, solids, directions):
    shape = solids[0] if len(solids) == 1 else Part.makeCompound(solids)
    faces = shape.Faces
    mesh = MeshPart.meshFromShape(Shape=shape, LinearDeflection=LINEAR_DEFLECTION,
                                  AngularDeflection=ANGULAR_DEFLECTION, Relative=False, Segments=True)
    vertices, facets = mesh.Topology
    points = np.asarray([vector(point) for point in vertices], dtype=float)
    triangles = np.asarray(facets, dtype=np.int32)
    assert mesh.countSegments() == len(faces), name
    segments = [triangles[mesh.getSegment(i)] for i in range(len(faces))]
    removed = set()
    bores = []
    if name in PLATE_THREADS:
        axis, expected = PLATE_THREADS[name]
        threads = inner_threads(faces, axis)
        assert len(threads) == expected, (name, len(threads))
        for center, ids in threads.items():
            # Keep the original two surfaces at each mouth, including both
            # rim chamfers, and use their shared vertices to close the bore.
            ordered = sorted(ids, key=lambda i: points[segments[i], axis].min())
            interior = ordered[2:-2]
            removed.update(interior)
            bores.append(tube_triangles(points, np.concatenate([segments[i] for i in interior]), axis, center))

    # Split topology by B-Rep face so shading can smooth the curves without
    # blending the normal across sharp plate and motor edges.
    patches = [segment for i, segment in enumerate(segments) if i not in removed and len(segment)] + bores
    positions, indices, vertex_count = [], [], 0
    for patch in patches:
        unique, local = np.unique(patch, return_inverse=True)
        positions.append(points[unique])
        indices.append(local.reshape(-1, 3) + vertex_count)
        vertex_count += len(unique)
    packed_points = np.concatenate(positions)
    source_extents = projected_extents(points, directions)
    rendered_extents = projected_extents(np.round(packed_points / POSITION_SCALE) * POSITION_SCALE, directions)
    difference = float(np.max(np.abs(np.subtract(source_extents, rendered_extents))))
    assert difference < .0045, (name, difference)
    return packed_points, np.concatenate(indices), len(bores), difference


def batches(entries):
    # Keep indices compact and use multiple draws only for unusually large groups.
    batch, count = [], 0
    for points, faces in entries:
        if count and count + len(points) > 65535:
            yield batch
            batch, count = [], 0
        batch.append((points, faces))
        count += len(points)
    if batch:
        yield batch


def encode(array):
    return base64.b64encode(array.tobytes()).decode('ascii')


def pack(group, category, entries):
    points = np.concatenate([p for p, _ in entries])
    origin = np.round((points.min(axis=0) + points.max(axis=0)) / (2 * POSITION_SCALE)) * POSITION_SCALE
    packed = np.rint((points - origin) / POSITION_SCALE)
    assert np.abs(packed).max() < 32767
    indices, count = [], 0
    for p, f in entries:
        indices.append(f + count)
        count += len(p)
    wide = count > 65535
    return dict(group=group, category=category, origin=origin.tolist(), wide=wide,
                positions=encode(packed.astype('<i2')),
                indices=encode(np.concatenate(indices).astype('<u4' if wide else '<u2')))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--step', type=Path, required=True)
    parser.add_argument('--motion-audit', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    motion = json.loads(args.motion_audit.read_text(encoding='utf-8'))['moving_groups']
    motion.pop('Sample_4x4_reference')
    named = named_step_solids(args.step, args.step.with_suffix('.FCStd'))
    assert len(motion) == 163 and set(named) - set(motion) == {n for n in named if n.startswith('Bump_')}
    assert sum(len(named[n]) for n in set(named) - set(motion)) == 2095
    print('2258 STEP solids matched to the assembly names', flush=True)

    directions = screen_directions()
    groups, report, triangle_count = defaultdict(list), {}, 0
    for name, group in motion.items():
        points, triangles, bores, difference = tessellate(name, named[name], directions)
        category = material(name)
        triangle_count += len(triangles)
        report[name] = dict(category=category, triangles=len(triangles), simplifiedInternalThreads=bores,
                            projectedExtentErrorMm=round(difference, 6))
        groups[group, category].append((points, triangles))
        if name in PLATE_THREADS:
            print(name, len(triangles), 'triangles,', bores, 'internal threads simplified', flush=True)
    meshes = [pack(group, category, batch) for (group, category), entries in groups.items() for batch in batches(entries)]
    data = dict(sourceStep=args.step.name, sourceSHA256=hashlib.sha256(args.step.read_bytes()).hexdigest(),
                groups=motion, parts=len(motion), triangles=triangle_count, positionScaleMm=POSITION_SCALE,
                linearDeflectionMm=LINEAR_DEFLECTION, angularDeflectionRad=ANGULAR_DEFLECTION,
                projectedExtentErrorMm=max(r['projectedExtentErrorMm'] for r in report.values()),
                internalThreadsSimplified=sum(r['simplifiedInternalThreads'] for r in report.values()),
                lens=[150, 229.75, 91.5], focus=[150, 218, 91.5], sampleMount=[142.39759, 217, 97.301205],
                palette=PALETTE, partAudit=report, meshes=meshes)
    args.out.write_text('globalThis.XZAssembly=' + json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';\n',
                        encoding='utf-8', newline='\n')
    print(f'{len(motion)} parts, {len(meshes)} batches, {triangle_count} triangles, {args.out.stat().st_size} bytes', flush=True)


if __name__ == '__main__':
    main()
