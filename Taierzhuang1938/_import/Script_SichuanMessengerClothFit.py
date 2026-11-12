"""Build calf wrapping and fit the cap contact band to the skull."""
import math
import numpy as np
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform


def LocalPoints(obj):
    return np.array([vertex.co[:] for vertex in obj.data.vertices])


def WorldPoints(obj):
    return np.array([(obj.matrix_world @ vertex.co)[:] for vertex in obj.data.vertices])


def BuildCalfWrap(foot, body, assembly):
    bodyPoints = WorldPoints(body)
    mirror = Matrix.Diagonal((1.0, -1.0, 1.0, 1.0))
    footWorld = WorldPoints(foot)
    topPoints = footWorld[footWorld[:, 2] > footWorld[:, 2].max() - 0.02]
    baseCenter = (topPoints.min(0) + topPoints.max(0)) / 2
    baseRadii = (topPoints.max(0) - topPoints.min(0))[:2] / 2 + 0.0008
    leg = bodyPoints[(bodyPoints[:, 1] > 0) & (bodyPoints[:, 2] < bodyPoints[:, 2].min() + 0.025)]
    legCenter = (leg.min(0) + leg.max(0)) / 2
    baseZ = footWorld[:, 2].max() - 0.020
    topZ = bodyPoints[:, 2].min() + 0.035
    topRadii = np.minimum((leg.max(0) - leg.min(0))[:2] / 2 - 0.007, np.array([0.050, 0.052]))
    topRadii = np.maximum(topRadii, baseRadii)

    footMaterial = foot.data.materials[0]
    baseNode = next(node for node in footMaterial.node_tree.nodes if node.type == 'TEX_IMAGE')
    sourceImage = baseNode.image
    imagePixels = np.empty(sourceImage.size[0] * sourceImage.size[1] * 4, dtype=np.float32)
    sourceImage.pixels.foreach_get(imagePixels)
    imagePixels = imagePixels.reshape(sourceImage.size[1], sourceImage.size[0], 4)
    sourceFoot = LocalPoints(foot)
    uv = foot.data.uv_layers.active
    colorSamples = []
    for face in foot.data.polygons:
        if np.mean(sourceFoot[list(face.vertices), 2]) > 0.50:
            for loop in face.loop_indices:
                coordinate = uv.data[loop].uv
                x = int(coordinate.x * (sourceImage.size[0] - 1)) % sourceImage.size[0]
                y = int(coordinate.y * (sourceImage.size[1] - 1)) % sourceImage.size[1]
                colorSamples.append(imagePixels[y, x, :3])
    clothColor = np.median(np.array(colorSamples), axis=0)
    size = 512
    gridY, gridX = np.mgrid[0:size, 0:size]
    weave = 0.016 * np.sin(math.tau * gridX / 4) * np.sin(math.tau * gridY / 4)
    clothPixels = np.ones((size, size, 4), dtype=np.float32)
    clothPixels[:, :, :3] = clothColor
    foot.data.calc_loop_triangles()
    footTriangles = list(foot.data.loop_triangles)
    footBvh = BVHTree.FromPolygons([Vector(point) for point in sourceFoot], [tuple(triangle.vertices) for triangle in footTriangles], all_triangles=True)
    sampledPixels = 0
    for row in range(size):
        sourceZ = 0.76 - 0.30 * row / (size - 1)
        section = sourceFoot[np.abs(sourceFoot[:, 2] - sourceZ) < 0.03]
        sectionCenter = (section.min(0) + section.max(0)) / 2
        for column in range(size):
            angle = math.tau * column / size
            direction = Vector((math.cos(angle), math.sin(angle), 0))
            origin = Vector((sectionCenter[0], sectionCenter[1], sourceZ)) + direction
            location, normal, triangleIndex, distance = footBvh.ray_cast(origin, -direction, 1.5)
            if location is None:
                continue
            triangle = footTriangles[triangleIndex]
            trianglePoints = [Vector(sourceFoot[index]) for index in triangle.vertices]
            triangleUv = [Vector((uv.data[index].uv.x, uv.data[index].uv.y, 0)) for index in triangle.loops]
            sampleUv = barycentric_transform(location, *trianglePoints, *triangleUv)
            x = min(sourceImage.size[0] - 1, max(0, int(sampleUv.x * (sourceImage.size[0] - 1))))
            y = min(sourceImage.size[1] - 1, max(0, int(sampleUv.y * (sourceImage.size[1] - 1))))
            clothPixels[row, column, :3] = imagePixels[y, x, :3]
            sampledPixels += 1
    clothColor = np.median(clothPixels[:, :, :3].reshape(-1, 3), axis=0)
    clothImage = bpy.data.images.new('Texture_SichuanMessenger_CalfWrap_BaseColor', width=size, height=size, alpha=True)
    clothImage.colorspace_settings.name = sourceImage.colorspace_settings.name
    clothImage.pixels.foreach_set(clothPixels.ravel())
    clothImage.pack()
    clothMaterial = bpy.data.materials.new('Material_SichuanMessenger_CalfWrap')
    clothMaterial.use_nodes = True
    shader = clothMaterial.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = 0.96
    texture = clothMaterial.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = clothImage
    clothMaterial.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    normalHeight = weave
    gradientY, gradientX = np.gradient(normalHeight)
    normalPixels = np.ones((size, size, 4), dtype=np.float32)
    normalVectors = np.dstack([-gradientX * 9, -gradientY * 9, np.ones((size, size))])
    normalVectors /= np.linalg.norm(normalVectors, axis=2, keepdims=True)
    normalPixels[:, :, :3] = normalVectors * 0.5 + 0.5
    normalImage = bpy.data.images.new('Texture_SichuanMessenger_CalfWrap_Normal', width=size, height=size, alpha=True)
    normalImage.colorspace_settings.name = 'Non-Color'
    normalImage.pixels.foreach_set(normalPixels.ravel())
    normalImage.pack()
    normalTexture = clothMaterial.node_tree.nodes.new('ShaderNodeTexImage')
    normalTexture.image = normalImage
    normalMap = clothMaterial.node_tree.nodes.new('ShaderNodeNormalMap')
    normalMap.inputs['Strength'].default_value = 0.45
    clothMaterial.node_tree.links.new(normalTexture.outputs['Color'], normalMap.inputs['Color'])
    clothMaterial.node_tree.links.new(normalMap.outputs['Normal'], shader.inputs['Normal'])

    angularSteps = 96
    bandPitch = 0.027
    bandWidth = 0.033
    turnCount = (topZ - baseZ + bandWidth) / bandPitch + 1
    longitudinalSteps = int(math.ceil(turnCount * angularSteps))
    acrossSteps = 6
    points = []
    coordinates = []
    for row in range(longitudinalSteps + 1):
        angle = math.tau * (row / angularSteps - 0.5)
        centerZ = baseZ + bandPitch * angle / math.tau
        for column in range(acrossSteps + 1):
            across = column / acrossSteps
            z = np.clip(centerZ + (across - 0.5) * bandWidth, baseZ, topZ)
            fraction = (z - baseZ) / (topZ - baseZ)
            center = baseCenter[:2] * (1 - fraction) + legCenter[:2] * fraction
            radii = baseRadii * (1 - fraction) + topRadii * fraction + 0.003 * math.sin(math.pi * fraction) ** 2
            lip = 0.0003 + 0.0010 * (1 - across) ** 4
            points.append((center[0] + (radii[0] + lip) * math.cos(angle),
                           center[1] + (radii[1] + lip) * math.sin(angle), float(z)))
            coordinates.append((angle / math.tau, (float(z) - baseZ) / 0.085))
    faces = []
    for row in range(longitudinalSteps):
        for column in range(acrossSteps):
            first = row * (acrossSteps + 1) + column
            face = (first, first + acrossSteps + 1, first + acrossSteps + 2, first + 1)
            heights = [points[index][2] for index in face]
            if max(heights) - min(heights) > 1e-7:
                faces.append(face)
    wrapMesh = bpy.data.meshes.new('Mesh_SichuanMessenger_CalfWrap')
    wrapMesh.from_pydata(points, [], faces)
    wrapMesh.materials.append(clothMaterial)
    wrapUv = wrapMesh.uv_layers.new(name='UVMap')
    for face in wrapMesh.polygons:
        face.use_smooth = True
        for loop in face.loop_indices:
            wrapUv.data[loop].uv = coordinates[wrapMesh.loops[loop].vertex_index]
    wrap = bpy.data.objects.new('Part_CalfWrap_L', wrapMesh)
    assembly.objects.link(wrap)
    rightWrap = wrap.copy()
    rightWrap.name = 'Part_CalfWrap_R'
    assembly.objects.link(rightWrap)
    rightWrap.matrix_world = mirror

    report = {'baseZ': baseZ, 'topZ': topZ, 'color': clothColor.tolist(),
              'textureBakeCoverage': sampledPixels / (size * size),
              'trianglesPerSide': sum(len(face.vertices) - 2 for face in wrap.data.polygons)}
    assert report['textureBakeCoverage'] > 0.99
    return wrap, rightWrap, report


