"""Metric wood charts and clean woven cotton for the 60k bed revision.

Works on private Frame copies and three replaced Quilt overlay partitions.
The existing contact shell and four other exported components stay untouched.
"""
import hashlib,json,math
from pathlib import Path
import bpy,bmesh
import numpy as np
from mathutils import Vector
from Script_PatchedTimberBedWood import _EncodeSurfacePng,_SurfaceSrgb,_ReferenceMemberRecord,_MemberCoordinates

Version='20261021MetricWoodCottonV5'
SideRect=np.asarray([[32/2048,32/2048],[1504/2048,1504/2048]])
EndRects=[np.asarray([[1568/2048,v],[2016/2048,v+448/2048]]) for v in (64/2048,544/2048,1024/2048,1504/2048)]
SideMeters=.64


def Select(objects):
 bpy.ops.object.select_all(action='DESELECT')
 for obj in objects:obj.hide_set(False);obj.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.context.view_layer.update()


def Triangles(obj):return sum(len(poly.vertices)-2 for poly in obj.data.polygons)


def WriteMaps(textureRoot,prefix,maps):
 images={};rows=[];textureRoot=Path(textureRoot)
 for role,pixels in maps.items():
  raw=_EncodeSurfacePng(pixels);path=textureRoot/(prefix+role+'.png');path.write_bytes(raw)
  image=bpy.data.images.load(str(path),check_existing=False);image.name=path.stem
  image.colorspace_settings.name='sRGB' if role=='Base' else 'Non-Color';image.pack();images[role]=image
  rows.append({'role':role,'file':str(path),'size':list(pixels.shape[:2][::-1]),'sha256':hashlib.sha256(raw).hexdigest()})
 return images,rows


def NativeMaterial(name,images,uvName,colorName,normalStrength):
 material=bpy.data.materials.new(name);material.use_nodes=True
 nodes=material.node_tree.nodes;links=material.node_tree.links;nodes.clear()
 shader=nodes.new('ShaderNodeBsdfPrincipled');out=nodes.new('ShaderNodeOutputMaterial');links.new(shader.outputs['BSDF'],out.inputs['Surface'])
 uv=nodes.new('ShaderNodeUVMap');uv.uv_map=uvName
 color=nodes.new('ShaderNodeVertexColor');color.layer_name=colorName
 textures={}
 for role,image in images.items():
  node=nodes.new('ShaderNodeTexImage');node.image=image;node.extension='REPEAT';node.interpolation='Linear';links.new(uv.outputs['UV'],node.inputs['Vector']);textures[role]=node
 mix=nodes.new('ShaderNodeMix');mix.data_type='RGBA';mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1.;mix.clamp_result=False
 links.new(textures['Base'].outputs['Color'],next(s for s in mix.inputs if s.identifier=='A_Color'))
 links.new(color.outputs['Color'],next(s for s in mix.inputs if s.identifier=='B_Color'))
 links.new(next(s for s in mix.outputs if s.type=='RGBA'),shader.inputs['Base Color'])
 normal=nodes.new('ShaderNodeNormalMap');normal.uv_map=uvName;normal.inputs['Strength'].default_value=normalStrength
 links.new(textures['Normal'].outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],shader.inputs['Normal'])
 sep=nodes.new('ShaderNodeSeparateColor');links.new(textures['Orm'].outputs['Color'],sep.inputs['Color']);links.new(sep.outputs['Green'],shader.inputs['Roughness']);links.new(sep.outputs['Blue'],shader.inputs['Metallic'])
 return material


