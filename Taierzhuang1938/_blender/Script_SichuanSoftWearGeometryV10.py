"""Sparse, shallow cotton relief for the V10 high pack, without outline edits.

Call ``ApplySoftWearGeometry(root)`` in the dedicated Sichuan pack scene.
Only two named meshes receive relative shape keys: the relaxed front leaf and
the continuous binding.  Their Basis coordinates, UVs, topology, object/parent
transforms and existing modifiers remain unchanged.  Repeated calls replace
this pass's key coordinates from Basis, rather than accumulating deformation.
The back plane, repair patch and separate mat retainers are never inputs.

This is a restrained high-model pass.  Millimetre-scale discontinuous folds
give the worn cotton some soft relief; they are not a tiled wrinkle pattern,
cuts, embossed decoration, or a substitute for the separately authored nap.
"""

import array
import hashlib
import math

import bpy
import numpy as np


generatorTag = 'SichuanSoftCottonReliefV10'
keyName = 'SoftCottonWearV10'

# Each quadratic path is unique.  Physical path lengths are 44--66 mm and
# non-overlapping crest amplitudes are 0.55--0.90 mm before masking.  The
# asymmetric broad shoulder is always outward; no valley can enter the body.
frontFolds = (
    ((-.060, .092), (-.035, .084), (.004, .087), .00078, .0038),
    ((-.030, .119), (-.009, .115), (.018, .119), .00055, .0030),
    ((.025, .073), (.044, .079), (.068, .076), .00064, .0034),
    ((-.062, .012), (-.038, .006), (-.009, .011), .00090, .0042),
    ((-.005, -.021), (.020, -.026), (.054, -.023), .00075, .0035),
    ((.118, -.009), (.142, -.004), (.164, .001), .00072, .0037),
    ((-.070, -.114), (-.045, -.122), (-.014, -.118), .00085, .0040),
    ((.004, -.094), (.031, -.098), (.056, -.093), .00060, .0031),
)


def SmoothStep(low, high, value):
    value = np.clip((value - low) / max(high - low, 1e-12), 0, 1)
    return value * value * (3 - 2 * value)


def Coordinates(key):
    values = np.empty(len(key.data) * 3, dtype=np.float64)
    key.data.foreach_get('co', values)
    return values.reshape((-1, 3))


def TransformPoints(matrix, points):
    values = np.asarray(matrix, dtype=np.float64)
    return points @ values[:3, :3].T + values[:3, 3]


def UvDigest(mesh):
    digest = hashlib.sha256()
    for layer in mesh.uv_layers:
        values = array.array('f', [0]) * (len(layer.data) * 2)
        layer.data.foreach_get('uv', values)
        digest.update(layer.name.encode('utf-8'))
        digest.update(values.tobytes())
    return digest.hexdigest()


def PrepareKey(obj):
    if obj.data.shape_keys is None:
        obj.shape_key_add(name='Basis', from_mix=False)
    keys = obj.data.shape_keys.key_blocks
    basis = keys[0]
    key = keys.get(keyName)
    if key is None:
        key = obj.shape_key_add(name=keyName, from_mix=False)
    key.relative_key = basis
    key.slider_min = 0
    key.slider_max = 1
    key.value = 0
    return basis, key


def RootBasis(obj, root):
    # Avoid taking the result of this pass as the input on a second call.
    if obj.data.shape_keys:
        local = Coordinates(obj.data.shape_keys.key_blocks[0])
    else:
        local = np.empty(len(obj.data.vertices) * 3, dtype=np.float64)
        obj.data.vertices.foreach_get('co', local)
        local = local.reshape((-1, 3))
    intoRoot = root.matrix_world.inverted_safe() @ obj.matrix_world
    return local, TransformPoints(intoRoot, local), intoRoot


def BandCenters(binding, root):
    """Read the authored two-by-two grid, accommodating its V7 soft fit."""
    _, positions, _ = RootBasis(binding, root)
    x, y, z = positions.T
    front = y < -.075
    # Mid-panel samples avoid the other two passes and the rear transfers.
    vertical = front & (z > -.028) & (z < .027)
    horizontal = front & (np.abs(x) < .045)
    columns = []
    for side in (-1, 1):
        selected = x[vertical & (x * side > .060) & (x * side < .145)]
        columns.append(float(np.median(selected)) if len(selected) else
                       (-.103 if side < 0 else .089))
    rows = []
    for side in (1, -1):
        selected = z[horizontal & (z * side > .027) & (z * side < .100)]
        rows.append(float(np.median(selected)) if len(selected) else
                    (.050 if side > 0 else -.060))
    return tuple(columns), tuple(rows)


