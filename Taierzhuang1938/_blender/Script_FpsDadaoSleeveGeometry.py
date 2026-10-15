"""Real skinned sleeve/sword clearance for elbow candidates; no Blender API.

All GLB skinned primitives participate. The wrist/hand connection is excluded
by clipping to the middle20–68% of the forearm. Circular sleeve envelopes are
diagnostic only: an outward fabric bulge must not fill empty space around it.
"""
import importlib.util, re
import numpy as np


def M(values):return np.asarray(values,dtype=float).reshape(4,4).T
def Name(value):return re.sub(r'[^a-z0-9]','',value.lower())
def Unit(v):return v/max(np.linalg.norm(v),1e-30)
def Frame(direction,normal):
 z=Unit(direction)
 if z@z<1e-10:z=np.array([0.,0.,-1.])
 y=normal-z*(normal@z)
 if y@y<1e-10:
  y=np.array([1.,0.,0.]) if abs(z[1])>.85 else np.array([0.,1.,0.]);y-=z*(y@z)
 y=Unit(y);x=Unit(np.cross(y,z));return np.column_stack([x,np.cross(z,x),z])


def Clip(triangle,fractions,lo=.20,hi=.68):
 polygon=list(zip(triangle,fractions))
 for bound,sign in [(lo,1),(hi,-1)]:
  result=[]
  for i,(point,value) in enumerate(polygon):
   previous,pv=polygon[i-1];inside=(pv-bound)*sign>=0;nextInside=(value-bound)*sign>=0
   if inside!=nextInside:result.append((previous+(point-previous)*((bound-pv)/(value-pv)),bound))
   if nextInside:result.append((point,value))
  polygon=result
  if not polygon:return []
 return [np.array([polygon[0][0],polygon[i][0],polygon[i+1][0]]) for i in range(1,len(polygon)-1)]


def PointTriangle(point,t):
 a,b,c=t;ab=b-a;ac=c-a;n=np.cross(ab,ac);nn=n@n;u=np.cross(point-a,ac)@n/max(nn,1e-30);v=np.cross(ab,point-a)@n/max(nn,1e-30);best=np.linalg.norm(point-a-u*ab-v*ac) if nn>1e-25 and u>=0 and v>=0 and u+v<=1 else np.inf
 for x,y in [(a,b),(b,c),(c,a)]:
  edge=y-x;mix=np.clip((point-x)@edge/max(edge@edge,1e-30),0,1);best=min(best,np.linalg.norm(point-x-edge*mix))
 return best


def SegmentDistance(p1,q1,p2,q2):
 d1=q1-p1;d2=q2-p2;r=p1-p2;a=d1@d1;e=d2@d2;f=d2@r
 if a<=1e-25 and e<=1e-25:return np.linalg.norm(r)
 if a<=1e-25:s=0.;t=np.clip(f/e,0,1)
 else:
  c=d1@r
  if e<=1e-25:t=0.;s=np.clip(-c/a,0,1)
  else:
   b=d1@d2;den=a*e-b*b;s=np.clip((b*f-c*e)/den,0,1) if den>1e-25 else 0.;t=(b*s+f)/e
   if t<0:t=0.;s=np.clip(-c/a,0,1)
   elif t>1:t=1.;s=np.clip((b-c)/a,0,1)
 return np.linalg.norm(r+d1*s-d2*t)


def SegmentHits(start,end,t):
 direction=end-start;a,b,c=t;e1=b-a;e2=c-a;h=np.cross(direction,e2);det=e1@h
 if abs(det)<1e-16:return False
 v=start-a;u=(v@h)/det;q=np.cross(v,e1);w=(direction@q)/det;at=(e2@q)/det
 return u>=-1e-10 and w>=-1e-10 and u+w<=1+1e-10 and -1e-10<=at<=1+1e-10


def TriangleDistance(a,b):
 if any(SegmentHits(a[i],a[(i+1)%3],b) or SegmentHits(b[i],b[(i+1)%3],a) for i in range(3)):return 0.
 return min([PointTriangle(p,b) for p in a]+[PointTriangle(p,a) for p in b]+[SegmentDistance(a[i],a[(i+1)%3],b[j],b[(j+1)%3]) for i in range(3) for j in range(3)])


