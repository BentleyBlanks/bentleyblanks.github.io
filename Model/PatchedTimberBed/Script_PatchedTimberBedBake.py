"""BN checkpoint -> edited high source -> game meshes and PBR bakes.

Run through Script_PatchedTimberBedRebuild.mjs and its managed Blender batch.
CLI arguments after -- select source/review roots and prepare/build/all stage.
An interactive wrapper can set __file__ and use BED_BAKE_CONFIG instead.
The immutable archive is never opened for writing.
"""
import bpy, bmesh, math, json, pathlib, os, time, sys, argparse, shutil
import numpy as np
from mathutils import Vector

repoRoot=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
sys.dont_write_bytecode=True
from Script_PatchedTimberBedCotton import ApplyCottonWeave
from Script_PatchedTimberBedWood import WeatherTimberFrame
from Script_PatchedTimberBedQuilt import BakeQuiltSurface
if '--' in sys.argv:
 parser=argparse.ArgumentParser();parser.add_argument('--source-root',required=True);parser.add_argument('--review-root',required=True);parser.add_argument('--stage',default='all',choices=['prepare','build','finish','refresh','material-frame','wood-reference','export','all']);parser.add_argument('--skip-renders',action='store_true');parser.add_argument('--group',choices=['Quilt','Straw'],default='Straw')
 args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);config={'sourceRoot':args.source_root,'reviewRoot':args.review_root,'stage':args.stage,'skipRenders':args.skip_renders,'refreshGroup':args.group}
else:config=json.loads(pathlib.Path(os.environ.get('BED_BAKE_CONFIG',str(repoRoot/'tmp/BedBnBsAcceptance/Data_BakeConfig.json'))).read_text())
sourceRoot=pathlib.Path(config['sourceRoot'])
reviewRoot=pathlib.Path(config['reviewRoot'])
bnRoot=sourceRoot/'Inputs/BN/Restored'
bsRoot=sourceRoot/'Inputs/BS/BedBS'
reviewRoot.mkdir(parents=True,exist_ok=True)
textureRoot=sourceRoot/'Bakes';textureRoot.mkdir(exist_ok=True)
# Task-owned projects are reproducible; do not accumulate automatic .blend1
# copies on every checkpoint save. This process does not save user preferences.
bpy.context.preferences.filepaths.save_version=0

def Select(objects):
 bpy.context.view_layer.update()
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.hide_set(False);o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 bpy.context.view_layer.update()

def TriangleCount(o):return sum(len(p.vertices)-2 for p in o.data.polygons)

def ArchiveRecipes():
 destination=sourceRoot/'Scripts';destination.mkdir(exist_ok=True)
 for path in pathlib.Path(__file__).resolve().parent.glob('Script_PatchedTimberBed*'):
  if path.suffix not in ('.py','.mjs'):continue
  shutil.copy2(path,destination/path.name)
  text=bpy.data.texts.get(path.name) or bpy.data.texts.new(path.name);text.clear();text.write(path.read_text(encoding='utf-8'))

def CleanGameMesh(o,soft=False):
 bm=bmesh.new();bm.from_mesh(o.data)
 bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
 if soft:bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
 bmesh.ops.triangulate(bm,faces=list(bm.faces));bad=[f for f in bm.faces if f.calc_area()<5e-13]
 bmesh.ops.delete(bm,geom=bad,context='FACES');bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
 if soft:
  if o.data.has_custom_normals:o.data.normals_split_custom_set(np.zeros((len(o.data.loops),3),dtype=np.float32))
  for p in o.data.polygons:p.use_smooth=True
 o.data.update()
 return len(bad)

def OrientQuiltShell(o):
 # Some imported lower-shell islands are open; generic normal recalculation can
 # orient them upward. Use the actual vertical envelope to restore outward
 # winding of existing lower and upper faces, without creating phantom contact.
 from mathutils.bvhtree import BVHTree
 o.data.calc_loop_triangles()
 points=[o.matrix_world@v.co for v in o.data.vertices]
 triangles=[tuple(t.vertices) for t in o.data.loop_triangles]
 tree=BVHTree.FromPolygons(points,triangles,all_triangles=True)
 changed=[]
 for p in o.data.polygons:
  a,b,c=[points[i] for i in p.vertices];normal=(b-a).cross(c-a)
  if normal.length<1e-12 or abs(normal.normalized().z)<.08:continue
  center=(a+b+c)/3
  lower=tree.ray_cast(Vector((center.x,center.y,.3)),Vector((0,0,1)),.6)[0]
  upper=tree.ray_cast(Vector((center.x,center.y,.9)),Vector((0,0,-1)),.6)[0]
  if lower is None or upper is None or upper.z-lower.z<.003:continue
  if (abs(center.z-lower.z)<.0002 and normal.z>0) or (abs(center.z-upper.z)<.0002 and normal.z<0):changed.append(p.index)
 bm=bmesh.new();bm.from_mesh(o.data);bm.faces.ensure_lookup_table();bmesh.ops.reverse_faces(bm,faces=[bm.faces[i] for i in changed]);bm.normal_update();bm.to_mesh(o.data);bm.free()
 if o.data.has_custom_normals:o.data.normals_split_custom_set(np.zeros((len(o.data.loops),3),dtype=np.float32))
 o.data.update()
 (reviewRoot/'Data_QuiltShellOrientation.json').write_text(json.dumps({'existingFacesFlipped':len(changed),'method':'existing lowest/uppermost actual surface triangles oriented outward by bidirectional vertical envelope rays','addedFaces':0},indent=2))

def Export(objects,path):
 for obj in objects:
  layers=obj.data.color_attributes
  name=obj.get('GameExportColorLayer','BR_original_low_frequency_color')
  if layers.get(name):
   layers.active_color=layers[name];layers.render_color_index=layers.find(name)
  elif obj.get('GameExportColorLayer'):raise ValueError('Explicit game export colour layer is missing: '+obj.name+'/'+name)
 Select(objects)
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_vertex_color='ACTIVE',export_all_vertex_colors=False,export_tangents=True)

