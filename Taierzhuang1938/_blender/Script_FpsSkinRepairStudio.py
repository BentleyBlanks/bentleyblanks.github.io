"""Rebuild exact glTF skin replays, accounting for Blender's bone axes.

Set FPS_GRIP_PROJECT_ROOT, FPS_GRIP_INPUT and FPS_GRIP_SOURCE. Production
inverse binds remain authoritative; each static replay is checked vertexwise.
FPS_GRIP_STATIC_ONLY=True creates an isolated static inspection, reads no old
animation traces, and never renames or hides an authoring scene. skin.rest is
already the evaluated pre-skin morph result; baseRest is provenance only.
FPS_GRIP_REPLAY_SCENE names the generated scene; FPS_GRIP_SCULPT_SCENE selects
an existing task-tagged authoring scene solely to verify ownership.
"""
import bpy,json,math,hashlib,os
for variable in ['OPENBLAS_NUM_THREADS','OMP_NUM_THREADS','MKL_NUM_THREADS']:os.environ[variable]='1'
import numpy as np
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
root=Path(FPS_GRIP_PROJECT_ROOT).resolve();folder=Path(FPS_GRIP_INPUT).resolve();source=Path(FPS_GRIP_SOURCE).resolve()
task=globals().get('FPS_GRIP_TASK','FpsWeaponGrips_20261014')
staticOnly=bool(globals().get('FPS_GRIP_STATIC_ONLY',False))
assert Path(bpy.data.filepath).resolve().parent==source,'Open the authorized source .blend first'
previous=bpy.data.scenes.get(globals().get('FPS_GRIP_SCULPT_SCENE','')) or bpy.context.scene
bpy.context.window.scene=previous
assert previous.get('BlenderMcpTask')==task
if bpy.context.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
if not staticOnly:previous.name=globals().get('FPS_GRIP_SCULPT_SCENE','Scene_FpsWeaponControls')
replayName=globals().get('FPS_GRIP_REPLAY_SCENE','Scene_FpsRepairFinal')
assert replayName!=previous.name and replayName!='Scene_ScannedHandRegistration'
existing=bpy.data.scenes.get(replayName)
if existing:
 assert existing.get('FpsSkinRepairStudioOwner')==task,'Refusing to replace a non-inspection scene'
 bpy.data.scenes.remove(existing)
scene=bpy.data.scenes.new(replayName);bpy.context.window.scene=scene
scene['BlenderMcpTask']=task;scene['FpsSkinRepairStudioOwner']=task;scene['FpsStaticInspection']=staticOnly;scene.unit_settings.system='METRIC'
convert=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
def M(v):return Matrix([v[i::4] for i in range(4)])
def N(v):return np.asarray(v,dtype=np.float64).reshape(4,4).T
def PositionHash(v):return hashlib.sha256(np.asarray(v,dtype='<f4').tobytes()).hexdigest()
def Unit(m):
 p,q,s=m.decompose();return Matrix.LocRotScale(p,q,Vector((1,1,1)))
def Material(name,color):
 sourceName=name.removesuffix('_FirstPerson')
 original=bpy.data.materials.get(sourceName)
 if original:return original
 material=bpy.data.materials.get(name)
 if material:return material
 material=bpy.data.materials.new(name);material.use_nodes=True
 material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=color
 return material
