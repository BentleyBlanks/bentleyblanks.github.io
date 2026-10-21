"""Bakeable, member-aligned ageing for the BN/BS timber bed frame.

WeatherTimberFrame(frameObjects) operates only on the supplied editable source
meshes. Three explicit UV maps and a CORNER float colour layer carry metre-space
grain, cross-section rings, edge distances and member data through Join and
decimation; a POINT vector attribute anchors measured iron stains in world
space. No Generated/Object coordinates, external images or extra polygons are
used. Bake the result to the Frame Base/Normal/Roughness atlas as usual.
"""
import math
import numbers
import json
import bpy
import numpy as np


_Version = '20261021AgedBrownTimberV3'
_GeometryVersion = '20261021WeatheredTimberV1'
_GrainUv = 'WoodGrainUV'
_EndUv = 'WoodEndUV'
_EdgeUv = 'WoodEdgeUV'
_MemberData = 'WoodMemberData'
_WorldAttribute = 'WoodWeatherWorld'


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


def _IronContacts(objects):
 """Locate small, real iron components without moving or remeshing them."""
 contacts=[]
 for obj in objects:
  if obj.type!='MESH' or not any(_MetalMaterial(value) for value in obj.data.materials):continue
  mesh=obj.data
  if not len(mesh.vertices):continue
  points=np.empty(len(mesh.vertices)*3,dtype=np.float64);mesh.vertices.foreach_get('co',points);points=points.reshape(-1,3)
  matrix=np.asarray(obj.matrix_world,dtype=np.float64);points=points@matrix[:3,:3].T+matrix[:3,3]
  parents=np.arange(len(points),dtype=np.int32)
  def Find(index):
   while parents[index]!=index:parents[index]=parents[parents[index]];index=int(parents[index])
   return index
  edges=np.empty(len(mesh.edges)*2,dtype=np.int32);mesh.edges.foreach_get('vertices',edges)
  for first,second in edges.reshape(-1,2):
   first=Find(int(first));second=Find(int(second))
   if first!=second:parents[second]=first
  groups={}
  for index in range(len(points)):groups.setdefault(Find(index),[]).append(index)
  for ids in groups.values():
   if len(ids)<4:continue
   component=points[ids];minimum=component.min(axis=0);maximum=component.max(axis=0);span=maximum-minimum
   if max(span)>.09 or max(span)<.002:continue
   center=(minimum+maximum)*.5;radius=float(np.clip(max(span)*.55,.004,.016))
   if any(np.linalg.norm(center-np.asarray(value['position']))<.010 for value in contacts):continue
   contacts.append({'position':[float(value) for value in center],'radiusM':radius,'sourceObject':obj.name})
 return sorted(contacts,key=lambda value:tuple(value['position']))[:40]


