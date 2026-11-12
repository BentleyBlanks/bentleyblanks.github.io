"""Build calf wrapping and fit the cap contact band to the skull."""
import math
import numpy as np
import bpy
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
from Script_SichuanMessengerReferenceFit import LoadReferenceProfiles, SmoothReferenceProfiles, PlaneIntersections


def LocalPoints(obj):
    return np.array([vertex.co[:] for vertex in obj.data.vertices])


def WorldPoints(obj):
    return np.array([(obj.matrix_world @ vertex.co)[:] for vertex in obj.data.vertices])


def TrimSourcePart(obj, minimumWorldZ=None, maximumWorldZ=None, halfWidth=None, minimumWorldX=None):
    originalPoints = LocalPoints(obj)
    originalNormals = np.array([normal.vector[:] for normal in obj.data.corner_normals])
    obj.data.calc_loop_triangles()
    triangles = [tuple(triangle.vertices) for triangle in obj.data.loop_triangles]
    normalTriangles = [originalNormals[list(triangle.loops)].copy() for triangle in obj.data.loop_triangles]
    sourceBvh = BVHTree.FromPolygons([Vector(point) for point in originalPoints], triangles, all_triangles=True)
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    planes = []
    if minimumWorldZ is not None:
        planes.append(((0, 0, minimumWorldZ), (0, 0, 1), True))
    if maximumWorldZ is not None:
        planes.append(((0, 0, maximumWorldZ), (0, 0, 1), False))
    if halfWidth is not None:
        planes.append(((0, halfWidth, 0), (0, 1, 0), False))
        planes.append(((0, -halfWidth, 0), (0, 1, 0), True))
    if minimumWorldX is not None:
        planes.append(((minimumWorldX, 0, 0), (1, 0, 0), True))
    for worldPoint, worldNormal, keepAbove in planes:
        planePoint = obj.matrix_world.inverted() @ Vector(worldPoint)
        planeNormal = (obj.matrix_world.to_3x3().transposed() @ Vector(worldNormal)).normalized()
        bmesh.ops.bisect_plane(mesh, geom=list(mesh.verts) + list(mesh.edges) + list(mesh.faces),
                              plane_co=planePoint, plane_no=planeNormal,
                              clear_inner=keepAbove, clear_outer=not keepAbove, dist=1e-7)
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.update()
    normals = []
    distances = []
    for loop in obj.data.loops:
        point = obj.data.vertices[loop.vertex_index].co
        nearest, normal, triangleIndex, distance = sourceBvh.find_nearest(point)
        triangle = triangles[triangleIndex]
        value = barycentric_transform(nearest,
            *[Vector(originalPoints[index]) for index in triangle],
            *[Vector(item) for item in normalTriangles[triangleIndex]])
        normals.append(value.normalized())
        distances.append(distance)
    obj.data.normals_split_custom_set(normals)
    scales = np.linalg.svd(np.array(obj.matrix_world.to_3x3()), compute_uv=False)
    error = float(max(distances) * scales.max())
    assert error < 1e-5
    assert scales.max() - scales.min() < 1e-6
    return {'minimumWorldZ': float(minimumWorldZ) if minimumWorldZ is not None else None,
            'maximumWorldZ': float(maximumWorldZ) if maximumWorldZ is not None else None,
            'halfWidth': halfWidth, 'minimumWorldX': minimumWorldX, 'sourceSurfaceMaximumErrorMeters': error,
            'uniformScale': float(scales.mean())}


