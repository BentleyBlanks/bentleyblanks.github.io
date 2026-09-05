"""Blender MCP melee authoring. World-space IK on untouched source bind skeletons.
Run in Scene_MeleeCombat.blend via execute_blender_code, MELEE_FACTION='Nra'/'Ija'.
Animation data is sampled from evaluated Blender bones, rest-relative in glTF coordinates.
Runtime retargets world rotation deltas to each original model's bind axes and limb lengths.
"""
from pathlib import Path
import json, math
import bpy
from mathutils import Matrix, Vector, Quaternion
root = Path(globals()['MELEE_PROJECT_ROOT']) if globals().get('MELEE_PROJECT_ROOT') else Path(__file__).resolve().parents[1] if globals().get('__file__') else Path()
if not (root/'Data_MeleeCombat.mjs').is_file():raise RuntimeError('Set MELEE_PROJECT_ROOT to the repository Taierzhuang1938 directory')
faction = globals().get('MELEE_FACTION', 'Nra')
arm = bpy.data.objects['Melee'+faction]
scene = bpy.data.scenes['Scene_MeleeCombat'];bpy.context.window.scene=scene
# Studio staging is presentation-only; restore the canonical origin before sampling.
bpy.context.view_layer.update()
arm.parent.location.x-=arm.matrix_world.translation.x
bpy.context.view_layer.update()
scene.render.fps=30
prefix='Bip002 ' if faction=='Nra' else 'Bip001 '
parts=['Pelvis','Spine','Spine1','Spine2','Neck','Head','L Clavicle','R Clavicle','L UpperArm','L Forearm','L Hand','R UpperArm','R Forearm','R Hand','L Thigh','L Calf','L Foot','R Thigh','R Calf','R Foot']
parts += [b.name[len(prefix):] for b in arm.pose.bones if 'Finger' in b.name]
# Imports can carry object action channels. Clear only the two task-owned rigs' motion.
arm.animation_data_clear()
for b in arm.pose.bones: b.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
rest={p:(arm.matrix_world@arm.pose.bones[prefix+p].matrix).copy() for p in parts}
head={p:m.translation.copy() for p,m in rest.items()}
armInverse=arm.matrix_world.inverted()
convert=Matrix.Rotation(-math.pi/2,4,'X')
rotConvert=convert.to_quaternion()
frames=30
clips={}
if globals().get('MELEE_ACTIONS'):
 text=(root/('Data_Melee'+faction+'Animations.mjs')).read_text(encoding='utf-8')
 clips=json.loads(text.split(' = ',1)[1].strip().rstrip(';'))['clips']
Rotation=lambda axis, angle: Matrix.Rotation(angle,4,axis)
def Smooth(t):
 t=max(0,min(1,t));return t*t*(3-2*t)
def Segment(t,a,b):return Smooth((t-a)/(b-a))
def Envelope(t,start,peak,end):return Segment(t,start,peak)*(1-Segment(t,peak,end))
def Put(part,p,r):
 m=r@rest[part];m.translation=p
 arm.pose.bones[prefix+part].matrix=armInverse@m
 bpy.context.view_layer.update()
def Aim(part,child,p,target):
 initial=head[child]-head[part];desired=target-p
 r=initial.rotation_difference(desired).to_matrix().to_4x4()
 Put(part,p,r);return r

def Joint(start,end,upper,lower,pole):
 delta=end-start;d=min(delta.length,upper+lower-.001)
 axis=delta.normalized();along=(upper*upper-lower*lower+d*d)/(2*d)
 bend=pole-axis*pole.dot(axis)
 if bend.length<.001:bend=Vector((0,-1,0))
 bend.normalize()
 return start+axis*along+bend*math.sqrt(max(0,upper*upper-along*along)), start+axis*d

def Canonical(action):
 return {'ParryLeft':'Parry','ParryRight':'Parry','Compact':'Light','CompactAlt':'LightAlt','Obstructed':'Deflected','WeaponClash':'Parry'}.get(action,action)

