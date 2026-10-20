"""Role-aware, source-colour-preserving reduction of the woven straw mattress.

The visible reed lattice and lashings are reduced as independent authored
members, never by deleting their disconnected islands after a global collapse.
Only the explicitly decorative long split fibres are omitted. An over-budget
structural minimum is reported honestly for the caller to resolve.
"""
import math
import re
import time
from contextlib import nullcontext
from collections import defaultdict
import bpy
import numpy as np
from mathutils import Matrix
from Script_PatchedTimberBedQuilt import _SourceShader,_Select,_Triangles,_CleanPartition

_ColorName='BR_original_low_frequency_color'
_RoleWeights={
 'ContactCore':380,'FrontWeave':3000,'ConformingBindings':1500,
 'MajorBindings':1300,'HorizontalRows':1900,'PrimaryReeds':1800,
 'WrapReeds':1800,'UnderReeds':700,'FoldedHems':700,
 'RepairKnots':160,'FootExtension':600,'SmallDecorations':160,
}
_RoleIds={name:index+1 for index,name in enumerate(_RoleWeights)}


def _Role(obj):
 name=obj.name.lower();materials=' '.join(material.name.lower() for material in obj.data.materials if material)
 if 'long_split_reed_fibres' in name:return 'OmittedMicroFibres',False
 if 'preserved_packed_straw_contact_core' in name:return 'ContactCore',True
 if 'continuous_full_front_straw' in name:return 'FrontWeave',True
 if 'conforming_binding' in name or 'underpassing_tie' in name or (name.startswith('r101') and 'binding' in name):return 'ConformingBindings',True
 if 'dark worn major' in materials or 'lashings' in name:return 'MajorBindings',True
 if 'outside_rows' in name or 'selected_rows' in name:return 'HorizontalRows',True
 if 'outside_primary' in name or 'primary reed' in materials:return 'PrimaryReeds',True
 if 'outside_wrap' in name or 'selected_wrap' in name:return 'WrapReeds',True
 if 'outside_under' in name or 'selected_under' in name:return 'UnderReeds',True
 if 'folded_lashed_edge_hems' in name:return 'FoldedHems',True
 if 'handtied_repair_knots' in name:return 'RepairKnots',True
 if name.startswith('r101') and ('extension' in name or 'grass' in name):return 'FootExtension',True
 return 'SmallDecorations',False


def _FaceValue(obj,name,value):
 layer=obj.data.attributes.get(name)
 if layer and (layer.domain!='FACE' or layer.data_type!='INT'):obj.data.attributes.remove(layer);layer=None
 if layer is None:layer=obj.data.attributes.new(name=name,type='INT',domain='FACE')
 layer.data.foreach_set('value',np.full(len(obj.data.polygons),value,dtype=np.int32))


def _PhysicalWeight(obj):
 dimensions=sorted(float(value) for value in (obj['StrawPhysicalDimensions'] if 'StrawPhysicalDimensions' in obj else obj.dimensions))
 return math.sqrt(max(1e-8,dimensions[-1]*dimensions[-2]))*max(1,_Triangles(obj))**.12


def _Alive(obj):
 try:return bpy.data.objects.get(obj.name)==obj
 except ReferenceError:return False


def _Unlink(obj):
 for collection in list(obj.users_collection):collection.objects.unlink(obj)


def _Distribute(objects,total,minimum):
 counts=np.asarray([_Triangles(obj) for obj in objects],dtype=np.int64)
 budgets=np.minimum(counts,int(minimum))
 if int(budgets.sum())>total:
  # Keep every structural member. Its two-face minimum is more useful than
  # silently dropping whichever disconnected reed happens to sort last.
  budgets=np.minimum(counts,max(2,int(total/max(1,len(objects)))))
 remaining=max(0,int(total)-int(budgets.sum()))
 weights=np.asarray([_PhysicalWeight(obj) for obj in objects],dtype=np.float64)
 while remaining and np.any(budgets<counts):
  available=budgets<counts;active=weights*available
  additions=np.minimum(counts-budgets,np.floor(remaining*active/max(float(active.sum()),1e-30)).astype(np.int64))
  if not np.any(additions):
   for index in np.argsort(-active):
    if not remaining:break
    if available[index]:budgets[index]+=1;remaining-=1
  else:budgets+=additions;remaining-=int(additions.sum())
 return [int(value) for value in budgets]


