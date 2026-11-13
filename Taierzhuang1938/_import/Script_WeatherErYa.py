"""Bake API-generated dirt layers over Er Ya's accepted color textures.

Geometry, UVs, placement, normal maps and roughness maps come from the fixed
baseline scene. Run with scripts/Script_BlenderMcp.mjs exec --file.
"""

import hashlib
import json
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

projectRoot = Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\ErYaWeathered_20261114')
outputRoot = Path(r'C:\Users\Bentl\OneDrive\Sync\饮河\FPS\角色\Tripo\25_二丫')
baselinePath = projectRoot / 'Inputs' / 'Scene_ErYa_CleanBaseline.blend'
task = json.loads((projectRoot / 'Data_WeatheringTask_V1.json').read_text())
assert hashlib.sha256(baselinePath.read_bytes()).hexdigest() == task['baselineSha256']
maskPaths = {role: projectRoot / 'Textures' / ('Texture_ErYa_' + role + 'Grime_2K.png')
             for role in ['Cloth', 'Skin']}
for path in maskPaths.values():
    if not path.is_file():
        raise FileNotFoundError(path)
bpy.ops.wm.open_mainfile(filepath=str(baselinePath))
scene = bpy.data.scenes['Scene']
window = bpy.context.window_manager.windows[0]
window.scene = scene


def GeometrySignature(obj):
    values = [np.array([vertex.co[:] for vertex in obj.data.vertices], dtype=np.float32),
              np.array([loop.vertex_index for loop in obj.data.loops], dtype=np.int32),
              np.array([normal.vector[:] for normal in obj.data.corner_normals], dtype=np.float32),
              np.array([uv.uv[:] for uv in obj.data.uv_layers.active.data], dtype=np.float32),
              np.array([face.material_index for face in obj.data.polygons], dtype=np.int32),
              np.array(obj.matrix_world, dtype=np.float32)]
    return hashlib.sha256(b''.join(value.tobytes() for value in values)).hexdigest()


