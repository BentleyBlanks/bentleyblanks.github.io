"""Measure actual saved poses and skin, then reimport and compare every exported GLB."""
from pathlib import Path
import bpy,json,math
import numpy as np
from mathutils import Vector,Matrix
runtime=Path.home()/'Downloads/GVHMR/InfantryActions_20260905';output=runtime/'Deliverables'
catalog=json.loads((output/'Data_AnimationCatalog.json').read_text());original=json.loads((runtime/'Data_OriginalSkeletons.json').read_text())
references={};report={'status':'running','originalBind':{},'clips':{},'reimports':{},'joins':{}}

def Sample(scene,arm,body,names,frames,start=1,shoeIds=None,kneeIds=None,palm=None,rifle=None,markers=None,grenade=None):
 values=[]
 for index in range((frames-1)*2+1):
  frame=start+index*.5;scene.frame_set(int(frame),subframe=frame%1)
  row={'heads':np.array([arm.matrix_world@arm.pose.bones[n].head for n in names]),
   'quats':np.array([(arm.matrix_world@arm.pose.bones[n].matrix).to_quaternion() for n in names])}
  if shoeIds:
   obj=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=obj.to_mesh()
   ps={s:[obj.matrix_world@mesh.vertices[i].co for i in ids] for s,ids in shoeIds.items()}
   row['soles']={s:min(p.z for p in pts) for s,pts in ps.items()}
   row['toe']={s:np.array(sum((pts[j] for j in markers[s]),Vector())/len(markers[s])) for s,pts in ps.items()}
   row['knees']={s:min((obj.matrix_world@mesh.vertices[i].co).z for i in ids) for s,ids in kneeIds.items()}
   obj.to_mesh_clear()
  if palm and rifle:
   row['grips']={s:float(((arm.matrix_world@arm.pose.bones[v['bone']].matrix@v['local'])-(rifle.matrix_world@v['target'])).length) for s,v in palm.items()}
  if rifle:row['rifle']=np.array(rifle.matrix_world)
  if grenade:row['grenade']=np.array(grenade.matrix_world)
  values.append(row)
 return values