def BuildCalfWrap(foot, body, assembly, textureSource, topZ):
    reference = LoadReferenceProfiles()
    profileT, profile = SmoothReferenceProfiles(reference)
    footWorld = WorldPoints(foot)
    bodyPoints = WorldPoints(body)
    mirror = Matrix.Diagonal((1.0, -1.0, 1.0, 1.0))
    section = footWorld[footWorld[:, 2] > footWorld[:, 2].max() - 0.010]
    footCenter = (section.min(0) + section.max(0)) / 2
    sockBaseZ = footWorld[:, 2].max() - 0.002
    ankleZ = 0.130
    baseZ = ankleZ - 0.004
    leg = bodyPoints[(bodyPoints[:, 1] > 0) & (bodyPoints[:, 2] < topZ + 0.035)]
    legCenter = (leg.min(0) + leg.max(0)) / 2
    pixelWorldSize = (topZ - ankleZ) / (reference['ankleRow'] - reference['kneeRow'])
    ankleCenter = footCenter[:2].copy()
    referenceCenterStart = profile[0, 2]

    def CalfSection(z):
        fraction = np.clip((z-ankleZ)/(topZ-ankleZ), 0, 1)
        frontWidth = np.interp(fraction, profileT, profile[:, 0]) * pixelWorldSize
        sideWidth = np.interp(fraction, profileT, profile[:, 1]) * pixelWorldSize
        sideCenter = np.interp(fraction, profileT, profile[:, 2])
        center = np.array([ankleCenter[0]-(sideCenter-referenceCenterStart)*pixelWorldSize,
                           ankleCenter[1]*(1-fraction)+legCenter[1]*fraction])
        return center, np.array([sideWidth, frontWidth])/2, fraction

    topCenter, topRadii, _ = CalfSection(topZ)
    ankleCenter, ankleRadii, _ = CalfSection(ankleZ)

    footMaterial = textureSource.data.materials[0]
    baseNode = next(node for node in footMaterial.node_tree.nodes if node.type == 'TEX_IMAGE')
    sourceImage = baseNode.image
    imagePixels = np.empty(sourceImage.size[0] * sourceImage.size[1] * 4, dtype=np.float32)
    sourceImage.pixels.foreach_get(imagePixels)
    imagePixels = imagePixels.reshape(sourceImage.size[1], sourceImage.size[0], 4)
    sourceFoot = LocalPoints(textureSource)
    uv = textureSource.data.uv_layers.active
    colorSamples = []
    for face in textureSource.data.polygons:
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
    textureSource.data.calc_loop_triangles()
    footTriangles = list(textureSource.data.loop_triangles)
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

    # The dark cloth continues the ankle shaft from the unscaled shoe piece.
    darkSamples = []
    for face in textureSource.data.polygons:
        facePoints = sourceFoot[list(face.vertices)]
        if 0.25 < facePoints[:, 2].mean() < 0.35 and facePoints[:, 0].mean() < -0.05:
            coordinate = np.mean([uv.data[index].uv[:] for index in face.loop_indices], axis=0)
            x = int(coordinate[0]*(sourceImage.size[0]-1)) % sourceImage.size[0]
            y = int(coordinate[1]*(sourceImage.size[1]-1)) % sourceImage.size[1]
            color = imagePixels[y, x, :3]
            if color.max() < 0.40:
                darkSamples.append(color)
    sockColor = np.median(np.array(darkSamples), axis=0) if darkSamples else np.array([0.15, 0.15, 0.15])
    sockPixels = clothPixels.copy()
    sockPixels[:, :, :3] *= sockColor[None, None, :] / clothColor[None, None, :].clip(0.01)
    sockImage = bpy.data.images.new('Texture_SichuanMessenger_AnkleCloth_BaseColor', width=size, height=size, alpha=True)
    sockImage.colorspace_settings.name = sourceImage.colorspace_settings.name
    sockImage.pixels.foreach_set(sockPixels.ravel())
    sockImage.pack()
    sockMaterial = clothMaterial.copy()
    sockMaterial.name = 'Material_SichuanMessenger_AnkleCloth'
    for node in sockMaterial.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image == clothImage:
            node.image = sockImage

    angularSteps = 96
    sockRows = 24
    sockPoints, sockUvCoordinates = [], []
    foot.data.calc_loop_triangles()
    shaftBvh = BVHTree.FromPolygons([Vector(point) for point in footWorld], [tuple(triangle.vertices) for triangle in foot.data.loop_triangles], all_triangles=True)
    shaftBoundary = []
    for column in range(angularSteps+1):
        angle = math.tau*column/angularSteps
        radial = Vector((math.cos(angle),math.sin(angle),0))
        origin = Vector((footCenter[0],footCenter[1],sockBaseZ))+radial
        hit = shaftBvh.ray_cast(origin,-radial,1.5)[0]
        assert hit is not None
        shaftBoundary.append(np.array(hit[:2])+np.array(radial[:2])*0.0004)
    for row in range(sockRows+1):
        fraction = row/sockRows
        z = sockBaseZ+(ankleZ+0.003-sockBaseZ)*fraction
        blend = fraction*fraction*(3-2*fraction)
        for column in range(angularSteps+1):
            angle = math.tau*column/angularSteps
            innerTop = ankleCenter+(ankleRadii-0.002)*np.array([math.cos(angle),math.sin(angle)])
            point = shaftBoundary[column]*(1-blend)+innerTop*blend
            sockPoints.append((float(point[0]),float(point[1]),z))
            sockUvCoordinates.append((column/angularSteps,fraction))
    sockFaces = []
    for row in range(sockRows):
        for column in range(angularSteps):
            a = row*(angularSteps+1)+column
            sockFaces.append((a,a+1,a+angularSteps+2,a+angularSteps+1))
    sockMesh = bpy.data.meshes.new('Mesh_SichuanMessenger_AnkleCloth')
    sockMesh.from_pydata(sockPoints,[],sockFaces)
    sockMesh.materials.append(sockMaterial)
    sockUv = sockMesh.uv_layers.new(name='UVMap')
    for face in sockMesh.polygons:
        face.use_smooth = True
        for loop in face.loop_indices:
            sockUv.data[loop].uv = sockUvCoordinates[sockMesh.loops[loop].vertex_index]
    sock = bpy.data.objects.new('Part_AnkleCloth_L',sockMesh)
    assembly.objects.link(sock)
    rightSock = sock.copy()
    rightSock.name = 'Part_AnkleCloth_R'
    assembly.objects.link(rightSock)
    rightSock.matrix_world = mirror

    bandPitch = 0.026
    bandWidth = 0.033
    turnCount = (topZ-baseZ+bandWidth)/bandPitch+2
    longitudinalSteps = int(math.ceil(turnCount*angularSteps))
    acrossSteps = 6
    points, coordinates = [], []
    for row in range(longitudinalSteps+1):
        angle = math.tau*(row/angularSteps-1.0)
        centerZ = baseZ+bandPitch*angle/math.tau
        for column in range(acrossSteps+1):
            across = column/acrossSteps
            z = float(np.clip(centerZ+(across-0.5)*bandWidth,baseZ,topZ))
            center,radii,fraction = CalfSection(z)
            asymmetry = 0.06*math.sin(math.pi*fraction)**2
            center[0] += asymmetry*radii[0]
            cosine,sine = math.cos(angle),math.sin(angle)
            x = radii[0]*(1-asymmetry)*cosine**1.25 if cosine>=0 else -radii[0]*(1+asymmetry)*(-cosine)**0.90
            lip = 0.0003+0.0010*(1-across)**4
            fold = 0.0005*math.sin(3*angle+4*fraction)*math.sin(math.pi*fraction)
            points.append((center[0]+x+(lip+fold)*cosine,
                           center[1]+radii[1]*sine+(lip+fold)*sine,z))
            coordinates.append((angle/math.tau,(z-baseZ)/0.085))
    faces = []
    for row in range(longitudinalSteps):
        for column in range(acrossSteps):
            first = row*(acrossSteps+1)+column
            face = (first,first+acrossSteps+1,first+acrossSteps+2,first+1)
            heights = [points[index][2] for index in face]
            if max(heights)-min(heights)>1e-7:
                faces.append(face)
    wrapMesh = bpy.data.meshes.new('Mesh_SichuanMessenger_CalfWrap')
    wrapMesh.from_pydata(points,[],faces)
    wrapMesh.materials.append(clothMaterial)
    wrapUv = wrapMesh.uv_layers.new(name='UVMap')
    for face in wrapMesh.polygons:
        face.use_smooth = True
        for loop in face.loop_indices:
            wrapUv.data[loop].uv = coordinates[wrapMesh.loops[loop].vertex_index]
    wrap = bpy.data.objects.new('Part_CalfWrap_L',wrapMesh)
    assembly.objects.link(wrap)
    rightWrap = wrap.copy()
    rightWrap.name = 'Part_CalfWrap_R'
    assembly.objects.link(rightWrap)
    rightWrap.matrix_world = mirror

    # Measure the generated ribbon surfaces, including their overlap lips.
    wrapMesh.calc_loop_triangles()
    triangles = np.array([triangle.vertices[:] for triangle in wrapMesh.loop_triangles])
    pointArray = np.array(points)
    contourChecks = []
    for fraction in [0.05,0.15,0.30,0.45,0.60,0.75,0.85,0.95]:
        z = ankleZ+(topZ-ankleZ)*fraction
        contour = PlaneIntersections(pointArray,triangles,2,z)
        actual = np.ptp(contour[:,:2],axis=0)
        _,radii,_ = CalfSection(z)
        error = actual-2*radii
        contourChecks.append({'heightFraction':fraction,'frontBackWidth':float(actual[1]),'sideDepth':float(actual[0]),'maximumContourErrorMeters':float(np.abs(error).max())})
    maximumError = max(row['maximumContourErrorMeters'] for row in contourChecks)
    widthRatio = max(row['frontBackWidth'] for row in contourChecks)/contourChecks[0]['frontBackWidth']
    assert maximumError<0.006
    assert widthRatio>1.45
    report = {'baseZ':baseZ,'ankleZ':ankleZ,'topZ':topZ,'topCenter':topCenter.tolist(),'topRadii':topRadii.tolist(),
              'color':clothColor.tolist(),'textureBakeCoverage':sampledPixels/(size*size),
              'referenceImages':reference['sourceImages'],'referenceFrame':reference['measurementFrame'],
              'referenceContourChecks':contourChecks,'maximumContourErrorMeters':maximumError,
              'calfToAnkleWidthRatio':widthRatio,'trianglesPerSide':sum(len(face.vertices)-2 for face in wrapMesh.polygons)}
    assert report['textureBakeCoverage']>0.99
    return wrap,rightWrap,report


