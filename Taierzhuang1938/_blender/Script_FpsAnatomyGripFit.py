"""Refit only affected support digits after balancing the hand volume.

The production exporter supplies the current authored rotations. Search small
offsets from those rotations; do not reconstruct or replace the unrelated grip.
"""
import bpy,json,math,re
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
from mathutils.bvhtree import BVHTree
assert bpy.context.scene.get('BlenderMcpTask')=='FpsHandAnatomy_20261015'
root=Path(FPS_PROJECT_ROOT);folder=Path(FPS_ANATOMY_INPUT);source=Path(bpy.data.filepath).parent
M=lambda a:Matrix([a[i::4] for i in range(4)])
Q=lambda a:Quaternion((a[3],*a[:3]))
QA=lambda q:[round(v,9) for v in (q.x,q.y,q.z,q.w)]
selection={'HanYang':[0,1,2],'GrenadeBundle':[2],'Dadao':[0,1,2,3,4],'Zb26':[0,1,4]}
palmTargets={'Dadao':{'position':[.012,-.051,.15],'rotation':[0,math.pi/2,math.pi]}}
only=globals().get('FPS_GRIP_IDS',list(selection))
selection={key:value for key,value in selection.items() if key in only}
prior=source/'Data_FpsAnatomyGripReport.json'
reports=[r for r in json.loads(prior.read_text()) if r['weapon'] not in selection] if prior.exists() else []
prior=source/'Data_FpsAnatomyFingerCorrections.json'
corrections=json.loads(prior.read_text()) if prior.exists() else {}
def Frame(contact):
 r=contact['rotation'];q=Quaternion((0,1,0),r[1])@Quaternion((1,0,0),r[0])@Quaternion((0,0,1),r[2])
 return Matrix.LocRotScale(Vector(contact['position']),q,Vector((1,1,1)))
