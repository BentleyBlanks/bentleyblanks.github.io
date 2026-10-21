"""Taper the first-person forearm skin into the scanned wrist, without re-exporting.

The scanned HanYang hand was grafted onto the NRA forearm: on the dorsal/radial
side the forearm stays ~50-56 mm from the bone axis until 2 cm before the wrist,
then drops to the 27 mm hand back over two rings of 35-60 degree edges. In a
side view that reads as a hard vertical ridge. This layer moves only those skin
vertices radially inward, between a start station inside the sleeve and the
gap before the first hand ring, so the profile becomes one C1 taper.

Usable from CPython or Blender's Python. Every byte except the POSITION, NORMAL
and TANGENT components of the listed skin vertices stays identical (JSON chunk,
UVs, joints, weights, indices, sleeve, nails, morphs, images). The recipe keeps
per-vertex before/after values, so --undo (and Script_FpsForearmTaperTest.mjs)
restore the previous assets byte for byte.

Bake (writes both GLBs and Model/Data_FpsForearmTaper.json):
  node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_blender/Script_FpsForearmTaperBake.py --batch-args <args.json>
  python Taierzhuang1938/_blender/Script_FpsForearmTaperBake.py -- --project Taierzhuang1938 --bake
Undo (writes the pre-taper bytes next to the given output folder):
  python Taierzhuang1938/_blender/Script_FpsForearmTaperBake.py -- --project Taierzhuang1938 --undo --output <dir>
"""
import argparse
import base64
import hashlib
import json
import struct
import subprocess
import sys
from pathlib import Path

import numpy as np

RECIPE = 'Model/Data_FpsForearmTaper.json'
SKIN_MATERIAL = 'Material_HanYangScanSkin'
# Previous reviewed outputs: the weight-repaired production hands and the v8 HanYang repair.
ASSETS = (
    {'asset': 'Model/Model_FpsHanYangHands.glb',
     'before': 'dffb45e2edc89050feefed0a49230175eb17e42a96b46fcdfaff872187d01a38',
     'chain': {'manifest': 'Model/Data_FpsGripCorrectives.json', 'layer': 'forearmTaper'}},
    {'asset': 'Model/Model_FpsHanYangHandsRepaired.glb',
     'before': 'a58235a4d5003fe0124f200385794db519e604eb4a21604f4863cd1858eba41f',
     'chain': {'manifest': 'Model/Data_FpsHanYangHandRepair.json', 'field': 'outputSha256'}},
)
PARAMETERS = {
    'startMm': -80.0,             # taper start on the tilted wrist axis; the cuff edge is at -68..-77 mm
    'endPlaneSearch': {'tiltRange': 0.2, 'tiltSteps': 81, 'windowMm': [-4.0, 8.0], 'nearAlongMm': 12.0},
    'startFit': {'halfWidthMm': 12.0, 'thetaSigmaDeg': 8.0},
    'endFit': {'widthMm': 12.0, 'thetaSigmaDeg': 4.0},
    'overhang': {'alongMm': [-35.0, -11.0], 'stepMm': 2.0, 'thetaSigmaDeg': 6.0, 'alongSigmaMm': 3.0,
                 'fullWeightMm': 6.0, 'thetaSmoothDeg': 15.0},
    'localRadius': {'alongSigmaMm': [8.0, 1.5], 'thetaSigmaDeg': [10.0, 5.0], 'rampMm': [-30.0, -18.0]},
    'smoothMinMm': 3.0,
    'startMarginMm': 3.0, 'startMarginFraction': 0.5,
    'poolRadiusMm': 90.0, 'poolMarginMm': 30.0, 'minimumArmWeight': 0.5,
}


def Sha(data):
    return hashlib.sha256(data).hexdigest()


def SplitGlb(raw):
    assert len(raw) >= 28 and struct.unpack_from('<III', raw) == (0x46546C67, 2, len(raw))
    length, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4E4F534A
    binLength, binKind = struct.unpack_from('<II', raw, 20 + length)
    assert binKind == 0x004E4942 and 28 + length + binLength == len(raw)
    return json.loads(raw[20:20 + length]), 28 + length


def Normalize(name):
    return ''.join(c for c in name.lower() if c.isalnum())


