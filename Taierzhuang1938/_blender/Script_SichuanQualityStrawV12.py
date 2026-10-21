"""Prepare native high straw for QualityV12, with image-only rolled ends.

Call PrepareQualityStraw on an independent copy of the original HighV10.
Importing this helper does nothing. Native shoes and external grass weaving
are retained. Only a copied sheet mesh loses its hidden internal laps; original
mesh datablocks remain available, and old end/bake sources are only excluded.
"""
import array
import hashlib
import math
from numbers import Integral
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import tessellate_polygon


generator = 'SichuanQualityStrawV12'
imageRelativePath = ('Taierzhuang1938/_import/SichuanBlanketPack/Source/MatEndV12/'
                     'Texture_SichuanMatEndBaseV12.png')
capName = 'Pack_QualityMatEndCapsV12'
outlineStations = 130
firstOuterRow = 470


def MeshDigest(mesh):
    digest = hashlib.sha256()
    coordinates = array.array('f', [0.0])*(len(mesh.vertices)*3)
    mesh.vertices.foreach_get('co', coordinates)
    digest.update(coordinates.tobytes())
    indices = array.array('i', [0])*len(mesh.loops)
    mesh.loops.foreach_get('vertex_index', indices)
    digest.update(indices.tobytes())
    for attribute in ('loop_start', 'loop_total', 'material_index'):
        values = array.array('i', [0])*len(mesh.polygons)
        mesh.polygons.foreach_get(attribute, values)
        digest.update(values.tobytes())
    for layer in mesh.uv_layers:
        values = array.array('f', [0.0])*(len(layer.data)*2)
        layer.data.foreach_get('uv', values)
        digest.update(layer.name.encode('utf-8'))
        digest.update(values.tobytes())
    return digest.hexdigest()


def TriangleCount(mesh):
    return sum(len(face.vertices)-2 for face in mesh.polygons)


