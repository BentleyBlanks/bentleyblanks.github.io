"""Fit the four authorized grips against evaluated production weapon geometry.

Set FPS_GRIP_PROJECT_ROOT, FPS_GRIP_INPUT and FPS_GRIP_SOURCE. Input comes from
the production skin/bone exporter; no changes to joint translations or scales.
The JSON output is also retained in the editable Blender source directory.
"""
import bpy,json,math,re
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
from mathutils.bvhtree import BVHTree

root=Path(FPS_GRIP_PROJECT_ROOT)
folder=Path(FPS_GRIP_INPUT)
source=Path(FPS_GRIP_SOURCE)
config=json.loads((folder/'Data_GripConfig.json').read_text())
source.mkdir(parents=True,exist_ok=True)
ids=globals().get('FPS_GRIP_IDS',['Grenade','GrenadeBundle','Dadao','Zb26'])
previous=source/'Data_GripFitReport.json'
reports=[r for r in json.loads(previous.read_text()) if r['weapon'] not in ids] if previous.exists() else []
def M4(v):return Matrix([v[i::4] for i in range(4)])
def Q(v):return Quaternion((v[3],*v[:3]))
def QA(q):return [round(v,9) for v in (q.x,q.y,q.z,q.w)]

for id in ids:
 pkg=json.loads((folder/('Data_'+id+'.json')).read_text())
 vertices=[Vector(t[i:i+3]) for t in pkg['gun'] for i in (0,3,6)]
 bvh=BVHTree.FromPolygons(vertices,[(i,i+1,i+2) for i in range(0,len(vertices),3)])
 def Signed(v):
  p,n,index,d=bvh.find_nearest(v)
  return -d if d<.022 and (v-p).dot(n)<-1e-6 else d
 chains={}
 for side in ['r','l']:
  for name,c in pkg['chain'][side].items():
   match=re.search(r'finger(\d)(\d)?$',name,re.I)
   chains[name]={**c,'side':side,'digit':int(match[1]),'segment':int(match[2] or 0),'W':M4(c['world']),'P':M4(c['parentWorld']),'axisV':Vector(c['axis']),'spreadV':Vector(c['spreadAxis']),'restQ':Q(c['rest'])}
 samples={}
 for mesh in pkg['skin']:
  for i in range(0,len(mesh['pos'])//3,5):
   infl=[(mesh['bones'][mesh['infl'][4*i+k]],mesh['wts'][4*i+k]) for k in range(4) if mesh['wts'][4*i+k]>.001]
   owner=max(infl,key=lambda pair:pair[1])[0]
   if owner not in chains:continue
   c=chains[owner];samples.setdefault((c['side'],c['digit']),[]).append((Vector(mesh['pos'][3*i:3*i+3]),infl))
 def Bones(side,digit):return sorted([name for name,c in chains.items() if c['side']==side and c['digit']==digit],key=lambda n:chains[n]['segment'])
 def FK(side,digit,parameters):
  transforms={};qs={};parent=None
  for name in Bones(side,digit):
   c=chains[name];seg=c['segment']
   if digit==0 and seg==0:
    q=Q(c['local'])
    for axis,angle in zip([Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1))],parameters[:3]):q=q@Quaternion(axis,math.radians(angle))
   else:
    angle=parameters[3+seg-1] if digit==0 else parameters[seg]
    q=c['restQ']@Quaternion(c['axisV'],math.radians(angle))
    if seg==0:q=Quaternion(c['spreadV'],math.radians(parameters[3]))@q
   W=(palmDelta@c['P'] if parent is None else parent)@Matrix.LocRotScale(Vector(c['position']),q,Vector(c['scale']))
   transforms[name]=W@c['W'].inverted();qs[str(digit)+(str(seg) if seg else '')]=QA(q);parent=W
  return transforms,qs
 for side,key in [('r','right'),('l','left')]:
  contact=config[id][key];authored={};digitReports=[]
  palmDelta=Matrix.Identity(4)
  cloud=[v for digit in range(5) for v,infl in samples.get((side,digit),[])][::3]
  padCloud=[chains[pkg['pads'][f'{side}{digit}2']['bone']]['W']@Vector(pkg['pads'][f'{side}{digit}2']['point']) for digit in range(5)]
  def RigidCost(offset):
   shifted=[Signed(v+Vector(offset)) for v in cloud]
   pen=max([max(0,-d-.0015) for d in shifted],default=0)
   gaps=[max(0,abs(Signed(v+Vector(offset)))-.003) for v in padCloud]
   return 220*pen+12*sum(gaps)+3*Vector(offset).length
  offset=[0.,0.,0.]
  if not (id=='Grenade' and side=='l'):
   best=RigidCost(offset)
   for step in [.008,.004,.002,.001]:
    for iteration in range(4):
     changed=False
     for index in range(3):
      for sign in [-1,1]:
       trial=offset.copy();trial[index]=max(-.016,min(.016,trial[index]+sign*step))
       cost=RigidCost(trial)
       if cost<best-1e-7:offset=trial;best=cost;changed=True
     if not changed:break
   palmDelta=Matrix.Translation(Vector(offset))
   contact['position']=[round(v+d,7) for v,d in zip(contact['position'],offset)]
  for digit in range(5):
   if id=='Grenade' and side=='l':continue
   if digit==0:
    parameters=[0,0,0,*contact['fingers'][0][1:]]
    bounds=[(-55,55)]*3+[(5,65),(0,65)]
   else:
    parameters=[*contact['fingers'][digit],0]
    bounds=[(0,85),(5,105),(0,65),(-14,14)]
   pts=samples.get((side,digit),[])
   pad=pkg['pads'][f'{side}{digit}2'];padBone=pad['bone'];padPoint=chains[padBone]['W']@Vector(pad['point'])
   def Evaluate(p,detail=False):
    D,qs=FK(side,digit,p);pen=0.;squared=0.
    for v,infl in pts:
     v2=sum(((D[b]@v if b in D else palmDelta@v if re.search(side+r'[_ ]?hand$',b,re.I) else v)*w for b,w in infl),Vector())
     depth=max(0.,-Signed(v2)-.0015);pen=max(pen,depth);squared+=depth*depth
    gap=abs(Signed(D[padBone]@padPoint))
    # Keep the firing index finger on the trigger's inner curved face.
    if id=='Zb26' and side=='r' and digit==1:
     gap=(D[padBone]@padPoint-Vector((.002,-.045,-.1229))).length
    cost=300*pen+30*math.sqrt(squared/max(1,len(pts)))+45*max(0,gap-.0025)
    cost+=.00004*sum(abs(a-b) for a,b in zip(p,initial))
    return (cost,pen,gap,qs) if detail else cost
   initial=parameters.copy();before=Evaluate(parameters,True)
   best=before[0];winner=parameters.copy()
   starts=[initial] if digit==0 else [initial,[20,50,25,0],[35,80,45,0],[65,55,20,0]]
   for start in starts:
    parameters=start.copy();localBest=Evaluate(parameters)
    for step in [12,6,3,1.5,.75]:
     for iteration in range(6):
      changed=False
      for index in range(len(parameters)):
       for sign in [-1,1]:
        trial=parameters.copy();trial[index]=max(bounds[index][0],min(bounds[index][1],trial[index]+sign*step))
        score=Evaluate(trial)
        if score<localBest-1e-7:parameters=trial;localBest=score;changed=True
      if not changed:break
    if localBest<best:best=localBest;winner=parameters.copy()
   parameters=winner
   after=Evaluate(parameters,True);authored.update(after[3])
   if digit!=0:contact['fingers'][digit]=parameters[:3]
   else:contact['fingers'][0]=[0,*parameters[3:]]
   digitReports.append({'digit':digit,'beforePenMm':round(before[1]*1000,3),'penMm':round(after[1]*1000,3),'gapMm':round(after[2]*1000,3),'angles':parameters})
  if authored:contact['fingerRotations']=authored
  if id=='Zb26' and side=='r':contact['triggerFingers']=contact['fingers'][1]
  reports.append({'weapon':id,'side':side,'digits':digitReports})
  print(json.dumps(reports[-1]),flush=True)

