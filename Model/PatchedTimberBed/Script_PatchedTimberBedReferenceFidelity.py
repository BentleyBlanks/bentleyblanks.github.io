"""Original M17 C timber, bound reed-mat and soft cotton detailing.

Operates on private task meshes through the managed BlenderMCP process. The
source photographs inform material hierarchy and fibre failure, not copied
pixels or a replacement of the selected bed design.
"""
import bpy,bmesh,math,json,hashlib
from pathlib import Path
import numpy as np
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
from Script_PatchedTimberBedSurfaceRevision import WoodMaps,WriteMaps,NativeMaterial,Triangles,Select
from Script_PatchedTimberBedWood import _SurfaceSrgb
from Script_PatchedTimberBedCotton import ToLinear

Version='20261022M17CottonBoundReedsV9'


def PatinaMaps():
 """Dry grey-brown M17 timber; the original reference is not lacquered."""
 maps=WoodMaps();base=ToLinear(maps['Base'].astype(np.float64)/255);side=base[544:2016,32:1504]
 lum=side@np.asarray([.2126,.7152,.0722]);detail=np.exp(np.clip(np.log(np.maximum(lum,.001)/np.median(lum))*.66,-1.3,.7))
 x,y=np.meshgrid(np.arange(1472)/1472,np.arange(1472)/1472);weather=.96+.055*np.sin(2*np.pi*x+.9)*np.sin(4*np.pi*y)+.025*np.sin(6*np.pi*x+2*np.sin(2*np.pi*y))
 side[:]=np.asarray([.164,.132,.097])[None,None,:]*detail[:,:,None]*weather[:,:,None]
 for row in (64,544,1024,1504):
  y0,y1=2048-row-448,2048-row;tile=base[y0:y1,1568:2016];value=tile@np.asarray([.2126,.7152,.0722]);tone=np.exp(np.clip(np.log(np.maximum(value,.001)/np.median(value))*.78,-1.5,.6));tile[:]=np.asarray([.173,.143,.106])[None,None,:]*tone[:,:,None]
 normal=maps['Normal'].astype(np.float64)/255*2-1;normal[272:1008,16:752,:2]*=.82;normal/=np.maximum(np.linalg.norm(normal,axis=2,keepdims=True),1e-8)
 rough=maps['Orm'][:,:,1].astype(np.float64)/255;rough[136:504,8:376]=np.clip(.84+(rough[136:504,8:376]-.84)*.75,.76,.94)
 for row in (64,544,1024,1504):rough[(2048-row-448)//4:(2048-row)//4,392:504]=.88
 for array,scale,padding in [(base,1,16),(normal,2,8),(rough,4,4)]:
  for x0,y0,x1,y1 in [(32,544,1504,2016),*[(1568,2048-row-448,2016,2048-row) for row in (64,544,1024,1504)]]:
   x0,y0,x1,y1=[value//scale for value in (x0,y0,x1,y1)];tile=array[y0:y1,x0:x1].copy();pad=((padding,padding),(padding,padding))+(((0,0),) if array.ndim==3 else ());array[y0-padding:y1+padding,x0-padding:x1+padding]=np.pad(tile,pad,mode='edge')
 maps['Base']=np.round(_SurfaceSrgb(base)*255).astype(np.uint8);maps['Normal']=np.round((normal*.5+.5)*255).astype(np.uint8);maps['Orm'][:,:,1]=np.round(rough*255).astype(np.uint8)
 return maps


def ApplyPatina(frame,records,textureRoot,sourceOffset=(0,0,0)):
 mesh=frame.data;lookup={int(row['id']):row for row in records};world=np.asarray([frame.matrix_world@v.co for v in mesh.vertices])+np.asarray(sourceOffset)
 tag=mesh.attributes['FrameMemberId'];metal=mesh.attributes['FrameMetalSlot'];damage=mesh.attributes.get('WoodReferenceDamage')
 layer=mesh.color_attributes['BR_original_low_frequency_color'];colors=np.ones((len(mesh.loops),4),np.float32);wearCorners=0
 for poly in mesh.polygons:
  ids=list(poly.vertices);loops=list(poly.loop_indices);points=world[ids];record=lookup[tag.data[poly.index].value];slot=metal.data[poly.index].value
  if slot or record['surfaceRole'] in ('metal','recess','peg'):
   for i in loops:colors[i]=layer.data[i].color
   continue
  axes=np.asarray(record['axes']);coords=(points-np.asarray(record['center']))@axes.T;low=np.asarray(record['minimum']);high=np.asarray(record['maximum']);span=np.maximum(high-low,.001)
  t=(coords[:,0]-low[0])/span[0];seed=int(record['seed']);phase=(seed%967)*.031
  normal=np.asarray(poly.normal);normal=np.asarray(frame.matrix_world.to_3x3())@normal;normal/=max(np.linalg.norm(normal),1e-10)
  n=np.abs(normal@axes.T);end=n[0]>.82
  slow=np.sin(t*8.7+phase)*.6+np.sin(t*19.1+phase*.37)*.25+np.sin(t*4.1-phase)*.15
  memberTone=.93+.11*((seed*13)%101)/100
  tint=(.90+.055*slow)*memberTone
  # Wear appears in broken patches on exposed rounded corners; broad faces
  # retain the coherent brown patina seen in the old indoor elm reference.
  section=np.abs((coords[:,1:]-(low[1:]+high[1:])*.5)/np.maximum(span[1:]*.5,.001))
  corner=np.clip(section[:,0]*section[:,1],0,1)**5
  rubbed=np.clip((slow-.05)/.58,0,1)*corner
  tint+=rubbed*.055;wearCorners+=int(np.count_nonzero(rubbed>.35))
  joint=np.exp(-np.minimum(t,1-t)*span[0]/.026)
  if not end:tint*=1-.16*joint
  damp=np.clip((.14-points[:,2])/.14,0,1);tint*=1-.21*damp
  if end:tint=np.clip(.90+.035*slow,.81,.97)
  if damage:tint+=float(damage.data[poly.index].value)*.035
  colors[loops,:3]=np.clip(tint[:,None]*np.asarray([1.,.985,.95]),.18,1.)
 layer.data.foreach_set('color',colors.ravel());mesh.color_attributes.active_color=layer
 images,rows=WriteMaps(textureRoot,'Texture_BedFrameM17Weathered',PatinaMaps())
 material=NativeMaterial('Material_BedFrameM17Weathered',images,'UVMap',layer.name,.42);mesh.materials.clear();mesh.materials.append(material)
 for poly in mesh.polygons:poly.material_index=0
 frame['GameExportColorLayer']=layer.name;frame['ReferenceFidelityVersion']=Version;mesh.update()
 return {'version':Version,'textures':rows,'material':material.name,'normalStrength':.42,'woodSideRoughnessRange':[.76,.94],'patina':'M17 primary reference: dry grey-brown worn timber, natural broken fibres, localized rubbed corners and joint/foot dirt; no dark lacquer islands','intermittentWearCorners':wearCorners,'sourceOffset':list(sourceOffset)}


def SmoothTimberExterior(frame,records):
 """Smooth worn exterior transitions while keeping real fracture walls crisp."""
 mesh=frame.data;lookup={r['id']:r for r in records};tag=mesh.attributes['FrameMemberId'];fracture=mesh.attributes.get('WoodReferenceDamage');oldDamage=mesh.attributes.get('WoodExposedDamage');smooth=0;flat=0
 for poly in mesh.polygons:
  record=lookup[tag.data[poly.index].value];normal=np.asarray(frame.matrix_world.to_3x3())@np.asarray(poly.normal);normal/=max(np.linalg.norm(normal),1e-10);end=abs(float(normal@np.asarray(record['axes'][0])))>.90
  cut=(fracture and fracture.data[poly.index].value>.5) or (oldDamage and oldDamage.data[poly.index].value>0)
  poly.use_smooth=record['surfaceRole']=='wood' and not end and not cut
  smooth+=int(poly.use_smooth);flat+=int(not poly.use_smooth)
 mesh.set_sharp_from_angle(angle=math.radians(52))
 Select([frame]);modifier=frame.modifiers.new('WornTimberWeightedNormals','WEIGHTED_NORMAL');modifier.keep_sharp=True;modifier.weight=40;modifier.mode='FACE_AREA_WITH_ANGLE';bpy.ops.object.modifier_apply(modifier=modifier.name)
 return {'smoothExteriorFaces':smooth,'flatCapsAndFractures':flat,'sharpAngleDegrees':52,'method':'area-and-angle weighted exterior normals; real cut faces and end caps stay flat'}


def IrregularCheck(center,axes,end,face,sign,across,length,width,depth,seed):
 from Script_PatchedTimberBedWoodDamage import _ClosedCutter
 rng=np.random.default_rng(seed);vertices=[];fractions=[-.025,.14,.35,.57,.79,1.]
 for index,t in enumerate(fractions):
  along=end-length*t;w=width*[1.,.81,.53,.61,.28,.025][index];shift=w*float(rng.uniform(-.16,.16));d=depth*[1.,.9,.77,.57,.30,-.12][index]
  for outward,side in [(.003,-w*.5),(.003,w*.5),(-d,shift)]:vertices.append(np.asarray(center)+np.asarray(axes)@np.asarray([along,face+sign*outward,across+side+shift]))
 faces=[(2,1,0),tuple((len(fractions)-1)*3+j for j in range(3))]
 for i in range(len(fractions)-1):
  for j in range(3):faces.append((i*3+j,i*3+(j+1)%3,(i+1)*3+(j+1)%3,(i+1)*3+j))
 faces=[triangle for face in faces for triangle in [(face[0],face[i],face[i+1]) for i in range(1,len(face)-1)]]
 return _ClosedCutter(vertices,faces)


def FrayedCorner(center,axes,corner,signs,along,length,depth,seed):
 from Script_PatchedTimberBedWoodDamage import _ClosedCutter
 rng=np.random.default_rng(seed);vertices=[];fractions=[-.55,-.29,-.05,.17,.45]
 for index,t in enumerate(fractions):
  d=depth*[0,.48,1.,.61,0][index];margin=.004
  if index in (0,4):d=-.001
  for a,b in [(-d*1.35,margin),(margin,-d*.95),(margin,margin)]:
   local=np.asarray([along+length*t,corner[0]+signs[0]*a,corner[1]+signs[1]*b]);vertices.append(np.asarray(center)+np.asarray(axes)@local)
 faces=[(2,1,0),(12,13,14)]
 for i in range(4):
  for j in range(3):faces.append((i*3+j,i*3+(j+1)%3,(i+1)*3+(j+1)%3,(i+1)*3+j))
 faces=[triangle for face in faces for triangle in [(face[0],face[i],face[i+1]) for i in range(1,len(face)-1)]]
 return _ClosedCutter(vertices,faces)


def RefineTimberLosses(objects):
 from Script_PatchedTimberBedWoodDamage import MemberFrame,_Snapshot,_Integrity,_SectionBounds,_ApplyCutter,_MaximumNewCutDepth
 # Deliberately sparse, asymmetric placements by actual member. Opposite
 # members do not receive identical cuts at a common normalized position.
 plans={
  'FRAME_C13_Foot post.001':[('edge',.93,.083,.0070),('check',1.,.105,.0049)],
  'FRAME_C13_Foot post':[('check',1.,.051,.0028)],
  'FRAME_C13_Head post.001':[('edge',.97,.067,.0051),('check',1.,.077,.0037)],
  'FRAME_C13_Head post':[('check',1.,.041,.0028)],
  'FRAME_C13_Long load bearing side rail.001':[('edge',.83,.164,.0050)],
  'FRAME_C13_Long load bearing side rail':[('edge',.28,.086,.0038)],
  'FRAME_C13_Head upper rail':[('edge',.79,.061,.0039)],
  'FRAME_C13_Low end stretcher.001':[('edge',.14,.056,.0033)],
  'FRAME_C13_Lower anti-rack brace.002':[('edge',.87,.068,.0037)],
  'FRAME_C13_Lower anti-rack brace.003':[('edge',.76,.092,.0045)]}
 rows=[]
 for obj in sorted(objects,key=lambda o:o.name):
  if not obj.get('TimberRoundedSection'):continue
  Select([obj]);bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
  original=_Snapshot(obj);integrity=_Integrity(obj.data)
  if integrity['nonManifoldEdges']:raise ValueError('Reference wood must begin closed: '+obj.name)
  center,axes,coords=MemberFrame(original['world']);low,high=coords.min(axis=0),coords.max(axis=0);radial=center-np.asarray([.09,0,.45]);radial[2]=0;signs=[1 if axes[:,i]@radial>=0 else -1 for i in (1,2)]
  seed=int(hashlib.sha256(obj.name.encode()).hexdigest()[:8],16);completed=[]
  for number,(kind,fraction,length,depth) in enumerate(plans.get(obj.name,[])):
   along=float(low[0]+fraction*(high[0]-low[0]));lo,hi,_=_SectionBounds(coords,original['faces'],min(along,float(high[0]-.012)))
   if kind=='edge':
    corner=[float(hi[i] if signs[i]>0 else lo[i])-signs[i]*.0014 for i in range(2)]
    verts,faces,volume=FrayedCorner(center,axes,corner,signs,along,length,depth,seed+number)
   else:
    width=.0027 if length>.07 else .0017
    verts,faces,volume=IrregularCheck(center,axes,float(high[0]),float(hi[0] if signs[0]>0 else lo[0]),signs[0],float((lo[1]+hi[1])*.5)+(seed%17-8)*.0006,length,width,depth,seed+number)
   region={'kind':'IrregularDryCheck' if kind=='check' else 'FragmentedGrainEdgeLoss','cutterVerticesWorld':verts.tolist(),'cutterFaces':faces,'worldBoundsMin':verts.min(axis=0).tolist(),'worldBoundsMax':verts.max(axis=0).tolist(),'cutterVolumeM3':volume,'nominalLengthM':length,'nominalDepthM':depth}
   backup=obj.data.copy();before=_Snapshot(obj)
   try:
    _ApplyCutter(obj,region);after=_Snapshot(obj);integrity=_Integrity(obj.data)
    if after['triangles']<before['triangles']*.7 or integrity['nonManifoldEdges']:raise ValueError('Unsafe reference cut: '+obj.name+' '+json.dumps({'before':before['triangles'],'after':after['triangles'],'integrity':integrity}))
    actual=_MaximumNewCutDepth(before,after,region)
    if actual<.00025:raise ValueError('Reference cut did not enter the rounded wood: '+obj.name)
    region['measuredMaximumNewCutFaceDepthM']=actual;completed.append(region)
   except Exception:
    failed=obj.data;obj.data=backup
    if failed.users==0:bpy.data.meshes.remove(failed)
    raise
   if backup.users==0:bpy.data.meshes.remove(backup)
  bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
  tree=BVHTree.FromPolygons(original['world'].tolist(),original['faces'],all_triangles=True);mask=np.zeros(len(obj.data.polygons),np.float32)
  for face in obj.data.polygons:
   point=sum((obj.matrix_world@obj.data.vertices[i].co for i in face.vertices),Vector())/len(face.vertices)
   mask[face.index]=float(tree.find_nearest(point)[3]>.00015);face.use_smooth=False
  attr=obj.data.attributes.get('WoodReferenceDamage') or obj.data.attributes.new(name='WoodReferenceDamage',type='FLOAT',domain='FACE');attr.data.foreach_set('value',mask)
  if obj.data.has_custom_normals:obj.data.normals_split_custom_set(np.zeros((len(obj.data.loops),3),np.float32))
  group=obj.vertex_groups.get('TimberDamagePreserve') or obj.vertex_groups.new(name='TimberDamagePreserve');group.add(list(range(len(obj.data.vertices))),1.,'REPLACE')
  row={'object':obj.name,'trianglesBefore':original['triangles'],'trianglesAfter':Triangles(obj),'nominalBevelWidthM':float(obj.get('TimberRoundedRadiusM',.0022)),'newLosses':completed,'newFractureFaces':int(mask.sum())};obj['TimberReferenceVersion']=Version;rows.append(row)
 return {'version':Version,'members':rows,'newLosses':sum(len(r['newLosses']) for r in rows),'placement':'sparse unequal losses at exposed end grain and stressed rail/brace edges; no matching center chips on every beam'}


def ReedMatMaps():
 from Script_PatchedTimberBedCotton import ReadRgbPng
 from Script_PatchedTimberBedSurfaceRevision import ResizePixels
 rgb=ToLinear(ReadRgbPng(Path(__file__).with_name('Texture_BedBoundReedSource.png')).astype(np.float64)/255);h,w=rgb.shape[:2]
 boundary=np.zeros_like(rgb);boundary[0]=rgb[-1]-rgb[0];boundary[-1]=-boundary[0];boundary[:,0]+=rgb[:,-1]-rgb[:,0];boundary[:,-1]+=rgb[:,0]-rgb[:,-1]
 ky=np.fft.fftfreq(h)[:,None];kx=np.fft.fftfreq(w)[None,:];den=2*np.cos(2*np.pi*kx)+2*np.cos(2*np.pi*ky)-4;den[0,0]=1;correction=np.fft.fft2(boundary,axes=(0,1))/den[:,:,None];correction[0,0]=0
 rgb=ResizePixels(np.clip(rgb-np.fft.ifft2(correction,axes=(0,1)).real,.004,.9),1024);rgb*=np.asarray([.87,.90,.92]);lum=rgb@np.asarray([.2126,.7152,.0722]);height=(lum-lum.mean())/max(float(lum.std()),1e-8)*.00013
 du=(np.roll(height,-1,1)-np.roll(height,1,1))/(.32/1024);dv=(np.roll(height,1,0)-np.roll(height,-1,0))/(.32/1024);normal=np.stack((-du,-dv,np.ones_like(du)),axis=2);normal/=np.linalg.norm(normal,axis=2,keepdims=True)
 orm=np.zeros((512,512,3),np.uint8);orm[:,:,0]=255;orm[:,:,1]=np.round(np.clip(.91-.025*(lum-lum.mean())/lum.std(),.85,.98).reshape(512,2,512,2).mean(axis=(1,3))*255).astype(np.uint8)
 return {'Base':np.round(_SurfaceSrgb(rgb)*255).astype(np.uint8),'Normal':np.round((normal*.5+.5)*255).astype(np.uint8),'Orm':orm}


def RebuildCompressedReeds(straw,frame,textureRoot):
 old=straw.data;before=Triangles(straw);role=old.attributes['StrawSourceRole'];keep=[p for p in old.polygons if role.data[p.index].value in (0,1)]
 used=sorted({v for p in keep for v in p.vertices});remap={v:i for i,v in enumerate(used)};vertices=[tuple(straw.matrix_world@old.vertices[i].co) for i in used];faces=[tuple(remap[i] for i in p.vertices) for p in keep];roles=[int(role.data[p.index].value) for p in keep];tones=[1.]*len(faces)
 corePoints=np.asarray(vertices);coreTriangles=sum(len(p)-2 for p in faces);coreFaceCount=len(faces);coreTree=BVHTree.FromPolygons(vertices,faces)
 framePoints=[frame.matrix_world@v.co for v in frame.data.vertices];frameTree=BVHTree.FromPolygons(framePoints,[tuple(p.vertices) for p in frame.data.polygons]);rng=np.random.default_rng(220208)
 def Top(x,y):
  hit=coreTree.ray_cast(Vector((x,y,.78)),Vector((0,0,-1)),.4)[0]
  return float(hit.z) if hit else .582+.0015*math.sin(8*x+3*y)
 def Bottom(x,y):
  hit=frameTree.ray_cast(Vector((min(max(x,-1.01),.90),y,.54)),Vector((0,0,-1)),.15)[0]
  return float(hit.z)+.0006 if hit is not None and .44<hit.z<.50 else .466
 def Face(ids,roleId,tone=1.):faces.append(tuple(ids));roles.append(roleId);tones.append(tone)
 tubeCount=0
 def Tube(path,radius,roleId=6,tone=1.,sides=4):
  nonlocal tubeCount
  tubeCount+=1;path=np.asarray(path);start=len(vertices)
  for i,point in enumerate(path):
   tangent=path[min(i+1,len(path)-1)]-path[max(i-1,0)];tangent/=np.linalg.norm(tangent);ref=np.asarray([1.,0,0]) if abs(tangent[0])<.85 else np.asarray([0,1.,0]);a=np.cross(tangent,ref);a/=np.linalg.norm(a);b=np.cross(tangent,a)
   taper=.45 if i==len(path)-1 and roleId==12 else .7 if i in (0,len(path)-1) else 1.
   for j in range(sides):vertices.append(tuple(point+radius*taper*(a*math.cos(j*2*math.pi/sides)+b*math.sin(j*2*math.pi/sides))))
  for i in range(len(path)-1):
   for j in range(sides):Face([start+i*sides+j,start+i*sides+(j+1)%sides,start+(i+1)*sides+(j+1)%sides,start+(i+1)*sides+j],roleId,tone)
  Face([start+j for j in reversed(range(sides))],roleId,tone);Face([start+(len(path)-1)*sides+j for j in range(sides)],roleId,tone)
 xValues=np.linspace(-1.102,.945,76)
 for sign in (-1,1):
  start=len(vertices)
  for x in xValues:
   top=Top(float(x),sign*.421);bottom=Bottom(float(x),sign*.444)
   for fraction in np.linspace(0,1,6):
    bulge=math.sin(fraction*math.pi);y=sign*(.440+.012*bulge+.0032*math.sin(x*8.3+sign)*bulge)
    z=bottom+(top-bottom)*fraction-.0015*math.sin(x*12+fraction*2)*bulge
    vertices.append((float(x),y,z))
  for i in range(len(xValues)-1):
   for j in range(5):
    if sign<0 and (xValues[i]+xValues[i+1])*.5>.833 and j>=3:continue
    ids=[start+i*6+j,start+(i+1)*6+j,start+(i+1)*6+j+1,start+i*6+j+1];Face(ids if sign<0 else ids[::-1],2)
  # A narrow folded woven hem; its small irregularity reads as compressed
  # fibres at the top, not a rigid thick wicker wall.
  for yOffset,zOffset,radius in [(0,-.005,.0016),(.0018,-.009,.0011)]:
   Tube([(float(x),sign*(.443+yOffset+.0018*math.sin(x*19)),Top(float(x),sign*.421)+zOffset) for x in np.linspace(-1.09,.825 if sign<0 else .934,49)],radius,9,.94)
  for x in np.arange(-1.065,.93,.045):
   x+=float(rng.uniform(-.016,.016));top=Top(x,sign*.421);bottom=Bottom(x,sign*.444);lean=float(rng.uniform(-.007,.007))
   Tube([(x,sign*.419,bottom+.004),(x+lean,sign*.453,bottom+.016),(x+lean*.7,sign*.457,(top+bottom)*.53),(x,sign*.446,top-.014),(x-.002,sign*.422,top-.0019)],float(rng.uniform(.00075,.00115)),3,float(rng.uniform(.70,.92)),sides=3)
  # Broken overlapping bundles fill the side thickness. Each short row has
  # unequal length, level and tone, without a uniform fence or spiky crown.
  for pack in range(20):
   centerX=float(rng.uniform(-1.02,.85));length=float(rng.uniform(.09,.29));bottom=Bottom(centerX,sign*.444);top=Top(centerX,sign*.421);z=float(rng.uniform(bottom+.012,top-.014));lean=float(rng.uniform(-.004,.004))
   for strand in range(2):
    length2=length*float(rng.uniform(.65,1.12));x0=max(-1.10,centerX-length2*.5);x1=min(.94,centerX+length2*.5);radius=float(rng.uniform(.00055,.0010));height=z+(strand-1)*.0015
    path=[]
    for t in [0,.33,.72,1]:path.append((x0+(x1-x0)*t,sign*(.452+.003*math.sin((x0+(x1-x0)*t)*8.3+sign)+.0017*strand),height+lean*t+.0006*math.sin(t*5+pack)))
    Tube(path,radius,6,float(rng.uniform(.82,1.08)))
  for i in range(16):
   x=float(rng.uniform(-1.07,.91));bottom=Bottom(x,sign*.444);z=float(rng.uniform(bottom+.007,Top(x,sign*.421)-.015));dx=float(rng.uniform(.009,.024));up=float(rng.uniform(-.007,.009))
   Tube([(x,sign*.451,z),(x+dx*.5,sign*.462,z+up*.7),(x+dx,sign*.467,z+up)],float(rng.uniform(.0006,.0009)),12,float(rng.uniform(.82,1.04)))
 for x,sign in [(-1.104,-1),(.945,1)]:
  start=len(vertices)
  for y in np.linspace(-.44,.44,27):
   top=Top(x-sign*.012,float(y));bottom=.466
   for fraction in [0,.25,.55,.8,1]:vertices.append((x+sign*.005*math.sin(fraction*math.pi),float(y),bottom+fraction*(top-bottom)))
  for i in range(26):
   for j in range(4):
    if sign>0 and i<3 and j>=2:continue
    ids=[start+i*5+j,start+(i+1)*5+j,start+(i+1)*5+j+1,start+i*5+j+1];Face(ids if sign>0 else ids[::-1],2)
 # M17's characteristic open foot-side tuft: slender curved stalks spill out
 # of the broken wrap, above/outside the support rail rather than through it.
 for sign,stalks in [(-1,52),(1,8)]:
  for i in range(stalks):
   x=float(rng.uniform(.838,.915));dx=float(rng.uniform(-.030,.012));z=Top(x,sign*.421)-float(rng.uniform(.010,.035));endY=float(rng.uniform(.486,.527));sag=float(rng.uniform(.006,.049));bend=float(rng.uniform(-.018,.018))
   if i%3==0:
    path=[(x,sign*.434,z),(x+bend,sign*.465,z+.007),(x+dx,sign*endY,z+.003),(x+dx-bend*.7,sign*(endY-.008),z-sag*.55),(x+dx-bend,sign*(endY-.004),z-sag)]
   else:
    path=[(x,sign*.434,z),(x+dx*.15,sign*.456,z+.004),(x+dx*.45+bend,sign*.478,z-sag*.18),(x+dx*.8,sign*(endY-.005),z-sag*.58),(x+dx,sign*endY,z-sag)]
   Tube(path,float(rng.uniform(.00055,.0010)),12,float(rng.uniform(.85,1.12)),sides=3)
 mesh=bpy.data.meshes.new('Mesh_BedCompressedReedLayers');mesh.from_pydata(vertices,[],faces);mesh.update();straw.data=mesh;straw.matrix_world=Matrix.Identity(4)
 for name,values in [('StrawSourceRole',roles),('StrawSourceObject',[0]*len(faces)),('StrawProtectedStructure',[int(i<coreFaceCount) for i in range(len(faces))])]:mesh.attributes.new(name=name,type='INT',domain='FACE').data.foreach_set('value',np.asarray(values,np.int32))
 uv=mesh.uv_layers.new(name='UVMap');uvValues=np.zeros((len(mesh.loops),2),np.float32);colors=np.ones((len(mesh.loops),4),np.float32)
 for poly in mesh.polygons:
  ids=list(poly.loop_indices);points=np.asarray([vertices[i] for i in poly.vertices]);n=np.asarray(poly.normal);r=roles[poly.index]
  if r in (0,1,2):
   axes=(0,1) if abs(n[2])>.65 else (0,2) if abs(n[1])>abs(n[0]) else (1,2);uvValues[ids]=points[:,axes]/.16
   age=.90+.065*np.sin(points[:,0]*8.1+points[:,1]*4.5)+.035*np.sin(points[:,0]*17.3-points[:,2]*7.1)
   edgeDust=.18*np.clip((.501-points[:,2])/.031,0,1);age*=1-edgeDust;colors[ids,:3]=age[:,None]*np.asarray([.96,.98,.91])
  else:
   uvValues[ids]=np.stack((.115+points[:,2]*.022,.205+points[:,0]*.06+points[:,1]*.035),axis=1);colors[ids,:3]=np.asarray([.98,.98,.87])*tones[poly.index]
  poly.use_smooth=r not in (0,1,2)
 uv.data.foreach_set('uv',uvValues.ravel());uv.active_render=True;layer=mesh.color_attributes.new(name='StrawAgedLowFrequencyColor',type='FLOAT_COLOR',domain='CORNER');layer.data.foreach_set('color',np.clip(colors,0,1).ravel());mesh.color_attributes.active_color=layer
 images,textures=WriteMaps(textureRoot,'Texture_BedCompressedReed',ReedMatMaps());mesh.materials.append(NativeMaterial('Material_BedCompressedReeds',images,uv.name,layer.name,.35));straw['GameExportColorLayer']=layer.name;straw['ReferenceFidelityVersion']=Version
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free();mesh.update()
 retained=np.asarray([straw.matrix_world@mesh.vertices[i].co for i in range(len(corePoints))]);error=float(np.max(np.abs(retained-corePoints)))
 if error>1e-7:raise ValueError('Reference mat moved the retained bearing core')
 return {'version':Version,'trianglesBefore':before,'trianglesAfter':Triangles(straw),'retainedBearingTriangles':coreTriangles,'maximumBearingVertexChangeM':error,'physicalWovenTileM':.16,'tubeCount':tubeCount,'roundReedCrossSectionSides':[3,4],'footTuftStalks':60,'primaryTuftSideBlender':'-Y, as seen in original M17 C','textures':textures,'representation':'M17 bound axial straw under close wraps, folded hem, compressed reeds and an open foot-side tuft','support':'visible lower skin follows actual Frame top ray intersections; original paired contact core unchanged'}


def CottonDisplacement(points):
 """Continuous gathers and short soft creases, shared by cloth and stitching."""
 x,y,z=np.asarray(points).T
 def Smooth(value):
  value=np.clip(value,0,1);return value*value*(3-2*value)
 side=np.exp(-((np.abs(y)-.385)/.100)**2)*Smooth((x+.93)/.15)*Smooth((.95-x)/.20)
 phase=x*(2*np.pi/.087)+1.1*np.sin(x*17)+.5*np.sin(x*31)+17*(np.abs(y)-.40)+.9*np.tanh(y/.12)
 height=.0116*np.sin(phase)*side*(.78+.22*np.sin(x*3.7+1.5+y*5))
 for cx,cy,sx,sy,amount in [(-.58,-.17,.28,.19,.004),(-.24,.15,.22,.17,.007),(.18,-.15,.26,.20,.005),(.55,.11,.24,.18,.006)]:
  height+=amount*.3*np.exp(-((x-cx)/sx)**2-((y-cy)/sy)**2)
 # Short pressure folds between repair seams; unequal widths, lengths and
 # orientations avoid a regular puff grid or high-frequency noise lumps.
 strokes=[(-.66,-.24,.7,.12,.018,.0045),(-.46,.22,-.5,.15,.020,.005),(-.28,-.08,1.1,.13,.016,.0055),(-.07,.17,.35,.17,.022,.0045),(.13,-.22,-.8,.14,.018,.0055),(.33,.17,.9,.13,.017,.005),(.52,-.08,-.35,.16,.021,.0045),(.70,.20,.8,.10,.017,.004)]
 for cx,cy,angle,length,width,amount in strokes:
  a=(x-cx)*math.cos(angle)+(y-cy)*math.sin(angle);b=-(x-cx)*math.sin(angle)+(y-cy)*math.cos(angle);q=b/width
  height+=amount*1.9*(1-q*q)*np.exp(-.5*q*q-(a/length)**4)
 foot=Smooth((x-.66)/.27);height+=.010*np.sin(y*(2*np.pi/.135)+.65*np.sin(y*12)+x*4)*foot*np.exp(-((x-1.02)/.30)**2)
 height=np.clip(height,-.019,.024)
 nx=Smooth((x-.90)/.23)*(1-Smooth((z-.57)/.095));ny=np.sign(y)*Smooth((np.abs(y)-.36)/.16)*(1-Smooth((z-.57)/.10))
 direction=np.stack((nx,ny,np.maximum(.28,1-.6*nx-.5*np.abs(ny))),axis=1);direction/=np.linalg.norm(direction,axis=1,keepdims=True)
 return direction*height[:,None]


def RefineCottonGathers(objects,straw,frame):
 role=straw.data.attributes['StrawSourceRole'];supportFaces=[tuple(p.vertices) for p in straw.data.polygons if role.data[p.index].value in (0,1)]
 support=BVHTree.FromPolygons([straw.matrix_world@v.co for v in straw.data.vertices],supportFaces)
 timber=BVHTree.FromPolygons([frame.matrix_world@v.co for v in frame.data.vertices],[tuple(p.vertices) for p in frame.data.polygons]);rows=[]
 for obj in objects:
  if obj.name not in ('Quilt','Sewing') and not obj.name.startswith('BS_FootCloth'):continue
  mesh=obj.data;count=Triangles(obj);stored=mesh.attributes.get('M17CottonRestPosition');base=np.empty((len(mesh.vertices),3),np.float32)
  if stored:stored.data.foreach_get('vector',base.ravel())
  else:
   mesh.vertices.foreach_get('co',base.ravel());stored=mesh.attributes.new(name='M17CottonRestPosition',type='FLOAT_VECTOR',domain='POINT');stored.data.foreach_set('vector',base.ravel())
  matrix=np.asarray(obj.matrix_world,dtype=np.float64);points=base.astype(np.float64)@matrix[:3,:3].T+matrix[:3,3]
  hits=[support.find_nearest(Vector(p)) for p in points];distances=np.asarray([hit[3] for hit in hits]);weight=np.clip((distances-.004)/.016,0,1);weight=weight*weight*(3-2*weight)
  move=CottonDisplacement(points)*weight[:,None]
  # Keep existing complete-bed XZ bounds and pivot without moving the Frame.
  move[:,0]*=np.clip((1.230543792-points[:,0])/.020,0,1)*np.clip((points[:,0]+1.230343878)/.020,0,1)
  move[:,1]*=np.clip((.5492-np.abs(points[:,1]))/.018,0,1)
  suppressed=0;supportLimited=0
  for i in np.where(np.linalg.norm(move,axis=1)>.0001)[0]:
   hit=hits[i]
   if hit[1].z>.25 and np.linalg.norm(points[i,:2]-np.asarray(hit[0])[:2])<.020:
    limit=min(points[i,2],hit[0].z+.0015)
    if points[i,2]+move[i,2]<limit:move[i,2]=limit-points[i,2];supportLimited+=1
   p=Vector(points[i]);q=Vector(points[i]+move[i]);oldHit=timber.find_nearest(p);newHit=timber.find_nearest(q)
   oldSigned=(p-oldHit[0]).dot(oldHit[1]);newSigned=(q-newHit[0]).dot(newHit[1])
   if oldSigned>=0 and newSigned<-.0005:move[i]*=0;suppressed+=1
  result=points+move;local=(result-matrix[:3,3])@np.linalg.inv(matrix[:3,:3]).T;mesh.vertices.foreach_set('co',local.astype(np.float32).ravel())
  if mesh.has_custom_normals:mesh.normals_split_custom_set(np.zeros((len(mesh.loops),3),np.float32))
  for poly in mesh.polygons:poly.use_smooth=True
  mesh.set_sharp_from_angle(angle=math.radians(75));mesh.update()
  lengths=np.linalg.norm(move,axis=1);locked=distances<.004
  if np.any(lengths[locked]>.0000001) or Triangles(obj)!=count:raise ValueError('Cotton gather changed bearing vertices or topology')
  obj['M17CottonFidelityVersion']=Version
  rows.append({'object':obj.name,'triangles':count,'movedVertices':int(np.count_nonzero(lengths>.00001)),'maximumDisplacementM':float(lengths.max(initial=0)),'lockedNearBearingVertices':int(locked.sum()),'maximumLockedDisplacementM':float(lengths[locked].max(initial=0)),'newTimberIntersectionsSuppressed':suppressed,'upperSurfaceSupportLimits':supportLimited,'restPositionSha256':hashlib.sha256(base.tobytes()).hexdigest()})
 quilt=next((o for o in objects if o.name=='Quilt'),None)
 if quilt:
  material=quilt.data.materials[0];nodes=material.node_tree.nodes;links=material.node_tree.links;uv=next(n for n in nodes if n.type=='UVMAP' and n.uv_map=='UVMap.001');mapping=nodes.get('M17CottonWeaveScale') or nodes.new('ShaderNodeMapping');mapping.name='M17CottonWeaveScale';mapping.vector_type='POINT';mapping.inputs['Scale'].default_value=(1.45,1.45,1);links.new(uv.outputs['UV'],mapping.inputs['Vector'])
  for node in nodes:
   if node.type=='TEX_IMAGE':links.new(mapping.outputs['Vector'],node.inputs['Vector'])
 return {'version':Version,'method':'shared continuous side gathers, unequal short pressure creases and foot drape; original rest positions retained for idempotent re-editing','objects':rows,'maximumAllowedDisplacementM':.024,'nearBearingLockDistanceM':.004,'textureUvAndColorChanged':False,'quiltTextureTransformScale':1.45,'effectiveCottonTileM':.35/1.45,'topologyChanged':False,'pillowUnchanged':True}
