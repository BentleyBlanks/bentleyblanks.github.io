"""Replace the distorted donor neck with a measured, closed elliptical loft."""
import bpy,bmesh,math,heapq
from mathutils import Vector

def Smooth(a,b,v):
    t=max(0,min(1,(v-a)/(b-a)));return t*t*(3-2*t)

def Value(rows,y,column=1):
    if y<=rows[0][0]:return rows[0][column]
    if y>=rows[-1][0]:return rows[-1][column]
    for a,b in zip(rows,rows[1:]):
        if a[0]<=y<=b[0]:
            t=(y-a[0])/(b[0]-a[0]);return a[column]+(b[column]-a[column])*t

def RebuildNeck(skin,rig,objects):
    y0,y1=.79,.985
    profile=[(.79,1.160,.750,.115),(.835,1.200,.800,.112),(.885,1.235,.860,.105),(.94,1.270,.910,.100),(.985,1.285,.950,.102)]
    oldEdges=[(skin.data.vertices[e.vertices[0]].co.copy(),skin.data.vertices[e.vertices[1]].co.copy()) for e in skin.data.edges]
    oldTops=[]
    for i in range(30):
        y=.70+i*.015;values=[]
        for a,b in oldEdges:
            if min(a.y,b.y)<=y<=max(a.y,b.y) and abs(a.y-b.y)>1e-7:
                z=a.z+(b.z-a.z)*(y-a.y)/(b.y-a.y)
                if z>.75:values.append(z)
        if values:oldTops.append((y,max(values)))
    bm=bmesh.new();bm.from_mesh(skin.data)
    before=sum(len(face.verts)-2 for face in bm.faces)
    for y in (y0,y1):
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-6,plane_co=(0,y,0),plane_no=(0,1,0),clear_inner=False,clear_outer=False)
    remove=[face for face in bm.faces if y0+1e-6<face.calc_center_median().y<y1-1e-6 and min(v.co.z for v in face.verts)>.54]
    bmesh.ops.delete(bm,geom=remove,context='FACES')
    rings=[];oldProfiles=[]
    for y in (y0,y1):
        edges=[e for e in bm.edges if e.is_boundary and all(abs(v.co.y-y)<2e-5 and v.co.z>.54 for v in e.verts)]
        vertices={v for edge in edges for v in edge.verts}
        if len(vertices)<8:raise RuntimeError('Neck cut did not produce a closed boundary: '+str(y))
        low=min(v.co.z for v in vertices);high=max(v.co.z for v in vertices);centre=(low+high)/2
        rx=max(abs(v.co.x) for v in vertices)
        ring=sorted(vertices,key=lambda v:math.atan2((v.co.z-centre)/max(.01,(high-low)/2),v.co.x/max(.01,rx)))
        rings.append(ring);oldProfiles.append((y,centre,(high-low)/2,rx))
    # A geodesic falloff carries each new boundary into the retained body/head.
    # Unlike spatial clipping, it cannot split a connected patch into flaps.
    old={v:v.co.copy() for v in bm.verts};constraints={}
    for ring,(y,oldCentre,oldRadius,oldRx) in zip(rings,oldProfiles):
        top,bottom,rx=Value(profile,y,1),Value(profile,y,2),Value(profile,y,3)
        for vertex in ring:
            p=old[vertex];angle=math.atan2((p.z-oldCentre)/oldRadius,p.x/oldRx)
            target=Vector((rx*math.cos(angle),y,(top+bottom)/2+(top-bottom)/2*math.sin(angle)))
            constraints[vertex]=target-p
    distances={};nearest={};queue=[];serial=0
    for vertex,delta in constraints.items():
        distances[vertex]=0;nearest[vertex]=delta;heapq.heappush(queue,(0,serial,vertex));serial+=1
    while queue:
        distance,_,vertex=heapq.heappop(queue)
        if distance!=distances[vertex] or distance>.28:continue
        for edge in vertex.link_edges:
            other=edge.other_vert(vertex);candidate=distance+(old[other]-old[vertex]).length
            if candidate<distances.get(other,1e9) and candidate<.28:
                distances[other]=candidate;nearest[other]=nearest[vertex]
                heapq.heappush(queue,(candidate,serial,other));serial+=1
    headRing=set(rings[1]);headSeeds={nearest[v].to_tuple() for v in headRing}
    for vertex,distance in distances.items():
        isHead=nearest[vertex].to_tuple() in headSeeds;radius=.17 if isHead else .28
        weight=(1-Smooth(0,radius,distance))*(1-Smooth(.995,1.070,old[vertex].y) if isHead else 1)
        vertex.co=old[vertex]+nearest[vertex]*weight
    deform=bm.verts.layers.deform.verify()
    color=bm.verts.layers.float_color.get('CoatColor') or bm.verts.layers.float_color.new('CoatColor')
    groups={g.name:g.index for g in skin.vertex_groups}
    rows=[rings[0]];count=64
    for k in range(1,13):
        y=y0+(y1-y0)*k/13;top,bottom,rx=Value(profile,y,1),Value(profile,y,2),Value(profile,y,3)
        ring=[];t=(y-y0)/(y1-y0)
        for j in range(count):
            angle=-math.pi+2*math.pi*j/count
            vertex=bm.verts.new((rx*math.cos(angle),y,(top+bottom)/2+(top-bottom)/2*math.sin(angle)))
            vertex[deform][groups['DonkeyNeckPivot']]=1-t*.85
            vertex[deform][groups['DonkeyHeadPivot']]=t*.85
            vertex[color]=(.027,.026,.023,1);ring.append(vertex)
        rows.append(ring)
    rows.append(rings[1])
    for a,b in zip(rows,rows[1:]):
        i=j=0;n,m=len(a),len(b)
        while i<n or j<m:
            ta=(i+1)/n if i<n else 2;tb=(j+1)/m if j<m else 2
            if abs(ta-tb)<1e-8:
                indices=(a[i%n],a[(i+1)%n],b[(j+1)%m],b[j%m]);i+=1;j+=1
            elif ta<tb:
                indices=(a[i%n],a[(i+1)%n],b[j%m]);i+=1
            else:
                indices=(a[i%n],b[(j+1)%m],b[j%m]);j+=1
            face=bm.faces.new(indices);face.material_index=0;face.smooth=True
    # Relax the two junctions into a continuous throat and shoulder contour.
    for iteration in range(24):
        points={v:v.co.copy() for v in bm.verts if .73<v.co.y<1.08 and v.co.z>.65}
        for vertex,p in points.items():
            weight=Smooth(.73,.78,p.y)*(1-Smooth(1.025,1.08,p.y))
            if weight<=0:continue
            neighbors=[e.other_vert(vertex) for e in vertex.link_edges]
            mean=sum((points.get(v,v.co) for v in neighbors),Vector())/len(neighbors)
            vertex.co=p.lerp(mean,.28*weight)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    after=sum(len(face.verts)-2 for face in bm.faces)
    bm.to_mesh(skin.data);bm.free();skin.data.update()
    inverse=rig.matrix_world.inverted()
    for obj in objects:
        if obj==skin or not obj.name.startswith(('DonkeyManeFine','DonkeyDenseMane','DonkeyForelock')):continue
        transform=inverse@obj.matrix_world;back=transform.inverted()
        for vertex in obj.data.vertices:
            p=transform@vertex.co
            if not .70<p.y<1.13:continue
            delta=Value(profile,p.y,1)-Value(oldTops,p.y)
            p.z+=delta*Smooth(.70,.79,p.y)*(1-Smooth(1.055,1.13,p.y));vertex.co=back@p
        obj.data.update()
    return {'version':'ReferenceNeckLoftV1','cutY':[y0,y1],'rings':14,'ringVertices':64,'boundaryVertices':[len(r) for r in rings],
            'triangleDelta':after-before,'profile':[{'y':r[0],'topZ':r[1],'bottomZ':r[2],'radiusX':r[3]} for r in profile]}