def _WeatherMaterial(ironContacts):
 material=bpy.data.materials.get('Material_BedWeatheredTimber')
 signature=json.dumps(ironContacts,sort_keys=True)
 if material and material.get('TimberWeatherVersion')==_Version and material.get('TimberIronContactSignature')==signature:return material
 if material is None:material=bpy.data.materials.new('Material_BedWeatheredTimber')
 material.use_nodes=True;material.node_tree.nodes.clear()
 material['TimberWeatherVersion']=_Version
 material['TimberIronContactSignature']=signature
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
 grainAxes=Separate(grain,'Physical longitudinal and transverse grain metres')
 data=Node('ShaderNodeVertexColor',_MemberData);data.layer_name=_MemberData
 member=Separate(data.outputs['Color'],'Metre dimensions and world height');endMask=data.outputs['Alpha']
 broad=Noise(VecScale(grain,(2.4,31,1),'Long hardwood grain scale'),1,'Old longitudinal hardwood grain')
 fibres=Noise(VecScale(grain,(1.6,185,1),'Fine fibre scale'),1,'Fine longitudinal fibres',2)
 mottling=Noise(VecScale(grain,(6.4,13,1),'Uneven patina scale'),1,'Uneven brown patina',2)
 silvering=Noise(VecScale(grain,(2.0,8.5,1),'Local oxidized grey patches'),1,'Selective grey weathering',2)
 # Broad noise only gives slight wood-to-wood/patina variation. Readable grain
 # is authored below as metre-sized linear ridges, not stretched cloud blobs.
 side=Ramp(broad,[(.13,(.100,.062,.032)),(.37,(.117,.072,.037)),(.61,(.140,.089,.047)),(.86,(.158,.103,.055))],'Restrained deep brown aged hardwood')
 fibreTone=Map(fibres,.18,.82,.94,1.06,'Restrained fine fibre colour modulation')
 side=Mix(1,side,fibreTone,'Brown fibres beneath patina','MULTIPLY')
 greyMask=Map(silvering,.43,.80,0,.35,'Light localized grey oxidation amount')
 greyColor=Ramp(broad,[(.15,(.140,.135,.114)),(.84,(.205,.194,.164))],'Restrained greyed exposed fibres')
 side=Mix(greyMask,side,greyColor,'Brown patina interspersed with grey wood')

 # At 2K Base/1K Normal, a 1.5-3.2mm grain groove remains several base texels
 # wide. Its 10.5mm period and low millimetre-scale long-axis bending avoid both
 # subpixel texture noise and the rounded islands of stretched 2D noise.
 bend=Math('ADD',Math('MULTIPLY',Math('SINE',Math('MULTIPLY',grainAxes['X'],12.5)),.00065),Math('MULTIPLY',Math('SINE',Math('ADD',Math('MULTIPLY',grainAxes['X'],31),1.3)),.00022))
 drift=Map(Noise(VecScale(grain,(.9,11,1),'Slow grain phase drift'),1,'Slow irregular growth drift',1),0,1,-.00035,.00035,'Submillimetre grain drift')
 grainPath=Math('ADD',grainAxes['Y'],Math('ADD',bend,drift))
 phase=Math('FRACT',Math('MULTIPLY',grainPath,1/.0105))
 grooveDistance=Math('MULTIPLY',Math('MINIMUM',phase,Math('SUBTRACT',1,phase)),.0105)
 grainGroove=Map(grooveDistance,.00050,.00160,.57,0,'Readable 1.5 to 3.2mm longitudinal grain')
 side=Mix(grainGroove,side,(.061,.037,.019,1),'Defined linear growth grain')
 paleFibre=Math('MULTIPLY',Map(grooveDistance,.00115,.00205,0,.18,'Exposed fibre shoulder rise'),Map(grooveDistance,.0030,.0042,1,0,'Exposed fibre shoulder fall'))
 side=Mix(Math('MULTIPLY',paleFibre,.45),side,(.216,.162,.096,1),'Small clear grain shoulder')

 # Physical cross-section rings differ from the long side grain; the end mask
 # was authored from each original member's face normal, never from Join bounds.
 radial=Node('ShaderNodeVectorMath','End grain radius in metres');radial.operation='LENGTH';Link(endUv,radial.inputs[0])
 ringNoise=Noise(VecScale(endUv,(58,58,1),'End ring irregularity scale'),1,'Irregular growth rings',2)
 ringPhase=Math('ADD',Math('MULTIPLY',radial.outputs['Value'],930),Math('MULTIPLY',ringNoise,2.1))
 rings=Math('MULTIPLY',Math('ADD',Math('SINE',ringPhase),1),.5)
 endTone=Map(rings,.08,.92,.61,1.15,'Old end grain rings')
 endColor=Mix(1,(.166,.111,.063,1),endTone,'Oxidized dark cross cut timber','MULTIPLY')
 endColor=Mix(Math('MULTIPLY',greyMask,.65),endColor,(.231,.215,.173,1),'Uneven dry end grain')
 base=Mix(endMask,side,endColor,'Side and end grain')

 crackBend=Math('ADD',bend,Math('MULTIPLY',Math('SINE',Math('ADD',Math('MULTIPLY',grainAxes['X'],6.8),.7)),.0010))
 crackPath=Math('ADD',grainAxes['Y'],crackBend)
 crackPhase=Math('FRACT',Math('ADD',Math('MULTIPLY',crackPath,1/.041),.31))
 crackDistance=Math('MULTIPLY',Math('MINIMUM',crackPhase,Math('SUBTRACT',1,crackPhase)),.041)
 crackWidth=Map(crackDistance,.00040,.00175,1,0,'Defined 1 to 3.5mm long dry split')
 crackBreak=Map(Noise(VecScale(grain,(3.1,1.7,1),'Long split interruptions'),1,'Long interrupted dried splits',1),.40,.64,0,1,'Sparse long open splits')
 crackMask=Math('MULTIPLY',crackWidth,crackBreak)
 crackMask=Math('MULTIPLY',crackMask,Math('SUBTRACT',1,Math('MULTIPLY',endMask,.72)))
 pores=Noise(VecScale(grain,(83,88,1),'Millimetre pit scale'),1,'Scattered shallow pits',2)
 pitMask=Map(pores,.72,.86,0,1,'Sparse shallow divots')
 damage=Math('MAXIMUM',crackMask,Math('MULTIPLY',pitMask,.24))
 fineChecks=Math('MULTIPLY',grainGroove,Math('SUBTRACT',1,Math('MULTIPLY',endMask,.9)))
 base=Mix(Math('MULTIPLY',damage,.86),base,(.017,.012,.007,1),'Dark split and pit interiors')

 # Edge wear is evaluated in the shader, in metres, rather than interpolating a
 # vertex mask that would accidentally bleach entire unsubdivided beam faces.
 edgeU=Math('MULTIPLY',Math('MINIMUM',edge['X'],Math('SUBTRACT',1,edge['X'])),member['X'])
 edgeV=Math('MULTIPLY',Math('MINIMUM',edge['Y'],Math('SUBTRACT',1,edge['Y'])),member['Y'])
 edgeDistance=Math('MINIMUM',edgeU,edgeV)
 edgeBand=Map(edgeDistance,.00035,.0032,1,0,'Narrow worn 0.35 to 3.2mm corner band')
 edgeBreak=Map(Noise(VecScale(grain,(18,39,1),'Edge abrasion scale'),1,'Sparse exposed corner chips',2),.54,.79,0,1,'Discontinuous exposed edge abrasion')
 wear=Math('MULTIPLY',edgeBand,edgeBreak)
 base=Mix(Math('MULTIPLY',wear,.71),base,(.282,.219,.140,1),'Small desaturated bare-wood abrasions')

 # Most long-used contact zones grow darker and slightly smoother, rather than
 # becoming uniformly pale at every edge. Millimetre bare-wood nicks above are
 # sparse; this broader rubbed patina is a separate, low-frequency feature.
 touchNoise=Noise(VecScale(grain,(8.5,16,1),'Repeated handling patch scale'),1,'Uneven handled wood',2)
 touchHeight=Map(member['Z'],.20,.50,0,1,'Handled rail and post height')
 touchBand=Map(edgeDistance,.004,.022,1,.24,'Hand contact around softened corners')
 rubbed=Math('MULTIPLY',Map(touchNoise,.51,.76,0,.49,'Restrained polished old patina'),Math('MULTIPLY',touchHeight,touchBand))
 base=Mix(rubbed,base,(.059,.037,.019,1),'Localized dark hand-polished patina')

 # Analytic metre-distance bands at actual member ends read as retained grime
 # around tenons and shoulders, not a black wash over every broad beam face.
 jointBand=Map(edgeU,.002,.046,1,0,'Joinery shoulder grime distance')
 jointGrime=Math('MULTIPLY',jointBand,Map(mottling,.22,.76,.16,.59,'Uneven packed joinery dirt'))
 jointGrime=Math('MULTIPLY',jointGrime,Math('SUBTRACT',1,Math('MULTIPLY',endMask,.35)))
 base=Mix(jointGrime,base,(.022,.017,.011,1),'Mortise shoulder grime')

 # Stains are anchored to measured iron-cap components and an explicit authored
 # world-position attribute. Join cannot move these fields. No Geometry/Object
 # coordinate node or invented random nail locations are involved.
 worldNode=Node('ShaderNodeAttribute',_WorldAttribute);worldNode.attribute_name=_WorldAttribute
 ironMask=0.
 for index,contact in enumerate(ironContacts):
  position=contact['position'];radius=contact['radiusM']
  delta=Node('ShaderNodeVectorMath','Iron contact '+str(index));delta.operation='SUBTRACT';Link(worldNode.outputs['Vector'],delta.inputs[0])
  delta.inputs[1].default_value=(position[0],position[1],position[2]-.012)
  scaled=VecScale(delta.outputs['Vector'],(1/(radius*1.9),1/(radius*1.9),1/(radius*3.5)),'Iron leach extent '+str(index))
  distance=Node('ShaderNodeVectorMath','Iron leach distance '+str(index));distance.operation='LENGTH';Link(scaled,distance.inputs[0])
  stain=Map(distance.outputs['Value'],.26,1.45,.78,0,'Black iron runoff '+str(index))
  ironMask=Math('MAXIMUM',ironMask,stain)
 ironMask=Math('MULTIPLY',ironMask,Map(mottling,.15,.85,.45,1,'Broken iron leach boundary'))
 base=Mix(ironMask,base,(.019,.017,.012,1),'Black iron tannin staining')

 dampHeight=Map(member['Z'],.020,.190,1,0,'Foot dampness height in metres')
 damp=Math('MULTIPLY',dampHeight,Map(mottling,.22,.77,.34,.77,'Irregular absorbed tide marks'))
 base=Mix(damp,base,(.027,.028,.017,1),'Old lower-leg moisture and dust')

 rough=Math('ADD',.76,Math('MULTIPLY',mottling,.16))
 rough=Mix(rubbed,rough,.43,'Local dark semi-polished handling')
 rough=Mix(Math('MULTIPLY',wear,.55),rough,.69,'Dry exposed abrasion roughness')
 dirt=Math('MAXIMUM',Math('MAXIMUM',damage,damp),Math('MAXIMUM',jointGrime,ironMask))
 rough=Mix(dirt,rough,.94,'Matte packed dirt and split recesses')
 height=Math('MULTIPLY',fibres,.00011)
 height=Math('SUBTRACT',height,Math('MULTIPLY',crackMask,.00145))
 height=Math('SUBTRACT',height,Math('MULTIPLY',fineChecks,.00048))
 height=Math('SUBTRACT',height,Math('MULTIPLY',pitMask,.00060))
 height=Math('ADD',height,Math('MULTIPLY',Math('MULTIPLY',endMask,rings),.00020))
 bump=Node('ShaderNodeBump','Physical aged fibre and split relief');bump.inputs['Strength'].default_value=.77;bump.inputs['Distance'].default_value=1
 Link(height,bump.inputs['Height'])
 bsdf=Node('ShaderNodeBsdfPrincipled','Weathered timber PBR');bsdf.inputs['Metallic'].default_value=0
 Link(base,bsdf.inputs['Base Color']);Link(rough,bsdf.inputs['Roughness']);Link(bump.outputs['Normal'],bsdf.inputs['Normal'])
 output=Node('ShaderNodeOutputMaterial','Material Output');links.new(bsdf.outputs['BSDF'],output.inputs['Surface'])
 material.diffuse_color=(.115,.070,.035,1)
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


