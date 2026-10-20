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
from Script_PatchedTimberBedFit import FitQuiltUnderside
from Script_PatchedTimberBedLining import AddGameQuiltLining
from Script_PatchedTimberBedCotton import ApplyCottonWeave
if '--' in sys.argv:
 parser=argparse.ArgumentParser();parser.add_argument('--source-root',required=True);parser.add_argument('--review-root',required=True);parser.add_argument('--stage',default='all',choices=['prepare','build','finish','all'])
 args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);config={'sourceRoot':args.source_root,'reviewRoot':args.review_root,'stage':args.stage}
else:config=json.loads(pathlib.Path(os.environ.get('BED_BAKE_CONFIG',str(repoRoot/'tmp/BedBnBsAcceptance/Data_BakeConfig.json'))).read_text())
sourceRoot=pathlib.Path(config['sourceRoot'])
reviewRoot=pathlib.Path(config['reviewRoot'])
bnRoot=sourceRoot/'Inputs/BN/Restored'
bsRoot=sourceRoot/'Inputs/BS/BedBS'
reviewRoot.mkdir(parents=True,exist_ok=True)
textureRoot=sourceRoot/'Bakes';textureRoot.mkdir(exist_ok=True)

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
 Select(objects)
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_cameras=False,export_lights=False,export_vertex_color='NAME',export_vertex_color_name='BR_original_low_frequency_color',export_all_vertex_colors=False,export_tangents=True)

def Deform(points):
 # A continuous field across the original eleven material partitions and sewing.
 # Positive gathers keep the lower quilt shell clear of the supporting mattress.
 x,y,z=points.T
 top=np.clip((z-.59)/.065,0,1)
 edge=np.exp(-((np.abs(y)-.365)/.13)**2)
 envelope=np.exp(-((x-.05)/.86)**4)
 ripple=(.011*np.sin(34*x+7*y+1.1)+.006*np.sin(19*x-16*y+.4))
 gathers=top*envelope*(edge*(.014+ripple))
 for cx,cy,amp,sx,sy in [(-.35,-.20,.022,.20,.14),(.10,.24,.026,.22,.16),(.48,-.14,.024,.17,.13),(-.65,.14,.017,.16,.17)]:
  gathers+=top*amp*np.exp(-((x-cx)/sx)**2-((y-cy)/sy)**2)
 foot=np.clip((x-.80)/.48,0,1);foot=foot*foot*(3-2*foot)
 points[:,2]+=gathers-foot*(.025+.010*np.sin(11*y+.5))
 points[:,0]+=foot*(.009*np.sin(19*y+1.4)+.005*np.sin(31*y))
 points[:,1]+=foot*.007*np.sin(12*y+6*x)
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
 fitStats=FitQuiltUnderside([o for o in objects if GroupName(o) in ('Quilt','BS_FootCloth')],[o for o in objects if GroupName(o)=='Straw'],affectedObjects=[o for o in objects if GroupName(o) in ('Quilt','BS_FootCloth','Sewing')],mode='high')
 (reviewRoot/'Data_UndersideFitHigh.json').write_text(json.dumps(fitStats,indent=2))
 ArchiveRecipes()
 bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/'Scene_PatchedTimberBedHigh.blend'))
 scene=bpy.context.scene;scene.render.resolution_x=1080;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.render.use_border=False;scene.render.use_crop_to_border=False;scene.cycles.samples=32;scene.render.threads_mode='FIXED';scene.render.threads=6
 scene.render.filepath=str(reviewRoot/'Render_FinalHigh.png');bpy.ops.render.render(write_still=True)
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
 nodes=material.node_tree.nodes;links=material.node_tree.links;uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap';tex=nodes.new('ShaderNodeTexImage');tex.image=im;normal=nodes.new('ShaderNodeNormalMap');normal.uv_map='UVMap';normal.inputs['Strength'].default_value=.5 if groupName=='Quilt' else .12
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
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8;scene.render.threads_mode='FIXED';scene.render.threads=8
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

