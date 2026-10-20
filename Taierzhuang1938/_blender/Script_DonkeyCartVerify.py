"""Reimport the actual packed GLB, inspect its skins, render and measure its soles."""
import bpy,math,json,hashlib
from pathlib import Path
from mathutils import Vector,Matrix

scene=bpy.context.scene
project=Path(scene['DonkeyCartProject'])
base=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020')
before=set(bpy.data.objects)
visibility={obj:(obj.hide_render,obj.hide_get()) for obj in before}
for obj in before:
    if obj.name not in bpy.data.collections['ReviewStudio'].objects:obj.hide_render=True;obj.hide_set(True)
bpy.ops.import_scene.gltf(filepath=str(project/'Model/DonkeyCart/Model_DonkeyCart.glb'))
imported=set(bpy.data.objects)-before
rigs=[o for o in imported if o.type=='ARMATURE']
meshes=[o for o in imported if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)]
report={'assetSha256':hashlib.sha256((project/'Model/DonkeyCart/Model_DonkeyCart.glb').read_bytes()).hexdigest(),'meshCount':len(meshes),'rigs':[{'name':o.name,'boneCount':len(o.data.bones),'tracks':[t.name for t in o.animation_data.nla_tracks] if o.animation_data else []} for o in rigs]}
for obj in rigs:
    obj.data.pose_position='REST'
    if obj.animation_data:
        obj.animation_data.action=None
        obj.animation_data.use_nla=True
        for track in obj.animation_data.nla_tracks:track.mute=True
    for bone in obj.pose.bones:bone.matrix_basis=Matrix.Identity(4)
for obj in imported:
    helper=obj.type=='MESH' and obj not in meshes
    obj.hide_render=helper;obj.hide_set(helper)
scene.frame_set(0);bpy.context.view_layer.update()
camera=bpy.data.objects['ReviewCamera'];scene.camera=camera
def Render(name,position,target,scale,width,height):
    camera.location=position;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale
    scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100
    scene.render.filepath=str(base/'Review'/('Render_Imported'+name+'.png'));bpy.ops.render.render(write_still=True)
if not scene.get('DonkeyVerifySkipStatic',False):
    Render('Side',(-7,-.49,1.14),(0,-.49,.86),3.83,640,360)
    Render('Quarter',(-4,5,2.8),(0,-.45,.81),3.85,640,400)

donkeyRig=next(o for o in rigs if 'DonkeyFrontLeftHoofPivot' in o.data.bones)
animal=next(o for o in meshes if o.vertex_groups.get('DonkeyFrontLeftHoofPivot'))
soleIndices={}
for front in ('Front','Rear'):
    for side in ('Left','Right'):
        stem='Donkey'+front+side;index=animal.vertex_groups[stem+'HoofPivot'].index
        indices=[]
        for vertex in animal.data.vertices:
            p=animal.matrix_world@vertex.co
            if p.z<.035 and any(group.group==index and group.weight>.98 for group in vertex.groups):indices.append(vertex.index)
        if not indices:raise RuntimeError('Packed GLB has no rigid actual sole: '+stem)
        soleIndices[stem]=indices
for obj in rigs:obj.data.pose_position='POSE'
walkStrip=next(track.strips[0] for track in donkeyRig.animation_data.nla_tracks if 'DonkeyWalk' in track.name)
for track in donkeyRig.animation_data.nla_tracks:track.mute=True
donkeyRig.animation_data.action=walkStrip.action
if walkStrip.action_slot:donkeyRig.animation_data.action_slot=walkStrip.action_slot
samples=[]
walkStart=walkStrip.action_frame_start;walkEnd=walkStrip.action_frame_end
report['importedWalkActionFrameRange']=[walkStart,walkEnd]
for sample in range(37):
    frame=walkStart+(walkEnd-walkStart)*sample/36
    scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
    evaluated=animal.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
    for front in ('Front','Rear'):
        for side in ('Left','Right'):
            stem='Donkey'+front+side
            phase=(sample/36+(.75 if front=='Front' else 0)+(.5 if side=='Right' else 0))%1
            duty=.64 if front=='Front' else .66
            points=[evaluated.matrix_world@mesh.vertices[i].co for i in soleIndices[stem]]
            samples.append({'frame':frame,'stem':stem,'step':phase,'planted':phase<duty,
                'minZ':min(p.z for p in points),'meanY':sum(p.y for p in points)/len(points)})
    evaluated.to_mesh_clear()
planted=[row for row in samples if row['planted']]
drift=[]
for stem in soleIndices:
    rows=[row for row in samples if row['stem']==stem]
    for a,b in zip(rows,rows[1:]):
        if a['planted'] and b['planted'] and 0<b['step']-a['step']<.1:drift.append(abs(b['meanY']-a['meanY']+.68/36))
report['stanceSoleRangeM']=[min(row['minZ'] for row in planted),max(row['minZ'] for row in planted)]
report['worstStanceDriftPerFrameM']=max(drift)
report['samples']=samples
scene.frame_set(18);Render('Walk',(-4,5,2.8),(0,-.45,.81),3.85,640,400)
(base/'Review/Data_ImportedGlbVerification.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
for obj in imported:bpy.data.objects.remove(obj,do_unlink=True)
for obj,(render,hidden) in visibility.items():obj.hide_render=render;obj.hide_set(hidden)
scene.frame_set(0)
scene['DonkeyVerifySkipStatic']=False
print(json.dumps({k:v for k,v in report.items() if k!='samples'}))
if report['meshCount']!=2:raise RuntimeError('Expected exactly two runtime mesh batches')
if report['stanceSoleRangeM'][0]<-.0005 or report['stanceSoleRangeM'][1]>.002:raise RuntimeError('Reimported actual sole misses the ground')
if max(drift)>.0001:raise RuntimeError('Reimported actual sole slides against travelled distance')
