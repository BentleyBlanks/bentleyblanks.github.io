"""Bakeable, member-aligned ageing for the BN/BS timber bed frame.

WeatherTimberFrame(frameObjects) operates only on the supplied editable source
meshes. Three explicit UV maps and a CORNER float colour layer carry metre-space
grain, cross-section rings, edge distances and member data through Join and
decimation. No Generated/Object coordinates, external images or extra polygons
are used. Bake the result to the Frame Base/Normal/Roughness atlas as usual.
"""
import math
import numbers
import bpy
import numpy as np


_Version = '20261021WeatheredTimberV1'
_GrainUv = 'WoodGrainUV'
_EndUv = 'WoodEndUV'
_EdgeUv = 'WoodEdgeUV'
_MemberData = 'WoodMemberData'


def _MetalMaterial(material):
 if material is None:return False
 lowerName=material.name.lower()
 if 'wood' not in lowerName and any(word in lowerName for word in ('metal','iron','nail','screw')):return True
 if material.use_nodes:
  for node in material.node_tree.nodes:
   if node.type=='BSDF_PRINCIPLED' and not node.inputs['Metallic'].is_linked and node.inputs['Metallic'].default_value>.45:return True
 return False


def _RetainedMaterial(material):
 """Keep authored hardware and the separate dark recessed-check geometry."""
 if material is None:return False
 lowerName=material.name.lower()
 return _MetalMaterial(material) or ('recessed' in lowerName and any(word in lowerName for word in ('crack','check','damage'))) or 'end-grain crack' in lowerName


