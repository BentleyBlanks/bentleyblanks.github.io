"""Rebind the HanYang-only hand surface from the frozen scanned source.

Run through the task-owned Blender lifecycle with FPS_PROJECT_ROOT set.
The original shared GLB stays byte-exact. This emits a separate HanYang rig
with the same nodes, bones, clothing, UVs and triangles. Only scanned skin
weights and a smooth terminal thumb profile are authored in the saved source.
"""
import bpy
import copy
import hashlib
import importlib.util
import json
import math
import re
from pathlib import Path
import numpy as np
from mathutils import Matrix, Quaternion, Vector

project = Path(FPS_PROJECT_ROOT).resolve()
task = 'FpsHandSurfaceRepair_20261017'
assert bpy.context.scene.get('BlenderMcpTask') == task
folder = Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938') / task
folder.mkdir(parents=True, exist_ok=True)
source_path = folder / 'Model_FpsHandSurfaceRepair.blend'
assert not bpy.data.filepath or Path(bpy.data.filepath).resolve() == source_path.resolve()
spec = importlib.util.spec_from_file_location('HandSurfaceCodec', project / '_blender/Script_FpsGripCorrectiveCodec.py')
codec = importlib.util.module_from_spec(spec)
spec.loader.exec_module(codec)
basis_path = project / 'Model/Model_FpsHanYangHands.glb'
doc, binary, original = codec.ReadGlb(basis_path)
assert hashlib.sha256(original).hexdigest() == 'dffb45e2edc89050feefed0a49230175eb17e42a96b46fcdfaff872187d01a38'
(folder / 'Model_FpsHandSurfaceBasis.glb').write_bytes(original)
before_doc = copy.deepcopy(doc)
before_binary = bytes(binary)
primitive = codec.SkinPrimitive(doc, binary)
attrs = primitive['attributes']
positions = attrs['POSITION'].astype(np.float64)
normals = attrs['NORMAL'].astype(np.float64)
indices = codec.Accessor(doc, binary, primitive['primitive']['indices']).astype(np.int64).ravel()
joints = attrs['JOINTS_0'].astype(np.int64)
weights = attrs['WEIGHTS_0'].astype(np.float64)
mesh_node = next(n for n in doc['nodes'] if n.get('mesh') == primitive['meshIndex'] and 'skin' in n)
skin = doc['skins'][mesh_node['skin']]
names = [doc['nodes'][j]['name'] for j in skin['joints']]
normalize = lambda s: re.sub('[^a-z0-9]', '', s.lower())
parent = {child: i for i, node in enumerate(doc['nodes']) for child in node.get('children', [])}
world = {}
def NodeWorld(index):
    if index in world:
        return world[index]
    node = doc['nodes'][index]
    if 'matrix' in node:
        local = Matrix([node['matrix'][i::4] for i in range(4)])
    else:
        p = Vector(node.get('translation', (0, 0, 0)))
        q = node.get('rotation', (0, 0, 0, 1))
        local = Matrix.LocRotScale(p, Quaternion((q[3], *q[:3])), Vector(node.get('scale', (1, 1, 1))))
    world[index] = NodeWorld(parent[index]) @ local if index in parent else local
    return world[index]
joint_world = [NodeWorld(i) for i in skin['joints']]
joint_points = np.asarray([list(m.translation) for m in joint_world])
mesh_world = NodeWorld(doc['nodes'].index(mesh_node))
inverse_binds = codec.Accessor(doc, binary, skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
rest_matrices = np.asarray([np.asarray(m, dtype=np.float64) for m in joint_world]) @ inverse_binds
# The retained FPS mesh node has a legacy object scale. Its actual skin bind
# space is J_rest * IBM, not the mesh-node matrix. Use the same LBS reference
# that the production renderer uses and prove it is one common rest frame.
mesh_matrix = rest_matrices.mean(axis=0)
rest_frame_error = float(np.abs(rest_matrices - mesh_matrix).max())
assert rest_frame_error < 2e-5, ('Inconsistent skin bind frame', rest_frame_error)
points = (mesh_matrix @ np.column_stack((positions, np.ones(len(positions)))).T).T[:, :3]
find = lambda suffix: next(i for i, name in enumerate(names) if normalize(name).endswith(suffix))
smooth = lambda x: np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))
metric = .7
new_joints, new_weights = joints.copy(), weights.copy()
new_positions = positions.copy()
changed_weights, thumb_changed, wrist_changed = [], [], []
regions = {}

