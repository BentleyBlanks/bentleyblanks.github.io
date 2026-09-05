"""Blender MCP authoring: derive owner body and anatomical hand frames from NRA01.

Run in the task's isolated Blender background process. Never opens or edits the
interactive artist scene. The shipped character and its third-person clips stay intact.
"""
from pathlib import Path
import bpy
import json
import math
import bmesh
from mathutils import Matrix, Vector

root = Path(__file__).resolve().parents[2]
output = root / 'Taierzhuang1938/Animation/FirstPerson'
output.mkdir(parents=True, exist_ok=True)
sourceDirectory = Path.home() / 'OneDrive/AI/Models/Blender/Taierzhuang1938/FirstPersonBody'
sourceDirectory.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
bpy.ops.import_scene.gltf(filepath=str(root/'Taierzhuang1938/Model/Character/Model_LugouNra01.glb'))
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
body = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith('John_Body'))
for obj in bpy.context.scene.objects:
    if obj.animation_data: obj.animation_data_clear()
for bone in arm.pose.bones: bone.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()
report = {'bones': {}, 'bounds': [list(body.matrix_world @ v.co) for v in list(body.data.vertices)[::300]]}
for bone in arm.pose.bones:
    if any(p in bone.name for p in ['Hand','Forearm','UpperArm','Finger','Pelvis','Spine','Thigh','Foot']):
        world = arm.matrix_world @ bone.matrix
        report['bones'][bone.name] = {'head':list(world.translation), 'matrix':[list(row) for row in world], 'localQuaternion': list(bone.bone.matrix_local.to_quaternion())}
(output/'Data_FirstPersonSource.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
# Owner body: retain the jacket below the collar, trousers and shoes. Exclude
# arms/head by actual skin ownership, not object visibility (one source mesh).
armGroups = {g.index for g in body.vertex_groups if any(word in g.name for word in ['Clavicle','UpperArm','Forearm','Hand','Finger','Head','Neck'])}
remove = {v.index for v in body.data.vertices if (body.matrix_world @ v.co).z > 1.425 or sum(g.weight for g in v.groups if g.group in armGroups) > 0.12}
bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index in remove], context='VERTS')
bm.to_mesh(body.data); bm.free(); body.data.update()
body.name = 'Model_FirstPersonBody'
for obj in list(bpy.context.scene.objects):
    if obj.type == 'MESH' and obj != body: bpy.data.objects.remove(obj, do_unlink=True)
for material in body.data.materials:
    if material and material.use_nodes:
        for node in material.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                for link in list(node.inputs['Metallic'].links): material.node_tree.links.remove(link)
                node.inputs['Metallic'].default_value = 0
                node.inputs['Roughness'].default_value = 0.85
rest = {b.name:(arm.matrix_world @ b.matrix).copy() for b in arm.pose.bones}
head = {name:m.translation.copy() for name,m in rest.items()}
inverse = arm.matrix_world.inverted()
def Put(name, point, rotation):
    world = rotation @ rest[name]; world.translation = point
    arm.pose.bones[name].matrix = inverse @ world
    bpy.context.view_layer.update()
def Aim(name, child, point, target):
    rotation = (head[child]-head[name]).rotation_difference(target-point).to_matrix().to_4x4()
    Put(name, point, rotation)
def Pose(mode, phase):
    for bone in arm.pose.bones: bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    pelvis = head['Bip002 Pelvis'].copy()
    moving = mode in ['Walk','Run']
    theta = phase * math.tau
    pelvis.z -= 0.30 if mode == 'Crouch' else 0.04 if moving else 0
    if moving: pelvis.z += 0.012 * math.cos(theta*2)
    if mode == 'Prone':
        pelvis.z = 0.23
        turn = Matrix.Rotation(math.pi/2,4,'X')
        for name in rest:
            if name == 'Bip002' or name == 'GroundRoot': continue
            Put(name,pelvis+turn.to_3x3()@(head[name]-head['Bip002 Pelvis']),turn)
        return
    shift = pelvis-head['Bip002 Pelvis']
    for part in ['Pelvis','Spine','Spine1','Spine2','Neck','Head']:
        name='Bip002 '+part
        if name in rest: Put(name,head[name]+shift,Matrix.Identity(4))
    for side in ['L','R']:
        names=['Bip002 '+side+' '+part for part in ['Thigh','Calf','Foot','Toe0']]
        hip=head[names[0]]+shift
        ankle=head[names[2]].copy()
        t=theta+(0 if side=='L' else math.pi)
        if moving:
            ankle.y += math.sin(t)*(0.22 if mode=='Run' else 0.16)
            ankle.z += max(0,math.cos(t))*(0.13 if mode=='Run' else 0.06)
        upper=(head[names[1]]-head[names[0]]).length
        lower=(head[names[2]]-head[names[1]]).length
        delta=ankle-hip; distance=min(delta.length,upper+lower-0.002); direction=delta.normalized()
        along=(upper*upper-lower*lower+distance*distance)/(2*distance)
        pole=Vector((0,-1,0)); pole=(pole-direction*pole.dot(direction)).normalized()
        knee=hip+direction*along+pole*math.sqrt(max(0,upper*upper-along*along))
        Aim(names[0],names[1],hip,knee); Aim(names[1],names[2],knee,ankle)
        Put(names[2],ankle,Matrix.Identity(4))
        Put(names[3],ankle+head[names[3]]-head[names[2]],Matrix.Identity(4))
bpy.context.scene.render.fps=30
bpy.context.scene.frame_start=0; bpy.context.scene.frame_end=30
arm.animation_data_create()
for mode in ['Idle','Walk','Run','Crouch','Prone']:
    action=bpy.data.actions.new('FirstPerson'+mode)
    arm.animation_data.action=action
    for frame in range(31):
        Pose(mode,frame/30)
        for bone in arm.pose.bones:
            bone.rotation_mode='QUATERNION'
            bone.keyframe_insert(data_path='location',frame=frame)
            bone.keyframe_insert(data_path='rotation_quaternion',frame=frame)
            bone.keyframe_insert(data_path='scale',frame=frame)
    track=arm.animation_data.nla_tracks.new(); track.name=action.name
    strip=track.strips.new(action.name,0,action); strip.action_frame_start=0; strip.action_frame_end=30
    track.mute=True
arm.animation_data.action=None
Pose('Idle',0)
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
    if obj == body or obj == arm or obj.type == 'EMPTY': obj.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(root/'Taierzhuang1938/Model/Model_FirstPersonBody.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_skins=True,export_yup=True)
bpy.context.scene.name = 'Scene_FirstPerson'
for image in bpy.data.images:
    if image.source=='FILE' and image.has_data and not image.packed_file: image.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(sourceDirectory/'Animation_FirstPersonBody.blend'))
