"""Prepare direction-separated bake geometry with shared source-local shaders.

No original mesh, material, transform, UV or anchor is changed.  Calling
PrepareExplodedPart returns a dictionary with targetObj, highObjs,
occluderObjects, cleanup and report.  Source-local affine nodes permit one
material per original source/material across all cells. Full occluders share one evaluated mesh
per original source and start hidden; the caller enables them only for AO.
"""
import array
import math
import uuid

import bpy
import bmesh
from mathutils import Matrix, Vector


generator = 'SichuanExplodedSharedProjectionV10'


def PrepareExplodedPart(lowMeshes, sourceResolver, collectionName):
    lowMeshes = list(lowMeshes)
    if not lowMeshes or any(obj.type != 'MESH' or obj.name.startswith('High_') for obj in lowMeshes):
        raise RuntimeError('Pass only actual low meshes belonging to one game part')
    token = uuid.uuid4().hex
    ownedObjects, ownedMeshes, ownedMaterials, ownedGroups = [], [], [], []
    collection = bpy.data.collections.new(collectionName)
    collection[generator] = token
    bpy.context.scene.collection.children.link(collection)
    cleaned = False

    def Cleanup():
        nonlocal cleaned
        if cleaned:
            return
        cleaned = True
        for obj in reversed(ownedObjects):
            if bpy.data.objects.get(obj.name) == obj and obj.get(generator) == token:
                bpy.data.objects.remove(obj, do_unlink=True)
        for material in reversed(ownedMaterials):
            if bpy.data.materials.get(material.name) == material and material.get(generator) == token:
                bpy.data.materials.remove(material, do_unlink=True)
        for group in reversed(ownedGroups):
            if bpy.data.node_groups.get(group.name) == group and group.get(generator) == token:
                bpy.data.node_groups.remove(group, do_unlink=True)
        for mesh in reversed(ownedMeshes):
            if bpy.data.meshes.get(mesh.name) == mesh and mesh.get(generator) == token:
                bpy.data.meshes.remove(mesh, do_unlink=True)
        if bpy.data.collections.get(collection.name) == collection and collection.get(generator) == token:
            bpy.data.collections.remove(collection)

    def OwnObject(name, mesh=None):
        obj = bpy.data.objects.new(name, mesh)
        obj[generator] = token
        collection.objects.link(obj)
        ownedObjects.append(obj)
        return obj

    def OwnMesh(mesh):
        mesh[generator] = token
        ownedMeshes.append(mesh)
        return mesh

    def OwnMaterial(material):
        material[generator] = token
        ownedMaterials.append(material)
        return material

    try:
        directions = [Vector((x, y, z)).normalized() for x in (-1, 0, 1)
                      for y in (-1, 0, 1) for z in (-1, 0, 1) if (x, y, z) != (0, 0, 0)]
        groups, allSources = {}, {}
        originalTriangles = []
        parts = set()
        for low in lowMeshes:
            owner = low
            while owner.parent and owner.parent.name != 'Pack_Root':
                owner = owner.parent
            parts.add(owner.name)
            if low.modifiers:
                raise RuntimeError('Bake target requires frozen final low geometry: ' + low.name)
            sourceObjects = sorted(set(sourceResolver(low)), key=lambda obj: obj.name)
            if not sourceObjects or any(obj.type != 'MESH' for obj in sourceObjects):
                raise RuntimeError('Every low target must resolve actual high mesh sources: ' + low.name)
            for source in sourceObjects:
                if source in lowMeshes:
                    raise RuntimeError('A low target was supplied as its own high source')
                allSources[source.name] = source
            layer = low.data.uv_layers.get('GameUV')
            surface = low.data.uv_layers.get('SurfaceUV')
            if layer is None or surface is None or low.data.uv_layers.find('GameUV') != 1:
                raise RuntimeError('Final SurfaceUV/GameUV pair missing: ' + low.name)
            low.data.calc_loop_triangles()
            for triangle in low.data.loop_triangles:
                positions = [low.matrix_world @ low.data.vertices[index].co for index in triangle.vertices]
                normal = (positions[1]-positions[0]).cross(positions[2]-positions[0])
                if normal.length < 1e-14:
                    raise RuntimeError('Degenerate low triangle: ' + low.name)
                normal.normalize()
                directionIndex = max(range(26), key=lambda index: normal.dot(directions[index]))
                key = (tuple(source.name for source in sourceObjects), directionIndex)
                group = groups.setdefault(key, {'sources': sourceObjects, 'direction': directions[directionIndex],
                                                'directionIndex': directionIndex, 'triangles': []})
                record = {'object': low.name, 'part': owner.name, 'triangle': triangle.index,
                          'polygon': triangle.polygon_index, 'positions': positions,
                          'surfaceUV': [tuple(surface.data[index].uv) for index in triangle.loops],
                          'gameUV': [tuple(layer.data[index].uv) for index in triangle.loops],
                          'normal': normal}
                group['triangles'].append(record)
                originalTriangles.append(record)
        if len(parts) != 1 or not next(iter(parts)).startswith('Pack_'):
            raise RuntimeError('PrepareExplodedPart accepts exactly one canonical part')
        if len(groups) > 256:
            raise RuntimeError('Unexpected direction/source group count exceeds this single asset')
        depsgraph = bpy.context.evaluated_depsgraph_get()
        cache = {}
        for name, source in sorted(allSources.items()):
            evaluated = source.evaluated_get(depsgraph)
            mesh = OwnMesh(bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True,
                                                         depsgraph=depsgraph))
            mesh.name = 'Geometry_ExplodedFull_' + token[:8] + '_' + name
            if not mesh.polygons:
                raise RuntimeError('Empty evaluated high source: ' + name)
            mesh.update()
            normals = array.array('f', [0]) * (len(mesh.loops)*3)
            mesh.corner_normals.foreach_get('vector', normals)
            normalMatrix = evaluated.matrix_world.to_3x3().inverted_safe().transposed()
            worldFaceNormals = [(normalMatrix @ polygon.normal).normalized() for polygon in mesh.polygons]
            cache[name] = {'mesh': mesh, 'matrix': evaluated.matrix_world.copy(),
                           'normals': normals, 'faceNormals': worldFaceNormals,
                           'normalMatrix': normalMatrix,
                           'materials': list(mesh.materials)}
        opaque = OwnMaterial(bpy.data.materials.new('Material_ExplodedOpaque_' + token[:8]))
        opaque.use_nodes = True
        opaque.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = 1.0
        opaque.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value = 1.0
        materialCache, groupTreeCache = {}, {}
        anchorReport, compensationReport, coordinateValidation, cellFrameValidation = [], [], [], []

        def SampleIndices(source):
            count = len(cache[source.name]['mesh'].vertices)
            return sorted({round(index*(count-1)/16) for index in range(17)})

        def ValidateAffine(source, matrix, reference, label):
            samples, maximum = [], 0.0
            for index in SampleIndices(source):
                point = cache[source.name]['mesh'].vertices[index].co.copy()
                expected = reference(point)
                result = matrix @ point
                error = (expected-result).length
                maximum = max(maximum, error)
                samples.append({'vertex': index, 'originalLocal': list(point),
                                'originalCoordinate': list(expected), 'sharedCoordinate': list(result),
                                'error': error})
            if maximum > 1e-6:
                raise RuntimeError('Shared shader affine validation exceeded 1e-6: ' + source.name + ' / ' + label)
            coordinateValidation.append({'source': source.name, 'coordinate': label,
                                         'matrix': [list(row) for row in matrix],
                                         'maximumError': maximum, 'tolerance': 1e-6, 'samples': samples})

        def ValidateCell(source, cell, offset):
            matrix = Matrix.Translation(offset) @ cache[source.name]['matrix']
            inverse = matrix.inverted()
            maximum = 0.0
            for index in SampleIndices(source):
                point = cache[source.name]['mesh'].vertices[index].co.copy()
                maximum = max(maximum, ((inverse @ (matrix @ point))-point).length)
            if maximum > 1e-6:
                raise RuntimeError('Translated self.Object loses local coordinate precision: ' + source.name)
            cellFrameValidation.append({'source': source.name, 'cell': cell, 'maximumError': maximum,
                                        'tolerance': 1e-6, 'sampleCount': len(SampleIndices(source))})

        def AffineSocket(tree, localSocket, matrix, label):
            # Mapping nodes cannot express arbitrary shear.  These explicit
            # affine rows preserve rotations, nonuniform scales and shear.
            combine = tree.nodes.new('ShaderNodeCombineXYZ')
            combine.label = label + ' affine rows'
            for row in range(3):
                dot = tree.nodes.new('ShaderNodeVectorMath')
                dot.operation = 'DOT_PRODUCT'
                dot.label = label + ' row ' + str(row)
                dot.inputs[1].default_value = tuple(matrix[row][column] for column in range(3))
                tree.links.new(localSocket, dot.inputs[0])
                tree.links.new(dot.outputs['Value'], combine.inputs[row])
            add = tree.nodes.new('ShaderNodeVectorMath')
            add.operation = 'ADD'
            add.label = label + ' original translation'
            add.inputs[1].default_value = tuple(matrix.translation)
            tree.links.new(combine.outputs['Vector'], add.inputs[0])
            return add.outputs['Vector']

        def ReplaceLinks(tree, output, replacement):
            destinations = [link.to_socket for link in list(output.links)]
            for destination in destinations:
                tree.links.new(replacement, destination)

        def CompensateTree(tree, source, materialName, visiting=None):
            visiting = set() if visiting is None else visiting
            if tree in visiting:
                raise RuntimeError('Recursive shader group in source material: ' + materialName)
            visiting = visiting | {tree}
            originalNodes = list(tree.nodes)
            localNode = tree.nodes.new('ShaderNodeTexCoord')
            localNode.object = None
            localNode.label = 'Original source local position; independent of exploded cell'
            localSocket = localNode.outputs['Object']
            originalMatrix = cache[source.name]['matrix']
            worldSocket = None
            for node in originalNodes:
                if node.type == 'GROUP' and node.node_tree is not None:
                    original = node.node_tree
                    key = (original.name, source.name)
                    if key not in groupTreeCache:
                        copied = original.copy()
                        copied.name = 'Shader_ExplodedShared_' + source.name + '_' + original.name
                        copied[generator] = token
                        ownedGroups.append(copied)
                        groupTreeCache[key] = copied
                        CompensateTree(copied, source, materialName, visiting)
                    node.node_tree = groupTreeCache[key]
                elif node.bl_idname == 'ShaderNodeTexCoord':
                    if node.outputs['Generated'].is_linked:
                        raise RuntimeError('Generated coordinates cannot safely survive evaluated source filtering: '
                                           + materialName + ' / ' + node.name)
                    for unsupported in ('Camera', 'Window'):
                        if node.outputs[unsupported].is_linked:
                            raise RuntimeError('View-dependent source coordinate cannot be preserved: '
                                               + materialName + ' / ' + unsupported)
                    if node.object is not None and node.outputs['Object'].is_linked:
                        anchor = node.object
                        anchorInverse = anchor.matrix_world.inverted()
                        matrix = anchorInverse @ originalMatrix
                        result = AffineSocket(tree, localSocket, matrix, 'Original anchor ' + anchor.name)
                        ReplaceLinks(tree, node.outputs['Object'], result)
                        ValidateAffine(source, matrix, lambda point: anchorInverse @ (originalMatrix @ point),
                                       'TexCoord.Object:' + anchor.name)
                        anchorReport.append({'source': source.name, 'material': materialName,
                                             'originalAnchor': anchor.name,
                                             'replacement': 'Ainv @ Msource @ self.Object',
                                             'matrix': [list(row) for row in matrix], 'sharedAcrossCells': True})
                        node.object = None
                    # An unanchored Object output already evaluates in the
                    # unchanged local geometry frame and needs no rewiring.
                elif node.bl_idname == 'ShaderNodeNewGeometry':
                    if node.outputs['Position'].is_linked:
                        if worldSocket is None:
                            worldSocket = AffineSocket(tree, localSocket, originalMatrix, 'Original world position')
                        ReplaceLinks(tree, node.outputs['Position'], worldSocket)
                        ValidateAffine(source, originalMatrix, lambda point: originalMatrix @ point, 'Geometry.Position')
                        compensationReport.append({'source': source.name, 'material': materialName,
                                                   'output': 'Geometry.Position',
                                                   'replacement': 'Msource @ self.Object', 'sharedAcrossCells': True})
                    random = node.outputs.get('Random Per Island')
                    if random is not None and random.is_linked:
                        raise RuntimeError('Filtered mesh changes Random Per Island: ' + materialName)
                elif node.bl_idname == 'ShaderNodeObjectInfo':
                    if node.outputs['Location'].is_linked:
                        constant = tree.nodes.new('ShaderNodeCombineXYZ')
                        constant.label = 'Original source world origin'
                        for index in range(3):
                            constant.inputs[index].default_value = originalMatrix.translation[index]
                        ReplaceLinks(tree, node.outputs['Location'], constant.outputs['Vector'])
                        compensationReport.append({'source': source.name, 'material': materialName,
                                                   'output': 'ObjectInfo.Location',
                                                   'constant': list(originalMatrix.translation), 'sharedAcrossCells': True})
                    if node.outputs['Random'].is_linked:
                        raise RuntimeError('Temporary objects cannot safely preserve ObjectInfo.Random: ' + materialName)

        def Material(original, source):
            if original is None:
                return opaque
            key = (source.name, original.name)
            if key not in materialCache:
                result = OwnMaterial(original.copy())
                result.name = 'Material_ExplodedShared_' + source.name + '_' + original.name
                if result.use_nodes and result.node_tree:
                    CompensateTree(result.node_tree, source, original.name)
                materialCache[key] = result
            return materialCache[key]

        highObjects, occluders, groupReports, sourceTargetMapping = [], [], [], []
        targetVertices, targetFaces, targetSurfaceUv, targetGameUv = [], [], [], []
        cosine = math.cos(math.radians(45))
        for cell, (key, group) in enumerate(sorted(groups.items(), key=lambda item: item[0])):
            offset = Vector(((cell % 8)*1.5, (cell // 8)*1.5, 0))
            direction = group['direction']
            sourceCounts = []
            for source in group['sources']:
                cached = cache[source.name]
                ValidateCell(source, cell, offset)
                kept = []
                cornerNormalMinimum = math.cos(math.radians(45))
                normalValues = cached['normals']
                normalMatrix = cached['normalMatrix']
                for index, normal in enumerate(cached['faceNormals']):
                    if normal.dot(direction) < cosine:
                        continue
                    # Preserve source normals while excluding corner fans that
                    # smooth across the reverse side of a folded cloth layer.
                    if all((normalMatrix @ Vector(normalValues[loop*3:loop*3+3])).normalized().dot(direction) >= cornerNormalMinimum
                           for loop in cached['mesh'].polygons[index].loop_indices):
                        kept.append(index)
                # A source may contain only one fibre direction.  It is valid
                # for that source to contribute zero faces to a particular bin.
                if kept:
                    mesh = OwnMesh(cached['mesh'].copy())
                    mesh.name = 'Geometry_ExplodedFiltered_%02d_' % cell + source.name
                    indexName = 'ExplodedOriginalCorner_' + token[:8]
                    attribute = mesh.attributes.new(indexName, 'INT', 'CORNER')
                    attribute.data.foreach_set('value', list(range(len(mesh.loops))))
                    bm = bmesh.new()
                    try:
                        bm.from_mesh(mesh)
                        bm.faces.ensure_lookup_table()
                        allowed = set(kept)
                        bmesh.ops.delete(bm, geom=[face for face in bm.faces if face.index not in allowed], context='FACES')
                        loose = [vertex for vertex in bm.verts if not vertex.link_faces]
                        if loose:
                            bmesh.ops.delete(bm, geom=loose, context='VERTS')
                        bm.to_mesh(mesh)
                    finally:
                        bm.free()
                    mesh.update()
                    attribute = mesh.attributes.get(indexName)
                    if attribute is None:
                        raise RuntimeError('Filtered source lost its corner-normal correspondence')
                    mappedNormals = []
                    for value in attribute.data:
                        start = int(value.value)*3
                        mappedNormals.append(tuple(cached['normals'][start:start+3]))
                    mesh.normals_split_custom_set(mappedNormals)
                    mesh.attributes.remove(attribute)
                    mesh.materials.clear()
                    for original in cached['materials']:
                        mesh.materials.append(Material(original, source))
                    obj = OwnObject('High_Exploded_%02d_' % cell + source.name, mesh)
                    obj.matrix_world = Matrix.Translation(offset) @ cached['matrix']
                    obj.color = source.color
                    obj.pass_index = source.pass_index
                    obj['ExplodedSourceName'] = source.name
                    obj['ExplodedCell'] = cell
                    highObjects.append(obj)
                    sourceCounts.append({'source': source.name, 'temporary': obj.name,
                                         'evaluatedFaces': len(cached['mesh'].polygons), 'filteredFaces': len(mesh.polygons),
                                         'evaluatedVertices': len(cached['mesh'].vertices),
                                         'filteredVertices': len(mesh.vertices), 'originalCornerNormalsPreserved': True})
                else:
                    sourceCounts.append({'source': source.name, 'evaluatedFaces': len(cached['mesh'].polygons),
                                         'filteredFaces': 0, 'filteredVertices': 0})
                # Full evaluated geometry is shared, never copied 26 times.
                occluder = OwnObject('Occluder_Exploded_%02d_' % cell + source.name, cached['mesh'])
                occluder.matrix_world = Matrix.Translation(offset) @ cached['matrix']
                for slot in occluder.material_slots:
                    slot.link = 'OBJECT'
                    slot.material = opaque
                occluder.hide_render = True
                occluder.hide_set(True)
                occluder['ExplodedSourceName'] = source.name
                occluder['ExplodedCell'] = cell
                occluder['FullAoOccluderOnly'] = True
                occluders.append(occluder)
            if not any(item['filteredFaces'] for item in sourceCounts):
                raise RuntimeError('No outward source polygons survived direction bin %d' % cell)
            targetStart = len(targetFaces)
            for triangle in group['triangles']:
                first = len(targetVertices)
                targetVertices.extend(point+offset for point in triangle['positions'])
                targetFaces.append((first, first+1, first+2))
                targetSurfaceUv.extend(triangle['surfaceUV'])
                targetGameUv.extend(triangle['gameUV'])
                sourceTargetMapping.append({'temporaryTriangle': len(targetFaces)-1,
                                            'sourceTarget': triangle['object'], 'part': triangle['part'],
                                            'originalTriangle': triangle['triangle'], 'originalPolygon': triangle['polygon'],
                                            'cell': cell, 'worldTranslation': list(offset),
                                            'gameUV': [list(uv) for uv in triangle['gameUV']]})
            groupReports.append({'cell': cell, 'translation': list(offset), 'dominant26Direction': list(direction),
                                 'minimumSourceFaceDot': cosine, 'sourceNormalConeDegrees': 45,
                                 'targetTriangleRange': [targetStart, len(targetFaces)],
                                 'targetTriangleCount': len(group['triangles']), 'sources': sourceCounts})
            print('EXPLODED_GROUP_READY', cell, len(group['triangles']),
                  sum(item['filteredFaces'] for item in sourceCounts), flush=True)
        targetMesh = OwnMesh(bpy.data.meshes.new('Geometry_ExplodedTarget_' + token[:8]))
        targetMesh.from_pydata(targetVertices, [], targetFaces)
        targetMesh.update()
        firstUv = targetMesh.uv_layers.new(name='SurfaceUV')
        gameUv = targetMesh.uv_layers.new(name='GameUV')
        for index, value in enumerate(targetSurfaceUv):
            firstUv.data[index].uv = value
        for index, value in enumerate(targetGameUv):
            gameUv.data[index].uv = value
        targetMesh.uv_layers.active_index = 1
        gameUv.active_render = True
        for polygon in targetMesh.polygons:
            polygon.use_smooth = False
        target = OwnObject('Game_ExplodedTarget_' + token[:8], targetMesh)
        targetMaterial = OwnMaterial(bpy.data.materials.new('Material_ExplodedTarget_' + token[:8]))
        targetMaterial.use_nodes = True
        targetMesh.materials.append(targetMaterial)
        report = {'generator': generator, 'runId': token, 'collection': collection.name,
                  'part': next(iter(parts)), 'temporaryTarget': target.name,
                  'originalTargets': [obj.name for obj in lowMeshes],
                  'originalTriangleCount': len(originalTriangles), 'temporaryTriangleCount': len(targetFaces),
                  'targetNormals': 'Flat geometric triangle normals; no RGB component flips',
                  'sourceFiltering': 'Evaluated world polygon normal dot dominant26Direction >= cos(45deg)',
                  'cellSpacingM': 1.5, 'grid': [8, max(1, math.ceil(len(groups)/8))], 'groups': groupReports,
                  'sourceTargetMapping': sourceTargetMapping, 'anchorAffineReplacements': anchorReport,
                  'worldPositionCompensations': compensationReport,
                  'sharedMaterialTransforms': True, 'sharedSourceMaterialCount': len(materialCache),
                  'coordinateAffineValidation': coordinateValidation,
                  'cellLocalCoordinateValidation': cellFrameValidation,
                  'fullAoOccluders': [{'object': obj.name, 'source': obj['ExplodedSourceName'],
                                       'cell': obj['ExplodedCell'], 'sharedMesh': obj.data.name} for obj in occluders],
                  'fullEvaluatedMeshCacheCount': len(cache), 'generatedCoordinatesAllowed': False,
                  'allOriginalsUntouched': True,
                  'shaderSharing': 'One material per original source object/material, independent of cell; explicit affine row nodes reconstruct original coordinates'}
        return {'targetObj': target, 'highObjs': highObjects, 'occluderObjects': occluders,
                'cleanup': Cleanup, 'report': report}
    except BaseException:
        Cleanup()
        raise