def CurvedRidge(points, path):
    a, b, c, amplitude, width = path
    a, b, c = (np.asarray(value, dtype=np.float64) for value in (a, b, c))
    nearest = np.full(len(points), np.inf)
    signed = np.zeros(len(points))
    along = np.zeros(len(points))
    for t in np.linspace(0, 1, 35):
        centre = (1-t)**2 * a + 2 * (1-t) * t * b + t*t * c
        tangent = 2 * (1-t) * (b-a) + 2 * t * (c-b)
        tangent /= max(np.linalg.norm(tangent), 1e-12)
        delta = points - centre
        squared = np.sum(delta * delta, axis=1)
        replace = squared < nearest
        nearest[replace] = squared[replace]
        signed[replace] = delta[replace] @ np.array((-tangent[1], tangent[0]))
        along[replace] = t
    fade = np.maximum(0, np.sin(math.pi * along)) ** 1.25
    localWidth = width * (.62 + .38 * np.sin(math.pi * along))
    crest = np.exp(-(signed / localWidth) ** 2)
    shoulder = .17 * np.exp(-((signed - 1.7 * localWidth) / (1.45 * localWidth)) ** 2)
    # Compact support: nearby endpoints do not leave tiny infinite tails.
    support = 1 - SmoothStep(2.5 * width, 4 * width, np.sqrt(nearest))
    return amplitude * fade * (crest + shoulder) * support


def FrontRelief(positions, columns, rows):
    x, y, z = positions.T
    relief = np.zeros(len(positions))
    for path in frontFolds:
        relief += CurvedRidge(positions[:, (0, 2)], path)
    # Preserve the exact existing perimeter and keep new relief 5+ mm away
    # from the 26 mm-wide binding.  Smooth fade prevents stamped boundaries.
    edgeDistance = np.minimum.reduce((x - x.min(), x.max() - x,
                                     z - z.min(), z.max() - z))
    mask = SmoothStep(.006, .018, edgeDistance)
    for column in columns:
        mask *= SmoothStep(.016, .023, np.abs(x - column))
    for row in rows:
        mask *= SmoothStep(.016, .023, np.abs(z - row))
    # Explicit expanded right-lower repair exclusion, including its stitches.
    patchDx = np.maximum.reduce((.114 - x, x - .183, np.zeros(len(x))))
    patchDz = np.maximum.reduce((-.144 - z, z + .076, np.zeros(len(z))))
    patchDistance = np.sqrt(patchDx * patchDx + patchDz * patchDz)
    mask *= SmoothStep(.002, .008, patchDistance)
    mask *= SmoothStep(.060, .085, -y)
    return np.minimum(.00098, relief * mask)


def VertexAcross(mesh):
    """Recover strip width parameter from the existing, unchanged atlas UV."""
    total = np.zeros(len(mesh.vertices))
    count = np.zeros(len(mesh.vertices))
    layer = mesh.uv_layers.active
    if layer is None:
        return None
    for loop in mesh.loops:
        total[loop.vertex_index] += layer.data[loop.index].uv.x
        count[loop.vertex_index] += 1
    average = np.divide(total, count, out=np.full_like(total, .250), where=count > 0)
    # BuildBinding uses atlas u = .02 + .46 * (.42 + .16 * widthFraction).
    return np.clip(2 * (average - (.02 + .46 * .42)) / (.46 * .16) - 1, -1, 1)