def _AuthorMember(obj,seed,material,chipGeometry=False):
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
 # The V1 authoring pass already applied its tiny corner chips. Shader version
 # updates must never reapply that position operation to an existing source.
 if obj.get('TimberWeatherVersion')==_GeometryVersion and not obj.get('TimberGeometryVersion'):obj['TimberGeometryVersion']=_GeometryVersion
 points=np.empty(len(mesh.vertices)*3,dtype=np.float64);mesh.vertices.foreach_get('co',points);points=points.reshape(-1,3)
 matrix=np.asarray(obj.matrix_world,dtype=np.float64)
 world=points@matrix[:3,:3].T+matrix[:3,3]
 center,axes,coords=_MemberCoordinates(world)
 minimum=coords.min(axis=0);maximum=coords.max(axis=0);span=np.maximum(maximum-minimum,1e-6)
 chippedVertices=0;maxChip=0.
 if chipGeometry and obj.get('TimberGeometryVersion')!=_GeometryVersion and span[0]>.12 and min(span[1:])>.012:
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
  obj['TimberGeometryVersion']=_GeometryVersion
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
 worldAttr=mesh.attributes.get(_WorldAttribute)
 if worldAttr and (worldAttr.domain!='POINT' or worldAttr.data_type!='FLOAT_VECTOR'):mesh.attributes.remove(worldAttr);worldAttr=None
 if worldAttr is None:worldAttr=mesh.attributes.new(name=_WorldAttribute,type='FLOAT_VECTOR',domain='POINT')
 worldAttr.data.foreach_set('vector',world.astype(np.float32).ravel())
 if originalMaterials:
  for index in woodySlots:mesh.materials[index]=material
 else:mesh.materials.append(material)
 obj['TimberWeatherVersion']=_Version
 mesh.update()
 return {'object':obj.name,'sourceTriangles':sum(len(poly.vertices)-2 for poly in mesh.polygons),'lengthMetres':float(span[0]),'sectionMetres':[float(span[1]),float(span[2])],'sideFaces':sideFaces,'endFaces':endFaces,'existingVerticesChipped':chippedVertices,'maximumCornerChipMm':maxChip*1000,'geometryChangedThisPass':bool(chippedVertices),'preservedAuthoredMaterialSlots':len(originalMaterials)-len(woodySlots)}


