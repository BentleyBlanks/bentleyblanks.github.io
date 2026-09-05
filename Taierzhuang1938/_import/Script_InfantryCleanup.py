"""Contact and prop constraints layered over measured Seedance/GVHMR motion."""
from pathlib import Path
exec(compile(Path(__file__).with_name('Script_InfantryBake.py').read_text(encoding='utf-8').split('# INFANTRY_BAKE_BODY')[0],'InfantrySetup','exec'))

count=motion['cycleFrames'];ground=.003
raw=json.loads((runtime/f'Data_{faction}_{clip}_rawMeasurements.json').read_text())['frames']
scale=length/.844
def Smooth(t):
 t=max(0.,min(1.,t));return t*t*t*(10+t*(-15+6*t))
def Window(t,start,end,fade=10):
 return Smooth((t-start+fade)/fade)*(1-Smooth((t-end)/fade))
def Contact(index,side):
 source=motion['sourceFrameIndices'][index]
 if motion['kind']=='walk':
  start={'L':46,'R':151}[side];t=(index-start)%count
  if t>count-12:t-=count
  return Window(t,0,140,12),0<=t<=140,t
 if clip=='StandToKneel':
  return (1.,True,source) if side=='L' else (1-Window(source,30,39,5),source<=25 or source>=44,source)
 if clip=='KneelHold':return 1.,True,source
 if clip=='KneelToStand':
  return (1.,True,source) if side=='L' else (1-Window(source,127,136,6),source<=121 or source>=142,source)
 if side=='L':return 1-Window(source,42,68,8),source<=34 or source>=76,source
 return 1-Window(source,122,132,7),source<=115 or source>=139,source

def PlaceFoot(side,ankle,foot,toe):
 Put(side+' Foot',ankle,foot)
 point=ankle+foot.to_3x3()@(heads[N(side+' Toe0')]-heads[N(side+' Foot')])
 Put(side+' Toe0',point,toe)

def FootRot(index,side,rotations):
 weight,contact,t=Contact(index,side)
 f=rotations[side+' Foot'].to_euler('XYZ');toe=rotations[side+' Toe0'].to_euler('XYZ')
 if motion['kind']=='walk':
  flat=Window(t,8,118,10)
  f.x*=1-flat*.94;f.y*=1-weight*.95;f.z*=1-weight*.7
  toe.x=toe.x*(1-weight)+min(0.,f.x)*weight;toe.y*=1-weight;toe.z=f.z
 elif motion['kind']=='kneel':
  if side=='L':f.x=0;f.y=0;f.z*=.2;toe.x=0;toe.y=0;toe.z=f.z
  else:
   k=Smooth((t-27)/18)*(1-Smooth((t-118)/24))
   f.x=f.x*k;f.y*=.12;f.z*=.35
   toe.x=min(0.,f.x)*k;toe.y=0;toe.z=f.z
 else:
  f.y*=1-weight*.9;f.z*=.5
  if side=='L':f.x*=1-weight*.9
  toe.x=min(0.,f.x);toe.y=0;toe.z=f.z
 return f.to_matrix().to_4x4(),toe.to_matrix().to_4x4()

# Geometric sole markers, measured once from the unchanged original skin.
for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
points,_=MeshPoints();markers={}
for side,pts in points.items():
 low=min(p.z for p in pts);ids=[i for i,p in enumerate(pts) if p.z<low+.018]
 front=min(pts[i].y for i in ids)
 markers[side]=[i for i in ids if pts[i].y<front+.035]
def Marker(pts,side):return sum((pts[i] for i in markers[side]),Vector())/len(markers[side])

base=[]
for i in range(count+1):
 positions,rotations=BasePose(i)
 pts,_=MeshPoints();correction=ground-min(p.z for values in pts.values() for p in values)
 positions,rotations=BasePose(i,correction)
 # Align the three kneel clips to the same source coordinate system.
 offset=Vector((0,0,0))
 if clip=='KneelHold':offset=Vector((.047,.024,0))*ratio
 if clip=='KneelToStand':offset=Vector((.060,.025,0))*ratio
 if offset.length:
  for part in positions:positions[part]+=offset;Put(part,positions[part],rotations[part])
 foot={s:FootRot(i,s,rotations) for s in ['L','R']}
 for s in ['L','R']:PlaceFoot(s,positions[s+' Foot'],*foot[s])
 pts,knees=MeshPoints()
 base.append({'positions':{p:v.copy() for p,v in positions.items()},'rotations':rotations,'foot':foot,
  'correction':correction,'offset':offset,'soles':{s:min(p.z for p in ps) for s,ps in pts.items()},
  'markers':{s:Marker(ps,s) for s,ps in pts.items()}})

