"""Rebuild the visible Hanyang cocking assembly and bake a satin steel finish.

Run in the owned HanYangSurfaceRepair BlenderMCP instance. Input and editable
source stay in OneDrive/AI/Models/Blender. Assemble Bake/ with the 173R assembler.
"""
import bpy
import bmesh
import json
import math
import os
import shutil
import sys
import importlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

root = Path(os.environ["HANYANG_PROJECT_ROOT"])
sourceRoot = Path(r"C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R")
revision = sourceRoot / "MechanismFinish_20261113"
out = revision / "Bake"
out.mkdir(parents=True, exist_ok=True)
checkpoint = revision / "Model_HanYang173R_Before.glb"
if not checkpoint.exists():
    shutil.copy2(root / "Model/HanYang173R/Model_HanYang173R.glb", checkpoint)
    shutil.copy2(root / "Model/HanYang173R/Data_GameGeometry.json", revision / "Data_GameGeometry_Before.json")
gainFile = revision / "Data_RuntimeGains.json"
if not gainFile.exists():
    shutil.copy2(root.parent / "tmp/HanYangSurfaceRepair/MechanismFinish/Data_RuntimeGains.json", gainFile)
gains = json.loads(gainFile.read_text(encoding="utf8"))
sys.path.insert(0, str(root / "_blender"))
import Script_HanYang173RPbrBake as pbrBake
importlib.reload(pbrBake)
from Script_HanYang173RPbrBake import BakeParts, SmoothNormals

scene = bpy.context.scene
assert scene.get("BlenderMcpTask") == "HanYangSurfaceRepair"
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(checkpoint), merge_vertices=True)
game = {obj.name: obj for obj in scene.objects if obj.type == "MESH"}


def ReplaceMesh(obj, vertices, faces):
    inverse = obj.matrix_world.inverted()
    mesh = bpy.data.meshes.new(obj.name + "_Rebuilt")
    mesh.from_pydata([inverse @ Vector(vertex) for vertex in vertices], [], faces)
    mesh.update()
    obj.data = mesh


def ExtrudeProfile(profile, axis, start, end):
    def Point(a, b, along):
        return (along, a, b) if axis == "X" else (a, along, b) if axis == "Y" else (a, b, along)
    count = len(profile)
    vertices = [Point(a, b, along) for along in [start, end] for a, b in profile]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, following + count, index + count))
    return vertices, faces


def Lathe(obj, profile, center, segments=48, axis="Y", radialScale=1):
    vertices = []
    rings = []
    for along, radius in profile:
        ring = []
        angles = [0] if abs(radius) < 1e-9 else range(segments)
        for index in angles:
            angle = 2 * math.pi * index / segments
            first, second = radius * math.cos(angle), radius * math.sin(angle) * radialScale
            point = (along, center[1] + first, center[2] + second) if axis == "X" else (center[0] + first, along, center[2] + second)
            ring.append(len(vertices))
            vertices.append(point)
        rings.append(ring)
    faces = []
    for first, second in zip(rings, rings[1:]):
        for index in range(segments):
            following = (index + 1) % segments
            if len(first) == 1:
                faces.append((first[0], second[following], second[index]))
            elif len(second) == 1:
                faces.append((first[index], first[following], second[0]))
            else:
                faces.append((first[index], first[following], second[following], second[index]))
    ReplaceMesh(obj, vertices, faces)


def Bevel(obj, width=.0002):
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new("MachinedEdge", "BEVEL")
    modifier.width = width
    modifier.segments = 2
    modifier.limit_method = "ANGLE"
    modifier.angle_limit = .7
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def RoundProfile(points):
    result = []
    for index, point in enumerate(points):
        before = Vector(points[(index - 1) % len(points)])
        first = Vector(point)
        second = Vector(points[(index + 1) % len(points)])
        after = Vector(points[(index + 2) % len(points)])
        for step in range(4):
            t = step / 4
            value = .5 * ((2 * first) + (-before + second) * t
                + (2 * before - 5 * first + 4 * second - after) * t * t
                + (-before + 3 * first - 3 * second + after) * t * t * t)
            result.append(tuple(value))
    return result


# The photographs show two protective cheeks around the cocking body.
profile = RoundProfile([(.067, .0353), (.067, .041), (.074, .0475), (.082, .053),
    (.088, .055), (.124, .055), (.130, .0532), (.1345, .047),
    (.1375, .040), (.1375, .0353)])
vertices = []
faces = []
for start, end in [(-.0111, -.01025), (.01025, .0111)]:
    points, polygons = ExtrudeProfile(profile, "X", start, end)
    offset = len(vertices)
    vertices.extend(points)
    faces.extend(tuple(offset + index for index in face) for face in polygons)
ReplaceMesh(game["RearOuterCover_RoundedSideReturn"], vertices, faces)
Bevel(game["RearOuterCover_RoundedSideReturn"], .00022)

