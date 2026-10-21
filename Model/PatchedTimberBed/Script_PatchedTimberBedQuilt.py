"""Bake independent dense cloth partitions before topology reduction.

Sampling retains each source partition's original UVs, materials and bounds.
Only the gray overlay partition receives a world-space colour low-pass; its
geometry stays unchanged. Independently baked overlays are reduced separately,
and the resulting CORNER colours are not baked again after reduction.
"""
import re
import bpy
import bmesh
import numpy as np

_ColorName='BR_original_low_frequency_color'


def _Select(objects):
 bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT')
 for obj in objects:obj.hide_set(False);obj.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]


def _Triangles(obj):return sum(len(poly.vertices)-2 for poly in obj.data.polygons)


def _SourceShader(material):
 if material is None:return None,[]
 result=material.copy();risks=[]
 def Visit(tree,path):
  for node in tree.nodes:
   if node.type=='VERTEX_COLOR' and not node.layer_name:node.layer_name='Color'
   if node.type=='NEW_GEOMETRY':
    linked=[output.name for output in node.outputs if output.is_linked]
    if linked:risks.append({'node':path+node.name,'type':'Geometry','linkedOutputs':linked})
   elif node.type=='TEX_COORD':
    linked=[output.name for output in node.outputs if output.name in ('Generated','Object') and output.is_linked]
    if linked:risks.append({'node':path+node.name,'type':'Texture Coordinate','linkedOutputs':linked})
   elif node.type in ('AMBIENT_OCCLUSION','BEVEL','WIREFRAME','OBJECT_INFO'):
    risks.append({'node':path+node.name,'type':node.type})
   if node.type=='GROUP' and node.node_tree:
    node.node_tree=node.node_tree.copy();Visit(node.node_tree,path+node.name+'/')
 Visit(result.node_tree,material.name+'/') if result.use_nodes else None
 return result,risks


def _CleanPartition(obj):
 mesh=obj.data;bm=bmesh.new();bm.from_mesh(mesh)
 bmesh.ops.delete(bm,geom=[vertex for vertex in bm.verts if not vertex.link_faces],context='VERTS')
 bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
 bmesh.ops.triangulate(bm,faces=list(bm.faces))
 bad=[face for face in bm.faces if face.calc_area()<5e-13]
 bmesh.ops.delete(bm,geom=bad,context='FACES');bm.to_mesh(mesh);bm.free()
 if mesh.has_custom_normals:mesh.normals_split_custom_set(np.zeros((len(mesh.loops),3),dtype=np.float32))
 for poly in mesh.polygons:poly.use_smooth=True
 mesh.update();return len(bad)


def _VisibleArea(obj):
 obj.data.calc_loop_triangles();matrix=np.asarray(obj.matrix_world,dtype=np.float64)
 points=np.empty(len(obj.data.vertices)*3,dtype=np.float64);obj.data.vertices.foreach_get('co',points)
 points=points.reshape(-1,3)@matrix[:3,:3].T+matrix[:3,3]
 faces=np.asarray([tuple(face.vertices) for face in obj.data.loop_triangles],dtype=np.int32)
 if not len(faces):return 0.
 cross=np.cross(points[faces[:,1]]-points[faces[:,0]],points[faces[:,2]]-points[faces[:,0]])
 length=np.linalg.norm(cross,axis=1);normalZ=cross[:,2]/np.maximum(length,1e-20)
 # Upward area dominates, vertical drapes remain represented, hidden downward
 # shell area receives a small weight rather than consuming the visible budget.
 weights=np.where(normalZ>0,.30+.70*normalZ,np.where(normalZ>-.25,.20,.035))
 return float(np.sum(length*.5*weights))


def _PartitionNumber(name):
 match=re.search(r'partition\s+(\d+)',name,re.IGNORECASE)
 return int(match.group(1)) if match else -1


