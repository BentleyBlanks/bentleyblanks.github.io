"""Photo-guided female head with continuous native pinna. Keep inner canal and tool assets unchanged.
Source .blend and both photo/depth reference empties live outside the Git repository.
"""
import bpy,bmesh,gzip,math,json,random
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent
SOURCE=Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/ReferenceProfile')
DATA=Path('C:/Users/Bentl/AppData/Roaming/Blender Foundation/Blender/5.1/extensions/user_default/mpfb/data')
api={'__file__':str(ROOT/'Script_BuildImmersiveEar.py')}
exec(compile((ROOT/'Script_BuildImmersiveEar.py').read_text(encoding='utf-8'),api['__file__'],'exec'),api)
Mesh,Mat,Apply,V=[api[k] for k in ['Mesh','Mat','Apply','V']]
def Remove(name):
 obj=bpy.data.objects.get(name)
 if obj:bpy.data.objects.remove(obj,do_unlink=True)
DEPTH_OFFSET=-1.8
def Map(p):
 x,y,z=p
 return (-(z-.50)*100,(y-5.79)*100,(x+.65)*100+DEPTH_OFFSET)
def Read():
 raw=[];uvs=[];groups={};group=''
 for line in (DATA/'3dobjs/base.obj').read_text().splitlines():
  b=line.split()
  if not b:continue
  if b[0]=='v':raw.append(tuple(map(float,b[1:4])))
  elif b[0]=='vt':uvs.append(tuple(map(float,b[1:3])))
  elif b[0]=='g':group=b[1]
  elif b[0]=='f':groups.setdefault(group,[]).append([(int(v.split('/')[0])-1,int(v.split('/')[1])-1) for v in b[1:]])
 points=[Vector(v) for v in raw]
 for target,weight in [('macrodetails/asian-female-young.target.gz',.85),('macrodetails/caucasian-female-young.target.gz',.15),('nose/nose-point-width-decr.target.gz',.12),('chin/chin-width-decr.target.gz',.10)]:
  f=DATA/'targets'/target
  if not f.exists():continue
  for line in gzip.open(f,'rt'):
   if not line.strip() or line.startswith('#'):continue
   b=line.split();points[int(b[0])]+=Vector(tuple(map(float,b[1:4])))*weight
 return raw,points,uvs,groups

def Subset(name,faces,points,uvs,material,sub=1):
 used=sorted({i for f in faces for i,u in f});lookup={old:i for i,old in enumerate(used)}
 obj=Mesh(name,[Map(points[i]) for i in used],[[lookup[i] for i,u in f] for f in faces],material)
 uv=obj.data.uv_layers.new(name='UVMap')
 for poly,f in zip(obj.data.polygons,faces):
  for l,(_,u) in zip(poly.loop_indices,f):uv.data[l].uv=uvs[u]
 if sub:
  m=obj.modifiers.new('AnatomicalSubdivision','SUBSURF');m.levels=sub;Apply(obj,m)
 return obj

def OuterPbr(material):
 file=ROOT/'Textures/Texture_OuterSkinPbrAtlas.png'
 if not file.exists():return
 nodes=material.node_tree.nodes;links=material.node_tree.links;bsdf=nodes.get('Principled BSDF')
 bsdf.inputs['Subsurface Weight'].default_value=.10;bsdf.inputs['Subsurface Radius'].default_value=(1.0,.42,.24);bsdf.inputs['Subsurface Scale'].default_value=.8
 for n in list(nodes):
  if n!=bsdf and n.type!='OUTPUT_MATERIAL':nodes.remove(n)
 uv=nodes.new('ShaderNodeTexCoord');wrap=nodes.new('ShaderNodeVectorMath');wrap.operation='FRACTION';links.new(uv.outputs['UV'],wrap.inputs[0])
 for channel,offset in [('Base Color',(0,.5,0)),('Normal',(.5,.5,0)),('Roughness',(0,0,0))]:
  scale=nodes.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=(.5,.5,1);links.new(wrap.outputs['Vector'],scale.inputs[0]);add=nodes.new('ShaderNodeVectorMath');add.operation='ADD';add.inputs[1].default_value=offset;links.new(scale.outputs['Vector'],add.inputs[0])
  image=bpy.data.images.load(str(file),check_existing=False);image.name='Texture_OuterSkin_'+channel.replace(' ','');image.colorspace_settings.name='sRGB' if channel=='Base Color' else 'Non-Color';image.pack()
  tex=nodes.new('ShaderNodeTexImage');tex.image=image;links.new(add.outputs['Vector'],tex.inputs['Vector'])
  if channel=='Normal':
   normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.18;links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
  else:links.new(tex.outputs['Color'],bsdf.inputs[channel])
 material['runtimeAo']='Independent outer atlas fourth quadrant, micro AO .18; runtime uses all four channels'

