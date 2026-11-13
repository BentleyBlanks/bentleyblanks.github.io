"""Bake aged steel and dark open-grain timber for the user's photo references."""
import bpy
import json
import os
import sys
import math
import shutil
import importlib
import struct
import hashlib
from pathlib import Path
from mathutils import Vector

root = Path(os.environ["HANYANG_PROJECT_ROOT"])
revision = Path(r"C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R/ReferenceMaterials_20261113")
out = revision / "Bake"
out.mkdir(parents=True, exist_ok=True)
checkpoint = revision / "Model_HanYang173R_Before.glb"
if not checkpoint.exists():
    shutil.copy2(root / "Model/HanYang173R/Model_HanYang173R.glb", checkpoint)
    shutil.copy2(root / "Model/HanYang173R/Data_GameGeometry.json", revision / "Data_GameGeometry_Before.json")
gainFile = revision / "Data_RuntimeGains.json"
if not gainFile.exists():
    shutil.copy2(root.parent / "tmp/HanYangSurfaceRepair/ReferenceMatch/Data_RuntimeGains.json", gainFile)
gains = json.loads(gainFile.read_text(encoding="utf8"))
library = revision / 'Library'
library.mkdir(exist_ok=True)
sourceFiles = ['Texture_HanYangReferenceWoodBase_Source.png', 'Texture_HanYangReferenceSteelBase_Source.png']
for name in sourceFiles:
    if not (library / name).exists():
        shutil.copy2(root.parent / 'tmp/HanYangSurfaceRepair/ReferenceMatch/Library' / name, library / name)
sys.path.insert(0, str(root / "_blender"))
import Script_HanYang173RPbrBake as pbrBake
importlib.reload(pbrBake)

scene = bpy.context.scene
assert scene.get("BlenderMcpTask") == "HanYangSurfaceRepair"
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(checkpoint), merge_vertices=True)
game = {obj.name: obj for obj in scene.objects if obj.type == "MESH"}


def Map(tree, source, start, end, low, high):
    node = tree.nodes.new("ShaderNodeMapRange")
    node.inputs["From Min"].default_value = start
    node.inputs["From Max"].default_value = end
    node.inputs["To Min"].default_value = low
    node.inputs["To Max"].default_value = high
    node.clamp = True
    tree.links.new(source, node.inputs["Value"])
    return node.outputs[0]


def Math(tree, operation, first, second):
    node = tree.nodes.new("ShaderNodeMath")
    node.operation = operation
    for index, value in enumerate([first, second]):
        if isinstance(value, (int, float)):
            node.inputs[index].default_value = value
        else:
            tree.links.new(value, node.inputs[index])
    return node.outputs[0]


def CalibratedBase(tree, source, principled, name):
    divide = tree.nodes.new("ShaderNodeVectorMath")
    divide.operation = "DIVIDE"
    tree.links.new(source, divide.inputs[0])
    divide.inputs[1].default_value = gains[name]
    tree.links.new(divide.outputs[0], principled.inputs["Base Color"])


def NewMaterial(name):
    material = bpy.data.materials.new("ReferenceFinish_" + name)
    material.use_nodes = True
    tree = material.node_tree
    geometry = tree.nodes.new("ShaderNodeNewGeometry")
    return material, tree, tree.nodes.get("Principled BSDF"), geometry


def ImageNode(tree, filename, coordinates, color=False):
    node = tree.nodes.new('ShaderNodeTexImage')
    node.image = bpy.data.images.load(str(library / filename), check_existing=True)
    node.image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    node.image.pack()
    node.extension = 'REPEAT'
    tree.links.new(coordinates, node.inputs['Vector'])
    return node


