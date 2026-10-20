"""Add existing BS yarn colour detail to the game Quilt only.

Import this module after the Quilt CORNER colour bake, then call
ApplyCottonWeave(low, bsRoot, textureRoot). No Blender process is started here.
The shader is the glTF-supported Image * Color Attribute Multiply pattern.
"""

import hashlib
import struct
import zlib
from pathlib import Path

import numpy as np


def Hash(data):
    return hashlib.sha256(data).hexdigest()


def ReadRgbPng(file):
    """Read the existing non-interlaced 8-bit BS PNG without a Pillow dependency."""
    raw = Path(file).read_bytes()
    if raw[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Expected the archived BS fibre PNG')
    offset = 8
    packed = bytearray()
    width = height = channels = None
    while offset < len(raw):
        size = struct.unpack_from('>I', raw, offset)[0]
        kind = raw[offset + 4:offset + 8]
        data = raw[offset + 8:offset + 8 + size]
        checksum = struct.unpack_from('>I', raw, offset + 8 + size)[0]
        if zlib.crc32(kind + data) & 0xffffffff != checksum:
            raise ValueError('PNG checksum mismatch')
        if kind == b'IHDR':
            width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', data)
            if depth != 8 or color not in (2, 6) or compression or filtering or interlace:
                raise ValueError('Expected a non-interlaced RGB/RGBA 8-bit source PNG')
            channels = 3 if color == 2 else 4
        elif kind == b'IDAT':
            packed.extend(data)
        elif kind == b'IEND':
            break
        offset += size + 12
    if channels is None:
        raise ValueError('Missing PNG header')
    decoded = zlib.decompress(packed)
    stride = width * channels
    if len(decoded) != height * (stride + 1):
        raise ValueError('Unexpected PNG scanline size')
    result = np.empty((height, stride), dtype=np.uint8)
    previous = np.zeros(stride, dtype=np.uint8)
    for row in range(height):
        offset = row * (stride + 1)
        method = decoded[offset]
        line = np.frombuffer(decoded, dtype=np.uint8, count=stride, offset=offset + 1).copy()
        if method == 1:
            line = np.cumsum(line.reshape(width, channels), axis=0).astype(np.uint8).reshape(-1)
        elif method == 2:
            line = (line.astype(np.uint16) + previous).astype(np.uint8)
        elif method in (3, 4):
            for index in range(stride):
                left = int(line[index - channels]) if index >= channels else 0
                above = int(previous[index])
                if method == 3:
                    prediction = (left + above) // 2
                else:
                    diagonal = int(previous[index - channels]) if index >= channels else 0
                    center = left + above - diagonal
                    distances = (abs(center - left), abs(center - above), abs(center - diagonal))
                    prediction = (left if distances[0] <= min(distances[1:])
                                  else above if distances[1] <= distances[2] else diagonal)
                line[index] = (int(line[index]) + prediction) & 255
        elif method != 0:
            raise ValueError('Unsupported PNG filter')
        result[row] = line
        previous = line
    result = result.reshape(height, width, channels)
    if channels == 4 and not np.all(result[:, :, 3] == 255):
        raise ValueError('The source yarn image must be opaque')
    return result[:, :, :3].copy()


def EncodeRgbPng(rgb):
    height, width, channels = rgb.shape
    if channels != 3 or rgb.dtype != np.uint8:
        raise ValueError('Expected RGB8 pixels')

    def Chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)

    scanlines = b''.join(b'\0' + row.tobytes() for row in rgb)
    return (b'\x89PNG\r\n\x1a\n'
            + Chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
            + Chunk(b'IDAT', zlib.compress(scanlines, 9)) + Chunk(b'IEND', b''))


def ToLinear(values):
    return np.where(values <= .04045, values / 12.92, ((values + .055) / 1.055) ** 2.4)


