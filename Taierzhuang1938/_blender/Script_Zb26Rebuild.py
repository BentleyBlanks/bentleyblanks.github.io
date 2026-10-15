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
from TzmCore import Node, MATERIAL_NAMES, WriteTzm, AuditSolid, AUTHORED_NORMAL_LAYER
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
    # Face-domain wear prevents curvature interpolation from painting a whole
    # thin plate as an exposed edge. Only the actual bevel/rim receives polish.
    wear = obj.data.attributes.new("Zb26EdgeWear", "FLOAT", "FACE")
    for polygon in obj.data.polygons:
        normal = polygon.normal
        value = .72 if name == "Receiver" and max(abs(c) for c in normal) < .985 else 0
        if name.startswith("CoolingFin"):
            value = .8 if .15 < abs(normal.z) < .94 else 0
        if name.startswith(("Walnut", "CarryWood")):
            value = 0
        wear.data[polygon.index].value = value
    if material == "zb26Wood":
        grain = obj.data.attributes.new("Zb26WoodGrain", "FLOAT_VECTOR", "CORNER")
        for loop in obj.data.loops:
            co = obj.data.vertices[loop.vertex_index].co
            grain.data[loop.index].vector = (co.z/.32+.05, co.y/.32+.48, 0)
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
    Register(obj, name, material, node)
    for polygon in obj.data.polygons:
        obj.data.attributes["Zb26EdgeWear"].data[polygon.index].value = .72 if max(abs(c) for c in polygon.normal) < .985 else 0
    return obj


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
    obj = Mesh(name, vertices, faces, material, node)
    for polygon in obj.data.polygons:
        polygon.use_smooth = polygon.index % 4 in (0, 1)
    return obj


def Screw(name, center, axis="X", radius=0.0025, node="body"):
    end = Vector(center)
    start = end.copy()
    start["XYZ".index(axis)] -= (-0.006 if axis == "X" and center[0] < 0 else 0.006)
    screw = Rod(name, start, end, radius, node=node, segments=16)
    # Slotted steel heads carry real recessed detail, visible in grazing light.
    if axis == "X":
        slot = Box(name + "TemporarySlot", tuple(end), (0.0021, radius * 0.38, radius * 1.55), bevel=0)
        partObjects.remove(slot)
        Select([screw])
        modifier = screw.modifiers.new("ScrewdriverSlot", "BOOLEAN")
        modifier.operation = "DIFFERENCE"
        modifier.object = slot
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        bpy.data.objects.remove(slot, do_unlink=True)
    return screw


