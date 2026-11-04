"""Flat brown rifle strap; hemp was a physics analogy, not the requested geometry."""
import bpy,math,json,hashlib
from pathlib import Path
from mathutils import Vector
repo=Path(globals().get('REPO_ROOT') or (Path(__file__).resolve().parents[2] if '__file__' in globals() else bpy.context.scene['TaskRepoRoot']))
project=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/FlatRifleSlingV3_20261105')
assert bpy.context.scene.get('BlenderMcpTask')=='FlatRifleSlingV3'
assert not bpy.data.filepath or Path(bpy.data.filepath)==project/'Model_FlatRifleSlingV3.blend'
for obj in list(bpy.data.objects):bpy.data.objects.remove(obj,do_unlink=True)
scene=bpy.context.scene;scene['TaskRepoRoot']=str(repo);scene.unit_settings.system='METRIC'
out=repo/'Taierzhuang1938/Model/RifleSlingV3';out.mkdir(parents=True,exist_ok=True)
reference=repo/'Taierzhuang1938/_import/Reference/FlatRifleSlingV3';reference.mkdir(parents=True,exist_ok=True)
material=bpy.data.materials.new('Material_RifleSlingFlatV3');material.use_nodes=True;material.use_backface_culling=True
nodes=material.node_tree.nodes;nodes.clear();links=material.node_tree.links
surface=nodes.new('ShaderNodeBsdfPrincipled');surface.inputs['Roughness'].default_value=.86;surface.inputs['Metallic'].default_value=0
output=nodes.new('ShaderNodeOutputMaterial');links.new(surface.outputs['BSDF'],output.inputs['Surface'])
image=bpy.data.images.load(str(project/'Source/Texture_RifleSlingLeatherSourceV3.png'));image.colorspace_settings.name='sRGB'
base=nodes.new('ShaderNodeTexImage');base.image=image;base.extension='REPEAT';links.new(base.outputs['Color'],surface.inputs['Base Color'])
bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.3;bump.inputs['Distance'].default_value=.00006
links.new(base.outputs['Color'],bump.inputs['Height']);links.new(bump.outputs['Normal'],surface.inputs['Normal'])
bpy.ops.mesh.primitive_plane_add(size=1);plane=bpy.context.object;plane.scale=(.025,.05,1);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);plane.data.materials.append(material)
normal=bpy.data.images.new('Texture_RifleSlingLeatherNormalV3',width=1024,height=1024,alpha=False);normal.colorspace_settings.name='Non-Color'
target=nodes.new('ShaderNodeTexImage');target.image=normal;nodes.active=target
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.render.bake.margin=4;scene.render.bake.use_selected_to_active=False
bpy.ops.object.bake(type='NORMAL')
normal.filepath_raw=str(project/'Source/Texture_RifleSlingLeatherNormalV3.webp');normal.file_format='WEBP';normal.save()
image.scale(1024,1024);image.filepath_raw=str(reference/'Texture_RifleSlingLeatherSourceV3.webp');image.file_format='WEBP';image.save()
for link in list(surface.inputs['Normal'].links):links.remove(link)
mapNode=nodes.new('ShaderNodeNormalMap');mapNode.inputs['Strength'].default_value=.65;links.new(target.outputs['Color'],mapNode.inputs['Color']);links.new(mapNode.outputs['Normal'],surface.inputs['Normal']);nodes.remove(bump)
bpy.data.objects.remove(plane,do_unlink=True)

def Blender(v):return (v[0],-v[2],v[1])
def Mesh(name,vertices,faces,uvs):
 data=bpy.data.meshes.new(name);data.from_pydata([Blender(v) for v in vertices],[],faces);data.update();uv=data.uv_layers.new(name='UVMap')
 for polygon in data.polygons:
  polygon.use_smooth=False
  for loop in polygon.loop_indices:uv.data[loop].uv=uvs[data.loops[loop].vertex_index]
 obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);data.materials.append(material);return obj

def Section(width,thickness):
 h=width/2;t=thickness/2;b=min(.00035,t*.7)
 return [(-h+b,-t),(h-b,-t),(h,-t+b),(h,t-b),(h-b,t),(-h+b,t),(-h,t-b),(-h,-t+b)]

def Strip(name,path,width,thickness,frames=None,offset=Vector((0,0,0)),closed=False):
 vertices=[];faces=[];uvs=[];arc=0
 for ring,p in enumerate(path):
  if ring:arc+=(Vector(p)-Vector(path[ring-1])).length
  w,n=(Vector((1,0,0)),Vector((0,1,0))) if frames is None else frames[ring]
  for x,y in Section(width(ring) if callable(width) else width,thickness):
   vertices.append(tuple(Vector(p)+w*x+n*y+offset));uvs.append((.5+x/.025,arc/.05))
 for i in range(len(path)-1):
  for j in range(8):a=i*8+j;d=i*8+(j+1)%8;b=a+8;c=d+8;faces.extend([(a,d,c),(a,c,b)])
 if not closed:faces.extend([tuple(reversed(range(8))),tuple((len(path)-1)*8+j for j in range(8))])
 return Mesh(name,vertices,faces,uvs)

