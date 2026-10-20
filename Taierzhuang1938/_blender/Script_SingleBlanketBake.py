"""Rebuild the approved five-patch thin sheet in Blender 5.1, without simulation.

GUI authoring uses scripts/Script_BlenderMcp.mjs. Headless reproduction:
blender --background --python Script_SingleBlanketBake.py -- --output-dir <dir>
Textures are loaded from the committed 1024-square PBR set. To regenerate them,
run _import/Script_SingleBlanketTextureBake.py with ordinary Python first.
"""
import argparse
import hashlib
import json
import math
import random
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Vector
from mathutils.kdtree import KDTree

projectDir = Path(globals()["SingleBlanketProject"]) if "SingleBlanketProject" in globals() else Path(__file__).resolve().parents[1]
sourceDir = Path("C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SingleBlanket")
xColumns = (0.70, 0.2333, -0.2333, -0.70)
yRows = (-0.95, -0.57, -0.19, 0.19, 0.57, 0.95)
clipNames = ("Blanket_Flat", "Blanket_DragPose", "Blanket_Released", "Blanket_Crumpled", "Blanket_Unfold")
cornerNames = {(0, 0): "Blanket_CornerHeadL", (0, 3): "Blanket_CornerHeadR",
               (5, 0): "Blanket_CornerTailL", (5, 3): "Blanket_CornerTailR"}
widthSegments, lengthSegments = 36, 48


def BoneName(row, column):
    return cornerNames.get((row, column), f"Blanket_Grid_r{row}_c{column}")


def Dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def BilinearWeights(point):
    x = min(0.70, max(-0.70, point.x))
    y = min(0.95, max(-0.95, point.y))
    column = next((c for c in range(3) if x >= xColumns[c+1]), 2)
    row = min(4, max(0, int(math.floor((y+0.95)/0.38 + 1e-10))))
    u = min(1.0, max(0.0, (xColumns[column]-x)/(xColumns[column]-xColumns[column+1])))
    v = min(1.0, max(0.0, (y-yRows[row])/0.38))
    return [(BoneName(row, column), (1-u)*(1-v)),
            (BoneName(row, column+1), u*(1-v)),
            (BoneName(row+1, column), (1-u)*v),
            (BoneName(row+1, column+1), u*v)]


def CreateMesh():
    rng = random.Random(19380317)
    # Paired inward offsets keep the geometric centre exactly at the origin.
    edgeX = [rng.uniform(0, 0.015) for _ in range(11)]
    edgeY = [rng.uniform(0, 0.015) for _ in range(8)]
    def EdgeOffset(index, segments, controls):
        phase = min(index, segments-index)*2/segments*(len(controls)-1)
        lower = min(len(controls)-2, int(phase))
        amount = phase-lower
        amount = amount*amount*(3-2*amount)
        return controls[lower]*(1-amount)+controls[lower+1]*amount

    vertices, faces = [], []
    stride = widthSegments+1
    for j in range(lengthSegments+1):
        for i in range(widthSegments+1):
            x, y = -0.70 + 1.40*i/widthSegments, -0.95 + 1.90*j/lengthSegments
            if i in (0, widthSegments):
                x += (1 if i == 0 else -1)*EdgeOffset(j, lengthSegments, edgeX)
            if j in (0, lengthSegments):
                y += (1 if j == 0 else -1)*EdgeOffset(i, widthSegments, edgeY)
            vertices.append((x, y, 0.0))
    for j in range(lengthSegments):
        for i in range(widthSegments):
            k = j*stride+i
            faces.append((k, k+1, k+stride+1, k+stride))
    meshData = bpy.data.meshes.new("Blanket_Geometry")
    meshData.from_pydata(vertices, [], faces)
    meshData.update()
    mesh = bpy.data.objects.new("Blanket_Mesh", meshData)
    bpy.context.collection.objects.link(mesh)
    uv = meshData.uv_layers.new(name="UVMap")
    for polygon in meshData.polygons:
        polygon.use_smooth = True
        for loopIndex in polygon.loop_indices:
            vertexIndex = meshData.loops[loopIndex].vertex_index
            i, j = vertexIndex % stride, vertexIndex // stride
            # Head-up top views show +X (L) on image left.
            uv.data[loopIndex].uv = (1-i/widthSegments, 1-j/lengthSegments)
    mesh.shape_key_add(name="Basis")
    mesh.shape_key_add(name="Crumpled")
    return mesh