def Deform(points):
 # Preserve the authored large cloth folds. Only broad, shallow gathers and
 # foot-end gravity are added continuously across panels and stitching.
 x,y,z=points.T
 top=np.clip((z-.59)/.065,0,1)
 gathers=np.zeros(len(points))
 for cx,cy,amp,sx,sy in [(-.35,-.20,.007,.30,.22),(.18,.24,.008,.34,.23),(.50,-.14,.006,.28,.21)]:
  gathers+=top*amp*np.exp(-((x-cx)/sx)**2-((y-cy)/sy)**2)
 foot=np.clip((x-.80)/.48,0,1);foot=foot*foot*(3-2*foot)
 points[:,2]+=gathers-foot*(.016+.004*np.sin(7*y+.5))
 points[:,0]+=foot*.005*np.sin(9*y+1.4)
 points[:,1]+=foot*.003*np.sin(7*y+3*x)
 return points

def Prepare():
 bpy.ops.wm.open_mainfile(filepath=str(bnRoot/'Bed_BN_Complete_Editable_Checkpoint.blend'))
 assert pathlib.Path(bpy.data.filepath).resolve()==(bnRoot/'Bed_BN_Complete_Editable_Checkpoint.blend').resolve()
 objects=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render and o.name!='Plane']
 assert len(objects)==964
 # Freeze an exact, editable baseline separately from the improved high source.
 bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/'Scene_OriginalBed.blend'))
 footBad=[]
 for o in objects:
  if o.name.startswith('AB exact material partition') or o.name in ('C13 reference-mapped hand sewing','C22 main panel seam stitching','C80c relocated A B and C collar sewing','R83 gray panel joined-edge sewing','R173 registered visible panel hand sewing'):
   p=np.empty(len(o.data.vertices)*3,dtype=np.float32);o.data.vertices.foreach_get('co',p);p=p.reshape(-1,3)
   matrix=np.array(o.matrix_world);world=p@matrix[:3,:3].T+matrix[:3,3]
   if o.name=='AB exact material partition 10':
    for p in o.data.polygons:
     if len(p.vertices)==3:
      a,b,c=world[list(p.vertices)].astype(np.float64)
      if np.linalg.norm(np.cross(b-a,c-a))<1e-12:footBad.append(p.index)
   changed=Deform(world.copy());local=(changed-matrix[:3,3])@np.linalg.inv(matrix[:3,:3]).T
   o.data.vertices.foreach_set('co',local.ravel());o.data.update()
 foot=bpy.data.objects['AB exact material partition 10']
 with bpy.data.libraries.load(str(bsRoot/'BS_material_only.blend'),link=False) as (a,b):b.materials=[n for n in a.materials if n.startswith('BS natural')]
 foot.data.materials[0]=b.materials[0];foot.data.materials[0].name='Material_BSFootCloth'
 attr=foot.data.color_attributes.new(name='BR_original_low_frequency_color',type='FLOAT_COLOR',domain='CORNER');attr.data.foreach_set('color',np.load(bsRoot/'BR_lowfrequency_corner_colors.npz')['rgba'].ravel());foot.data.color_attributes.active_color=attr
 bm=bmesh.new();bm.from_mesh(foot.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.faces[i] for i in footBad],context='FACES');bm.to_mesh(foot.data);bm.free();foot.data.update()
 (reviewRoot/'Data_SourceFaceCleanup.json').write_text(json.dumps({'sourceDegenerateFootFaces':footBad,'areaGate':1e-12,'method':'Original undeformed world-space float64 cross product; remove faces after restoring CORNER colours and before game decimation.'},indent=2))
 foot.name='BS_FootCloth'
 # Pack a PNG copy for safe Blender export; the pack stage restores original WebP bytes.
 for m in [foot.data.materials[0]]:
  for n in m.node_tree.nodes:
   if n.type=='TEX_IMAGE' and n.image:
    role='Base' if n.image.colorspace_settings.name=='sRGB' else 'Normal'
    path=textureRoot/('Texture_BSFoot'+role+'.png');n.image.filepath_raw=str(path);n.image.file_format='PNG';n.image.save();n.image.pack()
 # The previous height-band fit also pulled visible fold flanks down by up to
 # 149 mm. Keep the complete authored outer shell; game contact now uses a
 # separately classified hidden underside and the real compacted straw mat.
 (reviewRoot/'Data_UndersideFitHigh.json').write_text(json.dumps({'method':'Authored visible shell preserved; no height-band displacement of fold flanks','fitDisplacementM':0},indent=2))
 PrepareReferenceFrameSources([o for o in objects if GroupName(o)=='Frame'])
 ArchiveRecipes()
 bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/'Scene_PatchedTimberBedHigh.blend'))
 scene=bpy.context.scene;scene.render.resolution_x=1080;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.render.use_border=False;scene.render.use_crop_to_border=False;scene.cycles.samples=32;scene.render.threads_mode='FIXED';scene.render.threads=6
 scene.render.filepath=str(reviewRoot/'Render_FinalHigh.png')
 if not config.get('skipRenders',False):bpy.ops.render.render(write_still=True)
 print('PREPARED_HIGH',flush=True)

def GroupName(o):
 if o.name=='BS_FootCloth':return 'BS_FootCloth'
 if o.name.startswith('AB exact material partition'):return 'Quilt'
 if 'pillow' in o.name.lower():return 'Pillow'
 if 'sew' in o.name.lower() or 'stitch' in o.name.lower():return 'Sewing'
 if o.name.startswith('FRAME_'):return 'Frame'
 return 'Straw'

def Join(objects,name):
 Select(objects);bpy.ops.object.join();o=bpy.context.object;o.name=name;return o