for side in ['l', 'r']:
    hand_id, forearm_id = find(side + 'hand'), find(side + 'forearm')
    wrist, elbow = joint_points[hand_id], joint_points[forearm_id]
    forward = joint_points[find(side + 'finger2')] - wrist
    palm_length = np.linalg.norm(forward)
    forward /= palm_length
    across = joint_points[find(side + 'finger1')] - joint_points[find(side + 'finger4')]
    across -= forward * np.dot(across, forward)
    across /= np.linalg.norm(across)
    normal = np.cross(forward, across)
    def WristScale(s):
        knots = [-.060, -.040, -.020, 0., .015, .030]
        widths = [1., .97, .88, .78, .95, 1.]
        depths = [1., .94, .78, .73, .93, 1.]
        i = min(len(knots) - 2, max(0, int(np.searchsorted(knots, s)) - 1))
        t = float(smooth((s - knots[i]) / (knots[i+1] - knots[i])))
        return widths[i] * (1-t) + widths[i+1] * t, depths[i] * (1-t) + depths[i+1] * t
    roles = {}
    for i, name in enumerate(names):
        match = re.search(side + r'(hand|forearm|finger([0-4])[12]?)$', normalize(name))
        if match:
            roles[i] = ('finger', int(match[2])) if match[2] else (match[1], None)
    own = np.zeros(len(points)); digit_mass = np.zeros((len(points), 5))
    for slot in range(4):
        for ji, role in roles.items():
            mask = joints[:, slot] == ji
            own[mask] += weights[mask, slot]
            if role[0] == 'finger':
                digit_mass[mask, role[1]] += weights[mask, slot]
    curves = []
    for digit in range(5):
        ids = [find(side + 'finger' + str(digit) + s) for s in ['', '1', '2']]
        knots = joint_points[ids].copy()
        direction = knots[2] - knots[1]; direction /= np.linalg.norm(direction)
        distal = np.sum(np.where(joints == ids[2], weights, 0), axis=1)
        selected = (distal > .95) & (own > .99)
        length = np.percentile((points[selected] - knots[2]) @ direction, 99.5)
        length = max(length, .012 / metric)
        tip = knots[2] + direction * length
        knots = np.vstack((knots, tip))
        lengths = np.linalg.norm(np.diff(knots, axis=0), axis=1)
        curves.append((ids, knots, lengths))
    side_count = {'wristPalm': 0, 'fingers': [0] * 5}
    for vertex in np.flatnonzero(own > .95):
        p = points[vertex]
        axial = np.dot(p - wrist, forward)
        if np.linalg.norm(p - wrist) > (palm_length + .16 / metric):
            continue
        digit = int(np.argmax(digit_mass[vertex]))
        ids, knots, lengths = curves[digit]
        best = None
        cumulative = 0
        for segment in range(3):
            vector = knots[segment + 1] - knots[segment]
            t = np.dot(p - knots[segment], vector) / np.dot(vector, vector)
            clamped = min(1, max(0, t))
            distance = np.linalg.norm(p - (knots[segment] + vector * clamped))
            row = (distance, cumulative + t * lengths[segment], segment)
            if best is None or distance < best[0]:
                best = row
            cumulative += lengths[segment]
        along = best[1]
        if np.linalg.norm(p - wrist) >= .090 / metric and axial <= -.040 / metric:
            continue
        # Preserve the scan's continuous branch ownership. A hard "finger or
        # palm" label makes adjacent web vertices follow different bones and
        # creates the pointed thumb-root tents visible in the first preview.
        # Rebuild each hinge field, then combine it using the original branch
        # masses. The proximal wrist gate removes stray finger influence
        # without a discontinuity at the palm or thumb web.
        wrist_blend = float(smooth((axial + .022 / metric) / (.036 / metric)))
        digit_gate = float(smooth((axial + .015 / metric) / (.040 / metric)))
        masses = digit_mass[vertex] * digit_gate
        remaining = max(0., 1. - float(masses.sum()))
        result = {forearm_id: remaining * (1 - wrist_blend), hand_id: remaining * wrist_blend}
        for d in range(5):
            mass = float(masses[d])
            if mass < 1e-8:
                continue
            chain, curve, chain_lengths = curves[d]
            best_curve = None
            cumulative = 0.
            for segment in range(3):
                vector = curve[segment + 1] - curve[segment]
                t = np.dot(p - curve[segment], vector) / np.dot(vector, vector)
                distance = np.linalg.norm(p - (curve[segment] + vector * min(1, max(0, t))))
                if best_curve is None or distance < best_curve[0]:
                    best_curve = (distance, cumulative + t * chain_lengths[segment])
                cumulative += chain_lengths[segment]
            along_curve = best_curve[1]
            l0, l1, l2 = chain_lengths
            root_blend = float(smooth((along_curve + .010 / metric) / (.022 / metric)))
            pip_blend = float(smooth((along_curve - l0 + .006 / metric) / (.012 / metric)))
            dip_blend = float(smooth((along_curve - l0 - l1 + .005 / metric) / (.010 / metric)))
            field = {hand_id: 1 - root_blend, chain[0]: root_blend * (1 - pip_blend), chain[1]: root_blend * pip_blend * (1 - dip_blend), chain[2]: root_blend * pip_blend * dip_blend}
            for ji, value in field.items():
                result[ji] = result.get(ji, 0.) + mass * value
        finger = digit_mass[vertex, digit] > .55
        side_count['fingers'][digit] += int(finger)
        side_count['wristPalm'] += int(not finger)
        ordered = sorted(((j, w) for j, w in result.items() if w > 1e-8), key=lambda item: item[1], reverse=True)
        nw = np.zeros(4, dtype=np.float32); nj = np.zeros(4, dtype=np.int64)
        for slot, (ji, weight) in enumerate(ordered[:4]):
            nj[slot], nw[slot] = ji, weight
        nw /= nw.sum(dtype=np.float32)
        new_joints[vertex] = nj; new_weights[vertex] = nw
        if not np.array_equal(nj, joints[vertex]) or np.max(np.abs(nw - weights[vertex])) > 1e-8:
            changed_weights.append(int(vertex))
        # The registered scan has a 75 x 52 mm wrist cross-section at the
        # hand joint. Fair it into a 59 x 38 mm ellipse with a broad, C1
        # transition to the untouched forearm and palm. This repairs the
        # underside wrist bulge in the user's side view rather than hiding
        # it under the cuff or changing the arm skeleton.
        physical_axial = axial * metric
        if -.060 < physical_axial < .030 and np.linalg.norm(p - wrist) < .095 / metric:
            influence = 1 - float(smooth(float(digit_mass[vertex].sum()) / .4))
            width_scale, depth_scale = WristScale(physical_axial)
            relative = p - wrist
            width_center = .002 / metric
            depth_center = (-.004 if side == 'l' else .004) / metric
            moved = influence * (across * (np.dot(relative, across) - width_center) * (width_scale - 1) + normal * (np.dot(relative, normal) - depth_center) * (depth_scale - 1))
            if np.linalg.norm(moved) > 1e-9:
                new_positions[vertex] = (np.linalg.inv(mesh_matrix) @ np.r_[p + moved, 1])[:3]
                wrist_changed.append(int(vertex))
        if finger and digit == 0:
            start = knots[2]
            axis = knots[3] - start; length = np.linalg.norm(axis); axis /= length
            s = np.dot(p - start, axis)
            if s > 0:
                target_length = .0218 / metric
                shrink = max(0, length - target_length)
                fraction = min(1, max(0, s / length))
                radial = p - (start + axis * s)
                taper = .09 * float(smooth((fraction - .3) / .7))
                moved = -axis * shrink * float(smooth(fraction)) - radial * taper
                q = p + moved
                new_positions[vertex] = (np.linalg.inv(mesh_matrix) @ np.r_[q, 1])[:3]
                if np.linalg.norm(moved) > 1e-9:
                    thumb_changed.append(int(vertex))
    regions[side] = side_count