def CutPocket(obj, name, center, size, bevel=0.001):
    """Shallow closed exterior recess; never model the working mechanism."""
    cutter = Box(name + "Cutter", center, size, bevel=bevel)
    partObjects.remove(cutter)
    Select([obj])
    modifier = obj.modifiers.new(name, "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.object = cutter
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def SideRing(name, x, cy, cz, outer, inner, width, segments=40):
    obj = Lathe(name, [(x-width/2, inner), (x-width/2, outer-.0003),
                      (x, outer), (x+width/2, outer-.0003), (x+width/2, inner)],
                segments=segments, center=(0, 0), closed=True)
    for vertex in obj.data.vertices:
        px, py, pz = vertex.co
        vertex.co = (pz, cy+py, cz-px)
    return obj


def BuildExterior():
    partObjects.clear()
    # Receiver, rear fastening block, and the visibly machined side plates.
    receiver = Loft("Receiver", [(0.020, 0.032, 0.0165, 0.030), (0.004, 0.032, 0.0195, 0.0325),
                     (-0.266, 0.032, 0.0195, 0.0325), (-0.298, 0.034, 0.0175, 0.0315)],
         material="zb26Steel", segments=24, power=7.5)
    Box("RearSocket", (0, 0.019, 0.028), (0.035, 0.048, 0.034), bevel=0.0012)
    Box("ReceiverTop", (0, 0.064, -0.084), (0.0365, 0.003, 0.178), bevel=0.0005)
    Box("FeedCover", (0, 0.066, -0.234), (0.038, 0.006, 0.112), bevel=0.0012)
    Box("ReceiverBottom", (0, -0.001, -0.119), (0.038, 0.008, 0.251))
    for side in (-1, 1):
        plate = Box("ReceiverSidePlate" + str(side), (side * 0.0195, 0.032, -0.075),
                    (0.002, 0.046, 0.157), bevel=0.00065)
        CutPocket(plate, "InsetPanel%d" % side, (side*.021, .032, -.075),
                  (.0023, .038, .146), .0018)
        for j, z in enumerate((-0.009, -0.145)):
            Screw("ReceiverScrew%d_%d" % (side, j), (side * 0.021, 0.049, z), radius=.0021)
        Box("LowerGuide%d" % side, (side*.020, .004, -.149), (.003,.005,.275), bevel=.0006)
    CutPocket(receiver, "ExteriorPort", (.021, .041, -.258), (.010, .021, .060), .003)
    Box("PortLowerLip", (.018, .030, -.258), (.006, .003, .060), bevel=.0006)
    Box("PortUpperLip", (.019, .052, -.258), (.005, .0024, .060), bevel=.0007)
    Box("PortShutter", (.0163, .037, -.258), (.001, .010, .053), bevel=.0005)
    Rod("PortLatchPivot", (.016, .060, -.205), (.024, .060, -.205), .0037, segments=20)
    Box("PortLatch", (.023, .063, -.207), (.003, .006, .021), bevel=.0008)
    Box("FeedSeat", (0, 0.066, -0.228), (0.040, 0.014, 0.080), bevel=0.001)
    Rod("LeftElevationDrum", (-0.017, 0.036, -0.177), (-0.029, 0.036, -0.177), 0.021, segments=48)
    SideRing("ElevationDrumRim", -.0295, .036, -.177, .0213, .0182, .0020)
    SideRing("ElevationDrumHub", -.030, .036, -.177, .0075, .0040, .0015, segments=28)
    Screw("ElevationDrumCenter", (-0.032, 0.036, -0.177), radius=0.0033)
    Rod("SelectorPivot", (-.017, .005, -.083), (-.024, .005, -.083), .005, segments=24)
    selector = Box("SelectorLever", (-.024, .004, -.069), (.003, .008, .028), bevel=.001)
    selector.rotation_euler.x = -.16
    # The photographed straight 20-round magazine, with stamped vertical ribs.
    Box("Magazine", (0, 0.134, -0.228), (0.0258, 0.138, 0.069), node="magazineBody", bevel=0.0015)
    Box("MagazineTop", (0, 0.202, -0.228), (0.028, 0.004, 0.072), node="magazineBody")
    for side in (-1, 1):
        for j, z in enumerate((-0.216, -0.240)):
            Box("MagazineRib%d_%d" % (side, j), (side * 0.013, 0.139, z), (0.0012, 0.112, 0.0024),
                node="magazineBody", bevel=0.00035)
        Box("MagazineFold%d" % side, (side*.0131,.138,-.261), (.0012,.128,.0020),
            node="magazineBody", bevel=.0003)
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
              segments=20, closed=True)
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
    outer = [(-.032+.029*math.sin(j*math.tau/24), -.058+.041*math.cos(j*math.tau/24)) for j in range(24)]
    inner = [(-.032+.023*math.sin(j*math.tau/24), -.058+.035*math.cos(j*math.tau/24)) for j in range(24)]
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


def Ramp(tree, value, low, high):
    node = tree.nodes.new("ShaderNodeMapRange")
    node.interpolation_type = "SMOOTHERSTEP"
    node.clamp = True
    tree.links.new(value, node.inputs[0])
    node.inputs[1].default_value, node.inputs[2].default_value = low, high
    return node.outputs[0]


def SurfaceNoise(tree, position, scale, detail=3):
    mapping = tree.nodes.new("ShaderNodeVectorMath")
    mapping.operation = "MULTIPLY"
    mapping.inputs[1].default_value = scale
    tree.links.new(position, mapping.inputs[0])
    node = tree.nodes.new("ShaderNodeTexNoise")
    node.inputs["Scale"].default_value = 1
    node.inputs["Detail"].default_value = detail
    tree.links.new(mapping.outputs[0], node.inputs["Vector"])
    return node.outputs["Fac"]


def ScuffMask(tree, geometry):
    """Sparse exterior handling scars, specified in metres on the side faces."""
    def VectorMath(operation, a, b=None):
        node = tree.nodes.new("ShaderNodeVectorMath")
        node.operation = operation
        for i, value in enumerate((a, b)):
            if value is None:
                continue
            if isinstance(value, tuple):
                node.inputs[i].default_value = value
            else:
                tree.links.new(value, node.inputs[i])
        return node
    projected = VectorMath("MULTIPLY", geometry.outputs["Position"], (0,1,1)).outputs[0]
    mask = 0
    for y, z, dy, dz, width in (
        (.043,-.038,.0015,-.016,.00027), (.040,-.051,.0006,-.009,.00018),
        (.019,-.105,.0025,-.020,.00028), (.020,-.109,.0010,-.010,.00018),
        (.013,-.138,.0006,-.011,.00023), (.048,-.281,-.001,-.010,.00032),
        (.058,-.192,.0008,-.013,.00020), (.181,-.206,-.010,-.0012,.00030),
        (.192,-.249,-.011,.0005,.00022), (.096,-.207,.013,-.0006,.00024)):
        start, delta = (0,y,z), (0,dy,dz)
        offset = VectorMath("SUBTRACT", projected, start).outputs[0]
        dot = VectorMath("DOT_PRODUCT", offset, delta).outputs["Value"]
        t = MathNode(tree, "MINIMUM", 1, MathNode(tree, "MAXIMUM", 0,
            MathNode(tree, "DIVIDE", dot, dy*dy+dz*dz)))
        scale = VectorMath("SCALE", delta)
        tree.links.new(t, scale.inputs["Scale"])
        closest = VectorMath("ADD", scale.outputs[0], start).outputs[0]
        distance = VectorMath("DISTANCE", projected, closest).outputs["Value"]
        stroke = MathNode(tree, "SUBTRACT", 1, Ramp(tree, distance, width*.2, width))
        mask = MathNode(tree, "MAXIMUM", mask, stroke)
    normal = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(geometry.outputs["Normal"], normal.inputs[0])
    return MathNode(tree, "MULTIPLY", mask, Ramp(tree, MathNode(tree, "ABSOLUTE", normal.outputs["X"]), .8, .96))