def BuildWeatherColor(material, role, grimeImage, headAnchor, collarCenter):
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
    originalBase = shader.inputs['Base Color'].links[0].from_socket

    def Node(kind):
        return nodes.new(kind)

    def Connect(value, socket):
        if isinstance(value, bpy.types.NodeSocket):
            links.new(value, socket)
        else:
            socket.default_value = value

    def Math(operation, a, b=0):
        node = Node('ShaderNodeMath')
        node.operation = operation
        Connect(a, node.inputs[0])
        Connect(b, node.inputs[1])
        return node.outputs[0]

    def Clamp(value):
        node = Node('ShaderNodeClamp')
        Connect(value, node.inputs['Value'])
        return node.outputs['Result']

    def Range(value, minimum, maximum):
        node = Node('ShaderNodeMapRange')
        node.interpolation_type = 'SMOOTHSTEP'
        node.clamp = True
        Connect(value, node.inputs['Value'])
        node.inputs['From Min'].default_value = minimum
        node.inputs['From Max'].default_value = maximum
        return node.outputs['Result']

    def Mix(a, b, amount, operation='MIX'):
        node = Node('ShaderNodeMixRGB')
        node.blend_type = operation
        Connect(amount, node.inputs[0])
        Connect(a, node.inputs[1])
        Connect(b, node.inputs[2])
        return node.outputs[0]

    geometry = Node('ShaderNodeNewGeometry')
    position = geometry.outputs['Position']
    separate = Node('ShaderNodeSeparateXYZ')
    links.new(position, separate.inputs[0])
    rotation = Node('ShaderNodeVectorRotate')
    rotation.rotation_type = 'EULER_XYZ'
    links.new(position, rotation.inputs['Vector'])
    rotation.inputs['Rotation'].default_value = (.43, .71, .29)
    noise = Node('ShaderNodeTexNoise')
    links.new(position, noise.inputs['Vector'])
    noise.inputs['Scale'].default_value = 10
    noise.inputs['Detail'].default_value = 2
    warp = Node('ShaderNodeVectorMath')
    warp.operation = 'SCALE'
    links.new(noise.outputs['Color'], warp.inputs[0])
    warp.inputs['Scale'].default_value = .045
    distorted = Node('ShaderNodeVectorMath')
    distorted.operation = 'ADD'
    links.new(rotation.outputs[0], distorted.inputs[0])
    links.new(warp.outputs[0], distorted.inputs[1])
    scale = Node('ShaderNodeVectorMath')
    scale.operation = 'SCALE'
    links.new(distorted.outputs[0], scale.inputs[0])
    scale.inputs['Scale'].default_value = 1 / (.72 if role == 'Cloth' else .34)
    coordinates = Node('ShaderNodeSeparateXYZ')
    links.new(scale.outputs[0], coordinates.inputs[0])
    axes = [Math('PINGPONG', coordinates.outputs[index], 1) for index in range(3)]
    samples = []
    for a, b in [(1, 2), (0, 2), (0, 1)]:
        vector = Node('ShaderNodeCombineXYZ')
        links.new(axes[a], vector.inputs['X'])
        links.new(axes[b], vector.inputs['Y'])
        image = Node('ShaderNodeTexImage')
        image.image = grimeImage
        image.extension = 'EXTEND'
        links.new(vector.outputs[0], image.inputs['Vector'])
        gray = Node('ShaderNodeRGBToBW')
        links.new(image.outputs['Color'], gray.inputs[0])
        samples.append(gray.outputs[0])
    pattern = Math('DIVIDE', Math('ADD', Math('ADD', samples[0], samples[1]), samples[2]), 3)
    pattern = Range(pattern, grimeImage['WeatheringLevelLow'], grimeImage['WeatheringLevelHigh'])
    coverage = Node('ShaderNodeTexNoise')
    links.new(position, coverage.inputs['Vector'])
    coverage.inputs['Scale'].default_value = 8 if role == 'Cloth' else 17
    coverage.inputs['Detail'].default_value = 2
    coverage = Range(coverage.outputs['Fac'], .30, .67)
    pattern = Math('MULTIPLY', pattern, Math('ADD', .18, Math('MULTIPLY', coverage, .82)))
    distance = Node('ShaderNodeVectorMath')
    distance.operation = 'DISTANCE'
    links.new(position, distance.inputs[0])
    distance.inputs[1].default_value = collarCenter
    collar = Math('SUBTRACT', 1, Range(distance.outputs['Value'], .025, .14))

    if role == 'Cloth':
        low = Math('SUBTRACT', 1, Range(separate.outputs['Z'], .12, .70))
        lateral = Math('ABSOLUTE', separate.outputs['Y'])
        cuff = Math('MULTIPLY', Range(lateral, .37, .55), Range(separate.outputs['Z'], .72, .92))
        strength = Math('ADD', .90, Math('ADD', Math('MULTIPLY', low, .40),
                        Math('ADD', Math('MULTIPLY', cuff, .35), Math('MULTIPLY', collar, .45))))
        dirt = Clamp(Math('MULTIPLY', pattern, strength))
        dark = Math('SUBTRACT', 1, Math('MULTIPLY', dirt, .75))
        base = Mix(originalBase, dark, 1, 'MULTIPLY')
        dust = Mix(base, (.17, .135, .09, 1), Math('MULTIPLY', dirt, .40))
        mud = Math('MULTIPLY', low, Range(pattern, .58, .88))
        return Mix(dust, (.055, .036, .020, 1), Math('MULTIPLY', mud, .62))

    protection = 0
    neck = collar
    if role == 'Head':
        local = Node('ShaderNodeTexCoord')
        local.object = headAnchor
        localPosition = local.outputs['Object']
        for center, radius in [((.28, .13, .59), (.10, .075, .075)),
                                ((.28, -.13, .59), (.10, .075, .075)),
                                ((.29, 0, .35), (.10, .12, .055)),
                                ((.35, 0, .49), (.045, .07, .04))]:
            delta = Node('ShaderNodeVectorMath')
            delta.operation = 'SUBTRACT'
            links.new(localPosition, delta.inputs[0])
            delta.inputs[1].default_value = center
            normalized = Node('ShaderNodeVectorMath')
            normalized.operation = 'DIVIDE'
            links.new(delta.outputs[0], normalized.inputs[0])
            normalized.inputs[1].default_value = radius
            length = Node('ShaderNodeVectorMath')
            length.operation = 'LENGTH'
            links.new(normalized.outputs[0], length.inputs[0])
            weight = Math('SUBTRACT', 1, Range(length.outputs['Value'], .55, 1.15))
            protection = Math('MAXIMUM', protection, weight)
    strength = Math('ADD', .9 if role == 'Head' else 1.1, Math('MULTIPLY', neck, .40))
    dirt = Clamp(Math('MULTIPLY', Math('MULTIPLY', pattern, strength),
                      Math('SUBTRACT', 1, Math('MULTIPLY', protection, .98))))
    base = Mix(originalBase, Math('SUBTRACT', 1, Math('MULTIPLY', dirt, .75)), 1, 'MULTIPLY')
    return Mix(base, (.095, .075, .048, 1), Math('MULTIPLY', dirt, .30))