speed=.255*scale
anchors={}
for side in ['L','R']:
 if motion['kind']=='walk':
  start={'L':46,'R':151}[side]
  samples=[(start+t)%count for t in range(10,131)]
  y=float(np.mean([base[i]['markers'][side].y-speed*(t+10)/60 for t,i in enumerate(samples)]))
  anchors[side]=Vector(((.15 if side=='L' else -.18)*scale,y,ground))

def Restore(i,drop):
 positions,rotations=BasePose(i,base[i]['correction']-drop)
 for part in positions:
  positions[part]+=base[i]['offset'];Put(part,positions[part],rotations[part])
 return positions,rotations

def Target(i,side):
 b=base[i];w,contact,t=Contact(i,side);ankle=b['positions'][side+' Foot'].copy()
 desired=b['markers'][side].copy()
 if motion['kind']=='walk':desired=anchors[side]+Vector((0,speed*t/60,0))
 elif motion['kind']=='kneel':
  if side=='L':desired=Vector((.29,-.225,ground))*scale;desired.z=ground
  else:
   a=Vector((-.17,.02,ground))*scale;bpos=Vector((-.23,.22,ground))*scale
   k=Smooth((t-27)/18)*(1-Smooth((t-120)/24));desired=a.lerp(bpos,k);desired.z=ground
 else:
  if side=='L':
   k=Smooth((t-40)/36);desired=Vector((.105+.145*k,-.08-.18*k,ground))*scale
  else:
   k=Smooth((t-118)/22);desired=Vector((-.13,-.05-.12*k,ground))*scale
  desired.z=ground
 ankle.x+=(desired.x-base[i]['markers'][side].x)*w
 ankle.y+=(desired.y-base[i]['markers'][side].y)*w
 clearance=max(0.,base[i]['soles'][side])*(1-w)
 ankle.z+=ground+clearance-base[i]['soles'][side]
 return ankle,ground+clearance,desired,contact,w

def SolveFeet(i,drop,targets):
 positions,rotations=Restore(i,drop)
 for side in ['L','R']:
  ankle,level,anchor,contact,w=targets[side];ankle=ankle.copy()
  hip=positions[side+' Thigh'];pole=positions[side+' Calf']-hip
  for iteration in range(2):
   SolveChain(side+' Thigh',side+' Calf',side+' Foot',hip,ankle,pole,rotations)
   PlaceFoot(side,ankle,*base[i]['foot'][side])
   ps,_=MeshPoints();ankle.z+=level-min(p.z for p in ps[side])
   if contact:
    m=Marker(ps[side],side);ankle.x+=anchor.x-m.x;ankle.y+=anchor.y-m.y
  SolveChain(side+' Thigh',side+' Calf',side+' Foot',hip,ankle,pole,rotations)
  PlaceFoot(side,ankle,*base[i]['foot'][side])
 return positions,rotations

def Basis(direction,normal):
 x=direction.normalized();y=(normal-x*normal.dot(x)).normalized();z=x.cross(y).normalized()
 return Matrix((x,y,z)).transposed()

def HoldRifle(positions,rotations):
 chest=rotations['Spine2'].to_3x3();forward=chest@Vector((0,-1,0));forward.z*=.25;forward.normalize()
 right=Vector((-forward.y,forward.x,0)).normalized();up=Vector((0,0,1))
 grip=positions['R UpperArm']+forward*(.14*scale)+right*(.11*scale)-up*(.09*scale)
 z=-forward;x=up.cross(z).normalized();y=z.cross(x).normalized()
 matrix=Matrix((x,y,z)).transposed().to_4x4();matrix.translation=grip
 SetRifle(matrix)
 gripDistance=.245*scale
 report={}
 for side in ['L','R']:
  point=grip if side=='R' else matrix@Vector((0,-.012,-gripDistance))
  direction=(forward*.4+up*.9165).normalized() if side=='R' else forward
  normal=right if side=='R' else up
  source=Basis(rest[N(side+' Hand')].to_3x3().col[0],rest[N(side+' Hand')].to_3x3().col[1])
  delta=(Basis(direction,normal)@source.transposed()).to_4x4()
  palm=rest[N(side+' Hand')].to_3x3().col[0].normalized()*(.065*scale)+rest[N(side+' Hand')].to_3x3().col[1].normalized()*(.015*scale)
  wrist=point-delta.to_3x3()@palm
  shoulder=positions[side+' UpperArm'];pole=positions[side+' Forearm']-shoulder
  pole=pole*.6+Vector((.10 if side=='L' else -.10,0,-.22))*scale
  SolveChain(side+' UpperArm',side+' Forearm',side+' Hand',shoulder,wrist,pole,rotations)
  Put(side+' Hand',wrist,delta)
  actual=(arm.matrix_world@arm.pose.bones[N(side+' Hand')].matrix@rest[N(side+' Hand')].inverted())
  report[side]={'target':list(point),'actual':list(wrist+delta.to_3x3()@palm),'distance':(wrist+delta.to_3x3()@palm-point).length}
 return report