def _Material():
 old=bpy.data.materials.get('Material_BedStraw')
 if old:old.name='Material_BedStraw_PreSurfaceBake'
 material=bpy.data.materials.new('Material_BedStraw');material.use_nodes=True
 nodes=material.node_tree.nodes;links=material.node_tree.links;bsdf=nodes.get('Principled BSDF')
 bsdf.inputs['Base Color'].default_value=(1,1,1,1);bsdf.inputs['Roughness'].default_value=.87;bsdf.inputs['Metallic'].default_value=0
 color=nodes.new('ShaderNodeVertexColor');color.layer_name=_ColorName;links.new(color.outputs['Color'],bsdf.inputs['Base Color'])
 image=bpy.data.images.get('Texture_HaystackStrawNormal')
 if image is None:raise ValueError('Original Texture_HaystackStrawNormal image is missing')
 if not image.packed_file:image.pack()
 uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap';texture=nodes.new('ShaderNodeTexImage');texture.image=image
 normal=nodes.new('ShaderNodeNormalMap');normal.uv_map='UVMap';normal.inputs['Strength'].default_value=.12
 links.new(uv.outputs['UV'],texture.inputs['Vector']);links.new(texture.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
 return material


def BakeStrawSurface(sourceObjects,targetCount=12500):
 """Return (Straw, receipt), preserving all named structural reed members.

 Retained high-density source copies are colour-sampled by one temporary joined
 bake and OriginalLoopId scattering, proven safe for these UV/Color-only source
 Base graphs. Reduction runs with only one object linked to a temporary scene.
 The caller's scene and original visibility are restored even on failure.
 """
 sources=sorted([obj for obj in sourceObjects if obj.type=='MESH'],key=lambda obj:obj.name)
 if not sources:raise ValueError('BakeStrawSurface needs source straw objects')
 if targetCount<3000:raise ValueError('Target is insufficient for the complete independent woven lattice')
 started=time.perf_counter();scene=bpy.context.scene;window=bpy.context.window
 windowScene=window.scene if window else None
 visibility={obj:(obj.hide_render,obj.hide_get()) for obj in scene.objects if obj.type=='MESH'}
 temporaryScene=None;low=None;colorBakeStats={};stageTimes={}
 copies=[];rows=[];omitted=[];materials={};roleObjects=defaultdict(list)
 oldStraw=bpy.data.objects.get('Straw');normalSources={obj.as_pointer() for obj in sources}
 game=[];feet=[obj for obj in visibility if obj.name.startswith('BS_FootCloth')]
 footHigh=max(feet,key=_Triangles) if feet else None
 for obj in visibility:
  if re.match(r'^(Quilt|Pillow|Sewing|Frame|Straw)(\.\d+)?$',obj.name) or obj.get('QuiltSourceName') or obj.get('StrawSourceName') or (obj in feet and obj!=footHigh):game.append(obj)
 try:
  for index,source in enumerate(sources):
   role,protected=_Role(source)
   if role=='OmittedMicroFibres':
    omitted.append({'sourceObject':source.name,'sourceTriangles':_Triangles(source),'role':role,'reason':'explicit decorative split microfibres; complete major woven members retained'});continue
   obj=source.copy();obj.data=source.data.copy();scene.collection.objects.link(obj)
   obj.name='StrawSurface_Source_'+str(index);obj['StrawSourceName']=source.name;obj['StrawSourceRole']=role
   copies.append(obj);roleObjects[role].append(obj);risks=[]
   for slot,material in enumerate(list(obj.data.materials)):
    if material is None:continue
    key=material.as_pointer()
    if key not in materials:materials[key]=_SourceShader(material)
    copied,sourceRisks=materials[key];obj.data.materials[slot]=copied;risks.extend(sourceRisks)
   old=obj.data.color_attributes.get(_ColorName)
   if old:obj.data.color_attributes.remove(old)
   attr=obj.data.color_attributes.new(name=_ColorName,type='FLOAT_COLOR',domain='CORNER');obj.data.color_attributes.active_color=attr
   _FaceValue(obj,'StrawProtectedStructure',int(protected));_FaceValue(obj,'StrawSourceRole',_RoleIds[role]);_FaceValue(obj,'StrawSourceObject',index)
   obj['StrawPhysicalDimensions']=[float(value) for value in source.dimensions]
   rows.append({'sourceObject':source.name,'role':role,'protectedStructure':protected,'sourceTriangles':_Triangles(source),'sourceMaterials':[material.name for material in source.data.materials if material],'potentialGeometryDependentNodes':risks})
  stageTimes['copySeconds']=time.perf_counter()-started
  print('STRAW_SOURCE_COPIES_READY',len(copies),round(stageTimes['copySeconds'],2),flush=True)
  for original in sources:original.hide_render=True
  for obj in game:obj.hide_render=True
  for obj in copies:obj.hide_render=False
  scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=1;scene.render.threads_mode='FIXED';scene.render.threads=6
  scene.render.bake.target='VERTEX_COLORS';scene.render.bake.use_selected_to_active=False;scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
  from Script_PatchedTimberBedColorBake import BakeJoinedSourceColors
  bakeStarted=time.perf_counter();colorBakeStats=BakeJoinedSourceColors(copies)
  stageTimes['colourBakeSeconds']=time.perf_counter()-bakeStarted
  print('STRAW_SOURCE_COLOURS_READY',len(copies),round(stageTimes['colourBakeSeconds'],2),flush=True)
  for obj,row in zip(copies,rows):
   attr=obj.data.color_attributes[_ColorName];colors=np.empty(len(attr.data)*4,dtype=np.float32);attr.data.foreach_get('color',colors)
   if not np.all(np.isfinite(colors)):raise ValueError('Nonfinite straw source bake: '+row['sourceObject'])
   rgb=colors.reshape(-1,4)[:,:3]
   row['bakedLinearRgbMinMax']=[float(rgb.min()),float(rgb.max())]
  minima={'ContactCore':48,'FrontWeave':120,'ConformingBindings':12,'MajorBindings':4,'HorizontalRows':8,'PrimaryReeds':6,'WrapReeds':4,'UnderReeds':4,'FoldedHems':48,'RepairKnots':24,'FootExtension':48,'SmallDecorations':4}
  totalWeight=sum(_RoleWeights[role] for role in roleObjects)
  allocations={role:int(targetCount*_RoleWeights[role]/totalWeight) for role in roleObjects}
  if allocations:allocations[max(allocations,key=allocations.get)]+=int(targetCount)-sum(allocations.values())
  byObject={}
  for role,objects in roleObjects.items():
   for obj,budget in zip(objects,_Distribute(objects,allocations[role],minima[role])):byObject[obj.as_pointer()]=budget
  # Colour no longer depends on object-space shader state. Bake the exact world
  # transform into each private mesh before detaching its original parent, so
  # the isolated scene does not need any of the 1800-object source dependency
  # graph. UV and CORNER attributes are unaffected by this position transform.
  transformStarted=time.perf_counter();mirrored=0
  for obj in copies:
   world=obj.matrix_world.copy();obj.data.transform(world)
   if world.to_3x3().determinant()<0:
    obj.data.flip_normals();mirrored+=1
   obj.parent=None;obj.matrix_world=Matrix.Identity(4);obj.data.update();_Unlink(obj)
  stageTimes['worldTransformSeconds']=time.perf_counter()-transformStarted
  temporaryScene=bpy.data.scenes.new('Scene_StrawReductionTemporary')
  if window:window.scene=temporaryScene
  context=nullcontext() if window else bpy.context.temp_override(scene=temporaryScene,view_layer=temporaryScene.view_layers[0])
  reductionStarted=time.perf_counter()
  with context:
   for index,(obj,row) in enumerate(zip(copies,rows)):
    temporaryScene.collection.objects.link(obj)
    try:
     budget=byObject[obj.as_pointer()];_Select([obj]);history=[]
     row['removedDegeneratesBeforeDecimation']=_CleanPartition(obj);row['trianglesAfterWithinSourceWeld']=_Triangles(obj)
     for attempt in range(7):
      before=_Triangles(obj)
      if before<=budget:break
      backup=obj.data.copy() if row['protectedStructure'] else None
      modifier=obj.modifiers.new('SourceRoleStrawBudget','DECIMATE');modifier.ratio=max(.00001,min(.98,budget/before));modifier.use_collapse_triangulate=True
      bpy.ops.object.modifier_apply(modifier=modifier.name);_CleanPartition(obj);after=_Triangles(obj);history.append([before,after])
      if after==0 and backup is not None:
       failed=obj.data;obj.data=backup;bpy.data.meshes.remove(failed)
       row['collapseWouldRemoveCompleteStructuralMember']=True
       break
      if backup is not None:bpy.data.meshes.remove(backup)
      if after>=before:break
     _FaceValue(obj,'StrawProtectedStructure',int(row['protectedStructure']));_FaceValue(obj,'StrawSourceRole',_RoleIds[row['role']])
     row['allocatedTriangles']=budget;row['gameTriangles']=_Triangles(obj);row['collapsePasses']=history;row['budgetOverrunTriangles']=max(0,row['gameTriangles']-budget)
     obj.hide_render=True
    finally:_Unlink(obj)
    if (index+1)%100==0 or index+1==len(copies):print('STRAW_REDUCED_SOURCES',index+1,len(copies),round(time.perf_counter()-reductionStarted,2),flush=True)
  stageTimes['isolatedReductionSeconds']=time.perf_counter()-reductionStarted
  if window:window.scene=windowScene
  bpy.data.scenes.remove(temporaryScene);temporaryScene=None
  for obj in copies:scene.collection.objects.link(obj)
  material=_Material()
  for obj in copies:
   obj.data.materials.clear();obj.data.materials.append(material)
   for poly in obj.data.polygons:poly.material_index=0
   for attr in list(obj.data.color_attributes):
    if attr.name!=_ColorName:obj.data.color_attributes.remove(attr)
   obj.data.color_attributes.active_color=obj.data.color_attributes[_ColorName]
  if oldStraw is not None and oldStraw.as_pointer() not in normalSources:
   oldStraw.name='Straw_PreSurfaceBake';oldStraw.hide_render=True;oldStraw.hide_set(True)
  _Select(copies);bpy.ops.object.join();low=bpy.context.object;low.name='Straw';bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
  low['StrawColorBakedOnDenseSources']=True;low['StrawProtectedStructureAttribute']='StrawProtectedStructure'
  print('STRAW_JOIN_READY',_Triangles(low),round(time.perf_counter()-started,2),flush=True)
 finally:
  if window and windowScene is not None:window.scene=windowScene
  if temporaryScene is not None:
   for obj in copies:
    if _Alive(obj):_Unlink(obj)
   bpy.data.scenes.remove(temporaryScene);temporaryScene=None
  if low is None:
   # Failure must not leave detached private copies or a temporary scene behind.
   # Originals and their meshes are untouched by the whole operation.
   for obj in copies:
    if not _Alive(obj):continue
    mesh=obj.data;bpy.data.objects.remove(obj,do_unlink=True)
    if mesh.users==0:bpy.data.meshes.remove(mesh)
  for obj,(hideRender,hideViewport) in visibility.items():
   if obj.name in bpy.data.objects:obj.hide_render=hideRender;obj.hide_set(hideViewport)
  if oldStraw is not None and oldStraw.name.startswith('Straw_PreSurfaceBake'):oldStraw.hide_render=True;oldStraw.hide_set(True)
 low.hide_render=False;low.hide_set(False)
 roleReports=[]
 for role,objects in roleObjects.items():
  members=[row for row in rows if row['role']==role]
  roleReports.append({'role':role,'sourceObjects':len(members),'allocatedTriangles':allocations[role],'gameTriangles':sum(row['gameTriangles'] for row in members),'budgetOverrunTriangles':sum(row['budgetOverrunTriangles'] for row in members)})
 protected=low.data.attributes.get('StrawProtectedStructure')
 values=np.empty(len(low.data.polygons),dtype=np.int32);protected.data.foreach_get('value',values)
 actual=_Triangles(low)
 return low,{'group':'Straw','sourceObjects':len(sources),'retainedSourceObjects':len(rows),'sourceTriangles':sum(_Triangles(obj) for obj in sources),'gameTriangles':actual,'requestedTriangles':int(targetCount),'budgetSatisfied':actual<=targetCount,'budgetOverrunTriangles':max(0,actual-targetCount),'protectedStructureFaces':int(np.count_nonzero(values)),'sourceColourBake':'single joined high-source DIFFUSE COLOR bake with OriginalLoopId scatter, before within-source weld and isolated-scene collapse','colourBakeStats':colorBakeStats,'stageSeconds':stageTimes,'worldTransformMirroredMeshes':mirrored,'normalStrength':.12,'crossSourceWeld':False,'discardedStructuralMembers':0,'roleIds':_RoleIds,'roles':roleReports,'omittedDecorations':omitted,'sources':rows,'overBudgetSources':[row for row in rows if row['budgetOverrunTriangles']>0]}