def _WeatherMaterial():
 material=bpy.data.materials.get('Material_BedWeatheredTimber')
 if material and material.get('TimberWeatherVersion')==_Version:return material
 if material is None:material=bpy.data.materials.new('Material_BedWeatheredTimber')
 material.use_nodes=True;material.node_tree.nodes.clear()
 material['TimberWeatherVersion']=_Version
 nodes=material.node_tree.nodes;links=material.node_tree.links

 def Node(nodeType,name):
  node=nodes.new(nodeType);node.name=name;node.label=name;return node
 def Link(value,socket):
  if hasattr(value,'is_output'):links.new(value,socket)
  elif isinstance(value,numbers.Real) and socket.type=='RGBA':socket.default_value=(value,value,value,1)
  elif isinstance(value,numbers.Real) and socket.type=='VECTOR':socket.default_value=(value,value,value)
  else:socket.default_value=value
 def Math(operation,a,b=None,name=None):
  node=Node('ShaderNodeMath',name or operation);node.operation=operation
  Link(a,node.inputs[0])
  if b is not None:Link(b,node.inputs[1])
  return node.outputs[0]
 def VecScale(vector,scale,name):
  node=Node('ShaderNodeVectorMath',name);node.operation='MULTIPLY'
  Link(vector,node.inputs[0]);node.inputs[1].default_value=scale
  return node.outputs['Vector']
 def Noise(vector,scale,name,detail=3):
  node=Node('ShaderNodeTexNoise',name);node.noise_dimensions='3D'
  Link(vector,node.inputs['Vector']);node.inputs['Scale'].default_value=scale
  node.inputs['Detail'].default_value=detail;node.inputs['Roughness'].default_value=.68
  return node.outputs['Fac']
 def Ramp(value,stops,name):
  node=Node('ShaderNodeValToRGB',name);ramp=node.color_ramp
  ramp.interpolation='EASE'
  while len(ramp.elements)>2:ramp.elements.remove(ramp.elements[-1])
  for index,(position,color) in enumerate(stops):
   element=ramp.elements[index] if index<2 else ramp.elements.new(position)
   element.position=position;element.color=(*color,1)
  Link(value,node.inputs['Fac']);return node.outputs['Color']
 def Map(value,fromMin,fromMax,toMin,toMax,name):
  node=Node('ShaderNodeMapRange',name);node.interpolation_type='SMOOTHSTEP';node.clamp=True
  Link(value,node.inputs['Value'])
  for key,value in [('From Min',fromMin),('From Max',fromMax),('To Min',toMin),('To Max',toMax)]:node.inputs[key].default_value=value
  return node.outputs['Result']
 def Mix(factor,a,b,name,blend='MIX'):
  node=Node('ShaderNodeMixRGB',name);node.blend_type=blend
  Link(factor,node.inputs[0]);Link(a,node.inputs[1]);Link(b,node.inputs[2])
  return node.outputs[0]
 def Separate(vector,name):
  node=Node('ShaderNodeSeparateXYZ',name);Link(vector,node.inputs[0]);return node.outputs
 def Uv(name):
  node=Node('ShaderNodeUVMap',name);node.uv_map=name;return node.outputs['UV']

 grain=Uv(_GrainUv);endUv=Uv(_EndUv);edge=Separate(Uv(_EdgeUv),'Member edge coordinates')
 data=Node('ShaderNodeVertexColor',_MemberData);data.layer_name=_MemberData
 member=Separate(data.outputs['Color'],'Metre dimensions and world height');endMask=data.outputs['Alpha']
 broad=Noise(VecScale(grain,(3.3,36,1),'Long ash grain scale'),1,'Weathered grey grain')
 fibres=Noise(VecScale(grain,(1.8,190,1),'Fine fibre scale'),1,'Fine longitudinal fibres',2)
 mottling=Noise(VecScale(grain,(9,22,1),'Uneven ageing scale'),1,'Uneven silvering',2)
 side=Ramp(broad,[(.16,(.067,.063,.051)),(.39,(.145,.139,.119)),(.61,(.244,.239,.213)),(.84,(.347,.334,.291))],'Desaturated weathered timber')
 fibreTone=Map(fibres,.19,.82,.69,1.12,'Fibre colour modulation')
 side=Mix(1,side,fibreTone,'Preserved fine grain','MULTIPLY')
 side=Mix(Math('MULTIPLY',mottling,.16),side,(.35,.34,.30,1),'Patchy ash-grey ageing')

 # Physical cross-section rings differ from the long side grain; the end mask
 # was authored from each original member's face normal, never from Join bounds.
 radial=Node('ShaderNodeVectorMath','End grain radius in metres');radial.operation='LENGTH';Link(endUv,radial.inputs[0])
 ringNoise=Noise(VecScale(endUv,(58,58,1),'End ring irregularity scale'),1,'Irregular growth rings',2)
 ringPhase=Math('ADD',Math('MULTIPLY',radial.outputs['Value'],930),Math('MULTIPLY',ringNoise,2.1))
 rings=Math('MULTIPLY',Math('ADD',Math('SINE',ringPhase),1),.5)
 endTone=Map(rings,.08,.92,.58,1.12,'Old end grain rings')
 endColor=Mix(1,(.244,.225,.181,1),endTone,'Cross cut faded timber','MULTIPLY')
 base=Mix(endMask,side,endColor,'Side and end grain')

 crackVector=VecScale(grain,(1.45,29,1),'Metre crack spacing')
 cracks=Node('ShaderNodeTexVoronoi','Long open grain cracks');cracks.voronoi_dimensions='3D';cracks.feature='DISTANCE_TO_EDGE'
 Link(crackVector,cracks.inputs['Vector']);cracks.inputs['Scale'].default_value=1
 crackWidth=Map(cracks.outputs['Distance'],.009,.054,1,0,'Submillimetre to 2mm split edges')
 crackBreak=Map(Noise(VecScale(grain,(14,11,1),'Split interruptions'),1,'Interrupted splits',2),.40,.69,0,1,'Sparse open splits')
 crackMask=Math('MULTIPLY',crackWidth,crackBreak)
 crackMask=Math('MULTIPLY',crackMask,Math('SUBTRACT',1,Math('MULTIPLY',endMask,.72)))
 pores=Noise(VecScale(grain,(83,88,1),'Millimetre pit scale'),1,'Scattered shallow pits',2)
 pitMask=Map(pores,.72,.86,0,1,'Sparse shallow divots')
 damage=Math('MAXIMUM',crackMask,Math('MULTIPLY',pitMask,.62))
 base=Mix(Math('MULTIPLY',damage,.83),base,(.029,.026,.020,1),'Dark split and pit interiors')

 # Edge wear is evaluated in the shader, in metres, rather than interpolating a
 # vertex mask that would accidentally bleach entire unsubdivided beam faces.
 edgeU=Math('MULTIPLY',Math('MINIMUM',edge['X'],Math('SUBTRACT',1,edge['X'])),member['X'])
 edgeV=Math('MULTIPLY',Math('MINIMUM',edge['Y'],Math('SUBTRACT',1,edge['Y'])),member['Y'])
 edgeDistance=Math('MINIMUM',edgeU,edgeV)
 edgeBand=Map(edgeDistance,.0006,.0048,1,0,'Worn 0.6 to 4.8mm corner band')
 edgeBreak=Map(Noise(VecScale(grain,(19,44,1),'Edge abrasion scale'),1,'Uneven touched corners',2),.22,.77,.35,1,'Broken edge abrasion')
 wear=Math('MULTIPLY',edgeBand,edgeBreak)
 base=Mix(Math('MULTIPLY',wear,.67),base,(.337,.269,.183,1),'Rubbed exposed old heartwood')

 dampHeight=Map(member['Z'],.025,.205,1,0,'Foot dampness height in metres')
 damp=Math('MULTIPLY',dampHeight,Map(mottling,.23,.77,.30,.76,'Irregular tide marks'))
 base=Mix(damp,base,(.050,.058,.042,1),'Lower leg moisture and dirt')

 rough=Math('ADD',.78,Math('MULTIPLY',mottling,.15))
 rough=Mix(Math('MULTIPLY',wear,.75),rough,.61,'Moderately polished handled corners')
 rough=Mix(Math('MAXIMUM',damage,damp),rough,.96,'Matte split and damp recesses')
 height=Math('MULTIPLY',fibres,.00033)
 height=Math('SUBTRACT',height,Math('MULTIPLY',crackMask,.00155))
 height=Math('SUBTRACT',height,Math('MULTIPLY',pitMask,.00105))
 height=Math('ADD',height,Math('MULTIPLY',Math('MULTIPLY',endMask,rings),.00024))
 bump=Node('ShaderNodeBump','Physical aged fibre and split relief');bump.inputs['Strength'].default_value=.82;bump.inputs['Distance'].default_value=1
 Link(height,bump.inputs['Height'])
 bsdf=Node('ShaderNodeBsdfPrincipled','Weathered timber PBR');bsdf.inputs['Metallic'].default_value=0
 Link(base,bsdf.inputs['Base Color']);Link(rough,bsdf.inputs['Roughness']);Link(bump.outputs['Normal'],bsdf.inputs['Normal'])
 output=Node('ShaderNodeOutputMaterial','Material Output');links.new(bsdf.outputs['BSDF'],output.inputs['Surface'])
 material.diffuse_color=(.21,.20,.17,1)
 return material