def BakeWeathered(scene):
    bpy.context.view_layer.update()
    parts = [obj for obj in bpy.data.collections['ErYa_TPose'].objects if obj.type == 'MESH']
    signatures = {obj.name: GeometrySignature(obj) for obj in parts}
    masks = {}
    for role, path in maskPaths.items():
        image = bpy.data.images.load(str(path))
        image.colorspace_settings.name = 'Non-Color'
        assert tuple(image.size) == (2048, 2048)
        pixels = np.array(image.pixels[:], dtype=np.float32).reshape(-1, 4)
        values = pixels[:, :3].mean(axis=1)
        span = float(np.percentile(values, 95) - np.percentile(values, 5)) * .30
        image['WeatheringLevelLow'] = float(values.mean()) - span
        image['WeatheringLevelHigh'] = float(values.mean()) + span
        masks[role] = image
    head = bpy.data.objects['Part_ErYa_HeadBald']
    body = bpy.data.objects['Part_ErYa_Body']
    anchor = bpy.data.objects.new('WeatheringHeadAnchor', None)
    scene.collection.objects.link(anchor)
    anchor.matrix_world = head.matrix_world.copy()
    collarCenter = body.matrix_world @ Vector((0, 0, .95))
    targets = [('Part_ErYa_Body', ['Cloth']), ('Part_ErYa_Foot_L', ['Cloth']),
               ('Part_ErYa_Hand_L', ['Hand']), ('Part_ErYa_HeadBald', ['Head', None, 'Head'])]
    outputTextures = {}
    for objectName, roles in targets:
        obj = bpy.data.objects[objectName]
        states = []
        for index, role in enumerate(roles):
            original = obj.data.materials[index]
            material = original.copy()
            material.name = original.name + '_Weathered'
            obj.data.materials[index] = material
            nodes, links = material.node_tree.nodes, material.node_tree.links
            oldNodes = set(nodes)
            output = next(node for node in nodes if node.type == 'OUTPUT_MATERIAL')
            oldSurface = output.inputs['Surface'].links[0].from_socket
            shader = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
            baseNode = shader.inputs['Base Color'].links[0].from_node
            sourceImage = baseNode.image
            width, height = sourceImage.size[:]
            suffix = obj.name.removeprefix('Part_ErYa_') + ('_NeckSkin' if index == 2 else '')
            image = bpy.data.images.new('Texture_ErYa_Weathered_' + suffix, width=width if role else 32,
                                       height=height if role else 32)
            image.colorspace_settings.name = sourceImage.colorspace_settings.name
            if role:
                color = BuildWeatherColor(material, role, masks['Cloth' if role == 'Cloth' else 'Skin'],
                                          anchor, collarCenter)
                emission = nodes.new('ShaderNodeEmission')
                links.new(color, emission.inputs['Color'])
                links.new(emission.outputs[0], output.inputs['Surface'])
            target = nodes.new('ShaderNodeTexImage')
            target.image = image
            for node in nodes:
                node.select = False
            target.select = True
            nodes.active = target
            states.append((material, oldNodes, output, oldSurface, baseNode, image, role))
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = 4
        bpy.ops.object.bake(type='EMIT', margin=16, use_clear=True, use_selected_to_active=False)
        for material, oldNodes, output, oldSurface, baseNode, image, role in states:
            nodes, links = material.node_tree.nodes, material.node_tree.links
            for node in list(nodes):
                if node not in oldNodes:
                    nodes.remove(node)
            links.new(oldSurface, output.inputs['Surface'])
            if role:
                pixels = np.array(image.pixels[:], dtype=np.float32).reshape(-1, 4)
                pixels[:, 3] = 1
                image.pixels.foreach_set(pixels.ravel())
                image.update()
                image.file_format = 'PNG'
                image.filepath_raw = str(projectRoot / 'Textures' / (image.name + '.png'))
                image.save()
                image.pack()
                baseNode.image = image
                outputTextures[material.name] = {'path':image.filepath_raw,'size':list(image.size)}
        if objectName.endswith('Foot_L'):
            bpy.data.objects['Part_ErYa_Foot_R'].data.materials[0] = obj.data.materials[0]
        if objectName.endswith('Hand_L'):
            bpy.data.objects['Part_ErYa_Hand_R'].data.materials[0] = obj.data.materials[0]
        print('Weathered color baked:', objectName, flush=True)
    bpy.data.objects.remove(anchor, do_unlink=True)
    for obj in parts:
        assert GeometrySignature(obj) == signatures[obj.name], 'Accepted geometry or UVs changed'
    scene.cycles.samples = 32
    scene['BlenderMcpTask'] = 'ErYaWeathered_20261114'
    scene['AppearanceVariant'] = 'API max-quality grime layers baked over original color details'
    bpy.data.orphans_purge(do_recursive=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(projectRoot / 'Scene_ErYa_Weathered.blend'), compress=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.export_scene.gltf(filepath=str(outputRoot / 'Model_ErYa_Weathered.glb'),
                              export_format='GLB', use_selection=True, export_apply=True)
    report = {'schema':'tengxian.weatheredVariant','version':1,'geometrySignatures':signatures,
              'colorTextures':outputTextures,'sourceImages':{role:str(path) for role,path in maskPaths.items()},
              'meshParts':len(parts),'baseColorOnly':True}
    (projectRoot / 'Data_WeatheringBake_V1.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))


with bpy.context.temp_override(window=window, scene=scene, view_layer=scene.view_layers[0]):
    BakeWeathered(scene)