def Controls(weapon,action,t):
 variant=action;action=Canonical(action)
 bayonet=weapon=='Bayonet'
 # Timeline attack active intervals agree with Data_MeleeCombat's normalized action time.
 impact=(.21/.69 if bayonet else .17/.65)
 if action=='Heavy':impact=(.35/1.43 if bayonet else .32/1.36)
 strike=Envelope(t,max(0,impact-.12),impact+.055,.96)
 wind=(1-Segment(t,0,.30)) if action=='Heavy' else Envelope(t,0,.16,.44)
 k={'lean':.08,'twist':0.,'drop':.045,'hipY':0.,'step':0.,'handX':0.,'handY':0.,'handZ':0.,'spread':0.,'guard':0.,'fall':0.,'shake':0.}
 if action in ['Guard','Advance','Retreat']:
  k['drop']+=.006*math.sin(2*math.pi*t)
  if action!='Guard':k['step']=.14*math.sin(2*math.pi*t)*(1 if action=='Advance' else -1);k['drop']+=.01*(1-math.cos(4*math.pi*t))
 if action=='Charge':
  v=Smooth(t);k.update(handY=.10*v,handZ=(.08 if bayonet else .35)*v,twist=-.18*v,lean=-.03*v)
 if action in ['Light','LightAlt','Heavy']:
  side=-1 if action=='LightAlt' else 1
  if bayonet:k.update(handY=.12*wind-(.42 if action=='Heavy' else .29)*strike,handZ=.025*strike,lean=.08+(.26 if action=='Heavy' else .19)*strike,hipY=-.07*strike,step=-(.26 if action=='Heavy' else .18)*strike,twist=-.13*wind+.13*strike)
  else:k.update(handX=side*(.12*wind+.42*strike),handY=.08*wind-.12*strike,handZ=(.34 if action=='Heavy' else .13)*wind-(.26 if action=='Heavy' else .10)*strike,twist=side*(-.20*wind+.48*strike),lean=.08+.13*strike)
 if action=='Parry':
  v=Envelope(t,0,.18,1);k.update(handX=.24*v,handY=-.07*v,handZ=.18*v,twist=.16*v,guard=v)
 if action in ['Deflected','Hit','Pushed','BindLose']:
  v=1-Smooth(t);k.update(handX=-.27*v,handY=.12*v,handZ=-.10*v,twist=-.32*v,lean=-.18*v,drop=.07+.08*v)
 if action in ['Push','BindWin','GroundWin']:
  v=Envelope(t,0,.30,1);k.update(handX=(.04 if bayonet else .27)*v,handY=(-.23 if bayonet else -.10)*v,handZ=.12*v,lean=.08+.20*v,twist=(.04 if bayonet else .25)*v,guard=.7*v)
 if action in ['Bind','Ground','GroundLose','Pressure']:
  v=.7+.03*math.sin(8*math.pi*t);k.update(handX=.06*v,handY=-.13*v,handZ=.20*v,lean=.15,guard=v,shake=.008*math.sin(10*math.pi*t))
 if action=='Bind':
  # Runtime samples t from enemy pressure: retreating shoulders to committed forward bracing.
  k.update(lean=.04+.25*t,hipY=-.07*t,drop=.045+.045*t,handY=-.02-.12*t,handZ=.25-.14*t)
 if action=='Pressure': k.update(drop=.08,lean=.35,handZ=-.38,handY=-.25)
 if action in ['Fall','Ground','GroundWin','GroundLose','Rise']:
  fall=Smooth(t) if action=='Fall' else 1-Smooth(t) if action=='Rise' else 1
  k.update(fall=fall,drop=.045+.64*fall,hipY=.32*fall,lean=.08-1.40*fall)
 if variant=='ParryLeft':k['handX']*=-1;k['twist']*=-1
 if variant in ['Compact','CompactAlt']:
  k['handX']*=.65;k['handZ']*=.55;k['twist']*=.8;k['lean']+=.06*strike
 if variant=='Obstructed':k['handZ']+=.12*(1-Smooth(t));k['guard']=.4*(1-Smooth(t))
 if variant=='WeaponClash':k['handY']+=.05*math.sin(12*math.pi*t)*(1-t);k['guard']=.75*(1-Smooth(t))
 return k

