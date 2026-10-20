"""Isolate folded-cloth faces whose minimum-stretch UVs fold over themselves."""
import bpy,math


def SignedArea(points):
    return sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(points,points[1:]+points[:1]))*.5


def IntersectionArea(subject,clip):
    if SignedArea(clip)<0:clip=list(reversed(clip))
    points=subject
    for a,b in zip(clip,clip[1:]+clip[:1]):
        result=[]
        if not points:return 0
        def Side(p):return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
        for p,q in zip(points,points[1:]+points[:1]):
            sp,sq=Side(p),Side(q);pin=sp>=-1e-12;qin=sq>=-1e-12
            if pin:result.append(p)
            if pin!=qin and abs(sp-sq)>1e-18:
                t=sp/(sp-sq);result.append((p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t))
        points=result
    return abs(SignedArea(points)) if len(points)>=3 else 0


def FindOverlaps(meshes):
    triangles=[];buckets={};pairs=set();bad=set();grid=64
    for obj in meshes:
        obj.data.calc_loop_triangles();uv=obj.data.uv_layers['GameUV'].data
        for triangle in obj.data.loop_triangles:
            points=[tuple(uv[index].uv) for index in triangle.loops]
            low=[min(p[axis] for p in points) for axis in range(2)];high=[max(p[axis] for p in points) for axis in range(2)]
            index=len(triangles);triangles.append((obj.name,triangle.polygon_index,points,low,high))
            for x in range(max(0,int(low[0]*grid)),min(grid-1,int(high[0]*grid))+1):
                for y in range(max(0,int(low[1]*grid)),min(grid-1,int(high[1]*grid))+1):
                    bucket=buckets.setdefault((x,y),[])
                    for other in bucket:pairs.add((other,index))
                    bucket.append(index)
    for a,b in pairs:
        objA,faceA,pointsA,lowA,highA=triangles[a];objB,faceB,pointsB,lowB,highB=triangles[b]
        if objA==objB and faceA==faceB:continue
        if any(highA[axis]<=lowB[axis]+1e-10 or highB[axis]<=lowA[axis]+1e-10 for axis in range(2)):continue
        if IntersectionArea(pointsA,pointsB)>1e-10:
            bad.add((objA,faceA));bad.add((objB,faceB))
    return sorted(bad)


def RepairOverlaps(meshes):
    records=[];objects={obj.name:obj for obj in meshes}
    for iteration in range(3):
        bad=FindOverlaps(meshes)
        if not bad:return records
        records.append({'iteration':iteration,'isolatedFaces':bad})
        for name,index in bad:
            mesh=objects[name].data;polygon=mesh.polygons[index];uv=mesh.uv_layers['GameUV'].data
            before=[tuple(uv[index].uv) for index in polygon.loop_indices]
            density=math.sqrt(max(abs(SignedArea(before)),1e-12)/max(polygon.area,1e-12))
            vertices=[mesh.vertices[index].co for index in polygon.vertices];origin=vertices[0]
            axis=(vertices[1]-origin).normalized();vertical=polygon.normal.cross(axis).normalized()
            for loop in polygon.loop_indices:
                delta=mesh.vertices[mesh.loops[loop].vertex_index].co-origin
                uv[loop].uv=(delta.dot(axis)*density,delta.dot(vertical)*density)
                mesh.edges[mesh.loops[loop].edge_index].use_seam=True
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.pack_islands(rotate=True,margin=.0030,margin_method='FRACTION',shape_method='CONCAVE')
        bpy.ops.object.mode_set(mode='OBJECT')
    remaining=FindOverlaps(meshes)
    if remaining:raise RuntimeError('Unresolved folded-cloth UV intersections: '+str(remaining[:12]))
    return records