def FitCapBand(cap, head):
    headWorld = WorldPoints(head)
    headBvh = BVHTree.FromPolygons([Vector(point) for point in headWorld], [tuple(face.vertices) for face in head.data.polygons])
    cap.location.z -= max(WorldPoints(cap)[:, 2]) - 1.75
    capSourcePoints = LocalPoints(cap)
    capSourceNormals = np.array([normal.vector[:] for normal in cap.data.corner_normals])
    cap.data.calc_loop_triangles()
    capSourceTriangles = [tuple(triangle.vertices) for triangle in cap.data.loop_triangles]
    capSourceNormalTriangles = [capSourceNormals[list(triangle.loops)].copy() for triangle in cap.data.loop_triangles]
    capSourceBvh = BVHTree.FromPolygons([Vector(point) for point in capSourcePoints], capSourceTriangles, all_triangles=True)
    bpy.ops.object.select_all(action='DESELECT')
    cap.select_set(True)
    bpy.context.view_layer.objects.active = cap
    subdivision = cap.modifiers.new('RefineBandContact', 'SUBSURF')
    subdivision.subdivision_type = 'SIMPLE'
    subdivision.levels = 2
    subdivision.render_levels = 2
    subdivision.uv_smooth = 'NONE'
    bpy.ops.object.modifier_apply(modifier=subdivision.name)
    capOriginalLocal = LocalPoints(cap)
    capOriginalWorld = WorldPoints(cap)
    unique, inverse = np.unique(np.round(capOriginalWorld, 6), axis=0, return_inverse=True)
    rawUnique = np.zeros_like(unique)
    counts = np.bincount(inverse)
    for axis in range(3):
        rawUnique[:, axis] = np.bincount(inverse, weights=capOriginalLocal[:, axis]) / counts
    cap.data.calc_loop_triangles()
    triangles = inverse[np.array([triangle.vertices[:] for triangle in cap.data.loop_triangles])]
    newPoints = unique.copy()
    for iteration in range(3):
        fitBvh = BVHTree.FromPolygons([Vector(point) for point in newPoints], triangles.tolist(), all_triangles=True)
        displacement = np.zeros(len(newPoints))
        for index, point in enumerate(newPoints):
            if point[0] > 0.03 or point[2] > 1.65:
                continue
            origin = Vector((-1.0, float(point[1]), float(point[2])))
            direction = Vector((1, 0, 0))
            capHit = fitBvh.ray_cast(origin, direction, 2.0)[0]
            headHit = headBvh.ray_cast(origin, direction, 2.0)[0]
            if capHit is None or headHit is None:
                continue
            needed = max(0.0, capHit.x - headHit.x + 0.0025)
            posterior = np.clip((0.03 - point[0]) / 0.06, 0, 1)
            upper = np.clip((1.65 - point[2]) / 0.02, 0, 1)
            displacement[index] = needed * posterior * upper
        newPoints[:, 0] -= displacement
    capMatrixInverse = cap.matrix_world.inverted()
    localPoints = np.array([(capMatrixInverse @ Vector(point))[:] for point in newPoints[inverse]])
    cap.data.vertices.foreach_set('co', localPoints.ravel())
    cap.data.update()
    # Rebuild smooth normals across positional UV seams in the repaired band.
    normalMesh = bpy.data.meshes.new('TemporaryCapNormals')
    normalMesh.from_pydata(newPoints.tolist(), [], [inverse[list(face.vertices)].tolist() for face in cap.data.polygons])
    normalMesh.update()
    worldNormals = np.array([vertex.normal[:] for vertex in normalMesh.vertices])
    originalNormals = np.array([normal.vector[:] for normal in cap.data.corner_normals])
    for loopIndex, loop in enumerate(cap.data.loops):
        point = Vector(capOriginalLocal[loop.vertex_index])
        nearest, normal, triangleIndex, distance = capSourceBvh.find_nearest(point)
        triangle = capSourceTriangles[triangleIndex]
        originalNormals[loopIndex] = barycentric_transform(nearest,
            *[Vector(capSourcePoints[index]) for index in triangle],
            *[Vector(value) for value in capSourceNormalTriangles[triangleIndex]])
    originalNormals /= np.linalg.norm(originalNormals, axis=1, keepdims=True).clip(1e-9)
    linear = np.array(cap.matrix_world.to_3x3())
    repairedNormals = []
    for loopIndex, loop in enumerate(cap.data.loops):
        uniqueIndex = inverse[loop.vertex_index]
        if np.linalg.norm(newPoints[uniqueIndex] - unique[uniqueIndex]) > 0.00005:
            normal = worldNormals[uniqueIndex] @ linear
            normal /= max(np.linalg.norm(normal), 1e-9)
            repairedNormals.append(normal)
        else:
            repairedNormals.append(originalNormals[loopIndex])
    cap.data.normals_split_custom_set(repairedNormals)
    bpy.data.meshes.remove(normalMesh)
    capDisplacement = np.linalg.norm(newPoints - unique, axis=1)
    report = {'maximumBandFitMeters': float(capDisplacement.max()),
              'changedVertexCount': int((capDisplacement > 0.0001).sum()),
              'crownMaximumShiftMeters': float(capDisplacement[rawUnique[:, 2] > 0.55].max()),
              'visorMaximumShiftMeters': float(capDisplacement[rawUnique[:, 0] > 0.25].max())}
    finalBvh = BVHTree.FromPolygons([Vector(point) for point in newPoints], triangles.tolist(), all_triangles=True)
    penetrations = []
    for y in np.linspace(-0.06, 0.06, 7):
        for z in np.linspace(1.59, 1.66, 15):
            origin = Vector((-1, float(y), float(z)))
            capHit = finalBvh.ray_cast(origin, Vector((1, 0, 0)), 2)[0]
            headHit = headBvh.ray_cast(origin, Vector((1, 0, 0)), 2)[0]
            if capHit is not None and headHit is not None and capHit.x < 0.03:
                penetrations.append(capHit.x - headHit.x)
    report['rearMaximumPenetrationMeters'] = max(penetrations)
    assert report['crownMaximumShiftMeters'] < 1e-8
    assert report['visorMaximumShiftMeters'] < 1e-8
    assert report['rearMaximumPenetrationMeters'] < 0.001
    return report