def Build():
 if not config.get('useOpenScene',False):bpy.ops.wm.open_mainfile(filepath=str(sourceRoot/'Scene_PatchedTimberBedHigh.blend'))
 originals=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render and o.name!='Plane']
 groups={}
 for o in originals:groups.setdefault(GroupName(o),[]).append(o)
 foot=groups['BS_FootCloth'][0];duplicate=foot.copy();duplicate.data=foot.data.copy();bpy.context.collection.objects.link(duplicate);duplicate.name='BS_FootCloth_Game'
 duplicate.data.materials[0].name='BS_FootCloth';CleanGameMesh(duplicate,soft=True)
 Select([duplicate]);mod=duplicate.modifiers.new('FootBudget','DECIMATE');mod.ratio=.24;mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name);CleanGameMesh(duplicate,soft=True)
 duplicate.name='BS_FootCloth'
 rows=[];game=[duplicate]
 for name,target,size in [('Quilt',55000,2048),('Pillow',6000,1024),('Sewing',9000,512),('Frame',12000,1024),('Straw',65000,2048)]:
  low,row=BakeVertexGroup(name,groups[name],target) if name in ('Quilt','Straw') else BakeGroup(name,groups[name],target,512 if name in ('Pillow','Sewing') else size)
  game.append(low);rows.append(row)
  bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/'Scene_BedBakeProgress.blend'))
 FinishGame(game,originals,rows,duplicate)

def FinishGame(game,originals,rows,duplicate):
 quilt=next(o for o in game if o.name=='Quilt');straw=next(o for o in game if o.name=='Straw');sewing=next(o for o in game if o.name=='Sewing')
 fitStats=FitQuiltUnderside([quilt,duplicate],[straw],affectedObjects=[quilt,duplicate,sewing],mode='game')
 (reviewRoot/'Data_UndersideFitGame.json').write_text(json.dumps(fitStats,indent=2))
 liningStats=AddGameQuiltLining(quilt,duplicate,straw)
 (reviewRoot/'Data_QuiltLining.json').write_text(json.dumps(liningStats,indent=2))
 OrientQuiltShell(quilt)
 weaveStats=ApplyCottonWeave(quilt,bsRoot,textureRoot)
 (reviewRoot/'Data_CottonWeave.json').write_text(json.dumps(weaveStats,indent=2))
 for row in rows:
  o=next(o for o in game if o.name==row['group']);row['trianglesBeforeContactRefinement']=row['gameTriangles'];row['gameTriangles']=TriangleCount(o)
 # Preserve construction axes; glTF conversion produces Y-up, long X, foot +X.
 allPoints=[o.matrix_world@Vector(v) for o in game for v in o.bound_box]
 offset=Vector(((min(p.x for p in allPoints)+max(p.x for p in allPoints))/2,(min(p.y for p in allPoints)+max(p.y for p in allPoints))/2,min(p.z for p in allPoints)))
 for o in game:o.location-=offset
 for o in bpy.context.scene.objects:
  if o.type in ('CAMERA','LIGHT'):o.location-=offset
 for o in originals:o.hide_render=True;o.hide_set(True)
 for o in game:o.hide_render=False;o.hide_set(False)
 Export(game,reviewRoot/'Model_PatchedTimberBedStandard.glb')
 ArchiveRecipes()
 bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot/'Scene_PatchedTimberBedGame.blend'))
 scene=bpy.context.scene;scene.render.resolution_x=1080;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.render.use_border=False;scene.cycles.samples=32;scene.render.filepath=str(reviewRoot/'Render_FinalGame.png');bpy.ops.render.render(write_still=True)
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
 rows=json.loads((reviewRoot/'Data_BakeReport.json').read_text())['groups']
 for row in rows:row['gameTriangles']=TriangleCount(next(o for o in game if o.name==row['group']))
 FinishGame(game,originals,rows,duplicate)

stage=config.get('stage','all')
if stage in ('prepare','all'):Prepare()
if stage in ('build','all'):Build()
if stage=='finish':ResumeFinish()