def WoodMaps():
 if not Path(__file__).with_name('Texture_BedAgedTimberSource.png').exists():raise FileNotFoundError('Required natural timber source texture is missing')
 size=2048;rng=np.random.default_rng(227109)
 base=np.ones((size,size,3),np.float32);normals=np.zeros((size,size,3),np.float32);normals[:,:,2]=1
 rough=np.full((size,size),.84,np.float32);metal=np.zeros((size,size),np.float32)
 def Put(rect,rgb,height,physical,roughness):
  x0,y0=np.round(rect[0]*size).astype(int);x1,y1=np.round(rect[1]*size).astype(int);r0,r1=size-y1,size-y0
  dv,du=np.gradient(height,-physical[1]/max(1,r1-r0-1),physical[0]/max(1,x1-x0-1))
  n=np.stack((-du,-dv,np.ones_like(height)),axis=2);n/=np.linalg.norm(n,axis=2,keepdims=True)
  base[r0:r1,x0:x1]=rgb;normals[r0:r1,x0:x1]=n;rough[r0:r1,x0:x1]=roughness
 width=height=1472
 x=np.linspace(0,SideMeters,width,dtype=np.float32)[None,:];y=np.linspace(SideMeters,0,height,dtype=np.float32)[:,None]
 warp=y+.0028*np.sin(x*2*np.pi/SideMeters)+.0035*np.sin(x*4*np.pi/SideMeters+1.2)
 warp=warp+.010*np.exp(-((x-.29)/.065)**2)*np.tanh((y-.21)/.025)
 boundaries=[-.035]
 while boundaries[-1]<.70:boundaries.append(boundaries[-1]+rng.gamma(1.8,.0016)+.0008)
 boundaries=np.asarray(boundaries,np.float32);idx=np.clip(np.searchsorted(boundaries,warp)-1,0,len(boundaries)-2)
 distance=np.minimum(warp-boundaries[idx],boundaries[idx+1]-warp)
 grain=np.exp(-(distance/.00035)**2);bands=rng.uniform(-1,1,len(boundaries)).astype(np.float32)[idx]
 cloud=np.zeros_like(warp);wear=np.zeros_like(warp)
 for _ in range(38):
  cx,cy=rng.uniform(0,SideMeters,2);sx=rng.uniform(.025,.11);sy=rng.uniform(.005,.025)
  dx=np.minimum(np.abs(x-cx),SideMeters-np.abs(x-cx))
  patch=np.exp(-(dx/sx)**4-((warp-cy)/sy)**4)
  wear=np.maximum(wear,patch*rng.uniform(.2,.85))
 for k in range(8):cloud+=np.sin(x*(k%4+1)*2*np.pi/SideMeters+y*rng.uniform(12,35)+rng.uniform(0,6))*.012
 tone=np.clip(.88+.055*bands-.075*grain+cloud,.65,1.05)
 dark=np.asarray([.135,.095,.057]);bare=np.asarray([.255,.190,.116])
 rgb=(dark[None,None,:]*(1-wear[:,:,None])+bare[None,None,:]*wear[:,:,None])*tone[:,:,None]
 field=-.000055*grain+.000016*bands;roughness=.83+.06*wear+.025*bands
 for _ in range(9):
  cy=rng.uniform(.015,.625);cx=rng.uniform(.04,.60);length=rng.uniform(.025,.14)
  dx=np.minimum(np.abs(x-cx),SideMeters-np.abs(x-cx))
  split=np.exp(-((y-cy-.001*np.sin(x*4*np.pi/SideMeters))/.00030)**2)*np.exp(-(dx/length)**4)
  rgb*=1-.18*split[:,:,None];field-=.00025*split
 Put(SideRect,rgb,field,(SideMeters,SideMeters),roughness)
 for i,rect in enumerate(EndRects):
  xx,yy=np.meshgrid(np.linspace(-.09,.09,448),np.linspace(.09,-.09,448));radius=np.sqrt((xx+.16+.015*i)**2+((yy-.02*i)*.92)**2)
  phase=radius/.0043+.12*np.sin(radius*77);ring=(.5+.5*np.cos(phase*2*np.pi))**12
  endRgb=np.asarray([.17,.123,.078])[None,None,:]*(1-.055*ring[:,:,None]);Put(rect,endRgb,-.000025*ring,(.18,.18),.88)
 base[8:64,1568:2016]=1;rough[8:64,1568:2016]=.84;metal[8:64,1792:2016]=.70
 source=Path(__file__).with_name('Texture_BedAgedTimberSource.png')
 if source.exists():
  from Script_PatchedTimberBedCotton import ReadRgbPng,ToLinear
  linear=ToLinear(ReadRgbPng(source).astype(np.float64)/255)
  # Periodic-plus-smooth decomposition removes edge discontinuities without
  # stretching, blurring or horizontally smearing the photographic grain.
  h,w=linear.shape[:2];boundary=np.zeros_like(linear)
  boundary[0]=linear[-1]-linear[0];boundary[-1]=linear[0]-linear[-1]
  boundary[:,0]+=linear[:,-1]-linear[:,0];boundary[:,-1]+=linear[:,0]-linear[:,-1]
  ky=np.fft.fftfreq(h)[:,None];kx=np.fft.fftfreq(w)[None,:]
  denominator=2*np.cos(2*np.pi*kx)+2*np.cos(2*np.pi*ky)-4;denominator[0,0]=1
  correction=np.fft.fft2(boundary,axes=(0,1))/denominator[:,:,None];correction[0,0]=0
  periodic=np.clip(linear-np.fft.ifft2(correction,axes=(0,1)).real,.004,.8)
  timber=ResizePixels(periodic,1472);lum=timber@np.asarray([.2126,.7152,.0722])
  fy=np.fft.fftfreq(1472)[:,None];fx=np.fft.rfftfreq(1472)[None,:]
  low=np.fft.irfft2(np.fft.rfft2(lum)*np.exp(-2*np.pi*np.pi*4.5**2*(fx*fx+fy*fy)),s=lum.shape)
  residual=lum-low;micro=np.clip(residual/max(float(residual.std()),1e-9),-3,3)*.00007
  du=(np.roll(micro,-1,axis=1)-np.roll(micro,1,axis=1))/(2*SideMeters/1472)
  dv=(np.roll(micro,1,axis=0)-np.roll(micro,-1,axis=0))/(2*SideMeters/1472)
  n=np.stack((-du,-dv,np.ones_like(micro)),axis=2);n/=np.linalg.norm(n,axis=2,keepdims=True)
  base[544:2016,32:1504]=timber;normals[544:2016,32:1504]=n;rough[544:2016,32:1504]=np.clip(.84-.035*residual/max(float(residual.std()),1e-9),.75,.94)
 # Extrude all chart borders into their gutters. UVs at a repeat boundary
 # otherwise bilinearly blend into the unused white atlas background.
 for rect in [SideRect,*EndRects]:
  x0,y0=np.round(rect[0]*size).astype(int);x1,y1=np.round(rect[1]*size).astype(int);r0,r1=size-y1,size-y0
  for array in (base,normals,rough,metal):
   tile=array[r0:r1,x0:x1].copy();padding=((16,16),(16,16))+(((0,0),) if array.ndim==3 else ())
   array[r0-16:r1+16,x0-16:x1+16]=np.pad(tile,padding,mode='edge')
 normal=normals.reshape(1024,2,1024,2,3).mean(axis=(1,3));normal/=np.linalg.norm(normal,axis=2,keepdims=True)
 orm=np.zeros((512,512,3),np.uint8);orm[:,:,0]=255;orm[:,:,1]=np.round(np.clip(rough.reshape(512,4,512,4).mean(axis=(1,3)),0,1)*255).astype(np.uint8);orm[:,:,2]=np.round(metal.reshape(512,4,512,4).mean(axis=(1,3))*255).astype(np.uint8)
 return {'Base':np.round(_SurfaceSrgb(base)*255).astype(np.uint8),'Normal':np.round((normal*.5+.5)*255).astype(np.uint8),'Orm':orm}


