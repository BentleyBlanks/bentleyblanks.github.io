# -*- coding: utf-8 -*-
"""Build the approved C/veteran ZB-26 exterior and its original-UV atlases.

Run through scripts/Script_BlenderMcp.mjs, never against another task's scene.
BuildAll imports BuildZb26 for deterministic single-asset rebuilds. The editable
scene and full-resolution author maps stay outside the Pages repository.
"""
from pathlib import Path
import json
import math
import os
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

here = Path(__file__).resolve().parent
project = here.parent
repository = project.parent
sourceDir = Path(os.environ.get("ZB26_SOURCE_DIR", "C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Zb26"))
blendPath = sourceDir / "Scene_Zb26Veteran20261015.blend"
mapDir = sourceDir / "SourceMaps"
taskName = "Zb26Veteran20261015"
if str(here) not in sys.path:
    sys.path.insert(0, str(here))
from TzmCore import Node, MATERIAL_NAMES, WriteTzm, AuditSolid
from AssetBudgets import WEAPON_TRIANGLE_LIMIT

MATERIAL_NAMES.update({"zb26Steel", "zb26Wood"})
partObjects = []
boreY = 0.035
sightX = -0.0234
frontSightZ = -0.836
materialStems = {"zb26Steel": "Zb26VeteranSteel", "zb26Wood": "Zb26VeteranWood"}