for weapon,digits in selection.items():
 pkg=json.loads((folder/f'Data_{weapon}.json').read_text())
 palmDelta=Frame(palmTargets[weapon])@Frame(pkg['contacts']['left']).inverted() if weapon in palmTargets else Matrix.Identity(4)
 vertices=[Vector(t[j:j+3]) for t in pkg['gun'] for j in (0,3,6)]
 bvh=BVHTree.FromPolygons(vertices,[(i,i+1,i+2) for i in range(0,len(vertices),3)])
 thumbTarget=None
 if weapon=='Dadao':
  thumbTarget,_,_,_=bvh.ray_cast(Vector((-.04,-.009,.105)),Vector((1,0,0)),.08)
  assert thumbTarget is not None, 'The support thumb must oppose the fingers on the hilt, not grip the pommel ring.'
 def Signed(point):
  nearest,normal,index,distance=bvh.find_nearest(point)
  return -distance if distance<.022 and (point-nearest).dot(normal)<-1e-6 else distance
 chains={}
 for name,c in pkg['chain']['l'].items():
  match=re.search(r'finger(\d)(\d)?$',name,re.I)
  chains[name]={**c,'digit':int(match[1]),'segment':int(match[2] or 0),'W':M(c['world']),'P':M(c['parentWorld']),'q':Q(c['local']),'axisV':Vector(c['axis']),'spreadV':Vector(c['spreadAxis'])}
 corrections[weapon]={}
 boneWorlds=dict(zip(pkg['boneNames'],map(M,pkg['boneMatrices'])));inverseWeapon=M(pkg['weaponMatrix']).inverted()
 replayError=0
 for digit in digits:
  names=sorted([n for n,c in chains.items() if c['digit']==digit],key=lambda n:chains[n]['segment'])
  points=[]
  for mesh in pkg['skin']:
   skinMatrices=[inverseWeapon@boneWorlds[name]@M(bind)@M(mesh['bindMatrix']) for name,bind in zip(mesh['bones'],mesh['inverseBinds'])]
   for i in range(len(mesh['pos'])//3):
    influences=[(mesh['bones'][mesh['infl'][i*4+k]],mesh['wts'][i*4+k],mesh['infl'][i*4+k]) for k in range(4) if mesh['wts'][i*4+k]>0]
    if max(influences,key=lambda x:x[1])[0] not in names:continue
    rest=Vector(mesh['rest'][i*3:i*3+3]);point=Vector(mesh['pos'][i*3:i*3+3])
    components=[(name,weight,skinMatrices[index]@rest) for name,weight,index in influences]
    replayError=max(replayError,(sum((component*weight for name,weight,component in components),Vector())-point).length)
    points.append((point,components))
  assert replayError<.000003, f'Production skin reconstruction differs by {replayError} m'
  pad=pkg['pads'][f'l{digit}2'];padPoint=chains[pad['bone']]['W']@Vector(pad['point'])
  def FK(parameters):
   parent=None;transforms={};rotations={}
   for name in names:
    c=chains[name];segment=c['segment'];q=c['q'].copy()
    if digit==0 and segment==0:
     for axis,angle in zip([(1,0,0),(0,1,0),(0,0,1)],parameters[:3]):q=q@Quaternion(Vector(axis),math.radians(angle))
    else:
     angle=parameters[segment+2] if digit==0 else parameters[segment]
     q=q@Quaternion(c['axisV'],math.radians(angle))
     if segment==0:q=Quaternion(c['spreadV'],math.radians(parameters[3]))@q
    world=(palmDelta@c['P'] if parent is None else parent)@Matrix.LocRotScale(Vector(c['position']),q,Vector(c['scale']))
    transforms[name]=world@c['W'].inverted();rotations[str(digit)+(str(segment) if segment else '')]=QA(q);parent=world
   return transforms,rotations
  def Evaluate(parameters,full=False):
   transforms,rotations=FK(parameters);depths=[]
   for point,influences in (points if full or (weapon=='Zb26' and digit==1) else points[::6]):
    transformed=sum(((transforms[name]@component if name in transforms else palmDelta@component if re.search(r'l[_ ]?(hand|finger)',name,re.I) else component)*weight for name,weight,component in influences),Vector())
    depths.append(max(0,-Signed(transformed)))
   excess=[max(0,d-.0013) for d in depths]
   penetration=max(excess,default=0);rms=math.sqrt(sum(d*d for d in excess)/max(1,len(excess)))
   gap=abs(Signed(transforms[pad['bone']]@padPoint))
   if thumbTarget is not None and digit==0:gap=(transforms[pad['bone']]@padPoint-thumbTarget).length
   score=250*penetration+20*rms+60*max(0,gap-.001)+800*max(0,gap-.0028)+.00003*sum(d*d for d in parameters)
   return score,max(depths,default=0),gap,rotations
  parameters=[0.]*(5 if digit==0 else 4);winner=parameters.copy()
  before=Evaluate(parameters,True);globalBest=before[0]
  starts=[parameters.copy()]
  if digit==0:starts += [[-6,-6,-6,-6,6],[6,0,0,0,0],[0,6,0,0,0],[0,0,6,0,0],[0,0,-6,0,0]]
  elif weapon=='Dadao':starts += [[12,-12,-12,0],[24,-18,-18,0],[12,0,0,0]]
  for start in starts:
   parameters=start.copy();best=Evaluate(parameters)[0]
   for step in [6,3,1.5,.75,.25]:
    for iteration in range(6):
     changed=False
     for index in range(len(parameters)):
      for sign in [-1,1]:
       limit=((42 if index<3 else 28) if digit==0 else [35,30,28,14][index]) if weapon=='Dadao' else 18
       trial=parameters.copy();trial[index]=max(-limit,min(limit,trial[index]+sign*step))
       score=Evaluate(trial)[0]
       if score<best-1e-8:parameters=trial;best=score;changed=True
     if not changed:break
   fullScore=Evaluate(parameters,True)[0]
   if fullScore<globalBest:globalBest=fullScore;winner=parameters.copy()
  parameters=winner
  if weapon=='Zb26' and digit==1:
   # The knuckle must travel around the folded foot while the tip keeps its
   # contact. Coupled joint moves can cross valleys a one-axis search cannot.
   best=Evaluate(parameters)[0];limits=[28,28,25,14]
   for step in [6,3,1.5,.75,.25]:
    for iteration in range(4):
     changed=False
     for i in range(4):
      for j in range(i+1,4):
       for ratio in [.5,1,2]:
        for si in [-1,1]:
         for sj in [-1,1]:
          trial=parameters.copy()
          trial[i]=max(-limits[i],min(limits[i],trial[i]+si*step))
          trial[j]=max(-limits[j],min(limits[j],trial[j]+sj*step*ratio))
          score=Evaluate(trial)[0]
          if score<best-1e-8:parameters=trial;best=score;changed=True
     if not changed:break
  after=Evaluate(parameters,True)
  corrections[weapon].update(after[3])
  reports.append({'weapon':weapon,'digit':digit,'palmTarget':palmTargets.get(weapon),'skinReplayErrorM':replayError,'beforeGapMm':before[2]*1000,'gapMm':after[2]*1000,'beforePenMm':before[1]*1000,'penMm':after[1]*1000,'offsetDeg':parameters})
  print(json.dumps(reports[-1]),flush=True)
  (source/'Data_FpsAnatomyGripReport.json').write_text(json.dumps(reports,indent=2),encoding='utf-8')
(source/'Data_FpsAnatomyFingerCorrections.json').write_text(json.dumps(corrections,indent=2),encoding='utf-8')
if globals().get('FPS_APPLY_GRIP_FIXES',False):
 assert all(r['gapMm']<3.2 and r['penMm']<3.2 for r in reports if r['weapon'] in selection), 'Review an infeasible support grip before writing runtime data.'
 path=root/'Data_FpsWeaponGrips.mjs';text=path.read_text(encoding='utf-8')
 marker='export const FPS_WEAPON_GRIPS = FreezeTree(';start=text.index(marker)+len(marker);end=text.rindex(');')
 config=json.loads(text[start:end])
 for weapon in selection:
  rotations=corrections[weapon]
  if weapon in config:
   config[weapon]['left']['fingerRotations'].update(rotations)
   if weapon in palmTargets:config[weapon]['left'].update(palmTargets[weapon])
 (source/'Data_FpsWeaponGrips.json').write_text(json.dumps(config,indent=2),encoding='utf-8')
 text=text[:start]+json.dumps(config,separators=(',',':'))+text[end:];path.write_text(text,encoding='utf-8')
 if 'HanYang' in selection:
  path=root/'Data_FpsArmPoses.mjs';text=path.read_text(encoding='utf-8')
  start=text.index('  HanYang: WeaponPose({');end=text.index('\n  }),',start)
  block=text[start:end];lines=block.splitlines()
  for i,line in enumerate(lines):
   if line.strip().startswith('left: Contact('):
    first=line.index('{"fingerRotations"');last=line.rindex('})')
    data=json.loads(line[first:last+1]);data['fingerRotations'].update(corrections['HanYang'])
    lines[i]=line[:first]+json.dumps(data,separators=(',',':'))+line[last+1:]
  text=text[:start]+'\n'.join(lines)+text[end:];path.write_text(text,encoding='utf-8')
for filename in ['Script_FpsAnatomyGripFit.py']:
 text=bpy.data.texts.get(filename) or bpy.data.texts.new(filename);text.clear();text.write((root/'_blender'/filename).read_text(encoding='utf-8'))
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath,compress=True)
print(json.dumps({'applied':bool(globals().get('FPS_APPLY_GRIP_FIXES',False)),'digits':sum(r['weapon'] in selection for r in reports)}))