def BakeVertexGroup(groupName,sourceObjects,targetCount):
 # Dense independent straw ribbons make pathological tiny atlas islands.
 # Sample original surface colour at retained corners and retain tiled normals.
 copies=[]
 for obj in sourceObjects:
  o=obj.copy();o.data=obj.data.copy();bpy.context.collection.objects.link(o)
  copies.append(o)
 low=Join(copies,groupName);Select([low]);bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
 before=TriangleCount(low)
 # Imported source triangles include coincident vertices at UV/normal splits.
 # Weld geometry before collapse; loop UV/colour islands remain independent.
 CleanGameMesh(low,soft=True)
 mod=low.modifiers.new('GameBudget','DECIMATE');mod.ratio=min(1,targetCount/before);mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 CleanGameMesh(low,soft=True)
 if groupName=='Quilt':OrientQuiltShell(low)
 for i,m in enumerate(list(low.data.materials)):
  if m is None:continue
  m=m.copy();low.data.materials[i]=m
  for n in m.node_tree.nodes:
   if n.type=='VERTEX_COLOR' and not n.layer_name:n.layer_name='Color'
 attr=low.data.color_attributes.new(name='BR_original_low_frequency_color',type='FLOAT_COLOR',domain='CORNER');low.data.color_attributes.active_color=attr
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=1;scene.render.threads_mode='FIXED';scene.render.threads=6
 scene.render.bake.target='VERTEX_COLORS';scene.render.bake.use_selected_to_active=False;scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
 Select([low]);bpy.ops.object.bake(type='DIFFUSE')
 # A corner bake samples at each triangle corner; average within each retained
 # vertex/material island to avoid needless colour-only vertex splits.
 colors=np.empty(len(low.data.loops)*4,dtype=np.float32);attr.data.foreach_get('color',colors);colors=colors.reshape(-1,4)
 vertexIds=np.empty(len(low.data.loops),dtype=np.int32);low.data.loops.foreach_get('vertex_index',vertexIds)
 materialIds=np.concatenate([np.full(p.loop_total,p.material_index,dtype=np.int32) for p in low.data.polygons])
 _,inverse=np.unique(np.stack((vertexIds,materialIds),axis=1),axis=0,return_inverse=True)
 sums=np.zeros((int(inverse.max())+1,4),dtype=np.float64);np.add.at(sums,inverse,colors);counts=np.bincount(inverse);colors[:]=(sums/counts[:,None])[inverse];attr.data.foreach_set('color',colors.ravel())
 material=bpy.data.materials.new('Material_Bed'+groupName);material.use_nodes=True;bsdf=material.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(1,1,1,1);bsdf.inputs['Roughness'].default_value=.94 if groupName=='Quilt' else .87
 # Vertex colour export is explicit, independent of Blender's active old layer.
 col=material.node_tree.nodes.new('ShaderNodeVertexColor');col.layer_name=attr.name;material.node_tree.links.new(col.outputs['Color'],bsdf.inputs['Base Color'])
 im=bpy.data.images['0.jpg' if groupName=='Quilt' else 'Texture_HaystackStrawNormal']
 im.filepath_raw=str(textureRoot/('Texture_Bed'+groupName+'TiledNormal.png'));im.file_format='PNG';im.save();im.pack()
 nodes=material.node_tree.nodes;links=material.node_tree.links;uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap';tex=nodes.new('ShaderNodeTexImage');tex.image=im;normal=nodes.new('ShaderNodeNormalMap');normal.uv_map='UVMap';normal.inputs['Strength'].default_value=.25 if groupName=='Quilt' else .12
 links.new(uv.outputs['UV'],tex.inputs['Vector']);links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
 low.data.materials.clear();low.data.materials.append(material)
 for p in low.data.polygons:p.material_index=0
 for layer in list(low.data.color_attributes):
  if layer.name!=attr.name:low.data.color_attributes.remove(layer)
 print('BAKED_VERTEX',groupName,before,TriangleCount(low),flush=True)
 return low,{'group':groupName,'sourceObjects':len(sourceObjects),'sourceTriangles':before,'gameTriangles':TriangleCount(low),'representation':'source surface colour sampled to CORNER COLOR_0, authored tiled normal and UV retained'}