def Pose(weapon,action,t):
 k=Controls(weapon,action,t)
 action=Canonical(action)
 pelvis=head['Pelvis']+Vector((.012*math.sin(2*math.pi*t) if action in ['Advance','Retreat'] else 0,k['hipY'],-k['drop']))
 pelvisR=Rotation('X',k['lean']*.35)@Rotation('Z',k['twist']*.45)
 Put('Pelvis',pelvis,pelvisR)
 pp,pv,pr='Pelvis',pelvis,pelvisR
 points={'Pelvis':pelvis};rotations={'Pelvis':pelvisR}
 for p,fraction in [('Spine',.5),('Spine1',.75),('Spine2',1),('Neck',.8),('Head',.7)]:
  v=pv+pr.to_3x3()@(head[p]-head[pp])
  r=Rotation('Z',k['twist']*fraction)@Rotation('X',k['lean']*fraction)
  if action=='Pressure' and p in ['Neck','Head']:r=r@Rotation('X',.40 if p=='Neck' else .65)
  Put(p,v,r);points[p]=v;rotations[p]=r;pp,pv,pr=p,v,r
 chest=points['Spine2'];chestR=rotations['Spine2']
 for side in ['L','R']:
  p=side+' Clavicle';v=chest+chestR.to_3x3()@(head[p]-head['Spine2']);Put(p,v,chestR);points[p]=v
  sh=v+chestR.to_3x3()@(head[side+' UpperArm']-head[p]);points[side+' UpperArm']=sh
  sign=1 if side=='L' else -1
  if weapon=='Bayonet': hand=Vector((-.045 if side=='L' else -.13,-.44 if side=='L' else -.16,1.16 if side=='L' else 1.17))
  else:hand=Vector((.22,-.20,1.16)) if side=='L' else Vector((-.24,-.22,1.32))
  if weapon=='Dadao' and side=='L' and action not in ['Heavy','Bind','BindWin','BindLose','Parry','Push','Ground','GroundWin','GroundLose']:
   hand+=Vector((0,0,k['handZ']*.2))
  else:hand+=Vector((k['handX'],k['handY']+k['shake'],k['handZ']))
  if weapon=='Bayonet' and action=='Pressure':
   hand=Vector((-.10,.03-.04*t,1.65-.10*t)) if side=='R' else Vector((-.08,-.32-.04*t,.99-.08*t))
  if weapon=='Bayonet' and action in ['Bind','BindWin','BindLose']:
   hand=Vector((-.25,-.38,1.36)) if side=='R' else Vector((.16,-.40,1.35))
   if action=='Bind':hand+=Vector((0,.06-.12*t,.05-.10*t))
  # A lowered pelvis and supine torso carry arms into the player's overhead struggle.
  if k['fall']>0:hand=pelvis+Rotation('X',-1.2*k['fall']).to_3x3()@(hand-head['Pelvis'])
  # Canonical IJA limbs are shorter: preserve native proportions and height.
  heightScale=head['Pelvis'].z/.942464
  if k['fall']==0:hand.z*=heightScale
  upper=(head[side+' Forearm']-head[side+' UpperArm']).length
  lower=(head[side+' Hand']-head[side+' Forearm']).length
  elbow,hand=Joint(sh,hand,upper,lower,Vector((sign*.8,.10,-.65)))
  ar=Aim(side+' UpperArm',side+' Forearm',sh,elbow)
  fr=Aim(side+' Forearm',side+' Hand',elbow,hand)
  Put(side+' Hand',hand,fr@Rotation('Y',(-.25 if side=='L' else .25)))
  hip=pelvis+pelvisR.to_3x3()@(head[side+' Thigh']-head['Pelvis'])
  foot=head[side+' Foot'].copy();foot.x=sign*.18
  foot.y=(-.17 if side=='L' else .18)+k['step']*(1 if side=='L' else -1)
  foot.z+=max(0,k['step']*(-1 if side=='L' else 1))*.32
  if k['fall']>0:foot.y=-.40;foot.z+=.04*k['fall']
  upper=(head[side+' Calf']-head[side+' Thigh']).length;lower=(head[side+' Foot']-head[side+' Calf']).length
  knee,foot=Joint(hip,foot,upper,lower,Vector((0,-1,.1)))
  Aim(side+' Thigh',side+' Calf',hip,knee);Aim(side+' Calf',side+' Foot',knee,foot);Put(side+' Foot',foot,Matrix.Identity(4))
 # Fingers are flexed in the source action and evaluated with the hand.
 for b in arm.pose.bones:
  if 'Finger' in b.name:
   b.rotation_mode='XYZ';b.rotation_euler=(0,0,math.radians(74 if b.name.endswith('1') else 52))
 bpy.context.view_layer.update()
 return k

