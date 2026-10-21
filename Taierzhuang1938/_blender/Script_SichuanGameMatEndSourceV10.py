"""Bind an authored winding image to independent high-only mat end sources.

The game cap is never subdivided or displaced. Its two real 24-point outlines
are copied and uniformly subdivided for a separate bake carrier, then given a
sub-millimetre luminance relief. Original sculpt meshes and shaders are never
changed. Importing this module performs no scene operations.
"""
import array
import hashlib
import math
from pathlib import Path

import bpy
from mathutils import Vector


generator = 'SichuanGameMatEndImageSourceV10'
sourceName = 'Pack_MatEndImageSourceV10'
objectName = 'High_' + sourceName
imageRelativePath = ('Taierzhuang1938/_import/SichuanBlanketPack/Source/MatEndV12/'
                     'Texture_SichuanMatEndBaseV12.png')


def TriangleCount(mesh):
    return sum(len(polygon.vertices) - 2 for polygon in mesh.polygons)


def LowDigest(mesh):
    """Include geometry and every UV layer in the unchanged-low evidence."""
    digest = hashlib.sha256()
    positions = array.array('f', [0.0]) * (len(mesh.vertices) * 3)
    mesh.vertices.foreach_get('co', positions)
    digest.update(positions.tobytes())
    for face in mesh.polygons:
        digest.update(array.array('i', [len(face.vertices), *face.vertices]).tobytes())
    uvHashes = {}
    for layer in mesh.uv_layers:
        values = array.array('f', [0.0]) * (len(layer.data) * 2)
        layer.data.foreach_get('uv', values)
        raw = values.tobytes()
        uvHashes[layer.name] = hashlib.sha256(raw).hexdigest()
        digest.update(layer.name.encode('utf-8'))
        digest.update(raw)
    return digest.hexdigest(), uvHashes


def MeshComponents(mesh):
    adjacency = [set() for vertex in mesh.vertices]
    for polygon in mesh.polygons:
        ids = list(polygon.vertices)
        for a, b in zip(ids, ids[1:] + ids[:1]):
            adjacency[a].add(b)
            adjacency[b].add(a)
    remaining = set(range(len(mesh.vertices)))
    result = []
    while remaining:
        first = remaining.pop()
        component, queue = [first], [first]
        while queue:
            vertex = queue.pop()
            for other in adjacency[vertex]:
                if other in remaining:
                    remaining.remove(other)
                    component.append(other)
                    queue.append(other)
        result.append(sorted(component))
    return result


def SubdivideTriangles(points, faces, levels):
    """Shared real edge midpoints; every descendant remains in the cap."""
    points = [point.copy() for point in points]
    faces = list(faces)
    for level in range(levels):
        midpoints, refined = {}, []

        def Midpoint(a, b):
            key = tuple(sorted((a, b)))
            if key not in midpoints:
                midpoints[key] = len(points)
                points.append((points[a] + points[b]) * .5)
            return midpoints[key]

        for a, b, c in faces:
            ab, bc, ca = Midpoint(a, b), Midpoint(b, c), Midpoint(c, a)
            refined.extend(((a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)))
        faces = refined
    return points, faces


def LuminanceSampler(image):
    """Read source pixels; smooth only the geometric-height lookup in memory.

    The packed colour image and its pixels are not edited. A nine-by-nine
    source-pixel average suppresses fibre-scale height spikes before the
    physical displacement is sampled bilinearly.
    """
    import numpy as np
    width, height = image.size
    channels = image.channels
    values = np.empty(width * height * channels, dtype=np.float32)
    image.pixels.foreach_get(values)
    rgb = values.reshape((height, width, channels))[:, :, :3]
    luminance = rgb[:, :, 0] * .2126 + rgb[:, :, 1] * .7152 + rgb[:, :, 2] * .0722
    radius = 4
    padded = np.pad(luminance, ((radius, radius), (radius, radius)), mode='edge')
    integral = np.pad(padded, ((1, 0), (1, 0)), mode='constant').cumsum(0, dtype=np.float64).cumsum(1)
    size = radius * 2 + 1
    smoothed = ((integral[size:, size:] - integral[:-size, size:]
                 - integral[size:, :-size] + integral[:-size, :-size]) / (size * size))

    def Sample(u, v):
        x = max(0.0, min(width - 1.0, u * (width - 1)))
        y = max(0.0, min(height - 1.0, v * (height - 1)))
        a, b = int(x), int(y)
        c, d = min(a + 1, width - 1), min(b + 1, height - 1)
        tx, ty = x - a, y - b
        return float((smoothed[b, a] * (1 - tx) + smoothed[b, c] * tx) * (1 - ty)
                     + (smoothed[d, a] * (1 - tx) + smoothed[d, c] * tx) * ty)

    return Sample, {'method': 'Source pixel RGB luminance, nine-by-nine box mean, bilinear height lookup',
                    'colourPixelsModified': False, 'heightLookupRadiusPixels': radius,
                    'sourceDecodedLuminanceRange': [float(luminance.min()), float(luminance.max())],
                    'geometryLuminanceRange': [float(smoothed.min()), float(smoothed.max())]}


