"""Visible timber edge wear and continuous woven straw, on task-owned sources.

No process launch or file save at import. RefreshCraft in Bake orchestrates this
versioned source pass, final metric UVs, editable Game save and standard export.
The paired bearing core is retained exactly. The old decimated blade ribbons
are deliberately replaced by a continuous skin and round reed bundles.
"""
import bpy,bmesh,json,math
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from Script_PatchedTimberBedSurfaceRevision import Select,Triangles,WriteMaps,NativeMaterial,ResizePixels
from Script_PatchedTimberBedWoodDamage import MemberFrame,_Snapshot,_Integrity,_ApplyCutter,BuildCornerWedge,BuildEndCheck,_SectionBounds,_MaximumNewCutDepth

Version='20261022WovenMatWornEdgesV7'


def RoundTimberSources(objects):
 """Replace only visible wooden beam surfaces with sampled rounded sections.

 The source dimensions, taper, pose and material slots come from the immutable
 checkpoint. Hardware, pegs and bed slats keep their authored topology.
 """
 rows=[]
 for obj in objects:
  name=obj.name.lower()
  if any(s in name for s in ['load slat','mortise','dowel','hand-forged','grain checks']):continue
  original=_Snapshot(obj);center,axes,coords=MemberFrame(original['world']);low,high=coords.min(axis=0),coords.max(axis=0)
  radius=.0038 if 'post' in name else .0028 if 'rail' in name else .0022
  count=18 if 'post' in name or 'side rail' in name else 9
  vertices=[];faces=[];inv=obj.matrix_world.inverted()
  primary=any(s in name for s in ['post','rail','anti-rack','end stretcher'])
  tValues=np.linspace(low[0]+radius,high[0]-radius,count) if primary else np.linspace(low[0],high[0],count)
  if primary:tValues=np.concatenate(([low[0],low[0]+radius*.3],tValues,[high[0]-radius*.3,high[0]]))
  count=len(tValues)
  for i,t in enumerate(tValues):
   # Exact endpoint planes can hit only one noisy corner of the old cap.
   # Fit the neighbouring source ring instead of collapsing that end to a tip.
   band=coords[np.abs(coords[:,0]-t)<max(.012,float(high[0]-low[0])*.025)]
   if len(band)<8:band=coords[np.argsort(np.abs(coords[:,0]-t))[:min(36,len(coords))]]
   lo,hi=band[:,1:].min(axis=0),band[:,1:].max(axis=0)
   endDistance=min(t-low[0],high[0]-t)
   inset=radius*(1-math.sqrt(max(0,1-(1-min(endDistance/radius,1))**2))) if primary else 0
   lo=lo+inset;hi=hi-inset
   r=min(radius,float(min(hi-lo))*.18)*(1+.18*math.sin(i*.73+len(obj.name)))
   for a,b,angle in [(hi[0]-r,hi[1]-r,0),(lo[0]+r,hi[1]-r,90),(lo[0]+r,lo[1]+r,180),(hi[0]-r,lo[1]+r,270)]:
    for delta in [0,45,90]:
     theta=math.radians(angle+delta);local=np.asarray([t,a+r*math.cos(theta),b+r*math.sin(theta)])
     vertices.append(tuple(inv@Vector(center+axes@local)))
  sides=12
  for i in range(count-1):
   for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
  faces.extend([tuple(reversed(range(sides))),tuple((count-1)*sides+j for j in range(sides))])
  old=obj.data;new=bpy.data.meshes.new('Mesh_RoundedAgedTimber');new.from_pydata(vertices,[],faces)
  for material in old.materials:new.materials.append(material)
  bm=bmesh.new();bm.from_mesh(new);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(new);bm.free();new.update();obj.data=new
  obj['TimberRoundedSection']=True;obj['TimberRoundedRadiusM']=radius
  rows.append({'object':obj.name,'radiusM':radius,'longitudinalSections':count,'crossSectionVertices':12,'roundedTerminalRims':primary,'sourceTriangleCount':original['triangles'],'roundedTriangles':Triangles(obj)})
 return rows