def EvaluatedTriangleCount(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    try:
        return TriangleCount(mesh)
    finally:
        evaluated.to_mesh_clear()


def Snapshot(obj, parent):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
    try:
        transform = parent.matrix_world.inverted_safe() @ evaluated.matrix_world
        return ([transform @ vertex.co for vertex in mesh.vertices],
                [tuple(face.vertices) for face in mesh.polygons], TriangleCount(mesh))
    finally:
        evaluated.to_mesh_clear()


def Visibility(obj, visible):
    obj['QualityExportExclude'] = not visible
    obj.hide_viewport = not visible
    obj.hide_render = not visible
    obj.hide_set(not visible)


def EndMaterial(image):
    name = 'Material_SichuanQualityMatEndV12'
    material = bpy.data.materials.get(name)
    if material is not None and material.get('QualityStrawGenerator') != generator:
        raise RuntimeError('The Quality mat-end material belongs to another asset')
    if material is None:
        material = bpy.data.materials.new(name)
    material.use_nodes = True
    material['QualityStrawGenerator'] = generator
    material['AtlasRegion'] = 'straw'
    material['MatEndAppearance'] = 'V12 image-only winding; no internal spiral geometry'
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new('ShaderNodeOutputMaterial')
    shader = tree.nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Roughness'].default_value = .96
    shader.inputs['Metallic'].default_value = 0.0
    uv = tree.nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'sourceUV'
    texture = tree.nodes.new('ShaderNodeTexImage')
    texture.name = 'V12ImageOnlyWindingBaseColour'
    texture.image = image
    texture.interpolation = 'Linear'
    texture.extension = 'EXTEND'
    tree.links.new(uv.outputs['UV'], texture.inputs['Vector'])
    floor = tree.nodes.new('ShaderNodeVectorMath')
    floor.name = 'DryStrawMinimumBrownReflectance'
    floor.operation = 'MAXIMUM'
    floor.inputs[1].default_value = (.002, .0013, .0007)
    tree.links.new(texture.outputs['Color'], floor.inputs[0])
    tree.links.new(floor.outputs['Vector'], shader.inputs['Base Color'])
    luminance = tree.nodes.new('ShaderNodeRGBToBW')
    tree.links.new(texture.outputs['Color'], luminance.inputs['Color'])
    bump = tree.nodes.new('ShaderNodeBump')
    bump.name = 'SubtleGrassEndFibreBump'
    bump.inputs['Distance'].default_value = .0002
    bump.inputs['Strength'].default_value = .12
    tree.links.new(luminance.outputs[0], bump.inputs['Height'])
    tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    return material


def PrepareQualityStraw(root, repo):
    if root is None or root.name != 'Pack_Root':
        raise RuntimeError('Pass the native Pack_Root from an independent original HighV10 copy')
    objects = {obj.name: obj for obj in (root, *root.children_recursive)}
    required = ('Pack_StrawMat', 'Pack_Sandals', 'Pack_TrueRolledGrassSheet',
                'Pack_InterlacedMatGrass', 'Pack_MatCottonRetainers',
                'Pack_GrassSandal01Foundation', 'Pack_GrassSandal01BraidedWeave',
                'Pack_GrassSandal02Foundation', 'Pack_GrassSandal02BraidedWeave',
                'Pack_ThinSandalHangingTwine')
    for name in required:
        if name not in objects:
            raise RuntimeError('Missing native high straw component: ' + name)
    repo = Path(repo)
    imagePath = repo/imageRelativePath
    if not imagePath.is_file():
        raise FileNotFoundError('The authored V12 mat-end image is missing: ' + str(imagePath))
    imageDigest = hashlib.sha256(imagePath.read_bytes()).hexdigest()
    matPart, sheet = objects['Pack_StrawMat'], objects['Pack_TrueRolledGrassSheet']
    baselineName = sheet.get('QualityStrawOriginalMeshV12', '')
    baseline = bpy.data.meshes.get(baselineName) if baselineName else sheet.data
    if baseline is None or len(baseline.vertices) != 601*49 or len(baseline.polygons) != 600*48:
        raise RuntimeError('The preserved original 601 x 49 native sheet grid is required')
    baseline.use_fake_user = True
    baselineDigest = MeshDigest(baseline)
    intoPart = matPart.matrix_world.inverted_safe() @ sheet.matrix_world
    originalEnds = {sign: [intoPart @ baseline.vertices[row*49+column].co
                           for row in range(471, 601)]
                    for sign, column in ((-1, 0), (1, 48))}
    nativeMeshes = [obj for part in (matPart, objects['Pack_Sandals'])
                    for obj in part.children_recursive if obj.type == 'MESH'
                    and obj.get('QualityStrawGenerator') != generator]
    sourceHashes = {obj.name: {'mesh': obj.data.name, 'meshSha256': MeshDigest(obj.data),
                               'materials': [slot.material.name if slot.material else None
                                             for slot in obj.material_slots]}
                    for obj in nativeMeshes}
    modifierBefore = [{'name': modifier.name, 'type': modifier.type,
                       'thickness': float(modifier.thickness), 'offset': float(modifier.offset)}
                      for modifier in sheet.modifiers if modifier.type == 'SOLIDIFY']
    if not modifierBefore:
        raise RuntimeError('Retain the original GrassSheetThickness Solidify modifier')
    oldGenerated = sheet.data if sheet.data.get('QualityStrawGenerator') == generator else None
    trimmed = baseline.copy()
    trimmed.name = 'Geometry_QualityOuterGrassSheetV12'
    trimmed.use_fake_user = False
    trimmed['QualityStrawGenerator'] = generator
    uvNames = [layer.name for layer in baseline.uv_layers]
    bm = bmesh.new()
    try:
        bm.from_mesh(trimmed)
        bm.verts.ensure_lookup_table()
        bm.verts.index_update()
        remove = [vertex for vertex in bm.verts if vertex.index//49 < firstOuterRow]
        bmesh.ops.delete(bm, geom=remove, context='VERTS')
        loose = [vertex for vertex in bm.verts if not vertex.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context='VERTS')
        bm.to_mesh(trimmed)
    finally:
        bm.free()
    trimmed.update()
    if len(trimmed.vertices) != 131*49 or len(trimmed.polygons) != 130*48:
        raise RuntimeError('The native outer-lap trim did not preserve the intended source grid')
    if [layer.name for layer in trimmed.uv_layers] != uvNames:
        raise RuntimeError('Trimming the Quality sheet changed its UV layers')
    sheet.data = trimmed
    sheet['QualityStrawOriginalMeshV12'] = baseline.name
    sheet['QualityStrawGenerator'] = generator
    sheet['QualitySheetSourceRows'] = [470, 600]
    if oldGenerated is not None and oldGenerated.users == 0:
        bpy.data.meshes.remove(oldGenerated)
    Visibility(sheet, True)

    excludeNames = {'Pack_CutGrassBundlesV10': 'High internal cut-end grass is replaced by a flat V12 image',
                    'Pack_InnerMatTuckV10': 'Internal core leaf is concealed by the image-only end faces',
                    'WearV9_Pack_InterlacedMatGrass_BrokenRollEndGrass': 'Exclude loose end tufts from the image-only end opening'}
    excluded, roles = [], []
    for obj in (root, *root.children_recursive):
        if obj.type != 'MESH' or obj.name == capName:
            continue
        reason = excludeNames.get(obj.name)
        if obj.get('GameBakeSupportGenerator') or obj.get('MatEndSourceGenerator') or obj.get('BakeOnly'):
            reason = 'Old bake-only carrier/support is excluded from native Quality export'
        if reason:
            Visibility(obj, False)
            excluded.append({'object': obj.name, 'reason': reason,
                             'rawTriangles': TriangleCount(obj.data), 'dataPreserved': True})
    for part, role in ((matPart, 'Native outer weaving and cotton retainers'),
                       (objects['Pack_Sandals'], 'Native cupped shoes, real three-strand rims, open laces, wear holes and hanging twine')):
        for obj in part.children_recursive:
            if obj.type != 'MESH' or obj.name in {row['object'] for row in excluded} or obj.name == capName:
                continue
            Visibility(obj, True)
            roles.append({'object': obj.name, 'role': 'Outer sheet underlay only' if obj == sheet else role,
                          'rawTriangles': TriangleCount(obj.data), 'mesh': obj.data.name})
    bpy.context.view_layer.update()

    points, faces, evaluatedSheetTriangles = Snapshot(sheet, matPart)
    surface = BVHTree.FromPolygons(points, faces, all_triangles=False)
    outer = originalEnds[-1]+originalEnds[1]
    centerY = .5*(min(point.y for point in outer)+max(point.y for point in outer))
    centerZ = .5*(min(point.z for point in outer)+max(point.z for point in outer))
    vertices, capFaces, vertexUvs, capReports = [], [], [], []
    for sign in (-1, 1):
        endpoint = originalEnds[sign]
        plane = sum(point.x for point in endpoint)/len(endpoint)
        # Sample just inside all ragged axial sheet edges, then project that
        # real outer contour onto the end plane. No circular proxy is fitted.
        sampleX = max(point.x for point in endpoint)+.00025 if sign < 0 else min(point.x for point in endpoint)-.00025
        contour = []
        for station in range(outlineStations):
            angle = math.tau*station/outlineStations
            direction = Vector((0, math.cos(angle), math.sin(angle)))
            center = Vector((sampleX, centerY, centerZ))
            hit = surface.ray_cast(center+direction*.12, -direction, .24)[0]
            if hit is None:
                raise RuntimeError('The native Quality outer sheet does not close around the sampled end contour')
            contour.append(Vector((plane, hit.y, hit.z)))
        # A five-sample blend softens a tiny cut-leaf corner while preserving
        # the actual asymmetric section and its natural sheet-end overlap.
        smoothed, smoothingMoves = [], []
        for index, point in enumerate(contour):
            average = (contour[(index-2)%outlineStations]+2*contour[(index-1)%outlineStations]
                       +4*point+2*contour[(index+1)%outlineStations]+contour[(index+2)%outlineStations])/10
            delta = (average-point)*.55
            delta.x = 0
            if delta.length > .0008:
                delta *= .0008/delta.length
            smoothed.append(point+delta)
            smoothingMoves.append(delta.length)
        first = len(vertices)
        vertices.extend(smoothed)
        lookup = {tuple(point): index for index, point in enumerate(smoothed)}
        if len(lookup) != outlineStations:
            raise RuntimeError('The Quality cap outline contains repeated vertices')
        triangles = tessellate_polygon([smoothed])
        if len(triangles) != outlineStations-2:
            raise RuntimeError('The native Quality cap did not tessellate its real outline')
        for triangle in triangles:
            local = tuple(int(point) if isinstance(point, Integral) else lookup[tuple(point)] for point in triangle)
            if any(index < 0 or index >= outlineStations for index in local):
                raise RuntimeError('Quality cap tessellation referenced a non-outline vertex')
            face = tuple(first+index for index in local)
            a, b, c = (vertices[index] for index in face)
            normal = (b-a).cross(c-a)
            if normal.length_squared < 1e-16:
                raise RuntimeError('The Quality cap contains a degenerate triangle')
            capFaces.append(face if normal.x*sign > 0 else tuple(reversed(face)))
        yMin, yMax = min(point.y for point in smoothed), max(point.y for point in smoothed)
        zMin, zMax = min(point.z for point in smoothed), max(point.z for point in smoothed)
        for point in smoothed:
            u = (point.y-yMin)/(yMax-yMin)
            vertexUvs.append((1-u if sign < 0 else u, (point.z-zMin)/(zMax-zMin)))
        capReports.append({'end': sign, 'outlineVertices': outlineStations, 'triangles': len(triangles),
                           'planeMatLocalXM': plane, 'sampleMatLocalXM': sampleX,
                           'maximumOutlineSmoothingM': max(smoothingMoves), 'internalSpiralTriangles': 0,
                           'outwardAxis': [sign, 0, 0], 'imageUMirrored': sign < 0,
                           'imageBoundsInActualMatPartM': {'y': [yMin, yMax], 'z': [zMin, zMax]},
                           'construction': '130 rays against the evaluated native outer-sheet lap; gentle local corner smoothing, planar image-only closure'})

    image = bpy.data.images.load(str(imagePath.resolve()), check_existing=True)
    image.colorspace_settings.name = 'sRGB'
    image.pack()
    material = EndMaterial(image)
    previous = bpy.data.objects.get(capName)
    if previous is not None:
        if previous.get('QualityStrawGenerator') != generator or previous.parent != matPart:
            raise RuntimeError('The Quality end-cap object belongs to another asset')
        mesh = previous.data
        bpy.data.objects.remove(previous, do_unlink=True)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    mesh = bpy.data.meshes.new('Geometry_QualityMatEndCapsV12')
    mesh.from_pydata(vertices, [], capFaces)
    mesh.materials.append(material)
    mesh.update()
    layer = mesh.uv_layers.new(name='sourceUV')
    for loop in mesh.loops:
        layer.data[loop.index].uv = vertexUvs[loop.vertex_index]
    for face in mesh.polygons:
        face.use_smooth = False
    caps = bpy.data.objects.new(capName, mesh)
    bpy.context.scene.collection.objects.link(caps)
    caps.parent = matPart
    caps['QualityStrawGenerator'] = generator
    caps['Construction'] = 'Planar image-only mat ends; no internal coil geometry'
    caps['ImageSourceSha256'] = imageDigest
    caps['ImageSourcePath'] = str(imagePath.resolve())
    Visibility(caps, True)
    roles.append({'object': caps.name, 'role': 'Two flat V12 image-only end faces',
                  'rawTriangles': TriangleCount(mesh), 'mesh': mesh.name})
    if MeshDigest(baseline) != baselineDigest:
        raise RuntimeError('The original retained high sheet datablock changed')
    for name, source in sourceHashes.items():
        if name != sheet.name and MeshDigest(objects[name].data) != source['meshSha256']:
            raise RuntimeError('Quality straw preparation changed protected native geometry/UVs: ' + name)
    modifierAfter = [{'name': modifier.name, 'type': modifier.type,
                      'thickness': float(modifier.thickness), 'offset': float(modifier.offset)}
                     for modifier in sheet.modifiers if modifier.type == 'SOLIDIFY']
    if modifierAfter != modifierBefore:
        raise RuntimeError('The original native grass-sheet thickness settings changed')
    bpy.context.view_layer.update()
    for report in roles:
        report['evaluatedTriangles'] = EvaluatedTriangleCount(bpy.data.objects[report['object']])
    return {'generator': generator, 'root': root.name, 'sourceBlendAtPrepare': bpy.data.filepath,
            'objects': roles, 'excluded': excluded,
            'visibleStrawEvaluatedTriangles': sum(report['evaluatedTriangles'] for report in roles),
            'sourceHashes': sourceHashes, 'originalSheetMesh': baseline.name,
            'originalSheetSha256': baselineDigest, 'originalSheetRetainedWithFakeUser': bool(baseline.use_fake_user),
            'trimmedSheetMesh': trimmed.name, 'trimmedSheetSha256': MeshDigest(trimmed),
            'keptRawSheetRows': [470, 600], 'removedInternalSheetRows': [0, 469],
            'outerSheetRawTriangles': TriangleCount(trimmed), 'outerSheetEvaluatedTriangles': evaluatedSheetTriangles,
            'originalSolidifySettings': modifierAfter, 'sourceUvsPreserved': True,
            'capObject': caps.name, 'capTriangles': TriangleCount(mesh), 'ends': capReports,
            'imageSource': str(imagePath.resolve()), 'imageSourceSha256': imageDigest,
            'imageResolution': list(image.size), 'floorLinear': [.002, .0013, .0007],
            'bumpDistanceM': .0002, 'bumpStrength': .12, 'internalSpiralTriangles': 0,
            'nativeSandalGeometryAndUvsUnchanged': True, 'originalMaterialsUnchanged': True,
            'gameWovenLodApplied': False, 'gameStrawToneApplied': False,
            'unrelatedHighObjectsUntouched': True, 'visualVerificationRequired': True}