def Head(raw,points,uvs,groups):
 for n in ['Model_Temple','Model_OuterEar','Model_ProfileEyes','Model_ProfileIris','Model_ProfileLashes','Model_ProfileHair','Model_ProfileHairStrands']:Remove(n)
 skin=Mat('Material_ReferenceFace',(.61,.395,.32),.48);OuterPbr(skin)
 head=Subset('Model_Temple',[f for f in groups['body'] if all(raw[i][1]>5.55 for i,u in f)],points,uvs,skin,1)
 # Fit the native concha floor to the preserved internal canal, not a floating cylindrical cuff.
 global DEPTH_OFFSET
 samples=[]
 for j in range(64):
  a=j/64*math.tau;hit,loc,norm,idx=head.ray_cast(V((math.sin(a)*3.82*.72,math.cos(a)*3.82,-65)),V((0,0,1)))
  samples.append(-loc.y if hit else 0)
 shift=-1.5-sorted(samples)[len(samples)//2];DEPTH_OFFSET+=shift
 for v in head.data.vertices:v.co.y-=shift
 samples=[d+shift for d in samples]
 (SOURCE/'ConchaFit.json').write_text(json.dumps({'depthShift':shift,'surfaceDepths':samples}))
 # Native pinna remains connected to the face. Only the concha's entrance is opened.
 bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=3.8,depth=80,location=V((0,0,5)))
 cutter=bpy.context.object;cutter.scale.x=.72;cutter.rotation_euler=(math.pi/2,0,0)
 mod=head.modifiers.new('OpenExternalMeatus','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter;Apply(head,mod);bpy.data.objects.remove(cutter,do_unlink=True)
 # Clear the actual curved canal volume from the head too. A straight narrow bore leaves skin walls inside the canal view.
 allRows=json.loads((ROOT/'Data_CanalProfile.json').read_text());cavityRows=allRows[::2]
 if cavityRows[-1]!=allRows[-1]:cavityRows.append(allRows[-1])
 cv=[];cf=[];n=32
 for row,f in enumerate(cavityRows):
  for j in range(n):
   a=j/n*math.tau;direction=Vector(f['up'])*math.cos(a)+Vector(f['right'])*math.sin(a)
   cv.append(tuple(Vector(f['center'])+direction*(f['radii'][j*2]+.85)))
   if row<len(cavityRows)-1:
    k=row*n+j;cf.append((k,row*n+(j+1)%n,(row+1)*n+(j+1)%n,k+n))
 cf.append(tuple(reversed(range(n))));cf.append(tuple((len(cavityRows)-1)*n+j for j in range(n)))
 volume=Mesh('HeadCanalClearance',cv,cf,skin);bm=bmesh.new();bm.from_mesh(volume.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(volume.data);bm.free()
 mod=head.modifiers.new('CurvedCanalClearance','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=volume;Apply(head,mod);bpy.data.objects.remove(volume,do_unlink=True)
 # Short anatomical transition from the native concha into the already approved canal.
 profile=json.loads((ROOT/'Data_CanalProfile.json').read_text())[0];verts=[];faces=[];cols=96
 for row in range(5):
  t=row/4
  for j in range(cols+1):
   a=j/cols*math.tau;r=3.8*(1-t)+profile['radii'][int(j/cols*64)%64]*t
   direction=Vector(profile['up'])*math.cos(a)+Vector(profile['right'])*math.sin(a)
   p=Vector(profile['center'])*t+direction*r;p.x*=.72+.28*t;p.z+=samples[int(j/cols*64)%64]*(1-t)
   verts.append(tuple(p))
   if row<4 and j<cols:
    k=row*(cols+1)+j;faces.append((k,k+cols+1,k+cols+2,k+1))
 ear=Mesh('Model_OuterEar',verts,faces,skin)
 uv=ear.data.uv_layers.new(name='UVMap')
 for poly in ear.data.polygons:
  for l in poly.loop_indices:
   k=ear.data.loops[l].vertex_index;uv.data[l].uv=(k%(cols+1)/cols,k//(cols+1)/4)
 for poly in head.data.polygons:
  for l in poly.loop_indices:
   v=head.data.vertices[head.data.loops[l].vertex_index].co;head.data.uv_layers.active.data[l].uv=(v.x/20,v.z/20)
 head['source']='MakeHuman CC0 neutral topology with young female macro morphology; photo-guided profile, native pinna and drilled meatus'
 head['reference']='Reference_ProfilePhoto.png and imagegen Reference_ProfileDepth.png; visual shape guide, not calibrated scan depth'
 return head

def Eyes(points,uvs,groups,head):
 white=Mat('Material_ProfileSclera',(.69,.66,.59),.20,coat=.35)
 eyes=Subset('Model_ProfileEyes',groups['helper-l-eye']+groups['helper-r-eye'],points,uvs,white,2)
 iris=Mat('Material_ProfileIris',(.038,.017,.011),.28,coat=.5);pupil=Mat('Material_ProfilePupil',(.001,.001,.001),.14,coat=.6)
 vertices=[];faces=[];indices=[]
 for side in [-1,1]:
  cx=side*.2779;cy=5.943;cz=1.104;r=.140
  for ring in range(9):
   rad=ring/8*.060
   for j in range(48):
    a=j/48*math.tau;vertices.append(Map((cx+math.cos(a)*rad,cy+math.sin(a)*rad,cz+math.sqrt(r*r-rad*rad)+.0008)))
    if ring<8:
     k=(len(vertices)-1);n=k-j+(j+1)%48;faces.append((k,n,n+48,k+48));indices.append(1 if ring<3 else 0)
 obj=Mesh('Model_ProfileIris',vertices,faces,iris);obj.data.materials.append(pupil)
 for f,m in zip(obj.data.polygons,indices):f.material_index=m
 lash=Mat('Material_ProfileLashes',(.012,.007,.006),.65)
 verts=[];faces=[]
 def Strand(a,b,c,r):
  start=len(verts)
  for i in range(5):
   t=i/4;p=a*(1-t)**2+b*2*t*(1-t)+c*t*t
   for j in range(3):
    aa=j/3*math.tau;verts.append(Map(p+Vector((math.cos(aa)*r*(1-t+.05),math.sin(aa)*r*(1-t+.05),0))))
    if i<4:
     k=start+i*3+j;n=start+i*3+(j+1)%3;faces.append((k,n,n+3,k+3))
 for side in [-1,1]:
  for i in range(36):
   t=(i+.5)/36;xx=side*(.163+t*.235);yy=5.943+.049*math.sin(t*math.pi);zz=1.104+math.sqrt(max(.001,.140**2-(abs(xx)-.278)**2-(yy-5.943)**2))
   a=Vector((xx,yy,zz));Strand(a,a+Vector((side*.008,.012,.018)),a+Vector((side*.010,.042,.040)),.0013)
  for i in range(52):
   t=i/51;a=Vector((side*(.145+t*.295),6.054+.06*math.sin(t*math.pi),1.10+.017*math.sin(t*math.pi)))
   game=Map(a);hit,loc,norm,idx=head.ray_cast(V((-180,game[1],game[2])),Vector((1,0,0)))
   if hit:a.z=-loc.x/100+.50+.002
   Strand(a,a+Vector((side*.008,.012,.002)),a+Vector((side*.018,.020,.005)),.0021)
 Mesh('Model_ProfileLashes',verts,faces,lash)

def Hair(raw,points,uvs,groups,head):
 material=Mat('Material_ProfileHair',(.009,.006,.005),.37,coat=.22)
 # Actual scalp follows the subdivided head, so the crown cannot float or intersect the forehead.
 faces=[f for f in groups['body'] if all(raw[i][1]>5.55 and points[i].y>6.12+.43*max(0,min(1,(points[i].z-.52)/.8)) for i,u in f)]
 expanded=[v.copy() for v in points]
 for p in expanded:
  if p.y>5.8:p+=Vector((p.x*.018,.016,(p.z-.4)*.018))
 scalp=Subset('Model_ProfileHair',faces,expanded,uvs,material,1)
 bm=bmesh.new();bm.from_mesh(scalp.data);boundary=[v for v in bm.verts if v.is_boundary]
 for i in range(12):bmesh.ops.smooth_vert(bm,verts=boundary,factor=.45,use_axis_x=True,use_axis_y=True,use_axis_z=True)
 bm.to_mesh(scalp.data);bm.free()
 verts=[];faces=[];weights=[];cols=72;rows=40
 def Catmull(a,b,c,d,t):return (b*2+(c-a)*t+(a*2-b*5+c*4-d)*t*t+(-a+b*3-c*3+d)*t*t*t)*.5
 for side in [-1,1]:
  start=len(verts)
  for row in range(rows+1):
   t=row/rows
   for j in range(cols+1):
    u=j/cols;a=u*math.pi
    controls=[Vector((side*.055,6.988,.45-.23*u)),Vector((side*.52,6.81,.42+.58*math.cos(a))),Vector((side*.78,6.20,.37+.38*math.cos(a))),Vector((side*.79,5.63,.10-.46*u)),Vector((side*.82,4.25+.10*math.sin(u*7),.10-.52*u))]
    at=t*4;i=min(3,int(at));q=at-i;p=Catmull(controls[max(0,i-1)],controls[i],controls[i+1],controls[min(4,i+2)],q)
    p.x+=side*.0007*math.sin(u*190+t*3)*math.sin(t*math.pi)
    verts.append(Map(p));weights.append((u,t))
    if row<rows and j<cols:
     k=start+row*(cols+1)+j;faces.append((k,k+1,k+cols+2,k+cols+1))
 obj=Mesh('Model_ProfileHairStrands',verts,faces,material)
 uv=obj.data.uv_layers.new(name='UVMap')
 for f in obj.data.polygons:
  for l in f.loop_indices:uv.data[l].uv=weights[obj.data.loops[l].vertex_index]
 solid=obj.modifiers.new('HairMassThickness','SOLIDIFY');solid.thickness=.45;Apply(obj,solid)

def Build():
 assert Path(bpy.data.filepath).resolve()==(SOURCE/'Model_ReferenceProfile.blend').resolve()
 raw,points,uvs,groups=Read();head=Head(raw,points,uvs,groups);Eyes(points,uvs,groups,head);Hair(raw,points,uvs,groups,head)
 for name in ['ProfilePhoto','ProfileDepth']:
  f=SOURCE/'References'/('Reference_'+name+'.png')
  if f.exists():
   image=bpy.data.images.load(str(f),check_existing=True);image.pack();obj=bpy.data.objects.get('Reference_'+name)
   if not obj:obj=bpy.data.objects.new('Reference_'+name,None);bpy.context.collection.objects.link(obj)
   obj.empty_display_type='IMAGE';obj.data=image;obj.empty_display_size=230;obj.hide_render=True;obj.location=V((-260 if name=='ProfilePhoto' else 260,20,40));obj.rotation_euler=(math.pi/2,0,0)
 for obj in bpy.data.objects:
  if obj.type=='MESH' and obj.name!='Model_Canal':
   bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
 bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'Model_ReferenceProfile.blend'))
 bpy.ops.object.select_all(action='DESELECT')
 for obj in bpy.context.scene.objects:
  if obj.type=='MESH' and obj.name.startswith('Model_'):obj.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(ROOT/'Models/Model_ImmersiveEar.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True)
 print('REFERENCE_PROFILE_READY')
if __name__=='__main__':Build()
