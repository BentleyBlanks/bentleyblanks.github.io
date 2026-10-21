"""Add dry, role-aware straw ageing to one existing game mesh.

ApplyAgedStrawMaterial(straw, textureRoot) changes only a private material, UV1
and StrawAgedLowFrequencyColor. Base, roughness and generated tangent Normal
share member-aligned UV1; the old crosshatched Haystack Normal is replaced.
The original positions, topology, UVMap and
BR_original_low_frequency_color remain intact. Export the returned colour-layer
name as COLOR_0; the old forced BR layer would discard the new appearance.

Run after compact Contact and before the game pivot translation. A preliminary
call before Contact is safe, but Contact's new faces need a second call because
Contact fills only its original colour layer and copies UV0 into extra UVs.
The operation is deterministic and safe to repeat from the preserved source
colour. No Blender process is started by importing this module.
"""

import hashlib
import struct
import zlib
from pathlib import Path

import numpy as np


_Version = '20261021AgedStrawV2'
_SourceColor = 'BR_original_low_frequency_color'
_AgedColor = 'StrawAgedLowFrequencyColor'
_FiberUv = 'UVMap.001'
_TileAcrossM = .022
_TileAlongM = .16
_RoleNames = ['UnknownContactFallback', 'ContactCore', 'FrontWeave',
              'ConformingBindings', 'MajorBindings', 'HorizontalRows',
              'PrimaryReeds', 'WrapReeds', 'UnderReeds', 'FoldedHems',
              'RepairKnots', 'FootExtension', 'SmallDecorations']
# Display-sRGB palette, converted to linear before vertex-colour calculations.
_RolePalette = np.asarray([
    [.47, .41, .29], [.44, .39, .28], [.55, .46, .31],
    [.37, .32, .23], [.33, .29, .21], [.53, .45, .30],
    [.58, .49, .33], [.49, .42, .29], [.45, .39, .28],
    [.50, .43, .30], [.39, .34, .25], [.55, .47, .32],
    [.61, .54, .39]], dtype=np.float64)


def _Hash(value):
    return hashlib.sha256(value).hexdigest()


def _ToLinear(value):
    value = np.asarray(value, dtype=np.float64)
    return np.where(value <= .04045, value / 12.92, ((value + .055) / 1.055) ** 2.4)


def _ToSrgb(value):
    value = np.maximum(np.asarray(value, dtype=np.float64), 0)
    return np.where(value <= .0031308, value * 12.92, 1.055 * value ** (1 / 2.4) - .055)


def _SmoothStep(start, end, values):
    parameter = np.clip((values - start) / (end - start), 0, 1)
    return parameter * parameter * (3 - 2 * parameter)


def _EncodeRgbPng(rgb):
    if rgb.dtype != np.uint8 or rgb.ndim != 3 or rgb.shape[2] != 3:
        raise ValueError('Expected opaque RGB8 texture pixels')

    def Chunk(kind, payload):
        return (struct.pack('>I', len(payload)) + kind + payload
                + struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff))

    height, width = rgb.shape[:2]
    scanlines = b''.join(b'\0' + row.tobytes() for row in rgb)
    return (b'\x89PNG\r\n\x1a\n'
            + Chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
            + Chunk(b'IDAT', zlib.compress(scanlines, 9)) + Chunk(b'IEND', b''))