class Glb:
    def __init__(self, raw):
        self.raw = bytes(raw)
        self.doc, self.base = SplitGlb(self.raw)
        matches = [(mi, pi) for mi, mesh in enumerate(self.doc['meshes']) for pi, p in enumerate(mesh['primitives'])
                   if self.doc['materials'][p['material']]['name'] == SKIN_MATERIAL]
        assert len(matches) == 1, matches
        self.meshIndex, self.primitiveIndex = matches[0]
        self.primitive = self.doc['meshes'][self.meshIndex]['primitives'][self.primitiveIndex]
        node = next(n for n in self.doc['nodes'] if n.get('mesh') == self.meshIndex and 'skin' in n)
        self.skin = self.doc['skins'][node['skin']]
        self.names = [Normalize(self.doc['nodes'][j]['name']) for j in self.skin['joints']]

    def Slot(self, index):
        a = self.doc['accessors'][index]
        width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
        size = {5121: 1, 5123: 2, 5125: 4, 5126: 4}[a['componentType']]
        view = self.doc['bufferViews'][a['bufferView']]
        assert view.get('buffer', 0) == 0 and 'sparse' not in a and not a.get('normalized')
        return {'accessor': a, 'width': width, 'size': size, 'stride': view.get('byteStride', width * size),
                'start': self.base + view.get('byteOffset', 0) + a.get('byteOffset', 0)}

    def Read(self, index, raw=None):
        slot = self.Slot(index)
        dtype = {5121: 'u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}[slot['accessor']['componentType']]
        return np.ndarray((slot['accessor']['count'], slot['width']), dtype=dtype, buffer=raw if raw is not None else self.raw,
                          offset=slot['start'], strides=(slot['stride'], slot['size'])).copy()

    def Attribute(self, semantic):
        return self.Read(self.primitive['attributes'][semantic])

    def Bone(self, suffix):
        found = [i for i, n in enumerate(self.names) if n.endswith(suffix)]
        assert len(found) == 1, (suffix, found)
        return found[0]


def AngleNormals(points, triangles, weld):
    """Corner-angle weighted, position-welded vertex normals: the original scan export convention."""
    a, b, c = (points[triangles[:, i]] for i in range(3))
    face = np.cross(b - a, c - a)
    face /= np.maximum(np.linalg.norm(face, axis=1), 1e-30)[:, None]
    sums = np.zeros((weld.max() + 1, 3))
    for corner, (p, q, r) in enumerate(((a, b, c), (b, c, a), (c, a, b))):
        e1, e2 = q - p, r - p
        cosine = np.einsum('ij,ij->i', e1, e2) / np.maximum(np.linalg.norm(e1, axis=1) * np.linalg.norm(e2, axis=1), 1e-30)
        np.add.at(sums, weld[triangles[:, corner]], face * np.arccos(np.clip(cosine, -1, 1))[:, None])
    normals = sums[weld]
    return normals / np.maximum(np.linalg.norm(normals, axis=1), 1e-30)[:, None]


def Rotate(vectors, n0, n1):
    """Minimal rotation of each tangent by the rotation that carries its old normal onto its new one."""
    axis = np.cross(n0, n1)
    s = np.linalg.norm(axis, axis=1)
    c = np.einsum('ij,ij->i', n0, n1)
    k = axis / np.maximum(s, 1e-300)[:, None]
    kv = np.einsum('ij,ij->i', k, vectors)
    rotated = vectors * c[:, None] + np.cross(k, vectors) * s[:, None] + k * (kv * (1 - c))[:, None]
    return np.where((s > 1e-15)[:, None], rotated, vectors)


def Gauss(x, sigma):
    return np.exp(-0.5 * (x / sigma) ** 2)


def Wrap(degrees):
    return (degrees + 180.0) % 360.0 - 180.0


def Smoothstep(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def TaperPositions(glb):
    prm = PARAMETERS
    P32 = glb.Attribute('POSITION')
    P = P32.astype(np.float64)
    J = glb.Attribute('JOINTS_0').astype(int)
    W = glb.Attribute('WEIGHTS_0').astype(np.float64)
    bind = np.linalg.inv(glb.Read(glb.skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64))
    new = P.copy()
    sides = {}
    a0 = prm['startMm'] / 1000
    for side, sign in (('l', 1.0), ('r', -1.0)):
        forearm, hand = glb.Bone(side + 'forearm'), glb.Bone(side + 'hand')
        wrist, elbow = bind[hand][:3, 3], bind[forearm][:3, 3]
        axis = (wrist - elbow) / np.linalg.norm(wrist - elbow)
        # Angle 0 points from the axis toward the thumb root; the right side is mirrored so both use the same angles.
        u = bind[glb.Bone(side + 'finger0')][:3, 3] - wrist
        u -= axis * (u @ axis)
        u /= np.linalg.norm(u)
        v = sign * np.cross(axis, u)
        d = P - wrist
        along = d @ axis
        radial = d - along[:, None] * axis
        r = np.linalg.norm(radial, axis=1)
        theta = np.degrees(np.arctan2(radial @ v, radial @ u))
        xu, xv = radial @ u, radial @ v
        armWeight = sum(np.where(np.isin(J[:, k], [forearm, hand]), W[:, k], 0) for k in range(4))
        arm = (armWeight > prm['minimumArmWeight']) & (r < prm['poolRadiusMm'] / 1000) & (np.sign(P[:, 0]) == sign)
        # The scan wrist rings are tilted. Find the plane through the widest empty band between the last
        # wrist ring and the first hand ring; nothing on the hand side of it is touched.
        search = prm['endPlaneSearch']
        near = arm & (np.abs(along) < search['nearAlongMm'] / 1000)
        lo, hi = (x / 1000 for x in search['windowMm'])
        best = None
        tilts = np.linspace(-search['tiltRange'], search['tiltRange'], search['tiltSteps'])
        for alpha in tilts:
            for beta in tilts:
                s = np.sort(along[near] - alpha * xu[near] - beta * xv[near])
                gaps = np.diff(s)
                ids = np.flatnonzero((s[:-1] > lo) & (s[1:] < hi))
                if not len(ids):
                    continue
                j = ids[np.argmax(gaps[ids])]
                if best is None or gaps[j] > best[0]:
                    best = (gaps[j], alpha, beta, (s[j] + s[j + 1]) / 2)
        gap, alpha, beta, c = best
        tilted = along - alpha * xu - beta * xv - c
        pool = arm & (tilted > a0 - prm['poolMarginMm'] / 1000) & (tilted < prm['poolMarginMm'] / 1000)
        pr, pa, pt = r[pool], tilted[pool], theta[pool]

        def Fit(angle, low, high, sigma):
            s = (pa >= low) & (pa <= high)
            k = Gauss(Wrap(pt[s] - angle), sigma)
            X = np.c_[np.ones(s.sum()), pa[s]]
            return np.linalg.solve(X.T @ (X * k[:, None]), X.T @ (k * pr[s]))

        thetas = np.arange(-180.0, 180.0, 1.0)
        start, end, over = prm['startFit'], prm['endFit'], prm['overhang']
        R0 = np.array([(lambda q: q[0] + q[1] * a0)(Fit(t, a0 - start['halfWidthMm'] / 1000, a0 + start['halfWidthMm'] / 1000, start['thetaSigmaDeg'])) for t in thetas])
        endFit = np.array([Fit(t, 0.0, end['widthMm'] / 1000, end['thetaSigmaDeg']) for t in thetas])
        R1, S1 = endFit[:, 0], endFit[:, 1]
        stations = np.arange(over['alongMm'][0], over['alongMm'][1], over['stepMm']) / 1000
        top = np.empty(len(thetas))
        for i, t in enumerate(thetas):
            kt = Gauss(Wrap(pt - t), over['thetaSigmaDeg'])
            top[i] = max((kt * Gauss(pa - x, over['alongSigmaMm'] / 1000) * pr).sum() / (kt * Gauss(pa - x, over['alongSigmaMm'] / 1000)).sum() for x in stations)
        weight = Smoothstep((top - R1) / (over['fullWeightMm'] / 1000))
        kernel = Gauss(Wrap(thetas[:, None] - thetas[None, :]), over['thetaSmoothDeg'])
        weight = (kernel @ weight) / kernel.sum(1)

        zone = np.flatnonzero(arm & (tilted > a0) & (tilted < 0))
        Interp = lambda values: np.interp(theta[zone], thetas, values, period=360)
        w, r0, r1, s1 = Interp(weight), Interp(R0), Interp(R1), Interp(S1)
        length = -a0
        t = (tilted[zone] - a0) / length
        drop = r1 - r0
        s1 = np.where(drop < 0, np.clip(s1, 3 * drop / length, 0), np.clip(s1, 0, 3 * drop / length))  # monotone Hermite
        target = (2 * t ** 3 - 3 * t ** 2 + 1) * r0 + (-2 * t ** 3 + 3 * t ** 2) * r1 + (t ** 3 - t ** 2) * length * s1
        target += prm['startMarginMm'] / 1000 * (1 - Smoothstep(t / prm['startMarginFraction']))
        # Smooth local radius: wide on the sparse NRA forearm, ring-sized on the dense scan wrist rings.
        local = prm['localRadius']
        ramp = [x / 1000 for x in local['rampMm']]
        sa = np.interp(tilted[zone], ramp, [x / 1000 for x in local['alongSigmaMm']])
        st = np.interp(tilted[zone], ramp, local['thetaSigmaDeg'])
        L = np.empty(len(zone))
        for j, i in enumerate(zone):
            k = Gauss(Wrap(pt - theta[i]), st[j]) * Gauss(pa - tilted[i], sa[j])
            L[j] = (k * pr).sum() / k.sum()
        width = prm['smoothMinMm'] / 1000
        h = np.clip(0.5 + 0.5 * (target - L) / width, 0, 1)
        softMin = target + (L - target) * h - width * h * (1 - h)
        rNew = np.minimum(r[zone], r[zone] + w * np.minimum(softMin - L, 0))
        new[zone] = wrist + along[zone, None] * axis + radial[zone] * (rNew / r[zone])[:, None]
        inward = r[zone] - rNew
        sides[side] = {
            'frame': {k: [round(float(x), 9) for x in vec] for k, vec in (('wrist', wrist), ('axis', axis), ('thumbSide', u), ('quarterTurn', v))},
            'endPlane': {'alongOffsetMm': round(1000 * c, 4), 'tiltThumbSide': round(float(alpha), 4),
                         'tiltQuarterTurn': round(float(beta), 4), 'emptyBandMm': round(1000 * gap, 3)},
            'zoneVertices': int(len(zone)), 'maxInwardMm': round(float(1000 * inward.max()), 3),
            'weightSamples': {str(int(a)): round(float(x), 3) for a, x in zip(thetas[::15], weight[::15])},
        }
    return P32, new.astype('<f4'), sides


def Bake(project, sources):
    reference = Glb(sources[0])
    triangles = reference.Read(reference.primitive['indices']).astype(np.int64).reshape(-1, 3)
    P32, A32, sides = TaperPositions(reference)
    moved = np.flatnonzero(np.any(P32 != A32, axis=1))
    key = np.round(P32.astype(np.float64) / 1e-6).astype(np.int64)
    _, weld = np.unique(key, axis=0, return_inverse=True)
    weld = weld.ravel()
    for group in np.unique(weld[moved]):
        ids = np.flatnonzero(weld == group)
        assert np.all(A32[ids] == A32[ids[0]]), 'welded UV-seam copies move together'
    g0 = AngleNormals(P32.astype(np.float64), triangles, weld)
    g1 = AngleNormals(A32.astype(np.float64), triangles, weld)
    normalChanged = np.any(g0 != g1, axis=1)
    candidates = np.flatnonzero(normalChanged | np.any(P32 != A32, axis=1))
    outputs, perAsset = [], []
    for spec, raw in zip(ASSETS, sources):
        glb = Glb(raw)
        assert glb.meshIndex == reference.meshIndex and glb.primitiveIndex == reference.primitiveIndex
        assert np.array_equal(glb.Attribute('POSITION')[candidates], P32[candidates]), 'both assets share the forearm/wrist geometry'
        N = glb.Attribute('NORMAL').astype(np.float64)
        T = glb.Attribute('TANGENT').astype(np.float64)
        N1 = N.copy()
        N1[candidates] += (g1 - g0)[candidates]
        N1[candidates] /= np.linalg.norm(N1[candidates], axis=1)[:, None]
        n0 = N[candidates] / np.linalg.norm(N[candidates], axis=1)[:, None]
        T1 = T.copy()
        T1[candidates, :3] = Rotate(T[candidates, :3], n0, N1[candidates])
        perAsset.append((glb, N1.astype('<f4'), T1.astype('<f4')))
        # Morph targets are relative to Basis; none of them may move a tapered vertex.
        for target in glb.primitive.get('targets', []):
            assert not np.any(glb.Read(target['POSITION'])[moved]), 'grip correctives never displace forearm skin'
    changed = np.zeros(len(P32), bool)
    changed[candidates] = np.any(P32[candidates] != A32[candidates], axis=1)
    for glb, N1, T1 in perAsset:
        changed[candidates] |= np.any(glb.Attribute('NORMAL')[candidates] != N1[candidates], axis=1)
        changed[candidates] |= np.any(glb.Attribute('TANGENT')[candidates] != T1[candidates], axis=1)
    vertices = np.flatnonzero(changed)
    B64 = lambda array: base64.b64encode(np.ascontiguousarray(array, dtype='<f4').tobytes()).decode()
    assetRows = []
    for spec, (glb, N1, T1) in zip(ASSETS, perAsset):
        out = bytearray(glb.raw)
        for semantic, values in (('POSITION', A32), ('NORMAL', N1), ('TANGENT', T1)):
            slot = glb.Slot(glb.primitive['attributes'][semantic])
            assert slot['accessor']['componentType'] == 5126
            for vertex in vertices:
                begin = slot['start'] + int(vertex) * slot['stride']
                out[begin:begin + 4 * slot['width']] = values[vertex].astype('<f4').tobytes()
        out = bytes(out)
        accessor = glb.doc['accessors'][glb.primitive['attributes']['POSITION']]
        after = Glb(out).Attribute('POSITION')
        assert np.allclose(after.min(0), accessor['min'], atol=0, rtol=0) and np.allclose(after.max(0), accessor['max'], atol=0, rtol=0), 'POSITION bounds unchanged'
        assert out[:glb.base] == glb.raw[:glb.base], 'JSON chunk unchanged'
        outputs.append(out)
        assetRows.append({
            'asset': spec['asset'], 'chain': spec['chain'],
            'before': {'sha256': Sha(glb.raw), 'binarySha256': Sha(glb.raw[glb.base:])},
            'after': {'sha256': Sha(out), 'binarySha256': Sha(out[glb.base:])},
            'normalBefore': B64(glb.Attribute('NORMAL')[vertices]), 'normalAfter': B64(N1[vertices]),
            'tangentBefore': B64(glb.Attribute('TANGENT')[vertices]), 'tangentAfter': B64(T1[vertices]),
        })
    recipe = {
        'version': 1,
        'baker': '_blender/Script_FpsForearmTaperBake.py',
        'test': 'Script_FpsForearmTaperTest.mjs',
        'method': ('Radial-only inward taper of the dorsal/radial forearm skin between a start station inside the sleeve '
                   'and the empty band before the first scanned hand ring. Target profile per angle around the '
                   'forearm-to-hand bone axis: monotone cubic Hermite from the forearm radius (zero slope) to the hand '
                   'ring radius and slope; applied as a smooth-min displacement of the local smooth radius, weighted '
                   'by how far the forearm overhangs the hand at that angle. Normals: corner-angle weighted, '
                   'UV-seam-welded geometric normal change added to the stored normal. Tangents: rotated with their '
                   'normal (each asset keeps its own tangent convention; w unchanged).'),
        'mesh': {'material': SKIN_MATERIAL, 'meshIndex': reference.meshIndex, 'primitiveIndex': reference.primitiveIndex,
                 'vertexCount': int(len(P32)), 'triangleCount': int(len(triangles))},
        'unchanged': 'JSON chunk, UVs, joints, weights, indices, sleeve, nails, morph targets, images and every other vertex',
        'parameters': PARAMETERS,
        'sides': sides,
        'counts': {'vertices': int(len(vertices)), 'moved': int(len(moved)), 'normalOnly': int(len(vertices) - len(moved))},
        'encoding': 'Rows follow `vertices`; base64 of little-endian float32 (POSITION/NORMAL VEC3, TANGENT VEC4)',
        'vertices': [int(v) for v in vertices],
        'positionBefore': B64(P32[vertices]), 'positionAfter': B64(A32[vertices]),
        'assets': assetRows,
        'runtime': {'numpy': np.__version__, 'python': sys.version.split()[0]},
    }
    return recipe, outputs, {'P': P32, 'A': A32, 'triangles': triangles, 'weld': weld, 'g0': g0, 'g1': g1, 'vertices': vertices}


def Undo(raw, recipe, spec):
    row = next(r for r in recipe['assets'] if r['asset'] == spec['asset'])
    assert Sha(raw) == row['after']['sha256'], 'exact reviewed tapered asset'
    glb = Glb(raw)
    out = bytearray(raw)
    vertices = np.asarray(recipe['vertices'], dtype=np.int64)
    Values = lambda text, width: np.frombuffer(base64.b64decode(text), dtype='<f4').reshape(-1, width)
    for semantic, before, after, width in (('POSITION', recipe['positionBefore'], recipe['positionAfter'], 3),
                                           ('NORMAL', row['normalBefore'], row['normalAfter'], 3),
                                           ('TANGENT', row['tangentBefore'], row['tangentAfter'], 4)):
        slot = glb.Slot(glb.primitive['attributes'][semantic])
        b, a = Values(before, width), Values(after, width)
        for i, vertex in enumerate(vertices):
            begin = slot['start'] + int(vertex) * slot['stride']
            assert bytes(out[begin:begin + 4 * width]) == a[i].tobytes(), (semantic, int(vertex))
            out[begin:begin + 4 * width] = b[i].tobytes()
    out = bytes(out)
    assert Sha(out) == row['before']['sha256'], 'undo restores every previous byte'
    return out


def Source(project, spec):
    raw = (project / spec['asset']).read_bytes()
    if Sha(raw) == spec['before']:
        return raw
    recipePath = project / RECIPE
    if recipePath.exists():
        recipe = json.loads(recipePath.read_text(encoding='utf-8'))
        row = next((r for r in recipe['assets'] if r['asset'] == spec['asset']), None)
        if row and Sha(raw) == row['after']['sha256']:
            return Undo(raw, recipe, spec)
    raise SystemExit(f'{spec["asset"]}: neither the reviewed pre-taper asset nor the reviewed tapered asset')


def ReviewBlend(path, data):
    """Inside Blender: save before/after skin meshes and cross-check normals with Blender's own vertex normals."""
    import bpy
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    weld, triangles = data['weld'], data['triangles']
    report = {}
    for name, points, ours in (('Skin_BeforeTaper', data['P'], data['g0']), ('Skin_AfterTaper', data['A'], data['g1'])):
        welded = np.zeros((weld.max() + 1, 3))
        welded[weld] = points
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(welded.tolist(), [], weld[triangles].tolist())
        mesh.update()
        for polygon in mesh.polygons:
            polygon.use_smooth = True
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        if 'After' in name:
            obj.location.z = -0.25
        # Blender's own (corner-angle weighted) vertex normals on the welded mesh, for the edited vertices.
        blender = np.array([v.normal[:] for v in mesh.vertices])[weld[data['vertices']]]
        report[name + 'BlenderNormalMaxDeg'] = float(np.degrees(np.arccos(np.clip(np.einsum('ij,ij->i', blender, ours[data['vertices']]), -1, 1))).max())
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    report['blend'] = str(path)
    report['blender'] = bpy.app.version_string
    return report


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument('--bake', action='store_true')
    parser.add_argument('--undo', action='store_true')
    parser.add_argument('--output', help='folder for --undo output, or an alternative bake output folder')
    parser.add_argument('--review-blend', help='inside Blender: save a before/after review .blend here')
    args = parser.parse_args(argv)
    project = Path(args.project).resolve()
    if args.undo:
        recipe = json.loads((project / RECIPE).read_text(encoding='utf-8'))
        out = Path(args.output)
        out.mkdir(parents=True, exist_ok=True)
        for spec in ASSETS:
            restored = Undo((project / spec['asset']).read_bytes(), recipe, spec)
            (out / Path(spec['asset']).name).write_bytes(restored)
            print('restored', spec['asset'], Sha(restored))
        return
    assert args.bake, 'pass --bake or --undo'
    sources = [Source(project, spec) for spec in ASSETS]
    recipe, outputs, data = Bake(project, sources)
    target = Path(args.output).resolve() if args.output else project
    for spec, out in zip(ASSETS, outputs):
        path = target / spec['asset']
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(out)
    recipePath = target / RECIPE
    recipePath.parent.mkdir(parents=True, exist_ok=True)
    recipePath.write_text(json.dumps(recipe, indent=1) + '\n', encoding='utf-8', newline='\n')
    summary = {'counts': recipe['counts'], 'sides': {s: {k: v for k, v in d.items() if k != 'frame'} for s, d in recipe['sides'].items()},
               'assets': [{k: r[k] for k in ('asset', 'before', 'after')} for r in recipe['assets']]}
    if args.review_blend:
        summary['review'] = ReviewBlend(Path(args.review_blend), data)
        Path(args.review_blend).with_suffix('.json').write_text(json.dumps(summary, indent=1), encoding='utf-8')
    print(json.dumps(summary, indent=1))


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else None)