def WearTimberSources(objects):
 rows=[]
 for obj in sorted(objects,key=lambda o:o.name):
  name=obj.name.lower()
  if obj.get('TimberCraftVersion')==Version:
   rows.append(json.loads(obj['TimberCraftReceipt']));continue
  if any(s in name for s in ['load slat','mortise','dowel','hand-forged','grain checks']):continue
  Select([obj]);bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
  original=_Snapshot(obj);integrity=_Integrity(obj.data)
  if integrity['boundaryEdges'] or integrity['nonManifoldEdges']:raise ValueError('Rounded craft source must already be closed: '+obj.name)
  center,axes,coords=MemberFrame(original['world']);low,high=coords.min(axis=0),coords.max(axis=0)
  width=float(obj.get('TimberRoundedRadiusM',.0022))
  group=obj.vertex_groups.get('TimberDamagePreserve') or obj.vertex_groups.new(name='TimberDamagePreserve')
  # Rounded silhouette rings survive the budget collapse. The fairly compact
  # section geometry no longer needs a bevel modifier on noisy triangles.
  group.add(list(range(len(obj.data.vertices))),1.,'REPLACE')
  # A sparse additional long-grain edge bite on exposed members; actual
  # subtraction, never dark decals laid across a flat cap.
  regions=[]
  if any(s in name for s in ['post','side rail','upper rail','anti-rack','end stretcher']):
   base=_Snapshot(obj);center,axes,coords=MemberFrame(base['world']);low,high=coords.min(axis=0),coords.max(axis=0)
   radial=center-np.asarray([.09,0,.45]);radial[2]=0
   signs=[1 if axes[:,i]@radial>=0 else -1 for i in [1,2]]
   along=float(high[0]-.09 if 'post' in name else low[0]+(high[0]-low[0])*.37)
   lo,hi,_=_SectionBounds(coords,base['faces'],along);corner=[float(hi[i] if signs[i]>0 else lo[i]) for i in range(2)]
   verts,faces,volume=BuildCornerWedge(center,axes,corner,signs,along,.085 if 'post' in name else .12,.0065,.38)
   region={'kind':'LongGrainEdgeLoss','cutterVerticesWorld':verts.tolist(),'cutterFaces':faces,'worldBoundsMin':verts.min(axis=0).tolist(),'worldBoundsMax':verts.max(axis=0).tolist(),'cutterVolumeM3':volume}
   backup=obj.data.copy();_ApplyCutter(obj,region)
   if len(obj.data.vertices)<4:obj.data=backup;raise ValueError('Craft cutter unexpectedly emptied '+obj.name)
   if backup.users==0:bpy.data.meshes.remove(backup)
   region['measuredMaximumNewCutFaceDepthM']=_MaximumNewCutDepth(base,_Snapshot(obj),region);regions.append(region)
   if 'post' in name or 'upper rail' in name:
    # An end-open V check continues 65mm down the grain and has real walls.
    lo,hi,_=_SectionBounds(coords,base['faces'],float(high[0]-.015));sign=signs[0]
    verts,faces,volume=BuildEndCheck(center,axes,float(high[0]),float(hi[0] if sign>0 else lo[0]),sign,float((lo[1]+hi[1])*.5),lengthM=.065,widthM=.0045,depthM=.006)
    region={'kind':'OpenDryCheck','cutterVerticesWorld':verts.tolist(),'cutterFaces':faces,'worldBoundsMin':verts.min(axis=0).tolist(),'worldBoundsMax':verts.max(axis=0).tolist(),'cutterVolumeM3':volume}
    _ApplyCutter(obj,region);region['measuredMaximumNewCutFaceDepthM']=_MaximumNewCutDepth(base,_Snapshot(obj),region);regions.append(region)
  # Preserve bevel and fracture vertices in the game reduction, and flatten
  # broad timber facets without averaging normals across a fracture mouth.
  bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free();obj.data.update()
  # Boolean intersection vertices at the crack mouth may lie exactly on the
  # old surface and inherit zero weight. They need the same protection as the
  # rounded ring vertices; a nearest-surface depth test alone misses them.
  group.add(list(range(len(obj.data.vertices))),1.,'REPLACE')
  if obj.data.has_custom_normals:obj.data.normals_split_custom_set(np.zeros((len(obj.data.loops),3),np.float32))
  for poly in obj.data.polygons:poly.use_smooth=False
  if regions:
   tree=BVHTree.FromPolygons(original['world'].tolist(),original['faces'],all_triangles=True)
   ids=[v.index for v in obj.data.vertices if tree.find_nearest(obj.matrix_world@v.co)[3]>.00020]
   if ids:group.add(ids,1.,'REPLACE')
  row={'object':obj.name,'trianglesBefore':original['triangles'],'trianglesAfter':Triangles(obj),'beveledOuterEdges':4,'nominalBevelWidthM':width,'bevelSegments':2,'newLosses':regions}
  obj['TimberCraftVersion']=Version;obj['TimberCraftReceipt']=json.dumps(row);rows.append(row)
 return {'version':Version,'members':rows,'newLosses':sum(len(r['newLosses']) for r in rows),'beveledOuterEdges':sum(r['beveledOuterEdges'] for r in rows)}