def NormalizeWeave(rgb, targetMean=.88):
    linear = ToLinear(rgb.astype(np.float64) / 255)
    mean = linear.mean(axis=(0, 1))
    if np.any(mean <= 0):
        raise ValueError('The source yarn image has an empty colour channel')
    relative = linear / mean
    # Uniformly compress deviations around the actual source mean instead of
    # clipping bright yarn plateaus. This preserves the ordering and spatial
    # structure of every source fibre while leaving headroom below white.
    maximumDeviation = float(np.max(relative - 1))
    contrastGain = min(.55, .97 * (1 / targetMean - 1) / max(maximumDeviation, 1e-12))
    normalized = np.clip(targetMean * (1 + contrastGain * (relative - 1)), 0, 1)
    srgb = np.where(normalized <= .0031308, normalized * 12.92,
                    1.055 * normalized ** (1 / 2.4) - .055)
    encoded = np.clip(np.floor(srgb * 255 + .5), 0, 255).astype(np.uint8)
    # Compensate using the actual encoded PNG mean, including 8-bit rounding.
    actual = ToLinear(encoded.astype(np.float64) / 255)
    return encoded, {'targetLinearMean': targetMean, 'sourceLinearMean': mean.tolist(),
                     'actualLinearMean': actual.mean(axis=(0, 1)).tolist(),
                     'relativeContrastGain': contrastGain,
                     'linearPercentiles': np.quantile(actual, [.01, .1, .5, .9, .99]).tolist(),
                     'upperClippedFraction': float((normalized >= 1).mean())}


def SmoothStep(start, end, values):
    parameter = np.clip((values - start) / (end - start), 0, 1)
    return parameter * parameter * (3 - 2 * parameter)


def PhysicalUv(points, tileMeters=.19627):
    """Continuous XY on top, plus a smooth unfolded drop along both side skirts.

    A pure XY projection collapses the vertical skirts. The extra signed drop
    opens those skirts continuously, without per-face projection seams. This is
    a physical-scale approximation, rather than a claim of isometric unwrapping.
    """
    centerY = (points[:, 1].min() + points[:, 1].max()) * .5
    y = points[:, 1] - centerY
    halfWidth = float(np.max(np.abs(y)))
    xMin, xMax = float(points[:, 0].min()), float(points[:, 0].max())
    if halfWidth <= 1e-6 or xMax - xMin <= 1e-6:
        raise ValueError('Expected the metre-scale, long-X Quilt mesh')
    bins = np.linspace(xMin, xMax, 65)
    centers = (bins[:-1] + bins[1:]) * .5
    ids = np.clip(np.searchsorted(bins, points[:, 0], side='right') - 1, 0, len(centers) - 1)
    profile = np.full(len(centers), np.nan)
    for index in range(len(centers)):
        heights = points[(ids == index) & (np.abs(y) <= .75 * halfWidth), 2]
        if len(heights):
            profile[index] = np.quantile(heights, .85)
    present = np.isfinite(profile)
    if not present.any():
        raise ValueError('No central Quilt surface was found for the side-drop profile')
    profile = np.interp(centers, centers[present], profile[present])
    profile = np.convolve(np.pad(profile, (2, 2), mode='edge'), np.array([1, 2, 3, 2, 1]) / 9, mode='valid')
    top = np.interp(points[:, 0], centers, profile)
    edge = SmoothStep(.60, .88, np.abs(y) / halfWidth)
    drop = np.maximum(top - points[:, 2], 0) * edge
    unrolledY = y + np.sign(y) * drop
    uv = np.stack(((points[:, 0] - xMin) / tileMeters, unrolledY / tileMeters), axis=1)
    return uv.astype(np.float32), {'tileMeters': tileMeters, 'mapping': 'world XY plus continuous signed side drop',
                                  'centerY': centerY, 'halfWidthMeters': halfWidth,
                                  'maximumSideDropMeters': float(drop.max()),
                                  'nominalTilesPerMeter': 1 / tileMeters}


def WeightedQuantiles(values, weights):
    order = np.argsort(values)
    cumulative = np.cumsum(weights[order])
    return np.interp([.1, .5, .9, .99], cumulative / cumulative[-1], values[order]).tolist()


def UvStats(points, faces, uvTriangles):
    triangles = points[faces]
    first = triangles[:, 1] - triangles[:, 0]
    second = triangles[:, 2] - triangles[:, 0]
    length = np.linalg.norm(first, axis=1)
    along = np.sum(first * second, axis=1) / np.maximum(length, 1e-30)
    across = np.sqrt(np.maximum(np.sum(second * second, axis=1) - along * along, 0))
    area = length * across * .5
    keep = (length > 1e-9) & (across > 1e-9) & (area > 1e-12)
    deltaFirst = uvTriangles[keep, 1] - uvTriangles[keep, 0]
    deltaSecond = uvTriangles[keep, 2] - uvTriangles[keep, 0]
    jacobian = np.empty((int(keep.sum()), 2, 2))
    jacobian[:, :, 0] = deltaFirst / length[keep, None]
    jacobian[:, :, 1] = (deltaSecond - deltaFirst * (along[keep] / length[keep])[:, None]) / across[keep, None]
    singular = np.linalg.svd(jacobian, compute_uv=False)
    density = np.sqrt(singular[:, 0] * singular[:, 1])
    anisotropy = singular[:, 0] / np.maximum(singular[:, 1], 1e-20)
    return {'percentiles': [10, 50, 90, 99],
            'areaWeightedTilesPerMeter': WeightedQuantiles(density, area[keep]),
            'areaWeightedAnisotropy': WeightedQuantiles(anisotropy, area[keep])}