name='Animation_'+faction+'_'+clip
for a in list(bpy.data.actions):
 if a.name in [name,name+'_Rifle']:bpy.data.actions.remove(a)
action=bpy.data.actions.new(name);action.use_fake_user=True;arm.animation_data_create();arm.animation_data.action=action
weaponAction=bpy.data.actions.new(name+'_Rifle');weaponAction.use_fake_user=True;rifle.animation_data_create();rifle.animation_data.action=weaponAction
scene.render.fps=60;scene.frame_start=1;scene.frame_end=count+1
minimumDrops=[]
for index in range(count+1):
 required=0.
 for side in ['L','R']:
  hip=base[index]['positions'][side+' Thigh'];ankle=Target(index,side)[0]
  reach=(heads[N(side+' Calf')]-heads[N(side+' Thigh')]).length+(heads[N(side+' Foot')]-heads[N(side+' Calf')]).length-.008
  horizontal=(hip.x-ankle.x)**2+(hip.y-ankle.y)**2
  required=max(required,hip.z-ankle.z-math.sqrt(max(.01,reach*reach-horizontal)))
 minimumDrops.append(required)
if motion['kind']=='walk':
 envelope=[max(minimumDrops[(i+j)%count]-.003*abs(j) for j in range(-14,15)) for i in range(count)]
 weights=np.exp(-np.arange(-5,6,dtype=float)**2/8);weights/=sum(weights)
 minimumDrops=[max(minimumDrops[i],sum(weights[j+5]*envelope[(i+j)%count] for j in range(-5,6)))+.002 for i in range(count)]
 minimumDrops.append(minimumDrops[0])
samples=[];previous={}
for i in range(count+1):
 index=i%count if motion['loop'] else i;targets={s:Target(index,s) for s in ['L','R']}
 # Anticipate reach correction during gait to avoid a one-frame pelvis drop.
 drop=minimumDrops[index]
 source=motion['sourceFrameIndices'][index]
 kneelWeight=Smooth((source-40)/24)*(1-Smooth((source-101)/14)) if motion['kind']=='kneel' else 0.
 positions,rotations=SolveFeet(index,drop,targets)
 if kneelWeight>0:
  _,ks=MeshPoints();initialKnee=min(p.z for p in ks['R'])
  targetKnee=initialKnee*(1-kneelWeight)+ground*kneelWeight
  for iteration in range(12):
   _,ks=MeshPoints();error=min(p.z for p in ks['R'])-targetKnee
   if abs(error)<.0004:break
   drop+=error*.65
   positions,rotations=SolveFeet(index,drop,targets)
 gripReport={}
 if motion['kind']=='throw':RiflePose(positions,rotations)
 else:gripReport=HoldRifle(positions,rotations)
 pts,ks=MeshPoints()
 samples.append({'frame':i+1,'sourceFrame':source,'drop':drop,
  'heads':{p:list(arm.matrix_world@arm.pose.bones[N(p)].head) for p in mapping},
  'soles':{s:min(p.z for p in ps) for s,ps in pts.items()},'knees':{s:min(p.z for p in ps) for s,ps in ks.items()},
  'toe':{s:list(Marker(ps,s)) for s,ps in pts.items()},'contact':{s:targets[s][3] for s in ['L','R']},
  'kneeContact':kneelWeight>.999,'grips':gripReport,
  'rifleChest':[list(row) for row in ((arm.matrix_world@arm.pose.bones[N('Spine2')].matrix).inverted()@rifle.matrix_world)]})
 for b in arm.pose.bones:
  q=b.rotation_quaternion.copy()
  if b.name in previous and q.dot(previous[b.name])<0:q.negate()
  b.rotation_quaternion=q;previous[b.name]=q.copy()
  for path in ['location','rotation_quaternion','scale']:b.keyframe_insert(data_path=path,frame=i+1,group=b.name)
 for path in ['location','rotation_quaternion','scale']:rifle.keyframe_insert(data_path=path,frame=i+1)
for a in [action,weaponAction]:
 for layer in a.layers:
  for strip in layer.strips:
   for bag in strip.channelbags:
    for curve in bag.fcurves:
     for key in curve.keyframe_points:key.interpolation='LINEAR'
     if motion['loop']:curve.modifiers.new('CYCLES')
action['source']=motion['source'];action['loop']=motion['loop'];action['speedMps']=speed if motion['kind']=='walk' else 0.
scene['taskState']='Contact and weapon cleanup';scene['selectedClip']=clip
scene.frame_set(2);scene.frame_set(1)
(runtime/f'Data_{faction}_{clip}_finalMeasurements.json').write_text(json.dumps({'ratio':ratio,'speedMps':speed,'markerVertexOrdinals':markers,'frames':samples}),encoding='utf-8')
print(name,len(samples),'corrected frames',flush=True)