class SleeveGeometry:
 def __init__(self,project,trace,sword,margin=.001):
  self.trace=trace;self.sword=sword;self.lo=sword.min(1);self.hi=sword.max(1);self.margin=margin;self.cache={};self.meshes=[]
  spec=importlib.util.spec_from_file_location('DadaoSleeveGlbCodec',project/'_blender/Script_FpsGripCorrectiveCodec.py');codec=importlib.util.module_from_spec(spec);spec.loader.exec_module(codec);doc,binary,_=codec.ReadGlb(project/'Model/Model_FpsHanYangHands.glb')
  for ni,node in enumerate(doc['nodes']):
   if 'mesh'not in node or 'skin'not in node:continue
   # The bundled GLTFLoader binds with _identityMatrix (line4232), and the
   # live export confirms bindMatrix=I. Applying the glTF node transform again
   # would double-apply the original centimetre/orientation carrier.
   skin=doc['skins'][node['skin']];names=[Name(doc['nodes'][j]['name']) for j in skin['joints']];binds=codec.Accessor(doc,binary,skin['inverseBindMatrices']);bind=np.eye(4)
   for primitive in doc['meshes'][node['mesh']]['primitives']:
    a=primitive['attributes'];rest=codec.Accessor(doc,binary,a['POSITION']);ids=codec.Accessor(doc,binary,a['JOINTS_0']).astype(int);weights=codec.NormalizeWeights(codec.Accessor(doc,binary,a['WEIGHTS_0']));faces=codec.Accessor(doc,binary,primitive['indices']).astype(int).reshape(-1,3);owner=np.array(names)[ids[np.arange(len(ids)),weights.argmax(1)]]
    for side in ['r','l']:
     selected=faces[np.array([bool(re.search(side+r'[_ ]?forearm$',name,re.I)) for name in owner])[faces].any(1)]
     if not len(selected):continue
     take=np.unique(selected);lookup=np.full(len(rest),-1,int);lookup[take]=np.arange(len(take))
     targetNames=doc['meshes'][node['mesh']].get('extras',{}).get('targetNames',[])
     for targetName,target in zip(targetNames,primitive.get('targets',[])):
      if targetName in ['Grip_DadaoLeftContact','Grip_DadaoRightContact'] and 'POSITION'in target:assert abs(codec.Accessor(doc,binary,target['POSITION'])[take]).max()<1e-7,'Sleeve corrective requires current evaluated morph positions'
     self.meshes.append({'side':side,'name':node.get('name','skin'),'names':names,'binds':list(map(M,binds)),'bind':bind,'rest':np.c_[rest[take],np.ones(len(take))],'ids':ids[take],'weights':weights[take],'faces':lookup[selected]})
  assert all(any(m['side']==side for m in self.meshes) for side in ['r','l'])

 def Source(self,i,mesh):
  key=(i,id(mesh))
  if key in self.cache:return self.cache[key]
  record=self.trace['sourceFrames'][i];frame=self.trace['clips'][0]['frames'][i];carrier=M(record['weapon'])@np.linalg.inv(M(frame['weapon']));worlds={Name(name):np.linalg.inv(carrier)@M(value) for name,value in zip(self.trace['boneNames'],record['bones'])};T=np.array([worlds[name]@bind@mesh['bind'] for name,bind in zip(mesh['names'],mesh['binds'])]);components=np.einsum('nkij,nj->nki',T[mesh['ids']],mesh['rest'])[...,:3]*mesh['weights'][:,:,None];point=components.sum(1);pick=lambda role:next((name,m) for name,m in worlds.items() if re.search(mesh['side']+r'[_ ]?'+role+'$',name,re.I));upperName,upper=pick('upperarm');foreName,forearm=pick('forearm');_,hand=pick('hand');result={'worlds':worlds,'upper':upper,'forearm':forearm,'hand':hand,'point':point,'components':{}}
  for role,name in [('upper',upperName),('forearm',foreName)]:
   which=mesh['ids']==mesh['names'].index(name);result['components'][role]=(np.sum(components*which[:,:,None],axis=1),np.sum(mesh['weights']*which,axis=1))
  self.cache[key]=result;return result

 def Check(self,i,side,elbow,wrist,normal,weapon):
  minimum=self.margin;tested=0;nearPairs=0;participants=[];axis=Unit(wrist-elbow);length=np.linalg.norm(wrist-elbow);invWeapon=np.linalg.inv(weapon)
  for mesh in self.meshes:
   if mesh['side']!=side:continue
   source=self.Source(i,mesh);oldUpper=source['upper'][:3,3];oldElbow=source['forearm'][:3,3];oldWrist=source['hand'][:3,3];point=source['point'].copy()
   for role,origin,newOrigin,oldDirection,newDirection in [('upper',oldUpper,oldUpper,oldElbow-oldUpper,elbow-oldUpper),('forearm',oldElbow,elbow,oldWrist-oldElbow,wrist-elbow)]:
    delta=Frame(newDirection,normal)@Frame(oldDirection,normal).T;trans=newOrigin-delta@origin;components,weight=source['components'][role];point+=components@(delta-np.eye(3)).T+weight[:,None]*trans
   fraction=(point-elbow)@axis/length;local=(np.c_[point,np.ones(len(point))]@invWeapon.T)[:,:3];tri=local[mesh['faces']];ft=fraction[mesh['faces']];eligible=(ft.min(1)<=.68)&(ft.max(1)>=.2);tested+=int(eligible.sum());participants.append(mesh['name']);broad=eligible&((tri.min(1)<=self.hi.max(0)+self.margin)&(tri.max(1)>=self.lo.min(0)-self.margin)).all(1)
   for fi in np.where(broad)[0]:
    for st in Clip(tri[fi],ft[fi]):
     lo=st.min(0);hi=st.max(0);targets=np.where(((self.lo<=hi+self.margin)&(self.hi>=lo-self.margin)).all(1))[0];nearPairs+=len(targets)
     for gi in targets:minimum=min(minimum,TriangleDistance(st,self.sword[gi]))
  return {'clearanceM':float(minimum),'testedSleeveTriangles':tested,'nearTrianglePairs':nearPairs,'submeshes':participants,'method':'All actual skinned sleeve primitives, middle20–68% clipped triangles, 1mm sword surface distance; capped at required margin'}
