"""Fair the inherited pectoral pocket into a continuous breast/axillary surface."""
import bpy,bmesh,math,json,heapq
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri,barycentric_transform

def Smooth(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def Curve(rows,value):
    if value<=rows[0][0]:return rows[0][1]
    if value>=rows[-1][0]:return rows[-1][1]
    for (a,x),(b,y) in zip(rows,rows[1:]):
        if a<=value<=b:
            t=(value-a)/(b-a);return x+(y-x)*t

def CacheLimbAppearance(skin):
    stems=['DonkeyFrontLeft','DonkeyFrontRight','DonkeyRearLeft','DonkeyRearRight']
    attribute=skin.data.attributes.get('LimbAppearanceMass') or skin.data.attributes.new('LimbAppearanceMass','FLOAT_COLOR','POINT')
    owners={g.index:next((i for i,stem in enumerate(stems) if g.name.startswith(stem)),None) for g in skin.vertex_groups}
    for vertex in skin.data.vertices:
        values=[0,0,0,0]
        for group in vertex.groups:
            owner=owners[group.group]
            if owner is not None:values[owner]+=group.weight
        attribute.data[vertex.index].color=values
    return {'attribute':'LimbAppearanceMass','method':'pre-binding anatomical ownership retained for pigment, fur flow and offline atlas partitioning; runtime vertex colours remain fully baked'}

def BindReferencePectorals(scene,skin,collar=.06):
    mesh=skin.data;tag=mesh.attributes['ChestRepairBlend'];seed={v.index for v in mesh.vertices if tag.data[v.index].value>.0001};cores={v.index for v in mesh.vertices if tag.data[v.index].value>.9999};groups=len(skin.vertex_groups)
    original={v.index:{g.group:g.weight for g in v.groups} for v in mesh.vertices};adjacency=[set() for v in mesh.vertices]
    bm=bmesh.new();bm.from_mesh(mesh);source=bm.verts.layers.int.new('PectoralSourceIndex')
    for i,v in enumerate(bm.verts):v[source]=i
    bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY')
    for edge in bm.edges:
        a,b=[v[source] for v in edge.verts];adjacency[a].add(b);adjacency[b].add(a)
    bm.free();head=skin.vertex_groups['DonkeyHeadPivot'].index;chest=skin.vertex_groups['DonkeyChestPivot'].index
    axial={skin.vertex_groups[name].index for name in ['DonkeyBodyPivot','DonkeyThoraxPivot','DonkeyPelvisPivot','DonkeyChestPivot']}
    selected=set(seed);distances={i:0 for i in seed};queue=[(0,i) for i in seed];heapq.heapify(queue)
    while queue:
        distance,i=heapq.heappop(queue)
        if distance>distances[i]+1e-10:continue
        for j in adjacency[i]:
            p=mesh.vertices[j].co;candidate=distance+(mesh.vertices[i].co-p).length
            if candidate<=collar and candidate<distances.get(j,1e6) and abs(p.x)<.21 and .50<p.y<1.04 and .58<p.z<1.0 and original[j].get(head,0)<.999:
                distances[j]=candidate;selected.add(j);heapq.heappush(queue,(candidate,j))
    anchors={i for i in selected if i not in seed and max(original[i].values(),default=0)>.98};unknown=sorted(selected-cores-anchors);lookup={p:i for i,p in enumerate(unknown)}
    matrix=np.zeros((len(unknown),len(unknown)));rhs=np.zeros((len(unknown),groups))
    for index in unknown:
        i=lookup[index];p=mesh.vertices[index].co
        for j in adjacency[index]:
            weight=1/max(.0001,(p-mesh.vertices[j].co).length);matrix[i,i]+=weight
            if j in lookup:matrix[i,lookup[j]]-=weight
            else:
                for group,value in original[j].items():rhs[i,chest if group in axial else group]+=weight*value
    solution=np.linalg.solve(matrix,rhs)
    if not np.isfinite(solution).all():raise RuntimeError('Non-finite pectoral harmonic solution')
    for index in unknown:
        row=dict(sorted(((g,max(0,float(w))) for g,w in enumerate(solution[lookup[index]]) if w>1e-8),key=lambda item:-item[1])[:4]);total=sum(row.values())
        if total<1e-8:raise RuntimeError('Empty pectoral skin binding')
        for group in list(mesh.vertices[index].groups):skin.vertex_groups[group.group].remove([index])
        for group,weight in row.items():skin.vertex_groups[group].add([index],weight/total,'REPLACE')
    return {'method':'positive inverse-edge-length harmonic skinning over the repaired breast and a bounded geodesic collar; original outer binding and rigid areas protected; equivalent axial influences consolidated; strongest four normalized weights','collarM':collar,'vertices':len(unknown),'coreVertices':len(cores),'protectedRigidVertices':len(anchors),'maxInfluences':max(len(v.groups) for v in mesh.vertices),'geometryDisplacementM':0}

def ApplyPectoralEdges(scene,skin):
    file=Path(scene['DonkeyCartProject'])/'_blender/Data_DonkeyPectoralEdges.json';record=json.loads(file.read_text(encoding='utf-8'));bm=bmesh.new();bm.from_mesh(skin.data);errors=[]
    for item in record['flips']:
        vertices=[]
        for point in item['oldEdge']+item['newEdge']:
            target=Vector(point);vertex=min(bm.verts,key=lambda v:(v.co-target).length_squared);error=(vertex.co-target).length
            if error>.00005:raise RuntimeError('Pectoral topology recipe no longer matches the source: '+str(error))
            vertices.append(vertex);errors.append(error)
        a,b,c,d=vertices;wanted=set(vertices);faces=[f for f in bm.faces if sum(v in wanted for v in f.verts)>=3]
        if faces:bmesh.ops.triangulate(bm,faces=faces,quad_method='BEAUTY',ngon_method='BEAUTY')
        edge=next((e for e in a.link_edges if e.other_vert(a)==b),None)
        if edge is None:
            if any(e.other_vert(c)==d for e in c.link_edges):continue
            raise RuntimeError('Pectoral edge recipe cannot locate its diagonal')
        if len(edge.link_faces)!=2 or any(len(f.verts)!=3 for f in edge.link_faces):raise RuntimeError('Pectoral edge is not a manifold triangle pair')
        bmesh.ops.rotate_edges(bm,edges=[edge],use_ccw=False)
        if not any(e.other_vert(c)==d for e in c.link_edges):raise RuntimeError('Pectoral diagonal rotation failed')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(skin.data);bm.free();skin.data.update();integrity=CheckChestIntegrity(skin)
    if integrity['boundaryEdges'] or integrity['nonmanifoldEdges'] or integrity['chestCrossings']:raise RuntimeError('Pectoral edge rotation damaged the rest surface')
    return {'method':record['method'],'rotatedEdges':len(record['flips']),'maximumCoordinateMatchErrorM':max(errors,default=0),'maximumRestSurfaceBoundM':max((r['restSurfaceBoundM'] for r in record['flips']),default=0),'geometryVertexDisplacementM':0,'integrity':integrity}

def CheckChestIntegrity(skin):
    mesh=skin.data;mesh.calc_loop_triangles();triangles=list(mesh.loop_triangles);points=[v.co.copy() for v in mesh.vertices]
    tree=BVHTree.FromPolygons(points,[tuple(t.vertices) for t in triangles],all_triangles=True);crossings=[];tested=0
    def Region(p):return abs(p.x)<.20 and .54<p.y<.99 and .59<p.z<.98
    def Cross(a,b):
        for p,q in zip(a,a[1:]+a[:1]):
            direction=q-p;hit=intersect_ray_tri(*b,direction,p,True)
            if hit is None:continue
            fraction=(hit-p).dot(direction)/max(1e-15,direction.length_squared)
            if not 1e-4<fraction<1-1e-4:continue
            bary=barycentric_transform(hit,*b,Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1)))
            if min(bary)>1e-4:return hit
        return None
    for i,j in tree.overlap(tree):
        if i>=j:continue
        a,b=triangles[i],triangles[j]
        if len(set(a.vertices)&set(b.vertices))>=2:continue
        pa=[points[v] for v in a.vertices];pb=[points[v] for v in b.vertices]
        if not any(Region(p) for p in pa+pb):continue
        tested+=1;hit=Cross(pa,pb) or Cross(pb,pa)
        if hit is not None and Region(hit):crossings.append([i,j,list(hit)])
    bm=bmesh.new();bm.from_mesh(mesh);report={'boundaryEdges':sum(e.is_boundary for e in bm.edges),'nonmanifoldEdges':sum(not e.is_manifold for e in bm.edges),'volumeM3':bm.calc_volume(signed=True),'testedPairs':tested,'chestCrossings':len(crossings),'examples':crossings[:12]};bm.free();return report