def BakeGroup(groupName,sourceObjects,targetCount,size):
 # Join only independent copies. Original individual high objects remain editable.
 copies=[]
 for obj in sourceObjects:
  o=obj.copy();o.data=obj.data.copy();bpy.context.collection.objects.link(o);copies.append(o)
 low=Join(copies,groupName)
 Select([low]);bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
 before=TriangleCount(low)
 if before>targetCount:
  mod=low.modifiers.new('GameBudget','DECIMATE');mod.ratio=targetCount/before;mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 # Remove true collapsed faces before unwrap without merging distinct sewn shells.
 bm=bmesh.new();bm.from_mesh(low.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bad=[f for f in bm.faces if f.calc_area()<5e-13]
 bmesh.ops.delete(bm,geom=bad,context='FACES');bm.to_mesh(low.data);bm.free();low.data.update()
 # Original unconnected texture vectors must keep their authoring UV after adding GameUV.
 for i,m in enumerate(list(low.data.materials)):
  if m is None:continue
  m=m.copy();low.data.materials[i]=m
  for n in list(m.node_tree.nodes):
   if n.type=='TEX_IMAGE' and not n.inputs['Vector'].is_linked:
    uv=m.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap';m.node_tree.links.new(uv.outputs['UV'],n.inputs['Vector'])
 uv=low.data.uv_layers.new(name='GameUV');low.data.uv_layers.active=uv;uv.active_render=True
 Select([low]);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.007,area_weight=.35);bpy.ops.object.mode_set(mode='OBJECT')
 if groupName=='Frame':return BakeFrameOnExistingMesh(low,sourceObjects)
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16 if groupName=='Frame' else 8;scene.render.threads_mode='FIXED';scene.render.threads=6
 scene.render.bake.use_selected_to_active=False;scene.render.bake.margin=12;scene.render.bake.use_clear=True;scene.render.bake.target='IMAGE_TEXTURES'
 scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
 images={}
 for role,bakeType in [('Base','DIFFUSE'),('Normal','NORMAL'),('Roughness','ROUGHNESS')]:
  im=bpy.data.images.new('Texture_Bed'+groupName+role,width=size,height=size,alpha=False);im.colorspace_settings.name='sRGB' if role=='Base' else 'Non-Color'
  for m in low.data.materials:
   if m:
    node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=im;m.node_tree.nodes.active=node
  Select([low]);bpy.ops.object.bake(type=bakeType)
  im.filepath_raw=str(textureRoot/(im.name+'.png'));im.file_format='PNG';im.save();im.pack();images[role]=im
 # One native PBR material per group. Keep baked tangents and eliminate old UV sets.
 material=bpy.data.materials.new('Material_Bed'+groupName);material.use_nodes=True
 nodes=material.node_tree.nodes;links=material.node_tree.links;bsdf=nodes.get('Principled BSDF');bsdf.inputs['Metallic'].default_value=0
 for role in images:
  n=nodes.new('ShaderNodeTexImage');n.image=images[role]
  if role=='Normal':
   normal=nodes.new('ShaderNodeNormalMap');normal.uv_map='GameUV';links.new(n.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
  else:links.new(n.outputs['Color'],bsdf.inputs['Base Color' if role=='Base' else 'Roughness'])
 low.data.materials.clear();low.data.materials.append(material)
 for p in low.data.polygons:p.material_index=0
 for layer in list(low.data.uv_layers):
  if layer.name!='GameUV':low.data.uv_layers.remove(layer)
 for layer in list(low.data.color_attributes):low.data.color_attributes.remove(layer)
 print('BAKED',groupName,before,TriangleCount(low),size,flush=True)
 return low,{'group':groupName,'sourceObjects':len(sourceObjects),'sourceTriangles':before,'gameTriangles':TriangleCount(low),'removedDegenerates':len(bad),'bakeSize':size}

def BakeFrameOnExistingMesh(frame,sourceObjects):
 # Bake source shaders onto approved geometry and GameUV, without re-decimation.
 sourceObjects=list(sourceObjects);scene=bpy.context.scene
 before=np.empty(len(frame.data.vertices)*3,dtype=np.float32);frame.data.vertices.foreach_get('co',before)
 visibility={obj:(obj.hide_render,obj.hide_get()) for obj in scene.objects if obj.type=='MESH'}
 target=bpy.data.materials.new('Material_FrameProjectionTarget');target.use_nodes=True
 frame.data.materials.clear();frame.data.materials.append(target)
 for poly in frame.data.polygons:poly.material_index=0
 uv=frame.data.uv_layers.get('GameUV')
 if uv is None:raise ValueError('Approved Frame has no GameUV')
 frame.data.uv_layers.active=uv;uv.active_render=True
 images={}
 try:
  for obj in visibility:obj.hide_render=True
  for obj in sourceObjects+[frame]:obj.hide_render=False;obj.hide_set(False)
  scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16
  scene.render.threads_mode='FIXED';scene.render.threads=6
  bake=scene.render.bake;bake.target='IMAGE_TEXTURES';bake.use_selected_to_active=True
  bake.use_cage=False;bake.cage_extrusion=.006;bake.max_ray_distance=.025
  bake.margin=12;bake.use_clear=True;bake.use_pass_direct=False;bake.use_pass_indirect=False;bake.use_pass_color=True
  for role,kind,size in [('Base','DIFFUSE',2048),('Normal','NORMAL',1024),('Roughness','ROUGHNESS',512)]:
   name='Texture_BedFrame'+role+'Aged'
   previous=bpy.data.images.get(name)
   if previous:previous.name=name+'_Previous'
   image=bpy.data.images.new(name,width=size,height=size,alpha=False)
   image.colorspace_settings.name='sRGB' if role=='Base' else 'Non-Color'
   node=target.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;target.node_tree.nodes.active=node
   Select([frame]+sourceObjects);bpy.context.view_layer.objects.active=frame
   print('FRAME_MATERIAL_BAKE_BEGIN',role,size,flush=True)
   bpy.ops.object.bake(type=kind)
   image.filepath_raw=str(textureRoot/(name+'.png'));image.file_format='PNG';image.save();image.pack();images[role]=image
   print('FRAME_MATERIAL_BAKE_FINISHED',role,flush=True)
 finally:
  scene.render.bake.use_selected_to_active=False
  for obj,(hideRender,hidden) in visibility.items():obj.hide_render=hideRender;obj.hide_set(hidden)
 material=bpy.data.materials.new('Material_BedFrame');material.use_nodes=True
 nodes=material.node_tree.nodes;links=material.node_tree.links;shader=nodes.get('Principled BSDF')
 shader.inputs['Metallic'].default_value=0
 uvNode=nodes.new('ShaderNodeUVMap');uvNode.uv_map='GameUV'
 for role,image in images.items():
  texture=nodes.new('ShaderNodeTexImage');texture.image=image;links.new(uvNode.outputs['UV'],texture.inputs['Vector'])
  if role=='Normal':
   normal=nodes.new('ShaderNodeNormalMap');normal.uv_map='GameUV'
   links.new(texture.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],shader.inputs['Normal'])
  else:links.new(texture.outputs['Color'],shader.inputs['Base Color' if role=='Base' else 'Roughness'])
 frame.data.materials[0]=material
 for layer in list(frame.data.uv_layers):
  if layer.name!='GameUV':frame.data.uv_layers.remove(layer)
 for layer in list(frame.data.color_attributes):frame.data.color_attributes.remove(layer)
 after=np.empty_like(before);frame.data.vertices.foreach_get('co',after)
 if not np.array_equal(before,after):raise ValueError('Frame material bake moved approved geometry')
 return frame,{'group':'Frame','sourceObjects':len(sourceObjects),'sourceTriangles':sum(TriangleCount(obj) for obj in sourceObjects),'gameTriangles':TriangleCount(frame),'bakeSize':2048,'normalSize':1024,'roughnessSize':512,'representation':'Aged source shaders projected to approved geometry and GameUV; selected-to-active PBR bake','maximumVertexDisplacementM':0.,'projectionCageExtrusionM':.006,'projectionRayDistanceM':.025}