# A small welded one-ring filter removes scan-weight noise while keeping the
# original ownership transition. UV seam duplicates share one weight vector.
dense = np.zeros((len(points), len(names)), dtype=np.float64)
for slot in range(4):
    np.add.at(dense, (np.arange(len(points)), new_joints[:, slot]), new_weights[:, slot])
weld_keys, weld_inverse = np.unique(np.round(points / 1e-6).astype(np.int64), axis=0, return_inverse=True)
weld_count = np.bincount(weld_inverse)
welded = np.zeros((len(weld_keys), len(names)))
np.add.at(welded, weld_inverse, dense)
welded /= weld_count[:, None]
edges = set()
for tri in indices.reshape(-1, 3):
    for a, b in [(tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])]:
        a, b = int(weld_inverse[a]), int(weld_inverse[b])
        if a != b:
            edges.add((min(a, b), max(a, b)))
edge = np.asarray(sorted(edges), dtype=np.int64)
eligible = np.zeros(len(weld_keys), dtype=bool)
eligible[weld_inverse[changed_weights]] = True
degree = np.bincount(edge.ravel(), minlength=len(weld_keys))
for iteration in range(3):
    total = np.zeros_like(welded)
    np.add.at(total, edge[:, 0], welded[edge[:, 1]])
    np.add.at(total, edge[:, 1], welded[edge[:, 0]])
    neighbor = total / np.maximum(1, degree)[:, None]
    welded[eligible] = .8 * welded[eligible] + .2 * neighbor[eligible]
