"""QualityV12 native-geometry PBR bake and explicit preview fallback.

BakeQualityPbr is the main route: one 4096 QualityUV atlas per part; self-bake
actual native Base/Roughness/AO and tangent Normal. Each temporary object is
Smart UV projected separately, then placed by a Python rectangle treemap;
the unstable multi-object UV packer is not called. Native UV coordinates are
made explicit in copied shader graphs before the target UV becomes active.

This is deliberately not a full-PBR texture exporter. Complex native Base
Color graphs are actually sampled by Cycles into linear CORNER colours;
glTF COLOR_0 carries those samples. Roughness is sampled but approximated by
one measured mean per original material slot. Optional AO remains a separate
diagnostic attribute; it is not multiplied into Base Color. Optional shader
normal sampling becomes custom corner normals and loses sub-corner detail.

The editable Quality .blend is the full native-material master. No decimate,
UV unwrap, source material edits, source saves, or old 3000-triangle gate run.
Importing the module has no scene side effects. Probe before a full export.
"""
import array
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import runpy
import struct
import time


PARTS = ('Pack_Bundle', 'Pack_Binding', 'Pack_Jacket', 'Pack_StrawMat', 'Pack_Sandals')
BASE_ATTRIBUTE = 'QualityBaseLinearV12'
GENERATOR = 'SichuanQualityVertexPreviewV12'


def Require(condition, message):
    if not condition:
        raise RuntimeError(message)


def Evidence(filePath):
    filePath = Path(filePath).resolve()
    digest = hashlib.sha256()
    with filePath.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return {'path': str(filePath), 'bytes': filePath.stat().st_size, 'sha256': digest.hexdigest()}


def MeshDigest(mesh, ignoreUv=()):
    digest = hashlib.sha256()
    values = array.array('f', [0]) * (len(mesh.vertices) * 3)
    mesh.vertices.foreach_get('co', values)
    digest.update(values.tobytes())
    indices = array.array('i', [0]) * len(mesh.loops)
    mesh.loops.foreach_get('vertex_index', indices)
    digest.update(indices.tobytes())
    starts = array.array('i', [0]) * len(mesh.polygons)
    mesh.polygons.foreach_get('loop_start', starts)
    digest.update(starts.tobytes())
    uvHashes = {}
    for layer in mesh.uv_layers:
        if layer.name in ignoreUv:
            continue
        coordinates = array.array('f', [0]) * (len(layer.data) * 2)
        layer.data.foreach_get('uv', coordinates)
        raw = coordinates.tobytes()
        uvHashes[layer.name] = hashlib.sha256(raw).hexdigest()
        digest.update(layer.name.encode('utf8'))
        digest.update(raw)
    return {'geometryAndUvsSha256': digest.hexdigest(), 'uvLayerHashes': uvHashes}


def SourcePart(obj, root):
    current = obj
    while current and current != root:
        if current.name in PARTS:
            return current.name
        current = current.parent
    return None


def ParentDepth(obj):
    """Object has parent/children APIs; Blender 5.2 has no parent_recursive."""
    depth, seen = 0, set()
    current = obj.parent
    while current is not None:
        key = current.as_pointer()
        Require(key not in seen, 'Cyclic native object parent chain: '+obj.name)
        seen.add(key); depth += 1; current = current.parent
    return depth


def NativeMaterials(obj):
    return [slot.material for slot in obj.material_slots]


def SourceInventory(root):
    """Read native/evaluated topology and shader facts; do not mutate source."""
    import bpy
    Require(root and root.name == 'Pack_Root', 'Pass this asset\'s native Pack_Root')
    depsgraph = bpy.context.evaluated_depsgraph_get()
    result = []
    for obj in root.children_recursive:
        if obj.type != 'MESH' or obj.get('BakeOnly') or obj.get('GameBakeSupportGenerator'):
            continue
        part = SourcePart(obj, root)
        Require(part in PARTS, 'Native mesh is outside its controlled component: ' + obj.name)
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
        try:
            result.append({'object': obj.name, 'part': part, 'visible': not obj.hide_render and not obj.get('QualityExportExclude'),
                           'qualityExportExcluded': bool(obj.get('QualityExportExclude')),
                           'nativeVertices': len(obj.data.vertices),
                           'evaluatedVertices': len(mesh.vertices), 'evaluatedCorners': len(mesh.loops),
                           'evaluatedTriangles': sum(len(face.vertices)-2 for face in mesh.polygons),
                           'uvLayers': [layer.name for layer in mesh.uv_layers],
                           'materials': [material.name if material else None for material in NativeMaterials(obj)],
                           'shaderNodes': sorted(set(node.bl_idname for material in NativeMaterials(obj)
                                                    if material and material.use_nodes
                                                    for node in material.node_tree.nodes)),
                           'estimatedOneFloatCornerColourBytes': len(mesh.loops)*16})
        finally:
            evaluated.to_mesh_clear()
    return result


