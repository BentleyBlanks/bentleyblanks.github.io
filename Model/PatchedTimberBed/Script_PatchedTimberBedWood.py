"""Reference-led, member-aligned ageing for the BN/BS timber bed frame.

WeatherTimberFrame(..., textureRoot=...) writes finite physical UV windows into
shared Base/Normal/ORM PNG surfaces and packs those images into the source.
ApplyReferenceWoodSurface maps the tagged game Frame to the same native PBR
surface plus macro CORNER colour; real cut faces retain WoodDamageData.
Three legacy metric UV maps/member data remain on editable sources. The None
textureRoot path retains the earlier source recipe and optional versioned tiny
corner chips. Material mapping adds no polygons or Blender process of its own.
"""
import math
import numbers
import json
import struct
import zlib
import hashlib
from pathlib import Path
import bpy
import numpy as np


_Version = '20261021AgedBrownTimberV3'
_GeometryVersion = '20261021WeatheredTimberV1'
_GrainUv = 'WoodGrainUV'
_EndUv = 'WoodEndUV'
_EdgeUv = 'WoodEdgeUV'
_MemberData = 'WoodMemberData'
_WorldAttribute = 'WoodWeatherWorld'
_SurfaceVersion = '20261021ReferenceElmSurfaceV6'
_SurfaceLayout = {'side': [[32/2048,32/2048],[1504/2048,2016/2048]],
 'ends': [[[1568/2048,v],[2016/2048,v+448/2048]] for v in (64/2048,544/2048,1024/2048,1504/2048)],
 'metal': [.9296875,.982421875], 'neutral': [.8203125,.982421875], 'sideMetres': [2.6,.28], 'endMetres': [.18,.18]}


def _EncodeSurfacePng(rgb):
 def Chunk(kind,payload):return struct.pack('>I',len(payload))+kind+payload+struct.pack('>I',zlib.crc32(kind+payload)&0xffffffff)
 height,width=rgb.shape[:2];scan=b''.join(b'\0'+row.tobytes() for row in rgb)
 return b'\x89PNG\r\n\x1a\n'+Chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+Chunk(b'IDAT',zlib.compress(scan,6))+Chunk(b'IEND',b'')


def _SurfaceSrgb(value):
 value=np.clip(value,0,1)
 return np.where(value<=.0031308,value*12.92,1.055*value**(1/2.4)-.055)


def _SlowCurve(x,rng,count=9):
 controls=rng.uniform(-1,1,count).astype(np.float32);coordinate=np.clip(x,0,1)*(count-1)
 index=np.minimum(coordinate.astype(np.int32),count-2);fraction=coordinate-index;fraction=fraction*fraction*(3-2*fraction)
 return controls[index]*(1-fraction)+controls[index+1]*fraction


