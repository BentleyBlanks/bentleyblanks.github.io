"""Fill subpixel cloth lightmap islands from the nearest resolved cloth surface.
Smart projection can isolate a single crease triangle into a chart smaller than
a texel. Keep geometry intact and borrow local irradiance instead of black padding.
"""
import bpy, math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
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
# A sharply folded seam can also create a long, thin chart with a black centre.
# Detect unresolved samples, rather than assuming that every large island is valid.
atlas=globals().get('atlas') or bpy.data.images['CommandRoomLighting']
pixels=np.empty(len(atlas.pixels),dtype=np.float32);atlas.pixels.foreach_get(pixels)
width,height=atlas.size;pixels=pixels.reshape((height,width,4))
def Resolved(uv):
    x=max(0,min(width-1,int(uv.x*width)));y=max(0,min(height-1,int(uv.y*height)))
    return float(pixels[y,x,:3].max())>.008
for p in mesh.polygons:
    center=sum((uvs[i].uv for i in p.loop_indices),Vector((0,0)))/len(p.loop_indices)
    if areas[p.index]<80 and not Resolved(center):bad.add(p.index)
mesh.calc_loop_triangles();verts=[];faces=[];uvTriangles=[];normals=[]
for tri in mesh.loop_triangles:
    if tri.polygon_index in bad:continue
    center=sum((uvs[i].uv for i in tri.loops),Vector((0,0)))/3
    if not Resolved(center):continue
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
    # Use the tested interior texel, not an edge that can land on black padding.
    center=sum(uvTriangles[ti],Vector())/3
    uv=Vector(((math.floor(center.x*width)+.5)/width,(math.floor(center.y*height)+.5)/height))
    for li in poly.loop_indices:uvs[li].uv=uv
    fixed+=1
print({'subpixelClothFaces':len(bad),'localIrradianceRepairs':fixed})