def ProjectedColor(tree, geometry, filename, period):
    position = tree.nodes.new('ShaderNodeSeparateXYZ')
    normal = tree.nodes.new('ShaderNodeSeparateXYZ')
    tree.links.new(geometry.outputs['Position'], position.inputs[0])
    tree.links.new(geometry.outputs['Normal'], normal.inputs[0])
    colors = []
    for first, second in [('Y', 'Z'), ('Y', 'X'), ('X', 'Z')]:
        coordinates = tree.nodes.new('ShaderNodeCombineXYZ')
        tree.links.new(Math(tree, 'DIVIDE', position.outputs[first], period), coordinates.inputs['X'])
        tree.links.new(Math(tree, 'DIVIDE', position.outputs[second], period), coordinates.inputs['Y'])
        colors.append(ImageNode(tree, filename, coordinates.outputs[0], color=True).outputs['Color'])
    weights = [Math(tree, 'POWER', Math(tree, 'ABSOLUTE', normal.outputs[axis], 0), 4) for axis in ['X', 'Z', 'Y']]
    sideSum = Math(tree, 'ADD', Math(tree, 'ADD', weights[0], weights[1]), .00001)
    top = Math(tree, 'DIVIDE', weights[1], sideSum)
    firstMix = tree.nodes.new('ShaderNodeMixRGB')
    tree.links.new(top, firstMix.inputs[0])
    tree.links.new(colors[0], firstMix.inputs[1])
    tree.links.new(colors[1], firstMix.inputs[2])
    end = Math(tree, 'DIVIDE', weights[2], Math(tree, 'ADD', sideSum, weights[2]))
    finalMix = tree.nodes.new('ShaderNodeMixRGB')
    tree.links.new(end, finalMix.inputs[0])
    tree.links.new(firstMix.outputs[0], finalMix.inputs[1])
    tree.links.new(colors[2], finalMix.inputs[2])
    return finalMix.outputs[0]


bareParts = {"HandledCylinder", "HandleRoot", "HandleNeck", "HandleSphere", "RearCockingExterior",
    "RearSmallCover", "RearSmallPin", "RearTab", "RearTopExternalLever", "MiddleSideDisk", "SideWoodButton"}


woodParts = {"MainWood_ContinuousLowerShoulder", "UpperWood_Rebuilt_ShortRearShoulder_ContinuousFront", "FrontWood_ContinuousOval"}


def ReferenceSurface(name, wood):
    material, tree, principled, geometry = NewMaterial(name)
    filename = 'Texture_HanYangReferenceWoodBase_Source.png' if wood else 'Texture_HanYangReferenceSteelBase_Source.png'
    image = ProjectedColor(tree, geometry, filename, .06 if wood else .04)
    luminance = tree.nodes.new('ShaderNodeRGBToBW')
    tree.links.new(image, luminance.inputs[0])
    worn = name in bareParts or 'Band' in name
    factor = .65 if wood else 1.6 if 'Band' in name else 1.35 if worn else .85
    color = tree.nodes.new('ShaderNodeVectorMath')
    color.operation = 'SCALE'
    color.inputs['Scale'].default_value = factor
    tree.links.new(image, color.inputs[0])
    CalibratedBase(tree, color.outputs[0], principled, name)
    if wood:
        roughness = Map(tree, luminance.outputs[0], .012, .16, .65, .42)
        principled.inputs['Metallic'].default_value = 0
    else:
        roughness = Map(tree, luminance.outputs[0], .025, .25, .67 if worn else .72, .40 if worn else .46)
        tree.links.new(Map(tree, luminance.outputs[0], .02, .22, .88, 1), principled.inputs['Metallic'])
    tree.links.new(roughness, principled.inputs['Roughness'])
    bump = tree.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .30 if wood else .25
    bump.inputs['Distance'].default_value = .00015 if wood else .000032
    height = Map(tree, luminance.outputs[0], .012 if wood else .025, .16 if wood else .25, 0, 1)
    tree.links.new(height, bump.inputs['Height'])
    tree.links.new(bump.outputs[0], principled.inputs['Normal'])
    return material