def FitCapBand(cap, head, targetTopZ):
    headWorld = WorldPoints(head)
    headBvh = BVHTree.FromPolygons([Vector(point) for point in headWorld], [tuple(face.vertices) for face in head.data.polygons])
    cap.location.z -= max(WorldPoints(cap)[:, 2]) - targetTopZ
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
            if rawUnique[index, 0] > 0.12 or rawUnique[index, 2] > 0.52:
                continue
            origin = Vector((-1.0, float(point[1]), float(point[2])))
            direction = Vector((1, 0, 0))
            capHit = fitBvh.ray_cast(origin, direction, 2.0)[0]
            headHit = headBvh.ray_cast(origin, direction, 2.0)[0]
            if capHit is None or headHit is None:
                continue
            needed = max(0.0, capHit.x - headHit.x + 0.0025)
            posterior = np.clip((0.12 - rawUnique[index, 0]) / 0.22, 0, 1)
            upper = np.clip((0.52 - rawUnique[index, 2]) / 0.17, 0, 1)
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
    headCenterY = (headWorld[:, 1].min() + headWorld[:, 1].max()) / 2
    halfWidth = (headWorld[:, 1].max() - headWorld[:, 1].min()) * 0.32
    headTop = headWorld[:, 2].max()
    for y in np.linspace(headCenterY - halfWidth, headCenterY + halfWidth, 7):
        for z in np.linspace(headTop - 0.15, headTop - 0.04, 25):
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