triggerPackage=json.loads((folder/'Data_Zb26.json').read_text())
trigger={}
for name,c in triggerPackage['chain']['r'].items():
 match=re.search(r'finger(1)([12])?$',name,re.I)
 if not match:continue
 key='1'+(match[2] or '')
 q=Q(config['Zb26']['right']['fingerRotations'][key])
 if match[2]:q=q@Quaternion(Vector(c['axis']),math.radians(2 if match[2]=='1' else 1))
 trigger[key]=QA(q)
config['Zb26']['right']['triggerRotations']=trigger
bladeBody={'shoulders':{'right':[.185,-.305,-.175],'left':[-.18,-.32,-.16]},'elbowPoles':{'right':[.38,-.74,.22],'left':[-.34,-.76,.18]}}
for key in ['bodyHip','bodyAds','bodySprint']:config['Dadao'][key]=bladeBody
config['GrenadeBundle']['ads']={'mode':'fixed','position':[.10,-.12,-.24],'rotation':[.28,-.1,.05]}
config['GrenadeBundle']['sprint']={'mode':'fixed','position':[.13,-.16,-.25],'rotation':[-.48,.34,.24]}
(source/'Data_FpsWeaponGrips.json').write_text(json.dumps(config,indent=2),encoding='utf-8')
(source/'Data_GripFitReport.json').write_text(json.dumps(reports,indent=2),encoding='utf-8')
text='// Blender-authored palm and finger frames; rebuild with _blender/Script_FpsWeaponGripFit.py.\n'
text+='const FreezeTree = value => { if (value && typeof value === "object") { for (const item of Object.values(value)) FreezeTree(item); Object.freeze(value); } return value; };\n'
text+='export const FPS_WEAPON_GRIPS = FreezeTree('+json.dumps(config,separators=(',',':'))+');\n'
(root/'Data_FpsWeaponGrips.mjs').write_text(text,encoding='utf-8')
print(json.dumps({'data':str(source/'Data_FpsWeaponGrips.json'),'fittedHands':len(reports)}))