def CreateRig(mesh):
    armature = bpy.data.armatures.new("Blanket_Armature")
    rig = bpy.data.objects.new("Blanket_Rig", armature)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="EDIT")
    root = armature.edit_bones.new("Blanket_Root")
    root.head, root.tail, root.roll = (0, 0, 0), (0, 0, 0.10), 0
    root.use_deform = False
    for row, y in enumerate(yRows):
        for column, x in enumerate(xColumns):
            bone = armature.edit_bones.new(BoneName(row, column))
            bone.head, bone.tail, bone.roll = (x, y, 0), (x, y, 0.05), 0
            bone.parent, bone.use_connect, bone.use_deform = root, False, True
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.show_in_front = True
    armature.display_type = "STICK"
    mesh.parent = rig
    modifier = mesh.modifiers.new("Armature", "ARMATURE")
    modifier.object = rig
    groups = {BoneName(r, c): mesh.vertex_groups.new(name=BoneName(r, c)) for r in range(6) for c in range(4)}
    for vertex in mesh.data.vertices:
        for name, weight in BilinearWeights(vertex.co):
            if weight > 1e-12:
                groups[name].add([vertex.index], weight, "REPLACE")
    return rig


def CreateSockets(rig):
    specs = [("Socket_GripHeadL", "Blanket_CornerHeadL", (0.70, -0.95, 0)),
             ("Socket_GripHeadR", "Blanket_CornerHeadR", (-0.70, -0.95, 0)),
             ("Socket_BodyHead", "Blanket_Root", (0, -0.70, 0)),
             ("Socket_BodyPelvis", "Blanket_Root", (0, 0.05, 0))]
    sockets = []
    for name, parentName, position in specs:
        socket = bpy.data.objects.new(name, None)
        bpy.context.collection.objects.link(socket)
        socket.empty_display_type, socket.empty_display_size = "ARROWS", 0.07
        socket.parent, socket.parent_type, socket.parent_bone = rig, "BONE", parentName
        # Blender's bone-parent anchor is the tail. Invert the entire rest
        # anchor so that both the world position AND local Z-up are correct.
        bone = rig.data.bones[parentName]
        anchor = bone.matrix_local @ Matrix.Translation((0, bone.length, 0))
        socket.matrix_parent_inverse = anchor.inverted()
        socket.matrix_basis = Matrix.Translation(position)
        sockets.append(socket)
    bpy.context.view_layer.update()
    return sockets


def CreateMaterial():
    material = bpy.data.materials.new("Mat_SingleBlanket")
    material.use_nodes = True
    material.use_backface_culling = False
    material.surface_render_method = "DITHERED"
    material.alpha_threshold = 0.5
    tree = material.node_tree
    bsdf = tree.nodes.get("Principled BSDF")
    bsdf.inputs["Metallic"].default_value = 0
    bsdf.inputs["Roughness"].default_value = 0.90
    # glTF encodes sheen strength in its colour factor, rather than a separate
    # weight. Keep Blender and the exported MeshPhysicalMaterial consistent.
    bsdf.inputs["Sheen Weight"].default_value = 1.0
    bsdf.inputs["Sheen Tint"].default_value = (0.18, 0.18, 0.18, 1.0)
    bsdf.inputs["Sheen Roughness"].default_value = 0.85
    for channel in ("Base", "Normal", "Orm"):
        imagePath = projectDir / f"Texture/Texture_SingleBlanket{channel}.webp"
        if not imagePath.exists():
            raise FileNotFoundError(imagePath)
        image = bpy.data.images.load(str(imagePath), check_existing=True)
        image.colorspace_settings.name = "sRGB" if channel == "Base" else "Non-Color"
        image.pack()
        node = tree.nodes.new("ShaderNodeTexImage")
        node.name, node.image, node.extension = f"Texture_SingleBlanket{channel}", image, "EXTEND"
        if channel == "Base":
            tree.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
            clip = tree.nodes.new("ShaderNodeMath")
            clip.operation = "GREATER_THAN"
            clip.inputs[1].default_value = 0.5
            tree.links.new(node.outputs["Alpha"], clip.inputs[0])
            tree.links.new(clip.outputs[0], bsdf.inputs["Alpha"])
        elif channel == "Normal":
            normal = tree.nodes.new("ShaderNodeNormalMap")
            normal.inputs["Strength"].default_value = 0.45
            tree.links.new(node.outputs["Color"], normal.inputs["Color"])
            tree.links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])
        else:
            split = tree.nodes.new("ShaderNodeSeparateColor")
            tree.links.new(node.outputs["Color"], split.inputs["Color"])
            tree.links.new(split.outputs["Green"], bsdf.inputs["Roughness"])
            tree.links.new(split.outputs["Blue"], bsdf.inputs["Metallic"])
            group = bpy.data.node_groups.get("glTF Material Output")
            if group is None:
                group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
                group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
            output = tree.nodes.new("ShaderNodeGroup")
            output.node_tree = group
            tree.links.new(split.outputs["Red"], output.inputs["Occlusion"])
    return material


