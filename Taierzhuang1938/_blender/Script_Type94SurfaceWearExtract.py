"""Extract convex physical edges in the current surface source's UV atlas."""
import bpy,json,math,os
from pathlib import Path
from mathutils import Vector
root=Path(os.environ.get('TYPE94_SOURCE_ROOT',r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette'))
revision=os.environ.get('TYPE94_SURFACE_REVISION','SurfaceV36')
assert revision in ['SurfaceV34','SurfaceV36','SurfaceV39','SurfaceV44','SurfaceV46Replay','SurfaceV56Preview','SurfaceV66Preview']
assert Path(bpy.data.filepath)==root/('Scene_Type94TanketteHigh'+revision+'.blend')
scene=bpy.context.scene;assert scene.get('BlenderMcpTask')=='Type94Tankette'
material=bpy.data.materials['Material_Type94Paint'];edges=[];visited=set()
for obj in scene.objects:
 if obj.type!='MESH'or obj.data.as_pointer()in visited:continue
 mesh=obj.data;slots={i for i,m in enumerate(mesh.materials)if m==material}
 if not slots:continue
 visited.add(mesh.as_pointer());uv=mesh.uv_layers.active.data;byEdge=[[]for _ in mesh.edges]
 for face in mesh.polygons:
  if face.material_index not in slots:continue
  loops=list(face.loop_indices);points=[uv[i].uv.copy()for i in loops]
  uvArea=abs(sum(a.x*b.y-a.y*b.x for a,b in zip(points,points[1:]+points[:1])))/2
  density=4096*math.sqrt(uvArea/max(face.area,1e-18))
  for offset,index in enumerate(loops):
   loop=mesh.loops[index];nextLoop=mesh.loops[loops[(offset+1)%len(loops)]]
   byEdge[loop.edge_index].append((face,loop.vertex_index,nextLoop.vertex_index,points[offset],points[(offset+1)%len(points)],density))
 for edge,adjacent in zip(mesh.edges,byEdge):
  if len(adjacent)!=2:continue
  a,b=adjacent;n1,n2=a[0].normal,b[0].normal
  if n1.length_squared<.5 or n2.length_squared<.5:continue
  angle=n1.angle(n2)
  if not math.radians(20)<angle<math.radians(150):continue
  p,q=(mesh.vertices[i].co for i in edge.vertices);mid=(p+q)/2
  convex=-n1.dot(b[0].center-mid)-n2.dot(a[0].center-mid)
  if convex<1e-8:continue
  exposure=max(mesh.attributes['WearZone'].data[a[0].index].value,mesh.attributes['WearZone'].data[b[0].index].value)
  length=(q-p).length
  if length<.00015:continue
  segments=[]
  for face,start,end,uvA,uvB,density in adjacent:
   pa=mesh.vertices[start].co;pb=mesh.vertices[end].co
   segments.append({'uvA':list(uvA),'uvB':list(uvB),'localA':list(pa),'localB':list(pb),'pixelsPerMetre':density})
  edges.append({'owner':obj.name,'lengthM':length,'exposure':float(exposure),'segments':segments})
out={'schema':'Type94PhysicalEdgeWearV1','sourceBlend':bpy.data.filepath,'size':4096,'edges':edges,'scope':'True convex dihedral edges only; no triangle wireframe or inferred global camera. Wear placement and amount are artistic estimates.'}
(root/('Acceptance/Data_SurfaceWearEdges'+revision.removeprefix('Surface')+'.json')).write_text(json.dumps(out),encoding='utf-8');print(json.dumps({'convexEdges':len(edges),'meshes':len(visited)}))
