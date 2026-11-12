"""Repair the 173R close-up surfaces through the managed BlenderMCP instance.

HANYANG_PROJECT_ROOT selects the project's owned worktree. The first run archives
the input GLB outside Git. Repeated runs rebuild from that immutable checkpoint.
Assemble Bake/ with Script_HanYang173RRebakeAssemble.py after this script finishes.
"""
import json
import math
import os
import shutil
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

root = Path(os.environ["HANYANG_PROJECT_ROOT"])
sourceRoot = Path(r"C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R")
author = sourceRoot / "DotsDelivery/HanYang_173R_Editable_Source/Source_173R_WristTailExterior_Author_WIP.blend"
revision = sourceRoot / "SurfaceRepair_20261112"
out = revision / "Bake"
out.mkdir(parents=True, exist_ok=True)
checkpoint = revision / "Model_HanYang173R_Before.glb"
if not checkpoint.exists():
    shutil.copy2(root / "Model/HanYang173R/Model_HanYang173R.glb", checkpoint)
    shutil.copy2(root / "Model/HanYang173R/Data_GameGeometry.json", revision / "Data_GameGeometry_Before.json")
sys.path.insert(0, str(root / "_blender"))
from Script_HanYang173RPbrBake import BakeParts, SmoothNormals

scene = bpy.context.scene
assert scene.get("BlenderMcpTask") == "HanYangSurfaceRepair", "Select this task's managed Blender instance"
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(checkpoint), merge_vertices=True)
game = {obj.name: obj for obj in bpy.context.selected_objects if obj.type == "MESH"}
woodNames = ["MainWood_ContinuousLowerShoulder", "UpperWood_Rebuilt_ShortRearShoulder_ContinuousFront"]
with bpy.data.libraries.load(str(sourceRoot / "Game60k/Scene_HanYang173RGame60k.blend"), link=False) as (available, loaded):
    loaded.objects = list(woodNames)
for name, obj in zip(woodNames, loaded.objects):
    bpy.data.objects.remove(game[name], do_unlink=True)
    obj.name = name
    scene.collection.objects.link(obj)
    obj.hide_render = False
    obj.hide_set(False)
    game[name] = obj
with bpy.data.libraries.load(str(author), link=False) as (available, loaded):
    loaded.objects = available.objects
sources = {}
for obj in loaded.objects:
    if obj and obj.type == "MESH":
        name = obj.name.removesuffix(".001")
        obj.name = name + "__Author"
        sources[name] = obj
        scene.collection.objects.link(obj)
        obj.hide_render = True

# Recover the complete curved cocking cover. The sliced wooden meshes are
# replaced by their clean reduced source, making room within the 69k budget.
name = "RearOuterCover_RoundedSideReturn"
bpy.data.objects.remove(game[name], do_unlink=True)
cover = sources[name].copy()
cover.data = sources[name].data.copy()
cover.name = name
scene.collection.objects.link(cover)
cover.hide_render = False
cover.hide_set(False)
game[name] = cover
bm = bmesh.new()
bm.from_mesh(cover.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=.0000001)
bm.to_mesh(cover.data)
bm.free()




def ClearBore(obj):
    """Keep the inlet and left receiver rail outside the measured bolt cylinder."""
    inverse = obj.matrix_world.inverted()
    moved = 0
    maximum = 0
    for vertex in obj.data.vertices:
        point = obj.matrix_world @ vertex.co
        if not .131 < point.y < .231 or point.z < .024:
            continue
        radial = math.hypot(point.x, point.z - .04194)
        if radial < .00935 and abs(point.x) > .006:
            previous = point.copy()
            point.x = math.copysign(math.sqrt(.00935 ** 2 - (point.z - .04194) ** 2), point.x)
            vertex.co = inverse @ point
            moved += 1
            maximum = max(maximum, (point - previous).length)
    return {"movedVertices": moved, "maximumDisplacementMm": maximum * 1000}


