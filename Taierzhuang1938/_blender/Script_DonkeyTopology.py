"""Repair inherited foreleg T-junctions and orient closed reference-fit skin."""
import bmesh,math

def FaceComponents(bm):
    bm.faces.index_update();remaining=set(bm.faces)
    while remaining:
        seed=min(remaining,key=lambda f:f.index);remaining.remove(seed);faces={seed};queue=[seed]
        while queue:
            for edge in queue.pop().edges:
                for face in edge.link_faces:
                    if face in remaining:remaining.remove(face);faces.add(face);queue.append(face)
        yield faces

def OrientComponents(bm):
    rows=[];flipped=0
    for component in FaceComponents(bm):
        seed=min(component,key=lambda f:f.index);states={seed:False};queue=[seed]
        while queue:
            face=queue.pop()
            for loop in face.loops:
                edge=loop.edge
                if len(edge.link_faces)!=2:raise RuntimeError('Reference skin contains an open or nonmanifold edge')
                other=next(f for f in edge.link_faces if f!=face)
                otherLoop=next(l for l in other.loops if l.edge==edge)
                expected=states[face] ^ (loop.vert==otherLoop.vert)
                if other in states:
                    if states[other]!=expected:raise RuntimeError('Reference skin has a twisted, non-orientable connection')
                else:states[other]=expected;queue.append(other)
        volume=0
        for face,flip in states.items():
            vertices=list(face.verts)
            volume+=(-1 if flip else 1)*sum(vertices[0].co.dot(vertices[i].co.cross(vertices[i+1].co))/6 for i in range(1,len(vertices)-1))
        invert=volume<0
        for face,flip in states.items():
            if flip ^ invert:face.normal_flip();flipped+=1
        rows.append({'faces':len(states),'volumeM3':abs(volume)})
    bm.normal_update()
    return {'flippedFaces':flipped,'components':sorted(rows,key=lambda r:r['faces'],reverse=True)}

def RemoveNasalShells(bm):
    # The old boolean left two closed nasal cutter shells inside the muzzle.
    # They are separate from the animal and from the newly connected apertures.
    removed=0
    for faces in list(FaceComponents(bm)):
        vertices={v for f in faces for v in f.verts}
        if 20<len(faces)<400 and all(v.co.y>1.20 and .88<v.co.z<1.03 and abs(v.co.x)<.11 for v in vertices):
            removed+=len(faces);bmesh.ops.delete(bm,geom=list(faces),context='FACES')
    return removed

def RemoveLegacyNasalShells(skin):
    bm=bmesh.new();bm.from_mesh(skin.data);removed=RemoveNasalShells(bm)
    bm.to_mesh(skin.data);bm.free();skin.data.update()
    skin['removedLegacyNasalFaces']=removed
    return removed

def RepairReferenceSkin(skin):
    bm=bmesh.new();bm.from_mesh(skin.data)
    removed=skin.get('removedLegacyNasalFaces',0)+RemoveNasalShells(bm)
    # Replace the narrow graft band instead of capping its overlapping seams.
    z0,z1=.425,.470
    for z in (z0,z1):
        faces=[f for f in bm.faces if f.calc_center_median().y>.50 and min(v.co.z for v in f.verts)<.52 and max(v.co.z for v in f.verts)>.38]
        geom=set(faces)|{e for f in faces for e in f.edges}|{v for f in faces for v in f.verts}
        bmesh.ops.bisect_plane(bm,geom=list(geom),dist=1e-7,plane_co=(0,0,z),plane_no=(0,0,1),clear_inner=False,clear_outer=False)
    remove=[f for f in bm.faces if z0+1e-7<f.calc_center_median().z<z1-1e-7 and all(v.co.y>.50 for v in f.verts)]
    bmesh.ops.delete(bm,geom=remove,context='FACES')
    material=next(i for i,m in enumerate(skin.data.materials) if m.name.startswith('DonkeyLowerLegShortFur'))
    bands=[]
    for sign in (-1,1):
        rows=[];angles=[]
        for z in (z0,z1):
            edges=[e for e in bm.edges if e.is_boundary and all(abs(v.co.z-z)<2e-6 and v.co.y>.50 and v.co.x*sign>0 for v in e.verts)]
            vertices={v for e in edges for v in e.verts}
            if len(vertices)<8 or any(sum(e in edges for e in v.link_edges)!=2 for v in vertices):
                raise RuntimeError('Foreleg graft must produce two complete simple boundary loops')
            cx=sum(v.co.x for v in vertices)/len(vertices);cy=sum(v.co.y for v in vertices)/len(vertices)
            ordered=sorted(vertices,key=lambda v:math.atan2(v.co.y-cy,v.co.x-cx))
            if any(bm.edges.get((v,ordered[(i+1)%len(ordered)])) not in edges for i,v in enumerate(ordered)):
                raise RuntimeError('Foreleg section is not a simple polar loop')
            rows.append(ordered);angles.append([math.atan2(v.co.y-cy,v.co.x-cx) for v in ordered])
        a,b=rows;aa,bb=angles;i=j=0;n,m=len(a),len(b)
        while i<n or j<m:
            ta=aa[(i+1)%n]+(2*math.pi if i+1>=n else 0) if i<n else 100
            tb=bb[(j+1)%m]+(2*math.pi if j+1>=m else 0) if j<m else 100
            if abs(ta-tb)<1e-6:
                indices=(a[i%n],a[(i+1)%n],b[(j+1)%m],b[j%m]);i+=1;j+=1
            elif ta<tb:indices=(a[i%n],a[(i+1)%n],b[j%m]);i+=1
            else:indices=(a[i%n],b[(j+1)%m],b[j%m]);j+=1
            face=bm.faces.new(indices);face.material_index=material;face.smooth=True
        bands.append({'side':'Left' if sign<0 else 'Right','boundaryVertices':[n,m],'zRangeM':[z0,z1]})
    orientation=OrientComponents(bm)
    report={'removedDetachedNasalFaces':removed,'forelegGrafts':bands,
        'boundaryEdges':sum(e.is_boundary for e in bm.edges),'nonmanifoldEdges':sum(not e.is_manifold for e in bm.edges),
        'windingConflicts':sum(e.is_manifold and not e.is_contiguous for e in bm.edges),
        'mainVolumeM3':orientation['components'][0]['volumeM3'],'flippedFaces':orientation['flippedFaces']}
    if report['boundaryEdges'] or report['nonmanifoldEdges'] or report['windingConflicts']:raise RuntimeError('Invalid reference skin topology: '+str(report))
    bm.to_mesh(skin.data);bm.free();skin.data.update()
    return report
