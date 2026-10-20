"""One joined DIFFUSE COLOR bake, scattered back to unchanged source copies.

No Blender process or top-level scene operation is started by this module.
The input objects, mesh topology and material references remain owned by caller.
"""

import time

import numpy as np


_TARGET = 'BR_original_low_frequency_color'
_LOOP_ID = 'OriginalLoopId'
_BAKE_UV = 'StrawSourceBakeUV'
_ALLOWED_BASE = {'ShaderNodeMapping', 'ShaderNodeMix', 'ShaderNodeTexImage',
                 'ShaderNodeUVMap', 'ShaderNodeVertexColor', 'NodeReroute'}


def ScatterLoopColors(loopIds, colors, totalLoops):
    """Validate a bijection and recover original CORNER order without sorting."""
    ids = np.asarray(loopIds, dtype=np.int64).reshape(-1)
    colors = np.asarray(colors, dtype=np.float32).reshape(-1, 4)
    if len(ids) != totalLoops or len(colors) != totalLoops:
        raise ValueError('Joined bake changed the total corner count')
    if not totalLoops or ids.min() < 1 or ids.max() > totalLoops:
        raise ValueError('OriginalLoopId is missing or outside its global range')
    counts = np.bincount(ids - 1, minlength=totalLoops)
    if not np.all(counts == 1):
        raise ValueError('OriginalLoopId is not a complete one-to-one mapping')
    if not np.isfinite(colors).all():
        raise ValueError('The joined source bake contains nonfinite colour')
    result = np.empty_like(colors)
    result[ids - 1] = colors
    return result