def Select(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def LookAtY(obj, target):
    direction = (Vector(target) - obj.location).normalized()
    right = direction.cross(Vector((0, 1, 0))).normalized()
    up = right.cross(direction).normalized()
    obj.rotation_euler = Matrix((right, up, -direction)).transposed().to_euler()


def Register(obj, name, material="zb26Steel", node="body"):
    obj.name = "Model_Zb26" + name
    obj["Zb26Material"] = material
    obj["Zb26Node"] = node
    partObjects.append(obj)
    return obj


def Mesh(name, vertices, faces, material="zb26Steel", node="body", smooth=False):
    mesh = bpy.data.meshes.new("Mesh_Zb26" + name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Model_Zb26" + name, mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = smooth and len(polygon.vertices) == 4
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    return Register(obj, name, material, node)


def Box(name, center, size, material="zb26Steel", node="body", bevel=0.0007):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("MachinedEdge", "BEVEL")
        modifier.width = min(bevel, min(size) * 0.18)
        modifier.segments = 2
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return Register(obj, name, material, node)


def Rod(name, start, end, radius, material="zb26Steel", node="body", segments=20):
    a, b = Vector(start), Vector(end)
    delta = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=radius, depth=delta.length,
                                       location=(a + b) / 2)
    obj = bpy.context.object
    obj.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return Register(obj, name, material, node)


def Lathe(name, profile, segments=24, center=(0, boreY), material="zb26Steel", node="body", closed=False):
    vertices = []
    for z, radius in profile:
        for j in range(segments):
            angle = j * math.tau / segments
            vertices.append((center[0] + radius * math.cos(angle), center[1] + radius * math.sin(angle), z))
    faces = []
    count = len(profile)
    for i in range(count if closed else count - 1):
        nxt = (i + 1) % count
        for j in range(segments):
            k = (j + 1) % segments
            faces.append((i * segments + j, i * segments + k, nxt * segments + k, nxt * segments + j))
    if not closed:
        faces += [tuple(reversed(range(segments))), tuple((count - 1) * segments + j for j in range(segments))]
    return Mesh(name, vertices, faces, material, node, True)


def Loft(name, rings, material="zb26Wood", node="body", segments=20, power=3.1):
    vertices = []
    for z, cy, rx, ry in rings:
        for j in range(segments):
            angle = j * math.tau / segments
            c, s = math.cos(angle), math.sin(angle)
            x = rx * math.copysign(abs(c) ** (2 / power), c)
            y = cy + ry * math.copysign(abs(s) ** (2 / power), s)
            # Small physical old dents, confined to the stock's outer faces.
            if material == "zb26Wood" and z > 0.045:
                for dentZ, dentY, depth in ((0.172, -0.042, 0.0011), (0.111, -0.012, 0.0008), (0.214, -0.062, 0.0009)):
                    falloff = math.exp(-((z - dentZ) / 0.019) ** 2 - ((y - dentY) / 0.012) ** 2)
                    x -= math.copysign(depth * falloff * min(1, abs(c) * 2), x)
            vertices.append((x, y, z))
    faces = []
    for i in range(len(rings) - 1):
        for j in range(segments):
            k = (j + 1) % segments
            faces.append((i * segments + j, i * segments + k, (i + 1) * segments + k, (i + 1) * segments + j))
    faces.extend([tuple(reversed(range(segments))), tuple((len(rings) - 1) * segments + j for j in range(segments))])
    return Mesh(name, vertices, faces, material, node, True)


def Guard(name, outer, inner, width=0.006, centerX=0, material="zb26Steel", node="body"):
    # A real closed ring with an open middle, not two coplanar drawn surfaces.
    vertices = [(centerX + side * width / 2, y, z) for side in (-1, 1) for points in (outer, inner) for y, z in points]
    n = len(outer)
    faces = []
    for j in range(n):
        k = (j + 1) % n
        faces += [(j, k, 2 * n + k, 2 * n + j), (n + j, 3 * n + j, 3 * n + k, n + k),
                  (j, n + j, n + k, k), (2 * n + j, 2 * n + k, 3 * n + k, 3 * n + j)]
    return Mesh(name, vertices, faces, material, node)


def Screw(name, center, axis="X", radius=0.0025, node="body"):
    end = Vector(center)
    start = end.copy()
    start["XYZ".index(axis)] -= (-0.006 if axis == "X" and center[0] < 0 else 0.006)
    return Rod(name, start, end, radius, node=node, segments=16)


def BuildExterior():
    partObjects.clear()
    # Receiver, rear fastening block, and the visibly machined side plates.
    Box("Receiver", (0, 0.032, -0.139), (0.039, 0.065, 0.318), bevel=0.0014)
    Box("RearSocket", (0, 0.019, 0.028), (0.035, 0.048, 0.034), bevel=0.0012)
    Box("ReceiverTop", (0, 0.066, -0.145), (0.041, 0.007, 0.308), bevel=0.0008)
    Box("ReceiverBottom", (0, -0.001, -0.119), (0.038, 0.008, 0.251))
    for side in (-1, 1):
        Box("ReceiverSidePlate" + str(side), (side * 0.0196, 0.025, -0.107), (0.0025, 0.035, 0.187), bevel=0.0005)
        for j, z in enumerate((-0.046, -0.179, -0.265)):
            Screw("ReceiverScrew%d_%d" % (side, j), (side * 0.0215, 0.038, z))
    Box("FeedSeat", (0, 0.066, -0.228), (0.040, 0.014, 0.080), bevel=0.001)
    Rod("LeftElevationDrum", (-0.017, 0.038, -0.149), (-0.030, 0.038, -0.149), 0.014, segments=28)
    Screw("ElevationDrumCenter", (-0.032, 0.038, -0.149), radius=0.0031)
    # The photographed straight 20-round magazine, with stamped vertical ribs.
    Box("Magazine", (0, 0.134, -0.228), (0.0258, 0.138, 0.069), node="magazineBody", bevel=0.0015)
    Box("MagazineTop", (0, 0.202, -0.228), (0.028, 0.004, 0.072), node="magazineBody")
    for side in (-1, 1):
        for j, z in enumerate((-0.209, -0.228, -0.247)):
            Box("MagazineRib%d_%d" % (side, j), (side * 0.013, 0.139, z), (0.0014, 0.112, 0.0022),
                node="magazineBody", bevel=0.00035)
    Box("MagazineLatch", (0.019, 0.076, -0.180), (0.007, 0.020, 0.014), bevel=0.001)
    # Barrel: continuous core and 58 actual solid annular cooling fins.
    Lathe("Barrel", [(-0.299, 0.013), (-0.344, 0.012), (-0.813, 0.0107), (-0.851, 0.012)], segments=32)
    Lathe("BarrelSocket", [(-0.278, 0.021), (-0.315, 0.021), (-0.332, 0.017)], segments=28)
    for j in range(58):
        z = -0.339 - j * 0.00765
        radius = 0.0186 - j * 0.000036
        w = 0.00245
        Lathe("CoolingFin%02d" % j,
              [(z - w / 2, 0.0075), (z - w / 2, radius - 0.00035), (z - w / 2 + 0.00035, radius),
               (z + w / 2 - 0.00035, radius), (z + w / 2, radius - 0.00035), (z + w / 2, 0.0075)],
              segments=24, closed=True)
    # Separate lower gas tube, its front support and short ribbed front collar.
    Lathe("GasTube", [(-0.274, 0.0115), (-0.332, 0.010), (-0.802, 0.009), (-0.832, 0.0115)],
          center=(0, -0.009), segments=24)
    Box("FrontBridge", (0, 0.012, -0.801), (0.028, 0.042, 0.031), bevel=0.0012)
    for j in range(8):
        z = -0.805 - j * 0.0039
        Lathe("GasCollarRib%02d" % j, [(z - 0.0007, 0.006), (z - 0.0007, 0.0148),
                (z + 0.0007, 0.0148), (z + 0.0007, 0.006)], center=(0, -0.009), segments=20, closed=True)
    # Conical flash hider with genuine open muzzle and eight exterior holes.
    hider = Lathe("FlashHider", [(-0.848, 0.012), (-0.857, 0.014), (-0.909, 0.019),
                  (-0.910, 0.0175), (-0.910, 0.0149), (-0.856, 0.0095), (-0.848, 0.0095)],
                  segments=32, closed=True)
    for j in range(8):
        angle = j * math.tau / 8
        radial = Vector((math.cos(angle), math.sin(angle), 0))
        center = Vector((0, boreY, -0.885))
        cutter = Rod("TemporaryHiderCut%02d" % j, center + radial * 0.010, center + radial * 0.025, 0.0020, segments=12)
        partObjects.remove(cutter)
        Select([hider])
        modifier = hider.modifiers.new("ExteriorVent%02d" % j, "BOOLEAN")
        modifier.operation = "DIFFERENCE"
        modifier.object = cutter
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.data.objects.remove(cutter, do_unlink=True)
    # Wooden shoulder stock, narrow wrist and an attached metal buttplate.
    stockRings = []
    anchors = [(0.035, 0.019, 0.0125, 0.020), (0.074, 0.010, 0.0140, 0.027),
               (0.129, -0.013, 0.0177, 0.043), (0.193, -0.033, 0.0186, 0.058),
               (0.248, -0.041, 0.0178, 0.063)]
    for a, b in zip(anchors, anchors[1:]):
        for t in (0, 0.25, 0.5, 0.75):
            stockRings.append(tuple(a[k] * (1 - t) + b[k] * t for k in range(4)))
    stockRings.append(anchors[-1])
    Loft("WalnutStock", stockRings)
    Loft("ButtPlate", [(0.246, -0.041, 0.0185, 0.064), (0.251, -0.041, 0.0190, 0.064),
                      (0.255, -0.041, 0.0180, 0.062)], material="zb26Steel")
    # Pistol grip leans slightly back. GripR remains the existing rig origin.
    grip = Loft("WalnutGrip", [(0, 0, 0.014, 0.011), (-0.024, 0, 0.0145, 0.019),
                              (-0.075, 0, 0.0140, 0.021), (-0.121, 0, 0.0125, 0.018)], segments=20)
    # Loft was along Z; rotate to the vertical grip axis and offset its heel.
    for vertex in grip.data.vertices:
        x, y, z = vertex.co
        vertex.co = (x, z + 0.002, y + 0.006 - z * 0.11)
    bm = bmesh.new()
    bm.from_mesh(grip.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(grip.data)
    bm.free()
    # Closed trigger guard and curved solid trigger, ahead of the grip.
    outer = [(-0.006, -0.019), (-0.010, -0.091), (-0.048, -0.097), (-0.061, -0.079), (-0.061, -0.040), (-0.045, -0.020)]
    inner = [(-0.012, -0.026), (-0.016, -0.084), (-0.044, -0.090), (-0.054, -0.075), (-0.054, -0.044), (-0.041, -0.027)]
    Guard("TriggerGuard", outer, inner, width=0.006)
    for z in (-0.025, -0.090):
        Box("TriggerGuardMount" + str(z), (0, -0.002, z), (0.011, 0.016, 0.019))
    Rod("TriggerUpper", (0, -0.008, -0.050), (0, -0.032, -0.059), 0.0023, segments=12)
    Rod("TriggerLower", (0, -0.032, -0.059), (0, -0.045, -0.053), 0.0023, segments=12)
    for side in (-1, 1):
        Box("StockFastener%d" % side, (side * 0.013, 0.003, 0.040), (0.003, 0.019, 0.043))
        Screw("StockBolt%d" % side, (side * 0.0152, 0.005, 0.047), radius=0.0032)
        Screw("GripBolt%d" % side, (side * 0.0148, -0.063, 0.018), radius=0.0026)
    Box("StockTopStrip", (0, 0.018, 0.123), (0.010, 0.0025, 0.155), bevel=0.0003)
    Box("StockSlingPlate", (-0.018, -0.043, 0.181), (0.002, 0.015, 0.031))
    Screw("StockSlingScrew", (-0.020, -0.043, 0.177), radius=0.0025)
    # Original short wooden carrying handle and its barrel-mounted steel arm.
    Rod("CarryPivot", (0.009, 0.043, -0.321), (0.031, 0.043, -0.321), 0.007, segments=20)
    Rod("CarryArm", (0.028, 0.043, -0.321), (0.030, 0.066, -0.350), 0.0037, segments=16)
    Rod("CarryWood", (0.031, 0.066, -0.346), (0.031, 0.066, -0.421), 0.0070,
        material="zb26Wood", segments=24)
    Rod("CarryEndCap", (0.031, 0.066, -0.418), (0.031, 0.066, -0.426), 0.0073, segments=20)
    # Folding bipod in the carried state; both legs physically attach to pivot.
    Lathe("BipodPivotBand", [(-0.691, 0.016), (-0.712, 0.016)], center=(0, -0.009), segments=24)
    for side in (-1, 1):
        Rod("BipodHinge%d" % side, (side * 0.008, -0.019, -0.704), (side * 0.031, -0.019, -0.704), 0.0070)
        Rod("BipodFoldedLeg%d" % side, (side * 0.028, -0.021, -0.704),
            (side * 0.029, -0.038, -0.382), 0.0046, segments=16)
        Box("BipodFoot%d" % side, (side * 0.029, -0.036, -0.387), (0.022, 0.007, 0.030), bevel=0.0012)
        Box("BipodCatch%d" % side, (side * 0.027, -0.023, -0.432), (0.007, 0.019, 0.012))
        Screw("BipodHingeBolt%d" % side, (side * 0.033, -0.019, -0.704), radius=0.0030)
    # Author the actual left-offset sight line once, with an open rear notch.
    Box("FrontSightBridge", (-0.012, 0.051, frontSightZ), (0.032, 0.015, 0.018), node="frontSight")
    Box("FrontSightBase", (sightX, 0.061, frontSightZ), (0.020, 0.013, 0.019), node="frontSight")
    Box("FrontSightBlade", (sightX, 0.080, frontSightZ), (0.003, 0.030, 0.004), node="frontSight", bevel=0)
    for side in (-1, 1):
        Box("FrontSightWing%d" % side, (sightX + side * 0.0078, 0.077, frontSightZ + 0.0016),
            (0.002, 0.030, 0.014), node="frontSight", bevel=0.0003)
    Box("RearSightMount", (-0.012, 0.064, -0.205), (0.033, 0.012, 0.028), node="rearSight")
    Box("RearSightBase", (sightX, 0.078, -0.205), (0.0145, 0.032, 0.009), node="rearSight")
    for side in (-1, 1):
        Box("RearNotch%d" % side, (sightX + side * 0.00475, 0.094, -0.205),
            (0.005, 0.002, 0.005), node="rearSight", bevel=0)
    # Separate closed charging handle island supports the existing animation.
    Rod("ChargingStem", (0.015, -0.005, -0.176), (0.039, -0.005, -0.176), 0.0036,
        node="boltHandle", segments=16)
    Box("ChargingTab", (0.035, -0.005, -0.176), (0.011, 0.010, 0.018), node="boltHandle", bevel=0.001)
    Box("ChargingRail", (0.0205, -0.005, -0.188), (0.004, 0.006, 0.105), bevel=0.0004)
    # The shared FPS anatomy is calibrated to this actual pistol-grip/trigger
    # location, ahead of the rear socket; the authored gripR socket stays zero.
    for obj in partObjects:
        if any(obj.name.startswith("Model_Zb26" + name) for name in ("WalnutGrip", "Trigger", "GripBolt")):
            obj.location.z -= 0.070


def MathNode(tree, operation, a, b=None):
    node = tree.nodes.new("ShaderNodeMath")
    node.operation = operation
    for i, value in enumerate((a, b)):
        if value is None:
            continue
        if isinstance(value, (int, float)):
            node.inputs[i].default_value = value
        else:
            tree.links.new(value, node.inputs[i])
    return node.outputs[0]


def Mix(tree, factor, first, second):
    node = tree.nodes.new("ShaderNodeMixRGB")
    if isinstance(factor, (int, float)):
        node.inputs[0].default_value = factor
    else:
        tree.links.new(factor, node.inputs[0])
    for i, value in enumerate((first, second), 1):
        if isinstance(value, tuple):
            node.inputs[i].default_value = (*value, 1)
        else:
            tree.links.new(value, node.inputs[i])
    return node.outputs[0]


def AuthorMaterial(key):
    material = bpy.data.materials.new("Material_" + materialStems[key] + "Author")
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    shader = tree.nodes.new("ShaderNodeBsdfPrincipled")
    tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    geometry = tree.nodes.new("ShaderNodeNewGeometry")
    mapping = tree.nodes.new("ShaderNodeVectorMath")
    mapping.operation = "MULTIPLY"
    tree.links.new(geometry.outputs["Position"], mapping.inputs[0])
    mapping.inputs[1].default_value = (1.1, 1.1, 1.1) if key == "zb26Steel" else (25, 13, 0.8)
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 95 if key == "zb26Steel" else 9
    noise.inputs["Detail"].default_value = 3
    tree.links.new(mapping.outputs[0], noise.inputs["Vector"])
    fine = tree.nodes.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 530 if key == "zb26Steel" else 55
    fine.inputs["Detail"].default_value = 2
    tree.links.new(mapping.outputs[0], fine.inputs["Vector"])
    if key == "zb26Steel":
        # Contact edges, scattered loss of bluing, and low-saturation dusty stains.
        edge = MathNode(tree, "MULTIPLY", MathNode(tree, "MAXIMUM", MathNode(tree, "SUBTRACT", geometry.outputs["Pointiness"], 0.50), 0), 11)
        edge = MathNode(tree, "MINIMUM", edge, 0.70)
        scars = MathNode(tree, "MULTIPLY", MathNode(tree, "GREATER_THAN", noise.outputs["Fac"], 0.61), 0.38)
        wear = MathNode(tree, "MAXIMUM", edge, scars)
        base = Mix(tree, noise.outputs["Fac"], (0.018, 0.021, 0.027), (0.055, 0.052, 0.047))
        base = Mix(tree, wear, base, (0.16, 0.17, 0.18))
        scratchMapping = tree.nodes.new("ShaderNodeVectorMath")
        scratchMapping.operation = "MULTIPLY"
        scratchMapping.inputs[1].default_value = (4.0, 0.7, 1.0)
        tree.links.new(geometry.outputs["Position"], scratchMapping.inputs[0])
        scratchNoise = tree.nodes.new("ShaderNodeTexVoronoi")
        scratchNoise.feature = "DISTANCE_TO_EDGE"
        scratchNoise.inputs["Scale"].default_value = 110
        tree.links.new(scratchMapping.outputs[0], scratchNoise.inputs["Vector"])
        scratches = MathNode(tree, "MULTIPLY", MathNode(tree, "LESS_THAN", scratchNoise.outputs["Distance"], 0.016),
                             MathNode(tree, "GREATER_THAN", fine.outputs["Fac"], 0.56))
        base = Mix(tree, MathNode(tree, "MULTIPLY", scratches, 0.60), base, (0.18, 0.17, 0.145))
        dust = MathNode(tree, "MULTIPLY", MathNode(tree, "GREATER_THAN", fine.outputs["Fac"], 0.61), 0.30)
        base = Mix(tree, dust, base, (0.145, 0.114, 0.081))
        rough = MathNode(tree, "ADD", 0.55, MathNode(tree, "MULTIPLY", noise.outputs["Fac"], 0.32))
        metal = MathNode(tree, "SUBTRACT", 0.72, MathNode(tree, "MULTIPLY", dust, 0.65))
        bumpDistance = 0.00010
    else:
        base = Mix(tree, noise.outputs["Fac"], (0.027, 0.012, 0.005), (0.100, 0.044, 0.015))
        polished = MathNode(tree, "MULTIPLY", MathNode(tree, "GREATER_THAN", fine.outputs["Fac"], 0.62), 0.40)
        base = Mix(tree, polished, base, (0.15, 0.075, 0.029))
        rough = MathNode(tree, "ADD", 0.58, MathNode(tree, "MULTIPLY", noise.outputs["Fac"], 0.28))
        metal = 0
        bumpDistance = 0.00035
    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.36
    bump.inputs["Distance"].default_value = bumpDistance
    tree.links.new(fine.outputs["Fac"], bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    tree.links.new(base, shader.inputs["Base Color"])
    tree.links.new(rough, shader.inputs["Roughness"])
    if isinstance(metal, (int, float)):
        shader.inputs["Metallic"].default_value = metal
    else:
        tree.links.new(metal, shader.inputs["Metallic"])
    material["Zb26Material"] = key
    return material, {"base": base, "rough": rough, "metal": metal, "shader": shader, "output": output}


def CombineAndUnwrap():
    grouped = {}
    for obj in partObjects:
        grouped.setdefault((obj["Zb26Node"], obj["Zb26Material"]), []).append(obj)
    objects = []
    cells = {"body": (0.012, 0.012, 0.976, 0.700), "magazineBody": (0.012, 0.735, 0.478, 0.253),
             "boltHandle": (0.510, 0.735, 0.175, 0.125), "frontSight": (0.710, 0.735, 0.278, 0.125),
             "rearSight": (0.510, 0.882, 0.478, 0.106)}
    for (nodeName, materialKey), parts in grouped.items():
        Select(parts)
        bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = "Model_Zb26" + nodeName[0].upper() + nodeName[1:] + ("Steel" if materialKey == "zb26Steel" else "Wood")
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        obj["Zb26Node"], obj["Zb26Material"] = nodeName, materialKey
        Select([obj])
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.015, area_weight=0.5, correct_aspect=True, scale_to_bounds=True)
        bpy.ops.object.mode_set(mode="OBJECT")
        if materialKey == "zb26Steel":
            x, y, w, h = cells[nodeName]
            for loop in obj.data.uv_layers.active.data:
                loop.uv = (x + loop.uv.x * w, y + loop.uv.y * h)
        objects.append(obj)
    return objects


def MakeNodeTree(objects):
    root = Node("root")
    nodes = {name: root.Child(name) for name in ("body", "magazineBody", "boltHandle", "frontSight", "rearSight")}
    for obj in objects:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        nodes[obj["Zb26Node"]].Add(obj["Zb26Material"], bm, tile="sourceUv")
    for name, location in {
        "muzzle": (0, boreY, -0.916), "gripR": (0, 0, 0), "gripL": (0, -0.012, -0.470),
        "sight": (sightX, 0.095, -0.205), "magazine": (0, 0.155, -0.118),
    }.items():
        root.Child(name, t=location)
    return root


def BuildZb26():
    BuildExterior()
    bpy.context.view_layer.update()
    parts = []
    for obj in partObjects:
        points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
        parts.append((obj.name, [min(p[i] for p in points) for i in range(3)],
                      [max(p[i] for p in points) for i in range(3)]))
    strays, coplanar = AuditSolid(parts)
    print("Zb26 part connections", json.dumps({"strays": strays, "coplanar": coplanar}), flush=True)
    if strays or coplanar:
        raise RuntimeError("Zb26 exterior has unattached or coplanar components")
    objects = CombineAndUnwrap()
    triangles = sum(len(poly.vertices) - 2 for obj in objects for poly in obj.data.polygons)
    BuildZb26.sourceTriangles = triangles
    BuildZb26.targetTriangles = triangles
    BuildZb26.triangleLimit = WEAPON_TRIANGLE_LIMIT
    return MakeNodeTree(objects)


BuildZb26.budget = WEAPON_TRIANGLE_LIMIT


def BakeAtlases(objects):
    mapDir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 1
    scene.cycles.device = "CPU"
    scene.render.bake.use_clear = False
    scene.render.bake.margin = 8
    scene.render.bake.use_selected_to_active = False
    for key in materialStems:
        subset = [obj for obj in objects if obj["Zb26Material"] == key]
        material, sockets = AuthorMaterial(key)
        for obj in subset:
            obj.data.materials.clear()
            obj.data.materials.append(material)
        tree = material.node_tree
        emission = tree.nodes.new("ShaderNodeEmission")
        targetNode = tree.nodes.new("ShaderNodeTexImage")
        targetNode.label = "AtlasBakeTarget"
        packed = tree.nodes.new("ShaderNodeCombineColor")
        packed.mode = "RGB"
        packed.inputs["Red"].default_value = 1
        tree.links.new(sockets["rough"], packed.inputs["Green"])
        if isinstance(sockets["metal"], (int, float)):
            packed.inputs["Blue"].default_value = sockets["metal"]
        else:
            tree.links.new(sockets["metal"], packed.inputs["Blue"])
        for channel in ("Base", "Normal", "Orm"):
            image = bpy.data.images.new("Texture_" + materialStems[key] + channel + "Source", width=1024, height=1024, alpha=False)
            image.colorspace_settings.name = "sRGB" if channel == "Base" else "Non-Color"
            fill = (0.075, 0.079, 0.083, 1) if key == "zb26Steel" else (0.085, 0.043, 0.021, 1)
            if channel == "Normal":
                fill = (0.5, 0.5, 1, 1)
            elif channel == "Orm":
                fill = (1, 0.65, 0.82 if key == "zb26Steel" else 0, 1)
            pixels = np.tile(np.asarray(fill, dtype=np.float32), 1024 * 1024)
            image.pixels.foreach_set(pixels)
            targetNode.image = image
            tree.nodes.active = targetNode
            Select(subset)
            for link in list(sockets["output"].inputs["Surface"].links):
                tree.links.remove(link)
            if channel == "Normal":
                tree.links.new(sockets["shader"].outputs["BSDF"], sockets["output"].inputs["Surface"])
                bpy.ops.object.bake(type="NORMAL", normal_space="TANGENT")
            else:
                for link in list(emission.inputs["Color"].links):
                    tree.links.remove(link)
                tree.links.new(sockets["base"] if channel == "Base" else packed.outputs[0], emission.inputs["Color"])
                tree.links.new(emission.outputs[0], sockets["output"].inputs["Surface"])
                bpy.ops.object.bake(type="EMIT")
            image.filepath_raw = str(mapDir / ("Texture_" + materialStems[key] + channel + "Source.png"))
            image.file_format = "PNG"
            image.save()
            print("Zb26 baked", key, channel, image.filepath_raw, flush=True)
        for link in list(sockets["output"].inputs["Surface"].links):
            tree.links.remove(link)
        tree.links.new(sockets["shader"].outputs["BSDF"], sockets["output"].inputs["Surface"])


def SavedMaterial(key):
    material = bpy.data.materials.new("Material_" + materialStems[key])
    material.use_nodes = True
    tree = material.node_tree
    shader = tree.nodes.get("Principled BSDF")
    sources = {}
    for channel in ("Base", "Normal", "Orm"):
        node = tree.nodes.new("ShaderNodeTexImage")
        node.image = bpy.data.images.load(str(mapDir / ("Texture_" + materialStems[key] + channel + "Source.png")), check_existing=False)
        node.image.colorspace_settings.name = "sRGB" if channel == "Base" else "Non-Color"
        sources[channel] = node
    tree.links.new(sources["Base"].outputs["Color"], shader.inputs["Base Color"])
    normal = tree.nodes.new("ShaderNodeNormalMap")
    tree.links.new(sources["Normal"].outputs["Color"], normal.inputs["Color"])
    tree.links.new(normal.outputs["Normal"], shader.inputs["Normal"])
    split = tree.nodes.new("ShaderNodeSeparateColor")
    tree.links.new(sources["Orm"].outputs["Color"], split.inputs[0])
    tree.links.new(split.outputs["Green"], shader.inputs["Roughness"])
    tree.links.new(split.outputs["Blue"], shader.inputs["Metallic"])
    return material


def SetupPreview(objects):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new("World_Zb26Neutral")
    scene.world.use_nodes = True
    worldTree = scene.world.node_tree
    background = worldTree.nodes.get("Background")
    background.inputs[0].default_value = (0.07, 0.075, 0.08, 1)
    background.inputs[1].default_value = 0.25
    cameraBackground = worldTree.nodes.new("ShaderNodeBackground")
    cameraBackground.inputs[0].default_value = (0.32, 0.34, 0.37, 1)
    cameraBackground.inputs[1].default_value = 0.65
    lightPath = worldTree.nodes.new("ShaderNodeLightPath")
    mix = worldTree.nodes.new("ShaderNodeMixShader")
    worldTree.links.new(lightPath.outputs["Is Camera Ray"], mix.inputs[0])
    worldTree.links.new(background.outputs[0], mix.inputs[1])
    worldTree.links.new(cameraBackground.outputs[0], mix.inputs[2])
    worldTree.links.new(mix.outputs[0], worldTree.nodes.get("World Output").inputs[0])
    scene.view_settings.view_transform = "AgX"
    root = bpy.data.objects.new("Zb26EditableRoot", None)
    scene.collection.objects.link(root)
    root["Units"], root["Forward"], root["ApprovedStyle"] = "meters", "-Z", "C/veteran"
    materials = {key: SavedMaterial(key) for key in materialStems}
    for obj in objects:
        obj.parent = root
        if all((mapDir / ("Texture_" + materialStems[obj["Zb26Material"]] + c + "Source.png")).exists() for c in ("Base", "Normal", "Orm")):
            obj.data.materials.clear()
            obj.data.materials.append(materials[obj["Zb26Material"]])
    target = Vector((0, 0.035, -0.325))
    for name, position, energy, size in (
        ("Key", (0.75, 1.35, -0.15), 22, 1.3), ("Fill", (-1.0, 0.65, -0.4), 12, 1.2),
        ("Rim", (0.15, 0.85, -1.5), 14, 1.0)):
        light = bpy.data.lights.new("Light_Zb26" + name, "AREA")
        light.energy, light.shape, light.size = energy, "DISK", size
        obj = bpy.data.objects.new("Light_Zb26" + name, light)
        scene.collection.objects.link(obj)
        obj.location = position
        obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()
    cameraData = bpy.data.cameras.new("Camera_Zb26ThreeQuarter")
    camera = bpy.data.objects.new("Camera_Zb26ThreeQuarter", cameraData)
    scene.collection.objects.link(camera)
    camera.location = (1.8, 0.8, 0.3)
    LookAtY(camera, target)
    cameraData.type, cameraData.ortho_scale = "ORTHO", 1.50
    scene.camera = camera
    scene["BlenderMcpTask"] = taskName
    for area in bpy.context.screen.areas:
        if area.type == "VIEW_3D":
            area.spaces.active.region_3d.view_location = target
            area.spaces.active.region_3d.view_distance = 1.5


def Main():
    current = Path(bpy.data.filepath).resolve() if bpy.data.filepath else None
    if current is not None and current != blendPath.resolve():
        raise RuntimeError("Refusing another scene: " + str(current))
    if bpy.context.scene.get("BlenderMcpTask") != taskName:
        raise RuntimeError("This scene is not owned by the Zb26 task")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    sourceDir.mkdir(parents=True, exist_ok=True)
    root = BuildZb26()
    objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.get("Zb26Material")]
    triangles = sum(len(poly.vertices) - 2 for obj in objects for poly in obj.data.polygons)
    if triangles > WEAPON_TRIANGLE_LIMIT:
        raise RuntimeError("Triangle budget exceeded: %d > %d" % (triangles, WEAPON_TRIANGLE_LIMIT))
    if os.environ.get("ZB26_SKIP_BAKE") != "1":
        BakeAtlases(objects)
    SetupPreview(objects)
    for datablocks in (bpy.data.materials, bpy.data.images, bpy.data.meshes):
        for item in list(datablocks):
            if item.users == 0:
                datablocks.remove(item)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(blendPath))
    output = project / "Model/Model_Zb26.tzm.json"
    tris, blocks, size, audit = WriteTzm(root, str(output), "Zb26",
        "Original ZB-26 exterior rebuilt in BlenderMCP from VHÚ museum and 1937 photographs; user-approved C/veteran wear. Folded carrying bipod; original UV steel/walnut atlases; separate magazine, charging handle and left-offset sights.", audit=True)
    # The source script is the delivery recipe: update only this model's entry,
    # preserving every other asset and the existing index format/budget.
    indexPath = project / "Model/Data_ModelIndex.json"
    index = json.loads(indexPath.read_text("utf-8"))
    doc = json.loads(output.read_text("utf-8"))
    entry = {"name": "Zb26", "category": "weapon", "file": output.name,
             "triangles": tris, "meshBlocks": blocks, "nodes": len(doc["nodes"]), "joints": 0,
             "bytes": size, "materials": sorted({mesh["material"] for mesh in doc["meshes"]}),
             "mounts": [node["name"] for node in doc["nodes"] if not node.get("meshes")],
             "bounds": doc["bounds"], "sourceTriangles": BuildZb26.sourceTriangles,
             "targetTriangles": BuildZb26.targetTriangles, "triangleLimit": WEAPON_TRIANGLE_LIMIT}
    index["models"] = [item for item in index["models"] if item["name"] != "Zb26"] + [entry]
    indexPath.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", "utf-8")
    if audit["strays"] or audit["coplanar"]:
        raise RuntimeError("Exported Zb26 connectivity audit failed")
    print(json.dumps({"blend": str(blendPath), "model": str(output), "triangles": tris,
                      "meshBlocks": blocks, "bytes": size, "audit": audit}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    Main()