for vertex in changed_weights:
    row = welded[weld_inverse[vertex]]
    top = np.argsort(row)[-4:][::-1]
    value = row[top].astype(np.float32)
    value /= value.sum(dtype=np.float32)
    new_joints[vertex], new_weights[vertex] = top, value

# Area-weighted geometric normal changes preserve the scan's original smoothing.
def GeometryNormals(p):
    n = np.zeros_like(p)
    for a, b, c in indices.reshape(-1, 3):
        value = np.cross(p[b] - p[a], p[c] - p[a])
        n[a] += value; n[b] += value; n[c] += value
    cells = {}
    for i, point in enumerate(positions):
        cells.setdefault(tuple(np.round(point / 1e-6).astype(int)), []).append(i)
    for ids in cells.values():
        value = n[ids].sum(0)
        n[ids] = value
    n /= np.maximum(1e-20, np.linalg.norm(n, axis=1))[:, None]
    return n
g0, g1 = GeometryNormals(positions), GeometryNormals(new_positions)
new_normals = normals.copy()
normal_changed = np.linalg.norm(g1 - g0, axis=1) > 1e-10
new_normals[normal_changed] += (g1 - g0)[normal_changed]
new_normals[normal_changed] /= np.maximum(1e-20, np.linalg.norm(new_normals[normal_changed], axis=1))[:, None]
tangents = attrs.get('TANGENT')
new_tangents = tangents.copy() if tangents is not None else None
if tangents is not None:
    t = tangents[:, :3] - new_normals * np.sum(tangents[:, :3] * new_normals, axis=1)[:, None]
    new_tangents[normal_changed, :3] = (t / np.maximum(1e-20, np.linalg.norm(t, axis=1))[:, None])[normal_changed]

# Save an editable source made from the real imported rig, not an image proxy.
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(folder / 'Model_FpsHandSurfaceBasis.glb'))
source_mesh = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and any(m and m.name.startswith('Material_HanYangScanSkin') for m in o.data.materials))
rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
data = bpy.data.meshes.new('Mesh_FpsHanYangHandSurfaceRepair')
data.from_pydata(new_positions.tolist(), [], indices.reshape(-1, 3).tolist()); data.update()
candidate = bpy.data.objects.new('Mesh_FpsHanYangHandSurfaceRepair', data); bpy.context.scene.collection.objects.link(candidate)
candidate.matrix_world = Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix(mesh_matrix.tolist())
data.materials.append(source_mesh.data.materials[0])
uv = data.uv_layers.new(name='UVMap')
for polygon in data.polygons:
    polygon.use_smooth = True
    for loop in polygon.loop_indices:
        uv.data[loop].uv = attrs['TEXCOORD_0'][data.loops[loop].vertex_index]