def CompactFrameTextures(frame):
 # Keep the visible grain colour at 2K; tangent relief and broad roughness need
 # fewer texels. The original 2K source bakes remain in Bakes for editing.
 rows=[]
 for node in frame.data.materials[0].node_tree.nodes:
  if node.type!='TEX_IMAGE' or not node.image:continue
  image=node.image
  role=next((name for name in ('Normal','Roughness') if name in image.name),None)
  if role is None:continue
  size=1024 if role=='Normal' else 512
  before=list(image.size)
  if before==[size,size]:continue
  if image.packed_file:image.unpack(method='REMOVE')
  image.scale(size,size)
  if role=='Normal':
   pixels=np.empty(size*size*4,dtype=np.float32);image.pixels.foreach_get(pixels)
   pixels=pixels.reshape(-1,4);vectors=pixels[:,:3]*2-1
   vectors/=np.maximum(np.linalg.norm(vectors,axis=1,keepdims=True),1e-12)
   pixels[:,:3]=(vectors+1)*.5;image.pixels.foreach_set(pixels.ravel())
  image.name='Texture_BedFrame'+role+'Game'
  image.filepath_raw=str(textureRoot/(image.name+'.png'));image.file_format='PNG';image.save();image.pack()
  rows.append({'role':role,'bakedDimensions':before,'gameDimensions':list(image.size),'normalVectorsRenormalized':role=='Normal'})
 return {'frameBaseDimensions':[2048,2048],'maps':rows,'policy':'2K colour / 1K tangent normal / 512 roughness; original source bakes retained'}

def Build():
 if not config.get('useOpenScene',False):bpy.ops.wm.open_mainfile(filepath=str(sourceRoot/'Scene_PatchedTimberBedHigh.blend'))
 originals=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render and o.name!='Plane']
 groups={}
 for o in originals:groups.setdefault(GroupName(o),[]).append(o)
 foot=groups['BS_FootCloth'][0];duplicate=foot.copy();duplicate.data=foot.data.copy();bpy.context.collection.objects.link(duplicate);duplicate.name='BS_FootCloth_Game'
 duplicate.data.materials[0].name='BS_FootCloth';CleanGameMesh(duplicate,soft=True)
 Select([duplicate]);mod=duplicate.modifiers.new('FootBudget','DECIMATE');mod.ratio=min(1,5000/TriangleCount(duplicate));mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name);CleanGameMesh(duplicate,soft=True)
 duplicate.name='BS_FootCloth'
 rows=[];game=[duplicate]
 for name,target,size in [('Quilt',18000,2048),('Pillow',2200,512),('Sewing',1800,512),('Frame',7200,2048),('Straw',12500,1024)]:
  if name=='Quilt':low,row=BakeQuiltSurface(groups[name],target)
  elif name=='Straw':
   from Script_PatchedTimberBedStraw import BakeStrawSurface
   low,row=BakeStrawSurface(groups[name],12500)
  elif name=='Frame':low,row=BuildReferenceFrame(groups[name],target)
  else:low,row=BakeGroup(name,groups[name],target,512 if name in ('Pillow','Sewing') else size)
  game.append(low);rows.append(row)
  bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/'Scene_BedBakeProgress.blend'))
  (reviewRoot/'Data_BakeBaseReport.json').write_text(json.dumps({'groups':rows,'footTriangles':TriangleCount(duplicate)},indent=2))
 FinishGame(game,originals,rows,duplicate)