length=1.6;sections=192;count=63
strap=Strip('SlingFlat_Skinned',[(0,0,length*i/sections) for i in range(sections+1)],lambda i:.016+.009*min(1,min(i,sections-i)/(sections*.06)),.002)
rig=bpy.data.objects.new('Rig_FlatRifleSlingV3',bpy.data.armatures.new('Rig_FlatRifleSlingV3'));scene.collection.objects.link(rig)
for obj in scene.objects:obj.select_set(False)
rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
for i in range(count):
 bone=rig.data.edit_bones.new(f'SlingBone_{i:02d}');z=length*i/(count-1);bone.head=(0,-z,0);bone.tail=(0,-z-.02,0)
bpy.ops.object.mode_set(mode='OBJECT');groups=[strap.vertex_groups.new(name=f'SlingBone_{i:02d}') for i in range(count)]
for vertex in strap.data.vertices:
 s=max(0,min(count-1,-vertex.co.y/length*(count-1)));a=min(count-2,int(s));weight=s-a
 if 1-weight>1e-8:groups[a].add([vertex.index],1-weight,'REPLACE')
 if weight>1e-8:groups[a+1].add([vertex.index],weight,'REPLACE')
strap.modifiers.new('FlatSlingSkin','ARMATURE').object=rig;strap.parent=rig

radius=.0035;path=[];frames=[]
for i in range(65):
 phi=i*math.pi*2/64;path.append((radius*math.sin(phi),0,-radius+radius*math.cos(phi)));frames.append((Vector((0,1,0)),Vector((math.sin(phi),0,math.cos(phi)))))
eye=Strip('SlingFlat_Eye',path,.016,.0018,frames,closed=True)
tab=Strip('SlingFlat_ReturnTab',[(0,0,i*.014/8) for i in range(9)],.016,.0014,offset=Vector((0,.0016,0)))
# Two restrained, actual stitched rows. Join them into the one-material tab export.
threads=[]
for x in [-.006,.006]:
 for i in range(4):
  z=.003+i*.0027;bpy.ops.mesh.primitive_uv_sphere_add(segments=6,ring_count=4,radius=1,location=Blender((x,.00245,z)))
  obj=bpy.context.object;obj.scale=(.00018,.00075,.00018);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);obj.data.materials.append(material);threads.append(obj)
for obj in scene.objects:obj.select_set(False)
tab.select_set(True)
for obj in threads:obj.select_set(True)
bpy.context.view_layer.objects.active=tab;bpy.ops.object.join();tab.name='SlingFlat_ReturnTab'

lashings=[]
for name,rx,ry in [('Front',.0122,.0182),('Rear',.0166,.0429)]:
 path=[];frames=[]
 for i in range(65):
  phi=i*math.pi*2/64;path.append((rx*math.sin(phi),-ry*math.cos(phi),0));frames.append((Vector((0,0,1)),Vector((math.sin(phi)/rx,-math.cos(phi)/ry,0)).normalized()))
 lashings.append(Strip('SlingFlat_Lashing'+name,path,.018,.002,frames,closed=True))

for obj in scene.objects:obj.select_set(False)
for obj in [strap,rig,eye,tab,*lashings]:obj.select_set(True)
bpy.context.view_layer.objects.active=rig
asset=out/'Model_RifleSlingFlatV3.glb'
bpy.ops.export_scene.gltf(filepath=str(asset),export_format='GLB',use_selection=True,export_yup=True,export_skins=True,export_animations=False,export_materials='EXPORT',export_image_format='WEBP')
triangles=lambda obj:sum(len(p.vertices)-2 for p in obj.data.polygons)
contract={'schema':'tengxian-rifle-sling-visual/3','version':'20261105FlatV3','generator':'_blender/Script_FlatRifleSlingBakeV3.py','model':asset.name,'sha256':hashlib.sha256(asset.read_bytes()).hexdigest(),'shape':'flat brown strap; not rope','widthM':.025,'endWidthM':.016,'thicknessM':.002,'restLengthM':length,'bones':count,'strapTriangles':triangles(strap),'totalTriangles':sum(triangles(o) for o in [strap,eye,tab,*lashings]),'sourceImageTier':1,'reconstructionScope':'The user used hemp rope as a low-rebound physics analogy, not a visual request. Flat brown strap, folded ends, stitching and lashing appearance are creative reconstruction; no standardized 1938 issue is asserted.','historicalReferences':[]}
contract['simulationPoints']=32
(out/'Data_RifleSlingFlatV3.json').write_text(json.dumps(contract,indent=2),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(project/'Model_FlatRifleSlingV3.blend'));print('FLAT_SLING_ASSET',json.dumps(contract))