def FitBand():
    # The band bridges the upper/lower handguard transition. Fit its two ends to
    # the actual timber and barrel envelope, retaining 1.1 mm steel thickness.
    vertices = []
    faces = []
    for name in ["MainWood_ContinuousLowerShoulder", "UpperWood_Rebuilt_ShortRearShoulder_ContinuousFront", "FrontWood_ContinuousOval", "LongOuterSteel_TrueRound"]:
        obj = sources[name]
        offset = len(vertices)
        vertices.extend(obj.matrix_world @ vertex.co for vertex in obj.data.vertices)
        faces.extend(tuple(offset + index for index in face.vertices) for face in obj.data.polygons)
    tree = BVHTree.FromPolygons(vertices, faces)

    def Radius(angle, along):
        direction = Vector((math.cos(angle), 0, math.sin(angle)))
        center = Vector((0, along, .0324))
        hit = tree.ray_cast(center + direction * .06, -direction, .065)[0]
        return max(.0005, (hit - center).dot(direction)) if hit else .009

    displacement = 0
    for obj in [game["RearBand_ControlledCrown"], sources["RearBand_ControlledCrown"]]:
        inverse = obj.matrix_world.inverted()
        for vertex in obj.data.vertices:
            point = obj.matrix_world @ vertex.co
            angle = math.atan2(point.z - .0324, point.x)
            oldRadius = math.hypot(point.x, point.z - .0324)
            outer = 1 / math.sqrt((math.cos(angle) / .0164) ** 2 + (math.sin(angle) / .0213) ** 2)
            depth = min(.0012, max(0, outer - oldRadius))
            weight = min(1, max(0, (point.y - .578) / .014))
            radius = Radius(angle, .5777) * (1 - weight) + Radius(angle, .5921) * weight + .00122 - depth
            previous = point.copy()
            point.x = math.cos(angle) * radius
            point.z = .0324 + math.sin(angle) * radius
            vertex.co = inverse @ point
            displacement = max(displacement, (point - previous).length)
    return {"maximumDisplacementMm": displacement * 1000, "steelThicknessMm": 1.1}