def AuthorMaterial(key):
    material = bpy.data.materials.new("Material_" + materialStems[key] + "Author")
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    shader = tree.nodes.new("ShaderNodeBsdfPrincipled")
    tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    geometry = tree.nodes.new("ShaderNodeNewGeometry")
    edgeAttribute = tree.nodes.new("ShaderNodeAttribute")
    edgeAttribute.attribute_name = "Zb26EdgeWear"
    position = geometry.outputs["Position"]
    noise = SurfaceNoise(tree, position, (65, 65, 65))
    fine = SurfaceNoise(tree, position, (1600, 1600, 1600), 2)
    ao = tree.nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = 0.009
    ao.samples = 16
    if key == "zb26Steel":
        # Worn bluing stays coherent. Broken edge polish and sparse directional
        # scars carry the age; no Voronoi web or thresholded camouflage patches.
        edge = MathNode(tree, "MULTIPLY", edgeAttribute.outputs["Fac"],
                        Ramp(tree, noise, .32, .64))
        scratch = SurfaceNoise(tree, position, (2600, 1100, 65), 2)
        scratchPatch = SurfaceNoise(tree, position, (95, 95, 95))
        scratches = MathNode(tree, "MULTIPLY", Ramp(tree, scratch, .69, .78), Ramp(tree, scratchPatch, .53, .71))
        wear = MathNode(tree, "MAXIMUM", edge, MathNode(tree, "MULTIPLY", scratches, .58))
        wear = MathNode(tree, "MAXIMUM", wear, MathNode(tree, "MULTIPLY", ScuffMask(tree, geometry), .72))
        base = Mix(tree, noise, (.075, .079, .081), (.095, .093, .086))
        base = Mix(tree, wear, base, (.24, .235, .215))
        dust = MathNode(tree, "MULTIPLY", MathNode(tree, "SUBTRACT", 1, ao.outputs["AO"]),
                        MathNode(tree, "ADD", .18, MathNode(tree, "MULTIPLY", noise, .38)))
        base = Mix(tree, dust, base, (.095, .073, .047))
        rough = MathNode(tree, "ADD", MathNode(tree, "SUBTRACT",
            MathNode(tree, "ADD", .43, MathNode(tree, "MULTIPLY", noise, .15)),
            MathNode(tree, "MULTIPLY", wear, .19)), MathNode(tree, "MULTIPLY", dust, .32))
        metal = MathNode(tree, "SUBTRACT", .91, MathNode(tree, "MULTIPLY", dust, .72))
        height = fine
        bumpDistance = 0.000006
    else:
        # Long irregular walnut fibres, rather than equally spaced wave bands.
        pores = Ramp(tree, SurfaceNoise(tree, position, (2200, 1400, 32), 2), .60, .76)
        grainCoordinates = tree.nodes.new("ShaderNodeAttribute")
        grainCoordinates.attribute_name = "Zb26WoodGrain"
        walnut = tree.nodes.new("ShaderNodeTexImage")
        walnut.image = bpy.data.images.load(str(project / "_import/Source/Zb26/Texture_WalnutAuthor.webp"), check_existing=True)
        walnut.image.colorspace_settings.name = "sRGB"
        tree.links.new(grainCoordinates.outputs["Vector"], walnut.inputs["Vector"])
        base = walnut.outputs["Color"]
        edge = MathNode(tree, "MULTIPLY", edgeAttribute.outputs["Fac"], noise)
        base = Mix(tree, MathNode(tree, "MULTIPLY", edge, .65), base, (.23, .12, .052))
        rough = MathNode(tree, "ADD", .37, MathNode(tree, "MULTIPLY", noise, .28))
        metal = 0
        height = pores
        bumpDistance = 0.000035
    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.36
    bump.inputs["Distance"].default_value = bumpDistance
    tree.links.new(height, bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    tree.links.new(base, shader.inputs["Base Color"])
    tree.links.new(rough, shader.inputs["Roughness"])
    if isinstance(metal, (int, float)):
        shader.inputs["Metallic"].default_value = metal
    else:
        tree.links.new(metal, shader.inputs["Metallic"])
    material["Zb26Material"] = key
    return material, {"base": base, "rough": rough, "metal": metal, "ao": ao.outputs["AO"], "shader": shader, "output": output}


def CombineAndUnwrap():
    grouped = {}
    for obj in partObjects:
        grouped.setdefault((obj["Zb26Node"], obj["Zb26Material"]), []).append(obj)
    objects = []
    cells = {"body": (0.012, 0.012, 0.976, 0.700), "magazineBody": (0.012, 0.735, 0.478, 0.253),
             "boltHandle": (0.510, 0.735, 0.175, 0.125), "frontSight": (0.710, 0.735, 0.278, 0.125),
             "rearSight": (0.510, 0.882, 0.478, 0.106)}
    for (nodeName, materialKey), parts in grouped.items():
        batches = [(parts, cells[nodeName] if materialKey == "zb26Steel" else (0,0,1,1))]
        if materialKey == "zb26Steel" and nodeName == "body":
            barrelNames = ("Barrel", "CoolingFin", "GasTube", "GasCollar", "FrontBridge", "FlashHider", "Bipod")
            barrel = [obj for obj in parts if any(obj.name.startswith("Model_Zb26"+n) for n in barrelNames)]
            receiver = [obj for obj in parts if obj not in barrel]
            # Reserve real texel area for the receiver seen at arm's length;
            # the 58 cooling rings must not consume the whole UV atlas.
            batches = [(receiver, (.012,.012,.976,.350)), (barrel, (.012,.386,.976,.326))]
        unwrapped = []
        for batch, cell in batches:
            Select(batch)
            if len(batch) > 1:
                bpy.ops.object.join()
            obj = bpy.context.object
            bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
            Select([obj])
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.012, area_weight=0.5, correct_aspect=True, scale_to_bounds=True)
            bpy.ops.object.mode_set(mode="OBJECT")
            x, y, w, h = cell
            for loop in obj.data.uv_layers.active.data:
                loop.uv = (x + loop.uv.x * w, y + loop.uv.y * h)
            unwrapped.append(obj)
        Select(unwrapped)
        if len(unwrapped) > 1:
            bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = "Model_Zb26" + nodeName[0].upper() + nodeName[1:] + ("Steel" if materialKey == "zb26Steel" else "Wood")
        obj["Zb26Node"], obj["Zb26Material"] = nodeName, materialKey
        objects.append(obj)
    return objects


