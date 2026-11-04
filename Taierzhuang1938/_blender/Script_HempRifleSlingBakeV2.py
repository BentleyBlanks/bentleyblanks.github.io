"""Versioned hemp sling asset. Run through Script_BlenderMcp exec/runpy; never modifies gun files."""
import bpy, math, json, hashlib, struct, base64
from mathutils import Vector
from pathlib import Path

repo=Path(globals().get('REPO_ROOT') or (Path(__file__).resolve().parents[2] if '__file__' in globals() else bpy.context.scene['TaskRepoRoot']))
project=Path(globals().get('PROJECT_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HempRifleSlingV2_20261105'))
output=repo/'Taierzhuang1938/Model/HempRifleSlingV2';output.mkdir(parents=True,exist_ok=True)
source=repo/'Taierzhuang1938/_import/Reference/HempRifleSlingV2/Texture_HempFiberSourceV2.webp'
assert source.is_file()
assert bpy.context.scene.get('BlenderMcpTask')=='HempRifleSlingV2'
assert not bpy.data.filepath or Path(bpy.data.filepath)==project/'Model_HempRifleSlingV2.blend'
collection=bpy.data.collections.get('Asset_HempRifleSlingV2')
if collection:
 for obj in list(collection.objects):bpy.data.objects.remove(obj,do_unlink=True)
else:
 collection=bpy.data.collections.new('Asset_HempRifleSlingV2');bpy.context.scene.collection.children.link(collection)

def Link(obj):
 for c in list(obj.users_collection):c.objects.unlink(obj)
 collection.objects.link(obj)
 return obj
def Blender(v):return (v[0],-v[2],v[1])
def Mesh(name,vertices,faces,uvs,material):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata([Blender(v) for v in vertices],[],faces);mesh.update()
 layer=mesh.uv_layers.new(name='UVMap')
 for poly in mesh.polygons:
  poly.use_smooth=True
  for loop in poly.loop_indices:layer.data[loop].uv=uvs[mesh.loops[loop].vertex_index]
 obj=bpy.data.objects.new(name,mesh);collection.objects.link(obj);obj.data.materials.append(material);return obj

# Neutral, dry fibre PBR. The generated image is colour detail, not a baked light map.
material=bpy.data.materials.get('Material_HempRifleSlingV2') or bpy.data.materials.new('Material_HempRifleSlingV2')
material.use_nodes=True;nodes=material.node_tree.nodes;nodes.clear();links=material.node_tree.links
out=nodes.new('ShaderNodeOutputMaterial');p=nodes.new('ShaderNodeBsdfPrincipled');p.inputs['Roughness'].default_value=.94;p.inputs['Metallic'].default_value=0
links.new(p.outputs['BSDF'],out.inputs['Surface'])
image=bpy.data.images.load(str(source),check_existing=True);image.colorspace_settings.name='sRGB'
base=nodes.new('ShaderNodeTexImage');base.image=image;base.extension='REPEAT';links.new(base.outputs['Color'],p.inputs['Base Color'])
bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.45;bump.inputs['Distance'].default_value=.000055
links.new(base.outputs['Color'],bump.inputs['Height']);links.new(bump.outputs['Normal'],p.inputs['Normal'])

# Bake the fine fibre normal on a physical-scale patch; large strand grooves are real geometry.
bpy.ops.mesh.primitive_plane_add(size=1);plane=Link(bpy.context.object);plane.name='Bake_HempFiberNormal';plane.scale=(.012/2,.04/2,1)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
plane.data.materials.append(material)
normal=bpy.data.images.new('Texture_HempFiberV2Normal',width=1024,height=1024,alpha=False)
normal.colorspace_settings.name='Non-Color';target=nodes.new('ShaderNodeTexImage');target.image=normal;nodes.active=target
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16
for obj in scene.objects:obj.select_set(False)
plane.hide_set(False);plane.hide_render=False;plane.select_set(True);bpy.context.view_layer.objects.active=plane
scene.render.bake.use_selected_to_active=False;scene.render.bake.margin=4
bpy.ops.object.bake(type='NORMAL')
normal.filepath_raw=str(project/'Source/Texture_HempFiberV2Normal.webp');normal.file_format='WEBP';normal.save()
image.scale(1024,1024);image.filepath_raw=str(project/'Source/Texture_HempFiberV2Base.webp');image.file_format='WEBP';image.save()
for link in list(p.inputs['Normal'].links):links.remove(link)
normalMap=nodes.new('ShaderNodeNormalMap');normalMap.inputs['Strength'].default_value=.8;links.new(target.outputs['Color'],normalMap.inputs['Color']);links.new(normalMap.outputs['Normal'],p.inputs['Normal'])
nodes.remove(bump);bpy.data.objects.remove(plane,do_unlink=True)