def BaseNodes(material):
    if not material.use_nodes:
        return []
    principals = [node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED']
    if len(principals) != 1:
        raise ValueError(f'{material.name}: expected one native Principled source shader')
    pending = [link.from_node for link in principals[0].inputs['Base Color'].links]
    found, seen = [], set()
    while pending:
        node = pending.pop()
        if node.as_pointer() in seen:
            continue
        seen.add(node.as_pointer())
        if node.bl_idname not in _ALLOWED_BASE:
            raise ValueError(f'{material.name}: joined bake cannot preserve Base dependency {node.bl_idname}')
        found.append(node)
        for socket in node.inputs:
            pending.extend(link.from_node for link in socket.links)
    return found


def PrivateMaterial(original, materials, receipt):
    """Material nodes are private; images and explicit UV links stay untouched."""
    nodes = BaseNodes(original)
    result = original.copy()
    materials.append(result)
    if not result.use_nodes:
        color = tuple(original.diffuse_color)
        result.use_nodes = True
        principled = next(node for node in result.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
        principled.inputs['Base Color'].default_value = color
        principled.inputs['Alpha'].default_value = color[3]
        receipt['constantMaterialsMadeExplicit'] += 1
    tree = result.node_tree
    uvNode = None
    for node in tree.nodes:
        if node.type == 'VERTEX_COLOR' and not node.layer_name:
            node.layer_name = 'Color'
            receipt['emptyVertexColorNodesBoundToColor'] += 1
        elif node.type == 'UVMAP' and not node.uv_map:
            node.uv_map = _BAKE_UV
        elif node.type == 'TEX_IMAGE' and not node.inputs['Vector'].is_linked:
            if uvNode is None:
                uvNode = tree.nodes.new('ShaderNodeUVMap')
                uvNode.name = 'SourceActiveRenderUvForJoinedBake'
                uvNode.uv_map = _BAKE_UV
            tree.links.new(uvNode.outputs['UV'], node.inputs['Vector'])
            receipt['unlinkedImageVectorsMadeExplicit'] += 1
    receipt['baseNodeTypes'].update(node.bl_idname for node in nodes)
    return result


def BakeJoinedSourceColors(copies):
    """Bake temporary clones once; update only caller's existing target RGBA."""
    import bpy

    started = time.perf_counter()
    copies = list(copies)
    if not copies or len({obj.as_pointer() for obj in copies}) != len(copies):
        raise ValueError('Expected a nonempty list of distinct source-copy objects')
    if len({obj.data.as_pointer() for obj in copies}) != len(copies):
        raise ValueError('Source copies must have independent mesh datablocks')
    records, offset = [], 0
    for obj in copies:
        if obj.type != 'MESH' or obj.modifiers or obj.data.shape_keys:
            raise ValueError(f'{obj.name}: joined colour bake requires unmodified mesh topology')
        target = obj.data.color_attributes.get(_TARGET)
        if target is None or target.domain != 'CORNER' or target.data_type != 'FLOAT_COLOR':
            raise ValueError(f'{obj.name}: missing explicit FLOAT_COLOR CORNER target')
        count = len(obj.data.loops)
        if len(target.data) != count or count == 0:
            raise ValueError(f'{obj.name}: invalid target corner count')
        activeUv = next((layer for layer in obj.data.uv_layers if layer.active_render), obj.data.uv_layers.active)
        for material in obj.data.materials:
            if material is None:
                raise ValueError(f'{obj.name}: unbound source material slot')
            for node in BaseNodes(material):
                if node.type == 'TEX_IMAGE' and not node.inputs['Vector'].is_linked and activeUv is None:
                    raise ValueError(f'{obj.name}: an implicit Base image has no original render UV')
                if node.type == 'UVMAP' and node.uv_map and obj.data.uv_layers.get(node.uv_map) is None:
                    raise ValueError(f'{obj.name}: source shader references missing UV {node.uv_map}')
        records.append({'object': obj, 'name': obj.name, 'start': offset, 'loops': count,
                        'renderUv': activeUv.name if activeUv else None,
                        'hideRender': obj.hide_render, 'hidden': obj.hide_get()})
        offset += count
    totalLoops = offset
    if totalLoops >= np.iinfo(np.int32).max:
        raise ValueError('Global corner identity exceeds INT storage')
    scene, viewLayer = bpy.context.scene, bpy.context.view_layer
    if bpy.context.mode != 'OBJECT':
        raise ValueError('Joined source bake must run in Object mode')
    selection = [obj for obj in viewLayer.objects if obj.select_get()]
    activeObject = viewLayer.objects.active
    bake = scene.render.bake
    state = {'engine': scene.render.engine, 'samples': scene.cycles.samples,
             'device': scene.cycles.device, 'threadsMode': scene.render.threads_mode,
             'threads': scene.render.threads,
             'bake': {name: getattr(bake, name) for name in ('target', 'use_selected_to_active',
                     'use_pass_direct', 'use_pass_indirect', 'use_pass_color', 'use_clear')}}
    temporaryObjects, temporaryMeshes, temporaryMaterials = [], [], []
    materialCache, joined = {}, None
    stats = {'sourceCopies': len(copies), 'totalLoops': totalLoops, 'bakeCalls': 0,
             'unlinkedImageVectorsMadeExplicit': 0, 'emptyVertexColorNodesBoundToColor': 0,
             'constantMaterialsMadeExplicit': 0, 'missingColorWhiteFallbackObjects': 0,
             'sourceColorLayersNormalizedToFloatCorner': 0,
             'baseNodeTypes': set()}
    try:
        for record in records:
            source = record['object']
            clone = source.copy()
            clone.data = source.data.copy()
            temporaryObjects.append(clone)
            temporaryMeshes.append(clone.data)
            clone.name = 'Temporary_StrawSourceColor'
            scene.collection.objects.link(clone)
            clone.hide_render, clone.hide_viewport = False, False
            clone.hide_set(False)
            mesh = clone.data
            uvValues = np.zeros((record['loops'], 2), dtype=np.float32)
            if record['renderUv'] is not None:
                mesh.uv_layers[record['renderUv']].data.foreach_get('uv', uvValues.ravel())
            previous = mesh.uv_layers.get(_BAKE_UV)
            if previous:
                mesh.uv_layers.remove(previous)
            alias = mesh.uv_layers.new(name=_BAKE_UV)
            alias.data.foreach_set('uv', uvValues.ravel())
            alias.active_render = True
            oldId = mesh.attributes.get(_LOOP_ID)
            if oldId:
                mesh.attributes.remove(oldId)
            identity = mesh.attributes.new(name=_LOOP_ID, type='INT', domain='CORNER')
            identity.data.foreach_set('value', np.arange(record['start'] + 1,
                                     record['start'] + record['loops'] + 1, dtype=np.int32))
            sourceColor = mesh.color_attributes.get('Color')
            if sourceColor is None:
                if mesh.attributes.get('Color') is not None:
                    raise ValueError('A non-colour source attribute conflicts with Color')
                sourceColorValues = np.ones((record['loops'], 4), dtype=np.float32)
                stats['missingColorWhiteFallbackObjects'] += 1
            else:
                if sourceColor.domain not in ('POINT', 'CORNER'):
                    raise ValueError('Unsupported original Color attribute domain')
                sourceColorValues = np.empty((len(sourceColor.data), 4), dtype=np.float32)
                sourceColor.data.foreach_get('color', sourceColorValues.ravel())
                if sourceColor.domain == 'POINT':
                    vertexIds = np.empty(record['loops'], dtype=np.int32)
                    mesh.loops.foreach_get('vertex_index', vertexIds)
                    sourceColorValues = sourceColorValues[vertexIds]
                mesh.color_attributes.remove(sourceColor)
                stats['sourceColorLayersNormalizedToFloatCorner'] += 1
            # Join must not choose between BYTE/POINT and FLOAT/CORNER storage.
            # The .color property already supplies linear RGBA for either type.
            sourceColor = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
            sourceColor.data.foreach_set('color', sourceColorValues.ravel())
            mesh.color_attributes.active_color = mesh.color_attributes[_TARGET]
            for index, material in enumerate(list(mesh.materials)):
                key = material.as_pointer()
                if key not in materialCache:
                    materialCache[key] = PrivateMaterial(material, temporaryMaterials, stats)
                mesh.materials[index] = materialCache[key]
            source.hide_render = True
            source.hide_set(True)
        for obj in viewLayer.objects:
            if obj.select_get():
                obj.select_set(False)
        for obj in temporaryObjects:
            obj.select_set(True)
        viewLayer.objects.active = temporaryObjects[0]
        viewLayer.update()
        result = bpy.ops.object.join()
        if 'FINISHED' not in result:
            raise RuntimeError('Temporary high-source join failed')
        joined = viewLayer.objects.active
        mesh = joined.data
        knownMeshPointers = set()
        for temporaryMesh in temporaryMeshes:
            try:
                knownMeshPointers.add(temporaryMesh.as_pointer())
            except ReferenceError:
                pass
        if mesh.as_pointer() not in knownMeshPointers:
            temporaryMeshes.append(mesh)
        if len(mesh.loops) != totalLoops:
            raise ValueError('Source join changed the original loop count')
        identity = mesh.attributes.get(_LOOP_ID)
        if identity is None or identity.domain != 'CORNER' or identity.data_type != 'INT':
            raise ValueError('Temporary join lost the CORNER OriginalLoopId attribute')
        loopIds = np.empty(totalLoops, dtype=np.int32)
        identity.data.foreach_get('value', loopIds)
        # Validate identity before spending time in Cycles.
        counts = np.bincount(loopIds.astype(np.int64) - 1, minlength=totalLoops) if loopIds.min() >= 1 else np.array([])
        if loopIds.max() > totalLoops or len(counts) != totalLoops or not np.all(counts == 1):
            raise ValueError('Temporary join does not preserve a one-to-one original loop map')
        mesh.uv_layers[_BAKE_UV].active_render = True
        target = mesh.color_attributes.get(_TARGET)
        if target is None or len(target.data) != totalLoops:
            raise ValueError('Temporary join lost the existing CORNER colour target')
        mesh.color_attributes.active_color = target
        scene.render.engine = 'CYCLES'
        scene.cycles.device, scene.cycles.samples = 'CPU', 1
        scene.render.threads_mode, scene.render.threads = 'FIXED', 6
        bake.target, bake.use_selected_to_active = 'VERTEX_COLORS', False
        bake.use_pass_direct, bake.use_pass_indirect = False, False
        bake.use_pass_color, bake.use_clear = True, True
        viewLayer.update()
        stats['bakeCalls'] += 1
        result = bpy.ops.object.bake(type='DIFFUSE')
        if 'FINISHED' not in result:
            raise RuntimeError('Joined DIFFUSE COLOR bake did not finish')
        colors = np.empty((totalLoops, 4), dtype=np.float32)
        target.data.foreach_get('color', colors.ravel())
        ordered = ScatterLoopColors(loopIds, colors, totalLoops)
        # Check every destination before the first write; copies are never
        # replaced, rejoined, reparented, decimated or material-rebound here.
        for record in records:
            source = record['object']
            target = source.data.color_attributes.get(_TARGET)
            if len(source.data.loops) != record['loops'] or target is None or len(target.data) != record['loops']:
                raise ValueError(f'{record["name"]}: caller geometry changed during the temporary bake')
        for record in records:
            start, count = record['start'], record['loops']
            record['object'].data.color_attributes[_TARGET].data.foreach_set('color', ordered[start:start + count].ravel())
        stats.update({'mappingOneToOne': True, 'allColorsFinite': True, 'scatterObjects': len(records),
                      'callerObjectsAndGeometryUnchanged': True, 'callerMaterialReferencesUnchanged': True,
                      'linearRgbMinMax': [float(ordered[:, :3].min()), float(ordered[:, :3].max())],
                      'sourceRenderUvNames': sorted({record['renderUv'] for record in records if record['renderUv']}),
                      'baseNodeTypes': sorted(stats['baseNodeTypes']),
                      'method': 'One DIFFUSE COLOR bake of private joined high clones; original UV/Color semantics explicit; unique CORNER identity scatter'})
    finally:
        # Join removes all but the active object; data-block existence is checked
        # by identity, never by a name that can acquire an automatic suffix.
        for obj in temporaryObjects:
            try:
                if obj.name in bpy.data.objects and bpy.data.objects.get(obj.name) == obj:
                    bpy.data.objects.remove(obj, do_unlink=True)
            except ReferenceError:
                pass
        for mesh in temporaryMeshes:
            try:
                if mesh.users == 0:
                    bpy.data.meshes.remove(mesh)
            except ReferenceError:
                pass
        for material in temporaryMaterials:
            if material.users == 0:
                bpy.data.materials.remove(material)
        for record in records:
            obj = record['object']
            obj.hide_render = record['hideRender']
            obj.hide_set(record['hidden'])
        scene.render.engine = state['engine']
        scene.cycles.samples, scene.cycles.device = state['samples'], state['device']
        scene.render.threads_mode, scene.render.threads = state['threadsMode'], state['threads']
        for name, value in state['bake'].items():
            setattr(bake, name, value)
        for obj in viewLayer.objects:
            if obj.select_get():
                obj.select_set(False)
        for obj in selection:
            try:
                obj.select_set(True)
            except RuntimeError:
                pass
        if activeObject is not None:
            viewLayer.objects.active = activeObject
        viewLayer.update()
    stats['temporaryObjectsRemaining'] = 0
    stats['temporaryMeshesRemaining'] = 0
    stats['seconds'] = time.perf_counter() - started
    return stats