def CarrierMaterial(image):
    name = 'Material_HighMatEndImageSourceV10'
    material = bpy.data.materials.get(name)
    if material is not None and material.get('MatEndSourceGenerator') != generator:
        raise RuntimeError('Mat end material name is already owned by another asset')
    if material is None:
        material = bpy.data.materials.new(name)
    material.use_nodes = True
    material['MatEndSourceGenerator'] = generator
    material['AtlasRegion'] = 'straw'
    material['BakeOnly'] = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    shader = nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Roughness'].default_value = .96
    shader.inputs['Metallic'].default_value = 0.0
    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'sourceUV'
    texture = nodes.new('ShaderNodeTexImage')
    texture.name = 'AuthoredWindingBaseColour'
    texture.image = image
    texture.interpolation = 'Linear'
    texture.extension = 'EXTEND'
    links.new(uv.outputs['UV'], texture.inputs['Vector'])
    # The reference image contains near-black occlusion in the inner slit.
    # Dry straw still reflects a little brown light: keep a small physical
    # albedo floor in the source shader rather than pure black base colour.
    floor=nodes.new('ShaderNodeVectorMath')
    floor.operation='MAXIMUM'
    floor.name='DryStrawMinimumBrownReflectance'
    floor.inputs[1].default_value=(.002,.0013,.0007)
    links.new(texture.outputs['Color'],floor.inputs[0])
    links.new(floor.outputs['Vector'], shader.inputs['Base Color'])
    links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    return material