steel=Material('Material_FpsRepairSteel',(.13,.15,.17,1))
collections={};cameras={};reports=[]
for id in ['Grenade','GrenadeBundle','Dadao','Zb26']:
 pkg=json.loads((folder/('Data_'+id+'.json')).read_text(encoding='utf-8'))
 assert pkg['weapon']==id
 collection=bpy.data.collections.new('Scene_FpsFinal'+id);scene.collection.children.link(collection);collections[id]=collection
 C=M(pkg['cameraMatrix']).inverted();G=C@M(pkg['weaponMatrix'])
 gram=G.to_3x3()@G.to_3x3().transposed();scale=[math.sqrt(gram[i][i]) for i in range(3)]
 carrier=bpy.data.objects.new('Scene_FpsFinal'+id+'ViewScale',None);collection.objects.link(carrier)
 carrier.matrix_world=convert@Matrix.Diagonal((*scale,1));inverse=carrier.matrix_world.inverted()
 data=bpy.data.armatures.new('Model_FpsFinal'+id+'Skeleton');arm=bpy.data.objects.new('Model_FpsFinal'+id+'Arms',data);collection.objects.link(arm);arm.parent=carrier;arm.matrix_parent_inverse=Matrix.Identity(4)
 sourceInverseBind={name:M(values) for name,values in zip(pkg['skin'][0]['bones'],pkg['skin'][0]['inverseBinds'])}
 sourceBind={name:matrix.inverted() for name,matrix in sourceInverseBind.items()}
 bindScale={name:[matrix.to_3x3().col[i].length for i in range(3)] for name,matrix in sourceBind.items()}
 rawBind={name:Unit(matrix) for name,matrix in sourceBind.items()}
 parents=dict(zip(pkg['boneNames'],pkg['boneParents']))
 bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 for name in pkg['boneNames']:
  bone=data.edit_bones.new(name);bone.head=rawBind[name].translation
  children=[n for n,p in parents.items() if p==name]
  tail=rawBind[children[0]].translation if children else bone.head+rawBind[name].to_3x3()@Vector((.018,0,0))
  if (tail-bone.head).length<.001:tail=bone.head+Vector((0,.01,0))
  bone.tail=tail
 for name,parent in parents.items():
  if parent:data.edit_bones[name].parent=data.edit_bones[parent]
 bpy.ops.object.mode_set(mode='OBJECT')
 correction={name:sourceInverseBind[name]@data.bones[name].matrix_local for name in pkg['boneNames']}
 for bone in arm.pose.bones:bone.rotation_mode='QUATERNION'
 meshes=[]
 for skin in pkg['skin']:
  bind=M(skin['bindMatrix']);vertices=[bind@Vector(skin['rest'][i:i+3]) for i in range(0,len(skin['rest']),3)]
  index=skin['idx'] or list(range(len(vertices)));mesh=bpy.data.meshes.new('Model_FpsFinal'+id+skin['name'])
  mesh.from_pydata(vertices,[],[index[i:i+3] for i in range(0,len(index),3)]);mesh.update()
  obj=bpy.data.objects.new(mesh.name,mesh);collection.objects.link(obj);obj.parent=arm;obj.matrix_parent_inverse=Matrix.Identity(4)
  obj['FpsReplayUsesEvaluatedRest']=True;obj['FpsBaseRestSha256']=PositionHash(skin.get('baseRest',skin['rest']));obj['FpsEvaluatedRestSha256']=PositionHash(skin['rest'])
  obj['FpsRuntimeMorphState']=json.dumps(skin.get('morphState'),ensure_ascii=False)
  for materialName in skin['materialNames']:mesh.materials.append(Material(materialName,(.35,.24,.16,1)))
  if skin['uv']:
   uv=mesh.uv_layers.new(name='UVMap')
   for loop in mesh.loops:uv.data[loop.index].uv=(skin['uv'][loop.vertex_index*2],1-skin['uv'][loop.vertex_index*2+1])
  for polygon in mesh.polygons:polygon.use_smooth=True
  if skin.get('normals'):
   normalMatrix=bind.to_3x3().inverted().transposed()
   mesh.normals_split_custom_set_from_vertices([(normalMatrix@Vector(skin['normals'][i:i+3])).normalized() for i in range(0,len(skin['normals']),3)])
  groups=[obj.vertex_groups.new(name=name) for name in skin['bones']]
  for i in range(len(vertices)):
   for k in range(4):
    w=skin['wts'][4*i+k]
    if w>0:groups[skin['infl'][4*i+k]].add([i],w,'REPLACE')
  modifier=obj.modifiers.new('Armature_FpsProduction','ARMATURE');modifier.object=arm
  meshes.append((obj,skin))
 def Pose(values,frame=None):
  for name,matrix in zip(pkg['boneNames'],values):
   bone=arm.pose.bones[name];desired=inverse@convert@M(matrix)
   bone.matrix=desired@correction[name];bpy.context.view_layer.update()
   if frame is not None:
    for channel in ['location','rotation_quaternion','scale']:bone.keyframe_insert(channel,frame=frame)
 Pose([list(v for col in (C@M(values)).transposed() for v in col) for values in pkg['boneMatrices']])
 bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();worst=0;rawWorst=0;blenderRawWorst=0
 cameraRaw=np.linalg.inv(N(pkg['cameraMatrix']));weaponRaw=cameraRaw@N(pkg['weaponMatrix']);convertRaw=np.array(convert,dtype=np.float64)
 rawWorld=dict(zip(pkg['boneNames'],map(N,pkg['boneMatrices'])))
 for obj,skin in meshes:
  evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh()
  rest=np.c_[np.asarray(skin['rest']).reshape(-1,3),np.ones(len(mesh.vertices))];joint=np.asarray(skin['infl']).reshape(-1,4);weight=np.asarray(skin['wts']).reshape(-1,4)
  transforms=np.asarray([cameraRaw@rawWorld[name]@N(bind)@N(skin['bindMatrix']) for name,bind in zip(skin['bones'],skin['inverseBinds'])])
  raw=np.sum(np.einsum('nkij,nj->nki',transforms[joint],rest)*weight[:,:,None],axis=1)@convertRaw.T
  exported=np.c_[np.asarray(skin['pos']).reshape(-1,3),np.ones(len(mesh.vertices))]@(convertRaw@weaponRaw).T
  rawWorst=max(rawWorst,float(np.linalg.norm(raw[:,:3]-exported[:,:3],axis=1).max()))
  for i,vertex in enumerate(mesh.vertices):
   actual=evaluated.matrix_world@vertex.co;expected=convert@G@Vector(skin['pos'][3*i:3*i+3]);worst=max(worst,(actual-expected).length)
   blenderRawWorst=max(blenderRawWorst,float(np.linalg.norm(np.asarray(actual)-raw[i,:3])))
  evaluated.to_mesh_clear()
 reports.append({'weapon':id,'staticOnly':staticOnly,'maximumSkinReplayErrorM':worst,'maximumRawLbsExportErrorM':rawWorst,'maximumBlenderRawLbsErrorM':blenderRawWorst,'bindScale':bindScale,'evaluatedRestHashes':[PositionHash(s['rest']) for s in pkg['skin']]});print(json.dumps({k:v for k,v in reports[-1].items() if k!='bindScale'}),flush=True)
 if max(worst,blenderRawWorst)>.0001 or rawWorst>.000003:raise RuntimeError(f'{id}: static replay differs from raw LBS/runtime export: {worst}, {blenderRawWorst}, {rawWorst} m')
 weapon=bpy.data.objects.new('Model_FpsFinal'+id,None);collection.objects.link(weapon);weapon.parent=carrier;weapon.rotation_mode='QUATERNION';weapon.matrix_world=convert@G
 vertices=[t[i:i+3] for t in pkg['gun'] for i in (0,3,6)];mesh=bpy.data.meshes.new('Model_FpsFinal'+id+'Surface')
 mesh.from_pydata(vertices,[],[(i,i+1,i+2) for i in range(0,len(vertices),3)]);mesh.materials.append(steel);mesh.update()
 prop=bpy.data.objects.new(mesh.name,mesh);collection.objects.link(prop);prop.parent=weapon
 for side,key in [('r','right'),('l','left')]:
  marker=bpy.data.objects.new('Grip_FpsFinal'+id+key.title(),None);collection.objects.link(marker);marker.parent=weapon
  marker.location=pkg['contacts'][key]['position'];marker.empty_display_type='ARROWS';marker.empty_display_size=.035
  x,y,z=pkg['contacts'][key]['rotation'];marker.rotation_mode='QUATERNION';marker.rotation_quaternion=Quaternion((0,1,0),y)@Quaternion((1,0,0),x)@Quaternion((0,0,1),z)
  marker['contactJson']=json.dumps(pkg['contacts'][key])
 cam=bpy.data.cameras.new('Camera_FpsFinal'+id);camera=bpy.data.objects.new(cam.name,cam);collection.objects.link(camera);camera.matrix_world=convert
 cam.lens=36/(2*(1600/900)*math.tan(math.radians(55)/2));cam.clip_start=.01;cameras[id]=camera
 animation=None
 animationSource=globals().get('FPS_GRIP_ANIMATION_SOURCE')
 if not staticOnly and id=='Dadao':animation=json.loads((Path(animationSource)/'Data_DadaoSourceBake.json' if animationSource else root/'_shots/DadaoPower/Acceptance/Data_DadaoSourceBake.json').read_text(encoding='utf-8'))
 if not staticOnly and id=='Grenade':animation=json.loads((Path(animationSource)/'Data_GrenadeTrace.json' if animationSource else root/'_shots/GrenadeThrow/Data_GrenadeTrace.json').read_text(encoding='utf-8'))
 if animation:
  for i,entry in enumerate(animation['frames']):
   scene.frame_set(i+1);Pose(entry['bones'],i+1);weapon.matrix_world=convert@M(entry['weapon'])
   for channel in ['location','rotation_quaternion','scale']:weapon.keyframe_insert(channel,frame=i+1)
   if id=='Grenade':prop.hide_render=.48<=i/120<=.89;prop.keyframe_insert('hide_render',frame=i+1)
  for obj in [arm,weapon]:
   obj.animation_data.action.name='Animation_FpsFinal'+id+('Arms' if obj==arm else 'Prop')
   for layer in obj.animation_data.action.layers:
    for strip in layer.strips:
     for bag in strip.channelbags:
      for curve in bag.fcurves:
       for key in curve.keyframe_points:key.interpolation='LINEAR'
 arm.select_set(False)
