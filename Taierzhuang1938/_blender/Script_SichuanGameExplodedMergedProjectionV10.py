"""Prepare one merged world-space high source with source-local shader attributes.

No original mesh, material, transform, UV or anchor is changed.  Calling
PrepareExplodedPart returns a dictionary with targetObj, highObjs,
occluderObjects, cleanup and report.  Source-local affine nodes permit one
material per original source/material across all cells. A merged POINT vector
attribute retains original local positions. AO occluders contain only omitted
real-source faces, cached by source/direction, and start hidden. Selected faces
are not duplicated, and synthetic support sources receive no AO occluder.
"""
import array
import math
import uuid

import bpy
import bmesh
from mathutils import Matrix, Vector


generator = 'SichuanExplodedMergedProjectionV10'
originalPointAttribute = 'SichuanOriginalLocalPoint'
sourceConeDegrees = 60


def PrepareExplodedPart(lowMeshes, sourceResolver, collectionName, cellOffsetsByGroup=None):
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
        if cellOffsetsByGroup is not None and any(key not in cellOffsetsByGroup for key in groups):
            raise RuntimeError('Explicit projection cell layout must cover every source/direction group')
        depsgraph = bpy.context.evaluated_depsgraph_get()
        cache = {}
        for name, source in sorted(allSources.items()):
            evaluated = source.evaluated_get(depsgraph)
            mesh = OwnMesh(bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True,
                                                         depsgraph=depsgraph))
            mesh.name = 'Geometry_ExplodedFull_' + token[:8] + '_' + name
            for materialIndex, material in enumerate(list(mesh.materials)):
                if material is not None:
                    mesh.materials[materialIndex] = material.original
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
        normalStrengthOverrides = []

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
            localNode = tree.nodes.new('ShaderNodeAttribute')
            localNode.attribute_name = originalPointAttribute
            localNode.attribute_type = 'GEOMETRY'
            localNode.label = 'Original source local position retained per merged vertex'
            localSocket = localNode.outputs['Vector']
            originalMatrix = cache[source.name]['matrix']
            worldSocket = None
            sourceLayers = cache[source.name]['mesh'].uv_layers
            activeRender = next((layer for layer in sourceLayers if layer.active_render), sourceLayers.active)
            uvName = activeRender.name if activeRender is not None else None
            uvSocket = None
            def ExplicitUv():
                nonlocal uvSocket
                if uvName is None:
                    raise RuntimeError('An implicit shader UV has no original source layer: ' + source.name)
                if uvSocket is None:
                    uvNode = tree.nodes.new('ShaderNodeUVMap')
                    uvNode.uv_map = uvName
                    uvNode.label = 'Preserve original active render UV: ' + uvName
                    uvSocket = uvNode.outputs['UV']
                return uvSocket
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
                    elif node.object is None and node.outputs['Object'].is_linked:
                        ReplaceLinks(tree, node.outputs['Object'], localSocket)
                        compensationReport.append({'source': source.name, 'material': materialName,
                                                   'output': 'Unanchored TexCoord.Object',
                                                   'replacement': originalPointAttribute})
                    if node.outputs['UV'].is_linked:
                        ReplaceLinks(tree, node.outputs['UV'], ExplicitUv())
                elif node.bl_idname == 'ShaderNodeTexImage':
                    if not node.inputs['Vector'].is_linked:
                        tree.links.new(ExplicitUv(), node.inputs['Vector'])
                elif node.bl_idname in ('ShaderNodeUVMap', 'ShaderNodeNormalMap', 'ShaderNodeTangent'):
                    if hasattr(node, 'uv_map') and not node.uv_map:
                        if uvName is None:
                            raise RuntimeError('Implicit UV-dependent source node has no source UV: ' + source.name)
                        node.uv_map = uvName
                elif node.type.startswith('TEX_') and node.inputs.get('Vector') is not None:
                    if not node.inputs['Vector'].is_linked and any(output.is_linked for output in node.outputs):
                        raise RuntimeError('Implicit generated procedural coordinates cannot survive merge: '
                                           + materialName + ' / ' + node.name)
                elif node.bl_idname == 'ShaderNodeNewGeometry':
                    if node.outputs['Position'].is_linked:
                        if worldSocket is None:
                            worldSocket = AffineSocket(tree, localSocket, originalMatrix, 'Original world position')
                        ReplaceLinks(tree, node.outputs['Position'], worldSocket)
                        ValidateAffine(source, originalMatrix, lambda point: originalMatrix @ point, 'Geometry.Position')
                        compensationReport.append({'source': source.name, 'material': materialName,
                                                   'output': 'Geometry.Position',
                                                   'replacement': 'Msource @ self.Object', 'sharedAcrossCells': True})
                    if node.outputs['Tangent'].is_linked:
                        tangent = tree.nodes.new('ShaderNodeTangent')
                        tangent.direction_type = 'UV_MAP'
                        if uvName is None:
                            raise RuntimeError('Geometry.Tangent has no original source UV: ' + source.name)
                        tangent.uv_map = uvName
                        ReplaceLinks(tree, node.outputs['Tangent'], tangent.outputs['Tangent'])
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
                    shader = next(node for node in result.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
                    hadMaterialNormal = shader.inputs['Normal'].is_linked
                    for link in list(shader.inputs['Normal'].links):
                        result.node_tree.links.remove(link)
                    normalStrengthOverrides.append({'source': source.name, 'material': original.name,
                        'method': 'True high smooth geometric normal', 'temporaryMaterialNormalDisconnected': hadMaterialNormal,
                        'originalMaterialUnchanged': True,
                        'reason': 'Geometry-only source projection passes localized material-normal anomaly controls and retains the sculpted cloth folds and woven grass relief'})
                materialCache[key] = result
            return materialCache[key]

        occluderMeshCache = {}

        def OmittedAoMesh(source, cached, kept, directionIndex):
            """Kept source faces plus this complement equal one real source.

            Occluder geometry needs neither source UVs nor shader/custom-normal
            attributes. Compact bare geometry controls memory while repeated
            source/direction masks share the same complement across cells.
            """
            total = len(cached['mesh'].polygons)
            if source.get('GameBakeSupportGenerator') or source.get('SupportForLow'):
                return None, 0, 'Support excluded from auxiliary AO occluders'
            if len(kept) == total:
                return None, 0, 'All real-source faces already selected'
            if not kept:
                return cached['mesh'], total, 'Shared complete cache; no selected faces from this source'
            key = (source.name, directionIndex)
            if key not in occluderMeshCache:
                selected = set(kept)
                faces = [tuple(face.vertices) for face in cached['mesh'].polygons if face.index not in selected]
                if len(faces)+len(selected) != total:
                    raise RuntimeError('AO real-source face partition is incomplete: ' + source.name)
                used = sorted({index for face in faces for index in face})
                remap = {index: compact for compact, index in enumerate(used)}
                mesh = OwnMesh(bpy.data.meshes.new('Geometry_ExplodedOmitted_%02d_' % directionIndex + source.name))
                mesh.from_pydata([cached['mesh'].vertices[index].co for index in used], [],
                                 [tuple(remap[index] for index in face) for face in faces])
                mesh.update()
                mesh.materials.append(opaque)
                mesh['OriginalEvaluatedFaces'] = total
                mesh['SelectedRealSourceFaces'] = len(selected)
                mesh['OmittedRealSourceFaces'] = len(faces)
                mesh['SelectedAndOccluderFacesDisjoint'] = True
                occluderMeshCache[key] = mesh
            mesh = occluderMeshCache[key]
            return mesh, len(mesh.polygons), 'Source/direction cached complement of selected real-source faces'

        highObjects, occluders, groupReports, sourceTargetMapping = [], [], [], []
        targetVertices, targetFaces, targetSurfaceUv, targetGameUv = [], [], [], []
        cosine = math.cos(math.radians(sourceConeDegrees))
        for cell, (key, group) in enumerate(sorted(groups.items(), key=lambda item: item[0])):
            # Centre the isolated cells near the origin.  Each asset spans at
            # most 0.5 m and rays extend 0.045 m, so 0.75 m retains isolation
            # while avoiding float32 inverse-transform loss on thin supports.
            rows = max(1, math.ceil(len(groups)/8))
            offset = Vector(cellOffsetsByGroup[key]) if cellOffsetsByGroup is not None else Vector(((cell % 8-3.5)*.75, (cell // 8-(rows-1)/2)*.75, 0))
            direction = group['direction']
            sourceCounts = []
            for source in group['sources']:
                cached = cache[source.name]
                ValidateCell(source, cell, offset)
                kept = []
                cornerNormalMinimum = math.cos(math.radians(sourceConeDegrees))
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
                # Never put an identical opaque copy over a selected source
                # surface: that creates false self-shadowing in Base/AO.
                # Kept selected faces + omitted occluder faces reconstruct the
                # real original exactly once. Bake underlays are not duplicated.
                occlusionMesh, omittedCount, occlusionMethod = OmittedAoMesh(
                    source, cached, kept, group['directionIndex'])
                sourceCounts[-1]['aoOccluderFaces'] = omittedCount
                sourceCounts[-1]['aoOccluderMethod'] = occlusionMethod
                sourceCounts[-1]['isBakeSupportSource'] = bool(source.get('GameBakeSupportGenerator') or source.get('SupportForLow'))
                if not sourceCounts[-1]['isBakeSupportSource']:
                    if len(kept)+omittedCount != len(cached['mesh'].polygons):
                        raise RuntimeError('Real-source AO partition lost or duplicated faces')
                    sourceCounts[-1]['realSourceFacePartitionVerified'] = True
                if occlusionMesh is not None:
                    occluder = OwnObject('Occluder_Exploded_%02d_' % cell + source.name, occlusionMesh)
                    occluder.matrix_world = Matrix.Translation(offset) @ cached['matrix']
                    for slot in occluder.material_slots:
                        slot.link = 'OBJECT'
                        slot.material = opaque
                    occluder.hide_render = True
                    occluder.hide_set(True)
                    occluder['ExplodedSourceName'] = source.name
                    occluder['ExplodedCell'] = cell
                    occluder['OmittedFacesAoOccluderOnly'] = True
                    occluder['OriginalEvaluatedFaces'] = len(cached['mesh'].polygons)
                    occluder['SelectedRealSourceFaces'] = len(kept)
                    occluder['OmittedRealSourceFaces'] = omittedCount
                    occluder['AoOccluderMethod'] = occlusionMethod
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
                                 'minimumSourceFaceDot': cosine, 'sourceNormalConeDegrees': sourceConeDegrees,
                                 'targetTriangleRange': [targetStart, len(targetFaces)],
                                 'targetTriangleCount': len(group['triangles']), 'sources': sourceCounts})
            print('EXPLODED_GROUP_READY', cell, len(group['triangles']),
                  sum(item['filteredFaces'] for item in sourceCounts), flush=True)
        # Build one selected high source.  Surface positions are world-space
        # exploded coordinates, while POINT data keeps each original local
        # coordinate for its source-specific shared affine material.
        oldHighObjects = list(highObjects)
        uvNames = sorted({layer.name for obj in oldHighObjects for layer in obj.data.uv_layers})
        if len(uvNames) > 8:
            raise RuntimeError('Source UV name union exceeds the supported eight mesh UV layers')
        mergedPositions, mergedFaces, smoothFlags, materialIds = [], [], [], []
        localPoints, worldNormals = array.array('f'), array.array('f')
        uvBuffers = {name: array.array('f') for name in uvNames}
        materialSlots, materialLookup = [], {}
        mergeSources = []
        for obj in oldHighObjects:
            mesh = obj.data
            vertexOffset, loopOffset, faceOffset = len(mergedPositions), len(worldNormals)//3, len(mergedFaces)
            local = array.array('f', [0]) * (len(mesh.vertices)*3)
            mesh.vertices.foreach_get('co', local)
            localPoints.extend(local)
            mergedPositions.extend(obj.matrix_world @ vertex.co for vertex in mesh.vertices)
            mergedFaces.extend(tuple(vertexOffset+index for index in face.vertices) for face in mesh.polygons)
            smoothFlags.extend(face.use_smooth for face in mesh.polygons)
            sourceSlots = []
            for material in mesh.materials:
                if material not in materialLookup:
                    materialLookup[material] = len(materialSlots)
                    materialSlots.append(material)
                sourceSlots.append(materialLookup[material])
            if not sourceSlots:
                if opaque not in materialLookup:
                    materialLookup[opaque] = len(materialSlots)
                    materialSlots.append(opaque)
                sourceSlots = [materialLookup[opaque]]
            materialIds.extend(sourceSlots[face.material_index] for face in mesh.polygons)
            normals = array.array('f', [0]) * (len(mesh.loops)*3)
            mesh.corner_normals.foreach_get('vector', normals)
            normalMatrix = obj.matrix_world.to_3x3().inverted_safe().transposed()
            identity = max(abs(normalMatrix[row][column]-(1 if row == column else 0))
                           for row in range(3) for column in range(3)) < 1e-10
            if identity:
                worldNormals.extend(normals)
            else:
                for index in range(0, len(normals), 3):
                    worldNormals.extend((normalMatrix @ Vector(normals[index:index+3])).normalized())
            for name in uvNames:
                layer = mesh.uv_layers.get(name)
                buffer = array.array('f', [0]) * (len(mesh.loops)*2)
                if layer is not None:
                    layer.data.foreach_get('uv', buffer)
                uvBuffers[name].extend(buffer)
            # These checks compare actual values that will be stored in the
            # attribute and positions, before Blender's float32 storage.
            maximum = 0.0
            for index in sorted({round(i*(len(mesh.vertices)-1)/8) for i in range(9)}):
                savedLocal = Vector(localPoints[(vertexOffset+index)*3:(vertexOffset+index+1)*3])
                maximum = max(maximum, (savedLocal-mesh.vertices[index].co).length)
            if maximum > 1e-6:
                raise RuntimeError('Merged local-point attribute differs from real source positions')
            mergeSources.append({'temporarySource': obj.name, 'originalSource': obj['ExplodedSourceName'],
                                 'cell': obj['ExplodedCell'], 'vertexRange': [vertexOffset, len(mergedPositions)],
                                 'loopRange': [loopOffset, len(worldNormals)//3],
                                 'faceRange': [faceOffset, len(mergedFaces)], 'localAttributeError': maximum})
        mergedMesh = OwnMesh(bpy.data.meshes.new('Geometry_ExplodedMergedSource_' + token[:8]))
        mergedMesh.from_pydata(mergedPositions, [], mergedFaces)
        mergedMesh.update()
        for material in materialSlots:
            mergedMesh.materials.append(material)
        mergedMesh.polygons.foreach_set('material_index', materialIds)
        mergedMesh.polygons.foreach_set('use_smooth', smoothFlags)
        for name in uvNames:
            layer = mergedMesh.uv_layers.new(name=name)
            layer.data.foreach_set('uv', uvBuffers[name])
        if uvNames:
            activeUvName = 'UVMap' if 'UVMap' in uvNames else uvNames[0]
            mergedMesh.uv_layers.active = mergedMesh.uv_layers[activeUvName]
            mergedMesh.uv_layers[activeUvName].active_render = True
        else:
            activeUvName = None
        pointAttribute = mergedMesh.attributes.new(originalPointAttribute, 'FLOAT_VECTOR', 'POINT')
        pointAttribute.data.foreach_set('vector', localPoints)
        for obj, evidence in zip(oldHighObjects, mergeSources):
            start = evidence['vertexRange'][0]
            pointError, worldError = 0.0, 0.0
            for index in sorted({round(i*(len(obj.data.vertices)-1)/8) for i in range(9)}):
                expected = obj.data.vertices[index].co
                actual = pointAttribute.data[start+index].vector
                pointError = max(pointError, (actual-expected).length)
                worldError = max(worldError, (mergedMesh.vertices[start+index].co-(obj.matrix_world @ expected)).length)
            if max(pointError, worldError) > 1e-6:
                raise RuntimeError('Stored merged source coordinates exceeded 1e-6')
            evidence['storedPointAttributeError'] = pointError
            evidence['storedWorldPositionError'] = worldError
            evidence['storedCoordinateTolerance'] = 1e-6
        mergedMesh.normals_split_custom_set([tuple(worldNormals[index:index+3])
                                            for index in range(0, len(worldNormals), 3)])
        merged = OwnObject('High_ExplodedMergedSource_' + token[:8], mergedMesh)
        merged['ExplodedMergedSourceCount'] = len(oldHighObjects)
        merged['OriginalLocalPointAttribute'] = originalPointAttribute
        # Remove the now-merged temporary sources, leaving one selected source
        # object.  Cached full AO geometry and all originals remain untouched.
        for obj in oldHighObjects:
            mesh = obj.data
            ownedObjects.remove(obj)
            bpy.data.objects.remove(obj, do_unlink=True)
            ownedMeshes.remove(mesh)
            if mesh.users != 0:
                raise RuntimeError('Unexpected external user of owned filtered temporary mesh')
            bpy.data.meshes.remove(mesh)
        highObjects = [merged]
        mergeReport = {'selectedHighObjectsBefore': len(oldHighObjects), 'selectedHighObjectsAfter': 1,
                       'vertices': len(mergedMesh.vertices), 'faces': len(mergedMesh.polygons),
                       'loops': len(mergedMesh.loops), 'materialCount': len(materialSlots),
                       'uvNameUnion': uvNames, 'activeUv': activeUvName,
                       'pointAttribute': originalPointAttribute, 'pointAttributeDomain': 'POINT',
                       'pointAttributeType': 'FLOAT_VECTOR', 'customNormals': 'Actual source corner normals transformed to world',
                       'sourceRanges': mergeSources}
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
                  'sourceFiltering': 'Evaluated world face AND every original corner geometric normal dot dominant26Direction >= cos(%gdeg)' % sourceConeDegrees,
                  'sourceFilterChoice': '60-degree cone retains sloped rolled-grass faces deleted by the former 45-degree cone; maximum 26-bin deviation 27.4 degrees gives an 87.4-degree geometric bound. Actual shader normals still require the unchanged strict baked-normal gate.',
                  'sourceNormalConeDegrees': sourceConeDegrees,
                  'microNormalConeDegrees': 0.0,
                  'sourceMaterialNormalPolicy': 'True high smooth geometric normals; temporary BSDF.Normal links disconnected, original source materials unchanged',
                  'normalStrengthOverrides': normalStrengthOverrides,
                  'cellSpacingM': .75, 'gridOrigin': 'Centred on the original origin', 'grid': [8, max(1, math.ceil(len(groups)/8))], 'groups': groupReports,
                  'explicitOriginalBatchCellOffsets': cellOffsetsByGroup is not None,
                  'sourceTargetMapping': sourceTargetMapping, 'anchorAffineReplacements': anchorReport,
                  'worldPositionCompensations': compensationReport,
                  'sharedMaterialTransforms': True, 'sharedSourceMaterialCount': len(materialCache),
                  'mergedHighSource': mergeReport,
                  'coordinateAffineValidation': coordinateValidation,
                  'cellLocalCoordinateValidation': cellFrameValidation,
                  'aoOccluders': [{'object': obj.name, 'source': obj['ExplodedSourceName'],
                                   'cell': obj['ExplodedCell'], 'sharedMesh': obj.data.name,
                                   'selectedFaces': obj['SelectedRealSourceFaces'],
                                   'occluderFaces': obj['OmittedRealSourceFaces'],
                                   'originalFaces': obj['OriginalEvaluatedFaces'],
                                   'method': obj['AoOccluderMethod']} for obj in occluders],
                  'aoSourcePartition': 'Each real original is represented once by selected kept faces plus omitted-only occluder faces; no support full-mesh occluders',
                  'aoComplementMeshCacheCount': len(occluderMeshCache),
                  'fullEvaluatedMeshCacheCount': len(cache), 'generatedCoordinatesAllowed': False,
                  'allOriginalsUntouched': True,
                  'shaderSharing': 'One merged selected source; one material per original source/material; explicit affine rows use original-local POINT vector attribute'}
        return {'targetObj': target, 'highObjs': highObjects, 'occluderObjects': occluders,
                'cleanup': Cleanup, 'report': report}
    except BaseException:
        Cleanup()
        raise