def RestTargets():
    return {BoneName(r, c): Vector((x, y, 0)) for r, y in enumerate(yRows) for c, x in enumerate(xColumns)}


def CreatePoses(mesh):
    rest = RestTargets()
    poses = {name: {n: v.copy() for n, v in rest.items()} for name in clipNames[:4]}
    def FoldProfile(centers, halfWidth, length):
        # Integrate a fabric tangent through loose rounded hairpin folds. The
        # positive rises keep successive panels in separate overlapping layers.
        samples, x, z = [], 0.0, 0.0
        count = 2049
        for index in range(count):
            coordinate = -1+2*index/(count-1)
            angle = 0.0
            for fold, center in enumerate(centers):
                t = min(1.0, max(0.0, (coordinate-center+halfWidth)/(2*halfWidth)))
                angle += (1 if fold % 2 == 0 else -1)*math.pi*t*t*(3-2*t)
            if index:
                x += math.cos(angle)*length/(count-1)
                z += math.sin(angle)*length/(count-1)
            samples.append((x, z))
        middle = (min(p[0] for p in samples)+max(p[0] for p in samples))/2
        def At(coordinate):
            phase = min(count-1, max(0.0, (coordinate+1)*(count-1)/2))
            lower = min(count-2, int(phase))
            amount = phase-lower
            a, b = samples[lower], samples[lower+1]
            return (a[0]*(1-amount)+b[0]*amount-middle, a[1]*(1-amount)+b[1]*amount)
        return At

    widthProfile = FoldProfile((-0.30, 0.38), 0.14, 1.40)
    lengthProfile = FoldProfile((-0.52, -0.01, 0.55), 0.085, 1.90)
    def FoldedSurface(u, v):
        du = u+0.09*math.sin(2.1*v+0.5*u)*(1-u*u)
        dv = v+0.08*math.sin(2.7*u-0.7*v)*(1-v*v)
        x, widthRise = widthProfile(du)
        y, lengthRise = lengthProfile(dv)
        twist = 0.65*math.sin(2.2*u)+0.65*v+0.22*math.sin(1.7*math.pi*v)
        return Vector((x*math.cos(twist)-y*math.sin(twist)+0.016*math.sin(3*v+u),
                       x*math.sin(twist)+y*math.cos(twist)+0.012*math.sin(4*u-v),
                       2.5*widthRise+0.45*lengthRise+0.035*math.sin(5*u+1.4*v)+
                       0.026*math.sin(4*v-u)-0.055*math.exp(-((u-0.92)/0.22)**2-((v+0.55)/0.45)**2)))
    for r in range(6):
        for c in range(4):
            name = BoneName(r, c)
            flat = poses["Blanket_Flat"][name]
            flat.z = 0.010 + 0.009*math.sin(r*1.7+c*2.0)
            drag = poses["Blanket_DragPose"][name]
            if r == 0:
                drag.z = 0.70 if c in (0, 3) else 0.36
                drag.y -= 0.20 if c in (0, 3) else 0.12
                if c in (0, 3):
                    drag.x -= math.copysign(0.15, drag.x)
            elif r == 1:
                drag.z = 0.15 + (0.08 if c in (0, 3) else 0)
            elif r in (2, 3) and c in (0, 3):
                drag.z = 0.08
            elif r in (2, 3):
                drag.z = 0.070 if r == 2 else 0.025
            if r == 5 and c in (0, 3):
                drag.y += 0.03
            released = poses["Blanket_Released"][name]
            released.x += 0.018*math.sin(r*2.1+c*1.8)
            released.y += 0.025*math.cos(r*1.4+c*2.3)
            released.z = 0.030*abs(math.sin(r*2.2+c*1.6))
            if r == 0 and c in (0, 3):
                released.z = 0
            poses["Blanket_Crumpled"][name] = FoldedSurface(rest[name].x/0.7, rest[name].y/0.95)
    deltas = []
    for vertex in mesh.data.vertices:
        cage = Vector((0, 0, 0))
        for name, weight in BilinearWeights(vertex.co):
            cage += weight*poses["Blanket_Crumpled"][name]
        desired = FoldedSurface(vertex.co.x/0.7, vertex.co.y/0.95)
        u, v = vertex.co.x/0.7, vertex.co.y/0.95
        desired.z += 0.0025*math.sin(9*u+2*v)*math.sin(11*v-1.3*u)
        deltas.append(desired-cage)
    finalPoints = []
    for vertex, delta in zip(mesh.data.vertices, deltas):
        point = delta.copy()
        for name, weight in BilinearWeights(vertex.co):
            point += weight*poses["Blanket_Crumpled"][name]
        finalPoints.append(point)
    low = Vector(tuple(min(v[k] for v in finalPoints) for k in range(3)))
    high = Vector(tuple(max(v[k] for v in finalPoints) for k in range(3)))
    scale = Vector((0.45/(high.x-low.x), 0.45/(high.y-low.y), 0.25/(high.z-low.z)))
    offset = Vector((-(high.x+low.x)*0.5*scale.x, -(high.y+low.y)*0.5*scale.y, -low.z*scale.z))
    for name, value in poses["Blanket_Crumpled"].items():
        poses["Blanket_Crumpled"][name] = Vector(tuple(value[k]*scale[k]+offset[k] for k in range(3)))
    key = mesh.data.shape_keys.key_blocks["Crumpled"]
    for vertex, delta in zip(mesh.data.vertices, deltas):
        key.data[vertex.index].co = vertex.co + Vector(tuple(delta[k]*scale[k] for k in range(3)))
    lift = {n: v.copy() for n, v in rest.items()}
    lift["Blanket_CornerHeadL"].z = lift["Blanket_CornerHeadR"].z = 0.8
    drape = {n: v.copy() for n, v in rest.items()}
    for r in range(6):
        for c in range(4):
            value = drape[BoneName(r, c)]
            if c in (0, 3):
                value.x = math.copysign(0.51+0.025*math.sin(r*1.7+c*0.6), value.x)
                value.y += 0.012*math.sin(r*1.9+c)
                value.z = 0.012+0.014*(0.5+0.5*math.sin(r*2.2+c*1.3))
            else:
                value.x = math.copysign(0.215, value.x)
                value.z = 0.160 if r in (0, 5) else 0.240+0.006*math.sin(r*1.4+c*0.8)
    poses["Test_LiftHeadCorners"], poses["Test_DrapeOverBody"] = lift, drape
    return poses