def BuildStrawAgeTiles(size=512):
    """Return three aligned RGB8 maps from one periodic metre-height field."""
    if not isinstance(size, int) or size < 128 or size > 1024:
        raise ValueError('Straw fibre tiles must be 128 to 1024 pixels')
    # PNG rows run downward; v is upward, as in glTF/OpenGL tangent space.
    u, v = np.meshgrid(np.arange(size) / size, 1 - np.arange(size) / size)
    tau = 2 * np.pi
    bend = .085 * np.sin(tau * v) + .025 * np.sin(tau * 3 * v)
    ridge = np.cos(tau * (9 * u + bend))
    breaks = _SmoothStep(-.5, .75, np.sin(tau * 3 * v + .75 * np.sin(tau * 2 * u)))
    primary = ridge * (.65 + .35 * breaks)
    secondaryBreaks = .60 + .40 * _SmoothStep(-.4, .8, np.sin(tau * 5 * v + .6 * np.sin(tau * 3 * u)))
    secondary = np.cos(tau * (29 * u + .045 * np.sin(tau * 2 * v))) * secondaryBreaks
    grooves = np.exp(-((1 + ridge) ** 2) / .055)
    peeled = grooves * (.35 + .65 * breaks)
    height = .000115 * primary + .000028 * secondary - .000055 * peeled
    profile = (height - height.mean()) / max(float(height.std()), 1e-12)
    linearBase = np.clip(.84 * (1 + .10 * profile), .61, .985)
    base = np.repeat(np.floor(np.clip(_ToSrgb(linearBase), 0, 1)[:, :, None] * 255 + .5).astype(np.uint8), 3, axis=2)
    roughness = np.clip(.93 - .020 * profile + .008 * (1 - breaks), .875, .98)
    orm = np.zeros((size, size, 3), dtype=np.uint8)
    orm[:, :, 0] = 255
    orm[:, :, 1] = np.floor(roughness * 255 + .5).astype(np.uint8)
    slopeU = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / (2 * _TileAcrossM / size)
    slopeV = -(np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / (2 * _TileAlongM / size)
    vectors = np.stack((-slopeU, -slopeV, np.ones_like(height)), axis=2)
    vectors /= np.linalg.norm(vectors, axis=2, keepdims=True)
    normal = np.floor(np.clip(vectors * .5 + .5, 0, 1) * 255 + .5).astype(np.uint8)
    actualBase = _ToLinear(base.astype(np.float64) / 255)
    stats = {'dimensions': [size, size], 'fiberDirectionInTile': 'V',
             'tileAcrossM': _TileAcrossM, 'tileAlongM': _TileAlongM,
             'primaryFibersAcrossTile': 9, 'secondaryFibersAcrossTile': 29,
             'primarySpacingM': _TileAcrossM / 9, 'secondarySpacingM': _TileAcrossM / 29,
             'heightRangeM': [float(height.min()), float(height.max())],
             'heightStandardDeviationM': float(height.std()),
             'normalMethod': 'Periodic physical-height central derivatives, PNG-row sign corrected, OpenGL +Y tangent normal',
             'normalSlopeRms': [float(np.sqrt(np.mean(slopeU ** 2))), float(np.sqrt(np.mean(slopeV ** 2)))],
             'allPbrMapsShareHeightField': True,
             'baseActualLinearMean': actualBase.mean(axis=(0, 1)).tolist(),
             'baseLinearMinMax': [float(actualBase.min()), float(actualBase.max())],
             'roughnessMinMax': [float(orm[:, :, 1].min() / 255), float(orm[:, :, 1].max() / 255)],
             'roughnessMean': float(orm[:, :, 1].mean() / 255),
             'ormChannels': 'R=1 (unused AO), G=roughness, B=0 metallic',
             'periodicAnalyticFields': True}
    return base, orm, normal, stats


def _BroadField(points, frequency, phase):
    x, y, z = points.T
    return (.53 * np.sin(frequency * (1.17 * x + .63 * y + .38 * z) + phase)
            + .29 * np.sin(frequency * (-.41 * x + 1.31 * y + .57 * z) + phase * 1.7)
            + .18 * np.sin(frequency * (.72 * x - .56 * y + 1.11 * z) - phase * .6))


def BuildAgedStrawColors(worldCorners, sourceColors, roles, baseLinearMean, sourceIds=None):
    """Role palette with gentle world-space age, source detail, dust and wear."""
    points = np.asarray(worldCorners, dtype=np.float64)
    source = np.asarray(sourceColors, dtype=np.float64)
    role = np.asarray(roles, dtype=np.int64).copy()
    if points.shape != (len(source), 3) or source.shape[1:] != (4,) or role.shape != (len(source),) or not len(source):
        raise ValueError('Invalid straw ageing sample arrays')
    if not np.isfinite(points).all() or not np.isfinite(source).all():
        raise ValueError('Nonfinite straw source data')
    role[(role < 0) | (role >= len(_RoleNames))] = 0
    mean = np.asarray(baseLinearMean, dtype=np.float64)
    if mean.shape != (3,) or not np.isfinite(mean).all() or np.any(mean <= 0):
        raise ValueError('Invalid fibre BaseColor mean')
    palette = _ToLinear(_RolePalette)
    broad = _BroadField(points, 5.1, 1.2)
    mottling = _BroadField(points, 13.7, .45)
    rgb = palette[role] * (1 + .13 * broad[:, None] + .055 * mottling[:, None])
    ids = np.zeros(len(source), dtype=np.int64) if sourceIds is None else np.asarray(sourceIds, dtype=np.int64)
    if ids.shape != role.shape:
        raise ValueError('Invalid Straw source-member ids')
    memberTone = .95 + .10 * ((ids * 73 + role * 19) % 127) / 126
    rgb *= memberTone[:, None]
    grey = _ToLinear([.49, .47, .37])
    greyWeight = .10 + .075 * _BroadField(points, 8.4, 2.1)
    rgb = rgb * (1 - greyWeight[:, None]) + grey * greyWeight[:, None]
    sourceLuminance = np.maximum(source[:, :3], 0) @ [.2126, .7152, .0722]
    sourceDetail = np.ones(len(source), dtype=np.float64)
    bindings = np.isin(role, [3, 4, 10])
    seamDarkening = np.ones(len(source), dtype=np.float64)
    for roleId in np.unique(role):
        selected = role == roleId
        reference = float(np.median(sourceLuminance[selected]))
        if reference > 1e-6:
            relative = sourceLuminance[selected] / reference
            sourceDetail[selected] = .82 + .18 * np.clip(relative, .45, 1.6)
            if roleId in (3, 4, 10):
                seamDarkening[selected] = 1 - .14 * (1 - _SmoothStep(.60, 1.02, relative))
    rgb *= sourceDetail[:, None]
    rgb *= seamDarkening[:, None]
    low, high = points.min(axis=0), points.max(axis=0)
    edgeDistance = np.minimum.reduce((points[:, 0] - low[0], high[0] - points[:, 0],
                                     points[:, 1] - low[1], high[1] - points[:, 1]))
    edge = 1 - _SmoothStep(.008, .065, edgeDistance)
    top = float(np.quantile(points[:, 2], .93))
    # A bounded height/interior proxy, not baked AO or measured cloth contact.
    dust = .14 * _SmoothStep(top - .075, top - .012, points[:, 2]) * (1 - .65 * edge)
    dust += .035 * np.isin(role, [0, 1, 8])
    dust = np.clip(dust, 0, .18)
    dustColor = _ToLinear([.44, .42, .35])
    rgb = rgb * (1 - dust[:, None]) + dustColor * dust[:, None]
    wear = (.16 * edge + .045 * (role == 12)) * (.8 + .2 * mottling)
    wear *= np.where(bindings, .45, 1.)
    wear = np.clip(wear, 0, .23)
    wornColor = _ToLinear([.69, .64, .49])
    rgb = rgb * (1 - wear[:, None]) + wornColor * wear[:, None]
    result = np.ones((len(source), 4), dtype=np.float32)
    compensated = rgb / mean[None, :]
    result[:, :3] = np.clip(compensated, 0, 1)
    if not np.isfinite(result).all():
        raise ValueError('Nonfinite aged straw colour')
    luminance = rgb @ [.2126, .7152, .0722]
    stats = {'rolePaletteSrgb': {name: _RolePalette[index].tolist() for index, name in enumerate(_RoleNames)},
             'linearSurfaceRgbMinMax': [float(rgb.min()), float(rgb.max())],
             'meanSurfaceSrgb': _ToSrgb(rgb).mean(axis=0).tolist(),
             'surfaceLuminancePercentiles': np.quantile(luminance, [.01, .1, .5, .9, .99]).tolist(),
             'vertexColorCompensationClippedFraction': float(np.mean((compensated < 0) | (compensated > 1))),
             'dustWeightMinMax': [float(dust.min()), float(dust.max())],
             'edgeWearWeightMinMax': [float(wear.min()), float(wear.max())],
             'sourceMemberToneMinMax': [float(memberTone.min()), float(memberTone.max())],
             'bindingContactSeamScaleMinMax': [float(seamDarkening.min()), float(seamDarkening.max())],
             'dustMethod': 'bounded top-height/interior proxy; not measured AO or exact cloth proximity',
             'unknownRoleCornerCount': int(np.count_nonzero(role == 0)), 'allColorsFinite': True, 'alpha': 1.}
    return result, stats


def _WeightedMedian(values, weights):
    order = np.argsort(values)
    cumulative = np.cumsum(weights[order])
    return float(values[order[np.searchsorted(cumulative, cumulative[-1] * .5)]])


def BuildStrawFiberUv(worldVertices, triangleVertices, triangleLoops, trianglePolygons,
                      uv0, loopFaces, faceSources, faceRoles, fiberAxis=None):
    """Choose each member's UV tangent by world PCA, without world projection."""
    points = np.asarray(worldVertices, dtype=np.float64)
    uv = np.asarray(uv0, dtype=np.float64)
    triangles = points[np.asarray(triangleVertices, dtype=np.int64)]
    authored = uv[np.asarray(triangleLoops, dtype=np.int64)]
    first, second = triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0]
    deltaFirst, deltaSecond = authored[:, 1] - authored[:, 0], authored[:, 2] - authored[:, 0]
    determinant = deltaFirst[:, 0] * deltaSecond[:, 1] - deltaFirst[:, 1] * deltaSecond[:, 0]
    area = np.linalg.norm(np.cross(first, second), axis=1) * .5
    valid = (np.abs(determinant) > 1e-10) & (area > 1e-12)
    metric = np.full((len(triangles), 2), np.nan)
    derivativeU = ((first[valid] * deltaSecond[valid, 1, None] - second[valid] * deltaFirst[valid, 1, None])
                   / determinant[valid, None])
    derivativeV = ((-first[valid] * deltaSecond[valid, 0, None] + second[valid] * deltaFirst[valid, 0, None])
                   / determinant[valid, None])
    metric[valid, 0], metric[valid, 1] = np.linalg.norm(derivativeU, axis=1), np.linalg.norm(derivativeV, axis=1)
    tangentU, tangentV = np.zeros_like(first), np.zeros_like(first)
    tangentU[valid] = derivativeU / np.maximum(np.linalg.norm(derivativeU, axis=1, keepdims=True), 1e-20)
    tangentV[valid] = derivativeV / np.maximum(np.linalg.norm(derivativeV, axis=1, keepdims=True), 1e-20)
    valid &= np.isfinite(metric).all(axis=1) & (metric.min(axis=1) > 1e-6) & (metric.max(axis=1) < 50)
    fallback = np.asarray([_WeightedMedian(metric[valid, axis], area[valid]) for axis in range(2)]) if valid.any() else np.asarray([.19627, .19627])
    keys, polygonGroups = np.unique(np.stack((faceSources, faceRoles), axis=1), axis=0, return_inverse=True)
    triangleGroups = polygonGroups[np.asarray(trianglePolygons, dtype=np.int64)]
    loopGroups = polygonGroups[np.asarray(loopFaces, dtype=np.int64)]
    result = np.empty_like(uv, dtype=np.float64)
    memberMetrics, fallbackMembers, directions = [], 0, []
    for group in range(len(keys)):
        chosen = (triangleGroups == group) & valid
        scale = np.asarray([_WeightedMedian(metric[chosen, axis], area[chosen]) for axis in range(2)]) if chosen.any() else fallback.copy()
        fallbackMembers += int(not chosen.any())
        scale = np.clip(scale, .002, 8.)
        memberMetrics.append(scale)
        selected = loopGroups == group
        centered = uv[selected] - uv[selected].mean(axis=0)
        geometry = np.asarray(triangleVertices)[triangleGroups == group]
        memberPoints = points[np.unique(geometry)]
        centeredWorld = memberPoints - memberPoints.mean(axis=0)
        eigenvalues, eigenvectors = np.linalg.eigh(centeredWorld.T @ centeredWorld)
        longAxis = eigenvectors[:, -1]
        elongation = float(eigenvalues[-1] / max(eigenvalues[-2], 1e-20))
        alignmentU = float(np.average(np.abs(tangentU[chosen] @ longAxis), weights=area[chosen])) if chosen.any() else 0.
        alignmentV = float(np.average(np.abs(tangentV[chosen] @ longAxis), weights=area[chosen])) if chosen.any() else 0.
        axis = fiberAxis if fiberAxis in ('U', 'V') else 'V'
        method = 'authored V tangent fallback'
        if fiberAxis in ('U', 'V'):
            method = 'explicit diagnostic axis'
        elif chosen.any() and elongation > 1.25 and abs(alignmentU - alignmentV) > .035:
            axis = 'U' if alignmentU > alignmentV else 'V'
            method = 'per-member world PCA alignment to authored UV0 tangents'
        directions.append({'sourceId': int(keys[group, 0]), 'role': int(keys[group, 1]), 'axis': axis,
                           'method': method, 'pcaElongationRatio': elongation,
                           'alignmentU': alignmentU, 'alignmentV': alignmentV})
        phase = np.asarray([((int(keys[group, 0]) * 37 + int(keys[group, 1]) * 11) % 101) / 101,
                            ((int(keys[group, 0]) * 17 + int(keys[group, 1]) * 29) % 103) / 103])
        if axis == 'U':
            result[selected, 0] = centered[:, 1] * scale[1] / _TileAcrossM + phase[0]
            result[selected, 1] = centered[:, 0] * scale[0] / _TileAlongM + phase[1]
        else:
            result[selected, 0] = centered[:, 0] * scale[0] / _TileAcrossM + phase[0]
            result[selected, 1] = centered[:, 1] * scale[1] / _TileAlongM + phase[1]
    if not np.isfinite(result).all():
        raise ValueError('Nonfinite member-aligned straw UV1')
    return result.astype(np.float32), {'mapping': 'authored UV0 tangents, area-weighted world metres/UV per source member',
                                     'fiberAxisInAuthoredUv': 'per source-member U/V', 'tileAcrossM': _TileAcrossM, 'tileAlongM': _TileAlongM,
                                     'sourceMemberRoleGroups': len(keys), 'fallbackMemberGroups': fallbackMembers,
                                     'validMetricTriangles': int(valid.sum()), 'invalidMetricTriangles': int((~valid).sum()),
                                     'globalFallbackMetersPerUv': fallback.tolist(),
                                     'memberMetersPerUvPercentiles': np.quantile(memberMetrics, [.1, .5, .9], axis=0).tolist(),
                                     'memberAxisCounts': {axis: sum(row['axis'] == axis for row in directions) for axis in ('U', 'V')},
                                     'memberDirections': directions,
                                     'worldXyProjectionUsed': False}