def StrawMaps():
 from Script_PatchedTimberBedCotton import ReadRgbPng,ToLinear
 from Script_PatchedTimberBedWood import _SurfaceSrgb
 source=Path(__file__).with_name('Texture_BedAgedStrawSource.png')
 linear=ToLinear(ReadRgbPng(source).astype(np.float64)/255)
 # Same periodic-plus-smooth boundary treatment as the timber, at equal scale.
 h,w=linear.shape[:2];boundary=np.zeros_like(linear);boundary[0]=linear[-1]-linear[0];boundary[-1]=-boundary[0];boundary[:,0]+=linear[:,-1]-linear[:,0];boundary[:,-1]+=linear[:,0]-linear[:,-1]
 ky=np.fft.fftfreq(h)[:,None];kx=np.fft.fftfreq(w)[None,:];den=2*np.cos(2*np.pi*kx)+2*np.cos(2*np.pi*ky)-4;den[0,0]=1
 correction=np.fft.fft2(boundary,axes=(0,1))/den[:,:,None];correction[0,0]=0
 linear=np.clip(linear-np.fft.ifft2(correction,axes=(0,1)).real,.004,.9)
 rgb=ResizePixels(linear,1024);lum=rgb@np.asarray([.2126,.7152,.0722]);height=(lum-lum.mean())/max(float(lum.std()),1e-9)*.00014
 # 24cm square gives the woven bundles their physical density.
 du=(np.roll(height,-1,1)-np.roll(height,1,1))/(.48/1024);dv=(np.roll(height,1,0)-np.roll(height,-1,0))/(.48/1024)
 n=np.stack((-du,-dv,np.ones_like(du)),axis=2);n/=np.linalg.norm(n,axis=2,keepdims=True)
 orm=np.zeros((512,512,3),np.uint8);orm[:,:,0]=255;orm[:,:,1]=np.round(np.clip(.92-.035*(lum-lum.mean())/lum.std(),.84,.98).reshape(512,2,512,2).mean(axis=(1,3))*255).astype(np.uint8)
 return {'Base':np.round(_SurfaceSrgb(rgb)*255).astype(np.uint8),'Normal':np.round((n*.5+.5)*255).astype(np.uint8),'Orm':orm}