def ApplyTargets(rig, targets):
    for name, target in targets.items():
        bone = rig.data.bones[name]
        rig.pose.bones[name].location = bone.matrix_local.to_3x3().inverted() @ (target-bone.head_local)


def ActionCurves(action):
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                channelBag = strip.channelbag(slot, ensure=False)
                if channelBag:
                    yield from channelBag.fcurves


def CreateActions(rig, mesh, poses):
    keys = mesh.data.shape_keys
    actions, shapeActions = {}, {}
    for name in (*clipNames, "Test_LiftHeadCorners", "Test_DrapeOverBody"):
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        rig.animation_data_create().action = action
        shapeAction = None
        if name in clipNames:
            shapeAction = bpy.data.actions.new(name + "_Shape")
            shapeAction.use_fake_user = True
            keys.animation_data_create().action = shapeAction
        frames = range(1, 46) if name == "Blanket_Unfold" else (1,)
        for frame in frames:
            if name == "Blanket_Unfold":
                amount = (frame-1)/44
                targets = {}
                for r in range(6):
                    for c in range(4):
                        boneName = BoneName(r, c)
                        value = poses["Blanket_Crumpled"][boneName].lerp(poses["Blanket_Flat"][boneName], amount)
                        wave = math.sin(math.pi*amount)**1.7
                        value.z += wave*(0.64 if r == 0 and c in (0, 3) else 0.38)*(1-r/5)**1.7
                        value.y -= wave*0.08*(1-r/5)
                        targets[boneName] = value
                morph = (1-amount)**1.6
            else:
                targets, morph = poses[name], 1.0 if name == "Blanket_Crumpled" else 0.0
            ApplyTargets(rig, targets)
            for r in range(6):
                for c in range(4):
                    boneName = BoneName(r, c)
                    angleX, angleY = 0.0, 0.0
                    if name == "Test_DrapeOverBody":
                        angleY = math.copysign(math.radians(55 if c in (0, 3) else 5), xColumns[c])
                        if c in (1, 2) and r in (0, 5):
                            angleX = math.radians(50 if r == 0 else -50)
                    elif name == "Blanket_DragPose":
                        angleX = math.radians((-12, -12, -6, -2, 0, 0)[r])
                        if r in (1, 2, 3):
                            angleY = math.copysign(math.radians(8), xColumns[c])
                    restRotation = rig.data.bones[boneName].matrix_local.to_quaternion()
                    worldRotation = Euler((angleX, angleY, 0)).to_quaternion()
                    poseBone = rig.pose.bones[boneName]
                    poseBone.rotation_mode = "QUATERNION"
                    poseBone.rotation_quaternion = restRotation.inverted() @ worldRotation @ restRotation
            for boneName in targets:
                rig.pose.bones[boneName].keyframe_insert(data_path="location", frame=frame, group=boneName)
                rig.pose.bones[boneName].keyframe_insert(data_path="rotation_quaternion", frame=frame, group=boneName)
            if shapeAction:
                keys.key_blocks["Crumpled"].value = morph
                keys.key_blocks["Crumpled"].keyframe_insert(data_path="value", frame=frame)
        for curve in ActionCurves(action):
            for point in curve.keyframe_points:
                point.interpolation = "LINEAR"
        actions[name] = action
        if shapeAction:
            shapeActions[name] = shapeAction
    rig.animation_data.action = None
    keys.animation_data.action = None
    for name in clipNames:
        for data, action in ((rig, actions[name]), (keys, shapeActions[name])):
            track = data.animation_data.nla_tracks.new()
            track.name = name
            strip = track.strips.new(name, 1, action)
            strip.action_slot = action.slots[0]
            strip.extrapolation, strip.blend_type = "NOTHING", "REPLACE"
    ClearPose(rig, mesh)
    return actions, shapeActions