def ApplyCottonWeave(low, bsRoot, textureRoot):
    """Modify only the already-baked Quilt; return a description and audit stats."""
    import bpy

    materials = list(low.data.materials) if low.type == 'MESH' else []
    if (low.type != 'MESH' or len(materials) != 1 or materials[0] is None
            or 'BedQuilt' not in materials[0].name or low.name.startswith('BS')):
        raise ValueError('ApplyCottonWeave accepts only the single-material baked Quilt')
    mesh = low.data
    color = mesh.color_attributes.get('BR_original_low_frequency_color')
    if color is None or color.domain != 'CORNER' or color.data_type != 'FLOAT_COLOR':
        raise ValueError('Quilt must have the explicit FLOAT_COLOR CORNER export layer')
    if not mesh.uv_layers or mesh.uv_layers[0].name != 'UVMap':
        raise ValueError('The authored Normal UVMap must remain the first UV layer')
    uv0 = np.empty((len(mesh.loops), 2), dtype=np.float32)
    mesh.uv_layers[0].data.foreach_get('uv', uv0.ravel())
    uv1 = mesh.uv_layers.get('UVMap.001')
    if uv1 is None:
        uv1 = mesh.uv_layers.new(name='UVMap.001')
    if mesh.uv_layers[1].name != 'UVMap.001':
        raise ValueError('The cotton weave needs UVMap.001 as the second UV layer')
    oldUv1 = np.empty_like(uv0)
    uv1.data.foreach_get('uv', oldUv1.ravel())
    sourceFile = Path(bsRoot) / 'BS_fiber_bundle_Base_1024.png'
    sourcePixels = ReadRgbPng(sourceFile)
    if sourcePixels.shape != (1024, 1024, 3):
        raise ValueError('Expected the existing 1024 x 1024 BS yarn image')
    normalized, textureStats = NormalizeWeave(sourcePixels)
    payload = EncodeRgbPng(normalized)
    textureFile = Path(textureRoot) / 'Texture_BedQuiltCottonWeave.png'
    textureFile.parent.mkdir(parents=True, exist_ok=True)
    textureFile.write_bytes(payload)
    if not np.array_equal(ReadRgbPng(textureFile), normalized):
        raise ValueError('Cotton PNG round-trip did not preserve its RGB pixels')
    # A private authoring backup makes repeated calls safe. The exporter still
    # explicitly exports BR_original_low_frequency_color only, as COLOR_0.
    backup = mesh.color_attributes.get('CottonSourceLowFrequencyColor')
    if backup is None:
        backup = mesh.color_attributes.new(name='CottonSourceLowFrequencyColor', type='FLOAT_COLOR', domain='CORNER')
        initial = np.empty((len(mesh.loops), 4), dtype=np.float32)
        color.data.foreach_get('color', initial.ravel())
        backup.data.foreach_set('color', initial.ravel())
    baseline = np.empty((len(mesh.loops), 4), dtype=np.float32)
    backup.data.foreach_get('color', baseline.ravel())
    compensated = baseline.copy()
    unclipped = baseline[:, :3] / np.asarray(textureStats['actualLinearMean'])[None, :]
    compensated[:, :3] = np.clip(unclipped, 0, 1)
    color.data.foreach_set('color', compensated.ravel())
    mesh.color_attributes.active_color = color
    points = np.empty((len(mesh.vertices), 3), dtype=np.float32)
    mesh.vertices.foreach_get('co', points.ravel())
    matrix = np.asarray(low.matrix_world, dtype=np.float64)
    world = points @ matrix[:3, :3].T + matrix[:3, 3]
    loopVertices = np.empty(len(mesh.loops), dtype=np.int32)
    mesh.loops.foreach_get('vertex_index', loopVertices)
    mesh.calc_loop_triangles()
    faces = np.asarray([triangle.vertices[:] for triangle in mesh.loop_triangles], dtype=np.int32)
    triangleLoops = np.asarray([triangle.loops[:] for triangle in mesh.loop_triangles], dtype=np.int32)
    physical, mappingStats = PhysicalUv(world)
    mappedLoops = physical[loopVertices]
    uv1.data.foreach_set('uv', mappedLoops.ravel())
    uv0After = np.empty_like(uv0)
    mesh.uv_layers[0].data.foreach_get('uv', uv0After.ravel())
    if not np.array_equal(uv0, uv0After):
        raise ValueError('The authored Normal UV0 changed')
    # Copy the Quilt material so no material consumer, especially BS, is edited.
    material = materials[0].copy()
    material.name = 'Material_BedQuiltCotton'
    mesh.materials[0] = material
    nodes, links = material.node_tree.nodes, material.node_tree.links
    for node in list(nodes):
        if node.name.startswith('PatchedCotton'):
            nodes.remove(node)
    principled = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
    normalLinks = [(link.from_node.name, link.from_socket.identifier) for link in principled.inputs['Normal'].links]
    image = bpy.data.images.load(str(textureFile), check_existing=False)
    image.name = 'Texture_BedQuiltCottonWeave'
    image.colorspace_settings.name = 'sRGB'
    image.pack()
    uvNode = nodes.new('ShaderNodeUVMap')
    uvNode.name = 'PatchedCottonPhysicalUv'
    uvNode.uv_map = 'UVMap.001'
    imageNode = nodes.new('ShaderNodeTexImage')
    imageNode.name = 'PatchedCottonWeaveImage'
    imageNode.image = image
    imageNode.extension = 'REPEAT'
    imageNode.interpolation = 'Linear'
    colorNode = nodes.new('ShaderNodeVertexColor')
    colorNode.name = 'PatchedCottonLowFrequencyColor'
    colorNode.layer_name = color.name
    # Blender 5.2 glTF search_node_tree.get_multiply_factors explicitly detects
    # ShaderNodeMix RGBA/MULTIPLY with Factor=1; legacy MixRGB is not used.
    multiply = nodes.new('ShaderNodeMix')
    multiply.name = 'PatchedCottonNativeMultiply'
    multiply.data_type = 'RGBA'
    multiply.blend_type = 'MULTIPLY'
    multiply.clamp_result = False
    multiply.inputs[0].default_value = 1
    inputA = next(socket for socket in multiply.inputs if socket.identifier == 'A_Color')
    inputB = next(socket for socket in multiply.inputs if socket.identifier == 'B_Color')
    output = next(socket for socket in multiply.outputs if socket.type == 'RGBA')
    links.new(uvNode.outputs['UV'], imageNode.inputs['Vector'])
    links.new(imageNode.outputs['Color'], inputA)
    links.new(colorNode.outputs['Color'], inputB)
    links.new(output, principled.inputs['Base Color'])
    if normalLinks != [(link.from_node.name, link.from_socket.identifier) for link in principled.inputs['Normal'].links]:
        raise ValueError('The authored Normal connection changed')
    mesh.update()
    return {'description': 'Quilt low-frequency CORNER COLOR_0 with mean-compensated existing BS yarn BaseColor; native glTF Image x Color Attribute, authored Normal UV0 retained.',
            'stats': {'sourceFile': str(sourceFile), 'sourceSha256': Hash(sourceFile.read_bytes()),
                      'textureFile': str(textureFile), 'textureSha256': Hash(payload), 'textureBytes': len(payload),
                      'textureDimensions': [1024, 1024], **textureStats, **mappingStats,
                      'oldUv1': UvStats(world, faces, oldUv1[triangleLoops]),
                      'physicalUv1': UvStats(world, faces, mappedLoops[triangleLoops]),
                      'normalUv0Sha256': Hash(uv0.tobytes()), 'normalUv0Unchanged': True,
                      'colorClippedFraction': float((unclipped > 1).mean()),
                      'baselineLinearColorMean': baseline[:, :3].mean(axis=0).tolist(),
                      'compensatedLinearColorMean': compensated[:, :3].mean(axis=0).tolist(),
                      'normalGraphUnchanged': True, 'geometryUnchanged': True, 'bsFootMaterialUnchanged': True}}
