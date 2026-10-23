"""Reimport the actual packed GLB, inspect its skins, render and measure its soles."""
import bpy,math,json,hashlib
from pathlib import Path
from mathutils import Vector,Matrix

scene=bpy.context.scene
project=Path(scene['DonkeyCartProject'])
assetName=globals().get('DonkeyAssetName','DonkeyCart')
standalone=assetName=='Donkey'
base=Path(scene['DonkeySourceRoot']) if standalone else Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020')
asset=project/'Model'/assetName/('Model_'+assetName+'.glb')
before=set(bpy.data.objects)
visibility={obj:(obj.hide_render,obj.hide_get()) for obj in before}
for obj in before:
    if obj.name not in bpy.data.collections['ReviewStudio'].objects:obj.hide_render=True;obj.hide_set(True)
bpy.ops.import_scene.gltf(filepath=str(asset))
imported=set(bpy.data.objects)-before
rigs=[o for o in imported if o.type=='ARMATURE']
meshes=[o for o in imported if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)]
report={'assetSha256':hashlib.sha256(asset.read_bytes()).hexdigest(),'meshCount':len(meshes),'rigs':[{'name':o.name,'boneCount':len(o.data.bones),'tracks':[t.name for t in o.animation_data.nla_tracks] if o.animation_data else []} for o in rigs]}
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
    if obj.get('groomCastShadow') is False:obj.visible_shadow=False
scene.frame_set(0);bpy.context.view_layer.update()
camera=bpy.data.objects['ReviewCamera'];scene.camera=camera
def Render(name,position,target,scale,width,height):
    if scene.get('DonkeyVerifyMeasurementsOnly',False):return
    camera.location=position;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale
    scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100
    scene.render.filepath=str(base/'Review'/('Render_Imported'+name+'.png'));bpy.ops.render.render(write_still=True)
if not scene.get('DonkeyVerifySkipStatic',False):
    Render('Side',(-7,0,1.14),(0,0,.86),2.55,640,400) if standalone else Render('Side',(-7,-.49,1.14),(0,-.49,.86),3.83,640,360)
    Render('Quarter',(-4,5,2.8),(0,0,.81),2.5,640,400) if standalone else Render('Quarter',(-4,5,2.8),(0,-.45,.81),3.85,640,400)
    if standalone:Render('HeadNeck',(-3,4,1.6),(0,.65,1.02),1.35,640,640)

donkeyRig=next(o for o in rigs if 'DonkeyFrontLeftHoofPivot' in o.data.bones)
animal=next(o for o in meshes if o.name.startswith('DonkeyRuntime'))
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
foreY=sum((animal.matrix_world@animal.data.vertices[i].co).y for i in soleIndices['DonkeyFrontLeft'])/len(soleIndices['DonkeyFrontLeft'])
hindY=sum((animal.matrix_world@animal.data.vertices[i].co).y for i in soleIndices['DonkeyRearLeft'])/len(soleIndices['DonkeyRearLeft'])
Render('FeetSide',(-4,(foreY+hindY)/2,.37),(0,(foreY+hindY)/2,.34),1.25,640,400)
Render('FeetFront',(0,3,.27),(0,foreY,.27),.56,640,640)
Render('FeetRear',(0,-3,.27),(0,hindY,.27),.56,640,640)
Render('UpperForelegs',(-4,.43,.68),(0,.43,.68),.80,640,640)
if not standalone:Render('CartDetail',(-4,-1.43,1.05),(0,-1.43,.65),2.0,640,480)
Render('CoatDetail',(-3,.08,1.0),(0,.08,.88),.85,640,480)
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
scene.frame_set(18);Render('Walk',(-4,5,2.8),(0,0 if standalone else -.45,.81),2.5 if standalone else 3.85,640,400)
scene.frame_set(26);Render('WalkFeet',(-4,(foreY+hindY)/2,.38),(0,(foreY+hindY)/2,.32),1.40,640,400)
for frame in (6,27):
    scene.frame_set(frame);Render('WalkUpperForelegs'+str(frame),(-4,.43,.65),(0,.43,.65),.95,640,640)
if standalone:
    idleStrip=next(track.strips[0] for track in donkeyRig.animation_data.nla_tracks if 'DonkeyIdle' in track.name)
    donkeyRig.animation_data.action=idleStrip.action
    if idleStrip.action_slot:donkeyRig.animation_data.action_slot=idleStrip.action_slot
    idleSoles=[]
    for sample in range(31):
        frame=idleStrip.action_frame_start+(idleStrip.action_frame_end-idleStrip.action_frame_start)*sample/30
        scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
        evaluated=animal.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
        for indices in soleIndices.values():idleSoles.append(min((evaluated.matrix_world@mesh.vertices[i].co).z for i in indices))
        evaluated.to_mesh_clear()
    report['idleStanceSoleRangeM']=[min(idleSoles),max(idleSoles)]
    if min(idleSoles)<-.0005 or max(idleSoles)>.002:raise RuntimeError('Idle soles leave the ground')
(base/'Review/Data_ImportedGlbVerification.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
for obj in imported:bpy.data.objects.remove(obj,do_unlink=True)
for obj,(render,hidden) in visibility.items():obj.hide_render=render;obj.hide_set(hidden)
scene.frame_set(0)
scene['DonkeyVerifySkipStatic']=False
scene['DonkeyVerifyMeasurementsOnly']=False
print(json.dumps({k:v for k,v in report.items() if k!='samples'}))
if report['meshCount']!=2:raise RuntimeError('Unexpected runtime mesh batch count')
if report['stanceSoleRangeM'][0]<-.0005 or report['stanceSoleRangeM'][1]>.002:raise RuntimeError('Reimported actual sole misses the ground')
if max(drift)>.0001:raise RuntimeError('Reimported actual sole slides against travelled distance')
