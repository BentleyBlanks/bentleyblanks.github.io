"""Bind and export the selected GameV10 hierarchy with exact baked WebP bytes.

Call BindAndExportGame(root, candidateProject) after the encoder. The retained
High_* objects remain in the managed .blend and are excluded from this export.
"""
from collections import Counter
import hashlib
import json
from pathlib import Path
import struct


PARTS = ('Pack_Bundle', 'Pack_Binding', 'Pack_Jacket', 'Pack_StrawMat', 'Pack_Sandals')
CHANNELS = ('Base', 'Normal', 'Orm')
MATERIAL_NAME = 'Material_SichuanPackBaked'


def Require(ok, message):
    if not ok:
        raise RuntimeError(message)


def Evidence(filePath):
    filePath = Path(filePath).resolve()
    payload = filePath.read_bytes()
    return {'path': str(filePath), 'bytes': len(payload),
            'sha256': hashlib.sha256(payload).hexdigest()}


def ReadGlb(filePath):
    payload = Path(filePath).read_bytes()
    Require(len(payload) >= 28 and payload[:4] == b'glTF', 'Invalid exported GLB')
    version, length = struct.unpack_from('<II', payload, 4)
    Require(version == 2 and length == len(payload), 'Invalid GLB 2 byte length')
    offset, document, binary = 12, None, None
    while offset < len(payload):
        chunkLength, chunkType = struct.unpack_from('<I4s', payload, offset)
        offset += 8
        chunk = payload[offset:offset + chunkLength]
        Require(len(chunk) == chunkLength, 'Truncated GLB chunk')
        if chunkType == b'JSON':
            Require(document is None, 'Repeated GLB JSON chunk')
            document = json.loads(chunk.rstrip(b' \0').decode('utf-8'))
        elif chunkType == b'BIN\0':
            Require(binary is None, 'Repeated GLB BIN chunk')
            binary = chunk
        else:
            raise RuntimeError('Unexpected GLB chunk type')
        offset += chunkLength
    Require(document is not None and binary is not None, 'Missing GLB JSON/BIN')
    return document, binary