def RebuildStraw(straw,textureRoot):
 before=Triangles(straw);mesh=straw.data;role=mesh.attributes['StrawSourceRole'];keep=[p for p in mesh.polygons if role.data[p.index].value in (0,1)]
 coreVertices=sorted({v for p in keep for v in p.vertices});remap={old:i for i,old in enumerate(coreVertices)}
 vertices=[tuple(straw.matrix_world@mesh.vertices[i].co) for i in coreVertices];faces=[tuple(remap[v] for v in p.vertices) for p in keep];roles=[role.data[p.index].value for p in keep]
 corePoints=list(vertices);coreFaces=list(faces);coreCount=len(faces);tree=BVHTree.FromPolygons(vertices,faces)
 rng=np.random.default_rng(220107)
 def Top(x,y):
  hit=tree.ray_cast(Vector((x,y,.78)),Vector((0,0,-1)),.4)[0]
  return float(hit.z) if hit is not None else .582+.0015*math.sin(8*x+3*y)
 def AddFace(ids,roleId=2):faces.append(tuple(ids));roles.append(roleId)
 def Tube(path,radius,roleId=6):
  path=np.asarray(path);start=len(vertices);sides=5
  for i,point in enumerate(path):
   tangent=path[min(i+1,len(path)-1)]-path[max(i-1,0)];tangent/=np.linalg.norm(tangent)
   reference=np.asarray([1.,0,0]) if abs(tangent[0])<.8 else np.asarray([0,1.,0]);a=np.cross(tangent,reference);a/=np.linalg.norm(a);b=np.cross(tangent,a)
   # Blunt fibres with a narrow dry end; never triangular blade silhouettes.
   factor=.7 if i in (0,len(path)-1) else 1.
   for j in range(sides):vertices.append(tuple(point+radius*factor*(a*math.cos(j*2*math.pi/sides)+b*math.sin(j*2*math.pi/sides))))
  for i in range(len(path)-1):
   for j in range(sides):AddFace([start+i*sides+j,start+i*sides+(j+1)%sides,start+(i+1)*sides+(j+1)%sides,start+(i+1)*sides+j],roleId)
  AddFace([start+j for j in reversed(range(sides))],roleId);AddFace([start+(len(path)-1)*sides+j for j in range(sides)],roleId)
 # A continuous woven side under every peripheral reed, matching the original
 # compacted core height rather than a flat board above the contact shell.
 xValues=np.linspace(-1.102,.945,70)
 for sign in (-1,1):
  start=len(vertices)
  for x in xValues:
   zTop=Top(float(x),sign*.421)
   for fraction in np.linspace(0,1,5):
    z=.474+fraction*(zTop-.474);y=sign*(.444+.004*math.sin(x*7+sign)+.002*math.sin(fraction*math.pi))
    vertices.append((float(x),y,z))
  for i in range(len(xValues)-1):
   for j in range(4):
    ids=[start+i*5+j,start+(i+1)*5+j,start+(i+1)*5+j+1,start+i*5+j+1];AddFace(ids if sign<0 else ids[::-1],2)
  for x in np.arange(-1.08,.93,.037):
   x+=float(rng.uniform(-.008,.008));zTop=Top(x,sign*.421);radius=float(rng.uniform(.00125,.00215));lean=float(rng.uniform(-.010,.010))
   Tube([(x,sign*.417,.479),(x+lean,sign*.454,.502),(x+lean*.6,sign*.456,zTop-.012),(x,sign*.422,zTop-.001)],radius)
  for z in [.499,.545]:
   Tube([(float(x),sign*(.455+.002*math.sin(x*7)),z+.002*math.sin(x*11)) for x in np.linspace(-1.095,.935,38)],.0017,3)
  # Sparse short broken fibres sit close to the hem, at varied angles.
  for i in range(16):
   x=float(rng.uniform(-1.07,.92));z=float(rng.uniform(.489,.57));Tube([(x,sign*.452,z),(x+.006,sign*.465,z+.006),(x+.015,sign*.469,z+.009)],.00085,12)
 for x,sign in [(-1.105,-1),(.946,1)]:
  start=len(vertices)
  for y in np.linspace(-.443,.443,31):
   zTop=Top(x-sign*.012,float(y))
   for fraction in [0,.33,.66,1]:vertices.append((x+sign*.002*math.sin(y*10),float(y),.474+fraction*(zTop-.474)))
  for i in range(30):
   for j in range(3):
    ids=[start+i*4+j,start+(i+1)*4+j,start+(i+1)*4+j+1,start+i*4+j+1];AddFace(ids if sign>0 else ids[::-1],2)
 new=bpy.data.meshes.new('Mesh_BedContinuousWovenStraw');new.from_pydata(vertices,[],faces);new.update();straw.data=new;straw.matrix_world=__import__('mathutils').Matrix.Identity(4)
 # Core corner positions are byte-equivalent float32; retain role tags for
 # bearing diagnostics. Visible representation has deliberately changed.
 for name,vals in [('StrawSourceRole',roles),('StrawSourceObject',[0]*len(faces)),('StrawProtectedStructure',[int(i<coreCount) for i in range(len(faces))])]:new.attributes.new(name=name,type='INT',domain='FACE').data.foreach_set('value',np.asarray(vals,np.int32))
 uv=new.uv_layers.new(name='UVMap');values=np.zeros((len(new.loops),2),np.float32);colors=np.ones((len(new.loops),4),np.float32)
 for poly in new.polygons:
  points=np.asarray([vertices[i] for i in poly.vertices]);normal=np.asarray(poly.normal);ids=list(poly.loop_indices)
  if roles[poly.index] in (0,1,2):
   axes=(0,1) if abs(normal[2])>.65 else (0,2) if abs(normal[1])>abs(normal[0]) else (1,2)
   values[ids]=points[:,axes]/.24;colors[ids,:3]=[.90,.90,.87]
  else:
   # Sample a single straw bundle patch; geometry supplies its round profile.
   values[ids]=np.stack((.115+points[:,2]*.027,.205+points[:,0]*.11+points[:,1]*.09),axis=1)
   tone=.80+.27*float(rng.random());colors[ids,:3]=np.asarray([1.,.98,.88])*tone
  poly.use_smooth=roles[poly.index] not in (0,1,2)
 uv.data.foreach_set('uv',values.ravel());uv.active_render=True
 layer=new.color_attributes.new(name='StrawAgedLowFrequencyColor',type='FLOAT_COLOR',domain='CORNER');layer.data.foreach_set('color',colors.ravel());new.color_attributes.active_color=layer
 images,textureRows=WriteMaps(textureRoot,'Texture_BedStrawWoven',StrawMaps());new.materials.append(NativeMaterial('Material_BedContinuousWovenStraw',images,uv.name,layer.name,.45));straw['GameExportColorLayer']=layer.name;straw['StrawCraftVersion']=Version
 bm=bmesh.new();bm.from_mesh(new);bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(new);bm.free();new.update()
 retained=np.asarray([straw.matrix_world@new.vertices[i].co for i in range(len(corePoints))]);error=float(np.max(np.abs(retained-np.asarray(corePoints))))
 if error>1e-7:raise ValueError('Woven straw rebuild moved the bearing core')
 return {'version':Version,'trianglesBefore':before,'trianglesAfter':Triangles(straw),'retainedBearingTriangles':sum(len(f)-2 for f in coreFaces),'maximumBearingVertexChangeM':error,'replacedRoles':'2..12 old blade and binding representation replaced, roles 0/1 core kept','roundReedCrossSectionSides':5,'physicalWovenTileM':.24,'textures':textureRows}