def Fp(weapon,action,t):
 # Nine keyed channels: camera carrier translation/rotation + weapon rotation about its grip.
 variant=action;bayonet=weapon=='Bayonet';k=Controls(weapon,action,t);action=Canonical(action)
 impact=(.35/1.43 if bayonet else .32/1.36) if action=='Heavy' else (.21/.69 if bayonet else .17/.65)
 strike=Envelope(t,impact-.12,impact+.07,.92)
 wind=(1-Segment(t,0,.30)) if action=='Heavy' else Envelope(t,0,.16,.44)
 p=[0.,0.,0.];r=[0.,0.,0.];s=[0.,0.,0.]
 if action in ['Light','LightAlt','Heavy']:
  if bayonet:
   p=[-.025*wind,.02*wind,.06*wind-(.31 if action=='Heavy' else .22)*strike]
   r=[.08*wind-.045*strike,.06*wind-.05*strike,-.05*wind]
  else:
   side=-1 if action=='LightAlt' else 1
   p=[.035*wind-.12*strike,.045*wind-.12*strike,.035*wind-.14*strike]
   r=[0.,0.,-.18*strike*side]
   s=[-.75*wind+(1.14 if action=='Heavy' else 1.20 if action=='LightAlt' else 1.35)*strike,side*(.22*wind-.38*strike),side*(.10*wind+.38*strike)]
 if action=='Charge':
  u=Smooth(t);p=[-.025*u,.02*u,.06*u] if bayonet else [.035*u,.045*u,.035*u]
  r=[.08*u,.06*u,-.05*u] if bayonet else [0.,0.,0.]
  if not bayonet:s=[-.75*u,-.15*u,.10*u]
 if action=='Parry':
  u=Envelope(t,0,.18,1);p=[-.1*u,.02*u,-.025*u]
  if bayonet:r=[0.,.38*u,.95*u]
  else:s=[.25*u,.18*u,-1.0*u]
 if action in ['Bind','Ground','GroundLose','Pressure']:
  p=[-.18,.005,-.03];p[1]+=.004*math.sin(10*math.pi*t)
  if bayonet:r=[.06,.2,1.16]
  else:s=[.4,.4,-1.35]
  if not bayonet and action in ['Ground','GroundLose','Pressure']:
   p=[-.25,-.25,-.08];r=[0.,0.,1.05];s=[.25,0.,0.]
 if action in ['Push','BindWin','GroundWin']:
  u=Envelope(t,0,.3,1);p=[(-.09 if bayonet else -.19)*u,.035*u,(-.25 if bayonet else -.10)*u]
  if bayonet:r=[0.,.2*u,.95*u]
  else:s=[.25*u,.18*u,-1.0*u]
 if action in ['Pushed','Hit','Deflected','BindLose']:
  u=1-Smooth(t);p=[-.04*u,.015*u,-.015*u];r=[.025*u,-.05*u,-.06*u]
  if bayonet:s=[.1*u,.35*u,.08*u]
 if action=='Fall':
  u=Smooth(t);p=[-.015*u,-.012*u,.005*u];s=[.18*u,.05*u,.16*u]
 if action=='Rise':
  u=1-Smooth(t);p=[-.015*u,-.012*u,.005*u];s=[.18*u,.05*u,.16*u]
 # Melee ready position accommodates the production anatomical wrist/palm frame.
 # Keep both grips readable; this carrier applies only while a bayonet is fixed.
 if variant=='ParryLeft':
  p[0]*=-.6;r[1]*=-1
  if not bayonet:s[1]*=-1;s[2]*=-.8
 if variant in ['Compact','CompactAlt']:
  p=[v*.7 for v in p];s=[v*.7 for v in s]
 if variant=='LightAlt' and not bayonet:
  s=[v*.78 for v in s]
 if variant=='WeaponClash':
  u=1-Smooth(t);p=[-.08*u,.035*u,.04*u];r=[.04*u,.15*u,.5*u] if bayonet else [0.,0.,0.];s=[.2*u,.15*u,-.7*u] if not bayonet else [0.,0.,0.]
 if variant=='Obstructed':p[2]+=.06*(1-Smooth(t));s[0]+=.2*(1-Smooth(t))
 if bayonet:p[1]+=.055;p[2]-=.12
 return [round(v,6) for v in p+r+s]