Lathe(game["RearCockingExterior"], [(.0739, 0), (.0739, .006), (.076, .0085),
    (.118, .0085), (.121, .0088), (.149, .0088), (.153, .0078), (.153, 0)], (0, 0, .04194))
Lathe(game["RearSmallCover"], [(.0548, 0), (.0548, .007), (.0551, .0076),
    (.0562, .0076), (.0565, .0071), (.0565, .00565), (.078, .00565), (.078, 0)], (0, 0, .04194))
Lathe(game["RearSmallPin"], [(.0542, 0), (.0542, .00155), (.05445, .0019),
    (.05475, .0019), (.0549, .00165), (.0549, 0)], (0, 0, .04194), segments=32)

flag = [(.0028, .0524), (.0032, .0535), (.0012, .0550), (-.0035, .0552),
    (-.0110, .0573), (-.0155, .0572), (-.0178, .0562), (-.0180, .0548),
    (-.0167, .0535), (-.0115, .0529), (-.0050, .0531), (-.0015, .0524)]
ReplaceMesh(game["RearTab"], *ExtrudeProfile(flag, "Y", .0740, .0762))
Bevel(game["RearTab"], .00028)

topBar = [(-.0022, .082), (.0022, .082), (.0032, .084), (.0032, .132),
    (.002, .135), (-.002, .135), (-.0032, .132), (-.0032, .084)]
ReplaceMesh(game["RearTopExternalLever"], *ExtrudeProfile(topBar, "Z", .0505, .0525))
Bevel(game["RearTopExternalLever"], .00018)

Lathe(game["HandleNeck"], [(.0135, 0), (.0135, .0042), (.015, .0042),
    (.0438, .00355), (.046, .00355), (.046, 0)], (0, .14678, .04194), segments=40, axis="X")
sphere = []
for index in range(25):
    angle = math.pi * index / 24
    sphere.append((.14678 + .01074 * math.cos(angle), .011295 * math.sin(angle)))
Lathe(game["HandleSphere"], sphere, (.051525, .14678, .04194), segments=48, radialScale=.01129 / .011295)

# Preserve the established rear-sight envelope and its 4.5 mm daylight opening.
cross = [(-.0095, .06105), (.0095, .06105), (.0095, .06535),
    (.00225, .06535), (.00075, .06265), (-.00075, .06265),
    (-.00225, .06535), (-.0095, .06535)]
ReplaceMesh(game["Sight_LowCrossPiece"], *ExtrudeProfile(cross, "Y", .31637, .32569))
Bevel(game["Sight_LowCrossPiece"], .00012)

shapeParts = ["RearOuterCover_RoundedSideReturn", "RearCockingExterior", "RearSmallCover", "RearSmallPin",
    "RearTab", "RearTopExternalLever", "HandleNeck", "HandleSphere", "Sight_LowCrossPiece"]