for name in names:
    candidate.vertex_groups.new(name=name)
for vertex in range(len(new_positions)):
    for slot in range(4):
        weight = float(new_weights[vertex, slot])
        if weight > 0:
            candidate.vertex_groups[int(new_joints[vertex, slot])].add([vertex], weight, 'REPLACE')
modifier = candidate.modifiers.new('Armature_ReviewedHandSurface', 'ARMATURE'); modifier.object = rig
candidate['nativeVertexOrder'] = 'Exact GLB skin accessor and index order'
candidate['basisSha256'] = hashlib.sha256(original).hexdigest()
candidate['recipe'] = 'Geometric same-finger hinge fields, no foreign digit ownership at wrist; smooth thumb terminal profile'
source_mesh.hide_set(True); source_mesh.hide_render = True
bpy.context.scene['BlenderMcpTask'] = task
bpy.context.scene['handSurfaceRecipe'] = json.dumps(regions, separators=(',', ':'))
assert len(set(changed_weights)) > 5000, 'A surface repair must actually update hand weights'
assert len(set(thumb_changed)) > 100, 'The thumb profile must actually be authored'
bpy.ops.wm.save_as_mainfile(filepath=str(source_path))

def Store(semantic, values):
    index = primitive['primitive']['attributes'][semantic]
    a = doc['accessors'][index]; view = doc['bufferViews'][a['bufferView']]
    dtype = {5121: 'u1', 5123: '<u2', 5126: '<f4'}[a['componentType']]
    width = values.shape[1]; begin = view.get('byteOffset', 0) + a.get('byteOffset', 0)
    target = np.ndarray(values.shape, dtype=dtype, buffer=binary, offset=begin, strides=(view.get('byteStride', np.dtype(dtype).itemsize * width), np.dtype(dtype).itemsize))
    target[:] = values
    if semantic == 'POSITION':
        a['min'], a['max'] = target.min(0).tolist(), target.max(0).tolist()
Store('POSITION', new_positions)
Store('NORMAL', new_normals)
Store('JOINTS_0', new_joints)
Store('WEIGHTS_0', new_weights)
if new_tangents is not None:
    Store('TANGENT', new_tangents)
assert np.isfinite(new_positions).all() and np.isfinite(new_weights).all()
assert np.max(np.abs(new_weights.sum(1) - 1)) < 2e-6
for key in ['skins', 'nodes', 'materials', 'textures', 'images', 'animations', 'samplers']:
    assert doc.get(key) == before_doc.get(key), key + ' is protected'
assert doc['meshes'] == before_doc['meshes'], 'Topology, UV/morph pointers and clothing descriptors stay exact'
doc['asset'].setdefault('extras', {})['handSurfaceRepair'] = {
    'version': 1, 'weapon': 'HanYang', 'source': '_blender/Script_FpsHandSurfaceBake.py',
    'basisSha256': hashlib.sha256(original).hexdigest(), 'thumbTerminalLengthM': .0218,
    'binding': 'Continuous scan branch ownership, same-digit hinge fields, welded one-ring smoothing',
    'wristProfile': 'Smooth 59 x 38 mm wrist transition; skeleton and cuff unchanged',
}
output = project / 'Model/Model_FpsHanYangHandsRepaired.glb'
codec.WriteGlb(output, doc, binary)
raw = output.read_bytes()
report = {'version': 1, 'source': str(source_path), 'basisSha256': hashlib.sha256(original).hexdigest(), 'output': str(output), 'outputSha256': hashlib.sha256(raw).hexdigest(), 'vertices': len(positions), 'changedWeightVertices': len(set(changed_weights)), 'thumbProfileVertices': len(set(thumb_changed)), 'wristProfileVertices': len(set(wrist_changed)), 'regions': regions, 'skinBindFrameMaximumError': rest_frame_error, 'protectedSkeletonClothingMaterialsAndTopology': True, 'maximumBindDisplacementM': float(np.linalg.norm(new_positions - positions, axis=1).max())}
(folder / 'Data_HandSurfaceBake.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
(project / 'Model/Data_FpsHanYangHandRepair.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