def _MemberCoordinates(world):
 center=np.mean(world,axis=0);relative=world-center
 values,vectors=np.linalg.eigh(relative.T@relative/max(1,len(relative)))
 axisLong=vectors[:,int(np.argmax(values))]
 if axisLong[int(np.argmax(np.abs(axisLong)))]<0:axisLong=-axisLong
 # A stable cross basis avoids arbitrary PCA rotation on square timber sections.
 up=np.array([0.,0.,1.])
 if abs(float(axisLong@up))>.90:up=np.array([0.,1.,0.])
 axisA=np.cross(axisLong,up);axisA/=np.linalg.norm(axisA);axisB=np.cross(axisLong,axisA)
 axes=np.stack((axisLong,axisA,axisB),axis=1)
 return center,axes,relative@axes


def _AuthorMember(obj,seed,material):
 lowerName=obj.name.lower()
 if 'open timber grain checks' in lowerName:
  return {'object':obj.name,'skipped':'authored recessed grain-check geometry retains its dark damage material'}
 if ('mortise' in lowerName and 'peg' in lowerName) or ('visible' in lowerName and 'dowel' in lowerName):
  return {'object':obj.name,'skipped':'combined multi-location small joinery retains original wood material and coordinates'}
 if obj.data.users>1:obj.data=obj.data.copy()
 mesh=obj.data
 if not len(mesh.vertices) or not len(mesh.polygons):return None
 originalMaterials=list(mesh.materials)
 woodySlots=[index for index,value in enumerate(originalMaterials) if not _RetainedMaterial(value)]
 if originalMaterials and not woodySlots:return {'object':obj.name,'skipped':'authored metallic hardware or recessed damage material'}
 points=np.empty(len(mesh.vertices)*3,dtype=np.float64);mesh.vertices.foreach_get('co',points);points=points.reshape(-1,3)
 matrix=np.asarray(obj.matrix_world,dtype=np.float64)
 world=points@matrix[:3,:3].T+matrix[:3,3]
 center,axes,coords=_MemberCoordinates(world)
 minimum=coords.min(axis=0);maximum=coords.max(axis=0);span=np.maximum(maximum-minimum,1e-6)
 chippedVertices=0;maxChip=0.
 if obj.get('TimberWeatherVersion')!=_Version and span[0]>.12 and min(span[1:])>.012:
  # A few existing corner vertices acquire a shallow broken edge. No split,
  # bevel modifier or hidden topology is added to the low-poly budget.
  rng=np.random.default_rng(seed)
  edgeA=np.minimum(coords[:,1]-minimum[1],maximum[1]-coords[:,1])
  edgeB=np.minimum(coords[:,2]-minimum[2],maximum[2]-coords[:,2])
  corner=np.exp(-((edgeA/.0035)**2+(edgeB/.0035)**2))
  along=coords[:,0]-minimum[0];chipField=np.zeros(len(coords),dtype=np.float64)
  for _ in range(3):
   location=rng.uniform(.12,.88)*span[0];radius=rng.uniform(.008,.021)
   chipField+=rng.uniform(.00065,.00145)*np.exp(-((along-location)/radius)**2)
  amount=np.minimum(.0015,corner*chipField)
  for axis in (1,2):coords[:,axis]-=np.sign(coords[:,axis]-(minimum[axis]+maximum[axis])*.5)*amount*.70710678
  world=coords@axes.T+center
  local=(world-matrix[:3,3])@np.linalg.inv(matrix[:3,:3]).T
  mesh.vertices.foreach_set('co',local.astype(np.float32).ravel());mesh.update()
  chippedVertices=int(np.count_nonzero(amount>.00005));maxChip=float(amount.max(initial=0))
  minimum=coords.min(axis=0);maximum=coords.max(axis=0);span=np.maximum(maximum-minimum,1e-6)
 loopCount=len(mesh.loops);grain=np.zeros((loopCount,2),dtype=np.float32);end=np.zeros_like(grain);edge=np.zeros_like(grain);member=np.zeros((loopCount,4),dtype=np.float32)
 uvSeed=(seed%10007)/10007
 endFaces=0;sideFaces=0
 for poly in mesh.polygons:
  indices=np.asarray(poly.vertices,dtype=np.int32);face=coords[indices]
  # Use actual transformed geometry, including skewed/diagonal braces.
  worldFace=world[indices];normal=np.cross(worldFace[1]-worldFace[0],worldFace[2]-worldFace[0]);normal/=max(np.linalg.norm(normal),1e-15)
  alignment=np.abs(normal@axes);endMask=float(np.clip((alignment[0]-.55)/.35,0,1));endMask=endMask*endMask*(3-2*endMask)
  isEnd=alignment[0]>.72
  if isEnd:
   uAxis,vAxis=1,2;endFaces+=1
  else:
   uAxis,vAxis=0,(2 if alignment[1]>=alignment[2] else 1);sideFaces+=1
  loops=np.asarray(poly.loop_indices,dtype=np.int32)
  grain[loops,0]=(face[:,0]-minimum[0])+uvSeed*7.13
  grain[loops,1]=(face[:,vAxis]-minimum[vAxis])+uvSeed*3.71
  end[loops,0]=face[:,1]-(minimum[1]+maximum[1])*.5
  end[loops,1]=face[:,2]-(minimum[2]+maximum[2])*.5
  edge[loops,0]=(face[:,uAxis]-minimum[uAxis])/span[uAxis]
  edge[loops,1]=(face[:,vAxis]-minimum[vAxis])/span[vAxis]
  member[loops,0]=span[uAxis];member[loops,1]=span[vAxis];member[loops,2]=worldFace[:,2];member[loops,3]=endMask
 for name,values in [(_GrainUv,grain),(_EndUv,end),(_EdgeUv,edge)]:
  layer=mesh.uv_layers.get(name) or mesh.uv_layers.new(name=name)
  layer.data.foreach_set('uv',values.ravel())
 attr=mesh.color_attributes.get(_MemberData)
 if attr and (attr.domain!='CORNER' or attr.data_type!='FLOAT_COLOR'):mesh.color_attributes.remove(attr);attr=None
 if attr is None:attr=mesh.color_attributes.new(name=_MemberData,type='FLOAT_COLOR',domain='CORNER')
 attr.data.foreach_set('color',member.ravel())
 if originalMaterials:
  for index in woodySlots:mesh.materials[index]=material
 else:mesh.materials.append(material)
 obj['TimberWeatherVersion']=_Version
 mesh.update()
 return {'object':obj.name,'sourceTriangles':sum(len(poly.vertices)-2 for poly in mesh.polygons),'lengthMetres':float(span[0]),'sectionMetres':[float(span[1]),float(span[2])],'sideFaces':sideFaces,'endFaces':endFaces,'existingVerticesChipped':chippedVertices,'maximumCornerChipMm':maxChip*1000,'preservedAuthoredMaterialSlots':len(originalMaterials)-len(woodySlots)}