def DetailMaterial(material, wood=False, endGrain=False):
    """Retain the source colour film and restore submillimetre PBR variation."""
    material = material.copy()
    tree = material.node_tree
    nodes = tree.nodes
    principled = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    geometry = nodes.new("ShaderNodeNewGeometry")
    scale = nodes.new("ShaderNodeVectorMath")
    scale.operation = "MULTIPLY"
    scale.inputs[1].default_value = (2800, 180, 2800) if wood else (6000, 6000, 6000)
    tree.links.new(geometry.outputs["Position"], scale.inputs[0])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 1
    noise.inputs["Detail"].default_value = 2
    tree.links.new(scale.outputs[0], noise.inputs["Vector"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = .32 if wood else .22
    bump.inputs["Distance"].default_value = .000035 if wood else .000009
    tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    normal = principled.inputs["Normal"]
    if normal.is_linked:
        tree.links.new(normal.links[0].from_socket, bump.inputs["Normal"])
    tree.links.new(bump.outputs["Normal"], normal)
    rough = principled.inputs["Roughness"]
    existing = rough.links[0].from_socket if rough.is_linked else None
    variation = nodes.new("ShaderNodeMapRange")
    variation.inputs["To Min"].default_value = -.045
    variation.inputs["To Max"].default_value = .045
    tree.links.new(noise.outputs["Fac"], variation.inputs["Value"])
    addition = nodes.new("ShaderNodeMath")
    addition.operation = "ADD"
    addition.inputs[0].default_value = rough.default_value
    if existing:
        tree.links.new(existing, addition.inputs[0])
    tree.links.new(variation.outputs[0], addition.inputs[1])
    bounded = nodes.new("ShaderNodeClamp")
    bounded.inputs["Min"].default_value = .28 if wood else .30
    bounded.inputs["Max"].default_value = .86
    tree.links.new(addition.outputs[0], bounded.inputs["Value"])
    tree.links.new(bounded.outputs[0], rough)
    if endGrain:
        # The old shoulder sampled one column of an axial film on its end wall.
        # Give that transverse face its own planar coordinates and geometric normal.
        xyz = nodes.new("ShaderNodeSeparateXYZ")
        tree.links.new(geometry.outputs["Position"], xyz.inputs[0])
        planar = nodes.new("ShaderNodeCombineXYZ")
        for axis, size, offset in [("X", .034, .5), ("Z", .064, 0)]:
            mapping = nodes.new("ShaderNodeMath")
            mapping.operation = "MULTIPLY_ADD"
            mapping.inputs[1].default_value = 1 / size
            mapping.inputs[2].default_value = offset
            tree.links.new(xyz.outputs[axis], mapping.inputs[0])
            tree.links.new(mapping.outputs[0], planar.inputs["X" if axis == "X" else "Y"])
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = bpy.data.images["HY144B_CompleteSourceBaseR_FLOAT32.exr"]
        texture.extension = "REPEAT"
        tree.links.new(planar.outputs[0], texture.inputs["Vector"])
        normalAxis = nodes.new("ShaderNodeSeparateXYZ")
        tree.links.new(geometry.outputs["True Normal"], normalAxis.inputs[0])
        absolute = nodes.new("ShaderNodeMath")
        absolute.operation = "ABSOLUTE"
        tree.links.new(normalAxis.outputs["Y"], absolute.inputs[0])
        mask = nodes.new("ShaderNodeMath")
        mask.operation = "GREATER_THAN"
        mask.inputs[1].default_value = .70
        tree.links.new(absolute.outputs[0], mask.inputs[0])
        base = principled.inputs["Base Color"]
        mix = nodes.new("ShaderNodeMixRGB")
        tree.links.new(base.links[0].from_socket, mix.inputs[1])
        tree.links.new(texture.outputs["Color"], mix.inputs[2])
        tree.links.new(mask.outputs[0], mix.inputs[0])
        tree.links.new(mix.outputs[0], base)
        cleanNormal = nodes.new("ShaderNodeMixRGB")
        tree.links.new(bump.outputs["Normal"], cleanNormal.inputs[1])
        tree.links.new(geometry.outputs["Normal"], cleanNormal.inputs[2])
        tree.links.new(mask.outputs[0], cleanNormal.inputs[0])
        tree.links.new(cleanNormal.outputs[0], normal)
    return material


def ProjectSteel(name, imageName, targetLuminance, start, end, width):
    """Map the author's paired steel film around the body and across its ends."""
    import numpy as np
    image = bpy.data.images[imageName]
    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    mean = float((pixels.reshape(-1, 4)[:, :3] @ np.array([.2126, .7152, .0722])).mean())
    assert mean > 0
    material = bpy.data.materials.new("ProjectedSteel_" + name)
    material.use_nodes = True
    tree = material.node_tree
    nodes = tree.nodes
    principled = nodes.get("Principled BSDF")
    principled.inputs["Metallic"].default_value = 1
    geometry = nodes.new("ShaderNodeNewGeometry")
    xyz = nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(geometry.outputs["Position"], xyz.inputs[0])

    def Remap(socket, scale, offset):
        node = nodes.new("ShaderNodeMath")
        node.operation = "MULTIPLY_ADD"
        node.inputs[1].default_value = scale
        node.inputs[2].default_value = offset
        tree.links.new(socket, node.inputs[0])
        return node.outputs[0]

    angle = nodes.new("ShaderNodeMath")
    angle.operation = "ARCTAN2"
    tree.links.new(xyz.outputs["X"], angle.inputs[0])
    tree.links.new(Remap(xyz.outputs["Z"], 1, -.04194), angle.inputs[1])
    cylinder = nodes.new("ShaderNodeCombineXYZ")
    tree.links.new(Remap(xyz.outputs["Y"], 1 / (end - start), -start / (end - start)), cylinder.inputs["X"])
    tree.links.new(Remap(angle.outputs[0], 1 / (2 * math.pi), .5), cylinder.inputs["Y"])
    planar = nodes.new("ShaderNodeCombineXYZ")
    tree.links.new(Remap(xyz.outputs["X"], 1 / width, .5), planar.inputs["X"])
    tree.links.new(Remap(xyz.outputs["Z"], 1 / width, .5 - .04194 / width), planar.inputs["Y"])
    normalAxis = nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(geometry.outputs["True Normal"], normalAxis.inputs[0])
    absolute = nodes.new("ShaderNodeMath")
    absolute.operation = "ABSOLUTE"
    tree.links.new(normalAxis.outputs["Y"], absolute.inputs[0])
    mask = nodes.new("ShaderNodeMath")
    mask.operation = "GREATER_THAN"
    mask.inputs[1].default_value = .7
    tree.links.new(absolute.outputs[0], mask.inputs[0])
    mapping = nodes.new("ShaderNodeMixRGB")
    tree.links.new(mask.outputs[0], mapping.inputs[0])
    tree.links.new(cylinder.outputs[0], mapping.inputs[1])
    tree.links.new(planar.outputs[0], mapping.inputs[2])
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.extension = "REPEAT"
    tree.links.new(mapping.outputs[0], texture.inputs["Vector"])
    gain = nodes.new("ShaderNodeVectorMath")
    gain.operation = "SCALE"
    gain.inputs["Scale"].default_value = targetLuminance / mean
    tree.links.new(texture.outputs["Color"], gain.inputs[0])
    tree.links.new(gain.outputs[0], principled.inputs["Base Color"])
    scale = nodes.new("ShaderNodeVectorMath")
    scale.operation = "SCALE"
    scale.inputs["Scale"].default_value = 6000
    tree.links.new(geometry.outputs["Position"], scale.inputs[0])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 1
    noise.inputs["Detail"].default_value = 2
    tree.links.new(scale.outputs[0], noise.inputs["Vector"])
    rough = nodes.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = .34
    rough.inputs["To Max"].default_value = .56
    tree.links.new(noise.outputs["Fac"], rough.inputs["Value"])
    tree.links.new(rough.outputs[0], principled.inputs["Roughness"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = .3
    bump.inputs["Distance"].default_value = .000009
    tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    tree.links.new(bump.outputs[0], principled.inputs["Normal"])
    return material


parts = {
    "RearBand_ControlledCrown": 1024,
    "ReceiverOuterCollar": 2048,
    "RearOuterCover_RoundedSideReturn": 2048,
    "Sight_LowCrossPiece": 1024,
    "Sight_LowContinuousLeaf_NoUnknownNumbers": 1024,
    "MainWood_ContinuousLowerShoulder": 4096,
    "UpperWood_Rebuilt_ShortRearShoulder_ContinuousFront": 2048,
}
repairs = {"band": FitBand(), "bore": {}}
for name in ["MainWood_ContinuousLowerShoulder", "ReceiverOuterCollar"]:
    repairs["bore"][name] = ClearBore(game[name])
for name in parts:
    if name == "RearBand_ControlledCrown":
        SmoothNormals(game[name])
        SmoothNormals(sources[name])
    source = sources[name]
    if name in ["ReceiverOuterCollar", "RearOuterCover_RoundedSideReturn"]:
        collar = name == "ReceiverOuterCollar"
        material = ProjectSteel(name,
            "HY148_RaisedShellArtistColorR_FLOAT32.exr" if collar else "HY138_IndependentCoverArtistColorR_FLOAT32.exr",
            .031 if collar else .0316, .12 if collar else .06903, .267 if collar else .15048, .032 if collar else .02614)
        for index in range(len(source.data.materials)):
            source.data.materials[index] = material
    else:
        for index, material in enumerate(list(source.data.materials)):
            source.data.materials[index] = DetailMaterial(material, wood="Wood" in name,
                endGrain=name.startswith("UpperWood"))

report = BakeParts(scene, game, sources, parts, out, ["RearBand_ControlledCrown", "RearOuterCover_RoundedSideReturn", *woodNames])
(out / "Data_RebakeReport.json").write_text(json.dumps(report, indent=2), encoding="utf8")
(revision / "Data_SurfaceRepair.json").write_text(json.dumps(repairs, indent=2), encoding="utf8")
bpy.ops.wm.save_as_mainfile(filepath=str(revision / "Scene_HanYangSurfaceRepair.blend"), compress=True)
print("SURFACE_REPAIR_DONE", json.dumps(repairs), flush=True)

# Source-surface measurements are independent of the material bake.
import hashlib

revision = Path(r"C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R/SurfaceRepair_20261112")
author = revision.parent / "DotsDelivery/HanYang_173R_Editable_Source/Source_173R_WristTailExterior_Author_WIP.blend"
measurements = json.loads((revision / "Data_SurfaceRepair.json").read_text(encoding="utf8"))
measurements["version"] = "173R-20261112"
measurements["sourceBlendSha256"] = hashlib.sha256(author.read_bytes()).hexdigest()
measurements["inputGameSha256"] = hashlib.sha256((revision / "Model_HanYang173R_Before.glb").read_bytes()).hexdigest()
measurements["sourceSurfaceErrors"] = {}
with bpy.data.libraries.load(str(author), link=False) as (available, loaded):
    loaded.objects = ["RearBand_ControlledCrown"]
originalBand = loaded.objects[0]
for row in json.loads((revision / "Bake/Data_RebakeReport.json").read_text()):
    name = row["part"]
    current = bpy.data.objects[name]
    original = originalBand if name == "RearBand_ControlledCrown" else bpy.data.objects[name + "__Author"]
    currentTree = BVHTree.FromPolygons([current.matrix_world @ vertex.co for vertex in current.data.vertices],
        [tuple(face.vertices) for face in current.data.polygons])
    originalTree = BVHTree.FromPolygons([original.matrix_world @ vertex.co for vertex in original.data.vertices],
        [tuple(face.vertices) for face in original.data.polygons])
    forward = max(originalTree.find_nearest(current.matrix_world @ vertex.co)[3] for vertex in current.data.vertices)
    backward = max(currentTree.find_nearest(original.matrix_world @ vertex.co)[3] for vertex in original.data.vertices)
    measurements["sourceSurfaceErrors"][name] = {"gameToSourceMaxM": forward, "sourceToGameMaxM": backward}
bpy.data.objects.remove(originalBand, do_unlink=True)
measurements["reconstructionScope"] = "The band fit, bore clearance, end-grain projection and microscopic surface response are artistic reconstruction. Reference photographs guide visible shape only."
measurements["historicalReferences"] = [{
    "url": "https://www.icollector.com/Chinese-Hanyang-Mauser-Bolt-Action-Rifle_i13828566",
    "note": "Viewed the auction's original photographs 3, 4 and 5. They show the curved receiver front ring, longitudinal bolt raceway, timber inlet, safety and cocking assembly. The game's finish and dimensions are artistic reconstruction."
}]
(revision / "Data_SurfaceRepair.json").write_text(json.dumps(measurements, indent=2) + "\n", encoding="utf8")
print("SURFACE_MEASUREMENTS_DONE", json.dumps(measurements["sourceSurfaceErrors"]), flush=True)

# Pack the rebaked surfaces for the editable source's own material preview.
for row in json.loads((revision / "Bake/Data_RebakeReport.json").read_text()):
    obj = bpy.data.objects[row["part"]]
    material = obj.data.materials[0]
    tree = material.node_tree
    principled = next(node for node in tree.nodes if node.type == "BSDF_PRINCIPLED")
    principled.inputs["Metallic"].default_value = 1
    principled.inputs["Roughness"].default_value = 1
    maps = {}
    for role in ["BaseColor", "ORM", "Normal"]:
        image = bpy.data.images.load(str(revision / "Bake" / f"{row['part']}_{role}.png"), check_existing=False)
        image.colorspace_settings.name = "sRGB" if role == "BaseColor" else "Non-Color"
        image.pack()
        node = tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        maps[role] = node
    tree.links.new(maps["BaseColor"].outputs["Color"], principled.inputs["Base Color"])
    orm = tree.nodes.new("ShaderNodeSeparateColor")
    tree.links.new(maps["ORM"].outputs["Color"], orm.inputs[0])
    tree.links.new(orm.outputs["Green"], principled.inputs["Roughness"])
    tree.links.new(orm.outputs["Blue"], principled.inputs["Metallic"])
    normal = tree.nodes.new("ShaderNodeNormalMap")
    tree.links.new(maps["Normal"].outputs["Color"], normal.inputs["Color"])
    tree.links.new(normal.outputs[0], principled.inputs["Normal"])
for obj in bpy.context.scene.objects:
    if obj.name.endswith("__Author"):
        obj.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(revision / "Scene_HanYangSurfaceRepair.blend"), compress=True)