def ClearPose(rig, mesh):
    if rig.animation_data:
        rig.animation_data.action = None
        rig.animation_data.use_nla = False
    if mesh.data.shape_keys.animation_data:
        mesh.data.shape_keys.animation_data.action = None
        mesh.data.shape_keys.animation_data.use_nla = False
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    mesh.data.shape_keys.key_blocks["Crumpled"].value = 0
    bpy.context.view_layer.update()


def EvaluatedPoints(mesh):
    evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    data = evaluated.to_mesh()
    points = [evaluated.matrix_world @ v.co for v in data.vertices]
    evaluated.to_mesh_clear()
    return points


def CheckSource(rig, mesh, sockets, poses):
    ClearPose(rig, mesh)
    assert len(mesh.data.vertices) == (widthSegments+1)*(lengthSegments+1)
    assert len(mesh.data.polygons) == widthSegments*lengthSegments
    assert all(len(p.vertices) == 4 and p.area > 1e-8 and p.normal.z > 0.99 for p in mesh.data.polygons)
    edgeUses = {}
    for polygon in mesh.data.polygons:
        for edge in polygon.edge_keys:
            edgeUses[edge] = edgeUses.get(edge, 0)+1
    assert all(count in (1, 2) for count in edgeUses.values())
    assert sum(count == 1 for count in edgeUses.values()) == 2*(widthSegments+lengthSegments)
    assert len(mesh.data.vertices)-len(mesh.data.edges)+len(mesh.data.polygons) == 1
    edgeLengths = [(mesh.data.vertices[e.vertices[0]].co-mesh.data.vertices[e.vertices[1]].co).length for e in mesh.data.edges]
    topology = {"gridSegments": [widthSegments, lengthSegments],
                "boundaryEdges": sum(count == 1 for count in edgeUses.values()),
                "minQuadAreaM2": min(p.area for p in mesh.data.polygons),
                "minEdgeLengthM": min(edgeLengths), "maxEdgeLengthM": max(edgeLengths)}
    original = [v.co.copy() for v in mesh.data.vertices]
    evaluated = EvaluatedPoints(mesh)
    restError = max((a-b).length for a, b in zip(original, evaluated))
    assert restError < 0.0001, restError
    counts, sumError = {}, 0.0
    for vertex in mesh.data.vertices:
        weights = [g.weight for g in vertex.groups if g.weight > 1e-8]
        counts[str(len(weights))] = counts.get(str(len(weights)), 0)+1
        sumError = max(sumError, abs(sum(weights)-1))
        assert 1 <= len(weights) <= 4 and abs(sum(weights)-1) < 0.001
    boneName = "Blanket_CornerHeadL"
    targets = RestTargets()
    targets[boneName].z = 0.60
    ApplyTargets(rig, targets)
    bpy.context.view_layer.update()
    lifted = EvaluatedPoints(mesh)
    outsideError, interpolationError, affected = 0.0, 0.0, 0
    for vertex, before, after in zip(mesh.data.vertices, original, lifted):
        weight = dict(BilinearWeights(vertex.co)).get(boneName, 0)
        expected = before+Vector((0, 0, 0.60*weight))
        interpolationError = max(interpolationError, (after-expected).length)
        if weight > 1e-8:
            affected += 1
        else:
            outsideError = max(outsideError, (after-before).length)
    assert outsideError < 1e-7 and interpolationError < 1e-6
    grip = next(s for s in sockets if s.name == "Socket_GripHeadL")
    gripError = (grip.matrix_world.translation-Vector((0.70, -0.95, 0.60))).length
    assert gripError < 1e-6, gripError
    ClearPose(rig, mesh)
    socketReport = []
    for socket in sockets:
        socketReport.append({"name": socket.name, "parentBone": socket.parent_bone,
                             "positionBlender": list(socket.matrix_world.translation),
                             "matrixBasis": [list(row) for row in socket.matrix_basis],
                             "zAxisBlender": list(socket.matrix_world.to_3x3() @ Vector((0, 0, 1)))})
    ApplyTargets(rig, poses["Blanket_Crumpled"])
    mesh.data.shape_keys.key_blocks["Crumpled"].value = 1
    bpy.context.view_layer.update()
    crumpled = EvaluatedPoints(mesh)
    size = [max(p[k] for p in crumpled)-min(p[k] for p in crumpled) for k in range(3)]
    assert max(abs(a-b) for a, b in zip(size, (0.45, 0.45, 0.25))) < 1e-5, size
    ClearPose(rig, mesh)
    return {"restMaxDeviationM": restError, "weightSumMaxError": sumError,
            "nonzeroInfluences": counts, "liftHeadLHeightM": 0.60, "liftAffectedVertices": affected,
            "liftOutsideSupportMaxDeviationM": outsideError, "liftInterpolationMaxErrorM": interpolationError,
            "gripLiftMaxErrorM": gripError, "crumpledSizeM": size, "sockets": socketReport,
            "topology": topology}