def Perimeter(coords,record):
 minimum=np.asarray(record['minimum']);maximum=np.asarray(record['maximum']);center=(minimum[1:]+maximum[1:])*.5;half=np.maximum((maximum[1:]-minimum[1:])*.5,.0001)
 a,b=(coords[:,1:]-center).T;scale=np.maximum(np.abs(a)/half[0],np.abs(b)/half[1]);a=a/np.maximum(scale,1e-8);b=b/np.maximum(scale,1e-8)
 isA=np.abs(a/half[0])>=np.abs(b/half[1])-.00001
 s=np.where(isA,np.where(a>=0,b+half[1],2*half[1]+2*half[0]+half[1]-b),np.where(b>=0,2*half[1]+half[0]-a,4*half[1]+2*half[0]+a+half[0]))
 return s,float(4*half.sum())


def SplitWoodTiles(frame,records):
 """Cut actual geometry at tile resets; never interpolate across a UV wrap."""
 bm=bmesh.new();bm.from_mesh(frame.data);tag=bm.faces.layers.int.get('FrameUvMemberId');inverse=frame.matrix_world.inverted();cuts=0
 for record in records:
  if record['surfaceRole']!='wood':continue
  axis=np.asarray(record['axes'][0]);minimum=record['minimum'][0];maximum=record['maximum'][0];center=np.asarray(record['center']);phase=(record['seed']%499)/499*SideMeters
  boundary=(math.floor(phase/SideMeters)+1)*SideMeters-phase+minimum
  while boundary<maximum-1e-6:
   faces=[face for face in bm.faces if face[tag]==record['id']]
   if faces:
    points=set(v for face in faces for v in face.verts);edges=set(edge for face in faces for edge in face.edges)
    point=Vector(center+axis*boundary);normal=frame.matrix_world.to_3x3().transposed()@Vector(axis)
    result=bmesh.ops.bisect_plane(bm,geom=list(points)+list(edges)+faces,plane_co=inverse@point,plane_no=normal,dist=1e-7,clear_inner=False,clear_outer=False)
    cuts+=len(result['geom_cut'])
   boundary+=SideMeters
 bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(frame.data);bm.free();frame.data.update();return cuts


