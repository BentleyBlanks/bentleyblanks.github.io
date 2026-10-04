"""Fill subpixel cloth lightmap islands from the nearest resolved cloth surface.
Smart projection can isolate a single crease triangle into a chart smaller than
a texel. Keep geometry intact and borrow local irradiance instead of black padding.
"""
import bpy, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
ob=bpy.data.objects['Room_CommandRoomCloth'];mesh=ob.data;uvs=mesh.uv_layers['LightmapUV'].data
parent=list(range(len(mesh.polygons)))
def Root(i):
    while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
    return i
edges={};areas=[]
for poly in mesh.polygons:
    loops=list(poly.loop_indices);area=0
    for j,li in enumerate(loops):
        lj=loops[(j+1)%len(loops)];a=uvs[li].uv;b=uvs[lj].uv
        area+=a.x*b.y-b.x*a.y
        pair=sorted([(mesh.loops[li].vertex_index,round(a.x,6),round(a.y,6)),(mesh.loops[lj].vertex_index,round(b.x,6),round(b.y,6))])
        key=tuple(pair)
        if key in edges:parent[Root(poly.index)]=Root(edges[key])
        else:edges[key]=poly.index
    areas.append(abs(area)*.5*2048**2)
groups={}
for poly in mesh.polygons:groups.setdefault(Root(poly.index),[]).append(poly.index)
bad={i for group in groups.values() if len(group)<=10 and sum(areas[i] for i in group)<2.5 for i in group}
mesh.calc_loop_triangles();verts=[];faces=[];uvTriangles=[];normals=[]
for tri in mesh.loop_triangles:
    if tri.polygon_index in bad:continue
    points=[ob.matrix_world@mesh.vertices[i].co for i in tri.vertices]
    cross=(points[1]-points[0]).cross(points[2]-points[0])
    if cross.length<.000008:continue
    first=len(verts);verts.extend(points);faces.append((first,first+1,first+2));normals.append(cross.normalized())
    uvTriangles.append([Vector((*uvs[i].uv,0)) for i in tri.loops])
tree=BVHTree.FromPolygons(verts,faces,all_triangles=True);fixed=0
for index in sorted(bad):
    poly=mesh.polygons[index];p=ob.matrix_world@poly.center;n=(ob.matrix_world.to_3x3()@poly.normal).normalized()
    candidates=[x for x in tree.find_nearest_range(p,.035) if normals[x[2]].dot(n)>.15]
    if not candidates:continue
    hit,normal,ti,distance=min(candidates,key=lambda x:x[3]+.003*(1-normals[x[2]].dot(n)))
    uv=barycentric_transform(hit,*[verts[i] for i in faces[ti]],*uvTriangles[ti]).xy
    # Move just inside the resolved face, away from atlas padding.
    center=sum(uvTriangles[ti],Vector())/3;uv=uv.lerp(center.xy,.05)
    for li in poly.loop_indices:uvs[li].uv=uv
    fixed+=1
print({'subpixelClothFaces':len(bad),'localIrradianceRepairs':fixed})