for name,position,energy,size in [('Light_FpsFinalKey',(-1,-1,2),180,2),('Light_FpsFinalFill',(1,0,1),85,2)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.size=size;obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=position;obj.rotation_euler=(Vector((0,.5,0))-obj.location).to_track_quat('-Z','Y').to_euler()
world=bpy.data.worlds.new('World_FpsFinal');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.15,.18,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6
def SelectRepairWeapon(id,normalized=0,_scene=scene,_collections=collections,_cameras=cameras,_staticOnly=staticOnly):
 for key,collection in _collections.items():collection.hide_render=key!=id;collection.hide_viewport=key!=id
 _scene.camera=_cameras[id];_scene.render.fps=120;_scene.render.fps_base=.82 if id=='Grenade' else .65
 _scene.frame_set(1 if _staticOnly else round(1+120*normalized));bpy.context.view_layer.update()
SelectRepairWeapon('Dadao',0);bpy.app.driver_namespace['SelectRepairWeapon']=SelectRepairWeapon
if staticOnly:bpy.app.driver_namespace['SelectFinalGripInspectionWeapon']=SelectRepairWeapon
controls=next((s for s in bpy.data.scenes if s!=scene and 'Animation_DadaoGrip' in s.objects),None)
if controls and not staticOnly:
 controls.name='Scene_FpsWeaponControls'
 for collection in controls.collection.children:collection.hide_render=True;collection.hide_viewport=True
for other in list(bpy.data.scenes):
 if not staticOnly and task=='FpsWeaponGrips_20261014' and other not in [scene,controls] and other.get('BlenderMcpTask')==task:bpy.data.scenes.remove(other)
scene.render.engine='BLENDER_EEVEE';scene.render.use_compositing=False;scene.render.use_sequencer=False;scene.render.use_freestyle=False
scene.frame_start=1;scene.frame_end=1 if staticOnly else 121;scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
for name in globals().get('FPS_GRIP_EMBED_SCRIPTS',['Script_FpsWeaponGripFit.py','Script_FpsDadaoElbowFit.py','Script_FpsDadaoPhysicalStroke.py','Script_FpsSkinRepairStudio.py']):
 text=bpy.data.texts.get(name) or bpy.data.texts.new(name);text.clear();text.write((root/'_blender'/name).read_text(encoding='utf-8'))
for img in bpy.data.images:
 if img.source=='FILE' and img.has_data and not img.packed_file:img.pack()
(source/'Data_SkinReplayValidation.json').write_text(json.dumps(reports,indent=2),encoding='utf-8')
if globals().get('FPS_GRIP_SAVE_BLEND',True):bpy.ops.wm.save_as_mainfile(filepath=str(source/globals().get('FPS_GRIP_BLEND_NAME','Animation_FpsWeaponGrips.blend')),compress=True)
print(json.dumps({'file':bpy.data.filepath,'weapons':list(collections),'skinValidation':reports}))