def CanonicalizeGlb(path):
    raw = path.read_bytes()
    jsonLength = struct.unpack_from("<I", raw, 12)[0]
    document = json.loads(raw[20:20+jsonLength])
    binary = bytearray(raw[28+jsonLength:])
    # Blender 5.1 filters influences below 0.0001 before exporting. Preserve
    # the requested exact bilinear kernel instead of accepting that pruning.
    def AccessorLayout(index):
        accessor = document["accessors"][index]
        view = document["bufferViews"][accessor["bufferView"]]
        size = {5121: 1, 5123: 2, 5126: 4}[accessor["componentType"]]
        components = {"VEC3": 3, "VEC4": 4}[accessor["type"]]
        offset = view.get("byteOffset", 0)+accessor.get("byteOffset", 0)
        return accessor, offset, view.get("byteStride", size*components)
    meshNode = next(node for node in document["nodes"] if "mesh" in node)
    assert not any(key in meshNode for key in ("matrix", "translation", "rotation", "scale"))
    primitive = document["meshes"][meshNode["mesh"]]["primitives"][0]
    positionAccessor, positionOffset, positionStride = AccessorLayout(primitive["attributes"]["POSITION"])
    jointAccessor, jointOffset, jointStride = AccessorLayout(primitive["attributes"]["JOINTS_0"])
    weightAccessor, weightOffset, weightStride = AccessorLayout(primitive["attributes"]["WEIGHTS_0"])
    skin = document["skins"][meshNode["skin"]]
    jointNames = {document["nodes"][node]["name"]: index for index, node in enumerate(skin["joints"])}
    jointFormat = "<4"+{5121: "B", 5123: "H"}[jointAccessor["componentType"]]
    assert weightAccessor["componentType"] == 5126
    for index in range(positionAccessor["count"]):
        px, py, pz = struct.unpack_from("<3f", binary, positionOffset+index*positionStride)
        values = BilinearWeights(Vector((px, -pz, py)))
        struct.pack_into(jointFormat, binary, jointOffset+index*jointStride, *(jointNames[name] for name, _ in values))
        struct.pack_into("<4f", binary, weightOffset+index*weightStride, *(weight for _, weight in values))
    nodeNames = {i: node.get("name", "") for i, node in enumerate(document["nodes"])}
    for animation in document["animations"]:
        channels = [ch for ch in animation["channels"] if
                    (nodeNames[ch["target"]["node"]].startswith("Blanket_") and
                     nodeNames[ch["target"]["node"]] not in ("Blanket_Root", "Blanket_Rig") and
                     ch["target"]["path"] in ("translation", "rotation", "weights"))]
        used = sorted(set(ch["sampler"] for ch in channels))
        remap = {old: new for new, old in enumerate(used)}
        animation["samplers"] = [animation["samplers"][i] for i in used]
        animation["channels"] = channels
        for channel in channels:
            channel["sampler"] = remap[channel["sampler"]]
        if animation["name"] != "Blanket_Unfold":
            # NLA requires a positive strip length. Authoring has one keyed
            # frame; collapse the exporter's duplicated constant sample.
            for sampler in animation["samplers"]:
                inputAccessor = document["accessors"][sampler["input"]]
                outputAccessor = document["accessors"][sampler["output"]]
                inputAccessor["count"] = outputAccessor["count"] = 1
                inputAccessor["min"] = inputAccessor["max"] = [0.0]
                view = document["bufferViews"][inputAccessor["bufferView"]]
                offset = view.get("byteOffset", 0)+inputAccessor.get("byteOffset", 0)
                struct.pack_into("<f", binary, offset, 0.0)
    document["animations"].sort(key=lambda item: clipNames.index(item["name"]))
    encoded = json.dumps(document, separators=(",", ":"), ensure_ascii=True, sort_keys=True).encode()
    encoded += b" "*((-len(encoded)) % 4)
    binary += b"\0"*((-len(binary)) % 4)
    totalLength = 12+8+len(encoded)+8+len(binary)
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, totalLength)+struct.pack("<I4s", len(encoded), b"JSON")+
                     encoded+struct.pack("<I4s", len(binary), b"BIN\0")+binary)
    return document