def _ReadFaceInt(mesh, name):
    layer = mesh.attributes.get(name)
    values = np.zeros(len(mesh.polygons), dtype=np.int32)
    present = layer is not None and layer.domain == 'FACE' and layer.data_type == 'INT'
    if present:
        layer.data.foreach_get('value', values)
    return values, present


def _NormalInfo(material):
    principal = next(node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    links = [(link.from_node.name, link.from_socket.identifier) for link in principal.inputs['Normal'].links]
    stats = {'previousNormalConnection': links, 'directionSource': 'geometry/UV0 only, never the previous Normal image'}
    if links:
        normal = principal.inputs['Normal'].links[0].from_node
        if normal.type == 'NORMAL_MAP':
            stats.update({'previousNormalUvMap': normal.uv_map, 'previousNormalStrength': float(normal.inputs['Strength'].default_value)})
            if normal.inputs['Color'].links:
                texture = normal.inputs['Color'].links[0].from_node
                if texture.type == 'TEX_IMAGE' and texture.image is not None:
                    stats['previousNormalImage'] = texture.image.name
    return stats


def _LoadTexture(bpy, file, colorSpace, payloadHash):
    image = next((item for item in bpy.data.images if item.get('StrawAgePayloadHash') == payloadHash
                  and item.colorspace_settings.name == colorSpace), None)
    if image is None:
        image = bpy.data.images.load(str(file), check_existing=False)
        image.name = file.stem
        image.colorspace_settings.name = colorSpace
        image['StrawAgePayloadHash'] = payloadHash
    image.pack()
    return image


def ApplyAgedStrawMaterial(straw, textureRoot, normalStrength=.62):
    """Return a JSON-safe receipt; modify only this single-user game Straw."""
    import bpy

    normalStrength = float(normalStrength)
    if not np.isfinite(normalStrength) or normalStrength < 0 or normalStrength > 1:
        raise ValueError('Expected a finite Straw normal strength in 0..1')
    if straw.type != 'MESH' or straw.data.users > 1 or len(straw.data.materials) != 1:
        raise ValueError('Expected a single-user, single-material game Straw mesh')
    mesh, oldMaterial = straw.data, straw.data.materials[0]
    if oldMaterial is None or not oldMaterial.use_nodes or ('Straw' not in straw.name and 'BedStraw' not in oldMaterial.name):
        raise ValueError('Expected the baked Straw PBR material')
    source = mesh.color_attributes.get(_SourceColor)
    if source is None or source.domain != 'CORNER' or source.data_type != 'FLOAT_COLOR':
        raise ValueError('The original explicit FLOAT/CORNER Straw colour is required')
    if not mesh.uv_layers or mesh.uv_layers[0].name != 'UVMap':
        raise ValueError('The authored UVMap must remain UV0')
    positions = np.empty((len(mesh.vertices), 3), dtype=np.float32)
    mesh.vertices.foreach_get('co', positions.ravel())
    loopVertices = np.empty(len(mesh.loops), dtype=np.int32)
    mesh.loops.foreach_get('vertex_index', loopVertices)
    uv0 = np.empty((len(mesh.loops), 2), dtype=np.float32)
    mesh.uv_layers[0].data.foreach_get('uv', uv0.ravel())
    colors = np.empty((len(mesh.loops), 4), dtype=np.float32)
    source.data.foreach_get('color', colors.ravel())
    beforeHashes = {'positions': _Hash(positions.tobytes()), 'loopVertexIndices': _Hash(loopVertices.tobytes()),
                    'uv0': _Hash(uv0.tobytes()), 'sourceColors': _Hash(colors.tobytes())}
    matrix = np.asarray(straw.matrix_world, dtype=np.float64)
    world = positions.astype(np.float64) @ matrix[:3, :3].T + matrix[:3, 3]
    roles, rolesPresent = _ReadFaceInt(mesh, 'StrawSourceRole')
    sources, sourcesPresent = _ReadFaceInt(mesh, 'StrawSourceObject')
    loopFaces = np.repeat(np.arange(len(mesh.polygons), dtype=np.int32), [poly.loop_total for poly in mesh.polygons])
    mesh.calc_loop_triangles()
    triangleVertices = np.asarray([triangle.vertices[:] for triangle in mesh.loop_triangles], dtype=np.int32)
    triangleLoops = np.asarray([triangle.loops[:] for triangle in mesh.loop_triangles], dtype=np.int32)
    trianglePolygons = np.asarray([triangle.polygon_index for triangle in mesh.loop_triangles], dtype=np.int32)
    triangleCount = len(triangleVertices)
    base, orm, normalPixels, textureStats = BuildStrawAgeTiles()
    agedColors, colorStats = BuildAgedStrawColors(world[loopVertices], colors, roles[loopFaces], textureStats['baseActualLinearMean'], sources[loopFaces])
    normalStats = _NormalInfo(oldMaterial)
    fiberUv, uvStats = BuildStrawFiberUv(world, triangleVertices, triangleLoops, trianglePolygons,
                                        uv0, loopFaces, sources, roles)
    uv1 = mesh.uv_layers.get(_FiberUv)
    if uv1 is None:
        uv1 = mesh.uv_layers.new(name=_FiberUv)
    if mesh.uv_layers[1].name != _FiberUv:
        raise ValueError('The aged straw UVMap.001 must be the second UV layer')
    uv1.data.foreach_set('uv', fiberUv.ravel())
    mesh.uv_layers.active_index = 1
    uv1.active_render = True
    aged = mesh.color_attributes.get(_AgedColor)
    if aged is None:
        aged = mesh.color_attributes.new(name=_AgedColor, type='FLOAT_COLOR', domain='CORNER')
    if aged.domain != 'CORNER' or aged.data_type != 'FLOAT_COLOR':
        raise ValueError('Existing Straw aged-colour layer has an incompatible type')
    aged.data.foreach_set('color', agedColors.ravel())
    mesh.color_attributes.active_color = aged
    textureRoot = Path(textureRoot)
    textureRoot.mkdir(parents=True, exist_ok=True)
    images, textureRows = {}, []
    for role, name, pixels, colorSpace in [
            ('Base', 'Texture_BedStrawAgedFiberBase.png', base, 'sRGB'),
            ('Roughness', 'Texture_BedStrawAgedFiberOrm.png', orm, 'Non-Color'),
            ('Normal', 'Texture_BedStrawAgedFiberNormal.png', normalPixels, 'Non-Color')]:
        payload = _EncodeRgbPng(pixels)
        file = textureRoot / name
        file.write_bytes(payload)
        if file.read_bytes() != payload:
            raise IOError('The saved Straw tile differs from its generated pixels')
        payloadHash = _Hash(payload)
        images[role] = _LoadTexture(bpy, file, colorSpace, payloadHash)
        textureRows.append({'role': role, 'file': str(file), 'sha256': payloadHash, 'bytes': len(payload),
                            'dimensions': [512, 512], 'colorSpace': colorSpace})
    material = oldMaterial if oldMaterial.get('StrawAgeVersion') == _Version and oldMaterial.users == 1 else oldMaterial.copy()
    material.name = 'Material_BedStrawAged'
    material['StrawAgeVersion'] = _Version
    nodes, links = material.node_tree.nodes, material.node_tree.links
    # No disconnected legacy Haystack Normal/image nodes remain in this game
    # material: cold-project image inventories must describe the actual graph.
    nodes.clear()
    principal = nodes.new('ShaderNodeBsdfPrincipled')
    materialOutput = nodes.new('ShaderNodeOutputMaterial')
    links.new(principal.outputs['BSDF'], materialOutput.inputs['Surface'])
    principal.inputs['Metallic'].default_value = 0
    uvNode = nodes.new('ShaderNodeUVMap');uvNode.name = 'PatchedStrawAgeFiberUv';uvNode.uv_map = _FiberUv
    baseNode = nodes.new('ShaderNodeTexImage');baseNode.name = 'PatchedStrawAgeFiberBase';baseNode.image = images['Base']
    roughNode = nodes.new('ShaderNodeTexImage');roughNode.name = 'PatchedStrawAgeFiberOrm';roughNode.image = images['Roughness']
    normalTexture = nodes.new('ShaderNodeTexImage');normalTexture.name = 'PatchedStrawAgeFiberNormal';normalTexture.image = images['Normal']
    for node in (baseNode, roughNode, normalTexture):
        node.extension = 'REPEAT';node.interpolation = 'Linear';links.new(uvNode.outputs['UV'], node.inputs['Vector'])
    colorNode = nodes.new('ShaderNodeVertexColor');colorNode.name = 'PatchedStrawAgeMacroColor';colorNode.layer_name = _AgedColor
    multiply = nodes.new('ShaderNodeMix');multiply.name = 'PatchedStrawAgeNativeMultiply'
    multiply.data_type = 'RGBA';multiply.blend_type = 'MULTIPLY';multiply.clamp_result = False;multiply.inputs[0].default_value = 1
    inputA = next(socket for socket in multiply.inputs if socket.identifier == 'A_Color')
    inputB = next(socket for socket in multiply.inputs if socket.identifier == 'B_Color')
    output = next(socket for socket in multiply.outputs if socket.type == 'RGBA')
    links.new(baseNode.outputs['Color'], inputA);links.new(colorNode.outputs['Color'], inputB);links.new(output, principal.inputs['Base Color'])
    separate = nodes.new('ShaderNodeSeparateColor');separate.name = 'PatchedStrawAgeRoughnessChannel';separate.mode = 'RGB'
    links.new(roughNode.outputs['Color'], separate.inputs['Color']);links.new(separate.outputs['Green'], principal.inputs['Roughness'])
    normalNode = nodes.new('ShaderNodeNormalMap');normalNode.name = 'PatchedStrawAgePhysicalFiberNormal'
    normalNode.uv_map = _FiberUv;normalNode.inputs['Strength'].default_value = normalStrength
    links.new(normalTexture.outputs['Color'], normalNode.inputs['Color']);links.new(normalNode.outputs['Normal'], principal.inputs['Normal'])
    normalStats.update({'normalUvMap': _FiberUv, 'normalStrength': normalStrength, 'effectiveNormalStrength': normalStrength,
                        'normalImage': images['Normal'].name, 'method': textureStats['normalMethod'],
                        'originalHaystackNormalReplaced': True, 'allPbrMapsUseUv1': True})
    mesh.materials[0] = material
    mesh.update();mesh.calc_loop_triangles()
    afterPositions, afterLoops, afterUv, afterColors = np.empty_like(positions), np.empty_like(loopVertices), np.empty_like(uv0), np.empty_like(colors)
    mesh.vertices.foreach_get('co', afterPositions.ravel());mesh.loops.foreach_get('vertex_index', afterLoops)
    mesh.uv_layers[0].data.foreach_get('uv', afterUv.ravel());source.data.foreach_get('color', afterColors.ravel())
    afterHashes = {'positions': _Hash(afterPositions.tobytes()), 'loopVertexIndices': _Hash(afterLoops.tobytes()),
                   'uv0': _Hash(afterUv.tobytes()), 'sourceColors': _Hash(afterColors.tobytes())}
    if beforeHashes != afterHashes or triangleCount != len(mesh.loop_triangles) or len(mesh.materials) != 1:
        raise ValueError('Straw ageing changed geometry, UV0, source colour or material count')
    if any(poly.material_index != 0 for poly in mesh.polygons):
        raise ValueError('Expected every Straw face to use the single material')
    straw['StrawAgeVersion'] = _Version
    return {'result': 'PASS', 'version': _Version, 'group': 'Straw', 'material': material.name,
            'trianglesBefore': triangleCount, 'trianglesAfter': len(mesh.loop_triangles), 'materials': 1, 'addedDrawPrimitives': 0,
            'exportColorLayer': _AgedColor, 'sourceColorLayer': _SourceColor, 'fiberUvLayer': _FiberUv,
            'geometryUnchanged': True, 'maximumVertexDisplacementM': 0., 'uv0Unchanged': True, 'sourceColorDataUnchanged': True,
            'beforeHashes': beforeHashes, 'afterHashes': afterHashes, 'normalGraphConnectionsUnchanged': False,
            'normalContractChanged': True, 'normalRenderUv': _FiberUv, 'requestedNormalStrength': normalStrength,
            'legacyNormalNodesRemaining': 0,
            'rolesAttributePresent': rolesPresent, 'sourceObjectAttributePresent': sourcesPresent,
            'roleFaceCounts': {_RoleNames[index]: int(np.count_nonzero(roles == index)) for index in range(len(_RoleNames))},
            'textures': textureRows, 'textureStats': textureStats, 'colorStats': colorStats, 'uvStats': uvStats,
            'normalStats': normalStats, 'agedColorSha256': _Hash(agedColors.tobytes()),
            'integration': 'After Contact and before pivot; export StrawAgedLowFrequencyColor as COLOR_0, BaseColor UV1 x colour, roughness G/UV1 and new physical-height Normal UV1; UV1 is render-active for tangents, source UV0 stays byte-identical.'}