def FinishGame(game,originals,rows,duplicate):
 from Script_PatchedTimberBedContact import AddCompactMatContact
 quilt=next(o for o in game if o.name=='Quilt');straw=next(o for o in game if o.name=='Straw');sewing=next(o for o in game if o.name=='Sewing')
 # Contact allocates the remaining whole-bed budget. Count actual valid meshes
 # at that point, rather than reserving triangles that validation later removes.
 validateBeforeBudget=config.get('stage','all') in ('all','build','finish')
 if validateBeforeBudget:
  beforeContact=[]
  for obj in game:
   count=TriangleCount(obj);repaired=obj.data.validate(verbose=True,clean_customdata=False);obj.data.update()
   if obj.data.validate(verbose=False,clean_customdata=False):raise ValueError('Unstable pre-contact mesh validation: '+obj.name)
   beforeContact.append({'group':obj.name,'trianglesBefore':count,'trianglesAfter':TriangleCount(obj),'meshValidationRepaired':repaired})
  (reviewRoot/'Data_GameMeshPreContactValidation.json').write_text(json.dumps(beforeContact,indent=2))
 liningStats=AddCompactMatContact(quilt,duplicate,straw,validateBeforeBudget=validateBeforeBudget)
 (reviewRoot/'Data_QuiltLining.json').write_text(json.dumps(liningStats,indent=2))
 from Script_PatchedTimberBedStrawAge import ApplyAgedStrawMaterial
 strawAgeStats=ApplyAgedStrawMaterial(straw,textureRoot)
 straw['GameExportColorLayer']=strawAgeStats['exportColorLayer']
 (reviewRoot/'Data_StrawAge.json').write_text(json.dumps(strawAgeStats,indent=2))
 OrientQuiltShell(quilt)
 weaveStats=ApplyCottonWeave(quilt,bsRoot,textureRoot)
 (reviewRoot/'Data_CottonWeave.json').write_text(json.dumps(weaveStats,indent=2))
 textureStats=CompactFrameTextures(next(o for o in game if o.name=='Frame'))
 (reviewRoot/'Data_TextureBudget.json').write_text(json.dumps(textureStats,indent=2))
 cleanup=[]
 for o in game:
  before=TriangleCount(o)
  repaired=o.data.validate(verbose=True,clean_customdata=False);o.data.update()
  if o.data.validate(verbose=False,clean_customdata=False):raise ValueError(f'{o.name} remains invalid after mesh cleanup')
  cleanup.append({'group':o.name,'trianglesBefore':before,'trianglesAfter':TriangleCount(o),'meshValidationRepaired':repaired,'uvLayers':[v.name for v in o.data.uv_layers],'colourLayers':[v.name for v in o.data.color_attributes]})
 (reviewRoot/'Data_GameMeshCleanup.json').write_text(json.dumps(cleanup,indent=2))
 for row in rows:
  o=next(o for o in game if o.name==row['group']);row['trianglesBeforeContactRefinement']=row['gameTriangles'];row['gameTriangles']=TriangleCount(o)
 totalTriangles=sum(TriangleCount(o) for o in game)
 if totalTriangles>50000:raise ValueError(f'Complete bed exceeds the user 50000-triangle cap: {totalTriangles}')
 # Preserve construction axes; glTF conversion produces Y-up, long X, foot +X.
 allPoints=[o.matrix_world@Vector(v) for o in game for v in o.bound_box]
 offset=Vector(((min(p.x for p in allPoints)+max(p.x for p in allPoints))/2,(min(p.y for p in allPoints)+max(p.y for p in allPoints))/2,min(p.z for p in allPoints)))
 for o in game:o.location-=offset
 for o in bpy.context.scene.objects:
  if o.type in ('CAMERA','LIGHT'):o.location-=offset
 for o in originals:o.hide_render=True;o.hide_set(True)
 for o in game:o.hide_render=False;o.hide_set(False)
 Export(game,reviewRoot/'Model_PatchedTimberBedStandard.glb')
 for row in rows:row['gameTriangles']=TriangleCount(next(o for o in game if o.name==row['group']))
 # The complete editable high source lives in its own project. A game project
 # needs the six approved meshes and studio, not another hidden high bed copy.
 removedSourceObjects=0
 for obj in originals:
  if bpy.data.objects.get(obj.name)==obj:bpy.data.objects.remove(obj,do_unlink=True);removedSourceObjects+=1
 removedUnused={}
 for name in ('meshes','materials','images'):
  collection=getattr(bpy.data,name);unused=[item for item in collection if item.users==0]
  for item in unused:collection.remove(item)
  removedUnused[name]=len(unused)
 (reviewRoot/'Data_GameProjectCompaction.json').write_text(json.dumps({'removedHiddenHighObjects':removedSourceObjects,'removedUnusedDatablocks':removedUnused,'editableGameMeshes':len(game),'highSourceRetainedSeparately':True},indent=2))
 ArchiveRecipes()
 bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/'Scene_PatchedTimberBedGame.blend'),compress=True)
 scene=bpy.context.scene;scene.render.resolution_x=1080;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.render.use_border=False;scene.cycles.samples=32;scene.render.filepath=str(reviewRoot/'Render_FinalGame.png')
 if not config.get('skipRenders',False):bpy.ops.render.render(write_still=True)
 (reviewRoot/'Data_BakeReport.json').write_text(json.dumps({'groups':rows,'footTriangles':TriangleCount(duplicate),'originOffsetBlender':list(offset)},indent=2))
 print('GAME_EXPORTED',flush=True)

def ResumeFinish():
 # Local iteration resumes the exact checkpoint produced by Build, before any
 # contact fitting, lining, UV1 cotton mapping or pivot translation.
 bpy.ops.wm.open_mainfile(filepath=str(sourceRoot/'Scene_BedBakeProgress.blend'))
 game=[bpy.data.objects[name] for name in ('Quilt','Pillow','Sewing','Frame','Straw')]
 feet=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('BS_FootCloth') and len(o.data.vertices)<30000]
 assert len(feet)==1
 duplicate=feet[0];game.insert(0,duplicate)
 assert not game[1].get('GameQuiltLiningAdded',False)
 originals=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name!='Plane' and o not in game]
 baseReport=reviewRoot/'Data_BakeBaseReport.json'
 rows=json.loads((baseReport if baseReport.is_file() else reviewRoot/'Data_BakeReport.json').read_text())['groups']
 for row in rows:row['gameTriangles']=TriangleCount(next(o for o in game if o.name==row['group']))
 FinishGame(game,originals,rows,duplicate)

def RefreshSoftGroup():
 # Iterate one source-based soft group while reusing the checked PBR atlases.
 # Full Build calls the same surface helpers, so this is a checkpoint shortcut.
 bpy.ops.wm.open_mainfile(filepath=str(sourceRoot/'Scene_BedBakeProgress.blend'))
 game=[bpy.data.objects[name] for name in ('Quilt','Pillow','Sewing','Frame','Straw')]
 feet=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('BS_FootCloth') and len(o.data.vertices)<30000]
 assert len(feet)==1
 duplicate=feet[0];game.insert(0,duplicate)
 originals=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.name!='Plane' and o not in game]
 name=config.get('refreshGroup','Straw');old=next(o for o in game if o.name==name);oldMesh=old.data
 game.remove(old);bpy.data.objects.remove(old,do_unlink=True)
 if oldMesh.users==0:bpy.data.meshes.remove(oldMesh)
 sources=[o for o in originals if GroupName(o)==name]
 if name=='Quilt':low,row=BakeQuiltSurface(sources,18000)
 else:
  from Script_PatchedTimberBedStraw import BakeStrawSurface
  low,row=BakeStrawSurface(sources,12500)
 game.append(low)
 basePath=reviewRoot/'Data_BakeBaseReport.json';base=json.loads(basePath.read_text())
 base['groups']=[row if item['group']==name else item for item in base['groups']];basePath.write_text(json.dumps(base,indent=2))
 (reviewRoot/('Data_'+name+'SourceBake.json')).write_text(json.dumps(row,indent=2))
 bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/'Scene_BedBakeProgress.blend'))
 FinishGame(game,originals,base['groups'],duplicate)