def BuildReferenceWoodSurface():
 """Return aligned PNG-ready maps; finite atlas windows, no subrect repeats."""
 size=2048;base=np.full((size,size,3),.82,dtype=np.float32)
 normals=np.zeros((size,size,3),dtype=np.float32);normals[:,:,2]=1
 roughness=np.full((size,size),.82,dtype=np.float32);metallic=np.zeros((size,size),dtype=np.float32)
 rng=np.random.default_rng(640821)
 def Put(rect,height,tone,physicalSize,end=False,wear=None,patina=None):
  u0,v0=rect[0];u1,v1=rect[1];x0,x1=round(u0*size),round(u1*size);y0,y1=round((1-v1)*size),round((1-v0)*size)
  du=physicalSize[0]/max(1,x1-x0-1);dv=physicalSize[1]/max(1,y1-y0-1)
  dhv,dhu=np.gradient(height,-dv,du);vector=np.stack((-dhu,-dhv,np.ones_like(height)),axis=2);vector/=np.maximum(np.linalg.norm(vector,axis=2,keepdims=True),1e-8)
  normals[y0:y1,x0:x1]=vector
  if end:
   color=tone[:,:,None]*np.asarray([.80,.78,.735],dtype=np.float32)
   surfaceRough=.83+.05*np.maximum(0,1-tone)
  else:
   # The real old-elm reference reads as broken brown finish over irregular
   # yellow-brown exposed fibres, not a flat brown vertex tint on a white tile.
   dark=np.asarray([.29,.245,.185],dtype=np.float32);oldBrown=np.asarray([.75,.665,.515],dtype=np.float32)
   finish=dark+(oldBrown-dark)*patina[:,:,None]
   bare=np.asarray([.995,.935,.775],dtype=np.float32)
   color=(finish*(1-wear[:,:,None])+bare*wear[:,:,None])*tone[:,:,None]
   surfaceRough=.71+.05*np.maximum(0,1-tone)+.14*wear-.055*patina
  base[y0:y1,x0:x1]=np.clip(color,.22,.995)
  roughness[y0:y1,x0:x1]=np.clip(surfaceRough,.59,.94)
 rect=_SurfaceLayout['side'];width=round((rect[1][0]-rect[0][0])*size);height=round((rect[1][1]-rect[0][1])*size)
 x=np.linspace(0,2.6,width,dtype=np.float32)[None,:];y=np.linspace(.28,0,height,dtype=np.float32)[:,None]
 bend=.0013*_SlowCurve(x/2.6,rng,8)+.00045*_SlowCurve(x/2.6,rng,19)
 spread=1+.035*_SlowCurve(x/2.6,rng,6)
 warped=y*spread+bend
 # A single broad divergence is a growth-layer fork, not a dark oval repeated
 # on every member. Each source takes a different physical finite window.
 warped=warped+.0014*np.exp(-((x-1.47)/.33)**2)*np.tanh((y-.204)/.006)
 boundaries=[-.025]
 while boundaries[-1]<.315:boundaries.append(boundaries[-1]+float(rng.gamma(1.5,.0023)+.00070))
 boundaries=np.asarray(boundaries,dtype=np.float32);index=np.clip(np.searchsorted(boundaries,warped)-1,0,len(boundaries)-2)
 left=boundaries[index];right=boundaries[index+1];interval=right-left
 distance=np.minimum(warped-left,right-warped)
 groove=np.exp(-(distance/np.clip(interval*.12,.00016,.00062))**2)
 bandValues=rng.uniform(-1,1,len(boundaries)).astype(np.float32)
 tone=1+.044*bandValues[index]-.070*groove
 field=.000025*bandValues[index]-.000070*groove
 # Unequal, frayed longitudinal finish losses. Rectangular/tapered strokes have
 # irregular fibre ends; Gaussian ellipses and uniformly bright edges are not
 # used. Larger worn slivers survive an actual 640px close-up while the fine
 # growth texture remains restrained beneath them.
 wear=np.zeros_like(warped,dtype=np.float32)
 for patch in range(28):
  center=float(rng.uniform(.012,.268));start=float(rng.uniform(0,2.35));length=float(rng.uniform(.12,.43));halfWidth=float(rng.uniform(.003,.013))
  if patch<3:length=.46;halfWidth=.022
  curve=center+.0017*_SlowCurve(x/2.6,rng,9)
  width=halfWidth*(.78+.28*_SlowCurve(x/2.6,rng,13))
  across=np.abs(warped-curve)/np.maximum(width,.001)
  crossMask=np.clip((1.12-across)/.32,0,1);crossMask=crossMask*crossMask*(3-2*crossMask)
  # Layer-to-layer end offsets break the edge into splinter-like strokes.
  phase=(x-start-.014*bandValues[index])/length
  along=np.clip(phase/.12,0,1)*np.clip((1-phase)/.16,0,1)
  broken=np.clip(.81+.24*bandValues[index]-.17*groove,.35,1)
  wear=np.maximum(wear,(crossMask*along*broken*rng.uniform(.52,.90)).astype(np.float32))
 # Art-directed worn fragments are placed inside the actual finite windows of
 # Foot post.001 (seed 26476) and both long rails, not merely counted over the
 # unused full atlas. Their 25-45mm broken widths remain visible at game scale.
 # These are ordinary physical surface locations, not geometry/test patches.
 wearAnchors=[(.69,.24,.104,.022,.94),(.94,.18,.157,.019,.91),(1.11,.11,.043,.017,.85),
              (1.45,.32,.165,.021,.94),(.36,.26,.141,.017,.88),(1.97,.24,.187,.022,.88)]
 for start,length,center,halfWidth,strength in wearAnchors:
  curve=center+.0027*_SlowCurve(x/2.6,rng,11)
  width=halfWidth*(.84+.24*_SlowCurve(x/2.6,rng,17))
  across=np.abs(warped-curve)/np.maximum(width,.001)
  crossMask=np.clip((1.14-across)/.34,0,1);crossMask=crossMask*crossMask*(3-2*crossMask)
  phase=(x-start-.022*bandValues[index])/length
  along=np.clip(phase/.14,0,1)*np.clip((1-phase)/.18,0,1)
  broken=np.clip(.91+.18*bandValues[index]-.13*groove,.48,1)
  wear=np.maximum(wear,(crossMask*along*broken*strength).astype(np.float32))
 patina=np.clip(.57+.20*_SlowCurve(x/2.6,rng,11)+.09*bandValues[index]+.045*(warped/.28-.5),.12,.96)
 field-=.000045*wear
 # Sparse, unequal, tapering long dry checks. Most growth boundaries never
 # become black cracks; widths and start/end locations vary independently.
 for _ in range(7):
  center=float(rng.uniform(.014,.266));start=float(rng.uniform(0,2.1));length=float(rng.uniform(.22,.68));halfWidth=float(rng.uniform(.00030,.00085))
  path=center+.0007*_SlowCurve(x/2.6,rng,7)
  along=np.clip((x-start)/max(length,.01),0,1);envelope=np.where((x>start)&(x<start+length),16*along*along*(1-along)*(1-along),0)
  split=np.exp(-((y-path)/halfWidth)**2)*envelope
  tone-=.26*split;field-=.00055*split
 Put(rect,field.astype(np.float32),tone.astype(np.float32),(2.6,.28),wear=wear,patina=patina)
 # Four eccentric sections: the pith lies outside the sampled face, so only
 # partial irregular arcs appear. Nonuniform growth spacings avoid target rings.
 for variant,rect in enumerate(_SurfaceLayout['ends']):
  random=np.random.default_rng(913+variant*1201);width=round((rect[1][0]-rect[0][0])*size);height=round((rect[1][1]-rect[0][1])*size)
  ex,ey=np.meshgrid(np.linspace(-.09,.09,width,dtype=np.float32),np.linspace(.09,-.09,height,dtype=np.float32))
  pith=np.asarray([random.uniform(-.19,-.13),random.uniform(-.13,.13)],dtype=np.float32)
  dx=ex-pith[0];dy=(ey-pith[1])*random.uniform(.77,1.24)
  radius=np.sqrt(dx*dx+dy*dy)+.0017*(ex/.09)*(ey/.09)+.0008*(ey/.09)**3
  rings=[0.]
  while rings[-1]<.45:rings.append(rings[-1]+float(random.gamma(1.8,.0015)+.0007))
  rings=np.asarray(rings,dtype=np.float32);ringId=np.clip(np.searchsorted(rings,radius)-1,0,len(rings)-2)
  ringDistance=np.minimum(radius-rings[ringId],rings[ringId+1]-radius)
  ringGroove=np.exp(-(ringDistance/.00032)**2)
  ringTone=random.uniform(-1,1,len(rings)).astype(np.float32)[ringId]
  etone=1+.023*ringTone-.036*ringGroove;eh=.000018*ringTone-.000045*ringGroove
  # Only a couple of incomplete rays/checks. These are colour/relief cues;
  # actual missing wedges and open end splits come from WoodDamage geometry.
  for _ in range(2):
   angle=float(random.uniform(-.75,.75));line=dy*np.cos(angle)-dx*np.sin(angle)
   taper=np.clip((radius-.09)/.14,0,1)
   check=np.exp(-(line/random.uniform(.00040,.00085))**2)*taper
   etone-=.16*check;eh-=.00035*check
  Put(rect,eh.astype(np.float32),etone.astype(np.float32),(.18,.18),True)
 # Flat neutral patch reserved for iron and the already-authored dark checks.
 base[8:64,1568:2016]=1;normals[8:64,1568:2016]=[0,0,1];roughness[8:64,1568:2016]=.82;metallic[8:64,1792:2016]=.70
 rgb=np.floor(_SurfaceSrgb(base)*255+.5).astype(np.uint8)
 normal=normals.reshape(1024,2,1024,2,3).mean(axis=(1,3));normal/=np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-8)
 normal=np.floor(np.clip(normal*.5+.5,0,1)*255+.5).astype(np.uint8)
 orm=np.zeros((512,512,3),dtype=np.uint8);orm[:,:,0]=255
 orm[:,:,1]=np.floor(roughness.reshape(512,4,512,4).mean(axis=(1,3))*255+.5).astype(np.uint8)
 orm[:,:,2]=np.floor(metallic.reshape(512,4,512,4).mean(axis=(1,3))*255+.5).astype(np.uint8)
 return {'Base':rgb,'Normal':normal,'Orm':orm},{'version':_SurfaceVersion,'layout':_SurfaceLayout,'baseSize':2048,'normalSize':1024,'ormSize':512,'sideGrowthBoundaries':len(boundaries),'sideDryChecks':7,'irregularLongitudinalFinishLossPatches':34,'memberWindowWearAnchors':wearAnchors,'wearAreaAboveHalf':float(np.mean(wear>.5)),'sideColorLinearMinMax':[float(base[32:2016,32:1504].min()),float(base[32:2016,32:1504].max())],'endVariants':4,'sharedPhysicalHeightForPbr':True,'normalMethod':'physical finite-height derivatives, PNG-row V sign corrected, OpenGL +Y; area-averaged and renormalized to 1K','periodicEqualSpacing':False,'photographicPixelsCopied':False}