def BindingRelief(positions, across, columns, rows):
    x, y, z = positions.T
    relief = np.zeros(len(positions))
    front = SmoothStep(.071, .098, -y)
    inner = 1 - SmoothStep(.174, .188, np.abs(x))
    # Soft bumps beside (rather than identical on) the four crossings.  Their
    # irregular width/strength avoids four copies of the same embossed crease.
    for index, (cx, cz, sx, sz, amplitude) in enumerate((
            (columns[0] + .006, rows[0] + .009, .010, .014, .00043),
            (columns[1] - .004, rows[0] - .008, .011, .012, .00058),
            (columns[0] - .005, rows[1] + .009, .012, .014, .00050),
            (columns[1] + .007, rows[1] - .010, .010, .015, .00039))):
        dx, dz = (x-cx)/sx, (z-cz)/sz
        envelope = np.exp(-(dx*dx + dz*dz))
        asymmetry = .83 + .17 * np.sin(dx * 1.7 + dz * 1.1 + index)
        relief += amplitude * envelope * asymmetry
    # A few low turned selvedges, each tapering into the flat tape.  Across
    # comes from its own UV rather than a guess based on the grid direction.
    if across is not None:
        edge = SmoothStep(.50, .96, np.abs(across))
        irregular = .68 + .32 * np.sin(x * 39 + z * 28 + .7)
        local = np.zeros(len(positions))
        for cx, cz, sx, sz, amplitude in (
                (-.025, rows[0], .031, .010, .00024),
                (.042, rows[1], .024, .011, .00031),
                (columns[0], -.102, .012, .020, .00029),
                (columns[1], .103, .011, .021, .00034)):
            local += amplitude * np.exp(-((x-cx)/sx)**2 - ((z-cz)/sz)**2)
        relief += edge * irregular * local
    # The original continuous strip's top turn, excluding separate mat tapes.
    # Front-only displacement prevents any movement of the Y=0 rear contact.
    for cx, phase in zip(columns, (.3, 1.4)):
        crown = np.exp(-((x-cx)/.012)**2 - ((z-.135)/.020)**2)
        relief += .00036 * crown * (.75 + .25 * np.sin(z * 83 + phase))
    return np.minimum(.00068, relief * front * inner)


def WriteRelief(obj, root, reliefFunction):
    uvBefore = UvDigest(obj.data)
    parentBefore = obj.parent
    worldBefore = obj.matrix_world.copy()
    localBasis, positions, intoRoot = RootBasis(obj, root)
    basis, key = PrepareKey(obj)
    delta = reliefFunction(positions)
    output = positions.copy()
    output[:, 1] -= delta
    localOutput = TransformPoints(intoRoot.inverted_safe(), output)
    key.data.foreach_set('co', localOutput.reshape(-1))
    key.value = 1
    obj.data.update()
    assert UvDigest(obj.data) == uvBefore, 'Soft relief changed UV attachments'
    assert obj.parent == parentBefore and obj.matrix_world == worldBefore
    assert np.allclose(Coordinates(basis), localBasis, atol=1e-7), 'Basis was changed'
    assert float(delta.min(initial=0)) >= 0, 'Relief must move outward only'
    back = np.abs(positions[:, 1]) < 1e-7
    assert not np.any(delta[back] > 1e-12), 'Rear contact plane was modified'
    obj['SoftWearGeometryGenerator'] = generatorTag
    obj['SoftWearGeometryDirection'] = 'Pack-local -Y only; UV/topology/Basis unchanged'
    changed = delta > .00001
    return {'object': obj.name, 'shapeKey': key.name,
            'basisVertices': len(localBasis), 'affectedVertices': int(changed.sum()),
            'maxOutwardDisplacementM': float(delta.max(initial=0)),
            'meanAffectedDisplacementM': float(delta[changed].mean()) if changed.any() else 0,
            'uvUnchanged': True, 'topologyUnchanged': True,
            'parentsAndTransformsUnchanged': True, 'backPlaneUnchanged': True}


def ApplySoftWearGeometry(root):
    """Return a JSON-safe report; do not save, render, or invoke operators."""
    assert root is not None and root.name == 'Pack_Root'
    assert bpy.context.scene.get('BlenderMcpTask') == 'SichuanBlanketPack'
    leaf = bpy.data.objects.get('StudyV7_RelaxedFrontLeaf')
    binding = bpy.data.objects.get('Pack_ContinuousClothStrap')
    assert leaf and binding and leaf.type == binding.type == 'MESH'
    descendants = set(root.children_recursive)
    assert leaf in descendants and binding in descendants
    columns, rows = BandCenters(binding, root)
    leafReport = WriteRelief(leaf, root, lambda positions: FrontRelief(positions, columns, rows))
    across = VertexAcross(binding.data)
    bindingReport = WriteRelief(binding, root,
                               lambda positions: BindingRelief(positions, across, columns, rows))
    root['SoftWearGeometryV10'] = generatorTag
    return {'generator': generatorTag, 'frontFoldPaths': len(frontFolds),
            'detectedGridColumnsM': list(columns), 'detectedGridRowsM': list(rows),
            'objects': [leafReport, bindingReport],
            'repairPatchExcluded': True, 'matRetainersExcluded': True,
            'noDecimation': True, 'visualApproval': False}