def SatinSteel(name, reflectance, roughness):
    material = bpy.data.materials.new("SatinSteel_" + name)
    material.use_nodes = True
    tree = material.node_tree
    nodes = tree.nodes
    principled = nodes.get("Principled BSDF")
    principled.inputs["Metallic"].default_value = 1
    geometry = nodes.new("ShaderNodeNewGeometry")
    scale = nodes.new("ShaderNodeVectorMath")
    scale.operation = "SCALE"
    scale.inputs["Scale"].default_value = 8000
    tree.links.new(geometry.outputs["Position"], scale.inputs[0])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 1
    noise.inputs["Detail"].default_value = 1
    tree.links.new(scale.outputs[0], noise.inputs["Vector"])
    variation = nodes.new("ShaderNodeMapRange")
    variation.inputs["To Min"].default_value = .985
    variation.inputs["To Max"].default_value = 1.015
    tree.links.new(noise.outputs["Fac"], variation.inputs["Value"])
    base = nodes.new("ShaderNodeVectorMath")
    base.operation = "SCALE"
    base.inputs[0].default_value = tuple(value / gain for value, gain in zip(reflectance, gains[name]))
    tree.links.new(variation.outputs[0], base.inputs["Scale"])
    tree.links.new(base.outputs[0], principled.inputs["Base Color"])
    rough = nodes.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = roughness - .018
    rough.inputs["To Max"].default_value = roughness + .018
    tree.links.new(noise.outputs["Fac"], rough.inputs["Value"])
    direction = nodes.new("ShaderNodeVectorMath")
    direction.operation = "MULTIPLY"
    direction.inputs[1].default_value = (9000, 180, 9000)
    tree.links.new(geometry.outputs["Position"], direction.inputs[0])
    brushed = nodes.new("ShaderNodeTexNoise")
    brushed.inputs["Scale"].default_value = 1
    brushed.inputs["Detail"].default_value = 1
    tree.links.new(direction.outputs[0], brushed.inputs["Vector"])
    hairline = nodes.new("ShaderNodeMapRange")
    hairline.inputs["To Min"].default_value = -.009
    hairline.inputs["To Max"].default_value = .009
    tree.links.new(brushed.outputs["Fac"], hairline.inputs["Value"])
    combined = nodes.new("ShaderNodeMath")
    combined.operation = "ADD"
    tree.links.new(rough.outputs[0], combined.inputs[0])
    tree.links.new(hairline.outputs[0], combined.inputs[1])
    tree.links.new(combined.outputs[0], principled.inputs["Roughness"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = .16
    bump.inputs["Distance"].default_value = .0000035
    tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    tree.links.new(bump.outputs[0], principled.inputs["Normal"])
    return material


dark = (.12, .118, .114)
bare = (.27, .265, .25)
finishes = {
    "RearOuterCover_RoundedSideReturn": (dark, .35, 2048),
    "ReceiverOuterCollar": ((.15, .147, .143), .34, 2048),
    "RearCockingExterior": ((.24, .235, .225), .34, 1024),
    "RearSmallCover": (bare, .34, 1024),
    "RearSmallPin": ((.26, .255, .24), .35, 512),
    "RearTab": ((.23, .225, .215), .34, 1024),
    "RearTopExternalLever": ((.22, .215, .205), .35, 1024),
    "HandledCylinder": ((.28, .275, .26), .33, 2048),
    "HandleRoot": ((.29, .285, .27), .33, 512),
    "HandleNeck": ((.30, .295, .28), .33, 1024),
    "HandleSphere": ((.30, .295, .28), .34, 1024),
    "Sight_LowCrossPiece": ((.10, .098, .094), .32, 1024),
    "Sight_LowContinuousLeaf_NoUnknownNumbers": ((.10, .098, .094), .32, 1024),
    "Sight_ShallowRoundSeat": ((.10, .098, .094), .32, 512),
    "Sight_SideRoundHead_1": ((.12, .118, .114), .30, 512),
    "Sight_SideRoundHead_-1": ((.12, .118, .114), .30, 512),
}
sources = {}
for name, (reflectance, roughness, resolution) in finishes.items():
    obj = game[name]
    if name in shapeParts:
        SmoothNormals(obj)
    material = SatinSteel(name, reflectance, roughness)
    obj.data.materials.clear()
    obj.data.materials.append(material)
    source = obj.copy()
    source.data = obj.data.copy()
    source.name = name + "__BakeSource"
    source.hide_render = True
    scene.collection.objects.link(source)
    sources[name] = source

triangles = 0
for obj in game.values():
    obj.data.calc_loop_triangles()
    triangles += len(obj.data.loop_triangles)
assert triangles <= 69000, triangles
parts = {name: finish[2] for name, finish in finishes.items()}
report = BakeParts(scene, game, sources, parts, out, list(parts))
(out / "Data_RebakeReport.json").write_text(json.dumps(report, indent=2), encoding="utf8")

# Compare the changed forms with their immutable author-source counterparts.
author = sourceRoot / "DotsDelivery/HanYang_173R_Editable_Source/Source_173R_WristTailExterior_Author_WIP.blend"
with bpy.data.libraries.load(str(author), link=False) as (available, loaded):
    loaded.objects = list(shapeParts)
errors = {}
for name, original in zip(shapeParts, loaded.objects):
    target = game[name]
    originalPoints = [original.matrix_world @ vertex.co for vertex in original.data.vertices]
    targetPoints = [target.matrix_world @ vertex.co for vertex in target.data.vertices]
    originalTree = BVHTree.FromPolygons(originalPoints, [tuple(face.vertices) for face in original.data.polygons])
    targetTree = BVHTree.FromPolygons(targetPoints, [tuple(face.vertices) for face in target.data.polygons])
    errors[name] = {"gameToSourceMaxM": max(originalTree.find_nearest(point)[3] for point in targetPoints),
        "sourceToGameMaxM": max(targetTree.find_nearest(point)[3] for point in originalPoints)}
    bpy.data.objects.remove(original, do_unlink=True)
metadata = {
    "version": "173R-20261113", "triangles": triangles, "shapeParts": shapeParts,
    "sourceSurfaceErrors": errors,
    "finishes": {name: {"reflectance": value[0], "roughness": value[1], "size": value[2]} for name, value in finishes.items()},
    "reconstructionScope": "The protective cheeks, cocking body, rear disc, safety flag, bolt stem, knob and rear notch follow visible reference forms. Dimensions and satin finish are artistic reconstruction.",
    "historicalReferences": [
        {"url": "https://collections.tepapa.govt.nz/object/58119", "note": "Viewed museum receiver photograph 131366, showing smooth worn steel, protective cheeks, rear disc, flag and round bolt stem."},
        {"url": "https://www.icollector.com/Chinese-Hanyang-Mauser-Bolt-Action-Rifle_i13828566", "note": "Viewed original photographs 3 and 4 to compare the rear disc, safety silhouette, receiver and bolt finish."}
    ]
}
(revision / "Data_MechanismRepair.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf8")
bpy.ops.wm.save_as_mainfile(filepath=str(revision / "Scene_HanYangMechanism.blend"), compress=True)
print("MECHANISM_REPAIR_DONE", triangles, flush=True)