def Export(rig, mesh, sockets, path):
    ClearPose(rig, mesh)
    rig.animation_data.use_nla = True
    mesh.data.shape_keys.animation_data.use_nla = True
    bpy.context.scene.frame_set(0)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in (rig, mesh, *sockets):
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
        export_yup=True, export_apply=False, export_texcoords=True, export_normals=True,
        export_tangents=True, export_image_format="WEBP", export_image_quality=100,
        export_materials="EXPORT", export_animations=True, export_animation_mode="NLA_TRACKS",
        export_frame_range=False, export_frame_step=1, export_force_sampling=True,
        export_anim_slide_to_zero=True, export_rest_position_armature=True,
        export_optimize_animation_size=False, export_def_bones=False,
        export_skins=True, export_all_influences=False, export_morph=True, export_morph_normal=True,
        export_morph_animation=True, export_draco_mesh_compression_enable=False, export_extras=False)
    ClearPose(rig, mesh)
    return CanonicalizeGlb(path)


def SimulationMetadata(path, document):
    """Exported vertex indices and rest offsets for future runtime corner pins."""
    raw = path.read_bytes()
    jsonLength = struct.unpack_from("<I", raw, 12)[0]
    binary = raw[28+jsonLength:]
    primitive = document["meshes"][0]["primitives"][0]
    accessor = document["accessors"][primitive["attributes"]["POSITION"]]
    view = document["bufferViews"][accessor["bufferView"]]
    offset = view.get("byteOffset", 0)+accessor.get("byteOffset", 0)
    stride = view.get("byteStride", 12)
    points = [Vector(struct.unpack_from("<3f", binary, offset+i*stride)) for i in range(accessor["count"])]
    assert len(set(tuple(p) for p in points)) == len(points), "Simulation surface must share vertices"
    pins = []
    for socket, position in [("Socket_GripHeadL", (0.70, 0, 0.95)),
                             ("Socket_GripHeadR", (-0.70, 0, 0.95))]:
        target = Vector(position)
        index = min(range(len(points)), key=lambda i: (points[i]-target).length_squared)
        pins.append({"socket": socket, "vertexGlb": index, "restOffsetGltfM": list(points[index]-target)})
    return {"gridSegments": [widthSegments, lengthSegments],
            "nominalCellSizeM": [1.40/widthSegments, 1.90/lengthSegments],
            "welded": True, "initialPose": "Rest", "cornerPins": pins,
            "note": "Read structural/bending connectivity from the GLB index buffer; runtime solver is not included. Reset morph and animation before simulation, then apply pins in the same world space."}


def CheckRoundTrip(path, originalPoints):
    originalScene = bpy.context.window.scene
    originalData = {name: set(getattr(bpy.data, name)) for name in ("objects", "actions", "meshes", "armatures", "materials", "images")}
    scene = bpy.data.scenes.new("SingleBlanket_RoundTripCheck")
    bpy.context.window.scene = scene
    bpy.ops.import_scene.gltf(filepath=str(path))
    mesh = next(o for o in scene.objects if o.type == "MESH")
    rig = next(o for o in scene.objects if o.type == "ARMATURE")
    if rig.animation_data:
        rig.animation_data.action = None
        rig.animation_data.use_nla = False
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    if mesh.data.shape_keys:
        if mesh.data.shape_keys.animation_data:
            mesh.data.shape_keys.animation_data.action = None
            mesh.data.shape_keys.animation_data.use_nla = False
        for key in mesh.data.shape_keys.key_blocks:
            key.value = 0
    scene.frame_set(0)
    bpy.context.view_layer.update()
    tree = KDTree(len(originalPoints))
    for index, point in enumerate(originalPoints):
        tree.insert(point, index)
    tree.balance()
    evaluated = EvaluatedPoints(mesh)
    error = max(tree.find(point)[2] for point in evaluated)
    skinError = max((a-b).length for a, b in zip(evaluated, [mesh.matrix_world @ v.co for v in mesh.data.vertices]))
    assert error < 0.001 and skinError < 0.001, (error, skinError)
    result = {"roundTripMaxDeviationM": error, "roundTripSkinMaxDeviationM": skinError,
              "roundTripVertexCount": len(evaluated), "roundTripBoneCount": len(rig.data.bones)}
    bpy.context.window.scene = originalScene
    for name in originalData:
        collection = getattr(bpy.data, name)
        for item in set(collection)-originalData[name]:
            collection.remove(item, do_unlink=True)
    bpy.data.scenes.remove(scene)
    return result


