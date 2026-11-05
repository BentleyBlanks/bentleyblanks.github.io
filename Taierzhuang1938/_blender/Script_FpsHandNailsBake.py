"""Build four-finger tapers and anatomically oriented nail plates.

Run in the task-owned Blender through Script_BlenderMcp. Palm positions outside
the finger regions, the original thumb skin, skin weights, UVs, textures,
skeleton and five morphs remain byte-exact. The saved
source contains the actual imported rig and editable, weighted nail geometry.

The frozen input is selected with ``FPS_HAND_NAILS_INPUT`` (defaulting to the
production path) and must retain the basis SHA below in the full rebuild mode.
Set ``FPS_HAND_NAILS_ONLY`` for a nail-only repair: that mode accepts the
current repaired HanYang GLB, leaves the body payload byte-exact, and replaces
the existing visible nail mesh in place.  ``FPS_HAND_NAILS_OUTPUT``,
``FPS_HAND_NAILS_REPORT``, ``FPS_HAND_NAILS_SOURCE_REPORT`` and
``FPS_HAND_NAILS_BASIS_COPY`` allow a later review bake to write only into a
temporary candidate directory.  ``FPS_HAND_PROFILE_FOLDER`` and
``FPS_HAND_PROFILE_SOURCE_PATH`` similarly let that review use a copied source
blend; the defaults preserve the original task-owned paths.
"""
import bpy,base64,copy,hashlib,importlib.util,json,math,re,struct
from pathlib import Path
import numpy as np
from mathutils import Matrix,Quaternion,Vector