def WeatherTimberFrame(frameObjects,chipGeometry=False):
 """Age supplied source frame members in place, returning JSON-safe statistics.

 Call once in Prepare, before saving Scene_PatchedTimberBedHigh.blend. Source
 metal and recessed-check slots remain intact; combined peg/dowel detail keeps
 its original material/coordinates. Bake Frame at 2048 with 16-24 Cycles samples,
 diffuse colour only, tangent normal and roughness; a 4-6k Frame triangle target
 is sufficient for silhouette. Geometry chipping is disabled by default for
 shader-only refresh; its independent version also prevents V1 chips stacking.
 This stage adds no triangles or draw calls.
 """
 objects=list(frameObjects);ironContacts=_IronContacts(objects)
 material=_WeatherMaterial(ironContacts);rows=[]
 for index,obj in enumerate(sorted(objects,key=lambda value:value.name)):
  if obj.type!='MESH':continue
  row=_AuthorMember(obj,2719+index*7919,material,chipGeometry=chipGeometry)
  if row:rows.append(row)
 return {'version':_Version,'geometryVersion':_GeometryVersion,'geometryChippingEnabled':bool(chipGeometry),'geometryChangedThisPass':any(row.get('geometryChangedThisPass',False) for row in rows),'objects':len(rows),'weatheredObjects':sum('skipped' not in row for row in rows),'addedTriangles':0,'maximumCornerChipMm':max((row.get('maximumCornerChipMm',0) for row in rows),default=0),'representation':'deep brown and grey patina with restrained broad mottling; clearly bounded metre-authored linear grain and long dry splits, tenon-shoulder grime, measured-iron staining, local dark semi-polish, sparse pale abrasions and foot damp tide marks; baked PBR','grainProfile':{'method':'metric transverse phase ridges with low-amplitude longitudinal bending; no Voronoi oval crack cells','grainPeriodM':.0105,'grainHalfWidthTransitionM':[.00050,.00160],'drySplitPeriodM':.041,'drySplitHalfWidthTransitionM':[.00040,.00175],'grainGrooveDepthM':.00048,'drySplitDepthM':.00145,'maximumCombinedGrainBendM':.00122,'recommendedBaseNormalSizes':[2048,1024]},'uvMaps':[_GrainUv,_EndUv,_EdgeUv],'cornerData':_MemberData,'worldPositionAttribute':_WorldAttribute,'ironContactCount':len(ironContacts),'ironContacts':ironContacts,'recommendedFrameTriangles':6000,'recommendedAtlasSize':2048,'members':rows}