def _ReferenceSurfaceMaterial(textureRoot):
 textureRoot=Path(textureRoot);textureRoot.mkdir(parents=True,exist_ok=True)
 recipeHash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();rootSignature=str(textureRoot.resolve())
 material=bpy.data.materials.get('Material_BedFrameReference')
 if material and material.get('ReferenceWoodSurfaceVersion')==_SurfaceVersion and material.get('ReferenceWoodRecipeHash')==recipeHash and material.get('ReferenceWoodTextureRoot')==rootSignature:
  return material,json.loads(material['ReferenceWoodSurfaceReceipt'])
 maps,stats=BuildReferenceWoodSurface();images={};textureRows=[]
 for role,pixels in maps.items():
  path=textureRoot/('Texture_BedFrameReference'+role+'.png');raw=_EncodeSurfacePng(pixels);path.write_bytes(raw)
  image=bpy.data.images.load(str(path),check_existing=False);image.name=path.stem;image.colorspace_settings.name='sRGB' if role=='Base' else 'Non-Color';image.pack();images[role]=image
  textureRows.append({'role':role,'file':str(path),'dimensions':[int(pixels.shape[1]),int(pixels.shape[0])],'sha256':hashlib.sha256(raw).hexdigest()})
 if material is None:material=bpy.data.materials.new('Material_BedFrameReference')
 oldImages=[node.image for node in material.node_tree.nodes if node.type=='TEX_IMAGE' and node.image] if material.use_nodes else []
 material.use_nodes=True;nodes=material.node_tree.nodes;links=material.node_tree.links;nodes.clear()
 for oldImage in oldImages:
  if oldImage.users==0:bpy.data.images.remove(oldImage)
 for role,image in images.items():image.name='Texture_BedFrameReference'+role
 bsdf=nodes.new('ShaderNodeBsdfPrincipled');output=nodes.new('ShaderNodeOutputMaterial');links.new(bsdf.outputs['BSDF'],output.inputs['Surface'])
 uv=nodes.new('ShaderNodeUVMap');uv.uv_map='UVMap';color=nodes.new('ShaderNodeVertexColor');color.layer_name='BR_original_low_frequency_color'
 textureNodes={}
 for role,image in images.items():
  texture=nodes.new('ShaderNodeTexImage');texture.image=image;texture.interpolation='Linear';texture.extension='REPEAT';links.new(uv.outputs['UV'],texture.inputs['Vector']);textureNodes[role]=texture
 multiply=nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
 links.new(textureNodes['Base'].outputs['Color'],multiply.inputs[1]);links.new(color.outputs['Color'],multiply.inputs[2]);links.new(multiply.outputs[0],bsdf.inputs['Base Color'])
 normal=nodes.new('ShaderNodeNormalMap');normal.uv_map='UVMap';normal.inputs['Strength'].default_value=.48;links.new(textureNodes['Normal'].outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
 separate=nodes.new('ShaderNodeSeparateColor');links.new(textureNodes['Orm'].outputs['Color'],separate.inputs['Color']);links.new(separate.outputs['Green'],bsdf.inputs['Roughness']);links.new(separate.outputs['Blue'],bsdf.inputs['Metallic'])
 stats['textures']=textureRows;stats['normalStrength']=.48;stats['nativePbrMaterial']=material.name;stats['recipeSha256']=recipeHash
 material['ReferenceWoodSurfaceVersion']=_SurfaceVersion;material['ReferenceWoodSurfaceReceipt']=json.dumps(stats)
 material['ReferenceWoodRecipeHash']=recipeHash;material['ReferenceWoodTextureRoot']=rootSignature
 return material,stats


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


def WeatherTimberFrame(frameObjects,chipGeometry=False,textureRoot=None):
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
 if textureRoot is not None:
  records=[]
  for index,obj in enumerate(sorted(objects,key=lambda value:value.name)):
   if obj.type!='MESH':continue
   record=_ReferenceMemberRecord(obj,2719+index*7919,index+1);records.append(record)
   if record['surfaceRole']=='metal':record['ironContacts']=[contact for contact in ironContacts if contact['sourceObject']==obj.name]
   _ApplyReferenceMapping(obj,textureRoot,[record],ironContacts,sourceMode=True)
   obj['TimberWeatherVersion']=_SurfaceVersion
  return {'version':_SurfaceVersion,'geometryVersion':_GeometryVersion,'geometryChippingEnabled':bool(chipGeometry),'geometryChangedThisPass':any(row.get('geometryChangedThisPass',False) for row in rows),'addedTriangles':0,'memberRecords':records,'members':rows,'ironContacts':ironContacts,'ironContactCount':len(ironContacts),'surface':_ReferenceSurfaceMaterial(textureRoot)[1],'sourceMetalMaterialsPreserved':True}
 return {'version':_Version,'geometryVersion':_GeometryVersion,'geometryChippingEnabled':bool(chipGeometry),'geometryChangedThisPass':any(row.get('geometryChangedThisPass',False) for row in rows),'objects':len(rows),'weatheredObjects':sum('skipped' not in row for row in rows),'addedTriangles':0,'maximumCornerChipMm':max((row.get('maximumCornerChipMm',0) for row in rows),default=0),'representation':'deep brown and grey patina with restrained broad mottling; clearly bounded metre-authored linear grain and long dry splits, tenon-shoulder grime, measured-iron staining, local dark semi-polish, sparse pale abrasions and foot damp tide marks; baked PBR','grainProfile':{'method':'metric transverse phase ridges with low-amplitude longitudinal bending; no Voronoi oval crack cells','grainPeriodM':.0105,'grainHalfWidthTransitionM':[.00050,.00160],'drySplitPeriodM':.041,'drySplitHalfWidthTransitionM':[.00040,.00175],'grainGrooveDepthM':.00048,'drySplitDepthM':.00145,'maximumCombinedGrainBendM':.00122,'recommendedBaseNormalSizes':[2048,1024]},'uvMaps':[_GrainUv,_EndUv,_EdgeUv],'cornerData':_MemberData,'worldPositionAttribute':_WorldAttribute,'ironContactCount':len(ironContacts),'ironContacts':ironContacts,'recommendedFrameTriangles':6000,'recommendedAtlasSize':2048,'members':rows}


def _ReferenceMemberRecord(obj,seed,fallbackId):
 points=np.empty(len(obj.data.vertices)*3,dtype=np.float64);obj.data.vertices.foreach_get('co',points);points=points.reshape(-1,3)
 matrix=np.asarray(obj.matrix_world,dtype=np.float64);world=points@matrix[:3,:3].T+matrix[:3,3]
 center,axes,coords=_MemberCoordinates(world);name=obj.name.lower()
 basisPolicy='principal member axis'
 if 'post' in name:
  # Local subtractive cuts add many vertices to one post corner and can tilt
  # vertex-weighted PCA. These named bed posts are upright members: retaining
  # world Z for their fibre direction prevents that sampling bias becoming
  # high-frequency cross-grain drift on a narrow visible side.
  axes=np.column_stack(([0.,0.,1.],[-1.,0.,0.],[0.,-1.,0.]));coords=(world-center)@axes
  basisPolicy='semantic upright post world-Z; independent of cut-vertex density'
 role='recess' if 'open timber grain checks' in name else 'peg' if ('mortise' in name and 'peg' in name) else 'metal' if any(value for value in obj.data.materials) and all(_MetalMaterial(value) for value in obj.data.materials if value) else 'wood'
 memberId=int(obj.get('FrameMemberId',fallbackId));obj['FrameMemberId']=memberId
 return {'id':memberId,'name':obj.name,'center':center.tolist(),'axes':axes.T.tolist(),'minimum':coords.min(axis=0).tolist(),'maximum':coords.max(axis=0).tolist(),'seed':int(seed),'surfaceRole':role,'basisPolicy':basisPolicy}


def _EnsureFrameTags(obj,record,sourceMode):
 mesh=obj.data;member=mesh.attributes.get('FrameMemberId');metal=mesh.attributes.get('FrameMetalSlot')
 if member is None:
  if not sourceMode:raise ValueError('Joined Frame requires FACE FrameMemberId from source members')
  member=mesh.attributes.new(name='FrameMemberId',type='INT',domain='FACE');member.data.foreach_set('value',np.full(len(mesh.polygons),record['id'],dtype=np.int32))
 if member.domain!='FACE' or member.data_type!='INT':raise ValueError('FrameMemberId must be FACE INT')
 if metal is None:
  if not sourceMode:raise ValueError('Joined Frame requires FACE FrameMetalSlot from source material slots')
  metal=mesh.attributes.new(name='FrameMetalSlot',type='INT',domain='FACE')
  values=[]
  for poly in mesh.polygons:
   material=mesh.materials[poly.material_index] if poly.material_index<len(mesh.materials) else None
   values.append(1 if _MetalMaterial(material) else 2 if _RetainedMaterial(material) else 0)
  metal.data.foreach_set('value',np.asarray(values,dtype=np.int32))
 if metal.domain!='FACE' or metal.data_type!='INT':raise ValueError('FrameMetalSlot must be FACE INT')
 return member,metal


def _ApplyReferenceMapping(frame,textureRoot,memberRecords,ironContacts=(),sourceMode=False):
 mesh=frame.data
 if not len(mesh.vertices):raise ValueError('Reference Frame surface needs nonempty geometry')
 originalMaterials=list(mesh.materials);oldActive=mesh.color_attributes.active_color
 oldActiveName=oldActive.name if oldActive else None
 material,surfaceStats=_ReferenceSurfaceMaterial(textureRoot);records={int(record['id']):record for record in memberRecords}
 default=memberRecords[0] if len(memberRecords)==1 else None
 memberTag,metalTag=_EnsureFrameTags(frame,default,sourceMode)
 memberIds=np.empty(len(mesh.polygons),dtype=np.int32);memberTag.data.foreach_get('value',memberIds)
 metalIds=np.empty(len(mesh.polygons),dtype=np.int32);metalTag.data.foreach_get('value',metalIds)
 missing=sorted(set(int(value) for value in memberIds)-set(records))
 if missing:raise ValueError('Frame member records missing ids '+str(missing))
 points=np.empty(len(mesh.vertices)*3,dtype=np.float64);mesh.vertices.foreach_get('co',points);points=points.reshape(-1,3)
 beforeHash=hashlib.sha256(points.tobytes()).hexdigest();matrix=np.asarray(frame.matrix_world,dtype=np.float64);world=points@matrix[:3,:3].T+matrix[:3,3]
 uvValues=np.zeros((len(mesh.loops),2),dtype=np.float32);colors=np.ones((len(mesh.loops),4),dtype=np.float32)
 damage=mesh.color_attributes.get('WoodDamageData');damageValues=np.zeros((len(mesh.loops),4),dtype=np.float32)
 if damage is not None:
  if damage.domain!='CORNER':raise ValueError('WoodDamageData must use CORNER domain')
  damage.data.foreach_get('color',damageValues.ravel())
 sideCount=endCount=metalCount=recessCount=exposedCorners=0;windows={}
 for memberId,record in records.items():
  random=np.random.default_rng(record['seed']);minimum=np.asarray(record['minimum']);maximum=np.asarray(record['maximum']);span=np.maximum(maximum-minimum,1e-6)
  windows[memberId]={'along':float(random.uniform(.014,max(.014,2.6-min(span[0],2.56)-.014))),'cross':[float(random.uniform(.006,max(.006,.28-min(span[axis],.265)-.006))) for axis in (1,2)],'end':int(record['seed']%4),'seedTone':float(random.uniform(.92,1.06))}
 for poly in mesh.polygons:
  record=records[int(memberIds[poly.index])];window=windows[int(memberIds[poly.index])];loops=np.asarray(poly.loop_indices,dtype=np.int32);ids=np.asarray(poly.vertices,dtype=np.int32)
  face=world[ids];axes=np.asarray(record['axes'],dtype=np.float64);coords=(face-np.asarray(record['center']))@axes.T
  minimum=np.asarray(record['minimum']);maximum=np.asarray(record['maximum']);span=np.maximum(maximum-minimum,1e-6)
  normal=np.cross(face[1]-face[0],face[2]-face[0]);normal/=max(np.linalg.norm(normal),1e-15);alignment=np.abs(normal@axes.T)
  role=record['surfaceRole'];isMetal=metalIds[poly.index]==1 or role=='metal';isRecess=metalIds[poly.index]==2 or role=='recess'
  if isMetal or isRecess or role=='peg':
   drop=int(np.argmax(np.abs(normal)));plane=face[:,[axis for axis in range(3) if axis!=drop]]
   normalized=(plane-plane.min(axis=0))/np.maximum(np.ptp(plane,axis=0),1e-8)
   uvValues[loops]=np.asarray(_SurfaceLayout['metal' if isMetal else 'neutral'])+(normalized-.5)*.006
   colors[loops,:3]=(.032,.029,.023) if isMetal else (.018,.014,.009) if isRecess else (.125,.082,.043)
   metalCount+=int(isMetal);recessCount+=int(isRecess)
   continue
  isEnd=alignment[0]>.72
  if isEnd:
   rect=np.asarray(_SurfaceLayout['ends'][window['end']]);relative=coords[:,1:]-minimum[1:]
   virtual=.18;offset=np.maximum(0,virtual-span[1:])*.43
   normalized=np.clip((relative+offset)/virtual,.015,.985);uvValues[loops]=rect[0]+normalized*(rect[1]-rect[0]);endCount+=1
  else:
   vAxis=2 if alignment[1]>=alignment[2] else 1
   physical=np.stack((coords[:,0]-minimum[0]+window['along'],coords[:,vAxis]-minimum[vAxis]+window['cross'][vAxis-1]),axis=1)
   normalized=np.clip(physical/np.asarray([2.6,.28]),.004,.996);rect=np.asarray(_SurfaceLayout['side']);uvValues[loops]=rect[0]+normalized*(rect[1]-rect[0]);sideCount+=1
  # Broad physical use zones are intentionally restrained. No uniform bright
  # edge mask: only the actual new WoodDamage cut faces expose paler wood.
  color=np.tile(np.asarray([.245,.165,.090])*window['seedTone'],(len(loops),1))
  greyWeight=.08+.06*((record['seed']%19)/18);color=color*(1-greyWeight)+np.asarray([.205,.180,.138])*greyWeight
  damp=np.clip((.18-face[:,2])/.18,0,1)*.28;color=color*(1-damp[:,None])+np.asarray([.054,.046,.027])*damp[:,None]
  shoulder=np.clip((.026-np.minimum(coords[:,0]-minimum[0],maximum[0]-coords[:,0]))/.026,0,1)*.09
  color=color*(1-shoulder[:,None])+np.asarray([.055,.038,.021])*shoulder[:,None]
  if isEnd:color=color*.93+np.asarray([.205,.175,.128])*.07
  iron=np.zeros(len(loops),dtype=np.float64)
  for contact in ironContacts:
   delta=face-np.asarray(contact['position']);radius=contact['radiusM'];delta[:,2]+=.009
   distance=np.linalg.norm(delta/np.asarray([radius*2,radius*2,radius*3]),axis=1)
   iron=np.maximum(iron,np.clip((1.5-distance)/1.2,0,1)*.23)
  color=color*(1-iron[:,None])+np.asarray([.040,.030,.018])*iron[:,None]
  exposed=np.clip(damageValues[loops,0],0,1)*.42
  color=color*(1-exposed[:,None])+np.asarray([.244,.211,.155])*exposed[:,None];exposedCorners+=int(np.count_nonzero(exposed))
  colors[loops,:3]=color
 uv=mesh.uv_layers.get('UVMap') or mesh.uv_layers.new(name='UVMap');uv.data.foreach_set('uv',uvValues.ravel());mesh.uv_layers.active=uv;uv.active_render=True
 if not sourceMode:
  for layer in list(mesh.uv_layers):
   if layer.name!='UVMap':mesh.uv_layers.remove(layer)
 color=mesh.color_attributes.get('BR_original_low_frequency_color')
 if color and (color.domain!='CORNER' or color.data_type!='FLOAT_COLOR'):mesh.color_attributes.remove(color);color=None
 if color is None:color=mesh.color_attributes.new(name='BR_original_low_frequency_color',type='FLOAT_COLOR',domain='CORNER')
 color.data.foreach_set('color',colors.ravel());mesh.color_attributes.active_color=color
 if sourceMode:
  for index,value in enumerate(originalMaterials):
   if value is not None and not _RetainedMaterial(value):mesh.materials[index]=material
  if not originalMaterials:mesh.materials.append(material)
  if oldActiveName and mesh.color_attributes.get(oldActiveName):mesh.color_attributes.active_color=mesh.color_attributes[oldActiveName]
 else:
  mesh.materials.clear();mesh.materials.append(material)
  for poly in mesh.polygons:poly.material_index=0
 mesh.update();after=np.empty(points.size,dtype=np.float64);mesh.vertices.foreach_get('co',after)
 if not np.array_equal(points.ravel(),after):raise ValueError('Reference material mapping changed Frame positions')
 frame['GameExportColorLayer']='BR_original_low_frequency_color'
 return {'version':_SurfaceVersion,'group':'Frame','triangles':sum(len(poly.vertices)-2 for poly in mesh.polygons),'geometryUnchanged':True,'positionHash':beforeHash,'maximumVertexDisplacementM':0.,'materials':len(mesh.materials),'sourceMode':sourceMode,'uvLayer':'UVMap','colorLayer':'BR_original_low_frequency_color','finiteAtlasWindows':True,'sideFaces':sideCount,'endFaces':endCount,'metalFaces':metalCount,'recessFaces':recessCount,'actualExposedDamageCorners':exposedCorners,'memberCount':len(records),'surface':surfaceStats}


def ApplyReferenceWoodSurface(frame,textureRoot,memberRecords):
 """Map tagged final low Frame to one shared native PBR surface, in place."""
 contacts=[]
 for record in memberRecords:
  for contact in record.get('ironContacts',[]):
   if contact not in contacts:contacts.append(contact)
 return _ApplyReferenceMapping(frame,textureRoot,memberRecords,contacts,sourceMode=False)