length=1.6;diameter=.007;centerRadius=.00175;strandRadius=.00175;pitch=.045;sections=384;sides=8;bonesCount=32
vertices=[];faces=[];uvs=[];positions=[]
for strand in range(3):
 start=len(vertices)
 for ring in range(sections+1):
  z=length*ring/sections;phase=2*math.pi*z/pitch+2*math.pi*strand/3
  center=Vector((centerRadius*math.cos(phase),centerRadius*math.sin(phase),z))
  tangent=Vector((-centerRadius*2*math.pi/pitch*math.sin(phase),centerRadius*2*math.pi/pitch*math.cos(phase),1)).normalized()
  radial=Vector((math.cos(phase),math.sin(phase),0));binormal=tangent.cross(radial).normalized()
  for side in range(sides+1):
   angle=2*math.pi*side/sides;v=center+strandRadius*(math.cos(angle)*radial+math.sin(angle)*binormal)
   vertices.append(tuple(v));uvs.append((side/sides,z/.04+strand*.317));positions.append(z)
 for ring in range(sections):
  for side in range(sides):
   a=start+ring*(sides+1)+side;b=a+sides+1;faces.extend([(a,b,b+1),(a,b+1,a+1)])
rope=Mesh('RopeHemp_Skinned',vertices,faces,uvs,material)
rig=bpy.data.objects.new('Rig_HempRifleSlingV2',bpy.data.armatures.new('Rig_HempRifleSlingV2'));collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
for i in range(bonesCount):
 bone=rig.data.edit_bones.new(f'SlingBone_{i:02d}');z=length*i/(bonesCount-1);bone.head=(0,-z,0);bone.tail=(0,-z-.02,0)
bpy.ops.object.mode_set(mode='OBJECT')
groups=[rope.vertex_groups.new(name=f'SlingBone_{i:02d}') for i in range(bonesCount)]
for index,z in enumerate(positions):
 s=max(0,min(bonesCount-1,z/length*(bonesCount-1)));a=min(bonesCount-2,int(s));w=s-a
 if 1-w>1e-8:groups[a].add([index],1-w,'REPLACE')
 if w>1e-8:groups[a+1].add([index],w,'REPLACE')
mod=rope.modifiers.new('HempSkin','ARMATURE');mod.object=rig;rope.parent=rig

# Closed cord eye around the existing swivel bar. Pivot is the measured hole centre.
def Tube(name,path,radius,rings=8):
 vs=[];fs=[];uv=[]
 for i,point in enumerate(path):
  t=(Vector(path[min(len(path)-1,i+1)])-Vector(path[max(0,i-1)])).normalized();n=Vector((0,1,0));n=(n-t*n.dot(t)).normalized();b=t.cross(n)
  for j in range(rings+1):
   theta=2*math.pi*j/rings;v=Vector(point)+radius*(math.cos(theta)*n+math.sin(theta)*b);vs.append(tuple(v));uv.append((j/rings,i/len(path)*2))
 for i in range(len(path)-1):
  for j in range(rings):a=i*(rings+1)+j;b=a+rings+1;fs.extend([(a,b,b+1),(a,b+1,a+1)])
 return Mesh(name,vs,fs,uv,material)
eyeRadius=.0058
eye=Tube('RopeHemp_Eye',[(eyeRadius*math.sin(i*2*math.pi/48),0,-eyeRadius+eyeRadius*math.cos(i*2*math.pi/48)) for i in range(49)],.0035,8)
whipPath=[]
for i in range(129):
 t=i/128;phi=t*2*math.pi*5;whipPath.append((.0042*math.cos(phi),.0042*math.sin(phi),.002+t*.014))
whip=Tube('RopeHemp_Whipping',whipPath,.0006,5)
lashings=[]
for name,rx,ry in [('Front',.0142,.0202),('Rear',.0190,.0449)]:
 path=[]
 for i in range(129):
  t=i/128;phi=t*math.pi*4
  path.append((rx*math.sin(phi),-ry*math.cos(phi),(t-.5)*.015))
 lashings.append(Tube('RopeHemp_Lashing'+name,path,.0035,8))

for obj in scene.objects:obj.select_set(False)
for obj in [rope,rig,eye,whip,*lashings]:obj.hide_set(False);obj.hide_render=False;obj.select_set(True)
bpy.context.view_layer.objects.active=rig
asset=output/'Model_RifleSlingHempV2.glb'
bpy.ops.export_scene.gltf(filepath=str(asset),export_format='GLB',use_selection=True,export_yup=True,export_skins=True,export_animations=False,export_materials='EXPORT',export_image_format='WEBP')
contract={'schema':'tengxian-rifle-sling-visual/2','version':'20261105HempV2','generator':'_blender/Script_HempRifleSlingBakeV2.py','model':'Model_RifleSlingHempV2.glb','sha256':hashlib.sha256(asset.read_bytes()).hexdigest(),'restLengthM':length,'diameterM':diameter,'bones':bonesCount,'ropeMesh':'RopeHemp_Skinned','eyeMesh':'RopeHemp_Eye','whippingMesh':'RopeHemp_Whipping','axis':'glTF +Z rest length; normalized runtime bone frames','triangles':len(faces),'sourceImageTier':1,'reconstructionScope':'User-requested creative hemp cord, twist and binding appearance; not evidence of a standardized issued sling. Existing gun geometry is preserved.','historicalReferences':[]}
contract['lashingMeshes']=['RopeHemp_LashingFront','RopeHemp_LashingRear']
contract['totalTriangles']=sum(len(obj.data.polygons) for obj in [rope,eye,whip,*lashings])
(output/'Data_RifleSlingHempV2.json').write_text(json.dumps(contract,indent=2),encoding='utf-8')
scene['HempAssetContract']=json.dumps(contract)
bpy.ops.wm.save_as_mainfile(filepath=str(project/'Model_HempRifleSlingV2.blend'))
print('HEMP_ASSET',json.dumps(contract))