def _ColorContrast(colors):
 rgb=np.asarray(colors,dtype=np.float64)[:,:3]
 luminance=rgb@np.asarray([.2126,.7152,.0722],dtype=np.float64)
 percentiles=np.quantile(luminance,[.05,.95])
 return {'linearRgbMinMax':[float(rgb.min()),float(rgb.max())],
         'linearRgbMean':rgb.mean(axis=0).tolist(),
         'linearRgbStandardDeviation':rgb.std(axis=0).tolist(),
         'luminanceStandardDeviation':float(luminance.std()),
         'luminanceP05P95':percentiles.tolist(),
         'luminanceP95MinusP05':float(percentiles[1]-percentiles[0])}


def _ConvolveGridAxis(values,kernel,axis):
 radius=len(kernel)//2
 padding=[(0,0)]*values.ndim;padding[axis]=(radius,radius)
 padded=np.pad(values,padding,mode='constant')
 result=np.zeros_like(values,dtype=np.float64)
 for index,weight in enumerate(kernel):
  selection=[slice(None)]*values.ndim
  selection[axis]=slice(index,index+values.shape[axis])
  result+=float(weight)*padded[tuple(selection)]
 return result


def _TrilinearGridSample(values,coordinates):
 shape=np.asarray(values.shape[:3],dtype=np.int64)
 lower=np.floor(coordinates).astype(np.int64)
 lower=np.minimum(np.maximum(lower,0),shape-2)
 fraction=np.clip(coordinates-lower,0,1)
 result=np.zeros((len(coordinates),values.shape[3]),dtype=np.float64)
 for first in range(2):
  for second in range(2):
   for third in range(2):
    offset=np.asarray([first,second,third],dtype=np.int64)
    weight=np.prod(np.where(offset[None,:],fraction,1-fraction),axis=1)
    indices=lower+offset
    result+=values[indices[:,0],indices[:,1],indices[:,2]]*weight[:,None]
 return result


def _NormalizedVoxelColorLowPass(worldCorners,colors,cellM=.0125,sigmaM=.03,supportSigma=3.):
 """Filter only supplied partition samples, with no mesh or Blender access."""
 points=np.asarray(worldCorners,dtype=np.float64)
 original=np.asarray(colors,dtype=np.float64).reshape(-1,4)
 if points.shape!=(len(original),3) or not len(original):raise ValueError('Invalid patch colour sample shape')
 if not np.all(np.isfinite(points)) or not np.all(np.isfinite(original)):raise ValueError('Nonfinite patch colour input')
 if cellM<=0 or sigmaM<=0 or supportSigma<=0:raise ValueError('Invalid patch low-pass scale')
 origin=np.floor(points.min(axis=0)/cellM)*cellM
 coordinates=(points-origin)/cellM
 shape=np.maximum(2,np.ceil(coordinates.max(axis=0)).astype(np.int64)+1)
 voxelCount=int(np.prod(shape))
 nearest=np.minimum(np.maximum(np.floor(coordinates+.5).astype(np.int64),0),shape-1)
 flat=(nearest[:,0]*shape[1]+nearest[:,1])*shape[2]+nearest[:,2]
 # Accumulate colour mass and sample density together. Zero padding contains
 # no samples from adjacent quilt partitions; division removes edge darkening.
 mass=np.empty((voxelCount,4),dtype=np.float64)
 for channel in range(3):mass[:,channel]=np.bincount(flat,weights=original[:,channel],minlength=voxelCount)
 mass[:,3]=np.bincount(flat,minlength=voxelCount)
 grid=mass.reshape(tuple(int(value) for value in shape)+(4,))
 radius=max(1,int(np.floor(supportSigma*sigmaM/cellM+1e-9)))
 offsets=np.arange(-radius,radius+1,dtype=np.float64)*cellM
 kernel=np.exp(-.5*(offsets/sigmaM)**2);kernel/=kernel.sum()
 for axis in range(3):grid=_ConvolveGridAxis(grid,kernel,axis)
 # Interpolate numerator and denominator before normalizing at each original
 # corner location, including folds and the patch's vertical side.
 sampled=_TrilinearGridSample(grid,coordinates)
 if np.any(sampled[:,3]<=1e-20):raise ValueError('Patch low-pass left an unsupported colour sample')
 smoothed=sampled[:,:3]/sampled[:,3,None]
 mean=original[:,:3].mean(axis=0)
 filtered=np.ones_like(original)
 filtered[:,:3]=mean+.55*(smoothed-mean)+.015*(original[:,:3]-smoothed)
 if not np.all(np.isfinite(filtered)):raise ValueError('Nonfinite filtered patch colour')
 receipt={'method':'World-3D voxel colour mass / density; three separable Gaussian convolutions; trilinear corner resampling',
          'cellM':float(cellM),'sigmaM':float(sigmaM),'supportSigma':float(supportSigma),
          'nominalSupportRadiusM':float(supportSigma*sigmaM),'kernelRadiusCells':radius,
          'actualSupportRadiusM':float(radius*cellM),'kernelTaps':len(kernel),
          'voxelOriginWorldM':origin.tolist(),'voxelShape':shape.tolist(),
          'occupiedVoxels':int(np.count_nonzero(mass[:,3])),
          'cornerSamples':len(original),'smoothedContrastScale':.55,'originalResidualScale':.015,
          'partitionMixing':False,'alpha':1.,'allColorsFinite':True,
          'before':_ColorContrast(original),'after':_ColorContrast(filtered)}
 return filtered.astype(np.float32),receipt