project=Path(FPS_PROJECT_ROOT).resolve();task=globals().get('FPS_HAND_PROFILE_TASK','FpsHanYangStockGrip_20261018');nails_only=bool(globals().get('FPS_HAND_NAILS_ONLY',False))
assert bpy.context.scene.get('BlenderMcpTask')==task
folder=Path(globals().get('FPS_HAND_PROFILE_FOLDER',Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938')/task)).resolve()
folder.mkdir(parents=True,exist_ok=True)
source=Path(globals().get('FPS_HAND_PROFILE_SOURCE_PATH',folder/globals().get('FPS_HAND_PROFILE_SOURCE_NAME','Model_FpsHanYangStockGrip.blend'))).resolve()
assert not bpy.data.filepath or Path(bpy.data.filepath).resolve()==source.resolve()
spec=importlib.util.spec_from_file_location('HandCodec',project/'_blender/Script_FpsGripCorrectiveCodec.py');codec=importlib.util.module_from_spec(spec);spec.loader.exec_module(codec)
default_input=project/('Model/Model_FpsHanYangHandsRepaired.glb' if nails_only else 'Model/Model_FpsHanYangHands.glb')
default_output=project/('Model/Model_FpsHanYangHandsRepaired_NailsOnly.glb' if nails_only else 'Model/Model_FpsHanYangHandsRepaired.glb')
input_path=Path(globals().get('FPS_HAND_NAILS_INPUT',default_input)).resolve()
output=Path(globals().get('FPS_HAND_NAILS_OUTPUT',default_output)).resolve()
project_report=Path(globals().get('FPS_HAND_NAILS_REPORT',project/('Model/Data_FpsHanYangNailSurfaceRepair.json' if nails_only else 'Model/Data_FpsHanYangHandRepair.json'))).resolve()
source_report=Path(globals().get('FPS_HAND_NAILS_SOURCE_REPORT',folder/('Data_NailSurfaceRepair.json' if nails_only else 'Data_ReferenceHandBake.json'))).resolve()
basis_copy=Path(globals().get('FPS_HAND_NAILS_BASIS_COPY',folder/'Model_ReferenceHands.glb')).resolve()
assert input_path!=output,'Nail bake input and output must be separate files'
doc,binary,basis=codec.ReadGlb(input_path)
basis_sha=hashlib.sha256(basis).hexdigest()
if not nails_only:assert basis_sha=='dffb45e2edc89050feefed0a49230175eb17e42a96b46fcdfaff872187d01a38',(str(input_path),basis_sha,'Use the preserved dffb45e2… input copy')
original=copy.deepcopy(doc);original_binary=bytes(binary)
p=codec.SkinPrimitive(doc,binary);attrs=p['attributes'];triangles=codec.Accessor(doc,binary,p['primitive']['indices']).astype(np.int64).reshape(-1,3)
node=next(n for n in doc['nodes'] if n.get('mesh')==p['meshIndex'] and 'skin'in n);skin=doc['skins'][node['skin']]
original_hand_surface=copy.deepcopy(doc.get('asset',{}).get('extras',{}).get('handSurfaceRepair'))
if nails_only:
 assert p['primitive'].get('material') is not None and doc['materials'][p['primitive']['material']].get('name')=='Material_HanYangScanSkin'
 assert len(skin.get('joints',[]))==53 and original_hand_surface and original_hand_surface.get('weapon')=='HanYang'
 nail_nodes=[(i,n) for i,n in enumerate(doc['nodes']) if n.get('name')=='Mesh_HanYangNailPlates' and n.get('mesh') is not None]
 assert len(nail_nodes)==1,('Expected exactly one visible HanYang nail node',nail_nodes)
 existing_nail_node_index,existing_nail_node=nail_nodes[0];existing_nail_mesh_index=existing_nail_node['mesh'];existing_nail_mesh=doc['meshes'][existing_nail_mesh_index]
 assert existing_nail_mesh.get('name')=='Mesh_HanYangNailPlates' and len(existing_nail_mesh.get('primitives',[]))==1
 existing_nail_primitive=existing_nail_mesh['primitives'][0];existing_nail_material_index=existing_nail_primitive.get('material')
 assert existing_nail_material_index is not None and doc['materials'][existing_nail_material_index].get('name')=='Material_HanYangScanSkin_Nails'
 original_body_meshes={i:copy.deepcopy(m) for i,m in enumerate(doc.get('meshes',[])) if i!=existing_nail_mesh_index}
 original_body_materials={i:copy.deepcopy(m) for i,m in enumerate(doc.get('materials',[])) if i!=existing_nail_material_index}
 original_accessors=copy.deepcopy(doc.get('accessors',[]));original_buffer_views=copy.deepcopy(doc.get('bufferViews',[]));original_nodes=copy.deepcopy(doc.get('nodes',[]));original_skins=copy.deepcopy(doc.get('skins',[]));original_scenes=copy.deepcopy(doc.get('scenes',[]))
 original_binary_sha=hashlib.sha256(original_binary).hexdigest()
parents={c:i for i,n in enumerate(doc['nodes']) for c in n.get('children',[])};cache={}
def World(i):
 if i not in cache:
  n=doc['nodes'][i]
  if 'matrix'in n:m=Matrix([n['matrix'][j::4] for j in range(4)])
  else:
   q=n.get('rotation',[0,0,0,1]);m=Matrix.LocRotScale(Vector(n.get('translation',[0,0,0])),Quaternion((q[3],*q[:3])),Vector(n.get('scale',[1,1,1])))
  cache[i]=World(parents[i])@m if i in parents else m
 return cache[i]
names=[doc['nodes'][i]['name'] for i in skin['joints']];norm=lambda s:re.sub('[^a-z0-9]','',s.lower())
joint_world=np.array([np.array(World(i),dtype=float) for i in skin['joints']]);inverse_binds=codec.Accessor(doc,binary,skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
frames=joint_world@inverse_binds;mesh_frame=frames.mean(0);assert np.abs(frames-mesh_frame).max()<2e-5
rest=(mesh_frame@np.c_[attrs['POSITION'],np.ones(len(attrs['POSITION']))].T).T[:,:3];inverse_frame=np.linalg.inv(mesh_frame)
# Taper each digit independently from the original scan. Do not impose a
# universal minimum enlargement: it made the curled forefingers cylindrical.
# Thumb profiles are identity and terminal shortening is zero: retain the
# original thumb skin and fix its opposition with the actual joint frames.
finger_profiles=[];new_rest=rest.copy();finger_modified=np.zeros(len(rest),dtype=bool);thumb_root_modified=[]
profiles={0:[(1.,1.),(1.,1.),(1.,1.)],1:[(1.,1.02),(.94,1.02),(.86,1.02)],2:[(.97,1.02),(.91,1.02),(.89,1.10)],3:[(.98,1.04),(.95,1.04),(.89,1.02)],4:[(1.,1.05),(.98,1.05),(.92,1.04)]}
thumb_terminal_shortening=0.
Smooth=lambda x:np.clip(x,0,1)**2*(3-2*np.clip(x,0,1))
for side in ([] if nails_only else ['l','r']):
 for digit in range(5):
  chain=[next(i for i,n in enumerate(names) if norm(n).endswith(side+'finger'+str(digit)+s)) for s in ['', '1','2']]
  mass=np.where(np.isin(attrs['JOINTS_0'],chain),attrs['WEIGHTS_0'],0).sum(1);selected=mass>(.05 if digit==0 else .75)
  if digit==0:
   forearm_ids=[i for i,n in enumerate(names) if norm(n).endswith(side+'forearm')]
   forearm_mass=np.where(np.isin(attrs['JOINTS_0'],forearm_ids),attrs['WEIGHTS_0'],0).sum(1)
   selected&=forearm_mass==0
  origins=joint_world[chain,:3,3];terminal=origins[2]-origins[1];terminal/=np.linalg.norm(terminal)
  tip_length=np.percentile((rest[selected]-origins[2])@terminal,99);knots=np.vstack([origins,origins[2]+terminal*tip_length]);lengths=np.linalg.norm(np.diff(knots,axis=0),axis=1);starts=np.r_[0,np.cumsum(lengths)];total=starts[-1]
  segment_rows=[]
  for segment in range(3):
   ji=chain[segment];matrix=joint_world[ji];inv=np.linalg.inv(matrix);local=(inv@np.c_[rest,np.ones(len(rest))].T).T[:,:3]
   own=np.where(attrs['JOINTS_0']==ji,attrs['WEIGHTS_0'],0).sum(1);cloud=local[(own>(.03 if digit==0 and segment==0 else .8))&selected]
   if len(cloud)<20:continue
   scale=np.linalg.norm(matrix[:3,0])*.7*1000.;width=float(np.percentile(cloud[:,2],95)-np.percentile(cloud[:,2],5))*scale;depth=float(np.percentile(cloud[:,1],95)-np.percentile(cloud[:,1],5))*scale
   ws,ds=profiles[digit][segment]
   segment_rows.append((segment,ji,local,ws,ds))
   finger_profiles.append({'side':side,'digit':digit,'segment':segment,'widthBeforeMm':width,'depthBeforeMm':depth,'widthScale':ws,'depthScale':ds,'widthAfterMm':width*ws,'depthAfterMm':depth*ds})
  for vertex in np.flatnonzero(selected):
   choices=[]
   for segment in range(3):
    vector=knots[segment+1]-knots[segment];t=float(np.dot(rest[vertex]-knots[segment],vector)/np.dot(vector,vector));center=knots[segment]+vector*np.clip(t,0,1);choices.append((np.linalg.norm(rest[vertex]-center),segment,starts[segment]+t*lengths[segment]))
   _,segment,along=min(choices)
   if digit==0 and min(choices)[0]>.014/.7:continue
   # Blend radial displacement fields across joints, avoiding a PIP/DIP step.
   fields=np.zeros((3,3));blend=np.zeros(3);blend[segment]=1.
   for row_segment,ji,local,ws,ds in segment_rows:
    q=local[vertex].copy();depth_scale=ds
    if digit==0 and row_segment>0 and ds!=1.:
     mm=1/(np.linalg.norm(joint_world[ji,:3,0])*.7*1000.)
     depth_scale=1.05+(ds-1.05)*float(Smooth((-q[1]+2*mm)/(4*mm)))
    q[1]*=depth_scale;q[2]*=ws
    fields[row_segment]=(joint_world[ji]@np.r_[q,1])[:3]-rest[vertex]
   transition=.004/.7
   for joint in [1,2]:
    if abs(along-starts[joint])<transition:
     t=float(Smooth((along-starts[joint]+transition)/(2*transition)))
     blend[:]=0;blend[joint-1]=1-t;blend[joint]=t
     break
   root_gate=Smooth((along-.002/.7)/(.010/.7));tip_gate=Smooth((total-along-.0005/.7)/(.003/.7));gate=float(root_gate*tip_gate*Smooth((mass[vertex]-(.025 if digit==0 else .75))/(.35 if digit==0 else .25)))
   delta=gate*(blend@fields)
   if digit==0:
    delta*=min(1.,(.0015/.7)/max(1e-12,np.linalg.norm(delta)))
    if (segment==0 or mass[vertex]<=.75) and np.linalg.norm(delta)>1e-9:thumb_root_modified.append(int(vertex))
   new_rest[vertex]=rest[vertex]+delta;finger_modified[vertex]=np.linalg.norm(new_rest[vertex]-rest[vertex])>1e-9
  if digit==0:
   ji=chain[2];inv=np.linalg.inv(joint_world[ji]);local=(inv@np.c_[new_rest,np.ones(len(new_rest))].T).T[:,:3]
   distal_mass=np.where(attrs['JOINTS_0']==ji,attrs['WEIGHTS_0'],0).sum(1)
   mm=1/(np.linalg.norm(joint_world[ji,:3,0])*.7*1000.)
   for vertex in np.flatnonzero(distal_mass>.75):
    q=local[vertex].copy();influence=float(Smooth((distal_mass[vertex]-.75)/.25)*Smooth((q[0]-.8*mm)/(4*mm)))
    q[0]-=max(0,q[0])*thumb_terminal_shortening*influence
    new_rest[vertex]=(joint_world[ji]@np.r_[q,1])[:3];finger_modified[vertex]=np.linalg.norm(new_rest[vertex]-rest[vertex])>1e-9
  for profile in [r for r in finger_profiles if r['side']==side and r['digit']==digit]:
   segment=profile['segment'];ji=chain[segment];local=(np.linalg.inv(joint_world[ji])@np.c_[new_rest,np.ones(len(new_rest))].T).T[:,:3]
   own=np.where(attrs['JOINTS_0']==ji,attrs['WEIGHTS_0'],0).sum(1);cloud=local[(own>(.03 if digit==0 and segment==0 else .8))&selected];scale=np.linalg.norm(joint_world[ji,:3,0])*.7*1000
   profile['widthAfterMm']=float(np.percentile(cloud[:,2],95)-np.percentile(cloud[:,2],5))*scale;profile['depthAfterMm']=float(np.percentile(cloud[:,1],95)-np.percentile(cloud[:,1],5))*scale
new_positions=(inverse_frame@np.c_[new_rest,np.ones(len(new_rest))].T).T[:,:3]
new_positions[~finger_modified]=attrs['POSITION'][~finger_modified]
def Normals(points):
 n=np.zeros_like(points)
 for a,b,c in triangles:
  normal=np.cross(points[b]-points[a],points[c]-points[a]);n[a]+=normal;n[b]+=normal;n[c]+=normal
 _,weld=np.unique(np.round(attrs['POSITION']/1e-6).astype(np.int64),axis=0,return_inverse=True)
 sums=np.zeros((weld.max()+1,3));np.add.at(sums,weld,n);n=sums[weld]
 n/=np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-20);return n
g0,g1=Normals(attrs['POSITION']),Normals(new_positions);normal_changed=np.linalg.norm(g1-g0,axis=1)>1e-10
new_normals=attrs['NORMAL'].astype(float).copy();new_normals[normal_changed]+=(g1-g0)[normal_changed];new_normals[normal_changed]/=np.maximum(np.linalg.norm(new_normals[normal_changed],axis=1)[:,None],1e-20)
def Store(semantic,values):
 if nails_only:return
 a=doc['accessors'][p['primitive']['attributes'][semantic]];v=doc['bufferViews'][a['bufferView']];width=values.shape[1];target=np.ndarray(values.shape,dtype='<f4',buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',width*4),4));target[:]=values
 if semantic=='POSITION':a['min']=target.min(0).tolist();a['max']=target.max(0).tolist()
Store('POSITION',new_positions);Store('NORMAL',new_normals)
if 'TANGENT'in attrs:
 tangent=attrs['TANGENT'].copy();t=tangent[:,:3]-new_normals*np.sum(tangent[:,:3]*new_normals,axis=1)[:,None];tangent[normal_changed,:3]=(t/np.maximum(np.linalg.norm(t,axis=1)[:,None],1e-20))[normal_changed];Store('TANGENT',tangent)
rest=new_rest
positions=[];joints=[];weights=[];colors=[];faces=[];nails=[];metric=.7
NAIL_RADIAL_RINGS=int(globals().get('FPS_NAIL_RADIAL_RINGS',10))
NAIL_CIRCUMFERENTIAL_SEGMENTS=int(globals().get('FPS_NAIL_CIRCUMFERENTIAL_SEGMENTS',40))
NAIL_SURFACE_OFFSET_MM=float(globals().get('FPS_NAIL_SURFACE_OFFSET_MM',.34))
NAIL_THICKNESS_MM=float(globals().get('FPS_NAIL_THICKNESS_MM',.23))
NAIL_MIN_CLEARANCE_MM=float(globals().get('FPS_NAIL_MIN_CLEARANCE_MM',.08))
NAIL_MAX_ADAPTIVE_LIFT_MM=float(globals().get('FPS_NAIL_MAX_ADAPTIVE_LIFT_MM',.20))
assert NAIL_RADIAL_RINGS>=2 and NAIL_CIRCUMFERENTIAL_SEGMENTS>=8
assert .20<=NAIL_SURFACE_OFFSET_MM<=.45 and .10<=NAIL_THICKNESS_MM<=.50
assert 0<=NAIL_MIN_CLEARANCE_MM<=.50 and .01<=NAIL_MAX_ADAPTIVE_LIFT_MM<=.50
def Linear(rgb):
 a=np.array(rgb,dtype=float)/255.;return np.where(a<=.04045,a/12.92,((a+.055)/1.055)**2.4)
bed=Linear([185,143,126]);edge=Linear([201,183,160])
def RayY(x,z,verts,tris):
 a,b,c=(verts[tris[:,i]] for i in range(3));u=b-a;v=c-a
 # Solve x/z barycentrics; choose the first dorsal (-Y) surface.
 determinant=u[:,0]*v[:,2]-u[:,2]*v[:,0];valid=np.abs(determinant)>1e-12
 qx=x-a[:,0];qz=z-a[:,2];den=np.where(valid,determinant,1)
 s=(qx*v[:,2]-qz*v[:,0])/den;t=(u[:,0]*qz-u[:,2]*qx)/den
 valid&=(s>=-1e-7)&(t>=-1e-7)&(s+t<=1+1e-7)
 if not valid.any():return None
 return float((a[:,1]+s*u[:,1]+t*v[:,1])[valid].min())
def TriangleSamples(triangle):
 a,b,c=triangle;return np.array([a,b,c,(a+b)*.5,(b+c)*.5,(c+a)*.5,(a+b+c)/3],dtype=float)
def RefineTop(top,top_faces,local,tris,mm):
 lifts=np.zeros(len(top),dtype=float);minimum=float('inf')
 if not nails_only:return top,lifts,0.
 for iteration in range(12):
  changed=False
  for face in top_faces:
   for sample in TriangleSamples(top[face]):
    surface=RayY(float(sample[0]),float(sample[2]),local,tris);assert surface is not None,('Missing nail surface ray',side,digit,iteration)
    gap=(surface-sample[1])/mm;minimum=min(minimum,gap);deficit=NAIL_MIN_CLEARANCE_MM-gap
    if deficit>1e-6:
     for vertex in face:
      lifts[vertex]+=deficit;assert lifts[vertex]<=NAIL_MAX_ADAPTIVE_LIFT_MM,(side,digit,int(vertex),lifts[vertex],NAIL_MAX_ADAPTIVE_LIFT_MM)
      top[vertex,1]-=deficit*mm
     changed=True
  if not changed:break
 minimum=min((RayY(float(sample[0]),float(sample[2]),local,tris)-sample[1])/mm for face in top_faces for sample in TriangleSamples(top[face]))
 assert minimum>=NAIL_MIN_CLEARANCE_MM-1e-5,(side,digit,minimum,NAIL_MIN_CLEARANCE_MM)
 return top,lifts,minimum
for side in ['l','r']:
 for digit in range(5):
  ji=next(i for i,n in enumerate(names) if norm(n).endswith(side+'finger'+str(digit)+'2'))
  mass=np.where(attrs['JOINTS_0']==ji,attrs['WEIGHTS_0'],0).sum(1);pure=mass>.95
  matrix=joint_world[ji];inv=np.linalg.inv(matrix);local=(inv@np.c_[rest,np.ones(len(rest))].T).T[:,:3]
  nail_basis=np.eye(3)
  if digit==0:
   find=lambda suffix:next(i for i,n in enumerate(names) if norm(n).endswith(side+suffix))
   hand=joint_world[find('hand'),:3,3];forward=joint_world[find('finger2'),:3,3]-hand;forward/=np.linalg.norm(forward)
   across=joint_world[find('finger1'),:3,3]-joint_world[find('finger4'),:3,3]
   if side=='l':across=-across
   dorsal=np.cross(forward,across);dorsal/=np.linalg.norm(dorsal)
   long_world=joint_world[ji,:3,3]-joint_world[find('finger01'),:3,3];long_world/=np.linalg.norm(long_world)
   hinge=np.cross(long_world,-dorsal);hinge/=np.linalg.norm(hinge);palmar_world=np.cross(hinge,long_world);palmar_world/=np.linalg.norm(palmar_world)
   rotation=matrix[:3,:3]/np.linalg.norm(matrix[:3,0]);long_bone=rotation.T@long_world;palmar_bone=rotation.T@palmar_world
   long_bone/=np.linalg.norm(long_bone);palmar_bone-=long_bone*np.dot(long_bone,palmar_bone);palmar_bone/=np.linalg.norm(palmar_bone)
   nail_basis=np.column_stack([long_bone,palmar_bone,np.cross(long_bone,palmar_bone)]);local=local@nail_basis
  cloud=local[pure];assert len(cloud)>20
  scale=float(np.linalg.norm(matrix[:3,0]))*metric;mm=1/(scale*1000)
  x0,x1=np.percentile(cloud[:,0],[2,99]);span=x1-x0;assert span>8*mm
  length=min([14,12.5,13.2,12.5,10.2][digit]*mm,span*.72)
  end=x1-1.8*mm;start=max(x0+span*.18,end-length);center=(start+end)*.5
  width=min([12.4,10.0,10.8,10.0,8.2][digit]*mm,float(np.percentile(cloud[:,2],97)-np.percentile(cloud[:,2],3))*.75)
  half_width=width*.5;half_length=(end-start)*.5;zc=float(np.median(cloud[:,2]))
  selected=np.all(mass[triangles]>.65,axis=1);tris=triangles[selected];assert len(tris)>50
  section_cache={}
  def ThumbSection(x):
   # Track the actual dorsal crown along the thumb. A single median of the
   # whole asymmetric scan places the nail on its sloping side near the tip.
   key=round(float(x),8)
   if key not in section_cache:
    zs=np.linspace(float(cloud[:,2].min()),float(cloud[:,2].max()),65)
    samples=[(float(y),float(z)) for z in zs if (y:=RayY(x,z,local,tris)) is not None]
    assert len(samples)>5,('Missing actual thumb cross-section',side,x)
    low=min(z for y,z in samples);high=max(z for y,z in samples);cy,cz=min(samples)
    step=float(zs[1]-zs[0])
    for iteration in range(4):
     refined=[(float(y),float(z)) for z in np.linspace(cz-step,cz+step,9) if (y:=RayY(x,z,local,tris)) is not None]
     cy,cz=min(refined);step*=.25
    section_cache[key]=(cz,min(half_width,max(.2*mm,cz-low)*.9,max(.2*mm,high-cz)*.9))
   return section_cache[key]
  top=[];fallback=0
  # A rounded rectangle with a domed surface following the actual dorsal skin.
  params=[(0.,0.)]+[(radius*math.copysign(abs(math.cos(angle))**.58,math.cos(angle)),radius*math.copysign(abs(math.sin(angle))**.58,math.sin(angle))) for radius in np.linspace(1/NAIL_RADIAL_RINGS,1.,NAIL_RADIAL_RINGS) for angle in np.linspace(0,2*math.pi,NAIL_CIRCUMFERENTIAL_SEGMENTS,endpoint=False)]
  for u,v in params:
   x=center+half_length*u
   if digit==0:
    crown,available_half_width=ThumbSection(x);z=crown+available_half_width*v
   else:z=zc+half_width*v
   y=RayY(x,z,local,tris)
   if y is None:
    delta=((cloud[:,0]-x)/max(half_length,1e-6))**2+((cloud[:,2]-z)/max(half_width,1e-6))**2
    nearest=cloud[np.argsort(delta)[:6]];y=float(nearest[:,1].min());fallback+=1
   top.append([x,y-NAIL_SURFACE_OFFSET_MM*mm,z])
  assert fallback<=max(8,NAIL_CIRCUMFERENTIAL_SEGMENTS//4),('Nail must fit a real skin surface',side,digit,fallback)
  top=np.array(top);top_faces=[]
  for n in range(NAIL_CIRCUMFERENTIAL_SEGMENTS):top_faces.append([0,1+n,1+(n+1)%NAIL_CIRCUMFERENTIAL_SEGMENTS])
  for ring in range(NAIL_RADIAL_RINGS-1):
   a=1+NAIL_CIRCUMFERENTIAL_SEGMENTS*ring;b=a+NAIL_CIRCUMFERENTIAL_SEGMENTS
   for n in range(NAIL_CIRCUMFERENTIAL_SEGMENTS):j=(n+1)%NAIL_CIRCUMFERENTIAL_SEGMENTS;top_faces.extend([[a+n,b+n,b+j],[a+n,b+j,a+j]])
  top=np.asarray(top,dtype=float);top,adaptive_lifts,min_clearance=RefineTop(top,np.asarray(top_faces,dtype=np.int64),local,tris,mm)
  bottom=top.copy();bottom[:,1]+=NAIL_THICKNESS_MM*mm;local_nail=np.vstack([top,bottom]);count=len(top);base=len(positions)
  bone_nail=local_nail@nail_basis.T;world=(matrix@np.c_[bone_nail,np.ones(len(bone_nail))].T).T
  native=(inverse_frame@world.T).T[:,:3];positions.extend(native.tolist())
  for k,point in enumerate(local_nail):
   joints.append([ji,0,0,0]);weights.append([1.,0.,0.,0.]);amount=np.clip((point[0]-(end-(end-start)*.14))/max((end-start)*.08,1e-8),0,1);amount=amount*amount*(3-2*amount)
   color=bed*(1-amount)+edge*amount;colors.append([*color,1.])
  for n in range(NAIL_CIRCUMFERENTIAL_SEGMENTS):faces.append([base,base+1+n,base+1+(n+1)%NAIL_CIRCUMFERENTIAL_SEGMENTS])
  for ring in range(NAIL_RADIAL_RINGS-1):
   a=base+1+NAIL_CIRCUMFERENTIAL_SEGMENTS*ring;b=a+NAIL_CIRCUMFERENTIAL_SEGMENTS
   for n in range(NAIL_CIRCUMFERENTIAL_SEGMENTS):j=(n+1)%NAIL_CIRCUMFERENTIAL_SEGMENTS;faces.extend([[a+n,b+n,b+j],[a+n,b+j,a+j]])
  for n in range(NAIL_CIRCUMFERENTIAL_SEGMENTS):faces.append([base+count,base+count+1+(n+1)%NAIL_CIRCUMFERENTIAL_SEGMENTS,base+count+1+n])
  for ring in range(NAIL_RADIAL_RINGS-1):
   a=base+count+1+NAIL_CIRCUMFERENTIAL_SEGMENTS*ring;b=a+NAIL_CIRCUMFERENTIAL_SEGMENTS
   for n in range(NAIL_CIRCUMFERENTIAL_SEGMENTS):j=(n+1)%NAIL_CIRCUMFERENTIAL_SEGMENTS;faces.extend([[a+n,b+j,b+n],[a+n,a+j,b+j]])
  outer=base+1+NAIL_CIRCUMFERENTIAL_SEGMENTS*(NAIL_RADIAL_RINGS-1)
  for n in range(NAIL_CIRCUMFERENTIAL_SEGMENTS):j=(n+1)%NAIL_CIRCUMFERENTIAL_SEGMENTS;faces.extend([[outer+n,outer+count+n,outer+count+j],[outer+n,outer+count+j,outer+j]])
  nails.append({'side':side,'digit':digit,'bone':names[ji],'vertices':[base,len(local_nail)],'lengthMm':(end-start)/mm,'widthMm':width/mm,'thicknessMm':NAIL_THICKNESS_MM,'surfaceOffsetMm':NAIL_SURFACE_OFFSET_MM,'radialRings':NAIL_RADIAL_RINGS,'circumferentialSegments':NAIL_CIRCUMFERENTIAL_SEGMENTS,'adaptiveLiftMaxMm':float(adaptive_lifts.max()) if nails_only else 0.,'adaptiveLiftTotalMm':float(adaptive_lifts.sum()) if nails_only else 0.,'minimumClearanceMm':float(min_clearance) if nails_only else None,'targetMinimumClearanceMm':NAIL_MIN_CLEARANCE_MM if nails_only else None,'rayFallbacks':fallback,'longitudinalBoneLocal':nail_basis[:,0].tolist(),'dorsalBoneLocal':(-nail_basis[:,1]).tolist()})
positions=np.array(positions,dtype='<f4');faces=np.array(faces,dtype='<u2');normal=np.zeros_like(positions)
for a,b,c in faces:
 q=np.cross(positions[b]-positions[a],positions[c]-positions[a]);normal[a]+=q;normal[b]+=q;normal[c]+=q
normal/=np.maximum(np.linalg.norm(normal,axis=1)[:,None],1e-20)
def Append(values,typ,component,target=None,bounds=False):
 global binary
 values=np.ascontiguousarray(values);binary+=b'\0'*(-len(binary)%4);offset=len(binary);raw=values.tobytes();binary+=raw
 view={'buffer':0,'byteOffset':offset,'byteLength':len(raw)}
 if target:view['target']=target
 vi=len(doc['bufferViews']);doc['bufferViews'].append(view);a={'bufferView':vi,'componentType':component,'count':len(values),'type':typ}
 if bounds:a.update(min=values.min(0).tolist(),max=values.max(0).tolist())
 index=len(doc['accessors']);doc['accessors'].append(a);return index
new_material={'name':'Material_HanYangScanSkin_Nails','pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':.50},'extensions':{'KHR_materials_clearcoat':{'clearcoatFactor':.12,'clearcoatRoughnessFactor':.40}},'extras':{'surface':'keratin','source':'Anatomical nail plates fitted to the original hand; actual distal-bone skin','baseColorEncoding':'sRGB vertex colors converted to linear light','bedColorSrgb':[185,143,126],'freeEdgeColorSrgb':[201,183,160]}}
if nails_only:
 material=existing_nail_material_index;doc['materials'][material]=new_material
else:
 material=len(doc['materials']);doc['materials'].append(new_material)
if 'KHR_materials_clearcoat' not in doc.setdefault('extensionsUsed',[]):doc['extensionsUsed'].append('KHR_materials_clearcoat')
attributes={'POSITION':Append(positions,'VEC3',5126,34962,True),'NORMAL':Append(normal,'VEC3',5126,34962),'COLOR_0':Append(np.array(colors,dtype='<f4'),'VEC4',5126,34962),'JOINTS_0':Append(np.array(joints,dtype='<u2'),'VEC4',5123,34962),'WEIGHTS_0':Append(np.array(weights,dtype='<f4'),'VEC4',5126,34962)}
primitive={'attributes':attributes,'indices':Append(faces.reshape(-1,1),'SCALAR',5123,34963),'material':material,'mode':4}
# A rigid nail must not inherit the skin's five weapon compression morphs.
# Full rebuilds append a fresh renderer. Nail-only repairs replace the existing
# visible renderer in place, leaving its node, parent and all old body payloads.
if nails_only:
 nail_mesh_index=existing_nail_mesh_index;nail_node_index=existing_nail_node_index;doc['meshes'][nail_mesh_index]['primitives']=[primitive]
else:
 skin_node_index=next(i for i,n in enumerate(doc['nodes']) if n is node)
 nail_mesh_index=len(doc['meshes']);doc['meshes'].append({'name':'Mesh_HanYangNailPlates','primitives':[primitive]})
 nail_node={k:copy.deepcopy(v) for k,v in node.items() if k not in ['mesh','children','weights','name']};nail_node.update(mesh=nail_mesh_index,name='Mesh_HanYangNailPlates')
 nail_node_index=len(doc['nodes']);doc['nodes'].append(nail_node)
 if skin_node_index in parents:doc['nodes'][parents[skin_node_index]].setdefault('children',[]).append(nail_node_index)
 else:
  for scene in doc['scenes']:
   if skin_node_index in scene['nodes']:scene['nodes'].append(nail_node_index)
if nails_only:
 assert np.count_nonzero(finger_modified)==0 and original_hand_surface==doc['asset'].setdefault('extras',{}).get('handSurfaceRepair')
 doc['asset']['extras']['nailSurfaceRepair']={'version':1,'mode':'nailsOnly','weapon':'HanYang','inputSha256':basis_sha,'source':'_blender/Script_FpsHandNailsBake.py','meshName':'Mesh_HanYangNailPlates','nodeName':'Mesh_HanYangNailPlates','meshIndex':nail_mesh_index,'nodeIndex':nail_node_index,'bodyBinarySha256':original_binary_sha,'minimumClearanceMm':NAIL_MIN_CLEARANCE_MM,'nails':nails}
else:
 doc['asset'].setdefault('extras',{})['handSurfaceRepair']={'version':9,'method':'Original thumb skin and anatomical thumb nail frames; retained individual four-finger taper; refined fitted nail surfaces; original palm, wrist, rig and weights preserved','basisSha256':basis_sha,'source':'_blender/Script_FpsHandNailsBake.py','nails':nails,'fingerProfiles':finger_profiles,'thumbTerminalShortening':thumb_terminal_shortening}
 assert np.count_nonzero(finger_modified)>0
 doc['asset']['extras']['handSurfaceRepair'].update(weapon='HanYang',thumbRootVertices=sorted(set(thumb_root_modified)),thumbRootMaximumDisplacementMm=0)
for key in ['skins','images','textures','samplers','animations']:assert doc.get(key)==original.get(key),key
if not nails_only:
 for old,new in zip(original['nodes'],doc['nodes']):
  assert {k:v for k,v in old.items() if k!='children'}=={k:v for k,v in new.items() if k!='children'}
  assert [i for i in new.get('children',[]) if i!=nail_node_index]==old.get('children',[])
if nails_only:
 assert bytes(binary[:len(original_binary)])==original_binary,'Nail-only mode changed the original binary payload'
 assert doc['nodes']==original_nodes and doc['skins']==original_skins and doc['scenes']==original_scenes
 assert doc['accessors'][:len(original_accessors)]==original_accessors and doc['bufferViews'][:len(original_buffer_views)]==original_buffer_views
 assert all(doc['meshes'][i]==mesh for i,mesh in original_body_meshes.items()) and all(doc['materials'][i]==material for i,material in original_body_materials.items())
 assert doc['asset']['extras']['handSurfaceRepair']==original_hand_surface
 assert len([n for n in doc['nodes'] if n.get('name')=='Mesh_HanYangNailPlates' and n.get('mesh') is not None])==1
 assert not doc['meshes'][nail_mesh_index]['primitives'][0].get('targets') and not doc['meshes'][nail_mesh_index].get('weights')
bpy.context.scene['FpsHandNailsInput']=str(input_path);bpy.context.scene['FpsHandNailsOutput']=str(output)
output.parent.mkdir(parents=True,exist_ok=True);codec.WriteGlb(output,doc,binary)
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
if not nails_only:
 basis_copy.parent.mkdir(parents=True,exist_ok=True);basis_copy.write_bytes(basis)
bpy.ops.import_scene.gltf(filepath=str(output))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
# The completed GLB already includes exactly one authored nail primitive.
rig['nails']=json.dumps(nails);rig['fingerProfiles']=json.dumps(finger_profiles)
bpy.context.scene['BlenderMcpTask']=task;bpy.ops.wm.save_as_mainfile(filepath=str(source))
if nails_only:
 report={'version':1,'mode':'nailsOnly','weapon':'HanYang','input':str(input_path),'inputSha256':basis_sha,'output':str(output),'outputSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'source':str(source),'bodyBinarySha256':original_binary_sha,'originalHandSurfaceRepairPreserved':True,'originalSkeletonUvsTexturesMorphsAndParentsPreserved':True,'nailMeshIndex':nail_mesh_index,'nailNodeIndex':nail_node_index,'nailVertices':len(positions),'nailTriangles':len(faces),'nailSurfaceParameters':{'radialRings':NAIL_RADIAL_RINGS,'circumferentialSegments':NAIL_CIRCUMFERENTIAL_SEGMENTS,'surfaceOffsetMm':NAIL_SURFACE_OFFSET_MM,'thicknessMm':NAIL_THICKNESS_MM,'minimumClearanceMm':NAIL_MIN_CLEARANCE_MM,'maxAdaptiveLiftMm':NAIL_MAX_ADAPTIVE_LIFT_MM},'nailMaterial':{'bedColorSrgb':[185,143,126],'freeEdgeColorSrgb':[201,183,160],'roughness':.50,'clearcoat':.12,'clearcoatRoughness':.40},'nails':nails}
else:
 report={'version':9,'basisSha256':basis_sha,'input':str(input_path),'output':str(output),'outputSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'source':str(source),'originalPalmOutsideThumbRootAndAllSkinWeightsPreserved':True,'originalSkeletonUvsTexturesAndMorphsPreserved':True,'fingerVerticesChanged':int(finger_modified.sum()),'fingerProfiles':finger_profiles,'thumbTerminalShortening':thumb_terminal_shortening,'thumbRootVertices':sorted(set(thumb_root_modified)),'thumbRootMaximumDisplacementMm':0,'nailVertices':len(positions),'nailTriangles':len(faces),'nailSurfaceParameters':{'radialRings':NAIL_RADIAL_RINGS,'circumferentialSegments':NAIL_CIRCUMFERENTIAL_SEGMENTS,'surfaceOffsetMm':NAIL_SURFACE_OFFSET_MM,'thicknessMm':NAIL_THICKNESS_MM},'nailMaterial':{'bedColorSrgb':[185,143,126],'freeEdgeColorSrgb':[201,183,160],'roughness':.50,'clearcoat':.12,'clearcoatRoughness':.40},'nails':nails}
if nails_only:
 json_length=struct.unpack_from('<I',basis,12)[0]
 report['asset']='Model/Model_FpsHanYangHandsRepaired.glb'
 report['previousLayer']='Model/Data_FpsWristNormalSeam.json'
 report['restoration']={'jsonChunkBase64':base64.b64encode(basis[20:20+json_length]).decode('ascii'),'binaryLength':len(original_binary),'binarySha256':original_binary_sha}
project_report.parent.mkdir(parents=True,exist_ok=True);source_report.parent.mkdir(parents=True,exist_ok=True)
project_report.write_text(json.dumps(report,indent=2));source_report.write_text(json.dumps(report,indent=2));print(json.dumps(report))