def ApplyMatEndImageSource(highRoot, gameRoot, repo, subdivisionLevels=6,
                          outwardOffsetM=.00025, microDisplacementM=.000225,
                          fallbackOffsetM=.00008):
    """Create one high-only carrier for both real caps and update source refs."""
    if highRoot is None or gameRoot is None or gameRoot.name != 'Pack_Root':
        raise RuntimeError('Pass this task\'s actual high root and Pack_Root')
    if not 4 <= subdivisionLevels <= 6:
        raise RuntimeError('Use four through six subdivisions of the actual cap triangles')
    if not .00015 <= microDisplacementM <= .00030:
        raise RuntimeError('Mat end geometric relief amplitude must stay between .15 and .30 mm')
    if not 0 < fallbackOffsetM < outwardOffsetM - microDisplacementM * .5:
        raise RuntimeError('The planar fallback must remain below the displaced source and outside the game cap')
    repo = Path(repo).resolve()
    imagePath = repo / imageRelativePath
    if not imagePath.is_file():
        raise RuntimeError('The authored mat winding source image is missing: ' + str(imagePath))
    imageHash = hashlib.sha256(imagePath.read_bytes()).hexdigest()
    gameParts = [obj for obj in gameRoot.children if obj.name == 'Pack_StrawMat']
    highParts = [obj for obj in highRoot.children
                 if obj.name == 'High_Pack_StrawMat' or obj.get('PackSourceName') == 'Pack_StrawMat']
    if len(gameParts) != 1 or len(highParts) != 1:
        raise RuntimeError('The actual separate high/game straw-mat parts are required')
    gamePart, highPart = gameParts[0], highParts[0]
    caps = [obj for obj in gamePart.children_recursive
            if obj.type == 'MESH' and obj.name == 'Pack_GameRolledMatEndCapsV10']
    if len(caps) != 1 or caps[0].modifiers:
        raise RuntimeError('Expected the actual frozen, two-ended game mat cap')
    low = caps[0]
    beforeTriangles = TriangleCount(low.data)
    beforeHash, beforeUvs = LowDigest(low.data)
    if beforeTriangles != 44 or len(low.data.vertices) != 48:
        raise RuntimeError('This image carrier requires the accepted two 24-point / 44-triangle caps')
    components = MeshComponents(low.data)
    if len(components) != 2 or any(len(component) != 24 for component in components):
        raise RuntimeError('The actual low cap no longer has two separate 24-vertex ends')
    intoGamePart = gamePart.matrix_world.inverted_safe() @ low.matrix_world
    intoHighPart = highPart.matrix_world.inverted_safe() @ gamePart.matrix_world
    lowPoints = [intoGamePart @ vertex.co for vertex in low.data.vertices]
    components.sort(key=lambda component: sum(lowPoints[index].x for index in component) / len(component))
    if abs(sum(lowPoints[index].x for index in components[1]) / 24
           - sum(lowPoints[index].x for index in components[0]) / 24) < .20:
        raise RuntimeError('Mat ends do not occupy the two actual axial endpoint planes')
    # Load a fresh ID so a newly authored PNG cannot silently reuse stale pixels.
    image = bpy.data.images.load(str(imagePath), check_existing=False)
    image.name = 'Texture_SichuanMatEndImageSourceV12'
    if tuple(image.size) != (1024, 1024):
        bpy.data.images.remove(image)
        raise RuntimeError('The authored winding base source must be exactly 1024 square')
    image.colorspace_settings.name = 'sRGB'
    image['MatEndSourceGenerator'] = generator
    image['SourceFileSha256'] = imageHash
    image.use_fake_user = True
    image.pack()
    sample, luminanceReport = LuminanceSampler(image)
    positions, faces, uvs, reports = [], [], [], []
    for sign, component in zip((-1, 1), components):
        selected = set(component)
        remap = {old: new for new, old in enumerate(component)}
        points = [lowPoints[index].copy() for index in component]
        plane = sum(point.x for point in points) / len(points)
        planarity = max(abs(point.x - plane) for point in points)
        if planarity > 1e-6:
            raise RuntimeError('The actual mat cap is not planar in the mat part frame')
        capFaces = [tuple(remap[index] for index in polygon.vertices) for polygon in low.data.polygons
                    if all(index in selected for index in polygon.vertices)]
        if len(capFaces) != 22 or any(len(face) != 3 for face in capFaces):
            raise RuntimeError('Each actual cap must retain exactly its original 22 triangles')
        if any((points[b] - points[a]).cross(points[c] - points[a]).x * sign <= 0
               for a, b, c in capFaces):
            raise RuntimeError('The actual mat cap does not face its outward axial direction')
        yMin, yMax = min(point.y for point in points), max(point.y for point in points)
        zMin, zMax = min(point.z for point in points), max(point.z for point in points)
        if yMax - yMin < .02 or zMax - zMin < .02:
            raise RuntimeError('The actual mat end bounds are too small for the winding image')

        def Uv(point):
            u = (point.y - yMin) / (yMax - yMin)
            return (1 - u if sign < 0 else u, (point.z - zMin) / (zMax - zMin))

        densePoints, denseFaces = SubdivideTriangles(points, capFaces, subdivisionLevels)
        first = len(positions)
        heights = []
        for point in densePoints:
            uv = Uv(point)
            # Raw colour remains in the authored image. Only a shallow high
            # source relief is derived; it never alters the 44 runtime faces.
            relief = microDisplacementM * (max(0.0, min(1.0, sample(*uv))) - .5)
            height = outwardOffsetM + relief
            displaced = point.copy()
            displaced.x = plane + sign * height
            positions.append(intoHighPart @ displaced)
            uvs.append(uv)
            heights.append(height)
        faces.extend(tuple(first + index for index in face) for face in denseFaces)
        # Exact same footprint and UVs. This independent, shallow flat underlay
        # remains available to source projection at every real outline edge.
        fallbackFirst = len(positions)
        for point in points:
            flat = point.copy()
            flat.x = plane + sign * fallbackOffsetM
            positions.append(intoHighPart @ flat)
            uvs.append(Uv(point))
        faces.extend(tuple(fallbackFirst + index for index in face) for face in capFaces)
        reports.append({'end': sign, 'sourceLowOutlineVertices': 24,
                        'sourceLowTriangles': len(capFaces), 'subdivisionLevels': subdivisionLevels,
                        'denseVertices': len(densePoints), 'denseTriangles': len(denseFaces),
                        'fallbackVertices': len(points), 'fallbackTriangles': len(capFaces),
                        'actualMatPartPlaneXM': plane, 'maximumActualLowPlanarityErrorM': planarity,
                        'imageBoundsInActualMatPartM': {'y': [yMin, yMax], 'z': [zMin, zMax]},
                        'imageUvBounds': [[0.0, 0.0], [1.0, 1.0]], 'imageUMirrored': sign < 0,
                        'mapping': 'U from true cap local Y bounds; V from true cap local Z bounds',
                        'displacedSourceOutwardRangeM': [min(heights), max(heights)],
                        'fallbackOutwardOffsetM': fallbackOffsetM,
                        'sourceOutlineFootprintMatchesActualLow': True})
    if LowDigest(low.data) != (beforeHash, beforeUvs) or TriangleCount(low.data) != beforeTriangles:
        raise RuntimeError('Mat end carrier construction modified the game cap')
    # Only remove this helper's prior bake geometry, never any original sculpt.
    for previous in list(highPart.children_recursive):
        if previous.get('MatEndSourceGenerator') != generator:
            continue
        oldMesh = previous.data if previous.type == 'MESH' else None
        bpy.data.objects.remove(previous, do_unlink=True)
        if oldMesh is not None and oldMesh.users == 0:
            bpy.data.meshes.remove(oldMesh)
    if bpy.data.objects.get(objectName) is not None:
        raise RuntimeError('Mat end source object name is already owned by another asset')
    mesh = bpy.data.meshes.new('Geometry_HighMatEndImageSourceV10')
    mesh.from_pydata(positions, [], faces)
    mesh.update()
    mesh.materials.append(CarrierMaterial(image))
    layer = mesh.uv_layers.new(name='sourceUV')
    for loop in mesh.loops:
        layer.data[loop.index].uv = uvs[loop.vertex_index]
    mesh.uv_layers.active = layer
    layer.active_render = True
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    carrier = bpy.data.objects.new(objectName, mesh)
    bpy.context.scene.collection.objects.link(carrier)
    carrier.parent = highPart
    carrier['MatEndSourceGenerator'] = generator
    carrier['PackSourceName'] = sourceName
    carrier['BakeOnly'] = True
    carrier['ImageSourcePath'] = str(imagePath)
    carrier['ImageSourceSha256'] = imageHash
    carrier['SourceActualGameObject'] = low.name
    carrier['SourceActualLowGeometrySha256'] = beforeHash
    carrier['ImageUvLayer'] = 'sourceUV'
    carrier['DisplacementPeakToPeakM'] = microDisplacementM
    carrier['OutwardSourceOffsetM'] = outwardOffsetM
    carrier['ExactFootprintFallbackOffsetM'] = fallbackOffsetM
    carrier.hide_render = True
    carrier.hide_set(True)
    low['SourceHighObject'] = carrier.name
    low['BakeSourceNames'] = sourceName
    low['MatEndImageSourceGenerator'] = generator
    low['MatEndImageSourceSha256'] = imageHash
    low['Construction'] = 'Unchanged actual 44-triangle cap; authored winding colour and shallow relief projected from an independent high-only carrier'
    afterHash, afterUvs = LowDigest(low.data)
    if afterHash != beforeHash or afterUvs != beforeUvs or TriangleCount(low.data) != beforeTriangles:
        raise RuntimeError('Mat end source assignment modified game geometry or UV attributes')
    sourceGeometryHash, sourceUvHashes = LowDigest(mesh)
    rebuildScript = repo / 'Taierzhuang1938/_blender/Script_SichuanGameMatEndSourceV10.py'
    return {'generator': generator, 'source': carrier.name, 'sourcePackName': sourceName,
            'sourceParent': highPart.name, 'target': low.name,
            'sourceMaterial': mesh.materials[0].name,
            'sourceGeometryAndUvsSha256': sourceGeometryHash, 'sourceUvLayerHashes': sourceUvHashes,
            'rebuildScript': str(rebuildScript),
            'rebuildScriptSha256': hashlib.sha256(rebuildScript.read_bytes()).hexdigest(),
            'imageSource': str(imagePath), 'imageSha256': imageHash, 'imageSize': list(image.size),
            'imagePacked': bool(image.packed_file), 'imageColourSpace': image.colorspace_settings.name,
            'imagePixelsEdited': False, 'albedoFloorLinear':[.002,.0013,.0007],
            'albedoFloorPurpose':'Positive dry-straw reflectance in image occlusion crevices; applied by the source material before all-channel projection',
            'luminanceGeometry': luminanceReport,
            'highCarrierVertices': len(mesh.vertices), 'highCarrierTriangles': TriangleCount(mesh),
            'lowTrianglesBefore': beforeTriangles, 'lowTrianglesAfter': TriangleCount(low.data),
            'lowGeometryAndUvsSha256Before': beforeHash, 'lowGeometryAndUvsSha256After': afterHash,
            'lowUvLayerHashesBefore': beforeUvs, 'lowUvLayerHashesAfter': afterUvs,
            'lowGeometryAndUvsUnchanged': True, 'originalHighSculptObjectsModified': False,
            'roughness': .96, 'metallic': 0.0, 'outwardOffsetM': outwardOffsetM,
            'microDisplacementPeakToPeakM': microDisplacementM,
            'fallbackOutwardOffsetM': fallbackOffsetM, 'ends': reports,
            'carrierUvLayer': 'sourceUV', 'targetSourceHighObject': low['SourceHighObject'],
            'targetBakeSourceNames': low['BakeSourceNames'],
            'exportedAsGameGeometry': False,
            'addGameBakeSupportsCompatible': True}


# Compact public alias for scripted Prepare integrations.
ApplyMatEndSource = ApplyMatEndImageSource