raw = checkpoint.read_bytes()
jsonLength = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20 + jsonLength])
binary = raw[28 + jsonLength:]
sizes = {}
for node in doc['nodes']:
    if 'mesh' not in node:
        continue
    primitive = doc['meshes'][node['mesh']]['primitives'][0]
    material = doc['materials'][primitive['material']]
    image = doc['images'][doc['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]
    view = doc['bufferViews'][image['bufferView']]
    start = view.get('byteOffset', 0)
    width, height = struct.unpack_from('>II', binary, start + 16)
    sizes[node['name']] = max(512, min(2048, max(width, height)))
sizes['MainWood_ContinuousLowerShoulder'] = 4096
sizes['UpperWood_Rebuilt_ShortRearShoulder_ContinuousFront'] = 2048
sizes['FrontWood_ContinuousOval'] = 2048
bandParts = ['FrontBand_ContinuousEnvelopeContact', 'RearBand_ControlledCrown']
for name in bandParts:
    sizes[name] = 2048
sources = {}
for name, obj in game.items():
    material = ReferenceSurface(name, name in woodParts)
    obj.data.materials.clear()
    obj.data.materials.append(material)
    source = obj.copy()
    source.data = obj.data.copy()
    source.name = name + '__MaterialSource'
    source.hide_render = True
    scene.collection.objects.link(source)
    sources[name] = source
requested = [name for name in os.environ.get('HANYANG_MATERIAL_PARTS', '').split(',') if name]
selected = {name: sizes[name] for name in requested} if requested else sizes
previous = json.loads((out / 'Data_RebakeReport.json').read_text()) if (out / 'Data_RebakeReport.json').exists() else []
selectedWood = [name for name in selected if name in woodParts]
selectedMetal = {name: size for name, size in selected.items() if name not in woodParts}
mapRoles = tuple(filter(None, os.environ.get('HANYANG_MATERIAL_MAPS', 'BaseColor,ORM,Normal').split(',')))
assert mapRoles and set(mapRoles) <= {'BaseColor', 'ORM', 'Normal'}
report = pbrBake.BakeParts(scene, game, sources, selectedMetal, out, bandParts, mapRoles)
if selectedWood:
    tileMesh = bpy.data.meshes.new('WoodReferenceTile')
    tileMesh.from_pydata([(0, 0, 0), (0, .06, 0), (0, .06, .06), (0, 0, .06)], [], [(0, 1, 2, 3)])
    tileMesh.update()
    uv = tileMesh.uv_layers.new(name='UVMap')
    uv.active_render = True
    for loop, coordinate in zip(uv.data, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        loop.uv = coordinate
    tile = bpy.data.objects.new('WoodTile', tileMesh)
    scene.collection.objects.link(tile)
    tile.data.materials.append(ReferenceSurface('MainWood_ContinuousLowerShoulder', True))
    tileSource = tile.copy()
    tileSource.data = tile.data.copy()
    tileSource.name = 'WoodTileSource'
    scene.collection.objects.link(tileSource)
    pbrBake.BakeParts(scene, {'WoodTile': tile}, {'WoodTile': tileSource}, {'WoodTile': 2048}, out, [], mapRoles)
    for name in selectedWood:
        target = game[name]
        mesh = target.data
        while mesh.uv_layers:
            mesh.uv_layers.remove(mesh.uv_layers[0])
        uv = mesh.uv_layers.new(name='UVMap')
        uv.active_render = True
        center = -.015 if name.startswith('MainWood') else .03
        normalMatrix = target.matrix_world.to_3x3().inverted().transposed()
        for polygon in mesh.polygons:
            normal = (normalMatrix @ polygon.normal).normalized()
            points = [target.matrix_world @ mesh.vertices[mesh.loops[index].vertex_index].co for index in polygon.loop_indices]
            angles = [math.atan2(point.x, point.z - center) for point in points]
            if max(angles) - min(angles) > math.pi:
                angles = [angle + 2 * math.pi if angle < 0 else angle for angle in angles]
            for index, point, angle in zip(polygon.loop_indices, points, angles):
                uv.data[index].uv = (point.x / .06, point.z / .06) if abs(normal.y) > .75 else (point.y / .06, angle * .025 / .06)
        for obj in scene.objects:
            obj.select_set(False)
        target.select_set(True)
        bpy.context.view_layer.objects.active = target
        bpy.ops.export_scene.gltf(filepath=str(out / (name + '.glb')), export_format='GLB', use_selection=True,
            export_yup=True, export_texcoords=True, export_normals=True, export_tangents=True, export_materials='NONE', export_extras=False)
        for role in ['BaseColor', 'Normal', 'ORM']:
            shutil.copy2(out / ('WoodTile_' + role + '.png'), out / (name + '_' + role + '.png'))
        mesh.calc_loop_triangles()
        report.append({'part': name, 'res': 2048, 'triangles': len(mesh.loop_triangles), 'tiledUv': True,
            'tileMeters': .06, 'unwrap': {'coverage': 1, 'pxPerMm': 2048 / 60}})
        target.select_set(False)
    bpy.data.objects.remove(tile, do_unlink=True)
    bpy.data.objects.remove(tileSource, do_unlink=True)
records = {row['part']: row for row in previous}
records.update({row['part']: row for row in report})
report = list(records.values())
(out / 'Data_RebakeReport.json').write_text(json.dumps(report, indent=2), encoding='utf8')
metadata = {'version': '173R-20261113R2', 'woodParts': sorted(woodParts),
    'metalParts': sorted(set(game) - woodParts), 'geometry': '64266-triangle mechanism revision',
    'scope': 'Aged steel oxide, small pits, worn highlights and dark longitudinal timber grain reconstructed from the user reference photographs.',
    'references': ['134e0324-2902-4c60-81e5-1d17b844824a/image-1.png', '134e0324-2902-4c60-81e5-1d17b844824a/image-2.png'],
    'sourceAssets': [{'file': filename, 'generator': 'built-in imagegen', 'tier': 1,
        'sha256': hashlib.sha256((library / filename).read_bytes()).hexdigest()} for filename in sourceFiles]}
(revision / 'Data_MaterialMatch.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf8')
for name, target in game.items():
    if not (out / (name + '_BaseColor.png')).exists():
        continue
    material = bpy.data.materials.new('BakedReference_' + name)
    material.use_nodes = True
    tree = material.node_tree
    principled = tree.nodes.get('Principled BSDF')
    for role in ['BaseColor', 'Normal', 'ORM']:
        texture = tree.nodes.new('ShaderNodeTexImage')
        texture.image = bpy.data.images.load(str(out / (name + '_' + role + '.png')), check_existing=True)
        texture.image.colorspace_settings.name = 'sRGB' if role == 'BaseColor' else 'Non-Color'
        texture.image.pack()
        texture.extension = 'REPEAT' if name in woodParts else 'EXTEND'
        if role == 'BaseColor':
            multiply = tree.nodes.new('ShaderNodeVectorMath')
            multiply.operation = 'MULTIPLY'
            multiply.inputs[1].default_value = gains[name]
            tree.links.new(texture.outputs['Color'], multiply.inputs[0])
            tree.links.new(multiply.outputs[0], principled.inputs['Base Color'])
        elif role == 'Normal':
            normal = tree.nodes.new('ShaderNodeNormalMap')
            tree.links.new(texture.outputs['Color'], normal.inputs['Color'])
            tree.links.new(normal.outputs[0], principled.inputs['Normal'])
        else:
            channels = tree.nodes.new('ShaderNodeSeparateColor')
            tree.links.new(texture.outputs['Color'], channels.inputs[0])
            tree.links.new(channels.outputs['Green'], principled.inputs['Roughness'])
            tree.links.new(channels.outputs['Blue'], principled.inputs['Metallic'])
    target.data.materials.clear()
    target.data.materials.append(material)
for source in sources.values():
    source.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(revision / 'Scene_HanYangReferenceMaterials.blend'), compress=True)
print('REFERENCE_MATERIALS_DONE', flush=True)