def PhysicalWoodMembers(frame,records):
 """Resolve combined slat batches into real timber islands for UV coordinates.

 FrameMemberId remains the original source/damage identity. The separate UV
 tag prevents a multi-slat object's large bounding box becoming one giant bar.
 """
 bm=bmesh.new();bm.from_mesh(frame.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
 sourceTag=bm.faces.layers.int['FrameMemberId'];uvTag=bm.faces.layers.int.get('FrameUvMemberId') or bm.faces.layers.int.new('FrameUvMemberId')
 expanded=[];nextId=max(r['id'] for r in records)+1
 for record in records:
  selected={face for face in bm.faces if face[sourceTag]==record['id']}
  perimeter=2*sum(np.asarray(record['maximum'])[1:]-np.asarray(record['minimum'])[1:])
  if record['surfaceRole']!='wood' or perimeter<SideMeters-.035:
   for face in selected:face[uvTag]=record['id']
   expanded.append(record);continue
  components=[]
  while selected:
   first=selected.pop();stack=[first];component=[first]
   while stack:
    face=stack.pop()
    for edge in face.edges:
     for adjacent in edge.link_faces:
      if adjacent in selected:selected.remove(adjacent);stack.append(adjacent);component.append(adjacent)
   components.append(component)
  components.sort(key=lambda faces:tuple(np.mean([frame.matrix_world@v.co for f in faces for v in f.verts],axis=0)))
  for number,faces in enumerate(components):
   vertices=set(v for face in faces for v in face.verts);points=np.asarray([frame.matrix_world@v.co for v in vertices]);center,axes,coords=_MemberCoordinates(points)
   child=dict(record,id=nextId,name=record['name']+' / physical island '+str(number),center=center.tolist(),axes=axes.T.tolist(),minimum=coords.min(axis=0).tolist(),maximum=coords.max(axis=0).tolist(),seed=record['seed']+number*7919)
   if 2*sum(np.asarray(child['maximum'])[1:]-np.asarray(child['minimum'])[1:])>=SideMeters-.02:raise ValueError('Physical wood island exceeds perimeter chart: '+child['name'])
   for face in faces:face[uvTag]=nextId
   nextId+=1;expanded.append(child)
 bm.to_mesh(frame.data);bm.free();frame.data.update();return expanded


def MetricWood(frame,records,textureRoot):
 before=Triangles(frame);originalMemberCount=len(records);records=PhysicalWoodMembers(frame,records);cuts=SplitWoodTiles(frame,records);mesh=frame.data
 images,textureRows=WriteMaps(textureRoot,'Texture_BedFrameMetric',WoodMaps())
 material=NativeMaterial('Material_BedFrameMetric',images,'UVMap','BR_original_low_frequency_color',.36)
 world=np.asarray([frame.matrix_world@v.co for v in mesh.vertices]);lookup={r['id']:r for r in records}
 uv=mesh.uv_layers.get('UVMap') or mesh.uv_layers.new(name='UVMap');values=np.zeros((len(mesh.loops),2),np.float32);colors=np.ones((len(mesh.loops),4),np.float32)
 tag=mesh.attributes['FrameUvMemberId'];metal=mesh.attributes['FrameMetalSlot'];damage=mesh.color_attributes.get('WoodDamageData');side=0;ends=0
 for poly in mesh.polygons:
  record=lookup[tag.data[poly.index].value];ids=list(poly.vertices);loops=list(poly.loop_indices);points=world[ids];axes=np.asarray(record['axes']);coords=(points-np.asarray(record['center']))@axes.T
  normal=np.cross(points[1]-points[0],points[2]-points[0]);normal/=max(np.linalg.norm(normal),1e-20)
  role=record['surfaceRole'];slot=metal.data[poly.index].value
  if slot or role in ('metal','recess','peg'):
   values[loops]=[.93 if slot==1 else .82,.982]
   colors[loops,:3]=[.035,.032,.025] if slot==1 else [.025,.020,.014] if slot==2 or role=='recess' else [.135,.090,.050]
   continue
  if abs(float(normal@axes[0]))>.82:
   rect=EndRects[record['seed']%4];local=coords[:,1:]-(np.asarray(record['minimum'])[1:]+np.asarray(record['maximum'])[1:])*.5
   values[loops]=rect[0]+(.5+local/.18)*(rect[1]-rect[0]);ends+=1
  else:
   phase=(record['seed']%499)/499*SideMeters;along=coords[:,0]-record['minimum'][0]+phase
   tile=math.floor(float(along.mean())/SideMeters);along-=tile*SideMeters
   if along.min()<-1e-5 or along.max()>SideMeters+1e-5:raise ValueError('Wood face spans a UV repeat boundary')
   across,perimeter=Perimeter(coords,record)
   if across.max()-across.min()>perimeter*.5:across=np.where(across<perimeter*.5,across+perimeter,across)
   crossOffset=.012+(record['seed']%37)/37*max(0,SideMeters-perimeter-.035)
   values[loops]=SideRect[0]+np.stack((along,across+crossOffset),axis=1)/SideMeters*(SideRect[1]-SideRect[0]);side+=1
  tint=np.full((len(loops),3),.93,dtype=np.float64)
  damp=np.clip((.16-points[:,2])/.16,0,1)*.28;tint*=1-damp[:,None]
  if damage:
   exposed=np.asarray([damage.data[i].color[0] for i in loops])*.14;tint+=exposed[:,None]
  colors[loops,:3]=tint
 uv.data.foreach_set('uv',values.ravel());uv.active_render=True;mesh.uv_layers.active=uv
 for layer in list(mesh.uv_layers):
  if layer.name!='UVMap':mesh.uv_layers.remove(layer)
 color=mesh.color_attributes.get('BR_original_low_frequency_color') or mesh.color_attributes.new(name='BR_original_low_frequency_color',type='FLOAT_COLOR',domain='CORNER');color.data.foreach_set('color',colors.ravel());mesh.color_attributes.active_color=color
 mesh.materials.clear();mesh.materials.append(material)
 for poly in mesh.polygons:poly.material_index=0
 frame['GameExportColorLayer']=color.name;mesh.update()
 return {'version':Version,'trianglesBeforeUvCuts':before,'trianglesAfterUvCuts':Triangles(frame),'cutElements':cuts,'sideFaces':side,'endFaces':ends,'sourceMemberCount':originalMemberCount,'physicalUvMemberCount':len(records),'sidePhysicalMeters':[SideMeters,SideMeters],'sideTexturePixels':[1472,1472],'sideTexelsPerMeter':[1472/SideMeters]*2,'mapping':'physical timber islands, continuous metric rectangular perimeter, explicit geometry cuts at tile resets; original source/damage tags retained separately','textures':textureRows}


def ResizePixels(array,size):
 sourceHeight,sourceWidth=array.shape[:2];xx=np.linspace(0,sourceWidth-1,size);yy=np.linspace(0,sourceHeight-1,size)
 x0=np.floor(xx).astype(int);x1=np.minimum(x0+1,sourceWidth-1);fx=(xx-x0)[None,:,None]
 y0=np.floor(yy).astype(int);y1=np.minimum(y0+1,sourceHeight-1);fy=(yy-y0)[:,None,None]
 return (array[y0[:,None],x0[None,:]]*(1-fx)+array[y0[:,None],x1[None,:]]*fx)*(1-fy)+(array[y1[:,None],x0[None,:]]*(1-fx)+array[y1[:,None],x1[None,:]]*fx)*fy


def CottonMaps():
 from Script_PatchedTimberBedCotton import ReadRgbPng,ToLinear
 source=Path(__file__).with_name('Texture_BedAgedCottonSource.png')
 if not source.exists():raise FileNotFoundError('Required archived cotton source texture is missing: '+str(source))
 if source.exists():
  rgb=ReadRgbPng(source);linear=ToLinear(rgb.astype(np.float32)/255);height,width=rgb.shape[:2]
  lum=linear@np.asarray([.2126,.7152,.0722]);fy=np.fft.fftfreq(height)[:,None];fx=np.fft.rfftfreq(width)[None,:]
  low=np.fft.irfft2(np.fft.rfft2(lum)*np.exp(-2*np.pi*np.pi*5.*5.*(fx*fx+fy*fy)),s=lum.shape)
  fibre=lum-low;field=np.clip(fibre/max(float(fibre.std()),1e-8),-3,3)*.000045
  dY,dX=np.gradient(field,-.35/height,.35/width);normal=np.stack((-dX,-dY,np.ones_like(field)),axis=2);normal/=np.linalg.norm(normal,axis=2,keepdims=True)
  normal=ResizePixels(normal,1024);normal/=np.linalg.norm(normal,axis=2,keepdims=True)
  rough=np.clip(.92-.025*fibre/max(float(fibre.std()),1e-8),.86,.98)
  rough=ResizePixels(rough[:,:,None],512)[:,:,0];orm=np.zeros((512,512,3),np.uint8);orm[:,:,0]=255;orm[:,:,1]=np.round(rough*255).astype(np.uint8)
  return {'Base':rgb,'Normal':np.round((normal*.5+.5)*255).astype(np.uint8),'Orm':orm},linear.mean(axis=(0,1))
 size=1024;x=np.arange(size,dtype=np.float32)[None,:]/size;y=np.arange(size,dtype=np.float32)[:,None]/size
 px=x*128;py=y*128
 warp=(.5+.5*np.cos(2*np.pi*px))**3;weft=(.5+.5*np.cos(2*np.pi*py))**3
 over=(np.floor(px)+np.floor(py))%2
 height=.00012*(warp*(.65+.35*over)+weft*(1-.35*over))
 fuzz=np.zeros((size,size),np.float32)
 for k in range(1,8):fuzz+=np.sin(x*(k*63+17)*2*np.pi+y*(k*21+11)*2*np.pi+k)*(.008/k)
 tone=np.clip(.87+.11*(warp+weft-.7)+fuzz,.68,.99)
 rgb=np.repeat(tone[:,:,None],3,axis=2);dY,dX=np.gradient(height,-.256/size,.256/size);normal=np.stack((-dX,-dY,np.ones_like(height)),axis=2);normal/=np.linalg.norm(normal,axis=2,keepdims=True)
 orm=np.zeros((size,size,3),np.uint8);orm[:,:,0]=255;orm[:,:,1]=np.round(np.clip(.91+.025*(1-warp-weft)+fuzz,.85,.98)*255).astype(np.uint8)
 return {'Base':np.round(_SurfaceSrgb(rgb)*255).astype(np.uint8),'Normal':np.round((normal*.5+.5)*255).astype(np.uint8),'Orm':orm},tone.mean()


def DenseCottonColor(obj,attribute,colors):
 from Script_PatchedTimberBedQuilt import _NormalizedVoxelColorLowPass
 vertices=np.asarray([obj.matrix_world@v.co for v in obj.data.vertices]);loopIds=np.asarray([loop.vertex_index for loop in obj.data.loops]);original=np.asarray(colors).reshape(-1,4)
 filtered,receipt=_NormalizedVoxelColorLowPass(vertices[loopIds],original,cellM=.010,sigmaM=.018)
 lower,upper=np.quantile(original[:,:3],[.15,.85],axis=0);mean=np.clip(original[:,:3],lower,upper).mean(axis=0)
 originalMean=original[:,:3].mean(axis=0);smooth=np.maximum(originalMean+(filtered[:,:3]-originalMean)/.55,.002)
 weights=np.asarray([.2126,.7152,.0722]);lum=smooth@weights;meanLum=float(mean@weights)
 hue=smooth/np.maximum(lum[:,None],.002);neutral=mean/max(meanLum,.002)
 newLum=np.maximum(.004,meanLum+.35*(lum-meanLum))
 filtered[:,:3]=newLum[:,None]*(.85*hue+.15*neutral)
 attribute.data.foreach_set('color',filtered.ravel())
 receipt.update({'version':Version,'purpose':'compress baked luminance lumps while preserving coloured repair patches; independent woven PBR carries fibre detail','luminanceContrast':.35,'chromaticPatchRetention':.85})
 return receipt


def CottonUv(meshObject):
 """Angle-based charts, independently scaled by measured surface area."""
 mesh=meshObject.data;uv=mesh.uv_layers.get('UVMap.001') or mesh.uv_layers.new(name='UVMap.001');mesh.uv_layers.active=uv
 Select([meshObject]);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
 bpy.ops.uv.smart_project(angle_limit=math.radians(60),island_margin=.002,area_weight=0.,correct_aspect=True,scale_to_bounds=False)
 bpy.ops.object.mode_set(mode='OBJECT')
 bm=bmesh.new();bm.from_mesh(mesh);layer=bm.loops.layers.uv.get('UVMap.001')
 for edge in bm.edges:
  if len(edge.link_faces)!=2:edge.seam=True;continue
  a,b=edge.link_faces;byVertex={loop.vert.index:loop[layer].uv.copy() for loop in a.loops}
  edge.seam=any((loop[layer].uv-byVertex[loop.vert.index]).length>1e-5 for loop in b.loops if loop.vert in edge.verts)
 bm.to_mesh(mesh);bm.free()
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.unwrap(method='ANGLE_BASED',fill_holes=True,correct_aspect=True,margin=0.)
 bpy.ops.object.mode_set(mode='OBJECT')
 bm=bmesh.new();bm.from_mesh(mesh);layer=bm.loops.layers.uv.get('UVMap.001');seen=set();charts=0
 for first in bm.faces:
  if first in seen:continue
  stack=[first];seen.add(first);faces=[]
  while stack:
   face=stack.pop();faces.append(face)
   for edge in face.edges:
    if edge.seam:continue
    for adjacent in edge.link_faces:
     if adjacent not in seen:seen.add(adjacent);stack.append(adjacent)
  area=sum(face.calc_area() for face in faces);uvArea=0.
  for face in faces:
   points=[np.asarray(loop[layer].uv[:]) for loop in face.loops]
   uvArea+=abs(sum(np.cross(points[i]-points[0],points[i+1]-points[0]) for i in range(1,len(points)-1)))*.5
  if uvArea>1e-16 and area>1e-16:
   factor=math.sqrt(area/uvArea)/.35
   for face in faces:
    for loop in face.loops:loop[layer].uv*=factor
  charts+=1
 bm.to_mesh(mesh);bm.free();mesh.update();uv=mesh.uv_layers['UVMap.001'];uv.active_render=True;mesh.uv_layers.active=uv
 return charts


def ApplyCleanCotton(quilt,textureRoot):
 maps,mean=CottonMaps();images,rows=WriteMaps(textureRoot,'Texture_BedQuiltCleanCotton',maps)
 mesh=quilt.data;color=mesh.color_attributes['BR_original_low_frequency_color'];values=np.empty((len(mesh.loops),4),np.float32);color.data.foreach_get('color',values.ravel())
 backup=mesh.color_attributes.get('CottonSourceLowFrequencyColor') or mesh.color_attributes.new(name='CottonSourceLowFrequencyColor',type='FLOAT_COLOR',domain='CORNER');backup.data.foreach_set('color',values.ravel())
 color=mesh.color_attributes['BR_original_low_frequency_color'];values[:,:3]/=np.asarray(mean);color.data.foreach_set('color',values.ravel())
 charts=CottonUv(quilt)
 color=mesh.color_attributes['BR_original_low_frequency_color']
 material=NativeMaterial('Material_BedQuiltCleanCotton',images,'UVMap.001',color.name,.48)
 mesh.materials.clear();mesh.materials.append(material)
 for poly in mesh.polygons:poly.material_index=0;poly.use_smooth=True
 if mesh.has_custom_normals:mesh.normals_split_custom_set(np.zeros((len(mesh.loops),3),np.float32))
 quilt['GameExportColorLayer']=color.name;mesh.color_attributes.active_color=color;mesh.update()
 quilt['CleanCottonVersion']=Version;quilt['CleanCottonBaseMean']=np.asarray(mean).tolist()
 from Script_PatchedTimberBedCotton import UvStats
 mesh.calc_loop_triangles();points=np.asarray([quilt.matrix_world@v.co for v in mesh.vertices]);faces=np.asarray([t.vertices[:] for t in mesh.loop_triangles]);loops=np.asarray([t.loops[:] for t in mesh.loop_triangles]);uvs=np.asarray([v.uv[:] for v in mesh.uv_layers['UVMap.001'].data])
 return {'version':Version,'charts':charts,'tileMeters':.35,'normalStrength':.48,'allMapsUv':'UVMap.001','oldNormalImageReplaced':True,'textures':rows,'physicalUv':UvStats(points,faces,uvs[loops]),'triangles':Triangles(quilt),'baseSource':'Texture_BedAgedCottonSource.png','baseSourceSha256':hashlib.sha256(Path(__file__).with_name('Texture_BedAgedCottonSource.png').read_bytes()).hexdigest(),'baseMeanLinear':np.asarray(mean).tolist(),'normalMethod':'fine-fibre luminance residual only, 5px Gaussian removed; 45um RMS height, OpenGL +Y; stains excluded from broad displacement'}