def TagFrameSources(objects):
 from Script_PatchedTimberBedWood import _MetalMaterial,_RetainedMaterial
 for index,obj in enumerate(sorted(objects,key=lambda item:item.name)):
  obj['FrameMemberId']=index
  for name in ('FrameMemberId','FrameMetalSlot'):
   layer=obj.data.attributes.get(name)
   if layer is None:layer=obj.data.attributes.new(name=name,type='INT',domain='FACE')
   if name=='FrameMemberId':values=np.full(len(obj.data.polygons),index,dtype=np.int32)
   else:
    classes=[1 if _MetalMaterial(material) else 2 if _RetainedMaterial(material) else 0 for material in obj.data.materials]
    values=np.asarray([classes[poly.material_index] if poly.material_index<len(classes) else 0 for poly in obj.data.polygons],dtype=np.int32)
   layer.data.foreach_set('value',values)


def PrepareReferenceFrameSources(objects):
 from Script_PatchedTimberBedWoodDamage import DamageTimberMembers
 objects=list(objects)
 # Reproduce the previous tiny V1 corner wear on pristine rebuild inputs only;
 # its independent version prevents cumulative chipping on existing sources.
 TagFrameSources(objects);WeatherTimberFrame(objects,chipGeometry=True)
 damage=DamageTimberMembers(objects,gameTriangleTarget=7200)
 damageFile=reviewRoot/'Data_WoodDamage.json'
 archivedDamage=sourceRoot/'Scripts/Data_WoodDamage.json'
 if damage.get('alreadyAppliedMembers',0) and not damage.get('geometryChangedThisPass'):
  for receipt in (damageFile,archivedDamage):
   if not receipt.exists():continue
   previous=json.loads(receipt.read_text(encoding='utf-8'))
   if previous.get('completedRegions',0)>0 and previous.get('version')==damage.get('version'):
    (reviewRoot/'Data_WoodDamageIdempotence.json').write_text(json.dumps(damage,indent=2))
    damage=previous;break
 if damage.get('completedRegions',0)==0:raise ValueError('Reference wood requires actual visible subtractive damage, not an empty modifier pass')
 damageFile.write_text(json.dumps(damage,indent=2))
 archivedDamage.parent.mkdir(exist_ok=True);archivedDamage.write_text(json.dumps(damage,indent=2))
 TagFrameSources(objects)
 stats=WeatherTimberFrame(objects,chipGeometry=False,textureRoot=textureRoot)
 (reviewRoot/'Data_WoodWeathering.json').write_text(json.dumps(stats,indent=2))
 return stats


def BuildReferenceFrame(objects,targetCount=7200):
 from Script_PatchedTimberBedWood import ApplyReferenceWoodSurface
 objects=list(objects);TagFrameSources(objects)
 stats=WeatherTimberFrame(objects,chipGeometry=False,textureRoot=textureRoot)
 copies=[]
 for source in objects:
  obj=source.copy();obj.data=source.data.copy();bpy.context.scene.collection.objects.link(obj);copies.append(obj)
 low=Join(copies,'Frame');Select([low]);bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
 before=TriangleCount(low);history=[]
 for attempt in range(6):
  count=TriangleCount(low)
  if count<=targetCount:break
  modifier=low.modifiers.new('ReferenceFrameBudget','DECIMATE');modifier.ratio=max(.005,min(.98,targetCount/count))
  modifier.use_collapse_triangulate=True
  if low.vertex_groups.get('TimberDamagePreserve'):
   modifier.vertex_group='TimberDamagePreserve';modifier.invert_vertex_group=True;modifier.vertex_group_factor=1.
  bpy.ops.object.modifier_apply(modifier=modifier.name)
  after=TriangleCount(low);history.append([count,after])
  if after>=count:break
 if TriangleCount(low)>7500:raise ValueError('Protected reference Frame exceeds the 7500-triangle component ceiling: '+str(TriangleCount(low)))
 surface=ApplyReferenceWoodSurface(low,textureRoot,stats['memberRecords'])
 low['GameExportColorLayer']=surface.get('exportColorLayer','BR_original_low_frequency_color')
 beforeValidate=TriangleCount(low);repaired=low.data.validate(verbose=True,clean_customdata=False);low.data.update()
 if low.data.validate(verbose=True,clean_customdata=False):raise ValueError('Reference Frame remains invalid')
 row={'group':'Frame','sourceObjects':len(objects),'sourceTriangles':before,'gameTriangles':TriangleCount(low),'targetTriangles':targetCount,'hardTriangleLimit':7500,'collapseHistory':history,'trianglesBeforeValidation':beforeValidate,'meshValidationRepaired':repaired,'representation':'Reference-informed damaged timber with shared metre-scale side/end surface and macro vertex colour'}
 (reviewRoot/'Data_FrameReferenceSurface.json').write_text(json.dumps(surface,indent=2))
 (reviewRoot/'Data_FrameReferenceBuild.json').write_text(json.dumps(row,indent=2))
 return low,row