actions=['Guard','Advance','Retreat','Light','LightAlt','Charge','Heavy','Parry','Deflected','Push','Pushed','Hit','Bind','BindWin','BindLose','Fall','Ground','GroundWin','GroundLose','Pressure','Rise','ParryLeft','ParryRight','Compact','CompactAlt','Obstructed','WeaponClash']
for weapon in ['Dadao','Bayonet']:
 for actionId in globals().get('MELEE_ACTIONS',actions):
  name=weapon+actionId
  for old in list(bpy.data.actions):
   if old.name=='Animation_'+faction+name or old.name.startswith('Animation_'+faction+name+'.'):bpy.data.actions.remove(old)
  action=bpy.data.actions.new('Animation_'+faction+name);action.use_fake_user=True
  arm.animation_data_create();arm.animation_data.action=action
  action['weapon']=weapon;action['phase']=actionId;action['source']='BlenderMCP'
  data=[]
  for frame in range(frames+1):
   t=frame/frames;scene.frame_set(frame+1)
   Pose(weapon,actionId,t)
   values=[]
   for part in parts:
    bone=arm.pose.bones[prefix+part]
    matrix=arm.matrix_world@bone.matrix
    delta=matrix.to_quaternion()@rest[part].to_quaternion().inverted()
    q=rotConvert@delta@rotConvert.inverted()
    offset=convert.to_3x3()@(matrix.translation-head[part])
    values.extend(round(v,6) for v in [*offset,q.x,q.y,q.z,q.w])
    bone.rotation_mode='QUATERNION';bone.keyframe_insert('location',frame=frame+1);bone.keyframe_insert('rotation_quaternion',frame=frame+1);bone.keyframe_insert('scale',frame=frame+1)
   offset=convert.to_3x3()@((arm.matrix_world@arm.pose.bones[prefix+'Pelvis'].matrix).translation-head['Pelvis'])
   data.append([*values,*Fp(weapon,actionId,t)])
  action.pose_markers.new('Ready').frame=1
  action.pose_markers.new('Contact').frame=10 if actionId in ['Light','LightAlt','Heavy','Push'] else 1
  clips[name]={'loop':actionId in ['Guard','Advance','Retreat','Bind','Ground','Pressure'],'frames':data}
 # Save each weapon halfway through so a tool timeout cannot erase completed work.
 bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath,compress=True)
manifest={'faction':faction,'frames':frames,'parts':parts,'source':'BlenderMCP / Scene_MeleeCombat.blend','schema':2,'clips':clips}
(root/('Data_Melee'+faction+'Animations.mjs')).write_text('// Generated by Script_MeleeAnimationBake.py through Blender MCP.\nexport const MELEE_'+faction.upper()+'_ANIMATIONS = '+json.dumps(manifest,separators=(',',':'))+';\n',encoding='utf-8')
textName='Script_MeleeAnimationBake.py'
text=bpy.data.texts.get(textName) or bpy.data.texts.new(textName);text.clear();text.write((root/'_blender'/textName).read_text(encoding='utf-8-sig'));text.use_fake_user=True
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath,compress=True)
result={'faction':faction,'clips':len(clips),'framesPerClip':frames+1,'bonesPerFrame':len(parts),'source':bpy.data.filepath,'runtimeData':'Data_Melee'+faction+'Animations.mjs'}
