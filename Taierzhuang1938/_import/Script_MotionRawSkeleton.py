"""Editable original GVHMR rig and visible joint/edge GLB, without pose correction."""
from pathlib import Path
import argparse, json, sys
import bpy, numpy as np
from mathutils import Matrix, Vector

parser = argparse.ArgumentParser()
parser.add_argument('--root',type=Path,required=True)
parser.add_argument('--raw',type=Path,required=True,help='Raw joint JSON, relative to root')
parser.add_argument('--name',required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
raw = json.loads((args.root/args.raw).read_text(encoding='utf-8'))
data = np.load(args.root/raw['sourceCache'])
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'Scene_'+args.name+'RawRecovery'
scene.render.fps = round(raw['fps'])
scene.frame_start = 1
scene.frame_end = len(raw['positions'])
conversion = Matrix(((1,0,0),(0,0,-1),(0,1,0)))
heading = Matrix.Rotation(raw['viewerYawRadians'],3,'Z')
# Viewer uses Y-up yaw; after Y-up -> Z-up conversion its sign is unchanged.
transform = heading@conversion
origin = transform@Vector(raw['viewerOrigin'])
rest = [conversion@Vector(p) for p in data['worldRestJoints'].mean(0)]
parents = raw['parents']
names = raw['jointNames']
rigData = bpy.data.armatures.new('Rig_'+args.name+'Raw')
rig = bpy.data.objects.new(rigData.name,rigData)
scene.collection.objects.link(rig)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
for j,name in enumerate(names):
    bone = rigData.edit_bones.new(name)
    bone.head = rest[j]
    child = next((k for k,p in enumerate(parents) if p == j),None)
    bone.tail = rest[child] if child is not None else rest[j]+Vector((0,0,.07))
    if (bone.tail-bone.head).length < .001: bone.tail=bone.head+Vector((0,0,.07))
    if parents[j] >= 0: bone.parent=rigData.edit_bones[names[parents[j]]]
    bone.use_connect = False
bpy.ops.object.mode_set(mode='OBJECT')
rig.show_in_front = True
restMatrices = {b.name:b.matrix_local.copy() for b in rigData.bones}
materials = []
for label,color in [('Center',(.7,.75,.62,1)),('Left',(.2,.7,.8,1)),('Right',(.95,.5,.2,1))]:
    mat = bpy.data.materials.new('Material_Raw'+label)
    mat.diffuse_color=color
    mat.use_nodes=True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=color
    materials.append(mat)
left={1,4,7,10,13,16,18,20}
right={2,5,8,11,14,17,19,21}
edges=[]
for j,name in enumerate(names):
    material=materials[1 if j in left else 2 if j in right else 0]
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10,ring_count=6,radius=.022,location=rest[j])
    marker=bpy.context.object
    marker.name='Joint_'+name
    bpy.ops.object.transform_apply(location=True,rotation=False,scale=False)
    group=marker.vertex_groups.new(name=name)
    group.add(list(range(len(marker.data.vertices))),1,'REPLACE')
    modifier=marker.modifiers.new('RawSkeleton','ARMATURE')
    modifier.object=rig
    marker.parent=rig
    marker.data.materials.append(material)
    if parents[j]>=0:
        bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.012,depth=1)
        edge=bpy.context.object
        edge.name='BoneLink_'+name
        edge.rotation_mode='QUATERNION'
        edge.data.materials.append(material)
        edges.append((parents[j],j,edge))
action=bpy.data.actions.new('Animation_'+args.name+'RawRecovery_V1')
action.use_fake_user=True
rig.animation_data_create()
rig.animation_data.action=action
previous={}
maxError=0
for i,frame in enumerate(raw['positions']):
    positions=[transform@Vector(p)-origin for p in frame]
    desired={}
    for j,name in enumerate(names):
        bone=rig.pose.bones[name]
        bone.rotation_mode='QUATERNION'
        rotation=transform@Matrix(data['worldGlobalRotations'][i,j].tolist())@conversion.transposed()
        matrix=rotation.to_4x4()@restMatrices[name]
        matrix.translation=positions[j]
        desired[name]=matrix
        parent=bone.parent
        bone.matrix_basis=bone.bone.convert_local_to_pose(matrix,bone.bone.matrix_local,
            parent_matrix=desired[parent.name] if parent else Matrix.Identity(4),
            parent_matrix_local=parent.bone.matrix_local if parent else Matrix.Identity(4),invert=True)
        if name in previous and bone.rotation_quaternion.dot(previous[name])<0: bone.rotation_quaternion.negate()
        previous[name]=bone.rotation_quaternion.copy()
        bone.keyframe_insert(data_path='location',frame=i+1)
        bone.keyframe_insert(data_path='rotation_quaternion',frame=i+1)
    for a,b,edge in edges:
        delta=positions[b]-positions[a]
        edge.location=(positions[a]+positions[b])*.5
        edge.rotation_quaternion=Vector((0,0,1)).rotation_difference(delta)
        edge.scale=(1,1,delta.length)
        for prop in ['location','rotation_quaternion','scale']: edge.keyframe_insert(data_path=prop,frame=i+1)
    bpy.context.view_layer.update()
    maxError=max(maxError,max((rig.pose.bones[name].matrix.translation-positions[j]).length for j,name in enumerate(names)))
assert maxError<.00001,maxError
for item in bpy.data.actions:
    for layer in item.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points: key.interpolation='LINEAR'
scene['sourceCache']=raw['sourceCache']
scene['sourceCacheSha256']=raw['sourceCacheSha256']
scene['stage']='Unaltered GVHMR joints, only viewing coordinates; no retarget/filter/ground correction'
scene.frame_set(1)
bpy.ops.object.select_all(action='SELECT')
out=args.root/'Models/RecoveryPreview'
blendOut=args.root/'Blender/RawRecovery'
blendOut.mkdir(parents=True,exist_ok=True)
glb=out/('Animation_'+args.name+'RawRecovery_V1.glb')
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,
    export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name=action.name,
    export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True,export_skins=True,export_yup=True,export_extras=True)
blend=blendOut/('Scene_'+args.name+'RawRecovery_V1.blend')
bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
(out/('Data_'+args.name+'RawRigValidation.json')).write_text(json.dumps({'frames':scene.frame_end,'maxJointPositionErrorMeters':maxError,'sourceCacheSha256':raw['sourceCacheSha256'],'glb':glb.relative_to(args.root).as_posix(),'blend':blend.relative_to(args.root).as_posix()},indent=2),encoding='utf-8')
print('Raw rig verified',maxError,flush=True)