def _Principled(material):
    Require(material and material.use_nodes and material.node_tree,
            'Native material has no supported node graph')
    shaders = [node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED']
    outputs = [node for node in material.node_tree.nodes if node.type == 'OUTPUT_MATERIAL']
    Require(len(shaders) == 1 and outputs,
            'Probe needs exactly one native Principled shader, with no silent diffuse fallback: ' + material.name)
    output = next((node for node in outputs if node.is_active_output), outputs[0])
    return shaders[0], output


def _BakeMaterial(original, channel, aoDistance):
    """Copy only; the whole actual source socket feeds an emission target."""
    material = original.copy()
    material.name = 'Material_QualitySampleV12_' + channel + '_' + original.name
    shader, output = _Principled(material)
    tree = material.node_tree
    emission = tree.nodes.new('ShaderNodeEmission')
    emission.inputs['Strength'].default_value = 1
    if channel in ('Base', 'Roughness'):
        socket = shader.inputs['Base Color' if channel == 'Base' else 'Roughness']
        if socket.is_linked:
            tree.links.new(socket.links[0].from_socket, emission.inputs['Color'])
        else:
            value = socket.default_value
            emission.inputs['Color'].default_value = (value, value, value, 1) if channel == 'Roughness' else tuple(value)
    elif channel == 'Ao':
        ao = tree.nodes.new('ShaderNodeAmbientOcclusion')
        ao.only_local = False
        ao.inputs['Distance'].default_value = aoDistance
        tree.links.new(ao.outputs['AO'], emission.inputs['Color'])
    elif channel == 'ShaderNormal':
        socket = shader.inputs['Normal']
        if socket.is_linked:
            normal = socket.links[0].from_socket
        else:
            normal = tree.nodes.new('ShaderNodeNewGeometry').outputs['Normal']
        scale = tree.nodes.new('ShaderNodeVectorMath')
        scale.operation = 'MULTIPLY'; scale.inputs[1].default_value = (.5, .5, .5)
        offset = tree.nodes.new('ShaderNodeVectorMath')
        offset.operation = 'ADD'; offset.inputs[1].default_value = (.5, .5, .5)
        tree.links.new(normal, scale.inputs[0]); tree.links.new(scale.outputs['Vector'], offset.inputs[0])
        tree.links.new(offset.outputs['Vector'], emission.inputs['Color'])
    else:
        raise RuntimeError('Unsupported actual shader sampling channel: ' + channel)
    for link in list(output.inputs['Surface'].links):
        tree.links.remove(link)
    tree.links.new(emission.outputs['Emission'], output.inputs['Surface'])
    return material


def _ActivateColour(mesh, name):
    attribute = mesh.color_attributes.get(name)
    if attribute is None:
        attribute = mesh.color_attributes.new(name=name, type='FLOAT_COLOR', domain='CORNER')
    Require(attribute.domain == 'CORNER' and attribute.data_type == 'FLOAT_COLOR',
            'Quality shader samples must be linear FLOAT_COLOR on real corners')
    mesh.color_attributes.active_color = attribute
    mesh.color_attributes.render_color_index = mesh.color_attributes.find(name)
    return attribute


def _ReadColours(attribute):
    values = array.array('f', [0]) * (len(attribute.data)*4)
    attribute.data.foreach_get('color', values)
    Require(all(math.isfinite(value) for value in values), 'Cycles vertex bake contains nonfinite values')
    Require(all(values[index] > .99 for index in range(3, len(values), 4)),
            'Cycles vertex bake did not write every target corner alpha')
    return values


def _Statistics(values):
    count = len(values)//4
    return {'corners': count,
            'rgbMinimum': [min(values[index::4], default=0) for index in range(3)],
            'rgbMaximum': [max(values[index::4], default=0) for index in range(3)],
            'rgbMean': [sum(values[index::4])/max(1, count) for index in range(3)],
            'linearFloatRgbaSha256': hashlib.sha256(values.tobytes()).hexdigest()}


def _RoughnessBySlot(mesh, values, slots):
    sums, counts, minima, maxima = [0.]*slots, [0]*slots, [1.]*slots, [0.]*slots
    for polygon in mesh.polygons:
        slot = polygon.material_index
        for loop in polygon.loop_indices:
            value = float(values[loop*4])
            Require(0 <= value <= 1.0001, 'Native source roughness is outside the physical 0..1 range')
            sums[slot] += value; counts[slot] += 1
            minima[slot] = min(minima[slot], value); maxima[slot] = max(maxima[slot], value)
    return [{'slot': slot, 'sampledCorners': counts[slot],
             'sampledRange': [minima[slot], maxima[slot]] if counts[slot] else None,
             'runtimeConstant': sums[slot]/counts[slot] if counts[slot] else 1.,
             'approximation': 'Unweighted mean of actual native shader samples on this material\'s corners'}
            for slot in range(slots)]


def _InstallSampledNormals(obj, values):
    """Native normal sockets are world space; convert to mesh-local normals."""
    from mathutils import Vector
    worldToLocalNormal = obj.matrix_world.to_3x3().transposed()
    normals = []
    for index in range(0, len(values), 4):
        normal = Vector(tuple(2*values[index+axis]-1 for axis in range(3)))
        Require(normal.length > .05, 'Shader-normal vertex sample is too short to normalize')
        normal = worldToLocalNormal @ normal
        normal.normalize(); normals.append(normal)
    obj.data.normals_split_custom_set(normals)
    obj.data.update()
    return {'method': 'Native world shader-normal socket encoded as RGB; Cycles EMIT corner samples decoded and normalized in mesh-local space',
            'corners': len(normals), 'runtimeNormalTexture': False,
            'limitation': 'Only corner-frequency normals survive; fine image/procedural detail between corners is not retained'}


def _RuntimeMaterial(original, roughness):
    import bpy
    material = bpy.data.materials.new('Material_QualityVertexV12_' + original.name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    shader = nodes.new('ShaderNodeBsdfPrincipled')
    colour = nodes.new('ShaderNodeVertexColor'); colour.layer_name = BASE_ATTRIBUTE
    links.new(colour.outputs['Color'], shader.inputs['Base Color'])
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = 0
    links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    material['QualityPreviewApproximation'] = 'Actual native Base samples in COLOR_0; mean sampled roughness; no full native PBR equivalence'
    return material


def _ReadGlb(filePath):
    payload = Path(filePath).read_bytes()
    Require(payload[:4] == b'glTF' and struct.unpack_from('<I', payload, 4)[0] == 2,
            'Expected GLB 2 output')
    Require(struct.unpack_from('<I', payload, 8)[0] == len(payload), 'GLB byte length mismatch')
    chunks, position = [], 12
    while position < len(payload):
        length, kind = struct.unpack_from('<I4s', payload, position)
        position += 8; chunks.append((kind, payload[position:position+length])); position += length
    document = json.loads(next(data for kind, data in chunks if kind == b'JSON').rstrip(b' \0'))
    binary = next(data for kind, data in chunks if kind == b'BIN\0')
    return document, binary


def _WriteGlb(filePath, document, binary):
    text = json.dumps(document, separators=(',', ':'), ensure_ascii=False).encode('utf8')
    text += b' ' * (-len(text) % 4); binary += b'\0' * (-len(binary) % 4)
    payload = (struct.pack('<4sII', b'glTF', 2, 28+len(text)+len(binary)) +
               struct.pack('<I4s', len(text), b'JSON') + text +
               struct.pack('<I4s', len(binary), b'BIN\0') + binary)
    Path(filePath).write_bytes(payload)


def _Accessor(document, binary, accessorId):
    accessor = document['accessors'][accessorId]
    Require('sparse' not in accessor, 'Unexpected sparse GLB attribute')
    view = document['bufferViews'][accessor['bufferView']]
    code, byteSize, limit = {5121: ('B', 1, 255), 5123: ('H', 2, 65535),
                             5125: ('I', 4, 4294967295), 5126: ('f', 4, 1)}[accessor['componentType']]
    components = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[accessor['type']]
    offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    stride = view.get('byteStride', byteSize*components)
    for index in range(accessor['count']):
        values = struct.unpack_from('<'+code*components, binary, offset+stride*index)
        yield tuple(value/limit for value in values) if accessor.get('normalized') else values


def VerifyQualityGlb(filePath, expectedTriangles, partial=False):
    """Check the actual GLB, without old UV-per-triangle or triangle limits."""
    document, binary = _ReadGlb(filePath)
    for node in document['nodes']:
        original = node.get('extras', {}).get('QualityExportOriginalName')
        if original:
            node['name'] = original
    _WriteGlb(filePath, document, binary)
    roots = document['scenes'][document.get('scene', 0)]['nodes']
    Require(len(roots) == 1 and document['nodes'][roots[0]].get('name') == 'Pack_Root',
            'Quality GLB requires one independent Pack_Root')
    root = document['nodes'][roots[0]]
    Require(not any(key in root for key in ('matrix', 'rotation', 'translation', 'scale')) or
            (root.get('translation', [0, 0, 0]) == [0, 0, 0] and root.get('rotation', [0, 0, 0, 1]) == [0, 0, 0, 1] and root.get('scale', [1, 1, 1]) == [1, 1, 1] and 'matrix' not in root),
            'Quality root pivot lost identity transform')
    counts = {name: 0 for name in PARTS}; colours = []; normals = 0; seen = set()

    def Walk(index, owner=None):
        nonlocal normals
        Require(index not in seen, 'Repeated quality node'); seen.add(index)
        node = document['nodes'][index]
        if node.get('name') in PARTS:
            owner = node['name']
        if 'mesh' in node:
            Require(owner in PARTS, 'Exported quality mesh is outside the controlled components')
            for primitive in document['meshes'][node['mesh']]['primitives']:
                attributes = primitive['attributes']
                Require(primitive.get('mode', 4) == 4 and all(name in attributes for name in ('POSITION', 'NORMAL', 'COLOR_0')),
                        'Actual quality primitive lost triangles, native normals or baked COLOR_0')
                count = document['accessors'][primitive['indices']]['count'] if 'indices' in primitive else document['accessors'][attributes['POSITION']]['count']
                Require(count % 3 == 0, 'Invalid quality triangle index count'); counts[owner] += count//3
                color = document['accessors'][attributes['COLOR_0']]
                Require(color['count'] == document['accessors'][attributes['POSITION']]['count'], 'Quality COLOR_0 does not cover every exported position')
                minimum, maximum = [math.inf]*3, [-math.inf]*3
                for value in _Accessor(document, binary, attributes['COLOR_0']):
                    Require(all(math.isfinite(component) for component in value), 'Actual COLOR_0 contains nonfinite data')
                    for axis in range(3):
                        minimum[axis] = min(minimum[axis], value[axis]); maximum[axis] = max(maximum[axis], value[axis])
                for value in _Accessor(document, binary, attributes['NORMAL']):
                    Require(all(math.isfinite(component) for component in value) and .98 < sum(component*component for component in value) < 1.02,
                            'Actual exported quality NORMAL is invalid')
                    normals += 1
                material = document['materials'][primitive['material']].get('pbrMetallicRoughness', {})
                Require(material.get('metallicFactor', 1) == 0 and material.get('baseColorFactor', [1, 1, 1, 1]) == [1, 1, 1, 1],
                        'Vertex Base was tinted or converted to a metal material during export')
                colours.append({'object': node['name'], 'vertices': color['count'], 'rgbRange': [minimum, maximum]})
        for child in node.get('children', []):
            Walk(child, owner)

    Walk(roots[0])
    Require(counts == expectedTriangles, 'Actual high-geometry triangle counts changed during export')
    Require(partial or all(value > 0 for value in counts.values()), 'Quality GLB lacks a complete controlled component')
    return {'trianglesByPart': counts, 'totalTriangles': sum(counts.values()),
            'triangleLimit': None, 'uvPerTrianglePixelGate': False, 'colorAttributes': colours,
            'normalVerticesChecked': normals, 'rootPivotIdentity': True, 'upAxis': '+Y',
            'nativeAxes': 'Blender Z up, -Y outward; glTF +Y up, +Z outward',
            'fullPbrTexturesPreserved': False, 'partialProbe': partial}


def ExportQualityPreview(root, exportFile, *, samples=16, sourceNames=None,
                         bakeAo=False, aoDistance=.010, normalMode='geometry',
                         allowPartialProbe=False):
    """Run in the task's saved QualityV12 copy; export without saving native.

    normalMode='shader-corner' is experimental: run the probe first. The
    conservative default retains evaluated geometric/custom normals.
    """
    import bpy
    from mathutils import Matrix
    Require(root and root.name == 'Pack_Root', 'Pass the original Quality Pack_Root')
    Require('Quality' in str(Path(bpy.data.filepath).parent), 'Open this task\'s separately saved Quality source before exporting')
    Require(normalMode in ('geometry', 'shader-corner'), 'Unknown quality normal sampling policy')
    Require(sourceNames is None or allowPartialProbe, 'Partial export is probe-only, not a complete quality delivery')
    Require(all(abs(root.matrix_world[row][column]-Matrix.Identity(4)[row][column]) < 1e-7 for row in range(4) for column in range(4)), 'Native Pack_Root must retain the back-centre identity pivot')
    for part in PARTS:
        Require(any(child.name == part for child in root.children), 'Native quality source lacks independent '+part)
    sourcePath = bpy.data.filepath
    exportFile = Path(exportFile).resolve(); exportFile.parent.mkdir(parents=True, exist_ok=True)
    started = time.time(); scene = bpy.context.scene
    sourceMeshes = [obj for obj in root.children_recursive if obj.type == 'MESH' and not obj.hide_render and not obj.get('QualityExportExclude')
                    and not obj.get('BakeOnly') and not obj.get('GameBakeSupportGenerator')
                    and (sourceNames is None or obj.name in set(sourceNames))]
    Require(sourceMeshes, 'No visible quality meshes selected for sampling')
    Require(sourceNames is None or set(sourceNames) == {obj.name for obj in sourceMeshes}, 'A requested real native probe mesh was missing/hidden')
    sourceMaterials = {obj.name: NativeMaterials(obj) for obj in sourceMeshes}
    for materials in sourceMaterials.values():
        for material in materials:
            shader, output = _Principled(material)
            Require(not shader.inputs['Metallic'].is_linked and abs(shader.inputs['Metallic'].default_value) < 1e-8, 'The prop must retain actual nonmetallic native materials')
    selected = list(bpy.context.selected_objects); active = bpy.context.view_layer.objects.active
    renderFlags = [(obj, obj.hide_render) for obj in scene.objects if obj.type == 'MESH']
    state = {'engine': scene.render.engine, 'samples': scene.cycles.samples,
             'target': scene.render.bake.target, 'selectedToActive': scene.render.bake.use_selected_to_active,
             'clear': scene.render.bake.use_clear, 'mode': bpy.context.object.mode if bpy.context.object else 'OBJECT'}
    Require(state['mode'] == 'OBJECT', 'Exit Edit/Sculpt mode before a quality export')
    collection = bpy.data.collections.new('QualityExportV12_Temporary'); scene.collection.children.link(collection)
    copies, temporaryMaterials, objects, meshes, reports = {}, [], [], [], []
    try:
        depsgraph = bpy.context.evaluated_depsgraph_get()
        required = {root}
        for obj in sourceMeshes:
            current = obj
            while current and current != root:
                required.add(current); current = current.parent
        required.update(child for child in root.children if child.name in PARTS)
        for original in sorted(required, key=ParentDepth):
            if original.type == 'MESH' and original in sourceMeshes:
                mesh = bpy.data.meshes.new_from_object(original.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
                mesh.name = 'Geometry_QualityExportV12_'+original.name; meshes.append(mesh)
                copy = bpy.data.objects.new('Q12_'+original.name, mesh)
                materials = sourceMaterials[original.name]
                materialIndices = array.array('i', [0])*len(mesh.polygons)
                mesh.polygons.foreach_get('material_index', materialIndices)
                mesh.materials.clear()
                for material in materials:
                    mesh.materials.append(material)
                mesh.polygons.foreach_set('material_index', materialIndices)
                # Respect the actual evaluated per-face indices, including
                # native geometry nodes that preserve the same source slots.
                Require(all(face.material_index < len(materials) for face in mesh.polygons), 'Evaluated material indices differ from native slots: '+original.name)
            else:
                copy = bpy.data.objects.new('Q12_'+original.name, None)
            collection.objects.link(copy); objects.append(copy); copies[original] = copy
            copy.parent = copies.get(original.parent)
            copy.matrix_world = original.matrix_world.copy()
            copy['QualityExportOriginalName'] = original.name
        bpy.context.view_layer.update()
        for original in sourceMeshes:
            original.hide_render = True
        nativeSet = {root, *root.children_recursive}
        for obj, oldFlag in renderFlags:
            if obj not in nativeSet:
                obj.hide_render = True
        scene.render.engine = 'CYCLES'; scene.cycles.samples = samples
        scene.render.bake.target = 'VERTEX_COLORS'
        scene.render.bake.use_selected_to_active = False; scene.render.bake.use_clear = False
        channels = ['Base', 'Roughness'] + (['Ao'] if bakeAo else []) + (['ShaderNormal'] if normalMode == 'shader-corner' else [])
        totalByPart = {name: 0 for name in PARTS}
        for objectNumber, original in enumerate(sourceMeshes):
            copy = copies[original]; mesh = copy.data; materials = sourceMaterials[original.name]
            before = MeshDigest(mesh); channelReports = {}; roughness = None; normalReport = None
            for channel in channels:
                for index, originalMaterial in enumerate(materials):
                    sampled = _BakeMaterial(originalMaterial, channel, aoDistance)
                    temporaryMaterials.append(sampled); mesh.materials[index] = sampled
                attribute = _ActivateColour(mesh, BASE_ATTRIBUTE if channel == 'Base' else 'Quality'+channel+'V12')
                bpy.ops.object.select_all(action='DESELECT'); copy.hide_set(False); copy.select_set(True)
                bpy.context.view_layer.objects.active = copy
                print('QUALITY_VERTEX_BAKE', json.dumps({'object': original.name, 'objectIndex': objectNumber,
                                                       'objectCount': len(sourceMeshes), 'channel': channel,
                                                       'corners': len(mesh.loops)}), flush=True)
                with bpy.context.temp_override(active_object=copy, object=copy, selected_objects=[copy], selected_editable_objects=[copy]):
                    result = bpy.ops.object.bake(type='EMIT')
                Require('FINISHED' in result, 'Cycles failed actual native shader vertex sampling')
                values = _ReadColours(attribute); channelReports[channel] = _Statistics(values)
                if channel == 'Roughness':
                    roughness = _RoughnessBySlot(mesh, values, len(materials))
                elif channel == 'ShaderNormal':
                    normalReport = _InstallSampledNormals(copy, values)
                # Keep only Base on the export copy; other measured fields
                # live in this report, not a pretend standard-PBR attribute.
                if channel != 'Base':
                    mesh.color_attributes.remove(attribute)
                del values
            for index, originalMaterial in enumerate(materials):
                runtime = _RuntimeMaterial(originalMaterial, roughness[index]['runtimeConstant'])
                temporaryMaterials.append(runtime); mesh.materials[index] = runtime
            _ActivateColour(mesh, BASE_ATTRIBUTE)
            after = MeshDigest(mesh)
            Require(before == after, 'Vertex sampling changed native evaluated geometry or UVs: '+original.name)
            part = SourcePart(original, root); triangles = sum(len(face.vertices)-2 for face in mesh.polygons)
            totalByPart[part] += triangles
            reports.append({'object': original.name, 'part': part, 'vertices': len(mesh.vertices),
                            'corners': len(mesh.loops), 'triangles': triangles,
                            'nativeMaterials': [material.name for material in materials],
                            'geometryAndUvsBefore': before, 'geometryAndUvsAfter': after,
                            'channelsActuallySampled': channelReports, 'roughnessBySlot': roughness,
                            'normalPolicy': normalReport or {'method': 'Actual evaluated geometric/custom normals; native shader micro-normal textures not transferred'},
                            'aoPolicy': 'Separate sampled diagnostic, not exported or premultiplied into Base' if bakeAo else 'Not sampled; native AO nodes already in Base graphs remain part of actual Base evaluation'})
        bpy.ops.object.select_all(action='DESELECT')
        for copy in objects:
            copy.hide_set(False); copy.select_set(True)
        bpy.context.view_layer.objects.active = copies[root]
        arguments = {'filepath': str(exportFile), 'export_format': 'GLB', 'use_selection': True,
                     'export_yup': True, 'export_apply': False, 'export_normals': True,
                     'export_materials': 'EXPORT', 'export_extras': True,
                     'export_animations': False, 'export_cameras': False, 'export_lights': False,
                     'export_vertex_color': 'NAME', 'export_vertex_color_name': BASE_ATTRIBUTE,
                     'export_all_vertex_colors': False}
        supported = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
        Require(all(key in supported for key in arguments), 'Installed glTF exporter lacks the explicit quality COLOR_0 export API; run probe')
        result = bpy.ops.export_scene.gltf(**arguments)
        Require('FINISHED' in result and exportFile.is_file(), 'Quality GLB exporter did not produce a file')
        actual = VerifyQualityGlb(exportFile, totalByPart, allowPartialProbe)
        report = {'generator': GENERATOR, 'blenderVersion': bpy.app.version_string,
                  'sourceBlend': Evidence(sourcePath), 'glb': Evidence(exportFile),
                  'seconds': time.time()-started, 'nativeSourceSavedOrChanged': False,
                  'geometryPolicy': 'Full actual evaluated native geometry; no decimation or topology limit; source UVs retained verbatim',
                  'shaderCapture': 'Actual Cycles EMIT to linear FLOAT_COLOR CORNER attributes',
                  'samples': samples, 'nativeCoordinates': 'Copies keep original world transforms and original material coordinate-anchor IDs; no exploded movement',
                  'fullPbrTextureEquivalent': False, 'deliveryClass': 'High-geometry vertex-sampled colour preview',
                  'nativeBlendRemainsFullMaterialMaster': True,
                  'limitations': ['Base is sampled only at corners; sub-corner texture/colour detail may alias or vanish',
                                  'Roughness is an actual sampled per-slot mean, not a variable roughness texture',
                                  'Native sheen/specular/procedural Bump chains are not equivalent in this standard GLB',
                                  'Optional shader-corner normals cannot preserve fine between-corner material relief',
                                  'Separate AO samples are diagnostic only, not a standard glTF occlusion texture'],
                  'actualGlb': actual, 'objects': reports}
        exportFile.with_suffix('.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf8')
        print('QUALITY_VERTEX_PREVIEW_EXPORTED', json.dumps({'file': str(exportFile),
                                                            'triangles': sum(totalByPart.values()),
                                                            'sha256': report['glb']['sha256'],
                                                            'fullPbrTextureEquivalent': False}), flush=True)
        return report
    finally:
        for obj, oldFlag in renderFlags:
            obj.hide_render = oldFlag
        scene.render.engine = state['engine']; scene.cycles.samples = state['samples']
        scene.render.bake.target = state['target']; scene.render.bake.use_selected_to_active = state['selectedToActive']
        scene.render.bake.use_clear = state['clear']
        for obj in reversed(objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        for mesh in meshes:
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        for material in temporaryMaterials:
            if material.users == 0:
                bpy.data.materials.remove(material)
        if collection.users:
            bpy.data.collections.remove(collection)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in selected:
            if obj.name in bpy.data.objects:
                obj.select_set(True)
        if active and active.name in bpy.data.objects:
            bpy.context.view_layer.objects.active = active


QUALITY_UV = 'QualityUV'


def _SourceUv(mesh):
    return next((layer for layer in mesh.uv_layers if layer.active_render), mesh.uv_layers.active)


def _UvFacts(mesh, layer, sampleLimit=12000):
    """No per-face texel requirement; report finite/area and sampled overlaps.

    Repeated sampled triangles are a risk diagnostic, not proof that packed
    islands overlap: distinct charts may intentionally share native UVs.
    Self-overlap inside one connected chart still requires probe inspection.
    """
    if layer is None:
        return {'missing': True, 'degenerateTriangles': None, 'triangles': 0}
    mesh.calc_loop_triangles()
    degenerate, zeroArea, tinyArea, nonfinite, sampled, repeated, seen = 0, 0, 0, 0, 0, 0, set()
    stride = max(1, len(mesh.loop_triangles)//sampleLimit)
    for index, triangle in enumerate(mesh.loop_triangles):
        uv = [tuple(layer.data[loop].uv) for loop in triangle.loops]
        if not all(math.isfinite(value) for point in uv for value in point):
            nonfinite += 1; continue
        area = abs((uv[1][0]-uv[0][0])*(uv[2][1]-uv[0][1])-
                   (uv[1][1]-uv[0][1])*(uv[2][0]-uv[0][0]))*.5
        if area <= 1e-16:
            degenerate += 1
            if area == 0:
                zeroArea += 1
            else:
                tinyArea += 1
        if index % stride == 0:
            key = tuple(sorted((round(point[0], 7), round(point[1], 7)) for point in uv))
            repeated += key in seen; seen.add(key); sampled += 1
    coordinates = array.array('f', [0])*(len(layer.data)*2)
    layer.data.foreach_get('uv', coordinates)
    bounds = [[min(coordinates[axis::2], default=0) for axis in range(2)],
              [max(coordinates[axis::2], default=0) for axis in range(2)]]
    return {'missing': False, 'triangles': len(mesh.loop_triangles), 'uvBounds': bounds,
            'degenerateTriangles': degenerate, 'nonfiniteTriangles': nonfinite,
            'exactZeroAreaTriangles': zeroArea, 'tinyNonzeroAreaTriangles': tinyArea,
            'sampledTriangles': sampled, 'sampledRepeatedTriangleCoordinates': repeated,
            'overlapDiagnostic': 'Sampled duplicate UV triangles only; does not establish chart-internal injectivity',
            'pixelCentreGate': False}


def _ExplicitSourceUv(material, sourceUv, ownedGroups):
    """Copy nested groups before pinning implicit source-coordinate sockets."""
    changes = []
    cache = {}

    def Process(tree):
        for node in list(tree.nodes):
            if node.type == 'GROUP' and node.node_tree:
                original = node.node_tree
                if original.as_pointer() not in cache:
                    copied = original.copy(); copied.name = 'QualitySourceUvV12_'+original.name
                    cache[original.as_pointer()] = copied; ownedGroups.append(copied)
                    Process(copied)
                node.node_tree = cache[original.as_pointer()]
            elif node.type == 'TEX_COORD':
                links = list(node.outputs['UV'].links)
                if links:
                    explicit = tree.nodes.new('ShaderNodeUVMap'); explicit.uv_map = sourceUv
                    for link in links:
                        tree.links.new(explicit.outputs['UV'], link.to_socket)
                    changes.append({'node': node.name, 'kind': 'Implicit TextureCoord.UV', 'uv': sourceUv})
            elif node.type == 'TEX_IMAGE' and not node.inputs['Vector'].is_linked:
                explicit = tree.nodes.new('ShaderNodeUVMap'); explicit.uv_map = sourceUv
                tree.links.new(explicit.outputs['UV'], node.inputs['Vector'])
                changes.append({'node': node.name, 'kind': 'Implicit image Vector', 'uv': sourceUv})
            elif node.type == 'UVMAP' and not node.uv_map:
                node.uv_map = sourceUv; changes.append({'node': node.name, 'kind': 'Unnamed UVMap', 'uv': sourceUv})
            elif node.type == 'NORMAL_MAP' and node.space == 'TANGENT' and not node.uv_map:
                node.uv_map = sourceUv; changes.append({'node': node.name, 'kind': 'Implicit source normal basis', 'uv': sourceUv})
    Process(material.node_tree)
    return changes


def _UvRaw(layer):
    values = array.array('f', [0])*(len(layer.data)*2)
    layer.data.foreach_get('uv', values)
    return values


def _UvEvidence(mesh, layer):
    values = _UvRaw(layer)
    return {'layer': layer.name, 'floatUvSha256': hashlib.sha256(values.tobytes()).hexdigest(),
            'facts': _UvFacts(mesh, layer)}


def _NormalizeQualityTo1001(objects, inset=.001):
    """One affine/isotropic transform of all target charts, never source UVs."""
    import numpy as np
    buffers, minimum, maximum = [], np.array([math.inf, math.inf]), np.array([-math.inf, -math.inf])
    for obj in objects:
        layer = obj.data.uv_layers[QUALITY_UV]
        values = np.asarray(_UvRaw(layer), dtype=np.float32).reshape((-1, 2))
        Require(np.isfinite(values).all(), 'Cannot normalize nonfinite target QualityUV')
        if len(values):
            minimum = np.minimum(minimum, values.min(axis=0)); maximum = np.maximum(maximum, values.max(axis=0))
        buffers.append((layer, values))
    span = float((maximum-minimum).max())
    Require(math.isfinite(span) and span > 1e-12, 'All target QualityUV coordinates collapsed before packing')
    centre = .5*(minimum+maximum); scale = (1-2*inset)/span
    for layer, values in buffers:
        values = ((values-centre)*scale+.5).astype(np.float32)
        layer.data.foreach_set('uv', values.ravel())
    return {'method': 'Shared affine translation and isotropic scale of QualityUV only',
            'sourceBounds': [minimum.tolist(), maximum.tolist()], 'scale': scale,
            'sourceCentre': centre.tolist(), 'targetCentre': [.5, .5], 'targetUdim': 1001,
            'targetBounds': [((minimum-centre)*scale+.5).tolist(), ((maximum-centre)*scale+.5).tolist()]}


def _QualityRectangleLayout(entries, resolution, paddingPixels, minimumContentPixels=32):
    """Deterministic weighted guillotine subdivision, using integer pixels.

    Each recursive cut partitions its parent into disjoint rectangles.
    Capacity constraints reserve the minimum width AND height for every leaf.
    No Blender UV pack operation participates in this mathematical layout.
    """
    minimum = minimumContentPixels+2*paddingPixels
    ordered = sorted(entries, key=lambda entry: (-entry['weight'], entry['object']))
    Require(ordered and len({entry['object'] for entry in ordered}) == len(ordered), 'Atlas rectangle identities must be unique')
    Require(all(math.isfinite(entry['weight']) and entry['weight'] > 0 for entry in ordered), 'Atlas layout needs finite positive surface weights')
    Require((resolution//minimum)**2 >= len(ordered), 'Atlas cannot fit the requested minimum object tiles')
    rectangles = {}

    def Capacity(width, height):
        return (width//minimum)*(height//minimum)

    def Split(items, rect):
        x, y, width, height = rect
        if len(items) == 1:
            Require(width >= minimum and height >= minimum, 'Manual layout lost a minimum leaf extent')
            rectangles[items[0]['object']] = {'outerPixels': [x, y, width, height],
                'contentPixels': [x+paddingPixels, y+paddingPixels, width-2*paddingPixels, height-2*paddingPixels],
                'weight': items[0]['weight'], 'surfaceAreaM2': items[0]['surfaceAreaM2'],
                'weightMultiplier': items[0]['weightMultiplier']}
            return
        total = sum(item['weight'] for item in items)
        prefixes, accumulated = [], 0
        for count in range(1, len(items)):
            accumulated += items[count-1]['weight']
            prefixes.append((abs(accumulated/total-.5), count, accumulated/total))
        axes = (0, 1) if width >= height else (1, 0)
        for axis in axes:
            extent, cross = (width, height) if axis == 0 else (height, width)
            across = cross//minimum
            for _, count, ratio in sorted(prefixes):
                if not across:
                    continue
                leftMinimum = math.ceil(count/across)*minimum
                rightMinimum = math.ceil((len(items)-count)/across)*minimum
                if leftMinimum+rightMinimum > extent:
                    continue
                cut = max(leftMinimum, min(extent-rightMinimum, round(extent*ratio)))
                first = [x, y, cut, height] if axis == 0 else [x, y, width, cut]
                second = [x+cut, y, width-cut, height] if axis == 0 else [x, y+cut, width, height-cut]
                Require(Capacity(first[2], first[3]) >= count and Capacity(second[2], second[3]) >= len(items)-count,
                        'Manual atlas cut violated its capacity proof')
                Split(items[:count], first); Split(items[count:], second)
                return
        raise RuntimeError('No feasible minimum-size guillotine cut; increase atlas resolution')

    Split(ordered, [0, 0, resolution, resolution])
    pairCount = 0
    names = sorted(rectangles)
    for index, first in enumerate(names):
        x, y, width, height = rectangles[first]['outerPixels']
        Require(0 <= x < x+width <= resolution and 0 <= y < y+height <= resolution, 'Object tile escaped the atlas')
        for second in names[index+1:]:
            a, b, c, d = rectangles[second]['outerPixels']; pairCount += 1
            Require(x+width <= a or a+c <= x or y+height <= b or b+d <= y, 'Manual atlas rectangles overlap')
    return {'method': 'Deterministic integer-pixel weighted guillotine treemap', 'rectangles': rectangles,
            'paddingPixelsPerWindowEdge': paddingPixels, 'minimumContentPixels': minimumContentPixels,
            'pairwiseRectanglesChecked': pairCount, 'outerRectanglesNonOverlapping': True,
            'allRectanglesWithin1001': True, 'weighting': 'sqrt(actual evaluated world-space surface area), cap x1.5, hidden sheet underlay x0.3'}


def _QualitySurfaceWeight(obj):
    mesh = obj.data; mesh.calc_loop_triangles()
    linear = obj.matrix_world.to_3x3()
    determinant = abs(linear.determinant())
    Require(determinant > 1e-20, 'A singular native transform has no meaningful surface area')
    normalTransform = linear.inverted().transposed()
    area = 0.
    for triangle in mesh.loop_triangles:
        a, b, c = (mesh.vertices[index].co for index in triangle.vertices)
        cross = (b-a).cross(c-a)
        area += .5*determinant*(normalTransform @ cross).length
    name = obj['QualityExportOriginalName']
    multiplier = 1.5 if name == 'Pack_QualityMatEndCapsV12' else .3 if name == 'Pack_TrueRolledGrassSheet' else 1.
    Require(area > 0 and math.isfinite(area), 'Object has no finite native surface area: '+name)
    return {'object': name, 'surfaceAreaM2': area, 'weightMultiplier': multiplier,
            'weight': math.sqrt(area)*multiplier}


def _PackQualityUv(objects, marginPixels, resolution, progress=None, progressFile=None, part=None):
    import bpy
    import numpy as np
    Require(objects, 'No actual part geometry to pack')
    uvStages, smartObjects, continuousObjects = {}, [], []
    layout = _QualityRectangleLayout([_QualitySurfaceWeight(obj) for obj in objects], resolution, marginPixels)
    def Publish(stage):
        if progress is not None:
            progress['stage'] = stage
            progress.setdefault('uvPreparationReports', {})[part or 'SelectedPart'] = uvStages
            progress.setdefault('manualRectangleLayouts', {})[part or 'SelectedPart'] = layout
            _WriteQualityProgress(progressFile, progress)
    for obj in objects:
        original = _SourceUv(obj.data)
        sourceName = original.name if original else None
        facts = _UvFacts(obj.data, original)
        # A UV collection allocation can invalidate an earlier RNA layer
        # wrapper. Read all source floats BEFORE new(), never dereference
        # that wrapper after reallocating CustomData.
        sourceRaw = _UvRaw(original) if original else None
        sourceHash = hashlib.sha256(sourceRaw.tobytes()).hexdigest() if sourceRaw is not None else None
        name = obj['QualityExportOriginalName']
        uvStages[name] = {'sourceLayer': sourceName, 'sourceUvSha256': sourceHash, 'sourceFacts': facts}
        Publish('SourceUvBufferCapturedBeforeLayerAllocation')
        target = obj.data.uv_layers.new(name=QUALITY_UV, do_init=False)
        Require(target.name == QUALITY_UV, 'A prior QualityUV already exists on a native copy')
        if sourceRaw is not None:
            target.data.foreach_set('uv', sourceRaw)
            copiedHash = hashlib.sha256(_UvRaw(target).tobytes()).hexdigest()
            sourceHashAfterAllocation = hashlib.sha256(_UvRaw(obj.data.uv_layers[sourceName]).tobytes()).hexdigest()
            uvStages[name]['initialQualityUvSha256'] = copiedHash
            uvStages[name]['sourceUvSha256AfterLayerAllocation'] = sourceHashAfterAllocation
            uvStages[name]['initialCopyMatchesOriginalBuffer'] = copiedHash == sourceHash == sourceHashAfterAllocation
            Publish('InitialQualityUvCopyHashRecorded')
            Require(uvStages[name]['initialCopyMatchesOriginalBuffer'], 'New QualityUV does not exactly match the pre-allocation original UV buffer: '+name)
        uvStages[name]['initialQualityUv'] = _UvEvidence(obj.data, target)
        # do_init=False creates an unpinned target. Do not allocate a legacy
        # pin attribute: that can reallocate CustomData again in Blender 5.2.
        obj.data.uv_layers.active_index = obj.data.uv_layers.find(QUALITY_UV)
        obj.data.uv_layers.get(QUALITY_UV).active_render = True
        uvStages[name]['preTargetPreparation'] = _UvEvidence(obj.data, obj.data.uv_layers[QUALITY_UV])
        rect = layout['rectangles'][name]
        content = rect['contentPixels']
        scale = np.array([content[2]/resolution, content[3]/resolution], dtype=np.float64)
        offset = np.array([content[0]/resolution, content[1]/resolution], dtype=np.float64)
        if name == 'Pack_InterlacedMatGrass':
            helperFile = Path(__file__).with_name('Script_SichuanQualityTubeUvV12.py')
            Publish('BeforeContinuousInterlacedTubeCharts')
            helper = runpy.run_path(str(helperFile))
            tubeReport = helper['BuildInterlacedTubeUv'](obj, QUALITY_UV, resolution,
                windowPixels=content, paddingPixels=marginPixels//2, sourceUV=sourceName)
            uvStages[name]['continuousTubeCharts'] = {'helper': Evidence(helperFile), 'report': tubeReport}
            placedEvidence = _UvEvidence(obj.data, obj.data.uv_layers.get(QUALITY_UV))
            uvStages[name]['placed'] = placedEvidence
            uvStages[name]['placement'] = {'outerPixels': rect['outerPixels'], 'contentPixels': content,
                'helperAlreadyOutputsGlobalWindowUv': True, 'affineAppliedAfterHelper': False,
                'allocatedWeight': rect['weight'], 'surfaceAreaM2': rect['surfaceAreaM2'],
                'weightMultiplier': rect['weightMultiplier'], 'windowBorderPixels': marginPixels}
            continuousObjects.append(name)
            Publish('ContinuousTubeGlobalWindowFactsAndHashRecorded')
            Require(placedEvidence['facts']['nonfiniteTriangles'] == 0 and placedEvidence['facts']['exactZeroAreaTriangles'] == 0,
                    'Actual continuous tube target contains invalid or collapsed UVs')
            bounds = placedEvidence['facts']['uvBounds']
            Require(all(offset[axis]-1e-6 <= bounds[0][axis] and bounds[1][axis] <= offset[axis]+scale[axis]+1e-6 for axis in range(2)),
                    'Tube helper target escaped its reserved atlas window')
            freshSourceHash = hashlib.sha256(_UvRaw(obj.data.uv_layers.get(sourceName)).tobytes()).hexdigest()
            uvStages[name]['sourceUvSha256AfterPlacement'] = freshSourceHash
            Require(freshSourceHash == sourceHash, 'Continuous tube helper changed preserved native source UV')
            obj['QualitySourceUvName'] = sourceName or ''
            obj['QualitySourceUvFacts'] = json.dumps(facts)
            continue
        uvStages[name]['preSmart'] = uvStages[name]['preTargetPreparation']
        # Keep the single-object Smart settings already successful in the
        # actual probe. A large margin based on a tiny allocation window
        # could itself make its many small native charts impossible to pack.
        # The independently reserved window border protects other objects.
        islandMargin = marginPixels/resolution
        smartOptions = {'angle_limit': math.radians(66), 'island_margin': islandMargin,
                        'correct_aspect': True, 'scale_to_bounds': True}
        uvStages[name]['smartOptions'] = smartOptions
        Publish('BeforeSingleObjectSmartProject')
        bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        try:
            bpy.ops.uv.smart_project(**smartOptions)
        finally:
            bpy.ops.object.mode_set(mode='OBJECT')
        afterSmart = _UvEvidence(obj.data, obj.data.uv_layers.get(QUALITY_UV))
        uvStages[name]['afterSmart'] = afterSmart
        smartObjects.append(name)
        Publish('SingleObjectSmartFactsAndHashRecorded')
        Require(afterSmart['facts']['nonfiniteTriangles'] == 0 and afterSmart['facts']['exactZeroAreaTriangles'] == 0,
                'Single-object Smart UV returned invalid or zero-area target triangles; evidence retained: '+name)
        Require(all(-1e-5 <= value <= 1+1e-5 for point in afterSmart['facts']['uvBounds'] for value in point),
                'Single-object Smart UV did not stay in its own 0..1 tile: '+name)
        # This is the last UV modification. No global average/pack follows.
        raw = np.asarray(_UvRaw(obj.data.uv_layers.get(QUALITY_UV)), dtype=np.float32).reshape((-1, 2))
        placed = (raw*scale+offset).astype(np.float32)
        obj.data.uv_layers.get(QUALITY_UV).data.foreach_set('uv', placed.ravel())
        placedEvidence = _UvEvidence(obj.data, obj.data.uv_layers.get(QUALITY_UV))
        uvStages[name]['placed'] = placedEvidence
        uvStages[name]['placement'] = {'outerPixels': rect['outerPixels'], 'contentPixels': content,
            'uvScale': scale.tolist(), 'uvOffset': offset.tolist(), 'sourceSmartUVRetriangulated': False,
            'onlyAffineUvPlacementAfterSmart': True, 'allocatedWeight': rect['weight'],
            'surfaceAreaM2': rect['surfaceAreaM2'], 'weightMultiplier': rect['weightMultiplier'],
            'windowBorderPixels': marginPixels,
            'singleObjectChartPaddingPolicy': 'Preserve successful Smart UV margin setting; internal chart gaps after affine placement require actual texture inspection, not an asserted pixel guarantee'}
        Publish('ManualWindowPlacementFactsAndHashRecorded')
        Require(placedEvidence['facts']['nonfiniteTriangles'] == 0 and
                placedEvidence['facts']['exactZeroAreaTriangles'] == afterSmart['facts']['exactZeroAreaTriangles'],
                'Manual affine placement introduced invalid or collapsed UVs; evidence retained: '+name)
        bounds = placedEvidence['facts']['uvBounds']
        expected = [offset, offset+scale]
        Require(all(expected[0][axis]-1e-6 <= bounds[0][axis] and bounds[1][axis] <= expected[1][axis]+1e-6 for axis in range(2)),
                'Placed UV escaped its proven non-overlapping object window: '+name)
        if sourceName:
            freshSourceHash = hashlib.sha256(_UvRaw(obj.data.uv_layers.get(sourceName)).tobytes()).hexdigest()
            uvStages[name]['sourceUvSha256AfterPlacement'] = freshSourceHash
            Require(freshSourceHash == sourceHash, 'Single-object Smart UV/placement changed pinned native source UV: '+name)
        obj['QualitySourceUvName'] = sourceName or ''
        obj['QualitySourceUvFacts'] = json.dumps(facts)
    Publish('AllObjectsManuallyPlacedWithoutGlobalUvPacking')
    return {'method': 'Actual continuous tube charts for InterlacedMatGrass; other temporary native objects separately Smart UV projected and affine placed in disjoint rectangles',
            'globalAverageOrPackOperatorUsed': False, 'marginPixels': marginPixels, 'resolution': resolution,
            'targetUdim': 1001, 'rectangleLayout': layout, 'uvStageEvidence': uvStages,
            'smartProjectObjects': smartObjects, 'continuousTubeObjects': continuousObjects,
            'smartProjectPolicy': 'All temporary objects except the explicit continuous-tube source, including both cap ends; source UVs stay pinned and unchanged',
            'diagnosticUnavailable': True, 'diagnosticUnavailableReasons': {'uvUiSelection': 'Blender 5.2 has no MeshUVLoop/BMLoopUV select API; no fabricated zero-overlap result'},
            'blenderOverlapSelectionEmpty': None, 'chartInternalOverlapProvenAbsent': False,
            'overlapLimit': 'Object rectangle non-overlap is proved mathematically; each single-object Smart UV chart layout still requires real texture inspection',
            'targetUvFacts': {name: evidence['placed']['facts'] for name, evidence in uvStages.items()}}


def _NewBakeImage(name, resolution, colourSpace, background):
    import bpy
    import numpy as np
    image = bpy.data.images.new(name, width=resolution, height=resolution, alpha=True, float_buffer=True)
    image.colorspace_settings.name = colourSpace
    pixels = np.empty((resolution*resolution, 4), dtype=np.float32); pixels[:] = background
    image.pixels.foreach_set(pixels.ravel()); image.update()
    return image


def _WriteQualityProgress(filePath, record):
    if filePath:
        destination = Path(filePath)
        temporary = destination.with_suffix('.tmp')
        temporary.write_text(json.dumps(record, indent=2, allow_nan=False)+'\n', encoding='utf8')
        temporary.replace(destination)


def _ImageEvidence(image, filePath, progress=None, progressFile=None, channelKey=None, validateNow=True):
    import numpy as np
    values = np.empty(image.size[0]*image.size[1]*4, dtype=np.float32)
    image.pixels.foreach_get(values); values = values.reshape((-1, 4))
    # Preserve real raw output first, including RGB beneath alpha zero.
    # Coverage diagnosis must not destroy its own evidence by raising early.
    image.filepath_raw = str(filePath); image.file_format = 'PNG'; image.save()
    finite = np.isfinite(values)
    finiteAll = bool(finite.all())
    rgbaMinimum, rgbaMaximum, rgbaMean = [], [], []
    for axis in range(4):
        valid = values[finite[:, axis], axis]
        rgbaMinimum.append(float(valid.min()) if len(valid) else None)
        rgbaMaximum.append(float(valid.max()) if len(valid) else None)
        rgbaMean.append(float(valid.mean(dtype=np.float64)) if len(valid) else None)
    rgbNonzero = np.any(np.abs(values[:, :3]) > 1e-8, axis=1)
    covered = values[:, 3] > .5
    selected = values[covered & np.all(finite[:, :3], axis=1), :3]
    statistics = {'surfacePixels': int(covered.sum()), 'pixels': len(values),
                  'rgbaMinimum': rgbaMinimum, 'rgbaMaximum': rgbaMaximum, 'rgbaMean': rgbaMean,
                  'alphaNonzeroPixels': int(np.count_nonzero(np.abs(values[:, 3]) > 1e-8)),
                  'rgbNonzeroPixels': int(rgbNonzero.sum()),
                  'rgbNonzeroWithZeroAlphaPixels': int(np.count_nonzero(rgbNonzero & (np.abs(values[:, 3]) <= 1e-8))),
                  'nonfiniteComponents': int(values.size-np.count_nonzero(finite)),
                  'surfaceRgbMin': selected.min(axis=0).tolist() if len(selected) else None,
                  'surfaceRgbMax': selected.max(axis=0).tolist() if len(selected) else None,
                  'surfaceRgbMean': selected.mean(axis=0, dtype=np.float64).tolist() if len(selected) else None,
                  'noPerTrianglePixelCentreRequirement': True}
    evidence = {**Evidence(filePath), 'width': image.size[0], 'height': image.size[1],
                'colourSpace': image.colorspace_settings.name, 'actualBakePixels': statistics,
                'rawImageSavedBeforeCoverageAssertion': True,
                'finiteValues': finiteAll, 'hasAlphaMarkedSurfacePixels': bool(covered.any()),
                'coverageAssertionDeferredUntilAllRawChannelsSaved': not validateNow}
    if progress is not None:
        progress.setdefault('actualRawImages', {})[channelKey or image.name] = evidence
        progress['stage'] = 'RawImageSavedBeforeValidityAssertion'
        _WriteQualityProgress(progressFile, progress)
    print('QUALITY_RAW_IMAGE_DIAGNOSTIC', json.dumps(evidence), flush=True)
    if validateNow:
        Require(finiteAll, 'Actual quality bake image contains nonfinite values; raw PNG/progress preserved')
        Require(bool(covered.any()), 'Actual quality bake image has no alpha-marked surface pixels; raw PNG/RGBA diagnostics and pack report preserved')
    return evidence


def _OfficialQualityGltfSettingsGroup(ownedGroups):
    """Use the installed addon's complete interface, never an AO-only group.

    Blender 5.2's importer unconditionally looks up Iridescence inputs once
    an Occlusion settings group exists. A hand-made group with the canonical
    name but only Occlusion therefore poisons later imports in that file.
    Create an owned, suffixed group using the official factory instead; its
    recognized prefix is sufficient for export. Existing native/canonical
    groups are deliberately not modified or reused here.
    """
    from io_scene_gltf2.blender.com.material_helpers import create_settings_group, get_gltf_node_name
    factory = 'io_scene_gltf2.blender.com.material_helpers.create_settings_group'
    group = next((value for value in ownedGroups if value.get('QualityExportSettingsFactory') == factory), None)
    if group is None:
        group = create_settings_group(get_gltf_node_name()+' QualityV12 Export')
        ownedGroups.append(group)
        group['QualityExportSettingsFactory'] = factory
    sockets = {item.name: item for item in group.interface.items_tree
               if item.item_type == 'SOCKET' and item.in_out == 'INPUT'}
    expected = ('Occlusion', 'Thickness', 'Dispersion', 'Iridescence Factor', 'Iridescence Thickness Minimum')
    Require(all(name in sockets for name in expected), 'Installed official glTF settings factory returned an incomplete Blender 5.2 interface')
    Require(sockets['Thickness'].default_value == 0 and sockets['Dispersion'].default_value == 0 and
            sockets['Iridescence Factor'].default_value == 0 and sockets['Iridescence Thickness Minimum'].default_value == 100,
            'Official glTF material settings defaults differ from the expected non-volume/non-iridescent values')
    return group


def _PbrRuntimeMaterial(original, images, ownedGroups):
    import bpy
    source, _ = _Principled(original)
    material = bpy.data.materials.new('Material_QualityPbrV12_'+original.name)
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links; nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial'); shader = nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Metallic'].default_value = 0
    retained = {}
    for name in ('IOR', 'Specular IOR Level', 'Sheen Weight', 'Sheen Roughness', 'Coat Weight', 'Coat Roughness'):
        if name in source.inputs and name in shader.inputs:
            socket = source.inputs[name]
            Require(not socket.is_linked, 'A varying '+name+' needs an explicit additional PBR channel: '+original.name)
            shader.inputs[name].default_value = socket.default_value; retained[name] = socket.default_value
    uv = nodes.new('ShaderNodeUVMap'); uv.uv_map = QUALITY_UV
    textures = {}
    for channel in ('Base', 'Normal', 'Orm'):
        texture = nodes.new('ShaderNodeTexImage'); texture.image = images[channel]
        texture.extension = 'EXTEND'; texture.interpolation = 'Linear'
        links.new(uv.outputs['UV'], texture.inputs['Vector']); textures[channel] = texture
    links.new(textures['Base'].outputs['Color'], shader.inputs['Base Color'])
    normal = nodes.new('ShaderNodeNormalMap'); normal.uv_map = QUALITY_UV
    normal.inputs['Strength'].default_value = 1
    links.new(textures['Normal'].outputs['Color'], normal.inputs['Color']); links.new(normal.outputs['Normal'], shader.inputs['Normal'])
    split = nodes.new('ShaderNodeSeparateColor'); split.mode = 'RGB'
    links.new(textures['Orm'].outputs['Color'], split.inputs[0]); links.new(split.outputs['Green'], shader.inputs['Roughness'])
    links.new(split.outputs['Blue'], shader.inputs['Metallic'])
    group = _OfficialQualityGltfSettingsGroup(ownedGroups)
    occlusion = nodes.new('ShaderNodeGroup'); occlusion.node_tree = group
    links.new(split.outputs['Red'], occlusion.inputs['Occlusion'])
    material['QualityGltfSettingsFactory'] = group['QualityExportSettingsFactory']
    material['QualityGltfSettingsGroup'] = group.name
    links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    return material, retained


def TriangulateQualityNgonsForExport(obj, ownedMeshes):
    """Only n-gons >4 on the temporary baked copy; preserve corner basis.

    Blender's glTF tangent exporter cannot process n-gons. Keep all quads,
    every position and each original corner UV/normal, using a face-domain
    source-index attribute to map generated triangles back to their corners.
    """
    import bpy
    import numpy as np
    mesh = obj.data
    ngonCount = sum(len(face.vertices) > 4 for face in mesh.polygons)
    if not ngonCount:
        return {'object': obj.get('QualityExportOriginalName', obj.name), 'ngonsTriangulated': 0,
                'quadsUntouched': True, 'sourceSceneUntouched': True}
    triangleCount = sum(len(face.vertices)-2 for face in mesh.polygons)
    quadCount = sum(len(face.vertices) == 4 for face in mesh.polygons)
    positions = array.array('f', [0])*(len(mesh.vertices)*3)
    mesh.vertices.foreach_get('co', positions)
    positionHash = hashlib.sha256(positions.tobytes()).hexdigest()
    starts, totals = array.array('i', [0])*len(mesh.polygons), array.array('i', [0])*len(mesh.polygons)
    vertices = array.array('i', [0])*len(mesh.loops)
    mesh.polygons.foreach_get('loop_start', starts); mesh.polygons.foreach_get('loop_total', totals)
    mesh.loops.foreach_get('vertex_index', vertices)
    sourceUv = _UvRaw(mesh.uv_layers.get(QUALITY_UV))
    sourceNormals = array.array('f', [0])*(len(mesh.loops)*3)
    mesh.corner_normals.foreach_get('vector', sourceNormals)
    sourceMaterials = array.array('i', [0])*len(mesh.polygons)
    mesh.polygons.foreach_get('material_index', sourceMaterials)
    markerName = 'QualityNgonOriginalFaceV12'
    Require(mesh.attributes.get(markerName) is None, 'A foreign n-gon source mapping already exists')
    marker = mesh.attributes.new(name=markerName, type='INT', domain='FACE')
    marker.data.foreach_set('value', array.array('i', range(len(mesh.polygons))))
    modifier = obj.modifiers.new('QualityExportNgonsOnlyV12', 'TRIANGULATE')
    modifier.min_vertices = 5
    if hasattr(modifier, 'keep_custom_normals'):
        modifier.keep_custom_normals = True
    try:
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        result = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph),
                    preserve_all_data_layers=True, depsgraph=depsgraph)
        result.name = 'Geometry_QualityExportNgonsOnlyV12_'+obj.name
        ownedMeshes.append(result)
    finally:
        obj.modifiers.remove(modifier)
    resultPositions = array.array('f', [0])*(len(result.vertices)*3)
    result.vertices.foreach_get('co', resultPositions)
    Require(hashlib.sha256(resultPositions.tobytes()).hexdigest() == positionHash,
            'N-gon-only triangulation changed native evaluated positions')
    Require(sum(len(face.vertices)-2 for face in result.polygons) == triangleCount and
            sum(len(face.vertices) == 4 for face in result.polygons) == quadCount and
            all(len(face.vertices) <= 4 for face in result.polygons),
            'N-gon-only triangulation changed total triangles or touched quads')
    sourceFace = result.attributes.get(markerName)
    Require(sourceFace is not None, 'Triangulate modifier lost its face-corner provenance')
    sourceIds = array.array('i', [0])*len(result.polygons)
    sourceFace.data.foreach_get('value', sourceIds)
    resultUv = _UvRaw(result.uv_layers.get(QUALITY_UV))
    expectedNormals = np.empty((len(result.loops), 3), dtype=np.float32)
    maxUvChange = 0.
    for face in result.polygons:
        original = sourceIds[face.index]
        Require(0 <= original < len(starts) and face.material_index == sourceMaterials[original],
                'N-gon triangulation changed the source material mapping')
        oldLoops = {vertices[index]: index for index in range(starts[original], starts[original]+totals[original])}
        for loopIndex in face.loop_indices:
            vertex = result.loops[loopIndex].vertex_index
            Require(vertex in oldLoops, 'N-gon triangulation added an unexpected position')
            sourceLoop = oldLoops[vertex]
            maxUvChange = max(maxUvChange, *(abs(resultUv[loopIndex*2+axis]-sourceUv[sourceLoop*2+axis]) for axis in range(2)))
            expectedNormals[loopIndex] = sourceNormals[sourceLoop*3:sourceLoop*3+3]
    Require(maxUvChange <= 1e-7, 'N-gon triangulation changed an authored target corner UV')
    result.normals_split_custom_set([tuple(value) for value in expectedNormals])
    result.attributes.remove(result.attributes[markerName]); result.update()
    actualNormals = np.empty(len(result.loops)*3, dtype=np.float32)
    result.corner_normals.foreach_get('vector', actualNormals)
    maxNormalChange = float(np.abs(actualNormals.reshape((-1, 3))-expectedNormals).max())
    Require(maxNormalChange < .001, 'N-gon triangulation did not retain the baked geometric corner-normal basis')
    obj.data = result
    if mesh in ownedMeshes:
        ownedMeshes.remove(mesh)
    if mesh.users == 0:
        bpy.data.meshes.remove(mesh)
    return {'object': obj.get('QualityExportOriginalName', obj.name), 'ngonsTriangulated': ngonCount,
            'method': 'Triangulate modifier min_vertices=5 on temporary evaluated copy only',
            'trianglesBefore': triangleCount, 'trianglesAfter': triangleCount,
            'quadsBefore': quadCount, 'quadsAfter': quadCount, 'quadsUntouched': True,
            'positionsSha256Before': positionHash, 'positionsSha256After': positionHash,
            'maximumCornerUvChange': maxUvChange, 'maximumCornerNormalChange': maxNormalChange,
            'cornerNormalsTransferredByOriginalFaceAndVertex': True,
            'materialAssignmentsPreserved': True, 'sourceSceneUntouched': True}


def VerifyQualityPbrGlb(filePath, expectedTriangles, resolution, partial=False):
    document, binary = _ReadGlb(filePath)
    for node in document['nodes']:
        original = node.get('extras', {}).get('QualityExportOriginalName')
        if original:
            node['name'] = original
    _WriteGlb(filePath, document, binary)
    roots = document['scenes'][document.get('scene', 0)]['nodes']
    Require(len(roots) == 1 and document['nodes'][roots[0]].get('name') == 'Pack_Root', 'Quality PBR GLB lost its independent root')
    rootNode = document['nodes'][roots[0]]
    identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    Require(rootNode.get('translation', [0, 0, 0]) == [0, 0, 0] and rootNode.get('rotation', [0, 0, 0, 1]) == [0, 0, 0, 1] and rootNode.get('scale', [1, 1, 1]) == [1, 1, 1] and rootNode.get('matrix', identity) == identity, 'Quality PBR root lost the identity back-centre pivot')
    counts = {name: 0 for name in PARTS}; seen = set(); uses = []
    def ImageInfo(textureInfo):
        Require(textureInfo.get('texCoord', 0) == 0, 'Quality PBR texture does not use exported QualityUV/TEXCOORD_0')
        texture = document['textures'][textureInfo['index']]
        image = document['images'][texture['source']]
        view = document['bufferViews'][image['bufferView']]
        raw = binary[view.get('byteOffset', 0):view.get('byteOffset', 0)+view['byteLength']]
        Require(raw[:8] == b'\x89PNG\r\n\x1a\n' and struct.unpack_from('>II', raw, 16) == (resolution, resolution), 'Actual embedded PBR image is missing or has a different resolution')
        return {'image': image.get('name'), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
    def Walk(index, owner=None):
        Require(index not in seen, 'Repeated quality PBR node'); seen.add(index)
        node = document['nodes'][index]
        if node.get('name') in PARTS:
            owner = node['name']
        if 'mesh' in node:
            Require(owner in PARTS, 'Quality mesh is outside its removable part')
            for primitive in document['meshes'][node['mesh']]['primitives']:
                attributes = primitive['attributes']
                Require(primitive.get('mode', 4) == 4 and all(name in attributes for name in ('POSITION', 'NORMAL', 'TEXCOORD_0')), 'Actual PBR primitive lost native geometry, normals or QualityUV')
                count = document['accessors'][primitive['indices']]['count'] if 'indices' in primitive else document['accessors'][attributes['POSITION']]['count']
                Require(count % 3 == 0, 'Invalid PBR triangle count'); counts[owner] += count//3
                material = document['materials'][primitive['material']]; pbr = material['pbrMetallicRoughness']
                Require(all(key in pbr for key in ('baseColorTexture', 'metallicRoughnessTexture')) and all(key in material for key in ('normalTexture', 'occlusionTexture')), 'Standard GLB material lost one of actual Base/Normal/ORM channels')
                uses.append({'object': node['name'], 'part': owner, 'material': material.get('name'),
                             'Base': ImageInfo(pbr['baseColorTexture']), 'Normal': ImageInfo(material['normalTexture']),
                             'MetallicRoughness': ImageInfo(pbr['metallicRoughnessTexture']), 'Occlusion': ImageInfo(material['occlusionTexture'])})
        for child in node.get('children', []):
            Walk(child, owner)
    Walk(roots[0]); Require(counts == expectedTriangles, 'Actual PBR export changed native triangle counts')
    Require(partial or all(value > 0 for value in counts.values()), 'Complete PBR export lacks an optional component')
    return {'totalTriangles': sum(counts.values()), 'byPart': counts, 'triangleLimit': None,
            'uvPerTrianglePixelGate': False, 'resolution': resolution, 'materials': uses,
            'standardPbrChannelsPresent': True, 'nativeGraphEquivalentClaim': False,
            'partialProbe': partial, 'upAxis': '+Y', 'root': 'Pack_Root', 'rootPivotIdentity': True}


def BakeQualityPbr(root, outputDir, *, partSubset=None, resolution=4096, samples=32,
                   aoDistance=.010, marginPixels=None, exportFile=None):
    """Self-bake full evaluated geometry; partSubset is an explicit probe API.

    Output native graph fidelity still needs rendered comparison. This route
    makes no native-graph-equivalence claim or user approval automatically.
    Native .blend, objects, modifiers, shape keys, material graphs and UVs
    are restored/untouched; generated bake images and reports are outputs.
    """
    import bpy
    import numpy as np
    from mathutils import Matrix
    Require(root and root.name == 'Pack_Root' and 'Quality' in str(Path(bpy.data.filepath).parent), 'Open the saved independent QualityV12 Pack_Root')
    chosen = set(PARTS if partSubset is None else partSubset)
    Require(chosen and chosen <= set(PARTS), 'Invalid explicit quality part subset')
    Require(resolution >= 1024 and resolution <= 8192, 'Choose an explicit 1k..8k quality atlas size')
    packMarginPixels = int(marginPixels if marginPixels is not None else (4 if resolution <= 1024 else 8))
    Require(packMarginPixels >= 2, 'Atlas islands need an explicit image-space packing gap')
    bakeMarginPixels = max(1, packMarginPixels//2)
    Require(all(abs(root.matrix_world[row][column]-Matrix.Identity(4)[row][column]) < 1e-7 for row in range(4) for column in range(4)), 'Keep the native back-centre root identity')
    for part in PARTS:
        Require(any(child.name == part for child in root.children), 'Missing native independent '+part)
    outputDir = Path(outputDir).resolve(); outputDir.mkdir(parents=True, exist_ok=True)
    exportFile = Path(exportFile or outputDir/'Model_SichuanQualityPbrV12.glb').resolve()
    exportFile.parent.mkdir(parents=True, exist_ok=True)
    sourcePath = bpy.data.filepath; sourceDirtyAtStart = bool(bpy.data.is_dirty)
    savedSourceBefore = Evidence(sourcePath); scene = bpy.context.scene; started = time.time()
    originals = [obj for obj in root.children_recursive if obj.type == 'MESH' and not obj.hide_render and not obj.get('QualityExportExclude') and SourcePart(obj, root) in chosen and not obj.get('BakeOnly') and not obj.get('GameBakeSupportGenerator')]
    Require(originals, 'No visible native meshes in the selected Quality parts')
    Require(not bpy.context.object or bpy.context.object.mode == 'OBJECT', 'Exit Edit/Sculpt mode before baking')
    selected = list(bpy.context.selected_objects); active = bpy.context.view_layer.objects.active
    renderFlags = [(obj, obj.hide_render) for obj in scene.objects if obj.type == 'MESH']
    state = {'engine': scene.render.engine, 'samples': scene.cycles.samples, 'target': scene.render.bake.target,
             'selectedToActive': scene.render.bake.use_selected_to_active, 'clear': scene.render.bake.use_clear,
             'margin': scene.render.bake.margin, 'uvSelectSync': scene.tool_settings.use_uv_select_sync}
    collection = bpy.data.collections.new('QualityPbrV12_Temporary'); scene.collection.children.link(collection)
    copies, objects, meshes, materials, groups, images = {}, [], [], [], [], []
    reports, atlases, counts = [], {}, {part: 0 for part in PARTS}
    progressFile = outputDir/'Data_QualityPbrProgressV12.json'
    progress = {'generator': 'SichuanQualityPbrV12', 'stage': 'PreparingExactNativeCopies',
                'source': sourcePath, 'partSubset': sorted(chosen), 'resolution': resolution,
                'samples': samples, 'packMarginPixels': packMarginPixels, 'bakeMarginPixels': bakeMarginPixels,
                'packReports': {}, 'actualRawImages': {},
                'coverageAssertionUnchanged': 'Require finite values and some actual image alpha > .5; diagnose before changing this policy'}
    _WriteQualityProgress(progressFile, progress)
    try:
        required = {root, *(child for child in root.children if child.name in PARTS)}
        for original in originals:
            current = original
            while current and current != root:
                required.add(current); current = current.parent
        depsgraph = bpy.context.evaluated_depsgraph_get()
        sources = {}
        for original in sorted(required, key=ParentDepth):
            if original in originals:
                mesh = bpy.data.meshes.new_from_object(original.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
                meshes.append(mesh); copy = bpy.data.objects.new('QP12_'+original.name, mesh)
                slots = NativeMaterials(original); Require(slots and all(slots), 'Actual native material slot is empty: '+original.name)
                indices = array.array('i', [0])*len(mesh.polygons); mesh.polygons.foreach_get('material_index', indices)
                sourceUv = _SourceUv(mesh)
                # Keep original coordinate data before adding/activating the
                # target UV. UV-free source shaders cannot be silently given
                # a different original texture projection.
                sourceUvName = sourceUv.name if sourceUv else ''
                copied, coordinateChanges = [], []
                for source in slots:
                    shader, _ = _Principled(source)
                    Require(not shader.inputs['Metallic'].is_linked and abs(shader.inputs['Metallic'].default_value) < 1e-8, 'Native quality prop has an unexpected metallic graph')
                    material = source.copy(); materials.append(material)
                    changes = _ExplicitSourceUv(material, sourceUvName, groups)
                    Require(sourceUvName or not changes, 'UV-free source contains implicit UV image/normal inputs; inspect the native shader before assigning a new projection')
                    copied.append(material); coordinateChanges.append(changes)
                mesh.materials.clear()
                for material in copied:
                    mesh.materials.append(material)
                Require(all(index < len(copied) for index in indices), 'Evaluated native material slots do not match source')
                mesh.polygons.foreach_set('material_index', indices)
                sources[original] = {'materials': slots, 'copies': copied, 'uv': sourceUvName,
                                     'geometry': MeshDigest(mesh), 'materialIndicesSha256': hashlib.sha256(indices.tobytes()).hexdigest(),
                                     'coordinateChanges': coordinateChanges}
            else:
                copy = bpy.data.objects.new('QP12_'+original.name, None)
            collection.objects.link(copy); objects.append(copy); copies[original] = copy
            copy.parent = copies.get(original.parent); copy.matrix_world = original.matrix_world.copy()
            copy['QualityExportOriginalName'] = original.name
        bpy.context.view_layer.update()
        for original in originals:
            original.hide_render = True
        nativeSet = {root, *root.children_recursive}
        for obj, flag in renderFlags:
            if obj not in nativeSet:
                obj.hide_render = True
        scene.render.engine = 'CYCLES'; scene.cycles.samples = samples
        scene.render.bake.target = 'IMAGE_TEXTURES'; scene.render.bake.use_selected_to_active = False
        scene.render.bake.use_clear = False; scene.render.bake.margin = bakeMarginPixels
        scene.tool_settings.use_uv_select_sync = False
        for part in PARTS:
            if part not in chosen:
                continue
            partSources = [original for original in originals if SourcePart(original, root) == part]
            targets = [copies[original] for original in partSources]
            Require(targets, 'Selected part contains no actual native geometry: '+part)
            packReport = _PackQualityUv(targets, packMarginPixels, resolution, progress, progressFile, part)
            packReport['bakeMarginPixels'] = bakeMarginPixels
            progress['stage'] = 'UvPacked'; progress['currentPart'] = part
            progress['packReports'][part] = packReport
            progress['objectsInCurrentPart'] = [original.name for original in partSources]
            _WriteQualityProgress(progressFile, progress)
            for original in partSources:
                Require(MeshDigest(copies[original].data, (QUALITY_UV,)) == sources[original]['geometry'], 'Quality packing changed native source geometry/UV: '+original.name)
            partImages, partBakeFacts = {}, {}
            for channel in ('Base', 'Normal', 'Roughness', 'Ao'):
                background = (.5, .5, 1, 0) if channel == 'Normal' else (0, 0, 0, 0)
                image = _NewBakeImage('Texture_QualityV12_'+part+'_'+channel, resolution, 'sRGB' if channel == 'Base' else 'Non-Color', background)
                images.append(image); partImages[channel] = image
                for original in partSources:
                    obj = copies[original]; source = sources[original]
                    for index, explicit in enumerate(source['copies']):
                        sampled = explicit.copy() if channel == 'Normal' else _BakeMaterial(explicit, channel, aoDistance)
                        materials.append(sampled)
                        target = sampled.node_tree.nodes.new('ShaderNodeTexImage'); target.image = image
                        sampled.node_tree.nodes.active = target
                        obj.data.materials[index] = sampled
                    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
                    bpy.context.view_layer.objects.active = obj
                    progress.update({'stage': 'BakingActualShader', 'currentPart': part,
                                     'currentObject': original.name, 'currentChannel': channel,
                                     'actualActiveUv': obj.data.uv_layers.active.name,
                                     'actualRenderUv': next((layer.name for layer in obj.data.uv_layers if layer.active_render), None),
                                     'actualSourceUv': source['uv'], 'actualBakeTargetImage': image.name})
                    _WriteQualityProgress(progressFile, progress)
                    print('QUALITY_PBR_BAKE', json.dumps({'part': part, 'object': original.name, 'channel': channel,
                                                        'triangles': sum(len(face.vertices)-2 for face in obj.data.polygons),
                                                        'resolution': resolution, 'selectedToActive': False}), flush=True)
                    options = {'type': 'NORMAL', 'normal_space': 'TANGENT'} if channel == 'Normal' else {'type': 'EMIT'}
                    with bpy.context.temp_override(active_object=obj, object=obj, selected_objects=[obj], selected_editable_objects=[obj]):
                        result = bpy.ops.object.bake(**options)
                    Require('FINISHED' in result, 'Actual full-geometry self-bake did not finish')
                partBakeFacts[channel] = _ImageEvidence(image, outputDir/('Texture_QualityV12_'+part+'_'+channel+'.png'),
                                                       progress, progressFile, part+':'+channel, validateNow=False)
            progress['stage'] = 'AllFourRawChannelsSavedBeforeValidityAssertion'
            _WriteQualityProgress(progressFile, progress)
            for channel in ('Base', 'Normal', 'Roughness', 'Ao'):
                Require(partBakeFacts[channel]['finiteValues'], 'Actual '+part+' '+channel+' bake contains nonfinite values; all four raw PNGs and diagnostics preserved')
                Require(partBakeFacts[channel]['hasAlphaMarkedSurfacePixels'], 'Actual '+part+' '+channel+' bake has no alpha-marked surface pixels; all four raw PNGs/RGBA diagnostics and pack report preserved')
            # ORM is formed from real linear AO and roughness bake pixels,
            # never a guessed constant; B=0 follows the actual native shader.
            pixels = {}
            for channel in ('Roughness', 'Ao'):
                values = np.empty(resolution*resolution*4, dtype=np.float32)
                partImages[channel].pixels.foreach_get(values); pixels[channel] = values.reshape((-1, 4))
            ormPixels = np.empty((resolution*resolution, 4), dtype=np.float32)
            ormPixels[:, 0] = pixels['Ao'][:, 0]; ormPixels[:, 1] = pixels['Roughness'][:, 0]
            ormPixels[:, 2] = 0; ormPixels[:, 3] = np.minimum(pixels['Ao'][:, 3], pixels['Roughness'][:, 3])
            Require(np.isfinite(ormPixels).all(), 'Actual source ORM contains nonfinite pixels')
            orm = _NewBakeImage('Texture_QualityV12_'+part+'_Orm', resolution, 'Non-Color', (1, 1, 0, 1))
            images.append(orm); orm.pixels.foreach_set(ormPixels.ravel()); orm.update(); partImages['Orm'] = orm
            partBakeFacts['Orm'] = _ImageEvidence(orm, outputDir/('Texture_QualityV12_'+part+'_Orm.png'),
                                                 progress, progressFile, part+':Orm')
            actualImages = {channel: {**partBakeFacts[channel], 'resolution': [resolution, resolution]}
                            for channel in ('Base', 'Normal', 'Orm')}
            atlases[part] = {'packing': packReport, 'images': actualImages, 'channelsActuallyBaked': ['Base EMIT', 'Roughness EMIT', 'AO EMIT', 'Normal TANGENT'],
                             'rawRoughnessAndAoRetained': True, 'rawRoughness': partBakeFacts['Roughness'],
                             'rawAo': partBakeFacts['Ao'], 'allOriginalSourceUvHashesUnchanged': True}
            del pixels, ormPixels, values
            # Reload encoded images for runtime binding; otherwise fifteen
            # 4k FLOAT images alone would hold about four GiB unnecessarily.
            floatImages = list(partImages.values())
            runtimeImages = {}
            for channel in ('Base', 'Normal', 'Orm'):
                runtime = bpy.data.images.load(str(outputDir/('Texture_QualityV12_'+part+'_'+channel+'.png')), check_existing=False)
                runtime.colorspace_settings.name = 'sRGB' if channel == 'Base' else 'Non-Color'
                images.append(runtime); runtimeImages[channel] = runtime
            partImages = runtimeImages
            for original in partSources:
                obj = copies[original]; source = sources[original]; retained = []
                for index, material in enumerate(source['materials']):
                    runtime, constants = _PbrRuntimeMaterial(material, partImages, groups)
                    materials.append(runtime); obj.data.materials[index] = runtime
                    retained.append({'source': material.name, 'runtime': runtime.name, 'constantNativePbrInputs': constants})
                sourceHashAfter = MeshDigest(obj.data, (QUALITY_UV,))
                Require(sourceHashAfter == source['geometry'], 'Self bake altered actual source geometry/UV')
                # Native scene and material source UVs remain untouched.
                # The export-only copy needs one clear runtime tangent basis.
                for layer in list(obj.data.uv_layers):
                    if layer.name != QUALITY_UV:
                        obj.data.uv_layers.remove(layer)
                obj.data.uv_layers.active = obj.data.uv_layers[QUALITY_UV]; obj.data.uv_layers.active.active_render = True
                triangles = sum(len(face.vertices)-2 for face in obj.data.polygons); counts[part] += triangles
                reports.append({'object': original.name, 'part': part, 'triangles': triangles, 'vertices': len(obj.data.vertices),
                                'sourceGeometryAndUvs': source['geometry'], 'sourceGeometryAndUvsAfterBake': sourceHashAfter,
                                'sourceUv': source['uv'], 'sourceMaterialIndicesSha256': source['materialIndicesSha256'],
                                'nativeCoordinatesExplicitInCopies': True, 'coordinateChanges': source['coordinateChanges'], 'materialConstants': retained,
                                'exportUv': QUALITY_UV, 'exportTexCoord': 0})
            for image in floatImages:
                images.remove(image); bpy.data.images.remove(image, do_unlink=True)
        exportTopology = []
        progress['stage'] = 'TriangulatingOnlyTemporaryNgonsForTangentExport'
        _WriteQualityProgress(progressFile, progress)
        for original in originals:
            adjustment = TriangulateQualityNgonsForExport(copies[original], meshes)
            exportTopology.append(adjustment)
            progress['exportTopologyAdjustments'] = exportTopology
            _WriteQualityProgress(progressFile, progress)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = copies[root]
        result = bpy.ops.export_scene.gltf(filepath=str(exportFile), export_format='GLB', use_selection=True,
                                          export_yup=True, export_apply=False, export_normals=True,
                                          export_tangents=True, export_materials='EXPORT', export_extras=True,
                                          export_animations=False, export_cameras=False, export_lights=False,
                                          export_vertex_color='NONE', export_image_format='AUTO')
        Require('FINISHED' in result, 'Quality PBR GLB export did not finish')
        actual = VerifyQualityPbrGlb(exportFile, counts, resolution, chosen != set(PARTS))
        report = {'generator': 'SichuanQualityPbrV12', 'blenderVersion': bpy.app.version_string,
                  'sourceBlend': Evidence(sourcePath), 'glb': Evidence(exportFile),
                  'sourceUnsavedChangesAtStart': sourceDirtyAtStart,
                  'savedSourceFileUnchanged': Evidence(sourcePath) == savedSourceBefore,
                  'seconds': time.time()-started, 'partSubset': sorted(chosen), 'partialProbe': chosen != set(PARTS),
                  'resolutionPerPart': [resolution, resolution], 'nativeSceneSavedOrRewritten': False,
                  'geometryPolicy': 'Actual full evaluated native geometry, no decimation; source scene modifiers/shape keys/UVs/materials untouched',
                  'projection': 'Self bake, selected-to-active false; original render meshes replaced by exact-world-transform copies to avoid duplicate AO; original coordinate anchor IDs retained',
                  'atlases': atlases, 'objects': reports, 'actualGlb': actual,
                  'exportTopologyAdjustments': exportTopology,
                  'nativeGraphEquivalentClaim': False, 'referenceFidelityReviewed': False, 'finalModelApprovedByUser': False,
                  'remainingReview': ['Inspect single-object Smart UV internal overlap/padding and visible seams on actual part probes',
                                      'Compare native Cycles and actual exported GLB under matched light',
                                      'Verify flat character-contact back and root/optional-part behaviour on actual output']}
        (outputDir/'Data_QualityPbrBakeV12.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf8')
        progress['stage'] = 'Exported'; progress['glb'] = report['glb']
        _WriteQualityProgress(progressFile, progress)
        print('QUALITY_PBR_EXPORTED', json.dumps({'file': str(exportFile), 'triangles': sum(counts.values()),
                                                'resolutionPerPart': resolution, 'sha256': report['glb']['sha256'],
                                                'partialProbe': report['partialProbe']}), flush=True)
        return report
    finally:
        for obj, flag in renderFlags:
            obj.hide_render = flag
        scene.render.engine = state['engine']; scene.cycles.samples = state['samples']
        scene.render.bake.target = state['target']; scene.render.bake.use_selected_to_active = state['selectedToActive']
        scene.render.bake.use_clear = state['clear']; scene.render.bake.margin = state['margin']
        scene.tool_settings.use_uv_select_sync = state['uvSelectSync']
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
        for obj in reversed(objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        for mesh in meshes:
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
        for material in materials:
            if material.users == 0:
                bpy.data.materials.remove(material)
        for group in reversed(groups):
            if group.users == 0:
                bpy.data.node_groups.remove(group)
        for image in images:
            if image.users == 0:
                bpy.data.images.remove(image)
        if collection.users:
            bpy.data.collections.remove(collection)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in selected:
            if obj.name in bpy.data.objects:
                obj.select_set(True)
        if active and active.name in bpy.data.objects:
            bpy.context.view_layer.objects.active = active
