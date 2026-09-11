"""Add the evaluated production arms and sword to the one-stroke MCP source.
Run Script_DadaoSwingTest.mjs --export-source first. This exports only Light's
evaluation of the shared curve; no new runtime clip is created.
"""
from pathlib import Path
import bpy, json, base64, struct, math
from mathutils import Matrix, Vector
root=Path(globals()['DADAO_PROJECT_ROOT'])
assert Path(bpy.data.filepath).parent.name=='DadaoPowerSwing_20260912'
scene=bpy.context.scene
data=json.loads((root/'_shots/DadaoPower/Acceptance/Data_DadaoSourceBake.json').read_text())
convert=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
arm=bpy.data.objects.get('Model_DadaoSwingArms')
if arm is None:
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(root/'Model/Model_FpsArmsNraSkeletal01.glb'))
    imported=set(bpy.data.objects)-before
    arm=next(o for o in imported if o.type=='ARMATURE')
    arm.name='Model_DadaoSwingArms'
arm.animation_data_clear()
for action in list(bpy.data.actions):
    if action.name.startswith('Animation_DadaoEvaluatedArms') and action.users==0:bpy.data.actions.remove(action)
for bone in arm.pose.bones:bone.rotation_mode='QUATERNION'
normalize=lambda name:''.join(c for c in name.lower() if c.isalnum())
bones={normalize(b.name):b for b in arm.pose.bones}
assert all(normalize(name) in bones for name in data['boneNames'])
inverse=arm.matrix_world.inverted()

weapon=bpy.data.objects.get('Model_DadaoSwingWeapon')
if weapon is None:
    weapon=bpy.data.objects.new('Model_DadaoSwingWeapon',None);scene.collection.objects.link(weapon)
    asset=json.loads((root/'Model/Model_Dadao.tzm.json').read_text())
    exec(compile((root/'_blender/Script_MeleeWeaponMaterials.py').read_text(), 'Script_MeleeWeaponMaterials.py','exec'))
    def Decode(text,code):
        binary=base64.b64decode(text);return struct.unpack('<'+code*(len(binary)//struct.calcsize(code)),binary)
    for block in asset['meshes']:
        positions=Decode(block['pos'],'H');uvValues=Decode(block['uv'],'H');normals=Decode(block['nrm'],'b')
        indices=Decode(block['idx'],'I' if block['idxBits']==32 else 'H')
        vertices=[[block['posMin'][j]+positions[i*3+j]*block['posScale'][j] for j in range(3)] for i in range(block['count'])]
        uvs=[[block['uvMin'][j]+uvValues[i*2+j]*block['uvScale'][j] for j in range(2)] for i in range(block['count'])]
        normals=[Vector(normals[i:i+3]).normalized() for i in range(0,len(normals),3)]
        mesh=bpy.data.meshes.new('Model_DadaoBlade');mesh.from_pydata(vertices,[],[indices[i:i+3] for i in range(0,len(indices),3)]);mesh.update()
        SetMeleeMeshSurface(mesh,uvs,normals);mesh.materials.append(MeleeDadaoMaterial(root))
        obj=bpy.data.objects.new(mesh.name,mesh);scene.collection.objects.link(obj);obj.parent=weapon
weapon.animation_data_clear();weapon.rotation_mode='QUATERNION'
for action in list(bpy.data.actions):
    if action.name.startswith('Animation_DadaoEvaluatedWeapon') and action.users==0:bpy.data.actions.remove(action)
ReadMatrix=lambda values:Matrix([values[i::4] for i in range(4)])
# Preserve the game's fixed XY/Z viewmodel compensation on a separate parent.
# Baking that nonuniform scale together with rotation would discard its shear
# when Blender decomposes the weapon into location/quaternion/scale channels.
first=ReadMatrix(data['frames'][0]['weapon']).to_3x3()
gram=first@first.transposed()
viewScale=[math.sqrt(gram[i][i]) for i in range(3)]
carrier=bpy.data.objects.get('Scene_DadaoViewmodelScale')
if carrier is None:
    carrier=bpy.data.objects.new('Scene_DadaoViewmodelScale',None);scene.collection.objects.link(carrier)
carrier.matrix_world=convert@Matrix.Diagonal((*viewScale,1))
weapon.parent=carrier;weapon.matrix_parent_inverse=Matrix.Identity(4)
bpy.context.view_layer.update()
for index,entry in enumerate(data['frames']):
    scene.frame_set(index+1)
    for name,values in zip(data['boneNames'],entry['bones']):
        bone=bones[normalize(name)];bone.matrix=inverse@convert@ReadMatrix(values)
        bpy.context.view_layer.update()
        for channel in ['location','rotation_quaternion','scale']:bone.keyframe_insert(channel,frame=index+1)
    weapon.matrix_world=convert@ReadMatrix(entry['weapon'])
    for channel in ['location','rotation_quaternion','scale']:weapon.keyframe_insert(channel,frame=index+1)
arm.animation_data.action.name='Animation_DadaoEvaluatedArms'
weapon.animation_data.action.name='Animation_DadaoEvaluatedWeapon'
scene.render.fps=120;scene.render.fps_base=0.65
scene.frame_start=1;scene.frame_end=121
camera=bpy.data.objects['Camera'];camera.matrix_world=convert
camera.data.type='PERSP';camera.data.lens=36/(2*(1280/720)*math.tan(math.radians(55)/2));camera.data.clip_start=.01;scene.camera=camera
scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.render.engine='CYCLES';scene.cycles.samples=16
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.18,.22,.28,1)
for name,location,energy,size in [('Scene_DadaoKey',(-2,-2,3),450,3),('Scene_DadaoFill',(2,0,2),250,3)]:
    obj=bpy.data.objects.get(name)
    if not obj:
        lamp=bpy.data.lights.new(name,'AREA');obj=bpy.data.objects.new(name,lamp);scene.collection.objects.link(obj)
    obj.location=location;obj.data.energy=energy;obj.data.shape='DISK';obj.data.size=size
    obj.rotation_euler=(Vector((0,.5,0))-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.data.objects['Cube'].hide_render=True;bpy.data.objects['Cube'].hide_set(True)
for image in bpy.data.images:
    if image.source=='FILE' and image.has_data and not image.packed_file:image.pack()
for obj in [arm,weapon]:
    for layer in obj.animation_data.action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:key.interpolation='LINEAR'
text=bpy.data.texts.get('Script_DadaoSwingStudio.py') or bpy.data.texts.new('Script_DadaoSwingStudio.py')
text.clear();text.write((root/'_blender/Script_DadaoSwingStudio.py').read_text(encoding='utf-8'))
scene.frame_set(43)
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath,compress=True)
result={'source':bpy.data.filepath,'bones':len(bones),'evaluatedFrames':len(data['frames']),'packedImages':sum(bool(i.packed_file) for i in bpy.data.images)}