def _ApplyGrayPatchLowPass(obj,attribute,colors):
 mesh=obj.data
 before=np.empty((len(mesh.vertices),3),dtype=np.float64);mesh.vertices.foreach_get('co',before.ravel())
 loopVertices=np.empty(len(mesh.loops),dtype=np.int32);mesh.loops.foreach_get('vertex_index',loopVertices)
 matrix=np.asarray(obj.matrix_world,dtype=np.float64)
 world=before@matrix[:3,:3].T+matrix[:3,3]
 filtered,receipt=_NormalizedVoxelColorLowPass(world[loopVertices],colors)
 attribute.data.foreach_set('color',filtered.ravel())
 after=np.empty_like(before);mesh.vertices.foreach_get('co',after.ravel())
 if not np.array_equal(before,after):raise ValueError('Patch colour filtering changed vertex positions')
 receipt.update({'sourcePartition':7,'stage':'dense source copy, after colour bake and before reduction',
                 'geometryUnchanged':True,'maximumVertexDisplacementM':0.,'sourceInputObjectsChanged':False})
 return receipt


def _Budgets(copies,target):
 counts=np.asarray([_Triangles(obj) for obj in copies],dtype=np.int64)
 # Guaranteed coverage for the two genuine visible overlay sheets. The thick
 # original partition 0 is intentionally cheaper; contact later trims its base.
 fractions={0:.14,6:.18,7:.18}
 minima=[]
 for obj,count in zip(copies,counts):
  fraction=fractions.get(_PartitionNumber(obj.get('QuiltSourceName',obj.name)),.014)
  minima.append(min(int(count),max(120,int(target*fraction))))
 minima=np.asarray(minima,dtype=np.int64)
 if int(minima.sum())>target:minima=np.floor(minima*target/minima.sum()).astype(np.int64)
 factors={0:.28,6:1.65,7:1.65}
 weights=np.asarray([max(1e-8,_VisibleArea(obj))*factors.get(_PartitionNumber(obj.get('QuiltSourceName',obj.name)),1) for obj in copies])
 budgets=minima.copy();remaining=max(0,target-int(budgets.sum()))
 while remaining and np.any(budgets<counts):
  available=budgets<counts;active=weights*available
  quota=np.minimum(counts-budgets,np.floor(remaining*active/max(float(active.sum()),1e-20)).astype(np.int64))
  if not np.any(quota):
   for index in np.argsort(-active):
    if remaining==0:break
    if available[index]:budgets[index]+=1;remaining-=1
  else:budgets+=quota;remaining-=int(quota.sum())
 return [int(value) for value in budgets]