def WeatherTimberFrame(frameObjects):
 """Age supplied source frame members in place, returning JSON-safe statistics.

 Call once in Prepare, before saving Scene_PatchedTimberBedHigh.blend. Source
 metal and recessed-check slots remain intact; combined peg/dowel detail keeps
 its original material/coordinates. Bake Frame at 2048 with 16-24 Cycles samples,
 diffuse colour only, tangent normal and roughness; a 4-6k Frame triangle target
 is sufficient for silhouette. This stage adds no triangles or draw calls.
 """
 material=_WeatherMaterial();rows=[]
 for index,obj in enumerate(sorted(frameObjects,key=lambda value:value.name)):
  if obj.type!='MESH':continue
  row=_AuthorMember(obj,2719+index*7919,material)
  if row:rows.append(row)
 return {'version':_Version,'objects':len(rows),'weatheredObjects':sum('skipped' not in row for row in rows),'addedTriangles':0,'maximumCornerChipMm':max((row.get('maximumCornerChipMm',0) for row in rows),default=0),'representation':'member-aligned explicit metre UV and CORNER data; silvered fibres, interrupted grain splits, small pits, rubbed exposed corners and lower-leg moisture; Cycles PBR atlas','uvMaps':[_GrainUv,_EndUv,_EdgeUv],'cornerData':_MemberData,'recommendedFrameTriangles':6000,'recommendedAtlasSize':2048,'members':rows}