for entry in catalog:
 faction,clip=entry['faction'],entry['clip'];scene=bpy.data.scenes['Scene_'+faction+'InfantryActions'];bpy.context.window.scene=scene
 arm=bpy.data.objects['Rig_'+faction+'Infantry'];body=bpy.data.objects['Model_'+faction+'InfantryBody'];rifle=bpy.data.objects['Socket_'+faction+'InfantryRifle'];prefix='Bip002 ' if faction=='Nra' else 'Bip001 '
 names=[b['name'] for b in original[faction]['bones']]
 if faction not in report['originalBind']:
  error=max(float(np.max(np.abs(np.array(arm.data.bones[b['name']].matrix_local)-b['matrixLocal']))) for b in original[faction]['bones'])
  assert error==0 and len(arm.data.bones)==53
  assert all((arm.data.bones[b['name']].parent.name if arm.data.bones[b['name']].parent else None)==b['parent'] for b in original[faction]['bones'])
  report['originalBind'][faction]={'bones':53,'maxMatrixError':error,'hierarchyPreserved':True}
 action=bpy.data.actions[entry['file'][:-4]];arm.animation_data.action=action;rifle.animation_data.action=bpy.data.actions[action.name+'_Rifle']
 prop=bpy.data.objects['Socket_'+faction+'InfantryGrenade'];prop.animation_data.action=bpy.data.actions[action.name+'_Grenade']
 scene.frame_set(1)
 shoeIds={};kneeIds={};palm={}
 heads={b.name:arm.matrix_world@b.head_local for b in arm.data.bones}
 leg=(heads[prefix+'L Calf']-heads[prefix+'L Thigh']).length+(heads[prefix+'L Foot']-heads[prefix+'L Calf']).length;scale=leg/.844
 for side in ['L','R']:
  groups={g.index for g in body.vertex_groups if g.name in [prefix+side+' Foot',prefix+side+' Toe0']}
  shoeIds[side]=[v.index for v in body.data.vertices if sum(g.weight for g in v.groups if g.group in groups)>.55]
  kneeIds[side]=[v.index for v in body.data.vertices if (body.matrix_world@v.co-heads[prefix+side+' Calf']).length<.095]
  name=prefix+side+' Hand';rest=arm.matrix_world@arm.data.bones[name].matrix_local
  offset=rest.to_3x3().col[0].normalized()*(.065*scale)+rest.to_3x3().col[1].normalized()*(.015*scale)
  palm[side]={'bone':name,'local':rest.inverted()@(rest.translation+offset),'target':Vector((0,0,0)) if side=='R' else Vector((0,-.012,-.245*scale))}
 measurement=json.loads((runtime/f'Data_{faction}_{clip.replace("RootMotion","")}_finalMeasurements.json').read_text())
 actual=Sample(scene,arm,body,names,entry['frames'],shoeIds=shoeIds,kneeIds=kneeIds,palm=palm,rifle=rifle,markers=measurement['markerVertexOrdinals'],grenade=prop)
 references[entry['file']]=(names,actual)
 positions=np.array([v['heads'] for v in actual]);minimum=min(min(v['soles'].values()) for v in actual)
 checks={'minimumSoleMeters':minimum,'minimumRightKneeMeters':min(v['knees']['R'] for v in actual),'maximumBoneLengthErrorMeters':0.}
 errors=[];kneePoles=[];angles=[]
 for side in ['L','R']:
  for chain in [('Thigh','Calf','Foot'),('UpperArm','Forearm','Hand')]:
   ns=[prefix+side+' '+n for n in chain];ids=[names.index(n) for n in ns]
   for i in [0,1]:
    restLength=(heads[ns[i+1]]-heads[ns[i]]).length
    errors.extend(abs(np.linalg.norm(positions[:,ids[i+1]]-positions[:,ids[i]],axis=1)-restLength))
   if chain[0]=='Thigh':
    hip,knee,ankle=[positions[:,i] for i in ids];line=ankle-hip;delta=knee-hip
    pole=delta-line*(np.sum(delta*line,axis=1)/np.sum(line*line,axis=1))[:,None];kneePoles.extend(pole[:,1])
    a=knee-hip;b=ankle-knee;angles.extend(np.degrees(np.arccos(np.clip(np.sum(a*b,axis=1)/np.linalg.norm(a,axis=1)/np.linalg.norm(b,axis=1),-1,1))))
 checks['maximumBoneLengthErrorMeters']=float(max(errors));checks['mostBackwardKneePoleMeters']=float(max(kneePoles));checks['kneeFlexionDegrees']=[float(min(angles)),float(max(angles))]
 if entry['loop']:
  offset=np.array([0,-entry['referenceSpeedMps']*entry['durationSeconds'],0]) if 'RootMotion' in clip else np.zeros(3)
  checks['seamPositionErrorMeters']=float(np.max(np.linalg.norm(positions[-1]-positions[0]-offset,axis=1)))
  pelvis=names.index(prefix+'Pelvis');checks['seamPelvisVelocityDifferenceMps']=float(np.linalg.norm((positions[1,pelvis]-positions[0,pelvis]-positions[-1,pelvis]+positions[-2,pelvis])*120))
 if clip!='GrenadeThrow':checks['maxGripErrorMeters']=max(max(v['grips'].values()) for v in actual)
 else:
  chest=names.index(prefix+'Spine2');m=[]
  for index in range(entry['frames']):
   scene.frame_set(index+1);m.append(np.array((arm.matrix_world@arm.pose.bones[prefix+'Spine2'].matrix).inverted()@rifle.matrix_world))
  checks['rifleChestRelativeDriftMeters']=float(np.max(np.linalg.norm(np.array(m)[:,:3,3]-m[0][:3,3],axis=1))*.01)
 # Real skinned toe marker displacement during each continuous support segment.
 drift=[]
 for side in ['L','R']:
  group=[]
  for index,row in enumerate(actual[::2]):
   contact=measurement['frames'][index]['contact'][side]
   p=row['toe'][side].copy()
   if clip=='RifleCrouchAdvance':p[1]-=entry['referenceSpeedMps']*index/60
   if contact:group.append(p)
   if not contact or index==entry['frames']-1:
    if len(group)>2:drift.append(float(np.linalg.norm(np.ptp(np.array(group)[:,:2],axis=0))))
    group=[]
 checks['maxSupportToeDriftMeters']=max(drift) if drift else 0
 report['clips'][entry['file']]=checks
 print(entry['file'],json.dumps(checks),flush=True)