def MakeNodeTree(objects):
    root = Node("root")
    nodes = {name: root.Child(name) for name in ("body", "magazineBody", "boltHandle", "frontSight", "rearSight")}
    for obj in objects:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        authored = bm.loops.layers.float_vector.new(AUTHORED_NORMAL_LAYER)
        bm.faces.ensure_lookup_table()
        for polygon in obj.data.polygons:
            for loop, loopIndex in zip(bm.faces[polygon.index].loops, polygon.loop_indices):
                loop[authored] = obj.data.corner_normals[loopIndex].vector
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


def BakeAtlases(objects, keys=None):
    mapDir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.render.threads_mode, scene.render.threads = "FIXED", 8
    scene.cycles.samples = 8
    scene.cycles.device = "CPU"
    scene.render.bake.use_clear = False
    scene.render.bake.margin = 8
    scene.render.bake.use_selected_to_active = False
    for key in (materialStems if keys is None else keys):
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
        tree.links.new(sockets["ao"], packed.inputs["Red"])
        tree.links.new(sockets["rough"], packed.inputs["Green"])
        if isinstance(sockets["metal"], (int, float)):
            packed.inputs["Blue"].default_value = sockets["metal"]
        else:
            tree.links.new(sockets["metal"], packed.inputs["Blue"])
        for channel in ("Base", "Normal", "Orm"):
            size = 2048 if key == "zb26Steel" and channel == "Base" else 1024
            image = bpy.data.images.new("Texture_" + materialStems[key] + channel + "Source", width=size, height=size, alpha=False)
            image.colorspace_settings.name = "sRGB" if channel == "Base" else "Non-Color"
            fill = (0.075, 0.079, 0.083, 1) if key == "zb26Steel" else (0.085, 0.043, 0.021, 1)
            if channel == "Normal":
                fill = (0.5, 0.5, 1, 1)
            elif channel == "Orm":
                fill = (1, 0.65, 0.82 if key == "zb26Steel" else 0, 1)
            pixels = np.tile(np.asarray(fill, dtype=np.float32), size * size)
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