def ReadAccessor(document, binary, accessorId):
    accessor = document['accessors'][accessorId]
    Require('sparse' not in accessor and 'bufferView' in accessor,
            'Exported production accessor must be directly readable')
    view = document['bufferViews'][accessor['bufferView']]
    component = {5121: ('B', 1), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
    count = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
    Require(accessor['componentType'] in component and accessor['type'] in count,
            'Unexpected production accessor format')
    code, byteSize = component[accessor['componentType']]
    components = count[accessor['type']]
    stride = view.get('byteStride', byteSize * components)
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    return [struct.unpack_from('<' + code * components, binary, start + index * stride)
            for index in range(accessor['count'])]


def HierarchyReport(document):
    nodes = document.get('nodes', [])
    roots = document.get('scenes', [])[document.get('scene', 0)].get('nodes', [])
    Require(len(document.get('scenes', [])) == 1 and len(roots) == 1 and
            nodes[roots[0]].get('name') == 'Pack_Root', 'Export must have one Pack_Root scene')
    visited, meshIds, triangleCounts = set(), set(), {part: 0 for part in PARTS}

    def Walk(nodeId, owner=None):
        Require(nodeId not in visited, 'Repeated scene node in export')
        visited.add(nodeId)
        node = nodes[nodeId]
        if node.get('name') in PARTS:
            Require(owner is None, 'One optional part is nested in another')
            owner = node['name']
        Require(not node.get('name', '').startswith('High_'), 'High source leaked into GLB')
        if 'mesh' in node:
            Require(owner in PARTS, 'Mesh is outside the five controlled components')
            meshIds.add(node['mesh'])
            for primitive in document['meshes'][node['mesh']]['primitives']:
                Require(primitive.get('mode', 4) == 4 and 'TEXCOORD_1' in primitive['attributes'],
                        'Production primitive lacks triangles or GameUV/TEXCOORD_1')
                count = document['accessors'][primitive['indices']]['count'] if 'indices' in primitive else \
                    document['accessors'][primitive['attributes']['POSITION']]['count']
                Require(count % 3 == 0, 'Invalid exported triangle index count')
                triangleCounts[owner] += count // 3
        for child in node.get('children', []):
            Walk(child, owner)

    Walk(roots[0])
    Require(len(visited) == len(nodes), 'Unreachable scene nodes were included in the GLB')
    Require(len(meshIds) == len(document.get('meshes', [])), 'Unused mesh resources leaked into GLB')
    for part in PARTS:
        Require(sum(node.get('name') == part for node in nodes) == 1 and triangleCounts[part] > 0,
                'Missing or repeated controlled part ' + part)
    Require(0 < sum(triangleCounts.values()) <= 3000,
            'All-parts exported triangle count exceeds 3000: ' + str(triangleCounts))
    return triangleCounts


def VerifyGameUv(document, binary, expectedCorners):
    proof = []
    for node in document['nodes']:
        if 'mesh' not in node:
            continue
        actual = Counter()
        for primitive in document['meshes'][node['mesh']]['primitives']:
            uv = ReadAccessor(document, binary, primitive['attributes']['TEXCOORD_1'])
            indices = [value[0] for value in ReadAccessor(document, binary, primitive['indices'])] \
                if 'indices' in primitive else range(len(uv))
            actual.update((round(uv[index][0], 6), round(uv[index][1], 6)) for index in indices)
        Require(node['name'] in expectedCorners and actual == expectedCorners[node['name']],
                'Actual exported TEXCOORD_1 differs from Blender GameUV on ' + node['name'])
        proof.append({'object': node['name'], 'corners': sum(actual.values()),
                      'actualExportMatchesGameUv': True})
    Require(len(proof) == len(expectedCorners), 'Not every selected mesh was exported')
    return proof


def EmbedExactMaps(filePath, imageFiles, expectedCorners=None):
    """Replace all exporter image encodings; keep geometry buffer bytes intact."""
    document, binary = ReadGlb(filePath)
    counts = HierarchyReport(document)
    uvProof = VerifyGameUv(document, binary, expectedCorners) if expectedCorners is not None else []
    Require(len(document.get('buffers', [])) == 1 and 'uri' not in document['buffers'][0],
            'Expected a single embedded production buffer')
    oldImageViews = {image['bufferView'] for image in document.get('images', []) if 'bufferView' in image}
    document['images'], document['textures'] = [], []
    compact, views, viewMap = bytearray(), [], {}
    for oldId, view in enumerate(document.get('bufferViews', [])):
        if oldId in oldImageViews:
            continue
        Require(view.get('buffer', 0) == 0, 'Unexpected external buffer view')
        start, length = view.get('byteOffset', 0), view['byteLength']
        compact.extend(b'\0' * (-len(compact) % 4))
        copied = dict(view)
        copied.update(buffer=0, byteOffset=len(compact))
        Require(len(binary[start:start + length]) == length, 'Truncated geometry view')
        compact.extend(binary[start:start + length])
        viewMap[oldId] = len(views)
        views.append(copied)

    def RemapViews(value):
        if isinstance(value, dict):
            for key, child in list(value.items()):
                if key == 'bufferView':
                    Require(child in viewMap, 'Image view is unexpectedly shared with geometry')
                    value[key] = viewMap[child]
                else:
                    RemapViews(child)
        elif isinstance(value, list):
            for child in value:
                RemapViews(child)

    # The old bufferViews list contains byte-layout descriptors, not references.
    document['bufferViews'] = []
    RemapViews(document)
    document['bufferViews'] = views
    images = []
    for channel in CHANNELS:
        payload = Path(imageFiles[channel]).read_bytes()
        Require(payload[:4] == b'RIFF' and payload[8:12] == b'WEBP',
                channel + ' external map is not WebP')
        compact.extend(b'\0' * (-len(compact) % 4))
        viewId = len(views)
        views.append({'buffer': 0, 'byteOffset': len(compact), 'byteLength': len(payload)})
        compact.extend(payload)
        imageId = len(document['images'])
        document['images'].append({'name': 'Texture_SichuanBlanketPack' + channel,
                                  'mimeType': 'image/webp', 'bufferView': viewId})
        document['textures'].append({'sampler': 0,
                                    'extensions': {'EXT_texture_webp': {'source': imageId}}})
        images.append({'channel': channel, **Evidence(imageFiles[channel])})
    document['samplers'] = [{'magFilter': 9729, 'minFilter': 9987,
                             'wrapS': 33071, 'wrapT': 33071}]
    document['materials'] = [{
        'name': MATERIAL_NAME, 'extras': {'AtlasRegion': 'surface', 'UvSet': 'GameUV'},
        'pbrMetallicRoughness': {
            'baseColorFactor': [1, 1, 1, 1], 'baseColorTexture': {'index': 0, 'texCoord': 1},
            'metallicFactor': 1, 'roughnessFactor': 1,
            'metallicRoughnessTexture': {'index': 2, 'texCoord': 1}},
        'normalTexture': {'index': 1, 'texCoord': 1, 'scale': 1},
        'occlusionTexture': {'index': 2, 'texCoord': 1, 'strength': 1},
        'alphaMode': 'OPAQUE', 'doubleSided': True
    }]
    for mesh in document['meshes']:
        for primitive in mesh['primitives']:
            primitive['material'] = 0
    usedExtensions = set()

    def GatherExtensions(value):
        if isinstance(value, dict):
            usedExtensions.update(value.get('extensions', {}).keys())
            for child in value.values():
                GatherExtensions(child)
        elif isinstance(value, list):
            for child in value:
                GatherExtensions(child)

    GatherExtensions(document)
    document['extensionsUsed'] = sorted(usedExtensions)
    document['extensionsRequired'] = sorted({'EXT_texture_webp'} | (
        set(document.get('extensionsRequired', [])) & usedExtensions))
    compact.extend(b'\0' * (-len(compact) % 4))
    document['buffers'] = [{'byteLength': len(compact)}]
    jsonBytes = json.dumps(document, separators=(',', ':'), ensure_ascii=True).encode('utf-8')
    jsonBytes += b' ' * (-len(jsonBytes) % 4)
    length = 28 + len(jsonBytes) + len(compact)
    encoded = struct.pack('<4sII', b'glTF', 2, length) + \
        struct.pack('<I4s', len(jsonBytes), b'JSON') + jsonBytes + \
        struct.pack('<I4s', len(compact), b'BIN\0') + compact
    temporary = Path(filePath).with_suffix('.tmp')
    temporary.write_bytes(encoded)
    decoded, actualBinary = ReadGlb(temporary)
    HierarchyReport(decoded)
    for index, channel in enumerate(CHANNELS):
        image = decoded['images'][index]
        view = decoded['bufferViews'][image['bufferView']]
        embedded = actualBinary[view['byteOffset']:view['byteOffset'] + view['byteLength']]
        Require(embedded == Path(imageFiles[channel]).read_bytes(),
                channel + ' full embedded bytes do not equal the external map')
    temporary.replace(filePath)
    return {'trianglesByPart': counts, 'totalTriangles': sum(counts.values()),
            'images': images, 'gameUvProof': uvProof, 'exactExternalWebpBytes': True,
            'glb': Evidence(filePath)}


def BindAndExportGame(root, candidateProject):
    import bpy
    from mathutils import Matrix
    scene = bpy.context.scene
    Require(root.name == 'Pack_Root' and scene.get('BlenderMcpTask') == 'SichuanBlanketPack',
            'Export only this task Pack_Root')
    highPath = Path(root['SourceBlend']).resolve()
    sourcePath = highPath.parent.parent / 'GameV10/Scene_SichuanPackGameV10.blend'
    Require(Path(bpy.data.filepath).resolve() == sourcePath,
            'Open the managed GameV10 copy before exporting; preserve HighV10')
    Require(max(abs(root.matrix_world[row][column] - Matrix.Identity(4)[row][column])
                for row in range(4) for column in range(4)) < 1e-7,
            'Pack_Root must retain identity axes and back-center pivot')
    Require(abs(scene.unit_settings.scale_length - 1) < 1e-8,
            'Native game scene must use meter units')
    candidateProject = Path(candidateProject).resolve()
    modelPath = candidateProject / 'Model/SichuanBlanketPack'
    manifest = json.loads((modelPath / 'Data_SichuanBlanketPackTextures.json').read_text(encoding='utf-8-sig'))
    imageFiles = {}
    for channel in CHANNELS:
        entries = [item for item in manifest['files'] if item['channel'] == channel]
        Require(len(entries) == 1, 'Exactly one external map per PBR channel is required')
        entry = entries[0]
        filePath = (candidateProject / entry['path']).resolve()
        actual = Evidence(filePath)
        Require(actual['sha256'] == entry['sha256'] and actual['bytes'] == entry['bytes'],
                'External map changed after encoding: ' + channel)
        imageFiles[channel] = filePath
    selected = [root, *root.children_recursive]
    meshes = [obj for obj in selected if obj.type == 'MESH']
    Require(meshes, 'Game hierarchy contains no meshes')
    outsideMeshes = [obj for obj in bpy.data.objects if obj.type == 'MESH' and obj not in meshes]
    Require(not any(obj.data == other.data for obj in meshes for other in outsideMeshes),
            'Game meshes must not share mutable mesh data with high sources')
    expectedCorners = {}
    for obj in meshes:
        Require(len(obj.data.uv_layers) == 2 and obj.data.uv_layers[1].name == 'GameUV',
                obj.name + ' must retain SurfaceUV first and GameUV second')
        obj.data.calc_loop_triangles()
        layer = obj.data.uv_layers['GameUV']
        expected = Counter()
        for triangle in obj.data.loop_triangles:
            for loop in triangle.loops:
                uv = layer.data[loop].uv
                exportedV = struct.unpack('<f', struct.pack('<f', 1 - float(uv.y)))[0]
                expected[(round(float(uv.x), 6), round(exportedV, 6))] += 1
        expectedCorners[obj.name] = expected
    Require(sum(sum(counter.values()) // 3 for counter in expectedCorners.values()) <= 3000,
            'Selected hierarchy exceeds the all-parts 3000-triangle cap')
    material = bpy.data.materials.get(MATERIAL_NAME)
    if material is None or any(material in obj.data.materials[:] for obj in outsideMeshes):
        material = bpy.data.materials.new(MATERIAL_NAME)
    material.use_nodes = True
    material['AtlasRegion'], material['UvSet'] = 'surface', 'GameUV'
    material.use_backface_culling = False
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    shader = nodes.new('ShaderNodeBsdfPrincipled')
    shader.inputs['Roughness'].default_value = 1
    shader.inputs['Metallic'].default_value = 1
    links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    uvNode = nodes.new('ShaderNodeUVMap')
    uvNode.uv_map = 'GameUV'
    loadedImages = {}
    for channel in CHANNELS:
        image = bpy.data.images.load(str(imageFiles[channel]), check_existing=False)
        Require(tuple(image.size) == (1024, 1024), 'Final packed maps must be 1024 square')
        image.colorspace_settings.name = 'sRGB' if channel == 'Base' else 'Non-Color'
        image.pack()
        loadedImages[channel] = image
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        links.new(uvNode.outputs['UV'], texture.inputs['Vector'])
        if channel == 'Base':
            links.new(texture.outputs['Color'], shader.inputs['Base Color'])
        elif channel == 'Normal':
            normal = nodes.new('ShaderNodeNormalMap')
            normal.uv_map, normal.space = 'GameUV', 'TANGENT'
            normal.inputs['Strength'].default_value = 1
            links.new(texture.outputs['Color'], normal.inputs['Color'])
            links.new(normal.outputs['Normal'], shader.inputs['Normal'])
        else:
            separate = nodes.new('ShaderNodeSeparateColor')
            links.new(texture.outputs['Color'], separate.inputs[0])
            links.new(separate.outputs['Green'], shader.inputs['Roughness'])
            links.new(separate.outputs['Blue'], shader.inputs['Metallic'])
            groupTree = bpy.data.node_groups.get('glTF Material Output')
            if groupTree is None:
                groupTree = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
                socket = groupTree.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
                socket.default_value = 1
            group = nodes.new('ShaderNodeGroup')
            group.node_tree = groupTree
            Require('Occlusion' in group.inputs, 'glTF material output group lacks Occlusion')
            links.new(separate.outputs['Red'], group.inputs['Occlusion'])
    for obj in meshes:
        obj.data.materials.clear()
        obj.data.materials.append(material)
        for polygon in obj.data.polygons:
            polygon.material_index = 0
        obj.data.uv_layers.active = obj.data.uv_layers['GameUV']
        obj.data.uv_layers['GameUV'].active_render = True
    root['SurfaceBake'] = 'HighV10 to unique GameUV: actual Base/Normal/AO/Roughness projection, 1024 lossless maps'
    root['TriangleLimit'] = 3000
    modelPath.mkdir(parents=True, exist_ok=True)
    outputPath = modelPath / 'Model_SichuanBlanketPack.glb'
    oldSelected = list(bpy.context.selected_objects)
    oldActive = bpy.context.view_layer.objects.active
    visibility = {obj: (obj.hide_get(), obj.hide_render) for obj in selected}
    try:
        bpy.ops.object.select_all(action='DESELECT')
        for obj in selected:
            obj.hide_set(False)
            obj.hide_render = False
            obj.select_set(True)
        bpy.context.view_layer.objects.active = root
        options = dict(filepath=str(outputPath), export_format='GLB', use_selection=True,
                       use_visible=False, use_renderable=False, export_yup=True,
                       export_apply=True, export_extras=True, export_texcoords=True,
                       export_normals=True, export_tangents=True, export_materials='EXPORT',
                       export_image_format='AUTO', export_animations=False,
                       export_skins=False, export_morph=False, export_cameras=False,
                       export_lights=False)
        available = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
        bpy.ops.export_scene.gltf(**{key: value for key, value in options.items() if key in available})
        report = EmbedExactMaps(outputPath, imageFiles, expectedCorners)
    finally:
        bpy.ops.object.select_all(action='DESELECT')
        for obj, (viewport, render) in visibility.items():
            obj.hide_set(viewport)
            obj.hide_render = render
        for obj in oldSelected:
            if obj.name in bpy.context.view_layer.objects:
                obj.select_set(True)
        bpy.context.view_layer.objects.active = oldActive
    repository = Path(scene['SichuanPackRepository'])
    rebuilds = list((repository / 'Taierzhuang1938/_blender').glob('Script_SichuanGame*V10.py'))
    rebuilds += [repository / 'Taierzhuang1938/_import/Script_SichuanGameMapsV10.py',
                 repository / 'Taierzhuang1938/_import/Script_SichuanGameMetadataV10.mjs',
                 repository / 'Taierzhuang1938/_blender/Script_SichuanBlanketPackVerify.mjs',
                 modelPath / 'Data_SichuanBlanketPackTextures.json',
                 candidateProject / '_import/SichuanBlanketPack/Data_SichuanBlanketPackTextureBake.json']
    for filePath in rebuilds:
        Require(filePath.exists(), 'Missing rebuild source text ' + str(filePath))
        text = bpy.data.texts.get(filePath.name) or bpy.data.texts.new(filePath.name)
        text.clear()
        text.write(filePath.read_text(encoding='utf-8-sig'))
    scene['SichuanPackStage'] = 'GameV10BakedForFinalReview'
    bpy.ops.wm.save_as_mainfile(filepath=str(sourcePath))
    report.update(gameBlend=str(sourcePath), packedMaps=True,
                  allOptionalPartsIncluded=True, retainedHighSource=str(highPath),
                  rebuildTexts=[filePath.name for filePath in rebuilds])
    reviewPath = Path(scene['SichuanGameOutput'])
    reviewPath.mkdir(parents=True, exist_ok=True)
    (reviewPath / 'Data_GameExport.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('GAME_V10_EXPORTED', json.dumps(report), flush=True)
    return report


if __name__ == '__main__':
    import bpy
    BindAndExportGame(bpy.data.objects['Pack_Root'],
                      Path(bpy.context.scene['SichuanGameOutput']) / 'Delivery/Taierzhuang1938')