def RefreshReferenceWood():
 # Rebuild Frame alone; the compact saved game supplies the frozen other five
 # components. The removed baking checkpoint is not required for this workflow.
 bpy.ops.wm.open_mainfile(filepath=str(sourceRoot/'Scene_PatchedTimberBedHigh.blend'))
 sources=[obj for obj in bpy.context.scene.objects if obj.type=='MESH' and obj.name.startswith('FRAME_')]
 PrepareReferenceFrameSources(sources)
 ArchiveRecipes();bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/'Scene_PatchedTimberBedHigh.blend'),compress=True)
 frame,row=BuildReferenceFrame(sources,7200)
 matrix=frame.matrix_world.copy();frame.parent=None;frame.matrix_world=matrix
 transfer=sourceRoot/'Scene_WoodFrameTransfer.blend'
 bpy.data.libraries.write(str(transfer),{frame},path_remap='RELATIVE',compress=True)
 bpy.ops.wm.open_mainfile(filepath=str(sourceRoot/'Scene_PatchedTimberBedGame.blend'))
 old=bpy.data.objects['Frame'];oldMesh=old.data
 bpy.data.objects.remove(old,do_unlink=True)
 if oldMesh.users==0:bpy.data.meshes.remove(oldMesh)
 try:
  with bpy.data.libraries.load(str(transfer),link=False) as (available,loaded):loaded.objects=['Frame']
 finally:transfer.unlink(missing_ok=True)
 frame=loaded.objects[0];bpy.context.scene.collection.objects.link(frame);frame.name='Frame'
 previous=json.loads((reviewRoot/'Data_PreviousAsset.json').read_text(encoding='utf-8'))
 offset=Vector(previous['coordinates']['sourceToGameTranslationBlender']);frame.location-=offset
 bpy.context.view_layer.update()
 # Reduction can lift the lowest sole by a fraction of a millimetre. Restore
 # its existing floor contact locally; re-pivoting the bed would move the five
 # frozen cloth/straw components. Refuse any correction larger than 0.5 mm.
 world=np.asarray([frame.matrix_world@vertex.co for vertex in frame.data.vertices],dtype=np.float64)
 minimum=float(world[:,2].min())
 if abs(minimum)>.0005:raise ValueError('Reduced Frame sole needs more than 0.5 mm floor correction: '+str(minimum))
 weights=np.clip(1-(world[:,2]-minimum)/.004,0,1)
 inverse=frame.matrix_world.inverted();corrected=world.copy();corrected[:,2]-=minimum*weights
 for vertex,point in zip(frame.data.vertices,corrected):vertex.co=inverse@Vector(point)
 frame.data.update()
 (reviewRoot/'Data_FrameFloorAlignment.json').write_text(json.dumps({'scope':'Frame sole bottom 4 mm only','soleBandM':.004,'floorBeforeM':minimum,'floorAfterM':float(corrected[:,2].min()),'maximumDisplacementM':float(np.abs(corrected-world).max()),'hardDisplacementLimitM':.0005,'otherComponentsMoved':False},indent=2))
 frame.hide_render=False;frame.hide_set(False)
 game=[obj for obj in bpy.context.scene.objects if obj.type=='MESH' and not obj.hide_render and obj.name!='Plane']
 if len(game)!=6 or sum(TriangleCount(obj) for obj in game)>50000:raise ValueError('Reference wood violates the complete-bed budget')
 Export(game,reviewRoot/'Model_PatchedTimberBedStandard.glb')
 for name in ('meshes','materials','images'):
  collection=getattr(bpy.data,name)
  for item in [item for item in collection if item.users==0]:collection.remove(item)
 ArchiveRecipes();bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/'Scene_PatchedTimberBedGame.blend'),compress=True)
 reportFile=reviewRoot/'Data_BakeReport.json'
 previousReport=json.loads(reportFile.read_text(encoding='utf-8')) if reportFile.exists() else {'groups':[],'originOffsetBlender':list(offset)}
 previousReport['groups']=[item for item in previousReport['groups'] if item['group']!='Frame']+[row]
 reportFile.write_text(json.dumps(previousReport,indent=2))
 scene=bpy.context.scene;scene.render.resolution_x=1080;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.render.use_border=False
 scene.cycles.samples=32;scene.render.threads_mode='FIXED';scene.render.threads=6;scene.render.filepath=str(reviewRoot/'Render_FinalGame.png')
 if not config.get('skipRenders',False):bpy.ops.render.render(write_still=True)
 print('REFERENCE_WOOD_EXPORTED',flush=True)


def ExportSavedGame():
 bpy.ops.wm.open_mainfile(filepath=str(sourceRoot/'Scene_PatchedTimberBedGame.blend'))
 game=[obj for obj in bpy.context.scene.objects if obj.type=='MESH' and not obj.hide_render and obj.name!='Plane']
 if len(game)!=6 or sum(TriangleCount(obj) for obj in game)>50000:raise ValueError('Saved game violates complete-bed contract')
 Export(game,reviewRoot/'Model_PatchedTimberBedStandard.glb')
 ArchiveRecipes();bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/'Scene_PatchedTimberBedGame.blend'),compress=True)
 print('SAVED_GAME_EXPORTED',flush=True)


def RefreshFrameMaterial():
 # External source and pre-contact checkpoint retain exact approved geometry.
 bpy.ops.wm.open_mainfile(filepath=str(sourceRoot/'Scene_PatchedTimberBedHigh.blend'))
 sources=[obj for obj in bpy.context.scene.objects if obj.type=='MESH' and obj.name.startswith('FRAME_')]
 stats=WeatherTimberFrame(sources)
 (reviewRoot/'Data_WoodWeathering.json').write_text(json.dumps(stats,indent=2))
 ArchiveRecipes();bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/'Scene_PatchedTimberBedHigh.blend'))
 bpy.ops.wm.open_mainfile(filepath=str(sourceRoot/'Scene_BedBakeProgress.blend'))
 sources=[obj for obj in bpy.context.scene.objects if obj.type=='MESH' and obj.name.startswith('FRAME_')]
 stats=WeatherTimberFrame(sources)
 (reviewRoot/'Data_WoodWeathering.json').write_text(json.dumps(stats,indent=2))
 frame=bpy.data.objects['Frame'];frame,row=BakeFrameOnExistingMesh(frame,sources)
 basePath=reviewRoot/'Data_BakeBaseReport.json';base=json.loads(basePath.read_text())
 base['groups']=[row if item['group']=='Frame' else item for item in base['groups']]
 basePath.write_text(json.dumps(base,indent=2))
 (reviewRoot/'Data_FrameMaterialRefresh.json').write_text(json.dumps(row,indent=2))
 ArchiveRecipes();bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/'Scene_BedBakeProgress.blend'))
 print('FRAME_MATERIAL_CHECKPOINT_SAVED',flush=True)


stage=config.get('stage','all')
if stage in ('prepare','all'):Prepare()
if stage in ('build','all'):Build()
if stage=='finish':ResumeFinish()
if stage=='refresh':RefreshSoftGroup()
if stage=='material-frame':RefreshReferenceWood()
if stage=='wood-reference':RefreshReferenceWood()
if stage=='export':ExportSavedGame()