def FitReferenceChest(scene,skin,rig):
    skin.data.update();tree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[tuple(f.vertices) for f in skin.data.polygons])
    centre=Vector((0,.790,.760));radiusX,radiusZ=.166,.165
    namespace={};file=Path(scene['DonkeyCartProject'])/'_blender/Script_DonkeyNasalEnvelope.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace)
    bm=bmesh.new();bm.from_mesh(skin.data);before=sum(len(f.verts)-2 for f in bm.faces)
    deform=bm.verts.layers.deform.verify();color=bm.verts.layers.float_color.get('CoatColor');repair=bm.verts.layers.float.get('ChestRepairBlend') or bm.verts.layers.float.new('ChestRepairBlend')
    sourceFace=bm.faces.layers.int.get('ChestSourceFace') or bm.faces.layers.int.new('ChestSourceFace')
    for i,face in enumerate(bm.faces):face[sourceFace]=i+1
    originalEdges=set(bm.edges);originalVertices=set(bm.verts)
    selected={f for f in bm.faces if (lambda p:(p.x/radiusX)**2+((p.z-centre.z)/radiusZ)**2<2.25 and .50<p.y<1.0)(f.calc_center_median())}
    # An exact projected boundary removes the rolled-in pocket as a whole.
    # A displacement alone lets its opposing sheets pass through each other.
    planes=40
    for plane in range(planes):
        angle=2*math.pi*plane/planes;planePoint=centre+Vector((radiusX*math.cos(angle),0,radiusZ*math.sin(angle)));normal=Vector((math.cos(angle)/radiusX,0,math.sin(angle)/radiusZ)).normalized()
        oldFaces=set(bm.faces);geometry=set(selected)
        for face in selected:geometry.update(face.edges);geometry.update(face.verts)
        bmesh.ops.bisect_plane(bm,geom=list(geometry),dist=1e-7,plane_co=planePoint,plane_no=normal,clear_inner=False,clear_outer=False)
        touched={face for face in selected if face.is_valid}|(set(bm.faces)-oldFaces);selected={face for face in touched if (face.calc_center_median()-planePoint).dot(normal)<1e-7}
    remaining=set(selected);components=[]
    while remaining:
        first=next(iter(remaining));part={first};todo=[first];remaining.remove(first)
        while todo:
            face=todo.pop()
            for edge in face.edges:
                for neighbour in edge.link_faces:
                    if neighbour in remaining:remaining.remove(neighbour);part.add(neighbour);todo.append(neighbour)
        components.append(part)
    selected=max(components,key=len);componentSizes=sorted((len(c) for c in components),reverse=True)
    namespace['CloseBoundaryPinches'](bm,selected);removed=sum(len(f.verts)-2 for f in selected)
    bmesh.ops.delete(bm,geom=list(selected),context='FACES')
    # Cutting a rolled-in fold can strand a tiny retained skin island inside
    # the opening. It is not a limb cuff: only wholly enclosed, disconnected
    # remnants are removed, preserving the main skin and all outside parts.
    remaining=set(bm.faces);kept=[];removedIslands=[]
    while remaining:
        first=next(iter(remaining));part={first};todo=[first];remaining.remove(first)
        while todo:
            face=todo.pop()
            for edge in face.edges:
                for neighbour in edge.link_faces:
                    if neighbour in remaining:remaining.remove(neighbour);part.add(neighbour);todo.append(neighbour)
        kept.append(part)
    main=max(kept,key=len)
    for part in kept:
        if part is main or len(part)>64:continue
        points=[v.co for f in part for v in f.verts]
        localOpenRemnant=any(e.is_boundary for f in part for e in f.edges) and all(.45<p.y<1.01 and abs(p.x)<radiusX*1.2 and abs(p.z-centre.z)<radiusZ*1.2 for p in points)
        if localOpenRemnant:
            removedIslands.append({'faces':len(part),'triangles':sum(len(f.verts)-2 for f in part)});bmesh.ops.delete(bm,geom=list(part),context='FACES')
    # Bisect planes leave many redundant subdivisions in retained planar
    # faces. Dissolve only new coplanar edges and new collinear degree-two
    # vertices, preserving the original surface rather than decimating it.
    beforeCleanup=sum(len(f.verts)-2 for f in bm.faces)
    bm.normal_update();candidates=[e for e in bm.edges if e not in originalEdges and len(e.link_faces)==2 and e.link_faces[0][sourceFace]>0 and e.link_faces[0][sourceFace]==e.link_faces[1][sourceFace] and e.link_faces[0].normal.dot(e.link_faces[1].normal)>.999999999]
    if candidates:bmesh.ops.dissolve_edges(bm,edges=candidates,use_verts=False,use_face_split=False)
    collinear=[]
    for v in bm.verts:
        if v in originalVertices or len(v.link_edges)!=2 or any(e.is_boundary for e in v.link_edges):continue
        a,b=[e.other_vert(v).co-v.co for e in v.link_edges]
        if a.length>1e-9 and b.length>1e-9 and a.normalized().dot(b.normalized())<-.9999999:collinear.append(v)
    if collinear:bmesh.ops.dissolve_verts(bm,verts=collinear,use_face_split=False,use_boundary_tear=False)
    cleanupTriangles=beforeCleanup-sum(len(f.verts)-2 for f in bm.faces)
    edges={e for e in bm.edges if e.is_boundary};vertices={v for e in edges for v in e.verts}
    if len(vertices)<12 or any(sum(e in edges for e in v.link_edges)!=2 for v in vertices):raise RuntimeError('Pectoral cut is not a simple boundary')
    ordered=[];current=max(vertices,key=lambda v:v.co.x);previous=None
    while current not in ordered:
        ordered.append(current);following=[e.other_vert(current) for e in current.link_edges if e in edges and e.other_vert(current)!=previous];previous,current=current,following[0]
    if len(ordered)!=len(vertices):raise RuntimeError('Pectoral cut has multiple boundaries: '+str({'componentFaces':componentSizes,'keptComponents':sorted((len(p) for p in kept),reverse=True),'removedIslands':removedIslands,'ordered':len(ordered),'boundaryVertices':len(vertices),'otherPoints':[list(v.co) for v in vertices if v not in ordered]}))
    def Coordinates(p):return p.x/radiusX,(p.z-centre.z)/radiusZ
    angles,correction=namespace['FitBoundaryAngles'](ordered,Coordinates,0,1);fractions=[(a-angles[0])/(2*math.pi) for a in angles]+[1]
    material=next(i for i,m in enumerate(skin.data.materials) if m.name.startswith('DonkeyCartGreyCoat'));core=skin.vertex_groups.get('DonkeyChestPivot') or skin.vertex_groups['DonkeyThoraxPivot'];coreColor=Vector((.045,.040,.035,1))
    profileNamespace={};profileFile=Path(scene['DonkeyCartProject'])/'_blender/Script_DonkeyLegSections.py';exec(compile(profileFile.read_text(encoding='utf-8'),profileFile.name,'exec'),profileNamespace)
    profile=[(.60,.560),(.64,.670),(.68,.720),(.72,.751),(.76,.790),(.80,.828),(.84,.867),(.88,.910),(.94,.976)]
    def SurfaceY(x,z):return profileNamespace['Curve'](profile,z)-.060*(x/.17)**2
    def New(point,row,pigment,blend):
        vertex=bm.verts.new(point);row=dict(sorted(row.items(),key=lambda item:-item[1])[:4]);total=sum(row.values())
        for group,weight in row.items():vertex[deform][group]=weight/total
        if color:vertex[color]=pigment
        vertex[repair]=blend;return vertex
    rings=[];count=32
    for radial in [.90,.75,.60,.45,.30,.15]:
        t=1-radial;ring=[]
        for i in range(count):
            fraction=i/count;segment=next(j for j in range(len(ordered)) if fractions[j]<=fraction<=fractions[j+1]);blend=(fraction-fractions[segment])/max(1e-10,fractions[segment+1]-fractions[segment]);a,b=ordered[segment],ordered[(segment+1)%len(ordered)];outer=a.co.lerp(b.co,blend);_,normal,_,_=tree.find_nearest(outer)
            delta=centre-outer;denominator=max(.15,normal.y);d0=max(-.20,min(.20,-(normal.x*delta.x+normal.z*delta.z)/denominator));d1=.96*delta.z
            y=(2*t**3-3*t*t+1)*outer.y+(t**3-2*t*t+t)*d0+(-2*t**3+3*t*t)*centre.y+(t**3-t*t)*d1
            angle=angles[0]+2*math.pi*fraction;ideal=centre+Vector((radiusX*math.cos(angle)*radial*.60,0,radiusZ*math.sin(angle)*radial*.60));point=outer.lerp(centre,t)
            outerBlend=Smooth(.80,1.0,radial);point.x=ideal.x*(1-outerBlend)+point.x*outerBlend;point.z=ideal.z*(1-outerBlend)+point.z*outerBlend
            boundaryBlend=Smooth(.75,1.0,radial);point.y=SurfaceY(point.x,point.z)*(1-boundaryBlend)+y*boundaryBlend-.0015*math.exp(-(point.x/.022)**2)*math.sin(math.pi*t)
            outerWeights={group:a[deform].get(group,0)*(1-blend)+b[deform].get(group,0)*blend for group in set(a[deform].keys())|set(b[deform].keys())};weights={group:value*radial for group,value in outerWeights.items()};weights[core.index]=weights.get(core.index,0)+t
            pigment=a[color].lerp(b[color],blend).lerp(coreColor,t) if color else None;ring.append(New(point,weights,pigment,t))
        rings.append(ring)
    def Face(vertices):
        face=bm.faces.new(vertices);face.material_index=material;face.smooth=True;face[sourceFace]=0
        for edge in face.edges:edge.smooth=True
    a,b=ordered,rings[0];i=j=0;n=len(a)
    while i<n or j<count:
        ta=fractions[i+1] if i<n else 100;tb=(j+1)/count if j<count else 100
        if abs(ta-tb)<1e-7:Face((a[i%n],a[(i+1)%n],b[(j+1)%count],b[j%count]));i+=1;j+=1
        elif ta<tb:Face((a[i%n],a[(i+1)%n],b[j%count]));i+=1
        else:Face((a[i%n],b[(j+1)%count],b[j%count]));j+=1
    for a,b in zip(rings,rings[1:]):
        for i in range(count):j=(i+1)%count;Face((a[i],a[j],b[j],b[i]))
    point=New(centre,{core.index:1},coreColor,1)
    for i in range(count):Face((rings[-1][i],rings[-1][(i+1)%count],point))
    patch=[v for ring in rings for v in ring]
    for iteration in range(36):
        old={v:v.co.copy() for v in bm.verts}
        for vertex in patch:
            neighbours=[e.other_vert(vertex) for e in vertex.link_edges]
            mean=sum((old[v] for v in neighbours),Vector())/len(neighbours);blend=vertex[repair]
            target=old[vertex].lerp(mean,.35)
            fidelity=Smooth(.12,.30,blend)*.24;target.y=target.y*(1-fidelity)+SurfaceY(target.x,target.z)*fidelity
            delta=target-old[vertex]
            if delta.length>.002:delta*=.002/delta.length
            vertex.co=old[vertex]+delta
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));after=sum(len(f.verts)-2 for f in bm.faces);bm.to_mesh(skin.data);bm.free();skin.data.update()
    integrity=CheckChestIntegrity(skin)
    if integrity['boundaryEdges'] or integrity['nonmanifoldEdges'] or integrity['chestCrossings']:raise RuntimeError('Pectoral fairing introduced invalid surface: '+str(integrity))
    scene['DonkeyReferenceChestRevision']='20261025PectoralV1'
    return {'method':'rolled pectoral pocket removed by elliptical-prism cut; closed analytical breast surface, Hermite boundary transition, displacement fairing and four-bone binding',
        'centre':list(centre),'radiiM':[radiusX,radiusZ],'clipPlanes':planes,'boundaryVertices':len(ordered),'radialRows':len(rings),'ringVertices':count,'fairingPasses':36,'removedTriangles':removed,'removedEnclosedIslands':removedIslands,'redundantPlanarTrianglesRemoved':cleanupTriangles,'skinTriangleDelta':after-before,'boundaryAngleCorrectionRad':correction,'cutComponentFaces':componentSizes,'profileYByHeight':profile,'integrity':integrity}
