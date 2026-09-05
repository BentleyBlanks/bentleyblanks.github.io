"""Refine the dedicated FPS hand mesh and its rest joints together via Blender MCP.

The shared third-person character is read-only. Rebuild from it on every bake;
never repeatedly shorten an already refined GLB.
"""
import bpy
import importlib.util
import json
from pathlib import Path

projectRoot = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('FpsSourceBake', Path(__file__).with_name('Script_BakeNraFpsArms.py'))
sourceBake = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sourceBake)
bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
bpy.ops.import_scene.gltf(filepath=str(projectRoot/'Model/Character/Model_LugouNra01.glb'))
rig, meshes = sourceBake.FindSource()
prepared = sourceBake.Prepare(rig, meshes)
meshes = prepared['meshes']
rig.data.pose_position = 'REST'
bpy.context.view_layer.update()

def FindBone(side, suffix):
    return next(b for b in rig.data.bones if sourceBake.NormalizeName(b.name).endswith(side+suffix))

# A continuous, piecewise anatomical remap preserves the wrist seam. Finger
# length changes begin at the knuckles; width grows gently away from the wrist.
frames = {}
for side in ('r', 'l'):
    hand = rig.matrix_world @ FindBone(side, 'hand').head_local
    middle = rig.matrix_world @ FindBone(side, 'finger2').head_local
    index = rig.matrix_world @ FindBone(side, 'finger1').head_local
    little = rig.matrix_world @ FindBone(side, 'finger4').head_local
    forward = (middle-hand).normalized()
    across = (index-little).normalized()
    across = (across-forward*across.dot(forward)).normalized()
    frames[side] = (hand, forward, across, (middle-hand).length)

def Remap(point, side):
    hand, forward, across, palmLength = frames[side]
    offset = point-hand
    longitudinal = offset.dot(forward)
    if longitudinal <= 0:
        return point.copy()
    shortened = min(longitudinal, palmLength)*0.82 + max(0, longitudinal-palmLength)*0.78
    widthBlend = min(1, longitudinal/(palmLength*0.7))
    return point + forward*(shortened-longitudinal) + across*(offset.dot(across)*0.08*widthBlend)

for mesh in meshes:
    inverse = mesh.matrix_world.inverted()
    for vertex in mesh.data.vertices:
        sideWeights = {'r':0.0, 'l':0.0}
        for assignment in vertex.groups:
            name = sourceBake.NormalizeName(mesh.vertex_groups[assignment.group].name)
            for side in sideWeights:
                if side+'hand' in name or side+'finger' in name:
                    sideWeights[side] += assignment.weight
        side = max(sideWeights, key=sideWeights.get)
        if sideWeights[side] < 0.001:
            continue
        point = mesh.matrix_world @ vertex.co
        vertex.co = inverse @ (point + (Remap(point, side)-point)*min(1, sideWeights[side]))
    mesh.data.update()

    # Let the wrist skin and cuff travel with the hand. The FPS rig has longer
    # fixed forearms than the source actor; old forearm blends stretched the
    # exposed palm heel when that adapter moved the wrist forward.
    for side in ('r','l'):
        hand, forward, across, palmLength = frames[side]
        handGroup = mesh.vertex_groups.get(FindBone(side,'hand').name)
        forearmGroup = mesh.vertex_groups.get(FindBone(side,'forearm').name)
        if not handGroup or not forearmGroup:
            continue
        for vertex in mesh.data.vertices:
            weights = {item.group:item.weight for item in vertex.groups}
            forearmWeight = weights.get(forearmGroup.index,0)
            if forearmWeight <= 0:
                continue
            longitudinal = ((mesh.matrix_world @ vertex.co)-hand).dot(forward)
            blend = max(0,min(1,(longitudinal/palmLength+0.7)/0.6))
            blend = blend*blend*(3-2*blend)
            transfer = forearmWeight*blend
            if transfer <= 0:
                continue
            forearmGroup.add([vertex.index],forearmWeight-transfer,'REPLACE')
            handGroup.add([vertex.index],weights.get(handGroup.index,0)+transfer,'REPLACE')

# Keep every bind orientation and unit scale. Move the joint pivots with the
# skin; scaling pose bones would distort finger thickness during flexion.
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
inverse = rig.matrix_world.inverted()
bpy.ops.object.mode_set(mode='EDIT')
for bone in rig.data.edit_bones:
    name = sourceBake.NormalizeName(bone.name)
    side = next((s for s in ('r','l') if s+'finger' in name), None)
    if side:
        delta = inverse @ Remap(rig.matrix_world @ bone.head, side)-bone.head
        bone.head += delta
        bone.tail += delta
bpy.ops.object.mode_set(mode='OBJECT')
rig.data.pose_position = 'POSE'
rig['fpsHandProportions'] = json.dumps({'palmLength':0.82,'fingerLength':0.78,'palmWidth':1.08})
output = projectRoot/'Model/Model_FpsArmsNraSkeletal01.glb'
sourceBake.Export(output, rig, meshes)
rig.data.pose_position = 'REST'
for image in bpy.data.images:
    if image.source == 'FILE' and image.has_data:
        image.pack()
sourceDirectory = Path.home()/'OneDrive/AI/Models/Blender/Taierzhuang1938/FirstPersonHands'
sourceDirectory.mkdir(parents=True, exist_ok=True)
blendPath = sourceDirectory/'Animation_FirstPersonHands.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blendPath))
result = {'output':str(output),'blend':str(blendPath),'proportions':json.loads(rig['fpsHandProportions']), 'vertices':sum(len(m.data.vertices) for m in meshes)}