def CreateProxy():
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.025, 0.11))
    proxy = bpy.context.object
    proxy.name, proxy.dimensions = "Ref_BodyProxy", (0.45, 1.65, 0.22)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    proxy.hide_render = True
    proxy.hide_set(True)
    return proxy


def Main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=projectDir / "Model")
    parser.add_argument("--no-save-blend", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    assert bpy.app.version[:2] == (5, 1), bpy.app.version_string
    if bpy.data.filepath and sourceDir not in Path(bpy.data.filepath).parents:
        raise RuntimeError("Refusing to overwrite a Blender file belonging to another task")
    # Keep the MCP execution context and user preferences intact. This task's
    # own scene/data are cleared explicitly instead of reloading the UI file.
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for collection in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials,
                       bpy.data.images, bpy.data.actions, bpy.data.node_groups):
        for block in list(collection):
            collection.remove(block, do_unlink=True)
    scene = bpy.context.scene
    scene.unit_settings.system, scene.unit_settings.scale_length = "METRIC", 1.0
    scene.unit_settings.length_unit = "METERS"
    scene.render.fps, scene.frame_start, scene.frame_end = 30, 1, 45
    mesh = CreateMesh()
    rig = CreateRig(mesh)
    sockets = CreateSockets(rig)
    mesh.data.materials.append(CreateMaterial())
    poses = CreatePoses(mesh)
    actions, shapeActions = CreateActions(rig, mesh, poses)
    checks = CheckSource(rig, mesh, sockets, poses)
    originalPoints = [v.co.copy() for v in mesh.data.vertices]
    path = args.output_dir / "Model_SingleBlanket.glb"
    document = Export(rig, mesh, sockets, path)
    assert len(document["skins"]) == 1 and len(document["skins"][0]["joints"]) == 25
    assert "inverseBindMatrices" in document["skins"][0]
    assert [a["name"] for a in document["animations"]] == list(clipNames)
    assert len(document["meshes"][0]["primitives"][0]["targets"]) == 1
    assert document["materials"][0]["alphaMode"] == "MASK"
    checks.update(CheckRoundTrip(path, originalPoints))
    CreateProxy()
    rig.animation_data.use_nla = True
    mesh.data.shape_keys.animation_data.use_nla = True
    scene.frame_set(0)
    sourceDir.mkdir(parents=True, exist_ok=True)
    if not args.no_save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=str(sourceDir / "Scene_SingleBlanket.blend"), compress=True)
    report = {"asset": "SingleBlanket", "blenderVersion": bpy.app.version_string,
        "seed": 19380317, "vertices": len(mesh.data.vertices), "quads": len(mesh.data.polygons),
        "simulationMesh": SimulationMetadata(path, document),
        "triangles": sum(len(p.vertices)-2 for p in mesh.data.polygons), "bones": [
            {"name": b.name, "headBlender": list(b.head_local), "tailBlender": list(b.tail_local),
             "parent": b.parent.name if b.parent else None, "deform": b.use_deform, "connected": b.use_connect}
            for b in rig.data.bones], "checks": checks,
        "animations": [{"name": n, "authoredFrames": 45 if n == "Blanket_Unfold" else 1,
                        "fps": 30, "durationS": 44/30 if n == "Blanket_Unfold" else 0} for n in clipNames],
        "testActionsBlendOnly": ["Test_LiftHeadCorners", "Test_DrapeOverBody"],
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size,
        "sourceBlend": str(sourceDir / "Scene_SingleBlanket.blend"),
        "coordinates": "Blender (x,y,z) -> glTF (x,z,-y); head -Y -> +Z; L=+X",
        "reconstructionScope": "User-approved five crude patches, gray-white plain cotton, aging, dimensions and dragging poses are artistic reconstruction; not a documented standardized 1938 issue pattern",
        "historicalReferences": [{"url": "https://www.chinanews.com/cul/2014/09-03/6558063.shtml",
            "scope": "2014 museum interview lists one single blanket and one straw mat; does not establish this sheet's color, size, patches or dragging use"}]}
    Dump(args.output_dir / "Data_SingleBlanket.json", report)
    print("SINGLE_BLANKET_BAKE " + json.dumps({k: report[k] for k in ("vertices", "quads", "triangles", "checks", "sha256", "bytes")}))


if __name__ == "__main__":
    Main()