for faction in ['Nra','Ija']:
 down=references[f'Animation_{faction}_StandToKneel.glb'][1][-1]['heads'];hold=references[f'Animation_{faction}_KneelHold.glb'][1][0]['heads'];up=references[f'Animation_{faction}_KneelToStand.glb'][1][0]['heads']
 report['joins'][faction]={'downToHoldMeters':float(np.max(np.linalg.norm(down-hold,axis=1))),'holdToUpMeters':float(np.max(np.linalg.norm(hold-up,axis=1)))}

for entry in catalog:
 bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.render.fps=60
 bpy.ops.import_scene.gltf(filepath=str(output/entry['file']));scene.render.fps=60
 arm=next(o for o in scene.objects if o.type=='ARMATURE');body=bpy.data.objects['Model_'+entry['faction']+'InfantryBody']
 names,expected=references[entry['file']];assert sorted(b.name for b in arm.data.bones)==sorted(names)
 start=float(arm.animation_data.action.frame_range[0]);actual=Sample(scene,arm,body,names,entry['frames'],start=start,rifle=bpy.data.objects['Socket_'+entry['faction']+'InfantryRifle'],grenade=bpy.data.objects['Socket_'+entry['faction']+'InfantryGrenade'])
 error=max(float(np.max(np.linalg.norm(a['heads']-b['heads'],axis=1))) for a,b in zip(actual,expected))
 propErrors={key: max(float(np.max(np.abs(a[key]-b[key]))) for a,b in zip(actual,expected)) for key in ['rifle','grenade']}
 propPositions={key:max(float(np.linalg.norm(a[key][:3,3]-b[key][:3,3])) for a,b in zip(actual,expected)) for key in ['rifle','grenade']}
 propAngles={key:max(math.degrees(2*math.acos(min(1.,abs(Matrix(a[key].tolist()).to_quaternion().dot(Matrix(b[key].tolist()).to_quaternion()))))) for a,b in zip(actual,expected)) for key in ['rifle','grenade']}
 report['reimports'][entry['file']]={'bones':len(arm.data.bones),'maxJointPositionErrorMeters':error,'animationFrames':list(arm.animation_data.action.frame_range),'maxPropMatrixError':propErrors,'maxPropPositionErrorMeters':propPositions,'maxPropRotationErrorDegrees':propAngles}
 print('REIMPORT',entry['file'],error,flush=True)
failures=[]
for file,c in report['clips'].items():
 for key,limit,direction in [('minimumSoleMeters',-.001,'min'),('maximumBoneLengthErrorMeters',.001,'max'),('maxGripErrorMeters',.003,'max'),('seamPositionErrorMeters',.0001,'max'),('maxSupportToeDriftMeters',.015,'max')]:
  if key in c and (c[key]<limit if direction=='min' else c[key]>limit):failures.append([file,key,c[key],limit])
for file,c in report['reimports'].items():
 if c['maxJointPositionErrorMeters']>.0002:failures.append([file,'reimport',c['maxJointPositionErrorMeters']])
 if max(c['maxPropPositionErrorMeters'].values())>.003 or max(c['maxPropRotationErrorDegrees'].values())>2:failures.append([file,'propReimport',c['maxPropPositionErrorMeters'],c['maxPropRotationErrorDegrees']])
 if max(c['maxPropMatrixError'].values())>.003:failures.append([file,'propMatrix',c['maxPropMatrixError']])
report['failures']=failures;report['status']='passed' if not failures else 'needs correction'
(output/'Data_Validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print('VALIDATION',report['status'],json.dumps(failures),flush=True)