def _GameMaterial():
 previous=bpy.data.materials.get('Material_BedQuilt')
 if previous:previous.name='Material_BedQuilt_PreSurfaceBake'
 material=bpy.data.materials.new('Material_BedQuilt');material.use_nodes=True
 nodes=material.node_tree.nodes;links=material.node_tree.links;bsdf=nodes.get('Principled BSDF')
 bsdf.inputs['Base Color'].default_value=(1,1,1,1);bsdf.inputs['Roughness'].default_value=.94;bsdf.inputs['Metallic'].default_value=0
 color=nodes.new('ShaderNodeVertexColor');color.layer_name=_ColorName;links.new(color.outputs['Color'],bsdf.inputs['Base Color'])
 image=bpy.data.images.get('0.jpg')
 if image is None:raise ValueError('Original Quilt 0.jpg normal image is missing')
 if not image.packed_file:image.pack()
 uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap'
 texture=nodes.new('ShaderNodeTexImage');texture.image=image
 normal=nodes.new('ShaderNodeNormalMap');normal.uv_map='UVMap';normal.inputs['Strength'].default_value=.15
 links.new(uv.outputs['UV'],texture.inputs['Vector']);links.new(texture.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
 return material


def BakeQuiltSurface(sourceObjects,targetCount=18000,partitionBudgets=None,colorProcessor=None):
 """Return (single Quilt object, JSON-safe receipt) without low-mesh rebaking.

 Sources are the ten AB partitions, excluding the separately handled BS foot.
 Originals and their shader graphs remain unchanged. Existing game meshes are
 hidden only during source baking; a prior Quilt is renamed and retained hidden.
 """
 sources=sorted([obj for obj in sourceObjects if obj.type=='MESH'],key=lambda obj:(_PartitionNumber(obj.name),obj.name))
 if not sources:raise ValueError('BakeQuiltSurface requires original AB partition source objects')
 if targetCount<1000:raise ValueError('Quilt target budget is too small for its independent overlay surfaces')
 scene=bpy.context.scene
 visibility={obj:(obj.hide_render,obj.hide_get()) for obj in scene.objects if obj.type=='MESH'}
 copies=[];rows=[];game=[]
 footCandidates=[obj for obj in visibility if obj.name.startswith('BS_FootCloth')]
 footHigh=max(footCandidates,key=_Triangles) if footCandidates else None
 for obj in visibility:
  if re.match(r'^(Quilt|Pillow|Sewing|Frame|Straw)(\.\d+)?$',obj.name) or obj.get('QuiltSourceName') or (obj in footCandidates and obj!=footHigh):game.append(obj)
 scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=1
 scene.render.threads_mode='FIXED';scene.render.threads=6
 scene.render.bake.target='VERTEX_COLORS';scene.render.bake.use_selected_to_active=False
 scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
 try:
  for source in sources:
   obj=source.copy();obj.data=source.data.copy();scene.collection.objects.link(obj)
   obj.name='QuiltSurface_Source_'+str(_PartitionNumber(source.name));obj['QuiltSourceName']=source.name
   copies.append(obj);risks=[]
   for index,material in enumerate(list(obj.data.materials)):
    copied,materialRisks=_SourceShader(material)
    if copied:obj.data.materials[index]=copied
    risks.extend(materialRisks)
   old=obj.data.color_attributes.get(_ColorName)
   if old:obj.data.color_attributes.remove(old)
   attr=obj.data.color_attributes.new(name=_ColorName,type='FLOAT_COLOR',domain='CORNER');obj.data.color_attributes.active_color=attr
   # All previous duplicate partitions and low meshes must be absent from AO
   # evaluation. Other original high meshes keep their original visibility.
   for original,(hideRender,_) in visibility.items():original.hide_render=hideRender
   for duplicate in copies:duplicate.hide_render=True
   for duplicate in game:duplicate.hide_render=True
   source.hide_render=True;obj.hide_render=False
   _Select([obj]);bpy.context.view_layer.update();bpy.ops.object.bake(type='DIFFUSE')
   colors=np.empty(len(attr.data)*4,dtype=np.float32);attr.data.foreach_get('color',colors)
   if not np.all(np.isfinite(colors)):raise ValueError('Nonfinite source-baked quilt colour: '+source.name)
   row={'sourceObject':source.name,'sourceTriangles':_Triangles(obj),'potentialGeometryDependentNodes':risks,'colourBakedBeforeReduction':True,'originalObjectBoundsMetres':[float(value) for value in source.dimensions],'bakedColorLinearRgbMinMax':[float(colors.reshape(-1,4)[:,:3].min()),float(colors.reshape(-1,4)[:,:3].max())]}
   if colorProcessor is not None:row['sourceColorProcessing']=colorProcessor(obj,attr,colors)
   elif _PartitionNumber(source.name)==7:row['sourceColorLowPass']=_ApplyGrayPatchLowPass(obj,attr,colors)
   rows.append(row)
   obj.hide_render=True
  for obj,row in zip(copies,rows):
   row['removedDegeneratesBeforeDecimation']=_CleanPartition(obj);row['trianglesAfterWithinPartitionWeld']=_Triangles(obj)
  budgets=([int(partitionBudgets[_PartitionNumber(obj.get('QuiltSourceName',obj.name))]) for obj in copies]
           if partitionBudgets is not None else _Budgets(copies,int(targetCount)))
  if sum(budgets)>targetCount:raise ValueError('Explicit Quilt partition budgets exceed target')
  for obj,row,budget in zip(copies,rows,budgets):
   _Select([obj]);count=_Triangles(obj)
   if count>budget:
    mod=obj.modifiers.new('IndependentQuiltSurfaceBudget','DECIMATE');mod.ratio=budget/count;mod.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=mod.name)
   row['removedDegeneratesAfterDecimation']=_CleanPartition(obj);row['allocatedTriangles']=budget;row['gameTriangles']=_Triangles(obj)
   # A separate semantic layer id survives Join for diagnostics without adding
   # a material or draw call. It is not used to repaint the source-baked colour.
   layer=obj.data.attributes.get('QuiltSourcePartition') or obj.data.attributes.new(name='QuiltSourcePartition',type='INT',domain='FACE')
   layer.data.foreach_set('value',np.full(len(obj.data.polygons),_PartitionNumber(row['sourceObject']),dtype=np.int32))
  material=_GameMaterial()
  for obj in copies:
   obj.data.materials.clear();obj.data.materials.append(material)
   for poly in obj.data.polygons:poly.material_index=0
   for attr in list(obj.data.color_attributes):
    if attr.name!=_ColorName:obj.data.color_attributes.remove(attr)
   obj.data.color_attributes.active_color=obj.data.color_attributes[_ColorName]
  previous=bpy.data.objects.get('Quilt')
  if previous is not None and previous not in copies:
   previous.name='Quilt_PreSurfaceBake';previous.hide_render=True;previous.hide_set(True)
  _Select(copies);bpy.ops.object.join();low=bpy.context.object;low.name='Quilt'
  bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
  low['QuiltColorBakedOnOriginalPartitions']=True
  actual=_Triangles(low)
  if actual>targetCount+20:raise ValueError(f'Independent quilt surface budget exceeded: {actual}>{targetCount}')
 finally:
  for obj,(hideRender,hideViewport) in visibility.items():
   if obj.name in bpy.data.objects:obj.hide_render=hideRender;obj.hide_set(hideViewport)
  for obj in game:
   if obj.name.startswith('Quilt_PreSurfaceBake'):obj.hide_render=True;obj.hide_set(True)
 low.hide_render=False;low.hide_set(False)
 return low,{'group':'Quilt','sourceObjects':len(sources),'sourceTriangles':sum(row['sourceTriangles'] for row in rows),'gameTriangles':_Triangles(low),'requestedTriangles':int(targetCount),'representation':'Dense source colour baked before per-partition reduction; optional cotton colour preparation; original overlay separation retained','normalStrength':.15,'sourceBakeCyclesSamples':1,'crossPartitionWeld':False,'preservedOverlayPartitions':[6,7],'sourceColorLowPassPartitions':[] if colorProcessor else [7],'partitions':rows}
